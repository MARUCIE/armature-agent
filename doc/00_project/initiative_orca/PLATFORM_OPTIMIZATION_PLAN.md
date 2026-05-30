---
Title: Orca CLI Platform Optimization Plan
Scope: project optimization plan
Owner: Maurice
Status: Active
LastUpdated: 2026-05-29
---
# Orca CLI Platform Optimization Plan

## 2026-05-29 Optimization Delta - Multi-Model Review Ledger

The large-PR review workflow is now integrated as an Orca CLI command:

1. Multi-model review pod:
   - `orca review-ledger` runs independent model review prompts for the same PR/diff.
   - Reviewer model lists are explicit with `--models <csv>`, so operators can combine GPT, Composer, Deepseek, Claude, Gemini, or any routed model.
2. Human-gated review ledger:
   - synthesis writes Critical / High / Medium findings with checkbox rows and agreement counts
   - decisions remain `pending` until a human marks `accepted`, `rejected`, or `deferred`
3. Fix/review/E2E separation:
   - fix agents update `06_fix_log.md`
   - review agents update `07_review_verdict.md`
   - final regression evidence is recorded in `08_e2e_evidence.md`
4. Deterministic local validation:
   - `--dry-run --json` writes prompts/templates without model calls
   - targeted tests cover prompt contracts, dry-run artifact generation, live mocked reviewer/judge orchestration, and command registration
5. Verification:
   - `npm run build` passed
   - `vitest run tests/review-ledger.test.ts tests/program.test.ts tests/command-contracts.test.ts` passed with `44/44` tests
   - dist-level dry-run smoke wrote `10` review artifacts under `/tmp/orca-review-ledger-smoke`

## 2026-05-03 Optimization Delta - Claude Code Parity UX

The Claude Code parity UX tranche is complete:

1. Cancellation and input lifecycle:
   - Esc/Ctrl-C now propagate active-turn aborts through the chat session and provider layer
   - slash commands clear from the input after dispatch instead of remaining as stale text
2. Command surface:
   - added Claude-compatible aliases and daily commands for usage/settings/resume/jobs/reset/new/context/export/copy/rewind
   - added `/memory`, `/skills`, `/agents`, and `/mcp <name>` read-only detail panels
3. Discoverability:
   - `/` picker now lazily includes discovered project/user skills, custom agent specs, and configured MCP servers
   - selecting `/skills <name>`, `/agents <name>`, or `/mcp <name>` opens a targeted detail panel
   - project-local skills are discovered before user-global skills
   - MCP discovery parses config files only and does not auto-start project-scoped servers
4. Verification:
   - targeted MCP/picker/slash pack passed with `111` tests
   - `npm run lint`, `npm run build`, and full `npm test` passed with `92` files / `1696` tests

## 2026-05-03 Optimization Delta - Markdown Artifact Write Integrity

The Markdown artifact write-integrity tranche is complete:

1. Root cause:
   - the built-in file tools were functional
   - the bug lived in the post-model false-save repair layer, which previously used the full assistant response as repaired file content
2. Runtime correction:
   - false-save repair now extracts only fenced Markdown/text, explicit content markers, or Markdown-like artifact structure
   - conversational save confirmations without artifact content are not written to disk
3. Provider contract:
   - the system prompt now states that `write_file.content` must be the final requested file body only
4. Verification:
   - focused local-file/proxy/e2e regression pack passed with `45` tests before full-suite validation
   - `npm run lint`, `npm run build`, and full `npm test` passed with `91` files / `1665` tests

## 2026-05-02 Optimization Delta - Tool-Call Closure and Orca Mark

The local-file/tool-call and startup mark tranche is complete:

1. Long-session tool continuity:
   - changed OpenAI-compatible streamed chat assembly so every turn receives the current system prompt
   - preserved history while de-duplicating an identical leading system prompt
   - strengthened local-file instructions so create/open requests must use file tools before failure claims
   - added a runtime local-file intent guard so obvious REPL read/write/open follow-ups execute tools before the provider call
   - added post-response repair so false `saved to <path>` claims without a tool call are converted into an actual `write_file` operation
   - added missing-claimed-file repair so a follow-up "本地没有这个文件，给我打开" reconstructs the claimed file from chat history and opens it
