import { describe, expect, it } from 'vitest'
import { buildSafeGitSlashArgs, tokenizeCommandLine } from '../src/commands/chat-input.js'

describe('chat /git parsing helpers', () => {
  it('rejects empty /git commands', () => {
    expect(() => buildSafeGitSlashArgs('')).toThrow('No git command provided')
  })

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
    expect(buildSafeGitSlashArgs('branch')).toEqual(['branch'])
    expect(buildSafeGitSlashArgs('branch --list release/*')).toEqual(['branch', '--list', 'release/*'])
  })

  it('rejects unterminated quotes in /git commands', () => {
    expect(() => tokenizeCommandLine(`log --oneline "unterminated`)).toThrow('Unterminated quote in /git command')
  })

  it('rejects mutating git slash commands', () => {
    expect(() => buildSafeGitSlashArgs('checkout -b dangerous')).toThrow('Unsupported /git subcommand')
    expect(() => buildSafeGitSlashArgs('commit -m nope')).toThrow('Unsupported /git subcommand')
    expect(() => buildSafeGitSlashArgs('branch new-branch')).toThrow('Unsafe /git branch argument')
  })

  it('rejects write-capable or path-escaping git flags', () => {
    expect(() => buildSafeGitSlashArgs('diff -o owned.patch HEAD')).toThrow('Unsafe /git argument')
    expect(() => buildSafeGitSlashArgs('diff --output=owned.patch HEAD')).toThrow('Unsafe /git argument')
    expect(() => buildSafeGitSlashArgs('diff --output owned.patch HEAD')).toThrow('Unsafe /git argument')
    expect(() => buildSafeGitSlashArgs('diff --no-index /tmp/a /tmp/b')).toThrow('Unsafe /git argument')
    expect(() => buildSafeGitSlashArgs('diff --ext-diff')).toThrow('Unsafe /git argument')
  })
})
