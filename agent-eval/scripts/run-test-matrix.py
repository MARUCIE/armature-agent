#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import shlex
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

PROJECT_DIR = Path(__file__).resolve().parents[2]
OUTPUT_ROOT = PROJECT_DIR / "outputs" / "test-matrix"
DEFAULT_MANIFEST = PROJECT_DIR / "agent-eval" / "manifests" / "test-matrix.json"
SAFE_RUN_ID = re.compile(r"^[A-Za-z0-9_-]+$")
SAFE_LAYER_ID = re.compile(r"^[A-Za-z0-9_-]+$")


def now_run_id() -> str:
    return "run-" + datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")


def sanitize_run_id(run_id: str) -> str:
    if not SAFE_RUN_ID.fullmatch(run_id):
        raise ValueError("run-id may contain only letters, numbers, underscore, and hyphen")
    return run_id


def sanitize_layer_id(layer_id: str) -> str:
    if not SAFE_LAYER_ID.fullmatch(layer_id):
        raise ValueError("layer id may contain only letters, numbers, underscore, and hyphen")
    return layer_id


def resolve_manifest_path(path: Path) -> Path:
    resolved = path.resolve()
    manifests_root = (PROJECT_DIR / "agent-eval" / "manifests").resolve()
    try:
        resolved.relative_to(manifests_root)
    except ValueError as error:
        raise ValueError("manifest must be inside agent-eval/manifests") from error
    return resolved


def load_manifest(path: Path) -> dict[str, Any]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("test-matrix manifest must be a JSON object")
    return data


def validate_step(step: Any) -> dict[str, Any]:
    if not isinstance(step, dict):
        raise ValueError("step must be an object")
    argv = step.get("argv")
    if not isinstance(argv, list) or not argv or not all(isinstance(part, str) and part for part in argv):
        raise ValueError("step argv must be a non-empty string array")
    env = step.get("env")
    if env is not None and not isinstance(env, dict):
        raise ValueError("step env must be an object when provided")
    if env is not None and not all(isinstance(key, str) and isinstance(value, str) for key, value in env.items()):
        raise ValueError("step env entries must be string-to-string pairs")
    return {
        "argv": argv,
        "env": env or {},
    }


def render_argv(argv: list[str]) -> str:
    return shlex.join(argv)


def run_layer(run_dir: Path, layer: dict[str, Any]) -> dict[str, object]:
    safe_layer_id = sanitize_layer_id(str(layer["id"]))
    log_path = run_dir / f"{safe_layer_id}.log"
    exit_path = run_dir / f"{safe_layer_id}.exit"
    steps = layer.get("steps")
    if not isinstance(steps, list) or not steps:
        raise ValueError("layer steps must be a non-empty array")

    output_parts: list[str] = []
    exit_code = 0
    for raw_step in steps:
        step = validate_step(raw_step)
        proc = subprocess.run(
            step["argv"],
            cwd=str(PROJECT_DIR),
            env={**dict(os.environ), **step["env"]},
            text=True,
            capture_output=True,
        )
        output_parts.append(f"> {render_argv(step['argv'])}\n")
        if proc.stdout:
            output_parts.append(proc.stdout)
        if proc.stderr:
            output_parts.append(("\n" if output_parts and not output_parts[-1].endswith("\n") else "") + proc.stderr)
        if proc.returncode != 0:
            exit_code = proc.returncode
            break

    output = "".join(output_parts)
    log_path.write_text(output, encoding="utf-8")
    exit_path.write_text(str(exit_code), encoding="utf-8")
    status = layer["status_if_ok"] if exit_code == 0 else "fail"
    return {
        "id": safe_layer_id,
        "label": layer["label"],
        "command": " && ".join(render_argv(step["argv"]) for step in map(validate_step, steps)),
        "threshold": layer["threshold"],
        "evidence": [str(log_path.relative_to(PROJECT_DIR))],
        "status": status,
        "owner": layer["owner"],
        "exit_code": exit_code,
    }


def write_matrix(run_dir: Path, rows: list[dict[str, object]], gaps: list[str]) -> Path:
    matrix_path = run_dir / "matrix.md"
    lines = [
        "# Armature CLI Layered Test Matrix",
        "",
        f"Run id: `{run_dir.name}`",
        "",
        "| Test Type | Command | Threshold | Evidence Path | Status | Owner |",
        "| --- | --- | --- | --- | --- | --- |",
    ]
    for row in rows:
        evidence = "<br>".join(f"`{path}`" for path in row["evidence"])
        lines.append(
            f"| {row['label']} | `{row['command']}` | {row['threshold']} | {evidence} | `{row['status']}` | `{row['owner']}` |"
        )
    lines.extend(["", "## Remaining Gaps", ""])
    lines.extend(f"- {gap}" for gap in gaps)
    matrix_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return matrix_path


def main() -> int:
    parser = argparse.ArgumentParser(description="Run Armature's layered test matrix and persist evidence.")
    parser.add_argument("--run-id", default=now_run_id())
    parser.add_argument("--layers", help="Comma-separated layer ids to run (default: all layers)")
    parser.add_argument("--manifest", default=str(DEFAULT_MANIFEST), help="Path to the test-matrix manifest")
    args = parser.parse_args()

    try:
        run_id = sanitize_run_id(args.run_id)
    except ValueError as error:
        print(str(error))
        return 1

    try:
        manifest_path = resolve_manifest_path(Path(args.manifest))
    except ValueError as error:
        print(str(error))
        return 1
    manifest = load_manifest(manifest_path)

    layer_config = manifest.get("layers")
    if not isinstance(layer_config, list):
        print("test-matrix manifest missing layers array")
        return 1
    gaps = manifest.get("gaps")
    if not isinstance(gaps, list):
        gaps = []

    run_dir = OUTPUT_ROOT / run_id
    run_dir.mkdir(parents=True, exist_ok=True)

    selected_ids = set(args.layers.split(",")) if args.layers else None
    selected_layers = [
        layer for layer in layer_config
        if selected_ids is None or layer["id"] in selected_ids
    ]
    if selected_ids is not None and not selected_layers:
        print("no matching test-matrix layers selected")
        return 1
    rows = [run_layer(run_dir, layer) for layer in selected_layers]
    matrix_path = write_matrix(run_dir, rows, [str(gap) for gap in gaps])

    summary = {
        "run_id": run_id,
        "project_dir": str(PROJECT_DIR),
        "manifest": str(manifest_path.relative_to(PROJECT_DIR)),
        "matrix": str(matrix_path.relative_to(PROJECT_DIR)),
        "rows": rows,
    }
    (run_dir / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False))
    return 0 if all(row["exit_code"] == 0 for row in rows) else 1


if __name__ == "__main__":
    raise SystemExit(main())
