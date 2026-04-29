import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  streamChat: vi.fn(),
  handleProxyToolCall: vi.fn(),
  loadConfigs: vi.fn(),
  connectStartupSafe: vi.fn(),
  getToolDefinitions: vi.fn(),
  disconnectAll: vi.fn(),
  printError: vi.fn(),
  printUsageSummary: vi.fn(),
}))

vi.mock('../src/providers/openai-compat.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/providers/openai-compat.js')>()
  return {
    ...actual,
    streamChat: mockState.streamChat,
  }
})

vi.mock('../src/commands/chat-proxy-tool-call.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/commands/chat-proxy-tool-call.js')>()
  return {
    ...actual,
    handleProxyToolCall: mockState.handleProxyToolCall,
  }
})

vi.mock('../src/mcp-client.js', () => ({
  mcpClient: {
    loadConfigs: mockState.loadConfigs,
    connectStartupSafe: mockState.connectStartupSafe,
    getToolDefinitions: mockState.getToolDefinitions,
    configuredCount: 1,
    disconnectAll: mockState.disconnectAll,
  },
}))

vi.mock('../src/output.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/output.js')>()
  class FakeProgressIndicator {
    start() {}
    addText() {}
    markWorking() {}
    stop() { return { elapsed: 0 } }
  }
  return {
    ...actual,
    printError: mockState.printError,
    printUsageSummary: mockState.printUsageSummary,
    streamToken: vi.fn(),
    ensureNewline: vi.fn(),
    setLastNewline: vi.fn(),
    printToolUse: vi.fn(),
    printToolResult: vi.fn(),
    ProgressIndicator: FakeProgressIndicator,
  }
})

import { executeOneShot, loadOneShotMcpTools } from '../src/commands/chat.js'

describe('chat one-shot MCP cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.connectStartupSafe.mockResolvedValue(['demo'])
    mockState.getToolDefinitions.mockResolvedValue([
      {
        type: 'function',
        function: {
          name: 'mcp__demo__read',
          description: 'demo tool',
          parameters: { type: 'object', properties: {} },
        },
      },
    ])
    mockState.streamChat.mockImplementation(async function* () {
      yield { type: 'text', text: 'OK' }
      yield { type: 'usage', inputTokens: 1, outputTokens: 1 }
      yield { type: 'done' }
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('skips MCP auto-connect for image one-shot requests', async () => {
    const tools = await loadOneShotMcpTools(process.cwd(), false)

    expect(tools).toEqual([])
    expect(mockState.loadConfigs).not.toHaveBeenCalled()
    expect(mockState.connectStartupSafe).not.toHaveBeenCalled()
    expect(mockState.getToolDefinitions).not.toHaveBeenCalled()
  })

  it('uses startup-safe MCP auto-connect for standard one-shot requests', async () => {
    const tools = await loadOneShotMcpTools(process.cwd(), true)

    expect(tools).toHaveLength(1)
    expect(mockState.loadConfigs).toHaveBeenCalledTimes(1)
    expect(mockState.connectStartupSafe).toHaveBeenCalledTimes(1)
    expect(mockState.getToolDefinitions).toHaveBeenCalledTimes(1)
  })

  it('disconnects MCP servers after a one-shot proxy request completes', async () => {
    await executeOneShot(
      'Reply with exactly: OK',
      {
        provider: 'copilot',
        apiKey: 'test-key',
        model: 'gpt-5.4',
        baseURL: 'https://api.githubcopilot.com',
        sdkProvider: 'openai',
        headers: { 'Copilot-Integration-Id': 'vscode-chat' },
        reasoningEffort: 'xhigh',
      },
      {
        systemPrompt: 'system prompt',
        maxTurns: 25,
        permissionMode: 'bypassPermissions',
      } as never,
      'streaming',
      process.cwd(),
      [],
    )

    expect(mockState.disconnectAll).toHaveBeenCalledTimes(1)
  })

  it('injects the resolved runtime model and provider into one-shot system prompts', async () => {
    let capturedBase: Record<string, unknown> | undefined
    mockState.streamChat.mockImplementation(async function* (base: Record<string, unknown>) {
      capturedBase = base
      yield { type: 'text', text: 'OK' }
      yield { type: 'usage', inputTokens: 1, outputTokens: 1 }
      yield { type: 'done' }
    })

    await executeOneShot(
      'Which model are you using?',
      {
        provider: 'anthropic',
        apiKey: 'test-key',
        model: 'claude-opus-4.6',
        baseURL: 'https://api.anthropic.example/v1',
        sdkProvider: 'openai',
        headers: {},
        reasoningEffort: 'xhigh',
      },
      {
        systemPrompt: 'You are Orca.',
        maxTurns: 25,
        permissionMode: 'bypassPermissions',
      } as never,
      'streaming',
      process.cwd(),
      [],
    )

    expect(String(capturedBase?.systemPrompt)).toContain('Active provider: anthropic')
    expect(String(capturedBase?.systemPrompt)).toContain('Active model: claude-opus-4.6')
  })
})
