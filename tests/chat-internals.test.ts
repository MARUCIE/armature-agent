import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatSessionEmitter } from '../src/ui/session.js'
import { ContextMonitor, LoopDetector } from '../src/harness/index.js'
import { RetryTracker } from '../src/retry-intelligence.js'
import { TokenBudgetManager } from '../src/token-budget.js'

const chatMocks = vi.hoisted(() => ({
  streamChat: vi.fn(),
  handleProxyToolCall: vi.fn(),
}))

vi.mock('../src/providers/openai-compat.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/providers/openai-compat.js')>()
  return {
    ...actual,
    streamChat: chatMocks.streamChat,
  }
})

vi.mock('../src/commands/chat-proxy-tool-call.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/commands/chat-proxy-tool-call.js')>()
  return {
    ...actual,
    handleProxyToolCall: chatMocks.handleProxyToolCall,
  }
})

import { collectFencedMultilineInput, matchSlashCommandArg, runProxyTurn, upsertRuntimeIdentityPrompt } from '../src/commands/chat.js'
import { ResetSensitiveWaitCanceledError } from '../src/commands/chat-proxy-tool-call.js'

function waitForPromptReady(session: ChatSessionEmitter): Promise<void> {
  return new Promise((resolve) => {
    session.once('prompt_ready', () => resolve())
  })
}

