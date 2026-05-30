/**
 * Hermes-inspired model catalog for Armature CLI.
 *
 * Purpose:
 * - Replace hard-coded `/models` lists with provider-aware choices
 * - Surface context window and approximate pricing alongside models
 * - Warn when a model looks weak for multi-step agentic coding workflows
 */

import type { ArmatureConfig } from './config.js'
import { listProviders } from './config.js'
import {
  getContextWindowForModel,
  getMaxOutputForModel,
  getPricingForModel,
} from './model-metadata.js'

export {
  formatContextWindow,
  formatModelCapacity,
  formatPricing,
  getContextWindowForModel,
  getContextWindowForModelOrDefault,
  getMaxOutputForModel,
  getMaxOutputForModelOrDefault,
  getPricingForModel,
  getPricingForModelOrDefault,
  type ModelPricing,
} from './model-metadata.js'

export interface ModelChoice {
  model: string
  provider: string
  contextWindow?: number
  maxOutput?: number
  pricing?: [number, number]
  agentic: 'recommended' | 'caution' | 'unknown'
  note?: string
}

export interface ModelChoiceGroup {
  provider: string
  choices: ModelChoice[]
}

const DEFAULT_MODELS = [
  { provider: 'anthropic', model: 'claude-opus-4.6' },
  { provider: 'anthropic', model: 'claude-sonnet-4.6' },
  { provider: 'openai', model: 'gpt-5.4' },
  { provider: 'google', model: 'gemini-3.1-pro' },
  { provider: 'google', model: 'gemini-3.1-flash-lite' },
  { provider: 'google', model: 'gemma-4-31b' },
  { provider: 'xai', model: 'grok-4.20-multi-agent' },
  { provider: 'local', model: 'qwen3.6-plus' },
  { provider: 'local', model: 'kimi-k2.5' },
  { provider: 'local', model: 'glm-5' },
  { provider: 'local', model: 'minimax-m2.7' },
] as const

const AGENTIC_CAUTION_RULES: Array<[RegExp, string]> = [
  [/flash-lite/i, 'optimized for speed and auxiliary work; tool-use quality may be weaker on complex coding tasks'],
  [/gemma/i, 'open-weight model; treat as lower-confidence for multi-step autonomous editing'],
  [/minimax/i, 'creative generation bias may require tighter verification on coding workflows'],
]

export function getAgenticWarning(model: string): string | undefined {
  for (const [pattern, warning] of AGENTIC_CAUTION_RULES) {
    if (pattern.test(model)) return warning
  }
  return undefined
}

export function getModelChoice(model: string, provider: string): ModelChoice {
  const warning = getAgenticWarning(model)
  return {
    model,
    provider,
    contextWindow: getContextWindowForModel(model),
    maxOutput: getMaxOutputForModel(model),
    pricing: getPricingForModel(model),
    agentic: warning ? 'caution' : 'recommended',
    note: warning,
  }
}

export function modelChoiceKey(choice: Pick<ModelChoice, 'model' | 'provider'>): string {
  return `${choice.provider}\t${choice.model}`
}

export function groupModelChoicesByProvider(choices: ModelChoice[]): ModelChoiceGroup[] {
  const groups: ModelChoiceGroup[] = []
  const index = new Map<string, ModelChoiceGroup>()

  for (const choice of choices) {
    let group = index.get(choice.provider)
    if (!group) {
      group = { provider: choice.provider, choices: [] }
      index.set(choice.provider, group)
      groups.push(group)
    }
    group.choices.push(choice)
  }

  return groups
}

export function findModelChoice(
  choices: ModelChoice[],
  modelOrKey: string,
  preferredProvider?: string,
): ModelChoice | undefined {
  const exactKey = choices.find((choice) => modelChoiceKey(choice) === modelOrKey)
  if (exactKey) return exactKey

  if (preferredProvider) {
    const providerMatch = choices.find((choice) => choice.model === modelOrKey && choice.provider === preferredProvider)
    if (providerMatch) return providerMatch
  }

  return choices.find((choice) => choice.model === modelOrKey)
}

export function listModelChoices(config: ArmatureConfig, currentModel?: string, currentProvider = 'current'): ModelChoice[] {
  const choices: ModelChoice[] = []
  const seen = new Set<string>()

  for (const provider of listProviders(config)) {
    const providerConfig = config.providers[provider.id]
    const models = providerConfig?.models && providerConfig.models.length > 0
      ? providerConfig.models
      : provider.model && provider.model !== '(not set)'
        ? [provider.model]
        : []

    for (const model of models) {
      const key = `${provider.id}:${model}`
      if (seen.has(key)) continue
      seen.add(key)
      choices.push(getModelChoice(model, provider.id))
    }
  }

  for (const fallback of DEFAULT_MODELS) {
    const key = `${fallback.provider}:${fallback.model}`
    if (seen.has(key)) continue
    seen.add(key)
    choices.push(getModelChoice(fallback.model, fallback.provider))
  }

  if (currentModel) {
    const currentKey = choices.find((choice) => choice.model === currentModel && choice.provider === currentProvider)
    if (!currentKey) {
      choices.unshift(getModelChoice(currentModel, currentProvider))
    }
  }

  return choices
}
