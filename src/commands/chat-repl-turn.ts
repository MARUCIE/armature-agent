import { configPermissionModeFromRepl, type OrcaConfig } from '../config.js'
import { hooks } from '../hooks.js'
import { ContextMonitor, LoopDetector } from '../harness/index.js'
import { getPricingForModel } from '../model-catalog.js'
import { ensureNewline, printError, printToolResult, printToolUse, printTurnSummary, ProgressIndicator } from '../output.js'
import type { OutputMode } from '../output.js'
import { chatOnce, messageContentToText } from '../providers/openai-compat.js'
import type { ChatMessage, PromptContent } from '../providers/openai-compat.js'
import { RetryTracker } from '../retry-intelligence.js'
import { TokenBudgetManager } from '../token-budget.js'
import { autoSaveSession, buildAutoSessionId } from './chat-support.js'
import { observeRuntimeEvent } from '../evolution/observer.js'
import { buildImagePromptContent, expandFileReferences, extractImagePromptInput } from './chat-input.js'
import { matchCognitive, formatCognitiveContext } from '../cognitive-skeleton.js'
import { isMultiTaskPrompt } from '../planner/index.js'
import type { ChatSessionEmitter } from '../ui/session.js'
import { detectReflectIntent, prepareReflectPromptContent } from './reflect-mode.js'
import { handleProxyToolCall, ResetSensitiveWaitCanceledError } from './chat-proxy-tool-call.js'
import type { ToolApprovalEventInput } from '../policy-executor.js'
import { maybeBuildAutoCritiqueNotice, type CritiqueAutoState } from '../critique-auto.js'
import {
  buildPreModelLocalFilePlan,
  formatLocalFilePlanResult,
  type LocalFilePlan,
  type LocalFileToolResult,
} from './local-file-intent.js'
import { applyUserPromptSubmitHooks } from './chat-hooks.js'

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
  toolDefs?: Array<Record<string, unknown>>
  tokenBudget: TokenBudgetManager
  contextMonitor: ContextMonitor
  retryTracker: RetryTracker
  loopDetector: LoopDetector
  critiqueAutoState?: CritiqueAutoState
  autoCritiqueEnabled?: boolean
  autoCritiqueThreshold?: number
  session?: ChatSessionEmitter
  emitStatus: () => void
  emitInlineNotice: (text: string, level?: 'info' | 'warn' | 'error') => void
  reasoningEffort?: string
  forceReflect?: boolean
  autoTriggerReflect?: boolean
  activeModeId?: string
  sessionId?: string
  setLastTokPerSec: (value: number) => void
  onFileWrite: (path: string, oldContent: string | null) => void
  isPermissionGranted?: (ruleKey: string) => boolean
  recordPermissionGrant?: (ruleKey: string, scope: 'session' | 'project') => void
  recordApprovalEvent?: (event: ToolApprovalEventInput) => void
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
    permissionMode?: PermMode
    isPermissionGranted?: (ruleKey: string) => boolean
    recordPermissionGrant?: (ruleKey: string, scope: 'session' | 'project') => void
    recordApprovalEvent?: (event: ToolApprovalEventInput) => void
    retryTracker?: RetryTracker
    loopDetector?: LoopDetector
    tokenBudget?: TokenBudgetManager
    contextMonitor?: ContextMonitor
    toolDefs?: Array<Record<string, unknown>>
    extraToolDefs?: Array<Record<string, unknown>>
    injectedPaths?: Set<string>
    session?: ChatSessionEmitter
    onStreamingStatus?: (tokPerSec: number) => void
    reasoningEffort?: string
  }) => Promise<{ inputTokens: number; outputTokens: number }>
  runSDKQuery: (options: {
    prompt: PromptContent
    resolved: TResolved
    config: OrcaConfig
    outputMode: OutputMode
    cwd: string
    history?: ChatMessage[]
    abortSignal?: AbortSignal
  }) => Promise<{ inputTokens: number; outputTokens: number; turns: number; text: string }>
}

export interface ReplTurnExecutionResult {
  status: 'completed' | 'failed' | 'aborted'
  inputTokens: number
  outputTokens: number
  durationMs: number
  summary: string
}

