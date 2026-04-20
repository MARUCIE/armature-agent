import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
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

export function writeSavedSession(name: string, session: SavedSession): string {
  const sessionsDir = getSessionsDir()
  mkdirSync(sessionsDir, { recursive: true })
  const safeName = sanitizeSessionName(name)
  const sessionFile = join(sessionsDir, `${safeName}.json`)
  writeFileSync(sessionFile, JSON.stringify(session, null, 2), 'utf-8')
  return sessionFile
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
