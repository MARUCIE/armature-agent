/**
 * `orca serve` — Headless agent server.
 *
 * Exposes Orca as an HTTP API with SSE streaming.
 * Attach from another terminal with: curl -N http://localhost:PORT/chat -d '{"prompt":"..."}'
 *
 * Usage:
 *   orca serve                  Start on random port
 *   orca serve --port 9100      Start on specific port
 */

import { Command } from 'commander'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { listProviders, readEffectivePermissionAllowlist, replPermissionModeFromConfig, resolveConfig, resolveProvider } from '../config.js'
import { streamChat, chatOnce } from '../providers/openai-compat.js'
import { buildSystemPrompt } from '../system-prompt.js'
import { isAuthorizedRequest, resolveServeAuthToken } from '../policy-executor.js'
import { recordUsage } from '../usage-db.js'
import type { OrcaConfig } from '../config.js'
import { getModelChoice, formatContextWindow, formatPricing, getPricingForModel } from '../model-catalog.js'
import { gatherDoctorReport } from '../doctor.js'
import { EvolutionStore } from '../evolution/store.js'
import { observeRuntimeEvent } from '../evolution/observer.js'
import { logInfo, logWarning } from '../logger.js'
import { MCPServer } from '../mcp-server.js'
import {
  getLatestSavedSessionSummary,
  getSavedSessionDetailByName,
  listSavedSessionSummaries,
} from '../session-store.js'
import {
  createTaskRun,
  createWorkSession,
  finishTaskRun,
  getLatestWorkSessionSummary,
  getTaskRunDetailById,
  getWorkSessionDetailById,
  listTaskRunSummaries,
  listWorkSessionSummaries,
} from '../work-session-store.js'

export const MAX_CHAT_BODY_BYTES = 1024 * 1024
const LOOKUP_ID_PATTERN = /^[A-Za-z0-9._-]+$/

export interface ServerState {
  config: OrcaConfig
  resolved: ReturnType<typeof resolveProvider>
  cwd: string
  authToken?: string
}

export function resolveServeAuthTokenForHost(host: string, envToken = process.env.ORCA_SERVE_TOKEN): string | undefined {
  return resolveServeAuthToken(isLoopbackHost, host, envToken)
}

function decodeLookupId(rawSegment: string): string | null {
  try {
    const decoded = decodeURIComponent(rawSegment)
    return LOOKUP_ID_PATTERN.test(decoded) ? decoded : null
  } catch {
    return null
  }
}

function getServeModelMetadata(provider: string, model: string): Record<string, unknown> {
  const choice = getModelChoice(model, provider)
  return {
    provider,
    model,
    contextWindow: choice.contextWindow ?? null,
    maxOutput: choice.maxOutput ?? null,
    pricing: choice.pricing ?? null,
    contextLabel: formatContextWindow(choice.contextWindow),
    pricingLabel: formatPricing(choice.pricing),
    caution: choice.note || null,
  }
}

class RequestBodyTooLargeError extends Error {
  constructor(limitBytes: number) {
    super(`Request body too large (max ${limitBytes} bytes)`)
    this.name = 'RequestBodyTooLargeError'
  }
}

function parseBody(req: IncomingMessage, limitBytes: number): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let totalBytes = 0
    let settled = false

    req.on('data', chunk => {
      if (settled) return
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      totalBytes += buffer.length
      if (totalBytes > limitBytes) {
        settled = true
        reject(new RequestBodyTooLargeError(limitBytes))
        return
      }
      chunks.push(buffer)
    })
    req.on('end', () => {
      if (settled) return
      settled = true
      const data = Buffer.concat(chunks).toString('utf8')
      try { resolve(JSON.parse(data || '{}')) }
      catch { reject(new Error('Invalid JSON body')) }
    })
    req.on('error', err => {
      if (settled) return
      settled = true
      reject(err)
    })
  })
}

function getDeclaredContentLength(req: IncomingMessage): number | undefined {
  const raw = req.headers['content-length']
  const value = Array.isArray(raw) ? raw[0] : raw
  if (!value) return undefined
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
}