describe('chat internal regressions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('emits synthetic tool_end cleanup when a reset-sensitive tool call is canceled', async () => {
    const session = new ChatSessionEmitter()
    const toolEvents: Array<{ type: string; info: unknown }> = []
    session.on('tool_start', (event) => {
      toolEvents.push(event)
    })
    session.on('tool_end', (event) => {
      toolEvents.push(event)
    })

    chatMocks.handleProxyToolCall.mockRejectedValueOnce(new ResetSensitiveWaitCanceledError())
    chatMocks.streamChat.mockImplementation(async function* (_base: unknown, _prompt: unknown, _history: unknown, runtime: { onToolCall?: (name: string, args: Record<string, unknown>) => Promise<unknown> }) {
      yield { type: 'tool_use', toolName: 'ask_user', toolInput: { question: 'Continue?' } }
      await runtime.onToolCall?.('ask_user', { question: 'Continue?' })
    })

    await expect(runProxyTurn({
      prompt: 'hello world',
      resolved: {
        provider: 'openai',
        model: 'gpt-5.4',
        apiKey: 'key',
        baseURL: 'https://example.invalid/v1',
      } as never,
      config: { systemPrompt: 'system prompt' } as never,
      outputMode: 'streaming',
      history: [{ role: 'system', content: 'system prompt' }],
      cwd: process.cwd(),
      retryTracker: new RetryTracker(),
      loopDetector: new LoopDetector(),
      tokenBudget: new TokenBudgetManager('gpt-5.4'),
      contextMonitor: new ContextMonitor(200_000),
      session,
    })).rejects.toBeInstanceOf(ResetSensitiveWaitCanceledError)

    expect(toolEvents).toEqual([
      {
        type: 'tool_start',
        info: { name: 'ask_user', args: {}, label: { question: 'Continue?' } },
      },
      {
        type: 'tool_end',
        info: { name: 'ask_user', success: false, output: '', durationMs: 0 },
      },
    ])
  })

  it('abandons partially collected fenced multiline input after clear-cancel', async () => {
    const session = new ChatSessionEmitter()
    const firstPromptReady = waitForPromptReady(session)

    const pending = collectFencedMultilineInput(
      '```ts',
      () => session.waitForInput({ cancelOnClear: true }),
      () => session.consumeCanceledResetSensitiveWait(),
    )

    await firstPromptReady
    const secondPromptReady = waitForPromptReady(session)
    session.submitInput('const value = 1')
    await secondPromptReady
    session.emitClear()

    await expect(pending).resolves.toBeNull()

    const freshPrompt = session.waitForInput()
    session.submitInput('fresh input')
    await expect(freshPrompt).resolves.toBe('fresh input')
  })

  it('preserves multimodal user content in history after a proxy turn', async () => {
    const history = [{ role: 'system', content: 'system prompt' }] as Array<{ role: 'system' | 'user' | 'assistant'; content: unknown }>

    chatMocks.streamChat.mockImplementation(async function* () {
      yield { type: 'text', text: 'vision answer' }
      yield { type: 'usage', inputTokens: 10, outputTokens: 20 }
      yield { type: 'done' }
    })

    const prompt = [
      { type: 'text', text: 'compare these screenshots' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,BBBB' } },
    ] as const

    const result = await runProxyTurn({
      prompt,
      resolved: {
        provider: 'openai',
        model: 'gpt-5.4',
        apiKey: 'key',
        baseURL: 'https://example.invalid/v1',
      } as never,
      config: { systemPrompt: 'system prompt' } as never,
      outputMode: 'streaming',
      history: history as never,
      cwd: process.cwd(),
      retryTracker: new RetryTracker(),
      loopDetector: new LoopDetector(),
      tokenBudget: new TokenBudgetManager('gpt-5.4'),
      contextMonitor: new ContextMonitor(200_000),
    })

    expect(result).toEqual({ inputTokens: 10, outputTokens: 20 })
    expect(history[1]).toEqual({ role: 'user', content: prompt })
    expect(history[2]).toEqual({ role: 'assistant', content: 'vision answer' })
  })

  it('forwards explicit tool definitions and reasoning effort to the proxy runtime', async () => {
    const toolDefs = [
      {
        type: 'function',
        function: {
          name: 'read_file',
          description: 'read',
          parameters: { type: 'object', properties: {} },
        },
      },
    ] as Array<Record<string, unknown>>

    let capturedBase: Record<string, unknown> | undefined
    let capturedTools: unknown
    chatMocks.streamChat.mockImplementation(async function* (base: Record<string, unknown>, _prompt: unknown, _history: unknown, _runtime: unknown, tools: unknown) {
      capturedBase = base
      capturedTools = tools
      yield { type: 'text', text: 'ok' }
      yield { type: 'usage', inputTokens: 5, outputTokens: 7 }
      yield { type: 'done' }
    })

    const result = await runProxyTurn({
      prompt: 'hello world',
      resolved: {
        provider: 'openai',
        model: 'gpt-5.4',
        apiKey: 'key',
        baseURL: 'https://example.invalid/v1',
      } as never,
      config: { systemPrompt: 'system prompt' } as never,
      outputMode: 'streaming',
      history: [{ role: 'system', content: 'system prompt' }],
      cwd: process.cwd(),
      retryTracker: new RetryTracker(),
      loopDetector: new LoopDetector(),
      tokenBudget: new TokenBudgetManager('gpt-5.4'),
      contextMonitor: new ContextMonitor(200_000),
      toolDefs,
      reasoningEffort: 'xhigh',
    })

    expect(result).toEqual({ inputTokens: 5, outputTokens: 7 })
    expect(capturedBase?.reasoningEffort).toBe('xhigh')
    expect(capturedTools).toBe(toolDefs)
  })

  it('matches slash commands on token boundaries so /mode does not swallow /model', () => {
    expect(matchSlashCommandArg('/mode', '/mode')).toBe('')
    expect(matchSlashCommandArg('/mode reflect', '/mode')).toBe('reflect')
    expect(matchSlashCommandArg('/mode\treflect', '/mode')).toBe('reflect')
    expect(matchSlashCommandArg('/model', '/mode')).toBeNull()
    expect(matchSlashCommandArg('/models', '/mode')).toBeNull()
    expect(matchSlashCommandArg('/effort high', '/effort')).toBe('high')
  })

  it('injects active provider and model into the runtime identity block', () => {
    const prompt = upsertRuntimeIdentityPrompt('You are Orca.', 'anthropic', 'claude-opus-4.6')
    expect(prompt).toContain('## Orca Runtime Identity')
    expect(prompt).toContain('Active provider: anthropic')
    expect(prompt).toContain('Active model: claude-opus-4.6')
    expect(prompt).toContain('answer with these exact runtime values')
  })

  it('replaces an existing runtime identity block instead of appending duplicates', () => {
    const first = upsertRuntimeIdentityPrompt('You are Orca.', 'openai', 'gpt-5.4')
    const second = upsertRuntimeIdentityPrompt(first, 'anthropic', 'claude-opus-4.6')
    expect(second.match(/## Orca Runtime Identity/g)).toHaveLength(1)
    expect(second).toContain('Active provider: anthropic')
    expect(second).toContain('Active model: claude-opus-4.6')
    expect(second).not.toContain('Active provider: openai')
  })
})
