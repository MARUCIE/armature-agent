import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const mockState = vi.hoisted(() => ({ spawnSubAgent: vi.fn() }))

vi.mock('../src/agent/sub-agent.js', () => ({
  spawnSubAgent: mockState.spawnSubAgent,
  READ_ONLY_TOOLS: ['read_file', 'search_files'],
  DELEGATE_TOOLS: ['read_file', 'write_file', 'run_command'],
}))

import { OrcaWorkflowAgentRunner, buildSchemaContract, parseSchemaResult } from '../src/workflow/runner.js'

const parent = { model: 'parent-model', apiKey: 'k', baseURL: 'https://x.invalid/v1' }

function okResult(output: string) {
  return { success: true, output, tokensUsed: 10, duration: 5 }
}

beforeEach(() => {
  mockState.spawnSubAgent.mockReset()
  mockState.spawnSubAgent.mockResolvedValue(okResult('hello world'))
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('OrcaWorkflowAgentRunner — dispatch', () => {
  it('returns sub-agent text when no schema is set', async () => {
    const runner = new OrcaWorkflowAgentRunner({ cwd: '/tmp', parent })
    const out = await runner.run({ prompt: 'do it', label: 'a' })
    expect(out).toBe('hello world')
  })

  it('passes the parent model/apiKey/baseURL as the spawn context', async () => {
    const runner = new OrcaWorkflowAgentRunner({ cwd: '/tmp', parent })
    await runner.run({ prompt: 'p', label: 'a' })
    expect(mockState.spawnSubAgent).toHaveBeenCalledWith(
      expect.objectContaining({ task: 'p', cwd: '/tmp' }),
      { model: 'parent-model', apiKey: 'k', baseURL: 'https://x.invalid/v1' },
    )
  })

  it('selects READ_ONLY_TOOLS for explore agents and DELEGATE_TOOLS otherwise', async () => {
    const runner = new OrcaWorkflowAgentRunner({ cwd: '/tmp', parent })
    await runner.run({ prompt: 'p', label: 'a', agentType: 'explore' })
    expect(mockState.spawnSubAgent.mock.calls[0][0].tools).toEqual(['read_file', 'search_files'])

    await runner.run({ prompt: 'p', label: 'b' })
    expect(mockState.spawnSubAgent.mock.calls[1][0].tools).toEqual(['read_file', 'write_file', 'run_command'])
  })

  it('forwards a per-agent model override', async () => {
    const runner = new OrcaWorkflowAgentRunner({ cwd: '/tmp', parent })
    await runner.run({ prompt: 'p', label: 'a', model: 'override-model' })
    expect(mockState.spawnSubAgent.mock.calls[0][0].model).toBe('override-model')
  })

  it('appends a JSON schema contract to the prompt when schema is set', async () => {
    mockState.spawnSubAgent.mockResolvedValue(okResult('```json\n{ "ok": true }\n```'))
    const runner = new OrcaWorkflowAgentRunner({ cwd: '/tmp', parent })
    const out = await runner.run({ prompt: 'find things', label: 'a', schema: { required: ['ok'] } })
    const task = mockState.spawnSubAgent.mock.calls[0][0].task as string
    expect(task).toContain('find things')
    expect(task).toContain('JSON Schema')
    expect(out).toEqual({ ok: true })
  })

  it('throws when the sub-agent reports failure (so the engine nulls the result)', async () => {
    mockState.spawnSubAgent.mockResolvedValue({ success: false, output: 'kaboom', tokensUsed: 0, duration: 1 })
    const runner = new OrcaWorkflowAgentRunner({ cwd: '/tmp', parent })
    await expect(runner.run({ prompt: 'p', label: 'a' })).rejects.toThrow(/kaboom/)
  })

  it('throws when schema is set but the sub-agent returns no parseable JSON', async () => {
    mockState.spawnSubAgent.mockResolvedValue(okResult('no json here, sorry'))
    const runner = new OrcaWorkflowAgentRunner({ cwd: '/tmp', parent })
    await expect(runner.run({ prompt: 'p', label: 'a', schema: { required: ['ok'] } })).rejects.toThrow()
  })
})

describe('OrcaWorkflowAgentRunner — worktree isolation (real git)', () => {
  function initRepo(): string {
    const dir = mkdtempSync(join(tmpdir(), 'orca-wf-worktree-'))
    execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' })
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir, stdio: 'ignore' })
    execFileSync('git', ['config', 'user.email', 't@e.invalid'], { cwd: dir, stdio: 'ignore' })
    writeFileSync(join(dir, 'seed.txt'), 'seed\n')
    execFileSync('git', ['add', '.'], { cwd: dir, stdio: 'ignore' })
    execFileSync('git', ['commit', '-m', 'seed'], { cwd: dir, stdio: 'ignore' })
    return dir
  }

  it('runs the sub-agent inside a fresh worktree and cleans it up when no changes are left', async () => {
    const dir = initRepo()
    // Capture the cwd the sub-agent ran in; leave it clean (no writes).
    let ranIn = ''
    mockState.spawnSubAgent.mockImplementation((config: { cwd: string }) => {
      ranIn = config.cwd
      return Promise.resolve(okResult('done'))
    })
    const runner = new OrcaWorkflowAgentRunner({ cwd: dir, parent })
    await runner.run({ prompt: 'p', label: 'wt', isolation: 'worktree' })

    expect(ranIn).toContain('.orca-worktrees')
    expect(ranIn).not.toBe(dir)
    // Clean worktree → removed.
    expect(existsSync(ranIn)).toBe(false)
  })

  it('keeps the worktree and annotates the output when the sub-agent left changes', async () => {
    const dir = initRepo()
    mockState.spawnSubAgent.mockImplementation((config: { cwd: string }) => {
      writeFileSync(join(config.cwd, 'changed.txt'), 'mutation\n')
      return Promise.resolve(okResult('did work'))
    })
    const runner = new OrcaWorkflowAgentRunner({ cwd: dir, parent })
    const out = await runner.run({ prompt: 'p', label: 'wt', isolation: 'worktree' })
    expect(String(out)).toContain('did work')
    expect(String(out)).toContain('[worktree] branch=')
  })

  it('falls back to the base cwd when isolation is requested outside a git repo', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'orca-wf-nogit-'))
    let ranIn = ''
    mockState.spawnSubAgent.mockImplementation((config: { cwd: string }) => {
      ranIn = config.cwd
      return Promise.resolve(okResult('done'))
    })
    const runner = new OrcaWorkflowAgentRunner({ cwd: dir, parent })
    await runner.run({ prompt: 'p', label: 'wt', isolation: 'worktree' })
    expect(ranIn).toBe(dir)
  })
})

