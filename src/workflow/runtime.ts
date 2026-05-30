/**
 * Workflow runtime.
 *
 * Runs a parsed workflow body inside a Node `vm` sandbox with a small set of
 * whitelisted globals — `agent`, `parallel`, `pipeline`, `phase`, `log`, `args`,
 * `budget`. Each `agent()` call is dispatched through a {@link WorkflowAgentRunner}
 * so the orchestration engine stays independent of how sub-agents are executed.
 *
 * Ported from pi-dynamic-workflows (MIT); the in-memory subagent is replaced by
 * Orca's runner abstraction, and progress is surfaced through callbacks.
 */

import vm from 'node:vm'
import { parseWorkflowScript, type WorkflowMeta, type WorkflowAgentOptions } from './parser.js'
import type { WorkflowAgentRequest, WorkflowAgentRunner } from './runner.js'

export interface WorkflowRunOptions {
  runner: WorkflowAgentRunner
  args?: unknown
  cwd?: string
  concurrency?: number
  tokenBudget?: number | null
  signal?: AbortSignal
  onLog?: (message: string) => void
  onPhase?: (title: string) => void
  onAgentStart?: (event: { id: number; label: string; phase?: string }) => void
  onAgentEnd?: (event: { id: number; label: string; phase?: string; ok: boolean }) => void
}

export interface WorkflowRunResult<T = unknown> {
  meta: WorkflowMeta
  result: T
  logs: string[]
  phases: string[]
  agentCount: number
  durationMs: number
}

interface RuntimeState {
  currentPhase?: string
  logs: string[]
  phases: string[]
  agentCount: number
  spent: number
}

const DEFAULT_CONCURRENCY = Math.max(1, ((globalThis as any).navigator?.hardwareConcurrency ?? 8) - 2)

const DETERMINISM_ERROR = 'workflow scripts must be deterministic'

/**
 * `Date` and `Math.random` are realm intrinsics that exist in every `vm` context
 * regardless of what we expose, so the source-level blocklist (which only
 * matches dot-access like `Date.now()`) is bypassable via bracket access
 * (`Date['now']()`). Shadow them in the sandbox to block the common accidental
 * non-determinism paths. A determined script could still escape via constructor
 * reflection (`Array.constructor`) — that is out of scope; the workflow vm is a
 * determinism guardrail for a trusted (model-authored) script, not adversarial
 * isolation. See doc/DYNAMIC_WORKFLOWS.md.
 */
const DETERMINISTIC_MATH: typeof Math = (() => {
  const clone = Object.create(null) as Record<string, unknown>
  for (const key of Object.getOwnPropertyNames(Math)) {
    clone[key] = (Math as unknown as Record<string, unknown>)[key]
  }
  clone.random = () => {
    throw new Error(`Math.random() is unavailable: ${DETERMINISM_ERROR}`)
  }
  return Object.freeze(clone) as unknown as typeof Math
})()

const DETERMINISTIC_DATE: unknown = (() => {
  const stub = function DateStub(): never {
    throw new Error(`Date is unavailable: ${DETERMINISM_ERROR}`)
  }
  stub.now = (): never => {
    throw new Error(`Date.now() is unavailable: ${DETERMINISM_ERROR}`)
  }
  return Object.freeze(stub)
})()

