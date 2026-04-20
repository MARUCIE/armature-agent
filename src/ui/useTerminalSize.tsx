/**
 * useTerminalSize — reactive terminal dimensions via SIGWINCH.
 *
 * Provides rows/cols that update on terminal resize. All components
 * that need terminal dimensions should use this instead of useStdout().
 *
 * Architecture: TerminalSizeProvider at render root → Context → useTerminalSize() hook.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useStdout } from 'ink'

interface TerminalSize {
  rows: number
  cols: number
}

const TerminalSizeContext = createContext<TerminalSize>({ rows: 24, cols: 80 })

const sigwinchSubscribers = new Set<() => void>()
let sigwinchAttached = false

function notifySigwinchSubscribers(): void {
  for (const subscriber of sigwinchSubscribers) subscriber()
}

function subscribeSigwinch(subscriber: () => void): () => void {
  sigwinchSubscribers.add(subscriber)

  if (!sigwinchAttached) {
    process.on('SIGWINCH', notifySigwinchSubscribers)
    sigwinchAttached = true
  }

  return () => {
    sigwinchSubscribers.delete(subscriber)
    if (sigwinchAttached && sigwinchSubscribers.size === 0) {
      process.removeListener('SIGWINCH', notifySigwinchSubscribers)
      sigwinchAttached = false
    }
  }
}

interface ProviderProps {
  children: React.ReactNode
}

export function TerminalSizeProvider({ children }: ProviderProps): React.ReactElement {
  const { stdout } = useStdout()
  const [size, setSize] = useState<TerminalSize>({
    rows: stdout?.rows || 24,
    cols: stdout?.columns || 80,
  })

  const handleResize = useCallback(() => {
    if (stdout) {
      setSize({ rows: stdout.rows, cols: stdout.columns })
    }
  }, [stdout])

  useEffect(() => {
    if (!stdout) return

    stdout.on('resize', handleResize)
    // Also listen for SIGWINCH as a shared fallback (some terminals don't emit resize on stdout).
    const unsubscribeSigwinch = subscribeSigwinch(handleResize)

    return () => {
      stdout.removeListener('resize', handleResize)
      unsubscribeSigwinch()
    }
  }, [stdout, handleResize])

  return (
    <TerminalSizeContext.Provider value={size}>
      {children}
    </TerminalSizeContext.Provider>
  )
}

/** Reactive terminal dimensions — updates on resize */
export function useTerminalSize(): TerminalSize {
  return useContext(TerminalSizeContext)
}
