import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createProvidersCommand } from '../src/commands/providers.js'

describe('providers command', () => {
  const envSnapshot = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    ARMATURE_PROVIDER: process.env.ARMATURE_PROVIDER,
    HOME: process.env.HOME,
    ARMATURE_HOME: process.env.ARMATURE_HOME,
  }

  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-openai-key'
    process.env.ARMATURE_PROVIDER = 'openai'
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (envSnapshot.OPENAI_API_KEY === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = envSnapshot.OPENAI_API_KEY

    if (envSnapshot.ARMATURE_PROVIDER === undefined) delete process.env.ARMATURE_PROVIDER
    else process.env.ARMATURE_PROVIDER = envSnapshot.ARMATURE_PROVIDER

    if (envSnapshot.HOME === undefined) delete process.env.HOME
    else process.env.HOME = envSnapshot.HOME

    if (envSnapshot.ARMATURE_HOME === undefined) delete process.env.ARMATURE_HOME
    else process.env.ARMATURE_HOME = envSnapshot.ARMATURE_HOME
  })

  it('lists provider metadata including context and pricing', async () => {
    const logs: string[] = []
    const spy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      logs.push(args.join(' '))
    })

    const command = createProvidersCommand()
    await command.parseAsync(['node', 'armature', 'providers'])

    const output = logs.join('\n')
    expect(output).toContain('Configured Providers')
    expect(output).toContain('openai')
    expect(output).toContain('ctx')
    expect(output).toContain('/1M in/out')
    expect(output).not.toContain('$ $')
    spy.mockRestore()
  })

  it('shows disabled providers as inactive instead of active', async () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), 'armature-providers-disabled-'))
    try {
      process.env.HOME = tmpRoot
      process.env.ARMATURE_HOME = join(tmpRoot, '.armature')
      writeFileSync(join(tmpRoot, '.armature.json'), JSON.stringify({
        providers: {
          openai: {
            apiKey: 'test-openai-key',
            baseURL: 'https://api.openai.com/v1/',
            defaultModel: 'gpt-5.4',
            disabled: true,
          },
        },
        defaultProvider: 'openai',
      }, null, 2))

      const logs: string[] = []
      const spy = vi.spyOn(console, 'log').mockImplementation((...args) => {
        logs.push(args.join(' '))
      })

      const command = createProvidersCommand()
      await command.parseAsync(['node', 'armature', 'providers'])

      const output = logs.join('\n')
      expect(output).toContain('disabled')
      expect(output).toContain('Default provider: openai (inactive)')
      expect(output).toContain('openai')
      expect(output).not.toContain('\x1b[32mactive\x1b[0m')
      spy.mockRestore()
    } finally {
      rmSync(tmpRoot, { recursive: true, force: true })
    }
  })
})
