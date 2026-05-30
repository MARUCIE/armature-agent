---
Title: Orca CLI PDCA Iteration Checklist
Scope: project PDCA checklist
Owner: Maurice
Status: Active
LastUpdated: 2026-05-29
---
# Orca CLI PDCA Iteration Checklist

## 2026-05-03 - Claude Code Parity UX Audit

| Gate | Result | Evidence |
| --- | --- | --- |
| Plan | Pass | User-reported Claude Code parity gaps scoped to cancellation, slash clearing, aliases, capability panels, and dynamic command picker discovery |
| Do | Pass | Keybindings/abort, alias canonicalization, `/context`, `/export`, `/copy`, `/rewind`, `/memory`, `/skills`, `/agents`, `/mcp <name>`, project-local skill priority, and dynamic `/skills <name>` / `/agents <name>` / `/mcp <name>` picker entries implemented |
| Check | Pass | Targeted MCP/picker/slash pack -> `111`; `npm run lint`; `npm run build`; `npm test` -> `97` files / `1776` tests |
| Act | Pass | Claude parity audit report, task plan, PDCA execution plan, rolling ledger, README, and release evidence snapshot synced |

## 2026-05-03 - Markdown Artifact Write Integrity

| Gate | Result | Evidence |
| --- | --- | --- |
| Plan | Pass | Root cause isolated to false-save repair content selection, not `write_file` / `open_file` execution |
| Do | Pass | `local-file-intent.ts` artifact extraction, no-artifact non-repair, system prompt content contract, and regression tests updated |
| Check | Pass | Focused regression pack -> `45`; `npm run lint`; `npm run build`; `npm test` -> `91` files / `1665` tests |
| Act | Pass | PRD, architecture, UX map, optimization plan, task plan, notes, deliverable, and rolling ledger synced |

## 2026-05-02 - Tool-Call Continuity and Blackfin Mark

| Gate | Result | Evidence |
| --- | --- | --- |
| Plan | Pass | Long-session local-file failure, canonical tool-call matrix closure, and Hermes-style Orca mark refresh scoped together |
| Do | Pass | `streamChat()` system prompt persistence, local-file prompt contract, runtime local-file intent guard, false-save repair, `test:tool-calls` matrix layer, generated entrypoints, and `Banner.tsx` `ORCA-AGENT` clean-deck icon removal |
| Check | Pass | provider/system-prompt pack -> `22`; local-file guard pack -> `31`; `npm run lint`; `npm run test:tool-calls`; focused Ink UI pack -> `80`; `npm test` -> `91` files / `1663` tests; dist tool smoke passed; rendered Banner inspection confirmed new `ORCA-AGENT` first frame |
| Act | Pass | PRD, architecture, UX map, optimization plan, task plan, notes, deliverable, rolling ledger, and HTML companions synced |

## 2026-05-02 - Model Catalog SSoT Runtime Consolidation

| Gate | Result | Evidence |
| --- | --- | --- |
| Plan | Pass | `Model Catalog SSoT` tranche documented in task plan with canonical metadata, runtime, provider, output, and anti-drift test scope |
| Do | Pass | `src/model-metadata.ts`, `src/model-catalog.ts`, `src/token-budget.ts`, `src/providers/openai-compat.ts`, `src/output.ts`, and `tests/model-catalog.test.ts` updated |
| Check | Pass | focused model/runtime/provider pack -> `86`; `npm run lint`; `npm run build`; `npm test` -> `91` files / `1663` tests |
| Act | Pass | PRD, architecture, UX map, optimization plan, task plan, notes, deliverable, rolling ledger, README, release evidence snapshot, and HTML companions synced |

## 2026-05-02 - Terminal Operability Hardening

