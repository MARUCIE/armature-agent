/**
 * `armature queue` - TaskRun queue inspection.
 *
 * Usage:
 *   armature queue
 *   armature queue list --status running
 *   armature queue show <task-run-id>
 *   armature queue follow <task-run-id>
 *   armature queue evidence <task-run-id>
 */

import { Command } from 'commander'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { getBackgroundJobById } from '../background-jobs.js'
import { formatMarkdownCodeBlock } from '../ui/command-output.js'
import {
  claimTaskRunLease,
  getTaskRunDetailById,
  getTaskRunLeaseState,
  getWorkSessionById,
  listTaskRunSummaries,
  type TaskRunLease,
  type TaskRun,
  type TaskRunApprovalEvent,
  type TaskRunEvidence,
  type TaskRunLeaseClaimResult,
  type TaskRunStatus,
  type TaskRunSummary,
} from '../work-session-store.js'

const TASK_RUN_STATUSES: TaskRunStatus[] = ['queued', 'running', 'completed', 'failed', 'aborted']
const TERMINAL_TASK_RUN_STATUSES = new Set<TaskRunStatus>(['completed', 'failed', 'aborted'])

interface QueueListOptions {
  status?: string
  workSession?: string
  limit?: string
}

interface QueueFollowOptions {
  interval?: string
  lines?: string
  once?: boolean
}

interface QueueEvidenceOptions {
  lines?: string
  maxBytes?: string
}

export interface TaskRunEvidencePreview {
  label: string
  type: string
  path: string
  status: 'present' | 'missing' | 'unreadable'
  size?: string
  updatedAt?: string
  preview?: string
  truncated?: boolean
}

export interface TaskRunEvidenceDrawer {
  taskRunId: string
  status: TaskRunStatus
  title: string
  workSessionId: string
  summary?: string
  approvals: TaskRunApprovalEvent[]
  evidence: TaskRunEvidencePreview[]
}

interface QueueTakeoverOptions {
  force?: boolean
  holder?: string
  ttl?: string
}

interface QueueResumeOptions extends QueueTakeoverOptions {}

interface QueueScheduleOptions extends QueueTakeoverOptions {
  workSession?: string
}

export type TaskRunResumePlanState = 'resumable' | 'monitor' | 'terminal' | 'unsupported'

export interface TaskRunResumePlan {
  taskRunId: string
  state: TaskRunResumePlanState
  reason: string
  cwd: string
  command?: string
  savedSessionId?: string
  backgroundJobId?: string
}

function parseLimit(value: string | undefined): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 20
  return Math.min(200, Math.max(1, Math.floor(parsed)))
}

function parseInterval(value: string | undefined): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 1000
  return Math.min(60_000, Math.max(100, Math.floor(parsed)))
}

function parseLineCount(value: string | undefined): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 40
  return Math.min(500, Math.max(1, Math.floor(parsed)))
}

function parseMaxBytes(value: string | undefined): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 16_000
  return Math.min(1_000_000, Math.max(256, Math.floor(parsed)))
}

function parseDurationMs(value: string | undefined): number {
  const raw = (value || '15m').trim().toLowerCase()
  const match = raw.match(/^(\d+(?:\.\d+)?)(ms|s|m|h)?$/)
  if (!match) return 15 * 60_000
  const amount = Number(match[1])
  if (!Number.isFinite(amount) || amount <= 0) return 15 * 60_000
  const unit = match[2] || 's'
  const multiplier = unit === 'ms'
    ? 1
    : unit === 's'
      ? 1000
      : unit === 'm'
        ? 60_000
        : 60 * 60_000
  return Math.min(24 * 60 * 60_000, Math.max(1000, Math.floor(amount * multiplier)))
}

function resolveLeaseHolder(value: string | undefined): string {
  return value?.trim() || process.env.ARMATURE_OPERATOR || process.env.USER || process.env.LOGNAME || 'operator'
}

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatLeaseSummary(summary: TaskRunSummary): string {
  if (!summary.leaseHolder || !summary.leaseExpiresAt) return '-'
  return `${summary.leaseHolder}@${formatDateTime(summary.leaseExpiresAt)}`.slice(0, 28)
}

