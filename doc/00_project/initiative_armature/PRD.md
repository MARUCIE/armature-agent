---
Title: Armature CLI PRD
Scope: project product requirements
Owner: Maurice
Status: Active
LastUpdated: 2026-05-29
---
# Armature CLI PRD

## 2026-05-29 Update - Multi-Model Review Ledger

New product requirements from the TinyShip rebate large-PR review practice:

- Armature must expose a first-class `review-ledger` command for large PR / diff review where multiple models independently inspect the same change.
- The command must preserve the human gate: every issue starts as an unchecked item and no fix agent may act until the human decision is `accepted`.
- The command must support `--pr`, `--diff-file`, and local git diff sources so operators can review GitHub PRs, saved patches, or current working-tree changes.
- The command must support explicit reviewer model lists such as `gpt-5.5,composer-2.5,deepseek-v4-pro`, while retaining Armature's existing aggregator-first routing.
- The command must write durable review artifacts: full diff, review packet, independent reports, synthesis ledger, human decisions, fix log, review verdict, and E2E evidence.
- The synthesis must rank Critical / High / Medium findings, surface multi-model agreement, and keep checkbox rows visible for manual review.
- The workflow must keep fixing, reviewing, and E2E regression as separate phases rather than allowing the reviewer models to decide what should be fixed.
- `--dry-run --json` must create deterministic prompts/templates without live model calls so the command surface can be tested locally.

## 2026-05-03 Update - Markdown Artifact Write Integrity

New product requirements from the local Markdown content-regression report:

- When Armature generates a requested `.md` file, the file body must contain the requested artifact content, not the assistant's conversational save confirmation or chat transcript.
- False-save repair may write a missing file only when it can extract a real artifact body from fenced Markdown, explicit content markers, or Markdown-like document structure.
- If a model claims a file was saved but returns only conversational text, Armature must not create a polluted `.md` file from that conversation.
- The system prompt must explicitly tell providers that `write_file.content` is the final file body only, not assistant chatter or instructions.
- Regression tests must cover fenced Markdown extraction, save-claim stripping, and refusal/no-artifact non-repair.

## 2026-05-02 Update - Tool-Call Continuity and Blackfin Mark

New product requirements from the long-session local-file regression and visual identity follow-up:

- Every streamed provider turn must carry the current Armature system prompt even when chat history already exists, so tool-use rules do not silently decay in long REPL sessions.
- If a user asks Armature to create, save, verify, locate, or open a local file, Armature must use `write_file`, `read_file`, `file_info`, or `open_file` before claiming the task is impossible.
- Local file requests must not rely on prompt discipline alone: REPL turns must intercept obvious read/write/open intents before sending to the model, and streamed proxy turns must repair false "saved to path" claims when no file tool actually ran.
- A missing file that Armature previously claimed to save must be reconstructed from the chat transcript and opened with `open_file` when the operator asks to open it.
- Tool-call regressions must be part of the canonical large-scale test matrix through a dedicated `tool-calls` layer, covering built-in tools, proxy tool loops, MCP routing, MCP cleanup, multimodal/OpenAI-compatible prompt assembly, and local-file system-prompt rules.
- The startup visual identity must keep the Hermes-style lesson of a dominant wordmark, skin/theme-aware colors, and status deck, while avoiding any separate mascot/icon/hero art in the first frame.
- The startup banner must retain the dominant `ARMATURE-AGENT` wordmark and `Blackfin Signal` state deck, and must not render the rejected independent Armature hero/icon block.

## 2026-05-02 Update - Model Catalog SSoT Runtime Consolidation

New product requirements from the model-routing evidence tranche:

- Armature must keep model context windows, max output defaults, pricing, and display capacity labels in one canonical metadata source.
- `/model`, `/models`, `armature providers`, token budget accounting, OpenAI-compatible provider request defaults, startup provider info, and usage cost summaries must not maintain separate metadata tables.
- Unknown models must still use conservative runtime fallbacks without adding compatibility branches for old duplicated tables.
- Regression coverage must fail if runtime consumers reintroduce their own `MODEL_CONTEXT`, `MODEL_CONTEXT_WINDOW`, `MODEL_MAX_OUTPUT`, or `MODEL_PRICING` tables.

