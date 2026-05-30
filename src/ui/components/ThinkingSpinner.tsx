/**
 * ThinkingSpinner — Grok Build-style thinking indicator.
 *
 * Renders a spinner + "Thinking" header in accent_thinking, with an elapsed
 * timer. Keeps orca's stalled-intensity color shift (accent → warning → error)
 * on the spinner as wait grows, and respects reduced motion.
 * See doc/GROK_UI_REFERENCE.md §2 (thinking block).
 */

import React, { useState, useEffect } from 'react'
import { Box, Text } from 'ink'
import Spinner from 'ink-spinner'
import { useTheme } from '../theme.js'

/** stalledIntensity: spinner color shifts as the wait grows. */
function getStalledColor(theme: ReturnType<typeof useTheme>, elapsed: number): string {
  if (elapsed < 10) return theme.accentThinking  // Normal
  if (elapsed < 30) return theme.warning           // Getting slow
  return theme.error                               // Very slow
}

// Respect reduced motion preference
const reducedMotion = process.env.REDUCE_MOTION === '1' ||
  process.env.REDUCE_MOTION === 'true' ||
  process.env.NO_MOTION === '1'

interface Props {
  active: boolean
}

export function ThinkingSpinner({ active }: Props): React.ReactElement | null {
  const [elapsed, setElapsed] = useState(0)
  const theme = useTheme()

  useEffect(() => {
    if (!active) {
      setElapsed(0)
      return
    }
    const start = Date.now()
    const timer = setInterval(() => {
      setElapsed(Math.round((Date.now() - start) / 1000))
    }, 1000)
    return () => clearInterval(timer)
  }, [active])

  if (!active) return null

  const spinnerColor = getStalledColor(theme, elapsed)

  return (
    <Box>
      {reducedMotion ? (
        <Text color={spinnerColor}>{'◆'}</Text>
      ) : (
        <Text color={spinnerColor}>
          <Spinner type="dots" />
        </Text>
      )}
      <Text color={theme.accentThinking} bold> Thinking</Text>
      <Text dimColor> ({elapsed}s)</Text>
    </Box>
  )
}
