import type { ChatSessionEmitter } from './session.js'

const ANSI_PATTERN = /\x1B\[[0-?]*[ -/]*[@-~]/g
const OSC_PATTERN = /\x1B\][\s\S]*?(?:\x07|\x1B\\)/g
const DCS_PATTERN = /\x1BP[\s\S]*?\x1B\\/g
const APC_PATTERN = /\x1B(?:_|\^|X)[\s\S]*?\x1B\\/g
const ESC_PATTERN = /\x1B[@-_]/g
const CONTROL_PATTERN = /[\u0000-\u0008\u000B-\u001F\u007F]/g
const C1_CONTROL_PATTERN = /[\u0080-\u009F]/g

export function stripAnsi(text: string): string {
  return text
    .replace(OSC_PATTERN, '')
    .replace(DCS_PATTERN, '')
    .replace(APC_PATTERN, '')
    .replace(ANSI_PATTERN, '')
    .replace(ESC_PATTERN, '')
    .replace(CONTROL_PATTERN, '')
    .replace(C1_CONTROL_PATTERN, '')
}

function normalizeConsoleText(args: unknown[]): string {
  const rawText = args.map((arg) => String(arg)).join(' ')
  return rawText
    .split('\n')
    .map((line) => {
      const cleanLine = stripAnsi(line)
      if (!line.startsWith('\x1b')) return cleanLine
      return cleanLine.replace(/^ {2}/, '')
    })
    .join('\n')
}

function inferConsoleLevel(args: unknown[]): 'info' | 'warn' | 'error' {
  const rawText = args.map((arg) => String(arg)).join(' ')
  const prefix = (rawText.match(/^(?:\s|\x1B\[[0-9;]*m)*/) ?? [''])[0]
  let level: 'info' | 'warn' | 'error' = 'info'

  for (const match of prefix.matchAll(/\x1B\[([0-9;]*)m/g)) {
    const codes = (match[1] || '0').split(';').map((code) => Number.parseInt(code, 10))
    if (codes.includes(31)) return 'error'
    if (codes.includes(33)) level = 'warn'
  }

  return level
}

export function escapeMarkdownInline(text: string): string {
  return stripAnsi(text)
    .replace(/\\/g, '\\\\')
    .replace(/([`*_{}\[\]()#+\-.!|>])/g, '\\$1')
    .replace(/\r?\n/g, '<br/>')
}

export function escapeMarkdownTableCell(text: string): string {
  return stripAnsi(text)
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, '<br/>')
}

export function formatMarkdownCodeSpan(text: string): string {
  const cleanText = stripAnsi(text).replace(/\r?\n/g, ' ')
  const maxFenceLength = Math.max(1, ...(cleanText.match(/`+/g) ?? []).map((run) => run.length + 1))
  const fence = '`'.repeat(maxFenceLength)
  return `${fence}${cleanText}${fence}`
}

export function formatMarkdownCodeBlock(text: string, language = ''): string {
  const cleanText = stripAnsi(text)
  const maxFenceLength = Math.max(3, ...(cleanText.match(/`+/g) ?? []).map((run) => run.length + 1))
  const fence = '`'.repeat(maxFenceLength)
  const header = language ? `${fence}${language}` : fence
  return `${header}\n${cleanText}\n${fence}\n`
}

export function emitCommandMessage(
  session: ChatSessionEmitter | undefined,
  text: string,
  level: 'info' | 'warn' | 'error' = 'info',
): void {
  const cleanText = stripAnsi(text)
  if (!cleanText) return
  if (session) {
    session.emitSystemMessage(cleanText, level)
    return
  }

  const color = level === 'error' ? '\x1b[31m' : level === 'warn' ? '\x1b[33m' : '\x1b[90m'
  const legacyText = cleanText.replace(/^/gm, '  ')
  console.log(`${color}${legacyText}\x1b[0m`)
}

export interface CommandOutput {
  info: (text: string) => void
  warn: (text: string) => void
  error: (text: string) => void
}

export function createCommandOutput(session?: ChatSessionEmitter): CommandOutput {
  return {
    info: (text: string) => emitCommandMessage(session, text, 'info'),
    warn: (text: string) => emitCommandMessage(session, text, 'warn'),
    error: (text: string) => emitCommandMessage(session, text, 'error'),
  }
}

export function createCommandConsole(output: CommandOutput): Pick<Console, 'log' | 'error'> {
  return {
    log: (...args: unknown[]) => {
      const text = normalizeConsoleText(args)
      if (!text) return
      const level = inferConsoleLevel(args)
      output[level](text)
    },
    error: (...args: unknown[]) => {
      const text = normalizeConsoleText(args)
      if (text) output.error(text)
    },
  }
}
