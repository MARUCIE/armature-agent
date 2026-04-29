import { execSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ModelChoice } from '../src/model-catalog.js'
import { ChatSessionEmitter } from '../src/ui/session.js'
import { handleReadonlySlashCommand } from '../src/commands/chat-slash-readonly.js'
import { stripAnsi } from '../src/ui/command-output.js'

const MODEL_CHOICES: ModelChoice[] = [
  {
    model: 'gpt-5.4',
    provider: 'openai',
    contextWindow: 256_000,
    maxOutput: 64_000,
    pricing: [1.25, 10],
    agentic: 'recommended',
  },
  {
    model: 'gemini-3.1-flash-lite',
    provider: 'google',
    contextWindow: 2_000_000,
    maxOutput: 65_536,
    pricing: [0.1, 0.4],
    agentic: 'caution',
    note: 'optimized for speed and auxiliary work; tool-use quality may be weaker on complex coding tasks',
  },
]

const modelControl = {
  getModel: () => 'gpt-5.4',
  getProvider: () => 'openai',
  getChoices: () => MODEL_CHOICES,
}

const baseOptions = {
  resolved: {
    provider: 'openai',
    apiKey: 'test-openai-key',
    baseURL: 'https://example.invalid/v1',
  },
  history: [
    { role: 'system', content: 'You are Orca.' },
    { role: 'user', content: 'hello' },
    { role: 'assistant', content: 'hi' },
  ],
  stats: {
    turns: 3,
    totalInputTokens: 1200,
    totalOutputTokens: 450,
    startTime: Date.now() - 60_000,
  },
  cwd: '/tmp/orca-cli',
  mc: modelControl,
}

function createDiffRepo(updatedContent: string): string {
  const cwd = mkdtempSync(join(tmpdir(), 'orca-diff-'))
  writeFileSync(join(cwd, 'fixture.txt'), 'before\n', 'utf-8')
  execSync('git init', { cwd, stdio: 'ignore' })
  execSync('git config user.email "test@example.com"', { cwd, stdio: 'ignore' })
  execSync('git config user.name "Test User"', { cwd, stdio: 'ignore' })
  execSync('git add fixture.txt', { cwd, stdio: 'ignore' })
  execSync('git commit -m init', { cwd, stdio: 'ignore' })
  writeFileSync(join(cwd, 'fixture.txt'), updatedContent, 'utf-8')
  return cwd
}

function createExternalDiffScript(cwd: string): string {
  const scriptPath = join(cwd, 'external-diff.sh')
  writeFileSync(scriptPath, '#!/bin/sh\necho "external diff invoked" >&2\nexit 99\n', 'utf-8')
  chmodSync(scriptPath, 0o755)
  return scriptPath
}

