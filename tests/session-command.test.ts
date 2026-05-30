import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { existsSync, mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('session command recovery', () => {
  const previousHome = process.env.HOME
  const previousArmatureHome = process.env.ARMATURE_HOME
  let homeDir: string
  let armatureHome: string

  function writeSessionFile(name: string, content: string, mtimeMs: number): void {
    const sessionFile = join(armatureHome, 'sessions', `${name}.json`)
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
    homeDir = join(tmpdir(), `armature-session-home-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
    armatureHome = join(tmpdir(), `armature-session-store-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
    mkdirSync(join(homeDir, '.armature'), { recursive: true })
    mkdirSync(join(armatureHome, 'sessions'), { recursive: true })
    process.env.HOME = homeDir
    process.env.ARMATURE_HOME = armatureHome
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
    if (previousHome === undefined) delete process.env.HOME
    else process.env.HOME = previousHome
    if (previousArmatureHome === undefined) delete process.env.ARMATURE_HOME
    else process.env.ARMATURE_HOME = previousArmatureHome
    try { rmSync(homeDir, { recursive: true, force: true }) } catch { /* ignore */ }
    try { rmSync(armatureHome, { recursive: true, force: true }) } catch { /* ignore */ }
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

  it('uses ARMATURE_HOME-backed storage and skips malformed partial-id matches', async () => {
    const now = Date.now()
    writeValidSession('alpha-good', now - 10_000)
    writeSessionFile('alpha-bad', '{ invalid json', now)

    const { getSessionById } = await loadSessionModule()
    const session = getSessionById('alpha')

    expect(session?.name).toBe('alpha-good')
    expect(session?.session.stats.turns).toBe(1)
  })

  it('resolves a specific continuation session by partial id when requested', async () => {
    const now = Date.now()
    writeValidSession('resume-alpha', now - 10_000)
    writeValidSession('resume-beta', now)

    const { getContinuationSession } = await loadSessionModule()
    const session = getContinuationSession('alpha')

    expect(session?.name).toBe('resume-alpha')
    expect(session?.session.model).toBe('gpt-5.4')
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
    await command.parseAsync(['node', 'armature', 'session'])

    const output = logs.join('\n')
    expect(output).toContain('Saved Sessions')
    expect(output).toContain('visible-session')
    expect(output).not.toContain('broken-session')
    expect(output).toContain('1 session(s)')
  })

  it('exports a saved session to a JSON file', async () => {
    const now = Date.now()
    writeValidSession('exportable-session', now)
    const outFile = join(tmpdir(), `armature-session-export-${Date.now()}.json`)

    const { createSessionCommand } = await loadSessionModule()
    const command = createSessionCommand()
    await command.parseAsync(['node', 'session', 'export', 'exportable-session', outFile])

    const exported = JSON.parse(readFileSync(outFile, 'utf-8'))
    expect(exported.model).toBe('gpt-5.4')
    expect(exported.stats.turns).toBe(1)
    rmSync(outFile, { force: true })
  })

  it('imports a saved session from JSON into ARMATURE_HOME storage', async () => {
    const inFile = join(tmpdir(), `armature-session-import-${Date.now()}.json`)
    writeFileSync(inFile, JSON.stringify({
      provider: 'openai',
      model: 'gpt-5.4',
      history: [{ role: 'user', content: 'import me' }],
      stats: { turns: 4, inputTokens: 40, outputTokens: 80 },
      savedAt: new Date().toISOString(),
    }), 'utf-8')

    const { createSessionCommand, getSessionById } = await loadSessionModule()
    const command = createSessionCommand()
    await command.parseAsync(['node', 'session', 'import', inFile, 'imported-session'])

    const imported = getSessionById('imported-session')
    expect(imported?.name).toBe('imported-session')
    expect(imported?.session.stats.turns).toBe(4)
    rmSync(inFile, { force: true })
  })

  it('forks an existing saved session into a new record', async () => {
    const now = Date.now()
    writeValidSession('fork-source', now)

    const { createSessionCommand, getSessionById } = await loadSessionModule()
    const command = createSessionCommand()
    await command.parseAsync(['node', 'session', 'fork', 'fork-source', 'fork-copy'])

    const forked = getSessionById('fork-copy')
    expect(forked?.name).toBe('fork-copy')
    expect(forked?.session.model).toBe('gpt-5.4')
  })

  it('exports a saved session as markdown', async () => {
    const now = Date.now()
    writeValidSession('markdown-session', now)
    const outFile = join(tmpdir(), `armature-session-markdown-${Date.now()}.md`)

    const { createSessionCommand } = await loadSessionModule()
    const command = createSessionCommand()
    await command.parseAsync(['node', 'session', 'markdown', 'markdown-session', outFile])

    const markdown = readFileSync(outFile, 'utf-8')
    expect(markdown).toContain('# Session: markdown-session')
    expect(markdown).toContain('## Transcript')
    rmSync(outFile, { force: true })
  })

  it('creates a shared markdown artifact for a saved session', async () => {
    const now = Date.now()
    writeValidSession('share-session', now)

    const { createSessionCommand } = await loadSessionModule()
    const command = createSessionCommand()
    await command.parseAsync(['node', 'session', 'share', 'share-session'])

    const sharePath = join(armatureHome, 'shares', 'session-share-session.md')
    const metadataPath = join(armatureHome, 'shares', 'session-share-session.artifact.json')
    expect(existsSync(sharePath)).toBe(true)
    expect(existsSync(metadataPath)).toBe(true)
    expect(readFileSync(sharePath, 'utf-8')).toContain('# Session: share-session')
    const metadata = JSON.parse(readFileSync(metadataPath, 'utf-8'))
    expect(metadata.kind).toBe('session-share')
    expect(metadata.name).toBe('share-session')
  })

  it('creates a handoff session plus handoff artifact bundle', async () => {
    const now = Date.now()
    writeValidSession('handoff-source', now)

    const { createSessionCommand, getSessionById } = await loadSessionModule()
    const command = createSessionCommand()
    await command.parseAsync(['node', 'session', 'handoff', 'handoff-source', 'handoff-copy'])

    const forked = getSessionById('handoff-copy')
    expect(forked?.name).toBe('handoff-copy')

    const sharePath = join(armatureHome, 'shares', 'handoff-handoff-copy.md')
    const metadataPath = join(armatureHome, 'shares', 'handoff-handoff-copy.artifact.json')
    expect(existsSync(sharePath)).toBe(true)
    expect(existsSync(metadataPath)).toBe(true)
    const metadata = JSON.parse(readFileSync(metadataPath, 'utf-8'))
    expect(metadata.kind).toBe('session-handoff')
    expect(metadata.sourceSessionName).toBe('handoff-source')
    expect(metadata.name).toBe('handoff-copy')
  })
})
