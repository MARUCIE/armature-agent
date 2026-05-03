export const CRITIQUE_CHECKPOINTS = [
  'after_plan',
  'after_complex_implementation',
  'before_test_execution',
  'stuck_loop',
  'manual',
] as const

export type CritiqueCheckpoint = typeof CRITIQUE_CHECKPOINTS[number]
export type CritiqueVerdict = 'pass' | 'warn' | 'fail'
export type CritiqueSeverity = 'critical' | 'high' | 'medium' | 'low'
export type CritiqueCategory =
  | 'correctness'
  | 'security'
  | 'data'
  | 'test_coverage'
  | 'architecture'
  | 'permission'
  | 'performance'
  | 'maintainability'
  | 'ux'
  | 'other'

export interface CritiqueRiskSignals {
  diffLineCount: number
  changedFileCount: number
  criticalPathWeight?: number
  repeatedFailureWeight?: number
  securityOrDataWeight?: number
  userUncertaintyWeight?: number
}

export interface CritiqueDecision {
  checkpoint: CritiqueCheckpoint
  riskScore: number
  threshold: number
  shouldRun: boolean
  reason: string
}

export interface CritiqueFinding {
  severity: CritiqueSeverity
  category: CritiqueCategory
  file?: string
  line?: number
  claim: string
  evidence: string
  suggested_fix: string
  confidence: 'low' | 'medium' | 'high'
  requires_user_decision: boolean
}

export interface CritiqueResult {
  checkpoint: CritiqueCheckpoint
  verdict: CritiqueVerdict
  summary: string
  findings: CritiqueFinding[]
  must_fix_before_continue: string[]
  recommended_next_action: string
}

export interface CritiqueContext {
  checkpoint: CritiqueCheckpoint
  userGoal: string
  mainPlan?: string
  diff?: string
  changedFiles?: string[]
  testOutput?: string
  projectRules?: Array<{ path: string; content: string }>
  riskSignals: CritiqueRiskSignals
  riskScore: number
}

export interface CritiqueDryRun {
  checkpoint: CritiqueCheckpoint
  reviewerModel: string
  riskScore: number
  threshold: number
  shouldRun: boolean
  reason: string
  diffLineCount: number
  changedFileCount: number
  changedFiles: string[]
  prompt?: string
}

export function isCritiqueCheckpoint(value: string): value is CritiqueCheckpoint {
  return (CRITIQUE_CHECKPOINTS as readonly string[]).includes(value)
}

export function parseCritiqueCheckpoint(value: string): CritiqueCheckpoint {
  if (isCritiqueCheckpoint(value)) return value
  throw new Error(`Invalid critique checkpoint "${value}". Expected one of: ${CRITIQUE_CHECKPOINTS.join(', ')}`)
}

export function calculateCritiqueRiskScore(signals: CritiqueRiskSignals): number {
  const score =
    0.25 * normalizeCount(signals.diffLineCount, 800) +
    0.20 * normalizeCount(signals.changedFileCount, 12) +
    0.20 * normalizeWeight(signals.criticalPathWeight) +
    0.15 * normalizeWeight(signals.repeatedFailureWeight) +
    0.10 * normalizeWeight(signals.securityOrDataWeight) +
    0.10 * normalizeWeight(signals.userUncertaintyWeight)

  return Math.round(score * 1000) / 1000
}

export function decideCritiqueRun(
  checkpoint: CritiqueCheckpoint,
  riskScore: number,
  force = false,
): CritiqueDecision {
  if (force || checkpoint === 'manual') {
    return {
      checkpoint,
      riskScore,
      threshold: 0,
      shouldRun: true,
      reason: force ? 'forced by caller' : 'manual checkpoint requested',
    }
  }

  const threshold = checkpoint === 'before_test_execution' || checkpoint === 'stuck_loop'
    ? 0.45
    : 0.65

  return {
    checkpoint,
    riskScore,
    threshold,
    shouldRun: riskScore >= threshold,
    reason: riskScore >= threshold
      ? `risk score ${riskScore} meets threshold ${threshold}`
      : `risk score ${riskScore} below threshold ${threshold}`,
  }
}

export function inferModelFamily(model: string): string {
  const lower = model.toLowerCase()
  if (lower.includes('claude') || lower.includes('anthropic')) return 'claude'
  if (lower.includes('gpt') || lower.startsWith('o1') || lower.startsWith('o3') || lower.startsWith('o4')) return 'gpt'
  if (lower.includes('gemini') || lower.includes('gemma')) return 'gemini'
  if (lower.includes('qwen')) return 'qwen'
  if (lower.includes('deepseek')) return 'deepseek'
  if (lower.includes('grok') || lower.includes('xai')) return 'grok'
  if (lower.includes('llama') || lower.includes('kimi') || lower.includes('glm') || lower.includes('local')) return 'local'
  return 'unknown'
}

export function chooseComplementaryReviewer(activeModel: string): string {
  switch (inferModelFamily(activeModel)) {
    case 'claude':
      return 'gpt-5.4'
    case 'gpt':
    case 'gemini':
    case 'deepseek':
    case 'grok':
      return 'claude-sonnet-4-20250514'
    case 'qwen':
    case 'local':
    case 'unknown':
    default:
      return 'gpt-5.4'
  }
}

export function countDiffChangedLines(diff: string): number {
  if (!diff.trim()) return 0
  return diff.split('\n').filter((line) => {
    if (!line.startsWith('+') && !line.startsWith('-')) return false
    return !line.startsWith('+++') && !line.startsWith('---')
  }).length
}

