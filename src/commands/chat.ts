/**
 * `orca chat` — Interactive or one-shot agent conversation.
 *
 * Usage:
 *   orca chat "your prompt"       — one-shot query with streaming output
 *   orca chat                      — interactive REPL mode with multi-turn history
 *   orca chat --json "prompt"     — NDJSON output for CI/pipelines
 */

import { Command } from 'commander'
import { execSync } from 'node:child_process'
import { basename } from 'node:path'
import type { OrcaConfig } from '../config.js'
import { resolveConfig, resolveProvider } from '../config.js'
import { existsSync, writeFileSync, unlinkSync, statSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import {
  printRichBanner, printBanner, printProviderInfo, printProjectContext, printError,
  streamToken, ensureNewline, setLastNewline, printToolUse, printToolResult,
  printUsageSummary, printSessionSummary, emitJson,
  printSeparator, printStatusLine, printTurnSummary,
  ProgressIndicator, theme,
} from '../output.js'
import type { OutputMode } from '../output.js'
import { streamChat } from '../providers/openai-compat.js'
import { messageContentToText } from '../providers/openai-compat.js'
import type { ChatMessage, PromptContent } from '../providers/openai-compat.js'
import { StreamMarkdown } from '../markdown.js'
import { buildSystemPrompt } from '../system-prompt.js'
import { hooks } from '../hooks.js'
import { mcpClient } from '../mcp-client.js'
import { runCommandPicker } from '../command-picker.js'
import { TOOL_DEFINITIONS, setSandboxMode } from '../tools.js'
import { TokenBudgetManager } from '../token-budget.js'
import { RetryTracker } from '../retry-intelligence.js'
import { recordUsage } from '../usage-db.js'
import { consumeCompletedBackgroundJobs, readBackgroundJobLog } from '../background-jobs.js'
import { getAgenticWarning, getContextWindowForModel, getPricingForModel, listModelChoices, type ModelChoice } from '../model-catalog.js'
import { logInfo, logWarning } from '../logger.js'
import { ORCA_VERSION } from '../version.js'
import { ContextMonitor, LoopDetector } from '../harness/index.js'
import { ModeRegistry } from '../modes/index.js'
import { ThreadManager } from '../memory/threads.js'
import { matchCognitive, formatCognitiveContext } from '../cognitive-skeleton.js'
import { PostmortemLog, NotesManager, PromptRepository, LearningJournal } from '../knowledge/index.js'
import { preprocessFile } from '../preprocess/index.js'
import { detectFormat } from '../preprocess/index.js'
import {
  buildImagePromptContent,
  extractImagePromptInput,
  splitImageArgsAndPrompt,
} from './chat-input.js'
import {
  autoSaveSession,
  buildChatFlags,
  detectConfigFiles,
  saveInputHistory,
} from './chat-support.js'
import { executeReplTurn } from './chat-repl-turn.js'
import { buildPendingContinueRestore, getForcedModeRestoreWarning } from './chat-resume-state.js'
import { handleMutatingSlashCommand } from './chat-slash-mutations.js'
import { handleProxyToolCall, ResetSensitiveWaitCanceledError } from './chat-proxy-tool-call.js'
import { handleAsyncReplSlashCommand } from './chat-repl-async-slash.js'
import { handleReadonlySlashCommand } from './chat-slash-readonly.js'
import { resetConversationState } from './chat-session-state.js'
import { applyModeSystemPrompt } from './mode-system-prompt.js'
import { buildReflectSystemPrompt, prepareReflectPromptContent } from './reflect-mode.js'
import { listSlashCommandCompletions } from '../slash-commands.js'

// ── Chat Options ─────────────────────────────────────────────────

interface ChatOptions {
  model?: string
  provider?: string
  apiKey?: string
  maxTurns?: string
  systemPrompt?: string
  json?: boolean
  cwd?: string
  safe?: boolean
  effort?: string
  continue?: boolean
  image?: string[]
}

interface ChatCommandPreset {
  name?: string
  description?: string
  forceReflect?: boolean
  initialModeId?: string
}

export function createChatCommand(preset: ChatCommandPreset = {}): Command {
  const commandName = preset.name || 'chat'
  const commandDescription = preset.description || 'Start an agent conversation'

  return new Command(commandName)
    .description(commandDescription)
    .argument('[prompt...]', 'Prompt text (omit for interactive mode)')
    .option('-m, --model <model>', 'Model name (e.g., claude-sonnet-4-20250514, gpt-4.1)')
    .option('-p, --provider <provider>', 'Provider (anthropic, openai, google, poe, auto)')
    .option('-k, --api-key <key>', 'API key (overrides env)')
    .option('--max-turns <n>', 'Maximum agent turns', '25')
    .option('-s, --system-prompt <prompt>', 'System prompt')
    .option('--json', 'Output as NDJSON for CI/pipelines')
    .option('--cwd <dir>', 'Working directory')
    .option('--safe', 'Enable permission prompts for dangerous tools (default: yolo)')
    .option('--effort <level>', 'Thinking effort: low, medium, high (default), max')
    .option('-c, --continue', 'Resume the most recent saved session')
    .option('--image <paths...>', 'Attach one or more local image files (proxy one-shot path only)')
    .action(async (promptParts: string[], opts: ChatOptions) => {
      const parsedImageInput = splitImageArgsAndPrompt(promptParts, opts.image, opts.cwd || process.cwd())
      let prompt = parsedImageInput.prompt
      opts.image = parsedImageInput.imagePaths
      const outputMode: OutputMode = opts.json ? 'json' : 'streaming'

      // Stdin pipe support: cat file | orca chat "prompt"
      // If stdin is piped (not TTY), read it as context
      if (!process.stdin.isTTY && prompt) {
        try {
          const chunks: Buffer[] = []
          for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
          const stdinContent = Buffer.concat(chunks).toString('utf-8').trim()
          if (stdinContent) {
            const truncated = stdinContent.length > 20_000
              ? stdinContent.slice(0, 20_000) + '\n[... truncated]'
              : stdinContent
            prompt = `<stdin>\n${truncated}\n</stdin>\n\n${prompt}`
            if (outputMode === 'streaming') {
              process.stderr.write(`\x1b[90m  [stdin] ${(stdinContent.length / 1024).toFixed(1)}KB piped\x1b[0m\n`)
            }
          }
        } catch { /* stdin read failed — continue with prompt only */ }
      }

      try {
        const config = resolveConfig({
          cwd: opts.cwd || process.cwd(),
          flags: buildChatFlags(opts),
        })

        const resolved = resolveProvider(config)

        const cwd = opts.cwd || process.cwd()
        const reflectSystemPrompt = preset.forceReflect
          ? buildReflectSystemPrompt(config.systemPrompt || buildSystemPrompt(cwd))
          : null

        if (outputMode === 'streaming') {
          const imagePrompt = opts.image?.length ? buildImagePromptContent(prompt, opts.image, cwd) : undefined
          const hasOneShotInput = Boolean(prompt || imagePrompt)

          if (hasOneShotInput) {
            // One-shot mode: compact banner
            printBanner(TOOL_DEFINITIONS.length)
            printProviderInfo(resolved.provider, resolved.model)
            const startupWarning = getAgenticWarning(resolved.model)
            if (startupWarning) {
              console.log(`\x1b[33m  model caution: ${resolved.model} — ${startupWarning}\x1b[0m\n`)
              logWarning('model caution', { model: resolved.model, provider: resolved.provider, warning: startupWarning })
            }
          } else {
            // Interactive REPL: load hooks early so banner can show actual count
            hooks.load(cwd)

            // In ink mode, banner is rendered by the ink App component — skip legacy ANSI banner
            const willUseInk = process.stdout.isTTY && !opts.json && !process.env.ORCA_NO_INK
            if (!willUseInk) {
              const configFiles = detectConfigFiles(cwd)

              // Start heavy init (MCP, provider) BEFORE animation so it runs in parallel
              const earlyInit = (async () => {
                mcpClient.loadConfigs(cwd)
                if (mcpClient.configuredCount > 0) {
                  await mcpClient.connectAll()
                }
              })().catch(() => {})

              await printRichBanner({
                provider: resolved.provider,
                model: resolved.model,
                cwd,
                configFiles: configFiles.length > 0 ? configFiles : undefined,
                toolCount: TOOL_DEFINITIONS.length,
                hookCount: hooks.totalHooks || undefined,
                mode: opts.safe ? 'auto' : 'yolo',
                loadingPromise: earlyInit,
              })
            }
          }
        }

        const autoImageInput = !opts.image?.length && resolved.baseURL
          ? extractImagePromptInput(prompt, cwd)
          : { prompt, imagePaths: [] }
        prompt = autoImageInput.prompt
        const imagePaths = opts.image?.length ? opts.image : autoImageInput.imagePaths
        const imagePrompt = imagePaths.length ? buildImagePromptContent(prompt, imagePaths, cwd) : undefined
        const oneShotPrompt = imagePrompt ?? prompt
        if (oneShotPrompt) {
          if (imagePrompt && !resolved.baseURL) {
            throw new Error('--image is currently supported only for OpenAI-compatible proxy providers with baseURL configured.')
          }
          const oneShotMcpTools = await loadOneShotMcpTools(cwd, !imagePrompt)
          const preparedPrompt = prepareReflectPromptContent(oneShotPrompt, {
            force: preset.forceReflect,
            allowAuto: !preset.forceReflect,
          })
          if (preparedPrompt.notice && outputMode === 'streaming') {
            console.log(`\x1b[90m  ${preparedPrompt.notice}\x1b[0m`)
          }
          await executeOneShot(
            preparedPrompt.prompt,
            resolved,
            reflectSystemPrompt ? { ...config, systemPrompt: reflectSystemPrompt } : config,
            outputMode,
            cwd,
            oneShotMcpTools,
          )
        } else {
          await runREPL(resolved, config, outputMode, cwd, {
            safe: opts.safe,
            effort: opts.effort,
            continue: opts.continue,
            forceReflect: preset.forceReflect,
            initialModeId: preset.initialModeId,
          })
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        if (outputMode === 'json') {
          emitJson({ type: 'error', error: message })
        } else {
          printError(message)
        }
        process.exit(1)
      }
    })
}

export function createReflectCommand(): Command {
  return createChatCommand({
    name: 'reflect',
    description: 'Socratic debugging and root-cause investigation',
    forceReflect: true,
    initialModeId: 'reflect',
  })
}

// ── Types ───────────────────────────────────────────────────────

interface ResolvedProvider {
  provider: string
  apiKey: string
  model: string
  baseURL?: string
  sdkProvider: 'anthropic' | 'openai'
  headers?: Record<string, string>
  reasoningEffort?: string
}

type ModelSelectionTarget = string | Pick<ModelChoice, 'model' | 'provider'>

type AsyncSlashCommand = 'council' | 'race' | 'pipeline' | 'mission' | 'plan'
type SlashCommandResult = 'exit' | 'handled' | 'pick_model' | 'not_command' | AsyncSlashCommand

interface SessionStats {
  turns: number
  totalInputTokens: number
  totalOutputTokens: number
  startTime: number
  /** Output tokens per turn for sparkline visualization */
  turnTokens: number[]
}

export async function collectFencedMultilineInput(
  initialLine: string,
  readNextLine: () => Promise<string | null>,
  consumeCanceledWait?: () => boolean,
): Promise<string | null> {
  const lines: string[] = [initialLine]

  while (true) {
    const line = await readNextLine()
    if (line === null) {
      if (consumeCanceledWait?.()) return null
      break
    }
    lines.push(line)
    if (line.trim() === '```') break
  }

  return lines.join('\n')
}

// ── One-shot Mode ───────────────────────────────────────────────

export async function loadOneShotMcpTools(
  cwd: string,
  enableMcp = true,
): Promise<Array<Record<string, unknown>>> {
  if (!enableMcp) return []
  mcpClient.loadConfigs(cwd)
  if (mcpClient.configuredCount <= 0) return []
  const connected = await mcpClient.connectAll()
  if (connected.length <= 0) return []
  return await mcpClient.getToolDefinitions() as Array<Record<string, unknown>>
}

export async function executeOneShot(
  prompt: PromptContent,
  resolved: ResolvedProvider,
  config: OrcaConfig,
  outputMode: OutputMode,
  cwd: string,
  mcpTools: Array<Record<string, unknown>> = [],
): Promise<void> {
  try {
    if (resolved.baseURL) {
      await runProxyQuery({ prompt, resolved, config, outputMode, cwd, extraToolDefs: mcpTools })
    } else {
      await runSDKQuery({ prompt, resolved, config, outputMode, cwd })
    }
  } finally {
    mcpClient.disconnectAll()
  }
}

// ── Interactive REPL ────────────────────────────────────────────

const GOODBYE_MESSAGES = [
  'Goodbye!', 'See you!', 'Catch you later!', 'Happy building!', 'bye.',
]

async function runREPL(
  resolved: ResolvedProvider,
  config: OrcaConfig,
  outputMode: OutputMode,
  cwd: string,
  opts: { safe?: boolean; effort?: string; continue?: boolean; forceReflect?: boolean; initialModeId?: string } = {},
): Promise<void> {
  const { createInterface } = await import('node:readline')
  const { homedir: getHomedir } = await import('node:os')

  // Decide UI mode early — ink for TTY, legacy for pipes/JSON/env override
  const useInk = process.stdout.isTTY && outputMode !== 'json' && !process.env.ORCA_NO_INK

  // Enable input history (up/down arrow) with persistent file
  const historyFile = join(getHomedir(), '.orca', 'repl_history')
  let savedHistory: string[] = []
  try {
    const { readFileSync, existsSync } = await import('node:fs')
    if (existsSync(historyFile)) {
      savedHistory = readFileSync(historyFile, 'utf-8').trim().split('\n').filter(Boolean).slice(-100)
    }
  } catch { /* ignore */ }

  // Tab completion for slash commands.
  const SLASH_COMMANDS = listSlashCommandCompletions()
  const completer = (line: string): [string[], string] => {
    if (line.startsWith('/')) {
      const hits = SLASH_COMMANDS.filter(c => c.startsWith(line))
      return [hits.length ? hits : SLASH_COMMANDS, line]
    }
    return [[], line]
  }

  // Prevent MaxListenersExceededWarning from repeated close listeners
  process.stdin.setMaxListeners(20)
  process.stdout.setMaxListeners(20)

  // In ink mode, readline is not used — ink's useInput handles all keystrokes.
  // Create readline only for legacy mode; ink mode gets a no-op stub.
  const rl = useInk
    ? { question: () => {}, close: () => {}, prompt: () => {}, on: () => {} } as unknown as ReturnType<typeof createInterface>
    : createInterface({
        input: process.stdin,
        output: process.stdout,
        history: savedHistory,
        historySize: 100,
        completer,
      })

  if (!useInk) {
    // Ctrl+L to clear screen + live slash hint
    let lastHintLen = 0
    rl.on('SIGCONT', () => { /* resume after bg */ })
    rl.on('line', () => { lastHintLen = 0 }) // clear hint state on submit

    // Keyboard shortcuts (legacy mode only — ink handles these via useInput)
    process.stdin.on('keypress', (_ch: string, key: { name?: string; ctrl?: boolean; shift?: boolean; meta?: boolean; sequence?: string }) => {
      // Ctrl+L: clear screen and reset conversation state
      if (key && key.ctrl && key.name === 'l') {
        resetConversationState(history, stats, { tokenBudget, contextMonitor })
        resetTransientSessionState()
        process.stdout.write('\x1b[2J\x1b[H')
        console.log('\x1b[90m  conversation cleared.\x1b[0m')
        rl.prompt(true)
        return
      }

      // Shift+Tab: cycle permission mode (yolo → auto → plan → yolo)
      if (key && key.name === 'tab' && key.shift) {
        const idx = PERM_MODES.indexOf(currentPermMode)
        currentPermMode = PERM_MODES[(idx + 1) % PERM_MODES.length]!
        const modeColors: Record<PermMode, string> = {
          yolo: '\x1b[33m', auto: '\x1b[36m', plan: '\x1b[32m',
        }
        process.stderr.write(`\r\x1b[2K${modeColors[currentPermMode]}  mode: ${currentPermMode}\x1b[0m\n`)
        rl.prompt(true)
        return
      }

      // Ctrl+Z: quick undo (same as /undo)
      if (key && key.ctrl && key.name === 'z') {
        if (undoState.lastWrite?.path) {
          const { path: undoPath, oldContent } = undoState.lastWrite
          try {
            if (oldContent === null) {
              unlinkSync(undoPath)
              process.stderr.write(`\r\x1b[2K\x1b[90m  undo: deleted ${undoPath}\x1b[0m\n`)
            } else {
              writeFileSync(undoPath, oldContent, 'utf-8')
              process.stderr.write(`\r\x1b[2K\x1b[90m  undo: restored ${undoPath}\x1b[0m\n`)
            }
            undoState.lastWrite = null
          } catch { /* ignore */ }
        }
        return
      }

      // Slash command hint: when user types exactly '/', show all commands
      const line = (rl as unknown as { line: string }).line
      if (line === '/' && lastHintLen === 0) {
        const cols = process.stdout.columns || 80
        const cmdsPerRow = Math.floor(cols / 16)
        const rows: string[] = []
        for (let i = 0; i < SLASH_COMMANDS.length; i += cmdsPerRow) {
          rows.push(SLASH_COMMANDS.slice(i, i + cmdsPerRow).map(c => `\x1b[36m${c.padEnd(15)}\x1b[0m`).join(' '))
        }
        process.stdout.write(`\n${rows.join('\n')}\n\x1b[90m  tab to complete · type to filter\x1b[0m\n`)
        lastHintLen = 1
      }
    })
  }

  let stdinEnded = false
  rl.on('close', () => { stdinEnded = true })

  // Multi-turn conversation history
  const history: ChatMessage[] = []
  let sysPrompt = config.systemPrompt || buildSystemPrompt(cwd)
  if (opts.initialModeId === 'reflect') {
    sysPrompt = buildReflectSystemPrompt(sysPrompt)
  }

  // Effort-based system prompt modification
  const effortPrefix: Record<string, string> = {
    low: 'Be concise. Give brief answers.\n\n',
    high: 'Think carefully and thoroughly before answering.\n\n',
    max: 'Use deep analysis. Consider all edge cases. Think step by step.\n\n',
  }
  const effortLevel = opts.effort || 'high'
  if (effortPrefix[effortLevel]) {
    sysPrompt = effortPrefix[effortLevel] + sysPrompt
  }

  history.push({ role: 'system', content: sysPrompt })

  // Session statistics
  const stats: SessionStats = {
    turns: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    startTime: Date.now(),
    turnTokens: [],
  }

  // Session resume: --continue flag loads most recent session
  let restoredModeId: string | undefined
  let restoredSelection: { provider?: string; model: string } | undefined
  let pendingRestoredHistory: ChatMessage[] | undefined
  let pendingRestoredStats:
    | { turns: number; totalInputTokens: number; totalOutputTokens: number; startTime: number; turnTokens: number[] }
    | undefined
  let pendingRestoredName: string | undefined
  if (opts.continue) {
    const { getLastSession } = await import('./session.js')
    const last = getLastSession()
    if (last) {
      const pending = buildPendingContinueRestore(last)
      if (pending.restore) {
        pendingRestoredHistory = pending.restore.history
        pendingRestoredStats = pending.restore.stats
        pendingRestoredName = pending.restore.name
        restoredModeId = pending.restore.restoredModeId
        restoredSelection = pending.restore.restoredSelection
        const forcedModeWarning = getForcedModeRestoreWarning(opts.initialModeId, restoredModeId)
        if (forcedModeWarning) {
          console.log(`\x1b[33m  ${forcedModeWarning}\x1b[0m`)
          pendingRestoredHistory = undefined
          pendingRestoredStats = undefined
          pendingRestoredName = undefined
          restoredModeId = undefined
          restoredSelection = undefined
        }
      } else if (pending.warning) {
        console.log(`\x1b[33m  ${pending.warning}\x1b[0m`)
      }
    } else {
      console.log(`\x1b[90m  no saved sessions found — starting fresh.\x1b[0m`)
    }
  }

  const homeDir = getHomedir()
  const dirName = cwd === homeDir ? '~' : basename(cwd)

  // Mutable model (supports /model set)
  let currentModel = resolved.model
  let lastPrompt = '' // for /retry
  let currentEffort: import('../output.js').ThinkingEffort =
    (opts.effort as import('../output.js').ThinkingEffort) || 'high'
  // Permission mode: yolo (auto-approve all) → auto (approve safe, prompt dangerous) → plan (prompt all)
  type PermMode = 'yolo' | 'auto' | 'plan'
  const PERM_MODES: PermMode[] = ['yolo', 'auto', 'plan']
  let currentPermMode: PermMode = opts.safe ? 'auto' : 'yolo'

  // Sandbox mode: --safe enables OS-level sandboxing for run_command
  if (opts.safe) setSandboxMode(true)

  // SOTA agent intelligence modules
  const tokenBudget = new TokenBudgetManager(currentModel)
  const retryTracker = new RetryTracker(2)
  const contextMonitor = new ContextMonitor(getContextWindowForModel(currentModel) || 200_000)
  const loopDetector = new LoopDetector()
  const modeRegistry = new ModeRegistry()

  // Load custom modes from .orca/modes.json if present
  const customModesPath = join(cwd, '.orca', 'modes.json')
  if (existsSync(customModesPath)) {
    try {
      modeRegistry.loadFromFile(customModesPath)
    } catch { /* ignore malformed modes file */ }
  }
  if (opts.initialModeId) {
    modeRegistry.switchTo(opts.initialModeId)
  }
  const modeIdBeforeRestore = modeRegistry.getActive().id
  if (!opts.initialModeId && restoredModeId) {
    if (!modeRegistry.switchTo(restoredModeId)) {
      console.log(`\x1b[33m  saved mode unavailable: ${restoredModeId} — starting fresh session.\x1b[0m`)
      pendingRestoredHistory = undefined
      pendingRestoredStats = undefined
      pendingRestoredName = undefined
      restoredSelection = undefined
    }
  }

  if (restoredSelection) {
    try {
      const restoredResolved = resolveProvider({
        ...config,
        ...(restoredSelection.provider ? { defaultProvider: restoredSelection.provider as OrcaConfig['provider'] } : {}),
        defaultModel: restoredSelection.model,
      })
      resolved.provider = restoredResolved.provider
      resolved.apiKey = restoredResolved.apiKey
      resolved.model = restoredResolved.model
      resolved.baseURL = restoredResolved.baseURL
      resolved.sdkProvider = restoredResolved.sdkProvider
      resolved.headers = restoredResolved.headers
      resolved.reasoningEffort = restoredResolved.reasoningEffort
      currentModel = restoredResolved.model
      syncHarnessModel(currentModel)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.log(`\x1b[33m  resume model unavailable: ${message}\x1b[0m`)
      if (modeRegistry.getActive().id !== modeIdBeforeRestore) {
        modeRegistry.switchTo(modeIdBeforeRestore)
      }
      pendingRestoredHistory = undefined
      pendingRestoredStats = undefined
      pendingRestoredName = undefined
      restoredSelection = undefined
    }
  }

  if (pendingRestoredHistory && pendingRestoredStats) {
    history.length = 0
    history.push(...pendingRestoredHistory)
    stats.turns = pendingRestoredStats.turns
    stats.totalInputTokens = pendingRestoredStats.totalInputTokens
    stats.totalOutputTokens = pendingRestoredStats.totalOutputTokens
    stats.startTime = pendingRestoredStats.startTime
    stats.turnTokens = [...pendingRestoredStats.turnTokens]
    console.log(
      `\x1b[90m  Resuming session: ${pendingRestoredName} (${stats.turns} turns, ${history.length} messages)\x1b[0m`,
    )
  }

  const threadManager = new ThreadManager()

  const shortModel = (m: string) => m.length > 24 ? m.slice(0, 22) + '..' : m
  const getChoices = (): ModelChoice[] => listModelChoices(config, currentModel)

  // Get git branch (cached)
  let gitBranch: string | undefined
  try {
    const { execSync: execSyncImport } = await import('node:child_process')
    gitBranch = execSyncImport('git rev-parse --abbrev-ref HEAD 2>/dev/null', { cwd, encoding: 'utf-8' }).trim() || undefined
  } catch { /* not a git repo */ }

  // Track last turn's output speed for tok/s display
  let lastTokPerSec = 0

  // Session-wide set of file paths already injected by file expansion.
  // Used by tool-level read guard to prevent duplicate reads that explode context.
  const sessionInjectedPaths = new Set<string>()

  // ── UI Layer: ink (TTY) or legacy (pipe/non-interactive) ────────

  const { ChatSessionEmitter } = await import('../ui/session.js')
  const session = new ChatSessionEmitter()

  // Handle UI commands (keyboard shortcuts from ink InputArea)
  session.onCommand((command) => {
    switch (command) {
      case 'mode-cycle': {
        const idx = PERM_MODES.indexOf(currentPermMode)
        currentPermMode = PERM_MODES[(idx + 1) % PERM_MODES.length]!
        session.emitSystemMessage(`mode: ${currentPermMode}`, 'info')
        session.emitStatusUpdate(getStatusInfo())
        break
      }
      case 'undo': {
        if (undoState.lastWrite?.path) {
          const { path: undoPath, oldContent } = undoState.lastWrite
          try {
            if (oldContent === null) {
              unlinkSync(undoPath)
              session.emitSystemMessage(`undo: deleted ${undoPath}`, 'info')
            } else {
              writeFileSync(undoPath, oldContent, 'utf-8')
              session.emitSystemMessage(`undo: restored ${undoPath}`, 'info')
            }
            undoState.lastWrite = null
          } catch { /* ignore */ }
        } else {
          session.emitSystemMessage('nothing to undo.', 'info')
        }
        break
      }
      case 'clear-screen': {
        // UI already clears blocks; business logic resets conversation state
        resetConversationState(history, stats, { tokenBudget, contextMonitor })
        resetTransientSessionState()
        session.emitClear()
        session.emitSystemMessage('conversation cleared.', 'info')
        session.emitStatusUpdate(getStatusInfo())
        break
      }
    }
  })

  const getStatusInfo = (): import('../ui/types.js').StatusInfo => {
    const budget = tokenBudget.getBudget(history)
    const pricing = getPricingForModel(currentModel)
    let costUsd = 0
    if (pricing) {
      costUsd = (stats.totalInputTokens / 1_000_000) * pricing[0]
             + (stats.totalOutputTokens / 1_000_000) * pricing[1]
    }
      return {
        model: currentModel,
        contextPct: Math.min(100, budget.utilizationPct),
        permMode: currentPermMode,
        behaviorMode: modeRegistry.getActive().id,
        gitBranch,
        costUsd,
        tokPerSec: lastTokPerSec,
      turns: stats.turns,
      sparkline: stats.turnTokens.length > 1 ? stats.turnTokens : undefined,
    }
  }

  // Choose renderer (useInk determined at top of runREPL)
  let inkInstance: { unmount: () => void; waitUntilExit: () => Promise<void>; clear: () => void } | null = null

  if (useInk) {
    const { renderInkApp } = await import('../ui/render.js')
    const configFiles = detectConfigFiles(cwd)
    const bannerConfigFiles = detectConfigFiles(cwd)
    inkInstance = renderInkApp(session, getStatusInfo(), {
      version: ORCA_VERSION,
      cwd,
      configFiles: bannerConfigFiles.length > 0 ? bannerConfigFiles : undefined,
      toolCount: TOOL_DEFINITIONS.length,
      hookCount: hooks.totalHooks || undefined,
    })
  } else {
    const { attachLegacyRenderer } = await import('../ui/legacy-renderer.js')
    attachLegacyRenderer(session)
  }

  // Update status bar periodically (ink re-renders on state change)
  const emitStatus = () => session.emitStatusUpdate(getStatusInfo())

  function syncHarnessModel(model: string): void {
    tokenBudget.setModel(model)
    contextMonitor.setModelWindow(getContextWindowForModel(model) || 200_000)
  }

  const emitInlineNotice = (text: string, level: 'info' | 'warn' | 'error' = 'info'): void => {
    if (useInk) {
      session.emitSystemMessage(text, level)
      return
    }
    const color = level === 'error' ? '\x1b[31m' : level === 'warn' ? '\x1b[33m' : '\x1b[90m'
    console.log(`${color}  ${text}\x1b[0m`)
  }

  const syncHarnessAfterCompaction = (): void => {
    tokenBudget.clearCurrentUsage()
    contextMonitor.clearCurrentUsage()
    emitStatus()
  }

  const applyModelSelection = (target: ModelSelectionTarget): boolean => {
    const model = typeof target === 'string' ? target : target.model
    const providerOverride = typeof target === 'string' ? undefined : target.provider
    let nextResolved: ReturnType<typeof resolveProvider> | null = null

    // Re-resolve provider if the caller picked an explicit provider/model pair,
    // or if the current provider cannot route models dynamically.
    const providerConfig = config.providers[resolved.provider]
    if (providerOverride || !providerConfig?.aggregator) {
      try {
        nextResolved = resolveProvider({
          ...config,
          ...(providerOverride ? { defaultProvider: providerOverride } : {}),
          defaultModel: model,
        })
      } catch (err) {
        emitInlineNotice(`model switch failed: ${err instanceof Error ? err.message : String(err)}`, 'error')
        return false
      }
    }

    currentModel = model
    resolved.model = model
    syncHarnessModel(model)

    if (nextResolved) {
      resolved.provider = nextResolved.provider
      resolved.apiKey = nextResolved.apiKey
      resolved.baseURL = nextResolved.baseURL
      resolved.sdkProvider = nextResolved.sdkProvider
      resolved.headers = nextResolved.headers
    }

    return true
  }

  const renderStatusAndPrompt = (): string => {
    if (useInk) {
      // ink handles rendering — just return empty prompt (not used in ink mode)
      emitStatus()
      return ''
    }
    // Legacy: inline status separator
    const cols = process.stdout.columns || 80
    const statusParts = [
      currentModel.length > 22 ? currentModel.slice(0, 20) + '..' : currentModel,
      `ctx ${getStatusInfo().contextPct}%`,
      currentPermMode,
      `mode ${getStatusInfo().behaviorMode || 'default'}`,
      gitBranch || '',
      getStatusInfo().costUsd > 0
        ? (getStatusInfo().costUsd < 0.01 ? `$${getStatusInfo().costUsd.toFixed(4)}` : `$${getStatusInfo().costUsd.toFixed(2)}`)
        : '',
    ].filter(Boolean).join('  ·  ')
    const statusText = ` ${statusParts} `
    const leftPad = 2
    const rightFill = Math.max(0, cols - leftPad - statusText.length)
    console.log(`\x1b[90m${'─'.repeat(leftPad)}${statusText}${'─'.repeat(rightFill)}\x1b[0m`)
    return `${theme.prompt}❯\x1b[0m `
  }

  const promptUser = (): Promise<string | null> => {
    if (useInk) {
      // ink mode: delegate input to ink InputArea via emitter
      emitStatus()
      return session.waitForInput()
    }
    // Legacy readline mode
    return new Promise((resolve) => {
      if (stdinEnded) { resolve(null); return }
      const promptStr = renderStatusAndPrompt()
      rl.question(promptStr, (answer) => resolve(answer.trim()))
      rl.once('close', () => resolve(null))
    })
  }

  // ── Progressive Loading: prompt first, heavy init in background ──
  // Hooks: sync file reads (fast, <50ms)
  hooks.load(cwd)
  if (!useInk && hooks.totalHooks > 0) hooks.printStatus()

  // MCP + Provider + SessionStart: async background (slow, 10-60s)
  let mcpToolDefs: Array<Record<string, unknown>> = []
  let bgInitDone = false

  // Fire background init — don't await, user can start typing immediately
  const bgInit = (async () => {
    // MCP server connect (all in parallel via connectAll)
    mcpClient.loadConfigs(cwd)
    if (mcpClient.configuredCount > 0) {
      const connected = await mcpClient.connectAll()
      if (connected.length > 0) {
        const mcpTools = await mcpClient.getToolDefinitions()
        mcpToolDefs = mcpTools as Array<Record<string, unknown>>
        process.stderr.write(`\x1b[90m  MCP: ${connected.length} server(s), ${mcpTools.length} tools ready\x1b[0m\n`)
      }
    }

    // Provider preflight (non-blocking)
    if (resolved.baseURL) {
      try {
        const { chatOnce } = await import('../providers/openai-compat.js')
        await Promise.race([
          chatOnce({ apiKey: resolved.apiKey, baseURL: resolved.baseURL, model: resolved.model, maxTokens: 1 }, 'ping'),
          new Promise<null>((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000)),
        ])
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        process.stderr.write(`\x1b[33m  provider: ${msg}\x1b[0m\n`)
        process.stderr.write(`\x1b[33m  hint: check proxy/network. Session will continue.\x1b[0m\n`)
      }
    }

    // SessionStart hook
    await hooks.run('SessionStart', { event: 'SessionStart', cwd, model: currentModel })
    bgInitDone = true
  })()

  // Don't block — background init runs while user types
  bgInit.catch(err => {
    process.stderr.write(`\x1b[33m  init warn: ${err instanceof Error ? err.message : String(err)}\x1b[0m\n`)
  })

  logInfo('chat session started', { cwd, model: currentModel, provider: resolved.provider })

  if (!useInk) {
    const startupWarning = getAgenticWarning(currentModel)
    if (startupWarning) {
      console.log(`\x1b[33m  ${startupWarning}\x1b[0m`)
    }
    console.log('\x1b[90m  /help for commands. Ctrl+C to quit.\x1b[0m\n')
  }

  // Input history collector for persistence
  const inputHistory: string[] = []

  // Undo stack: track last write_file for /undo
  const undoState: UndoState = { lastWrite: null }

  // Periodic auto-save interval (every 5 turns or 3 minutes)
  let lastAutoSave = Date.now()
  const AUTO_SAVE_INTERVAL_MS = 3 * 60 * 1000

  const resetTransientSessionState = () => {
    sessionInjectedPaths.clear()
    lastTokPerSec = 0
    lastPrompt = ''
    undoState.lastWrite = null
    lastAutoSave = Date.now()
    retryTracker.reset()
    loopDetector.reset()
  }

  while (true) {
    // Periodic auto-save for crash recovery
        if (stats.turns > 0 && (Date.now() - lastAutoSave > AUTO_SAVE_INTERVAL_MS)) {
      autoSaveSession(resolved.provider, currentModel, history, stats, modeRegistry.getActive().id)
      lastAutoSave = Date.now()
    }

    const completedJobs = consumeCompletedBackgroundJobs()
    for (const job of completedJobs) {
      const status = job.status === 'completed' ? '\x1b[32mcompleted\x1b[0m' : '\x1b[31mfailed\x1b[0m'
      const exitText = typeof job.exitCode === 'number' ? `exit ${job.exitCode}` : 'no exit code'
      console.log(`\x1b[90m  background job ${job.id}\x1b[0m ${status} \x1b[90m(${exitText})\x1b[0m`)
      console.log(`\x1b[90m  command: ${job.command.slice(0, 100)}${job.command.length > 100 ? '...' : ''}\x1b[0m`)
      console.log(`\x1b[90m  log: ${job.logPath}\x1b[0m`)
      const tail = readBackgroundJobLog(job, 6)
      if (tail) {
        console.log(`\x1b[90m  tail:\n${tail.slice(0, 800)}\x1b[0m`)
      }
      logInfo('background job notification surfaced', { id: job.id, status: job.status, exitCode: job.exitCode ?? null })
      console.log()
    }

    let input = await promptUser()

    // Close input box bottom border
    // No closing border — open layout

    if (input === null) break
    if (!input) continue

    // Multi-line input: ``` opens fence mode
    if (input.startsWith('```')) {
      input = await collectFencedMultilineInput(
        input,
        () => {
          if (useInk) {
            return session.waitForInput({ cancelOnClear: true })
          }
          return new Promise<string | null>((resolve) => {
            if (stdinEnded) { resolve(null); return }
            rl.question('\x1b[90m  ...\x1b[0m ', (answer) => resolve(answer))
            rl.once('close', () => resolve(null))
          })
        },
        useInk ? () => session.consumeCanceledResetSensitiveWait() : undefined,
      )
      if (input === null) continue
    }

    // ── Crash-safe turn boundary: uncaught errors here don't kill the session ──
    try {

    // Shell mode: !command executes directly (like Amp's $ prefix)
    if (input.startsWith('!') && input.length > 1) {
      const shellCmd = input.slice(1).trim()
      if (shellCmd) {
        try {
          const result = execSync(shellCmd, {
            cwd, encoding: 'utf-8', timeout: 30_000, maxBuffer: 2 * 1024 * 1024,
            stdio: ['pipe', 'pipe', 'pipe'],
          })
          if (result.trim()) {
            console.log(`\x1b[90m${result.slice(0, 5000)}\x1b[0m`)
            if (result.length > 5000) console.log('\x1b[90m  ... (truncated)\x1b[0m')
          }
        } catch (err) {
          const execErr = err as { stdout?: string; stderr?: string; message: string; status?: number }
          const output = execErr.stderr || execErr.stdout || execErr.message
          console.log(`\x1b[31m${output.slice(0, 2000)}\x1b[0m`)
        }
      }
      continue
    }

    // Slash command dispatch
    if (input.startsWith('/')) {
      // Interactive command picker: just `/` alone opens the picker
      if (input === '/') {
        const picked = await runCommandPicker()
        if (picked) {
          input = picked
          // Fall through to process the picked command
        } else {
          continue // cancelled
        }
      }

      // Handle /effort: change thinking intensity
      if (input.startsWith('/effort')) {
        const level = input.replace('/effort', '').trim().toLowerCase()
        const valid = ['low', 'medium', 'med', 'high', 'max'] as const
        if (!level) {
          console.log(`\x1b[90m  effort: ${currentEffort}. Options: low, medium, high, max\x1b[0m`)
          continue
        }
        const mapped = level === 'med' ? 'medium' : level
        if (['low', 'medium', 'high', 'max'].includes(mapped)) {
          const old = currentEffort
          currentEffort = mapped as import('../output.js').ThinkingEffort
          console.log(`\x1b[90m  effort: ${old} → \x1b[36m${currentEffort}\x1b[0m`)
        } else {
          console.log(`\x1b[33m  invalid effort. Options: low, medium, high, max\x1b[0m`)
        }
        continue
      }

      // Handle /mode: switch behavioral profiles
      if (input.startsWith('/mode')) {
        const modeArg = input.replace('/mode', '').trim().toLowerCase()
        if (!modeArg) {
          const active = modeRegistry.getActive()
          const modes = modeRegistry.listModes()
          console.log(`\x1b[90m  Active mode: \x1b[36m${active.id}\x1b[0m\x1b[90m (${active.name})\x1b[0m`)
          console.log('\x1b[90m  Available modes:\x1b[0m')
          for (const mode of modes) {
            const marker = mode.id === active.id ? ' \x1b[36m<-\x1b[0m' : ''
            console.log(`\x1b[90m    ${mode.id.padEnd(14)} ${mode.description}${marker}\x1b[0m`)
          }
          continue
        }
        const previousMode = modeRegistry.getActive()
        if (modeRegistry.switchTo(modeArg)) {
            const mode = modeRegistry.getActive()
            // Rebuild system prompt with the exact previous mode prefix removed.
            const sysIdx = history.findIndex(m => m.role === 'system')
            if (sysIdx >= 0) {
              history[sysIdx] = {
                role: 'system',
                content: applyModeSystemPrompt({
                  currentSystemPrompt: messageContentToText(history[sysIdx]!.content),
                  previousModePrefix: previousMode.systemPromptPrefix,
                  nextModePrefix: mode.systemPromptPrefix,
                }),
              }
            }
          console.log(`\x1b[90m  mode: \x1b[36m${mode.id}\x1b[0m\x1b[90m (${mode.name})\x1b[0m`)
          if (mode.tools) {
            console.log(`\x1b[90m  tools restricted to: ${mode.tools.join(', ')}\x1b[0m`)
          }
          emitStatus()
        } else {
          console.log(`\x1b[33m  unknown mode: ${modeArg}. Use /mode to list.\x1b[0m`)
        }
        continue
      }

      // Handle /retry specially
      if (input === '/retry' || input === '/r') {
        if (!lastPrompt) {
          console.log('\x1b[90m  nothing to retry.\x1b[0m')
          continue
        }
        console.log(`\x1b[90m  retrying: ${lastPrompt.slice(0, 60)}${lastPrompt.length > 60 ? '...' : ''}\x1b[0m`)
        // Remove last user+assistant pair from history
        while (history.length > 0 && history[history.length - 1]!.role !== 'system') {
          const last = history[history.length - 1]!
          if (last.role === 'assistant' || last.role === 'user') {
            history.pop()
          } else break
          if (last.role === 'user') break
        }
        // Fall through to execute lastPrompt
      } else {
        const handled = handleSlashCommand(input, resolved, history, stats, cwd, {
          getModel: () => currentModel,
          setModel: applyModelSelection,
          getProvider: () => resolved.provider,
          getChoices,
        }, undoState, { tokenBudget, contextMonitor }, modeRegistry, threadManager, () => {
          resetTransientSessionState()
          if (useInk) emitStatus()
        }, useInk ? session : undefined)
        if (handled === 'exit') {
          saveInputHistory(historyFile, inputHistory)
          mcpClient.disconnectAll()
          await hooks.run('SessionEnd', { event: 'SessionEnd', cwd, model: currentModel })
          // Auto-save session on clean exit (if there was any conversation)
          if (stats.turns > 0) {
            autoSaveSession(resolved.provider, currentModel, history, stats, modeRegistry.getActive().id)
          }
          if (useInk) {
            const costUsd = computeCost(currentModel, stats.totalInputTokens, stats.totalOutputTokens)
            session.emitSessionEnd({
              turns: stats.turns,
              totalInputTokens: stats.totalInputTokens,
              totalOutputTokens: stats.totalOutputTokens,
              totalCostUsd: costUsd,
              totalDuration: Date.now() - stats.startTime,
              toolCallsTotal: 0,
            })
          } else {
            printSessionSummary({
              turns: stats.turns,
              totalInputTokens: stats.totalInputTokens,
              totalOutputTokens: stats.totalOutputTokens,
              durationMs: Date.now() - stats.startTime,
              model: currentModel,
            })
          }
          recordUsage({
            provider: resolved.provider,
            model: currentModel,
            inputTokens: stats.totalInputTokens,
            outputTokens: stats.totalOutputTokens,
            costUsd: computeCost(currentModel, stats.totalInputTokens, stats.totalOutputTokens),
            durationMs: Date.now() - stats.startTime,
            turns: stats.turns,
            command: 'chat',
            cwd,
          })
          logInfo('chat session ended', {
            cwd,
            model: currentModel,
            provider: resolved.provider,
            turns: stats.turns,
            inputTokens: stats.totalInputTokens,
            outputTokens: stats.totalOutputTokens,
          })
          const bye = GOODBYE_MESSAGES[Math.floor(Math.random() * GOODBYE_MESSAGES.length)]
          console.log(`\x1b[90m  ${bye}\x1b[0m`)
          break
        }
        if (handled === 'pick_model') {
          // Wait for number input to select model
          const pick = await promptUser()
          if (pick === null) break
          const num = parseInt(pick, 10)
          const choices = getChoices()
          if (num >= 1 && num <= choices.length) {
            const oldModel = currentModel
            if (!applyModelSelection(choices[num - 1]!)) {
              continue
            }
            emitStatus()
            console.log(`\x1b[90m  model: ${oldModel} → \x1b[36m${currentModel}\x1b[0m`)
            const warning = getAgenticWarning(currentModel)
            if (warning) console.log(`\x1b[33m  model caution: ${warning}\x1b[0m`)
            logInfo('model switched via picker', { from: oldModel, to: currentModel, provider: resolved.provider })
            if (warning) logWarning('model caution', { model: currentModel, provider: resolved.provider, warning })
          } else if (pick) {
            console.log('\x1b[33m  invalid selection. Use 1-' + choices.length + '.\x1b[0m')
          }
          continue
        }
        if (handled === 'handled') {
          emitStatus()
          continue
        }

        if (handled === 'council' || handled === 'race' || handled === 'pipeline' || handled === 'mission' || handled === 'plan') {
          await handleAsyncReplSlashCommand({
            command: handled,
            input,
            config,
            cwd,
            currentModel,
            useInk,
            session: useInk ? session : undefined,
            sessionInjectedPaths,
          })
          continue
        }

        // 'not_command' falls through to treat as normal message
      }
    }

    const inlineReflectMatch = /^\/reflect\s+([\s\S]+)$/i.exec(input)
    const inlineReflect = Boolean(inlineReflectMatch)
    const messageToSend = (input === '/retry' || input === '/r')
      ? lastPrompt
      : inlineReflect
        ? inlineReflectMatch?.[1]?.trim() || ''
        : input
    if (!messageToSend) continue

    lastPrompt = messageToSend
    inputHistory.push(messageToSend)

    await executeReplTurn({
      messageToSend,
      currentModel,
      currentPermMode,
      resolved,
      config,
      outputMode,
      cwd,
      useInk,
      history,
      stats,
      sessionInjectedPaths,
      mcpToolDefs,
      tokenBudget,
      contextMonitor,
      retryTracker,
      loopDetector,
      session: useInk ? session : undefined,
      emitStatus,
      emitInlineNotice,
      forceReflect: Boolean(opts.forceReflect || inlineReflect || modeRegistry.getActive().id === 'reflect'),
      autoTriggerReflect: !opts.forceReflect && !inlineReflect && modeRegistry.getActive().id !== 'reflect',
      activeModeId: modeRegistry.getActive().id,
      setLastTokPerSec: (value) => {
        lastTokPerSec = value
      },
      onFileWrite: (path, oldContent) => {
        undoState.lastWrite = { path, oldContent }
      },
      runProxyTurn,
      runSDKQuery,
    })

    } catch (turnErr) {
      // ── Crash-safe: catch ANY uncaught error in this turn, log it, continue REPL ──
      const msg = turnErr instanceof Error ? turnErr.message : String(turnErr)
      console.error(`\x1b[31m  turn error: ${msg}\x1b[0m`)
      console.error(`\x1b[90m  session continues — type /clear to reset if state is corrupted.\x1b[0m`)
      // Auto-save on error for recovery
      if (stats.turns > 0) {
        autoSaveSession(resolved.provider, currentModel, history, stats, modeRegistry.getActive().id)
      }
    }
  }

  // Cleanup
  if (inkInstance) inkInstance.unmount()
  saveInputHistory(historyFile, inputHistory)
  rl.close()
}

// ── Slash Commands ──────────────────────────────────────────────

interface ModelControl {
  getModel: () => string
  setModel: (target: ModelSelectionTarget) => boolean
  getProvider: () => string
  getChoices: () => ModelChoice[]
}

interface UndoState {
  lastWrite: { path: string; oldContent: string | null } | null
}

function handleSlashCommand(
  input: string,
  resolved: ResolvedProvider,
  history: ChatMessage[],
  stats: SessionStats,
  cwd: string,
  mc: ModelControl,
  undo?: UndoState,
  harness?: { tokenBudget: TokenBudgetManager; contextMonitor: ContextMonitor },
  modeRegistry?: ModeRegistry,
  threadManager?: ThreadManager,
  onSessionReset?: () => void,
  session?: import('../ui/session.js').ChatSessionEmitter,
): SlashCommandResult {
  const parts = input.split(/\s+/)
  const cmd = parts[0]!.toLowerCase()
  const arg = parts.slice(1).join(' ').trim()

  const readonlyResult = handleReadonlySlashCommand({
    cmd,
    arg,
    resolved,
    history,
    stats,
    cwd,
    mc,
    harness,
    session,
    modeLabel: modeRegistry?.getActive().id || 'default',
  })
  if (readonlyResult !== 'not_handled') {
    return readonlyResult
  }
  return handleMutatingSlashCommand({
    cmd,
    arg,
    history,
    stats,
    cwd,
    mc,
    undo,
    harness,
    onSessionReset,
    modeRegistry,
    threadManager,
    session,
  })
}

// ── Proxy Multi-turn Path ───────────────────────────────────────

interface ProxyTurnOptions {
  prompt: PromptContent
  resolved: ResolvedProvider
  config: OrcaConfig
  outputMode: OutputMode
  history: ChatMessage[]
  cwd: string
  abortSignal?: AbortSignal
  onFirstToken?: () => void
  onStreamToken?: (text: string) => void
  onFileWrite?: (path: string, oldContent: string | null) => void
  safeMode?: boolean
  retryTracker?: RetryTracker
  loopDetector?: LoopDetector
  tokenBudget?: TokenBudgetManager
  contextMonitor?: ContextMonitor
  /** Extra tool definitions to merge (e.g., MCP server tools) */
  extraToolDefs?: Array<Record<string, unknown>>
  /** Files already injected by file expansion — tool reads on these return dedup message */
  injectedPaths?: Set<string>
  /** Session emitter for ink UI — when set, streaming events go to ink instead of stdout */
  session?: import('../ui/session.js').ChatSessionEmitter
  /** Callback for high-frequency status refresh during streaming */
  onStreamingStatus?: (tokPerSec: number) => void
}

export async function runProxyTurn(options: ProxyTurnOptions): Promise<{ inputTokens: number; outputTokens: number }> {
  const { prompt, resolved, config, outputMode, history, cwd, abortSignal, onFirstToken, onStreamToken, onFileWrite, safeMode, retryTracker, loopDetector, tokenBudget, contextMonitor, extraToolDefs, injectedPaths, session: emitterOpt, onStreamingStatus } = options

  const startTime = Date.now()
  let inputTokens = 0
  let outputTokens = 0
  let responseText = ''
  let gotFirstToken = false
  const md = new StreamMarkdown()

  // Streaming tok/s tracking for real-time StatusBar updates
  let streamTokenCount = 0
  let lastTokUpdate = startTime

  for await (const event of streamChat(
    { apiKey: resolved.apiKey, baseURL: resolved.baseURL!, model: resolved.model, systemPrompt: config.systemPrompt, headers: resolved.headers, reasoningEffort: resolved.reasoningEffort },
    prompt,
    history,
    {
      onToolCall: async (name, args) => {
        try {
          return await handleProxyToolCall({
            name,
            args,
            cwd,
            history,
            resolved: {
              model: resolved.model,
              apiKey: resolved.apiKey,
              baseURL: resolved.baseURL,
            },
            onFileWrite,
            safeMode,
            retryTracker,
            loopDetector,
            tokenBudget,
            contextMonitor,
            injectedPaths,
            session: emitterOpt,
          })
        } catch (error) {
          if (error instanceof ResetSensitiveWaitCanceledError && emitterOpt) {
            emitterOpt.emitToolEnd({ name, success: false, output: '', durationMs: 0 })
          }
          throw error
        }
      },
      abortSignal,
    },
    [...(TOOL_DEFINITIONS as Array<Record<string, unknown>>), ...(extraToolDefs || [])],
  )) {
    if (outputMode === 'json') {
      emitJson(event as unknown as Record<string, unknown>)
      continue
    }

    switch (event.type) {
      case 'text':
        if (!gotFirstToken && onFirstToken) {
          onFirstToken()
          gotFirstToken = true
        }
        if (event.text) {
          responseText += event.text
          streamTokenCount++
          if (emitterOpt) {
            emitterOpt.emitText(event.text)
            // Update tok/s on StatusBar every 500ms during streaming
            const now = Date.now()
            if (now - lastTokUpdate >= 500) {
              const elapsed = (now - startTime) / 1000
              if (elapsed > 0) {
                onStreamingStatus?.(Math.round(streamTokenCount / elapsed))
              }
              lastTokUpdate = now
            }
          } else {
            md.push(event.text)
          }
          if (onStreamToken) onStreamToken(event.text)
        }
        break
      case 'tool_use': {
        if (!emitterOpt) { md.flush(); setLastNewline(md.endsWithNewline) }
        if (!gotFirstToken && onFirstToken) {
          onFirstToken()
          gotFirstToken = true
        }
        const toolName = event.toolName || 'tool'
        if (emitterOpt) {
          emitterOpt.emitToolStart({ name: toolName, args: {}, label: event.toolInput })
        } else {
          printToolUse(toolName, event.toolInput)
        }
        break
      }
      case 'tool_result': {
        const trName = event.toolName || 'tool'
        if (emitterOpt) {
          emitterOpt.emitToolEnd({ name: trName, success: event.toolSuccess !== false, output: event.toolOutput || '', durationMs: 0 })
        } else {
          printToolResult(trName, event.toolSuccess !== false, event.toolOutput)
        }
        break
      }
      case 'usage':
        inputTokens = event.inputTokens || 0
        outputTokens = event.outputTokens || 0
        break
      case 'error':
        if (!emitterOpt) { md.flush(); setLastNewline(md.endsWithNewline) }
        if (!gotFirstToken && onFirstToken) onFirstToken()
        if (emitterOpt) {
          emitterOpt.emitSystemMessage(event.error || 'Unknown error', 'error')
        } else {
          ensureNewline()
          printError(event.error || 'Unknown error')
        }
        break
      case 'done':
        break
    }
  }

  // Flush remaining markdown buffer
  md.flush()

  // Append to conversation history
  history.push({ role: 'user', content: prompt })
  if (responseText) {
    history.push({ role: 'assistant', content: responseText })
  }

  if (outputMode === 'streaming') {
    ensureNewline()
    const contextChars = history.reduce((sum, m) => sum + messageContentToText(m.content).length, 0)
    printUsageSummary({
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      turns: 1,
      durationMs: Date.now() - startTime,
      model: resolved.model,
      contextChars,
    })
  }

  recordUsage({
    provider: resolved.provider,
    model: resolved.model,
    inputTokens,
    outputTokens,
    costUsd: computeCost(resolved.model, inputTokens, outputTokens),
    durationMs: Date.now() - startTime,
    turns: 1,
    command: 'chat',
  })

  return { inputTokens, outputTokens }
}

// ── One-shot Proxy Path ─────────────────────────────────────────

interface ProxyQueryOptions {
  prompt: PromptContent
  resolved: ResolvedProvider
  config: OrcaConfig
  outputMode: OutputMode
  extraToolDefs?: Array<Record<string, unknown>>
}

async function runProxyQuery(options: ProxyQueryOptions & { cwd?: string }): Promise<void> {
  await runProxyTurn({
    ...options,
    history: [],
    cwd: options.cwd || process.cwd(),
    extraToolDefs: options.extraToolDefs,
  })
}

// ── SDK Agent Loop Path ─────────────────────────────────────────

interface SDKQueryOptions {
  prompt: PromptContent
  resolved: ResolvedProvider
  config: OrcaConfig
  outputMode: OutputMode
  cwd: string
  history?: ChatMessage[]
}

async function runSDKQuery(options: SDKQueryOptions): Promise<{ inputTokens: number; outputTokens: number; turns: number; text: string }> {
  const { prompt, resolved, config, outputMode, cwd, history = [] } = options
  if (typeof prompt !== 'string') {
    throw new Error('SDK path does not yet support multimodal prompt content. Use a proxy provider for --image.')
  }

  let sdk: { createAgent: (opts: Record<string, unknown>) => { query: (p: string) => AsyncIterable<unknown> } }
  try {
    // @ts-ignore — @orca/sdk is an optional dependency for native provider path
    sdk = await import('@orca/sdk')
  } catch {
    throw new Error('@orca/sdk not installed. Use --provider poe for proxy mode, or npm install @orca/sdk for native mode.')
  }

  // Map CLI provider to SDK provider option
  const sdkProvider = resolved.provider === 'anthropic' ? 'anthropic' : 'openai-compat'

  const agent = sdk.createAgent({
    provider: sdkProvider,
    apiKey: resolved.apiKey,
    model: resolved.model,
    baseURL: resolved.baseURL,
    maxTurns: config.maxTurns,
    maxBudgetUsd: config.maxBudgetUsd,
    systemPrompt: config.systemPrompt,
    permissionMode: config.permissionMode as 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | undefined,
    cwd,
  })

  const startTime = Date.now()
  let inputTokens = 0
  let outputTokens = 0
  let turns = 0
  let responseText = ''

  for await (const event of agent.query(buildSDKReplayPrompt(history, prompt))) {
    if (outputMode === 'json') {
      emitJson(event as unknown as Record<string, unknown>)
      continue
    }

    const ev = event as Record<string, unknown>
    const type = ev.type as string | undefined

    if (type === 'text' || type === 'content_block_delta') {
      const text = (ev.text as string) || (ev.delta as Record<string, unknown>)?.text as string || ''
      if (text) {
        responseText += text
        streamToken(text)
      }
    } else if (type === 'tool_use' || type === 'tool_call') {
      const toolName = (ev.name as string) || (ev.tool as string) || 'tool'
      let input: string | undefined
      try { input = ev.input ? JSON.stringify(ev.input) : undefined } catch { input = '[complex input]' }
      printToolUse(toolName, input)
    } else if (type === 'result') {
      const result = ev as Record<string, unknown>
      inputTokens = (result.inputTokens as number) || 0
      outputTokens = (result.outputTokens as number) || 0
      turns = (result.turns as number) || 0
    }
  }

  if (outputMode === 'streaming') {
    ensureNewline()
    printUsageSummary({
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      turns,
      durationMs: Date.now() - startTime,
    })
  }

  recordUsage({
    provider: resolved.provider,
    model: resolved.model,
    inputTokens,
    outputTokens,
    costUsd: computeCost(resolved.model, inputTokens, outputTokens),
    durationMs: Date.now() - startTime,
    turns,
    command: 'chat-sdk',
  })

  return { inputTokens, outputTokens, turns, text: responseText }
}

function buildSDKReplayPrompt(history: ChatMessage[], prompt: string): string {
  const conversation = history
    .filter((message) => message.role !== 'system')
    .map((message) => {
      const roleLabel = message.role === 'assistant' ? 'Assistant' : 'User'
      return `${roleLabel}:\n${messageContentToText(message.content)}`
    })
    .join('\n\n')

  if (!conversation.trim()) return prompt

  return [
    'Conversation so far:',
    conversation,
    '',
    'Latest user message:',
    prompt,
  ].join('\n')
}

// ── Cost Computation ───────────────────────────────────────────

/** Compute cost in USD from token counts and model pricing table. */
function computeCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = getPricingForModel(model)
  if (!pricing) return 0
  const [inputPer1M, outputPer1M] = pricing
  return (inputTokens * inputPer1M + outputTokens * outputPer1M) / 1_000_000
}

// ── Helpers ─────────────────────────────────────────────────────