export async function runWorkflow<T = unknown>(
  script: string,
  options: WorkflowRunOptions,
): Promise<WorkflowRunResult<T>> {
  const started = Date.now()
  const { meta, body } = parseWorkflowScript(script)
  const state: RuntimeState = { logs: [], phases: [], agentCount: 0, spent: 0 }
  const concurrency = Math.max(1, Math.min(options.concurrency ?? DEFAULT_CONCURRENCY, 16))
  const limiter = createLimiter(concurrency)

  const log = (message: unknown) => {
    const text = String(message)
    state.logs.push(text)
    options.onLog?.(text)
  }

  const phase = (title: string) => {
    state.currentPhase = title
    if (!state.phases.includes(title)) state.phases.push(title)
    options.onPhase?.(title)
  }

  const budget = Object.freeze({
    total: options.tokenBudget ?? null,
    spent: () => state.spent,
    remaining: () => (options.tokenBudget == null ? Infinity : Math.max(0, options.tokenBudget - state.spent)),
  })

  const throwIfAborted = () => {
    if (options.signal?.aborted) throw new Error('workflow aborted')
  }

  const agent = async (prompt: string, agentOptions: WorkflowAgentOptions = {}) => {
    throwIfAborted()
    if (budget.total !== null && budget.remaining() <= 0) throw new Error('workflow token budget exhausted')
    const assignedPhase = agentOptions.phase ?? state.currentPhase
    const requestedLabel = agentOptions.label?.trim()
    return limiter(async () => {
      const id = ++state.agentCount
      const label = requestedLabel || defaultAgentLabel(assignedPhase, id)
      options.onAgentStart?.({ id, label, phase: assignedPhase })
      try {
        throwIfAborted()
        const request: WorkflowAgentRequest = {
          prompt: String(prompt),
          label,
          phase: assignedPhase,
          schema: agentOptions.schema,
          model: agentOptions.model,
          isolation: agentOptions.isolation,
          agentType: agentOptions.agentType,
          signal: options.signal,
        }
        const result = await options.runner.run(request)
        throwIfAborted()
        state.spent += estimateTokens(result)
        options.onAgentEnd?.({ id, label, phase: assignedPhase, ok: true })
        return result
      } catch (error) {
        if (options.signal?.aborted) throw error
        log(`agent ${label} failed: ${error instanceof Error ? error.message : String(error)}`)
        options.onAgentEnd?.({ id, label, phase: assignedPhase, ok: false })
        return null
      }
    })
  }

  const parallel = async (thunks: Array<() => Promise<unknown>>) => {
    throwIfAborted()
    if (!Array.isArray(thunks)) throw new TypeError('parallel() expects an array of functions')
    if (thunks.some((thunk) => typeof thunk !== 'function')) {
      throw new TypeError('parallel() expects an array of functions, not promises. Wrap each call: () => agent(...)')
    }
    return Promise.all(
      thunks.map(async (thunk, index) => {
        try {
          return await thunk()
        } catch (error) {
          if (options.signal?.aborted) throw error
          log(`parallel[${index}] failed: ${error instanceof Error ? error.message : String(error)}`)
          return null
        }
      }),
    )
  }

  const pipeline = async (
    items: unknown[],
    ...stages: Array<(prev: unknown, original: unknown, index: number) => unknown>
  ) => {
    throwIfAborted()
    if (!Array.isArray(items)) throw new TypeError('pipeline() expects an array as the first argument')
    if (stages.some((stage) => typeof stage !== 'function')) {
      throw new TypeError('pipeline() stages must be functions: pipeline(items, item => ..., result => ...)')
    }
    return Promise.all(
      items.map(async (item, index) => {
        let value: unknown = item
        for (const stage of stages) {
          try {
            throwIfAborted()
            value = await stage(value, item, index)
            throwIfAborted()
          } catch (error) {
            if (options.signal?.aborted) throw error
            log(`pipeline[${index}] failed: ${error instanceof Error ? error.message : String(error)}`)
            return null
          }
        }
        return value
      }),
    )
  }

  const cwd = options.cwd ?? process.cwd()
  const context = vm.createContext({
    agent,
    parallel,
    pipeline,
    log,
    phase,
    args: options.args,
    cwd,
    process: Object.freeze({ cwd: () => cwd }),
    budget,
    console: {
      log,
      info: log,
      warn: (m: unknown) => log(`[warn] ${String(m)}`),
      error: (m: unknown) => log(`[error] ${String(m)}`),
    },
    JSON,
    Math: DETERMINISTIC_MATH,
    Date: DETERMINISTIC_DATE,
    Array,
    Object,
    String,
    Number,
    Boolean,
    Set,
    Map,
    Promise,
  })

  const wrapped = `(async () => {\n${body}\n})()`
  const result = await new vm.Script(wrapped, { filename: `${meta.name || 'workflow'}.js` }).runInContext(context)
  return {
    meta,
    result: result as T,
    logs: state.logs,
    phases: state.phases,
    agentCount: state.agentCount,
    durationMs: Date.now() - started,
  }
}

function createLimiter(limit: number) {
  let active = 0
  const queue: Array<() => void> = []
  const next = () => {
    active--
    queue.shift()?.()
  }
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    if (active >= limit) await new Promise<void>((resolve) => queue.push(resolve))
    active++
    try {
      return await fn()
    } finally {
      next()
    }
  }
}

function defaultAgentLabel(phase: string | undefined, index: number): string {
  return phase ? `${phase} agent ${index}` : `agent ${index}`
}

function estimateTokens(value: unknown): number {
  return Math.ceil(JSON.stringify(value ?? '').length / 4)
}
