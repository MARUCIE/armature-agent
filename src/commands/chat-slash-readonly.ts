import { execFileSync, type ExecFileSyncOptionsWithStringEncoding } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { getGlobalConfigPath, listProviders, resolveConfig } from '../config.js'
import { listBackgroundJobs } from '../background-jobs.js'
import { hooks } from '../hooks.js'
import { mcpClient } from '../mcp-client.js'
import {
  findModelChoice,
  formatContextWindow,
  formatPricing,
  getPricingForModel,
  groupModelChoicesByProvider,
  type ModelChoice,
} from '../model-catalog.js'
import { messageContentToText, type ChatMessage } from '../providers/openai-compat.js'
import { buildTaskRunEvidenceDrawer, formatTaskRunEvidenceDrawerMarkdown } from './queue.js'
import { listSessionFiles, loadSessionFile } from '../session-store.js'
import { TOOL_DEFINITIONS } from '../tools.js'
import {
  createCommandConsole,
  createCommandOutput,
  escapeMarkdownInline,
  escapeMarkdownTableCell,
  formatMarkdownCodeBlock,
  formatMarkdownCodeSpan,
  type CommandOutput,
} from '../ui/command-output.js'
import type { ChatSessionEmitter } from '../ui/session.js'
import { buildSafeGitSlashArgs } from './chat-input.js'
import {
  listSlashHelpCommands,
  SLASH_HELP_SECTION_PAIRS,
  type SlashCommandDefinition,
} from '../slash-commands.js'

export type ReadonlySlashCommandResult = 'handled' | 'pick_model' | 'not_handled'

export interface ReadonlySlashResolvedProvider {
  provider: string
  apiKey: string
  baseURL?: string
}

export interface ReadonlySlashSessionStats {
  turns: number
  totalInputTokens: number
  totalOutputTokens: number
  startTime: number
}

export interface ReadonlySlashModelControl {
  getModel: () => string
  getProvider: () => string
  getChoices: () => ModelChoice[]
}

export interface ReadonlySlashHarness {
  tokenBudget: {
    getBudget: (history: ChatMessage[]) => {
      utilizationPct: number
      historyTokensEst: number
      contextWindow: number
    }
  }
}

export interface ReadonlySlashCommandOptions {
  cmd: string
  arg: string
  resolved: ReadonlySlashResolvedProvider
  history: ChatMessage[]
  stats: ReadonlySlashSessionStats
  cwd: string
  mc: ReadonlySlashModelControl
  harness?: ReadonlySlashHarness
  session?: ChatSessionEmitter
  sessionId?: string
  modeLabel?: string
  modelPolicyLabel?: string
  effortLabel?: string
  permissionLabel?: string
  permissionSource?: string
  toolPolicyLabel?: string
  outputStyleLabel?: string
}

function createSafeGitExecOptions(cwd: string): ExecFileSyncOptionsWithStringEncoding {
  return {
    cwd,
    encoding: 'utf-8',
    timeout: 10_000,
    maxBuffer: 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      GIT_EXTERNAL_DIFF: '',
    },
  }
}

function buildReadOnlyGitExecArgs(args: string[]): string[] {
  const [subcommand, ...rest] = args
  if (!subcommand) return args
  const prefixedArgs = ['-c', 'diff.external=']
  if (subcommand === 'diff' || subcommand === 'show' || subcommand === 'log') {
    return [...prefixedArgs, subcommand, '--no-ext-diff', ...rest]
  }
  return [...prefixedArgs, ...args]
}

function formatSlashHelpEntry(command: SlashCommandDefinition): string {
  return `${command.name.padEnd(12)} ${command.description}`
}

function formatMarkdownSlashHelpEntry(command: SlashCommandDefinition): string {
  return `\`${command.name}\` ${command.description}`
}

