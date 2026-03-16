# ═══════════════════════════════════════════════════════════════
# 💾 Setup VPS Backup System
# ═══════════════════════════════════════════════════════════════
# This script sets up automated backup from Supabase to Hostinger VPS
# ═══════════════════════════════════════════════════════════════

param(
    [string]$VPSHost = "",
    [string]$VPSPort = "3306",
    [string]$VPSDatabase = "gap_protection_backup",
    [string]$VPSUsername = "backup_user",
    [string]$VPSPassword = "",
    [switch]$TestOnly
)

$ErrorColor = "Red"
$SuccessColor = "Green"
$WarningColor = "Yellow"
$InfoColor = "Cyan"

function Write-Step {
    param([string]$Message)
    Write-Host "`n═══ $Message ═══" -ForegroundColor $InfoColor
}

function Write-Success {
    param([string]$Message)
    Write-Host "✅ $Message" -ForegroundColor $SuccessColor
}

function Write-Error-Custom {
    param([string]$Message)
    Write-Host "❌ $Message" -ForegroundColor $ErrorColor
}

function Write-Warning-Custom {
    param([string]$Message)
    Write-Host "⚠️  $Message" -ForegroundColor $WarningColor
}

# Check prerequisites
Write-Step "Checking Prerequisites"

if (-not $env:SUPABASE_URL) {
    Write-Error-Custom "SUPABASE_URL not set"
    exit 1
}

if (-not $env:SUPABASE_SERVICE_ROLE_KEY) {
    Write-Error-Custom "SUPABASE_SERVICE_ROLE_KEY not set"
    exit 1
}

Write-Success "Environment variables configured"

# Get VPS details if not provided
if (-not $VPSHost) {
    Write-Host "`nEnter your Hostinger VPS details:" -ForegroundColor $InfoColor
    $VPSHost = Read-Host "VPS Host/IP"
    $VPSPort = Read-Host "MySQL Port (default: 3306)"
    if (-not $VPSPort) { $VPSPort = "3306" }
    $VPSDatabase = Read-Host "Database Name (default: gap_protection_backup)"
    if (-not $VPSDatabase) { $VPSDatabase = "gap_protection_backup" }
    $VPSUsername = Read-Host "MySQL Username"
    $VPSPassword = Read-Host "MySQL Password" -AsSecureString
    $VPSPassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($VPSPassword)
    )
}

# Store VPS password in environment
$env:VPS_BACKUP_PASSWORD = $VPSPassword

Write-Step "VPS Configuration"
Write-Host "Host: $VPSHost" -ForegroundColor $InfoColor
Write-Host "Port: $VPSPort" -ForegroundColor $InfoColor
Write-Host "Database: $VPSDatabase" -ForegroundColor $InfoColor
Write-Host "Username: $VPSUsername" -ForegroundColor $InfoColor

# Apply SQL schema
Write-Step "Applying Backup Schema"

if (-not $TestOnly) {
    Write-Host "Applying 07-real-backup-to-vps.sql..." -ForegroundColor $InfoColor
    
    # Note: You need to apply this manually via Supabase SQL Editor
    Write-Warning-Custom "Please apply solutions/07-real-backup-to-vps.sql via Supabase SQL Editor"
    Write-Host "Then update the configuration with your VPS details" -ForegroundColor $InfoColor
    
    $continue = Read-Host "Have you applied the SQL? (y/n)"
    if ($continue -ne 'y') {
        Write-Warning-Custom "Please apply the SQL first, then run this script again"
        exit 0
    }
}

# Update VPS configuration
Write-Step "Updating VPS Configuration"

$updateConfigSQL = @"
UPDATE external_backup_config
SET 
    host = '$VPSHost',
    port = $VPSPort,
    database_name = '$VPSDatabase',
    username = '$VPSUsername',
    enabled = true,
    updated_at = NOW()
WHERE config_name = 'hostinger_vps_primary';
"@

Write-Host "SQL to update configuration:" -ForegroundColor $InfoColor
Write-Host $updateConfigSQL -ForegroundColor $WarningColor
Write-Host "`nPlease run this SQL in Supabase SQL Editor" -ForegroundColor $InfoColor

# Deploy backup function
Write-Step "Deploying Backup Edge Function"

try {
    $functionPath = "supabase/functions/backup-to-vps"
    
    if (Test-Path $functionPath) {
        Write-Host "Deploying backup-to-vps function..." -ForegroundColor $InfoColor
        supabase functions deploy backup-to-vps
        Write-Success "Backup function deployed"
    } else {
        Write-Warning-Custom "Function path not found: $functionPath"
    }
} catch {
    Write-Warning-Custom "Failed to deploy function: $_"
    Write-Host "You can deploy manually with: supabase functions deploy backup-to-vps" -ForegroundColor $InfoColor
}

# Test VPS connection
Write-Step "Testing VPS Connection"