2. Tool-call matrix closure:
   - added the `tool-calls` layer to `agent-eval/manifests/test-matrix.json`
   - generated `npm run test:tool-calls` and updated `agent-eval/generated/test-matrix-entrypoints.md`
   - covered built-in tools, dangerous tool registry, local-file intent repair, proxy tool calls, MCP routing, one-shot MCP cleanup, prompt assembly, and system-prompt tool rules
3. Blackfin startup cleanup:
   - replaced the compact `ORCA` startup mark with a dominant `ORCA-AGENT` wordmark
   - removed the rejected independent banner mascot/hero/icon art
   - retained Hermes-inspired structure: large wordmark hierarchy, theme-aware deck, and operational state rows
4. Verification:
   - focused system prompt/provider pack passed with `22` tests
   - `npm run test:tool-calls` passed
   - focused Ink UI pack passed with `80` tests
   - post-screenshot Banner render inspection shows `ORCA-AGENT`, `Orca Agent v0.8.16`, `Blackfin Signal`, clean state rows, and no independent hero art
   - full `npm test` passed with `91` files / `1663` tests
   - dist-level local `write_file` + `open_file` smoke passed with a fake `open` command to avoid launching desktop apps
   - focused local-file guard pack passed with `31` tests
   - live provider smoke remains externally blocked: Poe default timeout, Poe `qwen3.6-plus` no tool-call support, Anthropic credit exhaustion, Cloudflare unauthorized

## 2026-05-02 Optimization Delta - Model Catalog SSoT

The model-catalog SSoT tranche is complete:

1. Metadata consolidation:
   - added `src/model-metadata.ts` as the canonical owner for model context windows, max output defaults, pricing tiers, and capacity/pricing formatters
   - kept `src/model-catalog.ts` as the provider-aware public catalog by re-exporting metadata helpers and preserving provider grouping / duplicate-model behavior
2. Runtime alignment:
   - changed `src/token-budget.ts` to use canonical context and max-output metadata
   - changed `src/providers/openai-compat.ts` to use canonical context guard and max-token defaults
   - changed `src/output.ts` to use canonical capacity labels and pricing for cost estimates
3. Anti-drift guard:
   - added model-catalog regression coverage that scans runtime consumers and fails if duplicated metadata tables return
4. Verification:
   - focused model/runtime/provider pack passed with `86` tests
   - `npm run lint` passed
   - `npm run build` passed
   - full `npm test` passed with `91` files / `1663` tests

## 2026-05-02 Optimization Delta - Terminal Operability Hardening

The copyability / cwd / tool-opening tranche is complete:

1. Terminal copyability:
   - made alternate screen opt-in with `ORCA_ALT_SCREEN=1`
   - added Claude-style no-flicker aliases: `ORCA_TUI=fullscreen`, `ORCA_NO_FLICKER=1`, and `CLAUDE_CODE_NO_FLICKER=1`
   - pre-enters alternate screen before Ink's first frame in no-flicker mode and limits recent rendered blocks to reduce repaint pressure
   - made mouse tracking opt-in with `ORCA_MOUSE=1`
   - preserved Ink rendering while restoring normal terminal scrollback and selection by default
2. Workspace reliability:
   - added explicit/env/ambient/remembered workspace cwd resolution
   - added last-workspace persistence under `~/.orca/last-cwd`
   - forwarded root `orca --cwd <dir>` into chat for launcher/menu entrypoints
3. Tool system:
   - added `open_file` as the 42nd built-in tool
   - marked `open_file` dangerous for approval policy
   - refreshed README/tool-count tests and release evidence
4. MCP reliability:
   - fixed MCP tool routing for underscore/hyphen server names
   - widened Codex TOML MCP parser to support hyphenated server sections
