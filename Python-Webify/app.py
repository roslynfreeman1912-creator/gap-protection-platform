import asyncio
import aiohttp
from urllib.parse import urljoin, urlparse, parse_qs
from bs4 import BeautifulSoup
import builtwith
import re
import json
import yaml
import os
from pathlib import Path
from typing import Dict, List, Set, Optional
from collections import defaultdict
from flask import Flask, request, jsonify, render_template_string
from datetime import datetime

app = Flask(__name__)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
}


def load_yaml_payloads_for_app(vuln_dir: str = None) -> Dict[str, list]:
    """Load YAML vulnerability payloads from vuln/ directory"""
    if vuln_dir is None:
        vuln_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "vuln")
    vuln_path = Path(vuln_dir)
    if not vuln_path.exists():
        return {}
    yaml_payloads = defaultdict(list)
    for yf in vuln_path.rglob("*.yaml"):
        try:
            with open(yf, "r", encoding="utf-8", errors="ignore") as f:
                data = yaml.safe_load(f)
            if not data or not isinstance(data, dict):
                continue
            if "payloads" in data:
                vtype = data.get("type", yf.stem).lower().replace(" ", "_")
                yaml_payloads[vtype].extend(data["payloads"] if isinstance(data["payloads"], list) else [])
            elif "vulnerabilities" in data:
                for v in data["vulnerabilities"]:
                    if isinstance(v, dict) and "payloads" in v:
                        vtype = v.get("type", "unknown").lower().replace(" ", "_")
                        yaml_payloads[vtype].extend(v["payloads"])
        except Exception:
            continue
    return dict(yaml_payloads)


# Load YAML payloads at startup
YAML_PAYLOADS = load_yaml_payloads_for_app()

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
}

PAYLOADS = {
    "sql_injection": [
        "' OR '1'='1", "' OR '1'='1' --", "' OR '1'='1' #", "' OR '1'='1'/*",
        "admin' --", "admin' #", "admin'/*"
    ],
    "xss": [
        "<script>alert('XSS')</script>", "<img src=x onerror=alert('XSS')>",
        "<svg onload=alert('XSS')>"
    ],
    "lfi": [
        "../../../../etc/passwd", "....//....//....//etc/passwd",
        "../../../../etc/hosts", "file:///etc/passwd"
    ],
    "backup_files": [".bak", ".old", ".backup", ".swp", ".swo", ".save"],
    "admin_panels": [
        "/admin", "/administrator", "/phpmyadmin", "/admin.php", "/admin/login.php",
        "/admin/index.php", "/wp-admin", "/wp-login.php", "/cpanel", "/panel"
    ],
    "sensitive_paths": [
        "/.git/", "/.svn/", "/.env", "/config.php", "/wp-config.php",
        "/.htaccess", "/robots.txt", "/sitemap.xml", "/.idea/", "/vendor/",
        "/node_modules/", "/backup/", "/db/", "/database/", "/sql/",
        "/admin/", "/administrator/", "/phpmyadmin/", "/.ds_store"
    ],
    "command_injection": ["; ls", "| cat /etc/passwd", "`id`", "$(id)"],
    "ssrf": ["http://localhost", "http://127.0.0.1", "http://[::1]"],
    "path_traversal": ["../../../", "..\\..\\..\\", "%2e%2e%2f"],
    "open_redirect": ["https://evil.com", "//evil.com", "http://attacker.com"],
    "ssti": ["${7*7}", "{{7*7}}", "<%= 7*7 %>", "${{7*7}}"]
}

