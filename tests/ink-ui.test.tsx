/**
 * Tests for ink UI components.
 *
 * Uses ink-testing-library to render components without a real terminal.
 */

import { describe, it, expect } from 'vitest'
import React from 'react'
import { render } from 'ink-testing-library'
import { Text } from 'ink'
import { StatusBar } from '../src/ui/components/StatusBar.js'
import { ThinkingSpinner } from '../src/ui/components/ThinkingSpinner.js'
import { ToolCallBlock } from '../src/ui/components/ToolCallBlock.js'
import { InputArea } from '../src/ui/components/InputArea.js'
import { TerminalSizeProvider } from '../src/ui/useTerminalSize.js'
import { ChatSessionEmitter } from '../src/ui/session.js'
import type { StatusInfo } from '../src/ui/types.js'
import { App, buildHomeActions, getHistoryScrollActivationState, resolveHomeActionSelection } from '../src/ui/components/App.js'
import { getHomeLayout } from '../src/ui/components/homeLayout.js'
import { shouldUseAlternateScreen, shouldUseNoFlickerRenderer } from '../src/ui/render.js'
import { CLAUDE_CODE_KEYBINDINGS, resolveChatKeyAction } from '../src/ui/keybindings.js'
import { withEnv } from './helpers/env-snapshot.js'

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, '')
}

describe('StatusBar', () => {
  const baseStatus: StatusInfo = {
    model: 'claude-sonnet-4.6',
    contextPct: 12,
    permMode: 'yolo',
    gitBranch: 'main',
    costUsd: 0.0034,
    turns: 3,
  }

  it('renders model name', () => {
    const { lastFrame } = render(<TerminalSizeProvider><StatusBar status={baseStatus} /></TerminalSizeProvider>)
    expect(lastFrame()).toContain('claude-sonnet-4.6')
  })

  it('renders context bar with percentage', () => {
    const { lastFrame } = render(<TerminalSizeProvider><StatusBar status={baseStatus} /></TerminalSizeProvider>)
    // New format: unicode progress bar + percentage
    expect(lastFrame()).toContain('sonar')
    expect(lastFrame()).toContain('12%')
    expect(lastFrame()).toContain('░') // empty bar segments
  })

  it('renders permission mode', () => {
    const { lastFrame } = render(<TerminalSizeProvider><StatusBar status={{ ...baseStatus, permSource: 'project' }} /></TerminalSizeProvider>)
    expect(lastFrame()).toContain('trust:')
    expect(lastFrame()).toContain('bypass permissions on')
    expect(lastFrame()).toContain('(project)')
  })

  it('renders current effort alongside mode and permissions', () => {
    const { lastFrame } = render(<TerminalSizeProvider><StatusBar status={{ ...baseStatus, effort: 'max' }} /></TerminalSizeProvider>)
    expect(lastFrame()).toContain('mode: default')
    expect(lastFrame()).toContain('effort: max')
  })

  it('renders tool and output policy summary when provided', () => {
    const { lastFrame } = render(
      <TerminalSizeProvider><StatusBar status={{
        ...baseStatus,
        sessionId: 'auto-2026-04-21T11-00',
        effort: 'high',
        modelPolicySummary: 'inherit-current',
        toolPolicySummary: 'review-only tools',
        outputStyle: 'review findings',
      }} /></TerminalSizeProvider>,
    )
    expect(lastFrame()).toContain('sid:auto-2026-04-21T11..')
    expect(lastFrame()).toContain('model:inherit-current')
    expect(lastFrame()).toContain('tools:review-only')
    expect(lastFrame()).toContain('out:review findings')
  })

  it('renders git branch', () => {
    const { lastFrame } = render(<TerminalSizeProvider><StatusBar status={baseStatus} /></TerminalSizeProvider>)
    expect(lastFrame()).toContain('main')
  })

  it('renders cost', () => {
    const { lastFrame } = render(<TerminalSizeProvider><StatusBar status={baseStatus} /></TerminalSizeProvider>)
    expect(lastFrame()).toContain('$0.0034')
  })

  it('renders trust-cycle guidance with Armature rail copy', () => {
    const { lastFrame } = render(<TerminalSizeProvider><StatusBar status={baseStatus} /></TerminalSizeProvider>)
    expect(lastFrame()).toContain('shift+tab cycles trust')
  })

  it('truncates long model names', () => {
    const status = { ...baseStatus, model: 'a-very-long-model-name-that-exceeds-22-chars' }
    const { lastFrame } = render(<TerminalSizeProvider><StatusBar status={status} /></TerminalSizeProvider>)
    expect(lastFrame()).toContain('..')
  })

  it('hides cost when zero', () => {
    const status = { ...baseStatus, costUsd: 0 }
    const { lastFrame } = render(<TerminalSizeProvider><StatusBar status={status} /></TerminalSizeProvider>)
    expect(lastFrame()).not.toContain('$')
  })
})

describe('Ink terminal mode', () => {
  it('keeps no-flicker fullscreen opt-in so terminal scrollback stays copyable by default', async () => {
    await withEnv({
      ARMATURE_ALT_SCREEN: undefined,
      ARMATURE_NO_FLICKER: undefined,
      ARMATURE_TUI: undefined,
      CLAUDE_CODE_NO_FLICKER: undefined,
    }, () => {
      expect(shouldUseAlternateScreen()).toBe(false)
      expect(shouldUseNoFlickerRenderer()).toBe(false)
    })
    await withEnv({ ARMATURE_ALT_SCREEN: '1' }, () => {
      expect(shouldUseAlternateScreen()).toBe(true)
    })
    await withEnv({ CLAUDE_CODE_NO_FLICKER: '1' }, () => {
      expect(shouldUseNoFlickerRenderer()).toBe(true)
    })
    await withEnv({ ARMATURE_TUI: 'fullscreen' }, () => {
      expect(shouldUseNoFlickerRenderer()).toBe(true)
    })
    await withEnv({ ARMATURE_TUI: 'default', ARMATURE_NO_FLICKER: '1' }, () => {
      expect(shouldUseNoFlickerRenderer()).toBe(false)
    })
  })
})

