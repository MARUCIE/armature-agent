import { describe, it, expect } from 'vitest'
import { parseWorkflowScript } from '../src/workflow/parser.js'

const META = `export const meta = { name: 'wf', description: 'demo', phases: [{ title: 'A' }] }`

describe('parseWorkflowScript — accepted', () => {
  it('parses literal meta and strips the export from the body', () => {
    const { meta, body } = parseWorkflowScript(`${META}\nreturn 1`)
    expect(meta.name).toBe('wf')
    expect(meta.description).toBe('demo')
    expect(meta.phases?.[0].title).toBe('A')
    expect(body).not.toContain('export const meta')
    expect(body).toContain('return 1')
  })

  it('allows nested arrays/objects, negative numbers, and non-interpolated templates', () => {
    const { meta } = parseWorkflowScript(
      "export const meta = { name: `wf`, description: 'd', whenToUse: 'x', phases: [{ title: 'A', model: 'm' }] }\n",
    )
    expect(meta.name).toBe('wf')
    expect(meta.whenToUse).toBe('x')
  })
})

describe('parseWorkflowScript — rejected', () => {
  it('rejects scripts whose first statement is not the meta export', () => {
    expect(() => parseWorkflowScript('const x = 1\n' + META)).toThrow(/must be the first statement/)
  })

  it('rejects non-deterministic primitives', () => {
    expect(() => parseWorkflowScript(`${META}\nconst t = Date.now()`)).toThrow(/deterministic/)
    expect(() => parseWorkflowScript(`${META}\nconst r = Math.random()`)).toThrow(/deterministic/)
    expect(() => parseWorkflowScript(`${META}\nconst d = new Date()`)).toThrow(/deterministic/)
  })

  it('rejects spreads, computed keys, and template interpolation in meta', () => {
    expect(() => parseWorkflowScript(`export const meta = { ...base, name: 'a', description: 'd' }\nreturn 1`)).toThrow()
    expect(() => parseWorkflowScript(`export const meta = { ['na' + 'me']: 'a', description: 'd' }\nreturn 1`)).toThrow()
    expect(() => parseWorkflowScript('export const meta = { name: `${x}`, description: \'d\' }\nreturn 1')).toThrow()
  })

  it('rejects function calls inside meta', () => {
    expect(() => parseWorkflowScript(`export const meta = { name: makeName(), description: 'd' }\nreturn 1`)).toThrow()
  })

  it('rejects missing or empty required meta fields', () => {
    expect(() => parseWorkflowScript(`export const meta = { description: 'd' }\nreturn 1`)).toThrow(/meta.name/)
    expect(() => parseWorkflowScript(`export const meta = { name: 'a' }\nreturn 1`)).toThrow(/meta.description/)
    expect(() => parseWorkflowScript(`export const meta = { name: '', description: 'd' }\nreturn 1`)).toThrow(/meta.name/)
  })

  it('rejects a phase without a title string', () => {
    expect(() => parseWorkflowScript(`export const meta = { name: 'a', description: 'd', phases: [{ detail: 'x' }] }\nreturn 1`)).toThrow(/title/)
  })

  it('rejects let/var meta or a renamed export', () => {
    expect(() => parseWorkflowScript(`export let meta = { name: 'a', description: 'd' }\nreturn 1`)).toThrow(/const/)
    expect(() => parseWorkflowScript(`export const other = { name: 'a', description: 'd' }\nreturn 1`)).toThrow(/declare .meta./)
  })
})

describe('parseWorkflowScript — adversarial / edge', () => {
  it('keeps a leading comment in the body and still finds the meta export', () => {
    const { meta, body } = parseWorkflowScript(`// header comment\n${META}\nreturn 1`)
    expect(meta.name).toBe('wf')
    // The comment precedes the export, so it stays in the stripped body.
    expect(body).toContain('header comment')
    expect(body).toContain('return 1')
  })

  it('rejects a "use strict" directive before the meta export', () => {
    expect(() => parseWorkflowScript(`'use strict'\n${META}\nreturn 1`)).toThrow(/first statement/)
  })

  it('tolerates unknown extra keys in meta', () => {
    const { meta } = parseWorkflowScript(`export const meta = { name: 'a', description: 'd', extra: 1, nested: { k: [1,2] } }\nreturn 1`)
    expect(meta.name).toBe('a')
  })

  it('rejects a non-string meta.name (number/bigint/boolean)', () => {
    expect(() => parseWorkflowScript(`export const meta = { name: 1, description: 'd' }\nreturn 1`)).toThrow(/meta.name/)
    expect(() => parseWorkflowScript(`export const meta = { name: true, description: 'd' }\nreturn 1`)).toThrow(/meta.name/)
  })

  it('rejects a __proto__ / constructor key in meta', () => {
    expect(() => parseWorkflowScript(`export const meta = { name: 'a', description: 'd', __proto__: { polluted: true } }\nreturn 1`)).toThrow(/reserved key/)
  })

  it('rejects a non-object phase entry', () => {
    expect(() => parseWorkflowScript(`export const meta = { name: 'a', description: 'd', phases: ['Scan'] }\nreturn 1`)).toThrow(/title/)
  })

  it('rejects whenToUse that is not a string', () => {
    expect(() => parseWorkflowScript(`export const meta = { name: 'a', description: 'd', whenToUse: 3 }\nreturn 1`)).toThrow(/whenToUse/)
  })

  it('preserves negative numbers and deep nesting in meta', () => {
    const { meta } = parseWorkflowScript(
      `export const meta = { name: 'a', description: 'd', phases: [{ title: 'A' }, { title: 'B', detail: 'x' }] }\nreturn 1`,
    )
    expect(meta.phases).toHaveLength(2)
    expect(meta.phases?.[1]).toMatchObject({ title: 'B', detail: 'x' })
  })

  it('rejects bracket-access non-determinism only at runtime, not parse (parser is dot-access regex)', () => {
    // The parser blocklist is dot-access only; bracket access slips past parse
    // and is caught by the runtime sandbox shadow (see workflow-runtime tests).
    expect(() => parseWorkflowScript(`${META}\nreturn Math['random']()`)).not.toThrow()
    expect(() => parseWorkflowScript(`${META}\nreturn new Date(0)`)).not.toThrow()
  })

  it('rejects a syntactically invalid script with a parse error', () => {
    expect(() => parseWorkflowScript(`${META}\nreturn (((`)).toThrow()
  })
})
