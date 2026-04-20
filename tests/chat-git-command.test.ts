import { describe, expect, it } from 'vitest'
import { buildSafeGitSlashArgs, tokenizeCommandLine } from '../src/commands/chat-input.js'

describe('chat /git parsing helpers', () => {
  it('tokenizes quoted arguments without shell splitting', () => {
    expect(tokenizeCommandLine(`log --oneline -- path/'file name.ts'`)).toEqual([
      'log',
      '--oneline',
      '--',
      'path/file name.ts',
    ])
  })

  it('allows read-only git slash commands', () => {
    expect(buildSafeGitSlashArgs('status --short')).toEqual(['status', '--short'])
    expect(buildSafeGitSlashArgs(`log --oneline -5`)).toEqual(['log', '--oneline', '-5'])
  })

  it('rejects mutating git slash commands', () => {
    expect(() => buildSafeGitSlashArgs('checkout -b dangerous')).toThrow('Unsupported /git subcommand')
    expect(() => buildSafeGitSlashArgs('commit -m nope')).toThrow('Unsupported /git subcommand')
  })
})
