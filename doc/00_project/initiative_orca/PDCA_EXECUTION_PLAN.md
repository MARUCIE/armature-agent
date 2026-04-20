# Orca CLI PDCA Execution Plan

## Plan

- Use the initiative docs as the single project-level planning surface.
- Ground architecture and UX descriptions in actual source files.
- Lock the real current baseline (`1280/1280` in the latest full run) before proposing any new test-growth target.
- Define separate breadth lanes, depth lanes, and fast / nightly / release gates so the large-scale quality program stays auditable.

## Do

- Implement changes in `src/` or tests as required by the active task.
- Update project docs in the same task when system boundaries or user flows change.
- Fill `AGENT_EVAL_PLAN.md` with Orca-specific task / grader / evidence requirements.
- Scaffold `agent-eval/` and add new deterministic suites by matrix lane rather than through ad hoc file growth.

## Check

- Default: `npm run lint` and `npm test`
- Add `npm run build` when command assembly or packaging changes
- Add `npm run bench` when benchmark- or capability-facing behavior changes
- Fast gate: `550-650` selected deterministic cases + `12` task-eval scenarios
- Nightly gate: `~1700` deterministic cases + `36` task-eval scenarios
- Release gate: `~2210` deterministic cases + `72` task-eval scenarios + packaging/bin smokes + manual CLI journey review

## Act

- Record evidence and residual gaps in `deliverable.md`
- Roll forward requirements and anti-regression notes in `ROLLING_REQUIREMENTS_AND_PROMPTS.md`
- Update `AGENT_EVAL_PLAN.md` whenever task families, grader rules, or gate thresholds change
