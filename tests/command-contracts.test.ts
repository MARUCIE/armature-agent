import { describe, it, expect } from 'vitest'
import { createProgram } from '../src/program.js'

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

    expect(commands).toEqual(expect.arrayContaining([
      'chat',
      'reflect',
      'doctor',
      'run',
      'session',
      'pr',
      'serve',
      'providers',
    ]))
    expect(rootOptions).toEqual(expect.arrayContaining([
      '--safe',
      '--effort',
      '--continue',
    ]))
  })

  it('keeps session lifecycle subcommands discoverable', () => {
    const session = getCommand('session')
    const subcommands = session.commands.map((entry) => entry.name())

    expect(subcommands).toEqual(expect.arrayContaining(['list', 'show', 'delete']))
    expect(session.description()).toBe('Manage saved sessions')
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

  it('keeps reflect surfaced as a first-class debugging command', () => {
    const reflect = getCommand('reflect')
    const options = reflect.options.map((option) => option.long)

    expect(reflect.description()).toBe('Socratic debugging and root-cause investigation')
    expect(options).toEqual(expect.arrayContaining(['--model', '--provider', '--api-key', '--json']))
  })
})
