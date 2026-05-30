# Dynamic Workflows in Orca CLI

> A `workflow` tool that lets the model write a small, deterministic JavaScript
> orchestration script which fans work out across many isolated sub-agents, then
> synthesizes the results — the Orca port of Claude Code's *dynamic workflows*
> and the [`pi-dynamic-workflows`](https://github.com/Michaelliv/pi-dynamic-workflows)
> prototype.

## Why

Orca already spawns **one** sub-agent per tool call (`spawn_agent` /
`delegate_task`, backed by `spawnSubAgent` → a forked child process running a
full agentic loop). What it lacked was a *deterministic orchestration layer*:
the ability for the model to express, in code, "run these 8 reviews in parallel,
then adversarially verify each finding as soon as its review lands, then
synthesize." That control flow — loops, conditionals, fan-out, fan-in — belongs
in a script the model writes, not in prose it improvises turn by turn.

This is the same primitive Anthropic shipped as *dynamic workflows in Claude
Code* and that `pi-dynamic-workflows` ported to Pi. Orca now has it too.

## What maps onto what

| Reference (`pi-dynamic-workflows`) | Orca |
| --- | --- |
| `WorkflowAgent` — in-memory Pi subagent session per `agent()` | `OrcaWorkflowAgentRunner` — forked child process per `agent()` via `spawnSubAgent` (stronger isolation) |
| `createStructuredOutputTool` — terminating `structured_output` tool | JSON output-contract appended to the prompt + parsed/validated return (v1 adaptation; the worker IPC stays text) |
| acorn AST literal validation of `meta` | identical (acorn) |
| `vm` sandbox + whitelisted globals | identical |
| `parallel` / `pipeline` / `phase` / `log` / `budget` | identical semantics |
| `isolation: 'worktree'` | mapped to Orca's `WorktreeManager` |

The engine is decoupled from the executor through a `WorkflowAgentRunner`
interface, so `runWorkflow()` is unit-testable with a stub runner — no real LLM
call needed to prove `parallel`/`pipeline`/`phase`/`budget`/abort semantics.

## Architecture

```
model writes a workflow script
  → workflow tool (TOOL_DEFINITIONS, handled in handleSpecialProxyTool)
    → parseWorkflowScript()  — acorn: meta must be a literal, first statement
    → runWorkflow(script, { runner, args, signal, onPhase, onAgentStart/End })
      → vm sandbox runs the body with injected globals:
         agent() parallel() pipeline() phase() log() args budget
      → each agent() → runner.run(req) → spawnSubAgent(child process)
         (schema → JSON contract; isolation:'worktree' → WorktreeManager)
      → live progress snapshots stream to the REPL
    → final result serialized back to the parent assistant
```

### Files (`src/workflow/`)

| File | Purpose |
| --- | --- |
| `parser.ts` | acorn-backed parser: determinism blocklist + literal `meta` validation + clean body extraction. Exports the shared types. |
| `runtime.ts` | `runWorkflow()` — vm sandbox + `agent`/`parallel`/`pipeline`/`phase`/`log`/`budget` globals + concurrency limiter + JSON structured-output contract. |
| `display.ts` | Workflow progress snapshot model + compact text renderer (phase groups, `✓`/`✗`/`⋯` agent lines). |
| `runner.ts` | `WorkflowAgentRunner` interface + `OrcaWorkflowAgentRunner` bridge onto `spawnSubAgent` / `WorktreeManager`. |
| `index.ts` | Barrel exports. |

### Integration points

- `src/tools.ts` — `workflow` added to `TOOL_DEFINITIONS`.
- `src/commands/chat-proxy-tool-call.ts` — `workflow` branch in
  `handleSpecialProxyTool`, threading `params.resolved` (model/apiKey/baseURL)
  into the runner and streaming progress to the session.
- `src/system-prompt.ts` — a "Dynamic Workflows" authoring guide so the model
  knows the script shape and when to reach for it.

## Determinism rules (enforced)

Workflow scripts run inside a Node `vm`. Intentionally unavailable:
`Date.now()`, `new Date()`, `Math.random()`, `require`, `import`, `fs`, network.
`meta` must be a pure literal (no spread, computed keys, template interpolation,
or function calls) and must be the first statement. These keep `meta` parseable
and runs reproducible (a prerequisite for future resumable runs).

Determinism is enforced at **two layers**, because a parse-time blocklist alone
is bypassable:

1. **Parse time** (`parser.ts`) — a regex blocklist rejects dot-access
   `Date.now()`, `new Date()`, `Math.random()` before the script ever runs.
   This catches the common case with a clear error.
2. **Run time** (`runtime.ts`) — the `vm` context binds `Math` and `Date` to
   **frozen deterministic stubs**. `Math` is a frozen clone whose `.random`
   throws; `Date` is a frozen function whose construction and `.now` throw. This
   closes the bracket-access bypass (`Math['ra'+'ndom']()`, `Date['now']()`,
   `new Date(0)`) that the static blocklist cannot see. Deterministic `Math`
   (`floor`, `max`, …) stays fully usable.

The two-layer design is the lesson of the falsification pass: the parse-time
regex was provably evadable, so the actual guarantee had to live in the runtime
binding, not the text scan.

## Threat model (what the sandbox is and is not)

The `vm` is a **determinism guardrail and accident-preventer for a trusted,
model-authored script** — not an adversarial sandbox. The script author is Orca's
own model, and the real isolation boundary is the **forked sub-agent child
process** that each `agent()` call crosses. In scope: blocking nondeterminism,
hiding `require`/`import`/`fs`/network from casual scripts, capping concurrency
and token budget. Explicitly **out of scope**: defeating a deliberately hostile
script (e.g. a constructor-chain escape via `Array.constructor`). If untrusted
third parties could author workflow scripts, this layer would need a real
isolate (separate process / `vm2`-class boundary), not Node's `vm`.

## Script shape

```js
export const meta = {
  name: 'review_changes',
  description: 'Review changed files across dimensions, verify each finding',
  phases: [{ title: 'Review' }, { title: 'Verify' }],
}

const DIMENSIONS = [
  { key: 'bugs', prompt: 'Find correctness bugs in the diff.' },
  { key: 'perf', prompt: 'Find performance regressions in the diff.' },
]

const results = await pipeline(
  DIMENSIONS,
  d => agent(d.prompt, { label: `review:${d.key}`, phase: 'Review', schema: FINDINGS }),
  review => parallel((review.findings ?? []).map(f => () =>
    agent(`Adversarially verify: ${f.title}`, { label: `verify`, phase: 'Verify', schema: VERDICT })
      .then(v => ({ ...f, verdict: v })))),
)

return { confirmed: results.flat().filter(Boolean).filter(f => f.verdict?.isReal) }
```

### Globals

| Global | Description |
| --- | --- |
| `agent(prompt, opts?)` | Spawn one isolated sub-agent. Returns its final text, or — with `opts.schema` — a validated object. Returns `null` on failure (filter with `.filter(Boolean)`). |
| `parallel(thunks)` | Run `() => agent(...)` thunks concurrently (barrier). Failures resolve to `null`. |
| `pipeline(items, ...stages)` | Run each item through stages independently, no barrier between stages. Each stage gets `(prev, original, index)`. |
| `phase(title)` | Mark the current phase for the progress view. |
| `log(message)` | Emit a workflow-level log line. |
| `args` | The JSON value passed via the tool's `args` parameter. |
| `budget` | `{ total, spent(), remaining() }` token budget tracker. |

`opts`: `{ label?, phase?, schema?, model?, isolation?: 'worktree', agentType? }`.

## v1 limitations (honest scope)

- **Structured output is JSON-in-text**, not a terminating tool call. The
  sub-agent is instructed to end with a single fenced JSON object matching the
  schema; the runtime strips the fence and `JSON.parse`s it, then checks
  `required` keys. A malformed return surfaces as a parse error the model can
  react to. (Pi's terminating `structured_output` tool is stronger; adopting it
  in Orca means extending the `sub-agent` IPC protocol — deferred.)
- **No persisted or resumable runs**, and no `/workflows` manager UI yet. The
  determinism rules are already in place so resume can be added without a
  rewrite.
- **Concurrency** is capped at `min(16, cores-2)` per workflow, same as the
  reference.

## Large-scale verification (closure proof)

The feature was driven to closure with a **falsification-first** pass — actively
seeking disconfirming evidence rather than confirmation. Layers proven:

| Layer | How | Evidence |
| --- | --- | --- |
| Parser (accept/reject) | `tests/workflow-parser.test.ts` incl. adversarial edges | green |
| Runtime semantics | `tests/workflow-runtime.test.ts` — parallel/pipeline/phase/budget/abort/robustness with a **stub runner** | green |
| Determinism sandbox | runtime stubs block bracket-access `Math.random`/`Date` | green |
| Runner dispatch + worktree | `tests/workflow-runner.test.ts` — mock `spawnSubAgent` + **real git** worktree create/cleanup | green |
| Tool wiring (yolo gate, hooks, fan-out, context threading) | `tests/chat-proxy-tool-call.test.ts` workflow block | green |
| **Real end-to-end closure** | `tests/workflow-e2e-real.test.ts` (gated by `ORCA_E2E_REAL=1`) drives real `spawnSubAgent` → real `poe/claude-opus-4.6` | **green** |

Two real-provider runs proved the riskiest paths the stubs cannot:

- **Parallel fan-out**: two real sub-agents asked for `ALPHA` / `BETA` returned
  both strings; the workflow synthesized them. The loop closed across the forked
  process boundary and a live LLM call.
- **Structured output**: a schema'd agent ("Eiffel Tower city/country, return
  JSON") produced `{"city":"Paris","country":"France"}` — the real model emitted
  fenced JSON, the runtime stripped, parsed, and validated `required` keys.

### Falsification finding — the `src/` vs `dist/` worker-path coupling

The first real e2e run **failed**: both sub-agents nulled out. Root cause —
`spawnSubAgent` resolves its worker via `import.meta.url` +
`'sub-agent-worker.js'`. Run through the TS source (vitest's default
`../src/...` resolution), `import.meta.url` lands in `src/`, where only
`sub-agent-worker.ts` exists — the compiled `.js` worker lives only in `dist/`.
So the fork targeted a non-existent file and every sub-agent failed to start.
This is a **test-harness artifact, not a product bug**: production always runs
from `dist/`. The fix: the gated e2e dynamic-imports the runtime from `dist/`
(inside the test body, so collection never touches the build). A direct `dist/`
repro returning `"ALPHA"` confirmed the production path was correct all along.
The stub unit tests never saw this because they `vi.mock` `spawnSubAgent` away —
only a real run crossing the process boundary exposes the path coupling.

### Verification snapshot

`npm test` → `97` files / `1776` tests green (+ 1 `ORCA_E2E_REAL`-gated test,
skipped by default). The one intermittent failure under full parallel load
(`test-matrix-runner.test.ts`) is a pre-existing environmental flake — it passes
8/8 in isolation and is unrelated to this feature. `release-evidence.test.ts`
and its 7 coupled doc surfaces were realigned to the new counts.

## Atomic execution queue

- [x] A1. Add `acorn` dependency; confirm install + `tsc` clean baseline.
- [x] A2. `src/workflow/parser.ts` — types + `parseWorkflowScript` (determinism + literal meta).
- [x] A3. `src/workflow/runner.ts` — `WorkflowAgentRunner` interface + `OrcaWorkflowAgentRunner`.
- [x] A4. `src/workflow/runtime.ts` — `runWorkflow` + globals + limiter + JSON structured output.
- [x] A5. `src/workflow/display.ts` — snapshot + compact renderer.
- [x] A6. `src/workflow/index.ts` — barrel.
- [x] A7. `src/tools.ts` — register `workflow` tool.
- [x] A8. `src/commands/chat-proxy-tool-call.ts` — `workflow` special-tool branch.
- [x] A9. `src/system-prompt.ts` — authoring guidance.
- [x] A10. `tests/workflow-parser.test.ts` — accepted/rejected meta shapes.
- [x] A11. `tests/workflow-runtime.test.ts` — parallel/pipeline/phase/budget/abort with stub runner.
- [x] A12. `npx tsc --noEmit` clean + `vitest run` workflow tests pass + CHANGELOG.
- [x] A13. Falsification pass — close the bracket-access determinism bypass with frozen runtime `Math`/`Date` stubs; add determinism + robustness test blocks.
- [x] A14. `tests/workflow-runner.test.ts` — runner dispatch + real-git worktree isolation + structured-output deep edges.
- [x] A15. Real-LLM closure proof — `tests/workflow-e2e-real.test.ts` (gated) drives `spawnSubAgent` → `poe/claude-opus-4.6`; proved parallel fan-out + structured-output paths; fixed the `src/`/`dist/` worker-path coupling.
- [x] A16. Realign `release-evidence` snapshot + 7 coupled doc surfaces to `97` files / `1776` tests; full `npm test` green (flake aside).

---
Maurice | maurice_wen@proton.me