| Gate | Result | Evidence |
| --- | --- | --- |
| Plan | Pass | `Terminal Operability Hardening` tranche documented in task plan with copyable TUI, cwd, MCP, and `open_file` scope |
| Do | Pass | `AlternateScreen` / no-flicker opt-in, mouse tracking opt-in, workspace cwd resolver, root `--cwd`, MCP underscore/hyphen parser, Codex TOML parser widening, `open_file`, tests, README, and release evidence refresh |
| Check | Pass | targeted regression pack -> `250`; `npm run build`; root/chat help smoke; `orca doctor`; live Poe `read_file` smoke; `npm test` -> `91` files / `1663` tests |
| Act | Pass | PRD, architecture, UX map, optimization plan, task plan, notes, deliverable, rolling ledger, README, and release evidence snapshot synced |

## 2026-05-02 - Rubber Duck Critique Quality Gate

| Gate | Result | Evidence |
| --- | --- | --- |
| Plan | Pass | `Critique Quality Gate` tranche documented in task plan and local report alignment notes |
| Do | Pass | `src/critique.ts`, `src/critique-workspace.ts`, `src/critique-auto.ts`, `src/commands/critique.ts`, `/critique` slash inspection, automatic REPL and one-shot chat pre-send local hints, `--no-auto-critique` / `--auto-critique-threshold` controls, hook trust stabilization, command/slash registration, tests, README, active docs, and release evidence snapshot refresh |
| Check | Pass | targeted critique/slash/registry pack -> `70`; automatic hint pack -> `25`; chat option and one-shot pack -> `33`; hook module pack -> `47`; `npm run lint`; `npm run build`; `npm test -- tests/release-evidence.test.ts` -> `3`; `npm test` -> `89` files / `1642` tests; CLI dry-run JSON smoke passed; scoped diff and new-file whitespace checks passed |
| Act | Pass | PRD, architecture, UX map, optimization plan, task plan, notes, deliverable, rolling ledger, README, and HTML companions synced |

## 2026-05-01 - Pod Helm Footer UI/UX

| Gate | Result | Evidence |
| --- | --- | --- |
| Plan | Pass | `Pod Helm Footer` tranche documented in task plan and visual system plan |
| Do | Pass | `Footer.tsx` `POD HELM` / `interrupt echo` / `send brief` / `pod commands` copy, width-aware rendering, theme tokens, and focused Ink test updates |
| Check | Pass | `npm test -- tests/ink-ui.test.tsx` -> `79`; `npm run lint`; `npm run build`; `npm test -- tests/release-evidence.test.ts` -> `3`; `npm test` -> `88` files / `1627`; CLI version smoke -> `0.8.16`; scoped diff check passed |
| Act | Pass | PRD, architecture, UX map, optimization plan, task plan, visual plan, notes, deliverable, rolling ledger synced |

## 2026-05-01 - Pod Council Runway UI/UX

| Gate | Result | Evidence |
| --- | --- | --- |
| Plan | Pass | `Pod Council Runway` tranche documented in task plan and visual system plan |
| Do | Pass | `MultiModelProgress.tsx` `POD COUNCIL` / `voices` / `surfaced` / `sonar` copy, theme tokens, and focused Ink test updates |
| Check | Pass | `npm test -- tests/ink-ui.test.tsx` -> `79`; `npm run lint`; `npm run build`; `npm test -- tests/release-evidence.test.ts` -> `3`; `npm test` -> `88` files / `1627`; CLI version smoke -> `0.8.16`; scoped diff check passed |
| Act | Pass | PRD, architecture, UX map, optimization plan, task plan, visual plan, notes, deliverable, rolling ledger synced |

## 2026-05-01 - Pod Evidence Drawer UI/UX

| Gate | Result | Evidence |
| --- | --- | --- |
| Plan | Pass | `Pod Evidence Drawer` tranche documented in task plan and visual system plan |
| Do | Pass | `DetailPanel.tsx` `EVIDENCE DRAWER` / `pod scan` copy, theme tone tokens, and focused Ink test updates |
| Check | Pass | `npm test -- tests/ink-ui.test.tsx` -> `79`; `npm run lint`; `npm run build`; `npm test -- tests/release-evidence.test.ts` -> `3`; `npm test` -> `88` files / `1627`; CLI version smoke -> `0.8.16`; scoped diff check passed |
| Act | Pass | PRD, architecture, UX map, optimization plan, task plan, visual plan, notes, deliverable, rolling ledger synced |

