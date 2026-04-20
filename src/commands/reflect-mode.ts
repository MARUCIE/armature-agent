import type { PromptContent } from '../providers/openai-compat.js'

export type ReflectReason = 'manual' | 'debugging' | 'explanation'

export interface ReflectPromptPreparation {
  prompt: PromptContent
  applied: boolean
  reason: ReflectReason | null
  notice: string | null
}

const REFLECT_SYSTEM_PROMPT_PREFIX = [
  'You are in reflect mode.',
  'Act as a Socratic debugging partner and root-cause investigator.',
  'Prioritize understanding the symptom, forming ranked hypotheses, gathering evidence, and proposing the smallest high-confidence next step.',
  'Do not jump straight to code changes when diagnosis is still ambiguous.',
  'Inspect available code, logs, tests, and configuration before guessing.',
  'Ask clarifying questions only when the missing information materially blocks progress.',
].join(' ')

const DEBUG_KEYWORDS = [
  'debug',
  'diagnose',
  'root cause',
  'trace',
  'why is',
  "why isn't",
  "why doesn’t",
  "why doesn't",
  'what am i missing',
  'not working',
  'broken',
  'failing test',
  'fails with',
  'exception',
  'stack trace',
  'traceback',
  'regression',
  'flaky',
]

const EXPLANATION_KEYWORDS = [
  'explain this',
  'walk me through',
  'help me understand',
  'what does this do',
  'why does this work',
  'talk me through',
  'rubber duck',
]

const BUILD_KEYWORDS = [
  'write ',
  'implement ',
  'generate ',
  'build ',
  'create ',
  'add feature',
]

export function getReflectSystemPromptPrefix(): string {
  return REFLECT_SYSTEM_PROMPT_PREFIX
}

export function buildReflectSystemPrompt(basePrompt: string): string {
  if (!basePrompt.trim()) return REFLECT_SYSTEM_PROMPT_PREFIX
  if (basePrompt.includes(REFLECT_SYSTEM_PROMPT_PREFIX)) return basePrompt
  return `${REFLECT_SYSTEM_PROMPT_PREFIX}\n\n${basePrompt}`
}

export function detectReflectIntent(input: string): ReflectReason | null {
  const normalized = normalizeInput(input)
  if (normalized.length < 12) return null

  const debugHits = DEBUG_KEYWORDS.filter((keyword) => normalized.includes(keyword)).length
  const explainHits = EXPLANATION_KEYWORDS.filter((keyword) => normalized.includes(keyword)).length
  const buildHits = BUILD_KEYWORDS.filter((keyword) => normalized.includes(keyword)).length

  if (debugHits >= 1 && debugHits > buildHits) return 'debugging'
  if (explainHits >= 1 && buildHits === 0) return 'explanation'
  return null
}

export function prepareReflectPromptText(
  input: string,
  options: { force?: boolean; allowAuto?: boolean } = {},
): ReflectPromptPreparation {
  const reason = options.force ? 'manual' : options.allowAuto !== false ? detectReflectIntent(input) : null
  return prepareReflectPromptTextForReason(input, reason)
}

export function prepareReflectPromptTextForReason(
  input: string,
  reason: ReflectReason | null,
): ReflectPromptPreparation {
  if (!reason) {
    return {
      prompt: input,
      applied: false,
      reason: null,
      notice: null,
    }
  }

  return {
    prompt: wrapReflectText(input, reason),
    applied: true,
    reason,
    notice: reason === 'manual'
      ? 'reflect mode engaged.'
      : `reflect auto-triggered (${reason} intent).`,
  }
}

export function prepareReflectPromptContent(
  input: PromptContent,
  options: { force?: boolean; allowAuto?: boolean } = {},
): ReflectPromptPreparation {
  if (typeof input === 'string') {
    return prepareReflectPromptText(input, options)
  }

  const textParts = input.filter((part) => part.type === 'text')
  const combinedText = textParts.map((part) => part.text).join('\n').trim()
  const prepared = prepareReflectPromptText(combinedText, options)
  if (!prepared.applied || typeof prepared.prompt !== 'string') {
    return {
      prompt: input,
      applied: false,
      reason: null,
      notice: null,
    }
  }

  return {
    ...prepared,
    prompt: [{ type: 'text', text: prepared.prompt }, ...input.filter((part) => part.type !== 'text')],
  }
}

function normalizeInput(input: string): string {
  return input.toLowerCase().replace(/\s+/g, ' ').trim()
}

function wrapReflectText(input: string, reason: ReflectReason): string {
  const reasonLabel = reason === 'manual'
    ? 'manual reflect request'
    : reason === 'debugging'
      ? 'debugging signal'
      : 'explanation signal'

  return [
    `Reflect workflow (${reasonLabel}):`,
    '- Restate the core symptom or question in one sentence.',
    '- Form 1-3 ranked hypotheses before recommending a fix.',
    '- Identify the smallest evidence-gathering step or inspection path.',
    '- Prefer root cause + next verification step over broad rewrites.',
    '- If a fix is justified, propose the smallest high-confidence change and explain why it addresses the evidence.',
    '- Use sections: Symptom, Hypotheses, Evidence, Root Cause, Next Step.',
    '',
    'User request:',
    input,
  ].join('\n')
}
