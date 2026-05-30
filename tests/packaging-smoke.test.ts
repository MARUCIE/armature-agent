import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'

const projectDir = fileURLToPath(new URL('..', import.meta.url))
const distBinPath = join(projectDir, 'dist', 'bin', 'armature.js')
const distIndexPath = join(projectDir, 'dist', 'index.js')
let runtimeHome = ''

beforeAll(() => {
  execFileSync('npm', ['run', 'build'], {
    cwd: projectDir,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  runtimeHome = mkdtempSync(join(tmpdir(), 'armature-package-smoke-'))
}, 30_000)

afterAll(() => {
  try { rmSync(runtimeHome, { recursive: true, force: true }) } catch { /* ignore */ }
})

describe('packaging and bin entry smokes', () => {
  it('build emits the packaged dist artifacts referenced by package.json', () => {
    const pkg = JSON.parse(readFileSync(join(projectDir, 'package.json'), 'utf-8'))
    expect(pkg.bin.armature).toBe('./dist/bin/armature.js')
    expect(existsSync(distBinPath)).toBe(true)
    expect(existsSync(distIndexPath)).toBe(true)
    expect(readFileSync(distBinPath, 'utf-8')).toContain('#!/usr/bin/env node')
  })

  it('npm pack dry-run includes the shipped dist entrypoints', () => {
    const packOutput = execFileSync('npm', ['pack', '--json', '--dry-run'], {
      cwd: projectDir,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const manifest = JSON.parse(packOutput) as Array<{ files: Array<{ path: string }> }>
    const files = manifest[0]?.files.map((file) => file.path) || []

    expect(files).toContain('dist/bin/armature.js')
    expect(files).toContain('dist/index.js')
    expect(files).toContain('README.md')
  })

  it('built bin help exposes the root public surface', () => {
    const helpOutput = execFileSync('node', [distBinPath, '--help'], {
      cwd: projectDir,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    expect(helpOutput).toContain('provider-neutral agent runtime')
    expect(helpOutput).toContain('session')
    expect(helpOutput).toContain('providers')
    expect(helpOutput).toContain('--continue')
    expect(helpOutput).toContain('--safe')
  })

  it('built bin doctor json works with an isolated runtime home', () => {
    const report = JSON.parse(execFileSync('node', [distBinPath, 'doctor', '--json'], {
      cwd: projectDir,
      env: {
        ...process.env,
        HOME: runtimeHome,
        ARMATURE_HOME: join(runtimeHome, '.armature'),
        ARMATURE_PROVIDER: 'openai',
        OPENAI_API_KEY: 'test-openai-key',
      },
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })) as Record<string, any>

    expect(report.project.name).toBe('armature-agent')
    expect(report.provider.activeProvider).toBe('openai')
    expect(report.git).toBeDefined()
    expect(report.configPaths.global).toContain('.armature')
  })
})
