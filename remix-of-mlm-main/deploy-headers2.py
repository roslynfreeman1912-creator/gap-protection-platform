import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('76.13.5.114', username='root', password='galal123.DE12')

# Find all conflicting config files
stdin, stdout, stderr = ssh.exec_command('ls -la /etc/nginx/sites-enabled/ /etc/nginx/sites-available/ /etc/nginx/conf.d/')
print('Current configs:')
print(stdout.read().decode())

# Remove ALL files from sites-enabled and sites-available
cmds = [
    'rm -f /etc/nginx/sites-enabled/*',
    'rm -f /etc/nginx/sites-available/*',
    'rm -f /etc/nginx/conf.d/*.conf',
    'ls -la /etc/nginx/sites-enabled/ /etc/nginx/sites-available/ /etc/nginx/conf.d/',
]
for cmd in cmds:
    stdin, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode()
    if out.strip():
        print(out)
    stdout.channel.recv_exit_status()

print('Cleaned all configs')

# Now write fresh configs
sftp = ssh.open_sftp()

gapprotection_conf = '''server {
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

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://www.google-analytics.com https://pqnzsihfryjnnhdubisk.supabase.co; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; connect-src 'self' https://pqnzsihfryjnnhdubisk.supabase.co wss://pqnzsihfryjnnhdubisk.supabase.co https://openrouter.ai https://api.groq.com https://integrate.api.nvidia.com https://www.google-analytics.com; frame-ancestors 'self'; base-uri 'self'; form-action 'self';" always;
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

    # Block sensitive files
    location ~ /\\. { deny all; return 404; }
    location ~ \\.(env|git|svn|sql|db|sqlite|bak|backup|old|orig|swp|log|key|pem|crt)$ { deny all; return 404; }
    location ~ ^/(backup|backups|temp|tmp|old|bak|test|testing|dev|staging|debug|logs|errors|cgi-bin)(/|$) { deny all; return 404; }
    location ~ ^/(phpmyadmin|pma|phpMyAdmin|adminer|pgadmin|mysql|sql|dbadmin|database|mongo|redis|webmin|plesk|cpanel)(/|$) { deny all; return 404; }
    location ~ ^/(wp-admin|wp-login|wp-content|wp-includes|xmlrpc|wordpress|joomla|magento)(/|$) { deny all; return 404; }
    location ~ ^/(actuator|jenkins|gitlab|graphql|swagger|api-docs|telescope|horizon|_profiler|sidekiq)(/|$) { deny all; return 404; }
    location ~ ^/(server-status|server-info|nginx-status)(/|$) { deny all; return 404; }

    location = /robots.txt { allow all; }
    location = /favicon.ico { allow all; log_not_found off; access_log off; }

    # Static assets caching
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable" always;
        add_header X-Content-Type-Options "nosniff" always;
    }

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }
}
'''

gapprotection_pro_conf = '''server {
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

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
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

    location ~ /\\. { deny all; return 404; }

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

with sftp.file('/etc/nginx/sites-available/gapprotectionltd.com', 'w') as f:
    f.write(gapprotection_conf)
with sftp.file('/etc/nginx/sites-available/gap-protection.pro', 'w') as f:
    f.write(gapprotection_pro_conf)
sftp.close()

# Enable and test
cmds = [
    'ln -sf /etc/nginx/sites-available/gapprotectionltd.com /etc/nginx/sites-enabled/',
    'ln -sf /etc/nginx/sites-available/gap-protection.pro /etc/nginx/sites-enabled/',
    "sed -i 's/# server_tokens off;/server_tokens off;/' /etc/nginx/nginx.conf",
]
for cmd in cmds:
    stdin, stdout, stderr = ssh.exec_command(cmd)
    stdout.channel.recv_exit_status()

# Test
stdin, stdout, stderr = ssh.exec_command('nginx -t 2>&1')
result = stdout.read().decode() + stderr.read().decode()
print('Nginx test:', result)

if 'successful' in result:
    stdin, stdout, stderr = ssh.exec_command('systemctl reload nginx')
    stdout.channel.recv_exit_status()
    print('Nginx reloaded!')

    # Verify headers
    stdin, stdout, stderr = ssh.exec_command("curl -sI https://gapprotectionltd.com/ 2>&1 | head -35")
    print('\nResponse headers:')
    print(stdout.read().decode())
else:
    print('ERROR - nginx config issue')

ssh.close()
print('Done!')
