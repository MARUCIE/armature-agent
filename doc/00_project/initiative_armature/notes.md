---
Title: Armature CLI Notes
Scope: planning-with-files notes
Owner: Maurice
Status: Active
LastUpdated: 2026-05-29
---
# Notes

## 2026-05-03 - Markdown artifact write integrity

Context:

- User reported that Armature repeatedly prints conversation content into `.md` files instead of generating the requested Markdown file body.
- Root cause is not the low-level `write_file` / `open_file` tools; the failing path is the post-model false-save repair added for models that claim "saved to path" without a tool call.

Findings:

- `selectAssistantContentForFile()` returned the entire assistant response.
- That meant repair wrote save confirmations, explanations, and sometimes chat transcript text as the target Markdown file body.
- The provider prompt also lacked a direct `write_file.content = final artifact body only` contract.

Implementation:

- Changed false-save repair extraction to use fenced Markdown/text, explicit content markers, or Markdown artifact structure.
- If only conversational save text is present, repair returns `null` and does not create a polluted file.
- Updated the system prompt to forbid writing assistant chatter, transcripts, save confirmations, or instructions into generated document files unless explicitly requested.
- Added regressions for missing-file repair, post-model false-save repair, fenced Markdown extraction, and no-artifact non-repair.

Verification:

- `npm test -- tests/local-file-intent.test.ts tests/chat-internals.test.ts tests/chat-repl-turn.test.ts tests/e2e-workflow.test.ts` -> `45/45`.
- `npm run lint` -> pass.
- `npm run build` -> pass.
- `npm test` -> `91` files / `1665` tests passed.

## 2026-05-02 - Tool-call continuity, test matrix closure, and Blackfin mark

- User reported that Armature still could not automatically create/open a local Markdown file in an active session and that the Armature icon still had not been updated enough compared with Hermes Agent.
- Reproduced the tool layer as functional in a fresh one-shot smoke, which narrowed the issue to long-session prompt/tool discipline rather than missing `write_file` / `open_file` runtime support.
- Found that OpenAI-compatible `streamChat()` only included the system prompt when history was empty, so later REPL turns could lose the local-tool contract.
- Fixed streamed message assembly to always prepend the current system prompt and skip one identical leading system prompt from history.
- Strengthened the generated system prompt so local file create/save/verify/open requests must call the local file tools before claiming failure.
- User's later screenshot showed the deeper failure mode: the provider claimed a Markdown file was saved, but the TaskRun recorded zero tool approvals/evidence and no `write_file` / `open_file` call.
- Added `src/commands/local-file-intent.ts` so Armature can parse local file paths and build deterministic local tool plans outside the model.
- Wired REPL pre-model handling so follow-ups such as `本地没有这个文件，给我打开` reconstruct a previously claimed file from chat history, call `write_file`, and then call `open_file`.
- Wired streamed proxy post-response repair so if the model says `saved to <path>` without actually using a file tool, Armature writes that claimed file from the assistant transcript and appends the guard result to history.
- Fixed proxy tool allow-list assembly so built-in tools are allowed even when `runProxyTurn()` relies on default tool definitions.
- Added a canonical `tool-calls` matrix layer covering built-in tools, proxy tool loops, MCP routing, one-shot MCP cleanup, multimodal/provider prompt assembly, and local-file tool prompt rules.
- Replaced the startup banner mascot with a clearer terminal-native Blackfin armature mark while preserving the Hermes-style brand structure of mark + wordmark + themed deck.
- After user screenshot review, replaced the remaining old compact `ORCA` startup wordmark with a dominant `ARMATURE-AGENT` wordmark and enlarged the armature hero mark to match Hermes Agent's first-frame visual hierarchy.
- User then rejected the separate Armature icon/hero art as visually poor; removed the independent hero block entirely and kept the `ARMATURE-AGENT` wordmark plus clean `Blackfin Signal` state deck.
- Verification so far:
  - `npm test -- tests/openai-compat-multimodal.test.ts tests/e2e-workflow.test.ts` -> `22/22`.
  - `npm run test:matrix:sync` -> pass.
  - `npm run test:tool-calls` -> pass.
  - `npm test -- tests/ink-ui.test.tsx` -> `80/80`.
  - Rendered Banner inspection -> shows `ARMATURE-AGENT`, `Armature Agent v0.8.16`, `Blackfin Signal`, clean state rows, and no independent hero art.
  - Full `npm test` -> `91` files / `1663` tests.
  - Dist-level local tool smoke with fake `open` -> `write_file` + `open_file` passed.
  - `npm test -- tests/local-file-intent.test.ts tests/chat-internals.test.ts tests/chat-repl-turn.test.ts` -> `31/31`.
  - `npm run lint` -> pass after local-file guard wiring.
  - `npm run test:tool-calls` -> pass with `tests/local-file-intent.test.ts` included in the canonical layer.
  - `npm test` -> `91` files / `1663` tests.
  - Dist-level local file guard smoke with fake `open` -> missing claimed file reconstructed, written, and opened without calling a provider.
- Live provider smoke blockers:
  - Poe default `claude-opus-4.6` request timed out before a tool call.
  - Poe `qwen3.6-plus` returned a hard provider error: model does not support tool calling.
  - Anthropic returned account credit exhaustion.
  - Cloudflare returned unauthorized.

## 2026-05-02 - Model catalog SSoT runtime consolidation

Context:

- The SOTA swarm roadmap still had ARMATURE-SWARM-021 / M5 model catalog SSoT open.
- Code inspection found model context, max-output, pricing, and display metadata duplicated across `model-catalog`, `token-budget`, `openai-compat`, and `output`.

Implementation:

- Added `src/model-metadata.ts` as the canonical pure metadata helper module.
- Re-exported the metadata helpers through `src/model-catalog.ts` so existing catalog consumers keep the same public surface.
- Updated `src/token-budget.ts` to use canonical context windows and max output values.
- Updated `src/providers/openai-compat.ts` to use the same context guard and max-token defaults.
- Updated `src/output.ts` to use canonical model capacity labels and pricing for cost estimates.
- Added `tests/model-catalog.test.ts` coverage for shared metadata behavior and a source guard against reintroduced duplicate metadata tables.

Verification:

- `npm test -- tests/model-catalog.test.ts tests/context-protection.test.ts tests/agent-intelligence.test.ts tests/openai-compat-multimodal.test.ts` -> `86` tests passed.
- `npm run lint` -> pass.
- `npm run build` -> pass.
- `npm test` -> `91` files / `1663` tests passed.

## 2026-05-02 - Terminal Operability Hardening

Context:

- User reported that Claude Code also uses Ink but remains copyable, while Armature output could not be copied and startup flickered.
- User also reported that Armature could not reliably call tools/open Markdown when launched from different entrypoints.

Findings:

- Armature forced alternate-screen startup and enabled mouse tracking by default.
- Launcher/home starts could leave tool cwd at a non-project directory.
- MCP tool routing split server names with `^mcp__([^_]+)__`, which broke Codex/OMX-style server names such as `omx_code_intel`.

Implementation:

- Made alternate screen opt-in with `ARMATURE_ALT_SCREEN=1`.
- Made mouse tracking opt-in with `ARMATURE_MOUSE=1`.
- Added explicit/env/ambient/remembered workspace cwd resolution and root `armature --cwd <dir>` forwarding.
- Added `open_file` for OS-level local file opening and included it in dangerous tool policy.
- Fixed MCP parsing for underscore/hyphen server names and widened Codex TOML section parsing.

Verification:

- Targeted regression pack -> `250/250`.
- `npm run build` -> pass.
- `node dist/bin/armature.js --help` -> root help exposes `42 tools`, `--cwd`, and `critique`.
- `node dist/bin/armature.js doctor` -> provider OK (`poe / claude-opus-4.6`) and `14` MCP configs discovered.
- Live Poe one-shot smoke -> `read_file` tool used successfully, final answer `Armature CLI`.
- `npm test` -> `90` files / `1651` tests passed.

## 2026-05-02 - Rubber Duck Critique quality gate

Context:

- User asked to optimize the local Armature CLI using the local research report at `file:///Users/mauricewen/Documents/ai_coding_cli_research_report.html`.
- Direct filesystem reads of the report were blocked by macOS document permissions, but Chrome accessibility plus tab JavaScript extraction exposed the report text.
- The report's actionable gap for Armature was not another Socratic `reflect` pass. Armature needed a separate read-only reviewer gate with checkpoint triggers, risk scoring, structured findings, and complementary model routing.

Implementation:

- Added `src/critique.ts` with checkpoint parsing, report-derived risk scoring, reviewer-family selection, diff-line counting, read-only prompt construction, and structured JSON critique parsing.
- Added `src/critique-workspace.ts` so CLI and chat slash surfaces share the same diff/risk/prompt inspection path.
- Added `src/commands/critique.ts` with `armature critique`, checkpoint flags, plan/log/diff inputs, risk flags, `--force`, `--dry-run`, `--json`, and optional prompt inspection.
- Added `/critique` inside the read-only chat slash surface, with legacy console output and Ink detail panel rendering for reviewer choice, risk score, changed files, and diff lines.
- Registered `critique` in the root command surface.
- Registered `/critique` in slash help/completion and legacy picker discovery.
- Added tests for the risk formula, thresholds, model-family complement selection, prompt content, parser behavior, dry-run CLI output, and public command contracts.
- Added slash tests proving `/critique` inspects the workspace without a model call and renders inside an Ink detail panel.
- Added `src/critique-auto.ts` for session-scoped automatic pre-send local critique hints. It inspects dirty diff risk without building a reviewer prompt, suppresses repeat notices for the same diff signature, and exposes `ARMATURE_AUTO_CRITIQUE` / `ARMATURE_AUTO_CRITIQUE_THRESHOLD` knobs.
- Wired `armature chat` to keep one automatic critique state per REPL session and emit a warning notice before the provider call when a large local diff should be challenged with `/critique --checkpoint after_complex_implementation`.
- Added chat-session controls: `--no-auto-critique` disables automatic local hints for that REPL, and `--auto-critique-threshold <score>` tunes the session threshold without relying on process-wide env vars.
- Added one-shot `armature chat "prompt"` automatic local hints before `executeOneShot`, writing only to stderr in streaming mode and staying silent for `--json` output.
- Fixed `HookManager.load()` to re-check `ARMATURE_TRUST_PROJECT_HOOKS` at load time. Full-suite verification exposed that the singleton can be constructed before a test or runtime path sets the env var, which made trusted project hooks appear unloaded under parallel test execution.
- Updated README and active project docs to distinguish `reflect` from `critique`.

Verification:

- `npm test -- tests/critique.test.ts tests/program.test.ts tests/command-contracts.test.ts` -> `42` tests passed.
- `npm test -- tests/critique.test.ts tests/chat-slash-readonly.test.ts tests/command-picker.test.ts tests/slash-commands.test.ts tests/program.test.ts tests/command-contracts.test.ts` -> `70` tests passed.
- `npm test -- tests/critique.test.ts tests/chat-repl-turn.test.ts` -> `25` tests passed after automatic hint coverage.
- `npm test -- tests/chat-one-shot-mcp-cleanup.test.ts tests/chat-repl-turn.test.ts tests/command-contracts.test.ts` -> `33` tests passed after surfacing chat options and one-shot hints.
- `npm test -- tests/v050-modules.test.ts` -> `47` tests passed after the hook trust stability fix.
- `npm run lint` -> pass.
- `npm run build` -> pass.
- `npm test -- tests/release-evidence.test.ts` -> `3` tests passed after refreshing `verification_snapshot.json` to `89` files / `1642` tests.
- `npm test` -> `89` files / `1642` tests passed.
- `node dist/bin/armature.js critique --dry-run --json "review current diff"` -> valid JSON; no provider call required.
- Scoped `git diff --check -- <tracked critique tranche files>` -> pass.
- New-file trailing whitespace scan for `src/critique.ts`, `src/commands/critique.ts`, and `tests/critique.test.ts` -> pass.

## 2026-05-01 - Pod helm footer UI/UX pass

Context:

- User said `继续` after the pod council runway pass.
- Boundary stayed in persistent footer shortcut rendering: Footer copy, width discipline, theme color resolution, focused tests, and active docs.

Implementation:

- Added `POD HELM` to the footer rail so shortcut help remains Armature-branded after the banner scrolls away.
- Changed generating copy to `interrupt echo`.
- Changed active and idle send/help labels to `send brief` and `pod commands`.
- Preserved `enter`, `ctrl+j`, `/help`, `shift+tab`, `permMode`, and `permSource` visibility.
- Used terminal `cols` to hide lower-priority active hints on ordinary-width terminals and avoid broken wrapping.
- Added non-shrinking shortcut groups so `POD HELM` and key labels stay coherent.
- Replaced dim-only footer styling with active theme semantic tokens.
- Added focused Ink coverage for generating, active input, and idle footer states.

Verification:

- `npm test -- tests/ink-ui.test.tsx` -> `79` tests passed.
- `npm run lint` -> pass.
- `npm run build` -> pass.
- `npm test -- tests/release-evidence.test.ts` -> `3` tests passed.
- `npm test` -> `88` files / `1627` tests passed.
- `ARMATURE_THEME=armature node dist/bin/armature.js --version` -> `0.8.16`.
- `git diff --check -- <changed tranche files>` -> pass.

## 2026-05-01 - Pod council runway UI/UX pass

Context:

- User said `继续` after the pod evidence drawer pass.
- Boundary stayed in live multi-model progress rendering: MultiModelProgress copy, theme color resolution, focused tests, and active docs.

Implementation:

- Changed multi-model progress header to `POD COUNCIL · <command>`.
- Changed model count copy from generic `models` to `voices`.
- Changed completed row status from `ok` to `surfaced`.
- Added `sonar` copy beside the active spinner.
- Replaced hard-coded `cyan` and `green` colors with active theme semantic tokens.
- Preserved `ModelProgress`, council/race/pipeline runtime behavior, spinner dependency behavior, model names, and elapsed time.
- Added focused Ink coverage for `POD COUNCIL`, command name, voice count, model names, `surfaced`, `sonar`, and elapsed time.

Verification:

- `npm test -- tests/ink-ui.test.tsx` -> `79` tests passed.
- `npm run lint` -> pass.
- `npm run build` -> pass.
- `npm test -- tests/release-evidence.test.ts` -> `3` tests passed.
- `npm test` -> `88` files / `1627` tests passed.
- `ARMATURE_THEME=armature node dist/bin/armature.js --version` -> `0.8.16`.
- `git diff --check -- <changed tranche files>` -> pass.

## 2026-05-01 - Pod evidence drawer UI/UX pass

Context:

- User said `继续` after the pod trust gate pass.
- Boundary stayed in detail panel rendering: DetailPanel frame, tone color resolution, focused tests, and active docs.

Implementation:

- Changed detail panel title rendering to `EVIDENCE DRAWER · <title>`.
- Added `pod scan` subtitle context while preserving original subtitle metadata.
- Replaced hard-coded `cyan`, `yellow`, and `red` borders with active theme semantic tokens.
- Preserved `DetailPanelInfo`, slash-command behavior, evidence body construction, and MarkdownText rendering.
- Added focused Ink coverage for `EVIDENCE DRAWER`, original title, `pod scan`, original subtitle, and markdown body content.

Verification:

- `npm test -- tests/ink-ui.test.tsx` -> `79` tests passed.
- `npm run lint` -> pass.
- `npm run build` -> pass.
- `npm test -- tests/release-evidence.test.ts` -> `3` tests passed.
- `npm test` -> `88` files / `1627` tests passed.
- `ARMATURE_THEME=armature node dist/bin/armature.js --version` -> `0.8.16`.
- `git diff --check -- <changed tranche files>` -> pass.

## 2026-05-01 - Pod trust gate UI/UX pass

Context:

- User said `继续` after the pod proof wake pass.
- Boundary stayed in approval and write-review UI: PermissionPrompt rendering, DiffPreview rendering, focused tests, and active docs.

Implementation:

- Changed the permission prompt title to `TRUST GATE · <tool>`.
- Added `SCAN` as the preview label before approval choices.
- Retuned approval choice descriptions to clarify one-time clearance, session trust, project-policy persistence, and deny posture.
- Kept `y`, `n`, `1-4`, arrows, Enter, and Esc behavior unchanged.
- Changed diff preview header to `ECHO DIFF`.
- Preserved diff path, add/remove counts, line numbers, truncation, and line coloring semantics.
- Added focused Ink coverage for `TRUST GATE`, `SCAN`, trust-scope copy, footer key hints, and `ECHO DIFF`.

Verification:

- `npm test -- tests/ink-ui.test.tsx` -> `79` tests passed.
- `npm run lint` -> pass.
- `npm run build` -> pass.
- `npm test -- tests/release-evidence.test.ts` -> `3` tests passed.
- `npm test` -> `88` files / `1627` tests passed.
- `ARMATURE_THEME=armature node dist/bin/armature.js --version` -> `0.8.16`.
- `git diff --check -- <changed tranche files>` -> pass.

## 2026-05-01 - Pod proof wake UI/UX pass

Context:

- User said `继续` after the pod status rail pass.
- Boundary stayed in the compact post-turn summary: TurnSummary rendering, focused tests, and active docs.

Implementation:

