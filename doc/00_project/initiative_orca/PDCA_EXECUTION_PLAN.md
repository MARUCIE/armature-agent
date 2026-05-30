# Orca CLI PDCA Execution Plan

## 2026-05-02 - Model Catalog SSoT Runtime Consolidation PDCA

- Plan:
  - Close the remaining model-routing evidence drift risk by giving runtime, provider, output, and picker surfaces one metadata source.
  - Keep the tranche scoped to metadata consolidation and regression guards, not a provider-routing redesign.
- Do:
  - Added `src/model-metadata.ts` for canonical context windows, max output defaults, pricing tiers, and formatting helpers.
  - Updated `src/model-catalog.ts` to re-export metadata helpers while preserving provider-aware choices and caution rules.
  - Updated `src/token-budget.ts` to use canonical context/max-output metadata.
  - Updated `src/providers/openai-compat.ts` to use canonical context guard and max-token defaults.
  - Updated `src/output.ts` to use canonical capacity labels and pricing for usage/session cost estimates.
  - Added regression coverage that blocks reintroduced metadata tables in runtime consumers.
- Check:
  - `npm test -- tests/model-catalog.test.ts tests/context-protection.test.ts tests/agent-intelligence.test.ts tests/openai-compat-multimodal.test.ts` -> `86` tests passed.
  - `npm run lint` -> pass.
  - `npm run build` -> pass.
  - `npm test` -> `97` files / `1776` tests passed.
- Act:
  - Updated PRD, architecture, UX map, optimization plan, task plan, notes, deliverable, rolling ledger, README, release evidence snapshot, and HTML companions.

## 2026-05-02 - Terminal Operability Hardening PDCA

- Plan:
  - Fix Orca's Ink terminal behavior so default output is copyable and does not flicker through alternate-screen startup.
  - Make tool calls stable from launcher/home/random directories by resolving a durable project cwd.
  - Repair MCP tool routing for underscore/hyphen server names and add a local file-opening tool for Markdown/PDF/image workflows.
- Do:
  - Made `AlternateScreen` opt-in through `ORCA_ALT_SCREEN=1`.
  - Added Claude-style no-flicker aliases through `ORCA_TUI=fullscreen`, `ORCA_NO_FLICKER=1`, and `CLAUDE_CODE_NO_FLICKER=1`.
  - Moved no-flicker alternate-screen entry before Ink's first frame and capped rendered history in no-flicker mode.
  - Made mouse tracking opt-in through `ORCA_MOUSE=1`.
  - Added workspace cwd resolution and last-workspace memory in `chat-support`.
  - Forwarded root `orca --cwd <dir>` into `orca chat`.
  - Added `parseMcpToolName()` and widened Codex TOML MCP server-name parsing.
  - Added `open_file` as the 42nd built-in tool and marked it dangerous for permission policy.
  - Refreshed README, tests, and release evidence snapshot.
- Check:
  - Targeted regression pack -> `250` tests passed.
  - `npm run build` -> pass.
  - `node dist/bin/orca.js --help` -> `42 tools`, `--cwd`, and `critique` visible.
  - `node dist/bin/orca.js doctor` -> provider OK and `14` MCP configs discovered.
  - Live Poe one-shot tool smoke -> model used `read_file`; tool result succeeded; final answer `Orca CLI`.
  - `npm test` -> `97` files / `1776` tests passed.
- Act:
  - Updated PRD, architecture, UX map, optimization plan, task plan, notes, deliverable, rolling ledger, README, and release evidence snapshot.

## 2026-05-02 - Rubber Duck Critique Quality Gate PDCA

- Plan:
  - Add the report-derived read-only critique gate as a separate workflow from `reflect`.
  - Keep implementation bounded to critique service, command surface, tests, README, and active docs.
- Do:
  - Added `src/critique.ts` for checkpoints, weighted risk scoring, complementary reviewer selection, prompt assembly, and JSON parsing.
  - Added `src/critique-workspace.ts` to share workspace diff/risk/prompt inspection across CLI and slash entrypoints.
  - Added `src/commands/critique.ts` for `orca critique` with dry-run, JSON, plan/log/diff inputs, and risk flags.
  - Added `/critique` in `src/commands/chat-slash-readonly.ts` with legacy output and Ink detail panel rendering.
  - Added `src/critique-auto.ts` and REPL pre-send integration for one-shot local dirty-diff hints that recommend `/critique` without model calls.
  - Exposed `orca chat --no-auto-critique` and `orca chat --auto-critique-threshold <score>` for session-scoped automatic hint control.
  - Extended the automatic local hint to one-shot `orca chat "prompt"` streaming runs while preserving clean `--json` output.
  - Registered the command and slash discovery surfaces; added focused unit, slash, registry, and contract coverage.
  - Fixed hook trust evaluation at `HookManager.load()` after full-suite verification exposed a project-hook singleton env drift.
  - Refreshed `verification_snapshot.json` and README/PDCA counts after the new tests changed full-suite evidence.
