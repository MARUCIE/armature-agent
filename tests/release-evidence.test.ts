import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const projectDir = fileURLToPath(new URL('..', import.meta.url))
const initiativeDir = join(projectDir, 'doc', '00_project', 'initiative_orca')

interface VerificationSnapshot {
  packageVersion: string
  evidenceScope: string
  testFiles: number
  tests: number
  verifiedCommand: string
  verifiedAt: string
}

function readText(relativePath: string): string {
  return readFileSync(join(projectDir, relativePath), 'utf-8')
}

function loadJson<T>(relativePath: string): T {
  return JSON.parse(readText(relativePath)) as T
}

function countTestFiles(): number {
  return readdirSync(join(projectDir, 'tests'))
    .filter((name) => /\.test\.tsx?$/.test(name))
    .length
}

function loadSnapshot(): VerificationSnapshot {
  return loadJson<VerificationSnapshot>('doc/00_project/initiative_orca/verification_snapshot.json')
}

describe('release evidence snapshot', () => {
  it('matches package version and covers filesystem test-file count', () => {
    const snapshot = loadSnapshot()
    const pkg = loadJson<{ version: string }>('package.json')
    const discoveredTestFiles = countTestFiles()

    expect(snapshot.packageVersion).toBe(pkg.version)
    expect(snapshot.evidenceScope).toBe('active-worktree')
    expect(snapshot.testFiles).toBeGreaterThanOrEqual(discoveredTestFiles)
    expect(snapshot.tests).toBeGreaterThan(snapshot.testFiles)
    expect(snapshot.verifiedCommand).toBe('npm test')
    expect(snapshot.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('keeps README release evidence aligned', () => {
    const snapshot = loadSnapshot()
    const readme = readText('README.md')

    expect(readme).toContain(`Tests-${snapshot.tests}%20passing`)
    expect(readme).toContain(`Orca  v${snapshot.packageVersion}`)
    expect(readme).toContain(`Tested: ${snapshot.tests} automated tests`)
    expect(readme).toContain(`Orca CLI  v${snapshot.packageVersion}`)
    expect(readme).toContain(`${snapshot.testFiles} test files · ${snapshot.tests} tests`)
  })

  it('keeps active PDCA docs aligned to the same evidence', () => {
    const snapshot = loadSnapshot()
    const evidenceText = `${snapshot.testFiles} files / ${snapshot.tests} tests`
    const markdownEvidenceText = `\`${snapshot.testFiles}\` files / \`${snapshot.tests}\` tests`
    const taskPlan = readFileSync(join(initiativeDir, 'task_plan.md'), 'utf-8')
    const pdcaPlan = readFileSync(join(initiativeDir, 'PDCA_EXECUTION_PLAN.md'), 'utf-8')
    const pdcaChecklist = readFileSync(join(initiativeDir, 'PDCA_ITERATION_CHECKLIST.md'), 'utf-8')
    const audit = readFileSync(join(initiativeDir, 'SOTA_GAP_SWARM_AUDIT.md'), 'utf-8')
    const auditHtml = readFileSync(join(initiativeDir, 'SOTA_GAP_SWARM_AUDIT.html'), 'utf-8')

    expect(taskPlan).toContain(`Final \`npm test\` -> \`${snapshot.tests}\` tests passed across \`${snapshot.testFiles}\` files`)
    expect(pdcaPlan).toContain(`\`npm test\` -> ${markdownEvidenceText}`)
    expect(pdcaChecklist).toContain(`\`npm test\` -> ${markdownEvidenceText}`)
    expect(audit).toContain(`Final verification after PDCA tranche: \`npm run lint\`, \`npm run build\`, \`npm test\` (${markdownEvidenceText})`)
    expect(audit).toContain('| ORCA-SWARM-011 | P2 | Align README/doc test counts to current suite evidence | docs | done |')
    expect(auditHtml).toContain(`${snapshot.testFiles}</code> files / <code>${snapshot.tests}</code> tests`)
    expect(auditHtml).toContain('<tr><td>ORCA-SWARM-011</td><td>P2</td><td>README/doc 测试计数漂移清理</td><td>Done</td></tr>')
  })
})
