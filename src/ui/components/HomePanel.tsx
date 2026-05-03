import React from 'react'
import { Box, Text } from 'ink'
import type { StatusInfo } from '../types.js'
import { useTerminalSize } from '../useTerminalSize.js'
import { useTheme } from '../theme.js'
import { truncateSessionId } from '../utils.js'
import { PickerFrame } from './PickerFrame.js'
import { getHomeLayout } from './homeLayout.js'
import { getSlashCommandHomeDescription } from '../../slash-commands.js'

interface Props {
  status: StatusInfo
  toolCount?: number
  hookCount?: number
  savedSessionCount?: number
}

function formatPermissionState(status: StatusInfo): string {
  const source = status.permSource ? ` (${status.permSource})` : ''
  if (status.permMode === 'plan') return `Plan${source} · approve every tool`
  if (status.permMode === 'yolo') return `YOLO${source} · bypass prompts`
  return `Auto${source} · prompt on dangerous tools`
}

export function HomePanel({ status, toolCount, hookCount, savedSessionCount }: Props): React.ReactElement {
  const theme = useTheme()
  const { cols } = useTerminalSize()
  const layout = getHomeLayout(cols)
  const sessionLabel = status.sessionId ? truncateSessionId(status.sessionId) : 'none attached yet'

  return (
    <Box marginLeft={layout.offset} marginTop={1} marginBottom={1} flexDirection="column">
      <PickerFrame
        title="POD BRIEF"
        subtitle="Give the pod one clear outcome; Orca gathers proof before edits"
        footer="Natural language works best. Press Tab for pod actions."
        borderColor={theme.accent}
        width={layout.primaryWidth}
        marginLeft={0}
      >
        <Box flexDirection="column">
          <Text bold color={theme.text}>Tell Orca the outcome; the pod handles plan, tools, and evidence.</Text>
          <Text color={theme.accentDim}>Brief the pod:</Text>
          <Text color={theme.accent}>  review the changed files and name the release risk</Text>
          <Text color={theme.accent}>  debug the failing tests with evidence before edits</Text>
          <Text color={theme.accent}>  map this repo, then identify the risky boundaries</Text>
        </Box>
      </PickerFrame>

      <Box flexDirection={layout.split ? 'row' : 'column'}>
        <PickerFrame
          title="POD SIGNAL"
          subtitle="Current run posture before delegation."
          width={layout.leftColumnWidth}
          marginLeft={0}
          borderColor={theme.border}
        >
          <Text><Text color={theme.accentDim}>TRUST </Text>{formatPermissionState(status)}</Text>
          <Text><Text color={theme.accentDim}>MODE  </Text>{`${status.behaviorMode || 'default'} · effort ${status.effort || 'high'}`}</Text>
          <Text><Text color={theme.accentDim}>MODEL </Text><Text color={theme.model}>{status.model}</Text></Text>
          <Text><Text color={theme.accentDim}>SID   </Text>{sessionLabel}</Text>
          {toolCount ? <Text><Text color={theme.accentDim}>TOOLS </Text>{`${toolCount}${hookCount ? ` · ${hookCount} hooks` : ''}`}</Text> : null}
        </PickerFrame>

        {layout.split ? <Box width={layout.gap} /> : null}

        <PickerFrame
          title="RECOVER"
          subtitle="Shortest paths when you need state, proof, or routing."
          width={layout.rightColumnWidth}
          marginLeft={0}
          borderColor={theme.border}
        >
          <Text><Text color={theme.accent}>orca -c</Text><Text dimColor> continue the latest saved session</Text></Text>
          {savedSessionCount ? (
            <Text><Text color={theme.accent}>/sessions</Text><Text dimColor>{` inspect ${savedSessionCount} saved session${savedSessionCount === 1 ? '' : 's'}`}</Text></Text>
          ) : null}
          <Text><Text color={theme.accent}>/permissions</Text><Text dimColor>{` ${getSlashCommandHomeDescription('/permissions')}`}</Text></Text>
          <Text><Text color={theme.accent}>/doctor</Text><Text dimColor>{` ${getSlashCommandHomeDescription('/doctor')}`}</Text></Text>
          <Text><Text color={theme.accent}>/models</Text><Text dimColor>{` ${getSlashCommandHomeDescription('/models')}`}</Text></Text>
          <Text><Text color={theme.accent}>/evidence</Text><Text dimColor>{` ${getSlashCommandHomeDescription('/evidence')}`}</Text></Text>
        </PickerFrame>
      </Box>

      <PickerFrame
        title="GUARDRAILS"
        subtitle="Clear next actions for common dead ends."
        width={layout.primaryWidth}
        marginLeft={0}
        borderColor={theme.warning}
      >
        <Text><Text color={theme.warning}>Need a safer posture?</Text><Text dimColor> /permissions set plan</Text></Text>
        <Text><Text color={theme.warning}>No useful output or provider confusion?</Text><Text dimColor>{` /doctor or /providers (${getSlashCommandHomeDescription('/providers')})`}</Text></Text>
        <Text><Text color={theme.warning}>Need to recover context?</Text><Text dimColor> /compact or orca -c</Text></Text>
        <Text><Text color={theme.warning}>Want the full command surface?</Text><Text dimColor>{` /help (${getSlashCommandHomeDescription('/help')})`}</Text></Text>
      </PickerFrame>
    </Box>
  )
}
