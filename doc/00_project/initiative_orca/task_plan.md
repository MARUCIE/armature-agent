# Task Plan

## 2026-04-29 - SOTA Swarm Audit, Queue, and Trust PDCA

### Objective

Run a SOTA swarm audit for Orca, publish the routed audit report, convert findings into milestones and atomic queue items, then execute the first PDCA tranche.

### Milestones

| Milestone | Goal | Status | Exit Criteria |
| --- | --- | --- | --- |
| M0 Trust hardening | Close repo-local hook and network-tool trust gaps | Done | Explicit project hook trust, network tools approval-gated, targeted tests green |
| M1 Queue visibility | Expose current TaskRun state to operators | Done | `orca queue list/show/follow/takeover` shipped with tests |
| M2 Unified execution contract | Align `chat`, `run`, `serve`, mission, and planner on one run object | Partial | `run` and `serve /chat` now write canonical run records; chat/mission/planner remain |
| M3 Evidence console | Make review-before-apply inspectable | Partial | `orca queue evidence` opens TaskRun logs/diffs/artifacts with metadata and previews; deeper Ink side-panel integration remains |
| M4 Gate integrity | Make CI enforce documented gates | Pending | Matrix/security/performance/eval checks run in CI |
| M5 Model catalog SSoT | Eliminate model metadata drift | Pending | Runtime, picker, docs, and tests use one catalog |

### Atomic Task Queue

| ID | Priority | Task | Status |
| --- | --- | --- | --- |
| ORCA-SWARM-001 | P0 | Require explicit trust before loading repo-local hooks | Done |
| ORCA-SWARM-002 | P0 | Stop inheriting provider API keys into hook subprocess env | Done |
| ORCA-SWARM-003 | P0 | Approval-gate `fetch_url` and `web_search` in auto mode | Done |
| ORCA-SWARM-004 | P0 | Block loopback/private/link-local `fetch_url` targets | Done |
| ORCA-SWARM-005 | P1 | Add `orca queue list/show` over TaskRun records | Done |
| ORCA-SWARM-006 | P1 | Add `queue follow` for live logs and evidence | Done |
| ORCA-SWARM-007 | P1 | Add `queue takeover` lease model | Done |
| ORCA-SWARM-008 | P1 | Convert `serve /chat` into a canonical run endpoint | Done |
| ORCA-SWARM-009 | P1 | Add TaskRun evidence drawer in TUI | Done |
| ORCA-SWARM-010 | P1 | Centralize slash-command registry | Pending |
| ORCA-SWARM-011 | P2 | Align README/doc test counts to current suite evidence | Pending |
| ORCA-SWARM-012 | P2 | Add CI matrix/security/performance/eval gate enforcement | Pending |

### First Tranche Verification

- `npm test -- tests/hooks.test.ts tests/hooks-compat.test.ts tests/tools.test.ts tests/chat-proxy-tool-call.test.ts tests/v030-harness.test.ts tests/v050-modules.test.ts` -> `153` tests passed.
- `npm test -- tests/queue-command.test.ts tests/program.test.ts tests/command-contracts.test.ts tests/work-session-store.test.ts` -> `37` tests passed.
- Combined targeted pack -> `190` tests passed.
- `npm run lint` -> pass.
- `npm run build` -> pass.
- `queue takeover` targeted regression -> `9` tests passed across `2` files.
- `serve /chat` canonical run regression -> `15` tests passed across `2` files.
- `queue evidence` drawer regression -> `11` tests passed across `2` files.
- Final `npm test` -> `1602` tests passed across `86` files.
- `node dist/bin/orca.js --version` -> `0.8.5`.
- `node dist/bin/orca.js queue takeover <fixture-task-run> --holder smoke --ttl 30s` -> acquired a TaskRun lease.
- `orca queue evidence <task-run-id>` shows typed evidence entries, absolute paths, size, update time, missing-file state, and capped tail previews.

### Report

- Canonical report: `doc/00_project/initiative_orca/SOTA_GAP_SWARM_AUDIT.md`
- Routed HTML companion: `doc/00_project/initiative_orca/SOTA_GAP_SWARM_AUDIT.html`

## Active Task

- Task: One-click full delivery for the current trust-policy + eval tranche
- Status: completed
- Started: 2026-04-22
- Completed: 2026-04-22

## Task Boundary

- Goal:
  - package the current trust-policy + eval tranche into a Harness-grade release bundle with fresh green evidence, documented gates, explicit rollback, and a closed RCA loop for the security/review findings raised during the pass
- Non-goals:
  - no new Wave 4 product feature build-out
  - no browser-first UX work
  - no backward-compatibility shims
  - no mock-only verification
- User value:
  - current Orca baseline becomes release-auditable instead of “green but informally assembled”
  - trust-policy behavior across REPL / MCP / serve is explicit and fail-closed
  - release, observe, and learn stages all have durable evidence paths
- Constraints:
  - canonical docs stay under `doc/00_project/initiative_orca/`
  - existing green baseline is the floor
  - keep diffs small, reversible, and reviewable
  - do not weaken current auth / loopback / approval boundaries while fixing MCP and serve issues
- Success metrics:
  - `npm test` green on the latest source (`1553/1553`)
  - fresh `eval:fast`, `eval:nightly`, and `eval:release` runs are green
  - `test:matrix` refreshed with all layer exit codes `0`
  - no unresolved `critical` or `high` security findings remain for this delivery scope
  - rollback path is executable against the scoped repo-impacting diff
- Risk level:
  - `medium` before review
  - reduced to `low-to-medium` after the MCP / allowlist / serve hardening fixes and final gate rerun

## P0 / P1 Acceptance

### P0

- [x] direct deterministic suite green on latest code
- [x] fresh nightly and release gates green
- [x] security review has no unresolved `critical` or `high` findings in this delivery scope
- [x] rollback path is defined and verified
- [x] canonical docs and deliverable reflect shipped behavior

### P1

- [x] fast gate refreshed on latest code
- [x] layered test matrix refreshed with evidence paths per layer
- [x] pack/install/bench/audit evidence refreshed into stage outputs
- [x] PDCA / task / notes / handoff updated to the real current baseline
- [x] DNA capsule candidates captured for follow-on reuse

