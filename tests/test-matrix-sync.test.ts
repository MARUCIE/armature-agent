import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const projectDir = fileURLToPath(new URL('..', import.meta.url))
const syncScript = join(projectDir, 'agent-eval', 'scripts', 'sync-test-matrix.py')
const snippetPath = join(projectDir, 'agent-eval', 'generated', 'test-matrix-entrypoints.md')

describe('test-matrix sync', () => {
  it('reports clean sync state', () => {
    const result = spawnSync('python3', [syncScript, '--check'], {
      cwd: projectDir,
      encoding: 'utf-8',
    })

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('test-matrix sync: ok')
  })

  it('ships a generated entrypoint snippet', () => {
    expect(existsSync(snippetPath)).toBe(true)
    const snippet = readFileSync(snippetPath, 'utf-8')
    expect(snippet).toContain('Generated from `agent-eval/manifests/test-matrix.json`.')
    expect(snippet).toContain('npm run test:static')
    expect(snippet).toContain('npm run test:matrix')
    expect(snippet).toContain('npm run test:matrix:sync')
  })

  it('keeps the sync check script wired', () => {
    const packageJson = JSON.parse(readFileSync(join(projectDir, 'package.json'), 'utf-8')) as { scripts?: Record<string, string> }
    expect(packageJson.scripts?.['test:matrix:sync']).toBe('python3 agent-eval/scripts/sync-test-matrix.py --check')
  })
})
