# Deliverable

## 2026-04-29 - Clean-Index Command Baseline PDCA Tranche

### Scope

Close ORCA-SWARM-014 by making the command surface already declared in `program.ts` build from a clean staged checkout, while preserving the staged config/provider helpers required by the expanded config regression suite.

### Delivered

- Added a small workflow-command module for `review`, `debug`, and `architect` without dragging the larger dirty chat/UI baseline into this tranche.
- Added the real `permissions` command surface and config-backed permission mode / allowlist storage helpers.
- Added the real `evolve` command surface backed by the committed evolution store.
- Added the git repository root helper required by policy execution and config rule normalization.
- Promoted workflow preset metadata into the mode registry so root help, command contracts, and mode policies share one source.
- Preserved the config provider-gateway baseline for Cloudflare / Claudeflare routing that is now covered in `tests/config.test.ts`.
- Version bumped to `0.8.10`.

### Changed Files

- `src/program.ts`
- `src/commands/workflows.ts`
- `src/commands/permissions.ts`
- `src/commands/evolve.ts`
- `src/config.ts`
- `src/git-repository.ts`
- `tests/config.test.ts`
- `tests/permissions-command.test.ts`
- `README.md`
- `package.json`
- `package-lock.json`
- `doc/00_project/initiative_orca/*`

### Verification

- Clean staged-index `npm run build` -> pass
- Clean staged-index `npm test -- tests/config.test.ts tests/permissions-command.test.ts tests/program.test.ts tests/command-contracts.test.ts tests/release-evidence.test.ts tests/v030-harness.test.ts` -> `100/100`
- Full active-worktree `npm run lint && npm run build && npm test` -> `88` files / `1611` tests
- `node dist/bin/orca.js --version` -> `0.8.10`

### Remaining Risks

| Risk | Owner | Follow-up |
| --- | --- | --- |
| Chat REPL TaskRun production is still outside this clean-index tranche | Runtime | Continue with a dedicated chat lifecycle tranche |
| The broader dirty Ink/UI baseline remains unstaged | UX | Split HomePanel/evidence timeline work after command baseline is committed |

## 2026-04-29 - Run Execution Contract PDCA Tranche

### Scope

Advance ORCA-SWARM-013 by making `orca run` default, goal-loop, mission, and plan paths write the same WorkSession / TaskRun record family already used by queue and `serve /chat`.

### Delivered

- `orca run` creates a `WorkSession` and active `TaskRun` before execution starts.
- Default run, goal-loop, mission, and plan paths finish the TaskRun with status, summary, usage, and relevant evidence.
- Run usage records now carry the WorkSession id as the usage session reference.
- Runtime observations record WorkSession / TaskRun ids for the run surface.
- Regression tests cover default run, mission mode, and plan mode TaskRun records.
- Version bumped to `0.8.9`.

### Changed Files

- `src/commands/run.ts`
- `src/evolution/observer.ts`
- `src/evolution/store.ts`
- `src/knowledge/learning.ts`
- `src/usage-db.ts`
- `tests/run-work-session.test.ts`
- `tests/evolution-store.test.ts`
- `tests/v030-coverage.test.ts`
- `README.md`
- `package.json`
- `package-lock.json`
- `doc/00_project/initiative_orca/*`

### Verification

- `npm test -- tests/run-work-session.test.ts tests/work-session-store.test.ts tests/queue-command.test.ts` -> `14/14`
- Clean staged-index `npm test -- tests/run-work-session.test.ts tests/evolution-store.test.ts tests/work-session-store.test.ts tests/queue-command.test.ts tests/release-evidence.test.ts tests/v030-coverage.test.ts` -> `40/40`
- `npm run build` -> pass
- `npm run lint && npm run build && npm test` -> `88` files / `1611` tests
- `npm test -- tests/release-evidence.test.ts` -> `3/3`
- `node dist/bin/orca.js --version` -> `0.8.9`

### Remaining Risks

| Risk | Owner | Follow-up |
| --- | --- | --- |
| Chat REPL still has its own long-running turn lifecycle before it becomes a first-class TaskRun producer | Runtime | Split a dedicated chat TaskRun tranche after the current dirty chat baseline is isolated |
| Mission/plan tests use mocks for controller/planner internals | Verification | Add integration coverage after mission/planner runtime dependencies are made deterministic |
| Clean staged-index full build still exposes pre-existing dirty baseline imports for preset commands, permissions/evolve, and git repository helpers | Baseline owners | Split the existing chat/modes/permissions/evolve baseline before claiming clean-index full-suite parity |

## 2026-04-29 - CI Gate Integrity PDCA Tranche

### Scope

Complete ORCA-SWARM-012 by making CI enforce the matrix, security, performance, and fast agent-eval gates that the docs and package scripts advertise.

### Delivered

- Replaced the stale CI benchmark job with a `gate-integrity` job.
- Added matrix entrypoints for static, unit, contract, integration, e2e, security, performance, resilience, and fast agent-eval layers.
- Added `agent-eval/manifests/test-matrix.json` plus runner/sync scripts and a generated entrypoint snippet.
- Added fast-gate serve continuity coverage to fast/nightly/release manifests.
- Stabilized the hook system-message regression by injecting a local writer in the test instead of spying on global stderr during parallel full-suite runs.
- Version bumped to `0.8.8`.

### Changed Files

- `.github/workflows/ci.yml`
- `package.json`
- `package-lock.json`
- `agent-eval/manifests/*`
- `agent-eval/scripts/run-test-matrix.py`
- `agent-eval/scripts/sync-test-matrix.py`
- `agent-eval/scripts/run-secret-scan.py`
- `agent-eval/scripts/collect-license-inventory.py`
- `agent-eval/generated/test-matrix-entrypoints.md`
- `tests/test-matrix-runner.test.ts`
- `tests/test-matrix-sync.test.ts`
- `tests/agent-eval-manifests.test.ts`
- `src/policy-executor.ts`
- `tests/v050-modules.test.ts`
- `doc/00_project/initiative_orca/*`

### Simplifications Made

- Reused the existing `agent-eval` manifest model instead of adding a second CI policy format.
- Kept full nightly/release eval runs out of PR CI; the CI job enforces fast eval plus static/security/performance rows.
- Removed a parallel-test global stderr spy from the hook system-message regression.

### Verification

- `npm run test:matrix:sync` -> pass
- Clean staged-index `npm run test:matrix:sync` -> pass
- Clean staged-index `npm test -- tests/agent-eval-manifests.test.ts tests/test-matrix-runner.test.ts tests/test-matrix-sync.test.ts tests/release-evidence.test.ts` -> `22/22`
- `npm run test:unit` -> `outputs/test-matrix/run-20260429-061427/matrix.md`
- `npm test -- tests/v050-modules.test.ts tests/agent-eval-manifests.test.ts tests/test-matrix-runner.test.ts tests/test-matrix-sync.test.ts tests/release-evidence.test.ts` -> `69/69`
- `npm run test:static` -> `outputs/test-matrix/run-20260429-060205/matrix.md`
- `npm run test:security` -> `outputs/test-matrix/run-20260429-060222/matrix.md`
- `npm run test:performance` -> `outputs/test-matrix/run-20260429-060232/matrix.md`
- `npm run test:ai-eval-fast` -> `outputs/test-matrix/run-20260429-060243/matrix.md`
- `npm run lint && npm run build && npm test` -> `88` files / `1609` tests

### Remaining Risks

| Risk | Owner | Follow-up |
| --- | --- | --- |
| Static/security/performance rows are still lightweight gates rather than full SAST/DAST/perf-budget programs | Verification | Expand the manifest layers after CI enforcement is stable |
| CI runtime may be longer because the gate job runs after the Node matrix | Maintainer | Split into scheduled/release-only rows if GitHub timing becomes noisy |

## 2026-04-29 - Release Evidence Snapshot PDCA Tranche

### Scope

Complete ORCA-SWARM-011 by making README and active PDCA verification counts derive from a checked release evidence snapshot instead of loose manual copies.

### Delivered

- Added `doc/00_project/initiative_orca/verification_snapshot.json` as the active release evidence source.
- Added `tests/release-evidence.test.ts` to guard package version, README release strings, active worktree test-file evidence, and active PDCA docs.
- Updated README and active PDCA docs to `0.8.7`, `88` test files, and `1609` tests.
- Version bumped to `0.8.7`.

### Changed Files

- `README.md`
- `package.json`
- `package-lock.json`
- `tests/release-evidence.test.ts`
- `doc/00_project/initiative_orca/verification_snapshot.json`
- `doc/00_project/initiative_orca/*`

### Simplifications Made

- Kept historical notes as historical evidence; guarded only the current README and active PDCA reporting surfaces.
- Used a small JSON snapshot and Vitest guard instead of introducing a new docs generation pipeline.

### Verification

- `npm test -- tests/release-evidence.test.ts` -> `3/3`
- `npm run lint` -> pass
- `npm run build` -> pass
- `npm test` -> `88` files / `1609` tests passed
- Clean staged-index `npm test -- tests/release-evidence.test.ts` -> `3/3`
- `node dist/bin/orca.js --version` -> `0.8.7`

### Remaining Risks

| Risk | Owner | Follow-up |
| --- | --- | --- |
| Historical archive docs still contain older release counts by design | Docs | Treat dated sections as immutable evidence unless an active-current section cites them as current |
| Clean staged-index full-suite still exposes pre-existing uncommitted baseline dependencies outside this tranche | Baseline owners | Split/commit the existing permissions/evolution/test-matrix baseline before claiming clean-index full-suite parity |
| CI gate runtime may need tuning as matrix scope grows | Verification | Keep ORCA-SWARM-012 gate job focused on high-signal rows |

## 2026-04-29 - Slash Command Registry PDCA Tranche

### Scope

Advance ORCA-SWARM-010 by making slash-command discovery use one registry across REPL completion, Ink command picker, and `/help`, while leaving HomePanel wiring to the existing unstaged UI baseline.

### Delivered

- Added `src/slash-commands.ts` as the shared slash-command registry.
- REPL tab completion now reads command names from the registry.
- Ink command picker now reads picker-visible commands from the registry.
- `/help` now renders from the same registry sections instead of a separate hard-coded list.
- Registry entries expose `homeDescription` for the pending HomePanel consumer.
- Version bumped to `0.8.6`.

