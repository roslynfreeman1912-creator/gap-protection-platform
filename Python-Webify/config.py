# GAP Protection - Security Scanner Configuration
# Konfigurationsdatei für professionelle Sicherheitsprüfungen

# =============================================================================
# COMPANY INFORMATION / FIRMENINFORMATIONEN
# =============================================================================

import os

# Load from environment variables with fallback defaults
COMPANY_NAME = os.getenv("COMPANY_NAME", "GAP Protection GmbH")
COMPANY_LOGO = os.getenv("COMPANY_LOGO", "GAP-Protection-10.png")
COMPANY_EMAIL = os.getenv("COMPANY_EMAIL", "security@gap-protection.com")
COMPANY_PHONE = os.getenv("COMPANY_PHONE", "+49 XXX XXXXXXX")
COMPANY_WEBSITE = os.getenv("COMPANY_WEBSITE", "https://gap-protection.com")

# =============================================================================
# SCAN SETTINGS / SCAN-EINSTELLUNGEN
# =============================================================================

# Scan aggressiveness / Aggressivität
# Options: 'low', 'medium', 'high', 'enterprise'
SCAN_LEVEL = "enterprise"

# Maximum concurrent requests / Maximale gleichzeitige Anfragen
MAX_CONCURRENT_REQUESTS = 50

# Request timeout (seconds) / Anfrage-Timeout (Sekunden)
REQUEST_TIMEOUT = 10

# Delay between requests (seconds) / Verzögerung zwischen Anfragen
REQUEST_DELAY = 0.1

# Maximum URLs to scan / Maximale zu scannende URLs
MAX_URLS_TO_SCAN = 100

# Enable admin panel detection / Admin-Panel-Erkennung aktivieren
ENABLE_ADMIN_DETECTION = True

# Enable sensitive file detection / Sensible Datei-Erkennung aktivieren
ENABLE_SENSITIVE_FILES = True

# Enable vulnerability verification / Schwachstellen-Verifizierung aktivieren
ENABLE_VULNERABILITY_VERIFICATION = True

# =============================================================================
# VULNERABILITY TYPES / SCHWACHSTELLENTYPEN
# =============================================================================

ENABLED_VULNERABILITY_TYPES = [
    'sql_injection',
    'xss',
    'lfi',
    'rfi',
    'rce',
    'command_injection',
    'ssrf',
    'xxe',
    'ssti',
    'csrf',
    'idor',
    'jwt',
    'cors',
    'open_redirect',
    'path_traversal',
    'file_upload',
    'deserialization',
    'clickjacking',
    'hpp',
]

# Maximum payloads per vulnerability type / Maximale Payloads pro Typ
MAX_PAYLOADS_PER_TYPE = 20

# =============================================================================
# REPORT SETTINGS / BERICHTSEINSTELLUNGEN
# =============================================================================

# Default report language / Standard-Berichtssprache
DEFAULT_LANGUAGE = "de"  # Options: 'de', 'en'

# Generate both languages / Beide Sprachen generieren
GENERATE_BILINGUAL = True

# Include screenshots / Screenshots einschließen
INCLUDE_SCREENSHOTS = False

# Include payload details / Payload-Details einschließen
INCLUDE_PAYLOAD_DETAILS = True

# Include remediation code examples / Remediation-Code-Beispiele einschließen
INCLUDE_CODE_EXAMPLES = True

# PDF page size / PDF-Seitengröße
PDF_PAGE_SIZE = "A4"  # Options: 'A4', 'Letter'

# =============================================================================
# SEVERITY THRESHOLDS / SCHWEREGRAD-SCHWELLENWERTE
# =============================================================================

# CVSS score thresholds / CVSS-Score-Schwellenwerte
CVSS_CRITICAL = 9.0
CVSS_HIGH = 7.0
CVSS_MEDIUM = 4.0
CVSS_LOW = 0.1

# Risk score thresholds (0-10) / Risiko-Score-Schwellenwerte (0-10)
RISK_CRITICAL = 8.0
RISK_HIGH = 6.0
RISK_MEDIUM = 4.0
RISK_LOW = 0.0

# =============================================================================
# NOTIFICATION SETTINGS / BENACHRICHTIGUNGSEINSTELLUNGEN
# =============================================================================

# Send email notification when scan completes / E-Mail bei Scan-Abschluss
SEND_EMAIL_NOTIFICATION = False

# Email recipients / E-Mail-Empfänger
EMAIL_RECIPIENTS = [
    "admin@gap-protection.com",
    "security-team@gap-protection.com"
]

# Send alert for critical findings / Warnung bei kritischen Funden
ALERT_ON_CRITICAL = True

# Webhook URL for notifications / Webhook-URL für Benachrichtigungen
WEBHOOK_URL = None

# =============================================================================
# ADVANCED SETTINGS / ERWEITERTE EINSTELLUNGEN
# =============================================================================

# User-Agent string / User-Agent-String
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

