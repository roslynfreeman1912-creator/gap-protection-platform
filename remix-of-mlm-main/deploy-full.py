#!/usr/bin/env python3
"""
GAP Protection - Full Deployment Script
Deploys both projects to the VPS via SSH/SCP:
  1. gapprotectionltd.com  (React SPA - admin dashboard)
  2. gap-protection.pro    (Node.js fullstack - security scanner)
"""
import paramiko
import os
import sys
import time
import stat

# ═══ SERVER CONFIG ═══
HOST = "76.13.5.114"
PORT = 22
USER = "root"
PASS = "galal123.DE12"

# ═══ LOCAL PATHS ═══
BASE = os.path.dirname(os.path.abspath(__file__))
ADMIN_DIST = os.path.join(BASE, "dist")
SCANNER_DIR = os.path.join(BASE, "Python-Webify")
SCANNER_DIST = os.path.join(SCANNER_DIR, "dist")

# ═══ REMOTE PATHS ═══
ADMIN_REMOTE = "/var/www/gapprotectionltd"
SCANNER_REMOTE = "/var/www/gap-protection-pro"


def ssh_connect():
    """Create SSH connection."""
    print(f"[*] الاتصال بـ {HOST}...")
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, PORT, USER, PASS, timeout=30)
    print("[✓] تم الاتصال بالسيرفر بنجاح!")
    return client


def run_cmd(client, cmd, check=True):
    """Execute command on remote server."""
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
    if check and exit_code != 0:
        print(f"    [✗] Exit code: {exit_code}")
    return out, err, exit_code


def mkdir_p(sftp, remote_dir):
    """Recursively create remote directories."""
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
    """Recursively upload a directory via SFTP."""
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
            if count % 20 == 0:
                print(f"    ... {count} ملفات مرفوعة")
    return count


def setup_server(client):
    """Install Node.js, Nginx, PM2, PostgreSQL, Certbot."""
    print("\n" + "=" * 60)
    print("[1/8] إعداد السيرفر - تحديث النظام وتثبيت الأدوات")
    print("=" * 60)

    run_cmd(client, "apt-get update -qq", check=False)
    run_cmd(client, "DEBIAN_FRONTEND=noninteractive apt-get upgrade -y -qq", check=False)

    # Check if Node.js is installed
    _, _, rc = run_cmd(client, "node --version", check=False)
    if rc != 0:
        print("  [*] تثبيت Node.js 20...")
        run_cmd(client, "curl -fsSL https://deb.nodesource.com/setup_20.x | bash -", check=False)
        run_cmd(client, "apt-get install -y nodejs")
    else:
        print("  [✓] Node.js موجود")

    # Install nginx
    _, _, rc = run_cmd(client, "which nginx", check=False)
    if rc != 0:
        print("  [*] تثبيت Nginx...")
        run_cmd(client, "apt-get install -y nginx")
    else:
        print("  [✓] Nginx موجود")

    # Install PM2
    _, _, rc = run_cmd(client, "which pm2", check=False)
    if rc != 0:
        print("  [*] تثبيت PM2...")
        run_cmd(client, "npm install -g pm2")
    else:
        print("  [✓] PM2 موجود")

    # Install PostgreSQL
    _, _, rc = run_cmd(client, "which psql", check=False)
    if rc != 0:
        print("  [*] تثبيت PostgreSQL...")
        run_cmd(client, "apt-get install -y postgresql postgresql-contrib")
        run_cmd(client, "systemctl enable postgresql && systemctl start postgresql")
    else:
        print("  [✓] PostgreSQL موجود")

    # Install Certbot
    _, _, rc = run_cmd(client, "which certbot", check=False)
    if rc != 0:
        print("  [*] تثبيت Certbot (SSL)...")
        run_cmd(client, "apt-get install -y certbot python3-certbot-nginx")
    else:
        print("  [✓] Certbot موجود")

    # Install Python3 + pip for scanner
    run_cmd(client, "apt-get install -y python3 python3-pip python3-venv -qq", check=False)

    print("  [✓] إعداد السيرفر مكتمل!")


def setup_postgresql(client):
    """Create PostgreSQL database and user for the scanner project."""
    print("\n" + "=" * 60)
    print("[2/8] إعداد قاعدة بيانات PostgreSQL")
    print("=" * 60)

    # Create user and database
    cmds = [
        "sudo -u postgres psql -tc \"SELECT 1 FROM pg_roles WHERE rolname='gap_user'\" | grep -q 1 || sudo -u postgres psql -c \"CREATE USER gap_user WITH PASSWORD 'GapPr0t3ct10n!2026';\"",
        "sudo -u postgres psql -tc \"SELECT 1 FROM pg_database WHERE datname='gap_protection'\" | grep -q 1 || sudo -u postgres psql -c \"CREATE DATABASE gap_protection OWNER gap_user;\"",
        "sudo -u postgres psql -c \"GRANT ALL PRIVILEGES ON DATABASE gap_protection TO gap_user;\"",
    ]
    for cmd in cmds:
        run_cmd(client, cmd, check=False)

    print("  [✓] قاعدة البيانات gap_protection جاهزة!")
    return "postgresql://gap_user:GapPr0t3ct10n!2026@localhost:5432/gap_protection"


