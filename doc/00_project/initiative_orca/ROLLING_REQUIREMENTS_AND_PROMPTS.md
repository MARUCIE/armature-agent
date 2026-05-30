---
Title: Rolling Requirements And Prompts
Scope: rolling requirements ledger
Owner: Maurice
Status: Active
LastUpdated: 2026-05-29
---
# Rolling Requirements And Prompts

## 2026-05-03 - Claude Code Parity UX Audit

### Requirements

| ID | Type | Requirement | Status | Evidence |
| --- | --- | --- | --- | --- |
| REQ-20260503-010 | UX | Active Orca tasks must be interruptible with Claude-style Esc/Ctrl-C behavior | Done | `src/ui/keybindings.ts`, `src/ui/components/InputArea.tsx`, `src/providers/openai-compat.ts`, `tests/ink-ui.test.tsx` |
| REQ-20260503-011 | UX | Slash commands must clear from the input after dispatch | Done | `src/ui/components/App.tsx`, `tests/ink-ui.test.tsx` |
| REQ-20260503-012 | Command Surface | Daily Claude-compatible aliases and context/copy/export/rewind commands must be available | Done | `src/slash-commands.ts`, `src/commands/chat-slash-mutations.ts`, `src/commands/chat-slash-readonly.ts` |
| REQ-20260503-013 | Discoverability | `/memory`, `/skills`, `/agents`, and dynamic `/` picker capability entries must expose project/user context without running arbitrary code | Done | `src/slash-picker-items.ts`, `src/agent-specs.ts`, `tests/slash-picker-items.test.ts` |
| REQ-20260503-014 | Discoverability | Configured MCP servers must be discoverable from `/` and inspectable through `/mcp <name>` without auto-starting project-scoped servers | Done | `src/mcp-client.ts`, `src/slash-picker-items.ts`, `src/commands/chat-slash-mutations.ts`, `tests/mcp-client.test.ts` |

### Prompt Ledger

| ID | Prompt / Trigger | Routing | Output |
| --- | --- | --- | --- |
| PROMPT-20260503-010 | `orca 已开始的任务 无法按esc终止；学习下claude code 的快捷键体系，全部实现` | Claude Code official-doc parity audit + terminal UX implementation | Added keybinding metadata, abort propagation, and regression coverage |
| PROMPT-20260503-011 | `不是更宽容，是和claude code 一样` | behavior alignment correction | Kept Esc/Ctrl-C semantics aligned to Claude-like interrupt behavior instead of permissive variants |
| PROMPT-20260503-012 | `输入slash command之后，执行之后，命令应该会消失，为什么我输入后一直存在` | input lifecycle bug fix | Cleared slash input after command dispatch and added command-picker regression coverage |
| PROMPT-20260503-013 | `对标claude code ，目前orca 还有哪些功能或体验跟不上的，执行全面审计和优化` | official-doc parity audit + optimization pass | Produced Claude parity audit report and implemented aliases, context/copy/export/rewind, memory/skills/agents, and dynamic picker improvements |
| PROMPT-20260503-014 | `继续` | follow-on command surface optimization | Added dynamic MCP server picker entries and read-only `/mcp <name>` detail panels while preserving startup-safe MCP policy |

### Anti-Regression Q&A

| Question | Expected Answer | Guard |
| --- | --- | --- |
| Should Esc only edit local input while a model/tool turn is active? | No. It must request cancellation for the active turn. | `tests/ink-ui.test.tsx`, `tests/chat-repl-turn.test.ts` |
| Should a submitted slash command remain in the input box? | No. After dispatch, the input draft must clear. | `tests/ink-ui.test.tsx` |
| Should `/` picker list only hardcoded built-ins? | No. It should lazily include discovered skills and custom agent specs as read-only entrypoints. | `tests/slash-picker-items.test.ts` |
| Should showing configured MCP servers in `/` start project MCP processes? | No. Picker discovery reads config files only; project MCP servers still require explicit `/mcp connect <name>`. | `tests/mcp-client.test.ts`, `tests/slash-picker-items.test.ts` |

## 2026-05-03 - Markdown Artifact Write Integrity

### Requirements

| ID | Type | Requirement | Status | Evidence |
| --- | --- | --- | --- | --- |
| REQ-20260503-001 | Reliability | False-save repair must write only the generated Markdown artifact body, not assistant conversation text | Done | `src/commands/local-file-intent.ts`, `tests/local-file-intent.test.ts` |
| REQ-20260503-002 | Reliability | False-save repair must not create a file when the provider returned only save-confirmation chatter and no artifact body | Done | `tests/local-file-intent.test.ts` |
| REQ-20260503-003 | Prompt | System prompt must state that `write_file.content` is the final requested file body only | Done | `src/system-prompt.ts`, `tests/e2e-workflow.test.ts` |

### Prompt Ledger

| ID | Prompt / Trigger | Routing | Output |
| --- | --- | --- | --- |
| PROMPT-20260503-001 | `每次都把对话内容打印到md文件，而不是按的要求生成一个md 文件，去生成内容` | local-file repair root cause | Fixed false-save repair to extract artifact content only and refuse no-artifact chat text |
| PROMPT-20260503-002 | `为什么出现这种低级错误，是工具调用的问题吗` | root-cause explanation | Classified the bug as tool-orchestration repair content selection, not low-level file tool execution |

### Anti-Regression Q&A

| Question | Expected Answer | Guard |
| --- | --- | --- |
| Should false-save repair write the whole assistant response into a `.md` file? | No. It may write only extracted artifact body content. | `tests/local-file-intent.test.ts` |
| Should Orca create a Markdown file from a response that only says it saved the file? | No. Without extractable artifact content, repair must return `null`. | `tests/local-file-intent.test.ts` |
| Is this a low-level `write_file` tool execution failure? | No. The file tools work; the bug was in repair-layer content selection before calling `write_file`. | `tests/chat-internals.test.ts` |

## 2026-05-02 - Tool-Call Continuity and Blackfin Mark

### Requirements

| ID | Type | Requirement | Status | Evidence |
| --- | --- | --- | --- | --- |
| REQ-20260502-024 | Reliability | Streamed provider turns must include the current Orca system prompt even when chat history exists | Done | `src/providers/openai-compat.ts`, `tests/openai-compat-multimodal.test.ts` |
| REQ-20260502-025 | Reliability | Local file create/open requests must use local file tools before claiming local access is impossible | Done | `src/system-prompt.ts`, `tests/e2e-workflow.test.ts` |
| REQ-20260502-026 | Quality | Tool-call regressions must live in the canonical large-scale test matrix | Done | `agent-eval/manifests/test-matrix.json`, `agent-eval/generated/test-matrix-entrypoints.md`, `package.json` |
| REQ-20260502-027 | UI | Startup identity must use a dominant `ORCA-AGENT` wordmark and clean Blackfin Signal deck with no independent mascot/icon/hero art | Done | `src/ui/components/Banner.tsx`, `tests/ink-ui.test.tsx` |
| REQ-20260502-028 | Reliability | Obvious REPL local-file read/write/open intents must execute deterministic local tool plans before calling the provider | Done | `src/commands/local-file-intent.ts`, `src/commands/chat-repl-turn.ts`, `tests/local-file-intent.test.ts`, `tests/chat-repl-turn.test.ts` |
| REQ-20260502-029 | Reliability | A provider false-save claim must be repaired by writing the claimed path when no file tool ran | Done | `src/commands/chat.ts`, `tests/chat-internals.test.ts` |
| REQ-20260502-030 | Reliability | Proxy default tool definitions must be both advertised and allowed by policy so tools are not blocked after being exposed to the model | Done | `src/commands/chat.ts`, `tests/chat-internals.test.ts` |
| REQ-20260502-031 | UI | The startup Banner must explicitly delete the separate Orca icon/hero block after operator rejection | Done | `src/ui/components/Banner.tsx`, `tests/ink-ui.test.tsx` |

### Prompt Ledger

| ID | Prompt / Trigger | Routing | Output |
| --- | --- | --- | --- |
| PROMPT-20260502-008 | `还是不能自动打开文件，也没生成文件` | root-cause continuation | Fixed long-session system prompt decay and strengthened local-file tool contract |
| PROMPT-20260502-009 | `同时把所有工具调用测试放到原来的大规模测试计划里...orca的图标还没改过来，要向hermes agent 学习` | test-matrix + UI identity continuation | Added `test:tool-calls` matrix layer and replaced the banner mascot with a clearer Blackfin mark |
| PROMPT-20260502-010 | `orca 的logo 还是老得，要学习hermes agent` | UI identity correction | Replaced the old compact `ORCA` wordmark with a dominant `ORCA-AGENT` wordmark; the later hero panel is superseded by `PROMPT-20260502-012` |
| PROMPT-20260502-011 | `文件还是不能读写和生成和打开？` | runtime repair continuation | Added pre-model local-file intent execution, post-response false-save repair, and local-file guard tests in the canonical tool-call matrix |
| PROMPT-20260502-012 | `把orca 的图标删除把，太难看了` | UI correction | Removed the independent startup icon/hero art and kept a clean wordmark + state deck |

### Anti-Regression Q&A

| Question | Expected Answer | Guard |
| --- | --- | --- |
| Can later REPL turns omit the system prompt because the conversation already has history? | No. The current system prompt is prepended every streamed turn, with one duplicate leading history prompt skipped. | `tests/openai-compat-multimodal.test.ts` |
| Can Orca answer that it cannot create/open local files before trying tools? | No. It must use the relevant local file tool first and only report a concrete tool failure. | `src/system-prompt.ts`, `tests/e2e-workflow.test.ts` |
| Can the model claim a file was saved without a tool call and leave the filesystem unchanged? | No. The proxy runtime repairs false save claims by writing the claimed file and recording the guard result. | `tests/chat-internals.test.ts` |
| If the user says a previously claimed file is missing and asks to open it, should Orca ask them to copy content manually? | No. The REPL guard reconstructs the claimed file from assistant history, writes it, and opens it when possible. | `tests/local-file-intent.test.ts`, `tests/chat-repl-turn.test.ts` |
| Are tool-call tests allowed to stay as scattered ad hoc commands? | No. They are part of `agent-eval/manifests/test-matrix.json` through `npm run test:tool-calls`. | `npm run test:matrix:sync` |
| Should Orca copy Hermes' caduceus/skin assets? | No. It should copy the brand structure only and keep a distinct Orca Blackfin mark. | `src/ui/components/Banner.tsx`, `tests/ink-ui.test.tsx` |
| Should the startup Banner render a separate Orca icon, mascot, or hero block? | No. The rejected hero block is deleted; the first frame uses the `ORCA-AGENT` wordmark and clean state deck. | `tests/ink-ui.test.tsx` |

## 2026-05-02 - Model Catalog SSoT Runtime Consolidation

### Requirements

