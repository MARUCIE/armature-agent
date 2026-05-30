import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('evolution store', () => {
  const previousHome = process.env.HOME
  const previousArmatureHome = process.env.ARMATURE_HOME
  let homeDir: string
  let projectDir: string

  beforeEach(() => {
    homeDir = join(tmpdir(), `armature-evolution-home-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
    projectDir = join(tmpdir(), `armature-evolution-project-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
    mkdirSync(homeDir, { recursive: true })
    mkdirSync(projectDir, { recursive: true })
    process.env.HOME = homeDir
    process.env.ARMATURE_HOME = join(homeDir, '.armature')
  })

  afterEach(() => {
    if (previousHome === undefined) delete process.env.HOME
    else process.env.HOME = previousHome
    if (previousArmatureHome === undefined) delete process.env.ARMATURE_HOME
    else process.env.ARMATURE_HOME = previousArmatureHome
    try { rmSync(homeDir, { recursive: true, force: true }) } catch { /* ignore */ }
    try { rmSync(projectDir, { recursive: true, force: true }) } catch { /* ignore */ }
  })

  it('auto-drafts a recurring rule candidate from repeated errors', async () => {
    const { EvolutionStore } = await import('../src/evolution/store.js')
    const store = new EvolutionStore()

    store.observe({
      category: 'serve',
      severity: 'error',
      summary: 'serve chat failed: upstream timeout',
      cwd: projectDir,
      evidence: { usageRef: 'usage-aaaabbbb' },
    })
    store.observe({
      category: 'serve',
      severity: 'error',
      summary: 'serve chat failed: upstream timeout',
      cwd: projectDir,
      evidence: { usageRef: 'usage-ccccdddd' },
    })

    const candidates = store.listCandidates({ kind: 'rule', limit: 10 })
    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toMatchObject({
      kind: 'rule',
      status: 'draft',
    })
    expect(candidates[0]!.sourceObservationIds).toHaveLength(2)
  })

  it('blocks test-hint promotion into src via the mutation ceiling', async () => {
    const { EvolutionStore } = await import('../src/evolution/store.js')
    const store = new EvolutionStore()

    const candidate = store.createCandidate({
      kind: 'test-hint',
      title: 'Bad target',
      content: 'Do not write into runtime source files.',
      cwd: projectDir,
      targetPath: 'src/forbidden.json',
      evidence: [{ sessionId: 'session-a' }],
      sourceObservationIds: ['obs-manual'],
    })

    const verified = store.verifyCandidate(candidate.id)
    expect(verified?.gate?.passed).toBe(false)
    expect(verified?.gate?.reason).toContain('src/**')
  })

  it('promotes verified prompt and rule candidates into durable knowledge', async () => {
    const { EvolutionStore } = await import('../src/evolution/store.js')
    const { PromptRepository } = await import('../src/knowledge/prompts.js')
    const { LearningJournal } = await import('../src/knowledge/learning.js')
    const store = new EvolutionStore()

    const promptCandidate = store.createCandidate({
      kind: 'prompt',
      title: 'Compact earlier',
      content: 'Summarize completed work before the context budget turns red.',
      cwd: projectDir,
      metadata: { category: 'chat-ops' },
      evidence: [{ sessionId: 'session-a' }],
      sourceObservationIds: ['obs-1'],
    })
    const ruleCandidate = store.createCandidate({
      kind: 'rule',
      title: 'Stop blind retries',
      content: 'Inspect evidence and postmortems before retrying the same failure signature.',
      cwd: projectDir,
      metadata: { failureMode: 'repeat-failure-loop' },
      evidence: [{ workSessionId: 'ws-1', taskRunId: 'tr-1' }],
      sourceObservationIds: ['obs-2'],
    })

    expect(store.promoteCandidate(promptCandidate.id)?.status).toBe('promoted')
    expect(store.promoteCandidate(ruleCandidate.id)?.status).toBe('promoted')

    const repo = new PromptRepository()
    expect(repo.listAll().some((item) => item.name === 'Compact earlier')).toBe(true)

    const journal = new LearningJournal()
    const promoted = journal.getPromotedRules().find((item) => item.content.includes('Inspect evidence and postmortems'))
    expect(promoted).toBeTruthy()
    expect(promoted?.evidence[0]).toBe('gate: external-verified')
  })

  it('redacts secrets and paths from persisted observations', async () => {
    const { EvolutionStore } = await import('../src/evolution/store.js')
    const store = new EvolutionStore()

    const observation = store.observe({
      category: 'serve',
      severity: 'error',
      summary: 'serve chat failed: Bearer\u00a0secret-token sk-secret-abcdef /Users/mauricewen/private/file.txt',
      details: 'Request failed at /Users/mauricewen/private/file.txt with OPENAI_API_KEY\u200b=secret-value',
      cwd: projectDir,
      evidence: { usageRef: 'usage-redact01' },
    })

    const stored = JSON.parse(readFileSync(join(store.getRootDir(), 'observations', `${observation.id}.json`), 'utf-8')) as { summary: string; details?: string }
    expect(stored.summary).not.toContain('secret-token')
    expect(stored.summary).not.toContain('/Users/mauricewen')
    expect(stored.details).not.toContain('OPENAI_API_KEY=')
  })

  it('blocks test-hint promotion through symlinked allowlist paths', async () => {
    const { EvolutionStore } = await import('../src/evolution/store.js')
    mkdirSync(join(projectDir, 'src'), { recursive: true })
    mkdirSync(join(projectDir, 'agent-eval', 'generated'), { recursive: true })
    symlinkSync(join(projectDir, 'src'), join(projectDir, 'agent-eval', 'generated', 'test-hints'))
    const store = new EvolutionStore()

    const candidate = store.createCandidate({
      kind: 'test-hint',
      title: 'Symlink target',
      content: 'Must be rejected.',
      cwd: projectDir,
      targetPath: 'agent-eval/generated/test-hints/should-block.json',
      evidence: [{ sessionId: 'session-a' }],
      sourceObservationIds: ['obs-manual'],
    })

    const verified = store.verifyCandidate(candidate.id)
    expect(verified?.gate?.passed).toBe(false)
    expect(verified?.gate?.reason).toContain('symlink')
  })
})
