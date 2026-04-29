import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { appendFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
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

  it('takes over a running task-run with an operator lease', async () => {
    vi.resetModules()
    const {
      createTaskRun,
      createWorkSession,
      getTaskRunById,
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
      title: 'Takeover task',
      surface: 'cli',
      cwd: '/tmp/project',
      provider: 'openai',
      model: 'gpt-5.4',
    })

    const logs: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...args) => { logs.push(args.join(' ')) })

    const command = createQueueCommand()
    await command.parseAsync(['node', 'queue', 'takeover', taskRun.id, '--holder', 'operator-a', '--ttl', '30s'])

    const output = logs.join('\n')
    expect(output).toContain(`TaskRun ${taskRun.id} takeover lease acquired`)
    expect(output).toContain('takeover: new')
    expect(output).toContain('holder=operator-a')

    const persisted = getTaskRunById(taskRun.id)
    expect(persisted?.taskRun.lease?.holder).toBe('operator-a')
  })

  it('refuses an active takeover lease without force', async () => {
    vi.resetModules()
    const {
      claimTaskRunLease,
      createTaskRun,
      createWorkSession,
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
      title: 'Already leased task',
      surface: 'cli',
      cwd: '/tmp/project',
      provider: 'openai',
      model: 'gpt-5.4',
    })
    claimTaskRunLease(taskRun.id, {
      holder: 'operator-a',
      ttlMs: 60_000,
    })

    const errors: string[] = []
    vi.spyOn(console, 'error').mockImplementation((...args) => { errors.push(args.join(' ')) })
    vi.spyOn(process, 'exit').mockImplementation(((code?: string | number | null) => {
      throw new Error(`exit:${code}`)
    }) as never)

    const command = createQueueCommand()
    await expect(command.parseAsync(['node', 'queue', 'takeover', taskRun.id, '--holder', 'operator-b'])).rejects.toThrow('exit:1')

    const output = errors.join('\n')
    expect(output).toContain('already has an active lease')
    expect(output).toContain('holder=operator-a')
    expect(output).toContain('--force')
  })

  it('resumes a chat task-run by acquiring a lease and printing the continue command', async () => {
    vi.resetModules()
    const {
      createTaskRun,
      createWorkSession,
      getTaskRunById,
    } = await import('../src/work-session-store.js')
    const { createQueueCommand } = await import('../src/commands/queue.js')

    const projectDir = join(homeDir, 'project with spaces')
    mkdirSync(projectDir, { recursive: true })
    const session = createWorkSession({
      sourceSurface: 'chat',
      cwd: projectDir,
      provider: 'openai',
      model: 'gpt-5.4',
      savedSessionId: 'auto-2026-04-29T10-00-00',
    })
    const taskRun = createTaskRun({
      workSessionId: session.id,
      kind: 'chat',
      title: 'Resume this chat',
      surface: 'cli',
      cwd: projectDir,
      provider: 'openai',
      model: 'gpt-5.4',
    })

    const logs: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...args) => { logs.push(args.join(' ')) })

    const command = createQueueCommand()
    await command.parseAsync(['node', 'queue', 'resume', taskRun.id, '--holder', 'operator-r', '--ttl', '30s'])

    const output = logs.join('\n')
    expect(output).toContain(`TaskRun ${taskRun.id} resume plan`)
    expect(output).toContain('state: resumable')
    expect(output).toContain('saved session: auto-2026-04-29T10-00-00')
    expect(output).toContain("orca chat --cwd '")
    expect(output).toContain("--continue auto-2026-04-29T10-00-00")
    expect(output).toContain('holder=operator-r')

    const persisted = getTaskRunById(taskRun.id)
    expect(persisted?.taskRun.lease?.holder).toBe('operator-r')
  })

  it('refuses resume for task-runs without replay metadata', async () => {
    vi.resetModules()
    const {
      createTaskRun,
      createWorkSession,
      getTaskRunById,
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
      title: 'Unsupported replay',
      surface: 'cli',
      cwd: '/tmp/project',
      provider: 'openai',
      model: 'gpt-5.4',
    })

    const logs: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...args) => { logs.push(args.join(' ')) })
    vi.spyOn(process, 'exit').mockImplementation(((code?: string | number | null) => {
      throw new Error(`exit:${code}`)
    }) as never)

    const command = createQueueCommand()
    await expect(command.parseAsync(['node', 'queue', 'resume', taskRun.id])).rejects.toThrow('exit:1')

    const output = logs.join('\n')
    expect(output).toContain('state: unsupported')
    expect(output).toContain('does not carry replay metadata yet')
    expect(getTaskRunById(taskRun.id)?.taskRun.lease).toBeUndefined()
  })

  it('schedules the next unleased resumable task-run', async () => {
    vi.resetModules()
    const {
      claimTaskRunLease,
      createTaskRun,
      createWorkSession,
      getTaskRunById,
    } = await import('../src/work-session-store.js')
    const { createQueueCommand } = await import('../src/commands/queue.js')

    const projectDir = join(homeDir, 'project')
    mkdirSync(projectDir, { recursive: true })
    const activeSession = createWorkSession({
      sourceSurface: 'chat',
      cwd: projectDir,
      provider: 'openai',
      model: 'gpt-5.4',
      savedSessionId: 'active-session',
    })
    const active = createTaskRun({
      workSessionId: activeSession.id,
      kind: 'chat',
      title: 'Already leased',
      surface: 'cli',
      cwd: projectDir,
      provider: 'openai',
      model: 'gpt-5.4',
    })
    claimTaskRunLease(active.id, { holder: 'operator-a', ttlMs: 60_000 })

    const unsupportedSession = createWorkSession({
      sourceSurface: 'run',
      cwd: projectDir,
      provider: 'openai',
      model: 'gpt-5.4',
    })
    createTaskRun({
      workSessionId: unsupportedSession.id,
      kind: 'run',
      title: 'Unsupported run',
      surface: 'cli',
      cwd: projectDir,
      provider: 'openai',
      model: 'gpt-5.4',
    })

    const resumableSession = createWorkSession({
      sourceSurface: 'chat',
      cwd: projectDir,
      provider: 'openai',
      model: 'gpt-5.4',
      savedSessionId: 'next-session',
    })
    const resumable = createTaskRun({
      workSessionId: resumableSession.id,
      kind: 'chat',
      title: 'Next resumable',
      surface: 'cli',
      cwd: projectDir,
      provider: 'openai',
      model: 'gpt-5.4',
    })

    const logs: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...args) => { logs.push(args.join(' ')) })

    const command = createQueueCommand()
    await command.parseAsync(['node', 'queue', 'schedule', '--holder', 'scheduler'])

    const output = logs.join('\n')
    expect(output).toContain(`TaskRun ${resumable.id} resume plan`)
    expect(output).toContain('--continue next-session')
    expect(getTaskRunById(active.id)?.taskRun.lease?.holder).toBe('operator-a')
    expect(getTaskRunById(resumable.id)?.taskRun.lease?.holder).toBe('scheduler')
  })

  it('follows a task-run evidence snapshot once', async () => {
    vi.resetModules()
    const {
      createTaskRun,
      createWorkSession,
      finishTaskRun,
    } = await import('../src/work-session-store.js')
    const { createQueueCommand } = await import('../src/commands/queue.js')

    const projectDir = join(homeDir, 'project')
    mkdirSync(join(projectDir, 'outputs', 'test'), { recursive: true })
    writeFileSync(join(projectDir, 'outputs', 'test', 'queue.log'), 'first\nsecond\nthird\n', 'utf-8')

    const session = createWorkSession({
      sourceSurface: 'run',
      cwd: projectDir,
      provider: 'openai',
      model: 'gpt-5.4',
    })
    const taskRun = createTaskRun({
      workSessionId: session.id,
      kind: 'run',
      title: 'Follow task',
      surface: 'cli',
      cwd: projectDir,
      provider: 'openai',
      model: 'gpt-5.4',
    })
    finishTaskRun(taskRun.id, {
      status: 'completed',
      evidence: [{ label: 'test-log', path: 'outputs/test/queue.log' }],
    })

    const logs: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...args) => { logs.push(args.join(' ')) })

    const command = createQueueCommand()
    await command.parseAsync(['node', 'queue', 'follow', taskRun.id, '--once', '--lines', '2'])

    const output = logs.join('\n')
    expect(output).toContain(`Following TaskRun ${taskRun.id}`)
    expect(output).toContain('test-log:')
    expect(output).not.toContain('first')
    expect(output).toContain('second')
    expect(output).toContain('third')
  })

  it('opens a task-run evidence drawer with artifact previews', async () => {
    vi.resetModules()
    const {
      appendTaskRunApproval,
      createTaskRun,
      createWorkSession,
      finishTaskRun,
    } = await import('../src/work-session-store.js')
    const { createQueueCommand } = await import('../src/commands/queue.js')

    const projectDir = join(homeDir, 'project')
    mkdirSync(join(projectDir, 'outputs', 'test'), { recursive: true })
    writeFileSync(join(projectDir, 'outputs', 'test', 'queue.log'), 'first\nsecond\nthird\n', 'utf-8')
    writeFileSync(join(projectDir, 'outputs', 'test', 'change.diff'), '--- a/file\n+++ b/file\n+added\n', 'utf-8')

    const session = createWorkSession({
      sourceSurface: 'run',
      cwd: projectDir,
      provider: 'openai',
      model: 'gpt-5.4',
    })
    const taskRun = createTaskRun({
      workSessionId: session.id,
      kind: 'run',
      title: 'Evidence drawer task',
      surface: 'cli',
      cwd: projectDir,
      provider: 'openai',
      model: 'gpt-5.4',
    })
    finishTaskRun(taskRun.id, {
      status: 'completed',
      summary: 'drawer ready',
      evidence: [
        { label: 'test-log', path: 'outputs/test/queue.log' },
        { label: 'review-diff', path: 'outputs/test/change.diff' },
      ],
    })
    appendTaskRunApproval(taskRun.id, {
      toolName: 'write_file',
      ruleKey: 'write_file|path=src/generated.ts',
      preview: 'write 28 bytes to src/generated.ts',
      permissionMode: 'plan',
      decision: 'allowed',
      scope: 'project',
      source: 'prompt',
    })

    const logs: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...args) => { logs.push(args.join(' ')) })

    const command = createQueueCommand()
    await command.parseAsync(['node', 'queue', 'evidence', taskRun.id, '--lines', '2'])

    const output = logs.join('\n')
    expect(output).toContain(`TaskRun Evidence Drawer ${taskRun.id}`)
    expect(output).toContain('summary: drawer ready')
    expect(output).toContain('Approval Timeline')
    expect(output).toContain('allowed write_file scope=project source=prompt')
    expect(output).toContain('rule: write_file|path=src/generated.ts')
    expect(output).toContain('preview: write 28 bytes to src/generated.ts')
    expect(output).toContain('[1/2] test-log')
    expect(output).toContain('type: log')
    expect(output).toContain('size:')
    expect(output).not.toContain('first')
    expect(output).toContain('second')
    expect(output).toContain('third')
    expect(output).toContain('[2/2] review-diff')
    expect(output).toContain('type: diff')
    expect(output).toContain('+added')
  })

  it('formats task-run evidence as markdown for the ink detail panel', async () => {
    vi.resetModules()
    const {
      appendTaskRunApproval,
      createTaskRun,
      createWorkSession,
      finishTaskRun,
    } = await import('../src/work-session-store.js')
    const {
      buildTaskRunEvidenceDrawer,
      formatTaskRunEvidenceDrawerMarkdown,
    } = await import('../src/commands/queue.js')

    const projectDir = join(homeDir, 'project')
    mkdirSync(join(projectDir, 'outputs', 'test'), { recursive: true })
    writeFileSync(join(projectDir, 'outputs', 'test', 'queue.log'), 'alpha\nbeta\ngamma\n', 'utf-8')

    const session = createWorkSession({
      sourceSurface: 'chat',
      cwd: projectDir,
      provider: 'openai',
      model: 'gpt-5.4',
    })
    const taskRun = createTaskRun({
      workSessionId: session.id,
      kind: 'chat',
      title: 'Evidence side panel task',
      surface: 'cli',
      cwd: projectDir,
      provider: 'openai',
      model: 'gpt-5.4',
    })
    finishTaskRun(taskRun.id, {
      status: 'completed',
      summary: 'side panel ready',
      evidence: [{ label: 'chat-log', path: 'outputs/test/queue.log' }],
    })
    appendTaskRunApproval(taskRun.id, {
      toolName: 'edit_file',
      ruleKey: 'edit_file|path=src/command.ts',
      preview: 'edit src/command.ts',
      permissionMode: 'auto',
      decision: 'preapproved',
      source: 'allowlist',
    })

    const drawer = buildTaskRunEvidenceDrawer(taskRun.id, { lines: '2' })
    expect(drawer?.approvals[0]).toMatchObject({
      toolName: 'edit_file',
      decision: 'preapproved',
      source: 'allowlist',
    })
    expect(drawer?.evidence[0]).toMatchObject({
      label: 'chat-log',
      type: 'log',
      status: 'present',
    })

    const markdown = formatTaskRunEvidenceDrawerMarkdown(drawer!)
    expect(markdown).toContain(`# TaskRun Evidence ${taskRun.id}`)
    expect(markdown).toContain('- Summary: side panel ready')
    expect(markdown).toContain('## Approval Timeline')
    expect(markdown).toContain('`preapproved` `edit_file`')
    expect(markdown).toContain('- Rule: `edit_file|path=src/command.ts`')
    expect(markdown).toContain('- Preview: edit src/command.ts')
    expect(markdown).not.toContain('alpha')
    expect(markdown).toContain('beta')
    expect(markdown).toContain('gamma')
    expect(markdown).toContain('```text')
  })

  it('shows missing evidence entries in the evidence drawer', async () => {
    vi.resetModules()
    const {
      createTaskRun,
      createWorkSession,
      finishTaskRun,
    } = await import('../src/work-session-store.js')
    const { createQueueCommand } = await import('../src/commands/queue.js')

    const projectDir = join(homeDir, 'project')
    mkdirSync(projectDir, { recursive: true })

    const session = createWorkSession({
      sourceSurface: 'run',
      cwd: projectDir,
      provider: 'openai',
      model: 'gpt-5.4',
    })
    const taskRun = createTaskRun({
      workSessionId: session.id,
      kind: 'run',
      title: 'Missing evidence task',
      surface: 'cli',
      cwd: projectDir,
      provider: 'openai',
      model: 'gpt-5.4',
    })
    finishTaskRun(taskRun.id, {
      status: 'failed',
      evidence: [{ label: 'missing-log', path: 'outputs/test/missing.log' }],
    })

    const logs: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...args) => { logs.push(args.join(' ')) })

    const command = createQueueCommand()
    await command.parseAsync(['node', 'queue', 'evidence', taskRun.id])

    const output = logs.join('\n')
    expect(output).toContain('missing-log')
    expect(output).toContain('status: missing')
    expect(output).toContain('outputs/test/missing.log')
  })

  it('streams appended evidence until a task run completes', async () => {
    vi.resetModules()
    const {
      createTaskRun,
      createWorkSession,
      finishTaskRun,
      updateTaskRun,
    } = await import('../src/work-session-store.js')
    const { createQueueCommand } = await import('../src/commands/queue.js')

    const projectDir = join(homeDir, 'project')
    mkdirSync(join(projectDir, 'outputs', 'test'), { recursive: true })
    const logPath = join(projectDir, 'outputs', 'test', 'live.log')
    writeFileSync(logPath, 'start\n', 'utf-8')

    const session = createWorkSession({
      sourceSurface: 'run',
      cwd: projectDir,
      provider: 'openai',
      model: 'gpt-5.4',
    })
    const taskRun = createTaskRun({
      workSessionId: session.id,
      kind: 'run',
      title: 'Live task',
      surface: 'cli',
      cwd: projectDir,
      provider: 'openai',
      model: 'gpt-5.4',
    })
    updateTaskRun(taskRun.id, (current) => ({
      ...current,
      evidence: [{ label: 'live-log', path: 'outputs/test/live.log' }],
    }))

    const logs: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...args) => { logs.push(args.join(' ')) })

    const command = createQueueCommand()
    const followPromise = command.parseAsync(['node', 'queue', 'follow', taskRun.id, '--interval', '100', '--lines', '1'])
    await new Promise((resolve) => setTimeout(resolve, 120))
    appendFileSync(logPath, 'next\n', 'utf-8')
    finishTaskRun(taskRun.id, {
      status: 'completed',
      evidence: [{ label: 'live-log', path: 'outputs/test/live.log' }],
    })
    await followPromise

    const output = logs.join('\n')
    expect(output).toContain('start')
    expect(output).toContain('status: completed')
    expect(output).toContain('next')
  })
})
