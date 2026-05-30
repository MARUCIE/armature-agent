---
Title: Orca CLI User Experience Map
Scope: project UX map
Owner: Maurice
Status: Active
LastUpdated: 2026-05-29
---
# Orca CLI User Experience Map

## 2026-05-29 UX Delta - Multi-Model Review Ledger

New operator journeys from the large-PR multi-model review workflow:

| Journey | User Need | Entry | Evidence |
| --- | --- | --- | --- |
| Run independent model reviews | Send the same PR / diff to several models without cross-contaminating their first-pass findings | `orca review-ledger --pr <number> --models <csv>` | `src/commands/review-ledger.ts`, `src/review-ledger.ts` |
| Prepare a deterministic review packet | Generate prompts and ledger templates without spending provider tokens | `orca review-ledger --diff-file <patch> --dry-run --json` | `tests/review-ledger.test.ts`, CLI dry-run smoke |
| Review consensus before fixing | See Critical / High / Medium issues deduplicated with model agreement and checkboxes | `04_synthesis.md` | `buildSynthesisPrompt()` |
| Preserve human decision authority | Accept, reject, or defer each issue before fix agents can act | `05_human_decisions.md` | `renderHumanDecisionTemplate()` |
| Separate fix and review loops | Track fix-agent changes separately from review-agent verification | `06_fix_log.md`, `07_review_verdict.md` | review ledger artifact contract |
| Close with regression evidence | Require targeted tests plus full E2E evidence before the review is complete | `08_e2e_evidence.md` | `renderE2eEvidenceTemplate()` |

## 2026-05-03 UX Delta - Markdown Artifact Write Integrity

New operator journeys from the Markdown artifact write regression:

| Journey | User Need | Entry | Evidence |
| --- | --- | --- | --- |
| Generate a clean Markdown file | Ask Orca to generate a `.md` document and get only the requested article/document body in the file | `orca chat` / provider proxy save request | `src/commands/local-file-intent.ts`, `tests/local-file-intent.test.ts` |
| Avoid chat transcript pollution | Prevent save confirmations, explanations, or prior chat text from being written into the target `.md` file | false-save repair path | `tests/chat-internals.test.ts` |
| Avoid unsafe repair when no artifact exists | If a model only says it saved a file but provides no generated body, Orca does not fabricate a polluted file | post-model repair guard | `tests/local-file-intent.test.ts` |

## 2026-05-02 UX Delta - Local File Tool Continuity and Orca Mark

New operator journeys from the long-session tool-call fix, test matrix closure, and startup mark refresh:

| Journey | User Need | Entry | Evidence |
| --- | --- | --- | --- |
| Create and open a local Markdown file in a long chat | Ask Orca to write and visually open a `.md` file without the model claiming it has no local access after earlier turns | `orca chat` REPL with history | `src/providers/openai-compat.ts`, `src/system-prompt.ts`, `tests/openai-compat-multimodal.test.ts`, `tests/e2e-workflow.test.ts` |
| Recover a falsely claimed saved file | Say the file is missing and ask Orca to open it; Orca reconstructs the claimed file from chat history, writes it, then opens it | `orca chat` follow-up prompt such as `本地没有这个文件，给我打开` | `src/commands/local-file-intent.ts`, `src/commands/chat-repl-turn.ts`, `tests/local-file-intent.test.ts`, `tests/chat-repl-turn.test.ts` |
| Stop false save claims from becoming silent failures | When a model says `saved to <path>` but did not call a file tool, the proxy runtime writes the file and records the guard result | streamed proxy turn | `src/commands/chat.ts`, `tests/chat-internals.test.ts` |
| Verify all tool-call paths together | Run one canonical matrix lane instead of remembering scattered tool tests | `npm run test:tool-calls` | `agent-eval/manifests/test-matrix.json`, `agent-eval/generated/test-matrix-entrypoints.md` |
| Recognize Orca immediately on startup | See a dominant `ORCA-AGENT` wordmark and clean session deck without separate mascot/icon art | default Ink startup banner | `src/ui/components/Banner.tsx`, `tests/ink-ui.test.tsx` |
| Keep Hermes-style branding mechanics without copying Hermes | Benefit from large wordmark hierarchy, theme-aware deck, and operational status while preserving Orca identity | Banner / HomePanel first frame | `src/ui/components/Banner.tsx`, `src/ui/theme.tsx` |

