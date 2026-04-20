# Orca CLI PDCA Iteration Checklist

## Baseline Checklist

- [x] Confirm `PROJECT_DIR`
- [x] Establish project-level `AGENTS.md` / `CLAUDE.md` / `CODEX.md` / `GEMINI.md`
- [x] Create canonical project doc tree under `doc/00_project/initiative_orca/`
- [x] Write path index and architecture / UX summaries from actual source files
- [x] Capture initial rolling requirement entry
- [x] Run repo-level verification for this bootstrap task (`npm run lint`, `npm test`)
- [ ] Run task-specific code verification for future feature changes
- [ ] Perform simulated manual UX verification for future user-facing behavior changes

## Large-Scale Test Expansion Planning

- [x] Measure and refresh the current deterministic baseline (`npm test` => `1280/1280`, up from the planning-start `1263/1263`)
- [x] Generate repo-root `AGENT_EVAL_PLAN.md`
- [x] Define breadth lanes, depth lanes, and fast / nightly / release gates in canonical docs
- [x] Identify the first command-surface gap tranche (`pr`, `session`, `serve`, `run`, `providers test`, root/bin, packaging)
- [x] Scaffold `agent-eval/` tasks and graders (`ai agent-eval /Users/mauricewen/Projects/orca-cli init --owner "Maurice"`)
- [x] Add the first breadth tranche to the deterministic suite
- [x] Add the first depth tranche to the deterministic suite
- [x] Add packaging / install / bin-entry release smokes
- [x] Record release-gate evidence in `deliverable.md` and `notes.md`
- [ ] Perform simulated manual CLI journey verification for the release gate
