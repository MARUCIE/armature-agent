# Rolling Requirements And Prompts

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

## Prompt / Workflow Notes

| ID | Prompt Pattern | Intent | Notes |
| --- | --- | --- | --- |
| PROMPT-001 | Project directory only | Bootstrap project governance before feature work | Root agent files + canonical docs are now the first action |
| PROMPT-002 | Internalize Hermes abilities into Orca CLI | Map Hermes release items to Orca-local runtime seams first; only change SDK if the seam is genuinely reusable | Active task branch |
| PROMPT-003 | Start a large-scale test expansion plan for Orca CLI | Measure the real baseline first, then split growth into breadth lanes, depth lanes, and fast / nightly / release gates, with `agent-eval` complementing Vitest instead of duplicating it | Keep it as a parallel planning track if another coding slice is already active; prioritize under-covered public command surfaces before adding more internal-only assertions |
| PROMPT-004 | Read the SOTA gap docs and build the SOTA system end-to-end | Treat the current plan docs as the gap statement, then land executable manifests, gate entrypoints, and release artifacts instead of stopping at documentation | Do not ask for permission midstream once the project root is clear |
| PROMPT-005 | Port GitHub Copilot Rubber Duck into Orca but rename and upgrade it | Make it Orca-native rather than a clone: explicit `reflect` entrypoints, persistent mode, structured diagnosis output, and conservative auto-triggering instead of opaque background duplication | Avoid GitHub/Rubber Duck branding in public UX |

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
| What does `/models` show now? | Provider-aware model choices with context window, approximate pricing, and caution metadata instead of a hard-coded Poe-only list. |
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