function renderHelp(session?: ChatSessionEmitter): void {
  if (session) {
    const lines: string[] = []
    for (const [leftSection, rightSection] of SLASH_HELP_SECTION_PAIRS) {
      const leftCommands = listSlashHelpCommands(leftSection)
      const rightCommands = listSlashHelpCommands(rightSection)
      lines.push(`**${leftSection}**`.padEnd(28) + `| **${rightSection}**`)
      const rows = Math.max(leftCommands.length, rightCommands.length)
      for (let i = 0; i < rows; i += 1) {
        const left = leftCommands[i] ? formatMarkdownSlashHelpEntry(leftCommands[i]!) : ''
        const right = rightCommands[i] ? formatMarkdownSlashHelpEntry(rightCommands[i]!) : ''
        lines.push(left.padEnd(28) + `| ${right}`)
      }
      lines.push('')
    }
    lines.push('**Tips**: `!cmd` shell escape · `Tab` auto-complete · `/` command picker · `Ctrl+J` newline')
    session.emitText(lines.join('\n'))
    return
  }

  const dim = '\x1b[90m'
  const bold = '\x1b[1m'
  const reset = '\x1b[0m'
  const row = (left: string, right: string) => `${dim}  ${left.padEnd(28)}${dim}│${reset} ${dim}${right}${reset}`
  for (const [leftSection, rightSection] of SLASH_HELP_SECTION_PAIRS) {
    const leftCommands = listSlashHelpCommands(leftSection)
    const rightCommands = listSlashHelpCommands(rightSection)
    console.log()
    console.log(`${dim}  ${bold}${leftSection}${reset}${dim}${' '.repeat(Math.max(1, 31 - leftSection.length))}${dim}│ ${bold}${rightSection}${reset}`)
    const rows = Math.max(leftCommands.length, rightCommands.length)
    for (let i = 0; i < rows; i += 1) {
      const left = leftCommands[i] ? formatSlashHelpEntry(leftCommands[i]!) : ''
      const right = rightCommands[i] ? formatSlashHelpEntry(rightCommands[i]!) : ''
      console.log(row(left, right))
    }
  }
  console.log()
  console.log(`${dim}  ${bold}Tips${reset}`)
  console.log(row('!cmd      Shell escape', 'Ctrl+L   Reset chat'))
  console.log(row('Tab       Auto-complete', 'Ctrl+Z   Undo last write'))
  console.log(row('/         Command picker', 'Shift+Tab Mode cycle'))
  console.log(reset)
}

function renderModelInfo(
  arg: string,
  mc: ReadonlySlashModelControl,
  output: CommandOutput,
): ReadonlySlashCommandResult {
  const console = createCommandConsole(output)
  if (arg.startsWith('set ') || arg.startsWith('use ')) {
    return 'not_handled'
  }

  const current = findModelChoice(mc.getChoices(), mc.getModel(), mc.getProvider())
  console.log(`\x1b[90m  provider: ${mc.getProvider()}  model: \x1b[36m${mc.getModel()}\x1b[0m`)
  if (current) {
    console.log(`\x1b[90m  context: ${formatContextWindow(current.contextWindow)}  max out: ${formatContextWindow(current.maxOutput)}  pricing: ${formatPricing(current.pricing)} per 1M in/out\x1b[0m`)
    if (current.note) console.log(`\x1b[33m  caution: ${current.note}\x1b[0m`)
  }
  return 'handled'
}

function renderModels(mc: ReadonlySlashModelControl, output: CommandOutput): ReadonlySlashCommandResult {
  const console = createCommandConsole(output)
  const choices = mc.getChoices()
  console.log('\x1b[90m  Available models:\x1b[0m')
  let index = 0
  for (const group of groupModelChoicesByProvider(choices)) {
    console.log(`\x1b[90m  ${group.provider}\x1b[0m`)
    for (const choice of group.choices) {
      const model = choice.model
      const current = model === mc.getModel() && choice.provider === mc.getProvider()
      const idx = `${index + 1}`.padStart(2)
      const marker = current ? '\x1b[36m' : '\x1b[90m'
      const arrow = current ? ' →' : '  '
      console.log(`${marker}  ${idx}.${arrow} ${model}\x1b[0m`)
      console.log(`\x1b[90m      ${formatContextWindow(choice.contextWindow)} ctx · ${formatPricing(choice.pricing)} per 1M in/out${choice.agentic === 'caution' ? ' · caution' : ''}\x1b[0m`)
      index += 1
    }
  }
  console.log(`\x1b[90m  Enter number (1-${choices.length}):\x1b[0m`)
  return 'pick_model'
}