- Check:
  - `npm test -- tests/critique.test.ts tests/program.test.ts tests/command-contracts.test.ts` -> `42` tests passed.
  - `npm test -- tests/critique.test.ts tests/chat-slash-readonly.test.ts tests/command-picker.test.ts tests/slash-commands.test.ts tests/program.test.ts tests/command-contracts.test.ts` -> `70` tests passed.
  - `npm test -- tests/critique.test.ts tests/chat-repl-turn.test.ts` -> `25` tests passed.
  - `npm test -- tests/chat-one-shot-mcp-cleanup.test.ts tests/chat-repl-turn.test.ts tests/command-contracts.test.ts` -> `33` tests passed.
  - `npm test -- tests/v050-modules.test.ts` -> `47` tests passed.
  - `npm run lint` -> pass.
  - `npm run build` -> pass.
  - `npm test -- tests/release-evidence.test.ts` -> `3` tests passed after snapshot refresh.
  - `npm test` -> `89` files / `1642` tests passed.
  - `node dist/bin/orca.js critique --dry-run --json "review current diff"` -> valid JSON.
  - Scoped `git diff --check -- <tracked critique tranche files>` -> pass.
  - New-file trailing whitespace scan for `src/critique.ts`, `src/commands/critique.ts`, and `tests/critique.test.ts` -> pass.
- Act:
  - Updated PRD, architecture, UX map, optimization plan, task plan, notes, deliverable, rolling ledger, README, and HTML companions.

## 2026-05-01 - Pod Helm Footer UI/UX PDCA

- Plan:
  - Extend the Orca killer-whale / pod identity into the persistent shortcut footer.
  - Keep the change bounded to Footer rendering, focused tests, and active docs.
- Do:
  - Added `POD HELM` to the footer rail.
  - Changed generating copy to `interrupt echo`.
  - Changed active and idle labels to `send brief` and `pod commands`.
  - Preserved `enter`, `ctrl+j`, `/help`, `shift+tab`, permission-mode, and permission-source visibility.
  - Used terminal width to keep ordinary-width footers compact and avoid broken text wrapping.
  - Replaced dim-only footer styling with active theme semantic tokens.
  - Updated focused Ink UI tests.
- Check:
  - `npm test -- tests/ink-ui.test.tsx` -> `79` tests passed.
  - `npm run lint` -> pass.
  - `npm run build` -> pass.
  - `npm test -- tests/release-evidence.test.ts` -> `3` tests passed.
  - `npm test` -> `88` files / `1627` tests passed.
  - `ORCA_THEME=orca node dist/bin/orca.js --version` -> `0.8.16`.
  - `git diff --check -- <changed tranche files>` -> pass.
- Act:
  - Updated PRD, architecture, UX map, optimization plan, task plan, visual plan, notes, deliverable, and rolling ledger.

## 2026-05-01 - Pod Council Runway UI/UX PDCA

- Plan:
  - Extend the Orca killer-whale / pod intelligence identity into live multi-model progress.
  - Keep the change bounded to MultiModelProgress rendering, focused tests, and active docs.
- Do:
  - Changed the progress header to `POD COUNCIL · <command>`.
  - Changed model count copy to `voices`.
  - Changed completed row copy from `ok` to `surfaced`.
  - Added `sonar` copy beside the active spinner.
  - Replaced hard-coded `cyan` and `green` colors with theme semantic tokens.
  - Preserved `ModelProgress`, council/race/pipeline runtime behavior, spinner dependency behavior, model names, and elapsed time.
  - Updated focused Ink UI tests.
- Check:
  - `npm test -- tests/ink-ui.test.tsx` -> `79` tests passed.
  - `npm run lint` -> pass.
  - `npm run build` -> pass.
  - `npm test -- tests/release-evidence.test.ts` -> `3` tests passed.
  - `npm test` -> `88` files / `1627` tests passed.
  - `ORCA_THEME=orca node dist/bin/orca.js --version` -> `0.8.16`.
  - `git diff --check -- <changed tranche files>` -> pass.
