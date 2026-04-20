import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OrcaConfig } from '../src/config.js'
import { executeReplTurn } from '../src/commands/chat-repl-turn.js'
import { ResetSensitiveWaitCanceledError } from '../src/commands/chat-proxy-tool-call.js'
import { ContextMonitor, LoopDetector } from '../src/harness/index.js'
import { RetryTracker } from '../src/retry-intelligence.js'
import { TokenBudgetManager } from '../src/token-budget.js'

const hooksMocks = vi.hoisted(() => ({
  hasHooks: vi.fn(),
  run: vi.fn(),
}))

const supportMocks = vi.hoisted(() => ({
  autoSaveSession: vi.fn(),
}))

const inputMocks = vi.hoisted(() => ({
  expandFileReferences: vi.fn(),
}))

const catalogMocks = vi.hoisted(() => ({
  getPricingForModel: vi.fn(),
}))

const cognitiveMocks = vi.hoisted(() => ({
  matchCognitive: vi.fn(),
  formatCognitiveContext: vi.fn(),
}))

const plannerMocks = vi.hoisted(() => ({
  isMultiTaskPrompt: vi.fn(),
}))

const providerMocks = vi.hoisted(() => ({
  chatOnce: vi.fn(),
  messageContentToText: vi.fn(),
}))

const outputMocks = vi.hoisted(() => ({
  printError: vi.fn(),
  printTurnSummary: vi.fn(),
  ensureNewline: vi.fn(),
}))

vi.mock('../src/hooks.js', () => ({
  hooks: hooksMocks,
}))

vi.mock('../src/commands/chat-support.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/commands/chat-support.js')>()
  return {
    ...actual,
    autoSaveSession: supportMocks.autoSaveSession,
  }
})

vi.mock('../src/commands/chat-input.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/commands/chat-input.js')>()
  return {
    ...actual,
    expandFileReferences: inputMocks.expandFileReferences,
  }
})

vi.mock('../src/model-catalog.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/model-catalog.js')>()
  return {
    ...actual,
    getPricingForModel: catalogMocks.getPricingForModel,
  }
})

vi.mock('../src/cognitive-skeleton.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/cognitive-skeleton.js')>()
  return {
    ...actual,
    matchCognitive: cognitiveMocks.matchCognitive,
    formatCognitiveContext: cognitiveMocks.formatCognitiveContext,
  }
})

vi.mock('../src/planner/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/planner/index.js')>()
  return {
    ...actual,
    isMultiTaskPrompt: plannerMocks.isMultiTaskPrompt,
  }
})

vi.mock('../src/providers/openai-compat.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/providers/openai-compat.js')>()
  return {
    ...actual,
    chatOnce: providerMocks.chatOnce,
    messageContentToText: providerMocks.messageContentToText,
  }
})

vi.mock('../src/output.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/output.js')>()

  class DummyProgressIndicator {
    start(): void {}
    stop(): { elapsed: number; tokens: number } { return { elapsed: 1500, tokens: 0 } }
    markWorking(): void {}
    addText(): void {}
  }

  return {
    ...actual,
    ProgressIndicator: DummyProgressIndicator,
    printError: outputMocks.printError,
    printTurnSummary: outputMocks.printTurnSummary,
    ensureNewline: outputMocks.ensureNewline,
  }
})