function renderDiff(cwd: string, output: CommandOutput, session?: ChatSessionEmitter): void {
  const console = createCommandConsole(output)
  try {
    const gitExecOptions = createSafeGitExecOptions(cwd)
    const stat = execFileSync('git', buildReadOnlyGitExecArgs(['diff', '--stat']), gitExecOptions).trim()
    const patch = execFileSync('git', buildReadOnlyGitExecArgs(['diff', '--no-color']), gitExecOptions).trim()
    const diff = [stat, patch].filter(Boolean).join('\n---\n')
    if (diff.trim()) {
      const safeDiff = diff.slice(0, 4000)
      if (session) {
        session.emitText(formatMarkdownCodeBlock(safeDiff, 'diff'))
        if (diff.length > 4000) session.emitSystemMessage('(truncated)', 'info')
      } else {
        console.log(`\x1b[90m${diff.slice(0, 3000)}\x1b[0m`)
        if (diff.length > 3000) console.log('\x1b[90m  ... (truncated)\x1b[0m')
      }
    } else if (session) {
      session.emitSystemMessage('no changes.', 'info')
    } else {
      console.log('\x1b[90m  no changes.\x1b[0m')
    }
  } catch (error) {
    const message = `git diff failed: ${error instanceof Error ? error.message : error}`
    if (session) session.emitSystemMessage(message, 'error')
    else console.log(`\x1b[31m  ${message}\x1b[0m`)
  }
}

function renderGit(arg: string, cwd: string, output: CommandOutput): void {
  const console = createCommandConsole(output)
  if (!arg) {
    console.log('\x1b[33m  usage: /git <command>  (e.g., /git status, /git log --oneline -5)\x1b[0m')
    return
  }

  try {
    const gitArgs = buildSafeGitSlashArgs(arg)
    const output = execFileSync('git', buildReadOnlyGitExecArgs(gitArgs), createSafeGitExecOptions(cwd))
    console.log(`\x1b[90m${output.slice(0, 3000)}\x1b[0m`)
    if (output.length > 3000) console.log('\x1b[90m  ... (truncated)\x1b[0m')
  } catch (error) {
    const execError = error as { stdout?: string; stderr?: string; message: string }
    console.log(`\x1b[31m  ${(execError.stderr || execError.stdout || execError.message).slice(0, 500)}\x1b[0m`)
  }
}

function renderSessions(output: CommandOutput): void {
  const console = createCommandConsole(output)
  const files = listSessionFiles()
  if (files.length === 0) {
    console.log('\x1b[90m  no saved sessions.\x1b[0m')
    return
  }
  console.log('\x1b[90m  Saved sessions:\x1b[0m')
  for (const file of files.slice(0, 10)) {
    const data = loadSessionFile(file.path)
    if (data) {
      const turns = data.stats?.turns || 0
      const savedAt = data.savedAt ? new Date(data.savedAt).toLocaleString() : '?'
      console.log(`\x1b[90m    ${file.name}\x1b[0m  \x1b[90m${turns} turns · ${savedAt}\x1b[0m`)
      continue
    }
    console.log(`\x1b[90m    ${file.name}\x1b[0m`)
  }
  if (files.length > 10) {
    console.log(`\x1b[90m    ... and ${files.length - 10} more\x1b[0m`)
  }
}