- Act:
  - Updated PRD, architecture, UX map, optimization plan, task plan, visual plan, notes, deliverable, and rolling ledger.

## 2026-05-01 - Pod Evidence Drawer UI/UX PDCA

- Plan:
  - Extend the Orca killer-whale / pod identity into detail panels that surface status, permission, notes, thread, and TaskRun evidence.
  - Keep the change bounded to DetailPanel rendering, focused tests, and active docs.
- Do:
  - Changed detail panel title rendering to `EVIDENCE DRAWER · <title>`.
  - Added `pod scan` subtitle context while preserving original subtitle metadata.
  - Replaced hard-coded `cyan`, `yellow`, and `red` panel borders with theme semantic tokens.
  - Preserved `DetailPanelInfo`, slash-command behavior, evidence body construction, and MarkdownText rendering.
  - Updated focused Ink UI tests.
- Check:
  - `npm test -- tests/ink-ui.test.tsx` -> `79` tests passed.
  - `npm run lint` -> pass.
  - `npm run build` -> pass.
  - `npm test -- tests/release-evidence.test.ts` -> `3` tests passed.
  - `npm test` -> `88` files / `1627` tests passed.
  - `ORCA_THEME=orca node dist/bin/orca.js --version` -> `0.8.16`.
  - `git diff --check -- <changed tranche files>` -> pass.
- Act:
  - Updated PRD, architecture, UX map, optimization plan, task plan, visual plan, notes, deliverable, and rolling ledger.

## 2026-05-01 - Pod Trust Gate UI/UX PDCA

- Plan:
  - Extend the Orca killer-whale / pod identity into approval and write-review boundaries.
  - Keep the change bounded to PermissionPrompt rendering, DiffPreview rendering, focused tests, and active docs.
- Do:
  - Changed permission prompt title to `TRUST GATE · <tool>`.
  - Grouped the approval preview under `SCAN`.
  - Retuned approval choice descriptions to explain once/session/project trust scope and deny posture.
  - Changed write diff preview header to `ECHO DIFF`.
  - Preserved approval keybindings, decision payload semantics, diff algorithm, and runtime event contracts.
  - Updated focused Ink UI tests.
- Check:
  - `npm test -- tests/ink-ui.test.tsx` -> `79` tests passed.
  - `npm run lint` -> pass.
  - `npm run build` -> pass.
  - `npm test -- tests/release-evidence.test.ts` -> `3` tests passed.
  - `npm test` -> `88` files / `1627` tests passed.
  - `ORCA_THEME=orca node dist/bin/orca.js --version` -> `0.8.16`.
  - `git diff --check -- <changed tranche files>` -> pass.
- Act:
  - Updated PRD, architecture, UX map, optimization plan, task plan, visual plan, notes, deliverable, and rolling ledger.

## 2026-05-01 - Pod Proof Wake UI/UX PDCA

- Plan:
  - Extend the Orca killer-whale / pod identity into the compact post-turn summary.
  - Keep the change bounded to TurnSummary rendering, focused tests, and active docs.
- Do:
  - Changed the post-turn label to `PROOF WAKE`.
  - Replaced `r/d/u` shorthand with explicit `time`, `in`, `out`, `tools`, cost, and `tok/s`.
  - Preserved the existing `TurnSummaryInfo` shape and accounting calculations.
  - Updated focused Ink UI tests.
- Check:
  - `npm test -- tests/ink-ui.test.tsx` -> `79` tests passed.
  - `npm run lint` -> pass.
  - `npm run build` -> pass.
  - `npm test -- tests/release-evidence.test.ts` -> `3` tests passed.
  - `npm test` -> `88` files / `1627` tests passed.
  - `ORCA_THEME=orca node dist/bin/orca.js --version` -> `0.8.16`.
  - `git diff --check -- <changed tranche files>` -> pass.
- Act:
  - Updated PRD, architecture, UX map, optimization plan, task plan, visual plan, notes, deliverable, and rolling ledger.

## 2026-05-01 - Pod Status Rail UI/UX PDCA

- Plan:
  - Extend the Orca killer-whale / pod identity into the fixed StatusBar.
  - Keep the change bounded to status rendering, focused tests, and active docs.
- Do:
  - Added `sonar` context language to the first status line while preserving `ORCA POD`, model, context bar, percentage, and branch.
  - Prefixed available metrics with `signal:` while preserving cost, throughput, turns, session id, policy summaries, output style, and sparkline.
  - Changed permission posture copy to `trust:` and retuned guidance to `shift+tab cycles trust`.
  - Updated focused Ink UI tests.