## 2026-05-02 UX Delta - Model Metadata Consistency

New operator journeys from the model-catalog SSoT tranche:

| Journey | User Need | Entry | Evidence |
| --- | --- | --- | --- |
| Trust model capacity labels | See the same context/max-output metadata in startup info, model picker, provider inspection, and runtime budget behavior | `orca chat`, `/model`, `/models`, `orca providers` | `src/model-metadata.ts`, `src/model-catalog.ts`, `src/output.ts`, `tests/model-catalog.test.ts` |
| Trust cost summaries | Avoid pricing drift between model-picker metadata and usage/session cost estimates | turn summary and session summary | `src/model-metadata.ts`, `src/output.ts` |
| Avoid runtime metadata drift | Know token budget guards and OpenAI-compatible request defaults use the same metadata as operator-facing model selection | normal provider calls and context guard behavior | `src/token-budget.ts`, `src/providers/openai-compat.ts`, `tests/model-catalog.test.ts` |

## 2026-05-02 UX Delta - Copyable Terminal and Stable Tool Workspace

New operator journeys from the terminal-operability hardening tranche:

| Journey | User Need | Entry | Evidence |
| --- | --- | --- | --- |
| Copy Orca output normally | Select and copy visible transcript text from the terminal without fighting alternate screen or mouse capture | default `orca chat` Ink UI | `src/ui/render.tsx`, `src/ui/components/App.tsx`, `tests/ink-ui.test.tsx` |
| Opt into no-flicker fullscreen behavior | Suppress terminal repaint flashes with Claude-style alternate-screen rendering only when explicitly desired | `ORCA_TUI=fullscreen orca chat`, `ORCA_NO_FLICKER=1 orca chat`, or `CLAUDE_CODE_NO_FLICKER=1 orca chat` | `src/ui/render.tsx`, `src/ui/components/AlternateScreen.tsx`, `src/ui/components/App.tsx` |
| Opt into mouse wheel capture | Restore app-level mouse wheel handling only when explicitly desired | `ORCA_MOUSE=1 orca chat` | `src/ui/components/App.tsx` |
| Launch from a menu or home directory | Keep tools pointed at the last real project workspace instead of accidental `~` cwd | `orca`, `ai 7`, launcher wrappers | `src/commands/chat-support.ts`, `tests/chat-support.test.ts` |
| Force a project from any launcher | Pass a specific project directory without changing shell cwd | `orca --cwd <project>`, `orca chat --cwd <project>` | `src/program.ts`, `src/commands/chat.ts`, `tests/program.test.ts` |
| Open a Markdown file visually | Ask the agent to open a local `.md` or other document in the OS default app | `open_file` tool | `src/tools.ts`, `tests/tools.test.ts` |
| Use Codex/OMX MCP tools | Route MCP tool calls for server names that contain `_` or `-` | `mcp__omx_code_intel__...` | `src/mcp-client.ts`, `tests/mcp-client.test.ts` |

## 2026-05-02 UX Delta - Critique Quality Gate

New operator journeys from the Rubber Duck Critique tranche:

| Journey | User Need | Entry | Evidence |
| --- | --- | --- | --- |
| Challenge a plan before implementation | Ask a separate reviewer to find plan gaps before execution starts | `orca critique --checkpoint after_plan --plan-file <file>` | `src/commands/critique.ts`, `tests/critique.test.ts` |
| Review a complex working-tree diff | Gate a multi-file or sensitive implementation before tests or final review | `orca critique --checkpoint after_complex_implementation` | `src/critique.ts`, `src/commands/critique.ts` |
| Inspect risk without spending tokens | See whether a checkpoint would run and why without live model credentials | `orca critique --dry-run --json` | `tests/critique.test.ts` |
| Inspect critique risk mid-chat | Check risk and reviewer choice from the active REPL without leaving the session | `/critique --checkpoint after_plan` | `src/commands/chat-slash-readonly.ts`, `tests/chat-slash-readonly.test.ts` |
| Notice risky dirty diffs before sending | Get a local reminder to challenge a large working-tree diff before the next provider call | automatic chat pre-send notice | `src/critique-auto.ts`, `src/commands/chat-repl-turn.ts`, `tests/chat-repl-turn.test.ts` |
| Notice risky dirty diffs in one-shot chat | Get the same local reminder before `orca chat "prompt"` starts a one-shot provider run | one-shot chat pre-send notice | `src/commands/chat.ts`, `tests/chat-one-shot-mcp-cleanup.test.ts` |
| Avoid repeated critique noise | See the automatic reminder once per dirty diff signature instead of every turn | repeat suppression in the chat session | `src/critique-auto.ts`, `tests/critique.test.ts` |
| Tune automatic critique hints per session | Disable or retune local pre-send hints for the current REPL without changing env vars | `orca chat --no-auto-critique`, `orca chat --auto-critique-threshold 0.4` | `src/commands/chat.ts`, `tests/command-contracts.test.ts` |
| Review critique output in Ink | Open checkpoint, risk, files, and diff-line evidence as an in-app detail panel | `/critique` in Ink chat | `src/commands/chat-slash-readonly.ts` |
| Recover from repeated failures | Trigger a critique when the main loop keeps making similar fixes | `orca critique --checkpoint stuck_loop --repeated-failure` | `src/critique.ts` |
| Keep reflection and critique distinct | Use `reflect` for Socratic diagnosis and `critique` for read-only reviewer challenge | `orca reflect`, `orca critique` | `README.md`, `src/commands/reflect-mode.ts`, `src/commands/critique.ts` |

## 2026-05-01 UX Delta - Pod Helm Footer

New operator journeys from the helm-footer UI/UX tranche:

| Journey | User Need | Entry | Evidence |
| --- | --- | --- | --- |
| Read persistent helm guidance | Keep Orca identity visible in the bottom shortcut rail after the banner scrolls away | Footer | `src/ui/components/Footer.tsx`, `tests/ink-ui.test.tsx` |
| Interrupt active output clearly | Know that `esc` interrupts the current echo without losing the generating-state hint | Generating Footer | `src/ui/components/Footer.tsx` |
| Send a pod brief | Understand `enter` as submitting a brief to the pod rather than a generic send action | Active input Footer | `src/ui/components/Footer.tsx`, `tests/ink-ui.test.tsx` |
| Open pod commands | Read `/help` as the command surface for the pod | Active / idle Footer | `src/ui/components/Footer.tsx`, `tests/ink-ui.test.tsx` |
| Preserve trust-mode awareness | Keep `shift+tab` and the active permission mode/source visible while the footer gains Orca language | Active / idle Footer | `src/ui/components/Footer.tsx` |
| Avoid broken shortcut wraps | Keep ordinary-width terminals from splitting `POD HELM` and key labels into incoherent columns | Footer responsive rendering | `src/ui/components/Footer.tsx`, `tests/ink-ui.test.tsx` |

## 2026-05-01 UX Delta - Pod Council Runway

New operator journeys from the council-runway UI/UX tranche:

| Journey | User Need | Entry | Evidence |
| --- | --- | --- | --- |
| Track a multi-model pod run | See council, race, or pipeline progress as coordinated Orca pod work | MultiModelProgress | `src/ui/components/MultiModelProgress.tsx`, `tests/ink-ui.test.tsx` |
| Read active command and voice count | Know which multi-model command is running and how many model voices are involved | MultiModelProgress header | `src/ui/components/MultiModelProgress.tsx` |
| Distinguish surfaced voices | Identify completed model outputs without losing model name or elapsed time | Completed model row | `src/ui/components/MultiModelProgress.tsx`, `tests/ink-ui.test.tsx` |
| Distinguish active sonar scans | Identify in-progress model work as sonar scanning while preserving spinner feedback | Active model row | `src/ui/components/MultiModelProgress.tsx`, `tests/ink-ui.test.tsx` |

## 2026-05-01 UX Delta - Pod Evidence Drawer

New operator journeys from the evidence-drawer UI/UX tranche:

