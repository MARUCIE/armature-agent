# Deliverable

## 2026-05-03 - Markdown Artifact Write Integrity

### Scope

Fix the low-level operator-visible regression where Orca wrote assistant conversation text into a requested Markdown file during false-save repair.

### Delivered

- Identified the issue as a tool-orchestration repair bug, not a broken `write_file` / `open_file` implementation.
- Changed false-save repair to extract artifact body only from fenced Markdown/text, explicit content markers, or Markdown document structure.
- Made false-save repair refuse to write when the model provides only conversational save text and no generated artifact body.
- Updated the system prompt so providers know `write_file.content` must be the final requested file body only.
- Added regressions for artifact extraction and no-artifact non-repair.

### Changed Files

- `src/commands/local-file-intent.ts`
- `src/system-prompt.ts`
- `tests/local-file-intent.test.ts`
- `tests/chat-internals.test.ts`
- `tests/e2e-workflow.test.ts`
- `doc/00_project/initiative_orca/*` active PDCA / evidence updates

### Verification

- `npm test -- tests/local-file-intent.test.ts tests/chat-internals.test.ts tests/chat-repl-turn.test.ts tests/e2e-workflow.test.ts` -> `45/45`
- `npm run lint` -> pass
- `npm run build` -> pass
- `npm test` -> `91` files / `1665` tests

### Closeout

| Item | Result |
| --- | --- |
| Skills | N/A. Orca-specific local-file repair behavior. |
| PDCA four docs | Updated PRD, system architecture, user experience map, and platform optimization plan. |
| Root guidance | N/A. No new cross-task AGENTS / CLAUDE rule. |
| Rolling ledger | Updated with Markdown artifact write integrity requirement. |
| Technical debt | Closed the in-scope false-save content pollution path. |
| Three-end consistency | N/A. Local CLI code and docs only; no GitHub PR or VPS deployment requested. |

## 2026-05-02 - Tool-Call Continuity and Blackfin Mark

### Scope

Fix the remaining long-session local file/tool-call failure mode, add the missing canonical tool-call test matrix lane, and settle the startup identity on a clear `ORCA-AGENT` wordmark plus state deck without separate icon art.

### Delivered

- Kept the current system prompt in every OpenAI-compatible streamed turn, including REPL turns with existing history.
- De-duplicated one identical leading system prompt from history to avoid double-injection.
- Strengthened the generated system prompt so local file create/open requests must use `write_file`, `read_file`, `file_info`, or `open_file` before failure claims.
- Added a runtime local-file intent guard for obvious REPL read/write/open follow-ups before the model call.
- Added false-save repair so streamed proxy turns write the claimed file when the model says it saved a path but no file tool ran.
- Added missing-claimed-file repair so follow-ups can reconstruct and open a previously claimed file from chat history.
- Fixed default proxy tool allow-list assembly so built-in tools are not advertised to the model while being blocked by policy.
- Added `tool-calls` to the canonical test matrix and generated `npm run test:tool-calls`.
- Replaced the old compact startup mark with a dominant `ORCA-AGENT` wordmark and removed the rejected independent Blackfin orca hero/icon block from the existing theme-aware Banner deck.

### Changed Files

- `src/providers/openai-compat.ts`
- `src/system-prompt.ts`
- `src/commands/local-file-intent.ts`
- `src/commands/chat-repl-turn.ts`
- `src/commands/chat.ts`
- `src/ui/components/Banner.tsx`
- `tests/local-file-intent.test.ts`
- `tests/chat-internals.test.ts`
- `tests/chat-repl-turn.test.ts`
- `tests/openai-compat-multimodal.test.ts`
- `tests/e2e-workflow.test.ts`
- `tests/ink-ui.test.tsx`
- `agent-eval/manifests/test-matrix.json`
- `agent-eval/generated/test-matrix-entrypoints.md`
- `package.json`
- `doc/00_project/initiative_orca/*` active PDCA / evidence updates

### Verification

- `npm test -- tests/openai-compat-multimodal.test.ts tests/e2e-workflow.test.ts` -> `22/22`
- `npm test -- tests/local-file-intent.test.ts tests/chat-internals.test.ts tests/chat-repl-turn.test.ts` -> `31/31`
- `npm run test:matrix:sync` -> pass
- `npm run test:tool-calls` -> pass
- `npm test -- tests/ink-ui.test.tsx` -> `80/80`
- Rendered Banner inspection -> `ORCA-AGENT`, `Orca Agent v0.8.16`, `Blackfin Signal`, clean state rows, and no independent hero art
- `npm run lint` -> pass
- `npm run build` -> pass
- `npm test` -> `91` files / `1663` tests
- Dist-level local file guard smoke with fake `open` -> missing claimed file reconstructed, `write_file` succeeded, and `open_file` received the generated Markdown path

### Closeout

| Item | Result |
| --- | --- |
| Skills | N/A. This is Orca-specific runtime, test-matrix, and Banner identity work. |
| PDCA four docs | Updated PRD, system architecture, user experience map, and platform optimization plan. |
| Root guidance | N/A. No new cross-task AGENTS / CLAUDE rule. |
| Rolling ledger | Updated with tool-call continuity, matrix, and Blackfin mark requirements. |
| Technical debt | Closed the in-scope long-session prompt decay and missing tool-call matrix lane. |
| Three-end consistency | N/A. Local CLI code and docs only; no GitHub PR or VPS deployment requested. |

### Remaining Risks

| Risk | Owner | Follow-up |
| --- | --- | --- |
| Already-running Orca sessions use the old built `dist` code until restarted | Operator | Rebuild and restart Orca after this change |
| Live provider smoke is blocked by external provider/account state | Runtime | Poe default timed out, `qwen3.6-plus` does not support tool calling, Anthropic lacks credits, and Cloudflare returned unauthorized; keep deterministic `test:tool-calls` as release gate and rerun live smoke after provider config is fixed |

## 2026-05-02 - Model Catalog SSoT Runtime Consolidation

### Scope

Close ORCA-SWARM-021 by eliminating duplicated model metadata tables from runtime consumers and making the provider-aware catalog, token budget, provider request defaults, and output summaries share one canonical source.

### Delivered

- Added `src/model-metadata.ts` for canonical model context windows, max output defaults, pricing tiers, and capacity/pricing formatters.
- Kept `src/model-catalog.ts` as the public provider-aware catalog by re-exporting canonical metadata helpers and preserving provider grouping / duplicate-model resolution.
- Updated token budget context windows and max-output reporting to use canonical metadata.
- Updated OpenAI-compatible context hard-stop thresholds and request max-token defaults to use canonical metadata.
- Updated startup provider capacity labels and usage/session cost estimates to use canonical metadata.
- Added a regression guard that scans runtime consumers and fails if duplicate metadata tables are reintroduced.
- Refreshed README, release evidence, and active project docs.

### Changed Files

- `src/model-metadata.ts`
- `src/model-catalog.ts`
- `src/token-budget.ts`
- `src/providers/openai-compat.ts`
- `src/output.ts`
- `tests/model-catalog.test.ts`
- `README.md`
- `doc/00_project/initiative_orca/*` active PDCA / evidence updates

### Verification

- `npm test -- tests/model-catalog.test.ts tests/context-protection.test.ts tests/agent-intelligence.test.ts tests/openai-compat-multimodal.test.ts` -> `86/86`
- `npm run lint` -> pass
- `npm run build` -> pass
- `npm test` -> `91` files / `1663` tests

### Closeout

| Item | Result |
| --- | --- |
| Skills | N/A. This is Orca-specific runtime/catalog consolidation, not a reusable cross-project skill. |
| PDCA four docs | Updated PRD, system architecture, user experience map, and platform optimization plan. |
| Root guidance | N/A. No new cross-task AGENTS / CLAUDE rule. |
| Rolling ledger | Updated with model metadata SSoT requirements and anti-regression guards. |
| Technical debt | In-scope metadata drift closed for token budget, provider max-token defaults, output labels, and usage cost estimates. |
| Three-end consistency | N/A. Local CLI code and docs only; no GitHub PR or VPS deployment requested. |

### Remaining Risks

| Risk | Owner | Follow-up |
| --- | --- | --- |
| Metadata values still require manual updates as provider offerings change | Runtime | Keep `src/model-metadata.ts` as the only update point and add source-backed updates when model specs change |
| Provider routing policy itself is still broader than metadata SSoT | Runtime | Future tranche can consolidate routing decisions if route fallback behavior drifts |

## 2026-05-02 - Terminal Operability Hardening

### Scope

Fix Orca CLI's terminal copyability/flicker regression, launcher cwd drift, MCP server-name routing bug, and missing local file-opening tool.

### Delivered

- Made Ink alternate-screen rendering opt-in through `ORCA_ALT_SCREEN=1` so default output stays in normal terminal scrollback and is copyable.
- Made mouse tracking opt-in through `ORCA_MOUSE=1` so default text selection is not captured by the app.
- Added durable workspace cwd resolution with explicit `--cwd`/env priority, ambient project detection, and last-workspace fallback for non-workspace launches.
- Added root `orca --cwd <dir>` forwarding into `orca chat` for launcher/menu entrypoints.
- Fixed MCP tool routing for server names containing underscores or hyphens.
- Widened Codex TOML MCP parser to support hyphenated `[mcp_servers.<name>]` sections.
- Added `open_file` as the 42nd built-in tool for visual local file opening and included it in dangerous-tool approval policy.
- Refreshed tool counts, tests, README, release evidence, and active project docs.

### Changed Files

- `src/ui/render.tsx`
- `src/ui/components/App.tsx`
- `src/commands/chat-support.ts`
- `src/commands/chat.ts`
- `src/program.ts`
- `src/mcp-client.ts`
- `src/tools.ts`
- `tests/chat-support.test.ts`
- `tests/ink-ui.test.tsx`
- `tests/mcp-client.test.ts`
- `tests/program.test.ts`
- `tests/tools.test.ts`
- `tests/tools-full.test.ts`
- `tests/hooks.test.ts`
- `tests/e2e-workflow.test.ts`
- `tests/adversarial.test.ts`
- `README.md`
- `doc/00_project/initiative_orca/*` active PDCA / evidence updates

### Verification

- Targeted regression pack -> `250/250`
- `npm run build` -> pass
- `node dist/bin/orca.js --help` -> `42 tools`, `--cwd`, and `critique` visible
- `node dist/bin/orca.js chat --help` -> `--cwd`, `--image`, and auto-critique flags visible
- `node dist/bin/orca.js doctor` -> provider OK (`poe / claude-opus-4.6`), `14` MCP configs discovered
- Live one-shot: `ORCA_NO_INK=1 node dist/bin/orca.js chat --json --cwd /Users/mauricewen/Projects/orca-cli -p poe --max-turns 4 ...` -> model called `read_file`, tool succeeded, final answer `Orca CLI`
- `npm test` -> `90` files / `1651` tests

### Closeout

| Item | Result |
| --- | --- |
| Skills | N/A. This is Orca-specific runtime hardening, not a reusable cross-project skill. |
| PDCA four docs | Updated PRD, system architecture, user experience map, and platform optimization plan. |
| Root guidance | N/A. No new cross-task AGENTS / CLAUDE rule. |
| Rolling ledger | Updated with terminal/cwd/MCP/open-file requirements and anti-regression guards. |
| Technical debt | Release evidence snapshot drift was fixed after full-suite verification exposed it. Historical v0.3 report counts remain historical baselines. |
| Three-end consistency | N/A. Local CLI code and docs only; no GitHub PR or VPS deployment requested. |

### Remaining Risks

| Risk | Owner | Follow-up |
| --- | --- | --- |
| First launch from a non-workspace directory before any workspace is remembered still uses that directory | Runtime / Launcher | Pass `--cwd`, `ORCA_CWD`, or `ORCA_PROJECT_DIR` from launch wrappers for deterministic first-run behavior |
| Project-local MCP servers are still explicit-connect by design | Runtime | Use MCP connection commands/policy when a project server should be live |

## 2026-05-02 - Rubber Duck Critique Quality Gate

### Scope

Optimize Orca CLI against the local 2026-05-02 AI coding CLI research report by adding the missing read-only critique/checkpoint layer while preserving `reflect` as the Socratic debugging workflow.

### Delivered

- Added a critique core module with checkpoint validation, weighted risk scoring, complementary reviewer selection, prompt assembly, diff-line counting, and structured JSON result parsing.
- Extracted workspace critique inspection into a reusable module shared by the standalone command and chat slash command.
- Added `orca critique` as a first-class command with `--checkpoint`, plan/log/diff inputs, risk flags, `--force`, `--dry-run`, `--json`, and `--show-prompt`.
- Added `/critique` inside `orca chat` as a read-only local inspection that renders reviewer choice, risk score, diff lines, and changed files in legacy output or an Ink detail panel.
- Added automatic chat pre-send local critique hints for high-risk dirty diffs. The hint is read-only, model-free, suppresses repeats for the same diff signature, and points operators to `/critique --checkpoint after_complex_implementation`.
- Exposed `orca chat --no-auto-critique` and `orca chat --auto-critique-threshold <score>` so automatic hints are discoverable and session-scoped, not env-only.
- Extended the same automatic local hint to one-shot `orca chat "prompt"` streaming runs while keeping `--json` one-shot output clean.
- Made dry-run mode deterministic and API-key-free so local CI and humans can inspect whether a checkpoint would run.
- Registered the command in the public Orca command surface and slash discovery registries.
- Added focused unit, slash, registry, and command contract coverage.
- Fixed hook trust evaluation so project hooks are honored when `ORCA_TRUST_PROJECT_HOOKS=1` is set before `HookManager.load()`, even if the singleton was constructed earlier.
- Updated README and active project docs to record the product/architecture/UX distinction between `reflect` and `critique`.

### Changed Files

- `src/critique.ts`
- `src/critique-workspace.ts`
- `src/critique-auto.ts`
- `src/commands/critique.ts`
- `src/commands/chat.ts`
- `src/commands/chat-repl-turn.ts`
- `src/commands/chat-slash-readonly.ts`
- `src/program.ts`
- `src/command-picker.ts`
- `src/slash-commands.ts`
- `src/hooks.ts`
- `tests/critique.test.ts`
- `tests/chat-one-shot-mcp-cleanup.test.ts`
- `tests/chat-repl-turn.test.ts`
- `tests/command-contracts.test.ts`
- `tests/chat-slash-readonly.test.ts`
- `tests/program.test.ts`
- `tests/command-contracts.test.ts`
- `tests/command-picker.test.ts`
- `tests/slash-commands.test.ts`
- `README.md`
- `doc/00_project/initiative_orca/*` PDCA and project fact-source updates

