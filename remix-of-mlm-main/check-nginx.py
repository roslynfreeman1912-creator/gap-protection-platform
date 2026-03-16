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

print("=== NGINX CONFIG FILES ===")
print(run("find /etc/nginx -name '*.conf' -type f 2>/dev/null"))
print()
print("=== CONF.D ===")
print(run("ls -la /etc/nginx/conf.d/ 2>/dev/null"))
print()
print("=== NGINX.CONF (relevant) ===")
print(run("grep -n 'server\\|location\\|add_header\\|include\\|ssl\\|listen\\|server_name\\|root\\|try_files' /etc/nginx/nginx.conf"))
print()

# Read all conf files for server blocks
for f in run("find /etc/nginx -name '*.conf' -type f 2>/dev/null").split('\n'):
    f = f.strip()
    if f and f != '/etc/nginx/nginx.conf':
        content = run("cat " + f)
        if 'server' in content or 'gapprotection' in content or 'listen' in content:
            print("--- " + f + " ---")
            print(content[:3000])
            print()

ssh.close()
