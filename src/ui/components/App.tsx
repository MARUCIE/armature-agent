/**
 * InkApp — root component for Orca CLI's terminal UI.
 *
 * Layout (flexbox column, full terminal height):
 *   ┌─────────────────────────────────┐
 *   │  Output Area (flexGrow=1)       │  ← scrollable content
 *   │  streaming text, tool calls     │
 *   ├─────────────────────────────────┤
 *   │  > input area                   │  ← user input
 *   ├─────────────────────────────────┤
 *   │  model · ctx · mode · branch    │  ← fixed status bar (inverse)
 *   └─────────────────────────────────┘
 */

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { mkdirSync, writeFileSync } from 'node:fs'
import { Box, Text, useInput } from 'ink'
import type { ChatSessionEmitter } from '../session.js'
import { hasConfiguredThemePreference, useTheme, useThemeController } from '../theme.js'
import type { UIEvent, StatusInfo, TurnSummaryInfo, ToolStartInfo, ToolEndInfo, ModelProgress, DetailPanelInfo } from '../types.js'
import { StatusBar } from './StatusBar.js'
import { InputArea } from './InputArea.js'
import { ThinkingSpinner } from './ThinkingSpinner.js'
import { ToolCallBlock } from './ToolCallBlock.js'
import { TurnSummary } from './TurnSummary.js'
import { PermissionPrompt } from './PermissionPrompt.js'
import { MultiModelProgress } from './MultiModelProgress.js'
import { Footer } from './Footer.js'
import { MarkdownText } from './MarkdownText.js'
import { Banner } from './Banner.js'
import { DetailPanel } from './DetailPanel.js'
import { CommandPicker } from './CommandPicker.js'
import { OptionPicker } from './OptionPicker.js'
import { DiffPreview } from './DiffPreview.js'
import { HomePanel } from './HomePanel.js'
import { ThemePicker } from './ThemePicker.js'
import { ScrollBox } from './ScrollBox.js'
import type { ScrollBoxHandle } from './ScrollBox.js'
import { useMouseWheel } from '../useMouseWheel.js'
import { getCommandPickerFilter, shouldShowCommandPicker, truncateLabel } from '../utils.js'
import { listSlashCommandPickerItems } from '../../slash-commands.js'

const SLASH_COMMANDS = listSlashCommandPickerItems()

export function resolveHomeActionSelection(value: string): string | null {
  if (value.startsWith('prompt:')) return value.slice('prompt:'.length)
  if (value.startsWith('command:')) return value.slice('command:'.length)
  return null
}

export function buildHomeActions(status: StatusInfo, savedSessionCount = 0): Array<{ value: string; label: string; description: string }> {
  const actions = [
    { value: 'prompt:review the changed files', label: 'Review changed files', description: 'Start with a concrete review prompt' },
    { value: 'prompt:debug the failing tests', label: 'Debug failing tests', description: 'Drop straight into a high-signal debugging ask' },
  ]

  if (status.permMode !== 'plan') {
    actions.push({
      value: 'command:/permissions',
      label: 'Tighten approval mode',
      description: 'Inspect or move into a stricter trust posture',
    })
  }

  if (savedSessionCount > 0) {
    actions.push({
      value: 'command:/sessions',
      label: 'Inspect saved sessions',
      description: `Review ${savedSessionCount} saved session${savedSessionCount === 1 ? '' : 's'} before starting fresh`,
    })
  }

  actions.push({
    value: 'command:/doctor',
    label: 'Run doctor',
    description: 'Check config, provider, and runtime health',
  })

  return actions
}

export interface BannerInfo {
  version: string
  cwd: string
  configFiles?: string[]
  toolCount?: number
  hookCount?: number
  model?: string
  permMode?: string
  sessionId?: string
  savedSessionCount?: number
}

interface Props {
  session: ChatSessionEmitter
  initialStatus: StatusInfo
  banner?: BannerInfo
}

/** A completed output block (static, won't re-render) */
interface OutputBlock {
  id: string
  type: 'assistant' | 'user' | 'tool' | 'system' | 'detail'
  content: string
  toolStart?: ToolStartInfo
  toolEnd?: ToolEndInfo
  level?: 'info' | 'warn' | 'error'
  detailInfo?: DetailPanelInfo
}

