import paramiko

HOST = '76.13.5.114'
USER = 'root'
PASS = 'galal123.DE12'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=10)

def run(cmd):
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=30)
    return (stdout.read().decode() + stderr.read().decode()).strip()

# ═══════════════════════════════════════════════════════════════
# 1) FIX NGINX.CONF — Remove TLSv1/1.1, add gzip, security
# ═══════════════════════════════════════════════════════════════
NGINX_CONF = r'''user www-data;
worker_processes auto;
pid /run/nginx.pid;
include /etc/nginx/modules-enabled/*.conf;

events {
    worker_connections 1024;
    multi_accept on;
}

http {
    # ═══ Rate limiting zones ═══
    limit_req_zone $binary_remote_addr zone=general:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=auth:10m rate=5r/m;
    limit_req_zone $binary_remote_addr zone=api:10m rate=30r/s;

    # ═══ Basic Settings ═══
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;
    client_max_body_size 10m;
    server_tokens off;
    more_clear_headers Server;

    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # ═══ SSL Settings (TLSv1.2+ only) ═══
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers "EECDH+AESGCM:EDH+AESGCM:AES256+EECDH:AES256+EDH";
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;

    # ═══ Logging ═══
    access_log /var/log/nginx/access.log;
    error_log /var/log/nginx/error.log;

    # ═══ Gzip Compression ═══
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_buffers 16 8k;
    gzip_http_version 1.1;
    gzip_min_length 256;
    gzip_types
        text/plain
        text/css
        text/xml
        text/javascript
        application/json
        application/javascript
        application/xml
        application/xml+rss
        application/x-javascript
        image/svg+xml
        font/woff2;

    # ═══ Virtual Host Configs ═══
    include /etc/nginx/conf.d/*.conf;
    include /etc/nginx/sites-enabled/*;
}
'''

# ═══════════════════════════════════════════════════════════════
# 2) SITE CONFIG — Full security headers + hardening
# ═══════════════════════════════════════════════════════════════
SITE_CONF = r'''# ═══ HTTP → HTTPS Redirect ═══
server {
    listen 80;
    server_name gapprotectionltd.com www.gapprotectionltd.com;
    return 301 https://gapprotectionltd.com$request_uri;
}

# ═══ WWW → non-WWW Redirect ═══
server {
    listen 443 ssl http2;
    server_name www.gapprotectionltd.com;

    ssl_certificate /etc/letsencrypt/live/gapprotectionltd.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/gapprotectionltd.com/privkey.pem;

    return 301 https://gapprotectionltd.com$request_uri;
}

# ═══ Main HTTPS Server ═══
server {
    listen 443 ssl http2;
    server_name gapprotectionltd.com;
    root /var/www/gapprotectionltd;
    index index.html;

    # ═══ SSL ═══
    ssl_certificate /etc/letsencrypt/live/gapprotectionltd.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/gapprotectionltd.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers "EECDH+AESGCM:EDH+AESGCM:AES256+EECDH:AES256+EDH";
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;

    # ═══ Hide server info ═══
    server_tokens off;

    # ═══════════════════════════════════════════════
    # SECURITY HEADERS (comprehensive)
    # ═══════════════════════════════════════════════

    # HSTS — force HTTPS for 2 years + preload
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;

    # Content-Security-Policy — strict CSP
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://www.google-analytics.com https://pqnzsihfryjnnhdubisk.supabase.co; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; connect-src 'self' https://pqnzsihfryjnnhdubisk.supabase.co wss://pqnzsihfryjnnhdubisk.supabase.co https://openrouter.ai https://api.groq.com https://integrate.api.nvidia.com https://www.google-analytics.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests;" always;

    # Clickjacking protection
    add_header X-Frame-Options "DENY" always;

    # MIME-Sniffing protection
    add_header X-Content-Type-Options "nosniff" always;

    # XSS Protection (legacy browsers)
    add_header X-XSS-Protection "1; mode=block" always;

    # Referrer-Policy
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Permissions-Policy — disable all dangerous APIs
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=(), display-capture=(), autoplay=(), fullscreen=(self), picture-in-picture=(self)" always;

    # Cross-Origin Isolation
    add_header Cross-Origin-Embedder-Policy "credentialless" always;
    add_header Cross-Origin-Opener-Policy "same-origin" always;
    add_header Cross-Origin-Resource-Policy "same-origin" always;

    # Miscellaneous security
    add_header X-Permitted-Cross-Domain-Policies "none" always;
    add_header X-Download-Options "noopen" always;
    add_header X-DNS-Prefetch-Control "off" always;

    # No caching for HTML (SPA)
    add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate" always;
    add_header Pragma "no-cache" always;

    # ═══════════════════════════════════════════════
    # BLOCK SENSITIVE FILES & PATHS
    # ═══════════════════════════════════════════════

    # Block dotfiles (except .well-known for ACME)
    location ~ /\.(?!well-known) {
        deny all;
        return 404;
    }

    # Block sensitive file extensions
    location ~* \.(env|git|gitignore|htaccess|htpasswd|ini|log|sh|sql|bak|swp|py|php|rb|pl|cgi)$ {
        deny all;
        return 404;
    }

    # Block known sensitive paths
    location ~* ^/(wp-admin|wp-login|wp-content|xmlrpc|phpmyadmin|admin\.php|\.env|package\.json|node_modules|\.git|composer\.json|Dockerfile|docker-compose|Makefile|\.vscode|\.idea) {
        deny all;
        return 404;
    }

    # ═══════════════════════════════════════════════
    # STATIC ASSETS — Long cache + security headers
    # ═══════════════════════════════════════════════
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header Cross-Origin-Resource-Policy "same-origin" always;
        access_log off;
        try_files $uri =404;
    }

    # ═══ Known static files ═══
    location = /robots.txt { try_files $uri =404; access_log off; }
    location = /favicon.ico { try_files $uri =404; log_not_found off; access_log off; }
    location = /favicon.png { try_files $uri =404; log_not_found off; access_log off; }
    location = /sitemap.xml { try_files $uri =404; access_log off; }

    # ═══════════════════════════════════════════════
    # SPA ROUTES (Whitelist)
    # ═══════════════════════════════════════════════

    # Public routes
    location = / { try_files /index.html =404; }
    location = /auth { try_files /index.html =404; }
    location = /register { try_files /index.html =404; }
    location = /contact { try_files /index.html =404; }
    location = /promo-display { try_files /index.html =404; }

    # Legal routes
    location ~ ^/legal/[a-z-]+$ { try_files /index.html =404; }

    # Authenticated routes
    location = /dashboard { try_files /index.html =404; }
    location = /admin { try_files /index.html =404; }
    location = /accounting { try_files /index.html =404; }
    location = /security-dashboard { try_files /index.html =404; }
    location = /security-test { try_files /index.html =404; }
    location = /callcenter { try_files /index.html =404; }

    # ═══ DEFAULT: 404 for all other paths ═══
    location / {
        return 404;
    }
}
'''

