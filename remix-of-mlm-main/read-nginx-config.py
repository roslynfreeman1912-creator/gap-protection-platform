#!/usr/bin/env python3
"""Read nginx config from VPS"""
import paramiko
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('76.13.5.114', username='root', password='galal123.DE12')
stdin, stdout, stderr = c.exec_command('cat /etc/nginx/sites-enabled/gapprotectionltd.com')
stdout.channel.recv_exit_status()
print(stdout.read().decode())
err = stderr.read().decode()
if err:
    print("STDERR:", err)
c.close()