## Phase Plan

| Phase | Inputs | Artifacts | Gate | Evidence Path |
| --- | --- | --- | --- | --- |
| Spec | canonical docs, latest gate evidence, active worktree | execution spec + task boundary | scope frozen | `outputs/spec/2026-04-22-one-click-full-delivery-spec.md` |
| Build | trust-policy findings, current source, existing tests | scoped runtime/test/doc fixes | targeted regressions green | `outputs/build/2026-04-22-build-scope.md` |
| Test | lint/test/build/matrix/gates | refreshed verification bundle | all required commands exit `0` | `outputs/test/2026-04-22-test-evidence.md` |
| Security | attacker review, policy review, `npm audit`, matrix security layer | security readiness verdict | no unresolved `critical`/`high` blockers | `outputs/security/2026-04-22-security-readiness.md` |
| Release | pack/install, bench, release gate, rollback plan | release readiness verdict + rollback patch | release checklist all pass | `outputs/release/2026-04-22-release-readiness.md` |
| Observe | logs/stats/doctor/session/eval artifacts | observability verdict | operator evidence surface mapped | `outputs/observe/2026-04-22-observe-verdict.md` |
| Learn | RCA, remaining risks, anti-regression notes | DNA capsule candidates + follow-up owners | all residual risks have owner/deadline/mitigation | `outputs/learn/2026-04-22-dna-capsule-candidates.md` |

## Supervision Iterations

### Round 1

- Hypothesis:
  - the repo is already functionally green, so the real task is to turn the current tranche into a full delivery package rather than to start a new feature
- Action:
  - re-read canonical docs
  - restore `.omx` state
  - spawn planning / verification / code-review / security-review subagents
- Validation:
  - planning synthesis aligned the task to current trust-policy + eval delivery, not Wave 4 feature build-out
  - verification baseline showed direct tests and gates were recoverable and current
- Learning:
  - the correct delivery object is the current tranche, not the future roadmap
- Next:
  - use review/security findings as the real release gate, not just historical green tests

### Round 2

- Hypothesis:
  - any true blocker left in the tranche will be a trust-policy or governance gap, not a general runtime failure
- Action:
  - run attacker/policy review
  - collect pack/bench/audit evidence
  - compare review findings against current code and tests
- Validation:
  - security review surfaced real blockers:
    - repo-local MCP autospawn on startup
    - empty allowlist fail-open
    - hook system messages on stdout breaking MCP framing
    - unbounded `/chat` request bodies
    - global config test isolation risk
- Learning:
  - green tests were necessary but not sufficient; the release gate had to absorb the review findings as first-class blockers
- Next:
  - land the smallest security/runtime fixes and rerun the full verification chain

### Round 3

- Hypothesis:
  - the release blockers can be fixed without redesigning the runtime if we constrain ourselves to provenance-aware MCP autoconnect, fail-closed allowlists, stderr-safe hook notices, and request-size bounds
- Action:
  - implement startup-safe MCP autoconnect
  - preserve explicit project MCP connect
  - make `allowedTools: []` deny-all
  - filter MCP `tools/list`
  - move hook system messages to `stderr`
  - cap `/chat` body size and return `413`
  - sandbox global config tests
- Validation:
  - targeted regressions passed: `100/100`
  - full suite passed: `1553/1553`
- Learning:
  - trust-policy contract is now aligned across chat / MCP / serve without broad code churn
- Next:
  - rerun matrix + nightly + release, then write the stage outputs and rollback artifact

### Round 4

- Hypothesis:
  - after the security/runtime fixes, all release-grade gates should go green together and support a single delivery verdict
- Action:
  - rerun `lint`, `test`, `build`, `test:matrix:sync`, `test:matrix`, `eval:nightly`, and `eval:release`
  - refresh pack/audit/bench evidence
  - generate rollback and learn artifacts
- Validation:
  - `npm test` → `1553/1553`
  - `test:matrix` → `run-20260422-061719`
  - `eval:nightly` → `20260422-061814-339289`
  - `eval:release` → `20260422-061914-913077`
- Learning:
  - matrix `partial-pass` rows remain intentional manifest semantics, not execution failures
- Next:
  - close task docs, PDCA, runtime state, and final deliverable
## Completed Slice (2026-04-22 · verification refresh)
1. Reconcile the stale `ralph` / handoff / task header state against the newer 2026-04-21 and 2026-04-22 trust-policy, continuity, and hook slices.
2. Fix the minimum blocker preventing the harness lanes from staying green after the Cloudflare dual-auth path landed.
3. Refresh canonical evidence for direct test, layered matrix, and fast / nightly / release gates.
4. Roll the RCA and latest run ids into the canonical task artifacts so the next continuation starts from the real current baseline.

### Acceptance Criteria For This Slice
- The aggregator / matrix regressions reproduce, are root-caused, and are fixed with a minimal reversible change.
- `npm run lint`, targeted verification, `npm run build`, `npm test`, `npm run test:matrix`, `npm run eval:fast`, `npm run eval:nightly`, and `npm run eval:release` all have fresh evidence after the fix.
- `task_plan.md`, `notes.md`, `deliverable.md`, `ROLLING_REQUIREMENTS_AND_PROMPTS.md`, and `HANDOFF.md` all point at the refreshed baseline instead of the stale 2026-04-16 / picker-parity header state.

### Completed In This Slice (2026-04-22)
1. Reproduced the harness failure in `tests/test-matrix-runner.test.ts` and traced it to a real downstream regression in `tests/config.test.ts`.
2. Fixed the stale test assumption in:
   - `tests/config.test.ts`
   - aggregator smoke fixtures now clear routed provider env vars as well as aggregator env vars, so Cloudflare's provider-key fallback path no longer makes the "no aggregator available" case nondeterministic on machines with real API keys.
3. Refreshed verification evidence:
   - `npm run lint`
   - `node --experimental-vm-modules node_modules/.bin/vitest run tests/hooks.test.ts tests/agent-eval-manifests.test.ts tests/test-matrix-runner.test.ts tests/test-matrix-sync.test.ts`
   - `npm run build`
   - `npm test` → `1546/1546`
   - `npm run eval:fast` → run `20260422-054119-735043` (`62/62`)
   - `npm run eval:nightly` → run `20260422-054727-090885` (`65/65`)
   - `npm run eval:release` → run `20260422-054415-886673` (`68/68`)
   - `npm run test:matrix:sync` → `ok`
   - `npm run test:matrix` → run `20260422-054827`
