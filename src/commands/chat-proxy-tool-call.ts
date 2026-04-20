import { existsSync, readFileSync } from 'node:fs'
import { resolve as resolvePath } from 'node:path'
import { createInterface } from 'node:readline'
import { autoVerify, formatVerifyOutput } from '../auto-verify.js'
import { hooks } from '../hooks.js'
import { classifyError } from '../harness/index.js'
import type { ContextMonitor, LoopDetector } from '../harness/index.js'
import { PostmortemLog } from '../knowledge/index.js'
import { mcpClient } from '../mcp-client.js'
import { askPermission, printDiffPreview } from '../output.js'
import type { ChatMessage } from '../providers/openai-compat.js'
import type { RetryTracker } from '../retry-intelligence.js'
import type { TokenBudgetManager } from '../token-budget.js'
import { DANGEROUS_TOOLS, executeTool } from '../tools.js'
import type { ToolResult } from '../tools.js'
import type { ChatSessionEmitter } from '../ui/session.js'

type ToolArgs = Record<string, unknown>

interface ProxyToolDiff {
  filePath: string
  oldContent: string
  newContent: string
}

interface ProxyToolModelContext {
  model: string
  apiKey: string
  baseURL?: string | null
}

export interface ProxyToolCallParams {
  name: string
  args: ToolArgs
  cwd: string
  history: ChatMessage[]
  resolved: ProxyToolModelContext
  onFileWrite?: (path: string, oldContent: string | null) => void
  safeMode?: boolean
  retryTracker?: RetryTracker
  loopDetector?: LoopDetector
  tokenBudget?: TokenBudgetManager
  contextMonitor?: ContextMonitor
  injectedPaths?: Set<string>
  session?: ChatSessionEmitter
}

interface FinalizeToolResultOptions {
  name: string
  args: ToolArgs
  result: ToolResult
  cwd: string
  history: ChatMessage[]
  retryTracker?: RetryTracker
  loopDetector?: LoopDetector
  tokenBudget?: TokenBudgetManager
  contextMonitor?: ContextMonitor
}

export class ResetSensitiveWaitCanceledError extends Error {
  constructor(message = 'Input wait canceled by session reset.') {
    super(message)
    this.name = 'ResetSensitiveWaitCanceledError'
  }
}

function finalizeAskUserResponse(answer: string | null, optionsList?: string[]): ToolResult {
  const trimmed = answer?.trim() || ''
  if (!optionsList || optionsList.length === 0) {
    return { success: true, output: trimmed || '(no response)' }
  }

  if (!trimmed) {
    return {
      success: false,
      output: `Invalid selection. Choose one of: ${optionsList.map((option, index) => `${index + 1}. ${option}`).join(', ')}`,
    }
  }

  const numericSelection = Number.parseInt(trimmed, 10)
  if (Number.isInteger(numericSelection) && String(numericSelection) === trimmed) {
    const selected = optionsList[numericSelection - 1]
    if (selected) {
      return { success: true, output: selected }
    }
  }

  const matched = optionsList.find((option) => option.toLowerCase() === trimmed.toLowerCase())
  if (matched) {
    return { success: true, output: matched }
  }

  return {
    success: false,
    output: `Invalid selection. Choose one of: ${optionsList.map((option, index) => `${index + 1}. ${option}`).join(', ')}`,
  }
}

function readUtf8IfExists(fullPath: string): string | null {
  if (!existsSync(fullPath)) return null
  try {
    return readFileSync(fullPath, 'utf-8')
  } catch {
    return null
  }
}

interface WritableTargetSnapshot {
  fullPath: string
  oldContent: string | null
}

function snapshotWritableTarget(args: ToolArgs, cwd: string): WritableTargetSnapshot | undefined {
  if (!args.path) return undefined
  const fullPath = resolvePath(cwd, String(args.path))
  return {
    fullPath,
    oldContent: readUtf8IfExists(fullPath),
  }
}

function commitWritableSnapshot(
  snapshot: WritableTargetSnapshot | undefined,
  onFileWrite?: (path: string, oldContent: string | null) => void,
): void {
  if (!snapshot || !onFileWrite) return
  const nextContent = readUtf8IfExists(snapshot.fullPath)
  if (nextContent === snapshot.oldContent) return
  onFileWrite(snapshot.fullPath, snapshot.oldContent)
}

