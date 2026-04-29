import { Command } from 'commander'
import {
  EvolutionStore,
  defaultTestHintPath,
  type EvolutionCandidateKind,
  type EvolutionCandidateStatus,
} from '../evolution/store.js'

interface CandidateDraftOptions {
  kind: EvolutionCandidateKind
  title: string
  content: string
  category?: string
  failureMode?: string
  path?: string
  cwd?: string
  workSession?: string
  taskRun?: string
  session?: string
  usage?: string
}

function toInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export function createEvolveCommand(): Command {
  const cmd = new Command('evolve')
    .description('Inspect and gate self-evolution candidates')

  cmd
    .command('status')
    .description('Show observation and candidate overview')
    .action(() => {
      const store = new EvolutionStore()
      const overview = store.getOverview()
      console.log()
      console.log(`  observations: ${overview.observations}`)
      console.log(`  candidates: draft=${overview.candidates.draft} verified=${overview.candidates.verified} promoted=${overview.candidates.promoted} rejected=${overview.candidates.rejected}`)
      console.log(`  by kind: prompt=${overview.byKind.prompt} rule=${overview.byKind.rule} test-hint=${overview.byKind['test-hint']}`)
      if (overview.recentCandidates.length > 0) {
        console.log('\n  recent candidates:')
        for (const candidate of overview.recentCandidates) {
          console.log(`  - ${candidate.id}  [${candidate.kind}/${candidate.status}] ${candidate.title}`)
        }
      }
      console.log()
    })

  cmd
    .command('observations')
    .description('List recent runtime observations')
    .option('--limit <n>', 'Number of observations to show', '10')
    .action((opts: { limit?: string }) => {
      const store = new EvolutionStore()
      const items = store.listObservationSummaries(toInt(opts.limit, 10))
      console.log()
      if (items.length === 0) {
        console.log('  no observations.')
        console.log()
        return
      }
      for (const item of items) {
        console.log(`  - ${item.id}  [${item.category}/${item.severity}] ${item.summary}`)
      }
      console.log()
    })

  cmd
    .command('candidates')
    .description('List evolution candidates')
    .option('--kind <kind>', 'Filter by kind (prompt, rule, test-hint)')
    .option('--status <status>', 'Filter by status (draft, verified, promoted, rejected)')
    .option('--limit <n>', 'Number of candidates to show', '20')
    .action((opts: { kind?: EvolutionCandidateKind; status?: EvolutionCandidateStatus; limit?: string }) => {
      const store = new EvolutionStore()
      const items = store.listCandidateSummaries({
        kind: opts.kind,
        status: opts.status,
        limit: toInt(opts.limit, 20),
      })
      console.log()
      if (items.length === 0) {
        console.log('  no candidates.')
        console.log()
        return
      }
      for (const item of items) {
        console.log(`  - ${item.id}  [${item.kind}/${item.status}] ${item.title}`)
      }
      console.log()
    })

  cmd
    .command('draft')
    .description('Create a draft evolution candidate')
    .requiredOption('--kind <kind>', 'Candidate kind: prompt | rule | test-hint')
    .requiredOption('--title <title>', 'Candidate title')
    .requiredOption('--content <content>', 'Candidate content')
    .option('--category <category>', 'Prompt category (required for prompt candidates)')
    .option('--failure-mode <failureMode>', 'Failure mode (required for rule candidates)')
    .option('--path <path>', 'Target path (required for test-hint candidates)')
    .option('--cwd <cwd>', 'Project cwd (defaults to process.cwd())')
    .option('--work-session <id>', 'Linked work session id')
    .option('--task-run <id>', 'Linked task run id')
    .option('--session <id>', 'Linked saved session id')
    .option('--usage <id>', 'Linked usage reference')
    .action((opts: CandidateDraftOptions) => {
      const store = new EvolutionStore()
      const cwd = opts.cwd || process.cwd()
      const targetPath = opts.kind === 'test-hint'
        ? (opts.path || defaultTestHintPath(cwd, opts.title))
        : opts.path
        const candidate = store.createCandidate({
          kind: opts.kind,
        title: opts.title,
        content: opts.content,
        cwd,
        targetPath,
        metadata: {
          ...(opts.category ? { category: opts.category } : {}),
          ...(opts.failureMode ? { failureMode: opts.failureMode } : {}),
        },
        evidence: [{
          workSessionId: opts.workSession,
          taskRunId: opts.taskRun,
          sessionId: opts.session,
          usageRef: opts.usage?.trim() || undefined,
        }],
      })
        console.log(`\n  drafted: ${candidate.id} [${candidate.kind}/${candidate.status}] ${candidate.title}\n`)
      })

  cmd
    .command('verify')
    .description('Run the evolution gate for a candidate')
    .argument('<id>', 'Candidate id')
    .action((id: string) => {
      const store = new EvolutionStore()
      const candidate = store.verifyCandidate(id)
      if (!candidate) {
        console.error(`candidate not found: ${id}`)
        process.exitCode = 1
        return
      }
      console.log(`\n  ${candidate.id}: ${candidate.gate?.reason || 'no gate result'}\n`)
    })

  cmd
    .command('promote')
    .description('Promote a verified candidate into durable knowledge')
    .argument('<id>', 'Candidate id')
    .action((id: string) => {
      const store = new EvolutionStore()
      const candidate = store.promoteCandidate(id)
      if (!candidate || candidate.status !== 'promoted') {
        console.error(`candidate promotion failed: ${id}`)
        process.exitCode = 1
        return
      }
      console.log(`\n  promoted: ${candidate.id} [${candidate.kind}] ${candidate.title}\n`)
    })

  cmd
    .command('reject')
    .description('Reject a candidate with an audit reason')
    .argument('<id>', 'Candidate id')
    .requiredOption('--reason <reason>', 'Rejection reason')
    .action((id: string, opts: { reason: string }) => {
      const store = new EvolutionStore()
      const candidate = store.rejectCandidate(id, opts.reason)
      if (!candidate) {
        console.error(`candidate not found: ${id}`)
        process.exitCode = 1
        return
      }
      console.log(`\n  rejected: ${candidate.id} (${candidate.rejectionReason})\n`)
    })

  return cmd
}
