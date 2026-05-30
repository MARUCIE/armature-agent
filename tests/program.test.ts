import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createProgram } from '../src/program.js'
import { listWorkflowPresets } from '../src/modes/index.js'
import { getWorkflowPreset } from '../src/modes/index.js'
import { resolveWorkflowPresetRuntimeOptions } from '../src/commands/workflows.js'

describe('program', () => {
  it('creates a program with armature name', () => {
    const program = createProgram()
    expect(program.name()).toBe('armature')
  })

  it('has version set', () => {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8')) as { version: string }
    const program = createProgram()
    expect(program.version()).toBe(pkg.version)
  })

  it('registers init command', () => {
    const program = createProgram()
    const commands = program.commands.map(c => c.name())
    expect(commands).toContain('init')
  })

  it('registers chat command', () => {
    const program = createProgram()
    const commands = program.commands.map(c => c.name())
    expect(commands).toContain('chat')
  })

  it('registers reflect command', () => {
    const program = createProgram()
    const commands = program.commands.map(c => c.name())
    expect(commands).toContain('reflect')
  })

  it('registers review command', () => {
    const program = createProgram()
    const commands = program.commands.map(c => c.name())
    expect(commands).toContain('review')
  })

  it('registers debug command', () => {
    const program = createProgram()
    const commands = program.commands.map(c => c.name())
    expect(commands).toContain('debug')
  })

  it('registers architect command', () => {
    const program = createProgram()
    const commands = program.commands.map(c => c.name())
    expect(commands).toContain('architect')
  })

  it('registers doctor command', () => {
    const program = createProgram()
    const commands = program.commands.map(c => c.name())
    expect(commands).toContain('doctor')
  })

  it('registers permissions command', () => {
    const program = createProgram()
    const commands = program.commands.map(c => c.name())
    expect(commands).toContain('permissions')
  })

  it('registers queue command', () => {
    const program = createProgram()
    const commands = program.commands.map(c => c.name())
    expect(commands).toContain('queue')
  })

  it('registers run command', () => {
    const program = createProgram()
    const commands = program.commands.map(c => c.name())
    expect(commands).toContain('run')
  })

  it('registers logs command', () => {
    const program = createProgram()
    const commands = program.commands.map(c => c.name())
    expect(commands).toContain('logs')
  })

  it('registers critique command', () => {
    const program = createProgram()
    const commands = program.commands.map(c => c.name())
    expect(commands).toContain('critique')
  })

  it('registers review-ledger command', () => {
    const program = createProgram()
    const commands = program.commands.map(c => c.name())
    expect(commands).toContain('review-ledger')
  })

  it('chat command has model option', () => {
    const program = createProgram()
    const chat = program.commands.find(c => c.name() === 'chat')!
    const options = chat.options.map(o => o.long)
    expect(options).toContain('--model')
    expect(options).toContain('--provider')
    expect(options).toContain('--api-key')
    expect(options).toContain('--json')
  })

  it('reflect command mirrors chat runtime options', () => {
    const program = createProgram()
    const reflect = program.commands.find(c => c.name() === 'reflect')!
    const options = reflect.options.map(o => o.long)
    expect(options).toEqual(expect.arrayContaining(['--model', '--provider', '--api-key', '--json']))
  })

  it('workflow preset commands mirror chat runtime options', () => {
    const program = createProgram()
    for (const preset of listWorkflowPresets().filter((entry) => entry.commandName !== 'reflect')) {
      const command = program.commands.find(c => c.name() === preset.commandName)!
      const options = command.options.map(o => o.long)
      expect(options).toEqual(expect.arrayContaining(['--model', '--provider', '--api-key', '--json']))
    }
  })

  it('preset-generated commands inherit the full chat runtime surface', () => {
    const program = createProgram()
    const chat = program.commands.find(c => c.name() === 'chat')!
    const chatOptions = chat.options.map(o => o.long).sort()

    for (const preset of listWorkflowPresets()) {
      const command = program.commands.find(c => c.name() === preset.commandName)!
      const options = command.options.map(o => o.long).sort()
      expect(options).toEqual(chatOptions)
    }
  })

  it('registers every workflow preset command from the registry', () => {
    const program = createProgram()
    const commands = program.commands.map(c => c.name())
    expect(commands).toEqual(expect.arrayContaining(listWorkflowPresets().map((preset) => preset.commandName)))
  })

  it('keeps root continue option as an optional session id argument', () => {
    const program = createProgram()
    const continueOption = program.options.find((option) => option.long === '--continue')
    expect(continueOption?.optional).toBe(true)
  })

  it('root command exposes cwd forwarding for launchers', () => {
    const program = createProgram()
    const options = program.options.map(o => o.long)
    expect(options).toContain('--cwd')
  })

  it('resolves preset startup runtime options from the preset registry', () => {
    const reviewPreset = getWorkflowPreset('review')!
    const debugPreset = getWorkflowPreset('debug')!

    expect(resolveWorkflowPresetRuntimeOptions(reviewPreset, {})).toEqual({
      effort: 'high',
      forceReflect: undefined,
      initialModeId: 'code-review',
      initialPermissionMode: 'plan',
    })
    expect(resolveWorkflowPresetRuntimeOptions(debugPreset, { effort: 'low' })).toEqual({
      effort: 'low',
      forceReflect: undefined,
      initialModeId: 'debug',
      initialPermissionMode: 'auto',
    })
  })

  it('run command has dangerously option', () => {
    const program = createProgram()
    const run = program.commands.find(c => c.name() === 'run')!
    const options = run.options.map(o => o.long)
    expect(options).toContain('--dangerously')
    expect(options).toContain('--max-turns')
  })

  it('run command defaults max-turns to 50', () => {
    const program = createProgram()
    const run = program.commands.find(c => c.name() === 'run')!
    const maxTurns = run.options.find(o => o.long === '--max-turns')
    expect(maxTurns?.defaultValue).toBe('50')
  })
})
