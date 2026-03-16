#!/usr/bin/env python3
"""
Deploy REAL WAF & Security Configuration to Nginx
- Removes duplicate zone defs (uses nginx.conf zones)
- Adds WAF maps, bot blocking, attack pattern blocking
- Adds fail2ban, SSH hardening
"""
import paramiko
import sys

HOST = "76.13.5.114"
USER = "root"
PASS = "galal123.DE12"

# =============================================================================
# NGINX.CONF replacement (http level) - with corrected zones
# =============================================================================
NGINX_CONF_PATCH = r"""
# --- Rate Limiting Zones ---
limit_req_zone $binary_remote_addr zone=general:20m rate=30r/s;
limit_req_zone $binary_remote_addr zone=auth:10m rate=5r/m;
limit_req_zone $binary_remote_addr zone=api:10m rate=60r/s;
limit_req_zone $binary_remote_addr zone=login:10m rate=5r/m;
limit_req_zone $binary_remote_addr zone=scanner:10m rate=10r/s;

# --- Connection Limiting (DDoS Protection) ---
limit_conn_zone $binary_remote_addr zone=conn_per_ip:10m;
limit_conn_zone $server_name zone=conn_per_server:10m;

# Rate limit response
limit_req_status 429;
limit_conn_status 429;

# --- Request Size & Timeout Limits ---
client_max_body_size 10m;
client_body_buffer_size 128k;
client_header_buffer_size 1k;
large_client_header_buffers 4 8k;
client_body_timeout 10s;
client_header_timeout 10s;
send_timeout 10s;
"""

# =============================================================================
# WAF MAPS (goes into conf.d - NO zone definitions here)
# =============================================================================
WAF_MAPS_CONF = r"""
# ===============================================================
# GAP SHIELD WAF - Real Attack Pattern Blocking
# (maps only - no http-level directives here)
# ===============================================================

# Block known malicious user agents
map $http_user_agent $bad_bot {
    default 0;
    ~*sqlmap 1;
    ~*nikto 1;
    ~*nmap 1;
    ~*masscan 1;
    ~*dirbuster 1;
    ~*gobuster 1;
    ~*wpscan 1;
    ~*burpsuite 1;
    ~*acunetix 1;
    ~*nessus 1;
    ~*openvas 1;
    ~*w3af 1;
    ~*skipfish 1;
    ~*havij 1;
    ~*zmeu 1;
    ~*morfeus 1;
    ~*python-requests 1;
    ~*python-urllib 1;
    ~*libwww-perl 1;
    ~*Scrapy 1;
    ~*HTTrack 1;
    ~*BLEXBot 1;
    ~*DotBot 1;
    ~*SemrushBot 1;
    ~*AhrefsBot 1;
    ~*MJ12bot 1;
    ~*GPTBot 1;
    ~*ChatGPT-User 1;
    ~*CCBot 1;
    ~*anthropic-ai 1;
    ~*ClaudeBot 1;
    ~*Bytespider 1;
    ~*PetalBot 1;
    ~*DataForSeoBot 1;
}

# Block empty user agents
map $http_user_agent $empty_ua {
    default 0;
    "" 1;
}

# WAF: Block SQLi patterns in URI
map $request_uri $sqli_attack {
    default 0;
    ~*union.*select 1;
    ~*select.*from 1;
    ~*insert.*into 1;
    ~*update.*set 1;
    ~*delete.*from 1;
    ~*drop.*(table|database) 1;
    ~*alter.*table 1;
    ~*xp_cmdshell 1;
    ~*benchmark\s*\( 1;
    ~*sleep\s*\( 1;
    ~*waitfor\s+delay 1;
    ~*sp_executesql 1;
    ~*information_schema 1;
    ~*sysobjects 1;
    ~*/\*.*\*/ 1;
}

# WAF: Block XSS patterns in URI
map $request_uri $xss_attack {
    default 0;
    ~*<script 1;
    ~*</script 1;
    ~*javascript\s*: 1;
    ~*vbscript\s*: 1;
    ~*eval\s*\( 1;
    ~*alert\s*\( 1;
    ~*document\.(cookie|write|location) 1;
    ~*window\.(location|open) 1;
    ~*%3Cscript 1;
    ~*%3C%2Fscript 1;
    ~*%3Csvg 1;
    ~*<svg.*onload 1;
    ~*<img.*onerror 1;
    ~*<iframe 1;
    ~*<object 1;
    ~*<embed 1;
}

# WAF: Block path traversal & LFI
map $request_uri $lfi_attack {
    default 0;
    ~*\.\./ 1;
    ~*\.\.%2f 1;
    ~*%2e%2e%2f 1;
    ~*%2e%2e/ 1;
    ~*/etc/(passwd|shadow|hosts) 1;
    ~*/proc/(self|version) 1;
    ~*/var/log/ 1;
    ~*boot\.ini 1;
    ~*win\.ini 1;
}

# WAF: Block RCE / Command Injection / Log4Shell
map $request_uri $rce_attack {
    default 0;
    ~*\$\{jndi: 1;
    ~*\$\{lower: 1;
    ~*\$\{upper: 1;
    ~*\$\{env: 1;
    ~*class\.module\.classLoader 1;
    ~*bash\s+-i 1;
    ~*/dev/tcp/ 1;
}

# WAF: Block SSRF
map $request_uri $ssrf_attack {
    default 0;
    ~*169\.254\.169\.254 1;
    ~*metadata\.google\.internal 1;
    ~*metadata\.azure\.com 1;
}

# WAF: Block webshells & crypto miners
map $request_uri $malware_attack {
    default 0;
    ~*c99 1;
    ~*r57 1;
    ~*b374k 1;
    ~*web_shell 1;
    ~*coinhive 1;
    ~*cryptonight 1;
    ~*coin-hive 1;
    ~*jsecoin 1;
}
"""

