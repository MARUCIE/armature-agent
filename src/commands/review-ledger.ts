/**
 * `orca review-ledger` — multi-model PR review ledger.
 *
 * Runs independent model reports, synthesizes common issues, and writes the
 * human-gated fix/review/E2E artifacts used for large PR review loops.
 */

import { Command } from 'commander'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { resolveConfig, resolveModelEndpoint, findAggregator, type OrcaConfig } from '../config.js'
import { pickDiverseModels } from '../multi-model.js'
import { printError } from '../output.js'
import {
  parseReviewModelList,
  runReviewLedger,
  slugifyReviewLabel,
  type ReviewSource,
} from '../review-ledger.js'

interface ReviewLedgerCommandOptions {
  pr?: string
  diffFile?: string
  base?: string
  head?: string
  models?: string
  judge?: string
  provider?: string
  apiKey?: string
  out?: string
  maxDiffChars?: string
  dryRun?: boolean
  json?: boolean
}

export function createReviewLedgerCommand(): Command {
  return new Command('review-ledger')
    .alias('review-swarm')
    .description('Run a multi-model code review and write a human-gated review ledger')
    .argument('[focus...]', 'Optional review focus')
    .option('--pr <number>', 'GitHub PR number to review via gh pr diff')
    .option('--diff-file <path>', 'Read diff from a local patch file')
    .option('--base <ref>', 'Base git ref for local diff')
    .option('--head <ref>', 'Head git ref for local diff', 'HEAD')
    .option('--models <csv>', 'Comma-separated reviewer models')
    .option('--judge <model>', 'Judge model for synthesis')
    .option('-p, --provider <provider>', 'Aggregator provider or direct provider override')
    .option('-k, --api-key <key>', 'API key for the selected provider')
    .option('--out <dir>', 'Output directory for review ledger artifacts')
    .option('--max-diff-chars <n>', 'Maximum diff characters sent to each model', '120000')
    .option('--dry-run', 'Write prompts and ledger templates without calling models')
    .option('--json', 'Print a JSON summary')
    .action(async (focusParts: string[], opts: ReviewLedgerCommandOptions) => {
      try {
        const focus = focusParts.join(' ').trim() || undefined
        const source = readReviewSource(opts, focus)
        if (!source.diff.trim()) {
          printError('No diff content found. Use --pr, --diff-file, --base/--head, or run from a dirty branch.')
          process.exit(1)
        }

        const config = resolveConfig({ cwd: process.cwd(), flags: buildReviewFlags(opts) })
        const explicitProvider = opts.provider
        const isExplicitAggregator = explicitProvider && config.providers[explicitProvider]?.aggregator
        const aggregatorId = explicitProvider
          ? (isExplicitAggregator ? explicitProvider : undefined)
          : findAggregator(config)
        const models = parseReviewModelList(opts.models, pickDiverseModels(3))
        const judgeModel = opts.judge || models[0]!
        const outputDir = resolve(opts.out || defaultReviewOutputDir(source))
        const maxDiffChars = parsePositiveInt(opts.maxDiffChars || '120000', '--max-diff-chars')

        if (!opts.dryRun) {
          const canRoute = [...models, judgeModel].some((model) => resolveModelEndpoint(model, config, aggregatorId))
          if (!canRoute) {
            printError(
              'Cannot route any review model. Configure an aggregator provider or pass --provider/--api-key.\n' +
              '  Example: orca review-ledger --provider poe --models claude-opus-4.6,gpt-5.4,gemini-3.1-pro'
            )
            process.exit(1)
          }
        }

        if (!opts.json) {
          console.log()
          console.log(`\x1b[35m  Review Ledger · ${models.length} reviewers · judge: ${judgeModel}\x1b[0m`)
          console.log(`\x1b[90m  source: ${source.label}\x1b[0m`)
          console.log(`\x1b[90m  output: ${outputDir}\x1b[0m`)
          if (opts.dryRun) console.log(`\x1b[90m  dry-run: prompts only, no model calls\x1b[0m`)
          console.log()
        }

        const result = await runReviewLedger({
          source,
          models,
          judgeModel,
          outputDir,
          maxDiffChars,
          dryRun: Boolean(opts.dryRun),
          resolveEndpoint: (model) => resolveModelEndpoint(model, config, aggregatorId),
          onModelStart: opts.json ? undefined : (model) => process.stdout.write(`  \x1b[90m● ${model}...\x1b[0m`),
          onModelDone: opts.json ? undefined : (_model, ms) => console.log(` \x1b[32m${(ms / 1000).toFixed(1)}s\x1b[0m`),
        })

        if (opts.json) {
          console.log(JSON.stringify({
            outputDir: result.outputDir,
            dryRun: result.dryRun,
            models,
            judgeModel,
            diffChars: result.diffChars,
            promptDiffChars: result.promptDiffChars,
            truncated: result.truncated,
            reports: result.reports.map((report) => ({
              model: report.model,
              error: report.error,
              durationMs: report.durationMs,
            })),
            synthesis: result.synthesis ? {
              model: result.synthesis.model,
              error: result.synthesis.error,
              durationMs: result.synthesis.durationMs,
            } : undefined,
            artifacts: result.artifacts,
          }, null, 2))
          return
        }

        console.log()
        console.log(`\x1b[32m  wrote ${result.artifacts.length} review artifacts\x1b[0m`)
        console.log(`\x1b[90m  ${result.outputDir}\x1b[0m`)
        if (result.truncated) {
          console.log(`\x1b[33m  diff was truncated for model prompts; full diff saved in 00_diff.patch\x1b[0m`)
        }
        const failed = result.reports.filter((report) => report.error).length + (result.synthesis?.error ? 1 : 0)
        if (failed > 0) {
          console.log(`\x1b[33m  ${failed} model step(s) failed; inspect generated report files\x1b[0m`)
        }
        console.log()
      } catch (err) {
        printError(err instanceof Error ? err.message : String(err))
        process.exit(1)
      }
    })
}