### Verification

- `npm test -- tests/critique.test.ts tests/program.test.ts tests/command-contracts.test.ts` -> `42/42`
- `npm test -- tests/critique.test.ts tests/chat-slash-readonly.test.ts tests/command-picker.test.ts tests/slash-commands.test.ts tests/program.test.ts tests/command-contracts.test.ts` -> `70/70`
- `npm test -- tests/critique.test.ts tests/chat-repl-turn.test.ts` -> `25/25`
- `npm test -- tests/chat-one-shot-mcp-cleanup.test.ts tests/chat-repl-turn.test.ts tests/command-contracts.test.ts` -> `33/33`
- `npm test -- tests/v050-modules.test.ts` -> `47/47`
- `npm run lint` -> pass
- `npm run build` -> pass
- `npm test -- tests/release-evidence.test.ts` -> `3/3`
- `npm test` -> `89` files / `1642` tests
- `node dist/bin/orca.js critique --dry-run --json "review current diff"` -> valid JSON
- `git diff --check -- <tracked critique tranche files>` -> pass
- New-file trailing whitespace scan for `src/critique.ts`, `src/commands/critique.ts`, and `tests/critique.test.ts` -> pass

### Closeout

| Item | Result |
| --- | --- |
| Skills | N/A. This pass used the existing `optimize` workflow and produced project-specific Orca CLI code, not a reusable cross-project skill. |
| PDCA four docs | Updated PRD, system architecture, user experience map, and platform optimization plan plus HTML companions. |
| Root guidance | N/A. No new cross-task AGENTS / CLAUDE rule. |
| Rolling ledger | Updated with critique-gate requirements, source prompt, and anti-regression guard. |
| Technical debt | Release evidence snapshot drift, full-suite hook stderr gate drift, and the missing automatic local critique reminder were fixed in scope. Existing unrelated dirty worktree remains out of scope. |
| Three-end consistency | N/A. Local CLI feature tranche only; no GitHub PR or VPS deployment requested. |

### Remaining Risks

| Risk | Owner | Follow-up |
| --- | --- | --- |
| Live model critique depends on configured provider credentials | Runtime | Use `--dry-run --json` in CI/local gates and configure provider/API key for live review |
| Automatic critique hints are local reminders, not live reviewer calls | Product / Runtime | Keep live model critique behind explicit `orca critique` or `/critique` until automatic model calls have an approval and cost policy |
| The worktree contains unrelated pre-existing changes outside this tranche | Repo hygiene | Review or split unrelated changes before preparing a focused commit |

## 2026-05-01 - Pod Helm Footer UI/UX Tranche

### Scope

Continue the broader Orca UI/UX optimization by carrying the killer-whale pod identity into the persistent shortcut footer.

### Delivered

- Reframed the footer shortcut rail as `POD HELM`.
- Changed generating hint copy to `interrupt echo`.
- Changed active and idle labels to `send brief` and `pod commands`.
- Preserved `enter`, `ctrl+j`, `/help`, `shift+tab`, permission mode, and permission source visibility.
- Made active input footer rendering width-aware so ordinary terminals keep core hints coherent.
- Used active theme semantic tokens for footer identity, keys, and labels.
- Updated focused Ink UI regression coverage.
- Synced active PDCA docs, visual plan, rolling ledger, notes, and deliverable.

### Changed Files

- `src/ui/components/Footer.tsx`
- `tests/ink-ui.test.tsx`
- `doc/00_project/initiative_orca/*` PDCA and project fact-source updates

### Verification

- `npm test -- tests/ink-ui.test.tsx` -> `79/79`
- `npm run lint` -> pass
- `npm run build` -> pass
- `npm test -- tests/release-evidence.test.ts` -> `3/3`
- `npm test` -> `88` files / `1627` tests
- `ORCA_THEME=orca node dist/bin/orca.js --version` -> `0.8.16`
- `git diff --check -- <changed tranche files>` -> pass

### Closeout

| Item | Result |
| --- | --- |
| Skills | N/A. Used existing `frontend-design`; this is project-specific Ink UI polish, not a reusable cross-project skill. |
| PDCA four docs | Updated PRD, system architecture, user experience map, and platform optimization plan plus HTML companions. |
| Root guidance | N/A. No new cross-task AGENTS / CLAUDE rule. |
| Rolling ledger | Updated `ROLLING_REQUIREMENTS_AND_PROMPTS.md` with requirements, prompt ledger, and anti-regression guard. |
| Technical debt | Full `git diff --check` remains blocked by pre-existing root `AGENTS.md` trailing whitespace from unrelated work; scoped tranche diff check passes. Release evidence snapshot remains the existing governance baseline and is not expanded in this UI-only tranche. |
| Three-end consistency | N/A. Local CLI UI/UX refresh only; no GitHub PR or VPS production deployment requested. |

### Remaining Risks

| Risk | Owner | Follow-up |
| --- | --- | --- |
| Full `git diff --check` is still blocked by pre-existing trailing whitespace in root `AGENTS.md` | Governance | Clean root guidance whitespace in a separate hygiene tranche |
| Release evidence snapshot still records the historical `1623` baseline while current full-suite evidence is `1627` | Release governance | Refresh snapshot, README badges, and guarded release evidence as a dedicated release-evidence tranche |
| This pass improves footer identity and width discipline, not a live terminal screenshot review across multiple actual terminal widths | UX | Continue with screenshot-based manual validation in a later UI smoke tranche |

## 2026-05-01 - Pod Council Runway UI/UX Tranche

### Scope

Continue the broader Orca UI/UX optimization by carrying the killer-whale pod intelligence identity into live multi-model progress for council, race, and pipeline execution.

### Delivered

- Reframed multi-model progress as `POD COUNCIL · <command>`.
- Changed model count copy from generic `models` to coordinated `voices`.
- Changed completed row status from `ok` to `surfaced`.
- Added `sonar` copy beside the active spinner.
- Replaced hard-coded multi-model progress colors with theme semantic tokens.
- Preserved `ModelProgress`, council/race/pipeline runtime behavior, spinner dependency behavior, model names, and elapsed time.
- Updated focused Ink UI regression coverage.
- Synced active PDCA docs, visual plan, rolling ledger, notes, and deliverable.

### Changed Files

- `src/ui/components/MultiModelProgress.tsx`
- `tests/ink-ui.test.tsx`
- `doc/00_project/initiative_orca/*` PDCA and project fact-source updates

### Verification

- `npm test -- tests/ink-ui.test.tsx` -> `79/79`
- `npm run lint` -> pass
- `npm run build` -> pass
- `npm test -- tests/release-evidence.test.ts` -> `3/3`
- `npm test` -> `88` files / `1627` tests
- `ORCA_THEME=orca node dist/bin/orca.js --version` -> `0.8.16`
- `git diff --check -- <changed tranche files>` -> pass

### Closeout

| Item | Result |
| --- | --- |
| Skills | N/A. Used existing `frontend-design`; this is project-specific Ink UI polish, not a reusable cross-project skill. |
| PDCA four docs | Updated PRD, system architecture, user experience map, and platform optimization plan plus HTML companions. |
| Root guidance | N/A. No new cross-task AGENTS / CLAUDE rule. |
| Rolling ledger | Updated `ROLLING_REQUIREMENTS_AND_PROMPTS.md` with requirements, prompt ledger, and anti-regression guard. |
| Technical debt | Full `git diff --check` remains blocked by pre-existing root `AGENTS.md` trailing whitespace from unrelated work; scoped tranche diff check passes. Release evidence snapshot remains the existing governance baseline and is not expanded in this UI-only tranche. |
| Three-end consistency | N/A. Local CLI UI/UX refresh only; no GitHub PR or VPS production deployment requested. |

### Remaining Risks

| Risk | Owner | Follow-up |
| --- | --- | --- |
| Full `git diff --check` is still blocked by pre-existing trailing whitespace in root `AGENTS.md` | Governance | Clean root guidance whitespace in a separate hygiene tranche |
| Release evidence snapshot still records the historical `1623` baseline while current full-suite evidence is `1627` | Release governance | Refresh snapshot, README badges, and guarded release evidence as a dedicated release-evidence tranche |
| This pass improves multi-model progress identity, not council/race/pipeline result synthesis layout | UX / Runtime | Continue with multi-model result layout after a live multi-model run capture |

## 2026-05-01 - Pod Evidence Drawer UI/UX Tranche

### Scope

Continue the broader Orca UI/UX optimization by carrying the killer-whale pod identity into detail panels used by status, permission, notes, thread, and TaskRun evidence surfaces.

### Delivered

- Reframed detail panels as `EVIDENCE DRAWER · <title>`.
- Added `pod scan` subtitle context while preserving the original subtitle metadata.
- Replaced hard-coded detail panel tone colors with theme semantic tokens.
- Preserved `DetailPanelInfo`, slash-command behavior, evidence body construction, and MarkdownText rendering.
- Updated focused Ink UI regression coverage.
- Synced active PDCA docs, visual plan, rolling ledger, notes, and deliverable.

### Changed Files

- `src/ui/components/DetailPanel.tsx`
- `tests/ink-ui.test.tsx`
- `doc/00_project/initiative_orca/*` PDCA and project fact-source updates

### Verification

- `npm test -- tests/ink-ui.test.tsx` -> `79/79`
- `npm run lint` -> pass
- `npm run build` -> pass
- `npm test -- tests/release-evidence.test.ts` -> `3/3`
- `npm test` -> `88` files / `1627` tests
- `ORCA_THEME=orca node dist/bin/orca.js --version` -> `0.8.16`
- `git diff --check -- <changed tranche files>` -> pass

### Closeout

| Item | Result |
| --- | --- |
| Skills | N/A. Used existing `frontend-design`; this is project-specific Ink UI polish, not a reusable cross-project skill. |
| PDCA four docs | Updated PRD, system architecture, user experience map, and platform optimization plan plus HTML companions. |
| Root guidance | N/A. No new cross-task AGENTS / CLAUDE rule. |
| Rolling ledger | Updated `ROLLING_REQUIREMENTS_AND_PROMPTS.md` with requirements, prompt ledger, and anti-regression guard. |
| Technical debt | Full `git diff --check` remains blocked by pre-existing root `AGENTS.md` trailing whitespace from unrelated work; scoped tranche diff check passes. Release evidence snapshot remains the existing governance baseline and is not expanded in this UI-only tranche. |
| Three-end consistency | N/A. Local CLI UI/UX refresh only; no GitHub PR or VPS production deployment requested. |

### Remaining Risks

| Risk | Owner | Follow-up |
| --- | --- | --- |
| Full `git diff --check` is still blocked by pre-existing trailing whitespace in root `AGENTS.md` | Governance | Clean root guidance whitespace in a separate hygiene tranche |
| Release evidence snapshot still records the historical `1623` baseline while current full-suite evidence is `1627` | Release governance | Refresh snapshot, README badges, and guarded release evidence as a dedicated release-evidence tranche |
| This pass improves detail-panel identity, not evidence drawer information architecture or live terminal screenshot validation | UX | Continue with evidence grouping / live screenshot validation in a later tranche |

## 2026-05-01 - Pod Trust Gate UI/UX Tranche

### Scope

Continue the broader Orca UI/UX optimization by carrying the killer-whale pod identity into permission approval and write diff review boundaries.

### Delivered

- Reframed permission prompts as `TRUST GATE · <tool>`.
- Added `SCAN` before the tool preview so the user sees impact before choosing scope.
- Retuned approval choices to explain one-time clearance, session trust, project policy persistence, and deny posture.
- Preserved existing approval semantics and keybindings for `y`, `n`, `1-4`, arrows, Enter, and Esc.
- Reframed write diff preview as `ECHO DIFF`.
- Preserved diff path, add/remove counts, line numbers, truncation, and diff content.
- Updated focused Ink UI regression coverage.
- Synced active PDCA docs, visual plan, rolling ledger, notes, and deliverable.

### Changed Files

- `src/ui/components/PermissionPrompt.tsx`
- `src/ui/components/DiffPreview.tsx`
- `tests/ink-ui.test.tsx`
- `doc/00_project/initiative_orca/*` PDCA and project fact-source updates

### Verification

- `npm test -- tests/ink-ui.test.tsx` -> `79/79`
- `npm run lint` -> pass
- `npm run build` -> pass
- `npm test -- tests/release-evidence.test.ts` -> `3/3`
- `npm test` -> `88` files / `1627` tests
- `ORCA_THEME=orca node dist/bin/orca.js --version` -> `0.8.16`
- `git diff --check -- <changed tranche files>` -> pass

### Closeout

| Item | Result |
| --- | --- |
| Skills | N/A. Used existing `frontend-design`; this is project-specific Ink UI polish, not a reusable cross-project skill. |
| PDCA four docs | Updated PRD, system architecture, user experience map, and platform optimization plan plus HTML companions. |
| Root guidance | N/A. No new cross-task AGENTS / CLAUDE rule. |
| Rolling ledger | Updated `ROLLING_REQUIREMENTS_AND_PROMPTS.md` with requirements, prompt ledger, and anti-regression guard. |
| Technical debt | Full `git diff --check` remains blocked by pre-existing root `AGENTS.md` trailing whitespace from unrelated work; scoped tranche diff check passes. Release evidence snapshot remains the existing governance baseline and is not expanded in this UI-only tranche. |
| Three-end consistency | N/A. Local CLI UI/UX refresh only; no GitHub PR or VPS production deployment requested. |

### Remaining Risks

| Risk | Owner | Follow-up |
| --- | --- | --- |
| Full `git diff --check` is still blocked by pre-existing trailing whitespace in root `AGENTS.md` | Governance | Clean root guidance whitespace in a separate hygiene tranche |
| Release evidence snapshot still records the historical `1623` baseline while current full-suite evidence is `1627` | Release governance | Refresh snapshot, README badges, and guarded release evidence as a dedicated release-evidence tranche |
| This pass improves trust-gate scanability, not policy-rule management or live terminal screenshot validation | UX / Runtime | Continue with policy-rule information architecture or live screenshot validation in a later tranche |

## 2026-05-01 - Pod Proof Wake UI/UX Tranche

