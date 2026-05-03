import { describe, it, expect } from 'vitest'
import { createProgram } from '../src/program.js'
import { getWorkflowPreset } from '../src/modes/index.js'
import { listWorkflowPresets } from '../src/modes/index.js'

function getCommand(name: string) {
  const command = createProgram().commands.find((entry) => entry.name() === name)
  expect(command, `expected command "${name}" to exist`).toBeDefined()
  return command!
}

describe('public command surface contracts', () => {
  it('keeps root command coverage aligned with the expanded public surface', () => {
    const program = createProgram()
    const commands = program.commands.map((entry) => entry.name())
    const rootOptions = program.options.map((option) => option.long)
    const chatOptions = getCommand('chat').options.map((option) => option.long)

    expect(commands).toEqual(expect.arrayContaining([
      'chat',
      'reflect',
      'doctor',
      'run',
      'evolve',
      'session',
      'queue',
      'critique',
      'pr',
      'serve',
      'providers',
    ]))
    expect(rootOptions).toEqual(expect.arrayContaining([
      '--safe',
      '--effort',
      '--continue',
    ]))
    expect(chatOptions).toEqual(expect.arrayContaining([
      '--no-auto-critique',
      '--auto-critique-threshold',
    ]))
  })

  it('keeps session lifecycle subcommands discoverable', () => {
    const session = getCommand('session')
    const subcommands = session.commands.map((entry) => entry.name())

    expect(subcommands).toEqual(expect.arrayContaining(['list', 'show', 'delete']))
    expect(session.description()).toBe('Manage saved sessions')
  })

  it('keeps task-run queue inspection discoverable', () => {
    const queue = getCommand('queue')
    const subcommands = queue.commands.map((entry) => entry.name())

    expect(subcommands).toEqual(expect.arrayContaining(['list', 'show']))
    expect(queue.description()).toBe('Inspect queued and completed task runs')
  })

  it('keeps providers connectivity testing surfaced as a first-class subcommand', () => {
    const providers = getCommand('providers')
    const subcommands = providers.commands.map((entry) => entry.name())

    expect(subcommands).toContain('test')
    expect(providers.description()).toBe('List and test configured providers')
  })

  it('keeps pr review arguments and routing flags stable', () => {
    const pr = getCommand('pr')
    const args = pr.registeredArguments.map((arg) => ({
      name: arg.name(),
      required: arg.required,
      variadic: arg.variadic,
    }))
    const options = pr.options.map((option) => option.long)

    expect(args).toEqual([
      { name: 'number', required: true, variadic: false },
      { name: 'prompt', required: false, variadic: true },
    ])
    expect(options).toEqual(expect.arrayContaining(['--model', '--provider']))
  })

  it('keeps serve headless transport options stable', () => {
    const serve = getCommand('serve')
    const options = serve.options.map((option) => option.long)

    expect(serve.description()).toBe('Start headless agent server (HTTP + SSE)')
    expect(options).toEqual(expect.arrayContaining(['--port', '--host', '--mcp', '--model', '--provider']))
  })

  it('keeps evolve surfaced as a gated self-observation command', () => {
    const evolve = getCommand('evolve')
    const subcommands = evolve.commands.map((entry) => entry.name())

    expect(evolve.description()).toBe('Inspect and gate self-evolution candidates')
    expect(subcommands).toEqual(expect.arrayContaining([
      'status',
      'observations',
      'candidates',
      'draft',
      'verify',
      'promote',
      'reject',
    ]))
  })

  it('keeps reflect surfaced as a first-class debugging command', () => {
    const reflect = getCommand('reflect')
    const options = reflect.options.map((option) => option.long)

    expect(reflect.description()).toBe('Socratic debugging and root-cause investigation')
    expect(options).toEqual(expect.arrayContaining(['--model', '--provider', '--api-key', '--json']))
  })

  it('keeps critique surfaced as a read-only quality gate', () => {
    const critique = getCommand('critique')
    const args = critique.registeredArguments.map((arg) => ({
      name: arg.name(),
      required: arg.required,
      variadic: arg.variadic,
    }))
    const options = critique.options.map((option) => option.long)

    expect(critique.description()).toBe('Run a read-only Rubber Duck Critique quality gate')
    expect(args).toEqual([{ name: 'goal', required: false, variadic: true }])
    expect(options).toEqual(expect.arrayContaining([
      '--checkpoint',
      '--model',
      '--provider',
      '--api-key',
      '--dry-run',
      '--json',
    ]))
  })

  it('keeps workflow presets surfaced as first-class commands', () => {
    const review = getCommand('review')
    const debug = getCommand('debug')
    const architect = getCommand('architect')

    expect(review.description()).toBe(getWorkflowPreset('review')!.description)
    expect(debug.description()).toBe(getWorkflowPreset('debug')!.description)
    expect(architect.description()).toBe(getWorkflowPreset('architect')!.description)
  })

  it('keeps workflow presets carrying structured policy metadata', () => {
    expect(getWorkflowPreset('review')).toMatchObject({
      modelPolicy: 'inherit-current',
      defaultEffort: 'high',
      defaultPermissionMode: 'plan',
      toolPolicy: 'review-only',
      outputStyle: 'review-findings',
    })
    expect(getWorkflowPreset('debug')).toMatchObject({
      modelPolicy: 'inherit-current',
      defaultEffort: 'high',
      defaultPermissionMode: 'auto',
      toolPolicy: 'run-edit',
      outputStyle: 'debug-walkthrough',
    })
    expect(getWorkflowPreset('architect')).toMatchObject({
      modelPolicy: 'inherit-current',
      defaultEffort: 'max',
      defaultPermissionMode: 'plan',
      toolPolicy: 'planning-only',
      outputStyle: 'architecture-plan',
    })
  })

  it('keeps root help aligned with workflow preset registry descriptions', () => {
    const help = createProgram().helpInformation()
    for (const preset of listWorkflowPresets()) {
      expect(help).toContain(preset.commandName)
      expect(help).toContain(preset.description)
    }
  })
})
