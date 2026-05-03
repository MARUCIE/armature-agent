/**
 * TurnSummary — compact post-turn proof wake display.
 *
 * Shows: elapsed · token flow · tools · cost · throughput
 */

import React from 'react'
import { Box, Text } from 'ink'
import type { TurnSummaryInfo } from '../types.js'
import { useTheme } from '../theme.js'

interface Props {
  info: TurnSummaryInfo
}

function fmtTok(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n)
}

export function TurnSummary({ info }: Props): React.ReactElement {
  const theme = useTheme()
  const sec = (info.duration / 1000).toFixed(1)
  const cost = info.costUsd >= 0.01 ? `$${info.costUsd.toFixed(2)}` : `$${info.costUsd.toFixed(4)}`
  const tokPerSec = info.duration > 0 ? Math.round((info.outputTokens / info.duration) * 1000) : 0

  return (
    <Box marginLeft={2}>
      <Text color={theme.accentDim} bold>PROOF WAKE</Text>
      <Text dimColor>
        {' '}time {sec}s · in {fmtTok(info.inputTokens)} · out {fmtTok(info.outputTokens)} · tools {info.toolCalls} · {cost} · {tokPerSec} tok/s
      </Text>
    </Box>
  )
}
