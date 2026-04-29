import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { getGlobalConfigPath, listProviders, resolveConfig } from '../config.js'
import { listBackgroundJobs } from '../background-jobs.js'
import { hooks } from '../hooks.js'
import { mcpClient } from '../mcp-client.js'
import { formatContextWindow, formatPricing, getPricingForModel, type ModelChoice } from '../model-catalog.js'
import { messageContentToText, type ChatMessage } from '../providers/openai-compat.js'
import { listSessionFiles, loadSessionFile } from '../session-store.js'
import { TOOL_DEFINITIONS } from '../tools.js'
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
  modeLabel?: string
}

function formatSlashHelpEntry(command: SlashCommandDefinition): string {
  return `${command.name.padEnd(12)} ${command.description}`
}

function formatMarkdownSlashHelpEntry(command: SlashCommandDefinition): string {
  return '`' + command.name + '` ' + command.description
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


function renderModelInfo(arg: string, mc: ReadonlySlashModelControl): ReadonlySlashCommandResult {
  if (arg.startsWith('set ') || arg.startsWith('use ')) {
    return 'not_handled'
  }

  const current = mc.getChoices().find((choice) => choice.model === mc.getModel())
  console.log(`\x1b[90m  provider: ${mc.getProvider()}  model: \x1b[36m${mc.getModel()}\x1b[0m`)
  if (current) {
    console.log(`\x1b[90m  context: ${formatContextWindow(current.contextWindow)}  max out: ${formatContextWindow(current.maxOutput)}  pricing: ${formatPricing(current.pricing)} per 1M in/out\x1b[0m`)
    if (current.note) console.log(`\x1b[33m  caution: ${current.note}\x1b[0m`)
  }
  return 'handled'
}

function renderModels(mc: ReadonlySlashModelControl): ReadonlySlashCommandResult {
  console.log('\x1b[90m  Available models:\x1b[0m')
  for (const [index, choice] of mc.getChoices().entries()) {
    const model = choice.model
    const current = model === mc.getModel()
    const idx = `${index + 1}`.padStart(2)
    const marker = current ? '\x1b[36m' : '\x1b[90m'
    const arrow = current ? ' →' : '  '
    console.log(`${marker}  ${idx}.${arrow} ${model}\x1b[0m`)
    console.log(`\x1b[90m      ${choice.provider} · ${formatContextWindow(choice.contextWindow)} ctx · ${formatPricing(choice.pricing)} per 1M in/out${choice.agentic === 'caution' ? ' · caution' : ''}\x1b[0m`)
  }
  console.log(`\x1b[90m  Enter number (1-${mc.getChoices().length}):\x1b[0m`)
  return 'pick_model'
}

function renderDiff(cwd: string, session?: ChatSessionEmitter): void {
  try {
    const stat = execFileSync('git', ['diff', '--stat'], {
      cwd,
      encoding: 'utf-8',
      timeout: 10_000,
      maxBuffer: 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
    const patch = execFileSync('git', ['diff', '--no-color'], {
      cwd,
      encoding: 'utf-8',
      timeout: 10_000,
      maxBuffer: 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
    const diff = [stat, patch].filter(Boolean).join('\n---\n')
    if (diff.trim()) {
      if (session) {
        session.emitText(`\`\`\`diff\n${diff.slice(0, 4000)}\n\`\`\`\n`)
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

function renderGit(arg: string, cwd: string): void {
  if (!arg) {
    console.log('\x1b[33m  usage: /git <command>  (e.g., /git status, /git log --oneline -5)\x1b[0m')
    return
  }

  try {
    const gitArgs = buildSafeGitSlashArgs(arg)
    const output = execFileSync('git', gitArgs, {
      cwd,
      encoding: 'utf-8',
      timeout: 10_000,
      maxBuffer: 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    console.log(`\x1b[90m${output.slice(0, 3000)}\x1b[0m`)
    if (output.length > 3000) console.log('\x1b[90m  ... (truncated)\x1b[0m')
  } catch (error) {
    const execError = error as { stdout?: string; stderr?: string; message: string }
    console.log(`\x1b[31m  ${(execError.stderr || execError.stdout || execError.message).slice(0, 500)}\x1b[0m`)
  }
}

function renderSessions(): void {
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

function renderJobs(): void {
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

function renderCost(stats: ReadonlySlashSessionStats, mc: ReadonlySlashModelControl, session?: ChatSessionEmitter): void {
  const pricing = getPricingForModel(mc.getModel())
  const cost = pricing
    ? (stats.totalInputTokens * pricing[0] + stats.totalOutputTokens * pricing[1]) / 1_000_000
    : 0
  const costDisplay = cost >= 0.01 ? `$${cost.toFixed(2)}` : cost > 0 ? `${(cost * 100).toFixed(1)}c` : '$0'

  if (session) {
    const pricingLabel = pricing ? `$${pricing[0]}/$${pricing[1]} per 1M` : 'n/a'
    session.emitText([
      `**Cost** — ${mc.getModel()} (${pricingLabel})`,
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
  harness?: ReadonlySlashHarness,
  session?: ChatSessionEmitter,
  modeLabel: string = 'default',
): void {
  const messages = history.filter((message) => message.role !== 'system').length
  const budget = harness?.tokenBudget.getBudget(history)
  const contextLine = budget
    ? `${budget.utilizationPct}% (${budget.historyTokensEst.toLocaleString()} / ${budget.contextWindow.toLocaleString()} tokens)`
    : `~${Math.ceil(history.reduce((sum, message) => sum + messageContentToText(message.content).length, 0) / 4).toLocaleString()} tokens (est)`

  if (session) {
    session.emitText([
      `**Status** — ${mc.getProvider()}/${mc.getModel()}`,
      '| | |',
      '|---|---|',
      `| Turns | ${stats.turns} |`,
      `| Messages | ${messages} |`,
      `| Context | ${contextLine} |`,
      `| Consumed | ${(stats.totalInputTokens + stats.totalOutputTokens).toLocaleString()} tokens |`,
      `| Mode | ${modeLabel} |`,
      `| cwd | \`${cwd}\` |`,
      `| Hooks | ${hooks.totalHooks} |`,
      `| MCP | ${mcpClient.configuredCount} servers |`,
    ].join('\n') + '\n')
    return
  }

  console.log('\x1b[90m  Session status:\x1b[0m')
  console.log(`\x1b[90m    provider: \x1b[36m${mc.getProvider()}/${mc.getModel()}\x1b[0m`)
  console.log(`\x1b[90m    turns:    ${stats.turns}\x1b[0m`)
  console.log(`\x1b[90m    messages: ${messages}\x1b[0m`)
  console.log(`\x1b[90m    context:  ${contextLine}\x1b[0m`)
  console.log(`\x1b[90m    consumed: ${(stats.totalInputTokens + stats.totalOutputTokens).toLocaleString()} tokens (cumulative)\x1b[0m`)
  console.log(`\x1b[90m    mode:     ${modeLabel}\x1b[0m`)
  console.log(`\x1b[90m    cwd:      ${cwd}\x1b[0m`)
  console.log(`\x1b[90m    hooks:    ${hooks.totalHooks}\x1b[0m`)
  console.log(`\x1b[90m    mcp:      ${mcpClient.configuredCount} servers\x1b[0m`)
}

function renderDoctor(resolved: ReadonlySlashResolvedProvider): void {
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

function renderConfig(cwd: string, mc: ReadonlySlashModelControl, modeLabel: string): void {
  console.log('\x1b[90m  Config files:\x1b[0m')
  console.log(`\x1b[90m    global: ${getGlobalConfigPath()}\x1b[0m`)
  console.log(`\x1b[90m    project: ${join(cwd, '.orca.json')}\x1b[0m`)
  console.log('\x1b[90m  Current:\x1b[0m')
  console.log(`\x1b[90m    provider: ${mc.getProvider()}\x1b[0m`)
  console.log(`\x1b[90m    model:    ${mc.getModel()}\x1b[0m`)
  console.log(`\x1b[90m    mode:     ${modeLabel}\x1b[0m`)
  console.log('\x1b[90m  Edit: orca init (project) or ~/.orca/config.json (global)\x1b[0m')
}

function renderProviders(cwd: string, mc: ReadonlySlashModelControl): void {
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

  switch (cmd) {
    case '/help':
    case '/h':
    case '/?':
      renderHelp(session)
      return 'handled'

    case '/model':
    case '/m':
      return renderModelInfo(arg, mc)

    case '/models':
      return renderModels(mc)

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
      console.log('\x1b[90m')
      console.log(`  input:  ${stats.totalInputTokens.toLocaleString()} tokens`)
      console.log(`  output: ${stats.totalOutputTokens.toLocaleString()} tokens`)
      console.log(`  total:  ${totalTokens.toLocaleString()} tokens`)
      console.log('\x1b[0m')
      return 'handled'
    }

    case '/stats': {
      const elapsed = ((Date.now() - stats.startTime) / 1000).toFixed(0)
      const totalTokens = stats.totalInputTokens + stats.totalOutputTokens
      const historyChars = history.reduce((sum, message) => sum + messageContentToText(message.content).length, 0)
      console.log('\x1b[90m')
      console.log(`  model:    ${mc.getModel()}`)
      console.log(`  turns:    ${stats.turns}`)
      console.log(`  tokens:   ${totalTokens.toLocaleString()} (in: ${stats.totalInputTokens.toLocaleString()} / out: ${stats.totalOutputTokens.toLocaleString()})`)
      console.log(`  context:  ${historyChars.toLocaleString()} chars in ${history.length} messages`)
      console.log(`  duration: ${elapsed}s`)
      console.log('\x1b[0m')
      return 'handled'
    }

    case '/cwd':
      console.log(`\x1b[90m  ${cwd}\x1b[0m`)
      return 'handled'

    case '/diff':
      renderDiff(cwd, session)
      return 'handled'

    case '/git':
      renderGit(arg, cwd)
      return 'handled'

    case '/sessions':
      renderSessions()
      return 'handled'

    case '/jobs':
      renderJobs()
      return 'handled'

    case '/cost':
      renderCost(stats, mc, session)
      return 'handled'

    case '/status':
      renderStatus(history, stats, cwd, mc, harness, session, modeLabel)
      return 'handled'

    case '/doctor':
      renderDoctor(resolved)
      return 'handled'

    case '/config':
      renderConfig(cwd, mc, modeLabel)
      return 'handled'

    case '/providers':
      renderProviders(cwd, mc)
      return 'handled'

    default:
      return 'not_handled'
  }
}
