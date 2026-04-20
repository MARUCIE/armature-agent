import type { OrcaConfig } from '../config.js'
import { hooks } from '../hooks.js'
import { ContextMonitor, LoopDetector } from '../harness/index.js'
import { getPricingForModel } from '../model-catalog.js'
import { ensureNewline, printError, printTurnSummary, ProgressIndicator } from '../output.js'
import type { OutputMode } from '../output.js'
import { chatOnce, messageContentToText } from '../providers/openai-compat.js'
import type { ChatMessage, PromptContent } from '../providers/openai-compat.js'
import { RetryTracker } from '../retry-intelligence.js'
import { TokenBudgetManager } from '../token-budget.js'
import { autoSaveSession } from './chat-support.js'
import { expandFileReferences } from './chat-input.js'
import { matchCognitive, formatCognitiveContext } from '../cognitive-skeleton.js'
import { isMultiTaskPrompt } from '../planner/index.js'
import type { ChatSessionEmitter } from '../ui/session.js'
import { detectReflectIntent, prepareReflectPromptTextForReason } from './reflect-mode.js'
import { ResetSensitiveWaitCanceledError } from './chat-proxy-tool-call.js'

type PermMode = 'yolo' | 'auto' | 'plan'

interface ReplTurnResolvedProviderBase {
  provider: string
  model: string
  apiKey: string
  baseURL?: string
  headers?: Record<string, string>
}

interface SessionStatsLike {
  turns: number
  totalInputTokens: number
  totalOutputTokens: number
  turnTokens: number[]
}

interface ExecuteReplTurnOptions<TResolved extends ReplTurnResolvedProviderBase> {
  messageToSend: string
  currentModel: string
  currentPermMode: PermMode
  resolved: TResolved
  config: OrcaConfig
  outputMode: OutputMode
  cwd: string
  useInk: boolean
  history: ChatMessage[]
  stats: SessionStatsLike
  sessionInjectedPaths: Set<string>
  mcpToolDefs: Array<Record<string, unknown>>
  tokenBudget: TokenBudgetManager
  contextMonitor: ContextMonitor
  retryTracker: RetryTracker
  loopDetector: LoopDetector
  session?: ChatSessionEmitter
  emitStatus: () => void
  emitInlineNotice: (text: string, level?: 'info' | 'warn' | 'error') => void
  forceReflect?: boolean
  autoTriggerReflect?: boolean
  activeModeId?: string
  setLastTokPerSec: (value: number) => void
  onFileWrite: (path: string, oldContent: string | null) => void
  runProxyTurn: (options: {
    prompt: PromptContent
    resolved: TResolved
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
    extraToolDefs?: Array<Record<string, unknown>>
    injectedPaths?: Set<string>
    session?: ChatSessionEmitter
    onStreamingStatus?: (tokPerSec: number) => void
  }) => Promise<{ inputTokens: number; outputTokens: number }>
  runSDKQuery: (options: {
    prompt: PromptContent
    resolved: TResolved
    config: OrcaConfig
    outputMode: OutputMode
    cwd: string
    history?: ChatMessage[]
  }) => Promise<{ inputTokens: number; outputTokens: number; turns: number; text: string }>
}

