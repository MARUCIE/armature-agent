#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from collections import OrderedDict
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
PACKAGE_JSON = ROOT / "package.json"
MANIFEST = ROOT / "agent-eval" / "manifests" / "test-matrix.json"
GENERATED_DIR = ROOT / "agent-eval" / "generated"
SNIPPET_MD = GENERATED_DIR / "test-matrix-entrypoints.md"
MATRIX_RUNNER = "python3 agent-eval/scripts/run-test-matrix.py"


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def load_layers() -> list[dict[str, Any]]:
    manifest = load_json(MANIFEST)
    layers = manifest.get("layers")
    if not isinstance(layers, list):
        raise ValueError("test-matrix manifest must contain a layers array")
    return layers


def build_expected_scripts(layers: list[dict[str, Any]]) -> OrderedDict[str, str]:
    expected: OrderedDict[str, str] = OrderedDict()
    for layer in layers:
        script_name = str(layer["script"])
        expected[script_name] = f"{MATRIX_RUNNER} --layers {layer['id']}"
    expected["test:matrix"] = MATRIX_RUNNER
    return expected


def render_snippet(layers: list[dict[str, Any]]) -> str:
    lines = [
        "# Test Matrix Entrypoints",
        "",
        "Generated from `agent-eval/manifests/test-matrix.json`.",
        "",
        "```bash",
    ]
    for layer in layers:
        lines.append(f"npm run {layer['script']}")
    lines.append("npm run test:matrix")
    lines.append("npm run test:matrix:sync")
    lines.extend([
        "```",
        "",
        "| Script | Layer | Threshold | Owner |",
        "| --- | --- | --- | --- |",
    ])
    for layer in layers:
        lines.append(f"| `{layer['script']}` | {layer['label']} | {layer['threshold']} | {layer['owner']} |")
    lines.append("| `test:matrix` | All configured layers | See manifest | Maintainer / release gate |")
    lines.append("| `test:matrix:sync` | Sync check | package/scripts/snippet must match manifest | Maintainer / release gate |")
    lines.append("")
    return "\n".join(lines)


def sync_package_scripts(expected: OrderedDict[str, str], check: bool) -> bool:
    package = load_json(PACKAGE_JSON)
    scripts = OrderedDict(package.get("scripts") or {})
    changed = False

    for name, command in expected.items():
        if scripts.get(name) != command:
            scripts[name] = command
            changed = True

    package["scripts"] = scripts
    rendered = json.dumps(package, ensure_ascii=False, indent=2) + "\n"
    current = PACKAGE_JSON.read_text(encoding="utf-8")

    if check:
      return current == rendered

    if current != rendered:
        PACKAGE_JSON.write_text(rendered, encoding="utf-8")
        changed = True
    return not changed or current == rendered


def sync_snippet(snippet: str, check: bool) -> bool:
    GENERATED_DIR.mkdir(parents=True, exist_ok=True)
    current = SNIPPET_MD.read_text(encoding="utf-8") if SNIPPET_MD.exists() else ""
    if check:
        return current == snippet
    if current != snippet:
        SNIPPET_MD.write_text(snippet, encoding="utf-8")
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync test-matrix manifest into package scripts and generated snippets.")
    parser.add_argument("--check", action="store_true", help="Exit non-zero if generated assets are out of sync")
    args = parser.parse_args()

    layers = load_layers()
    expected_scripts = build_expected_scripts(layers)
    snippet = render_snippet(layers)

    scripts_ok = sync_package_scripts(expected_scripts, args.check)
    snippet_ok = sync_snippet(snippet, args.check)

    if args.check:
        if scripts_ok and snippet_ok:
            print("test-matrix sync: ok")
            return 0
        print("test-matrix sync: out of sync")
        return 1

    print("test-matrix sync: updated")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
