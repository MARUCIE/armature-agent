import { describe, expect, it } from 'vitest'
import {
  buildReflectSystemPrompt,
  detectReflectIntent,
  prepareReflectPromptContent,
  prepareReflectPromptText,
} from '../src/commands/reflect-mode.js'

describe('reflect mode helpers', () => {
  it('detects debugging intent conservatively', () => {
    expect(detectReflectIntent('Why is this test failing with a TypeError in CI?')).toBe('debugging')
  })

  it('does not auto-trigger reflect for codegen asks that mention generic debug words', () => {
    expect(detectReflectIntent('Create an error boundary for React.')).toBe(null)
    expect(detectReflectIntent('Build a broken-link checker for docs.')).toBe(null)
  })

  it('does not auto-trigger reflect for explanatory error-boundary questions', () => {
    expect(detectReflectIntent('What is an error boundary in React?')).toBe(null)
    expect(detectReflectIntent('Explain error boundaries in React.')).toBe(null)
  })

  it('detects explanation intent when not mixed with codegen asks', () => {
    expect(detectReflectIntent('Walk me through what this parser does.')).toBe('explanation')
    expect(detectReflectIntent('Implement a parser and explain it.')).toBe(null)
  })

  it('wraps forced reflect prompts with a structured workflow', () => {
    const prepared = prepareReflectPromptText('Help me debug this flaky test.', { force: true })
    expect(prepared.applied).toBe(true)
    expect(prepared.notice).toBe('reflect mode engaged.')
    expect(prepared.prompt).toContain('Reflect workflow')
    expect(prepared.prompt).toContain('Root Cause')
  })

  it('prepends reflect guidance to multimodal prompts without dropping images', () => {
    const prepared = prepareReflectPromptContent([
      { type: 'text', text: 'What is broken in this screenshot?' },
      { type: 'image_url', image_url: { url: 'file:///tmp/ui.png' } },
    ], { force: true })

    expect(prepared.applied).toBe(true)
    expect(Array.isArray(prepared.prompt)).toBe(true)
    if (!Array.isArray(prepared.prompt)) throw new Error('expected prompt array')
    expect(prepared.prompt[0]).toMatchObject({ type: 'text' })
    expect(prepared.prompt[1]).toMatchObject({ type: 'image_url' })
  })

  it('builds a reflect system prompt on top of the base prompt', () => {
    const systemPrompt = buildReflectSystemPrompt('Base prompt')
    expect(systemPrompt).toContain('You are in reflect mode.')
    expect(systemPrompt).toContain('Base prompt')
  })
})
