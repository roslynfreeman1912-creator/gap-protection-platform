import paramiko

HOST = '76.13.5.114'
USER = 'root'
PASS = 'galal123.DE12'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=10)

def run(cmd):
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=15)
    return (stdout.read().decode() + stderr.read().decode()).strip()

print("=== NGINX SITE CONFIG ===")
print(run("cat /etc/nginx/sites-available/gapprotectionltd.com"))
print()
print("=== SITES ENABLED ===")
print(run("ls -la /etc/nginx/sites-enabled/"))
print()
print("=== SSL CERTS ===")
print(run("ls -la /etc/letsencrypt/live/ 2>/dev/null || echo 'no letsencrypt'"))
print()
print("=== NGINX FULL CONF ===")
print(run("cat /etc/nginx/nginx.conf"))

ssh.close()