| ID | Type | Requirement | Status | Evidence |
| --- | --- | --- | --- | --- |
| REQ-20260502-020 | Architecture | Keep model context windows, max output defaults, pricing, and capacity labels in one canonical metadata source | Done | `src/model-metadata.ts`, `src/model-catalog.ts` |
| REQ-20260502-021 | Runtime | Token budget and OpenAI-compatible provider guards must use the canonical model metadata instead of local duplicate tables | Done | `src/token-budget.ts`, `src/providers/openai-compat.ts`, `tests/model-catalog.test.ts` |
| REQ-20260502-022 | UX | Startup provider capacity labels and usage/session cost estimates must use the same metadata as the model catalog | Done | `src/output.ts`, `src/model-metadata.ts` |
| REQ-20260502-023 | Quality | Regression coverage must fail if runtime consumers reintroduce separate model metadata tables | Done | `tests/model-catalog.test.ts` |

### Prompt Ledger

| ID | Prompt / Trigger | Routing | Output |
| --- | --- | --- | --- |
| PROMPT-20260502-007 | `继续` | follow-on implementation | Closed ORCA-SWARM-021 by consolidating model metadata into a single runtime/catalog source and refreshing release evidence to `1663` tests |

### Anti-Regression Q&A

| Question | Expected Answer | Guard |
| --- | --- | --- |
| Can token budget, provider max-token defaults, output cost estimates, and `/models` each own their own model metadata tables? | No. `src/model-metadata.ts` is the canonical metadata source; consumers import helpers from it or through `src/model-catalog.ts`. | `tests/model-catalog.test.ts` |
| What happens for unknown model names? | Runtime consumers use conservative fallback helpers without resurrecting old duplicated tables. | `src/model-metadata.ts` |

## 2026-05-03 - Claude-Style No-Flicker TUI

### Requirements

| ID | Type | Requirement | Status | Evidence |
| --- | --- | --- | --- | --- |
| REQ-20260503-001 | UX | Keep primary-buffer copyability as the default while providing explicit fullscreen/no-flicker opt-ins | Done | `src/ui/render.tsx`, `tests/ink-ui.test.tsx` |
| REQ-20260503-002 | UX | Support Claude-compatible `CLAUDE_CODE_NO_FLICKER=1` plus Orca-native `ORCA_TUI=fullscreen` / `ORCA_NO_FLICKER=1` | Done | `src/ui/render.tsx`, `tests/ink-ui.test.tsx` |
| REQ-20260503-003 | Reliability | Enter alternate screen before Ink's first frame and exit it if render fails before mount | Done | `src/ui/render.tsx`, `src/ui/components/AlternateScreen.tsx` |
| REQ-20260503-004 | Performance | Reduce no-flicker repaint pressure by limiting the rendered completed-block tree | Done | `src/ui/components/App.tsx` |
| REQ-20260503-005 | Reliability | Keep project hooks loadable when the active tool cwd changes, without leaking one project's hooks into another project | Done | `src/hooks.ts`, `src/policy-executor.ts`, `tests/hooks.test.ts`, `tests/v050-modules.test.ts` |

### Prompt Ledger

| ID | Prompt / Trigger | Routing | Output |
| --- | --- | --- | --- |
| PROMPT-20260503-001 | `还有屏幕闪动的问题，之前claude code 也出现了这个问题，后来官方给了解决方案，搜索调研下，然后参考修复这个问题` | official-doc research + TUI hardening | Added Claude-style no-flicker/fullscreen opt-in with pre-frame alternate-screen entry, bounded render tree, and focused regression coverage |

### Anti-Regression Q&A

| Question | Expected Answer | Guard |
| --- | --- | --- |
| Should Orca enable fullscreen/no-flicker by default? | No. Default remains copyable primary-buffer rendering; no-flicker is explicit opt-in. | `shouldUseNoFlickerRenderer()` |
| Which envs enable no-flicker mode? | `ORCA_TUI=fullscreen`, `ORCA_NO_FLICKER=1`, `ORCA_ALT_SCREEN=1`, or `CLAUDE_CODE_NO_FLICKER=1`. | `tests/ink-ui.test.tsx` |
| Which env disables no-flicker when aliases are also present? | `ORCA_TUI=default` and other disabled values (`0`, `false`, `no`, `off`, `scrollback`) win. | `tests/ink-ui.test.tsx` |
| Does no-flicker mode re-enable mouse capture? | No. Mouse capture remains opt-in through `ORCA_MOUSE=1`. | `src/ui/components/App.tsx` |
| Can hooks stay stuck on the first loaded project cwd? | No. Global hooks load once; trusted project hooks load per cwd and execute only for their owning cwd. | `tests/hooks.test.ts` |

## 2026-05-02 - Terminal Operability Hardening

### Requirements

| ID | Type | Requirement | Status | Evidence |
| --- | --- | --- | --- | --- |
| REQ-20260502-013 | UX | Keep Ink output copyable by default by avoiding alternate-screen rendering unless explicitly requested | Done | `src/ui/render.tsx`, `tests/ink-ui.test.tsx` |
| REQ-20260502-014 | UX | Keep terminal text selection working by disabling mouse tracking unless explicitly requested | Done | `src/ui/components/App.tsx`, `tests/ink-ui.test.tsx` |
| REQ-20260502-015 | DX | Resolve tool cwd from explicit cwd/env, ambient project cwd, or the last remembered project when launched elsewhere | Done | `src/commands/chat-support.ts`, `tests/chat-support.test.ts` |
| REQ-20260502-016 | DX | Allow root `orca --cwd <dir>` launchers to forward the cwd into chat | Done | `src/program.ts`, `tests/program.test.ts` |
| REQ-20260502-017 | Reliability | Route MCP tools for server names containing underscores or hyphens | Done | `src/mcp-client.ts`, `tests/mcp-client.test.ts` |
| REQ-20260502-018 | DX | Add `open_file` for visual local file opening while keeping `read_file` for contents | Done | `src/tools.ts`, `tests/tools.test.ts` |
| REQ-20260502-019 | Safety | Treat `open_file` as a dangerous tool because it launches an external application | Done | `src/tools.ts`, `tests/tools-full.test.ts`, `tests/hooks.test.ts` |

### Prompt Ledger

| ID | Prompt / Trigger | Routing | Output |
| --- | --- | --- | --- |
| PROMPT-20260502-006 | `claude code 也是ink，但是能复制？...不管哪里启动都能调用工具...还有闪屏的问题` | terminal-operability hardening | Made alternate screen and mouse tracking opt-in, added workspace cwd memory/root cwd forwarding, fixed MCP name parsing, added `open_file`, refreshed tests/docs/evidence |

### Anti-Regression Q&A

| Question | Expected Answer | Guard |
| --- | --- | --- |
| Should Orca default to alternate screen because it uses Ink? | No. Ink can render in the primary buffer; fullscreen/no-flicker alternate screen is opt-in through `ORCA_TUI=fullscreen`, `ORCA_NO_FLICKER=1`, `ORCA_ALT_SCREEN=1`, or `CLAUDE_CODE_NO_FLICKER=1`. | `src/ui/render.tsx`, `tests/ink-ui.test.tsx` |
| Should Orca capture mouse events by default? | No. Mouse capture blocks normal terminal selection; it is opt-in through `ORCA_MOUSE=1`. | `src/ui/components/App.tsx` |
| What cwd should tools use when Orca launches from a menu or home directory? | Explicit cwd/env wins; otherwise an ambient project cwd wins; otherwise Orca falls back to the last remembered project workspace. | `src/commands/chat-support.ts` |
| Can MCP server names include `_` or `-`? | Yes. Route by splitting `mcp__server__tool` on the last delimiter and parse hyphenated Codex TOML sections. | `src/mcp-client.ts` |
| Should opening a Markdown file use `read_file`? | Use `read_file` for contents and `open_file` when the user asks to visually open the file in the OS default app. | `src/tools.ts` |

## 2026-05-02 - Rubber Duck Critique Quality Gate

### Requirements

| ID | Type | Requirement | Status | Evidence |
| --- | --- | --- | --- | --- |
| REQ-20260502-001 | Quality | Add a first-class `orca critique` gate that is distinct from `reflect` and performs read-only reviewer challenge on plans, diffs, tests, and risk assumptions | Done | `src/commands/critique.ts`, `src/critique.ts`, `README.md` |
| REQ-20260502-002 | Quality | Implement the research report risk formula using diff lines, changed files, critical path, repeated failure, security/data sensitivity, and user uncertainty | Done | `src/critique.ts`, `tests/critique.test.ts` |
| REQ-20260502-003 | Quality | Support checkpoint routing for `after_plan`, `after_complex_implementation`, `before_test_execution`, `stuck_loop`, and `manual` | Done | `src/critique.ts`, `src/commands/critique.ts`, `tests/critique.test.ts` |
| REQ-20260502-004 | DX | Provide deterministic `--dry-run --json` output that works without an API key | Done | `src/commands/critique.ts`, `tests/critique.test.ts` |
| REQ-20260502-005 | Architecture | Choose a complementary reviewer model family by default instead of reusing the same family as the active model | Done | `src/critique.ts`, `tests/critique.test.ts` |
| REQ-20260502-006 | DX | Expose the same critique risk inspection inside `orca chat` through `/critique` without leaving the active session | Done | `src/commands/chat-slash-readonly.ts`, `tests/chat-slash-readonly.test.ts` |
| REQ-20260502-007 | Architecture | Share workspace diff/risk/prompt inspection between the standalone command and slash command instead of duplicating logic | Done | `src/critique-workspace.ts`, `src/commands/critique.ts` |
| REQ-20260502-008 | Reliability | Keep project hook trust evaluation stable when the singleton is constructed before `ORCA_TRUST_PROJECT_HOOKS` is set | Done | `src/hooks.ts`, `tests/v050-modules.test.ts` |
| REQ-20260502-009 | DX | Warn operators once per high-risk dirty diff signature before normal chat sends so they know to run a critique checkpoint | Done | `src/critique-auto.ts`, `src/commands/chat-repl-turn.ts`, `tests/chat-repl-turn.test.ts` |
| REQ-20260502-010 | Safety | Keep automatic critique hints local, model-free, prompt-preserving, and configurable through env knobs | Done | `src/critique-auto.ts`, `tests/critique.test.ts` |
| REQ-20260502-011 | DX | Expose per-session chat flags to disable or retune automatic local critique hints | Done | `src/commands/chat.ts`, `tests/command-contracts.test.ts` |
| REQ-20260502-012 | DX | Apply automatic local critique hints to one-shot chat while preserving clean JSON output | Done | `src/commands/chat.ts`, `tests/chat-one-shot-mcp-cleanup.test.ts` |

### Prompt Ledger

