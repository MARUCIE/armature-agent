/**
 * ScrollBox — scrollable content area for ink terminal UI.
 *
 * Implements CC-style viewport scrolling within ink's Yoga layout:
 * - Tracks scrollTop offset, renders content with negative marginTop
 * - stickyScroll: auto-follows bottom when new content is added
 * - Keyboard: PageUp/PageDown and Claude Code-style Ctrl+Home/Ctrl+End
 * - Mouse wheel: via parent-injected onWheel (SGR mouse protocol)
 *
 * Uses ink's overflow="hidden" for viewport clipping.
 * Content height is estimated from child count × average line height,
 * with a ref-based measurement callback for post-render accuracy.
 */

import React, { useState, useEffect, useCallback, useRef, useImperativeHandle, forwardRef } from 'react'
import { Box, useInput, measureElement } from 'ink'
import { useTerminalSize } from '../useTerminalSize.js'

export interface ScrollBoxHandle {
  /** Scroll to absolute position */
  scrollTo(y: number): void
  /** Scroll by relative delta (positive = down) */
  scrollBy(dy: number): void
  /** Scroll to bottom and enable sticky */
  scrollToBottom(): void
  /** Whether scroll is pinned to bottom */
  isSticky(): boolean
  /** Current scroll position */
  getScrollTop(): number
  /** Current total content height */
  getScrollHeight(): number
  /** Current visible viewport height */
  getViewportHeight(): number
}

interface Props {
  children: React.ReactNode
  /** Whether non-text keyboard scroll controls are active. */
  keyboardActive?: boolean
  /** Legacy compatibility flag; text-key scroll shortcuts are disabled for Claude Code parity. */
  vimKeysActive?: boolean
  /** Available height for viewport (if not provided, uses flexGrow) */
  height?: number
}

export const ScrollBox = forwardRef<ScrollBoxHandle, Props>(function ScrollBox(
  { children, keyboardActive = false, vimKeysActive: _vimKeysActive = keyboardActive, height },
  ref,
): React.ReactElement {
  const { rows } = useTerminalSize()
  const [scrollTop, setScrollTop] = useState(0)
  const [sticky, setSticky] = useState(true)
  const [contentHeight, setContentHeight] = useState(0)
  const [measuredViewportHeight, setMeasuredViewportHeight] = useState<number | null>(null)
  const viewportRef = useRef<any>(null)
  const contentRef = useRef<any>(null)
  const viewportHeight = height ?? measuredViewportHeight ?? rows

  // Measure content and viewport height after render. When ScrollBox lives inside a
  // flex column, the visible viewport is smaller than the terminal row count.
  useEffect(() => {
    if (contentRef.current) {
      try {
        const { height: h } = measureElement(contentRef.current)
        setContentHeight(prev => prev === h ? prev : h)
      } catch {
        // measureElement may fail in test environment
      }
    }

    if (height === undefined && viewportRef.current) {
      try {
        const { height: h } = measureElement(viewportRef.current)
        if (h > 0) {
          setMeasuredViewportHeight(prev => prev === h ? prev : h)
        }
      } catch {
        // measureElement may fail in test environment
      }
    }
  })

  // Auto-follow bottom when sticky and content grows
  useEffect(() => {
    if (sticky && contentHeight > viewportHeight) {
      setScrollTop(Math.max(0, contentHeight - viewportHeight))
    }
  }, [sticky, contentHeight, viewportHeight])

  const maxScroll = Math.max(0, contentHeight - viewportHeight)

  const clampScroll = useCallback((y: number) => {
    return Math.max(0, Math.min(y, maxScroll))
  }, [maxScroll])

  // Imperative API
  useImperativeHandle(ref, () => ({
    scrollTo(y: number) {
      const clamped = clampScroll(y)
      setScrollTop(clamped)
      setSticky(clamped >= maxScroll)
    },
    scrollBy(dy: number) {
      setScrollTop(prev => {
        const next = clampScroll(prev + dy)
        if (next >= maxScroll) setSticky(true)
        else if (dy < 0) setSticky(false)
        return next
      })
    },
    scrollToBottom() {
      setScrollTop(maxScroll)
      setSticky(true)
    },
    isSticky() {
      return sticky
    },
    getScrollTop() {
      return scrollTop
    },
    getScrollHeight() {
      return contentHeight
    },
    getViewportHeight() {
      return viewportHeight
    },
  }), [clampScroll, contentHeight, maxScroll, scrollTop, sticky, viewportHeight])

  // Keyboard scroll (only when explicitly enabled and content overflows)
  useInput(
    (input, key) => {
      if (contentHeight <= viewportHeight) return // no scroll needed

      const pageSize = Math.max(1, viewportHeight - 2)

      // PageUp / Shift+Up. Some test and terminal adapters pass raw CSI.
      if (key.pageUp || input === '\x1b[5~' || (key.upArrow && key.shift)) {
        setScrollTop(prev => {
          const next = Math.max(0, prev - pageSize)
          if (next < maxScroll) setSticky(false)
          return next
        })
        return
      }

      // PageDown / Shift+Down. Some test and terminal adapters pass raw CSI.
      if (key.pageDown || input === '\x1b[6~' || (key.downArrow && key.shift)) {
        setScrollTop(prev => {
          const next = Math.min(maxScroll, prev + pageSize)
          if (next >= maxScroll) setSticky(true)
          return next
        })
        return
      }

      // Ctrl+Home: scroll to top. Some terminal adapters pass raw CSI.
      if (input === '\x1b[1;5H' || (input === '\x1b[H' && key.ctrl)) {
        setScrollTop(0)
        setSticky(false)
        return
      }

      // Ctrl+End: scroll to bottom. Some terminal adapters pass raw CSI.
      if (input === '\x1b[1;5F' || (input === '\x1b[F' && key.ctrl)) {
        setScrollTop(maxScroll)
        setSticky(true)
        return
      }
    },
    { isActive: keyboardActive && contentHeight > viewportHeight },
  )

  return (
    <Box
      ref={viewportRef}
      flexDirection="column"
      flexGrow={height ? undefined : 1}
      height={height}
      overflow="hidden"
    >
      <Box
        ref={contentRef}
        flexDirection="column"
        flexShrink={0}
        marginTop={-scrollTop}
      >
        {children}
      </Box>
    </Box>
  )
})
