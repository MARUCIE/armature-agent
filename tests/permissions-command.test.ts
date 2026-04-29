import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('permissions command', () => {
  const previousHome = process.env.HOME
  const previousOrcaHome = process.env.ORCA_HOME
  let homeDir: string
  let orcaHome: string
  let projectDir: string

  beforeEach(() => {
    homeDir = join(tmpdir(), `orca-permissions-home-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
    orcaHome = join(tmpdir(), `orca-permissions-store-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
    projectDir = join(tmpdir(), `orca-permissions-project-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
    mkdirSync(homeDir, { recursive: true })
    mkdirSync(orcaHome, { recursive: true })
    mkdirSync(projectDir, { recursive: true })
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
    try { rmSync(homeDir, { recursive: true, force: true }) } catch {}
    try { rmSync(orcaHome, { recursive: true, force: true }) } catch {}
    try { rmSync(projectDir, { recursive: true, force: true }) } catch {}
  })

  it('persists project permission mode via set subcommand', async () => {
    const originalCwd = process.cwd()
    process.chdir(projectDir)
    try {
      const logs: string[] = []
      vi.spyOn(console, 'log').mockImplementation((...args) => { logs.push(args.join(' ')) })
      const { createPermissionsCommand } = await import('../src/commands/permissions.js')
      const command = createPermissionsCommand()
      await command.parseAsync(['node', 'permissions', 'set', 'plan', '--scope', 'project'])

      const projectConfig = readFileSync(join(projectDir, '.orca.json'), 'utf-8')
      expect(projectConfig).toContain('"permissionMode": "plan"')
      expect(logs.join('\n')).toContain('updated project permission mode -> plan')
    } finally {
      process.chdir(originalCwd)
    }
  })

  it('shows resolved source and rule counts', async () => {
    const originalCwd = process.cwd()
    process.chdir(projectDir)
    try {
      const logs: string[] = []
      vi.spyOn(console, 'log').mockImplementation((...args) => { logs.push(args.join(' ')) })
      const { createPermissionsCommand } = await import('../src/commands/permissions.js')
      const command = createPermissionsCommand()
      await command.parseAsync(['node', 'permissions'])

      const output = logs.join('\n')
      expect(output).toContain('source:')
      expect(output).toContain('Rules:')
    } finally {
      process.chdir(originalCwd)
    }
  })

  it('lists stored permission rules', async () => {
    const originalCwd = process.cwd()
    process.chdir(projectDir)
    try {
      const { addStoredPermissionRule } = await import('../src/config.js')
      addStoredPermissionRule('project', projectDir, 'run_command::run: echo hello')
      addStoredPermissionRule('global', projectDir, 'read_file::read: README.md')

      const logs: string[] = []
      vi.spyOn(console, 'log').mockImplementation((...args) => { logs.push(args.join(' ')) })
      const { createPermissionsCommand } = await import('../src/commands/permissions.js')
      const command = createPermissionsCommand()
      await command.parseAsync(['node', 'permissions', 'rules'])

      const output = logs.join('\n')
      expect(output).toContain('Permission Rules')
      expect(output).toContain('Project:')
      expect(output).toContain('Global:')
      expect(output).toContain('run_command::run: echo hello')
      expect(output).toContain('[legacy]')
      expect(output).toContain('run_command|command=echo hello')
      expect(output).toContain('read_file::read: README.md')
    } finally {
      process.chdir(originalCwd)
    }
  })

  it('filters permission rules by status', async () => {
    const originalCwd = process.cwd()
    process.chdir(projectDir)
    try {
      const { addStoredPermissionRule } = await import('../src/config.js')
      addStoredPermissionRule('project', projectDir, 'run_command::run: echo hello')
      addStoredPermissionRule('project', projectDir, 'run_command|command=echo hello')

      const logs: string[] = []
      vi.spyOn(console, 'log').mockImplementation((...args) => { logs.push(args.join(' ')) })
      const { createPermissionsCommand } = await import('../src/commands/permissions.js')
      const command = createPermissionsCommand()
      await command.parseAsync(['node', 'permissions', 'rules', 'project', '--status', 'legacy'])

      const output = logs.join('\n')
      expect(output).toContain('Project:')
      expect(output).toContain('(legacy)')
      expect(output).toContain('run_command::run: echo hello')
      expect(output).not.toContain('[canonical] run_command|command=echo hello')
    } finally {
      process.chdir(originalCwd)
    }
  })

  it('revokes one stored permission rule', async () => {
    const originalCwd = process.cwd()
    process.chdir(projectDir)
    try {
      const { addStoredPermissionRule } = await import('../src/config.js')
      addStoredPermissionRule('project', projectDir, 'run_command::run: echo hello')

      const logs: string[] = []
      vi.spyOn(console, 'log').mockImplementation((...args) => { logs.push(args.join(' ')) })
      const { createPermissionsCommand } = await import('../src/commands/permissions.js')
      const command = createPermissionsCommand()
      await command.parseAsync(['node', 'permissions', 'revoke', 'project', 'run_command::run: echo hello'])

      const projectConfig = readFileSync(join(projectDir, '.orca.json'), 'utf-8')
      expect(projectConfig).not.toContain('run_command::run: echo hello')
      expect(logs.join('\n')).toContain('removed project rule')
    } finally {
      process.chdir(originalCwd)
    }
  })

  it('supports numbered selection when revoking a rule without passing the exact key', async () => {
    const originalCwd = process.cwd()
    process.chdir(projectDir)
    try {
      const { addStoredPermissionRule } = await import('../src/config.js')
      addStoredPermissionRule('project', projectDir, 'run_command::run: echo hello')
      addStoredPermissionRule('project', projectDir, 'write_file::write: src/index.ts')

      const logs: string[] = []
      vi.spyOn(console, 'log').mockImplementation((...args) => { logs.push(args.join(' ')) })
      vi.doMock('node:readline', () => ({
        createInterface: () => ({
          question: (_prompt: string, callback: (input: string) => void) => callback('2'),
          close: vi.fn(),
        }),
      }))

      const { createPermissionsCommand } = await import('../src/commands/permissions.js')
      const command = createPermissionsCommand()
      await command.parseAsync(['node', 'permissions', 'revoke', 'project'])

      const projectConfig = readFileSync(join(projectDir, '.orca.json'), 'utf-8')
      expect(projectConfig).toContain('run_command::run: echo hello')
      expect(projectConfig).not.toContain('write_file::write: src/index.ts')
      expect(logs.join('\n')).toContain('Select project rule to remove')
    } finally {
      process.chdir(originalCwd)
    }
  })

  it('supports filter-then-select when revoking a rule without the exact key', async () => {
    const originalCwd = process.cwd()
    process.chdir(projectDir)
    try {
      const { addStoredPermissionRule } = await import('../src/config.js')
      addStoredPermissionRule('project', projectDir, 'run_command::run: echo hello')
      addStoredPermissionRule('project', projectDir, 'write_file::write: src/index.ts')

      const answers = ['write_file', '1']
      const logs: string[] = []
      vi.spyOn(console, 'log').mockImplementation((...args) => { logs.push(args.join(' ')) })
      vi.doMock('node:readline', () => ({
        createInterface: () => ({
          question: (_prompt: string, callback: (input: string) => void) => callback(answers.shift() || ''),
          close: vi.fn(),
        }),
      }))

      const { createPermissionsCommand } = await import('../src/commands/permissions.js')
      const command = createPermissionsCommand()
      await command.parseAsync(['node', 'permissions', 'revoke', 'project'])

      const projectConfig = readFileSync(join(projectDir, '.orca.json'), 'utf-8')
      expect(projectConfig).toContain('run_command::run: echo hello')
      expect(projectConfig).not.toContain('write_file::write: src/index.ts')
      expect(logs.join('\n')).toContain('filter:')
      expect(logs.join('\n')).toContain('(none)')
    } finally {
      process.chdir(originalCwd)
    }
  })

  it('clears all stored permission rules for a scope', async () => {
    const originalCwd = process.cwd()
    process.chdir(projectDir)
    try {
      const { addStoredPermissionRule } = await import('../src/config.js')
      addStoredPermissionRule('project', projectDir, 'run_command::run: echo hello')
      addStoredPermissionRule('project', projectDir, 'write_file::write: src/index.ts')

      const logs: string[] = []
      vi.spyOn(console, 'log').mockImplementation((...args) => { logs.push(args.join(' ')) })
      const { createPermissionsCommand } = await import('../src/commands/permissions.js')
      const command = createPermissionsCommand()
      await command.parseAsync(['node', 'permissions', 'clear', 'project'])

      const projectConfig = readFileSync(join(projectDir, '.orca.json'), 'utf-8')
      expect(projectConfig).toContain('"permissionAllowlist": []')
      expect(logs.join('\n')).toContain('cleared 2 project rule(s)')
    } finally {
      process.chdir(originalCwd)
    }
  })

  it('normalizes stored permission rules to canonical descriptors', async () => {
    const originalCwd = process.cwd()
    process.chdir(projectDir)
    try {
      const { addStoredPermissionRule } = await import('../src/config.js')
      addStoredPermissionRule('project', projectDir, 'write_file|write 120 bytes to src/index.ts')
      addStoredPermissionRule('project', projectDir, 'run_command|run: echo hello')

      const logs: string[] = []
      vi.spyOn(console, 'log').mockImplementation((...args) => { logs.push(args.join(' ')) })
      const { createPermissionsCommand } = await import('../src/commands/permissions.js')
      const command = createPermissionsCommand()
      await command.parseAsync(['node', 'permissions', 'normalize', 'project'])

      const projectConfig = readFileSync(join(projectDir, '.orca.json'), 'utf-8')
      expect(projectConfig).toContain('write_file|path=src/index.ts')
      expect(projectConfig).toContain('run_command|command=echo hello')
      expect(logs.join('\n')).toContain('normalized project: 2 changed, 0 unresolved, 2 total')
    } finally {
      process.chdir(originalCwd)
    }
  })

  it('normalizes legacy double-colon rules to canonical descriptors', async () => {
    const originalCwd = process.cwd()
    process.chdir(projectDir)
    try {
      const { addStoredPermissionRule } = await import('../src/config.js')
      addStoredPermissionRule('project', projectDir, 'run_command::run: echo hello')

      const { createPermissionsCommand } = await import('../src/commands/permissions.js')
      const command = createPermissionsCommand()
      await command.parseAsync(['node', 'permissions', 'normalize', 'project'])

      const projectConfig = readFileSync(join(projectDir, '.orca.json'), 'utf-8')
      expect(projectConfig).toContain('run_command|command=echo hello')
      expect(projectConfig).not.toContain('run_command::run: echo hello')
    } finally {
      process.chdir(originalCwd)
    }
  })

  it('normalizes project scope without mutating global scope', async () => {
    const originalCwd = process.cwd()
    process.chdir(projectDir)
    try {
      const { addStoredPermissionRule, readStoredPermissionAllowlist } = await import('../src/config.js')
      addStoredPermissionRule('project', projectDir, 'write_file|write 120 bytes to src/index.ts')
      addStoredPermissionRule('global', projectDir, 'run_command|run: echo hello')

      const { createPermissionsCommand } = await import('../src/commands/permissions.js')
      const command = createPermissionsCommand()
      await command.parseAsync(['node', 'permissions', 'normalize', 'project'])

      expect(readStoredPermissionAllowlist('project', projectDir)).toEqual(['write_file|path=src/index.ts'])
      expect(readStoredPermissionAllowlist('global', projectDir)).toEqual(['run_command|run: echo hello'])
    } finally {
      process.chdir(originalCwd)
    }
  })

  it('normalizes all scopes and prints per-scope counts', async () => {
    const originalCwd = process.cwd()
    process.chdir(projectDir)
    try {
      const { addStoredPermissionRule } = await import('../src/config.js')
      addStoredPermissionRule('project', projectDir, 'write_file|write 120 bytes to src/index.ts')
      addStoredPermissionRule('global', projectDir, 'run_command|run: echo hello')

      const logs: string[] = []
      vi.spyOn(console, 'log').mockImplementation((...args) => { logs.push(args.join(' ')) })
      const { createPermissionsCommand } = await import('../src/commands/permissions.js')
      const command = createPermissionsCommand()
      await command.parseAsync(['node', 'permissions', 'normalize'])

      const output = logs.join('\n')
      expect(output).toContain('normalized project: 1 changed, 0 unresolved, 1 total')
      expect(output).toContain('normalized global: 1 changed, 0 unresolved, 1 total')
    } finally {
      process.chdir(originalCwd)
    }
  })
})
