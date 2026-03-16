#!/usr/bin/env python3
import paramiko
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('76.13.5.114', username='root', password='galal123.DE12')

# Find all limit_req_zone and limit_conn_zone definitions
i,o,e = c.exec_command("grep -rn 'limit_req_zone\\|limit_conn_zone' /etc/nginx/ 2>/dev/null")
o.channel.recv_exit_status()
print('EXISTING ZONES:')
print(o.read().decode())

# Check all conf.d files
i,o,e = c.exec_command('ls -la /etc/nginx/conf.d/')
o.channel.recv_exit_status()
print('CONF.D FILES:')
print(o.read().decode())

# Check nginx.conf for includes
i,o,e = c.exec_command("grep -n 'include\\|limit_' /etc/nginx/nginx.conf 2>/dev/null")
o.channel.recv_exit_status()
print('NGINX.CONF:')
print(o.read().decode())

c.close()
