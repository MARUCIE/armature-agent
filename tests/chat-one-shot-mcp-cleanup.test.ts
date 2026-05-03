import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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

import { emitOneShotAutoCritiqueNotice, executeOneShot, loadOneShotMcpTools } from '../src/commands/chat.js'
import { hooks } from '../src/hooks.js'

function runGit(cwd: string, args: string[]): void {
  execFileSync('git', args, { cwd, stdio: 'ignore' })
}

function createDirtyWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), 'orca-one-shot-critique-'))
  runGit(dir, ['init'])
  runGit(dir, ['config', 'user.email', 'test@example.com'])
  runGit(dir, ['config', 'user.name', 'Test User'])
  writeFileSync(join(dir, 'large.txt'), 'baseline\n')
  runGit(dir, ['add', 'large.txt'])
  runGit(dir, ['commit', '-m', 'baseline'])
  writeFileSync(join(dir, 'large.txt'), Array.from({ length: 900 }, (_, index) => `line ${index}`).join('\n'))
  return dir
}

describe('chat one-shot MCP cleanup', () => {
  const previousHome = process.env.HOME

  beforeEach(() => {
    hooks.resetForTests()
    process.env.HOME = previousHome
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
    hooks.resetForTests()
    if (previousHome === undefined) delete process.env.HOME
    else process.env.HOME = previousHome
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

  it('loads one-shot hooks and injects UserPromptSubmit context before the model call', async () => {
    const home = mkdtempSync(join(tmpdir(), 'orca-one-shot-hooks-home-'))
    mkdirSync(join(home, '.orca'), { recursive: true })
    writeFileSync(join(home, '.orca', 'hooks.json'), JSON.stringify({
      UserPromptSubmit: [{
        command: 'printf "%s" "review claims before answering"',
      }],
    }))
    process.env.HOME = home
    hooks.resetForTests()

    let capturedPrompt: unknown
    mockState.streamChat.mockImplementation(async function* (_base: unknown, prompt: unknown) {
      capturedPrompt = prompt
      yield { type: 'text', text: 'OK' }
      yield { type: 'usage', inputTokens: 1, outputTokens: 1 }
      yield { type: 'done' }
    })

    try {
      await executeOneShot(
        'Answer normally.',
        {
          provider: 'copilot',
          apiKey: 'test-key',
          model: 'gpt-5.4',
          baseURL: 'https://api.githubcopilot.com',
          sdkProvider: 'openai',
          headers: {},
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

      expect(String(capturedPrompt)).toContain('review claims before answering')
      expect(String(capturedPrompt)).toContain('orca_hook_context')
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })

  it('fires Stop hooks for one-shot proxy responses with response evidence', async () => {
    const home = mkdtempSync(join(tmpdir(), 'orca-one-shot-stop-home-'))
    const hookDir = join(home, '.orca')
    mkdirSync(hookDir, { recursive: true })
    writeFileSync(join(home, '.orca', 'hooks.json'), JSON.stringify({
      Stop: [{
        command: 'python3 -c "import os, pathlib; pathlib.Path(\'stop-response.txt\').write_text(os.environ.get(\'ORCA_RESPONSE\', \'\'))"',
      }],
    }))
    process.env.HOME = home
    hooks.resetForTests()

    try {
      await executeOneShot(
        'Reply with OK.',
        {
          provider: 'copilot',
          apiKey: 'test-key',
          model: 'gpt-5.4',
          baseURL: 'https://api.githubcopilot.com',
          sdkProvider: 'openai',
          headers: {},
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

      expect(readFileSync(join(hookDir, 'stop-response.txt'), 'utf-8')).toContain('OK')
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })

  it('emits one-shot auto critique notices only for streaming output', () => {
    const dir = createDirtyWorkspace()
    const notices: string[] = []

    try {
      emitOneShotAutoCritiqueNotice({
        cwd: dir,
        activeModel: 'gpt-5.4',
        outputMode: 'streaming',
        writeNotice: (text) => notices.push(text),
      })
      emitOneShotAutoCritiqueNotice({
        cwd: dir,
        activeModel: 'gpt-5.4',
        outputMode: 'json',
        writeNotice: (text) => notices.push(text),
      })

      expect(notices).toHaveLength(1)
      expect(notices[0]).toContain('critique checkpoint recommended')
      expect(notices[0]).toContain('/critique --checkpoint after_complex_implementation')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