5. Verification:
   - targeted regression pack passed with `250` tests
   - TypeScript build passed
   - CLI help and doctor smokes passed
   - live Poe one-shot `read_file` tool smoke passed
   - full `npm test` passed with `90` files / `1651` tests

## 2026-05-02 Optimization Delta - Critique Quality Gate

The critique-gate optimization tranche is complete:

1. Quality gateway:
   - added `src/critique.ts` as the centralized Rubber Duck Critique model
   - added `src/critique-workspace.ts` as the shared workspace inspection adapter
   - added checkpoints, risk scoring, prompt generation, and structured JSON parsing
2. Command surface:
   - added `orca critique` as a first-class command
   - supports plan/log/diff inputs, risk flags, `--force`, `--dry-run`, `--json`, and `--show-prompt`
   - added `/critique` inside `orca chat` for local read-only risk inspection without a model call
   - registered slash discovery through help/completion and command picker surfaces
3. Automatic chat hint:
   - added `src/critique-auto.ts` for pre-send dirty-diff risk notices
   - added session-level repeat suppression so the same diff signature only prompts once
   - extended the notice to one-shot `orca chat "prompt"` streaming runs while leaving `--json` output clean
   - kept automatic hints model-free, prompt-preserving, and configurable through `--no-auto-critique`, `--auto-critique-threshold`, `ORCA_AUTO_CRITIQUE`, and `ORCA_AUTO_CRITIQUE_THRESHOLD`
4. Reviewer routing:
   - defaults to complementary model-family selection
   - reuses existing provider and aggregator routing for live critique calls
5. Contract boundary:
   - `reflect` remains Socratic diagnosis
   - `critique` remains read-only reviewer challenge
   - no new dependency and no workspace mutation inside critique
6. Reliability cleanup:
   - fixed project hook trust evaluation so `ORCA_TRUST_PROJECT_HOOKS=1` is honored at hook load time even when the singleton already exists
   - removed the full-suite stderr-hook gate flake exposed during this tranche
7. Verification:
   - focused command and contract tests passed
   - focused slash and registry tests passed
   - focused automatic hint tests passed
   - focused command contract tests confirmed the chat option surface
   - TypeScript lint and build passed
   - release evidence snapshot was refreshed to `89` files / `1642` tests after adding automatic hint coverage
   - full `npm test` passed with `89` files / `1642` tests
   - built CLI dry-run smoke returned valid critique JSON
   - scoped diff and new-file whitespace checks passed

## 2026-05-01 Optimization Delta - Pod Helm Footer UI/UX

The helm-footer optimization tranche is complete:

1. Footer identity:
   - changed `Footer.tsx` from generic shortcut-only rendering to a `POD HELM` rail
   - changed key and label colors from dim-only styling to active theme semantic tokens
2. Context-aware copy:
   - changed generating hint from `interrupt` to `interrupt echo`
   - changed active and idle send/help labels to `send brief` and `pod commands`
   - preserved `enter`, `ctrl+j`, `/help`, `shift+tab`, permission-mode, and permission-source visibility
3. Width discipline:
   - used terminal `cols` to keep core hints compact on ordinary-width terminals
   - rendered lower-priority active hints only on wider terminals
   - prevented shortcut groups from shrinking into broken text columns
4. Contract boundary:
   - no shortcut behavior change
   - no input submission, permission-mode, or dependency change
5. Verification:
   - focused Ink UI tests, lint, build, release-evidence test, real CLI version smoke, scoped diff check, and full suite passed

## 2026-05-01 Optimization Delta - Pod Council Runway UI/UX

The council-runway optimization tranche is complete:

1. Multi-model identity:
   - changed `MultiModelProgress.tsx` from command-only framing to `POD COUNCIL · <command>`
   - changed model count copy from generic `models` to coordinated `voices`
2. Progress states:
   - changed completed row copy from `ok` to `surfaced`
   - added `sonar` copy beside the existing active spinner
   - preserved model names and elapsed seconds
