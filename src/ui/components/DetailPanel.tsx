import React from 'react'
import { Box } from 'ink'
import type { DetailPanelInfo } from '../types.js'
import { PickerFrame } from './PickerFrame.js'
import { MarkdownText } from './MarkdownText.js'

interface Props {
  info: DetailPanelInfo
}

export function DetailPanel({ info }: Props): React.ReactElement {
  const borderColor = info.tone === 'error' ? 'red' : info.tone === 'warn' ? 'yellow' : 'cyan'

  return (
    <Box marginLeft={2} marginBottom={1}>
      <PickerFrame title={info.title} subtitle={info.subtitle} borderColor={borderColor}>
        <MarkdownText>{info.body}</MarkdownText>
      </PickerFrame>
    </Box>
  )
}