| ID | Prompt / Trigger | Routing | Output |
| --- | --- | --- | --- |
| PROMPT-20260502-001 | `参考优化的本地的orca cli：file:///Users/mauricewen/Documents/ai_coding_cli_research_report.html` | `optimize` | Added the Rubber Duck Critique quality gate with risk scoring, command surface, tests, README, and PDCA docs |
| PROMPT-20260502-002 | `继续` | follow-on implementation | Added in-session `/critique` read-only inspection and shared workspace critique context builder |
| PROMPT-20260502-003 | `继续` | follow-on implementation | Added automatic chat pre-send local critique hints with repeat suppression and env tuning |
| PROMPT-20260502-004 | `继续` | follow-on implementation | Surfaced `--no-auto-critique` and `--auto-critique-threshold` chat flags for session-scoped control |
| PROMPT-20260502-005 | `继续` | follow-on implementation | Extended automatic local critique hints to one-shot `orca chat "prompt"` without polluting `--json` output |

### Anti-Regression Q&A

| Question | Expected Answer | Guard |
| --- | --- | --- |
| Should `reflect` and `critique` be the same workflow? | No. `reflect` is Socratic diagnosis by the main agent; `critique` is read-only reviewer challenge against a plan/diff/test context. | `README.md`, `src/commands/reflect-mode.ts`, `src/commands/critique.ts` |
| Can a critique mutate the workspace or silently continue after critical findings? | No. The critique prompt is read-only and structured results expose `must_fix_before_continue` for main-agent validation before continuing. | `src/critique.ts`, `tests/critique.test.ts` |
| Does local validation require live provider credentials? | No. `orca critique --dry-run --json` returns checkpoint, risk, reviewer, and diff signals without calling a model. | `src/commands/critique.ts`, `tests/critique.test.ts` |
| Does `/critique` call a model during chat inspection? | No. The slash command is a local read-only inspection that surfaces the same risk decision and reviewer choice without a provider call. | `src/commands/chat-slash-readonly.ts`, `tests/chat-slash-readonly.test.ts` |
| Does the automatic chat critique hint call a model or alter the outgoing prompt? | No. It only inspects the local dirty diff, emits a warning notice once per diff signature, and recommends the explicit `/critique` gate. | `src/critique-auto.ts`, `src/commands/chat-repl-turn.ts`, `tests/critique.test.ts`, `tests/chat-repl-turn.test.ts` |
| Can automatic critique hints be controlled without env var changes? | Yes. `orca chat --no-auto-critique` disables them for a session, and `orca chat --auto-critique-threshold <score>` tunes the session threshold. | `src/commands/chat.ts`, `tests/command-contracts.test.ts` |
| Does one-shot `orca chat --json` include automatic critique notices in JSON output? | No. The one-shot helper emits hints only for streaming output and stays silent for JSON output. | `src/commands/chat.ts`, `tests/chat-one-shot-mcp-cleanup.test.ts` |
| Can project hook trust depend only on `HookManager` construction time? | No. `load()` must re-check `ORCA_TRUST_PROJECT_HOOKS` so test/runtime paths that set trust before loading hooks remain deterministic. | `src/hooks.ts`, `tests/v050-modules.test.ts` |

## 2026-05-01 - Orca Brand Positioning Correction

### Requirements

| ID | Type | Requirement | Status | Evidence |
| --- | --- | --- | --- | --- |
| REQ-20260501-001 | Brand | Treat Orca's visual identity as killer whale / tiger whale positioning, not generic deep-sea or abstract ocean branding | Done | `ORCA_VISUAL_SYSTEM_PLAN.md`, `src/ui/components/Banner.tsx`, `src/ui/components/ThemePicker.tsx` |
| REQ-20260501-002 | Brand | Treat Orca as a killer-whale + ocean joint motif where killer whale is primary, ocean is the field, and pod intelligence is the product metaphor | Done | `ORCA_VISUAL_SYSTEM_PLAN.md`, `PDCA_EXECUTION_PLAN.md` |
| REQ-20260501-003 | UI | Superseded for startup Banner: do not render a separate mascot/icon; preserve the Hermes-inspired wordmark + status-panel structure | Superseded | `src/ui/components/Banner.tsx`, `tests/ink-ui.test.tsx`, `REQ-20260502-031` |
| REQ-20260501-004 | UX | Rename and retune the first entry panel as `POD BRIEF` so the operator briefs the pod with one clear outcome | Done | `src/ui/components/HomePanel.tsx`, `tests/ink-ui.test.tsx` |
| REQ-20260501-005 | UX | Extend Orca's pod identity into the input, slash-command picker, option picker, and shared picker frame | Done | `src/ui/components/InputArea.tsx`, `src/ui/components/CommandPicker.tsx`, `src/ui/components/OptionPicker.tsx`, `src/ui/components/PickerFrame.tsx` |
| REQ-20260501-006 | UI | Replace hard-coded generic picker colors in changed picker surfaces with Orca semantic theme tokens | Done | `src/ui/components/PickerFrame.tsx`, `src/ui/components/CommandPicker.tsx`, `src/ui/components/OptionPicker.tsx` |
| REQ-20260501-007 | UX | Keep command picker visible with no-match feedback when a slash-command filter returns zero matches | Done | `src/ui/components/CommandPicker.tsx`, `tests/ink-ui.test.tsx` |
| REQ-20260501-008 | UX | Retune input placeholder and multiline hint toward pod briefing language without changing input semantics | Done | `src/ui/components/InputArea.tsx`, `tests/ink-ui.test.tsx` |
| REQ-20260501-009 | UX | Render submitted user transcript blocks as `POD BRIEF` while preserving exact prompt text | Done | `src/ui/components/App.tsx`, `tests/ink-ui.test.tsx` |
| REQ-20260501-010 | UX | Render assistant transcript panels as `ORCA POD` while preserving markdown structure | Done | `src/ui/components/App.tsx`, `tests/ink-ui.test.tsx` |
| REQ-20260501-011 | UI | Add Orca scan identity to tool-call rails without hiding tool names, paths, status, or duration | Done | `src/ui/components/App.tsx`, `src/ui/components/ToolCallBlock.tsx`, `tests/ink-ui.test.tsx` |
| REQ-20260501-012 | UX | Replace generic thinking verbs with compact Orca / pod / proof-oriented status copy | Done | `src/ui/components/ThinkingSpinner.tsx`, `tests/ink-ui.test.tsx` |
| REQ-20260501-013 | UX | Reframe the fixed StatusBar as a pod status rail with `sonar`, `signal:`, and `trust:` language | Done | `src/ui/components/StatusBar.tsx`, `tests/ink-ui.test.tsx` |
| REQ-20260501-014 | UI | Preserve model, context bar, branch, metrics, policy summaries, permissions, mode, and effort while adding Orca status-rail identity | Done | `src/ui/components/StatusBar.tsx`, `tests/ink-ui.test.tsx` |
| REQ-20260501-015 | UX | Keep trust-cycle guidance visible as `shift+tab cycles trust` without changing shortcut behavior | Done | `src/ui/components/StatusBar.tsx`, `tests/ink-ui.test.tsx` |
| REQ-20260501-016 | UX | Reframe post-turn summaries as `PROOF WAKE` instead of internal `r/d/u` shorthand | Done | `src/ui/components/TurnSummary.tsx`, `tests/ink-ui.test.tsx` |
| REQ-20260501-017 | UI | Preserve elapsed time, input/output tokens, tool count, cost, and tok/s in the proof-wake summary | Done | `src/ui/components/TurnSummary.tsx`, `tests/ink-ui.test.tsx` |
| REQ-20260501-018 | UX | Reframe permission prompts as `TRUST GATE` with the tool name, scan preview, and trust-scope choices visible | Done | `src/ui/components/PermissionPrompt.tsx`, `tests/ink-ui.test.tsx` |
| REQ-20260501-019 | UI | Preserve approval semantics and keybindings while retuning approval copy to once/session/project/deny trust language | Done | `src/ui/components/PermissionPrompt.tsx`, `tests/ink-ui.test.tsx` |
| REQ-20260501-020 | UX | Reframe write diff previews as `ECHO DIFF` without changing path, counts, line numbers, truncation, or diff content | Done | `src/ui/components/DiffPreview.tsx`, `tests/ink-ui.test.tsx` |
| REQ-20260501-021 | UX | Reframe detail panels as `EVIDENCE DRAWER` while preserving the original title, subtitle, and markdown body | Done | `src/ui/components/DetailPanel.tsx`, `tests/ink-ui.test.tsx` |
| REQ-20260501-022 | UI | Use theme semantic tokens for detail panel info/warn/error tone borders instead of hard-coded terminal colors | Done | `src/ui/components/DetailPanel.tsx` |
| REQ-20260501-023 | UX | Reframe multi-model progress as `POD COUNCIL` while preserving command, model count, model names, and elapsed time | Done | `src/ui/components/MultiModelProgress.tsx`, `tests/ink-ui.test.tsx` |
| REQ-20260501-024 | UX | Show completed multi-model rows as `surfaced` and active rows as `sonar` without changing runtime progress semantics | Done | `src/ui/components/MultiModelProgress.tsx`, `tests/ink-ui.test.tsx` |
| REQ-20260501-025 | UI | Use theme semantic tokens for multi-model progress instead of hard-coded terminal colors | Done | `src/ui/components/MultiModelProgress.tsx` |
| REQ-20260501-026 | UX | Reframe the persistent shortcut footer as `POD HELM` while preserving context-aware key visibility | Done | `src/ui/components/Footer.tsx`, `tests/ink-ui.test.tsx` |
| REQ-20260501-027 | UX | Retune footer labels to `interrupt echo`, `send brief`, and `pod commands` without changing shortcut behavior | Done | `src/ui/components/Footer.tsx`, `tests/ink-ui.test.tsx` |
| REQ-20260501-028 | UI | Keep ordinary-width footer rendering coherent by hiding lower-priority active hints until width allows | Done | `src/ui/components/Footer.tsx`, `tests/ink-ui.test.tsx` |
| REQ-20260501-029 | UI | Use theme semantic tokens for footer identity, keys, and labels instead of dim-only terminal styling | Done | `src/ui/components/Footer.tsx` |

### Prompt Ledger

