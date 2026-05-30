/**
 * `armature logs` — View local Armature runtime logs.
 *
 * Usage:
 *   armature logs             Show agent.log tail
 *   armature logs errors      Show errors.log tail
 */

import { Command } from 'commander'
import { getLogPath, readLogTail } from '../logger.js'

export function createLogsCommand(): Command {
  const cmd = new Command('logs')
    .description('Show local Armature runtime logs')
    .option('-n, --lines <n>', 'Number of lines to show', '50')
    .argument('[kind]', 'Log kind: agent (default) or errors')
    .action((kindArg?: string, opts?: { lines?: string }) => {
      const kind = kindArg === 'errors' ? 'errors' : 'agent'
      const parsedLines = Number(opts?.lines)
      const lines = Number.isFinite(parsedLines) ? Math.max(1, parsedLines) : 50
      const entries = readLogTail(kind, lines)

      console.log()
      console.log(`  \x1b[1mArmature Logs: ${kind}\x1b[0m`)
      console.log(`  \x1b[90m${getLogPath(kind)}\x1b[0m`)
      console.log()

      if (entries.length === 0) {
        console.log('  \x1b[90m(no log entries)\x1b[0m')
        console.log()
        return
      }

      for (const entry of entries) {
        console.log(`  ${entry}`)
      }
      console.log()
    })

  return cmd
}
