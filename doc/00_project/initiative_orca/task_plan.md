# Task Plan

## Active Task

- Task: `chat.ts` maintainability decomposition follow-up
- Status: in_progress (the earlier ink UI remediation tranche is complete)
- Started: 2026-04-14

## Current Slice (2026-04-16)
1. Read the SOTA gap / plan docs and convert the seeded `agent-eval` pack into a real tiered gate system.
2. Land manifest-driven `fast` / `nightly` / `release` bundles plus a shared runner and release CLI journey artifact.
3. Add integrity tests for manifest/task/grader drift and wire canonical npm scripts for maintainers.
4. Re-run fast + release verification and roll forward canonical docs / deliverables.

### Acceptance Criteria For This Slice
- `agent-eval` no longer depends on a single hard-coded fast-gate runner.
- `npm run eval:fast`, `npm run eval:nightly`, and `npm run eval:release` are canonical entrypoints.
- Release verification writes an auditable run directory with summary JSON / Markdown plus a CLI journey artifact.
- Canonical docs and ledger reference the new gate system rather than the older one-off fast-gate workflow.

## Current Slice (2026-04-18)
1. Port the spirit of Copilot CLI Rubber Duck into Orca as a renamed `reflect` surface.
2. Make `reflect` first-class across top-level command, REPL slash discovery, persistent mode selection, and prompt shaping.
3. Keep the implementation explicit-first, but add conservative auto-triggering for clear debugging/explanation prompts in normal chat.
4. Add regression coverage and roll forward README + canonical PDCA docs.

### Acceptance Criteria For This Slice
- `orca reflect` exists as a public command.
- `/reflect` works inside chat and `/mode reflect` enables a persistent session profile.
- Standard chat can auto-trigger reflect for clear debugging/explanation asks and surfaces an inline notice when that happens.
- README and canonical initiative docs describe the new reflect surface.
- Lint, targeted reflect regressions, full test suite, and build stay green.

## Parallel Planning Track — Large-Scale Test Expansion (in progress)

- Status: in_progress
- Scope: create the next large-scale Orca CLI test-growth program without replacing the currently active `chat.ts` maintainability slice.
- Baseline:
  - measured planning-start baseline: `npm test` => `1263/1263`
  - current full-suite baseline after the first breadth + depth + packaging tranches and the manifest-integrity guard: `npm test` => `1280/1280`
  - this sequence supersedes the older `1260/1260` checkpoint recorded under the prior maintainability slice
  - passing file count in the latest full run: `69`
  - historical `doc/SOTA_TEST_PLAN.md` is now reference-only and no longer reflects the canonical total
- Target shape:
  1. fast gate: `550-650` selected deterministic cases + `12` eval tasks
  2. nightly gate: `~1700` deterministic cases + `36` eval tasks
  3. release gate: `~2210` deterministic cases + `72` eval tasks + packaging/bin smokes
- Workstreams:
  1. Breadth matrix: command / flag / help, provider / model / config, REPL / ink / session / output, serve / headless / IDE, packaging / bin
  2. Depth matrix: long-horizon agent loops, recovery / adversarial paths, large-codebase scenarios, multi-step edit / refactor / benchmark workflows
  3. Evaluation system: `AGENT_EVAL_PLAN.md` is filled and `agent-eval/` now has a manifest-driven gate system
     - `fast`: `14` local black-box tasks
     - `nightly`: deterministic repo gates + the local black-box pack
     - `release`: deterministic repo gates + `bench` + the local black-box pack + recorded CLI journey
  4. Priority contract tranche: `pr`, `session`, `serve`, `run`, `providers test`, root entry / `--continue`, packaging
  5. First breadth tranche landed in `tests/command-contracts.test.ts` for root command coverage plus `session` / `pr` / `providers` / `serve` public-contract stability
  6. First depth tranche landed in `tests/session-command.test.ts` and `tests/serve-command.test.ts` for corrupted-session recovery, `ORCA_HOME` parity, and malformed `/chat` request handling
  7. Packaging / release smokes landed in `tests/packaging-smoke.test.ts` for build output, `npm pack --dry-run`, and built-bin execution
  8. Fast-gate task-eval target is now exceeded at `61/61` tasks with the latest successful run `20260417-012401-427935`
  9. Nightly gate now passes at `64/64` steps (`20260417-012506-286459`)
  10. Release gate now passes at `67/67` steps (`20260417-012607-841549`)
