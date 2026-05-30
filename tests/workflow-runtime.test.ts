import { describe, it, expect } from 'vitest'
import { runWorkflow } from '../src/workflow/runtime.js'
import type { WorkflowAgentRequest, WorkflowAgentRunner } from '../src/workflow/runner.js'
import { buildSchemaContract, parseSchemaResult } from '../src/workflow/runner.js'

/** Stub runner: echoes the label, or delegates to a provided fn. */
function stubRunner(fn?: (req: WorkflowAgentRequest) => unknown): WorkflowAgentRunner {
  return { run: async (req) => (fn ? fn(req) : `done:${req.label}`) }
}

const META = (name = 'wf') => `export const meta = { name: '${name}', description: 'd' }`

describe('runWorkflow — core', () => {
  it('runs a single agent and returns its result', async () => {
    const run = await runWorkflow(`${META()}\nreturn await agent('hi', { label: 'one' })`, { runner: stubRunner() })
    expect(run.result).toBe('done:one')
    expect(run.agentCount).toBe(1)
    expect(run.meta.name).toBe('wf')
  })

  it('passes agent options through to the runner', async () => {
    const seen: WorkflowAgentRequest[] = []
    const runner = stubRunner((req) => {
      seen.push(req)
      return 'ok'
    })
    await runWorkflow(
      `${META()}\nphase('P')\nreturn await agent('go', { label: 'L', model: 'm1', agentType: 'explore', isolation: 'worktree' })`,
      { runner },
    )
    expect(seen[0]).toMatchObject({ label: 'L', phase: 'P', model: 'm1', agentType: 'explore', isolation: 'worktree' })
  })

  it('records phases', async () => {
    const run = await runWorkflow(`${META()}\nphase('Scan')\nphase('Sum')\nreturn 1`, { runner: stubRunner() })
    expect(run.phases).toEqual(['Scan', 'Sum'])
  })

  it('returns structured objects from the runner unchanged', async () => {
    const obj = { findings: [{ title: 't' }], ok: true }
    const run = await runWorkflow(`${META()}\nreturn await agent('x', { label: 'a' })`, { runner: stubRunner(() => obj) })
    expect(run.result).toEqual(obj)
  })
})

describe('runWorkflow — parallel & pipeline', () => {
  it('runs parallel thunks and returns results in input order', async () => {
    const run = await runWorkflow(
      `${META()}\nreturn await parallel([0,1,2].map(i => () => agent('t'+i, { label: 'a'+i })))`,
      { runner: stubRunner((req) => req.label) },
    )
    expect(run.result).toEqual(['a0', 'a1', 'a2'])
  })

  it('nulls a failed agent but keeps siblings (and logs it)', async () => {
    const runner = stubRunner((req) => {
      if (req.label === 'bad') throw new Error('boom')
      return req.label
    })
    const run = await runWorkflow(
      `${META()}\nreturn await parallel([() => agent('a', { label: 'good' }), () => agent('b', { label: 'bad' })])`,
      { runner },
    )
    expect(run.result).toEqual(['good', null])
    expect(run.logs.some((l) => l.includes('bad') && l.includes('boom'))).toBe(true)
  })

  it('threads items through pipeline stages independently', async () => {
    const run = await runWorkflow(
      `${META()}\nreturn await pipeline([10, 20],
         (n) => n + 1,
         (prev, original, index) => ({ prev, original, index }))`,
      { runner: stubRunner() },
    )
    expect(run.result).toEqual([
      { prev: 11, original: 10, index: 0 },
      { prev: 21, original: 20, index: 1 },
    ])
  })

  it('caps concurrency at the configured limit', async () => {
    let active = 0
    let maxActive = 0
    let releaseGate!: () => void
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve
    })
    const runner: WorkflowAgentRunner = {
      run: async () => {
        active++
        maxActive = Math.max(maxActive, active)
        await gate
        active--
        return 'x'
      },
    }
    const pending = runWorkflow(
      `${META()}\nreturn await parallel([0,1,2,3,4].map(i => () => agent('t'+i)))`,
      { runner, concurrency: 2 },
    )
    await new Promise((resolve) => setImmediate(resolve))
    expect(maxActive).toBe(2)
    releaseGate()
    const run = await pending
    expect((run.result as unknown[]).length).toBe(5)
    expect(maxActive).toBe(2)
  })
})