### Changed Files

- `src/slash-commands.ts`
- `src/commands/chat.ts`
- `src/commands/chat-slash-readonly.ts`
- `src/ui/components/App.tsx`
- `tests/slash-commands.test.ts`
- `README.md`
- `package.json`
- `package-lock.json`
- `doc/00_project/initiative_orca/*`

### Simplifications Made

- Kept slash-command execution switches unchanged; this tranche centralizes discovery metadata only.
- Reused the existing picker and help renderers instead of adding a second command-surface abstraction.

### Verification

- `npm test -- tests/slash-commands.test.ts tests/chat-slash-readonly.test.ts tests/ink-ui.test.tsx` -> `98/98`
- `npm run lint` -> pass
- `npm run build` -> pass
- `npm test` -> `87` files / `1606` tests passed
- `node dist/bin/orca.js --version` -> `0.8.6`
- Clean staged-index `npm test -- tests/slash-commands.test.ts tests/chat-slash-readonly.test.ts tests/ink-ui.test.tsx` -> `98/98`
- `git diff --cached --check` -> pass

### Remaining Risks

| Risk | Owner | Follow-up |
| --- | --- | --- |
| Slash-command execution still lives in read-only/mutating switches | Runtime/UX | Move handlers behind registry metadata only after the execution contract is unified |
| HomePanel is currently part of an unstaged UI baseline | UX/runtime | Split or commit the UI baseline before staging HomePanel registry consumption |

## 2026-04-29 - Queue Evidence Drawer PDCA Tranche

### Scope

Complete ORCA-SWARM-009 as a queue-first evidence drawer so operators can inspect TaskRun logs, diffs, data, reports, missing artifacts, and capped previews without opening raw files.

### Delivered

- `orca queue evidence <task-run-id>`
- `--lines <n>` for preview tail size
- `--max-bytes <n>` for bounded per-file preview output
- Evidence classification for `log`, `diff`, `data`, `report`, and generic `artifact`
- Resolved absolute paths, size, update time, missing-file state, and readable tail preview per evidence item
- Version bumped to `0.8.5`

### Changed Files

- `src/commands/queue.ts`
- `tests/queue-command.test.ts`
- `README.md`
- `package.json`
- `package-lock.json`
- `doc/00_project/initiative_orca/*`

### Simplifications Made

- Reused the existing TaskRun evidence array and background-log attachment path.
- Kept the drawer terminal-native instead of mixing in the current uncommitted Ink side-panel baseline.

### Verification

- `npm test -- tests/queue-command.test.ts tests/work-session-store.test.ts` -> `11/11`
- Clean staged-index targeted check: `npm test -- tests/queue-command.test.ts tests/work-session-store.test.ts` -> `11/11`
- `npm run lint` -> pass
- `npm run build` -> pass
- `npm test` -> `86` files / `1602` tests passed
- `node dist/bin/orca.js --version` -> `0.8.5`
- `ai check` -> failed on existing harness/doc gates: docs require frontmatter/changelog across legacy docs, no-emoji flags existing historical entries, and the test harness looks for missing `tests/test_all.py`; evidence at `outputs/check/20260429-044244-b917cb00`

### Remaining Risks

| Risk | Owner | Follow-up |
| --- | --- | --- |
| Evidence drawer is CLI-terminal first, not a full Ink side panel | UX/runtime | Extend the drawer into Ink after the existing uncommitted UI baseline is committed or split |
| Approvals and tool-call timelines are still not attached as first-class TaskRun evidence | Runtime/architecture | Continue M3 evidence-console work after execution contract unification |
| `ai check` harness is not aligned with this TypeScript repo baseline | Verification | Add a repo-local check adapter or update the harness before treating `ai check` as a release gate |

## 2026-04-29 - Serve Canonical Run PDCA Tranche

### Scope

Complete ORCA-SWARM-008 by making `serve /chat` write the same canonical `WorkSession` / `TaskRun` records used by the CLI run/queue surface.

### Delivered

- Valid `POST /chat` requests now create a `WorkSession` with `sourceSurface: serve`.
- Each request creates a `TaskRun` with `surface: serve` and `kind: run`.
- Non-streaming responses include `workSessionId` and `taskRunId`.
- Streaming responses emit an initial SSE `metadata` event with `workSessionId` and `taskRunId`.
- TaskRun state closes to `completed` or `failed` for non-streaming, streaming, provider exceptions, stream error events, and missing provider base URL.
- Runtime observations now include the WorkSession / TaskRun ids.
- Version bumped to `0.8.4`.

### Changed Files

- `src/commands/serve.ts`
- `tests/serve-command.test.ts`
- `README.md`
- `package.json`
- `package-lock.json`
- `doc/00_project/initiative_orca/*`

### Simplifications Made

- Reused the existing file-backed WorkSession / TaskRun store; no separate serve-run table.
- Kept `/chat` as the HTTP entrypoint and added run ids to existing response shapes instead of inventing a second endpoint.

### Verification

- `npm test -- tests/serve-command.test.ts tests/work-session-store.test.ts` -> `15/15`
- `npm run lint`
- `npm run build`
- `npm test` -> `1600/1600` across `86` files
- `node dist/bin/orca.js --version` -> `0.8.4`
- Clean staged-index targeted check: `npm test -- tests/serve-command.test.ts tests/work-session-store.test.ts` -> `7/7`
- Clean staged-index checkout attempted at `/tmp/orca-index-008.WnEC1K`; `npm run lint` is blocked by pre-existing uncommitted baseline dependencies (`src/program.ts` imports command/mode surfaces that are present only in the dirty workspace). This tranche intentionally does not stage those broader changes.

### Remaining Risks

| Risk | Owner | Follow-up |
| --- | --- | --- |
| `chat`, mission, and planner surfaces still do not all share the same run-record path | Runtime/architecture | Continue M2 execution-contract unification |
| TaskRun evidence bundles are still thin for serve requests | UX/runtime | Execute ORCA-SWARM-009 evidence drawer / richer evidence attachments |
| A clean index checkout still depends on older uncommitted baseline work outside this tranche | Release/hygiene | Close the broad command/mode baseline in a separate versioned commit before cutting a clean release artifact |

## 2026-04-29 - Queue Takeover PDCA Tranche

### Scope

Complete ORCA-SWARM-007 by making non-terminal TaskRun records leaseable from the CLI. This is an operator-control marker, not a scheduler or process-resume implementation.

### Delivered

- `orca queue takeover <task-run-id>`
- `--holder <name>` for explicit operator identity
- `--ttl <duration>` with `ms` / `s` / `m` / `h` parsing and a bounded max
- `--force` for intentional replacement of an active lease
- Store-level lease behavior:
  - reject terminal TaskRuns
  - reject active unexpired leases unless forced
  - replace expired leases automatically
  - preserve previous holder metadata on replacement
- `queue list` and `queue show` now surface lease holder / expiry metadata
- Version bumped to `0.8.3`

### Changed Files

- `src/work-session-store.ts`
- `src/commands/queue.ts`
- `tests/work-session-store.test.ts`
- `tests/queue-command.test.ts`
- `README.md`
- `package.json`
- `package-lock.json`
- `doc/00_project/initiative_orca/*`

### Simplifications Made

- Lease state stays on the existing TaskRun JSON record; no new daemon, scheduler table, or lock directory.
- `takeover` is explicit about claiming an operator lease and does not pretend to resume or migrate a running process.

### Verification

- `npm test -- tests/queue-command.test.ts tests/work-session-store.test.ts` -> `9/9`
- `npm run build`
- `npm test` -> `1598/1598` across `86` files
- `node dist/bin/orca.js --version` -> `0.8.3`
- `node dist/bin/orca.js queue takeover <fixture-task-run> --holder smoke --ttl 30s` -> acquired the fixture lease

### Remaining Risks

| Risk | Owner | Follow-up |
| --- | --- | --- |
| `queue takeover` is a lease marker, not real execution resume | Runtime/architecture | ORCA-SWARM-008 now covers `serve /chat`; remaining resume semantics stay under M2/M3 |
| Lease conflict handling is local-file based only | Runtime | Revisit atomic write / lock semantics before using it as a multi-process scheduler |

## 2026-04-29 - Queue Follow PDCA Tranche

### Scope

Continue the SOTA swarm atomic queue by completing ORCA-SWARM-006: make TaskRun evidence followable from the CLI without adding scheduler or lease semantics yet.

### Delivered

- `orca queue follow <task-run-id>`
- `--once` for snapshot mode
- `--lines <n>` for initial evidence tail size
- `--interval <ms>` for running TaskRun polling
- Background-job log attachment when a TaskRun carries `backgroundJobId`
- Runtime version surfaces now derive from package version instead of stale `0.8.0` literals

### Changed Files

- `src/commands/queue.ts`
- `src/background-jobs.ts`
- `src/version.ts`
- `src/program.ts`
- `src/output.ts`
- `src/commands/chat.ts`
- `tests/queue-command.test.ts`
- `tests/program.test.ts`
- `tests/v030-harness.test.ts`
- `README.md`
- `package.json`
- `package-lock.json`
- `doc/00_project/initiative_orca/*`

### Simplifications Made

- Follow mode reads from existing `TaskRun.evidence` and background-job metadata; no new queue daemon or scheduler abstraction.
- Running follow exits on terminal TaskRun states and uses polling instead of a separate watcher dependency.

### Verification

- `npm run lint`
- `npm test -- tests/queue-command.test.ts tests/work-session-store.test.ts tests/program.test.ts tests/command-contracts.test.ts` -> `39/39`
- `npm test -- tests/v030-harness.test.ts tests/program.test.ts tests/queue-command.test.ts tests/work-session-store.test.ts tests/command-contracts.test.ts` -> `59/59`
- `npm run build`
- `npm test` -> `1595/1595` across `86` files
- `node dist/bin/orca.js --version` -> `0.8.2`
- `node dist/bin/orca.js queue follow <fixture-task-run> --once --lines 1` -> printed fixture evidence tail

### Remaining Risks

| Risk | Owner | Follow-up |
| --- | --- | --- |
| `queue follow` was read-only and could not claim work | Runtime/architecture | Closed by ORCA-SWARM-007 `queue takeover`; real resume remains ORCA-SWARM-008+ |
| Evidence paths are tailed from local files only | Runtime/UX | Attach richer structured evidence bundles before TUI evidence drawer |

