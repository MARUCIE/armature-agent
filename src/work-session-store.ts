import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { getOrcaHome } from './logger.js'

const SAFE_OBJECT_ID = /^[A-Za-z0-9._-]+$/

export type WorkSessionStatus = 'active' | 'idle' | 'completed' | 'failed'
export type TaskRunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'aborted'
export type WorkSessionSurface = 'chat' | 'run' | 'serve'
export type TaskRunKind = 'chat' | 'run' | 'goal-loop' | 'mission' | 'plan' | 'background'
export type TaskRunSurface = 'cli' | 'serve'

export interface TaskRunUsageSummary {
  inputTokens: number
  outputTokens: number
  costUsd: number
  durationMs: number
  turns?: number
  toolCalls?: number
}

export interface TaskRunEvidence {
  label: string
  path: string
}

export type TaskRunApprovalDecision = 'allowed' | 'denied' | 'preapproved' | 'blocked'
export type TaskRunApprovalSource = 'prompt' | 'allowlist' | 'policy' | 'hook'

export interface TaskRunApprovalEvent {
  id: string
  createdAt: string
  toolName: string
  ruleKey: string
  preview: string
  permissionMode?: 'yolo' | 'auto' | 'plan'
  decision: TaskRunApprovalDecision
  scope?: 'once' | 'session' | 'project'
  source: TaskRunApprovalSource
}

export type TaskRunApprovalEventInput = Omit<TaskRunApprovalEvent, 'id' | 'createdAt'>

export interface TaskRunLease {
  id: string
  holder: string
  acquiredAt: string
  expiresAt: string
  previousHolder?: string
  forced?: boolean
}

export interface WorkSession {
  id: string
  sourceSurface: WorkSessionSurface
  cwd: string
  provider?: string
  model?: string
  modeId?: string
  status: WorkSessionStatus
  createdAt: string
  updatedAt: string
  activeTaskRunId?: string
  latestTaskRunId?: string
  taskRunCount: number
  savedSessionId?: string
  threadId?: string
  latestBackgroundJobId?: string
}

export interface TaskRun {
  id: string
  workSessionId: string
  kind: TaskRunKind
  title: string
  status: TaskRunStatus
  surface: TaskRunSurface
  cwd: string
  provider?: string
  model?: string
  attempt: number
  createdAt: string
  startedAt: string
  updatedAt: string
  completedAt?: string
  summary?: string
  usage?: TaskRunUsageSummary
  evidence: TaskRunEvidence[]
  approvals?: TaskRunApprovalEvent[]
  backgroundJobId?: string
  lease?: TaskRunLease
}

interface WorkSessionFile {
  id: string
  path: string
  mtime: Date
}

interface LoadedWorkSessionFile extends WorkSessionFile {
  session: WorkSession
}

interface TaskRunFile {
  id: string
  path: string
  mtime: Date
}

interface LoadedTaskRunFile extends TaskRunFile {
  taskRun: TaskRun
}

export interface WorkSessionSummary {
  id: string
  sourceSurface: WorkSessionSurface
  cwd: string
  provider?: string
  model?: string
  status: WorkSessionStatus
  taskRunCount: number
  latestTaskRunId?: string
  createdAt: string
  updatedAt: string
}

export interface WorkSessionDetail {
  id: string
  updatedAt: string
  session: WorkSession
}

export interface TaskRunSummary {
  id: string
  workSessionId: string
  kind: TaskRunKind
  title: string
  status: TaskRunStatus
  surface: TaskRunSurface
  provider?: string
  model?: string
  attempt: number
  startedAt: string
  completedAt?: string
  updatedAt: string
  leaseHolder?: string
  leaseExpiresAt?: string
}

export interface TaskRunDetail {
  id: string
  updatedAt: string
  taskRun: TaskRun
}

export type TaskRunLeaseState = 'none' | 'active' | 'expired'

export type TaskRunLeaseClaimResult =
  | {
    ok: true
    taskRun: TaskRun
    lease: TaskRunLease
    takeover: 'new' | 'expired' | 'forced'
  }
  | {
    ok: false
    reason: 'not_found' | 'terminal' | 'active_lease'
    taskRun?: TaskRun
    lease?: TaskRunLease
  }

