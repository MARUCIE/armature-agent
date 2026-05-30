import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildSlashCommandPickerItems } from '../src/slash-picker-items.js'

describe('slash command picker items', () => {
  it('includes discovered project skills and custom agents as selectable entries', () => {
    const previousHome = process.env.HOME
    const cwd = mkdtempSync(join(tmpdir(), 'armature-picker-capabilities-'))
    mkdirSync(join(cwd, '.armature', 'skills', 'local-skill'), { recursive: true })
    mkdirSync(join(cwd, '.claude', 'agents'), { recursive: true })
    writeFileSync(join(cwd, '.armature', 'skills', 'local-skill', 'SKILL.md'), '# local-skill\nLocal project workflow.\n', 'utf-8')
    writeFileSync(join(cwd, '.claude', 'agents', 'reviewer.md'), [
      '---',
      'description: Review changed code for regressions',
      '---',
      '# Reviewer',
    ].join('\n'), 'utf-8')
    writeFileSync(join(cwd, '.mcp.json'), JSON.stringify({
      docs: { command: 'node', args: ['mcp-docs.js'] },
    }), 'utf-8')
    process.env.HOME = cwd

    try {
      const items = buildSlashCommandPickerItems(cwd)
      expect(items).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: '/skills local-skill', description: expect.stringContaining('Local project workflow') }),
        expect.objectContaining({ name: '/agents reviewer', description: expect.stringContaining('Review changed code') }),
        expect.objectContaining({ name: '/mcp docs', description: expect.stringContaining('MCP server (project) node') }),
      ]))
    } finally {
      if (previousHome === undefined) delete process.env.HOME
      else process.env.HOME = previousHome
      rmSync(cwd, { recursive: true, force: true })
    }
  })
})