- Check:
  - `npm test -- tests/ink-ui.test.tsx` -> `79` tests passed.
  - `npm run lint` -> pass.
  - `npm run build` -> pass.
  - `npm test -- tests/release-evidence.test.ts` -> `3` tests passed.
  - `npm test` -> `88` files / `1627` tests passed.
  - `ORCA_THEME=orca node dist/bin/orca.js --version` -> `0.8.16`.
  - `git diff --check -- <changed tranche files>` -> pass.
- Act:
  - Updated PRD, architecture, UX map, optimization plan, task plan, visual plan, notes, deliverable, and rolling ledger.

## 2026-05-01 - Pod Transcript Flow UI/UX PDCA

- Plan:
  - Extend the Orca killer-whale / pod identity into live transcript roles, tool rails, and thinking feedback.
  - Keep the change bounded to Ink rendering components, focused tests, and active docs.
- Do:
  - Changed user prompt blocks to `POD BRIEF`.
  - Changed assistant response panels to `ORCA POD` and streaming copy to `echoing`.
  - Added `ECHO TOOL` to active and completed tool rails.
  - Replaced broad generic thinking verbs with compact Orca / pod / proof-oriented verbs.
  - Updated focused Ink UI tests.
- Check:
  - `npm test -- tests/ink-ui.test.tsx` -> `78` tests passed.
  - `npm run lint` -> pass.
  - `npm run build` -> pass.
  - `npm test -- tests/release-evidence.test.ts` -> `3` tests passed.
  - `npm test` -> `88` files / `1626` tests passed.
  - `ORCA_THEME=orca node dist/bin/orca.js --version` -> `0.8.16`.
  - `git diff --check -- <changed tranche files>` -> pass.
- Act:
  - Updated PRD, architecture, UX map, optimization plan, task plan, visual plan, notes, deliverable, and rolling ledger.

## 2026-05-01 - Pod Command Surface UI/UX PDCA

- Plan:
  - Extend the Orca killer-whale / pod identity from the first frame into high-frequency operation surfaces.
  - Keep the change bounded to input, command picker, option picker, shared picker frame, focused tests, and active docs.
- Do:
  - Made `PickerFrame.tsx` theme-aware.
  - Reframed `CommandPicker.tsx` as `POD COMMANDS` with `echo filter` and no-match feedback.
  - Updated `OptionPicker.tsx` to use Orca semantic tokens for selection, labels, descriptions, and scroll affordances.
  - Retuned `InputArea.tsx` placeholder and multiline hint to pod briefing language.
  - Updated focused Ink UI tests.
- Check:
  - `npm test -- tests/ink-ui.test.tsx` -> `78` tests passed.
  - `npm run lint` -> pass.
  - `npm run build` -> pass.
  - `npm test -- tests/release-evidence.test.ts` -> `3` tests passed.
  - `npm test` -> `88` files / `1626` tests passed.
  - `ORCA_THEME=orca node dist/bin/orca.js --version` -> `0.8.16`.
  - `git diff --check -- <changed tranche files>` -> pass.
  - Full `git diff --check` remains blocked by pre-existing trailing whitespace in root `AGENTS.md`, outside this tranche.
- Act:
  - Updated PRD, architecture, UX map, optimization plan, task plan, visual plan, notes, deliverable, and rolling ledger.

## 2026-05-01 - Cute Orca Mascot UI/UX PDCA

Superseded on 2026-05-02 for startup Banner art: the separate mascot/icon block is deleted. `POD BRIEF` HomePanel language remains active.

- Plan:
  - Learn Hermes's logo implementation structure: wordmark + status panel.
  - Keep Orca original without copying Hermes caduceus and without rendering a separate startup mascot/icon.
- Do:
  - The former `ORCA_MASCOT_LINES` path was later removed from the startup Banner.
  - Updated HomePanel primary entry from `MISSION` to `POD BRIEF`.
  - Updated focused Ink UI tests for clean startup deck and first-screen copy.
- Check:
  - `npm test -- tests/ink-ui.test.tsx` -> `77` tests passed.
  - `npm run lint` -> pass.
  - `npm run build` -> pass.
  - `npm test -- tests/release-evidence.test.ts` -> `3` tests passed.
  - `npm test` -> `88` files / `1625` tests passed.
  - `ORCA_THEME=orca node dist/bin/orca.js --version` -> `0.8.16`.
