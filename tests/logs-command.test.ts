import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createLogsCommand } from '../src/commands/logs.js'
import { logError, logInfo } from '../src/logger.js'

describe('logs command', () => {
  const previousOrcaHome = process.env.ORCA_HOME
  let orcaHome: string

  beforeEach(() => {
    orcaHome = join(tmpdir(), `orca-logs-cmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
    mkdirSync(orcaHome, { recursive: true })
    process.env.ORCA_HOME = orcaHome
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (previousOrcaHome === undefined) delete process.env.ORCA_HOME
    else process.env.ORCA_HOME = previousOrcaHome
    try { rmSync(orcaHome, { recursive: true, force: true }) } catch { /* ignore */ }
  })

  it('shows agent log entries by default', async () => {
    logInfo('hello log world')
    const logs: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...args) => { logs.push(args.join(' ')) })

    const command = createLogsCommand()
    await command.parseAsync(['node', 'logs'])

    expect(logs.join('\n')).toContain('Orca Logs: agent')
    expect(logs.join('\n')).toContain('hello log world')
  })

  it('shows errors log when requested', async () => {
    logError('boom')
    const logs: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...args) => { logs.push(args.join(' ')) })

    const command = createLogsCommand()
    await command.parseAsync(['node', 'logs', 'errors'])

    expect(logs.join('\n')).toContain('Orca Logs: errors')
    expect(logs.join('\n')).toContain('boom')
  })

  it('falls back to agent logs for unknown log kinds', async () => {
    logInfo('fallback agent entry')
    const logs: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...args) => { logs.push(args.join(' ')) })

    const command = createLogsCommand()
    await command.parseAsync(['node', 'logs', 'nonsense'])

    const output = logs.join('\n')
    expect(output).toContain('Orca Logs: agent')
    expect(output).toContain('fallback agent entry')
  })

  it('clamps --lines 0 down to the newest entry', async () => {
    logInfo('line one')
    logInfo('line two')
    const logs: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...args) => { logs.push(args.join(' ')) })

    const command = createLogsCommand()
    await command.parseAsync(['node', 'logs', '--lines', '0'])

    const output = logs.join('\n')
    expect(output).toContain('line two')
    expect(output).not.toContain('line one')
  })
})