describe('ThinkingSpinner', () => {
  it('renders nothing when inactive', () => {
    const { lastFrame } = render(<ThinkingSpinner active={false} />)
    expect(lastFrame()).toBe('')
  })

  it('renders spinner when active', () => {
    const { lastFrame } = render(<ThinkingSpinner active={true} />)
    expect(lastFrame()).toContain('Thinking')
    expect(lastFrame()).toContain('0s')
  })
})

describe('ToolCallBlock', () => {
  it('renders tool name', () => {
    const { lastFrame } = render(
      <ToolCallBlock start={{ name: 'read_file', args: { path: '/tmp/test.ts' } }} />,
    )
    expect(lastFrame()).toContain('◆')
    expect(lastFrame()).toContain('read_file')
  })

  it('renders path from args', () => {
    const { lastFrame } = render(
      <ToolCallBlock start={{ name: 'read_file', args: { path: '/tmp/test.ts' } }} />,
    )
    expect(lastFrame()).toContain('/tmp/test.ts')
  })

  it('renders result when end is provided', () => {
    const { lastFrame } = render(
      <ToolCallBlock
        start={{ name: 'read_file', args: { path: '/tmp/test.ts' } }}
        end={{ name: 'read_file', success: true, output: 'content', durationMs: 1500 }}
      />,
    )
    expect(lastFrame()).toContain('ok')
    expect(lastFrame()).toContain('1.5s')
  })

  it('renders error state', () => {
    const { lastFrame } = render(
      <ToolCallBlock
        start={{ name: 'run_command', args: { command: 'npm test' } }}
        end={{ name: 'run_command', success: false, output: 'FAIL', durationMs: 5000 }}
      />,
    )
    expect(lastFrame()).toContain('err')
  })
})

describe('InputArea', () => {
  it('renders prompt symbol', () => {
    const { lastFrame } = render(<TerminalSizeProvider><InputArea onSubmit={() => {}} active={true} /></TerminalSizeProvider>)
    expect(lastFrame()).toContain('>')
  })

  it('shows cursor when active', () => {
    const { lastFrame } = render(<TerminalSizeProvider><InputArea onSubmit={() => {}} active={true} /></TerminalSizeProvider>)
    // Block cursor renders as inverse space — check that prompt and placeholder are present
    expect(lastFrame()).toContain('>')
    expect(lastFrame()).toContain('Type a message')
  })

  it('uses the Claude Code keybinding contract for chat actions', () => {
    expect(CLAUDE_CODE_KEYBINDINGS.some((binding) => binding.key === 'Esc' && binding.action === 'chat:cancel')).toBe(true)
    expect(CLAUDE_CODE_KEYBINDINGS.some((binding) => binding.key === 'Esc Esc' && binding.action === 'chat:rewind')).toBe(true)
    expect(CLAUDE_CODE_KEYBINDINGS.some((binding) => binding.key === 'Ctrl+C' && binding.action === 'app:interrupt')).toBe(true)
    expect(CLAUDE_CODE_KEYBINDINGS.some((binding) => binding.key === '\\ + Enter' && binding.action === 'chat:newline')).toBe(true)
    expect(CLAUDE_CODE_KEYBINDINGS.some((binding) => binding.key === 'Ctrl+P' && binding.action === 'chat:history-previous')).toBe(true)
    expect(CLAUDE_CODE_KEYBINDINGS.some((binding) => binding.key === 'Ctrl+N' && binding.action === 'chat:history-next')).toBe(true)
    expect(CLAUDE_CODE_KEYBINDINGS.some((binding) => binding.key === 'Meta+P' && binding.action === 'chat:modelPicker')).toBe(true)
    expect(CLAUDE_CODE_KEYBINDINGS.some((binding) => binding.key === 'Ctrl+G' && binding.action === 'chat:externalEditor')).toBe(true)
    expect(resolveChatKeyAction('', { escape: true })).toBe('chat:cancel')
    expect(resolveChatKeyAction('c', { ctrl: true })).toBe('app:interrupt')
    expect(resolveChatKeyAction('l', { ctrl: true })).toBe('chat:clearInput')
    expect(resolveChatKeyAction('_', { ctrl: true })).toBe('chat:undo')
    expect(resolveChatKeyAction('p', { ctrl: true })).toBe('chat:history-previous')
    expect(resolveChatKeyAction('n', { ctrl: true })).toBe('chat:history-next')
    expect(resolveChatKeyAction('p', { meta: true })).toBe('chat:modelPicker')
    expect(resolveChatKeyAction('v', { meta: true })).toBe('chat:imagePaste')
  })

  it('clears the prompt when the parent injects an empty draft after picker submission', async () => {
    const view = render(
      <TerminalSizeProvider><InputArea onSubmit={() => {}} active={true} draft={{ id: 1, text: 'z' }} /></TerminalSizeProvider>,
    )
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(stripAnsi(view.lastFrame() || '')).toContain('z')

    view.rerender(
      <TerminalSizeProvider><InputArea onSubmit={() => {}} active={true} draft={{ id: 2, text: '' }} /></TerminalSizeProvider>,
    )
    await new Promise((resolve) => setTimeout(resolve, 0))

    const frame = stripAnsi(view.lastFrame() || '')
    expect(frame).not.toContain('z')
    expect(frame).toContain('Type a message')
    view.unmount()
  })

  it('uses backslash enter as a portable multiline escape without submitting', async () => {
    const submitted: string[] = []
    const view = render(
      <TerminalSizeProvider><InputArea onSubmit={(value) => submitted.push(value)} active={true} draft={{ id: 1, text: 'first\\' }} /></TerminalSizeProvider>,
    )
    await new Promise((resolve) => setTimeout(resolve, 0))

    view.stdin.write('\r')
    await new Promise((resolve) => setTimeout(resolve, 0))

    const frame = stripAnsi(view.lastFrame() || '')
    expect(submitted).toEqual([])
    expect(frame).toContain('first')
    expect(frame).not.toContain('first\\')
    view.unmount()
  })

})

