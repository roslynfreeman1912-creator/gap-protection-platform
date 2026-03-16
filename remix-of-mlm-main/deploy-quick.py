#!/usr/bin/env python3
"""Quick deploy: Upload admin dashboard dist to VPS."""
import paramiko
import os

HOST = "76.13.5.114"
USER = "root"
PASS = "galal123.DE12"
BASE = os.path.dirname(os.path.abspath(__file__))
LOCAL_DIST = os.path.join(BASE, "dist")
REMOTE = "/var/www/gapprotectionltd"


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
    if not os.path.isdir(LOCAL_DIST):
        print(f"ERROR: dist folder not found at {LOCAL_DIST}")
        print("Run 'npm run build' first.")
        return

    print("=" * 50)
    print("  GAP Protection - Quick Admin Deploy")
    print("=" * 50)

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"[*] Connecting to {HOST}...")
    client.connect(HOST, 22, USER, PASS, timeout=30)
    print("[OK] Connected!")
    sftp = client.open_sftp()

    try:
        # Backup current
        print("\n[1/4] Backing up current deployment...")
        run_cmd(client, f"rm -rf {REMOTE}.bak && cp -r {REMOTE} {REMOTE}.bak 2>/dev/null || true")

        # Clear old files
        print("\n[2/4] Clearing old files...")
        run_cmd(client, f"rm -rf {REMOTE}/*")

        # Upload new dist
        print("\n[3/4] Uploading new dist...")
        n = upload_dir(sftp, LOCAL_DIST, REMOTE)
        print(f"  [OK] {n} files uploaded")

        # Fix permissions & reload nginx
        print("\n[4/4] Setting permissions & reloading nginx...")
        run_cmd(client, f"chown -R www-data:www-data {REMOTE}")
        run_cmd(client, f"chmod -R 755 {REMOTE}")
        run_cmd(client, "nginx -t && systemctl reload nginx")

        # Verify
        print("\n[*] Verifying...")
        import time
        time.sleep(2)
        run_cmd(client, "curl -s -o /dev/null -w 'HTTP %{http_code}' https://gapprotectionltd.com/")

        print("\n" + "=" * 50)
        print("  DEPLOY COMPLETE!")
        print("=" * 50)

    finally:
        sftp.close()
        client.close()


if __name__ == "__main__":
    main()