## 2026-05-01 - Pod Trust Gate UI/UX

| Gate | Result | Evidence |
| --- | --- | --- |
| Plan | Pass | `Pod Trust Gate` tranche documented in task plan and visual system plan |
| Do | Pass | `PermissionPrompt.tsx` `TRUST GATE` / `SCAN` copy, `DiffPreview.tsx` `ECHO DIFF` copy, and focused Ink test updates |
| Check | Pass | `npm test -- tests/ink-ui.test.tsx` -> `79`; `npm run lint`; `npm run build`; `npm test -- tests/release-evidence.test.ts` -> `3`; `npm test` -> `88` files / `1627`; CLI version smoke -> `0.8.16`; scoped diff check passed |
| Act | Pass | PRD, architecture, UX map, optimization plan, task plan, visual plan, notes, deliverable, rolling ledger synced |

## 2026-05-01 - Pod Proof Wake UI/UX

| Gate | Result | Evidence |
| --- | --- | --- |
| Plan | Pass | `Pod Proof Wake` tranche documented in task plan and visual system plan |
| Do | Pass | `TurnSummary.tsx` `PROOF WAKE` copy and focused Ink test updates |
| Check | Pass | `npm test -- tests/ink-ui.test.tsx` -> `79`; `npm run lint`; `npm run build`; `npm test -- tests/release-evidence.test.ts` -> `3`; `npm test` -> `88` files / `1627`; CLI version smoke -> `0.8.16`; scoped diff check passed |
| Act | Pass | PRD, architecture, UX map, optimization plan, task plan, visual plan, notes, deliverable, rolling ledger synced |

## 2026-05-01 - Pod Status Rail UI/UX

| Gate | Result | Evidence |
| --- | --- | --- |
| Plan | Pass | `Pod Status Rail` tranche documented in task plan and visual system plan |
| Do | Pass | `StatusBar.tsx` sonar / signal / trust rail copy and focused Ink test updates |
| Check | Pass | `npm test -- tests/ink-ui.test.tsx` -> `79`; `npm run lint`; `npm run build`; `npm test -- tests/release-evidence.test.ts` -> `3`; `npm test` -> `88` files / `1627`; CLI version smoke -> `0.8.16`; scoped diff check passed |
| Act | Pass | PRD, architecture, UX map, optimization plan, task plan, visual plan, notes, deliverable, rolling ledger synced |

## 2026-05-01 - Pod Transcript Flow UI/UX

| Gate | Result | Evidence |
| --- | --- | --- |
| Plan | Pass | `Pod Transcript Flow` tranche documented in task plan and visual system plan |
| Do | Pass | `App.tsx`, `ToolCallBlock.tsx`, `ThinkingSpinner.tsx`, focused Ink test updates |
| Check | Pass | `npm test -- tests/ink-ui.test.tsx` -> `78`; `npm run lint`; `npm run build`; `npm test -- tests/release-evidence.test.ts` -> `3`; `npm test` -> `88` files / `1626`; CLI version smoke -> `0.8.16`; scoped diff check passed |
| Act | Pass | PRD, architecture, UX map, optimization plan, task plan, visual plan, notes, deliverable, rolling ledger synced |

## 2026-05-01 - Pod Command Surface UI/UX

