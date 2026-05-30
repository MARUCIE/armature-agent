import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const runMocks = vi.hoisted(() => ({
  createAgent: vi.fn(),
  MissionController: vi.fn(),
  decomposePrompt: vi.fn(),
  executePlan: vi.fn(),
  missionPlan: vi.fn(),
  missionExecute: vi.fn(),
  missionGetState: vi.fn(),
}))

vi.mock('@armature/sdk', () => ({
  createAgent: runMocks.createAgent,
}), { virtual: true })

vi.mock('../src/mission/index.js', () => ({
  MissionController: runMocks.MissionController,
}))

vi.mock('../src/planner/index.js', () => ({
  decomposePrompt: runMocks.decomposePrompt,
  executePlan: runMocks.executePlan,
}))

describe('run command work-session integration', () => {
  const previousHome = process.env.HOME
  const previousArmatureHome = process.env.ARMATURE_HOME
  let homeDir: string
  let armatureHome: string
  let projectDir: string

  beforeEach(() => {
    vi.resetModules()
    runMocks.createAgent.mockReset()
    runMocks.createAgent.mockReturnValue({
      query: async function* () {
        yield { type: 'result', inputTokens: 11, outputTokens: 22, turns: 2 }
      },
    })
    runMocks.missionPlan.mockResolvedValue({
      milestones: [{ id: 'm-1', title: 'M1', featureIds: ['f-1'], status: 'pending', validationAttempts: 0, maxRetries: 2 }],
      features: [{ id: 'f-1', title: 'F1', spec: 'Do F1', criteriaIds: [], status: 'pending', milestoneId: 'm-1', attempts: 0 }],
      contract: { version: 1, criteria: [], createdAt: '2026-04-29T00:00:00.000Z', updatedAt: '2026-04-29T00:00:00.000Z' },
      strategy: 'test strategy',
      estimatedRuns: 1,
    })
    runMocks.missionExecute.mockResolvedValue({
      phase: 'completed',
      featuresValidated: 1,
      totalRuns: 3,
      totalTokens: 44,
      startedAt: '2026-04-29T00:00:00.000Z',
      completedAt: '2026-04-29T00:00:01.000Z',
    })
    runMocks.missionGetState.mockReturnValue({ id: 'mission-test' })
    runMocks.MissionController.mockImplementation(() => ({
      onEvent: vi.fn(),
      plan: runMocks.missionPlan,
      execute: runMocks.missionExecute,
      getState: runMocks.missionGetState,
    }))
    const testPlan = {
      originalPrompt: 'implement the feature',
      tasks: [
        { id: 'main-1', title: 'Main task', spec: 'Do main', type: 'main', status: 'pending', priority: 'high', blockedBy: [], attempts: 0, maxRetries: 1 },
        { id: 'side-1', title: 'Side task', spec: 'Do side', type: 'side', status: 'pending', priority: 'normal', blockedBy: [], attempts: 0, maxRetries: 1 },
      ],
      reasoning: 'test plan',
      createdAt: '2026-04-29T00:00:00.000Z',
      estimatedRuns: 2,
    }
    runMocks.decomposePrompt.mockResolvedValue(testPlan)
    runMocks.executePlan.mockResolvedValue({
      result: {
        success: true,
        completed: 2,
        failed: 0,
        skipped: 0,
        totalTasks: 2,
        totalTokens: 66,
        totalDurationMs: 1234,
      },
    })

    homeDir = join(tmpdir(), `armature-run-home-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
    armatureHome = join(tmpdir(), `armature-run-armature-home-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
    projectDir = join(tmpdir(), `armature-run-project-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
    mkdirSync(homeDir, { recursive: true })
    mkdirSync(armatureHome, { recursive: true })
    mkdirSync(projectDir, { recursive: true })
    writeFileSync(join(projectDir, 'package.json'), JSON.stringify({ name: 'run-work-session-test' }), 'utf-8')

    process.env.HOME = homeDir
    process.env.ARMATURE_HOME = armatureHome
  })

  afterEach(() => {
    if (previousHome === undefined) delete process.env.HOME
    else process.env.HOME = previousHome
    if (previousArmatureHome === undefined) delete process.env.ARMATURE_HOME
    else process.env.ARMATURE_HOME = previousArmatureHome
    try { rmSync(homeDir, { recursive: true, force: true }) } catch { /* ignore */ }
    try { rmSync(armatureHome, { recursive: true, force: true }) } catch { /* ignore */ }
    try { rmSync(projectDir, { recursive: true, force: true }) } catch { /* ignore */ }
  })

  it('creates and completes a work session plus task run for default armature run execution', { timeout: 15_000 }, async () => {
    const { createRunCommand } = await import('../src/commands/run.js')
    const workSessionStore = await import('../src/work-session-store.js')

    const command = createRunCommand()
    await command.parseAsync([
      'node',
      'run',
      'implement',
      'the',
      'feature',
      '--json',
      '--cwd',
      projectDir,
      '--provider',
      'openai',
      '--api-key',
      'test-openai-key',
    ])

    const latestSession = workSessionStore.getLatestWorkSession()
    expect(latestSession?.session.sourceSurface).toBe('run')
    expect(latestSession?.session.cwd).toBe(projectDir)
    expect(latestSession?.session.provider).toBe('openai')
    expect(latestSession?.session.latestTaskRunId).toBeTruthy()

    const latestTaskRunId = latestSession?.session.latestTaskRunId
    expect(latestTaskRunId).toBeTruthy()

    const taskRun = workSessionStore.getTaskRunById(latestTaskRunId!)
    expect(taskRun?.taskRun.status).toBe('completed')
    expect(taskRun?.taskRun.kind).toBe('run')
    expect(taskRun?.taskRun.title).toBe('implement the feature')
    expect(taskRun?.taskRun.usage).toMatchObject({
      inputTokens: 11,
      outputTokens: 22,
      turns: 2,
    })
    expect(taskRun?.taskRun.workSessionId).toBe(latestSession?.id)
  })

  it('records mission mode as a mission task run with mission-state evidence', { timeout: 15_000 }, async () => {
    const { createRunCommand } = await import('../src/commands/run.js')
    const workSessionStore = await import('../src/work-session-store.js')

    const command = createRunCommand()
    await command.parseAsync([
      'node',
      'run',
      'implement',
      'the',
      'feature',
      '--json',
      '--mission',
      '--cwd',
      projectDir,
      '--provider',
      'openai',
      '--api-key',
      'test-openai-key',
    ])

    const latestSession = workSessionStore.getLatestWorkSession()
    const taskRun = workSessionStore.getTaskRunById(latestSession!.session.latestTaskRunId!)

    expect(taskRun?.taskRun.kind).toBe('mission')
    expect(taskRun?.taskRun.status).toBe('completed')
    expect(taskRun?.taskRun.usage).toMatchObject({
      outputTokens: 44,
      turns: 3,
    })
    expect(taskRun?.taskRun.evidence).toContainEqual({
      label: 'mission-state',
      path: join(projectDir, '.armature', 'missions', 'mission-test', 'state.json'),
    })
  })

  it('records plan mode as a plan task run', { timeout: 15_000 }, async () => {
    const { createRunCommand } = await import('../src/commands/run.js')
    const workSessionStore = await import('../src/work-session-store.js')

    const command = createRunCommand()
    await command.parseAsync([
      'node',
      'run',
      'implement',
      'the',
      'feature',
      '--json',
      '--plan',
      '--cwd',
      projectDir,
      '--provider',
      'openai',
      '--api-key',
      'test-openai-key',
    ])

    const latestSession = workSessionStore.getLatestWorkSession()
    const taskRun = workSessionStore.getTaskRunById(latestSession!.session.latestTaskRunId!)

    expect(runMocks.decomposePrompt).toHaveBeenCalledWith('implement the feature', expect.objectContaining({
      model: expect.any(String),
    }))
    expect(taskRun?.taskRun.kind).toBe('plan')
    expect(taskRun?.taskRun.status).toBe('completed')
    expect(taskRun?.taskRun.usage).toMatchObject({
      outputTokens: 66,
      turns: 2,
    })
  })
})