function renderJobs(output: CommandOutput): void {
  const console = createCommandConsole(output)
  const jobs = listBackgroundJobs(10)
  if (jobs.length === 0) {
    console.log('\x1b[90m  no background jobs.\x1b[0m')
    return
  }

  console.log('\x1b[90m  Background jobs:\x1b[0m')
  for (const job of jobs) {
    const completed = job.completedAt ? ` · ${job.completedAt}` : ''
    const status = job.status === 'completed'
      ? '\x1b[32mcompleted\x1b[0m'
      : job.status === 'failed'
        ? '\x1b[31mfailed\x1b[0m'
        : '\x1b[33mrunning\x1b[0m'
    console.log(`\x1b[90m    ${job.id}\x1b[0m ${status}\x1b[90m${completed}\x1b[0m`)
    console.log(`\x1b[90m      ${job.command.slice(0, 90)}${job.command.length > 90 ? '...' : ''}\x1b[0m`)
  }
}

function renderEvidencePanel(arg: string, output: CommandOutput, session?: ChatSessionEmitter): void {
  const id = arg.trim().split(/\s+/)[0]
  if (!id) {
    const message = 'usage: /evidence <task-run-id>'
    if (session) session.emitSystemMessage(message, 'warn')
    else output.warn(message)
    return
  }

  const drawer = buildTaskRunEvidenceDrawer(id, { lines: '60', maxBytes: '12000' })
  if (!drawer) {
    const message = `task run not found: ${id}`
    if (session) session.emitSystemMessage(message, 'error')
    else output.error(message)
    return
  }

  const body = formatTaskRunEvidenceDrawerMarkdown(drawer)
  if (session) {
    session.emitDetailPanel({
      title: 'TaskRun Evidence',
      subtitle: `${drawer.taskRunId} · ${drawer.status}`,
      body,
      tone: drawer.status === 'failed' || drawer.status === 'aborted'
        ? 'error'
        : drawer.status === 'running' || drawer.status === 'queued'
          ? 'warn'
          : 'info',
    })
    return
  }

  output.info(body)
}

function renderCost(
  stats: ReadonlySlashSessionStats,
  mc: ReadonlySlashModelControl,
  output: CommandOutput,
  session?: ChatSessionEmitter,
): void {
  const pricing = getPricingForModel(mc.getModel())
  const cost = pricing
    ? (stats.totalInputTokens * pricing[0] + stats.totalOutputTokens * pricing[1]) / 1_000_000
    : 0
  const costDisplay = cost >= 0.01 ? `$${cost.toFixed(2)}` : cost > 0 ? `${(cost * 100).toFixed(1)}c` : '$0'

  if (session) {
    const pricingLabel = pricing ? `$${pricing[0]}/$${pricing[1]} per 1M` : 'n/a'
    session.emitText([
      `**Cost** — ${escapeMarkdownInline(mc.getModel())} (${escapeMarkdownInline(pricingLabel)})`,
      '| Metric | Value |',
      '|--------|-------|',
      `| Input | ${stats.totalInputTokens.toLocaleString()} tokens |`,
      `| Output | ${stats.totalOutputTokens.toLocaleString()} tokens |`,
      `| Total | ${(stats.totalInputTokens + stats.totalOutputTokens).toLocaleString()} tokens |`,
      `| Cost | **${costDisplay}** |`,
      `| Turns | ${stats.turns} |`,
      `| Time | ${((Date.now() - stats.startTime) / 1000 / 60).toFixed(1)} min |`,
    ].join('\n') + '\n')
    return
  }

  const pricingLabel = pricing ? `$${pricing[0]}/$${pricing[1]} per 1M in/out` : 'pricing unavailable'
  const console = createCommandConsole(output)
  console.log('\x1b[90m  Cost breakdown:\x1b[0m')
  console.log(`\x1b[90m    model:   ${mc.getModel()} (${pricingLabel})\x1b[0m`)
  console.log(`\x1b[90m    input:   ${stats.totalInputTokens.toLocaleString()} tokens\x1b[0m`)
  console.log(`\x1b[90m    output:  ${stats.totalOutputTokens.toLocaleString()} tokens\x1b[0m`)
  console.log(`\x1b[90m    total:   ${(stats.totalInputTokens + stats.totalOutputTokens).toLocaleString()} tokens\x1b[0m`)
  console.log(`\x1b[90m    cost:    \x1b[36m${costDisplay}\x1b[0m`)
  console.log(`\x1b[90m    turns:   ${stats.turns}\x1b[0m`)
  console.log(`\x1b[90m    time:    ${((Date.now() - stats.startTime) / 1000 / 60).toFixed(1)} min\x1b[0m`)
}

