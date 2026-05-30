import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getCommandPickerFilter, shouldShowCommandPicker, truncateLabel } from '../src/ui/utils.js'

const COMMANDS = [
  { name: '/help' },
  { name: '/model' },
  { name: '/clear' },
]

const ORIGINAL_HOME = process.env.HOME
const ORIGINAL_USERPROFILE = process.env.USERPROFILE
const ORIGINAL_ARMATURE_THEME = process.env.ARMATURE_THEME

afterEach(() => {
  if (ORIGINAL_HOME === undefined) delete process.env.HOME
  else process.env.HOME = ORIGINAL_HOME

  if (ORIGINAL_USERPROFILE === undefined) delete process.env.USERPROFILE
  else process.env.USERPROFILE = ORIGINAL_USERPROFILE

  if (ORIGINAL_ARMATURE_THEME === undefined) delete process.env.ARMATURE_THEME
  else process.env.ARMATURE_THEME = ORIGINAL_ARMATURE_THEME

  vi.resetModules()
})

describe('ui utils', () => {
  it('truncates long labels', () => {
    expect(truncateLabel('abcdefghijklmnopqrstuvwxyz', 10)).toBe('abcdefg...')
  })

  it('shows picker for slash command prefixes', () => {
    expect(shouldShowCommandPicker('/', COMMANDS)).toBe(true)
    expect(shouldShowCommandPicker('/he', COMMANDS)).toBe(true)
    expect(shouldShowCommandPicker('/H', COMMANDS)).toBe(true)
    expect(shouldShowCommandPicker('/Help', COMMANDS)).toBe(true)
  })

  it('hides the picker once slash command arguments start', () => {
    expect(shouldShowCommandPicker('/model ', COMMANDS)).toBe(false)
    expect(shouldShowCommandPicker('/model claude-sonnet', COMMANDS)).toBe(false)
  })

  it('does not show picker for absolute paths', () => {
    expect(shouldShowCommandPicker('/Users/mauricewen/project', COMMANDS)).toBe(false)
    expect(shouldShowCommandPicker('/Users/mauricewen/project read docs', COMMANDS)).toBe(false)
  })

  it('uses the first token as picker filter', () => {
    expect(getCommandPickerFilter('/help')).toBe('help')
    expect(getCommandPickerFilter('/model claude-sonnet')).toBe('model')
    expect(getCommandPickerFilter('/Users/mauricewen/project')).toBe('Users/mauricewen/project')
    expect(getCommandPickerFilter('plain text')).toBe('')
  })

  it('detects persisted theme preference from ~/.armature/theme', async () => {
    delete process.env.ARMATURE_THEME
    const home = mkdtempSync(join(tmpdir(), 'armature-theme-'))
    process.env.HOME = home
    delete process.env.USERPROFILE
    mkdirSync(join(home, '.armature'), { recursive: true })
    writeFileSync(join(home, '.armature', 'theme'), 'default', 'utf-8')

    vi.resetModules()
    const { hasConfiguredThemePreference } = await import('../src/ui/theme.js')

    expect(hasConfiguredThemePreference()).toBe(true)
  })
})
