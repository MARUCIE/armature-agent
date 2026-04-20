# Orca CLI PRD

## Product Snapshot

- Product: Orca CLI
- Package: `orca-cli`
- Domain: provider-neutral coding-agent CLI
- Primary users: developers who need coding-agent workflows across multiple model vendors
- Current repo status: active TypeScript CLI with runtime, multi-model collaboration, session management, PR review, serve mode, benchmark tooling, and Hermes-inspired runtime ergonomics

## Problem

Single-vendor coding CLIs force users into one model family per session. Orca CLI exists to give developers a single terminal-native workflow that can route across providers, run agent tasks, and coordinate multiple models when that meaningfully improves quality or speed.

## Goals

1. Provide a production-grade CLI for coding-agent usage with predictable provider/model routing.
2. Support multi-model collaboration modes that no single-vendor CLI can offer.
3. Preserve strong developer ergonomics: REPL, one-shot execution, saved sessions, PR review, stats, headless serving, and explicit debugging/reflection flows.
4. Keep runtime behavior testable and inspectable through a large automated suite.

## Non-Goals

- Browser-first UX
- Backward-compatibility shims for outdated command or config formats
- Mock-only validation in place of real CLI/runtime verification

## Key User Jobs

| User Job | Current Surface | Source |
| --- | --- | --- |
| Ask the agent a question interactively | `orca chat`, default no-subcommand entry | `src/commands/chat.ts`, `src/program.ts` |
| Run a structured debugging / rubber-duck-style reflection pass | `orca reflect`, `/reflect`, `/mode reflect` | `src/commands/chat.ts`, `src/commands/reflect-mode.ts`, `src/modes/registry.ts` |
| Execute a coding task | `orca run` | `src/commands/run.ts` |
| Compare or combine models | `orca council`, `orca race`, `orca pipeline` | `src/commands/multi.ts`, `src/multi-model.ts` |
| Inspect providers and routing | `orca providers` | `src/commands/providers.ts` |
| Review saved state and cost | `orca session`, `orca stats` | `src/commands/session.ts`, `src/commands/stats.ts` |
| Track detached work | `run_background`, `/jobs` | `src/tools.ts`, `src/background-jobs.ts`, `src/commands/chat.ts` |
| Review pull requests | `orca pr` | `src/commands/pr.ts` |
| Expose a headless agent server | `orca serve` | `src/commands/serve.ts` |
| Benchmark the runtime | `orca bench` | `src/commands/bench.ts` |

## Core Capabilities

- Provider-neutral config and endpoint resolution
- OpenAI-compatible transport bridge
- Agent tool loop and runtime orchestration
- Multi-model council, race, and pipeline execution
- Reflect mode for Socratic debugging and root-cause investigation
- Hook loading and lifecycle execution
- Session persistence and usage tracking
- CLI output rendering and markdown streaming
- Slash-command autocomplete that yields to full command submission once the user starts typing arguments
- Theme preference persistence that suppresses first-launch onboarding once `ORCA_THEME` or `~/.orca/theme` is already set
- Tool argument coercion for model-emitted string values
- Oversized tool result persistence with artifact paths
- Background job tracking with completion notifications
- Provider-aware model catalog with context/pricing/caution metadata
- Provider command and startup surfaces that expose the same model metadata before a session begins
- Conservative reflect auto-triggering for clear debugging/explanation prompts in standard chat flows
- Centralized local runtime logging with a CLI log viewer
- A doctor-style diagnostics surface for config/runtime/provider health
- Explicit malformed-config diagnostics for local JSON config files
- Headless server endpoints that surface the same runtime/provider diagnostics as the CLI
- A unified stats dashboard that combines usage, runtime health, and recent error signals

## Success Signals

- `npm test` stays green for runtime, tool, hook, and multi-model suites
- `npm run eval:fast`, `npm run eval:nightly`, and `npm run eval:release` provide reproducible gate artifacts under `agent-eval/runs/`
- `README.md` matches actual command surface and provider/model claims
- Project docs under `doc/00_project/initiative_orca/` remain current with source layout
- Future feature work lands without reintroducing single-provider coupling

