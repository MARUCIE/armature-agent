# Deliverable

## 2026-04-18 — reflect mode

### Scope

Port the spirit of Copilot CLI Rubber Duck into Orca as a renamed `reflect` surface with richer prompt shaping, explicit-first UX, and conservative auto-triggering.

### Delivered

- Added a shared reflect helper:
  - `src/commands/reflect-mode.ts`
  - intent detection for debugging/explanation asks
  - structured prompt shaping around symptom/hypotheses/evidence/root-cause/next-step
- Added a first-class public command:
  - `orca reflect`
- Added REPL surfaces:
  - `/reflect <prompt>`
  - `/mode reflect`
  - help/picker/ink command discovery updated to include `reflect`
- Added built-in persistent mode:
  - `src/modes/registry.ts` now includes `reflect`
- Updated public/canonical docs:
  - `README.md`
  - `PRD.md`
  - `SYSTEM_ARCHITECTURE.md`
  - `USER_EXPERIENCE_MAP.md`
  - `PLATFORM_OPTIMIZATION_PLAN.md`
  - `ROLLING_REQUIREMENTS_AND_PROMPTS.md`
  - `task_plan.md`
  - `notes.md`

### Verification

- `npm run lint`
- `node --experimental-vm-modules node_modules/.bin/vitest run tests/reflect-mode.test.ts tests/program.test.ts tests/command-contracts.test.ts tests/chat-slash-mutations.test.ts tests/chat-repl-turn.test.ts`

### Result

- Orca now has a named, reusable reflection/debugging surface instead of relying on ad hoc prompts.
- The feature is explicit-first (`orca reflect`, `/reflect`, `/mode reflect`) but can still auto-trigger for clear debugging/explanation asks with visible inline feedback.
- The prompt contract is more structured than a plain rubber-duck chat, so the agent is steered toward evidence-backed diagnosis rather than immediate rewrite bias.

## 2026-04-16 — SOTA gate system execution

### Scope

Read the current SOTA gap / difference docs, then turn Orca's existing seeded `agent-eval` assets into a real reproducible gate system with fast / nightly / release bundles.

### Delivered

- Replaced the single-purpose fast-gate execution path with a shared manifest runner:
  - `agent-eval/scripts/run-gate.py`
  - `agent-eval/scripts/run-fast-gate.py` now delegates to the shared runner
- Added canonical gate manifests:
  - `agent-eval/manifests/fast.json`
  - `agent-eval/manifests/nightly.json`
  - `agent-eval/manifests/release.json`
- Added deterministic gate tasks:
  - `gate-lint`
  - `gate-test`
  - `gate-build`
  - `gate-bench`
  - `gate-cli-journey`
- Expanded the local black-box pack from `12` to `14` tasks:
  - `fast-session-delete`
  - `fast-serve-chat-errors`
- Added release artifact recording:
  - `agent-eval/scripts/release-cli-journey.sh`
  - each release run now writes `summary.json`, `summary.md`, transcripts, outcomes, grades, and `manual/release-cli-journey.md`
- Added deterministic manifest-integrity coverage:
  - `tests/agent-eval-manifests.test.ts`
- Added canonical npm entrypoints:
  - `npm run eval:fast`
  - `npm run eval:nightly`
  - `npm run eval:release`
- Rolled forward canonical docs so the gate system is documented in the PRD, UX map, architecture map, optimization plan, notes, and rolling ledger.

### Verification

