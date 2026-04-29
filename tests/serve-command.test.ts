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

import { createOrcaHttpServer, type ServerState } from '../src/commands/serve.js'
import type { OrcaConfig } from '../src/config.js'
import { getTaskRunById, getWorkSessionById } from '../src/work-session-store.js'

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
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()))
    }
  })
})
