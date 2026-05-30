# HANDOFF — Armature CLI SOTA Review Continuation

Updated: 2026-04-22
Project root: `/Users/mauricewen/Projects/armature-agent`

## Current State

Superseding update (2026-04-22):

- The current repo baseline is no longer the older 2026-04-16 remediation tranche alone. The active product direction now includes trust-policy hardening, continuity footholds, the global native Armature hook surface, the layered test matrix, and a completed one-click full-delivery pass for the current tranche.
- Two blocker classes were closed in the 2026-04-22 delivery pass:
  - harness drift from Cloudflare's provider-key fallback (`tests/config.test.ts`)
  - trust-policy gaps around repo-local MCP autospawn, zero-tool fail-open allowlists, MCP stdout framing, `/chat` body limits, and global config test isolation
- Latest verification baseline:
  - `npm run lint` PASS
  - `npm run build` PASS
  - `npm test` PASS (`1553/1553`)
  - `npm run test:matrix:sync` PASS
  - `npm run test:matrix` PASS (`run-20260422-061719`; `static` / `security` / `performance` are `partial-pass` by design, all layer exit codes `0`)
  - `npm run eval:fast` PASS (`62/62`, run `20260422-063053-333719`)
  - `npm run eval:nightly` PASS (`65/65`, run `20260422-061814-339289`)
  - `npm run eval:release` PASS (`68/68`, run `20260422-061914-913077`)
- Release/security evidence:
  - `npm audit --omit=dev` PASS (`0` prod vulnerabilities)
  - `npm pack --json --dry-run` PASS
  - `node dist/bin/armature.js bench --json` PASS (`score 100`)
- Delivery artifacts:
  - `outputs/spec/2026-04-22-one-click-full-delivery-spec.md`
  - `outputs/security/2026-04-22-security-readiness.md`
  - `outputs/release/2026-04-22-release-readiness.md`
  - `outputs/learn/2026-04-22-dna-capsule-candidates.md`
- Older sections below remain useful historical context, but they no longer represent the latest gate counts or the current continuation point.

This repo is in a good, test-green state after a long review/remediation tranche plus a new SOTA gate-system tranche focused on:

1. ink UI CC-parity behavior fixes
2. file/path/project-context expansion hardening
3. shell-injection hardening across tool/runtime/git/worktree surfaces
4. VS Code extension skeleton
5. multimodal one-shot image support on the proxy path
6. `chat.ts` helper decomposition, now including readonly slash extraction, proxy tool orchestration extraction, mutating slash extraction, async REPL slash extraction, and normal REPL turn lifecycle extraction

Current verification baseline:

- `npm run lint` passed
- `npm test` passed `1546/1546`
- `npm run build` passed
- `npm run bench` passed (`10/10`, `100%`)
- `npm run eval:fast` passed (`62/62`) — run `20260422-054119-735043`
- `npm run eval:nightly` passed (`65/65`) — run `20260422-054727-090885`
- `npm run eval:release` passed (`68/68`) — run `20260422-054415-886673`

## What Changed In This Tranche

### 1. ink UI / CC-parity

- `src/ui/components/ScrollBox.tsx`
  - viewport now measured from rendered flex container, not terminal rows
- `src/ui/components/AlternateScreen.tsx`
  - alt-screen enter moved to pre-paint hook path
- `src/ui/cursor.ts`
  - Unicode-aware word boundaries
- `src/ui/useTerminalSize.tsx`
  - shared `SIGWINCH` subscription

### 2. Input Expansion / Project Bootstrap

- `src/commands/chat-input.ts`
  - owns:
    - safe `/git` slash parsing
    - image prompt construction
    - file/path expansion
    - project bootstrap / project tree injection
    - multi-model prompt preparation
- Drag-pasted paths with spaces now work for:
  - quoted file paths
  - shell-escaped file paths
  - `%20` `file:///...` URLs
  - quoted / escaped directory paths with spaces

### 3. Security Hardening

Shell-built path/git execution was replaced with argument-array execution in:

- `src/preprocess/convert.ts`
- `src/agent/worktree.ts`
- `src/tools.ts`
- `src/commands/chat.ts`
- `src/commands/pr.ts`

