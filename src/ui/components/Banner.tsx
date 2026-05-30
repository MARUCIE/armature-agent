/**
 * Banner — Grok Build-style minimal welcome.
 *
 * No giant ASCII wordmark. A single left-accent-line block (grok's signature
 * block visual language) holding a compact identity header + signal rows.
 * See doc/GROK_UI_REFERENCE.md §2.
 */

import React from 'react'
import { Box, Text } from 'ink'
import { useTheme } from '../theme.js'
import { useTerminalSize } from '../useTerminalSize.js'
import { truncateLabel, truncateSessionId } from '../utils.js'
import { getHomeLayout } from './homeLayout.js'

/** Width at/above which the expanded (subtitle) welcome header is shown. */
const WIDE_WELCOME_WIDTH = 82

/**
 * Whether the wide welcome header (with subtitle) fits. Retained for layout
 * tests; grok's welcome has no ASCII art, so this now gates the subtitle only.
 */
export function shouldRenderBannerArt(frameWidth: number): boolean {
  return frameWidth >= WIDE_WELCOME_WIDTH
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
  const wide = shouldRenderBannerArt(layout.frameWidth)

  const rows: Array<[string, string]> = []
  if (model) rows.push(['model', model])
  rows.push(['directory', shortCwd])
  if (permMode) rows.push(['trust', permMode === 'yolo' ? 'Full Access' : permMode === 'plan' ? 'Plan Mode' : 'Auto'])
  if (toolCount) {
    const toolStr = hookCount ? `${toolCount} tools · ${hookCount} hooks` : `${toolCount} tools`
    rows.push(['tools', toolStr])
  }
  if (configFiles && configFiles.length > 0) {
    rows.push(['config', configFiles.join(', ')])
  }
  if (sessionId) {
    rows.push(['session', truncateSessionId(sessionId)])
  }

  let fleetLine: string | null = null
  try {
    const { getFleetSummaryLine } = require('../../fleet-env.js') as { getFleetSummaryLine: () => string | null }
    fleetLine = getFleetSummaryLine()
  } catch {}
  if (fleetLine) rows.push(['fleet', fleetLine])

  const labelWidth = rows.reduce((max, [label]) => Math.max(max, label.length), 0) + 1
  const bodyValueWidth = Math.max(24, layout.frameWidth - 4 - labelWidth)

  // Grok block: a left vertical accent line, content padded to its right.
  return (
    <Box flexDirection="column" marginBottom={1} marginLeft={layout.offset}>
      <Box
        flexDirection="column"
        borderStyle="single"
        borderTop={false}
        borderRight={false}
        borderBottom={false}
        borderLeft
        borderColor={theme.accentUser}
        width={layout.frameWidth}
        paddingLeft={1}
      >
        {/* Identity header — no box, no wordmark */}
        <Box>
          <Text color={theme.accent} bold>Orca</Text>
          <Text color={theme.dim}>{`  v${version}`}</Text>
          {wide ? <Text color={theme.muted}>{'   provider-neutral agent runtime'}</Text> : null}
        </Box>

        {/* Signal rows */}
        <Box flexDirection="column" marginTop={1}>
          {rows.map(([label, value], i) => (
            <Box key={i}>
              <Text color={theme.accentSystem}>{label.padEnd(labelWidth)}</Text>
              <Text color={label === 'model' ? theme.model : theme.text}>{truncateLabel(value, bodyValueWidth)}</Text>
            </Box>
          ))}
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