## 2026-05-02 Update - Terminal Operability Hardening

New product requirements from the copyability / tool-cwd regression report:

- Armature's default Ink UI must keep normal terminal scrollback copyable, matching the practical behavior operators expect from Claude Code.
- Fullscreen/no-flicker alternate-screen rendering must be opt-in through `ARMATURE_TUI=fullscreen`, `ARMATURE_NO_FLICKER=1`, `ARMATURE_ALT_SCREEN=1`, or Claude Code compatible `CLAUDE_CODE_NO_FLICKER=1`.
- Mouse tracking must be opt-in through `ARMATURE_MOUSE=1` so terminal text selection is not captured by the app by default.
- `armature chat` must resolve a stable workspace cwd from explicit `--cwd`, `ARMATURE_CWD`, `ARMATURE_PROJECT_DIR`, the ambient project cwd, or the last remembered project workspace.
- Root `armature --cwd <dir>` must forward the cwd into `armature chat` so launcher aliases and menu wrappers can pass a project directory without naming the subcommand.
- MCP tool routing must support server names containing underscores and hyphens, including Codex/OMX-style names such as `omx_code_intel`.
- Armature must include a first-class `open_file` tool for visually opening local Markdown/PDF/image files with the OS default app, while `read_file` remains the contents-reading tool.
- `open_file` must be treated as a dangerous tool for approval policy because it launches an external application.

## 2026-05-03 Update - Claude-Style No-Flicker TUI

New product requirements from the Claude Code fullscreen/no-flicker research follow-up:

- Armature must keep copyable primary-buffer rendering as the default.
- Armature must expose an explicit Claude-style no-flicker fullscreen mode for operators who see terminal repaint flashes in VS Code, tmux, or iTerm2.
- The no-flicker mode must switch to the terminal alternate buffer before Ink paints its first frame.
- The no-flicker mode must reduce render pressure during long conversations by limiting the rendered block tree to recent visible history.
- The no-flicker mode must preserve normal copyability by keeping mouse capture disabled unless `ARMATURE_MOUSE=1` is set.

## 2026-05-02 Update - Rubber Duck Critique Quality Gate

New product requirements from the local AI coding CLI research report:

- Armature must expose `armature critique` as a first-class read-only Rubber Duck Critique gate, separate from `armature reflect`.
- `reflect` remains the Socratic debugging/root-cause workflow; `critique` challenges a plan, diff, test output, and risk assumptions before the main agent continues.
- The critique gate must support checkpoints: `after_plan`, `after_complex_implementation`, `before_test_execution`, `stuck_loop`, and `manual`.
- The gate must compute a risk score from diff line count, changed file count, critical-path risk, repeated-failure risk, security/data sensitivity, and user uncertainty.
- Manual critiques always run; high-risk plan/implementation checkpoints trigger at `0.65`; test and stuck-loop checkpoints trigger at `0.45`.
- The reviewer prompt must be read-only and must require structured JSON findings with severity, category, file/line, claim, evidence, suggested fix, confidence, and `requires_user_decision`.
- The command must support deterministic `--dry-run --json` output so local validation does not require live model credentials.
- The default reviewer choice should prefer a complementary model family to the active model where possible.
- `armature chat` must expose `/critique` as a local read-only inspection so operators can check the same gate without leaving the active session.
- Slash critique output must show checkpoint, reviewer choice, risk score, changed file count, diff line count, and changed files without calling a model.
- Normal `armature chat` turns must perform a lightweight local dirty-diff risk check before sending, and recommend `/critique --checkpoint after_complex_implementation` once per high-risk diff signature.
- One-shot `armature chat "prompt"` must use the same local pre-send risk check in streaming mode so operators get the warning whether they use REPL or one-shot chat.
- Automatic critique hints must remain read-only and model-free; they must not change the user prompt, block execution, or mutate the workspace.
- `armature chat --json` must not emit automatic critique hints into machine-readable output.
- Operators must be able to disable or tune the automatic local hint per session through `--no-auto-critique` and `--auto-critique-threshold <score>`, with `ARMATURE_AUTO_CRITIQUE` and `ARMATURE_AUTO_CRITIQUE_THRESHOLD` still available for process-wide defaults.