Search/fetch/discovery tools were also hardened away from shell pipelines where practical:

- `search_files`
- `find_definition`
- `find_references`
- `glob_files`
- `fetch_url`
- `web_search`

### 4. IDE Integration

Added a zero-dependency VS Code extension skeleton:

- `integrations/vscode-armature/package.json`
- `integrations/vscode-armature/extension.js`
- `integrations/vscode-armature/terminal-options.cjs`
- `integrations/vscode-armature/README.md`

Commands included:

- `Armature: Open Chat`
- `Armature: Analyze Current File`
- `Armature: Review Selection`
- `Armature: Start MCP Server`
- `Armature: Run Doctor`

### 5. Multimodal One-Shot

- `src/providers/openai-compat.ts`
  - accepts prompt content parts (`text` + `image_url`) on proxy path
- `src/commands/chat.ts`
  - `armature chat --image <path...> "prompt"` supported
- `src/token-budget.ts`
- `src/commands/session.ts`
- `src/commands/chat.ts`
  - now tolerate multimodal message content through text flattening (`messageContentToText`)

### 6. chat.ts Decomposition

Seven helper modules now exist:

- `src/commands/chat-input.ts`
- `src/commands/chat-support.ts`
- `src/commands/chat-slash-readonly.ts`
- `src/commands/chat-proxy-tool-call.ts`
- `src/commands/chat-slash-mutations.ts`
- `src/commands/chat-repl-async-slash.ts`
- `src/commands/chat-repl-turn.ts`

Moved out of `src/commands/chat.ts`:

- safe `/git` parsing
- image prompt builder
- file expansion
- project bootstrap / project tree prompt prep
- multi-model prompt prep
- config-file detection
- CLI flag shaping
- input history persistence
- session autosave persistence
- read-only slash display/status/help flows:
  - `/help`
  - read-only `/model` and `/models`
  - `/history`, `/tokens`, `/stats`, `/cwd`
  - `/diff`, `/git`
  - `/sessions`, `/jobs`
  - `/cost`, `/status`, `/doctor`, `/config`, `/providers`
- `handleSlashCommand()` now uses an explicit typed result union instead of `as string` branching for async slash flows
- the remaining mutating/session slash flows now also live in `chat-slash-mutations.ts`, including:
  - `/model set|use`, `/clear`, `/compact`, `/system`, `/hooks`
  - async slash dispatch sentinels for `/council`, `/race`, `/pipeline`, `/mission`, `/plan`
  - session persistence / undo / continue
  - `/commit`, `/review`, `/pr` fallthrough behavior
  - `/mcp`, `/thread`, `/init`, `/notes`, `/postmortem`, `/prompts`, `/learn`
- `runProxyTurn()` now delegates its tool callback to `chat-proxy-tool-call.ts`, which owns:
  - dangerous-tool permission gating and diff previews
  - `PreToolUse` handling
  - sub-agent / `ask_user` / MCP / `sleep` async tool routing
  - post-tool retry intelligence, error classification, loop detection, postmortem matching, auto-verify, and context guarding
- `runREPL()` now delegates async slash follow-up execution to `chat-repl-async-slash.ts`, which owns:
  - `/council`, `/race`, `/pipeline` multi-model execution
  - `/mission` autonomous execution wrapper
  - `/plan` decomposition + execution wrapper
  - ink/legacy progress rendering for those async slash paths
- `runREPL()` now also delegates the normal prompt turn execution path to `chat-repl-turn.ts`, which owns:
  - multi-task hinting
  - `UserPromptSubmit` hook gating
  - file expansion + cognitive skeleton injection
  - pre-send compaction
  - abort/progress lifecycle
  - proxy/SDK turn dispatch
  - 413 auto-recovery retry
  - post-turn compaction + session autosave

`chat.ts` is still large, but the decomposition has started with real, test-backed boundaries.

## Important Files

### Main Runtime / CLI