| Journey | User Need | Entry | Evidence |
| --- | --- | --- | --- |
| Read detail panels as surfaced evidence | Recognize status, permission, notes, thread, and TaskRun detail panels as one Orca evidence family | DetailPanel | `src/ui/components/DetailPanel.tsx`, `tests/ink-ui.test.tsx` |
| Keep source context visible | See the original detail title and subtitle after the Orca frame label is added | DetailPanel title/subtitle | `src/ui/components/DetailPanel.tsx` |
| Understand detail context as a pod scan | Read `pod scan` before the original subtitle without losing the source metadata | DetailPanel subtitle | `src/ui/components/DetailPanel.tsx`, `tests/ink-ui.test.tsx` |
| Preserve markdown evidence readability | Keep body markdown rendering identical while the frame becomes Orca-branded | MarkdownText in DetailPanel | `src/ui/components/DetailPanel.tsx`, `src/ui/components/MarkdownText.tsx` |

## 2026-05-01 UX Delta - Pod Trust Gate

New operator journeys from the trust-gate UI/UX tranche:

| Journey | User Need | Entry | Evidence |
| --- | --- | --- | --- |
| Read approval as a trust boundary | Understand that a tool is crossing a permission boundary before allowing it | PermissionPrompt | `src/ui/components/PermissionPrompt.tsx`, `tests/ink-ui.test.tsx` |
| Scan tool impact before deciding | See the tool preview under `SCAN` before selecting allow or deny | PermissionPrompt preview | `src/ui/components/PermissionPrompt.tsx` |
| Pick the correct trust scope | Distinguish one-time approval from session trust and project policy persistence | PermissionPrompt choices | `src/ui/components/PermissionPrompt.tsx`, `tests/ink-ui.test.tsx` |
| Deny quickly without ambiguity | Hold the boundary through `Deny`, `n`, or Esc without changing existing semantics | PermissionPrompt footer / keybindings | `src/ui/components/PermissionPrompt.tsx` |
| Review writes as an echo diff | Read write previews as `ECHO DIFF` while retaining file path, counts, line numbers, and truncation | DiffPreview | `src/ui/components/DiffPreview.tsx`, `tests/ink-ui.test.tsx` |

## 2026-05-01 UX Delta - Pod Proof Wake

New operator journeys from the proof-wake UI/UX tranche:

| Journey | User Need | Entry | Evidence |
| --- | --- | --- | --- |
| Read a completed turn's proof wake | See a compact completion receipt after the assistant response finishes | TurnSummary after `turn_summary` event | `src/ui/components/TurnSummary.tsx`, `tests/ink-ui.test.tsx` |
| Interpret token flow without internal shorthand | Read `time`, `in`, `out`, `tools`, cost, and throughput instead of `r`, `d`, and `u` | Post-turn summary | `src/ui/components/TurnSummary.tsx` |
| Preserve accounting trust | Confirm UI wording changed without altering usage payloads or provider behavior | `TurnSummaryInfo` unchanged | `src/ui/types.ts`, `tests/ink-ui.test.tsx` |

## 2026-05-01 UX Delta - Pod Status Rail

New operator journeys from the status-rail UI/UX tranche:

| Journey | User Need | Entry | Evidence |
| --- | --- | --- | --- |
| Read persistent pod identity | Keep Orca identity visible after the startup banner scrolls away | Fixed StatusBar line 1 | `src/ui/components/StatusBar.tsx`, `tests/ink-ui.test.tsx` |
| Interpret context as sonar load | Understand context pressure as an operational signal instead of an unlabeled meter | StatusBar context segment | `src/ui/components/StatusBar.tsx`, `tests/ink-ui.test.tsx` |
| Scan live session metrics | Read cost, throughput, turns, session id, policy summaries, output style, and sparkline as one signal rail | StatusBar line 2 | `src/ui/components/StatusBar.tsx` |
| Check trust posture quickly | See permission mode, source, behavior mode, effort, and shift-tab cycling guidance in one trust rail | StatusBar line 3 | `src/ui/components/StatusBar.tsx`, `tests/ink-ui.test.tsx` |

## 2026-05-01 UX Delta - Pod Transcript Flow

New operator journeys from the transcript-flow UI/UX tranche:

| Journey | User Need | Entry | Evidence |
| --- | --- | --- | --- |
| Read submitted prompts as operator briefs | Keep the user's own prompt visible as an Orca-owned `POD BRIEF` block | Press Enter in Ink chat | `src/ui/components/App.tsx`, `tests/ink-ui.test.tsx` |
| Read assistant output as pod response | See assistant markdown in an `ORCA POD` panel with headings and bullets rendered structurally | Assistant response / turn summary | `src/ui/components/App.tsx`, `src/ui/components/MarkdownText.tsx`, `tests/ink-ui.test.tsx` |
| Understand streaming as live echolocation | Read in-progress assistant output as `ORCA POD echoing` rather than a generic stream | Assistant streaming | `src/ui/components/App.tsx` |
| Track tools as evidence scans | Recognize active and completed tool calls as `ECHO TOOL` rails while keeping tool name, path, result, and duration visible | Tool start/end events | `src/ui/components/App.tsx`, `src/ui/components/ToolCallBlock.tsx`, `tests/ink-ui.test.tsx` |
| Interpret waiting state as pod work | See compact `POD <verb>...` feedback tied to listening, routing, verifying, and evidence surfacing | ThinkingSpinner | `src/ui/components/ThinkingSpinner.tsx`, `tests/ink-ui.test.tsx` |

## 2026-05-01 UX Delta - Pod Command Surface

New operator journeys from the command-surface UI/UX tranche:

| Journey | User Need | Entry | Evidence |
| --- | --- | --- | --- |
| Brief the pod from the prompt | Start typing from an Orca-owned input surface instead of a generic message box | InputArea empty state | `src/ui/components/InputArea.tsx`, `tests/ink-ui.test.tsx` |
| Discover commands without losing brand context | Browse slash commands inside a `POD COMMANDS` picker with filter feedback | Type `/` or use command picker | `src/ui/components/CommandPicker.tsx`, `tests/ink-ui.test.tsx` |
| Recover from an over-specific command filter | See `no matching command` instead of a disappearing picker | CommandPicker filtered no-match state | `src/ui/components/CommandPicker.tsx`, `tests/ink-ui.test.tsx` |
| Select finite options with Orca hierarchy | Pick modes, models, themes, or actions with the same Orca semantic color language | OptionPicker surfaces | `src/ui/components/OptionPicker.tsx` |
| Read shared picker framing consistently | Recognize all picker panels as the same terminal control family | PickerFrame | `src/ui/components/PickerFrame.tsx` |

## 2026-05-01 UX Delta - Cute Orca Mascot Entry

Superseded on 2026-05-02 for the startup Banner: the independent mascot/icon block is removed. The HomePanel pod-brief journey remains active.

New operator journeys from the mascot UI/UX tranche:

| Journey | User Need | Entry | Evidence |
| --- | --- | --- | --- |
| Recognize Orca startup identity | See a dominant `ORCA-AGENT` wordmark and clean live state deck, not a mascot/icon block | `orca`, `orca chat` startup | `src/ui/components/Banner.tsx`, `tests/ink-ui.test.tsx` |
| Understand the logo system | Read the Hermes-inspired structure as wordmark + live state, without copying Hermes's caduceus or adding a mascot | Banner | `src/ui/components/Banner.tsx` |
| Brief the pod | Give Orca one outcome in a friendly first panel rather than a generic mission-control prompt | HomePanel `POD BRIEF` | `src/ui/components/HomePanel.tsx` |
| Keep operational context visible | Preserve trust, model, session, tools, recovery, and guardrails after the startup cleanup | HomePanel / StatusBar | `src/ui/components/HomePanel.tsx`, `src/ui/components/StatusBar.tsx` |

## 2026-04-30 UX Delta - Blackfin Signal Entry Deck

New operator journeys from the visual system tranche:

| Journey | User Need | Entry | Evidence |
| --- | --- | --- | --- |
| Recognize Orca immediately | See a distinctive `ORCA` wordmark and killer-whale pod signal motif before reading details | `orca`, `orca chat` startup | `src/ui/components/Banner.tsx`, `tests/ink-ui.test.tsx` |
| Read operational startup state | Confirm model, cwd, trust, config, session, and fleet state without scanning raw logs | Banner info deck | `src/ui/components/Banner.tsx` |
| Start from pod brief intent | Focus the first screen on the next objective rather than decorative onboarding copy | HomePanel `POD BRIEF` | `src/ui/components/HomePanel.tsx` |
| Check live pod state | See trust mode, workflow mode, model, session id, and tool count as a compact operator panel | HomePanel `POD SIGNAL` | `src/ui/components/HomePanel.tsx` |
| Recover without remembering commands | Continue sessions, inspect permissions, run doctor, switch models, or open evidence from the first screen | HomePanel `RECOVER` | `src/ui/components/HomePanel.tsx` |
| Pick identity deliberately | See `Blackfin Signal` as the default while preserving existing theme choices | ThemePicker | `src/ui/components/ThemePicker.tsx` |
| Track status consistently | Read the status bar as an Orca pod surface rather than a generic status strip | StatusBar | `src/ui/components/StatusBar.tsx` |