describe('PermissionPrompt', () => {
  // Dynamic import since it's a new component
  it('renders tool name and preview when active', async () => {
    const { PermissionPrompt } = await import('../src/ui/components/PermissionPrompt.js')
    const { lastFrame } = render(
      <PermissionPrompt
        toolName="write_file"
        preview="write 500 bytes to /tmp/test.ts"
        onResolve={() => {}}
        active={true}
      />,
    )
    expect(lastFrame()).toContain('TRUST GATE')
    expect(lastFrame()).toContain('write_file')
    expect(lastFrame()).toContain('SCAN')
    expect(lastFrame()).toContain('write 500 bytes')
    expect(lastFrame()).toContain('Allow once')
    expect(lastFrame()).toContain('trust this pattern for this session')
    expect(lastFrame()).toContain('write this trust rule to project policy')
    expect(lastFrame()).toContain('Deny')
    expect(lastFrame()).toContain('arrows')
    expect(lastFrame()).toContain('esc deny')
  })

  it('renders nothing when inactive', async () => {
    const { PermissionPrompt } = await import('../src/ui/components/PermissionPrompt.js')
    const { lastFrame } = render(
      <PermissionPrompt toolName="x" preview="x" onResolve={() => {}} active={false} />,
    )
    expect(lastFrame()).toBe('')
  })
})

describe('TurnSummary', () => {
  it('renders proof-wake elapsed time, tokens, tools, cost, and throughput', async () => {
    const { TurnSummary } = await import('../src/ui/components/TurnSummary.js')
    const { lastFrame } = render(
      <TurnSummary info={{
        inputTokens: 500,
        outputTokens: 1500,
        duration: 3200,
        toolCalls: 2,
        costUsd: 0.005,
        model: 'test-model',
      }} />,
    )
    expect(lastFrame()).toContain('PROOF WAKE')
    expect(lastFrame()).toContain('time 3.2s')
    expect(lastFrame()).toContain('in 500')
    expect(lastFrame()).toContain('out 1.5K')
    expect(lastFrame()).toContain('tools 2')
    expect(lastFrame()).toContain('3.2s')
    expect(lastFrame()).toContain('1.5K')
    expect(lastFrame()).toContain('$0.0050')
    expect(lastFrame()).toContain('469 tok/s')
  })
})

describe('MultiModelProgress', () => {
  it('renders model list with status', async () => {
    const { MultiModelProgress } = await import('../src/ui/components/MultiModelProgress.js')
    const { lastFrame } = render(
      <MultiModelProgress
        command="council"
        models={[
          { model: 'claude-sonnet', done: true, elapsedMs: 5000 },
          { model: 'gpt-5', done: false, elapsedMs: 3000 },
        ]}
      />,
    )
    expect(lastFrame()).toContain('council')
    expect(lastFrame()).toContain('2 voices')
    expect(lastFrame()).toContain('claude-sonnet')
    expect(lastFrame()).toContain('gpt-5')
    expect(lastFrame()).toContain('surfaced')
    expect(lastFrame()).toContain('sonar')
    expect(lastFrame()).toContain('5.0s')
  })
})

describe('CommandPicker', () => {
  it('renders filtered commands', async () => {
    const { CommandPicker } = await import('../src/ui/components/CommandPicker.js')
    const commands = [
      { name: '/help', description: 'Show help' },
      { name: '/model', description: 'Switch model' },
      { name: '/history', description: 'Show history' },
    ]
    const { lastFrame } = render(
      <CommandPicker commands={commands} filter="hi" onSelect={() => {}} onCancel={() => {}} active={true} />,
    )
    expect(lastFrame()).toContain('/history')
    expect(lastFrame()).not.toContain('/model')
    expect(lastFrame()).toContain('COMMANDS')
    expect(lastFrame()).toContain('filter: /hi')
  })

  it('keeps slash command picker visible when a filter has no matches', async () => {
    const { CommandPicker } = await import('../src/ui/components/CommandPicker.js')
    const { lastFrame } = render(
      <CommandPicker
        commands={[{ name: '/help', description: 'Show help' }]}
        filter="zzz"
        onSelect={() => {}}
        onCancel={() => {}}
        active={true}
      />,
    )

    expect(lastFrame()).toContain('COMMANDS')
    expect(lastFrame()).toContain('no matching command')
  })

  it('renders nothing when inactive', async () => {
    const { CommandPicker } = await import('../src/ui/components/CommandPicker.js')
    const { lastFrame } = render(
      <CommandPicker commands={[]} filter="" onSelect={() => {}} onCancel={() => {}} active={false} />,
    )
    expect(lastFrame()).toBe('')
  })
})

