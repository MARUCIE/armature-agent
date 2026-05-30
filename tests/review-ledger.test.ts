import { describe, it, expect, vi, beforeEach } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { ModelEndpoint } from '../src/config.js'

const mockState = vi.hoisted(() => {
  const calls: Array<{ model: string; prompt: string }> = []
  return { calls }
})

vi.mock('../src/providers/openai-compat.js', () => ({
  chatOnce: async (opts: { model: string }, prompt: string) => {
    mockState.calls.push({ model: opts.model, prompt })
    if (prompt.includes('synthesis reviewer')) {
      return {
        text: [
          '# Multi-Model Review Synthesis',
          '',
          '## Priority Ledger',
          '| ID | Checkbox | Severity | Title | Reported By | Agreement | Evidence | Risk | Human Decision | Fix Status | Review Verdict |',
          '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
          '| CR-001 | [ ] | Critical | double settlement | model-a, model-b | 2/2 | rebate.ts:42 | duplicate payouts | pending | not-started | pending |',
        ].join('\n'),
        inputTokens: 100,
        outputTokens: 50,
      }
    }
    return {
      text: [
        `# Review Report - ${opts.model}`,
        '',
        '## Critical',
        '- [ ] double settlement',
        '  - File: rebate.ts:42',
        '  - Evidence: same order id is settled twice',
        '  - Risk: duplicate payouts',
        '  - Suggested fix: enforce idempotency key',
        '',
        '## High',
        '(none)',
        '',
        '## Medium',
        '(none)',
      ].join('\n'),
      inputTokens: 80,
      outputTokens: 40,
    }
  },
}))

import {
  buildIndependentReviewPrompt,
  buildSynthesisPrompt,
  parseReviewModelList,
  runReviewLedger,
  slugifyReviewLabel,
} from '../src/review-ledger.js'

beforeEach(() => {
  mockState.calls.length = 0
})

function endpoint(model: string): ModelEndpoint {
  return { model, apiKey: 'test', baseURL: 'https://test.example.com/v1', provider: 'test' }
}

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'orca-review-ledger-'))
}

describe('review ledger helpers', () => {
  it('slugifies review labels for stable artifact paths', () => {
    expect(slugifyReviewLabel('TinyShip Rebate PR #42')).toBe('tinyship-rebate-pr-42')
    expect(slugifyReviewLabel('!!!')).toBe('review')
  })

  it('parses explicit model lists and deduplicates entries', () => {
    expect(parseReviewModelList('gpt-5.5, composer-2.5, gpt-5.5', ['fallback'])).toEqual([
      'gpt-5.5',
      'composer-2.5',
    ])
    expect(parseReviewModelList(undefined, ['fallback'])).toEqual(['fallback'])
  })

  it('builds independent review prompts with the human gate contract', () => {
    const prompt = buildIndependentReviewPrompt({
      label: 'pr-7',
      title: 'Rebate change',
      focus: 'money correctness',
      diff: 'diff --git a/rebate.ts b/rebate.ts\n+settle(order)',
    }, 'gpt-5.5')

    expect(prompt).toContain('# Review Report - gpt-5.5')
    expect(prompt).toContain('## Critical')
    expect(prompt).toContain('- [ ] <issue title>')
    expect(prompt).toContain('money correctness')
    expect(prompt).toContain('Do not decide whether to fix')
  })

  it('builds synthesis prompts that preserve reviewer agreement', () => {
    const prompt = buildSynthesisPrompt({
      label: 'pr-7',
      title: 'Rebate change',
      diff: 'diff',
    }, [
      { model: 'model-a', text: 'Critical issue', durationMs: 1, inputTokens: 2, outputTokens: 3 },
      { model: 'model-b', text: '', durationMs: 1, inputTokens: 0, outputTokens: 0, error: 'failed' },
    ])

    expect(prompt).toContain('Priority Ledger')
    expect(prompt).toContain('model-a')
    expect(prompt).toContain('ERROR: failed')
    expect(prompt).toContain('Human Decision = accepted')
  })
})

describe('review ledger runner', () => {
  it('dry-run writes prompts and human-gate templates without calling models', async () => {
    const dir = tempDir()
    try {
      const result = await runReviewLedger({
        source: { label: 'local', title: 'Local diff', diff: 'diff --git a/a.ts b/a.ts\n+const x = 1' },
        models: ['model-a', 'model-b'],
        judgeModel: 'judge',
        outputDir: dir,
        dryRun: true,
        resolveEndpoint: endpoint,
      })

      expect(mockState.calls).toHaveLength(0)
      expect(result.dryRun).toBe(true)
      expect(existsSync(join(dir, '01_model-a_prompt.md'))).toBe(true)
      expect(existsSync(join(dir, '02_model-b_prompt.md'))).toBe(true)
      expect(readFileSync(join(dir, '05_human_decisions.md'), 'utf-8')).toContain('accepted')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('runs independent reviewers plus judge and writes review artifacts', async () => {
    const dir = tempDir()
    try {
      const result = await runReviewLedger({
        source: { label: 'pr-42', title: 'TinyShip rebate', diff: 'diff --git a/rebate.ts b/rebate.ts\n+settle(order)' },
        models: ['model-a', 'model-b'],
        judgeModel: 'judge-model',
        outputDir: dir,
        resolveEndpoint: endpoint,
      })

      expect(mockState.calls.map((call) => call.model)).toEqual(expect.arrayContaining(['model-a', 'model-b', 'judge-model']))
      expect(result.reports).toHaveLength(2)
      expect(result.synthesis?.text).toContain('Multi-Model Review Synthesis')
      expect(readFileSync(join(dir, '01_model-a.md'), 'utf-8')).toContain('double settlement')
      expect(readFileSync(join(dir, '04_synthesis.md'), 'utf-8')).toContain('CR-001')
      expect(readFileSync(join(dir, 'review-state.json'), 'utf-8')).toContain('"schemaVersion"')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
