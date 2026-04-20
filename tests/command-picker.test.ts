import { describe, expect, it } from 'vitest'
import { COMMANDS } from '../src/command-picker.js'

describe('legacy command picker surface', () => {
  it('keeps /mode and /reflect discoverable together', () => {
    const names = COMMANDS.map((command) => command.name)
    expect(names).toContain('/mode')
    expect(names).toContain('/reflect')
  })
})
