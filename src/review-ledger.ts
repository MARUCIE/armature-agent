/**
 * Multi-model review ledger orchestration.
 *
 * This is the code-review variant of council mode: independent reviewers first,
 * then a synthesis ledger with human decision checkboxes.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chatOnce } from './providers/openai-compat.js'
import type { ModelEndpoint } from './config.js'
import type { ModelResponse } from './multi-model.js'

export interface ReviewSource {
  label: string
  title?: string
  body?: string
  diff: string
  focus?: string
}

export interface ReviewLedgerArtifact {
  label: string
  path: string
}

export interface ReviewLedgerRunResult {
  outputDir: string
  dryRun: boolean
  diffChars: number
  promptDiffChars: number
  truncated: boolean
  reports: ModelResponse[]
  synthesis?: ModelResponse
  artifacts: ReviewLedgerArtifact[]
}

export interface ReviewLedgerRunOptions {
  source: ReviewSource
  models: string[]
  judgeModel: string
  outputDir: string
  resolveEndpoint: (model: string) => ModelEndpoint | null
  dryRun?: boolean
  maxDiffChars?: number
  onModelStart?: (model: string) => void
  onModelDone?: (model: string, durationMs: number) => void
}

const DEFAULT_MAX_DIFF_CHARS = 120_000

export const REVIEW_LEDGER_SYSTEM_PROMPT = [
  'You are an independent senior code reviewer inside Armature CLI.',
  'Prioritize real bugs, security issues, money/data correctness, concurrency, idempotency, and missing tests.',
  'Do not auto-fix anything. Produce concise, evidence-backed Markdown.',
].join(' ')

export function slugifyReviewLabel(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'review'
}

export function parseReviewModelList(value: string | undefined, fallback: string[]): string[] {
  const models = (value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
  return models.length > 0 ? [...new Set(models)] : fallback
}

export function buildIndependentReviewPrompt(source: ReviewSource, model: string, maxDiffChars = DEFAULT_MAX_DIFF_CHARS): string {
  const { text: diff, truncated } = truncateDiff(source.diff, maxDiffChars)
  const focus = source.focus ? `\n## Human Focus\n${source.focus}\n` : ''
  const body = source.body ? `\n## PR Description\n${source.body}\n` : ''
  const truncation = truncated
    ? `\nNOTE: The diff was truncated to ${maxDiffChars} characters for model context. Report only issues supported by visible evidence.\n`
    : ''

  return `You are one independent reviewer in a multi-model PR review. Do not reference or assume other reviewers.

## Source
- Label: ${source.label}
- Title: ${source.title || source.label}
- Assigned model: ${model}
${body}${focus}${truncation}
## Output Contract
Return Markdown only, with this exact severity order:

# Review Report - ${model}

## Critical
- [ ] <issue title>
  - File: <path:line or unknown>
  - Evidence: <specific diff evidence>
  - Risk: <production/business/security impact>
  - Suggested fix: <concrete fix direction>

## High
- [ ] ...

## Medium
- [ ] ...

Rules:
- Report Critical/High/Medium only. Do not include Low/style-only findings.
- Prefer fewer, higher-confidence findings over speculative lists.
- If a severity has no findings, write "(none)" under that heading.
- For money, auth, privacy, data loss, concurrency, idempotency, and migration risks, explain the failure mode.
- Do not decide whether to fix; every finding remains pending human review.

## Diff
\`\`\`diff
${diff}
\`\`\`
`
}

export function buildSynthesisPrompt(source: ReviewSource, reports: ModelResponse[]): string {
  const renderedReports = reports.map((report, index) => {
    const status = report.error ? `ERROR: ${report.error}` : report.text
    return `## Report ${index + 1}: ${report.model}\n\n${status}`
  }).join('\n\n---\n\n')

  return `You are the synthesis reviewer for a multi-model code review ledger.

## Source
- Label: ${source.label}
- Title: ${source.title || source.label}
${source.focus ? `- Human focus: ${source.focus}` : ''}

## Reviewer Reports

${renderedReports}

## Task
Merge duplicate findings, identify consensus issues, and produce one human-gated review ledger.

Output Markdown only with this structure:

# Multi-Model Review Synthesis

## Priority Ledger
| ID | Checkbox | Severity | Title | Reported By | Agreement | Evidence | Risk | Human Decision | Fix Status | Review Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CR-001 | [ ] | Critical | ... | model-a, model-b | 2/N | path:line | ... | pending | not-started | pending |

## Consensus Findings
- List issues reported by multiple models first.

## Solo Findings
- List single-model issues that still deserve human review.

## Rejected Or Deferred Candidates
- Include only if a report clearly lacks evidence or needs business context.

## Fix Loop Contract
- No issue may be fixed unless Human Decision = accepted.
- No accepted issue may be closed unless Review Verdict = verified.
- A fix agent updates Fix Status and tests; a separate review agent updates Review Verdict.

## E2E Regression Gate
- List the targeted tests and full E2E checks that should close this review.

Rules:
- Use Critical, High, Medium only.
- If multiple models report the same Critical issue, keep it near the top.
- Keep checkboxes visible in the ledger.
- Do not invent file paths or line numbers not present in the reports.
`
}

export async function runReviewLedger(opts: ReviewLedgerRunOptions): Promise<ReviewLedgerRunResult> {
  const maxDiffChars = opts.maxDiffChars ?? DEFAULT_MAX_DIFF_CHARS
  const promptDiff = truncateDiff(opts.source.diff, maxDiffChars)
  const artifacts: ReviewLedgerArtifact[] = []
  const reports: ModelResponse[] = []

  mkdirSync(opts.outputDir, { recursive: true })

  writeArtifact(artifacts, opts.outputDir, '00_diff.patch', opts.source.diff, 'full-diff')
  writeArtifact(artifacts, opts.outputDir, '00_review_packet.md', renderReviewPacket(opts.source, promptDiff.truncated, maxDiffChars), 'review-packet')

  const prompts = opts.models.map((model) => ({
    model,
    prompt: buildIndependentReviewPrompt(opts.source, model, maxDiffChars),
  }))

  if (opts.dryRun) {
    prompts.forEach(({ model, prompt }, index) => {
      writeArtifact(artifacts, opts.outputDir, `${pad(index + 1)}_${safeFileStem(model)}_prompt.md`, prompt, `prompt:${model}`)
    })
    writeArtifact(artifacts, opts.outputDir, '04_synthesis_prompt.md', buildSynthesisPrompt(opts.source, []), 'synthesis-prompt')
    writeLedgerTemplates(artifacts, opts.outputDir)
    return {
      outputDir: opts.outputDir,
      dryRun: true,
      diffChars: opts.source.diff.length,
      promptDiffChars: promptDiff.text.length,
      truncated: promptDiff.truncated,
      reports,
      artifacts,
    }
  }

  const startedAt = Date.now()
  const completedReports = await Promise.all(prompts.map(async ({ model, prompt }, index) => {
    opts.onModelStart?.(model)
    const t0 = Date.now()
    const endpoint = opts.resolveEndpoint(model)
    if (!endpoint) {
      const response: ModelResponse = {
        model,
        text: '',
        durationMs: Date.now() - t0,
        inputTokens: 0,
        outputTokens: 0,
        error: `No provider endpoint found for model "${model}"`,
      }
      writeArtifact(artifacts, opts.outputDir, `${pad(index + 1)}_${safeFileStem(model)}.md`, renderErroredReport(response), `report:${model}`)
      opts.onModelDone?.(model, response.durationMs)
      return response
    }

    try {
      const result = await chatOnce({
        apiKey: endpoint.apiKey,
        baseURL: endpoint.baseURL,
        model: endpoint.model,
        systemPrompt: REVIEW_LEDGER_SYSTEM_PROMPT,
        headers: endpoint.headers,
        reasoningEffort: endpoint.reasoningEffort,
      }, prompt)
      const response: ModelResponse = {
        model,
        text: result.text,
        durationMs: Date.now() - t0,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      }
      writeArtifact(artifacts, opts.outputDir, `${pad(index + 1)}_${safeFileStem(model)}.md`, result.text, `report:${model}`)
      opts.onModelDone?.(model, response.durationMs)
      return response
    } catch (err) {
      const response: ModelResponse = {
        model,
        text: '',
        durationMs: Date.now() - t0,
        inputTokens: 0,
        outputTokens: 0,
        error: err instanceof Error ? err.message : String(err),
      }
      writeArtifact(artifacts, opts.outputDir, `${pad(index + 1)}_${safeFileStem(model)}.md`, renderErroredReport(response), `report:${model}`)
      opts.onModelDone?.(model, response.durationMs)
      return response
    }
  }))
  reports.push(...completedReports)

  const synthesisPrompt = buildSynthesisPrompt(opts.source, reports)
  writeArtifact(artifacts, opts.outputDir, '04_synthesis_prompt.md', synthesisPrompt, 'synthesis-prompt')

  opts.onModelStart?.(`${opts.judgeModel} (judge)`)
  const judgeStartedAt = Date.now()
  const judgeEndpoint = opts.resolveEndpoint(opts.judgeModel)
  let synthesis: ModelResponse

  if (!judgeEndpoint) {
    synthesis = {
      model: opts.judgeModel,
      text: '',
      durationMs: Date.now() - judgeStartedAt,
      inputTokens: 0,
      outputTokens: 0,
      error: `No provider endpoint found for judge model "${opts.judgeModel}"`,
    }
    writeArtifact(artifacts, opts.outputDir, '04_synthesis.md', renderErroredReport(synthesis), 'synthesis')
  } else {
    try {
      const result = await chatOnce({
        apiKey: judgeEndpoint.apiKey,
        baseURL: judgeEndpoint.baseURL,
        model: judgeEndpoint.model,
        systemPrompt: REVIEW_LEDGER_SYSTEM_PROMPT,
        headers: judgeEndpoint.headers,
        reasoningEffort: judgeEndpoint.reasoningEffort,
      }, synthesisPrompt)
      synthesis = {
        model: opts.judgeModel,
        text: result.text,
        durationMs: Date.now() - judgeStartedAt,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      }
      writeArtifact(artifacts, opts.outputDir, '04_synthesis.md', result.text, 'synthesis')
    } catch (err) {
      synthesis = {
        model: opts.judgeModel,
        text: '',
        durationMs: Date.now() - judgeStartedAt,
        inputTokens: 0,
        outputTokens: 0,
        error: err instanceof Error ? err.message : String(err),
      }
      writeArtifact(artifacts, opts.outputDir, '04_synthesis.md', renderErroredReport(synthesis), 'synthesis')
    }
  }
  opts.onModelDone?.(`${opts.judgeModel} (judge)`, synthesis.durationMs)

  writeLedgerTemplates(artifacts, opts.outputDir)
  writeArtifact(artifacts, opts.outputDir, 'review-state.json', JSON.stringify({
    schemaVersion: '2026-05-29.review-ledger.v1',
    source: {
      label: opts.source.label,
      title: opts.source.title,
      hasBody: Boolean(opts.source.body),
      hasFocus: Boolean(opts.source.focus),
    },
    models: opts.models,
    judgeModel: opts.judgeModel,
    dryRun: false,
    diffChars: opts.source.diff.length,
    promptDiffChars: promptDiff.text.length,
    truncated: promptDiff.truncated,
    durationMs: Date.now() - startedAt,
    reports: reports.map((report) => ({
      model: report.model,
      durationMs: report.durationMs,
      inputTokens: report.inputTokens,
      outputTokens: report.outputTokens,
      error: report.error,
    })),
    synthesis: {
      model: synthesis.model,
      durationMs: synthesis.durationMs,
      inputTokens: synthesis.inputTokens,
      outputTokens: synthesis.outputTokens,
      error: synthesis.error,
    },
  }, null, 2) + '\n', 'state')

  return {
    outputDir: opts.outputDir,
    dryRun: false,
    diffChars: opts.source.diff.length,
    promptDiffChars: promptDiff.text.length,
    truncated: promptDiff.truncated,
    reports,
    synthesis,
    artifacts,
  }
}

function writeLedgerTemplates(artifacts: ReviewLedgerArtifact[], outputDir: string): void {
  writeArtifact(artifacts, outputDir, '05_human_decisions.md', renderHumanDecisionTemplate(), 'human-decisions')
  writeArtifact(artifacts, outputDir, '06_fix_log.md', renderFixLogTemplate(), 'fix-log')
  writeArtifact(artifacts, outputDir, '07_review_verdict.md', renderReviewVerdictTemplate(), 'review-verdict')
  writeArtifact(artifacts, outputDir, '08_e2e_evidence.md', renderE2eEvidenceTemplate(), 'e2e-evidence')
}

function writeArtifact(artifacts: ReviewLedgerArtifact[], outputDir: string, fileName: string, content: string, label: string): void {
  const path = join(outputDir, fileName)
  writeFileSync(path, content.endsWith('\n') ? content : `${content}\n`, 'utf-8')
  artifacts.push({ label, path })
}

function truncateDiff(diff: string, maxChars: number): { text: string; truncated: boolean } {
  if (diff.length <= maxChars) return { text: diff, truncated: false }
  return {
    text: `${diff.slice(0, maxChars)}\n\n[diff truncated at ${maxChars} characters; full diff is saved in 00_diff.patch]`,
    truncated: true,
  }
}

function renderReviewPacket(source: ReviewSource, truncated: boolean, maxDiffChars: number): string {
  return `# Review Packet

| Field | Value |
| --- | --- |
| Source | ${source.label} |
| Title | ${source.title || source.label} |
| Diff characters | ${source.diff.length} |
| Prompt diff cap | ${maxDiffChars} |
| Truncated for prompts | ${truncated ? 'yes' : 'no'} |

${source.focus ? `## Human Focus\n\n${source.focus}\n\n` : ''}${source.body ? `## Description\n\n${source.body}\n` : ''}
`
}

function renderHumanDecisionTemplate(): string {
  return `# Human Decisions

Copy accepted rows from \`04_synthesis.md\` into this table after human review.

| Issue ID | Human Decision | Reason | Owner | Timestamp |
| --- | --- | --- | --- | --- |
| CR-001 | pending |  |  |  |

Allowed decisions: \`pending\`, \`accepted\`, \`rejected\`, \`deferred\`.

Rule: fix agents may only modify code for issues marked \`accepted\`.
`
}

function renderFixLogTemplate(): string {
  return `# Fix Log

| Issue ID | Fix Status | Files Changed | Tests Added/Run | Notes |
| --- | --- | --- | --- | --- |
| CR-001 | not-started |  |  |  |

Allowed statuses: \`not-started\`, \`in-progress\`, \`fixed\`, \`blocked\`.
`
}

function renderReviewVerdictTemplate(): string {
  return `# Review Verdict

| Issue ID | Review Verdict | Reviewer Model/Agent | Evidence | Notes |
| --- | --- | --- | --- | --- |
| CR-001 | pending |  |  |  |

Allowed verdicts: \`pending\`, \`verified\`, \`insufficient\`, \`introduced-regression\`.
`
}

function renderE2eEvidenceTemplate(): string {
  return `# E2E Evidence

Record targeted tests first, then full regression evidence.

| Gate | Command | Result | Evidence |
| --- | --- | --- | --- |
| Targeted tests |  | pending |  |
| Full E2E |  | pending |  |

Completion rule: no review ledger is complete until accepted issues are verified and full E2E evidence is attached.
`
}

function renderErroredReport(response: ModelResponse): string {
  return `# Review Report - ${response.model}

ERROR: ${response.error || 'unknown error'}
`
}

function safeFileStem(value: string): string {
  return slugifyReviewLabel(value).slice(0, 80)
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}