const TERMINAL_TASK_RUN_STATUSES = new Set<TaskRunStatus>(['completed', 'failed', 'aborted'])

export function getWorkSessionsRootDir(): string {
  return join(getOrcaHome(), 'work-sessions')
}

export function getWorkSessionsDir(): string {
  return join(getWorkSessionsRootDir(), 'sessions')
}

export function getTaskRunsDir(): string {
  return join(getWorkSessionsRootDir(), 'task-runs')
}

function ensureWorkSessionDirs(): void {
  mkdirSync(getWorkSessionsDir(), { recursive: true })
  mkdirSync(getTaskRunsDir(), { recursive: true })
}

function readJsonFile<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as T
  } catch {
    return null
  }
}

function writeJsonFile(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2), 'utf-8')
}

function buildWorkSessionPath(id: string): string {
  return join(getWorkSessionsDir(), `${sanitizeObjectId(id)}.json`)
}

function buildTaskRunPath(id: string): string {
  return join(getTaskRunsDir(), `${sanitizeObjectId(id)}.json`)
}

function listWorkSessionFiles(): WorkSessionFile[] {
  ensureWorkSessionDirs()
  try {
    return readdirSync(getWorkSessionsDir())
      .filter((file) => file.endsWith('.json'))
      .map((file) => ({
        id: file.replace(/\.json$/, ''),
        path: join(getWorkSessionsDir(), file),
        mtime: statSync(join(getWorkSessionsDir(), file)).mtime,
      }))
      .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
  } catch {
    return []
  }
}

function listTaskRunFiles(): TaskRunFile[] {
  ensureWorkSessionDirs()
  try {
    return readdirSync(getTaskRunsDir())
      .filter((file) => file.endsWith('.json'))
      .map((file) => ({
        id: file.replace(/\.json$/, ''),
        path: join(getTaskRunsDir(), file),
        mtime: statSync(join(getTaskRunsDir(), file)).mtime,
      }))
      .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
  } catch {
    return []
  }
}

export function listWorkSessions(): LoadedWorkSessionFile[] {
  return listWorkSessionFiles().flatMap((file) => {
    const session = readJsonFile<WorkSession>(file.path)
    return session ? [{ ...file, session }] : []
  })
}

export function getLatestWorkSession(): { id: string; session: WorkSession } | null {
  const latest = listWorkSessions()[0]
  return latest ? { id: latest.id, session: latest.session } : null
}

export function getWorkSessionById(id: string): { id: string; session: WorkSession } | null {
  if (!isSafeObjectLookup(id)) return null
  const session = readJsonFile<WorkSession>(buildWorkSessionPath(id))
  return session ? { id, session } : null
}

export function getWorkSessionDetailById(id: string): WorkSessionDetail | null {
  if (!isSafeObjectLookup(id)) return null
  const file = listWorkSessionFiles().find((item) => item.id === id)
  if (!file) return null
  const session = readJsonFile<WorkSession>(file.path)
  if (!session) return null
  return {
    id,
    updatedAt: file.mtime.toISOString(),
    session,
  }
}

export function listWorkSessionSummaries(): WorkSessionSummary[] {
  return listWorkSessions().map((file) => ({
    id: file.id,
    sourceSurface: file.session.sourceSurface,
    cwd: file.session.cwd,
    provider: file.session.provider,
    model: file.session.model,
    status: file.session.status,
    taskRunCount: file.session.taskRunCount,
    latestTaskRunId: file.session.latestTaskRunId,
    createdAt: file.session.createdAt,
    updatedAt: file.session.updatedAt,
  }))
}

export function getLatestWorkSessionSummary(): WorkSessionSummary | null {
  return listWorkSessionSummaries()[0] || null
}

export function createWorkSession(input: {
  sourceSurface: WorkSessionSurface
  cwd: string
  provider?: string
  model?: string
  modeId?: string
  savedSessionId?: string
  threadId?: string
}): WorkSession {
  ensureWorkSessionDirs()
  const now = new Date().toISOString()
  const id = `ws-${randomUUID().slice(0, 8)}`
  const session: WorkSession = {
    id,
    sourceSurface: input.sourceSurface,
    cwd: input.cwd,
    provider: input.provider,
    model: input.model,
    modeId: input.modeId,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    taskRunCount: 0,
    savedSessionId: input.savedSessionId,
    threadId: input.threadId,
  }
  writeJsonFile(buildWorkSessionPath(id), session)
  return session
}

