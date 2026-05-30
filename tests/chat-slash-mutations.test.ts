import { afterEach, describe, expect, it, vi } from 'vitest'
import { execSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { hooks } from '../src/hooks.js'
import type { ModelChoice } from '../src/model-catalog.js'
import { writeSavedSession } from '../src/session-store.js'
import { ChatSessionEmitter } from '../src/ui/session.js'
import { stripAnsi } from '../src/ui/command-output.js'

const loggerState = vi.hoisted(() => ({
  logInfo: vi.fn(),
  logWarning: vi.fn(),
}))

const mcpState = vi.hoisted(() => ({
  enableServer: vi.fn(),
  disableServer: vi.fn(),
  connect: vi.fn(),
  listServers: vi.fn(),
  connectedCount: 0,
}))

vi.mock('../src/logger.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/logger.js')>()
  return {
    ...actual,
    logInfo: loggerState.logInfo,
    logWarning: loggerState.logWarning,
  }
})

vi.mock('../src/mcp-client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/mcp-client.js')>()
  return {
    ...actual,
    mcpClient: mcpState,
  }
})

import { handleMutatingSlashCommand } from '../src/commands/chat-slash-mutations.js'

const MODEL_CHOICES: ModelChoice[] = [
  {
    model: 'model-a',
    provider: 'openai',
    contextWindow: 128_000,
    maxOutput: 16_000,
    pricing: [1, 2],
    agentic: 'recommended',
  },
  {
    model: 'model-b',
    provider: 'openai',
    contextWindow: 128_000,
    maxOutput: 16_000,
    pricing: [1, 2],
    agentic: 'recommended',
  },
]

afterEach(() => {
  vi.restoreAllMocks()
  mcpState.enableServer.mockReset()
  mcpState.disableServer.mockReset()
  mcpState.connect.mockReset()
  mcpState.listServers.mockReset()
  mcpState.connectedCount = 0
  delete process.env.ORCA_HOME
})

function normalizeRenderedText(text: string): string {
  return text
    .split('\n')
    .map((line) => stripAnsi(line).trim())
    .filter(Boolean)
    .join('\n')
}

async function expectBufferedInputDropped(session: ChatSessionEmitter): Promise<void> {
  const pending = session.waitForInput()
  let resolved = false
  pending.then(() => {
    resolved = true
  })
  await Promise.resolve()
  expect(resolved).toBe(false)
  session.submitInput('fresh input')
  await expect(pending).resolves.toBe('fresh input')
}

