# Orca CLI Platform Optimization Plan

## 2026-04-29 Optimization Delta - SOTA Swarm Audit

The next platform wave is now explicitly ordered:

1. Trust hardening:
   - explicit project hook trust
   - hook env allowlist
   - approval-gated network tools
   - private/loopback `fetch_url` guard
2. Queue visibility:
   - ship `orca queue list/show/follow/takeover/evidence`
   - keep lease state as the handoff point for future scheduler / resume semantics
3. Unified execution contract:
   - `run` default, goal-loop, mission, plan, and `serve /chat` now write canonical `WorkSession` / `TaskRun` records
   - finish model routing and future background agents against the same record model now that `chat` REPL, `run`, and `serve /chat` write canonical records
4. Evidence console:
   - `orca queue evidence` now opens TaskRun logs, diffs, data, reports, missing artifacts, and capped previews
   - `/evidence <task-run-id>` opens the same drawer model in the Ink `DetailPanel`
   - approval decisions now append to `TaskRun.approvals` and render before file evidence in both surfaces
5. Slash command surface:
   - `src/slash-commands.ts` is now the shared registry for REPL completion, Ink picker, and `/help`; HomePanel hint metadata is prepared for the pending UI-baseline split
6. Chat transcript readability:
   - submitted Ink prompts now remain visible as highlighted `You` transcript blocks
   - assistant markdown now renders inside structured `ORCA` response panels instead of raw transcript text
7. Release evidence:
   - `verification_snapshot.json` plus `tests/release-evidence.test.ts` now guards README and active PDCA verification counts
8. Gate integrity:
   - CI now runs matrix sync, static, security, performance, and fast agent-eval gates
   - `agent-eval/manifests/test-matrix.json` is the manifest source for package entrypoints
9. Next platform tranche:
   - scheduler / resume semantics over TaskRun leases
   - model-routing evidence and catalog SSoT

## Objective

Keep Orca CLI maintainable as a fast-moving CLI runtime while preventing drift across docs, command surfaces, and provider-routing behavior.

## Current Optimization Targets

| Area | Current State | Next Step |
| --- | --- | --- |
| Governance entry files | Root guidance files now exist | Keep `CLAUDE.md` canonical and keep `CODEX.md` / `GEMINI.md` as thin references rather than duplicated copies |
| Project docs structure | Flat legacy docs plus new initiative tree | Use `doc/00_project/initiative_orca/` as canonical source going forward |
| Runtime state hygiene | `.omx/` existed as untracked runtime state | Ignore `.omx/` in git and keep runtime state out of source control |
| Hermes-inspired runtime ergonomics | Orca lacked detached-job and oversized-result UX | Keep high-value runtime resilience features in Orca where no gateway abstraction is required |
| Model switching ergonomics | `/models` was a hard-coded list with weak runtime hints | Keep provider-aware model metadata in a single catalog instead of scattering it across REPL code |
| Provider inspection ergonomics | `orca providers` only showed a thin readiness table | Reuse the same model catalog so provider inspection and REPL selection stay consistent |
| Runtime diagnostics | Warnings/errors were terminal-only and ephemeral | Persist local logs and expose them through a simple CLI log surface |
| Operator-wide hook ergonomics | Personal hooks required per-project `.orca/hooks.json` duplication | Load `~/.orca/hooks.json` as a global native hook source |
| Health-check ergonomics | Runtime state required manual inspection across config, hooks, MCP, and sessions | Add a single doctor-style command for local diagnostics |
| Config failure visibility | Malformed JSON config could degrade into scattered warnings | Surface config parse failures directly in doctor output |
| Headless parity | `orca serve` originally exposed a thin status surface | Reuse doctor/model metadata in server endpoints instead of inventing a second observability model |
| Stats visibility | `orca stats` only covered usage/cost | Merge runtime health and error signals into the stats surface |
| REPL interaction ergonomics | Slash autocomplete can hijack Enter after arguments begin, and theme onboarding can ignore persisted choice | Keep autocomplete token-scoped and honor saved theme preference before showing first-launch UI |
| Debugging reflection ergonomics | Standard chat can jump too quickly from symptom to rewrite | Add explicit `reflect` surfaces plus conservative auto-triggering that restructures debugging/explanation asks into evidence-backed diagnosis |
| Command/document parity | README can drift from actual registrations | Treat `src/program.ts` as source of truth and update docs in the same task |
| Architecture visibility | Historical architecture doc existed, but not repo-specific canonical doc | Maintain `SYSTEM_ARCHITECTURE.md` and `USER_EXPERIENCE_MAP.md` as live docs |
| Verification discipline | Tests exist but repo-level process docs were missing | Keep task-level verification logged in `deliverable.md` and `notes.md` |
| Test architecture scaling | The suite has grown to `1280` passing tests, and gate tiers/task-based eval are now executable, but the nightly/release matrix still needs more task inventory | Split growth into fast / nightly / release gates, prioritize command-surface gaps (`pr/session/serve/run/providers test/root/bin`), and back the scenario layer with `AGENT_EVAL_PLAN.md` |
| Eval system reproducibility | Fast-gate assets existed, but gate execution still depended on one-off scripts and operator memory | Keep `agent-eval/manifests/*.json` and `agent-eval/scripts/run-gate.py` as the canonical release-quality gate system |
| HTML companion drift | Hand-maintained summaries can diverge from Markdown | Regenerate planning/architecture HTML companions from the canonical `.md` source |

