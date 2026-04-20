import { describe, expect, it } from 'vitest'
import { ChatSessionEmitter } from '../src/ui/session.js'

describe('ChatSessionEmitter', () => {
  it('does not emit prompt_ready when consuming buffered input immediately', async () => {
    const session = new ChatSessionEmitter()
    let promptReadyCount = 0
    session.on('prompt_ready', () => {
      promptReadyCount += 1
    })

    session.submitInput('hello')

    await expect(session.waitForInput()).resolves.toBe('hello')
    expect(promptReadyCount).toBe(0)
  })

  it('resolves the same wait when prompt_ready synchronously submits input', async () => {
    const session = new ChatSessionEmitter()
    let promptReadyCount = 0
    session.on('prompt_ready', () => {
      promptReadyCount += 1
      session.submitInput('sync input')
    })

    await expect(session.waitForInput()).resolves.toBe('sync input')
    expect(promptReadyCount).toBe(1)
  })

  it('cancels reset-sensitive waits on clear without affecting the next prompt', async () => {
    const session = new ChatSessionEmitter()

    const staleWait = session.waitForInput({ cancelOnClear: true })
    session.emitClear()

    await expect(staleWait).resolves.toBeNull()
    expect(session.consumeCanceledResetSensitiveWait()).toBe(true)
    expect(session.consumeCanceledResetSensitiveWait()).toBe(false)

    const freshWait = session.waitForInput({ cancelOnClear: true })
    session.submitInput('fresh input')
    await expect(freshWait).resolves.toBe('fresh input')
  })

  it('keeps the primary prompt wait active across clear', async () => {
    const session = new ChatSessionEmitter()

    const pending = session.waitForInput()
    session.emitClear()
    session.submitInput('fresh input')

    await expect(pending).resolves.toBe('fresh input')
  })

  it('drops buffered input when the session is cleared', async () => {
    const session = new ChatSessionEmitter()
    session.submitInput('stale input')

    session.emitClear()

    const pending = session.waitForInput()
    let resolved = false
    pending.then(() => {
      resolved = true
    })
    await Promise.resolve()

    expect(resolved).toBe(false)

    session.submitInput('fresh input')
    await expect(pending).resolves.toBe('fresh input')
  })
})