class VulnerabilityScanner:
    def __init__(self, session: aiohttp.ClientSession):
        self.session = session
        self.vulnerabilities = []

    async def check_sql_injection(self, url: str) -> Optional[Dict]:
        parsed = urlparse(url)
        query_params = parse_qs(parsed.query)
        for param, values in query_params.items():
            for payload in PAYLOADS["sql_injection"]:
                test_url = url.replace(f"{param}={values[0]}", f"{param}={payload}")
                try:
                    async with self.session.get(test_url, timeout=aiohttp.ClientTimeout(total=5), headers=HEADERS) as response:
                        if response.status == 200:
                            content = await response.text()
                            sql_errors = ["sql", "mysql", "syntax error", "ORA-", "SQLite", "PostgreSQL"]
                            if any(error.lower() in content.lower() for error in sql_errors):
                                return {
                                    "type": "SQL Injection",
                                    "severity": "Critical",
                                    "url": url,
                                    "parameter": param,
                                    "payload": payload,
                                    "description": f"SQL Injection vulnerability found in parameter '{param}'",
                                    "why": "Attackers can extract, modify, or delete database contents",
                                    "solution": "Use parameterized queries or prepared statements",
                                    "reference": "https://owasp.org/www-community/attacks/SQL_Injection"
                                }
                except:
                    continue
        return None

    async def check_xss(self, url: str) -> Optional[Dict]:
        parsed = urlparse(url)
        query_params = parse_qs(parsed.query)
        for param, values in query_params.items():
            for payload in PAYLOADS["xss"]:
                test_url = url.replace(f"{param}={values[0]}", f"{param}={payload}")
                try:
                    async with self.session.get(test_url, timeout=aiohttp.ClientTimeout(total=5), headers=HEADERS) as response:
                        if response.status == 200:
                            content = await response.text()
                            if payload in content:
                                return {
                                    "type": "Cross-Site Scripting (XSS)",
                                    "severity": "High",
                                    "url": url,
                                    "parameter": param,
                                    "payload": payload,
                                    "description": f"XSS vulnerability found in parameter '{param}'",
                                    "why": "Attackers can steal cookies, session tokens, or redirect users",
                                    "solution": "Sanitize and encode all user input before rendering",
                                    "reference": "https://owasp.org/www-community/attacks/xss/"
                                }
                except:
                    continue
        return None

    async def check_lfi(self, url: str) -> Optional[Dict]:
        parsed = urlparse(url)
        query_params = parse_qs(parsed.query)
        for param, values in query_params.items():
            for payload in PAYLOADS["lfi"]:
                test_url = url.replace(f"{param}={values[0]}", f"{param}={payload}")
                try:
                    async with self.session.get(test_url, timeout=aiohttp.ClientTimeout(total=5), headers=HEADERS) as response:
                        if response.status == 200:
                            content = await response.text()
                            if "root:" in content or "daemon:" in content:
                                return {
                                    "type": "Local File Inclusion (LFI)",
                                    "severity": "Critical",
                                    "url": url,
                                    "parameter": param,
                                    "payload": payload,
                                    "description": f"LFI vulnerability found in parameter '{param}'",
                                    "why": "Attackers can read sensitive files from the server",
                                    "solution": "Validate and sanitize file paths, use whitelist approach",
                                    "reference": "https://owasp.org/www-project-web-security-testing-guide/"
                                }
                except:
                    continue
        return None

    async def check_sensitive_paths(self, base_url: str) -> List[Dict]:
        found = []
        for path in PAYLOADS["sensitive_paths"]:
            test_url = urljoin(base_url, path)
            try:
                async with self.session.get(test_url, timeout=aiohttp.ClientTimeout(total=3), headers=HEADERS) as response:
                    if response.status == 200:
                        found.append({
                            "type": "Dangerous Path",
                            "severity": "High",
                            "url": test_url,
                            "description": f"Found accessible path: {path}",
                            "why": "Accessible sensitive paths can expose administrative interfaces, configuration files, or backup data",
                            "solution": f"1. Remove or restrict access to {path}\n2. Implement proper access controls\n3. Move sensitive files outside web root",
                            "reference": "https://www.owasp.org/index.php/Top_10-2017_A6-Security_Misconfiguration"
                        })
            except:
                continue
        return found

    async def check_insecure_headers(self, url: str, headers_dict: dict) -> List[Dict]:
        vulnerabilities = []
        header_checks = [
            {
                "header": "X-Frame-Options",
                "type": "X-Frame-Options Missing",
                "severity": "Medium",
                "description": "Missing X-Frame-Options header",
                "why": "Clickjacking attacks can trick users into clicking on malicious elements by embedding your site in an iframe",
                "solution": "Add 'X-Frame-Options: SAMEORIGIN' or 'X-Frame-Options: DENY' to server configuration",
                "reference": "https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Frame-Options"
            },
            {
                "header": "Content-Security-Policy",
                "type": "Content-Security-Policy Missing",
                "severity": "High",
                "description": "Missing Content-Security-Policy header",
                "why": "Without CSP, attackers can inject malicious scripts and content into your web pages",
                "solution": "Add 'Content-Security-Policy: default-src 'self'' to server configuration",
                "reference": "https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP"
            },
            {
                "header": "X-Content-Type-Options",
                "type": "X-Content-Type-Options Missing",
                "severity": "Medium",
                "description": "Missing X-Content-Type-Options header",
                "why": "MIME type sniffing can lead to security vulnerabilities by executing files with incorrect content types",
                "solution": "Add 'X-Content-Type-Options: nosniff' to server configuration",
                "reference": "https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Content-Type-Options"
            },
            {
                "header": "Strict-Transport-Security",
                "type": "HSTS Missing",
                "severity": "Medium",
                "description": "Missing Strict-Transport-Security header",
                "why": "Without HSTS, users can be vulnerable to man-in-the-middle attacks",
                "solution": "Add 'Strict-Transport-Security: max-age=31536000; includeSubDomains' header",
                "reference": "https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Strict-Transport-Security"
            }
        ]
        
        for check in header_checks:
            if check["header"] not in headers_dict:
                vulnerabilities.append({
                    "type": check["type"],
                    "severity": check["severity"],
                    "url": url,
                    "description": check["description"],
                    "why": check["why"],
                    "solution": check["solution"],
                    "reference": check["reference"]
                })
        
        server_header = headers_dict.get("Server", "")
        if server_header and any(c.isdigit() for c in server_header):
            vulnerabilities.append({
                "type": "Server Information Disclosure",
                "severity": "Low",
                "url": url,
                "description": f"Server version disclosed: {server_header}",
                "why": "Disclosing server version helps attackers identify potential vulnerabilities in specific versions",
                "solution": "Configure server to hide version information (e.g., in nginx: 'server_tokens off;')",
                "reference": "https://www.nginx.com/resources/wiki/start/topics/tutorials/config_pitfalls/#server-tokens"
            })
        
        return vulnerabilities

    async def scan_url(self, url: str) -> List[Dict]:
        results = []
        if "?" in url:
            sql_result = await self.check_sql_injection(url)
            if sql_result:
                results.append(sql_result)
            xss_result = await self.check_xss(url)
            if xss_result:
                results.append(xss_result)
            lfi_result = await self.check_lfi(url)
            if lfi_result:
                results.append(lfi_result)
        return results


