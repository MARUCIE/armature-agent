import { describe, expect, it } from 'vitest'
import { ModeRegistry } from '../src/modes/index.js'
import { applyModeSystemPrompt } from '../src/commands/mode-system-prompt.js'

describe('mode system prompt switching', () => {
  it('replaces the previous builtin mode prefix when switching to reflect', () => {
    const registry = new ModeRegistry()
    const codeReviewPrefix = registry.getMode('code-review')!.systemPromptPrefix
    const reflectPrefix = registry.getMode('reflect')!.systemPromptPrefix
    const currentSystemPrompt = `${codeReviewPrefix}\n\nBase prompt`

    const nextSystemPrompt = applyModeSystemPrompt({
      currentSystemPrompt,
      previousModePrefix: codeReviewPrefix,
      nextModePrefix: reflectPrefix,
    })

    expect(nextSystemPrompt).toContain(reflectPrefix)
    expect(nextSystemPrompt).toContain('Base prompt')
    expect(nextSystemPrompt).not.toContain(codeReviewPrefix)
  })

  it('replaces a custom multi-word mode prefix exactly once', () => {
    const customPrefix = 'You are in team handoff review mode. Compare plans, risks, and rollout assumptions before proposing changes.'
    const reflectPrefix = new ModeRegistry().getMode('reflect')!.systemPromptPrefix
    const currentSystemPrompt = `Think carefully and thoroughly before answering.\n\n${customPrefix}\n\nBase prompt`

    const nextSystemPrompt = applyModeSystemPrompt({
      currentSystemPrompt,
      previousModePrefix: customPrefix,
      nextModePrefix: reflectPrefix,
    })

    expect(nextSystemPrompt).toContain('Think carefully and thoroughly before answering.')
    expect(nextSystemPrompt).toContain(reflectPrefix)
    expect(nextSystemPrompt).toContain('Base prompt')
    expect(nextSystemPrompt).not.toContain(customPrefix)
    expect(nextSystemPrompt.match(/You are in reflect mode\./g)?.length).toBe(1)
  })
})