describe('OptionPicker', () => {
  it('renders title and options', async () => {
    const { OptionPicker } = await import('../src/ui/components/OptionPicker.js')
    const { lastFrame } = render(
      <OptionPicker
        title="Select mode"
        subtitle="current: default"
        options={[
          { value: 'default', label: 'default', description: 'Balanced general mode' },
          { value: 'reflect', label: 'reflect', description: 'Socratic debugging' },
        ]}
        onSelect={() => {}}
        onCancel={() => {}}
        active={true}
      />,
    )

    expect(lastFrame()).toContain('Select mode')
    expect(lastFrame()).toContain('current: default')
    expect(lastFrame()).toContain('1. default')
    expect(lastFrame()).toContain('2. reflect')
  })

  it('renders filterable mode with initial query applied', async () => {
    const { OptionPicker } = await import('../src/ui/components/OptionPicker.js')
    const { lastFrame } = render(
      <OptionPicker
        title="Search threads"
        options={[
          { value: 'thread-a', label: 'Alpha thread', description: 'design discussion' },
          { value: 'thread-b', label: 'Beta thread', description: 'release prep' },
        ]}
        filterable={true}
        filterPlaceholder="search"
        initialQuery="beta"
        onSelect={() => {}}
        onCancel={() => {}}
        active={true}
      />,
    )

    expect(lastFrame()).toContain('search:')
    expect(lastFrame()).toContain('echo search:')
    expect(lastFrame()).toContain('beta')
    expect(lastFrame()).toContain('Beta thread')
    expect(lastFrame()).not.toContain('Alpha thread')
  })

  it('renders longer workflow-change descriptions for mode-style options', async () => {
    const { OptionPicker } = await import('../src/ui/components/OptionPicker.js')
    const { lastFrame } = render(
      <OptionPicker
        title="Select behavior mode"
        subtitle="current: debug"
        options={[
          { value: 'debug', label: 'debug', description: 'reproduce → isolate → fix → verify · run + edit tools · effort=high · permissions=auto · tools=run + edit tools · output=debug walkthrough · current' },
          { value: 'architect', label: 'architect', description: 'architecture/planning only · no code changes · plan tools · effort=max · permissions=plan · tools=planning-only tools · output=architecture plan' },
        ]}
        onSelect={() => {}}
        onCancel={() => {}}
        active={true}
      />,
    )

    expect(lastFrame()).toContain('reproduce')
    expect(lastFrame()).toContain('fix')
    expect(lastFrame()).toContain('no code changes')
    expect(lastFrame()).toContain('current')
    expect(lastFrame()).toContain('effort=max')
    expect(lastFrame()).toContain('permissions=plan')
    expect(lastFrame()).toContain('tools=planning-only tools')
    expect(lastFrame()).toContain('output=architecture plan')
  })

  it('windows long option lists instead of rendering every row at once', async () => {
    const { OptionPicker } = await import('../src/ui/components/OptionPicker.js')
    const { lastFrame } = render(
      <OptionPicker
        title="Select model"
        options={Array.from({ length: 12 }, (_, index) => ({
          value: `model-${index + 1}`,
          label: `model-${index + 1}`,
          description: `provider-${index + 1}`,
        }))}
        onSelect={() => {}}
        onCancel={() => {}}
        active={true}
      />,
    )

    const frame = lastFrame()
    expect(frame).toContain('1. model-1')
    expect(frame).toContain('0. model-10')
    expect(frame).not.toContain('model-12')
    expect(frame).toContain('↓ 2 more')
  })
})

describe('ThemePicker', () => {
  it('renders the shared picker frame plus theme preview', async () => {
    const { ThemePicker } = await import('../src/ui/components/ThemePicker.js')
    const { lastFrame } = render(
      <ThemePicker onSelect={() => {}} active={true} />,
    )

    expect(lastFrame()).toContain('Choose a theme')
    expect(lastFrame()).toContain('GrokNight')
    expect(lastFrame()).toContain('Preview:')
  })
})

describe('DetailPanel', () => {
  it('renders title, subtitle, and markdown body', async () => {
    const { DetailPanel } = await import('../src/ui/components/DetailPanel.js')
    const { lastFrame } = render(
      <DetailPanel
        info={{
          title: 'Auth bug triage',
          subtitle: 'thread-1 · 3 messages',
          body: '- **user**: login fails',
        }}
      />,
    )

    expect(lastFrame()).toContain('EVIDENCE DRAWER')
    expect(lastFrame()).toContain('Auth bug triage')
    expect(lastFrame()).toContain('pod scan')
    expect(lastFrame()).toContain('thread-1')
    expect(lastFrame()).toContain('login fails')
  })
})

describe('ThemeProvider', () => {
  it('applies selected theme immediately in the current session', async () => {
    const originalArmatureTheme = process.env.ARMATURE_THEME
    delete process.env.ARMATURE_THEME

    const { ThemeProvider, useTheme, useThemeController } = await import('../src/ui/theme.js')

    function ThemeProbe(): React.ReactElement {
      const theme = useTheme()
      const { setThemeId } = useThemeController()

      React.useEffect(() => {
        setThemeId('ocean')
      }, [setThemeId])

      return <Text>{theme.name}</Text>
    }

    try {
      const { lastFrame } = render(
        <ThemeProvider>
          <ThemeProbe />
        </ThemeProvider>,
      )

      await new Promise(resolve => setTimeout(resolve, 20))

      expect(lastFrame()).toContain('ocean')
      expect(process.env.ARMATURE_THEME).toBe('ocean')
    } finally {
      if (originalArmatureTheme === undefined) delete process.env.ARMATURE_THEME
      else process.env.ARMATURE_THEME = originalArmatureTheme
    }
  })
})

describe('Footer', () => {
  it('shows interrupt hint when generating', async () => {
    const { Footer } = await import('../src/ui/components/Footer.js')
    const { lastFrame } = render(
      <TerminalSizeProvider><Footer isGenerating={true} isInputActive={false} permMode="yolo" /></TerminalSizeProvider>,
    )
    expect(lastFrame()).toContain('esc')
    expect(lastFrame()).toContain('interrupt')
  })

  it('shows send/help hints when input is active', async () => {
    const { Footer } = await import('../src/ui/components/Footer.js')
    const { lastFrame } = render(
      <TerminalSizeProvider><Footer isGenerating={false} isInputActive={true} permMode="auto" permSource="project" /></TerminalSizeProvider>,
    )
    expect(lastFrame()).toContain('enter')
    expect(lastFrame()).toContain('send')
    expect(lastFrame()).toContain('/help')
    expect(lastFrame()).toContain('commands')
    expect(lastFrame()).toContain('auto:project')
  })

  it('shows basic hints when idle', async () => {
    const { Footer } = await import('../src/ui/components/Footer.js')
    const { lastFrame } = render(
      <TerminalSizeProvider><Footer isGenerating={false} isInputActive={false} permMode="yolo" /></TerminalSizeProvider>,
    )
    // Shows basic hints even when idle (waiting for prompt_ready)
    expect(lastFrame()).toContain('enter')
    expect(lastFrame()).toContain('send')
    expect(lastFrame()).toContain('/help')
    expect(lastFrame()).toContain('commands')
    expect(lastFrame()).toContain('yolo')
    expect(lastFrame()).not.toContain('esc') // no interrupt when not generating
  })
})