# Follow redirects / Weiterleitungen folgen
FOLLOW_REDIRECTS = True

# Verify SSL certificates / SSL-Zertifikate verifizieren
VERIFY_SSL = True

# Custom headers / Benutzerdefinierte Header
CUSTOM_HEADERS = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
    "Accept-Encoding": "gzip, deflate",
}

# Excluded paths / Ausgeschlossene Pfade
EXCLUDED_PATHS = [
    '/logout',
    '/signout',
    '/delete',
    '/remove',
]

# Excluded extensions / Ausgeschlossene Erweiterungen
EXCLUDED_EXTENSIONS = [
    '.jpg', '.jpeg', '.png', '.gif', '.svg', '.ico',
    '.css', '.js', '.woff', '.woff2', '.ttf', '.eot',
    '.pdf', '.zip', '.tar', '.gz', '.rar',
    '.mp4', '.mp3', '.avi', '.mov', '.wav',
]

# =============================================================================
# PAYLOAD DATABASE / PAYLOAD-DATENBANK
# =============================================================================

# Vulnerability payloads directory / Schwachstellen-Payload-Verzeichnis
VULN_PAYLOADS_DIR = "vuln"

# Load custom payloads / Benutzerdefinierte Payloads laden
LOAD_CUSTOM_PAYLOADS = True

# Custom payloads directory / Benutzerdefiniertes Payload-Verzeichnis
CUSTOM_PAYLOADS_DIR = "vuln/custom"

# =============================================================================
# LOGGING SETTINGS / PROTOKOLLIERUNGSEINSTELLUNGEN
# =============================================================================

# Log level / Protokollierungsstufe
# Options: 'DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'
LOG_LEVEL = "INFO"

# Log file / Protokolldatei
LOG_FILE = "gap_scanner.log"

# Log format / Protokollformat
LOG_FORMAT = "%(asctime)s - %(levelname)s - %(message)s"

# =============================================================================
# PERFORMANCE TUNING / LEISTUNGSOPTIMIERUNG
# =============================================================================

# Enable caching / Caching aktivieren
ENABLE_CACHE = True

# Cache directory / Cache-Verzeichnis
CACHE_DIR = ".cache"

# Cache expiration (seconds) / Cache-Ablauf (Sekunden)
CACHE_EXPIRATION = 3600

# Memory limit (MB) / Speicherlimit (MB)
MEMORY_LIMIT = 2048

# =============================================================================
# COMPLIANCE SETTINGS / COMPLIANCE-EINSTELLUNGEN
# =============================================================================

# Check GDPR compliance / DSGVO-Konformität prüfen
CHECK_GDPR = True

# Check PCI-DSS compliance / PCI-DSS-Konformität prüfen
CHECK_PCI_DSS = True

# Check ISO 27001 compliance / ISO 27001-Konformität prüfen
CHECK_ISO_27001 = True

# Check OWASP Top 10 / OWASP Top 10 prüfen
CHECK_OWASP_TOP_10 = True

# =============================================================================
# CLIENT-SPECIFIC SETTINGS / KUNDENSPEZIFISCHE EINSTELLUNGEN
# =============================================================================

# Industry sector / Branche
# Options: 'banking', 'callcenter', 'healthcare', 'ecommerce', 'government', 'other'
INDUSTRY_SECTOR = "banking"

# Compliance requirements / Compliance-Anforderungen
COMPLIANCE_REQUIREMENTS = [
    'GDPR',
    'PCI-DSS',
    'ISO 27001',
    'BAFIN',
]

# Critical assets to protect / Kritische zu schützende Assets
CRITICAL_ASSETS = [
    'customer_data',
    'payment_information',
    'authentication_system',
    'database_access',
    'admin_panels',
]

# =============================================================================
# REPORTING CUSTOMIZATION / BERICHTSANPASSUNG
# =============================================================================

# Report title / Berichtstitel
REPORT_TITLE_DE = "Sicherheitsbewertungsbericht"
REPORT_TITLE_EN = "Security Assessment Report"

# Report subtitle / Berichtsuntertitel
REPORT_SUBTITLE_DE = "Professionelle Schwachstellenanalyse"
REPORT_SUBTITLE_EN = "Professional Vulnerability Analysis"

# Include executive summary / Executive Summary einschließen
INCLUDE_EXECUTIVE_SUMMARY = True

# Include risk matrix / Risikomatrix einschließen
INCLUDE_RISK_MATRIX = True

# Include compliance checklist / Compliance-Checkliste einschließen
INCLUDE_COMPLIANCE_CHECKLIST = True

# Include recommendations / Empfehlungen einschließen
INCLUDE_RECOMMENDATIONS = True

# =============================================================================
# END OF CONFIGURATION / ENDE DER KONFIGURATION
# =============================================================================

# Note: Restart scanner after changing configuration
# Hinweis: Scanner nach Konfigurationsänderung neu starten
