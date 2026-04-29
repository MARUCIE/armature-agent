# Orca CLI PDCA Execution Plan

## 2026-04-29 - Queue and Swarm PDCA Execution

- Audit source: `SOTA_GAP_SWARM_AUDIT.md`
- Plan source: `task_plan.md`
- Done tranche:
  - explicit project hook trust
  - hook env allowlist
  - `fetch_url` / `web_search` approval gating
  - private/loopback `fetch_url` guard
  - `orca queue list/show/follow/takeover/evidence`
  - `serve /chat` canonical `WorkSession` / `TaskRun` records
- Check evidence:
  - `npm run lint`
  - `npm run build`
  - `npm test` -> `86` files / `1602` tests
  - `npm test -- tests/queue-command.test.ts tests/work-session-store.test.ts` -> `11` tests
- Act queue:
  - complete unified execution contract for remaining chat/mission/planner paths
  - Ink evidence side panel and approvals timeline
  - CI gate integrity

## Plan

- Use the initiative docs as the single project-level planning surface.
- Ground architecture and UX descriptions in actual source files.
- Lock the real current baseline (`1280/1280` in the latest full run) before proposing any new test-growth target.
- Define separate breadth lanes, depth lanes, and fast / nightly / release gates so the large-scale quality program stays auditable.
- Use `SOTA_EXPERIENCE_GAP_REPORT.md` as the canonical competitive-gap source before choosing the next Orca UX tranche.
- Use `SOTA_GAP_SWARM_AUDIT.md` to tighten the benchmark into concrete continuity / queue / evidence / trust work items.
- Prioritize operator-surface deltas over isolated command additions:
  1. session lifecycle productization
  2. approval / trust UX
  3. inspect-and-act detail panels
  4. remote / IDE / web continuity

## Do

- Implement changes in `src/` or tests as required by the active task.
- Update project docs in the same task when system boundaries or user flows change.
- Fill `AGENT_EVAL_PLAN.md` with Orca-specific task / grader / evidence requirements.
- Scaffold `agent-eval/` and add new deterministic suites by matrix lane rather than through ad hoc file growth.
- Execute the SOTA experience program in waves:
  - Wave 0: unified picker + searchable picker + shared picker shell
  - Wave 1: fork/share/export/import/handoff + inspect detail panels
  - Wave 2: explicit approval / sandbox policy surface
  - Wave 3: workflow presets (`review`, `debug`, `ship`, `research`, `quick assist`)
  - Wave 4: remote / web / IDE continuity
  - Wave 5: visible performance instrumentation

## Check

- Default: `npm run lint` and `npm test`
- Add `npm run build` when command assembly or packaging changes
- Add `npm run bench` when benchmark- or capability-facing behavior changes
- Fast gate: `550-650` selected deterministic cases + `12` task-eval scenarios
- Nightly gate: `~1700` deterministic cases + `36` task-eval scenarios
- Release gate: `~2210` deterministic cases + `72` task-eval scenarios + packaging/bin smokes + manual CLI journey review
- Current 2026-04-21 swarm-audit evidence refresh:
  - `agent-eval/runs/20260421-074245-714923/`
  - `agent-eval/runs/20260421-074333-249714/`
  - `outputs/manual-cli-smoke/run-20260421-154536/`

## Act

- Record evidence and residual gaps in `deliverable.md`
- Roll forward requirements and anti-regression notes in `ROLLING_REQUIREMENTS_AND_PROMPTS.md`
- Update `AGENT_EVAL_PLAN.md` whenever task families, grader rules, or gate thresholds change
- Re-rank SOTA gaps after every completed wave so the next tranche is selected from fresh evidence, not stale assumptions
- Treat trust hardening as part of Wave 4 delivery, not as a postscript after continuity work lands.