4. Added a structured verification artifact:
   - `outputs/verification/2026-04-22-gate-refresh.md`
5. Updated the continuation surface:
   - `notes.md`
   - `deliverable.md`
   - `ROLLING_REQUIREMENTS_AND_PROMPTS.md`
   - `HANDOFF.md`

## Current Slice (2026-04-21 · SOTA SOP benchmark)
1. Benchmark 5-10 representative coding-agent products/platforms from the last 12 months.
2. Compare workflow steps, role split, trust gates, review gates, and observability surfaces.
3. Convert the benchmark into Orca-specific migration targets for Wave 4 and post-Wave-3 operator hardening.
4. Roll the conclusions into `PRD.md`, `USER_EXPERIENCE_MAP.md`, and `PLATFORM_OPTIMIZATION_PLAN.md`.

### Acceptance Criteria For This Slice
- At least 5 representative products/platforms are covered with dated or current official sources.
- A concrete comparison matrix exists in canonical task artifacts.
- PRD / UX map / optimization plan all reflect the same benchmark conclusions.
- Remaining gaps are translated into explicit Orca roadmap items instead of generic “keep optimizing”.

## Current Slice (2026-04-21)
1. Add a first-class Cloudflare AI Gateway aggregator provider so Orca can route provider-prefixed SOTA models through one OpenAI-compatible endpoint.
2. Preserve the existing provider-neutral execution path: config resolution, model catalog, provider listing, aggregator discovery, and command help should all understand the new provider without special-case command forks.
3. Keep the change auditable with focused regression coverage and docs updates rather than introducing a second provider runtime.

### Acceptance Criteria For This Slice
- `orca -p cloudflare` resolves a Cloudflare AI Gateway provider when `CLOUDFLARE_AI_GATEWAY_API_KEY` and `CLOUDFLARE_AI_GATEWAY_BASE_URL` are set.
- Cloudflare can be selected as an aggregator for cross-vendor model routing.
- Provider/model discovery surfaces mention Cloudflare explicitly.
- Verification stays green: `npm run lint`, `npm test`, `npm run build`.

## Current Slice (2026-04-20)
1. Unify finite-choice command interactions behind one shared picker event + component model.
2. Move the remaining high-frequency finite-choice commands off "print instructions + type a value" flows in Ink mode.
3. Harmonize the visual shell for command picker, option picker, permission prompt, and theme picker.
4. Keep legacy readline fallback behavior intact while making Ink/TUI feel closer to frontier CLIs.

### Acceptance Criteria For This Slice
- Ink mode uses a consistent picker surface for model/mode/effort/load/thread/mcp selection and `ask_user(options)`.
- `CommandPicker`, `OptionPicker`, `PermissionPrompt`, and `ThemePicker` share one visual container grammar.

## Current Slice (2026-04-22)
1. Allow Orca to load a global native hook file from `~/.orca/hooks.json` in addition to per-project `.orca/hooks.json`.
2. Keep the existing merged-load behavior and relative-command execution semantics intact.
3. Use the new global hook surface to support operator-level automation such as Terminal title sync without copying config into every repo.

### Acceptance Criteria For This Slice
- `HookManager` loads hooks from `HOME/.orca/hooks.json`.
- Existing project-local `.orca/hooks.json` behavior remains unchanged.
- `README.md` and initiative docs mention the new global Orca hook surface.
- Verification: `npm run lint`, targeted hooks tests, and `npm run build`.
- Legacy mode still supports the same actions through existing text/number fallback paths.
- Full verification stays green (`lint`, `test`, `build`).

### Completed In This Slice (2026-04-20)
1. Added a shared picker event path:
   - `src/ui/types.ts`
   - `src/ui/session.ts`
   - `src/ui/components/App.tsx`
2. Added shared picker components:
   - `src/ui/components/PickerFrame.tsx`
   - `src/ui/components/OptionPicker.tsx`
3. Routed Ink-mode finite-choice flows through the picker surface:
   - `/model`, `/models`
   - `/mode`
   - `/effort`
   - `/load`
   - `/thread load`, `/thread delete`
   - `/mcp enable`, `/mcp disable`, `/mcp connect`
   - `ask_user(options)`
4. Unified picker-adjacent shells:
   - `src/ui/components/CommandPicker.tsx`
   - `src/ui/components/PermissionPrompt.tsx`
   - `src/ui/components/ThemePicker.tsx`
5. Added regression coverage for picker events and Ink rendering:
   - `tests/chat-proxy-tool-call.test.ts`
   - `tests/chat-session-emitter.test.ts`
   - `tests/chat-slash-mutations.test.ts`
   - `tests/chat-slash-readonly.test.ts`
   - `tests/ink-ui.test.tsx`
6. Rolled forward command/UX docs:
   - `README.md`
   - `USER_EXPERIENCE_MAP.md`
   - `USER_EXPERIENCE_MAP.html`
7. Added searchable picker flows for high-frequency discovery commands in Ink mode:
   - `/thread search`
   - `/notes search`
   - `/prompts find`
   - `/postmortem search`
8. Extended `OptionPicker` with filterable mode + initial query seeding for fuzzy-style terminal selection.
9. Completed the missing competitive research/reporting tranche:
   - `SOTA_EXPERIENCE_GAP_REPORT.md`
   - `SOTA_EXPERIENCE_GAP_REPORT.html`
   - updated `PDCA_EXECUTION_PLAN.md`
   - updated `PDCA_ITERATION_CHECKLIST.md`
   - updated `PLATFORM_OPTIMIZATION_PLAN.md`
10. Started `Wave 1` portability / lifecycle execution:
   - `orca session fork`
   - `orca session export`
   - `orca session import`
   - `/thread export`
   - `/thread import`
   - `/thread handoff`
11. Upgraded search-result flows from selection-only to inspect/detail panels in Ink mode:
   - `/thread search`
   - `/notes search`
   - `/prompts find`
   - `/postmortem search`
