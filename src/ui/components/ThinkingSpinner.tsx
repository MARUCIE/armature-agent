/**
 * ThinkingSpinner — animated indicator during model thinking/generation.
 *
 * Orca transcript features:
 * - Compact pod/status verbs rotating every 4 seconds
 * - stalledIntensity: color shifts accent → warning → error as wait grows
 * - Reduced motion: respects REDUCE_MOTION env var (static indicator)
 * - Elapsed timer with smooth animation
 */

import React, { useState, useEffect } from 'react'
import { Box, Text } from 'ink'
import Spinner from 'ink-spinner'
import { useTheme } from '../theme.js'

const VERBS = [
  'Listening', 'Echoing', 'Triangulating', 'Scanning', 'Mapping',
  'Routing', 'Verifying', 'Checking proof', 'Reading context', 'Tracking signal',
  'Aligning tools', 'Inspecting state', 'Surfacing evidence', 'Following current',
  'Holding pattern', 'Gathering bearings', 'Testing route', 'Closing loop',
]

function pickVerb(): string {
  return VERBS[Math.floor(Math.random() * VERBS.length)]!
}

/** stalledIntensity: how long before the spinner looks "stalled" */
function getStalledColor(theme: ReturnType<typeof useTheme>, elapsed: number): string {
  if (elapsed < 10) return theme.accent      // Normal: accent color
  if (elapsed < 30) return theme.warning      // Getting slow: warning
  return theme.error                           // Very slow: error/red
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
  const [verb, setVerb] = useState(pickVerb)
  const theme = useTheme()

  useEffect(() => {
    if (!active) {
      setElapsed(0)
      return
    }
    const start = Date.now()
    setVerb(pickVerb())
    const timer = setInterval(() => {
      const secs = Math.round((Date.now() - start) / 1000)
      setElapsed(secs)
      // Change verb every 4 seconds for visual interest
      if (secs > 0 && secs % 4 === 0) setVerb(pickVerb())
    }, 1000)
    return () => clearInterval(timer)
  }, [active])

  if (!active) return null

  const spinnerColor = getStalledColor(theme, elapsed)

  return (
    <Box>
      {reducedMotion ? (
        <Text color={spinnerColor}>{'>'}</Text>
      ) : (
        <Text color={spinnerColor}>
          <Spinner type="dots" />
        </Text>
      )}
      <Text color={spinnerColor}> POD {verb}...</Text>
      <Text dimColor> ({elapsed}s)</Text>
    </Box>
  )
}
