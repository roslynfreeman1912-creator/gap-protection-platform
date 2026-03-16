#!/usr/bin/env python3
"""Verify Nginx whitelist config - all sensitive paths should 404, valid routes should 200."""
import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('76.13.5.114', username='root', password='galal123.DE12')

expected_404 = [
    '/admin/', '/administrator/', '/config/', '/db/', '/phpinfo.php', '/passwords.txt',
    '/backup.zip', '/dump.sql.gz', '/id_rsa', '/env', '/env.json', '/package.json',
    '/docker-compose.yml', '/Dockerfile', '/.git/config', '/wp-login.php',
    '/manager/', '/webadmin/', '/login', '/panel/', '/cPanel', '/grafana/',
    '/config.php', '/wp-config.php', '/config.json', '/settings.json', '/config.yaml',
    '/admin', '/admin.php', '/adminpanel/', '/phpmyadmin/', '/mysql/',
    '/backup/', '/dump/', '/data/', '/secret/', '/private/', '/confidential/',
    '/user/', '/users/', '/api/admin', '/swagger-ui/', '/jenkins/',
]

expected_200 = [
    '/', '/auth', '/register', '/dashboard', '/admin', '/security-test',
    '/legal/privacy', '/assets/index-EG9chf-p.css',
]

print("=== Expected 404 (sensitive paths) ===")
for p in expected_404:
    cmd = 'curl -so /dev/null -w "%{http_code}" https://gapprotectionltd.com' + p + ' 2>/dev/null'
    stdin, stdout, stderr = ssh.exec_command(cmd)
    code = stdout.read().decode().strip()
    status = "OK" if code == "404" else "FAIL"
    print(f"  {status} [{code}] {p}")

print("\n=== Expected 200 (valid SPA routes) ===")
for p in expected_200:
    cmd = 'curl -so /dev/null -w "%{http_code}" https://gapprotectionltd.com' + p + ' 2>/dev/null'
    stdin, stdout, stderr = ssh.exec_command(cmd)
    code = stdout.read().decode().strip()
    status = "OK" if code == "200" else "FAIL"
    print(f"  {status} [{code}] {p}")

ssh.close()
print("\nDone!")
