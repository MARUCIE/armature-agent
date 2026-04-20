# Orca CLI User Experience Map

<!-- AI-FLEET:PROJECT_DIR:START -->
- `PROJECT_DIR`: `/Users/mauricewen/Projects/orca-cli`
<!-- AI-FLEET:PROJECT_DIR:END -->

## Experience Model

Orca CLI is a command-first product. User journeys are structured around terminal entry points, not URLs.

## Journey Map

| Journey | User Intent | Command / Entry | Source |
| --- | --- | --- | --- |
| Onboard | Configure a provider and initialize usage | `orca init`, env vars, config files | `src/commands/init.ts`, `src/config.ts` |
| Explore interactively | Ask questions or operate in a REPL | `orca`, `orca chat` | `src/bin/orca.ts`, `src/commands/chat.ts` |
| Reflect on a bug or confusing code path | Run a focused rubber-duck-style diagnosis pass with explicit and persistent entrypoints | `orca reflect`, `/reflect`, `/mode reflect` | `src/commands/chat.ts`, `src/commands/reflect-mode.ts`, `src/modes/registry.ts` |
| Analyze local images | Send one or more local screenshots/images with a text instruction through the proxy path | `orca chat --image <path...> "prompt"` | `src/commands/chat.ts`, `src/providers/openai-compat.ts` |
| Diagnose the runtime | Check config/provider/hook/MCP/session/log state before debugging by hand | `orca doctor` | `src/commands/doctor.ts`, `src/doctor.ts` |
| Pick a model safely | Inspect provider, context window, approximate pricing, and caution notes before switching | `/model`, `/models` | `src/commands/chat.ts`, `src/model-catalog.ts` |
| Check providers before starting | Inspect provider readiness and default-model metadata before entering a session | `orca providers`, `orca providers test` | `src/commands/providers.ts`, `src/model-catalog.ts` |
| Inspect runtime logs | Read recent info/warn/error entries without opening files manually | `orca logs`, `orca logs errors` | `src/commands/logs.ts`, `src/logger.ts` |
| Review runtime dashboard | See usage, runtime health, and recent error signals in one place | `orca stats` | `src/commands/stats.ts`, `src/doctor.ts`, `src/logger.ts` |
| Plan quality expansion | Turn the current automated baseline into a larger SOTA test program with explicit task / grader ownership | `AGENT_EVAL_PLAN.md`, `agent-eval/manifests/*.json` | repo root plan + manifest-based gate workflow |
| Run fast / nightly / release gates | Execute reproducible SOTA bundles and collect auditable artifacts under one runner | `npm run eval:fast`, `npm run eval:nightly`, `npm run eval:release` | `package.json`, `agent-eval/scripts/run-gate.py`, `agent-eval/manifests/*.json` |
| Inspect headless runtime state | Query health/provider/doctor metadata over HTTP before attaching a client | `orca serve` + `GET /health|/providers|/doctor` | `src/commands/serve.ts`, `src/doctor.ts`, `src/model-catalog.ts` |
| Launch from IDE | Start Orca chat/doctor/MCP from VS Code without hand-writing terminal commands | VS Code commands from `integrations/vscode-orca/` | `integrations/vscode-orca/package.json`, `integrations/vscode-orca/extension.js` |
| Execute work | Run a coding or analysis task | `orca run` | `src/commands/run.ts` |
| Compare models | Get multiple opinions or race for speed | `orca council`, `orca race`, `orca pipeline` | `src/commands/multi.ts`, `src/multi-model.ts` |
| Inspect routing | Check configured providers | `orca providers` | `src/commands/providers.ts` |
| Review cost and sessions | Inspect usage history and saved sessions | `orca stats`, `orca session` | `src/commands/stats.ts`, `src/commands/session.ts` |
| Track background work | Start detached work and get notified when it finishes | `run_background`, `/jobs` | `src/tools.ts`, `src/background-jobs.ts`, `src/commands/chat.ts` |
| Review a PR | Pull and review GitHub PRs | `orca pr` | `src/commands/pr.ts` |
| Run headless | Expose the runtime over HTTP/SSE | `orca serve` | `src/commands/serve.ts` |
| Benchmark quality | Measure runtime quality and capability | `orca bench` | `src/commands/bench.ts` |
| Run release-quality evaluation | Validate deterministic suites, performance, and scenario-based agent delivery before shipping | `npm test`, `npm run build`, `npm run bench`, future `ai agent-eval ... run` | `package.json`, `AGENT_EVAL_PLAN.md` |

## Command Flow Details

### 1. REPL / One-Shot Flow