export async function executeReplTurn<TResolved extends ReplTurnResolvedProviderBase>(
  options: ExecuteReplTurnOptions<TResolved>,
): Promise<ReplTurnExecutionResult> {
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
    toolDefs,
    tokenBudget,
    contextMonitor,
    retryTracker,
    loopDetector,
    critiqueAutoState,
    autoCritiqueEnabled,
    autoCritiqueThreshold,
    session,
    emitStatus,
    emitInlineNotice,
    reasoningEffort,
    forceReflect,
    autoTriggerReflect,
    activeModeId,
    setLastTokPerSec,
    onFileWrite,
    isPermissionGranted,
    recordPermissionGrant,
    recordApprovalEvent,
    runProxyTurn,
    runSDKQuery,
  } = options
  const initialInputTokens = stats.totalInputTokens
  const initialOutputTokens = stats.totalOutputTokens
  const turnStartTime = Date.now()
  let messageToSend = options.messageToSend
  let turnPrompt: PromptContent = messageToSend

  if (isMultiTaskPrompt(messageToSend) && !messageToSend.startsWith('/')) {
    const taskCount = messageToSend.split(/\n\s*\d+\.\s+|\n\s*[-*]\s+|[；;]/).filter((segment) => segment.trim().length > 5).length
    console.log(`\x1b[90m  hint: detected ~${taskCount} tasks. Use /plan to auto-decompose and track.\x1b[0m`)
  }

  const promptHook = await applyUserPromptSubmitHooks({
    prompt: turnPrompt,
    cwd,
    model: currentModel,
    writeSystemMessage: (message) => {
      emitInlineNotice(`hook: ${message}`, 'warn')
    },
  })
  if (promptHook.blockedReason) {
    console.log(`\x1b[33m  hook blocked prompt: ${promptHook.blockedReason}\x1b[0m`)
    return buildReplTurnExecutionResult(
      'aborted',
      'prompt blocked by UserPromptSubmit hook',
      turnStartTime,
      stats,
      initialInputTokens,
      initialOutputTokens,
    )
  }
  if (promptHook.prompt !== turnPrompt) {
    turnPrompt = promptHook.prompt
    messageToSend = messageContentToText(turnPrompt)
  }

  const reflectReason = forceReflect ? 'manual' : autoTriggerReflect ? detectReflectIntent(messageToSend) : null
  const extractedImages = resolved.baseURL
    ? extractImagePromptInput(messageToSend, cwd)
    : { prompt: messageToSend, imagePaths: [] }

  const expansion = expandFileReferences(extractedImages.prompt, cwd, {
    skipPaths: extractedImages.imagePaths,
  })
  if (expansion.text !== messageToSend) {
    messageToSend = expansion.text
    for (const injectedPath of expansion.injectedPaths) sessionInjectedPaths.add(injectedPath)
    process.stderr.write(`\x1b[90m  [file-expand] injected ${expansion.injectedPaths.size} file(s) into prompt\x1b[0m\n`)
  }
  turnPrompt = extractedImages.imagePaths.length > 0
    ? buildImagePromptContent(messageToSend, extractedImages.imagePaths, cwd)
    : messageToSend

  const reflectPreparation = reflectReason
    ? prepareReflectPromptContent(turnPrompt, {
        force: reflectReason === 'manual',
        allowAuto: reflectReason !== 'manual',
      })
    : { prompt: turnPrompt, applied: false, reason: null, notice: null }
  if (reflectPreparation.applied) {
    turnPrompt = reflectPreparation.prompt
    messageToSend = typeof reflectPreparation.prompt === 'string'
      ? reflectPreparation.prompt
      : messageContentToText(reflectPreparation.prompt)
    if (reflectPreparation.notice) {
      emitInlineNotice(reflectPreparation.notice, 'info')
    }
  }

  const cognitiveMatch = matchCognitive(messageToSend)
  if (cognitiveMatch) {
    history.push({ role: 'system', content: formatCognitiveContext(cognitiveMatch) })
    process.stderr.write(`\x1b[90m  [cognitive] ${cognitiveMatch.scenario}: ${cognitiveMatch.models.map((model) => model.name).join(', ')}\x1b[0m\n`)
  }

  const critiqueNotice = maybeBuildAutoCritiqueNotice({
    cwd,
    activeModel: currentModel,
    state: critiqueAutoState,
    enabled: autoCritiqueEnabled,
    threshold: autoCritiqueThreshold,
  })
  if (critiqueNotice) {
    emitInlineNotice(critiqueNotice.message, 'warn')
  }

  applyPreSendCompaction(history, tokenBudget, contextMonitor)

  const preModelLocalFilePlan = buildPreModelLocalFilePlan({
    prompt: turnPrompt,
    history,
    cwd,
  })
  if (preModelLocalFilePlan) {
    let results: LocalFileToolResult[] = []
    let summary = ''
    try {
      results = await executeReplLocalFilePlan({
        plan: preModelLocalFilePlan,
        cwd,
        history,
        resolved,
        onFileWrite,
        permissionMode: currentPermMode,
        isPermissionGranted,
        recordPermissionGrant,
        recordApprovalEvent,
        retryTracker,
        loopDetector,
        tokenBudget,
        contextMonitor,
        injectedPaths: sessionInjectedPaths,
        session,
        useInk,
      })
      summary = formatLocalFilePlanResult(preModelLocalFilePlan, results)
    } catch (error) {
      results = [{ name: 'local_file_guard', success: false, output: error instanceof Error ? error.message : String(error) }]
      summary = formatLocalFilePlanResult(preModelLocalFilePlan, results)
      if (useInk) {
        session?.emitSystemMessage(summary, 'error')
      } else {
        printError(error instanceof Error ? error.message : String(error))
      }
    }
    const success = results.every((result) => result.success)
    history.push({ role: 'user', content: turnPrompt })
    history.push({ role: 'assistant', content: summary })
    stats.turns++
    stats.turnTokens.push(0)
    if (useInk) {
      session?.emitSystemMessage(summary, success ? 'info' : 'error')
      session?.emitTurnSummary({
        inputTokens: 0,
        outputTokens: 0,
        duration: Date.now() - turnStartTime,
        toolCalls: results.length,
        costUsd: 0,
        model: currentModel,
      })
      emitStatus()
    } else {
      console.log(`\x1b[90m${summary}\x1b[0m`)
      printTurnSummary({
        elapsedMs: Date.now() - turnStartTime,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        contextPct: tokenBudget.getBudget(history).utilizationPct,
        tokPerSec: 0,
      })
    }
    return buildReplTurnExecutionResult(
      success ? 'completed' : 'failed',
      success ? 'local file request handled' : 'local file request failed',
      turnStartTime,
      stats,
      initialInputTokens,
      initialOutputTokens,
    )
  }

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

  let executionStatus: ReplTurnExecutionResult['status'] = 'aborted'
  let executionSummary = 'chat turn aborted'
  const progress = useInk ? null : new ProgressIndicator()
  if (progress) progress.start()
  if (useInk) session?.emitThinkingStart()

  try {
    if (resolved.baseURL && !abortController.signal.aborted) {
      const result = await runProxyTurn({
        prompt: turnPrompt,
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
        permissionMode: currentPermMode,
        isPermissionGranted,
        recordPermissionGrant,
        recordApprovalEvent,
        retryTracker,
        loopDetector,
        tokenBudget,
        contextMonitor,
        toolDefs,
        injectedPaths: sessionInjectedPaths,
        session,
        onStreamingStatus: (tokPerSec) => {
          setLastTokPerSec(tokPerSec)
          if (useInk) emitStatus()
        },
        reasoningEffort,
      })
      if (abortController.signal.aborted) {
        executionStatus = 'aborted'
        executionSummary = 'chat turn aborted'
        return buildReplTurnExecutionResult(
          executionStatus,
          executionSummary,
          turnStartTime,
          stats,
          initialInputTokens,
          initialOutputTokens,
        )
      }
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
      executionStatus = 'completed'
      executionSummary = 'chat turn completed'
    } else if (!abortController.signal.aborted) {
      if (progress) progress.stop()
      const activeSystemPrompt = buildSessionSystemPrompt(history)
      const result = await runSDKQuery({
        prompt: turnPrompt,
        resolved,
        config: {
          ...config,
          systemPrompt: activeSystemPrompt || config.systemPrompt,
          permissionMode: configPermissionModeFromRepl(currentPermMode),
        },
        outputMode,
        cwd,
        history,
        abortSignal: abortController.signal,
      })
      if (abortController.signal.aborted) {
        executionStatus = 'aborted'
        executionSummary = 'chat turn aborted'
        return buildReplTurnExecutionResult(
          executionStatus,
          executionSummary,
          turnStartTime,
          stats,
          initialInputTokens,
          initialOutputTokens,
        )
      }
      stats.turns++
      stats.totalInputTokens += result.inputTokens
      stats.totalOutputTokens += result.outputTokens
      stats.turnTokens.push(result.outputTokens)
      tokenBudget.recordUsage(result.inputTokens, result.outputTokens)
      contextMonitor.recordUsage(result.inputTokens, result.outputTokens)
      history.push({ role: 'user', content: turnPrompt })
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
      executionStatus = 'completed'
      executionSummary = 'chat turn completed'
    }
  } catch (error) {
    if (progress) progress.stop()
    if (error instanceof ResetSensitiveWaitCanceledError) {
      executionStatus = 'aborted'
      executionSummary = 'reset-sensitive wait canceled'
    } else if (abortController.signal.aborted) {
      executionStatus = 'aborted'
      executionSummary = 'chat turn aborted'
    } else {
      const recovered = await handleTurnFailure({
        error,
        promptToSend: turnPrompt,
        resolved,
        currentModel,
        history,
        stats,
        tokenBudget,
        contextMonitor,
      })
      executionStatus = recovered ? 'completed' : 'failed'
      executionSummary = recovered ? 'chat turn recovered after compaction retry' : `chat turn failed: ${error instanceof Error ? error.message : String(error)}`
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

  if (executionStatus !== 'aborted') {
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
      sessionId: options.sessionId,
      emitStatus,
      emitInlineNotice,
    })
  }

  return buildReplTurnExecutionResult(
    executionStatus,
    executionSummary,
    turnStartTime,
    stats,
    initialInputTokens,
    initialOutputTokens,
  )
}