| ID | Prompt / Trigger | Routing | Output |
| --- | --- | --- | --- |
| PROMPT-20260501-001 | `注意，我的orca是虎鲸的意向定位，这个别搞错了；` | `frontend-design` correction pass | Renamed the identity language from `Abyssal Signal` to `Blackfin Signal`, updated pod / dorsal-fin / echolocation copy, and synced docs / tests |
| PROMPT-20260501-002 | `虎鲸也是生活再海洋，是不是是虎鲸和海洋的联合意象` / `继续` | `frontend-design` hierarchy pass | Recorded brand hierarchy: killer whale primary, ocean field, pod intelligence metaphor; reran lint/build/full suite |
| PROMPT-20260501-003 | `开始全面优化ui和ux，logo的要学习hermes agent实现可爱的虎鲸形象` | `frontend-design` mascot implementation pass | Implemented cute terminal orca mascot, `POD BRIEF` first-screen UX, docs, and verification |
| PROMPT-20260501-004 | `继续` | `frontend-design` command-surface pass | Extended Orca pod identity into input, command picker, option picker, picker frame, docs, and verification |
| PROMPT-20260501-005 | `继续` | `frontend-design` transcript-flow pass | Extended Orca pod identity into transcript roles, tool rails, thinking state, docs, and verification |
| PROMPT-20260501-006 | `继续` | `frontend-design` status-rail pass | Extended Orca pod identity into the fixed StatusBar with sonar context, signal metrics, trust posture, docs, and verification |
| PROMPT-20260501-007 | `继续` | `frontend-design` proof-wake pass | Extended Orca pod identity into post-turn summaries with `PROOF WAKE`, explicit metrics, docs, and verification |
| PROMPT-20260501-008 | `继续` | `frontend-design` trust-gate pass | Extended Orca pod identity into permission prompts and write diff previews with `TRUST GATE`, `SCAN`, and `ECHO DIFF`, plus docs and verification |
| PROMPT-20260501-009 | `继续` | `frontend-design` evidence-drawer pass | Extended Orca pod identity into detail panels with `EVIDENCE DRAWER`, `pod scan`, theme tone tokens, docs, and verification |
| PROMPT-20260501-010 | `继续` | `frontend-design` council-runway pass | Extended Orca pod identity into multi-model progress with `POD COUNCIL`, `voices`, `surfaced`, `sonar`, theme tokens, docs, and verification |
| PROMPT-20260501-011 | `继续` | `frontend-design` helm-footer pass | Extended Orca pod identity into the persistent footer with `POD HELM`, `interrupt echo`, `send brief`, `pod commands`, width-aware rendering, docs, and verification |

### Anti-Regression Q&A

| Question | Expected Answer | Guard |
| --- | --- | --- |
| Is Orca's brand a generic deep-sea console? | No. Orca is a killer-whale / tiger-whale identity with blackfin, pod, dorsal-fin silhouette, and echolocation cues. | `ORCA_VISUAL_SYSTEM_PLAN.md`, `tests/ink-ui.test.tsx` |
| Does ocean imagery belong in the Orca system? | Yes, but as field/environment. The killer whale remains the primary motif and the product metaphor is pod intelligence. | `ORCA_VISUAL_SYSTEM_PLAN.md` |
| Should the logo copy Hermes Agent's caduceus? | No. Copy only the large-wordmark and status-panel hierarchy; the startup Banner must not render a separate mascot/icon. | `src/ui/components/Banner.tsx`, `tests/ink-ui.test.tsx` |
| Should command and option pickers keep generic cyan/yellow styling after the Orca refresh? | No. Changed picker surfaces should use Orca semantic theme tokens and pod-language labels. | `src/ui/components/PickerFrame.tsx`, `src/ui/components/CommandPicker.tsx`, `src/ui/components/OptionPicker.tsx` |
| Can a command filter with no matches make the picker disappear? | No. The picker stays visible and reports `no matching command`, with `Esc` still available. | `src/ui/components/CommandPicker.tsx`, `tests/ink-ui.test.tsx` |
| Should transcript roles remain generic `You` / `ORCA` after the Orca refresh? | No. User prompts are `POD BRIEF`; assistant responses are `ORCA POD`; tools are `ECHO TOOL`. | `src/ui/components/App.tsx`, `src/ui/components/ToolCallBlock.tsx`, `tests/ink-ui.test.tsx` |
| Can transcript identity hide tool or markdown evidence? | No. Tool names, paths, result status, duration, and structured markdown output remain visible. | `src/ui/components/ToolCallBlock.tsx`, `src/ui/components/MarkdownText.tsx`, `tests/ink-ui.test.tsx` |
| Should the fixed status bar read like a generic CLI footer after the Orca refresh? | No. It should keep `ORCA POD`, add sonar context language, use `signal:` for stats, and use `trust:` for permissions while preserving all operational fields. | `src/ui/components/StatusBar.tsx`, `tests/ink-ui.test.tsx` |
| Should post-turn summaries use internal shorthand such as `r`, `d`, and `u` after the Orca refresh? | No. Completed turns should render a `PROOF WAKE` summary with explicit time, input, output, tools, cost, and throughput labels. | `src/ui/components/TurnSummary.tsx`, `tests/ink-ui.test.tsx` |
| Should permission prompts remain generic approval panels after the Orca refresh? | No. They should render as `TRUST GATE`, show the tool under review, expose the impact preview under `SCAN`, and keep once/session/project/deny decisions clear. | `src/ui/components/PermissionPrompt.tsx`, `tests/ink-ui.test.tsx` |
| Can trust-gate wording change permission or diff behavior? | No. Copy and hierarchy can change, but keybindings, approval decision payloads, diff computation, line numbers, truncation, and runtime events must remain stable. | `src/ui/components/PermissionPrompt.tsx`, `src/ui/components/DiffPreview.tsx`, `tests/ink-ui.test.tsx` |
| Should detail panels render as generic boxes after the Orca refresh? | No. They should render as `EVIDENCE DRAWER` with `pod scan` subtitle context while preserving the source title, subtitle, and markdown body. | `src/ui/components/DetailPanel.tsx`, `tests/ink-ui.test.tsx` |
| Can detail panel tone colors be hard-coded after the Orca refresh? | No. Detail panel info/warn/error borders should resolve through active theme semantic tokens. | `src/ui/components/DetailPanel.tsx` |
| Should multi-model progress remain a generic model list after the Orca refresh? | No. Council, race, and pipeline progress should render as `POD COUNCIL`, with model count as `voices`, completed rows as `surfaced`, and active rows as `sonar`. | `src/ui/components/MultiModelProgress.tsx`, `tests/ink-ui.test.tsx` |
| Can multi-model progress colors be hard-coded after the Orca refresh? | No. Progress header, active, completed, and model-name tones should resolve through active theme semantic tokens. | `src/ui/components/MultiModelProgress.tsx` |
| Should the persistent footer stay as generic shortcut copy after the Orca refresh? | No. It should render as `POD HELM` and use pod-oriented labels while preserving the actual shortcut keys. | `src/ui/components/Footer.tsx`, `tests/ink-ui.test.tsx` |
| Can footer branding make shortcut behavior ambiguous or cause broken wraps? | No. Labels can change, but keys, permission-mode visibility, and ordinary-width readability must remain stable. | `src/ui/components/Footer.tsx`, `tests/ink-ui.test.tsx` |

## 2026-04-30 - Orca Visual System / Hermes-Inspired CLI Identity

### Requirements

| ID | Type | Requirement | Status | Evidence |
| --- | --- | --- | --- | --- |
| REQ-20260430-001 | UX | Optimize local Orca CLI by studying Hermes Agent's high-recognition terminal experience | Done | `ORCA_VISUAL_SYSTEM_PLAN.md`, `src/ui/components/Banner.tsx` |
| REQ-20260430-002 | Design | Define a distinctive killer-whale Orca visual system covering typography, color, UI, and UX before implementation | Done | `ORCA_VISUAL_SYSTEM_PLAN.md`, `ORCA_VISUAL_SYSTEM_PLAN.html` |
| REQ-20260430-003 | UI | Implement a terminal-native startup identity with an ORCA wordmark, signal motif, and coherent narrow-terminal fallback | Done | `src/ui/components/Banner.tsx`, `tests/ink-ui.test.tsx` |
| REQ-20260430-004 | Theme | Replace generic default dark theme with semantic `Blackfin Signal` tokens while preserving existing theme options | Done | `src/ui/theme.tsx`, `src/ui/components/ThemePicker.tsx`, `tests/ink-ui.test.tsx` |
| REQ-20260430-005 | UX | Reframe the empty-state HomePanel as a mission-control surface for task, trust, recovery, and guardrails | Done | `src/ui/components/HomePanel.tsx`, `src/ui/components/StatusBar.tsx`, `tests/ink-ui.test.tsx` |

### Prompt Ledger

| ID | Prompt / Trigger | Routing | Output |
| --- | --- | --- | --- |
| PROMPT-20260430-001 | `优化我本地的orca cli，学习hermes agent，打造高标识度的视觉系统，如字体，配色，ui和ux，先设计方案，再pdca执行` | `frontend-design` + project PDCA | Visual system design plan, then scoped Ink UI implementation |

### Anti-Regression Q&A

| Question | Expected Answer | Guard |
| --- | --- | --- |
| Should Orca copy Hermes's caduceus and exact gold-only palette? | No. Hermes is a reference for recognition mechanics; Orca uses its own killer-whale `Blackfin Signal` identity. | `ORCA_VISUAL_SYSTEM_PLAN.md` |
| Can the visual refresh add new dependencies? | No. Use existing Ink / React / chalk surface only. | package diff review, build |
| Can the first screen hide trust and recovery state behind decoration? | No. The banner and HomePanel must keep model, permission, session, tool, and recovery state visible. | `tests/ink-ui.test.tsx` |
| Can `ai check` be claimed as passed for this tranche? | Yes, after the Orca project gate was reconciled with the TypeScript repo shape and the final `ai check --base-dir /Users/mauricewen/Projects/orca-cli --json` run passed. | `outputs/check/20260529-012813-244bdac2`, `tests/test_all.py` |

## 2026-04-29 - SOTA Swarm Audit / Queue / Trust PDCA

### Requirements