## 2026-04-29 UX Delta - Queue and Trust

New operator journeys:

| Journey | User Need | Entry | Evidence |
| --- | --- | --- | --- |
| Inspect running/completed agent work | See current TaskRun queue without opening raw files | `orca queue list`, `orca queue show <id>` | `src/commands/queue.ts`, `tests/queue-command.test.ts` |
| Follow live TaskRun evidence | Stream appended evidence logs until a TaskRun reaches a terminal state | `orca queue follow <id>` | `src/commands/queue.ts`, `tests/queue-command.test.ts` |
| Open a TaskRun evidence drawer | Inspect logs, diffs, data, reports, missing artifacts, and capped previews by TaskRun | `orca queue evidence <id>` | `src/commands/queue.ts`, `tests/queue-command.test.ts` |
| Open TaskRun evidence in chat | Inspect the same TaskRun evidence drawer without leaving the Ink REPL | `/evidence <id>` | `src/commands/chat-slash-readonly.ts`, `src/commands/queue.ts`, `tests/chat-slash-readonly.test.ts` |
| Review approval history | See prompted, preapproved, policy-blocked, and hook-blocked tool decisions before file evidence | `orca queue evidence <id>`, `/evidence <id>` | `src/policy-executor.ts`, `src/work-session-store.ts`, `tests/chat-proxy-tool-call.test.ts` |
| Read submitted prompts after sending | Keep the operator's own prompt visible as a distinct highlighted transcript block | Press Enter in Ink chat | `src/ui/components/App.tsx`, `src/ui/session.ts`, `tests/ink-ui.test.tsx` |
| Read structured assistant output | See headings, bullets, inline emphasis, and code blocks in a framed assistant response panel | Assistant streaming / turn completion | `src/ui/components/App.tsx`, `src/ui/components/MarkdownText.tsx`, `tests/ink-ui.test.tsx` |
| Claim operator control of a TaskRun | Mark a non-terminal TaskRun as owned by an operator for a bounded TTL | `orca queue takeover <id> --holder <name> --ttl <duration>` | `src/commands/queue.ts`, `src/work-session-store.ts`, `tests/queue-command.test.ts`, `tests/work-session-store.test.ts` |
| Resume a chat TaskRun | Claim a bounded resume lease and receive the exact saved-session continue command | `orca queue resume <id> --holder <name>` | `src/commands/queue.ts`, `src/work-session-store.ts`, `tests/queue-command.test.ts` |
| Schedule the next recoverable TaskRun | Skip active leases and unsupported replay records, then claim the next resumable or monitorable item | `orca queue schedule --holder <name>` | `src/commands/queue.ts`, `tests/queue-command.test.ts` |
| Discover slash commands consistently | See the same command surface in completion, picker, and help, with HomePanel metadata prepared for the pending UI-baseline split | `/`, `Tab`, `/help` | `src/slash-commands.ts`, `tests/slash-commands.test.ts` |
| Trust release evidence in docs | See README and active PDCA counts aligned with the package version and current full-suite snapshot | README, PDCA docs, `verification_snapshot.json` | `tests/release-evidence.test.ts` |
| Trust CI gate integrity | See documented matrix/security/performance/eval gates enforced by CI instead of a narrower build/test-only workflow | GitHub Actions, `npm run test:*` | `.github/workflows/ci.yml`, `agent-eval/manifests/test-matrix.json` |
| Trust project hooks explicitly | Prevent arbitrary checked-out repos from running startup hook shell commands | `ORCA_TRUST_PROJECT_HOOKS=1` or trusted `HookManager` | `src/hooks.ts`, `tests/hooks.test.ts` |
| Approve network-capable tools | Treat outbound fetch/search as a trust boundary | permission prompt for `fetch_url` / `web_search` | `src/tools.ts`, `tests/chat-proxy-tool-call.test.ts` |