## 2026-04-29 - SOTA Swarm Audit and PDCA Tranche 1

### Scope

Audit Orca with a multi-lane SOTA swarm, publish the routed report, convert findings into a milestone plan and atomic queue, then execute the first PDCA tranche against the highest-risk trust and queue gaps.

### Delivered

- SOTA swarm audit report:
  - `doc/00_project/initiative_orca/SOTA_GAP_SWARM_AUDIT.md`
  - `doc/00_project/initiative_orca/SOTA_GAP_SWARM_AUDIT.html`
- Trust hardening:
  - repo-local hooks require explicit project trust via `HookManager({ trustProjectHooks: true })` or `ORCA_TRUST_PROJECT_HOOKS=1`
  - hook subprocess env no longer inherits provider API keys by default
  - `fetch_url` and `web_search` require approval in `auto` mode
  - `fetch_url` rejects non-HTTP(S), loopback, private, link-local, CGNAT, benchmark, multicast, and common local IPv6 targets
- Queue visibility:
  - `orca queue`
  - `orca queue list --status <status> --work-session <id> --limit <n>`
  - `orca queue show <task-run-id>`

### Changed Files

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
- `doc/00_project/initiative_orca/SOTA_GAP_SWARM_AUDIT.md`
- `doc/00_project/initiative_orca/SOTA_GAP_SWARM_AUDIT.html`

### Simplifications Made

- Startup hook loading now has a clear split: global hooks are startup-safe; repo-local hooks require explicit project trust.
- Hook subprocess environment is allowlisted instead of inheriting the full parent process.
- Network-capable tools now use the existing dangerous-tool approval lane instead of a separate policy path.
- Queue inspection reuses existing `TaskRun` storage; no scheduler abstraction was introduced in this tranche.

### Verification

- `npm run lint`
- `npm test -- tests/hooks.test.ts tests/hooks-compat.test.ts tests/tools.test.ts tests/chat-proxy-tool-call.test.ts tests/v030-harness.test.ts tests/v050-modules.test.ts` -> `153/153`
- `npm test -- tests/queue-command.test.ts tests/program.test.ts tests/command-contracts.test.ts tests/work-session-store.test.ts` -> `37/37`
- `npm test -- tests/hooks.test.ts tests/hooks-compat.test.ts tests/tools.test.ts tests/chat-proxy-tool-call.test.ts tests/queue-command.test.ts tests/program.test.ts tests/command-contracts.test.ts tests/v030-harness.test.ts tests/v050-modules.test.ts tests/work-session-store.test.ts` -> `190/190`
- `npm run build`
- `npm test` -> `1593/1593` across `86` files
- `node dist/bin/orca.js --help` -> `queue` command visible
- `node dist/bin/orca.js queue list --limit 3` -> renders TaskRun Queue empty-state successfully

### Remaining Risks

| Risk | Owner | Follow-up |
| --- | --- | --- |
| `fetch_url` blocks literal private hosts but does not yet resolve DNS names before curl | Runtime/security | Add DNS resolution and block resolved private addresses before execution |
| Project hook trust has an env/programmatic switch but no first-class CLI UX | Runtime/security | Add `orca hooks trust/status` or equivalent approval surface |
| `orca queue` is read-only and does not implement leases or takeover | Runtime/architecture | Execute ORCA-SWARM-007 |
| CI still under-enforces documented matrix/security/performance/eval gates | Verification | Execute ORCA-SWARM-012 |

## 2026-04-26 — Provider-grouped model picker（完成）

### Scope

Fix `/model` selection when multiple providers expose the same model name, and make the model picker readable for large provider catalogs.

### Delivered

- `/model` in Ink now picks provider first, then model within that provider.
- Model choices now carry provider+model identity, so selecting `poe/gpt-5.4` no longer resolves to the first `gpt-5.4` entry from another provider.
- `/model set <name>` now prefers the current provider when names are duplicated.
- `/models` legacy output is grouped by provider while preserving numeric selection.
- Shared `OptionPicker` now windows long lists and splits descriptions onto their own row.

### Verification

- `npm test -- tests/model-catalog.test.ts tests/ink-ui.test.tsx tests/chat-slash-mutations.test.ts tests/chat-slash-readonly.test.ts` -> `158/158`
- `npm run lint`
- `npm run build`
- `npm test` -> `1583/1583`
- `node dist/bin/orca.js --version` -> `0.8.0`

## 2026-04-22 — One-click full delivery（完成）

### Scope

Execute a Harness-grade full-delivery pass on the current trust-policy + eval tranche: establish explicit phase boundaries, absorb review/security findings into the release gate, fix the scoped blockers, rerun the full verification chain, and emit stage artifacts plus an executable rollback path.

### Change Summary

- Runtime/security hardening:
  - `src/mcp-client.ts`
  - `src/commands/chat.ts`
  - `src/policy-executor.ts`
  - `src/mcp-server.ts`
  - `src/commands/serve.ts`
- Regression coverage:
  - `tests/mcp-client.test.ts`
  - `tests/chat-one-shot-mcp-cleanup.test.ts`
  - `tests/v050-modules.test.ts`
  - `tests/serve-command.test.ts`
  - `tests/config.test.ts`
- Documentation / delivery surfaces:
  - `README.md`
  - `AGENT_EVAL_PLAN.md`
  - `doc/00_project/initiative_orca/{PRD.md,SYSTEM_ARCHITECTURE.md,USER_EXPERIENCE_MAP.md,task_plan.md,notes.md,PDCA_ITERATION_CHECKLIST.md}`
- Stage artifacts:
  - `outputs/spec/2026-04-22-one-click-full-delivery-spec.md`
  - `outputs/build/2026-04-22-build-scope.md`
  - `outputs/test/2026-04-22-test-evidence.md`
  - `outputs/security/2026-04-22-security-readiness.md`
  - `outputs/release/2026-04-22-release-readiness.md`
  - `outputs/observe/2026-04-22-observe-verdict.md`
  - `outputs/learn/2026-04-22-dna-capsule-candidates.md`

### Simplifications Made

- Repo-local MCP configs are no longer silently auto-spawned on startup; only home/global-scoped MCP remains startup-safe.
- `allowedTools: []` now means deny-all instead of “no policy”.
- MCP `tools/list` and `tools/call` now speak the same allowlist contract.
- Hook system notices no longer pollute MCP stdout framing.
- `/chat` request parsing now has a hard body-size ceiling instead of unbounded accumulation.

### Verification

- `npm run lint`
- `npm test` → `1553/1553`
- `npm run build`
- `npm run test:matrix:sync` → `ok`
- `npm run test:matrix` → `outputs/test-matrix/run-20260422-061719/matrix.md`
- `npm run eval:fast` → `agent-eval/runs/20260422-063053-333719/summary.json`
- `npm run eval:nightly` → `agent-eval/runs/20260422-061814-339289/summary.json`
- `npm run eval:release` → `agent-eval/runs/20260422-061914-913077/summary.json`
- `npm audit --omit=dev --json` → `outputs/security/2026-04-22-npm-audit.json`
- `npm pack --json --dry-run` → `outputs/release/2026-04-22-pack-dry-run.json`
- `node dist/bin/orca.js bench --json` → `outputs/test/2026-04-22-bench.json`

### Release Readiness

- Functional closure: pass
- Tests all green: pass
- Security no critical/high unresolved in this delivery scope: pass
- Performance budget: pass (`bench` score `100`)
- Docs updated: pass
- Rollback path executable: pass

### Remaining Risks

| Risk | Owner | Deadline | Mitigation |
| --- | --- | --- | --- |
| `AGENT_EVAL_PLAN.md` long-range inventory still has open `T-012` expansion work | Maurice | 2026-04-29 | extend nightly/release task families toward the `36` / `72` target matrix and refresh quotas after the next tranche |
| Matrix `static` / `security` / `performance` rows remain `partial-pass` by manifest design rather than deeper specialized gates | Maurice | 2026-05-06 | add dedicated SAST/DAST/IaC/ASVS and performance-budget layers, then tighten matrix status semantics if desired |
| Wave 4 continuity / evidence-console product work is still roadmap, not shipped in this pass | Maurice | 2026-05-06 | start the next tranche from `outputs/spec/2026-04-22-one-click-full-delivery-spec.md` and land `WorkSession` / `TaskRun` object model first |

### Rollback

- Scoped rollback artifact: `outputs/release/2026-04-22-scoped-rollback.patch`
- Validation command:
  - `git apply --check -R outputs/release/2026-04-22-scoped-rollback.patch`
- Scope:
  - current delivery pass repo-impacting files only (runtime/test/doc changes), without touching unrelated dirty worktree files

### DNA Capsule Candidates

- Startup-safe MCP provenance pattern: load project/home MCP configs, but auto-connect only trusted home/global scope and require explicit connect for repo-local scope.
- Shared policy fail-closed rule: any defined allowlist, including `[]`, is authoritative.
- MCP transport rule: never print human-readable hook notices to stdout on a JSON-RPC stdio channel; use stderr or structured payloads.
- Harness review rule: green tests are not enough to ship if attacker review finds a trust-policy contract mismatch.

## 2026-04-22 — Harness Verification Refresh（完成）

### Scope

Repair the stale verification blocker introduced by Cloudflare's routed-provider-key aggregator path, then refresh the canonical fast / nightly / release / matrix evidence so the trust-policy tranche is back on a green, auditable baseline.

### Delivered

- Fixed the stale aggregator smoke assumption in:
  - `tests/config.test.ts`
- Added a structured verification artifact:
  - `outputs/verification/2026-04-22-gate-refresh.md`
- Updated continuation / evidence docs:
  - `doc/00_project/initiative_orca/task_plan.md`
  - `doc/00_project/initiative_orca/notes.md`
  - `doc/00_project/initiative_orca/ROLLING_REQUIREMENTS_AND_PROMPTS.md`
  - `HANDOFF.md`

### Verification

