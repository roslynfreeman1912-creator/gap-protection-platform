-- GAP Protection Database Initialization Script
-- Run this after creating the database

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create protected_domains table
CREATE TABLE IF NOT EXISTS protected_domains (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
    domain TEXT NOT NULL UNIQUE,
    origin_ip TEXT NOT NULL,
    proxy_ip TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    waf_enabled BOOLEAN NOT NULL DEFAULT true,
    ddos_protection BOOLEAN NOT NULL DEFAULT true,
    bot_protection BOOLEAN NOT NULL DEFAULT true,
    rate_limit INTEGER NOT NULL DEFAULT 1000,
    blocked_requests INTEGER NOT NULL DEFAULT 0,
    total_requests INTEGER NOT NULL DEFAULT 0,
    ssl_enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create waf_rules table
CREATE TABLE IF NOT EXISTS waf_rules (
    id VARCHAR PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    pattern TEXT NOT NULL,
    action TEXT NOT NULL DEFAULT 'block',
    enabled BOOLEAN NOT NULL DEFAULT true,
    hits INTEGER NOT NULL DEFAULT 0
);

-- Create ip_list table
CREATE TABLE IF NOT EXISTS ip_list (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
    ip TEXT NOT NULL,
    type TEXT NOT NULL,
    reason TEXT NOT NULL DEFAULT 'Manual entry',
    added_at TIMESTAMP NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP,
    hits INTEGER NOT NULL DEFAULT 0
);

-- Create geo_rules table
CREATE TABLE IF NOT EXISTS geo_rules (
    id VARCHAR PRIMARY KEY,
    country_code TEXT NOT NULL,
    country_name TEXT NOT NULL,
    action TEXT NOT NULL DEFAULT 'block',
    enabled BOOLEAN NOT NULL DEFAULT true
);

-- Create rate_limit_rules table
CREATE TABLE IF NOT EXISTS rate_limit_rules (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name TEXT NOT NULL,
    path TEXT NOT NULL,
    requests_per_minute INTEGER NOT NULL DEFAULT 100,
    block_duration INTEGER NOT NULL DEFAULT 60,
    enabled BOOLEAN NOT NULL DEFAULT true,
    triggered INTEGER NOT NULL DEFAULT 0
);

-- Create security_headers table
CREATE TABLE IF NOT EXISTS security_headers (
    id VARCHAR PRIMARY KEY,
    name TEXT NOT NULL,
    value TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    description TEXT NOT NULL
);

-- Create brute_force_rules table
CREATE TABLE IF NOT EXISTS brute_force_rules (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name TEXT NOT NULL,
    path TEXT NOT NULL,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    lockout_duration INTEGER NOT NULL DEFAULT 900,
    enabled BOOLEAN NOT NULL DEFAULT true,
    blocked INTEGER NOT NULL DEFAULT 0
);

-- Create honeypots table
CREATE TABLE IF NOT EXISTS honeypots (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
    path TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'admin',
    enabled BOOLEAN NOT NULL DEFAULT true,
    hits INTEGER NOT NULL DEFAULT 0
);

-- Create scan_results table (for persistence)
CREATE TABLE IF NOT EXISTS scan_results (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
    target_url TEXT NOT NULL,
    client_name TEXT,
    scan_date TIMESTAMP NOT NULL DEFAULT NOW(),
    risk_score DECIMAL(3,1),
    vulnerabilities_found INTEGER DEFAULT 0,
    report_path TEXT,
    scan_data JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_protected_domains_domain ON protected_domains(domain);
CREATE INDEX IF NOT EXISTS idx_ip_list_ip ON ip_list(ip);
CREATE INDEX IF NOT EXISTS idx_scan_results_target ON scan_results(target_url);
CREATE INDEX IF NOT EXISTS idx_scan_results_date ON scan_results(scan_date DESC);

-- Insert default security headers
INSERT INTO security_headers (id, name, value, enabled, description) VALUES
    ('csp', 'Content-Security-Policy', 'default-src ''self''', true, 'Prevents XSS attacks'),
    ('xfo', 'X-Frame-Options', 'DENY', true, 'Prevents clickjacking'),
    ('xcto', 'X-Content-Type-Options', 'nosniff', true, 'Prevents MIME sniffing'),
    ('hsts', 'Strict-Transport-Security', 'max-age=31536000; includeSubDomains', true, 'Forces HTTPS'),
    ('rp', 'Referrer-Policy', 'strict-origin-when-cross-origin', true, 'Controls referrer information')
ON CONFLICT (id) DO NOTHING;

COMMIT;
