#!/usr/bin/env python3
"""
+==================================================================+
|              DER TEUFEL - Enterprise Security Scanner             |
|              GAP Protection Cybersecurity Platform                |
|                                                                  |
|  Unternehmen: GAP Protection GmbH                                |
|  Version: 3.0.0 Enterprise                                      |
|  Sprache: Deutsch (Standard) / English (Export)                  |
+==================================================================+
"""

import sys
import os
import io

# Fix Windows console encoding for rich output
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")
    os.environ["PYTHONIOENCODING"] = "utf-8"

import asyncio
import aiohttp
import socket
import ssl
import json
import re
import hashlib
import time
import yaml
from datetime import datetime
from urllib.parse import urljoin, urlparse, parse_qs, quote
from pathlib import Path
from typing import Dict, List, Set, Optional, Tuple, Any
from collections import defaultdict

try:
    from bs4 import BeautifulSoup
    from rich.console import Console
    from rich.table import Table
    from rich.progress import Progress, SpinnerColumn, BarColumn, TextColumn, TimeElapsedColumn
    from rich.panel import Panel
    from rich.text import Text
    from rich.tree import Tree
    from rich.columns import Columns
    from rich.live import Live
    from rich.layout import Layout
    from rich.markdown import Markdown
    import dns.resolver
    import whois
except ImportError as e:
    print(f"[!] Missing dependency: {e}")
    print("    pip install aiohttp beautifulsoup4 rich dnspython python-whois pyyaml")
    sys.exit(1)

console = Console(force_terminal=True)

# ─────────────────────────────────────────────────
# COMPANY BRANDING
# ─────────────────────────────────────────────────
COMPANY_NAME = "GAP Protection GmbH"
COMPANY_TAGLINE = "Enterprise Cybersecurity Solutions"
SCANNER_VERSION = "3.0.0"
SCANNER_NAME = "DER TEUFEL"

BANNER = r"""
[bold red]
  ____  _____ ____    _____ _____ _   _ _____ _____ _     
 |  _ \| ____|  _ \  |_   _| ____| | | |  ___| ____| |    
 | | | |  _| | |_) |   | | |  _| | | | | |_  |  _| | |    
 | |_| | |___|  _ <    | | | |___| |_| |  _| | |___| |___ 
 |____/|_____|_| \_\   |_| |_____|\___/|_|   |_____|_____|
[/bold red]
[bold white]  =================================================================[/bold white]
[bold cyan]  GAP Protection GmbH - Enterprise Security Scanner v{version}[/bold cyan]
[bold yellow]  Sicherheitsanalyse fuer Unternehmen | Security Analysis for Enterprise[/bold yellow]
[dim]  11.442+ Schwachstellen-Payloads | 57+ Schwachstellentypen | AI-Analyse[/dim]
""".format(version=SCANNER_VERSION)

# ─────────────────────────────────────────────────
# HEADERS
# ─────────────────────────────────────────────────
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7",
    "Accept-Encoding": "gzip, deflate",
    "Connection": "keep-alive",
}

# ─────────────────────────────────────────────────
# BILINGUAL TRANSLATIONS
# ─────────────────────────────────────────────────
TRANSLATIONS = {
    "de": {
        "scan_start": "Scan gestartet",
        "scan_complete": "Scan abgeschlossen",
        "target": "Ziel",
        "vulnerabilities_found": "Schwachstellen gefunden",
        "severity": "Schweregrad",
        "critical": "KRITISCH",
        "high": "HOCH",
        "medium": "MITTEL",
        "low": "NIEDRIG",
        "info": "INFO",
        "description": "Beschreibung",
        "solution": "Lösung",
        "evidence": "Beweis",
        "risk": "Risiko",
        "impact": "Auswirkung",
        "exploitation": "Ausnutzung",
        "remediation": "Behebung",
        "admin_panels": "Admin-Panels gefunden",
        "sensitive_files": "Sensible Dateien gefunden",
        "real_ip": "Echte IP-Adresse",
        "promo_codes": "Promo-Codes gefunden",
        "code_signing": "Code-Signierung",
        "payload_count": "Payload-Anzahl",
        "scan_duration": "Scan-Dauer",
        "report_title": "Sicherheitsbericht",
        "executive_summary": "Zusammenfassung",
        "technical_details": "Technische Details",
        "dns_info": "DNS-Informationen",
        "ssl_info": "SSL/TLS-Informationen",
        "technology": "Technologie-Erkennung",
        "headers_analysis": "Header-Analyse",
        "port_scan": "Port-Scan",
        "whois_info": "WHOIS-Informationen",
        "no_vulns": "Keine Schwachstellen gefunden",
        "scanning": "Wird gescannt",
        "loading_payloads": "Lade Payloads",
        "checking": "Prüfe",
    },
    "en": {
        "scan_start": "Scan started",
        "scan_complete": "Scan complete",
        "target": "Target",
        "vulnerabilities_found": "Vulnerabilities found",
        "severity": "Severity",
        "critical": "CRITICAL",
        "high": "HIGH",
        "medium": "MEDIUM",
        "low": "LOW",
        "info": "INFO",
        "description": "Description",
        "solution": "Solution",
        "evidence": "Evidence",
        "risk": "Risk",
        "impact": "Impact",
        "exploitation": "Exploitation",
        "remediation": "Remediation",
        "admin_panels": "Admin panels found",
        "sensitive_files": "Sensitive files found",
        "real_ip": "Real IP address",
        "promo_codes": "Promo codes found",
        "code_signing": "Code signing",
        "payload_count": "Payload count",
        "scan_duration": "Scan duration",
        "report_title": "Security Report",
        "executive_summary": "Executive Summary",
        "technical_details": "Technical Details",
        "dns_info": "DNS Information",
        "ssl_info": "SSL/TLS Information",
        "technology": "Technology Detection",
        "headers_analysis": "Headers Analysis",
        "port_scan": "Port Scan",
        "whois_info": "WHOIS Information",
        "no_vulns": "No vulnerabilities found",
        "scanning": "Scanning",
        "loading_payloads": "Loading payloads",
        "checking": "Checking",
    }
}