## 2026-05-01 Update - Pod Helm Footer UI/UX Tranche

New product requirements from the helm-footer UI/UX pass:

- The persistent Footer must read as Armature pod helm guidance, not generic CLI shortcut copy.
- The footer must start with `POD HELM` while preserving context-aware shortcut visibility.
- Generating state must keep `esc` visible and explain it as `interrupt echo`.
- Active input state must preserve `enter`, `ctrl+j`, `/help`, and `shift+tab` hints while using pod-oriented labels such as `send brief` and `pod commands`.
- Footer rendering must avoid incoherent wrapping on ordinary-width terminals by keeping core hints compact and only showing lower-priority hints when width allows.
- Footer colors must resolve through theme semantic tokens instead of dim-only terminal styling.
- The tranche must not change shortcut behavior, input submission, permission-mode behavior, or add dependencies.

## 2026-05-01 Update - Pod Council Runway UI/UX Tranche

New product requirements from the council-runway UI/UX pass:

- Live multi-model progress must read as Armature pod intelligence, not a generic model list.
- The progress header must start with `POD COUNCIL` while preserving the active command name.
- The model count must remain visible as coordinated pod voices.
- Completed model rows must indicate surfaced output while keeping model name and elapsed time visible.
- Active model rows must indicate sonar progress while keeping model name and elapsed time visible.
- Progress colors must resolve through theme semantic tokens instead of hard-coded terminal colors.
- The tranche must not change `ModelProgress`, council/race/pipeline runtime behavior, spinner dependency behavior, or add dependencies.

## 2026-05-01 Update - Pod Evidence Drawer UI/UX Tranche

New product requirements from the evidence-drawer UI/UX pass:

- Detail panels must read as an Armature evidence surface, not a generic detail box.
- The rendered title must start with `EVIDENCE DRAWER` while keeping the original detail title visible.
- Existing subtitles must remain visible and gain compact `pod scan` context.
- Detail panel info/warn/error tones must resolve through theme semantic tokens instead of hard-coded terminal colors.
- Markdown body rendering must remain unchanged.
- The tranche must not change `DetailPanelInfo`, slash-command behavior, evidence body formatting, markdown parsing, or add dependencies.

## 2026-05-01 Update - Pod Trust Gate UI/UX Tranche

New product requirements from the trust-gate UI/UX pass:

- Permission prompts must read as an Armature pod trust boundary, not a generic approval modal.
- The approval title must start with `TRUST GATE` while keeping the tool name visible.
- Tool preview must remain visible under a compact `SCAN` label before any allow/deny decision.
- Approval choices must preserve allow once, allow session, allow project, and deny semantics while using clearer trust-scope copy.
- Keyboard behavior must remain unchanged for `y`, `n`, `1-4`, arrows, Enter, and Esc.
- Write diff previews must read as `ECHO DIFF` while preserving file path, add/remove counts, line numbers, truncation, and diff content.
- The tranche must not change permission policy, approval keybindings, diff algorithm, runtime event model, or add dependencies.

## 2026-05-01 Update - Pod Proof Wake UI/UX Tranche

New product requirements from the proof-wake UI/UX pass:

- Post-turn summaries must belong to the Armature pod visual system, not use internal shorthand such as `r`, `d`, and `u`.
- Each completed response must leave a compact `PROOF WAKE` summary.
- The summary must preserve elapsed time, input token count, output token count, tool-call count, cost, and output throughput.
- The tranche must not change `TurnSummaryInfo`, usage accounting, event payloads, or provider/runtime behavior.

## 2026-05-01 Update - Pod Status Rail UI/UX Tranche

New product requirements from the status-rail UI/UX pass:

