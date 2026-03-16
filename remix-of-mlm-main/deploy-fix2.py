#!/usr/bin/env python3
"""Fix PM2 environment variables and verify both sites."""
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

    # 1. Create PM2 ecosystem config with env vars
    print("\n[1] إنشاء ecosystem.config.js لـ PM2...")
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
    run_cmd(client, f"cat > {SCANNER_REMOTE}/ecosystem.config.js << 'ECOEOF'\n{ecosystem}ECOEOF")

    # 2. Stop old process and start with ecosystem
    print("\n[2] إعادة تشغيل الفاحص مع المتغيرات الصحيحة...")
    run_cmd(client, "pm2 delete gap-scanner 2>/dev/null")
    run_cmd(client, f"cd {SCANNER_REMOTE} && pm2 start ecosystem.config.js")
    run_cmd(client, "pm2 save")

    time.sleep(4)

    # 3. Check logs
    print("\n[3] سجلات الفاحص...")
    run_cmd(client, "pm2 logs gap-scanner --lines 15 --nostream 2>&1")

    # 4. Test HTTP
    print("\n[4] اختبار HTTP...")
    run_cmd(client, "curl -s -o /dev/null -w 'HTTP %{http_code}' http://localhost:5000/ 2>/dev/null")
    run_cmd(client, "curl -s http://localhost:5000/ 2>/dev/null | head -5")

    # 5. Test admin site via Nginx  
    print("\n[5] اختبار موقع الإدارة...")
    run_cmd(client, "curl -s -o /dev/null -w 'HTTP %{http_code}' http://localhost/ 2>/dev/null")
    # Check if Nginx serves the right root
    run_cmd(client, "nginx -T 2>/dev/null | grep -A5 'server_name gapprotectionltd'")

    # 6. PM2 status
    print("\n[6] حالة PM2...")
    run_cmd(client, "pm2 list")

    client.close()
    print("\n[✓] انتهى!")


if __name__ == "__main__":
    main()
