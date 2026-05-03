# Agent Evaluation Plan

> Orca CLI 大规模测试扩容的统一评估计划：先锁定真实基线，再用 task / grader / run 资产补齐 Vitest 之外的端到端质量信号。

## Meta

- Owner: Maurice
- LastUpdated: 2026-04-22 (continuity slice)
- Product: Orca CLI (`orca-cli`)
- Version: `0.8.0`
- GitBaseline: `4e642c1`
- DeterministicBaseline: `npm test` => `1558/1558`
- ModuleDir: `agent-eval`
- PlanningMode: `run-first-continuity-slice`; `agent-eval/` now has fresh fast / nightly / release evidence after the 2026-04-22 WorkSession / TaskRun slice

## Evaluation Target

- Agent / Tool: Orca CLI terminal agent runtime (`src/bin/orca.ts`, `src/program.ts`)
- Primary Surface: command-first CLI (`chat`, `run`, `council`, `race`, `pipeline`, `doctor`, `providers`, `stats`, `session`, `pr`, `serve`, `init`)
- Target Environment:
  - macOS / Darwin developer host
  - Node LTS available for release validation
  - terminal-first workflows, not browser-first flows

## Program Goal

1. Keep the verified baseline anchored at `1558/1558` while shifting future growth from ad hoc test-file expansion to an owned matrix plan.
2. Expand the deterministic regression suite in tiers: fast gate `550-650` selected cases, nightly `~1700` total cases, release `~2210` total cases.
3. Add a task-based evaluation layer that measures real agent delivery quality, not only isolated helper correctness: the current system now executes `63` fast-gate tasks, `66` nightly tasks, and `69` release tasks with fresh 2026-04-22 evidence, while continued expansion still targets the longer-term `36` / `72` task-family matrix.
4. Make public CLI contracts first-class so test count growth does not hide gaps in shipped operator surfaces.

## Current Coverage Snapshot

| Area | Current Approximation | Observation |
| --- | --- | --- |
| Agent / runtime / planner / safety | `~568` cases / `25` files | Strongest area today |
| Chat / REPL / ink UI | `~325` cases / `17` files | Good coverage depth |
| Provider / tools / hooks / config | `~230` cases / `12` files | Healthy but OpenAI-weighted |
| Integration / large-repo / headless / IDE | `~75` cases / `5` files | Too thin for a SOTA release gate |
| Public command contracts | `~46` direct command-oriented cases | Improved, but still thinner than runtime and UI coverage |

## Priority Gaps

### Public command-surface gaps

- `pr`: help and command-contract coverage now exist, and `gh` fetch failure now has local black-box smoke, but checkout/auth/network depth remains thin
- `session`: deterministic coverage and fast-gate smoke now cover `list/show/delete` plus corrupted latest-session recovery, and root `--continue` now has local black-box smoke, but broader resume depth still remains thin
- `serve`: `/health`, `/doctor`, and `/providers` metadata smoke now exist, and `/chat` missing-prompt / malformed-body error paths now have both deterministic and black-box coverage, but deeper streaming contract coverage is still missing
- `run`: top-level help coverage now exists, but task-execution path coverage is still thinner than subsystem coverage
- `providers test`: explicit reachable-endpoint smoke now exists, and transport failure now has local black-box smoke, but timeout depth remains thin
- root entry / `orca` / `--continue` / `--safe` / `--effort`: help-level black-box coverage exists and root `--continue` now has a local resume smoke, but resume execution depth remains thin
- packaging / install / bin entrypoint flows: deterministic packaging smoke exists, and install-from-tarball now has a release smoke, but broader user-path flows remain thin

### Depth gaps

- malformed SSE frames, partial usage, client aborts, invalid JSON, non-stream mode
- save/resume/delete corruption, concurrent session state, logger/stats DB corruption
- unicode paths, symlinks, readonly dirs, binary files, huge diffs
- `gh` auth and PR failure paths, git dirty/non-repo/timeout paths across operator surfaces
- long-running, interrupted, resumed, and replayed sessions

## Breadth Expansion Matrix

| Lane | Focus | Increment Target |
| --- | --- | --- |
| B1 | Command / flag / help / program registration matrix | `+40` to `+60` |
| B2 | Provider / model / config / doctor / stats / providers matrix | `+35` to `+50` |
| B3 | REPL / ink input / session / background-job / theme / output matrix | `+40` to `+55` |
| B4 | Serve / headless / IDE integration / filesystem boundary matrix | `+20` to `+35` |
| Breadth subtotal | Wider surface coverage | `+135` to `+200` |

## Depth Expansion Matrix

| Lane | Focus | Increment Target |
| --- | --- | --- |
| D1 | Long-horizon agent loop and retry / recovery flows | `+35` to `+50` |
| D2 | Multi-step bug-fix / feature / refactor scenarios | `+45` to `+60` |
| D3 | Adversarial, malformed-input, and safety boundary scenarios | `+35` to `+50` |
| D4 | Large-codebase navigation, multi-model arbitration, and release-grade workflows | `+35` to `+50` |
| Depth subtotal | Deeper end-to-end behavior coverage | `+150` to `+210` |

## Gate Design