# =============================================================================
# SITE CONFIG with REAL WAF enforcement
# =============================================================================
SITE_CONF = r"""
# === HTTP -> HTTPS Redirect ===
server {
    listen 80;
    server_name gapprotectionltd.com www.gapprotectionltd.com;
    return 301 https://gapprotectionltd.com$request_uri;
}

# === WWW -> non-WWW Redirect ===
server {
    listen 443 ssl http2;
    server_name www.gapprotectionltd.com;

    ssl_certificate /etc/letsencrypt/live/gapprotectionltd.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/gapprotectionltd.com/privkey.pem;

    return 301 https://gapprotectionltd.com$request_uri;
}

# === Main HTTPS Server with REAL WAF ===
server {
    listen 443 ssl http2;
    server_name gapprotectionltd.com;
    root /var/www/gapprotectionltd;
    index index.html;

    # === SSL ===
    ssl_certificate /etc/letsencrypt/live/gapprotectionltd.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/gapprotectionltd.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers "EECDH+CHACHA20:EECDH+AESGCM:EDH+AESGCM:AES256+EECDH:AES256+EDH";
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;
    ssl_stapling on;
    ssl_stapling_verify on;
    resolver 1.1.1.1 8.8.8.8 valid=300s;
    resolver_timeout 5s;

    # === HIDE SERVER IDENTITY ===
    server_tokens off;
    more_clear_headers Server;
    more_clear_headers X-Powered-By;
    more_clear_headers X-Runtime;
    more_clear_headers X-Version;
    more_clear_headers X-AspNet-Version;
    more_clear_headers X-AspNetMvc-Version;

    # ===================================================
    # REAL WAF ENFORCEMENT - Pattern-based blocking
    # ===================================================

    # Block bad bots / scanners
    if ($bad_bot) { return 403; }

    # Block empty user agents
    if ($empty_ua) { return 403; }

    # Block SQL Injection
    if ($sqli_attack) { return 403; }

    # Block XSS
    if ($xss_attack) { return 403; }

    # Block LFI / Path Traversal
    if ($lfi_attack) { return 403; }

    # Block RCE / Command Injection / Log4Shell
    if ($rce_attack) { return 403; }

    # Block SSRF
    if ($ssrf_attack) { return 403; }

    # Block Malware / Webshells
    if ($malware_attack) { return 403; }

    # Block dangerous HTTP methods
    if ($request_method !~ ^(GET|HEAD|POST|OPTIONS)$) { return 405; }

    # === DDoS Protection ===
    limit_conn conn_per_ip 50;
    limit_conn conn_per_server 2000;
    limit_req zone=general burst=50 nodelay;

    # ===================================================
    # SECURITY HEADERS (complete set)
    # ===================================================
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://www.google-analytics.com https://pqnzsihfryjnnhdubisk.supabase.co; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; connect-src 'self' https://pqnzsihfryjnnhdubisk.supabase.co wss://pqnzsihfryjnnhdubisk.supabase.co https://openrouter.ai https://api.groq.com https://integrate.api.nvidia.com https://www.google-analytics.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests;" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=(), display-capture=(), autoplay=(), fullscreen=(self), picture-in-picture=(self)" always;
    add_header Cross-Origin-Embedder-Policy "credentialless" always;
    add_header Cross-Origin-Opener-Policy "same-origin" always;
    add_header Cross-Origin-Resource-Policy "same-origin" always;
    add_header X-Permitted-Cross-Domain-Policies "none" always;
    add_header X-Download-Options "noopen" always;
    add_header X-DNS-Prefetch-Control "off" always;
    add_header Expect-CT "max-age=86400, enforce" always;
    add_header Feature-Policy "camera 'none'; microphone 'none'; geolocation 'none'" always;
    add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate" always;
    add_header Pragma "no-cache" always;

    # ===================================================
    # BLOCK SENSITIVE FILES & PATHS
    # ===================================================
    location ~ /\.(?!well-known) { deny all; return 404; }
    location ~* \.(env|git|gitignore|htaccess|htpasswd|ini|log|sh|sql|bak|swp|py|php|rb|pl|cgi|config|yml|yaml|toml|lock)$ { deny all; return 404; }
    location ~* ^/(wp-admin|wp-login|wp-content|wp-includes|xmlrpc|phpmyadmin|admin\.php|\.env|package\.json|node_modules|\.git|composer\.json|Dockerfile|docker-compose|Makefile|\.vscode|\.idea|cgi-bin|server-status|server-info|elmah\.axd|phpinfo|\.svn|\.hg|\.DS_Store) { deny all; return 404; }
    location ~* ^/(shell|cmd|command|exec|system|eval|phpunit|vendor/phpunit|config\.php|setup\.php|install\.php|test\.php) { deny all; return 404; }

    # ===================================================
    # RATE-LIMITED ENDPOINTS
    # ===================================================
    location = /auth {
        limit_req zone=login burst=3 nodelay;
        try_files /index.html =404;
    }
    location = /register {
        limit_req zone=login burst=3 nodelay;
        try_files /index.html =404;
    }

    # ===================================================
    # STATIC ASSETS
    # ===================================================
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header Cross-Origin-Resource-Policy "same-origin" always;
        access_log off;
        try_files $uri =404;
    }

    location = /robots.txt { try_files $uri =404; access_log off; }
    location = /favicon.ico { try_files $uri =404; log_not_found off; access_log off; }
    location = /favicon.png { try_files $uri =404; log_not_found off; access_log off; }
    location = /sitemap.xml { try_files $uri =404; access_log off; }

    # ===================================================
    # SPA ROUTES
    # ===================================================
    location = / { try_files /index.html =404; }
    location = /contact { try_files /index.html =404; }
    location = /promo-display { try_files /index.html =404; }
    location = /security-test { try_files /index.html =404; }
    location ~ ^/legal/[a-z-]+$ { try_files /index.html =404; }
    location = /dashboard { try_files /index.html =404; }
    location = /admin { try_files /index.html =404; }
    location = /accounting { try_files /index.html =404; }
    location = /security-dashboard { try_files /index.html =404; }
    location = /callcenter { try_files /index.html =404; }

    # === Custom Error Pages ===
    error_page 403 @waf_blocked;
    error_page 429 @rate_limited;

    location @waf_blocked {
        default_type text/html;
        return 403 '<!DOCTYPE html><html><head><title>Blocked</title><style>body{background:#0a0a0a;color:#fff;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;font-family:system-ui}div{text-align:center}.icon{font-size:4em;margin-bottom:20px}h1{color:#ef4444;font-size:2em;margin:0}p{color:#666;margin-top:10px}.ref{color:#333;font-size:0.7em;margin-top:30px}</style></head><body><div><div class="icon">&#128737;</div><h1>Access Denied</h1><p>This request has been blocked by the security system.</p><p class="ref">Event ID: WAF-${request_id}</p></div></body></html>';
    }

    location @rate_limited {
        default_type text/html;
        return 429 '<!DOCTYPE html><html><head><title>Rate Limited</title><style>body{background:#0a0a0a;color:#fff;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;font-family:system-ui}div{text-align:center}.icon{font-size:4em;margin-bottom:20px}h1{color:#f59e0b;font-size:2em;margin:0}p{color:#666;margin-top:10px}</style></head><body><div><div class="icon">&#9201;</div><h1>Rate Limited</h1><p>Too many requests. Please wait and try again.</p></div></body></html>';
    }

    # === DEFAULT: 404 ===
    location / { return 404; }
}
"""

