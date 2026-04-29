import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const projectDir = fileURLToPath(new URL('..', import.meta.url))
const manifestsDir = join(projectDir, 'agent-eval', 'manifests')
const tasksDir = join(projectDir, 'agent-eval', 'tasks')
const gradersDir = join(projectDir, 'agent-eval', 'graders')
const packageJson = JSON.parse(readFileSync(join(projectDir, 'package.json'), 'utf-8')) as {
  scripts?: Record<string, string>
}

function loadJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf-8'))
}

function loadTaskIds(): Map<string, { graders: string[] }> {
  const taskMap = new Map<string, { graders: string[] }>()
  for (const file of readdirSync(tasksDir).filter(name => name.endsWith('.json')).sort()) {
    const data = loadJson(join(tasksDir, file))
    const items = Array.isArray(data) ? data : [data]
    for (const item of items) {
      if (!item || typeof item !== 'object') continue
      const task = item as { id?: string; graders?: string[] }
      expect(task.id).toBeTruthy()
      taskMap.set(task.id!, { graders: task.graders ?? [] })
    }
  }
  return taskMap
}

function loadGraderIds(): Set<string> {
  const graderIds = new Set<string>()
  for (const file of readdirSync(gradersDir).filter(name => name.endsWith('.json')).sort()) {
    const data = loadJson(join(gradersDir, file))
    const items = Array.isArray(data) ? data : [data]
    for (const item of items) {
      if (!item || typeof item !== 'object') continue
      const grader = item as { id?: string }
      expect(grader.id).toBeTruthy()
      graderIds.add(grader.id!)
    }
  }
  return graderIds
}

describe('agent-eval manifests', () => {
  const taskMap = loadTaskIds()
  const graderIds = loadGraderIds()

  it('every task references known graders', () => {
    for (const [taskId, task] of taskMap.entries()) {
      for (const graderId of task.graders) {
        expect(graderIds.has(graderId), `${taskId} references missing grader ${graderId}`).toBe(true)
      }
    }
  })

  it('manifest task ids resolve to known tasks', () => {
    for (const file of readdirSync(manifestsDir).filter(name => name.endsWith('.json')).sort()) {
      const manifest = loadJson(join(manifestsDir, file)) as { id?: string; tasks?: string[] }
      if (!Array.isArray(manifest.tasks)) continue
      expect(manifest.id).toBeTruthy()
      expect(manifest.tasks?.length ?? 0).toBeGreaterThan(0)
      for (const taskId of manifest.tasks ?? []) {
        expect(taskMap.has(taskId), `${file} references missing task ${taskId}`).toBe(true)
      }
    }
  })

  it('release manifest includes deterministic, benchmark, and journey gates', () => {
    const release = loadJson(join(manifestsDir, 'release.json')) as { tasks?: string[] }
    expect(release.tasks).toEqual(expect.arrayContaining([
      'gate-lint',
      'gate-test',
      'gate-build',
      'gate-bench',
      'gate-cli-journey',
    ]))
  })

  it('test-matrix manifest defines the layered test policy', () => {
    const manifest = loadJson(join(manifestsDir, 'test-matrix.json')) as {
      id?: string
      layers?: Array<{
        id?: string
        steps?: Array<{ argv?: string[]; env?: Record<string, string> }>
      }>
      gaps?: string[]
    }
    expect(manifest.id).toBe('test-matrix')
    expect(Array.isArray(manifest.layers)).toBe(true)
    expect(manifest.layers?.length).toBeGreaterThan(0)
    expect(Array.isArray(manifest.gaps)).toBe(true)
    for (const layer of manifest.layers || []) {
      expect(layer.id).toBeTruthy()
      expect(Array.isArray(layer.steps)).toBe(true)
      expect(layer.steps?.length ?? 0).toBeGreaterThan(0)
      for (const step of layer.steps || []) {
        expect(Array.isArray(step.argv)).toBe(true)
        expect(step.argv?.length ?? 0).toBeGreaterThan(0)
        expect(step.argv?.every(part => typeof part === 'string' && part.length > 0)).toBe(true)
      }
    }
  })

  it('package scripts expose the eval gates', () => {
    expect(packageJson.scripts?.['eval:fast']).toBe('python3 agent-eval/scripts/run-gate.py --manifest fast')
    expect(packageJson.scripts?.['eval:nightly']).toBe('python3 agent-eval/scripts/run-gate.py --manifest nightly')
    expect(packageJson.scripts?.['eval:release']).toBe('python3 agent-eval/scripts/run-gate.py --manifest release')
  })

  it('package scripts expose the layered matrix entrypoints', () => {
    expect(packageJson.scripts?.['test:static']).toBeTruthy()
    expect(packageJson.scripts?.['test:unit']).toBeTruthy()
    expect(packageJson.scripts?.['test:contract']).toBeTruthy()
    expect(packageJson.scripts?.['test:integration']).toBeTruthy()
    expect(packageJson.scripts?.['test:e2e']).toBeTruthy()
    expect(packageJson.scripts?.['test:security']).toBeTruthy()
    expect(packageJson.scripts?.['test:resilience']).toBeTruthy()
    expect(packageJson.scripts?.['test:performance']).toBeTruthy()
    expect(packageJson.scripts?.['test:ai-eval-fast']).toBe('python3 agent-eval/scripts/run-test-matrix.py --layers ai-eval')
    expect(packageJson.scripts?.['test:matrix']).toBe('python3 agent-eval/scripts/run-test-matrix.py')
    expect(packageJson.scripts?.['test:matrix:sync']).toBe('python3 agent-eval/scripts/sync-test-matrix.py --check')
  })

  it('layer scripts stay aligned with the test-matrix manifest', () => {
    const manifest = loadJson(join(manifestsDir, 'test-matrix.json')) as {
      layers?: Array<{ id: string }>
    }
    const layerScriptName = (id: string) => id === 'ai-eval' ? 'test:ai-eval-fast' : `test:${id}`
    for (const layer of manifest.layers || []) {
      expect(packageJson.scripts?.[layerScriptName(layer.id)]).toBe(`python3 agent-eval/scripts/run-test-matrix.py --layers ${layer.id}`)
    }
    expect(packageJson.scripts?.['test:matrix']).toBe('python3 agent-eval/scripts/run-test-matrix.py')
  })

  it('ships the matrix helper scripts', () => {
    expect(existsSync(join(projectDir, 'agent-eval', 'scripts', 'run-test-matrix.py'))).toBe(true)
    expect(existsSync(join(projectDir, 'agent-eval', 'scripts', 'run-secret-scan.py'))).toBe(true)
    expect(existsSync(join(projectDir, 'agent-eval', 'scripts', 'collect-license-inventory.py'))).toBe(true)
    expect(existsSync(join(projectDir, 'agent-eval', 'scripts', 'sync-test-matrix.py'))).toBe(true)
  })
})