- Act:
  - Updated PRD, architecture, UX map, optimization plan, task plan, notes, deliverable, and rolling ledger.

## 2026-05-01 - Killer-Whale / Ocean Joint Motif Correction

- Plan:
  - Clarify the brand hierarchy: killer whale is the primary motif, ocean is the field motif, and pod intelligence is the product metaphor.
  - Prevent future wording from drifting back into generic ocean / deep-sea branding.
- Do:
  - Updated `ORCA_VISUAL_SYSTEM_PLAN.md` and `.html` with the explicit hierarchy.
  - Kept the shipped UI naming aligned to `Blackfin Signal`, `Blackfin Pod Deck`, `POD SIGNAL`, and `ORCA POD`.
- Check:
  - `rg` drift scan found only historical correction notes for `Abyssal -> Blackfin`, not active source naming.
  - `npm run lint` -> pass.
  - `npm run build` -> pass.
  - `npm test` -> `88` files / `1625` tests passed.
- Act:
  - Updated notes and deliverable with full verification evidence.

## 2026-04-30 - Visual System PDCA Execution

- Design source: `ORCA_VISUAL_SYSTEM_PLAN.md`
- Human companion: `ORCA_VISUAL_SYSTEM_PLAN.html`
- Plan source: `task_plan.md` ORCA-VIS queue
- Plan:
  - Adopt `Blackfin Signal` as Orca's terminal identity.
  - Learn Hermes's high-recognition mechanics without copying its caduceus or exact gold-only palette.
  - Anchor Orca's identity in the killer whale idea: blackfin, pod, dorsal-fin silhouette, and echolocation.
  - Keep implementation in the existing Ink UI system and avoid new dependencies.
- Do:
  - Added semantic `Blackfin Signal` theme tokens and made them the default dark theme.
  - Updated startup Banner, HomePanel, ThemePicker, and StatusBar copy / hierarchy.
  - Preserved existing alternate themes and narrow-terminal fallback behavior.
- Check:
  - `npm test -- tests/ink-ui.test.tsx` -> `77` tests passed
  - `npm run lint` -> pass
  - `npm run build` -> pass
  - `ORCA_THEME=orca node dist/bin/orca.js --version` -> `0.8.16`
  - `npm test -- tests/release-evidence.test.ts` -> `3` tests passed
  - `npm test` -> `88` files / `1625` tests passed
  - `ai check` attempted but hung without output; interrupted child processes from `runtime/control_plane/check_cli.py` / `tests/test_all.py`
- Act:
  - Updated PRD, architecture, UX map, optimization plan, checklist, notes, deliverable, and rolling ledger.
  - No new skill or root agent-rule update was promoted because this is project-specific visual system work.

## 2026-04-29 - Queue and Swarm PDCA Execution

- Audit source: `SOTA_GAP_SWARM_AUDIT.md`
- Plan source: `task_plan.md`
- Done tranche:
  - explicit project hook trust
  - hook env allowlist
  - `fetch_url` / `web_search` approval gating
  - private/loopback `fetch_url` guard
  - `orca queue list/show/follow/takeover/evidence`
  - `serve /chat` canonical `WorkSession` / `TaskRun` records
  - shared slash-command registry for REPL completion, Ink picker, and `/help`, with HomePanel hint metadata prepared for a later UI-baseline split
  - release evidence snapshot guard for README and active PDCA docs
  - CI gate integrity job for matrix sync, static, security, performance, and fast agent-eval gates
  - `orca run` default / goal-loop / mission / plan WorkSession and TaskRun records
  - clean-index command baseline for workflow presets, `permissions`, `evolve`, and git-root helper support
  - chat operator control plane for sessions, permissions, model picking, command output, and Ink home/detail panels
  - chat REPL turn lifecycle now writes canonical WorkSession / TaskRun records with per-turn status and usage
  - `/evidence <task-run-id>` opens the shared TaskRun evidence drawer inside the Ink `DetailPanel`
  - submitted Ink prompts render as highlighted transcript blocks and assistant markdown renders in structured response panels
  - review-before-apply approvals append to `TaskRun.approvals` and render in the shared CLI / Ink evidence drawer
  - `orca queue resume` claims a resume lease and prints a concrete `orca chat --continue <saved-session-id>` command for resumable chat TaskRuns
  - `orca queue schedule` claims the next unleased resumable or monitorable TaskRun and prints the recovery action
