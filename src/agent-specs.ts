import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

export interface AgentSpec {
  name: string
  source: 'claude' | 'codex' | 'armature'
  path: string
  description: string
}

export function extractFrontmatterValue(content: string, key: string): string | null {
  const lines = content.split('\n')
  if (lines[0]?.trim() !== '---') return null
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (!line || line.trim() === '---') break
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.+)$/)
    if (match?.[1] === key) {
      return match[2]!.trim().replace(/^['"]|['"]$/g, '')
    }
  }
  return null
}

export function extractMarkdownSummary(content: string, fallback: string): string {
  const frontmatterDescription = extractFrontmatterValue(content, 'description')
  if (frontmatterDescription) return frontmatterDescription.slice(0, 160)
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed === '---' || trimmed.startsWith('#')) continue
    if (/^[A-Za-z0-9_-]+:\s/.test(trimmed)) continue
    return trimmed.slice(0, 160)
  }
  return fallback
}

export function discoverAgentSpecs(cwd: string): AgentSpec[] {
  const home = process.env.HOME || '/tmp'
  const roots: Array<{ path: string; source: AgentSpec['source'] }> = [
    { path: join(cwd, '.claude', 'agents'), source: 'claude' },
    { path: join(home, '.claude', 'agents'), source: 'claude' },
    { path: join(cwd, '.codex', 'agents'), source: 'codex' },
    { path: join(home, '.codex', 'agents'), source: 'codex' },
    { path: join(cwd, '.armature', 'agents'), source: 'armature' },
  ]
  const seen = new Set<string>()
  const specs: AgentSpec[] = []
  for (const root of roots) {
    if (!existsSync(root.path)) continue
    let entries: string[]
    try {
      entries = readdirSync(root.path).sort()
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.endsWith('.md')) continue
      const name = entry.replace(/\.md$/, '')
      const key = `${root.source}:${name}`
      if (seen.has(key)) continue
      const filePath = join(root.path, entry)
      try {
        const content = readFileSync(filePath, 'utf-8')
        seen.add(key)
        specs.push({
          name,
          source: root.source,
          path: filePath,
          description: extractMarkdownSummary(content, name),
        })
      } catch {
        // skip unreadable agent specs
      }
    }
  }
  return specs
}