describe('runWorkflow — budget & abort', () => {
  it('throws when the token budget is exhausted', async () => {
    const runner = stubRunner(() => 'x'.repeat(200))
    await expect(
      runWorkflow(`${META()}\nawait agent('a', { label: '1' })\nreturn await agent('b', { label: '2' })`, {
        runner,
        tokenBudget: 5,
      }),
    ).rejects.toThrow(/budget/)
  })

  it('tracks spend in budget.spent()', async () => {
    const run = await runWorkflow(
      `${META()}\nawait agent('a', { label: '1' })\nreturn budget.spent()`,
      { runner: stubRunner(() => 'abcd') },
    )
    expect(typeof run.result).toBe('number')
    expect(run.result as number).toBeGreaterThan(0)
  })

  it('aborts when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      runWorkflow(`${META()}\nreturn await agent('a', { label: '1' })`, {
        runner: stubRunner(),
        signal: controller.signal,
      }),
    ).rejects.toThrow(/aborted/)
  })
})

describe('structured output helpers', () => {
  it('builds a schema contract that embeds the schema', () => {
    const contract = buildSchemaContract({ type: 'object', required: ['a'] })
    expect(contract).toContain('JSON Schema')
    expect(contract).toContain('"required"')
    expect(contract).toContain('```json')
  })

  it('parses a fenced JSON block and validates required keys', () => {
    const text = 'Here is my answer:\n```json\n{ "a": 1, "b": 2 }\n```\n'
    expect(parseSchemaResult(text, { required: ['a', 'b'] })).toEqual({ a: 1, b: 2 })
  })

  it('parses a bare JSON object when no fence is present', () => {
    expect(parseSchemaResult('result: { "a": 1 } done', { required: ['a'] })).toEqual({ a: 1 })
  })

  it('throws on invalid JSON', () => {
    expect(() => parseSchemaResult('not json at all', {})).toThrow()
  })

  it('throws when a required key is missing', () => {
    expect(() => parseSchemaResult('```json\n{ "a": 1 }\n```', { required: ['a', 'b'] })).toThrow(/missing required keys/)
  })
})

describe('runWorkflow — determinism sandbox', () => {
  const wf = (expr: string) => `${META()}\nreturn ${expr}`

  it('blocks bracket-access Math.random at runtime', async () => {
    await expect(runWorkflow(wf(`Math['ra'+'ndom']()`), { runner: stubRunner() })).rejects.toThrow(/deterministic/)
  })

  it('blocks bracket-access Date.now and Date construction at runtime', async () => {
    await expect(runWorkflow(wf(`Date['now']()`), { runner: stubRunner() })).rejects.toThrow(/deterministic/)
    await expect(runWorkflow(wf('new Date(0)'), { runner: stubRunner() })).rejects.toThrow(/deterministic/)
  })

  it('rejects dot-access Date.now()/Math.random() at parse time', async () => {
    await expect(runWorkflow(wf('Date.now()'), { runner: stubRunner() })).rejects.toThrow(/deterministic/)
    await expect(runWorkflow(wf('Math.random()'), { runner: stubRunner() })).rejects.toThrow(/deterministic/)
  })

  it('preserves deterministic Math operations', async () => {
    const run = await runWorkflow(wf('Math.floor(3.7) + Math.max(1, 2, 3)'), { runner: stubRunner() })
    expect(run.result).toBe(6)
  })

  it('does not expose require/import/process internals', async () => {
    const run = await runWorkflow(wf('typeof require'), { runner: stubRunner() })
    expect(run.result).toBe('undefined')
  })
})

