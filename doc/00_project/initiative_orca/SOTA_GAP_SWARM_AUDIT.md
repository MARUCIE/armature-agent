# Orca CLI SOTA Swarm Audit

- Initiative: `orca`
- Date: `2026-04-29`
- Project dir: `/Users/mauricewen/Projects/orca-cli`
- Baseline: dirty working tree audit; existing user changes were preserved
- Report route: `html-style-router` -> `html-economist-style`
- Verification baseline before fixes: `npm run lint`, `npm test` (`85` files / `1583` tests), `npm run build`
- Final verification after PDCA tranche: `npm run lint`, `npm run build`, `npm test` (`86` files / `1600` tests)

## Scope

This audit compared Orca against current coding-agent SOTA patterns, then executed the first PDCA tranche against the highest-risk gaps.

Swarm lanes:

1. Architecture and runtime continuity
2. Security and trust boundaries
3. Operator UX and TUI review surface
4. Verification, gates, and release readiness
5. Documentation governance and evidence drift

External official references checked for this report:

- OpenAI Codex app and automations:
  - https://openai.com/index/introducing-the-codex-app/
  - https://openai.com/academy/codex-automations
- GitHub Copilot coding agent:
  - https://docs.github.com/en/copilot/concepts/about-copilot-coding-agent
- Cursor background agents:
  - https://docs.cursor.com/background-agent/api/overview
- Claude Code permissions:
  - https://code.claude.com/docs/en/permissions
- OpenCode agents and permissions:
  - https://opencode.ai/docs/agents/
  - https://opencode.ai/docs/permissions/
- Amp permissions and review surface:
  - https://ampcode.com/manual
  - https://ampcode.com/notes/permissions

## Executive Verdict

Orca has moved beyond basic CLI parity. The strongest areas are provider-neutral execution, multi-model collaboration, workflow presets, saved sessions, and a growing continuity spine.

The remaining SOTA gap is now sharper:

1. A single canonical execution contract is missing across `chat`, `run`, `serve`, mission, planner, and model routing.
2. Async work is visible, but not yet a durable operator queue with leases, follow, takeover, and evidence bundles.
3. Review-before-apply is still too lossy for high-confidence agent delegation.
4. Trust boundaries were inconsistent around repo-local hooks and network-capable tools.
5. CI and docs still under-enforce the gate claims already described in project documentation.

The first PDCA tranche has been executed against item 4 and the queue visibility part of item 2.

## Swarm Findings

### Critical - Repo-local hooks could execute on startup without explicit trust

Before the fix, Orca loaded `.orca/hooks.json`, `.orca.json`, `.claude/hooks.json`, and `.claude/settings.json` from the current repository during startup. `SessionStart` hooks could run shell commands with inherited process environment.

Evidence:

- `src/hooks.ts`
- `src/commands/chat.ts`
- `tests/hooks.test.ts`

PDCA action executed:

- Project hooks now require explicit trust via `HookManager({ trustProjectHooks: true })` or `ORCA_TRUST_PROJECT_HOOKS=1`.
- Global operator hooks remain startup-safe.
- Hook subprocess env is now allowlisted instead of inheriting provider API keys wholesale.
- Doctor diagnostics may still inspect project hooks without executing them.

### High - Network tools bypassed the dangerous-tool approval lane

`fetch_url` and `web_search` can exfiltrate context or hit internal endpoints. They were not in `DANGEROUS_TOOLS`, and `fetch_url` did not block loopback/private/link-local hosts.

Evidence:

- `src/tools.ts`
- `src/policy-executor.ts`
- `tests/chat-proxy-tool-call.test.ts`

PDCA action executed:

- `fetch_url` and `web_search` now require approval in `auto` mode.
- `fetch_url` only accepts absolute HTTP(S) URLs.
- `fetch_url` blocks loopback, private IPv4 ranges, link-local hosts, carrier-grade NAT, benchmarking ranges, multicast, and common IPv6 local ranges by default.

### High - Runtime execution paths are split

`run` has durable `WorkSession` / `TaskRun` objects, while `serve` remains closer to a prompt proxy. Mission and planner paths still carry their own in-memory orchestration.

Evidence:

- `src/commands/run.ts`
- `src/commands/serve.ts`
- `src/work-session-store.ts`
- `src/mission/controller.ts`
- `src/planner/executor.ts`

Recommended next tranche:

- Define one `ExecutionRun` contract that every surface writes.
- Move `serve` from `/chat` proxy to a headless run surface.
- Keep `WorkSession` / `TaskRun` as the SSoT for queue and evidence inspection.

### High - Queue visibility existed in data but not in CLI ergonomics

TaskRun summaries existed, and `serve` exposed metadata endpoints, but the operator had no top-level queue inspection command.

PDCA action executed:

- Added `orca queue`.
- Added `orca queue list --status <status> --work-session <id> --limit <n>`.
- Added `orca queue show <task-run-id>`.
- Regression coverage verifies status filtering and evidence display.

### Medium-High - Review-before-apply is too compressed

The TUI has useful prompt, status, tool, and permission components, but diff/evidence views are still constrained by line caps and preview text.

Evidence:

- `src/ui/components/DiffPreview.tsx`
- `src/ui/session.ts`
- `src/commands/chat-proxy-tool-call.ts`
- `src/ui/components/App.tsx`

Atomic follow-up:

- Build an expandable evidence drawer keyed by `TaskRun`.
- Show changed files, approvals, tool calls, logs, and artifact paths before apply/merge.

### High - CI gate claims are broader than enforced gates

