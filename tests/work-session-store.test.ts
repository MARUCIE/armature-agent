import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('work-session store', () => {
  const previousHome = process.env.HOME
  const previousOrcaHome = process.env.ORCA_HOME
  let homeDir: string
  let orcaHome: string

  beforeEach(() => {
    homeDir = join(tmpdir(), `orca-work-session-home-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
    orcaHome = join(tmpdir(), `orca-work-session-store-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
    mkdirSync(homeDir, { recursive: true })
    mkdirSync(orcaHome, { recursive: true })
    process.env.HOME = homeDir
    process.env.ORCA_HOME = orcaHome
  })

  afterEach(() => {
    if (previousHome === undefined) delete process.env.HOME
    else process.env.HOME = previousHome
    if (previousOrcaHome === undefined) delete process.env.ORCA_HOME
    else process.env.ORCA_HOME = previousOrcaHome
    try { rmSync(homeDir, { recursive: true, force: true }) } catch { /* ignore */ }
    try { rmSync(orcaHome, { recursive: true, force: true }) } catch { /* ignore */ }
  })

  it('returns the latest valid work session when the newest record is corrupt', async () => {
    const {
      createWorkSession,
      getLatestWorkSession,
      getWorkSessionsDir,
    } = await import('../src/work-session-store.js')

    const older = createWorkSession({
      sourceSurface: 'run',
      cwd: '/tmp/project-a',
      provider: 'openai',
      model: 'gpt-5.4',
    })

    const olderPath = join(getWorkSessionsDir(), `${older.id}.json`)
    const olderTime = new Date(Date.now() - 10_000)
    utimesSync(olderPath, olderTime, olderTime)

    const corruptPath = join(getWorkSessionsDir(), 'ws-corrupt.json')
    writeFileSync(corruptPath, '{ invalid json', 'utf-8')
    const newerTime = new Date()
    utimesSync(corruptPath, newerTime, newerTime)

    const latest = getLatestWorkSession()
    expect(latest?.id).toBe(older.id)
    expect(latest?.session.cwd).toBe('/tmp/project-a')
  })

  it('persists terminal task-run state and updates the parent work session', async () => {
    const {
      createTaskRun,
      createWorkSession,
      finishTaskRun,
      getTaskRunById,
      getWorkSessionById,
      listTaskRunSummaries,
    } = await import('../src/work-session-store.js')

    const session = createWorkSession({
      sourceSurface: 'run',
      cwd: '/tmp/project-b',
      provider: 'openai',
      model: 'gpt-5.4',
    })
    const taskRun = createTaskRun({
      workSessionId: session.id,
      kind: 'run',
      title: 'Implement feature',
      surface: 'cli',
      cwd: '/tmp/project-b',
      provider: 'openai',
      model: 'gpt-5.4',
    })

    const completed = finishTaskRun(taskRun.id, {
      status: 'completed',
      summary: 'Task finished',
      usage: {
        inputTokens: 12,
        outputTokens: 34,
        costUsd: 0.002,
        durationMs: 2400,
        turns: 2,
        toolCalls: 3,
      },
      evidence: [
        { label: 'unit-log', path: 'outputs/test/work-session.log' },
      ],
    })

    expect(completed?.status).toBe('completed')
    expect(completed?.completedAt).toBeTruthy()
    expect(completed?.usage?.toolCalls).toBe(3)
    expect(completed?.evidence).toEqual([
      { label: 'unit-log', path: 'outputs/test/work-session.log' },
    ])

    const persistedTaskRun = getTaskRunById(taskRun.id)
    expect(persistedTaskRun?.taskRun.summary).toBe('Task finished')

    const persistedSession = getWorkSessionById(session.id)
    expect(persistedSession?.session.status).toBe('completed')
    expect(persistedSession?.session.latestTaskRunId).toBe(taskRun.id)
    expect(persistedSession?.session.activeTaskRunId).toBeUndefined()

    const summaries = listTaskRunSummaries(session.id)
    expect(summaries).toHaveLength(1)
    expect(summaries[0]).toMatchObject({
      id: taskRun.id,
      status: 'completed',
      workSessionId: session.id,
    })
  })
})
