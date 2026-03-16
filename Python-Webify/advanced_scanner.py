#!/usr/bin/env python3
"""
Advanced Security Scanner for Banking & Call Center Protection
GAP Protection - Professional Vulnerability Assessment Tool
"""
import asyncio
import aiohttp
import yaml
import json
import os
from pathlib import Path
from typing import Dict, List, Optional, Set
from datetime import datetime
from urllib.parse import urljoin, urlparse, parse_qs
from bs4 import BeautifulSoup
from collections import defaultdict
import re
import hashlib

# Import utilities
try:
    from utils.url_validator import validate_url, sanitize_url
    from utils.logger import setup_logger, get_logger
except ImportError:
    # Fallback if utils not available
    def validate_url(url, allow_private=False):
        return True, None
    def sanitize_url(url):
        return url
    def setup_logger(name, **kwargs):
        import logging
        return logging.getLogger(name)
    def get_logger(name):
        import logging
        return logging.getLogger(name)

class AdvancedSecurityScanner:
    """
    Professional-grade security scanner for:
    - Banks
    - Call Centers
    - Enterprise websites
    - Critical infrastructure
    """
    
    def __init__(self, target_url: str, vuln_dir: str = "vuln", allow_private: bool = False):
        # Validate URL
        is_valid, error = validate_url(target_url, allow_private)
        if not is_valid:
            raise ValueError(f"Invalid target URL: {error}")
        
        self.target_url = sanitize_url(target_url)
        self.vuln_dir = Path(vuln_dir)
        self.vulnerabilities = []
        self.payloads_db = {}
        self.verified_vulns = []
        self.admin_panels_found = []
        self.sensitive_files_found = []
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
        
        # Setup logger
        self.logger = get_logger(__name__)
        if not self.logger.handlers:
            log_file = Path("logs") / f"scan_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"
            log_file.parent.mkdir(exist_ok=True)
            setup_logger(__name__, log_file=str(log_file))
        
    def load_all_payloads(self) -> Dict[str, List]:
        """Load all vulnerability payloads from YAML files"""
        payloads = defaultdict(list)
        
        if not self.vuln_dir.exists():
            self.logger.warning(f"Vulnerability directory not found: {self.vuln_dir}")
            print(f"[!] Vulnerability directory not found: {self.vuln_dir}")
            return payloads
            
        yaml_files = list(self.vuln_dir.rglob("*.yaml"))
        self.logger.info(f"Loading {len(yaml_files)} YAML files")
        print(f"[+] Loading {len(yaml_files)} YAML files...")
        
        for yaml_file in yaml_files:
            try:
                with open(yaml_file, 'r', encoding='utf-8', errors='ignore') as f:
                    data = yaml.safe_load(f)
                    
                if not data or not isinstance(data, dict):
                    continue
                
                # Handle different YAML structures
                if "payloads" in data:
                    vuln_type = data.get("type", yaml_file.stem).lower().replace(" ", "_")
                    payloads[vuln_type].extend(data["payloads"])
                    
                if "vulnerabilities" in data:
                    for vuln in data["vulnerabilities"]:
                        if isinstance(vuln, dict) and "payloads" in vuln:
                            vuln_type = vuln.get("type", "unknown").lower().replace(" ", "_")
                            payloads[vuln_type].extend(vuln["payloads"])
                            
            except Exception as e:
                continue
                
        total_payloads = sum(len(v) for v in payloads.values())
        self.logger.info(f"Loaded {total_payloads} payloads from {len(payloads)} categories")
        print(f"[+] Loaded {total_payloads} payloads from {len(payloads)} categories")
        
        return dict(payloads)
    
    async def verify_vulnerability(self, url: str, payload: str, vuln_type: str, 
                                  session: aiohttp.ClientSession) -> Optional[Dict]:
        """
        Verify if vulnerability exists with proof
        """
        try:
            # Test with payload
            test_url = self._inject_payload(url, payload)
            
            async with session.get(test_url, timeout=aiohttp.ClientTimeout(total=10), 
                                  headers=self.headers) as response:
                if response.status != 200:
                    return None
                    
                content = await response.text()
                
                # Get baseline response
                async with session.get(url, timeout=aiohttp.ClientTimeout(total=10), 
                                      headers=self.headers) as baseline:
                    baseline_content = await baseline.text()
                
                # Verify the vulnerability
                verification = self._verify_response(content, baseline_content, 
                                                    vuln_type, payload)
                
                if verification['is_vulnerable']:
                    return {
                        'url': url,
                        'test_url': test_url,
                        'vuln_type': vuln_type,
                        'payload': payload,
                        'proof': verification['proof'],
                        'severity': verification['severity'],
                        'impact': self._get_impact_description(vuln_type),
                        'exploitation': self._get_exploitation_guide(vuln_type),
                        'remediation': self._get_remediation_steps(vuln_type),
                        'cvss_score': self._calculate_cvss(vuln_type),
                        'timestamp': datetime.now().isoformat()
                    }
                    
        except Exception as e:
            pass
            
        return None
    
    def _inject_payload(self, url: str, payload: str) -> str:
        """Inject payload into URL parameters"""
        parsed = urlparse(url)
        if parsed.query:
            params = parse_qs(parsed.query)
            for param in params:
                return url.replace(f"{param}={params[param][0]}", f"{param}={payload}")
        return f"{url}?test={payload}"
    
    def _verify_response(self, test_content: str, baseline_content: str, 
                        vuln_type: str, payload: str) -> Dict:
        """Verify if response indicates vulnerability"""
        
        # SQL Injection indicators
        sql_indicators = [
            "sql syntax", "mysql", "syntax error", "ORA-", "SQLite", 
            "PostgreSQL", "Microsoft SQL", "mysql_fetch", "mysql_num_rows",
            "pg_query", "sqlite3", "ODBC", "Warning: mysql", "Error: mysql"
        ]
        
        # XSS indicators
        xss_indicators = [
            payload in test_content,
            "<script>" in test_content and "<script>" not in baseline_content,
            "onerror=" in test_content and "onerror=" not in baseline_content
        ]
        
        # LFI indicators
        lfi_indicators = [
            "root:x:", "daemon:x:", "[boot loader]", "[operating systems]",
            "/bin/bash", "/bin/sh", "<?php", "<?="
        ]
        
        # Command injection indicators
        cmd_indicators = [
            "uid=", "gid=", "groups=", "total ", "-rw-", "drwx"
        ]
        
        is_vulnerable = False
        proof = []
        severity = "LOW"
        
        if vuln_type == "sql_injection" or vuln_type == "sqli":
            for indicator in sql_indicators:
                if indicator.lower() in test_content.lower() and indicator.lower() not in baseline_content.lower():
                    is_vulnerable = True
                    proof.append(f"SQL error pattern detected: {indicator}")
                    severity = "CRITICAL"
                    
        elif vuln_type == "xss" or vuln_type == "cross_site_scripting":
            if any(xss_indicators):
                is_vulnerable = True
                proof.append(f"XSS payload reflected in response: {payload}")
                severity = "HIGH"
                
        elif vuln_type == "lfi" or vuln_type == "local_file_inclusion":
            for indicator in lfi_indicators:
                if indicator in test_content and indicator not in baseline_content:
                    is_vulnerable = True
                    proof.append(f"LFI indicator found: {indicator}")
                    severity = "CRITICAL"
                    
        elif vuln_type == "rce" or vuln_type == "command_injection":
            for indicator in cmd_indicators:
                if indicator in test_content and indicator not in baseline_content:
                    is_vulnerable = True
                    proof.append(f"Command execution indicator: {indicator}")
                    severity = "CRITICAL"
        
        # Generic change detection
        if test_content != baseline_content and len(test_content) != len(baseline_content):
            if not is_vulnerable:
                is_vulnerable = True
                proof.append("Significant response change detected")
                severity = "MEDIUM"
        
        return {
            'is_vulnerable': is_vulnerable,
            'proof': proof,
            'severity': severity
        }
    
    def _get_impact_description(self, vuln_type: str) -> Dict[str, str]:
        """Get impact description in German and English"""
        impacts = {
            'sql_injection': {
                'de': """
Kritische Auswirkungen für Banken und Call-Center:
• Vollständiger Zugriff auf Kundendatenbanken
• Diebstahl von Kreditkarteninformationen
• Manipulation von Transaktionsdaten
• Zugriff auf vertrauliche Geschäftsdaten
• Mögliche Kompromittierung des gesamten Systems
• Verstoß gegen DSGVO und Bankgeheimnis
                """,
                'en': """
Critical Impact for Banks and Call Centers:
• Complete access to customer databases
• Theft of credit card information
• Manipulation of transaction data
• Access to confidential business data
• Possible compromise of entire system
• GDPR and banking secrecy violations
                """
            },
            'xss': {
                'de': """
Hohe Auswirkungen:
• Session-Hijacking von Bankmitarbeitern
• Phishing-Angriffe auf Kunden
• Diebstahl von Login-Credentials
• Manipulation der Benutzeroberfläche
• Ausführung schädlicher Aktionen im Namen des Benutzers
                """,
                'en': """
High Impact:
• Session hijacking of bank employees
• Phishing attacks on customers
• Theft of login credentials
• Manipulation of user interface
• Execution of malicious actions on behalf of user
                """
            },
            'lfi': {
                'de': """
Kritische Auswirkungen:
• Zugriff auf Systemkonfigurationsdateien
• Auslesen von Datenbank-Credentials
• Offenlegung von Geschäftsgeheimnissen
• Mögliche Code-Ausführung
• Zugriff auf verschlüsselte Daten
                """,
                'en': """
Critical Impact:
• Access to system configuration files
• Reading database credentials
• Disclosure of trade secrets
• Possible code execution
• Access to encrypted data
                """
            },
            'rce': {
                'de': """
Katastrophale Auswirkungen:
• Vollständige Systemübernahme
• Installation von Ransomware
• Datenvernichtung
• Laterale Bewegung im Netzwerk
• Langfristige Backdoor-Installation
                """,
                'en': """
Catastrophic Impact:
• Complete system takeover
• Ransomware installation
• Data destruction
• Lateral movement in network
• Long-term backdoor installation
                """
            }
        }
        
        return impacts.get(vuln_type, {
            'de': 'Sicherheitsrisiko identifiziert',
            'en': 'Security risk identified'
        })
    
    def _get_exploitation_guide(self, vuln_type: str) -> Dict[str, str]:
        """How hackers exploit this vulnerability"""
        guides = {
            'sql_injection': {
                'de': """
Wie Hacker diese Schwachstelle ausnutzen:
1. Identifikation von Eingabefeldern
2. Injektion von SQL-Befehlen
3. Extraktion von Datenbankinhalten
4. Privilege Escalation
5. Ausführung von Administratorbefehlen
6. Datenexfiltration über DNS oder HTTP
                """,
                'en': """
How Hackers Exploit This Vulnerability:
1. Identification of input fields
2. Injection of SQL commands
3. Extraction of database contents
4. Privilege escalation
5. Execution of admin commands
6. Data exfiltration via DNS or HTTP
                """
            },
            'xss': {
                'de': """
Exploitation-Methoden:
1. Injektion von JavaScript-Code
2. Phishing-Seiten einbetten
3. Session-Cookies stehlen
4. Keylogger installieren
5. BeEF-Framework nutzen
6. Drive-by-Downloads initiieren
                """,
                'en': """
Exploitation Methods:
1. Injection of JavaScript code
2. Embedding phishing pages
3. Stealing session cookies
4. Installing keyloggers
5. Using BeEF framework
6. Initiating drive-by downloads
                """
            }
        }
        
        return guides.get(vuln_type, {
            'de': 'Verschiedene Angriffsvektoren möglich',
            'en': 'Various attack vectors possible'
        })
    
    def _get_remediation_steps(self, vuln_type: str) -> Dict[str, str]:
        """Remediation steps in German and English"""
        remediations = {
            'sql_injection': {
                'de': """
Sofortige Abhilfemaßnahmen (KRITISCH):
1. Prepared Statements verwenden (PDO/mysqli)
2. Input-Validierung mit Whitelist
3. Parametrisierte Queries implementieren
4. ORM-Framework einsetzen
5. Minimale Datenbankberechtigungen
6. Web Application Firewall (WAF) aktivieren
7. Regelmäßige Sicherheitsaudits

Code-Beispiel (PHP):
// UNSICHER:
$sql = "SELECT * FROM users WHERE id = " . $_GET['id'];

// SICHER:
$stmt = $pdo->prepare("SELECT * FROM users WHERE id = ?");
$stmt->execute([$_GET['id']]);
                """,
                'en': """
Immediate Remediation Steps (CRITICAL):
1. Use prepared statements (PDO/mysqli)
2. Input validation with whitelist
3. Implement parameterized queries
4. Use ORM framework
5. Minimal database permissions
6. Enable Web Application Firewall (WAF)
7. Regular security audits

Code Example (PHP):
// INSECURE:
$sql = "SELECT * FROM users WHERE id = " . $_GET['id'];

// SECURE:
$stmt = $pdo->prepare("SELECT * FROM users WHERE id = ?");
$stmt->execute([$_GET['id']]);
                """
            },
            'xss': {
                'de': """
Abhilfemaßnahmen:
1. Output-Encoding (HTML-Entities)
2. Content Security Policy (CSP)
3. HTTPOnly und Secure Cookies
4. Input-Sanitization
5. X-XSS-Protection Header

Code-Beispiel (PHP):
// UNSICHER:
echo $_GET['search'];

// SICHER:
echo htmlspecialchars($_GET['search'], ENT_QUOTES, 'UTF-8');
                """,
                'en': """
Remediation Steps:
1. Output encoding (HTML entities)
2. Content Security Policy (CSP)
3. HTTPOnly and Secure cookies
4. Input sanitization
5. X-XSS-Protection header

Code Example (PHP):
// INSECURE:
echo $_GET['search'];

// SECURE:
echo htmlspecialchars($_GET['search'], ENT_QUOTES, 'UTF-8');
                """
            }
        }
        
        return remediations.get(vuln_type, {
            'de': 'Sicherheitspatches anwenden',
            'en': 'Apply security patches'
        })
    
    def _calculate_cvss(self, vuln_type: str) -> float:
        """Calculate CVSS score"""
        scores = {
            'sql_injection': 9.8,
            'rce': 10.0,
            'command_injection': 9.8,
            'lfi': 8.6,
            'xss': 7.5,
            'ssrf': 8.1,
            'xxe': 8.2,
            'csrf': 6.5,
            'idor': 7.0
        }
        return scores.get(vuln_type, 5.0)
    
    async def find_admin_panels(self, session: aiohttp.ClientSession) -> List[Dict]:
        """Comprehensive admin panel detection"""
        admin_paths = [
            '/admin', '/administrator', '/admin.php', '/admin/', '/admin/index.php',
            '/admin/login.php', '/admin/admin.php', '/admin/controlpanel.php',
            '/admin/cp.php', '/admin/admincp.php', '/admin/admin_login.php',
            '/administrator/', '/administrator/index.php', '/administrator/login.php',
            '/adminpanel', '/adminpanel/', '/controlpanel', '/controlpanel/',
            '/admincontrol', '/admin_area', '/admin_area/', '/adminarea',
            '/bb-admin', '/bb-admin/', '/adminLogin', '/admin_login.php',
            '/panel-administracion', '/panel-administracion/', '/instadmin/',
            '/memberadmin', '/memberadmin/', '/administratorlogin',
            '/adm', '/adm/', '/admin/account.php', '/admin/index.html',
            '/admin/login.html', '/admin/admin.html', '/admin_area/admin.php',
            '/admin_area/login.php', '/siteadmin/login.php', '/siteadmin/index.php',
            '/siteadmin/login.html', '/admin/account.html', '/admin/index.php',
            '/admin_area/index.php', '/bb-admin/index.php', '/bb-admin/login.php',
            '/bb-admin/admin.php', '/admin/home.php', '/admin_area/login.html',
            '/admin_area/index.html', '/admin/controlpanel.php', '/admin.html',
            '/admin/cp.php', '/cp.php', '/administrator/index.html',
            '/administrator/login.html', '/nsw/admin/login.php', '/webadmin/login.php',
            '/webadmin/admin.php', '/webadmin/login.html', '/webadmin/index.html',
            '/webadmin/admin.html', '/webadmin/', '/webadmin/admin/admin.php',
            '/webadmin/admin-login.php', '/admin-login.php', '/admin-login.html',
            '/admin/admin-login.php', '/admin-login/', '/admin/admin-login/',
            '/panel', '/panel/', '/panel.php', '/panel.html',
            '/modelsearch/login.php', '/moderator.php', '/moderator.html',
            '/moderator/login.php', '/moderator/admin.php', '/account.php',
            '/account.html', '/controlpanel.php', '/controlpanel.html',
            '/admincontrol.php', '/admincontrol.html', '/admin_login',
            '/panel-admin/', '/wp-admin/', '/wp-login.php', '/login.php',
            '/login.html', '/login/', '/user/login', '/signin', '/sign-in',
            '/dashboard', '/cpanel', '/cpanel/', '/secure', '/secure/',
            '/phpmyadmin', '/phpmyadmin/', '/pma', '/pma/', '/mysql',
            '/mysql/', '/db', '/database', '/backend', '/backend/',
            '/manager', '/manager/', '/maintenance', '/maintenance/'
        ]
        
        found_panels = []
        print(f"\n[+] Scanning for {len(admin_paths)} admin panel paths...")
        
        for path in admin_paths:
            test_url = urljoin(self.target_url, path)
            try:
                async with session.get(test_url, timeout=aiohttp.ClientTimeout(total=5),
                                      headers=self.headers, allow_redirects=True) as response:
                    if response.status == 200:
                        content = await response.text()
                        
                        # Check for admin panel indicators
                        admin_indicators = [
                            'login', 'admin', 'password', 'username', 'administrator',
                            'dashboard', 'control panel', 'signin', 'sign in',
                            'authentication', 'credential', 'management', 'backend'
                        ]
                        
                        if any(indicator.lower() in content.lower() for indicator in admin_indicators):
                            found_panels.append({
                                'url': test_url,
                                'status': response.status,
                                'title': self._extract_title(content),
                                'forms': self._count_forms(content),
                                'severity': 'HIGH',
                                'description_de': 'Admin-Panel öffentlich zugänglich',
                                'description_en': 'Admin panel publicly accessible'
                            })
                            print(f"[!] Found admin panel: {test_url}")
                            
            except Exception:
                continue
        
        return found_panels
    
    async def find_sensitive_files(self, session: aiohttp.ClientSession) -> List[Dict]:
        """Find sensitive files and configurations"""
        sensitive_paths = [
            '/.env', '/.env.local', '/.env.production', '/.env.backup',
            '/config.php', '/configuration.php', '/config.inc.php', '/config.yml',
            '/config.yaml', '/config.json', '/settings.php', '/settings.yml',
            '/database.yml', '/database.php', '/db.php', '/db.yml',
            '/.git/config', '/.git/HEAD', '/.git/index',
            '/.svn/entries', '/.svn/wc.db',
            '/backup.sql', '/database.sql', '/dump.sql', '/backup.zip',
            '/backup.tar.gz', '/backup.tar', '/site-backup.zip',
            '/.htaccess', '/.htpasswd', '/web.config', '/phpinfo.php',
            '/info.php', '/test.php', '/debug.php', '/trace.axd',
            '/elmah.axd', '/error.log', '/access.log', '/app.log',
            '/debug.log', '/composer.json', '/package.json', '/yarn.lock',
            '/Gemfile', '/Gemfile.lock', '/requirements.txt', '/pom.xml',
            '/build.gradle', '/.dockerenv', '/docker-compose.yml',
            '/Dockerfile', '/secrets.yml', '/credentials.yml',
            '/admin/config.php', '/includes/config.php', '/inc/config.php',
            '/application/config/database.php', '/sites/default/settings.php',
            '/wp-config.php', '/wp-config-sample.php', '/wp-admin/install.php',
            '/README.md', '/CHANGELOG.md', '/TODO.md', '/.DS_Store',
            '/Thumbs.db', '/desktop.ini', '/.bash_history', '/.mysql_history',
            '/id_rsa', '/id_rsa.pub', '/.ssh/id_rsa', '/.ssh/authorized_keys',
            '/sftp-config.json', '/ftpconfig.json', '/filezilla.xml',
            '/crossdomain.xml', '/clientaccesspolicy.xml', '/robots.txt',
            '/sitemap.xml', '/server-status', '/server-info',
            '/.well-known/security.txt', '/security.txt'
        ]
        
        found_files = []
        print(f"\n[+] Scanning for {len(sensitive_paths)} sensitive files...")
        
        for path in sensitive_paths:
            test_url = urljoin(self.target_url, path)
            try:
                async with session.get(test_url, timeout=aiohttp.ClientTimeout(total=5),
                                      headers=self.headers) as response:
                    if response.status == 200:
                        content = await response.text()
                        
                        # Check if content looks sensitive
                        sensitive_keywords = [
                            'password', 'secret', 'api_key', 'apikey', 'token',
                            'private_key', 'aws_access', 'database', 'mysql',
                            'postgres', 'mongodb', 'redis', 'smtp', 'mail'
                        ]
                        
                        severity = 'CRITICAL' if any(k in content.lower() for k in sensitive_keywords) else 'HIGH'
                        
                        found_files.append({
                            'url': test_url,
                            'path': path,
                            'size': len(content),
                            'severity': severity,
                            'content_preview': content[:200] if len(content) < 200 else content[:200] + '...',
                            'description_de': f'Sensible Datei öffentlich zugänglich: {path}',
                            'description_en': f'Sensitive file publicly accessible: {path}'
                        })
                        print(f"[!] Found sensitive file: {test_url}")
                        
            except Exception:
                continue
        
        return found_files
    
    def _extract_title(self, html: str) -> str:
        """Extract page title"""
        try:
            soup = BeautifulSoup(html, 'html.parser')
            title = soup.find('title')
            return title.text if title else 'No title'
        except:
            return 'No title'
    
    def _count_forms(self, html: str) -> int:
        """Count forms in HTML"""
        try:
            soup = BeautifulSoup(html, 'html.parser')
            return len(soup.find_all('form'))
        except:
            return 0
    
    async def comprehensive_scan(self) -> Dict:
        """
        Perform comprehensive security scan
        """
        print(f"\n{'='*60}")
        print(f"GAP Protection - Advanced Security Scanner")
        print(f"Target: {self.target_url}")
        print(f"Scan Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"{'='*60}\n")
        
        # Load payloads
        self.payloads_db = self.load_all_payloads()
        
        async with aiohttp.ClientSession() as session:
            # 1. Find admin panels
            print("\n[PHASE 1] Admin Panel Detection")
            self.admin_panels_found = await self.find_admin_panels(session)
            
            # 2. Find sensitive files
            print("\n[PHASE 2] Sensitive File Discovery")
            self.sensitive_files_found = await self.find_sensitive_files(session)
            
            # 3. Vulnerability scanning with all payloads
            print("\n[PHASE 3] Vulnerability Assessment")
            
            # Get URLs to test
            test_urls = [self.target_url]
            # Crawl for more URLs (simplified)
            try:
                async with session.get(self.target_url, timeout=aiohttp.ClientTimeout(total=10),
                                      headers=self.headers) as response:
                    if response.status == 200:
                        html = await response.text()
                        soup = BeautifulSoup(html, 'html.parser')
                        for link in soup.find_all('a', href=True):
                            href = urljoin(self.target_url, link['href'])
                            if '?' in href and urlparse(href).netloc == urlparse(self.target_url).netloc:
                                test_urls.append(href)
            except:
                pass
            
            test_urls = list(set(test_urls))[:50]  # Limit to 50 URLs
            
            # Test each vulnerability type
            for vuln_type, payloads in self.payloads_db.items():
                print(f"\n[+] Testing {vuln_type} ({len(payloads)} payloads)")
                
                for url in test_urls:
                    for payload in payloads[:10]:  # Limit payloads per type
                        result = await self.verify_vulnerability(url, payload, vuln_type, session)
                        if result:
                            self.verified_vulns.append(result)
                            print(f"[!!!] VULNERABILITY CONFIRMED: {vuln_type} at {url}")
        
        # Compile results
        results = {
            'target': self.target_url,
            'scan_time': datetime.now().isoformat(),
            'summary': {
                'total_vulnerabilities': len(self.verified_vulns),
                'critical': len([v for v in self.verified_vulns if v['severity'] == 'CRITICAL']),
                'high': len([v for v in self.verified_vulns if v['severity'] == 'HIGH']),
                'medium': len([v for v in self.verified_vulns if v['severity'] == 'MEDIUM']),
                'admin_panels': len(self.admin_panels_found),
                'sensitive_files': len(self.sensitive_files_found)
            },
            'vulnerabilities': self.verified_vulns,
            'admin_panels': self.admin_panels_found,
            'sensitive_files': self.sensitive_files_found,
            'risk_score': self._calculate_risk_score()
        }
        
        print(f"\n{'='*60}")
        print(f"Scan Complete!")
        print(f"Total Vulnerabilities Found: {len(self.verified_vulns)}")
        print(f"Admin Panels Found: {len(self.admin_panels_found)}")
        print(f"Sensitive Files Found: {len(self.sensitive_files_found)}")
        print(f"Risk Score: {results['risk_score']}/10")
        print(f"{'='*60}\n")
        
        return results
    
    def _calculate_risk_score(self) -> float:
        """Calculate overall risk score (0-10)"""
        score = 0.0
        
        # Vulnerabilities
        for vuln in self.verified_vulns:
            if vuln['severity'] == 'CRITICAL':
                score += 2.0
            elif vuln['severity'] == 'HIGH':
                score += 1.0
            elif vuln['severity'] == 'MEDIUM':
                score += 0.5
        
        # Admin panels
        score += len(self.admin_panels_found) * 0.5
        
        # Sensitive files
        score += len(self.sensitive_files_found) * 0.3
        
        return min(score, 10.0)


async def main():
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python advanced_scanner.py <target_url>")
        sys.exit(1)
    
    target = sys.argv[1]
    scanner = AdvancedSecurityScanner(target)
    results = await scanner.comprehensive_scan()
    
    # Save results
    output_file = f"scan_results_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    
    print(f"[+] Results saved to: {output_file}")


if __name__ == "__main__":
    asyncio.run(main())
