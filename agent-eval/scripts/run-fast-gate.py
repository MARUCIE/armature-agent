#!/usr/bin/env python3
from __future__ import annotations

import subprocess
import sys
from pathlib import Path


def main() -> int:
    script = Path(__file__).with_name('run-gate.py')
    proc = subprocess.run([sys.executable, str(script), '--manifest', 'fast', *sys.argv[1:]])
    return proc.returncode


if __name__ == '__main__':
    raise SystemExit(main())
