---
Title: Orca CLI Docs Index
Scope: project docs index
Owner: Maurice
Status: Active
LastUpdated: 2026-05-29
---
# Orca CLI Docs Index

This file is the canonical path index for the `Orca CLI` repository.

## Active Initiative

- Initiative: `doc/00_project/initiative_orca/`
- Scope: project-level governance, architecture, UX flow, delivery planning, and rolling requirements

## Path Index

<!-- AI-FLEET:PATH_INDEX:START -->
| Area | Path | Notes |
| --- | --- | --- |
| Project root | `/Users/mauricewen/Projects/orca-cli` | Git root and canonical `PROJECT_DIR` |
| CLI entry | `src/bin/orca.ts` | Node executable entry point |
| Program assembly | `src/program.ts` | Registers all top-level commands |
| Commands | `src/commands/` | `chat`, `doctor`, `run`, `multi`, `bench`, `logs`, `providers`, `stats`, `session`, `queue`, `permissions`, `pr`, `serve`, `init`, `evolve`, workflow presets |
| Review ledger command | `src/commands/review-ledger.ts` | Multi-model PR/diff review entry that writes human-gated review artifacts |
| Provider bridge | `src/providers/openai-compat.ts` | Provider-neutral runtime transport layer |
| Multi-model engine | `src/multi-model.ts` | Council, race, pipeline orchestration |
| Review ledger engine | `src/review-ledger.ts` | Independent model review prompts, synthesis prompt, and review artifact writer |
| Tool surface | `src/tools.ts` | Agent tools available to the runtime |
| Background job tracking | `src/background-jobs.ts` | Detached job registry, log paths, and completion notifications |
| Runtime logging | `src/logger.ts` | Local `agent.log` / `errors.log` persistence |
| Doctor diagnostics | `src/doctor.ts` | Structured runtime/config/provider diagnostics |
| Runtime config | `src/config.ts` | Provider/model resolution and config loading |
| Hooks | `src/hooks.ts` | Lifecycle hook loader and execution |
| Usage persistence | `src/usage-db.ts` | Usage and cost persistence |
| Tests | `tests/` | Vitest suites for CLI, runtime, hooks, multi-model, and SOTA behavior |
| Quality plan | `AGENT_EVAL_PLAN.md` | Canonical task / grader / gate plan for large-scale CLI evaluation |
| Evaluation assets | `agent-eval/` | Task, grader, manifest, runbook, and run artifacts for black-box CLI evaluation |
| Evaluation manifests | `agent-eval/manifests/` | `fast`, `nightly`, and `release` gate definitions |
| Evaluation scripts | `agent-eval/scripts/` | Shared gate runner, fast wrapper, readiness helpers, and release CLI journey recorder |
| Build output | `dist/` | Generated artifacts, not hand-edited |
| Legacy docs | `doc/THREE_TIER_ARCHITECTURE.md` | Historical architecture inventory |
| Legacy docs | `doc/MULTI_MODEL_COLLABORATION.md` | Design note for council/race/pipeline |
| Legacy docs | `doc/SOTA_TEST_PLAN.md` | Historical test hardening snapshot, not the current canonical baseline |
<!-- AI-FLEET:PATH_INDEX:END -->

## Documentation Layout

- `doc/00_project/index.md`: project initiative list
- `doc/00_project/initiative_orca/`: active project docs and workflow assets
- `doc/*.md`: legacy flat docs retained as references until intentionally migrated

## Notes

- This repository is a CLI product. It has command surfaces rather than web routes.
- Use `USER_EXPERIENCE_MAP.md` for command-entry and user-flow mapping.
- 2026-04-20: REPL now supports multimodal local image-path turns on the proxy path; direct clipboard bitmap paste remains unsupported.

## Changelog

| Date | Change |
| --- | --- |
| 2026-05-29 | Normalized metadata for the project ai check gate and recorded the multi-model review ledger integration. |