def run_cmd(client, cmd, check=True):
    print(f"  $ {cmd}")
    stdin, stdout, stderr = client.exec_command(cmd, timeout=300)
    rc = stdout.channel.recv_exit_status()
    out = stdout.read().decode("utf-8", errors="replace").strip()
    err = stderr.read().decode("utf-8", errors="replace").strip()
    if out:
        for line in out.split('\n')[:10]:
            print(f"    {line}")
    if err and rc != 0:
        for line in err.split('\n')[:5]:
            print(f"    ERR: {line}")
    return rc, out, err

def main():
    print("=" * 60)
    print("  REAL WAF & SECURITY DEPLOYMENT v2")
    print("  Target: gapprotectionltd.com")
    print("=" * 60)

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"\n[*] Connecting to {HOST}...")
    client.connect(HOST, username=USER, password=PASS)
    print("[OK] Connected!\n")
    sftp = client.open_sftp()

    # Step 1: Update nginx.conf - replace old zone definitions
    print("[1/6] Updating nginx.conf rate limit zones...")
    # Read current nginx.conf
    with sftp.file('/etc/nginx/nginx.conf', 'r') as f:
        nginx_conf = f.read().decode()

    # Remove old zone lines and insert new ones
    lines = nginx_conf.split('\n')
    new_lines = []
    zones_inserted = False
    for line in lines:
        if 'limit_req_zone' in line or 'limit_conn_zone' in line or 'limit_req_status' in line or 'limit_conn_status' in line or 'client_max_body_size' in line or 'client_body_buffer_size' in line or 'client_header_buffer_size' in line or 'large_client_header_buffers' in line or 'client_body_timeout' in line or 'client_header_timeout' in line or 'send_timeout' in line:
            if not zones_inserted:
                new_lines.append(NGINX_CONF_PATCH)
                zones_inserted = True
            # Skip the old line
            continue
        new_lines.append(line)

    if not zones_inserted:
        # Insert after http { line
        final_lines = []
        for line in new_lines:
            final_lines.append(line)
            if line.strip().startswith('http {') or line.strip() == 'http {':
                final_lines.append(NGINX_CONF_PATCH)
        new_lines = final_lines

    with sftp.file('/etc/nginx/nginx.conf', 'w') as f:
        f.write('\n'.join(new_lines))
    print("  [OK] nginx.conf updated with new zones")

    # Step 2: Write WAF maps config
    print("\n[2/6] Deploying WAF pattern maps...")
    with sftp.file('/etc/nginx/conf.d/security-waf.conf', 'w') as f:
        f.write(WAF_MAPS_CONF)
    print("  [OK] security-waf.conf written")

    # Step 3: Write site config
    print("\n[3/6] Deploying site config with WAF enforcement...")
    with sftp.file('/etc/nginx/sites-enabled/gapprotectionltd.com', 'w') as f:
        f.write(SITE_CONF)
    print("  [OK] site config written")

    # Step 4: Configure fail2ban
    print("\n[4/6] Configuring fail2ban...")
    fail2ban_conf = """[nginx-req-limit]
enabled = true
filter = nginx-req-limit
action = iptables-multiport[name=ReqLimit, port="http,https", protocol=tcp]
logpath = /var/log/nginx/error.log
findtime = 600
bantime = 3600
maxretry = 10
"""
    nginx_filter = """[Definition]
failregex = limiting requests, excess:.* by zone.*client: <HOST>
ignoreregex =
"""
    with sftp.file('/etc/fail2ban/jail.d/nginx-waf.conf', 'w') as f:
        f.write(fail2ban_conf)
    with sftp.file('/etc/fail2ban/filter.d/nginx-req-limit.conf', 'w') as f:
        f.write(nginx_filter)
    run_cmd(client, "systemctl restart fail2ban 2>/dev/null || true", check=False)
    print("  [OK] fail2ban configured")

    # Step 5: Test nginx config
    print("\n[5/6] Testing nginx configuration...")
    rc, out, err = run_cmd(client, "nginx -t 2>&1")
    if 'test is successful' not in out and rc != 0:
        print(f"  [!] Config test issue, checking...")
        # Fix more_clear_headers if module not loaded
        if 'more_clear_headers' in out + err or 'unknown directive' in out + err:
            print("  [*] Fixing: headers-more issue, removing directives...")
            run_cmd(client, r"sed -i '/more_clear_headers/d' /etc/nginx/sites-enabled/gapprotectionltd.com")
            rc2, out2, _ = run_cmd(client, "nginx -t 2>&1")
            if 'test is successful' not in out2 and rc2 != 0:
                print("  [FAIL] Still failing. Check manually.")
                sftp.close()
                client.close()
                return False
        else:
            print(f"  [FAIL] Unknown error: {out}")
            sftp.close()
            client.close()
            return False

    # Step 6: Reload nginx
    print("\n[6/6] Reloading nginx...")
    run_cmd(client, "systemctl reload nginx")
    
    # Verify
    print("\n[*] Verifying deployment...")
    rc, out, _ = run_cmd(client, "curl -s -o /dev/null -w '%{http_code}' https://gapprotectionltd.com/")
    print(f"  Site: HTTP {out}")

    rc, out, _ = run_cmd(client, "curl -s -o /dev/null -w '%{http_code}' 'https://gapprotectionltd.com/?id=1+UNION+SELECT+*+FROM+users'")
    print(f"  SQLi test: HTTP {out} (expect 403)")

    rc, out, _ = run_cmd(client, "curl -s -o /dev/null -w '%{http_code}' 'https://gapprotectionltd.com/?q=%3Cscript%3Ealert(1)%3C/script%3E'")
    print(f"  XSS test: HTTP {out} (expect 403)")

    rc, out, _ = run_cmd(client, "curl -s -o /dev/null -w '%{http_code}' 'https://gapprotectionltd.com/../../../../etc/passwd'")
    print(f"  LFI test: HTTP {out} (expect 403)")

    rc, out, _ = run_cmd(client, "curl -s -o /dev/null -w '%{http_code}' -A 'sqlmap/1.0' 'https://gapprotectionltd.com/'")
    print(f"  Bot test: HTTP {out} (expect 403)")

    rc, out, _ = run_cmd(client, "curl -s -o /dev/null -w '%{http_code}' -A '' 'https://gapprotectionltd.com/'")
    print(f"  Empty UA: HTTP {out} (expect 403)")

    rc, out, _ = run_cmd(client, "curl -sI https://gapprotectionltd.com/ 2>/dev/null | head -25")
    
    sftp.close()
    client.close()

    print("\n" + "=" * 60)
    print("  REAL WAF DEPLOYMENT COMPLETE!")
    print("=" * 60)
    return True

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
