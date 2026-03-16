#!/usr/bin/env python3
"""Quick deploy: Upload scanner dist + restart PM2 (no Nginx/SSL changes)."""
import paramiko
import os

HOST = "76.13.5.114"
USER = "root"
PASS = "galal123.DE12"
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # Parent "New folder"
SCANNER_DIST = os.path.join(BASE, "Python-Webify", "dist")
SCANNER_PKG = os.path.join(BASE, "Python-Webify", "package.json")
SCANNER_ENV = os.path.join(BASE, "Python-Webify", ".env")
REMOTE = "/var/www/gap-protection-pro"


def run_cmd(client, cmd):
    print(f"  $ {cmd}")
    stdin, stdout, stderr = client.exec_command(cmd, timeout=300)
    rc = stdout.channel.recv_exit_status()
    out = stdout.read().decode("utf-8", errors="replace").strip()
    err = stderr.read().decode("utf-8", errors="replace").strip()
    if out:
        for line in out.split("\n")[-10:]:
            print(f"    {line}")
    if err and rc != 0:
        for line in err.split("\n")[-5:]:
            print(f"    [!] {line}")
    return out, err, rc


def mkdir_p(sftp, remote_dir):
    dirs = []
    d = remote_dir
    while True:
        try:
            sftp.stat(d)
            break
        except IOError:
            dirs.append(d)
            d = os.path.dirname(d)
            if not d or d == '/':
                break
    for d in reversed(dirs):
        try:
            sftp.mkdir(d)
        except IOError:
            pass


def upload_dir(sftp, local, remote):
    mkdir_p(sftp, remote)
    count = 0
    for root, dirs, files in os.walk(local):
        rel = os.path.relpath(root, local)
        rp = remote if rel == "." else remote + "/" + rel.replace("\\", "/")
        mkdir_p(sftp, rp)
        for f in files:
            sftp.put(os.path.join(root, f), rp + "/" + f)
            count += 1
            if count % 20 == 0:
                print(f"    ... {count} files uploaded")
    return count


def main():
    print("=" * 50)
    print("  GAP Scanner — Quick Deploy Update")
    print("=" * 50)

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"[*] Connecting to {HOST}...")
    client.connect(HOST, 22, USER, PASS, timeout=30)
    print("[OK] Connected!")
    sftp = client.open_sftp()

    try:
        # Clear old dist
        print("\n[1/4] Clearing old dist...")
        run_cmd(client, f"rm -rf {REMOTE}/dist")

        # Upload new dist
        print("\n[2/4] Uploading new dist...")
        n = upload_dir(sftp, SCANNER_DIST, f"{REMOTE}/dist")
        print(f"  [OK] {n} files uploaded")

        # Upload PDFKit font data files (not included in bundle)
        print("\n[3/6] Uploading PDFKit font data...")
        pdfkit_data = os.path.join(BASE, "Python-Webify", "node_modules", "pdfkit", "js", "data")
        if os.path.isdir(pdfkit_data):
            remote_data = f"{REMOTE}/dist/data"
            mkdir_p(sftp, remote_data)
            fc = 0
            for fname in os.listdir(pdfkit_data):
                lp = os.path.join(pdfkit_data, fname)
                if os.path.isfile(lp):
                    sftp.put(lp, f"{remote_data}/{fname}")
                    fc += 1
            print(f"  [OK] {fc} font files uploaded")
        else:
            print("  [SKIP] pdfkit data dir not found")

        # Upload package.json and install deps
        print("\n[4/6] Updating dependencies...")
        sftp.put(SCANNER_PKG, f"{REMOTE}/package.json")
        run_cmd(client, f"cd {REMOTE} && npm install --omit=dev 2>&1 | tail -5")

        # Upload .env for Claude AI keys
        print("\n[5/6] Uploading .env (Claude AI config)...")
        if os.path.exists(SCANNER_ENV):
            sftp.put(SCANNER_ENV, f"{REMOTE}/.env")
            print("  [OK] .env uploaded")
        else:
            print("  [SKIP] No .env file found")

        # Restart PM2
        print("\n[6/6] Restarting PM2...")
        run_cmd(client, "pm2 restart gap-scanner")
        run_cmd(client, "pm2 save")

        # Verify
        print("\n[*] Verifying...")
        import time
        time.sleep(3)
        run_cmd(client, "curl -s -o /dev/null -w 'HTTP %{http_code}' http://localhost:5000/")
        run_cmd(client, "pm2 list")

        print("\n" + "=" * 50)
        print("  Deploy complete!")
        print("=" * 50)

    except Exception as e:
        print(f"\n[ERROR] {e}")
        import traceback
        traceback.print_exc()
    finally:
        sftp.close()
        client.close()


if __name__ == "__main__":
    main()