export async function executeReplTurn<TResolved extends ReplTurnResolvedProviderBase>(
  options: ExecuteReplTurnOptions<TResolved>,
): Promise<void> {
  const {
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
    session,
    emitStatus,
    emitInlineNotice,
    forceReflect,
    autoTriggerReflect,
    activeModeId,
    setLastTokPerSec,
    onFileWrite,
    runProxyTurn,
    runSDKQuery,
  } = options
  let messageToSend = options.messageToSend

  if (isMultiTaskPrompt(messageToSend) && !messageToSend.startsWith('/')) {
    const taskCount = messageToSend.split(/\n\s*\d+\.\s+|\n\s*[-*]\s+|[；;]/).filter((segment) => segment.trim().length > 5).length
    console.log(`\x1b[90m  hint: detected ~${taskCount} tasks. Use /plan to auto-decompose and track.\x1b[0m`)
  }

  if (hooks.hasHooks('UserPromptSubmit')) {
    const hookResult = await hooks.run('UserPromptSubmit', { event: 'UserPromptSubmit', prompt: messageToSend, cwd })
    if (!hookResult.continue) {
      console.log(`\x1b[33m  hook blocked prompt: ${hookResult.stopReason || ''}\x1b[0m`)
      return
    }
  }

  const reflectReason = forceReflect ? 'manual' : autoTriggerReflect ? detectReflectIntent(messageToSend) : null

  const expansion = expandFileReferences(messageToSend, cwd)
  if (expansion.text !== messageToSend) {
    messageToSend = expansion.text
    for (const injectedPath of expansion.injectedPaths) sessionInjectedPaths.add(injectedPath)
    process.stderr.write(`\x1b[90m  [file-expand] injected ${expansion.injectedPaths.size} file(s) into prompt\x1b[0m\n`)
  }

  const reflectPreparation = prepareReflectPromptTextForReason(messageToSend, reflectReason)
  if (reflectPreparation.applied && typeof reflectPreparation.prompt === 'string') {
    messageToSend = reflectPreparation.prompt
    if (reflectPreparation.notice) {
      emitInlineNotice(reflectPreparation.notice, 'info')
    }
  }

  const cognitiveMatch = matchCognitive(messageToSend)
  if (cognitiveMatch) {
    history.push({ role: 'system', content: formatCognitiveContext(cognitiveMatch) })
    process.stderr.write(`\x1b[90m  [cognitive] ${cognitiveMatch.scenario}: ${cognitiveMatch.models.map((model) => model.name).join(', ')}\x1b[0m\n`)
  }

  applyPreSendCompaction(history, tokenBudget, contextMonitor)

  const abortController = new AbortController()
  let rawMode = false
  let escHandler: ((data: Buffer) => void) | null = null
  let abortHandler: (() => void) | null = null

  if (useInk) {
    abortHandler = () => abortController.abort()
    session?.once('abort', abortHandler)
  } else {
    rawMode = process.stdin.isTTY || false
    if (rawMode) {
      process.stdin.setRawMode(true)
      process.stdin.resume()
    }
    escHandler = (data: Buffer) => {
      const key = data[0]
      if (key === 0x1b || key === 0x03) {
        abortController.abort()
        if (rawMode) {
          process.stdin.setRawMode(false)
          process.stdin.removeListener('data', escHandler!)
        }
        ensureNewline()
        console.log('\x1b[90m  [interrupted]\x1b[0m')
      }
    }
    if (rawMode) {
      process.stdin.on('data', escHandler)
    }
  }

  const turnStartTime = Date.now()
  const progress = useInk ? null : new ProgressIndicator()
  if (progress) progress.start()
  if (useInk) session?.emitThinkingStart()

  try {
    if (resolved.baseURL && !abortController.signal.aborted) {
      const result = await runProxyTurn({
        prompt: messageToSend,
        resolved,
        config,
        outputMode,
        history,
        cwd,
        abortSignal: abortController.signal,
        onFirstToken: () => {
          if (progress) {
            const { elapsed } = progress.stop()
            if (elapsed > 1000) {
              process.stdout.write(`\x1b[90m  [${(elapsed / 1000).toFixed(1)}s to first token]\x1b[0m\n`)
            }
            progress.start()
            progress.markWorking()
          }
          if (useInk) session?.emitThinkingEnd(Date.now() - turnStartTime)
        },
        onStreamToken: (text: string) => {
          if (progress) progress.addText(text)
        },
        onFileWrite,
        safeMode: currentPermMode !== 'yolo',
        retryTracker,
        loopDetector,
        tokenBudget,
        contextMonitor,
        extraToolDefs: mcpToolDefs,
        injectedPaths: sessionInjectedPaths,
        session,
        onStreamingStatus: (tokPerSec) => {
          setLastTokPerSec(tokPerSec)
          if (useInk) emitStatus()
        },
      })
      stats.turns++
      stats.totalInputTokens += result.inputTokens
      stats.totalOutputTokens += result.outputTokens
      stats.turnTokens.push(result.outputTokens)
      tokenBudget.recordUsage(result.inputTokens, result.outputTokens)
      contextMonitor.recordUsage(result.inputTokens, result.outputTokens)

      const turnElapsed = progress ? progress.stop().elapsed : (Date.now() - turnStartTime)
      const tokPerSec = turnElapsed > 0 && result.outputTokens > 0 ? result.outputTokens / (turnElapsed / 1000) : 0
      if (tokPerSec > 0) {
        setLastTokPerSec(tokPerSec)
      }

      const turnBudget = tokenBudget.getBudget(history)
      const turnPricing = getPricingForModel(currentModel)
      let turnCost = 0
      if (turnPricing) {
        turnCost = (result.inputTokens / 1_000_000) * turnPricing[0]
          + (result.outputTokens / 1_000_000) * turnPricing[1]
      }
      if (useInk) {
        session?.emitTurnSummary({
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          duration: turnElapsed,
          toolCalls: 0,
          costUsd: turnCost,
          model: currentModel,
        })
        emitStatus()
      } else {
        printTurnSummary({
          elapsedMs: turnElapsed,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          costUsd: turnCost,
          contextPct: turnBudget.utilizationPct,
          tokPerSec,
        })
      }

      warnOnContextRisk(contextMonitor)
    } else if (!abortController.signal.aborted) {
      if (progress) progress.stop()
      const activeSystemPrompt = buildSessionSystemPrompt(history)
      const result = await runSDKQuery({
        prompt: messageToSend,
        resolved,
        config: activeSystemPrompt ? { ...config, systemPrompt: activeSystemPrompt } : config,
        outputMode,
        cwd,
        history,
      })
      stats.turns++
      stats.totalInputTokens += result.inputTokens
      stats.totalOutputTokens += result.outputTokens
      stats.turnTokens.push(result.outputTokens)
      tokenBudget.recordUsage(result.inputTokens, result.outputTokens)
      contextMonitor.recordUsage(result.inputTokens, result.outputTokens)
      history.push({ role: 'user', content: messageToSend })
      if (result.text) {
        history.push({ role: 'assistant', content: result.text })
      }

      const turnElapsed = Date.now() - turnStartTime
      const tokPerSec = turnElapsed > 0 && result.outputTokens > 0 ? result.outputTokens / (turnElapsed / 1000) : 0
      if (tokPerSec > 0) {
        setLastTokPerSec(tokPerSec)
      }
      const turnBudget = tokenBudget.getBudget(history)
      const turnPricing = getPricingForModel(currentModel)
      let turnCost = 0
      if (turnPricing) {
        turnCost = (result.inputTokens / 1_000_000) * turnPricing[0]
          + (result.outputTokens / 1_000_000) * turnPricing[1]
      }
      if (useInk) {
        session?.emitTurnSummary({
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          duration: turnElapsed,
          toolCalls: 0,
          costUsd: turnCost,
          model: currentModel,
        })
        emitStatus()
      } else {
        printTurnSummary({
          elapsedMs: turnElapsed,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          costUsd: turnCost,
          contextPct: turnBudget.utilizationPct,
          tokPerSec,
        })
      }
      warnOnContextRisk(contextMonitor)
    }
  } catch (error) {
    if (progress) progress.stop()
    if (error instanceof ResetSensitiveWaitCanceledError) {
      return
    }
    if (!abortController.signal.aborted) {
      await handleTurnFailure({
        error,
        messageToSend,
        resolved,
        currentModel,
        history,
        stats,
        tokenBudget,
        contextMonitor,
      })
    }
  } finally {
    if (progress) progress.stop()
    if (rawMode && escHandler) {
      process.stdin.setRawMode(false)
      process.stdin.removeListener('data', escHandler)
    }
    if (abortHandler) {
      session?.off?.('abort', abortHandler)
    }
  }
  console.log()

  applyPostTurnCompaction({
    resolved,
    currentModel,
    cwd,
    history,
    stats,
    tokenBudget,
    contextMonitor,
      retryTracker,
      activeModeId,
      emitStatus,
      emitInlineNotice,
  })
}

