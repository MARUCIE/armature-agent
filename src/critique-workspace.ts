import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'

import {
  buildCritiquePrompt,
  calculateCritiqueRiskScore,
  chooseComplementaryReviewer,
  countDiffChangedLines,
  decideCritiqueRun,
  type CritiqueCheckpoint,
  type CritiqueDecision,
  type CritiqueDryRun,
  type CritiqueRiskSignals,
} from './critique.js'

export interface WorkspaceCritiqueOptions {
  cwd: string
  checkpoint: CritiqueCheckpoint
  userGoal?: string
  mainPlan?: string
  planFile?: string
  logsFile?: string
  diffFile?: string
  activeModel?: string
  reviewerModel?: string
  criticalPath?: boolean
  repeatedFailure?: boolean
  securityOrData?: boolean
  userUncertainty?: boolean
  force?: boolean
  showPrompt?: boolean
  includePrompt?: boolean
  maxDiffChars?: number
}

export interface WorkspaceCritiqueInspection {
  checkpoint: CritiqueCheckpoint
  userGoal: string
  diff: string
  changedFiles: string[]
  mainPlan?: string
  testOutput?: string
  riskSignals: CritiqueRiskSignals
  riskScore: number
  decision: CritiqueDecision
  reviewerModel: string
  prompt: string
  dryRun: CritiqueDryRun
}

export function inspectWorkspaceCritique(options: WorkspaceCritiqueOptions): WorkspaceCritiqueInspection {
  const userGoal = options.userGoal?.trim() || 'Review the current working tree before continuing.'
  const diff = truncate(readDiff(options.cwd, options.diffFile), options.maxDiffChars || 18000)
  const changedFiles = readChangedFiles(options.cwd, options.diffFile)
  const mainPlan = options.planFile ? readTextFile(options.planFile, options.cwd) : options.mainPlan
  const testOutput = options.logsFile ? readTextFile(options.logsFile, options.cwd) : undefined
  const riskSignals = buildRiskSignals(diff, changedFiles, options)
  const riskScore = calculateCritiqueRiskScore(riskSignals)
  const decision = decideCritiqueRun(options.checkpoint, riskScore, Boolean(options.force))
  const reviewerModel = options.reviewerModel || chooseComplementaryReviewer(options.activeModel || 'unknown')
  const prompt = options.includePrompt === false && !options.showPrompt
    ? ''
    : buildCritiquePrompt({
        checkpoint: options.checkpoint,
        userGoal,
        mainPlan,
        diff,
        changedFiles,
        testOutput,
        projectRules: readProjectRules(options.cwd),
        riskSignals,
        riskScore,
      })

  return {
    checkpoint: options.checkpoint,
    userGoal,
    diff,
    changedFiles,
    mainPlan,
    testOutput,
    riskSignals,
    riskScore,
    decision,
    reviewerModel,
    prompt,
    dryRun: {
      checkpoint: options.checkpoint,
      reviewerModel,
      riskScore,
      threshold: decision.threshold,
      shouldRun: decision.shouldRun,
      reason: decision.reason,
      diffLineCount: riskSignals.diffLineCount,
      changedFileCount: riskSignals.changedFileCount,
      changedFiles,
      prompt: options.showPrompt ? prompt : undefined,
    },
  }
}

function buildRiskSignals(
  diff: string,
  changedFiles: string[],
  options: WorkspaceCritiqueOptions,
): CritiqueRiskSignals {
  return {
    diffLineCount: countDiffChangedLines(diff),
    changedFileCount: changedFiles.length,
    criticalPathWeight: options.criticalPath ? 1 : 0,
    repeatedFailureWeight: options.repeatedFailure ? 1 : 0,
    securityOrDataWeight: options.securityOrData ? 1 : 0,
    userUncertaintyWeight: options.userUncertainty ? 1 : 0,
  }
}

function readDiff(cwd: string, diffFile?: string): string {
  if (diffFile) return readTextFile(diffFile, cwd)
  return safeGit(cwd, ['diff', '--no-ext-diff', '--'])
}

function readChangedFiles(cwd: string, diffFile?: string): string[] {
  if (diffFile) return []
  return safeGit(cwd, ['diff', '--name-only', '--'])
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function safeGit(cwd: string, args: string[]): string {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
      maxBuffer: 4 * 1024 * 1024,
    })
  } catch {
    return ''
  }
}

function readProjectRules(cwd: string): Array<{ path: string; content: string }> {
  const candidates = ['AGENTS.md', 'CLAUDE.md', 'CODEX.md']
  const rules: Array<{ path: string; content: string }> = []
  for (const path of candidates) {
    const fullPath = resolve(cwd, path)
    if (!existsSync(fullPath)) continue
    rules.push({ path, content: truncate(readTextFile(fullPath), 6000) })
  }
  return rules
}

function readTextFile(path: string, cwd?: string): string {
  const fullPath = cwd && !isAbsolute(path) ? resolve(cwd, path) : resolve(path)
  if (!existsSync(fullPath)) throw new Error(`File not found: ${path}`)
  const stat = statSync(fullPath)
  if (!stat.isFile()) throw new Error(`Not a file: ${path}`)
  return readFileSync(fullPath, 'utf-8')
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value
  return `${value.slice(0, maxChars)}\n...(truncated ${value.length - maxChars} chars)`
}
