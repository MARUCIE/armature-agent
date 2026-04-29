import { execSync } from 'node:child_process'
import { mkdirSync as fsMkdirSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import {
  detectPermissionModeSource,
  initProjectConfig,
  inspectPermissionRule,
  normalizeStoredPermissionRules,
  readStoredPermissionAllowlist,
  readStoredPermissionMode,
  replPermissionModeFromConfig,
  summarizePermissionRules,
  type PermissionModeSource,
} from '../config.js'
import { hooks } from '../hooks.js'
import { PostmortemLog, NotesManager, PromptRepository, LearningJournal } from '../knowledge/index.js'
import { logInfo, logWarning } from '../logger.js'
import { findModelChoice, getAgenticWarning, type ModelChoice } from '../model-catalog.js'
import { mcpClient } from '../mcp-client.js'
import type { ModeRegistry } from '../modes/index.js'
import { messageContentToText } from '../providers/openai-compat.js'
import type { ChatMessage } from '../providers/openai-compat.js'
import { getLatestSavedSession, getSavedSessionById, listSavedSessions, writeSavedSession } from '../session-store.js'
import { buildPendingContinueRestore } from './chat-resume-state.js'
import { resetConversationState } from './chat-session-state.js'
import type { TokenBudgetManager } from '../token-budget.js'
import type { ContextMonitor } from '../harness/index.js'
import type { ThreadManager } from '../memory/threads.js'
import { createCommandConsole, createCommandOutput } from '../ui/command-output.js'
import type { ChatSessionEmitter } from '../ui/session.js'

type ModelSelectionTarget = string | Pick<ModelChoice, 'model' | 'provider'>

export type AsyncSlashCommand = 'council' | 'race' | 'pipeline' | 'mission' | 'plan'
export type MutatingSlashCommandResult = 'exit' | 'handled' | 'not_command' | AsyncSlashCommand

interface ModelControl {
  getModel: () => string
  setModel: (target: ModelSelectionTarget) => boolean
  getProvider: () => string
  getChoices: () => ModelChoice[]
}

interface UndoState {
  lastWrite: { path: string; oldContent: string | null } | null
}

interface SessionStatsLike {
  turns: number
  totalInputTokens: number
  totalOutputTokens: number
  startTime?: number
  turnTokens?: number[]
}

export interface MutatingSlashCommandOptions {
  cmd: string
  arg: string
  history: ChatMessage[]
  stats: SessionStatsLike
  cwd: string
  mc: ModelControl
  undo?: UndoState
  harness?: { tokenBudget: TokenBudgetManager; contextMonitor: ContextMonitor }
  onSessionReset?: () => void
  modeRegistry?: Pick<ModeRegistry, 'getActive' | 'switchTo'>
  threadManager?: ThreadManager
  session?: ChatSessionEmitter
  getPermissionMode?: () => 'yolo' | 'auto' | 'plan'
  getPermissionSource?: () => PermissionModeSource
  getPermissionRules?: (scope: 'session' | 'project' | 'global') => string[]
  removePermissionRule?: (scope: 'session' | 'project' | 'global', ruleKey: string) => boolean
  clearPermissionRules?: (scope: 'session' | 'project' | 'global') => number
  normalizePermissionRules?: (scope: 'project' | 'global') => { changedCount: number; unresolvedCount: number; total: number }
  setPermissionMode?: (mode: 'yolo' | 'auto' | 'plan') => void
  persistPermissionMode?: (mode: 'yolo' | 'auto' | 'plan', scope: 'project' | 'global') => string
}

function buildPermissionDetailBody(
  cwd: string,
  currentMode: 'yolo' | 'auto' | 'plan',
  currentSource: PermissionModeSource,
  sessionRules: string[],
): string {
  const projectMode = readStoredPermissionMode('project', cwd)
  const globalMode = readStoredPermissionMode('global', cwd)
  const projectRules = summarizePermissionRules(readStoredPermissionAllowlist('project', cwd), cwd, 'project')
  const globalRules = summarizePermissionRules(readStoredPermissionAllowlist('global', cwd), cwd, 'global')

  return [
    `Current mode: \`${currentMode}\``,
    `Source: \`${currentSource}\``,
    '',
    'Persisted config:',
    `- project: ${projectMode ? `\`${replPermissionModeFromConfig(projectMode)}\`` : '(unset)'}`,
    `- global: ${globalMode ? `\`${replPermissionModeFromConfig(globalMode)}\`` : '(unset)'}`,
    '',
    'Stored rules:',
    `- session: ${sessionRules.length}`,
    `- project: ${projectRules.total} (legacy ${projectRules.normalized + projectRules.unrecognized})`,
    `- global: ${globalRules.total} (legacy ${globalRules.normalized + globalRules.unrecognized})`,
    '',
    'Modes:',
    '- `yolo` — no approval prompts',
    '- `auto` — prompt on dangerous tools only',
    '- `plan` — prompt on every tool call',
  ].join('\n')
}

function buildPermissionRulesBody(scope: 'session' | 'project' | 'global', rules: string[]): string {
  return buildPermissionRulesBodyForStatus(scope, rules, 'all')
}

type PermissionRuleViewStatus = 'all' | 'canonical' | 'legacy' | 'unrecognized'

function normalizePermissionRuleViewStatus(value?: string): PermissionRuleViewStatus {
  if (value === 'canonical' || value === 'legacy' || value === 'unrecognized') return value
  return 'all'
}

function filterPermissionRulesByStatus(rules: string[], status: PermissionRuleViewStatus): string[] {
  if (status === 'all') return rules
  return rules.filter((rule) => {
    const inspected = inspectPermissionRule(rule)
    if (status === 'legacy') return inspected.status === 'normalized'
    return inspected.status === status
  })
}

function buildPermissionRulesBodyForStatus(
  scope: 'session' | 'project' | 'global',
  rules: string[],
  status: PermissionRuleViewStatus,
): string {
  const filteredRules = filterPermissionRulesByStatus(rules, status)
  if (filteredRules.length === 0) {
    return `No ${scope} permission rules are stored.`
  }
  const renderedRules = filteredRules.flatMap((rule) => {
    const inspected = inspectPermissionRule(rule)
    if (inspected.status === 'canonical') {
      return [`[canonical] ${rule}`]
    }
    if (inspected.status === 'normalized') {
      return [`[legacy] ${rule}`, `-> ${inspected.normalized}`]
    }
    return [`[unrecognized] ${rule}`]
  })
  return [
    `Stored ${scope} permission rules: ${filteredRules.length}${status === 'all' ? '' : ` (${status})`}`,
    '',
    '```text',
    ...renderedRules,
    '```',
  ].join('\n')
}