- The fixed bottom status bar must carry the Armature pod identity as strongly as the banner, home panel, pickers, and transcript.
- Status line 1 must keep `ARMATURE POD`, model, context bar / percentage, and git branch visible, while labeling context as sonar load on ordinary-width terminals.
- Status line 2 must read as a `signal:` rail when stats are present, while preserving cost, throughput, turns, session id, model policy, tool policy, output style, and sparkline evidence.
- Status line 3 must read as a `trust:` rail while preserving permission mode, permission source, behavior mode, effort, and shift-tab cycling guidance.
- The tranche must not change the status data shape, permission behavior, footer shortcuts, or runtime event model.

## 2026-05-01 Update - Pod Transcript Flow UI/UX Tranche

New product requirements from the transcript-flow UI/UX pass:

- The live transcript must carry the Armature pod identity, not only the startup banner and picker surfaces.
- Submitted user prompts must render as `POD BRIEF` blocks while preserving the exact prompt text.
- Assistant responses must render as `ARMATURE POD` panels and continue to convert markdown headings, bullets, inline code, and emphasis into structured terminal text.
- Streaming assistant responses must use Armature-specific state copy instead of generic `streaming`.
- Tool-call rails must show an Armature scan label while preserving tool name, path/argument summary, result state, duration, and error preview.
- Thinking state must use a compact Armature/pod/proof-oriented verb set instead of generic playful status verbs.

## 2026-05-01 Update - Pod Command Surface UI/UX Tranche

New product requirements from the command-surface UI/UX pass:

- High-frequency operation surfaces must carry the Armature pod identity, not only the startup banner.
- The shared picker frame must use theme semantic tokens instead of generic hard-coded cyan/yellow styling in the changed surfaces.
- Slash-command discovery must present as `POD COMMANDS`, expose `echo filter` feedback, and remain visible with a clear no-match state.
- Option selection must use Armature theme tokens for selected rows, filter labels, descriptions, and scroll affordances while preserving quick-pick behavior.
- The input placeholder and multiline hint must use pod-brief language without changing input submission, history, paste, or cursor semantics.
- Focused Ink tests must guard the new picker title, filter copy, no-match state, and input placeholder.

## 2026-05-01 Update - Cute Armature Mascot UI/UX Tranche

Superseded on 2026-05-02 for the startup Banner: Armature no longer renders a separate mascot/icon/hero block on startup. The surviving requirements from this tranche are the pod-brief first input surface and Armature-owned HomePanel language.

New product requirements from the mascot UI/UX pass:

- The startup logo must learn Hermes Agent's structure, not its content: large product wordmark plus status-rich startup panel.
- The first input surface must use friendly pod briefing language: `POD BRIEF` as the primary intent panel, `POD SIGNAL` for trust/model/session/tool state, and existing recovery/guardrail affordances.
- Regression tests must assert the clean startup deck and first-screen copy so future edits do not regress to abstract ocean marks, mascot blocks, or generic command onboarding.

## 2026-04-30 Update - Armature Visual System Tranche

New product requirements from the Hermes-inspired visual system pass:

- Armature's first terminal frame must be recognizably Armature, not a generic cyan coding CLI.
- Hermes Agent is a reference for recognition mechanics: large wordmark, one memorable symbol, semantic skin tokens, compact fallback, and content-first startup information.
- Armature must not copy Hermes's caduceus or exact gold-only identity; the shipped direction is `Blackfin Signal`, a killer-whale pod system.
- Default dark theme must resolve to semantic Armature tokens: blackfin / foam contrast, amber echolocation signal, brass, reef, kelp, coral, and deep border states.
- Startup banner must show the `ARMATURE-AGENT` wordmark, model, cwd, trust, config, session, and fleet state without a separate mascot/icon block.
- HomePanel must stay operational: one pod brief input path, visible trust / mode / model / session / tools state, recovery paths, and guardrails.
- ThemePicker and StatusBar must name the new default identity while preserving existing alternate themes.
- No new font or rendering dependency is allowed; terminal font guidance lives in the visual system plan.

