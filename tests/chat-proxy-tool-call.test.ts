import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { addStoredPermissionRule, readStoredPermissionAllowlist } from '../src/config.js'
import { RetryTracker } from '../src/retry-intelligence.js'
import { ChatSessionEmitter } from '../src/ui/session.js'
import type { ToolApprovalEventInput } from '../src/policy-executor.js'

const mockState = vi.hoisted(() => ({
  askPermission: vi.fn(),
  printDiffPreview: vi.fn(),
  loadHooks: vi.fn(),
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
    load: mockState.loadHooks,
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
import { buildPermissionRuleKey } from '../src/policy-executor.js'

const baseParams = {
  history: [] as Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
  resolved: {
    model: 'gpt-5.4',
    apiKey: 'test-key',
    baseURL: 'https://example.invalid/v1',
  },
}

function initGitRepo(cwd: string) {
  execFileSync('git', ['init'], { cwd, stdio: 'ignore' })
  execFileSync('git', ['config', 'user.name', 'Test User'], { cwd, stdio: 'ignore' })
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd, stdio: 'ignore' })
}

function getRepoRoot(cwd: string): string {
  return execFileSync('git', ['rev-parse', '--show-toplevel'], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim()
}

beforeEach(() => {
  mockState.askPermission.mockReset()
  mockState.askPermission.mockResolvedValue({ allowed: true, scope: 'once' })
  mockState.printDiffPreview.mockReset()
  mockState.loadHooks.mockReset()
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
  it('blocks dangerous tools when auto permission mode is denied', async () => {
    mockState.askPermission.mockResolvedValue({ allowed: false, scope: 'once' })

    const cwd = mkdtempSync(join(tmpdir(), 'armature-proxy-tool-'))
    const approvals: ToolApprovalEventInput[] = []
    const result = await handleProxyToolCall({
      ...baseParams,
      cwd,
      name: 'run_command',
      args: { command: 'echo hello' },
      permissionMode: 'auto',
      recordApprovalEvent: (event) => approvals.push(event),
    })

    expect(result).toEqual({ success: false, output: 'User denied permission.' })
    expect(mockState.askPermission).toHaveBeenCalledWith('run_command', 'run: echo hello')
    expect(approvals).toEqual([{
      toolName: 'run_command',
      ruleKey: 'run_command|command=echo hello',
      preview: 'run: echo hello',
      permissionMode: 'auto',
      decision: 'denied',
      scope: 'once',
      source: 'prompt',
    }])
  })

  it('requires approval for fetch_url in auto permission mode', async () => {
    mockState.askPermission.mockResolvedValue({ allowed: false, scope: 'once' })

    const cwd = mkdtempSync(join(tmpdir(), 'armature-proxy-tool-'))
    const result = await handleProxyToolCall({
      ...baseParams,
      cwd,
      name: 'fetch_url',
      args: { url: 'https://example.com/' },
      permissionMode: 'auto',
    })

    expect(result).toEqual({ success: false, output: 'User denied permission.' })
    expect(mockState.askPermission).toHaveBeenCalledWith('fetch_url', expect.stringContaining('https://example.com/'))
  })

  it('requires approval for web_search in auto permission mode', async () => {
    mockState.askPermission.mockResolvedValue({ allowed: false, scope: 'once' })

    const cwd = mkdtempSync(join(tmpdir(), 'armature-proxy-tool-'))
    const result = await handleProxyToolCall({
      ...baseParams,
      cwd,
      name: 'web_search',
      args: { query: 'armature cli' },
      permissionMode: 'auto',
    })

    expect(result).toEqual({ success: false, output: 'User denied permission.' })
    expect(mockState.askPermission).toHaveBeenCalledWith('web_search', expect.stringContaining('armature cli'))
  })

  it('does not update undo state when auto-mode write is denied', async () => {
    mockState.askPermission.mockResolvedValue({ allowed: false, scope: 'once' })

    const cwd = mkdtempSync(join(tmpdir(), 'armature-proxy-tool-'))
    const onFileWrite = vi.fn()
    const result = await handleProxyToolCall({
      ...baseParams,
      cwd,
      name: 'write_file',
      args: { path: 'src/generated.ts', content: 'export const blocked = true\n' },
      permissionMode: 'auto',
      onFileWrite,
    })

    expect(result).toEqual({ success: false, output: 'User denied permission.' })
    expect(onFileWrite).not.toHaveBeenCalled()
  })

  it('remembers approved tools for the current session after a successful execution', async () => {
    mockState.askPermission.mockResolvedValueOnce({ allowed: true, scope: 'session' })

    const cwd = mkdtempSync(join(tmpdir(), 'armature-proxy-tool-'))
    writeFileSync(join(cwd, 'note.txt'), 'hello session permissions\n')
    const sessionRules = new Set<string>()
    const approvals: ToolApprovalEventInput[] = []
    const params = {
      ...baseParams,
      cwd,
      name: 'read_file',
      args: { path: 'note.txt' },
      permissionMode: 'plan' as const,
      isPermissionGranted: (ruleKey: string) => sessionRules.has(ruleKey),
      recordPermissionGrant: (ruleKey: string, scope: 'session' | 'project') => {
        if (scope === 'session') sessionRules.add(ruleKey)
      },
      recordApprovalEvent: (event) => approvals.push(event),
    }

    await handleProxyToolCall(params)
    await handleProxyToolCall(params)

    expect(mockState.askPermission).toHaveBeenCalledTimes(1)
    expect(sessionRules.size).toBe(1)
    expect(approvals.map((event) => event.decision)).toEqual(['allowed', 'preapproved'])
    expect(approvals[0]).toMatchObject({
      toolName: 'read_file',
      ruleKey: 'read_file|path=note.txt',
      permissionMode: 'plan',
      scope: 'session',
      source: 'prompt',
    })
    expect(approvals[1]).toMatchObject({
      toolName: 'read_file',
      ruleKey: 'read_file|path=note.txt',
      permissionMode: 'plan',
      source: 'allowlist',
    })
  })

  it('persists approved tools into the project allowlist', async () => {
    mockState.askPermission.mockResolvedValueOnce({ allowed: true, scope: 'project' })

    const cwd = mkdtempSync(join(tmpdir(), 'armature-proxy-tool-'))
    writeFileSync(join(cwd, 'note.txt'), 'hello project permissions\n')
    const params = {
      ...baseParams,
      cwd,
      name: 'read_file',
      args: { path: 'note.txt' },
      permissionMode: 'plan' as const,
      isPermissionGranted: (ruleKey: string) => readStoredPermissionAllowlist('project', cwd).includes(ruleKey),
      recordPermissionGrant: (ruleKey: string, scope: 'session' | 'project') => {
        if (scope === 'project') addStoredPermissionRule('project', cwd, ruleKey)
      },
    }

    await handleProxyToolCall(params)
    await handleProxyToolCall(params)

    expect(mockState.askPermission).toHaveBeenCalledTimes(1)
    expect(readStoredPermissionAllowlist('project', cwd)).toHaveLength(1)
  })

  it('does not persist approved project grants when the tool execution fails', async () => {
    mockState.askPermission.mockResolvedValueOnce({ allowed: true, scope: 'project' })

    const cwd = mkdtempSync(join(tmpdir(), 'armature-proxy-tool-'))
    const params = {
      ...baseParams,
      cwd,
      name: 'read_file',
      args: { path: 'missing.txt' },
      permissionMode: 'plan' as const,
      isPermissionGranted: (ruleKey: string) => readStoredPermissionAllowlist('project', cwd).includes(ruleKey),
      recordPermissionGrant: (ruleKey: string, scope: 'session' | 'project') => {
        if (scope === 'project') addStoredPermissionRule('project', cwd, ruleKey)
      },
    }

    const result = await handleProxyToolCall(params)

    expect(result.success).toBe(false)
    expect(mockState.askPermission).toHaveBeenCalledTimes(1)
    expect(readStoredPermissionAllowlist('project', cwd)).toHaveLength(0)
  })

  it('uses stable path-based permission keys for file writes', async () => {
    mockState.askPermission.mockResolvedValueOnce({ allowed: true, scope: 'session' })

    const cwd = mkdtempSync(join(tmpdir(), 'armature-proxy-tool-'))
    const sessionRules = new Set<string>()

    await handleProxyToolCall({
      ...baseParams,
      cwd,
      name: 'write_file',
      args: { path: 'src/generated.ts', content: 'export const first = true\n' },
      permissionMode: 'plan',
      isPermissionGranted: (ruleKey: string) => sessionRules.has(ruleKey),
      recordPermissionGrant: (ruleKey: string, scope: 'session' | 'project') => {
        if (scope === 'session') sessionRules.add(ruleKey)
      },
    })

    await handleProxyToolCall({
      ...baseParams,
      cwd,
      name: 'write_file',
      args: { path: 'src/generated.ts', content: 'export const second = true\n' },
      permissionMode: 'plan',
      isPermissionGranted: (ruleKey: string) => sessionRules.has(ruleKey),
      recordPermissionGrant: (ruleKey: string, scope: 'session' | 'project') => {
        if (scope === 'session') sessionRules.add(ruleKey)
      },
    })

    expect(mockState.askPermission).toHaveBeenCalledTimes(1)
    expect([...sessionRules]).toEqual(['write_file|path=src/generated.ts'])
  })

  it('uses stable repo-based permission keys for git commits', () => {
    const firstRepo = mkdtempSync(join(tmpdir(), 'armature-git-commit-a-'))
    const secondRepo = mkdtempSync(join(tmpdir(), 'armature-git-commit-b-'))
    initGitRepo(firstRepo)
    initGitRepo(secondRepo)
    const firstRepoRoot = getRepoRoot(firstRepo)
    const secondRepoRoot = getRepoRoot(secondRepo)

    expect(buildPermissionRuleKey('git_commit', { message: 'chore: first commit' }, firstRepo))
      .toBe(`git_commit|repo=${firstRepoRoot}`)
    expect(buildPermissionRuleKey('git_commit', { message: 'fix: second commit' }, firstRepo))
      .toBe(`git_commit|repo=${firstRepoRoot}`)
    expect(buildPermissionRuleKey('git_commit', { message: 'fix: second commit' }, secondRepo))
      .toBe(`git_commit|repo=${secondRepoRoot}`)
  })

  it('returns ask_user answers through the ink session emitter', async () => {
    const session = new ChatSessionEmitter()
    const requests: Array<{ title: string; options: string[] }> = []
    session.on('option_picker_request', (event) => {
      requests.push({
        title: event.request.title,
        options: event.request.options.map((option) => option.label),
      })
      event.request.resolve('Yes')
    })

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

    const result = await pending

    expect(result).toEqual({ success: true, output: 'Yes' })
    expect(requests).toEqual([{ title: 'Continue?', options: ['Yes', 'No'] }])
  })

  it('maps numeric ask_user selections to option text', async () => {
    const session = new ChatSessionEmitter()
    session.on('option_picker_request', (event) => {
      event.request.resolve('1')
    })

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

    await expect(pending).resolves.toEqual({ success: true, output: 'Yes' })
  })

  it('rejects invalid ask_user selections for session-backed prompts', async () => {
    const session = new ChatSessionEmitter()
    session.on('option_picker_request', (event) => {
      event.request.resolve('maybe')
    })

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
    await Promise.resolve()
    session.submitInput('Yes')
    await pending

    expect(promptReadyCount).toBe(1)
  })

  it('emits option_picker_request for ask_user options instead of prompt_ready', async () => {
    const session = new ChatSessionEmitter()
    let promptReadyCount = 0
    let pickerCount = 0
    session.on('prompt_ready', () => { promptReadyCount += 1 })
    session.on('option_picker_request', (event) => {
      pickerCount += 1
      event.request.resolve('No')
    })

    await expect(handleProxyToolCall({
      ...baseParams,
      cwd: process.cwd(),
      name: 'ask_user',
      args: {
        question: 'Continue?',
        options: ['Yes', 'No'],
      },
      session,
    })).resolves.toEqual({ success: true, output: 'No' })

    expect(promptReadyCount).toBe(0)
    expect(pickerCount).toBe(1)
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
    const cwd = mkdtempSync(join(tmpdir(), 'armature-proxy-tool-'))
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
    const cwd = mkdtempSync(join(tmpdir(), 'armature-proxy-tool-'))
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

    const cwd = mkdtempSync(join(tmpdir(), 'armature-proxy-tool-'))
    const onFileWrite = vi.fn()
    const result = await handleProxyToolCall({
      ...baseParams,
      cwd,
      name: 'write_file',
      args: {
        path: 'original.ts',
        content: 'export const original = true\n',
      },
      permissionMode: 'auto',
      onFileWrite,
    })

    expect(result.success).toBe(true)
    expect(mockState.askPermission).toHaveBeenCalledWith('write_file', 'write 30 bytes to rewritten.ts')
    expect(readFileSync(join(cwd, 'rewritten.ts'), 'utf-8')).toBe('export const rewritten = true\n')
    expect(onFileWrite).toHaveBeenCalledWith(join(cwd, 'rewritten.ts'), null)
  })

  it('blocks delegate_task outside yolo mode', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'armature-proxy-tool-'))
    const result = await handleProxyToolCall({
      ...baseParams,
      cwd,
      name: 'delegate_task',
      args: {
        task: 'modify files',
      },
      permissionMode: 'auto',
    })

    expect(result.success).toBe(false)
    expect(result.output).toContain('delegate_task is disabled in safe mode.')
    expect(mockState.spawnSubAgent).not.toHaveBeenCalled()
  })

  it('prompts for non-dangerous tools in plan mode', async () => {
    mockState.askPermission.mockResolvedValue({ allowed: false, scope: 'once' })

    const cwd = mkdtempSync(join(tmpdir(), 'armature-proxy-tool-'))
    const result = await handleProxyToolCall({
      ...baseParams,
      cwd,
      name: 'read_file',
      args: { path: 'missing.ts' },
      permissionMode: 'plan',
    })

    expect(result).toEqual({ success: false, output: 'User denied permission.' })
    expect(mockState.askPermission).toHaveBeenCalledWith('read_file', expect.stringContaining('read_file'))
  })

  it('enforces allowedTools before executing the tool', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'armature-proxy-tool-'))
    writeFileSync(join(cwd, 'note.txt'), 'hello\n', 'utf-8')

    const result = await handleProxyToolCall({
      ...baseParams,
      cwd,
      name: 'read_file',
      args: { path: 'note.txt' },
      permissionMode: 'yolo',
      allowedTools: ['list_directory'],
    })

    expect(result.success).toBe(false)
    expect(result.output).toContain('not allowed in the current policy')
  })

  it('fires PostToolUse for delegate_task', async () => {
    mockState.hasHooks.mockImplementation((hook) => hook === 'PostToolUse')
    const cwd = mkdtempSync(join(tmpdir(), 'armature-proxy-tool-'))

    const result = await handleProxyToolCall({
      ...baseParams,
      cwd,
      name: 'delegate_task',
      args: {
        task: 'summarize the failure',
      },
      permissionMode: 'yolo',
    })

    expect(result.success).toBe(true)
    expect(mockState.runHook).toHaveBeenCalledWith('SubagentStop', expect.objectContaining({
      event: 'SubagentStop',
      toolOutput: 'delegated ok',
      toolSuccess: true,
    }))
    expect(mockState.runHook).toHaveBeenCalledWith('PostToolUse', expect.objectContaining({
      event: 'PostToolUse',
      toolName: 'delegate_task',
      toolSuccess: true,
    }))
  })

  it('appends auto-verify output after successful file writes', async () => {
    mockState.formatVerifyOutput.mockReturnValue('\n[auto-verify] ok')

    const cwd = mkdtempSync(join(tmpdir(), 'armature-proxy-tool-'))
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

describe('chat proxy tool — workflow', () => {
  const SINGLE = `export const meta = { name: 'audit', description: 'd' }\nreturn await agent('inspect', { label: 'one' })`
  const FANOUT = `export const meta = { name: 'fan', description: 'd' }\nreturn await parallel([0,1,2].map(i => () => agent('t'+i, { label: 'a'+i })))`

  it('blocks workflow outside yolo mode', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'armature-wf-'))
    const result = await handleProxyToolCall({
      ...baseParams,
      cwd,
      name: 'workflow',
      args: { script: SINGLE },
      permissionMode: 'auto',
    })
    expect(result.success).toBe(false)
    expect(result.output).toContain('disabled in safe mode')
    expect(mockState.spawnSubAgent).not.toHaveBeenCalled()
  })

  it('runs a workflow in yolo mode and returns progress + result', async () => {
    mockState.spawnSubAgent.mockResolvedValue({ success: true, output: 'inspection report', duration: 5, tokensUsed: 9 })
    const cwd = mkdtempSync(join(tmpdir(), 'armature-wf-'))
    const result = await handleProxyToolCall({
      ...baseParams,
      cwd,
      name: 'workflow',
      args: { script: SINGLE },
      permissionMode: 'yolo',
    })
    expect(result.success).toBe(true)
    expect(result.output).toContain('workflow audit')
    expect(result.output).toContain('inspection report')
    expect(mockState.spawnSubAgent).toHaveBeenCalledTimes(1)
  })

  it('surfaces a script parse error without spawning any sub-agent', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'armature-wf-'))
    const result = await handleProxyToolCall({
      ...baseParams,
      cwd,
      name: 'workflow',
      args: { script: 'const x = 1\nreturn x' },
      permissionMode: 'yolo',
    })
    expect(result.success).toBe(false)
    expect(result.output).toContain('workflow script error')
    expect(mockState.spawnSubAgent).not.toHaveBeenCalled()
  })

  it('fans out one sub-agent per parallel branch', async () => {
    mockState.spawnSubAgent.mockResolvedValue({ success: true, output: 'ok', duration: 1, tokensUsed: 1 })
    const cwd = mkdtempSync(join(tmpdir(), 'armature-wf-'))
    const result = await handleProxyToolCall({
      ...baseParams,
      cwd,
      name: 'workflow',
      args: { script: FANOUT },
      permissionMode: 'yolo',
    })
    expect(result.success).toBe(true)
    expect(mockState.spawnSubAgent).toHaveBeenCalledTimes(3)
  })

  it('threads the resolved model/apiKey/baseURL into each sub-agent', async () => {
    mockState.spawnSubAgent.mockResolvedValue({ success: true, output: 'ok', duration: 1, tokensUsed: 1 })
    const cwd = mkdtempSync(join(tmpdir(), 'armature-wf-'))
    await handleProxyToolCall({
      ...baseParams,
      cwd,
      name: 'workflow',
      args: { script: SINGLE },
      permissionMode: 'yolo',
    })
    expect(mockState.spawnSubAgent).toHaveBeenCalledWith(
      expect.objectContaining({ cwd }),
      { model: 'gpt-5.4', apiKey: 'test-key', baseURL: 'https://example.invalid/v1' },
    )
  })

  it('fires SubagentStart and SubagentStop hooks around the run', async () => {
    mockState.spawnSubAgent.mockResolvedValue({ success: true, output: 'ok', duration: 1, tokensUsed: 1 })
    const cwd = mkdtempSync(join(tmpdir(), 'armature-wf-'))
    await handleProxyToolCall({
      ...baseParams,
      cwd,
      name: 'workflow',
      args: { script: SINGLE },
      permissionMode: 'yolo',
    })
    expect(mockState.runHook).toHaveBeenCalledWith('SubagentStart', expect.objectContaining({ event: 'SubagentStart' }))
    expect(mockState.runHook).toHaveBeenCalledWith('SubagentStop', expect.objectContaining({ event: 'SubagentStop' }))
  })
})
