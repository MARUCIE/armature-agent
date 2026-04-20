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

import { collectFencedMultilineInput, runProxyTurn } from '../src/commands/chat.js'
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
})