function renderPermissionRulesConsole(
  scope: 'session' | 'project' | 'global',
  rules: string[],
  console: Pick<Console, 'log' | 'error'>,
  status: PermissionRuleViewStatus = 'all',
): void {
  const filteredRules = filterPermissionRulesByStatus(rules, status)
  console.log(`\x1b[90m  ${scope} rules: ${filteredRules.length}${status === 'all' ? '' : ` (${status})`}\x1b[0m`)
  if (filteredRules.length === 0) {
    console.log('\x1b[90m  no stored rules.\x1b[0m')
    return
  }
  for (const rule of filteredRules) {
    const inspected = inspectPermissionRule(rule)
    if (inspected.status === 'canonical') {
      console.log(`\x1b[90m    - [canonical] ${rule}\x1b[0m`)
      continue
    }
    if (inspected.status === 'normalized') {
      console.log(`\x1b[33m    - [legacy] ${rule}\x1b[0m`)
      console.log(`\x1b[90m      -> ${inspected.normalized}\x1b[0m`)
      continue
    }
    console.log(`\x1b[31m    - [unrecognized] ${rule}\x1b[0m`)
  }
}

function buildPermissionRuleOptions(rules: string[]): Array<{ value: string; label: string; description?: string }> {
  return rules.map((rule) => ({
    value: rule,
    label: rule.length > 96 ? `${rule.slice(0, 93)}...` : rule,
    description: rule.length > 96 ? rule : undefined,
  }))
}

function launchPermissionRuleRevokePicker(
  session: ChatSessionEmitter,
  scope: 'session' | 'project' | 'global',
  rules: string[],
  removePermissionRule: ((scope: 'session' | 'project' | 'global', ruleKey: string) => boolean) | undefined,
): void {
  if (rules.length === 0) {
    session.emitSystemMessage(`no ${scope} permission rules to revoke.`, 'warn')
    return
  }

  void session.emitOptionPicker({
    title: `Revoke ${scope} rule`,
    subtitle: 'Select one rule to remove',
    options: buildPermissionRuleOptions(rules),
    filterable: true,
    filterPlaceholder: 'filter rules',
  }).then((picked) => {
    if (!picked) return
    const removed = removePermissionRule?.(scope, picked) || false
    if (!removed) {
      session.emitSystemMessage(`no ${scope} rule matched.`, 'warn')
      return
    }
    session.emitSystemMessage(`removed ${scope} rule.`, 'info')
  })
}

function launchPermissionPicker(
  session: ChatSessionEmitter,
  cwd: string,
  getPermissionMode: (() => 'yolo' | 'auto' | 'plan') | undefined,
  getPermissionSource: (() => PermissionModeSource) | undefined,
  getPermissionRules: ((scope: 'session' | 'project' | 'global') => string[]) | undefined,
  removePermissionRule: ((scope: 'session' | 'project' | 'global', ruleKey: string) => boolean) | undefined,
  clearPermissionRules: ((scope: 'session' | 'project' | 'global') => number) | undefined,
  normalizePermissionRules: ((scope: 'project' | 'global') => { changedCount: number; unresolvedCount: number; total: number }) | undefined,
  setPermissionMode: ((mode: 'yolo' | 'auto' | 'plan') => void) | undefined,
  persistPermissionMode: ((mode: 'yolo' | 'auto' | 'plan', scope: 'project' | 'global') => string) | undefined,
): void {
  const currentMode = getPermissionMode?.() || 'yolo'
  const currentSource = getPermissionSource?.() || detectPermissionModeSource(cwd)
  const sessionRules = getPermissionRules?.('session') || []
  const projectRules = getPermissionRules?.('project') || readStoredPermissionAllowlist('project', cwd)
  const globalRules = getPermissionRules?.('global') || readStoredPermissionAllowlist('global', cwd)

  session.emitDetailPanel({
    title: 'Permissions',
    subtitle: `current ${currentMode} · source ${currentSource}`,
    body: buildPermissionDetailBody(cwd, currentMode, currentSource, sessionRules),
    tone: 'info',
  })

  void session.emitOptionPicker({
    title: 'Permission mode',
    subtitle: 'Switch the live mode or persist the current policy',
    options: [
      { value: 'mode:yolo', label: 'Switch to yolo', description: 'No approval prompts' },
      { value: 'mode:auto', label: 'Switch to auto', description: 'Prompt on dangerous tools only' },
      { value: 'mode:plan', label: 'Switch to plan', description: 'Prompt on every tool call' },
      { value: 'save:project', label: `Save ${currentMode} to project`, description: `${projectRules.length} stored project rules` },
      { value: 'save:global', label: `Save ${currentMode} to global`, description: `${globalRules.length} stored global rules` },
      { value: 'rules:session', label: 'Inspect session rules', description: `${sessionRules.length} in-memory approvals` },
      { value: 'rules:project', label: 'Inspect project rules', description: `${projectRules.length} persisted project approvals` },
      { value: 'rules:global', label: 'Inspect global rules', description: `${globalRules.length} persisted global approvals` },
      { value: 'revoke:session', label: 'Revoke one session rule', description: `${sessionRules.length} in-memory approvals` },
      { value: 'revoke:project', label: 'Revoke one project rule', description: `${projectRules.length} persisted project approvals` },
      { value: 'revoke:global', label: 'Revoke one global rule', description: `${globalRules.length} persisted global approvals` },
      { value: 'clear:session', label: 'Clear session rules', description: `${sessionRules.length} in-memory approvals` },
      { value: 'clear:project', label: 'Clear project rules', description: `${projectRules.length} persisted project approvals` },
      { value: 'clear:global', label: 'Clear global rules', description: `${globalRules.length} persisted global approvals` },
      { value: 'normalize:project', label: 'Normalize project rules', description: `${summarizePermissionRules(projectRules).normalized + summarizePermissionRules(projectRules).unrecognized} legacy project rules` },
      { value: 'normalize:global', label: 'Normalize global rules', description: `${summarizePermissionRules(globalRules).normalized + summarizePermissionRules(globalRules).unrecognized} legacy global rules` },
    ],
  }).then((picked) => {
    if (!picked) return

    if (picked.startsWith('mode:')) {
      const mode = picked.slice(5) as 'yolo' | 'auto' | 'plan'
      const before = getPermissionMode?.() || currentMode
      if (before === mode) {
        session.emitSystemMessage(`permissions already ${mode}`, 'info')
        return
      }
      setPermissionMode?.(mode)
      session.emitSystemMessage(`permissions: ${before} → ${mode}`, 'info')
      return
    }

    if (picked.startsWith('save:')) {
      const scope = picked.slice(5) === 'global' ? 'global' : 'project'
      const mode = getPermissionMode?.() || currentMode
      const path = persistPermissionMode?.(mode, scope)
      if (!path) {
        session.emitSystemMessage('permission persistence unavailable.', 'error')
        return
      }
      session.emitSystemMessage(`saved permissions: ${mode} (${scope})`, 'info')
      session.emitSystemMessage(`config: ${path}`, 'info')
      return
    }

    if (picked.startsWith('rules:')) {
      const scope = picked.slice(6) as 'session' | 'project' | 'global'
      const rules = scope === 'session'
        ? sessionRules
        : scope === 'project'
          ? projectRules
          : globalRules
      session.emitDetailPanel({
        title: `${scope[0]!.toUpperCase()}${scope.slice(1)} Permission Rules`,
        subtitle: `${rules.length} stored rule${rules.length === 1 ? '' : 's'}`,
        body: buildPermissionRulesBody(scope, rules),
        tone: rules.length === 0 ? 'warn' : 'info',
      })
      return
    }

    if (picked.startsWith('revoke:')) {
      const scope = picked.slice(7) as 'session' | 'project' | 'global'
      const rules = scope === 'session'
        ? sessionRules
        : scope === 'project'
          ? projectRules
          : globalRules
      launchPermissionRuleRevokePicker(session, scope, rules, removePermissionRule)
      return
    }

    if (picked.startsWith('clear:')) {
      const scope = picked.slice(6) as 'session' | 'project' | 'global'
      const removed = clearPermissionRules?.(scope) ?? 0
      session.emitSystemMessage(`cleared ${removed} ${scope} permission rule(s)`, 'info')
      return
    }

    if (picked.startsWith('normalize:')) {
      const scope = picked.slice(10) as 'project' | 'global'
      const result = normalizePermissionRules?.(scope)
      if (!result) {
        session.emitSystemMessage('permission normalization unavailable.', 'error')
        return
      }
      session.emitSystemMessage(`normalized ${scope}: ${result.changedCount} changed, ${result.unresolvedCount} unresolved, ${result.total} total`, 'info')
    }
  })
}