async function executeReplLocalFilePlan(options: {
  plan: LocalFilePlan
  cwd: string
  history: ChatMessage[]
  resolved: ReplTurnResolvedProviderBase
  onFileWrite: (path: string, oldContent: string | null) => void
  permissionMode: PermMode
  isPermissionGranted?: (ruleKey: string) => boolean
  recordPermissionGrant?: (ruleKey: string, scope: 'session' | 'project') => void
  recordApprovalEvent?: (event: ToolApprovalEventInput) => void
  retryTracker: RetryTracker
  loopDetector: LoopDetector
  tokenBudget: TokenBudgetManager
  contextMonitor: ContextMonitor
  injectedPaths: Set<string>
  session?: ChatSessionEmitter
  useInk: boolean
}): Promise<LocalFileToolResult[]> {
  const results: LocalFileToolResult[] = []
  const allowedTools = Array.from(new Set(options.plan.toolCalls.map((call) => call.name)))
  for (const call of options.plan.toolCalls) {
    const label = JSON.stringify(call.args)
    const startedAt = Date.now()
    if (options.useInk) {
      options.session?.emitToolStart({ name: call.name, args: call.args, label })
    } else {
      printToolUse(call.name, label)
    }

    try {
      const result = await handleProxyToolCall({
        name: call.name,
        args: call.args,
        cwd: options.cwd,
        history: options.history,
        resolved: {
          model: options.resolved.model,
          apiKey: options.resolved.apiKey,
          baseURL: options.resolved.baseURL,
        },
        onFileWrite: options.onFileWrite,
        permissionMode: options.permissionMode,
        allowedTools,
        isPermissionGranted: options.isPermissionGranted,
        recordPermissionGrant: options.recordPermissionGrant,
        recordApprovalEvent: options.recordApprovalEvent,
        retryTracker: options.retryTracker,
        loopDetector: options.loopDetector,
        tokenBudget: options.tokenBudget,
        contextMonitor: options.contextMonitor,
        injectedPaths: options.injectedPaths,
        session: options.session,
      })
      if (options.useInk) {
        options.session?.emitToolEnd({ name: call.name, success: result.success, output: result.output, durationMs: Date.now() - startedAt })
      } else {
        printToolResult(call.name, result.success, result.output)
      }
      results.push({ name: call.name, success: result.success, output: result.output })
    } catch (error) {
      const output = error instanceof Error ? error.message : String(error)
      if (options.useInk) {
        options.session?.emitToolEnd({ name: call.name, success: false, output, durationMs: Date.now() - startedAt })
      }
      throw error
    }
  }
  return results
}