### Scope

Continue the broader Orca UI/UX optimization by carrying the killer-whale pod identity into the compact post-turn summary.

### Delivered

- Reframed post-turn metrics as `PROOF WAKE`.
- Replaced internal `r/d/u` shorthand with explicit `time`, `in`, `out`, `tools`, cost, and `tok/s` labels.
- Preserved elapsed time, input tokens, output tokens, tool-call count, cost, and output throughput.
- Kept `TurnSummaryInfo`, usage accounting, provider behavior, and UI event payloads unchanged.
- Updated focused Ink UI regression coverage.
- Synced active PDCA docs, visual plan, rolling ledger, notes, and deliverable.

### Changed Files

- `src/ui/components/TurnSummary.tsx`
- `tests/ink-ui.test.tsx`
- `doc/00_project/initiative_orca/*` PDCA and project fact-source updates

### Verification

- `npm test -- tests/ink-ui.test.tsx` -> `79/79`
- `npm run lint` -> pass
- `npm run build` -> pass
- `npm test -- tests/release-evidence.test.ts` -> `3/3`
- `npm test` -> `88` files / `1627` tests
- `ORCA_THEME=orca node dist/bin/orca.js --version` -> `0.8.16`
- `git diff --check -- <changed tranche files>` -> pass

### Closeout

| Item | Result |
| --- | --- |
| Skills | N/A. Used existing `frontend-design`; this is project-specific Ink UI polish, not a reusable cross-project skill. |
| PDCA four docs | Updated PRD, system architecture, user experience map, and platform optimization plan plus HTML companions. |
| Root guidance | N/A. No new cross-task AGENTS / CLAUDE rule. |
| Rolling ledger | Updated `ROLLING_REQUIREMENTS_AND_PROMPTS.md` with requirements, prompt ledger, and anti-regression guard. |
| Technical debt | Full `git diff --check` remains blocked by pre-existing root `AGENTS.md` trailing whitespace from unrelated work; scoped tranche diff check passes. Release evidence snapshot remains the existing governance baseline and is not expanded in this UI-only tranche. |
| Three-end consistency | N/A. Local CLI UI/UX refresh only; no GitHub PR or VPS production deployment requested. |

### Remaining Risks

| Risk | Owner | Follow-up |
| --- | --- | --- |
| Full `git diff --check` is still blocked by pre-existing trailing whitespace in root `AGENTS.md` | Governance | Clean root guidance whitespace in a separate hygiene tranche |
| Release evidence snapshot still records the historical `1623` baseline while current full-suite evidence is `1627` | Release governance | Refresh snapshot, README badges, and guarded release evidence as a dedicated release-evidence tranche |
| This pass improves post-turn scanability, not transcript folding or live visual screenshot validation | UX | Continue with transcript density / folding after a live terminal screenshot pass |

## 2026-05-01 - Pod Status Rail UI/UX Tranche

### Scope

Continue the broader Orca UI/UX optimization by carrying the killer-whale pod identity into the persistent fixed status bar.

### Delivered

- Kept `ORCA POD`, model, context bar / percentage, and branch visible on the first status line.
- Added `sonar` context-load language to make context pressure read as an operational Orca signal.
- Prefixed live stats with `signal:` while preserving cost, throughput, turns, session id, policy summaries, output style, and sparkline.
- Changed permission posture copy to `trust:` and retuned the shortcut hint to `shift+tab cycles trust`.
- Updated focused Ink UI regression coverage.
- Synced active PDCA docs, visual plan, rolling ledger, notes, and deliverable.

### Changed Files

- `src/ui/components/StatusBar.tsx`
- `tests/ink-ui.test.tsx`
- `doc/00_project/initiative_orca/*` PDCA and project fact-source updates

### Verification

- `npm test -- tests/ink-ui.test.tsx` -> `79/79`
- `npm run lint` -> pass
- `npm run build` -> pass
- `npm test -- tests/release-evidence.test.ts` -> `3/3`
- `npm test` -> `88` files / `1627` tests
- `ORCA_THEME=orca node dist/bin/orca.js --version` -> `0.8.16`
- `git diff --check -- <changed tranche files>` -> pass

### Closeout

| Item | Result |
| --- | --- |
| Skills | N/A. Used existing `frontend-design`; this is project-specific Ink UI polish, not a reusable cross-project skill. |
| PDCA four docs | Updated PRD, system architecture, user experience map, and platform optimization plan plus HTML companions. |
| Root guidance | N/A. No new cross-task AGENTS / CLAUDE rule. |
| Rolling ledger | Updated `ROLLING_REQUIREMENTS_AND_PROMPTS.md` with requirements, prompt ledger, and anti-regression guard. |
| Technical debt | Full `git diff --check` remains blocked by pre-existing root `AGENTS.md` trailing whitespace from unrelated work; scoped tranche diff check passes. Release evidence snapshot remains the existing governance baseline and is not expanded in this UI-only tranche. |
| Three-end consistency | N/A. Local CLI UI/UX refresh only; no GitHub PR or VPS production deployment requested. |

### Remaining Risks

| Risk | Owner | Follow-up |
| --- | --- | --- |
| Full `git diff --check` is still blocked by pre-existing trailing whitespace in root `AGENTS.md` | Governance | Clean root guidance whitespace in a separate hygiene tranche |
| Release evidence snapshot still records the historical `1623` baseline while current full-suite evidence is `1627` | Release governance | Refresh snapshot, README badges, and guarded release evidence as a dedicated release-evidence tranche |
| This pass improves persistent status readability, not transcript folding or live visual screenshot validation | UX | Continue with transcript density / folding after a live terminal screenshot pass |

## 2026-05-01 - Pod Transcript Flow UI/UX Tranche

### Scope

Continue the broader Orca UI/UX optimization by carrying the killer-whale pod identity into the live transcript: user prompts, assistant panels, tool rails, and thinking state.

### Delivered

- Reframed submitted prompt transcript blocks from `You` to `POD BRIEF`.
- Reframed assistant response panels from `ORCA` to `ORCA POD`.
- Changed streaming assistant state copy to `echoing`.
- Added `ECHO TOOL` identity to active and completed tool-call rails.
- Replaced broad generic thinking verbs with compact Orca / pod / proof-oriented status copy.
- Updated focused Ink UI regression coverage.
- Synced active PDCA docs, visual plan, rolling ledger, notes, and deliverable.

### Changed Files

- `src/ui/components/App.tsx`
- `src/ui/components/ToolCallBlock.tsx`
- `src/ui/components/ThinkingSpinner.tsx`
- `tests/ink-ui.test.tsx`
- `doc/00_project/initiative_orca/*` PDCA and project fact-source updates

### Verification

- `npm test -- tests/ink-ui.test.tsx` -> `78/78`
- `npm run lint` -> pass
- `npm run build` -> pass
- `npm test -- tests/release-evidence.test.ts` -> `3/3`
- `npm test` -> `88` files / `1626` tests
- `ORCA_THEME=orca node dist/bin/orca.js --version` -> `0.8.16`
- `git diff --check -- <changed tranche files>` -> pass

### Closeout

| Item | Result |
| --- | --- |
| Skills | N/A. Used existing `frontend-design`; this is project-specific Ink UI polish, not a reusable cross-project skill. |
| PDCA four docs | Updated PRD, system architecture, user experience map, and platform optimization plan plus HTML companions. |
| Root guidance | N/A. No new cross-task AGENTS / CLAUDE rule. |
| Rolling ledger | Updated `ROLLING_REQUIREMENTS_AND_PROMPTS.md` with requirements, prompt ledger, and anti-regression guards. |
| Technical debt | Full `git diff --check` remains blocked by pre-existing root `AGENTS.md` trailing whitespace from unrelated work; scoped tranche diff check passes. |
| Three-end consistency | N/A. Local CLI UI/UX refresh only; no GitHub PR or VPS production deployment requested. |

### Remaining Risks

| Risk | Owner | Follow-up |
| --- | --- | --- |
| Full `git diff --check` is still blocked by pre-existing trailing whitespace in root `AGENTS.md` | Governance | Clean root guidance whitespace in a separate hygiene tranche |
| This pass improves transcript identity, not density, folding, or visual screenshot validation | UX | Continue with transcript density / folding after a live terminal screenshot pass |

## 2026-05-01 - Pod Command Surface UI/UX Tranche

### Scope

Continue the broader Orca UI/UX optimization by carrying the killer-whale pod identity into input, command discovery, option selection, and shared picker framing.

### Delivered

- Made `PickerFrame.tsx` theme-aware so picker chrome uses Orca semantic colors.
- Reframed slash-command discovery as `POD COMMANDS` with `echo filter` and no-match feedback.
- Kept the command picker visible when filters have zero matches and preserved `Esc` cancellation.
- Updated `OptionPicker.tsx` to use Orca theme tokens for selection, labels, descriptions, and scroll affordances.
- Retuned `InputArea.tsx` empty and multiline copy to pod briefing language.
- Added focused Ink UI regression coverage.
- Synced active PDCA docs, visual plan, rolling ledger, notes, and deliverable.

### Changed Files

- `src/ui/components/PickerFrame.tsx`
- `src/ui/components/CommandPicker.tsx`
- `src/ui/components/OptionPicker.tsx`
- `src/ui/components/InputArea.tsx`
- `tests/ink-ui.test.tsx`
- `doc/00_project/initiative_orca/*` PDCA and project fact-source updates

### Verification

- `npm test -- tests/ink-ui.test.tsx` -> `78/78`
- `npm run lint` -> pass
- `npm run build` -> pass
- `npm test -- tests/release-evidence.test.ts` -> `3/3`
- `npm test` -> `88` files / `1626` tests
- `ORCA_THEME=orca node dist/bin/orca.js --version` -> `0.8.16`
- `git diff --check -- <changed tranche files>` -> pass

### Closeout

| Item | Result |
| --- | --- |
| Skills | N/A. Used existing `frontend-design`; this is project-specific Ink UI polish, not a reusable cross-project skill. |
| PDCA four docs | Updated PRD, system architecture, user experience map, and platform optimization plan plus HTML companions. |
| Root guidance | N/A. No new cross-task AGENTS / CLAUDE rule. |
| Rolling ledger | Updated `ROLLING_REQUIREMENTS_AND_PROMPTS.md` with requirements, prompt ledger, and anti-regression guards. |
| Technical debt | Full `git diff --check` still reports pre-existing root `AGENTS.md` trailing whitespace; this is outside the UI/UX tranche and recorded below. |
| Three-end consistency | N/A. Local CLI UI/UX refresh only; no GitHub PR or VPS production deployment requested. |

### Remaining Risks

| Risk | Owner | Follow-up |
| --- | --- | --- |
| Full `git diff --check` is still blocked by pre-existing trailing whitespace in root `AGENTS.md` | Governance | Clean that root guidance file in a separate hygiene tranche; it is outside this UI/UX change set |
| This pass improves picker/input identity; deeper transcript density, animation, and live screenshot polish remain separate | UX | Continue with a later tranche over transcript readability, density, and live visual inspection |

## 2026-05-01 - Cute Orca Mascot UI/UX Tranche

Superseded on 2026-05-02 for startup Banner art: the separate mascot/icon block was removed. The HomePanel pod-brief work remains active.

### Scope

Start the broader Orca UI/UX optimization by upgrading the terminal first frame: learn Hermes Agent's logo structure while implementing a friendlier pod-brief entry UX. The mascot part was later removed from startup.

### Delivered

- Replaced the abstract banner mark at the time; this separate startup mascot/icon was later removed from `src/ui/components/Banner.tsx`.
- Preserved the Hermes-inspired identity structure that remains active: large wordmark and status-rich panel.
- Updated HomePanel primary entry from `MISSION` to `POD BRIEF`.
- Retuned first-screen copy toward friendly pod briefing while preserving trust, model, session, recovery, and guardrails.
- Updated focused Ink UI regressions for the clean startup deck and new first-screen copy.
- Synced active PDCA docs and rolling ledger.

### Changed Files

- `src/ui/components/Banner.tsx`
- `src/ui/components/HomePanel.tsx`
- `tests/ink-ui.test.tsx`
- `doc/00_project/initiative_orca/*` PDCA and project fact-source updates

### Verification

- `npm test -- tests/ink-ui.test.tsx` -> `77/77`
- `npm run lint` -> pass
- `npm run build` -> pass
- `npm test -- tests/release-evidence.test.ts` -> `3/3`
- `npm test` -> `88` files / `1625` tests
- `ORCA_THEME=orca node dist/bin/orca.js --version` -> `0.8.16`

### Remaining Risks

| Risk | Owner | Follow-up |
| --- | --- | --- |
| This pass optimizes the terminal first frame only; deeper transcript/picker motion and density work remains separate | UX | Continue with a later tranche over transcript, pickers, and command flow after reviewing live screenshots |

## 2026-05-01 - Orca Killer-Whale Positioning Correction

### Scope

Correct the visual-system language so Orca is positioned as a killer whale / tiger whale identity rather than a generic deep-sea console.

### Delivered

- Renamed the active identity language from `Abyssal Signal` to `Blackfin Signal`.
- Updated startup motif language to blackfin / pod / dorsal-fin / echolocation cues.
- Updated Banner, HomePanel, ThemePicker, StatusBar copy and focused Ink UI expectations.
- Synced PRD, architecture, UX map, optimization plan, task plan, notes, and rolling ledger.
- Clarified the final motif hierarchy: killer whale primary, ocean field, pod intelligence product metaphor.

### Verification

- `npm test -- tests/ink-ui.test.tsx tests/release-evidence.test.ts` -> `80/80`.
- `rg` drift scan for stale active `Abyssal` / generic deep-sea wording -> only historical correction notes remain.
- `npm run lint` -> pass.
- `npm run build` -> pass.
- `npm test` -> `88` files / `1625` tests.

## 2026-04-30 - Orca Visual System PDCA Tranche

### Scope

Optimize the local Orca CLI Ink experience by studying Hermes Agent's high-recognition terminal startup patterns, then shipping a distinct Orca visual system across typography, palette, UI hierarchy, and operator UX.

### Delivered