function buildSessionSystemPrompt(history: ChatMessage[]): string {
  return history
    .filter((message) => message.role === 'system')
    .map((message) => messageContentToText(message.content))
    .filter(Boolean)
    .join('\n\n')
}

function applyPreSendCompaction(
  history: ChatMessage[],
  tokenBudget: TokenBudgetManager,
  contextMonitor: ContextMonitor,
): void {
  const preBudget = tokenBudget.getBudget(history)
  if (preBudget.utilizationPct < 50) return

  const keepTurns = preBudget.utilizationPct >= 80 ? 1 : 2
  const compactResult = tokenBudget.smartCompact(history, keepTurns)
  if (compactResult.dropped > 0 || compactResult.tokensFreed > 0) {
    process.stderr.write(`\x1b[33m  [pre-send compact] ${compactResult.summary}\x1b[0m\n`)
    tokenBudget.clearCurrentUsage()
    contextMonitor.clearCurrentUsage()
  }

  const postBudget = tokenBudget.getBudget(history)
  if (postBudget.utilizationPct >= 80) {
    const nuclear = tokenBudget.smartCompact(history, 0)
    if (nuclear.dropped > 0 || nuclear.tokensFreed > 0) {
      process.stderr.write(`\x1b[31m  [nuclear compact] ${nuclear.summary}\x1b[0m\n`)
    }
    tokenBudget.clearCurrentUsage()
    contextMonitor.clearCurrentUsage()
  }
}