- `npm run lint`
- `node --experimental-vm-modules node_modules/.bin/vitest run tests/hooks.test.ts tests/agent-eval-manifests.test.ts tests/test-matrix-runner.test.ts tests/test-matrix-sync.test.ts`
- `npm run build`
- `npm test` → `1546/1546`
- `npm run test:matrix:sync` → `ok`
- `npm run eval:fast` → `agent-eval/runs/20260422-054119-735043/summary.json`
- `npm run eval:nightly` → `agent-eval/runs/20260422-054727-090885/summary.json`
- `npm run eval:release` → `agent-eval/runs/20260422-054415-886673/summary.json`
- `npm run test:matrix` → `outputs/test-matrix/run-20260422-054827/matrix.md`

### Result

- Harness drift is closed: fast / nightly / release are now green at `62/62`, `65/65`, and `68/68`.
- Direct suite evidence is refreshed at `1546/1546`.
- The matrix lane is green again; `static`, `security`, and `performance` remain `partial-pass` by design, not by failure.
- The root cause is preserved in the rolling ledger so future aggregator tests do not silently depend on whichever provider keys happen to exist on the operator machine.

## 2026-04-22 — Global Orca Hook Surface（完成）

### Scope

Allow Orca to load a global native hook file from `~/.orca/hooks.json` so operator-level automations can apply across projects without copying `.orca/hooks.json` into every workspace.

### Delivered

- Added global Orca hook loading in:
  - `src/hooks.ts`
- Added regression coverage:
  - `tests/hooks.test.ts`
- Updated docs:
  - `README.md`
  - `doc/00_project/initiative_orca/PRD.md`
  - `doc/00_project/initiative_orca/SYSTEM_ARCHITECTURE.md`
  - `doc/00_project/initiative_orca/USER_EXPERIENCE_MAP.md`
  - `doc/00_project/initiative_orca/PLATFORM_OPTIMIZATION_PLAN.md`

### Verification

- `npm run lint`
- `npm test -- tests/hooks.test.ts`
- `npm run build`

### Result

- Orca now loads project-local and operator-global native hook config together.
- This enables AI-Fleet to install a shared Terminal-title `UserPromptSubmit` hook once at `~/.orca/hooks.json` and have direct `orca` sessions inherit it automatically.
- No compatibility layer or alternate hook system was introduced.

## 2026-04-21 — Cloudflare AI Gateway provider（完成）

### Scope

Add Cloudflare AI Gateway as a first-class Orca aggregator so provider-prefixed SOTA models can run through one OpenAI-compatible endpoint without forking the runtime.

### Delivered

- Added a well-known `cloudflare` provider in:
  - `src/config.ts`
- Added env-based base URL resolution for Cloudflare:
  - `CLOUDFLARE_AI_GATEWAY_API_KEY`
  - `CLOUDFLARE_AI_GATEWAY_BASE_URL`
- Added computed gateway URL fallback:
  - `CLOUDFLARE_ACCOUNT_ID`
  - `CLOUDFLARE_AI_GATEWAY_ID`
- Added compatibility alias:
  - `claudeflare`
- Added dual auth handling:
  - explicit Cloudflare gateway token when available
  - request-based provider key inferred from the model prefix when not
- Added Cloudflare model fallback selection so the provider can auto-pick a locally usable model
- Added Cloudflare to the known aggregator set so cross-vendor model routing can target it.
- Updated public docs:
  - `README.md`
- Added regression coverage:
  - `tests/config.test.ts`
  - `tests/model-catalog.test.ts`

### Verification

- `npm run lint`
- `npm test`
- `npm run build`
- `orca providers` => `cloudflare` now reports `ready` on this machine

### Result

- Orca now has a second serious aggregator lane alongside Poe/OpenRouter.
- Cloudflare can be used as the default provider or as the multi-model aggregator for council/race/pipeline flows.
- Local Cloudflare default is now aligned to `openai/gpt-5.4`, matching AI-Fleet `1c`.
- Multi-model auto-routing now prefers `GitHub Copilot -> Cloudflare`, with Poe/OpenRouter only after those preferred aggregators.
- `council` / `race` / `pipeline` startup banners now surface that priority and show the next fallback aggregator explicitly.
- Those startup banners now also surface billing path: `copilot subscription` first, `cloudflare credits` as fallback.

## 2026-04-20 — SOTA picker parity follow-up

### Scope

Push Orca's Ink/TUI finite-choice interactions closer to frontier coding CLIs by replacing ad hoc numbered prompts and divergent picker visuals with one shared picker architecture.

### Delivered

- Shared picker event + type layer:
  - `src/ui/types.ts`
  - `src/ui/session.ts`
  - `src/ui/components/App.tsx`
- Shared picker components:
  - `src/ui/components/PickerFrame.tsx`
  - `src/ui/components/OptionPicker.tsx`
- Ink-mode finite-choice flows upgraded:
  - `/model`, `/models`
  - `/mode`
  - `/effort`
  - `/load`
  - `/thread load`, `/thread delete`
  - `/mcp enable`, `/mcp disable`, `/mcp connect`
  - `ask_user(options)`
- Ink-mode search/discovery flows upgraded with filterable picker mode:
  - `/thread search`
  - `/notes search`
  - `/prompts find`
  - `/postmortem search`
- Searchable picker capability added:
  - initial query seeding from typed slash-command arguments
  - in-panel filtering
  - empty-state handling for no matches
- Wave 1 portability actions landed:
  - `orca session fork`
  - `orca session export`
  - `orca session import`
  - `/thread export`
  - `/thread import`
  - `/thread handoff`
- Search-to-inspect detail flow landed:
  - `detail_panel` UI event
  - `src/ui/components/DetailPanel.tsx`
  - Ink-mode detail rendering for:
    - `/thread search`
    - `/notes search`
    - `/prompts find`
    - `/postmortem search`
- Shareable artifact flow landed:
  - `orca session markdown`
  - `orca session share`
  - `/thread markdown`
  - `/thread share`
- Collaboration-bundle hardening landed:
  - session share now emits Markdown + metadata sidecar
  - session handoff now emits a dedicated handoff artifact bundle
  - thread share now emits Markdown + metadata sidecar
  - thread handoff now emits a dedicated handoff artifact bundle
- Wave 2 approval/trust flow landed:
  - top-level `orca permissions`
  - `/permissions` slash surface
  - persisted permission-mode config helpers
  - real `plan` semantics (approve every tool)
  - permission source visibility in status/footer
  - Ink `/permissions` detail panel + picker
  - permission prompts with once/session/project persistence scopes
  - inspectable `permissions rules` surfaces for session/project/global approvals
  - `permissions revoke` / `permissions clear` rule-management surfaces
  - filter-and-pick revoke flow when exact rule keys are not supplied
  - stable canonical permission rule descriptors instead of preview-text keys
  - `permissions normalize` surface for legacy rule cleanup
  - effective runtime allowlist now merges project + global scopes
  - rule inspection annotated with canonical / legacy / unrecognized state
  - legacy `::` permission rules now normalize into canonical descriptors
  - state-based filtering for rules audit view
  - top-level workflow preset commands:
    - `orca review`
    - `orca debug`
    - `orca architect`
  - `/mode` picker descriptions summarize workflow changes per profile
  - workflow preset command metadata resolved from a single registry
  - workflow preset registry carries structured default policy fields
  - preset-backed mode switches apply default effort / permission policy
  - startup and `/mode` switching share one preset-policy application helper
  - status surfaces expose the active workflow policy combination
  - workflow preset registry now carries tool/output policy surfaced via `/mode` and `/status`
  - model policy surfaced via `/status` and the live status bar
  - startup prompt now composes `mode + preset + effort` from the shared workflow policy contract
  - proxy tool runtime now enforces the active mode whitelist
  - session effort / preset default effort now maps into proxy `reasoning_effort` (`max` → `xhigh`)
  - provider-returned tool calls now hard-fail unless the tool was explicitly advertised
  - non-interactive permission prompts now fail closed instead of silently auto-approving
  - SDK-backed REPL turns now consume the composed session prompt + mapped permission mode
  - env-sensitive cloudflare / aggregator tests were stabilized against local config drift
- Visual shell unification:
  - `src/ui/components/CommandPicker.tsx`
  - `src/ui/components/PermissionPrompt.tsx`
  - `src/ui/components/ThemePicker.tsx`
- Docs rolled forward:
  - `README.md`
  - `USER_EXPERIENCE_MAP.md`
  - `USER_EXPERIENCE_MAP.html`
- Competitive strategy artifacts rolled forward:
  - `SOTA_EXPERIENCE_GAP_REPORT.md`
  - `SOTA_EXPERIENCE_GAP_REPORT.html`
  - `PDCA_EXECUTION_PLAN.md`
  - `PDCA_ITERATION_CHECKLIST.md`
  - `PLATFORM_OPTIMIZATION_PLAN.md`

### Verification

- `npm run lint`
- `npm test`
- `npm run build`

### Result

- Finite-choice Ink/TUI flows now share one interaction grammar instead of mixing static lists, typed follow-up answers, and visually unrelated panels.
- Legacy mode still retains text/number fallback behavior, so the UX upgrade stays low-risk outside the Ink path.
- Latest verification evidence after this tranche:
  - `npm test` => `1450/1450`

## 2026-04-18 — reflect mode

### Scope

Port the spirit of Copilot CLI Rubber Duck into Orca as a renamed `reflect` surface with richer prompt shaping, explicit-first UX, and conservative auto-triggering.

### Delivered

- Added a shared reflect helper:
  - `src/commands/reflect-mode.ts`
  - intent detection for debugging/explanation asks
  - structured prompt shaping around symptom/hypotheses/evidence/root-cause/next-step
- Added a first-class public command:
  - `orca reflect`
- Added REPL surfaces:
  - `/reflect <prompt>`
  - `/mode reflect`
  - help/picker/ink command discovery updated to include `reflect`
- Added built-in persistent mode:
  - `src/modes/registry.ts` now includes `reflect`
- Updated public/canonical docs:
  - `README.md`
  - `PRD.md`
  - `SYSTEM_ARCHITECTURE.md`
  - `USER_EXPERIENCE_MAP.md`
  - `PLATFORM_OPTIMIZATION_PLAN.md`
  - `ROLLING_REQUIREMENTS_AND_PROMPTS.md`
  - `task_plan.md`
  - `notes.md`

### Verification

- `npm run lint`
- `node --experimental-vm-modules node_modules/.bin/vitest run tests/reflect-mode.test.ts tests/program.test.ts tests/command-contracts.test.ts tests/chat-slash-mutations.test.ts tests/chat-repl-turn.test.ts`

### Result

