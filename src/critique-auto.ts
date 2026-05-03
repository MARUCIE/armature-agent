import { createHash } from 'node:crypto'

import type { CritiqueCheckpoint } from './critique.js'
import { inspectWorkspaceCritique } from './critique-workspace.js'
import type { WorkspaceCritiqueInspection } from './critique-workspace.js'

export const DEFAULT_AUTO_CRITIQUE_NOTICE_THRESHOLD = 0.25

export interface CritiqueAutoState {
  lastSignature?: string
}

export interface AutoCritiqueNotice {
  checkpoint: CritiqueCheckpoint
  reviewerModel: string
  riskScore: number
  diffLineCount: number
  changedFileCount: number
  message: string
}

export interface AutoCritiqueOptions {
  cwd: string
  activeModel: string
  state?: CritiqueAutoState
  checkpoint?: CritiqueCheckpoint
  userGoal?: string
  threshold?: number
  enabled?: boolean
}

export function createCritiqueAutoState(): CritiqueAutoState {
  return {}
}

export function maybeBuildAutoCritiqueNotice(options: AutoCritiqueOptions): AutoCritiqueNotice | null {
  const enabled = options.enabled ?? process.env.ORCA_AUTO_CRITIQUE !== '0'
  if (!enabled) return null

  const threshold = resolveAutoCritiqueThreshold(options.threshold)
  const checkpoint = options.checkpoint || 'after_complex_implementation'
  const inspection = inspectWorkspaceCritique({
    cwd: options.cwd,
    checkpoint,
    activeModel: options.activeModel,
    userGoal: options.userGoal || 'Automatic pre-send workspace risk check.',
    includePrompt: false,
  })

  if (inspection.riskSignals.diffLineCount === 0 && inspection.changedFiles.length === 0) return null
  if (!inspection.decision.shouldRun && inspection.riskScore < threshold) return null

  const signature = buildAutoCritiqueSignature(inspection)
  if (options.state?.lastSignature === signature) return null
  if (options.state) options.state.lastSignature = signature

  return {
    checkpoint,
    reviewerModel: inspection.reviewerModel,
    riskScore: inspection.riskScore,
    diffLineCount: inspection.riskSignals.diffLineCount,
    changedFileCount: inspection.changedFiles.length,
    message: formatAutoCritiqueNotice(inspection, threshold),
  }
}

function resolveAutoCritiqueThreshold(explicit?: number): number {
  const raw = explicit ?? process.env.ORCA_AUTO_CRITIQUE_THRESHOLD
  const candidate = typeof raw === 'string' && raw.trim() === '' ? NaN : Number(raw)
  if (Number.isFinite(candidate) && candidate >= 0 && candidate <= 1) return candidate
  return DEFAULT_AUTO_CRITIQUE_NOTICE_THRESHOLD
}

function buildAutoCritiqueSignature(inspection: WorkspaceCritiqueInspection): string {
  return createHash('sha256')
    .update(inspection.checkpoint)
    .update('\0')
    .update(String(inspection.riskScore))
    .update('\0')
    .update(inspection.changedFiles.join('\n'))
    .update('\0')
    .update(inspection.diff)
    .digest('hex')
}

function formatAutoCritiqueNotice(
  inspection: WorkspaceCritiqueInspection,
  threshold: number,
): string {
  const trigger = inspection.decision.shouldRun
    ? `review threshold ${inspection.decision.threshold}`
    : `local hint threshold ${threshold}`
  return [
    `critique checkpoint recommended: ${inspection.checkpoint}`,
    `risk ${inspection.riskScore} (${trigger})`,
    `${inspection.changedFiles.length} files / ${inspection.riskSignals.diffLineCount} diff lines`,
    `reviewer ${inspection.reviewerModel}`,
    `run /critique --checkpoint ${inspection.checkpoint}`,
  ].join(' · ')
}