# ═══════════════════════════════════════════════════════════════
# APPLY CHANGES
# ═══════════════════════════════════════════════════════════════

sftp = ssh.open_sftp()

# Backup originals
run("cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.bak.$(date +%s)")
run("cp /etc/nginx/sites-available/gapprotectionltd.com /etc/nginx/sites-available/gapprotectionltd.com.bak.$(date +%s)")

# Check if more_clear_headers module is available
has_more_headers = 'ngx_http_headers_more' in run("nginx -V 2>&1")
print(f"headers-more module: {'YES' if has_more_headers else 'NO'}")

if not has_more_headers:
    # Remove more_clear_headers line
    NGINX_CONF = NGINX_CONF.replace('    more_clear_headers Server;\n', '')

# Write nginx.conf
with sftp.open('/etc/nginx/nginx.conf', 'w') as f:
    f.write(NGINX_CONF)
print("Wrote nginx.conf")

# Write site config
with sftp.open('/etc/nginx/sites-available/gapprotectionltd.com', 'w') as f:
    f.write(SITE_CONF)
print("Wrote site config")

sftp.close()

# Test & reload
result = run("nginx -t 2>&1")
print(f"nginx -t: {result}")

if "syntax is ok" in result and "test is successful" in result:
    print("Config valid! Reloading...")
    print(run("systemctl reload nginx 2>&1"))
    print("Nginx reloaded!")
    
    # Verify headers
    print("\n=== HEADER TEST ===")
    print(run("curl -sI https://gapprotectionltd.com/ 2>/dev/null | head -40"))
else:
    print("CONFIG ERROR! Restoring backup...")
    run("cp /etc/nginx/nginx.conf.bak.* /etc/nginx/nginx.conf 2>/dev/null")
    run("cp /etc/nginx/sites-available/gapprotectionltd.com.bak.* /etc/nginx/sites-available/gapprotectionltd.com 2>/dev/null")
    run("nginx -t && systemctl reload nginx")
    print("Restored backup")

ssh.close()
print("\nDone!")
