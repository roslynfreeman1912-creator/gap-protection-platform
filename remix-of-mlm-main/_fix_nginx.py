import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('76.13.5.114', 22, 'root', 'galal123.DE12', timeout=30)

# Add /mlm to the nginx SPA routes whitelist
cmd = r"""
sed -i '/location = \/callcenter/a\    location = /mlm { try_files /index.html =404; }' /etc/nginx/sites-available/gapprotectionltd.com
nginx -t && systemctl reload nginx
echo "DONE"
"""
print("Adding /mlm route to nginx...")
i, o, e = c.exec_command(cmd)
print(o.read().decode())
err = e.read().decode()
if err:
    print("STDERR:", err)

# Verify
print("\nVerifying route exists:")
i2, o2, e2 = c.exec_command("grep -n 'mlm' /etc/nginx/sites-available/gapprotectionltd.com")
print(o2.read().decode())

# Test the URL
print("Testing /mlm:")
i3, o3, e3 = c.exec_command("curl -s -o /dev/null -w 'HTTP %{http_code}' https://gapprotectionltd.com/mlm")
print(o3.read().decode())

c.close()