12. Added shareable human-readable artifacts for lifecycle objects:
   - `orca session markdown`
   - `orca session share`
   - `/thread markdown`
   - `/thread share`
13. Upgraded collaboration artifacts from markdown-only output to bundles:
   - share sidecar metadata for sessions and threads
   - automatic handoff artifact bundle generation
14. Added top-level session handoff workflow:
   - `orca session handoff`
15. Started `Wave 2` approval / trust execution:
   - `orca permissions`
   - `/permissions`
   - persisted permission-mode config helpers
   - real `plan` semantics (approve every tool)
   - permission source visibility in status/footer
   - Ink `/permissions` detail panel + picker
   - permission prompt scopes: once / session / project
   - inspectable permission rules for session / project / global scopes
   - revoke / clear rule management for session / project / global scopes
   - normalize surface for legacy permission rules
   - effective runtime allowlist merged across project + global
   - rule inspection annotated with canonical / legacy / unrecognized states
   - explicit normalization support for legacy `::` rules
   - state-based filtering for rules audit view
16. Started Wave 3 workflow preset packaging:
   - `orca review`
   - `orca debug`
   - `orca architect`
   - reuse existing built-in modes via `createChatCommand({ initialModeId })`
   - `/mode` picker descriptions now summarize per-profile workflow changes
   - workflow preset registry now includes structured default policy fields
   - preset-backed mode switches now apply default effort / permission policy
   - `/mode` picker now surfaces preset policy defaults directly
   - status surfaces now show the active workflow policy combination
   - startup and `/mode` switching now share one preset-policy application path
   - workflow preset registry now includes tool/output policy and `/status` exposes them
   - model policy now exposed in `/status` and live status surfaces
   - startup prompt now composes `mode + preset + effort` from the shared policy helper
   - proxy tool runtime now enforces the active mode whitelist
   - current effort now maps into proxy `reasoning_effort` (`max` → `xhigh`)
   - provider-returned tool calls now hard-fail unless the tool was explicitly advertised
   - non-interactive permission prompts now fail closed
   - SDK-backed REPL turns now consume the composed session prompt + mapped permission mode
17. Started SOTA SOP benchmark synthesis:
   - benchmark set locked to:
     - Claude Code
     - OpenAI Codex
     - Amp
     - OpenCode
     - Cursor
     - GitHub Copilot coding agent
   - comparison dimensions:
     - workflow steps
     - operator / agent split
     - trust + review gates
     - continuity / remote surfaces
     - evidence / observability
   - expected Orca migration outcome:
     - Wave 4 continuity becomes the primary remaining gap
     - async review/evidence surfaces become the next operator shell priority
18. Continued Wave 4a continuity foothold:
   - `orca -c <id>` now resumes a specific saved session object
   - `orca serve` now exposes `GET /sessions/:id` for single-session inspect
   - continuity still remains read-only / local-trusted; no server-side mutable resume yet
19. Established and ran a layered test matrix:
   - initial evidence dir: `outputs/test-matrix/run-20260421-134924/`
   - initial matrix artifact: `outputs/test-matrix/run-20260421-134924/matrix.md`
   - executed layers:
     - static
     - unit
     - contract
     - integration
     - e2e
     - security smoke + prod audit
     - performance bench
     - resilience
     - AI eval fast gate
   - explicit gaps recorded instead of being silently marked green:
     - formatter/dead-code/license policy gate
     - dedicated SAST / DAST / IaC / ASVS smoke
     - p95 / throughput / memory budget harness
     - nightly/release re-run not executed in this slice
20. Productized the layered matrix into repo-native entrypoints:
   - package scripts:
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
   - generated artifacts:
     - `agent-eval/generated/test-matrix-entrypoints.md`
   - runner security hardening:
     - sanitized `--run-id`
     - secret scan now ignores symlinks and only reads files resolved under root
   - latest runner-produced evidence:
     - `outputs/test-matrix/run-20260421-065329/`
     - `outputs/test-matrix/run-20260421-065329/matrix.md`
21. Promoted the test matrix to a single-source manifest:
   - added `agent-eval/manifests/test-matrix.json`
   - `run-test-matrix.py` now loads layers/gaps from that manifest
   - package layer scripts now act as thin wrappers around the runner
22. Hardened the matrix execution model:
   - `agent-eval/manifests/test-matrix.json` now defines typed `steps[].argv` arrays instead of shell command strings
   - `run-test-matrix.py` now executes layer steps without `shell=True`
   - targeted regressions now cover manifest step shape and unknown-layer failure handling
   - fresh matrix evidence captured at `outputs/test-matrix/run-20260421-072634/`
23. Executed a SOTA gap swarm audit and PDCA evidence refresh:
   - added `SOTA_GAP_SWARM_AUDIT.md` + `SOTA_GAP_SWARM_AUDIT.html`
   - refreshed `eval:nightly` evidence at `agent-eval/runs/20260421-074245-714923/`
   - refreshed `eval:release` evidence at `agent-eval/runs/20260421-074333-249714/`
   - captured manual CLI smoke at `outputs/manual-cli-smoke/run-20260421-154536/`
   - swarm verdict tightened the next tranche into:
     - trust hardening
     - `WorkSession` / `TaskRun`
     - async queue / take-over
     - evidence console
24. Started trust hardening tranche:
   - legacy config `default` now resolves to REPL `auto`
   - non-loopback `serve` now requires `ORCA_SERVE_TOKEN`
   - HTTP requests against authenticated `serve` must present `Authorization: Bearer <token>`
   - fresh manual trust smoke captured at `outputs/manual-cli-smoke/run-20260421-160704/`
25. Started unified policy executor tranche:
   - added `src/policy-executor.ts`
   - normal chat tool execution now uses a shared policy layer for pre-hooks, tool filtering, approval checks, and sandbox posture
   - MCP tool execution now uses that same shared policy layer and fails closed when approval would be required without a grant
26. Optimized the Ink entry / home state:
   - added `src/ui/components/HomePanel.tsx`
   - replaced the legacy startup command list with a structured home panel
   - empty state now emphasizes:
     - one primary action
     - trust/state summary
     - quick recovery paths
     - failure help
   - text snapshot evidence captured at `outputs/ui-smoke/run-20260421-165711/home-panel.txt`
