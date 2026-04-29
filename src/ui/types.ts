/**
 * Typed UI event system for Orca CLI.
 *
 * Business logic emits UIEvents → the UI layer (ink or legacy) consumes them.
 * This decouples rendering from agent logic, enabling ink migration without
 * rewriting the agent loop.
 */

// ── Status Bar ──────────────────────────────────────────────

export interface StatusInfo {
  sessionId?: string
  model: string
  contextPct: number
  permMode: 'yolo' | 'auto' | 'plan'
  effort?: 'low' | 'medium' | 'high' | 'max'
  behaviorMode?: string
  modelPolicySummary?: string
  toolPolicySummary?: string
  outputStyle?: string
  gitBranch?: string
  costUsd: number
  tokPerSec?: number
  /** Total turns in this session */
  turns: number
  /** Token usage per turn for sparkline (last N values) */
  sparkline?: number[]
  /** Username / account display */
  username?: string
  /** Cache hit percentage (0-100) */
  cachePct?: number
  /** Session elapsed time in seconds */
  sessionElapsed?: number
  /** Permission level label (e.g. "L3 high") */
  permLevel?: string
  /** Where the current permission mode came from */
  permSource?: 'session' | 'project' | 'global' | 'env' | 'flag' | 'default'
}

// ── Turn Summary ────────────────────────────────────────────

export interface TurnSummaryInfo {
  inputTokens: number
  outputTokens: number
  thinkingTokens?: number
  cachedTokens?: number
  duration: number
  toolCalls: number
  costUsd: number
  model: string
}

// ── Session Summary ─────────────────────────────────────────

export interface SessionSummaryInfo {
  turns: number
  totalInputTokens: number
  totalOutputTokens: number
  totalCostUsd: number
  totalDuration: number
  toolCallsTotal: number
}

// ── Tool Call ────────────────────────────────────────────────

export interface ToolStartInfo {
  name: string
  args: Record<string, unknown>
  /** Short description for display */
  label?: string
}

export interface ToolEndInfo {
  name: string
  success: boolean
  output: string
  durationMs: number
  /** Categorized error type for graduated rendering */
  errorType?: 'rejected' | 'permission' | 'timeout' | 'not_found' | 'validation' | 'generic'
}

// ── Multi-Model ─────────────────────────────────────────────

export interface ModelProgress {
  model: string
  done: boolean
  elapsedMs: number
  /** Output text once done */
  output?: string
}

// ── Permission ──────────────────────────────────────────────

export interface PermissionRequest {
  toolName: string
  preview: string
  resolve: (decision: PermissionDecision) => void
  /** Diff data for file write permissions */
  diff?: {
    filePath: string
    oldContent: string
    newContent: string
  }
}

export type PermissionDecisionScope = 'once' | 'session' | 'project'

export interface PermissionDecision {
  allowed: boolean
  scope: PermissionDecisionScope
}

export interface OptionPickerOption {
  value: string
  label: string
  description?: string
}

export interface OptionPickerRequest {
  title: string
  subtitle?: string
  options: OptionPickerOption[]
  filterable?: boolean
  filterPlaceholder?: string
  initialQuery?: string
  resolve: (value: string | null) => void
}

export interface DetailPanelInfo {
  title: string
  subtitle?: string
  body: string
  tone?: 'info' | 'warn' | 'error'
}

// ── UI Event Union ──────────────────────────────────────────

export type UIEvent =
  | { type: 'text'; text: string }
  | { type: 'user_message'; text: string }
  | { type: 'thinking_start' }
  | { type: 'thinking_end'; ttfbMs: number }
  | { type: 'tool_start'; info: ToolStartInfo }
  | { type: 'tool_end'; info: ToolEndInfo }
  | { type: 'turn_summary'; info: TurnSummaryInfo }
  | { type: 'status_update'; info: StatusInfo }
  | { type: 'system_message'; text: string; level: 'info' | 'warn' | 'error' }
  | { type: 'permission_request'; request: PermissionRequest }
  | { type: 'option_picker_request'; request: OptionPickerRequest }
  | { type: 'detail_panel'; info: DetailPanelInfo }
  | { type: 'multi_model_progress'; command: string; models: ModelProgress[] }
  | { type: 'multi_model_result'; command: string; model: string; output: string; elapsedMs: number }
  | { type: 'session_end'; info: SessionSummaryInfo }
  | { type: 'prompt_ready' }
  | { type: 'abort' }
  | { type: 'clear' }
