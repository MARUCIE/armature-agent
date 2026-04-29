# Orca CLI SOTA Swarm Audit

- Initiative: `orca`
- Date: `2026-04-29`
- Project dir: `/Users/mauricewen/Projects/orca-cli`
- Baseline: dirty working tree audit; existing user changes were preserved
- Report route: `html-style-router` -> `html-economist-style`
- Verification baseline before fixes: `npm run lint`, `npm test` (`85` files / `1583` tests), `npm run build`
- Final verification after PDCA tranche: `npm run lint`, `npm run build`, `npm test` (`88` files / `1611` tests)

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

1. A single canonical execution contract is still incomplete for `chat` and model routing; `run`, `serve /chat`, mission, and planner now share the TaskRun spine.
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
- Added `orca queue follow <task-run-id>` for live evidence tails and terminal-state exit.
- Added `orca queue takeover <task-run-id>` for explicit operator leases.
- Added `orca queue evidence <task-run-id>` as a TaskRun evidence drawer for logs, diffs, data, reports, missing artifacts, and capped previews.
- Regression coverage verifies status filtering and evidence display.

### Medium-High - Review-before-apply is too compressed

The TUI has useful prompt, status, tool, and permission components, but diff/evidence views are still constrained by line caps and preview text.

Evidence:

- `src/ui/components/DiffPreview.tsx`
- `src/ui/session.ts`
- `src/commands/chat-proxy-tool-call.ts`
- `src/ui/components/App.tsx`

PDCA action executed:

- `orca queue evidence <task-run-id>` opens a terminal evidence drawer keyed by `TaskRun`.
- Drawer entries classify logs/diffs/data/reports/artifacts, resolve relative paths, show size and update time, mark missing files, and preview capped tails.
- Remaining Ink side-panel integration is intentionally left out until the broader uncommitted UI baseline is closed.

### High - CI gate claims are broader than enforced gates

Earlier, `package.json` exposed `test:static`, `test:security`, `test:performance`, `test:matrix`, and eval gates while CI ran a narrower subset.

Evidence:

- `.github/workflows/ci.yml`
- `package.json`
- `agent-eval/manifests/`
- `agent-eval/graders/`

Atomic follow-up:

PDCA action executed:

- Replaced the stale benchmark-only CI job with a `gate-integrity` job that runs matrix sync, static, security, performance, and fast agent-eval gates.
- Added `agent-eval/manifests/test-matrix.json` plus a repo-owned runner and sync checker so package scripts and generated entrypoints stay aligned with the manifest.
- Added matrix runner and sync tests that cover package script wiring, safe manifest execution, path traversal rejection, generated entrypoints, and helper script presence.

### Medium - Slash-command discovery could drift across UI surfaces

Before the fix, slash-command metadata was repeated across REPL tab completion, Ink command picker, future HomePanel hints, and `/help` output.

PDCA action executed:

- Added `src/slash-commands.ts` as the shared slash-command registry.
- REPL completion, Ink command picker, and `/help` sections now read from that registry; HomePanel descriptions are present in the registry for the pending UI-baseline split.
- Regression coverage verifies registry uniqueness, picker/completer alignment, help sections, and alias description lookup.

### Medium - README and active PDCA docs could drift from current verification evidence

Before the fix, README and active PDCA documents relied on manually copied test counts.

PDCA action executed:

- Added `doc/00_project/initiative_orca/verification_snapshot.json` as the active release evidence snapshot.
- Added `tests/release-evidence.test.ts` to guard package version, README evidence strings, test file count, and active PDCA docs against the snapshot.
- Updated README and active PDCA docs to `v0.8.7`, `88` test files, and `1609` tests.

## Milestone Plan