def deploy_admin(client, sftp):
    """Deploy admin dashboard (gapprotectionltd.com) - static SPA."""
    print("\n" + "=" * 60)
    print("[3/8] نشر مشروع الإدارة - gapprotectionltd.com")
    print("=" * 60)

    # Create remote directory
    run_cmd(client, f"mkdir -p {ADMIN_REMOTE}")
    run_cmd(client, f"rm -rf {ADMIN_REMOTE}/*")

    # Upload dist files
    print(f"  [*] رفع ملفات الإنتاج إلى {ADMIN_REMOTE}...")
    count = upload_directory(sftp, ADMIN_DIST, ADMIN_REMOTE)
    print(f"  [✓] تم رفع {count} ملف!")

    # Set permissions
    run_cmd(client, f"chown -R www-data:www-data {ADMIN_REMOTE}")
    run_cmd(client, f"chmod -R 755 {ADMIN_REMOTE}")


def deploy_scanner(client, sftp, db_url):
    """Deploy security scanner (gap-protection.pro) - Node.js fullstack."""
    print("\n" + "=" * 60)
    print("[4/8] نشر مشروع الفاحص الأمني - gap-protection.pro")
    print("=" * 60)

    # Create remote directory
    run_cmd(client, f"mkdir -p {SCANNER_REMOTE}")
    run_cmd(client, f"rm -rf {SCANNER_REMOTE}/*")

    # Upload dist folder (server + client)
    print(f"  [*] رفع ملفات الإنتاج إلى {SCANNER_REMOTE}...")
    count = upload_directory(sftp, SCANNER_DIST, f"{SCANNER_REMOTE}/dist")
    print(f"  [✓] تم رفع {count} ملف!")

    # Upload package.json and node_modules essentials
    sftp.put(
        os.path.join(SCANNER_DIR, "package.json"),
        f"{SCANNER_REMOTE}/package.json",
    )

    # Install production dependencies on server
    print("  [*] تثبيت التبعيات على السيرفر...")
    run_cmd(client, f"cd {SCANNER_REMOTE} && npm install --omit=dev 2>&1 | tail -3", check=False)

    # Create .env file
    env_content = f"""NODE_ENV=production
PORT=5000
DATABASE_URL={db_url}
SESSION_SECRET=GapProtection_S3cur3_S3ss10n_K3y_2026!
"""
    run_cmd(client, f'cat > {SCANNER_REMOTE}/.env << \'ENVEOF\'\n{env_content}ENVEOF')

    # Setup with PM2
    print("  [*] تشغيل التطبيق عبر PM2...")
    run_cmd(client, f"pm2 delete gap-scanner 2>/dev/null; cd {SCANNER_REMOTE} && pm2 start dist/index.cjs --name gap-scanner --env production")
    run_cmd(client, "pm2 save")
    run_cmd(client, "pm2 startup systemd -u root --hp /root 2>/dev/null", check=False)

    # Run DB migrations via drizzle
    print("  [*] تطبيق مخطط قاعدة البيانات...")
    run_cmd(client, f"cd {SCANNER_REMOTE} && DATABASE_URL='{db_url}' npx drizzle-kit push 2>&1 | tail -5", check=False)


def setup_nginx(client):
    """Configure Nginx for both domains."""
    print("\n" + "=" * 60)
    print("[5/8] إعداد Nginx لكلا الموقعين")
    print("=" * 60)

    # Admin site - static SPA
    admin_nginx = f"""server {{
    listen 80;
    server_name gapprotectionltd.com www.gapprotectionltd.com;
    root {ADMIN_REMOTE};
    index index.html;

    # SPA routing
    location / {{
        try_files $uri $uri/ /index.html;
    }}

    # Cache static assets
    location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {{
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }}

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript image/svg+xml;
    gzip_min_length 256;
}}"""

    # Scanner site - reverse proxy to Node.js
    scanner_nginx = f"""server {{
    listen 80;
    server_name gap-protection.pro www.gap-protection.pro;

    location / {{
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # SSE / WebSocket support
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 300s;
    }}

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
}}"""

    run_cmd(client, f"cat > /etc/nginx/sites-available/gapprotectionltd << 'NGINXEOF'\n{admin_nginx}\nNGINXEOF")
    run_cmd(client, f"cat > /etc/nginx/sites-available/gap-protection-pro << 'NGINXEOF'\n{scanner_nginx}\nNGINXEOF")

    # Enable sites
    run_cmd(client, "ln -sf /etc/nginx/sites-available/gapprotectionltd /etc/nginx/sites-enabled/")
    run_cmd(client, "ln -sf /etc/nginx/sites-available/gap-protection-pro /etc/nginx/sites-enabled/")
    run_cmd(client, "rm -f /etc/nginx/sites-enabled/default")

    # Test and reload
    out, err, rc = run_cmd(client, "nginx -t")
    if rc == 0:
        run_cmd(client, "systemctl reload nginx")
        print("  [✓] Nginx مُعد وفعّال!")
    else:
        print("  [✗] خطأ في إعداد Nginx!")