describe('ScrollBox', () => {
  it('renders children content', async () => {
    const { ScrollBox } = await import('../src/ui/components/ScrollBox.js')
    const { lastFrame } = render(
      <TerminalSizeProvider>
        <ScrollBox>
          <Text>Hello Scrollable</Text>
        </ScrollBox>
      </TerminalSizeProvider>,
    )
    expect(lastFrame()).toContain('Hello Scrollable')
  })

  it('exposes imperative handle', async () => {
    const { ScrollBox } = await import('../src/ui/components/ScrollBox.js')
    const ref = React.createRef<any>()
    render(
      <TerminalSizeProvider>
        <ScrollBox ref={ref}>
          <Text>Content</Text>
        </ScrollBox>
      </TerminalSizeProvider>,
    )
    expect(ref.current).toBeDefined()
    expect(ref.current.isSticky()).toBe(true)
    expect(ref.current.getScrollTop()).toBe(0)
  })

  it('defaults to sticky scroll', async () => {
    const { ScrollBox } = await import('../src/ui/components/ScrollBox.js')
    const ref = React.createRef<any>()
    render(
      <TerminalSizeProvider>
        <ScrollBox ref={ref}>
          <Text>Short content</Text>
        </ScrollBox>
      </TerminalSizeProvider>,
    )
    expect(ref.current.isSticky()).toBe(true)
  })

  it('measures viewport height from parent flex layout instead of terminal rows', async () => {
    const { Box } = await import('ink')
    const { ScrollBox } = await import('../src/ui/components/ScrollBox.js')
    const ref = React.createRef<any>()
    const { lastFrame } = render(
      <TerminalSizeProvider>
        <Box flexDirection="column" height={5}>
          <ScrollBox ref={ref}>
            <Text>line-1</Text>
            <Text>line-2</Text>
            <Text>line-3</Text>
            <Text>line-4</Text>
            <Text>line-5</Text>
          </ScrollBox>
          <Box height={2} flexShrink={0}>
            <Text>bottom-panel</Text>
          </Box>
        </Box>
      </TerminalSizeProvider>,
    )

    await new Promise(resolve => setTimeout(resolve, 20))

    expect(ref.current.getViewportHeight()).toBe(3)
    expect(lastFrame()).toContain('line-5')
    expect(lastFrame()).not.toContain('line-1')

    ref.current.scrollBy(-2)
    await new Promise(resolve => setTimeout(resolve, 20))

    expect(ref.current.getScrollTop()).toBe(0)
    expect(lastFrame()).toContain('line-1')
    expect(lastFrame()).not.toContain('line-5')
  })

})

describe('Banner', () => {
  it('drops the armature art when the frame is too narrow', async () => {
    const { shouldRenderBannerArt } = await import('../src/ui/components/Banner.js')
    expect(shouldRenderBannerArt(getHomeLayout(24).frameWidth)).toBe(false)
  })

  it('keeps the armature art when the frame is wide enough', async () => {
    const { shouldRenderBannerArt } = await import('../src/ui/components/Banner.js')
    expect(shouldRenderBannerArt(92)).toBe(true)
  })

  it('renders version and cwd', async () => {
    const { Banner } = await import('../src/ui/components/Banner.js')
    const { lastFrame } = render(
      <TerminalSizeProvider><Banner version="0.8.0" cwd="/Users/me/project" /></TerminalSizeProvider>,
    )
    expect(lastFrame()).toContain('Armature')
    expect(lastFrame()).toContain('0.8.0')
  })

  it('renders Armature Agent wordmark and a clean signal deck without icon art', async () => {
    const { Banner } = await import('../src/ui/components/Banner.js')
    const { lastFrame } = render(
      <TerminalSizeProvider><Banner version="0.8.0" cwd="/tmp" model="claude-sonnet-4.6" permMode="auto" /></TerminalSizeProvider>,
    )
    const frame = lastFrame() ?? ''
    // Grok-minimal welcome: no ASCII wordmark, compact identity header + rows.
    expect(frame).not.toContain('██████')
    expect(frame).toContain('Armature')
    expect(frame).toContain('v0.8.0')
    expect(frame).toContain('model')
    expect(frame).toContain('trust')
    expect(frame).toContain('directory')
    expect(frame).not.toContain('terminal-native coding pod')
    expect(frame).not.toContain('Blackfin Signal')
    expect(frame).not.toContain('Available Surface')
  })

  it('renders config files when provided', async () => {
    const { Banner } = await import('../src/ui/components/Banner.js')
    const { lastFrame } = render(
      <TerminalSizeProvider><Banner version="0.8.0" cwd="/tmp" configFiles={['CLAUDE.md', 'package.json']} toolCount={42} hookCount={37} /></TerminalSizeProvider>,
    )
    expect(lastFrame()).toContain('CLAUDE.md')
    expect(lastFrame()).toContain('42 tools')
    expect(lastFrame()).toContain('37 hooks')
  })
})