| Gate | Result | Evidence |
| --- | --- | --- |
| Plan | Pass | `Pod Command Surface` tranche documented in task plan and visual system plan |
| Do | Pass | `PickerFrame.tsx`, `CommandPicker.tsx`, `OptionPicker.tsx`, `InputArea.tsx`, focused Ink test updates |
| Check | Pass | `npm test -- tests/ink-ui.test.tsx` -> `78`; `npm run lint`; `npm run build`; `npm test -- tests/release-evidence.test.ts` -> `3`; `npm test` -> `88` files / `1626`; CLI version smoke -> `0.8.16`; scoped diff check passed |
| Act | Pass | PRD, architecture, UX map, optimization plan, task plan, visual plan, notes, deliverable, rolling ledger synced |

## 2026-05-01 - Cute Orca Mascot UI/UX

| Gate | Result | Evidence |
| --- | --- | --- |
| Plan | Superseded | Hermes-inspired wordmark + mascot + state-panel structure was documented, then superseded on 2026-05-02 by the clean wordmark + state deck startup rule |
| Do | Superseded | `Banner.tsx` mascot/icon art removed later; `HomePanel.tsx` `POD BRIEF` and focused Ink test updates remain active |
| Check | Pass | `npm test -- tests/ink-ui.test.tsx` -> `77`; `npm run lint`; `npm run build`; `npm test -- tests/release-evidence.test.ts` -> `3`; `npm test` -> `88` files / `1625`; CLI version smoke -> `0.8.16` |
| Act | Pass | PRD, architecture, UX map, optimization plan, task plan, notes, deliverable, rolling ledger synced |

## 2026-05-01 - Killer-Whale / Ocean Joint Motif Correction

| Gate | Result | Evidence |
| --- | --- | --- |
| Plan | Pass | Brand hierarchy clarified: killer whale primary, ocean field, pod intelligence product metaphor |
| Do | Pass | `ORCA_VISUAL_SYSTEM_PLAN.md/html`, `Blackfin Signal`, `Blackfin Pod Deck`, `POD SIGNAL`, `ORCA POD` |
| Check | Pass | `rg` drift scan; `npm run lint`; `npm run build`; `npm test` -> `88` files / `1625` tests |
| Act | Pass | Notes and deliverable updated with full verification evidence |

## 2026-04-30 - Orca Visual System PDCA

| Gate | Result | Evidence |
| --- | --- | --- |
| Plan | Pass | `ORCA_VISUAL_SYSTEM_PLAN.md`, `ORCA_VISUAL_SYSTEM_PLAN.html`, `task_plan.md` ORCA-VIS queue |
| Do | Pass | Killer-whale `Blackfin Signal` identity in `src/ui/theme.tsx`, `Banner.tsx`, `HomePanel.tsx`, `ThemePicker.tsx`, `StatusBar.tsx` |
| Check | Pass | `npm test -- tests/ink-ui.test.tsx` -> `77`; `npm run lint`; `npm run build`; `ORCA_THEME=orca node dist/bin/orca.js --version` -> `0.8.16`; `npm test` -> `88` files / `1625` tests |
| Act | Pass | PRD, architecture, UX map, optimization plan, checklist, notes, deliverable, rolling ledger synced; `ai check` attempted but hung and is recorded as residual gate risk |

## 2026-04-29 - SOTA Swarm Audit Tranche

| Gate | Result | Evidence |
| --- | --- | --- |
| Plan | Pass | `SOTA_GAP_SWARM_AUDIT.md` milestones and atomic task queue |
| Do | Pass | Hook trust hardening, network-tool approval/guard, `orca queue list/show/follow/takeover/evidence/resume/schedule`, `serve /chat` canonical TaskRun records, `orca run` default/goal-loop/mission/plan TaskRun records, shared slash-command registry, release evidence snapshot guard, CI gate integrity, clean-index command baseline, chat operator control plane, chat REPL TaskRun records, Ink `/evidence <task-run-id>` TaskRun evidence detail panel, visible submitted prompts, structured assistant response panels, review-before-apply approval timeline |
| Check | Pass | `npm run lint`, `npm run build`, `npm test` -> `88` files / `1623` tests |
| Act | Pass | ORCA-SWARM-018, ORCA-SWARM-019, ORCA-SWARM-020, and ORCA-SWARM-021 completed; remaining queue shifts to richer replay metadata |