- Changed the post-turn summary label to `PROOF WAKE`.
- Replaced internal `r/d/u` shorthand with explicit `time`, `in`, `out`, `tools`, cost, and `tok/s`.
- Preserved the existing `TurnSummaryInfo` shape and usage accounting calculations.
- Added focused Ink coverage for proof-wake label, elapsed time, token flow, tool count, cost, and throughput.

Verification:

- `npm test -- tests/ink-ui.test.tsx` -> `79` tests passed.
- `npm run lint` -> pass.
- `npm run build` -> pass.
- `npm test -- tests/release-evidence.test.ts` -> `3` tests passed.
- `npm test` -> `88` files / `1627` tests passed.
- `ARMATURE_THEME=armature node dist/bin/armature.js --version` -> `0.8.16`.
- `git diff --check -- <changed tranche files>` -> pass.

## 2026-05-01 - Pod status rail UI/UX pass

Context:

- User said `继续` after the pod transcript flow pass.
- Boundary stayed in the fixed Ink StatusBar: status identity, context meter label, metrics rail, trust posture, focused tests, and active docs.

Implementation:

- Kept `ARMATURE POD`, model, context bar / percentage, and branch on status line 1.
- Added `sonar` as the context-load label on ordinary-width terminals.
- Added `signal:` before live stats while preserving cost, token cadence, turns, session id, model policy, tool policy, output style, and sparkline.
- Changed permission posture copy from `pod:` to `trust:`.
- Retuned status guidance from `shift+tab to cycle` to `shift+tab cycles trust`.
- Added focused Ink coverage for `sonar`, `signal:`, `trust:`, and trust-cycle guidance.

Verification:

- `npm test -- tests/ink-ui.test.tsx` -> `79` tests passed.
- `npm run lint` -> pass.
- `npm run build` -> pass.
- `npm test -- tests/release-evidence.test.ts` -> `3` tests passed.
- `npm test` -> `88` files / `1627` tests passed.
- `ARMATURE_THEME=armature node dist/bin/armature.js --version` -> `0.8.16`.
- `git diff --check -- <changed tranche files>` -> pass.

## 2026-05-01 - Pod transcript flow UI/UX pass

Context:

- User said `继续` after the pod command surface pass.
- Boundary stayed in live Ink transcript surfaces: submitted prompts, assistant panels, tool rails, thinking state, focused tests, and active docs.

Implementation:

- Changed submitted prompt panels from `You` to `POD BRIEF`.
- Changed assistant panels from `ORCA` to `ARMATURE POD`.
- Changed streaming assistant state copy from `streaming` to `echoing`.
- Added `ECHO TOOL` to active and completed tool-call rails while keeping tool names, path/argument summaries, status, and durations visible.
- Replaced the broad generic thinking verb list with a compact Armature-oriented set: listening, echoing, triangulating, routing, verifying, surfacing evidence, and related states.
- Updated focused Ink tests for `POD BRIEF`, `ARMATURE POD`, `ECHO TOOL`, and `POD` thinking state.

Verification:

- `npm test -- tests/ink-ui.test.tsx` -> `78` tests passed.
- `npm run lint` -> pass.
- `npm run build` -> pass.
- `npm test -- tests/release-evidence.test.ts` -> `3` tests passed.
- `npm test` -> `88` files / `1626` tests passed.
- `ARMATURE_THEME=armature node dist/bin/armature.js --version` -> `0.8.16`.
- `git diff --check -- <changed tranche files>` -> pass.

## 2026-05-01 - Pod command surface UI/UX pass

Context:

- User said `继续` after the cute Armature mascot pass.
- Boundary stayed in high-frequency Ink interaction surfaces: input, slash-command picker, option picker, shared picker frame, focused tests, and active docs.

Implementation:

- Made `PickerFrame.tsx` theme-aware and resolved default border/title/subtitle/footer colors through `useTheme()`.
- Reframed `CommandPicker.tsx` as `POD COMMANDS` with `echo filter: /<query>`, compact key hints, Armature theme tokens, and a visible `no matching command` state.
- Kept `Esc` cancellation active in `CommandPicker` even when a filter returns zero results.
- Updated `OptionPicker.tsx` to use Armature theme tokens for selected rows, filter labels, option descriptions, and scroll affordances.
- Updated `InputArea.tsx` placeholder to `Brief the pod... (/help for commands)` and multiline help to `pod input`.
- Added focused Ink coverage for the pod command title, echo-filter copy, no-match state, and pod-brief placeholder.

Verification:

- `npm test -- tests/ink-ui.test.tsx` -> `78` tests passed.
- `npm run lint` -> pass.
- `npm run build` -> pass.
- `npm test -- tests/release-evidence.test.ts` -> `3` tests passed.
- `npm test` -> `88` files / `1626` tests passed.
- `ARMATURE_THEME=armature node dist/bin/armature.js --version` -> `0.8.16`.
- `git diff --check -- <changed tranche files>` -> pass.
- Full `git diff --check` remains blocked by pre-existing trailing whitespace in root `AGENTS.md`, outside this tranche.

## 2026-05-01 - Cute armature mascot UI/UX pass

Context:

- User asked to start comprehensive UI/UX optimization and specifically learn Hermes Agent's logo implementation while making Armature a cute killer-whale image.
- Boundary stayed in the terminal Ink first frame: Banner mascot, HomePanel first-screen copy, focused Ink tests, and PDCA docs.

Implementation:

- Replaced the abstract banner signal mark with `ARMATURE_MASCOT_LINES`: a terminal-native cute killer-whale mascot with dorsal fin, eyes, small smile, `BLACKFIN`, `pod`, and echolocation marks.
- Preserved the Hermes-inspired structure: large `ORCA` wordmark plus independent mascot plus status-rich panel.
- Changed the first primary panel from `MISSION` to `POD BRIEF`.
- Updated HomePanel copy to “Give the pod one clear outcome; Armature gathers proof before edits” and “Tell Armature the outcome; the pod handles plan, tools, and evidence.”
- Updated focused Ink tests to assert `BLACKFIN`, `pod`, `POD BRIEF`, and the new briefing copy.

Verification:

- `npm test -- tests/ink-ui.test.tsx` -> `77` tests passed.
- `npm run lint` -> pass.
- `npm run build` -> pass.
- `npm test -- tests/release-evidence.test.ts` -> `3` tests passed.
- `npm test` -> `88` files / `1625` tests passed.
- `ARMATURE_THEME=armature node dist/bin/armature.js --version` -> `0.8.16`.

## 2026-05-01 - Armature killer-whale positioning correction

User correction:

- Armature's visual positioning is `虎鲸`, not generic deep-sea symbolism.
- The more precise framing is a joint motif: killer whale as the primary motif, ocean as the field motif, and pod intelligence as the product metaphor.

Action:

- Renamed the active identity language from `Abyssal Signal` to `Blackfin Signal`.
- Updated UI copy and motif language toward killer-whale cues: blackfin, pod, dorsal-fin silhouette, and echolocation.
- Updated Banner, HomePanel, ThemePicker, StatusBar tests, and the active PDCA fact-source docs.
- Added the explicit brand hierarchy to the visual system plan so ocean imagery remains supporting context rather than the main identity.

Verification:

- `npm test -- tests/ink-ui.test.tsx tests/release-evidence.test.ts` -> `80` tests passed.
- `rg` drift scan found only historical correction notes for `Abyssal -> Blackfin`, not active source naming.
- `npm run lint` -> pass.
- `npm run build` -> pass.
- `npm test` -> `88` files / `1625` tests passed.

## 2026-04-30 - Armature visual system PDCA closeout

Implementation:

- Added the terminal-native `Blackfin Signal` theme and made it Armature's default dark theme.
- Replaced the generic startup impression with an `ORCA` block wordmark, dorsal-fin / pod-signal motif, uppercase info rows, and compact fallback behavior.
- Reframed the HomePanel as `MISSION`, `POD SIGNAL`, `RECOVER`, and `GUARDRAILS` so the first screen stays operational instead of decorative.
- Updated ThemePicker and StatusBar language to make `Blackfin Signal` the explicit default while preserving existing theme choices.

Verification:

- `npm test -- tests/ink-ui.test.tsx` -> `77` tests passed.
- `npm run lint` -> pass.
- `npm run build` -> pass.
- `ARMATURE_THEME=armature node dist/bin/armature.js --version` -> `0.8.16`.
- `npm test -- tests/release-evidence.test.ts` -> `3` tests passed.
- `npm test` -> `88` files / `1625` tests passed.
- `ai check` was attempted through the local AI-Fleet binary, but it produced no output and hung in `runtime/control_plane/check_cli.py` / `tests/test_all.py`; child processes were interrupted and the gate remained a recorded residual risk for that historical tranche. Superseded by `REQ-041` on 2026-05-29.

Closeout:

- Skills: N/A. The existing `frontend-design` workflow was sufficient; no reusable cross-project skill emerged from this project-specific visual system pass.
- PDCA four docs: PRD, architecture, UX map, and platform optimization plan were updated with the visual system delta.
- Root agent guidance: N/A. The change is project-specific branding / Ink UI work, not a reusable rule for all projects.
- Three-end consistency: N/A. This is a local CLI visual refresh with no GitHub PR or VPS production deployment in scope.

## 2026-04-30 - Armature visual system design preflight

Context:

- User asked to optimize local Armature CLI, study Hermes Agent, and build a high-identity visual system across typography, palette, UI, and UX before PDCA execution.
- The target surface is the Ink terminal UI, not a browser page.
- Current project root is `/Users/mauricewen/Projects/armature-cli`; docs already contain the correct `PROJECT_DIR` block.
- Worktree is dirty with many pre-existing changes, so this tranche must stay narrowly scoped.

Design decision:

- Use `Blackfin Signal`: a killer-whale pod visual system.
- Learn Hermes's large wordmark, single symbolic mark, semantic skin tokens, compact fallback, and content-first banner.
- Do not copy Hermes's caduceus or gold-only identity; Armature gets a block `ORCA` wordmark, dorsal-fin / pod-signal motif, amber echolocation, brass, reef, kelp, coral, and foam tokens.

Plan artifacts:

- `ARMATURE_VISUAL_SYSTEM_PLAN.md`
- `ARMATURE_VISUAL_SYSTEM_PLAN.html`
- `task_plan.md` now tracks ORCA-VIS atomic tasks.

## 2026-04-29 - TaskRun scheduler/resume PDCA continuation

Context:

- User said `继续` after approval timeline and transcript readability tranches, so execution continued with ARMATURE-SWARM-020.
- The boundary is actionable queue recovery over existing TaskRun leases, not full replay of every historical command. Non-chat `run` TaskRuns do not yet persist replay-safe argv/prompt metadata.

PDCA executed:

- Plan: classify lease state, build a resume plan from TaskRun + WorkSession metadata, claim a lease only for resumable or monitorable records, and expose one direct command plus one scheduler command.
- Do: added `getTaskRunLeaseState()`, `buildTaskRunResumePlan()`, `armature queue resume <id>`, and `armature queue schedule`; chat saved sessions print `armature chat --cwd ... --continue <saved-session-id>`, running background jobs print `armature queue follow <id>`, unsupported replay exits without claiming a lease.
- Check:
  - `npm test -- tests/work-session-store.test.ts tests/queue-command.test.ts` -> `17` tests passed.
  - `npm run lint` -> pass.
  - `npm test -- tests/release-evidence.test.ts` -> `3` tests passed.
  - `npm run build` -> pass.
  - `npm test` -> `88` files / `1623` tests passed.
  - `node dist/bin/armature.js --version` -> `0.8.16`.
- Act: ARMATURE-SWARM-020 closes the scheduler/resume tranche for chat saved-session recovery; next queue item is model catalog SSoT plus replay-safe metadata for non-chat TaskRuns.

## 2026-04-29 - TaskRun approval timeline PDCA continuation

Context:

- User said `继续` after the Ink transcript readability fix.
- The remaining M3 evidence-console gap was review-before-apply history: approval decisions were visible only during the live prompt and were not durable TaskRun evidence.

PDCA executed:

- Plan: make approval decisions part of the TaskRun contract rather than separate log files so CLI and Ink evidence cannot drift.
- Do: added `TaskRun.approvals`, appended policy decision events from `policy-executor` through the chat proxy path, and rendered an Approval Timeline in both `armature queue evidence` and Ink `/evidence`.
- Check:
  - `npm test -- tests/work-session-store.test.ts tests/queue-command.test.ts tests/chat-proxy-tool-call.test.ts` -> `40` tests passed.
  - `npm run lint` -> pass.
  - `npm run build` -> pass.
  - `npm test` -> `88` files / `1620` tests passed.
  - `node dist/bin/armature.js --version` -> `0.8.15`.
- Act: ARMATURE-SWARM-018 closed the approval timeline gap; scheduler / resume semantics were later completed for chat saved-session recovery in ARMATURE-SWARM-020.

## 2026-04-29 - Ink transcript readability PDCA continuation

Context:

- User shared screenshots showing two concrete UX failures: submitted prompts were not visible after sending, and assistant output looked like raw markdown rather than structured terminal content.
- The boundary is Ink transcript rendering only; it does not change model prompts, model routing, or the approval timeline.

PDCA executed:

- Plan: make role ownership explicit in the transcript and improve markdown legibility with a small deterministic renderer rather than introducing a new dependency.
- Do: added `user_message` UI events, rendered prompts as highlighted `You` blocks, wrapped assistant output in `ORCA` response panels, and rendered headings/bullets/emphasis/code with terminal structure.
- Check:
  - `npm test -- tests/ink-ui.test.tsx tests/chat-session-emitter.test.ts` -> `84` tests passed.
  - `npm test -- tests/release-evidence.test.ts tests/ink-ui.test.tsx tests/chat-session-emitter.test.ts` -> `87` tests passed.
  - `npm run lint && npm run build && npm test` -> `88` files / `1619` tests passed.
  - `node dist/bin/armature.js --version` -> `0.8.14`.
- Act: ARMATURE-SWARM-019 closes the screenshot-reported transcript readability gap; approval timeline and scheduler/resume remain next.

## 2026-04-29 - Ink TaskRun evidence panel PDCA continuation

Context:

- User continued the SOTA swarm PDCA queue after chat REPL TaskRun records were committed.
- The remaining M3 gap was evidence access inside the Ink REPL: CLI `armature queue evidence` could inspect TaskRun artifacts, but the chat operator still had to leave the session or open raw files.
- The boundary is evidence inspection, not the later approval timeline or scheduler/resume work.

PDCA executed:

- Plan: reuse the queue evidence drawer model and markdown formatter so CLI and Ink cannot drift.
- Do: exported the TaskRun evidence drawer model from `src/commands/queue.ts`, added `/evidence` to the shared slash registry, and routed it through `chat-slash-readonly` into an Ink `DetailPanel`.
- Check:
  - `npm run build && npm test -- tests/queue-command.test.ts tests/chat-slash-readonly.test.ts tests/slash-commands.test.ts tests/ink-ui.test.tsx` -> `108` tests passed.
  - `npm test -- tests/release-evidence.test.ts tests/queue-command.test.ts tests/chat-slash-readonly.test.ts tests/slash-commands.test.ts tests/ink-ui.test.tsx` -> `111` tests passed.
  - `npm run lint && npm run build && npm test` -> `88` files / `1615` tests passed.
  - `node dist/bin/armature.js --version` -> `0.8.13`.
- Act: ARMATURE-SWARM-017 closes the Ink evidence inspection gap; next queue item is ARMATURE-SWARM-018 approval timeline, then scheduler/resume semantics.

## 2026-04-29 - Chat REPL TaskRun records PDCA continuation

Context:

- User said `继续` after the chat operator control plane commit.
- The remaining M2 gap was the interactive `armature chat` turn lifecycle: `run` and `serve /chat` were queue-visible, but REPL turns still completed outside the canonical `WorkSession` / `TaskRun` spine.
- The boundary is per-turn queue records and focused tests, not the later Ink evidence timeline or scheduler/resume work.

PDCA executed:

- Plan: preserve the existing REPL turn behavior, add a structured return value from `executeReplTurn()`, and let `runREPL()` persist that result through the shared work-session store.
- Do: added `chat` as a `TaskRunKind`, created one chat `WorkSession` per REPL session, wrapped normal prompts in `TaskRun` records, and recorded status/usage/duration/runtime evidence for completed, failed, and aborted turns.
- Check:
  - `npm run build` -> pass.
  - `npm run lint` -> pass.
  - `npm test -- tests/chat-repl-turn.test.ts tests/work-session-store.test.ts` -> `19` tests passed.
  - `npm run lint && npm run build && npm test` -> `88` files / `1613` tests passed.
  - `node dist/bin/armature.js --version` -> `0.8.12`.
- Act: M2 unified execution contract is now closed for chat/run/serve records; next queue item is Ink TaskRun evidence UX and scheduler/resume semantics.

## 2026-04-29 - Chat operator control plane PDCA continuation

Context:

- User said `继续` after the clean-index command baseline commit.
- The next isolated dirty baseline covers chat REPL operator controls and Ink UX plumbing, but it still does not create canonical TaskRun records for chat turns.
- The boundary is session/model/permissions command ergonomics plus display surfaces, not the final queue-backed chat lifecycle.

