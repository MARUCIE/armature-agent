import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RetryTracker } from '../src/retry-intelligence.js'
import { ChatSessionEmitter } from '../src/ui/session.js'

const mockState = vi.hoisted(() => ({
  askPermission: vi.fn(),
  printDiffPreview: vi.fn(),
  hasHooks: vi.fn(),
  runHook: vi.fn(),
  listResources: vi.fn(),
  readResource: vi.fn(),
  routeToolCall: vi.fn(),
  autoVerify: vi.fn(),
  formatVerifyOutput: vi.fn(),
  spawnSubAgent: vi.fn(),
  readlineAnswer: 'Yes',
}))

vi.mock('../src/output.js', () => ({
  askPermission: mockState.askPermission,
  printDiffPreview: mockState.printDiffPreview,
}))

vi.mock('../src/hooks.js', () => ({
  hooks: {
    hasHooks: mockState.hasHooks,
    run: mockState.runHook,
  },
}))

vi.mock('../src/mcp-client.js', () => ({
  mcpClient: {
    listResources: mockState.listResources,
    readResource: mockState.readResource,
    routeToolCall: mockState.routeToolCall,
  },
}))

vi.mock('../src/auto-verify.js', () => ({
  autoVerify: mockState.autoVerify,
  formatVerifyOutput: mockState.formatVerifyOutput,
}))

vi.mock('../src/agent/sub-agent.js', () => ({
  spawnSubAgent: mockState.spawnSubAgent,
  READ_ONLY_TOOLS: ['read_file'],
  DELEGATE_TOOLS: ['write_file', 'edit_file', 'multi_edit', 'run_command', 'run_background'],
}))

vi.mock('node:readline', () => ({
  createInterface: () => ({
    question: (_prompt: string, callback: (input: string) => void) => callback(mockState.readlineAnswer),
    close: vi.fn(),
  }),
}))

import { handleProxyToolCall, ResetSensitiveWaitCanceledError } from '../src/commands/chat-proxy-tool-call.js'

const baseParams = {
  history: [] as Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
  resolved: {
    model: 'gpt-5.4',
    apiKey: 'test-key',
    baseURL: 'https://example.invalid/v1',
  },
}

