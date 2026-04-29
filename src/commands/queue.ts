/**
 * `orca queue` - TaskRun queue inspection.
 *
 * Usage:
 *   orca queue
 *   orca queue list --status running
 *   orca queue show <task-run-id>
 *   orca queue follow <task-run-id>
 */

import { Command } from 'commander'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { getBackgroundJobById } from '../background-jobs.js'
import {
  claimTaskRunLease,
  getTaskRunDetailById,
  listTaskRunSummaries,
  type TaskRunLease,
  type TaskRun,
  type TaskRunEvidence,
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

interface QueueTakeoverOptions {
  force?: boolean
  holder?: string
  ttl?: string
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
  return value?.trim() || process.env.ORCA_OPERATOR || process.env.USER || process.env.LOGNAME || 'operator'
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
  console.log(`  \x1b[90m${summaries.length} task run(s) shown - inspect: orca queue show <task-run-id>\x1b[0m`)
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
  if (taskRun.evidence.length > 0) {
    console.log('  evidence:')
    for (const item of taskRun.evidence) {
      console.log(`    - ${item.label}: ${item.path}`)
    }
  }
  console.log()
}

function renderTaskRunTakeover(id: string, options: QueueTakeoverOptions): void {
  const holder = resolveLeaseHolder(options.holder)
  const result = claimTaskRunLease(id, {
    holder,
    ttlMs: parseDurationMs(options.ttl),
    force: options.force,
  })

  if (!result.ok) {
    if (result.reason === 'not_found') {
      console.error(`\x1b[31m  error: task run "${id}" not found\x1b[0m`)
    } else if (result.reason === 'terminal') {
      console.error(`\x1b[31m  error: task run "${id}" is terminal (${result.taskRun?.status})\x1b[0m`)
    } else {
      console.error(`\x1b[31m  error: task run "${id}" already has an active lease\x1b[0m`)
      if (result.lease) console.error(`  ${formatLeaseDetail(result.lease)}`)
      console.error('  rerun with --force to replace it')
    }
    process.exit(1)
  }

  console.log()
  console.log(`  \x1b[1mTaskRun ${result.taskRun.id} takeover lease acquired\x1b[0m`)
  console.log(`  takeover: ${result.takeover}`)
  console.log(`  status: ${result.taskRun.status}`)
  console.log(`  lease: ${formatLeaseDetail(result.lease)}`)
  console.log()
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

  cmd.command('follow')
    .argument('<id>', 'TaskRun ID')
    .description('Follow TaskRun evidence until it reaches a terminal state')
    .option('--interval <ms>', 'Polling interval for running task runs', '1000')
    .option('--lines <n>', 'Initial evidence tail lines', '40')
    .option('--once', 'Print the current evidence snapshot and exit')
    .action(followTaskRun)

  return cmd
}