PDCA executed:

- Plan: stage the remaining chat/operator-control source and tests together because chat helpers, session store, model catalog, MCP startup, serve recovery, and Ink panels are tightly coupled.
- Do: added runtime identity prompt handling, workflow preset startup policy, richer slash command helpers, command-output sanitization, Ink home/action/detail/option panels, and expanded serve/session/model/MCP support.
- Check:
  - Clean staged-index `npm run build` -> pass.
  - Clean staged-index `npm test -- tests/chat-internals.test.ts tests/chat-slash-mutations.test.ts tests/chat-slash-readonly.test.ts tests/chat-repl-turn.test.ts tests/chat-one-shot-mcp-cleanup.test.ts tests/ink-ui.test.tsx tests/command-output.test.ts tests/session-command.test.ts tests/serve-command.test.ts tests/model-catalog.test.ts tests/mcp-client.test.ts tests/mode-system-prompt.test.ts` -> `248` tests passed.
  - Clean staged-index command pack plus release-evidence guard -> `251` tests passed.
  - `npm run lint && npm run build && npm test` -> `88` files / `1611` tests passed.
  - `node dist/bin/armature.js --version` -> `0.8.11`.
- Act: next queue item remains canonical TaskRun production for chat REPL turns and the TaskRun evidence side panel / approval timeline.

## 2026-04-29 - Clean-index command baseline PDCA continuation

Context:

- User said `继续` after the `armature run` execution-contract commit.
- Clean checkout build still failed because `program.ts` referenced declared workflow, permissions, evolve, and git-root surfaces that were present in the active worktree but not in the committed baseline.
- The current boundary is command assembly and permission/evolution command support, not the larger dirty chat/Ink baseline.

PDCA executed:

- Plan: keep the tranche reviewable, add a lightweight workflow command module, and commit the real permissions/evolve/config/git-root support needed for clean-index command assembly.
- Do: wired `program.ts` to `src/commands/workflows.ts`, added `permissions` and `evolve` command files, committed config-backed permission mode and allowlist helpers, added `src/git-repository.ts`, and promoted workflow/provider config metadata covered by the existing config and command-contract tests.
- Check:
  - Clean staged-index `npm run build` -> pass.
  - Clean staged-index `npm test -- tests/config.test.ts tests/permissions-command.test.ts tests/program.test.ts tests/command-contracts.test.ts tests/release-evidence.test.ts tests/v030-harness.test.ts` -> `100` tests passed.
  - `npm run lint && npm run build && npm test` -> `88` files / `1611` tests passed.
  - `node dist/bin/armature.js --version` -> `0.8.10`.
- Act: after verification, return to remaining chat REPL TaskRun lifecycle and Ink evidence UX queue items.

## 2026-04-29 - Run execution contract PDCA continuation

Context:

- User said `继续` after the CI gate integrity commit, so execution continued with the unified execution contract queue.
- `serve /chat` already writes canonical run records; `armature run` still needed the same WorkSession / TaskRun spine for default, goal-loop, mission, and plan execution.
- The current boundary is the run surface only; the broader dirty chat/UI/permissions baseline remains outside this tranche.

PDCA executed:

- Plan: create the run WorkSession / TaskRun before branch dispatch, finish it consistently from default run, goal-loop, mission, and plan branches, and keep queue evidence inspectable.
- Do: wire `src/commands/run.ts` to WorkSession / TaskRun storage, add runtime observations, pass WorkSession ids into usage records, and add run-work-session coverage for default, mission, and plan modes.
- Check:
  - `npm test -- tests/run-work-session.test.ts tests/work-session-store.test.ts tests/queue-command.test.ts` -> `14` tests passed.
  - Clean staged-index `npm test -- tests/run-work-session.test.ts tests/evolution-store.test.ts tests/work-session-store.test.ts tests/queue-command.test.ts tests/release-evidence.test.ts tests/v030-coverage.test.ts` -> `40` tests passed.
  - `npm run build` -> pass.
  - `npm run lint && npm run build && npm test` -> `88` files / `1611` tests passed.
  - `npm test -- tests/release-evidence.test.ts` -> `3` tests passed.
  - `node dist/bin/armature.js --version` -> `0.8.9`.
- Act: next queue item remains chat REPL TaskRun production and Ink evidence timeline, after the dirty chat/UI baseline is split into a reviewable boundary.

## 2026-04-29 - CI gate integrity PDCA continuation

Context:

- User said `继续` after the release evidence snapshot commit, so execution continued with ARMATURE-SWARM-012.
- The docs and package scripts advertised matrix, security, performance, and eval gates, while CI still ran only the narrower build/test path plus a stale benchmark command.
- The current boundary is gate enforcement and manifest synchronization, not broad feature work in the dirty UI/permissions/evolution baseline.

PDCA executed:

- Plan: use `agent-eval/manifests/test-matrix.json` as the single source for matrix layers, wire package scripts through a sync checker, and make CI run the documented high-signal rows.
- Do: add the `gate-integrity` CI job, matrix runner, sync checker, generated entrypoint snippet, lightweight secret/license helpers, and fast serve-continuity eval task. Also remove the full-suite flaky global stderr spy from the hook system-message regression by injecting a local writer.
- Check:
  - `npm run test:matrix:sync` -> pass.
  - Clean staged-index `npm run test:matrix:sync` -> pass.
  - Clean staged-index `npm test -- tests/agent-eval-manifests.test.ts tests/test-matrix-runner.test.ts tests/test-matrix-sync.test.ts tests/release-evidence.test.ts` -> `22` tests passed.
  - `npm run test:unit` -> `outputs/test-matrix/run-20260429-061427/matrix.md`.
  - `npm test -- tests/v050-modules.test.ts tests/agent-eval-manifests.test.ts tests/test-matrix-runner.test.ts tests/test-matrix-sync.test.ts tests/release-evidence.test.ts` -> `69` tests passed.
  - `npm run test:static` -> `outputs/test-matrix/run-20260429-060205/matrix.md`.
  - `npm run test:security` -> `outputs/test-matrix/run-20260429-060222/matrix.md`.
  - `npm run test:performance` -> `outputs/test-matrix/run-20260429-060232/matrix.md`.
  - `npm run test:ai-eval-fast` -> `outputs/test-matrix/run-20260429-060243/matrix.md`.
  - `npm run lint && npm run build && npm test` -> `88` files / `1609` tests passed.
- Act: next queue returns to unified execution contract and Ink evidence UX after CI enforcement is committed.

## 2026-04-29 - Release evidence snapshot PDCA continuation

Context:

- User said `继续` after the slash-command registry commit, so execution continued with ARMATURE-SWARM-011.
- README and active PDCA docs had current counts copied manually, while historical notes still contain older counts from earlier tranches.
- The right fix is a guard for the active release evidence surface, not rewriting historical logs.
- The release snapshot is scoped to the active worktree because this repository currently has a queued uncommitted baseline; clean staged-index has fewer tracked test files but must not pull those unrelated files into this commit.

PDCA executed:

- Plan: create one release evidence snapshot and make tests enforce that README plus active PDCA docs match it.
- Do: add `verification_snapshot.json`; add `tests/release-evidence.test.ts`; update README and active PDCA docs to `0.8.7`, `88` test files, and `1609` tests.
- Check:
  - `npm test -- tests/release-evidence.test.ts` -> `3` tests passed.
  - `npm run lint` -> pass.
  - `npm run build` -> pass.
  - Full `npm test` -> `88` files / `1609` tests passed.
  - Clean staged-index `npm test -- tests/release-evidence.test.ts` -> `3` tests passed.
  - Clean staged-index full `npm test` remains blocked by pre-existing baseline dependencies outside ARMATURE-SWARM-011 (`src/program.ts` imports unstaged command surfaces; MCP policy tests require unstaged policy executor work).
  - `node dist/bin/armature.js --version` -> `0.8.7`.
- Act: next queue item is ARMATURE-SWARM-012 CI matrix/security/performance/eval gate enforcement.

## 2026-04-29 - Slash command registry PDCA continuation

Context:

- User said `继续` after the `queue evidence` commit, so execution continued with ARMATURE-SWARM-010.
- Slash-command discovery was split across REPL completion, Ink command picker, future HomePanel hints, and `/help` rendering.
- The working tree still contains a broad unrelated UI and agent-eval baseline; this tranche keeps execution handlers unchanged and centralizes metadata only.

PDCA executed:

- Plan: create a small shared registry for slash command metadata and wire only discovery/display consumers to it.
- Do: add `src/slash-commands.ts`; route REPL completion, Ink picker, and `/help` sections through the registry. The registry also exposes HomePanel descriptions, but the HomePanel consumer remains part of the unstaged UI baseline.
- Check:
  - `npm test -- tests/slash-commands.test.ts tests/chat-slash-readonly.test.ts tests/ink-ui.test.tsx` -> `98` tests passed.
  - `npm run lint` -> pass.
  - `npm run build` -> pass.
  - Full `npm test` -> `87` files / `1606` tests passed.
  - `node dist/bin/armature.js --version` -> `0.8.6`.
  - Clean staged-index targeted regression for the committed hunks -> `98` tests passed.
  - `git diff --cached --check` -> pass.
- Act: next queue items are ARMATURE-SWARM-011 documentation count drift cleanup and ARMATURE-SWARM-012 CI gate integrity, unless the dirty UI baseline must be split first.

## 2026-04-29 - Queue evidence drawer PDCA continuation

Context:

- User said `继续` after the `serve /chat` canonical run commit, so execution continued with ARMATURE-SWARM-009.
- The working tree contains a broad uncommitted Ink UI baseline (`DetailPanel`, `HomePanel`, `OptionPicker`, and related tests). This tranche avoids mixing that baseline into the evidence-drawer commit.

PDCA executed:

- Plan: make TaskRun evidence inspectable from the queue surface first, then leave full Ink side-panel integration as a later UX tranche.
- Do: add `armature queue evidence <task-run-id>` with typed evidence entries, resolved paths, file size, update time, missing-file state, and bounded tail previews.
- Check:
  - `npm test -- tests/queue-command.test.ts tests/work-session-store.test.ts` -> `11` tests passed.
  - Clean staged-index targeted check: `npm test -- tests/queue-command.test.ts tests/work-session-store.test.ts` -> `11` tests passed.
  - `npm run lint` -> pass.
  - `npm run build` -> pass.
  - Full `npm test` -> `86` files / `1602` tests passed.
  - `node dist/bin/armature.js --version` -> `0.8.5`.
  - `ai check` -> failed on existing harness/doc gates: docs frontmatter/changelog baseline, historical no-emoji hits, and missing `tests/test_all.py` in the generic test runner. Evidence: `outputs/check/20260429-044244-b917cb00`. Superseded by `REQ-041` on 2026-05-29.
- Act: next queue item is ARMATURE-SWARM-010, centralizing slash-command registry, unless the dirty UI baseline or repo-local `ai check` adapter must be closed first.

## 2026-04-29 - Serve canonical run PDCA continuation

Context:

- User said `继续` after the queue takeover commit, so execution continued with ARMATURE-SWARM-008.
- `serve.ts` and `tests/serve-command.test.ts` already contained unrelated continuity/security endpoint changes in the dirty worktree. This tranche added only the `/chat` canonical run-record behavior on top of that file state.

PDCA executed:

- Plan: convert valid `POST /chat` requests into canonical run records without changing the existing HTTP protocol shape more than necessary.
- Do: create `WorkSession` / `TaskRun` for valid `serve /chat` requests, close the TaskRun on success/failure, return ids in non-streaming JSON, and emit ids as streaming `metadata` SSE.
- Check:
  - `npm test -- tests/serve-command.test.ts tests/work-session-store.test.ts` -> `15` tests passed.
  - `npm run lint` -> pass.
  - `npm run build` -> pass.
  - Full `npm test` -> `86` files / `1600` tests passed.
  - `node dist/bin/armature.js --version` -> `0.8.4`.
  - Clean staged-index targeted check: `npm test -- tests/serve-command.test.ts tests/work-session-store.test.ts` -> `7` tests passed.
  - Clean staged-index checkout at `/tmp/armature-index-008.WnEC1K` exposed pre-existing uncommitted baseline dependencies (`src/program.ts` imports `chat` subcommand exports, `permissions`, `evolve`, and workflow preset surfaces that are not all present in `HEAD`). The active workspace is verified; this tranche does not claim to close that older baseline hygiene debt.
- Act: next queue item is ARMATURE-SWARM-009, TaskRun evidence drawer / richer evidence console.

## 2026-04-29 - Queue takeover PDCA continuation

Context:

- User said `继续` after the `queue follow` tranche, so execution continued with ARMATURE-SWARM-007.
- The current boundary is lease metadata and operator ownership. It is not a scheduler, process migration, or resume engine.

PDCA executed:

- Plan: add a minimal TaskRun lease model with bounded TTL, active-lease refusal, expired-lease replacement, and explicit `--force`.
- Do: add `TaskRunLease`, `claimTaskRunLease()`, and `armature queue takeover <task-run-id> --holder <name> --ttl <duration>`.
- Do: show lease metadata in `queue list` and `queue show` so the operator can see who currently owns a TaskRun.
- Check:
  - `npm test -- tests/queue-command.test.ts tests/work-session-store.test.ts` -> `9` tests passed.
  - `npm run build` -> pass.
  - Full `npm test` -> `86` files / `1598` tests passed.
  - `node dist/bin/armature.js --version` -> `0.8.3`.
  - `node dist/bin/armature.js queue takeover <fixture-task-run> --holder smoke --ttl 30s` -> acquired the fixture lease.
- Act: next queue item is ARMATURE-SWARM-008, converting `serve /chat` into a canonical run endpoint.

## 2026-04-29 - Queue follow PDCA continuation

Context:

- User said `继续` after the SOTA swarm audit commit, so execution continued from the next atomic queue item.
- Before adding new work, the previous commit was amended to include the missing `src/work-session-store.ts` and `tests/work-session-store.test.ts` dependency so the `queue` surface is commit-complete.

PDCA executed:

- Plan: implement ARMATURE-SWARM-006 without introducing scheduler or lease semantics.
- Do: add `armature queue follow <task-run-id>` with `--once`, `--lines`, and `--interval`; stream TaskRun evidence file tails and background-job logs when attached.
- Do: remove stale hard-coded CLI version strings from `program`, `output`, and Ink startup banner paths by reading the package version through `src/version.ts`.
- Check:
  - `npm run lint` -> pass.
  - `npm test -- tests/queue-command.test.ts tests/work-session-store.test.ts tests/program.test.ts tests/command-contracts.test.ts` -> `39` tests passed.
  - `npm test -- tests/v030-harness.test.ts tests/program.test.ts tests/queue-command.test.ts tests/work-session-store.test.ts tests/command-contracts.test.ts` -> `59` tests passed.
  - `npm run build` -> pass.
  - Final `npm test` -> `86` files / `1595` tests passed.
  - `node dist/bin/armature.js --version` -> `0.8.2`.
  - `node dist/bin/armature.js queue follow <fixture-task-run> --once --lines 1` -> printed the fixture evidence tail.
- Act: next queue item is ARMATURE-SWARM-007, lease-based `queue takeover`.

## 2026-04-29 - SOTA swarm audit and first PDCA tranche

Context:

- User requested a SOTA swarm audit for `/Users/mauricewen/Projects/armature-cli`, a routed audit report, milestone plan, atomic task queue, and queue/swarm PDCA execution.
- Worktree was already dirty at audit start; existing user changes were preserved.
- Swarm lanes covered architecture, security, UX/TUI, verification/release, and docs/governance.

Key findings:

- Critical trust issue: repo-local `.armature` / `.claude` hooks could be loaded and executed on startup without explicit project trust.
- High network issue: `fetch_url` and `web_search` were not treated as dangerous tools, and `fetch_url` had no loopback/private target guard.
- Runtime gap: `WorkSession` / `TaskRun` exists, but execution is still split across `run`, `serve`, mission, and planner paths.
- Queue gap: TaskRun data existed, but there was no top-level CLI queue inspection surface.
- UX gap: review-before-apply needs richer evidence panels than short diff/preview text.
- Governance gap: docs/test-count claims and CI gate coverage can still drift from actual runtime evidence.

PDCA executed:

- Plan: choose small, reversible first tranche focused on trust boundary and queue visibility.
- Do: harden hook loading/env, approval-gate network tools, block private `fetch_url` targets, add `armature queue list/show`.
- Check:
  - `npm test -- tests/hooks.test.ts tests/hooks-compat.test.ts tests/tools.test.ts tests/chat-proxy-tool-call.test.ts tests/v030-harness.test.ts tests/v050-modules.test.ts` -> `153` tests passed.
  - `npm test -- tests/queue-command.test.ts tests/program.test.ts tests/command-contracts.test.ts tests/work-session-store.test.ts` -> `37` tests passed.
  - Combined targeted regression pack -> `190` tests passed.
  - `npm run lint` -> pass.
  - `npm run build` -> pass.
  - Final `npm test` -> `86` files / `1593` tests passed.
- Act: next queue items are `queue takeover`, execution-contract unification, evidence console, CI gate integrity, and doc count cleanup.

Artifacts:

- `doc/00_project/initiative_armature/SOTA_GAP_SWARM_AUDIT.md`
- `doc/00_project/initiative_armature/SOTA_GAP_SWARM_AUDIT.html`

## 2026-04-26 — Provider-grouped model picker fix

- Root cause:
  - Ink `/model` used only `choice.model` as the selected value.
  - Duplicate names such as `gpt-5.4` across Copilot/Poe/OpenAI then resolved through the first matching model name.
- Fix:
  - added provider+model keys and provider grouping in `src/model-catalog.ts`
  - changed Ink `/model` to select provider first, then model inside that provider
  - changed direct `/model set <name>` to prefer the current provider when names are duplicated
  - grouped legacy `/models` output by provider while keeping numeric selection stable
  - windowed `OptionPicker` to avoid rendering dense long lists all at once
- Verification:
  - focused: `npm test -- tests/model-catalog.test.ts tests/ink-ui.test.tsx tests/chat-slash-mutations.test.ts tests/chat-slash-readonly.test.ts`
  - type/build: `npm run lint`, `npm run build`
  - full: `npm test`
  - dist smoke: `node dist/bin/armature.js --version`

## 2026-04-22 — One-click full delivery supervision log

### Round 1

- Hypothesis:
  - current worktree already contains the intended trust-policy/eval tranche; the missing piece is full delivery structure and fresh stage evidence
- Action:
  - read `task_plan.md`, `notes.md`, `deliverable.md`, `PDCA_ITERATION_CHECKLIST.md`
  - re-read `PRD.md`, `SYSTEM_ARCHITECTURE.md`, `USER_EXPERIENCE_MAP.md`, `README.md`, `AGENT_EVAL_PLAN.md`
  - spawn planner / verifier / code-review / security-review subagents
- Validation:
  - planning lane confirmed this pass should package the current tranche, not start future continuity implementation
  - verification lane confirmed the previously refreshed baseline was green but still needed release-structure closeout
- Learning:
  - the task boundary is delivery-quality closure on the current tranche
- Next:
  - treat review/security findings as blocking gates

### Round 2

- Hypothesis:
  - release risk now lives in trust-policy edges rather than generic functionality
- Action:
  - collect explicit audit/pack/bench evidence
  - review security and code-review findings against current source
- Validation:
  - security/code review identified high-severity trust-policy gaps:
    - repo-local MCP autospawn
    - zero-tool allowlist fail-open
    - stdout hook noise on MCP transport
    - unbounded `/chat` body parsing
    - global config test isolation risk
- Learning:
  - “tests green” was not enough; the release gate had to include attacker review and policy review
- Next:
  - fix the smallest blocking set and rerun from targeted verification up to release gates

### Round 3

- Hypothesis:
  - the blocking findings can be resolved with small runtime/test changes, not a redesign
- Action:
  - `src/mcp-client.ts`: add config provenance + startup-safe autoconnect
  - `src/commands/chat.ts`: switch startup MCP paths to startup-safe connect
  - `src/policy-executor.ts`: deny-all for empty allowlists; send hook notices to `stderr`
  - `src/mcp-server.ts`: filter `tools/list` by active allowlist
  - `src/commands/serve.ts`: add body-size hard limit and `413`
  - `tests/*`: add regressions for startup-safe MCP, zero-tool fail-closed, stderr hook notices, oversized `/chat`, and sandboxed global config coverage
- Validation:
  - targeted trust-policy regression pack passed: `100/100`
  - full suite passed: `1553/1553`
- Learning:
  - explicit MCP connect remains intact while repo-driven autospawn is gone
  - the shared policy layer now behaves consistently across MCP and serve
- Next:
  - rerun matrix + gates and assemble stage artifacts

### Round 4

- Hypothesis:
  - once the trust-policy blockers are fixed, the full release chain should recover without further code changes
- Action:
  - rerun:
    - `npm run lint`
    - `npm test`
    - `npm run build`
    - `npm run test:matrix:sync`
    - `npm run test:matrix`
    - `npm run eval:nightly`
    - `npm run eval:release`
  - refresh direct `npm audit` evidence
  - capture rollback and learn artifacts
- Validation:
  - `npm test` → `1553/1553`
  - `test:matrix` → `run-20260422-061719`
  - `eval:nightly` → `20260422-061814-339289`
  - `eval:release` → `20260422-061914-913077`
  - `npm audit --omit=dev` → `0` vulnerabilities
- Learning:
  - release readiness is now supported by fresh evidence on all required stages
  - remaining risks are roadmap/planning gaps, not unresolved delivery blockers
- Next:
  - finish deliverable, PDCA, rollback path, and DNA capsule candidate list

## 2026-04-22 — Harness verification refresh

- Trigger:
  - active `.omx` / handoff state still pointed at the older 2026-04-16 SOTA gate tranche
  - current worktree already included later trust-policy / continuity / hook slices
  - the root-agent completion path needed fresh green evidence rather than relying on stale run ids
- Initial failure:
  - `tests/test-matrix-runner.test.ts` failed in the "reads layer definitions from the manifest" smoke
  - RCA showed the runner itself was fine; its `unit` layer surfaced a real downstream failure in `tests/config.test.ts`
- Root cause:
  - Cloudflare aggregator selection now supports the "no gateway token, infer upstream provider key from the selected model prefix" path
  - the `findAggregator()` negative smoke only cleared aggregator env vars, so on machines with real `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GOOGLE_*` / `XAI_API_KEY` values, `cloudflare` could still be considered available
  - that made the "returns undefined" test machine-dependent and, in turn, caused `test-matrix-runner` and nightly `gate-test` to fail nondeterministically
- Minimal fix:
  - keep runtime behavior unchanged
  - tighten the test fixture in `tests/config.test.ts` so the negative aggregator smokes also clear routed provider env vars and Cloudflare base-url env vars
- Verification after the fix:
  - `npm run lint`
  - `node --experimental-vm-modules node_modules/.bin/vitest run tests/hooks.test.ts tests/agent-eval-manifests.test.ts tests/test-matrix-runner.test.ts tests/test-matrix-sync.test.ts`
  - `npm run build`
  - `npm test` → `1546/1546`
  - `npm run test:matrix:sync` → `ok`
  - `npm run eval:fast` → run `20260422-054119-735043` (`62/62`)
  - `npm run eval:nightly` → run `20260422-054727-090885` (`65/65`)
  - `npm run eval:release` → run `20260422-054415-886673` (`68/68`)
  - `npm run test:matrix` → run `20260422-054827`
- Matrix interpretation:
  - `static`, `security`, and `performance` still report `partial-pass`
  - those statuses are expected manifest semantics, not red failures; all layer exit codes are `0`
- Remaining documentation debt inside scope:
  - `HANDOFF.md` and the top-level task header were stale and needed a superseding update
  - `AGENT_EVAL_PLAN.md` still contains the older long-range inventory framing; keep that as a follow-up planning artifact rather than silently pretending it is already refreshed

## 2026-04-21 — Cloudflare AI Gateway provider

- User asked for a Cloudflare-backed backup path instead of keeping Poe as the only aggregator story in the surrounding toolchain.
- Scope decision:
  - keep Armature on its existing OpenAI-compatible runtime
  - add Cloudflare as a well-known aggregator provider instead of inventing a second transport
  - require explicit gateway base URL because Cloudflare account/gateway IDs are deployment-specific and cannot be guessed safely inside the CLI
- Implementation landed:
  - added well-known `cloudflare` provider defaults in `src/config.ts`
  - added env-backed base URL resolution via `CLOUDFLARE_AI_GATEWAY_BASE_URL`
  - added computed base URL fallback from `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_AI_GATEWAY_ID`
  - added `claudeflare` alias for the same aggregator lane
  - added dual auth handling for Cloudflare:
    - gateway token when `CLOUDFLARE_AI_GATEWAY_API_KEY` exists
    - request-based provider key inferred from model prefix when it does not
  - added cloudflare model fallback selection so the provider auto-picks a locally usable model instead of blindly sticking to `claude-opus`
  - marked Cloudflare as a known aggregator for council/race/pipeline routing
  - updated README provider matrix and setup snippets
  - added regression coverage in:
    - `tests/config.test.ts`
    - `tests/model-catalog.test.ts`
- Verification:
  - `npm run lint`
  - `npm test`
  - `npm run build`
  - `armature providers` now shows `cloudflare` as `ready` on this machine; the verified usable models are `openai/gpt-5.4` and `google-ai-studio/gemini-3.1-pro-preview`
  - local default was then aligned to `openai/gpt-5.4` so Armature matches AI-Fleet `1c` and prefers the already verified OpenAI path before falling back to Gemini
  - multi-model collaboration policy was then changed to prefer `GitHub Copilot -> Cloudflare -> Poe/OpenRouter` for `council` / `race` / `pipeline`, because Copilot subscription economics are better for this machine than burning Cloudflare credits first
  - startup banners for `council` / `race` / `pipeline` now print that preference directly:
    - `via copilot (preferred) · fallback cloudflare`
    - explicit `-p <provider>` overrides are labelled as forced overrides instead of looking like auto-routing
  - startup banners now also print billing path explicitly:
    - `billing: copilot subscription · fallback cloudflare credits`

## 2026-04-21 — SOTA SOP benchmark

- Evidence window:
  - 2025-04-21 → 2026-04-21

## 2026-04-22 — Global Armature hooks

- User requirement from AI-Fleet side: Armature should participate in the same Terminal-title automation lane as the other interactive CLIs, not remain a manual-only outlier.
- Native hook load order already merged project `.armature/hooks.json`, Claude, and Codex sources; the missing surface was a global Armature-native hook file.
- Implementation choice:
  - add `~/.armature/hooks.json` as a first-class native hook source
  - keep merge-only semantics; no override hierarchy changes
  - preserve relative-command execution semantics by continuing to resolve commands from the directory that owns the hook file
- Verification:
  - `npm run lint`
  - `npm test -- tests/hooks.test.ts`
  - `npm run build`
- Residual verification gap:
  - full `npm test` still has unrelated failures outside hook loading; do not attribute those to this change without separate investigation
- Product set:
  - Claude Code
  - OpenAI Codex
  - Amp
  - OpenCode
  - Cursor
  - GitHub Copilot coding agent
- Working comparison matrix:

| Product | Workflow Shape | Trust / Review Gate | Continuity Surface | Evidence Surface | Most Transferable SOP |
| --- | --- | --- | --- | --- | --- |
| Claude Code | init → plan/execute → review/test → iterate | explicit permission modes + sandboxing + hooks | terminal + IDE + desktop + browser continuity | analytics + `/permissions` + `/doctor` + hooks | first-class operator policy surfaces with durable guidance + analytics |
| OpenAI Codex | ask/plan → execute → review → automate | approval mode + sandbox mode + read-only plan mode | app + IDE + CLI + cloud threads + worktrees | review pane + automations + admin analytics | workflow lanes should be enforceable policy, not just labels |
| Amp | short thread → handoff / map / review → continue | allow/ask/deny/delegate + checks | thread URLs + thread map + editor panel | thread graph + stats + metrics API | thread/handoff must be first-class collaboration object |
| OpenCode | TUI / run / serve / web / github | allow/ask/deny + per-agent permission + doom-loop guards | terminal + web + GitHub + share links | local logs + stats + on-disk sessions + share history | continuity works best when session objects are portable across local/web/CI |
| Cursor | background agent queue + takeover/follow-up + bugbot | foreground approval + PR review triggers | IDE + web + mobile + remote VM | agent status + bugbot logs + privacy/data policy | async work needs visible agent queue and handoff back into editor |
| GitHub Copilot agent | assign → cloud run → PR/timeline review → follow-up comment | human review required; workflows gated | GitHub panel + CLI + mobile + IDE + PR thread | session logs + usage + PR timeline + metrics | remote agent loops need explicit review and log inspection before merge |

- Cross-product pattern:
  - durable session/thread object
  - explicit trust/approval gate
  - remote or detached execution surface
  - human-review checkpoint before merge/apply
  - visible evidence surface (logs, status, share link, usage, timeline)
- Armature-specific conclusion:
  - Wave 3 has materially closed workflow packaging / trust clarity gaps
  - the largest remaining SOTA gap is now Wave 4 continuity:
    - durable session object across terminal / web / IDE
    - detached execution with visible queue + resumable take-over
    - explicit evidence/log/timeline surface for async work
  - the next operator-shell gap after continuity is a stronger inspect-and-act evidence console rather than more preset names
  - first concrete continuity foothold now landed:
    - stable REPL `sessionId`
    - `/status` and status bar expose the active session id
    - `armature serve` exposes `GET /sessions` and `GET /sessions/latest`
    - `armature -c <id>` resumes a specific saved session object
    - `armature serve` exposes `GET /sessions/:id` for single-session inspect
  - attacker-review follow-up tightened the HTTP boundary:
    - `/health` no longer leaks continuity metadata
    - no wildcard CORS for untrusted origins
    - session-discovery endpoints are loopback-only
- Source set:
  - Claude Code docs:
    - https://code.claude.com/docs
    - https://code.claude.com/docs/en/tutorials
    - https://code.claude.com/docs/en/how-claude-code-works
    - https://code.claude.com/docs/en/permissions
    - https://code.claude.com/docs/en/sandboxing
    - https://code.claude.com/docs/en/analytics
    - https://code.claude.com/docs/en/hooks
  - OpenAI Codex:
    - https://openai.com/index/introducing-codex/
    - https://openai.com/index/codex-now-generally-available/
    - https://developers.openai.com/codex/app
    - https://developers.openai.com/codex/learn/best-practices
    - https://developers.openai.com/codex/use-cases
  - Amp:
    - https://ampcode.com/manual
    - https://ampcode.com/notes/permissions
    - https://ampcode.com/news/thread-map
    - https://ampcode.com/news/agents-panel
    - https://ampcode.com/news/read-threads
    - https://ampcode.com/security
  - OpenCode:
    - https://opencode.ai/docs/agents/
    - https://opencode.ai/docs/permissions
    - https://opencode.ai/docs/cli/
    - https://opencode.ai/docs/web/
    - https://opencode.ai/docs/github/
    - https://opencode.ai/docs/troubleshooting/
    - https://dev.opencode.ai/docs/share/
  - Cursor:
    - https://docs.cursor.com/background-agents
    - https://cursor.com/blog/agent-web
    - https://docs.cursor.com/bugbot
    - https://cursor.com/en-US/security
    - https://cursor.com/en-US/data-use
  - GitHub Copilot:
    - https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-cloud-agent
    - https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/track-copilot-sessions
    - https://docs.github.com/en/copilot/how-tos/copilot-on-github/use-copilot-agents/review-copilot-output
    - https://github.blog/changelog/2025-07-09-copilot-coding-agent-now-supports-remote-mcp-servers/
    - https://github.blog/changelog/2025-09-04-remote-github-mcp-server-is-now-generally-available/
    - https://github.blog/changelog/2025-10-28-copilot-coding-agent-now-supports-self-hosted-runners/

## 2026-04-20 — SOTA picker parity follow-up

- User asked to keep pushing Armature's terminal UX toward Claude Code / Codex style selection flows instead of leaving command surfaces split between free text, numbered prompts, and bespoke boxes.
- Scope decision:
  - target only finite-choice/high-signal interactions first
  - keep free-text commands (`/notes add`, `/prompts find`, `/thread search`) as text input for now
  - preserve legacy readline behavior while upgrading Ink/TUI behavior
- Architectural decision:
  - use one shared picker event contract (`option_picker_request`) rather than wiring each command directly to a component
  - use one shared picker frame shell so command discovery, finite-choice menus, permission confirmation, and theme selection stop drifting visually
- Implementation landed:
  - added `src/ui/components/PickerFrame.tsx`
  - added `src/ui/components/OptionPicker.tsx`
  - added `emitOptionPicker()` to `src/ui/session.ts`
  - extended `src/ui/types.ts` with picker request/option types
  - `src/ui/components/App.tsx` now hosts the picker request lifecycle
  - Ink-mode finite-choice flows now use the picker for:
    - `/model`, `/models`
    - `/mode`
    - `/effort`
    - `/load`
    - `/thread load`, `/thread delete`
    - `/mcp enable`, `/mcp disable`, `/mcp connect`
    - `ask_user(options)`
  - Ink-mode search/discovery flows now use filterable picker mode for:
    - `/thread search`
    - `/notes search`
    - `/prompts find`
    - `/postmortem search`
  - `OptionPicker` now supports:
    - in-picker filtering
    - initial query seeding from slash-command arguments
    - empty-state rendering (`no matches`)
- visual shell unification landed for:
  - `CommandPicker`
  - `PermissionPrompt`
  - `ThemePicker`
- Verification:
  - `npm run lint`
  - targeted picker/UI suites
  - full `npm test`
  - `npm run build`
- Latest full-suite evidence after this tranche:
  - `npm test` => `1450/1450`
- Competitive research/reporting backfill landed after the user explicitly called out the missing report:
  - added canonical report `SOTA_EXPERIENCE_GAP_REPORT.md`
  - added human-readable companion `SOTA_EXPERIENCE_GAP_REPORT.html`
  - updated PDCA docs so future execution is anchored to competitive evidence rather than only local code intuition