| ID | Type | Requirement | Status | Evidence |
| --- | --- | --- | --- | --- |
| REQ-20260429-001 | Audit | Run SOTA swarm audit across architecture, security, UX, verification, and docs governance | Done | `SOTA_GAP_SWARM_AUDIT.md` |
| REQ-20260429-002 | Report | Route human audit report through `html-style-router` using `html-economist-style` | Done | `SOTA_GAP_SWARM_AUDIT.html` |
| REQ-20260429-003 | Plan | Produce milestone plan and atomic task queue | Done | `task_plan.md`, `SOTA_GAP_SWARM_AUDIT.md` |
| REQ-20260429-004 | Security | Repo-local hooks must not auto-load without explicit trust | Done | `src/hooks.ts`, `tests/hooks.test.ts` |
| REQ-20260429-005 | Security | Network-capable tools must use approval gates in `auto` mode | Done | `src/tools.ts`, `tests/chat-proxy-tool-call.test.ts` |
| REQ-20260429-006 | Runtime | Operators need top-level TaskRun queue inspection | Done | `src/commands/queue.ts`, `tests/queue-command.test.ts` |
| REQ-20260429-007 | Runtime | Operators need live TaskRun evidence streaming from the queue surface | Done | `orca queue follow`, `tests/queue-command.test.ts` |
| REQ-20260429-008 | Release | Every commit must include an appropriate version bump, and runtime version surfaces must match `package.json` | Done | `src/version.ts`, `tests/v030-harness.test.ts`, `tests/program.test.ts` |
| REQ-20260429-009 | Runtime | Operators need a bounded lease takeover surface for non-terminal TaskRuns | Done | `orca queue takeover`, `src/work-session-store.ts`, `tests/queue-command.test.ts`, `tests/work-session-store.test.ts` |
| REQ-20260429-010 | Runtime | Headless `serve /chat` requests must create and close canonical WorkSession / TaskRun records | Done | `src/commands/serve.ts`, `tests/serve-command.test.ts` |
| REQ-20260429-011 | UX | Operators need a TaskRun evidence drawer for logs, diffs, data, reports, missing artifacts, and bounded previews | Done | `orca queue evidence`, `src/commands/queue.ts`, `tests/queue-command.test.ts` |
| REQ-20260429-012 | UX | Slash-command discovery must not drift across REPL completion, Ink picker, and `/help`; HomePanel hint metadata must be ready for the pending UI-baseline split | Core Done | `src/slash-commands.ts`, `tests/slash-commands.test.ts` |
| REQ-20260429-013 | Docs | README and active PDCA docs must not drift from current package version, test file count, and full-suite evidence | Done | `verification_snapshot.json`, `tests/release-evidence.test.ts` |
| REQ-20260429-014 | Verification | CI must enforce the documented matrix/security/performance/eval gates | Done | `.github/workflows/ci.yml`, `agent-eval/manifests/test-matrix.json`, `npm run test:matrix:sync` |
| REQ-20260429-015 | Runtime | `orca run` default, goal-loop, mission, and plan branches must write canonical WorkSession / TaskRun records | Done | `src/commands/run.ts`, `tests/run-work-session.test.ts` |
| REQ-20260429-016 | Build | A clean staged checkout must build the declared workflow, permissions, evolve, and git-root command surface | Done | `src/program.ts`, `src/commands/workflows.ts`, `src/commands/permissions.ts`, `src/commands/evolve.ts`, `src/config.ts`, `src/git-repository.ts` |
| REQ-20260429-017 | Routing | Workflow preset metadata and Cloudflare / Claudeflare provider-gateway config helpers must be covered by command/config regressions before M5 model catalog work continues | Done | `src/modes/registry.ts`, `src/modes/policies.ts`, `src/config.ts`, `tests/program.test.ts`, `tests/config.test.ts` |
| REQ-20260429-018 | UX | Chat REPL and Ink operator controls for sessions, permissions, models, command output, and detail panels must be clean-index testable before queue-backed chat execution work continues | Done | `src/commands/chat*.ts`, `src/ui/*`, `tests/chat-*.test.ts`, `tests/ink-ui.test.tsx`, `tests/command-output.test.ts` |
| REQ-20260429-019 | Runtime | Interactive `orca chat` REPL turns must create and close canonical WorkSession / TaskRun records with status, usage, duration, and runtime evidence | Done | `src/commands/chat.ts`, `src/commands/chat-repl-turn.ts`, `src/work-session-store.ts`, `tests/chat-repl-turn.test.ts`, `tests/work-session-store.test.ts` |
| REQ-20260429-020 | UX | Operators must inspect TaskRun evidence inside the Ink REPL without leaving the session or opening raw files | Done | `src/commands/queue.ts`, `src/commands/chat-slash-readonly.ts`, `src/slash-commands.ts`, `tests/queue-command.test.ts`, `tests/chat-slash-readonly.test.ts` |
| REQ-20260429-021 | UX | Submitted Ink prompts must remain visible after sending, and assistant markdown must render as structured terminal output | Done | `src/ui/session.ts`, `src/ui/types.ts`, `src/ui/components/App.tsx`, `src/ui/components/MarkdownText.tsx`, `tests/ink-ui.test.tsx`, `tests/chat-session-emitter.test.ts` |
| REQ-20260429-022 | UX | Review-before-apply approval decisions must persist on TaskRun evidence and render before file artifacts in CLI and Ink | Done | `src/policy-executor.ts`, `src/work-session-store.ts`, `src/commands/queue.ts`, `tests/chat-proxy-tool-call.test.ts`, `tests/queue-command.test.ts` |
| REQ-20260429-023 | Runtime | TaskRun leases must support actionable resume/schedule plans without pretending unsupported run kinds are replay-safe | Done | `orca queue resume`, `orca queue schedule`, `src/commands/queue.ts`, `src/work-session-store.ts`, `tests/queue-command.test.ts` |

### Prompt Ledger

| ID | Prompt / Trigger | Routing | Output |
| --- | --- | --- | --- |
| PROMPT-20260429-001 | `/Users/mauricewen/Projects/orca-cli 对orca 进行sota 蜂群审计，输出走风格路由的审计报告，再制定里程碑计划及原子任务清单，之后再队列及蜂群模式pdca执行` | `$audit` + frontend/design/report style router + native swarm lanes | SOTA audit, routed HTML report, milestone plan, atomic queue, PDCA tranche 1 |
| PROMPT-20260429-002 | `继续` | Continue queued PDCA execution | Completed ORCA-SWARM-006: `queue follow` |
| PROMPT-20260429-003 | `继续` | Continue queued PDCA execution | Completed ORCA-SWARM-007: `queue takeover` lease model |
| PROMPT-20260429-004 | `继续` | Continue queued PDCA execution | Completed ORCA-SWARM-008: `serve /chat` canonical run records |
| PROMPT-20260429-005 | `继续` | Continue queued PDCA execution | Completed ORCA-SWARM-009: `queue evidence` drawer |
| PROMPT-20260429-006 | `继续` | Continue queued PDCA execution | Core completed ORCA-SWARM-010: shared slash-command registry |
| PROMPT-20260429-007 | `继续` | Continue queued PDCA execution | Completed ORCA-SWARM-011: release evidence snapshot guard |
| PROMPT-20260429-008 | `继续` | Continue queued PDCA execution | Completed ORCA-SWARM-012: CI gate integrity enforcement |
| PROMPT-20260429-009 | `继续` | Continue queued PDCA execution | Completed ORCA-SWARM-013: `orca run` execution contract records |
| PROMPT-20260429-010 | `继续` | Continue queued PDCA execution | Completed ORCA-SWARM-014: clean-index command baseline |
| PROMPT-20260429-011 | `继续` | Continue queued PDCA execution | Completed ORCA-SWARM-015: chat operator control plane |
| PROMPT-20260429-012 | `继续` | Continue queued PDCA execution | Completed ORCA-SWARM-016: chat REPL canonical TaskRun records |
| PROMPT-20260429-013 | `继` | Continue queued PDCA execution | Completed ORCA-SWARM-017: Ink `/evidence` TaskRun detail panel |
| PROMPT-20260429-014 | `orca发现几个问题...我输入的提示词看不到...内容输出缺乏结构化的表达` | Screenshot-driven Ink UX fix | Completed ORCA-SWARM-019: visible prompt blocks and structured assistant response panels |
| PROMPT-20260429-015 | `继续` | Continue queued PDCA execution | Completed ORCA-SWARM-018: TaskRun approval timeline in CLI / Ink evidence drawer |
| PROMPT-20260429-016 | `继续` | Continue queued PDCA execution | Completed ORCA-SWARM-020: `queue resume` and `queue schedule` lease-backed recovery plans |

### Anti-Regression Q&A

| Question | Expected Answer | Guard |
| --- | --- | --- |
| Can repo-local hooks run on startup by default? | No. They require explicit trust. | `tests/hooks.test.ts` |
| Do hook subprocesses inherit provider API keys by default? | No. The hook env is allowlisted. | `tests/hooks.test.ts` |
| Are `fetch_url` and `web_search` approval-gated in auto mode? | Yes. | `tests/chat-proxy-tool-call.test.ts` |
| Can `fetch_url` hit `127.0.0.1` or `192.168.*` directly? | No. Literal loopback/private targets are blocked. | `tests/tools.test.ts` |
| Is there a CLI surface for existing TaskRun records? | Yes: `orca queue list/show/follow/takeover`. | `tests/queue-command.test.ts` |
| Can operators stream TaskRun evidence without opening raw files? | Yes: `orca queue follow <id>` tails evidence and exits when the run is terminal. | `tests/queue-command.test.ts` |
| Can package and runtime CLI versions drift? | No. `program`, output, and Ink banner paths read the package version through `src/version.ts`; tests compare runtime version against `package.json`. | `tests/v030-harness.test.ts`, `tests/program.test.ts` |
| Can a second operator silently take over an active TaskRun lease? | No. `queue takeover` refuses an active unexpired lease unless `--force` is explicit. | `tests/queue-command.test.ts`, `tests/work-session-store.test.ts` |
| Does `serve /chat` create queue-visible execution records? | Yes. Valid non-streaming and streaming requests create `WorkSession` / `TaskRun` records and expose the ids in response metadata. | `tests/serve-command.test.ts` |
| Can operators inspect TaskRun evidence without opening raw files? | Yes. `orca queue evidence <id>` renders typed evidence entries with paths, metadata, missing-file state, and capped previews. | `tests/queue-command.test.ts` |
| Can slash-command discovery drift between completion, picker, and `/help`? | It should not. Those committed surfaces now read command metadata from `src/slash-commands.ts`; HomePanel metadata is ready but the consumer is deferred until the UI baseline is split. | `tests/slash-commands.test.ts` |
| Can README or active PDCA docs silently advertise stale version/test evidence? | No. `tests/release-evidence.test.ts` compares package version, README strings, active PDCA docs, and the active-worktree test evidence snapshot; clean-index runs must have no more tracked test files than the snapshot. | `tests/release-evidence.test.ts` |
| Can CI drift back to build/test-only while docs advertise matrix/security/performance/eval gates? | No. The `gate-integrity` job runs matrix sync plus static, security, performance, and fast agent-eval gates. Package scripts and generated snippets are checked against `test-matrix.json`. | `.github/workflows/ci.yml`, `tests/test-matrix-sync.test.ts`, `tests/agent-eval-manifests.test.ts` |
| Can hook system-message tests spy on global stderr during parallel full-suite runs? | No. The regression injects a local writer into `runPreToolHook` so parallel tests cannot steal or restore the global stream spy. | `tests/v050-modules.test.ts` |
| Does `orca run` create queue-visible records across its branch modes? | Yes. Default, goal-loop, mission, and plan branches create WorkSession / TaskRun records and finish them with status, summary, usage, and mission evidence when available. | `tests/run-work-session.test.ts` |
| Can the declared top-level command surface fail from a clean staged checkout? | It should not. Workflow preset commands are backed by `src/commands/workflows.ts`, while `permissions`, `evolve`, and git-root helpers are committed with config coverage. | `npm run build`, `tests/config.test.ts`, `tests/permissions-command.test.ts` |
| Can terminal control sequences leak into Ink command output or markdown evidence helpers? | No. Command output is sanitized before routing to console, Ink system messages, markdown spans, tables, and code blocks. | `tests/command-output.test.ts` |
| Does interactive `orca chat` create queue-visible records for normal prompt turns? | Yes. Each normal REPL prompt is wrapped in a chat `TaskRun` under the REPL `WorkSession`, then finished with status, usage, cost, duration, and runtime observation evidence. | `tests/chat-repl-turn.test.ts`, `tests/work-session-store.test.ts` |
| Can Ink inspect TaskRun evidence without opening raw files? | Yes. `/evidence <task-run-id>` opens the same TaskRun evidence drawer model as `orca queue evidence` in an Ink `DetailPanel`. | `tests/chat-slash-readonly.test.ts`, `tests/queue-command.test.ts` |
| Does Ink keep the submitted user prompt visible after Enter? | Yes. Submitted prompts emit `user_message` and render as highlighted `You` transcript blocks. | `tests/ink-ui.test.tsx`, `tests/chat-session-emitter.test.ts` |
| Does assistant output still expose raw `###` / `**` markdown as the primary structure? | No. `MarkdownText` renders headings, bullets, inline emphasis/code, links, quotes, and code blocks into structured terminal text inside an `ORCA` panel. | `tests/ink-ui.test.tsx` |
| Can approval decisions disappear after a review-before-apply prompt? | No. Prompted, preapproved, policy-blocked, and hook-blocked decisions append to `TaskRun.approvals` and render in `orca queue evidence` plus Ink `/evidence`. | `tests/chat-proxy-tool-call.test.ts`, `tests/work-session-store.test.ts`, `tests/queue-command.test.ts` |
| Can `queue resume` claim arbitrary non-chat TaskRuns as replayable? | No. It only prints recovery commands for chat TaskRuns with saved-session metadata or monitor commands for running background jobs; unsupported replay exits without claiming a lease. | `tests/queue-command.test.ts` |
| Can `queue schedule` hand a second operator an actively leased TaskRun by default? | No. It skips active leases unless `--force` is explicit, and then claims the selected resumable or monitorable TaskRun through the same lease path. | `tests/queue-command.test.ts`, `tests/work-session-store.test.ts` |