async function handleTurnFailure(options: {
  error: unknown
  messageToSend: string
  resolved: ReplTurnResolvedProviderBase
  currentModel: string
  history: ChatMessage[]
  stats: SessionStatsLike
  tokenBudget: TokenBudgetManager
  contextMonitor: ContextMonitor
}): Promise<void> {
  const { error, messageToSend, resolved, currentModel, history, stats, tokenBudget, contextMonitor } = options
  const errorMessage = error instanceof Error ? error.message : String(error)
  const errorStatus = (error as { status?: number; statusCode?: number })?.status
    ?? (error as { status?: number; statusCode?: number })?.statusCode

  if (errorStatus === 413 || errorMessage.includes('413') || errorMessage.includes('context_length') || errorMessage.includes('too large')) {
    process.stderr.write(`\x1b[33m  [auto-recovery] context overflow — compacting and retrying...\x1b[0m\n`)
    const compact = tokenBudget.smartCompact(history, 1)
    if (compact.dropped > 0 || compact.tokensFreed > 0) {
      process.stderr.write(`\x1b[33m  [auto-compact] ${compact.summary}\x1b[0m\n`)
      contextMonitor.clearCurrentUsage()
      tokenBudget.clearCurrentUsage()
    }

    if (resolved.baseURL) {
      process.stderr.write(`\x1b[36m  [retry] re-sending after compact...\x1b[0m\n`)
      try {
        const sysPrompt = buildSessionSystemPrompt(history)
        const retryResult = await chatOnce(
          { apiKey: resolved.apiKey, baseURL: resolved.baseURL, model: currentModel, systemPrompt: sysPrompt, headers: resolved.headers },
          messageToSend,
        )
        process.stdout.write(retryResult.text)
        process.stdout.write('\n')
        stats.turns++
        stats.totalInputTokens += retryResult.inputTokens
        stats.totalOutputTokens += retryResult.outputTokens
        stats.turnTokens.push(retryResult.outputTokens)
        tokenBudget.recordUsage(retryResult.inputTokens, retryResult.outputTokens)
        contextMonitor.recordUsage(retryResult.inputTokens, retryResult.outputTokens)
        history.push({ role: 'user', content: messageToSend })
        history.push({ role: 'assistant', content: retryResult.text })
      } catch (retryError) {
        printError(`Retry failed: ${retryError instanceof Error ? retryError.message : String(retryError)}`)
      }
    }
    return
  }

  printError(errorMessage)
}

