/**
 * Token Budget Manager.
 *
 * Tracks real token usage from API responses and manages context
 * window capacity. When context approaches limits, performs smart
 * compaction that preserves decision-bearing messages over filler.
 *
 * Key insight: naive compaction drops oldest messages, but tool_result
 * messages contain decisions and verified state. Smart compaction
 * preserves these while dropping verbose explanatory text.
 */

import { messageContentToText, type ChatMessage, type PromptContent } from './providers/openai-compat.js'

// ── Types ────────────────────────────────────────────────────────

export interface TokenBudget {
  /** Model's total context window size in tokens */
  contextWindow: number
  /** Maximum output tokens for this model */
  maxOutput: number
  /** Current input token usage (from API responses) */
  inputTokensUsed: number
  /** Current output token usage (from API responses) */
  outputTokensUsed: number
  /** Estimated tokens from conversation history */
  historyTokensEst: number
  /** Current utilization as percentage (0-100) */
  utilizationPct: number
  /** Risk level based on utilization */
  risk: 'green' | 'yellow' | 'orange' | 'red'
}

export interface CompactionResult {
  /** Number of messages dropped */
  dropped: number
  /** Number of messages kept */
  kept: number
  /** Estimated tokens freed */
  tokensFreed: number
  /** Summary of what was dropped */
  summary: string
}

function truncateContent(content: PromptContent, maxChars: number, suffix: string): PromptContent {
  if (typeof content === 'string') {
    return content.length > maxChars ? content.slice(0, maxChars) + suffix : content
  }

  let remaining = maxChars
  let truncated = false
  let markerAdded = false
  const next: Exclude<PromptContent, string> = []

  for (const part of content) {
    if (part.type === 'image_url') {
      if (part.image_url.url.startsWith('data:')) {
        const mime = part.image_url.url.match(/^data:([^;]+)/)?.[1] || 'image'
        next.push({ type: 'text', text: `[inline image omitted during compaction: ${mime}]` })
        truncated = true
        markerAdded = true
      } else {
        next.push({ type: 'image_url', image_url: { url: part.image_url.url } })
      }
      continue
    }

    if (remaining <= 0) {
      truncated = true
      continue
    }

    if (part.text.length <= remaining) {
      next.push({ type: 'text', text: part.text })
      remaining -= part.text.length
      continue
    }

    next.push({ type: 'text', text: part.text.slice(0, remaining) + suffix })
    remaining = 0
    truncated = true
    markerAdded = true
  }

  if (truncated && !markerAdded) {
    next.push({ type: 'text', text: suffix.trimStart() })
  }

  return next
}

function hasInlineDataImage(content: PromptContent): boolean {
  return Array.isArray(content) && content.some(
    (part) => part.type === 'image_url' && part.image_url.url.startsWith('data:')
  )
}

function estimateImageTokens(url: string): number {
  if (url.startsWith('data:')) {
    return Math.ceil(url.length / 4)
  }
  return estimateTokens(`[image:${url.slice(0, 48)}]`)
}

export function estimatePromptContentTokens(content: PromptContent): number {
  if (typeof content === 'string') return estimateTokens(content)
  return content.reduce((sum, part) => (
    sum + (part.type === 'text' ? estimateTokens(part.text) : estimateImageTokens(part.image_url.url))
  ), 0)
}

function estimateHistoryTokens(history: ChatMessage[]): number {
  return history.reduce((sum, m) => sum + estimatePromptContentTokens(m.content), 0)
}

// ── Model Context Windows ───────────────────────────────────────

const MODEL_CONTEXT: Array<[string, number]> = [
  ['claude-opus-4', 200_000],
  ['claude-sonnet-4', 200_000],
  ['gpt-5', 256_000],
  ['gemini-3', 2_000_000],
  ['gemma-4', 128_000],
  ['glm-5', 128_000],
  ['grok-4', 256_000],
  ['qwen3', 128_000],
  ['kimi-k2', 256_000],
  ['minimax-m2', 128_000],
]

function getContextWindow(model: string): number {
  const lower = model.toLowerCase()
  for (const [prefix, window] of MODEL_CONTEXT) {
    if (lower.includes(prefix)) return window
  }
  return 128_000 // safe default
}

// ── CJK-Aware Token Estimation ─────────────────────────────────

/**
 * Count CJK characters in text.
 * CJK chars tokenize at ~1.5 chars/token vs ~4 chars/token for Latin.
 */
