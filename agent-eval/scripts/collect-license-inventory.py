#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PACKAGE_JSON = ROOT / "package.json"


def main() -> int:
    pkg = json.loads(PACKAGE_JSON.read_text(encoding="utf-8"))
    payload = {
        "name": pkg.get("name"),
        "version": pkg.get("version"),
        "license": pkg.get("license"),
        "dependencies": sorted((pkg.get("dependencies") or {}).keys()),
        "devDependencies": sorted((pkg.get("devDependencies") or {}).keys()),
    }
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