function UserPromptBlock({ content }: { content: string }): React.ReactElement {
  const theme = useTheme()
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.prompt}
      paddingX={1}
      marginY={1}
      width="100%"
    >
      <Text color={theme.prompt} bold>You</Text>
      <Text>{content}</Text>
    </Box>
  )
}

function AssistantMessageBlock({ content, streaming = false }: { content: string; streaming?: boolean }): React.ReactElement {
  const theme = useTheme()
  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={streaming ? theme.accent : theme.borderDim}
      paddingX={1}
      marginY={1}
      width="100%"
    >
      <Box>
        <Text color={theme.accent} bold>ORCA</Text>
        {streaming ? <Text color={theme.dim}> streaming</Text> : null}
      </Box>
      <MarkdownText>{content}</MarkdownText>
    </Box>
  )
}

/** Active tool call with animated spinner — lives outside <Static> so it can re-render */
function ActiveToolCall({ start, startTime }: { start: ToolStartInfo; startTime: number }): React.ReactElement {
  const [elapsed, setElapsed] = useState(0)
  const theme = useTheme()
  useEffect(() => {
    const timer = setInterval(() => setElapsed(Date.now() - startTime), 100)
    return () => clearInterval(timer)
  }, [startTime])

  const label = start.label || summarizeToolArgs(start.args)
  const shortLabel = truncateLabel(label)

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderLeft
      borderRight={false}
      borderTop={false}
      borderBottom={false}
      borderColor={theme.accent}
      paddingLeft={1}
      marginLeft={1}
    >
      <Box>
        <Text color={theme.tool} bold>{start.name}</Text>
        {shortLabel ? <Text dimColor> {shortLabel}</Text> : null}
      </Box>
      <Box>
        <Text color={theme.accent}>{'⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'[Math.floor(elapsed / 80) % 10]}</Text>
        <Text dimColor> {(elapsed / 1000).toFixed(1)}s</Text>
      </Box>
    </Box>
  )
}

function summarizeToolArgs(args: Record<string, unknown>): string {
  if ('path' in args) return String(args.path)
  if ('command' in args) {
    const cmd = String(args.command)
    return cmd.length > 50 ? cmd.slice(0, 47) + '...' : cmd
  }
  if ('query' in args) return String(args.query).slice(0, 50)
  return ''
}