export function updateWorkSession(
  id: string,
  mutate: (session: WorkSession) => WorkSession,
): WorkSession | null {
  const current = getWorkSessionById(id)
  if (!current) return null
  const next = mutate(structuredClone(current.session))
  next.id = id
  next.updatedAt = new Date().toISOString()
  writeJsonFile(buildWorkSessionPath(id), next)
  return next
}

export function createTaskRun(input: {
  workSessionId: string
  kind: TaskRunKind
  title: string
  surface: TaskRunSurface
  cwd: string
  provider?: string
  model?: string
  summary?: string
}): TaskRun {
  ensureWorkSessionDirs()
  const now = new Date().toISOString()
  const id = `tr-${randomUUID().slice(0, 8)}`
  const attempt = listTaskRunsForWorkSession(input.workSessionId).length + 1
  const taskRun: TaskRun = {
    id,
    workSessionId: input.workSessionId,
    kind: input.kind,
    title: input.title,
    status: 'running',
    surface: input.surface,
    cwd: input.cwd,
    provider: input.provider,
    model: input.model,
    attempt,
    createdAt: now,
    startedAt: now,
    updatedAt: now,
    summary: input.summary,
    evidence: [],
    approvals: [],
  }
  writeJsonFile(buildTaskRunPath(id), taskRun)
  updateWorkSession(input.workSessionId, (session) => ({
    ...session,
    status: 'active',
    activeTaskRunId: id,
    latestTaskRunId: id,
    taskRunCount: session.taskRunCount + 1,
  }))
  return taskRun
}

export function getTaskRunById(id: string): { id: string; taskRun: TaskRun } | null {
  if (!isSafeObjectLookup(id)) return null
  const taskRun = readJsonFile<TaskRun>(buildTaskRunPath(id))
  return taskRun ? { id, taskRun } : null
}

export function listTaskRunsForWorkSession(workSessionId: string): LoadedTaskRunFile[] {
  if (!isSafeObjectLookup(workSessionId)) return []
  return listTaskRunFiles().flatMap((file) => {
    const taskRun = readJsonFile<TaskRun>(file.path)
    if (!taskRun || taskRun.workSessionId !== workSessionId) return []
    return [{ ...file, taskRun }]
  })
}

export function listTaskRunSummaries(workSessionId?: string): TaskRunSummary[] {
  const items = workSessionId
    ? listTaskRunsForWorkSession(workSessionId)
    : listTaskRunFiles().flatMap((file) => {
      const taskRun = readJsonFile<TaskRun>(file.path)
      return taskRun ? [{ ...file, taskRun }] : []
    })

  return items.map((file) => ({
    id: file.id,
    workSessionId: file.taskRun.workSessionId,
    kind: file.taskRun.kind,
    title: file.taskRun.title,
    status: file.taskRun.status,
    surface: file.taskRun.surface,
    provider: file.taskRun.provider,
    model: file.taskRun.model,
    attempt: file.taskRun.attempt,
    startedAt: file.taskRun.startedAt,
    completedAt: file.taskRun.completedAt,
    updatedAt: file.taskRun.updatedAt,
    leaseHolder: file.taskRun.lease?.holder,
    leaseExpiresAt: file.taskRun.lease?.expiresAt,
  }))
}

export function getTaskRunDetailById(id: string): TaskRunDetail | null {
  if (!isSafeObjectLookup(id)) return null
  const file = listTaskRunFiles().find((item) => item.id === id)
  if (!file) return null
  const taskRun = readJsonFile<TaskRun>(file.path)
  if (!taskRun) return null
  return {
    id,
    updatedAt: file.mtime.toISOString(),
    taskRun,
  }
}

export function updateTaskRun(
  id: string,
  mutate: (taskRun: TaskRun) => TaskRun,
): TaskRun | null {
  const current = getTaskRunById(id)
  if (!current) return null
  const next = mutate(structuredClone(current.taskRun))
  next.id = id
  next.updatedAt = new Date().toISOString()
  writeJsonFile(buildTaskRunPath(id), next)
  return next
}