- Wave 1 portability tranche landed:
  - top-level saved-session lifecycle:
    - `armature session fork`
    - `armature session export`
    - `armature session import`
  - REPL thread portability:
    - `/thread export`
    - `/thread import`
    - `/thread handoff`
  - storage helpers added in:
    - `src/session-store.ts`
    - `src/memory/threads.ts`
  - command surfaces added in:
    - `src/commands/session.ts`
    - `src/commands/chat-slash-mutations.ts`
- Search-to-inspect tranche landed:
  - added `detail_panel` UI event + emitter
  - added `src/ui/components/DetailPanel.tsx`
  - search flows now open detail panels instead of reducing results to one-line notifications:
    - `/thread search`
    - `/notes search`
    - `/prompts find`
    - `/postmortem search`
- Shareable artifact tranche landed:
  - top-level saved-session markdown/share actions:
    - `armature session markdown`
    - `armature session share`
  - REPL thread markdown/share actions:
    - `/thread markdown`
    - `/thread share`
  - human-readable markdown artifact helpers added in:
    - `src/session-store.ts`
    - `src/memory/threads.ts`
- Collaboration-bundle hardening landed:
  - session share now emits a Markdown artifact plus `.artifact.json` metadata sidecar
  - session handoff now emits a dedicated handoff artifact bundle with provenance (`sourceSessionName`, `name`)
  - thread share now emits a Markdown artifact plus `.artifact.json` metadata sidecar
  - thread handoff now emits a dedicated handoff bundle with provenance (`sourceThreadId`, `threadId`)
- Wave 2 approval/trust tranche started:
  - added config helpers for reading/writing persisted permission mode
  - added top-level `armature permissions`
  - added `/permissions` for live REPL mode control and persistence
  - startup permission mode now maps from persisted config instead of only `--safe`
  - `plan` mode now requires approval for every tool call; `auto` stays dangerous-tools-only; `yolo` stays bypass
  - status/footer now surface the permission source so the operator can see whether the current mode came from session, project, global, env, flag, or default
  - Ink `/permissions` now opens a detail panel plus picker instead of only printing text
  - permission prompts now offer `allow once`, `allow session`, `allow project`, and `deny`
  - added regression coverage for session/project permission allowlist carry-forward
  - added inspectable `permissions rules` surfaces for session/project/global approvals
  - added `permissions revoke` / `permissions clear` flows so rules can be removed without editing config by hand
  - upgraded revoke so omitted rule keys fall back to filter-and-pick selection instead of hard failure
  - switched permission persistence from preview-text keys to stable canonical descriptors (`path=...`, `command=...`)
  - added `permissions normalize` for legacy rule cleanup
  - runtime permission checks now merge project + global stored allowlists
  - tightened canonical detection so legacy previews containing `=` are not misclassified as canonical
  - `permissions rules` now annotates canonical / legacy / unrecognized state
  - normalize now also converts legacy `::` rules into canonical descriptors
  - `permissions rules` now supports state-based filtering for audit workflows
  - Wave 3 started with explicit top-level workflow presets over existing built-in modes:
    - `armature review`
    - `armature debug`
    - `armature architect`
  - kept Wave 3 intentionally narrow: preset entrypoints reuse `createChatCommand({ initialModeId })` instead of introducing a second preset framework
  - `/mode` picker now shows what each workflow profile changes, rather than only the mode label
  - top-level preset command metadata is now sourced from one workflow preset registry
  - workflow preset registry now carries structured default policy fields (`effort`, `permission mode`)
  - switching into preset-backed modes now applies default effort / permission policy instead of only changing labels
  - startup and `/mode` switching now share one helper for preset-policy application
  - status surfaces now expose the active workflow policy combination (`mode + effort + permissions`)
  - workflow preset registry now also carries `tool policy` and `output style`, surfaced via `/mode` and `/status`
  - model policy is now also surfaced via `/status` and the live status bar
  - startup policy helper now also composes the initial system prompt for preset-backed one-shot + REPL entry
  - proxy tool runtime now enforces the active mode whitelist instead of leaving restriction semantics in prompt text only
  - current effort now maps into proxy `reasoning_effort` (`max` → `xhigh`)
  - provider-returned tool calls now hard-fail unless the tool was explicitly advertised, including zero-tools requests
  - non-interactive permission prompts now fail closed instead of silently allowing
  - SDK-backed REPL turns now consume the composed session prompt plus mapped permission mode
  - stabilized env-sensitive cloudflare / aggregator tests so full-suite verification no longer depends on local `~/.armature/config.json`

## 2026-04-18 — reflect mode

- User requested porting the spirit of GitHub Copilot CLI Rubber Duck into Armature, but under a renamed, more SOTA surface.
- Naming decision captured through structured confirmation:
  - public name: `reflect`
  - scope: full surface (`armature reflect`, `/reflect`, docs/tests)
  - positioning nuance: keep the auto-trigger spirit rather than shipping a plain alias
- Public-reference research summary:
  - Copilot CLI does publicly use a named Rubber Duck / critic-style checkpoint reviewer
  - public guidance suggests automatic invocation at checkpoints and as a focused second-opinion agent
  - safe reinterpretation for Armature: renamed explicit-first flow, visible triggers, no GitHub branding clone
- Implementation landed:
  - added `src/commands/reflect-mode.ts` for shared reflect heuristics + prompt shaping
  - added `reflect` built-in mode in `src/modes/registry.ts`
  - added public command `armature reflect` through `src/commands/chat.ts` + `src/program.ts`
  - added `/reflect` discoverability in REPL help, picker, and ink UI command list
  - added conservative prompt-intent auto-triggering for clear debugging/explanation asks in normal chat
  - added regression coverage:
    - `tests/reflect-mode.test.ts`
    - `tests/program.test.ts`
    - `tests/command-contracts.test.ts`
    - `tests/chat-slash-mutations.test.ts`
    - `tests/chat-repl-turn.test.ts`

## 2026-04-16 — manifest-based SOTA gate system

- User requested reading the SOTA gap / difference docs and turning Armature's seeded evaluation assets into a real system without stopping at plan-only output.
- Relevant canonical sources read before implementation:
  - `AGENT_EVAL_PLAN.md`
  - `doc/00_project/initiative_armature/PRD.md`
  - `doc/00_project/initiative_armature/USER_EXPERIENCE_MAP.md`
  - `doc/00_project/initiative_armature/SYSTEM_ARCHITECTURE.md`
  - `doc/00_project/initiative_armature/ARMATURE_SOTA_ARCHITECTURE.md`
  - `agent-eval/README.md`
  - `agent-eval/RUNBOOK.md`
- Concrete gap found:
  - Armature had a seeded `12`-task fast-gate pack and a single-purpose runner, but no canonical manifest layer, no nightly/release execution surface, and no release artifact that recorded a representative CLI journey.
- System landed:
  - added `agent-eval/manifests/fast.json`
  - added `agent-eval/manifests/nightly.json`
  - added `agent-eval/manifests/release.json`
  - added shared runner `agent-eval/scripts/run-gate.py`
  - kept `agent-eval/scripts/run-fast-gate.py` as a compatibility wrapper onto the shared runner
  - added release CLI artifact recorder `agent-eval/scripts/release-cli-journey.sh`
  - added gate tasks:
    - `gate-lint`
    - `gate-test`
    - `gate-build`
    - `gate-bench`
    - `gate-cli-journey`
  - added extra local black-box tasks:
    - `fast-session-delete`
    - `fast-serve-chat-errors`
  - added `tests/agent-eval-manifests.test.ts` so manifest/task/grader drift fails in the deterministic suite
  - added `package.json` scripts:
    - `npm run eval:fast`
    - `npm run eval:nightly`
    - `npm run eval:release`
- First validation tranche:
  - `python3 -m py_compile agent-eval/scripts/run-gate.py agent-eval/scripts/run-fast-gate.py` passed
  - `vitest tests/agent-eval-manifests.test.ts` passed
  - first fast run failed only because the missing-prompt regex grader was too literal
  - grader relaxed to `missing-body=.*Missing.*prompt.*field`
  - rerun passed:
    - run id: `20260415-170300`
    - manifest: `fast`
    - result: `14/14` passed
- full verification follow-up:
  - `npm run lint` passed
  - `npm test` passed (`1280/1280`)
  - `npm run build` passed
  - `npm run bench` passed (`10/10`, `100%`)
  - `npm run eval:nightly`
    - run id: `20260415-170928-285763`
    - result: `17/17` passed
  - `npm run eval:release`
    - run id: `20260415-170955-202845`
    - result: `19/19` passed
- concurrency hardening follow-up:
  - running nightly + release concurrently exposed two runner issues:
    - second-level run ids could collide
    - concurrent gates could cause false negatives in `gate-test`
  - fix landed in `agent-eval/scripts/run-gate.py`:
    - run ids now include microseconds
    - `.gate.lock` prevents simultaneous gate execution in the same repo
- root `--continue` follow-up:
  - added `fast-root-continue.json` and included it in `fast` / `nightly` / `release`
  - first attempt exposed shell quoting debt in the task command; replaced the shell pipeline with an inline Python runner
  - also verified `.gate.lock` by triggering a concurrent run and observing a hard refusal instead of silent interference
  - latest reruns:
    - `npm run eval:fast`
      - run id: `20260416-001810-863933`
      - result: `15/15` passed
    - `npm run eval:release`
      - run id: `20260416-001824-129010`
      - result: `20/20` passed
- next black-box tranche:
  - added `fast-pr-fetch-failure.json`
  - added `fast-providers-test-refused.json`
  - added `gate-install-tarball.json`
  - release CLI journey now also records:
    - root `--continue`
    - PR fetch failure
    - providers transport failure
    - installed tarball help
  - latest reruns:
    - `npm run eval:fast`
      - run id: `20260416-002655-853331`
      - result: `17/17` passed
    - `npm run eval:release`
      - run id: `20260416-011648-663304`
      - result: `23/23` passed
- nightly alignment follow-up:
  - ralph context snapshot written to `.omx/context/armature-sota-gates-20260416T013842Z.md`
  - `.omx/plans/prd-armature-sota-gates.md` and `.omx/plans/test-spec-armature-sota-gates.md` created to satisfy current ralph gate expectations
  - `npm run eval:nightly`
    - run id: `20260416-013921-141221`
    - result: `20/20` passed
- attacker review follow-up:
  - attempted `security-reviewer` subagent review for the eval-system delta; the helper did not return before shutdown, so final review was completed manually on:
    - `agent-eval/scripts/run-gate.py`
    - `agent-eval/scripts/release-cli-journey.sh`
    - `agent-eval/tasks/*.json`
    - `agent-eval/manifests/*.json`
  - manual review result:
    - no critical privilege-escalation or path-escape issue found inside the new gate system
    - principal trust boundary remains repo-owned executable assets: manifests/tasks are effectively code because `run-gate.py` executes task commands via `shell=True`
    - tarball-install smoke is acceptable for trusted branches because it installs the repo’s own packed artifact into a temp prefix, but it should not be run against unreviewed third-party code
- goal-loop black-box follow-up:
  - accepted the test-engineer subagent recommendation to add a local `run --done-when` success path instead of expanding more static help coverage
  - landed `fast-run-goal-loop-local-success.json` plus helper script `agent-eval/scripts/run-run-goal-loop-local-success.sh`
  - the first two implementations failed due shell/heredoc brittleness; converged on a repo-owned helper script and stable CLI-only assertions
  - latest reruns:
    - `npm run eval:fast`
      - run id: `20260416-015801-186345`
      - result: `19/19` passed
    - `npm run eval:nightly`
      - run id: `20260416-015823-743470`
      - result: `22/22` passed
    - `npm run eval:release`
      - run id: `20260416-015823-744159`
      - result: `25/25` passed
- serve happy-path follow-up:
  - added `fast-serve-chat-stream-local-success.json` plus helper script `agent-eval/scripts/run-serve-chat-stream-local-success.sh`
  - first attempt failed because `openai-compat` fell back to macOS system proxy and turned localhost provider traffic into `Connection error.`
  - fixed by injecting a local `scutil` shim into the helper script PATH so the test runs in deterministic no-proxy mode
  - latest reruns:
    - `npm run eval:fast`
      - run id: `20260416-021921-676771`
      - result: `20/20` passed
    - `npm run eval:nightly`
      - run id: `20260416-021947-546367`
      - result: `23/23` passed
    - `npm run eval:release`
      - run id: `20260416-022023-268366`
      - result: `26/26` passed
- serve non-stream happy-path follow-up:
  - added `fast-serve-chat-json-local-success.json` plus helper script `agent-eval/scripts/run-serve-chat-json-local-success.sh`
  - a test-engineer subagent suggested a non-stream task but assumed a response shape `{ ok, usage }`; actual `serve.ts` contract is `{ text, model, inputTokens, outputTokens }`, so the landed task follows the real contract
  - latest reruns:
    - `npm run eval:fast`
      - run id: `20260416-022442-985932`
      - result: `21/21` passed
    - `npm run eval:nightly`
      - run id: `20260416-022502-233065`
      - result: `24/24` passed
    - `npm run eval:release`
      - run id: `20260416-022543-363128`
      - result: `27/27` passed
- providers timeout follow-up:
  - added `fast-providers-test-timeout.json` plus helper script `agent-eval/scripts/run-providers-test-timeout.sh`
  - local contract anchored to the real CLI wording from manual reproduction:
    - `FAIL`
    - `The operation was aborted due to timeout`
  - latest reruns:
    - `npm run eval:fast`
      - run id: `20260416-024521-132881`
      - result: `22/22` passed
    - `npm run eval:nightly`
      - run id: `20260416-024557-825871`
      - result: `25/25` passed
    - `npm run eval:release`
      - run id: `20260416-024639-810942`
      - result: `28/28` passed
- release-journey refresh follow-up:
  - expanded `agent-eval/scripts/release-cli-journey.sh` to include:
    - providers timeout
    - run goal-loop success
    - serve chat stream success
    - serve chat json success
  - reran release to refresh the human-readable artifact without changing gate shape
    - `npm run eval:release`
      - run id: `20260416-024906-955054`
      - result: `28/28` passed
- release hardening follow-up:
  - `gate-cli-journey` initially failed because complex multi-line shell fragments were embedded as literal `\\n` strings inside `bash -lc`
  - fixed by pre-building PR/provider fixtures in `release-cli-journey.sh` and capturing only simple execution commands
  - `gate-test` also showed load-sensitive flake on a handful of slow integration tests, so those tests/hooks now declare explicit higher timeouts instead of relying on Vitest defaults
- post-refresh gate growth follow-up:
  - added `fast-pr-gh-missing.json`
  - added `fast-serve-chat-stream-local-success.json`
  - added `fast-serve-chat-json-local-success.json`
  - latest reruns:
    - `npm run eval:fast`
      - run id: `20260416-025122-895826`
      - result: `23/23` passed
    - `npm run eval:nightly`
      - run id: `20260416-025203-735063`
      - result: `26/26` passed
    - `npm run eval:release`
      - run id: `20260416-025253-525020`
      - result: `29/29` passed

## 2026-04-14 — large-scale test expansion planning

- User requested a new large-scale testing plan for `/Users/mauricewen/Projects/armature-cli`, with breadth and depth expansion beyond the old "~1300-case" framing and with PDCA as the canonical planning surface.
- Measured planning-start baseline:
  - `npm test` => `1263/1263`
  - this superseded the last explicitly logged maintainability checkpoint of `1260/1260`; the planning tranche measured current repository state before any new quality-program tests were added
  - `66` passing test files in the latest full run at planning start
  - regex sizing pass found roughly `1231` explicit `it(`/`test(` blocks and `294` `describe(`/`suite(` declarations; useful as sizing hints, not as the canonical total
- Historical drift:
  - `doc/SOTA_TEST_PLAN.md` still captures much earlier `262` / `447` era snapshots and should remain a historical reference only
  - current canonical baseline should live in PDCA docs plus `AGENT_EVAL_PLAN.md`
- Evaluation-plan bootstrap:
  - generated repo-root `AGENT_EVAL_PLAN.md` with `ai agent-eval /Users/mauricewen/Projects/armature-cli plan --owner "Maurice"`
  - the work no longer sits in `plan-only` mode; `agent-eval/` is scaffolded and the first breadth tranche is now landed
- Planning decision:
  - initial pass proposed a moderate deterministic target band, but the follow-up test-engineer audit showed the command-surface gap is larger than that first cut suggested
  - refined gate targets now use:
    - fast: `550-650` selected deterministic cases + `12` eval tasks
    - nightly: `~1700` deterministic cases + `36` eval tasks
    - release: `~2210` deterministic cases + `72` eval tasks
  - keep `10-12` reusable graders
  - split execution into fast / nightly / release gates instead of growing a single undifferentiated suite
- Test-engineer audit highlights:
  - strongest current areas: agent/runtime/planner safety, chat/REPL/UI, provider/tools/hooks/config
  - thinnest current area: public command contracts
  - priority command gaps: `pr`, `session`, `serve`, `run`, `providers test`, root entry / `--continue`, packaging/bin
  - wording correction applied after critique:
    - `serve` already has metadata smoke coverage and should not be treated as zero-coverage
    - `session` is exercised indirectly today, but still lacks a dedicated command lifecycle suite