- `python3 -m py_compile agent-eval/scripts/run-gate.py agent-eval/scripts/run-fast-gate.py`
- `node --experimental-vm-modules node_modules/.bin/vitest run tests/agent-eval-manifests.test.ts`
- `python3 agent-eval/scripts/run-gate.py --manifest fast`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run bench`
- `npm run eval:nightly`
- `npm run eval:release`

### Result

- Orca now has a real tiered SOTA evaluation system instead of a plan plus one hard-coded fast runner.
- Fast gate is executable at `61/61` local black-box tasks and nightly/release bundles are now codified as first-class manifests.
- Release verification now has a defined artifact shape rather than relying on operator memory or ad hoc shell history.
- Latest verification evidence:
  - `npm test` => `1280/1280`
  - `npm run bench` => `10/10`
  - `agent-eval/runs/20260417-012401-427935/summary.json` => fast `61/61`
  - `agent-eval/runs/20260417-012506-286459/summary.json` => nightly `64/64`
  - `agent-eval/runs/20260417-012607-841549/summary.json` => release `67/67`
  - `agent-eval/runs/20260417-011304-326914/manual/release-cli-journey.md` => release CLI journey artifact
  - attacker review of the new eval-system surfaces completed manually after the `security-reviewer` helper shut down before returning

### Security Review

- Scope reviewed:
  - `agent-eval/scripts/run-gate.py`
  - `agent-eval/scripts/release-cli-journey.sh`
  - `agent-eval/tasks/*.json`
  - `agent-eval/manifests/*.json`
- Findings:
  - no critical shell-injection or path-escape issue was found in the new gate system itself
  - the main residual risk is intentional: task JSON is executable trust input because the shared runner launches task commands with `shell=True`
  - tarball-install smoke is safe for trusted local branches, but should not be treated as safe against unreviewed third-party repos

## 2026-04-14 — large-scale test expansion planning

### Scope

Create the canonical planning package for the next Orca CLI quality-expansion program, grounded in the real current baseline and aligned with PDCA plus `agent-eval-system`.

### Delivered

- Locked and refreshed the automated baseline to `1276/1276` passing tests from `npm test`
  - the planning track started from a measured `1263/1263` baseline
  - the first breadth tranche added five deterministic command-contract tests
  - the first depth + packaging tranches added eight more deterministic tests
  - this sequence supersedes the older `1260/1260` checkpoint recorded in the previous maintainability slice
- Generated and filled repo-root `AGENT_EVAL_PLAN.md`
- Updated canonical PDCA docs with:
  - real baseline and historical-doc drift
  - breadth and depth expansion lanes
  - fast / nightly / release gate design
  - refined target structure from the supplemental test-engineer audit:
    - fast: `550-650` selected deterministic cases + `12` eval tasks
    - nightly: `~1700` deterministic cases + `36` eval tasks
    - release: `~2210` deterministic cases + `72` eval tasks
  - task-eval grader target structure (`10-12` graders)
- Added a parallel planning track to `task_plan.md` without overwriting the active `chat.ts` maintainability slice
- Recorded the new quality-program requirement in the rolling ledger
- Corrected concrete critique findings:
  - removed a duplicated serve-diagnostics line from `SYSTEM_ARCHITECTURE.md`
  - softened command-gap wording so existing `serve` smoke coverage and indirect `session` coverage are not overstated as zero
- Initialized `agent-eval/` and replaced generic samples with the first Orca-specific fast-gate pack
  - seeded tasks:
    - `fast-root-help`
    - `fast-session-help`
    - `fast-pr-help`
    - `fast-providers-help`
    - `fast-doctor-json`
    - `fast-serve-health`
  - seeded grader pack:
    - `agent-eval/graders/fast-gate.graders.json`
  - verification run:
    - `ai agent-eval /Users/mauricewen/Projects/orca-cli run`
    - run id `20260415-011603`
    - result `6/6` passed
- Added the first deterministic breadth tranche:
  - `tests/command-contracts.test.ts`
  - covers root public surface plus `session`, `pr`, `providers`, and `serve` command contracts
- Added the first deterministic depth tranche:
  - `tests/session-command.test.ts`
    - corrupted latest-session recovery
    - `ORCA_HOME`-aware session lookup
    - fixed `session` default-action stack overflow
  - `tests/serve-command.test.ts`
    - malformed `/chat` JSON and missing-prompt request coverage
- Added packaging / bin-entry release smokes:
  - `tests/packaging-smoke.test.ts`
  - `npm pack --json --dry-run` now has explicit smoke coverage for shipped dist entrypoints
  - built `dist/bin/orca.js` help + doctor-json behavior now has deterministic regression coverage
- Expanded the `agent-eval` fast gate to the planned `12`-task baseline:
  - added `fast-run-help`
  - added `fast-session-list`
  - added `fast-session-show`
  - added `fast-providers-test-local`
  - added `fast-serve-metadata`
  - added `fast-pack-dry-run`
  - latest run `20260415-020102` passed `12/12`
  - critique hardening added:
    - `agent-eval/scripts/prepare-fast-gate.sh`
    - `agent-eval/scripts/wait-for-http.sh`
    - `agent-eval/scripts/run-fast-gate.py`
    - relative task commands + clean-env serve/providers/doctor scenarios

### Verification

- `npm test`
- `ai agent-eval /Users/mauricewen/Projects/orca-cli plan --owner "Maurice"`

### Result

- Orca CLI now has a canonical large-scale testing plan that starts from the real measured baseline and is currently validated at `1276` tests rather than stale flat-doc counts
- PDCA docs and `AGENT_EVAL_PLAN.md` now point to the same next-step structure, including the priority command-surface gap tranche
- Current release-style validation evidence:
  - `npm test` => `1276/1276`
  - `npm run build`
  - `npm run bench` => `10/10`
  - `ai agent-eval /Users/mauricewen/Projects/orca-cli run` => run id `20260415-012934`, `6/6` passed
- Current fast-gate expansion evidence:
  - `agent-eval/runs/20260415-020102/summary.json`
  - `12/12` fast-gate tasks passed with no pending graders
- The next execution tranche is to expand the agent-eval pack and deeper multi-step scenario families toward the nightly / release gate targets

## 2026-04-14 — REPL slash submission + theme onboarding UX fix

### Scope

Fix the ink REPL behaviors that make slash commands feel invalid during argument entry and make the theme picker reappear despite an existing saved theme.

### Delivered

- REPL submission fix:
  - `src/ui/utils.ts`
    - command picker visibility now stops at the slash command token
    - once argument-entry whitespace begins, Enter returns to normal input submission
    - slash picker matching now stays aligned with slash-command dispatch case-insensitively (`/H`, `/Help`, etc.)
- Theme onboarding fix:
  - `src/ui/theme.tsx`
    - added explicit detection for configured theme preference from `ORCA_THEME` or `~/.orca/theme`
    - switched persisted-theme file reads to ESM-safe `node:fs` access so runtime theme detection matches tests
    - made theme context stateful so a newly selected theme applies immediately in the active ink session
  - `src/ui/components/App.tsx`
    - first-launch theme picker now respects persisted theme preference instead of only checking `ORCA_THEME`
    - theme selection now updates the current session before persisting `~/.orca/theme`
- Regression coverage:
  - `tests/ui-utils.test.ts`
    - picker stays visible for token-only slash prefixes
    - picker stays visible for uppercase slash prefixes that still resolve at dispatch time
    - picker hides for slash commands once argument entry begins
    - persisted `~/.orca/theme` counts as a valid onboarding-suppression signal
  - `tests/ink-ui.test.tsx`
    - theme selection updates the rendered theme immediately without requiring a restart

### Verification

- `npx vitest run tests/ui-utils.test.ts tests/ink-ui.test.tsx tests/chat-slash-readonly.test.ts tests/chat-slash-mutations.test.ts`
- `npm run lint`
- `npm test`
- `npm run build`

### Result

- slash commands with arguments no longer lose their arguments to picker Enter-handling
- slash autocomplete remains consistent with case-insensitive slash-command dispatch
- saved theme preference suppresses the onboarding picker on subsequent launches
- selecting a theme updates the active session immediately instead of waiting for restart
- targeted regression suite passed (`67/67`)
- full test suite passed
- `build` passed

## 2026-04-14 — ink UI CC-parity behavior-accuracy remediation

### Scope

Re-audit Orca's ink UI against CC reference sources, separate report drift from real source gaps, and land the highest-value behavior-accuracy fixes with regression coverage.

### Delivered

- Source re-audit outcome:
  - confirmed that most report-v3 P0/P1 items were already implemented in `src/ui/**`
  - narrowed remaining real gaps to viewport measurement, alt-screen timing, and ASCII-only word semantics
- UI/runtime fixes:
  - `src/ui/components/ScrollBox.tsx`
    - viewport height now comes from the rendered flex container, not terminal rows
    - imperative handle now exposes `getScrollHeight()` and `getViewportHeight()`
  - `src/ui/components/AlternateScreen.tsx`
    - alt-screen entry/cleanup now run in a pre-paint effect path
  - `src/ui/cursor.ts`
    - Unicode-aware word boundaries for movement and deletion
  - `src/ui/useTerminalSize.tsx`
    - shared `SIGWINCH` fallback subscription to prevent listener buildup
- Regression tests:
  - `tests/ink-ui.test.tsx`: flex-layout `ScrollBox` regression
  - `tests/cursor.test.ts`: Unicode word-boundary regression
- Canonical docs:
  - corrected `PROJECT_DIR` in `SYSTEM_ARCHITECTURE.md` and `USER_EXPERIENCE_MAP.md`
  - logged the correction in `ROLLING_REQUIREMENTS_AND_PROMPTS.md`
- File-expansion hardening:
  - `src/commands/chat.ts`
    - unified normalization for quoted paths, shell-escaped spaces, and `%20` file URLs
    - embedded expansion now reaches the existing preprocess pipeline for drag-pasted file paths with spaces
  - `tests/chat-file-expansion.test.ts`
    - direct helper-level coverage for the new path forms
  - directory expansion now also supports quoted / shell-escaped project paths with spaces
- Security hardening:
  - `src/preprocess/convert.ts`
    - replaced shell-built converter invocations with `execFileSync(...args)`
  - `src/agent/worktree.ts`
    - replaced shell-built git worktree/merge/delete calls with argument-array execution
  - `src/tools.ts`
    - replaced shell-built `git_commit` staging/commit with argument-array execution
  - `src/commands/chat.ts`
    - removed shell interpolation from project-tree generation
- IDE integration:
  - added `integrations/vscode-orca/`
  - command surface includes chat, current-file analysis, selection review, MCP launch, and doctor
  - terminal launch path is argv-safe and dependency-free
- Multimodal one-shot:
  - `src/providers/openai-compat.ts`
    - proxy provider layer now accepts prompt content parts (`text` + `image_url`)
  - `src/commands/chat.ts`
    - `orca chat --image <path...> "prompt"` builds data-URL image parts from local files
  - SDK path remains text-only and errors explicitly if used with `--image`
  - history/budget/session compatibility layer now flattens multimodal content safely where text-only surfaces still exist
- `chat.ts` decomposition:
  - added `src/commands/chat-input.ts`
  - added `src/commands/chat-slash-readonly.ts`
  - added `src/commands/chat-proxy-tool-call.ts`
  - added `src/commands/chat-slash-mutations.ts`
  - added `src/commands/chat-repl-async-slash.ts`
  - added `src/commands/chat-repl-turn.ts`
  - first extracted helpers:
    - safe `/git` argv parsing
    - image prompt construction for `--image`
  - expanded extraction:
    - file expansion / project bootstrap / multi-model prompt prep now also live in `chat-input.ts`
  - added `src/commands/chat-support.ts` for config + persistence helpers
  - read-only slash/display/status flows now live in `chat-slash-readonly.ts`
    - `/help`
    - read-only `/model` + `/models`
    - `/history`, `/tokens`, `/stats`, `/cwd`
    - `/diff`, `/git`
    - `/sessions`, `/jobs`
    - `/cost`, `/status`, `/doctor`, `/config`, `/providers`
  - `handleSlashCommand()` now delegates this tranche and uses an explicit typed slash-result union instead of `as string` dispatch casts
  - the remaining mutating/session slash flows now live in `chat-slash-mutations.ts`
    - model switching, clear/compact/system/hooks
    - async slash sentinels for `/council`, `/race`, `/pipeline`, `/mission`, `/plan`
    - session persistence / continue / undo
    - `/commit`, `/review`, `/pr` fallthrough behavior
    - `/mcp`, `/thread`, `/init`, `/notes`, `/postmortem`, `/prompts`, `/learn`
  - `runProxyTurn()` now delegates its tool callback to `chat-proxy-tool-call.ts`
    - dangerous-tool permission gating + diff previews
    - `PreToolUse`
    - sub-agent / `ask_user` / MCP / `sleep` routing
    - retry intelligence / error classifier / loop detector / postmortem / auto-verify / context guard
  - `runREPL()` now delegates async slash follow-up execution to `chat-repl-async-slash.ts`
    - `/council`, `/race`, `/pipeline`
    - `/mission`
    - `/plan`
  - `runREPL()` now delegates the normal prompt turn lifecycle to `chat-repl-turn.ts`
    - multi-task hinting
    - `UserPromptSubmit` hook gating
    - file expansion + cognitive skeleton injection
    - pre-send compaction
    - abort/progress lifecycle
    - proxy/SDK turn dispatch
    - 413 auto-recovery retry
    - post-turn compaction + session autosave
- Refactor regression coverage:
  - added `tests/chat-slash-readonly.test.ts`
  - added `tests/chat-proxy-tool-call.test.ts`
  - added `tests/chat-slash-mutations.test.ts`
  - added `tests/chat-repl-async-slash.test.ts`
  - added `tests/chat-repl-turn.test.ts`
  - helper extraction now has direct coverage for readonly markdown output, proxy tool orchestration, mutating slash fallthrough/state-reset behavior, async REPL slash follow-up, and the normal REPL prompt turn lifecycle

### Verification

- `npm run lint`
- `node --experimental-vm-modules node_modules/.bin/vitest run tests/cursor.test.ts tests/ink-ui.test.tsx`
- `node --experimental-vm-modules node_modules/.bin/vitest run tests/chat-file-expansion.test.ts tests/file-expansion.test.ts`
- `node --experimental-vm-modules node_modules/.bin/vitest run tests/chat-file-expansion.test.ts`
- `node --experimental-vm-modules node_modules/.bin/vitest run tests/adversarial.test.ts tests/preprocess.test.ts tests/phase1-agent.test.ts`
- `node --experimental-vm-modules node_modules/.bin/vitest run tests/vscode-extension.test.ts`
- `node --experimental-vm-modules node_modules/.bin/vitest run tests/openai-compat-multimodal.test.ts tests/chat-image-option.test.ts tests/provider-stream-resilience.test.ts tests/agent-loop.test.ts`
- `node --experimental-vm-modules node_modules/.bin/vitest run tests/openai-compat-multimodal.test.ts tests/chat-image-option.test.ts tests/context-protection.test.ts tests/provider-stream-resilience.test.ts tests/agent-loop.test.ts`
- `node --experimental-vm-modules node_modules/.bin/vitest run tests/chat-git-command.test.ts tests/chat-image-option.test.ts tests/openai-compat-multimodal.test.ts tests/chat-file-expansion.test.ts`
- `node --experimental-vm-modules node_modules/.bin/vitest run tests/chat-git-command.test.ts tests/chat-image-option.test.ts tests/chat-file-expansion.test.ts tests/openai-compat-multimodal.test.ts tests/vscode-extension.test.ts`
- `node --experimental-vm-modules node_modules/.bin/vitest run tests/chat-slash-readonly.test.ts tests/chat-git-command.test.ts tests/chat-image-option.test.ts tests/chat-file-expansion.test.ts`
- `node --experimental-vm-modules node_modules/.bin/vitest run tests/chat-proxy-tool-call.test.ts tests/chat-slash-readonly.test.ts tests/chat-git-command.test.ts tests/chat-image-option.test.ts tests/chat-file-expansion.test.ts`
- `node --experimental-vm-modules node_modules/.bin/vitest run tests/chat-slash-mutations.test.ts tests/chat-proxy-tool-call.test.ts tests/chat-slash-readonly.test.ts tests/chat-git-command.test.ts tests/chat-image-option.test.ts tests/chat-file-expansion.test.ts`
- `node --experimental-vm-modules node_modules/.bin/vitest run tests/chat-repl-async-slash.test.ts tests/chat-slash-mutations.test.ts tests/chat-proxy-tool-call.test.ts tests/chat-slash-readonly.test.ts tests/chat-git-command.test.ts tests/chat-image-option.test.ts tests/chat-file-expansion.test.ts`
- `node --experimental-vm-modules node_modules/.bin/vitest run tests/chat-repl-turn.test.ts`
- `npm test`
- `npm run build`

### Result

- `lint` passed
- targeted UI regression suite passed (`83/83`)
- targeted file-expansion suite passed (`70/70`)
- full test suite passed (`1206/1206`)
- full test suite passed (`1212/1212`) after file-expansion hardening
- targeted directory-expansion follow-up passed (`8/8`)
- full test suite passed (`1214/1214`) after directory-path hardening
- targeted shell-hardening suite passed (`134/134`)
- full test suite passed (`1216/1216`) after shell-hardening
- targeted VS Code skeleton suite passed (`3/3`)
- full test suite passed (`1219/1219`) after VS Code skeleton follow-up
- targeted multimodal suite passed (`36/36`)
- full test suite passed (`1226/1226`) after multimodal one-shot follow-up
- targeted multimodal compatibility suite passed (`78/78`)
- full test suite passed (`1227/1227`) after multimodal history/budget follow-up
- targeted helper-extraction suite passed (`16/16`)
- full test suite stayed green (`1227/1227`) after partial `chat.ts` extraction
- targeted extraction suite passed (`19/19`) after `chat-input.ts` / `chat-support.ts` expansion
- full test suite passed (`1238/1238`) after extraction follow-up
- targeted readonly-slash extraction suite passed (`18/18`)
- full test suite passed (`1242/1242`) after `chat-slash-readonly.ts` extraction
- targeted proxy/helper extraction suite passed (`22/22`)
- full test suite passed (`1246/1246`) after `chat-proxy-tool-call.ts` extraction
- targeted mutating-slash extraction suite passed (`26/26`)
- full test suite passed (`1250/1250`) after `chat-slash-mutations.ts` extraction
- targeted async-REPL-slash extraction suite passed (`30/30`)
- full test suite passed (`1254/1254`) after `chat-repl-async-slash.ts` extraction
- targeted REPL-turn extraction suite passed (`6/6`)
- full test suite passed (`1260/1260`) after `chat-repl-turn.ts` extraction
- `build` passed

### Remaining Risks

- Orca still does not implement CC's broader `ScrollBox.scrollToElement()` + virtualization stack; current fix addresses the real flex-viewport bug, not the whole CC scroll architecture.
- Interactive image paste / multimodal paste handling remains out of scope for this round.
- Saved-session history and compaction are now multimodal-compatible by text flattening, but not yet rich multimodal replay.
- IDE integration now has a real skeleton, but richer editor-native UX is still open.
- `chat.ts` is now slimmer, and the read-only slash tranche, proxy tool callback, mutating slash flows, async REPL slash follow-up, and normal REPL turn lifecycle are split out, but the remaining `runREPL` input/discovery/dispatch front-half still remains the main maintainability hotspot.
- Spinner theming and tool-error rendering are still Orca-specific approximations, not a byte-for-byte CC port.

## Scope

Internalize the first Hermes-inspired runtime capability bundle into Orca CLI and keep canonical project docs in sync.

## Delivered

- Root governance files: `AGENTS.md`, `CLAUDE.md`, `CODEX.md`, `GEMINI.md`
- Git hygiene update: `.gitignore` now ignores `.omx/`
- Canonical project doc tree under `doc/00_project/initiative_orca/`
- Initial PRD, architecture summary, CLI UX map, optimization plan, and workflow assets
- Review follow-up:
  - 7 complete `.html` companions regenerated from canonical `.md` files
  - `CODEX.md` and `GEMINI.md` reduced to canonical references to avoid drift
  - `git_commit` non-repo failure path hardened to keep git stderr inside the tool result
  - Regression coverage added for `git_commit` in non-repo directories
- Hermes-inspired runtime bundle:
  - tool arg coercion for stringified number/boolean/array tool inputs
  - oversized tool result persistence to `~/.orca/tool-results/`
  - background job tracking + completion notifications via `src/background-jobs.ts`
  - REPL `/jobs` view for tracked detached work
- Model/provider ergonomics bundle:
  - `src/model-catalog.ts` centralizes model metadata
  - `/model` now shows provider, context, pricing, and caution notes
  - `/models` now lists provider-aware choices instead of a hard-coded Poe-only set
  - `orca providers` now shows the same context/pricing/caution metadata before a session starts
- Centralized logging bundle:
  - `src/logger.ts` writes local runtime logs under `~/.orca/logs/` or `$ORCA_HOME/logs/`
  - `orca logs` and `orca logs errors` surface recent log entries
  - key runtime warning/error/info events now persist beyond the terminal session
- Doctor diagnostics bundle:
  - `src/doctor.ts` gathers provider/config/hook/MCP/session/background-job/log diagnostics
  - `orca doctor` and `orca doctor --json` expose that state directly
  - malformed JSON config files are reported explicitly through doctor diagnostics instead of relying on generic terminal noise
- Serve observability bundle:
  - `orca serve` now reuses doctor/model-catalog metadata in `/health`, `/providers`, and `/doctor`
  - headless clients can inspect the same runtime state surfaces as CLI users
- Stats dashboard bundle:
  - `orca stats` now combines usage/cost, runtime health, and recent error summaries
- SDK boundary:
  - `MARUCIE-open-agent-sdk` reviewed repeatedly but still intentionally unchanged
  - Current Hermes-inspired slices remain Orca-local runtime ergonomics rather than shared provider-neutral SDK seams
- SDK boundary:
  - `MARUCIE-open-agent-sdk` reviewed but not changed; this bundle remains Orca-local for now

## Verification

- Structure verification:
  - `find doc/00_project -maxdepth 3 -type f | sort`
- Repo verification:
  - `npm run lint`
  - `npm test`
  - `npm run build`
  - `npm run bench`
  - `node dist/bin/orca.js --help`
  - `node --experimental-vm-modules node_modules/.bin/vitest run tests/adversarial.test.ts tests/protocol.test.ts`
  - `node --experimental-vm-modules node_modules/.bin/vitest run tests/hermes-runtime.test.ts`
  - `node --experimental-vm-modules node_modules/.bin/vitest run tests/model-catalog.test.ts`
  - `node --experimental-vm-modules node_modules/.bin/vitest run tests/model-catalog.test.ts tests/providers-command.test.ts`
  - `node --experimental-vm-modules node_modules/.bin/vitest run tests/logger.test.ts tests/logs-command.test.ts tests/program.test.ts`
  - `OPENAI_API_KEY=test-openai-key ORCA_PROVIDER=openai node dist/bin/orca.js providers`
  - `ORCA_HOME=$(mktemp -d) node dist/bin/orca.js logs`
  - `node --experimental-vm-modules node_modules/.bin/vitest run tests/doctor-command.test.ts`
  - `OPENAI_API_KEY=test-openai-key ORCA_PROVIDER=openai node dist/bin/orca.js doctor --json`
  - `node --experimental-vm-modules node_modules/.bin/vitest run tests/serve-command.test.ts`
  - `node --experimental-vm-modules node_modules/.bin/vitest run tests/stats-command.test.ts`
- Result:
  - `lint` passed
  - `test` passed (`426/426`)
  - `build` passed
  - `bench` passed (`10/10`, `100%`)
  - CLI help smoke test passed
  - Targeted regression rerun passed (`34/34`)
  - Hermes runtime targeted suite passed (`3/3`)
  - Model catalog targeted suite passed (`4/4`)
  - Provider command targeted suite passed (`5/5`)
  - Built provider listing smoke test passed
  - Logger/logs command targeted suite passed (`12/12`)
  - Built logs command smoke test passed
  - Doctor command targeted suite passed (`1/1`)
  - Built doctor command smoke test passed
  - Serve command targeted suite passed (`1/1`)
  - Stats command targeted suite passed (`1/1`)

## Remaining Risks

- Legacy flat docs in `doc/` still exist and may need deliberate migration or cross-link maintenance
- Runtime code changed only in the `git_commit` stderr-handling path, and that path is now covered by both targeted and full-suite verification
- No known blocking issues remain from this Hermes-internalization branch
