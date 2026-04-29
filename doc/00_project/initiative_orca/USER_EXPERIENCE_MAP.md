# Orca CLI User Experience Map

## 2026-04-29 UX Delta - Queue and Trust

New operator journeys:

| Journey | User Need | Entry | Evidence |
| --- | --- | --- | --- |
| Inspect running/completed agent work | See current TaskRun queue without opening raw files | `orca queue list`, `orca queue show <id>` | `src/commands/queue.ts`, `tests/queue-command.test.ts` |
| Follow live TaskRun evidence | Stream appended evidence logs until a TaskRun reaches a terminal state | `orca queue follow <id>` | `src/commands/queue.ts`, `tests/queue-command.test.ts` |
| Trust project hooks explicitly | Prevent arbitrary checked-out repos from running startup hook shell commands | `ORCA_TRUST_PROJECT_HOOKS=1` or trusted `HookManager` | `src/hooks.ts`, `tests/hooks.test.ts` |
| Approve network-capable tools | Treat outbound fetch/search as a trust boundary | permission prompt for `fetch_url` / `web_search` | `src/tools.ts`, `tests/chat-proxy-tool-call.test.ts` |

Open UX work:

- Add `queue takeover` for lease-based operator control.
- Add an evidence drawer to the TUI so review-before-apply is not limited to compact previews.

<!-- AI-FLEET:PROJECT_DIR:START -->
- `PROJECT_DIR`: `/Users/mauricewen/Projects/orca-cli`
<!-- AI-FLEET:PROJECT_DIR:END -->

## Experience Model

Orca CLI is a command-first product. User journeys are structured around terminal entry points, not URLs.

## Journey Map