### References

| Source | URL |
| --- | --- |
| OpenAI Codex app | https://openai.com/index/introducing-the-codex-app/ |
| OpenAI Codex automations | https://openai.com/academy/codex-automations |
| GitHub Copilot coding agent | https://docs.github.com/en/copilot/concepts/about-copilot-coding-agent |
| Cursor background agents | https://docs.cursor.com/background-agent/api/overview |
| Claude Code permissions | https://code.claude.com/docs/en/permissions |
| OpenCode agents | https://opencode.ai/docs/agents/ |
| Amp permissions | https://ampcode.com/notes/permissions |

## Requirements Ledger

| ID | Date | Type | Requirement | Status | Evidence |
| --- | --- | --- | --- | --- | --- |
| REQ-001 | 2026-04-12 | governance | Treat `/Users/mauricewen/Projects/MARUCIE-orca-cli` as canonical `PROJECT_DIR` and bootstrap project-level agent/doc entry files | done | Root docs + canonical initiative tree created |
| REQ-002 | 2026-04-12 | docs | Create structured path index, architecture summary, and CLI command-surface map before future code edits | done | `doc/index.md`, `SYSTEM_ARCHITECTURE.md`, `USER_EXPERIENCE_MAP.md` |
| REQ-003 | 2026-04-12 | docs | Keep planning/architecture HTML companions complete and derived from canonical Markdown rather than hand-maintained summaries | done | 7 companion `.html` files regenerated from `.md` sources |
| REQ-004 | 2026-04-12 | governance | Keep `CLAUDE.md` as the single project guidance source; `CODEX.md` and `GEMINI.md` should be thin references, not duplicated copies | done | Root mirror files reduced to canonical references |
| REQ-005 | 2026-04-12 | test-harness | `git_commit` must fail gracefully in non-repo directories without leaking raw git stderr into the outer test runner | done | `src/tools.ts` pipes child stdio; `tests/protocol.test.ts` adds non-repo coverage |
| REQ-006 | 2026-04-12 | feature | Internalize Hermes-inspired runtime ergonomics into Orca CLI, prioritizing core agent-loop capabilities over gateway/platform-specific features | done | Hermes release mapped to Orca runtime boundaries and implemented in Orca-local runtime seams |
| REQ-007 | 2026-04-12 | feature | First capability bundle should cover tool arg coercion, oversized tool result persistence, and background completion notifications | done | `src/tools.ts`, `src/background-jobs.ts`, `tests/hermes-runtime.test.ts` |
| REQ-008 | 2026-04-12 | architecture | Update SDK only if the new capability crosses a reusable provider-neutral runtime seam | done | `MARUCIE-open-agent-sdk` reviewed; no code change required for this Orca-local bundle |
| REQ-009 | 2026-04-12 | feature | Replace hard-coded model selection with a provider-aware model catalog that exposes context, pricing, and caution metadata | done | `src/model-catalog.ts`, `src/commands/chat.ts`, `tests/model-catalog.test.ts` |
| REQ-010 | 2026-04-12 | feature | Reuse the model catalog in `orca providers` and startup output so pre-session inspection matches in-session model selection | done | `src/commands/providers.ts`, `src/commands/chat.ts`, `tests/providers-command.test.ts` |
| REQ-011 | 2026-04-12 | feature | Add Hermes-inspired centralized runtime logging and a lightweight `orca logs` surface | done | `src/logger.ts`, `src/commands/logs.ts`, `tests/logger.test.ts`, `tests/logs-command.test.ts` |
| REQ-012 | 2026-04-12 | feature | Add a doctor-style diagnostics surface so Orca runtime/config health can be inspected without manual file spelunking | done | `src/doctor.ts`, `src/commands/doctor.ts`, `tests/doctor-command.test.ts` |
| REQ-013 | 2026-04-12 | feature | Doctor should explicitly report malformed local JSON config files rather than relying on generic parse warnings | done | `src/config-diagnostics.ts`, `src/doctor.ts`, `tests/doctor-command.test.ts` |
| REQ-014 | 2026-04-12 | feature | Headless server endpoints should expose the same runtime/provider diagnostics already available in CLI surfaces | done | `src/commands/serve.ts`, `tests/serve-command.test.ts` |
| REQ-015 | 2026-04-12 | feature | `orca stats` should evolve from cost-only output into a runtime dashboard that reuses doctor/logger signals | done | `src/commands/stats.ts`, `tests/stats-command.test.ts` |
| REQ-016 | 2026-04-12 | branding | Active source-of-truth docs and governance files should use Orca branding while preserving the actual current repo path until the directory itself is renamed | done | `AGENTS.md`, `doc/index.md`, `doc/00_project/initiative_orca/*.md` |
| REQ-017 | 2026-04-14 | governance | Correct canonical `PROJECT_DIR` references to `/Users/mauricewen/Projects/orca-cli` so planning docs match the real git root used for current work | done | `doc/index.md`, `SYSTEM_ARCHITECTURE.md`, `USER_EXPERIENCE_MAP.md`, task re-audit notes |
| REQ-018 | 2026-04-14 | ui-parity | Close the remaining behavior-accuracy gaps between Orca ink UI and CC reference behavior where the source still materially diverged | done | `ScrollBox` viewport fix, pre-paint `AlternateScreen`, Unicode cursor semantics, targeted regressions |
| REQ-019 | 2026-04-14 | input-preprocess | Make drag-pasted file paths with spaces or file URLs reliably reach Orca's existing preprocessing pipeline | done | `chat.ts` path normalization + `tests/chat-file-expansion.test.ts` |
| REQ-020 | 2026-04-14 | project-bootstrap | Make project-directory injection work for quoted and shell-escaped directory paths with spaces | done | `tryExpandDirectory()` hardening + directory-path regression tests |
| REQ-021 | 2026-04-14 | security | Remove shell-string interpolation from high-risk path/git execution paths and replace with argument-array execution | done | `convert.ts`, `worktree.ts`, `tools.ts`, `chat.ts` shell-hardening + regressions |
| REQ-022 | 2026-04-14 | ide-integration | Add a real VS Code integration surface so IDE integration is no longer just a roadmap gap | done | `integrations/vscode-orca/` skeleton + `tests/vscode-extension.test.ts` |
| REQ-023 | 2026-04-14 | multimodal | Add a real one-shot multimodal image path so Orca can send local images through proxy providers | done | `openai-compat.ts` prompt parts + `orca chat --image` + multimodal tests |
| REQ-024 | 2026-04-14 | multimodal-compat | Make budget/session/history layers tolerate multimodal message content instead of assuming raw strings everywhere | done | `ChatMessage` upgrade + token/session/chat flattening + multimodal compatibility tests |
| REQ-025 | 2026-04-14 | maintainability | Start decomposing `src/commands/chat.ts` by extracting stable helper concerns into dedicated modules | done | `src/commands/chat-input.ts` + helper test import migration |
| REQ-026 | 2026-04-14 | maintainability | Move the full path/bootstrap helper stack and persistence/config helpers out of `chat.ts` into dedicated support modules | done | `chat-input.ts` + `chat-support.ts` + green full-suite verification |
| REQ-027 | 2026-04-14 | repl-ux | Make slash autocomplete stop intercepting Enter once argument entry begins, keep slash matching case-insensitive, and suppress theme onboarding when a valid saved theme already exists while applying theme selection immediately in-session | done | `src/ui/utils.ts`, `src/ui/components/App.tsx`, `src/ui/theme.tsx`, `tests/ui-utils.test.ts`, `tests/ink-ui.test.tsx` |
| REQ-028 | 2026-04-14 | quality-program | Start a large-scale test expansion plan that began from the measured `1263/1263` planning baseline and now tracks the current `1280/1280` suite, expands breadth and depth beyond the old "~1300-case" framing, prioritizes public command-surface gaps, and uses PDCA + `AGENT_EVAL_PLAN.md` as the canonical planning surfaces | done | `AGENT_EVAL_PLAN.md` + PDCA doc updates + supplemental test-gap audit + breadth / depth / packaging tranche tests |
| REQ-029 | 2026-04-16 | sota-system | Convert the seeded `agent-eval` assets into a manifest-based fast / nightly / release gate system with a shared runner, deterministic gate tasks, a repo lock, root `--continue` smoke, `pr` missing/fetch/checkout failure smokes, tarball install smoke, `run --done-when` local success smoke, `serve /chat` SSE + non-stream happy-path smokes, timeout coverage for `providers test`, and a richer release CLI journey artifact | done | `agent-eval/manifests/*.json`, `agent-eval/scripts/run-gate.py`, `tests/agent-eval-manifests.test.ts`, release run `20260416-025253-525020` |
| REQ-030 | 2026-04-18 | feature | Port the spirit of Copilot CLI Rubber Duck into Orca as a renamed `reflect` surface with explicit command/slash entrypoints, persistent mode support, and conservative auto-triggering for clear debugging/explanation asks | done | `src/commands/reflect-mode.ts`, `src/commands/chat.ts`, `src/modes/registry.ts`, README/docs, reflect regression tests |
| REQ-031 | 2026-04-21 | audit | Execute a SOTA gap swarm audit after the benchmark, refresh current PDCA evidence, and tighten the next tranche into continuity + queue + evidence + trust deliverables | done | `SOTA_GAP_SWARM_AUDIT.md`, nightly run `20260421-074245-714923`, release run `20260421-074333-249714`, manual smoke `outputs/manual-cli-smoke/run-20260421-154536/` |
| REQ-032 | 2026-04-21 | security | Start trust hardening by making the default REPL posture safer and requiring a bearer token for non-loopback `serve` | done | `src/config.ts`, `src/commands/serve.ts`, `tests/config.test.ts`, `tests/serve-command.test.ts`, `outputs/manual-cli-smoke/run-20260421-160704/` |
| REQ-033 | 2026-04-21 | architecture | Start a unified policy executor so normal tool execution stops diverging between chat and MCP | done | `src/policy-executor.ts`, `src/commands/chat-proxy-tool-call.ts`, `src/mcp-server.ts`, `tests/chat-proxy-tool-call.test.ts`, `tests/v050-modules.test.ts` |
| REQ-034 | 2026-04-21 | ui-ux | Improve the Ink entry state so the first screen exposes one primary action, trust posture, recovery paths, and failure help | done | `src/ui/components/HomePanel.tsx`, `src/ui/components/App.tsx`, `tests/ink-ui.test.tsx`, `outputs/ui-smoke/run-20260421-165711/home-panel.txt` |
| REQ-035 | 2026-04-21 | ui-ux | Make the Ink home panel actionable so users can launch common prompts or diagnostics without typing the full command first | done | `src/ui/components/App.tsx`, `tests/ink-ui.test.tsx` |
| REQ-036 | 2026-04-21 | ui-ux | Make Ink home actions context-aware so recovery and trust actions adapt to current session state | done | `src/ui/components/App.tsx`, `src/ui/components/HomePanel.tsx`, `tests/ink-ui.test.tsx`, `outputs/ui-smoke/run-20260421-171338/home-panel-dynamic.txt` |
| REQ-037 | 2026-04-22 | test-harness | Keep aggregator-selection verification deterministic after Cloudflare gained routed-provider-key fallback, and refresh canonical fast / nightly / release / matrix evidence on the latest trust-policy tranche | done | `tests/config.test.ts`, `outputs/verification/2026-04-22-gate-refresh.md`, fast `20260422-054119-735043`, nightly `20260422-054727-090885`, release `20260422-054415-886673`, matrix `run-20260422-054827` |
| REQ-038 | 2026-04-22 | delivery | Execute a Harness-grade full-delivery pass on the current trust-policy + eval tranche, closing review/security blockers, rerunning release gates, and emitting stage artifacts plus rollback evidence | done | `src/{mcp-client.ts,policy-executor.ts,mcp-server.ts,commands/chat.ts,commands/serve.ts}`, `tests/{mcp-client.test.ts,chat-one-shot-mcp-cleanup.test.ts,v050-modules.test.ts,serve-command.test.ts,config.test.ts}`, `outputs/{spec,build,test,security,release,observe,learn}` |
| REQ-039 | 2026-04-26 | ui-ux | `/model` must keep duplicate model names provider-addressable and make large model lists readable by grouping candidates by provider | done | `src/model-catalog.ts`, `src/commands/chat.ts`, `src/commands/chat-slash-readonly.ts`, `src/ui/components/OptionPicker.tsx`, focused regressions |
| REQ-040 | 2026-05-29 | code-review | Integrate the large-PR multi-model review workflow into Orca CLI so independent model reports, synthesis, human checkbox decisions, fix logs, review verdicts, and E2E evidence are produced as one durable review ledger | done | `src/review-ledger.ts`, `src/commands/review-ledger.ts`, `tests/review-ledger.test.ts`, `README.md`, `doc/reviews/*` output contract |
| REQ-041 | 2026-05-29 | quality-gate | Reconcile `ai check` with Orca CLI's real project shape so the required project gate no longer expects `tests/test_all.py` or fails legacy docs/no-emoji debt unrelated to the current feature | done | `tests/test_all.py`, docs frontmatter/changelog normalization, no-emoji cleanup, temp git identity setup in tests, `$ORCA_HOME`-isolated usage DB tests, `outputs/check/20260529-012813-244bdac2` |

