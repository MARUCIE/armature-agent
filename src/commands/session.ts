/**
 * `orca session` — Session management.
 *
 * Usage:
 *   orca session list          List saved sessions
 *   orca session show <id>     Show session details
 *   orca session delete <id>   Delete a session
 */

import { Command } from 'commander'
import { unlinkSync } from 'node:fs'
import { messageContentToText, type ChatMessage } from '../providers/openai-compat.js'
import { getLatestSavedSession, getSavedSessionById, listSavedSessions, listSessionFiles } from '../session-store.js'

/**
 * Get the most recent session for `orca -c` continuation.
 */
export function getLastSession() {
  return getLatestSavedSession()
}

/**
 * Get a session by partial ID match.
 */
export function getSessionById(id: string) {
  return getSavedSessionById(id)
}

export function createSessionCommand(): Command {
  const cmd = new Command('session')
    .description('Manage saved sessions')

  const renderSessionList = () => {
    const sessions = listSavedSessions()

    if (sessions.length === 0) {
      console.log('\n  \x1b[90m(no saved sessions)\x1b[0m\n')
      return
    }

    console.log()
    console.log('  \x1b[1mSaved Sessions\x1b[0m')
    console.log()
    console.log(`  ${'ID'.padEnd(28)} ${'Model'.padEnd(24)} ${'Turns'.padEnd(8)} Updated`)
    console.log(`  ${'─'.repeat(28)} ${'─'.repeat(24)} ${'─'.repeat(8)} ${'─'.repeat(20)}`)

    for (const f of sessions.slice(0, 20)) {
      const id = f.name.slice(0, 28).padEnd(28)
      const session = f.session
      const model = (session.model || '?').slice(0, 24).padEnd(24)
      const turns = String(session.stats?.turns || 0).padEnd(8)
      const time = f.mtime.toLocaleString('en-US', {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
      })

      console.log(`  ${id} ${model} ${turns} ${time}`)
    }

    console.log()
    console.log(`  \x1b[90m${sessions.length} session(s) · Continue last: orca -c\x1b[0m`)
    console.log()
  }

  cmd.command('list')
    .description('List saved sessions')
    .action(renderSessionList)

  // Default action: same as list
  cmd.action(renderSessionList)

  cmd.command('show')
    .argument('<id>', 'Session ID (partial match)')
    .description('Show session messages')
    .action((id: string) => {
      const result = getSessionById(id)
      if (!result) {
        console.error(`\x1b[31m  error: session "${id}" not found\x1b[0m`)
        process.exit(1)
      }

      console.log()
      console.log(`  \x1b[1m${result.name}\x1b[0m`)
      console.log(`  \x1b[90mModel: ${result.session.model} · Turns: ${result.session.stats?.turns || 0}\x1b[0m`)
      console.log()

      for (const msg of result.session.history) {
        const prefix = msg.role === 'user' ? '\x1b[36m  > \x1b[0m' : '\x1b[90m  \x1b[0m'
        const text = messageContentToText(msg.content)
        console.log(`${prefix}${text.slice(0, 200)}${text.length > 200 ? '...' : ''}`)
        console.log()
      }
    })

  cmd.command('delete')
    .argument('<id>', 'Session ID (partial match)')
    .description('Delete a saved session')
    .action((id: string) => {
      const files = listSessionFiles()
      const match = files.find(f => f.name.includes(id))
      if (!match) {
        console.error(`\x1b[31m  error: session "${id}" not found\x1b[0m`)
        process.exit(1)
      }
      unlinkSync(match.path)
      console.log(`  \x1b[90mdeleted: ${match.name}\x1b[0m`)
    })

  return cmd
}