- agent-eval initialization follow-up:
  - ran `ai agent-eval /Users/mauricewen/Projects/armature-cli init --owner "Maurice"`
  - replaced the generic sample files with the first Armature-specific fast-gate pack:
    - `fast-root-help`
    - `fast-session-help`
    - `fast-pr-help`
    - `fast-providers-help`
    - `fast-doctor-json`
    - `fast-serve-health`
  - added `agent-eval/graders/fast-gate.graders.json`
  - first run failed `fast-serve-health`
    - root cause: the original task command backgrounded the full `&&` chain, so shell variables such as `TMP_HOME` and `PORT` were created in a background subshell and disappeared before `curl`
    - fix: keep variable setup in the foreground shell and background only the `armature serve` process
  - reran `ai agent-eval /Users/mauricewen/Projects/armature-cli run`
    - run id: `20260415-011603`
    - result: `6/6` passed
    - seeded pack is now executable, not just scaffolded
  - added `tests/command-contracts.test.ts`
    - covers root command presence + root flags (`--safe`, `--effort`, `--continue`)
    - covers `session` lifecycle subcommands, `pr` argument + routing flags, `providers test`, and `serve` transport flags
  - reran full verification after the first breadth tranche:
    - `npm test` => `1268/1268`
    - `67` passing test files in the latest full run
  - added `tests/session-command.test.ts`
    - uncovered and fixed a concrete command bug: the default `session` action recursively called `parseAsync()` and could overflow the stack
    - centralized session storage/recovery in `src/session-store.ts`
    - `session`, `/continue`, `/save`, `/load`, auto-save, and `/sessions` now share the same `ARMATURE_HOME`-aware session directory behavior
    - latest-session resume now skips corrupted newest files instead of failing closed
  - extended `tests/serve-command.test.ts`
    - added malformed `/chat` JSON and missing-prompt request coverage
  - added `tests/packaging-smoke.test.ts`
    - `npm run build` emits `dist/bin/armature.js` and `dist/index.js`
    - `npm pack --json --dry-run` includes the shipped dist entrypoints
    - built-bin `--help` and `doctor --json` work with an isolated runtime home
  - reran full release-style verification after depth + packaging tranches:
    - targeted tranche run: `9/9`
    - `npm test` => `1276/1276`
    - `69` passing test files in the latest full run
    - `npm run build` passed
    - `npm run bench` passed (`10/10`, `100%`)
    - `ai agent-eval /Users/mauricewen/Projects/armature-cli run`
      - run id: `20260415-012934`
      - result: `6/6` passed
  - expanded the fast-gate eval pack to the planned `12`-task baseline:
    - added `fast-run-help`
    - added `fast-session-list`
    - added `fast-session-show`
    - added `fast-providers-test-local`
    - added `fast-serve-metadata`
    - added `fast-pack-dry-run`
  - reran the expanded fast gate and wrote standard run artifacts:
    - run id: `20260415-014815`
    - result: `12/12` passed
    - fast gate now covers root/run help, session list/show smoke, providers connectivity smoke, serve metadata endpoints, and packaging manifest smoke
  - critique hardening follow-up:
    - added `agent-eval/scripts/prepare-fast-gate.sh` so fast-gate tasks rebuild when `src/` or build config is newer than `dist/`
    - added `agent-eval/scripts/wait-for-http.sh` and replaced fixed sleeps with bounded readiness polling
    - added `agent-eval/scripts/run-fast-gate.py` as a repo-local runner that writes relative-path run artifacts without assuming external `ai` CLI availability
    - removed hard-coded repo paths from fast-gate task commands and isolated provider/serve/doctor scenarios under clean envs
    - reran the hardened pack:
      - run id: `20260415-020102`
      - result: `12/12` passed

## 2026-04-12

- User provided explicit `PROJECT_DIR`: `/Users/mauricewen/Projects/MARUCIE-armature-cli`
- Project root initially lacked repo-level `AGENTS.md` / `CLAUDE.md` / mirror files
- Existing docs were flat under `doc/` and did not include the required `doc/00_project/initiative_armature/` tree
- `.omx/tmux-hook.json` existed as untracked runtime state; `.gitignore` was updated to ignore `.omx/`
- Command surface was verified from `src/program.ts`, not inferred solely from README
- Verification completed:
  - `npm run lint` passed
  - `npm test` passed (`326/326`)
- Test suite emitted one `fatal: not a git repository` message in subprocess output while still passing; no bootstrap code path depends on that warning
- Follow-up after review:
  - Regenerated 7 planning/architecture HTML companions from canonical Markdown sources
  - Added heading anchors so the generated TOC links are valid
  - Replaced duplicated `CODEX.md` / `GEMINI.md` content with thin references to `CLAUDE.md`
- Root-cause follow-up:
  - Reproduced the stray `fatal: not a git repository` output with `tests/adversarial.test.ts`
  - Root cause: `executeGitCommit()` used `execSync()` without explicit piped stdio, so git stderr escaped during non-repo failure paths
  - Fix: pipe child stdio in `src/tools.ts` and add regression coverage in `tests/protocol.test.ts`
- Additional verification completed:
  - `npm run build` passed
  - `npm run bench` passed (`10/10`, `100%`)
  - `node dist/bin/armature.js --help` rendered expected command help
  - Full `npm test` rerun passed (`327/327`) with the stray git warning removed
  - Targeted regression run passed: `tests/adversarial.test.ts` + `tests/protocol.test.ts` (`34/34`)
- New feature branch note:
  - User requested Hermes-agent capability internalization into Armature CLI, with SDK updates only if the boundary requires it
  - Hermes local fact source: `00-AI-Fleet/state/services/hermes-agent/src/hermes-agent/RELEASE_v0.8.0.md`
  - Initial capability bundle selected for Armature: tool arg coercion, oversized tool result persistence, background completion notifications
  - Current SDK conclusion: `MARUCIE-open-agent-sdk` is the canonical SDK repo, but this first capability bundle is likely Armature-local unless a reusable runtime seam emerges during implementation
- Implementation outcome:
  - Added `src/background-jobs.ts` for detached job tracking and REPL completion notifications
  - `src/tools.ts` now coerces model-sent stringified tool arguments to schema-compatible runtime values
  - Oversized tool outputs now persist to `~/.armature/tool-results/` (or `$ARMATURE_HOME/tool-results/`) and return an artifact path instead of destructive truncation
  - REPL gained `/jobs` for tracked background work visibility
- SDK boundary decision:
  - No SDK code change in `MARUCIE-open-agent-sdk`
  - Reason: this capability bundle is currently Armature-local shell/runtime ergonomics, not a shared provider-neutral agent-loop seam yet
- Follow-up capability slice:
  - Added `src/model-catalog.ts` to centralize known model/provider metadata
  - `/model` and `/models` now surface provider, context window, approximate pricing, and caution metadata
  - Hard-coded Poe-only picker behavior was removed from REPL flows
- Provider/output follow-up:
  - `armature providers` now reuses the same catalog metadata and prints context/pricing/caution lines
  - One-shot `armature chat "..."` startup now emits the same model caution used by the REPL when applicable
- Logging follow-up:
  - Added `src/logger.ts` for local `agent.log` / `errors.log`
  - Added `armature logs` via `src/commands/logs.ts`
  - Routed core warning/error paths plus selected chat/provider runtime events into the local logger
- Doctor follow-up:
  - Added `src/doctor.ts` plus top-level `armature doctor`
  - Doctor now reports provider/config/hook/MCP/session/background-job/log status in one place
  - Doctor also surfaces malformed local JSON config files explicitly via `configDiagnostics`
  - No SDK change required; diagnostics remain Armature-local runtime tooling
- Serve follow-up:
  - `armature serve` now exposes richer `/health`, `/providers`, and `/doctor` surfaces
  - Headless server responses reuse the same model catalog and doctor diagnostics used by CLI commands
- Stats follow-up:
  - `armature stats` now includes runtime health and recent error summaries
  - The stats surface now composes usage-db + doctor + logger instead of showing cost-only data
- Branding follow-up:
  - Canonical docs and governance files now consistently use `Armature/armature/.armature`
  - Real filesystem `PROJECT_DIR` references remain `/Users/mauricewen/Projects/MARUCIE-armature-cli` until the repo directory itself is renamed
- Verification completed:
  - `npm run lint` passed
  - `npm test` passed (`426/426`)
  - `npm run build` passed
  - `npm run bench` passed (`10/10`, `100%`)
  - `node dist/bin/armature.js --help` rendered expected command help
  - `tests/hermes-runtime.test.ts` passed (`3/3`)
  - `tests/model-catalog.test.ts` passed (`4/4`)
  - `tests/model-catalog.test.ts` + `tests/providers-command.test.ts` passed (`5/5`)
  - `node dist/bin/armature.js providers` rendered provider metadata as expected
  - `tests/logger.test.ts` + `tests/logs-command.test.ts` + `tests/program.test.ts` passed (`12/12`)
  - `node dist/bin/armature.js logs` rendered the expected empty-log state
  - `tests/doctor-command.test.ts` passed (`1/1`)
  - `node dist/bin/armature.js doctor --json` returned structured diagnostics
  - malformed-config smoke for `armature doctor` now reports config issues without the old bare stderr warning prefix
  - `tests/serve-command.test.ts` passed (`1/1`)
  - `tests/stats-command.test.ts` passed (`1/1`)
- Boundary reminder:
  - Hermes-inspired runtime, model-catalog, logs, and doctor slices all remain Armature-local
  - `MARUCIE-open-agent-sdk` still intentionally unchanged because no provider-neutral seam has been proven yet

## 2026-04-14

- REPL UX regression follow-up:
  - root cause for "many slash commands invalid" was not missing handlers; the ink `CommandPicker` stayed active even after the user started typing arguments
  - because `InputArea` defers Enter while the picker is active, commands like `/council <prompt>` could lose their arguments and behave like a bare command invocation
  - fix landed in `src/ui/utils.ts` so picker visibility is limited to the command token itself; argument-entry whitespace now hands Enter back to normal submission
- Theme onboarding follow-up:
  - startup still showed `ThemePicker` even though `/Users/mauricewen/.armature/theme` already existed and contained `default`
  - root cause: `App.tsx` gated onboarding only on `ARMATURE_THEME`, and `src/ui/theme.tsx` still used CommonJS `require('fs')` inside an ESM runtime, so persisted file reads silently failed
  - fix landed in `src/ui/theme.tsx` + `src/ui/components/App.tsx` so onboarding respects both env and persisted theme file with ESM-safe file access
- Verification follow-up:
  - targeted suite passed: `tests/ui-utils.test.ts`, `tests/ink-ui.test.tsx`, `tests/chat-slash-readonly.test.ts`, `tests/chat-slash-mutations.test.ts` (`67/67`)
  - repo-wide verification passed again: `npm run lint`, `npm test`, `npm run build`
- Review-follow-up fixes:
  - the command picker visibility rule now matches slash-command dispatch case-insensitively, so `/H` and `/Help` still surface picker guidance instead of hiding it unexpectedly
  - `ThemeProvider` is now stateful, so selecting a theme in `ThemePicker` applies immediately in the current session instead of only persisting for the next launch
  - the installed global Armature package was refreshed again after these review fixes
