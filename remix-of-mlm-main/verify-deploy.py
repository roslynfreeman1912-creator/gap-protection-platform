import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('76.13.5.114', username='root', password='galal123.DE12')

# Fix ownership
stdin, stdout, stderr = ssh.exec_command('chown -R www-data:www-data /var/www/gapprotectionltd')
stdout.channel.recv_exit_status()

# Verify assets
stdin, stdout, stderr = ssh.exec_command('ls -la /var/www/gapprotectionltd/assets/ | head -20')
print(stdout.read().decode())

# Reload nginx
stdin, stdout, stderr = ssh.exec_command('systemctl reload nginx')
stdout.channel.recv_exit_status()
print('Nginx reloaded')

# Quick test
cmd = "curl -s -o /dev/null -w '%{http_code}' https://gapprotectionltd.com/"
stdin, stdout, stderr = ssh.exec_command(cmd)
print('HTTP status:', stdout.read().decode())

# Test light-scan
cmd2 = """curl -s -X POST https://pqnzsihfryjnnhdubisk.supabase.co/functions/v1/light-scan -H "Content-Type: application/json" -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxbnpzaWhmcnlqbm5oZHViaXNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDgzNzk4NjcsImV4cCI6MjA2Mzk1NTg2N30.wrMRJnMmOBaMXiTw4oCPcfkD2RXBIF53KMFo9VBjqsg" -d '{"domain":"example.com"}' | head -c 500"""
stdin, stdout, stderr = ssh.exec_command(cmd2)
print('Light-scan response:', stdout.read().decode()[:500])
print('Light-scan errors:', stderr.read().decode()[:200])

ssh.close()
print('Done!')
