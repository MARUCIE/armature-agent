/**
 * PermissionPrompt — approval surface for tool calls that need user consent.
 *
 * Shows the tool preview plus once/session/project persistence actions.
 */

import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { PickerFrame } from './PickerFrame.js'
import type { PermissionDecisionScope } from '../types.js'

interface Props {
  toolName: string
  preview: string
  onResolve: (decision: { allowed: boolean; scope: PermissionDecisionScope }) => void
  active: boolean
}

export function PermissionPrompt({ toolName, preview, onResolve, active }: Props): React.ReactElement | null {
  const [selected, setSelected] = useState<0 | 1 | 2 | 3>(0)
  const choices: Array<{ label: string; description: string; decision: { allowed: boolean; scope: PermissionDecisionScope } }> = [
    { label: 'Allow once', description: 'run this tool call now', decision: { allowed: true, scope: 'once' } },
    { label: 'Allow session', description: 'remember this action for this session', decision: { allowed: true, scope: 'session' } },
    { label: 'Allow project', description: 'persist this action in project policy', decision: { allowed: true, scope: 'project' } },
    { label: 'Deny', description: 'block this action', decision: { allowed: false, scope: 'once' } },
  ]

  useInput(
    (input, key) => {
      if (!active) return
      const ch = input.toLowerCase()
      if (key.return) {
        onResolve(choices[selected]!.decision)
      } else if (key.escape) {
        onResolve({ allowed: false, scope: 'once' })
      } else if (ch === 'y') {
        onResolve({ allowed: true, scope: 'once' })
      } else if (ch === 'n') {
        onResolve({ allowed: false, scope: 'once' })
      } else if (ch === '1') {
        onResolve(choices[0]!.decision)
      } else if (ch === '2') {
        onResolve(choices[1]!.decision)
      } else if (ch === '3') {
        onResolve(choices[2]!.decision)
      } else if (ch === '4') {
        onResolve(choices[3]!.decision)
      } else if (key.upArrow || key.leftArrow) {
        setSelected((prev) => ((prev - 1 + choices.length) % choices.length) as 0 | 1 | 2 | 3)
      } else if (key.downArrow || key.rightArrow) {
        setSelected((prev) => ((prev + 1) % choices.length) as 0 | 1 | 2 | 3)
      }
    },
    { isActive: active },
  )

  if (!active) return null

  return (
    <Box marginTop={1}>
      <PickerFrame
        title={`Allow ${toolName}?`}
        borderColor="yellow"
        footer="y allow · n deny · arrows move · enter confirm · esc cancel"
      >
        <Text dimColor>{preview}</Text>
        {choices.map((choice, index) => (
          <Box key={choice.label} marginTop={index === 0 ? 1 : 0}>
            <Text color={selected === index ? 'yellow' : 'gray'}>{selected === index ? '▸ ' : '  '}</Text>
            <Text color={choice.decision.allowed ? 'green' : 'red'} bold={selected === index}>
              {`${index + 1}. ${choice.label}`}
            </Text>
            <Text dimColor>  {choice.description}</Text>
          </Box>
        ))}
      </PickerFrame>
    </Box>
  )
}
