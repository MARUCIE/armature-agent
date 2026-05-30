import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, symlinkSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const projectDir = fileURLToPath(new URL('..', import.meta.url))
const runnerPath = join(projectDir, 'agent-eval', 'scripts', 'run-test-matrix.py')
const secretScanPath = join(projectDir, 'agent-eval', 'scripts', 'run-secret-scan.py')
const manifestPath = join(projectDir, 'agent-eval', 'manifests', 'test-matrix.json')

describe('layered test matrix runner', () => {
  it('reads layer definitions from the manifest', () => {
    const result = spawnSync('python3', [runnerPath, '--run-id', 'runner-manifest-smoke', '--layers', 'unit', '--manifest', manifestPath], {
      cwd: projectDir,
      encoding: 'utf-8',
    })

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('"manifest": "agent-eval/manifests/test-matrix.json"')
    rmSync(join(projectDir, 'outputs', 'test-matrix', 'runner-manifest-smoke'), { recursive: true, force: true })
  })

  it('rejects path-traversal run ids before writing evidence', () => {
    const escapedPath = join(projectDir, 'evil-run-matrix')
    rmSync(escapedPath, { recursive: true, force: true })

    const result = spawnSync('python3', [runnerPath, '--run-id', '../../evil-run-matrix', '--layers', 'unit'], {
      cwd: projectDir,
      encoding: 'utf-8',
    })

    expect(result.status).not.toBe(0)
    expect(result.stdout + result.stderr).toContain('run-id may contain only letters')
    expect(existsSync(escapedPath)).toBe(false)
  })

  it('rejects dot-segment run ids before writing evidence', () => {
    const escapedPath = join(projectDir, 'outputs')

    const result = spawnSync('python3', [runnerPath, '--run-id', '..', '--layers', 'unit'], {
      cwd: projectDir,
      encoding: 'utf-8',
    })

    expect(result.status).not.toBe(0)
    expect(result.stdout + result.stderr).toContain('run-id may contain only letters')
    expect(existsSync(join(escapedPath, 'matrix.md'))).toBe(false)
  })

  it('rejects manifests outside the trusted manifests directory', () => {
    const tmpManifest = join(tmpdir(), 'armature-untrusted-manifest.json')
    writeFileSync(tmpManifest, JSON.stringify({
      id: 'untrusted',
      layers: [
        {
          id: 'unit',
          label: 'Unit',
          steps: [{ argv: ['printf', 'injected-from-manifest'] }],
          threshold: 'n/a',
          status_if_ok: 'pass',
          owner: 'test',
        },
      ],
    }), 'utf-8')

    const result = spawnSync('python3', [runnerPath, '--manifest', tmpManifest, '--run-id', 'trusted-boundary-smoke'], {
      cwd: projectDir,
      encoding: 'utf-8',
    })

    expect(result.status).not.toBe(0)
    expect(result.stdout + result.stderr).toContain('manifest must be inside agent-eval/manifests')
    rmSync(tmpManifest, { force: true })
  })

  it('rejects manifest layer ids that would escape the run directory', () => {
    const manifestFile = join(projectDir, 'agent-eval', 'manifests', 'tmp-unsafe-layer.json')
    const escapedLog = join(projectDir, 'outputs', 'tmp-path-boundary-proof.log')
    const escapedExit = join(projectDir, 'outputs', 'tmp-path-boundary-proof.exit')
    rmSync(escapedLog, { force: true })
    rmSync(escapedExit, { force: true })
    writeFileSync(manifestFile, JSON.stringify({
      id: 'unsafe-layer',
      layers: [
        {
          id: '../../tmp-path-boundary-proof',
          label: 'Unsafe',
          steps: [{ argv: ['printf', 'should-not-run'] }],
          threshold: 'n/a',
          status_if_ok: 'pass',
          owner: 'test',
        },
      ],
      gaps: [],
    }), 'utf-8')

    try {
      const result = spawnSync('python3', [runnerPath, '--manifest', manifestFile, '--run-id', 'unsafe-layer-smoke'], {
        cwd: projectDir,
        encoding: 'utf-8',
      })

      expect(result.status).not.toBe(0)
      expect(result.stdout + result.stderr).toContain('layer id may contain only letters')
      expect(existsSync(escapedLog)).toBe(false)
      expect(existsSync(escapedExit)).toBe(false)
    } finally {
      rmSync(manifestFile, { force: true })
      rmSync(join(projectDir, 'outputs', 'test-matrix', 'unsafe-layer-smoke'), { recursive: true, force: true })
    }
  })

  it('fails when a selected layer id does not exist', () => {
    const result = spawnSync('python3', [runnerPath, '--run-id', 'missing-layer-smoke', '--layers', 'does-not-exist'], {
      cwd: projectDir,
      encoding: 'utf-8',
    })

    expect(result.status).not.toBe(0)
    expect(result.stdout + result.stderr).toContain('no matching test-matrix layers selected')
    rmSync(join(projectDir, 'outputs', 'test-matrix', 'missing-layer-smoke'), { recursive: true, force: true })
  })
})

describe('secret scan helper', () => {
  it('ignores symlinks that point outside the scan root', () => {
    const root = mkdtempSync(join(tmpdir(), 'armature-secret-scan-root-'))
    const outside = mkdtempSync(join(tmpdir(), 'armature-secret-scan-outside-'))
    const outsideFile = join(outside, 'credentials.txt')
    const fakeToken = `ghp_${'ABCDEFGHIJKLMNOPQRSTUVWX123456'}`
    writeFileSync(outsideFile, fakeToken, 'utf-8')
    symlinkSync(outsideFile, join(root, 'leak.txt'))

    const result = spawnSync('python3', [secretScanPath, '--root', root], {
      cwd: projectDir,
      encoding: 'utf-8',
    })

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('secret-scan: no findings')

    rmSync(root, { recursive: true, force: true })
    rmSync(outside, { recursive: true, force: true })
  })

  it('still reports direct in-root secret matches', () => {
    const root = mkdtempSync(join(tmpdir(), 'armature-secret-scan-root-'))
    const fakeToken = `ghp_${'ABCDEFGHIJKLMNOPQRSTUVWX123456'}`
    writeFileSync(join(root, 'token.txt'), fakeToken, 'utf-8')

    const result = spawnSync('python3', [secretScanPath, '--root', root], {
      cwd: projectDir,
      encoding: 'utf-8',
    })

    expect(result.status).toBe(1)
    expect(result.stdout).toContain('token.txt:1:')

    rmSync(root, { recursive: true, force: true })
  })
})