function countCJK(text: string): number {
  let count = 0
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if ((code >= 0x4E00 && code <= 0x9FFF) ||  // CJK Unified Ideographs
        (code >= 0x3400 && code <= 0x4DBF) ||  // CJK Extension A
        (code >= 0xFF00 && code <= 0xFFEF) ||  // Fullwidth Forms
        (code >= 0x3000 && code <= 0x303F)) {  // CJK Symbols
      count++
    }
  }
  return count
}

/**
 * Estimate tokens from text with CJK awareness.
 * Latin: ~4 chars/token, CJK: ~1.5 chars/token.
 */
export function estimateTokens(text: string): number {
  const cjk = countCJK(text)
  const latin = text.length - cjk
  return Math.ceil(cjk / 1.5 + latin / 4)
}

// ── Token Budget Manager ────────────────────────────────────────

export class TokenBudgetManager {
  private model: string
  private cumulativeInput = 0
  private cumulativeOutput = 0
  private lastInputTokens = 0

  constructor(model: string) {
    this.model = model
  }

  /** Update token counts from API response usage data */
  recordUsage(inputTokens: number, outputTokens: number): void {
    this.lastInputTokens = inputTokens // latest turn = current context fill
    this.cumulativeInput += inputTokens
    this.cumulativeOutput += outputTokens
  }

  /** Clear the last authoritative prompt-size reading after history compaction */
  clearCurrentUsage(): void {
    this.lastInputTokens = 0
  }

  /** Update model when the active session model changes */
  setModel(model: string): void {
    this.model = model
  }

  /** Get current budget status */
  getBudget(history: ChatMessage[]): TokenBudget {
    const contextWindow = getContextWindow(this.model)
    const maxOutput = Math.min(contextWindow / 4, 64_000)

    // Prefer API-reported inputTokens (exact), fall back to CJK-aware estimate
    // CRITICAL: fallback MUST cap at contextWindow — conversation history includes
    // tool results with full file contents, so raw chars/4 can be 10-50x the window
    const historyTokensEst = this.lastInputTokens > 0
      ? this.lastInputTokens
      : Math.min(
          estimateHistoryTokens(history),
          contextWindow,
        )

    // Context utilization = current context fill / window
    const totalUsed = historyTokensEst
    const utilizationPct = Math.round((totalUsed / contextWindow) * 100)

    let risk: TokenBudget['risk']
    if (utilizationPct < 40) risk = 'green'
    else if (utilizationPct < 50) risk = 'yellow'
    else if (utilizationPct < 60) risk = 'orange'
    else risk = 'red'

    return {
      contextWindow,
      maxOutput,
      inputTokensUsed: this.cumulativeInput,
      outputTokensUsed: this.cumulativeOutput,
      historyTokensEst,
      utilizationPct,
      risk,
    }
  }

  /** Get total tokens used across all API calls */
  get totalTokens(): number {
    return this.cumulativeInput + this.cumulativeOutput
  }

  /** Reset all counters (after /clear) */
  reset(): void {
    this.lastInputTokens = 0
    this.cumulativeInput = 0
    this.cumulativeOutput = 0
  }

