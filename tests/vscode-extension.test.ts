import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const extRoot = join(process.cwd(), 'integrations', 'vscode-armature')
const helpers = require('../integrations/vscode-armature/terminal-options.cjs')

describe('VS Code extension skeleton', () => {
  it('builds terminal options for armature commands', () => {
    const options = helpers.buildArmatureTerminalOptions('Armature Chat', ['chat'], '/tmp/project')
    expect(options.name).toBe('Armature Chat')
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
    expect(commandIds).toContain('armature.chat')
    expect(commandIds).toContain('armature.chatCurrentFile')
    expect(commandIds).toContain('armature.chatSelection')
    expect(commandIds).toContain('armature.startMcpServer')
    expect(commandIds).toContain('armature.doctor')
  })
})