function readReviewSource(opts: ReviewLedgerCommandOptions, focus?: string): ReviewSource {
  if (opts.pr) return readPrSource(opts.pr, focus)
  if (opts.diffFile) return readDiffFileSource(opts.diffFile, focus)
  return readGitDiffSource(opts.base, opts.head || 'HEAD', focus)
}

function readPrSource(prNumber: string, focus?: string): ReviewSource {
  const parsed = parsePositiveInt(prNumber, '--pr')
  let title = `PR #${parsed}`
  let body = ''
  try {
    const metadata = execFileSync('gh', ['pr', 'view', String(parsed), '--json', 'title,body'], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const payload = JSON.parse(metadata) as { title?: string; body?: string }
    title = payload.title || title
    body = payload.body || ''
  } catch {
    // Keep the diff path useful even if optional metadata is unavailable.
  }

  const diff = execFileSync('gh', ['pr', 'diff', String(parsed), '--color=never'], {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  })

  return { label: `pr-${parsed}`, title, body, diff, focus }
}

function readDiffFileSource(path: string, focus?: string): ReviewSource {
  const absolute = resolve(path)
  if (!existsSync(absolute)) throw new Error(`Diff file not found: ${absolute}`)
  return {
    label: `diff-file:${basename(absolute)}`,
    title: basename(absolute),
    diff: readFileSync(absolute, 'utf-8'),
    focus,
  }
}

function readGitDiffSource(base: string | undefined, head: string, focus?: string): ReviewSource {
  const args = ['diff', '--no-ext-diff', '--no-color']
  let label = 'working-tree'
  if (base) {
    const range = head ? `${base}...${head}` : base
    args.push(range)
    label = range
  } else {
    args.push('HEAD')
  }
  const diff = execFileSync('git', args, {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  })
  return {
    label,
    title: `Review ${label}`,
    diff,
    focus,
  }
}

function defaultReviewOutputDir(source: ReviewSource): string {
  const stamp = new Date().toISOString().slice(0, 10)
  const title = source.title || source.label
  return join('doc', 'reviews', `${stamp}-${slugifyReviewLabel(title).slice(0, 72)}`)
}

function buildReviewFlags(opts: ReviewLedgerCommandOptions): Partial<OrcaConfig> {
  const flags: Partial<OrcaConfig> = {}
  if (opts.provider) flags.provider = opts.provider as OrcaConfig['provider']
  if (opts.apiKey) flags.apiKey = opts.apiKey
  return flags
}

function parsePositiveInt(value: string, label: string): number {
  const parsed = parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`)
  }
  return parsed
}