| Journey | User Intent | Command / Entry | Source |
| --- | --- | --- | --- |
| Onboard | Configure a provider and initialize usage | `orca init`, env vars, config files | `src/commands/init.ts`, `src/config.ts` |
| Explore interactively | Ask questions or operate in a REPL | `orca`, `orca chat`, `orca -c [id]` | `src/bin/orca.ts`, `src/commands/chat.ts`, `src/commands/session.ts` |
| Run operator-wide session automation | Apply personal runtime hooks such as terminal-title sync across all projects | `~/.orca/hooks.json` + `orca` | `src/hooks.ts` |
| Reflect on a bug or confusing code path | Run a focused rubber-duck-style diagnosis pass with explicit and persistent entrypoints | `orca reflect`, `/reflect`, `/mode reflect` | `src/commands/chat.ts`, `src/commands/reflect-mode.ts`, `src/modes/registry.ts` |
| Enter a workflow preset explicitly | Jump straight into code review, debugging, or architecture/planning without first switching `/mode` manually | `orca review`, `orca debug`, `orca architect` | `src/commands/chat.ts`, `src/program.ts`, `src/modes/registry.ts` |
| Analyze local images | Send one or more local screenshots/images with a text instruction through the proxy path | `orca chat --image <path...> "prompt"` | `src/commands/chat.ts`, `src/providers/openai-compat.ts` |
| Diagnose the runtime | Check config/provider/hook/MCP/session/log state before debugging by hand | `orca doctor` | `src/commands/doctor.ts`, `src/doctor.ts` |
| Connect repo-scoped MCP deliberately | Review discovered MCP servers, then opt into a project-scoped server instead of auto-spawning it on startup | `/mcp connect <name>` | `src/commands/chat.ts`, `src/mcp-client.ts` |
| Pick a model safely | Inspect provider, context window, approximate pricing, and caution notes before switching; `/model` opens the picker and `/model <name>` switches directly | `/model`, `/models` | `src/commands/chat.ts`, `src/model-catalog.ts` |
| Switch behavior profile | Use a picker for finite built-in/custom modes instead of memorizing mode ids, with a visible summary of what each workflow profile changes | `/mode`, `/mode <id>` | `src/commands/chat.ts`, `src/modes/registry.ts` |
| Tune reasoning depth | Use a picker for low/medium/high/max effort levels or switch directly by name | `/effort`, `/effort <level>` | `src/commands/chat.ts` |
| Inspect and persist approval mode | Make trust/approval policy explicit instead of relying on hidden defaults or hotkeys; expose live mode, policy source, stored allowlist counts, and legacy-rule maintenance in one operator surface | `orca permissions`, `orca permissions rules`, `orca permissions revoke`, `orca permissions clear`, `orca permissions normalize`, `/permissions`, `/permissions rules`, `/permissions revoke`, `/permissions clear`, `/permissions normalize` | `src/commands/permissions.ts`, `src/commands/chat-slash-mutations.ts`, `src/config.ts` |
| Check providers before starting | Inspect provider readiness and default-model metadata before entering a session | `orca providers`, `orca providers test` | `src/commands/providers.ts`, `src/model-catalog.ts` |
| Inspect runtime logs | Read recent info/warn/error entries without opening files manually | `orca logs`, `orca logs errors` | `src/commands/logs.ts`, `src/logger.ts` |
| Review runtime dashboard | See usage, runtime health, and recent error signals in one place | `orca stats` | `src/commands/stats.ts`, `src/doctor.ts`, `src/logger.ts` |
| Inspect continuity state headlessly | Query the saved-session object set before attaching a richer client | `orca serve` + `GET /sessions|/sessions/latest` | `src/commands/serve.ts`, `src/session-store.ts` |
| Inspect run continuity state headlessly | Query durable run objects created by the default `orca run` path | `orca serve` + `GET /work-sessions*`, `GET /task-runs*` | `src/commands/serve.ts`, `src/work-session-store.ts` |
| Resume a specific saved session | Continue an exact durable session object instead of only “latest” | `orca -c <id>` | `src/commands/chat.ts`, `src/commands/session.ts` |
| Inspect one saved session headlessly | Read a single durable session object before designing take-over/resume | `orca serve` + `GET /sessions/:id` | `src/commands/serve.ts`, `src/session-store.ts` |
| Plan quality expansion | Turn the current automated baseline into a larger SOTA test program with explicit task / grader ownership | `AGENT_EVAL_PLAN.md`, `agent-eval/manifests/*.json` | repo root plan + manifest-based gate workflow |
| Run fast / nightly / release gates | Execute reproducible SOTA bundles and collect auditable artifacts under one runner | `npm run eval:fast`, `npm run eval:nightly`, `npm run eval:release` | `package.json`, `agent-eval/scripts/run-gate.py`, `agent-eval/manifests/*.json` |
| Inspect headless runtime state | Query health/provider/doctor metadata over HTTP before attaching a client | `orca serve` + `GET /health|/providers|/doctor` | `src/commands/serve.ts`, `src/doctor.ts`, `src/model-catalog.ts` |
| Launch from IDE | Start Orca chat/doctor/MCP from VS Code without hand-writing terminal commands | VS Code commands from `integrations/vscode-orca/` | `integrations/vscode-orca/package.json`, `integrations/vscode-orca/extension.js` |
| Execute work | Run a coding or analysis task | `orca run` | `src/commands/run.ts` |
| Compare models | Get multiple opinions or race for speed | `orca council`, `orca race`, `orca pipeline` | `src/commands/multi.ts`, `src/multi-model.ts` |
| Inspect routing | Check configured providers | `orca providers` | `src/commands/providers.ts` |
| Review cost and sessions | Inspect usage history and saved sessions | `orca stats`, `orca session` | `src/commands/stats.ts`, `src/commands/session.ts` |
| Move session artifacts across contexts | fork / export / import / markdown-share / handoff saved sessions for branching and portability, with metadata sidecars for collaboration artifacts | `orca session fork|export|import|markdown|share|handoff` | `src/commands/session.ts`, `src/session-store.ts` |
| Move thread artifacts across contexts | export / markdown / share / import / handoff collaborative thread records, with metadata sidecars and handoff bundles | `/thread export|markdown|share|import|handoff` | `src/commands/chat-slash-mutations.ts`, `src/memory/threads.ts` |
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

### 1a. Entry / Home Panel Flow

1. User opens the REPL with no prior output on screen.
2. Orca shows the banner plus a dedicated home panel instead of a long flat command list.
3. The home panel emphasizes one primary action: type a concrete task and press Enter.
4. Secondary panels expose:
   - trust/state
   - quick recovery paths
   - failure help
5. `Tab` opens a quick-action picker for high-frequency prompts and diagnostics.
6. The goal is to make the entry screen usable without memorizing slash commands while keeping the prompt bar as the single primary action.

### 1a. Reflect Flow

1. User invokes `orca reflect`, `/reflect ...`, or switches the session with `/mode reflect`.
2. `src/commands/reflect-mode.ts` rewrites the prompt into a structured reflection contract: symptom, hypotheses, evidence, root cause, next step.
3. `src/commands/chat.ts` reuses the normal agent/tool loop, but with reflect-specific prompt shaping and mode guidance.
4. For clear debugging or explanation prompts in standard `orca chat`, Orca can conservatively auto-trigger reflect and shows an inline notice when it does.

### 1aa. Workflow Preset Flow

1. User invokes `orca review`, `orca debug`, or `orca architect`.
2. `src/program.ts` registers each preset as a top-level command backed by `createChatCommand(...)`.
3. The command enters `chat` with an `initialModeId`, so the session starts directly inside the matching built-in mode.
4. The operator can still switch modes later with `/mode`, but the initial entry cost is reduced for high-frequency workflows.

