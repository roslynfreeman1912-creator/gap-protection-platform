#!/usr/bin/env python3
"""Upload dist/ to server and update Nginx for new asset filenames."""
import paramiko
import os

HOST = '76.13.5.114'
USER = 'root'
PASS = 'galal123.DE12'
LOCAL_DIST = r'C:\Users\taimd\Documents\New folder\remix-of-mlm-main\dist'
REMOTE_DIR = '/var/www/gapprotectionltd'


def upload_dir(sftp, local_dir, remote_dir):
    """Recursively upload a directory."""
    for item in os.listdir(local_dir):
        local_path = os.path.join(local_dir, item)
        remote_path = remote_dir + '/' + item
        if os.path.isfile(local_path):
            sftp.put(local_path, remote_path)
        elif os.path.isdir(local_path):
            try:
                sftp.stat(remote_path)
            except FileNotFoundError:
                sftp.mkdir(remote_path)
            upload_dir(sftp, local_path, remote_path)


def main():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASS)

    # Clean old files
    ssh.exec_command(f'rm -rf {REMOTE_DIR}/*')
    import time; time.sleep(1)

    sftp = ssh.open_sftp()

    # Ensure remote dirs exist
    try:
        sftp.stat(REMOTE_DIR)
    except FileNotFoundError:
        sftp.mkdir(REMOTE_DIR)

    try:
        sftp.stat(REMOTE_DIR + '/assets')
    except FileNotFoundError:
        sftp.mkdir(REMOTE_DIR + '/assets')

    upload_dir(sftp, LOCAL_DIST, REMOTE_DIR)
    sftp.close()

    # Count uploaded files
    stdin, stdout, stderr = ssh.exec_command(f'find {REMOTE_DIR} -type f | wc -l')
    count = stdout.read().decode().strip()
    print(f'Uploaded {count} files')

    # Get new CSS filename for Nginx config
    stdin, stdout, stderr = ssh.exec_command(f'ls {REMOTE_DIR}/assets/index-*.css')
    css_file = stdout.read().decode().strip().split('/')[-1]
    print(f'CSS file: {css_file}')

    # Update nginx config with new CSS filename
    stdin, stdout, stderr = ssh.exec_command(f'cat /etc/nginx/sites-available/gapprotectionltd.com')
    config = stdout.read().decode()

    # Replace old CSS reference if any
    import re
    config = re.sub(r'index-[A-Za-z0-9_-]+\.css', css_file, config)

    sftp2 = ssh.open_sftp()
    with sftp2.open('/etc/nginx/sites-available/gapprotectionltd.com', 'w') as f:
        f.write(config)
    sftp2.close()

    # Reload nginx
    stdin, stdout, stderr = ssh.exec_command('nginx -t 2>&1 && systemctl reload nginx 2>&1')
    out = stdout.read().decode().strip() + stderr.read().decode().strip()
    print(f'Nginx: {out}')

    # Verify
    stdin, stdout, stderr = ssh.exec_command('curl -so /dev/null -w "%{http_code}" https://gapprotectionltd.com/ 2>/dev/null')
    print(f'Site status: {stdout.read().decode().strip()}')

    ssh.close()
    print('Deploy complete!')


if __name__ == '__main__':
    main()