function cors(req: IncomingMessage, res: ServerResponse): void {
  const origin = req.headers.origin
  if (typeof origin === 'string' && isLoopbackOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

function isLoopbackOrigin(origin: string): boolean {
  try {
    const url = new URL(origin)
    return isLoopbackHost(url.hostname)
  } catch {
    return false
  }
}

function isLoopbackHost(host: string): boolean {
  return host === '127.0.0.1' || host === 'localhost' || host === '::1'
}

function isLoopbackRequest(req: IncomingMessage): boolean {
  const remote = req.socket.remoteAddress || ''
  return remote === '127.0.0.1'
    || remote === '::1'
    || remote === '::ffff:127.0.0.1'
}

function json(req: IncomingMessage, res: ServerResponse, status: number, data: unknown): void {
  cors(req, res)
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

function summarizeTaskPrompt(prompt: string): string {
  const normalized = prompt.replace(/\s+/g, ' ').trim()
  if (normalized.length <= 120) return normalized
  return `${normalized.slice(0, 117)}...`
}

async function handleChat(req: IncomingMessage, res: ServerResponse, state: ServerState): Promise<void> {
  const declaredContentLength = getDeclaredContentLength(req)
  if (declaredContentLength !== undefined && declaredContentLength > MAX_CHAT_BODY_BYTES) {
    req.resume()
    json(req, res, 413, { error: `Request body too large (max ${MAX_CHAT_BODY_BYTES} bytes)` })
    return
  }

  let body: Record<string, unknown>
  try {
    body = await parseBody(req, MAX_CHAT_BODY_BYTES)
  } catch (err) {
    if (err instanceof RequestBodyTooLargeError) {
      json(req, res, 413, { error: err.message })
      return
    }
    throw err
  }
  const prompt = (body.prompt as string) || ''
  const model = (body.model as string) || state.resolved.model
  const stream = body.stream !== false // default: streaming
  logInfo('serve chat request', { model, stream, cwd: state.cwd })

  if (!prompt) {
    json(req, res, 400, { error: 'Missing "prompt" field' })
    return
  }

  const workSession = createWorkSession({
    sourceSurface: 'serve',
    cwd: state.cwd,
    provider: state.resolved.provider,
    model,
  })
  const taskRun = createTaskRun({
    workSessionId: workSession.id,
    kind: 'run',
    title: summarizeTaskPrompt(prompt),
    surface: 'serve',
    cwd: state.cwd,
    provider: state.resolved.provider,
    model,
    summary: prompt,
  })

  if (!state.resolved.baseURL) {
    finishTaskRun(taskRun.id, {
      status: 'failed',
      summary: 'No baseURL configured for provider',
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        durationMs: 0,
      },
    })
    json(req, res, 500, {
      error: 'No baseURL configured for provider',
      workSessionId: workSession.id,
      taskRunId: taskRun.id,
    })
    return
  }

  if (!stream) {
    // Non-streaming: return full response
    const startTime = Date.now()
    try {
      const result = await chatOnce(
        { apiKey: state.resolved.apiKey, baseURL: state.resolved.baseURL, model },
        prompt,
      )
      const usageRef = recordUsage({
        provider: state.resolved.provider,
        model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costUsd: (() => { const p = getPricingForModel(model); return p ? (result.inputTokens * p[0] + result.outputTokens * p[1]) / 1_000_000 : 0 })(),
        durationMs: Date.now() - startTime,
        command: 'serve',
        cwd: state.cwd,
      })
      finishTaskRun(taskRun.id, {
        status: 'completed',
        summary: 'Serve chat completed',
        usage: {
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          costUsd: (() => { const p = getPricingForModel(model); return p ? (result.inputTokens * p[0] + result.outputTokens * p[1]) / 1_000_000 : 0 })(),
          durationMs: Date.now() - startTime,
          turns: 1,
        },
      })
      observeRuntimeEvent({
        category: 'serve',
        severity: 'info',
        summary: 'serve chat completed',
        details: `stream=false`,
        command: 'serve',
        provider: state.resolved.provider,
        model,
        cwd: state.cwd,
        evidence: {
          workSessionId: workSession.id,
          taskRunId: taskRun.id,
          usageRef: usageRef || undefined,
        },
      })
      logInfo('serve chat completed', { provider: state.resolved.provider, model, stream: false, inputTokens: result.inputTokens, outputTokens: result.outputTokens })
      json(req, res, 200, {
        text: result.text,
        model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        workSessionId: workSession.id,
        taskRunId: taskRun.id,
      })
    } catch (err) {
      logWarning('serve chat failed', { provider: state.resolved.provider, model, error: err instanceof Error ? err.message : String(err) })
      finishTaskRun(taskRun.id, {
        status: 'failed',
        summary: err instanceof Error ? err.message : String(err),
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
          durationMs: Date.now() - startTime,
          turns: 1,
        },
      })
      observeRuntimeEvent({
        category: 'serve',
        severity: 'error',
        summary: `serve chat failed: ${err instanceof Error ? err.message : String(err)}`,
        command: 'serve',
        provider: state.resolved.provider,
        model,
        cwd: state.cwd,
        evidence: {
          workSessionId: workSession.id,
          taskRunId: taskRun.id,
        },
      })
      json(req, res, 500, {
        error: err instanceof Error ? err.message : String(err),
        workSessionId: workSession.id,
        taskRunId: taskRun.id,
      })
    }
    return
  }

  // SSE streaming
  cors(req, res)
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  })

  const startTime = Date.now()
  let totalInput = 0
  let totalOutput = 0
  let failed = false
  let failureSummary = ''

  res.write(`data: ${JSON.stringify({
    type: 'metadata',
    workSessionId: workSession.id,
    taskRunId: taskRun.id,
    model,
  })}\n\n`)

  try {
    const events = streamChat(
      { apiKey: state.resolved.apiKey, baseURL: state.resolved.baseURL, model, systemPrompt: buildSystemPrompt(state.cwd) },
      prompt,
    )

    for await (const event of events) {
      if (event.type === 'text') {
        res.write(`data: ${JSON.stringify({ type: 'text', text: event.text })}\n\n`)
      } else if (event.type === 'usage') {
        totalInput = event.inputTokens || 0
        totalOutput = event.outputTokens || 0
        res.write(`data: ${JSON.stringify({ type: 'usage', inputTokens: totalInput, outputTokens: totalOutput })}\n\n`)
      } else if (event.type === 'error') {
        failed = true
        failureSummary = event.error || 'stream error'
        res.write(`data: ${JSON.stringify({ type: 'error', error: event.error })}\n\n`)
      } else if (event.type === 'done') {
        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
      }
    }
  } catch (err) {
    failed = true
    failureSummary = err instanceof Error ? err.message : String(err)
    logWarning('serve streaming chat failed', { provider: state.resolved.provider, model, error: err instanceof Error ? err.message : String(err) })
    observeRuntimeEvent({
      category: 'serve',
      severity: 'error',
      summary: `serve streaming chat failed: ${err instanceof Error ? err.message : String(err)}`,
      command: 'serve',
      provider: state.resolved.provider,
      model,
      cwd: state.cwd,
      evidence: {
        workSessionId: workSession.id,
        taskRunId: taskRun.id,
      },
    })
    res.write(`data: ${JSON.stringify({ type: 'error', error: err instanceof Error ? err.message : String(err) })}\n\n`)
  }

  const durationMs = Date.now() - startTime
  const costUsd = (() => { const p = getPricingForModel(model); return p ? (totalInput * p[0] + totalOutput * p[1]) / 1_000_000 : 0 })()
  const usageRef = recordUsage({
    provider: state.resolved.provider,
    model,
    inputTokens: totalInput,
    outputTokens: totalOutput,
    costUsd,
    durationMs,
    command: 'serve',
    cwd: state.cwd,
  })
  finishTaskRun(taskRun.id, {
    status: failed ? 'failed' : 'completed',
    summary: failed ? failureSummary || 'Serve streaming chat failed' : 'Serve streaming chat completed',
    usage: {
      inputTokens: totalInput,
      outputTokens: totalOutput,
      costUsd,
      durationMs,
      turns: 1,
    },
  })
  observeRuntimeEvent({
    category: 'serve',
    severity: failed ? 'warn' : 'info',
    summary: failed ? 'serve streaming chat failed' : 'serve streaming chat completed',
    details: `stream=true`,
    command: 'serve',
    provider: state.resolved.provider,
    model,
    cwd: state.cwd,
    evidence: {
      workSessionId: workSession.id,
      taskRunId: taskRun.id,
      usageRef: usageRef || undefined,
    },
  })
  logInfo('serve streaming chat completed', { provider: state.resolved.provider, model, stream: true, inputTokens: totalInput, outputTokens: totalOutput })

  res.write('data: [DONE]\n\n')
  res.end()
}