- Acceptance Criteria:
  - canonical PDCA docs record the real current baseline and target matrix
  - `AGENT_EVAL_PLAN.md` defines tasks, graders, evidence, and gate tiers
  - `agent-eval/manifests/*.json` and `agent-eval/scripts/run-gate.py` make those tiers executable
  - the active maintainability slice below remains separately trackable
  - this planning track can proceed independently of the current `chat.ts` refactor

### Current Slice (2026-04-14)
1. Fix the ink slash-command picker so it stops capturing Enter once the user has moved from the command token into argument entry.
2. Fix first-launch theme onboarding so a saved `~/.orca/theme` preference suppresses the picker on subsequent launches.
3. Add regression coverage for both behaviors.
4. Rebuild and refresh the installed global Orca package after verification.

### Acceptance Criteria For This Slice
- Slash commands with arguments submit the full typed input instead of dropping back to command-name-only picker selection.
- The theme picker does not reappear when a valid theme is already saved.
- Regression coverage exists for picker visibility and theme-preference detection.
- Targeted tests plus repo lint/test/build stay green.

### Current Slice (2026-04-14 19:40 CST)
1. Extract the read-only slash display/status/help flows from `handleSlashCommand()`.
2. Re-run targeted + full verification after the extraction.
3. Roll forward canonical task docs and `HANDOFF.md`.
4. Leave the next model a clean continuation point at `runProxyTurn()` orchestration.

### Acceptance Criteria For This Slice
- Read-only slash commands live outside `src/commands/chat.ts`.
- `handleSlashCommand()` no longer relies on `as string` dispatch casts for async slash flows.
- Regression coverage exists for the extracted slash helper boundary.
- Canonical task docs and `HANDOFF.md` point the next continuation at `runProxyTurn()`.

### Completed In This Slice (2026-04-14 19:40 CST)
1. Added `src/commands/chat-slash-readonly.ts` for read-only slash help/status/display flows.
2. Moved the read-only subset out of `handleSlashCommand()`:
   - `/help`
   - read-only `/model` + `/models`
   - `/history`, `/tokens`, `/stats`, `/cwd`
   - `/diff`, `/git`
   - `/sessions`, `/jobs`
   - `/cost`, `/status`, `/doctor`, `/config`, `/providers`
3. Replaced the old string-cast async slash branching with an explicit `SlashCommandResult` union.
4. Added `tests/chat-slash-readonly.test.ts` for helper-level regression coverage.
5. Updated `task_plan.md`, `notes.md`, `deliverable.md`, and `HANDOFF.md` to reflect the new continuation point.

### Current Slice (2026-04-14 19:50 CST)
1. Extract the `runProxyTurn()` tool orchestration callback into a dedicated helper module.
2. Add helper-level regression coverage for the extracted proxy tool boundary.
3. Re-run targeted + full verification after the extraction.
4. Roll forward canonical task docs and `HANDOFF.md` to the next continuation point.

### Acceptance Criteria For Current Slice
- `runProxyTurn()` no longer carries the full `onToolCall` orchestration body inline.
- Dangerous-tool permission flow, hook gating, async tool routing, and post-tool guards remain behavior-compatible.
- Regression coverage exists for the extracted proxy helper boundary.
- Canonical task docs and `HANDOFF.md` point the next continuation at the remaining mutating/session slash flows.

### Completed In The Current Slice (2026-04-14 19:50 CST)
1. Added `src/commands/chat-proxy-tool-call.ts` for proxy-path tool orchestration.
2. Moved the `runProxyTurn()` tool callback out of `chat.ts`, including:
   - dangerous-tool permission gating + diff preview flow
   - `PreToolUse` handling
   - sub-agent / `ask_user` / MCP / `sleep` async tool routing
   - post-tool retry intelligence, error classification, loop detection, postmortem matching, auto-verify, and context guarding
