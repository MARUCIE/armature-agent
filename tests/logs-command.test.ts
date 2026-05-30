import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createLogsCommand } from '../src/commands/logs.js'
import { logError, logInfo } from '../src/logger.js'

describe('logs command', () => {
  const previousArmatureHome = process.env.ARMATURE_HOME
  let armatureHome: string

  beforeEach(() => {
    armatureHome = join(tmpdir(), `armature-logs-cmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
    mkdirSync(armatureHome, { recursive: true })
    process.env.ARMATURE_HOME = armatureHome
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (previousArmatureHome === undefined) delete process.env.ARMATURE_HOME
    else process.env.ARMATURE_HOME = previousArmatureHome
    try { rmSync(armatureHome, { recursive: true, force: true }) } catch { /* ignore */ }
  })

  it('shows agent log entries by default', async () => {
    logInfo('hello log world')
    const logs: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...args) => { logs.push(args.join(' ')) })

    const command = createLogsCommand()
    await command.parseAsync(['node', 'logs'])

    expect(logs.join('\n')).toContain('Armature Logs: agent')
    expect(logs.join('\n')).toContain('hello log world')
  })

  it('shows errors log when requested', async () => {
    logError('boom')
    const logs: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...args) => { logs.push(args.join(' ')) })

    const command = createLogsCommand()
    await command.parseAsync(['node', 'logs', 'errors'])

    expect(logs.join('\n')).toContain('Armature Logs: errors')
    expect(logs.join('\n')).toContain('boom')
  })

  it('falls back to agent logs for unknown log kinds', async () => {
    logInfo('fallback agent entry')
    const logs: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...args) => { logs.push(args.join(' ')) })

    const command = createLogsCommand()
    await command.parseAsync(['node', 'logs', 'nonsense'])

    const output = logs.join('\n')
    expect(output).toContain('Armature Logs: agent')
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
