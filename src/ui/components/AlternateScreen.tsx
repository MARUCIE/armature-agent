/**
 * AlternateScreen — wraps children in the terminal's alternate screen buffer.
 *
 * Matches CC's AlternateScreen pattern:
 * - Enter: \x1b[?1049h (save cursor + switch to alt buffer)
 * - Clear: \x1b[2J\x1b[H (erase screen + cursor home)
 * - Exit: \x1b[?1049l (restore cursor + switch back to main buffer)
 *
 * This eliminates the "white gap" problem — alt screen has a clean dark
 * background that fills the entire terminal viewport.
 */

import React, { useEffect, useLayoutEffect, useInsertionEffect } from 'react'
import { Box } from 'ink'
import { useTerminalSize } from '../useTerminalSize.js'

const ENTER_ALT_SCREEN = '\x1b[?1049h'
const EXIT_ALT_SCREEN = '\x1b[?1049l'
const ERASE_SCREEN = '\x1b[2J'
const CURSOR_HOME = '\x1b[H'
const HIDE_CURSOR = '\x1b[?25l'
const SHOW_CURSOR = '\x1b[?25h'

export function enterAlternateScreen(): void {
  process.stdout.write(ENTER_ALT_SCREEN + ERASE_SCREEN + CURSOR_HOME + HIDE_CURSOR)
}

export function exitAlternateScreen(): void {
  process.stdout.write(SHOW_CURSOR + EXIT_ALT_SCREEN)
}

interface Props {
  children: React.ReactNode
  /** renderInkApp can pre-enter before Ink paints the first frame. */
  enterOnMount?: boolean
}

// Enter the alternate screen before Ink paints the first frame.
const usePrePaintEffect = typeof useInsertionEffect === 'function'
  ? useInsertionEffect
  : useLayoutEffect

export function AlternateScreen({ children, enterOnMount = true }: Props): React.ReactElement {
  const { rows } = useTerminalSize()

  usePrePaintEffect(() => {
    if (enterOnMount) enterAlternateScreen()

    return () => {
      // Exit alternate screen buffer on unmount (restores main buffer)
      exitAlternateScreen()
    }
  }, [enterOnMount])

  // Handle SIGCONT (resume from background) — re-enter alt screen
  useEffect(() => {
    const handler = () => {
      enterAlternateScreen()
    }
    process.on('SIGCONT', handler)
    return () => { process.removeListener('SIGCONT', handler) }
  }, [])

  return (
    <Box flexDirection="column" height={rows} width="100%" flexShrink={0}>
      {children}
    </Box>
  )
}
