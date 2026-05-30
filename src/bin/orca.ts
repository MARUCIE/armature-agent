#!/usr/bin/env node

/**
 * Orca CLI binary entry point.
 *
 * This is the file that runs when a user types `orca` in their terminal.
 */

import { run } from '../program.js'

// Keep SIGINT free for interactive chat to implement Claude Code-style
// interrupt/cancel semantics. Non-interactive commands still use Node's
// default SIGINT exit behavior.
process.on('SIGTERM', () => {
  process.exit(143)
})

run().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