## 2026-04-29 Update - SOTA Swarm Audit Tranche

New product requirements from the SOTA swarm audit:

- Repo-local hooks must not load or execute on startup unless project trust is explicit.
- Network-capable tools (`fetch_url`, `web_search`) must pass through approval policy in `auto` mode.
- `fetch_url` must reject non-HTTP(S), loopback, private, and link-local literal targets by default.
- Operators need a top-level queue inspection surface for current `TaskRun` records: `armature queue list/show/follow/takeover/evidence`.
- Queue inspection must expose richer evidence bundles and approval timelines in both CLI output and the Ink detail panel.
- Slash-command discovery must use a shared registry so REPL completion, Ink picker, and `/help` cannot drift; HomePanel hint metadata must be ready for the pending UI-baseline split.
- README and active PDCA documents must use `verification_snapshot.json` plus release-evidence tests so version, test file count, and full-suite count cannot silently drift.
- CI must run the documented matrix/security/performance/eval entrypoints instead of relying on a narrower build/test job.
- `armature run` default, goal-loop, mission, plan branches, and interactive `armature chat` turns must create and close canonical `WorkSession` / `TaskRun` records.
- Queue leases must produce actionable resume plans: `armature queue resume` claims a lease and prints concrete recovery commands; `armature queue schedule` picks the next unleased resumable TaskRun.
- Next tranche must continue model-routing evidence work and add replay-safe metadata for non-chat TaskRuns before arbitrary `run` resume is claimed.
- `serve /chat` must create and close canonical `WorkSession` / `TaskRun` records, returning the ids in non-streaming responses and emitting them as streaming metadata.
- Ink chat must keep submitted prompts visible after Enter and render assistant markdown in structured response panels instead of raw transcript text.
- Review-before-apply decisions must persist on the owning `TaskRun` and render before file evidence in CLI and Ink evidence drawers.

## Product Snapshot

- Product: Armature CLI
- Package: `armature-cli`
- Domain: provider-neutral coding-agent CLI
- Primary users: developers who need coding-agent workflows across multiple model vendors
- Current repo status: active TypeScript CLI with runtime, multi-model collaboration, session management, PR review, serve mode, benchmark tooling, and Hermes-inspired runtime ergonomics

## Problem

Single-vendor coding CLIs force users into one model family per session. Armature CLI exists to give developers a single terminal-native workflow that can route across providers, run agent tasks, and coordinate multiple models when that meaningfully improves quality or speed.

## Goals

1. Provide a production-grade CLI for coding-agent usage with predictable provider/model routing.
2. Support multi-model collaboration modes that no single-vendor CLI can offer.
3. Preserve strong developer ergonomics: REPL, one-shot execution, saved sessions, PR review, stats, headless serving, and explicit debugging/reflection flows.
4. Keep runtime behavior testable and inspectable through a large automated suite.
5. Support global operator hooks such as terminal-title automation without forcing every project to vendor a local `.armature/hooks.json`.

## Non-Goals

- Browser-first UX
- Backward-compatibility shims for outdated command or config formats
- Mock-only validation in place of real CLI/runtime verification

## Key User Jobs

| User Job | Current Surface | Source |
| --- | --- | --- |
| Ask the agent a question interactively | `armature chat`, default no-subcommand entry | `src/commands/chat.ts`, `src/program.ts` |
| Run a structured debugging / rubber-duck-style reflection pass | `armature reflect`, `/reflect`, `/mode reflect` | `src/commands/chat.ts`, `src/commands/reflect-mode.ts`, `src/modes/registry.ts` |
| Execute a coding task | `armature run` | `src/commands/run.ts` |
| Compare or combine models | `armature council`, `armature race`, `armature pipeline` | `src/commands/multi.ts`, `src/multi-model.ts` |
| Inspect providers and routing | `armature providers` | `src/commands/providers.ts` |
| Review saved state and cost | `armature session`, `armature stats` | `src/commands/session.ts`, `src/commands/stats.ts` |
| Track detached work | `run_background`, `/jobs` | `src/tools.ts`, `src/background-jobs.ts`, `src/commands/chat.ts` |
| Review pull requests | `armature pr` | `src/commands/pr.ts` |
| Expose a headless agent server | `armature serve` | `src/commands/serve.ts` |
| Benchmark the runtime | `armature bench` | `src/commands/bench.ts` |

