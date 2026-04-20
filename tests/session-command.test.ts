import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('session command recovery', () => {
  const previousHome = process.env.HOME
  const previousOrcaHome = process.env.ORCA_HOME
  let homeDir: string
  let orcaHome: string

  function writeSessionFile(name: string, content: string, mtimeMs: number): void {
    const sessionFile = join(orcaHome, 'sessions', `${name}.json`)
    writeFileSync(sessionFile, content, 'utf-8')
    const mtime = new Date(mtimeMs)
    utimesSync(sessionFile, mtime, mtime)
  }

  function writeValidSession(name: string, mtimeMs: number): void {
    writeSessionFile(name, JSON.stringify({
      provider: 'openai',
      model: 'gpt-5.4',
      history: [{ role: 'user', content: 'hello' }],
      stats: { turns: 1, inputTokens: 10, outputTokens: 20 },
      savedAt: new Date(mtimeMs).toISOString(),
    }), mtimeMs)
  }

  async function loadSessionModule() {
    vi.resetModules()
    return import('../src/commands/session.js')
  }

  beforeEach(() => {
    homeDir = join(tmpdir(), `orca-session-home-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
    orcaHome = join(tmpdir(), `orca-session-store-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
    mkdirSync(join(homeDir, '.orca'), { recursive: true })
    mkdirSync(join(orcaHome, 'sessions'), { recursive: true })
    process.env.HOME = homeDir
    process.env.ORCA_HOME = orcaHome
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
    if (previousHome === undefined) delete process.env.HOME
    else process.env.HOME = previousHome
    if (previousOrcaHome === undefined) delete process.env.ORCA_HOME
    else process.env.ORCA_HOME = previousOrcaHome
    try { rmSync(homeDir, { recursive: true, force: true }) } catch { /* ignore */ }
    try { rmSync(orcaHome, { recursive: true, force: true }) } catch { /* ignore */ }
  })

  it('skips a corrupted latest session when resuming the most recent session', async () => {
    const now = Date.now()
    writeValidSession('resume-good', now - 10_000)
    writeSessionFile('resume-bad', '{ invalid json', now)

    const { getLastSession } = await loadSessionModule()
    const session = getLastSession()

    expect(session?.name).toBe('resume-good')
    expect(session?.session.model).toBe('gpt-5.4')
  })

  it('uses ORCA_HOME-backed storage and skips malformed partial-id matches', async () => {
    const now = Date.now()
    writeValidSession('alpha-good', now - 10_000)
    writeSessionFile('alpha-bad', '{ invalid json', now)

    const { getSessionById } = await loadSessionModule()
    const session = getSessionById('alpha')

    expect(session?.name).toBe('alpha-good')
    expect(session?.session.stats.turns).toBe(1)
  })

  it('preserves saved mode ids when resuming sessions', async () => {
    const now = Date.now()
    writeSessionFile('reflect-session', JSON.stringify({
      provider: 'openai',
      model: 'gpt-5.4',
      modeId: 'reflect',
      history: [{ role: 'system', content: 'You are in reflect mode.\n\nBase prompt' }],
      stats: { turns: 1, inputTokens: 10, outputTokens: 20 },
      savedAt: new Date(now).toISOString(),
    }), now)

    const { getLastSession } = await loadSessionModule()
    const session = getLastSession()

    expect(session?.session.modeId).toBe('reflect')
  })

  it('lists only valid sessions from the default session command entrypoint', async () => {
    const now = Date.now()
    writeValidSession('visible-session', now - 10_000)
    writeSessionFile('broken-session', '{ invalid json', now)
    const logs: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...args) => { logs.push(args.join(' ')) })

    const { createSessionCommand } = await loadSessionModule()
    const command = createSessionCommand()
    await command.parseAsync(['node', 'orca', 'session'])

    const output = logs.join('\n')
    expect(output).toContain('Saved Sessions')
    expect(output).toContain('visible-session')
    expect(output).not.toContain('broken-session')
    expect(output).toContain('1 session(s)')
  })
})