## Planned Improvements

1. Migrate future architecture/product updates into the initiative docs instead of adding new flat docs.
2. Keep provider/model/tool count claims sourced from code or explicitly dated when narrative docs summarize them.
3. Add release-time doc verification to ensure README and canonical docs stay aligned with command registration.
4. Expand headless/API documentation when `orca serve` grows beyond current HTTP + SSE scope.
5. Move active test-growth goals out of historical flat docs and into PDCA + `AGENT_EVAL_PLAN.md`.
6. Grow the quality program by matrix lane so count increases stay tied to signal and ownership.
7. Keep release evidence under `agent-eval/runs/<run_id>/` so build / bench / black-box / CLI journey data stay reviewable after the terminal session ends.
8. Keep reflect heuristics conservative, deduped, and documented so prompt-intent routing stays helpful rather than noisy.

## SOTA Competitive Program (2026-04-20)

Canonical competitive source:

- `doc/00_project/initiative_orca/SOTA_EXPERIENCE_GAP_REPORT.md`

Highest-value experience gaps after the new report:

1. Session lifecycle productization
   - missing: fork/share/export/import/handoff/inspect
   - strongest references: Codex, Amp, OpenCode
2. Approval / trust UX clarity
   - missing: explicit top-level policy control + richer review panel
   - strongest references: Claude Code, Codex, Amp
3. Inspect-and-act detail surfaces
   - missing: selected-item detail panels for search results
   - strongest references: frontier IDE/CLI hybrids
4. Remote / IDE / web continuity
   - missing: platform-grade serve/web/IDE bridge story
   - strongest references: Codex, OpenCode, Claude Code, GitHub Copilot ecosystem
5. Workflow preset packaging
   - missing: clearer “review/debug/ship/research/quick assist” operating lanes
   - strongest references: Claude Code, Kilo Code

Execution order:

- Wave 0: picker/search-picker/operator shell unification — landed
- Wave 1: session lifecycle productization — started
- Wave 2: approval / trust UX — started
- Wave 3: workflow presets — started
- Wave 4: remote / IDE / web continuity
- Wave 5: performance instrumentation and operator evidence

Wave 1 progress now landed:

- `orca session fork`
- `orca session export`
- `orca session import`
- `orca session markdown`
- `orca session share`
- `orca session handoff`
- `/thread export`
- `/thread markdown`
- `/thread share`
- `/thread import`
- `/thread handoff`
- session/thread share flows now emit metadata sidecars
- session handoff now emits a dedicated handoff artifact bundle
- handoff now emits a dedicated handoff artifact bundle

Wave 2 progress now landed:

- top-level `orca permissions` command for inspecting and persisting approval mode
- `/permissions` slash surface for live session mode changes and persistence
- Ink `/permissions` detail panel + picker for live mode switching and project/global saves
- explicit `permissions rules` surfaces for inspecting stored session/project/global approvals
- explicit `permissions revoke` / `permissions clear` surfaces for rule lifecycle management
- revoke now supports filter-and-pick selection when the rule key is omitted
- permission rules now persist as stable canonical descriptors (`path=...`, `command=...`) rather than preview strings
- explicit `permissions normalize` surface for legacy rule cleanup
- runtime effective allowlist now consumes both project and global scopes
- `permissions rules` now exposes rule state (`canonical` / `legacy` / `unrecognized`)
- normalize now covers legacy `::` rule format as well as preview-style `|`
- `permissions rules` now supports state-based filtering for operator audits
- config helpers for reading/writing persisted permission mode
- runtime mapping now honors persisted config instead of relying only on `--safe`
- `plan` mode now requests approval for every tool call
- permission prompts now support `once` / `session` / `project` scopes
- status/footer surfaces now display where the current permission mode comes from

Wave 3 progress now landed:

- top-level explicit workflow preset commands:
  - `orca review`
  - `orca debug`
  - `orca architect`
- presets currently reuse existing built-in modes through `createChatCommand({ initialModeId })`
- this gives Orca a first explicit workflow-packaging surface without introducing a second preset framework
- `/mode` picker descriptions now summarize what each workflow profile changes
- preset command metadata now resolves from one registry instead of scattered command-local strings
- workflow preset registry now carries structured default policy fields (`effort`, `permission mode`)
- preset-backed mode switches now apply default effort / permission policy at runtime
- `/mode` picker now surfaces preset policy defaults directly in the operator UI
- startup and `/mode` switching now share one preset-policy application path
- status surfaces now expose the active workflow policy combination
- workflow preset registry now also carries `tool policy` and `output style`
- `/status` now exposes those extra policy dimensions
- live status surfaces now show compact tool/output summaries when available
- `/status` and live status surfaces now also expose `model policy`
- startup helper now composes the initial system prompt from the same preset contract used by `/mode`
- proxy tool runtime now enforces the active mode whitelist instead of relying only on prompt text
- session effort / preset default effort now maps into proxy `reasoning_effort` (`max` → `xhigh`)
- provider-returned tool calls now hard-fail unless the tool was explicitly advertised
- non-interactive permission prompts now fail closed instead of silently approving
- SDK-backed REPL turns now consume the composed session prompt plus mapped permission mode

