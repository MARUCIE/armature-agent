import { execFileSync, type ExecFileSyncOptionsWithStringEncoding } from 'node:child_process'
import { join } from 'node:path'
import { getGlobalConfigPath, listProviders, resolveConfig } from '../config.js'
import { discoverGuidance } from '../agents-discovery.js'
import { discoverAgentSpecs, type AgentSpec } from '../agent-specs.js'
import { listBackgroundJobs } from '../background-jobs.js'
import { loadProjectContext, loadSkills, type SkillInfo } from '../context.js'
import { hooks } from '../hooks.js'
import { mcpClient } from '../mcp-client.js'
import { DELEGATE_TOOLS, READ_ONLY_TOOLS } from '../agent/sub-agent.js'
import { parseCritiqueCheckpoint, type CritiqueCheckpoint } from '../critique.js'
import { inspectWorkspaceCritique, type WorkspaceCritiqueInspection } from '../critique-workspace.js'
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
import { CLAUDE_CODE_KEYBINDINGS } from '../ui/keybindings.js'
import { buildSafeGitSlashArgs, tokenizeCommandLine } from './chat-input.js'
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

interface CritiqueSlashArgs {
  checkpoint: CritiqueCheckpoint
  goal: string
  criticalPath: boolean
  repeatedFailure: boolean
  securityOrData: boolean
  userUncertainty: boolean
  force: boolean
  showPrompt: boolean
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
    lines.push('**Tips**: `!cmd` shell escape · `Tab` auto-complete · `/` command picker · `Ctrl+J` newline · `Ctrl+L` redraw · `Esc Esc` rewind')
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
  console.log(row('!cmd      Shell escape', 'Ctrl+L   Redraw screen'))
  console.log(row('Ctrl+G   External editor', 'Alt+P    Model picker'))
  console.log(row('Tab       Auto-complete', 'Esc Esc  Rewind'))
  console.log(row('/         Command picker', 'Shift+Tab Mode cycle'))
  console.log(reset)
}

function parseCritiqueSlashArgs(arg: string): CritiqueSlashArgs {
  let tokens: string[]
  try {
    tokens = tokenizeCommandLine(arg)
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unterminated quote')) {
      throw new Error('Unterminated quote in /critique command')
    }
    throw error
  }
  const goalParts: string[] = []
  let checkpoint = 'manual'
  let criticalPath = false
  let repeatedFailure = false
  let securityOrData = false
  let userUncertainty = false
  let force = false
  let showPrompt = false

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!
    if (token === '--checkpoint') {
      const value = tokens[index + 1]
      if (!value) throw new Error('Missing value for --checkpoint')
      checkpoint = value
      index += 1
      continue
    }
    if (token.startsWith('--checkpoint=')) {
      checkpoint = token.slice('--checkpoint='.length)
      continue
    }
    if (token === '--critical-path') {
      criticalPath = true
      continue
    }
    if (token === '--repeated-failure') {
      repeatedFailure = true
      continue
    }
    if (token === '--security-or-data') {
      securityOrData = true
      continue
    }
    if (token === '--user-uncertainty') {
      userUncertainty = true
      continue
    }
    if (token === '--force') {
      force = true
      continue
    }
    if (token === '--show-prompt') {
      showPrompt = true
      continue
    }
    if (token.startsWith('--')) throw new Error(`Unsupported /critique option: ${token}`)
    goalParts.push(token)
  }

  return {
    checkpoint: parseCritiqueCheckpoint(checkpoint),
    goal: goalParts.join(' ').trim(),
    criticalPath,
    repeatedFailure,
    securityOrData,
    userUncertainty,
    force,
    showPrompt,
  }
}

function buildCritiqueInspectionBody(inspection: WorkspaceCritiqueInspection): string {
  const fileLines = inspection.changedFiles.length > 0
    ? inspection.changedFiles.slice(0, 20).map((file) => `- ${file}`)
    : ['(none detected)']
  const omitted = inspection.changedFiles.length > 20
    ? [`- ... ${inspection.changedFiles.length - 20} more`]
    : []
  const body = [
    `Checkpoint: \`${inspection.checkpoint}\``,
    `Reviewer: \`${inspection.reviewerModel}\``,
    `Risk: \`${inspection.riskScore}\` (${inspection.decision.reason})`,
    `Decision: ${inspection.decision.shouldRun ? 'review recommended' : 'below live-review threshold'}`,
    '',
    `Changed files: ${inspection.riskSignals.changedFileCount}`,
    `Diff lines: ${inspection.riskSignals.diffLineCount}`,
    '',
    'Files:',
    ...fileLines,
    ...omitted,
  ]
  if (inspection.dryRun.prompt) {
    body.push('', 'Prompt:', '```text', inspection.dryRun.prompt, '```')
  }
  return body.join('\n')
}

