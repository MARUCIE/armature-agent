import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { getOrcaHome } from './logger.js'
import type { ChatMessage } from './providers/openai-compat.js'

const SAFE_SESSION_NAME = /^[A-Za-z0-9._-]+$/

export interface SavedSession {
  provider?: string
  model: string
  modeId?: string
  history: ChatMessage[]
  stats: { turns: number; inputTokens: number; outputTokens: number }
  savedAt: string
}

export interface SavedSessionFile {
  name: string
  path: string
  mtime: Date
}

export interface LoadedSessionFile extends SavedSessionFile {
  session: SavedSession
}

export interface SessionArtifactBundle {
  markdownPath: string
  metadataPath: string
}

export interface SavedSessionSummary {
  id: string
  provider?: string
  model: string
  modeId?: string
  turns: number
  inputTokens: number
  outputTokens: number
  messageCount: number
  savedAt: string
  updatedAt: string
}

export interface SavedSessionDetail {
  id: string
  updatedAt: string
  session: SavedSession
}

export function getSessionsDir(): string {
  return join(getOrcaHome(), 'sessions')
}

export function listSessionFiles(): SavedSessionFile[] {
  const sessionsDir = getSessionsDir()
  try {
    return readdirSync(sessionsDir)
      .filter((file) => file.endsWith('.json'))
      .map((file) => ({
        name: file.replace('.json', ''),
        path: join(sessionsDir, file),
        mtime: statSync(join(sessionsDir, file)).mtime,
      }))
      .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
  } catch {
    return []
  }
}

export function loadSessionFile(path: string): SavedSession | null {
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as SavedSession
  } catch {
    return null
  }
}

export function listSavedSessions(): LoadedSessionFile[] {
  return listSessionFiles().flatMap((file) => {
    const session = loadSessionFile(file.path)
    return session ? [{ ...file, session }] : []
  })
}

export function getLatestSavedSession(): { name: string; session: SavedSession } | null {
  const latest = listSavedSessions()[0]
  return latest ? { name: latest.name, session: latest.session } : null
}

export function getSavedSessionById(id: string): { name: string; session: SavedSession } | null {
  if (!isSafeSessionLookup(id)) return null
  const match = listSavedSessions().find((file) => file.name.includes(id))
  return match ? { name: match.name, session: match.session } : null
}

export function getSavedSessionByName(name: string): { name: string; session: SavedSession } | null {
  if (!isSafeSessionLookup(name)) return null
  const match = listSavedSessions().find((file) => file.name === name)
  return match ? { name: match.name, session: match.session } : null
}

export function getSavedSessionDetailByName(name: string): SavedSessionDetail | null {
  if (!isSafeSessionLookup(name)) return null
  const match = listSavedSessions().find((file) => file.name === name)
  if (!match) return null
  return {
    id: match.name,
    updatedAt: match.mtime.toISOString(),
    session: match.session,
  }
}

export function writeSavedSession(name: string, session: SavedSession): string {
  const sessionsDir = getSessionsDir()
  mkdirSync(sessionsDir, { recursive: true })
  const safeName = sanitizeSessionName(name)
  const sessionFile = join(sessionsDir, `${safeName}.json`)
  writeFileSync(sessionFile, JSON.stringify(session, null, 2), 'utf-8')
  return sessionFile
}

export function renderSavedSessionMarkdown(name: string, session: SavedSession): string {
  const lines: string[] = [
    `# Session: ${name}`,
    '',
    `- Model: ${session.model}`,
    `- Provider: ${session.provider || 'unknown'}`,
    `- Turns: ${session.stats.turns}`,
    `- Saved: ${session.savedAt}`,
  ]

  if (session.modeId) {
    lines.push(`- Mode: ${session.modeId}`)
  }

  lines.push('', '## Transcript', '')

  for (const message of session.history) {
    const role = String(message.role || 'unknown')
    const content = messageContentToMarkdown(message.content)
    lines.push(`### ${role}`, '', content || '_Empty_', '')
  }

  return lines.join('\n')
}

export function writeSessionMarkdownArtifact(name: string, session: SavedSession, filePath: string): string {
  writeFileSync(filePath, renderSavedSessionMarkdown(name, session), 'utf-8')
  return filePath
}

export function buildSessionArtifactMetadata(name: string, session: SavedSession): Record<string, unknown> {
  return {
    kind: 'session-share',
    name,
    model: session.model,
    provider: session.provider || 'unknown',
    modeId: session.modeId || null,
    turns: session.stats.turns,
    inputTokens: session.stats.inputTokens,
    outputTokens: session.stats.outputTokens,
    messageCount: session.history.length,
    savedAt: session.savedAt,
    generatedAt: new Date().toISOString(),
  }
}

