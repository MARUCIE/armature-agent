import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const extRoot = join(process.cwd(), 'integrations', 'vscode-orca')
const helpers = require('../integrations/vscode-orca/terminal-options.cjs')

describe('VS Code extension skeleton', () => {
  it('builds terminal options for orca commands', () => {
    const options = helpers.buildOrcaTerminalOptions('Orca Chat', ['chat'], '/tmp/project')
    expect(options.name).toBe('Orca Chat')
    expect(options.shellArgs).toEqual(['chat'])
    expect(options.cwd).toBe('/tmp/project')
    expect(typeof options.shellPath).toBe('string')
  })

  it('normalizes and truncates long selections', () => {
    const text = 'x'.repeat(12050)
    const normalized = helpers.normalizeSelection(text, 12000)
    expect(normalized.length).toBeGreaterThan(12000)
    expect(normalized).toContain('[selection truncated at 12000 chars]')
  })

  it('declares expected command contributions', () => {
    const manifest = JSON.parse(readFileSync(join(extRoot, 'package.json'), 'utf-8'))
    const commandIds = manifest.contributes.commands.map((cmd) => cmd.command)
    expect(commandIds).toContain('orca.chat')
    expect(commandIds).toContain('orca.chatCurrentFile')
    expect(commandIds).toContain('orca.chatSelection')
    expect(commandIds).toContain('orca.startMcpServer')
    expect(commandIds).toContain('orca.doctor')
  })
})