27. Made the home panel interactive:
   - `Tab` now opens a quick-action picker from the empty state
   - quick actions can submit high-frequency prompts or diagnostics directly
   - added App-level interaction coverage in `tests/ink-ui.test.tsx`
28. Made home actions context-aware:
   - quick actions now adapt to:
     - current trust posture
     - saved session availability
   - saved-session discovery now appears directly in the home panel when available
   - dynamic UI text evidence captured at `outputs/ui-smoke/run-20260421-171338/home-panel-dynamic.txt`

## Current Slice (2026-04-16)
1. Read the SOTA gap / plan docs and convert the seeded `agent-eval` pack into a real tiered gate system.
2. Land manifest-driven `fast` / `nightly` / `release` bundles plus a shared runner and release CLI journey artifact.
3. Add integrity tests for manifest/task/grader drift and wire canonical npm scripts for maintainers.
4. Re-run fast + release verification and roll forward canonical docs / deliverables.

### Acceptance Criteria For This Slice
- `agent-eval` no longer depends on a single hard-coded fast-gate runner.
- `npm run eval:fast`, `npm run eval:nightly`, and `npm run eval:release` are canonical entrypoints.
- Release verification writes an auditable run directory with summary JSON / Markdown plus a CLI journey artifact.
- Canonical docs and ledger reference the new gate system rather than the older one-off fast-gate workflow.

## Current Slice (2026-04-18)
1. Port the spirit of Copilot CLI Rubber Duck into Orca as a renamed `reflect` surface.
2. Make `reflect` first-class across top-level command, REPL slash discovery, persistent mode selection, and prompt shaping.
3. Keep the implementation explicit-first, but add conservative auto-triggering for clear debugging/explanation prompts in normal chat.
4. Add regression coverage and roll forward README + canonical PDCA docs.

### Acceptance Criteria For This Slice
- `orca reflect` exists as a public command.
- `/reflect` works inside chat and `/mode reflect` enables a persistent session profile.
- Standard chat can auto-trigger reflect for clear debugging/explanation asks and surfaces an inline notice when that happens.
- README and canonical initiative docs describe the new reflect surface.
- Lint, targeted reflect regressions, full test suite, and build stay green.

## Parallel Planning Track — Large-Scale Test Expansion (in progress)

- Status: in_progress
- Scope: create the next large-scale Orca CLI test-growth program without replacing the currently active `chat.ts` maintainability slice.
- Baseline:
  - measured planning-start baseline: `npm test` => `1263/1263`
  - current full-suite baseline after the first breadth + depth + packaging tranches and the manifest-integrity guard: `npm test` => `1280/1280`
  - this sequence supersedes the older `1260/1260` checkpoint recorded under the prior maintainability slice
  - passing file count in the latest full run: `69`
  - historical `doc/SOTA_TEST_PLAN.md` is now reference-only and no longer reflects the canonical total
- Target shape:
  1. fast gate: `550-650` selected deterministic cases + `12` eval tasks
  2. nightly gate: `~1700` deterministic cases + `36` eval tasks
  3. release gate: `~2210` deterministic cases + `72` eval tasks + packaging/bin smokes
- Workstreams:
  1. Breadth matrix: command / flag / help, provider / model / config, REPL / ink / session / output, serve / headless / IDE, packaging / bin
  2. Depth matrix: long-horizon agent loops, recovery / adversarial paths, large-codebase scenarios, multi-step edit / refactor / benchmark workflows
  3. Evaluation system: `AGENT_EVAL_PLAN.md` is filled and `agent-eval/` now has a manifest-driven gate system
     - `fast`: `14` local black-box tasks
     - `nightly`: deterministic repo gates + the local black-box pack
     - `release`: deterministic repo gates + `bench` + the local black-box pack + recorded CLI journey
  4. Priority contract tranche: `pr`, `session`, `serve`, `run`, `providers test`, root entry / `--continue`, packaging
  5. First breadth tranche landed in `tests/command-contracts.test.ts` for root command coverage plus `session` / `pr` / `providers` / `serve` public-contract stability
  6. First depth tranche landed in `tests/session-command.test.ts` and `tests/serve-command.test.ts` for corrupted-session recovery, `ORCA_HOME` parity, and malformed `/chat` request handling
  7. Packaging / release smokes landed in `tests/packaging-smoke.test.ts` for build output, `npm pack --dry-run`, and built-bin execution
  8. Fast-gate task-eval target is now exceeded at `61/61` tasks with the latest successful run `20260417-012401-427935`
  9. Nightly gate now passes at `64/64` steps (`20260417-012506-286459`)
  10. Release gate now passes at `67/67` steps (`20260417-012607-841549`)
- Acceptance Criteria:
  - canonical PDCA docs record the real current baseline and target matrix
  - `AGENT_EVAL_PLAN.md` defines tasks, graders, evidence, and gate tiers
  - `agent-eval/manifests/*.json` and `agent-eval/scripts/run-gate.py` make those tiers executable
  - the active maintainability slice below remains separately trackable
  - this planning track can proceed independently of the current `chat.ts` refactor

### Current Slice (2026-04-14)
1. Fix the ink slash-command picker so it stops capturing Enter once the user has moved from the command token into argument entry.
2. Fix first-launch theme onboarding so a saved `~/.orca/theme` preference suppresses the picker on subsequent launches.
3. Add regression coverage for both behaviors.
4. Rebuild and refresh the installed global Orca package after verification.

### Acceptance Criteria For This Slice
- Slash commands with arguments submit the full typed input instead of dropping back to command-name-only picker selection.
- The theme picker does not reappear when a valid theme is already saved.
- Regression coverage exists for picker visibility and theme-preference detection.
- Targeted tests plus repo lint/test/build stay green.

### Current Slice (2026-04-14 19:40 CST)
1. Extract the read-only slash display/status/help flows from `handleSlashCommand()`.
2. Re-run targeted + full verification after the extraction.
3. Roll forward canonical task docs and `HANDOFF.md`.
4. Leave the next model a clean continuation point at `runProxyTurn()` orchestration.

### Acceptance Criteria For This Slice
- Read-only slash commands live outside `src/commands/chat.ts`.
- `handleSlashCommand()` no longer relies on `as string` dispatch casts for async slash flows.
- Regression coverage exists for the extracted slash helper boundary.
- Canonical task docs and `HANDOFF.md` point the next continuation at `runProxyTurn()`.