function renderCritiqueInspection(
  inspection: WorkspaceCritiqueInspection,
  output: CommandOutput,
  session?: ChatSessionEmitter,
): void {
  if (session) {
    session.emitDetailPanel({
      title: 'Critique Gate',
      subtitle: `${inspection.checkpoint} · risk ${inspection.riskScore}`,
      body: buildCritiqueInspectionBody(inspection),
      tone: inspection.decision.shouldRun ? 'warn' : 'info',
    })
    return
  }

  output.info([
    `critique: ${inspection.checkpoint}`,
    `reviewer: ${inspection.reviewerModel}`,
    `risk: ${inspection.riskScore} (${inspection.decision.reason})`,
    `changed files: ${inspection.riskSignals.changedFileCount}`,
    `diff lines: ${inspection.riskSignals.diffLineCount}`,
    ...inspection.changedFiles.slice(0, 20).map((file) => `- ${file}`),
    ...(inspection.changedFiles.length > 20 ? [`- ... ${inspection.changedFiles.length - 20} more`] : []),
    ...(inspection.dryRun.prompt ? ['', '--- prompt ---', inspection.dryRun.prompt] : []),
  ].join('\n'))
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

function renderKeybindings(output: CommandOutput, session?: ChatSessionEmitter): void {
  const rows = CLAUDE_CODE_KEYBINDINGS
    .map((binding) => ({
      context: binding.context,
      key: binding.key,
      action: binding.action,
      description: binding.description,
    }))

  if (session) {
    const body = [
      '| Context | Key | Action | Description |',
      '| --- | --- | --- | --- |',
      ...rows.map((row) =>
        `| ${escapeMarkdownTableCell(row.context)} | ${formatMarkdownCodeSpan(row.key)} | ${formatMarkdownCodeSpan(row.action)} | ${escapeMarkdownTableCell(row.description)} |`,
      ),
    ].join('\n')
    session.emitDetailPanel({
      title: 'Keybindings',
      subtitle: 'Claude Code default shortcut contract',
      body,
      tone: 'info',
    })
    return
  }

  output.info(rows.map((row) =>
    `${row.context.padEnd(7)}  ${row.key.padEnd(12)}  ${row.action.padEnd(24)}  ${row.description}`,
  ).join('\n'))
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

function renderContext(
  history: ChatMessage[],
  stats: ReadonlySlashSessionStats,
  mc: ReadonlySlashModelControl,
  output: CommandOutput,
  harness?: ReadonlySlashHarness,
  session?: ChatSessionEmitter,
): void {
  const roleCounts = {
    system: history.filter((message) => message.role === 'system').length,
    user: history.filter((message) => message.role === 'user').length,
    assistant: history.filter((message) => message.role === 'assistant').length,
  }
  const roleChars = {
    system: history
      .filter((message) => message.role === 'system')
      .reduce((sum, message) => sum + messageContentToText(message.content).length, 0),
    user: history
      .filter((message) => message.role === 'user')
      .reduce((sum, message) => sum + messageContentToText(message.content).length, 0),
    assistant: history
      .filter((message) => message.role === 'assistant')
      .reduce((sum, message) => sum + messageContentToText(message.content).length, 0),
  }
  const totalChars = roleChars.system + roleChars.user + roleChars.assistant
  const estimatedTokens = Math.ceil(totalChars / 4)
  const budget = harness?.tokenBudget.getBudget(history)
  const contextWindow = budget?.contextWindow || mc.getChoices().find((choice) => choice.model === mc.getModel() && choice.provider === mc.getProvider())?.contextWindow
  const utilizationPct = budget?.utilizationPct ?? (contextWindow ? Math.min(100, Math.round((estimatedTokens / contextWindow) * 100)) : null)
  const totalTokens = stats.totalInputTokens + stats.totalOutputTokens

  if (session) {
    const rows = [
      ['Model', `${mc.getProvider()}/${mc.getModel()}`],
      ['Messages', `${history.length} (${roleCounts.system} system / ${roleCounts.user} user / ${roleCounts.assistant} assistant)`],
      ['Transcript chars', totalChars.toLocaleString()],
      ['Estimated context', budget ? `${budget.historyTokensEst.toLocaleString()} tokens` : `${estimatedTokens.toLocaleString()} tokens`],
      ['Context window', contextWindow ? contextWindow.toLocaleString() : 'unknown'],
      ['Utilization', utilizationPct === null ? 'unknown' : `${Math.round(utilizationPct)}%`],
      ['Actual usage', `${totalTokens.toLocaleString()} tokens (${stats.totalInputTokens.toLocaleString()} in / ${stats.totalOutputTokens.toLocaleString()} out)`],
    ]
    session.emitDetailPanel({
      title: 'Context',
      subtitle: utilizationPct === null ? 'context window unknown' : `${Math.round(utilizationPct)}% of window`,
      body: [
        '| Metric | Value |',
        '| --- | --- |',
        ...rows.map(([label, value]) => `| ${escapeMarkdownTableCell(label)} | ${escapeMarkdownTableCell(value)} |`),
        '',
        'Role character split:',
        `- system: ${roleChars.system.toLocaleString()}`,
        `- user: ${roleChars.user.toLocaleString()}`,
        `- assistant: ${roleChars.assistant.toLocaleString()}`,
      ].join('\n'),
      tone: utilizationPct !== null && utilizationPct >= 85 ? 'warn' : 'info',
    })
    return
  }

  output.info([
    `model:    ${mc.getProvider()}/${mc.getModel()}`,
    `messages: ${history.length} (${roleCounts.system} system / ${roleCounts.user} user / ${roleCounts.assistant} assistant)`,
    `chars:    ${totalChars.toLocaleString()} (system ${roleChars.system.toLocaleString()} / user ${roleChars.user.toLocaleString()} / assistant ${roleChars.assistant.toLocaleString()})`,
    `context:  ${budget ? budget.historyTokensEst.toLocaleString() : estimatedTokens.toLocaleString()} tokens est${contextWindow ? ` / ${contextWindow.toLocaleString()}` : ''}${utilizationPct === null ? '' : ` (${Math.round(utilizationPct)}%)`}`,
    `usage:    ${totalTokens.toLocaleString()} tokens (${stats.totalInputTokens.toLocaleString()} in / ${stats.totalOutputTokens.toLocaleString()} out)`,
  ].join('\n'))
}

function resolveCapabilityName(arg: string): string {
  return arg.trim().split(/\s+/, 1)[0] || ''
}

function renderSkillDetail(skill: SkillInfo, output: CommandOutput, session?: ChatSessionEmitter): void {
  if (session) {
    session.emitDetailPanel({
      title: `Skill: ${skill.name}`,
      subtitle: `${skill.source} · ${skill.path}`,
      body: [
        '| Field | Value |',
        '| --- | --- |',
        `| Name | ${formatMarkdownCodeSpan(skill.name)} |`,
        `| Source | ${escapeMarkdownTableCell(skill.source)} |`,
        `| Description | ${escapeMarkdownTableCell(skill.description)} |`,
        `| Path | ${formatMarkdownCodeSpan(skill.path)} |`,
      ].join('\n'),
      tone: 'info',
    })
    return
  }

  output.info([
    `skill: ${skill.name}`,
    `source: ${skill.source}`,
    `path: ${skill.path}`,
    `description: ${skill.description}`,
  ].join('\n'))
}

function renderSkills(cwd: string, output: CommandOutput, session?: ChatSessionEmitter, arg = ''): void {
  const skills = loadSkills(cwd)
  const requested = resolveCapabilityName(arg)
  if (requested) {
    const skill = skills.find((candidate) => candidate.name === requested)
    if (!skill) {
      output.warn(`skill not found: ${requested}`)
      return
    }
    renderSkillDetail(skill, output, session)
    return
  }

  const bySource = skills.reduce<Record<SkillInfo['source'], number>>((acc, skill) => {
    acc[skill.source] += 1
    return acc
  }, { claude: 0, codex: 0, orca: 0 })
  const visible = skills.slice(0, 40)

  if (session) {
    session.emitDetailPanel({
      title: 'Skills',
      subtitle: `${skills.length} discovered · claude ${bySource.claude} · codex ${bySource.codex} · orca ${bySource.orca}`,
      body: [
        '| Skill | Source | Description |',
        '| --- | --- | --- |',
        ...visible.map((skill) =>
          `| ${formatMarkdownCodeSpan(skill.name)} | ${escapeMarkdownTableCell(skill.source)} | ${escapeMarkdownTableCell(skill.description)} |`,
        ),
        skills.length > visible.length ? `\n... ${skills.length - visible.length} more skills omitted from this view.` : '',
      ].filter(Boolean).join('\n'),
      tone: skills.length === 0 ? 'warn' : 'info',
    })
    return
  }

  if (skills.length === 0) {
    output.warn('no skills found in .claude/skills, .codex/skills, or .orca/skills.')
    return
  }
  output.info([
    `skills: ${skills.length} discovered (claude ${bySource.claude}, codex ${bySource.codex}, orca ${bySource.orca})`,
    ...visible.map((skill) => `${skill.source.padEnd(6)}  ${skill.name.padEnd(28)}  ${skill.description}`),
    skills.length > visible.length ? `... ${skills.length - visible.length} more` : '',
  ].filter(Boolean).join('\n'))
}

function renderMemory(cwd: string, output: CommandOutput, session?: ChatSessionEmitter): void {
  const project = loadProjectContext(cwd)
  const guidance = discoverGuidance(cwd)
  const skills = loadSkills(cwd)
  const guidanceRows = guidance.map((entry) => ({
    source: entry.source,
    depth: entry.depth,
    path: entry.path,
    chars: entry.content.length,
  }))

  if (session) {
    session.emitDetailPanel({
      title: 'Memory',
      subtitle: `${guidance.length} guidance files · ${skills.length} skills · ${project.name}`,
      body: [
        '| Area | Value |',
        '| --- | --- |',
        `| Project | ${escapeMarkdownTableCell(project.name)} |`,
        `| Type | ${escapeMarkdownTableCell(project.type)} |`,
        `| Languages | ${escapeMarkdownTableCell(project.languages.join(', ') || 'unknown')} |`,
        `| Framework | ${escapeMarkdownTableCell(project.framework || 'unknown')} |`,
        `| Tests | ${escapeMarkdownTableCell(project.testRunner || 'unknown')} |`,
        `| Config files | ${escapeMarkdownTableCell(project.configFiles.join(', ') || 'none')} |`,
        `| Guidance files | ${guidance.length} |`,
        `| Skills | ${skills.length} |`,
        '',
        'Guidance sources:',
        guidanceRows.length === 0
          ? '(none)'
          : guidanceRows.map((row) =>
              `- ${row.source} depth ${row.depth}: ${row.path} (${row.chars.toLocaleString()} chars)`,
            ).join('\n'),
      ].join('\n'),
      tone: guidance.length === 0 && skills.length === 0 ? 'warn' : 'info',
    })
    return
  }

  output.info([
    `project: ${project.name} (${project.type})`,
    `languages: ${project.languages.join(', ') || 'unknown'}`,
    `framework: ${project.framework || 'unknown'} · tests: ${project.testRunner || 'unknown'}`,
    `config: ${project.configFiles.join(', ') || 'none'}`,
    `guidance: ${guidance.length}`,
    ...guidanceRows.slice(0, 20).map((row) => `  ${row.source.padEnd(12)} depth ${row.depth}  ${row.path}`),
    `skills: ${skills.length}`,
  ].join('\n'))
}

interface BuiltInAgentSurface {
  name: string
  label: string
  tools: string
  description: string
}

function renderBuiltInAgentDetail(agent: BuiltInAgentSurface, output: CommandOutput, session?: ChatSessionEmitter): void {
  if (session) {
    session.emitDetailPanel({
      title: `Agent: ${agent.name}`,
      subtitle: agent.label,
      body: [
        '| Field | Value |',
        '| --- | --- |',
        `| Name | ${formatMarkdownCodeSpan(agent.name)} |`,
        `| Surface | ${escapeMarkdownTableCell(agent.label)} |`,
        `| Tools | ${escapeMarkdownTableCell(agent.tools)} |`,
        `| Description | ${escapeMarkdownTableCell(agent.description)} |`,
      ].join('\n'),
      tone: 'info',
    })
    return
  }

  output.info([
    `agent: ${agent.name}`,
    `surface: ${agent.label}`,
    `tools: ${agent.tools}`,
    `description: ${agent.description}`,
  ].join('\n'))
}

function renderAgentSpecDetail(spec: AgentSpec, output: CommandOutput, session?: ChatSessionEmitter): void {
  if (session) {
    session.emitDetailPanel({
      title: `Agent: ${spec.name}`,
      subtitle: `${spec.source} · ${spec.path}`,
      body: [
        '| Field | Value |',
        '| --- | --- |',
        `| Name | ${formatMarkdownCodeSpan(spec.name)} |`,
        `| Source | ${escapeMarkdownTableCell(spec.source)} |`,
        `| Description | ${escapeMarkdownTableCell(spec.description)} |`,
        `| Path | ${formatMarkdownCodeSpan(spec.path)} |`,
      ].join('\n'),
      tone: 'info',
    })
    return
  }

  output.info([
    `agent: ${spec.name}`,
    `source: ${spec.source}`,
    `path: ${spec.path}`,
    `description: ${spec.description}`,
  ].join('\n'))
}

function renderAgents(cwd: string, output: CommandOutput, session?: ChatSessionEmitter, arg = ''): void {
  const specs = discoverAgentSpecs(cwd)
  const builtInRows: BuiltInAgentSurface[] = [
    {
      name: 'read-only',
      label: 'read-only sub-agent',
      tools: `${READ_ONLY_TOOLS.length} tools`,
      description: 'Safe codebase exploration and analysis worker.',
    },
    {
      name: 'delegate',
      label: 'delegate sub-agent',
      tools: `${DELEGATE_TOOLS.length} tools`,
      description: 'Implementation-capable worker with write and command tools.',
    },
  ]
  const requested = resolveCapabilityName(arg)
  if (requested) {
    const builtIn = builtInRows.find((agent) => agent.name === requested || agent.label === requested)
    if (builtIn) {
      renderBuiltInAgentDetail(builtIn, output, session)
      return
    }
    const spec = specs.find((candidate) => candidate.name === requested)
    if (!spec) {
      output.warn(`agent not found: ${requested}`)
      return
    }
    renderAgentSpecDetail(spec, output, session)
    return
  }

  if (session) {
    session.emitDetailPanel({
      title: 'Agents',
      subtitle: `${builtInRows.length} built-in surfaces · ${specs.length} custom specs`,
      body: [
        'Built-in surfaces:',
        '',
        '| Agent | Surface | Tools | Description |',
        '| --- | --- | --- | --- |',
        ...builtInRows.map((agent) =>
          `| ${formatMarkdownCodeSpan(agent.name)} | ${escapeMarkdownTableCell(agent.label)} | ${escapeMarkdownTableCell(agent.tools)} | ${escapeMarkdownTableCell(agent.description)} |`,
        ),
        '',
        'Custom specs:',
        '',
        specs.length === 0
          ? '(none found in `.claude/agents`, `.codex/agents`, or `.orca/agents`)'
          : [
              '| Agent | Source | Description | Path |',
              '| --- | --- | --- | --- |',
              ...specs.slice(0, 40).map((spec) =>
                `| ${formatMarkdownCodeSpan(spec.name)} | ${escapeMarkdownTableCell(spec.source)} | ${escapeMarkdownTableCell(spec.description)} | ${formatMarkdownCodeSpan(spec.path)} |`,
              ),
            ].join('\n'),
      ].join('\n'),
      tone: 'info',
    })
    return
  }

  output.info([
    `built-in agents: ${builtInRows.length}`,
    ...builtInRows.map((agent) => `  ${agent.name.padEnd(22)} ${agent.tools.padEnd(8)} ${agent.description}`),
    `custom agents: ${specs.length}`,
    ...specs.slice(0, 40).map((spec) => `  ${spec.source.padEnd(6)} ${spec.name.padEnd(28)} ${spec.description}`),
  ].join('\n'))
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

    case '/context':
      renderContext(history, stats, mc, output, harness, session)
      return 'handled'

    case '/memory':
      renderMemory(cwd, output, session)
      return 'handled'

    case '/skills':
      renderSkills(cwd, output, session, arg)
      return 'handled'

    case '/cwd':
      console.log(`\x1b[90m  ${cwd}\x1b[0m`)
      return 'handled'

    case '/diff':
      renderDiff(cwd, output, session)
      return 'handled'

    case '/critique': {
      try {
        const parsed = parseCritiqueSlashArgs(arg)
        const inspection = inspectWorkspaceCritique({
          cwd,
          checkpoint: parsed.checkpoint,
          userGoal: parsed.goal || 'Review the current working tree before continuing.',
          activeModel: mc.getModel(),
          criticalPath: parsed.criticalPath,
          repeatedFailure: parsed.repeatedFailure,
          securityOrData: parsed.securityOrData,
          userUncertainty: parsed.userUncertainty,
          force: parsed.force,
          showPrompt: parsed.showPrompt,
        })
        renderCritiqueInspection(inspection, output, session)
      } catch (error) {
        output.error(error instanceof Error ? error.message : String(error))
      }
      return 'handled'
    }

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

    case '/agents':
      renderAgents(cwd, output, session, arg)
      return 'handled'

    case '/keybindings':
      renderKeybindings(output, session)
      return 'handled'

    case '/providers':
      renderProviders(cwd, mc, output)
      return 'handled'

    default:
      return 'not_handled'
  }
}