- Created the canonical visual system plan and Chinese HTML companion: `ORCA_VISUAL_SYSTEM_PLAN.md` and `ORCA_VISUAL_SYSTEM_PLAN.html`.
- Added `Blackfin Signal` as Orca's semantic default dark theme without adding dependencies.
- Replaced the startup banner impression with an `ORCA` block wordmark, dorsal-fin / pod-signal motif, uppercase state rows, and compact fallback behavior.
- Reframed HomePanel as a mission-control surface: `MISSION`, `POD SIGNAL`, `RECOVER`, and `GUARDRAILS`.
- Updated ThemePicker and StatusBar copy so the default identity is visible and consistent.

### Changed Files

- `src/ui/theme.tsx`
- `src/ui/components/Banner.tsx`
- `src/ui/components/HomePanel.tsx`
- `src/ui/components/ThemePicker.tsx`
- `src/ui/components/StatusBar.tsx`
- `tests/ink-ui.test.tsx`
- `doc/00_project/initiative_orca/ORCA_VISUAL_SYSTEM_PLAN.md`
- `doc/00_project/initiative_orca/ORCA_VISUAL_SYSTEM_PLAN.html`
- `doc/00_project/initiative_orca/*` PDCA and project fact-source updates

### Verification

- `npm test -- tests/ink-ui.test.tsx` -> `77/77`
- `npm run lint` -> pass
- `npm run build` -> pass
- `ORCA_THEME=orca node dist/bin/orca.js --version` -> `0.8.16`
- `npm test -- tests/release-evidence.test.ts` -> `3/3`
- `npm test` -> `88` files / `1625` tests

### Closeout

| Item | Result |
| --- | --- |
| Skills | N/A. Used existing `frontend-design`; no reusable cross-project skill justified. |
| PDCA four docs | Updated PRD, system architecture, user experience map, and platform optimization plan. |
| Root guidance | N/A. No new cross-task AGENTS / CLAUDE rule. |
| Rolling ledger | Updated `ROLLING_REQUIREMENTS_AND_PROMPTS.md` with requirement status and anti-regression guard. |
| Technical debt | `ai check` hung without output in the local AI-Fleet checker; recorded as residual gate risk, outside the Ink UI code boundary. |
| Three-end consistency | N/A. Local CLI visual refresh only; no GitHub / VPS production deployment requested. |

### Remaining Risks

| Risk | Owner | Follow-up |
| --- | --- | --- |
| `ai check` did not complete; it hung in the local AI-Fleet checker and was interrupted | Tooling | Inspect `runtime/control_plane/check_cli.py` / `tests/test_all.py` separately before treating `ai check` as a release gate |
| The visual system is terminal-native; exact perceived font quality depends on the operator's terminal font | UX | Recommend Berkeley Mono, Commit Mono, JetBrains Mono, or SF Mono in the plan rather than bundling a font dependency |

## 2026-04-29 - TaskRun Scheduler/Resume PDCA Tranche

### Scope

Close ORCA-SWARM-020 by turning queue leases into actionable recovery plans for TaskRuns that already carry safe resume metadata.

### Delivered

- Added explicit TaskRun lease-state classification (`none`, `active`, `expired`).
- Added `orca queue resume <task-run-id>` to claim a resume lease and print the concrete recovery command when available.
- Added `orca queue schedule` to pick the next unleased resumable or monitorable TaskRun.
- Chat WorkSessions with saved-session ids now produce `orca chat --cwd ... --continue <saved-session-id>` commands.
- Running background jobs produce `orca queue follow <task-run-id>` monitor commands; unsupported replay exits without claiming a lease.
- Version bumped to `0.8.16`.

### Changed Files

- `src/work-session-store.ts`
- `src/commands/queue.ts`
- `tests/work-session-store.test.ts`
- `tests/queue-command.test.ts`
- `README.md`
- `package.json`
- `package-lock.json`
- `doc/00_project/initiative_orca/*`

### Verification

- `npm test -- tests/work-session-store.test.ts tests/queue-command.test.ts` -> `17/17`
- `npm run lint` -> pass
- `npm test -- tests/release-evidence.test.ts` -> `3/3`
- `npm run build` -> pass
- `npm test` -> `88` files / `1623` tests
- `node dist/bin/orca.js --version` -> `0.8.16`

### Remaining Risks

| Risk | Owner | Follow-up |
| --- | --- | --- |
| Non-chat `run` TaskRuns still do not persist replay-safe argv/prompt metadata | Runtime | Add replay metadata before claiming arbitrary run resume |
| Approval timeline still stores decisions, not full per-file review bundles | UX/runtime | Extend structured evidence bundles in the next evidence tranche |

## 2026-04-29 - TaskRun Approval Timeline PDCA Tranche

### Scope

Close ORCA-SWARM-018 by making review-before-apply decisions durable and visible through the same TaskRun evidence surfaces used by CLI and Ink.

### Delivered

- Added `TaskRun.approvals` with timestamped policy decision events.
- Recorded prompted, preapproved, policy-blocked, and hook-blocked approval outcomes in `policy-executor`.
- Routed chat proxy approval events into the current REPL `TaskRun`.
- Rendered an `Approval Timeline` above file evidence in `orca queue evidence` and the shared Ink `/evidence` detail panel.
- Version bumped to `0.8.15`.

### Changed Files

- `src/work-session-store.ts`
- `src/policy-executor.ts`
- `src/commands/chat-proxy-tool-call.ts`
- `src/commands/chat-repl-turn.ts`
- `src/commands/chat.ts`
- `src/commands/queue.ts`
- `tests/work-session-store.test.ts`
- `tests/chat-proxy-tool-call.test.ts`
- `tests/queue-command.test.ts`
- `README.md`
- `package.json`
- `package-lock.json`
- `doc/00_project/initiative_orca/*`

### Verification

- `npm test -- tests/work-session-store.test.ts tests/queue-command.test.ts tests/chat-proxy-tool-call.test.ts` -> `40/40`
- `npm run lint` -> pass
- `npm run build` -> pass
- `npm test` -> `88` files / `1620` tests
- `node dist/bin/orca.js --version` -> `0.8.15`

### Remaining Risks

| Risk | Owner | Follow-up |
| --- | --- | --- |
| Approval timeline stores policy decisions, not a full per-file review bundle with before/after diffs | UX/runtime | Extend structured evidence bundles when scheduler/resume work starts |
| Queue leases needed actionable resume/schedule semantics | Runtime | Resolved by ORCA-SWARM-020 for chat saved-session recovery; non-chat replay remains a separate metadata task |

## 2026-04-29 - Ink Transcript Readability PDCA Tranche

### Scope

Close the screenshot-driven UX gap where submitted prompts disappeared into the input flow and assistant markdown rendered like raw transcript text.

### Delivered

- Added `ChatSessionEmitter.emitUserMessage()` and a `user_message` UI event so submitted prompts can remain visible after Enter.
- Rendered submitted prompts as highlighted `You` transcript blocks inside the Ink scrollback.
- Rendered assistant output in structured `ORCA` response panels during streaming and after turn completion.
- Replaced the raw `###` / `**`-first markdown view with a lightweight terminal markdown renderer for headings, bullets, inline code/emphasis, links, quotes, and highlighted code blocks.
- Version bumped to `0.8.14`.

### Changed Files

- `src/ui/session.ts`
- `src/ui/types.ts`
- `src/ui/components/App.tsx`
- `src/ui/components/MarkdownText.tsx`
- `tests/ink-ui.test.tsx`
- `tests/chat-session-emitter.test.ts`
- `README.md`
- `package.json`
- `package-lock.json`
- `doc/00_project/initiative_orca/*`

### Verification

- `npm test -- tests/ink-ui.test.tsx tests/chat-session-emitter.test.ts` -> `84/84`
- `npm test -- tests/release-evidence.test.ts tests/ink-ui.test.tsx tests/chat-session-emitter.test.ts` -> `87/87`
- `npm run lint && npm run build && npm test` -> `88` files / `1619` tests
- `node dist/bin/orca.js --version` -> `0.8.14`

### Remaining Risks

| Risk | Owner | Follow-up |
| --- | --- | --- |
| The markdown renderer is intentionally lightweight and does not attempt full CommonMark table/layout semantics | UX | Add specific renderers when a real transcript case proves the need |
| Review-before-apply still lacks an approval timeline over TaskRun evidence | UX | ORCA-SWARM-018 |

## 2026-04-29 - Ink TaskRun Evidence Panel PDCA Tranche

### Scope

Close ORCA-SWARM-017 by making TaskRun evidence inspectable inside the Ink REPL through `/evidence <task-run-id>`, while reusing the existing queue evidence drawer contract.

### Delivered

- Exported a shared TaskRun evidence drawer model from `src/commands/queue.ts`.
- Kept `orca queue evidence <task-run-id>` and Ink `/evidence <task-run-id>` on the same markdown rendering path.
- Added the `/evidence` slash command to the shared slash-command registry.
- Routed `/evidence` into an Ink `DetailPanel` with status-aware tone and bounded evidence previews.
- Added focused coverage for queue drawer markdown and chat detail-panel emission.
- Version bumped to `0.8.13`.

### Changed Files

- `src/commands/queue.ts`
- `src/commands/chat-slash-readonly.ts`
- `src/slash-commands.ts`
- `tests/queue-command.test.ts`
- `tests/chat-slash-readonly.test.ts`
- `README.md`
- `package.json`
- `package-lock.json`
- `doc/00_project/initiative_orca/*`

### Verification

- `npm run build && npm test -- tests/queue-command.test.ts tests/chat-slash-readonly.test.ts tests/slash-commands.test.ts tests/ink-ui.test.tsx` -> `108/108`
- `npm test -- tests/release-evidence.test.ts tests/queue-command.test.ts tests/chat-slash-readonly.test.ts tests/slash-commands.test.ts tests/ink-ui.test.tsx` -> `111/111`
- `npm run lint && npm run build && npm test` -> `88` files / `1615` tests
- `node dist/bin/orca.js --version` -> `0.8.13`

### Remaining Risks

| Risk | Owner | Follow-up |
| --- | --- | --- |
| Review-before-apply still lacks an approval timeline over TaskRun evidence | UX | ORCA-SWARM-018 |
| Queue leases are inspectable but not yet a real scheduler / resume mechanism | Runtime | Extend TaskRun lease semantics into scheduler and resume workflows |

## 2026-04-29 - Chat REPL TaskRun Records PDCA Tranche

### Scope

Close ORCA-SWARM-016 by making interactive `orca chat` REPL turns write canonical `WorkSession` / `TaskRun` records that the queue spine can inspect.

### Delivered

- Added `chat` as a first-class `TaskRunKind`.
- Created a durable chat `WorkSession` at REPL startup and kept provider/model/mode metadata current across model changes and exit cleanup.
- Wrapped each normal REPL prompt in a `TaskRun` with prompt-derived title, status, token usage, cost, duration, and runtime observation evidence.
- Made `executeReplTurn()` return structured completion metadata for completed, failed, and aborted turns without changing its existing prompt/tool behavior.
- Added focused coverage for successful proxy/SDK turns, hook-blocked prompts, 413 retry recovery, reset-sensitive aborts, unrecovered failures, and persisted chat TaskRun summaries.
- Version bumped to `0.8.12`.

### Changed Files

- `src/commands/chat.ts`
- `src/commands/chat-repl-turn.ts`
- `src/work-session-store.ts`
- `tests/chat-repl-turn.test.ts`
- `tests/work-session-store.test.ts`
- `README.md`
- `package.json`
- `package-lock.json`
- `doc/00_project/initiative_orca/*`

### Verification

- `npm run build` -> pass
- `npm run lint` -> pass
- `npm test -- tests/chat-repl-turn.test.ts tests/work-session-store.test.ts` -> `19/19`
- `npm run lint && npm run build && npm test` -> `88` files / `1613` tests
- `node dist/bin/orca.js --version` -> `0.8.12`

### Remaining Risks

| Risk | Owner | Follow-up |
| --- | --- | --- |
| Ink detail panels still do not show the full TaskRun evidence timeline | UX | Continue with evidence side panel / approval timeline |
| Queue leases are inspectable but not yet a real scheduler / resume mechanism | Runtime | Extend TaskRun lease semantics into scheduler and resume workflows |

## 2026-04-29 - Chat Operator Control Plane PDCA Tranche

### Scope

Close ORCA-SWARM-015 by making chat REPL and Ink operator controls for sessions, permissions, models, command output, and detail panels clean-index testable.

### Delivered

- Added runtime identity prompt insertion and workflow preset policy application for one-shot and REPL chat startup.
- Expanded slash command helpers for model selection, permissions, sessions, threads, knowledge, and recovery flows.
- Added command-output sanitization / markdown formatting helpers so command output can route safely into Ink sessions.
- Added Ink home, option picker, detail panel, and permission-scope UI plumbing.
- Expanded serve/session/model/MCP coverage needed by the same operator-control baseline.
- Version bumped to `0.8.11`.

### Changed Files

- `src/commands/chat*.ts`
- `src/commands/serve.ts`
- `src/commands/session.ts`
- `src/mcp-client.ts`
- `src/model-catalog.ts`
- `src/session-store.ts`
- `src/ui/*`
- `tests/chat-*.test.ts`
- `tests/ink-ui.test.tsx`
- `tests/command-output.test.ts`
- `tests/session-command.test.ts`
- `tests/serve-command.test.ts`
- `README.md`
- `package.json`
- `package-lock.json`
- `doc/00_project/initiative_orca/*`

### Verification

- Clean staged-index `npm run build` -> pass
- Clean staged-index `npm test -- tests/chat-internals.test.ts tests/chat-slash-mutations.test.ts tests/chat-slash-readonly.test.ts tests/chat-repl-turn.test.ts tests/chat-one-shot-mcp-cleanup.test.ts tests/ink-ui.test.tsx tests/command-output.test.ts tests/session-command.test.ts tests/serve-command.test.ts tests/model-catalog.test.ts tests/mcp-client.test.ts tests/mode-system-prompt.test.ts` -> `248/248`
- Clean staged-index command pack plus release-evidence guard -> `251/251`
- Full active-worktree `npm run lint && npm run build && npm test` -> `88` files / `1611` tests
- `node dist/bin/orca.js --version` -> `0.8.11`

### Remaining Risks

| Risk | Owner | Follow-up |
| --- | --- | --- |
| Chat REPL still does not write canonical WorkSession / TaskRun records | Runtime | Next tranche should bind REPL turns into the queue spine |
| Ink detail panels are generic operator panels, not yet the full TaskRun evidence timeline | UX | Continue with TaskRun evidence side panel / approval timeline |