def setup_ssl(client):
    """Setup SSL certificates via Certbot."""
    print("\n" + "=" * 60)
    print("[6/8] إعداد شهادات SSL")
    print("=" * 60)

    for domain in ["gapprotectionltd.com", "gap-protection.pro"]:
        print(f"  [*] طلب شهادة SSL لـ {domain}...")
        run_cmd(
            client,
            f"certbot --nginx -d {domain} -d www.{domain} --non-interactive --agree-tos --email admin@{domain} --redirect 2>&1 | tail -5",
            check=False,
        )

    # Auto-renewal
    run_cmd(client, "systemctl enable certbot.timer 2>/dev/null", check=False)
    print("  [✓] شهادات SSL مكتملة (أو بانتظار DNS)!")


def setup_firewall(client):
    """Configure UFW firewall."""
    print("\n" + "=" * 60)
    print("[7/8] إعداد جدار الحماية")
    print("=" * 60)

    run_cmd(client, "ufw allow 22/tcp", check=False)
    run_cmd(client, "ufw allow 80/tcp", check=False)
    run_cmd(client, "ufw allow 443/tcp", check=False)
    run_cmd(client, "echo y | ufw enable 2>/dev/null", check=False)
    print("  [✓] جدار الحماية مُفعّل!")


def verify_deployment(client):
    """Verify both deployments."""
    print("\n" + "=" * 60)
    print("[8/8] التحقق من النشر")
    print("=" * 60)

    # Check Nginx
    run_cmd(client, "systemctl is-active nginx")

    # Check PM2
    run_cmd(client, "pm2 list")

    # Check admin site files
    out, _, _ = run_cmd(client, f"ls -la {ADMIN_REMOTE}/index.html 2>/dev/null && echo 'ADMIN_OK' || echo 'ADMIN_MISSING'")

    # Check scanner
    out, _, _ = run_cmd(client, f"ls -la {SCANNER_REMOTE}/dist/index.cjs 2>/dev/null && echo 'SCANNER_OK' || echo 'SCANNER_MISSING'")

    # Check PostgreSQL
    run_cmd(client, "systemctl is-active postgresql")

    # Quick HTTP check
    run_cmd(client, "curl -s -o /dev/null -w '%{http_code}' http://localhost/ 2>/dev/null || echo 'HTTP_FAIL'", check=False)
    run_cmd(client, "curl -s -o /dev/null -w '%{http_code}' http://localhost:5000/ 2>/dev/null || echo 'HTTP_FAIL'", check=False)

    print("\n" + "=" * 60)
    print("  ✅ النشر مكتمل!")
    print("=" * 60)
    print(f"""
  🌐 الموقع الأول (الإدارة):
     https://gapprotectionltd.com
     المسار: {ADMIN_REMOTE}

  🔍 الموقع الثاني (الفاحص):
     https://gap-protection.pro
     المسار: {SCANNER_REMOTE}
     PM2: gap-scanner (المنفذ 5000)

  🗄️ قاعدة البيانات:
     PostgreSQL: gap_protection
     المستخدم: gap_user

  📋 أوامر مفيدة:
     pm2 logs gap-scanner    - سجلات الفاحص
     pm2 restart gap-scanner - إعادة تشغيل
     nginx -t && systemctl reload nginx - إعادة تحميل Nginx
     certbot renew           - تجديد SSL
""")


def main():
    print("╔══════════════════════════════════════════╗")
    print("║   GAP PROTECTION — Full Deployment       ║")
    print("║   gapprotectionltd.com + gap-protection.pro ║")
    print("╚══════════════════════════════════════════╝")
    print()

    # Verify local builds exist
    if not os.path.isdir(ADMIN_DIST):
        print(f"[✗] مجلد dist غير موجود: {ADMIN_DIST}")
        print("    شغّل: npm run build")
        sys.exit(1)

    if not os.path.isfile(os.path.join(SCANNER_DIST, "index.cjs")):
        print(f"[✗] مجلد dist غير موجود: {SCANNER_DIST}")
        print("    شغّل: cd Python-Webify && npm run build")
        sys.exit(1)

    print(f"[✓] ملفات الإنتاج موجودة")

    # Connect
    client = ssh_connect()
    sftp = client.open_sftp()

    try:
        # 1. Setup server
        setup_server(client)

        # 2. Setup PostgreSQL
        db_url = setup_postgresql(client)

        # 3. Deploy admin
        deploy_admin(client, sftp)

        # 4. Deploy scanner
        deploy_scanner(client, sftp, db_url)

        # 5. Setup Nginx
        setup_nginx(client)

        # 6. Setup SSL
        setup_ssl(client)

        # 7. Firewall
        setup_firewall(client)

        # 8. Verify
        verify_deployment(client)

    except Exception as e:
        print(f"\n[✗] خطأ: {e}")
        import traceback
        traceback.print_exc()
    finally:
        sftp.close()
        client.close()
        print("\n[*] تم قطع الاتصال بالسيرفر.")


if __name__ == "__main__":
    main()
