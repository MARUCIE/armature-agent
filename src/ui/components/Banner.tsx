/**
 * Banner — Orca art + Codex-style bordered session info.
 *
 * Top: Swimming orca pixel art (animated)
 * Bottom: Bordered info box with session details (Codex-style)
 */

import React, { useState, useEffect } from 'react'
import { Box, Text } from 'ink'
import { useTheme } from '../theme.js'
import { useTerminalSize } from '../useTerminalSize.js'
import { truncateSessionId } from '../utils.js'
import { getHomeLayout } from './homeLayout.js'

// Orca pixel art (compact version — 8 lines)
const ORCA_LINES = [
  '            \u2584\u2584',
  '          \u2584\u2588\u2588\u2588\u2588\u2584',
  '    \u2584\u2584\u2584\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2584\u2584\u2584',
  '  \u2584\u2588\u2588\u2588\u25D5 \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2584',
  ' \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2584',
  '  \u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2580',
  '     \u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2588\u2588\u2588\u2580\u2584\u2588\u2580',
  '          \u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2580\u2588\u2588\u2588\u2580',
]

const ORCA_ART_WIDTH = ORCA_LINES.reduce((max, line) => Math.max(max, line.length), 0)

export function shouldRenderBannerArt(frameWidth: number): boolean {
  return frameWidth >= ORCA_ART_WIDTH
}

interface Props {
  version: string
  cwd: string
  configFiles?: string[]
  toolCount?: number
  hookCount?: number
  model?: string
  permMode?: string
  sessionId?: string
}

export function Banner({ version, cwd, configFiles, toolCount, hookCount, model, permMode, sessionId }: Props): React.ReactElement {
  const { cols } = useTerminalSize()
  const theme = useTheme()
  const layout = getHomeLayout(cols)
  const shortCwd = abbreviatePath(cwd)

  // Swim animation
  const totalFrames = 16
  const [frame, setFrame] = useState(0)
  useEffect(() => {
    if (frame >= totalFrames) return
    const timer = setTimeout(() => setFrame(f => f + 1), 50)
    return () => clearTimeout(timer)
  }, [frame])

  const progress = Math.min(1, frame / totalFrames)
  const ease = 1 - Math.pow(1 - progress, 3)
  const showArt = shouldRenderBannerArt(layout.frameWidth)
  const maxDrift = showArt ? Math.max(0, layout.frameWidth - ORCA_ART_WIDTH) : 0
  const drift = Math.round(maxDrift * (1 - ease))

  // Info rows
  const rows: Array<[string, string]> = []
  if (model) rows.push(['Model:', model])
  rows.push(['Directory:', shortCwd])
  if (permMode) rows.push(['Permissions:', permMode === 'yolo' ? 'Full Access' : permMode === 'plan' ? 'Plan Mode' : 'Auto'])
  if (toolCount) {
    const toolStr = hookCount ? `${toolCount} tools \u00B7 ${hookCount} hooks` : `${toolCount} tools`
    rows.push(['Tools:', toolStr])
  }
  if (configFiles && configFiles.length > 0) {
    rows.push(['Config:', configFiles.join(', ')])
  }
  if (sessionId) {
    rows.push(['Session:', truncateSessionId(sessionId)])
  }

  let fleetLine: string | null = null
  try {
    const { getFleetSummaryLine } = require('../../fleet-env.js') as { getFleetSummaryLine: () => string | null }
    fleetLine = getFleetSummaryLine()
  } catch {}
  if (fleetLine) rows.push(['Fleet:', fleetLine])

  const labelWidth = rows.reduce((max, [label]) => Math.max(max, label.length), 0) + 1

  return (
    <Box flexDirection="column" marginBottom={1} marginLeft={layout.offset}>
      {showArt ? (
        <Box flexDirection="column">
          {ORCA_LINES.map((line, i) => {
            const wave = Math.round(Math.sin((frame / totalFrames) * Math.PI * 3 + i * 0.4) * 2 * (1 - progress))
            const pad = Math.max(0, Math.min(maxDrift, drift + wave))
            return <Text key={i} color={theme.accent}>{' '.repeat(pad)}{line}</Text>
          })}
        </Box>
      ) : null}

      {/* Codex-style info box */}
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.accent}
        width={layout.frameWidth}
        marginTop={showArt ? 1 : 0}
        paddingLeft={1}
        paddingRight={1}
      >
        <Box marginBottom={1}>
          <Text color={theme.accent} bold>{'>_ '}</Text>
          <Text bold>Orca CLI</Text>
          <Text dimColor> (v{version})</Text>
        </Box>
        {rows.map(([label, value], i) => (
          <Box key={i}>
            <Text dimColor>{label.padEnd(labelWidth)}</Text>
            <Text>{value}</Text>
          </Box>
        ))}
      </Box>
    </Box>
  )
}

function abbreviatePath(p: string): string {
  const home = process.env.HOME || process.env.USERPROFILE || ''
  if (home && p.startsWith(home)) return '~' + p.slice(home.length)
  return p
}