## 2026-04-29 - Clean-Index Command Baseline PDCA Tranche

### Scope

Close ORCA-SWARM-014 by making the command surface already declared in `program.ts` build from a clean staged checkout, while preserving the staged config/provider helpers required by the expanded config regression suite.

### Delivered

- Added a small workflow-command module for `review`, `debug`, and `architect` without dragging the larger dirty chat/UI baseline into this tranche.
- Added the real `permissions` command surface and config-backed permission mode / allowlist storage helpers.
- Added the real `evolve` command surface backed by the committed evolution store.
- Added the git repository root helper required by policy execution and config rule normalization.
- Promoted workflow preset metadata into the mode registry so root help, command contracts, and mode policies share one source.
- Preserved the config provider-gateway baseline for Cloudflare / Claudeflare routing that is now covered in `tests/config.test.ts`.
- Version bumped to `0.8.10`.

### Changed Files

- `src/program.ts`
- `src/commands/workflows.ts`
- `src/commands/permissions.ts`
- `src/commands/evolve.ts`
- `src/config.ts`
- `src/git-repository.ts`
- `tests/config.test.ts`
- `tests/permissions-command.test.ts`
- `README.md`
- `package.json`
- `package-lock.json`
- `doc/00_project/initiative_orca/*`

### Verification

- Clean staged-index `npm run build` -> pass
- Clean staged-index `npm test -- tests/config.test.ts tests/permissions-command.test.ts tests/program.test.ts tests/command-contracts.test.ts tests/release-evidence.test.ts tests/v030-harness.test.ts` -> `100/100`
- Full active-worktree `npm run lint && npm run build && npm test` -> `88` files / `1611` tests
- `node dist/bin/orca.js --version` -> `0.8.10`

### Remaining Risks

| Risk | Owner | Follow-up |
| --- | --- | --- |
| Chat REPL TaskRun production is still outside this clean-index tranche | Runtime | Continue with a dedicated chat lifecycle tranche |
| The broader dirty Ink/UI baseline remains unstaged | UX | Split HomePanel/evidence timeline work after command baseline is committed |

## 2026-04-29 - Run Execution Contract PDCA Tranche

### Scope

Advance ORCA-SWARM-013 by making `orca run` default, goal-loop, mission, and plan paths write the same WorkSession / TaskRun record family already used by queue and `serve /chat`.

### Delivered

- `orca run` creates a `WorkSession` and active `TaskRun` before execution starts.
- Default run, goal-loop, mission, and plan paths finish the TaskRun with status, summary, usage, and relevant evidence.
- Run usage records now carry the WorkSession id as the usage session reference.
- Runtime observations record WorkSession / TaskRun ids for the run surface.
- Regression tests cover default run, mission mode, and plan mode TaskRun records.
- Version bumped to `0.8.9`.

### Changed Files

- `src/commands/run.ts`
- `src/evolution/observer.ts`
- `src/evolution/store.ts`
- `src/knowledge/learning.ts`
- `src/usage-db.ts`
- `tests/run-work-session.test.ts`
- `tests/evolution-store.test.ts`
- `tests/v030-coverage.test.ts`
- `README.md`
- `package.json`
- `package-lock.json`
- `doc/00_project/initiative_orca/*`

### Verification

- `npm test -- tests/run-work-session.test.ts tests/work-session-store.test.ts tests/queue-command.test.ts` -> `14/14`
- Clean staged-index `npm test -- tests/run-work-session.test.ts tests/evolution-store.test.ts tests/work-session-store.test.ts tests/queue-command.test.ts tests/release-evidence.test.ts tests/v030-coverage.test.ts` -> `40/40`
- `npm run build` -> pass
- `npm run lint && npm run build && npm test` -> `88` files / `1611` tests
- `npm test -- tests/release-evidence.test.ts` -> `3/3`
- `node dist/bin/orca.js --version` -> `0.8.9`

### Remaining Risks

| Risk | Owner | Follow-up |
| --- | --- | --- |
| Chat REPL still has its own long-running turn lifecycle before it becomes a first-class TaskRun producer | Runtime | Split a dedicated chat TaskRun tranche after the current dirty chat baseline is isolated |
| Mission/plan tests use mocks for controller/planner internals | Verification | Add integration coverage after mission/planner runtime dependencies are made deterministic |
| Clean staged-index full build still exposes pre-existing dirty baseline imports for preset commands, permissions/evolve, and git repository helpers | Baseline owners | Split the existing chat/modes/permissions/evolve baseline before claiming clean-index full-suite parity |

## 2026-04-29 - CI Gate Integrity PDCA Tranche

### Scope

Complete ORCA-SWARM-012 by making CI enforce the matrix, security, performance, and fast agent-eval gates that the docs and package scripts advertise.

### Delivered

- Replaced the stale CI benchmark job with a `gate-integrity` job.
- Added matrix entrypoints for static, unit, contract, integration, e2e, security, performance, resilience, and fast agent-eval layers.
- Added `agent-eval/manifests/test-matrix.json` plus runner/sync scripts and a generated entrypoint snippet.
- Added fast-gate serve continuity coverage to fast/nightly/release manifests.
- Stabilized the hook system-message regression by injecting a local writer in the test instead of spying on global stderr during parallel full-suite runs.
- Version bumped to `0.8.8`.

### Changed Files

- `.github/workflows/ci.yml`
- `package.json`
- `package-lock.json`
- `agent-eval/manifests/*`
- `agent-eval/scripts/run-test-matrix.py`
- `agent-eval/scripts/sync-test-matrix.py`
- `agent-eval/scripts/run-secret-scan.py`
- `agent-eval/scripts/collect-license-inventory.py`
- `agent-eval/generated/test-matrix-entrypoints.md`
- `tests/test-matrix-runner.test.ts`
- `tests/test-matrix-sync.test.ts`
- `tests/agent-eval-manifests.test.ts`
- `src/policy-executor.ts`
- `tests/v050-modules.test.ts`
- `doc/00_project/initiative_orca/*`

### Simplifications Made

- Reused the existing `agent-eval` manifest model instead of adding a second CI policy format.
- Kept full nightly/release eval runs out of PR CI; the CI job enforces fast eval plus static/security/performance rows.
- Removed a parallel-test global stderr spy from the hook system-message regression.

### Verification

- `npm run test:matrix:sync` -> pass
- Clean staged-index `npm run test:matrix:sync` -> pass
- Clean staged-index `npm test -- tests/agent-eval-manifests.test.ts tests/test-matrix-runner.test.ts tests/test-matrix-sync.test.ts tests/release-evidence.test.ts` -> `22/22`
- `npm run test:unit` -> `outputs/test-matrix/run-20260429-061427/matrix.md`
- `npm test -- tests/v050-modules.test.ts tests/agent-eval-manifests.test.ts tests/test-matrix-runner.test.ts tests/test-matrix-sync.test.ts tests/release-evidence.test.ts` -> `69/69`
- `npm run test:static` -> `outputs/test-matrix/run-20260429-060205/matrix.md`
- `npm run test:security` -> `outputs/test-matrix/run-20260429-060222/matrix.md`
- `npm run test:performance` -> `outputs/test-matrix/run-20260429-060232/matrix.md`
- `npm run test:ai-eval-fast` -> `outputs/test-matrix/run-20260429-060243/matrix.md`
- `npm run lint && npm run build && npm test` -> `88` files / `1609` tests

### Remaining Risks

| Risk | Owner | Follow-up |
| --- | --- | --- |
| Static/security/performance rows are still lightweight gates rather than full SAST/DAST/perf-budget programs | Verification | Expand the manifest layers after CI enforcement is stable |
| CI runtime may be longer because the gate job runs after the Node matrix | Maintainer | Split into scheduled/release-only rows if GitHub timing becomes noisy |

## 2026-04-29 - Release Evidence Snapshot PDCA Tranche

### Scope

Complete ORCA-SWARM-011 by making README and active PDCA verification counts derive from a checked release evidence snapshot instead of loose manual copies.

### Delivered

- Added `doc/00_project/initiative_orca/verification_snapshot.json` as the active release evidence source.
- Added `tests/release-evidence.test.ts` to guard package version, README release strings, active worktree test-file evidence, and active PDCA docs.
- Updated README and active PDCA docs to `0.8.7`, `88` test files, and `1609` tests.
- Version bumped to `0.8.7`.

### Changed Files

- `README.md`
- `package.json`
- `package-lock.json`
- `tests/release-evidence.test.ts`
- `doc/00_project/initiative_orca/verification_snapshot.json`
- `doc/00_project/initiative_orca/*`

### Simplifications Made

- Kept historical notes as historical evidence; guarded only the current README and active PDCA reporting surfaces.
- Used a small JSON snapshot and Vitest guard instead of introducing a new docs generation pipeline.

### Verification

- `npm test -- tests/release-evidence.test.ts` -> `3/3`
- `npm run lint` -> pass
- `npm run build` -> pass
- `npm test` -> `88` files / `1609` tests passed
- Clean staged-index `npm test -- tests/release-evidence.test.ts` -> `3/3`
- `node dist/bin/orca.js --version` -> `0.8.7`

### Remaining Risks

| Risk | Owner | Follow-up |
| --- | --- | --- |
| Historical archive docs still contain older release counts by design | Docs | Treat dated sections as immutable evidence unless an active-current section cites them as current |
| Clean staged-index full-suite still exposes pre-existing uncommitted baseline dependencies outside this tranche | Baseline owners | Split/commit the existing permissions/evolution/test-matrix baseline before claiming clean-index full-suite parity |
| CI gate runtime may need tuning as matrix scope grows | Verification | Keep ORCA-SWARM-012 gate job focused on high-signal rows |

## 2026-04-29 - Slash Command Registry PDCA Tranche

### Scope

Advance ORCA-SWARM-010 by making slash-command discovery use one registry across REPL completion, Ink command picker, and `/help`, while leaving HomePanel wiring to the existing unstaged UI baseline.

### Delivered

- Added `src/slash-commands.ts` as the shared slash-command registry.
- REPL tab completion now reads command names from the registry.
- Ink command picker now reads picker-visible commands from the registry.
- `/help` now renders from the same registry sections instead of a separate hard-coded list.
- Registry entries expose `homeDescription` for the pending HomePanel consumer.
- Version bumped to `0.8.6`.

### Changed Files

- `src/slash-commands.ts`
- `src/commands/chat.ts`
- `src/commands/chat-slash-readonly.ts`
- `src/ui/components/App.tsx`
- `tests/slash-commands.test.ts`
- `README.md`
- `package.json`
- `package-lock.json`
- `doc/00_project/initiative_orca/*`

### Simplifications Made

- Kept slash-command execution switches unchanged; this tranche centralizes discovery metadata only.
- Reused the existing picker and help renderers instead of adding a second command-surface abstraction.

### Verification

- `npm test -- tests/slash-commands.test.ts tests/chat-slash-readonly.test.ts tests/ink-ui.test.tsx` -> `98/98`
- `npm run lint` -> pass
- `npm run build` -> pass
- `npm test` -> `87` files / `1606` tests passed
- `node dist/bin/orca.js --version` -> `0.8.6`
- Clean staged-index `npm test -- tests/slash-commands.test.ts tests/chat-slash-readonly.test.ts tests/ink-ui.test.tsx` -> `98/98`
- `git diff --cached --check` -> pass

### Remaining Risks

| Risk | Owner | Follow-up |
| --- | --- | --- |
| Slash-command execution still lives in read-only/mutating switches | Runtime/UX | Move handlers behind registry metadata only after the execution contract is unified |
| HomePanel is currently part of an unstaged UI baseline | UX/runtime | Split or commit the UI baseline before staging HomePanel registry consumption |

## 2026-04-29 - Queue Evidence Drawer PDCA Tranche

### Scope

Complete ORCA-SWARM-009 as a queue-first evidence drawer so operators can inspect TaskRun logs, diffs, data, reports, missing artifacts, and capped previews without opening raw files.

### Delivered

- `orca queue evidence <task-run-id>`
- `--lines <n>` for preview tail size
- `--max-bytes <n>` for bounded per-file preview output
- Evidence classification for `log`, `diff`, `data`, `report`, and generic `artifact`
- Resolved absolute paths, size, update time, missing-file state, and readable tail preview per evidence item
- Version bumped to `0.8.5`

### Changed Files

- `src/commands/queue.ts`
- `tests/queue-command.test.ts`
- `README.md`
- `package.json`
- `package-lock.json`
- `doc/00_project/initiative_orca/*`

### Simplifications Made

- Reused the existing TaskRun evidence array and background-log attachment path.
- Kept the drawer terminal-native instead of mixing in the current uncommitted Ink side-panel baseline.

### Verification

- `npm test -- tests/queue-command.test.ts tests/work-session-store.test.ts` -> `11/11`
- Clean staged-index targeted check: `npm test -- tests/queue-command.test.ts tests/work-session-store.test.ts` -> `11/11`
- `npm run lint` -> pass
- `npm run build` -> pass
- `npm test` -> `86` files / `1602` tests passed
- `node dist/bin/orca.js --version` -> `0.8.5`
- `ai check` -> failed on existing harness/doc gates: docs require frontmatter/changelog across legacy docs, no-emoji flags existing historical entries, and the test harness looks for missing `tests/test_all.py`; evidence at `outputs/check/20260429-044244-b917cb00`

### Remaining Risks

| Risk | Owner | Follow-up |
| --- | --- | --- |
| Evidence drawer is CLI-terminal first, not a full Ink side panel | UX/runtime | Extend the drawer into Ink after the existing uncommitted UI baseline is committed or split |
| Approvals and tool-call timelines are still not attached as first-class TaskRun evidence | Runtime/architecture | Continue M3 evidence-console work after execution contract unification |
| `ai check` harness is not aligned with this TypeScript repo baseline | Verification | Add a repo-local check adapter or update the harness before treating `ai check` as a release gate |

## 2026-04-29 - Serve Canonical Run PDCA Tranche

### Scope

Complete ORCA-SWARM-008 by making `serve /chat` write the same canonical `WorkSession` / `TaskRun` records used by the CLI run/queue surface.

### Delivered