function renderStatus(
  history: ChatMessage[],
  stats: ReadonlySlashSessionStats,
  cwd: string,
  mc: ReadonlySlashModelControl,
  output: CommandOutput,
  harness?: ReadonlySlashHarness,
  session?: ChatSessionEmitter,
  sessionId?: string,
  modeLabel: string = 'default',
  modelPolicyLabel?: string,
  effortLabel = 'high',
  permissionLabel?: string,
  permissionSource?: string,
  toolPolicyLabel?: string,
  outputStyleLabel?: string,
): void {
  const messages = history.filter((message) => message.role !== 'system').length
  const budget = harness?.tokenBudget.getBudget(history)
  const contextLine = budget
    ? `${budget.utilizationPct}% (${budget.historyTokensEst.toLocaleString()} / ${budget.contextWindow.toLocaleString()} tokens)`
    : `~${Math.ceil(history.reduce((sum, message) => sum + messageContentToText(message.content).length, 0) / 4).toLocaleString()} tokens (est)`

  if (session) {
    session.emitText([
      `**Status** — ${escapeMarkdownInline(`${mc.getProvider()}/${mc.getModel()}`)}`,
      '| | |',
      '|---|---|',
      `| Turns | ${stats.turns} |`,
      `| Messages | ${messages} |`,
      `| Context | ${contextLine} |`,
      `| Consumed | ${(stats.totalInputTokens + stats.totalOutputTokens).toLocaleString()} tokens |`,
      `| Session | ${escapeMarkdownTableCell(sessionId || 'n/a')} |`,
      `| Mode | ${escapeMarkdownTableCell(modeLabel)} |`,
      `| Model Policy | ${escapeMarkdownTableCell(modelPolicyLabel || 'n/a')} |`,
      `| Effort | ${escapeMarkdownTableCell(effortLabel)} |`,
      `| Permissions | ${escapeMarkdownTableCell(permissionLabel ? `${permissionLabel}${permissionSource ? ` (${permissionSource})` : ''}` : 'n/a')} |`,
      `| Tool Policy | ${escapeMarkdownTableCell(toolPolicyLabel || 'n/a')} |`,
      `| Output Style | ${escapeMarkdownTableCell(outputStyleLabel || 'n/a')} |`,
      `| cwd | ${formatMarkdownCodeSpan(cwd)} |`,
      `| Hooks | ${hooks.totalHooks} |`,
      `| MCP | ${mcpClient.configuredCount} servers |`,
    ].join('\n') + '\n')
    return
  }

  const console = createCommandConsole(output)
  console.log('\x1b[90m  Session status:\x1b[0m')
  console.log(`\x1b[90m    provider: \x1b[36m${mc.getProvider()}/${mc.getModel()}\x1b[0m`)
  console.log(`\x1b[90m    turns:    ${stats.turns}\x1b[0m`)
  console.log(`\x1b[90m    messages: ${messages}\x1b[0m`)
  console.log(`\x1b[90m    context:  ${contextLine}\x1b[0m`)
  console.log(`\x1b[90m    consumed: ${(stats.totalInputTokens + stats.totalOutputTokens).toLocaleString()} tokens (cumulative)\x1b[0m`)
  console.log(`\x1b[90m    session:  ${sessionId || 'n/a'}\x1b[0m`)
  console.log(`\x1b[90m    mode:     ${modeLabel}\x1b[0m`)
  console.log(`\x1b[90m    model:    ${modelPolicyLabel || 'n/a'}\x1b[0m`)
  console.log(`\x1b[90m    effort:   ${effortLabel}\x1b[0m`)
  console.log(`\x1b[90m    perms:    ${permissionLabel ? `${permissionLabel}${permissionSource ? ` (${permissionSource})` : ''}` : 'n/a'}\x1b[0m`)
  console.log(`\x1b[90m    tools:    ${toolPolicyLabel || 'n/a'}\x1b[0m`)
  console.log(`\x1b[90m    output:   ${outputStyleLabel || 'n/a'}\x1b[0m`)
  console.log(`\x1b[90m    cwd:      ${cwd}\x1b[0m`)
  console.log(`\x1b[90m    hooks:    ${hooks.totalHooks}\x1b[0m`)
  console.log(`\x1b[90m    mcp:      ${mcpClient.configuredCount} servers\x1b[0m`)
}