- Check evidence:
  - `npm run lint`
  - `npm run build`
  - `npm test` -> `88` files / `1623` tests
  - `npm test -- tests/work-session-store.test.ts tests/queue-command.test.ts` -> `17` tests
  - `npm test -- tests/work-session-store.test.ts tests/queue-command.test.ts tests/chat-proxy-tool-call.test.ts` -> `40` tests
  - `npm test -- tests/ink-ui.test.tsx tests/chat-session-emitter.test.ts` -> `84` tests
  - `npm test -- tests/queue-command.test.ts tests/chat-slash-readonly.test.ts tests/slash-commands.test.ts tests/ink-ui.test.tsx` -> `108` tests
  - `npm test -- tests/chat-repl-turn.test.ts tests/work-session-store.test.ts` -> `19` tests
  - `npm test -- tests/queue-command.test.ts tests/work-session-store.test.ts` -> `11` tests
  - `npm test -- tests/slash-commands.test.ts tests/chat-slash-readonly.test.ts tests/ink-ui.test.tsx` -> `98` tests
  - `npm test -- tests/release-evidence.test.ts` -> `3` tests
  - `npm test -- tests/run-work-session.test.ts tests/work-session-store.test.ts tests/queue-command.test.ts` -> `14` tests
  - clean staged-index `npm run build`
  - clean staged-index chat/operator-control regression pack -> `248` tests
  - `npm run test:matrix:sync`
  - `npm run test:static`
  - `npm run test:security`
  - `npm run test:performance`
  - `npm run test:ai-eval-fast`
  - gate evidence: `outputs/test-matrix/run-20260429-060205`, `run-20260429-060222`, `run-20260429-060232`, `run-20260429-060243`
- Act queue:
  - attach richer structured evidence bundles to serve/background TaskRuns

## Plan

- Use the initiative docs as the single project-level planning surface.
- Ground architecture and UX descriptions in actual source files.
- Lock the real current baseline (`1280/1280` in the latest full run) before proposing any new test-growth target.
- Define separate breadth lanes, depth lanes, and fast / nightly / release gates so the large-scale quality program stays auditable.
- Use `SOTA_EXPERIENCE_GAP_REPORT.md` as the canonical competitive-gap source before choosing the next Orca UX tranche.
- Use `SOTA_GAP_SWARM_AUDIT.md` to tighten the benchmark into concrete continuity / queue / evidence / trust work items.
- Prioritize operator-surface deltas over isolated command additions:
  1. session lifecycle productization
  2. approval / trust UX
  3. inspect-and-act detail panels
  4. remote / IDE / web continuity

## Do

- Implement changes in `src/` or tests as required by the active task.
- Update project docs in the same task when system boundaries or user flows change.
- Fill `AGENT_EVAL_PLAN.md` with Orca-specific task / grader / evidence requirements.
- Scaffold `agent-eval/` and add new deterministic suites by matrix lane rather than through ad hoc file growth.
- Execute the SOTA experience program in waves:
  - Wave 0: unified picker + searchable picker + shared picker shell
  - Wave 1: fork/share/export/import/handoff + inspect detail panels
  - Wave 2: explicit approval / sandbox policy surface
  - Wave 3: workflow presets (`review`, `debug`, `ship`, `research`, `quick assist`)
  - Wave 4: remote / web / IDE continuity
  - Wave 5: visible performance instrumentation

## Check

- Default: `npm run lint` and `npm test`
- Add `npm run build` when command assembly or packaging changes
- Add `npm run bench` when benchmark- or capability-facing behavior changes
- Fast gate: `550-650` selected deterministic cases + `12` task-eval scenarios
- Nightly gate: `~1700` deterministic cases + `36` task-eval scenarios
- Release gate: `~2210` deterministic cases + `72` task-eval scenarios + packaging/bin smokes + manual CLI journey review
- Current 2026-04-21 swarm-audit evidence refresh:
  - `agent-eval/runs/20260421-074245-714923/`
  - `agent-eval/runs/20260421-074333-249714/`
  - `outputs/manual-cli-smoke/run-20260421-154536/`

## Act

- Record evidence and residual gaps in `deliverable.md`
- Roll forward requirements and anti-regression notes in `ROLLING_REQUIREMENTS_AND_PROMPTS.md`
- Update `AGENT_EVAL_PLAN.md` whenever task families, grader rules, or gate thresholds change
- Re-rank SOTA gaps after every completed wave so the next tranche is selected from fresh evidence, not stale assumptions
- Treat trust hardening as part of Wave 4 delivery, not as a postscript after continuity work lands.
