import { describe, expect, it, vi, beforeEach } from 'vitest'

const mockState = vi.hoisted(() => {
  const responses = []
  const params = []
  return { responses, params }
})

vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = {
      completions: {
        create: async (params) => {
          mockState.params.push(params)
          const factory = mockState.responses.shift()
          if (!factory) throw new Error('No more mock responses')
          return factory()
        },
      },
    }
  },
}))

vi.mock('undici', () => ({
  ProxyAgent: class {},
  fetch: async () => ({}),
}))

import { chatOnce, streamChat, type PromptContent } from '../src/providers/openai-compat.js'

async function* makeStream(chunks) {
  for (const chunk of chunks) yield chunk
}

describe('openai-compat multimodal prompt support', () => {
  const baseOpts = {
    apiKey: 'test-key',
    baseURL: 'https://test.example.com/v1/',
    model: 'claude-sonnet-4.6',
  }

  beforeEach(() => {
    mockState.responses.length = 0
    mockState.params.length = 0
  })

  it('chatOnce forwards multimodal user content to the provider', async () => {
    mockState.responses.push(() => Promise.resolve({
      choices: [{ message: { content: 'ok' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    }))

    const prompt: PromptContent = [
      { type: 'text', text: 'Analyze this image' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
    ]

    const result = await chatOnce(baseOpts, prompt)
    expect(result.text).toBe('ok')
    const lastCall = mockState.params.at(-1)
    expect(lastCall.messages.at(-1).content).toEqual(prompt)
  })

  it('streamChat accepts multimodal prompt content', async () => {
    mockState.responses.push(() => makeStream([
      { choices: [{ delta: { content: 'done' }, finish_reason: 'stop' }], usage: { prompt_tokens: 3, completion_tokens: 1 } },
    ]))

    const prompt: PromptContent = [
      { type: 'text', text: 'What is in this image?' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,BBBB' } },
    ]

    const events = []
    for await (const event of streamChat(baseOpts, prompt)) events.push(event)
    expect(events.some((e) => e.type === 'text' && e.text === 'done')).toBe(true)
    const lastCall = mockState.params.at(-1)
    expect(lastCall.messages.at(-1).content).toEqual(prompt)
  })

  it('streamChat keeps the current system prompt when history exists', async () => {
    mockState.responses.push(() => makeStream([
      { choices: [{ delta: { content: 'done' }, finish_reason: 'stop' }], usage: { prompt_tokens: 3, completion_tokens: 1 } },
    ]))

    const history = [
      { role: 'user' as const, content: 'Previous question' },
      { role: 'assistant' as const, content: 'Previous answer' },
    ]

    const events = []
    for await (const event of streamChat(
      { ...baseOpts, systemPrompt: 'Always use local tools for local files.' },
      'Open the file',
      history,
    )) events.push(event)

    expect(events.some((e) => e.type === 'text' && e.text === 'done')).toBe(true)
    const lastCall = mockState.params.at(-1)
    expect(lastCall.messages[0]).toEqual({
      role: 'system',
      content: 'Always use local tools for local files.',
    })
    expect(lastCall.messages.at(-1).content).toBe('Open the file')
  })

  it('streamChat avoids duplicating the same leading system prompt from history', async () => {
    mockState.responses.push(() => makeStream([
      { choices: [{ delta: { content: 'done' }, finish_reason: 'stop' }], usage: { prompt_tokens: 3, completion_tokens: 1 } },
    ]))

    const history = [
      { role: 'system' as const, content: 'System prompt' },
      { role: 'user' as const, content: 'Previous question' },
    ]

    const events = []
    for await (const event of streamChat(
      { ...baseOpts, systemPrompt: 'System prompt' },
      'Next question',
      history,
    )) events.push(event)

    expect(events.some((e) => e.type === 'text' && e.text === 'done')).toBe(true)
    const lastCall = mockState.params.at(-1)
    expect(lastCall.messages.filter((m) => m.role === 'system' && m.content === 'System prompt')).toHaveLength(1)
  })

  it('trims tool definitions to the Copilot provider limit', async () => {
    mockState.responses.push(() => makeStream([
      { choices: [{ delta: { content: 'done' }, finish_reason: 'stop' }], usage: { prompt_tokens: 3, completion_tokens: 1 } },
    ]))

    const tools = Array.from({ length: 178 }, (_, index) => ({
      type: 'function',
      function: {
        name: `tool_${index}`,
        description: `Tool ${index}`,
        parameters: { type: 'object', properties: {} },
      },
    }))

    const events = []
    for await (const event of streamChat(
      { ...baseOpts, baseURL: 'https://api.githubcopilot.com' },
      'test',
      undefined,
      { onToolCall: async () => ({ success: true, output: 'ok' }) },
      tools,
    )) events.push(event)

    expect(events.some((event) => event.type === 'done')).toBe(true)
    const lastCall = mockState.params.at(-1)
    expect(lastCall.tools).toHaveLength(128)
    expect(lastCall.tools[0].function.name).toBe('tool_0')
    expect(lastCall.tools.at(-1).function.name).toBe('tool_127')
  })

  it('keeps the full tool set for non-Copilot providers', async () => {
    mockState.responses.push(() => makeStream([
      { choices: [{ delta: { content: 'done' }, finish_reason: 'stop' }], usage: { prompt_tokens: 3, completion_tokens: 1 } },
    ]))

    const tools = Array.from({ length: 178 }, (_, index) => ({
      type: 'function',
      function: {
        name: `tool_${index}`,
        description: `Tool ${index}`,
        parameters: { type: 'object', properties: {} },
      },
    }))

    const events = []
    for await (const event of streamChat(
      baseOpts,
      'test',
      undefined,
      { onToolCall: async () => ({ success: true, output: 'ok' }) },
      tools,
    )) events.push(event)

    expect(events.some((event) => event.type === 'done')).toBe(true)
    const lastCall = mockState.params.at(-1)
    expect(lastCall.tools).toHaveLength(178)
    expect(lastCall.tools.at(-1).function.name).toBe('tool_177')
  })

  it('omits reasoning_effort for gpt-5 chat-completions requests when tools are present', async () => {
    mockState.responses.push(() => makeStream([
      { choices: [{ delta: { content: 'done' }, finish_reason: 'stop' }], usage: { prompt_tokens: 3, completion_tokens: 1 } },
    ]))

    const tools = [{
      type: 'function',
      function: {
        name: 'tool_0',
        description: 'Tool 0',
        parameters: { type: 'object', properties: {} },
      },
    }]

    const events = []
    for await (const event of streamChat(
      { ...baseOpts, baseURL: 'https://api.githubcopilot.com', model: 'gpt-5.4', reasoningEffort: 'xhigh' },
      'test',
      undefined,
      { onToolCall: async () => ({ success: true, output: 'ok' }) },
      tools,
    )) events.push(event)

    expect(events.some((event) => event.type === 'done')).toBe(true)
    const lastCall = mockState.params.at(-1)
    expect(lastCall.tools).toHaveLength(1)
    expect(lastCall.reasoning_effort).toBeUndefined()
  })

  it('keeps reasoning_effort when no tools are present', async () => {
    mockState.responses.push(() => makeStream([
      { choices: [{ delta: { content: 'done' }, finish_reason: 'stop' }], usage: { prompt_tokens: 3, completion_tokens: 1 } },
    ]))

    const events = []
    for await (const event of streamChat(
      { ...baseOpts, baseURL: 'https://api.githubcopilot.com', model: 'gpt-5.4', reasoningEffort: 'xhigh' },
      'test',
    )) events.push(event)

    expect(events.some((event) => event.type === 'done')).toBe(true)
    const lastCall = mockState.params.at(-1)
    expect(lastCall.reasoning_effort).toBe('xhigh')
  })

  it('rejects provider-returned tool calls outside the advertised whitelist', async () => {
    mockState.responses.push(() => makeStream([
      {
        choices: [{
          delta: {
            tool_calls: [{
              index: 0,
              id: 'call_0',
              function: {
                name: 'run_command',
                arguments: '{"command":"pwd"}',
              },
            }],
          },
          finish_reason: 'tool_calls',
        }],
        usage: { prompt_tokens: 3, completion_tokens: 1 },
      },
    ]))

    const allowedTools = [{
      type: 'function',
      function: {
        name: 'read_file',
        description: 'Read a file',
        parameters: { type: 'object', properties: {} },
      },
    }]
    const onToolCall = vi.fn()

    const events = []
    for await (const event of streamChat(
      baseOpts,
      'test',
      undefined,
      { onToolCall },
      allowedTools,
    )) events.push(event)

    expect(onToolCall).not.toHaveBeenCalled()
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'error',
        error: expect.stringContaining('disallowed tool'),
      }),
    ]))
  })

  it('rejects provider-returned tool calls when no tools were advertised', async () => {
    mockState.responses.push(() => makeStream([
      {
        choices: [{
          delta: {
            tool_calls: [{
              index: 0,
              id: 'call_0',
              function: {
                name: 'run_command',
                arguments: '{"command":"pwd"}',
              },
            }],
          },
          finish_reason: 'tool_calls',
        }],
        usage: { prompt_tokens: 3, completion_tokens: 1 },
      },
    ]))

    const onToolCall = vi.fn()
    const events = []
    for await (const event of streamChat(
      baseOpts,
      'test',
      undefined,
      { onToolCall },
    )) events.push(event)

    expect(onToolCall).not.toHaveBeenCalled()
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'error',
        error: expect.stringContaining('disallowed tool'),
      }),
    ]))
  })
})
