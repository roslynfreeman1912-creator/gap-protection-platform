#!/usr/bin/env python3
"""
GAP Protection - Continue Deployment (Scanner + Nginx + SSL)
Admin site already deployed. This finishes the rest.
"""
import paramiko
import os
import sys

HOST = "76.13.5.114"
PORT = 22
USER = "root"
PASS = "galal123.DE12"

BASE = os.path.dirname(os.path.abspath(__file__))
SCANNER_DIR = os.path.join(BASE, "Python-Webify")
SCANNER_DIST = os.path.join(SCANNER_DIR, "dist")
SCANNER_REMOTE = "/var/www/gap-protection-pro"
ADMIN_REMOTE = "/var/www/gapprotectionltd"
DB_URL = "postgresql://gap_user:GapPr0t3ct10n!2026@localhost:5432/gap_protection"


def run_cmd(client, cmd, check=True):
    print(f"  $ {cmd}")
    stdin, stdout, stderr = client.exec_command(cmd, timeout=300)
    exit_code = stdout.channel.recv_exit_status()
    out = stdout.read().decode("utf-8", errors="replace").strip()
    err = stderr.read().decode("utf-8", errors="replace").strip()
    if out:
        for line in out.split("\n")[-10:]:
            print(f"    {line}")
    if err and exit_code != 0:
        for line in err.split("\n")[-5:]:
            print(f"    [!] {line}")
    return out, err, exit_code


def mkdir_p(sftp, remote_dir):
    dirs_to_create = []
    d = remote_dir
    while True:
        try:
            sftp.stat(d)
            break
        except IOError:
            dirs_to_create.append(d)
            d = os.path.dirname(d)
            if not d or d == '/':
                break
    for d in reversed(dirs_to_create):
        try:
            sftp.mkdir(d)
        except IOError:
            pass


def upload_directory(sftp, local_dir, remote_dir):
    mkdir_p(sftp, remote_dir)
    count = 0
    for root, dirs, files in os.walk(local_dir):
        rel_path = os.path.relpath(root, local_dir)
        if rel_path == ".":
            remote_path = remote_dir
        else:
            remote_path = remote_dir + "/" + rel_path.replace("\\", "/")
        mkdir_p(sftp, remote_path)
        for f in files:
            local_file = os.path.join(root, f)
            remote_file = remote_path + "/" + f
            sftp.put(local_file, remote_file)
            count += 1
            if count % 10 == 0:
                print(f"    ... {count} ملفات مرفوعة")
    return count