describe('runWorkflow — robustness', () => {
  it('catches a synchronous throw inside a parallel thunk and nulls it', async () => {
    const run = await runWorkflow(
      `${META()}\nreturn await parallel([() => { throw new Error('sync') }, () => agent('ok', { label: 'k' })])`,
      { runner: stubRunner((r) => r.label) },
    )
    expect(run.result).toEqual([null, 'k'])
    expect(run.logs.some((l) => l.includes('parallel[0]'))).toBe(true)
  })

  it('nulls a single pipeline item whose stage throws, keeping siblings', async () => {
    const run = await runWorkflow(
      `${META()}\nreturn await pipeline([1, 2, 3], (n) => { if (n === 2) throw new Error('boom'); return n * 10 })`,
      { runner: stubRunner() },
    )
    expect(run.result).toEqual([10, null, 30])
  })

  it('handles a large fan-out within the concurrency cap', async () => {
    const run = await runWorkflow(
      `${META()}\nreturn (await parallel(Array.from({ length: 30 }, (_, i) => () => agent('t'+i, { label: 'a'+i })))).length`,
      { runner: stubRunner(), concurrency: 4 },
    )
    expect(run.result).toBe(30)
    expect(run.agentCount).toBe(30)
  })

  it('returns empty arrays for empty parallel/pipeline', async () => {
    const run = await runWorkflow(
      `${META()}\nconst a = await parallel([])\nconst b = await pipeline([], x => x)\nreturn { a, b }`,
      { runner: stubRunner() },
    )
    expect(run.result).toEqual({ a: [], b: [] })
  })

  it('rejects parallel() given promises instead of thunks', async () => {
    await expect(
      runWorkflow(`${META()}\nreturn await parallel([agent('x', { label: 'l' })])`, { runner: stubRunner() }),
    ).rejects.toThrow(/array of functions/)
  })

  it('rejects pipeline() given a non-array', async () => {
    await expect(
      runWorkflow(`${META()}\nreturn await pipeline('nope', x => x)`, { runner: stubRunner() }),
    ).rejects.toThrow(/expects an array/)
  })

  it('aborts mid-flight after the signal flips between agents', async () => {
    const controller = new AbortController()
    const runner = stubRunner((req) => {
      if (req.label === 'trigger') controller.abort()
      return req.label
    })
    await expect(
      runWorkflow(
        `${META()}\nawait agent('a', { label: 'trigger' })\nreturn await agent('b', { label: 'after' })`,
        { runner, signal: controller.signal },
      ),
    ).rejects.toThrow(/aborted/)
  })

  it('exposes args and captures log() output', async () => {
    const run = await runWorkflow(
      `${META()}\nlog('hello')\nreturn args.value * 2`,
      { runner: stubRunner(), args: { value: 21 } },
    )
    expect(run.result).toBe(42)
    expect(run.logs).toContain('hello')
  })

  it('supports nested parallel-inside-pipeline (the canonical review shape)', async () => {
    const run = await runWorkflow(
      `${META()}\nreturn await pipeline([{ n: 'x' }, { n: 'y' }],
         d => agent('review ' + d.n, { label: 'review:' + d.n, phase: 'Review' }),
         (review, original) => parallel([0, 1].map(i =>
           () => agent('verify ' + original.n + ':' + i, { label: 'verify:' + original.n + ':' + i, phase: 'Verify' }))))`,
      { runner: stubRunner((r) => r.label) },
    )
    expect(run.result).toEqual([
      ['verify:x:0', 'verify:x:1'],
      ['verify:y:0', 'verify:y:1'],
    ])
    // 2 reviews + 4 verifies = 6 sub-agents.
    expect(run.agentCount).toBe(6)
  })
})
