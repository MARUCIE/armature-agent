#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import time
from datetime import UTC, datetime
from hashlib import sha256
from pathlib import Path
from typing import Any

VAR_PATTERN = re.compile(r"\$(?:\{(?P<braced>[A-Za-z_][A-Za-z0-9_]*)\}|(?P<plain>[A-Za-z_][A-Za-z0-9_]*))")


def now_utc_compact() -> str:
    return datetime.now(UTC).strftime("%Y%m%d-%H%M%S-%f")


def rel_to_project(project_dir: Path, path: Path) -> str:
    try:
        return str(path.relative_to(project_dir))
    except ValueError:
        return str(path)


def sha256_path(path: Path) -> str | None:
    if not path.exists() or not path.is_file():
        return None
    digest = sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(8192), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def process_is_running(pid: int) -> bool:
    if pid <= 0:
        return False
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    return True


def acquire_gate_lock(lock_path: Path, run_id: str, manifest_id: str) -> None:
    payload = json.dumps(
        {
            "pid": os.getpid(),
            "run_id": run_id,
            "manifest": manifest_id,
            "started_at": datetime.now(UTC).isoformat(),
        },
        ensure_ascii=False,
        indent=2,
    )

    while True:
        try:
            fd = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        except FileExistsError:
            try:
                existing = load_json(lock_path)
            except Exception:
                existing = {}
            existing_pid = int(existing.get("pid") or 0)
            if existing_pid and process_is_running(existing_pid):
                raise RuntimeError(
                    f"another gate run is active (pid={existing_pid}, manifest={existing.get('manifest')}, run_id={existing.get('run_id')})"
                )
            lock_path.unlink(missing_ok=True)
            continue

        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(payload)
        return


def release_gate_lock(lock_path: Path) -> None:
    try:
        existing = load_json(lock_path)
    except Exception:
        existing = {}
    if int(existing.get("pid") or 0) == os.getpid():
        lock_path.unlink(missing_ok=True)


def expand_vars(value: str, env: dict[str, str]) -> str:
    def replace(match: re.Match[str]) -> str:
        name = match.group("braced") or match.group("plain") or ""
        return env.get(name, match.group(0))

    return VAR_PATTERN.sub(replace, value)


def resolve_path(project_dir: Path, raw_value: str, env: dict[str, str]) -> Path:
    expanded = expand_vars(raw_value, env)
    path = Path(expanded)
    return path if path.is_absolute() else (project_dir / path).resolve()


def load_graders(graders_dir: Path) -> dict[str, dict[str, Any]]:
    graders: dict[str, dict[str, Any]] = {}
    for path in sorted(graders_dir.glob("*.json")):
        data = load_json(path)
        items = data if isinstance(data, list) else [data]
        for idx, grader in enumerate(items):
            if not isinstance(grader, dict):
                continue
            grader_id = str(grader.get("id") or (f"{path.stem}-{idx + 1:03d}" if isinstance(data, list) else path.stem))
            graders[grader_id] = grader
    return graders


def load_tasks(tasks_dir: Path) -> dict[str, dict[str, Any]]:
    tasks: dict[str, dict[str, Any]] = {}
    for path in sorted(tasks_dir.glob("*.json")):
        data = load_json(path)
        items = data if isinstance(data, list) else [data]
        for idx, task in enumerate(items):
            if not isinstance(task, dict):
                continue
            task_id = str(task.get("id") or (f"{path.stem}-{idx + 1:03d}" if isinstance(data, list) else path.stem))
            task["id"] = task_id
            tasks[task_id] = task
    return tasks


def load_manifest(manifests_dir: Path, manifest_ref: str) -> tuple[Path, dict[str, Any]]:
    manifest_path = Path(manifest_ref)
    if not manifest_path.is_absolute() and manifest_path.suffix != ".json":
        manifest_path = manifests_dir / f"{manifest_ref}.json"
    elif not manifest_path.is_absolute():
        manifest_path = manifests_dir / manifest_path.name

    manifest_path = manifest_path.resolve()
    manifest = load_json(manifest_path)
    if not isinstance(manifest, dict):
        raise ValueError(f"manifest must be a JSON object: {manifest_path}")
    return manifest_path, manifest


