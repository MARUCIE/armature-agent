import { describe, expect, it } from 'vitest'
import {
  getSlashCommandDescription,
  getSlashCommandHomeDescription,
  listSlashCommandCompletions,
  listSlashCommandPickerItems,
  listSlashHelpCommands,
  SLASH_COMMAND_DEFINITIONS,
  SLASH_HELP_SECTION_PAIRS,
} from '../src/slash-commands.js'

describe('slash command registry', () => {
  it('keeps command names unique', () => {
    const names = SLASH_COMMAND_DEFINITIONS.map((command) => command.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('feeds the REPL completer and Ink picker from one registry', () => {
    const completions = listSlashCommandCompletions()
    const pickerNames = listSlashCommandPickerItems().map((command) => command.name)

    expect(completions).toContain('/permissions')
    expect(completions).toContain('/critique')
    expect(completions).toContain('/retry')
    expect(pickerNames).toContain('/permissions')
    expect(pickerNames).toContain('/critique')
    expect(pickerNames).toContain('/doctor')
    expect(pickerNames).not.toContain('/exit')
  })

  it('feeds help sections from the same command definitions', () => {
    const helpNames = SLASH_HELP_SECTION_PAIRS.flatMap(([left, right]) => [
      ...listSlashHelpCommands(left).map((command) => command.name),
      ...listSlashHelpCommands(right).map((command) => command.name),
    ])

    expect(helpNames).toContain('/status')
    expect(helpNames).toContain('/doctor')
    expect(helpNames).toContain('/permissions')
    expect(helpNames).toContain('/critique')
    expect(helpNames).not.toContain('/retry')
  })

  it('resolves descriptions for home and picker consumers', () => {
    expect(getSlashCommandDescription('/doctor')).toBe('Health check')
    expect(getSlashCommandDescription('/m')).toBe('Show/switch model')
    expect(getSlashCommandDescription('/missing')).toBe('')
    expect(getSlashCommandHomeDescription('/permissions')).toBe('inspect or tighten approval mode')
  })
})
