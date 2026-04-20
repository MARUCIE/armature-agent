import type { ChatMessage } from '../providers/openai-compat.js'

export interface PendingContinueRestore {
  name: string
  history: ChatMessage[]
  stats: {
    turns: number
    totalInputTokens: number
    totalOutputTokens: number
    startTime: number
    turnTokens: number[]
  }
  restoredModeId?: string
  restoredSelection?: {
    provider?: string
    model: string
  }
}

interface SavedSessionLike {
  name: string
  session?: {
    history?: unknown
    stats?: {
      turns?: number
      inputTokens?: number
      outputTokens?: number
    }
    modeId?: unknown
    provider?: unknown
    model?: unknown
  }
}

function isValidContentPart(part: unknown): boolean {
  if (!part || typeof part !== 'object') return false
  const candidate = part as { type?: unknown; text?: unknown; image_url?: { url?: unknown } }
  if (candidate.type === 'text') {
    return typeof candidate.text === 'string'
  }
  if (candidate.type === 'image_url') {
    return Boolean(candidate.image_url && typeof candidate.image_url.url === 'string')
  }
  return false
}

function isValidStoredMessage(message: unknown): message is ChatMessage {
  if (!message || typeof message !== 'object') return false
  const candidate = message as { role?: unknown; content?: unknown }
  if (candidate.role !== 'system' && candidate.role !== 'user' && candidate.role !== 'assistant') {
    return false
  }
  if (typeof candidate.content === 'string') return true
  if (!Array.isArray(candidate.content)) return false
  return candidate.content.every((part) => isValidContentPart(part))
}

function sanitizeNumericStat(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return Math.max(0, Math.floor(value))
}

export function buildPendingContinueRestore(
  saved: SavedSessionLike | null | undefined,
  now: number = Date.now(),
): { restore?: PendingContinueRestore; warning?: string } {
  if (!saved) return {}
  if (!saved.session || typeof saved.session !== 'object') {
    return { warning: 'saved session invalid: missing session payload — starting fresh.' }
  }
  if (!Array.isArray(saved.session.history)) {
    return { warning: 'saved session invalid: missing history — starting fresh.' }
  }
  if (saved.session.history.length === 0) {
    return { warning: 'saved session invalid: empty history — starting fresh.' }
  }
  if (!saved.session.history.every((message) => isValidStoredMessage(message))) {
    return { warning: 'saved session invalid: malformed history entry — starting fresh.' }
  }
  if ((saved.session.history[0] as ChatMessage).role !== 'system') {
    return { warning: 'saved session invalid: missing system prompt — starting fresh.' }
  }

  return {
    restore: {
      name: saved.name,
      history: saved.session.history.map((message) => ({
        role: (message as ChatMessage).role as 'system' | 'user' | 'assistant',
        content: (message as ChatMessage).content,
      })),
      stats: {
        turns: sanitizeNumericStat(saved.session.stats?.turns),
        totalInputTokens: sanitizeNumericStat(saved.session.stats?.inputTokens),
        totalOutputTokens: sanitizeNumericStat(saved.session.stats?.outputTokens),
        startTime: now,
        turnTokens: [],
      },
      restoredModeId: typeof saved.session.modeId === 'string' ? saved.session.modeId : undefined,
      restoredSelection: typeof saved.session.model === 'string'
        ? {
            provider: typeof saved.session.provider === 'string' ? saved.session.provider : undefined,
            model: saved.session.model,
          }
        : undefined,
    },
  }
}

export function getForcedModeRestoreWarning(
  forcedModeId: string | undefined,
  restoredModeId: string | undefined,
): string | undefined {
  if (!forcedModeId) return undefined
  const normalizedRestoredModeId = restoredModeId || 'default'
  if (normalizedRestoredModeId === forcedModeId) return undefined
  return `saved session mode ${normalizedRestoredModeId} does not match forced mode ${forcedModeId} — starting fresh.`
}
