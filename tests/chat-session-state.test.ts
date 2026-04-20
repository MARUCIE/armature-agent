import { describe, expect, it, vi } from 'vitest'
import { resetConversationState } from '../src/commands/chat-session-state.js'

describe('resetConversationState', () => {
  it('resets conversation stats, preserves the system prompt, and clears session graphs', () => {
    const startTime = Date.now() - 10_000
    const history = [
      { role: 'system' as const, content: 'System prompt' },
      { role: 'user' as const, content: 'Hello' },
      { role: 'assistant' as const, content: 'Hi' },
    ]
    const stats = {
      turns: 4,
      totalInputTokens: 120,
      totalOutputTokens: 45,
      startTime,
      turnTokens: [10, 20],
    }
    const tokenBudget = { reset: vi.fn() }
    const contextMonitor = { reset: vi.fn() }

    resetConversationState(history, stats, { tokenBudget, contextMonitor })

    expect(history).toEqual([{ role: 'system', content: 'System prompt' }])
    expect(stats.turns).toBe(0)
    expect(stats.totalInputTokens).toBe(0)
    expect(stats.totalOutputTokens).toBe(0)
    expect(stats.turnTokens).toEqual([])
    expect(stats.startTime).toBeGreaterThan(startTime)
    expect(tokenBudget.reset).toHaveBeenCalled()
    expect(contextMonitor.reset).toHaveBeenCalled()
  })

  it('clears history fully when no system prompt exists', () => {
    const history = [
      { role: 'user' as const, content: 'Hello' },
      { role: 'assistant' as const, content: 'Hi' },
    ]
    const stats = {
      turns: 2,
      totalInputTokens: 10,
      totalOutputTokens: 20,
      turnTokens: [20],
    }

    resetConversationState(history, stats)

    expect(history).toEqual([])
    expect(stats.turns).toBe(0)
    expect(stats.totalInputTokens).toBe(0)
    expect(stats.totalOutputTokens).toBe(0)
    expect(stats.turnTokens).toEqual([])
  })

  it('initializes turn tokens even when the caller left them unset', () => {
    const history = [{ role: 'system' as const, content: 'System prompt' }]
    const stats = {
      turns: 1,
      totalInputTokens: 1,
      totalOutputTokens: 2,
      startTime: undefined,
      turnTokens: undefined,
    }

    expect(() => resetConversationState(history, stats)).not.toThrow()
    expect(history).toEqual([{ role: 'system', content: 'System prompt' }])
    expect(stats.turns).toBe(0)
    expect(stats.totalInputTokens).toBe(0)
    expect(stats.totalOutputTokens).toBe(0)
    expect(stats.startTime).toBeUndefined()
    expect(stats.turnTokens).toEqual([])
  })
})
