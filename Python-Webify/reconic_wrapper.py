#!/usr/bin/env python3
"""Wrapper for Reconic that outputs JSON results to stdout for the Node.js backend"""
import sys
import os
import json
import asyncio
from pathlib import Path
from datetime import datetime

# Add reconic dir to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from reconic import ScanConfig, ReconicScanner, ToolConfig

async def run_scan(target_url, options=None):
    """Run Reconic scan and return JSON results"""
    options = options or {}
    
    output_dir = Path(f"/opt/gapp/reconic/output/{datetime.now().strftime('%Y%m%d_%H%M%S')}")
    output_dir.mkdir(parents=True, exist_ok=True)
    
    config = ScanConfig(
        target_url=target_url,
        timeout=options.get("timeout", 20),
        concurrency=options.get("concurrency", 50),
        max_depth=options.get("depth", 3),
        use_subfinder=options.get("subfinder", True),
        use_amass=options.get("amass", False),
        use_katana=options.get("katana", True),
        use_nuclei=options.get("nuclei", True),
        use_httpx=options.get("httpx", True),
        use_playwright=options.get("playwright", False),
        takeover_check=options.get("takeover", True),
        output_dir=output_dir
    )
    
    scanner = ReconicScanner(config)
    
    results = {
        "target": target_url,
        "scan_date": datetime.now().isoformat(),
        "status": "running",
        "subdomains": [],
        "alive_hosts": [],
        "endpoints": [],
        "takeovers": [],
        "nuclei_results": None
    }
    
    try:
        await scanner.run()
        
        # Read the saved results
        result_files = sorted(output_dir.glob("recon_*.json"))
        if result_files:
            with open(result_files[-1]) as f:
                results = json.load(f)
        
        # Also read nuclei results if available
        nuclei_file = output_dir / "nuclei_results.json"
        if nuclei_file.exists():
            nuclei_findings = []
            with open(nuclei_file) as f:
                for line in f:
                    if line.strip():
                        try:
                            nuclei_findings.append(json.loads(line))
                        except:
                            pass
            results["nuclei_findings"] = nuclei_findings
        
        results["status"] = "completed"
        results["output_dir"] = str(output_dir)
        
    except Exception as e:
        results["status"] = "error"
        results["error"] = str(e)
    
    return results

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: python3 run_reconic.py <target_url> [options_json]"}))
        sys.exit(1)
    
    target = sys.argv[1]
    options = {}
    if len(sys.argv) > 2:
        try:
            options = json.loads(sys.argv[2])
        except:
            pass
    
    result = asyncio.run(run_scan(target, options))
    print("__RECONIC_RESULT__")
    print(json.dumps(result, indent=2, default=str))
