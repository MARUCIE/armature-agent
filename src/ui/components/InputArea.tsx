/**
 * InputArea — multi-line text input with border, matching CC's input box.
 *
 * Features:
 * - Rounded border box with accent color (CC-style)
 * - Multi-line editing via newline character (\n) in buffer
 * - Ctrl+J / Ctrl+Enter / Meta+Enter / Shift+Enter to insert newline
 * - Word-boundary operations (Ctrl+W, Option+Left/Right)
 * - Kill/yank buffer (Ctrl+K / Ctrl+Y)
 * - Command history (up/down arrows when on first line)
 * - Claude Code-style cancellation, rewind, redraw, and editor shortcuts
 * - Bracketed paste handling (Enter → newline during paste)
 * - Cursor position tracking for mid-text editing
 */

import React, { useState, useCallback, useEffect, useRef } from 'react'
import { Box, Text, useInput } from 'ink'
import { useTheme } from '../theme.js'
import { useTerminalSize } from '../useTerminalSize.js'
import { usePasteHandler } from '../usePasteHandler.js'
import { resolveChatKeyAction } from '../keybindings.js'
import * as C from '../cursor.js'

interface Props {
  /** Called when user submits input (Enter) */
  onSubmit: (text: string) => void
  /** Called when user interrupts the running turn */
  onAbort?: () => void
  /** Called when user requests a terminal redraw */
  onRedraw?: () => void
  /** Called on Ctrl+T */
  onToggleTodos?: () => void
  /** Called on Ctrl+B */
  onBackgroundTask?: () => void
  /** Called on Ctrl+X Ctrl+K; confirmed is true only on the second chord within the confirmation window. */
  onKillAgents?: (confirmed: boolean) => void
  /** Called on Shift+Tab (mode cycle) */
  onModeCycle?: () => void
  /** Called on Ctrl+_ (undo) */
  onUndo?: () => void
  /** Called on Ctrl+D with empty input */
  onExit?: () => void
  /** Called on Esc Esc with empty input */
  onRewind?: () => void
  /** Called on Ctrl+R */
  onHistorySearch?: () => void
  /** Called on Ctrl+X */
  onExternalEditor?: (text: string) => Promise<string | null> | string | null
  /** Called on Meta+P */
  onModelPicker?: () => void
  /** Called on Meta+O */
  onFastMode?: () => void
  /** Called on Meta+T */
  onThinkingToggle?: () => void
  /** Called on Ctrl+V */
  onImagePaste?: (text: string) => Promise<string | null> | string | null
  /** Called on Ctrl+O */
  onToggleTranscript?: () => void
  /** Called when input value changes */
  onChange?: (value: string) => void
  /** Whether input is currently accepting keystrokes */
  active: boolean
  /** Whether a turn is currently generating */
  isGenerating?: boolean
  /** When true, CommandPicker handles Enter/Esc/arrows — InputArea only handles text */
  pickerActive?: boolean
  /** When true, stdin capture is suspended (permission prompt is active) */
  permissionBlocked?: boolean
  /** Show cursor even when input is not active (e.g., during modal) */
  showCursor?: boolean
  /** Command history for up/down navigation */
  history?: string[]
  /** Externally injected draft, e.g. from history search or rewind */
  draft?: { id: number; text: string } | null
}

