export type ModelPricing = [number, number]

const MODEL_CONTEXT: Array<[string, number]> = [
  ['claude-opus-4', 200_000],
  ['claude-sonnet-4', 200_000],
  ['gpt-5', 256_000],
  ['gpt-4.1', 1_000_000],
  ['gpt-4o', 128_000],
  ['gemini-2.5', 1_000_000],
  ['gemini-2.0', 1_000_000],
  ['gemini-3', 2_000_000],
  ['gemma-4', 128_000],
  ['glm-5', 128_000],
  ['grok-4', 256_000],
  ['qwen3', 128_000],
  ['kimi-k2', 256_000],
  ['minimax-m2', 128_000],
]

const MODEL_MAX_OUTPUT: Array<[string, number]> = [
  ['claude-opus-4', 32_000],
  ['claude-sonnet-4', 64_000],
  ['gpt-5', 64_000],
  ['gpt-4.1', 32_000],
  ['gpt-4o', 16_384],
  ['gemini-2.5', 65_536],
  ['gemini-2.0', 8_192],
  ['gemini-3', 65_536],
  ['gemma-4', 8_192],
  ['glm-5', 8_192],
  ['grok-4', 32_000],
  ['qwen3', 32_000],
  ['kimi-k2', 32_000],
  ['minimax-m2', 16_384],
]

const MODEL_PRICING: Array<[string, ModelPricing]> = [
  ['claude-opus', [15, 75]],
  ['claude-sonnet', [3, 15]],
  ['claude-haiku', [0.25, 1.25]],
  ['gpt-5', [1.25, 10]],
  ['gpt-4o', [2.5, 10]],
  ['gpt-4.1', [2, 8]],
  ['gpt-4.1-mini', [0.4, 1.6]],
  ['o3', [10, 40]],
  ['o4-mini', [1.1, 4.4]],
  ['gemini-2.5-pro', [1.25, 10]],
  ['gemini-2.5-flash', [0.15, 0.6]],
  ['gemini-2.0-flash', [0.1, 0.4]],
  ['gemini-3.1-pro', [1.25, 10]],
  ['gemini-3.1-flash-lite', [0.1, 0.4]],
  ['poe', [3, 15]],
]

function lookupByPrefix<T>(model: string, entries: Array<[string, T]>): T | undefined {
  const lower = model.toLowerCase()
  for (const [prefix, value] of entries) {
    if (lower.includes(prefix)) return value
  }
  return undefined
}

export function getContextWindowForModel(model: string): number | undefined {
  return lookupByPrefix(model, MODEL_CONTEXT)
}

export function getContextWindowForModelOrDefault(model: string, fallback = 128_000): number {
  return getContextWindowForModel(model) ?? fallback
}

export function getMaxOutputForModel(model: string): number | undefined {
  return lookupByPrefix(model, MODEL_MAX_OUTPUT)
}

export function getMaxOutputForModelOrDefault(model: string, fallback = 16_384): number {
  return getMaxOutputForModel(model) ?? fallback
}

export function getPricingForModel(model: string): ModelPricing | undefined {
  return lookupByPrefix(model, MODEL_PRICING)
}

export function getPricingForModelOrDefault(model: string, fallbackModel = 'poe'): ModelPricing | undefined {
  return getPricingForModel(model) ?? getPricingForModel(fallbackModel)
}

export function formatContextWindow(window?: number): string {
  if (!window) return '?'
  if (window >= 1_000_000) return `${(window / 1_000_000).toFixed(window % 1_000_000 === 0 ? 0 : 1)}M`
  if (window >= 1_000) return `${Math.round(window / 1_000)}K`
  return String(window)
}

export function formatPricing(pricing?: ModelPricing): string {
  if (!pricing) return '?'
  const [input, output] = pricing
  return `$${input}/$${output}`
}

export function formatModelCapacity(model: string): string {
  const contextWindow = getContextWindowForModel(model)
  const maxOutput = getMaxOutputForModel(model)
  const parts: string[] = []
  if (contextWindow) parts.push(`${formatContextWindow(contextWindow)} ctx`)
  if (maxOutput) parts.push(`${formatContextWindow(maxOutput)} out`)
  return parts.join(' · ')
}