## Prompt / Workflow Notes

| ID | Prompt Pattern | Intent | Notes |
| --- | --- | --- | --- |
| PROMPT-001 | Project directory only | Bootstrap project governance before feature work | Root agent files + canonical docs are now the first action |
| PROMPT-002 | Internalize Hermes abilities into Orca CLI | Map Hermes release items to Orca-local runtime seams first; only change SDK if the seam is genuinely reusable | Active task branch |
| PROMPT-003 | Start a large-scale test expansion plan for Orca CLI | Measure the real baseline first, then split growth into breadth lanes, depth lanes, and fast / nightly / release gates, with `agent-eval` complementing Vitest instead of duplicating it | Keep it as a parallel planning track if another coding slice is already active; prioritize under-covered public command surfaces before adding more internal-only assertions |
| PROMPT-004 | Read the SOTA gap docs and build the SOTA system end-to-end | Treat the current plan docs as the gap statement, then land executable manifests, gate entrypoints, and release artifacts instead of stopping at documentation | Do not ask for permission midstream once the project root is clear |
| PROMPT-005 | Port GitHub Copilot Rubber Duck into Orca but rename and upgrade it | Make it Orca-native rather than a clone: explicit `reflect` entrypoints, persistent mode, structured diagnosis output, and conservative auto-triggering instead of opaque background duplication | Avoid GitHub/Rubber Duck branding in public UX |
| PROMPT-006 | Execute SOTA gap swarm audit, then PDCA delivery | Use a multi-lane audit to tighten broad benchmark claims into concrete product/security/operator gaps, then refresh nightly/release/manual evidence before closing docs | Do not treat historical artifacts as current proof |
| PROMPT-007 | Continue from swarm audit with trust hardening first | Prioritize the smallest high-impact trust fixes before larger continuity/queue work: safer defaults and remote-auth guardrails | Do not jump straight into queue/evidence-console implementation while the trust posture is still weak |
| PROMPT-008 | Continue trust hardening with unified policy executor | After safer defaults and serve auth land, collapse duplicated normal-tool policy logic so REPL and MCP share one executor contract | Keep the first slice narrow: normal tools first, special tools later |
| PROMPT-009 | Execute frontend UI/UX optimization for the current primary frontend | In this repo the primary frontend is Ink TUI, so optimize the entry shell rather than inventing a browser UI; document browser-only validation gates as `N/A` when the target surface is terminal-only | Keep one primary action and make failure/trust state legible from the first frame |
| PROMPT-010 | Continue the Ink entry-state optimization with interaction, not more decoration | After the home panel exists, make it actionable through quick actions and keep the interaction model aligned with existing pickers and prompt flow | Prefer reusing `OptionPicker` over inventing a second launcher UI |
| PROMPT-011 | Continue the home panel with dynamic recommendations | After quick actions exist, make them react to saved-session availability and trust posture rather than staying static | Prefer deterministic context signals over speculative AI recommendation |
| PROMPT-012 | Refresh the harness baseline after a late-stage provider-routing change | Reproduce the failing gate, fix the smallest stale assumption, then rerun fast / nightly / release / matrix before closing docs | Do not treat lock conflicts or stale machine env as product regressions until they are proven to be runtime bugs |
| PROMPT-013 | Execute one-click full delivery on the current tranche | Freeze the delivery boundary, treat review findings as blocking gates, fix only the scoped blockers, rerun the full release chain, and emit stage artifacts plus rollback evidence | Do not drift into future roadmap implementation when the user asked for delivery closure on the current tranche |
| PROMPT-014 | Fix false completion claims and verify Copilot-style self-review hooks | Treat unsupported claims as a runtime safety defect, not just a model behavior issue; hook lifecycle must fire consistently and claim evidence must be checked against actual tool traces | One-shot launches must not bypass hooks; Stop hooks need response evidence; do not trust "done/passed/published" wording without matching tool calls |
| PROMPT-015 | Fix history scrollback and required local file generation | Treat the user's evidence as runtime defects: input-focused Ink scrollback must still accept non-text scroll keys, and local file save/create requests must result in real `write_file`/`open_file`/`file_info` evidence or a hard incomplete notice | Do not rely on model prompt compliance for local file side effects; runtime must repair artifact output or mark the task incomplete |
| PROMPT-016 | Turn a successful multi-model code review practice into an Orca command | Keep first-pass model reports independent, synthesize only after all reports are saved, preserve human checkboxes as the decision gate, and separate fix agent, review agent, and E2E evidence | Do not let LLM agreement auto-fix issues; agreement raises review priority but Maurice decides accepted/rejected/deferred |

## Anti-Regression Q&A