| Milestone | Goal | Exit Criteria |
| --- | --- | --- |
| M0 Trust Hardening | Close immediate repo-trust and network-tool risks | Repo-local hooks require explicit trust; network tools approval-gated; targeted security tests pass |
| M1 Queue Visibility | Make current TaskRun state inspectable | `orca queue list/show/follow/takeover/evidence` shipped; status filtering, evidence streaming, leases, and evidence drawer covered |
| M2 Unified Execution Contract | One run object across CLI, serve, mission, planner | Partial: `run` and `serve /chat` create/update canonical records; chat/mission/planner remain |
| M3 Evidence Console | Review-before-apply becomes inspectable | Partial: CLI evidence drawer shows TaskRun logs/diffs/artifacts; Ink side panel and approvals timeline remain |
| M3b Slash Command Surface | Command discovery cannot drift across REPL and Ink | Shared registry feeds completion, picker, and `/help`; HomePanel metadata is prepared but not staged into the dirty UI baseline |
| M3c Release Evidence Snapshot | README/doc verification evidence cannot silently drift | Snapshot and release-evidence test guard README plus active PDCA docs |
| M4 Gate Integrity | CI enforces documented gates | CI runs matrix sync, static, security, performance, and fast agent-eval gates |
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
| ORCA-SWARM-009 | P1 | Add evidence drawer for TaskRun logs/diffs/artifacts | UX | done |
| ORCA-SWARM-010 | P1 | Centralize slash-command registry so HomePanel/completer/TUI cannot drift | UX | core done |
| ORCA-SWARM-011 | P2 | Align README/doc test counts to current suite evidence | docs | done |
| ORCA-SWARM-012 | P2 | Add CI matrix/security/performance/eval enforcement | verification | done |
| ORCA-SWARM-013 | P1 | Record `orca run` default/goal-loop/mission/plan executions as canonical TaskRuns | runtime | done |

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
- Final `npm test` -> `88` files / `1611` tests passed
- Gate integrity targeted tests cover manifest/script/sync behavior.
- CI now executes `test:matrix:sync`, `test:static`, `test:security`, `test:performance`, and `test:ai-eval-fast`.
- `node dist/bin/orca.js --version` -> `0.8.9`
- `npm test -- tests/run-work-session.test.ts tests/work-session-store.test.ts tests/queue-command.test.ts` -> `14` tests passed
- `npm test -- tests/queue-command.test.ts tests/work-session-store.test.ts` -> `11` tests passed
- Clean staged-index `npm test -- tests/queue-command.test.ts tests/work-session-store.test.ts` -> `11` tests passed
- `npm test -- tests/slash-commands.test.ts tests/chat-slash-readonly.test.ts tests/ink-ui.test.tsx` -> `98` tests passed
- Clean staged-index `npm test -- tests/slash-commands.test.ts tests/chat-slash-readonly.test.ts tests/ink-ui.test.tsx` -> `98` tests passed
- `npm test -- tests/release-evidence.test.ts` -> `3` tests passed
- `git diff --cached --check` -> pass
- `orca queue evidence <task-run-id>` -> evidence drawer renders typed entries, metadata, missing files, and tail previews
- `ai check` attempted -> failed on existing generic harness/doc gates: missing `tests/test_all.py`, legacy docs without required frontmatter/changelog, and historical no-emoji hits; evidence at `outputs/check/20260429-044244-b917cb00`
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

1. Complete execution contract unification for the chat REPL turn lifecycle.
2. Ink evidence side panel and review-before-apply approvals timeline.
3. Continue the unified execution contract for chat REPL and model routing.

## Remaining Risks

- DNS names that resolve to private IPs are not yet resolved and blocked before `curl`; only literal private hosts and localhost-style names are blocked in this tranche.
- Repo-local hooks now have an env trust switch, but a first-class `orca hooks trust` UX does not exist yet.
- `orca queue` now supports list/show/follow/takeover/evidence, but is not yet a durable scheduler or process-resume manager.
- Evidence drawer is CLI-terminal first; full Ink side-panel integration remains blocked by the existing uncommitted UI baseline.
- Slash command discovery now has one registry, but command execution handlers still live in the read-only and mutating slash switches.
- HomePanel registry consumption remains blocked by the existing uncommitted UI baseline and should be split before claiming full ORCA-SWARM-010 closure.