function normalizeRenderedText(text: string): string {
  return text
    .split('\n')
    .map((line) => stripAnsi(line).trim())
    .filter(Boolean)
    .join('\n')
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('chat readonly slash helpers', () => {
  it('renders /model show through the ink emitter', () => {
    const session = new ChatSessionEmitter()
    const blocks: string[] = []
    session.on('system_message', (event) => { blocks.push(event.text) })

    const result = handleReadonlySlashCommand({
      ...baseOptions,
      cmd: '/model',
      arg: 'show',
      session,
    })

    expect(result).toBe('handled')
    expect(blocks.join('')).toContain('provider: openai  model: gpt-5.4')
    expect(blocks.join('')).toContain('context: 256K')
  })

  it('keeps /model show semantics aligned between legacy and ink output', () => {
    const legacyLines: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...args) => { legacyLines.push(args.join(' ')) })
    handleReadonlySlashCommand({
      ...baseOptions,
      cmd: '/model',
      arg: 'show',
    })

    const session = new ChatSessionEmitter()
    const inkBlocks: string[] = []
    session.on('system_message', (event) => { inkBlocks.push(event.text) })
    handleReadonlySlashCommand({
      ...baseOptions,
      cmd: '/model',
      arg: 'show',
      session,
    })

    expect(normalizeRenderedText(legacyLines.join('\n'))).toBe(normalizeRenderedText(inkBlocks.join('\n')))
  })

  it('emits markdown help in ink mode', () => {
    const session = new ChatSessionEmitter()
    const blocks: string[] = []
    session.on('text', (event) => { blocks.push(event.text) })

    const result = handleReadonlySlashCommand({
      ...baseOptions,
      cmd: '/help',
      arg: '',
      session,
    })

    expect(result).toBe('handled')
    expect(blocks[0]).toContain('**Session**')
    expect(blocks[0]).toContain('/status')
    expect(blocks[0]).toContain('/doctor')
  })

  it('opens TaskRun evidence in an ink detail panel', async () => {
    const previousOrcaHome = process.env.ORCA_HOME
    const orcaHome = mkdtempSync(join(tmpdir(), 'orca-slash-evidence-store-'))
    const projectDir = mkdtempSync(join(tmpdir(), 'orca-slash-evidence-project-'))
    mkdirSync(join(projectDir, 'outputs', 'test'), { recursive: true })
    writeFileSync(join(projectDir, 'outputs', 'test', 'chat.log'), 'first\nsecond\nthird\n', 'utf-8')
    process.env.ORCA_HOME = orcaHome

    try {
      const {
        createTaskRun,
        createWorkSession,
        finishTaskRun,
      } = await import('../src/work-session-store.js')
      const workSession = createWorkSession({
        sourceSurface: 'chat',
        cwd: projectDir,
        provider: 'openai',
        model: 'gpt-5.4',
      })
      const taskRun = createTaskRun({
        workSessionId: workSession.id,
        kind: 'chat',
        title: 'Ink evidence task',
        surface: 'cli',
        cwd: projectDir,
        provider: 'openai',
        model: 'gpt-5.4',
      })
      finishTaskRun(taskRun.id, {
        status: 'completed',
        summary: 'verified in queue',
        evidence: [{ label: 'chat-log', path: 'outputs/test/chat.log' }],
      })

      const session = new ChatSessionEmitter()
      const panels: Array<{ title: string; subtitle?: string; body: string }> = []
      session.on('detail_panel', (event) => { panels.push(event.info) })

      const result = handleReadonlySlashCommand({
        ...baseOptions,
        cwd: projectDir,
        cmd: '/evidence',
        arg: taskRun.id,
        session,
      })

      expect(result).toBe('handled')
      expect(panels).toHaveLength(1)
      expect(panels[0]?.title).toBe('TaskRun Evidence')
      expect(panels[0]?.subtitle).toContain(taskRun.id)
      expect(panels[0]?.body).toContain('verified in queue')
      expect(panels[0]?.body).toContain('chat-log')
      expect(panels[0]?.body).toContain('third')
    } finally {
      if (previousOrcaHome === undefined) delete process.env.ORCA_HOME
      else process.env.ORCA_HOME = previousOrcaHome
      rmSync(orcaHome, { recursive: true, force: true })
      rmSync(projectDir, { recursive: true, force: true })
    }
  })

  it('renders session status through the ink emitter', () => {
    const session = new ChatSessionEmitter()
    const blocks: string[] = []
    session.on('text', (event) => { blocks.push(event.text) })

    const result = handleReadonlySlashCommand({
      ...baseOptions,
      cmd: '/status',
      arg: '',
      sessionId: 'auto-2026-04-21T11-00',
      modeLabel: 'reflect',
      modelPolicyLabel: 'inherit-current',
      effortLabel: 'max',
      permissionLabel: 'plan',
      permissionSource: 'project',
      toolPolicyLabel: 'planning-only tools',
      outputStyleLabel: 'architecture plan',
      session,
      harness: {
        tokenBudget: {
          getBudget: () => ({
            utilizationPct: 42,
            historyTokensEst: 1234,
            contextWindow: 32000,
          }),
        },
      },
    })

    expect(result).toBe('handled')
    expect(blocks[0]).toContain('**Status** — openai/gpt\\-5\\.4')
    expect(blocks[0]).toContain('| Turns | 3 |')
    expect(blocks[0]).toContain('| Session | auto-2026-04-21T11-00 |')
    expect(blocks[0]).toContain('| Mode | reflect |')
    expect(blocks[0]).toContain('| Model Policy | inherit-current |')
    expect(blocks[0]).toContain('| Effort | max |')
    expect(blocks[0]).toContain('| Permissions | plan (project) |')
    expect(blocks[0]).toContain('| Tool Policy | planning-only tools |')
    expect(blocks[0]).toContain('| Output Style | architecture plan |')
    expect(blocks[0]).toContain('42% (1,234 / 32,000 tokens)')
  })


  it('escapes markdown metacharacters in /status ink output', () => {
    const session = new ChatSessionEmitter()
    const blocks: string[] = []
    session.on('text', (event) => { blocks.push(event.text) })

    const result = handleReadonlySlashCommand({
      ...baseOptions,
      cmd: '/status',
      arg: '',
      sessionId: 'auto-2026-04-21T11-00',
      cwd: '/tmp/pipe|path`name\nnext',
      modeLabel: 'reflect|danger',
      modelPolicyLabel: 'inherit-current',
      effortLabel: 'high',
      permissionLabel: 'auto',
      permissionSource: 'session',
      toolPolicyLabel: 'run + edit tools',
      outputStyleLabel: 'debug walkthrough',
      mc: {
        getModel: () => 'gpt-5.4`beta',
        getProvider: () => 'openai|lab',
        getChoices: () => MODEL_CHOICES,
      },
      session,
    })

    expect(result).toBe('handled')
    expect(blocks[0]).toContain('**Status** — openai\\|lab/gpt\\-5\\.4\\`beta')
    expect(blocks[0]).toContain('| Mode | reflect\\|danger |')
    expect(blocks[0]).toContain('| Model Policy | inherit-current |')
    expect(blocks[0]).toContain('| Effort | high |')
    expect(blocks[0]).toContain('| Permissions | auto (session) |')
    expect(blocks[0]).toContain('| Tool Policy | run + edit tools |')
    expect(blocks[0]).toContain('| Output Style | debug walkthrough |')
    expect(blocks[0]).toContain('| cwd | ``/tmp/pipe|path`name next`` |')
  })

  it('escapes markdown metacharacters in /cost ink output', () => {
    const session = new ChatSessionEmitter()
    const blocks: string[] = []
    session.on('text', (event) => { blocks.push(event.text) })

    const result = handleReadonlySlashCommand({
      ...baseOptions,
      cmd: '/cost',
      arg: '',
      mc: {
        getModel: () => 'gpt-5.4`beta',
        getProvider: () => 'openai',
        getChoices: () => MODEL_CHOICES,
      },
      session,
    })

    expect(result).toBe('handled')
    expect(blocks[0]).toContain('**Cost** — gpt\\-5\\.4\\`beta')
    expect(blocks[0]).toContain('| Input | 1,200 tokens |')
  })

  it('renders /tokens through the ink emitter', () => {
    const session = new ChatSessionEmitter()
    const blocks: string[] = []
    session.on('system_message', (event) => { blocks.push(event.text) })

    const result = handleReadonlySlashCommand({
      ...baseOptions,
      cmd: '/tokens',
      arg: '',
      session,
    })

    expect(result).toBe('handled')
    expect(blocks[0]).toContain('input:  1,200 tokens')
    expect(blocks[0]).toContain('output: 450 tokens')
    expect(blocks[0]).toContain('total:  1,650 tokens')
  })

  it('renders /stats through the ink emitter', () => {
    const session = new ChatSessionEmitter()
    const blocks: string[] = []
    session.on('system_message', (event) => { blocks.push(event.text) })

    const result = handleReadonlySlashCommand({
      ...baseOptions,
      cmd: '/stats',
      arg: '',
      session,
    })

    expect(result).toBe('handled')
    expect(blocks[0]).toContain('model:    gpt-5.4')
    expect(blocks[0]).toContain('turns:    3')
    expect(blocks[0]).toContain('tokens:   1,650')
  })

  it('renders /diff as fenced markdown in ink mode and strips control sequences', () => {
    const cwd = createDiffRepo('after\n```diff\n\u001b[31mspoof\u001b[0m\n')
    try {
      const session = new ChatSessionEmitter()
      const blocks: string[] = []
      session.on('text', (event) => { blocks.push(event.text) })

      const result = handleReadonlySlashCommand({
        ...baseOptions,
        cmd: '/diff',
        arg: '',
        cwd,
        session,
      })

      expect(result).toBe('handled')
      expect(blocks[0]?.startsWith('````diff\n')).toBe(true)
      expect(blocks[0]).toContain('```diff')
      expect(blocks[0]).not.toContain('\u001b[31m')
      expect(blocks[0]).toContain('spoof')
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('ignores ambient GIT_EXTERNAL_DIFF when rendering /diff', () => {
    const cwd = createDiffRepo('after\n')
    const previousExternalDiff = process.env.GIT_EXTERNAL_DIFF
    process.env.GIT_EXTERNAL_DIFF = createExternalDiffScript(cwd)
    try {
      const session = new ChatSessionEmitter()
      const blocks: string[] = []
      const notices: Array<{ text: string; level: string }> = []
      session.on('text', (event) => { blocks.push(event.text) })
      session.on('system_message', (event) => { notices.push({ text: event.text, level: event.level }) })

      const result = handleReadonlySlashCommand({
        ...baseOptions,
        cmd: '/diff',
        arg: '',
        cwd,
        session,
      })

      expect(result).toBe('handled')
      expect(blocks[0]).toContain('fixture.txt')
      expect(notices).not.toContainEqual(expect.objectContaining({ level: 'error' }))
    } finally {
      if (previousExternalDiff === undefined) delete process.env.GIT_EXTERNAL_DIFF
      else process.env.GIT_EXTERNAL_DIFF = previousExternalDiff
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('emits a truncation notice for oversized /diff ink output', () => {
    const cwd = createDiffRepo(`${'very large diff line\n'.repeat(400)}trailer\n`)
    try {
      const session = new ChatSessionEmitter()
      const blocks: string[] = []
      const notices: string[] = []
      session.on('text', (event) => { blocks.push(event.text) })
      session.on('system_message', (event) => { notices.push(event.text) })

      const result = handleReadonlySlashCommand({
        ...baseOptions,
        cmd: '/diff',
        arg: '',
        cwd,
        session,
      })

      expect(result).toBe('handled')
      expect(blocks[0]).toContain('fixture.txt')
      expect(notices).toContain('(truncated)')
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('routes unsafe /git arguments through ink error output', () => {
    const session = new ChatSessionEmitter()
    const messages: Array<{ text: string; level: string }> = []
    session.on('system_message', (event) => { messages.push({ text: event.text, level: event.level }) })

    const result = handleReadonlySlashCommand({
      ...baseOptions,
      cmd: '/git',
      arg: 'diff --output=owned.patch HEAD',
      session,
    })

    expect(result).toBe('handled')
    expect(messages).toContainEqual({
      text: 'Unsafe /git argument: --output=owned.patch',
      level: 'error',
    })
  })

  it('renders safe /git output through the ink emitter', () => {
    const cwd = createDiffRepo('after\n')
    try {
      const session = new ChatSessionEmitter()
      const messages: Array<{ text: string; level: string }> = []
      session.on('system_message', (event) => { messages.push({ text: event.text, level: event.level }) })

      const result = handleReadonlySlashCommand({
        ...baseOptions,
        cmd: '/git',
        arg: 'log --oneline -1',
        cwd,
        session,
      })

      expect(result).toBe('handled')
      expect(messages.some((event) => event.level === 'info' && event.text.includes('init'))).toBe(true)
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('returns pick_model for /models and prints the numbered list', () => {
    const lines: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...args) => { lines.push(args.join(' ')) })

    const result = handleReadonlySlashCommand({
      ...baseOptions,
      cmd: '/models',
      arg: '',
    })

    expect(result).toBe('pick_model')
    const output = lines.join('\n')
    expect(output).toContain('Available models:')
    expect(output).toContain('gpt-5.4')
    expect(output).toContain('Enter number (1-2):')
  })

  it('routes /models through the ink picker flow without printing a legacy list', () => {
    const session = new ChatSessionEmitter()
    const blocks: string[] = []
    session.on('system_message', (event) => { blocks.push(event.text) })

    const result = handleReadonlySlashCommand({
      ...baseOptions,
      cmd: '/models',
      arg: '',
      session,
    })

    expect(result).toBe('pick_model')
    expect(blocks).toHaveLength(0)
  })

  it('keeps ink /models in picker mode instead of mirroring the legacy numbered list', () => {
    const session = new ChatSessionEmitter()
    const inkBlocks: string[] = []
    session.on('system_message', (event) => { inkBlocks.push(event.text) })
    const result = handleReadonlySlashCommand({
      ...baseOptions,
      cmd: '/models',
      arg: '',
      session,
    })

    expect(result).toBe('pick_model')
    expect(inkBlocks).toHaveLength(0)
  })

  it('defaults readonly mode labels to default instead of permission labels', () => {
    const lines: string[] = []
    vi.spyOn(console, 'log').mockImplementation((...args) => { lines.push(args.join(' ')) })

    const result = handleReadonlySlashCommand({
      ...baseOptions,
      cmd: '/config',
      arg: '',
    })

    expect(result).toBe('handled')
    expect(lines.join('\n')).toContain('mode:     default')
  })

  it('leaves mutating /model set commands to the main slash dispatcher', () => {
    const result = handleReadonlySlashCommand({
      ...baseOptions,
      cmd: '/model',
      arg: 'set claude-sonnet-4.6',
    })

    expect(result).toBe('not_handled')
  })

  it('opens the numbered picker for bare /model', () => {
    const result = handleReadonlySlashCommand({
      ...baseOptions,
      cmd: '/model',
      arg: '',
    })

    expect(result).toBe('pick_model')
  })

  it('leaves /model target shorthand to the main slash dispatcher', () => {
    const result = handleReadonlySlashCommand({
      ...baseOptions,
      cmd: '/model',
      arg: 'gpt-5.4',
    })

    expect(result).toBe('not_handled')
  })
})