1. User invokes `orca` or `orca chat`.
2. `src/bin/orca.ts` hands off to `src/program.ts`.
3. `src/commands/chat.ts` resolves config, model, prompt, tool loop, and streaming output.
4. User receives formatted markdown and tool events in terminal.

### 1a. Reflect Flow

1. User invokes `orca reflect`, `/reflect ...`, or switches the session with `/mode reflect`.
2. `src/commands/reflect-mode.ts` rewrites the prompt into a structured reflection contract: symptom, hypotheses, evidence, root cause, next step.
3. `src/commands/chat.ts` reuses the normal agent/tool loop, but with reflect-specific prompt shaping and mode guidance.
4. For clear debugging or explanation prompts in standard `orca chat`, Orca can conservatively auto-trigger reflect and shows an inline notice when it does.

### 1b. Model Selection Flow

1. User invokes `/model` or `/models`.
2. `src/model-catalog.ts` derives model metadata from config + known model hints.
3. The REPL shows provider, context window, approximate pricing, and caution notes.
4. If a cautionary model is selected, the REPL warns immediately instead of failing later through degraded tool use.

### 1c. Provider Inspection Flow

1. User invokes `orca providers` or `orca providers test`.
2. `src/commands/providers.ts` resolves configured providers and decorates them with model-catalog metadata.
3. The CLI shows readiness plus context/pricing/caution data before the user commits to a session or connectivity test.

### 1d. Doctor Flow

1. User invokes `orca doctor`.
2. `src/doctor.ts` gathers provider, project, hook, MCP, session, background-job, and log diagnostics.
3. The command emits either a human-readable health summary or JSON for automation.
4. Malformed local JSON config files are called out explicitly instead of being hidden in generic stderr noise.

### 1f. Serve Metadata Flow

1. User starts `orca serve`.
2. HTTP clients can call `/health`, `/providers`, and `/doctor`.
3. The headless server returns the same provider/runtime metadata already exposed in the CLI surfaces.

### 1g. Stats Dashboard Flow

1. User invokes `orca stats`.
2. `src/commands/stats.ts` reads usage history from SQLite.
3. The command merges in runtime health from `doctor` and recent errors from the local logger.
4. The user sees both cost metrics and operational state in a single output.

### 1e. Runtime Log Flow

1. Runtime warnings/errors and selected info events are persisted via `src/logger.ts`.
2. Files are written to `~/.orca/logs/` (or `$ORCA_HOME/logs/`).
3. `orca logs` and `orca logs errors` surface recent entries without requiring direct file inspection.

### 2. Task Execution Flow

1. User invokes `orca run "task"`.
2. `src/commands/run.ts` packages the task for the runtime.
3. Runtime resolves provider/model config and tool permissions.
4. Output streams back through `src/output.ts` and `src/markdown.ts`.

### 3. Multi-Model Collaboration Flow

1. User chooses `council`, `race`, or `pipeline`.
2. `src/commands/multi.ts` resolves provider strategy.
3. `src/multi-model.ts` coordinates parallel or staged calls.
4. Result is rendered with verdict, winner, or stage-by-stage output.

### 4. Background Job Flow

1. The agent invokes `run_background`.
2. `src/background-jobs.ts` creates a tracked detached job and log artifact.
3. The REPL surfaces completion notifications before the next prompt.
4. `/jobs` provides a quick state view without falling back to raw PID inspection.

### 4b. Quality Expansion Flow

1. Maintainer measures the current suite baseline from the real repo state.
2. `AGENT_EVAL_PLAN.md` defines breadth lanes, depth lanes, gate tiers, and task / grader expectations.
3. `agent-eval/manifests/{fast,nightly,release}.json` codify the current gate bundles.
4. `agent-eval/scripts/run-gate.py` executes the selected manifest and writes transcripts, outcomes, grades, summary JSON, and summary Markdown.
5. Fast gate protects critical-path operator surfaces with the local black-box smoke pack.
6. Nightly gate adds deterministic repo verification (`lint`, `test`, `build`) ahead of the same black-box bundle.
7. Release gate adds `bench` plus a recorded CLI journey artifact before a ship decision.

### 5. ink Terminal UI Interaction Model

The REPL now uses ink (React for terminals) as the rendering engine. The UI is a fullscreen alternate-screen layout:

```
┌─────────────────────────────────┐
│  ScrollBox (content area)       │  ← scrollable: PageUp/Down, g/G, mouse wheel
│  banner, markdown, tool calls   │  ← stickyScroll: auto-follows bottom
│  thinking spinner, diff preview │
├─────────────────────────────────┤
│  CommandPicker (when / typed)   │  ← slash command autocomplete
├─────────────────────────────────┤
│  > InputArea                    │  ← multi-line: Ctrl+J/Meta+Enter/Shift+Enter
│    cursor, kill/yank, paste     │  ← word nav: Option+Arrow, Ctrl+W, Ctrl+K/Y
├─────────────────────────────────┤
│  model · mode · branch · cost   │  ← StatusBar line 1 (inverse video)
│  ████░░░░ 12% · 3 turns · ▃▅█  │  ← StatusBar line 2 (context bar + sparkline)
├─────────────────────────────────┤
│  enter send · ctrl+j newline    │  ← Footer (context-aware keyboard hints)
└─────────────────────────────────┘
```

The picker is a token-scoped helper, not a submit interceptor: it should appear only while the user is still typing the slash command token itself. Once the input moves into whitespace-delimited arguments, Enter must submit the full command text unchanged. Theme onboarding is also a first-launch-only flow and should be skipped whenever `ORCA_THEME` or `~/.orca/theme` already defines a valid preference.

Key ink UI components (18 files in `src/ui/`):

| Component | Purpose |
| --- | --- |
| AlternateScreen | Terminal alternate buffer + SIGCONT resume |
| ScrollBox | Viewport scroll with stickyScroll + PageUp/Down + g/G + mouse wheel |
| InputArea | Multi-line input with Cursor model, kill/yank, paste, history |
| StatusBar | 2-line inverse status: model/cost/branch + context bar/sparkline |
| Banner | Animated orca swimming art + version info |
| ThemePicker | First-launch theme selection that respects persisted preference in `ORCA_THEME` or `~/.orca/theme` |
| Footer | Context-aware keyboard shortcut hints |
| ThinkingSpinner | 204 verbs + stalledIntensity color shift + reduced-motion |
| ToolCallBlock | Graduated error rendering (6 error types) |
| DiffPreview | Inline colored diff for file modifications |
| MarkdownText | highlight.js ANSI syntax highlighting |
| FileLink | OSC 8 clickable file paths |
| PermissionPrompt | Tool permission allow/deny dialog |
| CommandPicker | Slash command autocomplete overlay that only owns the command token, never argument-entry submission, now including `/reflect` |
| MultiModelProgress | Council/race/pipeline progress display |

Hooks and modules:

| Module | Purpose |
| --- | --- |
| useTerminalSize | Reactive terminal dimensions via SIGWINCH |
| useMouseWheel | SGR mouse protocol for wheel scrolling |
| usePasteHandler | Bracketed paste mode detection |
| cursor.ts | Pure-function text editing model (word boundary, kill/yank) |
| theme.tsx | 25 semantic color tokens + dark/light auto-detection |
| session.ts | ChatSessionEmitter: typed event bridge between business logic and UI |

## UX Constraints

- No browser dependency for core workflows
- Provider configuration must stay legible from CLI affordances
- Multi-model output must remain understandable in a terminal session
- Safe mode vs YOLO mode must remain obvious when dangerous actions exist
- Reflect mode must stay explicit and visible when it is force-enabled, and noticeable when auto-triggered
- Detached work must stay observable without forcing manual shell polling
- Model switching should expose enough metadata to prevent obviously bad runtime choices
- Runtime diagnostics should stay available even after the terminal session ends
- The runtime should provide one explicit health-check surface before users fall back to manual file inspection

## Page / Route Equivalents

| Equivalent Surface | Value |
| --- | --- |
| Web pages | `N/A` |
| Primary navigation | top-level commands in `src/program.ts` |
| Secondary navigation | slash commands and options inside REPL / command modules, including `/jobs` for detached work |
| API surface | headless serve mode from `src/commands/serve.ts` |
| Maintainer quality gates | `npm run eval:fast`, `npm run eval:nightly`, `npm run eval:release` |

## REPL Screenshot Journey (2026-04-20)

| Step | User Action | System Response | Evidence |
|---|---|---|---|
| SS-1 | User starts `orca chat` in REPL mode | Orca opens the normal interactive session | CLI REPL |
| SS-2 | User enters one or more local image paths in the prompt text | Orca detects the image files, including quoted paths and shell-escaped spaces | prompt assembly in `chat-input.ts` |
| SS-3 | User includes text plus two or more screenshots | Orca sends a single multimodal turn with all images attached | proxy-path multimodal request |
| SS-4 | User asks a follow-up question about the same screenshots | Orca retains the multimodal user turn in history on the proxy path | preserved proxy history |
| SS-5 | User tries direct clipboard bitmap paste | Not supported yet; user must reference local image files | documented limitation |