- Valid `POST /chat` requests now create a `WorkSession` with `sourceSurface: serve`.
- Each request creates a `TaskRun` with `surface: serve` and `kind: run`.
- Non-streaming responses include `workSessionId` and `taskRunId`.
- Streaming responses emit an initial SSE `metadata` event with `workSessionId` and `taskRunId`.
- TaskRun state closes to `completed` or `failed` for non-streaming, streaming, provider exceptions, stream error events, and missing provider base URL.
- Runtime observations now include the WorkSession / TaskRun ids.
- Version bumped to `0.8.4`.

### Changed Files

- `src/commands/serve.ts`
- `tests/serve-command.test.ts`
- `README.md`
- `package.json`
- `package-lock.json`
- `doc/00_project/initiative_orca/*`

### Simplifications Made

- Reused the existing file-backed WorkSession / TaskRun store; no separate serve-run table.
- Kept `/chat` as the HTTP entrypoint and added run ids to existing response shapes instead of inventing a second endpoint.

### Verification

- `npm test -- tests/serve-command.test.ts tests/work-session-store.test.ts` -> `15/15`
- `npm run lint`
- `npm run build`
- `npm test` -> `1600/1600` across `86` files
- `node dist/bin/orca.js --version` -> `0.8.4`
- Clean staged-index targeted check: `npm test -- tests/serve-command.test.ts tests/work-session-store.test.ts` -> `7/7`
- Clean staged-index checkout attempted at `/tmp/orca-index-008.WnEC1K`; `npm run lint` is blocked by pre-existing uncommitted baseline dependencies (`src/program.ts` imports command/mode surfaces that are present only in the dirty workspace). This tranche intentionally does not stage those broader changes.

### Remaining Risks

| Risk | Owner | Follow-up |
| --- | --- | --- |
| `chat`, mission, and planner surfaces still do not all share the same run-record path | Runtime/architecture | Continue M2 execution-contract unification |
| TaskRun evidence bundles are still thin for serve requests | UX/runtime | Execute ORCA-SWARM-009 evidence drawer / richer evidence attachments |
| A clean index checkout still depends on older uncommitted baseline work outside this tranche | Release/hygiene | Close the broad command/mode baseline in a separate versioned commit before cutting a clean release artifact |

## 2026-04-29 - Queue Takeover PDCA Tranche

### Scope

Complete ORCA-SWARM-007 by making non-terminal TaskRun records leaseable from the CLI. This is an operator-control marker, not a scheduler or process-resume implementation.

### Delivered

- `orca queue takeover <task-run-id>`
- `--holder <name>` for explicit operator identity
- `--ttl <duration>` with `ms` / `s` / `m` / `h` parsing and a bounded max
- `--force` for intentional replacement of an active lease
- Store-level lease behavior:
  - reject terminal TaskRuns
  - reject active unexpired leases unless forced
  - replace expired leases automatically
  - preserve previous holder metadata on replacement
- `queue list` and `queue show` now surface lease holder / expiry metadata
- Version bumped to `0.8.3`

### Changed Files

- `src/work-session-store.ts`
- `src/commands/queue.ts`
- `tests/work-session-store.test.ts`
- `tests/queue-command.test.ts`
- `README.md`
- `package.json`
- `package-lock.json`
- `doc/00_project/initiative_orca/*`

### Simplifications Made

- Lease state stays on the existing TaskRun JSON record; no new daemon, scheduler table, or lock directory.
- `takeover` is explicit about claiming an operator lease and does not pretend to resume or migrate a running process.

### Verification

- `npm test -- tests/queue-command.test.ts tests/work-session-store.test.ts` -> `9/9`
- `npm run build`
- `npm test` -> `1598/1598` across `86` files
- `node dist/bin/orca.js --version` -> `0.8.3`
- `node dist/bin/orca.js queue takeover <fixture-task-run> --holder smoke --ttl 30s` -> acquired the fixture lease

### Remaining Risks

| Risk | Owner | Follow-up |
| --- | --- | --- |
| `queue takeover` is a lease marker, not real execution resume | Runtime/architecture | ORCA-SWARM-008 now covers `serve /chat`; remaining resume semantics stay under M2/M3 |
| Lease conflict handling is local-file based only | Runtime | Revisit atomic write / lock semantics before using it as a multi-process scheduler |

## 2026-04-29 - Queue Follow PDCA Tranche

### Scope

Continue the SOTA swarm atomic queue by completing ORCA-SWARM-006: make TaskRun evidence followable from the CLI without adding scheduler or lease semantics yet.

### Delivered

- `orca queue follow <task-run-id>`
- `--once` for snapshot mode
- `--lines <n>` for initial evidence tail size
- `--interval <ms>` for running TaskRun polling
- Background-job log attachment when a TaskRun carries `backgroundJobId`
- Runtime version surfaces now derive from package version instead of stale `0.8.0` literals

### Changed Files

- `src/commands/queue.ts`
- `src/background-jobs.ts`
- `src/version.ts`
- `src/program.ts`
- `src/output.ts`
- `src/commands/chat.ts`
- `tests/queue-command.test.ts`
- `tests/program.test.ts`
- `tests/v030-harness.test.ts`
- `README.md`
- `package.json`
- `package-lock.json`
- `doc/00_project/initiative_orca/*`

### Simplifications Made

- Follow mode reads from existing `TaskRun.evidence` and background-job metadata; no new queue daemon or scheduler abstraction.
- Running follow exits on terminal TaskRun states and uses polling instead of a separate watcher dependency.

### Verification

- `npm run lint`
- `npm test -- tests/queue-command.test.ts tests/work-session-store.test.ts tests/program.test.ts tests/command-contracts.test.ts` -> `39/39`
- `npm test -- tests/v030-harness.test.ts tests/program.test.ts tests/queue-command.test.ts tests/work-session-store.test.ts tests/command-contracts.test.ts` -> `59/59`
- `npm run build`
- `npm test` -> `1595/1595` across `86` files
- `node dist/bin/orca.js --version` -> `0.8.2`
- `node dist/bin/orca.js queue follow <fixture-task-run> --once --lines 1` -> printed fixture evidence tail

### Remaining Risks

| Risk | Owner | Follow-up |
| --- | --- | --- |
| `queue follow` was read-only and could not claim work | Runtime/architecture | Closed by ORCA-SWARM-007 `queue takeover`; real resume remains ORCA-SWARM-008+ |
| Evidence paths are tailed from local files only | Runtime/UX | Attach richer structured evidence bundles before TUI evidence drawer |

## 2026-04-29 - SOTA Swarm Audit and PDCA Tranche 1

### Scope

Audit Orca with a multi-lane SOTA swarm, publish the routed report, convert findings into a milestone plan and atomic queue, then execute the first PDCA tranche against the highest-risk trust and queue gaps.

### Delivered

- SOTA swarm audit report:
  - `doc/00_project/initiative_orca/SOTA_GAP_SWARM_AUDIT.md`
  - `doc/00_project/initiative_orca/SOTA_GAP_SWARM_AUDIT.html`
- Trust hardening:
  - repo-local hooks require explicit project trust via `HookManager({ trustProjectHooks: true })` or `ORCA_TRUST_PROJECT_HOOKS=1`
  - hook subprocess env no longer inherits provider API keys by default
  - `fetch_url` and `web_search` require approval in `auto` mode
  - `fetch_url` rejects non-HTTP(S), loopback, private, link-local, CGNAT, benchmark, multicast, and common local IPv6 targets
- Queue visibility:
  - `orca queue`
  - `orca queue list --status <status> --work-session <id> --limit <n>`
  - `orca queue show <task-run-id>`

### Changed Files

- `src/hooks.ts`
- `src/tools.ts`
- `src/doctor.ts`
- `src/commands/queue.ts`
- `src/program.ts`
- `tests/hooks.test.ts`
- `tests/hooks-compat.test.ts`
- `tests/tools.test.ts`
- `tests/chat-proxy-tool-call.test.ts`
- `tests/queue-command.test.ts`
- `tests/program.test.ts`
- `tests/command-contracts.test.ts`
- `tests/v030-harness.test.ts`
- `tests/v050-modules.test.ts`
- `doc/00_project/initiative_orca/SOTA_GAP_SWARM_AUDIT.md`
- `doc/00_project/initiative_orca/SOTA_GAP_SWARM_AUDIT.html`

### Simplifications Made

- Startup hook loading now has a clear split: global hooks are startup-safe; repo-local hooks require explicit project trust.
- Hook subprocess environment is allowlisted instead of inheriting the full parent process.
- Network-capable tools now use the existing dangerous-tool approval lane instead of a separate policy path.
- Queue inspection reuses existing `TaskRun` storage; no scheduler abstraction was introduced in this tranche.

### Verification

- `npm run lint`
- `npm test -- tests/hooks.test.ts tests/hooks-compat.test.ts tests/tools.test.ts tests/chat-proxy-tool-call.test.ts tests/v030-harness.test.ts tests/v050-modules.test.ts` -> `153/153`
- `npm test -- tests/queue-command.test.ts tests/program.test.ts tests/command-contracts.test.ts tests/work-session-store.test.ts` -> `37/37`
- `npm test -- tests/hooks.test.ts tests/hooks-compat.test.ts tests/tools.test.ts tests/chat-proxy-tool-call.test.ts tests/queue-command.test.ts tests/program.test.ts tests/command-contracts.test.ts tests/v030-harness.test.ts tests/v050-modules.test.ts tests/work-session-store.test.ts` -> `190/190`
- `npm run build`
- `npm test` -> `1593/1593` across `86` files
- `node dist/bin/orca.js --help` -> `queue` command visible
- `node dist/bin/orca.js queue list --limit 3` -> renders TaskRun Queue empty-state successfully

### Remaining Risks

| Risk | Owner | Follow-up |
| --- | --- | --- |
| `fetch_url` blocks literal private hosts but does not yet resolve DNS names before curl | Runtime/security | Add DNS resolution and block resolved private addresses before execution |
| Project hook trust has an env/programmatic switch but no first-class CLI UX | Runtime/security | Add `orca hooks trust/status` or equivalent approval surface |
| `orca queue` is read-only and does not implement leases or takeover | Runtime/architecture | Execute ORCA-SWARM-007 |
| CI still under-enforces documented matrix/security/performance/eval gates | Verification | Execute ORCA-SWARM-012 |

## 2026-04-26 — Provider-grouped model picker（完成）

### Scope

Fix `/model` selection when multiple providers expose the same model name, and make the model picker readable for large provider catalogs.

### Delivered

- `/model` in Ink now picks provider first, then model within that provider.
- Model choices now carry provider+model identity, so selecting `poe/gpt-5.4` no longer resolves to the first `gpt-5.4` entry from another provider.
- `/model set <name>` now prefers the current provider when names are duplicated.
- `/models` legacy output is grouped by provider while preserving numeric selection.
- Shared `OptionPicker` now windows long lists and splits descriptions onto their own row.

### Verification

- `npm test -- tests/model-catalog.test.ts tests/ink-ui.test.tsx tests/chat-slash-mutations.test.ts tests/chat-slash-readonly.test.ts` -> `158/158`
- `npm run lint`
- `npm run build`
- `npm test` -> `1583/1583`
- `node dist/bin/orca.js --version` -> `0.8.0`

## 2026-04-22 — One-click full delivery（完成）

### Scope

Execute a Harness-grade full-delivery pass on the current trust-policy + eval tranche: establish explicit phase boundaries, absorb review/security findings into the release gate, fix the scoped blockers, rerun the full verification chain, and emit stage artifacts plus an executable rollback path.

### Change Summary

- Runtime/security hardening:
  - `src/mcp-client.ts`
  - `src/commands/chat.ts`
  - `src/policy-executor.ts`
  - `src/mcp-server.ts`
  - `src/commands/serve.ts`
- Regression coverage:
  - `tests/mcp-client.test.ts`
  - `tests/chat-one-shot-mcp-cleanup.test.ts`
  - `tests/v050-modules.test.ts`
  - `tests/serve-command.test.ts`
  - `tests/config.test.ts`
- Documentation / delivery surfaces:
  - `README.md`
  - `AGENT_EVAL_PLAN.md`
  - `doc/00_project/initiative_orca/{PRD.md,SYSTEM_ARCHITECTURE.md,USER_EXPERIENCE_MAP.md,task_plan.md,notes.md,PDCA_ITERATION_CHECKLIST.md}`
- Stage artifacts:
  - `outputs/spec/2026-04-22-one-click-full-delivery-spec.md`
  - `outputs/build/2026-04-22-build-scope.md`
  - `outputs/test/2026-04-22-test-evidence.md`
  - `outputs/security/2026-04-22-security-readiness.md`
  - `outputs/release/2026-04-22-release-readiness.md`
  - `outputs/observe/2026-04-22-observe-verdict.md`
  - `outputs/learn/2026-04-22-dna-capsule-candidates.md`

### Simplifications Made

- Repo-local MCP configs are no longer silently auto-spawned on startup; only home/global-scoped MCP remains startup-safe.
- `allowedTools: []` now means deny-all instead of “no policy”.
- MCP `tools/list` and `tools/call` now speak the same allowlist contract.
- Hook system notices no longer pollute MCP stdout framing.
- `/chat` request parsing now has a hard body-size ceiling instead of unbounded accumulation.

### Verification

- `npm run lint`
- `npm test` → `1553/1553`
- `npm run build`
- `npm run test:matrix:sync` → `ok`
- `npm run test:matrix` → `outputs/test-matrix/run-20260422-061719/matrix.md`
- `npm run eval:fast` → `agent-eval/runs/20260422-063053-333719/summary.json`
- `npm run eval:nightly` → `agent-eval/runs/20260422-061814-339289/summary.json`
- `npm run eval:release` → `agent-eval/runs/20260422-061914-913077/summary.json`
- `npm audit --omit=dev --json` → `outputs/security/2026-04-22-npm-audit.json`
- `npm pack --json --dry-run` → `outputs/release/2026-04-22-pack-dry-run.json`
- `node dist/bin/orca.js bench --json` → `outputs/test/2026-04-22-bench.json`

### Release Readiness

- Functional closure: pass
- Tests all green: pass
- Security no critical/high unresolved in this delivery scope: pass
- Performance budget: pass (`bench` score `100`)
- Docs updated: pass
- Rollback path executable: pass

### Remaining Risks

