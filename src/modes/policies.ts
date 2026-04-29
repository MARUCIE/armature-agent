import { applyModeSystemPrompt } from '../commands/mode-system-prompt.js'
import type { ThinkingEffort } from '../output.js'
import type {
  Mode,
  WorkflowModelPolicy,
  WorkflowOutputStyle,
  WorkflowPreset,
  WorkflowPresetRuntimePolicy,
  WorkflowToolPolicy,
} from './registry.js'

type ToolDefinition = Record<string, unknown>

const EFFORT_PROMPT_PREFIX: Partial<Record<ThinkingEffort, string>> = {
  low: 'Be concise. Give brief answers.\n\n',
  high: 'Think carefully and thoroughly before answering.\n\n',
  max: 'Use deep analysis. Consider all edge cases. Think step by step.\n\n',
}

const MODEL_POLICY_LABELS: Record<WorkflowModelPolicy, string> = {
  'inherit-current': 'inherit-current',
}

const TOOL_POLICY_LABELS: Record<WorkflowToolPolicy, string> = {
  'investigation-toolset': 'investigation toolset',
  'review-only': 'review-only tools',
  'run-edit': 'run + edit tools',
  'planning-only': 'planning-only tools',
}

const OUTPUT_STYLE_LABELS: Record<WorkflowOutputStyle, string> = {
  'root-cause-walkthrough': 'root-cause walkthrough',
  'review-findings': 'review findings',
  'debug-walkthrough': 'debug walkthrough',
  'architecture-plan': 'architecture plan',
}

const MODEL_POLICY_PROMPTS: Partial<Record<WorkflowModelPolicy, string>> = {
  'inherit-current': 'Model policy: stay on the current model unless the user explicitly changes it.',
}

const TOOL_POLICY_PROMPTS: Partial<Record<WorkflowToolPolicy, string>> = {
  'investigation-toolset': 'Tool policy: stay inside the investigation-oriented toolset for diagnosis and evidence gathering.',
  'review-only': 'Tool policy: stay inside read-only review tools. Do not mutate files unless the user changes workflow.',
  'run-edit': 'Tool policy: use run + edit tools deliberately, preferring the smallest reproducible fix path.',
  'planning-only': 'Tool policy: stay inside planning-only tools. Produce plans and analysis instead of code edits.',
}

const OUTPUT_STYLE_PROMPTS: Partial<Record<WorkflowOutputStyle, string>> = {
  'root-cause-walkthrough': 'Output style: use sections Symptom, Hypotheses, Evidence, Root Cause, Next Step.',
  'review-findings': 'Output style: lead with findings ordered by severity, include concrete file references, and keep summary secondary.',
  'debug-walkthrough': 'Output style: use sections Symptom, Evidence, Fix, Verification, and keep the path reproduce-to-fix explicit.',
  'architecture-plan': 'Output style: use sections Constraints, Architecture, Tradeoffs, Plan, Risks, and keep the response implementation-light.',
}

export function describeModeChanges(mode: Mode): string {
  return mode.changesSummary || mode.description
}

export function buildModePickerDescription(mode: Mode, isCurrent = false): string {
  return `${describeModeChanges(mode)}${isCurrent ? ' · current' : ''}`
}

export function formatWorkflowModelPolicy(policy?: WorkflowModelPolicy): string | undefined {
  return policy ? MODEL_POLICY_LABELS[policy] : undefined
}

export function formatWorkflowToolPolicy(policy?: WorkflowToolPolicy): string | undefined {
  return policy ? TOOL_POLICY_LABELS[policy] : undefined
}

export function formatWorkflowOutputStyle(style?: WorkflowOutputStyle): string | undefined {
  return style ? OUTPUT_STYLE_LABELS[style] : undefined
}

