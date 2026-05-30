import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ArmatureConfig } from '../src/config.js'
import { handleAsyncReplSlashCommand } from '../src/commands/chat-repl-async-slash.js'

const configMocks = vi.hoisted(() => ({
  findAggregator: vi.fn(),
  resolveModelEndpoint: vi.fn(),
  resolveProvider: vi.fn(),
}))

const hooksMocks = vi.hoisted(() => ({
  run: vi.fn(),
}))

const multiModelMocks = vi.hoisted(() => ({
  pickDiverseModels: vi.fn(),
  runCouncil: vi.fn(),
  runRace: vi.fn(),
  runPipeline: vi.fn(),
}))

const plannerMocks = vi.hoisted(() => ({
  decomposePrompt: vi.fn(),
  executePlan: vi.fn(),
}))

const sessionInputMocks = vi.hoisted(() => ({
  prepareMultiModelContext: vi.fn(),
}))

const pricingMocks = vi.hoisted(() => ({
  getPricingForModel: vi.fn(),
}))

const missionMocks = vi.hoisted(() => ({
  MissionController: vi.fn(),
}))

vi.mock('../src/config.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/config.js')>()
  return {
    ...actual,
    findAggregator: configMocks.findAggregator,
    resolveModelEndpoint: configMocks.resolveModelEndpoint,
    resolveProvider: configMocks.resolveProvider,
  }
})

vi.mock('../src/hooks.js', () => ({
  hooks: hooksMocks,
}))

vi.mock('../src/multi-model.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/multi-model.js')>()
  return {
    ...actual,
    pickDiverseModels: multiModelMocks.pickDiverseModels,
    runCouncil: multiModelMocks.runCouncil,
    runRace: multiModelMocks.runRace,
    runPipeline: multiModelMocks.runPipeline,
  }
})

vi.mock('../src/planner/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/planner/index.js')>()
  return {
    ...actual,
    decomposePrompt: plannerMocks.decomposePrompt,
    executePlan: plannerMocks.executePlan,
  }
})

vi.mock('../src/commands/chat-input.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/commands/chat-input.js')>()
  return {
    ...actual,
    prepareMultiModelContext: sessionInputMocks.prepareMultiModelContext,
  }
})

vi.mock('../src/model-catalog.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/model-catalog.js')>()
  return {
    ...actual,
    getPricingForModel: pricingMocks.getPricingForModel,
  }
})

vi.mock('../src/mission/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/mission/index.js')>()
  return {
    ...actual,
    MissionController: missionMocks.MissionController,
  }
})

