#!/usr/bin/env python3
"""TEUFEL SHIELD - Deep Reconnaissance Runner.

This script bridges remix-of-mlm-main with the TEUFEL SHIELD scanner
(`/api/recon/deep`) and stores a timestamped JSON report under `reports/`.
"""

from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from urllib import error, request


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="TEUFEL SHIELD - Execute deep recon and save JSON output."
    )
    parser.add_argument("target", help="Target URL or hostname (example.com or https://example.com)")
    parser.add_argument(
        "--scanner-url",
        default="http://localhost:5000/api/recon/deep",
        help="Python-Webify deep recon endpoint URL",
    )
    parser.add_argument("--max-pages", type=int, default=30, help="Crawler page limit (5-100)")
    parser.add_argument("--wayback-limit", type=int, default=300, help="Wayback URL limit (25-1000)")
    parser.add_argument(
        "--output",
        default="",
        help="Optional output path; default is reports/deep_recon_<timestamp>.json",
    )
    return parser.parse_args()


def normalize_target(value: str) -> str:
    value = value.strip()
    if not value:
        raise ValueError("Target cannot be empty")
    if value.startswith("http://") or value.startswith("https://"):
        return value
    return f"https://{value}"


def call_deep_recon(scanner_url: str, payload: dict[str, object]) -> dict[str, object]:
    body = json.dumps(payload).encode("utf-8")
    req = request.Request(
        scanner_url,
        data=body,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )

    with request.urlopen(req, timeout=180) as resp:
        raw = resp.read().decode("utf-8", errors="replace")
        return json.loads(raw)


def make_default_output_path() -> Path:
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%SZ")
    return Path("reports") / f"deep_recon_{ts}.json"


def main() -> int:
    args = parse_args()

    try:
        target_url = normalize_target(args.target)
    except ValueError as exc:
        print(f"[ERROR] {exc}")
        return 1

    payload = {
        "targetUrl": target_url,
        "maxPages": args.max_pages,
        "waybackLimit": args.wayback_limit,
    }

    try:
        result = call_deep_recon(args.scanner_url, payload)
    except error.HTTPError as exc:
        text = exc.read().decode("utf-8", errors="replace")
        print(f"[ERROR] Scanner returned HTTP {exc.code}: {text}")
        return 2
    except error.URLError as exc:
        print(f"[ERROR] Could not reach scanner endpoint: {exc.reason}")
        return 3
    except TimeoutError:
        print("[ERROR] Request timed out while waiting for scanner response")
        return 4
    except json.JSONDecodeError:
        print("[ERROR] Scanner response is not valid JSON")
        return 5

    output_path = Path(args.output) if args.output else make_default_output_path()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(result, indent=2, ensure_ascii=True), encoding="utf-8")

    print(f"[TEUFEL SHIELD] Deep recon completed for {target_url}")
    print(f"[TEUFEL SHIELD] Report saved to: {output_path}")

    # Print a compact summary for quick operator feedback.
    recon = result.get("reconnaissance", {}) if isinstance(result, dict) else {}
    surface = result.get("attackSurface", {}) if isinstance(result, dict) else {}

    resolved_ips = recon.get("resolvedIPs", []) if isinstance(recon, dict) else []
    subdomains = recon.get("subdomains", []) if isinstance(recon, dict) else []
    open_ports = recon.get("openPorts", []) if isinstance(recon, dict) else []
    endpoint_count = surface.get("endpointCount", 0) if isinstance(surface, dict) else 0

    print("[SUMMARY]")
    print(f"  Resolved IPs: {len(resolved_ips)}")
    print(f"  Subdomains: {len(subdomains)}")
    print(f"  Open ports: {len(open_ports)}")
    print(f"  Endpoints: {endpoint_count}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