### 1b. Model Selection Flow

1. User invokes `/model` or `/models`.
2. `src/model-catalog.ts` derives model metadata from config + known model hints.
3. Ink REPL opens a provider-first picker, then a model picker scoped to that provider; duplicate model names are carried as provider+model keys so Poe/Copilot/OpenAI variants do not resolve to the wrong backend.
4. Long picker lists are windowed instead of rendered as one dense wall; legacy mode still renders a numbered fallback list grouped by provider.
5. If a cautionary model is selected, the REPL warns immediately instead of failing later through degraded tool use.

### 1c. Mode And Effort Picker Flow

1. User invokes `/mode` or `/effort` without arguments.
2. `src/commands/chat.ts` opens a shared option picker in ink mode rather than printing static text instructions.
3. `/mode` descriptions now summarize the workflow delta for each profile, not just the mode name.
4. The summary text now comes from the same registry that defines top-level workflow presets, reducing description drift.
5. Workflow presets now also define structured default policy fields such as `effort` and `permission mode`, rather than relying only on free-text descriptions.
6. `/mode` picker descriptions now surface those preset defaults directly, instead of hiding them behind command docs.
7. When a selected mode is backed by a workflow preset, Orca also applies the preset's default `effort` / `permission mode` values.
8. Startup and `/mode` switching now use one shared preset-policy application path, and the startup path composes the initial system prompt from mode + preset + effort.
9. Workflow presets now also carry `tool policy` and `output style`, and `/mode` descriptions surface them directly.
10. Active mode tool restrictions are now enforced in the proxy tool runtime instead of depending only on prompt obedience.
11. `/effort` and preset default effort now also flow into proxy `reasoning_effort`, instead of remaining UI-only state.
12. `/status` and the live status bar now surface the current `mode + effort + permissions` combination instead of only the mode label, while `/status` additionally exposes `tool policy` and `output style`.
13. `model policy` is now also exposed in `/status`, and the live `StatusBar` shows a compact `model:` summary when a preset provides it.
14. The live `StatusBar` now shows compact `tools:` / `out:` summaries when a preset provides them.
15. The picker returns the selected mode id or effort level immediately, and the status bar updates in place.

### 1d. Permission / Trust Flow

1. User invokes `orca permissions` or `/permissions`.
2. `orca permissions` shows the current effective approval mode, persisted project/global config values, rule counts, and the user-facing meaning of each mode.
3. Ink `/permissions` opens a detail panel plus a live picker for `yolo` / `auto` / `plan` and save-to-project/global actions.
4. `/permissions set` updates the live REPL policy immediately; `/permissions save` or `orca permissions set --scope ...` persists it to config.
5. `plan` mode now requests approval for every tool; `auto` requests approval only for dangerous tools; `yolo` bypasses prompts.
6. The legacy persisted config value `default` now resolves to `auto`, so a fresh session no longer starts in fail-open `yolo`.
7. MCP tool execution now goes through the same shared policy executor for hooks, tool filtering, approval checks, and sandbox posture; dangerous tools fail closed when no grant exists.
8. Repo-local MCP is no longer auto-connected on startup; only home/global-scoped MCP is startup-safe, and project-scoped MCP requires explicit operator connect.
8. Permission prompts now support `allow once`, `allow session`, `allow project`, and `deny`, so approvals can be promoted into session/project policy inline.
9. `orca permissions rules` and `/permissions rules` expose stored session/project/global rule entries rather than only a count.
10. `orca permissions revoke|clear` and `/permissions revoke|clear` let the operator remove one rule or clear a scope instead of editing config files manually; revoke now supports filter-and-pick selection when the exact rule key is not supplied.
11. Stored permission rules now use stable canonical descriptors such as `write_file|path=...` and `run_command|command=...`, which makes persistence less sensitive to preview formatting changes.
12. `orca permissions normalize` and `/permissions normalize` rewrite legacy preview-style rules into canonical descriptors instead of leaving them mixed forever.
13. `permissions rules` now annotates rule state (`canonical`, `legacy`, `unrecognized`) and shows the normalized target for legacy entries.
14. Legacy `::` rules are explicitly supported by the normalize flow instead of being stranded forever as opaque leftovers.
15. `permissions rules` now supports filtering by state (`all`, `canonical`, `legacy`, `unrecognized`) for faster audits.
16. Effective runtime permission checks now merge `project` and `global` stored rules instead of only consuming project rules.
17. Status/footer hints expose the current permission source (`session`, `project`, `global`, `env`, `flag`, `default`) so the active policy is auditable in-session.

### 1e. Provider Inspection Flow

