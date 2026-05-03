/**
 * Banner - Orca Blackfin Signal startup identity.
 *
 * Top: ORCA-AGENT display wordmark
 * Bottom: Bordered signal deck with session details
 */

import React from 'react'
import { Box, Text } from 'ink'
import { useTheme } from '../theme.js'
import { useTerminalSize } from '../useTerminalSize.js'
import { truncateLabel, truncateSessionId } from '../utils.js'
import { getHomeLayout } from './homeLayout.js'

const ORCA_WORDMARK_LINES = [
  ' ██████╗ ██████╗  ██████╗ █████╗        █████╗  ██████╗ ███████╗███╗   ██╗████████╗',
  '██╔═══██╗██╔══██╗██╔════╝██╔══██╗      ██╔══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝',
  '██║   ██║██████╔╝██║     ███████║█████╗███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║   ',
  '██║   ██║██╔══██╗██║     ██╔══██║╚════╝██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║   ',
  '╚██████╔╝██║  ██║╚██████╗██║  ██║      ██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║   ',
  ' ╚═════╝ ╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝      ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝   ',
]

const ORCA_ART_WIDTH = ORCA_WORDMARK_LINES.reduce((max, line) => Math.max(max, line.length), 0)

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

  const showArt = shouldRenderBannerArt(layout.frameWidth)

  const rows: Array<[string, string]> = []
  if (model) rows.push(['MODEL', model])
  rows.push(['DIRECTORY', shortCwd])
  if (permMode) rows.push(['TRUST', permMode === 'yolo' ? 'Full Access' : permMode === 'plan' ? 'Plan Mode' : 'Auto'])
  if (toolCount) {
    const toolStr = hookCount ? `${toolCount} tools · ${hookCount} hooks` : `${toolCount} tools`
    rows.push(['TOOLS', toolStr])
  }
  if (configFiles && configFiles.length > 0) {
    rows.push(['CONFIG', configFiles.join(', ')])
  }
  if (sessionId) {
    rows.push(['SESSION', truncateSessionId(sessionId)])
  }

  let fleetLine: string | null = null
  try {
    const { getFleetSummaryLine } = require('../../fleet-env.js') as { getFleetSummaryLine: () => string | null }
    fleetLine = getFleetSummaryLine()
  } catch {}
  if (fleetLine) rows.push(['FLEET', fleetLine])

  const labelWidth = rows.reduce((max, [label]) => Math.max(max, label.length), 0) + 1
  const bodyValueWidth = Math.max(24, layout.frameWidth - 4 - labelWidth)

  return (
    <Box flexDirection="column" marginBottom={1} marginLeft={layout.offset}>
      {showArt ? (
        <Box flexDirection="column">
          {ORCA_WORDMARK_LINES.map((line, i) => {
            const color = i < 2 ? theme.warning : i < 5 ? theme.accent : theme.accentDim
            return <Text key={i} color={color} bold>{line}</Text>
          })}
        </Box>
      ) : null}

      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.accent}
        width={layout.frameWidth}
        marginTop={showArt ? 1 : 0}
        paddingLeft={1}
        paddingRight={1}
      >
        <Box marginBottom={1} justifyContent="center">
          <Text color={theme.warning} bold>{`Orca Agent v${version}`}</Text>
          <Text dimColor> · </Text>
          <Text color={theme.accent} bold>Blackfin Signal</Text>
        </Box>
        <Box flexDirection="column">
          <Box flexDirection="column" flexGrow={1}>
            <Text color={theme.warning} bold>Available Surface</Text>
            {rows.map(([label, value], i) => (
              <Box key={i}>
                <Text color={theme.accentDim}>{label.padEnd(labelWidth)}</Text>
                <Text color={label === 'MODEL' ? theme.model : theme.text}>{truncateLabel(value, bodyValueWidth)}</Text>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>
    </Box>
  )
}

function abbreviatePath(p: string): string {
  const home = process.env.HOME || process.env.USERPROFILE || ''
  if (home && p.startsWith(home)) return '~' + p.slice(home.length)
  return p
}
