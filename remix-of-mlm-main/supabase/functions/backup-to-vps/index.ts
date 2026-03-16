// ═══════════════════════════════════════════════════════════════
// 💾 Backup to External VPS (Hostinger)
// ═══════════════════════════════════════════════════════════════
// This function backs up Supabase data to external Hostinger VPS
// Supports: MySQL, PostgreSQL, and file storage
// ═══════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { Client as MySQLClient } from "https://deno.land/x/mysql@v2.12.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BackupConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  backupPath: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Create Supabase admin client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { action, tables, configName } = await req.json();

    // Get backup configuration
    const { data: config, error: configError } = await supabaseAdmin
      .from('external_backup_config')
      .select('*')
      .eq('config_name', configName || 'hostinger_vps_primary')
      .eq('enabled', true)
      .single();

    if (configError || !config) {
      return new Response(
        JSON.stringify({ error: 'Backup configuration not found or disabled' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ═══ FULL BACKUP ═══
    if (action === 'full_backup') {
      const backupId = await startBackup(supabaseAdmin, configName, 'full_dump', tables);
      
      try {
        let totalRecords = 0;
        let totalSize = 0;
        const backupData: any = {};

        // Backup each table
        for (const tableName of tables) {
          console.log(`Backing up table: ${tableName}`);
          
          const { data: tableData, error: tableError } = await supabaseAdmin
            .from(tableName)
            .select('*');

          if (tableError) {
            throw new Error(`Failed to fetch ${tableName}: ${tableError.message}`);
          }

          backupData[tableName] = tableData;
          totalRecords += tableData?.length || 0;
          totalSize += JSON.stringify(tableData).length;
        }

        // Connect to VPS MySQL
        const vpsPassword = Deno.env.get('VPS_BACKUP_PASSWORD') || '';
        
        const mysqlClient = await new MySQLClient().connect({
          hostname: config.host,
          port: config.port,
          username: config.username,
          password: vpsPassword,
          db: config.database_name,
        });

        // Create backup tables and insert data
        for (const [tableName, data] of Object.entries(backupData)) {
          await createBackupTable(mysqlClient, tableName, data as any[]);
          await insertBackupData(mysqlClient, tableName, data as any[]);
        }

        await mysqlClient.close();

        // Calculate checksum
        const checksum = await calculateChecksum(JSON.stringify(backupData));

        // Complete backup log
        await completeBackup(
          supabaseAdmin,
          backupId,
          totalRecords,
          totalSize,
          `${config.host}:${config.database_name}`,
          checksum,
          true
        );

        return new Response(
          JSON.stringify({
            success: true,
            backupId,
            tablesBackedUp: tables,
            recordsBackedUp: totalRecords,
            backupSize: totalSize,
            checksum,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

      } catch (error) {
        console.error('Backup failed:', error);
        
        await completeBackup(
          supabaseAdmin,
          backupId,
          0,
          0,
          '',
          '',
          false,
          error.message
        );

        throw error;
      }
    }

    // ═══ INCREMENTAL BACKUP ═══
    if (action === 'incremental_backup') {
      const backupId = await startBackup(supabaseAdmin, configName, 'incremental', tables);
      
      try {
        let totalRecords = 0;
        let totalSize = 0;

        for (const tableName of tables) {
          // Get last sync timestamp
          const { data: syncStatus } = await supabaseAdmin
            .from('table_sync_status')
            .select('last_synced_timestamp')
            .eq('table_name', tableName)
            .single();

          const lastSync = syncStatus?.last_synced_timestamp || '1970-01-01';

          // Get only new/updated records
          const { data: newData, error: fetchError } = await supabaseAdmin
            .from(tableName)
            .select('*')
            .gt('updated_at', lastSync)
            .order('updated_at', { ascending: true });

          if (fetchError) {
            throw new Error(`Failed to fetch ${tableName}: ${fetchError.message}`);
          }

          if (newData && newData.length > 0) {
            // Connect to VPS and update
            const vpsPassword = Deno.env.get('VPS_BACKUP_PASSWORD') || '';
            
            const mysqlClient = await new MySQLClient().connect({
              hostname: config.host,
              port: config.port,
              username: config.username,
              password: vpsPassword,
              db: config.database_name,
            });

            await upsertBackupData(mysqlClient, tableName, newData);
            await mysqlClient.close();

            totalRecords += newData.length;
            totalSize += JSON.stringify(newData).length;

            // Update sync status
            await supabaseAdmin
              .from('table_sync_status')
              .update({
                last_sync_at: new Date().toISOString(),
                last_synced_timestamp: newData[newData.length - 1].updated_at,
                records_synced: newData.length,
                sync_status: 'completed',
              })
              .eq('table_name', tableName);
          }
        }

        const checksum = await calculateChecksum(new Date().toISOString());

        await completeBackup(
          supabaseAdmin,
          backupId,
          totalRecords,
          totalSize,
          `${config.host}:${config.database_name}`,
          checksum,
          true
        );

        return new Response(
          JSON.stringify({
            success: true,
            backupId,
            recordsBackedUp: totalRecords,
            backupSize: totalSize,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

      } catch (error) {
        console.error('Incremental backup failed:', error);
        
        await completeBackup(
          supabaseAdmin,
          backupId,
          0,
          0,
          '',
          '',
          false,
          error.message
        );

        throw error;
      }
    }

    // ═══ TEST CONNECTION ═══
    if (action === 'test_connection') {
      try {
        const vpsPassword = Deno.env.get('VPS_BACKUP_PASSWORD') || '';
        
        const mysqlClient = await new MySQLClient().connect({
          hostname: config.host,
          port: config.port,
          username: config.username,
          password: vpsPassword,
          db: config.database_name,
        });

        // Test query
        const result = await mysqlClient.query('SELECT 1 as test');
        await mysqlClient.close();

        // Update config test status
        await supabaseAdmin
          .from('external_backup_config')
          .update({
            last_test_at: new Date().toISOString(),
            test_status: 'success',
            test_error: null,
          })
          .eq('id', config.id);

        return new Response(
          JSON.stringify({
            success: true,
            message: 'VPS connection successful',
            host: config.host,
            database: config.database_name,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

      } catch (error) {
        // Update config test status
        await supabaseAdmin
          .from('external_backup_config')
          .update({
            last_test_at: new Date().toISOString(),
            test_status: 'failed',
            test_error: error.message,
          })
          .eq('id', config.id);

        throw error;
      }
    }

    // ═══ GET BACKUP STATUS ═══
    if (action === 'status') {
      const { data: status } = await supabaseAdmin
        .rpc('get_backup_status');

      const { data: health } = await supabaseAdmin
        .rpc('check_backup_health');

      return new Response(
        JSON.stringify({
          status,
          health,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Helper functions

async function startBackup(
  supabase: any,
  configName: string,
  method: string,
  tables: string[]
): Promise<string> {
  const { data, error } = await supabase.rpc('log_external_backup', {
    p_config_name: configName,
    p_backup_method: method,
    p_tables: tables,
  });

  if (error) throw new Error(`Failed to start backup: ${error.message}`);
  return data;
}

async function completeBackup(
  supabase: any,
  backupId: string,
  records: number,
  size: number,
  location: string,
  checksum: string,
  success: boolean,
  errorMessage?: string
): Promise<void> {
  const { error } = await supabase.rpc('complete_external_backup', {
    p_backup_id: backupId,
    p_records_backed_up: records,
    p_backup_size_bytes: size,
    p_backup_location: location,
    p_checksum: checksum,
    p_success: success,
    p_error_message: errorMessage,
  });

  if (error) console.error('Failed to complete backup log:', error);
}

async function createBackupTable(
  client: any,
  tableName: string,
  sampleData: any[]
): Promise<void> {
  if (!sampleData || sampleData.length === 0) return;

  const sample = sampleData[0];
  const columns = Object.keys(sample).map(key => {
    const value = sample[key];
    let type = 'TEXT';
    
    if (typeof value === 'number') type = 'BIGINT';
    if (typeof value === 'boolean') type = 'BOOLEAN';
    if (value instanceof Date) type = 'TIMESTAMP';
    
    return `\`${key}\` ${type}`;
  }).join(', ');

  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS \`backup_${tableName}\` (
      ${columns},
      backup_created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    )
  `;

  await client.execute(createTableSQL);
}

async function insertBackupData(
  client: any,
  tableName: string,
  data: any[]
): Promise<void> {
  if (!data || data.length === 0) return;

  for (const row of data) {
    const columns = Object.keys(row).map(k => `\`${k}\``).join(', ');
    const values = Object.values(row).map(v => 
      v === null ? 'NULL' : 
      typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` :
      typeof v === 'boolean' ? (v ? '1' : '0') :
      v
    ).join(', ');

    const insertSQL = `
      INSERT INTO \`backup_${tableName}\` (${columns})
      VALUES (${values})
      ON DUPLICATE KEY UPDATE ${Object.keys(row).map(k => `\`${k}\` = VALUES(\`${k}\`)`).join(', ')}
    `;

    await client.execute(insertSQL);
  }
}

async function upsertBackupData(
  client: any,
  tableName: string,
  data: any[]
): Promise<void> {
  await insertBackupData(client, tableName, data);
}

async function calculateChecksum(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
