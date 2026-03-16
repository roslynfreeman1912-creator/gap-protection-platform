export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      active_sessions: {
        Row: {
          created_at: string
          device_fingerprint: string | null
          expires_at: string
          geo_asn: number | null
          geo_city: string | null
          geo_country: string | null
          geo_org: string | null
          id: string
          ip_address: string
          is_active: boolean | null
          is_proxy: boolean | null
          is_tor: boolean | null
          is_vpn: boolean | null
          last_active_at: string
          mfa_verified: boolean | null
          profile_id: string
          revocation_reason: string | null
          revoked_at: string | null
          risk_score: number | null
          session_token_hash: string
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          device_fingerprint?: string | null
          expires_at?: string
          geo_asn?: number | null
          geo_city?: string | null
          geo_country?: string | null
          geo_org?: string | null
          id?: string
          ip_address: string
          is_active?: boolean | null
          is_proxy?: boolean | null
          is_tor?: boolean | null
          is_vpn?: boolean | null
          last_active_at?: string
          mfa_verified?: boolean | null
          profile_id: string
          revocation_reason?: string | null
          revoked_at?: string | null
          risk_score?: number | null
          session_token_hash: string
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          device_fingerprint?: string | null
          expires_at?: string
          geo_asn?: number | null
          geo_city?: string | null
          geo_country?: string | null
          geo_org?: string | null
          id?: string
          ip_address?: string
          is_active?: boolean | null
          is_proxy?: boolean | null
          is_tor?: boolean | null
          is_vpn?: boolean | null
          last_active_at?: string
          mfa_verified?: boolean | null
          profile_id?: string
          revocation_reason?: string | null
          revoked_at?: string | null
          risk_score?: number | null
          session_token_hash?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "active_sessions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      adversary_simulations: {
        Row: {
          completed_at: string | null
          created_at: string | null
          domain: string
          id: string
          overall_status: string | null
          profile_id: string | null
          results: Json | null
          simulation_type: string
          started_at: string | null
          status: string | null
          tests_passed: number | null
          tests_total: number | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          domain: string
          id?: string
          overall_status?: string | null
          profile_id?: string | null
          results?: Json | null
          simulation_type: string
          started_at?: string | null
          status?: string | null
          tests_passed?: number | null
          tests_total?: number | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          domain?: string
          id?: string
          overall_status?: string | null
          profile_id?: string | null
          results?: Json | null
          simulation_type?: string
          started_at?: string | null
          status?: string | null
          tests_passed?: number | null
          tests_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "adversary_simulations_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_threat_analyses: {
        Row: {
          analysis_result: Json
          analysis_type: string
          confidence_score: number | null
          created_at: string
          created_by: string | null
          id: string
          input_data: Json
          model_used: string | null
          processing_time_ms: number | null
          recommendations: string[] | null
          risk_score: number | null
          summary: string | null
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          analysis_result?: Json
          analysis_type: string
          confidence_score?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          input_data?: Json
          model_used?: string | null
          processing_time_ms?: number | null
          recommendations?: string[] | null
          risk_score?: number | null
          summary?: string | null
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          analysis_result?: Json
          analysis_type?: string
          confidence_score?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          input_data?: Json
          model_used?: string | null
          processing_time_ms?: number | null
          recommendations?: string[] | null
          risk_score?: number | null
          summary?: string | null
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_threat_analyses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      aml_watchlist: {
        Row: {
          added_at: string
          aliases: string[] | null
          country_codes: string[] | null
          entry_type: string
          expires_at: string | null
          id: string
          is_active: boolean | null
          name_pattern: string
          notes: string | null
          severity: string
          source: string
        }
        Insert: {
          added_at?: string
          aliases?: string[] | null
          country_codes?: string[] | null
          entry_type: string
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          name_pattern: string
          notes?: string | null
          severity?: string
          source: string
        }
        Update: {
          added_at?: string
          aliases?: string[] | null
          country_codes?: string[] | null
          entry_type?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          name_pattern?: string
          notes?: string | null
          severity?: string
          source?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          created_at: string | null
          id: string
          ip_address: string | null
          new_data: Json | null
          old_data: Json | null
          record_id: string
          table_name: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          ip_address?: string | null
          new_data?: Json | null
          old_data?: Json | null
          record_id: string
          table_name: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          ip_address?: string | null
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string
          table_name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      billing_config: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          payout_day: number | null
          period_end_day: number | null
          period_start_day: number | null
          settlement_day: number | null
          updated_at: string | null
          vat_rate: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          payout_day?: number | null
          period_end_day?: number | null
          period_start_day?: number | null
          settlement_day?: number | null
          updated_at?: string | null
          vat_rate?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          payout_day?: number | null
          period_end_day?: number | null
          period_start_day?: number | null
          settlement_day?: number | null
          updated_at?: string | null
          vat_rate?: number | null
        }
        Relationships: []
      }
      bonus_config: {
        Row: {
          bonus_type: string
          calculation_type: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          min_group_volume: number | null
          min_personal_volume: number | null
          min_rank_level: number | null
          name: string
          qualifying_days: number | null
          updated_at: string
          value: number
        }
        Insert: {
          bonus_type: string
          calculation_type?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          min_group_volume?: number | null
          min_personal_volume?: number | null
          min_rank_level?: number | null
          name: string
          qualifying_days?: number | null
          updated_at?: string
          value?: number
        }
        Update: {
          bonus_type?: string
          calculation_type?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          min_group_volume?: number | null
          min_personal_volume?: number | null
          min_rank_level?: number | null
          name?: string
          qualifying_days?: number | null
          updated_at?: string
          value?: number
        }
        Relationships: []
      }
      bonus_payouts: {
        Row: {
          amount: number
          bonus_config_id: string | null
          bonus_type: string
          created_at: string
          description: string | null
          id: string
          period_month: string | null
          profile_id: string
          status: string
          trigger_profile_id: string | null
          trigger_transaction_id: string | null
        }
        Insert: {
          amount: number
          bonus_config_id?: string | null
          bonus_type: string
          created_at?: string
          description?: string | null
          id?: string
          period_month?: string | null
          profile_id: string
          status?: string
          trigger_profile_id?: string | null
          trigger_transaction_id?: string | null
        }
        Update: {
          amount?: number
          bonus_config_id?: string | null
          bonus_type?: string
          created_at?: string
          description?: string | null
          id?: string
          period_month?: string | null
          profile_id?: string
          status?: string
          trigger_profile_id?: string | null
          trigger_transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bonus_payouts_bonus_config_id_fkey"
            columns: ["bonus_config_id"]
            isOneToOne: false
            referencedRelation: "bonus_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bonus_payouts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bonus_payouts_trigger_profile_id_fkey"
            columns: ["trigger_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bonus_payouts_trigger_transaction_id_fkey"
            columns: ["trigger_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_management_config: {
        Row: {
          ai_bots_action: string
          bot_fight_mode: boolean
          challenge_passage_ttl: number
          created_at: string
          custom_bot_rules: Json
          domain_id: string
          id: string
          javascript_detection: boolean
          known_good_bots: string[]
          static_resource_protection: boolean
          super_bot_fight_mode: boolean
          updated_at: string
          verified_bots_allowed: boolean
        }
        Insert: {
          ai_bots_action?: string
          bot_fight_mode?: boolean
          challenge_passage_ttl?: number
          created_at?: string
          custom_bot_rules?: Json
          domain_id: string
          id?: string
          javascript_detection?: boolean
          known_good_bots?: string[]
          static_resource_protection?: boolean
          super_bot_fight_mode?: boolean
          updated_at?: string
          verified_bots_allowed?: boolean
        }
        Update: {
          ai_bots_action?: string
          bot_fight_mode?: boolean
          challenge_passage_ttl?: number
          created_at?: string
          custom_bot_rules?: Json
          domain_id?: string
          id?: string
          javascript_detection?: boolean
          known_good_bots?: string[]
          static_resource_protection?: boolean
          super_bot_fight_mode?: boolean
          updated_at?: string
          verified_bots_allowed?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "bot_management_config_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: true
            referencedRelation: "protected_domains"
            referencedColumns: ["id"]
          },
        ]
      }
      cache_settings: {
        Row: {
          always_online: boolean
          brotli: boolean
          browser_ttl: number
          cache_level: string
          created_at: string
          development_mode: boolean
          development_mode_expires_at: string | null
          domain_id: string
          early_hints: boolean
          edge_ttl: number
          http2_push: boolean
          http3: boolean
          id: string
          minify_css: boolean
          minify_html: boolean
          minify_js: boolean
          mirage: boolean
          polish: string
          response_buffering: boolean
          rocket_loader: boolean
          updated_at: string
          webp: boolean
          websockets: boolean
          zero_rtt: boolean
        }
        Insert: {
          always_online?: boolean
          brotli?: boolean
          browser_ttl?: number
          cache_level?: string
          created_at?: string
          development_mode?: boolean
          development_mode_expires_at?: string | null
          domain_id: string
          early_hints?: boolean
          edge_ttl?: number
          http2_push?: boolean
          http3?: boolean
          id?: string
          minify_css?: boolean
          minify_html?: boolean
          minify_js?: boolean
          mirage?: boolean
          polish?: string
          response_buffering?: boolean
          rocket_loader?: boolean
          updated_at?: string
          webp?: boolean
          websockets?: boolean
          zero_rtt?: boolean
        }
        Update: {
          always_online?: boolean
          brotli?: boolean
          browser_ttl?: number
          cache_level?: string
          created_at?: string
          development_mode?: boolean
          development_mode_expires_at?: string | null
          domain_id?: string
          early_hints?: boolean
          edge_ttl?: number
          http2_push?: boolean
          http3?: boolean
          id?: string
          minify_css?: boolean
          minify_html?: boolean
          minify_js?: boolean
          mirage?: boolean
          polish?: string
          response_buffering?: boolean
          rocket_loader?: boolean
          updated_at?: string
          webp?: boolean
          websockets?: boolean
          zero_rtt?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "cache_settings_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: true
            referencedRelation: "protected_domains"
            referencedColumns: ["id"]
          },
        ]
      }
      call_center_employees: {
        Row: {
          call_center_id: string
          commission_rate: number | null
          created_at: string | null
          hired_at: string | null
          id: string
          is_active: boolean | null
          level: number | null
          override_rate: number | null
          parent_employee_id: string | null
          profile_id: string
          role: string | null
          updated_at: string | null
        }
        Insert: {
          call_center_id: string
          commission_rate?: number | null
          created_at?: string | null
          hired_at?: string | null
          id?: string
          is_active?: boolean | null
          level?: number | null
          override_rate?: number | null
          parent_employee_id?: string | null
          profile_id: string
          role?: string | null
          updated_at?: string | null
        }
        Update: {
          call_center_id?: string
          commission_rate?: number | null
          created_at?: string | null
          hired_at?: string | null
          id?: string
          is_active?: boolean | null
          level?: number | null
          override_rate?: number | null
          parent_employee_id?: string | null
          profile_id?: string
          role?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "call_center_employees_call_center_id_fkey"
            columns: ["call_center_id"]
            isOneToOne: false
            referencedRelation: "call_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_center_employees_parent_employee_id_fkey"
            columns: ["parent_employee_id"]
            isOneToOne: false
            referencedRelation: "call_center_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_center_employees_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      call_centers: {
        Row: {
          address: string | null
          created_at: string | null
          description: string | null
          email: string | null
          id: string
          is_active: boolean | null
          name: string
          owner_id: string | null
          phone: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string | null
          description?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          owner_id?: string | null
          phone?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string | null
          description?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          owner_id?: string | null
          phone?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "call_centers_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cc_commissions: {
        Row: {
          base_amount: number
          call_center_id: string
          commission_amount: number
          commission_rate: number
          commission_type: string
          created_at: string
          credit_note_id: string | null
          employee_id: string
          id: string
          override_from_employee_id: string | null
          override_level: number | null
          paid_at: string | null
          status: string
          transaction_id: string | null
          updated_at: string
        }
        Insert: {
          base_amount?: number
          call_center_id: string
          commission_amount?: number
          commission_rate?: number
          commission_type?: string
          created_at?: string
          credit_note_id?: string | null
          employee_id: string
          id?: string
          override_from_employee_id?: string | null
          override_level?: number | null
          paid_at?: string | null
          status?: string
          transaction_id?: string | null
          updated_at?: string
        }
        Update: {
          base_amount?: number
          call_center_id?: string
          commission_amount?: number
          commission_rate?: number
          commission_type?: string
          created_at?: string
          credit_note_id?: string | null
          employee_id?: string
          id?: string
          override_from_employee_id?: string | null
          override_level?: number | null
          paid_at?: string | null
          status?: string
          transaction_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cc_commissions_call_center_id_fkey"
            columns: ["call_center_id"]
            isOneToOne: false
            referencedRelation: "call_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cc_commissions_credit_note_id_fkey"
            columns: ["credit_note_id"]
            isOneToOne: false
            referencedRelation: "credit_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cc_commissions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "call_center_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cc_commissions_override_from_employee_id_fkey"
            columns: ["override_from_employee_id"]
            isOneToOne: false
            referencedRelation: "call_center_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cc_commissions_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          content: string
          created_at: string | null
          id: string
          profile_id: string | null
          role: string
          ticket_id: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          profile_id?: string | null
          role: string
          ticket_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          profile_id?: string | null
          role?: string
          ticket_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_matrix: {
        Row: {
          created_at: string | null
          id: string
          model_id: string
          partner_depth: number
          payout_level: number
          value: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          model_id: string
          partner_depth: number
          payout_level: number
          value: number
        }
        Update: {
          created_at?: string | null
          id?: string
          model_id?: string
          partner_depth?: number
          payout_level?: number
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "commission_matrix_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "commission_models"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_models: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          max_levels: number | null
          name: string
          updated_at: string | null
          uses_dynamic_shift: boolean | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          max_levels?: number | null
          name: string
          updated_at?: string | null
          uses_dynamic_shift?: boolean | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          max_levels?: number | null
          name?: string
          updated_at?: string | null
          uses_dynamic_shift?: boolean | null
        }
        Relationships: []
      }
      commission_rules: {
        Row: {
          commission_type: Database["public"]["Enums"]["commission_type"]
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          level_number: number
          model_id: string
          value: number
        }
        Insert: {
          commission_type: Database["public"]["Enums"]["commission_type"]
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          level_number: number
          model_id: string
          value: number
        }
        Update: {
          commission_type?: Database["public"]["Enums"]["commission_type"]
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          level_number?: number
          model_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "commission_rules_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "commission_models"
            referencedColumns: ["id"]
          },
        ]
      }
      commissions: {
        Row: {
          base_amount: number
          commission_amount: number
          commission_type: Database["public"]["Enums"]["commission_type"]
          created_at: string | null
          id: string
          level_number: number
          model_id: string | null
          paid_at: string | null
          partner_id: string
          status: Database["public"]["Enums"]["commission_status"] | null
          transaction_id: string
          updated_at: string | null
        }
        Insert: {
          base_amount: number
          commission_amount: number
          commission_type: Database["public"]["Enums"]["commission_type"]
          created_at?: string | null
          id?: string
          level_number: number
          model_id?: string | null
          paid_at?: string | null
          partner_id: string
          status?: Database["public"]["Enums"]["commission_status"] | null
          transaction_id: string
          updated_at?: string | null
        }
        Update: {
          base_amount?: number
          commission_amount?: number
          commission_type?: Database["public"]["Enums"]["commission_type"]
          created_at?: string | null
          id?: string
          level_number?: number
          model_id?: string | null
          paid_at?: string | null
          partner_id?: string
          status?: Database["public"]["Enums"]["commission_status"] | null
          transaction_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commissions_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "commission_models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_reports: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          executive_summary: string | null
          external_submission_ref: string | null
          findings: Json | null
          generated_by: string | null
          id: string
          metrics: Json | null
          period_end: string
          period_start: string
          recommendations: Json | null
          report_file_url: string | null
          report_type: string
          reviewed_by: string | null
          risk_rating: string | null
          status: string
          supporting_documents: Json | null
          title: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          executive_summary?: string | null
          external_submission_ref?: string | null
          findings?: Json | null
          generated_by?: string | null
          id?: string
          metrics?: Json | null
          period_end: string
          period_start: string
          recommendations?: Json | null
          report_file_url?: string | null
          report_type: string
          reviewed_by?: string | null
          risk_rating?: string | null
          status?: string
          supporting_documents?: Json | null
          title: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          executive_summary?: string | null
          external_submission_ref?: string | null
          findings?: Json | null
          generated_by?: string | null
          id?: string
          metrics?: Json | null
          period_end?: string
          period_start?: string
          recommendations?: Json | null
          report_file_url?: string | null
          report_type?: string
          reviewed_by?: string | null
          risk_rating?: string | null
          status?: string
          supporting_documents?: Json | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "compliance_reports_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_reports_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_reports_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      compensation_plans: {
        Row: {
          config: Json
          created_at: string
          id: string
          is_active: boolean
          is_default: boolean
          matrix_depth: number | null
          matrix_width: number | null
          max_levels: number
          name: string
          plan_type: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          matrix_depth?: number | null
          matrix_width?: number | null
          max_levels?: number
          name: string
          plan_type: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          matrix_depth?: number | null
          matrix_width?: number | null
          max_levels?: number
          name?: string
          plan_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      compliance_checks: {
        Row: {
          automated: boolean | null
          category: string | null
          control_id: string
          control_name: string
          created_at: string
          description: string | null
          domain_id: string | null
          evidence: string | null
          evidence_url: string | null
          framework: string
          id: string
          last_assessed_at: string | null
          next_review_at: string | null
          notes: string | null
          responsible: string | null
          risk_level: string | null
          status: string
          updated_at: string
        }
        Insert: {
          automated?: boolean | null
          category?: string | null
          control_id: string
          control_name: string
          created_at?: string
          description?: string | null
          domain_id?: string | null
          evidence?: string | null
          evidence_url?: string | null
          framework?: string
          id?: string
          last_assessed_at?: string | null
          next_review_at?: string | null
          notes?: string | null
          responsible?: string | null
          risk_level?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          automated?: boolean | null
          category?: string | null
          control_id?: string
          control_name?: string
          created_at?: string
          description?: string | null
          domain_id?: string | null
          evidence?: string | null
          evidence_url?: string | null
          framework?: string
          id?: string
          last_assessed_at?: string | null
          next_review_at?: string | null
          notes?: string | null
          responsible?: string | null
          risk_level?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "compliance_checks_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "protected_domains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_checks_responsible_fkey"
            columns: ["responsible"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_notes: {
        Row: {
          account_holder: string | null
          bic: string | null
          commission_ids: string[]
          created_at: string
          credit_note_number: string
          currency: string
          easybill_document_id: string | null
          easybill_pdf_url: string | null
          gross_amount: number
          iban: string | null
          id: string
          net_amount: number
          notes: string | null
          paid_at: string | null
          partner_id: string
          payment_method: string | null
          period_end: string | null
          period_start: string | null
          status: string
          updated_at: string
          vat_amount: number
          vat_rate: number
        }
        Insert: {
          account_holder?: string | null
          bic?: string | null
          commission_ids?: string[]
          created_at?: string
          credit_note_number: string
          currency?: string
          easybill_document_id?: string | null
          easybill_pdf_url?: string | null
          gross_amount?: number
          iban?: string | null
          id?: string
          net_amount?: number
          notes?: string | null
          paid_at?: string | null
          partner_id: string
          payment_method?: string | null
          period_end?: string | null
          period_start?: string | null
          status?: string
          updated_at?: string
          vat_amount?: number
          vat_rate?: number
        }
        Update: {
          account_holder?: string | null
          bic?: string | null
          commission_ids?: string[]
          created_at?: string
          credit_note_number?: string
          currency?: string
          easybill_document_id?: string | null
          easybill_pdf_url?: string | null
          gross_amount?: number
          iban?: string | null
          id?: string
          net_amount?: number
          notes?: string | null
          paid_at?: string | null
          partner_id?: string
          payment_method?: string | null
          period_end?: string | null
          period_start?: string | null
          status?: string
          updated_at?: string
          vat_amount?: number
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "credit_notes_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_monthly_reports: {
        Row: {
          generated_at: string
          green_count: number
          id: string
          red_count: number
          report_month: string
          report_path: string | null
          status: string
          top_findings: Json | null
          total_scans: number
          user_id: string
        }
        Insert: {
          generated_at?: string
          green_count?: number
          id?: string
          red_count?: number
          report_month: string
          report_path?: string | null
          status?: string
          top_findings?: Json | null
          total_scans?: number
          user_id: string
        }
        Update: {
          generated_at?: string
          green_count?: number
          id?: string
          red_count?: number
          report_month?: string
          report_path?: string | null
          status?: string
          top_findings?: Json | null
          total_scans?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_monthly_reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_scans: {
        Row: {
          completed_at: string | null
          created_at: string
          critical_count: number | null
          findings: Json | null
          high_count: number | null
          id: string
          rating: string | null
          report_pdf_path: string | null
          requested_at: string
          score: number | null
          status: string
          summary: Json | null
          target_url: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          critical_count?: number | null
          findings?: Json | null
          high_count?: number | null
          id?: string
          rating?: string | null
          report_pdf_path?: string | null
          requested_at?: string
          score?: number | null
          status?: string
          summary?: Json | null
          target_url: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          critical_count?: number | null
          findings?: Json | null
          high_count?: number | null
          id?: string
          rating?: string | null
          report_pdf_path?: string | null
          requested_at?: string
          score?: number | null
          status?: string
          summary?: Json | null
          target_url?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_scans_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_revenue: {
        Row: {
          call_center_id: string | null
          commission_amount: number | null
          created_at: string | null
          date: string
          employee_id: string | null
          gross_amount: number | null
          id: string
          net_amount: number | null
          profile_id: string | null
          transaction_count: number | null
          vat_amount: number | null
        }
        Insert: {
          call_center_id?: string | null
          commission_amount?: number | null
          created_at?: string | null
          date?: string
          employee_id?: string | null
          gross_amount?: number | null
          id?: string
          net_amount?: number | null
          profile_id?: string | null
          transaction_count?: number | null
          vat_amount?: number | null
        }
        Update: {
          call_center_id?: string | null
          commission_amount?: number | null
          created_at?: string | null
          date?: string
          employee_id?: string | null
          gross_amount?: number | null
          id?: string
          net_amount?: number | null
          profile_id?: string | null
          transaction_count?: number | null
          vat_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_revenue_call_center_id_fkey"
            columns: ["call_center_id"]
            isOneToOne: false
            referencedRelation: "call_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_revenue_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "call_center_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_revenue_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      data_classification_policies: {
        Row: {
          classification: string
          column_name: string
          created_at: string
          gdpr_article: string | null
          id: string
          legal_basis: string | null
          masking_pattern: string | null
          notes: string | null
          requires_encryption: boolean | null
          requires_masking: boolean | null
          retention_days: number | null
          table_name: string
        }
        Insert: {
          classification: string
          column_name: string
          created_at?: string
          gdpr_article?: string | null
          id?: string
          legal_basis?: string | null
          masking_pattern?: string | null
          notes?: string | null
          requires_encryption?: boolean | null
          requires_masking?: boolean | null
          retention_days?: number | null
          table_name: string
        }
        Update: {
          classification?: string
          column_name?: string
          created_at?: string
          gdpr_article?: string | null
          id?: string
          legal_basis?: string | null
          masking_pattern?: string | null
          notes?: string | null
          requires_encryption?: boolean | null
          requires_masking?: boolean | null
          retention_days?: number | null
          table_name?: string
        }
        Relationships: []
      }
      ddos_protection_config: {
        Row: {
          alert_on_attack: boolean
          attack_log: Json
          auto_mitigation: boolean
          challenge_passage_ttl: number
          created_at: string
          dns_amplification_protection: boolean
          domain_id: string
          http_flood_threshold: number
          id: string
          layer3_4_protection: boolean
          layer7_protection: boolean
          sensitivity_level: string
          slowloris_protection: boolean
          syn_flood_protection: boolean
          udp_flood_protection: boolean
          under_attack_mode: boolean
          updated_at: string
        }
        Insert: {
          alert_on_attack?: boolean
          attack_log?: Json
          auto_mitigation?: boolean
          challenge_passage_ttl?: number
          created_at?: string
          dns_amplification_protection?: boolean
          domain_id: string
          http_flood_threshold?: number
          id?: string
          layer3_4_protection?: boolean
          layer7_protection?: boolean
          sensitivity_level?: string
          slowloris_protection?: boolean
          syn_flood_protection?: boolean
          udp_flood_protection?: boolean
          under_attack_mode?: boolean
          updated_at?: string
        }
        Update: {
          alert_on_attack?: boolean
          attack_log?: Json
          auto_mitigation?: boolean
          challenge_passage_ttl?: number
          created_at?: string
          dns_amplification_protection?: boolean
          domain_id?: string
          http_flood_threshold?: number
          id?: string
          layer3_4_protection?: boolean
          layer7_protection?: boolean
          sensitivity_level?: string
          slowloris_protection?: boolean
          syn_flood_protection?: boolean
          udp_flood_protection?: boolean
          under_attack_mode?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ddos_protection_config_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: true
            referencedRelation: "protected_domains"
            referencedColumns: ["id"]
          },
        ]
      }
      dns_records: {
        Row: {
          content: string
          created_at: string
          domain_id: string
          id: string
          is_active: boolean
          name: string
          priority: number | null
          proxied: boolean
          record_type: string
          ttl: number
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          domain_id: string
          id?: string
          is_active?: boolean
          name?: string
          priority?: number | null
          proxied?: boolean
          record_type?: string
          ttl?: number
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          domain_id?: string
          id?: string
          is_active?: boolean
          name?: string
          priority?: number | null
          proxied?: boolean
          record_type?: string
          ttl?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dns_records_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "protected_domains"
            referencedColumns: ["id"]
          },
        ]
      }
      dsar_requests: {
        Row: {
          completed_at: string | null
          created_at: string
          data_scope: string[] | null
          deadline_at: string
          denial_reason: string | null
          id: string
          identity_verification_method: string | null
          identity_verified: boolean | null
          processed_by: string | null
          processing_notes: string | null
          profile_id: string
          request_type: string
          requester_email: string
          response_data: Json | null
          response_file_url: string | null
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          data_scope?: string[] | null
          deadline_at?: string
          denial_reason?: string | null
          id?: string
          identity_verification_method?: string | null
          identity_verified?: boolean | null
          processed_by?: string | null
          processing_notes?: string | null
          profile_id: string
          request_type: string
          requester_email: string
          response_data?: Json | null
          response_file_url?: string | null
          status?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          data_scope?: string[] | null
          deadline_at?: string
          denial_reason?: string | null
          id?: string
          identity_verification_method?: string | null
          identity_verified?: boolean | null
          processed_by?: string | null
          processing_notes?: string | null
          profile_id?: string
          request_type?: string
          requester_email?: string
          response_data?: Json | null
          response_file_url?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "dsar_requests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dsar_requests_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      domain_monitoring_logs: {
        Row: {
          check_type: string
          checked_at: string
          details: Json | null
          domain_id: string
          http_status: number | null
          id: string
          response_time_ms: number | null
          ssl_days_remaining: number | null
          status: string
        }
        Insert: {
          check_type: string
          checked_at?: string
          details?: Json | null
          domain_id: string
          http_status?: number | null
          id?: string
          response_time_ms?: number | null
          ssl_days_remaining?: number | null
          status?: string
        }
        Update: {
          check_type?: string
          checked_at?: string
          details?: Json | null
          domain_id?: string
          http_status?: number | null
          id?: string
          response_time_ms?: number | null
          ssl_days_remaining?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "domain_monitoring_logs_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "protected_domains"
            referencedColumns: ["id"]
          },
        ]
      }
      email_security_config: {
        Row: {
          anti_phishing_enabled: boolean | null
          bimi_enabled: boolean | null
          bimi_logo_url: string | null
          block_executables: boolean | null
          created_at: string
          dane_enabled: boolean | null
          dkim_enabled: boolean | null
          dkim_public_key: string | null
          dkim_selector: string | null
          dmarc_percentage: number | null
          dmarc_policy: string | null
          dmarc_rua: string | null
          dmarc_ruf: string | null
          domain_id: string
          id: string
          last_checked_at: string | null
          mta_sts_enabled: boolean | null
          mta_sts_mode: string | null
          quarantine_suspicious: boolean | null
          scan_attachments: boolean | null
          spf_record: string | null
          spf_status: string | null
          spoofing_protection: boolean | null
          updated_at: string
        }
        Insert: {
          anti_phishing_enabled?: boolean | null
          bimi_enabled?: boolean | null
          bimi_logo_url?: string | null
          block_executables?: boolean | null
          created_at?: string
          dane_enabled?: boolean | null
          dkim_enabled?: boolean | null
          dkim_public_key?: string | null
          dkim_selector?: string | null
          dmarc_percentage?: number | null
          dmarc_policy?: string | null
          dmarc_rua?: string | null
          dmarc_ruf?: string | null
          domain_id: string
          id?: string
          last_checked_at?: string | null
          mta_sts_enabled?: boolean | null
          mta_sts_mode?: string | null
          quarantine_suspicious?: boolean | null
          scan_attachments?: boolean | null
          spf_record?: string | null
          spf_status?: string | null
          spoofing_protection?: boolean | null
          updated_at?: string
        }
        Update: {
          anti_phishing_enabled?: boolean | null
          bimi_enabled?: boolean | null
          bimi_logo_url?: string | null
          block_executables?: boolean | null
          created_at?: string
          dane_enabled?: boolean | null
          dkim_enabled?: boolean | null
          dkim_public_key?: string | null
          dkim_selector?: string | null
          dmarc_percentage?: number | null
          dmarc_policy?: string | null
          dmarc_rua?: string | null
          dmarc_ruf?: string | null
          domain_id?: string
          id?: string
          last_checked_at?: string | null
          mta_sts_enabled?: boolean | null
          mta_sts_mode?: string | null
          quarantine_suspicious?: boolean | null
          scan_attachments?: boolean | null
          spf_record?: string | null
          spf_status?: string | null
          spoofing_protection?: boolean | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_security_config_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: true
            referencedRelation: "protected_domains"
            referencedColumns: ["id"]
          },
        ]
      }
      firewall_analytics: {
        Row: {
          allowed_requests: number
          avg_response_time_ms: number | null
          bandwidth_bytes: number
          blocked_requests: number
          cached_bytes: number
          challenged_requests: number
          countries: Json
          created_at: string
          date: string
          domain_id: string
          id: string
          page_views: number
          threats_by_type: Json
          top_ips: Json
          top_paths: Json
          total_requests: number
          unique_visitors: number
        }
        Insert: {
          allowed_requests?: number
          avg_response_time_ms?: number | null
          bandwidth_bytes?: number
          blocked_requests?: number
          cached_bytes?: number
          challenged_requests?: number
          countries?: Json
          created_at?: string
          date?: string
          domain_id: string
          id?: string
          page_views?: number
          threats_by_type?: Json
          top_ips?: Json
          top_paths?: Json
          total_requests?: number
          unique_visitors?: number
        }
        Update: {
          allowed_requests?: number
          avg_response_time_ms?: number | null
          bandwidth_bytes?: number
          blocked_requests?: number
          cached_bytes?: number
          challenged_requests?: number
          countries?: Json
          created_at?: string
          date?: string
          domain_id?: string
          id?: string
          page_views?: number
          threats_by_type?: Json
          top_ips?: Json
          top_paths?: Json
          total_requests?: number
          unique_visitors?: number
        }
        Relationships: [
          {
            foreignKeyName: "firewall_analytics_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "protected_domains"
            referencedColumns: ["id"]
          },
        ]
      }
      fraud_alerts: {
        Row: {
          alert_type: string
          created_at: string
          details: Json | null
          detected_at: string
          id: string
          profile_id: string | null
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          status: string
        }
        Insert: {
          alert_type: string
          created_at?: string
          details?: Json | null
          detected_at?: string
          id?: string
          profile_id?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
        }
        Update: {
          alert_type?: string
          created_at?: string
          details?: Json | null
          detected_at?: string
          id?: string
          profile_id?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "fraud_alerts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fraud_risk_profiles: {
        Row: {
          auto_block_threshold: number | null
          behavioral_score: number | null
          composite_score: number | null
          created_at: string
          device_score: number | null
          factors: Json | null
          financial_score: number | null
          id: string
          identity_score: number | null
          last_recalculated_at: string | null
          manual_review_threshold: number | null
          network_score: number | null
          profile_id: string
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          risk_tier: string | null
          updated_at: string
          velocity_score: number | null
        }
        Insert: {
          auto_block_threshold?: number | null
          behavioral_score?: number | null
          composite_score?: number | null
          created_at?: string
          device_score?: number | null
          factors?: Json | null
          financial_score?: number | null
          id?: string
          identity_score?: number | null
          last_recalculated_at?: string | null
          manual_review_threshold?: number | null
          network_score?: number | null
          profile_id: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          risk_tier?: string | null
          updated_at?: string
          velocity_score?: number | null
        }
        Update: {
          auto_block_threshold?: number | null
          behavioral_score?: number | null
          composite_score?: number | null
          created_at?: string
          device_score?: number | null
          factors?: Json | null
          financial_score?: number | null
          id?: string
          identity_score?: number | null
          last_recalculated_at?: string | null
          manual_review_threshold?: number | null
          network_score?: number | null
          profile_id?: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          risk_tier?: string | null
          updated_at?: string
          velocity_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fraud_risk_profiles_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fraud_risk_profiles_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fraud_rule_triggers: {
        Row: {
          action_taken: string
          context: Json
          id: string
          profile_id: string | null
          resolution_notes: string | null
          resolved: boolean | null
          resolved_at: string | null
          resolved_by: string | null
          risk_points_applied: number
          rule_id: string
          triggered_at: string
        }
        Insert: {
          action_taken: string
          context?: Json
          id?: string
          profile_id?: string | null
          resolution_notes?: string | null
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
          risk_points_applied: number
          rule_id: string
          triggered_at?: string
        }
        Update: {
          action_taken?: string
          context?: Json
          id?: string
          profile_id?: string | null
          resolution_notes?: string | null
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
          risk_points_applied?: number
          rule_id?: string
          triggered_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fraud_rule_triggers_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "fraud_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fraud_rule_triggers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fraud_rule_triggers_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fraud_rules: {
        Row: {
          action_on_trigger: string
          condition_sql: string | null
          cooldown_minutes: number | null
          created_at: string
          description: string | null
          id: string
          is_enabled: boolean | null
          risk_points: number
          rule_category: string
          rule_name: string
          updated_at: string
        }
        Insert: {
          action_on_trigger?: string
          condition_sql?: string | null
          cooldown_minutes?: number | null
          created_at?: string
          description?: string | null
          id?: string
          is_enabled?: boolean | null
          risk_points?: number
          rule_category: string
          rule_name: string
          updated_at?: string
        }
        Update: {
          action_on_trigger?: string
          condition_sql?: string | null
          cooldown_minutes?: number | null
          created_at?: string
          description?: string | null
          id?: string
          is_enabled?: boolean | null
          risk_points?: number
          rule_category?: string
          rule_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      groups: {
        Row: {
          commission_model_id: string | null
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          commission_model_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          commission_model_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "groups_commission_model_id_fkey"
            columns: ["commission_model_id"]
            isOneToOne: false
            referencedRelation: "commission_models"
            referencedColumns: ["id"]
          },
        ]
      }
      honeypot_events: {
        Row: {
          attack_type: string | null
          attacker_ip: string
          attacker_port: number | null
          created_at: string
          credentials_used: Json | null
          geo_location: Json | null
          honeypot_type: string
          id: string
          is_automated: boolean | null
          payload: string | null
          protocol: string | null
          session_duration_ms: number | null
          target_port: number | null
          threat_intel_match: boolean | null
        }
        Insert: {
          attack_type?: string | null
          attacker_ip: string
          attacker_port?: number | null
          created_at?: string
          credentials_used?: Json | null
          geo_location?: Json | null
          honeypot_type?: string
          id?: string
          is_automated?: boolean | null
          payload?: string | null
          protocol?: string | null
          session_duration_ms?: number | null
          target_port?: number | null
          threat_intel_match?: boolean | null
        }
        Update: {
          attack_type?: string | null
          attacker_ip?: string
          attacker_port?: number | null
          created_at?: string
          credentials_used?: Json | null
          geo_location?: Json | null
          honeypot_type?: string
          id?: string
          is_automated?: boolean | null
          payload?: string | null
          protocol?: string | null
          session_duration_ms?: number | null
          target_port?: number | null
          threat_intel_match?: boolean | null
        }
        Relationships: []
      }
      ip_access_rules: {
        Row: {
          action: string
          country_code: string | null
          created_at: string
          created_by: string | null
          domain_id: string | null
          expires_at: string | null
          hit_count: number
          id: string
          ip_address: string
          is_active: boolean
          last_hit_at: string | null
          note: string | null
          scope: string
          updated_at: string
        }
        Insert: {
          action?: string
          country_code?: string | null
          created_at?: string
          created_by?: string | null
          domain_id?: string | null
          expires_at?: string | null
          hit_count?: number
          id?: string
          ip_address: string
          is_active?: boolean
          last_hit_at?: string | null
          note?: string | null
          scope?: string
          updated_at?: string
        }
        Update: {
          action?: string
          country_code?: string | null
          created_at?: string
          created_by?: string | null
          domain_id?: string | null
          expires_at?: string | null
          hit_count?: number
          id?: string
          ip_address?: string
          is_active?: boolean
          last_hit_at?: string | null
          note?: string | null
          scope?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ip_access_rules_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "protected_domains"
            referencedColumns: ["id"]
          },
        ]
      }
      known_devices: {
        Row: {
          blocked_reason: string | null
          device_fingerprint: string
          device_name: string | null
          first_seen_at: string
          id: string
          is_blocked: boolean | null
          is_trusted: boolean | null
          last_seen_at: string
          login_count: number | null
          profile_id: string
          trust_approved_at: string | null
          trust_approved_by: string | null
          user_agent: string | null
        }
        Insert: {
          blocked_reason?: string | null
          device_fingerprint: string
          device_name?: string | null
          first_seen_at?: string
          id?: string
          is_blocked?: boolean | null
          is_trusted?: boolean | null
          last_seen_at?: string
          login_count?: number | null
          profile_id: string
          trust_approved_at?: string | null
          trust_approved_by?: string | null
          user_agent?: string | null
        }
        Update: {
          blocked_reason?: string | null
          device_fingerprint?: string
          device_name?: string | null
          first_seen_at?: string
          id?: string
          is_blocked?: boolean | null
          is_trusted?: boolean | null
          last_seen_at?: string
          login_count?: number | null
          profile_id?: string
          trust_approved_at?: string | null
          trust_approved_by?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "known_devices_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "known_devices_trust_approved_by_fkey"
            columns: ["trust_approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      kyc_limits: {
        Row: {
          can_receive_commissions: boolean | null
          can_withdraw: boolean | null
          id: string
          max_daily_volume: number
          max_monthly_volume: number
          max_monthly_withdrawal: number
          max_single_transaction: number
          max_withdrawal_per_request: number
          requires_enhanced_due_diligence: boolean | null
          verification_level: string
        }
        Insert: {
          can_receive_commissions?: boolean | null
          can_withdraw?: boolean | null
          id?: string
          max_daily_volume?: number
          max_monthly_volume?: number
          max_monthly_withdrawal?: number
          max_single_transaction?: number
          max_withdrawal_per_request?: number
          requires_enhanced_due_diligence?: boolean | null
          verification_level: string
        }
        Update: {
          can_receive_commissions?: boolean | null
          can_withdraw?: boolean | null
          id?: string
          max_daily_volume?: number
          max_monthly_volume?: number
          max_monthly_withdrawal?: number
          max_single_transaction?: number
          max_withdrawal_per_request?: number
          requires_enhanced_due_diligence?: boolean | null
          verification_level?: string
        }
        Relationships: []
      }
      kyc_verifications: {
        Row: {
          address_proof_type: string | null
          address_proof_url: string | null
          address_verified: boolean | null
          adverse_media_result: string | null
          aml_risk_rating: string | null
          created_at: string
          document_back_url: string | null
          document_country: string | null
          document_expiry: string | null
          document_front_url: string | null
          document_number_hash: string | null
          document_type: string | null
          expires_at: string | null
          id: string
          pep_check_result: string | null
          profile_id: string
          provider_reference: string | null
          provider_response: Json | null
          rejection_reason: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          sanctions_check_result: string | null
          selfie_url: string | null
          status: string
          submitted_at: string | null
          updated_at: string
          verification_level: string
          verification_provider: string | null
        }
        Insert: {
          address_proof_type?: string | null
          address_proof_url?: string | null
          address_verified?: boolean | null
          adverse_media_result?: string | null
          aml_risk_rating?: string | null
          created_at?: string
          document_back_url?: string | null
          document_country?: string | null
          document_expiry?: string | null
          document_front_url?: string | null
          document_number_hash?: string | null
          document_type?: string | null
          expires_at?: string | null
          id?: string
          pep_check_result?: string | null
          profile_id: string
          provider_reference?: string | null
          provider_response?: Json | null
          rejection_reason?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sanctions_check_result?: string | null
          selfie_url?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
          verification_level?: string
          verification_provider?: string | null
        }
        Update: {
          address_proof_type?: string | null
          address_proof_url?: string | null
          address_verified?: boolean | null
          adverse_media_result?: string | null
          aml_risk_rating?: string | null
          created_at?: string
          document_back_url?: string | null
          document_country?: string | null
          document_expiry?: string | null
          document_front_url?: string | null
          document_number_hash?: string | null
          document_type?: string | null
          expires_at?: string | null
          id?: string
          pep_check_result?: string | null
          profile_id?: string
          provider_reference?: string | null
          provider_response?: Json | null
          rejection_reason?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sanctions_check_result?: string | null
          selfie_url?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
          verification_level?: string
          verification_provider?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kyc_verifications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kyc_verifications_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leadership_pool_payouts: {
        Row: {
          created_at: string | null
          id: string
          paid_at: string | null
          partner_id: string
          partner_shares: number
          payout_amount: number
          period_end: string
          period_start: string
          pool_level: Database["public"]["Enums"]["pool_level"]
          share_value: number
          status: Database["public"]["Enums"]["commission_status"] | null
          total_pool_amount: number
          total_shares: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          paid_at?: string | null
          partner_id: string
          partner_shares: number
          payout_amount: number
          period_end: string
          period_start: string
          pool_level: Database["public"]["Enums"]["pool_level"]
          share_value: number
          status?: Database["public"]["Enums"]["commission_status"] | null
          total_pool_amount: number
          total_shares: number
        }
        Update: {
          created_at?: string | null
          id?: string
          paid_at?: string | null
          partner_id?: string
          partner_shares?: number
          payout_amount?: number
          period_end?: string
          period_start?: string
          pool_level?: Database["public"]["Enums"]["pool_level"]
          share_value?: number
          status?: Database["public"]["Enums"]["commission_status"] | null
          total_pool_amount?: number
          total_shares?: number
        }
        Relationships: [
          {
            foreignKeyName: "leadership_pool_payouts_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leadership_qualifications: {
        Row: {
          active_contracts_count: number | null
          created_at: string | null
          direct_partners_count: number | null
          id: string
          is_qualified: boolean | null
          level1_partners_count: number | null
          level2_partners_count: number | null
          partner_id: string
          pool_level: Database["public"]["Enums"]["pool_level"]
          qualified_at: string | null
          shares_count: number
          updated_at: string | null
        }
        Insert: {
          active_contracts_count?: number | null
          created_at?: string | null
          direct_partners_count?: number | null
          id?: string
          is_qualified?: boolean | null
          level1_partners_count?: number | null
          level2_partners_count?: number | null
          partner_id: string
          pool_level: Database["public"]["Enums"]["pool_level"]
          qualified_at?: string | null
          shares_count?: number
          updated_at?: string | null
        }
        Update: {
          active_contracts_count?: number | null
          created_at?: string | null
          direct_partners_count?: number | null
          id?: string
          is_qualified?: boolean | null
          level1_partners_count?: number | null
          level2_partners_count?: number | null
          partner_id?: string
          pool_level?: Database["public"]["Enums"]["pool_level"]
          qualified_at?: string | null
          shares_count?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leadership_qualifications_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          address: string | null
          assigned_employee_id: string | null
          call_center_id: string | null
          callback_at: string | null
          city: string | null
          company_name: string | null
          contact_person: string | null
          country: string | null
          created_at: string | null
          domain: string | null
          email: string | null
          id: string
          last_contact_at: string | null
          notes: string | null
          phone: string | null
          postal_code: string | null
          priority: number | null
          source: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          assigned_employee_id?: string | null
          call_center_id?: string | null
          callback_at?: string | null
          city?: string | null
          company_name?: string | null
          contact_person?: string | null
          country?: string | null
          created_at?: string | null
          domain?: string | null
          email?: string | null
          id?: string
          last_contact_at?: string | null
          notes?: string | null
          phone?: string | null
          postal_code?: string | null
          priority?: number | null
          source?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          assigned_employee_id?: string | null
          call_center_id?: string | null
          callback_at?: string | null
          city?: string | null
          company_name?: string | null
          contact_person?: string | null
          country?: string | null
          created_at?: string | null
          domain?: string | null
          email?: string | null
          id?: string
          last_contact_at?: string | null
          notes?: string | null
          phone?: string | null
          postal_code?: string | null
          priority?: number | null
          source?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_assigned_employee_id_fkey"
            columns: ["assigned_employee_id"]
            isOneToOne: false
            referencedRelation: "call_center_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_call_center_id_fkey"
            columns: ["call_center_id"]
            isOneToOne: false
            referencedRelation: "call_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      login_attempts: {
        Row: {
          created_at: string
          email: string | null
          failure_reason: string | null
          id: string
          ip_address: string | null
          success: boolean
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          failure_reason?: string | null
          id?: string
          ip_address?: string | null
          success?: boolean
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          failure_reason?: string | null
          id?: string
          ip_address?: string | null
          success?: boolean
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      network_logs: {
        Row: {
          action: string | null
          asset_id: string | null
          bytes_transferred: number | null
          destination_ip: string | null
          destination_port: number | null
          direction: string
          geo_destination: Json | null
          geo_source: Json | null
          id: string
          logged_at: string
          packets_count: number | null
          profile_id: string | null
          protocol: string | null
          rule_matched: string | null
          source_ip: string | null
          source_port: number | null
          threat_category: string | null
          threat_detected: boolean | null
        }
        Insert: {
          action?: string | null
          asset_id?: string | null
          bytes_transferred?: number | null
          destination_ip?: string | null
          destination_port?: number | null
          direction?: string
          geo_destination?: Json | null
          geo_source?: Json | null
          id?: string
          logged_at?: string
          packets_count?: number | null
          profile_id?: string | null
          protocol?: string | null
          rule_matched?: string | null
          source_ip?: string | null
          source_port?: number | null
          threat_category?: string | null
          threat_detected?: boolean | null
        }
        Update: {
          action?: string | null
          asset_id?: string | null
          bytes_transferred?: number | null
          destination_ip?: string | null
          destination_port?: number | null
          direction?: string
          geo_destination?: Json | null
          geo_source?: Json | null
          id?: string
          logged_at?: string
          packets_count?: number | null
          profile_id?: string | null
          protocol?: string | null
          rule_matched?: string | null
          source_ip?: string | null
          source_port?: number | null
          threat_category?: string | null
          threat_detected?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "network_logs_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "security_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "network_logs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      page_rules: {
        Row: {
          actions: Json
          created_at: string
          description: string | null
          domain_id: string
          id: string
          is_active: boolean
          priority: number
          updated_at: string
          url_pattern: string
        }
        Insert: {
          actions?: Json
          created_at?: string
          description?: string | null
          domain_id: string
          id?: string
          is_active?: boolean
          priority?: number
          updated_at?: string
          url_pattern: string
        }
        Update: {
          actions?: Json
          created_at?: string
          description?: string | null
          domain_id?: string
          id?: string
          is_active?: boolean
          priority?: number
          updated_at?: string
          url_pattern?: string
        }
        Relationships: [
          {
            foreignKeyName: "page_rules_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "protected_domains"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_cycles: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          completed_at: string | null
          created_at: string
          cycle_type: string
          id: string
          partners_count: number
          period_end: string
          period_start: string
          status: string
          total_bonuses: number
          total_commissions: number
          total_payouts: number
          total_pool: number
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          completed_at?: string | null
          created_at?: string
          cycle_type: string
          id?: string
          partners_count?: number
          period_end: string
          period_start: string
          status?: string
          total_bonuses?: number
          total_commissions?: number
          total_payouts?: number
          total_pool?: number
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          completed_at?: string | null
          created_at?: string
          cycle_type?: string
          id?: string
          partners_count?: number
          period_end?: string
          period_start?: string
          status?: string
          total_bonuses?: number
          total_commissions?: number
          total_payouts?: number
          total_pool?: number
          updated_at?: string
        }
        Relationships: []
      }
      pool_config: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          percentage_cap: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          percentage_cap?: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          percentage_cap?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      pool_payouts: {
        Row: {
          created_at: string | null
          id: string
          paid_at: string | null
          payout_amount: number
          period_month: string
          rank_id: string
          share_value: number
          status: string | null
          total_pool_amount: number
          total_shares: number
          user_id: string
          user_shares: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          paid_at?: string | null
          payout_amount: number
          period_month: string
          rank_id: string
          share_value: number
          status?: string | null
          total_pool_amount: number
          total_shares: number
          user_id: string
          user_shares: number
        }
        Update: {
          created_at?: string | null
          id?: string
          paid_at?: string | null
          payout_amount?: number
          period_month?: string
          rank_id?: string
          share_value?: number
          status?: string | null
          total_pool_amount?: number
          total_shares?: number
          user_id?: string
          user_shares?: number
        }
        Relationships: [
          {
            foreignKeyName: "pool_payouts_rank_id_fkey"
            columns: ["rank_id"]
            isOneToOne: false
            referencedRelation: "ranks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pool_payouts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_holder: string | null
          age_confirmed: boolean | null
          bank_name: string | null
          bic: string | null
          city: string | null
          country: string | null
          created_at: string | null
          date_of_birth: string | null
          domain: string | null
          domain_owner_confirmed: boolean | null
          domain_verified: boolean | null
          email: string
          first_name: string
          house_number: string | null
          iban: string | null
          id: string
          id_number: string | null
          ip_address: string | null
          last_name: string
          phone: string | null
          postal_code: string | null
          privacy_accepted: boolean | null
          promotion_code: string | null
          role: Database["public"]["Enums"]["user_role"] | null
          sepa_mandate_accepted: boolean | null
          sepa_mandate_date: string | null
          sponsor_id: string | null
          status: Database["public"]["Enums"]["user_status"] | null
          street: string | null
          terms_accepted: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          account_holder?: string | null
          age_confirmed?: boolean | null
          bank_name?: string | null
          bic?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          domain?: string | null
          domain_owner_confirmed?: boolean | null
          domain_verified?: boolean | null
          email: string
          first_name: string
          house_number?: string | null
          iban?: string | null
          id?: string
          id_number?: string | null
          ip_address?: string | null
          last_name: string
          phone?: string | null
          postal_code?: string | null
          privacy_accepted?: boolean | null
          promotion_code?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
          sepa_mandate_accepted?: boolean | null
          sepa_mandate_date?: string | null
          sponsor_id?: string | null
          status?: Database["public"]["Enums"]["user_status"] | null
          street?: string | null
          terms_accepted?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          account_holder?: string | null
          age_confirmed?: boolean | null
          bank_name?: string | null
          bic?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          domain?: string | null
          domain_owner_confirmed?: boolean | null
          domain_verified?: boolean | null
          email?: string
          first_name?: string
          house_number?: string | null
          iban?: string | null
          id?: string
          id_number?: string | null
          ip_address?: string | null
          last_name?: string
          phone?: string | null
          postal_code?: string | null
          privacy_accepted?: boolean | null
          promotion_code?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
          sepa_mandate_accepted?: boolean | null
          sepa_mandate_date?: string | null
          sponsor_id?: string | null
          status?: Database["public"]["Enums"]["user_status"] | null
          street?: string | null
          terms_accepted?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_code_usages: {
        Row: {
          code_type: string
          fail_reason: string | null
          id: string
          ip_address: string | null
          promo_code_id: string | null
          result: string
          used_at: string
          user_agent: string | null
          user_email: string
          user_id: string | null
        }
        Insert: {
          code_type?: string
          fail_reason?: string | null
          id?: string
          ip_address?: string | null
          promo_code_id?: string | null
          result?: string
          used_at?: string
          user_agent?: string | null
          user_email: string
          user_id?: string | null
        }
        Update: {
          code_type?: string
          fail_reason?: string | null
          id?: string
          ip_address?: string | null
          promo_code_id?: string | null
          result?: string
          used_at?: string
          user_agent?: string | null
          user_email?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promo_code_usages_promo_code_id_fkey"
            columns: ["promo_code_id"]
            isOneToOne: false
            referencedRelation: "rotating_promo_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_code_usages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      promotion_codes: {
        Row: {
          call_center_id: string | null
          code: string
          created_at: string | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          max_uses: number | null
          partner_id: string
          usage_count: number | null
        }
        Insert: {
          call_center_id?: string | null
          code: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          max_uses?: number | null
          partner_id: string
          usage_count?: number | null
        }
        Update: {
          call_center_id?: string | null
          code?: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          max_uses?: number | null
          partner_id?: string
          usage_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "promotion_codes_call_center_id_fkey"
            columns: ["call_center_id"]
            isOneToOne: false
            referencedRelation: "call_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_codes_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      protected_domains: {
        Row: {
          activated_at: string | null
          created_at: string | null
          ddos_protection: boolean | null
          domain: string
          expires_at: string | null
          id: string
          ip_address: string | null
          profile_id: string
          protection_status: string
          proxy_ip: string | null
          ssl_managed: boolean | null
          updated_at: string | null
          waf_enabled: boolean | null
        }
        Insert: {
          activated_at?: string | null
          created_at?: string | null
          ddos_protection?: boolean | null
          domain: string
          expires_at?: string | null
          id?: string
          ip_address?: string | null
          profile_id: string
          protection_status?: string
          proxy_ip?: string | null
          ssl_managed?: boolean | null
          updated_at?: string | null
          waf_enabled?: boolean | null
        }
        Update: {
          activated_at?: string | null
          created_at?: string | null
          ddos_protection?: boolean | null
          domain?: string
          expires_at?: string | null
          id?: string
          ip_address?: string | null
          profile_id?: string
          protection_status?: string
          proxy_ip?: string | null
          ssl_managed?: boolean | null
          updated_at?: string | null
          waf_enabled?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "protected_domains_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rank_history: {
        Row: {
          achieved_at: string
          created_at: string
          id: string
          previous_rank_id: string | null
          previous_rank_name: string | null
          profile_id: string
          qualification_snapshot: Json | null
          rank_id: string | null
          rank_name: string
        }
        Insert: {
          achieved_at?: string
          created_at?: string
          id?: string
          previous_rank_id?: string | null
          previous_rank_name?: string | null
          profile_id: string
          qualification_snapshot?: Json | null
          rank_id?: string | null
          rank_name: string
        }
        Update: {
          achieved_at?: string
          created_at?: string
          id?: string
          previous_rank_id?: string | null
          previous_rank_name?: string | null
          profile_id?: string
          qualification_snapshot?: Json | null
          rank_id?: string | null
          rank_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "rank_history_previous_rank_id_fkey"
            columns: ["previous_rank_id"]
            isOneToOne: false
            referencedRelation: "ranks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rank_history_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rank_history_rank_id_fkey"
            columns: ["rank_id"]
            isOneToOne: false
            referencedRelation: "ranks"
            referencedColumns: ["id"]
          },
        ]
      }
      ranks: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          level: number
          min_direct_partners: number
          min_level1_partners: number | null
          min_level2_partners: number | null
          min_team_contracts: number
          name: string
          shares_count: number
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          level: number
          min_direct_partners: number
          min_level1_partners?: number | null
          min_level2_partners?: number | null
          min_team_contracts: number
          name: string
          shares_count?: number
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          level?: number
          min_direct_partners?: number
          min_level1_partners?: number | null
          min_level2_partners?: number | null
          min_team_contracts?: number
          name?: string
          shares_count?: number
        }
        Relationships: []
      }
      rate_limit_rules: {
        Row: {
          action: string
          action_timeout: number
          created_at: string
          description: string | null
          domain_id: string
          id: string
          is_active: boolean
          match_response_codes: string[] | null
          methods: string[]
          period_seconds: number
          requests_per_period: number
          triggered_count: number
          updated_at: string
          url_pattern: string
        }
        Insert: {
          action?: string
          action_timeout?: number
          created_at?: string
          description?: string | null
          domain_id: string
          id?: string
          is_active?: boolean
          match_response_codes?: string[] | null
          methods?: string[]
          period_seconds?: number
          requests_per_period?: number
          triggered_count?: number
          updated_at?: string
          url_pattern?: string
        }
        Update: {
          action?: string
          action_timeout?: number
          created_at?: string
          description?: string | null
          domain_id?: string
          id?: string
          is_active?: boolean
          match_response_codes?: string[] | null
          methods?: string[]
          period_seconds?: number
          requests_per_period?: number
          triggered_count?: number
          updated_at?: string
          url_pattern?: string
        }
        Relationships: [
          {
            foreignKeyName: "rate_limit_rules_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "protected_domains"
            referencedColumns: ["id"]
          },
        ]
      }
      rotating_promo_codes: {
        Row: {
          code: string
          code_hash: string
          code_type: string
          created_at: string
          created_by_admin: string | null
          description: string | null
          id: string
          is_active: boolean
          max_uses: number | null
          updated_at: string
          use_count: number
          valid_from: string
          valid_to: string
        }
        Insert: {
          code: string
          code_hash: string
          code_type?: string
          created_at?: string
          created_by_admin?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          updated_at?: string
          use_count?: number
          valid_from?: string
          valid_to: string
        }
        Update: {
          code?: string
          code_hash?: string
          code_type?: string
          created_at?: string
          created_by_admin?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number | null
          updated_at?: string
          use_count?: number
          valid_from?: string
          valid_to?: string
        }
        Relationships: []
      }
      scan_attempts: {
        Row: {
          attempt_count: number | null
          created_at: string | null
          domain: string | null
          first_attempt_at: string | null
          id: string
          ip_address: string | null
          last_attempt_at: string | null
          network_hash: string
        }
        Insert: {
          attempt_count?: number | null
          created_at?: string | null
          domain?: string | null
          first_attempt_at?: string | null
          id?: string
          ip_address?: string | null
          last_attempt_at?: string | null
          network_hash: string
        }
        Update: {
          attempt_count?: number | null
          created_at?: string | null
          domain?: string | null
          first_attempt_at?: string | null
          id?: string
          ip_address?: string | null
          last_attempt_at?: string | null
          network_hash?: string
        }
        Relationships: []
      }
      scan_dns_results: {
        Row: {
          a_records: Json | null
          aaaa_records: Json | null
          created_at: string | null
          dmarc_record: string | null
          id: string
          mx_records: Json | null
          ns_records: Json | null
          scan_id: string
          spf_record: string | null
          txt_records: Json | null
        }
        Insert: {
          a_records?: Json | null
          aaaa_records?: Json | null
          created_at?: string | null
          dmarc_record?: string | null
          id?: string
          mx_records?: Json | null
          ns_records?: Json | null
          scan_id: string
          spf_record?: string | null
          txt_records?: Json | null
        }
        Update: {
          a_records?: Json | null
          aaaa_records?: Json | null
          created_at?: string | null
          dmarc_record?: string | null
          id?: string
          mx_records?: Json | null
          ns_records?: Json | null
          scan_id?: string
          spf_record?: string | null
          txt_records?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "scan_dns_results_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "security_scans"
            referencedColumns: ["id"]
          },
        ]
      }
      scan_header_results: {
        Row: {
          all_headers: Json | null
          created_at: string | null
          has_csp: boolean | null
          has_hsts: boolean | null
          has_referrer_policy: boolean | null
          has_xcontent_type: boolean | null
          has_xframe_options: boolean | null
          id: string
          scan_id: string
          server_header: string | null
          x_powered_by: string | null
        }
        Insert: {
          all_headers?: Json | null
          created_at?: string | null
          has_csp?: boolean | null
          has_hsts?: boolean | null
          has_referrer_policy?: boolean | null
          has_xcontent_type?: boolean | null
          has_xframe_options?: boolean | null
          id?: string
          scan_id: string
          server_header?: string | null
          x_powered_by?: string | null
        }
        Update: {
          all_headers?: Json | null
          created_at?: string | null
          has_csp?: boolean | null
          has_hsts?: boolean | null
          has_referrer_policy?: boolean | null
          has_xcontent_type?: boolean | null
          has_xframe_options?: boolean | null
          id?: string
          scan_id?: string
          server_header?: string | null
          x_powered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scan_header_results_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "security_scans"
            referencedColumns: ["id"]
          },
        ]
      }
      scan_results_light: {
        Row: {
          id: string
          network_hash: string
          result: string
          scan_attempt_id: string | null
          scanned_at: string | null
        }
        Insert: {
          id?: string
          network_hash: string
          result: string
          scan_attempt_id?: string | null
          scanned_at?: string | null
        }
        Update: {
          id?: string
          network_hash?: string
          result?: string
          scan_attempt_id?: string | null
          scanned_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scan_results_light_scan_attempt_id_fkey"
            columns: ["scan_attempt_id"]
            isOneToOne: false
            referencedRelation: "scan_attempts"
            referencedColumns: ["id"]
          },
        ]
      }
      scan_ssl_results: {
        Row: {
          certificate_issuer: string | null
          certificate_subject: string | null
          certificate_valid: boolean | null
          cipher_suites: Json | null
          created_at: string | null
          days_until_expiry: number | null
          has_ssl: boolean | null
          id: string
          protocol_versions: Json | null
          scan_id: string
          supports_tls13: boolean | null
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          certificate_issuer?: string | null
          certificate_subject?: string | null
          certificate_valid?: boolean | null
          cipher_suites?: Json | null
          created_at?: string | null
          days_until_expiry?: number | null
          has_ssl?: boolean | null
          id?: string
          protocol_versions?: Json | null
          scan_id: string
          supports_tls13?: boolean | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          certificate_issuer?: string | null
          certificate_subject?: string | null
          certificate_valid?: boolean | null
          cipher_suites?: Json | null
          created_at?: string | null
          days_until_expiry?: number | null
          has_ssl?: boolean | null
          id?: string
          protocol_versions?: Json | null
          scan_id?: string
          supports_tls13?: boolean | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scan_ssl_results_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "security_scans"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_scans: {
        Row: {
          created_at: string | null
          domain: string
          domain_id: string | null
          id: string
          is_active: boolean | null
          last_result: string | null
          last_run_at: string | null
          next_run_at: string
          profile_id: string
          schedule_type: string
        }
        Insert: {
          created_at?: string | null
          domain: string
          domain_id?: string | null
          id?: string
          is_active?: boolean | null
          last_result?: string | null
          last_run_at?: string | null
          next_run_at: string
          profile_id: string
          schedule_type: string
        }
        Update: {
          created_at?: string | null
          domain?: string
          domain_id?: string | null
          id?: string
          is_active?: boolean | null
          last_result?: string | null
          last_run_at?: string | null
          next_run_at?: string
          profile_id?: string
          schedule_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_scans_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "protected_domains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_scans_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      security_alerts: {
        Row: {
          acknowledged_at: string | null
          ai_analysis: string | null
          ai_recommendation: string | null
          alert_type: string
          asset_id: string | null
          assigned_to: string | null
          created_at: string
          description: string | null
          escalated_at: string | null
          id: string
          priority: number | null
          profile_id: string | null
          resolution: string | null
          resolved_at: string | null
          severity: string
          status: string
          threat_event_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          ai_analysis?: string | null
          ai_recommendation?: string | null
          alert_type: string
          asset_id?: string | null
          assigned_to?: string | null
          created_at?: string
          description?: string | null
          escalated_at?: string | null
          id?: string
          priority?: number | null
          profile_id?: string | null
          resolution?: string | null
          resolved_at?: string | null
          severity?: string
          status?: string
          threat_event_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          ai_analysis?: string | null
          ai_recommendation?: string | null
          alert_type?: string
          asset_id?: string | null
          assigned_to?: string | null
          created_at?: string
          description?: string | null
          escalated_at?: string | null
          id?: string
          priority?: number | null
          profile_id?: string | null
          resolution?: string | null
          resolved_at?: string | null
          severity?: string
          status?: string
          threat_event_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "security_alerts_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "security_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_alerts_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_alerts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_alerts_threat_event_id_fkey"
            columns: ["threat_event_id"]
            isOneToOne: false
            referencedRelation: "threat_events"
            referencedColumns: ["id"]
          },
        ]
      }
      security_assets: {
        Row: {
          agent_version: string | null
          asset_name: string
          asset_type: string
          created_at: string
          hostname: string | null
          id: string
          ip_address: string | null
          last_scan_at: string | null
          last_seen_at: string | null
          location: string | null
          mac_address: string | null
          metadata: Json | null
          os_type: string | null
          profile_id: string | null
          protection_level: string
          risk_score: number | null
          status: string
          tags: string[] | null
          updated_at: string
        }
        Insert: {
          agent_version?: string | null
          asset_name: string
          asset_type?: string
          created_at?: string
          hostname?: string | null
          id?: string
          ip_address?: string | null
          last_scan_at?: string | null
          last_seen_at?: string | null
          location?: string | null
          mac_address?: string | null
          metadata?: Json | null
          os_type?: string | null
          profile_id?: string | null
          protection_level?: string
          risk_score?: number | null
          status?: string
          tags?: string[] | null
          updated_at?: string
        }
        Update: {
          agent_version?: string | null
          asset_name?: string
          asset_type?: string
          created_at?: string
          hostname?: string | null
          id?: string
          ip_address?: string | null
          last_scan_at?: string | null
          last_seen_at?: string | null
          location?: string | null
          mac_address?: string | null
          metadata?: Json | null
          os_type?: string | null
          profile_id?: string | null
          protection_level?: string
          risk_score?: number | null
          status?: string
          tags?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "security_assets_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      security_findings: {
        Row: {
          category: string
          created_at: string | null
          description: string | null
          id: string
          recommendation: string | null
          scan_id: string
          severity: string
          technical_details: Json | null
          title: string
        }
        Insert: {
          category: string
          created_at?: string | null
          description?: string | null
          id?: string
          recommendation?: string | null
          scan_id: string
          severity: string
          technical_details?: Json | null
          title: string
        }
        Update: {
          category?: string
          created_at?: string | null
          description?: string | null
          id?: string
          recommendation?: string | null
          scan_id?: string
          severity?: string
          technical_details?: Json | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "security_findings_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "security_scans"
            referencedColumns: ["id"]
          },
        ]
      }
      security_incidents: {
        Row: {
          affected_domain_id: string | null
          assigned_to: string | null
          attack_vector: string | null
          category: string
          created_at: string
          description: string | null
          escalated_at: string | null
          id: string
          ioc_indicators: Json | null
          mitre_tactic: string | null
          mitre_technique: string | null
          priority: number | null
          reported_by: string | null
          resolution_notes: string | null
          resolved_at: string | null
          severity: string
          sla_breach: boolean | null
          source: string | null
          source_ip: string | null
          status: string
          tags: string[] | null
          timeline: Json | null
          title: string
          updated_at: string
        }
        Insert: {
          affected_domain_id?: string | null
          assigned_to?: string | null
          attack_vector?: string | null
          category?: string
          created_at?: string
          description?: string | null
          escalated_at?: string | null
          id?: string
          ioc_indicators?: Json | null
          mitre_tactic?: string | null
          mitre_technique?: string | null
          priority?: number | null
          reported_by?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          severity?: string
          sla_breach?: boolean | null
          source?: string | null
          source_ip?: string | null
          status?: string
          tags?: string[] | null
          timeline?: Json | null
          title: string
          updated_at?: string
        }
        Update: {
          affected_domain_id?: string | null
          assigned_to?: string | null
          attack_vector?: string | null
          category?: string
          created_at?: string
          description?: string | null
          escalated_at?: string | null
          id?: string
          ioc_indicators?: Json | null
          mitre_tactic?: string | null
          mitre_technique?: string | null
          priority?: number | null
          reported_by?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          severity?: string
          sla_breach?: boolean | null
          source?: string | null
          source_ip?: string | null
          status?: string
          tags?: string[] | null
          timeline?: Json | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "security_incidents_affected_domain_id_fkey"
            columns: ["affected_domain_id"]
            isOneToOne: false
            referencedRelation: "protected_domains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_incidents_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_incidents_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      security_reports: {
        Row: {
          created_at: string | null
          critical_count: number | null
          domain_id: string | null
          high_count: number | null
          id: string
          period_end: string
          period_start: string
          profile_id: string
          report_type: string
          total_findings: number | null
          total_scans: number | null
        }
        Insert: {
          created_at?: string | null
          critical_count?: number | null
          domain_id?: string | null
          high_count?: number | null
          id?: string
          period_end: string
          period_start: string
          profile_id: string
          report_type: string
          total_findings?: number | null
          total_scans?: number | null
        }
        Update: {
          created_at?: string | null
          critical_count?: number | null
          domain_id?: string | null
          high_count?: number | null
          id?: string
          period_end?: string
          period_start?: string
          profile_id?: string
          report_type?: string
          total_findings?: number | null
          total_scans?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "security_reports_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "protected_domains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_reports_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      security_scans: {
        Row: {
          completed_at: string | null
          created_at: string | null
          domain: string | null
          id: string
          ip_address: string | null
          network_hash: string
          overall_result: string | null
          scan_type: string
          started_at: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          domain?: string | null
          id?: string
          ip_address?: string | null
          network_hash: string
          overall_result?: string | null
          scan_type: string
          started_at?: string | null
          status?: string
          user_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          domain?: string | null
          id?: string
          ip_address?: string | null
          network_hash?: string
          overall_result?: string | null
          scan_type?: string
          started_at?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "security_scans_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      security_tests: {
        Row: {
          created_at: string | null
          details: Json | null
          domain: string | null
          id: string
          ip_address: string | null
          network_hash: string | null
          result: string | null
          test_count: number | null
          test_type: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          details?: Json | null
          domain?: string | null
          id?: string
          ip_address?: string | null
          network_hash?: string | null
          result?: string | null
          test_count?: number | null
          test_type: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          details?: Json | null
          domain?: string | null
          id?: string
          ip_address?: string | null
          network_hash?: string | null
          result?: string | null
          test_count?: number | null
          test_type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "security_tests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      siem_correlated_alerts: {
        Row: {
          affected_ips: string[] | null
          affected_profiles: string[] | null
          auto_actions_taken: Json | null
          correlated_events: Json
          correlation_rule_id: string
          created_at: string
          description: string | null
          id: string
          incident_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          status: string | null
          title: string
        }
        Insert: {
          affected_ips?: string[] | null
          affected_profiles?: string[] | null
          auto_actions_taken?: Json | null
          correlated_events: Json
          correlation_rule_id: string
          created_at?: string
          description?: string | null
          id?: string
          incident_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity: string
          status?: string | null
          title: string
        }
        Update: {
          affected_ips?: string[] | null
          affected_profiles?: string[] | null
          auto_actions_taken?: Json | null
          correlated_events?: Json
          correlation_rule_id?: string
          created_at?: string
          description?: string | null
          id?: string
          incident_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "siem_correlated_alerts_correlation_rule_id_fkey"
            columns: ["correlation_rule_id"]
            isOneToOne: false
            referencedRelation: "siem_correlation_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "siem_correlated_alerts_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "siem_correlated_alerts_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "security_incidents"
            referencedColumns: ["id"]
          },
        ]
      }
      ssl_certificates: {
        Row: {
          always_use_https: boolean
          auto_renew: boolean
          automatic_https_rewrites: boolean
          certificate_type: string
          created_at: string
          domain_id: string
          expires_at: string | null
          hsts_enabled: boolean
          hsts_include_subdomains: boolean
          hsts_max_age: number
          id: string
          issued_at: string | null
          issuer: string | null
          min_tls_version: string
          opportunistic_encryption: boolean
          status: string
          tls_1_3: boolean
          updated_at: string
        }
        Insert: {
          always_use_https?: boolean
          auto_renew?: boolean
          automatic_https_rewrites?: boolean
          certificate_type?: string
          created_at?: string
          domain_id: string
          expires_at?: string | null
          hsts_enabled?: boolean
          hsts_include_subdomains?: boolean
          hsts_max_age?: number
          id?: string
          issued_at?: string | null
          issuer?: string | null
          min_tls_version?: string
          opportunistic_encryption?: boolean
          status?: string
          tls_1_3?: boolean
          updated_at?: string
        }
        Update: {
          always_use_https?: boolean
          auto_renew?: boolean
          automatic_https_rewrites?: boolean
          certificate_type?: string
          created_at?: string
          domain_id?: string
          expires_at?: string | null
          hsts_enabled?: boolean
          hsts_include_subdomains?: boolean
          hsts_max_age?: number
          id?: string
          issued_at?: string | null
          issuer?: string | null
          min_tls_version?: string
          opportunistic_encryption?: boolean
          status?: string
          tls_1_3?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ssl_certificates_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "protected_domains"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          ai_response: string | null
          channel: string | null
          created_at: string | null
          escalated_at: string | null
          id: string
          message: string
          priority: string | null
          profile_id: string | null
          resolved_at: string | null
          status: string | null
          subject: string
          updated_at: string | null
        }
        Insert: {
          ai_response?: string | null
          channel?: string | null
          created_at?: string | null
          escalated_at?: string | null
          id?: string
          message: string
          priority?: string | null
          profile_id?: string | null
          resolved_at?: string | null
          status?: string | null
          subject: string
          updated_at?: string | null
        }
        Update: {
          ai_response?: string | null
          channel?: string | null
          created_at?: string | null
          escalated_at?: string | null
          id?: string
          message?: string
          priority?: string | null
          profile_id?: string | null
          resolved_at?: string | null
          status?: string | null
          subject?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      threat_events: {
        Row: {
          action_taken: string
          asset_id: string | null
          attack_vector: string | null
          confidence_score: number | null
          created_at: string
          description: string | null
          destination_ip: string | null
          destination_port: number | null
          event_type: string
          geo_location: Json | null
          id: string
          ioc_type: string | null
          ioc_value: string | null
          is_false_positive: boolean | null
          mitre_tactic: string | null
          mitre_technique: string | null
          profile_id: string | null
          protocol: string | null
          raw_log: Json | null
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          source_ip: string | null
          source_port: number | null
          title: string
        }
        Insert: {
          action_taken?: string
          asset_id?: string | null
          attack_vector?: string | null
          confidence_score?: number | null
          created_at?: string
          description?: string | null
          destination_ip?: string | null
          destination_port?: number | null
          event_type: string
          geo_location?: Json | null
          id?: string
          ioc_type?: string | null
          ioc_value?: string | null
          is_false_positive?: boolean | null
          mitre_tactic?: string | null
          mitre_technique?: string | null
          profile_id?: string | null
          protocol?: string | null
          raw_log?: Json | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          source_ip?: string | null
          source_port?: number | null
          title: string
        }
        Update: {
          action_taken?: string
          asset_id?: string | null
          attack_vector?: string | null
          confidence_score?: number | null
          created_at?: string
          description?: string | null
          destination_ip?: string | null
          destination_port?: number | null
          event_type?: string
          geo_location?: Json | null
          id?: string
          ioc_type?: string | null
          ioc_value?: string | null
          is_false_positive?: boolean | null
          mitre_tactic?: string | null
          mitre_technique?: string | null
          profile_id?: string | null
          protocol?: string | null
          raw_log?: Json | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          source_ip?: string | null
          source_port?: number | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "threat_events_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "security_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "threat_events_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      threat_intel: {
        Row: {
          confidence: number | null
          created_at: string
          created_by: string | null
          description: string | null
          expiry_at: string | null
          first_seen_at: string | null
          id: string
          indicator_type: string
          indicator_value: string
          is_active: boolean | null
          last_seen_at: string | null
          metadata: Json | null
          severity: string
          source: string | null
          tags: string[] | null
          threat_type: string
          updated_at: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          expiry_at?: string | null
          first_seen_at?: string | null
          id?: string
          indicator_type: string
          indicator_value: string
          is_active?: boolean | null
          last_seen_at?: string | null
          metadata?: Json | null
          severity?: string
          source?: string | null
          tags?: string[] | null
          threat_type: string
          updated_at?: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          expiry_at?: string | null
          first_seen_at?: string | null
          id?: string
          indicator_type?: string
          indicator_value?: string
          is_active?: boolean | null
          last_seen_at?: string | null
          metadata?: Json | null
          severity?: string
          source?: string | null
          tags?: string[] | null
          threat_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "threat_intel_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      threat_intel_feeds: {
        Row: {
          associated_campaigns: string[] | null
          confidence: number | null
          created_at: string
          description: string | null
          expires_at: string | null
          feed_source: string
          first_seen: string | null
          geo_location: Json | null
          hit_count: number | null
          id: string
          indicator_type: string
          indicator_value: string
          is_active: boolean | null
          last_seen: string | null
          severity: string | null
          source_url: string | null
          tags: string[] | null
          threat_type: string | null
          updated_at: string
          whois_data: Json | null
        }
        Insert: {
          associated_campaigns?: string[] | null
          confidence?: number | null
          created_at?: string
          description?: string | null
          expires_at?: string | null
          feed_source?: string
          first_seen?: string | null
          geo_location?: Json | null
          hit_count?: number | null
          id?: string
          indicator_type?: string
          indicator_value: string
          is_active?: boolean | null
          last_seen?: string | null
          severity?: string | null
          source_url?: string | null
          tags?: string[] | null
          threat_type?: string | null
          updated_at?: string
          whois_data?: Json | null
        }
        Update: {
          associated_campaigns?: string[] | null
          confidence?: number | null
          created_at?: string
          description?: string | null
          expires_at?: string | null
          feed_source?: string
          first_seen?: string | null
          geo_location?: Json | null
          hit_count?: number | null
          id?: string
          indicator_type?: string
          indicator_value?: string
          is_active?: boolean | null
          last_seen?: string | null
          severity?: string | null
          source_url?: string | null
          tags?: string[] | null
          threat_type?: string | null
          updated_at?: string
          whois_data?: Json | null
        }
        Relationships: []
      }
      threat_intelligence: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          indicator_type: string
          indicator_value: string
          is_active: boolean
          severity: string
          source: string | null
          threat_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          indicator_type: string
          indicator_value: string
          is_active?: boolean
          severity?: string
          source?: string | null
          threat_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          indicator_type?: string
          indicator_value?: string
          is_active?: boolean
          severity?: string
          source?: string | null
          threat_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount: number
          call_center_id: string | null
          commission_processed: boolean | null
          commission_processed_at: string | null
          contract_end_date: string | null
          contract_start_date: string | null
          created_at: string | null
          currency: string | null
          customer_id: string | null
          easybill_invoice_id: string | null
          id: string
          invoice_date: string | null
          invoice_number: string | null
          is_first_payment: boolean | null
          payment_method: string | null
          status: Database["public"]["Enums"]["transaction_status"] | null
          updated_at: string | null
        }
        Insert: {
          amount?: number
          call_center_id?: string | null
          commission_processed?: boolean | null
          commission_processed_at?: string | null
          contract_end_date?: string | null
          contract_start_date?: string | null
          created_at?: string | null
          currency?: string | null
          customer_id?: string | null
          easybill_invoice_id?: string | null
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          is_first_payment?: boolean | null
          payment_method?: string | null
          status?: Database["public"]["Enums"]["transaction_status"] | null
          updated_at?: string | null
        }
        Update: {
          amount?: number
          call_center_id?: string | null
          commission_processed?: boolean | null
          commission_processed_at?: string | null
          contract_end_date?: string | null
          contract_start_date?: string | null
          created_at?: string | null
          currency?: string | null
          customer_id?: string | null
          easybill_invoice_id?: string | null
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          is_first_payment?: boolean | null
          payment_method?: string | null
          status?: Database["public"]["Enums"]["transaction_status"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_call_center_id_fkey"
            columns: ["call_center_id"]
            isOneToOne: false
            referencedRelation: "call_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_groups: {
        Row: {
          group_id: string
          id: string
          joined_at: string | null
          user_id: string
        }
        Insert: {
          group_id: string
          id?: string
          joined_at?: string | null
          user_id: string
        }
        Update: {
          group_id?: string
          id?: string
          joined_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_groups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_groups_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_hierarchy: {
        Row: {
          ancestor_id: string
          created_at: string | null
          id: string
          is_active_for_commission: boolean | null
          level_number: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          ancestor_id: string
          created_at?: string | null
          id?: string
          is_active_for_commission?: boolean | null
          level_number: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          ancestor_id?: string
          created_at?: string | null
          id?: string
          is_active_for_commission?: boolean | null
          level_number?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_hierarchy_ancestor_id_fkey"
            columns: ["ancestor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_hierarchy_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_rank_history: {
        Row: {
          created_at: string | null
          id: string
          is_current: boolean | null
          qualified_at: string | null
          rank_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_current?: boolean | null
          qualified_at?: string | null
          rank_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_current?: boolean | null
          qualified_at?: string | null
          rank_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_rank_history_rank_id_fkey"
            columns: ["rank_id"]
            isOneToOne: false
            referencedRelation: "ranks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_rank_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      volume_tracking: {
        Row: {
          active_legs: number
          created_at: string
          direct_referrals_count: number
          group_volume: number
          id: string
          period_month: string
          personal_volume: number
          profile_id: string
          total_team_size: number
          updated_at: string
        }
        Insert: {
          active_legs?: number
          created_at?: string
          direct_referrals_count?: number
          group_volume?: number
          id?: string
          period_month: string
          personal_volume?: number
          profile_id: string
          total_team_size?: number
          updated_at?: string
        }
        Update: {
          active_legs?: number
          created_at?: string
          direct_referrals_count?: number
          group_volume?: number
          id?: string
          period_month?: string
          personal_volume?: number
          profile_id?: string
          total_team_size?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "volume_tracking_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vulnerability_findings: {
        Row: {
          affected_component: string | null
          affected_version: string | null
          created_at: string
          cve_id: string | null
          cvss_score: number | null
          description: string | null
          discovered_at: string
          discovered_by: string | null
          domain_id: string | null
          exploit_available: boolean | null
          false_positive: boolean | null
          fix_version: string | null
          fixed_at: string | null
          id: string
          patch_available: boolean | null
          proof_of_concept: string | null
          reference_urls: string[] | null
          remediation: string | null
          severity: string
          status: string
          title: string
          updated_at: string
          verified_at: string | null
        }
        Insert: {
          affected_component?: string | null
          affected_version?: string | null
          created_at?: string
          cve_id?: string | null
          cvss_score?: number | null
          description?: string | null
          discovered_at?: string
          discovered_by?: string | null
          domain_id?: string | null
          exploit_available?: boolean | null
          false_positive?: boolean | null
          fix_version?: string | null
          fixed_at?: string | null
          id?: string
          patch_available?: boolean | null
          proof_of_concept?: string | null
          reference_urls?: string[] | null
          remediation?: string | null
          severity?: string
          status?: string
          title: string
          updated_at?: string
          verified_at?: string | null
        }
        Update: {
          affected_component?: string | null
          affected_version?: string | null
          created_at?: string
          cve_id?: string | null
          cvss_score?: number | null
          description?: string | null
          discovered_at?: string
          discovered_by?: string | null
          domain_id?: string | null
          exploit_available?: boolean | null
          false_positive?: boolean | null
          fix_version?: string | null
          fixed_at?: string | null
          id?: string
          patch_available?: boolean | null
          proof_of_concept?: string | null
          reference_urls?: string[] | null
          remediation?: string | null
          severity?: string
          status?: string
          title?: string
          updated_at?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vulnerability_findings_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "protected_domains"
            referencedColumns: ["id"]
          },
        ]
      }
      vulnerability_templates: {
        Row: {
          id: string
          name: string
          type: string
          severity: string
          cve_id: string | null
          description: string | null
          payloads: string[]
          paths: string[]
          methods: string[]
          headers: Json
          matchers: string[]
          target: string | null
          source_file: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          type: string
          severity: string
          cve_id?: string | null
          description?: string | null
          payloads?: string[]
          paths?: string[]
          methods?: string[]
          headers?: Json
          matchers?: string[]
          target?: string | null
          source_file?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          type?: string
          severity?: string
          cve_id?: string | null
          description?: string | null
          payloads?: string[]
          paths?: string[]
          methods?: string[]
          headers?: Json
          matchers?: string[]
          target?: string | null
          source_file?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      waf_event_logs: {
        Row: {
          country: string | null
          created_at: string
          details: Json | null
          domain_id: string
          event_type: string
          id: string
          request_uri: string | null
          rule_id: string | null
          source_ip: string | null
          threat_type: string | null
          user_agent: string | null
        }
        Insert: {
          country?: string | null
          created_at?: string
          details?: Json | null
          domain_id: string
          event_type: string
          id?: string
          request_uri?: string | null
          rule_id?: string | null
          source_ip?: string | null
          threat_type?: string | null
          user_agent?: string | null
        }
        Update: {
          country?: string | null
          created_at?: string
          details?: Json | null
          domain_id?: string
          event_type?: string
          id?: string
          request_uri?: string | null
          rule_id?: string | null
          source_ip?: string | null
          threat_type?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "waf_event_logs_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "protected_domains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waf_event_logs_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "waf_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      waf_rules: {
        Row: {
          action: string
          blocked_count: number
          created_at: string
          description: string | null
          domain_id: string
          id: string
          is_active: boolean
          last_triggered_at: string | null
          match_field: string
          pattern: string
          priority: number
          rule_name: string
          rule_type: string
          updated_at: string
        }
        Insert: {
          action?: string
          blocked_count?: number
          created_at?: string
          description?: string | null
          domain_id: string
          id?: string
          is_active?: boolean
          last_triggered_at?: string | null
          match_field?: string
          pattern: string
          priority?: number
          rule_name: string
          rule_type?: string
          updated_at?: string
        }
        Update: {
          action?: string
          blocked_count?: number
          created_at?: string
          description?: string | null
          domain_id?: string
          id?: string
          is_active?: boolean
          last_triggered_at?: string | null
          match_field?: string
          pattern?: string
          priority?: number
          rule_name?: string
          rule_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "waf_rules_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "protected_domains"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_transactions: {
        Row: {
          amount: number
          balance_after: number
          created_at: string
          description: string | null
          id: string
          profile_id: string
          reference_id: string | null
          reference_type: string | null
          status: string
          transaction_type: string
          wallet_id: string
        }
        Insert: {
          amount: number
          balance_after?: number
          created_at?: string
          description?: string | null
          id?: string
          profile_id: string
          reference_id?: string | null
          reference_type?: string | null
          status?: string
          transaction_type: string
          wallet_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string
          description?: string | null
          id?: string
          profile_id?: string
          reference_id?: string | null
          reference_type?: string | null
          status?: string
          transaction_type?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_transactions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      wallets: {
        Row: {
          available_balance: number
          created_at: string
          currency: string
          id: string
          pending_balance: number
          profile_id: string
          total_earned: number
          total_withdrawn: number
          updated_at: string
        }
        Insert: {
          available_balance?: number
          created_at?: string
          currency?: string
          id?: string
          pending_balance?: number
          profile_id: string
          total_earned?: number
          total_withdrawn?: number
          updated_at?: string
        }
        Update: {
          available_balance?: number
          created_at?: string
          currency?: string
          id?: string
          pending_balance?: number
          profile_id?: string
          total_earned?: number
          total_withdrawn?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallets_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      withdrawal_requests: {
        Row: {
          account_holder: string | null
          amount: number
          approved_at: string | null
          approved_by: string | null
          bank_name: string | null
          bic: string | null
          created_at: string
          iban: string | null
          id: string
          net_amount: number
          paid_at: string | null
          payment_method: string
          processed_at: string | null
          profile_id: string
          rejection_reason: string | null
          requested_at: string
          status: string
          updated_at: string
          vat_amount: number
          vat_rate: number
          wallet_id: string
        }
        Insert: {
          account_holder?: string | null
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          bank_name?: string | null
          bic?: string | null
          created_at?: string
          iban?: string | null
          id?: string
          net_amount?: number
          paid_at?: string | null
          payment_method?: string
          processed_at?: string | null
          profile_id: string
          rejection_reason?: string | null
          requested_at?: string
          status?: string
          updated_at?: string
          vat_amount?: number
          vat_rate?: number
          wallet_id: string
        }
        Update: {
          account_holder?: string | null
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          bank_name?: string | null
          bic?: string | null
          created_at?: string
          iban?: string | null
          id?: string
          net_amount?: number
          paid_at?: string | null
          payment_method?: string
          processed_at?: string | null
          profile_id?: string
          rejection_reason?: string | null
          requested_at?: string
          status?: string
          updated_at?: string
          vat_amount?: number
          vat_rate?: number
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "withdrawal_requests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "withdrawal_requests_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      zero_trust_policies: {
        Row: {
          action: string
          allowed_countries: string[] | null
          allowed_ip_ranges: string[] | null
          blocked_countries: string[] | null
          conditions: Json | null
          created_at: string
          description: string | null
          domain_id: string | null
          hit_count: number | null
          id: string
          is_active: boolean | null
          last_triggered_at: string | null
          name: string
          policy_type: string
          priority: number | null
          require_device_posture: boolean | null
          require_mfa: boolean | null
          risk_score_threshold: number | null
          session_duration: number | null
          updated_at: string
        }
        Insert: {
          action?: string
          allowed_countries?: string[] | null
          allowed_ip_ranges?: string[] | null
          blocked_countries?: string[] | null
          conditions?: Json | null
          created_at?: string
          description?: string | null
          domain_id?: string | null
          hit_count?: number | null
          id?: string
          is_active?: boolean | null
          last_triggered_at?: string | null
          name: string
          policy_type?: string
          priority?: number | null
          require_device_posture?: boolean | null
          require_mfa?: boolean | null
          risk_score_threshold?: number | null
          session_duration?: number | null
          updated_at?: string
        }
        Update: {
          action?: string
          allowed_countries?: string[] | null
          allowed_ip_ranges?: string[] | null
          blocked_countries?: string[] | null
          conditions?: Json | null
          created_at?: string
          description?: string | null
          domain_id?: string | null
          hit_count?: number | null
          id?: string
          is_active?: boolean | null
          last_triggered_at?: string | null
          name?: string
          policy_type?: string
          priority?: number | null
          require_device_posture?: boolean | null
          require_mfa?: boolean | null
          risk_score_threshold?: number | null
          session_duration?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "zero_trust_policies_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "protected_domains"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calculate_commissions: {
        Args: { p_transaction_id: string }
        Returns: number
      }
      check_is_admin: { Args: never; Returns: boolean }
      check_scan_rate_limit: { Args: { _network_hash: string }; Returns: Json }
      generate_rotating_code: { Args: never; Returns: string }
      get_profile_id: { Args: { _auth_user_id: string }; Returns: string }
      get_user_call_center_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_admin_user: { Args: never; Returns: boolean }
      is_callcenter: { Args: never; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      promote_to_partner: { Args: { _profile_id: string }; Returns: boolean }
      validate_promo_code: { Args: { _code: string }; Returns: Json }
    }
    Enums: {
      app_role: "admin" | "partner" | "customer" | "super_admin" | "callcenter"
      commission_status: "pending" | "approved" | "paid" | "cancelled"
      commission_type: "fixed" | "percentage"
      pool_level: "business_partner_plus" | "national_partner" | "world_partner"
      transaction_status: "pending" | "completed" | "failed" | "refunded"
      user_role: "admin" | "partner" | "customer"
      user_status: "pending" | "active" | "suspended" | "cancelled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "partner", "customer", "super_admin", "callcenter"],
      commission_status: ["pending", "approved", "paid", "cancelled"],
      commission_type: ["fixed", "percentage"],
      pool_level: [
        "business_partner_plus",
        "national_partner",
        "world_partner",
      ],
      transaction_status: ["pending", "completed", "failed", "refunded"],
      user_role: ["admin", "partner", "customer"],
      user_status: ["pending", "active", "suspended", "cancelled"],
    },
  },
} as const