export function appendTaskRunApproval(id: string, input: TaskRunApprovalEventInput): TaskRun | null {
  return updateTaskRun(id, (current) => ({
    ...current,
    approvals: [
      ...(current.approvals || []),
      {
        id: `approval-${randomUUID().slice(0, 8)}`,
        createdAt: new Date().toISOString(),
        ...input,
      },
    ],
  }))
}

export function isTerminalTaskRunStatus(status: TaskRunStatus): boolean {
  return TERMINAL_TASK_RUN_STATUSES.has(status)
}

export function getTaskRunLeaseState(taskRun: TaskRun, now: Date = new Date()): TaskRunLeaseState {
  if (!taskRun.lease) return 'none'
  const expiresAtMs = Date.parse(taskRun.lease.expiresAt)
  if (!Number.isFinite(expiresAtMs)) return 'expired'
  return expiresAtMs > now.getTime() ? 'active' : 'expired'
}

export function claimTaskRunLease(
  id: string,
  input: {
    holder: string
    ttlMs: number
    force?: boolean
    now?: Date
  },
): TaskRunLeaseClaimResult {
  const current = getTaskRunById(id)
  if (!current) return { ok: false, reason: 'not_found' }

  if (isTerminalTaskRunStatus(current.taskRun.status)) {
    return { ok: false, reason: 'terminal', taskRun: current.taskRun, lease: current.taskRun.lease }
  }

  const now = input.now || new Date()
  const nowMs = now.getTime()
  const existingLease = current.taskRun.lease
  const existingLeaseActive = getTaskRunLeaseState(current.taskRun, now) === 'active'

  if (existingLeaseActive && !input.force) {
    return { ok: false, reason: 'active_lease', taskRun: current.taskRun, lease: existingLease }
  }

  const ttlMs = Math.max(1000, Math.floor(input.ttlMs))
  const holder = input.holder.trim() || 'operator'
  const takeover: 'new' | 'expired' | 'forced' = existingLeaseActive
    ? 'forced'
    : existingLease
      ? 'expired'
      : 'new'
  const lease: TaskRunLease = {
    id: `lease-${randomUUID().slice(0, 8)}`,
    holder,
    acquiredAt: now.toISOString(),
    expiresAt: new Date(nowMs + ttlMs).toISOString(),
    previousHolder: existingLease?.holder,
    forced: takeover === 'forced' || undefined,
  }

  const taskRun = updateTaskRun(id, (taskRun) => ({
    ...taskRun,
    lease,
  }))

  if (!taskRun) return { ok: false, reason: 'not_found' }
  return { ok: true, taskRun, lease, takeover }
}

export function finishTaskRun(
  id: string,
  input: {
    status: Exclude<TaskRunStatus, 'queued' | 'running'>
    summary?: string
    usage?: TaskRunUsageSummary
    evidence?: TaskRunEvidence[]
    backgroundJobId?: string
  },
): TaskRun | null {
  const taskRun = updateTaskRun(id, (current) => ({
    ...current,
    status: input.status,
    summary: input.summary ?? current.summary,
    usage: input.usage ?? current.usage,
    evidence: input.evidence ?? current.evidence,
    backgroundJobId: input.backgroundJobId ?? current.backgroundJobId,
    completedAt: current.completedAt || new Date().toISOString(),
  }))
  if (!taskRun) return null
  updateWorkSession(taskRun.workSessionId, (session) => ({
    ...session,
    status: input.status === 'completed' ? 'completed' : 'failed',
    activeTaskRunId: session.activeTaskRunId === id ? undefined : session.activeTaskRunId,
    latestTaskRunId: id,
    latestBackgroundJobId: input.backgroundJobId ?? session.latestBackgroundJobId,
  }))
  return taskRun
}

function sanitizeObjectId(id: string): string {
  const trimmed = basename(id).trim()
  if (!trimmed || !SAFE_OBJECT_ID.test(trimmed)) {
    throw new Error('invalid work-session identifier')
  }
  return trimmed
}

function isSafeObjectLookup(id: string): boolean {
  const trimmed = basename(id).trim()
  return Boolean(trimmed) && SAFE_OBJECT_ID.test(trimmed)
}
