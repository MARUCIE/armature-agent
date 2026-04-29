/**
 * Thread-based conversation persistence (Amp-style).
 *
 * Each thread is a standalone JSON file under ~/.orca/threads/.
 * Threads support create / list / load / append / search / delete.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'

export interface ThreadMessage {
  role: string
  content: string
}

export interface ThreadRecord {
  id: string
  title: string
  messages: ThreadMessage[]
  createdAt: string
  updatedAt: string
  metadata?: Record<string, unknown>
}

export interface ThreadArtifactBundle {
  markdownPath: string
  metadataPath: string
}

export class ThreadManager {
  private threadsDir: string

  constructor() {
    this.threadsDir = join(homedir(), '.orca', 'threads')
    if (!existsSync(this.threadsDir)) {
      mkdirSync(this.threadsDir, { recursive: true })
    }
  }

  /** Returns the directory path where thread files are stored */
  getThreadsDir(): string {
    return this.threadsDir
  }

  /** Create a new thread and persist it to disk */
  create(
    title: string,
    messages: ThreadMessage[] = [],
    metadata?: Record<string, unknown>
  ): ThreadRecord {
    const now = new Date().toISOString()
    const id = `thread-${Date.now()}-${randomChars(6)}`
    const record: ThreadRecord = {
      id,
      title,
      messages,
      createdAt: now,
      updatedAt: now,
      ...(metadata !== undefined ? { metadata } : {}),
    }
    this.save(record)
    return record
  }

  /** List threads sorted by updatedAt descending */
  list(limit = 20): ThreadRecord[] {
    const files = this.threadFiles()
    const threads: ThreadRecord[] = []

    for (const file of files) {
      const record = this.readFile(file)
      if (record) threads.push(record)
    }

    threads.sort((a, b) => (b.updatedAt > a.updatedAt ? 1 : b.updatedAt < a.updatedAt ? -1 : 0))
    return threads.slice(0, limit)
  }

  /** Load a single thread by id. Returns null if not found */
  load(id: string): ThreadRecord | null {
    const filePath = join(this.threadsDir, `${id}.json`)
    return this.readFile(filePath)
  }

  /** Append messages to an existing thread */
  append(id: string, messages: ThreadMessage[]): ThreadRecord | null {
    const record = this.load(id)
    if (!record) return null
    record.messages.push(...messages)
    record.updatedAt = new Date().toISOString()
    this.save(record)
    return record
  }

  /** Clone a thread into a new record */
  fork(id: string, title?: string, metadata?: Record<string, unknown>): ThreadRecord | null {
    const record = this.load(id)
    if (!record) return null
    return this.create(
      title || `${record.title} (fork)`,
      structuredClone(record.messages),
      {
        ...(record.metadata || {}),
        ...(metadata || {}),
        sourceThreadId: record.id,
      },
    )
  }

  /** Simple keyword search across thread titles and message content */
  search(query: string, limit = 5): ThreadRecord[] {
    const q = query.toLowerCase()
    const files = this.threadFiles()
    const matches: ThreadRecord[] = []

    for (const file of files) {
      const record = this.readFile(file)
      if (!record) continue

      if (record.title.toLowerCase().includes(q)) {
        matches.push(record)
        continue
      }

      const messageHit = record.messages.some((m) => m.content.toLowerCase().includes(q))
      if (messageHit) matches.push(record)
    }

    matches.sort((a, b) => (b.updatedAt > a.updatedAt ? 1 : b.updatedAt < a.updatedAt ? -1 : 0))
    return matches.slice(0, limit)
  }

  /** Delete a thread file by id. Returns true if deleted, false if not found */
  delete(id: string): boolean {
    const filePath = join(this.threadsDir, `${id}.json`)
    if (!existsSync(filePath)) return false
    unlinkSync(filePath)
    return true
  }

  /** Import a thread record from a JSON file */
  importFromFile(path: string, titleOverride?: string): ThreadRecord {
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as ThreadRecord
    if (!raw || typeof raw !== 'object' || typeof raw.title !== 'string' || !Array.isArray(raw.messages)) {
      throw new Error('invalid thread file')
    }
    return this.create(
      titleOverride || raw.title,
      raw.messages,
      {
        ...(raw.metadata || {}),
        importedAt: new Date().toISOString(),
      },
    )
  }

  renderMarkdown(record: ThreadRecord): string {
    const lines: string[] = [
      `# Thread: ${record.title}`,
      '',
      `- ID: ${record.id}`,
      `- Created: ${record.createdAt}`,
      `- Updated: ${record.updatedAt}`,
      `- Messages: ${record.messages.length}`,
    ]

    if (record.metadata && Object.keys(record.metadata).length > 0) {
      lines.push(`- Metadata: ${JSON.stringify(record.metadata)}`)
    }

    lines.push('', '## Transcript', '')

    for (const message of record.messages) {
      lines.push(`### ${message.role}`, '', message.content || '_Empty_', '')
    }

    return lines.join('\n')
  }

  exportMarkdown(id: string, filePath: string): boolean {
    const record = this.load(id)
    if (!record) return false
    writeFileSync(filePath, this.renderMarkdown(record), 'utf-8')
    return true
  }

  share(id: string, filePath?: string): string | null {
    const record = this.load(id)
    if (!record) return null
    const bundle = this.writeArtifactBundle(record, 'thread-share', filePath)
    return bundle.markdownPath
  }

  shareBundle(id: string, filePath?: string): ThreadArtifactBundle | null {
    const record = this.load(id)
    if (!record) return null
    return this.writeArtifactBundle(record, 'thread-share', filePath)
  }

  writeHandoffBundle(id: string, sourceThreadId?: string): ThreadArtifactBundle | null {
    const record = this.load(id)
    if (!record) return null
    return this.writeArtifactBundle(record, 'thread-handoff', undefined, {
      sourceThreadId: sourceThreadId || record.metadata?.sourceThreadId || null,
      handoff: true,
    })
  }

  private writeArtifactBundle(
    record: ThreadRecord,
    kind: 'thread-share' | 'thread-handoff',
    filePath?: string,
    extraMetadata?: Record<string, unknown>,
  ): ThreadArtifactBundle {
    const sharesDir = join(this.threadsDir, '..', 'shares')
    mkdirSync(sharesDir, { recursive: true })
    const stem = kind === 'thread-handoff' ? `handoff-${sanitizeArtifactName(record.id)}` : `thread-${sanitizeArtifactName(record.id)}`
    const markdownPath = filePath || join(sharesDir, `${stem}.md`)
    writeFileSync(markdownPath, this.renderMarkdown(record), 'utf-8')
    const metadataPath = replaceExtension(markdownPath, '.artifact.json')
    writeFileSync(metadataPath, JSON.stringify({
      kind,
      threadId: record.id,
      title: record.title,
      messageCount: record.messages.length,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      generatedAt: new Date().toISOString(),
      metadata: record.metadata || {},
      ...extraMetadata,
    }, null, 2), 'utf-8')
    return { markdownPath, metadataPath }
  }

  // --- internal helpers ---

  private save(record: ThreadRecord): void {
    const filePath = join(this.threadsDir, `${record.id}.json`)
    writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf-8')
  }

  private readFile(filePath: string): ThreadRecord | null {
    if (!existsSync(filePath)) return null
    try {
      const raw = readFileSync(filePath, 'utf-8')
      return JSON.parse(raw) as ThreadRecord
    } catch {
      return null
    }
  }

  private threadFiles(): string[] {
    if (!existsSync(this.threadsDir)) return []
    return readdirSync(this.threadsDir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => join(this.threadsDir, f))
  }
}

/** Generate a random alphanumeric string of the given length */
function randomChars(len: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < len; i++) {
    result += chars[Math.floor(Math.random() * chars.length)]
  }
  return result
}

function sanitizeArtifactName(name: string): string {
  return basename(name).replace(/[^A-Za-z0-9._-]+/g, '-')
}

function replaceExtension(path: string, nextExtension: string): string {
  return path.replace(/\.[^.]+$/, '') + nextExtension
}