  /**
   * Smart compaction: aggressively free context while preserving recent state.
   *
   * Strategy:
   *   1. System messages: always kept (but truncated if huge)
   *   2. Last N turns: kept in full (recent working context)
   *   3. Older messages: dropped entirely (not kept as decisions)
   *   4. Large messages: truncated to first 200 chars with [truncated] marker
   *
   * Previous version was too conservative (200-char decision threshold kept almost
   * everything). This version aggressively drops older messages and truncates large ones.
   *
   * @param history - Mutable conversation history
   * @param keepTurns - Number of recent user/assistant turns to keep
   * @returns Summary of what was compacted
   */
  smartCompact(history: ChatMessage[], keepTurns = 2): CompactionResult {
    const contextWindow = getContextWindow(this.model)
    const totalTokens = estimateHistoryTokens(history)
    const estimatedPct = Math.round((totalTokens / contextWindow) * 100)

    // ── NUCLEAR MODE: >100% utilization — emergency purge ──────────
    // Keep ONLY the system prompt (truncated) + last user message.
    // This is the only way to recover from massive context overflow.
    if (estimatedPct > 100 || this.lastInputTokens > contextWindow * 0.9) {
      const sysMsg = history.find(m => m.role === 'system')
      const lastUser = [...history].reverse().find(m => m.role === 'user')
      const droppedCount = history.length - (sysMsg ? 1 : 0) - (lastUser ? 1 : 0)

      // Truncate system prompt aggressively (keep first 1500 chars)
      if (sysMsg && messageContentToText(sysMsg.content).length > 1500) {
        sysMsg.content = truncateContent(sysMsg.content, 1500, '\n[system truncated for recovery]')
      }

      // Truncate last user message if huge
      if (lastUser && (messageContentToText(lastUser.content).length > 1000 || hasInlineDataImage(lastUser.content))) {
        lastUser.content = truncateContent(lastUser.content, 1000, '\n[truncated]')
      }

      history.length = 0
      if (sysMsg) history.push(sysMsg)
      if (lastUser) history.push(lastUser)

      const tokensFreed = Math.max(0, totalTokens - estimateHistoryTokens(history))
      return {
        dropped: droppedCount,
        kept: history.length,
        tokensFreed,
        summary: `NUCLEAR: dropped ${droppedCount} msgs, freed ~${tokensFreed} tokens. Kept system + last user msg.`,
      }
    }

    // ── NORMAL COMPACT ─────────────────────────────────────────────
    const sysMsg = history.find(m => m.role === 'system')
    const convMsgs = history.filter(m => m.role !== 'system')

    // Force truncation on ALL messages if few messages but large content
    if (convMsgs.length <= keepTurns * 2) {
      let truncated = 0
      let freedTokens = 0
      for (const msg of history) {
        const text = messageContentToText(msg.content)
        if (msg.role === 'system' && text.length > 3000) {
          freedTokens += Math.max(
            0,
            estimatePromptContentTokens(msg.content) - estimatePromptContentTokens(truncateContent(msg.content, 2000, '\n[system truncated]'))
          )
          msg.content = truncateContent(msg.content, 2000, '\n[system truncated]')
          truncated++
        } else if ((text.length > 1000 || hasInlineDataImage(msg.content)) && msg.role !== 'system') {
          const originalTokens = estimatePromptContentTokens(msg.content)
          const truncatedContent = truncateContent(msg.content, 200, '\n[truncated: ' + originalTokens + ' tokens]')
          freedTokens += Math.max(0, originalTokens - estimatePromptContentTokens(truncatedContent))
          msg.content = truncatedContent
          truncated++
        }
      }
      if (truncated > 0) {
        return { dropped: 0, kept: history.length, tokensFreed: freedTokens, summary: `Truncated ${truncated} large messages, freed ~${freedTokens} tokens.` }
      }
      return { dropped: 0, kept: history.length, tokensFreed: 0, summary: 'Nothing to compact.' }
    }

    const recentMsgs = convMsgs.slice(-keepTurns * 2)
    const olderMsgs = convMsgs.slice(0, -keepTurns * 2)

    // Drop ALL older messages
    const droppedMsgs = [...olderMsgs]
    const keptDecisions: ChatMessage[] = []

    // Among older messages, only keep genuinely tiny summaries (<100 chars, max 3)
    for (let i = olderMsgs.length - 1; i >= 0; i--) {
      const msg = olderMsgs[i]!
      if (!hasInlineDataImage(msg.content) && estimatePromptContentTokens(msg.content) < 100 && keptDecisions.length < 3) {
        keptDecisions.push(msg)
        const idx = droppedMsgs.indexOf(msg)
        if (idx >= 0) droppedMsgs.splice(idx, 1)
      }
    }

    const tokensFreed = droppedMsgs.reduce((sum, m) => sum + estimatePromptContentTokens(m.content), 0)

    const droppedRoles = droppedMsgs.reduce((acc, m) => {
      acc[m.role] = (acc[m.role] || 0) + 1
      return acc
    }, {} as Record<string, number>)
    const summaryParts = Object.entries(droppedRoles).map(([role, count]) => `${count} ${role}`)

    // Truncate large recent messages
    for (const msg of recentMsgs) {
      const text = messageContentToText(msg.content)
      if (text.length > 2000 || hasInlineDataImage(msg.content)) {
        msg.content = truncateContent(msg.content, 500, '\n[truncated: original ' + text.length + ' chars]')
      }
    }

    // Truncate system prompt if huge
    if (sysMsg && messageContentToText(sysMsg.content).length > 4000) {
      sysMsg.content = truncateContent(sysMsg.content, 2000, '\n[system prompt truncated]')
    }

    history.length = 0
    if (sysMsg) history.push(sysMsg)
    if (keptDecisions.length > 0) {
      history.push({ role: 'assistant', content: `[compacted: ${keptDecisions.length} decisions]\n${keptDecisions.map(m => messageContentToText(m.content).slice(0, 100)).join('\n')}` })
    }
    history.push(...recentMsgs)

    return {
      dropped: droppedMsgs.length,
      kept: history.length,
      tokensFreed,
      summary: `Dropped ${droppedMsgs.length} messages (${summaryParts.join(', ')}), freed ~${tokensFreed} tokens. Kept ${keptDecisions.length} decisions + last ${keepTurns} turns.`,
    }
  }
}
