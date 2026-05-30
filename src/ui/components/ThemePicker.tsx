/**
 * ThemePicker — first-launch theme selection with live preview.
 *
 * Shows all available themes in a list. User navigates with arrows,
 * sees a live color preview for each theme. Press Enter to confirm.
 * Saves choice to ARMATURE_THEME in ~/.armature/config or env hint file.
 */

import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { PickerFrame } from './PickerFrame.js'

interface ThemeOption {
  id: string
  label: string
  accent: string
  mode: 'dark' | 'light'
  description: string
}

const THEMES: ThemeOption[] = [
  { id: 'groknight', label: 'GrokNight', accent: '#7D4BC6', mode: 'dark', description: 'Neutral gray base with brand accents (default)' },
  { id: 'grokday', label: 'GrokDay', accent: '#6C3EB2', mode: 'light', description: 'Light theme for bright terminals' },
  { id: 'tokyonight', label: 'TokyoNight', accent: '#BB9AF7', mode: 'dark', description: 'Blue-tinted Tokyo Night palette' },
  { id: 'rosepine-moon', label: 'RosePineMoon', accent: '#C4A7E7', mode: 'dark', description: 'Warm muted Rose Pine palette' },
  { id: 'armature', label: 'Blackfin', accent: '#F6C945', mode: 'dark', description: 'Armature legacy amber echolocation accents' },
  { id: 'default', label: 'Default', accent: 'cyan', mode: 'dark', description: 'Cyan accents on dark background' },
  { id: 'dark', label: 'Dark', accent: 'green', mode: 'dark', description: 'Matrix green on dark background' },
  { id: 'ocean', label: 'Ocean', accent: 'blue', mode: 'dark', description: 'Deep blue on dark background' },
  { id: 'warm', label: 'Warm', accent: 'yellow', mode: 'dark', description: 'Golden yellow on dark background' },
  { id: 'mono', label: 'Mono', accent: 'white', mode: 'dark', description: 'Clean monochrome on dark background' },
  { id: 'light', label: 'Light', accent: 'blue', mode: 'light', description: 'Blue accents for light terminals' },
]

interface Props {
  onSelect: (themeId: string) => void
  active: boolean
}

export function ThemePicker({ onSelect, active }: Props): React.ReactElement {
  const [selected, setSelected] = useState(0)

  useInput(
    (_input, key) => {
      if (key.upArrow) {
        setSelected(prev => (prev - 1 + THEMES.length) % THEMES.length)
        return
      }
      if (key.downArrow) {
        setSelected(prev => (prev + 1) % THEMES.length)
        return
      }
      if (key.return) {
        onSelect(THEMES[selected]!.id)
        return
      }
      if (key.escape) {
        onSelect('groknight')
        return
      }
    },
    { isActive: active },
  )

  const current = THEMES[selected]!

  return (
    <PickerFrame
      title="Choose a theme"
      subtitle="GrokNight is the default. Browse with arrows, confirm with enter"
      borderColor={current.accent}
      widthLimit={56}
    >
      {THEMES.map((t, i) => (
        <Box key={t.id}>
          <Text color={i === selected ? t.accent : 'gray'}>
            {i === selected ? '\u25B8 ' : '  '}
          </Text>
          <Text color={i === selected ? t.accent : 'gray'} bold={i === selected}>
            {t.label.padEnd(10)}
          </Text>
          <Text dimColor={i !== selected}>
            {t.description}
          </Text>
        </Box>
      ))}

      {/* Live preview */}
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>Preview:</Text>
        <Box>
          <Text color={current.accent} bold>{'>_ '}</Text>
          <Text color={current.accent}>{'\u2588\u2588\u2588\u2588'}</Text>
          <Text dimColor> accent </Text>
          <Text color="green">{'\u2588\u2588'}</Text>
          <Text dimColor> ok </Text>
          <Text color="red">{'\u2588\u2588'}</Text>
          <Text dimColor> error </Text>
          <Text color="yellow">{'\u2588\u2588'}</Text>
          <Text dimColor> warn</Text>
        </Box>
        <Box>
          <Text inverse color={current.accent}>{` ${current.label} \u2502 model \u2502 ${'█'.repeat(4)}${'░'.repeat(4)} 50% `}</Text>
        </Box>
      </Box>
    </PickerFrame>
  )
}
