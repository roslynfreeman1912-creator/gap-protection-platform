#!/usr/bin/env python3
"""Fix PM2 (use .cjs extension) + Fix Nginx Certbot duplicate block."""
import paramiko
import time

HOST = "76.13.5.114"
USER = "root"
PASS = "galal123.DE12"
SCANNER_REMOTE = "/var/www/gap-protection-pro"
DB_URL = "postgresql://gap_user:GapPr0t3ct10n!2026@localhost:5432/gap_protection"


def run_cmd(client, cmd):
    print(f"  $ {cmd}")
    stdin, stdout, stderr = client.exec_command(cmd, timeout=300)
    exit_code = stdout.channel.recv_exit_status()
    out = stdout.read().decode("utf-8", errors="replace").strip()
    err = stderr.read().decode("utf-8", errors="replace").strip()
    if out:
        for line in out.split("\n")[-15:]:
            print(f"    {line}")
    if err:
        for line in err.split("\n")[-10:]:
            print(f"    [!] {line}")
    return out, err, exit_code


def main():
    print("[*] الاتصال...")
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, 22, USER, PASS, timeout=30)
    print("[✓] متصل!")

    # ═══ FIX 1: PM2 with .cjs extension ═══
    print("\n[1] إصلاح PM2 - استخدام .cjs لتجنب ESM conflict...")
    ecosystem = f"""module.exports = {{
  apps: [{{
    name: 'gap-scanner',
    script: 'dist/index.cjs',
    cwd: '{SCANNER_REMOTE}',
    env: {{
      NODE_ENV: 'production',
      PORT: 5000,
      DATABASE_URL: '{DB_URL}',
      SESSION_SECRET: 'GapProtection_S3cur3_S3ss10n_K3y_2026!'
    }},
    max_memory_restart: '500M',
    instances: 1,
    autorestart: true,
    watch: false,
  }}]
}};
"""
    run_cmd(client, f"cat > {SCANNER_REMOTE}/ecosystem.config.cjs << 'ECOEOF'\n{ecosystem}ECOEOF")
    run_cmd(client, "pm2 delete all 2>/dev/null")
    run_cmd(client, f"cd {SCANNER_REMOTE} && pm2 start ecosystem.config.cjs")
    run_cmd(client, "pm2 save")

    time.sleep(4)

    print("\n[2] سجلات الفاحص...")
    run_cmd(client, "pm2 logs gap-scanner --lines 10 --nostream 2>&1")

    print("\n[3] اختبار المنفذ 5000...")
    run_cmd(client, "curl -s -o /dev/null -w 'HTTP %{http_code}' http://localhost:5000/ 2>/dev/null")

    # ═══ FIX 2: Fix Nginx - remove Certbot duplicate 404 block ═══
    print("\n[4] إصلاح Nginx - إعادة كتابة الإعداد بشكل نظيف...")

    # Full nginx config for admin with SSL
    admin_nginx = """server {
    listen 80;
    server_name gapprotectionltd.com www.gapprotectionltd.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name gapprotectionltd.com www.gapprotectionltd.com;

    ssl_certificate /etc/letsencrypt/live/gapprotectionltd.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/gapprotectionltd.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    root /var/www/gapprotectionltd;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript image/svg+xml;
    gzip_min_length 256;
}"""

    scanner_nginx = """server {
    listen 80;
    server_name gap-protection.pro www.gap-protection.pro;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name gap-protection.pro www.gap-protection.pro;

    ssl_certificate /etc/letsencrypt/live/gap-protection.pro/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/gap-protection.pro/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

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
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 300s;
    }

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
}"""

    # Check if SSL certs exist
    out, _, rc = run_cmd(client, "test -f /etc/letsencrypt/live/gapprotectionltd.com/fullchain.pem && echo 'CERT_OK' || echo 'NO_CERT'")
    has_admin_ssl = "CERT_OK" in out

    out2, _, rc2 = run_cmd(client, "test -f /etc/letsencrypt/live/gap-protection.pro/fullchain.pem && echo 'CERT_OK' || echo 'NO_CERT'")
    has_scanner_ssl = "CERT_OK" in out2

    if has_admin_ssl:
        run_cmd(client, f"cat > /etc/nginx/sites-available/gapprotectionltd << 'NGINXEOF'\n{admin_nginx}\nNGINXEOF")
        print("  [✓] إعداد admin مع SSL")
    else:
        # Fallback without SSL
        admin_nginx_nossl = """server {
    listen 80;
    server_name gapprotectionltd.com www.gapprotectionltd.com;
    root /var/www/gapprotectionltd;
    index index.html;
    location / { try_files $uri $uri/ /index.html; }
    location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ { expires 1y; add_header Cache-Control "public, immutable"; try_files $uri =404; }
    gzip on; gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript image/svg+xml;
}"""
        run_cmd(client, f"cat > /etc/nginx/sites-available/gapprotectionltd << 'NGINXEOF'\n{admin_nginx_nossl}\nNGINXEOF")
        print("  [✓] إعداد admin بدون SSL (الشهادة غير موجودة)")

    if has_scanner_ssl:
        run_cmd(client, f"cat > /etc/nginx/sites-available/gap-protection-pro << 'NGINXEOF'\n{scanner_nginx}\nNGINXEOF")
        print("  [✓] إعداد scanner مع SSL")
    else:
        scanner_nginx_nossl = """server {
    listen 80;
    server_name gap-protection.pro www.gap-protection.pro;
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
        proxy_buffering off;
        proxy_read_timeout 300s;
    }
}"""
        run_cmd(client, f"cat > /etc/nginx/sites-available/gap-protection-pro << 'NGINXEOF'\n{scanner_nginx_nossl}\nNGINXEOF")
        print("  [✓] إعداد scanner بدون SSL (الشهادة غير موجودة)")

    # Remove any Certbot-generated duplicate blocks
    run_cmd(client, "rm -f /etc/nginx/sites-enabled/default")
    run_cmd(client, "ln -sf /etc/nginx/sites-available/gapprotectionltd /etc/nginx/sites-enabled/")
    run_cmd(client, "ln -sf /etc/nginx/sites-available/gap-protection-pro /etc/nginx/sites-enabled/")

    # Test and reload
    out, err, rc = run_cmd(client, "nginx -t 2>&1")
    if rc == 0 or "successful" in (out + err).lower():
        run_cmd(client, "systemctl reload nginx")
        print("  [✓] Nginx أعيد تحميله!")
    else:
        print("  [✗] خطأ Nginx! سأحاول بدون SSL...")
        # Minimal fallback
        run_cmd(client, "cat > /etc/nginx/sites-available/gapprotectionltd << 'NGINXEOF'\nserver { listen 80; server_name gapprotectionltd.com www.gapprotectionltd.com; root /var/www/gapprotectionltd; index index.html; location / { try_files $uri $uri/ /index.html; } }\nNGINXEOF")
        run_cmd(client, "cat > /etc/nginx/sites-available/gap-protection-pro << 'NGINXEOF'\nserver { listen 80; server_name gap-protection.pro www.gap-protection.pro; location / { proxy_pass http://127.0.0.1:5000; proxy_http_version 1.1; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; } }\nNGINXEOF")
        run_cmd(client, "nginx -t 2>&1 && systemctl reload nginx")

    # ═══ FINAL VERIFICATION ═══
    print("\n[5] التحقق النهائي...")
    run_cmd(client, "pm2 list")
    run_cmd(client, "curl -s -o /dev/null -w 'Admin HTTP: %{http_code}\\n' --resolve 'gapprotectionltd.com:80:127.0.0.1' http://gapprotectionltd.com/ 2>/dev/null")
    run_cmd(client, "curl -s -o /dev/null -w 'Scanner HTTP: %{http_code}\\n' http://localhost:5000/ 2>/dev/null")
    run_cmd(client, "curl -sk -o /dev/null -w 'Admin HTTPS: %{http_code}\\n' --resolve 'gapprotectionltd.com:443:127.0.0.1' https://gapprotectionltd.com/ 2>/dev/null")

    client.close()
    print("\n[✓] انتهى!")


if __name__ == "__main__":
    main()
