#!/usr/bin/env python3
"""Deploy updated Nginx config with whitelist approach for SPA routes."""
import paramiko

HOST = '76.13.5.114'
USER = 'root'
PASS = 'galal123.DE12'

NGINX_GAP = r'''server {
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

    server_tokens off;

    # ═══ Security Headers ═══
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
    add_header Expect-CT "max-age=86400, enforce" always;

    # ═══ Block dotfiles (except .well-known) ═══
    location ~ /\.(?!well-known) {
        deny all;
        return 404;
    }

    # ═══ Static assets with caching ═══
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable" always;
        add_header X-Content-Type-Options "nosniff" always;
        try_files $uri =404;
    }

    # ═══ Known static files ═══
    location = /robots.txt { try_files $uri =404; }
    location = /favicon.ico { try_files $uri =404; log_not_found off; access_log off; }
    location = /favicon.png { try_files $uri =404; log_not_found off; access_log off; }
    location = /sitemap.xml { try_files $uri =404; }

    # ═══ WHITELIST: Valid SPA routes only ═══
    # Public routes
    location = / { try_files /index.html =404; }
    location = /auth { try_files /index.html =404; }
    location = /register { try_files /index.html =404; }
    location = /contact { try_files /index.html =404; }
    location = /promo-display { try_files /index.html =404; }

    # Legal routes (with parameter)
    location ~ ^/legal/[a-z-]+$ { try_files /index.html =404; }

    # Authenticated routes
    location = /dashboard { try_files /index.html =404; }
    location = /admin { try_files /index.html =404; }
    location = /accounting { try_files /index.html =404; }
    location = /security-dashboard { try_files /index.html =404; }
    location = /security-test { try_files /index.html =404; }
    location = /callcenter { try_files /index.html =404; }

    # ═══ DEFAULT: Return 404 for everything else ═══
    location / {
        return 404;
    }
}
'''

NGINX_PRO = r'''server {
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

    server_tokens off;

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' wss: ws:; frame-ancestors 'self'; base-uri 'self'; form-action 'self';" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()" always;
    add_header X-Permitted-Cross-Domain-Policies "none" always;
    add_header X-Download-Options "noopen" always;
    add_header X-DNS-Prefetch-Control "off" always;
    add_header Cross-Origin-Embedder-Policy "credentialless" always;
    add_header Cross-Origin-Opener-Policy "same-origin" always;
    add_header Cross-Origin-Resource-Policy "same-origin" always;
    add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate" always;
    add_header Pragma "no-cache" always;
    add_header Expect-CT "max-age=86400, enforce" always;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
'''


def main():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASS)

    cmds = [
        # Clean old configs
        'rm -f /etc/nginx/sites-enabled/*',
        'rm -f /etc/nginx/sites-available/gapprotectionltd*',
        'rm -f /etc/nginx/sites-available/gap-protection*',
        'rm -f /etc/nginx/sites-available/default',
    ]
    for cmd in cmds:
        ssh.exec_command(cmd)

    # Write new configs
    sftp = ssh.open_sftp()

    with sftp.open('/etc/nginx/sites-available/gapprotectionltd.com', 'w') as f:
        f.write(NGINX_GAP)
    with sftp.open('/etc/nginx/sites-available/gap-protection.pro', 'w') as f:
        f.write(NGINX_PRO)

    sftp.close()

    # Enable sites and test
    cmds2 = [
        'ln -sf /etc/nginx/sites-available/gapprotectionltd.com /etc/nginx/sites-enabled/',
        'ln -sf /etc/nginx/sites-available/gap-protection.pro /etc/nginx/sites-enabled/',
        'nginx -t 2>&1',
    ]
    for cmd in cmds2:
        stdin, stdout, stderr = ssh.exec_command(cmd)
        out = stdout.read().decode() + stderr.read().decode()
        if out.strip():
            print(f'[{cmd}] {out.strip()}')

    # Reload nginx
    stdin, stdout, stderr = ssh.exec_command('systemctl reload nginx 2>&1')
    out = stdout.read().decode() + stderr.read().decode()
    print(f'Reload: {out.strip() or "OK"}')

    # Verify
    stdin, stdout, stderr = ssh.exec_command('curl -sI https://gapprotectionltd.com/ 2>/dev/null | head -1')
    print(f'Main site: {stdout.read().decode().strip()}')

    # Test that unknown paths return 404
    stdin, stdout, stderr = ssh.exec_command('curl -sI https://gapprotectionltd.com/admin.php 2>/dev/null | head -1')
    print(f'/admin.php: {stdout.read().decode().strip()}')

    stdin, stdout, stderr = ssh.exec_command('curl -sI https://gapprotectionltd.com/config.json 2>/dev/null | head -1')
    print(f'/config.json: {stdout.read().decode().strip()}')

    stdin, stdout, stderr = ssh.exec_command('curl -sI https://gapprotectionltd.com/wp-config.php 2>/dev/null | head -1')
    print(f'/wp-config.php: {stdout.read().decode().strip()}')

    stdin, stdout, stderr = ssh.exec_command('curl -sI https://gapprotectionltd.com/phpmyadmin/ 2>/dev/null | head -1')
    print(f'/phpmyadmin/: {stdout.read().decode().strip()}')

    # Test valid routes return 200
    stdin, stdout, stderr = ssh.exec_command('curl -sI https://gapprotectionltd.com/ 2>/dev/null | head -1')
    print(f'/: {stdout.read().decode().strip()}')

    stdin, stdout, stderr = ssh.exec_command('curl -sI https://gapprotectionltd.com/dashboard 2>/dev/null | head -1')
    print(f'/dashboard: {stdout.read().decode().strip()}')

    stdin, stdout, stderr = ssh.exec_command('curl -sI https://gapprotectionltd.com/auth 2>/dev/null | head -1')
    print(f'/auth: {stdout.read().decode().strip()}')

    # Test security headers
    stdin, stdout, stderr = ssh.exec_command('curl -sI https://gapprotectionltd.com/ 2>/dev/null | grep -i "expect-ct"')
    print(f'Expect-CT: {stdout.read().decode().strip()}')

    ssh.close()
    print('\nDone!')


if __name__ == '__main__':
    main()
