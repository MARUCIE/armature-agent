<div align="center">

# Orca CLI

**Provider-neutral coding agent — 11 providers · 41 tools · MCP server · 6 modes · multi-model collaboration.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-%3E%3D18-green.svg)](https://nodejs.org)
[![Tests](https://img.shields.io/badge/Tests-1595%20passing-brightgreen.svg)](#sota-agent-capabilities)
[![TypeScript](https://img.shields.io/badge/TypeScript-ESM-3178C6.svg)](https://www.typescriptlang.org/)

The one CLI that can do what no single-vendor CLI can: ask Claude, GPT, and Gemini the same question simultaneously, race them, or chain them as specialists. Works with any OpenAI-compatible provider.

</div>

```
       ..:::....
    .::------::::..          Orca  v0.8.2
  .::--========----::::..    provider-neutral agent runtime
.:--==+++*****+++===---::::..
.:-=++**#########**++==---::..
.:-=+*##############*++==--::..   ▸ ~/Projects/my-app
.:-=+*##############*++==-::..    41 tools · 8 hooks
.:-=++**#########**++==---::..
.:--==+++*****+++===---::::..
  .::--========----::::..
    .::------::::..
       ..:::....
```

## Install

```bash
npm install -g orca-cli
```

Any ONE of these keys gets you started:
```bash
export GOOGLE_API_KEY=...        # Google Gemini
export ANTHROPIC_API_KEY=...     # Anthropic Claude
export OPENAI_API_KEY=...        # OpenAI GPT
export POE_API_KEY=...           # Poe (aggregator: all vendors via 1 key)
export OPENROUTER_API_KEY=...    # OpenRouter (aggregator)
export CLOUDFLARE_AI_GATEWAY_API_KEY=...   # Cloudflare AI Gateway (aggregator)
export CLOUDFLARE_AI_GATEWAY_BASE_URL=...  # e.g. https://gateway.ai.cloudflare.com/v1/<account>/<gateway>/compat
# Or let Orca build the URL:
export CLOUDFLARE_ACCOUNT_ID=...
export CLOUDFLARE_AI_GATEWAY_ID=default
```

## Quick Start

```bash
orca chat                                    # interactive REPL
orca chat "explain this codebase"            # one-shot
orca reflect "why is this test still flaky?" # Socratic debugging / root-cause pass
orca review "review the changed files"       # code-review preset
orca debug "reproduce and fix this crash"    # debugging preset
orca architect "plan the refactor"           # architecture/planning preset
orca chat --image screenshot.png "what is broken in this UI?"   # proxy multimodal one-shot
orca run "fix the failing tests"             # task execution
orca run "add tests" --done-when "tests pass"  # goal-loop: repeat until criteria met
orca council "SQL or NoSQL for this?" -n 5   # 5 models + judge
orca race "write a CSV parser"               # first model wins
orca pipeline "build REST API" --stages 5    # plan→code→review→fix→verify
orca stats                                   # token usage + runtime dashboard
orca session list                            # saved sessions
orca session fork my-session my-session-v2   # fork a saved session
orca session export my-session session.json  # export a saved session
orca session import session.json imported    # import a saved session
orca session markdown my-session session.md  # export a session as markdown
orca session share my-session                # create a shareable markdown artifact
orca session handoff my-session my-handoff   # fork a session and emit a handoff artifact bundle
orca queue list --status running             # inspect TaskRun queue state
orca queue show tr-12345678                  # inspect a TaskRun and its evidence
orca queue follow tr-12345678                # stream TaskRun evidence until completion
orca permissions                             # inspect approval mode + policy source + stored rules
orca permissions set auto --scope project    # persist approval mode
orca permissions rules                       # inspect stored project/global permission rules
orca permissions revoke project               # filter and remove one stored rule
orca permissions clear project               # clear all stored project rules
orca permissions normalize project           # rewrite legacy rules into canonical descriptors
orca doctor                                 # runtime/config diagnostics
orca logs errors                             # tail warning/error log
orca pr 123                                  # checkout + review PR
orca serve --port 9100                       # headless HTTP server
orca serve --mcp                             # MCP server over stdio
orca providers                               # list configured providers
```

## VS Code Integration

Orca now includes a zero-dependency VS Code extension skeleton at `integrations/vscode-orca/`.

It provides terminal-backed commands for:

- `Orca: Open Chat`
- `Orca: Analyze Current File`
- `Orca: Review Selection`
- `Orca: Start MCP Server`
- `Orca: Run Doctor`

The extension launches the installed `orca` executable directly instead of shelling out through a quoted command string, so file paths and prompts stay argv-safe.

## Multimodal Images

For OpenAI-compatible proxy providers, `orca chat` accepts local image attachments in both one-shot and REPL flows:

```bash
orca chat --image ./bug.png "describe the issue"
orca chat --image ./screen1.png ./screen2.png "compare these UIs"
orca chat
> compare /tmp/screen-a.png /tmp/screen-b.png
> explain this UI "/tmp/My Screenshot.png"
```

Current scope:

- proxy-provider path only
- local image files are encoded as data URLs and sent as multimodal content parts
- REPL can auto-detect embedded local image paths, including quoted paths and shell-escaped spaces
- GitHub Copilot requests auto-trim tool definitions to the provider's 128-tool limit so `--image` still works even when MCP expands the toolset
- `gpt-5.x` chat-completions requests with function tools automatically drop `reasoning_effort` because Copilot/OpenAI reject that combination on `/v1/chat/completions`
- `--image` one-shot requests skip MCP auto-connect so screenshot analysis is not delayed by unrelated MCP startup
- repo-local/project-scoped MCP configs are loaded but not auto-connected on startup; use `/mcp connect <name>` for explicit opt-in, while trusted home/global MCP configs remain startup-safe
- direct clipboard-image paste into the ink REPL is not yet implemented; use local image file paths for now

## Reflect Mode — `/reflect` or `orca reflect`

`reflect` is Orca's renamed and upgraded take on the Rubber-duck workflow: a focused Socratic debugging and root-cause investigation pass.

```bash
orca reflect "why does this parser drop the last line?"
orca reflect "walk me through this failing test"
```

What `reflect` changes:

- restructures the prompt around symptom → hypotheses → evidence → root cause → next step
- prefers diagnosis and smallest-next-step verification over broad rewrites
- is explicit-first (`orca reflect`, `/reflect`, `/mode reflect`)
- can auto-trigger inside normal chat for clear debugging or explanation asks, with an inline notice when it does

## Multi-Model Collaboration (Unique Feature)

No single-vendor CLI can do this. Orca accesses 11 models from 9 vendors through one API key.

### Council Mode — `/council` or `orca council`

Ask N models the same question. A judge synthesizes the best answer.

```bash
orca council "is this code thread-safe?" -n 3
orca council "review for security issues" -n 5 -j claude-opus-4.6
```

```
╭── Council: 3 models ──╮
● claude-opus-4.6... 4.2s
● gpt-5.4... 2.1s
● gemini-3.1-pro... 3.8s

★ Verdict (claude-opus-4.6 as judge)
  All three agree on the race condition in line 42...
  Confidence: HIGH (3/3 agree)
─ 3 models · 12.1s · agreement: high ─
```

### Race Mode — `/race` or `orca race`

N models race. First good answer wins, rest cancelled.

```bash
orca race "write a quicksort in Python" -n 5
```

### Pipeline Mode — `/pipeline` or `orca pipeline`

Chain models as specialists. Each stage feeds into the next.

```bash
orca pipeline "build auth middleware" --plan claude-opus-4.6 --code gpt-5.4 --review gemini-3.1-pro
```

| Stage | Default Model | Role |
|-------|--------------|------|
| Plan | claude-opus-4.6 | Architecture, data flow, API design |
| Code | gpt-5.4 | Fast implementation |
| Review | gemini-3.1-pro | Bug/security/perf review (2M context) |
| Fix | gpt-5.4 | Address review findings |
| Verify | claude-opus-4.6 | Confirm fix matches plan |

## 11 Providers

Works with any OpenAI-compatible endpoint. Configure in `~/.orca/config.json`:

| Provider | Type | API Key Env |
|----------|------|-------------|
| anthropic | Direct | `ANTHROPIC_API_KEY` |
| google | Direct | `GOOGLE_API_KEY` |
| openai | Direct | `OPENAI_API_KEY` |
| poe | Aggregator | `POE_API_KEY` |
| openrouter | Aggregator | `OPENROUTER_API_KEY` |
| cloudflare / claudeflare | Aggregator | `CLOUDFLARE_AI_GATEWAY_API_KEY` + (`CLOUDFLARE_AI_GATEWAY_BASE_URL` or `CLOUDFLARE_ACCOUNT_ID`) |
| deepseek | Direct | `DEEPSEEK_API_KEY` |
| groq | Direct | `GROQ_API_KEY` |
| xai | Direct | `XAI_API_KEY` |
| copilot | Direct | `GH_TOKEN` |
| local | Direct | (Ollama at localhost:11434) |

**Aggregators** (Poe, OpenRouter, Cloudflare AI Gateway) route to all vendors via one endpoint — ideal for council/race/pipeline.
**Direct** providers connect to each vendor's own API.

Multi-model routing: aggregator first, direct fallback per model.
Local policy in this workspace:

- `council` / `race` / `pipeline` prefer **GitHub Copilot** first
- fallback aggregator order after that is **Cloudflare AI Gateway**
- Poe/OpenRouter remain available, but no longer win auto-selection on this machine

Current local Cloudflare recommendation in the surrounding AI-Fleet runtime:

- default stable model: `openai/gpt-5.4`
- currently verified through Cloudflare on this machine:
  - `openai/gpt-5.4`
  - `google-ai-studio/gemini-3.1-pro-preview`

`orca providers` now shows per-provider context window, approximate pricing, and caution metadata for the default model, and `orca providers test` surfaces the same metadata before connectivity checks.

## Model Diversity (via aggregator)

| Model | Vendor | Strength |
|-------|--------|----------|
| claude-opus-4.6 | Anthropic | Deep reasoning, careful analysis |
| claude-sonnet-4.6 | Anthropic | Fast + capable (default) |
| gpt-5.4 | OpenAI | Fast code generation |
| gemini-3.1-pro | Google | 2M context, multimodal |
| gemini-3.1-flash-lite | Google | Ultra-fast, cheap |
| gemma-4-31b | Google/Meta | Open-source, local-friendly |
| glm-5 | Zhipu | Chinese language excellence |
| grok-4.20-multi-agent | xAI | Multi-agent native |
| qwen3.6-plus | Alibaba | Math, reasoning |
| kimi-k2.5 | Moonshot | Long-context reasoning |
| minimax-m2.7 | MiniMax | Creative generation |

## 41 Agent Tools

Tools the model calls autonomously. Grouped by capability:

| Category | Tools | Count |
|----------|-------|-------|
| File I/O | read, write, edit, multi_edit, patch, delete, move, copy, mkdir, file_info | 10 |
| Search | search, glob, find_definition, find_references, tree, count_lines, tool_search | 7+(1) |
| Git | status, diff, log, commit | 4 |
| Execution | run_command, run_background (`notify_on_complete`), check_port, sleep | 4 |
| Agent/Swarm | spawn_agent, delegate_task | 2 |
| Task Mgmt | task_create, task_update, task_list | 3 |
| Planning | create_plan, verify_plan | 2 |
| Interaction | ask_user, notify_user | 2 |
| Web | fetch_url, web_search | 2 |
| MCP | mcp_list_servers, mcp_list_resources, mcp_read_resource | 3 |
| Notebook | notebook_edit | 1 |

11 tools require confirmation in `--safe` / auto approval mode: write, edit, multi_edit, patch, delete, move, run_command, run_background, git_commit, fetch_url, web_search.

## 8 Lifecycle Hooks

Configure global startup hooks in `~/.orca/hooks.json`. Shell commands receive JSON stdin and return JSON stdout.

Repo-local `.orca` / `.claude` hooks require explicit project trust before loading (`ORCA_TRUST_PROJECT_HOOKS=1` or a trusted `HookManager`). This keeps operator-level hooks startup-safe without letting an arbitrary checked-out repository execute hook commands on launch.

| Hook | When | Can Block? |
|------|------|------------|
| PreToolUse | Before tool execution | Yes (exit 1 = block) |
| PostToolUse | After tool execution | No |
| SessionStart | REPL startup | No |
| SessionEnd | Clean exit | No |
| PreCompact | Before /compact | No |
| PostCompact | After /compact | No |
| UserPromptSubmit | Before prompt to model | Yes |
| SubagentStart | Sub-agent spawn | No |

## 28 Top-Level / Slash Surfaces

| Command | Description |
|---------|-------------|
| `/help` | Show all commands + tips |
| `/model` | Open the interactive model picker in chat/REPL |
| `/models` | Interactive model picker with provider/context/pricing |
| `/model <name>` / `/model set <name>` | Switch model mid-session |
| `/mode` / `/mode <name>` | Open the behavior-mode picker or switch directly |
| `/effort` / `/effort <level>` | Open the reasoning-effort picker or switch directly |
| `/permissions` | Open the approval-mode detail panel + live picker |
| `/permissions rules [session\|project\|global]` | Inspect stored permission rules |
| `orca permissions rules [scope] --status <all\|canonical\|legacy\|unrecognized>` | Filter the rules audit view by rule state |
| `/permissions revoke <scope> [rule]` | Remove one stored permission rule, or filter and pick one interactively |
| `/permissions clear [scope]` | Clear stored permission rules for a scope |
| `/permissions normalize [project\|global\|all]` | Normalize legacy rules into canonical descriptors |
| `/permissions set <mode>` | Set session approval mode |
| `/permissions save [mode] [project\|global]` | Persist approval mode |

Permission rules now use stable canonical descriptors such as `write_file|path=src/generated.ts` and `run_command|command=echo hello` instead of volatile preview text.
Effective runtime permission checks now merge `project` and `global` stored rules.
`permissions rules` now annotates entries as `canonical`, `legacy`, or `unrecognized`, and legacy `::` rules can be normalized explicitly.
`/permissions rules <scope> <status>` and `orca permissions rules --status <status>` can now filter that audit view by rule state.
`/mode` now explains what each workflow profile changes instead of only listing mode names.
Top-level workflow presets now resolve from the same preset registry that binds command name, description, and `initialModeId`.
Workflow presets now also carry default policy fields such as `effort` and `permission mode`.
Switching into a preset-backed workflow profile now applies those default `effort` / `permission mode` values instead of only changing the mode label.
`/mode` now shows those preset defaults directly in the picker description.
Preset policy application is now handled through one shared helper for startup and `/mode` switching paths.
The same startup helper now shapes the initial system prompt for preset-backed one-shot and REPL sessions, so top-level preset commands no longer drift from in-session mode switches.
`/status` and the REPL status bar now surface the current workflow policy (`mode + effort + permissions`).
Workflow presets now also expose `tool policy` and `output style`, and `/mode` plus `/status` surface them directly.
The live `StatusBar` now includes compact `tools:` / `out:` summaries when a preset provides them.
`/status` now also exposes `model policy`, and the live `StatusBar` includes a compact `model:` summary when present.
Active mode tool restrictions are now enforced in the proxy tool runtime, not only described in prompt text.
`/effort` and preset default effort now also map into proxy `reasoning_effort` requests (`max` → `xhigh`) instead of remaining UI-only state.
Provider-returned `tool_calls` are now rejected unless the tool was explicitly advertised for that request, including the zero-tools case.
Non-interactive permission prompts now fail closed instead of silently auto-approving.
The current REPL session now keeps a stable `sessionId`, `/status` surfaces it directly, `orca -c <id>` resumes a specific saved session, the default `orca run` path now creates durable `WorkSession` / `TaskRun` objects, and `orca serve` exposes both saved-session and run-continuity discovery endpoints.
Those continuity endpoints are intended for local or otherwise trusted deployments; `serve` no longer grants wildcard CORS, and session/task metadata endpoints are loopback-only.
| `/reflect <prompt>` | Socratic debugging / root-cause investigation |
| `/council <prompt>` | Multi-model council |
| `/race <prompt>` | Multi-model race |
| `/pipeline <prompt>` | Multi-model pipeline |
| `/clear` | Clear conversation |
| `/compact` | Keep last 2 turns |
| `/system <prompt>` | Set system prompt |
| `/diff` | Show git diff |
| `/git <cmd>` | Run git command |
| `/save [name]` | Save session |
| `/load [name]` | Load session |
| `/thread export <id> <file>` | Export thread JSON |
| `/thread markdown <id> <file>` | Export thread Markdown |
| `/thread share <id> [file]` | Create a shareable thread artifact bundle |
| `/thread import <file> [title]` | Import thread JSON |
| `/thread handoff <id> [title]` | Create a handoff copy plus handoff artifact bundle |
| `/sessions` | List saved sessions |
| `/jobs` | List tracked background jobs |
| `/undo` | Revert last file write |
| `/hooks` | Show registered hooks |
| `/retry` | Retry last message |
| `/history` `/tokens` `/stats` | Session metrics |
| `/cwd` | Working directory |
| `/exit` | Exit with summary |

## Runtime Logs

Orca writes local runtime logs under `~/.orca/logs/` or `$ORCA_HOME/logs/`:

- `agent.log` — info, warn, error
- `errors.log` — warn, error only

Use:

```bash
orca logs
orca logs errors
orca logs --lines 100
```

## Doctor

Run a local runtime health check:

```bash
orca doctor
orca doctor --json
orca doctor --cwd ~/Projects/my-app
```

`orca doctor` now reports malformed project/global JSON config files explicitly, instead of forcing users to infer the problem from scattered stderr warnings.

## Serve Runtime Metadata

`orca serve` now exposes the same runtime metadata surfaces as the CLI:

- `GET /health` — provider + model metadata
- `GET /providers` — provider list with model metadata
- `GET /doctor` — structured runtime diagnostics
- `GET /sessions`, `GET /sessions/latest`, `GET /sessions/:id` — saved-session continuity discovery
- `GET /work-sessions`, `GET /work-sessions/latest`, `GET /work-sessions/:id` — run-surface work-session discovery
- `GET /work-sessions/:id/task-runs`, `GET /task-runs`, `GET /task-runs/:id` — task-run inspection

When `serve` binds to a non-loopback host, `ORCA_SERVE_TOKEN` is now required and HTTP requests must send `Authorization: Bearer <token>`.
`serve --mcp` now runs tool calls through the same shared policy layer used by the chat path for hooks, tool filtering, approval checks, and sandbox posture.
In the Ink TUI empty state, `Tab` now opens quick actions so the operator can launch common prompts or diagnostics without typing the full command first.

## Stats Dashboard

`orca stats` now combines:

- usage and cost summary
- per-model breakdown
- runtime health snapshot from `doctor`
- recent error log tail

## Release Quality Gates

Orca now ships a manifest-driven SOTA gate system for maintainers:

```bash
npm run eval:fast
npm run eval:nightly
npm run eval:release
```

- `eval:fast` runs the local black-box operator pack
- `eval:nightly` adds deterministic repo verification (`lint` / `test` / `build`)
- `eval:release` adds `bench` plus a recorded CLI journey artifact under `agent-eval/runs/<run_id>/`

Repo-native layered test entrypoints now also exist:

```bash
npm run test:static
npm run test:unit
npm run test:contract
npm run test:integration
npm run test:e2e
npm run test:security
npm run test:resilience
npm run test:performance
npm run test:ai-eval-fast
npm run test:matrix
npm run test:matrix:sync
```

`npm run test:matrix` writes a fresh evidence bundle under `outputs/test-matrix/run-<timestamp>/`.
The layer metadata now lives in `agent-eval/manifests/test-matrix.json`, and the package scripts are thin wrappers around the matrix runner.
The manifest now stores typed `steps[].argv` entries, and the runner executes them without shell interpolation.
`npm run test:matrix:sync` verifies that `package.json` layer scripts and `agent-eval/generated/test-matrix-entrypoints.md` are still in sync with the manifest.

## Permission Modes

| Mode | Flag | Default |
|------|------|---------|
| `auto` | (default) | **Yes** — prompt on dangerous tools only |
| `plan` | set explicitly | No — prompt on every tool call |
| `yolo` | set explicitly | No — bypass prompts |

The legacy config value `default` now resolves to the safer REPL posture `auto`, not `yolo`.
The shared policy executor now also covers MCP tool execution, so dangerous MCP tool calls fail closed unless already granted by policy.

## Streaming Markdown

- Code blocks: box-drawing borders (╭╮╰╯│) + syntax highlighting (JS/TS, Python, Shell, JSON)
- Inline: **bold**, *italic*, `code` (dark background)
- Lists, blockquotes, headings, links, horizontal rules

## SOTA Agent Capabilities

Features that close the gap between "tool" and "agent":

| Capability | What It Does | Why It Matters |
|-----------|-------------|----------------|
| Project Context Loader | Auto-detects type, framework, test runner, deps | Agent knows the project from turn 1 |
| Smart Output Truncation | 8K limit with summary header (line count + file list) | Prevents context pollution from large grep results |
| Oversized Tool Result Persistence | Saves full oversized output to `~/.orca/tool-results/` and returns an artifact path | Prevents destructive truncation while keeping context small |
| Error Self-Correction | Failed tools return recovery hints ("use read_file first") | Model self-corrects without human intervention |
| Tool Argument Coercion | Normalizes stringified numbers, booleans, and arrays to tool schema types | Improves GPT/Codex tool-call reliability |
| Provider-Aware Model Catalog | `/model` and `/models` surface provider, context window, approximate pricing, and cautions | Makes live model switching safer and more informed |
| Tiered SOTA Gate System | Manifest-driven `fast` / `nightly` / `release` bundles with auditable run artifacts | Turns release verification into a repeatable system instead of ad hoc shell history |
| Shell Injection Protection | All user inputs shellEscaped before exec | Security baseline for production agent |
| Unlimited Agent Loop | Auto-continue on truncation, incomplete text detection | Tasks complete without artificial limits |
| Multi-edit Atomicity | Failed batch edits leave file unchanged | No partial corruption on error |
| Background Completion Notifications | `run_background` jobs notify the REPL when they finish, and `/jobs` shows tracked state | Agent can keep working without manual PID polling |

Tested: 1595 automated tests, fast gate `63/63`, nightly gate `66/66`, release gate `69/69`.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Orca CLI  v0.8.2                                   │
│  TypeScript ESM CLI · 86 test files · 1595 tests    │
├─────────────────────────────────────────────────────┤
│  Command Layer                                      │
│  chat · run · council · race · pipeline · serve     │
├─────────────────────────────────────────────────────┤
│  Runtime / Config / Provider Bridge                 │
│  OpenAI-compat · doctor · stats · session · logs    │
├─────────────────────────────────────────────────────┤
│  Multi-Model Engine                                 │
│  council · race · pipeline · provider-aware routing │
├─────────────────────────────────────────────────────┤
│  Agent Runtime                                      │
│  41 tools · 8 hooks · safe/YOLO · background jobs   │
├─────────────────────────────────────────────────────┤
│  ink Terminal UI                                    │
│  ScrollBox · InputArea · StatusBar · DiffPreview    │
├─────────────────────────────────────────────────────┤
│  Verification System                                │
│  Vitest + bench + manifest-driven fast/nightly/     │
│  release gates with auditable agent-eval artifacts  │
└─────────────────────────────────────────────────────┘
```

## Configuration

```
CLI flags  >  ENV vars  >  .orca.json  >  ~/.orca/config.json
```

## Contributing

Contributions welcome. Please open an issue to discuss before submitting large PRs.

```bash
git clone https://github.com/MARUCIE/orca-cli.git
cd orca-cli
npm install
npm run build
npm test
npm run eval:fast
```

## License

MIT

---

<p align="center"><sub>Maurice | maurice_wen@proton.me</sub></p>