## Baseline Checklist

- [x] Confirm `PROJECT_DIR`
- [x] Establish project-level `AGENTS.md` / `CLAUDE.md` / `CODEX.md` / `GEMINI.md`
- [x] Create canonical project doc tree under `doc/00_project/initiative_orca/`
- [x] Write path index and architecture / UX summaries from actual source files
- [x] Capture initial rolling requirement entry
- [x] Run repo-level verification for this bootstrap task (`npm run lint`, `npm test`)
- [x] Run task-specific code verification for the current swarm-audit closeout (`eval:nightly`, `eval:release`, targeted runner regressions)
- [x] Perform simulated manual UX verification for current user-facing continuity/trust surfaces (`outputs/manual-cli-smoke/run-20260421-154536/`)

## Large-Scale Test Expansion Planning

- [x] Measure and refresh the current deterministic baseline (`npm test` => `1553/1553`, up from the planning-start `1263/1263`)
- [x] Generate repo-root `AGENT_EVAL_PLAN.md`
- [x] Define breadth lanes, depth lanes, and fast / nightly / release gates in canonical docs
- [x] Identify the first command-surface gap tranche (`pr`, `session`, `serve`, `run`, `providers test`, root/bin, packaging)
- [x] Scaffold `agent-eval/` tasks and graders (`ai agent-eval /Users/mauricewen/Projects/orca-cli init --owner "Maurice"`)
- [x] Add the first breadth tranche to the deterministic suite
- [x] Add the first depth tranche to the deterministic suite
- [x] Add packaging / install / bin-entry release smokes
- [x] Record release-gate evidence in `deliverable.md` and `notes.md`
- [x] Perform simulated manual CLI journey verification for the release gate
- [x] Add a dedicated `tool-calls` matrix layer for built-in tools, proxy tool loops, MCP routing, one-shot cleanup, prompt assembly, and local-file tool rules

## SOTA Experience Program

- [x] Create a competitive research baseline across Claude Code, Codex, Amp, Kilo Code, OpenCode, and GitHub Copilot
- [x] Write canonical competitive report (`SOTA_EXPERIENCE_GAP_REPORT.md`)
- [x] Add human-readable HTML companion (`SOTA_EXPERIENCE_GAP_REPORT.html`)
- [x] Convert competitive findings into wave-based PDCA priorities
- [x] Execute a swarm audit to tighten the benchmark into continuity / queue / evidence / trust work items (`SOTA_GAP_SWARM_AUDIT.md`)
- [x] Finish Wave 0 picker/search-picker/operator-shell UX tranche
- [x] Execute Wave 1 session lifecycle productization
- [x] Execute Wave 2 approval / trust UX productization
- [x] Execute Wave 3 workflow preset productization
- [ ] Execute Wave 4 remote / IDE / web continuity tranche
- [ ] Add visible performance instrumentation wave

## One-click Full Delivery Pass (2026-04-22)

- [x] Establish delivery boundary and explicit P0/P1 acceptance items
- [x] Generate stage plan for `Spec`, `Build`, `Test`, `Security`, `Release`, `Observe`, `Learn`
- [x] Run parallel planning / verification / review / security subagent lanes
- [x] Convert review/security findings into blocking release gates
- [x] Fix scoped blockers and rerun targeted verification
- [x] Refresh full verification chain (`lint`, `test`, `build`, `test:matrix`, `eval:nightly`, `eval:release`)
- [x] Refresh security / pack / bench evidence into `outputs/<stage>/`
- [x] Generate executable rollback path for repo-impacting changes
- [x] Record supervision rounds (`hypothesis → action → validation → learning → next`)
- [x] Close deliverable with remaining-risk owners, deadlines, and mitigations

## Changelog

| Date | Change |
| --- | --- |
| 2026-05-29 | Normalized metadata for the project ai check gate and recorded the multi-model review ledger integration. |