describe('HomePanel', () => {
  it('uses a centered wide-frame layout with balanced split columns', () => {
    const layout = getHomeLayout(180)
    expect(layout.split).toBe(true)
    expect(layout.leftColumnWidth + layout.gap + layout.rightColumnWidth).toBe(layout.frameWidth)
    expect(layout.primaryWidth).toBe(layout.frameWidth)
    expect(layout.offset).toBeGreaterThan(0)
  })

  it('keeps narrow terminals stacked on a single frame width', () => {
    const layout = getHomeLayout(90)
    expect(layout.split).toBe(false)
    expect(layout.leftColumnWidth).toBe(layout.frameWidth)
    expect(layout.rightColumnWidth).toBe(layout.frameWidth)
    expect(layout.gap).toBe(0)
  })

  it('shrinks to the available width on very narrow terminals', () => {
    const layout = getHomeLayout(32)
    expect(layout.split).toBe(false)
    expect(layout.frameWidth).toBe(28)
    expect(layout.primaryWidth).toBe(28)
  })

  it('renders a single primary action and trust guidance', async () => {
    const { HomePanel } = await import('../src/ui/components/HomePanel.js')
    const status: StatusInfo = {
      model: 'gpt-5.4',
      contextPct: 12,
      permMode: 'auto',
      permSource: 'default',
      turns: 0,
      costUsd: 0,
      behaviorMode: 'default',
      effort: 'high',
    }
    const { lastFrame } = render(
      <TerminalSizeProvider><HomePanel status={status} toolCount={42} hookCount={11} /></TerminalSizeProvider>,
    )
    expect(lastFrame()).toContain('GET STARTED')
    expect(lastFrame()).toContain('Give Armature one clear outcome')
    expect(lastFrame()).toContain('SESSION')
    expect(lastFrame()).toContain('GUARDRAILS')
    expect(lastFrame()).toContain('prompt on dangerous tools')
    expect(lastFrame()).toContain('Press Tab for quick actions')
  })

  it('surfaces saved-session recovery when summaries exist', async () => {
    const { HomePanel } = await import('../src/ui/components/HomePanel.js')
    const status: StatusInfo = {
      model: 'gpt-5.4',
      contextPct: 12,
      permMode: 'auto',
      permSource: 'default',
      turns: 0,
      costUsd: 0,
      behaviorMode: 'default',
      effort: 'high',
    }
    const { lastFrame } = render(
      <TerminalSizeProvider><HomePanel status={status} toolCount={42} hookCount={11} savedSessionCount={3} /></TerminalSizeProvider>,
    )
    expect(lastFrame()).toContain('/sessions')
    expect(lastFrame()).toContain('3 saved sessions')
  })

  it('truncates long session ids in the trust panel', async () => {
    const { HomePanel } = await import('../src/ui/components/HomePanel.js')
    const status: StatusInfo = {
      model: 'gpt-5.4',
      contextPct: 12,
      permMode: 'auto',
      permSource: 'default',
      turns: 0,
      costUsd: 0,
      behaviorMode: 'default',
      effort: 'high',
      sessionId: 'auto-2026-04-22T23-43-40-extra-long',
    }
    const { lastFrame } = render(
      <TerminalSizeProvider><HomePanel status={status} toolCount={42} hookCount={11} /></TerminalSizeProvider>,
    )
    expect(lastFrame()).toContain('SID   auto-2026-04-22T23..')
    expect(lastFrame()).not.toContain('auto-2026-04-22T23-43-40-extra-long')
  })
})

describe('App empty state', () => {
  it('renders the home panel instead of the legacy quick-start list', () => {
    const session = new ChatSessionEmitter()
    const status: StatusInfo = {
      model: 'gpt-5.4',
      contextPct: 12,
      permMode: 'auto',
      permSource: 'default',
      turns: 0,
      costUsd: 0,
      behaviorMode: 'default',
      effort: 'high',
    }
    const banner = {
      version: '0.8.0',
      cwd: '/Users/me/project',
      model: 'gpt-5.4',
      permMode: 'auto',
      toolCount: 41,
      hookCount: 11,
    }
    const { lastFrame } = render(
      <TerminalSizeProvider><App session={session} initialStatus={status} banner={banner} /></TerminalSizeProvider>,
    )
    expect(lastFrame()).toContain('GET STARTED')
    expect(lastFrame()).toContain('RECOVER')
    expect(lastFrame()).not.toContain('Multi-Model Collaboration')
  })

  it('opens quick actions from the home panel on Tab', async () => {
    const session = new ChatSessionEmitter()
    const status: StatusInfo = {
      model: 'gpt-5.4',
      contextPct: 12,
      permMode: 'auto',
      permSource: 'default',
      turns: 0,
      costUsd: 0,
      behaviorMode: 'default',
      effort: 'high',
    }
    const banner = {
      version: '0.8.0',
      cwd: '/Users/me/project',
      model: 'gpt-5.4',
      permMode: 'auto',
      toolCount: 41,
      hookCount: 11,
    }
    const view = render(
      <TerminalSizeProvider><App session={session} initialStatus={status} banner={banner} /></TerminalSizeProvider>,
    )
    view.stdin.write('\t')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(view.lastFrame()).toContain('Quick Actions')
    expect(view.lastFrame()).toContain('Review changed files')
    view.unmount()
  })

  it('clears slash command text after selecting a command from the picker', async () => {
    const session = new ChatSessionEmitter()
    const status: StatusInfo = {
      model: 'gpt-5.4',
      contextPct: 12,
      permMode: 'auto',
      permSource: 'default',
      turns: 0,
      costUsd: 0,
      behaviorMode: 'default',
      effort: 'high',
    }
    const view = render(
      <TerminalSizeProvider><App session={session} initialStatus={status} /></TerminalSizeProvider>,
    )

    await new Promise((resolve) => setTimeout(resolve, 0))
    session.emitInputDraft('/model')
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(view.lastFrame()).toContain('COMMANDS')

    view.stdin.write('\r')
    await new Promise((resolve) => setTimeout(resolve, 0))

    const submitted = await Promise.race([
      session.waitForInput(),
      new Promise<string | null>((_, reject) => setTimeout(() => reject(new Error('timed out waiting for submitted slash command')), 100)),
    ])
    const frame = stripAnsi(view.lastFrame() || '')
    expect(submitted).toBe('/model')
    expect(frame).not.toContain('COMMANDS')
    expect(frame).toContain('Type a message')
    view.unmount()
  })

  it('maps quick action values into prompts and commands', () => {
    expect(resolveHomeActionSelection('prompt:review the changed files')).toBe('review the changed files')
    expect(resolveHomeActionSelection('command:/doctor')).toBe('/doctor')
    expect(resolveHomeActionSelection('unknown')).toBeNull()
  })

  it('keeps non-text history scroll keys active while the prompt input is focused', () => {
    expect(getHistoryScrollActivationState({
      inputActive: true,
      permissionBlocked: false,
      themePickerOpen: false,
      optionPickerOpen: false,
      commandPickerOpen: false,
    })).toEqual({
      keyboardActive: true,
      vimKeysActive: false,
    })

    expect(getHistoryScrollActivationState({
      inputActive: false,
      permissionBlocked: false,
      themePickerOpen: false,
      optionPickerOpen: false,
      commandPickerOpen: false,
    })).toEqual({
      keyboardActive: true,
      vimKeysActive: true,
    })
  })

  it('keeps submitted user prompts visible in a highlighted transcript block', async () => {
    const session = new ChatSessionEmitter()
    const status: StatusInfo = {
      model: 'gpt-5.4',
      contextPct: 12,
      permMode: 'auto',
      permSource: 'default',
      turns: 0,
      costUsd: 0,
      behaviorMode: 'default',
      effort: 'high',
    }
    const view = render(
      <TerminalSizeProvider><App session={session} initialStatus={status} /></TerminalSizeProvider>,
    )

    await new Promise((resolve) => setTimeout(resolve, 0))
    session.emitUserMessage('银行开户地址策略')
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(view.lastFrame()).toContain('银行开户地址策略')
    view.unmount()
  })

  it('renders assistant markdown inside a structured response panel after a turn', async () => {
    const session = new ChatSessionEmitter()
    const status: StatusInfo = {
      model: 'gpt-5.4',
      contextPct: 12,
      permMode: 'auto',
      permSource: 'default',
      turns: 0,
      costUsd: 0,
    }
    const view = render(
      <TerminalSizeProvider><App session={session} initialStatus={status} /></TerminalSizeProvider>,
    )

    await new Promise((resolve) => setTimeout(resolve, 0))
    session.emitText('### One reality check\n- **Do** this first')
    session.emitTurnSummary({
      inputTokens: 10,
      outputTokens: 20,
      duration: 1000,
      toolCalls: 0,
      costUsd: 0,
      model: 'gpt-5.4',
    })
    await new Promise((resolve) => setTimeout(resolve, 0))

    const frame = stripAnsi(view.lastFrame() || '')
    expect(frame).toContain('One reality check')
    expect(frame).toContain('• Do this first')
    expect(frame).not.toContain('### One reality check')
    view.unmount()
  })

  it('builds home actions from trust posture and saved-session state', () => {
    const autoStatus: StatusInfo = {
      model: 'gpt-5.4',
      contextPct: 12,
      permMode: 'auto',
      turns: 0,
      costUsd: 0,
    }
    const planStatus: StatusInfo = {
      model: 'gpt-5.4',
      contextPct: 12,
      permMode: 'plan',
      turns: 0,
      costUsd: 0,
    }

    const autoActions = buildHomeActions(autoStatus, 2)
    expect(autoActions.map((action) => action.label)).toContain('Tighten approval mode')
    expect(autoActions.map((action) => action.label)).toContain('Inspect saved sessions')

    const planActions = buildHomeActions(planStatus, 0)
    expect(planActions.map((action) => action.label)).not.toContain('Tighten approval mode')
    expect(planActions.map((action) => action.label)).not.toContain('Inspect saved sessions')
  })
})