## Core Capabilities

- Provider-neutral config and endpoint resolution
- OpenAI-compatible transport bridge
- Agent tool loop and runtime orchestration
- Multi-model council, race, and pipeline execution
- Reflect mode for Socratic debugging and root-cause investigation
- Top-level workflow preset commands for review/debug/architect entry
- Ink transcript readability: submitted prompts render as highlighted `You` blocks and assistant markdown renders inside `ORCA` panels with structured headings/lists.
- Mode picker now exposes per-profile workflow-change summaries
- Workflow preset command metadata now resolves from one registry instead of scattered command-local strings
- Workflow presets now carry structured default policy fields (`effort`, `permission mode`)
- Preset-backed mode switches now apply those default policy fields at runtime
- `/mode` picker now surfaces preset policy defaults directly in the description layer
- Startup and `/mode` switching now share one preset-policy application path
- The shared startup path now also composes the initial system prompt from mode + preset + effort, so preset-backed one-shot and REPL entry behave the same way
- Status surfaces now expose the current workflow policy combination
- Workflow presets now also carry structured `tool policy` and `output style`
- `/status` now exposes those additional policy dimensions
- Live status surfaces now show compact tool/output summaries when available
- Model policy is now exposed in `/status` and summarized in live status surfaces
- Active mode tool restrictions are now enforced in the proxy tool runtime instead of remaining prompt-only guidance
- Session effort and preset default effort now also map into proxy `reasoning_effort` requests
- Provider-returned tool calls are now rejected unless the tool was explicitly advertised for that request
- Non-interactive permission prompts now fail closed instead of silently auto-approving
- SDK-backed REPL turns now receive the composed session system prompt and mapped permission mode
- Hook loading and lifecycle execution
- Session persistence and usage tracking
- Session portability via fork / export / import
- Session shareable markdown artifacts
- Session handoff artifact bundles
- Thread portability and handoff-oriented cloning
- Thread shareable markdown artifacts with metadata sidecars
- Explicit approval / trust control surface for session and persisted config modes
- Ink approval detail/picker surface for live policy changes and persistence
- In-session visibility of permission mode source
- Inline permission promotion from one-off approval to session/project policy
- Inspectable permission-rule surfaces for session/project/global scopes
- Rule-management surfaces for revoke/clear without hand-editing config
- Revoke flow supports filter-and-pick rule selection instead of exact-key-only deletion
- Permission rules now persist as stable canonical descriptors instead of volatile preview text
- Explicit normalize surface for legacy rule cleanup
- Effective permission allowlist now merges project + global scopes at runtime
- Permission rule inspection now exposes canonical / legacy / unrecognized state
- Legacy `::` rule format is supported by explicit normalization
- Rule audit surfaces now support state-based filtering
- Startup MCP auto-connect now trusts only home/global configs by default; repo-local MCP requires explicit `/mcp connect` instead of silent repo-driven process spawn
- Run continuity now has a first-class foothold:
  - default `armature run`, goal-loop, mission, and plan branches create a durable `WorkSession`
  - the same executions create persisted `TaskRun` records with status, summary, and usage
  - mission TaskRuns attach mission-state evidence when available
  - `serve` can inspect both through read-only continuity endpoints
  - `armature queue takeover` can claim a TTL operator lease on non-terminal `TaskRun` records
  - `serve /chat` creates a durable `WorkSession` and `TaskRun` for both non-streaming and SSE requests
  - interactive `armature chat` REPL turns create per-prompt `TaskRun` records under the active chat `WorkSession`
  - `armature queue resume` can claim a lease and print `armature chat --cwd ... --continue <saved-session-id>` for chat TaskRuns with saved-session metadata
  - `armature queue schedule` can skip active leases and unsupported replay records, then claim the next resumable or monitorable TaskRun