async def crawl_and_scan(target_url: str, progress_callback=None) -> Dict:
    visited = set()
    extracted_links = set()
    extracted_forms = set()
    extracted_folders = set()
    all_vulnerabilities = []
    logs = []
    
    parsed = urlparse(target_url)
    domain = parsed.netloc
    base_url = f"{parsed.scheme}://{parsed.netloc}"
    
    async with aiohttp.ClientSession() as session:
        scanner = VulnerabilityScanner(session)
        
        logs.append({"type": "info", "message": f"Connecting to: {target_url}   Connected OK ......"})
        
        server_info = {}
        response_headers = {}
        try:
            async with session.get(target_url, timeout=aiohttp.ClientTimeout(total=10), headers=HEADERS) as response:
                if response.status == 200:
                    response_headers = dict(response.headers)
                    server_info = {
                        "Server": response.headers.get("Server", "Not available"),
                        "X-Powered-By": response.headers.get("X-Powered-By", "Not available"),
                        "Content-Type": response.headers.get("Content-Type", "Not available"),
                        "URL": base_url,
                        "Port": str(parsed.port or (443 if parsed.scheme == "https" else 80))
                    }
                    
                    header_vulns = await scanner.check_insecure_headers(target_url, response_headers)
                    all_vulnerabilities.extend(header_vulns)
                    
                    sensitive_paths = await scanner.check_sensitive_paths(target_url)
                    all_vulnerabilities.extend(sensitive_paths)
                    
                    html = await response.text()
                    soup = BeautifulSoup(html, "html.parser")
                    
                    for link_tag in soup.find_all("a"):
                        href = link_tag.get("href")
                        if href:
                            href = urljoin(target_url, href)
                            link_parsed = urlparse(href)
                            if link_parsed.netloc == domain:
                                clean_url = link_parsed.scheme + "://" + link_parsed.netloc + link_parsed.path
                                if clean_url.endswith("/") and clean_url not in extracted_folders:
                                    extracted_folders.add(clean_url)
                                    logs.append({"type": "folder", "message": f"Found Folder: {clean_url}"})
                                if "?" in href and href not in extracted_links:
                                    extracted_links.add(href)
                                    logs.append({"type": "link", "message": f"Found Param Link: {href}"})
                    
                    for form in soup.find_all("form"):
                        action = form.get("action")
                        full_action_url = urljoin(target_url, action) if action else target_url
                        if full_action_url not in extracted_forms:
                            extracted_forms.add(full_action_url)
                            logs.append({"type": "form", "message": f"Found Form at: {full_action_url}"})
                    
                    for link in list(extracted_links)[:20]:
                        logs.append({"type": "scan", "message": f"Processing: {link}"})
                        link_vulns = await scanner.scan_url(link)
                        all_vulnerabilities.extend(link_vulns)
                        
        except Exception as e:
            logs.append({"type": "error", "message": f"Error: {str(e)}"})
        
        tech_info = {}
        try:
            tech = builtwith.parse(target_url)
            tech_info = tech
        except:
            pass
    
    return {
        "target": target_url,
        "vulnerabilities": all_vulnerabilities,
        "links_found": list(extracted_links),
        "forms_found": list(extracted_forms),
        "folders_found": list(extracted_folders),
        "server_info": server_info,
        "response_headers": response_headers,
        "tech_info": tech_info,
        "logs": logs
    }


