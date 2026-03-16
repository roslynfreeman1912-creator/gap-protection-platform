"""
Bulk importer: parse all YAML vuln files → JSON for Supabase vulnerability_templates table.
Supports 4 YAML formats (flat, CVE, target-specific, consolidated).
Deduplicates by (type + payload hash).

Usage:
  python import_vuln_templates.py
  → produces vulnerability_templates_import.json
"""

import os
import json
import hashlib
import yaml
from pathlib import Path

VULN_DIR = Path(__file__).parent.parent.parent / "vuln"
OUTPUT_FILE = Path(__file__).parent / "vulnerability_templates_import.json"

SEVERITY_MAP = {
    "critical": "critical", "high": "high", "medium": "medium",
    "low": "low", "info": "info", "informational": "info",
    "CRITICAL": "critical", "HIGH": "high", "MEDIUM": "medium",
    "LOW": "low", "INFO": "info",
}

def normalize_severity(s: str) -> str:
    return SEVERITY_MAP.get(s, "medium")

def payload_hash(ptype: str, payloads: list) -> str:
    key = f"{ptype}:{'|'.join(sorted(str(p) for p in payloads))}"
    return hashlib.sha256(key.encode()).hexdigest()

def parse_flat(data: dict, source_file: str) -> list:
    """Format A: flat YAML with name/type/severity/payloads"""
    if not isinstance(data, dict) or "payloads" not in data:
        return []
    payloads = data.get("payloads", [])
    if not payloads:
        return []
    return [{
        "name": data.get("name", source_file),
        "type": data.get("type", "unknown"),
        "severity": normalize_severity(str(data.get("severity", "medium"))),
        "cve_id": data.get("cve"),
        "description": data.get("description"),
        "payloads": [str(p) for p in payloads],
        "paths": data.get("paths", []),
        "methods": data.get("methods", ["GET", "POST"]),
        "headers": data.get("headers", {}),
        "matchers": data.get("matcher", data.get("matchers", [])),
        "target": data.get("target"),
        "source_file": source_file,
        "is_active": True,
    }]

def parse_consolidated(data: dict, source_file: str) -> list:
    """Format D: consolidated with vulnerabilities array"""
    results = []
    vulns = data.get("vulnerabilities", [])
    for v in vulns:
        if not isinstance(v, dict):
            continue
        payloads = v.get("payloads", [])
        if not payloads:
            continue
        results.append({
            "name": v.get("name", v.get("id", source_file)),
            "type": v.get("type", "unknown"),
            "severity": normalize_severity(str(v.get("severity", "medium"))),
            "cve_id": v.get("cve_id") or v.get("cve"),
            "description": v.get("description"),
            "payloads": [str(p) for p in payloads],
            "paths": v.get("paths", []),
            "methods": v.get("methods", ["GET", "POST"]),
            "headers": v.get("headers", {}),
            "matchers": v.get("matcher", v.get("matchers", [])),
            "target": v.get("target"),
            "source_file": source_file,
            "is_active": True,
        })
    return results

def process_file(filepath: Path) -> list:
    source_file = filepath.name
    try:
        with open(filepath, "r", encoding="utf-8", errors="replace") as f:
            data = yaml.safe_load(f)
    except Exception:
        return []

    if not isinstance(data, dict):
        return []

    # Format D: consolidated
    if "vulnerabilities" in data and isinstance(data["vulnerabilities"], list):
        return parse_consolidated(data, source_file)

    # Format A/B/C: flat
    return parse_flat(data, source_file)

def main():
    if not VULN_DIR.exists():
        print(f"Vuln directory not found: {VULN_DIR}")
        return

    all_templates = []
    seen_hashes = set()
    file_count = 0
    dup_count = 0

    for root, dirs, files in os.walk(VULN_DIR):
        # Skip nested vuln/vuln duplicate directory
        if "vuln" in dirs and Path(root) == VULN_DIR:
            dirs.remove("vuln")

        for fname in files:
            if not fname.endswith((".yaml", ".yml")):
                continue
            filepath = Path(root) / fname
            templates = process_file(filepath)
            file_count += 1

            for t in templates:
                h = payload_hash(t["type"], t["payloads"])
                if h in seen_hashes:
                    dup_count += 1
                    continue
                seen_hashes.add(h)
                all_templates.append(t)

    # Clean None values for JSON
    for t in all_templates:
        for k, v in list(t.items()):
            if v is None:
                t[k] = None

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(all_templates, f, indent=2, ensure_ascii=False)

    print(f"Processed {file_count} YAML files")
    print(f"Deduplicated {dup_count} duplicates")
    print(f"Exported {len(all_templates)} unique templates → {OUTPUT_FILE}")
    print(f"\nBreakdown by type:")
    type_counts = {}
    for t in all_templates:
        type_counts[t["type"]] = type_counts.get(t["type"], 0) + 1
    for tp, cnt in sorted(type_counts.items(), key=lambda x: -x[1]):
        print(f"  {tp}: {cnt}")

if __name__ == "__main__":
    main()