### Completed In This Slice (2026-04-14 19:40 CST)
1. Added `src/commands/chat-slash-readonly.ts` for read-only slash help/status/display flows.
2. Moved the read-only subset out of `handleSlashCommand()`:
   - `/help`
   - read-only `/model` + `/models`
   - `/history`, `/tokens`, `/stats`, `/cwd`
   - `/diff`, `/git`
   - `/sessions`, `/jobs`
   - `/cost`, `/status`, `/doctor`, `/config`, `/providers`
3. Replaced the old string-cast async slash branching with an explicit `SlashCommandResult` union.
4. Added `tests/chat-slash-readonly.test.ts` for helper-level regression coverage.
5. Updated `task_plan.md`, `notes.md`, `deliverable.md`, and `HANDOFF.md` to reflect the new continuation point.

### Current Slice (2026-04-14 19:50 CST)
1. Extract the `runProxyTurn()` tool orchestration callback into a dedicated helper module.
2. Add helper-level regression coverage for the extracted proxy tool boundary.
3. Re-run targeted + full verification after the extraction.
4. Roll forward canonical task docs and `HANDOFF.md` to the next continuation point.

### Acceptance Criteria For Current Slice
- `runProxyTurn()` no longer carries the full `onToolCall` orchestration body inline.
- Dangerous-tool permission flow, hook gating, async tool routing, and post-tool guards remain behavior-compatible.
- Regression coverage exists for the extracted proxy helper boundary.
- Canonical task docs and `HANDOFF.md` point the next continuation at the remaining mutating/session slash flows.

### Completed In The Current Slice (2026-04-14 19:50 CST)
1. Added `src/commands/chat-proxy-tool-call.ts` for proxy-path tool orchestration.
2. Moved the `runProxyTurn()` tool callback out of `chat.ts`, including:
   - dangerous-tool permission gating + diff preview flow
   - `PreToolUse` handling
   - sub-agent / `ask_user` / MCP / `sleep` async tool routing
   - post-tool retry intelligence, error classification, loop detection, postmortem matching, auto-verify, and context guarding
3. Added `tests/chat-proxy-tool-call.test.ts` for helper-level regression coverage.
4. Updated `task_plan.md`, `notes.md`, `deliverable.md`, and `HANDOFF.md` so the next continuation starts at the remaining mutating/session slash flows.

### Current Slice (2026-04-14 20:00 CST)
1. Extract the remaining mutating/session slash flows out of `handleSlashCommand()`.
2. Add helper-level regression coverage for the extracted mutating slash boundary.
3. Re-run targeted + full verification after the extraction.
4. Roll forward canonical task docs and `HANDOFF.md` to the next continuation point.

### Acceptance Criteria For This Slice
- `handleSlashCommand()` no longer embeds the remaining mutating/session slash switch body inline.
- Async slash sentinels and `not_command` fallthrough behavior remain stable.
- Regression coverage exists for the extracted mutating slash helper boundary.
- Canonical task docs and `HANDOFF.md` point the next continuation at `runREPL()` orchestration.

### Completed In This Slice (2026-04-14 20:00 CST)
1. Added `src/commands/chat-slash-mutations.ts` for the remaining mutating/session slash flows.
2. Moved the rest of the slash-command switch out of `chat.ts`, including:
   - model switching, clear/compact/system/hooks
   - async slash sentinels for `/council`, `/race`, `/pipeline`, `/mission`, `/plan`
   - session persistence / continue / undo
   - `/commit`, `/review`, `/pr` fallthrough behavior
   - `/mcp`, `/thread`, `/init`, `/notes`, `/postmortem`, `/prompts`, `/learn`
3. Added `tests/chat-slash-mutations.test.ts` for helper-level regression coverage.
4. Updated `task_plan.md`, `notes.md`, `deliverable.md`, and `HANDOFF.md` so the next continuation starts at the remaining `runREPL()` orchestration hotspot.

### Current Slice (2026-04-14 20:10 CST)
1. Extract the async slash follow-up execution out of `runREPL()`.
2. Add helper-level regression coverage for the extracted async REPL slash boundary.
3. Re-run targeted + full verification after the extraction.
4. Roll forward canonical task docs and `HANDOFF.md` to the next continuation point.

### Acceptance Criteria For This Slice
- `runREPL()` no longer embeds the `/council`, `/race`, `/pipeline`, `/mission`, and `/plan` execution blocks inline.
- Ink and legacy rendering for async slash follow-up stay behavior-compatible.
- Regression coverage exists for the extracted async REPL slash helper boundary.
- Canonical task docs and `HANDOFF.md` point the next continuation at the remaining `runREPL()` turn lifecycle.

### Completed In This Slice (2026-04-14 20:10 CST)
1. Added `src/commands/chat-repl-async-slash.ts` for async REPL slash follow-up execution.
2. Moved the `/council`, `/race`, `/pipeline`, `/mission`, and `/plan` execution blocks out of `runREPL()`.
3. Added `tests/chat-repl-async-slash.test.ts` for helper-level regression coverage.
4. Updated `task_plan.md`, `notes.md`, `deliverable.md`, and `HANDOFF.md` so the next continuation starts at the remaining `runREPL()` turn lifecycle.

### Current Slice (2026-04-14 20:22 CST)
1. Extract the normal prompt turn execution path out of `runREPL()`.
2. Add helper-level regression coverage for the extracted REPL turn boundary.
3. Re-run targeted + full verification after the extraction.
4. Roll forward canonical task docs and `HANDOFF.md` to the next continuation point.

### Acceptance Criteria For This Slice
- `runREPL()` no longer embeds the normal prompt turn lifecycle inline after input/slash dispatch.
- Hook gating, file expansion, cognitive skeleton injection, pre-send compaction, abort handling, provider dispatch, 413 retry recovery, and post-turn compaction remain behavior-compatible.
- Regression coverage exists for the extracted REPL turn helper boundary.
- Canonical task docs and `HANDOFF.md` point the next continuation at the remaining REPL input/discovery/dispatch front-half.