3. Tone system:
   - replaced hard-coded `cyan` and `green` colors with active theme semantic tokens
4. Contract boundary:
   - no `ModelProgress` shape change
   - no council/race/pipeline runtime, spinner dependency, or new dependency change
5. Verification:
   - focused Ink UI tests passed during implementation; final lint, build, release-evidence, full suite, CLI smoke, and scoped diff check are recorded in `deliverable.md`

## 2026-05-01 Optimization Delta - Pod Evidence Drawer UI/UX

The evidence-drawer optimization tranche is complete:

1. Detail panel identity:
   - changed `DetailPanel.tsx` from source-title-only framing to `EVIDENCE DRAWER · <title>`
   - added `pod scan` subtitle context while preserving original subtitle metadata
2. Tone system:
   - replaced hard-coded `cyan`, `yellow`, and `red` border colors with active theme semantic tokens
   - preserved info/warn/error meaning through `theme.border`, `theme.warning`, and `theme.error`
3. Contract boundary:
   - no `DetailPanelInfo` shape change
   - no slash-command, evidence formatting, markdown parser, or dependency change
4. Verification:
   - focused Ink UI tests passed during implementation; final lint, build, release-evidence, full suite, CLI smoke, and scoped diff check are recorded in `deliverable.md`

## 2026-05-01 Optimization Delta - Pod Trust Gate UI/UX

The trust-gate optimization tranche is complete:

1. Approval boundary:
   - changed `PermissionPrompt.tsx` from a generic tool approval panel to `TRUST GATE`
   - grouped the preview under `SCAN`
   - retuned choices to explain once/session/project trust scope and deny posture
2. Diff review:
   - changed `DiffPreview.tsx` from a generic diff header to `ECHO DIFF`
   - preserved file path, add/remove counts, line numbers, truncation, and diff content
3. Contract boundary:
   - no permission-policy changes
   - no approval keybinding changes
   - no diff algorithm, runtime event, or dependency changes
4. Verification:
   - focused Ink UI tests and lint passed during implementation; final build, release-evidence, full suite, CLI smoke, and scoped diff check are recorded in `deliverable.md`

## 2026-05-01 Optimization Delta - Pod Proof Wake UI/UX

The proof-wake optimization tranche is complete:

1. Post-turn receipt:
   - changed `TurnSummary.tsx` from internal `r/d/u` shorthand to `PROOF WAKE`
   - preserved elapsed time, input tokens, output tokens, tool-call count, cost, and output throughput
2. Contract boundary:
   - no `TurnSummaryInfo` shape change
   - no usage accounting, provider, or event-model behavior change
3. Verification:
   - focused Ink UI tests and lint passed during implementation; final build, release-evidence, full suite, CLI smoke, and scoped diff check are recorded in `deliverable.md`

## 2026-05-01 Optimization Delta - Pod Status Rail UI/UX

The status-rail optimization tranche is complete:

1. Status identity:
   - kept `ORCA POD`, model, context bar / percentage, and branch on the first status line
   - added a compact `sonar` label for context load on ordinary-width terminals
2. Signal and trust rails:
   - prefixed available live metrics with `signal:`
   - changed permission posture copy from `pod:` to `trust:` and retuned shift-tab guidance to `shift+tab cycles trust`
3. Verification:
   - focused Ink UI tests and lint passed during implementation; final build, release-evidence, full suite, CLI smoke, and scoped diff check are recorded in `deliverable.md`

## 2026-05-01 Optimization Delta - Pod Transcript Flow UI/UX

The transcript-flow optimization tranche is complete:

1. Transcript roles:
   - changed submitted user prompt panels from generic `You` to `POD BRIEF`
   - changed assistant response panels from `ORCA` to `ORCA POD`
   - changed streaming response copy from generic `streaming` to `echoing`
2. Tool and thinking feedback:
   - added `ECHO TOOL` to active and completed tool-call rails
   - replaced the broad generic thinking verb set with compact Orca/pod/proof-oriented verbs
