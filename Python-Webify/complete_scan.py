#!/usr/bin/env python3
"""
Complete Security Scan Workflow
Integrates scanner + report generation
"""
import asyncio
import sys
import json
from pathlib import Path
from datetime import datetime
from advanced_scanner import AdvancedSecurityScanner
from pdf_report_generator import generate_bilingual_reports
from utils.logger import setup_logger, get_logger
from utils.url_validator import validate_url
import shutil


def setup_logging():
    """Setup logging for the scan"""
    log_file = Path("logs") / f"complete_scan_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"
    log_file.parent.mkdir(exist_ok=True)
    return setup_logger(__name__, log_file=str(log_file))


def distribute_logos():
    """Distribute GAP Protection logos across the project"""
    logger = get_logger(__name__)
    logger.info("Distributing logos and assets...")
    
    # Logo files to distribute
    logo_files = [
        'GAP 1.1.png',
        'GAP Lang 1.1-3.png',
        'GAP-Protection-10.png',
        'Weiß GAP 1.1.png',
        'Weiß GAP Lang 1.1-3.png',
        'Weiß GAP-Protection-10.png'
    ]
    
    # Destinations
    destinations = [
        'client/public',
        'dist/public',
        'static/images',
        'assets'
    ]
    
    # Create destination directories
    for dest in destinations:
        Path(dest).mkdir(parents=True, exist_ok=True)
    
    # Copy logos
    copied = 0
    for logo_file in logo_files:
        if Path(logo_file).exists():
            for dest in destinations:
                try:
                    shutil.copy(logo_file, Path(dest) / logo_file)
                    copied += 1
                except Exception as e:
                    logger.error(f"Error copying {logo_file} to {dest}: {e}")
    
    logger.info(f"Distributed {copied} logo files")
    
    # Return path to main logo for PDF
    main_logo = 'GAP-Protection-10.png'
    if Path(main_logo).exists():
        return str(main_logo)
    return None