describe('handleAsyncReplSlashCommand', () => {
  const baseConfig = { providers: {}, defaultProvider: 'openai', defaultModel: 'gpt-5.4' } as unknown as ArmatureConfig
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

  beforeEach(() => {
    vi.clearAllMocks()
    hooksMocks.run.mockResolvedValue({ continue: true })
    configMocks.findAggregator.mockReturnValue('agg')
    configMocks.resolveModelEndpoint.mockReturnValue({ provider: 'openai', apiKey: 'key', baseURL: 'https://api.example.com', model: 'gpt-5.4' })
    configMocks.resolveProvider.mockReturnValue({ provider: 'openai', apiKey: 'key', baseURL: 'https://api.example.com', model: 'gpt-5.4' })
    multiModelMocks.pickDiverseModels.mockReturnValue(['claude-opus-4.6', 'gpt-5.4', 'gemini-3.1-pro'])
    multiModelMocks.runCouncil.mockResolvedValue({
      responses: [],
      verdict: { model: 'gpt-5.4', text: 'verdict', durationMs: 10, inputTokens: 0, outputTokens: 0 },
      totalDurationMs: 10,
      agreement: 'high',
    })
    multiModelMocks.runRace.mockResolvedValue({
      winner: { model: 'gpt-5.4', text: 'winner', durationMs: 10, inputTokens: 0, outputTokens: 0 },
      cancelled: [],
      totalDurationMs: 10,
    })
    multiModelMocks.runPipeline.mockResolvedValue({
      stages: [
        {
          stage: { role: 'plan', model: 'claude-opus-4.6' },
          response: { model: 'claude-opus-4.6', text: 'planned', durationMs: 10, inputTokens: 1, outputTokens: 2 },
        },
      ],
      totalDurationMs: 10,
    })
    sessionInputMocks.prepareMultiModelContext.mockImplementation((prompt: string) => ({ prompt, injectedPaths: new Set<string>() }))
    pricingMocks.getPricingForModel.mockReturnValue([1, 1])
    plannerMocks.decomposePrompt.mockResolvedValue({
      tasks: [{ type: 'main' }, { type: 'side' }],
      reasoning: 'Split main work first',
    })
    plannerMocks.executePlan.mockResolvedValue({
      result: {
        success: true,
        completed: 2,
        failed: 0,
        skipped: 0,
        totalTasks: 2,
        totalTokens: 321,
        totalDurationMs: 1200,
      },
    })
    missionMocks.MissionController.mockImplementation(() => ({
      onEvent: vi.fn(),
      getState: () => ({ id: 'mission-1' }),
      plan: vi.fn(),
      execute: vi.fn(),
      abort: vi.fn(),
      getSummary: vi.fn(() => 'summary'),
    }))
  })

  it('warns when council has no available endpoints', async () => {
    configMocks.resolveModelEndpoint.mockReturnValue(null)

    await handleAsyncReplSlashCommand({
      command: 'council',
      input: '/council compare the options',
      config: baseConfig,
      cwd: '/tmp/project',
      currentModel: 'gpt-5.4',
      useInk: false,
      sessionInjectedPaths: new Set<string>(),
    })

    expect(multiModelMocks.runCouncil).not.toHaveBeenCalled()
    expect(logSpy.mock.calls.flat().join('\n')).toContain('council: no models with available endpoints')
  })

  it('runs pipeline stages in legacy mode', async () => {
    await handleAsyncReplSlashCommand({
      command: 'pipeline',
      input: '/pipeline build a parser',
      config: baseConfig,
      cwd: '/tmp/project',
      currentModel: 'gpt-5.4',
      useInk: false,
      sessionInjectedPaths: new Set<string>(),
    })

    expect(multiModelMocks.runPipeline).toHaveBeenCalledOnce()
    const args = multiModelMocks.runPipeline.mock.calls[0]?.[0]
    expect(args?.stages).toHaveLength(3)
    expect(logSpy.mock.calls.flat().join('\n')).toContain('Pipeline: 3 stages')
  })

  it('prints a mission provider error when no baseURL is configured', async () => {
    configMocks.resolveProvider.mockReturnValue({ provider: 'openai', apiKey: 'key', baseURL: '', model: 'gpt-5.4' })

    await handleAsyncReplSlashCommand({
      command: 'mission',
      input: '/mission ship the feature',
      config: baseConfig,
      cwd: '/tmp/project',
      currentModel: 'gpt-5.4',
      useInk: false,
      sessionInjectedPaths: new Set<string>(),
    })

    expect(missionMocks.MissionController).not.toHaveBeenCalled()
    expect(logSpy.mock.calls.flat().join('\n')).toContain('mission: no provider baseURL configured')
  })

  it('runs /plan decomposition and execution in legacy mode', async () => {
    await handleAsyncReplSlashCommand({
      command: 'plan',
      input: '/plan break down this refactor',
      config: baseConfig,
      cwd: '/tmp/project',
      currentModel: 'gpt-5.4',
      useInk: false,
      sessionInjectedPaths: new Set<string>(),
    })

    expect(plannerMocks.decomposePrompt).toHaveBeenCalledOnce()
    expect(plannerMocks.executePlan).toHaveBeenCalledOnce()
    expect(logSpy.mock.calls.flat().join('\n')).toContain('Plan completed: 2/2 tasks')
  })
})