function buildPermissionPreview(name: string, args: ToolArgs): string {
  if (name === 'write_file') {
    return `write ${String(args.content || '').length} bytes to ${String(args.path || '')}`
  }
  if (name === 'edit_file' || name === 'multi_edit') {
    return `edit ${String(args.path || '')}`
  }
  if (name === 'delete_file') {
    return `delete ${String(args.path || '')}`
  }
  if (name === 'move_file') {
    return `move ${String(args.source || '')} → ${String(args.destination || '')}`
  }
  if (name === 'git_commit') {
    return `commit: ${String(args.message || '').slice(0, 60)}`
  }
  if (name === 'run_command' || name === 'run_background') {
    return `run: ${String(args.command || '').slice(0, 80)}`
  }
  return `${name}: ${JSON.stringify(args).slice(0, 80)}`
}

function buildSafeModeDiff(name: string, args: ToolArgs, cwd: string): ProxyToolDiff | undefined {
  if ((name !== 'write_file' && name !== 'edit_file') || !args.path) return undefined
  const fullPath = resolvePath(cwd, String(args.path))
  const oldContent = readUtf8IfExists(fullPath)
  if (oldContent === null) return undefined
  const newContent = name === 'write_file'
    ? String(args.content || '')
    : oldContent.replace(String(args.old_string || ''), String(args.new_string || ''))
  return {
    filePath: String(args.path),
    oldContent,
    newContent,
  }
}

async function requestDangerousToolPermission(name: string, args: ToolArgs, cwd: string, session?: ChatSessionEmitter): Promise<boolean> {
  const preview = buildPermissionPreview(name, args)
  const diff = buildSafeModeDiff(name, args, cwd)
  if (session) {
    return session.emitPermissionRequest({ toolName: name, preview, diff })
  }
  if (diff) {
    printDiffPreview(diff.oldContent, diff.newContent)
  }
  return askPermission(name, preview)
}

async function runPreToolHook(name: string, args: ToolArgs, cwd: string): Promise<ToolResult | undefined> {
  if (!hooks.hasHooks('PreToolUse')) return undefined
  const hookResult = await hooks.run('PreToolUse', {
    event: 'PreToolUse',
    toolName: name,
    toolInput: args,
    cwd,
  })
  if (!hookResult.continue) {
    return {
      success: false,
      output: `Blocked by hook: ${hookResult.stopReason || 'PreToolUse hook denied'}`,
    }
  }
  if (hookResult.updatedInput) {
    Object.assign(args, hookResult.updatedInput)
  }
  if (hookResult.systemMessage) {
    console.log(`\x1b[33m  hook: ${hookResult.systemMessage}\x1b[0m`)
  }
  return undefined
}