- Orca now has a named, reusable reflection/debugging surface instead of relying on ad hoc prompts.
- The feature is explicit-first (`orca reflect`, `/reflect`, `/mode reflect`) but can still auto-trigger for clear debugging/explanation asks with visible inline feedback.
- The prompt contract is more structured than a plain rubber-duck chat, so the agent is steered toward evidence-backed diagnosis rather than immediate rewrite bias.

## 2026-04-16 — SOTA gate system execution

### Scope

Read the current SOTA gap / difference docs, then turn Orca's existing seeded `agent-eval` assets into a real reproducible gate system with fast / nightly / release bundles.

### Delivered

- Replaced the single-purpose fast-gate execution path with a shared manifest runner:
  - `agent-eval/scripts/run-gate.py`
  - `agent-eval/scripts/run-fast-gate.py` now delegates to the shared runner
- Added canonical gate manifests:
  - `agent-eval/manifests/fast.json`
  - `agent-eval/manifests/nightly.json`
  - `agent-eval/manifests/release.json`
- Added deterministic gate tasks:
  - `gate-lint`
  - `gate-test`
  - `gate-build`
  - `gate-bench`
  - `gate-cli-journey`
- Expanded the local black-box pack from `12` to `14` tasks:
  - `fast-session-delete`
  - `fast-serve-chat-errors`
- Added release artifact recording:
  - `agent-eval/scripts/release-cli-journey.sh`
  - each release run now writes `summary.json`, `summary.md`, transcripts, outcomes, grades, and `manual/release-cli-journey.md`
- Added deterministic manifest-integrity coverage:
  - `tests/agent-eval-manifests.test.ts`
- Added canonical npm entrypoints:
  - `npm run eval:fast`
  - `npm run eval:nightly`
  - `npm run eval:release`
- Rolled forward canonical docs so the gate system is documented in the PRD, UX map, architecture map, optimization plan, notes, and rolling ledger.

### Verification