export function App({ session, initialStatus, banner }: Props): React.ReactElement {
  const theme = useTheme()
  const { setThemeId } = useThemeController()

  // State
  const [status, setStatus] = useState<StatusInfo>(initialStatus)
  const [blocks, setBlocks] = useState<OutputBlock[]>([])
  const [streamingText, setStreamingText] = useState('')
  const [thinking, setThinking] = useState(false)
  // Start active — user can type immediately, don't wait for prompt_ready
  const [inputActive, setInputActive] = useState(true)
  const [inputHistory, setInputHistory] = useState<string[]>([])
  const [lastTurnSummary, setLastTurnSummary] = useState<TurnSummaryInfo | null>(null)
  const [permRequest, setPermRequest] = useState<{
    toolName: string; preview: string; resolve: (decision: { allowed: boolean; scope: 'once' | 'session' | 'project' }) => void
    diff?: { filePath: string; oldContent: string; newContent: string }
  } | null>(null)
  const [optionPickerRequest, setOptionPickerRequest] = useState<{
    title: string
    subtitle?: string
    options: Array<{ value: string; label: string; description?: string }>
    filterable?: boolean
    filterPlaceholder?: string
    initialQuery?: string
    resolve: (value: string | null) => void
  } | null>(null)
  const [multiModelState, setMultiModelState] = useState<{ command: string; models: ModelProgress[] } | null>(null)
  const [activeTool, setActiveTool] = useState<{ id: string; start: ToolStartInfo; startTime: number } | null>(null)
  const [inputValue, setInputValue] = useState('')
  // Theme picker: show on first launch if ORCA_THEME not set
  const [showThemePicker, setShowThemePicker] = useState(() => !hasConfiguredThemePreference())

  // Command picker state
  // Only show the picker for actual slash-command prefixes, not absolute paths.
  const showPicker = shouldShowCommandPicker(inputValue, SLASH_COMMANDS)
  const pickerFilter = getCommandPickerFilter(inputValue)

  // ScrollBox ref for imperative scroll control
  const scrollRef = useRef<ScrollBoxHandle>(null)

  // Mouse wheel → ScrollBox.scrollBy
  useMouseWheel({
    isActive: true,
    onWheel: useCallback((delta: number) => {
      scrollRef.current?.scrollBy(delta)
    }, []),
  })

  // Batched text streaming: accumulate tokens, flush at 20fps
  const textBuffer = useRef('')
  const flushTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    flushTimer.current = setInterval(() => {
      if (textBuffer.current) {
        setStreamingText(prev => prev + textBuffer.current)
        textBuffer.current = ''
      }
    }, 50) // 20fps
    return () => {
      if (flushTimer.current) clearInterval(flushTimer.current)
    }
  }, [])

  // Subscribe to session events
  useEffect(() => {
    const blockId = () => `b${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

    const handler = (event: UIEvent) => {
      switch (event.type) {
        case 'text':
          textBuffer.current += event.text
          break

        case 'user_message':
          setBlocks(b => [...b, { id: blockId(), type: 'user', content: event.text }])
          break

        case 'thinking_start':
          setThinking(true)
          break

        case 'thinking_end':
          setThinking(false)
          break

        case 'tool_start':
          // Flush any pending streaming text as a block
          setStreamingText(prev => {
            if (prev) {
              setBlocks(b => [...b, { id: blockId(), type: 'assistant', content: prev }])
            }
            return ''
          })
          // Keep active tool in dynamic area (not Static) so spinner animates
          setActiveTool({ id: blockId(), start: event.info, startTime: Date.now() })
          break

        case 'tool_end':
          // Move completed tool from active area into Static blocks
          setActiveTool(prev => {
            if (prev) {
              setBlocks(b => [...b, { id: prev.id, type: 'tool', content: '', toolStart: prev.start, toolEnd: event.info }])
            }
            return null
          })
          break

        case 'status_update':
          setStatus(event.info)
          break

        case 'system_message':
          setBlocks(b => [...b, { id: blockId(), type: 'system', content: event.text, level: event.level }])
          break

        case 'detail_panel':
          setBlocks(b => [...b, { id: blockId(), type: 'detail', content: '', detailInfo: event.info }])
          break

        case 'turn_summary': {
          // Flush both textBuffer and streamingText (textBuffer may have unflushed tokens)
          const turnRemaining = textBuffer.current
          textBuffer.current = ''
          setStreamingText(prev => {
            const allText = prev + turnRemaining
            if (allText) {
              setBlocks(b => [...b, { id: blockId(), type: 'assistant', content: allText }])
            }
            return ''
          })
          setLastTurnSummary(event.info)
          break
        }

        case 'prompt_ready': {
          // Flush both textBuffer and streamingText
          const promptRemaining = textBuffer.current
          textBuffer.current = ''
          setStreamingText(prev => {
            const allText = prev + promptRemaining
            if (allText) {
              setBlocks(b => [...b, { id: blockId(), type: 'assistant', content: allText }])
            }
            return ''
          })
          setInputActive(true)
          setMultiModelState(null)
          break
        }

        case 'permission_request':
          setPermRequest({
            toolName: event.request.toolName,
            preview: event.request.preview,
            diff: event.request.diff,
            resolve: (decision) => {
              event.request.resolve(decision)
              setPermRequest(null)
            },
          })
          break

        case 'option_picker_request':
          setOptionPickerRequest({
            title: event.request.title,
            subtitle: event.request.subtitle,
            options: event.request.options,
            filterable: event.request.filterable,
            filterPlaceholder: event.request.filterPlaceholder,
            initialQuery: event.request.initialQuery,
            resolve: (value) => {
              event.request.resolve(value)
              setOptionPickerRequest(null)
            },
          })
          setInputActive(false)
          break

        case 'multi_model_progress':
          setMultiModelState({ command: event.command, models: event.models })
          break

        case 'multi_model_result':
          setMultiModelState(prev => {
            if (!prev) return null
            return {
              ...prev,
              models: prev.models.map(m =>
                m.model === event.model ? { ...m, done: true, elapsedMs: event.elapsedMs, output: event.output } : m,
              ),
            }
          })
          break

        case 'session_end': {
          const si = event.info
          const dur = (si.totalDuration / 1000).toFixed(0)
          const tokens = si.totalInputTokens + si.totalOutputTokens
          const cost = si.totalCostUsd > 0
            ? (si.totalCostUsd < 0.01 ? `${(si.totalCostUsd * 100).toFixed(1)}c` : `$${si.totalCostUsd.toFixed(2)}`)
            : ''
          const summary = [`${si.turns} turns · ${tokens.toLocaleString()} tokens · ${dur}s`, cost].filter(Boolean).join(' · ')
          setBlocks(b => [...b, { id: blockId(), type: 'system', content: summary, level: 'info' }])
          break
        }

        case 'abort':
          setThinking(false)
          setInputActive(false)
          setPermRequest(null)
          if (optionPickerRequest) {
            optionPickerRequest.resolve(null)
          }
          setOptionPickerRequest(null)
          break

        case 'clear':
          if (optionPickerRequest) {
            optionPickerRequest.resolve(null)
          }
          setOptionPickerRequest(null)
          setBlocks([])
          setStreamingText('')
          textBuffer.current = ''
          setLastTurnSummary(null)
          break
      }
    }

    session.on('*', handler)
    return () => { session.removeListener('*', handler) }
  }, [session, optionPickerRequest])

  // Input value tracking (for command picker)
  const handleInputChange = useCallback((val: string) => {
    setInputValue(val)
  }, [])

  const submitInputValue = useCallback((text: string) => {
    if (text) {
      setInputHistory(prev => [...prev, text])
      session.emitUserMessage(text)
    }
    setInputActive(false)
    setInputValue('')
    session.submitInput(text || null)
  }, [session])

  // Command picker selection
  const handleCommandSelect = useCallback((command: string) => {
    submitInputValue(command)
  }, [submitInputValue])

  const handleCommandCancel = useCallback(() => {
    setInputValue('')
  }, [])

  // Input submission
  const handleSubmit = useCallback((text: string) => {
    submitInputValue(text)
  }, [submitInputValue])

  const handleAbort = useCallback(() => {
    session.emitAbort()
  }, [session])

  const handleClear = useCallback(() => {
    session.emitCommand('clear-screen')
    setBlocks([])
    setStreamingText('')
    textBuffer.current = ''
    setLastTurnSummary(null)
  }, [session])

  const handleModeCycle = useCallback(() => {
    session.emitCommand('mode-cycle')
  }, [session])

  const handleUndo = useCallback(() => {
    session.emitCommand('undo')
  }, [session])

  const handleThemeSelect = useCallback((themeId: string) => {
    setThemeId(themeId)
    setShowThemePicker(false)
    const home = process.env.HOME || process.env.USERPROFILE || ''
    if (!home) return
    const dir = `${home}/.orca`
    try {
      mkdirSync(dir, { recursive: true })
      writeFileSync(`${dir}/theme`, themeId, 'utf-8')
    } catch {}
  }, [setThemeId])

  const hasContent = blocks.length > 0 || streamingText || thinking || activeTool || multiModelState
  const homeActionsAvailable = !hasContent
    && inputActive
    && !permRequest
    && !showThemePicker
    && !optionPickerRequest
    && !showPicker
    && inputValue.length === 0

  const openHomeActions = useCallback(() => {
    setOptionPickerRequest({
      title: 'Quick Actions',
      subtitle: 'Choose a common starting path',
      options: buildHomeActions(status, banner?.savedSessionCount).map((option) => ({
        value: option.value,
        label: option.label,
        description: option.description,
      })),
      resolve: (value) => {
        setOptionPickerRequest(null)
        setInputActive(true)
        if (!value) return
        const nextInput = resolveHomeActionSelection(value)
        if (nextInput) submitInputValue(nextInput)
      },
    })
    setInputActive(false)
  }, [banner?.savedSessionCount, status, submitInputValue])

  useInput((_input, key) => {
    if (!homeActionsAvailable) return
    if (key.tab && !key.shift) {
      openHomeActions()
    }
  }, { isActive: homeActionsAvailable })

  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* Content area: scrollable, fills space above fixed bottom */}
      <ScrollBox
        ref={scrollRef}
        keyboardActive={!inputActive && !permRequest && !showThemePicker}
      >
        {/* Theme picker (first launch only) */}
        {showThemePicker && (
          <ThemePicker onSelect={handleThemeSelect} active={showThemePicker} />
        )}

        {/* Banner (shown once at startup, after theme pick) */}
        {banner && !showThemePicker && (
          <Banner
            version={banner.version}
            cwd={banner.cwd}
            configFiles={banner.configFiles}
            toolCount={banner.toolCount}
            hookCount={banner.hookCount}
            model={banner.model}
            permMode={banner.permMode}
            sessionId={banner.sessionId}
          />
        )}

        {/* Empty state guide — SOTA feature showcase */}
        {!hasContent && (
          <HomePanel
            status={status}
            toolCount={banner?.toolCount}
            hookCount={banner?.hookCount}
            savedSessionCount={banner?.savedSessionCount}
          />
        )}

        {/* Output blocks (regular render — Static incompatible with fullscreen layout) */}
        {blocks.map((block) => {
          if (block.type === 'tool' && block.toolStart) {
            return (
              <Box key={block.id}>
                <ToolCallBlock start={block.toolStart} end={block.toolEnd} />
              </Box>
            )
          }
          if (block.type === 'detail' && block.detailInfo) {
            return <DetailPanel key={block.id} info={block.detailInfo} />
          }
          if (block.type === 'system') {
            const color = block.level === 'error' ? theme.error : block.level === 'warn' ? theme.warning : theme.info
            return <Text key={block.id} color={color}>  {block.content}</Text>
          }
          if (block.type === 'user') {
            return <UserPromptBlock key={block.id} content={block.content} />
          }
          return <AssistantMessageBlock key={block.id} content={block.content} />
        })}

        {/* Currently streaming assistant text */}
        {streamingText && <AssistantMessageBlock content={streamingText} streaming />}

        {/* Active tool call with spinner (not in Static — re-renders) */}
        {activeTool && (
          <ActiveToolCall start={activeTool.start} startTime={activeTool.startTime} />
        )}

        {/* Thinking spinner */}
        <ThinkingSpinner active={thinking && !activeTool} />

        {/* Multi-model progress */}
        {multiModelState && (
          <MultiModelProgress command={multiModelState.command} models={multiModelState.models} />
        )}

        {/* Turn summary */}
        {lastTurnSummary && !thinking && !streamingText && (
          <TurnSummary info={lastTurnSummary} />
        )}

        {/* Diff preview + Permission prompt */}
        {permRequest && permRequest.diff && (
          <DiffPreview
            filePath={permRequest.diff.filePath}
            oldContent={permRequest.diff.oldContent}
            newContent={permRequest.diff.newContent}
          />
        )}
        {permRequest && (
          <PermissionPrompt
            toolName={permRequest.toolName}
            preview={permRequest.preview}
            onResolve={permRequest.resolve}
            active={!!permRequest}
          />
        )}
      </ScrollBox>

      {/* ── Fixed bottom section (never shrinks, pinned to bottom) ── */}
      <Box flexDirection="column" flexShrink={0}>
        {/* Command picker (above input box) */}
        {showPicker && (
          <CommandPicker
            commands={SLASH_COMMANDS}
            filter={pickerFilter}
            onSelect={handleCommandSelect}
            onCancel={handleCommandCancel}
            active={showPicker}
          />
        )}

        {optionPickerRequest && (
          <OptionPicker
            title={optionPickerRequest.title}
            subtitle={optionPickerRequest.subtitle}
            options={optionPickerRequest.options}
            filterable={optionPickerRequest.filterable}
            filterPlaceholder={optionPickerRequest.filterPlaceholder}
            initialQuery={optionPickerRequest.initialQuery}
            onSelect={(value) => optionPickerRequest.resolve(value)}
            onCancel={() => optionPickerRequest.resolve(null)}
            active={!!optionPickerRequest}
          />
        )}

        {/* Input area */}
        <InputArea
          onSubmit={handleSubmit}
          onAbort={handleAbort}
          onClear={handleClear}
          onModeCycle={handleModeCycle}
          onUndo={handleUndo}
          onChange={handleInputChange}
          active={inputActive && !permRequest && !showThemePicker}
          permissionBlocked={!!permRequest || showThemePicker}
          pickerActive={showPicker || !!optionPickerRequest}
          history={inputHistory}
        />

        {/* Status bar */}
        <StatusBar status={status} />

        {/* Footer: keyboard shortcuts */}
        <Footer
          isGenerating={thinking}
          isInputActive={inputActive && !permRequest}
          permMode={status.permMode}
          permSource={status.permSource}
        />
      </Box>
    </Box>
  )
}