export function createOrcaHttpServer(state: ServerState) {
  return createServer(async (req, res) => {
    // CORS preflight
    if (req.method === 'OPTIONS') {
      cors(req, res)
      res.writeHead(204)
      res.end()
      return
    }

    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)

    try {
      if (!isAuthorizedRequest(req, state.authToken)) {
        cors(req, res)
        res.writeHead(401, {
          'Content-Type': 'application/json',
          'WWW-Authenticate': 'Bearer',
        })
        res.end(JSON.stringify({ error: 'Unauthorized' }))
        return
      }

      if (url.pathname === '/health') {
        json(req, res, 200, {
          status: 'ok',
          provider: state.resolved.provider,
          model: state.resolved.model,
          modelMetadata: getServeModelMetadata(state.resolved.provider, state.resolved.model),
        })
      } else if (url.pathname === '/work-sessions') {
        if (!isLoopbackRequest(req)) {
          json(req, res, 403, { error: 'Work-session metadata is available only from loopback clients' })
          return
        }
        json(req, res, 200, { workSessions: listWorkSessionSummaries() })
      } else if (url.pathname === '/evolution') {
        if (!isLoopbackRequest(req)) {
          json(req, res, 403, { error: 'Evolution metadata is available only from loopback clients' })
          return
        }
        json(req, res, 200, new EvolutionStore().getOverview())
      } else if (url.pathname === '/evolution/candidates') {
        if (!isLoopbackRequest(req)) {
          json(req, res, 403, { error: 'Evolution metadata is available only from loopback clients' })
          return
        }
        const kind = url.searchParams.get('kind') as 'prompt' | 'rule' | 'test-hint' | null
        const status = url.searchParams.get('status') as 'draft' | 'verified' | 'promoted' | 'rejected' | null
        const limit = Number.parseInt(url.searchParams.get('limit') || '20', 10)
        json(req, res, 200, {
          candidates: new EvolutionStore().listCandidateSummaries({
            kind: kind || undefined,
            status: status || undefined,
            limit: Number.isFinite(limit) && limit > 0 ? limit : 20,
          }),
        })
      } else if (url.pathname === '/work-sessions/latest') {
        if (!isLoopbackRequest(req)) {
          json(req, res, 403, { error: 'Work-session metadata is available only from loopback clients' })
          return
        }
        const latest = getLatestWorkSessionSummary()
        if (!latest) {
          json(req, res, 404, { error: 'No work sessions' })
          return
        }
        json(req, res, 200, latest)
      } else if (url.pathname.startsWith('/work-sessions/') && url.pathname.endsWith('/task-runs')) {
        if (!isLoopbackRequest(req)) {
          json(req, res, 403, { error: 'Work-session metadata is available only from loopback clients' })
          return
        }
        const id = decodeLookupId(url.pathname.slice('/work-sessions/'.length, -'/task-runs'.length))
        if (!id) {
          json(req, res, 404, { error: 'Not found' })
          return
        }
        const detail = getWorkSessionDetailById(id)
        if (!detail) {
          json(req, res, 404, { error: `Work session "${id}" not found` })
          return
        }
        json(req, res, 200, { workSessionId: id, taskRuns: listTaskRunSummaries(id) })
      } else if (url.pathname.startsWith('/work-sessions/')) {
        if (!isLoopbackRequest(req)) {
          json(req, res, 403, { error: 'Work-session metadata is available only from loopback clients' })
          return
        }
        const id = decodeLookupId(url.pathname.slice('/work-sessions/'.length))
        if (!id) {
          json(req, res, 404, { error: 'Not found' })
          return
        }
        const detail = getWorkSessionDetailById(id)
        if (!detail) {
          json(req, res, 404, { error: `Work session "${id}" not found` })
          return
        }
        json(req, res, 200, detail)
      } else if (url.pathname === '/sessions') {
        if (!isLoopbackRequest(req)) {
          json(req, res, 403, { error: 'Session metadata is available only from loopback clients' })
          return
        }
        json(req, res, 200, { sessions: listSavedSessionSummaries() })
      } else if (url.pathname === '/sessions/latest') {
        if (!isLoopbackRequest(req)) {
          json(req, res, 403, { error: 'Session metadata is available only from loopback clients' })
          return
        }
        const latest = getLatestSavedSessionSummary()
        if (!latest) {
          json(req, res, 404, { error: 'No saved sessions' })
          return
        }
        json(req, res, 200, latest)
      } else if (url.pathname.startsWith('/sessions/')) {
        if (!isLoopbackRequest(req)) {
          json(req, res, 403, { error: 'Session metadata is available only from loopback clients' })
          return
        }
        const id = decodeLookupId(url.pathname.slice('/sessions/'.length))
        if (!id) {
          json(req, res, 404, { error: 'Not found' })
          return
        }
        const detail = getSavedSessionDetailByName(id)
        if (!detail) {
          json(req, res, 404, { error: `Session "${id}" not found` })
          return
        }
        json(req, res, 200, detail)
      } else if (url.pathname === '/task-runs') {
        if (!isLoopbackRequest(req)) {
          json(req, res, 403, { error: 'Task-run metadata is available only from loopback clients' })
          return
        }
        json(req, res, 200, { taskRuns: listTaskRunSummaries() })
      } else if (url.pathname.startsWith('/task-runs/')) {
        if (!isLoopbackRequest(req)) {
          json(req, res, 403, { error: 'Task-run metadata is available only from loopback clients' })
          return
        }
        const id = decodeLookupId(url.pathname.slice('/task-runs/'.length))
        if (!id) {
          json(req, res, 404, { error: 'Not found' })
          return
        }
        const detail = getTaskRunDetailById(id)
        if (!detail) {
          json(req, res, 404, { error: `Task run "${id}" not found` })
          return
        }
        json(req, res, 200, detail)
      } else if (url.pathname === '/doctor') {
        json(req, res, 200, gatherDoctorReport(state.cwd))
      } else if (url.pathname === '/chat' && req.method === 'POST') {
        await handleChat(req, res, state)
      } else if (url.pathname === '/providers') {
        const providers = listProviders(state.config).map((provider) => ({
          ...provider,
          modelMetadata: getServeModelMetadata(provider.id, provider.model),
        }))
        json(req, res, 200, { providers, default: state.resolved.provider })
      } else {
        json(req, res, 404, { error: 'Not found. Endpoints: POST /chat, GET /health, GET /providers, GET /doctor, GET /sessions, GET /sessions/latest, GET /sessions/:id, GET /work-sessions, GET /work-sessions/latest, GET /work-sessions/:id, GET /work-sessions/:id/task-runs, GET /task-runs, GET /task-runs/:id' })
      }
    } catch (err) {
      logWarning('serve request failed', {
        path: url.pathname,
        method: req.method,
        error: err instanceof Error ? err.message : String(err),
      })
      json(req, res, 500, { error: err instanceof Error ? err.message : String(err) })
    }
  })
}