export function InputArea({
  onSubmit,
  onAbort,
  onRedraw,
  onToggleTodos,
  onBackgroundTask,
  onKillAgents,
  onModeCycle,
  onUndo,
  onExit,
  onRewind,
  onHistorySearch,
  onExternalEditor,
  onModelPicker,
  onFastMode,
  onThinkingToggle,
  onImagePaste,
  onToggleTranscript,
  onChange,
  active,
  isGenerating = false,
  pickerActive,
  permissionBlocked,
  showCursor,
  history = [],
  draft,
}: Props): React.ReactElement {
  const { cols } = useTerminalSize()
  const theme = useTheme()
  const [value, setValue] = useState('')
  const [cursor, setCursor] = useState(0)
  const [historyIdx, setHistoryIdx] = useState(-1)
  const [killRing, setKillRing] = useState<string[]>([])
  const lastEscAt = useRef(0)
  const ctrlXPrefixUntil = useRef(0)
  const lastKillAgentsChordAt = useRef(0)
  const stashedPrompt = useRef('')
  const lastYank = useRef<{ start: number; end: number; ringIndex: number } | null>(null)
  const lastDraftId = useRef<number | null>(null)

  // Bracketed paste: detect paste mode, insert content with newlines preserved
  const { isPasting } = usePasteHandler({
    isActive: !permissionBlocked,
    onPaste: useCallback((text: string) => {
      setValue(prev => {
        const result = C.insert({ text: prev, pos: cursor }, text)
        setCursor(result.pos)
        return result.text
      })
    }, [cursor]),
  })

  // Notify parent of value changes via useEffect (not during render)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  useEffect(() => {
    onChangeRef.current?.(value)
  }, [value])

  useEffect(() => {
    if (!draft || draft.id === lastDraftId.current) return
    lastDraftId.current = draft.id
    setValue(draft.text)
    setCursor(draft.text.length)
    setHistoryIdx(-1)
  }, [draft])

  // Helper: apply a CursorState update
  const applyState = useCallback((newState: C.CursorState) => {
    setValue(newState.text)
    setCursor(newState.pos)
  }, [])

  const pushKillRing = useCallback((text: string) => {
    if (!text) return
    setKillRing(prev => [text, ...prev.filter(item => item !== text)].slice(0, 20))
  }, [])

  const applyHistoryPrevious = useCallback(() => {
    const lineStart = value.lastIndexOf('\n', cursor - 1)
    if (lineStart === -1 && history.length > 0) {
      const next = Math.min(historyIdx + 1, history.length - 1)
      setHistoryIdx(next)
      const hVal = history[history.length - 1 - next] || ''
      setValue(hVal)
      setCursor(hVal.length)
    } else if (lineStart >= 0) {
      setCursor(C.moveUp(value, cursor))
    }
  }, [cursor, history, historyIdx, value])

  const applyHistoryNext = useCallback(() => {
    const nextNewline = value.indexOf('\n', cursor)
    if (nextNewline === -1) {
      const next = historyIdx - 1
      if (next < 0) {
        setHistoryIdx(-1)
        applyState(C.clear())
      } else {
        setHistoryIdx(next)
        const hVal = history[history.length - 1 - next] || ''
        setValue(hVal)
        setCursor(hVal.length)
      }
    } else {
      setCursor(C.moveDown(value, cursor))
    }
  }, [applyState, cursor, history, historyIdx, value])

  useInput(
    (input, key) => {
      // Filter out mouse escape sequences that leak through from SGR mouse mode.
      // These look like \x1b[<N;N;N(M|m) and should never be treated as text input.
      if (input && /\x1b\[<|;.*[Mm]$/.test(input)) return

      // When picker is active, defer Enter/Esc/arrows to CommandPicker
      if (pickerActive && (key.return || key.escape || key.upArrow || key.downArrow)) return

      const now = Date.now()
      if (ctrlXPrefixUntil.current > now) {
        ctrlXPrefixUntil.current = 0
        if (key.ctrl && input === 'e') {
          void Promise.resolve(onExternalEditor?.(value) ?? null).then((nextValue) => {
            if (nextValue === null || nextValue === undefined) return
            setValue(nextValue)
            setCursor(nextValue.length)
            setHistoryIdx(-1)
          })
          return
        }
        if (key.ctrl && input === 'k') {
          const confirmed = now - lastKillAgentsChordAt.current < 3000
          lastKillAgentsChordAt.current = confirmed ? 0 : now
          onKillAgents?.(confirmed)
          return
        }
      }

      if (key.ctrl && input === 'x') {
        ctrlXPrefixUntil.current = now + 3000
        return
      }

      const action = resolveChatKeyAction(input, key)
      if (action) {
        if (action === 'app:interrupt') {
          if (isGenerating) {
            onAbort?.()
          } else if (value.length > 0) {
            applyState(C.clear())
            setHistoryIdx(-1)
          } else {
            onExit?.()
          }
          return
        }
        if (action === 'app:exit') {
          onExit?.()
          return
        }
        if (action === 'app:toggleTodos') {
          onToggleTodos?.()
          return
        }
        if (action === 'app:toggleTranscript') {
          onToggleTranscript?.()
          return
        }
        if (action === 'task:background') {
          onBackgroundTask?.()
          return
        }
        if (action === 'chat:newline') {
          applyState(C.insert({ text: value, pos: cursor }, '\n'))
          return
        }
        if (action === 'chat:submit') {
          if (isPasting) {
            applyState(C.insert({ text: value, pos: cursor }, '\n'))
            return
          }
          if (cursor > 0 && value[cursor - 1] === '\\') {
            const withoutBackslash = `${value.slice(0, cursor - 1)}${value.slice(cursor)}`
            applyState(C.insert({ text: withoutBackslash, pos: cursor - 1 }, '\n'))
            return
          }
          const trimmed = value.trim()
          onSubmit(trimmed)
          applyState(C.clear())
          setHistoryIdx(-1)
          return
        }
        if (action === 'chat:cancel') {
          if (isGenerating) {
            onAbort?.()
            lastEscAt.current = now
            return
          }
          if (value.length > 0) {
            applyState(C.clear())
            setHistoryIdx(-1)
            lastEscAt.current = now
            return
          }
          if (now - lastEscAt.current < 650) {
            onRewind?.()
            lastEscAt.current = 0
            return
          }
          lastEscAt.current = now
          return
        }
        if (action === 'chat:clearInput') {
          onRedraw?.()
          return
        }
        if (action === 'chat:killAgents') {
          const confirmed = now - lastKillAgentsChordAt.current < 3000
          lastKillAgentsChordAt.current = confirmed ? 0 : now
          onKillAgents?.(confirmed)
          return
        }
        if (action === 'chat:cycleMode') {
          onModeCycle?.()
          return
        }
        if (action === 'chat:undo') {
          onUndo?.()
          return
        }
        if (action === 'chat:history-search') {
          onHistorySearch?.()
          return
        }
        if (action === 'chat:history-previous') {
          applyHistoryPrevious()
          return
        }
        if (action === 'chat:history-next') {
          applyHistoryNext()
          return
        }
        if (action === 'chat:externalEditor') {
          void Promise.resolve(onExternalEditor?.(value) ?? null).then((nextValue) => {
            if (nextValue === null || nextValue === undefined) return
            setValue(nextValue)
            setCursor(nextValue.length)
            setHistoryIdx(-1)
          })
          return
        }
        if (action === 'chat:modelPicker') {
          onModelPicker?.()
          return
        }
        if (action === 'chat:fastMode') {
          onFastMode?.()
          return
        }
        if (action === 'chat:thinkingToggle') {
          onThinkingToggle?.()
          return
        }
        if (action === 'chat:stash') {
          if (value.length > 0) {
            stashedPrompt.current = value
            applyState(C.clear())
          } else if (stashedPrompt.current) {
            setValue(stashedPrompt.current)
            setCursor(stashedPrompt.current.length)
            stashedPrompt.current = ''
          }
          return
        }
        if (action === 'chat:imagePaste') {
          void Promise.resolve(onImagePaste?.(value) ?? null).then((nextValue) => {
            if (nextValue === null || nextValue === undefined) return
            setValue(nextValue)
            setCursor(nextValue.length)
            setHistoryIdx(-1)
          })
          return
        }
        if (action === 'chat:word-left') {
          setCursor(C.moveWordLeft(value, cursor))
          return
        }
        if (action === 'chat:word-right') {
          setCursor(C.moveWordRight(value, cursor))
          return
        }
        if (action === 'chat:line-start') {
          setCursor(C.moveLineStart(value, cursor))
          return
        }
        if (action === 'chat:line-end') {
          setCursor(C.moveLineEnd(value, cursor))
          return
        }
        if (action === 'chat:delete-word-before') {
          const result = C.deleteWordBefore({ text: value, pos: cursor })
          applyState(result.state)
          if (result.killed) pushKillRing(result.killed)
          return
        }
        if (action === 'chat:delete-to-line-end') {
          const result = C.deleteToLineEnd({ text: value, pos: cursor })
          applyState(result.state)
          if (result.killed) pushKillRing(result.killed)
          return
        }
        if (action === 'chat:delete-to-line-start') {
          const result = C.deleteToLineStart({ text: value, pos: cursor })
          applyState(result.state)
          if (result.killed) pushKillRing(result.killed)
          return
        }
        if (action === 'chat:yank') {
          const text = killRing[0]
          if (text) {
            const before = cursor
            const next = C.insert({ text: value, pos: cursor }, text)
            applyState(next)
            lastYank.current = { start: before, end: next.pos, ringIndex: 0 }
          }
          return
        }
        if (action === 'chat:yank-pop') {
          const yank = lastYank.current
          if (yank && killRing.length > 1) {
            const nextIndex = (yank.ringIndex + 1) % killRing.length
            const replacement = killRing[nextIndex]!
            const nextText = value.slice(0, yank.start) + replacement + value.slice(yank.end)
            const nextEnd = yank.start + replacement.length
            setValue(nextText)
            setCursor(nextEnd)
            lastYank.current = { start: yank.start, end: nextEnd, ringIndex: nextIndex }
          }
          return
        }
      }

      // Backspace/Delete
      if (key.backspace || key.delete) {
        applyState(C.deleteCharBefore({ text: value, pos: cursor }))
        return
      }

      // Tab: no-op (reserved for completion)
      if (key.tab) return

      // Left arrow (Option+Left = word left via meta key)
      if (key.leftArrow) {
        setCursor(key.meta ? C.moveWordLeft(value, cursor) : C.moveLeft(cursor))
        return
      }

      // Right arrow (Option+Right = word right via meta key)
      if (key.rightArrow) {
        setCursor(key.meta ? C.moveWordRight(value, cursor) : C.moveRight(value, cursor))
        return
      }

      // Up arrow: history when on first line, or move cursor up in multi-line
      if (key.upArrow) {
        applyHistoryPrevious()
        return
      }

      // Down arrow: history or move cursor down
      if (key.downArrow) {
        applyHistoryNext()
        return
      }

      // Regular character input (reject escape sequences and control chars)
      if (input && !key.ctrl && !key.meta && !input.includes('\x1b')) {
        applyState(C.insert({ text: value, pos: cursor }, input))
      }
    },
    { isActive: !permissionBlocked },
  )

  const { line: cursorLine, col: cursorCol, lines } = C.getCursorDisplay(value, cursor)
  const isMultiLine = lines.length > 1
  // Show cursor when explicitly enabled or when input is active
  // Cursor always visible unless explicitly hidden — don't wait for prompt_ready
  const cursorVisible = showCursor ?? true

  // Blinking cursor — toggles every 530ms (standard terminal blink rate)
  const [cursorOn, setCursorOn] = useState(true)
  useEffect(() => {
    if (!cursorVisible) return
    const timer = setInterval(() => setCursorOn(prev => !prev), 530)
    return () => clearInterval(timer)
  }, [cursorVisible])
  // Reset blink on cursor move (always show after keystroke)
  useEffect(() => { setCursorOn(true) }, [cursor, value])

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={active ? theme.border : theme.borderDim}
      width={cols}
      minHeight={3}
    >
      {lines.map((line, i) => (
        <Box key={i}>
          {i === 0 ? (
            <Text color={active ? theme.prompt : theme.dim} bold={active}>{'> '}</Text>
          ) : (
            <Text color={theme.dim}>  </Text>
          )}
          {cursorVisible && i === cursorLine ? (
            <Text>
              {line.slice(0, cursorCol)}
              <Text color={theme.accent} bold>{cursorOn ? '\u2588' : '\u2502'}</Text>
              {line.slice(cursorCol)}
            </Text>
          ) : (
            <Text>{line}</Text>
          )}
          {i === 0 && !value && (
            <Text color={theme.muted}>Type a message... (/help for commands)</Text>
          )}
        </Box>
      ))}
      {active && isMultiLine && (
        <Text color={theme.dim}>  enter: send · ctrl+j: newline</Text>
      )}
    </Box>
  )
}