describe('structured output helpers — deep edges', () => {
  it('embeds the schema in the contract', () => {
    const c = buildSchemaContract({ type: 'object', properties: { a: { type: 'number' } }, required: ['a'] })
    expect(c).toContain('JSON Schema')
    expect(c).toContain('"properties"')
  })

  it('takes the LAST fenced json block when several are present', () => {
    const text = '```json\n{ "a": 1 }\n```\nthinking...\n```json\n{ "a": 2 }\n```'
    expect(parseSchemaResult(text, { required: ['a'] })).toEqual({ a: 2 })
  })

  it('parses nested objects and arrays', () => {
    const text = '```json\n{ "findings": [{ "t": "x" }], "ok": true }\n```'
    expect(parseSchemaResult(text, { required: ['findings', 'ok'] })).toEqual({ findings: [{ t: 'x' }], ok: true })
  })

  it('throws when the JSON is an array but an object with required keys is expected', () => {
    expect(() => parseSchemaResult('```json\n[1,2,3]\n```', { required: ['a'] })).toThrow(/must be a JSON object/)
  })

  it('accepts a whole-response bare array (no fence, no prose) when no required keys are declared', () => {
    expect(parseSchemaResult('[1,2,3]', {})).toEqual([1, 2, 3])
  })

  it('accepts a whole-response bare object with no fence', () => {
    expect(parseSchemaResult('{ "a": 1, "b": 2 }', { required: ['a'] })).toEqual({ a: 1, b: 2 })
  })

  it('strips a plain (untagged) code fence', () => {
    expect(parseSchemaResult('```\n{ "a": 1 }\n```', { required: ['a'] })).toEqual({ a: 1 })
  })
})
