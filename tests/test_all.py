#!/usr/bin/env python3
"""Project test bridge for AI-Fleet `ai check`.

`ai check` invokes `tests/test_all.py` for project-mode repositories. Armature is a
Node/TypeScript project, so this wrapper maps that contract to the real npm
verification commands instead of maintaining a parallel Python test suite.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def run(command: list[str]) -> None:
    print(f"$ {' '.join(command)}", flush=True)
    subprocess.run(command, cwd=ROOT, check=True)


def main() -> int:
    commands = [
        ["npm", "run", "build"],
        ["npm", "run", "lint"],
        ["npm", "test"],
    ]

    override = os.environ.get("ARMATURE_AI_CHECK_TEST_COMMAND")
    if override:
        commands = [["bash", "-lc", override]]

    try:
        for command in commands:
            run(command)
    except subprocess.CalledProcessError as exc:
        return int(exc.returncode or 1)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
