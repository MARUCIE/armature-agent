import { appendFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { OrcaConfig } from '../config.js'
import type { ChatMessage } from '../providers/openai-compat.js'
import { writeSavedSession } from '../session-store.js'

export interface ChatOptionsLike {
  model?: string
  provider?: string
  apiKey?: string
  maxTurns?: string
  systemPrompt?: string
  safe?: boolean
}

export interface SessionStatsLike {
  turns: number
  totalInputTokens: number
  totalOutputTokens: number
}

export function buildChatFlags(opts: ChatOptionsLike): Partial<OrcaConfig> {
  const flags: Partial<OrcaConfig> = {}
  if (opts.model) flags.model = opts.model
  if (opts.provider) flags.provider = opts.provider as OrcaConfig['provider']
  if (opts.apiKey) flags.apiKey = opts.apiKey
  if (opts.maxTurns) flags.maxTurns = parseInt(opts.maxTurns, 10)
  if (opts.systemPrompt) flags.systemPrompt = opts.systemPrompt
  if (opts.safe) flags.permissionMode = 'default'
  return flags
}

export function detectConfigFiles(cwd: string): string[] {
  const found: string[] = []
  const candidates = [
    '.orca.json',
    'CLAUDE.md',
    '.claude/settings.json',
    'AGENTS.md',
    '.codex/config.toml',
    'package.json',
  ]
  for (const name of candidates) {
    if (existsSync(join(cwd, name))) {
      found.push(name)
    }
  }
  return found
}

export function saveInputHistory(historyFile: string, entries: string[]): void {
  if (entries.length === 0) return
  try {
    mkdirSync(dirname(historyFile), { recursive: true })
    appendFileSync(historyFile, entries.join('\n') + '\n', 'utf-8')
  } catch {
    // ignore write errors
  }
}

export function autoSaveSession(provider: string, model: string, history: ChatMessage[], stats: SessionStatsLike, modeId?: string): void {
  try {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    writeSavedSession(`auto-${ts}`, {
      provider,
      model,
      modeId,
      history,
      stats: {
        turns: stats.turns,
        inputTokens: stats.totalInputTokens,
        outputTokens: stats.totalOutputTokens,
      },
      savedAt: new Date().toISOString(),
    })
    console.log(`\x1b[90m  session auto-saved: auto-${ts}\x1b[0m`)
  } catch {
    // ignore
  }
}