export function handleMutatingSlashCommand(options: MutatingSlashCommandOptions): MutatingSlashCommandResult {
  const { cmd, arg, history, stats, cwd, mc, undo, harness, onSessionReset, modeRegistry, threadManager, session, getPermissionMode, getPermissionSource, getPermissionRules, removePermissionRule, clearPermissionRules, normalizePermissionRules, setPermissionMode, persistPermissionMode } = options
  const output = createCommandOutput(session)
  const console = createCommandConsole(output)

  switch (cmd) {
      case '/exit':
      case '/quit':
      case '/q':
        return 'exit'

      case '/model':
      case '/m': {
        const newModel = arg.replace(/^(set|use)\s+/, '').trim()
        if (!newModel) {
          console.log('\x1b[33m  usage: /model set <name>  (e.g., /model set GPT-4o)\x1b[0m')
          return 'handled'
        }
        const oldModel = mc.getModel()
        const target = findModelChoice(mc.getChoices(), newModel, mc.getProvider()) || newModel
        if (!mc.setModel(target)) return 'handled'
        console.log(`\x1b[90m  model: ${oldModel} → \x1b[36m${newModel}\x1b[0m \x1b[90m(${mc.getProvider()})\x1b[0m`)
        const warning = getAgenticWarning(newModel)
        if (warning) console.log(`\x1b[33m  caution: ${warning}\x1b[0m`)
        logInfo('model switched via command', { from: oldModel, to: newModel, provider: mc.getProvider() })
        if (warning) logWarning('model caution', { model: newModel, provider: mc.getProvider(), warning })
        return 'handled'
      }

    case '/clear': {
      resetConversationState(history, stats, harness)
      if (session) {
        session.emitClear()
      } else {
        process.stdout.write('\x1b[2J\x1b[H')
      }
      onSessionReset?.()
      if (session) {
        session.emitSystemMessage('conversation cleared.', 'info')
      } else {
        console.log('\x1b[90m  conversation cleared.\x1b[0m')
      }
      return 'handled'
    }

    case '/compact': {
      hooks.run('PreCompact', { event: 'PreCompact', cwd })
      if (harness?.tokenBudget) {
        const result = harness.tokenBudget.smartCompact(history)
        console.log(`\x1b[90m  ${result.summary}\x1b[0m`)
        if (result.dropped > 0 || result.tokensFreed > 0) {
          harness.tokenBudget.clearCurrentUsage()
          harness.contextMonitor.clearCurrentUsage()
        }
      } else {
        const sysMsg = history.find((message) => message.role === 'system')
        const convMsgs = history.filter((message) => message.role !== 'system')
        if (convMsgs.length <= 4) {
          console.log(`\x1b[90m  nothing to compact (${convMsgs.length} messages).\x1b[0m`)
        } else {
          const keep = convMsgs.slice(-4)
          const dropped = convMsgs.length - keep.length
          history.length = 0
          if (sysMsg) history.push(sysMsg)
          history.push(...keep)
          console.log(`\x1b[90m  compacted: kept last 2 turns, dropped ${dropped} messages.\x1b[0m`)
        }
      }
      hooks.run('PostCompact', { event: 'PostCompact', cwd })
      return 'handled'
    }

    case '/system':
      if (!arg) {
        const current = history.find((message) => message.role === 'system')
        if (current) {
          const currentText = messageContentToText(current.content)
          console.log(`\x1b[90m  system: ${currentText.slice(0, 120)}${currentText.length > 120 ? '...' : ''}\x1b[0m`)
        } else {
          console.log('\x1b[90m  no system prompt set. Usage: /system <prompt>\x1b[0m')
        }
        return 'handled'
      }
      {
        const existingIdx = history.findIndex((message) => message.role === 'system')
        if (existingIdx >= 0) {
          history[existingIdx] = { role: 'system', content: arg }
        } else {
          history.unshift({ role: 'system', content: arg })
        }
        console.log(`\x1b[90m  system prompt updated (${arg.length} chars).\x1b[0m`)
      }
      return 'handled'

    case '/hooks':
      {
        const summary = hooks.getStatusSummary()
        if (summary) {
          output.info(`hooks: ${summary.totalHooks} across ${summary.eventCount} events`)
        }
      }
      return 'handled'

    case '/council':
      if (!arg) {
        console.log('\x1b[33m  usage: /council <prompt>  (asks 3 diverse models + judge)\x1b[0m')
        return 'handled'
      }
      return 'council'

    case '/race':
      if (!arg) {
        console.log('\x1b[33m  usage: /race <prompt>  (first model to answer wins)\x1b[0m')
        return 'handled'
      }
      return 'race'

    case '/pipeline':
      if (!arg) {
        console.log('\x1b[33m  usage: /pipeline <prompt>  (plan→code→review chain)\x1b[0m')
        return 'handled'
      }
      return 'pipeline'

    case '/mission':
      if (!arg) {
        console.log('\x1b[33m  usage: /mission <goal>  (multi-step autonomous task execution)\x1b[0m')
        console.log('\x1b[90m  Droid-style: plan → decompose → implement → validate → iterate\x1b[0m')
        return 'handled'
      }
      return 'mission'

    case '/plan':
      if (!arg) {
        console.log('\x1b[33m  usage: /plan <tasks>  (decompose prompt into task checklist)\x1b[0m')
        console.log('\x1b[90m  Auto-splits into main (sequential) + side (concurrent) tasks\x1b[0m')
        return 'handled'
      }
      return 'plan'

    case '/reflect':
      if (!arg) {
        console.log('\x1b[33m  usage: /reflect <question|symptom>  (Socratic debugging and root-cause investigation)\x1b[0m')
        console.log('\x1b[90m  Tip: use /mode reflect for a persistent reflect session.\x1b[0m')
        return 'handled'
      }
      return 'not_command'

    case '/permissions': {
      const [subcmdRaw = '', ...rest] = arg.split(/\s+/).filter(Boolean)
      const subcmd = subcmdRaw.toLowerCase()
      const current = getPermissionMode?.() || 'yolo'
      if (!subcmd || subcmd === 'show') {
        if (session) {
          launchPermissionPicker(session, cwd, getPermissionMode, getPermissionSource, getPermissionRules, removePermissionRule, clearPermissionRules, normalizePermissionRules, setPermissionMode, persistPermissionMode)
          return 'handled'
        }
        console.log(`\x1b[90m  permissions: ${current}\x1b[0m`)
        console.log('\x1b[90m  modes: yolo (no approvals), auto (dangerous tools only), plan (every tool)\x1b[0m')
        console.log('\x1b[90m  commands: /permissions set <mode> | /permissions save [mode] [project|global] | /permissions rules [session|project|global] | /permissions revoke <scope> [rule] | /permissions clear [scope] | /permissions normalize [project|global|all]\x1b[0m')
        return 'handled'
      }
      if (subcmd === 'rules' || subcmd === 'list') {
        const scopeRaw = (rest[0] || 'session').toLowerCase()
        const statusRaw = rest.length > 1
          ? rest[1]?.toLowerCase()
          : scopeRaw === 'canonical' || scopeRaw === 'legacy' || scopeRaw === 'unrecognized'
            ? scopeRaw
            : 'all'
        const normalizedScope = scopeRaw === 'project' || scopeRaw === 'global' ? scopeRaw : 'session'
        const status = normalizePermissionRuleViewStatus(statusRaw)
        const rules = getPermissionRules?.(normalizedScope) || []
        if (session) {
          session.emitDetailPanel({
            title: `${normalizedScope[0]!.toUpperCase()}${normalizedScope.slice(1)} Permission Rules`,
            subtitle: `${filterPermissionRulesByStatus(rules, status).length} stored rule${filterPermissionRulesByStatus(rules, status).length === 1 ? '' : 's'}${status === 'all' ? '' : ` · ${status}`}`,
            body: buildPermissionRulesBodyForStatus(normalizedScope, rules, status),
            tone: filterPermissionRulesByStatus(rules, status).length === 0 ? 'warn' : 'info',
          })
          return 'handled'
        }
        renderPermissionRulesConsole(normalizedScope, rules, console, status)
        return 'handled'
      }
      if (subcmd === 'revoke' || subcmd === 'remove') {
        const scope = (rest[0] || 'session').toLowerCase()
        const normalizedScope = scope === 'project' || scope === 'global' ? scope : 'session'
        const rule = rest.slice(1).join(' ').trim()
        if (!rule && session) {
          const rules = getPermissionRules?.(normalizedScope) || []
          launchPermissionRuleRevokePicker(session, normalizedScope, rules, removePermissionRule)
          return 'handled'
        }
        if (!rule) {
          console.log('\x1b[33m  usage: /permissions revoke <session|project|global> <rule>\x1b[0m')
          return 'handled'
        }
        const removed = removePermissionRule?.(normalizedScope, rule) || false
        if (!removed) {
          console.log(`\x1b[33m  no ${normalizedScope} rule matched.\x1b[0m`)
          return 'handled'
        }
        console.log(`\x1b[90m  removed ${normalizedScope} rule.\x1b[0m`)
        return 'handled'
      }
      if (subcmd === 'clear') {
        const scope = (rest[0] || 'session').toLowerCase()
        const normalizedScope = scope === 'project' || scope === 'global' ? scope : 'session'
        const removed = clearPermissionRules?.(normalizedScope) ?? 0
        console.log(`\x1b[90m  cleared ${removed} ${normalizedScope} permission rule(s).\x1b[0m`)
        return 'handled'
      }
      if (subcmd === 'normalize') {
        const scope = (rest[0] || 'all').toLowerCase()
        const scopes = scope === 'project' || scope === 'global'
          ? [scope as 'project' | 'global']
          : ['project', 'global'] as Array<'project' | 'global'>
        for (const targetScope of scopes) {
          const result = normalizePermissionRules?.(targetScope) || normalizeStoredPermissionRules(targetScope, cwd)
          console.log(`\x1b[90m  normalized ${targetScope}: ${result.changedCount} changed, ${result.unresolvedCount} unresolved, ${result.total} total\x1b[0m`)
        }
        return 'handled'
      }
      if (subcmd === 'set') {
        const mode = (rest[0] || '').toLowerCase()
        if (!mode) {
          console.log('\x1b[33m  usage: /permissions set <yolo|auto|plan>\x1b[0m')
          return 'handled'
        }
        if (mode !== 'yolo' && mode !== 'auto' && mode !== 'plan') {
          console.log('\x1b[33m  invalid mode. Use: yolo, auto, plan\x1b[0m')
          return 'handled'
        }
        setPermissionMode?.(mode)
        console.log(`\x1b[90m  permissions: ${current} → \x1b[36m${mode}\x1b[0m`)
        return 'handled'
      }
      if (subcmd === 'save' || subcmd === 'persist') {
        const maybeMode = (rest[0] || '').toLowerCase()
        const maybeScope = (rest[1] || rest[0] || 'project').toLowerCase()
        const mode = maybeMode === 'yolo' || maybeMode === 'auto' || maybeMode === 'plan' ? maybeMode : current
        const scope = maybeScope === 'global' ? 'global' : 'project'
        const path = persistPermissionMode?.(mode, scope)
        if (!path) {
          console.log('\x1b[31m  permission persistence unavailable.\x1b[0m')
          return 'handled'
        }
        console.log(`\x1b[90m  saved permissions: ${mode} (${scope})\x1b[0m`)
        console.log(`\x1b[90m  config: ${path}\x1b[0m`)
        return 'handled'
      }
      console.log('\x1b[33m  usage: /permissions [show|rules [session|project|global] [all|canonical|legacy|unrecognized]|revoke <scope> [rule]|clear [scope]|normalize [project|global|all]|set <mode>|save [mode] [project|global]]\x1b[0m')
      return 'handled'
    }

    case '/save': {
      const sessionName = arg || `session-${Date.now()}`
      try {
        const sessFile = writeSavedSession(sessionName, {
          provider: mc.getProvider(),
          model: mc.getModel(),
          modeId: modeRegistry?.getActive().id,
          history,
          stats: {
            turns: stats.turns,
            inputTokens: stats.totalInputTokens,
            outputTokens: stats.totalOutputTokens,
          },
          savedAt: new Date().toISOString(),
        })
        console.log(`\x1b[90m  saved: ${sessFile}\x1b[0m`)
      } catch (error) {
        console.log(`\x1b[31m  save failed: ${error instanceof Error ? error.message : error}\x1b[0m`)
      }
      return 'handled'
    }

    case '/load': {
      if (!arg) {
        if (session) {
          const savedSessions = listSavedSessions().slice(0, 20)
          if (savedSessions.length === 0) {
            session.emitSystemMessage('no saved sessions.', 'info')
            return 'handled'
          }
          session.emitOptionPicker({
            title: 'Load session',
            subtitle: 'Select a saved session',
            options: savedSessions.map((saved) => ({
              value: saved.name,
              label: saved.name,
              description: `${saved.session.model} · ${saved.session.stats.turns} turns`,
            })),
          }).then((selected) => {
            if (!selected) return
            const followup = handleMutatingSlashCommand({
              ...options,
              arg: selected,
            })
            if (followup === 'handled') {
              return
            }
          }).catch(() => {})
          return 'handled'
        }
        console.log('\x1b[33m  usage: /load <name>  (see /sessions for available)\x1b[0m')
        return 'handled'
      }
      try {
        const loaded = getSavedSessionById(arg)
        if (!loaded) {
          console.log(`\x1b[31m  load failed: session "${arg}" not found\x1b[0m`)
          return 'handled'
        }
        const pending = buildPendingContinueRestore(loaded)
        if (!pending.restore) {
          if (pending.warning) console.log(`\x1b[33m  ${pending.warning}\x1b[0m`)
          return 'handled'
        }
        const data = pending.restore
        const previousModeId = modeRegistry?.getActive().id
        const requestedModeId = data.restoredModeId || 'default'
        if (requestedModeId && modeRegistry && !modeRegistry.switchTo(requestedModeId)) {
          console.log(`\x1b[33m  saved mode unavailable: ${requestedModeId}\x1b[0m`)
          return 'handled'
        }
        if (data.restoredSelection) {
          const target = data.restoredSelection.provider
            ? { provider: data.restoredSelection.provider, model: data.restoredSelection.model }
            : data.restoredSelection.model
          if (!mc.setModel(target)) {
            if (requestedModeId && previousModeId && requestedModeId !== previousModeId) {
              modeRegistry?.switchTo(previousModeId)
            }
            return 'handled'
          }
        }
        history.length = 0
        history.push(...data.history)
        stats.turns = data.stats.turns
        stats.totalInputTokens = data.stats.totalInputTokens
        stats.totalOutputTokens = data.stats.totalOutputTokens
        stats.turnTokens = [...data.stats.turnTokens]
        if (typeof stats.startTime === 'number') stats.startTime = data.stats.startTime
        if (session) session.emitClear()
        harness?.tokenBudget.clearCurrentUsage()
        harness?.contextMonitor.clearCurrentUsage()
        const msgCount = history.filter((message) => message.role !== 'system').length
        onSessionReset?.()
        if (session) {
          session.emitSystemMessage(`loaded: ${msgCount} messages, model: ${mc.getModel()}`, 'info')
        } else {
          console.log(`\x1b[90m  loaded: ${msgCount} messages, model: ${mc.getModel()}\x1b[0m`)
        }
      } catch (error) {
        console.log(`\x1b[31m  load failed: ${error instanceof Error ? error.message : error}\x1b[0m`)
      }
      return 'handled'
    }

    case '/undo': {
      if (!undo?.lastWrite?.path) {
        console.log('\x1b[90m  nothing to undo.\x1b[0m')
        return 'handled'
      }
      const { path: undoPath, oldContent } = undo.lastWrite
      try {
        if (oldContent === null) {
          unlinkSync(undoPath)
          console.log(`\x1b[90m  undo: deleted ${undoPath} (was newly created)\x1b[0m`)
        } else {
          writeFileSync(undoPath, oldContent, 'utf-8')
          console.log(`\x1b[90m  undo: restored ${undoPath} (${oldContent.length} bytes)\x1b[0m`)
        }
        undo.lastWrite = null
      } catch (error) {
        console.log(`\x1b[31m  undo failed: ${error instanceof Error ? error.message : error}\x1b[0m`)
      }
      return 'handled'
    }

    case '/continue': {
      try {
        const latest = getLatestSavedSession()
        if (!latest) {
          console.log('\x1b[90m  no saved sessions found.\x1b[0m')
          return 'handled'
        }
        const pending = buildPendingContinueRestore(latest)
        if (!pending.restore) {
          if (pending.warning) console.log(`\x1b[33m  ${pending.warning}\x1b[0m`)
          return 'handled'
        }
        const restore = pending.restore
        const previousModeId = modeRegistry?.getActive().id
        const requestedModeId = restore.restoredModeId || 'default'
        if (requestedModeId && modeRegistry && !modeRegistry.switchTo(requestedModeId)) {
          console.log(`\x1b[33m  saved mode unavailable: ${requestedModeId}\x1b[0m`)
          return 'handled'
        }
        if (restore.restoredSelection) {
          const target = restore.restoredSelection.provider
            ? { provider: restore.restoredSelection.provider, model: restore.restoredSelection.model }
            : restore.restoredSelection.model
          if (!mc.setModel(target)) {
            if (requestedModeId && previousModeId && requestedModeId !== previousModeId) {
              modeRegistry?.switchTo(previousModeId)
            }
            return 'handled'
          }
        }
        history.length = 0
        history.push(...restore.history)
        stats.turns = restore.stats.turns
        stats.totalInputTokens = restore.stats.totalInputTokens
        stats.totalOutputTokens = restore.stats.totalOutputTokens
        stats.turnTokens = [...restore.stats.turnTokens]
        if (typeof stats.startTime === 'number') stats.startTime = restore.stats.startTime
        if (session) session.emitClear()
        harness?.tokenBudget.clearCurrentUsage()
        harness?.contextMonitor.clearCurrentUsage()
        onSessionReset?.()
        if (session) {
          session.emitSystemMessage(`restored session: ${restore.name} (${stats.turns} turns, ${history.length} messages)`, 'info')
        } else {
          console.log(`\x1b[90m  restored session: ${restore.name} (${stats.turns} turns, ${history.length} messages)\x1b[0m`)
        }
      } catch (error) {
        console.log(`\x1b[31m  continue failed: ${error instanceof Error ? error.message : error}\x1b[0m`)
      }
      return 'handled'
    }

    case '/commit':
      try {
        const status = execSync('git status --porcelain', { cwd, encoding: 'utf-8', timeout: 5000 }).trim()
        if (!status) {
          console.log('\x1b[90m  nothing to commit (working tree clean).\x1b[0m')
          return 'handled'
        }
        return 'not_command'
      } catch {
        return 'not_command'
      }

    case '/review':
    case '/pr':
      return 'not_command'

    case '/mcp':
      if (arg.startsWith('disable ')) {
        const serverName = arg.slice(8).trim()
        if (mcpClient.disableServer(serverName)) {
          console.log(`\x1b[90m  disabled: ${serverName}\x1b[0m`)
        } else {
          console.log(`\x1b[31m  server not found: ${serverName}\x1b[0m`)
        }
        return 'handled'
      }
      if (arg.startsWith('enable ')) {
        const serverName = arg.slice(7).trim()
        if (mcpClient.enableServer(serverName)) {
          console.log(`\x1b[90m  enabled: ${serverName}\x1b[0m`)
          mcpClient.connect(serverName).then((ok) => {
            if (ok) output.info(`connected: ${serverName}`)
            else output.warn(`enabled but failed to connect: ${serverName}`)
          }).catch(() => {})
        } else {
          console.log(`\x1b[31m  server not found: ${serverName}\x1b[0m`)
        }
        return 'handled'
      }
      if (arg.startsWith('connect ')) {
        const serverName = arg.slice(8).trim()
        mcpClient.connect(serverName).then((ok) => {
          if (ok) output.info(`connected: ${serverName}`)
          else output.error(`failed to connect: ${serverName}`)
        }).catch(() => {})
        return 'handled'
      }

      {
        const servers = mcpClient.listServers()
        if (servers.length === 0) {
          console.log('\x1b[90m  no MCP servers configured.\x1b[0m')
        } else {
          console.log(`\x1b[90m  MCP servers: ${servers.length} configured, ${mcpClient.connectedCount} connected\x1b[0m`)
          for (const server of servers) {
            const status = server.disabled
              ? '\x1b[90mdisabled\x1b[0m'
              : server.initialized
                ? `\x1b[32mconnected\x1b[0m (pid ${server.pid})`
                : server.pid > 0
                  ? '\x1b[33mstarting\x1b[0m'
                  : '\x1b[90mnot connected\x1b[0m'
            console.log(`    ${server.name}  ${status}`)
          }
          console.log('\x1b[90m  commands: /mcp enable <name> | disable <name> | connect <name>\x1b[0m')
        }
      }
      return 'handled'

    case '/thread':
    case '/threads':
      if (!threadManager) {
        console.log('\x1b[90m  thread manager not available.\x1b[0m')
        return 'handled'
      }
      {
        const subcmd = arg.split(/\s+/)[0] || ''
        const subarg = arg.slice(subcmd.length).trim()

        if (!subcmd || subcmd === 'list') {
          const threads = threadManager.list(10)
          if (threads.length === 0) {
            console.log('\x1b[90m  no threads saved.\x1b[0m')
          } else {
            console.log('\x1b[90m  Threads:\x1b[0m')
            for (const thread of threads) {
              const date = new Date(thread.updatedAt).toLocaleString()
              console.log(`\x1b[90m    ${thread.id}  ${thread.title.slice(0, 40)}  (${thread.messages.length} msgs · ${date})\x1b[0m`)
            }
          }
        } else if (subcmd === 'save') {
          const title = subarg || `Chat ${new Date().toLocaleString()}`
          const convMsgs = history.filter((message) => message.role !== 'system')
          const thread = threadManager.create(
            title,
            convMsgs.map((message) => ({ role: message.role, content: messageContentToText(message.content) })),
          )
          console.log(`\x1b[90m  thread saved: ${thread.id} (${thread.title})\x1b[0m`)
        } else if (subcmd === 'load') {
          if (!subarg) {
            console.log('\x1b[33m  usage: /thread load <id>\x1b[0m')
          } else {
            const thread = threadManager.load(subarg)
            if (!thread) {
              console.log(`\x1b[31m  thread not found: ${subarg}\x1b[0m`)
            } else {
              const sysMsg = history.find((message) => message.role === 'system')
              history.length = 0
              if (sysMsg) history.push(sysMsg)
              for (const message of thread.messages) {
                history.push({ role: message.role as 'user' | 'assistant', content: message.content })
              }
              stats.turns = 0
              stats.totalInputTokens = 0
              stats.totalOutputTokens = 0
              stats.turnTokens = []
              if (typeof stats.startTime === 'number') stats.startTime = Date.now()
              if (session) session.emitClear()
              harness?.tokenBudget.clearCurrentUsage()
              harness?.contextMonitor.clearCurrentUsage()
              onSessionReset?.()
              if (session) {
                session.emitSystemMessage(`loaded thread: ${thread.title} (${thread.messages.length} messages)`, 'info')
              } else {
                console.log(`\x1b[90m  loaded thread: ${thread.title} (${thread.messages.length} messages)\x1b[0m`)
              }
            }
          }
        } else if (subcmd === 'search') {
          if (session) {
            const threads = threadManager.list(100)
            if (threads.length === 0) {
              session.emitSystemMessage('no threads saved.', 'info')
              return 'handled'
            }
            session.emitOptionPicker({
              title: 'Search threads',
              subtitle: 'Filter and inspect saved threads',
              options: threads.map((thread) => ({
                value: thread.id,
                label: thread.title,
                description: `${thread.id} · ${thread.messages.length} msgs`,
              })),
              filterable: true,
              filterPlaceholder: 'search',
              initialQuery: subarg,
            }).then((selected) => {
              if (!selected) return
              const thread = threadManager.load(selected)
              if (!thread) return
              const transcript = thread.messages
                .slice(0, 8)
                .map((message) => `- **${message.role}**: ${message.content.slice(0, 240)}`)
                .join('\n')
              session.emitDetailPanel({
                title: thread.title,
                subtitle: `${thread.id} · ${thread.messages.length} messages`,
                body: transcript || '_No messages_',
              })
            }).catch(() => {})
          } else if (!subarg) {
            console.log('\x1b[33m  usage: /thread search <query>\x1b[0m')
          } else {
            const results = threadManager.search(subarg, 5)
            if (results.length === 0) {
              console.log(`\x1b[90m  no threads matching "${subarg}".\x1b[0m`)
            } else {
              console.log(`\x1b[90m  Found ${results.length} thread(s):\x1b[0m`)
              for (const thread of results) {
                console.log(`\x1b[90m    ${thread.id}  ${thread.title.slice(0, 40)}\x1b[0m`)
              }
            }
          }
        } else if (subcmd === 'delete') {
          if (!subarg) {
            console.log('\x1b[33m  usage: /thread delete <id>\x1b[0m')
          } else if (threadManager.delete(subarg)) {
            console.log(`\x1b[90m  deleted thread: ${subarg}\x1b[0m`)
          } else {
            console.log(`\x1b[31m  thread not found: ${subarg}\x1b[0m`)
          }
        } else if (subcmd === 'export') {
          const [id = '', file = ''] = subarg.split(/\s+/)
          if (!id || !file) {
            console.log('\x1b[33m  usage: /thread export <id> <file>\x1b[0m')
          } else {
            const thread = threadManager.load(id)
            if (!thread) {
              console.log(`\x1b[31m  thread not found: ${id}\x1b[0m`)
            } else {
              writeFileSync(file, JSON.stringify(thread, null, 2), 'utf-8')
              console.log(`\x1b[90m  exported thread: ${id} -> ${file}\x1b[0m`)
            }
          }
        } else if (subcmd === 'markdown') {
          const [id = '', file = ''] = subarg.split(/\s+/)
          if (!id || !file) {
            console.log('\x1b[33m  usage: /thread markdown <id> <file>\x1b[0m')
          } else if (!threadManager.exportMarkdown(id, file)) {
            console.log(`\x1b[31m  thread not found: ${id}\x1b[0m`)
          } else {
            console.log(`\x1b[90m  exported thread markdown: ${id} -> ${file}\x1b[0m`)
          }
        } else if (subcmd === 'share') {
          const [id = '', file = ''] = subarg.split(/\s+/)
          if (!id) {
            console.log('\x1b[33m  usage: /thread share <id> [file]\x1b[0m')
          } else {
            const bundle = threadManager.shareBundle(id, file || undefined)
            if (!bundle) {
              console.log(`\x1b[31m  thread not found: ${id}\x1b[0m`)
            } else {
              console.log(`\x1b[90m  shared thread artifact: ${bundle.markdownPath}\x1b[0m`)
              console.log(`\x1b[90m  metadata: ${bundle.metadataPath}\x1b[0m`)
            }
          }
        } else if (subcmd === 'import') {
          const [file = '', ...titleParts] = subarg.split(/\s+/)
          const titleOverride = titleParts.join(' ').trim() || undefined
          if (!file) {
            console.log('\x1b[33m  usage: /thread import <file> [title]\x1b[0m')
          } else {
            try {
              const thread = threadManager.importFromFile(file, titleOverride)
              console.log(`\x1b[90m  imported thread: ${thread.id} (${thread.title})\x1b[0m`)
            } catch (error) {
              console.log(`\x1b[31m  import failed: ${error instanceof Error ? error.message : error}\x1b[0m`)
            }
          }
        } else if (subcmd === 'handoff') {
          const [id = '', ...titleParts] = subarg.split(/\s+/)
          const titleOverride = titleParts.join(' ').trim() || undefined
          if (!id) {
            console.log('\x1b[33m  usage: /thread handoff <id> [title]\x1b[0m')
          } else {
            const handoff = threadManager.fork(id, titleOverride || `Handoff: ${id}`, {
              handoff: true,
            })
            if (!handoff) {
              console.log(`\x1b[31m  thread not found: ${id}\x1b[0m`)
            } else {
              console.log(`\x1b[90m  handoff thread created: ${handoff.id} (${handoff.title})\x1b[0m`)
              const bundle = threadManager.writeHandoffBundle(handoff.id, id)
              if (bundle) {
                console.log(`\x1b[90m  handoff artifact: ${bundle.markdownPath}\x1b[0m`)
                console.log(`\x1b[90m  metadata: ${bundle.metadataPath}\x1b[0m`)
              }
            }
          }
        } else {
          console.log('\x1b[33m  usage: /thread [list|save|load|search|delete|export|markdown|share|import|handoff]\x1b[0m')
        }
      }
      return 'handled'

    case '/init': {
      const configPath = initProjectConfig(cwd)
      console.log(`\x1b[90m  created: ${configPath}\x1b[0m`)
      return 'handled'
    }

    case '/notes': {
      const notes = new NotesManager()
      const subcmd = arg.split(/\s+/)[0] || ''
      const subarg = arg.slice(subcmd.length).trim()

      if (!subcmd || subcmd === 'list') {
        const list = notes.list(10)
        if (list.length === 0) console.log('\x1b[90m  no notes.\x1b[0m')
        else {
          for (const note of list) {
            const tags = note.tags.length > 0 ? ` [${note.tags.join(', ')}]` : ''
            console.log(`\x1b[90m  ${note.id.slice(0, 20)}  ${note.content.slice(0, 60)}${tags}\x1b[0m`)
          }
        }
      } else if (subcmd === 'add') {
        if (!subarg) console.log('\x1b[33m  usage: /notes add <content> [#tag1 #tag2]\x1b[0m')
        else {
          const tags = [...subarg.matchAll(/#(\S+)/g)].map((match) => match[1]!)
          const content = subarg.replace(/#\S+/g, '').trim()
          const note = notes.create(content, tags, undefined, cwd.split('/').pop())
          console.log(`\x1b[90m  note saved: ${note.id}\x1b[0m`)
        }
      } else if (subcmd === 'search') {
        if (session) {
          const list = notes.list(100)
          if (list.length === 0) {
            session.emitSystemMessage('no notes.', 'info')
            return 'handled'
          }
          session.emitOptionPicker({
            title: 'Search notes',
            subtitle: 'Filter by content or tags',
            options: list.map((note) => ({
              value: note.id,
              label: note.content.slice(0, 60),
              description: note.tags.length > 0 ? `#${note.tags.join(' #')}` : note.id,
            })),
            filterable: true,
            filterPlaceholder: 'search',
            initialQuery: subarg,
          }).then((selected) => {
            if (!selected) return
            const note = notes.load(selected)
            if (!note) return
            const tags = note.tags.length > 0 ? note.tags.map((tag) => `#${tag}`).join(' ') : 'untagged'
            session.emitDetailPanel({
              title: note.content.slice(0, 60),
              subtitle: `${note.id.slice(0, 20)} · ${tags}`,
              body: note.content,
            })
          }).catch(() => {})
        } else {
          const results = notes.search(subarg || '', 5)
          if (results.length === 0) console.log('\x1b[90m  no matches.\x1b[0m')
          else {
            for (const note of results) {
              console.log(`\x1b[90m  ${note.id.slice(0, 20)}  ${note.content.slice(0, 60)}\x1b[0m`)
            }
          }
        }
      } else {
        console.log('\x1b[33m  usage: /notes [list|add|search]\x1b[0m')
      }
      return 'handled'
    }

    case '/postmortem': {
      const pmLog = new PostmortemLog()
      const subcmd = arg.split(/\s+/)[0] || ''

      if (!subcmd || subcmd === 'list') {
        const list = pmLog.list(10)
        if (list.length === 0) console.log('\x1b[90m  no postmortems.\x1b[0m')
        else {
          for (const postmortem of list) {
            const severityColor = {
              low: '\x1b[90m',
              medium: '\x1b[33m',
              high: '\x1b[31m',
              critical: '\x1b[31;1m',
            }[postmortem.severity]
            console.log(`${severityColor}  ${postmortem.id.slice(0, 16)}  ${postmortem.problem.slice(0, 50)}  applied:${postmortem.appliedCount}\x1b[0m`)
          }
        }
      } else if (subcmd === 'search') {
        const query = arg.slice(subcmd.length).trim()
        if (session) {
          const list = pmLog.listAll()
          if (list.length === 0) {
            session.emitSystemMessage('no postmortems.', 'info')
            return 'handled'
          }
          session.emitOptionPicker({
            title: 'Search postmortems',
            subtitle: 'Filter by problem, trigger, or severity',
            options: list.map((postmortem) => ({
              value: postmortem.id,
              label: postmortem.problem.slice(0, 60),
              description: `${postmortem.severity} · applied:${postmortem.appliedCount}`,
            })),
            filterable: true,
            filterPlaceholder: 'search',
            initialQuery: query,
          }).then((selected) => {
            if (!selected) return
            const postmortem = list.find((item) => item.id === selected)
            if (!postmortem) return
            session.emitDetailPanel({
              title: postmortem.problem.slice(0, 60),
              subtitle: `${postmortem.id} · severity:${postmortem.severity} · applied:${postmortem.appliedCount}`,
              body: pmLog.formatForContext([postmortem]),
              tone: postmortem.severity === 'critical' || postmortem.severity === 'high'
                ? 'error'
                : postmortem.severity === 'medium'
                  ? 'warn'
                  : 'info',
            })
          }).catch(() => {})
        } else {
          const matches = pmLog.match(query)
          if (matches.length === 0) console.log('\x1b[90m  no matches.\x1b[0m')
          else console.log(pmLog.formatForContext(matches))
        }
      } else {
        console.log('\x1b[33m  usage: /postmortem [list|search <error>]\x1b[0m')
      }
      return 'handled'
    }

    case '/prompts': {
      const repo = new PromptRepository()
      const subcmd = arg.split(/\s+/)[0] || ''
      const subarg = arg.slice(subcmd.length).trim()

      if (!subcmd || subcmd === 'list') {
        const list = repo.list(10)
        if (list.length === 0) console.log('\x1b[90m  no prompts saved.\x1b[0m')
        else {
          for (const prompt of list) {
            const rate = prompt.usageCount > 0 ? Math.round((prompt.successCount / prompt.usageCount) * 100) : 0
            console.log(`\x1b[90m  ${prompt.name.padEnd(20)} [${prompt.category}]  used:${prompt.usageCount} success:${rate}%\x1b[0m`)
          }
        }
      } else if (subcmd === 'find') {
        if (session) {
          const list = repo.listAll()
          if (list.length === 0) {
            session.emitSystemMessage('no prompts saved.', 'info')
            return 'handled'
          }
          session.emitOptionPicker({
            title: 'Search prompts',
            subtitle: 'Filter by name, category, or template text',
            options: list.map((prompt) => ({
              value: prompt.id,
              label: prompt.name,
              description: `[${prompt.category}] used:${prompt.usageCount}`,
            })),
            filterable: true,
            filterPlaceholder: 'search',
            initialQuery: subarg,
          }).then((selected) => {
            if (!selected) return
            const prompt = repo.load(selected)
            if (!prompt) return
            session.emitDetailPanel({
              title: prompt.name,
              subtitle: `${prompt.id} · [${prompt.category}] · used:${prompt.usageCount} · success:${prompt.successCount}`,
              body: prompt.template,
            })
          }).catch(() => {})
        } else {
          const found = repo.find(subarg)
          for (const prompt of found) {
            console.log(`\x1b[90m  ${prompt.id}  ${prompt.name}  [${prompt.category}]\x1b[0m`)
          }
        }
      } else {
        console.log('\x1b[33m  usage: /prompts [list|find <query>]\x1b[0m')
      }
      return 'handled'
    }

    case '/learn': {
      const journal = new LearningJournal()
      const subcmd = arg.split(/\s+/)[0] || ''
      const subarg = arg.slice(subcmd.length).trim()

      if (!subcmd || subcmd === 'rules') {
        const rules = journal.getPromotedRules()
        if (rules.length === 0) console.log('\x1b[90m  no promoted rules yet.\x1b[0m')
        else {
          console.log('\x1b[90m  Promoted rules:\x1b[0m')
          for (const rule of rules) console.log(`\x1b[32m  + ${rule.content.slice(0, 70)}\x1b[0m`)
        }
      } else if (subcmd === 'observe') {
        if (!subarg) console.log('\x1b[33m  usage: /learn observe <observation>\x1b[0m')
        else {
          const entry = journal.observe(subarg, [], cwd.split('/').pop())
          console.log(`\x1b[90m  recorded: ${entry.id}\x1b[0m`)
        }
      } else if (subcmd === 'status') {
        const obs = journal.listByStatus('observation').length
        const hyp = journal.listByStatus('hypothesis').length
        const pro = journal.listByStatus('promoted').length
        const rej = journal.listByStatus('rejected').length
        console.log(`\x1b[90m  observations:${obs}  hypotheses:${hyp}  promoted:${pro}  rejected:${rej}\x1b[0m`)
      } else {
        console.log('\x1b[33m  usage: /learn [rules|observe|status]\x1b[0m')
      }
      return 'handled'
    }

      default:
        if (/^\/\d+$/.test(cmd)) {
          const idx = parseInt(cmd.slice(1), 10) - 1
          const choices = mc.getChoices()
          if (idx >= 0 && idx < choices.length) {
            const newModel = choices[idx]!.model
            const oldModel = mc.getModel()
            if (!mc.setModel(choices[idx]!)) return 'handled'
            console.log(`\x1b[90m  model: ${oldModel} → \x1b[36m${newModel}\x1b[0m`)
            const warning = getAgenticWarning(newModel)
            if (warning) console.log(`\x1b[33m  caution: ${warning}\x1b[0m`)
            logInfo('model switched via numeric shortcut', { from: oldModel, to: newModel, provider: mc.getProvider() })
            if (warning) logWarning('model caution', { model: newModel, provider: mc.getProvider(), warning })
            return 'handled'
          }
        }
        return 'not_command'
    }
}
