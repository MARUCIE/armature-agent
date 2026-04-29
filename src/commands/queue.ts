/**
 * `orca queue` - TaskRun queue inspection.
 *
 * Usage:
 *   orca queue
 *   orca queue list --status running
 *   orca queue show <task-run-id>
 */

import { Command } from 'commander'
import {
  getTaskRunDetailById,
  listTaskRunSummaries,
  type TaskRunStatus,
  type TaskRunSummary,
} from '../work-session-store.js'

const TASK_RUN_STATUSES: TaskRunStatus[] = ['queued', 'running', 'completed', 'failed', 'aborted']

interface QueueListOptions {
  status?: string
  workSession?: string
  limit?: string
}

function parseLimit(value: string | undefined): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 20
  return Math.min(200, Math.max(1, Math.floor(parsed)))
}

function formatTaskRunRow(summary: TaskRunSummary): string {
  const status = summary.status.padEnd(9)
  const id = summary.id.padEnd(14)
  const kind = summary.kind.padEnd(11)
  const surface = summary.surface.padEnd(7)
  const model = (summary.model || '?').slice(0, 20).padEnd(20)
  const updated = new Date(summary.updatedAt).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
  return `  ${status} ${id} ${kind} ${surface} ${model} ${updated}  ${summary.title}`
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

  console.log(`  ${'Status'.padEnd(9)} ${'ID'.padEnd(14)} ${'Kind'.padEnd(11)} ${'Surface'.padEnd(7)} ${'Model'.padEnd(20)} Updated       Title`)
  console.log(`  ${'-'.repeat(9)} ${'-'.repeat(14)} ${'-'.repeat(11)} ${'-'.repeat(7)} ${'-'.repeat(20)} ${'-'.repeat(12)}  ${'-'.repeat(20)}`)
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

  return cmd
}
