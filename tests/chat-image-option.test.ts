import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { buildImagePromptContent, splitImageArgsAndPrompt } from '../src/commands/chat-input.js'

const TMP_DIR = join(tmpdir(), `orca-chat-image-${Date.now()}`)

beforeEach(() => {
  mkdirSync(TMP_DIR, { recursive: true })
})

afterEach(() => {
  try { rmSync(TMP_DIR, { recursive: true, force: true }) } catch {}
})

describe('chat --image helper', () => {
  it('builds multimodal prompt content from local image files', () => {
    const imagePath = join(TMP_DIR, 'diagram.png')
    writeFileSync(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]))

    const prompt = buildImagePromptContent('Review this', [imagePath], TMP_DIR)
    expect(Array.isArray(prompt)).toBe(true)
    expect(prompt[0]).toEqual({ type: 'text', text: 'Review this' })
    expect(prompt[1].type).toBe('image_url')
    expect(prompt[1].image_url.url.startsWith('data:image/png;base64,')).toBe(true)
  })

  it('rejects non-image files', () => {
    const filePath = join(TMP_DIR, 'notes.txt')
    writeFileSync(filePath, 'not an image')
    expect(() => buildImagePromptContent('Review this', [filePath], TMP_DIR)).toThrow('Not an image file')
  })

  it('treats trailing non-image args as the prompt when --image consumes argv greedily', () => {
    const imageA = join(TMP_DIR, 'screen-a.png')
    const imageB = join(TMP_DIR, 'screen-b.png')
    writeFileSync(imageA, Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    writeFileSync(imageB, Buffer.from([0x89, 0x50, 0x4e, 0x47]))

    const parsed = splitImageArgsAndPrompt([], [imageA, imageB, 'compare these UIs'], TMP_DIR)
    expect(parsed.imagePaths).toEqual([imageA, imageB])
    expect(parsed.prompt).toBe('compare these UIs')
  })

  it('keeps the provided prompt when prompt args were parsed normally', () => {
    const imageA = join(TMP_DIR, 'screen-c.png')
    writeFileSync(imageA, Buffer.from([0x89, 0x50, 0x4e, 0x47]))

    const parsed = splitImageArgsAndPrompt(['describe', 'the', 'issue'], [imageA], TMP_DIR)
    expect(parsed.imagePaths).toEqual([imageA])
    expect(parsed.prompt).toBe('describe the issue')
  })
})
