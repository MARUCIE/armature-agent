import { Command } from 'commander'

import { findAggregator, resolveConfig, resolveModelEndpoint, resolveProvider } from '../config.js'
import { parseCritiqueCheckpoint, parseCritiqueResult, type CritiqueDryRun } from '../critique.js'
import { inspectWorkspaceCritique } from '../critique-workspace.js'
import { printBanner, printError, printProviderInfo } from '../output.js'
import { chatOnce } from '../providers/openai-compat.js'

interface CritiqueCommandOptions {
  checkpoint?: string
  plan?: string
  planFile?: string
  logsFile?: string
  diffFile?: string
  model?: string
  activeModel?: string
  provider?: string
  apiKey?: string
  criticalPath?: boolean
  repeatedFailure?: boolean
  securityOrData?: boolean
  userUncertainty?: boolean
  force?: boolean
  dryRun?: boolean
  json?: boolean
  showPrompt?: boolean
  maxDiffChars?: string
}

export function createCritiqueCommand(): Command {
  return new Command('critique')
    .description('Run a read-only Rubber Duck Critique quality gate')
    .argument('[goal...]', 'Original goal or review focus')
    .option('--checkpoint <name>', 'Checkpoint: after_plan, after_complex_implementation, before_test_execution, stuck_loop, manual', 'manual')
    .option('--plan <text>', 'Main agent plan text to critique')
    .option('--plan-file <path>', 'Read main agent plan text from a file')
    .option('--logs-file <path>', 'Read test or log output from a file')
    .option('--diff-file <path>', 'Read diff from a file instead of git diff')
    .option('-m, --model <model>', 'Reviewer model')
    .option('--active-model <model>', 'Main agent model used to choose a complementary reviewer')
    .option('-p, --provider <provider>', 'Reviewer provider')
    .option('-k, --api-key <key>', 'Reviewer provider API key')
    .option('--critical-path', 'Mark the change as critical path risk')
    .option('--repeated-failure', 'Mark the context as a repeated-failure loop')
    .option('--security-or-data', 'Mark the change as security or data sensitive')
    .option('--user-uncertainty', 'Mark requirements as uncertain')
    .option('--force', 'Run even when risk score is below the checkpoint threshold')
    .option('--dry-run', 'Print risk decision and assembled context without calling a model')
    .option('--json', 'Emit JSON')
    .option('--show-prompt', 'Include the assembled critique prompt in dry-run JSON or human output')
    .option('--max-diff-chars <n>', 'Maximum diff characters to include in the model prompt', '18000')
    .action(async (goalParts: string[], opts: CritiqueCommandOptions) => {
      try {
        await runCritique(goalParts, opts, process.cwd())
      } catch (err) {
        printError(err instanceof Error ? err.message : String(err))
        process.exitCode = 1
      }
    })
}

async function runCritique(goalParts: string[], opts: CritiqueCommandOptions, cwd: string): Promise<void> {
  const checkpoint = parseCritiqueCheckpoint(opts.checkpoint || 'manual')
  const userGoal = goalParts.join(' ').trim() || 'Review the current working tree before continuing.'
  const baseConfig = resolveConfig({ cwd, flags: buildConfigFlags(opts) })
  const activeModel = opts.activeModel || baseConfig.defaultModel || baseConfig.model || 'unknown'
  const inspection = inspectWorkspaceCritique({
    cwd,
    checkpoint,
    userGoal,
    mainPlan: opts.plan,
    planFile: opts.planFile,
    logsFile: opts.logsFile,
    diffFile: opts.diffFile,
    activeModel,
    reviewerModel: opts.model,
    criticalPath: opts.criticalPath,
    repeatedFailure: opts.repeatedFailure,
    securityOrData: opts.securityOrData,
    userUncertainty: opts.userUncertainty,
    force: opts.force,
    showPrompt: opts.showPrompt,
    maxDiffChars: parsePositiveInt(opts.maxDiffChars, 18000),
  })
  const { decision, reviewerModel, prompt } = inspection
  const reviewerConfig = resolveConfig({ cwd, flags: { ...buildConfigFlags(opts), model: reviewerModel } })

  if (opts.dryRun || !decision.shouldRun) {
    emitDryRun(inspection.dryRun, Boolean(opts.json))
    return
  }

  const endpoint = resolveModelEndpoint(reviewerModel, reviewerConfig, findAggregator(reviewerConfig))
  const resolved = endpoint || resolveProvider(reviewerConfig)
  if (!resolved.baseURL) {
    throw new Error(`No base URL resolved for critique reviewer model "${reviewerModel}"`)
  }

  const response = await chatOnce({
    apiKey: resolved.apiKey,
    baseURL: resolved.baseURL,
    model: endpoint ? endpoint.model : resolved.model,
    systemPrompt: 'You are Armature Critique: a read-only, evidence-first reviewer. Return JSON only.',
    maxTokens: 4000,
    headers: resolved.headers,
    reasoningEffort: resolved.reasoningEffort,
  }, prompt)
  const parsed = parseCritiqueResult(response.text, checkpoint)

  if (opts.json) {
    console.log(JSON.stringify({
      reviewer: {
        provider: resolved.provider,
        model: endpoint ? endpoint.model : resolved.model,
      },
      risk: decision,
      usage: {
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
      },
      result: parsed,
    }, null, 2))
    return
  }

  printBanner()
  printProviderInfo(resolved.provider, endpoint ? endpoint.model : resolved.model)
  console.log(`  checkpoint: ${checkpoint}`)
  console.log(`  risk: ${inspection.riskScore} (${decision.reason})`)
  console.log()
  console.log(`  verdict: ${parsed.verdict}`)
  console.log(`  summary: ${parsed.summary}`)
  for (const finding of parsed.findings) {
    const location = finding.file ? ` ${finding.file}${finding.line ? `:${finding.line}` : ''}` : ''
    console.log(`\n  - [${finding.severity}/${finding.category}]${location}`)
    console.log(`    ${finding.claim}`)
    console.log(`    evidence: ${finding.evidence}`)
    console.log(`    fix: ${finding.suggested_fix}`)
  }
  if (parsed.must_fix_before_continue.length > 0) {
    console.log('\n  must fix before continue:')
    for (const item of parsed.must_fix_before_continue) console.log(`  - ${item}`)
  }
  console.log(`\n  next: ${parsed.recommended_next_action}`)
}

function buildConfigFlags(opts: CritiqueCommandOptions): Record<string, unknown> {
  const flags: Record<string, unknown> = {}
  if (opts.provider) flags.provider = opts.provider
  if (opts.apiKey) flags.apiKey = opts.apiKey
  if (opts.model) flags.model = opts.model
  return flags
}

function emitDryRun(payload: CritiqueDryRun, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(payload, null, 2))
    return
  }

  console.log()
  console.log('  armature critique dry run')
  console.log(`  checkpoint: ${payload.checkpoint}`)
  console.log(`  reviewer: ${payload.reviewerModel}`)
  console.log(`  risk: ${payload.riskScore} (${payload.reason})`)
  console.log(`  changed files: ${payload.changedFileCount}`)
  console.log(`  diff lines: ${payload.diffLineCount}`)
  if (payload.changedFiles.length > 0) {
    console.log()
    for (const file of payload.changedFiles) console.log(`  - ${file}`)
  }
  if (payload.prompt) {
    console.log('\n--- prompt ---')
    console.log(payload.prompt)
  }
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}