### Completed In This Slice (2026-04-14 20:22 CST)
1. Added `src/commands/chat-repl-turn.ts` for the normal REPL prompt turn lifecycle.
2. Moved the remaining turn-execution subtree out of `runREPL()`, including:
   - multi-task hinting
   - `UserPromptSubmit` hook gating
   - file expansion + cognitive skeleton injection
   - pre-send compaction
   - abort/progress lifecycle
   - proxy/SDK turn dispatch
   - 413 auto-recovery retry
   - post-turn compaction + session autosave
3. Added `tests/chat-repl-turn.test.ts` for helper-level regression coverage.
4. Updated `task_plan.md`, `notes.md`, `deliverable.md`, and `HANDOFF.md` so the next continuation starts at the remaining `runREPL()` input/discovery/dispatch hotspot.

## Prior UI Remediation Round (2026-04-14 12:02 CST)
1. Reconcile report v3 against real `src/ui/**` state and CC reference sources.
2. Fix the remaining behavior-accuracy gaps that still exist in code:
   - `ScrollBox` uses terminal rows instead of measured viewport height when mounted in a flex layout.
   - `AlternateScreen` still enters alt-screen in `useEffect`, later than CC's insertion-phase write.
   - `cursor.ts` still treats word boundaries as ASCII-only, not CC-style Unicode-aware word chars.
3. Correct doc drift:
   - canonical `PROJECT_DIR` blocks still point at `/Users/mauricewen/Projects/MARUCIE-orca-cli`
   - planning notes overstate parity completion and no longer distinguish report-vs-code truth.

### Acceptance Criteria For This Round
- Scroll behavior is clamped against actual viewport height, not full terminal rows.
- Alternate-screen enter/exit timing moves to insertion/layout-safe path before first frame paint.
- Cursor word movement/deletion works for Unicode letters/numbers/marks, not only ASCII `\\w`.
- Regression coverage added for the above behaviors.
- Canonical docs updated to the real repo path `/Users/mauricewen/Projects/orca-cli`.

### Completed (2026-04-14)
1. `ScrollBox` now measures the rendered viewport container instead of assuming full terminal height.
2. `AlternateScreen` now enters alt-screen in a pre-paint hook (`useInsertionEffect` with layout fallback).
3. `cursor.ts` now uses Unicode-aware word characters for word motion/deletion.
4. `TerminalSizeProvider` now shares a single process-level `SIGWINCH` subscription instead of adding one listener per provider mount.
5. Canonical `PROJECT_DIR` blocks were corrected in architecture + UX docs.
6. `chat.ts` file expansion now resolves quoted paths, shell-escaped spaces, and `file:///...%20...` URLs through the same normalization path.
7. `tryExpandDirectory()` now recognizes quoted and shell-escaped directory paths with spaces in mixed prompts.
8. High-risk shell string interpolation was removed from preprocess conversion, project tree expansion, worktree management, and `git_commit`.
9. Added a zero-dependency VS Code extension skeleton under `integrations/vscode-orca/`.
10. Added multimodal prompt foundation in the proxy provider layer and a minimal `orca chat --image` one-shot entry.
11. Upgraded history/budget/session layers so `ChatMessage` no longer assumes string-only content.
12. Started extracting `chat.ts` helper concerns into `src/commands/chat-input.ts` (safe `/git` parsing + image prompt builder).
13. Expanded extraction into `src/commands/chat-input.ts` + `src/commands/chat-support.ts` so file expansion, project bootstrap, and persistence/config helpers are no longer embedded in `chat.ts`.
14. Extracted read-only slash help/status/display flows into `src/commands/chat-slash-readonly.ts`, and replaced `handleSlashCommand()` string-cast branching with an explicit typed result union.

## Verification Summary (this round)

- `npm run lint` ✅
- `node --experimental-vm-modules node_modules/.bin/vitest run tests/cursor.test.ts tests/ink-ui.test.tsx` ✅ (`83/83`)
- `node --experimental-vm-modules node_modules/.bin/vitest run tests/chat-file-expansion.test.ts tests/file-expansion.test.ts` ✅ (`70/70`)
- `npm test` ✅ (`1206/1206`)
- `npm test` ✅ (`1212/1212`) after file-expansion follow-up
- `node --experimental-vm-modules node_modules/.bin/vitest run tests/chat-file-expansion.test.ts` ✅ (`8/8`) after directory-path follow-up
- `npm test` ✅ (`1214/1214`) after directory-path follow-up
- `node --experimental-vm-modules node_modules/.bin/vitest run tests/adversarial.test.ts tests/preprocess.test.ts tests/phase1-agent.test.ts` ✅ (`134/134`) after shell-hardening follow-up
- `npm test` ✅ (`1216/1216`) after shell-hardening follow-up
- `node --experimental-vm-modules node_modules/.bin/vitest run tests/vscode-extension.test.ts` ✅ (`3/3`)
- `npm test` ✅ (`1219/1219`) after VS Code skeleton follow-up
- `node --experimental-vm-modules node_modules/.bin/vitest run tests/openai-compat-multimodal.test.ts tests/chat-image-option.test.ts tests/provider-stream-resilience.test.ts tests/agent-loop.test.ts` ✅ (`36/36`)
- `npm test` ✅ (`1226/1226`) after multimodal one-shot follow-up
- `node --experimental-vm-modules node_modules/.bin/vitest run tests/openai-compat-multimodal.test.ts tests/chat-image-option.test.ts tests/context-protection.test.ts tests/provider-stream-resilience.test.ts tests/agent-loop.test.ts` ✅ (`78/78`)
- `npm test` ✅ (`1227/1227`) after multimodal history/budget follow-up
- `node --experimental-vm-modules node_modules/.bin/vitest run tests/chat-git-command.test.ts tests/chat-image-option.test.ts tests/openai-compat-multimodal.test.ts tests/chat-file-expansion.test.ts` ✅ (`16/16`)
- `npm test` ✅ (`1227/1227`) after `chat-input.ts` partial extraction
- `node --experimental-vm-modules node_modules/.bin/vitest run tests/chat-git-command.test.ts tests/chat-image-option.test.ts tests/chat-file-expansion.test.ts tests/openai-compat-multimodal.test.ts tests/vscode-extension.test.ts` ✅ (`19/19`)
- `npm test` ✅ (`1238/1238`) after `chat-input.ts` / `chat-support.ts` extraction
- `node --experimental-vm-modules node_modules/.bin/vitest run tests/chat-slash-readonly.test.ts tests/chat-git-command.test.ts tests/chat-image-option.test.ts tests/chat-file-expansion.test.ts` ✅ (`18/18`)
- `npm test` ✅ (`1242/1242`) after `chat-slash-readonly.ts` extraction
- `node --experimental-vm-modules node_modules/.bin/vitest run tests/chat-proxy-tool-call.test.ts tests/chat-slash-readonly.test.ts tests/chat-git-command.test.ts tests/chat-image-option.test.ts tests/chat-file-expansion.test.ts` ✅ (`22/22`)
- `npm test` ✅ (`1246/1246`) after `chat-proxy-tool-call.ts` extraction
- `node --experimental-vm-modules node_modules/.bin/vitest run tests/chat-slash-mutations.test.ts tests/chat-proxy-tool-call.test.ts tests/chat-slash-readonly.test.ts tests/chat-git-command.test.ts tests/chat-image-option.test.ts tests/chat-file-expansion.test.ts` ✅ (`26/26`)
- `npm test` ✅ (`1250/1250`) after `chat-slash-mutations.ts` extraction
- `node --experimental-vm-modules node_modules/.bin/vitest run tests/chat-repl-async-slash.test.ts tests/chat-slash-mutations.test.ts tests/chat-proxy-tool-call.test.ts tests/chat-slash-readonly.test.ts tests/chat-git-command.test.ts tests/chat-image-option.test.ts tests/chat-file-expansion.test.ts` ✅ (`30/30`)
- `npm test` ✅ (`1254/1254`) after `chat-repl-async-slash.ts` extraction
- `node --experimental-vm-modules node_modules/.bin/vitest run tests/chat-repl-turn.test.ts` ✅ (`6/6`)
- `npm test` ✅ (`1260/1260`) after `chat-repl-turn.ts` extraction
- `npm run build` ✅
- `npm run bench` not run
  - Reason: this round changed ink UI behavior and docs only; no benchmark/provider-selection logic changed