async function handleSpecialProxyTool(params: ProxyToolCallParams): Promise<ToolResult | undefined> {
  const { name, args, cwd, resolved, session, safeMode } = params

  if (name === 'spawn_agent' || name === 'delegate_task') {
    if (name === 'delegate_task' && safeMode) {
      return { success: false, output: 'delegate_task is disabled in safe mode.' }
    }
    const subTask = String(args.task || args.context || '')
    if (!subTask) {
      return { success: false, output: 'task is required.' }
    }

    await hooks.run('SubagentStart', { event: 'SubagentStart', cwd, model: resolved.model })
    console.log('\x1b[90m  spawning sub-agent...\x1b[0m')

    const { spawnSubAgent, READ_ONLY_TOOLS, DELEGATE_TOOLS } = await import('../agent/sub-agent.js')
    const toolSet = name === 'spawn_agent' ? READ_ONLY_TOOLS : DELEGATE_TOOLS
    const result = await spawnSubAgent(
      { task: subTask, cwd, tools: toolSet, timeout: 120_000 },
      { model: resolved.model, apiKey: resolved.apiKey, baseURL: resolved.baseURL || '' },
    )

    console.log(`\x1b[90m  sub-agent done (${(result.duration / 1000).toFixed(1)}s, ${result.tokensUsed} tokens)\x1b[0m`)
    return { success: result.success, output: result.output }
  }

  if (name === 'ask_user') {
    const question = String(args.question || 'What would you like to do?')
    const optionsList = Array.isArray(args.options)
      ? args.options.filter((option): option is string => typeof option === 'string')
      : undefined

    if (session) {
      session.emitSystemMessage(`? ${question}`, 'info')
      if (optionsList && optionsList.length > 0) {
        optionsList.forEach((option, index) => session.emitSystemMessage(`  ${index + 1}. ${option}`, 'info'))
      }
      const answer = await session.waitForInput({ cancelOnClear: true })
      if (answer === null && session.consumeCanceledResetSensitiveWait()) {
        throw new ResetSensitiveWaitCanceledError()
      }
      return finalizeAskUserResponse(answer, optionsList)
    }

    console.log(`\n\x1b[36m  ? ${question}\x1b[0m`)
    if (optionsList && optionsList.length > 0) {
      optionsList.forEach((option, index) => console.log(`\x1b[90m    ${index + 1}. ${option}\x1b[0m`))
    }
    const askRl = createInterface({ input: process.stdin, output: process.stdout })
    const answer = await new Promise<string>((resolve) => {
      askRl.question('\x1b[90m  > \x1b[0m', (input) => {
        askRl.close()
        resolve(input.trim())
      })
    })
    return finalizeAskUserResponse(answer, optionsList)
  }

  if (name === 'mcp_list_resources') {
    try {
      const resources = await mcpClient.listResources(args.server ? String(args.server) : undefined)
      if (resources.length === 0) {
        return { success: true, output: 'No resources available from connected MCP servers.' }
      }
      const lines = resources.map((resource) =>
        `${resource.uri} — ${resource.name}${resource.description ? ': ' + resource.description : ''}`,
      )
      return { success: true, output: lines.join('\n') }
    } catch (error) {
      return { success: false, output: `MCP error: ${error instanceof Error ? error.message : String(error)}` }
    }
  }

  if (name === 'mcp_read_resource') {
    const uri = String(args.uri || '')
    if (!uri) {
      return { success: false, output: 'uri is required.' }
    }
    try {
      const content = await mcpClient.readResource(uri)
      return { success: true, output: content.slice(0, 20_000) }
    } catch (error) {
      return { success: false, output: `MCP error: ${error instanceof Error ? error.message : String(error)}` }
    }
  }

  if (name.startsWith('mcp__')) {
    try {
      const result = await mcpClient.routeToolCall(name, args)
      if (result) return result
      return { success: false, output: `MCP tool not found: ${name}` }
    } catch (error) {
      return { success: false, output: `MCP error: ${error instanceof Error ? error.message : String(error)}` }
    }
  }

  if (name === 'sleep') {
    const seconds = Math.min(Number(args.seconds) || 1, 60)
    const reason = String(args.reason || '')
    if (reason) {
      console.log(`\x1b[90m  waiting ${seconds}s: ${reason}\x1b[0m`)
    }
    await new Promise((resolve) => setTimeout(resolve, seconds * 1000))
    return { success: true, output: `Waited ${seconds}s.` }
  }

  return undefined
}

function emitLiveDiffSummary(name: string, args: ToolArgs, cwd: string, session?: ChatSessionEmitter): void {
  if (!session || (name !== 'write_file' && name !== 'edit_file') || !args.path) return
  const fullPath = resolvePath(cwd, String(args.path))
  const oldContent = readUtf8IfExists(fullPath)
  if (oldContent === null) return

  try {
    const newContent = name === 'write_file'
      ? String(args.content || '')
      : oldContent.replace(String(args.old_string || ''), String(args.new_string || ''))
    const oldLines = oldContent.split('\n')
    const newLines = newContent.split('\n')
    const added = newLines.filter((line, index) => line !== oldLines[index]).length
    const removed = oldLines.filter((line, index) => line !== newLines[index]).length
    if (added > 0 || removed > 0) {
      session.emitSystemMessage(`diff ${String(args.path)}: +${added} -${removed} lines`, 'info')
    }
  } catch {
    // Best-effort UI hint only.
  }
}

function applyRetryIntelligence(result: ToolResult, name: string, args: ToolArgs, retryTracker?: RetryTracker): void {
  if (!retryTracker) return
  if (result.success) {
    retryTracker.recordSuccess(name, args)
    return
  }
  const hint = retryTracker.recordFailure(name, args, result.output)
  if (hint.shouldWarn) {
    result.output += `\n\n${hint.hint}`
  }
}

function appendClassifiedError(result: ToolResult): void {
  if (result.success) return
  const classified = classifyError(result.output)
  result.output += `\n[error-classifier] ${classified.category}: ${classified.suggestion}`
  if (classified.retryable) {
    result.output += ` (retryable after ${classified.retryDelay || 0}ms)`
  }
}

