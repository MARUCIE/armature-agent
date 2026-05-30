import { describe, expect, it, vi, afterEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createCritiqueCommand } from '../src/commands/critique.js'
import { createCritiqueAutoState, maybeBuildAutoCritiqueNotice } from '../src/critique-auto.js'
import {
  buildCritiquePrompt,
  calculateCritiqueRiskScore,
  chooseComplementaryReviewer,
  countDiffChangedLines,
  decideCritiqueRun,
  parseCritiqueResult,
} from '../src/critique.js'

afterEach(() => {
  vi.restoreAllMocks()
})

function runGit(cwd: string, args: string[]): void {
  execFileSync('git', args, { cwd, stdio: 'ignore' })
}

function createCommittedWorkspace(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  runGit(dir, ['init'])
  runGit(dir, ['config', 'user.email', 'test@example.com'])
  runGit(dir, ['config', 'user.name', 'Test User'])
  writeFileSync(join(dir, 'large.txt'), 'baseline\n')
  runGit(dir, ['add', 'large.txt'])
  runGit(dir, ['commit', '-m', 'baseline'])
  return dir
}

describe('critique risk model', () => {
  it('applies the report-derived weighted risk formula', () => {
    expect(calculateCritiqueRiskScore({
      diffLineCount: 800,
      changedFileCount: 12,
      criticalPathWeight: 1,
      repeatedFailureWeight: 1,
      securityOrDataWeight: 1,
      userUncertaintyWeight: 1,
    })).toBe(1)

    expect(calculateCritiqueRiskScore({
      diffLineCount: 400,
      changedFileCount: 6,
      criticalPathWeight: 0.5,
      repeatedFailureWeight: 0,
      securityOrDataWeight: 1,
      userUncertaintyWeight: 0,
    })).toBe(0.425)
  })

  it('uses lower checkpoint thresholds for tests and stuck loops', () => {
    expect(decideCritiqueRun('after_plan', 0.64).shouldRun).toBe(false)
    expect(decideCritiqueRun('after_plan', 0.65).shouldRun).toBe(true)
    expect(decideCritiqueRun('before_test_execution', 0.45).shouldRun).toBe(true)
    expect(decideCritiqueRun('stuck_loop', 0.44).shouldRun).toBe(false)
    expect(decideCritiqueRun('manual', 0).shouldRun).toBe(true)
  })

  it('chooses a complementary model family by default', () => {
    expect(chooseComplementaryReviewer('claude-sonnet-4-20250514')).toBe('gpt-5.4')
    expect(chooseComplementaryReviewer('gpt-5.4')).toBe('claude-sonnet-4-20250514')
    expect(chooseComplementaryReviewer('gemini-2.5-pro')).toBe('claude-sonnet-4-20250514')
  })

  it('counts real changed lines without diff file headers', () => {
    const diff = [
      'diff --git a/a.ts b/a.ts',
      '--- a/a.ts',
      '+++ b/a.ts',
      '-old',
      '+new',
      ' context',
      '+another',
    ].join('\n')

    expect(countDiffChangedLines(diff)).toBe(3)
  })
})

describe('critique prompt and parsing', () => {
  it('builds a read-only structured critique prompt', () => {
    const prompt = buildCritiquePrompt({
      checkpoint: 'after_plan',
      userGoal: 'ship safely',
      mainPlan: 'edit two files',
      diff: '+change',
      changedFiles: ['src/a.ts'],
      riskSignals: { diffLineCount: 1, changedFileCount: 1 },
      riskScore: 0.1,
      projectRules: [{ path: 'AGENTS.md', content: 'verify before claiming done' }],
    })

    expect(prompt).toContain('read-only')
    expect(prompt).toContain('"checkpoint": "after_plan"')
    expect(prompt).toContain('must_fix_before_continue')
    expect(prompt).toContain('src/a.ts')
  })

  it('parses fenced JSON critique output', () => {
    const result = parseCritiqueResult(`before\n\`\`\`json
{
  "checkpoint": "manual",
  "verdict": "fail",
  "summary": "Missing tests.",
  "findings": [
    {
      "severity": "high",
      "category": "test_coverage",
      "file": "src/a.ts",
      "line": 12,
      "claim": "No regression coverage.",
      "evidence": "Diff changes behavior.",
      "suggested_fix": "Add a focused unit test.",
      "confidence": "high",
      "requires_user_decision": false
    }
  ],
  "must_fix_before_continue": ["Add regression test"],
  "recommended_next_action": "add_tests"
}
\`\`\``)

    expect(result.verdict).toBe('fail')
    expect(result.findings[0]).toMatchObject({
      severity: 'high',
      category: 'test_coverage',
      file: 'src/a.ts',
      line: 12,
    })
    expect(result.must_fix_before_continue).toEqual(['Add regression test'])
  })
})

describe('critique command', () => {
  it('supports dry-run JSON without a configured API key', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'armature-critique-'))
    const diffPath = join(dir, 'change.diff')
    writeFileSync(diffPath, ['--- a/a.ts', '+++ b/a.ts', '-old', '+new'].join('\n'))
    const messages: string[] = []
    vi.spyOn(console, 'log').mockImplementation((message?: unknown) => {
      messages.push(String(message))
    })

    try {
      const command = createCritiqueCommand()
      await command.parseAsync([
        'node',
        'armature',
        'review current diff',
        '--diff-file',
        diffPath,
        '--checkpoint',
        'after_plan',
        '--critical-path',
        '--dry-run',
        '--json',
      ])

      const payload = JSON.parse(messages.join('\n')) as {
        checkpoint: string
        shouldRun: boolean
        diffLineCount: number
      }
      expect(payload.checkpoint).toBe('after_plan')
      expect(payload.shouldRun).toBe(false)
      expect(payload.diffLineCount).toBe(2)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('automatic critique notices', () => {
  it('recommends one local checkpoint for a high-risk dirty workspace', () => {
    const dir = createCommittedWorkspace('armature-auto-critique-')
    const state = createCritiqueAutoState()

    try {
      writeFileSync(join(dir, 'large.txt'), Array.from({ length: 900 }, (_, index) => `line ${index}`).join('\n'))

      const first = maybeBuildAutoCritiqueNotice({
        cwd: dir,
        activeModel: 'gpt-5.4',
        state,
      })
      const second = maybeBuildAutoCritiqueNotice({
        cwd: dir,
        activeModel: 'gpt-5.4',
        state,
      })

      expect(first).toMatchObject({
        checkpoint: 'after_complex_implementation',
        reviewerModel: 'claude-sonnet-4-20250514',
        changedFileCount: 1,
      })
      expect(first?.riskScore).toBeGreaterThanOrEqual(0.25)
      expect(first?.message).toContain('run /critique --checkpoint after_complex_implementation')
      expect(second).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('stays quiet for small diffs and explicit disablement', () => {
    const dir = createCommittedWorkspace('armature-auto-critique-')

    try {
      writeFileSync(join(dir, 'large.txt'), 'baseline\nsmall edit\n')

      expect(maybeBuildAutoCritiqueNotice({
        cwd: dir,
        activeModel: 'gpt-5.4',
      })).toBeNull()
      expect(maybeBuildAutoCritiqueNotice({
        cwd: dir,
        activeModel: 'gpt-5.4',
        threshold: 0,
        enabled: false,
      })).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
