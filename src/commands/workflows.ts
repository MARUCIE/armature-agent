import { Command } from 'commander'
import { createChatCommand } from './chat.js'
import { getWorkflowPreset, listWorkflowPresets, type WorkflowPreset } from '../modes/index.js'

export interface ResolvedWorkflowPresetRuntimeOptions {
  effort?: 'low' | 'medium' | 'high' | 'max'
  forceReflect?: boolean
  initialModeId?: string
  initialPermissionMode?: 'yolo' | 'auto' | 'plan'
}

export function resolveWorkflowPresetRuntimeOptions(
  preset: WorkflowPreset,
  opts: { effort?: string },
): ResolvedWorkflowPresetRuntimeOptions {
  return {
    effort: (opts.effort as ResolvedWorkflowPresetRuntimeOptions['effort'] | undefined) || preset.defaultEffort,
    forceReflect: preset.forceReflect,
    initialModeId: preset.modeId,
    initialPermissionMode: preset.defaultPermissionMode,
  }
}

function createWorkflowCommand(commandName: string): Command {
  const preset = getWorkflowPreset(commandName)
  if (!preset) throw new Error(`Unknown workflow command: ${commandName}`)
  const runtime = resolveWorkflowPresetRuntimeOptions(preset, {})
  return createChatCommand({
    name: preset.commandName,
    description: preset.description,
    forceReflect: runtime.forceReflect,
    initialModeId: runtime.initialModeId,
  })
}

export { listWorkflowPresets }

export function createReviewCommand(): Command {
  return createWorkflowCommand('review')
}

export function createDebugCommand(): Command {
  return createWorkflowCommand('debug')
}

export function createArchitectCommand(): Command {
  return createWorkflowCommand('architect')
}