beforeEach(() => {
  mockState.askPermission.mockReset()
  mockState.askPermission.mockResolvedValue(true)
  mockState.printDiffPreview.mockReset()
  mockState.hasHooks.mockReset()
  mockState.hasHooks.mockReturnValue(false)
  mockState.runHook.mockReset()
  mockState.runHook.mockResolvedValue({ continue: true })
  mockState.listResources.mockReset()
  mockState.readResource.mockReset()
  mockState.routeToolCall.mockReset()
  mockState.autoVerify.mockReset()
  mockState.autoVerify.mockReturnValue({ ok: true })
  mockState.formatVerifyOutput.mockReset()
  mockState.formatVerifyOutput.mockReturnValue('')
  mockState.spawnSubAgent.mockReset()
  mockState.spawnSubAgent.mockResolvedValue({
    success: true,
    output: 'delegated ok',
    duration: 1000,
    tokensUsed: 12,
  })
  mockState.readlineAnswer = 'Yes'
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('chat proxy tool helper', () => {
  it('blocks dangerous tools when safe mode permission is denied', async () => {
    mockState.askPermission.mockResolvedValue(false)

    const cwd = mkdtempSync(join(tmpdir(), 'orca-proxy-tool-'))
    const result = await handleProxyToolCall({
      ...baseParams,
      cwd,
      name: 'run_command',
      args: { command: 'echo hello' },
      safeMode: true,
    })

    expect(result).toEqual({ success: false, output: 'User denied permission.' })
    expect(mockState.askPermission).toHaveBeenCalledWith('run_command', 'run: echo hello')
  })

  it('does not update undo state when a safe-mode write is denied', async () => {
    mockState.askPermission.mockResolvedValue(false)

    const cwd = mkdtempSync(join(tmpdir(), 'orca-proxy-tool-'))
    const onFileWrite = vi.fn()
    const result = await handleProxyToolCall({
      ...baseParams,
      cwd,
      name: 'write_file',
      args: { path: 'src/generated.ts', content: 'export const blocked = true\n' },
      safeMode: true,
      onFileWrite,
    })

    expect(result).toEqual({ success: false, output: 'User denied permission.' })
    expect(onFileWrite).not.toHaveBeenCalled()
  })

  it('returns ask_user answers through the ink session emitter', async () => {
    const session = new ChatSessionEmitter()
    const messages: string[] = []
    session.on('system_message', (event) => { messages.push(event.text) })

    const pending = handleProxyToolCall({
      ...baseParams,
      cwd: process.cwd(),
      name: 'ask_user',
      args: {
        question: 'Continue?',
        options: ['Yes', 'No'],
      },
      session,
    })

    session.submitInput('Yes')
    const result = await pending

    expect(result).toEqual({ success: true, output: 'Yes' })
    expect(messages.join('\n')).toContain('? Continue?')
    expect(messages.join('\n')).toContain('1. Yes')
    expect(messages.join('\n')).toContain('2. No')
  })

  it('maps numeric ask_user selections to option text', async () => {
    const session = new ChatSessionEmitter()

    const pending = handleProxyToolCall({
      ...baseParams,
      cwd: process.cwd(),
      name: 'ask_user',
      args: {
        question: 'Continue?',
        options: ['Yes', 'No'],
      },
      session,
    })

    session.submitInput('1')
    await expect(pending).resolves.toEqual({ success: true, output: 'Yes' })
  })

  it('rejects invalid ask_user selections for session-backed prompts', async () => {
    const session = new ChatSessionEmitter()

    const pending = handleProxyToolCall({
      ...baseParams,
      cwd: process.cwd(),
      name: 'ask_user',
      args: {
        question: 'Continue?',
        options: ['Yes', 'No'],
      },
      session,
    })

    session.submitInput('maybe')
    await expect(pending).resolves.toMatchObject({
      success: false,
    })
    const result = await pending
    expect(result.output).toContain('Invalid selection. Choose one of: 1. Yes, 2. No')
  })

  it('emits prompt_ready only once for ask_user', async () => {
    const session = new ChatSessionEmitter()
    let promptReadyCount = 0
    session.on('prompt_ready', () => { promptReadyCount += 1 })

    const pending = handleProxyToolCall({
      ...baseParams,
      cwd: process.cwd(),
      name: 'ask_user',
      args: {
        question: 'Continue?',
      },
      session,
    })

    await Promise.resolve()
    session.submitInput('Yes')
    await pending

    expect(promptReadyCount).toBe(1)
  })

  it('tolerates malformed ask_user options', async () => {
    const session = new ChatSessionEmitter()

    const pending = handleProxyToolCall({
      ...baseParams,
      cwd: process.cwd(),
      name: 'ask_user',
      args: {
        question: 'Continue?',
        options: 'yes',
      },
      session,
    })

    session.submitInput('Yes')
    await expect(pending).resolves.toEqual({ success: true, output: 'Yes' })
  })

  it('applies option validation in readline-backed ask_user prompts', async () => {
    mockState.readlineAnswer = '2'

    await expect(handleProxyToolCall({
      ...baseParams,
      cwd: process.cwd(),
      name: 'ask_user',
      args: {
        question: 'Continue?',
        options: ['Yes', 'No'],
      },
    })).resolves.toEqual({ success: true, output: 'No' })

    mockState.readlineAnswer = 'later'
    const invalidResult = await handleProxyToolCall({
      ...baseParams,
      cwd: process.cwd(),
      name: 'ask_user',
      args: {
        question: 'Continue?',
        options: ['Yes', 'No'],
      },
    })
    expect(invalidResult.success).toBe(false)
    expect(invalidResult.output).toContain('Invalid selection. Choose one of: 1. Yes, 2. No')
  })

  it('aborts ask_user when the session is cleared', async () => {
    const session = new ChatSessionEmitter()
    let promptReadyCount = 0
    session.on('prompt_ready', () => { promptReadyCount += 1 })

    const pending = handleProxyToolCall({
      ...baseParams,
      cwd: process.cwd(),
      name: 'ask_user',
      args: {
        question: 'Continue?',
      },
      session,
    })

    await Promise.resolve()
    expect(promptReadyCount).toBe(1)
    session.emitClear()
    await expect(pending).rejects.toBeInstanceOf(ResetSensitiveWaitCanceledError)
  })

  it('fires PostToolUse for ask_user', async () => {
    mockState.hasHooks.mockImplementation((hook) => hook === 'PostToolUse')
    const session = new ChatSessionEmitter()

    const pending = handleProxyToolCall({
      ...baseParams,
      cwd: process.cwd(),
      name: 'ask_user',
      args: {
        question: 'Continue?',
      },
      session,
    })

    session.submitInput('Yes')
    await pending

    expect(mockState.runHook).toHaveBeenCalledWith('PostToolUse', expect.objectContaining({
      event: 'PostToolUse',
      toolName: 'ask_user',
      toolSuccess: true,
    }))
  })

  it('adds retry and classifier hints to failed tool executions', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'orca-proxy-tool-'))
    const result = await handleProxyToolCall({
      ...baseParams,
      cwd,
      name: 'edit_file',
      args: {
        path: 'missing.ts',
        old_string: 'before',
        new_string: 'after',
      },
      retryTracker: new RetryTracker(1),
    })

    expect(result.success).toBe(false)
    expect(result.output).toContain('[retry-intelligence]')
    expect(result.output).toContain('[error-classifier] not_found:')
  })

  it('does not update undo state for failed file edits', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'orca-proxy-tool-'))
    writeFileSync(join(cwd, 'existing.ts'), 'const value = 1\n', 'utf-8')
    const onFileWrite = vi.fn()

    const result = await handleProxyToolCall({
      ...baseParams,
      cwd,
      name: 'edit_file',
      args: {
        path: 'existing.ts',
        old_string: 'missing',
        new_string: 'updated',
      },
      onFileWrite,
      retryTracker: new RetryTracker(1),
    })

    expect(result.success).toBe(false)
    expect(onFileWrite).not.toHaveBeenCalled()
  })

  it('uses hook-rewritten write targets for approval and undo snapshots', async () => {
    mockState.hasHooks.mockReturnValue(true)
    mockState.runHook.mockResolvedValue({
      continue: true,
      updatedInput: {
        path: 'rewritten.ts',
        content: 'export const rewritten = true\n',
      },
    })

    const cwd = mkdtempSync(join(tmpdir(), 'orca-proxy-tool-'))
    const onFileWrite = vi.fn()
    const result = await handleProxyToolCall({
      ...baseParams,
      cwd,
      name: 'write_file',
      args: {
        path: 'original.ts',
        content: 'export const original = true\n',
      },
      safeMode: true,
      onFileWrite,
    })

    expect(result.success).toBe(true)
    expect(mockState.askPermission).toHaveBeenCalledWith('write_file', 'write 30 bytes to rewritten.ts')
    expect(readFileSync(join(cwd, 'rewritten.ts'), 'utf-8')).toBe('export const rewritten = true\n')
    expect(onFileWrite).toHaveBeenCalledWith(join(cwd, 'rewritten.ts'), null)
  })

  it('blocks delegate_task in safe mode', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'orca-proxy-tool-'))
    const result = await handleProxyToolCall({
      ...baseParams,
      cwd,
      name: 'delegate_task',
      args: {
        task: 'modify files',
      },
      safeMode: true,
    })

    expect(result.success).toBe(false)
    expect(result.output).toContain('delegate_task is disabled in safe mode.')
    expect(mockState.spawnSubAgent).not.toHaveBeenCalled()
  })

  it('fires PostToolUse for delegate_task', async () => {
    mockState.hasHooks.mockImplementation((hook) => hook === 'PostToolUse')
    const cwd = mkdtempSync(join(tmpdir(), 'orca-proxy-tool-'))

    const result = await handleProxyToolCall({
      ...baseParams,
      cwd,
      name: 'delegate_task',
      args: {
        task: 'summarize the failure',
      },
    })

    expect(result.success).toBe(true)
    expect(mockState.runHook).toHaveBeenCalledWith('PostToolUse', expect.objectContaining({
      event: 'PostToolUse',
      toolName: 'delegate_task',
      toolSuccess: true,
    }))
  })

  it('appends auto-verify output after successful file writes', async () => {
    mockState.formatVerifyOutput.mockReturnValue('\n[auto-verify] ok')

    const cwd = mkdtempSync(join(tmpdir(), 'orca-proxy-tool-'))
    const onFileWrite = vi.fn()
    const result = await handleProxyToolCall({
      ...baseParams,
      cwd,
      name: 'write_file',
      args: {
        path: 'src/generated.ts',
        content: 'export const generated = true\n',
      },
      onFileWrite,
    })

    expect(result.success).toBe(true)
    expect(mockState.autoVerify).toHaveBeenCalledWith(join(cwd, 'src/generated.ts'), cwd)
    expect(result.output).toContain('[auto-verify] ok')
    expect(readFileSync(join(cwd, 'src/generated.ts'), 'utf-8')).toBe('export const generated = true\n')
    expect(onFileWrite).toHaveBeenCalledWith(join(cwd, 'src/generated.ts'), null)
  })
})