async def run_comprehensive_scan(target_url: str):
    """Run comprehensive security scan"""
    logger = get_logger(__name__)
    
    print(f"\n{'='*70}")
    print(f"  GAP PROTECTION - ENTERPRISE SECURITY SCANNER")
    print(f"  Professional Vulnerability Assessment for Banks & Call Centers")
    print(f"{'='*70}\n")
    
    logger.info(f"Target: {target_url}")
    logger.info(f"Scan started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    logger.info("Mode: Full Enterprise Scan")
    
    print(f"[+] Target: {target_url}")
    print(f"[+] Scan started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"[+] Mode: Full Enterprise Scan\n")
    
    # Initialize scanner
    scanner = AdvancedSecurityScanner(target_url, vuln_dir="vuln")
    
    # Run scan
    results = await scanner.comprehensive_scan()
    
    # Save results
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    results_file = f"scan_results_{timestamp}.json"
    
    with open(results_file, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    
    logger.info(f"Scan results saved: {results_file}")
    print(f"\n[✓] Scan results saved: {results_file}")
    
    return results_file, results


def print_summary(results: dict):
    """Print scan summary"""
    logger = get_logger(__name__)
    
    print(f"\n{'='*70}")
    print(f"  SCAN SUMMARY")
    print(f"{'='*70}\n")
    
    summary = results.get('summary', {})
    
    print(f"Total Vulnerabilities: {summary.get('total_vulnerabilities', 0)}")
    print(f"  └─ CRITICAL: {summary.get('critical', 0)}")
    print(f"  └─ HIGH:     {summary.get('high', 0)}")
    print(f"  └─ MEDIUM:   {summary.get('medium', 0)}")
    print(f"  └─ LOW:      {summary.get('low', 0)}")
    print(f"\nAdmin Panels Found: {summary.get('admin_panels', 0)}")
    print(f"Sensitive Files Found: {summary.get('sensitive_files', 0)}")
    print(f"\nRisk Score: {results.get('risk_score', 0):.1f}/10.0")
    
    # Risk assessment
    risk_score = results.get('risk_score', 0)
    if risk_score >= 8.0:
        risk_level = "CRITICAL - IMMEDIATE ACTION REQUIRED"
        color = "\033[91m"  # Red
    elif risk_score >= 6.0:
        risk_level = "HIGH - ACTION REQUIRED SOON"
        color = "\033[93m"  # Yellow
    elif risk_score >= 4.0:
        risk_level = "MEDIUM - SHOULD BE ADDRESSED"
        color = "\033[94m"  # Blue
    else:
        risk_level = "LOW - MONITOR"
        color = "\033[92m"  # Green
    
    print(f"\n{color}Risk Level: {risk_level}\033[0m")
    print(f"\n{'='*70}\n")
    
    logger.info(f"Scan complete. Risk score: {risk_score:.1f}/10.0")


async def main():
    """Main execution function"""
    # Setup logging first
    logger = setup_logging()
    
    if len(sys.argv) < 3:
        print("""
╔═══════════════════════════════════════════════════════════════╗
║  GAP PROTECTION - ENTERPRISE SECURITY SCANNER                 ║
║  Professional Vulnerability Assessment Tool                   ║
╚═══════════════════════════════════════════════════════════════╝

Usage:
  python complete_scan.py <target_url> <client_name>

Examples:
  python complete_scan.py https://bank-example.com "Deutsche Bank AG"
  python complete_scan.py https://callcenter.com "Call Center GmbH"
  
Features:
  ✓ 56,115 vulnerability payloads
  ✓ Admin panel detection
  ✓ Sensitive file discovery
  ✓ Full vulnerability verification with proof
  ✓ Bilingual PDF reports (German/English)
  ✓ Professional company branding
  ✓ CVSS scoring
  ✓ Exploitation guides
  ✓ Remediation steps with code examples

Output:
  - scan_results_TIMESTAMP.json
  - Security_Report_DE_CLIENT_TIMESTAMP.pdf
  - Security_Report_EN_CLIENT_TIMESTAMP.pdf
        """)
        sys.exit(1)
    
    target_url = sys.argv[1]
    client_name = sys.argv[2]
    
    # Validate URL
    logger.info(f"Validating target URL: {target_url}")
    is_valid, error = validate_url(target_url)
    if not is_valid:
        logger.error(f"Invalid URL: {error}")
        print(f"❌ Invalid URL: {error}")
        print("\nFor internal/private IPs, modify the scanner to allow_private=True")
        sys.exit(1)
    
    logger.info("URL validation passed")
    
    # Step 1: Distribute logos
    logo_path = distribute_logos()
    
    # Step 2: Run comprehensive scan
    results_file, results = await run_comprehensive_scan(target_url)
    
    # Step 3: Print summary
    print_summary(results)
    
    # Step 4: Generate PDF reports
    print("[+] Generating professional PDF reports...")
    logger.info("Generating PDF reports...")
    try:
        generate_bilingual_reports(
            scan_results_file=results_file,
            client_name=client_name,
            company_name="GAP Protection GmbH",
            logo_path=logo_path
        )
        logger.info("PDF reports generated successfully")
    except Exception as e:
        logger.error(f"Error generating PDF reports: {e}")
        print(f"[!] Error generating PDF reports: {e}")
        print("[!] Make sure reportlab is installed: pip install reportlab")
    
    # Final summary
    print(f"\n{'='*70}")
    print(f"  SCAN COMPLETE!")
    print(f"{'='*70}\n")
    print(f"[✓] JSON Results: {results_file}")
    print(f"[✓] German PDF: Security_Report_DE_*.pdf")
    print(f"[✓] English PDF: Security_Report_EN_*.pdf")
    print(f"\n[+] All files ready for client delivery!")
    print(f"[+] Thank you for using GAP Protection Security Scanner\n")
    
    logger.info("Scan workflow completed successfully")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n\n[!] Scan interrupted by user")
        sys.exit(1)
    except Exception as e:
        logger = get_logger(__name__)
        logger.error(f"Fatal error: {e}", exc_info=True)
        print(f"\n[!] Error: {e}")
        sys.exit(1)
