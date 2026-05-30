import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { expandFileReferences, isStandalonePathPrompt, resolveFilePath } from '../src/commands/chat-input.js'

const TMP_DIR = join(tmpdir(), `armature-chat-fileexp-${Date.now()}`)

beforeEach(() => {
  mkdirSync(TMP_DIR, { recursive: true })
})

afterEach(() => {
  try { rmSync(TMP_DIR, { recursive: true, force: true }) } catch {}
})

function createFile(relPath: string, content: string): string {
  const filePath = join(TMP_DIR, relPath)
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, content, 'utf-8')
  return filePath
}

describe('chat file expansion helpers', () => {
  it('resolves shell-escaped spaces in file paths', () => {
    const filePath = createFile('dir/My File.png', 'image bytes')
    const escaped = filePath.replace(/ /g, '\\ ')
    expect(resolveFilePath(escaped, '', TMP_DIR)).toBe(filePath)
  })

  it('resolves quoted file paths with spaces', () => {
    const filePath = createFile('dir/Quarterly Report.pdf', 'pdf bytes')
    expect(resolveFilePath(`"${filePath}"`, '', TMP_DIR)).toBe(filePath)
  })

  it('decodes file URLs with percent-encoded spaces', () => {
    const filePath = createFile('dir/Slide Deck.pdf', 'pdf bytes')
    const fileUrl = `file://${filePath.replace(/ /g, '%20')}`
    expect(resolveFilePath(fileUrl, '', TMP_DIR)).toBe(filePath)
  })

  it('treats escaped-space path as a standalone path prompt', () => {
    const filePath = createFile('dir/Diagram.png', 'img')
    const escaped = filePath.replace(/ /g, '\\ ')
    expect(isStandalonePathPrompt(escaped)).toBe(true)
    expect(isStandalonePathPrompt(`analyze ${escaped}`)).toBe(false)
  })

  it('expands embedded shell-escaped paths into file tags', { timeout: 15_000 }, () => {
    const filePath = createFile('dir/My File.png', 'png bytes')
    const prompt = `please inspect ${filePath.replace(/ /g, '\\ ')}`
    const result = expandFileReferences(prompt, TMP_DIR)
    expect(result.injectedPaths.has(filePath)).toBe(true)
    expect(result.text).toContain(`<file path="${filePath}">`)
  })

  it('expands quoted embedded paths into file tags', () => {
    const filePath = createFile('dir/Board Notes.md', '# hello')
    const prompt = `summarize "${filePath}"`
    const result = expandFileReferences(prompt, TMP_DIR)
    expect(result.injectedPaths.has(filePath)).toBe(true)
    expect(result.text).toContain(`<file path="${filePath}">`)
  })

  it('expands a quoted directory path with spaces into project context', () => {
    const projectDir = join(TMP_DIR, 'My Project')
    mkdirSync(projectDir, { recursive: true })
    writeFileSync(join(projectDir, 'README.md'), '# Project Readme', 'utf-8')

    const result = expandFileReferences(`analyze "${projectDir}"`, TMP_DIR)
    expect(result.text).toContain('analyze')
    expect(result.text).toContain('<project-tree')
    expect(result.text).toContain(`<file path="${join(projectDir, 'README.md')}">`)
  })

  it('expands a shell-escaped directory path with spaces into project context', () => {
    const projectDir = join(TMP_DIR, 'Another Project')
    mkdirSync(projectDir, { recursive: true })
    writeFileSync(join(projectDir, 'README.md'), '# Another Readme', 'utf-8')

    const escaped = projectDir.replace(/ /g, '\\ ')
    const result = expandFileReferences(`inspect ${escaped}`, TMP_DIR)
    expect(result.text).toContain('inspect')
    expect(result.text).toContain('<project-tree')
    expect(result.text).toContain(`<file path="${join(projectDir, 'README.md')}">`)
  })

  it('expands a quoted directory path containing single quotes safely', () => {
    const projectDir = join(TMP_DIR, `Owner's Project`)
    mkdirSync(projectDir, { recursive: true })
    writeFileSync(join(projectDir, 'README.md'), '# Quoted Project', 'utf-8')

    const result = expandFileReferences(`analyze "${projectDir}"`, TMP_DIR)
    expect(result.text).toContain('<project-tree')
    expect(result.text).toContain(`<file path="${join(projectDir, 'README.md')}">`)
  })
})
