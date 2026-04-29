import React, { useEffect, useMemo, useState } from 'react'
import { Box, Text, useInput } from 'ink'
import type { OptionPickerOption } from '../types.js'
import { PickerFrame } from './PickerFrame.js'

const MAX_VISIBLE_OPTIONS = 10

interface Props {
  title: string
  subtitle?: string
  options: OptionPickerOption[]
  filterable?: boolean
  filterPlaceholder?: string
  initialQuery?: string
  onSelect: (value: string) => void
  onCancel: () => void
  active: boolean
}

export function OptionPicker({
  title,
  subtitle,
  options,
  filterable = false,
  filterPlaceholder = 'type to filter',
  initialQuery = '',
  onSelect,
  onCancel,
  active,
}: Props): React.ReactElement | null {
  const [selected, setSelected] = useState(0)
  const [query, setQuery] = useState(initialQuery)

  useEffect(() => {
    setQuery(initialQuery)
  }, [initialQuery])

  const visibleOptions = useMemo(() => {
    if (!filterable) return options
    const lower = query.trim().toLowerCase()
    if (!lower) return options
    return options.filter((option) =>
      option.label.toLowerCase().includes(lower)
      || option.value.toLowerCase().includes(lower)
      || option.description?.toLowerCase().includes(lower),
    )
  }, [filterable, options, query])

  useEffect(() => {
    if (visibleOptions.length === 0) {
      setSelected(0)
      return
    }
    if (selected >= visibleOptions.length) {
      setSelected(visibleOptions.length - 1)
    }
  }, [selected, visibleOptions.length])

  const pageStart = visibleOptions.length <= MAX_VISIBLE_OPTIONS
    ? 0
    : Math.min(
        Math.max(0, selected - Math.floor(MAX_VISIBLE_OPTIONS / 2)),
        visibleOptions.length - MAX_VISIBLE_OPTIONS,
      )
  const pageOptions = visibleOptions.slice(pageStart, pageStart + MAX_VISIBLE_OPTIONS)

  useInput(
    (input, key) => {
      if (!active) return

      if (filterable) {
        if (key.backspace || key.delete) {
          setQuery((prev) => prev.slice(0, -1))
          return
        }
        if (!key.ctrl && !key.meta && !key.tab && !key.escape && !key.return && !key.upArrow && !key.downArrow && input) {
          setQuery((prev) => prev + input)
          return
        }
      } else {
        const quickPick = input === '0' ? 10 : Number.parseInt(input, 10)
        if (Number.isInteger(quickPick) && quickPick >= 1 && quickPick <= pageOptions.length) {
          onSelect(pageOptions[quickPick - 1]!.value)
          return
        }
      }

      if (key.upArrow) {
        if (visibleOptions.length === 0) return
        setSelected((prev) => (prev - 1 + visibleOptions.length) % visibleOptions.length)
        return
      }
      if (key.downArrow) {
        if (visibleOptions.length === 0) return
        setSelected((prev) => (prev + 1) % visibleOptions.length)
        return
      }
      if (key.return) {
        if (visibleOptions.length === 0) return
        onSelect(visibleOptions[selected]!.value)
        return
      }
      if (key.escape) {
        onCancel()
      }
    },
    { isActive: active },
  )

  if (!active) return null

  return (
    <PickerFrame
      title={title}
      subtitle={subtitle}
      footer={
        filterable
          ? 'type to filter · arrows to browse · enter to select · esc to cancel'
          : 'arrows to browse · enter to select · esc to cancel · 1-9,0 quick pick'
      }
    >
      {filterable ? (
        <Box marginBottom={1}>
          <Text dimColor>{`${filterPlaceholder}: `}</Text>
          <Text>{query || ' '}</Text>
        </Box>
      ) : null}

      {visibleOptions.length === 0 ? (
        <Box>
          <Text dimColor>no matches</Text>
        </Box>
      ) : null}

      {visibleOptions.length > 0 && pageStart > 0 ? (
        <Box>
          <Text dimColor>{`  ↑ ${pageStart} more`}</Text>
        </Box>
      ) : null}

      {pageOptions.map((option, index) => {
        const optionIndex = pageStart + index
        const quickPickLabel = index === 9 ? '0' : String(index + 1)
        const isSelected = optionIndex === selected
        return (
          <Box key={`${option.value}-${optionIndex}`} flexDirection="column" marginBottom={option.description ? 1 : 0}>
            <Box>
              <Text color={isSelected ? 'cyan' : 'gray'}>{isSelected ? '▸ ' : '  '}</Text>
              <Text color={isSelected ? 'cyan' : 'white'} bold={isSelected}>
                {`${quickPickLabel}. ${option.label}`}
              </Text>
            </Box>
            {option.description ? (
              <Box marginLeft={5}>
                <Text dimColor>{option.description}</Text>
              </Box>
            ) : null}
          </Box>
        )
      })}

      {visibleOptions.length > 0 && pageStart + pageOptions.length < visibleOptions.length ? (
        <Box>
          <Text dimColor>{`  ↓ ${visibleOptions.length - pageStart - pageOptions.length} more`}</Text>
        </Box>
      ) : null}
    </PickerFrame>
  )
}
