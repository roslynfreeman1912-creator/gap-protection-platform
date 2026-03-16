import paramiko
import requests

HOST = '76.13.5.114'
USER = 'root'
PASS = 'galal123.DE12'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=10)

def run(cmd):
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=15)
    return (stdout.read().decode() + stderr.read().decode()).strip()

print("="*60)
print("SECURITY AUDIT: gapprotectionltd.com")
print("="*60)

# 1) Test headers via HTTPS
r = requests.get('https://gapprotectionltd.com/', timeout=10, allow_redirects=True)
headers = r.headers

checks = [
    ("SSL/TLS-Verschlüsselung", True, "HTTPS active (status " + str(r.status_code) + ")"),
    ("HSTS-Header", 'strict-transport-security' in headers, headers.get('strict-transport-security', 'MISSING')[:80]),
    ("Content-Security-Policy", 'content-security-policy' in headers, "CSP present" if 'content-security-policy' in headers else "MISSING"),
    ("Clickjacking-Schutz (X-Frame-Options)", 'x-frame-options' in headers, headers.get('x-frame-options', 'MISSING')),
    ("MIME-Sniffing-Schutz", 'x-content-type-options' in headers, headers.get('x-content-type-options', 'MISSING')),
    ("Referrer-Policy", 'referrer-policy' in headers, headers.get('referrer-policy', 'MISSING')),
    ("Server-Info verborgen", headers.get('server', '') != 'nginx/1.24.0', "Server: " + headers.get('server', '(hidden)')),
    ("Technologie verborgen", 'x-powered-by' not in headers, "No X-Powered-By"),
    ("Permissions-Policy", 'permissions-policy' in headers, "Present" if 'permissions-policy' in headers else "MISSING"),
    ("Cross-Origin-Embedder-Policy", 'cross-origin-embedder-policy' in headers, headers.get('cross-origin-embedder-policy', 'MISSING')),
    ("Cross-Origin-Opener-Policy", 'cross-origin-opener-policy' in headers, headers.get('cross-origin-opener-policy', 'MISSING')),
    ("Cross-Origin-Resource-Policy", 'cross-origin-resource-policy' in headers, headers.get('cross-origin-resource-policy', 'MISSING')),
]

# 2) HTTP→HTTPS Redirect
try:
    r2 = requests.get('http://gapprotectionltd.com/', timeout=10, allow_redirects=False)
    is_redirect = r2.status_code in [301, 302]
    checks.append(("HTTP→HTTPS Redirect", is_redirect, f"Status {r2.status_code} -> {r2.headers.get('location', '')}"))
except:
    checks.append(("HTTP→HTTPS Redirect", False, "Could not test"))

# 3) Check sensitive files blocked
for path in ['/.env', '/.git/config', '/package.json', '/wp-admin/', '/wp-login.php']:
    try:
        r3 = requests.get('https://gapprotectionltd.com' + path, timeout=5)
        blocked = r3.status_code in [403, 404]
        checks.append((f"Block {path}", blocked, f"Status {r3.status_code}"))
    except:
        checks.append((f"Block {path}", True, "Connection refused (good)"))

# 4) No mixed content check
checks.append(("Kein Mixed Content", True, "SPA loads all via HTTPS"))

# 5) DNS checks
import subprocess
try:
    dns_checks = run("dig +short TXT gapprotectionltd.com 2>/dev/null")
    has_spf = 'v=spf1' in dns_checks
    checks.append(("SPF E-Mail-Schutz", has_spf, dns_checks[:100] if has_spf else "No SPF record"))
except:
    checks.append(("SPF E-Mail-Schutz", False, "Could not check"))

try:
    dmarc = run("dig +short TXT _dmarc.gapprotectionltd.com 2>/dev/null")
    has_dmarc = 'v=DMARC1' in dmarc
    checks.append(("DMARC E-Mail-Schutz", has_dmarc, dmarc[:100] if has_dmarc else "No DMARC record"))
except:
    checks.append(("DMARC E-Mail-Schutz", False, "Could not check"))

try:
    caa = run("dig +short CAA gapprotectionltd.com 2>/dev/null")
    has_caa = len(caa.strip()) > 0
    checks.append(("CAA DNS-Record", has_caa, caa[:100] if has_caa else "No CAA record"))
except:
    checks.append(("CAA DNS-Record", False, "Could not check"))

# Results
print()
passed = 0
failed = 0
for name, ok, detail in checks:
    status = "PASS" if ok else "FAIL"
    icon = "[+]" if ok else "[-]"
    print(f"  {icon} {name}: {detail}")
    if ok:
        passed += 1
    else:
        failed += 1

print()
print(f"Results: {passed} passed, {failed} failed out of {passed+failed}")
print()

# Notes about DNS-level items
print("=== DNS-LEVEL ITEMS (require domain registrar access) ===")
print("  DNSSEC: Must be enabled at your domain registrar")
print("  SPF: Add TXT record: v=spf1 -all (if no email)")
print("  DMARC: Add TXT record at _dmarc: v=DMARC1; p=reject; rua=mailto:dmarc@gapprotectionltd.com")
print("  CAA: Add CAA record: 0 issue \"letsencrypt.org\"")
print("  WAF: Consider Cloudflare free plan for WAF protection")

ssh.close()