| Question | Answer |
| --- | --- |
| What is the canonical project doc root? | `doc/00_project/initiative_orca/` |
| Where should architecture and UX updates go? | `SYSTEM_ARCHITECTURE.md` and `USER_EXPERIENCE_MAP.md` in the initiative tree |
| Does this repo have web routes? | No. Treat command surfaces as the UX map. |
| How should companion HTML docs be maintained? | Regenerate them from the Markdown source; do not maintain abridged manual summaries. |
| Which file is the canonical root guidance for agent-specific mirrors? | `CLAUDE.md` |
| How should `git_commit` behave outside a git repo? | Return a normal tool failure payload, not leak raw child-process stderr to the test runner. |
| Which Hermes-inspired capabilities are now internalized in Orca? | Tool arg coercion, oversized tool result persistence, detached background work, provider-aware model inspection, local logs, doctor diagnostics, serve metadata parity, and stats runtime dashboarding. |
| Did the SDK need a matching code change? | No. This bundle is Orca-local runtime ergonomics, not a shared SDK seam yet. |
| What does `/models` show now? | Provider-grouped model choices with context window, approximate pricing, and caution metadata; duplicate model names resolve through provider+model identity instead of the first matching name. |
| What does `orca providers` add now? | It shows readiness plus the same context/pricing/caution metadata used by the REPL model catalog. |
| Where do Orca runtime logs live now? | `~/.orca/logs/` or `$ORCA_HOME/logs/`, with `agent.log` and `errors.log`. |
| What does `orca doctor` cover? | Provider/config readiness, hooks, MCP, sessions, background jobs, log files, project context, and git availability. |
| How are malformed config files surfaced now? | Through `doctor` config diagnostics; parse failures are logged locally and reported explicitly in doctor output. |
| What does `orca serve` expose now beyond raw chat? | `/health`, `/providers`, and `/doctor` all reuse the same provider/model/runtime diagnostics as the CLI. |
| What does `orca stats` show now beyond usage? | Runtime health and recent error summaries, sourced from doctor/logger alongside usage-db. |
| Why is the SDK still unchanged? | These Hermes-inspired slices are still Orca-local runtime ergonomics; no reusable provider-neutral seam has been justified yet. |
| What is the current canonical repo path? | `/Users/mauricewen/Projects/orca-cli` is the real git root and should be treated as the canonical `PROJECT_DIR` for ongoing work. |
| Can Orca now understand drag-pasted file paths with spaces? | Yes for file paths: quoted paths, shell-escaped spaces, and percent-encoded `file:///` URLs now normalize into the existing file-preprocess path. |
| Can Orca now understand project directory paths with spaces? | Yes for quoted and shell-escaped directory paths in common prompt positions; they now trigger project-context injection correctly. |
| What security hardening was added in this review tranche? | High-risk shell-built path/git invocations were moved to `execFileSync(...args)` so user/model-controlled strings stop flowing through shell interpolation. |
| What IDE integration exists now? | A zero-dependency VS Code extension skeleton can launch Orca chat, current-file review, selection review, MCP server, and doctor directly from VS Code terminals. |
| What multimodal support exists now? | `orca chat --image <path...> "prompt"` works on the proxy path by sending local images as `image_url` content parts; interactive REPL image paste is still not implemented. |
| Are session/history layers still string-only? | No. They now tolerate multimodal message content by flattening to text where legacy text-only surfaces still need compatibility. |
| Has `chat.ts` started to be split up? | Yes. `chat-input.ts` now owns safe `/git`, image prompts, file expansion, and project bootstrap; `chat-support.ts` owns config/persistence helpers. |
| Why did slash commands feel invalid after typing arguments? | The ink command picker stayed active after the user entered whitespace-delimited arguments, so Enter selected the picker item instead of submitting the full typed command. The picker must hide once argument entry begins. |
| Why was the theme picker reappearing on every launch? | Two issues compounded: the ink app only checked `ORCA_THEME` when deciding whether to show onboarding, and the persisted-theme helper used CommonJS `require('fs')` inside an ESM runtime, so `~/.orca/theme` reads fell into the catch path. Launch gating now respects both sources and reads the file with ESM-safe `node:fs`. |
| Does slash autocomplete still work if I type `/Help` or `/H`? | Yes. Picker visibility now follows slash-command dispatch semantics case-insensitively, so uppercase prefixes still surface the matching command list. |
| Does choosing a theme only affect the next launch? | No. Theme selection now updates the active ink theme immediately in the current session and is still persisted to `~/.orca/theme` for future launches. |
| What is the current canonical baseline for the large-scale quality program? | The current measured baseline is `1280/1280` from `npm test`; the planning track started from `1263/1263`, and older totals in flat docs are historical reference points rather than the live canonical number. |
| What has the first breadth tranche already locked down? | `tests/command-contracts.test.ts` now guards the root public surface plus `session`, `pr`, `providers test`, and `serve` command contracts so the next tranches can focus on deeper execution paths instead of re-discovering registration drift. |
| What concrete regression did the first depth tranche uncover? | `session` used a recursive default action that could stack overflow, and session recovery logic needed to skip corrupted latest files while honoring `ORCA_HOME`; both are now covered by `tests/session-command.test.ts` and fixed in the runtime. |
| What do the packaging smokes prove now? | `tests/packaging-smoke.test.ts` proves `npm run build` emits the packaged dist entrypoints, `npm pack --json --dry-run` ships them, and the built `dist/bin/orca.js` binary serves both `--help` and `doctor --json` correctly. |
| What is the current fast-gate task-eval baseline? | The fast gate now has `23` black-box tasks and the latest successful run is `20260416-025122-895826`, which passed `23/23` with no pending graders. Nightly and release currently pass at `26/26` (`20260416-025203-735063`) and `29/29` (`20260416-025253-525020`). |
| Where should the large-scale evaluation plan live? | In repo-root `AGENT_EVAL_PLAN.md`, with PDCA details under `doc/00_project/initiative_orca/`. |
| How should future test growth be organized? | Use deterministic Vitest breadth/depth lanes plus a manifest-driven `agent-eval` scenario pack, split by fast / nightly / release gates. |
| Which surfaces are the current high-value gaps to cover next? | deeper `pr` auth/network flows beyond the new missing/invalid/fetch/checkout-failure smokes, additional `session` error contracts beyond missing show/delete, richer `serve /chat` protocol variants beyond the new SSE + non-stream happy/error smokes, richer `run` task-execution paths beyond the new `--done-when` smoke, provider-inspection branches beyond the new transport/timeout failures, and broader installed-binary user-path flows beyond the new tarball install smoke. |
| What is the main security caveat of the new eval system? | `agent-eval/tasks/*.json` are trusted executable assets because `run-gate.py` executes their commands through `shell=True`; changes to task/manifests should be reviewed like scripts. |
| What concrete shape did the 2026-04-21 swarm audit give the remaining SOTA gap? | The next tranche is now explicitly: trust hardening, canonical `WorkSession` / `TaskRun` objects, async queue/take-over, and an evidence console. |
| What gate regression did the PDCA refresh uncover? | `run-gate.py` and `run-test-matrix.py` used `datetime.UTC`, which broke under Python 3.9 in isolated eval environments; both were switched to `timezone.utc` and nightly/release were rerun successfully. |
| What changed in trust hardening tranche 1? | Legacy config `default` now resolves to REPL `auto`, and non-loopback `serve` now requires `ORCA_SERVE_TOKEN` plus `Authorization: Bearer <token>` on requests. |
| What changed in trust hardening tranche 2? | `src/policy-executor.ts` now owns the shared normal-tool policy contract, and MCP normal tool execution now fails closed under the same approval/tool-filter/sandbox rules as chat. |
| What changed in the 2026-04-21 UI/UX tranche? | The Ink empty state now renders a dedicated `HomePanel` with one primary action, trust/state summary, quick paths, and failure help; browser-only validation gates were marked `N/A` because this target surface is TUI. |
| What changed in the interactive home-panel follow-up? | `Tab` now opens quick actions from the empty state, and those actions can launch common prompts or diagnostics without typing the full command first. |
| What changed in the context-aware home-action follow-up? | The home panel and quick-action picker now react to saved-session availability and trust posture, so recovery actions such as `/sessions` appear only when they are actually useful. |
| Why could the aggregator smoke and nightly gate fail on one machine but pass on another? | After Cloudflare gained routed-provider-key fallback, `findAggregator()` could still choose `cloudflare` when only upstream provider keys (for the selected model prefix) were present. Negative aggregator tests must clear those provider env vars too, not just aggregator tokens. |
| What is the safe default for repo-local MCP after the 2026-04-22 delivery pass? | Repo-local/project-scoped MCP is loaded for discovery but is not auto-connected on startup. Only home/global-scoped MCP is startup-safe by default; project-scoped MCP requires explicit `/mcp connect` or equivalent operator action. |
| What does `allowedTools: []` mean now? | Deny-all. Any defined allowlist, including the empty list, is authoritative for both `tools/list` advertisement and `tools/call` execution. |
| Why were hook notices moved to stderr? | MCP uses stdout as line-delimited JSON-RPC transport. Human-readable hook messages on stdout can corrupt protocol framing, so they must go to stderr or a structured payload. |
| Does `serve` already have any command coverage? | Yes. There is metadata smoke coverage today; the real gap is deeper `/chat`, error-path, and response-contract coverage rather than zero coverage. |
| What shell pitfall showed up while seeding `agent-eval` tasks? | Do not background the full `&&` chain when a task depends on shell variables such as `TMP_HOME` or `PORT`; define variables in the foreground shell first, then background only the long-running process. |
| How should Orca expose a Rubber-duck-style workflow? | As `reflect`: explicit `orca reflect`, `/reflect`, and `/mode reflect` surfaces, plus conservative auto-triggering only for clear debugging/explanation prompts. |
| What makes Orca `reflect` more SOTA than a plain rubber-duck alias? | It restructures prompts around symptom/hypothesis/evidence/root-cause/next-step, persists as a behavioral mode, and keeps the auto-trigger visible instead of silently spawning duplicate critique agents. |
| Why did `orca chat --image` fail on GitHub Copilot with `Invalid 'tools'`? | Copilot rejects requests with more than 128 tool definitions. Orca now trims the outgoing tool array to 128 for `api.githubcopilot.com` so multimodal requests keep working even when MCP expands the toolset. |
| Why did `orca chat --image` still fail on `copilot/gpt-5.4` after tool trimming? | `gpt-5.x` on the OpenAI-compatible `/v1/chat/completions` path rejects `function tools + reasoning_effort`. Orca now suppresses `reasoning_effort` for that specific chat-completions combination while keeping effort on tool-free requests. |
| Why could `orca chat --image` still feel hung in a MCP-heavy home directory? | One-shot image requests used to auto-connect all configured MCP servers before sending the screenshot. Orca now skips MCP auto-connect for `--image` one-shot requests so screenshot analysis returns without unrelated MCP startup delays. |
| Why could Orca say something was done when it was not? | The model could emit unsupported completion wording, and Orca previously lacked a generic evidence guard plus had lifecycle gaps: one-shot did not load hooks, `Stop` did not fire after responses, and `SubagentStop` did not fire after delegation. |
| What now prevents unsupported completion claims? | `claim-evidence-guard` checks assistant text against the current turn's executed tool names and appends a pending warning when file/test/git/deploy/MCP claims lack matching tool evidence. |
| Are Copilot-style self-review hooks now usable in Orca? | Yes for the fixed lifecycle: one-shot and REPL run `UserPromptSubmit`, `Stop` fires after model output with `ORCA_RESPONSE` / `CLAUDE_RESPONSE`, and `SubagentStop` fires after delegated work. |
| Why could history output not scroll upward while typing? | `App` disabled `ScrollBox.keyboardActive` whenever the prompt input was active, so PageUp/PageDown and shifted arrow scrolling were blocked during normal REPL use. Non-text scroll keys now stay active while text shortcuts `g/G` remain disabled during input. |
| Why could Orca still fail to create/open requested Markdown files? | Local file handling was prompt-driven plus best-effort false-save repair. Refusal responses or plain generated Markdown without a false save claim did not force a tool call. `buildPostModelRequiredFileWritePlan()` now writes generated artifacts for explicit save targets, and `buildLocalFileEnforcementNotice()` marks missing file operations incomplete. |
| How should Orca review a very large PR with multiple models? | Use `orca review-ledger --pr <number> --models <csv>` or `--diff-file <patch>`. It writes independent reports, a synthesis ledger, human decisions, fix log, review verdict, and E2E evidence artifacts. |
| Does multi-model agreement mean Orca should automatically fix an issue? | No. Agreement raises priority for human review, but fix agents may only act after `05_human_decisions.md` marks the issue `accepted`. |
| Why did `ai check` fail earlier, and what fixed it? | Earlier runs failed because the generic AI-Fleet project gate needed an Orca-local `tests/test_all.py`, required docs metadata/changelogs, no-emoji cleanup, refreshed release evidence counts, deterministic temp git identity in tests, and isolated usage DB state for parallel test runs. Those blockers are now fixed; the final project gate passed in `outputs/check/20260529-012813-244bdac2`. |

## References

- `README.md`
- `src/program.ts`
- `src/commands/multi.ts`
- `doc/THREE_TIER_ARCHITECTURE.md`

## Changelog

| Date | Change |
| --- | --- |
| 2026-05-29 | Normalized metadata for the project ai check gate and recorded the multi-model review ledger integration. |