### P0 Completed (2026-04-14)
1. useTerminalSize — reactive resize via SIGWINCH ✅
2. ScrollBox — stickyScroll + keyboard nav ✅
3. usePasteHandler — bracketed paste mode ✅

### P1 Completed (2026-04-14)
4. Cursor model — 28 tests, word-boundary, kill/yank ✅
5. Theme expansion — 25 semantic tokens, dark/light auto-detect ✅
6. Mouse wheel — SGR protocol, ScrollBox integration ✅
7. Focus control — showCursor prop, theme-aware borders ✅

### P2 Completed (2026-04-14)
8. Spinner upgrade — 204 verbs + stalledIntensity ✅
9. Tool call graduated error rendering — 6 error types ✅
10. Meta+Enter / Shift+Enter newline support ✅

### Remaining (post-round, if still out of scope)
- Interactive image paste support in the ink REPL
- CC-level `ScrollBox.scrollToElement()` / virtualization semantics
- Richer multimodal persistence beyond text-flattened compatibility paths
- Rich IDE integration beyond terminal launchers remains open (editor decorations, inline actions, richer MCP lifecycle UX)
- Remaining `chat.ts` maintainability work: the remaining REPL input/discovery/dispatch front-half still needs decomposition

## Previous Task

- Task: Internalize Hermes-inspired runtime capabilities into Orca CLI
- Status: completed
- Completed: 2026-04-12

## Plan

1. Map Hermes v0.8.0 capabilities against Orca CLI and Orca Agent SDK boundaries.
2. Implement the first Hermes-inspired runtime bundle in Orca CLI:
   - tool argument coercion
   - oversized tool result persistence
   - background completion notifications
3. Update canonical project docs and README to reflect the new runtime behavior.
4. Decide whether SDK code must change; if not, record why the boundary stays Orca-local.
5. Run full verification (`lint`, `test`, `build`, `bench`, smoke tests).

## Exit Criteria

- Hermes-inspired capability bundle is implemented and documented in Orca CLI
- Runtime boundaries between Orca CLI and Orca Agent SDK are explicitly recorded
- Verification evidence logged in `deliverable.md`

## Verification Summary

- `npm run lint` ✅
- `npm test` ✅ (`426/426` tests passed)
- `npm run build` ✅
- `npm run bench` ✅ (`10/10`, `100%`)
- `node dist/bin/orca.js --help` ✅
- `vitest run tests/hermes-runtime.test.ts` ✅ (`3/3`)
- `vitest run tests/model-catalog.test.ts` ✅ (`4/4`)
- `vitest run tests/model-catalog.test.ts tests/providers-command.test.ts` ✅ (`5/5`)
- `node dist/bin/orca.js providers` ✅
- `vitest run tests/logger.test.ts tests/logs-command.test.ts tests/program.test.ts` ✅ (`12/12`)
- `node dist/bin/orca.js logs` ✅
- `node dist/bin/orca.js doctor --json` ✅
- `vitest run tests/doctor-command.test.ts tests/logger.test.ts tests/logs-command.test.ts tests/program.test.ts` ✅ (`14/14`)
- `vitest run tests/serve-command.test.ts` ✅ (`1/1`)
- `vitest run tests/stats-command.test.ts` ✅ (`1/1`)

## Current Task

- Task: Support arbitrary local images and multi-image input in the REPL
- Status: completed
- Completed: 2026-04-20

## Plan

1. Reuse the existing proxy multimodal path instead of inventing a second image transport.
2. Detect embedded local image paths in REPL input, including quoted paths and shell-escaped spaces.
3. Keep text file expansion and image attachment logic separate so images stop being injected as `<file>` text blobs.
4. Preserve multimodal user turns in proxy-path history for follow-up questions.
5. Update README and canonical project docs, then run `lint`, `test`, `build`, and `bench`.

## Exit Criteria

- REPL accepts one or more local image paths in normal prompts.
- Multiple images in a single turn produce multimodal `PromptContent`.
- Proxy-path history keeps the image parts for follow-up turns.
- Verification evidence logged in `deliverable.md`.