| Gate | Purpose | Target Shape |
| --- | --- | --- |
| Fast gate | Keep PR-level feedback tight on critical paths | shared manifest runner + `14` black-box task-eval scenarios |
| Nightly gate | Run the broad confidence net | shared manifest runner + deterministic gates (`lint` / `test` / `build`) + the local black-box pack |
| Release gate | Prove SOTA readiness before shipping | shared manifest runner + deterministic gates + `bench` + black-box pack + recorded CLI journey artifact |

## Category Targets

| Category | Current Approx | Release Target | Net Add |
| --- | --- | --- | --- |
| Public command contracts | `~46` | `220` | `+174` |
| Chat / REPL / UI | `325` | `480` | `+155` |
| Provider / tools / hooks / config | `230` | `430` | `+200` |
| Agent runtime / planner / safety | `568` | `760` | `+192` |
| Integration / large-repo / headless / IDE | `75` | `260` | `+185` |
| Packaging / install / bin / publish smoke | `~0` | `60` | `+60` |

## Command Quotas

| Surface | Target Cases |
| --- | --- |
| `pr` | `40` |
| `session` | `36` |
| `serve` | `40` |
| `run` | `40` |
| `providers test` | `24` |
| `stats` | `24` |
| `init` | `18` |
| `logs` | `12` |
| `bench` | `15` |
| root/bin/`--continue` | `20` |

## Agent-Eval Task Families

| Family | Goal | Release Task Count |
| --- | --- | --- |
| T1 | Multi-file bug fix with verification | `16` |
| T2 | Feature addition touching code + tests + docs | `14` |
| T3 | Cross-module refactor / migration with stable behavior | `10` |
| T4 | Command / operator workflows (`session`, `serve`, `pr`, `logs`, `stats`) | `12` |
| T5 | Safety / recovery / adversarial behavior | `10` |
| T6 | Multi-model council / race / pipeline and routing quality | `10` |
| Total | Task-based eval coverage | `72` |

## Grader Plan

至少覆盖以下 4 类，并避免和 Vitest 的低层断言重复：

| Grader Type | Purpose | Planned Count |
| --- | --- | --- |
| Exit / artifact graders | exit code, file exists, file content, git diff shape | `4-5` |
| CLI output graders | stdout / stderr shape, doctor / provider / stats summaries, markdown / diff rendering | `2-3` |
| Scenario graders | task completion correctness, recovery quality, multi-step workflow completeness | `2-3` |
| Human review rubrics | UX clarity, result usefulness, terminal readability, safety posture | `2-3` |
| Total | Reusable grader specs | `10-12` |

## Test Architecture Guardrails

1. Reduce global env mutation so growing suites do not amplify flake risk around `HOME`, `ORCA_HOME`, console mocks, or `process.exit`.
2. Avoid megafile sprawl by splitting new suites through command-surface and lane ownership, not by extending already-large files forever.
3. Keep public CLI contracts visible so internal harness growth does not create false confidence.
4. Centralize fixture factories and temporary repo helpers to avoid setup duplication.
5. Maintain explicit fast / nightly / release manifests so the quality program can shard cleanly.

## Transcript Requirements

每个任务运行都必须记录：

- 用户输入 / task prompt
- 关键命令、参数、环境前提
- stdout / stderr
- 工具调用与关键中间结果
- 失败重试与最终结论

## Outcome Requirements

结果必须反映真实环境状态，例如：

- 目标文件、补丁、日志或输出 artifact 是否真实存在
- CLI 是否返回预期退出状态和摘要信息
- 场景所要求的测试 / build / doctor / bench 信号是否达到预期

## Plan Checklist

| ID | Task | Graders / Evidence | Status |
| --- | --- | --- | --- |
| T-001 | Lock and refresh the real deterministic baseline (`1263/1263` planning start → `1280/1280` current) and document drift from historical flat docs | `npm test`, canonical docs | done |
| T-002 | Define breadth lanes and target quotas | `AGENT_EVAL_PLAN.md`, PDCA docs | done |
| T-003 | Define depth lanes and target quotas | `AGENT_EVAL_PLAN.md`, PDCA docs | done |
| T-004 | Split fast / nightly / release gates | `AGENT_EVAL_PLAN.md`, PDCA docs | done |
| T-005 | Lock command-surface quotas and public contract gaps (`pr`, `session`, `serve`, `run`, `providers test`, root/bin, packaging) | plan tables + PDCA docs | done |
| T-006 | Scaffold and seed `agent-eval/` task and grader assets | `tasks/fast-*.json`, `graders/fast-gate.graders.json` | done |
| T-007 | Implement the first breadth tranche | `tests/command-contracts.test.ts`, `npm test` | done |
| T-008 | Implement the first depth tranche | `tests/session-command.test.ts`, `tests/serve-command.test.ts`, `npm test` | done |
| T-009 | Add packaging / install / bin-entry smoke coverage | `tests/packaging-smoke.test.ts`, `npm run build`, `npm pack --json --dry-run` | done |
| T-010 | Expand the fast-gate pack to the planned `12` task baseline and rerun it end-to-end | `tasks/fast-*.json`, `agent-eval/scripts/run-fast-gate.py`, `runs/20260415-020102`, deliverable evidence | done |
| T-011 | Land the shared manifest-based gate runner and execute a real release-grade bundle | `agent-eval/manifests/*.json`, `agent-eval/scripts/run-gate.py`, `runs/<run_id>`, CLI journey artifact | done |
| T-012 | Continue expanding nightly / release task inventory toward the `36` / `72` target matrix | future task packs + grader growth | todo |