## REPL Multimodal Completion (2026-04-20)

### Completed
| ID | Change | Impact | Status |
|----|--------|--------|--------|
| MM-R1 | Detect embedded image paths in REPL prompts | screenshots can be attached without `--image` | DONE |
| MM-R2 | Support multiple image attachments in a single turn | compare/reference multi-image workflows now work in REPL | DONE |
| MM-R3 | Preserve multimodal user turns in proxy history | follow-up questions can still reference the attached images | DONE |

### Remaining
| Risk | Current State | Mitigation |
|------|---------------|------------|
| Clipboard image paste | still unsupported in ink REPL | user must reference local image files for now |

## 2026-04-21 SOTA SOP Benchmark Conclusions

Benchmark set:

- Claude Code
- OpenAI Codex
- Amp
- OpenCode
- Cursor
- GitHub Copilot coding agent

Cross-product SOP pattern:

1. durable session / thread object
2. detached or remote execution lane
3. explicit approval / review gate
4. resumable handoff back into terminal / IDE / PR
5. visible evidence surface: logs, queue state, usage, timeline, or share link

What this means for Orca:

- Wave 3 is now relatively mature compared with the market on workflow packaging and trust clarity.
- Orca’s biggest remaining product gap is Wave 4 continuity, not another round of naming or picker polish.
- The next roadmap should therefore focus on async continuity and evidence surfaces, not just more command aliases.
- The swarm audit further tightened that into a concrete delivery order:
  1. trust-default and executor unification
  2. canonical `WorkSession` / `TaskRun` objects
  3. async queue + take-over surface
  4. evidence console and richer review-before-apply bundles

Re-prioritized next steps:

1. **Wave 4a — Session Continuity**
   - durable session ids across terminal / web / IDE
   - resumable handoff from headless/server runs back into local REPL
   - shareable session URLs or hosted session views
2. **Wave 4b — Async Agent Queue**
   - visible background/remote task list
   - resumable take-over
   - queue item detail panel with logs/artifacts
3. **Wave 4c — Evidence Console**
   - timeline of tool calls / approvals / artifacts / diffs
   - operator-first review surface before apply/merge
4. **Wave 4d — Trust Hardening**
   - safer default approval posture
   - shared policy executor across REPL / MCP / serve
   - transcript/share redaction and stronger artifact permissions
5. **Wave 5 — Performance / Metrics**
   - admin/operator metrics once the continuity surfaces exist

Wave 4a progress now started:

- stable REPL `sessionId`
- `/status` and live status surfaces now expose the active session id
- CLI resume now supports exact durable objects through `orca -c <id>`
- `orca serve` now exposes:
  - `GET /sessions`
  - `GET /sessions/latest`
  - `GET /sessions/:id`
- this establishes a headless continuity discovery layer before richer hosted/web take-over flows
- `orca run` now writes TaskRun records for default, goal-loop, mission, and plan branches, so queue inspection can see status, summary, usage, and mission-state evidence
- `orca chat` REPL now writes per-prompt TaskRun records under the active chat WorkSession, so queue inspection can see interactive turn status and usage
- continuity metadata is intentionally treated as trusted-local surface:
  - no wildcard CORS
  - session-discovery endpoints are loopback-only
- trust hardening has now started:
  - legacy config `default` resolves to safer REPL `auto`
  - non-loopback `serve` now requires `ORCA_SERVE_TOKEN`
  - shared policy executor now covers normal chat tools and MCP tool execution

## 2026-04-21 Layered Test Matrix Snapshot

Established evidence-backed layers:

1. Static:
   - `npm run lint`
   - `npm run build`
   - dependency/license inventory
   - heuristic secret scan
2. Unit:
   - targeted Vitest module suites
3. Contract:
   - protocol / command-contract / manifest tests
4. Integration:
   - runtime / session / provider / MCP tests
5. E2E:
   - workflow and mission tests
6. Security:
   - adversarial/context/permission regressions
   - `npm audit --omit=dev --json`
7. Performance:
   - `orca bench --json`
   - bench regression tests
8. Resilience:
   - provider-stream / agent-loop / retry-recovery suites
9. AI Eval:
   - `npm run eval:fast`

The layer metadata now lives in `agent-eval/manifests/test-matrix.json`, and `test:*` package scripts are thin wrappers around the matrix runner.
That manifest now uses typed `steps[].argv` entries, so `run-test-matrix.py` executes repo-owned layer commands without `shell=True`.

Still-missing institutional gates:

- dedicated formatter gate
- dead-code gate
- policy-grade license checker
- dedicated SAST / DAST / IaC / ASVS smoke
- true p95 / throughput / memory budget harness

## Guardrails

- No backward-compatibility shims for obsolete surfaces
- No mock-only validation
- No manual edits in `dist/`
- No new dependency added without explicit request
