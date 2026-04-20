import { describe, expect, it } from 'vitest'
import { buildPendingContinueRestore, getForcedModeRestoreWarning } from '../src/commands/chat-resume-state.js'

describe('buildPendingContinueRestore', () => {
  it('returns a warning for malformed saved history', () => {
    const result = buildPendingContinueRestore({
      name: 'broken-session',
      session: {
        history: null,
        stats: { turns: 2, inputTokens: 20, outputTokens: 40 },
        model: 'model-a',
      },
    })

    expect(result.restore).toBeUndefined()
    expect(result.warning).toContain('missing history')
  })

  it('returns a warning when the session payload is missing', () => {
    const result = buildPendingContinueRestore({
      name: 'broken-session',
    } as never)

    expect(result.restore).toBeUndefined()
    expect(result.warning).toContain('missing session payload')
  })

  it('returns a warning for malformed history entries', () => {
    const result = buildPendingContinueRestore({
      name: 'broken-entry',
      session: {
        history: [null, { role: 'tool', content: 'bad role' }, { role: 'user', content: 42 }],
      },
    })

    expect(result.restore).toBeUndefined()
    expect(result.warning).toContain('malformed history entry')
  })

  it('returns a warning for malformed content-part arrays', () => {
    const result = buildPendingContinueRestore({
      name: 'broken-parts',
      session: {
        history: [
          { role: 'user', content: [42] },
          { role: 'assistant', content: [{ type: 'image_url' }] },
        ],
      },
    } as never)

    expect(result.restore).toBeUndefined()
    expect(result.warning).toContain('malformed history entry')
  })

  it('returns a warning for empty history', () => {
    const result = buildPendingContinueRestore({
      name: 'empty-history',
      session: {
        history: [],
      },
    })

    expect(result.restore).toBeUndefined()
    expect(result.warning).toContain('empty history')
  })

  it('returns a warning when the first message is not a system prompt', () => {
    const result = buildPendingContinueRestore({
      name: 'missing-system',
      session: {
        history: [{ role: 'user', content: 'Hello' }],
      },
    })

    expect(result.restore).toBeUndefined()
    expect(result.warning).toContain('missing system prompt')
  })

  it('sanitizes malformed numeric stats to zero', () => {
    const result = buildPendingContinueRestore({
      name: 'bad-stats',
      session: {
        history: [{ role: 'system', content: 'System prompt' }],
        stats: {
          turns: 'abc' as never,
          inputTokens: {} as never,
          outputTokens: Number.NaN,
        },
      },
    }, 123)

    expect(result.restore?.stats).toEqual({
      turns: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      startTime: 123,
      turnTokens: [],
    })
  })

  it('clamps negative and fractional stats to non-negative integers', () => {
    const result = buildPendingContinueRestore({
      name: 'fractional-stats',
      session: {
        history: [{ role: 'system', content: 'System prompt' }],
        stats: {
          turns: -1,
          inputTokens: 12.9,
          outputTokens: -3.2,
        },
      },
    }, 123)

    expect(result.restore?.stats).toEqual({
      turns: 0,
      totalInputTokens: 12,
      totalOutputTokens: 0,
      startTime: 123,
      turnTokens: [],
    })
  })

  it('builds a pending restore snapshot for valid saved sessions', () => {
    const result = buildPendingContinueRestore({
      name: 'valid-session',
      session: {
        history: [{ role: 'system', content: 'System prompt' }],
        stats: { turns: 3, inputTokens: 30, outputTokens: 60 },
        modeId: 'reflect',
        provider: 'openai',
        model: 'model-a',
      },
    }, 123)

    expect(result.warning).toBeUndefined()
    expect(result.restore).toEqual({
      name: 'valid-session',
      history: [{ role: 'system', content: 'System prompt' }],
      stats: {
        turns: 3,
        totalInputTokens: 30,
        totalOutputTokens: 60,
        startTime: 123,
        turnTokens: [],
      },
      restoredModeId: 'reflect',
      restoredSelection: {
        provider: 'openai',
        model: 'model-a',
      },
    })
  })

  it('warns when a forced mode conflicts with the saved session mode', () => {
    expect(getForcedModeRestoreWarning('reflect', undefined)).toContain('does not match forced mode reflect')
    expect(getForcedModeRestoreWarning('reflect', 'default')).toContain('does not match forced mode reflect')
    expect(getForcedModeRestoreWarning('reflect', 'reflect')).toBeUndefined()
  })
})
