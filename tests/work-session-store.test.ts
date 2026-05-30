import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('work-session store', () => {
  const previousHome = process.env.HOME
  const previousArmatureHome = process.env.ARMATURE_HOME
  let homeDir: string
  let armatureHome: string

  beforeEach(() => {
    homeDir = join(tmpdir(), `armature-work-session-home-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
    armatureHome = join(tmpdir(), `armature-work-session-store-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
    mkdirSync(homeDir, { recursive: true })
    mkdirSync(armatureHome, { recursive: true })
    process.env.HOME = homeDir
    process.env.ARMATURE_HOME = armatureHome
  })

  afterEach(() => {
    if (previousHome === undefined) delete process.env.HOME
    else process.env.HOME = previousHome
    if (previousArmatureHome === undefined) delete process.env.ARMATURE_HOME
    else process.env.ARMATURE_HOME = previousArmatureHome
    try { rmSync(homeDir, { recursive: true, force: true }) } catch { /* ignore */ }
    try { rmSync(armatureHome, { recursive: true, force: true }) } catch { /* ignore */ }
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

  it('persists chat task runs as canonical queue-visible records', async () => {
    const {
      createTaskRun,
      createWorkSession,
      finishTaskRun,
      getTaskRunById,
      listTaskRunSummaries,
    } = await import('../src/work-session-store.js')

    const session = createWorkSession({
      sourceSurface: 'chat',
      cwd: '/tmp/project-chat',
      provider: 'openai',
      model: 'gpt-5.4',
      modeId: 'standard',
      savedSessionId: 'session-chat-1',
    })
    const taskRun = createTaskRun({
      workSessionId: session.id,
      kind: 'chat',
      title: 'Explain the queue contract',
      surface: 'cli',
      cwd: '/tmp/project-chat',
      provider: 'openai',
      model: 'gpt-5.4',
      summary: 'mode=standard permissions=auto effort=medium',
    })

    finishTaskRun(taskRun.id, {
      status: 'completed',
      summary: 'chat turn completed',
      usage: {
        inputTokens: 45,
        outputTokens: 67,
        costUsd: 0.000179,
        durationMs: 980,
        turns: 1,
      },
    })

    const persistedTaskRun = getTaskRunById(taskRun.id)
    expect(persistedTaskRun?.taskRun).toMatchObject({
      workSessionId: session.id,
      kind: 'chat',
      surface: 'cli',
      status: 'completed',
      title: 'Explain the queue contract',
      summary: 'chat turn completed',
      usage: {
        inputTokens: 45,
        outputTokens: 67,
        turns: 1,
      },
    })

    const summaries = listTaskRunSummaries(session.id)
    expect(summaries).toHaveLength(1)
    expect(summaries[0]).toMatchObject({
      id: taskRun.id,
      kind: 'chat',
      status: 'completed',
      surface: 'cli',
      workSessionId: session.id,
    })
  })

  it('appends review-before-apply approval events to task runs', async () => {
    const {
      appendTaskRunApproval,
      createTaskRun,
      createWorkSession,
      getTaskRunById,
    } = await import('../src/work-session-store.js')

    const session = createWorkSession({
      sourceSurface: 'chat',
      cwd: '/tmp/project-approval',
      provider: 'openai',
      model: 'gpt-5.4',
    })
    const taskRun = createTaskRun({
      workSessionId: session.id,
      kind: 'chat',
      title: 'Review a write',
      surface: 'cli',
      cwd: '/tmp/project-approval',
      provider: 'openai',
      model: 'gpt-5.4',
    })

    const updated = appendTaskRunApproval(taskRun.id, {
      toolName: 'write_file',
      ruleKey: 'write_file|path=src/generated.ts',
      preview: 'write 28 bytes to src/generated.ts',
      permissionMode: 'plan',
      decision: 'allowed',
      scope: 'session',
      source: 'prompt',
    })

    expect(updated?.approvals).toHaveLength(1)
    expect(updated?.approvals?.[0]).toMatchObject({
      toolName: 'write_file',
      ruleKey: 'write_file|path=src/generated.ts',
      preview: 'write 28 bytes to src/generated.ts',
      permissionMode: 'plan',
      decision: 'allowed',
      scope: 'session',
      source: 'prompt',
    })
    expect(updated?.approvals?.[0]?.id).toMatch(/^approval-/)
    expect(updated?.approvals?.[0]?.createdAt).toBeTruthy()

    const persisted = getTaskRunById(taskRun.id)
    expect(persisted?.taskRun.approvals?.[0]?.toolName).toBe('write_file')
  })

  it('claims and replaces task-run leases by TTL and force', async () => {
    const {
      claimTaskRunLease,
      createTaskRun,
      createWorkSession,
      getTaskRunLeaseState,
    } = await import('../src/work-session-store.js')

    const session = createWorkSession({
      sourceSurface: 'run',
      cwd: '/tmp/project-c',
      provider: 'openai',
      model: 'gpt-5.4',
    })
    const taskRun = createTaskRun({
      workSessionId: session.id,
      kind: 'run',
      title: 'Leaseable task',
      surface: 'cli',
      cwd: '/tmp/project-c',
      provider: 'openai',
      model: 'gpt-5.4',
    })

    const now = new Date('2026-04-29T00:00:00.000Z')
    const first = claimTaskRunLease(taskRun.id, {
      holder: 'operator-a',
      ttlMs: 60_000,
      now,
    })
    expect(first.ok).toBe(true)
    if (!first.ok) throw new Error('expected lease claim to succeed')
    expect(first.takeover).toBe('new')
    expect(first.lease.holder).toBe('operator-a')
    expect(getTaskRunLeaseState(first.taskRun, new Date('2026-04-29T00:00:30.000Z'))).toBe('active')
    expect(getTaskRunLeaseState(first.taskRun, new Date('2026-04-29T00:01:01.000Z'))).toBe('expired')

    const blocked = claimTaskRunLease(taskRun.id, {
      holder: 'operator-b',
      ttlMs: 60_000,
      now: new Date('2026-04-29T00:00:30.000Z'),
    })
    expect(blocked).toMatchObject({ ok: false, reason: 'active_lease' })

    const expired = claimTaskRunLease(taskRun.id, {
      holder: 'operator-b',
      ttlMs: 60_000,
      now: new Date('2026-04-29T00:01:01.000Z'),
    })
    expect(expired.ok).toBe(true)
    if (!expired.ok) throw new Error('expected expired lease replacement to succeed')
    expect(expired.takeover).toBe('expired')
    expect(expired.lease.previousHolder).toBe('operator-a')

    const forced = claimTaskRunLease(taskRun.id, {
      holder: 'operator-c',
      ttlMs: 60_000,
      force: true,
      now: new Date('2026-04-29T00:01:30.000Z'),
    })
    expect(forced.ok).toBe(true)
    if (!forced.ok) throw new Error('expected forced lease replacement to succeed')
    expect(forced.takeover).toBe('forced')
    expect(forced.lease.forced).toBe(true)
    expect(forced.lease.previousHolder).toBe('operator-b')
  })
})