Open UX work:

- Extend resume support beyond chat saved sessions only after non-chat TaskRuns persist replay-safe argv/prompt metadata.
- Move command handlers behind registry metadata only after the command execution contract is stable.
- Split the existing HomePanel UI baseline before wiring quick-path command hints to the registry.
- Keep CI gate labels aligned with `agent-eval/manifests/test-matrix.json` and the generated entrypoint snippet.

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
| Inspect run continuity state headlessly | Query durable run objects created by `orca run` default, goal-loop, mission, and plan paths | `orca serve` + `GET /work-sessions*`, `GET /task-runs*` | `src/commands/run.ts`, `src/commands/serve.ts`, `src/work-session-store.ts`, `tests/run-work-session.test.ts` |
| Execute headless chat as a tracked run | Send a prompt over HTTP and receive durable run ids for later queue inspection | `POST /chat` with JSON or SSE response | `src/commands/serve.ts`, `tests/serve-command.test.ts` |
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
6. The next continuity step is not another metadata endpoint; it is richer replay metadata for non-chat TaskRuns.
7. The shipped `WorkSession` / `TaskRun` slice now covers the default `orca run`, goal-loop, mission, plan, `orca chat`, and `serve /chat` paths and is inspectable through queue and serve surfaces.
8. `orca queue resume` and `orca queue schedule` turn saved chat session metadata into concrete continuation commands, while unsupported non-chat replay stays explicit instead of pretending to resume arbitrary runs.
9. If `serve` binds to a non-loopback host, `ORCA_SERVE_TOKEN` is now required and HTTP requests must present a bearer token.

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
2. `src/commands/run.ts` creates a WorkSession plus TaskRun before choosing the default, goal-loop, mission, or plan branch.
3. Runtime resolves provider/model config and tool permissions.
4. Completion writes TaskRun status, summary, usage, and mission-state evidence when applicable.
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

The REPL now uses ink (React for terminals) as the rendering engine. By default it renders in the primary terminal buffer for normal selection/copy. Operators who see repaint flashes can opt into the Claude-style fullscreen/no-flicker alternate-screen layout:

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

## Chat TaskRun Journey (2026-04-29)

| Step | User Action | System Response | Evidence |
| --- | --- | --- | --- |
| CT-1 | User starts `orca chat` in REPL mode | Orca creates a durable chat `WorkSession` with current provider/model/mode metadata | `src/commands/chat.ts` |
| CT-2 | User submits a normal prompt | Orca creates a `kind: "chat"` `TaskRun` titled from the prompt | `src/work-session-store.ts` |
| CT-3 | Provider turn completes, fails, or aborts | Orca finishes the `TaskRun` with status, token usage, cost, duration, and runtime observation evidence | `src/commands/chat-repl-turn.ts` |
| CT-4 | Operator inspects queue state later | The chat turn is visible through the same queue/work-session store used by `run` and `serve /chat` | `tests/work-session-store.test.ts` |

## REPL History And Local Document Journey (2026-05-03)

| Step | User Action | System Response | Evidence |
| --- | --- | --- | --- |
| HD-1 | User reads a long Orca response while the prompt input is focused | PageUp/PageDown and shifted arrow history scrolling remain available | `getHistoryScrollActivationState()` in `src/ui/components/App.tsx` |
| HD-2 | User types ordinary text such as `g` or `G` into the prompt | Text-key scroll shortcuts remain disabled while input is focused | `ScrollBox.vimKeysActive` |
| HD-3 | User asks Orca to generate/save a Markdown file at a local path | If the model returns generated Markdown body content, runtime writes it with `write_file` | `buildPostModelRequiredFileWritePlan()` |
| HD-4 | Model refuses or omits required file-tool evidence | Orca emits a local-file enforcement notice and does not treat the request as completed | `buildLocalFileEnforcementNotice()` |

## Changelog

| Date | Change |
| --- | --- |
| 2026-05-29 | Normalized metadata for the project ai check gate and recorded the multi-model review ledger integration. |