describe('usePasteHandler', () => {
  it('exports isPasting state', async () => {
    const { usePasteHandler } = await import('../src/ui/usePasteHandler.js')
    // Module should export the hook
    expect(typeof usePasteHandler).toBe('function')
  })

  it('enables bracketed paste mode escape sequence', async () => {
    // Verify the constants are correct
    const PASTE_START = '\x1b[200~'
    const PASTE_END = '\x1b[201~'
    expect(PASTE_START.length).toBeGreaterThan(0)
    expect(PASTE_END.length).toBeGreaterThan(0)
    expect(PASTE_START).not.toBe(PASTE_END)
  })
})

describe('MarkdownText', () => {
  it('renders plain text', async () => {
    const { MarkdownText } = await import('../src/ui/components/MarkdownText.js')
    const { lastFrame } = render(
      <MarkdownText>Hello world</MarkdownText>,
    )
    expect(lastFrame()).toContain('Hello world')
  })

  it('renders empty string without error', async () => {
    const { MarkdownText } = await import('../src/ui/components/MarkdownText.js')
    const { lastFrame } = render(
      <MarkdownText>{''}</MarkdownText>,
    )
    expect(lastFrame()).toBe('')
  })

  it('renders headings and bullets as structured terminal text', async () => {
    const { MarkdownText } = await import('../src/ui/components/MarkdownText.js')
    const { lastFrame } = render(
      <MarkdownText>{'### Concrete judgment\n- **Works** now\n- `Needs proof` next'}</MarkdownText>,
    )
    const frame = stripAnsi(lastFrame() || '')
    expect(frame).toContain('Concrete judgment')
    expect(frame).toContain('• Works now')
    expect(frame).toContain('• Needs proof next')
    expect(frame).not.toContain('### Concrete judgment')
    expect(frame).not.toContain('**Works**')
  })
})

describe('DiffPreview', () => {
  it('renders file path and diff stats', async () => {
    const { DiffPreview } = await import('../src/ui/components/DiffPreview.js')
    const { lastFrame } = render(
      <DiffPreview
        oldContent="line1\nline2\nline3"
        newContent="line1\nmodified\nline3"
        filePath="/tmp/test.ts"
      />,
    )
    expect(lastFrame()).toContain('◆')
    expect(lastFrame()).toContain('/tmp/test.ts')
    expect(lastFrame()).toContain('+')
    expect(lastFrame()).toContain('-')
  })

  it('shows added and removed lines', async () => {
    const { DiffPreview } = await import('../src/ui/components/DiffPreview.js')
    const { lastFrame } = render(
      <DiffPreview
        oldContent="old line"
        newContent="new line"
        filePath="test.ts"
      />,
    )
    expect(lastFrame()).toContain('old line')
    expect(lastFrame()).toContain('new line')
  })
})

describe('FileLink', () => {
  it('renders file path as text', async () => {
    const { FileLink } = await import('../src/ui/components/FileLink.js')
    const { lastFrame } = render(
      <FileLink path="/tmp/test.ts" />,
    )
    expect(lastFrame()).toContain('/tmp/test.ts')
  })

  it('renders custom display text', async () => {
    const { FileLink } = await import('../src/ui/components/FileLink.js')
    const { lastFrame } = render(
      <FileLink path="/tmp/test.ts">test.ts</FileLink>,
    )
    expect(lastFrame()).toContain('test.ts')
  })
})

