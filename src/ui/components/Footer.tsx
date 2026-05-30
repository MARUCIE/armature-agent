/**
 * Footer — keyboard shortcut hints below the status bar.
 *
 * Shows context-aware shortcuts: Esc/Ctrl+C (interrupt), Ctrl+L (redraw), Shift+Tab (mode), /help.
 * Keeps the persistent Armature pod identity visible after the banner scrolls away.
 */

import React from 'react'
import { Box, Text } from 'ink'
import { useTerminalSize } from '../useTerminalSize.js'
import { useTheme } from '../theme.js'

interface Props {
  /** Whether the model is currently generating */
  isGenerating: boolean
  /** Whether input is active */
  isInputActive: boolean
  /** Current permission mode */
  permMode: string
  /** Where current permission mode comes from */
  permSource?: string
}

export function Footer({ isGenerating, isInputActive, permMode, permSource }: Props): React.ReactElement {
  const { cols } = useTerminalSize()
  const theme = useTheme()
  const permLabel = permSource ? `${permMode}:${permSource}` : permMode
  const trustLabel = cols >= 96 ? `trust ${permLabel}` : permLabel

  const shortcuts: Array<{ key: string; label: string }> = []

  if (isGenerating) {
    shortcuts.push({ key: 'esc', label: 'interrupt' })
    if (cols >= 84) shortcuts.push({ key: 'ctrl+c', label: 'interrupt' })
  } else if (isInputActive) {
    shortcuts.push({ key: 'enter', label: 'send' })
    shortcuts.push({ key: 'ctrl+j', label: 'newline' })
    shortcuts.push({ key: 'esc esc', label: 'rewind' })
    shortcuts.push({ key: '/help', label: 'commands' })
    shortcuts.push({ key: 'shift+tab', label: trustLabel })
    if (cols >= 104) {
      shortcuts.push({ key: 'ctrl+_', label: 'undo' })
      shortcuts.push({ key: 'ctrl+l', label: 'redraw' })
      shortcuts.push({ key: 'alt+p', label: 'model' })
      shortcuts.push({ key: 'ctrl+g', label: 'editor' })
    }
  } else {
    // Idle / waiting for prompt_ready — still show basic hints
    shortcuts.push({ key: 'enter', label: 'send' })
    shortcuts.push({ key: '/help', label: 'commands' })
    shortcuts.push({ key: 'shift+tab', label: trustLabel })
  }

  if (shortcuts.length === 0) return <Box height={0} />

  return (
    <Box width={Math.max(0, cols - 1)} marginLeft={1}>
      {shortcuts.map((s, i) => (
        <Box key={s.key} marginRight={i < shortcuts.length - 1 ? 2 : 0} flexShrink={0}>
          <Text color={theme.accent} bold>{s.key}</Text>
          <Text color={theme.dim}> {s.label}</Text>
        </Box>
      ))}
    </Box>
  )
}