def resolve_manifest_tasks(manifest: dict[str, Any], task_map: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    selected: list[dict[str, Any]] = []
    for entry in manifest.get("tasks", []) or []:
        if isinstance(entry, str):
            task_id = entry
        elif isinstance(entry, dict):
            task_id = str(entry.get("task") or "")
        else:
            task_id = ""

        if not task_id:
            raise ValueError(f"invalid manifest task entry: {entry!r}")
        task = task_map.get(task_id)
        if task is None:
            raise KeyError(f"manifest references unknown task: {task_id}")
        selected.append(task)
    return selected


def build_outcome(project_dir: Path, task: dict[str, Any], exit_code: int, duration: float, env: dict[str, str]) -> dict[str, Any]:
    files = []
    for raw_path in task.get("artifacts", []) or []:
        path = resolve_path(project_dir, str(raw_path), env)
        files.append(
            {
                "path": rel_to_project(project_dir, path),
                "exists": path.exists(),
                "sha256": sha256_path(path),
                "size": path.stat().st_size if path.exists() and path.is_file() else None,
            }
        )
    return {
        "exit_code": exit_code,
        "duration_sec": round(duration, 2),
        "files": files,
    }


def grade_task(
    project_dir: Path,
    task: dict[str, Any],
    graders: dict[str, dict[str, Any]],
    stdout: str,
    stderr: str,
    transcript_lines: list[dict[str, Any]],
    outcome: dict[str, Any],
    env: dict[str, str],
) -> dict[str, Any]:
    transcript_text = "\n".join(str(line.get("content", "")) for line in transcript_lines)
    grade_items: list[dict[str, Any]] = []
    pending = False
    ok = True

    for grader_id in task.get("graders", []) or []:
        grader = graders.get(str(grader_id))
        if not grader:
            grade_items.append({"id": grader_id, "type": "missing", "status": "error", "detail": "grader not found"})
            ok = False
            continue

        grader_type = str(grader.get("type") or "unknown")
        status = "fail"
        detail = "unknown"

        if grader_type == "exit_code":
            expected = int(grader.get("expected", 0))
            status = "pass" if outcome["exit_code"] == expected else "fail"
            detail = f"expected={expected} got={outcome['exit_code']}"
        elif grader_type == "file_exists":
            missing = []
            for raw_path in grader.get("paths", []) or []:
                path = resolve_path(project_dir, str(raw_path), env)
                if not path.exists():
                    missing.append(rel_to_project(project_dir, path))
            status = "pass" if not missing else "fail"
            detail = "ok" if not missing else f"missing={missing}"
        elif grader_type == "regex":
            pattern = str(grader.get("pattern") or "")
            source = str(grader.get("source") or "stdout")
            haystack = stdout if source == "stdout" else stderr if source == "stderr" else transcript_text
            matched = bool(re.search(pattern, haystack))
            status = "pass" if matched else "fail"
            detail = f"pattern={pattern} source={source}"
        elif grader_type == "manual":
            status = "pending"
            detail = str(grader.get("note") or "manual review required")
        else:
            status = "fail"
            detail = f"unsupported grader type={grader_type}"

        if status == "pending":
            pending = True
        if status != "pass":
            ok = False
        grade_items.append({"id": grader_id, "type": grader_type, "status": status, "detail": detail})

    return {"ok": ok and not pending, "pending": pending, "grades": grade_items}


def write_summary_markdown(summary_path: Path, summary: dict[str, Any]) -> None:
    lines = [
        f"# Agent Eval Summary — {summary['manifest_id']}",
        "",
        f"- Run ID: `{summary['run_id']}`",
        f"- Manifest: `{summary['manifest_path']}`",
        f"- Passed: `{summary['passed']}` / `{summary['total']}`",
        f"- Failed: `{summary['failed']}`",
        f"- Pending: `{summary['pending']}`",
        "",
        "| Task | Status | Duration (s) | Transcript |",
        "| --- | --- | ---: | --- |",
    ]

    for result in summary.get("results", []):
        status = "pass" if result["ok"] else "pending" if result["pending"] else "fail"
        lines.append(
            f"| `{result['task_id']}` | `{status}` | `{result['duration_sec']}` | `{result['transcript']}` |"
        )

    summary_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def summarize(results: list[dict[str, Any]], run_id: str, manifest_path: Path, manifest: dict[str, Any], project_dir: Path) -> dict[str, Any]:
    total = len(results)
    passed = sum(1 for result in results if result["ok"])
    pending = sum(1 for result in results if result["pending"])
    failed = total - passed - pending
    return {
        "ok": failed == 0 and pending == 0,
        "run_id": run_id,
        "project_dir": ".",
        "module_dir": "agent-eval",
        "manifest_id": str(manifest.get("id") or manifest_path.stem),
        "manifest_title": manifest.get("title"),
        "manifest_description": manifest.get("description"),
        "manifest_path": rel_to_project(project_dir, manifest_path),
        "total": total,
        "passed": passed,
        "failed": failed,
        "pending": pending,
        "results": results,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Run an Orca CLI agent-eval manifest.")
    parser.add_argument("--project-dir", default=str(Path(__file__).resolve().parents[2]), help="Project root")
    parser.add_argument("--manifest", default="fast", help="Manifest name (fast/nightly/release) or path")
    parser.add_argument("--run-id", default=now_utc_compact(), help="Override run id")
    args = parser.parse_args()

    project_dir = Path(args.project_dir).resolve()
    module_dir = project_dir / "agent-eval"
    tasks_dir = module_dir / "tasks"
    graders_dir = module_dir / "graders"
    manifests_dir = module_dir / "manifests"
    runs_dir = module_dir / "runs"

    manifest_path, manifest = load_manifest(manifests_dir, str(args.manifest))
    task_map = load_tasks(tasks_dir)
    selected_tasks = resolve_manifest_tasks(manifest, task_map)
    graders = load_graders(graders_dir)
    manifest_id = str(manifest.get("id") or manifest_path.stem)

    run_id = args.run_id
    lock_path = module_dir / ".gate.lock"
    acquire_gate_lock(lock_path, run_id, manifest_id)
    run_dir = runs_dir / run_id
    transcripts_dir = run_dir / "transcripts"
    outcomes_dir = run_dir / "outcomes"
    grades_dir = run_dir / "grades"
    artifacts_dir = run_dir / "artifacts"
    manual_dir = run_dir / "manual"
    for directory in (run_dir, transcripts_dir, outcomes_dir, grades_dir, artifacts_dir, manual_dir):
        directory.mkdir(parents=True, exist_ok=True)

    try:
        results: list[dict[str, Any]] = []

        for task in selected_tasks:
            task_id = str(task.get("id") or "task")
            command = str(task.get("command") or "")
            input_text = str(task.get("input") or "")
            start = time.time()

            task_env = {
                **dict(os.environ),
                "PROJECT_DIR": str(project_dir),
                "ORCA_EVAL_PROJECT_DIR": str(project_dir),
                "ORCA_EVAL_RUN_ID": run_id,
                "ORCA_EVAL_RUN_DIR": str(run_dir),
                "ORCA_EVAL_TASK_ID": task_id,
            }

            proc = subprocess.run(
                command,
                cwd=str(project_dir),
                shell=True,
                capture_output=True,
                text=True,
                env=task_env,
            )
            duration = time.time() - start
            stdout = proc.stdout or ""
            stderr = proc.stderr or ""

            transcript_path = transcripts_dir / f"{task_id}.jsonl"
            transcript_lines = [
                {"role": "user", "content": input_text},
                {"role": "tool", "content": command},
                {"role": "tool_output", "content": stdout},
                {"role": "tool_error", "content": stderr},
                {"role": "system", "content": f"exit_code={proc.returncode} duration={duration:.2f}s"},
            ]
            transcript_path.write_text(
                "\n".join(json.dumps(line, ensure_ascii=False) for line in transcript_lines),
                encoding="utf-8",
            )

            outcome = build_outcome(project_dir, task, proc.returncode, duration, task_env)
            outcome_path = outcomes_dir / f"{task_id}.json"
            outcome_path.write_text(json.dumps(outcome, ensure_ascii=False, indent=2), encoding="utf-8")

            grades = grade_task(project_dir, task, graders, stdout, stderr, transcript_lines, outcome, task_env)
            grades_path = grades_dir / f"{task_id}.json"
            grades_path.write_text(json.dumps(grades, ensure_ascii=False, indent=2), encoding="utf-8")

            results.append(
                {
                    "task_id": task_id,
                    "command": command,
                    "exit_code": proc.returncode,
                    "duration_sec": round(duration, 2),
                    "transcript": rel_to_project(project_dir, transcript_path),
                    "outcome": rel_to_project(project_dir, outcome_path),
                    "grades": rel_to_project(project_dir, grades_path),
                    "ok": grades["ok"],
                    "pending": grades["pending"],
                }
            )

        summary = summarize(results, run_id, manifest_path, manifest, project_dir)
        summary_path = run_dir / "summary.json"
        summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

        summary_md_path = run_dir / "summary.md"
        write_summary_markdown(summary_md_path, summary)

        print(
            json.dumps(
                {
                    "ok": summary["ok"],
                    "run_id": run_id,
                    "manifest": summary["manifest_id"],
                    "summary": rel_to_project(project_dir, summary_path),
                    "summary_md": rel_to_project(project_dir, summary_md_path),
                    "passed": summary["passed"],
                    "failed": summary["failed"],
                    "pending": summary["pending"],
                },
                ensure_ascii=False,
            )
        )
        return 0 if summary["ok"] else 1
    finally:
        release_gate_lock(lock_path)


if __name__ == "__main__":
    raise SystemExit(main())
