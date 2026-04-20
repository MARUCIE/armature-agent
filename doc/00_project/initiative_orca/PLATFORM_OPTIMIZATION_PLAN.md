# Orca CLI Platform Optimization Plan

## Objective

Keep Orca CLI maintainable as a fast-moving CLI runtime while preventing drift across docs, command surfaces, and provider-routing behavior.

## Current Optimization Targets

| Area | Current State | Next Step |
| --- | --- | --- |
| Governance entry files | Root guidance files now exist | Keep `CLAUDE.md` canonical and keep `CODEX.md` / `GEMINI.md` as thin references rather than duplicated copies |
| Project docs structure | Flat legacy docs plus new initiative tree | Use `doc/00_project/initiative_orca/` as canonical source going forward |
| Runtime state hygiene | `.omx/` existed as untracked runtime state | Ignore `.omx/` in git and keep runtime state out of source control |
| Hermes-inspired runtime ergonomics | Orca lacked detached-job and oversized-result UX | Keep high-value runtime resilience features in Orca where no gateway abstraction is required |
| Model switching ergonomics | `/models` was a hard-coded list with weak runtime hints | Keep provider-aware model metadata in a single catalog instead of scattering it across REPL code |
| Provider inspection ergonomics | `orca providers` only showed a thin readiness table | Reuse the same model catalog so provider inspection and REPL selection stay consistent |
| Runtime diagnostics | Warnings/errors were terminal-only and ephemeral | Persist local logs and expose them through a simple CLI log surface |
| Health-check ergonomics | Runtime state required manual inspection across config, hooks, MCP, and sessions | Add a single doctor-style command for local diagnostics |
| Config failure visibility | Malformed JSON config could degrade into scattered warnings | Surface config parse failures directly in doctor output |
| Headless parity | `orca serve` originally exposed a thin status surface | Reuse doctor/model metadata in server endpoints instead of inventing a second observability model |
| Stats visibility | `orca stats` only covered usage/cost | Merge runtime health and error signals into the stats surface |
| REPL interaction ergonomics | Slash autocomplete can hijack Enter after arguments begin, and theme onboarding can ignore persisted choice | Keep autocomplete token-scoped and honor saved theme preference before showing first-launch UI |
| Debugging reflection ergonomics | Standard chat can jump too quickly from symptom to rewrite | Add explicit `reflect` surfaces plus conservative auto-triggering that restructures debugging/explanation asks into evidence-backed diagnosis |
| Command/document parity | README can drift from actual registrations | Treat `src/program.ts` as source of truth and update docs in the same task |
| Architecture visibility | Historical architecture doc existed, but not repo-specific canonical doc | Maintain `SYSTEM_ARCHITECTURE.md` and `USER_EXPERIENCE_MAP.md` as live docs |
| Verification discipline | Tests exist but repo-level process docs were missing | Keep task-level verification logged in `deliverable.md` and `notes.md` |
| Test architecture scaling | The suite has grown to `1280` passing tests, and gate tiers/task-based eval are now executable, but the nightly/release matrix still needs more task inventory | Split growth into fast / nightly / release gates, prioritize command-surface gaps (`pr/session/serve/run/providers test/root/bin`), and back the scenario layer with `AGENT_EVAL_PLAN.md` |
| Eval system reproducibility | Fast-gate assets existed, but gate execution still depended on one-off scripts and operator memory | Keep `agent-eval/manifests/*.json` and `agent-eval/scripts/run-gate.py` as the canonical release-quality gate system |
| HTML companion drift | Hand-maintained summaries can diverge from Markdown | Regenerate planning/architecture HTML companions from the canonical `.md` source |

## Planned Improvements

1. Migrate future architecture/product updates into the initiative docs instead of adding new flat docs.
2. Keep provider/model/tool count claims sourced from code or explicitly dated when narrative docs summarize them.
3. Add release-time doc verification to ensure README and canonical docs stay aligned with command registration.
4. Expand headless/API documentation when `orca serve` grows beyond current HTTP + SSE scope.
5. Move active test-growth goals out of historical flat docs and into PDCA + `AGENT_EVAL_PLAN.md`.
6. Grow the quality program by matrix lane so count increases stay tied to signal and ownership.
7. Keep release evidence under `agent-eval/runs/<run_id>/` so build / bench / black-box / CLI journey data stay reviewable after the terminal session ends.
8. Keep reflect heuristics conservative, deduped, and documented so prompt-intent routing stays helpful rather than noisy.

## REPL Multimodal Completion (2026-04-20)

### Completed
| ID | Change | Impact | Status |
|----|--------|--------|--------|
| MM-R1 | Detect embedded image paths in REPL prompts | screenshots can be attached without `--image` | DONE |
| MM-R2 | Support multiple image attachments in a single turn | compare/reference multi-image workflows now work in REPL | DONE |
| MM-R3 | Preserve multimodal user turns in proxy history | follow-up questions can still reference the attached images | DONE |

### Remaining
| Risk | Current State | Mitigation |
|------|---------------|------------|
| Clipboard image paste | still unsupported in ink REPL | user must reference local image files for now |

## Guardrails

- No backward-compatibility shims for obsolete surfaces
- No mock-only validation
- No manual edits in `dist/`
- No new dependency added without explicit request