export function describeWorkflowPresetPolicy(preset: WorkflowPreset): string {
  const parts = [
    `mode=${preset.modeId}`,
    preset.defaultEffort ? `effort=${preset.defaultEffort}` : null,
    preset.defaultPermissionMode ? `permissions=${preset.defaultPermissionMode}` : null,
    preset.toolPolicy ? `tools=${formatWorkflowToolPolicy(preset.toolPolicy)}` : null,
    preset.outputStyle ? `output=${formatWorkflowOutputStyle(preset.outputStyle)}` : null,
  ].filter(Boolean)
  return parts.join(' · ')
}

export function describeWorkflowPresetDefaults(preset: WorkflowPreset): string {
  const parts = [
    preset.modelPolicy ? `model=${formatWorkflowModelPolicy(preset.modelPolicy)}` : null,
    preset.defaultEffort ? `effort=${preset.defaultEffort}` : null,
    preset.defaultPermissionMode ? `permissions=${preset.defaultPermissionMode}` : null,
    preset.toolPolicy ? `tools=${formatWorkflowToolPolicy(preset.toolPolicy)}` : null,
    preset.outputStyle ? `output=${formatWorkflowOutputStyle(preset.outputStyle)}` : null,
  ].filter(Boolean)
  return parts.join(' · ')
}

export function applyWorkflowPresetPolicy(
  current: WorkflowPresetRuntimePolicy,
  preset?: WorkflowPreset,
): WorkflowPresetRuntimePolicy {
  if (!preset) return current
  return {
    effort: preset.defaultEffort || current.effort,
    permissionMode: preset.defaultPermissionMode || current.permissionMode,
  }
}

export function buildModePickerDescriptionWithPreset(
  mode: Mode,
  preset: WorkflowPreset | undefined,
  isCurrent = false,
): string {
  const parts = [describeModeChanges(mode)]
  if (preset) {
    const defaults = describeWorkflowPresetDefaults(preset)
    if (defaults) parts.push(defaults)
  }
  if (isCurrent) parts.push('current')
  return parts.join(' · ')
}

export function buildWorkflowPromptInstructions(preset?: WorkflowPreset): string {
  if (!preset) return ''

  const parts = [
    preset.modelPolicy ? MODEL_POLICY_PROMPTS[preset.modelPolicy] : null,
    preset.toolPolicy ? TOOL_POLICY_PROMPTS[preset.toolPolicy] : null,
    preset.outputStyle ? OUTPUT_STYLE_PROMPTS[preset.outputStyle] : null,
  ].filter(Boolean)

  return parts.join('\n')
}

export function buildModeSystemPromptBlock(mode: Mode, preset?: WorkflowPreset): string {
  const parts = [
    mode.systemPromptPrefix,
    buildWorkflowPromptInstructions(preset),
  ].filter(Boolean)

  return parts.join('\n\n')
}

export function applyEffortPrompt(basePrompt: string, effort: ThinkingEffort): string {
  const prefix = EFFORT_PROMPT_PREFIX[effort]
  if (!prefix) return basePrompt
  if (basePrompt.startsWith(prefix)) return basePrompt
  return `${prefix}${basePrompt}`
}

export function buildStartupSystemPrompt(
  basePrompt: string,
  options: {
    effort: ThinkingEffort
    mode?: Mode
    preset?: WorkflowPreset
  },
): string {
  const promptWithEffort = applyEffortPrompt(basePrompt, options.effort)
  if (!options.mode) return promptWithEffort

  return applyModeSystemPrompt({
    currentSystemPrompt: promptWithEffort,
    nextModePrefix: buildModeSystemPromptBlock(options.mode, options.preset),
  })
}

export function filterToolDefinitionsForMode(
  toolDefs: ToolDefinition[],
  mode?: Pick<Mode, 'tools'>,
): ToolDefinition[] {
  if (!mode?.tools?.length) return toolDefs
  const allowed = new Set(mode.tools)

  return toolDefs.filter((toolDef) => {
    const fn = toolDef.function as { name?: string } | undefined
    return typeof fn?.name === 'string' ? allowed.has(fn.name) : false
  })
}
