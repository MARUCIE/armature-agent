/**
 * Workflow agent runner.
 *
 * The runtime ({@link runWorkflow}) is decoupled from how a sub-agent is
 * actually executed through the {@link WorkflowAgentRunner} interface. This file
 * provides the production bridge — {@link OrcaWorkflowAgentRunner} — which maps
 * each `agent()` call onto Orca's process-isolated `spawnSubAgent`, with optional
 * git-worktree isolation and a JSON output contract for structured `schema`
 * returns. Tests can swap in a stub runner with no LLM call.
 */

import { execFileSync } from 'node:child_process'
import { spawnSubAgent, READ_ONLY_TOOLS, DELEGATE_TOOLS } from '../agent/sub-agent.js'
import { WorktreeManager } from '../agent/worktree.js'

// ── Engine-facing contract ───────────────────────────────────────

export interface WorkflowAgentRequest {
  prompt: string
  label: string
  phase?: string
  /** JSON Schema object; when present the return must be a validated object. */
  schema?: Record<string, unknown>
  model?: string
  isolation?: 'worktree'
  agentType?: string
  signal?: AbortSignal
}

export interface WorkflowAgentRunner {
  /** Resolve to the sub-agent's text, or a parsed object when `schema` is set. */
  run(req: WorkflowAgentRequest): Promise<unknown>
}

export interface OrcaRunnerParentContext {
  model: string
  apiKey: string
  baseURL?: string | null
}

export interface OrcaWorkflowAgentRunnerOptions {
  cwd: string
  parent: OrcaRunnerParentContext
  /** Per-agent wall-clock cap (ms). Default 180s — workflows fan out long tasks. */
  timeoutMs?: number
  maxTurns?: number
}

// ── Production bridge ────────────────────────────────────────────

export class OrcaWorkflowAgentRunner implements WorkflowAgentRunner {
  private readonly cwd: string
  private readonly parent: OrcaRunnerParentContext
  private readonly timeoutMs: number
  private readonly maxTurns: number
  private readonly worktrees = new WorktreeManager()

  constructor(options: OrcaWorkflowAgentRunnerOptions) {
    this.cwd = options.cwd
    this.parent = options.parent
    this.timeoutMs = options.timeoutMs ?? 180_000
    this.maxTurns = options.maxTurns ?? 20
  }

  async run(req: WorkflowAgentRequest): Promise<unknown> {
    const tools = selectTools(req.agentType)
    const prompt = req.schema ? `${req.prompt}\n\n${buildSchemaContract(req.schema)}` : req.prompt

    const { runCwd, worktreeId } = this.resolveWorkdir(req)
    try {
      const result = await spawnSubAgent(
        {
          task: prompt,
          cwd: runCwd,
          tools,
          model: req.model || this.parent.model,
          timeout: this.timeoutMs,
          maxTurns: this.maxTurns,
        },
        { model: this.parent.model, apiKey: this.parent.apiKey, baseURL: this.parent.baseURL || '' },
      )

      if (!result.success) {
        throw new Error(result.output || 'sub-agent failed')
      }

      const text = worktreeId ? this.annotateWorktree(worktreeId, runCwd, result.output) : result.output
      return req.schema ? parseSchemaResult(text, req.schema) : text
    } finally {
      this.maybeCleanupWorktree(worktreeId, runCwd)
    }
  }

  private resolveWorkdir(req: WorkflowAgentRequest): { runCwd: string; worktreeId?: string } {
    if (req.isolation !== 'worktree') return { runCwd: this.cwd }
    try {
      const agent = this.worktrees.create(this.cwd, req.label)
      return { runCwd: agent.worktreePath, worktreeId: agent.id }
    } catch {
      // Not a git repo (or worktree add failed) — fall back to the base cwd.
      return { runCwd: this.cwd }
    }
  }

  private annotateWorktree(worktreeId: string, runCwd: string, output: string): string {
    const agent = this.worktrees.list().find((a) => a.id === worktreeId)
    if (!agent) return output
    return `${output}\n\n[worktree] branch=${agent.branch} path=${runCwd} — review and merge if you want these changes.`
  }

  /** Remove the worktree only when it left no changes; keep it otherwise for review. */
  private maybeCleanupWorktree(worktreeId: string | undefined, runCwd: string): void {
    if (!worktreeId) return
    try {
      const status = execFileSync('git', ['status', '--porcelain'], { cwd: runCwd, encoding: 'utf-8', stdio: 'pipe' }).trim()
      if (status === '') this.worktrees.cleanup(worktreeId, this.cwd)
    } catch {
      // Best-effort cleanup; a dirty/failed worktree is left for the user to inspect.
    }
  }
}

// ── Tool-set + structured-output helpers ─────────────────────────

function selectTools(agentType?: string): string[] {
  const kind = (agentType || '').toLowerCase()
  if (kind === 'explore' || kind === 'read' || kind === 'readonly' || kind === 'research') return READ_ONLY_TOOLS
  return DELEGATE_TOOLS
}

/** Instruction block appended to a sub-agent prompt when a schema is requested. */
export function buildSchemaContract(schema: Record<string, unknown>): string {
  return [
    'Final output contract:',
    '- Your LAST message must be exactly one fenced ```json block and nothing else after it.',
    '- The JSON object is the return value of this sub-agent; it MUST satisfy this JSON Schema:',
    '```json',
    JSON.stringify(schema, null, 2),
    '```',
    '- Do up any reading/commands first, then emit the single JSON object.',
    '- Do not wrap the JSON in prose, comments, or trailing text.',
  ].join('\n')
}

/**
 * Extract and validate a JSON object from a sub-agent's text response.
 * Throws on parse failure or missing required keys so the runtime can null the
 * agent result (mirroring the reference's failed-agent behaviour).
 */
export function parseSchemaResult(text: string, schema: Record<string, unknown>): unknown {
  const raw = extractJsonBlock(text)
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new Error(`structured output was not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
  assertRequiredKeys(parsed, schema)
  return parsed
}

function extractJsonBlock(text: string): string {
  const fences = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)]
  if (fences.length > 0) {
    const last = fences[fences.length - 1][1]?.trim()
    if (last) return last
  }
  const trimmed = text.trim()
  // Whole response is JSON (no fence, no prose) — object or array.
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return trimmed
  // Otherwise grab the outermost {...} object span. Arrays embedded in prose are
  // ambiguous (prose brackets), so they are not extracted — fence them instead.
  const first = trimmed.indexOf('{')
  const last = trimmed.lastIndexOf('}')
  if (first !== -1 && last > first) return trimmed.slice(first, last + 1)
  return trimmed
}

function assertRequiredKeys(value: unknown, schema: Record<string, unknown>): void {
  const required = schema.required
  if (!Array.isArray(required) || required.length === 0) return
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('structured output must be a JSON object')
  }
  const obj = value as Record<string, unknown>
  const missing = required.filter((key) => typeof key === 'string' && !(key in obj))
  if (missing.length > 0) {
    throw new Error(`structured output missing required keys: ${missing.join(', ')}`)
  }
}