HTML_TEMPLATE = '''
<!DOCTYPE html>
<html lang="ar" dir="ltr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cyber Red Tools - Vulnerability Scanner</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap');
        
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body {
            font-family: 'JetBrains Mono', 'Courier New', monospace;
            background: #0d0d0d;
            color: #00ff00;
            min-height: 100vh;
            padding: 20px;
            font-size: 14px;
            line-height: 1.4;
        }
        
        .terminal {
            max-width: 1200px;
            margin: 0 auto;
            background: #0a0a0a;
            border: 1px solid #333;
            border-radius: 8px;
            overflow: hidden;
        }
        
        .terminal-header {
            background: #1a1a1a;
            padding: 10px 15px;
            display: flex;
            align-items: center;
            gap: 8px;
            border-bottom: 1px solid #333;
        }
        
        .terminal-btn {
            width: 12px;
            height: 12px;
            border-radius: 50%;
        }
        
        .btn-red { background: #ff5f56; }
        .btn-yellow { background: #ffbd2e; }
        .btn-green { background: #27ca3f; }
        
        .terminal-title {
            color: #888;
            margin-left: 10px;
            font-size: 12px;
        }
        
        .terminal-body {
            padding: 20px;
            min-height: 600px;
            max-height: 85vh;
            overflow-y: auto;
        }
        
        .banner {
            color: #ff0000;
            white-space: pre;
            font-size: 11px;
            line-height: 1.2;
            margin-bottom: 20px;
            text-align: center;
        }
        
        .box {
            border: 1px solid #444;
            border-radius: 4px;
            margin: 15px 0;
            overflow: hidden;
        }
        
        .box-header {
            background: #1a1a1a;
            padding: 8px 15px;
            border-bottom: 1px solid #444;
            color: #00ff00;
            font-weight: bold;
        }
        
        .box-content {
            padding: 15px;
        }
        
        .input-form {
            display: flex;
            gap: 10px;
            margin: 20px 0;
        }
        
        .input-form input {
            flex: 1;
            padding: 12px 15px;
            font-size: 14px;
            background: #111;
            border: 1px solid #00ff00;
            color: #00ff00;
            font-family: inherit;
            border-radius: 4px;
        }
        
        .input-form input::placeholder { color: #555; }
        
        .input-form button {
            padding: 12px 25px;
            font-size: 14px;
            background: #00ff00;
            border: none;
            color: #000;
            cursor: pointer;
            font-weight: bold;
            font-family: inherit;
            border-radius: 4px;
            transition: all 0.2s;
        }
        
        .input-form button:hover { background: #00cc00; }
        .input-form button:disabled { background: #333; color: #666; cursor: not-allowed; }
        
        .info-line { color: #00ff00; margin: 5px 0; }
        .info-line.red { color: #ff0000; }
        .info-line.yellow { color: #ffaa00; }
        .info-line.cyan { color: #00ffff; }
        .info-line.magenta { color: #ff00ff; }
        
        .table {
            width: 100%;
            border-collapse: collapse;
            margin: 10px 0;
        }
        
        .table th, .table td {
            border: 1px solid #444;
            padding: 8px 12px;
            text-align: left;
        }
        
        .table th {
            background: #1a1a1a;
            color: #00ffff;
        }
        
        .table td { color: #00ff00; }
        
        .vuln-box {
            border: 1px solid #ff0000;
            border-radius: 4px;
            margin: 15px 0;
            background: #1a0000;
        }
        
        .vuln-box.high { border-color: #ff6600; background: #1a0d00; }
        .vuln-box.medium { border-color: #ffaa00; background: #1a1500; }
        .vuln-box.low { border-color: #888; background: #111; }
        
        .vuln-header {
            padding: 10px 15px;
            border-bottom: 1px solid inherit;
            font-weight: bold;
        }
        
        .vuln-box.critical .vuln-header { color: #ff0000; border-color: #ff0000; }
        .vuln-box.high .vuln-header { color: #ff6600; border-color: #ff6600; }
        .vuln-box.medium .vuln-header { color: #ffaa00; border-color: #ffaa00; }
        .vuln-box.low .vuln-header { color: #888; border-color: #888; }
        
        .vuln-content {
            padding: 15px;
            font-size: 13px;
        }
        
        .vuln-content p { margin: 5px 0; color: #ccc; }
        .vuln-content .label { color: #00ffff; }
        .vuln-content a { color: #00aaff; text-decoration: none; }
        .vuln-content a:hover { text-decoration: underline; }
        
        .phase-box {
            border: 1px solid #00ffff;
            border-radius: 4px;
            margin: 20px 0;
            padding: 10px 15px;
            display: inline-block;
        }
        
        .phase-box h3 {
            color: #00ffff;
            font-size: 14px;
            margin: 0;
        }
        
        .log-entry {
            padding: 3px 0;
            font-size: 13px;
        }
        
        .log-entry.folder { color: #00aaff; }
        .log-entry.link { color: #00ff00; }
        .log-entry.form { color: #ff00ff; }
        .log-entry.scan { color: #888; }
        .log-entry.error { color: #ff0000; }
        
        .loading {
            text-align: center;
            padding: 40px;
            color: #00ff00;
        }
        
        .loading-spinner {
            display: inline-block;
            width: 30px;
            height: 30px;
            border: 3px solid #333;
            border-top-color: #00ff00;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        
        @keyframes spin { to { transform: rotate(360deg); } }
        
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 15px;
            margin: 20px 0;
        }
        
        .stat-box {
            background: #111;
            border: 1px solid #333;
            padding: 15px;
            text-align: center;
            border-radius: 4px;
        }
        
        .stat-box.critical { border-color: #ff0000; }
        .stat-box.high { border-color: #ff6600; }
        .stat-box.medium { border-color: #ffaa00; }
        
        .stat-number {
            font-size: 28px;
            font-weight: bold;
            display: block;
        }
        
        .stat-number.critical { color: #ff0000; }
        .stat-number.high { color: #ff6600; }
        .stat-number.medium { color: #ffaa00; }
        .stat-number.green { color: #00ff00; }
        
        .stat-label { color: #888; font-size: 12px; }
        
        #results { display: none; }
        
        .scrollable-box {
            max-height: 300px;
            overflow-y: auto;
        }
    </style>
</head>
<body>
    <div class="terminal">
        <div class="terminal-header">
            <div class="terminal-btn btn-red"></div>
            <div class="terminal-btn btn-yellow"></div>
            <div class="terminal-btn btn-green"></div>
            <span class="terminal-title">Cyber Red Tools - Security Assessment</span>
        </div>
        
        <div class="terminal-body">
            <pre class="banner">
&#9484;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;  Welcome to Cyber Red Tools &#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9488;
&#9474;                                                                                                    &#9474;
&#9474;     &#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9559;&#9608;&#9608;&#9559;   &#9608;&#9608;&#9559;&#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9559; &#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9559;&#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9559;     &#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9559; &#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9559;                                   &#9474;
&#9474;     &#9608;&#9608;&#9556;&#9552;&#9552;&#9552;&#9552;&#9565;&#9562;&#9608;&#9608;&#9559; &#9608;&#9608;&#9556;&#9565;&#9608;&#9608;&#9556;&#9552;&#9552;&#9608;&#9608;&#9559;&#9608;&#9608;&#9556;&#9552;&#9552;&#9552;&#9552;&#9565;&#9608;&#9608;&#9556;&#9552;&#9552;&#9608;&#9608;&#9559;    &#9608;&#9608;&#9556;&#9552;&#9552;&#9608;&#9608;&#9559;&#9608;&#9608;&#9556;&#9552;&#9552;&#9552;&#9552;&#9565;                                   &#9474;
&#9474;     &#9608;&#9608;&#9474;      &#9562;&#9608;&#9608;&#9608;&#9608;&#9556;&#9565; &#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9556;&#9565;&#9608;&#9608;&#9608;&#9608;&#9608;&#9559;  &#9608;&#9608;&#9474;  &#9608;&#9608;&#9474;    &#9608;&#9608;&#9474;  &#9608;&#9608;&#9474;&#9608;&#9608;&#9608;&#9608;&#9608;&#9559;                                    &#9474;
&#9474;     &#9608;&#9608;&#9474;       &#9562;&#9608;&#9608;&#9556;&#9565;  &#9608;&#9608;&#9556;&#9552;&#9552;&#9608;&#9608;&#9559;&#9608;&#9608;&#9556;&#9552;&#9552;&#9565;  &#9608;&#9608;&#9474;  &#9608;&#9608;&#9474;    &#9608;&#9608;&#9474;  &#9608;&#9608;&#9474;&#9608;&#9608;&#9556;&#9552;&#9552;&#9565;                                    &#9474;
&#9474;     &#9562;&#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9559;   &#9608;&#9608;&#9474;   &#9608;&#9608;&#9474;  &#9608;&#9608;&#9474;&#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9559;&#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9556;&#9565;    &#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9556;&#9565;&#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9608;&#9559;                                   &#9474;
&#9474;      &#9562;&#9552;&#9552;&#9552;&#9552;&#9552;&#9565;   &#9562;&#9552;&#9565;   &#9562;&#9552;&#9565;  &#9562;&#9552;&#9565;&#9562;&#9552;&#9552;&#9552;&#9552;&#9552;&#9552;&#9565;&#9562;&#9552;&#9552;&#9552;&#9552;&#9552;&#9565;     &#9562;&#9552;&#9552;&#9552;&#9552;&#9552;&#9565; &#9562;&#9552;&#9552;&#9552;&#9552;&#9552;&#9552;&#9565; 2025                         &#9474;
&#9474;     [+] gapprotection.com                                                                          &#9474;
&#9474;     [+] Tools Super 2025-26                                                                        &#9474;
&#9474;     - website vulnerability scanner tool                                                           &#9474;
&#9474;                                                                                                    &#9474;
&#9492;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472; Security Assessment Tool  2025-26  gapprotection.com &#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9472;&#9496;
            </pre>
            
            <p class="info-line">[+] Starting application...</p>
            <p class="info-line">[+] Super Tool Scanner ...</p>
            <p class="info-line">[+] Cyber Red Tool version 2.0.0</p>
            
            <form id="scanForm" class="input-form">
                <input type="text" id="targetUrl" placeholder="Enter Target URL (e.g., https://example.com)" required>
                <button type="submit" id="scanBtn">[ SCAN ]</button>
            </form>
            
            <div id="loading" style="display: none;">
                <div class="loading">
                    <div class="loading-spinner"></div>
                    <p style="margin-top: 15px;">Scanning target... Please wait</p>
                </div>
            </div>
            
            <div id="results"></div>
        </div>
    </div>
    
    <script>
        document.getElementById('scanForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const url = document.getElementById('targetUrl').value;
            const btn = document.getElementById('scanBtn');
            const loading = document.getElementById('loading');
            const results = document.getElementById('results');
            
            btn.disabled = true;
            btn.textContent = '[ SCANNING... ]';
            loading.style.display = 'block';
            results.style.display = 'none';
            results.innerHTML = '';
            
            try {
                const response = await fetch('/api/scan', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: url })
                });
                const data = await response.json();
                displayResults(data);
            } catch (error) {
                results.innerHTML = '<div class="box"><div class="box-header" style="color: #ff0000;">Error</div><div class="box-content"><p style="color: #ff0000;">' + error.message + '</p></div></div>';
                results.style.display = 'block';
            }
            
            loading.style.display = 'none';
            btn.disabled = false;
            btn.textContent = '[ SCAN ]';
        });
        
        function displayResults(data) {
            const results = document.getElementById('results');
            let html = '';
            
            // Phase 0: Initialization
            html += '<div class="phase-box"><h3>Phase 0: Initialization - Starting Security Scan</h3></div>';
            html += '<p class="info-line">[+] Connecting to: ' + data.target + '   Connected OK ......</p>';
            
            // Server Headers Table
            if (Object.keys(data.response_headers).length > 0) {
                html += '<p class="info-line cyan" style="margin-top: 20px;">[^_^] Server Response Headers Connections</p>';
                html += '<table class="table">';
                html += '<tr><th>[+] Type Info</th><th>[+] Data Value</th></tr>';
                for (const [key, value] of Object.entries(data.response_headers)) {
                    if (['Server', 'Date', 'Content-Type', 'Transfer-Encoding', 'Connection', 'X-Powered-By', 'Content-Encoding'].includes(key)) {
                        html += '<tr><td>' + key + '</td><td>' + value + '</td></tr>';
                    }
                }
                html += '</table>';
            }
            
            // Server Information Box
            if (Object.keys(data.server_info).length > 0) {
                html += '<div class="box">';
                html += '<div class="box-header">Server Information</div>';
                html += '<div class="box-content">';
                for (const [key, value] of Object.entries(data.server_info)) {
                    html += '<p class="info-line">' + key + ': ' + value + '</p>';
                }
                html += '</div></div>';
            }
            
            // Phase 1: Web Vulnerability Scan
            html += '<div class="phase-box"><h3>Phase 1: Web Vulnerability Scan - Starting Web Vulnerability Scan...</h3></div>';
            
            // Vulnerabilities
            const criticalCount = data.vulnerabilities.filter(v => v.severity === 'Critical').length;
            const highCount = data.vulnerabilities.filter(v => v.severity === 'High').length;
            const mediumCount = data.vulnerabilities.filter(v => v.severity === 'Medium').length;
            const lowCount = data.vulnerabilities.filter(v => v.severity === 'Low').length;
            
            // Stats Grid
            html += '<div class="stats-grid">';
            html += '<div class="stat-box critical"><span class="stat-number critical">' + criticalCount + '</span><span class="stat-label">Critical</span></div>';
            html += '<div class="stat-box high"><span class="stat-number high">' + highCount + '</span><span class="stat-label">High</span></div>';
            html += '<div class="stat-box medium"><span class="stat-number medium">' + mediumCount + '</span><span class="stat-label">Medium</span></div>';
            html += '<div class="stat-box"><span class="stat-number green">' + lowCount + '</span><span class="stat-label">Low</span></div>';
            html += '</div>';
            
            // Individual Vulnerabilities
            for (const vuln of data.vulnerabilities) {
                const severityClass = vuln.severity.toLowerCase();
                html += '<div class="vuln-box ' + severityClass + '">';
                html += '<div class="vuln-header">' + vuln.type + ' Issue</div>';
                html += '<div class="vuln-content">';
                html += '<p><span class="label">Header Vulnerability Found!</span></p>';
                html += '<p><span class="label">Type:</span> ' + vuln.type + '</p>';
                html += '<p><span class="label">Severity:</span> ' + vuln.severity + '</p>';
                html += '<p><span class="label">Description:</span> ' + vuln.description + '</p>';
                html += '<p><span class="label">Why:</span> ' + vuln.why + '</p>';
                html += '<p><span class="label">Solution:</span> ' + vuln.solution + '</p>';
                if (vuln.reference) {
                    html += '<p><span class="label">Reference:</span> <a href="' + vuln.reference + '" target="_blank">' + vuln.reference + '</a></p>';
                }
                html += '</div></div>';
            }
            
            // Phase 2: Crawling
            html += '<div class="phase-box"><h3>Phase 2: Crawling - Starting crawling phase...</h3></div>';
            
            // Sensitive Paths Found
            const sensitivePaths = data.vulnerabilities.filter(v => v.type === 'Dangerous Path');
            if (sensitivePaths.length > 0) {
                html += '<div class="box">';
                html += '<div class="box-header">Sensitive Paths Found in ' + data.target + '</div>';
                html += '<div class="box-content scrollable-box">';
                for (const path of sensitivePaths) {
                    html += '<p class="info-line">URL: ' + path.url + '</p>';
                }
                html += '</div></div>';
            }
            
            // Crawling Logs
            if (data.logs && data.logs.length > 0) {
                html += '<div class="box">';
                html += '<div class="box-header">Crawling Results</div>';
                html += '<div class="box-content scrollable-box">';
                for (const log of data.logs) {
                    html += '<p class="log-entry ' + log.type + '">[+] ' + log.message + '</p>';
                }
                html += '</div></div>';
            }
            
            // Links Found
            if (data.links_found.length > 0) {
                html += '<div class="box">';
                html += '<div class="box-header">Links with Parameters Found (' + data.links_found.length + ')</div>';
                html += '<div class="box-content scrollable-box">';
                for (const link of data.links_found) {
                    html += '<p class="info-line">[+] ' + link + '</p>';
                }
                html += '</div></div>';
            }
            
            // Forms Found
            if (data.forms_found.length > 0) {
                html += '<div class="box">';
                html += '<div class="box-header">Forms Found (' + data.forms_found.length + ')</div>';
                html += '<div class="box-content scrollable-box">';
                for (const form of data.forms_found) {
                    html += '<p class="info-line magenta">[+] ' + form + '</p>';
                }
                html += '</div></div>';
            }
            
            // Folders Found
            if (data.folders_found.length > 0) {
                html += '<div class="box">';
                html += '<div class="box-header">Folders Found (' + data.folders_found.length + ')</div>';
                html += '<div class="box-content scrollable-box">';
                for (const folder of data.folders_found) {
                    html += '<p class="info-line cyan">[+] ' + folder + '</p>';
                }
                html += '</div></div>';
            }
            
            // Scan Complete
            html += '<div class="box" style="border-color: #00aaff; margin-top: 30px;">';
            html += '<div class="box-header" style="color: #00aaff;">Scan Complete</div>';
            html += '<div class="box-content">';
            html += '<p class="info-line">Total Vulnerabilities: ' + data.vulnerabilities.length + '</p>';
            html += '<p class="info-line">Links Found: ' + data.links_found.length + '</p>';
            html += '<p class="info-line">Forms Found: ' + data.forms_found.length + '</p>';
            html += '<p class="info-line">Folders Found: ' + data.folders_found.length + '</p>';
            html += '</div></div>';
            
            results.innerHTML = html;
            results.style.display = 'block';
        }
    </script>
</body>
</html>
'''

@app.route('/')
def index():
    return render_template_string(HTML_TEMPLATE)

@app.route('/api/scan', methods=['POST'])
def scan():
    data = request.get_json()
    url = data.get('url', '')
    
    if not url:
        return jsonify({"error": "URL is required"}), 400
    
    if not url.startswith('http://') and not url.startswith('https://'):
        url = 'https://' + url
    
    try:
        result = asyncio.run(crawl_and_scan(url))
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    # Use environment variable for debug mode
    debug_mode = os.getenv('FLASK_DEBUG', 'False').lower() == 'true'
    port = int(os.getenv('FLASK_PORT', '5000'))
    host = os.getenv('FLASK_HOST', '0.0.0.0')
    
    if debug_mode:
        print("⚠️  WARNING: Running in DEBUG mode. Do not use in production!")
    
    app.run(host=host, port=port, debug=debug_mode)