## Large-Scale Test Expansion Initiative (2026-04-14)

- Baseline: the current measured automated baseline is `1280/1280` passing tests from `npm test`; the planning track started from `1263/1263`, and historical flat docs no longer reflect the canonical total.
- Outcome target:
  1. Fast gate: `550-650` selected deterministic cases + `12` task-eval scenarios
  2. Nightly gate: `~1700` deterministic cases + `36` task-eval scenarios
  3. Release gate: `~2210` deterministic cases + `72` task-eval scenarios backed by `10-12` reusable graders
- Breadth priorities:
  1. command / flag / help / program registration matrix
  2. provider / model / config / doctor / stats / providers matrix
  3. REPL / ink input / session / background-job / output matrix
  4. serve / headless / IDE integration matrix
- Depth priorities:
  1. long-horizon agent loop and retry / recovery flows
  2. multi-step bug-fix / feature / refactor scenarios
  3. adversarial, malformed-input, and safety boundary scenarios
  4. large-codebase and multi-model arbitration workflows
- Immediate command-surface gaps to close first:
  1. `pr`
  2. `session`
  3. `serve`
  4. `run`
  5. `providers test`
  6. root/bin and packaging entrypoints
- Landed gate system:
  1. `agent-eval/manifests/{fast,nightly,release}.json` define the tiered bundles
  2. `agent-eval/scripts/run-gate.py` is the shared manifest runner
  3. `npm run eval:fast|nightly|release` are the canonical maintainer entrypoints
  4. release verification now records a CLI journey artifact in each run directory
- Quality gates:
  1. Fast gate: targeted critical-path suites and doc / metadata parity checks
  2. Nightly gate: full Vitest corpus plus deep scenario tranches
  3. Release gate: nightly gate + `npm run build` + `npm run bench` + task-eval run pack + manual CLI journey review + packaging/bin smokes

## Current Risks

- Legacy flat docs in `doc/` can drift from current project-level canonical docs
- Marketing-style counts in README/docs can become stale as tool/provider inventories evolve
- Provider routing complexity can leak across unrelated modules if not kept centralized
- Some Hermes-inspired ergonomics are currently Orca-local and not yet extracted to the shared SDK
- Test counts can grow faster than signal unless gate tiers and task-based eval ownership stay explicit
- Operator-facing command contracts can remain under-tested even while total suite size keeps rising
- Gate definitions can drift from task/grader assets unless manifest integrity stays under test

## Immediate Priorities

1. Keep the new project-level documentation tree as the canonical operating surface.
2. Maintain command/runtime verification discipline (`lint`, `test`, `build`, bench when relevant).
3. Consolidate future architecture and UX updates in the initiative docs instead of adding more flat reference files.
4. Internalize high-value Hermes runtime behavior where the boundary is clearly CLI/runtime focused.
5. Turn the current `1280`-test baseline into a tiered breadth/depth expansion program instead of continuing ad hoc suite growth.
6. Keep the manifest-based eval system canonical so release verification is reproducible instead of ad hoc shell history.

## REPL Multimodal Image Paths (2026-04-20)

### User Problem

- `orca chat --image ...` worked for one-shot prompts, but the interactive REPL could not actually attach local screenshots or multiple images.
- Dragging or pasting image file paths into the REPL caused them to be treated as plain text or file-expanded blobs, so the model said it could not see the screenshot content.

### Requirements

- Support arbitrary local image paths in normal REPL prompts.
- Support multiple images in a single turn.
- Keep quoted paths and shell-escaped spaces working.
- Preserve the image parts in proxy-path conversation history.

### Acceptance

- REPL image-path turns produce multimodal `PromptContent` on the proxy path.
- Multiple image paths in one turn are attached together.
- Text file expansion skips image paths that were promoted to attachments.
- Full verification passes (`lint`, `test`, `build`, `bench`).