export function buildSessionHandoffMetadata(
  sourceName: string,
  handoffName: string,
  session: SavedSession,
): Record<string, unknown> {
  return {
    ...buildSessionArtifactMetadata(handoffName, session),
    kind: 'session-handoff',
    sourceSessionName: sourceName,
  }
}

export function writeSharedSessionArtifact(name: string, session: SavedSession, filePath?: string): SessionArtifactBundle {
  const sharesDir = join(getOrcaHome(), 'shares')
  mkdirSync(sharesDir, { recursive: true })
  const target = filePath || join(sharesDir, `session-${sanitizeArtifactName(name)}.md`)
  const markdownPath = writeSessionMarkdownArtifact(name, session, target)
  const metadataPath = replaceExtension(markdownPath, '.artifact.json')
  writeFileSync(metadataPath, JSON.stringify(buildSessionArtifactMetadata(name, session), null, 2), 'utf-8')
  return { markdownPath, metadataPath }
}

export function writeSessionHandoffArtifact(
  sourceName: string,
  handoffName: string,
  session: SavedSession,
  filePath?: string,
): SessionArtifactBundle {
  const sharesDir = join(getOrcaHome(), 'shares')
  mkdirSync(sharesDir, { recursive: true })
  const target = filePath || join(sharesDir, `handoff-${sanitizeArtifactName(handoffName)}.md`)
  const markdownPath = writeSessionMarkdownArtifact(handoffName, session, target)
  const metadataPath = replaceExtension(markdownPath, '.artifact.json')
  writeFileSync(metadataPath, JSON.stringify(buildSessionHandoffMetadata(sourceName, handoffName, session), null, 2), 'utf-8')
  return { markdownPath, metadataPath }
}

export function cloneSavedSession(
  id: string,
  nextName: string,
  overrides?: Partial<SavedSession>,
): { name: string; session: SavedSession; path: string } | null {
  const existing = getSavedSessionById(id)
  if (!existing) return null
  const cloned: SavedSession = {
    ...existing.session,
    ...overrides,
    history: structuredClone(existing.session.history),
    stats: { ...existing.session.stats },
    savedAt: new Date().toISOString(),
  }
  const path = writeSavedSession(nextName, cloned)
  return { name: nextName, session: cloned, path }
}

export function importSavedSessionFromFile(path: string, nextName?: string): { name: string; session: SavedSession; path: string } {
  const raw = JSON.parse(readFileSync(path, 'utf-8')) as SavedSession
  if (!raw || typeof raw !== 'object' || typeof raw.model !== 'string' || !Array.isArray(raw.history)) {
    throw new Error('invalid session file')
  }
  const name = nextName || `imported-${Date.now()}`
  const session: SavedSession = {
    provider: raw.provider,
    model: raw.model,
    modeId: raw.modeId,
    history: raw.history,
    stats: {
      turns: Number(raw.stats?.turns || 0),
      inputTokens: Number(raw.stats?.inputTokens || 0),
      outputTokens: Number(raw.stats?.outputTokens || 0),
    },
    savedAt: new Date().toISOString(),
  }
  const storedPath = writeSavedSession(name, session)
  return { name, session, path: storedPath }
}

export function listSavedSessionSummaries(): SavedSessionSummary[] {
  return listSavedSessions().map((file) => ({
    id: file.name,
    provider: file.session.provider,
    model: file.session.model,
    modeId: file.session.modeId,
    turns: file.session.stats.turns,
    inputTokens: file.session.stats.inputTokens,
    outputTokens: file.session.stats.outputTokens,
    messageCount: file.session.history.length,
    savedAt: file.session.savedAt,
    updatedAt: file.mtime.toISOString(),
  }))
}

export function getLatestSavedSessionSummary(): SavedSessionSummary | null {
  return listSavedSessionSummaries()[0] || null
}

function sanitizeSessionName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed || !SAFE_SESSION_NAME.test(trimmed)) {
    throw new Error('invalid session name: use letters, numbers, dot, underscore, or hyphen only')
  }
  return trimmed
}

function isSafeSessionLookup(id: string): boolean {
  const trimmed = id.trim()
  return Boolean(trimmed) && SAFE_SESSION_NAME.test(trimmed)
}

function sanitizeArtifactName(name: string): string {
  return basename(name).replace(/[^A-Za-z0-9._-]+/g, '-')
}

function replaceExtension(path: string, nextExtension: string): string {
  return path.replace(/\.[^.]+$/, '') + nextExtension
}

function messageContentToMarkdown(content: ChatMessage['content']): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.map((part) => {
    if (part && typeof part === 'object' && 'type' in part) {
      if (part.type === 'text' && 'text' in part) return String(part.text)
      if (part.type === 'image_url') return '[image]'
    }
    return ''
  }).filter(Boolean).join('\n')
}