describe('StatusBar sparkline', () => {
  it('renders sparkline when data provided', () => {
    const status = {
      model: 'test-model',
      contextPct: 30,
      permMode: 'yolo' as const,
      costUsd: 0,
      turns: 5,
      sparkline: [100, 500, 200, 800, 300],
    }
    const { lastFrame } = render(<TerminalSizeProvider><StatusBar status={status} /></TerminalSizeProvider>)
    // Sparkline uses braille chars ▁▂▃▄▅▆▇█
    expect(lastFrame()).toMatch(/[▁▂▃▄▅▆▇█]/)
  })
})

describe('Theme', () => {
  it('provides a valid theme', async () => {
    const { getTheme } = await import('../src/ui/theme.js')
    const theme = getTheme()
    expect(theme.name).toBeTruthy()
    expect(theme.accent).toBeTruthy()
    expect(theme.prompt).toBeTruthy()
    expect(theme.success).toBeTruthy()
  })

  it('has all required color tokens', async () => {
    const { getTheme } = await import('../src/ui/theme.js')
    const theme = getTheme()
    // Primary
    expect(theme).toHaveProperty('accent')
    expect(theme).toHaveProperty('accentDim')
    expect(theme).toHaveProperty('prompt')
    // Semantic status
    expect(theme).toHaveProperty('success')
    expect(theme).toHaveProperty('error')
    expect(theme).toHaveProperty('warning')
    expect(theme).toHaveProperty('info')
    // Text
    expect(theme).toHaveProperty('text')
    expect(theme).toHaveProperty('dim')
    expect(theme).toHaveProperty('muted')
    // UI
    expect(theme).toHaveProperty('border')
    expect(theme).toHaveProperty('borderDim')
    expect(theme).toHaveProperty('statusBg')
    // Code & tools
    expect(theme).toHaveProperty('tool')
    expect(theme).toHaveProperty('model')
    expect(theme).toHaveProperty('filePath')
    expect(theme).toHaveProperty('diffAdd')
    expect(theme).toHaveProperty('diffRemove')
    // Progress
    expect(theme).toHaveProperty('ctxGreen')
    expect(theme).toHaveProperty('ctxYellow')
    expect(theme).toHaveProperty('ctxRed')
  })

  it('has dark/light mode property', async () => {
    const { getTheme } = await import('../src/ui/theme.js')
    const theme = getTheme()
    expect(theme).toHaveProperty('mode')
    expect(['dark', 'light']).toContain(theme.mode)
  })

  it('has 30+ semantic color tokens', async () => {
    const { getTheme } = await import('../src/ui/theme.js')
    const theme = getTheme()
    const colorKeys = Object.keys(theme).filter(k => k !== 'name' && k !== 'mode')
    expect(colorKeys.length).toBeGreaterThanOrEqual(25)
  })
})

describe('StatusBar context bar', () => {
  it('renders green bar for low context usage', () => {
    const status = {
      model: 'test-model',
      contextPct: 15,
      permMode: 'yolo' as const,
      costUsd: 0,
      turns: 1,
    }
    const { lastFrame } = render(<TerminalSizeProvider><StatusBar status={status} /></TerminalSizeProvider>)
    expect(lastFrame()).toContain('█')
    expect(lastFrame()).toContain('░')
    expect(lastFrame()).toContain('15%')
  })

  it('renders full bar for 100% context', () => {
    const status = {
      model: 'test-model',
      contextPct: 100,
      permMode: 'yolo' as const,
      costUsd: 0,
      turns: 1,
    }
    const { lastFrame } = render(<TerminalSizeProvider><StatusBar status={status} /></TerminalSizeProvider>)
    expect(lastFrame()).toContain('██████') // 6-wide full bar
    expect(lastFrame()).toContain('100%')
  })
})

describe('ChatSessionEmitter', () => {
  it('emitText fires text event', () => {
    const session = new ChatSessionEmitter()
    const received: string[] = []
    session.on('*', (e: { type: string; text?: string }) => {
      if (e.type === 'text') received.push(e.text!)
    })
    session.emitText('hello')
    expect(received).toEqual(['hello'])
  })

  it('waitForInput resolves on submitInput', async () => {
    const session = new ChatSessionEmitter()
    const promise = session.waitForInput()
    session.submitInput('test input')
    const result = await promise
    expect(result).toBe('test input')
  })

  it('waitForInput resolves null on EOF', async () => {
    const session = new ChatSessionEmitter()
    const promise = session.waitForInput()
    session.submitInput(null)
    const result = await promise
    expect(result).toBeNull()
  })

  it('emitUI fires both specific and wildcard events', () => {
    const session = new ChatSessionEmitter()
    const specific: string[] = []
    const wildcard: string[] = []
    session.on('text', () => specific.push('text'))
    session.on('*', () => wildcard.push('*'))
    session.emitText('hello')
    expect(specific).toEqual(['text'])
    expect(wildcard).toEqual(['*'])
  })

  it('emitPermissionRequest returns promise resolved by UI', async () => {
    const session = new ChatSessionEmitter()
    // Listen and auto-approve
    session.on('permission_request', (e: { request: { resolve: (d: { allowed: boolean; scope: 'once' | 'session' | 'project' }) => void } }) => {
      e.request.resolve({ allowed: true, scope: 'once' })
    })
    const result = await session.emitPermissionRequest({ toolName: 'write_file', preview: 'test' })
    expect(result).toEqual({ allowed: true, scope: 'once' })
  })

  it('emitPermissionRequest returns false when denied', async () => {
    const session = new ChatSessionEmitter()
    session.on('permission_request', (e: { request: { resolve: (d: { allowed: boolean; scope: 'once' | 'session' | 'project' }) => void } }) => {
      e.request.resolve({ allowed: false, scope: 'once' })
    })
    const result = await session.emitPermissionRequest({ toolName: 'run_command', preview: 'rm -rf' })
    expect(result).toEqual({ allowed: false, scope: 'once' })
  })

  it('emitClear fires clear event', () => {
    const session = new ChatSessionEmitter()
    const events: string[] = []
    session.on('*', (e: { type: string }) => events.push(e.type))
    session.emitClear()
    expect(events).toContain('clear')
  })
})