1. User invokes `orca providers` or `orca providers test`.
2. `src/commands/providers.ts` resolves configured providers and decorates them with model-catalog metadata.
3. The CLI shows readiness plus context/pricing/caution data before the user commits to a session or connectivity test.

### 1f. Doctor Flow

1. User invokes `orca doctor`.
2. `src/doctor.ts` gathers provider, project, hook, MCP, session, background-job, and log diagnostics.
3. The command emits either a human-readable health summary or JSON for automation.

## Benchmark-Derived Target Journeys (2026-04-21)

These are not fully shipped yet; they are the next continuity targets derived from the SOTA benchmark set.

| Target Journey | User Intent | Expected Future Surface | Strongest Benchmark References |
| --- | --- | --- | --- |
| Resume work across terminal / web / IDE | Start in one surface, continue in another without rebuilding context | durable session object + shared session id + resumable web/IDE handoff | Codex, Cursor, OpenCode, GitHub Copilot |
| Inspect async execution before taking over | Review what a detached agent already did before resuming locally | queue / agent list + status + timeline + take-over action | Cursor background agents, GitHub Copilot cloud agent, OpenCode web |
| Review agent output through evidence rather than trust | Read logs, session history, and change evidence before merge/apply | evidence console with logs, timeline, artifacts, and diff links | GitHub Copilot, Claude Code, Cursor Bugbot |
| Share a durable investigation / implementation thread | Hand off work with state, not just prose summary | shareable session/thread artifact with optional hosted continuation | Amp, OpenCode, Codex |

The first shipped foothold for these journeys is now a stable REPL `sessionId` plus headless session-discovery endpoints.
The 2026-04-21 swarm audit adds one sharper constraint to these journeys: they do not close until Orca exposes leaseable session/task objects, queue inspection/take-over, review-grade evidence bundles, and a trust model shared across REPL / MCP / serve.
4. Malformed local JSON config files are called out explicitly instead of being hidden in generic stderr noise.

### 1g. Serve Metadata Flow

1. User starts `orca serve`.
2. HTTP clients can call `/health`, `/providers`, and `/doctor`.
3. The headless server returns the same provider/runtime metadata already exposed in the CLI surfaces.

### 1h. Session Continuity Discovery Flow

1. The REPL now assigns a stable `sessionId` to the current conversation and reuses the restored id on `--continue`.
2. `orca -c` resumes the latest session, and `orca -c <id>` resumes a specific saved session object by id.
3. `/status` and the live status bar expose that id so the operator can anchor follow-up actions to the same object.
4. `orca serve` exposes `GET /sessions`, `GET /sessions/latest`, and `GET /sessions/:id` so a future web/IDE client can discover and inspect the durable session object set.
5. This is the first continuity surface, not the final hosted continuity workflow.
6. The next continuity step is not another metadata endpoint; it is a real `WorkSession` / `TaskRun` model with queue/take-over semantics and evidence links.
7. The first shipped `WorkSession` / `TaskRun` slice now covers the default `orca run` path and is inspectable through `serve`.
8. If `serve` binds to a non-loopback host, `ORCA_SERVE_TOKEN` is now required and HTTP requests must present a bearer token.

### 1i. Stats Dashboard Flow

1. User invokes `orca stats`.
2. `src/commands/stats.ts` reads usage history from SQLite.
3. The command merges in runtime health from `doctor` and recent errors from the local logger.
4. The user sees both cost metrics and operational state in a single output.

### 1j. Runtime Log Flow

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

### 4a. Session Portability Flow

1. User invokes `orca session fork`, `orca session export`, `orca session import`, `orca session markdown`, `orca session share`, or `orca session handoff`.
2. `src/commands/session.ts` delegates to `src/session-store.ts`.
3. The runtime clones, serializes, or imports a saved session record without mutating the source record in place.
4. Shared and handoff session artifacts emit both human-readable Markdown and a metadata sidecar for downstream reuse.

### 4b. Thread Portability Flow

1. User invokes `/thread export`, `/thread markdown`, `/thread share`, `/thread import`, or `/thread handoff`.
2. `src/commands/chat-slash-mutations.ts` delegates to `ThreadManager`.
3. Orca writes/loads JSON thread artifacts and can create a handoff clone with source metadata.
4. Share/handoff flows emit Markdown plus metadata sidecars so artifacts stay portable and auditable.

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
| HomePanel | Entry-state onboarding shell with one primary action, trust/state summary, quick paths, and failure help |
| ThemePicker | First-launch theme selection that respects persisted preference in `ORCA_THEME` or `~/.orca/theme` |
| OptionPicker | Shared finite-choice picker for model/mode/effort and tool-side multiple-choice prompts |
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