3. Added `tests/chat-proxy-tool-call.test.ts` for helper-level regression coverage.
4. Updated `task_plan.md`, `notes.md`, `deliverable.md`, and `HANDOFF.md` so the next continuation starts at the remaining mutating/session slash flows.

### Current Slice (2026-04-14 20:00 CST)
1. Extract the remaining mutating/session slash flows out of `handleSlashCommand()`.
2. Add helper-level regression coverage for the extracted mutating slash boundary.
3. Re-run targeted + full verification after the extraction.
4. Roll forward canonical task docs and `HANDOFF.md` to the next continuation point.

### Acceptance Criteria For This Slice
- `handleSlashCommand()` no longer embeds the remaining mutating/session slash switch body inline.
- Async slash sentinels and `not_command` fallthrough behavior remain stable.
- Regression coverage exists for the extracted mutating slash helper boundary.
- Canonical task docs and `HANDOFF.md` point the next continuation at `runREPL()` orchestration.

### Completed In This Slice (2026-04-14 20:00 CST)
1. Added `src/commands/chat-slash-mutations.ts` for the remaining mutating/session slash flows.
2. Moved the rest of the slash-command switch out of `chat.ts`, including:
   - model switching, clear/compact/system/hooks
   - async slash sentinels for `/council`, `/race`, `/pipeline`, `/mission`, `/plan`
   - session persistence / continue / undo
   - `/commit`, `/review`, `/pr` fallthrough behavior
   - `/mcp`, `/thread`, `/init`, `/notes`, `/postmortem`, `/prompts`, `/learn`
3. Added `tests/chat-slash-mutations.test.ts` for helper-level regression coverage.
4. Updated `task_plan.md`, `notes.md`, `deliverable.md`, and `HANDOFF.md` so the next continuation starts at the remaining `runREPL()` orchestration hotspot.

### Current Slice (2026-04-14 20:10 CST)
1. Extract the async slash follow-up execution out of `runREPL()`.
2. Add helper-level regression coverage for the extracted async REPL slash boundary.
3. Re-run targeted + full verification after the extraction.
4. Roll forward canonical task docs and `HANDOFF.md` to the next continuation point.

### Acceptance Criteria For This Slice
- `runREPL()` no longer embeds the `/council`, `/race`, `/pipeline`, `/mission`, and `/plan` execution blocks inline.
- Ink and legacy rendering for async slash follow-up stay behavior-compatible.
- Regression coverage exists for the extracted async REPL slash helper boundary.
- Canonical task docs and `HANDOFF.md` point the next continuation at the remaining `runREPL()` turn lifecycle.

### Completed In This Slice (2026-04-14 20:10 CST)
1. Added `src/commands/chat-repl-async-slash.ts` for async REPL slash follow-up execution.
2. Moved the `/council`, `/race`, `/pipeline`, `/mission`, and `/plan` execution blocks out of `runREPL()`.
3. Added `tests/chat-repl-async-slash.test.ts` for helper-level regression coverage.
4. Updated `task_plan.md`, `notes.md`, `deliverable.md`, and `HANDOFF.md` so the next continuation starts at the remaining `runREPL()` turn lifecycle.

### Current Slice (2026-04-14 20:22 CST)
1. Extract the normal prompt turn execution path out of `runREPL()`.
2. Add helper-level regression coverage for the extracted REPL turn boundary.
3. Re-run targeted + full verification after the extraction.
4. Roll forward canonical task docs and `HANDOFF.md` to the next continuation point.

### Acceptance Criteria For This Slice
- `runREPL()` no longer embeds the normal prompt turn lifecycle inline after input/slash dispatch.
- Hook gating, file expansion, cognitive skeleton injection, pre-send compaction, abort handling, provider dispatch, 413 retry recovery, and post-turn compaction remain behavior-compatible.
- Regression coverage exists for the extracted REPL turn helper boundary.
- Canonical task docs and `HANDOFF.md` point the next continuation at the remaining REPL input/discovery/dispatch front-half.