- `src/commands/chat.ts`
- `src/commands/chat-input.ts`
- `src/commands/chat-support.ts`
- `src/commands/chat-slash-readonly.ts`
- `src/commands/chat-proxy-tool-call.ts`
- `src/commands/chat-slash-mutations.ts`
- `src/commands/chat-repl-async-slash.ts`
- `src/commands/chat-repl-turn.ts`
- `src/providers/openai-compat.ts`
- `src/tools.ts`
- `src/token-budget.ts`
- `src/commands/session.ts`
- `src/commands/pr.ts`
- `src/agent/worktree.ts`
- `src/preprocess/convert.ts`

### IDE Integration

- `integrations/vscode-armature/`

### Canonical Project Docs

- `doc/00_project/initiative_armature/task_plan.md`
- `doc/00_project/initiative_armature/notes.md`
- `doc/00_project/initiative_armature/deliverable.md`
- `doc/00_project/initiative_armature/ROLLING_REQUIREMENTS_AND_PROMPTS.md`
- `doc/00_project/initiative_armature/SYSTEM_ARCHITECTURE.md`
- `doc/00_project/initiative_armature/USER_EXPERIENCE_MAP.md`

### SOTA Gate System

- `agent-eval/manifests/fast.json`
- `agent-eval/manifests/nightly.json`
- `agent-eval/manifests/release.json`
- `agent-eval/scripts/run-gate.py`
- `agent-eval/scripts/run-fast-gate.py`
- `agent-eval/scripts/release-cli-journey.sh`
- `tests/agent-eval-manifests.test.ts`

## Tests Added / Updated

New or materially updated tests in this tranche:

- `tests/chat-file-expansion.test.ts`
- `tests/chat-git-command.test.ts`
- `tests/chat-image-option.test.ts`
- `tests/chat-proxy-tool-call.test.ts`
- `tests/chat-repl-turn.test.ts`
- `tests/chat-repl-async-slash.test.ts`
- `tests/chat-slash-mutations.test.ts`
- `tests/chat-slash-readonly.test.ts`
- `tests/openai-compat-multimodal.test.ts`
- `tests/vscode-extension.test.ts`
- `tests/adversarial.test.ts`
- `tests/context-protection.test.ts`
- `tests/config.test.ts`
- `tests/cursor.test.ts`
- `tests/ink-ui.test.tsx`
- `tests/agent-eval-manifests.test.ts`

## Working Tree Status

There are many modified files in the current worktree. They are intentional and mostly belong to the review/remediation tranche above.

Notable non-source/runtime noise:

- `.claude/state.md`
- `.claude/subagent-logs/activity.log`
- `outputs/reports/code-quality-swarm/2026-04-14-ink-cc-parity-review.html`
- `state/` (untracked)

These should be treated carefully and not blindly reverted.

## Recommended Next Step

The highest-value next step is again maintainability work in `src/commands/chat.ts`.

Recommended order:

1. Split the remaining `runREPL()` front-half input/discovery/dispatch flow into smaller helpers
2. Keep the new gate system stable by extending manifests/tasks rather than reintroducing one-off eval scripts
3. Only after that, reconsider interactive image paste / richer multimodal persistence

## Known Remaining Gaps

- Interactive image paste in the ink REPL is still not implemented
- Session replay is only multimodal-compatible via text flattening, not rich multimodal replay
- `chat.ts` orchestration bodies remain large, especially the remaining REPL input/discovery/dispatch front-half
- IDE integration is now real, but still only terminal-backed; no richer editor-native UX yet
- `ScrollBox.scrollToElement()` / virtualization parity with CC is still not implemented

## Verification Commands To Re-Run First

If another model continues work, start with:

```bash
npm run lint
npm test
npm run build
```

If touching chat decomposition / multimodal / slash parsing specifically:

```bash
  node --experimental-vm-modules node_modules/.bin/vitest run \
  tests/chat-repl-turn.test.ts \
  tests/chat-repl-async-slash.test.ts \
  tests/chat-proxy-tool-call.test.ts \
  tests/chat-slash-mutations.test.ts \
  tests/chat-slash-readonly.test.ts \
  tests/chat-git-command.test.ts \
  tests/chat-image-option.test.ts \
  tests/chat-file-expansion.test.ts \
  tests/openai-compat-multimodal.test.ts \
  tests/vscode-extension.test.ts
```

## Appendix — Historical Snapshot

The previous April 6 handoff was replaced by this current handoff because it no longer described the active repository state. If needed, recover it from git history.