export function createServeCommand(): Command {
  return new Command('serve')
    .description('Start headless agent server (HTTP + SSE)')
    .option('--port <port>', 'Port to listen on', '0')
    .option('--host <host>', 'Hostname to bind', '127.0.0.1')
    .option('--mcp', 'Start as MCP server over stdio instead of HTTP')
    .option('-m, --model <model>', 'Default model')
    .option('-p, --provider <provider>', 'Provider')
    .action(async (opts: { port: string; host: string; mcp?: boolean; model?: string; provider?: string }) => {
      const flags: Record<string, unknown> = {}
      if (opts.model) flags.model = opts.model
      if (opts.provider) flags.provider = opts.provider

      const config = resolveConfig({ cwd: process.cwd(), flags })
      const resolved = resolveProvider(config)
      const cwd = process.cwd()

      if (opts.mcp) {
        const persistedPermissionAllowlist = new Set(readEffectivePermissionAllowlist(cwd))
        const mcp = new MCPServer(cwd, {
          permissionMode: replPermissionModeFromConfig(config.permissionMode),
          allowedTools: config.tools,
          isPermissionGranted: (ruleKey) => persistedPermissionAllowlist.has(ruleKey),
        })
        process.stderr.write('Orca MCP server started (stdio mode)\n')
        mcp.start()
        return
      }

      const authToken = resolveServeAuthTokenForHost(opts.host)
      const state: ServerState = { config, resolved, cwd, authToken }
      const server = createOrcaHttpServer(state)

      const port = parseInt(opts.port, 10) || 0
      server.listen(port, opts.host, () => {
        const addr = server.address()
        const actualPort = typeof addr === 'object' ? addr?.port : port
        logInfo('serve server started', { host: opts.host, port: actualPort, provider: resolved.provider, model: resolved.model })
        console.log()
        console.log(`  \x1b[1mOrca Server\x1b[0m`)
        console.log(`  \x1b[90m${resolved.provider}/${resolved.model}\x1b[0m`)
        const metadata = getServeModelMetadata(resolved.provider, resolved.model)
        console.log(`  \x1b[90mctx ${metadata.contextLabel} · ${metadata.pricingLabel}/1M in/out${metadata.caution ? ` · caution` : ''}\x1b[0m`)
        console.log()
        console.log(`  \x1b[36mhttp://${opts.host}:${actualPort}\x1b[0m`)
        console.log()
        console.log(`  \x1b[90mEndpoints:\x1b[0m`)
        console.log(`  \x1b[90m  POST /chat          Send prompt (SSE streaming)\x1b[0m`)
        console.log(`  \x1b[90m  GET  /health         Server status\x1b[0m`)
        console.log(`  \x1b[90m  GET  /providers      List providers\x1b[0m`)
        console.log(`  \x1b[90m  GET  /doctor         Runtime diagnostics\x1b[0m`)
        console.log(`  \x1b[90m  GET  /sessions       Saved session summaries\x1b[0m`)
        console.log(`  \x1b[90m  GET  /sessions/latest Latest saved session summary\x1b[0m`)
        console.log(`  \x1b[90m  GET  /sessions/:id   Saved session detail (loopback only)\x1b[0m`)
        console.log(`  \x1b[90m  GET  /work-sessions  Work session summaries (loopback only)\x1b[0m`)
        console.log(`  \x1b[90m  GET  /work-sessions/latest Latest work session summary (loopback only)\x1b[0m`)
        console.log(`  \x1b[90m  GET  /work-sessions/:id Work session detail (loopback only)\x1b[0m`)
        console.log(`  \x1b[90m  GET  /work-sessions/:id/task-runs Task runs for a work session (loopback only)\x1b[0m`)
        console.log(`  \x1b[90m  GET  /task-runs      Task run summaries (loopback only)\x1b[0m`)
        console.log(`  \x1b[90m  GET  /task-runs/:id  Task run detail (loopback only)\x1b[0m`)
        if (authToken) {
          console.log(`  \x1b[90mAuth: Bearer token required for HTTP requests\x1b[0m`)
        }
        console.log()
        console.log(`  \x1b[90mTest: curl -N http://${opts.host}:${actualPort}/chat -d '{"prompt":"hello"}'\x1b[0m`)
        console.log()
      })
    })
}
