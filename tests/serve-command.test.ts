import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const mockOpenAI = vi.hoisted(() => ({
  responses: [] as Array<() => unknown>,
  params: [] as Array<Record<string, unknown>>,
}))

vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = {
      completions: {
        create: async (params: Record<string, unknown>) => {
          mockOpenAI.params.push(params)
          const factory = mockOpenAI.responses.shift()
          if (!factory) throw new Error('No more mock responses')
          return factory()
        },
      },
    }
  },
}))

import {
  MAX_CHAT_BODY_BYTES,
  createOrcaHttpServer,
  resolveServeAuthTokenForHost,
  type ServerState,
} from '../src/commands/serve.js'
import type { OrcaConfig } from '../src/config.js'
import { EvolutionStore } from '../src/evolution/store.js'
import {
  createTaskRun,
  createWorkSession,
  finishTaskRun,
  getTaskRunById,
  getWorkSessionById,
} from '../src/work-session-store.js'

async function* makeOpenAIStream(chunks: Array<Record<string, unknown>>) {
  for (const chunk of chunks) yield chunk
}

describe('serve command http server', () => {
  const previousHome = process.env.HOME
  const previousOrcaHome = process.env.ORCA_HOME
  const previousOrcaProvider = process.env.ORCA_PROVIDER
  const previousOpenAIKey = process.env.OPENAI_API_KEY
  let homeDir: string
  let projectDir: string

  beforeEach(() => {
    mockOpenAI.responses.length = 0
    mockOpenAI.params.length = 0
    homeDir = join(tmpdir(), `orca-serve-home-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
    projectDir = join(tmpdir(), `orca-serve-project-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
    mkdirSync(homeDir, { recursive: true })
    mkdirSync(projectDir, { recursive: true })
    process.env.HOME = homeDir
    process.env.ORCA_HOME = join(homeDir, '.orca')
    process.env.ORCA_PROVIDER = 'openai'
    process.env.OPENAI_API_KEY = 'test-openai-key'
    mkdirSync(join(homeDir, '.orca', 'sessions'), { recursive: true })
    writeFileSync(join(projectDir, 'package.json'), JSON.stringify({ name: 'serve-test', devDependencies: { vitest: '^1.0.0' } }))
  })

  afterEach(() => {
    if (previousHome === undefined) delete process.env.HOME
    else process.env.HOME = previousHome
    if (previousOrcaHome === undefined) delete process.env.ORCA_HOME
    else process.env.ORCA_HOME = previousOrcaHome
    if (previousOrcaProvider === undefined) delete process.env.ORCA_PROVIDER
    else process.env.ORCA_PROVIDER = previousOrcaProvider
    if (previousOpenAIKey === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = previousOpenAIKey
    try { rmSync(homeDir, { recursive: true, force: true }) } catch { /* ignore */ }
    try { rmSync(projectDir, { recursive: true, force: true }) } catch { /* ignore */ }
  })

  it('serves health, providers, and doctor metadata', async () => {
    const config: OrcaConfig = {
      providers: {
        openai: {
          apiKey: 'test-openai-key',
          baseURL: 'https://api.openai.com/v1/',
          models: ['gpt-5.4'],
          defaultModel: 'gpt-5.4',
          disabled: false,
          aggregator: false,
        },
      },
      defaultProvider: 'openai',
      defaultModel: 'gpt-5.4',
      multiModel: {},
      maxTurns: 25,
      permissionMode: 'default',
    }

    const state: ServerState = {
      config,
      resolved: {
        provider: 'openai',
        apiKey: 'test-openai-key',
        model: 'gpt-5.4',
        baseURL: 'https://api.openai.com/v1/',
        sdkProvider: 'openai',
      },
      cwd: projectDir,
    }

    const server = createOrcaHttpServer(state)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0

    try {
      const health = await fetch(`http://127.0.0.1:${port}/health`).then((r) => r.json())
      expect(health.status).toBe('ok')
      expect(health.sessionCount).toBeUndefined()
      expect(health.latestSession).toBeUndefined()
      expect(health.modelMetadata.model).toBe('gpt-5.4')
      expect(health.modelMetadata.contextWindow).toBe(256000)

      const providers = await fetch(`http://127.0.0.1:${port}/providers`).then((r) => r.json())
      expect(providers.default).toBe('openai')
      expect(providers.providers[0].modelMetadata.model).toBe('gpt-5.4')

      const doctor = await fetch(`http://127.0.0.1:${port}/doctor`).then((r) => r.json())
      expect(doctor.project.name).toBe('serve-test')
      expect(doctor.provider.activeProvider).toBe('openai')
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()))
    }
  })

  it('does not grant wildcard CORS to non-loopback origins', async () => {
    const config: OrcaConfig = {
      providers: {
        openai: {
          apiKey: 'test-openai-key',
          baseURL: 'https://api.openai.com/v1/',
          models: ['gpt-5.4'],
          defaultModel: 'gpt-5.4',
          disabled: false,
          aggregator: false,
        },
      },
      defaultProvider: 'openai',
      defaultModel: 'gpt-5.4',
      multiModel: {},
      maxTurns: 25,
      permissionMode: 'default',
    }

    const state: ServerState = {
      config,
      resolved: {
        provider: 'openai',
        apiKey: 'test-openai-key',
        model: 'gpt-5.4',
        baseURL: 'https://api.openai.com/v1/',
        sdkProvider: 'openai',
      },
      cwd: projectDir,
    }

    const server = createOrcaHttpServer(state)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0

    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, {
        headers: { Origin: 'https://evil.example' },
      })
      expect(response.headers.get('access-control-allow-origin')).toBeNull()
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()))
    }
  })

  it('serves saved session summaries through dedicated continuity endpoints', async () => {
    writeFileSync(join(homeDir, '.orca', 'sessions', 'session-a.json'), JSON.stringify({
      provider: 'openai',
      model: 'gpt-5.4',
      modeId: 'review',
      history: [{ role: 'user', content: 'hello' }],
      stats: { turns: 2, inputTokens: 10, outputTokens: 20 },
      savedAt: '2026-04-21T00:00:00.000Z',
    }))

    const config: OrcaConfig = {
      providers: {
        openai: {
          apiKey: 'test-openai-key',
          baseURL: 'https://api.openai.com/v1/',
          models: ['gpt-5.4'],
          defaultModel: 'gpt-5.4',
          disabled: false,
          aggregator: false,
        },
      },
      defaultProvider: 'openai',
      defaultModel: 'gpt-5.4',
      multiModel: {},
      maxTurns: 25,
      permissionMode: 'default',
    }

    const state: ServerState = {
      config,
      resolved: {
        provider: 'openai',
        apiKey: 'test-openai-key',
        model: 'gpt-5.4',
        baseURL: 'https://api.openai.com/v1/',
        sdkProvider: 'openai',
      },
      cwd: projectDir,
    }

    const server = createOrcaHttpServer(state)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0

    try {
      const sessions = await fetch(`http://127.0.0.1:${port}/sessions`).then((r) => r.json())
      expect(sessions.sessions).toHaveLength(1)
      expect(sessions.sessions[0]).toMatchObject({
        id: 'session-a',
        model: 'gpt-5.4',
        modeId: 'review',
        turns: 2,
      })

      const latest = await fetch(`http://127.0.0.1:${port}/sessions/latest`).then((r) => r.json())
      expect(latest).toMatchObject({
        id: 'session-a',
        model: 'gpt-5.4',
        modeId: 'review',
      })

      const detail = await fetch(`http://127.0.0.1:${port}/sessions/session-a`).then((r) => r.json())
      expect(detail).toMatchObject({
        id: 'session-a',
        session: {
          model: 'gpt-5.4',
          modeId: 'review',
          stats: { turns: 2, inputTokens: 10, outputTokens: 20 },
        },
      })
      expect(detail.session.history).toEqual([{ role: 'user', content: 'hello' }])
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()))
    }
  })

  it('serves evolution summaries and candidate feeds on loopback endpoints', async () => {
    const store = new EvolutionStore()
    store.observe({
      category: 'chat',
      severity: 'warn',
      summary: 'context pressure triggered auto-compact',
      cwd: projectDir,
      evidence: { sessionId: 'session-a' },
    })
    store.observe({
      category: 'chat',
      severity: 'warn',
      summary: 'context pressure triggered auto-compact',
      cwd: projectDir,
      evidence: { sessionId: 'session-b' },
    })

    const config: OrcaConfig = {
      providers: {
        openai: {
          apiKey: 'test-openai-key',
          baseURL: 'https://api.openai.com/v1/',
          models: ['gpt-5.4'],
          defaultModel: 'gpt-5.4',
          disabled: false,
          aggregator: false,
        },
      },
      defaultProvider: 'openai',
      defaultModel: 'gpt-5.4',
      multiModel: {},
      maxTurns: 25,
      permissionMode: 'default',
    }

    const state: ServerState = {
      config,
      resolved: {
        provider: 'openai',
        apiKey: 'test-openai-key',
        model: 'gpt-5.4',
        baseURL: 'https://api.openai.com/v1/',
        sdkProvider: 'openai',
      },
      cwd: projectDir,
    }

    const server = createOrcaHttpServer(state)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0

    try {
      const evolution = await fetch(`http://127.0.0.1:${port}/evolution`).then((r) => r.json())
      expect(evolution.observations).toBeGreaterThanOrEqual(2)
      expect(evolution.candidates.draft).toBeGreaterThanOrEqual(1)
      expect(evolution.recentCandidates[0].content).toBeUndefined()
      expect(evolution.recentObservations[0].details).toBeUndefined()

      const candidates = await fetch(`http://127.0.0.1:${port}/evolution/candidates?kind=prompt`).then((r) => r.json())
      expect(candidates.candidates[0]).toMatchObject({
        kind: 'prompt',
        status: 'draft',
      })
      expect(candidates.candidates[0].content).toBeUndefined()
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()))
    }
  })

  it('returns 404 for a missing saved-session detail lookup', async () => {
    const config: OrcaConfig = {
      providers: {
        openai: {
          apiKey: 'test-openai-key',
          baseURL: 'https://api.openai.com/v1/',
          models: ['gpt-5.4'],
          defaultModel: 'gpt-5.4',
          disabled: false,
          aggregator: false,
        },
      },
      defaultProvider: 'openai',
      defaultModel: 'gpt-5.4',
      multiModel: {},
      maxTurns: 25,
      permissionMode: 'default',
    }

    const state: ServerState = {
      config,
      resolved: {
        provider: 'openai',
        apiKey: 'test-openai-key',
        model: 'gpt-5.4',
        baseURL: 'https://api.openai.com/v1/',
        sdkProvider: 'openai',
      },
      cwd: projectDir,
    }

    const server = createOrcaHttpServer(state)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0

    try {
      const response = await fetch(`http://127.0.0.1:${port}/sessions/missing`)
      expect(response.status).toBe(404)
      await expect(response.json()).resolves.toMatchObject({ error: 'Session "missing" not found' })
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()))
    }
  })

  it('serves work-session summaries, latest item, detail, and related task runs', async () => {
    const workSession = createWorkSession({
      sourceSurface: 'run',
      cwd: projectDir,
      provider: 'openai',
      model: 'gpt-5.4',
    })
    const taskRun = createTaskRun({
      workSessionId: workSession.id,
      kind: 'run',
      title: 'Run smoke task',
      surface: 'cli',
      cwd: projectDir,
      provider: 'openai',
      model: 'gpt-5.4',
    })
    finishTaskRun(taskRun.id, {
      status: 'completed',
      summary: 'Run completed',
      usage: {
        inputTokens: 10,
        outputTokens: 20,
        costUsd: 0.001,
        durationMs: 1200,
        turns: 1,
        toolCalls: 2,
      },
    })

    const config: OrcaConfig = {
      providers: {
        openai: {
          apiKey: 'test-openai-key',
          baseURL: 'https://api.openai.com/v1/',
          models: ['gpt-5.4'],
          defaultModel: 'gpt-5.4',
          disabled: false,
          aggregator: false,
        },
      },
      defaultProvider: 'openai',
      defaultModel: 'gpt-5.4',
      multiModel: {},
      maxTurns: 25,
      permissionMode: 'default',
    }

    const state: ServerState = {
      config,
      resolved: {
        provider: 'openai',
        apiKey: 'test-openai-key',
        model: 'gpt-5.4',
        baseURL: 'https://api.openai.com/v1/',
        sdkProvider: 'openai',
      },
      cwd: projectDir,
    }

    const server = createOrcaHttpServer(state)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0

    try {
      const sessions = await fetch(`http://127.0.0.1:${port}/work-sessions`).then((r) => r.json())
      expect(sessions.workSessions).toHaveLength(1)
      expect(sessions.workSessions[0]).toMatchObject({
        id: workSession.id,
        provider: 'openai',
        model: 'gpt-5.4',
        latestTaskRunId: taskRun.id,
        taskRunCount: 1,
      })

      const latest = await fetch(`http://127.0.0.1:${port}/work-sessions/latest`).then((r) => r.json())
      expect(latest).toMatchObject({
        id: workSession.id,
        latestTaskRunId: taskRun.id,
      })

      const detail = await fetch(`http://127.0.0.1:${port}/work-sessions/${workSession.id}`).then((r) => r.json())
      expect(detail).toMatchObject({
        id: workSession.id,
        session: {
          status: 'completed',
          latestTaskRunId: taskRun.id,
        },
      })

      const taskRuns = await fetch(`http://127.0.0.1:${port}/work-sessions/${workSession.id}/task-runs`).then((r) => r.json())
      expect(taskRuns.workSessionId).toBe(workSession.id)
      expect(taskRuns.taskRuns).toHaveLength(1)
      expect(taskRuns.taskRuns[0]).toMatchObject({
        id: taskRun.id,
        workSessionId: workSession.id,
        status: 'completed',
      })

      const taskRunDetail = await fetch(`http://127.0.0.1:${port}/task-runs/${taskRun.id}`).then((r) => r.json())
      expect(taskRunDetail).toMatchObject({
        id: taskRun.id,
        taskRun: {
          workSessionId: workSession.id,
          status: 'completed',
          usage: {
            inputTokens: 10,
            outputTokens: 20,
          },
        },
      })
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()))
    }
  })

  it('returns 404 for missing work-session and task-run lookups', async () => {
    const config: OrcaConfig = {
      providers: {
        openai: {
          apiKey: 'test-openai-key',
          baseURL: 'https://api.openai.com/v1/',
          models: ['gpt-5.4'],
          defaultModel: 'gpt-5.4',
          disabled: false,
          aggregator: false,
        },
      },
      defaultProvider: 'openai',
      defaultModel: 'gpt-5.4',
      multiModel: {},
      maxTurns: 25,
      permissionMode: 'default',
    }

    const state: ServerState = {
      config,
      resolved: {
        provider: 'openai',
        apiKey: 'test-openai-key',
        model: 'gpt-5.4',
        baseURL: 'https://api.openai.com/v1/',
        sdkProvider: 'openai',
      },
      cwd: projectDir,
    }

    const server = createOrcaHttpServer(state)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0

    try {
      const missingSession = await fetch(`http://127.0.0.1:${port}/work-sessions/missing`)
      expect(missingSession.status).toBe(404)
      await expect(missingSession.json()).resolves.toMatchObject({ error: 'Work session "missing" not found' })

      const missingTaskRun = await fetch(`http://127.0.0.1:${port}/task-runs/missing`)
      expect(missingTaskRun.status).toBe(404)
      await expect(missingTaskRun.json()).resolves.toMatchObject({ error: 'Task run "missing" not found' })

      const invalidSession = await fetch(`http://127.0.0.1:${port}/sessions/%2e%2e%2fshadow`)
      expect(invalidSession.status).toBe(404)

      const invalidWorkSession = await fetch(`http://127.0.0.1:${port}/work-sessions/%2e%2e%2fshadow`)
      expect(invalidWorkSession.status).toBe(404)

      const invalidTaskRun = await fetch(`http://127.0.0.1:${port}/task-runs/%2e%2e%2fshadow`)
      expect(invalidTaskRun.status).toBe(404)
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()))
    }
  })

  it('persists non-streaming chat requests as serve TaskRuns', async () => {
    mockOpenAI.responses.push(() => Promise.resolve({
      choices: [{ message: { content: 'ok' } }],
      usage: { prompt_tokens: 7, completion_tokens: 3 },
    }))

    const config: OrcaConfig = {
      providers: {
        openai: {
          apiKey: 'test-openai-key',
          baseURL: 'https://api.openai.com/v1/',
          models: ['gpt-5.4'],
          defaultModel: 'gpt-5.4',
          disabled: false,
          aggregator: false,
        },
      },
      defaultProvider: 'openai',
      defaultModel: 'gpt-5.4',
      multiModel: {},
      maxTurns: 25,
      permissionMode: 'default',
    }

    const state: ServerState = {
      config,
      resolved: {
        provider: 'openai',
        apiKey: 'test-openai-key',
        model: 'gpt-5.4',
        baseURL: 'https://api.openai.com/v1/',
        sdkProvider: 'openai',
      },
      cwd: projectDir,
    }

    const server = createOrcaHttpServer(state)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0

    try {
      const response = await fetch(`http://127.0.0.1:${port}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'Say ok', stream: false }),
      })
      expect(response.status).toBe(200)
      const payload = await response.json()
      expect(payload).toMatchObject({
        text: 'ok',
        model: 'gpt-5.4',
        inputTokens: 7,
        outputTokens: 3,
      })
      expect(payload.workSessionId).toMatch(/^ws-/)
      expect(payload.taskRunId).toMatch(/^tr-/)

      const taskRun = getTaskRunById(payload.taskRunId)
      expect(taskRun?.taskRun).toMatchObject({
        id: payload.taskRunId,
        workSessionId: payload.workSessionId,
        status: 'completed',
        surface: 'serve',
        kind: 'run',
        provider: 'openai',
        model: 'gpt-5.4',
        summary: 'Serve chat completed',
        usage: { inputTokens: 7, outputTokens: 3, turns: 1 },
      })
      const workSession = getWorkSessionById(payload.workSessionId)
      expect(workSession?.session).toMatchObject({
        id: payload.workSessionId,
        sourceSurface: 'serve',
        status: 'completed',
        latestTaskRunId: payload.taskRunId,
      })
      expect(mockOpenAI.params.at(-1)?.messages).toEqual([
        { role: 'user', content: 'Say ok' },
      ])
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()))
    }
  })

  it('emits TaskRun metadata for streaming chat requests', async () => {
    mockOpenAI.responses.push(() => makeOpenAIStream([
      { choices: [{ delta: { content: 'hi' } }] },
      { choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 5, completion_tokens: 2 } },
    ]))

    const config: OrcaConfig = {
      providers: {
        openai: {
          apiKey: 'test-openai-key',
          baseURL: 'https://api.openai.com/v1/',
          models: ['gpt-5.4'],
          defaultModel: 'gpt-5.4',
          disabled: false,
          aggregator: false,
        },
      },
      defaultProvider: 'openai',
      defaultModel: 'gpt-5.4',
      multiModel: {},
      maxTurns: 25,
      permissionMode: 'default',
    }

    const state: ServerState = {
      config,
      resolved: {
        provider: 'openai',
        apiKey: 'test-openai-key',
        model: 'gpt-5.4',
        baseURL: 'https://api.openai.com/v1/',
        sdkProvider: 'openai',
      },
      cwd: projectDir,
    }

    const server = createOrcaHttpServer(state)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0

    try {
      const response = await fetch(`http://127.0.0.1:${port}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'Stream hi' }),
      })
      expect(response.status).toBe(200)
      const text = await response.text()
      const events = text
        .split('\n\n')
        .filter((line) => line.startsWith('data: ') && line !== 'data: [DONE]')
        .map((line) => JSON.parse(line.slice('data: '.length)))
      const metadata = events.find((event) => event.type === 'metadata')
      expect(metadata).toMatchObject({
        model: 'gpt-5.4',
      })
      expect(metadata.workSessionId).toMatch(/^ws-/)
      expect(metadata.taskRunId).toMatch(/^tr-/)
      expect(events).toContainEqual({ type: 'text', text: 'hi' })
      expect(events).toContainEqual({ type: 'usage', inputTokens: 5, outputTokens: 2 })

      const taskRun = getTaskRunById(metadata.taskRunId)
      expect(taskRun?.taskRun).toMatchObject({
        status: 'completed',
        surface: 'serve',
        usage: { inputTokens: 5, outputTokens: 2, turns: 1 },
      })
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()))
    }
  })

  it('returns explicit errors for malformed and incomplete chat requests', async () => {
    const config: OrcaConfig = {
      providers: {
        openai: {
          apiKey: 'test-openai-key',
          baseURL: 'https://api.openai.com/v1/',
          models: ['gpt-5.4'],
          defaultModel: 'gpt-5.4',
          disabled: false,
          aggregator: false,
        },
      },
      defaultProvider: 'openai',
      defaultModel: 'gpt-5.4',
      multiModel: {},
      maxTurns: 25,
      permissionMode: 'default',
    }

    const state: ServerState = {
      config,
      resolved: {
        provider: 'openai',
        apiKey: 'test-openai-key',
        model: 'gpt-5.4',
        baseURL: 'https://api.openai.com/v1/',
        sdkProvider: 'openai',
      },
      cwd: projectDir,
    }

    const server = createOrcaHttpServer(state)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0

    try {
      const missingPrompt = await fetch(`http://127.0.0.1:${port}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      expect(missingPrompt.status).toBe(400)
      await expect(missingPrompt.json()).resolves.toMatchObject({ error: 'Missing "prompt" field' })

      const malformedBody = await fetch(`http://127.0.0.1:${port}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{ invalid json',
      })
      expect(malformedBody.status).toBe(500)
      await expect(malformedBody.json()).resolves.toMatchObject({ error: 'Invalid JSON body' })

      const oversizedPrompt = 'x'.repeat(MAX_CHAT_BODY_BYTES)
      const oversizedBody = await fetch(`http://127.0.0.1:${port}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: oversizedPrompt }),
      })
      expect(oversizedBody.status).toBe(413)
      await expect(oversizedBody.json()).resolves.toMatchObject({
        error: `Request body too large (max ${MAX_CHAT_BODY_BYTES} bytes)`,
      })
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()))
    }
  })

  it('requires a bearer token when the server is configured with ORCA_SERVE_TOKEN', async () => {
    const config: OrcaConfig = {
      providers: {
        openai: {
          apiKey: 'test-openai-key',
          baseURL: 'https://api.openai.com/v1/',
          models: ['gpt-5.4'],
          defaultModel: 'gpt-5.4',
          disabled: false,
          aggregator: false,
        },
      },
      defaultProvider: 'openai',
      defaultModel: 'gpt-5.4',
      multiModel: {},
      maxTurns: 25,
      permissionMode: 'default',
    }

    const state: ServerState = {
      config,
      resolved: {
        provider: 'openai',
        apiKey: 'test-openai-key',
        model: 'gpt-5.4',
        baseURL: 'https://api.openai.com/v1/',
        sdkProvider: 'openai',
      },
      cwd: projectDir,
      authToken: 'serve-secret',
    }

    const server = createOrcaHttpServer(state)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0

    try {
      const unauthorized = await fetch(`http://127.0.0.1:${port}/providers`)
      expect(unauthorized.status).toBe(401)
      await expect(unauthorized.json()).resolves.toMatchObject({ error: 'Unauthorized' })

      const authorized = await fetch(`http://127.0.0.1:${port}/providers`, {
        headers: { Authorization: 'Bearer serve-secret' },
      }).then((r) => r.json())
      expect(authorized.default).toBe('openai')
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()))
    }
  })

  it('requires ORCA_SERVE_TOKEN for non-loopback bindings', () => {
    expect(() => resolveServeAuthTokenForHost('0.0.0.0', undefined)).toThrow('Remote serve requires ORCA_SERVE_TOKEN')
    expect(resolveServeAuthTokenForHost('0.0.0.0', 'token-123')).toBe('token-123')
    expect(resolveServeAuthTokenForHost('127.0.0.1', undefined)).toBeUndefined()
  })
})
