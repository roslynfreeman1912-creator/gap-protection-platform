#!/usr/bin/env python3
"""
Health check script for monitoring
Returns 0 if healthy, 1 if unhealthy
"""
import sys
import os
from pathlib import Path


def check_health():
    """Perform health checks"""
    checks = {
        'vuln_directory': Path('vuln').exists(),
        'logs_directory': Path('logs').exists(),
        'reports_directory': Path('reports').exists(),
        'env_file': Path('.env').exists(),
        'config_file': Path('config.py').exists(),
        'scanner_file': Path('advanced_scanner.py').exists(),
    }
    
    all_healthy = all(checks.values())
    
    if all_healthy:
        print("✅ All health checks passed")
        return 0
    else:
        print("❌ Health check failed:")
        for check, status in checks.items():
            symbol = "✅" if status else "❌"
            print(f"  {symbol} {check}")
        return 1


if __name__ == "__main__":
    sys.exit(check_health())