def main():
    print("=" * 60)
    print("  GAP PROTECTION — إكمال النشر")
    print("=" * 60)

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"[*] الاتصال بـ {HOST}...")
    client.connect(HOST, PORT, USER, PASS, timeout=30)
    print("[✓] تم الاتصال!")
    sftp = client.open_sftp()

    try:
        # ═══ DEPLOY SCANNER ═══
        print("\n[4/8] نشر مشروع الفاحص الأمني...")
        run_cmd(client, f"mkdir -p {SCANNER_REMOTE}")
        run_cmd(client, f"rm -rf {SCANNER_REMOTE}/*")

        print("  [*] رفع ملفات dist...")
        count = upload_directory(sftp, SCANNER_DIST, f"{SCANNER_REMOTE}/dist")
        print(f"  [✓] تم رفع {count} ملف!")

        # Upload package.json
        sftp.put(
            os.path.join(SCANNER_DIR, "package.json"),
            f"{SCANNER_REMOTE}/package.json",
        )
        print("  [✓] package.json مرفوع")

        # Install deps
        print("  [*] تثبيت التبعيات...")
        run_cmd(client, f"cd {SCANNER_REMOTE} && npm install --omit=dev 2>&1 | tail -5", check=False)

        # Create .env
        env_content = f"NODE_ENV=production\nPORT=5000\nDATABASE_URL={DB_URL}\nSESSION_SECRET=GapProtection_S3cur3_S3ss10n_K3y_2026!\n"
        run_cmd(client, f"cat > {SCANNER_REMOTE}/.env << 'ENVEOF'\n{env_content}ENVEOF")

        # PM2
        print("  [*] تشغيل عبر PM2...")
        run_cmd(client, "pm2 delete gap-scanner 2>/dev/null", check=False)
        run_cmd(client, f"cd {SCANNER_REMOTE} && pm2 start dist/index.cjs --name gap-scanner")
        run_cmd(client, "pm2 save")
        run_cmd(client, "pm2 startup systemd -u root --hp /root 2>/dev/null", check=False)

        # DB migrations
        print("  [*] تطبيق مخطط قاعدة البيانات (Drizzle)...")
        run_cmd(client, f"cd {SCANNER_REMOTE} && DATABASE_URL='{DB_URL}' npx drizzle-kit push 2>&1 | tail -10", check=False)

        # ═══ NGINX ═══
        print("\n[5/8] إعداد Nginx...")

        admin_nginx = """server {
    listen 80;
    server_name gapprotectionltd.com www.gapprotectionltd.com;
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

        run_cmd(client, f"cat > /etc/nginx/sites-available/gapprotectionltd << 'NGINXEOF'\n{admin_nginx}\nNGINXEOF")
        run_cmd(client, f"cat > /etc/nginx/sites-available/gap-protection-pro << 'NGINXEOF'\n{scanner_nginx}\nNGINXEOF")
        run_cmd(client, "ln -sf /etc/nginx/sites-available/gapprotectionltd /etc/nginx/sites-enabled/")
        run_cmd(client, "ln -sf /etc/nginx/sites-available/gap-protection-pro /etc/nginx/sites-enabled/")
        run_cmd(client, "rm -f /etc/nginx/sites-enabled/default")

        out, err, rc = run_cmd(client, "nginx -t")
        if rc == 0:
            run_cmd(client, "systemctl reload nginx")
            print("  [✓] Nginx جاهز!")
        else:
            print("  [✗] خطأ Nginx!")

        # ═══ SSL ═══
        print("\n[6/8] إعداد SSL...")
        for domain in ["gapprotectionltd.com", "gap-protection.pro"]:
            print(f"  [*] شهادة SSL لـ {domain}...")
            run_cmd(client, f"certbot --nginx -d {domain} -d www.{domain} --non-interactive --agree-tos --email admin@gapprotection.de --redirect 2>&1 | tail -5", check=False)

        # ═══ FIREWALL ═══
        print("\n[7/8] جدار الحماية...")
        run_cmd(client, "ufw allow 22/tcp", check=False)
        run_cmd(client, "ufw allow 80/tcp", check=False)
        run_cmd(client, "ufw allow 443/tcp", check=False)
        run_cmd(client, "echo y | ufw enable 2>/dev/null", check=False)

        # ═══ VERIFY ═══
        print("\n[8/8] التحقق...")
        run_cmd(client, "systemctl is-active nginx")
        run_cmd(client, "systemctl is-active postgresql")
        run_cmd(client, "pm2 list")
        run_cmd(client, f"ls -la {ADMIN_REMOTE}/index.html")
        run_cmd(client, f"ls -la {SCANNER_REMOTE}/dist/index.cjs")
        run_cmd(client, "curl -s -o /dev/null -w 'HTTP %{http_code}' http://localhost/", check=False)
        run_cmd(client, "curl -s -o /dev/null -w 'HTTP %{http_code}' http://localhost:5000/", check=False)

        print("\n" + "=" * 60)
        print("  ✅ النشر مكتمل!")
        print("=" * 60)
        print(f"""
  🌐 gapprotectionltd.com  → {ADMIN_REMOTE}
  🔍 gap-protection.pro    → {SCANNER_REMOTE} (PM2: gap-scanner, port 5000)
  🗄️ PostgreSQL: gap_protection / gap_user
""")

    except Exception as e:
        print(f"\n[✗] خطأ: {e}")
        import traceback
        traceback.print_exc()
    finally:
        sftp.close()
        client.close()
        print("[*] تم قطع الاتصال.")


if __name__ == "__main__":
    main()
