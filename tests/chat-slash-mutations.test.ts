import { afterEach, describe, expect, it, vi } from 'vitest'
import { execSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ModelChoice } from '../src/model-catalog.js'
import { writeSavedSession } from '../src/session-store.js'
import { ChatSessionEmitter } from '../src/ui/session.js'

const loggerState = vi.hoisted(() => ({
  logInfo: vi.fn(),
  logWarning: vi.fn(),
}))

vi.mock('../src/logger.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/logger.js')>()
  return {
    ...actual,
    logInfo: loggerState.logInfo,
    logWarning: loggerState.logWarning,
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
  delete process.env.ORCA_HOME
})

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
