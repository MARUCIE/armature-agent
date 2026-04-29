#!/usr/bin/env python3
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EXCLUDED_PARTS = {"node_modules", "dist", ".git", ".omx", "outputs", "runs"}

PATTERNS = [
    r"AKIA[0-9A-Z]{16}",
    r"-----BEGIN (RSA|EC|OPENSSH) PRIVATE KEY-----",
    r"sk-[A-Za-z0-9]{20,}",
    r"gh[pousr]_[A-Za-z0-9]{20,}",
]
COMPILED = re.compile("|".join(PATTERNS))


def should_scan(path: Path) -> bool:
    return not any(part in EXCLUDED_PARTS for part in path.parts)


def is_within_root(path: Path, root: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False


def main() -> int:
    import argparse

    parser = argparse.ArgumentParser(description="Heuristic secret scan for Orca CLI.")
    parser.add_argument("--root", default=str(ROOT), help="Directory to scan (defaults to repo root)")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    findings: list[dict[str, object]] = []
    for path in root.rglob("*"):
      if path.is_symlink():
        continue
      if not path.is_file() or not should_scan(path):
        continue
      if not is_within_root(path, root):
        continue
      try:
        text = path.read_text(encoding="utf-8")
      except Exception:
        continue
      for lineno, line in enumerate(text.splitlines(), start=1):
        if COMPILED.search(line):
          findings.append({
            "path": str(path.relative_to(root)),
            "line": lineno,
            "match": line[:200],
          })

    if findings:
      for finding in findings:
        print(f"{finding['path']}:{finding['line']}:{finding['match']}")
      return 1

    print("secret-scan: no findings")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