- `python3 -m py_compile agent-eval/scripts/run-gate.py agent-eval/scripts/run-fast-gate.py`
- `node --experimental-vm-modules node_modules/.bin/vitest run tests/agent-eval-manifests.test.ts`
- `python3 agent-eval/scripts/run-gate.py --manifest fast`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run bench`
- `npm run eval:nightly`
- `npm run eval:release`

### Result

- Orca now has a real tiered SOTA evaluation system instead of a plan plus one hard-coded fast runner.
- Fast gate is executable at `61/61` local black-box tasks and nightly/release bundles are now codified as first-class manifests.

## 2026-04-21 — SOTA gap swarm audit + PDCA refresh

### Scope

Run a multi-lane read-only swarm audit after the benchmark and turn it into a real PDCA closeout with current evidence, not historical artifacts.

### Delivered

- Added a canonical swarm-audit report:
  - `doc/00_project/initiative_orca/SOTA_GAP_SWARM_AUDIT.md`
  - `doc/00_project/initiative_orca/SOTA_GAP_SWARM_AUDIT.html`
- Rolled the audit conclusions into:
  - `PRD.md`
  - `USER_EXPERIENCE_MAP.md`
  - `PLATFORM_OPTIMIZATION_PLAN.md`
  - `PDCA_EXECUTION_PLAN.md`
  - `PDCA_ITERATION_CHECKLIST.md`
  - `task_plan.md`
  - `notes.md`
  - `ROLLING_REQUIREMENTS_AND_PROMPTS.md`
- Refreshed current-slice evidence:
  - nightly gate: `agent-eval/runs/20260421-074245-714923/`
  - release gate: `agent-eval/runs/20260421-074333-249714/`
  - manual CLI smoke: `outputs/manual-cli-smoke/run-20260421-154536/`
- Closed the gate-runner compatibility regression discovered during PDCA check:
  - `agent-eval/scripts/run-gate.py`
  - `agent-eval/scripts/run-test-matrix.py`
  - both now use `timezone.utc` instead of `datetime.UTC`

### Outcome

- Orca’s next tranche is now constrained more tightly than “do Wave 4 continuity”:
  1. trust hardening
  2. canonical `WorkSession` / `TaskRun` objects
  3. async queue + take-over
  4. evidence console
- PDCA evidence for this slice is now current instead of relying on older nightly/release artifacts.
- The audit also made one architectural risk explicit: continuity, queueing, and evidence cannot be shipped credibly if approval/runtime policy remains fragmented across REPL, MCP, and serve.

## 2026-04-21 — trust hardening tranche 1

### Scope

Start with the two highest-yield trust fixes from the audit: safer default REPL approval posture and authentication requirements for non-loopback `serve`.

### Delivered

- `src/config.ts`
  - legacy config `default` now resolves to REPL `auto` instead of `yolo`
- `src/commands/serve.ts`
  - exported `resolveServeAuthToken()`
  - non-loopback `serve` now requires `ORCA_SERVE_TOKEN`
  - authenticated `serve` requests now require `Authorization: Bearer <token>`
- regression coverage:
  - `tests/config.test.ts`
  - `tests/serve-command.test.ts`

### Verification

- targeted:
  - `vitest run tests/config.test.ts tests/serve-command.test.ts`
- repo-level:
  - `npm run lint`
  - `npm test`
  - `npm run build`
- manual:
  - `outputs/manual-cli-smoke/run-20260421-160704/cli-smoke.txt`
  - `outputs/manual-cli-smoke/run-20260421-160704/serve-smoke.txt`

### Outcome

- a fresh REPL session no longer defaults into fail-open `yolo`
- remote/headless `serve` exposure now has a hard authentication gate instead of relying only on operator caution

## 2026-04-21 — trust hardening tranche 2

### Scope

Start the shared policy executor so REPL and MCP no longer have separate normal-tool policy logic.

### Delivered

- added `src/policy-executor.ts`
- moved shared policy concerns into one module:
  - pre-hook handling
  - tool allowlist enforcement
  - approval checks
  - sandbox posture wrapping
- `src/commands/chat-proxy-tool-call.ts`
  - normal tool execution now uses the shared policy executor
- `src/mcp-server.ts`
  - tool calls now use the same shared policy executor
- `src/commands/serve.ts`
  - MCP stdio startup now passes permission mode + allowlist + persisted grants into the shared executor
- regression coverage:
  - `tests/chat-proxy-tool-call.test.ts`
  - `tests/v050-modules.test.ts`

### Verification

- `node --experimental-vm-modules node_modules/.bin/vitest run tests/config.test.ts tests/serve-command.test.ts tests/chat-proxy-tool-call.test.ts tests/v050-modules.test.ts`
- `npm run lint`
- `npm test`
- `npm run build`

### Outcome

- normal tool policy is no longer duplicated between chat and MCP
- dangerous MCP tool calls now fail closed unless a grant already exists
- the remaining trust gap is now narrower and more explicit:
  - special tools still have path-specific handling
  - serve HTTP auth still lives at the transport edge

## 2026-04-21 — Ink entry / home-state UX optimization

### Scope

Improve the primary TUI entry experience so a user can understand the main action, current trust posture, recovery paths, and failure help from the first screen without memorizing slash commands.

### Delivered

- added `src/ui/components/HomePanel.tsx`
- `src/ui/components/App.tsx`
  - empty state now renders a structured home panel instead of the old flat command list
- `tests/ink-ui.test.tsx`
  - home-panel render coverage
  - empty-state integration coverage
- docs rolled forward:
  - `USER_EXPERIENCE_MAP.md`
  - `PRD.md`
- text snapshot evidence:
  - `outputs/ui-smoke/run-20260421-165711/home-panel.txt`

### Validation

- `node --experimental-vm-modules node_modules/.bin/vitest run tests/ink-ui.test.tsx`
- `npm run lint`
- `npm test`
- `npm run build`

Browser-specific validation status for this slice:
- browser console: `N/A`
- network leak inspection: `N/A`
- Lighthouse/performance budget: `N/A`
- responsive screenshots: `N/A`
- reason: this optimization targets Orca's Ink TUI, not a browser frontend

### Outcome

- the entry screen now has one clear primary action: type a concrete task and press Enter
- trust posture is visible before the user starts delegating work
- quick recovery and failure paths are explicit from the first frame
- `Tab` now opens a quick-action picker so the empty state is actionable rather than only descriptive

Context-aware follow-up:

- quick actions now adapt to current trust posture and saved-session availability
- the home panel now surfaces `/sessions` when saved sessions exist
- updated text snapshot evidence:
  - `outputs/ui-smoke/run-20260421-171338/home-panel-dynamic.txt`

### Verification

- `python3 -m py_compile agent-eval/scripts/run-gate.py agent-eval/scripts/run-test-matrix.py agent-eval/scripts/run-secret-scan.py agent-eval/scripts/collect-license-inventory.py agent-eval/scripts/sync-test-matrix.py`
- `node --experimental-vm-modules node_modules/.bin/vitest run tests/test-matrix-runner.test.ts tests/agent-eval-manifests.test.ts tests/test-matrix-sync.test.ts`
- `npm run eval:nightly`
- `npm run eval:release`
- manual CLI smoke:
  - `outputs/manual-cli-smoke/run-20260421-154536/cli-smoke.txt`
  - `outputs/manual-cli-smoke/run-20260421-154536/serve-smoke.txt`
- Release verification now has a defined artifact shape rather than relying on operator memory or ad hoc shell history.
- Latest verification evidence:
  - `npm test` => `1280/1280`
  - `npm run bench` => `10/10`
  - `agent-eval/runs/20260417-012401-427935/summary.json` => fast `61/61`
  - `agent-eval/runs/20260417-012506-286459/summary.json` => nightly `64/64`
  - `agent-eval/runs/20260417-012607-841549/summary.json` => release `67/67`
  - `agent-eval/runs/20260417-011304-326914/manual/release-cli-journey.md` => release CLI journey artifact
  - attacker review of the new eval-system surfaces completed manually after the `security-reviewer` helper shut down before returning

### Security Review

- Scope reviewed:
  - `agent-eval/scripts/run-gate.py`
  - `agent-eval/scripts/release-cli-journey.sh`
  - `agent-eval/tasks/*.json`
  - `agent-eval/manifests/*.json`
- Findings:
  - no critical shell-injection or path-escape issue was found in the new gate system itself
  - the main residual risk is intentional: task JSON is executable trust input because the shared runner launches task commands with `shell=True`
  - tarball-install smoke is safe for trusted local branches, but should not be treated as safe against unreviewed third-party repos

## 2026-04-14 — large-scale test expansion planning

### Scope

Create the canonical planning package for the next Orca CLI quality-expansion program, grounded in the real current baseline and aligned with PDCA plus `agent-eval-system`.

### Delivered

- Locked and refreshed the automated baseline to `1276/1276` passing tests from `npm test`
  - the planning track started from a measured `1263/1263` baseline
  - the first breadth tranche added five deterministic command-contract tests
  - the first depth + packaging tranches added eight more deterministic tests
  - this sequence supersedes the older `1260/1260` checkpoint recorded in the previous maintainability slice
- Generated and filled repo-root `AGENT_EVAL_PLAN.md`
- Updated canonical PDCA docs with:
  - real baseline and historical-doc drift
  - breadth and depth expansion lanes
  - fast / nightly / release gate design
  - refined target structure from the supplemental test-engineer audit:
    - fast: `550-650` selected deterministic cases + `12` eval tasks
    - nightly: `~1700` deterministic cases + `36` eval tasks
    - release: `~2210` deterministic cases + `72` eval tasks
  - task-eval grader target structure (`10-12` graders)
- Added a parallel planning track to `task_plan.md` without overwriting the active `chat.ts` maintainability slice
- Recorded the new quality-program requirement in the rolling ledger
- Corrected concrete critique findings:
  - removed a duplicated serve-diagnostics line from `SYSTEM_ARCHITECTURE.md`
  - softened command-gap wording so existing `serve` smoke coverage and indirect `session` coverage are not overstated as zero
- Initialized `agent-eval/` and replaced generic samples with the first Orca-specific fast-gate pack
  - seeded tasks:
    - `fast-root-help`
    - `fast-session-help`
    - `fast-pr-help`
    - `fast-providers-help`
    - `fast-doctor-json`
    - `fast-serve-health`
  - seeded grader pack:
    - `agent-eval/graders/fast-gate.graders.json`
  - verification run:
    - `ai agent-eval /Users/mauricewen/Projects/orca-cli run`
    - run id `20260415-011603`
    - result `6/6` passed
- Added the first deterministic breadth tranche:
  - `tests/command-contracts.test.ts`
  - covers root public surface plus `session`, `pr`, `providers`, and `serve` command contracts
- Added the first deterministic depth tranche:
  - `tests/session-command.test.ts`
    - corrupted latest-session recovery
    - `ORCA_HOME`-aware session lookup
    - fixed `session` default-action stack overflow
  - `tests/serve-command.test.ts`
    - malformed `/chat` JSON and missing-prompt request coverage
- Added packaging / bin-entry release smokes:
  - `tests/packaging-smoke.test.ts`
  - `npm pack --json --dry-run` now has explicit smoke coverage for shipped dist entrypoints
  - built `dist/bin/orca.js` help + doctor-json behavior now has deterministic regression coverage
- Expanded the `agent-eval` fast gate to the planned `12`-task baseline:
  - added `fast-run-help`
  - added `fast-session-list`
  - added `fast-session-show`
  - added `fast-providers-test-local`
  - added `fast-serve-metadata`
  - added `fast-pack-dry-run`
  - latest run `20260415-020102` passed `12/12`
  - critique hardening added:
    - `agent-eval/scripts/prepare-fast-gate.sh`
    - `agent-eval/scripts/wait-for-http.sh`
    - `agent-eval/scripts/run-fast-gate.py`
    - relative task commands + clean-env serve/providers/doctor scenarios

### Verification

- `npm test`
- `ai agent-eval /Users/mauricewen/Projects/orca-cli plan --owner "Maurice"`

### Result

- Orca CLI now has a canonical large-scale testing plan that starts from the real measured baseline and is currently validated at `1276` tests rather than stale flat-doc counts
- PDCA docs and `AGENT_EVAL_PLAN.md` now point to the same next-step structure, including the priority command-surface gap tranche
- Current release-style validation evidence:
  - `npm test` => `1276/1276`
  - `npm run build`
  - `npm run bench` => `10/10`
  - `ai agent-eval /Users/mauricewen/Projects/orca-cli run` => run id `20260415-012934`, `6/6` passed
- Current fast-gate expansion evidence:
  - `agent-eval/runs/20260415-020102/summary.json`
  - `12/12` fast-gate tasks passed with no pending graders
- The next execution tranche is to expand the agent-eval pack and deeper multi-step scenario families toward the nightly / release gate targets

## 2026-04-14 — REPL slash submission + theme onboarding UX fix

### Scope

Fix the ink REPL behaviors that make slash commands feel invalid during argument entry and make the theme picker reappear despite an existing saved theme.

### Delivered

- REPL submission fix:
  - `src/ui/utils.ts`
    - command picker visibility now stops at the slash command token
    - once argument-entry whitespace begins, Enter returns to normal input submission
    - slash picker matching now stays aligned with slash-command dispatch case-insensitively (`/H`, `/Help`, etc.)
- Theme onboarding fix:
  - `src/ui/theme.tsx`
    - added explicit detection for configured theme preference from `ORCA_THEME` or `~/.orca/theme`
    - switched persisted-theme file reads to ESM-safe `node:fs` access so runtime theme detection matches tests
    - made theme context stateful so a newly selected theme applies immediately in the active ink session
  - `src/ui/components/App.tsx`
    - first-launch theme picker now respects persisted theme preference instead of only checking `ORCA_THEME`
    - theme selection now updates the current session before persisting `~/.orca/theme`
- Regression coverage:
  - `tests/ui-utils.test.ts`
    - picker stays visible for token-only slash prefixes
    - picker stays visible for uppercase slash prefixes that still resolve at dispatch time
    - picker hides for slash commands once argument entry begins
    - persisted `~/.orca/theme` counts as a valid onboarding-suppression signal
  - `tests/ink-ui.test.tsx`
    - theme selection updates the rendered theme immediately without requiring a restart

### Verification

- `npx vitest run tests/ui-utils.test.ts tests/ink-ui.test.tsx tests/chat-slash-readonly.test.ts tests/chat-slash-mutations.test.ts`
- `npm run lint`
- `npm test`
- `npm run build`

### Result

- slash commands with arguments no longer lose their arguments to picker Enter-handling
- slash autocomplete remains consistent with case-insensitive slash-command dispatch
- saved theme preference suppresses the onboarding picker on subsequent launches
- selecting a theme updates the active session immediately instead of waiting for restart
- targeted regression suite passed (`67/67`)
- full test suite passed
- `build` passed

## 2026-04-14 — ink UI CC-parity behavior-accuracy remediation

### Scope

Re-audit Orca's ink UI against CC reference sources, separate report drift from real source gaps, and land the highest-value behavior-accuracy fixes with regression coverage.

### Delivered

- Source re-audit outcome:
  - confirmed that most report-v3 P0/P1 items were already implemented in `src/ui/**`
  - narrowed remaining real gaps to viewport measurement, alt-screen timing, and ASCII-only word semantics
- UI/runtime fixes:
  - `src/ui/components/ScrollBox.tsx`
    - viewport height now comes from the rendered flex container, not terminal rows
    - imperative handle now exposes `getScrollHeight()` and `getViewportHeight()`
  - `src/ui/components/AlternateScreen.tsx`
    - alt-screen entry/cleanup now run in a pre-paint effect path
  - `src/ui/cursor.ts`
    - Unicode-aware word boundaries for movement and deletion
  - `src/ui/useTerminalSize.tsx`
    - shared `SIGWINCH` fallback subscription to prevent listener buildup
- Regression tests:
  - `tests/ink-ui.test.tsx`: flex-layout `ScrollBox` regression
  - `tests/cursor.test.ts`: Unicode word-boundary regression
- Canonical docs:
  - corrected `PROJECT_DIR` in `SYSTEM_ARCHITECTURE.md` and `USER_EXPERIENCE_MAP.md`
  - logged the correction in `ROLLING_REQUIREMENTS_AND_PROMPTS.md`
- File-expansion hardening:
  - `src/commands/chat.ts`
    - unified normalization for quoted paths, shell-escaped spaces, and `%20` file URLs
    - embedded expansion now reaches the existing preprocess pipeline for drag-pasted file paths with spaces
  - `tests/chat-file-expansion.test.ts`
    - direct helper-level coverage for the new path forms
  - directory expansion now also supports quoted / shell-escaped project paths with spaces
- Security hardening:
  - `src/preprocess/convert.ts`
    - replaced shell-built converter invocations with `execFileSync(...args)`
  - `src/agent/worktree.ts`
    - replaced shell-built git worktree/merge/delete calls with argument-array execution
  - `src/tools.ts`
    - replaced shell-built `git_commit` staging/commit with argument-array execution
  - `src/commands/chat.ts`
    - removed shell interpolation from project-tree generation
- IDE integration:
  - added `integrations/vscode-orca/`
  - command surface includes chat, current-file analysis, selection review, MCP launch, and doctor
  - terminal launch path is argv-safe and dependency-free
- Multimodal one-shot:
  - `src/providers/openai-compat.ts`
    - proxy provider layer now accepts prompt content parts (`text` + `image_url`)
  - `src/commands/chat.ts`
    - `orca chat --image <path...> "prompt"` builds data-URL image parts from local files
  - SDK path remains text-only and errors explicitly if used with `--image`
  - history/budget/session compatibility layer now flattens multimodal content safely where text-only surfaces still exist
- `chat.ts` decomposition:
  - added `src/commands/chat-input.ts`
  - added `src/commands/chat-slash-readonly.ts`
  - added `src/commands/chat-proxy-tool-call.ts`
  - added `src/commands/chat-slash-mutations.ts`
  - added `src/commands/chat-repl-async-slash.ts`
  - added `src/commands/chat-repl-turn.ts`
  - first extracted helpers:
    - safe `/git` argv parsing
    - image prompt construction for `--image`
  - expanded extraction:
    - file expansion / project bootstrap / multi-model prompt prep now also live in `chat-input.ts`
  - added `src/commands/chat-support.ts` for config + persistence helpers
  - read-only slash/display/status flows now live in `chat-slash-readonly.ts`
    - `/help`
    - read-only `/model` + `/models`
    - `/history`, `/tokens`, `/stats`, `/cwd`
    - `/diff`, `/git`
    - `/sessions`, `/jobs`
    - `/cost`, `/status`, `/doctor`, `/config`, `/providers`
  - `handleSlashCommand()` now delegates this tranche and uses an explicit typed slash-result union instead of `as string` dispatch casts
  - the remaining mutating/session slash flows now live in `chat-slash-mutations.ts`
    - model switching, clear/compact/system/hooks
    - async slash sentinels for `/council`, `/race`, `/pipeline`, `/mission`, `/plan`
    - session persistence / continue / undo
    - `/commit`, `/review`, `/pr` fallthrough behavior
    - `/mcp`, `/thread`, `/init`, `/notes`, `/postmortem`, `/prompts`, `/learn`
  - `runProxyTurn()` now delegates its tool callback to `chat-proxy-tool-call.ts`
    - dangerous-tool permission gating + diff previews
    - `PreToolUse`
    - sub-agent / `ask_user` / MCP / `sleep` routing
    - retry intelligence / error classifier / loop detector / postmortem / auto-verify / context guard
  - `runREPL()` now delegates async slash follow-up execution to `chat-repl-async-slash.ts`
    - `/council`, `/race`, `/pipeline`
    - `/mission`
    - `/plan`
  - `runREPL()` now delegates the normal prompt turn lifecycle to `chat-repl-turn.ts`
    - multi-task hinting
    - `UserPromptSubmit` hook gating
    - file expansion + cognitive skeleton injection
    - pre-send compaction
    - abort/progress lifecycle
    - proxy/SDK turn dispatch
    - 413 auto-recovery retry
    - post-turn compaction + session autosave
- Refactor regression coverage:
  - added `tests/chat-slash-readonly.test.ts`
  - added `tests/chat-proxy-tool-call.test.ts`
  - added `tests/chat-slash-mutations.test.ts`
  - added `tests/chat-repl-async-slash.test.ts`
  - added `tests/chat-repl-turn.test.ts`
  - helper extraction now has direct coverage for readonly markdown output, proxy tool orchestration, mutating slash fallthrough/state-reset behavior, async REPL slash follow-up, and the normal REPL prompt turn lifecycle

### Verification

- `npm run lint`
- `node --experimental-vm-modules node_modules/.bin/vitest run tests/cursor.test.ts tests/ink-ui.test.tsx`
- `node --experimental-vm-modules node_modules/.bin/vitest run tests/chat-file-expansion.test.ts tests/file-expansion.test.ts`
- `node --experimental-vm-modules node_modules/.bin/vitest run tests/chat-file-expansion.test.ts`
- `node --experimental-vm-modules node_modules/.bin/vitest run tests/adversarial.test.ts tests/preprocess.test.ts tests/phase1-agent.test.ts`
- `node --experimental-vm-modules node_modules/.bin/vitest run tests/vscode-extension.test.ts`
- `node --experimental-vm-modules node_modules/.bin/vitest run tests/openai-compat-multimodal.test.ts tests/chat-image-option.test.ts tests/provider-stream-resilience.test.ts tests/agent-loop.test.ts`
- `node --experimental-vm-modules node_modules/.bin/vitest run tests/openai-compat-multimodal.test.ts tests/chat-image-option.test.ts tests/context-protection.test.ts tests/provider-stream-resilience.test.ts tests/agent-loop.test.ts`
- `node --experimental-vm-modules node_modules/.bin/vitest run tests/chat-git-command.test.ts tests/chat-image-option.test.ts tests/openai-compat-multimodal.test.ts tests/chat-file-expansion.test.ts`
- `node --experimental-vm-modules node_modules/.bin/vitest run tests/chat-git-command.test.ts tests/chat-image-option.test.ts tests/chat-file-expansion.test.ts tests/openai-compat-multimodal.test.ts tests/vscode-extension.test.ts`
- `node --experimental-vm-modules node_modules/.bin/vitest run tests/chat-slash-readonly.test.ts tests/chat-git-command.test.ts tests/chat-image-option.test.ts tests/chat-file-expansion.test.ts`
- `node --experimental-vm-modules node_modules/.bin/vitest run tests/chat-proxy-tool-call.test.ts tests/chat-slash-readonly.test.ts tests/chat-git-command.test.ts tests/chat-image-option.test.ts tests/chat-file-expansion.test.ts`
- `node --experimental-vm-modules node_modules/.bin/vitest run tests/chat-slash-mutations.test.ts tests/chat-proxy-tool-call.test.ts tests/chat-slash-readonly.test.ts tests/chat-git-command.test.ts tests/chat-image-option.test.ts tests/chat-file-expansion.test.ts`
- `node --experimental-vm-modules node_modules/.bin/vitest run tests/chat-repl-async-slash.test.ts tests/chat-slash-mutations.test.ts tests/chat-proxy-tool-call.test.ts tests/chat-slash-readonly.test.ts tests/chat-git-command.test.ts tests/chat-image-option.test.ts tests/chat-file-expansion.test.ts`
- `node --experimental-vm-modules node_modules/.bin/vitest run tests/chat-repl-turn.test.ts`
- `npm test`
- `npm run build`

### Result

- `lint` passed
- targeted UI regression suite passed (`83/83`)
- targeted file-expansion suite passed (`70/70`)
- full test suite passed (`1206/1206`)
- full test suite passed (`1212/1212`) after file-expansion hardening
- targeted directory-expansion follow-up passed (`8/8`)
- full test suite passed (`1214/1214`) after directory-path hardening
- targeted shell-hardening suite passed (`134/134`)
- full test suite passed (`1216/1216`) after shell-hardening
- targeted VS Code skeleton suite passed (`3/3`)
- full test suite passed (`1219/1219`) after VS Code skeleton follow-up
- targeted multimodal suite passed (`36/36`)
- full test suite passed (`1226/1226`) after multimodal one-shot follow-up
- targeted multimodal compatibility suite passed (`78/78`)
- full test suite passed (`1227/1227`) after multimodal history/budget follow-up
- targeted helper-extraction suite passed (`16/16`)
- full test suite stayed green (`1227/1227`) after partial `chat.ts` extraction
- targeted extraction suite passed (`19/19`) after `chat-input.ts` / `chat-support.ts` expansion
- full test suite passed (`1238/1238`) after extraction follow-up
- targeted readonly-slash extraction suite passed (`18/18`)
- full test suite passed (`1242/1242`) after `chat-slash-readonly.ts` extraction
- targeted proxy/helper extraction suite passed (`22/22`)
- full test suite passed (`1246/1246`) after `chat-proxy-tool-call.ts` extraction
- targeted mutating-slash extraction suite passed (`26/26`)
- full test suite passed (`1250/1250`) after `chat-slash-mutations.ts` extraction
- targeted async-REPL-slash extraction suite passed (`30/30`)
- full test suite passed (`1254/1254`) after `chat-repl-async-slash.ts` extraction
- targeted REPL-turn extraction suite passed (`6/6`)
- full test suite passed (`1260/1260`) after `chat-repl-turn.ts` extraction
- `build` passed

### Remaining Risks

- Orca still does not implement CC's broader `ScrollBox.scrollToElement()` + virtualization stack; current fix addresses the real flex-viewport bug, not the whole CC scroll architecture.
- Interactive image paste / multimodal paste handling remains out of scope for this round.
- Saved-session history and compaction are now multimodal-compatible by text flattening, but not yet rich multimodal replay.
- IDE integration now has a real skeleton, but richer editor-native UX is still open.
- `chat.ts` is now slimmer, and the read-only slash tranche, proxy tool callback, mutating slash flows, async REPL slash follow-up, and normal REPL turn lifecycle are split out, but the remaining `runREPL` input/discovery/dispatch front-half still remains the main maintainability hotspot.
- Spinner theming and tool-error rendering are still Orca-specific approximations, not a byte-for-byte CC port.

## Scope

Internalize the first Hermes-inspired runtime capability bundle into Orca CLI and keep canonical project docs in sync.

## Delivered

- Root governance files: `AGENTS.md`, `CLAUDE.md`, `CODEX.md`, `GEMINI.md`
- Git hygiene update: `.gitignore` now ignores `.omx/`
- Canonical project doc tree under `doc/00_project/initiative_orca/`
- Initial PRD, architecture summary, CLI UX map, optimization plan, and workflow assets
- Review follow-up:
  - 7 complete `.html` companions regenerated from canonical `.md` files
  - `CODEX.md` and `GEMINI.md` reduced to canonical references to avoid drift
  - `git_commit` non-repo failure path hardened to keep git stderr inside the tool result
  - Regression coverage added for `git_commit` in non-repo directories
- Hermes-inspired runtime bundle:
  - tool arg coercion for stringified number/boolean/array tool inputs
  - oversized tool result persistence to `~/.orca/tool-results/`
  - background job tracking + completion notifications via `src/background-jobs.ts`
  - REPL `/jobs` view for tracked detached work
- Model/provider ergonomics bundle:
  - `src/model-catalog.ts` centralizes model metadata
  - `/model` now shows provider, context, pricing, and caution notes
  - `/models` now lists provider-aware choices instead of a hard-coded Poe-only set
  - `orca providers` now shows the same context/pricing/caution metadata before a session starts
- Centralized logging bundle:
  - `src/logger.ts` writes local runtime logs under `~/.orca/logs/` or `$ORCA_HOME/logs/`
  - `orca logs` and `orca logs errors` surface recent log entries
  - key runtime warning/error/info events now persist beyond the terminal session
- Doctor diagnostics bundle:
  - `src/doctor.ts` gathers provider/config/hook/MCP/session/background-job/log diagnostics
  - `orca doctor` and `orca doctor --json` expose that state directly
  - malformed JSON config files are reported explicitly through doctor diagnostics instead of relying on generic terminal noise
- Serve observability bundle:
  - `orca serve` now reuses doctor/model-catalog metadata in `/health`, `/providers`, and `/doctor`
  - headless clients can inspect the same runtime state surfaces as CLI users
- Stats dashboard bundle:
  - `orca stats` now combines usage/cost, runtime health, and recent error summaries
- SDK boundary:
  - `MARUCIE-open-agent-sdk` reviewed repeatedly but still intentionally unchanged
  - Current Hermes-inspired slices remain Orca-local runtime ergonomics rather than shared provider-neutral SDK seams
- SDK boundary:
  - `MARUCIE-open-agent-sdk` reviewed but not changed; this bundle remains Orca-local for now

## Verification

- Structure verification:
  - `find doc/00_project -maxdepth 3 -type f | sort`
- Repo verification:
  - `npm run lint`
  - `npm test`
  - `npm run build`
  - `npm run bench`
  - `node dist/bin/orca.js --help`
  - `node --experimental-vm-modules node_modules/.bin/vitest run tests/adversarial.test.ts tests/protocol.test.ts`
  - `node --experimental-vm-modules node_modules/.bin/vitest run tests/hermes-runtime.test.ts`
  - `node --experimental-vm-modules node_modules/.bin/vitest run tests/model-catalog.test.ts`
  - `node --experimental-vm-modules node_modules/.bin/vitest run tests/model-catalog.test.ts tests/providers-command.test.ts`
  - `node --experimental-vm-modules node_modules/.bin/vitest run tests/logger.test.ts tests/logs-command.test.ts tests/program.test.ts`
  - `OPENAI_API_KEY=test-openai-key ORCA_PROVIDER=openai node dist/bin/orca.js providers`
  - `ORCA_HOME=$(mktemp -d) node dist/bin/orca.js logs`
  - `node --experimental-vm-modules node_modules/.bin/vitest run tests/doctor-command.test.ts`
  - `OPENAI_API_KEY=test-openai-key ORCA_PROVIDER=openai node dist/bin/orca.js doctor --json`
  - `node --experimental-vm-modules node_modules/.bin/vitest run tests/serve-command.test.ts`
  - `node --experimental-vm-modules node_modules/.bin/vitest run tests/stats-command.test.ts`
- Result:
  - `lint` passed
  - `test` passed (`426/426`)
  - `build` passed
  - `bench` passed (`10/10`, `100%`)
  - CLI help smoke test passed
  - Targeted regression rerun passed (`34/34`)
  - Hermes runtime targeted suite passed (`3/3`)
  - Model catalog targeted suite passed (`4/4`)
  - Provider command targeted suite passed (`5/5`)
  - Built provider listing smoke test passed
  - Logger/logs command targeted suite passed (`12/12`)
  - Built logs command smoke test passed
  - Doctor command targeted suite passed (`1/1`)
  - Built doctor command smoke test passed
  - Serve command targeted suite passed (`1/1`)
  - Stats command targeted suite passed (`1/1`)

## Remaining Risks

- Legacy flat docs in `doc/` still exist and may need deliberate migration or cross-link maintenance
- Runtime code changed only in the `git_commit` stderr-handling path, and that path is now covered by both targeted and full-suite verification
- No known blocking issues remain from this Hermes-internalization branch

## 2026-04-20 · REPL Multimodal Image Paths（Completed）

### Delivered

- `src/commands/chat-input.ts`
- `src/commands/chat-repl-turn.ts`
- `src/commands/chat.ts`
- `tests/chat-image-option.test.ts`
- `tests/chat-repl-turn.test.ts`
- `tests/chat-internals.test.ts`
- `README.md`

### Outcome

- `orca chat` REPL now accepts arbitrary local image paths directly in the prompt text on the proxy path.
- Multiple images in one turn are converted into multimodal `PromptContent` instead of being file-expanded as text.
- Quoted paths and shell-escaped spaces are supported.
- Proxy-turn history now preserves multimodal user content, so follow-up turns can still refer to the attached images.

### Not Built

- Clipboard bitmap paste / direct image paste into the ink REPL is still out of scope.
- Native SDK path still does not support multimodal content; images require the existing proxy-provider path.

### Verification

- `node --experimental-vm-modules node_modules/.bin/vitest run tests/chat-image-option.test.ts tests/chat-repl-turn.test.ts tests/chat-internals.test.ts tests/openai-compat-multimodal.test.ts tests/context-protection.test.ts`
- `npm run lint`
- `npm test` => `1371/1371`
- `npm run build`
- `npm run bench` => `10/10`, `100%`

## 2026-04-21 · SOTA SOP Benchmark (Completed)

### Delivered

- benchmark matrix for:
  - Claude Code
  - OpenAI Codex
  - Amp
  - OpenCode
  - Cursor
  - GitHub Copilot coding agent
- canonical doc updates:
  - `PRD.md`
  - `USER_EXPERIENCE_MAP.md`
  - `PLATFORM_OPTIMIZATION_PLAN.md`
  - companion `.html` files where required

### Outcome

- Orca’s largest remaining SOTA gap is no longer workflow labeling or basic trust UX; it is continuity across terminal / web / IDE plus detached execution with visible evidence.
- Benchmark conclusion now sets the next priority order as:
  1. Wave 4 continuity surfaces
  2. async execution queue + resumable take-over
  3. inspect-and-act evidence console
- The benchmark also confirmed that the dominant SOTA SOP is:
  - durable session/thread object
  - explicit approval / review gate
  - detached or remote execution surface
  - human review before merge/apply
  - visible evidence/log/timeline surface

### Verification

- Source review completed against official docs / release notes within the 12-month evidence window where available
- Canonical docs rolled forward for benchmark conclusions:
  - `PRD.md`
  - `USER_EXPERIENCE_MAP.md`
  - `PLATFORM_OPTIMIZATION_PLAN.md`

## 2026-04-21 · Wave 4a Continuity Foothold (Completed)

### Delivered

- stable REPL `sessionId`
- `/status` and live status visibility for the current session id
- `orca -c <id>` for exact session resume
- headless continuity discovery endpoints:
  - `GET /sessions`
  - `GET /sessions/latest`
  - `GET /sessions/:id`

### Outcome

- Orca now has a first durable session-object continuity surface rather than only local autosave files.
- The current session id is visible to the operator in-session.
- The CLI can now target a specific saved session instead of only “latest”.
- Headless/web/IDE clients now have a read-only discovery API for saved sessions.
- That continuity API is now explicitly local/trusted-only:
  - `/health` no longer exposes session metadata
  - no wildcard CORS for arbitrary origins
  - `GET /sessions` and `GET /sessions/latest` are loopback-only

### Verification

- `node --experimental-vm-modules node_modules/.bin/vitest run tests/serve-command.test.ts tests/session-command.test.ts tests/chat-slash-readonly.test.ts tests/ink-ui.test.tsx tests/chat-repl-turn.test.ts`

## 2026-04-21 · Layered Test Matrix (Completed)

### Delivered

- executed test-evidence bundle under:
  - `outputs/test-matrix/run-20260421-134924/`
- matrix artifact:
  - `outputs/test-matrix/run-20260421-134924/matrix.md`
- repo-native layer scripts:
  - `test:static`
  - `test:unit`
  - `test:contract`
  - `test:integration`
  - `test:e2e`
  - `test:security`
  - `test:resilience`
  - `test:performance`
  - `test:ai-eval-fast`
  - `test:matrix`
  - `test:matrix:sync`
- helper scripts:
  - `agent-eval/scripts/run-test-matrix.py`
  - `agent-eval/scripts/run-secret-scan.py`
  - `agent-eval/scripts/collect-license-inventory.py`
  - `agent-eval/scripts/sync-test-matrix.py`
- single-source manifest:
  - `agent-eval/manifests/test-matrix.json`
- generated snippet:
  - `agent-eval/generated/test-matrix-entrypoints.md`
- latest runner-produced evidence:
  - `outputs/test-matrix/run-20260421-065329/`
  - `outputs/test-matrix/run-20260421-065329/matrix.md`
- execution hardening follow-up:
  - `agent-eval/manifests/test-matrix.json` now stores typed `steps[].argv` arrays instead of shell command strings
  - `run-test-matrix.py` now executes steps directly without `shell=True`
  - runner now rejects unknown `--layers` selections instead of silently succeeding with an empty row set
  - fresh runner-produced evidence:
    - `outputs/test-matrix/run-20260421-072634/`
    - `outputs/test-matrix/run-20260421-072634/matrix.md`

### Outcome

- Orca now has an explicit layered test matrix with real commands and real evidence, not just an informal “run lint/test/build” habit.
- The matrix is now runnable from repo-native scripts instead of depending on hand-curated shell snippets.
- The matrix metadata is now sourced from one manifest instead of hardcoded Python constants.
- The manifest is now a typed command-spec surface instead of a repo-owned shell-string surface.
- The matrix makes the current boundary clear:
  - unit/contract/integration/e2e/resilience/AI-eval are real and runnable
  - static/security/performance are only partially institutionalized
- The matrix also makes release strategy explicit:
  - PR: incremental relevant suites + required static gates
  - main/nightly: full regression + security/perf follow-through
  - release: `eval:release` + real smoke/observability evidence
- Attacker-review fixes are included in the runner path:
  - `run-test-matrix.py` no longer allows path-traversal `run-id`
  - `run-secret-scan.py` no longer follows symlinks out of repo root
  - `..` is now explicitly rejected as a run id because dot characters are disallowed entirely
  - `run-test-matrix.py` no longer shells manifest layer commands through `shell=True`

### Verification

- static:
  - `npm run lint`
  - `npm run build`
  - `npm ls --depth=0`
  - heuristic secret scan
  - license inventory
- unit:
  - `vitest run tests/config.test.ts tests/model-catalog.test.ts tests/output.test.ts tests/command-picker.test.ts`
- contract:
  - `vitest run tests/protocol.test.ts tests/command-contracts.test.ts tests/agent-eval-manifests.test.ts tests/serve-command.test.ts`
- integration:
  - `vitest run tests/integration.test.ts tests/session-command.test.ts tests/providers-command.test.ts tests/mcp-client.test.ts`
- e2e:
  - `vitest run tests/e2e-workflow.test.ts tests/complex-scenarios.test.ts tests/mission.test.ts`
- security:
  - `vitest run tests/adversarial.test.ts tests/context-protection.test.ts tests/chat-proxy-tool-call.test.ts tests/permissions-command.test.ts`
  - `npm audit --omit=dev --json`
- performance:
  - `node dist/bin/orca.js bench --json`
  - `vitest run tests/bench.test.ts`
- resilience:
  - `vitest run tests/provider-stream-resilience.test.ts tests/agent-loop.test.ts tests/hermes-runtime.test.ts tests/chat-repl-turn.test.ts`
- ai eval:
  - `npm run eval:fast`