function formatLeaseDetail(lease: TaskRunLease): string {
  const forced = lease.forced ? ' forced' : ''
  const previous = lease.previousHolder ? ` previous=${lease.previousHolder}` : ''
  return `${lease.id} holder=${lease.holder} expires=${lease.expiresAt}${forced}${previous}`
}

function quoteShellArg(value: string): string {
  if (/^[A-Za-z0-9_./:=@+-]+$/.test(value)) return value
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function classifyEvidence(label: string, path: string): string {
  const lower = `${label} ${path}`.toLowerCase()
  if (/\.(diff|patch)$/.test(lower) || lower.includes('diff')) return 'diff'
  if (/\.(log|txt|out|err)$/.test(lower) || lower.includes('log')) return 'log'
  if (/\.(json|jsonl)$/.test(lower)) return 'data'
  if (/\.(md|html)$/.test(lower)) return 'report'
  return 'artifact'
}

function formatTaskRunRow(summary: TaskRunSummary): string {
  const status = summary.status.padEnd(9)
  const id = summary.id.padEnd(14)
  const kind = summary.kind.padEnd(11)
  const surface = summary.surface.padEnd(7)
  const model = (summary.model || '?').slice(0, 20).padEnd(20)
  const updated = formatDateTime(summary.updatedAt)
  const lease = formatLeaseSummary(summary).padEnd(28)
  return `  ${status} ${id} ${kind} ${surface} ${model} ${updated}  ${lease}  ${summary.title}`
}

function filterTaskRuns(
  summaries: TaskRunSummary[],
  options: QueueListOptions,
): TaskRunSummary[] {
  const normalizedStatus = options.status?.trim() as TaskRunStatus | undefined
  const status = normalizedStatus && TASK_RUN_STATUSES.includes(normalizedStatus) ? normalizedStatus : undefined
  const limit = parseLimit(options.limit)

  return summaries
    .filter((summary) => !status || summary.status === status)
    .filter((summary) => !options.workSession || summary.workSessionId.includes(options.workSession))
    .slice(0, limit)
}

function renderTaskRunList(options: QueueListOptions): void {
  const summaries = filterTaskRuns(listTaskRunSummaries(), options)

  console.log()
  console.log('  \x1b[1mTaskRun Queue\x1b[0m')
  console.log()

  if (summaries.length === 0) {
    console.log('  \x1b[90m(no task runs)\x1b[0m')
    console.log()
    return
  }

  console.log(`  ${'Status'.padEnd(9)} ${'ID'.padEnd(14)} ${'Kind'.padEnd(11)} ${'Surface'.padEnd(7)} ${'Model'.padEnd(20)} Updated       ${'Lease'.padEnd(28)}  Title`)
  console.log(`  ${'-'.repeat(9)} ${'-'.repeat(14)} ${'-'.repeat(11)} ${'-'.repeat(7)} ${'-'.repeat(20)} ${'-'.repeat(12)}  ${'-'.repeat(28)}  ${'-'.repeat(20)}`)
  for (const summary of summaries) {
    console.log(formatTaskRunRow(summary))
  }
  console.log()
  console.log(`  \x1b[90m${summaries.length} task run(s) shown - inspect: armature queue show <task-run-id>\x1b[0m`)
  console.log()
}

function renderTaskRunDetail(id: string): void {
  const detail = getTaskRunDetailById(id)
  if (!detail) {
    console.error(`\x1b[31m  error: task run "${id}" not found\x1b[0m`)
    process.exit(1)
  }

  const taskRun = detail.taskRun
  console.log()
  console.log(`  \x1b[1mTaskRun ${taskRun.id}\x1b[0m`)
  console.log(`  status: ${taskRun.status}`)
  console.log(`  work session: ${taskRun.workSessionId}`)
  console.log(`  kind: ${taskRun.kind}`)
  console.log(`  surface: ${taskRun.surface}`)
  console.log(`  cwd: ${taskRun.cwd}`)
  console.log(`  provider/model: ${taskRun.provider || '?'} / ${taskRun.model || '?'}`)
  console.log(`  attempt: ${taskRun.attempt}`)
  console.log(`  started: ${taskRun.startedAt}`)
  if (taskRun.completedAt) console.log(`  completed: ${taskRun.completedAt}`)
  if (taskRun.summary) console.log(`  summary: ${taskRun.summary}`)
  if (taskRun.lease) console.log(`  lease: ${formatLeaseDetail(taskRun.lease)}`)
  if (taskRun.usage) {
    console.log(`  usage: ${taskRun.usage.inputTokens} in / ${taskRun.usage.outputTokens} out / $${taskRun.usage.costUsd.toFixed(6)}`)
  }
  const resumePlan = buildTaskRunResumePlan(taskRun)
  console.log(`  resume: ${resumePlan.state} - ${resumePlan.reason}`)
  if (resumePlan.command) console.log(`  resume command: ${resumePlan.command}`)
  if (taskRun.evidence.length > 0) {
    console.log('  evidence:')
    for (const item of taskRun.evidence) {
      console.log(`    - ${item.label}: ${item.path}`)
    }
  }
  console.log()
}

export function buildTaskRunResumePlan(taskRun: TaskRun): TaskRunResumePlan {
  if (TERMINAL_TASK_RUN_STATUSES.has(taskRun.status)) {
    return {
      taskRunId: taskRun.id,
      state: 'terminal',
      reason: `TaskRun is terminal (${taskRun.status})`,
      cwd: taskRun.cwd,
    }
  }

  if (taskRun.backgroundJobId) {
    const job = getBackgroundJobById(taskRun.backgroundJobId)
    if (job?.status === 'running') {
      return {
        taskRunId: taskRun.id,
        state: 'monitor',
        reason: `Background job ${job.id} is still running`,
        cwd: taskRun.cwd,
        command: `armature queue follow ${quoteShellArg(taskRun.id)}`,
        backgroundJobId: job.id,
      }
    }
  }

  const workSession = getWorkSessionById(taskRun.workSessionId)?.session
  if (workSession?.sourceSurface === 'chat' && workSession.savedSessionId) {
    return {
      taskRunId: taskRun.id,
      state: 'resumable',
      reason: `Saved chat session ${workSession.savedSessionId} can be continued`,
      cwd: taskRun.cwd,
      command: `armature chat --cwd ${quoteShellArg(taskRun.cwd)} --continue ${quoteShellArg(workSession.savedSessionId)}`,
      savedSessionId: workSession.savedSessionId,
    }
  }

  return {
    taskRunId: taskRun.id,
    state: 'unsupported',
    reason: `TaskRun kind "${taskRun.kind}" does not carry replay metadata yet`,
    cwd: taskRun.cwd,
  }
}

function renderResumePlan(plan: TaskRunResumePlan, lease?: TaskRunLease, takeover?: 'new' | 'expired' | 'forced'): void {
  console.log()
  console.log(`  \x1b[1mTaskRun ${plan.taskRunId} resume plan\x1b[0m`)
  console.log(`  state: ${plan.state}`)
  console.log(`  reason: ${plan.reason}`)
  console.log(`  cwd: ${plan.cwd}`)
  if (plan.savedSessionId) console.log(`  saved session: ${plan.savedSessionId}`)
  if (plan.backgroundJobId) console.log(`  background job: ${plan.backgroundJobId}`)
  if (lease) {
    if (takeover) console.log(`  takeover: ${takeover}`)
    console.log(`  lease: ${formatLeaseDetail(lease)}`)
  }
  if (plan.command) {
    console.log('  command:')
    console.log(`    ${plan.command}`)
  }
  console.log()
}

function printLeaseClaimError(id: string, result: Extract<TaskRunLeaseClaimResult, { ok: false }>): void {
  if (result.reason === 'not_found') {
    console.error(`\x1b[31m  error: task run "${id}" not found\x1b[0m`)
  } else if (result.reason === 'terminal') {
    console.error(`\x1b[31m  error: task run "${id}" is terminal (${result.taskRun?.status})\x1b[0m`)
  } else {
    console.error(`\x1b[31m  error: task run "${id}" already has an active lease\x1b[0m`)
    if (result.lease) console.error(`  ${formatLeaseDetail(result.lease)}`)
    console.error('  rerun with --force to replace it')
  }
}

function renderTaskRunTakeover(id: string, options: QueueTakeoverOptions): void {
  const holder = resolveLeaseHolder(options.holder)
  const result = claimTaskRunLease(id, {
    holder,
    ttlMs: parseDurationMs(options.ttl),
    force: options.force,
  })

  if (!result.ok) {
    printLeaseClaimError(id, result)
    process.exit(1)
  }

  console.log()
  console.log(`  \x1b[1mTaskRun ${result.taskRun.id} takeover lease acquired\x1b[0m`)
  console.log(`  takeover: ${result.takeover}`)
  console.log(`  status: ${result.taskRun.status}`)
  console.log(`  lease: ${formatLeaseDetail(result.lease)}`)
  console.log()
}

function renderTaskRunResume(id: string, options: QueueResumeOptions): void {
  const detail = getTaskRunDetailById(id)
  if (!detail) {
    console.error(`\x1b[31m  error: task run "${id}" not found\x1b[0m`)
    process.exit(1)
  }

  const plan = buildTaskRunResumePlan(detail.taskRun)
  if (plan.state !== 'resumable' && plan.state !== 'monitor') {
    renderResumePlan(plan)
    process.exit(1)
  }

  const holder = resolveLeaseHolder(options.holder)
  const result = claimTaskRunLease(id, {
    holder,
    ttlMs: parseDurationMs(options.ttl),
    force: options.force,
  })

  if (!result.ok) {
    printLeaseClaimError(id, result)
    process.exit(1)
  }

  renderResumePlan(buildTaskRunResumePlan(result.taskRun), result.lease, result.takeover)
}

function findNextSchedulableTaskRun(options: QueueScheduleOptions): TaskRun | null {
  const summaries = listTaskRunSummaries()
    .filter((summary) => !options.workSession || summary.workSessionId.includes(options.workSession))
    .filter((summary) => !TERMINAL_TASK_RUN_STATUSES.has(summary.status))
    .sort((left, right) => left.startedAt.localeCompare(right.startedAt))

  for (const summary of summaries) {
    const detail = getTaskRunDetailById(summary.id)
    if (!detail) continue
    if (getTaskRunLeaseState(detail.taskRun) === 'active' && !options.force) continue
    const plan = buildTaskRunResumePlan(detail.taskRun)
    if (plan.state === 'resumable' || plan.state === 'monitor') return detail.taskRun
  }

  return null
}

function renderTaskRunSchedule(options: QueueScheduleOptions): void {
  const taskRun = findNextSchedulableTaskRun(options)
  if (!taskRun) {
    console.error('\x1b[31m  error: no schedulable TaskRun found\x1b[0m')
    process.exit(1)
  }
  renderTaskRunResume(taskRun.id, options)
}

function resolveEvidencePath(taskRun: TaskRun, evidence: TaskRunEvidence): string {
  return isAbsolute(evidence.path) ? evidence.path : resolve(taskRun.cwd, evidence.path)
}

function collectEvidence(taskRun: TaskRun): TaskRunEvidence[] {
  const entries = [...taskRun.evidence]
  if (taskRun.backgroundJobId) {
    const job = getBackgroundJobById(taskRun.backgroundJobId)
    if (job?.logPath) {
      entries.push({ label: 'background-log', path: job.logPath })
    }
  }

  const seen = new Set<string>()
  return entries.filter((entry) => {
    const key = `${entry.label}\0${entry.path}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function readTail(path: string, lines: number): string {
  if (!existsSync(path)) return ''
  try {
    return readFileSync(path, 'utf-8')
      .split('\n')
      .filter((line) => line.length > 0)
      .slice(-lines)
      .join('\n')
  } catch {
    return ''
  }
}

function trimPreviewBytes(content: string, maxBytes: number): { content: string; truncated: boolean } {
  const buffer = Buffer.from(content, 'utf-8')
  if (buffer.length <= maxBytes) return { content, truncated: false }
  return {
    content: buffer.subarray(buffer.length - maxBytes).toString('utf-8').replace(/^\uFFFD/, ''),
    truncated: true,
  }
}

function readEvidencePreview(path: string, lines: number, maxBytes: number): { content: string; truncated: boolean } {
  if (!existsSync(path)) return { content: '', truncated: false }
  try {
    const content = readFileSync(path, 'utf-8')
      .split('\n')
      .filter((line) => line.length > 0)
      .slice(-lines)
      .join('\n')
      .trimEnd()
    return trimPreviewBytes(content, maxBytes)
  } catch {
    return { content: '', truncated: false }
  }
}

function codeLanguageForEvidenceType(type: string): string {
  if (type === 'diff') return 'diff'
  if (type === 'data') return 'json'
  if (type === 'report') return 'markdown'
  return 'text'
}

export function buildTaskRunEvidenceDrawer(id: string, options: QueueEvidenceOptions = {}): TaskRunEvidenceDrawer | null {
  const detail = getTaskRunDetailById(id)
  if (!detail) return null

  const taskRun = detail.taskRun
  const lines = parseLineCount(options.lines)
  const maxBytes = parseMaxBytes(options.maxBytes)
  const evidence = collectEvidence(taskRun).map((item) => {
    const path = resolveEvidencePath(taskRun, item)
    const type = classifyEvidence(item.label, path)

    if (!existsSync(path)) {
      return {
        label: item.label,
        type,
        path,
        status: 'missing' as const,
      }
    }

    try {
      const stat = statSync(path)
      const preview = readEvidencePreview(path, lines, maxBytes)
      return {
        label: item.label,
        type,
        path,
        status: 'present' as const,
        size: formatBytes(stat.size),
        updatedAt: stat.mtime.toISOString(),
        preview: preview.content || undefined,
        truncated: preview.truncated,
      }
    } catch {
      return {
        label: item.label,
        type,
        path,
        status: 'unreadable' as const,
      }
    }
  })

  return {
    taskRunId: taskRun.id,
    status: taskRun.status,
    title: taskRun.title,
    workSessionId: taskRun.workSessionId,
    summary: taskRun.summary,
    approvals: taskRun.approvals || [],
    evidence,
  }
}

export function formatTaskRunEvidenceDrawerMarkdown(drawer: TaskRunEvidenceDrawer): string {
  const lines = [
    `# TaskRun Evidence ${drawer.taskRunId}`,
    '',
    `- Status: \`${drawer.status}\``,
    `- Title: ${drawer.title}`,
    `- Work session: \`${drawer.workSessionId}\``,
  ]
  if (drawer.summary) lines.push(`- Summary: ${drawer.summary}`)
  lines.push('')

  lines.push('## Approval Timeline')
  if (drawer.approvals.length === 0) {
    lines.push('_No approval events yet._')
  } else {
    drawer.approvals.forEach((approval) => {
      const scope = approval.scope ? ` scope=\`${approval.scope}\`` : ''
      lines.push(`- ${approval.createdAt} \`${approval.decision}\` \`${approval.toolName}\`${scope} source=\`${approval.source}\``)
      lines.push(`  - Rule: \`${approval.ruleKey}\``)
      lines.push(`  - Preview: ${approval.preview}`)
    })
  }
  lines.push('')

  if (drawer.evidence.length === 0) {
    lines.push('_No evidence files yet._')
    return lines.join('\n')
  }

  drawer.evidence.forEach((item, index) => {
    lines.push(`## [${index + 1}/${drawer.evidence.length}] ${item.label}`)
    lines.push(`- Type: \`${item.type}\``)
    lines.push(`- Path: \`${item.path}\``)
    lines.push(`- Status: \`${item.status}\``)
    if (item.size) lines.push(`- Size: ${item.size}`)
    if (item.updatedAt) lines.push(`- Updated: ${item.updatedAt}`)
    if (item.truncated) lines.push('- Preview: capped')
    if (item.preview) {
      lines.push('')
      lines.push(formatMarkdownCodeBlock(item.preview, codeLanguageForEvidenceType(item.type)).trimEnd())
    }
    lines.push('')
  })

  return lines.join('\n').trimEnd()
}

function readNewContent(path: string, offset: number): { content: string; nextOffset: number } {
  if (!existsSync(path)) return { content: '', nextOffset: offset }
  try {
    const size = statSync(path).size
    if (size < offset) {
      return { content: readFileSync(path, 'utf-8'), nextOffset: size }
    }
    if (size === offset) return { content: '', nextOffset: offset }
    const buffer = readFileSync(path)
    return {
      content: buffer.subarray(offset).toString('utf-8'),
      nextOffset: size,
    }
  } catch {
    return { content: '', nextOffset: offset }
  }
}

function printTaskRunFollowHeader(taskRun: TaskRun): void {
  console.log()
  console.log(`  \x1b[1mFollowing TaskRun ${taskRun.id}\x1b[0m`)
  console.log(`  status: ${taskRun.status}`)
  console.log(`  title: ${taskRun.title}`)
  console.log(`  work session: ${taskRun.workSessionId}`)
  if (taskRun.backgroundJobId) console.log(`  background job: ${taskRun.backgroundJobId}`)
  console.log()
}

function printEvidenceSnapshot(
  taskRun: TaskRun,
  lines: number,
  offsets: Map<string, number>,
): void {
  const evidence = collectEvidence(taskRun)
  if (evidence.length === 0) {
    console.log('  \x1b[90m(no evidence files yet)\x1b[0m')
    console.log()
    return
  }

  for (const item of evidence) {
    const path = resolveEvidencePath(taskRun, item)
    console.log(`  \x1b[90m==> ${item.label}: ${path}\x1b[0m`)
    const tail = readTail(path, lines)
    if (tail) console.log(tail)
    else console.log('  \x1b[90m(no readable content yet)\x1b[0m')
    try {
      offsets.set(path, existsSync(path) ? statSync(path).size : 0)
    } catch {
      offsets.set(path, 0)
    }
    console.log()
  }
}

function renderTaskRunEvidenceDrawer(id: string, options: QueueEvidenceOptions): void {
  const drawer = buildTaskRunEvidenceDrawer(id, options)
  if (!drawer) {
    console.error(`\x1b[31m  error: task run "${id}" not found\x1b[0m`)
    process.exit(1)
  }

  console.log()
  console.log(`  \x1b[1mTaskRun Evidence Drawer ${drawer.taskRunId}\x1b[0m`)
  console.log(`  status: ${drawer.status}`)
  console.log(`  title: ${drawer.title}`)
  console.log(`  work session: ${drawer.workSessionId}`)
  if (drawer.summary) console.log(`  summary: ${drawer.summary}`)
  console.log()

  console.log('  \x1b[1mApproval Timeline\x1b[0m')
  if (drawer.approvals.length === 0) {
    console.log('  \x1b[90m(no approval events yet)\x1b[0m')
  } else {
    for (const approval of drawer.approvals) {
      const scope = approval.scope ? ` scope=${approval.scope}` : ''
      console.log(`  ${approval.createdAt} ${approval.decision} ${approval.toolName}${scope} source=${approval.source}`)
      console.log(`    rule: ${approval.ruleKey}`)
      console.log(`    preview: ${approval.preview}`)
    }
  }
  console.log()

  if (drawer.evidence.length === 0) {
    console.log('  \x1b[90m(no evidence files yet)\x1b[0m')
    console.log()
    return
  }

  drawer.evidence.forEach((item, index) => {
    console.log(`  \x1b[1m[${index + 1}/${drawer.evidence.length}] ${item.label}\x1b[0m`)
    console.log(`  type: ${item.type}`)
    console.log(`  path: ${item.path}`)
    if (item.status !== 'present') {
      console.log(`  status: ${item.status}`)
      console.log()
      return
    }

    if (item.size) console.log(`  size: ${item.size}`)
    if (item.updatedAt) console.log(`  updated: ${item.updatedAt}`)
    if (!item.preview) {
      console.log('  preview: (no readable content)')
      console.log()
      return
    }

    console.log(`  preview:${item.truncated ? ' capped' : ''}`)
    console.log('  ' + '-'.repeat(54))
    for (const line of item.preview.split('\n')) {
      console.log(`  ${line}`)
    }
    console.log()
  })
}

function printEvidenceUpdates(
  taskRun: TaskRun,
  offsets: Map<string, number>,
): void {
  for (const item of collectEvidence(taskRun)) {
    const path = resolveEvidencePath(taskRun, item)
    const currentOffset = offsets.get(path) || 0
    const { content, nextOffset } = readNewContent(path, currentOffset)
    offsets.set(path, nextOffset)
    const trimmed = content.trimEnd()
    if (!trimmed) continue
    console.log(`  \x1b[90m==> ${item.label}: ${path}\x1b[0m`)
    console.log(trimmed)
    console.log()
  }
}

async function followTaskRun(id: string, options: QueueFollowOptions): Promise<void> {
  const lines = parseLineCount(options.lines)
  const interval = parseInterval(options.interval)
  const offsets = new Map<string, number>()
  let lastStatus: TaskRunStatus | undefined

  const initial = getTaskRunDetailById(id)
  if (!initial) {
    console.error(`\x1b[31m  error: task run "${id}" not found\x1b[0m`)
    process.exit(1)
  }

  printTaskRunFollowHeader(initial.taskRun)
  printEvidenceSnapshot(initial.taskRun, lines, offsets)
  lastStatus = initial.taskRun.status

  if (options.once || TERMINAL_TASK_RUN_STATUSES.has(initial.taskRun.status)) return

  while (true) {
    await sleep(interval)
    const detail = getTaskRunDetailById(id)
    if (!detail) {
      console.error(`\x1b[31m  error: task run "${id}" disappeared\x1b[0m`)
      process.exit(1)
    }

    if (detail.taskRun.status !== lastStatus) {
      lastStatus = detail.taskRun.status
      console.log(`  \x1b[90mstatus: ${detail.taskRun.status}\x1b[0m`)
    }
    printEvidenceUpdates(detail.taskRun, offsets)
    if (TERMINAL_TASK_RUN_STATUSES.has(detail.taskRun.status)) return
  }
}

function resolveCommandOptions(args: unknown[]): QueueListOptions {
  for (const arg of args) {
    if (arg && typeof arg === 'object' && 'opts' in arg && typeof (arg as { opts?: unknown }).opts === 'function') {
      return ((arg as { opts: () => QueueListOptions }).opts())
    }
  }
  const first = args[0]
  return first && typeof first === 'object' ? first as QueueListOptions : {}
}

export function createQueueCommand(): Command {
  const cmd = new Command('queue')
    .description('Inspect queued and completed task runs')
    .action(() => renderTaskRunList({}))

  cmd.command('list')
    .description('List task runs')
    .option('--status <status>', 'Filter by status: queued, running, completed, failed, aborted')
    .option('--work-session <id>', 'Filter by work-session id')
    .option('--limit <n>', 'Maximum task runs to show', '20')
    .action((...args: unknown[]) => renderTaskRunList(resolveCommandOptions(args)))

  cmd.command('show')
    .argument('<id>', 'TaskRun ID')
    .description('Show task-run detail')
    .action(renderTaskRunDetail)

  cmd.command('takeover')
    .argument('<id>', 'TaskRun ID')
    .description('Acquire an operator lease for a non-terminal TaskRun')
    .option('--holder <name>', 'Operator identity for the lease')
    .option('--ttl <duration>', 'Lease duration: 30s, 15m, 1h, or bare seconds', '15m')
    .option('--force', 'Replace an active unexpired lease')
    .action(renderTaskRunTakeover)

  cmd.command('resume')
    .argument('<id>', 'TaskRun ID')
    .description('Acquire a resume lease and print the concrete resume command when available')
    .option('--holder <name>', 'Operator identity for the resume lease')
    .option('--ttl <duration>', 'Lease duration: 30s, 15m, 1h, or bare seconds', '15m')
    .option('--force', 'Replace an active unexpired lease')
    .action(renderTaskRunResume)

  cmd.command('schedule')
    .description('Claim the next unleased resumable TaskRun and print its resume command')
    .option('--holder <name>', 'Operator identity for the resume lease')
    .option('--ttl <duration>', 'Lease duration: 30s, 15m, 1h, or bare seconds', '15m')
    .option('--work-session <id>', 'Only schedule TaskRuns from a matching work-session id')
    .option('--force', 'Replace an active unexpired lease if the selected TaskRun has one')
    .action(renderTaskRunSchedule)

  cmd.command('follow')
    .argument('<id>', 'TaskRun ID')
    .description('Follow TaskRun evidence until it reaches a terminal state')
    .option('--interval <ms>', 'Polling interval for running task runs', '1000')
    .option('--lines <n>', 'Initial evidence tail lines', '40')
    .option('--once', 'Print the current evidence snapshot and exit')
    .action(followTaskRun)

  cmd.command('evidence')
    .argument('<id>', 'TaskRun ID')
    .description('Open a TaskRun evidence drawer with artifact previews')
    .option('--lines <n>', 'Preview tail lines for each evidence file', '80')
    .option('--max-bytes <n>', 'Maximum preview bytes per evidence file', '16000')
    .action(renderTaskRunEvidenceDrawer)

  return cmd
}
