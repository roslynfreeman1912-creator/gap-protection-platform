import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('76.13.5.114', username='root', password='galal123.DE12')

# Complete Nginx config with ALL security headers
nginx_gapprotection = r'''server {
    listen 80;
    server_name gapprotectionltd.com www.gapprotectionltd.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name gapprotectionltd.com www.gapprotectionltd.com;
    root /var/www/gapprotectionltd;
    index index.html;

    ssl_certificate /etc/letsencrypt/live/gapprotectionltd.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/gapprotectionltd.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # ===== SECURITY HEADERS =====
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://www.google-analytics.com https://pqnzsihfryjnnhdubisk.supabase.co https://translate.google.com https://translate.googleapis.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://www.gstatic.com https://translate.googleapis.com; style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com https://www.gstatic.com https://translate.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; connect-src 'self' https://pqnzsihfryjnnhdubisk.supabase.co wss://pqnzsihfryjnnhdubisk.supabase.co https://openrouter.ai https://api.groq.com https://integrate.api.nvidia.com https://www.google-analytics.com https://translate.googleapis.com; frame-ancestors 'self'; base-uri 'self'; form-action 'self';" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()" always;
    add_header X-Permitted-Cross-Domain-Policies "none" always;
    add_header X-Download-Options "noopen" always;
    add_header X-DNS-Prefetch-Control "off" always;
    add_header Cross-Origin-Embedder-Policy "credentialless" always;
    add_header Cross-Origin-Opener-Policy "same-origin" always;
    add_header Cross-Origin-Resource-Policy "same-origin" always;
    add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate" always;
    add_header Pragma "no-cache" always;

    # ===== HIDE SERVER VERSION =====
    server_tokens off;

    # ===== BLOCK SENSITIVE FILES =====
    location ~ /\. {
        deny all;
        return 404;
    }
    location ~ \.(env|git|svn|htaccess|htpasswd|DS_Store|sql|db|sqlite|bak|backup|old|orig|swp|log|conf|cfg|ini|yml|yaml|toml|lock|key|pem|crt)$ {
        deny all;
        return 404;
    }
    location ~ ^/(backup|backups|temp|tmp|old|bak|test|testing|dev|development|staging|debug|trace|logs|error|errors|cgi-bin|cgi|scripts|includes|inc)(/|$) {
        deny all;
        return 404;
    }
    location ~ ^/(phpmyadmin|pma|phpMyAdmin|adminer|pgadmin|mysql|sql|dbadmin|db-admin|database|mongo|redis|webmin|plesk|cpanel|directadmin)(/|$) {
        deny all;
        return 404;
    }
    location ~ ^/(wp-admin|wp-login|wp-content|wp-includes|xmlrpc|wordpress|joomla|drupal|magento|opencart|prestashop)(/|$) {
        deny all;
        return 404;
    }
    location ~ ^/(actuator|spring|jenkins|gitlab|graphql|graphiql|swagger|api-docs|telescope|horizon|nova|debugbar|_profiler|_wdt|gii|sidekiq)(/|$) {
        deny all;
        return 404;
    }
    location ~ ^/(server-status|server-info|nginx-status|id_rsa|id_dsa|id_ecdsa|id_ed25519|private\.key|public\.key|server\.key|server\.crt|certificate)(/|$) {
        deny all;
        return 404;
    }
    location ~ ^/(\.aws|\.azure|\.docker|\.ssh|\.vscode|\.idea|nbproject|terraform|ansible|vault|consul)(/|$) {
        deny all;
        return 404;
    }
    location = /robots.txt {
        allow all;
    }
    location = /favicon.ico {
        allow all;
        log_not_found off;
        access_log off;
    }

    # ===== RATE LIMITING =====
    limit_req_zone $binary_remote_addr zone=general:10m rate=10r/s;
    
    # ===== STATIC ASSETS CACHING =====
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable" always;
        add_header X-Content-Type-Options "nosniff" always;
    }

    # ===== SPA FALLBACK =====
    location / {
        try_files $uri $uri/ /index.html;
    }
}
'''