function warnOnContextRisk(contextMonitor: ContextMonitor): void {
  const risk = contextMonitor.getRiskLevel()
  if (risk === 'green') return

  const snapshot = contextMonitor.getSnapshot()
  const pct = (snapshot.utilization * 100).toFixed(1)
  const detail = `${formatTokenCount(snapshot.inputTokens)}/${formatTokenCount(snapshot.modelWindow)}`
  if (risk === 'red') {
    process.stderr.write(`\x1b[31m  [harness] context ${pct}% RED (${detail}) — run /clear now\x1b[0m\n`)
  } else if (risk === 'orange') {
    process.stderr.write(`\x1b[33m  [harness] context ${pct}% ORANGE (${detail}) — run /compact\x1b[0m\n`)
  } else {
    process.stderr.write(`\x1b[33m  [harness] context ${pct}% YELLOW (${detail}) — consider /compact\x1b[0m\n`)
  }
}

function formatTokenCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${Math.round(value / 1000)}K`
  return String(value)
}

function applyPostTurnCompaction(options: {
  resolved: ReplTurnResolvedProviderBase
  currentModel: string
  cwd: string
  history: ChatMessage[]
  stats: SessionStatsLike
  tokenBudget: TokenBudgetManager
  contextMonitor: ContextMonitor
  retryTracker: RetryTracker
  activeModeId?: string
  emitStatus: () => void
  emitInlineNotice: (text: string, level?: 'info' | 'warn' | 'error') => void
}): void {
  const { resolved, currentModel, cwd, history, stats, tokenBudget, contextMonitor, retryTracker, activeModeId, emitStatus, emitInlineNotice } = options
  const budget = tokenBudget.getBudget(history)

  if (budget.risk === 'red') {
    hooks.run('PreCompact', { event: 'PreCompact', cwd })
    const result = tokenBudget.smartCompact(history, 1)
    hooks.run('PostCompact', { event: 'PostCompact', cwd })
    emitInlineNotice(`auto-compact (${budget.utilizationPct}%): ${result.summary}`, 'error')
    tokenBudget.clearCurrentUsage()
    contextMonitor.clearCurrentUsage()
    emitStatus()
    retryTracker.cleanup()
    autoSaveSession(resolved.provider, currentModel, history, stats, activeModeId)
    emitInlineNotice('session auto-saved. Context freed — continuing.', 'info')
    return
  }

  if (budget.risk === 'orange') {
    hooks.run('PreCompact', { event: 'PreCompact', cwd })
    const result = tokenBudget.smartCompact(history, 1)
    hooks.run('PostCompact', { event: 'PostCompact', cwd })
    if (result.dropped > 0 || result.tokensFreed > 0) {
      emitInlineNotice(`auto-compact (${budget.utilizationPct}%): ${result.summary}`, 'warn')
      tokenBudget.clearCurrentUsage()
      contextMonitor.clearCurrentUsage()
      emitStatus()
    }
    return
  }

  if (budget.risk === 'yellow') {
    hooks.run('PreCompact', { event: 'PreCompact', cwd })
    const result = tokenBudget.smartCompact(history, 2)
    hooks.run('PostCompact', { event: 'PostCompact', cwd })
    if (result.dropped > 0 || result.tokensFreed > 0) {
      emitInlineNotice(`auto-compact (${budget.utilizationPct}%): ${result.summary}`, 'warn')
      tokenBudget.clearCurrentUsage()
      contextMonitor.clearCurrentUsage()
      emitStatus()
    }
  }
}