| Risk | Owner | Deadline | Mitigation |
| --- | --- | --- | --- |
| `AGENT_EVAL_PLAN.md` long-range inventory still has open `T-012` expansion work | Maurice | 2026-04-29 | extend nightly/release task families toward the `36` / `72` target matrix and refresh quotas after the next tranche |
| Matrix `static` / `security` / `performance` rows remain `partial-pass` by manifest design rather than deeper specialized gates | Maurice | 2026-05-06 | add dedicated SAST/DAST/IaC/ASVS and performance-budget layers, then tighten matrix status semantics if desired |
| Wave 4 continuity / evidence-console product work is still roadmap, not shipped in this pass | Maurice | 2026-05-06 | start the next tranche from `outputs/spec/2026-04-22-one-click-full-delivery-spec.md` and land `WorkSession` / `TaskRun` object model first |

### Rollback

- Scoped rollback artifact: `outputs/release/2026-04-22-scoped-rollback.patch`
- Validation command:
  - `git apply --check -R outputs/release/2026-04-22-scoped-rollback.patch`
- Scope:
  - current delivery pass repo-impacting files only (runtime/test/doc changes), without touching unrelated dirty worktree files

### DNA Capsule Candidates

- Startup-safe MCP provenance pattern: load project/home MCP configs, but auto-connect only trusted home/global scope and require explicit connect for repo-local scope.
- Shared policy fail-closed rule: any defined allowlist, including `[]`, is authoritative.
- MCP transport rule: never print human-readable hook notices to stdout on a JSON-RPC stdio channel; use stderr or structured payloads.
- Harness review rule: green tests are not enough to ship if attacker review finds a trust-policy contract mismatch.

## 2026-04-22 — Harness Verification Refresh（完成）

### Scope

Repair the stale verification blocker introduced by Cloudflare's routed-provider-key aggregator path, then refresh the canonical fast / nightly / release / matrix evidence so the trust-policy tranche is back on a green, auditable baseline.

### Delivered

- Fixed the stale aggregator smoke assumption in:
  - `tests/config.test.ts`
- Added a structured verification artifact:
  - `outputs/verification/2026-04-22-gate-refresh.md`
- Updated continuation / evidence docs:
  - `doc/00_project/initiative_orca/task_plan.md`
  - `doc/00_project/initiative_orca/notes.md`
  - `doc/00_project/initiative_orca/ROLLING_REQUIREMENTS_AND_PROMPTS.md`
  - `HANDOFF.md`

### Verification

- `npm run lint`
- `node --experimental-vm-modules node_modules/.bin/vitest run tests/hooks.test.ts tests/agent-eval-manifests.test.ts tests/test-matrix-runner.test.ts tests/test-matrix-sync.test.ts`
- `npm run build`
- `npm test` → `1546/1546`
- `npm run test:matrix:sync` → `ok`
- `npm run eval:fast` → `agent-eval/runs/20260422-054119-735043/summary.json`
- `npm run eval:nightly` → `agent-eval/runs/20260422-054727-090885/summary.json`
- `npm run eval:release` → `agent-eval/runs/20260422-054415-886673/summary.json`
- `npm run test:matrix` → `outputs/test-matrix/run-20260422-054827/matrix.md`

### Result

- Harness drift is closed: fast / nightly / release are now green at `62/62`, `65/65`, and `68/68`.
- Direct suite evidence is refreshed at `1546/1546`.
- The matrix lane is green again; `static`, `security`, and `performance` remain `partial-pass` by design, not by failure.
- The root cause is preserved in the rolling ledger so future aggregator tests do not silently depend on whichever provider keys happen to exist on the operator machine.

## 2026-04-22 — Global Orca Hook Surface（完成）

### Scope

Allow Orca to load a global native hook file from `~/.orca/hooks.json` so operator-level automations can apply across projects without copying `.orca/hooks.json` into every workspace.

### Delivered

- Added global Orca hook loading in:
  - `src/hooks.ts`
- Added regression coverage:
  - `tests/hooks.test.ts`
- Updated docs:
  - `README.md`
  - `doc/00_project/initiative_orca/PRD.md`
  - `doc/00_project/initiative_orca/SYSTEM_ARCHITECTURE.md`
  - `doc/00_project/initiative_orca/USER_EXPERIENCE_MAP.md`
  - `doc/00_project/initiative_orca/PLATFORM_OPTIMIZATION_PLAN.md`

### Verification

- `npm run lint`
- `npm test -- tests/hooks.test.ts`
- `npm run build`

### Result

- Orca now loads project-local and operator-global native hook config together.
- This enables AI-Fleet to install a shared Terminal-title `UserPromptSubmit` hook once at `~/.orca/hooks.json` and have direct `orca` sessions inherit it automatically.
- No compatibility layer or alternate hook system was introduced.

## 2026-04-21 — Cloudflare AI Gateway provider（完成）

### Scope

Add Cloudflare AI Gateway as a first-class Orca aggregator so provider-prefixed SOTA models can run through one OpenAI-compatible endpoint without forking the runtime.

### Delivered

- Added a well-known `cloudflare` provider in:
  - `src/config.ts`
- Added env-based base URL resolution for Cloudflare:
  - `CLOUDFLARE_AI_GATEWAY_API_KEY`
  - `CLOUDFLARE_AI_GATEWAY_BASE_URL`
- Added computed gateway URL fallback:
  - `CLOUDFLARE_ACCOUNT_ID`
  - `CLOUDFLARE_AI_GATEWAY_ID`
- Added compatibility alias:
  - `claudeflare`
- Added dual auth handling:
  - explicit Cloudflare gateway token when available
  - request-based provider key inferred from the model prefix when not
- Added Cloudflare model fallback selection so the provider can auto-pick a locally usable model
- Added Cloudflare to the known aggregator set so cross-vendor model routing can target it.
- Updated public docs:
  - `README.md`
- Added regression coverage:
  - `tests/config.test.ts`
  - `tests/model-catalog.test.ts`

### Verification

- `npm run lint`
- `npm test`
- `npm run build`
- `orca providers` => `cloudflare` now reports `ready` on this machine

### Result

- Orca now has a second serious aggregator lane alongside Poe/OpenRouter.
- Cloudflare can be used as the default provider or as the multi-model aggregator for council/race/pipeline flows.
- Local Cloudflare default is now aligned to `openai/gpt-5.4`, matching AI-Fleet `1c`.
- Multi-model auto-routing now prefers `GitHub Copilot -> Cloudflare`, with Poe/OpenRouter only after those preferred aggregators.
- `council` / `race` / `pipeline` startup banners now surface that priority and show the next fallback aggregator explicitly.
- Those startup banners now also surface billing path: `copilot subscription` first, `cloudflare credits` as fallback.

## 2026-04-20 — SOTA picker parity follow-up

### Scope

Push Orca's Ink/TUI finite-choice interactions closer to frontier coding CLIs by replacing ad hoc numbered prompts and divergent picker visuals with one shared picker architecture.

### Delivered

- Shared picker event + type layer:
  - `src/ui/types.ts`
  - `src/ui/session.ts`
  - `src/ui/components/App.tsx`
- Shared picker components:
  - `src/ui/components/PickerFrame.tsx`
  - `src/ui/components/OptionPicker.tsx`
- Ink-mode finite-choice flows upgraded:
  - `/model`, `/models`
  - `/mode`
  - `/effort`
  - `/load`
  - `/thread load`, `/thread delete`
  - `/mcp enable`, `/mcp disable`, `/mcp connect`
  - `ask_user(options)`
- Ink-mode search/discovery flows upgraded with filterable picker mode:
  - `/thread search`
  - `/notes search`
  - `/prompts find`
  - `/postmortem search`
- Searchable picker capability added:
  - initial query seeding from typed slash-command arguments
  - in-panel filtering
  - empty-state handling for no matches
- Wave 1 portability actions landed:
  - `orca session fork`
  - `orca session export`
  - `orca session import`
  - `/thread export`
  - `/thread import`
  - `/thread handoff`
- Search-to-inspect detail flow landed:
  - `detail_panel` UI event
  - `src/ui/components/DetailPanel.tsx`
  - Ink-mode detail rendering for:
    - `/thread search`
    - `/notes search`
    - `/prompts find`
    - `/postmortem search`
- Shareable artifact flow landed:
  - `orca session markdown`
  - `orca session share`
  - `/thread markdown`
  - `/thread share`
- Collaboration-bundle hardening landed:
  - session share now emits Markdown + metadata sidecar
  - session handoff now emits a dedicated handoff artifact bundle
  - thread share now emits Markdown + metadata sidecar
  - thread handoff now emits a dedicated handoff artifact bundle
- Wave 2 approval/trust flow landed:
  - top-level `orca permissions`
  - `/permissions` slash surface
  - persisted permission-mode config helpers
  - real `plan` semantics (approve every tool)
  - permission source visibility in status/footer
  - Ink `/permissions` detail panel + picker
  - permission prompts with once/session/project persistence scopes
  - inspectable `permissions rules` surfaces for session/project/global approvals
  - `permissions revoke` / `permissions clear` rule-management surfaces
  - filter-and-pick revoke flow when exact rule keys are not supplied
  - stable canonical permission rule descriptors instead of preview-text keys
  - `permissions normalize` surface for legacy rule cleanup
  - effective runtime allowlist now merges project + global scopes
  - rule inspection annotated with canonical / legacy / unrecognized state
  - legacy `::` permission rules now normalize into canonical descriptors
  - state-based filtering for rules audit view
  - top-level workflow preset commands:
    - `orca review`
    - `orca debug`
    - `orca architect`
  - `/mode` picker descriptions summarize workflow changes per profile
  - workflow preset command metadata resolved from a single registry
  - workflow preset registry carries structured default policy fields
  - preset-backed mode switches apply default effort / permission policy
  - startup and `/mode` switching share one preset-policy application helper
  - status surfaces expose the active workflow policy combination
  - workflow preset registry now carries tool/output policy surfaced via `/mode` and `/status`
  - model policy surfaced via `/status` and the live status bar
  - startup prompt now composes `mode + preset + effort` from the shared workflow policy contract
  - proxy tool runtime now enforces the active mode whitelist
  - session effort / preset default effort now maps into proxy `reasoning_effort` (`max` → `xhigh`)
  - provider-returned tool calls now hard-fail unless the tool was explicitly advertised
  - non-interactive permission prompts now fail closed instead of silently auto-approving
  - SDK-backed REPL turns now consume the composed session prompt + mapped permission mode
  - env-sensitive cloudflare / aggregator tests were stabilized against local config drift
- Visual shell unification:
  - `src/ui/components/CommandPicker.tsx`
  - `src/ui/components/PermissionPrompt.tsx`
  - `src/ui/components/ThemePicker.tsx`
- Docs rolled forward:
  - `README.md`
  - `USER_EXPERIENCE_MAP.md`
  - `USER_EXPERIENCE_MAP.html`
- Competitive strategy artifacts rolled forward:
  - `SOTA_EXPERIENCE_GAP_REPORT.md`
  - `SOTA_EXPERIENCE_GAP_REPORT.html`
  - `PDCA_EXECUTION_PLAN.md`
  - `PDCA_ITERATION_CHECKLIST.md`
  - `PLATFORM_OPTIMIZATION_PLAN.md`

### Verification

- `npm run lint`
- `npm test`
- `npm run build`

### Result

- Finite-choice Ink/TUI flows now share one interaction grammar instead of mixing static lists, typed follow-up answers, and visually unrelated panels.
- Legacy mode still retains text/number fallback behavior, so the UX upgrade stays low-risk outside the Ink path.
- Latest verification evidence after this tranche:
  - `npm test` => `1450/1450`

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

## 2026-04-21 — SOTA gap swarm audit + PDCA refresh

### Scope

Run a multi-lane read-only swarm audit after the benchmark and turn it into a real PDCA closeout with current evidence, not historical artifacts.

### Delivered

- Added a canonical swarm-audit report:
  - `doc/00_project/initiative_orca/SOTA_GAP_SWARM_AUDIT.md`
  - `doc/00_project/initiative_orca/SOTA_GAP_SWARM_AUDIT.html`
- Rolled the audit conclusions into:
  - `PRD.md`
  - `USER_EXPERIENCE_MAP.md`
  - `PLATFORM_OPTIMIZATION_PLAN.md`
  - `PDCA_EXECUTION_PLAN.md`
  - `PDCA_ITERATION_CHECKLIST.md`
  - `task_plan.md`
  - `notes.md`
  - `ROLLING_REQUIREMENTS_AND_PROMPTS.md`
- Refreshed current-slice evidence:
  - nightly gate: `agent-eval/runs/20260421-074245-714923/`
  - release gate: `agent-eval/runs/20260421-074333-249714/`
  - manual CLI smoke: `outputs/manual-cli-smoke/run-20260421-154536/`
- Closed the gate-runner compatibility regression discovered during PDCA check:
  - `agent-eval/scripts/run-gate.py`
  - `agent-eval/scripts/run-test-matrix.py`
  - both now use `timezone.utc` instead of `datetime.UTC`

### Outcome

- Orca’s next tranche is now constrained more tightly than “do Wave 4 continuity”:
  1. trust hardening
  2. canonical `WorkSession` / `TaskRun` objects
  3. async queue + take-over
  4. evidence console
- PDCA evidence for this slice is now current instead of relying on older nightly/release artifacts.
- The audit also made one architectural risk explicit: continuity, queueing, and evidence cannot be shipped credibly if approval/runtime policy remains fragmented across REPL, MCP, and serve.

## 2026-04-21 — trust hardening tranche 1

### Scope

Start with the two highest-yield trust fixes from the audit: safer default REPL approval posture and authentication requirements for non-loopback `serve`.

### Delivered

- `src/config.ts`
  - legacy config `default` now resolves to REPL `auto` instead of `yolo`
- `src/commands/serve.ts`
  - exported `resolveServeAuthToken()`
  - non-loopback `serve` now requires `ORCA_SERVE_TOKEN`
  - authenticated `serve` requests now require `Authorization: Bearer <token>`
- regression coverage:
  - `tests/config.test.ts`
  - `tests/serve-command.test.ts`

### Verification

- targeted:
  - `vitest run tests/config.test.ts tests/serve-command.test.ts`
- repo-level:
  - `npm run lint`
  - `npm test`
  - `npm run build`
- manual:
  - `outputs/manual-cli-smoke/run-20260421-160704/cli-smoke.txt`
  - `outputs/manual-cli-smoke/run-20260421-160704/serve-smoke.txt`

### Outcome

- a fresh REPL session no longer defaults into fail-open `yolo`
- remote/headless `serve` exposure now has a hard authentication gate instead of relying only on operator caution

