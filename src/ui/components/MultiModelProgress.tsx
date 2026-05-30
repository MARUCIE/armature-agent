/**
 * MultiModelProgress — live progress for council/race/pipeline commands.
 *
 * Shows each model's status (thinking/done) with elapsed time.
 */

import React from 'react'
import { Box, Text } from 'ink'
import Spinner from 'ink-spinner'
import type { ModelProgress } from '../types.js'
import { useTheme } from '../theme.js'

interface Props {
  command: string
  models: ModelProgress[]
}

export function MultiModelProgress({ command, models }: Props): React.ReactElement {
  const theme = useTheme()

  return (
    <Box flexDirection="column" marginLeft={2}>
      <Box>
        <Text color={theme.accentToolBlock} bold>  ◆ council </Text>
        <Text color={theme.accent} bold>{command}</Text>
        <Text dimColor> · {models.length} voices</Text>
      </Box>
      {models.map((m) => (
        <Box key={m.model} marginLeft={2}>
          {m.done ? (
            <Text color={theme.success}>  surfaced </Text>
          ) : (
            <Text color={theme.accent}>
              <Spinner type="dots" /> sonar{' '}
            </Text>
          )}
          <Text color={m.done ? theme.text : theme.model}>{m.model.length > 20 ? m.model.slice(0, 18) + '..' : m.model}</Text>
          <Text dimColor> · {(m.elapsedMs / 1000).toFixed(1)}s</Text>
        </Box>
      ))}
    </Box>
  )
}