export function buildCritiquePrompt(context: CritiqueContext): string {
  const rules = (context.projectRules || [])
    .map((entry) => `### ${entry.path}\n${truncate(entry.content, 4000)}`)
    .join('\n\n') || '(no project rules provided)'

  const changedFiles = context.changedFiles?.length
    ? context.changedFiles.map((file) => `- ${file}`).join('\n')
    : '(none detected)'

  return `You are Orca's Rubber Duck Critique reviewer.

You are read-only. Do not propose shell commands that mutate the workspace unless they are framed as a recommendation for the main agent to validate. Your job is to challenge the main agent's plan, implementation, tests, and risk assumptions before execution continues.

## Checkpoint
${context.checkpoint}

## Original User Goal
${context.userGoal || '(not provided)'}

## Main Agent Plan
${context.mainPlan ? truncate(context.mainPlan, 6000) : '(not provided)'}

## Risk Score
${context.riskScore}

## Risk Signals
\`\`\`json
${JSON.stringify(context.riskSignals, null, 2)}
\`\`\`

## Changed Files
${changedFiles}

## Current Diff
\`\`\`diff
${context.diff ? truncate(context.diff, 18000) : '(no diff provided)'}
\`\`\`

## Test Or Log Output
\`\`\`text
${context.testOutput ? truncate(context.testOutput, 8000) : '(not provided)'}
\`\`\`

## Project Rules
${rules}

Return JSON only, using this schema:
\`\`\`json
{
  "checkpoint": "${context.checkpoint}",
  "verdict": "pass|warn|fail",
  "summary": "short synthesis",
  "findings": [
    {
      "severity": "critical|high|medium|low",
      "category": "correctness|security|data|test_coverage|architecture|permission|performance|maintainability|ux|other",
      "file": "optional/path.ts",
      "line": 123,
      "claim": "specific issue or risk",
      "evidence": "quote or concrete evidence from the context",
      "suggested_fix": "specific next fix",
      "confidence": "low|medium|high",
      "requires_user_decision": false
    }
  ],
  "must_fix_before_continue": ["critical or high-confidence blockers"],
  "recommended_next_action": "continue|revise_plan|patch_code|add_tests|ask_user"
}
\`\`\`

Severity policy:
- critical: stop before continuing.
- high: revise the patch or add regression coverage before continuing.
- medium: continue only with an explicit verification note or TODO.
- low: readability, style, or small maintainability concern.`
}

export function parseCritiqueResult(text: string, fallbackCheckpoint: CritiqueCheckpoint = 'manual'): CritiqueResult {
  const raw = extractJsonObject(text)
  const parsed = JSON.parse(raw) as Record<string, unknown>
  const checkpoint = typeof parsed.checkpoint === 'string' && isCritiqueCheckpoint(parsed.checkpoint)
    ? parsed.checkpoint
    : fallbackCheckpoint

  return {
    checkpoint,
    verdict: normalizeVerdict(parsed.verdict),
    summary: stringValue(parsed.summary, 'No summary returned.'),
    findings: Array.isArray(parsed.findings) ? parsed.findings.map(normalizeFinding) : [],
    must_fix_before_continue: Array.isArray(parsed.must_fix_before_continue)
      ? parsed.must_fix_before_continue.map((entry) => String(entry))
      : [],
    recommended_next_action: stringValue(parsed.recommended_next_action, 'continue'),
  }
}

function normalizeCount(value: number, fullScale: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0
  return Math.min(1, value / fullScale)
}

function normalizeWeight(value: number | undefined): number {
  if (!Number.isFinite(value ?? 0)) return 0
  return Math.max(0, Math.min(1, value ?? 0))
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value
  return `${value.slice(0, maxChars)}\n...(truncated ${value.length - maxChars} chars)`
}

function extractJsonObject(text: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(text)
  if (fenced?.[1]) return fenced[1].trim()

  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Critique response did not contain a JSON object')
  }
  return text.slice(start, end + 1)
}

function normalizeVerdict(value: unknown): CritiqueVerdict {
  if (value === 'pass' || value === 'warn' || value === 'fail') return value
  return 'warn'
}

function normalizeSeverity(value: unknown): CritiqueSeverity {
  if (value === 'critical' || value === 'high' || value === 'medium' || value === 'low') return value
  return 'medium'
}

function normalizeCategory(value: unknown): CritiqueCategory {
  const valid: CritiqueCategory[] = [
    'correctness',
    'security',
    'data',
    'test_coverage',
    'architecture',
    'permission',
    'performance',
    'maintainability',
    'ux',
    'other',
  ]
  return valid.includes(value as CritiqueCategory) ? value as CritiqueCategory : 'other'
}

function normalizeFinding(value: unknown): CritiqueFinding {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const line = typeof record.line === 'number' && Number.isFinite(record.line)
    ? record.line
    : undefined
  const confidence = record.confidence === 'low' || record.confidence === 'medium' || record.confidence === 'high'
    ? record.confidence
    : 'medium'

  return {
    severity: normalizeSeverity(record.severity),
    category: normalizeCategory(record.category),
    file: typeof record.file === 'string' && record.file.trim() ? record.file : undefined,
    line,
    claim: stringValue(record.claim, 'Unspecified critique finding.'),
    evidence: stringValue(record.evidence, 'No evidence provided.'),
    suggested_fix: stringValue(record.suggested_fix, 'Validate this finding before continuing.'),
    confidence,
    requires_user_decision: Boolean(record.requires_user_decision),
  }
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback
}