## 2026-04-21 — trust hardening tranche 2

### Scope

Start the shared policy executor so REPL and MCP no longer have separate normal-tool policy logic.

### Delivered

- added `src/policy-executor.ts`
- moved shared policy concerns into one module:
  - pre-hook handling
  - tool allowlist enforcement
  - approval checks
  - sandbox posture wrapping
- `src/commands/chat-proxy-tool-call.ts`
  - normal tool execution now uses the shared policy executor
- `src/mcp-server.ts`
  - tool calls now use the same shared policy executor
- `src/commands/serve.ts`
  - MCP stdio startup now passes permission mode + allowlist + persisted grants into the shared executor
- regression coverage:
  - `tests/chat-proxy-tool-call.test.ts`
  - `tests/v050-modules.test.ts`

### Verification

- `node --experimental-vm-modules node_modules/.bin/vitest run tests/config.test.ts tests/serve-command.test.ts tests/chat-proxy-tool-call.test.ts tests/v050-modules.test.ts`
- `npm run lint`
- `npm test`
- `npm run build`

### Outcome

- normal tool policy is no longer duplicated between chat and MCP
- dangerous MCP tool calls now fail closed unless a grant already exists
- the remaining trust gap is now narrower and more explicit:
  - special tools still have path-specific handling
  - serve HTTP auth still lives at the transport edge

## 2026-04-21 — Ink entry / home-state UX optimization

### Scope

Improve the primary TUI entry experience so a user can understand the main action, current trust posture, recovery paths, and failure help from the first screen without memorizing slash commands.

### Delivered

- added `src/ui/components/HomePanel.tsx`
- `src/ui/components/App.tsx`
  - empty state now renders a structured home panel instead of the old flat command list
- `tests/ink-ui.test.tsx`
  - home-panel render coverage
  - empty-state integration coverage
- docs rolled forward:
  - `USER_EXPERIENCE_MAP.md`
  - `PRD.md`
- text snapshot evidence:
  - `outputs/ui-smoke/run-20260421-165711/home-panel.txt`

### Validation

- `node --experimental-vm-modules node_modules/.bin/vitest run tests/ink-ui.test.tsx`
- `npm run lint`
- `npm test`
- `npm run build`

Browser-specific validation status for this slice:
- browser console: `N/A`
- network leak inspection: `N/A`
- Lighthouse/performance budget: `N/A`
- responsive screenshots: `N/A`
- reason: this optimization targets Orca's Ink TUI, not a browser frontend

### Outcome

- the entry screen now has one clear primary action: type a concrete task and press Enter
- trust posture is visible before the user starts delegating work
- quick recovery and failure paths are explicit from the first frame
- `Tab` now opens a quick-action picker so the empty state is actionable rather than only descriptive

Context-aware follow-up:

- quick actions now adapt to current trust posture and saved-session availability
- the home panel now surfaces `/sessions` when saved sessions exist
- updated text snapshot evidence:
  - `outputs/ui-smoke/run-20260421-171338/home-panel-dynamic.txt`

### Verification

- `python3 -m py_compile agent-eval/scripts/run-gate.py agent-eval/scripts/run-test-matrix.py agent-eval/scripts/run-secret-scan.py agent-eval/scripts/collect-license-inventory.py agent-eval/scripts/sync-test-matrix.py`
- `node --experimental-vm-modules node_modules/.bin/vitest run tests/test-matrix-runner.test.ts tests/agent-eval-manifests.test.ts tests/test-matrix-sync.test.ts`
- `npm run eval:nightly`
- `npm run eval:release`
- manual CLI smoke:
  - `outputs/manual-cli-smoke/run-20260421-154536/cli-smoke.txt`
  - `outputs/manual-cli-smoke/run-20260421-154536/serve-smoke.txt`
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
- targeted async-REPL-slash extraction suite passed (`31/31`)
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

## 2026-04-20 · REPL Multimodal Image Paths（Completed）

### Delivered

- `src/commands/chat-input.ts`
- `src/commands/chat-repl-turn.ts`
- `src/commands/chat.ts`
- `tests/chat-image-option.test.ts`
- `tests/chat-repl-turn.test.ts`
- `tests/chat-internals.test.ts`
- `README.md`

### Outcome

- `orca chat` REPL now accepts arbitrary local image paths directly in the prompt text on the proxy path.
- Multiple images in one turn are converted into multimodal `PromptContent` instead of being file-expanded as text.
- Quoted paths and shell-escaped spaces are supported.
- Proxy-turn history now preserves multimodal user content, so follow-up turns can still refer to the attached images.

### Not Built

- Clipboard bitmap paste / direct image paste into the ink REPL is still out of scope.
- Native SDK path still does not support multimodal content; images require the existing proxy-provider path.

### Verification

- `node --experimental-vm-modules node_modules/.bin/vitest run tests/chat-image-option.test.ts tests/chat-repl-turn.test.ts tests/chat-internals.test.ts tests/openai-compat-multimodal.test.ts tests/context-protection.test.ts`
- `npm run lint`
- `npm test` => `1371/1371`
- `npm run build`
- `npm run bench` => `10/10`, `100%`

## 2026-04-21 · SOTA SOP Benchmark (Completed)

### Delivered

- benchmark matrix for:
  - Claude Code
  - OpenAI Codex
  - Amp
  - OpenCode
  - Cursor
  - GitHub Copilot coding agent
- canonical doc updates:
  - `PRD.md`
  - `USER_EXPERIENCE_MAP.md`
  - `PLATFORM_OPTIMIZATION_PLAN.md`
  - companion `.html` files where required

### Outcome

- Orca’s largest remaining SOTA gap is no longer workflow labeling or basic trust UX; it is continuity across terminal / web / IDE plus detached execution with visible evidence.
- Benchmark conclusion now sets the next priority order as:
  1. Wave 4 continuity surfaces
  2. async execution queue + resumable take-over
  3. inspect-and-act evidence console
- The benchmark also confirmed that the dominant SOTA SOP is:
  - durable session/thread object
  - explicit approval / review gate
  - detached or remote execution surface
  - human review before merge/apply
  - visible evidence/log/timeline surface

### Verification

- Source review completed against official docs / release notes within the 12-month evidence window where available
- Canonical docs rolled forward for benchmark conclusions:
  - `PRD.md`
  - `USER_EXPERIENCE_MAP.md`
  - `PLATFORM_OPTIMIZATION_PLAN.md`

## 2026-04-21 · Wave 4a Continuity Foothold (Completed)

### Delivered

- stable REPL `sessionId`
- `/status` and live status visibility for the current session id
- `orca -c <id>` for exact session resume
- headless continuity discovery endpoints:
  - `GET /sessions`
  - `GET /sessions/latest`
  - `GET /sessions/:id`

### Outcome

- Orca now has a first durable session-object continuity surface rather than only local autosave files.
- The current session id is visible to the operator in-session.
- The CLI can now target a specific saved session instead of only “latest”.
- Headless/web/IDE clients now have a read-only discovery API for saved sessions.
- That continuity API is now explicitly local/trusted-only:
  - `/health` no longer exposes session metadata
  - no wildcard CORS for arbitrary origins
  - `GET /sessions` and `GET /sessions/latest` are loopback-only

### Verification

- `node --experimental-vm-modules node_modules/.bin/vitest run tests/serve-command.test.ts tests/session-command.test.ts tests/chat-slash-readonly.test.ts tests/ink-ui.test.tsx tests/chat-repl-turn.test.ts`

## 2026-04-21 · Layered Test Matrix (Completed)

### Delivered

- executed test-evidence bundle under:
  - `outputs/test-matrix/run-20260421-134924/`
- matrix artifact:
  - `outputs/test-matrix/run-20260421-134924/matrix.md`
- repo-native layer scripts:
  - `test:static`
  - `test:unit`
  - `test:contract`
  - `test:integration`
  - `test:e2e`
  - `test:security`
  - `test:resilience`
  - `test:performance`
  - `test:ai-eval-fast`
  - `test:matrix`
  - `test:matrix:sync`
- helper scripts:
  - `agent-eval/scripts/run-test-matrix.py`
  - `agent-eval/scripts/run-secret-scan.py`
  - `agent-eval/scripts/collect-license-inventory.py`
  - `agent-eval/scripts/sync-test-matrix.py`
- single-source manifest:
  - `agent-eval/manifests/test-matrix.json`
- generated snippet:
  - `agent-eval/generated/test-matrix-entrypoints.md`
- latest runner-produced evidence:
  - `outputs/test-matrix/run-20260421-065329/`
  - `outputs/test-matrix/run-20260421-065329/matrix.md`
- execution hardening follow-up:
  - `agent-eval/manifests/test-matrix.json` now stores typed `steps[].argv` arrays instead of shell command strings
  - `run-test-matrix.py` now executes steps directly without `shell=True`
  - runner now rejects unknown `--layers` selections instead of silently succeeding with an empty row set
  - fresh runner-produced evidence:
    - `outputs/test-matrix/run-20260421-072634/`
    - `outputs/test-matrix/run-20260421-072634/matrix.md`

### Outcome

- Orca now has an explicit layered test matrix with real commands and real evidence, not just an informal “run lint/test/build” habit.
- The matrix is now runnable from repo-native scripts instead of depending on hand-curated shell snippets.
- The matrix metadata is now sourced from one manifest instead of hardcoded Python constants.
- The manifest is now a typed command-spec surface instead of a repo-owned shell-string surface.
- The matrix makes the current boundary clear:
  - unit/contract/integration/e2e/resilience/AI-eval are real and runnable
  - static/security/performance are only partially institutionalized
- The matrix also makes release strategy explicit:
  - PR: incremental relevant suites + required static gates
  - main/nightly: full regression + security/perf follow-through
  - release: `eval:release` + real smoke/observability evidence
- Attacker-review fixes are included in the runner path:
  - `run-test-matrix.py` no longer allows path-traversal `run-id`
  - `run-secret-scan.py` no longer follows symlinks out of repo root
  - `..` is now explicitly rejected as a run id because dot characters are disallowed entirely
  - `run-test-matrix.py` no longer shells manifest layer commands through `shell=True`

### Verification

- static:
  - `npm run lint`
  - `npm run build`
  - `npm ls --depth=0`
  - heuristic secret scan
  - license inventory
- unit:
  - `vitest run tests/config.test.ts tests/model-catalog.test.ts tests/output.test.ts tests/command-picker.test.ts`
- contract:
  - `vitest run tests/protocol.test.ts tests/command-contracts.test.ts tests/agent-eval-manifests.test.ts tests/serve-command.test.ts`
- integration:
  - `vitest run tests/integration.test.ts tests/session-command.test.ts tests/providers-command.test.ts tests/mcp-client.test.ts`
- e2e:
  - `vitest run tests/e2e-workflow.test.ts tests/complex-scenarios.test.ts tests/mission.test.ts`
- security:
  - `vitest run tests/adversarial.test.ts tests/context-protection.test.ts tests/chat-proxy-tool-call.test.ts tests/permissions-command.test.ts`
  - `npm audit --omit=dev --json`
- performance:
  - `node dist/bin/orca.js bench --json`
  - `vitest run tests/bench.test.ts`
- resilience:
  - `vitest run tests/provider-stream-resilience.test.ts tests/agent-loop.test.ts tests/hermes-runtime.test.ts tests/chat-repl-turn.test.ts`
- ai eval:
  - `npm run eval:fast`

## Hook Lifecycle And Unsupported Claim Guard (2026-05-03)

### Outcome

- Fixed one-shot hook loading so direct `orca chat "..."` invocations use the same global hook surface as interactive sessions.
- Fixed lifecycle parity for `Stop` and `SubagentStop`.
- `Stop` hooks now receive the assistant response via `ORCA_RESPONSE` / `CLAUDE_RESPONSE`, enabling Copilot-style self-review and pre-completion gates to inspect what the model actually said.
- Added runtime claim/evidence guard:
  - file created/saved/written/opened claims require matching file/open tools
  - test/lint/build/typecheck claims require command tools
  - git commit/push/publish/deploy claims require git/command tools
  - MCP claims require MCP tool calls
- Strengthened the system prompt so the model is explicitly told not to claim unsupported side effects.

### Verification

- `npm test -- tests/chat-internals.test.ts tests/chat-one-shot-mcp-cleanup.test.ts tests/chat-proxy-tool-call.test.ts tests/hooks.test.ts tests/hooks-compat.test.ts tests/e2e-workflow.test.ts` => passed (`94` tests)
- `npm run lint` => passed
- `npm run build` => passed
- `npm test` => passed (`91` files / `1670` tests)
- Local hook load smoke:
  - total hooks: `39`
  - event types: `9`
  - lifecycle events present: `UserPromptSubmit`, `Stop`, `SessionStart`, `PreToolUse`, `PostToolUse`, `PreCompact`, `SubagentStart`, `SubagentStop`, `SessionEnd`

## Claude-Style No-Flicker TUI (2026-05-03)

### Outcome

- Added explicit no-flicker/fullscreen opt-ins: `ORCA_TUI=fullscreen`, `ORCA_NO_FLICKER=1`, legacy `ORCA_ALT_SCREEN=1`, and Claude-compatible `CLAUDE_CODE_NO_FLICKER=1`.
- Kept default Ink rendering in the primary terminal buffer so normal scrollback selection/copy remains available.
- Pre-entered the alternate screen before Ink paints its first frame in no-flicker mode.
- Added render-failure cleanup so Orca exits the alternate screen if Ink throws before the wrapper mounts.
- Limited completed block rendering to the latest `80` blocks in no-flicker mode to reduce repaint work during long sessions.
- Kept mouse capture opt-in through `ORCA_MOUSE=1`.

### Verification

- `npm test -- tests/ink-ui.test.tsx` => passed (`80` tests)
- Dist-level no-flicker env smoke => `default=false`, `ORCA_TUI=fullscreen=true`, `CLAUDE_CODE_NO_FLICKER=1=true`, `ORCA_TUI=default` override=false
- `npm test -- tests/hooks.test.ts tests/hooks-compat.test.ts` => passed (`40` tests)
- `npm test -- tests/chat-proxy-tool-call.test.ts tests/v050-modules.test.ts -t "24.21|chat proxy tool helper"` => passed
- `npm run lint` => passed
- `npm run build` => passed
- `npm test` => passed (`91` files / `1671` tests)