function renderDoctor(resolved: ReadonlySlashResolvedProvider, output: CommandOutput): void {
  const console = createCommandConsole(output)
  console.log('\x1b[90m  Health check:\x1b[0m')
  const providerReady = Boolean(resolved.apiKey) && Boolean(resolved.baseURL)
  console.log(`\x1b[90m    provider: ${providerReady ? '\x1b[32mOK\x1b[0m' : '\x1b[31mNO KEY\x1b[0m'} (${resolved.provider})\x1b[0m`)
  const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || '(system auto-detect)'
  console.log(`\x1b[90m    proxy:    ${proxy}\x1b[0m`)
  try {
    execFileSync('git', ['--version'], { stdio: ['pipe', 'pipe', 'pipe'] })
    console.log('\x1b[90m    git:      \x1b[32mOK\x1b[0m')
  } catch {
    console.log('\x1b[90m    git:      \x1b[31mNOT FOUND\x1b[0m')
  }
  console.log(`\x1b[90m    node:     ${process.version}\x1b[0m`)
  console.log(`\x1b[90m    hooks:    ${hooks.totalHooks}\x1b[0m`)
  console.log(`\x1b[90m    mcp:      ${mcpClient.configuredCount} configured\x1b[0m`)
  console.log(`\x1b[90m    tools:    ${TOOL_DEFINITIONS.length}\x1b[0m`)
}

function renderConfig(
  cwd: string,
  mc: ReadonlySlashModelControl,
  modeLabel: string,
  output: CommandOutput,
): void {
  const console = createCommandConsole(output)
  console.log('\x1b[90m  Config files:\x1b[0m')
  console.log(`\x1b[90m    global: ${getGlobalConfigPath()}\x1b[0m`)
  console.log(`\x1b[90m    project: ${join(cwd, '.orca.json')}\x1b[0m`)
  console.log('\x1b[90m  Current:\x1b[0m')
  console.log(`\x1b[90m    provider: ${mc.getProvider()}\x1b[0m`)
  console.log(`\x1b[90m    model:    ${mc.getModel()}\x1b[0m`)
  console.log(`\x1b[90m    mode:     ${modeLabel}\x1b[0m`)
  console.log('\x1b[90m  Edit: orca init (project) or ~/.orca/config.json (global)\x1b[0m')
}

function renderProviders(cwd: string, mc: ReadonlySlashModelControl, output: CommandOutput): void {
  const console = createCommandConsole(output)
  const resolvedConfig = resolveConfig({ cwd })
  const providers = listProviders(resolvedConfig)
  console.log('\x1b[90m  Providers:\x1b[0m')
  for (const provider of providers) {
    const status = provider.disabled ? '\x1b[90mdisabled\x1b[0m' : provider.hasKey ? '\x1b[32mready\x1b[0m' : '\x1b[31mno key\x1b[0m'
    const active = provider.id === mc.getProvider() ? ' \x1b[36m←\x1b[0m' : ''
    console.log(`\x1b[90m    ${provider.id.padEnd(14)} ${provider.model.padEnd(24)} ${status}${active}\x1b[0m`)
  }
}