3. Verification:
   - focused Ink UI tests, lint, build, release-evidence test, real CLI version smoke, scoped diff check, and full suite passed

## 2026-05-01 Optimization Delta - Pod Command Surface UI/UX

The command-surface optimization tranche is complete:

1. Shared UI system:
   - made `PickerFrame.tsx` theme-aware so picker chrome uses Orca semantic tokens instead of a generic cyan default
   - preserved existing sizing and caller override behavior
2. Command discovery:
   - reframed slash-command discovery as `POD COMMANDS`
   - added echo-filter copy and a persistent no-match state
3. Option and input UX:
   - moved `OptionPicker.tsx` selected rows, filter labels, descriptions, and scroll affordances onto theme tokens
   - retuned the input placeholder and multiline hint toward pod briefing language
4. Verification:
   - focused Ink UI tests, lint, build, release-evidence test, real CLI version smoke, scoped diff check, and full suite passed

## 2026-05-01 Optimization Delta - Cute Mascot UI/UX

Superseded on 2026-05-02 for startup Banner art: the independent mascot/icon block is removed. The pod-brief HomePanel language remains active.

The mascot optimization tranche is complete:

1. Logo system:
   - kept the Hermes-inspired structure of large wordmark plus state panel
   - removed the later independent mascot/icon block from `Banner.tsx` after operator feedback
2. Entry UX:
   - renamed the primary entry panel to `POD BRIEF`
   - changed the copy toward friendly pod briefing while preserving one primary action, recovery, trust, and guardrail state
3. Verification:
   - focused Ink UI tests, lint, build, release-evidence test, real CLI version smoke, and full suite passed

## 2026-04-30 Optimization Delta - Visual Identity

The visual optimization tranche is now complete:

1. Identity:
   - shipped `Blackfin Signal` as the Orca default dark theme
   - replaced generic startup art with an `ORCA-AGENT` block wordmark and clean startup deck
2. UI hierarchy:
   - turned the entry HomePanel into pod brief / pod signal / recover / guardrails sections
   - preserved trust, session, model, tool, and recovery state as first-screen information
3. UX guardrails:
   - kept existing themes available
   - avoided new dependencies and font bundling
   - kept narrow-terminal rendering coherent
4. Verification:
   - focused Ink UI tests, lint, build, release-evidence test, real CLI version smoke, and full suite passed
   - `ai check` remains a tooling follow-up because the local checker hung without output

## 2026-04-29 Optimization Delta - SOTA Swarm Audit

The next platform wave is now explicitly ordered:

1. Trust hardening:
   - explicit project hook trust
   - hook env allowlist
   - approval-gated network tools
   - private/loopback `fetch_url` guard
2. Queue visibility:
   - ship `orca queue list/show/follow/takeover/evidence/resume/schedule`
   - use lease state as the operator handoff point for concrete chat resume and background-job monitor plans
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
   - model-routing evidence and catalog SSoT
   - replay-safe metadata for non-chat TaskRun resume

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
- `orca queue resume` now claims a resume lease and prints the saved-session continuation command for chat TaskRuns
- `orca queue schedule` now selects the next unleased resumable or monitorable TaskRun instead of treating leases as passive metadata
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

## 2026-05-03 Runtime Trust Follow-Up

- Close the gap between model wording and runtime evidence for local file work:
  - explicit local save/create/generate requests now get post-model `write_file` repair when artifact content is present
  - missing local file evidence now produces an incomplete notice
- Close the TUI history discoverability gap:
  - prompt input no longer disables non-text history scroll keys
  - text shortcuts stay scoped away from focused input
- Verification lane:
  - targeted regressions in `tests/local-file-intent.test.ts`, `tests/chat-internals.test.ts`, and `tests/ink-ui.test.tsx`
  - `npm run lint`, `npm run build`, and full `npm test` passed on 2026-05-03

## Changelog

| Date | Change |
| --- | --- |
| 2026-05-29 | Normalized metadata for the project ai check gate and recorded the multi-model review ledger integration. |