### Completed In This Slice (2026-04-14 20:22 CST)
1. Added `src/commands/chat-repl-turn.ts` for the normal REPL prompt turn lifecycle.
2. Moved the remaining turn-execution subtree out of `runREPL()`, including:
   - multi-task hinting
   - `UserPromptSubmit` hook gating
   - file expansion + cognitive skeleton injection
   - pre-send compaction
   - abort/progress lifecycle
   - proxy/SDK turn dispatch
   - 413 auto-recovery retry
   - post-turn compaction + session autosave
3. Added `tests/chat-repl-turn.test.ts` for helper-level regression coverage.
4. Updated `task_plan.md`, `notes.md`, `deliverable.md`, and `HANDOFF.md` so the next continuation starts at the remaining `runREPL()` input/discovery/dispatch hotspot.

## Prior UI Remediation Round (2026-04-14 12:02 CST)
1. Reconcile report v3 against real `src/ui/**` state and CC reference sources.
2. Fix the remaining behavior-accuracy gaps that still exist in code:
   - `ScrollBox` uses terminal rows instead of measured viewport height when mounted in a flex layout.
   - `AlternateScreen` still enters alt-screen in `useEffect`, later than CC's insertion-phase write.
   - `cursor.ts` still treats word boundaries as ASCII-only, not CC-style Unicode-aware word chars.
3. Correct doc drift:
   - canonical `PROJECT_DIR` blocks still point at `/Users/mauricewen/Projects/MARUCIE-orca-cli`
   - planning notes overstate parity completion and no longer distinguish report-vs-code truth.

### Acceptance Criteria For This Round
- Scroll behavior is clamped against actual viewport height, not full terminal rows.
- Alternate-screen enter/exit timing moves to insertion/layout-safe path before first frame paint.
- Cursor word movement/deletion works for Unicode letters/numbers/marks, not only ASCII `\\w`.
- Regression coverage added for the above behaviors.
- Canonical docs updated to the real repo path `/Users/mauricewen/Projects/orca-cli`.

### Completed (2026-04-14)
1. `ScrollBox` now measures the rendered viewport container instead of assuming full terminal height.
2. `AlternateScreen` now enters alt-screen in a pre-paint hook (`useInsertionEffect` with layout fallback).
3. `cursor.ts` now uses Unicode-aware word characters for word motion/deletion.
4. `TerminalSizeProvider` now shares a single process-level `SIGWINCH` subscription instead of adding one listener per provider mount.
5. Canonical `PROJECT_DIR` blocks were corrected in architecture + UX docs.
6. `chat.ts` file expansion now resolves quoted paths, shell-escaped spaces, and `file:///...%20...` URLs through the same normalization path.
7. `tryExpandDirectory()` now recognizes quoted and shell-escaped directory paths with spaces in mixed prompts.
8. High-risk shell string interpolation was removed from preprocess conversion, project tree expansion, worktree management, and `git_commit`.
9. Added a zero-dependency VS Code extension skeleton under `integrations/vscode-orca/`.
10. Added multimodal prompt foundation in the proxy provider layer and a minimal `orca chat --image` one-shot entry.
11. Upgraded history/budget/session layers so `ChatMessage` no longer assumes string-only content.
12. Started extracting `chat.ts` helper concerns into `src/commands/chat-input.ts` (safe `/git` parsing + image prompt builder).
13. Expanded extraction into `src/commands/chat-input.ts` + `src/commands/chat-support.ts` so file expansion, project bootstrap, and persistence/config helpers are no longer embedded in `chat.ts`.
14. Extracted read-only slash help/status/display flows into `src/commands/chat-slash-readonly.ts`, and replaced `handleSlashCommand()` string-cast branching with an explicit typed result union.

## Verification Summary (this round)

