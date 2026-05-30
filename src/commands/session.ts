/**
 * `armature session` — Session management.
 *
 * Usage:
 *   armature session list          List saved sessions
 *   armature session show <id>     Show session details
 *   armature session delete <id>   Delete a session
 */

import { Command } from 'commander'
import { unlinkSync, writeFileSync } from 'node:fs'
import { messageContentToText } from '../providers/openai-compat.js'
import {
  cloneSavedSession,
  getLatestSavedSession,
  getSavedSessionById,
  importSavedSessionFromFile,
  listSavedSessions,
  listSessionFiles,
  writeSessionHandoffArtifact,
  writeSessionMarkdownArtifact,
  writeSharedSessionArtifact,
} from '../session-store.js'

/**
 * Get the most recent session for `armature -c` continuation.
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

export function getContinuationSession(id?: string | boolean) {
  if (typeof id === 'string' && id.trim()) {
    return getSavedSessionById(id)
  }
  return getLatestSavedSession()
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
    console.log(`  \x1b[90m${sessions.length} session(s) · Continue last: armature -c · Specific: armature -c <id>\x1b[0m`)
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
      console.log(`  \x1b[90mID: ${result.name}\x1b[0m`)
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

  cmd.command('export')
    .argument('<id>', 'Session ID (partial match)')
    .argument('<file>', 'Output JSON file')
    .description('Export a saved session to a JSON file')
    .action((id: string, file: string) => {
      const result = getSessionById(id)
      if (!result) {
        console.error(`\x1b[31m  error: session "${id}" not found\x1b[0m`)
        process.exit(1)
      }
      writeFileSync(file, JSON.stringify(result.session, null, 2), 'utf-8')
      console.log(`  \x1b[90mexported: ${result.name} -> ${file}\x1b[0m`)
    })

  cmd.command('import')
    .argument('<file>', 'Input JSON file')
    .argument('[name]', 'Optional new session name')
    .description('Import a saved session from a JSON file')
    .action((file: string, name?: string) => {
      try {
        const imported = importSavedSessionFromFile(file, name)
        console.log(`  \x1b[90mimported: ${imported.name}\x1b[0m`)
      } catch (error) {
        console.error(`\x1b[31m  error: ${error instanceof Error ? error.message : error}\x1b[0m`)
        process.exit(1)
      }
    })

  cmd.command('fork')
    .argument('<id>', 'Session ID (partial match)')
    .argument('[name]', 'Optional new session name')
    .description('Fork a saved session into a new session record')
    .action((id: string, name?: string) => {
      const nextName = name || `fork-${Date.now()}`
      const forked = cloneSavedSession(id, nextName)
      if (!forked) {
        console.error(`\x1b[31m  error: session "${id}" not found\x1b[0m`)
        process.exit(1)
      }
      console.log(`  \x1b[90mforked: ${id} -> ${forked.name}\x1b[0m`)
    })

  cmd.command('markdown')
    .argument('<id>', 'Session ID (partial match)')
    .argument('<file>', 'Output Markdown file')
    .description('Export a saved session as Markdown')
    .action((id: string, file: string) => {
      const result = getSessionById(id)
      if (!result) {
        console.error(`\x1b[31m  error: session "${id}" not found\x1b[0m`)
        process.exit(1)
      }
      writeSessionMarkdownArtifact(result.name, result.session, file)
      console.log(`  \x1b[90mexported markdown: ${result.name} -> ${file}\x1b[0m`)
    })

  cmd.command('share')
    .argument('<id>', 'Session ID (partial match)')
    .argument('[file]', 'Optional output Markdown file')
    .description('Create a shareable Markdown artifact for a saved session')
    .action((id: string, file?: string) => {
      const result = getSessionById(id)
      if (!result) {
        console.error(`\x1b[31m  error: session "${id}" not found\x1b[0m`)
        process.exit(1)
      }
      const bundle = writeSharedSessionArtifact(result.name, result.session, file)
      console.log(`  \x1b[90mshared session artifact: ${bundle.markdownPath}\x1b[0m`)
      console.log(`  \x1b[90mmetadata: ${bundle.metadataPath}\x1b[0m`)
    })

  cmd.command('handoff')
    .argument('<id>', 'Session ID (partial match)')
    .argument('[name]', 'Optional new handoff session name')
    .argument('[file]', 'Optional output Markdown file for the handoff artifact')
    .description('Fork a session and create a handoff artifact bundle')
    .action((id: string, name?: string, file?: string) => {
      const source = getSessionById(id)
      if (!source) {
        console.error(`\x1b[31m  error: session "${id}" not found\x1b[0m`)
        process.exit(1)
      }
      const nextName = name || `handoff-${Date.now()}`
      const forked = cloneSavedSession(id, nextName)
      if (!forked) {
        console.error(`\x1b[31m  error: session "${id}" not found\x1b[0m`)
        process.exit(1)
      }
      const bundle = writeSessionHandoffArtifact(source.name, forked.name, forked.session, file)
      console.log(`  \x1b[90mhandoff session created: ${forked.name}\x1b[0m`)
      console.log(`  \x1b[90mhandoff artifact: ${bundle.markdownPath}\x1b[0m`)
      console.log(`  \x1b[90mmetadata: ${bundle.metadataPath}\x1b[0m`)
    })

  return cmd
}