- CLI output rendering and markdown streaming
- Slash-command autocomplete that yields to full command submission once the user starts typing arguments
- Theme preference persistence that suppresses first-launch onboarding once `ARMATURE_THEME` or `~/.armature/theme` is already set
- Tool argument coercion for model-emitted string values
- Oversized tool result persistence with artifact paths
- Background job tracking with completion notifications
- Provider-aware model catalog with context/pricing/caution metadata
- Provider command and startup surfaces that expose the same model metadata before a session begins
- Entry-state home panel that emphasizes one primary action, current trust posture, recovery shortcuts, and failure help
- Conservative reflect auto-triggering for clear debugging/explanation prompts in standard chat flows
- Centralized local runtime logging with a CLI log viewer
- A doctor-style diagnostics surface for config/runtime/provider health
- Explicit malformed-config diagnostics for local JSON config files
- Headless server endpoints that surface the same runtime/provider diagnostics as the CLI
- A unified stats dashboard that combines usage, runtime health, and recent error signals

## Success Signals

- `npm test` stays green for runtime, tool, hook, and multi-model suites
- `npm run eval:fast`, `npm run eval:nightly`, and `npm run eval:release` provide reproducible gate artifacts under `agent-eval/runs/`
- `README.md` matches actual command surface and provider/model claims
- Project docs under `doc/00_project/initiative_armature/` remain current with source layout
- Future feature work lands without reintroducing single-provider coupling

## Benchmark-Derived Priorities (2026-04-21)

Representative benchmark set:

- Claude Code
- OpenAI Codex
- Amp
- OpenCode
- Cursor
- GitHub Copilot coding agent

Shared SOTA SOP shape across that set:

1. durable session / thread object
2. explicit approval or review gate
3. detached or remote execution surface
4. resumable handoff back into IDE / PR / terminal
5. visible evidence surface: logs, queue status, timeline, share link, or usage analytics

Implication for Armature:

- Wave 3 is no longer the main gap; workflow packaging and trust UX are now materially stronger.
- The highest-value remaining product gap is Wave 4 continuity:
  - terminal ↔ web ↔ IDE session continuity
  - detached execution with visible queue / status / take-over
  - reviewable evidence timeline for async work
- The next operator-shell gap after continuity is not “more preset names”; it is a stronger inspect-and-act evidence console.
- The 2026-04-21 swarm audit tightened that broad conclusion into four concrete missing layers:
  - leaseable `WorkSession` / `TaskRun` objects
  - operator-grade async queue / take-over flows
  - review-before-apply evidence console
  - safer shared trust enforcement across REPL / MCP / serve

Priority order after this benchmark:

1. Wave 4 continuity surfaces
2. async execution queue + resumable take-over
3. inspect-and-act evidence console
4. only then additional preset/model-policy refinement

Current Wave 4a foothold already landed:

- stable REPL `sessionId`
- continuity visibility in `/status`
- headless session-discovery endpoints via `armature serve`
- CLI continuity now supports both `armature -c` and `armature -c <session-id>`
- continuity metadata over HTTP is now intentionally scoped to local/trusted deployments:
  - no wildcard CORS
  - session endpoints are loopback-only

## Large-Scale Test Expansion Initiative (2026-04-14)

- Baseline: the current measured automated baseline is `1280/1280` passing tests from `npm test`; the planning track started from `1263/1263`, and historical flat docs no longer reflect the canonical total.
- Outcome target:
  1. Fast gate: `550-650` selected deterministic cases + `12` task-eval scenarios
  2. Nightly gate: `~1700` deterministic cases + `36` task-eval scenarios
  3. Release gate: `~2210` deterministic cases + `72` task-eval scenarios backed by `10-12` reusable graders
- Breadth priorities:
  1. command / flag / help / program registration matrix
  2. provider / model / config / doctor / stats / providers matrix
  3. REPL / ink input / session / background-job / output matrix
  4. serve / headless / IDE integration matrix
