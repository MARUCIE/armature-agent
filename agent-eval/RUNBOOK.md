# Armature CLI Agent Eval Runbook

本手册说明如何运行 Armature CLI 的 `fast` / `nightly` / `release` gate，并查看 transcript / outcome / grades。

## 1) 预备条件

```bash
cd <repo-root>
npm test
```

说明：

- gate 任务会尽量复用已构建的 `dist/`，缺失时会自建
- 目前任务以本地、无外部网络依赖的 black-box smoke 为主
- repo-local runner: `python3 agent-eval/scripts/run-gate.py --manifest <fast|nightly|release>`
- Optional dependency: AI-tools `ai` CLI if you want to use `ai agent-eval "$(pwd)" run`

## 2) 查看任务、评分器与 manifests

- `tasks/*.json`: 当前 gate task 定义
- `graders/*.json`: 可复用 grader 集
- `manifests/*.json`: gate bundle 定义

## 3) 运行评估

```bash
python3 agent-eval/scripts/run-gate.py --manifest fast
python3 agent-eval/scripts/run-gate.py --manifest nightly
python3 agent-eval/scripts/run-gate.py --manifest release
```

## 4) 查看结果

- Transcript: `agent-eval/runs/<run_id>/transcripts/*.jsonl`
- Outcome: `agent-eval/runs/<run_id>/outcomes/*.json`
- Grades: `agent-eval/runs/<run_id>/grades/*.json`
- Summary: `agent-eval/runs/<run_id>/summary.json`
- Human-readable summary: `agent-eval/runs/<run_id>/summary.md`
- Release journey artifact: `agent-eval/runs/<run_id>/manual/release-cli-journey.md`

## 5) 当前 gate 关注点

1. `fast`
   - 根命令 help 与 root `--continue` 恢复路径是否仍正常
   - `pr` 的 `gh` fetch failure / checkout failure 是否仍显式报错
   - `session` 的 help / list / show / delete 是否仍能正确处理有效与损坏 session
   - `providers test local` 是否仍把可达的 `401` `/models` 端点视为 reachable
   - `providers test local` 在 transport failure 时是否仍输出明确 FAIL
   - `doctor --json` 是否仍能返回结构化诊断
   - `serve` 是否能在本地起服并返回 `/health` / `/doctor` / `/providers`
   - `serve /chat` 的 missing-prompt / malformed-body 错误路径是否仍显式
   - `npm pack --json --dry-run` 是否仍包含发布所需的 dist entrypoints
2. `nightly`
   - fast pack 全量执行
   - `lint` / `test` / `build` 先通过
3. `release`
   - nightly 内容全部执行
   - `armature bench --json` 必须 100%
   - tarball 安装到干净 prefix 后，`armature --help` 仍能正常工作
   - 必须生成 CLI journey artifact

## 6) 人工评分（可选）

人工评分器不会自动通过，请在 grades 中补充：

- Reviewer
- Decision
- Evidence Path

---

Maurice | maurice_wen@proton.me
