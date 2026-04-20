import type { ChatMessage } from '../providers/openai-compat.js'

export interface ResettableSessionStats {
  turns: number
  totalInputTokens: number
  totalOutputTokens: number
  startTime?: number
  turnTokens?: number[]
}

export interface ResettableSessionHarness {
  tokenBudget?: { reset: () => void }
  contextMonitor?: { reset: () => void }
}

export function resetConversationState(
  history: ChatMessage[],
  stats: ResettableSessionStats,
  harness?: ResettableSessionHarness,
): void {
  const sys = history.find((message) => message.role === 'system')
  history.length = 0
  if (sys) history.push(sys)
  stats.turns = 0
  stats.totalInputTokens = 0
  stats.totalOutputTokens = 0
  stats.turnTokens = []
  if (typeof stats.startTime === 'number') stats.startTime = Date.now()
  harness?.contextMonitor?.reset()
  harness?.tokenBudget?.reset()
}
