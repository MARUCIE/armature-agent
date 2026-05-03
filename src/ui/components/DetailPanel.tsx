import React from 'react'
import { Box } from 'ink'
import type { DetailPanelInfo } from '../types.js'
import { useTheme } from '../theme.js'
import { PickerFrame } from './PickerFrame.js'
import { MarkdownText } from './MarkdownText.js'

interface Props {
  info: DetailPanelInfo
}

export function DetailPanel({ info }: Props): React.ReactElement {
  const theme = useTheme()
  const borderColor = info.tone === 'error' ? theme.error : info.tone === 'warn' ? theme.warning : theme.border
  const title = `EVIDENCE DRAWER · ${info.title}`
  const subtitle = info.subtitle ? `pod scan · ${info.subtitle}` : 'pod scan'

  return (
    <Box marginLeft={2} marginBottom={1}>
      <PickerFrame title={title} subtitle={subtitle} borderColor={borderColor}>
        <MarkdownText>{info.body}</MarkdownText>
      </PickerFrame>
    </Box>
  )
}
