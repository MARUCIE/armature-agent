import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ModelChoice } from '../src/model-catalog.js'
import { ChatSessionEmitter } from '../src/ui/session.js'
import { handleReadonlySlashCommand } from '../src/commands/chat-slash-readonly.js'

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

afterEach(() => {
  vi.restoreAllMocks()
})

describe('chat readonly slash helpers', () => {
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

  it('renders session status through the ink emitter', () => {
    const session = new ChatSessionEmitter()
    const blocks: string[] = []
    session.on('text', (event) => { blocks.push(event.text) })

    const result = handleReadonlySlashCommand({
      ...baseOptions,
      cmd: '/status',
      arg: '',
      modeLabel: 'reflect',
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
    expect(blocks[0]).toContain('**Status** — openai/gpt-5.4')
    expect(blocks[0]).toContain('| Turns | 3 |')
    expect(blocks[0]).toContain('| Mode | reflect |')
    expect(blocks[0]).toContain('42% (1,234 / 32,000 tokens)')
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
})
