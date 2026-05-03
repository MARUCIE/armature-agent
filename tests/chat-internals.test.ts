import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
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

  it('repairs false local save claims when the model returns no file tool call', async () => {
    const path = join(tmpdir(), `orca-chat-false-save-${process.pid}-${Date.now()}.md`)
    const history = [{ role: 'system' as const, content: 'system prompt' }]
    chatMocks.handleProxyToolCall.mockResolvedValueOnce({ success: true, output: `Created ${path}` })
    chatMocks.streamChat.mockImplementation(async function* (_base: unknown, _prompt: unknown, _history: unknown, _runtime: unknown, tools: Array<Record<string, unknown>>) {
      expect(tools.some((tool) => (tool.function as { name?: string } | undefined)?.name === 'write_file')).toBe(true)
      yield { type: 'text', text: `Saved to \`${path}\`.\n\n# Demo\nBody\n` }
      yield { type: 'usage', inputTokens: 8, outputTokens: 9 }
      yield { type: 'done' }
    })

    const result = await runProxyTurn({
      prompt: 'Please save this as a markdown file.',
      resolved: {
        provider: 'openai',
        model: 'gpt-5.4',
        apiKey: 'key',
        baseURL: 'https://example.invalid/v1',
      } as never,
      config: { systemPrompt: 'system prompt' } as never,
      outputMode: 'streaming',
      history,
      cwd: process.cwd(),
      permissionMode: 'yolo',
      retryTracker: new RetryTracker(),
      loopDetector: new LoopDetector(),
      tokenBudget: new TokenBudgetManager('gpt-5.4'),
      contextMonitor: new ContextMonitor(200_000),
    })

    expect(result).toEqual({ inputTokens: 8, outputTokens: 9 })
    expect(chatMocks.handleProxyToolCall).toHaveBeenCalledWith(expect.objectContaining({
      name: 'write_file',
      args: expect.objectContaining({
        path,
        content: expect.stringContaining('# Demo'),
      }),
      allowedTools: expect.arrayContaining(['write_file']),
    }))
    expect(chatMocks.handleProxyToolCall.mock.calls[0]?.[0].args.content).not.toContain('Saved to')
    expect(history[2]?.content).toContain('Local file guard wrote the file')
  })

  it('writes a requested local markdown artifact when the model returns content without a file tool call', async () => {
    const path = join(tmpdir(), `orca-chat-generated-artifact-${process.pid}-${Date.now()}.md`)
    const history = [{ role: 'system' as const, content: 'system prompt' }]
    chatMocks.handleProxyToolCall.mockResolvedValueOnce({ success: true, output: `Created ${path}` })
    chatMocks.streamChat.mockImplementation(async function* () {
      yield { type: 'text', text: '# Generated\n\n- Body\n' }
      yield { type: 'usage', inputTokens: 8, outputTokens: 9 }
      yield { type: 'done' }
    })

    const result = await runProxyTurn({
      prompt: `请生成一个 md 文件并保存到 \`${path}\``,
      resolved: {
        provider: 'openai',
        model: 'gpt-5.4',
        apiKey: 'key',
        baseURL: 'https://example.invalid/v1',
      } as never,
      config: { systemPrompt: 'system prompt' } as never,
      outputMode: 'streaming',
      history,
      cwd: process.cwd(),
      permissionMode: 'yolo',
      retryTracker: new RetryTracker(),
      loopDetector: new LoopDetector(),
      tokenBudget: new TokenBudgetManager('gpt-5.4'),
      contextMonitor: new ContextMonitor(200_000),
    })

    expect(result).toEqual({ inputTokens: 8, outputTokens: 9 })
    expect(chatMocks.handleProxyToolCall).toHaveBeenCalledWith(expect.objectContaining({
      name: 'write_file',
      args: {
        path,
        content: '# Generated\n\n- Body\n',
      },
    }))
    expect(history[2]?.content).toContain('Local file guard wrote the requested generated file')
    expect(history[2]?.content).not.toContain('Local file enforcement')
  })

  it('marks a local file request incomplete when the model refuses instead of using file tools', async () => {
    const path = join(tmpdir(), `orca-chat-refused-artifact-${process.pid}-${Date.now()}.md`)
    const history = [{ role: 'system' as const, content: 'system prompt' }]
    chatMocks.streamChat.mockImplementation(async function* () {
      yield { type: 'text', text: `无法在你的本地创建文件。你可以自己保存到 \`${path}\`。` }
      yield { type: 'usage', inputTokens: 8, outputTokens: 9 }
      yield { type: 'done' }
    })

    await runProxyTurn({
      prompt: `请生成一个 md 文件并保存到 \`${path}\``,
      resolved: {
        provider: 'openai',
        model: 'gpt-5.4',
        apiKey: 'key',
        baseURL: 'https://example.invalid/v1',
      } as never,
      config: { systemPrompt: 'system prompt' } as never,
      outputMode: 'streaming',
      history,
      cwd: process.cwd(),
      permissionMode: 'yolo',
      retryTracker: new RetryTracker(),
      loopDetector: new LoopDetector(),
      tokenBudget: new TokenBudgetManager('gpt-5.4'),
      contextMonitor: new ContextMonitor(200_000),
    })

    expect(chatMocks.handleProxyToolCall).not.toHaveBeenCalled()
    expect(history[2]?.content).toContain('Local file enforcement')
    expect(history[2]?.content).toContain('missing write_file')
  })

  it('appends a claim evidence guard when completion claims lack supporting tools', async () => {
    const history = [{ role: 'system' as const, content: 'system prompt' }]
    chatMocks.streamChat.mockImplementation(async function* () {
      yield { type: 'text', text: 'I ran npm test and all tests passed.' }
      yield { type: 'usage', inputTokens: 4, outputTokens: 5 }
      yield { type: 'done' }
    })

    await runProxyTurn({
      prompt: 'verify the project',
      resolved: {
        provider: 'openai',
        model: 'gpt-5.4',
        apiKey: 'key',
        baseURL: 'https://example.invalid/v1',
      } as never,
      config: { systemPrompt: 'system prompt' } as never,
      outputMode: 'streaming',
      history,
      cwd: process.cwd(),
      retryTracker: new RetryTracker(),
      loopDetector: new LoopDetector(),
      tokenBudget: new TokenBudgetManager('gpt-5.4'),
      contextMonitor: new ContextMonitor(200_000),
    })

    expect(history[2]?.content).toContain('Claim evidence guard')
    expect(history[2]?.content).toContain('tests, lint, build, typecheck, or checks')
  })

  it('does not append a claim evidence guard when a matching tool ran', async () => {
    const history = [{ role: 'system' as const, content: 'system prompt' }]
    chatMocks.handleProxyToolCall.mockResolvedValueOnce({ success: true, output: 'tests passed' })
    chatMocks.streamChat.mockImplementation(async function* (_base: unknown, _prompt: unknown, _history: unknown, runtime: { onToolCall?: (name: string, args: Record<string, unknown>) => Promise<unknown> }) {
      await runtime.onToolCall?.('run_command', { command: 'npm test' })
      yield { type: 'text', text: 'I ran npm test and all tests passed.' }
      yield { type: 'usage', inputTokens: 4, outputTokens: 5 }
      yield { type: 'done' }
    })

    await runProxyTurn({
      prompt: 'verify the project',
      resolved: {
        provider: 'openai',
        model: 'gpt-5.4',
        apiKey: 'key',
        baseURL: 'https://example.invalid/v1',
      } as never,
      config: { systemPrompt: 'system prompt' } as never,
      outputMode: 'streaming',
      history,
      cwd: process.cwd(),
      retryTracker: new RetryTracker(),
      loopDetector: new LoopDetector(),
      tokenBudget: new TokenBudgetManager('gpt-5.4'),
      contextMonitor: new ContextMonitor(200_000),
    })

    expect(history[2]?.content).toContain('I ran npm test')
    expect(history[2]?.content).not.toContain('Claim evidence guard')
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
