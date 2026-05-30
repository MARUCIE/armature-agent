import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import type { ArmatureConfig } from '../config.js'
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

export function buildAutoSessionId(now: Date = new Date()): string {
  return `auto-${now.toISOString().replace(/[:.]/g, '-').slice(0, 19)}`
}

export function buildChatFlags(opts: ChatOptionsLike): Partial<ArmatureConfig> {
  const flags: Partial<ArmatureConfig> = {}
  if (opts.model) flags.model = opts.model
  if (opts.provider) flags.provider = opts.provider as ArmatureConfig['provider']
  if (opts.apiKey) flags.apiKey = opts.apiKey
  if (opts.maxTurns) flags.maxTurns = parseInt(opts.maxTurns, 10)
  if (opts.systemPrompt) flags.systemPrompt = opts.systemPrompt
  if (opts.safe) flags.permissionMode = 'default'
  return flags
}

export function detectConfigFiles(cwd: string): string[] {
  const found: string[] = []
  const candidates = [
    '.armature.json',
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

const PROJECT_MARKERS = [
  '.git',
  '.armature.json',
  'AGENTS.md',
  'CLAUDE.md',
  'CODEX.md',
  'package.json',
  'pyproject.toml',
  'go.mod',
  'Cargo.toml',
]

function getArmatureHome(): string {
  return join(process.env.HOME || homedir(), '.armature')
}

function getLastWorkspacePath(): string {
  return join(getArmatureHome(), 'last-cwd')
}

function hasWorkspaceMarkers(path: string): boolean {
  return PROJECT_MARKERS.some((marker) => existsSync(join(path, marker)))
}

function readableDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

function readLastWorkspaceCwd(): string | undefined {
  try {
    const value = readFileSync(getLastWorkspacePath(), 'utf-8').trim()
    if (value && readableDirectory(value)) return resolve(value)
  } catch {
    // ignore missing or unreadable state
  }
  return undefined
}

export function rememberWorkspaceCwd(cwd: string): void {
  const resolved = resolve(cwd)
  if (!readableDirectory(resolved) || !hasWorkspaceMarkers(resolved)) return
  try {
    mkdirSync(getArmatureHome(), { recursive: true })
    writeFileSync(getLastWorkspacePath(), resolved + '\n', 'utf-8')
  } catch {
    // ignore state write failures
  }
}

export function resolveWorkspaceCwd(input?: string): string {
  const explicit = input || process.env.ARMATURE_CWD || process.env.ARMATURE_PROJECT_DIR
  if (explicit) return resolve(explicit)

  const current = resolve(process.cwd())
  if (!hasWorkspaceMarkers(current)) {
    return readLastWorkspaceCwd() || current
  }
  return current
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

export function autoSaveSession(sessionId: string, provider: string, model: string, history: ChatMessage[], stats: SessionStatsLike, modeId?: string): void {
  try {
    writeSavedSession(sessionId, {
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
    console.log(`\x1b[90m  session auto-saved: ${sessionId}\x1b[0m`)
  } catch {
    // ignore
  }
}