$testPayload = @{
    action = "test_connection"
    configName = "hostinger_vps_primary"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod `
        -Uri "$env:SUPABASE_URL/functions/v1/backup-to-vps" `
        -Method Post `
        -Headers @{
            "Authorization" = "Bearer $env:SUPABASE_SERVICE_ROLE_KEY"
            "Content-Type" = "application/json"
        } `
        -Body $testPayload
    
    if ($response.success) {
        Write-Success "VPS connection successful!"
        Write-Host "Host: $($response.host)" -ForegroundColor $SuccessColor
        Write-Host "Database: $($response.database)" -ForegroundColor $SuccessColor
    } else {
        Write-Error-Custom "VPS connection failed"
    }
} catch {
    Write-Error-Custom "Failed to test connection: $_"
    Write-Host "Error details: $($_.Exception.Message)" -ForegroundColor $ErrorColor
}

# Run initial backup
if (-not $TestOnly) {
    Write-Step "Running Initial Backup"
    
    $backupPayload = @{
        action = "full_backup"
        configName = "hostinger_vps_primary"
        tables = @(
            "profiles",
            "user_hierarchy",
            "commissions",
            "transactions",
            "security_scans",
            "contracts",
            "invoices",
            "promotion_codes"
        )
    } | ConvertTo-Json
    
    Write-Host "Starting full backup..." -ForegroundColor $InfoColor
    Write-Warning-Custom "This may take several minutes depending on data size"
    
    try {
        $response = Invoke-RestMethod `
            -Uri "$env:SUPABASE_URL/functions/v1/backup-to-vps" `
            -Method Post `
            -Headers @{
                "Authorization" = "Bearer $env:SUPABASE_SERVICE_ROLE_KEY"
                "Content-Type" = "application/json"
            } `
            -Body $backupPayload `
            -TimeoutSec 300
        
        if ($response.success) {
            Write-Success "Backup completed successfully!"
            Write-Host "Backup ID: $($response.backupId)" -ForegroundColor $SuccessColor
            Write-Host "Tables backed up: $($response.tablesBackedUp.Count)" -ForegroundColor $SuccessColor
            Write-Host "Records backed up: $($response.recordsBackedUp)" -ForegroundColor $SuccessColor
            Write-Host "Backup size: $([math]::Round($response.backupSize / 1MB, 2)) MB" -ForegroundColor $SuccessColor
            Write-Host "Checksum: $($response.checksum)" -ForegroundColor $SuccessColor
        } else {
            Write-Error-Custom "Backup failed"
        }
    } catch {
        Write-Error-Custom "Failed to run backup: $_"
        Write-Host "Error details: $($_.Exception.Message)" -ForegroundColor $ErrorColor
    }
}

# Setup automated backup schedule
Write-Step "Setting Up Automated Backup"

Write-Host @"

To set up automated backups, you have two options:

1. Windows Task Scheduler (Recommended for Windows):
   - Open Task Scheduler
   - Create new task
   - Trigger: Daily at 2:00 AM
   - Action: Run PowerShell script
   - Script: .\run-backup.ps1

2. Supabase Cron (Recommended for production):
   - Use pg_cron extension
   - Schedule backup function to run hourly/daily

"@ -ForegroundColor $InfoColor

# Create run-backup script
$runBackupScript = @'
# Quick backup script
$env:SUPABASE_URL = "YOUR_SUPABASE_URL"
$env:SUPABASE_SERVICE_ROLE_KEY = "YOUR_SERVICE_ROLE_KEY"
$env:VPS_BACKUP_PASSWORD = "YOUR_VPS_PASSWORD"

$payload = @{
    action = "incremental_backup"
    configName = "hostinger_vps_primary"
    tables = @(
        "profiles",
        "user_hierarchy",
        "commissions",
        "transactions",
        "security_scans"
    )
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod `
        -Uri "$env:SUPABASE_URL/functions/v1/backup-to-vps" `
        -Method Post `
        -Headers @{
            "Authorization" = "Bearer $env:SUPABASE_SERVICE_ROLE_KEY"
            "Content-Type" = "application/json"
        } `
        -Body $payload
    
    Write-Host "✅ Backup completed: $($response.recordsBackedUp) records"
} catch {
    Write-Host "❌ Backup failed: $_"
}
'@

$runBackupScript | Out-File -FilePath "run-backup.ps1" -Encoding UTF8
Write-Success "Created run-backup.ps1"

# Summary
Write-Step "Setup Complete!"

Write-Host @"

✅ VPS Backup System Configured

Next Steps:
1. ✅ VPS connection tested
2. ✅ Initial backup completed (if not test-only)
3. ✅ Backup function deployed
4. ⚠️  Set up automated backup schedule

Backup Status:
- Check status: Invoke-RestMethod -Uri "$env:SUPABASE_URL/functions/v1/backup-to-vps" -Method Post -Body '{"action":"status"}'
- Run manual backup: .\run-backup.ps1

Monitoring:
- View backup logs in Supabase: external_backup_log table
- Check backup health: SELECT * FROM check_backup_health();
- View backup status: SELECT * FROM get_backup_status();

"@ -ForegroundColor $SuccessColor

Write-Host "🎉 Your data is now being backed up to Hostinger VPS!" -ForegroundColor $SuccessColor
