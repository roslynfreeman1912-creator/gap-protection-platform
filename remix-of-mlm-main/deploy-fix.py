#!/usr/bin/env python3
"""Fix: Upload drizzle config + schema, run migrations, check PM2 status."""
import paramiko
import os

HOST = "76.13.5.114"
USER = "root"
PASS = "galal123.DE12"
BASE = os.path.dirname(os.path.abspath(__file__))
SCANNER_DIR = os.path.join(BASE, "Python-Webify")
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
    print("[*] الاتصال بالسيرفر...")
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, 22, USER, PASS, timeout=30)
    sftp = client.open_sftp()
    print("[✓] متصل!")

    # 1. Upload drizzle config
    print("\n[1] رفع ملفات Drizzle config + schema...")
    sftp.put(
        os.path.join(SCANNER_DIR, "drizzle.config.ts"),
        f"{SCANNER_REMOTE}/drizzle.config.ts",
    )
    print("  [✓] drizzle.config.ts")

    # Create shared dir and upload schema  
    run_cmd(client, f"mkdir -p {SCANNER_REMOTE}/shared")
    sftp.put(
        os.path.join(SCANNER_DIR, "shared", "schema.ts"),
        f"{SCANNER_REMOTE}/shared/schema.ts",
    )
    print("  [✓] shared/schema.ts")

    # Upload tsconfig for drizzle-kit to use
    sftp.put(
        os.path.join(SCANNER_DIR, "tsconfig.json"),
        f"{SCANNER_REMOTE}/tsconfig.json",
    )
    print("  [✓] tsconfig.json")

    # 2. Install drizzle-kit + tsx on server
    print("\n[2] تثبيت أدوات Drizzle...")
    run_cmd(client, f"cd {SCANNER_REMOTE} && npm install drizzle-kit tsx drizzle-orm drizzle-zod pg zod 2>&1 | tail -5")

    # 3. Run drizzle push
    print("\n[3] تطبيق مخطط قاعدة البيانات...")
    run_cmd(client, f"cd {SCANNER_REMOTE} && DATABASE_URL='{DB_URL}' npx drizzle-kit push --force 2>&1 | tail -20")

    # 4. Check PM2 logs for scanner
    print("\n[4] فحص سجلات PM2...")
    run_cmd(client, "pm2 logs gap-scanner --lines 20 --nostream 2>&1")

    # 5. Restart scanner and check
    print("\n[5] إعادة تشغيل الفاحص...")
    run_cmd(client, f"cd {SCANNER_REMOTE} && pm2 restart gap-scanner")
    
    import time
    time.sleep(3)
    
    # 6. Verify
    print("\n[6] التحقق...")
    run_cmd(client, "pm2 list")
    run_cmd(client, "curl -s -o /dev/null -w 'HTTP %{http_code}' http://localhost:5000/ 2>/dev/null")
    run_cmd(client, "curl -s -o /dev/null -w 'HTTP %{http_code}' http://localhost/ 2>/dev/null")

    # 7. Check Nginx conf for admin site  
    print("\n[7] التحقق من admin site...")
    run_cmd(client, "ls -la /var/www/gapprotectionltd/index.html")
    run_cmd(client, "curl -sI http://gapprotectionltd.com 2>/dev/null | head -5")

    sftp.close()
    client.close()
    print("\n[✓] انتهى!")


if __name__ == "__main__":
    main()
