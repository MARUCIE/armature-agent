import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('queue command', () => {
  const previousHome = process.env.HOME
  const previousOrcaHome = process.env.ORCA_HOME
  let homeDir: string
  let orcaHome: string

  beforeEach(() => {
    homeDir = join(tmpdir(), `orca-queue-home-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
    orcaHome = join(tmpdir(), `orca-queue-store-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
    mkdirSync(homeDir, { recursive: true })
    mkdirSync(orcaHome, { recursive: true })
    process.env.HOME = homeDir
    process.env.ORCA_HOME = orcaHome
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
    if (previousHome === undefined) delete process.env.HOME
    else process.env.HOME = previousHome
    if (previousOrcaHome === undefined) delete process.env.ORCA_HOME
    else process.env.ORCA_HOME = previousOrcaHome
    try { rmSync(homeDir, { recursive: true, force: true }) } catch { /* ignore */ }
    try { rmSync(orcaHome, { recursive: true, force: true }) } catch { /* ignore */ }
  })

  it('lists task runs and filters by status', async () => {
    vi.resetModules()
    const {
      createTaskRun,
      createWorkSession,
      finishTaskRun,
    } = await import('../src/work-session-store.js')
    const { createQueueCommand } = await import('../src/commands/queue.js')

    const session = createWorkSession({
      sourceSurface: 'run',
      cwd: '/tmp/project',
      provider: 'openai',
      model: 'gpt-5.4',
    })
    const running = createTaskRun({
      workSessionId: session.id,
      kind: 'run',
      title: 'Running task',
      surface: 'cli',
      cwd: '/tmp/project',
      provider: 'openai',
      model: 'gpt-5.4',
    })
    const completed = createTaskRun({
      workSessionId: session.id,
      kind: 'plan',
      title: 'Completed task',
      surface: 'cli',
      cwd: '/tmp/project',
      provider: 'openai',
      model: 'gpt-5.4',
    })
    finishTaskRun(completed.id, { status: 'completed', summary: 'done' })

    const logs: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...args) => { logs.push(args.join(' ')) })

    const command = createQueueCommand()
    await command.parseAsync(['node', 'queue', 'list', '--status', 'running'])

    const output = logs.join('\n')
    expect(output).toContain('TaskRun Queue')
    expect(output).toContain(running.id)
    expect(output).toContain('Running task')
    expect(output).not.toContain(completed.id)
  })

  it('shows task-run detail with evidence', async () => {
    vi.resetModules()
    const {
      createTaskRun,
      createWorkSession,
      finishTaskRun,
    } = await import('../src/work-session-store.js')
    const { createQueueCommand } = await import('../src/commands/queue.js')

    const session = createWorkSession({
      sourceSurface: 'run',
      cwd: '/tmp/project',
      provider: 'openai',
      model: 'gpt-5.4',
    })
    const taskRun = createTaskRun({
      workSessionId: session.id,
      kind: 'run',
      title: 'Evidence task',
      surface: 'cli',
      cwd: '/tmp/project',
      provider: 'openai',
      model: 'gpt-5.4',
    })
    finishTaskRun(taskRun.id, {
      status: 'completed',
      summary: 'verified',
      evidence: [{ label: 'test-log', path: 'outputs/test/queue.log' }],
    })

    const logs: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...args) => { logs.push(args.join(' ')) })

    const command = createQueueCommand()
    await command.parseAsync(['node', 'queue', 'show', taskRun.id])

    const output = logs.join('\n')
    expect(output).toContain(`TaskRun ${taskRun.id}`)
    expect(output).toContain('status: completed')
    expect(output).toContain('summary: verified')
    expect(output).toContain('test-log: outputs/test/queue.log')
  })
})