- `npm run lint` ✅
- `node --experimental-vm-modules node_modules/.bin/vitest run tests/cursor.test.ts tests/ink-ui.test.tsx` ✅ (`83/83`)
- `node --experimental-vm-modules node_modules/.bin/vitest run tests/chat-file-expansion.test.ts tests/file-expansion.test.ts` ✅ (`70/70`)
- `npm test` ✅ (`1206/1206`)
- `npm test` ✅ (`1212/1212`) after file-expansion follow-up
- `node --experimental-vm-modules node_modules/.bin/vitest run tests/chat-file-expansion.test.ts` ✅ (`8/8`) after directory-path follow-up
- `npm test` ✅ (`1214/1214`) after directory-path follow-up
- `node --experimental-vm-modules node_modules/.bin/vitest run tests/adversarial.test.ts tests/preprocess.test.ts tests/phase1-agent.test.ts` ✅ (`134/134`) after shell-hardening follow-up
- `npm test` ✅ (`1216/1216`) after shell-hardening follow-up
- `node --experimental-vm-modules node_modules/.bin/vitest run tests/vscode-extension.test.ts` ✅ (`3/3`)
- `npm test` ✅ (`1219/1219`) after VS Code skeleton follow-up
- `node --experimental-vm-modules node_modules/.bin/vitest run tests/openai-compat-multimodal.test.ts tests/chat-image-option.test.ts tests/provider-stream-resilience.test.ts tests/agent-loop.test.ts` ✅ (`36/36`)
- `npm test` ✅ (`1226/1226`) after multimodal one-shot follow-up
- `node --experimental-vm-modules node_modules/.bin/vitest run tests/openai-compat-multimodal.test.ts tests/chat-image-option.test.ts tests/context-protection.test.ts tests/provider-stream-resilience.test.ts tests/agent-loop.test.ts` ✅ (`78/78`)
- `npm test` ✅ (`1227/1227`) after multimodal history/budget follow-up
- `node --experimental-vm-modules node_modules/.bin/vitest run tests/chat-git-command.test.ts tests/chat-image-option.test.ts tests/openai-compat-multimodal.test.ts tests/chat-file-expansion.test.ts` ✅ (`16/16`)
- `npm test` ✅ (`1227/1227`) after `chat-input.ts` partial extraction
- `node --experimental-vm-modules node_modules/.bin/vitest run tests/chat-git-command.test.ts tests/chat-image-option.test.ts tests/chat-file-expansion.test.ts tests/openai-compat-multimodal.test.ts tests/vscode-extension.test.ts` ✅ (`19/19`)
- `npm test` ✅ (`1238/1238`) after `chat-input.ts` / `chat-support.ts` extraction
- `node --experimental-vm-modules node_modules/.bin/vitest run tests/chat-slash-readonly.test.ts tests/chat-git-command.test.ts tests/chat-image-option.test.ts tests/chat-file-expansion.test.ts` ✅ (`18/18`)
- `npm test` ✅ (`1242/1242`) after `chat-slash-readonly.ts` extraction
- `node --experimental-vm-modules node_modules/.bin/vitest run tests/chat-proxy-tool-call.test.ts tests/chat-slash-readonly.test.ts tests/chat-git-command.test.ts tests/chat-image-option.test.ts tests/chat-file-expansion.test.ts` ✅ (`22/22`)
- `npm test` ✅ (`1246/1246`) after `chat-proxy-tool-call.ts` extraction
- `node --experimental-vm-modules node_modules/.bin/vitest run tests/chat-slash-mutations.test.ts tests/chat-proxy-tool-call.test.ts tests/chat-slash-readonly.test.ts tests/chat-git-command.test.ts tests/chat-image-option.test.ts tests/chat-file-expansion.test.ts` ✅ (`26/26`)
- `npm test` ✅ (`1250/1250`) after `chat-slash-mutations.ts` extraction
- `node --experimental-vm-modules node_modules/.bin/vitest run tests/chat-repl-async-slash.test.ts tests/chat-slash-mutations.test.ts tests/chat-proxy-tool-call.test.ts tests/chat-slash-readonly.test.ts tests/chat-git-command.test.ts tests/chat-image-option.test.ts tests/chat-file-expansion.test.ts` ✅ (`30/30`)
- `npm test` ✅ (`1254/1254`) after `chat-repl-async-slash.ts` extraction
- `node --experimental-vm-modules node_modules/.bin/vitest run tests/chat-repl-turn.test.ts` ✅ (`6/6`)
- `npm test` ✅ (`1260/1260`) after `chat-repl-turn.ts` extraction
- `npm run build` ✅
- `npm run bench` not run
  - Reason: this round changed ink UI behavior and docs only; no benchmark/provider-selection logic changed

