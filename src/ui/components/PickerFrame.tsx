import React from 'react'
import { Box, Text } from 'ink'
import { useTerminalSize } from '../useTerminalSize.js'

interface Props {
  title: string
  subtitle?: string
  footer?: string
  borderColor?: string
  widthLimit?: number
  width?: number
  marginLeft?: number
  children: React.ReactNode
}

export function PickerFrame({
  title,
  subtitle,
  footer,
  borderColor = 'cyan',
  widthLimit = 88,
  width,
  marginLeft = 2,
  children,
}: Props): React.ReactElement {
  const { cols } = useTerminalSize()
  const resolvedWidth = width ?? Math.min(Math.max(cols - 4, 40), widthLimit)

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={borderColor}
      width={resolvedWidth}
      marginLeft={marginLeft}
      paddingLeft={1}
      paddingRight={1}
      marginBottom={1}
    >
      <Box marginBottom={subtitle ? 0 : 1}>
        <Text bold>{title}</Text>
      </Box>
      {subtitle ? (
        <Box marginBottom={1}>
          <Text dimColor>{subtitle}</Text>
        </Box>
      ) : null}

      {children}

      {footer ? (
        <Box marginTop={1}>
          <Text dimColor>{footer}</Text>
        </Box>
      ) : null}
    </Box>
  )
}
