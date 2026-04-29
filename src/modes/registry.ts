/**
 * Mode Registry — behavioral profiles that bundle role prompt,
 * tool subset, and custom instructions.
 *
 * Modes shape agent behavior without changing the underlying model.
 * Built-in modes cover common workflows; custom modes can be loaded
 * from .orca/modes.json.
 */

import { readFileSync } from 'node:fs'
import type { ReplPermissionMode } from '../config.js'
import { getReflectSystemPromptPrefix } from '../commands/reflect-mode.js'
import type { ThinkingEffort } from '../output.js'

// ── Types ────────────────────────────────────────────────────────

export interface Mode {
  id: string
  name: string
  description: string
  changesSummary?: string
  systemPromptPrefix: string // prepended to system prompt when active
  tools?: string[] // tool whitelist (undefined = all tools)
  instructions?: string // additional instructions appended to system prompt
}

export type WorkflowModelPolicy = 'inherit-current'
export type WorkflowToolPolicy =
  | 'investigation-toolset'
  | 'review-only'
  | 'run-edit'
  | 'planning-only'
export type WorkflowOutputStyle =
  | 'root-cause-walkthrough'
  | 'review-findings'
  | 'debug-walkthrough'
  | 'architecture-plan'

export interface WorkflowPreset {
  id: string
  commandName: string
  description: string
  modeId: string
  forceReflect?: boolean
  modelPolicy?: WorkflowModelPolicy
  defaultEffort?: 'low' | 'medium' | 'high' | 'max'
  defaultPermissionMode?: 'yolo' | 'auto' | 'plan'
  toolPolicy?: WorkflowToolPolicy
  outputStyle?: WorkflowOutputStyle
}

export interface WorkflowPresetRuntimePolicy {
  effort: ThinkingEffort
  permissionMode: ReplPermissionMode
}

// ── Built-in Modes ──────────────────────────────────────────────

const BUILTIN_MODES: Mode[] = [
  {
    id: 'default',
    name: 'Default',
    description: 'Full agent with all tools',
    changesSummary: 'all tools · balanced general-purpose flow',
    systemPromptPrefix: '',
  },
  {
    id: 'code-review',
    name: 'Code Review',
    description: 'Focus on reviewing code quality, security, and best practices',
    changesSummary: 'read-only review focus · no code changes · restricted tools',
    systemPromptPrefix:
      'You are in code review mode. Focus exclusively on reviewing code for bugs, security issues, performance problems, and style violations. Do not write new code — only analyze and suggest improvements.',
    tools: [
      'read_file',
      'search_files',
      'glob_files',
      'find_definition',
      'find_references',
      'git_diff',
      'git_log',
      'list_directory',
      'directory_tree',
    ],
  },
  {
    id: 'debug',
    name: 'Debug',
    description: 'Systematic debugging with error tracing',
    changesSummary: 'reproduce → isolate → fix → verify · run + edit tools',
    systemPromptPrefix:
      'You are in debug mode. Systematically trace errors: reproduce \u2192 isolate \u2192 identify root cause \u2192 fix \u2192 verify. Always read error messages carefully before proposing solutions.',
    tools: [
      'read_file',
      'search_files',
      'glob_files',
      'edit_file',
      'run_command',
      'git_diff',
      'git_status',
      'list_directory',
    ],
  },
  {
    id: 'reflect',
    name: 'Reflect',
    description: 'Socratic debugging and root-cause investigation',
    changesSummary: 'root-cause investigation · Socratic diagnosis · evidence-first',
    systemPromptPrefix: getReflectSystemPromptPrefix(),
    tools: [
      'read_file',
      'search_files',
      'glob_files',
      'find_definition',
      'find_references',
      'run_command',
      'edit_file',
      'git_diff',
      'git_status',
      'list_directory',
      'directory_tree',
    ],
  },
  {
    id: 'architect',
    name: 'Architect',
    description: 'System design and planning without code changes',
    changesSummary: 'architecture/planning only · no code changes · plan tools',
    systemPromptPrefix:
      'You are in architect mode. Focus on system design, architecture decisions, and planning. Analyze code structure and dependencies. Do NOT modify files \u2014 only create plans.',
    tools: [
      'read_file',
      'search_files',
      'glob_files',
      'find_definition',
      'find_references',
      'directory_tree',
      'count_lines',
      'list_directory',
      'create_plan',
    ],
  },
  {
    id: 'docs',
    name: 'Documentation',
    description: 'Write and improve documentation',
    changesSummary: 'docs writing focus · file editing allowed · doc-oriented flow',
    systemPromptPrefix:
      'You are in documentation mode. Focus on writing clear, comprehensive documentation. Read existing code to understand it, then write or improve documentation files.',
    tools: [
      'read_file',
      'write_file',
      'edit_file',
      'search_files',
      'glob_files',
      'list_directory',
      'directory_tree',
    ],
  },
]

