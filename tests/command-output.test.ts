import { describe, expect, it, vi } from 'vitest'
import {
  createCommandConsole,
  escapeMarkdownInline,
  escapeMarkdownTableCell,
  emitCommandMessage,
  formatMarkdownCodeBlock,
  formatMarkdownCodeSpan,
  stripAnsi,
} from '../src/ui/command-output.js'
import { ChatSessionEmitter } from '../src/ui/session.js'

describe('command output sanitization', () => {
  it('removes ANSI, OSC, and control characters from terminal output', () => {
    const payload = '\u001b[31mred\u001b[0m \u001b]52;c;Y29waWVk\u0007value\r\nnext\u0007'
    expect(stripAnsi(payload)).toBe('red value\nnext')
  })

  it('removes C1 control bytes from terminal output', () => {
    expect(stripAnsi('safe\u009bunsafe\u009dtrail')).toBe('safeunsafetrail')
  })

  it('preserves warn and error levels when bridging console output', () => {
    const output = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }
    const commandConsole = createCommandConsole(output)

    commandConsole.log('\u001b[33m  caution: check config\u001b[0m')
    commandConsole.log('\u001b[31m  failed to connect\u001b[0m')

    expect(output.warn).toHaveBeenCalledWith('caution: check config')
    expect(output.error).toHaveBeenCalledWith('failed to connect')
    expect(output.info).not.toHaveBeenCalled()
  })

  it('joins multiple console arguments before routing severity-aware output', () => {
    const output = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }
    const commandConsole = createCommandConsole(output)

    commandConsole.log('\u001b[33m  caution:', 'check', 'config')

    expect(output.warn).toHaveBeenCalledWith('caution: check config')
    expect(output.info).not.toHaveBeenCalled()
    expect(output.error).not.toHaveBeenCalled()
  })


  it('does not let inline ANSI in user text spoof severity', () => {
    const output = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }
    const commandConsole = createCommandConsole(output)

    commandConsole.log('\u001b[90m  enabled: demo\u001b[31mspoof\u001b[0m')

    expect(output.info).toHaveBeenCalledWith('enabled: demospoof')
    expect(output.warn).not.toHaveBeenCalled()
    expect(output.error).not.toHaveBeenCalled()
  })

  it('routes console.error through the error channel after sanitization', () => {
    const output = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }
    const commandConsole = createCommandConsole(output)

    commandConsole.error('\u001b[31m  failed\u001b[0m', '\u001b]52;c;Y29waWVk\u0007detail')

    expect(output.error).toHaveBeenCalledWith('failed detail')
    expect(output.info).not.toHaveBeenCalled()
    expect(output.warn).not.toHaveBeenCalled()
  })

  it('ignores ansi-only console payloads', () => {
    const output = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }
    const commandConsole = createCommandConsole(output)

    commandConsole.log('\u001b[90m\u001b[0m')

    expect(output.info).not.toHaveBeenCalled()
    expect(output.warn).not.toHaveBeenCalled()
    expect(output.error).not.toHaveBeenCalled()
  })

  it('preserves indentation inside multiline ANSI-wrapped output', () => {
    const output = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }
    const commandConsole = createCommandConsole(output)

    commandConsole.log('\u001b[90m  diff --git a/file b/file\n  context line\n    nested detail\u001b[0m')

    expect(output.info).toHaveBeenCalledWith('diff --git a/file b/file\n  context line\n    nested detail')
  })

  it('escapes markdown inline and table helper output safely', () => {
    expect(escapeMarkdownInline('\u001b[31mvalue|tick`line\nnext\u001b[0m')).toBe('value\\|tick\\`line<br/>next')
    expect(escapeMarkdownTableCell('cell|line\nnext')).toBe('cell\\|line<br/>next')
  })

  it('wraps markdown code blocks with a safe fence length', () => {
    const block = formatMarkdownCodeBlock('header\n```diff\ncontent', 'diff')
    expect(block.startsWith('````diff\n')).toBe(true)
    expect(block).toContain('```diff\ncontent')
    expect(block.endsWith('\n````\n')).toBe(true)
  })

  it('strips terminal control sequences before wrapping markdown code blocks', () => {
    const block = formatMarkdownCodeBlock('\u001b]52;c;Y29waWVk\u0007header\n\u001b[31m```diff\ncontent\u001b[0m', 'diff')
    expect(block.startsWith('````diff\n')).toBe(true)
    expect(block).not.toContain('\u001b')
    expect(block).not.toContain('Y29waWVk')
    expect(block).toContain('```diff\ncontent')
  })

  it('wraps markdown code spans with a safe fence length', () => {
    expect(formatMarkdownCodeSpan('path with `tick`')).toBe('``path with `tick```')
  })

  it('prefixes each legacy output line with the standard gutter', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    emitCommandMessage(undefined, 'input: 10\noutput: 20', 'info')

    expect(logSpy).toHaveBeenCalledWith('\x1b[90m  input: 10\n  output: 20\x1b[0m')
  })

  it('strips terminal control sequences before emitting ink system messages', () => {
    const session = new ChatSessionEmitter()
    const messages: Array<{ text: string; level: string }> = []
    session.on('system_message', (event) => { messages.push({ text: event.text, level: event.level }) })

    emitCommandMessage(session, '\u001b[33m  caution\u001b[0m \u001b]52;c;Y29waWVk\u0007detail', 'warn')

    expect(messages).toEqual([{ text: '  caution detail', level: 'warn' }])
  })
})