`package.json` exposes `test:static`, `test:security`, `test:performance`, `test:matrix`, and eval gates, but CI currently runs a narrower subset.

Evidence:

- `.github/workflows/ci.yml`
- `package.json`
- `agent-eval/manifests/`
- `agent-eval/graders/`

Atomic follow-up:

- Add a gate-integrity CI job that runs matrix sync, static/security/performance rows, and at least the fast eval gate.
- Convert existence/keyword checks into behavior assertions where possible.

## Milestone Plan

| Milestone | Goal | Exit Criteria |
| --- | --- | --- |
| M0 Trust Hardening | Close immediate repo-trust and network-tool risks | Repo-local hooks require explicit trust; network tools approval-gated; targeted security tests pass |
| M1 Queue Visibility | Make current TaskRun state inspectable | `orca queue list/show/follow/takeover` shipped; status filtering, evidence streaming, and lease claims covered |
| M2 Unified Execution Contract | One run object across CLI, serve, mission, planner | Partial: `run` and `serve /chat` create/update canonical records; chat/mission/planner remain |
| M3 Evidence Console | Review-before-apply becomes inspectable | TUI and CLI show changed files, diffs, logs, approvals, artifacts |
| M4 Gate Integrity | CI enforces documented gates | CI runs declared matrix/security/performance/eval gates or explicitly marks deferred rows |
| M5 Model Catalog SSoT | Provider routing metadata stops drifting | One model catalog powers runtime, docs, picker, and tests |

## Atomic Task Queue

| ID | Priority | Task | Owner Lane | Status |
| --- | --- | --- | --- | --- |
| ORCA-SWARM-001 | P0 | Require explicit trust before loading repo-local hooks | security | done |
| ORCA-SWARM-002 | P0 | Stop inheriting provider API keys into hook subprocess env | security | done |
| ORCA-SWARM-003 | P0 | Approval-gate `fetch_url` and `web_search` in auto mode | security | done |
| ORCA-SWARM-004 | P0 | Block private/loopback/link-local targets in `fetch_url` | security | done |
| ORCA-SWARM-005 | P1 | Add `orca queue list/show` over `TaskRun` records | runtime | done |
| ORCA-SWARM-006 | P1 | Add `queue follow` for live log/evidence streaming | runtime | done |
| ORCA-SWARM-007 | P1 | Add `queue takeover` lease model | architecture | done |
| ORCA-SWARM-008 | P1 | Convert `serve /chat` into a canonical run endpoint | architecture | done |
| ORCA-SWARM-009 | P1 | Add evidence drawer for TaskRun logs/diffs/artifacts | UX | pending |
| ORCA-SWARM-010 | P1 | Centralize slash-command registry so HomePanel/completer/TUI cannot drift | UX | pending |
| ORCA-SWARM-011 | P2 | Align README/doc test counts to current suite evidence | docs | pending |
| ORCA-SWARM-012 | P2 | Add CI matrix/security/performance/eval enforcement | verification | pending |

## PDCA Execution Log

### Plan

- Rank swarm findings by operator risk and blast radius.
- Execute small, reversible slices first.
- Avoid refactoring the already-dirty worktree outside the current boundary.

### Do

Changed in the first tranche:

- `src/hooks.ts`
- `src/tools.ts`
- `src/doctor.ts`
- `src/commands/queue.ts`
- `src/program.ts`
- `tests/hooks.test.ts`
- `tests/hooks-compat.test.ts`
- `tests/tools.test.ts`
- `tests/chat-proxy-tool-call.test.ts`
- `tests/queue-command.test.ts`
- `tests/program.test.ts`
- `tests/command-contracts.test.ts`
- `tests/v030-harness.test.ts`
- `tests/v050-modules.test.ts`

### Check

Verification executed:

- `npm test -- tests/hooks.test.ts tests/hooks-compat.test.ts tests/tools.test.ts tests/chat-proxy-tool-call.test.ts tests/v030-harness.test.ts tests/v050-modules.test.ts` -> `153` tests passed
- `npm test -- tests/queue-command.test.ts tests/program.test.ts tests/command-contracts.test.ts tests/work-session-store.test.ts` -> `37` tests passed
- Combined targeted regression pack -> `190` tests passed
- `npm run lint` -> pass
- `npm run build` -> pass
- Final `npm test` -> `86` files / `1600` tests passed
- `node dist/bin/orca.js --version` -> `0.8.4`
- `node dist/bin/orca.js queue takeover <fixture-task-run> --holder smoke --ttl 30s` -> acquired a TaskRun lease
- `POST /chat` in serve mode -> returns or emits `workSessionId` and `taskRunId`, then closes TaskRun status on completion/failure
- `node dist/bin/orca.js --help` -> `queue` command visible
- `node dist/bin/orca.js queue list --limit 3` -> empty-state renders successfully

Pre-fix baseline evidence:

- `npm run lint` -> pass
- `npm test` -> `85` files / `1583` tests passed
- `npm run build` -> pass

### Act

Next queue items should proceed in this order:

1. Complete execution contract unification for `chat`, mission, and planner.
2. Evidence console and review-before-apply expansion.
3. CI gate integrity.
4. Documentation count drift cleanup.

## Remaining Risks

- DNS names that resolve to private IPs are not yet resolved and blocked before `curl`; only literal private hosts and localhost-style names are blocked in this tranche.
- Repo-local hooks now have an env trust switch, but a first-class `orca hooks trust` UX does not exist yet.
- `orca queue` now supports list/show/follow/takeover, but is not yet a durable scheduler or process-resume manager.
- Full `npm test` and `npm run build` should be rerun after documentation closeout to refresh the final all-suite evidence.
