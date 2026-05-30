# Armature CLI Agent Eval

本目录用于落盘 Armature CLI 的 black-box 评估资产（任务 + 评分器 + manifest + 过程记录 + 结果状态）。

## 当前状态

- 根计划：`<repo-root>/AGENT_EVAL_PLAN.md`
- 统一执行器：`agent-eval/scripts/run-gate.py`
- Gate manifests：
  - `agent-eval/manifests/fast.json`
  - `agent-eval/manifests/nightly.json`
  - `agent-eval/manifests/release.json`
- 当前 fast-gate 已扩到 `61` 个任务，最新 run：`20260417-012401-427935`（`61/61` passed）
- 当前 black-box 覆盖：
  - root help surface
  - root `--continue` resume smoke
  - `run --help`
  - `session --help`
  - `session list`
  - `session show`
  - `session delete`
  - `pr --help`
  - `pr` fetch-failure path
  - `pr` checkout-failure path
  - `providers --help`
  - `providers test local`
  - `providers test local` transport failure
  - `providers test local` timeout failure
  - `doctor --json`
  - `serve /health`
  - `serve /doctor` + `/providers`
  - `serve /chat` missing-prompt + malformed-body errors
  - `npm pack --json --dry-run`
- release gate 额外包含：
  - `npm run lint`
  - `npm test`
  - `npm run build`
  - `armature bench --json`
  - install-from-tarball smoke
  - recorded CLI journey artifact

## 快速开始

```bash
cd <repo-root>
python3 agent-eval/scripts/run-gate.py --manifest fast
```

或使用 npm scripts：

```bash
npm run eval:fast
npm run eval:nightly
npm run eval:release
```

## 目录结构

- `AGENT_EVAL_PLAN.md`: 评估计划与 gate 目标
- `tasks/*.json`: Armature-specific task definitions
- `graders/*.json`: reusable grader rules
- `manifests/*.json`: gate bundle definitions
- `runs/<run_id>/`: 每次评估的 transcript / outcome / grades / summary

## 关键原则

- Transcript 必须可审计、可复现
- Outcome 必须来自环境真实状态
- Grader 必须清晰可执行
- `agent-eval` 用来补齐 black-box CLI / operator / release 信号，不重复低层 Vitest 断言
- release 证据必须能在 `runs/<run_id>/` 中回放，而不是停留在终端滚动缓冲区里

---

Maurice | maurice_wen@proton.me
