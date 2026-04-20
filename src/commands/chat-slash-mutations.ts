import { execSync } from 'node:child_process'
import { mkdirSync as fsMkdirSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { initProjectConfig } from '../config.js'
import { hooks } from '../hooks.js'
import { PostmortemLog, NotesManager, PromptRepository, LearningJournal } from '../knowledge/index.js'
import { logInfo, logWarning } from '../logger.js'
import { getAgenticWarning, type ModelChoice } from '../model-catalog.js'
import { mcpClient } from '../mcp-client.js'
import type { ModeRegistry } from '../modes/index.js'
import { messageContentToText } from '../providers/openai-compat.js'
import type { ChatMessage } from '../providers/openai-compat.js'
import { getLatestSavedSession, getSavedSessionById, writeSavedSession } from '../session-store.js'
import { buildPendingContinueRestore } from './chat-resume-state.js'
import { resetConversationState } from './chat-session-state.js'
import type { TokenBudgetManager } from '../token-budget.js'
import type { ContextMonitor } from '../harness/index.js'
import type { ThreadManager } from '../memory/threads.js'
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
}

export function handleMutatingSlashCommand(options: MutatingSlashCommandOptions): MutatingSlashCommandResult {
  const { cmd, arg, history, stats, cwd, mc, undo, harness, onSessionReset, modeRegistry, threadManager, session } = options

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
      const target = mc.getChoices().find((choice) => choice.model === newModel) || newModel
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
      hooks.printStatus()
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
            if (ok) console.log(`\x1b[32m  connected: ${serverName}\x1b[0m`)
            else console.log(`\x1b[33m  enabled but failed to connect: ${serverName}\x1b[0m`)
          }).catch(() => {})
        } else {
          console.log(`\x1b[31m  server not found: ${serverName}\x1b[0m`)
        }
        return 'handled'
      }
      if (arg.startsWith('connect ')) {
        const serverName = arg.slice(8).trim()
        mcpClient.connect(serverName).then((ok) => {
          if (ok) console.log(`\x1b[32m  connected: ${serverName}\x1b[0m`)
          else console.log(`\x1b[31m  failed to connect: ${serverName}\x1b[0m`)
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
          if (!subarg) {
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
        } else {
          console.log('\x1b[33m  usage: /thread [list|save|load|search|delete]\x1b[0m')
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
        const results = notes.search(subarg || '', 5)
        if (results.length === 0) console.log('\x1b[90m  no matches.\x1b[0m')
        else {
          for (const note of results) {
            console.log(`\x1b[90m  ${note.id.slice(0, 20)}  ${note.content.slice(0, 60)}\x1b[0m`)
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
        const matches = pmLog.match(query)
        if (matches.length === 0) console.log('\x1b[90m  no matches.\x1b[0m')
        else console.log(pmLog.formatForContext(matches))
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
        const found = repo.find(subarg)
        for (const prompt of found) {
          console.log(`\x1b[90m  ${prompt.id}  ${prompt.name}  [${prompt.category}]\x1b[0m`)
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