# ─────────────────────────────────────────────────
# CVSS 3.1 DATABASE
# ─────────────────────────────────────────────────
CVSS_DATABASE = {
    "sql-injection": {"score": 9.8, "vector": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H", "cwe": "CWE-89", "owasp": "A03:2021"},
    "xss": {"score": 6.1, "vector": "CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N", "cwe": "CWE-79", "owasp": "A03:2021"},
    "stored-xss": {"score": 8.1, "vector": "CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:H/I:L/A:N", "cwe": "CWE-79", "owasp": "A03:2021"},
    "lfi": {"score": 7.5, "vector": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N", "cwe": "CWE-98", "owasp": "A01:2021"},
    "rfi": {"score": 9.8, "vector": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H", "cwe": "CWE-98", "owasp": "A03:2021"},
    "command-injection": {"score": 9.8, "vector": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H", "cwe": "CWE-78", "owasp": "A03:2021"},
    "ssrf": {"score": 9.1, "vector": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N", "cwe": "CWE-918", "owasp": "A10:2021"},
    "xxe": {"score": 7.5, "vector": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N", "cwe": "CWE-611", "owasp": "A05:2021"},
    "csrf": {"score": 6.5, "vector": "CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:U/C:N/I:H/A:N", "cwe": "CWE-352", "owasp": "A01:2021"},
    "ssti": {"score": 9.8, "vector": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H", "cwe": "CWE-1336", "owasp": "A03:2021"},
    "path-traversal": {"score": 7.5, "vector": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N", "cwe": "CWE-22", "owasp": "A01:2021"},
    "open-redirect": {"score": 6.1, "vector": "CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N", "cwe": "CWE-601", "owasp": "A01:2021"},
    "idor": {"score": 6.5, "vector": "CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N", "cwe": "CWE-639", "owasp": "A01:2021"},
    "rce": {"score": 10.0, "vector": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H", "cwe": "CWE-94", "owasp": "A03:2021"},
    "deserialization": {"score": 9.8, "vector": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H", "cwe": "CWE-502", "owasp": "A08:2021"},
    "upload": {"score": 9.8, "vector": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H", "cwe": "CWE-434", "owasp": "A04:2021"},
    "header-missing": {"score": 4.3, "vector": "CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:U/C:N/I:L/A:N", "cwe": "CWE-693", "owasp": "A05:2021"},
    "info-disclosure": {"score": 5.3, "vector": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N", "cwe": "CWE-200", "owasp": "A01:2021"},
    "sensitive-file": {"score": 7.5, "vector": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N", "cwe": "CWE-538", "owasp": "A01:2021"},
    "admin-panel": {"score": 5.3, "vector": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N", "cwe": "CWE-200", "owasp": "A01:2021"},
    "crlf": {"score": 6.1, "vector": "CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N", "cwe": "CWE-93", "owasp": "A03:2021"},
    "host-injection": {"score": 6.1, "vector": "CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N", "cwe": "CWE-644", "owasp": "A05:2021"},
    "cors": {"score": 7.5, "vector": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N", "cwe": "CWE-942", "owasp": "A05:2021"},
    "clickjacking": {"score": 4.3, "vector": "CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:U/C:N/I:L/A:N", "cwe": "CWE-1021", "owasp": "A04:2021"},
    "object-injection": {"score": 9.8, "vector": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H", "cwe": "CWE-502", "owasp": "A08:2021"},
}

# ─────────────────────────────────────────────────
# ADMIN PANEL PATHS
# ─────────────────────────────────────────────────
ADMIN_PATHS = [
    "/admin", "/administrator", "/admin/login", "/admin.php", "/admin/index.php",
    "/admin/admin.php", "/admin/account.php", "/admin_area", "/admin-area",
    "/admin_area/admin.php", "/admin_area/login.php", "/siteadmin", "/siteadmin/login",
    "/wp-admin", "/wp-login.php", "/cpanel", "/panel", "/controlpanel",
    "/admin/controlpanel", "/adminpanel", "/admin-panel", "/webadmin",
    "/adminLogin", "/admin_login", "/panel-administracion", "/administration",
    "/instadmin", "/memberadmin", "/administratorlogin", "/adm",
    "/admin/account", "/admin/dashboard", "/admin/home", "/admin/manage",
    "/phpmyadmin", "/phpMyAdmin", "/pma", "/mysql", "/myadmin",
    "/adminer", "/adminer.php", "/dbadmin", "/pgadmin",
    "/manager", "/manager/html", "/jmx-console", "/web-console",
    "/console", "/system/console", "/admin-console", "/system-admin",
    "/backoffice", "/backend", "/cms", "/cms/admin", "/cms/login",
    "/portal", "/portal/admin", "/intranet", "/intranet/admin",
    "/remote", "/remote/login", "/login", "/signin", "/auth",
    "/grafana", "/kibana", "/jenkins", "/gitlab", "/sonarqube",
    "/prometheus", "/traefik", "/portainer", "/rancher",
    "/api/admin", "/api/v1/admin", "/api/v2/admin",
    "/wp-admin/admin-ajax.php", "/wp-json", "/wp-content",
    "/user/login", "/user/admin", "/account/login",
    "/filemanager", "/file-manager", "/uploads", "/upload",
    "/.env", "/config", "/configuration", "/setup", "/install",
]

# ─────────────────────────────────────────────────
# SENSITIVE FILE PATHS  
# ─────────────────────────────────────────────────
SENSITIVE_PATHS = [
    "/.git/", "/.git/config", "/.git/HEAD", "/.svn/", "/.svn/entries",
    "/.env", "/.env.local", "/.env.production", "/.env.development",
    "/config.php", "/wp-config.php", "/configuration.php", "/config.yml",
    "/config.json", "/settings.json", "/appsettings.json", "/web.config",
    "/.htaccess", "/.htpasswd", "/robots.txt", "/sitemap.xml",
    "/.idea/", "/.vscode/", "/vendor/", "/node_modules/",
    "/backup/", "/backup.sql", "/backup.zip", "/backup.tar.gz",
    "/db/", "/database/", "/sql/", "/dump.sql", "/database.sql",
    "/.ds_store", "/thumbs.db", "/desktop.ini",
    "/server-status", "/server-info", "/phpinfo.php", "/info.php",
    "/test.php", "/debug.php", "/error_log", "/access_log",
    "/composer.json", "/composer.lock", "/package.json", "/package-lock.json",
    "/yarn.lock", "/Gemfile", "/Gemfile.lock", "/requirements.txt",
    "/Pipfile", "/Pipfile.lock", "/go.mod", "/go.sum",
    "/Dockerfile", "/docker-compose.yml", "/.dockerignore",
    "/Vagrantfile", "/Makefile", "/Rakefile", "/Gruntfile.js",
    "/gulpfile.js", "/webpack.config.js", "/tsconfig.json",
    "/swagger.json", "/swagger.yaml", "/openapi.json", "/openapi.yaml",
    "/api-docs", "/graphql", "/graphiql",
    "/crossdomain.xml", "/clientaccesspolicy.xml",
    "/security.txt", "/.well-known/security.txt",
    "/readme.md", "/README.md", "/CHANGELOG.md", "/LICENSE",
    "/credentials", "/secrets", "/private", "/keys",
    "/id_rsa", "/id_rsa.pub", "/authorized_keys",
    "/.ssh/", "/xmlrpc.php", "/wp-cron.php",
    "/cgi-bin/", "/fcgi-bin/",
    "/trace.axd", "/elmah.axd",
    "/.well-known/", "/favicon.ico",
]

# ─────────────────────────────────────────────────
# COMMON PORTS
# ─────────────────────────────────────────────────
COMMON_PORTS = {
    21: ("FTP", "Dateiübertragungsprotokoll"),
    22: ("SSH", "Secure Shell"),
    23: ("Telnet", "Unsicheres Terminal"),
    25: ("SMTP", "E-Mail-Versand"),
    53: ("DNS", "Domain Name System"),
    80: ("HTTP", "Webserver"),
    110: ("POP3", "E-Mail-Abruf"),
    143: ("IMAP", "E-Mail-Abruf"),
    443: ("HTTPS", "Sicherer Webserver"),
    445: ("SMB", "Dateifreigabe"),
    993: ("IMAPS", "Sicherer E-Mail-Abruf"),
    995: ("POP3S", "Sicherer E-Mail-Abruf"),
    1433: ("MSSQL", "Microsoft SQL Server"),
    1521: ("Oracle", "Oracle Datenbank"),
    3306: ("MySQL", "MySQL Datenbank"),
    3389: ("RDP", "Remote Desktop"),
    5432: ("PostgreSQL", "PostgreSQL Datenbank"),
    5900: ("VNC", "Remote Desktop"),
    6379: ("Redis", "In-Memory Datenbank"),
    8080: ("HTTP-Alt", "Alternativer Webserver"),
    8443: ("HTTPS-Alt", "Alternativer HTTPS"),
    8888: ("HTTP-Alt2", "Alternativer Webserver"),
    9200: ("Elasticsearch", "Suchmaschine"),
    27017: ("MongoDB", "NoSQL Datenbank"),
}


class PayloadLoader:
    """Loads all vulnerability payloads from YAML files"""

    def __init__(self, vuln_dir: str):
        self.vuln_dir = Path(vuln_dir)
        self.payloads: Dict[str, List[Dict]] = defaultdict(list)
        self.total_loaded = 0
        self.categories: Dict[str, int] = defaultdict(int)

    def load_all(self) -> int:
        if not self.vuln_dir.exists():
            console.print(f"[red]Verzeichnis nicht gefunden: {self.vuln_dir}[/red]")
            return 0

        yaml_files = list(self.vuln_dir.rglob("*.yaml"))
        loaded = 0

        for yf in yaml_files:
            try:
                with open(yf, "r", encoding="utf-8", errors="ignore") as f:
                    data = yaml.safe_load(f)
                if not data:
                    continue

                if isinstance(data, dict):
                    if "payloads" in data:
                        vuln_type = data.get("type", data.get("name", yf.stem)).lower()
                        severity = data.get("severity", "medium").lower()
                        name = data.get("name", yf.stem)
                        payloads = data["payloads"] if isinstance(data["payloads"], list) else []
                        self.payloads[vuln_type].append({
                            "name": name,
                            "severity": severity,
                            "payloads": payloads,
                            "paths": data.get("paths", []),
                            "matcher": data.get("matcher", []),
                            "methods": data.get("methods", ["GET"]),
                            "headers": data.get("headers", {}),
                            "description": data.get("description", ""),
                            "source": str(yf.name),
                        })
                        loaded += len(payloads)
                        self.categories[vuln_type] += len(payloads)
                    elif "vulnerabilities" in data:
                        for vuln in data["vulnerabilities"]:
                            if isinstance(vuln, dict) and "payloads" in vuln:
                                vuln_type = vuln.get("type", "unknown").lower()
                                self.payloads[vuln_type].append({
                                    "name": vuln.get("name", ""),
                                    "severity": vuln.get("severity", "medium").lower(),
                                    "payloads": vuln["payloads"],
                                    "paths": vuln.get("paths", []),
                                    "matcher": vuln.get("matcher", []),
                                    "methods": vuln.get("methods", ["GET"]),
                                    "headers": vuln.get("headers", {}),
                                    "description": vuln.get("description", ""),
                                    "source": str(yf.name),
                                })
                                loaded += len(vuln["payloads"])
                                self.categories[vuln_type] += len(vuln["payloads"])
            except Exception:
                continue

        self.total_loaded = loaded
        return loaded


class TeufelScanner:
    """Enterprise-grade vulnerability scanner"""

    def __init__(self, target: str, lang: str = "de", company: str = COMPANY_NAME):
        self.target = target.rstrip("/")
        self.lang = lang
        self.company = company
        self.t = TRANSLATIONS.get(lang, TRANSLATIONS["de"])
        self.parsed = urlparse(self.target)
        self.domain = self.parsed.netloc
        self.base_url = f"{self.parsed.scheme}://{self.parsed.netloc}"
        self.vulnerabilities: List[Dict] = []
        self.admin_panels: List[Dict] = []
        self.sensitive_files: List[Dict] = []
        self.open_ports: List[Dict] = []
        self.dns_records: Dict[str, List] = {}
        self.ssl_info: Dict = {}
        self.whois_info: Dict = {}
        self.real_ip: str = ""
        self.cdn_detected: str = ""
        self.tech_stack: Dict = {}
        self.server_info: Dict = {}
        self.response_headers: Dict = {}
        self.promo_codes: List[str] = []
        self.code_signatures: List[Dict] = []
        self.links_found: Set[str] = set()
        self.forms_found: Set[str] = set()
        self.folders_found: Set[str] = set()
        self.scan_start: float = 0
        self.scan_end: float = 0
        self.payload_loader: Optional[PayloadLoader] = None

    def _severity_color(self, severity: str) -> str:
        s = severity.lower()
        if s in ("critical", "kritisch"):
            return "bold red"
        elif s in ("high", "hoch"):
            return "red"
        elif s in ("medium", "mittel"):
            return "yellow"
        elif s in ("low", "niedrig"):
            return "blue"
        return "dim"

    def _get_cvss(self, vuln_type: str) -> Dict:
        normalized = vuln_type.lower().replace(" ", "-").replace("_", "-")
        for key, val in CVSS_DATABASE.items():
            if key in normalized or normalized in key:
                return val
        return {"score": 5.0, "vector": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:L/A:N", "cwe": "CWE-200", "owasp": "A05:2021"}

    async def resolve_real_ip(self):
        """Resolve real IP behind CDN/WAF"""
        console.print("[cyan]  Echte IP-Adresse wird aufgelöst...[/cyan]")
        domain = self.domain.split(":")[0]

        # Method 1: Direct DNS A record
        try:
            answers = dns.resolver.resolve(domain, "A")
            ips = [str(r) for r in answers]
            if ips:
                self.real_ip = ips[0]
        except Exception:
            pass

        # Method 2: Check for CDN headers
        cdn_indicators = {
            "cloudflare": ["cf-ray", "cf-cache-status", "cf-connecting-ip"],
            "akamai": ["x-akamai-transformed", "akamai-origin-hop"],
            "fastly": ["x-served-by", "x-cache", "x-fastly-request-id"],
            "cloudfront": ["x-amz-cf-id", "x-amz-cf-pop"],
            "sucuri": ["x-sucuri-id", "x-sucuri-cache"],
            "incapsula": ["x-iinfo", "x-cdn"],
        }

        for cdn_name, headers_list in cdn_indicators.items():
            for header in headers_list:
                if header.lower() in {k.lower() for k in self.response_headers.keys()}:
                    self.cdn_detected = cdn_name.upper()
                    break

        # Method 3: Try to bypass CDN with common subdomains
        bypass_domains = [
            f"direct.{domain}", f"origin.{domain}", f"backend.{domain}",
            f"real.{domain}", f"mail.{domain}", f"ftp.{domain}",
            f"cpanel.{domain}", f"webmail.{domain}", f"ns1.{domain}",
            f"mx.{domain}", f"smtp.{domain}", f"pop.{domain}",
        ]

        for bd in bypass_domains:
            try:
                answers = dns.resolver.resolve(bd, "A")
                for r in answers:
                    ip = str(r)
                    if ip != self.real_ip and not ip.startswith(("10.", "172.16.", "192.168.")):
                        console.print(f"  [green]Mögliche echte IP via {bd}: {ip}[/green]")
            except Exception:
                continue

        # Method 4: Historical DNS / MX record IP
        try:
            mx_records = dns.resolver.resolve(domain, "MX")
            for mx in mx_records:
                mx_domain = str(mx.exchange).rstrip(".")
                try:
                    mx_ips = dns.resolver.resolve(mx_domain, "A")
                    for ip_r in mx_ips:
                        ip = str(ip_r)
                        if ip != self.real_ip:
                            console.print(f"  [green]MX-Server IP: {ip} ({mx_domain})[/green]")
                except Exception:
                    pass
        except Exception:
            pass

        if self.real_ip:
            console.print(f"  [bold green]Primäre IP: {self.real_ip}[/bold green]")
            if self.cdn_detected:
                console.print(f"  [yellow]CDN erkannt: {self.cdn_detected}[/yellow]")

    async def scan_dns(self):
        """Full DNS enumeration"""
        console.print("[cyan]  DNS-Aufklärung...[/cyan]")
        domain = self.domain.split(":")[0]
        record_types = ["A", "AAAA", "MX", "NS", "TXT", "CNAME", "SOA"]

        for rtype in record_types:
            try:
                answers = dns.resolver.resolve(domain, rtype)
                records = [str(r) for r in answers]
                self.dns_records[rtype] = records
                console.print(f"    [green]{rtype}: {', '.join(records[:3])}{'...' if len(records) > 3 else ''}[/green]")
            except Exception:
                continue

    async def scan_ssl(self):
        """SSL/TLS certificate analysis"""
        console.print("[cyan]  SSL/TLS-Analyse...[/cyan]")
        domain = self.domain.split(":")[0]
        try:
            ctx = ssl.create_default_context()
            with socket.create_connection((domain, 443), timeout=10) as sock:
                with ctx.wrap_socket(sock, server_hostname=domain) as ssock:
                    cert = ssock.getpeercert()
                    cipher = ssock.cipher()
                    version = ssock.version()

                    self.ssl_info = {
                        "subject": dict(x[0] for x in cert.get("subject", ())),
                        "issuer": dict(x[0] for x in cert.get("issuer", ())),
                        "version": version,
                        "cipher": cipher[0] if cipher else "Unknown",
                        "bits": cipher[2] if cipher and len(cipher) > 2 else 0,
                        "notBefore": cert.get("notBefore", ""),
                        "notAfter": cert.get("notAfter", ""),
                        "serialNumber": cert.get("serialNumber", ""),
                        "san": [v for _, v in cert.get("subjectAltName", ())],
                    }

                    # Grade the SSL
                    grade = "A+"
                    if "TLSv1.0" in version or "SSLv3" in version:
                        grade = "F"
                    elif "TLSv1.1" in version:
                        grade = "C"
                    elif cipher and cipher[2] < 128:
                        grade = "B"
                    self.ssl_info["grade"] = grade

                    console.print(f"    [green]TLS: {version} | Cipher: {cipher[0] if cipher else 'N/A'} | Grade: {grade}[/green]")
        except Exception as e:
            self.ssl_info = {"error": str(e)}
            console.print(f"    [yellow]SSL nicht verfügbar: {e}[/yellow]")

    async def scan_ports(self):
        """Port scanning with service detection"""
        console.print("[cyan]  Port-Scan...[/cyan]")
        ip = self.real_ip or self.domain.split(":")[0]

        try:
            ip = socket.gethostbyname(ip)
        except Exception:
            pass

        for port, (service, desc) in COMMON_PORTS.items():
            try:
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.settimeout(2)
                result = sock.connect_ex((ip, port))
                if result == 0:
                    self.open_ports.append({
                        "port": port,
                        "service": service,
                        "description": desc,
                        "state": "open",
                    })
                    console.print(f"    [green]Port {port} ({service}): OFFEN - {desc}[/green]")
                sock.close()
            except Exception:
                continue

    async def scan_whois(self):
        """WHOIS lookup"""
        console.print("[cyan]  WHOIS-Abfrage...[/cyan]")
        domain = self.domain.split(":")[0]
        try:
            w = whois.whois(domain)
            self.whois_info = {
                "registrar": getattr(w, "registrar", "N/A"),
                "creation_date": str(getattr(w, "creation_date", "N/A")),
                "expiration_date": str(getattr(w, "expiration_date", "N/A")),
                "name_servers": getattr(w, "name_servers", []),
                "status": getattr(w, "status", "N/A"),
                "org": getattr(w, "org", "N/A"),
                "country": getattr(w, "country", "N/A"),
            }
            console.print(f"    [green]Registrar: {self.whois_info['registrar']}[/green]")
            console.print(f"    [green]Organisation: {self.whois_info['org']}[/green]")
        except Exception as e:
            self.whois_info = {"error": str(e)}

    async def scan_headers(self, session: aiohttp.ClientSession):
        """Analyze response headers for security issues"""
        console.print("[cyan]  Header-Analyse...[/cyan]")
        try:
            async with session.get(self.target, timeout=aiohttp.ClientTimeout(total=15), headers=HEADERS) as resp:
                self.response_headers = dict(resp.headers)
                self.server_info = {
                    "Server": resp.headers.get("Server", "Nicht verfügbar"),
                    "X-Powered-By": resp.headers.get("X-Powered-By", "Nicht verfügbar"),
                    "Content-Type": resp.headers.get("Content-Type", "Nicht verfügbar"),
                }
        except Exception as e:
            console.print(f"    [red]Fehler: {e}[/red]")
            return

        # Check security headers
        security_headers = {
            "X-Frame-Options": {
                "severity": "medium",
                "de": "Fehlender X-Frame-Options Header - Clickjacking möglich",
                "en": "Missing X-Frame-Options header - Clickjacking possible",
                "solution_de": "Header 'X-Frame-Options: SAMEORIGIN' in der Serverkonfiguration setzen",
                "solution_en": "Set 'X-Frame-Options: SAMEORIGIN' in server configuration",
            },
            "Content-Security-Policy": {
                "severity": "high",
                "de": "Fehlende Content-Security-Policy - XSS und Injection-Angriffe möglich",
                "en": "Missing Content-Security-Policy - XSS and injection attacks possible",
                "solution_de": "CSP-Header mit restriktiven Richtlinien konfigurieren",
                "solution_en": "Configure CSP header with restrictive policies",
            },
            "X-Content-Type-Options": {
                "severity": "medium",
                "de": "Fehlender X-Content-Type-Options Header - MIME-Sniffing möglich",
                "en": "Missing X-Content-Type-Options - MIME sniffing possible",
                "solution_de": "Header 'X-Content-Type-Options: nosniff' setzen",
                "solution_en": "Set 'X-Content-Type-Options: nosniff' header",
            },
            "Strict-Transport-Security": {
                "severity": "high",
                "de": "Fehlender HSTS-Header - Man-in-the-Middle-Angriffe möglich",
                "en": "Missing HSTS header - Man-in-the-Middle attacks possible",
                "solution_de": "HSTS-Header mit max-age=31536000 und includeSubDomains setzen",
                "solution_en": "Set HSTS header with max-age=31536000 and includeSubDomains",
            },
            "X-XSS-Protection": {
                "severity": "low",
                "de": "Fehlender X-XSS-Protection Header",
                "en": "Missing X-XSS-Protection header",
                "solution_de": "Header 'X-XSS-Protection: 1; mode=block' setzen",
                "solution_en": "Set 'X-XSS-Protection: 1; mode=block' header",
            },
            "Referrer-Policy": {
                "severity": "low",
                "de": "Fehlende Referrer-Policy",
                "en": "Missing Referrer-Policy",
                "solution_de": "Header 'Referrer-Policy: strict-origin-when-cross-origin' setzen",
                "solution_en": "Set 'Referrer-Policy: strict-origin-when-cross-origin' header",
            },
            "Permissions-Policy": {
                "severity": "low",
                "de": "Fehlende Permissions-Policy",
                "en": "Missing Permissions-Policy",
                "solution_de": "Permissions-Policy Header konfigurieren",
                "solution_en": "Configure Permissions-Policy header",
            },
        }

        for header, info in security_headers.items():
            if header not in self.response_headers:
                cvss = self._get_cvss("header-missing")
                self.vulnerabilities.append({
                    "type": "header-missing",
                    "name": f"Fehlender Sicherheits-Header: {header}",
                    "severity": info["severity"],
                    "url": self.target,
                    "description": info[self.lang],
                    "solution": info[f"solution_{self.lang}"],
                    "evidence": f"Header '{header}' fehlt in der Antwort",
                    "cvss": cvss,
                })
                console.print(f"    [yellow]FEHLT: {header}[/yellow]")
            else:
                console.print(f"    [green]OK: {header} = {self.response_headers[header][:60]}[/green]")

        # Server version disclosure
        server = self.response_headers.get("Server", "")
        if server and any(c.isdigit() for c in server):
            self.vulnerabilities.append({
                "type": "info-disclosure",
                "name": "Server-Versionsinformationen offengelegt",
                "severity": "low",
                "url": self.target,
                "description": f"Server-Version offengelegt: {server}",
                "solution": "Server-Tokens deaktivieren (z.B. nginx: server_tokens off;)",
                "evidence": f"Server: {server}",
                "cvss": self._get_cvss("info-disclosure"),
            })

    async def discover_admin_panels(self, session: aiohttp.ClientSession):
        """Discover admin panels"""
        console.print("[cyan]  Admin-Panel-Erkennung...[/cyan]")
        
        for path in ADMIN_PATHS:
            test_url = urljoin(self.base_url, path)
            try:
                async with session.get(test_url, timeout=aiohttp.ClientTimeout(total=5),
                                       headers=HEADERS, allow_redirects=False) as resp:
                    if resp.status in (200, 301, 302, 403):
                        content_len = int(resp.headers.get("Content-Length", "0") or "0")
                        status_info = {200: "Zugänglich", 301: "Weiterleitung", 302: "Weiterleitung", 403: "Zugriff verweigert"}
                        panel_info = {
                            "url": test_url,
                            "path": path,
                            "status": resp.status,
                            "status_text": status_info.get(resp.status, "Unbekannt"),
                            "content_length": content_len,
                        }
                        self.admin_panels.append(panel_info)
                        color = "green" if resp.status == 200 else "yellow" if resp.status == 403 else "blue"
                        console.print(f"    [{color}]{path} -> {resp.status} ({panel_info['status_text']})[/{color}]")
            except Exception:
                continue

    async def discover_sensitive_files(self, session: aiohttp.ClientSession):
        """Discover sensitive files and directories"""
        console.print("[cyan]  Erkennung sensibler Dateien...[/cyan]")
        
        for path in SENSITIVE_PATHS:
            test_url = urljoin(self.base_url, path)
            try:
                async with session.get(test_url, timeout=aiohttp.ClientTimeout(total=5),
                                       headers=HEADERS, allow_redirects=False) as resp:
                    if resp.status == 200:
                        content = ""
                        try:
                            content = await resp.text()
                        except Exception:
                            pass
                        
                        # Verify it's real content, not a generic 404/error page
                        if len(content) > 50 and "404" not in content[:200].lower():
                            file_info = {
                                "url": test_url,
                                "path": path,
                                "status": resp.status,
                                "size": len(content),
                                "content_preview": content[:200] if content else "",
                            }
                            self.sensitive_files.append(file_info)
                            
                            cvss = self._get_cvss("sensitive-file")
                            self.vulnerabilities.append({
                                "type": "sensitive-file",
                                "name": f"Sensible Datei gefunden: {path}",
                                "severity": "high",
                                "url": test_url,
                                "description": f"Zugängliche sensible Datei: {path} ({len(content)} Bytes)",
                                "solution": f"Zugriff auf {path} einschränken oder Datei vom Webserver entfernen",
                                "evidence": f"HTTP 200 - {len(content)} Bytes Inhalt",
                                "cvss": cvss,
                            })
                            console.print(f"    [red]GEFUNDEN: {path} ({len(content)} Bytes)[/red]")
            except Exception:
                continue

    async def search_promo_codes(self, session: aiohttp.ClientSession):
        """Search for promotional codes in page source"""
        console.print("[cyan]  Suche nach Promo-Codes...[/cyan]")
        try:
            async with session.get(self.target, timeout=aiohttp.ClientTimeout(total=15), headers=HEADERS) as resp:
                content = await resp.text()
                
                # Patterns for promo/coupon codes
                patterns = [
                    r'promo[_-]?code["\s:=]+["\']?([A-Z0-9_-]{3,30})["\']?',
                    r'coupon[_-]?code["\s:=]+["\']?([A-Z0-9_-]{3,30})["\']?',
                    r'discount[_-]?code["\s:=]+["\']?([A-Z0-9_-]{3,30})["\']?',
                    r'voucher["\s:=]+["\']?([A-Z0-9_-]{3,30})["\']?',
                    r'gutschein[_-]?code["\s:=]+["\']?([A-Z0-9_-]{3,30})["\']?',
                    r'rabatt[_-]?code["\s:=]+["\']?([A-Z0-9_-]{3,30})["\']?',
                    r'data-promo["\s=]+["\']?([A-Z0-9_-]{3,30})["\']?',
                    r'promotion["\s:=]+["\']?([A-Z0-9_-]{3,30})["\']?',
                ]
                
                for pattern in patterns:
                    matches = re.findall(pattern, content, re.IGNORECASE)
                    for match in matches:
                        if match not in self.promo_codes and len(match) > 2:
                            self.promo_codes.append(match)
                            console.print(f"    [green]Promo-Code gefunden: {match}[/green]")

                # Search in JavaScript files
                js_urls = re.findall(r'src=["\']([^"\']+\.js)["\']', content)
                for js_url in js_urls[:10]:  # Limit to first 10
                    full_url = urljoin(self.target, js_url)
                    try:
                        async with session.get(full_url, timeout=aiohttp.ClientTimeout(total=5), headers=HEADERS) as js_resp:
                            js_content = await js_resp.text()
                            for pattern in patterns:
                                matches = re.findall(pattern, js_content, re.IGNORECASE)
                                for match in matches:
                                    if match not in self.promo_codes and len(match) > 2:
                                        self.promo_codes.append(match)
                                        console.print(f"    [green]Promo-Code in JS: {match}[/green]")
                    except Exception:
                        continue

        except Exception as e:
            console.print(f"    [yellow]Fehler: {e}[/yellow]")

    async def check_code_signing(self, session: aiohttp.ClientSession):
        """Check for code signing and integrity"""
        console.print("[cyan]  Code-Signierung prüfen...[/cyan]")
        try:
            async with session.get(self.target, timeout=aiohttp.ClientTimeout(total=15), headers=HEADERS) as resp:
                content = await resp.text()

                # Check for SRI (Subresource Integrity)
                soup = BeautifulSoup(content, "html.parser")
                scripts = soup.find_all("script", src=True)
                styles = soup.find_all("link", rel="stylesheet")

                for script in scripts:
                    integrity = script.get("integrity", "")
                    src = script.get("src", "")
                    if src:
                        has_sri = bool(integrity)
                        self.code_signatures.append({
                            "resource": src,
                            "type": "script",
                            "has_integrity": has_sri,
                            "integrity": integrity or "FEHLT",
                        })
                        if not has_sri and src.startswith("http"):
                            console.print(f"    [yellow]Keine SRI: {src[:60]}[/yellow]")
                        elif has_sri:
                            console.print(f"    [green]SRI OK: {src[:60]}[/green]")

                for style in styles:
                    integrity = style.get("integrity", "")
                    href = style.get("href", "")
                    if href:
                        has_sri = bool(integrity)
                        self.code_signatures.append({
                            "resource": href,
                            "type": "stylesheet",
                            "has_integrity": has_sri,
                            "integrity": integrity or "FEHLT",
                        })

        except Exception as e:
            console.print(f"    [yellow]Fehler: {e}[/yellow]")

    async def crawl_and_scan(self, session: aiohttp.ClientSession):
        """Crawl site and test for injection vulnerabilities"""
        console.print("[cyan]  Crawling und Schwachstellen-Scan...[/cyan]")
        try:
            async with session.get(self.target, timeout=aiohttp.ClientTimeout(total=15), headers=HEADERS) as resp:
                if resp.status != 200:
                    console.print(f"    [yellow]HTTP {resp.status}[/yellow]")
                    return

                html = await resp.text()
                soup = BeautifulSoup(html, "html.parser")

                # Extract links
                for tag in soup.find_all("a", href=True):
                    href = urljoin(self.target, tag["href"])
                    link_parsed = urlparse(href)
                    if link_parsed.netloc == self.domain:
                        self.links_found.add(href)
                        if link_parsed.path.endswith("/"):
                            self.folders_found.add(href)

                # Extract forms
                for form in soup.find_all("form"):
                    action = form.get("action", "")
                    full_url = urljoin(self.target, action) if action else self.target
                    self.forms_found.add(full_url)

                console.print(f"    [green]Links: {len(self.links_found)} | Formulare: {len(self.forms_found)} | Ordner: {len(self.folders_found)}[/green]")

        except Exception as e:
            console.print(f"    [red]Crawl-Fehler: {e}[/red]")

    async def test_injection_vulns(self, session: aiohttp.ClientSession):
        """Test for injection vulnerabilities on discovered URLs"""
        console.print("[cyan]  Injection-Tests mit Payloads...[/cyan]")
        
        # Get parameterized URLs
        param_urls = [u for u in self.links_found if "?" in u]
        if not param_urls:
            console.print("    [dim]Keine parametrisierten URLs gefunden[/dim]")
            return

        for url in param_urls[:20]:  # Limit
            parsed = urlparse(url)
            params = parse_qs(parsed.query)

            for param_name, param_values in params.items():
                # SQL Injection test
                for payload in ["' OR '1'='1", "' AND SLEEP(2)--", "1; WAITFOR DELAY '0:0:2'--"]:
                    test_url = url.replace(f"{param_name}={param_values[0]}", f"{param_name}={quote(payload)}")
                    try:
                        async with session.get(test_url, timeout=aiohttp.ClientTimeout(total=8), headers=HEADERS) as resp:
                            content = await resp.text()
                            sql_errors = ["sql", "mysql", "syntax error", "ORA-", "PostgreSQL", "SQLite",
                                          "microsoft sql", "mysql_fetch", "mysql_num_rows"]
                            if any(err.lower() in content.lower() for err in sql_errors):
                                # Verify: compare with original
                                async with session.get(url, timeout=aiohttp.ClientTimeout(total=5), headers=HEADERS) as orig:
                                    orig_content = await orig.text()
                                    if content != orig_content:
                                        cvss = self._get_cvss("sql-injection")
                                        self.vulnerabilities.append({
                                            "type": "sql-injection",
                                            "name": f"SQL Injection in Parameter '{param_name}'",
                                            "severity": "critical",
                                            "url": url,
                                            "parameter": param_name,
                                            "payload": payload,
                                            "description": f"SQL-Injection in Parameter '{param_name}' bestätigt durch Datenbankfehler",
                                            "solution": "Parametrisierte Abfragen (Prepared Statements) verwenden",
                                            "evidence": f"Payload: {payload} | Datenbankfehler in Antwort",
                                            "poc": f"curl '{test_url}'",
                                            "cvss": cvss,
                                        })
                                        console.print(f"    [bold red]KRITISCH: SQL Injection in {param_name} @ {url[:50]}[/bold red]")
                    except Exception:
                        continue

                # XSS test
                for payload in ["<script>alert(1)</script>", "<img src=x onerror=alert(1)>", "'\"><svg/onload=alert(1)>"]:
                    test_url = url.replace(f"{param_name}={param_values[0]}", f"{param_name}={quote(payload)}")
                    try:
                        async with session.get(test_url, timeout=aiohttp.ClientTimeout(total=5), headers=HEADERS) as resp:
                            content = await resp.text()
                            if payload in content and not any(esc in content for esc in ["&lt;", "&gt;"]):
                                cvss = self._get_cvss("xss")
                                self.vulnerabilities.append({
                                    "type": "xss",
                                    "name": f"Cross-Site Scripting (XSS) in '{param_name}'",
                                    "severity": "high",
                                    "url": url,
                                    "parameter": param_name,
                                    "payload": payload,
                                    "description": f"Reflektiertes XSS in Parameter '{param_name}'",
                                    "solution": "Eingaben validieren und HTML-Sonderzeichen kodieren",
                                    "evidence": f"Payload wurde unverändert reflektiert: {payload}",
                                    "poc": f"curl '{test_url}'",
                                    "cvss": cvss,
                                })
                                console.print(f"    [red]HOCH: XSS in {param_name} @ {url[:50]}[/red]")
                    except Exception:
                        continue

                # LFI test
                for payload in ["../../../../etc/passwd", "....//....//etc/passwd"]:
                    test_url = url.replace(f"{param_name}={param_values[0]}", f"{param_name}={quote(payload)}")
                    try:
                        async with session.get(test_url, timeout=aiohttp.ClientTimeout(total=5), headers=HEADERS) as resp:
                            content = await resp.text()
                            if "root:" in content and "bin/" in content:
                                cvss = self._get_cvss("lfi")
                                self.vulnerabilities.append({
                                    "type": "lfi",
                                    "name": f"Local File Inclusion in '{param_name}'",
                                    "severity": "critical",
                                    "url": url,
                                    "parameter": param_name,
                                    "payload": payload,
                                    "description": f"LFI-Schwachstelle: Lokale Dateien können gelesen werden",
                                    "solution": "Dateipfade validieren, Whitelist verwenden",
                                    "evidence": f"/etc/passwd Inhalt wurde zurückgegeben",
                                    "poc": f"curl '{test_url}'",
                                    "cvss": cvss,
                                })
                                console.print(f"    [bold red]KRITISCH: LFI in {param_name}[/bold red]")
                    except Exception:
                        continue

                # SSTI test
                for payload in ["{{7*7}}", "${7*7}", "<%= 7*7 %>"]:
                    test_url = url.replace(f"{param_name}={param_values[0]}", f"{param_name}={quote(payload)}")
                    try:
                        async with session.get(test_url, timeout=aiohttp.ClientTimeout(total=5), headers=HEADERS) as resp:
                            content = await resp.text()
                            if "49" in content:
                                # Verify it's not just a coincidence
                                async with session.get(url, timeout=aiohttp.ClientTimeout(total=5), headers=HEADERS) as orig:
                                    orig_content = await orig.text()
                                    if "49" not in orig_content:
                                        cvss = self._get_cvss("ssti")
                                        self.vulnerabilities.append({
                                            "type": "ssti",
                                            "name": f"Server-Side Template Injection in '{param_name}'",
                                            "severity": "critical",
                                            "url": url,
                                            "parameter": param_name,
                                            "payload": payload,
                                            "description": f"SSTI: Template-Engine führt beliebigen Code aus",
                                            "solution": "Benutzereingaben nie direkt in Templates rendern",
                                            "evidence": f"Payload {payload} ergab '49' in der Antwort",
                                            "poc": f"curl '{test_url}'",
                                            "cvss": cvss,
                                        })
                                        console.print(f"    [bold red]KRITISCH: SSTI in {param_name}[/bold red]")
                    except Exception:
                        continue

    async def test_yaml_payloads(self, session: aiohttp.ClientSession):
        """Test with loaded YAML payloads"""
        if not self.payload_loader or not self.payload_loader.payloads:
            return

        console.print(f"[cyan]  Teste mit {self.payload_loader.total_loaded} YAML-Payloads...[/cyan]")

        param_urls = [u for u in self.links_found if "?" in u]
        if not param_urls:
            # Test on base paths from YAML
            param_urls = [self.target]

        tested = 0
        for vuln_type, vuln_list in self.payload_loader.payloads.items():
            for vuln_def in vuln_list[:3]:  # Limit per type
                paths = vuln_def.get("paths", [])
                matchers = vuln_def.get("matcher", [])
                payloads = vuln_def.get("payloads", [])[:5]  # Limit payloads per definition

                for payload in payloads:
                    for path in (paths or ["/"]):
                        test_url = urljoin(self.base_url, path)
                        if "?" in test_url:
                            # Parameter-based test
                            parsed = urlparse(test_url)
                            params = parse_qs(parsed.query)
                            for pname in params:
                                inject_url = test_url + f"&{pname}={quote(str(payload))}"
                                try:
                                    async with session.get(inject_url, timeout=aiohttp.ClientTimeout(total=5),
                                                           headers=HEADERS) as resp:
                                        content = await resp.text()
                                        if matchers and any(m.lower() in content.lower() for m in matchers):
                                            self.vulnerabilities.append({
                                                "type": vuln_type,
                                                "name": vuln_def.get("name", vuln_type),
                                                "severity": vuln_def.get("severity", "medium"),
                                                "url": inject_url,
                                                "payload": str(payload),
                                                "description": vuln_def.get("description", f"{vuln_type} vulnerability detected"),
                                                "solution": f"Eingabevalidierung für {vuln_type} implementieren",
                                                "evidence": f"Matcher gefunden in Antwort | Quelle: {vuln_def.get('source', 'N/A')}",
                                                "cvss": self._get_cvss(vuln_type),
                                            })
                                            console.print(f"    [red]{vuln_def.get('severity', 'MEDIUM').upper()}: {vuln_def.get('name', vuln_type)}[/red]")
                                except Exception:
                                    continue
                        tested += 1
                        if tested > 500:  # Safety limit
                            return

    async def detect_technology(self, session: aiohttp.ClientSession):
        """Detect technology stack"""
        console.print("[cyan]  Technologie-Erkennung...[/cyan]")
        try:
            async with session.get(self.target, timeout=aiohttp.ClientTimeout(total=15), headers=HEADERS) as resp:
                content = await resp.text()
                headers = dict(resp.headers)

                tech = {}

                # Server detection
                server = headers.get("Server", "")
                if server:
                    tech["Server"] = server

                powered = headers.get("X-Powered-By", "")
                if powered:
                    tech["Framework"] = powered

                # CMS detection
                cms_patterns = {
                    "WordPress": ["/wp-content/", "/wp-includes/", "wp-json"],
                    "Drupal": ["Drupal", "/sites/default/", "/misc/drupal.js"],
                    "Joomla": ["/media/jui/", "/administrator/", "Joomla"],
                    "Magento": ["/skin/frontend/", "Mage.Cookies", "/js/mage/"],
                    "Shopify": ["cdn.shopify.com", "Shopify.theme"],
                    "Laravel": ["laravel_session", "XSRF-TOKEN"],
                    "Django": ["csrfmiddlewaretoken", "django"],
                    "React": ["react", "_reactRootContainer", "data-reactroot"],
                    "Vue.js": ["vue", "__vue__", "data-v-"],
                    "Angular": ["ng-app", "ng-controller", "angular"],
                    "Next.js": ["_next/", "__NEXT_DATA__"],
                    "Nuxt.js": ["__nuxt", "_nuxt/"],
                }

                for cms, indicators in cms_patterns.items():
                    if any(ind.lower() in content.lower() for ind in indicators):
                        tech[cms] = "Erkannt"
                        console.print(f"    [green]{cms} erkannt[/green]")

                # Cookie analysis
                cookies = headers.get("Set-Cookie", "")
                if "PHPSESSID" in cookies:
                    tech["PHP"] = "Erkannt"
                if "ASP.NET_SessionId" in cookies:
                    tech["ASP.NET"] = "Erkannt"
                if "JSESSIONID" in cookies:
                    tech["Java"] = "Erkannt"

                self.tech_stack = tech

        except Exception as e:
            console.print(f"    [yellow]Fehler: {e}[/yellow]")

    async def run_full_scan(self, vuln_dir: str = "../vuln"):
        """Execute complete security scan"""
        self.scan_start = time.time()
        
        console.print(Panel(BANNER, border_style="red", expand=False))
        console.print(f"\n[bold white]{'='*70}[/bold white]")
        console.print(f"[bold cyan]  ZIEL: {self.target}[/bold cyan]")
        console.print(f"[bold cyan]  UNTERNEHMEN: {self.company}[/bold cyan]")
        console.print(f"[bold cyan]  STARTZEIT: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}[/bold cyan]")
        console.print(f"[bold white]{'='*70}[/bold white]\n")

        # Load YAML payloads
        console.print(Panel("[bold yellow]PHASE 1: Lade Schwachstellen-Datenbank[/bold yellow]", border_style="yellow"))
        self.payload_loader = PayloadLoader(vuln_dir)
        total_payloads = self.payload_loader.load_all()
        console.print(f"  [green]{total_payloads} Payloads aus {len(self.payload_loader.categories)} Kategorien geladen[/green]")
        for cat, count in sorted(self.payload_loader.categories.items(), key=lambda x: -x[1])[:15]:
            console.print(f"    [dim]{cat}: {count} Payloads[/dim]")

        # Phase 2: Reconnaissance
        console.print(Panel("[bold yellow]PHASE 2: Aufklärung (Reconnaissance)[/bold yellow]", border_style="yellow"))

        connector = aiohttp.TCPConnector(limit=20, ssl=False)
        timeout = aiohttp.ClientTimeout(total=30)
        async with aiohttp.ClientSession(connector=connector, timeout=timeout) as session:
            # Headers first (we need them for CDN detection)
            await self.scan_headers(session)
            await self.resolve_real_ip()
            await self.scan_dns()
            await self.scan_ssl()
            await self.scan_ports()
            await self.scan_whois()
            await self.detect_technology(session)

            # Phase 3: Discovery
            console.print(Panel("[bold yellow]PHASE 3: Entdeckung (Discovery)[/bold yellow]", border_style="yellow"))
            await self.crawl_and_scan(session)
            await self.discover_admin_panels(session)
            await self.discover_sensitive_files(session)
            await self.search_promo_codes(session)
            await self.check_code_signing(session)

            # Phase 4: Vulnerability Testing
            console.print(Panel("[bold yellow]PHASE 4: Schwachstellen-Tests[/bold yellow]", border_style="yellow"))
            await self.test_injection_vulns(session)
            await self.test_yaml_payloads(session)

        self.scan_end = time.time()
        duration = self.scan_end - self.scan_start

        # Display results
        self._display_results(duration)

        # Generate reports
        self._generate_report_de(duration)
        self._generate_report_en(duration)

    def _display_results(self, duration: float):
        """Display scan results in terminal"""
        console.print(f"\n[bold white]{'='*70}[/bold white]")
        console.print(Panel("[bold green]SCAN ABGESCHLOSSEN - ERGEBNISSE[/bold green]", border_style="green"))

        # Summary table
        summary = Table(title="Zusammenfassung / Summary", border_style="cyan", show_lines=True)
        summary.add_column("Kategorie", style="bold cyan")
        summary.add_column("Ergebnis", style="bold white")

        total_vulns = len(self.vulnerabilities)
        critical = sum(1 for v in self.vulnerabilities if v.get("severity", "").lower() in ("critical", "kritisch"))
        high = sum(1 for v in self.vulnerabilities if v.get("severity", "").lower() in ("high", "hoch"))
        medium = sum(1 for v in self.vulnerabilities if v.get("severity", "").lower() in ("medium", "mittel"))
        low = sum(1 for v in self.vulnerabilities if v.get("severity", "").lower() in ("low", "niedrig", "info"))

        summary.add_row("Ziel", self.target)
        summary.add_row("Scan-Dauer", f"{duration:.1f} Sekunden")
        summary.add_row("Gesamte Schwachstellen", f"[bold]{total_vulns}[/bold]")
        summary.add_row("Kritisch", f"[bold red]{critical}[/bold red]")
        summary.add_row("Hoch", f"[red]{high}[/red]")
        summary.add_row("Mittel", f"[yellow]{medium}[/yellow]")
        summary.add_row("Niedrig/Info", f"[blue]{low}[/blue]")
        summary.add_row("Admin-Panels", f"{len(self.admin_panels)}")
        summary.add_row("Sensible Dateien", f"{len(self.sensitive_files)}")
        summary.add_row("Offene Ports", f"{len(self.open_ports)}")
        summary.add_row("Echte IP", self.real_ip or "N/A")
        summary.add_row("CDN", self.cdn_detected or "Kein CDN erkannt")
        summary.add_row("Links gefunden", f"{len(self.links_found)}")
        summary.add_row("Formulare", f"{len(self.forms_found)}")
        summary.add_row("Promo-Codes", f"{len(self.promo_codes)}")
        summary.add_row("Payloads getestet", f"{self.payload_loader.total_loaded if self.payload_loader else 0}")

        console.print(summary)

        # Vulnerability details
        if self.vulnerabilities:
            vuln_table = Table(title="Schwachstellen-Details", border_style="red", show_lines=True)
            vuln_table.add_column("#", style="dim", width=4)
            vuln_table.add_column("Schweregrad", width=10)
            vuln_table.add_column("Typ", width=20)
            vuln_table.add_column("Beschreibung", width=40)
            vuln_table.add_column("CVSS", width=6)
            vuln_table.add_column("URL", width=30)

            for i, vuln in enumerate(self.vulnerabilities, 1):
                sev = vuln.get("severity", "medium").upper()
                color = self._severity_color(sev)
                cvss_score = vuln.get("cvss", {}).get("score", "N/A")
                vuln_table.add_row(
                    str(i),
                    f"[{color}]{sev}[/{color}]",
                    vuln.get("name", vuln.get("type", "Unknown"))[:20],
                    vuln.get("description", "")[:40],
                    str(cvss_score),
                    vuln.get("url", "")[:30],
                )

            console.print(vuln_table)

        # Admin panels
        if self.admin_panels:
            admin_table = Table(title="Admin-Panels", border_style="yellow", show_lines=True)
            admin_table.add_column("Pfad", style="cyan")
            admin_table.add_column("Status", style="bold")
            admin_table.add_column("Beschreibung")

            for panel in self.admin_panels:
                status_color = "green" if panel["status"] == 200 else "yellow"
                admin_table.add_row(
                    panel["path"],
                    f"[{status_color}]{panel['status']} {panel['status_text']}[/{status_color}]",
                    panel["url"],
                )
            console.print(admin_table)

        # Open ports
        if self.open_ports:
            port_table = Table(title="Offene Ports", border_style="blue", show_lines=True)
            port_table.add_column("Port", style="bold cyan")
            port_table.add_column("Service")
            port_table.add_column("Beschreibung")

            for port in self.open_ports:
                port_table.add_row(str(port["port"]), port["service"], port["description"])
            console.print(port_table)

        # DNS records
        if self.dns_records:
            dns_table = Table(title="DNS-Einträge", border_style="green", show_lines=True)
            dns_table.add_column("Typ", style="bold cyan")
            dns_table.add_column("Werte")

            for rtype, records in self.dns_records.items():
                dns_table.add_row(rtype, ", ".join(records[:5]))
            console.print(dns_table)

        # SSL info
        if self.ssl_info and "error" not in self.ssl_info:
            ssl_table = Table(title="SSL/TLS-Informationen", border_style="green", show_lines=True)
            ssl_table.add_column("Eigenschaft", style="bold cyan")
            ssl_table.add_column("Wert")

            ssl_table.add_row("Version", self.ssl_info.get("version", "N/A"))
            ssl_table.add_row("Cipher", self.ssl_info.get("cipher", "N/A"))
            ssl_table.add_row("Bits", str(self.ssl_info.get("bits", "N/A")))
            ssl_table.add_row("Grade", self.ssl_info.get("grade", "N/A"))
            ssl_table.add_row("Gültig bis", self.ssl_info.get("notAfter", "N/A"))
            ssl_table.add_row("Aussteller", str(self.ssl_info.get("issuer", {}).get("organizationName", "N/A")))
            console.print(ssl_table)

        # Promo codes
        if self.promo_codes:
            console.print(Panel(
                "\n".join([f"  [green]{code}[/green]" for code in self.promo_codes]),
                title="Gefundene Promo-Codes",
                border_style="green",
            ))

        # Technology stack
        if self.tech_stack:
            tech_table = Table(title="Technologie-Stack", border_style="cyan", show_lines=True)
            tech_table.add_column("Technologie", style="bold cyan")
            tech_table.add_column("Status")

            for tech, status in self.tech_stack.items():
                tech_table.add_row(tech, status)
            console.print(tech_table)

    def _safe_domain(self) -> str:
        """Return filesystem-safe domain name"""
        return re.sub(r'[^a-zA-Z0-9._-]', '_', self.domain)[:50]

    def _generate_report_de(self, duration: float):
        """Generate German professional report"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        safe_domain = self._safe_domain()
        filename = f"sicherheitsbericht_{safe_domain}_{timestamp}.json"

        total_vulns = len(self.vulnerabilities)
        critical = sum(1 for v in self.vulnerabilities if v.get("severity", "").lower() in ("critical", "kritisch"))
        high = sum(1 for v in self.vulnerabilities if v.get("severity", "").lower() in ("high", "hoch"))
        medium = sum(1 for v in self.vulnerabilities if v.get("severity", "").lower() in ("medium", "mittel"))
        low = sum(1 for v in self.vulnerabilities if v.get("severity", "").lower() in ("low", "niedrig", "info"))

        # Calculate risk score
        risk_score = min(100, (critical * 25) + (high * 15) + (medium * 5) + (low * 1))

        report = {
            "bericht": {
                "titel": f"Sicherheitsbericht - {self.domain}",
                "unternehmen": self.company,
                "erstellt_von": f"{SCANNER_NAME} v{SCANNER_VERSION}",
                "datum": datetime.now().isoformat(),
                "sprache": "Deutsch",
                "version": "1.0",
                "klassifizierung": "VERTRAULICH",
            },
            "zusammenfassung": {
                "ziel": self.target,
                "domain": self.domain,
                "scan_dauer_sekunden": round(duration, 1),
                "risikobewertung": risk_score,
                "risiko_stufe": "KRITISCH" if risk_score > 75 else "HOCH" if risk_score > 50 else "MITTEL" if risk_score > 25 else "NIEDRIG",
                "gesamte_schwachstellen": total_vulns,
                "nach_schweregrad": {
                    "kritisch": critical,
                    "hoch": high,
                    "mittel": medium,
                    "niedrig_info": low,
                },
                "admin_panels_gefunden": len(self.admin_panels),
                "sensible_dateien_gefunden": len(self.sensitive_files),
                "offene_ports": len(self.open_ports),
                "payloads_getestet": self.payload_loader.total_loaded if self.payload_loader else 0,
            },
            "netzwerk": {
                "echte_ip": self.real_ip or "N/A",
                "cdn_erkannt": self.cdn_detected or "Keins",
                "dns_eintraege": self.dns_records,
                "ssl_tls": self.ssl_info,
                "whois": self.whois_info,
                "offene_ports": self.open_ports,
                "server_info": self.server_info,
            },
            "schwachstellen": [],
            "admin_panels": self.admin_panels,
            "sensible_dateien": [
                {
                    "pfad": f["path"],
                    "url": f["url"],
                    "groesse_bytes": f["size"],
                } for f in self.sensitive_files
            ],
            "technologie": self.tech_stack,
            "promo_codes": self.promo_codes,
            "code_signierung": self.code_signatures,
            "sicherheits_header": dict(self.response_headers),
        }

        for vuln in self.vulnerabilities:
            cvss = vuln.get("cvss", {})
            vuln_entry = {
                "id": hashlib.md5(f"{vuln.get('type', '')}{vuln.get('url', '')}{vuln.get('payload', '')}".encode()).hexdigest()[:12],
                "typ": vuln.get("type", "Unbekannt"),
                "name": vuln.get("name", "Unbekannt"),
                "schweregrad": vuln.get("severity", "mittel").upper(),
                "url": vuln.get("url", ""),
                "parameter": vuln.get("parameter", ""),
                "payload": vuln.get("payload", ""),
                "beschreibung": vuln.get("description", ""),
                "loesung": vuln.get("solution", ""),
                "beweis": vuln.get("evidence", ""),
                "poc": vuln.get("poc", ""),
                "cvss": {
                    "score": cvss.get("score", "N/A"),
                    "vektor": cvss.get("vector", ""),
                    "cwe": cvss.get("cwe", ""),
                    "owasp": cvss.get("owasp", ""),
                },
            }
            report["schwachstellen"].append(vuln_entry)

        with open(filename, "w", encoding="utf-8") as f:
            json.dump(report, f, ensure_ascii=False, indent=2)

        console.print(f"\n[bold green]Deutscher Bericht gespeichert: {filename}[/bold green]")

        # Also generate text report
        txt_filename = filename.replace(".json", ".txt")
        self._generate_text_report_de(txt_filename, report, duration)

    def _generate_text_report_de(self, filename: str, report: dict, duration: float):
        """Generate professional German text report"""
        lines = []
        lines.append("=" * 80)
        lines.append(f"  {SCANNER_NAME} - SICHERHEITSBERICHT")
        lines.append(f"  {self.company}")
        lines.append("=" * 80)
        lines.append(f"  Erstellt: {datetime.now().strftime('%d.%m.%Y %H:%M:%S')}")
        lines.append(f"  Ziel: {self.target}")
        lines.append(f"  Scanner: {SCANNER_NAME} v{SCANNER_VERSION}")
        lines.append(f"  Klassifizierung: VERTRAULICH")
        lines.append("=" * 80)
        lines.append("")
        lines.append("1. ZUSAMMENFASSUNG")
        lines.append("-" * 40)
        summ = report["zusammenfassung"]
        lines.append(f"  Risikobewertung: {summ['risikobewertung']}/100 ({summ['risiko_stufe']})")
        lines.append(f"  Gesamte Schwachstellen: {summ['gesamte_schwachstellen']}")
        lines.append(f"    - Kritisch: {summ['nach_schweregrad']['kritisch']}")
        lines.append(f"    - Hoch: {summ['nach_schweregrad']['hoch']}")
        lines.append(f"    - Mittel: {summ['nach_schweregrad']['mittel']}")
        lines.append(f"    - Niedrig/Info: {summ['nach_schweregrad']['niedrig_info']}")
        lines.append(f"  Admin-Panels: {summ['admin_panels_gefunden']}")
        lines.append(f"  Sensible Dateien: {summ['sensible_dateien_gefunden']}")
        lines.append(f"  Offene Ports: {summ['offene_ports']}")
        lines.append(f"  Scan-Dauer: {summ['scan_dauer_sekunden']}s")
        lines.append(f"  Payloads getestet: {summ['payloads_getestet']}")
        lines.append("")
        lines.append("2. SCHWACHSTELLEN-DETAILS")
        lines.append("-" * 40)

        for i, vuln in enumerate(report["schwachstellen"], 1):
            lines.append(f"\n  [{i}] {vuln['name']}")
            lines.append(f"      Schweregrad: {vuln['schweregrad']}")
            lines.append(f"      Typ: {vuln['typ']}")
            lines.append(f"      URL: {vuln['url']}")
            if vuln['parameter']:
                lines.append(f"      Parameter: {vuln['parameter']}")
            if vuln['payload']:
                lines.append(f"      Payload: {vuln['payload']}")
            lines.append(f"      Beschreibung: {vuln['beschreibung']}")
            lines.append(f"      Lösung: {vuln['loesung']}")
            lines.append(f"      Beweis: {vuln['beweis']}")
            if vuln['poc']:
                lines.append(f"      PoC: {vuln['poc']}")
            lines.append(f"      CVSS: {vuln['cvss']['score']} ({vuln['cvss']['vektor']})")
            lines.append(f"      CWE: {vuln['cvss']['cwe']} | OWASP: {vuln['cvss']['owasp']}")

        lines.append("")
        lines.append("3. NETZWERK-INFORMATIONEN")
        lines.append("-" * 40)
        net = report["netzwerk"]
        lines.append(f"  Echte IP: {net['echte_ip']}")
        lines.append(f"  CDN: {net['cdn_erkannt']}")

        if net.get("offene_ports"):
            lines.append("\n  Offene Ports:")
            for p in net["offene_ports"]:
                lines.append(f"    Port {p['port']} ({p['service']}): {p['description']}")

        if net.get("dns_eintraege"):
            lines.append("\n  DNS-Einträge:")
            for rtype, records in net["dns_eintraege"].items():
                lines.append(f"    {rtype}: {', '.join(records[:3])}")

        lines.append("")
        lines.append("4. ADMIN-PANELS")
        lines.append("-" * 40)
        for panel in report.get("admin_panels", []):
            lines.append(f"  {panel['path']} -> {panel['status']} ({panel['status_text']})")

        lines.append("")
        lines.append("5. SENSIBLE DATEIEN")
        lines.append("-" * 40)
        for sf in report.get("sensible_dateien", []):
            lines.append(f"  {sf['pfad']} ({sf['groesse_bytes']} Bytes)")

        lines.append("")
        lines.append(f"  Bericht erstellt von: {self.company}")
        lines.append(f"  Scanner: {SCANNER_NAME} v{SCANNER_VERSION}")
        lines.append("=" * 80)

        with open(filename, "w", encoding="utf-8") as f:
            f.write("\n".join(lines))

        console.print(f"[bold green]Textbericht (DE): {filename}[/bold green]")

    def _generate_report_en(self, duration: float):
        """Generate English professional report"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        safe_domain = self._safe_domain()
        filename = f"security_report_{safe_domain}_{timestamp}.json"

        total_vulns = len(self.vulnerabilities)
        critical = sum(1 for v in self.vulnerabilities if v.get("severity", "").lower() in ("critical", "kritisch"))
        high = sum(1 for v in self.vulnerabilities if v.get("severity", "").lower() in ("high", "hoch"))
        medium = sum(1 for v in self.vulnerabilities if v.get("severity", "").lower() in ("medium", "mittel"))
        low = sum(1 for v in self.vulnerabilities if v.get("severity", "").lower() in ("low", "niedrig", "info"))

        risk_score = min(100, (critical * 25) + (high * 15) + (medium * 5) + (low * 1))

        report = {
            "report": {
                "title": f"Security Assessment Report - {self.domain}",
                "company": self.company,
                "generated_by": f"{SCANNER_NAME} v{SCANNER_VERSION}",
                "date": datetime.now().isoformat(),
                "language": "English",
                "version": "1.0",
                "classification": "CONFIDENTIAL",
            },
            "executive_summary": {
                "target": self.target,
                "domain": self.domain,
                "scan_duration_seconds": round(duration, 1),
                "risk_score": risk_score,
                "risk_level": "CRITICAL" if risk_score > 75 else "HIGH" if risk_score > 50 else "MEDIUM" if risk_score > 25 else "LOW",
                "total_vulnerabilities": total_vulns,
                "by_severity": {
                    "critical": critical,
                    "high": high,
                    "medium": medium,
                    "low_info": low,
                },
                "admin_panels_found": len(self.admin_panels),
                "sensitive_files_found": len(self.sensitive_files),
                "open_ports": len(self.open_ports),
                "payloads_tested": self.payload_loader.total_loaded if self.payload_loader else 0,
            },
            "network": {
                "real_ip": self.real_ip or "N/A",
                "cdn_detected": self.cdn_detected or "None",
                "dns_records": self.dns_records,
                "ssl_tls": self.ssl_info,
                "whois": self.whois_info,
                "open_ports": self.open_ports,
                "server_info": self.server_info,
            },
            "vulnerabilities": [],
            "admin_panels": self.admin_panels,
            "sensitive_files": [
                {
                    "path": f["path"],
                    "url": f["url"],
                    "size_bytes": f["size"],
                } for f in self.sensitive_files
            ],
            "technology": self.tech_stack,
            "promo_codes": self.promo_codes,
            "code_signing": self.code_signatures,
            "security_headers": dict(self.response_headers),
        }

        for vuln in self.vulnerabilities:
            cvss = vuln.get("cvss", {})
            vuln_entry = {
                "id": hashlib.md5(f"{vuln.get('type', '')}{vuln.get('url', '')}{vuln.get('payload', '')}".encode()).hexdigest()[:12],
                "type": vuln.get("type", "Unknown"),
                "name": vuln.get("name", "Unknown"),
                "severity": vuln.get("severity", "medium").upper(),
                "url": vuln.get("url", ""),
                "parameter": vuln.get("parameter", ""),
                "payload": vuln.get("payload", ""),
                "description": vuln.get("description", ""),
                "solution": vuln.get("solution", ""),
                "evidence": vuln.get("evidence", ""),
                "poc": vuln.get("poc", ""),
                "cvss": {
                    "score": cvss.get("score", "N/A"),
                    "vector": cvss.get("vector", ""),
                    "cwe": cvss.get("cwe", ""),
                    "owasp": cvss.get("owasp", ""),
                },
            }
            report["vulnerabilities"].append(vuln_entry)

        with open(filename, "w", encoding="utf-8") as f:
            json.dump(report, f, ensure_ascii=False, indent=2)

        console.print(f"[bold green]English report saved: {filename}[/bold green]")

        # Text report
        txt_filename = filename.replace(".json", ".txt")
        self._generate_text_report_en(txt_filename, report, duration)

    def _generate_text_report_en(self, filename: str, report: dict, duration: float):
        """Generate professional English text report"""
        lines = []
        lines.append("=" * 80)
        lines.append(f"  {SCANNER_NAME} - SECURITY ASSESSMENT REPORT")
        lines.append(f"  {self.company}")
        lines.append("=" * 80)
        lines.append(f"  Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        lines.append(f"  Target: {self.target}")
        lines.append(f"  Scanner: {SCANNER_NAME} v{SCANNER_VERSION}")
        lines.append(f"  Classification: CONFIDENTIAL")
        lines.append("=" * 80)
        lines.append("")
        lines.append("1. EXECUTIVE SUMMARY")
        lines.append("-" * 40)
        summ = report["executive_summary"]
        lines.append(f"  Risk Score: {summ['risk_score']}/100 ({summ['risk_level']})")
        lines.append(f"  Total Vulnerabilities: {summ['total_vulnerabilities']}")
        lines.append(f"    - Critical: {summ['by_severity']['critical']}")
        lines.append(f"    - High: {summ['by_severity']['high']}")
        lines.append(f"    - Medium: {summ['by_severity']['medium']}")
        lines.append(f"    - Low/Info: {summ['by_severity']['low_info']}")
        lines.append(f"  Admin Panels: {summ['admin_panels_found']}")
        lines.append(f"  Sensitive Files: {summ['sensitive_files_found']}")
        lines.append(f"  Open Ports: {summ['open_ports']}")
        lines.append(f"  Scan Duration: {summ['scan_duration_seconds']}s")
        lines.append(f"  Payloads Tested: {summ['payloads_tested']}")
        lines.append("")
        lines.append("2. VULNERABILITY DETAILS")
        lines.append("-" * 40)

        for i, vuln in enumerate(report["vulnerabilities"], 1):
            lines.append(f"\n  [{i}] {vuln['name']}")
            lines.append(f"      Severity: {vuln['severity']}")
            lines.append(f"      Type: {vuln['type']}")
            lines.append(f"      URL: {vuln['url']}")
            if vuln['parameter']:
                lines.append(f"      Parameter: {vuln['parameter']}")
            if vuln['payload']:
                lines.append(f"      Payload: {vuln['payload']}")
            lines.append(f"      Description: {vuln['description']}")
            lines.append(f"      Solution: {vuln['solution']}")
            lines.append(f"      Evidence: {vuln['evidence']}")
            if vuln['poc']:
                lines.append(f"      PoC: {vuln['poc']}")
            lines.append(f"      CVSS: {vuln['cvss']['score']} ({vuln['cvss']['vector']})")
            lines.append(f"      CWE: {vuln['cvss']['cwe']} | OWASP: {vuln['cvss']['owasp']}")

        lines.append("")
        lines.append("3. NETWORK INFORMATION")
        lines.append("-" * 40)
        net = report["network"]
        lines.append(f"  Real IP: {net['real_ip']}")
        lines.append(f"  CDN: {net['cdn_detected']}")

        if net.get("open_ports"):
            lines.append("\n  Open Ports:")
            for p in net["open_ports"]:
                lines.append(f"    Port {p['port']} ({p['service']}): {p['description']}")

        lines.append("")
        lines.append("4. ADMIN PANELS")
        lines.append("-" * 40)
        for panel in report.get("admin_panels", []):
            lines.append(f"  {panel['path']} -> {panel['status']} ({panel['status_text']})")

        lines.append("")
        lines.append("5. SENSITIVE FILES")
        lines.append("-" * 40)
        for sf in report.get("sensitive_files", []):
            lines.append(f"  {sf['path']} ({sf['size_bytes']} bytes)")

        lines.append("")
        lines.append(f"  Report generated by: {self.company}")
        lines.append(f"  Scanner: {SCANNER_NAME} v{SCANNER_VERSION}")
        lines.append("=" * 80)

        with open(filename, "w", encoding="utf-8") as f:
            f.write("\n".join(lines))

        console.print(f"[bold green]Text report (EN): {filename}[/bold green]")


def main():
    console.print(Panel(BANNER, border_style="red", expand=False))

    if len(sys.argv) < 2:
        console.print("[bold yellow]Verwendung / Usage:[/bold yellow]")
        console.print(f"  python {sys.argv[0]} <URL> [--company <Name>] [--vuln-dir <Pfad>]")
        console.print("")
        console.print("[bold]Beispiele / Examples:[/bold]")
        console.print(f'  python {sys.argv[0]} https://example.com')
        console.print(f'  python {sys.argv[0]} https://example.com --company "GAP Protection GmbH"')
        console.print(f'  python {sys.argv[0]} https://example.com --vuln-dir "../vuln"')
        console.print("")
        
        target = input("\n[?] Ziel-URL eingeben / Enter target URL: ").strip()
        if not target:
            console.print("[red]Keine URL angegeben![/red]")
            sys.exit(1)
    else:
        target = sys.argv[1]

    # Parse arguments
    company = COMPANY_NAME
    vuln_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "vuln")

    args = sys.argv[2:]
    i = 0
    while i < len(args):
        if args[i] == "--company" and i + 1 < len(args):
            company = args[i + 1]
            i += 2
        elif args[i] == "--vuln-dir" and i + 1 < len(args):
            vuln_dir = args[i + 1]
            i += 2
        else:
            i += 1

    # Validate URL
    if not target.startswith(("http://", "https://")):
        target = "https://" + target

    scanner = TeufelScanner(target=target, lang="de", company=company)

    console.print(f"\n[bold white]Starte vollständigen Sicherheitsscan...[/bold white]")
    console.print(f"[bold white]Starting full security scan...[/bold white]\n")

    asyncio.run(scanner.run_full_scan(vuln_dir=vuln_dir))

    console.print(f"\n[bold green]{'='*70}[/bold green]")
    console.print(f"[bold green]  SCAN VOLLSTÄNDIG ABGESCHLOSSEN[/bold green]")
    console.print(f"[bold green]  SCAN FULLY COMPLETED[/bold green]")
    console.print(f"[bold green]{'='*70}[/bold green]")


if __name__ == "__main__":
    main()
