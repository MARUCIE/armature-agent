# Orca CLI PDCA Iteration Checklist

## 2026-04-29 - SOTA Swarm Audit Tranche

| Gate | Result | Evidence |
| --- | --- | --- |
| Plan | Pass | `SOTA_GAP_SWARM_AUDIT.md` milestones and atomic task queue |
| Do | Pass | Hook trust hardening, network-tool approval/guard, `orca queue list/show/follow/takeover/evidence`, `serve /chat` canonical TaskRun records, `orca run` default/goal-loop/mission/plan TaskRun records, shared slash-command registry, release evidence snapshot guard, CI gate integrity, clean-index command baseline |
| Check | Pass | `npm run lint`, `npm run build`, `npm test` -> `88` files / `1611` tests |
| Act | Pass | ORCA-SWARM-014 completed; HomePanel consumer deferred to UI-baseline split; remaining queue shifts to chat REPL execution contract and Ink evidence UX |

## Baseline Checklist

- [x] Confirm `PROJECT_DIR`
- [x] Establish project-level `AGENTS.md` / `CLAUDE.md` / `CODEX.md` / `GEMINI.md`
- [x] Create canonical project doc tree under `doc/00_project/initiative_orca/`
- [x] Write path index and architecture / UX summaries from actual source files
- [x] Capture initial rolling requirement entry
- [x] Run repo-level verification for this bootstrap task (`npm run lint`, `npm test`)
- [x] Run task-specific code verification for the current swarm-audit closeout (`eval:nightly`, `eval:release`, targeted runner regressions)
- [x] Perform simulated manual UX verification for current user-facing continuity/trust surfaces (`outputs/manual-cli-smoke/run-20260421-154536/`)

## Large-Scale Test Expansion Planning

- [x] Measure and refresh the current deterministic baseline (`npm test` => `1553/1553`, up from the planning-start `1263/1263`)
- [x] Generate repo-root `AGENT_EVAL_PLAN.md`
- [x] Define breadth lanes, depth lanes, and fast / nightly / release gates in canonical docs
- [x] Identify the first command-surface gap tranche (`pr`, `session`, `serve`, `run`, `providers test`, root/bin, packaging)
- [x] Scaffold `agent-eval/` tasks and graders (`ai agent-eval /Users/mauricewen/Projects/orca-cli init --owner "Maurice"`)
- [x] Add the first breadth tranche to the deterministic suite
- [x] Add the first depth tranche to the deterministic suite
- [x] Add packaging / install / bin-entry release smokes
- [x] Record release-gate evidence in `deliverable.md` and `notes.md`
- [x] Perform simulated manual CLI journey verification for the release gate

## SOTA Experience Program

- [x] Create a competitive research baseline across Claude Code, Codex, Amp, Kilo Code, OpenCode, and GitHub Copilot
- [x] Write canonical competitive report (`SOTA_EXPERIENCE_GAP_REPORT.md`)
- [x] Add human-readable HTML companion (`SOTA_EXPERIENCE_GAP_REPORT.html`)
- [x] Convert competitive findings into wave-based PDCA priorities
- [x] Execute a swarm audit to tighten the benchmark into continuity / queue / evidence / trust work items (`SOTA_GAP_SWARM_AUDIT.md`)
- [x] Finish Wave 0 picker/search-picker/operator-shell UX tranche
- [x] Execute Wave 1 session lifecycle productization
- [x] Execute Wave 2 approval / trust UX productization
- [x] Execute Wave 3 workflow preset productization
- [ ] Execute Wave 4 remote / IDE / web continuity tranche
- [ ] Add visible performance instrumentation wave

## One-click Full Delivery Pass (2026-04-22)

- [x] Establish delivery boundary and explicit P0/P1 acceptance items
- [x] Generate stage plan for `Spec`, `Build`, `Test`, `Security`, `Release`, `Observe`, `Learn`
- [x] Run parallel planning / verification / review / security subagent lanes
- [x] Convert review/security findings into blocking release gates
- [x] Fix scoped blockers and rerun targeted verification
- [x] Refresh full verification chain (`lint`, `test`, `build`, `test:matrix`, `eval:nightly`, `eval:release`)
- [x] Refresh security / pack / bench evidence into `outputs/<stage>/`
- [x] Generate executable rollback path for repo-impacting changes
- [x] Record supervision rounds (`hypothesis → action → validation → learning → next`)
- [x] Close deliverable with remaining-risk owners, deadlines, and mitigations
