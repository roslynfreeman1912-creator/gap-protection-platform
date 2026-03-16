import paramiko
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('76.13.5.114', 22, 'root', 'galal123.DE12', timeout=30)

cmds = [
    'cat /etc/nginx/conf.d/gapprotectionltd.conf 2>/dev/null || echo "NOT FOUND"',
    'ls /etc/nginx/sites-enabled/ 2>/dev/null',
    'grep -rln "gapprotectionltd" /etc/nginx/ 2>/dev/null',
]
for cmd in cmds:
    print(f"=== {cmd} ===")
    i,o,e = c.exec_command(cmd)
    print(o.read().decode())

# Now get the actual config file
i,o,e = c.exec_command('grep -rln "gapprotectionltd" /etc/nginx/ 2>/dev/null')
files = o.read().decode().strip().split('\n')
for f in files:
    if f.strip():
        print(f"\n=== CONTENT OF {f} ===")
        i2,o2,e2 = c.exec_command(f'cat {f}')
        print(o2.read().decode())

c.close()