- ink UI CC-parity deep source comparison (3-round swarm audit)
- Round 1: Rendering pipeline (AlternateScreen, FullscreenLayout, ScrollBox, Resize)
- Round 2: Input system (Cursor class, paste handler, focus model, submit flow)
- Round 3: Visual UX (theme depth, spinner, tool call states, keyboard hints)
- P0 implementations completed:
  1. **useTerminalSize** — reactive terminal dimensions via SIGWINCH + stdout.resize
     - TerminalSizeProvider at render root, useTerminalSize() hook
     - All 6 components migrated from static useStdout() to reactive context
     - Files: `src/ui/useTerminalSize.tsx`, updated AlternateScreen/App/StatusBar/Banner/Footer/InputArea/render.tsx
  2. **ScrollBox** — scrollable content area with stickyScroll
     - Negative marginTop trick for ink/Yoga scroll simulation
     - stickyScroll auto-follows bottom, keyboard nav (PageUp/PageDown, g/G)
     - Imperative API: scrollTo/scrollBy/scrollToBottom/isSticky/getScrollTop
     - measureElement for content height tracking
     - Files: `src/ui/components/ScrollBox.tsx`, integrated into App.tsx
  3. **usePasteHandler** — bracketed paste mode detection
     - Enables \x1b[?2004h on mount, detects \x1b[200~ / \x1b[201~ brackets
     - During paste, Enter becomes literal newline (prevents accidental submit)
     - onPaste callback for content insertion
     - Files: `src/ui/usePasteHandler.ts`, integrated into InputArea.tsx
- Armature advantages over CC identified (6 items): SIGCONT resume, dual-line StatusBar, Sparkline, context-aware Footer, DiffPreview, OSC 8 FileLink
- Test count: 1173 (up from 1168)
- Review report v3 generated: `outputs/reports/code-quality-swarm/2026-04-14-ink-cc-parity-review-v3.html`
- P1 implementations completed:
  4. **Cursor model** — pure-function text editing with word-boundary ops
     - prevWord/nextWord (Option+Left/Right), deleteWordBefore (Ctrl+W)
     - deleteToLineEnd (Ctrl+K), deleteToLineStart (Ctrl+U upgrade), yank (Ctrl+Y)
     - kill ring buffer for cut/paste workflow
     - 28 unit tests in tests/cursor.test.ts
     - Files: `src/ui/cursor.ts`, InputArea.tsx rewritten to use Cursor module
  5. **Theme expansion** — 25 semantic color tokens + dark/light mode
     - Role-based tokens: accent/success/error/warning/tool/model/filePath/diffAdd/diffRemove/ctxGreen/ctxYellow/ctxRed...
     - Auto dark/light detection via COLORFGBG env var
     - 6 themes: default/light/dark/ocean/warm/mono
     - Components migrated: ToolCallBlock, StatusBar, App (system messages), InputArea
  6. **Mouse wheel scrolling** — SGR mouse protocol integration
     - useMouseWheel hook: enables \x1b[?1000h\x1b[?1006h, parses SGR events
     - Wheel up/down → ScrollBox.scrollBy(+/-3 rows)
     - Clean teardown on unmount
     - File: `src/ui/useMouseWheel.ts`, wired in App.tsx
  7. **Focus fine-grained control** — showCursor prop + theme-aware borders
     - Independent showCursor prop (cursor visible even when input blocked)
     - Border color from theme.border/theme.borderDim
     - Placeholder/dim text from theme tokens
- Test count: 1203 (up from 1173)
- P2 implementations completed:
  8. **Spinner upgrade** — 204 verbs (CC-parity), stalledIntensity 颜色渐变（accent→warning→error）
     - prefers-reduced-motion 检测（REDUCE_MOTION / NO_MOTION env）
     - 三段式着色：<10s accent, 10-30s warning, >30s error
  9. **Tool call graduated error** — 6 种错误类型定制渲染
     - rejected/permission/timeout/not_found/validation/generic
     - 每种类型独立 icon + label + 颜色（rejected 用 warning, 其余用 error）
     - errorType 字段添加到 ToolEndInfo 接口
  10. **Meta+Enter / Shift+Enter 换行** — CC 兼容多键换行
     - Ctrl+J / Ctrl+Enter / Meta+Enter / Shift+Enter 全部支持
     - 修复了键序：新行检测在 submit 之前，避免 Shift+Enter 误提交
- Final test count: 1203
- Final parity: 15/17 差距修复（88%），CC parity 65/80（81%）

## 2026-04-14 12:02 CST

- Re-audit result: report v3 is directionally useful but no longer matches repo state one-to-one.
- Observed drift:
  - `task_plan.md` / `notes.md` describe the CC-parity branch as effectively complete, but source still retains several behavior-accuracy gaps.
  - `SYSTEM_ARCHITECTURE.md` and `USER_EXPERIENCE_MAP.md` still point to `/Users/mauricewen/Projects/MARUCIE-armature-cli`, while the real git root is `/Users/mauricewen/Projects/armature-cli`.
- Ranked remaining code gaps after source comparison:
  1. `src/ui/components/ScrollBox.tsx`: `viewportHeight = height ?? rows` uses full terminal rows instead of the rendered viewport height inside the flex layout.
     - Evidence for: App mounts `ScrollBox` above a fixed bottom section; measured visible region is smaller than terminal rows.
     - Impact: moderate/high for long conversations near the overflow threshold; scroll can under-clamp or fail to activate soon enough.
  2. `src/ui/components/AlternateScreen.tsx`: alt-screen enter is still in `useEffect`, while CC uses insertion-phase write to beat the first frame.
     - Evidence for: source directly imports `useEffect`; report already flagged this as the one remaining render-phase gap.
     - Impact: low/medium; mostly visible as a potential first-frame echo/flicker window.
  3. `src/ui/cursor.ts`: word-boundary regex still relies on ASCII `\\w`.
     - Evidence for: `isWordChar()` is `/[\\w]/`; CC reference uses Unicode-aware word semantics.
     - Impact: medium for Chinese / non-ASCII editing because Option+Arrow / Ctrl+W semantics degrade.
- Down-ranked / not selected this round:
  - Full CC `ScrollBox.scrollToElement()` + virtualization stack: valuable, but much broader than the currently observable bug.
  - Full CC image-paste pipeline: still absent, but materially larger and not required for the current text-first parity gap.

## 2026-04-14 12:10 CST

- Implemented behavior-accuracy fixes:
  - `src/ui/components/ScrollBox.tsx`
    - Added viewport self-measurement via outer box ref + `measureElement()`
    - `maxScroll` now uses actual rendered viewport height in flex layouts, not terminal rows
    - Exposed `getScrollHeight()` / `getViewportHeight()` on the imperative handle for regression checks
  - `src/ui/components/AlternateScreen.tsx`
    - Switched alt-screen enter/exit to pre-paint hook alias (`useInsertionEffect` with layout fallback)
    - Added `flexShrink={0}` to keep viewport clamped to terminal rows
  - `src/ui/cursor.ts`
    - Replaced ASCII `\\w` word detection with Unicode-aware `[\p{L}\p{N}\p{M}_]`
  - `src/ui/useTerminalSize.tsx`
    - Reworked `SIGWINCH` fallback into a shared module-level subscription to avoid `MaxListenersExceededWarning`
- Regression coverage added:
  - `tests/ink-ui.test.tsx`
    - new flex-layout `ScrollBox` viewport regression
  - `tests/cursor.test.ts`
    - new Unicode word-boundary movement/deletion regression
- Docs corrected:
  - `SYSTEM_ARCHITECTURE.md` / `USER_EXPERIENCE_MAP.md` now point to `/Users/mauricewen/Projects/armature-cli`
  - Rolling ledger records the `PROJECT_DIR` correction explicitly
- Verification completed:
  - `npm run lint` passed
  - targeted UI regression run passed (`83/83`)
  - full `npm test` passed (`1206/1206`)
  - `npm run build` passed
  - `npm run bench` intentionally skipped because no benchmark/provider-selection logic changed

## 2026-04-14 12:36 CST

- Follow-up gap selection:
  - Did not continue deeper into CC's unused `ScrollBox.scrollToElement()` / virtualization API because Armature currently has no real call sites for it.
  - Chose the next higher-value real gap instead: file-path normalization between ink input and the existing preprocessing pipeline.
- Implemented prompt/file expansion hardening in `src/commands/chat.ts`:
  - added shared path normalization for:
    - quoted paths
    - shell-escaped spaces (`\\ `)
    - `file:///...%20...` URLs
  - bare-path detection now accepts standalone quoted / escaped-space paths
  - embedded expansion now also injects:
    - quoted file paths
    - shell-escaped absolute/home/relative paths
    - percent-encoded file URLs
- Why this matters:
  - Armature already had preprocess support for images/PDF/HTML/etc.
  - The real missing link was that drag-pasted file paths with spaces were often not recognized, so the preprocess path never ran.
  - This closes a practical parity gap without inventing a new attachment protocol.
- Regression coverage added:
  - `tests/chat-file-expansion.test.ts`
    - shell-escaped spaces
    - quoted paths
    - percent-encoded file URLs
    - embedded path expansion into `<file>` tags
- Verification completed:
  - `npm run lint` passed
  - `vitest run tests/chat-file-expansion.test.ts tests/file-expansion.test.ts` passed (`70/70`)
  - full `npm test` passed (`1212/1212`)
  - `npm run build` passed

## 2026-04-14 12:41 CST

- Directory-path follow-up:
  - `tryExpandDirectory()` now accepts:
    - quoted directory paths with spaces
    - shell-escaped directory paths with spaces
    - both leading and trailing mixed-prompt forms
- This closes the remaining gap where project bootstrap only worked reliably for no-space directory paths.
- Regression coverage added in `tests/chat-file-expansion.test.ts`:
  - quoted directory path with spaces
  - shell-escaped directory path with spaces
- Verification completed:
  - `npm run lint` passed
  - `vitest run tests/chat-file-expansion.test.ts` passed (`8/8`)
  - full `npm test` passed (`1214/1214`)
  - `npm run build` passed
- Current architectural boundary:
  - true clipboard-image / multimodal chat support is not just an input problem
  - `src/providers/openai-compat.ts` still models `ChatMessage` as `content: string`
  - finishing that lane requires provider/message-schema changes, not another regex pass

## 2026-04-14 12:48 CST

- Repo-wide code review follow-up identified a high-risk class of issues:
  - shell-string interpolation around file paths / git args in:
    - `src/preprocess/convert.ts`
    - `src/agent/worktree.ts`
    - `src/tools.ts` (`git_commit`)
    - `src/commands/chat.ts` project-tree generation
- Fixes implemented:
  - switched path-bearing converter calls to `execFileSync(..., args[])`
  - switched worktree create/merge/cleanup to `execFileSync`
  - switched `git_commit` staging/commit path to `execFileSync`
  - switched `project-expand` tree generation from shell `find ... | head` to `execFileSync('find', args)` + JS truncation
- Why this matters:
  - Armature is explicitly positioned as a coding agent CLI; path/branch/commit strings are often user-controlled or model-controlled
  - keeping them inside shell-built command strings is below the security bar for a SOTA-grade agent runtime
- Regression coverage added:
  - `tests/adversarial.test.ts`
    - `git_commit` with weird quoted filename now succeeds as a real git commit
  - `tests/chat-file-expansion.test.ts`
    - project directory with single quote in the name still expands safely
- Verification completed:
  - `npm run lint` passed
  - `vitest run tests/adversarial.test.ts tests/preprocess.test.ts tests/phase1-agent.test.ts` passed (`134/134`)
  - full `npm test` passed (`1216/1216`)
  - `npm run build` passed
- Remaining large review findings after this fix batch:
  - `src/providers/openai-compat.ts` still exposes only string-only `ChatMessage`, which blocks true multimodal message transport
  - `src/commands/chat.ts` still concentrates very large control flow (`runREPL`, `handleSlashCommand`, `runProxyTurn`) and is now the main maintainability hotspot

## 2026-04-14 13:40 CST

- IDE integration follow-up:
  - Added a zero-dependency VS Code extension skeleton under `integrations/vscode-armature/`
  - Commands currently included:
    - open chat
    - analyze current file
    - review selection
    - start MCP server
    - run doctor
- Design choice:
  - launch `armature` directly as terminal `shellPath`/`shellArgs`
  - avoid shell-string command composition inside the extension as well
  - keep the first slice dependency-free so the repo does not need a new extension toolchain yet
- Verification completed:
  - `npm run lint` passed
  - `vitest run tests/vscode-extension.test.ts` passed (`3/3`)
  - full `npm test` passed (`1219/1219`)
  - `npm run build` passed
- Updated product docs:
  - `README.md` now advertises the extension skeleton
  - architecture and UX docs now include the VS Code surface

## 2026-04-14 15:17 CST

- Multimodal protocol follow-up:
  - `src/providers/openai-compat.ts`
    - added `PromptContent` support for one-shot / streaming prompt payloads
    - added `messageContentToText()` to flatten multimodal content into text for logging/budgeting paths
  - `src/commands/chat.ts`
    - added `--image <paths...>` for one-shot chat
    - added `buildImagePromptContent()` to resolve local images → data URLs
    - proxy path accepts multimodal content; SDK path explicitly rejects it for now
- Why this matters:
  - Armature no longer treats multimodal support as a documentation-only future item
  - There is now a real, user-facing one-shot image path without pretending the interactive/session/history stack is fully multimodal
- Regression coverage added:
  - `tests/openai-compat-multimodal.test.ts`
  - `tests/chat-image-option.test.ts`
- Verification completed:
  - `npm run lint` passed
  - targeted multimodal suite passed (`36/36`)
  - full `npm test` passed (`1226/1226`)
  - `npm run build` passed
- Current boundary after this slice:
  - interactive ink REPL still does not accept clipboard image paste
  - session save/load and compaction remain string-history oriented
  - multimodal is currently available through one-shot proxy chat, not the whole runtime

## 2026-04-14 15:30 CST

- Multimodal compatibility follow-up:
  - `ChatMessage` now accepts `PromptContent`, not just `string`
  - `TokenBudgetManager` now estimates and compacts via `messageContentToText(...)`
  - session display uses flattened text rendering instead of assuming `.slice()` on raw content
  - chat resume/status/system/thread-save paths now flatten where human-readable text is required
- Why this matters:
  - one-shot multimodal support is no longer an isolated branch in provider code
  - the surrounding runtime now tolerates multimodal history objects without immediately breaking budget/session/display paths
- Verification completed:
  - `npm run lint` passed
  - targeted multimodal+budget suite passed (`78/78`)
  - full `npm test` passed (`1227/1227`)
  - `npm run build` passed
- Remaining architectural limit:
  - these layers are now compatible via text flattening, not rich multimodal persistence semantics
  - interactive image paste and full session-native multimodal replay remain future work

## 2026-04-14 15:53 CST

- `chat.ts` maintainability follow-up:
  - created `src/commands/chat-input.ts`
  - moved two helper concerns first:
    - safe `/git` command tokenization + allowlist validation
    - `buildImagePromptContent()` for `--image`
  - updated helper-focused tests to import from the new module directly
- Why only partial extraction:
  - the file-expansion + project-bootstrap block is larger and more entangled with current imports
  - current repo state is safer if refactored incrementally instead of attempting a single giant move under active feature work
- Verification completed:
  - `npm run lint` passed
  - `vitest run tests/chat-git-command.test.ts tests/chat-image-option.test.ts tests/openai-compat-multimodal.test.ts tests/chat-file-expansion.test.ts` passed (`16/16`)
  - full `npm test` passed (`1227/1227`)
  - `npm run build` passed
- Current maintainability status:
  - `chat.ts` is still too large
  - but helper decomposition has started with a real module boundary, not just TODO notes

## 2026-04-14 19:22 CST

- `chat.ts` extraction follow-up:
  - `src/commands/chat-input.ts` now owns:
    - safe `/git` parsing
    - image prompt construction
    - file/path expansion
    - project bootstrap / multi-model prompt preparation
  - `src/commands/chat-support.ts` now owns:
    - config-file detection
    - CLI flag shaping
    - input history persistence
    - session autosave persistence
- Why this matters:
  - `chat.ts` no longer needs to carry the entire path/bootstrap helper stack inline
  - the new module boundaries are test-backed and reduce future merge risk when continuing to split REPL/slash/proxy control flow
- Additional verification completed:
  - `vitest run tests/chat-git-command.test.ts tests/chat-image-option.test.ts tests/chat-file-expansion.test.ts tests/openai-compat-multimodal.test.ts tests/vscode-extension.test.ts` passed (`19/19`)
  - full `npm test` passed (`1238/1238`)
  - `npm run build` passed
- One unrelated brittle test was also hardened:
  - `tests/config.test.ts` now clears `GH_TOKEN` as well, so the aggregator assertion no longer depends on host environment state

## 2026-04-14 19:40 CST

- `chat.ts` readonly-slash maintainability follow-up:
  - added `src/commands/chat-slash-readonly.ts`
  - moved read-only help/status/display flows out of `handleSlashCommand()`:
    - `/help`
    - read-only `/model`
    - `/models`
    - `/history`, `/tokens`, `/stats`, `/cwd`
    - `/diff`, `/git`
    - `/sessions`, `/jobs`
    - `/cost`, `/status`, `/doctor`, `/config`, `/providers`
  - `handleSlashCommand()` now delegates that tranche and uses an explicit `SlashCommandResult` union instead of the previous `as string` dispatch pattern for async slash flows
- Why this matters:
  - this is the first real cut through the slash-command hotspot, not just another helper buried inside `chat.ts`
  - the remaining work is now more clearly separated into:
    - mutating/session slash flows
    - `runREPL()` orchestration
    - `runProxyTurn()` tool orchestration
- Regression coverage added:
  - `tests/chat-slash-readonly.test.ts`
    - ink-mode `/help`
    - ink-mode `/status`
    - `/models` picker return
    - `/model set ...` falls through to the mutating dispatcher
- Verification completed:
  - `npm run lint` passed
  - `vitest run tests/chat-slash-readonly.test.ts tests/chat-git-command.test.ts tests/chat-image-option.test.ts tests/chat-file-expansion.test.ts` passed (`18/18`)
  - full `npm test` passed (`1242/1242`)
  - `npm run build` passed
- Updated handoff target:
  - the next highest-value structural slice is now `runProxyTurn()` tool orchestration extraction, since the read-only slash tranche is no longer the top hotspot

## 2026-04-14 19:50 CST

- `chat.ts` proxy-tool maintainability follow-up:
  - added `src/commands/chat-proxy-tool-call.ts`
  - moved the `runProxyTurn()` `onToolCall` body out of `chat.ts`
  - the extracted helper now owns:
    - dangerous-tool permission gating + diff previews
    - `PreToolUse` handling
    - sub-agent / `ask_user` / MCP / `sleep` async tool routing
    - post-tool retry intelligence, error classification, loop detection, postmortem matching, auto-verify, and context guarding
- Why this matters:
  - `runProxyTurn()` now reads as stream wiring instead of a mixed transport + orchestration + recovery monolith
  - the remaining structural hotspots are clearer:
    - mutating/session slash flows
    - `runREPL()` orchestration
- Regression coverage added:
  - `tests/chat-proxy-tool-call.test.ts`
    - safe-mode permission denial
    - ink-mode `ask_user`
    - failed tool retry/classifier hints
    - successful write auto-verify append
- Verification completed:
  - `npm run lint` passed
  - `vitest run tests/chat-proxy-tool-call.test.ts tests/chat-slash-readonly.test.ts tests/chat-git-command.test.ts tests/chat-image-option.test.ts tests/chat-file-expansion.test.ts` passed (`22/22`)
  - full `npm test` passed (`1246/1246`)
  - `npm run build` passed
- Updated handoff target:
  - the next highest-value structural slice is now the remaining mutating/session slash flow extraction from `handleSlashCommand()`

## 2026-04-14 20:00 CST

- `chat.ts` mutating-slash maintainability follow-up:
  - added `src/commands/chat-slash-mutations.ts`
  - moved the remaining mutating/session slash switch out of `handleSlashCommand()`
  - the extracted helper now owns:
    - model switching, clear/compact/system/hooks
    - async slash sentinels for `/council`, `/race`, `/pipeline`, `/mission`, `/plan`
    - session persistence / continue / undo
    - `/commit`, `/review`, `/pr` fallthrough behavior
    - `/mcp`, `/thread`, `/init`, `/notes`, `/postmortem`, `/prompts`, `/learn`
- Why this matters:
  - `handleSlashCommand()` is now a thin dispatcher over readonly + mutating helpers instead of a monolithic mixed switch
  - after this cut, the dominant remaining `chat.ts` hotspot is `runREPL()` orchestration rather than slash dispatch
- Regression coverage added:
  - `tests/chat-slash-mutations.test.ts`
    - `/model set ...`
    - `/clear`
    - `/commit` fallthrough
    - `/council` async sentinel
- Verification completed:
  - `npm run lint` passed
  - `node --experimental-vm-modules node_modules/.bin/vitest run tests/chat-slash-mutations.test.ts tests/chat-proxy-tool-call.test.ts tests/chat-slash-readonly.test.ts tests/chat-git-command.test.ts tests/chat-image-option.test.ts tests/chat-file-expansion.test.ts` passed (`26/26`)
  - full `npm test` passed (`1250/1250`)
  - `npm run build` passed
- Updated handoff target:
  - the next highest-value structural slice is now `runREPL()` orchestration extraction

## 2026-04-14 20:10 CST

- `chat.ts` async-REPL-slash maintainability follow-up:
  - added `src/commands/chat-repl-async-slash.ts`
  - moved async slash follow-up execution out of `runREPL()`
  - the extracted helper now owns:
    - `/council`, `/race`, `/pipeline` multi-model execution flow
    - `/mission` controller wrapper
    - `/plan` decomposition + execution wrapper
    - both ink and legacy rendering for those async slash branches
- Why this matters:
  - `runREPL()` no longer inlines the full async slash execution subtree after `handleSlashCommand()`
  - after this cut, the remaining REPL complexity is more concentrated around prompt lifecycle, abort handling, background surfacing, and compact/cleanup flow
- Regression coverage added:
  - `tests/chat-repl-async-slash.test.ts`
    - council unavailable-endpoint warning
    - legacy pipeline execution
    - mission missing-provider error
    - plan decomposition + execution
- Verification completed:
  - `npm run lint` passed
  - `node --experimental-vm-modules node_modules/.bin/vitest run tests/chat-repl-async-slash.test.ts tests/chat-slash-mutations.test.ts tests/chat-proxy-tool-call.test.ts tests/chat-slash-readonly.test.ts tests/chat-git-command.test.ts tests/chat-image-option.test.ts tests/chat-file-expansion.test.ts` passed (`31/31`)
  - full `npm test` passed (`1254/1254`)
  - `npm run build` passed
- Updated handoff target:
  - the next highest-value structural slice is now the remaining `runREPL()` turn lifecycle

## 2026-04-14 20:22 CST

- `chat.ts` REPL-turn maintainability follow-up:
  - added `src/commands/chat-repl-turn.ts`
  - moved the normal prompt turn lifecycle out of `runREPL()`
  - the extracted helper now owns:
    - multi-task hinting
    - `UserPromptSubmit` hook gating
    - file expansion + cognitive skeleton injection
    - pre-send compaction
    - abort/progress lifecycle
    - proxy/SDK turn dispatch
    - 413 auto-recovery retry
    - post-turn compaction + session autosave
- Why this matters:
  - `runREPL()` no longer inlines the dominant normal-turn execution subtree after input/slash dispatch
  - after this cut, the remaining REPL complexity is more concentrated around background-job surfacing, prompt acquisition, shell dispatch, and inline slash special-cases
- Regression coverage added:
  - `tests/chat-repl-turn.test.ts`
    - blocked `UserPromptSubmit`
    - successful proxy-turn stats/summary update
    - 413 retry recovery
    - red/orange/yellow post-turn compaction behavior
- Verification completed:
  - `npm run lint` passed
  - `node --experimental-vm-modules node_modules/.bin/vitest run tests/chat-repl-turn.test.ts` passed (`6/6`)
  - full `npm test` passed (`1260/1260`)
  - `npm run build` passed
- Updated handoff target:
  - the next highest-value structural slice is now the remaining `runREPL()` input/discovery/dispatch front-half

## 2026-04-16 05:40 CST

- `session delete missing` follow-up:
  - added `fast-session-delete-missing.json`
  - latest reruns:
    - `npm run eval:fast`
      - run id: `20260416-053301-268531`
      - result: `26/26` passed
    - `npm run eval:nightly`
      - run id: `20260416-053354-618607`
      - result: `29/29` passed
    - `npm run eval:release`
      - run id: `20260416-053519-395123`
      - result: `32/32` passed
- Working conclusion update:
  - `session` surface now has black-box coverage for:
    - list empty
    - list valid
    - show valid
    - show missing
    - delete valid
    - delete missing

## 2026-04-17 00:55 CST

- logs + doctor + init black-box follow-up:
  - added `fast-logs-empty`, `fast-logs-errors-empty`, `fast-logs-errors`, `fast-logs-lines-limit`, `fast-logs-errors-lines-limit`, `fast-logs-unknown-kind-fallback`
  - fixed a real bug in `src/commands/logs.ts`: `--lines 0` previously fell back to `50` because `Number(opts?.lines) || 50` swallowed zero; parsing now clamps zero to `1`
  - added `fast-doctor-human-config-issue`, `fast-doctor-json-cwd`, `fast-doctor-json-project-config-issue`, `fast-doctor-human-project-config-issue`
  - added `fast-init-default`, `fast-init-global-only`, `fast-init-preserves-existing`
  - latest reruns:
    - `npm run eval:fast`
      - run id: `20260416-234730-723737`
      - result: `53/53` passed
    - `npm run eval:nightly`
      - run id: `20260416-234832-356143`
      - result: `56/56` passed
    - `npm run eval:release`
      - run id: `20260416-234927-481894`
      - result: `59/59` passed

## 2026-04-16 06:30 CST

- provider empty/baseURL follow-up:
  - added `fast-providers-empty.json`
  - added `fast-providers-test-no-baseurl.json`
  - `local` provider could not exercise the no-baseURL branch because config resolution backfilled `http://localhost:11434/v1`; switched the task to a custom `dummy` provider id so the branch became reachable
  - latest reruns:
    - `npm run eval:fast`
      - run id: `20260416-062236-077460`
      - result: `29/29` passed
    - `npm run eval:nightly`
      - run id: `20260416-062314-588580`
      - result: `32/32` passed
    - `npm run eval:release`
      - run id: `20260416-062401-087130`
      - result: `35/35` passed
- working conclusion update:
  - `providers` surface now has black-box coverage for:
    - empty list
    - help
    - no baseURL
    - reachable local endpoint
    - refused connection
    - timeout

## 2026-04-20 10:56 CST

- REPL multimodal follow-up landed:
  - embedded local image paths now resolve into multimodal prompt parts on the proxy path
  - supports multiple images in one prompt
  - supports quoted paths and shell-escaped spaces
  - text file expansion now skips the image paths that were promoted to attachments
  - proxy history now keeps the original multimodal user content instead of flattening it to `[image:...]`
- explicit non-goal for this round:
  - clipboard / direct pasted bitmap support in the ink REPL is still not implemented
- verification:
  - targeted:
    - `vitest run tests/chat-image-option.test.ts tests/chat-repl-turn.test.ts tests/chat-internals.test.ts tests/openai-compat-multimodal.test.ts tests/context-protection.test.ts`
  - full:
    - `npm run lint`
    - `npm test`
    - `npm run build`
    - `npm run bench`

## 2026-04-21 — layered test matrix

- Evidence directory:
  - `outputs/test-matrix/run-20260421-134924/`
- Matrix artifact:
  - `outputs/test-matrix/run-20260421-134924/matrix.md`
- Commands executed in this slice:
  - static:
    - `npm run lint`
    - `npm run build`
    - `npm ls --depth=0`
    - heuristic secret scan via `rg`
    - license/dependency inventory via `python3`
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
    - `node dist/bin/armature.js bench --json`
    - `vitest run tests/bench.test.ts`
  - resilience:
    - `vitest run tests/provider-stream-resilience.test.ts tests/agent-loop.test.ts tests/hermes-runtime.test.ts tests/chat-repl-turn.test.ts`
  - ai eval:
    - `npm run eval:fast`
- Observed results:
  - all executable layers passed
  - prod `npm audit` returned `0` known vulnerabilities
  - bench JSON kept `score=100`
  - fast gate summary: `62/62` passed at `agent-eval/runs/20260421-054935-662166/summary.json`
- Explicit matrix gaps:
  - no repo-native formatter gate
  - no dead-code gate
  - no dedicated license policy checker
  - no dedicated SAST / DAST / IaC / ASVS smoke
  - no true p95 / throughput / memory budget harness
  - nightly/release gates are defined, but were not re-run in this slice
- Follow-up productization landed:
  - repo-native package scripts:
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
  - generated snippet:
    - `agent-eval/generated/test-matrix-entrypoints.md`
  - runner hardening after attacker review:
    - sanitized `--run-id`
    - secret scan now ignores symlinks and rejects reads outside root
  - latest runner-produced evidence:
    - `outputs/test-matrix/run-20260421-065329/`
    - `outputs/test-matrix/run-20260421-065329/matrix.md`
- Single-source follow-up landed:
  - added `agent-eval/manifests/test-matrix.json`
  - `run-test-matrix.py` now reads layer metadata from the manifest instead of hardcoded Python constants
  - package scripts now wrap the runner by layer id instead of duplicating raw commands
  - attacker-review follow-up closed the remaining `..` run-id edge case by banning dot characters entirely
- Typed-step hardening follow-up landed:
  - `agent-eval/manifests/test-matrix.json` now stores typed `steps[].argv` arrays instead of shell command strings
  - `run-test-matrix.py` now executes those steps directly without `shell=True`
  - `validate_step()` now enforces non-empty argv arrays and string-only env overrides
  - runner now fails fast when `--layers` selects no known layer id
  - fresh verification evidence:
    - `outputs/test-matrix/run-20260421-072634/`
    - `outputs/test-matrix/run-20260421-072634/matrix.md`
  - attacker review conclusion for this slice:
    - no direct shell-injection path remains in the matrix runner because manifest steps are executed via argv, not shell command strings
    - residual trust boundary is intentional: repo-owned manifest content is still executable policy input
- SOTA gap swarm audit + PDCA refresh:
  - added canonical audit report:
    - `SOTA_GAP_SWARM_AUDIT.md`
    - `SOTA_GAP_SWARM_AUDIT.html`
  - swarm synthesis across architecture / security / operator UX / PDCA:
    - continuity is still snapshot-based, not a leaseable session object
    - async work exists, but not as an operator-grade queue/take-over surface
    - review-before-apply evidence is still too shallow outside simple file-write diffs
    - trust hardening still needs one shared executor across REPL / MCP / serve
  - fresh evidence captured for this audit slice:
    - `agent-eval/runs/20260421-074245-714923/`
    - `agent-eval/runs/20260421-074333-249714/`
    - `outputs/manual-cli-smoke/run-20260421-154536/`
  - intermediate failure captured and closed:
    - first nightly rerun failed because `run-gate.py` / `run-test-matrix.py` used `datetime.UTC`, which is unavailable under Python 3.9
    - fixed by switching both scripts to `datetime.now(timezone.utc)`
    - reran nightly/release successfully after the fix
- Trust hardening tranche started:
  - `replPermissionModeFromConfig('default')` now resolves to `auto`, not `yolo`
  - `serve` now rejects non-loopback bindings unless `ARMATURE_SERVE_TOKEN` is configured
  - authenticated `serve` requests must present `Authorization: Bearer <token>`
  - fresh manual verification evidence:
    - `outputs/manual-cli-smoke/run-20260421-160704/cli-smoke.txt`
    - `outputs/manual-cli-smoke/run-20260421-160704/serve-smoke.txt`
- Unified policy executor tranche started:
  - added `src/policy-executor.ts`
  - moved shared hook / tool-filter / approval / sandbox contract into one module
  - `handleProxyToolCall()` now routes normal tools through that shared executor
  - `MCPServer` now routes tool calls through the same shared executor and fails closed for dangerous tools when no grant exists
- Ink entry / home-state UX optimization:
  - added `src/ui/components/HomePanel.tsx`
  - replaced the old startup wall of command lists with:
    - a single primary action
    - trust/state summary
    - quick paths
    - failure help
  - validation:
    - `tests/ink-ui.test.tsx`
    - text snapshot evidence: `outputs/ui-smoke/run-20260421-165711/home-panel.txt`
  - browser-console / network / Lighthouse / responsive screenshot gates are `N/A` for this slice because Armature's primary frontend here is Ink TUI, not a browser app
- Interactive home-panel follow-up:
  - `Tab` now opens a quick-action picker from the empty state
  - quick actions can launch:
    - concrete review/debug prompts
    - `/permissions`
    - `/doctor`
  - `tests/ink-ui.test.tsx` now covers both picker visibility and action-value mapping
- Context-aware home actions follow-up:
  - quick actions now adapt to saved-session presence and current permission posture
  - the home panel now surfaces `/sessions` when saved sessions exist
  - updated snapshot evidence:
    - `outputs/ui-smoke/run-20260421-171338/home-panel-dynamic.txt`

## 2026-05-03 Hook Lifecycle And Claim Evidence Guard

- Root cause:
  - The model can produce unsupported completion claims, but Armature also had runtime gaps that let those claims pass unchallenged.
  - One-shot `armature chat "..."` did not load hooks before model execution.
  - `Stop` was declared as a supported lifecycle event but was not fired after model output.
  - `SubagentStop` was declared but was not fired after `spawn_agent` / `delegate_task` completion.
- Fix:
  - Added shared prompt/stop hook helpers in `src/commands/chat-hooks.ts`.
  - One-shot and REPL `UserPromptSubmit` hooks can now inject context into the actual model prompt or block the turn.
  - `Stop` hooks now receive `ARMATURE_RESPONSE` / `CLAUDE_RESPONSE` with the assistant response for self-review gates.
  - `SubagentStop` now fires with subagent success/output evidence.
  - Added `src/commands/claim-evidence-guard.ts` to flag unsupported claims about file writes/opens, verification, git publish/commit, deployments, and MCP calls when no matching tool ran in the turn.
- Local hook smoke:
  - current global hook load: `39` hooks across `9` events
  - event counts: `UserPromptSubmit=7`, `Stop=6`, `SessionStart=7`, `PreToolUse=8`, `PostToolUse=7`, `PreCompact=1`, `SubagentStart=1`, `SubagentStop=1`, `SessionEnd=1`
  - safe smoke for `PreToolUse`, `PostToolUse`, `Stop`, `SubagentStart`, `SubagentStop`, `SessionStart` returned `continue: true`
- Verification:
  - `npm test -- tests/chat-internals.test.ts tests/chat-one-shot-mcp-cleanup.test.ts tests/chat-proxy-tool-call.test.ts tests/hooks.test.ts tests/hooks-compat.test.ts tests/e2e-workflow.test.ts`
  - `npm run lint`
  - `npm run build`
  - `npm test` => `91` files / `1670` tests passed

## 2026-05-03 Claude-Style No-Flicker TUI

- User reported Armature still had screen flashing/repaint issues and asked to research Claude Code's official fix.
- Official Claude Code docs describe fullscreen mode as an alternate-screen rendering path that eliminates flicker and keeps only visible messages in the render tree for stable memory.
- Armature fix:
  - kept primary-buffer Ink rendering as the default so terminal scrollback remains copyable
  - added no-flicker opt-ins: `ARMATURE_TUI=fullscreen`, `ARMATURE_NO_FLICKER=1`, `ARMATURE_ALT_SCREEN=1`, and `CLAUDE_CODE_NO_FLICKER=1`
  - made `ARMATURE_TUI=default` / disabled env values override fullscreen aliases
  - pre-enters alternate screen before Ink renders the first frame
  - exits alternate screen if Ink render throws before the wrapper can mount
  - caps completed block rendering to the latest `80` blocks in no-flicker mode
  - leaves mouse capture disabled by default; `ARMATURE_MOUSE=1` is still required
- Full-suite follow-up:
  - full `npm test` exposed that hooks were still effectively first-cwd-loaded in some MCP/policy-executor paths
  - fixed `HookManager` to load global hooks once while loading trusted project hooks per cwd
  - scoped repo-local hooks by cwd so hooks from one project do not leak into another project after incremental loading
  - `runPreToolHook()` now loads hooks for the target cwd before checking `PreToolUse`
  - added regression coverage for multi-project hook loading/isolation
- Verification:
  - `npm test -- tests/ink-ui.test.tsx` -> `80/80` passed
  - `npm test -- tests/hooks.test.ts tests/hooks-compat.test.ts` -> `40/40` passed
  - `npm run lint` -> pass
  - `npm run build` -> pass
  - `npm test` -> `91` files / `1671` tests passed
- References:
  - `https://code.claude.com/docs/en/fullscreen`
  - `https://code.claude.com/docs/en/terminal-config`

## 2026-05-03 History Scroll And Local File Enforcement Follow-Up

- User evidence:
  - output history could not be scrolled upward while the prompt input was active
  - requested Markdown files were still not written/opened; model responses could refuse or simulate local file limitations
- Root cause:
  - `src/ui/components/App.tsx` disabled `ScrollBox.keyboardActive` whenever `inputActive` was true, blocking PageUp/PageDown and shifted-arrow scroll during normal REPL use
  - `src/commands/local-file-intent.ts` only repaired false save claims when the model explicitly claimed a save and exposed extractable artifact content; refusal responses and plain generated Markdown did not force a file tool call
- Fix:
  - `ScrollBox` now separates non-text keyboard scrolling from `g/G` vim-style text shortcuts
  - `App` keeps non-text history scroll active while input is focused, but disables `g/G` until input is not focused
  - local file runtime now writes generated Markdown artifacts for explicit save targets even when the model only returns file body content
  - local file runtime now emits a hard incomplete notice when requested file write/open/read operations have no matching tool evidence
- Focused verification:
  - `npm test -- tests/local-file-intent.test.ts tests/chat-internals.test.ts tests/ink-ui.test.tsx` => passed (`106` tests)
  - `npm run lint` => passed
  - `npm run build` => passed
  - `npm test` => passed (`91` files / `1679` tests)

## 2026-05-29 Multi-Model Review Ledger

- User request:
  - integrate the recent large-PR multi-model review practice into Armature CLI
  - preserve the value of multiple independent model reports, synthesis, human checkbox gating, fix/review agent loop, and final E2E regression evidence
- Implementation decision:
  - added a first-class `armature review-ledger` command with alias `armature review-swarm`
  - kept first-pass model reviews independent before synthesis to avoid cross-model contamination
  - reused Armature's existing aggregator-first model routing instead of adding a parallel provider stack
  - wrote durable Markdown artifacts so human decisions remain the canonical fix gate
- Evidence:
  - `npm run build` passed
  - `vitest run tests/review-ledger.test.ts tests/program.test.ts tests/command-contracts.test.ts` passed with `44/44` tests
  - `npm run lint` passed
  - built CLI dry-run smoke passed: `node dist/bin/armature.js review-ledger --dry-run --json --out /tmp/armature-review-ledger-smoke "focus on multi-model review ledger command"`
  - dry-run smoke wrote `10` artifacts, including independent prompt files, synthesis prompt, human decision ledger, fix log, review verdict, and E2E evidence template
  - `git diff --check` on the touched code/docs paths passed
  - `ai check --base-dir /Users/mauricewen/Projects/armature-cli --json` passed in `outputs/check/20260529-012813-244bdac2`
  - `npm test` passed with `93` files / `1704` tests after isolating usage DB writes under `$ARMATURE_HOME`
- Validation boundary:
  - live `--pr` execution depends on authenticated `gh` and configured provider credentials, so the local proof used deterministic dry-run and mocked orchestration tests
  - full project E2E matrix was not rerun for this narrow command addition; targeted contract/build/smoke coverage is the current evidence
  - earlier `ai check` failures were closed by adding the Armature-local `tests/test_all.py` npm gate bridge, normalizing required docs metadata/changelogs, removing no-emoji hits, refreshing release evidence counts, configuring temp git identity inside git-dependent tests, and isolating `usage-db` tests from the real `~/.armature/usage.db`