nginx_gapprotection_pro = r'''server {
    listen 80;
    server_name gap-protection.pro www.gap-protection.pro;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name gap-protection.pro www.gap-protection.pro;

    ssl_certificate /etc/letsencrypt/live/gap-protection.pro/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/gap-protection.pro/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL2:10m;
    ssl_session_timeout 10m;

    # ===== SECURITY HEADERS =====
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; connect-src 'self' wss: ws:; frame-ancestors 'self'; base-uri 'self'; form-action 'self';" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()" always;
    add_header X-Permitted-Cross-Domain-Policies "none" always;
    add_header X-Download-Options "noopen" always;
    add_header X-DNS-Prefetch-Control "off" always;
    add_header Cross-Origin-Embedder-Policy "credentialless" always;
    add_header Cross-Origin-Opener-Policy "same-origin" always;
    add_header Cross-Origin-Resource-Policy "same-origin" always;
    add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate" always;
    add_header Pragma "no-cache" always;

    server_tokens off;

    location ~ /\. {
        deny all;
        return 404;
    }

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
'''

# Also fix the main nginx.conf to hide server version
nginx_main_addition = '''
# Security: hide Nginx version
server_tokens off;
'''

# Write configs
for cmd in [
    # Remove old configs
    'rm -f /etc/nginx/sites-enabled/default',
    'rm -f /etc/nginx/sites-enabled/gapprotectionltd.com',
    'rm -f /etc/nginx/sites-enabled/gap-protection.pro',
]:
    stdin, stdout, stderr = ssh.exec_command(cmd)
    stdout.channel.recv_exit_status()

# Write gapprotectionltd config
sftp = ssh.open_sftp()
with sftp.file('/etc/nginx/sites-available/gapprotectionltd.com', 'w') as f:
    f.write(nginx_gapprotection)
with sftp.file('/etc/nginx/sites-available/gap-protection.pro', 'w') as f:
    f.write(nginx_gapprotection_pro)
sftp.close()

# Enable configs & test
cmds = [
    'ln -sf /etc/nginx/sites-available/gapprotectionltd.com /etc/nginx/sites-enabled/',
    'ln -sf /etc/nginx/sites-available/gap-protection.pro /etc/nginx/sites-enabled/',
    # Move rate limit zone to http context (nginx.conf)
    "sed -i '/limit_req_zone/d' /etc/nginx/sites-available/gapprotectionltd.com",
    # Add rate limit to http context if not there
    "grep -q 'limit_req_zone' /etc/nginx/nginx.conf || sed -i '/http {/a \\    limit_req_zone \\$binary_remote_addr zone=general:10m rate=10r/s;' /etc/nginx/nginx.conf",
    # Hide server version in main config
    "sed -i 's/# server_tokens off;/server_tokens off;/' /etc/nginx/nginx.conf",
    "grep -q 'server_tokens off' /etc/nginx/nginx.conf || sed -i '/http {/a \\    server_tokens off;' /etc/nginx/nginx.conf",
]

for cmd in cmds:
    stdin, stdout, stderr = ssh.exec_command(cmd)
    stdout.channel.recv_exit_status()

# Test nginx config
stdin, stdout, stderr = ssh.exec_command('nginx -t 2>&1')
result = stdout.read().decode() + stderr.read().decode()
print('Nginx test:', result)

if 'successful' in result:
    stdin, stdout, stderr = ssh.exec_command('systemctl reload nginx')
    stdout.channel.recv_exit_status()
    print('Nginx reloaded!')
else:
    print('NGINX CONFIG ERROR!')

# Verify headers
stdin, stdout, stderr = ssh.exec_command("curl -sI https://gapprotectionltd.com/ | head -30")
print('\nResponse headers:')
print(stdout.read().decode())

ssh.close()
print('Done!')