describe('executeReplTurn', () => {
  const config = { providers: {}, defaultProvider: 'openai', defaultModel: 'gpt-5.4' } as unknown as OrcaConfig
  const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

  beforeEach(() => {
    vi.clearAllMocks()
    hooksMocks.hasHooks.mockReturnValue(false)
    hooksMocks.run.mockResolvedValue({ continue: true })
    inputMocks.expandFileReferences.mockImplementation((prompt: string) => ({ text: prompt, injectedPaths: new Set<string>() }))
    catalogMocks.getPricingForModel.mockReturnValue([1, 2])
    cognitiveMocks.matchCognitive.mockReturnValue(null)
    cognitiveMocks.formatCognitiveContext.mockReturnValue('cognitive context')
    plannerMocks.isMultiTaskPrompt.mockReturnValue(false)
    providerMocks.chatOnce.mockResolvedValue({
      text: 'retry answer',
      inputTokens: 111,
      outputTokens: 222,
    })
    providerMocks.messageContentToText.mockImplementation((content: unknown) => {
      if (typeof content === 'string') return content
      if (Array.isArray(content)) {
        return content
          .map((part) => (part && typeof part === 'object' && 'type' in part && part.type === 'text' ? String((part as { text: string }).text) : ''))
          .join('')
      }
      return ''
    })
  })

  function createOptions(overrides: Partial<Parameters<typeof executeReplTurn>[0]> = {}) {
    return {
      messageToSend: 'hello world',
      currentModel: 'gpt-5.4',
      currentPermMode: 'auto' as const,
      resolved: {
        provider: 'openai',
        model: 'gpt-5.4',
        apiKey: 'key',
        baseURL: 'https://api.example.com',
        sdkProvider: 'openai' as const,
      },
      config,
      outputMode: 'text' as const,
      cwd: '/tmp/project',
      useInk: false,
      history: [{ role: 'system', content: 'system prompt' }],
      stats: { turns: 0, totalInputTokens: 0, totalOutputTokens: 0, turnTokens: [] as number[] },
      sessionInjectedPaths: new Set<string>(),
      mcpToolDefs: [],
      tokenBudget: new TokenBudgetManager('gpt-5.4'),
      contextMonitor: new ContextMonitor(200_000),
      retryTracker: new RetryTracker(),
      loopDetector: new LoopDetector(),
      emitStatus: vi.fn(),
      emitInlineNotice: vi.fn(),
      setLastTokPerSec: vi.fn(),
      onFileWrite: vi.fn(),
      runProxyTurn: vi.fn().mockResolvedValue({ inputTokens: 4000, outputTokens: 2000 }),
      runSDKQuery: vi.fn().mockResolvedValue({ inputTokens: 0, outputTokens: 0, turns: 1, text: 'sdk answer' }),
      ...overrides,
    }
  }

  it('stops early when UserPromptSubmit blocks the prompt', async () => {
    hooksMocks.hasHooks.mockReturnValue(true)
    hooksMocks.run.mockResolvedValue({ continue: false, stopReason: 'policy gate' })
    const options = createOptions()

    await executeReplTurn(options)

    expect(options.runProxyTurn).not.toHaveBeenCalled()
    expect(inputMocks.expandFileReferences).not.toHaveBeenCalled()
    expect(consoleLogSpy.mock.calls.flat().join('\n')).toContain('hook blocked prompt')
  })

  it('updates stats and prints a turn summary for successful proxy turns', async () => {
    const options = createOptions({
      runProxyTurn: vi.fn().mockImplementation(async ({ onFirstToken, onStreamToken }) => {
        onFirstToken?.()
        onStreamToken?.('streamed output')
        return { inputTokens: 4000, outputTokens: 2000 }
      }),
    })

    await executeReplTurn(options)

    expect(options.stats.turns).toBe(1)
    expect(options.stats.totalInputTokens).toBe(4000)
    expect(options.stats.totalOutputTokens).toBe(2000)
    expect(options.stats.turnTokens).toEqual([2000])
    expect(options.setLastTokPerSec).toHaveBeenCalled()
    expect(outputMocks.printTurnSummary).toHaveBeenCalledWith(expect.objectContaining({
      inputTokens: 4000,
      outputTokens: 2000,
      costUsd: 0.008,
    }))
  })

  it('auto-triggers reflect prompt shaping for debugging asks', async () => {
    const options = createOptions({
      messageToSend: 'Why is this test failing with TypeError: cannot read properties of undefined?',
      autoTriggerReflect: true,
      emitInlineNotice: vi.fn(),
    })

    await executeReplTurn(options)

    const call = options.runProxyTurn.mock.calls[0]?.[0]
    expect(call?.prompt).toContain('Reflect workflow')
    expect(options.emitInlineNotice).toHaveBeenCalledWith('reflect auto-triggered (debugging intent).', 'info')
  })

  it('forces reflect prompt shaping when requested explicitly', async () => {
    const options = createOptions({
      messageToSend: 'Review this hypothesis tree.',
      forceReflect: true,
      autoTriggerReflect: false,
      emitInlineNotice: vi.fn(),
    })

    await executeReplTurn(options)

    const call = options.runProxyTurn.mock.calls[0]?.[0]
    expect(call?.prompt).toContain('Reflect workflow')
    expect(options.emitInlineNotice).toHaveBeenCalledWith('reflect mode engaged.', 'info')
  })

  it('passes the active session system prompt through the SDK path', async () => {
    const options = createOptions({
      resolved: {
        provider: 'anthropic',
        model: 'claude-sonnet-4',
        apiKey: 'key',
      },
      history: [{ role: 'system', content: 'You are in reflect mode.\n\nBase prompt' }],
      runSDKQuery: vi.fn().mockResolvedValue({ inputTokens: 0, outputTokens: 0, turns: 1, text: 'sdk answer' }),
    })

    await executeReplTurn(options)

    expect(options.runProxyTurn).not.toHaveBeenCalled()
    expect(options.runSDKQuery).toHaveBeenCalledWith(expect.objectContaining({
      config: expect.objectContaining({
        systemPrompt: 'You are in reflect mode.\n\nBase prompt',
      }),
    }))
  })

  it('combines all session system prompts for SDK-backed turns', async () => {
    const options = createOptions({
      resolved: {
        provider: 'anthropic',
        model: 'claude-sonnet-4',
        apiKey: 'key',
      },
      history: [
        { role: 'system', content: 'Base prompt' },
        { role: 'system', content: 'Cognitive context' },
      ],
      runSDKQuery: vi.fn().mockResolvedValue({ inputTokens: 0, outputTokens: 0, turns: 1, text: 'sdk answer' }),
    })

    await executeReplTurn(options)

    expect(options.runSDKQuery).toHaveBeenCalledWith(expect.objectContaining({
      config: expect.objectContaining({
        systemPrompt: 'Base prompt\n\nCognitive context',
      }),
    }))
  })

  it('does not auto-trigger reflect from expanded file contents alone', async () => {
    inputMocks.expandFileReferences.mockReturnValue({
      text: 'Create the parser command.\n\n<file>stack trace broken regression</file>',
      injectedPaths: new Set<string>(['/tmp/debug.txt']),
    })
    const options = createOptions({
      messageToSend: 'Create the parser command.',
      autoTriggerReflect: true,
      emitInlineNotice: vi.fn(),
    })

    await executeReplTurn(options)

    const call = options.runProxyTurn.mock.calls[0]?.[0]
    expect(call?.prompt).toContain('Create the parser command.')
    expect(call?.prompt).not.toContain('Reflect workflow')
    expect(options.emitInlineNotice).not.toHaveBeenCalled()
  })

  it('updates history and token stats for SDK-backed turns', async () => {
    const history = [{ role: 'system' as const, content: 'system prompt' }]
    const options = createOptions({
      resolved: {
        provider: 'anthropic',
        model: 'claude-sonnet-4',
        apiKey: 'key',
      },
      history,
      runSDKQuery: vi.fn().mockResolvedValue({
        inputTokens: 120,
        outputTokens: 80,
        turns: 1,
        text: 'sdk reply',
      }),
    })

    await executeReplTurn(options)

    expect(options.stats.turns).toBe(1)
    expect(options.stats.totalInputTokens).toBe(120)
    expect(options.stats.totalOutputTokens).toBe(80)
    expect(options.stats.turnTokens).toEqual([80])
    expect(history.slice(-2)).toEqual([
      { role: 'user', content: 'hello world' },
      { role: 'assistant', content: 'sdk reply' },
    ])
    expect(outputMocks.printTurnSummary).toHaveBeenCalledWith(expect.objectContaining({
      inputTokens: 120,
      outputTokens: 80,
    }))
  })

  it('retries with chatOnce after a 413 context overflow', async () => {
    const history = [
      { role: 'system' as const, content: 'system prompt' },
      { role: 'user' as const, content: 'previous prompt' },
    ]
    const options = createOptions({
      history,
      runProxyTurn: vi.fn().mockRejectedValue(Object.assign(new Error('context_length exceeded'), { status: 413 })),
    })

    await executeReplTurn(options)

    expect(providerMocks.chatOnce).toHaveBeenCalledOnce()
    expect(providerMocks.chatOnce.mock.calls[0]?.[1]).toBe('hello world')
    expect(options.stats.turns).toBe(1)
    expect(options.stats.totalInputTokens).toBe(111)
    expect(options.stats.totalOutputTokens).toBe(222)
    expect(options.stats.turnTokens).toEqual([222])
    expect(history.slice(-2)).toEqual([
      { role: 'user', content: 'hello world' },
      { role: 'assistant', content: 'retry answer' },
    ])
    expect(outputMocks.printError).not.toHaveBeenCalled()
  })

  it('silently abandons the turn when a reset-sensitive wait is canceled', async () => {
    const history = [{ role: 'system' as const, content: 'system prompt' }]
    const options = createOptions({
      history,
      runProxyTurn: vi.fn().mockRejectedValue(new ResetSensitiveWaitCanceledError()),
    })

    await executeReplTurn(options)

    expect(options.stats.turns).toBe(0)
    expect(options.stats.totalInputTokens).toBe(0)
    expect(options.stats.totalOutputTokens).toBe(0)
    expect(history).toEqual([{ role: 'system', content: 'system prompt' }])
    expect(outputMocks.printError).not.toHaveBeenCalled()
  })

  it.each([
    {
      risk: 'red' as const,
      postBudget: { contextWindow: 128000, maxOutput: 32000, inputTokensUsed: 0, outputTokensUsed: 0, historyTokensEst: 90000, utilizationPct: 61, risk: 'red' as const },
      expectedKeepTurns: 1,
      expectedNoticeLevel: 'error',
      expectAutoSave: true,
      expectCleanup: true,
      expectedInfoNotice: true,
    },
    {
      risk: 'orange' as const,
      postBudget: { contextWindow: 128000, maxOutput: 32000, inputTokensUsed: 0, outputTokensUsed: 0, historyTokensEst: 70000, utilizationPct: 55, risk: 'orange' as const },
      expectedKeepTurns: 1,
      expectedNoticeLevel: 'warn',
      expectAutoSave: false,
      expectCleanup: false,
      expectedInfoNotice: false,
    },
    {
      risk: 'yellow' as const,
      postBudget: { contextWindow: 128000, maxOutput: 32000, inputTokensUsed: 0, outputTokensUsed: 0, historyTokensEst: 52000, utilizationPct: 45, risk: 'yellow' as const },
      expectedKeepTurns: 2,
      expectedNoticeLevel: 'warn',
      expectAutoSave: false,
      expectCleanup: false,
      expectedInfoNotice: false,
    },
  ])('applies $risk post-turn compaction policy', async ({ postBudget, expectedKeepTurns, expectedNoticeLevel, expectAutoSave, expectCleanup, expectedInfoNotice }) => {
    const tokenBudget = new TokenBudgetManager('gpt-5.4')
    const getBudgetSpy = vi.spyOn(tokenBudget, 'getBudget')
    getBudgetSpy
      .mockReturnValueOnce({ contextWindow: 128000, maxOutput: 32000, inputTokensUsed: 0, outputTokensUsed: 0, historyTokensEst: 2000, utilizationPct: 2, risk: 'green' })
      .mockReturnValueOnce({ contextWindow: 128000, maxOutput: 32000, inputTokensUsed: 10, outputTokensUsed: 5, historyTokensEst: 2000, utilizationPct: 2, risk: 'green' })
      .mockReturnValueOnce(postBudget)
    const smartCompactSpy = vi.spyOn(tokenBudget, 'smartCompact').mockReturnValue({
      dropped: 3,
      kept: 2,
      tokensFreed: 900,
      summary: 'dropped 3 old messages',
    })
    const clearUsageSpy = vi.spyOn(tokenBudget, 'clearCurrentUsage')
    const contextMonitor = new ContextMonitor(200_000)
    const clearContextSpy = vi.spyOn(contextMonitor, 'clearCurrentUsage')
    const retryTracker = new RetryTracker()
    const retryCleanupSpy = vi.spyOn(retryTracker, 'cleanup')
    const emitStatus = vi.fn()
    const emitInlineNotice = vi.fn()
    const options = createOptions({
      history: [
        { role: 'system', content: 'system prompt' },
        { role: 'user', content: 'u1' },
        { role: 'assistant', content: 'a1' },
        { role: 'user', content: 'u2' },
        { role: 'assistant', content: 'a2' },
      ],
      tokenBudget,
      contextMonitor,
      retryTracker,
      emitStatus,
      emitInlineNotice,
    })

    await executeReplTurn(options)

    expect(smartCompactSpy).toHaveBeenCalledWith(options.history, expectedKeepTurns)
    expect(emitInlineNotice).toHaveBeenCalledWith(
      expect.stringContaining('auto-compact'),
      expectedNoticeLevel,
    )
    expect(clearUsageSpy).toHaveBeenCalled()
    expect(clearContextSpy).toHaveBeenCalled()
    if (expectAutoSave) {
      expect(supportMocks.autoSaveSession).toHaveBeenCalledOnce()
    } else {
      expect(supportMocks.autoSaveSession).not.toHaveBeenCalled()
    }
    if (expectCleanup) {
      expect(retryCleanupSpy).toHaveBeenCalledOnce()
    } else {
      expect(retryCleanupSpy).not.toHaveBeenCalled()
    }
    if (expectedInfoNotice) {
      expect(emitInlineNotice).toHaveBeenCalledWith('session auto-saved. Context freed — continuing.', 'info')
    }
    expect(emitStatus).toHaveBeenCalledOnce()
  })
})
