# Rolling Requirements And Prompts

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

### Prompt Ledger

| ID | Prompt / Trigger | Routing | Output |
| --- | --- | --- | --- |
| PROMPT-20260429-001 | `/Users/mauricewen/Projects/orca-cli 对orca 进行sota 蜂群审计，输出走风格路由的审计报告，再制定里程碑计划及原子任务清单，之后再队列及蜂群模式pdca执行` | `$audit` + frontend/design/report style router + native swarm lanes | SOTA audit, routed HTML report, milestone plan, atomic queue, PDCA tranche 1 |

### Anti-Regression Q&A

| Question | Expected Answer | Guard |
| --- | --- | --- |
| Can repo-local hooks run on startup by default? | No. They require explicit trust. | `tests/hooks.test.ts` |
| Do hook subprocesses inherit provider API keys by default? | No. The hook env is allowlisted. | `tests/hooks.test.ts` |
| Are `fetch_url` and `web_search` approval-gated in auto mode? | Yes. | `tests/chat-proxy-tool-call.test.ts` |
| Can `fetch_url` hit `127.0.0.1` or `192.168.*` directly? | No. Literal loopback/private targets are blocked. | `tests/tools.test.ts` |
| Is there a CLI surface for existing TaskRun records? | Yes: `orca queue list/show`. | `tests/queue-command.test.ts` |

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

## References

- `README.md`
- `src/program.ts`
- `src/commands/multi.ts`
- `doc/THREE_TIER_ARCHITECTURE.md`