const BUILTIN_WORKFLOW_PRESETS: WorkflowPreset[] = [
  {
    id: 'reflect',
    commandName: 'reflect',
    description: 'Socratic debugging and root-cause investigation',
    modeId: 'reflect',
    forceReflect: true,
    modelPolicy: 'inherit-current',
    defaultEffort: 'high',
    defaultPermissionMode: 'auto',
    toolPolicy: 'investigation-toolset',
    outputStyle: 'root-cause-walkthrough',
  },
  {
    id: 'review',
    commandName: 'review',
    description: 'Focused code review workflow',
    modeId: 'code-review',
    modelPolicy: 'inherit-current',
    defaultEffort: 'high',
    defaultPermissionMode: 'plan',
    toolPolicy: 'review-only',
    outputStyle: 'review-findings',
  },
  {
    id: 'debug',
    commandName: 'debug',
    description: 'Systematic reproduce-to-fix debugging workflow',
    modeId: 'debug',
    modelPolicy: 'inherit-current',
    defaultEffort: 'high',
    defaultPermissionMode: 'auto',
    toolPolicy: 'run-edit',
    outputStyle: 'debug-walkthrough',
  },
  {
    id: 'architect',
    commandName: 'architect',
    description: 'Architecture and planning workflow without code changes',
    modeId: 'architect',
    modelPolicy: 'inherit-current',
    defaultEffort: 'max',
    defaultPermissionMode: 'plan',
    toolPolicy: 'planning-only',
    outputStyle: 'architecture-plan',
  },
]

// ── Registry ────────────────────────────────────────────────────

export class ModeRegistry {
  private modes = new Map<string, Mode>()
  private activeMode: Mode

  constructor() {
    for (const mode of BUILTIN_MODES) {
      this.modes.set(mode.id, mode)
    }
    this.activeMode = this.modes.get('default')!
  }

  /** Load custom modes from a JSON file (e.g., .orca/modes.json) */
  loadFromFile(path: string): void {
    const raw = readFileSync(path, 'utf-8')
    const parsed: unknown = JSON.parse(raw)

    if (!Array.isArray(parsed)) {
      throw new Error(`Expected JSON array of modes in ${path}`)
    }

    for (const entry of parsed) {
      const mode = entry as Mode
      if (!mode.id || !mode.name || typeof mode.systemPromptPrefix !== 'string') {
        continue // skip malformed entries
      }
      this.modes.set(mode.id, mode)
    }
  }

  /** Get active mode */
  getActive(): Mode {
    return this.activeMode
  }

  /** Switch to a mode by ID. Returns false if mode not found. */
  switchTo(id: string): boolean {
    const mode = this.modes.get(id)
    if (!mode) return false
    this.activeMode = mode
    return true
  }

  /** List all available modes */
  listModes(): Mode[] {
    return [...this.modes.values()]
  }

  /** Get mode by ID */
  getMode(id: string): Mode | undefined {
    return this.modes.get(id)
  }

  get modeCount(): number {
    return this.modes.size
  }
}

export function getWorkflowPresetForMode(modeId: string): WorkflowPreset | undefined {
  return BUILTIN_WORKFLOW_PRESETS.find((preset) => preset.modeId === modeId)
}

export function listWorkflowPresets(): WorkflowPreset[] {
  return [...BUILTIN_WORKFLOW_PRESETS]
}

export function getWorkflowPreset(idOrCommand: string): WorkflowPreset | undefined {
  return BUILTIN_WORKFLOW_PRESETS.find((preset) =>
    preset.id === idOrCommand || preset.commandName === idOrCommand,
  )
}