- Depth priorities:
  1. long-horizon agent loop and retry / recovery flows
  2. multi-step bug-fix / feature / refactor scenarios
  3. adversarial, malformed-input, and safety boundary scenarios
  4. large-codebase and multi-model arbitration workflows
- Immediate command-surface gaps to close first:
  1. `pr`
  2. `session`
  3. `serve`
  4. `run`
  5. `providers test`
  6. root/bin and packaging entrypoints
- Landed gate system:
  1. `agent-eval/manifests/{fast,nightly,release}.json` define the tiered bundles
  2. `agent-eval/scripts/run-gate.py` is the shared manifest runner
  3. `npm run eval:fast|nightly|release` are the canonical maintainer entrypoints
  4. release verification now records a CLI journey artifact in each run directory
- Quality gates:
  1. Fast gate: targeted critical-path suites and doc / metadata parity checks
  2. Nightly gate: full Vitest corpus plus deep scenario tranches
  3. Release gate: nightly gate + `npm run build` + `npm run bench` + task-eval run pack + manual CLI journey review + packaging/bin smokes

## Current Risks

- Legacy flat docs in `doc/` can drift from current project-level canonical docs
- Marketing-style counts in README/docs can become stale as tool/provider inventories evolve
- Provider routing complexity can leak across unrelated modules if not kept centralized
- Some Hermes-inspired ergonomics are currently Armature-local and not yet extracted to the shared SDK
- Test counts can grow faster than signal unless gate tiers and task-based eval ownership stay explicit
- Operator-facing command contracts can remain under-tested even while total suite size keeps rising
- Gate definitions can drift from task/grader assets unless manifest integrity stays under test

## Immediate Priorities

1. Keep the new project-level documentation tree as the canonical operating surface.
2. Maintain command/runtime verification discipline (`lint`, `test`, `build`, bench when relevant).
3. Consolidate future architecture and UX updates in the initiative docs instead of adding more flat reference files.
4. Internalize high-value Hermes runtime behavior where the boundary is clearly CLI/runtime focused.
5. Turn the current `1280`-test baseline into a tiered breadth/depth expansion program instead of continuing ad hoc suite growth.
6. Keep the manifest-based eval system canonical so release verification is reproducible instead of ad hoc shell history.

## REPL Multimodal Image Paths (2026-04-20)

### User Problem

- `armature chat --image ...` worked for one-shot prompts, but the interactive REPL could not actually attach local screenshots or multiple images.
- Dragging or pasting image file paths into the REPL caused them to be treated as plain text or file-expanded blobs, so the model said it could not see the screenshot content.

### Requirements

- Support arbitrary local image paths in normal REPL prompts.
- Support multiple images in a single turn.
- Keep quoted paths and shell-escaped spaces working.
- Preserve the image parts in proxy-path conversation history.

### Acceptance

- REPL image-path turns produce multimodal `PromptContent` on the proxy path.
- Multiple image paths in one turn are attached together.
- Text file expansion skips image paths that were promoted to attachments.
- Full verification passes (`lint`, `test`, `build`, `bench`).

## History Scroll And Local File Enforcement (2026-05-03)

### User Problem

- Long REPL output history could not be scrolled upward during normal prompt input.
- Explicit requests to generate/save/open Markdown files could still produce model-only responses without real local file writes.

### Requirements

- Keep non-text history scroll controls active while the prompt input is focused.
- Do not let scroll text shortcuts steal normal typed input.
- Treat local file save/create/generate/open/read requests as runtime side effects that require matching tool evidence.
- If a model returns the requested Markdown artifact body for a named target file, write that artifact through `write_file`.
- If the required file tool does not run, mark the local file request incomplete.

### Acceptance

- Focused UI tests prove input-focused history scroll activation no longer disables non-text scroll keys.
- Focused local-file tests prove generated Markdown artifacts are written and refusal/no-tool paths are marked incomplete.

## Changelog

| Date | Change |
| --- | --- |
| 2026-05-29 | Normalized metadata for the project ai check gate and recorded the multi-model review ledger integration. |