function applyLoopDetection(result: ToolResult, name: string, args: ToolArgs, loopDetector?: LoopDetector): void {
  if (!loopDetector) return

  const argsKey = String(args.path || args.pattern || args.command || name)
  if (result.success) {
    loopDetector.recordSuccess(name, argsKey)
    return
  }

  const action = loopDetector.recordFailure(name, argsKey, result.output)
  if (action === 'pivot') {
    const suggestion = loopDetector.getPivotSuggestion(name, argsKey)
    result.output += `\n[loop-detector] PIVOT — ${suggestion}`
  } else if (action === 'escalate') {
    result.output += '\n[loop-detector] ESCALATE — this tool has failed 3+ times on the same target. Stop and ask the user for guidance.'
    process.stderr.write(`\x1b[31m  [harness] loop detected: ${name} failed 3+ times — escalating to user\x1b[0m\n`)
  }

  try {
    const pmLog = new PostmortemLog()
    const matches = pmLog.match(result.output)
    if (matches.length === 0) return
    const context = pmLog.formatForContext(matches)
    result.output += `\n${context}`
    process.stderr.write(`\x1b[90m  [postmortem] matched ${matches.length} known fix(es)\x1b[0m\n`)
    for (const match of matches) {
      pmLog.markApplied(match.id)
    }
  } catch {
    // Postmortem matching is best-effort.
  }
}

function appendAutoVerify(result: ToolResult, name: string, args: ToolArgs, cwd: string): void {
  if (!result.success || !['write_file', 'edit_file', 'multi_edit'].includes(name) || !args.path) return
  const fullPath = resolvePath(cwd, String(args.path))
  const verifyResult = autoVerify(fullPath, cwd)
  const verifyOutput = formatVerifyOutput(verifyResult)
  if (verifyOutput) {
    result.output += verifyOutput
  }
}

async function runPostToolHook(name: string, args: ToolArgs, result: ToolResult, cwd: string): Promise<void> {
  if (!hooks.hasHooks('PostToolUse')) return
  await hooks.run('PostToolUse', {
    event: 'PostToolUse',
    toolName: name,
    toolInput: args,
    toolOutput: result.output,
    toolSuccess: result.success,
    cwd,
  })
}

async function finalizeToolResult(options: FinalizeToolResultOptions): Promise<ToolResult> {
  const { name, args, result, cwd, history, retryTracker, loopDetector, tokenBudget, contextMonitor } = options
  applyRetryIntelligence(result, name, args, retryTracker)
  appendClassifiedError(result)
  applyLoopDetection(result, name, args, loopDetector)
  appendAutoVerify(result, name, args, cwd)
  await runPostToolHook(name, args, result, cwd)
  runContextGuard(history, tokenBudget, contextMonitor)
  return result
}

function runContextGuard(history: ChatMessage[], tokenBudget?: TokenBudgetManager, contextMonitor?: ContextMonitor): void {
  if (!tokenBudget) return
  const budget = tokenBudget.getBudget(history)
  if (budget.utilizationPct < 60) return

  const compactResult = tokenBudget.smartCompact(history)
  if (compactResult.dropped <= 0 && compactResult.tokensFreed <= 0) return

  process.stderr.write(`\x1b[33m  [context-guard] auto-compact: ${compactResult.summary}\x1b[0m\n`)
  tokenBudget.clearCurrentUsage()
  contextMonitor?.clearCurrentUsage()
}

export async function handleProxyToolCall(params: ProxyToolCallParams): Promise<ToolResult> {
  const {
    name,
    args,
    cwd,
    history,
    onFileWrite,
    safeMode,
    retryTracker,
    loopDetector,
    tokenBudget,
    contextMonitor,
    injectedPaths,
    session,
  } = params

  let writableSnapshot: WritableTargetSnapshot | undefined

  const blockedByHook = await runPreToolHook(name, args, cwd)
  if (blockedByHook) {
    return blockedByHook
  }

  if (DANGEROUS_TOOLS.has(name)) {
    if ((name === 'write_file' || name === 'edit_file' || name === 'multi_edit') && args.path) {
      writableSnapshot = snapshotWritableTarget(args, cwd)
    }

    if (safeMode) {
      const allowed = await requestDangerousToolPermission(name, args, cwd, session)
      if (!allowed) {
        return { success: false, output: 'User denied permission.' }
      }
    }
  }

  const specialResult = await handleSpecialProxyTool(params)
  if (specialResult) {
    return finalizeToolResult({
      name,
      args,
      result: specialResult,
      cwd,
      history,
      retryTracker,
      loopDetector,
      tokenBudget,
      contextMonitor,
    })
  }

  emitLiveDiffSummary(name, args, cwd, session)

  const result = executeTool(name, args, cwd, injectedPaths)
  if (result.success && (name === 'write_file' || name === 'edit_file' || name === 'multi_edit')) {
    commitWritableSnapshot(writableSnapshot, onFileWrite)
  }
  return finalizeToolResult({
    name,
    args,
    result,
    cwd,
    history,
    retryTracker,
    loopDetector,
    tokenBudget,
    contextMonitor,
  })
}
