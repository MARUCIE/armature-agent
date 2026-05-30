import { closeSync, constants, existsSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { getArmatureHome } from '../logger.js'
import { LearningJournal } from '../knowledge/learning.js'
import { PromptRepository } from '../knowledge/prompts.js'

export type EvolutionObservationCategory = 'chat' | 'run' | 'serve' | 'usage' | 'task-run' | 'doctor' | 'manual'
export type EvolutionObservationSeverity = 'info' | 'warn' | 'error'
export type EvolutionCandidateKind = 'prompt' | 'rule' | 'test-hint'
export type EvolutionCandidateStatus = 'draft' | 'verified' | 'promoted' | 'rejected'

export interface EvolutionEvidenceSpine {
  workSessionId?: string
  taskRunId?: string
  sessionId?: string
  usageRef?: string
}

export interface EvolutionObservation {
  id: string
  category: EvolutionObservationCategory
  severity: EvolutionObservationSeverity
  summary: string
  details?: string
  command?: string
  provider?: string
  model?: string
  cwd?: string
  project?: string
  evidence: EvolutionEvidenceSpine
  createdAt: string
  updatedAt: string
}

export interface EvolutionGateResult {
  passed: boolean
  reason: string
  checks: string[]
  verifiedAt: string
  blockedByMutationCeiling?: boolean
}

export interface EvolutionCandidate {
  id: string
  kind: EvolutionCandidateKind
  status: EvolutionCandidateStatus
  title: string
  content: string
  cwd?: string
  targetPath?: string
  metadata?: Record<string, unknown>
  evidence: EvolutionEvidenceSpine[]
  sourceObservationIds: string[]
  gate?: EvolutionGateResult
  promotedAt?: string
  rejectedAt?: string
  rejectionReason?: string
  createdAt: string
  updatedAt: string
}

export interface EvolutionOverview {
  observations: number
  candidates: Record<EvolutionCandidateStatus, number>
  byKind: Record<EvolutionCandidateKind, number>
  recentObservations: EvolutionObservationSummary[]
  recentCandidates: EvolutionCandidateSummary[]
}

export interface EvolutionObservationSummary {
  id: string
  category: EvolutionObservationCategory
  severity: EvolutionObservationSeverity
  summary: string
  createdAt: string
  updatedAt: string
}

export interface EvolutionCandidateSummary {
  id: string
  kind: EvolutionCandidateKind
  status: EvolutionCandidateStatus
  title: string
  gatePassed?: boolean
  createdAt: string
  updatedAt: string
}

interface ObservationInput {
  category: EvolutionObservationCategory
  severity: EvolutionObservationSeverity
  summary: string
  details?: string
  command?: string
  provider?: string
  model?: string
  cwd?: string
  project?: string
  evidence?: EvolutionEvidenceSpine
}

interface CandidateInput {
  kind: EvolutionCandidateKind
  title: string
  content: string
  cwd?: string
  targetPath?: string
  metadata?: Record<string, unknown>
  evidence?: EvolutionEvidenceSpine[]
  sourceObservationIds?: string[]
}

interface CandidateListFilters {
  kind?: EvolutionCandidateKind
  status?: EvolutionCandidateStatus
  limit?: number
}

interface MutationCeilingResult {
  blocked: boolean
  reason?: string
  resolvedPath?: string
}

interface ObservationTextContext {
  cwd?: string
}

const AUTO_PROMPT_SUMMARY = normalizeSummary('context pressure triggered auto-compact')

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

function normalizeSummary(summary: string): string {
  return summary.trim().toLowerCase().replace(/\s+/g, ' ')
}

function mergeEvidence(items: EvolutionEvidenceSpine[]): EvolutionEvidenceSpine[] {
  const seen = new Set<string>()
  const merged: EvolutionEvidenceSpine[] = []
  for (const item of items) {
    const key = JSON.stringify({
      workSessionId: item.workSessionId || null,
      taskRunId: item.taskRunId || null,
        sessionId: item.sessionId || null,
        usageRef: item.usageRef || null,
    })
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(item)
  }
  return merged
}

function ensureDir(path: string): string {
  mkdirSync(path, { recursive: true })
  return path
}

function buildId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function redactSecrets(value: string): string {
  const normalized = value
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
  return normalized
    .replace(/\b(Bearer[\s\u00A0]+)[A-Za-z0-9._=-]+\b/giu, '$1[REDACTED]')
    .replace(/\b(sk|rk|pk)-[A-Za-z0-9_-]{8,}\b/gu, '$1-[REDACTED]')
    .replace(/\b[A-Z0-9_]{2,}(?:API|ACCESS|SECRET|TOKEN|KEY)[A-Z0-9_]*=[^\s"'`]+/giu, '[REDACTED_SECRET]')
}

function redactPaths(value: string, context: ObservationTextContext): string {
  let next = value
  const currentHome = process.env.HOME || homedir()
  const cwd = context.cwd ? resolve(context.cwd) : undefined

  if (currentHome) {
    next = next.split(currentHome).join('[HOME]')
  }
  if (cwd) {
    next = next.split(cwd).join('[CWD]')
  }

  return next
    .replace(/(?:^|[\s(])((?:\/Users|\/home|\/tmp|\/var|[A-Za-z]:\\)[^\s"'`)]+)/g, (_match, path) => _match.replace(path, '[PATH]'))
}

function sanitizeObservationText(value: string | undefined, context: ObservationTextContext, maxLength: number): string | undefined {
  const raw = asNonEmptyString(value)
  if (!raw) return undefined
  const redacted = redactPaths(redactSecrets(raw), context)
  return redacted.length > maxLength
    ? `${redacted.slice(0, maxLength - 3)}...`
    : redacted
}

function buildObservationSummary(observation: EvolutionObservation): EvolutionObservationSummary {
  return {
    id: observation.id,
    category: observation.category,
    severity: observation.severity,
    summary: observation.summary,
    createdAt: observation.createdAt,
    updatedAt: observation.updatedAt,
  }
}

function buildCandidateSummary(candidate: EvolutionCandidate): EvolutionCandidateSummary {
  return {
    id: candidate.id,
    kind: candidate.kind,
    status: candidate.status,
    title: candidate.title,
    gatePassed: candidate.gate?.passed,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
  }
}

function existingPathContainsSymlink(path: string, root: string): boolean {
  const target = resolve(path)
  const boundary = resolve(root)
  if (!(target === boundary || target.startsWith(`${boundary}/`))) {
    return true
  }

  let cursor = boundary
  const remainder = target.slice(boundary.length).replace(/^\/+/, '')
  const segments = remainder ? remainder.split('/') : []
  for (const segment of segments) {
    cursor = join(cursor, segment)
    if (!existsSync(cursor)) continue
    if (lstatSync(cursor).isSymbolicLink()) return true
  }
  return false
}

function ensureSafeDir(path: string, root: string): string {
  const target = resolve(path)
  const boundary = resolve(root)
  if (existingPathContainsSymlink(target, boundary)) {
    throw new Error('mutation ceiling: symlinked path components are not allowed')
  }
  mkdirSync(target, { recursive: true })
  if (existingPathContainsSymlink(target, boundary)) {
    throw new Error('mutation ceiling: symlinked path components are not allowed')
  }
  return target
}

function writeJsonFileNoFollow(path: string, value: unknown): void {
  const fd = openSync(path, constants.O_CREAT | constants.O_TRUNC | constants.O_WRONLY | constants.O_NOFOLLOW, 0o644)
  try {
    writeFileSync(fd, JSON.stringify(value, null, 2), 'utf-8')
  } finally {
    closeSync(fd)
  }
}

export function defaultTestHintPath(cwd: string, title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'hint'
  return join('agent-eval', 'generated', 'test-hints', `${slug}.json`)
}

export class EvolutionStore {
  private readonly rootDir: string
  private readonly observationsDir: string
  private readonly candidatesDir: string

  constructor(rootDir = join(getArmatureHome(), 'evolution')) {
    this.rootDir = rootDir
    this.observationsDir = ensureDir(join(rootDir, 'observations'))
    this.candidatesDir = ensureDir(join(rootDir, 'candidates'))
  }

  getRootDir(): string {
    return this.rootDir
  }

  observe(input: ObservationInput): EvolutionObservation {
    const now = new Date().toISOString()
    const observation: EvolutionObservation = {
      id: buildId('obs'),
      category: input.category,
      severity: input.severity,
      summary: sanitizeObservationText(input.summary, { cwd: input.cwd }, 200) || 'observation',
      details: sanitizeObservationText(input.details, { cwd: input.cwd }, 800),
      command: asNonEmptyString(input.command),
      provider: asNonEmptyString(input.provider),
      model: asNonEmptyString(input.model),
      cwd: asNonEmptyString(input.cwd),
      project: asNonEmptyString(input.project) || (input.cwd ? basename(input.cwd) : undefined),
      evidence: input.evidence || {},
      createdAt: now,
      updatedAt: now,
    }
    writeJsonFile(join(this.observationsDir, `${observation.id}.json`), observation)
    this.autoDraftCandidate(observation)
    return observation
  }

  listObservations(limit = 20, category?: EvolutionObservationCategory): EvolutionObservation[] {
    const all = this.listJsonDir<EvolutionObservation>(this.observationsDir)
      .filter((item) => !category || item.category === category)
    return all.slice(0, limit)
  }

  listObservationSummaries(limit = 20, category?: EvolutionObservationCategory): EvolutionObservationSummary[] {
    return this.listObservations(limit, category).map(buildObservationSummary)
  }

  createCandidate(input: CandidateInput): EvolutionCandidate {
    const now = new Date().toISOString()
    const signature = JSON.stringify({
      kind: input.kind,
      cwd: input.cwd || '',
      targetPath: input.targetPath || '',
      content: input.content.trim(),
    })

    const existing = this.listCandidates({ limit: 200 }).find((candidate) =>
      candidate.status !== 'rejected' &&
      JSON.stringify({
        kind: candidate.kind,
        cwd: candidate.cwd || '',
        targetPath: candidate.targetPath || '',
        content: candidate.content.trim(),
      }) === signature
    )

    if (existing) {
      return this.updateCandidate(existing.id, (candidate) => ({
        ...candidate,
        title: input.title.trim() || candidate.title,
        metadata: { ...(candidate.metadata || {}), ...(input.metadata || {}) },
        evidence: mergeEvidence([...(candidate.evidence || []), ...(input.evidence || [])]),
        sourceObservationIds: [...new Set([...(candidate.sourceObservationIds || []), ...(input.sourceObservationIds || [])])],
        gate: candidate.status === 'promoted' ? candidate.gate : undefined,
        status: candidate.status === 'promoted' ? candidate.status : 'draft',
      }))!
    }

    const candidate: EvolutionCandidate = {
      id: buildId('cand'),
      kind: input.kind,
      status: 'draft',
      title: input.title.trim(),
      content: input.content.trim(),
      cwd: asNonEmptyString(input.cwd),
      targetPath: asNonEmptyString(input.targetPath),
      metadata: input.metadata,
      evidence: mergeEvidence(input.evidence || []),
      sourceObservationIds: [...new Set(input.sourceObservationIds || [])],
      createdAt: now,
      updatedAt: now,
    }
    writeJsonFile(join(this.candidatesDir, `${candidate.id}.json`), candidate)
    return candidate
  }

  loadCandidate(id: string): EvolutionCandidate | null {
    return readJsonFile<EvolutionCandidate>(join(this.candidatesDir, `${basename(id)}.json`))
  }

  listCandidates(filters: CandidateListFilters = {}): EvolutionCandidate[] {
    const { kind, status, limit = 20 } = filters
    const all = this.listJsonDir<EvolutionCandidate>(this.candidatesDir)
      .filter((item) => !kind || item.kind === kind)
      .filter((item) => !status || item.status === status)
    return all.slice(0, limit)
  }

  verifyCandidate(id: string): EvolutionCandidate | null {
    const candidate = this.loadCandidate(id)
    if (!candidate) return null

    const checks: string[] = []
    const issues: string[] = []

    if ((candidate.evidence?.length || 0) > 0 || (candidate.sourceObservationIds?.length || 0) > 0) {
      checks.push('evidence-linked')
    } else {
      issues.push('candidate has no evidence spine')
    }

    if (candidate.kind === 'prompt') {
      if (asNonEmptyString(candidate.metadata?.category)) checks.push('prompt-category')
      else issues.push('prompt candidate missing metadata.category')
    }

    if (candidate.kind === 'rule') {
      if (asNonEmptyString(candidate.metadata?.failureMode)) checks.push('failure-mode')
      else issues.push('rule candidate missing metadata.failureMode')
    }

    if (candidate.kind === 'test-hint') {
      if (asNonEmptyString(candidate.targetPath)) checks.push('target-path')
      else issues.push('test-hint candidate missing targetPath')
    }

    const ceiling = this.enforceMutationCeiling(candidate)
    if (ceiling.blocked) {
      issues.push(ceiling.reason || 'mutation ceiling blocked candidate')
    } else {
      checks.push('mutation-ceiling')
    }

    const gate: EvolutionGateResult = {
      passed: issues.length === 0,
      reason: issues.length === 0 ? 'candidate passed gate' : issues.join('; '),
      checks,
      verifiedAt: new Date().toISOString(),
      blockedByMutationCeiling: ceiling.blocked,
    }

    return this.updateCandidate(id, (current) => ({
      ...current,
      gate,
      status: gate.passed ? 'verified' : 'draft',
    }))
  }

  promoteCandidate(id: string): EvolutionCandidate | null {
    const verified = this.verifyCandidate(id)
    if (!verified || !verified.gate?.passed) return verified

    switch (verified.kind) {
      case 'prompt': {
        const repo = new PromptRepository()
        repo.save(
          verified.title,
          verified.content,
          asNonEmptyString(verified.metadata?.category) || 'evolved',
        )
        break
      }
      case 'rule': {
        const journal = new LearningJournal()
        journal.promoteVerifiedHypothesis(
          verified.content,
          this.formatEvidenceReferences(verified),
          asNonEmptyString(verified.metadata?.failureMode),
          verified.cwd ? basename(verified.cwd) : undefined,
        )
        break
      }
      case 'test-hint': {
        const ceiling = this.enforceMutationCeiling(verified)
        if (ceiling.blocked || !ceiling.resolvedPath) {
          throw new Error(ceiling.reason || 'test-hint promotion blocked by mutation ceiling')
        }
        const parentDir = ensureSafeDir(resolve(ceiling.resolvedPath, '..'), resolve(verified.cwd!, 'agent-eval', 'generated', 'test-hints'))
        writeJsonFileNoFollow(join(parentDir, basename(ceiling.resolvedPath)), {
          title: verified.title,
          kind: verified.kind,
          hint: verified.content,
          sourceObservationIds: verified.sourceObservationIds,
          evidence: verified.evidence,
          metadata: verified.metadata || {},
          promotedAt: new Date().toISOString(),
        })
        break
      }
    }

    return this.updateCandidate(id, (candidate) => ({
      ...candidate,
      status: 'promoted',
      promotedAt: new Date().toISOString(),
    }))
  }

  rejectCandidate(id: string, reason: string): EvolutionCandidate | null {
    return this.updateCandidate(id, (candidate) => ({
      ...candidate,
      status: 'rejected',
      rejectedAt: new Date().toISOString(),
      rejectionReason: reason.trim(),
    }))
  }

  getOverview(): EvolutionOverview {
    const observations = this.listObservations(1000)
    const candidates = this.listCandidates({ limit: 1000 })

    return {
      observations: observations.length,
      candidates: {
        draft: candidates.filter((candidate) => candidate.status === 'draft').length,
        verified: candidates.filter((candidate) => candidate.status === 'verified').length,
        promoted: candidates.filter((candidate) => candidate.status === 'promoted').length,
        rejected: candidates.filter((candidate) => candidate.status === 'rejected').length,
      },
      byKind: {
        prompt: candidates.filter((candidate) => candidate.kind === 'prompt').length,
        rule: candidates.filter((candidate) => candidate.kind === 'rule').length,
        'test-hint': candidates.filter((candidate) => candidate.kind === 'test-hint').length,
      },
      recentObservations: observations.slice(0, 5).map(buildObservationSummary),
      recentCandidates: candidates.slice(0, 5).map(buildCandidateSummary),
    }
  }

  listCandidateSummaries(filters: CandidateListFilters = {}): EvolutionCandidateSummary[] {
    return this.listCandidates(filters).map(buildCandidateSummary)
  }

  private listJsonDir<T>(dir: string): T[] {
    try {
      return readdirSync(dir)
        .filter((file) => file.endsWith('.json'))
        .map((file) => readJsonFile<T>(join(dir, file)))
        .filter((item): item is T => Boolean(item))
        .sort((a, b) => {
          const aValue = (a as { updatedAt?: string; createdAt?: string }).updatedAt || (a as { createdAt?: string }).createdAt || ''
          const bValue = (b as { updatedAt?: string; createdAt?: string }).updatedAt || (b as { createdAt?: string }).createdAt || ''
          return bValue.localeCompare(aValue)
        })
    } catch {
      return []
    }
  }

  private updateCandidate(id: string, mutate: (candidate: EvolutionCandidate) => EvolutionCandidate): EvolutionCandidate | null {
    const current = this.loadCandidate(id)
    if (!current) return null
    const next = mutate(structuredClone(current))
    next.id = current.id
    next.updatedAt = new Date().toISOString()
    writeJsonFile(join(this.candidatesDir, `${current.id}.json`), next)
    return next
  }

  private formatEvidenceReferences(candidate: EvolutionCandidate): string[] {
    return mergeEvidence(candidate.evidence || []).map((item) => {
      const parts = [
        item.workSessionId ? `workSession:${item.workSessionId}` : null,
        item.taskRunId ? `taskRun:${item.taskRunId}` : null,
        item.sessionId ? `session:${item.sessionId}` : null,
        item.usageRef ? `usage:${item.usageRef}` : null,
      ].filter(Boolean)
      return parts.join(' · ') || 'manual-evidence'
    })
  }

  private enforceMutationCeiling(candidate: EvolutionCandidate): MutationCeilingResult {
    if (candidate.kind === 'prompt' || candidate.kind === 'rule') {
      return { blocked: false }
    }
    if (candidate.kind !== 'test-hint') {
      return { blocked: true, reason: `unsupported candidate kind "${candidate.kind}"` }
    }
    if (!candidate.cwd) {
      return { blocked: true, reason: 'test-hint candidate missing cwd' }
    }
    if (!candidate.targetPath) {
      return { blocked: true, reason: 'test-hint candidate missing targetPath' }
    }

    const absoluteTarget = resolve(candidate.cwd, candidate.targetPath)
    const srcDir = resolve(candidate.cwd, 'src')
    if (absoluteTarget === srcDir || absoluteTarget.startsWith(`${srcDir}/`)) {
      return { blocked: true, reason: 'mutation ceiling: evolution cannot write into src/**', resolvedPath: absoluteTarget }
    }

    const allowedDir = resolve(candidate.cwd, 'agent-eval', 'generated', 'test-hints')
    if (!(absoluteTarget === allowedDir || absoluteTarget.startsWith(`${allowedDir}/`))) {
      return {
        blocked: true,
        reason: 'mutation ceiling: test-hints must stay inside agent-eval/generated/test-hints/**',
        resolvedPath: absoluteTarget,
      }
    }

    if (existsSync(candidate.cwd) && lstatSync(candidate.cwd).isSymbolicLink()) {
      return {
        blocked: true,
        reason: 'mutation ceiling: cwd cannot be a symlinked path',
        resolvedPath: absoluteTarget,
      }
    }

    const realCwd = realpathSync(candidate.cwd)
    if (existingPathContainsSymlink(absoluteTarget, resolve(candidate.cwd))) {
      return {
        blocked: true,
        reason: 'mutation ceiling: symlinked path components are not allowed',
        resolvedPath: absoluteTarget,
      }
    }
    if (!(resolve(allowedDir) === resolve(candidate.cwd, 'agent-eval', 'generated', 'test-hints'))) {
      return {
        blocked: true,
        reason: 'mutation ceiling: invalid allowlist root',
        resolvedPath: absoluteTarget,
      }
    }
    if (existsSync(allowedDir) && !(realpathSync(allowedDir) === realCwd || realpathSync(allowedDir).startsWith(`${realCwd}/`))) {
      return {
        blocked: true,
        reason: 'mutation ceiling: allowlist root resolves outside the project cwd',
        resolvedPath: absoluteTarget,
      }
    }

    return { blocked: false, resolvedPath: absoluteTarget }
  }

  private autoDraftCandidate(observation: EvolutionObservation): void {
    if (observation.severity === 'info' && normalizeSummary(observation.summary) !== AUTO_PROMPT_SUMMARY) {
      return
    }

    const siblings = this.listObservations(50)
      .filter((item) => item.id !== observation.id)
      .filter((item) => item.category === observation.category)
      .filter((item) => normalizeSummary(item.summary) === normalizeSummary(observation.summary))

    if (siblings.length < 1) return

    if (normalizeSummary(observation.summary) === AUTO_PROMPT_SUMMARY) {
      this.createCandidate({
        kind: 'prompt',
        title: 'Reduce context pressure before hard compaction',
        content: 'Keep tool output concise, summarize finished steps early, and compact conversation context before the session reaches hard limits.',
        cwd: observation.cwd,
        metadata: {
          category: 'chat-ops',
          autoKey: `prompt:${normalizeSummary(observation.summary)}`,
        },
        evidence: [observation.evidence, ...siblings.map((item) => item.evidence)],
        sourceObservationIds: [observation.id, ...siblings.map((item) => item.id)],
      })
      return
    }

    if (observation.severity === 'warn' || observation.severity === 'error') {
      this.createCandidate({
        kind: 'rule',
        title: `Guard recurring issue: ${observation.summary.slice(0, 52)}`,
        content: `When "${observation.summary}" recurs, stop retrying blindly, inspect the linked evidence, and check existing postmortems before continuing.`,
        cwd: observation.cwd,
        metadata: {
          failureMode: `Repeated failure loop around "${observation.summary}"`,
          autoKey: `rule:${normalizeSummary(observation.summary)}`,
        },
        evidence: [observation.evidence, ...siblings.map((item) => item.evidence)],
        sourceObservationIds: [observation.id, ...siblings.map((item) => item.id)],
      })
    }
  }
}
