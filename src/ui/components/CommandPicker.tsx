/**
 * CommandPicker — filterable, arrow-key navigable slash command list.
 *
 * Replaces the raw ANSI command-picker.ts with an ink component.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { useTheme } from '../theme.js'
import { PickerFrame } from './PickerFrame.js'

export interface CommandDef {
  name: string
  description: string
}

interface Props {
  commands: CommandDef[]
  filter: string
  onSelect: (command: string) => void
  onCancel: () => void
  active: boolean
}

export function CommandPicker({ commands, filter, onSelect, onCancel, active }: Props): React.ReactElement | null {
  const [selectedIdx, setSelectedIdx] = useState(0)
  const theme = useTheme()

  const filtered = useMemo(() => {
    if (!filter) return commands
    const lower = filter.toLowerCase()
    return commands.filter(c =>
      c.name.toLowerCase().includes(lower) || c.description.toLowerCase().includes(lower),
    )
  }, [commands, filter])

  useEffect(() => {
    if (filtered.length === 0) {
      setSelectedIdx(0)
      return
    }
    if (selectedIdx >= filtered.length) {
      setSelectedIdx(filtered.length - 1)
    }
  }, [filtered.length, selectedIdx])

  useInput(
    (_input, key) => {
      if (!active) return

      if (key.escape) {
        onCancel()
        return
      }

      if (filtered.length === 0) return

      if (key.upArrow) {
        setSelectedIdx(prev => Math.max(0, prev - 1))
      } else if (key.downArrow) {
        setSelectedIdx(prev => Math.min(filtered.length - 1, prev + 1))
      } else if (key.return) {
        const cmd = filtered[selectedIdx]
        if (cmd) onSelect(cmd.name)
      }
    },
    { isActive: active },
  )

  if (!active) return null

  const maxVisible = 12
  const start = Math.max(0, selectedIdx - Math.floor(maxVisible / 2))
  const visible = filtered.slice(start, start + maxVisible)

  return (
    <PickerFrame
      title="COMMANDS"
      subtitle={filter ? `filter: /${filter}` : `${commands.length} slash commands`}
      footer="↑↓ browse · enter select · esc close"
    >
      {filtered.length === 0 ? (
        <Box>
          <Text color={theme.dim}>no matching command</Text>
        </Box>
      ) : null}

      {visible.map((cmd, i) => {
        const idx = start + i
        const isSelected = idx === selectedIdx
        return (
          <Box key={cmd.name}>
            <Text color={isSelected ? theme.accent : theme.dim}>{isSelected ? '▸ ' : '  '}</Text>
            <Text color={isSelected ? theme.accent : theme.tool} bold={isSelected}>
              {cmd.name.padEnd(16)}
            </Text>
            <Text color={theme.dim}>{cmd.description}</Text>
          </Box>
        )
      })}

      {filtered.length > maxVisible ? (
        <Box marginTop={1}>
          <Text color={theme.dim}>{`… ${filtered.length - maxVisible} more commands`}</Text>
        </Box>
      ) : null}
    </PickerFrame>
  )
}