describe('chat mutating slash helpers', () => {
  it('switches models through /model set in ink mode', () => {
    let currentModel = 'model-a'
    const session = new ChatSessionEmitter()
    const messages: string[] = []
    session.on('system_message', (event) => { messages.push(event.text) })

    const result = handleMutatingSlashCommand({
      cmd: '/model',
      arg: 'set model-b',
      history: [],
      stats: { turns: 0, totalInputTokens: 0, totalOutputTokens: 0 },
      cwd: '/tmp/orca-cli',
      mc: {
        getModel: () => currentModel,
        setModel: (target) => {
          currentModel = typeof target === 'string' ? target : target.model
          return true
        },
        getProvider: () => 'openai',
        getChoices: () => MODEL_CHOICES,
      },
      session,
    })

    expect(result).toBe('handled')
    expect(currentModel).toBe('model-b')
    expect(messages.join('')).toContain('model: model-a → model-b (openai)')
  })

  it('exports the current transcript as a Markdown artifact', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'orca-current-export-'))
    const outFile = join(outDir, 'current-session.md')
    const logs: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...args) => { logs.push(args.join(' ')) })

    try {
      const result = handleMutatingSlashCommand({
        cmd: '/export',
        arg: outFile,
        history: [
          { role: 'system', content: 'system prompt' },
          { role: 'user', content: 'hello' },
          { role: 'assistant', content: 'hi there' },
        ],
        stats: { turns: 1, totalInputTokens: 10, totalOutputTokens: 5 },
        cwd: '/tmp/orca-cli',
        mc: {
          getModel: () => 'model-a',
          setModel: () => true,
          getProvider: () => 'openai',
          getChoices: () => MODEL_CHOICES,
        },
      })

      expect(result).toBe('handled')
      expect(readFileSync(outFile, 'utf-8')).toContain('# Session: current-')
      expect(readFileSync(outFile, 'utf-8')).toContain('hi there')
      expect(logs.join('\n')).toContain('exported transcript:')
    } finally {
      rmSync(outDir, { recursive: true, force: true })
    }
  })

  it('rewinds the last user prompt into an ink draft and truncates later history', () => {
    const session = new ChatSessionEmitter()
    const drafts: string[] = []
    session.on('input_draft', (event) => { drafts.push(event.text) })
    const history = [
      { role: 'system' as const, content: 'system prompt' },
      { role: 'user' as const, content: 'first' },
      { role: 'assistant' as const, content: 'answer' },
      { role: 'user' as const, content: 'second' },
      { role: 'assistant' as const, content: 'answer 2' },
    ]
    const stats = { turns: 2, totalInputTokens: 20, totalOutputTokens: 10, turnTokens: [10, 20] }

    const result = handleMutatingSlashCommand({
      cmd: '/rewind',
      arg: '',
      history,
      stats,
      cwd: '/tmp/orca-cli',
      mc: {
        getModel: () => 'model-a',
        setModel: () => true,
        getProvider: () => 'openai',
        getChoices: () => MODEL_CHOICES,
      },
      session,
    })

    expect(result).toBe('handled')
    expect(drafts).toEqual(['second'])
    expect(history.map((message) => message.content)).toEqual(['system prompt', 'first', 'answer'])
    expect(stats.turns).toBe(1)
    expect(stats.turnTokens).toEqual([10])
  })

  it('emits async /mcp connect results through the ink session', async () => {
    const session = new ChatSessionEmitter()
    const messages: Array<{ text: string; level: string }> = []
    session.on('system_message', (event) => { messages.push({ text: event.text, level: event.level }) })
    mcpState.connect.mockResolvedValueOnce(true)

    const result = handleMutatingSlashCommand({
      cmd: '/mcp',
      arg: 'connect demo',
      history: [],
      stats: { turns: 0, totalInputTokens: 0, totalOutputTokens: 0 },
      cwd: '/tmp/orca-cli',
      mc: {
        getModel: () => 'model-a',
        setModel: () => true,
        getProvider: () => 'openai',
        getChoices: () => MODEL_CHOICES,
      },
      session,
    })

    expect(result).toBe('handled')
    await Promise.resolve()
    expect(mcpState.connect).toHaveBeenCalledWith('demo')
    expect(messages).toContainEqual({ text: 'connected: demo', level: 'info' })
  })

  it('emits async /mcp connect failures through the ink session', async () => {
    const session = new ChatSessionEmitter()
    const messages: Array<{ text: string; level: string }> = []
    session.on('system_message', (event) => { messages.push({ text: event.text, level: event.level }) })
    mcpState.connect.mockResolvedValueOnce(false)

    const result = handleMutatingSlashCommand({
      cmd: '/mcp',
      arg: 'connect demo',
      history: [],
      stats: { turns: 0, totalInputTokens: 0, totalOutputTokens: 0 },
      cwd: '/tmp/orca-cli',
      mc: {
        getModel: () => 'model-a',
        setModel: () => true,
        getProvider: () => 'openai',
        getChoices: () => MODEL_CHOICES,
      },
      session,
    })

    expect(result).toBe('handled')
    await Promise.resolve()
    expect(messages).toContainEqual({ text: 'failed to connect: demo', level: 'error' })
  })

  it('emits /mcp enable success immediately and warns when async connect fails', async () => {
    const session = new ChatSessionEmitter()
    const messages: Array<{ text: string; level: string }> = []
    session.on('system_message', (event) => { messages.push({ text: event.text, level: event.level }) })
    mcpState.enableServer.mockReturnValueOnce(true)
    mcpState.connect.mockResolvedValueOnce(false)

    const result = handleMutatingSlashCommand({
      cmd: '/mcp',
      arg: 'enable demo',
      history: [],
      stats: { turns: 0, totalInputTokens: 0, totalOutputTokens: 0 },
      cwd: '/tmp/orca-cli',
      mc: {
        getModel: () => 'model-a',
        setModel: () => true,
        getProvider: () => 'openai',
        getChoices: () => MODEL_CHOICES,
      },
      session,
    })

    expect(result).toBe('handled')
    await Promise.resolve()
    expect(messages).toContainEqual({ text: 'enabled: demo', level: 'info' })
    expect(messages).toContainEqual({ text: 'enabled but failed to connect: demo', level: 'warn' })
  })

  it('renders a selected MCP server detail panel from the picker command', () => {
    const session = new ChatSessionEmitter()
    const panels: Array<{ title: string; subtitle?: string; body: string }> = []
    session.on('detail_panel', (event) => { panels.push(event.info) })
    mcpState.listServers.mockReturnValueOnce([
      {
        name: 'docs',
        initialized: false,
        pid: 0,
        disabled: false,
        scope: 'project',
        configPath: '/tmp/project/.mcp.json',
      },
    ])

    const result = handleMutatingSlashCommand({
      cmd: '/mcp',
      arg: 'docs',
      history: [],
      stats: { turns: 0, totalInputTokens: 0, totalOutputTokens: 0 },
      cwd: '/tmp/orca-cli',
      mc: {
        getModel: () => 'model-a',
        setModel: () => true,
        getProvider: () => 'openai',
        getChoices: () => MODEL_CHOICES,
      },
      session,
    })

    expect(result).toBe('handled')
    expect(panels[0]?.title).toBe('MCP: docs')
    expect(panels[0]?.body).toContain('/mcp connect docs')
    expect(panels[0]?.body).toContain('/tmp/project/.mcp.json')
  })

  it('routes /hooks through the ink session output path', () => {
    const session = new ChatSessionEmitter()
    const messages: Array<{ text: string; level: string }> = []
    session.on('system_message', (event) => { messages.push({ text: event.text, level: event.level }) })
    const statusSummarySpy = vi.spyOn(hooks, 'getStatusSummary').mockReturnValue({
      totalHooks: 2,
      eventCount: 1,
    })

    const result = handleMutatingSlashCommand({
      cmd: '/hooks',
      arg: '',
      history: [],
      stats: { turns: 0, totalInputTokens: 0, totalOutputTokens: 0 },
      cwd: '/tmp/orca-cli',
      mc: {
        getModel: () => 'model-a',
        setModel: () => true,
        getProvider: () => 'openai',
        getChoices: () => MODEL_CHOICES,
      },
      session,
    })

    expect(result).toBe('handled')
    expect(statusSummarySpy).toHaveBeenCalled()
    expect(messages).toContainEqual({ text: 'hooks: 2 across 1 events', level: 'info' })
  })

  it('keeps /hooks semantics aligned between legacy and ink output', () => {
    const statusSummarySpy = vi.spyOn(hooks, 'getStatusSummary').mockReturnValue({
      totalHooks: 2,
      eventCount: 1,
    })

    const legacyLines: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...args) => { legacyLines.push(args.join(' ')) })
    handleMutatingSlashCommand({
      cmd: '/hooks',
      arg: '',
      history: [],
      stats: { turns: 0, totalInputTokens: 0, totalOutputTokens: 0 },
      cwd: '/tmp/orca-cli',
      mc: {
        getModel: () => 'model-a',
        setModel: () => true,
        getProvider: () => 'openai',
        getChoices: () => MODEL_CHOICES,
      },
    })

    const session = new ChatSessionEmitter()
    const inkMessages: string[] = []
    session.on('system_message', (event) => { inkMessages.push(event.text) })
    handleMutatingSlashCommand({
      cmd: '/hooks',
      arg: '',
      history: [],
      stats: { turns: 0, totalInputTokens: 0, totalOutputTokens: 0 },
      cwd: '/tmp/orca-cli',
      mc: {
        getModel: () => 'model-a',
        setModel: () => true,
        getProvider: () => 'openai',
        getChoices: () => MODEL_CHOICES,
      },
      session,
    })

    expect(statusSummarySpy).toHaveBeenCalledTimes(2)
    expect(normalizeRenderedText(legacyLines.join('\n'))).toBe(normalizeRenderedText(inkMessages.join('\n')))
  })

  it('switches models through /model set', () => {
    let currentModel = 'model-a'
    const lines: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...args) => { lines.push(args.join(' ')) })

    const result = handleMutatingSlashCommand({
      cmd: '/model',
      arg: 'set model-b',
      history: [],
      stats: { turns: 0, totalInputTokens: 0, totalOutputTokens: 0 },
      cwd: '/tmp/orca-cli',
      mc: {
        getModel: () => currentModel,
        setModel: (target) => {
          currentModel = typeof target === 'string' ? target : target.model
          return true
        },
        getProvider: () => 'openai',
        getChoices: () => MODEL_CHOICES,
      },
    })

    expect(result).toBe('handled')
    expect(currentModel).toBe('model-b')
    expect(lines.join('\n')).toContain('model-a')
    expect(loggerState.logInfo).toHaveBeenCalled()
  })

  it('prefers the current provider when /model set names are duplicated', () => {
    let selected: string | Pick<ModelChoice, 'model' | 'provider'> | undefined
    const duplicateChoices: ModelChoice[] = [
      {
        model: 'gpt-5.4',
        provider: 'copilot',
        contextWindow: 256_000,
        maxOutput: 64_000,
        pricing: [1.25, 10],
        agentic: 'recommended',
      },
      {
        model: 'gpt-5.4',
        provider: 'poe',
        contextWindow: 256_000,
        maxOutput: 64_000,
        pricing: [1.25, 10],
        agentic: 'recommended',
      },
    ]

    const result = handleMutatingSlashCommand({
      cmd: '/model',
      arg: 'set gpt-5.4',
      history: [],
      stats: { turns: 0, totalInputTokens: 0, totalOutputTokens: 0 },
      cwd: '/tmp/orca-cli',
      mc: {
        getModel: () => 'gpt-5.4',
        setModel: (target) => {
          selected = target
          return true
        },
        getProvider: () => 'poe',
        getChoices: () => duplicateChoices,
      },
    })

    expect(result).toBe('handled')
    expect(selected).toMatchObject({ model: 'gpt-5.4', provider: 'poe' })
  })

  it('switches models through /model shorthand without set', () => {
    let currentModel = 'model-a'

    const result = handleMutatingSlashCommand({
      cmd: '/model',
      arg: 'model-b',
      history: [],
      stats: { turns: 0, totalInputTokens: 0, totalOutputTokens: 0 },
      cwd: '/tmp/orca-cli',
      mc: {
        getModel: () => currentModel,
        setModel: (target) => {
          currentModel = typeof target === 'string' ? target : target.model
          return true
        },
        getProvider: () => 'openai',
        getChoices: () => MODEL_CHOICES,
      },
    })

    expect(result).toBe('handled')
    expect(currentModel).toBe('model-b')
  })

  it('sets the current session permission mode through /permissions set', () => {
    let currentPermMode: 'yolo' | 'auto' | 'plan' = 'yolo'

    const result = handleMutatingSlashCommand({
      cmd: '/permissions',
      arg: 'set plan',
      history: [],
      stats: { turns: 0, totalInputTokens: 0, totalOutputTokens: 0 },
      cwd: '/tmp/orca-cli',
      mc: {
        getModel: () => 'model-a',
        setModel: () => true,
        getProvider: () => 'openai',
        getChoices: () => MODEL_CHOICES,
      },
      getPermissionMode: () => currentPermMode,
      setPermissionMode: (mode) => { currentPermMode = mode },
    })

    expect(result).toBe('handled')
    expect(currentPermMode).toBe('plan')
  })

  it('persists permission mode through /permissions save', () => {
    const persistPermissionMode = vi.fn(() => '/tmp/.orca.json')

    const result = handleMutatingSlashCommand({
      cmd: '/permissions',
      arg: 'save auto global',
      history: [],
      stats: { turns: 0, totalInputTokens: 0, totalOutputTokens: 0 },
      cwd: '/tmp/orca-cli',
      mc: {
        getModel: () => 'model-a',
        setModel: () => true,
        getProvider: () => 'openai',
        getChoices: () => MODEL_CHOICES,
      },
      getPermissionMode: () => 'yolo',
      persistPermissionMode,
    })

    expect(result).toBe('handled')
    expect(persistPermissionMode).toHaveBeenCalledWith('auto', 'global')
  })

  it('opens the Ink permissions picker and switches live mode from /permissions', async () => {
    let currentPermMode: 'yolo' | 'auto' | 'plan' = 'yolo'
    const session = new ChatSessionEmitter()
    const detailPanels: Array<{ title: string; subtitle?: string; body: string }> = []
    const messages: string[] = []

    session.on('detail_panel', (event) => {
      detailPanels.push(event.info)
    })
    session.on('system_message', (event) => {
      messages.push(event.text)
    })
    session.on('option_picker_request', (event) => {
      event.request.resolve('mode:plan')
    })

    const result = handleMutatingSlashCommand({
      cmd: '/permissions',
      arg: '',
      history: [],
      stats: { turns: 0, totalInputTokens: 0, totalOutputTokens: 0 },
      cwd: '/tmp/orca-cli',
      mc: {
        getModel: () => 'model-a',
        setModel: () => true,
        getProvider: () => 'openai',
        getChoices: () => MODEL_CHOICES,
      },
      session,
      getPermissionMode: () => currentPermMode,
      getPermissionSource: () => 'project',
      setPermissionMode: (mode) => { currentPermMode = mode },
    })

    expect(result).toBe('handled')
    await Promise.resolve()
    expect(currentPermMode).toBe('plan')
    expect(detailPanels[0]?.title).toBe('Permissions')
    expect(detailPanels[0]?.subtitle).toContain('source project')
    expect(detailPanels[0]?.body).toContain('Current mode: `yolo`')
    expect(messages).toContain('permissions: yolo → plan')
  })

  it('opens the Ink permissions picker and persists the current mode', async () => {
    const persistPermissionMode = vi.fn(() => '/tmp/.orca.json')
    const session = new ChatSessionEmitter()
    const messages: string[] = []

    session.on('system_message', (event) => {
      messages.push(event.text)
    })
    session.on('option_picker_request', (event) => {
      event.request.resolve('save:project')
    })

    const result = handleMutatingSlashCommand({
      cmd: '/permissions',
      arg: '',
      history: [],
      stats: { turns: 0, totalInputTokens: 0, totalOutputTokens: 0 },
      cwd: '/tmp/orca-cli',
      mc: {
        getModel: () => 'model-a',
        setModel: () => true,
        getProvider: () => 'openai',
        getChoices: () => MODEL_CHOICES,
      },
      session,
      getPermissionMode: () => 'auto',
      getPermissionSource: () => 'session',
      persistPermissionMode,
    })

    expect(result).toBe('handled')
    await Promise.resolve()
    expect(persistPermissionMode).toHaveBeenCalledWith('auto', 'project')
    expect(messages).toContain('saved permissions: auto (project)')
    expect(messages).toContain('config: /tmp/.orca.json')
  })

  it('shows permission rules through /permissions rules in Ink mode', () => {
    const session = new ChatSessionEmitter()
    const detailPanels: Array<{ title: string; subtitle?: string; body: string }> = []

    session.on('detail_panel', (event) => {
      detailPanels.push(event.info)
    })

    const result = handleMutatingSlashCommand({
      cmd: '/permissions',
      arg: 'rules session',
      history: [],
      stats: { turns: 0, totalInputTokens: 0, totalOutputTokens: 0 },
      cwd: '/tmp/orca-cli',
      mc: {
        getModel: () => 'model-a',
        setModel: () => true,
        getProvider: () => 'openai',
        getChoices: () => MODEL_CHOICES,
      },
      session,
      getPermissionRules: (scope) => scope === 'session'
        ? ['run_command::run: echo hello', 'write_file::write: src/index.ts']
        : [],
    })

    expect(result).toBe('handled')
    expect(detailPanels).toHaveLength(1)
    expect(detailPanels[0]?.title).toBe('Session Permission Rules')
    expect(detailPanels[0]?.body).toContain('[legacy]')
    expect(detailPanels[0]?.body).toContain('run_command::run: echo hello')
    expect(detailPanels[0]?.body).toContain('run_command|command=echo hello')
    expect(detailPanels[0]?.body).toContain('write_file::write: src/index.ts')
  })

  it('shows permission rules through the Ink permissions picker', async () => {
    const session = new ChatSessionEmitter()
    const detailPanels: Array<{ title: string; subtitle?: string; body: string }> = []

    session.on('detail_panel', (event) => {
      detailPanels.push(event.info)
    })
    session.on('option_picker_request', (event) => {
      event.request.resolve('rules:project')
    })

    const result = handleMutatingSlashCommand({
      cmd: '/permissions',
      arg: '',
      history: [],
      stats: { turns: 0, totalInputTokens: 0, totalOutputTokens: 0 },
      cwd: '/tmp/orca-cli',
      mc: {
        getModel: () => 'model-a',
        setModel: () => true,
        getProvider: () => 'openai',
        getChoices: () => MODEL_CHOICES,
      },
      session,
      getPermissionMode: () => 'auto',
      getPermissionSource: () => 'project',
      getPermissionRules: (scope) => scope === 'project'
        ? ['read_file::read: README.md']
        : [],
    })

    expect(result).toBe('handled')
    await Promise.resolve()
    expect(detailPanels).toHaveLength(2)
    expect(detailPanels[1]?.title).toBe('Project Permission Rules')
    expect(detailPanels[1]?.body).toContain('read_file::read: README.md')
  })

  it('filters permission rules by status through /permissions rules', () => {
    const session = new ChatSessionEmitter()
    const detailPanels: Array<{ title: string; subtitle?: string; body: string }> = []

    session.on('detail_panel', (event) => {
      detailPanels.push(event.info)
    })

    const result = handleMutatingSlashCommand({
      cmd: '/permissions',
      arg: 'rules project legacy',
      history: [],
      stats: { turns: 0, totalInputTokens: 0, totalOutputTokens: 0 },
      cwd: '/tmp/orca-cli',
      mc: {
        getModel: () => 'model-a',
        setModel: () => true,
        getProvider: () => 'openai',
        getChoices: () => MODEL_CHOICES,
      },
      session,
      getPermissionRules: (scope) => scope === 'project'
        ? ['run_command::run: echo hello', 'run_command|command=echo hello']
        : [],
    })

    expect(result).toBe('handled')
    expect(detailPanels).toHaveLength(1)
    expect(detailPanels[0]?.subtitle).toContain('legacy')
    expect(detailPanels[0]?.body).toContain('[legacy]')
    expect(detailPanels[0]?.body).not.toContain('[canonical] run_command|command=echo hello')
  })

  it('revokes a session permission rule through /permissions revoke', () => {
    const removePermissionRule = vi.fn(() => true)

    const result = handleMutatingSlashCommand({
      cmd: '/permissions',
      arg: 'revoke session run_command::run: echo hello',
      history: [],
      stats: { turns: 0, totalInputTokens: 0, totalOutputTokens: 0 },
      cwd: '/tmp/orca-cli',
      mc: {
        getModel: () => 'model-a',
        setModel: () => true,
        getProvider: () => 'openai',
        getChoices: () => MODEL_CHOICES,
      },
      removePermissionRule,
    })

    expect(result).toBe('handled')
    expect(removePermissionRule).toHaveBeenCalledWith('session', 'run_command::run: echo hello')
  })

  it('opens a picker for /permissions revoke when rule is omitted in Ink mode', async () => {
    const session = new ChatSessionEmitter()
    const removePermissionRule = vi.fn(() => true)
    const pickerMeta: Array<{ filterable?: boolean; title: string }> = []

    session.on('option_picker_request', (event) => {
      pickerMeta.push({ filterable: event.request.filterable, title: event.request.title })
      event.request.resolve('run_command::run: echo hello')
    })

    const result = handleMutatingSlashCommand({
      cmd: '/permissions',
      arg: 'revoke project',
      history: [],
      stats: { turns: 0, totalInputTokens: 0, totalOutputTokens: 0 },
      cwd: '/tmp/orca-cli',
      mc: {
        getModel: () => 'model-a',
        setModel: () => true,
        getProvider: () => 'openai',
        getChoices: () => MODEL_CHOICES,
      },
      session,
      getPermissionRules: (scope) => scope === 'project'
        ? ['run_command::run: echo hello', 'write_file::write: src/index.ts']
        : [],
      removePermissionRule,
    })

    expect(result).toBe('handled')
    await Promise.resolve()
    expect(pickerMeta[0]).toEqual({ filterable: true, title: 'Revoke project rule' })
    expect(removePermissionRule).toHaveBeenCalledWith('project', 'run_command::run: echo hello')
  })

  it('clears project permission rules through /permissions clear', () => {
    const clearPermissionRules = vi.fn(() => 2)

    const result = handleMutatingSlashCommand({
      cmd: '/permissions',
      arg: 'clear project',
      history: [],
      stats: { turns: 0, totalInputTokens: 0, totalOutputTokens: 0 },
      cwd: '/tmp/orca-cli',
      mc: {
        getModel: () => 'model-a',
        setModel: () => true,
        getProvider: () => 'openai',
        getChoices: () => MODEL_CHOICES,
      },
      clearPermissionRules,
    })

    expect(result).toBe('handled')
    expect(clearPermissionRules).toHaveBeenCalledWith('project')
  })

  it('clears permission rules through the Ink permissions picker', async () => {
    const session = new ChatSessionEmitter()
    const messages: string[] = []
    const clearPermissionRules = vi.fn(() => 1)

    session.on('system_message', (event) => {
      messages.push(event.text)
    })
    session.on('option_picker_request', (event) => {
      event.request.resolve('clear:session')
    })

    const result = handleMutatingSlashCommand({
      cmd: '/permissions',
      arg: '',
      history: [],
      stats: { turns: 0, totalInputTokens: 0, totalOutputTokens: 0 },
      cwd: '/tmp/orca-cli',
      mc: {
        getModel: () => 'model-a',
        setModel: () => true,
        getProvider: () => 'openai',
        getChoices: () => MODEL_CHOICES,
      },
      session,
      getPermissionMode: () => 'auto',
      getPermissionSource: () => 'session',
      clearPermissionRules,
    })

    expect(result).toBe('handled')
    await Promise.resolve()
    expect(clearPermissionRules).toHaveBeenCalledWith('session')
    expect(messages).toContain('cleared 1 session permission rule(s)')
  })

  it('normalizes permission rules through /permissions normalize', () => {
    const normalizePermissionRules = vi.fn(() => ({ changedCount: 2, unresolvedCount: 1, total: 3 }))

    const result = handleMutatingSlashCommand({
      cmd: '/permissions',
      arg: 'normalize project',
      history: [],
      stats: { turns: 0, totalInputTokens: 0, totalOutputTokens: 0 },
      cwd: '/tmp/orca-cli',
      mc: {
        getModel: () => 'model-a',
        setModel: () => true,
        getProvider: () => 'openai',
        getChoices: () => MODEL_CHOICES,
      },
      normalizePermissionRules,
    })

    expect(result).toBe('handled')
    expect(normalizePermissionRules).toHaveBeenCalledWith('project')
  })

  it('normalizes all persisted permission scopes through /permissions normalize all', () => {
    const normalizePermissionRules = vi.fn(() => ({ changedCount: 1, unresolvedCount: 0, total: 1 }))

    const result = handleMutatingSlashCommand({
      cmd: '/permissions',
      arg: 'normalize all',
      history: [],
      stats: { turns: 0, totalInputTokens: 0, totalOutputTokens: 0 },
      cwd: '/tmp/orca-cli',
      mc: {
        getModel: () => 'model-a',
        setModel: () => true,
        getProvider: () => 'openai',
        getChoices: () => MODEL_CHOICES,
      },
      normalizePermissionRules,
    })

    expect(result).toBe('handled')
    expect(normalizePermissionRules).toHaveBeenNthCalledWith(1, 'project')
    expect(normalizePermissionRules).toHaveBeenNthCalledWith(2, 'global')
  })

  it('opens normalize flow from the Ink permissions picker', async () => {
    const session = new ChatSessionEmitter()
    const messages: string[] = []
    const normalizePermissionRules = vi.fn(() => ({ changedCount: 1, unresolvedCount: 0, total: 1 }))

    session.on('system_message', (event) => {
      messages.push(event.text)
    })

    let pickerStep = 0
    session.on('option_picker_request', (event) => {
      pickerStep += 1
      event.request.resolve(pickerStep === 1 ? 'normalize:project' : null)
    })

    const result = handleMutatingSlashCommand({
      cmd: '/permissions',
      arg: '',
      history: [],
      stats: { turns: 0, totalInputTokens: 0, totalOutputTokens: 0 },
      cwd: '/tmp/orca-cli',
      mc: {
        getModel: () => 'model-a',
        setModel: () => true,
        getProvider: () => 'openai',
        getChoices: () => MODEL_CHOICES,
      },
      session,
      getPermissionMode: () => 'auto',
      getPermissionSource: () => 'project',
      getPermissionRules: () => ['write_file|write 120 bytes to src/index.ts'],
      normalizePermissionRules,
    })

    expect(result).toBe('handled')
    await Promise.resolve()
    expect(normalizePermissionRules).toHaveBeenCalledWith('project')
    expect(messages).toContain('normalized project: 1 changed, 0 unresolved, 1 total')
  })

  it('opens revoke flow from the Ink permissions picker', async () => {
    const session = new ChatSessionEmitter()
    const removePermissionRule = vi.fn(() => true)

    let pickerStep = 0
    session.on('option_picker_request', (event) => {
      pickerStep += 1
      if (pickerStep === 1) {
        event.request.resolve('revoke:project')
        return
      }
      event.request.resolve('read_file::read: README.md')
    })

    const result = handleMutatingSlashCommand({
      cmd: '/permissions',
      arg: '',
      history: [],
      stats: { turns: 0, totalInputTokens: 0, totalOutputTokens: 0 },
      cwd: '/tmp/orca-cli',
      mc: {
        getModel: () => 'model-a',
        setModel: () => true,
        getProvider: () => 'openai',
        getChoices: () => MODEL_CHOICES,
      },
      session,
      getPermissionMode: () => 'auto',
      getPermissionSource: () => 'project',
      getPermissionRules: (scope) => scope === 'project'
        ? ['read_file::read: README.md']
        : [],
      removePermissionRule,
    })

    expect(result).toBe('handled')
    await Promise.resolve()
    await Promise.resolve()
    expect(removePermissionRule).toHaveBeenCalledWith('project', 'read_file::read: README.md')
  })

  it('keeps /model set semantics aligned between legacy and ink output', () => {
    let legacyModel = 'model-a'
    const legacyLines: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...args) => { legacyLines.push(args.join(' ')) })
    handleMutatingSlashCommand({
      cmd: '/model',
      arg: 'set model-b',
      history: [],
      stats: { turns: 0, totalInputTokens: 0, totalOutputTokens: 0 },
      cwd: '/tmp/orca-cli',
      mc: {
        getModel: () => legacyModel,
        setModel: (target) => {
          legacyModel = typeof target === 'string' ? target : target.model
          return true
        },
        getProvider: () => 'openai',
        getChoices: () => MODEL_CHOICES,
      },
    })

    let inkModel = 'model-a'
    const session = new ChatSessionEmitter()
    const inkMessages: string[] = []
    session.on('system_message', (event) => { inkMessages.push(event.text) })
    handleMutatingSlashCommand({
      cmd: '/model',
      arg: 'set model-b',
      history: [],
      stats: { turns: 0, totalInputTokens: 0, totalOutputTokens: 0 },
      cwd: '/tmp/orca-cli',
      mc: {
        getModel: () => inkModel,
        setModel: (target) => {
          inkModel = typeof target === 'string' ? target : target.model
          return true
        },
        getProvider: () => 'openai',
        getChoices: () => MODEL_CHOICES,
      },
      session,
    })

    expect(normalizeRenderedText(legacyLines.join('\n'))).toBe(normalizeRenderedText(inkMessages.join('\n')))
  })

  it('clears history, stats, and session output state', () => {
    const history = [
      { role: 'system' as const, content: 'System prompt' },
      { role: 'user' as const, content: 'Hello' },
      { role: 'assistant' as const, content: 'Hi' },
    ]
    const startTime = Date.now() - 10_000
    const stats = { turns: 4, totalInputTokens: 120, totalOutputTokens: 45, startTime, turnTokens: [10, 20] }
    const tokenBudget = { reset: vi.fn() }
    const contextMonitor = { reset: vi.fn() }
    const session = new ChatSessionEmitter()
    const messages: string[] = []
    let clearCount = 0
    const onSessionReset = vi.fn()
    session.on('system_message', (event) => { messages.push(event.text) })
    session.on('clear', () => { clearCount += 1 })

    const result = handleMutatingSlashCommand({
      cmd: '/clear',
      arg: '',
      history,
      stats,
      cwd: '/tmp/orca-cli',
      mc: {
        getModel: () => 'model-a',
        setModel: () => true,
        getProvider: () => 'openai',
        getChoices: () => MODEL_CHOICES,
      },
      harness: {
        tokenBudget: tokenBudget as never,
        contextMonitor: contextMonitor as never,
      },
      onSessionReset,
      session,
    })

    expect(result).toBe('handled')
    expect(history).toEqual([{ role: 'system', content: 'System prompt' }])
    expect(stats.turns).toBe(0)
    expect(stats.totalInputTokens).toBe(0)
    expect(stats.totalOutputTokens).toBe(0)
    expect(stats.turnTokens).toEqual([])
    expect(stats.startTime).toBeGreaterThan(startTime)
    expect(tokenBudget.reset).toHaveBeenCalled()
    expect(contextMonitor.reset).toHaveBeenCalled()
    expect(onSessionReset).toHaveBeenCalledOnce()
    expect(clearCount).toBe(1)
    expect(messages).toContain('conversation cleared.')
  })

  it('drops buffered input when clearing the conversation', async () => {
    const session = new ChatSessionEmitter()
    session.submitInput('stale input')

    const result = handleMutatingSlashCommand({
      cmd: '/clear',
      arg: '',
      history: [{ role: 'system', content: 'System prompt' }],
      stats: { turns: 0, totalInputTokens: 0, totalOutputTokens: 0, startTime: 1, turnTokens: [] },
      cwd: '/tmp/orca-cli',
      mc: {
        getModel: () => 'model-a',
        setModel: () => true,
        getProvider: () => 'openai',
        getChoices: () => MODEL_CHOICES,
      },
      session,
    })

    expect(result).toBe('handled')
    await expectBufferedInputDropped(session)
  })

  it('clears the conversation in legacy mode without a session emitter', () => {
    const history = [
      { role: 'system' as const, content: 'System prompt' },
      { role: 'user' as const, content: 'Hello' },
    ]
    const stats = { turns: 1, totalInputTokens: 10, totalOutputTokens: 20, startTime: Date.now() - 1000, turnTokens: [20] }
    const tokenBudget = { reset: vi.fn() }
    const contextMonitor = { reset: vi.fn() }
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const onSessionReset = vi.fn()

    const result = handleMutatingSlashCommand({
      cmd: '/clear',
      arg: '',
      history,
      stats,
      cwd: '/tmp/orca-cli',
      mc: {
        getModel: () => 'model-a',
        setModel: () => true,
        getProvider: () => 'openai',
        getChoices: () => MODEL_CHOICES,
      },
      harness: {
        tokenBudget: tokenBudget as never,
        contextMonitor: contextMonitor as never,
      },
      onSessionReset,
    })

    expect(result).toBe('handled')
    expect(history).toEqual([{ role: 'system', content: 'System prompt' }])
    expect(stdoutSpy).toHaveBeenCalledWith('\x1b[2J\x1b[H')
    expect(logSpy).toHaveBeenCalledWith('\x1b[90m  conversation cleared.\x1b[0m')
    expect(onSessionReset).toHaveBeenCalledOnce()
  })

  it('falls through on /commit when git has pending changes', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'orca-slash-commit-'))
    execSync('git init', { cwd, stdio: 'ignore' })
    writeFileSync(join(cwd, 'README.md'), '# dirty tree\n', 'utf-8')

    const result = handleMutatingSlashCommand({
      cmd: '/commit',
      arg: '',
      history: [],
      stats: { turns: 0, totalInputTokens: 0, totalOutputTokens: 0 },
      cwd,
      mc: {
        getModel: () => 'model-a',
        setModel: () => true,
        getProvider: () => 'openai',
        getChoices: () => MODEL_CHOICES,
      },
    })

    expect(result).toBe('not_command')
  })

  it('treats an empty undo sentinel as nothing to undo', () => {
    const lines: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...args) => { lines.push(args.join(' ')) })

    const result = handleMutatingSlashCommand({
      cmd: '/undo',
      arg: '',
      history: [],
      stats: { turns: 0, totalInputTokens: 0, totalOutputTokens: 0 },
      cwd: '/tmp/orca-cli',
      mc: {
        getModel: () => 'model-a',
        setModel: () => true,
        getProvider: () => 'openai',
        getChoices: () => MODEL_CHOICES,
      },
      undo: {
        lastWrite: { path: '', oldContent: null },
      },
    })

    expect(result).toBe('handled')
    expect(lines.join('\n')).toContain('nothing to undo')
    expect(lines.join('\n')).not.toContain('undo failed')
  })

  it('clears shared undo state after a successful undo', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'orca-slash-undo-'))
    const file = join(cwd, 'artifact.txt')
    writeFileSync(file, 'new content', 'utf-8')
    const undo = { lastWrite: { path: file, oldContent: 'old content' } }
    const lines: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...args) => { lines.push(args.join(' ')) })

    const firstResult = handleMutatingSlashCommand({
      cmd: '/undo',
      arg: '',
      history: [],
      stats: { turns: 0, totalInputTokens: 0, totalOutputTokens: 0 },
      cwd,
      mc: {
        getModel: () => 'model-a',
        setModel: () => true,
        getProvider: () => 'openai',
        getChoices: () => MODEL_CHOICES,
      },
      undo,
    })

    expect(firstResult).toBe('handled')
    expect(readFileSync(file, 'utf-8')).toBe('old content')
    expect(undo.lastWrite).toBeNull()

    lines.length = 0
    const secondResult = handleMutatingSlashCommand({
      cmd: '/undo',
      arg: '',
      history: [],
      stats: { turns: 0, totalInputTokens: 0, totalOutputTokens: 0 },
      cwd,
      mc: {
        getModel: () => 'model-a',
        setModel: () => true,
        getProvider: () => 'openai',
        getChoices: () => MODEL_CHOICES,
      },
      undo,
    })

    rmSync(cwd, { recursive: true, force: true })

    expect(secondResult).toBe('handled')
    expect(lines.join('\n')).toContain('nothing to undo')
  })

  it('returns async sentinels for council-style commands', () => {
    const result = handleMutatingSlashCommand({
      cmd: '/council',
      arg: 'compare the options',
      history: [],
      stats: { turns: 0, totalInputTokens: 0, totalOutputTokens: 0 },
      cwd: '/tmp/orca-cli',
      mc: {
        getModel: () => 'model-a',
        setModel: () => true,
        getProvider: () => 'openai',
        getChoices: () => MODEL_CHOICES,
      },
    })

    expect(result).toBe('council')
  })

  it('lets /reflect fall through as a rewritten prompt when arguments are present', () => {
    const result = handleMutatingSlashCommand({
      cmd: '/reflect',
      arg: 'why is the parser dropping the last line?',
      history: [],
      stats: { turns: 0, totalInputTokens: 0, totalOutputTokens: 0 },
      cwd: '/tmp/orca-cli',
      mc: {
        getModel: () => 'model-a',
        setModel: () => true,
        getProvider: () => 'openai',
        getChoices: () => MODEL_CHOICES,
      },
    })

    expect(result).toBe('not_command')
  })

  it('persists the active mode when saving a session', () => {
    const orcaHome = mkdtempSync(join(tmpdir(), 'orca-slash-save-'))
    process.env.ORCA_HOME = orcaHome

    const result = handleMutatingSlashCommand({
      cmd: '/save',
      arg: 'reflect-session',
      history: [{ role: 'system', content: 'You are in reflect mode.\n\nBase prompt' }],
      stats: { turns: 1, totalInputTokens: 10, totalOutputTokens: 20 },
      cwd: '/tmp/orca-cli',
      mc: {
        getModel: () => 'model-a',
        setModel: () => true,
        getProvider: () => 'openai',
        getChoices: () => MODEL_CHOICES,
      },
      modeRegistry: {
        getActive: () => ({ id: 'reflect' }),
        switchTo: () => true,
      } as never,
    })

    const saved = JSON.parse(readFileSync(join(orcaHome, 'sessions', 'reflect-session.json'), 'utf-8'))
    rmSync(orcaHome, { recursive: true, force: true })

    expect(result).toBe('handled')
    expect(saved.modeId).toBe('reflect')
  })

  it('rejects unsafe session names on /save', () => {
    const orcaHome = mkdtempSync(join(tmpdir(), 'orca-slash-save-invalid-'))
    process.env.ORCA_HOME = orcaHome
    const lines: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...args) => { lines.push(args.join(' ')) })

    const result = handleMutatingSlashCommand({
      cmd: '/save',
      arg: '../escape',
      history: [{ role: 'system', content: 'System prompt' }],
      stats: { turns: 1, totalInputTokens: 10, totalOutputTokens: 20 },
      cwd: '/tmp/orca-cli',
      mc: {
        getModel: () => 'model-a',
        setModel: () => true,
        getProvider: () => 'openai',
        getChoices: () => MODEL_CHOICES,
      },
      modeRegistry: {
        getActive: () => ({ id: 'default' }),
        switchTo: () => true,
      } as never,
    })

    rmSync(orcaHome, { recursive: true, force: true })

    expect(result).toBe('handled')
    expect(lines.join('\n')).toContain('save failed: invalid session name')
  })

  it('restores the saved mode on /continue', () => {
    const orcaHome = mkdtempSync(join(tmpdir(), 'orca-slash-continue-'))
    process.env.ORCA_HOME = orcaHome
    writeSavedSession('reflect-auto', {
      provider: 'openai',
      model: 'model-a',
      modeId: 'reflect',
      history: [{ role: 'system', content: 'You are in reflect mode.\n\nBase prompt' }],
      stats: { turns: 2, inputTokens: 20, outputTokens: 40 },
      savedAt: new Date().toISOString(),
    })

    const history: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = []
    const stats = { turns: 0, totalInputTokens: 0, totalOutputTokens: 0, startTime: 1, turnTokens: [999] }
    const switchTo = vi.fn().mockReturnValue(true)
    const onSessionReset = vi.fn()
    const session = new ChatSessionEmitter()
    const messages: string[] = []
    let clearCount = 0
    session.on('system_message', (event) => { messages.push(event.text) })
    session.on('clear', () => { clearCount += 1 })

    const result = handleMutatingSlashCommand({
      cmd: '/continue',
      arg: '',
      history,
      stats,
      cwd: '/tmp/orca-cli',
      mc: {
        getModel: () => 'model-a',
        setModel: () => true,
        getProvider: () => 'openai',
        getChoices: () => MODEL_CHOICES,
      },
      modeRegistry: {
        getActive: () => ({ id: 'default' }),
        switchTo,
      } as never,
      onSessionReset,
      session,
    })

    rmSync(orcaHome, { recursive: true, force: true })

    expect(result).toBe('handled')
    expect(switchTo).toHaveBeenCalledWith('reflect')
    expect(clearCount).toBe(1)
    expect(messages).toContain('restored session: reflect-auto (2 turns, 1 messages)')
    expect(onSessionReset).toHaveBeenCalledOnce()
    expect(stats.turns).toBe(2)
    expect(stats.turnTokens).toEqual([])
    expect(stats.startTime).toBeGreaterThan(1)
    expect(history[0]?.content).toContain('reflect mode')
  })

  it('drops buffered input when restoring /continue', async () => {
    const orcaHome = mkdtempSync(join(tmpdir(), 'orca-slash-continue-buffer-'))
    process.env.ORCA_HOME = orcaHome
    writeSavedSession('reflect-buffered-continue', {
      provider: 'openai',
      model: 'model-a',
      modeId: 'reflect',
      history: [{ role: 'system', content: 'You are in reflect mode.\n\nBase prompt' }],
      stats: { turns: 1, inputTokens: 10, outputTokens: 20 },
      savedAt: new Date().toISOString(),
    })

    const session = new ChatSessionEmitter()
    session.submitInput('stale input')

    const result = handleMutatingSlashCommand({
      cmd: '/continue',
      arg: '',
      history: [{ role: 'system', content: 'Current prompt' }],
      stats: { turns: 0, totalInputTokens: 0, totalOutputTokens: 0, startTime: 1, turnTokens: [] },
      cwd: '/tmp/orca-cli',
      mc: {
        getModel: () => 'model-a',
        setModel: () => true,
        getProvider: () => 'openai',
        getChoices: () => MODEL_CHOICES,
      },
      modeRegistry: {
        getActive: () => ({ id: 'default' }),
        switchTo: () => true,
      } as never,
      session,
    })

    rmSync(orcaHome, { recursive: true, force: true })

    expect(result).toBe('handled')
    await expectBufferedInputDropped(session)
  })

  it('restores legacy /continue sessions into default mode', () => {
    const orcaHome = mkdtempSync(join(tmpdir(), 'orca-slash-continue-legacy-mode-'))
    process.env.ORCA_HOME = orcaHome
    writeSavedSession('legacy-session', {
      provider: 'openai',
      model: 'model-a',
      history: [{ role: 'system', content: 'Legacy base prompt' }],
      stats: { turns: 2, inputTokens: 20, outputTokens: 40 },
      savedAt: new Date().toISOString(),
    })

    const switchTo = vi.fn().mockReturnValue(true)
    const result = handleMutatingSlashCommand({
      cmd: '/continue',
      arg: '',
      history: [{ role: 'system', content: 'Current prompt' }],
      stats: { turns: 0, totalInputTokens: 0, totalOutputTokens: 0, startTime: 1, turnTokens: [] },
      cwd: '/tmp/orca-cli',
      mc: {
        getModel: () => 'model-a',
        setModel: () => true,
        getProvider: () => 'openai',
        getChoices: () => MODEL_CHOICES,
      },
      modeRegistry: {
        getActive: () => ({ id: 'reflect' }),
        switchTo,
      } as never,
    })

    rmSync(orcaHome, { recursive: true, force: true })

    expect(result).toBe('handled')
    expect(switchTo).toHaveBeenCalledWith('default')
  })

  it('does not restore a session when the saved mode is unavailable', () => {
    const orcaHome = mkdtempSync(join(tmpdir(), 'orca-slash-continue-missing-mode-'))
    process.env.ORCA_HOME = orcaHome
    writeSavedSession('missing-mode', {
      provider: 'openai',
      model: 'model-a',
      modeId: 'missing-mode',
      history: [{ role: 'system', content: 'You are in missing mode.\n\nBase prompt' }],
      stats: { turns: 2, inputTokens: 20, outputTokens: 40 },
      savedAt: new Date().toISOString(),
    })
    const history: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [{ role: 'system', content: 'Current prompt' }]
    const stats = { turns: 1, totalInputTokens: 1, totalOutputTokens: 2, startTime: 123, turnTokens: [5] }
    const lines: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...args) => { lines.push(args.join(' ')) })

    const result = handleMutatingSlashCommand({
      cmd: '/continue',
      arg: '',
      history,
      stats,
      cwd: '/tmp/orca-cli',
      mc: {
        getModel: () => 'model-a',
        setModel: vi.fn(() => true),
        getProvider: () => 'openai',
        getChoices: () => MODEL_CHOICES,
      },
      modeRegistry: {
        getActive: () => ({ id: 'default' }),
        switchTo: vi.fn().mockReturnValue(false),
      } as never,
    })

    rmSync(orcaHome, { recursive: true, force: true })

    expect(result).toBe('handled')
    expect(history).toEqual([{ role: 'system', content: 'Current prompt' }])
    expect(stats.turns).toBe(1)
    expect(stats.turnTokens).toEqual([5])
    expect((history as Array<{ role: 'system' | 'user' | 'assistant'; content: string }>)[0]?.content).toBe('Current prompt')
    expect(lines.join('\n')).toContain('saved mode unavailable: missing-mode')
  })

  it('does not mutate the current session on /continue when saved history is malformed', () => {
    const orcaHome = mkdtempSync(join(tmpdir(), 'orca-slash-continue-invalid-history-'))
    process.env.ORCA_HOME = orcaHome
    writeSavedSession('broken-history', {
      provider: 'openai',
      model: 'model-a',
      history: [null] as never,
      stats: { turns: 2, inputTokens: 20, outputTokens: 40 },
      savedAt: new Date().toISOString(),
    })
    const history: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [{ role: 'system', content: 'Current prompt' }]
    const stats = { turns: 1, totalInputTokens: 1, totalOutputTokens: 2, startTime: 123, turnTokens: [5] }
    const setModel = vi.fn(() => true)
    const switchTo = vi.fn().mockReturnValue(true)
    const lines: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...args) => { lines.push(args.join(' ')) })

    const result = handleMutatingSlashCommand({
      cmd: '/continue',
      arg: '',
      history,
      stats,
      cwd: '/tmp/orca-cli',
      mc: {
        getModel: () => 'model-a',
        setModel,
        getProvider: () => 'openai',
        getChoices: () => MODEL_CHOICES,
      },
      modeRegistry: {
        getActive: () => ({ id: 'default' }),
        switchTo,
      } as never,
    })

    rmSync(orcaHome, { recursive: true, force: true })

    expect(result).toBe('handled')
    expect(history).toEqual([{ role: 'system', content: 'Current prompt' }])
    expect(stats.turns).toBe(1)
    expect(stats.turnTokens).toEqual([5])
    expect(setModel).not.toHaveBeenCalled()
    expect(switchTo).not.toHaveBeenCalled()
    expect(lines.join('\n')).toContain('malformed history entry')
  })

  it('does not mutate the current session on /continue when saved history is empty', () => {
    const orcaHome = mkdtempSync(join(tmpdir(), 'orca-slash-continue-empty-history-'))
    process.env.ORCA_HOME = orcaHome
    writeSavedSession('empty-history', {
      provider: 'openai',
      model: 'model-a',
      history: [],
      stats: { turns: 2, inputTokens: 20, outputTokens: 40 },
      savedAt: new Date().toISOString(),
    })
    const history: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [{ role: 'system', content: 'Current prompt' }]
    const stats = { turns: 1, totalInputTokens: 1, totalOutputTokens: 2, startTime: 123, turnTokens: [5] }
    const setModel = vi.fn(() => true)
    const switchTo = vi.fn().mockReturnValue(true)
    const lines: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...args) => { lines.push(args.join(' ')) })

    const result = handleMutatingSlashCommand({
      cmd: '/continue',
      arg: '',
      history,
      stats,
      cwd: '/tmp/orca-cli',
      mc: {
        getModel: () => 'model-a',
        setModel,
        getProvider: () => 'openai',
        getChoices: () => MODEL_CHOICES,
      },
      modeRegistry: {
        getActive: () => ({ id: 'default' }),
        switchTo,
      } as never,
    })

    rmSync(orcaHome, { recursive: true, force: true })

    expect(result).toBe('handled')
    expect(history).toEqual([{ role: 'system', content: 'Current prompt' }])
    expect(stats.turns).toBe(1)
    expect(setModel).not.toHaveBeenCalled()
    expect(switchTo).not.toHaveBeenCalled()
    expect(lines.join('\n')).toContain('empty history')
  })

  it('rejects unsafe session lookups on /load', () => {
    const lines: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...args) => { lines.push(args.join(' ')) })

    const result = handleMutatingSlashCommand({
      cmd: '/load',
      arg: '../escape',
      history: [{ role: 'system', content: 'Current prompt' }],
      stats: { turns: 1, totalInputTokens: 10, totalOutputTokens: 20, startTime: 123, turnTokens: [5] },
      cwd: '/tmp/orca-cli',
      mc: {
        getModel: () => 'model-a',
        setModel: () => true,
        getProvider: () => 'openai',
        getChoices: () => MODEL_CHOICES,
      },
    })

    expect(result).toBe('handled')
    expect(lines.join('\n')).toContain('session "../escape" not found')
  })

  it('does not change model on /load when the saved mode is unavailable', () => {
    const orcaHome = mkdtempSync(join(tmpdir(), 'orca-slash-load-missing-mode-'))
    process.env.ORCA_HOME = orcaHome
    writeSavedSession('missing-load-mode', {
      provider: 'openai',
      model: 'model-b',
      modeId: 'missing-mode',
      history: [{ role: 'system', content: 'You are in missing mode.\n\nBase prompt' }],
      stats: { turns: 2, inputTokens: 20, outputTokens: 40 },
      savedAt: new Date().toISOString(),
    })
    const setModel = vi.fn(() => true)
    const lines: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...args) => { lines.push(args.join(' ')) })

    const result = handleMutatingSlashCommand({
      cmd: '/load',
      arg: 'missing-load-mode',
      history: [{ role: 'system', content: 'Current prompt' }],
      stats: { turns: 1, totalInputTokens: 10, totalOutputTokens: 20, startTime: 123, turnTokens: [5] },
      cwd: '/tmp/orca-cli',
      mc: {
        getModel: () => 'model-a',
        setModel,
        getProvider: () => 'openai',
        getChoices: () => MODEL_CHOICES,
      },
      modeRegistry: {
        getActive: () => ({ id: 'default' }),
        switchTo: vi.fn().mockReturnValue(false),
      } as never,
    })

    rmSync(orcaHome, { recursive: true, force: true })

    expect(result).toBe('handled')
    expect(setModel).not.toHaveBeenCalled()
    expect(lines.join('\n')).toContain('saved mode unavailable: missing-mode')
  })

  it('calls onSessionReset when loading a saved session', () => {
    const orcaHome = mkdtempSync(join(tmpdir(), 'orca-slash-load-ok-'))
    process.env.ORCA_HOME = orcaHome
    writeSavedSession('reflect-load', {
      provider: 'openai',
      model: 'model-a',
      modeId: 'reflect',
      history: [{ role: 'system', content: 'You are in reflect mode.\n\nBase prompt' }],
      stats: { turns: 3, inputTokens: 30, outputTokens: 60 },
      savedAt: new Date().toISOString(),
    })
    const onSessionReset = vi.fn()
    const switchTo = vi.fn().mockReturnValue(true)
    const tokenBudget = { clearCurrentUsage: vi.fn(), reset: vi.fn() }
    const contextMonitor = { clearCurrentUsage: vi.fn(), reset: vi.fn() }
    const session = new ChatSessionEmitter()
    const messages: string[] = []
    let clearCount = 0
    session.on('system_message', (event) => { messages.push(event.text) })
    session.on('clear', () => { clearCount += 1 })

    const result = handleMutatingSlashCommand({
      cmd: '/load',
      arg: 'reflect-load',
      history: [{ role: 'system', content: 'Current prompt' }],
      stats: { turns: 1, totalInputTokens: 10, totalOutputTokens: 20, startTime: 1, turnTokens: [5] },
      cwd: '/tmp/orca-cli',
      mc: {
        getModel: () => 'model-a',
        setModel: () => true,
        getProvider: () => 'openai',
        getChoices: () => MODEL_CHOICES,
      },
      modeRegistry: {
        getActive: () => ({ id: 'default' }),
        switchTo,
      } as never,
      harness: {
        tokenBudget: tokenBudget as never,
        contextMonitor: contextMonitor as never,
      },
      onSessionReset,
      session,
    })

    rmSync(orcaHome, { recursive: true, force: true })

    expect(result).toBe('handled')
    expect(switchTo).toHaveBeenCalledWith('reflect')
    expect(clearCount).toBe(1)
    expect(messages).toContain('loaded: 0 messages, model: model-a')
    expect(onSessionReset).toHaveBeenCalledOnce()
    expect(tokenBudget.clearCurrentUsage).toHaveBeenCalledOnce()
    expect(contextMonitor.clearCurrentUsage).toHaveBeenCalledOnce()
  })

  it('opens an option picker for /load in ink mode and loads the selected session', async () => {
    const orcaHome = mkdtempSync(join(tmpdir(), 'orca-slash-load-picker-'))
    process.env.ORCA_HOME = orcaHome
    writeSavedSession('reflect-picked', {
      provider: 'openai',
      model: 'model-a',
      modeId: 'reflect',
      history: [{ role: 'system', content: 'You are in reflect mode.\n\nBase prompt' }],
      stats: { turns: 2, inputTokens: 20, outputTokens: 40 },
      savedAt: new Date().toISOString(),
    })

    const onSessionReset = vi.fn()
    const switchTo = vi.fn().mockReturnValue(true)
    const tokenBudget = { clearCurrentUsage: vi.fn(), reset: vi.fn() }
    const contextMonitor = { clearCurrentUsage: vi.fn(), reset: vi.fn() }
    const session = new ChatSessionEmitter()
    const messages: string[] = []
    const pickerTitles: string[] = []
    session.on('system_message', (event) => { messages.push(event.text) })
    session.on('option_picker_request', (event) => {
      pickerTitles.push(event.request.title)
      event.request.resolve('reflect-picked')
    })

    const result = handleMutatingSlashCommand({
      cmd: '/load',
      arg: '',
      history: [{ role: 'system', content: 'Current prompt' }],
      stats: { turns: 1, totalInputTokens: 10, totalOutputTokens: 20, startTime: 1, turnTokens: [5] },
      cwd: '/tmp/orca-cli',
      mc: {
        getModel: () => 'model-a',
        setModel: () => true,
        getProvider: () => 'openai',
        getChoices: () => MODEL_CHOICES,
      },
      modeRegistry: {
        getActive: () => ({ id: 'default' }),
        switchTo,
      } as never,
      harness: {
        tokenBudget: tokenBudget as never,
        contextMonitor: contextMonitor as never,
      },
      onSessionReset,
      session,
    })

    expect(result).toBe('handled')
    await Promise.resolve()
    await Promise.resolve()

    rmSync(orcaHome, { recursive: true, force: true })

    expect(pickerTitles).toEqual(['Load session'])
    expect(switchTo).toHaveBeenCalledWith('reflect')
    expect(messages).toContain('loaded: 0 messages, model: model-a')
    expect(onSessionReset).toHaveBeenCalledOnce()
    expect(tokenBudget.clearCurrentUsage).toHaveBeenCalledOnce()
    expect(contextMonitor.clearCurrentUsage).toHaveBeenCalledOnce()
  })

  it('opens a searchable picker for /thread search in ink mode', async () => {
    const session = new ChatSessionEmitter()
    const pickerPayloads: Array<{ title: string; initialQuery?: string; filterable?: boolean }> = []
    const detailPanels: Array<{ title: string; subtitle?: string; body: string }> = []
    session.on('option_picker_request', (event) => {
      pickerPayloads.push({
        title: event.request.title,
        initialQuery: event.request.initialQuery,
        filterable: event.request.filterable,
      })
      event.request.resolve('thread-1')
    })
    session.on('detail_panel', (event) => { detailPanels.push(event.info) })

    const result = handleMutatingSlashCommand({
      cmd: '/thread',
      arg: 'search auth bug',
      history: [],
      stats: { turns: 0, totalInputTokens: 0, totalOutputTokens: 0 },
      cwd: '/tmp/orca-cli',
      mc: {
        getModel: () => 'model-a',
        setModel: () => true,
        getProvider: () => 'openai',
        getChoices: () => MODEL_CHOICES,
      },
      threadManager: {
        list: () => [
          { id: 'thread-1', title: 'Auth bug triage', messages: [{ role: 'user', content: 'auth issue' }], createdAt: '', updatedAt: '' },
        ],
        load: () => ({ id: 'thread-1', title: 'Auth bug triage', messages: [{ role: 'user', content: 'auth issue' }], createdAt: '', updatedAt: '' }),
      } as never,
      session,
    })

    expect(result).toBe('handled')
    await Promise.resolve()
    await Promise.resolve()
    expect(pickerPayloads).toEqual([{ title: 'Search threads', initialQuery: 'auth bug', filterable: true }])
    expect(detailPanels[0]?.title).toContain('Auth bug triage')
    expect(detailPanels[0]?.body).toContain('auth issue')
  })

  it('opens a searchable picker for /prompts find in ink mode', async () => {
    const orcaHome = mkdtempSync(join(tmpdir(), 'orca-prompts-find-picker-'))
    process.env.ORCA_HOME = orcaHome
    const promptsDir = join(orcaHome, 'knowledge', 'prompts')
    mkdirSync(promptsDir, { recursive: true })
    writeFileSync(join(promptsDir, 'prompt-test.json'), JSON.stringify({
      id: 'prompt-test',
      name: 'Review prompt',
      template: 'Review this code: {{code}}',
      category: 'code-review',
      variables: ['code'],
      usageCount: 3,
      successCount: 2,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }), 'utf-8')
    const session = new ChatSessionEmitter()
    const pickerPayloads: Array<{ title: string; initialQuery?: string; filterable?: boolean }> = []
    const detailPanels: Array<{ title: string; subtitle?: string; body: string }> = []
    session.on('option_picker_request', (event) => {
      pickerPayloads.push({
        title: event.request.title,
        initialQuery: event.request.initialQuery,
        filterable: event.request.filterable,
      })
      const first = event.request.options[0]
      event.request.resolve(first?.value ?? null)
    })
    session.on('detail_panel', (event) => { detailPanels.push(event.info) })

    const result = handleMutatingSlashCommand({
      cmd: '/prompts',
      arg: 'find review',
      history: [],
      stats: { turns: 0, totalInputTokens: 0, totalOutputTokens: 0 },
      cwd: '/tmp/orca-cli',
      mc: {
        getModel: () => 'model-a',
        setModel: () => true,
        getProvider: () => 'openai',
        getChoices: () => MODEL_CHOICES,
      },
      session,
    })

    expect(result).toBe('handled')
    await Promise.resolve()
    await Promise.resolve()

    rmSync(orcaHome, { recursive: true, force: true })

    expect(pickerPayloads).toEqual([{ title: 'Search prompts', initialQuery: 'review', filterable: true }])
    expect(detailPanels[0]?.title).toContain('Review prompt')
    expect(detailPanels[0]?.body).toContain('Review this code')
  })

  it('exports a thread through /thread export', () => {
    const outFile = join(tmpdir(), `orca-thread-export-${Date.now()}.json`)

    const result = handleMutatingSlashCommand({
      cmd: '/thread',
      arg: `export thread-1 ${outFile}`,
      history: [],
      stats: { turns: 0, totalInputTokens: 0, totalOutputTokens: 0 },
      cwd: '/tmp/orca-cli',
      mc: {
        getModel: () => 'model-a',
        setModel: () => true,
        getProvider: () => 'openai',
        getChoices: () => MODEL_CHOICES,
      },
      threadManager: {
        load: () => ({ id: 'thread-1', title: 'Export me', messages: [{ role: 'user', content: 'hello' }], createdAt: '', updatedAt: '' }),
      } as never,
    })

    expect(result).toBe('handled')
    const exported = JSON.parse(readFileSync(outFile, 'utf-8'))
    expect(exported.id).toBe('thread-1')
    rmSync(outFile, { force: true })
  })

  it('exports a thread as markdown through /thread markdown', () => {
    const outFile = join(tmpdir(), `orca-thread-markdown-${Date.now()}.md`)
    const exportMarkdown = vi.fn(() => true)

    const result = handleMutatingSlashCommand({
      cmd: '/thread',
      arg: `markdown thread-1 ${outFile}`,
      history: [],
      stats: { turns: 0, totalInputTokens: 0, totalOutputTokens: 0 },
      cwd: '/tmp/orca-cli',
      mc: {
        getModel: () => 'model-a',
        setModel: () => true,
        getProvider: () => 'openai',
        getChoices: () => MODEL_CHOICES,
      },
      threadManager: {
        exportMarkdown,
      } as never,
    })

    expect(result).toBe('handled')
    expect(exportMarkdown).toHaveBeenCalledWith('thread-1', outFile)
  })

  it('creates a share artifact through /thread share', () => {
    const shareBundle = vi.fn(() => ({
      markdownPath: '/tmp/shared-thread.md',
      metadataPath: '/tmp/shared-thread.artifact.json',
    }))

    const result = handleMutatingSlashCommand({
      cmd: '/thread',
      arg: 'share thread-1',
      history: [],
      stats: { turns: 0, totalInputTokens: 0, totalOutputTokens: 0 },
      cwd: '/tmp/orca-cli',
      mc: {
        getModel: () => 'model-a',
        setModel: () => true,
        getProvider: () => 'openai',
        getChoices: () => MODEL_CHOICES,
      },
      threadManager: {
        shareBundle,
      } as never,
    })

    expect(result).toBe('handled')
    expect(shareBundle).toHaveBeenCalledWith('thread-1', undefined)
  })

  it('imports a thread through /thread import', () => {
    const inFile = join(tmpdir(), `orca-thread-import-${Date.now()}.json`)
    writeFileSync(inFile, JSON.stringify({
      id: 'thread-import',
      title: 'Imported thread',
      messages: [{ role: 'user', content: 'hello' }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }), 'utf-8')

    const importFromFile = vi.fn(() => ({ id: 'thread-new', title: 'Imported thread', messages: [], createdAt: '', updatedAt: '' }))

    const result = handleMutatingSlashCommand({
      cmd: '/thread',
      arg: `import ${inFile}`,
      history: [],
      stats: { turns: 0, totalInputTokens: 0, totalOutputTokens: 0 },
      cwd: '/tmp/orca-cli',
      mc: {
        getModel: () => 'model-a',
        setModel: () => true,
        getProvider: () => 'openai',
        getChoices: () => MODEL_CHOICES,
      },
      threadManager: {
        importFromFile,
      } as never,
    })

    expect(result).toBe('handled')
    expect(importFromFile).toHaveBeenCalledWith(inFile, undefined)
    rmSync(inFile, { force: true })
  })

  it('creates a handoff thread through /thread handoff', () => {
    const fork = vi.fn(() => ({ id: 'thread-handoff', title: 'Handoff: thread-1', messages: [], createdAt: '', updatedAt: '' }))
    const writeHandoffBundle = vi.fn(() => ({
      markdownPath: '/tmp/handoff-thread.md',
      metadataPath: '/tmp/handoff-thread.artifact.json',
    }))

    const result = handleMutatingSlashCommand({
      cmd: '/thread',
      arg: 'handoff thread-1',
      history: [],
      stats: { turns: 0, totalInputTokens: 0, totalOutputTokens: 0 },
      cwd: '/tmp/orca-cli',
      mc: {
        getModel: () => 'model-a',
        setModel: () => true,
        getProvider: () => 'openai',
        getChoices: () => MODEL_CHOICES,
      },
      threadManager: {
        fork,
        writeHandoffBundle,
      } as never,
    })

    expect(result).toBe('handled')
    expect(fork).toHaveBeenCalledWith('thread-1', 'Handoff: thread-1', { handoff: true })
    expect(writeHandoffBundle).toHaveBeenCalledWith('thread-handoff', 'thread-1')
  })

  it('drops buffered input when loading a saved session', async () => {
    const orcaHome = mkdtempSync(join(tmpdir(), 'orca-slash-load-buffer-'))
    process.env.ORCA_HOME = orcaHome
    writeSavedSession('reflect-buffered-load', {
      provider: 'openai',
      model: 'model-a',
      modeId: 'reflect',
      history: [{ role: 'system', content: 'You are in reflect mode.\n\nBase prompt' }],
      stats: { turns: 1, inputTokens: 10, outputTokens: 20 },
      savedAt: new Date().toISOString(),
    })

    const session = new ChatSessionEmitter()
    session.submitInput('stale input')

    const result = handleMutatingSlashCommand({
      cmd: '/load',
      arg: 'reflect-buffered-load',
      history: [{ role: 'system', content: 'Current prompt' }],
      stats: { turns: 0, totalInputTokens: 0, totalOutputTokens: 0, startTime: 1, turnTokens: [] },
      cwd: '/tmp/orca-cli',
      mc: {
        getModel: () => 'model-a',
        setModel: () => true,
        getProvider: () => 'openai',
        getChoices: () => MODEL_CHOICES,
      },
      modeRegistry: {
        getActive: () => ({ id: 'default' }),
        switchTo: () => true,
      } as never,
      session,
    })

    rmSync(orcaHome, { recursive: true, force: true })

    expect(result).toBe('handled')
    await expectBufferedInputDropped(session)
  })

  it('restores legacy /load sessions into default mode', () => {
    const orcaHome = mkdtempSync(join(tmpdir(), 'orca-slash-load-legacy-mode-'))
    process.env.ORCA_HOME = orcaHome
    writeSavedSession('legacy-load', {
      provider: 'openai',
      model: 'model-a',
      history: [{ role: 'system', content: 'Legacy base prompt' }],
      stats: { turns: 3, inputTokens: 30, outputTokens: 60 },
      savedAt: new Date().toISOString(),
    })

    const switchTo = vi.fn().mockReturnValue(true)
    const result = handleMutatingSlashCommand({
      cmd: '/load',
      arg: 'legacy-load',
      history: [{ role: 'system', content: 'Current prompt' }],
      stats: { turns: 1, totalInputTokens: 10, totalOutputTokens: 20, startTime: 1, turnTokens: [5] },
      cwd: '/tmp/orca-cli',
      mc: {
        getModel: () => 'model-a',
        setModel: () => true,
        getProvider: () => 'openai',
        getChoices: () => MODEL_CHOICES,
      },
      modeRegistry: {
        getActive: () => ({ id: 'reflect' }),
        switchTo,
      } as never,
    })

    rmSync(orcaHome, { recursive: true, force: true })

    expect(result).toBe('handled')
    expect(switchTo).toHaveBeenCalledWith('default')
  })

  it('does not mutate the current session on /load when saved history is malformed', () => {
    const orcaHome = mkdtempSync(join(tmpdir(), 'orca-slash-load-invalid-history-'))
    process.env.ORCA_HOME = orcaHome
    writeSavedSession('broken-load', {
      provider: 'openai',
      model: 'model-a',
      modeId: 'reflect',
      history: [null] as never,
      stats: { turns: 3, inputTokens: 30, outputTokens: 60 },
      savedAt: new Date().toISOString(),
    })
    const history: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [{ role: 'system', content: 'Current prompt' }]
    const stats = { turns: 1, totalInputTokens: 10, totalOutputTokens: 20, startTime: 123, turnTokens: [5] }
    const setModel = vi.fn(() => true)
    const switchTo = vi.fn().mockReturnValue(true)
    const lines: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...args) => { lines.push(args.join(' ')) })

    const result = handleMutatingSlashCommand({
      cmd: '/load',
      arg: 'broken-load',
      history,
      stats,
      cwd: '/tmp/orca-cli',
      mc: {
        getModel: () => 'model-a',
        setModel,
        getProvider: () => 'openai',
        getChoices: () => MODEL_CHOICES,
      },
      modeRegistry: {
        getActive: () => ({ id: 'default' }),
        switchTo,
      } as never,
    })

    rmSync(orcaHome, { recursive: true, force: true })

    expect(result).toBe('handled')
    expect(history).toEqual([{ role: 'system', content: 'Current prompt' }])
    expect(stats.turns).toBe(1)
    expect(stats.turnTokens).toEqual([5])
    expect(setModel).not.toHaveBeenCalled()
    expect(switchTo).not.toHaveBeenCalled()
    expect(lines.join('\n')).toContain('malformed history entry')
  })

  it('does not mutate the current session on /load when the saved history starts without a system prompt', () => {
    const orcaHome = mkdtempSync(join(tmpdir(), 'orca-slash-load-missing-system-'))
    process.env.ORCA_HOME = orcaHome
    writeSavedSession('missing-system', {
      provider: 'openai',
      model: 'model-a',
      modeId: 'reflect',
      history: [{ role: 'user', content: 'Hello' }] as never,
      stats: { turns: 3, inputTokens: 30, outputTokens: 60 },
      savedAt: new Date().toISOString(),
    })
    const history: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [{ role: 'system', content: 'Current prompt' }]
    const stats = { turns: 1, totalInputTokens: 10, totalOutputTokens: 20, startTime: 123, turnTokens: [5] }
    const setModel = vi.fn(() => true)
    const switchTo = vi.fn().mockReturnValue(true)
    const lines: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...args) => { lines.push(args.join(' ')) })

    const result = handleMutatingSlashCommand({
      cmd: '/load',
      arg: 'missing-system',
      history,
      stats,
      cwd: '/tmp/orca-cli',
      mc: {
        getModel: () => 'model-a',
        setModel,
        getProvider: () => 'openai',
        getChoices: () => MODEL_CHOICES,
      },
      modeRegistry: {
        getActive: () => ({ id: 'default' }),
        switchTo,
      } as never,
    })

    rmSync(orcaHome, { recursive: true, force: true })

    expect(result).toBe('handled')
    expect(history).toEqual([{ role: 'system', content: 'Current prompt' }])
    expect(stats.turns).toBe(1)
    expect(setModel).not.toHaveBeenCalled()
    expect(switchTo).not.toHaveBeenCalled()
    expect(lines.join('\n')).toContain('missing system prompt')
  })

  it('resets stats and session side effects when loading a thread', () => {
    const onSessionReset = vi.fn()
    const session = new ChatSessionEmitter()
    const messages: string[] = []
    let clearCount = 0
    session.on('system_message', (event) => { messages.push(event.text) })
    session.on('clear', () => { clearCount += 1 })
    const history: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: 'System prompt' },
      { role: 'user', content: 'Old question' },
      { role: 'assistant', content: 'Old answer' },
    ]
    const startTime = Date.now() - 10_000
    const stats = { turns: 3, totalInputTokens: 30, totalOutputTokens: 60, startTime, turnTokens: [10, 20, 30] }
    const tokenBudget = { clearCurrentUsage: vi.fn(), reset: vi.fn() }
    const contextMonitor = { clearCurrentUsage: vi.fn(), reset: vi.fn() }
    const threadManager = {
      load: vi.fn().mockReturnValue({
        id: 't-1',
        title: 'Loaded thread',
        messages: [
          { role: 'user', content: 'New question' },
          { role: 'assistant', content: 'New answer' },
        ],
      }),
      list: vi.fn(),
      create: vi.fn(),
      search: vi.fn(),
    }

    const result = handleMutatingSlashCommand({
      cmd: '/thread',
      arg: 'load t-1',
      history,
      stats,
      cwd: '/tmp/orca-cli',
      mc: {
        getModel: () => 'model-a',
        setModel: () => true,
        getProvider: () => 'openai',
        getChoices: () => MODEL_CHOICES,
      },
      harness: {
        tokenBudget: tokenBudget as never,
        contextMonitor: contextMonitor as never,
      },
      threadManager: threadManager as never,
      onSessionReset,
      session,
    })

    expect(result).toBe('handled')
    expect(threadManager.load).toHaveBeenCalledWith('t-1')
    expect(history).toEqual([
      { role: 'system', content: 'System prompt' },
      { role: 'user', content: 'New question' },
      { role: 'assistant', content: 'New answer' },
    ])
    expect(stats.turns).toBe(0)
    expect(stats.totalInputTokens).toBe(0)
    expect(stats.totalOutputTokens).toBe(0)
    expect(stats.turnTokens).toEqual([])
    expect(stats.startTime).toBeGreaterThan(startTime)
    expect(clearCount).toBe(1)
    expect(messages).toContain('loaded thread: Loaded thread (2 messages)')
    expect(onSessionReset).toHaveBeenCalledOnce()
    expect(tokenBudget.clearCurrentUsage).toHaveBeenCalledOnce()
    expect(contextMonitor.clearCurrentUsage).toHaveBeenCalledOnce()
  })

  it('does not change model on /continue when the saved mode is unavailable', () => {
    const orcaHome = mkdtempSync(join(tmpdir(), 'orca-slash-continue-missing-mode-no-model-'))
    process.env.ORCA_HOME = orcaHome
    writeSavedSession('missing-continue-mode', {
      provider: 'openai',
      model: 'model-b',
      modeId: 'missing-mode',
      history: [{ role: 'system', content: 'You are in missing mode.\n\nBase prompt' }],
      stats: { turns: 2, inputTokens: 20, outputTokens: 40 },
      savedAt: new Date().toISOString(),
    })
    const setModel = vi.fn(() => true)
    const lines: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...args) => { lines.push(args.join(' ')) })

    const result = handleMutatingSlashCommand({
      cmd: '/continue',
      arg: '',
      history: [{ role: 'system', content: 'Current prompt' }],
      stats: { turns: 1, totalInputTokens: 10, totalOutputTokens: 20, startTime: 123, turnTokens: [5] },
      cwd: '/tmp/orca-cli',
      mc: {
        getModel: () => 'model-a',
        setModel,
        getProvider: () => 'openai',
        getChoices: () => MODEL_CHOICES,
      },
      modeRegistry: {
        getActive: () => ({ id: 'default' }),
        switchTo: vi.fn().mockReturnValue(false),
      } as never,
    })

    rmSync(orcaHome, { recursive: true, force: true })

    expect(result).toBe('handled')
    expect(setModel).not.toHaveBeenCalled()
    expect(lines.join('\n')).toContain('saved mode unavailable: missing-mode')
  })
})