### P0 Completed (2026-04-14)
1. useTerminalSize — reactive resize via SIGWINCH ✅
2. ScrollBox — stickyScroll + keyboard nav ✅
3. usePasteHandler — bracketed paste mode ✅

### P1 Completed (2026-04-14)
4. Cursor model — 28 tests, word-boundary, kill/yank ✅
5. Theme expansion — 25 semantic tokens, dark/light auto-detect ✅
6. Mouse wheel — SGR protocol, ScrollBox integration ✅
7. Focus control — showCursor prop, theme-aware borders ✅

### P2 Completed (2026-04-14)
8. Spinner upgrade — 204 verbs + stalledIntensity ✅
9. Tool call graduated error rendering — 6 error types ✅
10. Meta+Enter / Shift+Enter newline support ✅

### Remaining (post-round, if still out of scope)
- Interactive image paste support in the ink REPL
- CC-level `ScrollBox.scrollToElement()` / virtualization semantics
- Richer multimodal persistence beyond text-flattened compatibility paths
- Rich IDE integration beyond terminal launchers remains open (editor decorations, inline actions, richer MCP lifecycle UX)
- Remaining `chat.ts` maintainability work: the remaining REPL input/discovery/dispatch front-half still needs decomposition

## Previous Task

- Task: Internalize Hermes-inspired runtime capabilities into Orca CLI
- Status: completed
- Completed: 2026-04-12

## Plan

1. Map Hermes v0.8.0 capabilities against Orca CLI and Orca Agent SDK boundaries.
2. Implement the first Hermes-inspired runtime bundle in Orca CLI:
   - tool argument coercion
   - oversized tool result persistence
   - background completion notifications
3. Update canonical project docs and README to reflect the new runtime behavior.
4. Decide whether SDK code must change; if not, record why the boundary stays Orca-local.
5. Run full verification (`lint`, `test`, `build`, `bench`, smoke tests).

## Exit Criteria

- Hermes-inspired capability bundle is implemented and documented in Orca CLI
- Runtime boundaries between Orca CLI and Orca Agent SDK are explicitly recorded
- Verification evidence logged in `deliverable.md`

## Verification Summary

- `npm run lint` ✅
- `npm test` ✅ (`426/426` tests passed)
- `npm run build` ✅
- `npm run bench` ✅ (`10/10`, `100%`)
- `node dist/bin/orca.js --help` ✅
- `vitest run tests/hermes-runtime.test.ts` ✅ (`3/3`)
- `vitest run tests/model-catalog.test.ts` ✅ (`4/4`)
- `vitest run tests/model-catalog.test.ts tests/providers-command.test.ts` ✅ (`5/5`)
- `node dist/bin/orca.js providers` ✅
- `vitest run tests/logger.test.ts tests/logs-command.test.ts tests/program.test.ts` ✅ (`12/12`)
- `node dist/bin/orca.js logs` ✅
- `node dist/bin/orca.js doctor --json` ✅
- `vitest run tests/doctor-command.test.ts tests/logger.test.ts tests/logs-command.test.ts tests/program.test.ts` ✅ (`14/14`)
- `vitest run tests/serve-command.test.ts` ✅ (`1/1`)
- `vitest run tests/stats-command.test.ts` ✅ (`1/1`)

## Current Task

- Task: Support arbitrary local images and multi-image input in the REPL
- Status: completed
- Completed: 2026-04-20

## Plan

1. Reuse the existing proxy multimodal path instead of inventing a second image transport.
2. Detect embedded local image paths in REPL input, including quoted paths and shell-escaped spaces.
3. Keep text file expansion and image attachment logic separate so images stop being injected as `<file>` text blobs.
4. Preserve multimodal user turns in proxy-path history for follow-up questions.
5. Update README and canonical project docs, then run `lint`, `test`, `build`, and `bench`.

## Exit Criteria

- REPL accepts one or more local image paths in normal prompts.
- Multiple images in a single turn produce multimodal `PromptContent`.
- Proxy-path history keeps the image parts for follow-up turns.
- Verification evidence logged in `deliverable.md`.