function buildReplTurnExecutionResult(
  status: ReplTurnExecutionResult['status'],
  summary: string,
  startTime: number,
  stats: SessionStatsLike,
  initialInputTokens: number,
  initialOutputTokens: number,
): ReplTurnExecutionResult {
  return {
    status,
    inputTokens: Math.max(0, stats.totalInputTokens - initialInputTokens),
    outputTokens: Math.max(0, stats.totalOutputTokens - initialOutputTokens),
    durationMs: Math.max(0, Date.now() - startTime),
    summary,
  }
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
  promptToSend: PromptContent
  resolved: ReplTurnResolvedProviderBase
  currentModel: string
  history: ChatMessage[]
  stats: SessionStatsLike
  tokenBudget: TokenBudgetManager
  contextMonitor: ContextMonitor
}): Promise<boolean> {
  const { error, promptToSend, resolved, currentModel, history, stats, tokenBudget, contextMonitor } = options
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
          promptToSend,
        )
        process.stdout.write(retryResult.text)
        process.stdout.write('\n')
        stats.turns++
        stats.totalInputTokens += retryResult.inputTokens
        stats.totalOutputTokens += retryResult.outputTokens
        stats.turnTokens.push(retryResult.outputTokens)
        tokenBudget.recordUsage(retryResult.inputTokens, retryResult.outputTokens)
        contextMonitor.recordUsage(retryResult.inputTokens, retryResult.outputTokens)
        history.push({ role: 'user', content: promptToSend })
        history.push({ role: 'assistant', content: retryResult.text })
        return true
      } catch (retryError) {
        printError(`Retry failed: ${retryError instanceof Error ? retryError.message : String(retryError)}`)
        return false
      }
    }
    return false
  }

  printError(errorMessage)
  return false
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
  sessionId?: string
  emitStatus: () => void
  emitInlineNotice: (text: string, level?: 'info' | 'warn' | 'error') => void
}): void {
  const { resolved, currentModel, cwd, history, stats, tokenBudget, contextMonitor, retryTracker, activeModeId, sessionId, emitStatus, emitInlineNotice } = options
  const budget = tokenBudget.getBudget(history)

  if (budget.risk === 'red') {
    hooks.run('PreCompact', { event: 'PreCompact', cwd })
    const result = tokenBudget.smartCompact(history, 1)
    hooks.run('PostCompact', { event: 'PostCompact', cwd })
    emitInlineNotice(`auto-compact (${budget.utilizationPct}%): ${result.summary}`, 'error')
    observeRuntimeEvent({
      category: 'chat',
      severity: 'warn',
      summary: 'context pressure triggered auto-compact',
      details: `risk=red utilization=${budget.utilizationPct}% summary=${result.summary}`,
      command: 'chat',
      provider: resolved.provider,
      model: currentModel,
      cwd,
      evidence: {
        sessionId,
      },
    })
    tokenBudget.clearCurrentUsage()
    contextMonitor.clearCurrentUsage()
    emitStatus()
    retryTracker.cleanup()
    autoSaveSession(sessionId || buildAutoSessionId(), resolved.provider, currentModel, history, stats, activeModeId)
    emitInlineNotice('session auto-saved. Context freed — continuing.', 'info')
    return
  }

  if (budget.risk === 'orange') {
    hooks.run('PreCompact', { event: 'PreCompact', cwd })
    const result = tokenBudget.smartCompact(history, 1)
    hooks.run('PostCompact', { event: 'PostCompact', cwd })
    if (result.dropped > 0 || result.tokensFreed > 0) {
      emitInlineNotice(`auto-compact (${budget.utilizationPct}%): ${result.summary}`, 'warn')
      observeRuntimeEvent({
        category: 'chat',
        severity: 'warn',
        summary: 'context pressure triggered auto-compact',
        details: `risk=orange utilization=${budget.utilizationPct}% summary=${result.summary}`,
        command: 'chat',
        provider: resolved.provider,
        model: currentModel,
        cwd,
        evidence: {
          sessionId,
        },
      })
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
      observeRuntimeEvent({
        category: 'chat',
        severity: 'warn',
        summary: 'context pressure triggered auto-compact',
        details: `risk=yellow utilization=${budget.utilizationPct}% summary=${result.summary}`,
        command: 'chat',
        provider: resolved.provider,
        model: currentModel,
        cwd,
        evidence: {
          sessionId,
        },
      })
      tokenBudget.clearCurrentUsage()
      contextMonitor.clearCurrentUsage()
      emitStatus()
    }
  }
}