export function handleReadonlySlashCommand(options: ReadonlySlashCommandOptions): ReadonlySlashCommandResult {
  const { cmd, arg, resolved, history, stats, cwd, mc, harness, session, modeLabel = 'default' } = options
  const output = createCommandOutput(session)
  const console = createCommandConsole(output)

  switch (cmd) {
    case '/help':
    case '/h':
    case '/?':
      renderHelp(session)
      return 'handled'

    case '/model':
    case '/m':
      if (!arg) return session ? 'pick_model' : renderModels(mc, output)
      if (arg === 'show' || arg === 'info') return renderModelInfo('', mc, output)
      return 'not_handled'

    case '/models':
      return session ? 'pick_model' : renderModels(mc, output)

    case '/history': {
      const userMessages = history.filter((message) => message.role === 'user').length
      const assistantMessages = history.filter((message) => message.role === 'assistant').length
      const systemMessages = history.filter((message) => message.role === 'system').length
      const totalChars = history.reduce((sum, message) => sum + messageContentToText(message.content).length, 0)
      console.log(`\x1b[90m  ${userMessages} user + ${assistantMessages} assistant + ${systemMessages} system (${totalChars.toLocaleString()} chars)\x1b[0m`)
      return 'handled'
    }

    case '/tokens': {
      const totalTokens = stats.totalInputTokens + stats.totalOutputTokens
      output.info([
        `input:  ${stats.totalInputTokens.toLocaleString()} tokens`,
        `output: ${stats.totalOutputTokens.toLocaleString()} tokens`,
        `total:  ${totalTokens.toLocaleString()} tokens`,
      ].join('\n'))
      return 'handled'
    }

    case '/stats': {
      const elapsed = ((Date.now() - stats.startTime) / 1000).toFixed(0)
      const totalTokens = stats.totalInputTokens + stats.totalOutputTokens
      const historyChars = history.reduce((sum, message) => sum + messageContentToText(message.content).length, 0)
      output.info([
        `model:    ${mc.getModel()}`,
        `turns:    ${stats.turns}`,
        `tokens:   ${totalTokens.toLocaleString()} (in: ${stats.totalInputTokens.toLocaleString()} / out: ${stats.totalOutputTokens.toLocaleString()})`,
        `context:  ${historyChars.toLocaleString()} chars in ${history.length} messages`,
        `duration: ${elapsed}s`,
      ].join('\n'))
      return 'handled'
    }

    case '/cwd':
      console.log(`\x1b[90m  ${cwd}\x1b[0m`)
      return 'handled'

    case '/diff':
      renderDiff(cwd, output, session)
      return 'handled'

    case '/git':
      renderGit(arg, cwd, output)
      return 'handled'

    case '/sessions':
      renderSessions(output)
      return 'handled'

    case '/jobs':
      renderJobs(output)
      return 'handled'

    case '/evidence':
      renderEvidencePanel(arg, output, session)
      return 'handled'

    case '/cost':
      renderCost(stats, mc, output, session)
      return 'handled'

    case '/status':
      renderStatus(
        history,
        stats,
        cwd,
        mc,
        output,
        harness,
        session,
        options.sessionId,
        modeLabel,
        options.modelPolicyLabel,
        options.effortLabel,
        options.permissionLabel,
        options.permissionSource,
        options.toolPolicyLabel,
        options.outputStyleLabel,
      )
      return 'handled'

    case '/doctor':
      renderDoctor(resolved, output)
      return 'handled'

    case '/config':
      renderConfig(cwd, mc, modeLabel, output)
      return 'handled'

    case '/providers':
      renderProviders(cwd, mc, output)
      return 'handled'

    default:
      return 'not_handled'
  }
}
