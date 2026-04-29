import { describe, it, expect } from 'vitest'
import {
  findModelChoice,
  formatContextWindow,
  formatPricing,
  getAgenticWarning,
  groupModelChoicesByProvider,
  listModelChoices,
  modelChoiceKey,
} from '../src/model-catalog.js'
import type { OrcaConfig } from '../src/config.js'

describe('model catalog', () => {
  const baseConfig: OrcaConfig = {
    providers: {
      openai: {
        apiKey: 'test-openai',
        models: ['gpt-5.4', 'o4-mini'],
        defaultModel: 'gpt-5.4',
        disabled: false,
        aggregator: false,
      },
      google: {
        apiKey: 'test-google',
        models: ['gemini-3.1-pro', 'gemini-3.1-flash-lite'],
        defaultModel: 'gemini-3.1-pro',
        disabled: false,
        aggregator: false,
      },
      cloudflare: {
        apiKey: 'test-cloudflare',
        baseURL: 'https://gateway.ai.cloudflare.com/v1/account/default/compat',
        models: ['anthropic/claude-opus-4.7', 'openai/gpt-5.4', 'google/gemini-3.1-pro'],
        defaultModel: 'anthropic/claude-opus-4.7',
        disabled: false,
        aggregator: true,
      },
    },
    defaultProvider: 'openai',
    defaultModel: 'gpt-5.4',
    multiModel: {},
    maxTurns: 25,
    permissionMode: 'default',
  }

  it('lists configured provider models first', () => {
    const models = listModelChoices(baseConfig)
    expect(models.some((m) => m.model === 'gpt-5.4' && m.provider === 'openai')).toBe(true)
    expect(models.some((m) => m.model === 'gemini-3.1-pro' && m.provider === 'google')).toBe(true)
    expect(models.some((m) => m.model === 'anthropic/claude-opus-4.7' && m.provider === 'cloudflare')).toBe(true)
  })

  it('injects current model if not present in config', () => {
    const models = listModelChoices(baseConfig, 'custom-agent-model')
    expect(models[0]!.model).toBe('custom-agent-model')
  })

  it('keeps duplicate model names provider-addressable', () => {
    const models = listModelChoices({
      ...baseConfig,
      providers: {
        ...baseConfig.providers,
        poe: {
          apiKey: 'test-poe',
          baseURL: 'https://api.poe.com/v1',
          models: ['gpt-5.4'],
          defaultModel: 'gpt-5.4',
          disabled: false,
          aggregator: true,
        },
      },
    })

    const poeGpt = models.find((model) => model.model === 'gpt-5.4' && model.provider === 'poe')
    expect(poeGpt).toBeDefined()
    expect(findModelChoice(models, modelChoiceKey(poeGpt!))?.provider).toBe('poe')
    expect(findModelChoice(models, 'gpt-5.4', 'poe')?.provider).toBe('poe')
    expect(groupModelChoicesByProvider(models).some((group) => group.provider === 'poe' && group.choices.length === 1)).toBe(true)
  })

  it('marks flash-lite as cautionary for agentic workflows', () => {
    expect(getAgenticWarning('gemini-3.1-flash-lite')).toContain('optimized for speed')
    const flash = listModelChoices(baseConfig).find((m) => m.model === 'gemini-3.1-flash-lite')
    expect(flash?.agentic).toBe('caution')
  })

  it('formats context windows and pricing for display', () => {
    expect(formatContextWindow(2_000_000)).toBe('2M')
    expect(formatContextWindow(256_000)).toBe('256K')
    expect(formatPricing([1.25, 10])).toBe('$1.25/$10')
  })

  it('recognizes gemini 2.5 metadata', () => {
    const gemini = listModelChoices({
      ...baseConfig,
      providers: {
        ...baseConfig.providers,
        google: {
          ...baseConfig.providers.google,
          models: ['gemini-2.5-pro'],
          defaultModel: 'gemini-2.5-pro',
        },
      },
    }).find((m) => m.model === 'gemini-2.5-pro')

    expect(gemini?.contextWindow).toBe(1_000_000)
    expect(gemini?.pricing).toEqual([1.25, 10])
  })
})
