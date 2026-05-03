import { existsSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { homedir } from 'node:os'
import { messageContentToText, type ChatMessage, type PromptContent } from '../providers/openai-compat.js'

export type LocalFileToolName = 'file_info' | 'read_file' | 'write_file' | 'open_file'

export interface LocalFileToolRequest {
  name: LocalFileToolName
  args: Record<string, unknown>
}

export interface LocalFilePlan {
  reason:
    | 'direct-open'
    | 'direct-read'
    | 'direct-write'
    | 'repair-missing-claimed-file'
    | 'repair-false-save-claim'
    | 'write-generated-artifact'
  path: string
  toolCalls: LocalFileToolRequest[]
  summary: string
}

export interface LocalFileToolResult {
  name: string
  success: boolean
  output: string
}

const FILE_EXTENSIONS = [
  'md',
  'markdown',
  'txt',
  'html',
  'json',
  'csv',
  'pdf',
  'png',
  'jpg',
  'jpeg',
  'webp',
  'gif',
  'ts',
  'tsx',
  'js',
  'jsx',
  'py',
  'go',
  'rs',
  'java',
  'sh',
  'yaml',
  'yml',
]

const EXT_PATTERN = FILE_EXTENSIONS.join('|')
const BACKTICK_PATH_RE = new RegExp('`([^`\\n]+\\.(' + EXT_PATTERN + '))`', 'gi')
const ABSOLUTE_PATH_RE = new RegExp('((?:~|/|\\.{1,2}/)[^\\n`"\'<>]*?\\.(' + EXT_PATTERN + '))(?=$|[\\s，。；;：:)）\\]])', 'gi')
const SAVE_RE = /(?:保存|写入|创建|生成|新建|落盘|存到|输出到|save|write|create|generate)/i
const OPEN_RE = /(?:打开|open)/i
const READ_RE = /(?:读取|读一下|看看|查看|验证|在哪里|在哪|路径|read|show|where|verify)/i
const MISSING_RE = /(?:没有|不存在|找不到|not found|missing|does not exist)/i
const FALSE_SAVE_RE = /(?:已保存|保存到|文件路径|created|saved|written|wrote)/i
const REFERS_TO_PRIOR_RE = /(?:上面|前面|上一条|刚才|这个文件|该文件|聊天记录|对话|previous|above|that file|this file)/i
const REFUSAL_RE = /(?:无法在你的本地|无法.*(?:创建|写入|打开)|不能.*(?:创建|写入|打开)|technical limitation|cannot.*(?:create|write|open))/i
const WRITE_EVIDENCE_TOOLS = new Set(['write_file', 'edit_file', 'multi_edit', 'patch_file'])
const OPEN_EVIDENCE_TOOLS = new Set(['open_file'])
const READ_EVIDENCE_TOOLS = new Set(['file_info', 'read_file'])

export function promptContentToPlainText(prompt: PromptContent): string {
  return messageContentToText(prompt).trim()
}

export function resolveLocalPathForIntent(path: string, cwd: string): string {
  const trimmed = stripPathPunctuation(path.trim())
  if (trimmed === '~') return homedir()
  if (trimmed.startsWith('~/')) return resolve(homedir(), trimmed.slice(2))
  return isAbsolute(trimmed) ? trimmed : resolve(cwd, trimmed)
}

export function extractLocalFilePaths(text: string, cwd: string): string[] {
  const paths: string[] = []
  const pushPath = (raw: string | undefined) => {
    if (!raw) return
    const cleaned = stripPathPunctuation(raw)
    if (!cleaned || /^https?:\/\//i.test(cleaned)) return
    const resolved = resolveLocalPathForIntent(cleaned, cwd)
    if (!paths.includes(resolved)) paths.push(resolved)
  }

  for (const match of text.matchAll(BACKTICK_PATH_RE)) pushPath(match[1])
  for (const match of text.matchAll(ABSOLUTE_PATH_RE)) pushPath(match[1])
  return paths
}

export function buildPreModelLocalFilePlan(options: {
  prompt: PromptContent
  history: ChatMessage[]
  cwd: string
}): LocalFilePlan | null {
  const promptText = promptContentToPlainText(options.prompt)
  if (!promptText) return null

  const promptPaths = extractLocalFilePaths(promptText, options.cwd)
  const historyPath = findLatestPathInHistory(options.history, options.cwd)
  const path = promptPaths[0] || historyPath
  if (!path) return null

  const wantsOpen = OPEN_RE.test(promptText)
  const wantsRead = READ_RE.test(promptText)
  const wantsSave = SAVE_RE.test(promptText)
  if (!wantsOpen && !wantsRead && !wantsSave) return null

  const explicitContent = extractPromptWriteContent(promptText)
  if (wantsSave && explicitContent) {
    return {
      reason: 'direct-write',
      path,
      toolCalls: [
        { name: 'write_file', args: { path, content: explicitContent } },
        ...(wantsOpen ? [{ name: 'open_file' as const, args: { path } }] : []),
      ],
      summary: `Local file request handled: wrote ${path}${wantsOpen ? ' and opened it' : ''}.`,
    }
  }

  if ((wantsOpen || wantsRead) && existsSync(path)) {
    return {
      reason: wantsOpen ? 'direct-open' : 'direct-read',
      path,
      toolCalls: [
        ...(wantsRead ? [{ name: 'file_info' as const, args: { path } }] : []),
        ...(wantsOpen ? [{ name: 'open_file' as const, args: { path } }] : []),
      ],
      summary: `Local file request handled: ${wantsOpen ? 'opened' : 'verified'} ${path}.`,
    }
  }

  const repairContent = findRepairContentForPath(options.history, path, options.cwd)
  const canRepairMissingClaim = Boolean(repairContent)
    && (MISSING_RE.test(promptText) || REFERS_TO_PRIOR_RE.test(promptText) || wantsOpen)
    && !existsSync(path)

  if (canRepairMissingClaim) {
    return {
      reason: 'repair-missing-claimed-file',
      path,
      toolCalls: [
        { name: 'write_file', args: { path, content: repairContent } },
        ...(wantsOpen ? [{ name: 'open_file' as const, args: { path } }] : []),
      ],
      summary: `Local file guard repaired the missing claimed file: ${path}${wantsOpen ? ' and opened it' : ''}.`,
    }
  }

  return null
}

export function buildPostModelSaveRepairPlan(options: {
  prompt: PromptContent
  responseText: string
  history: ChatMessage[]
  cwd: string
  executedToolNames: string[]
}): LocalFilePlan | null {
  if (options.executedToolNames.some((name) => name === 'write_file' || name === 'open_file')) return null
  const promptText = promptContentToPlainText(options.prompt)
  if (!SAVE_RE.test(promptText) && !FALSE_SAVE_RE.test(options.responseText)) return null
  if (REFUSAL_RE.test(options.responseText)) return null
  if (!FALSE_SAVE_RE.test(options.responseText)) return null

  const responsePaths = extractLocalFilePaths(options.responseText, options.cwd)
  const path = responsePaths[0]
  if (!path || existsSync(path)) return null

  const content = selectAssistantContentForFile(options.responseText)
  if (!content) return null

  return {
    reason: 'repair-false-save-claim',
    path,
    toolCalls: [{ name: 'write_file', args: { path, content } }],
    summary: `Local file guard wrote the file that the assistant claimed was saved: ${path}.`,
  }
}

export function buildPostModelRequiredFileWritePlan(options: {
  prompt: PromptContent
  responseText: string
  history: ChatMessage[]
  cwd: string
  executedToolNames: string[]
}): LocalFilePlan | null {
  if (hasAnyExecutedTool(options.executedToolNames, WRITE_EVIDENCE_TOOLS)) return null

  const promptText = promptContentToPlainText(options.prompt)
  if (!SAVE_RE.test(promptText)) return null
  if (REFUSAL_RE.test(options.responseText)) return null
  const wantsOpen = OPEN_RE.test(promptText)

  const promptPaths = extractLocalFilePaths(promptText, options.cwd)
  const path = promptPaths[0] || findLatestPathInHistory(options.history, options.cwd)
  if (!path) return null

  const content = selectAssistantContentForFile(options.responseText)
  if (!content) return null

  return {
    reason: 'write-generated-artifact',
    path,
    toolCalls: [
      { name: 'write_file', args: { path, content } },
      ...(wantsOpen ? [{ name: 'open_file' as const, args: { path } }] : []),
    ],
    summary: `Local file guard wrote the requested generated file: ${path}${wantsOpen ? ' and opened it' : ''}.`,
  }
}

export function buildLocalFileEnforcementNotice(options: {
  prompt: PromptContent
  history: ChatMessage[]
  cwd: string
  executedToolNames: string[]
}): string | null {
  const promptText = promptContentToPlainText(options.prompt)
  if (!promptText) return null

  const promptPaths = extractLocalFilePaths(promptText, options.cwd)
  const path = promptPaths[0] || findLatestPathInHistory(options.history, options.cwd)
  if (!path) return null

  const missing: string[] = []
  if (SAVE_RE.test(promptText) && !hasAnyExecutedTool(options.executedToolNames, WRITE_EVIDENCE_TOOLS)) {
    missing.push(`write_file for ${path}`)
  }
  if (OPEN_RE.test(promptText) && !hasAnyExecutedTool(options.executedToolNames, OPEN_EVIDENCE_TOOLS)) {
    missing.push(`open_file for ${path}`)
  }
  const hasReadEvidence = hasAnyExecutedTool(options.executedToolNames, READ_EVIDENCE_TOOLS)
    || hasAnyExecutedTool(options.executedToolNames, OPEN_EVIDENCE_TOOLS)
  if (READ_RE.test(promptText) && !hasReadEvidence) {
    missing.push(`file_info/read_file for ${path}`)
  }
  if (missing.length === 0) return null

  return [
    'Local file enforcement: requested local file operation did not run.',
    ...missing.map((item) => `- missing ${item}`),
    'Treat the file request as incomplete; the response is not evidence that the local file exists, was written, or was opened.',
  ].join('\n')
}

export function formatLocalFilePlanResult(plan: LocalFilePlan, results: LocalFileToolResult[]): string {
  const failed = results.filter((result) => !result.success)
  const lines = [
    failed.length === 0 ? plan.summary : `Local file request partially failed for ${plan.path}.`,
    '',
    ...results.map((result) => `- ${result.name}: ${result.success ? 'OK' : 'ERROR'} - ${result.output}`),
  ]
  return lines.join('\n')
}

function hasAnyExecutedTool(executedToolNames: string[], expected: Set<string>): boolean {
  return executedToolNames.some((name) => expected.has(name))
}

function stripPathPunctuation(path: string): string {
  return path
    .replace(/^[`"'“”‘’\s]+/, '')
    .replace(/[`"'“”‘’\s，。；;：:)）\]]+$/u, '')
}

function findLatestPathInHistory(history: ChatMessage[], cwd: string): string | undefined {
  for (let index = history.length - 1; index >= 0; index--) {
    const text = messageContentToText(history[index]!.content)
    const paths = extractLocalFilePaths(text, cwd)
    if (paths.length > 0) return paths[0]
  }
  return undefined
}

function findRepairContentForPath(history: ChatMessage[], path: string, cwd: string): string | null {
  for (let index = history.length - 1; index >= 0; index--) {
    const message = history[index]!
    if (message.role !== 'assistant') continue
    const text = messageContentToText(message.content).trim()
    if (!text || REFUSAL_RE.test(text)) continue
    const paths = extractLocalFilePaths(text, cwd)
    if (paths.includes(path) || text.includes(path)) return selectAssistantContentForFile(text)
  }

  for (let index = history.length - 1; index >= 0; index--) {
    const message = history[index]!
    if (message.role !== 'assistant') continue
    const text = messageContentToText(message.content).trim()
    if (text.length >= 200 && !REFUSAL_RE.test(text)) return selectAssistantContentForFile(text)
  }

  return null
}

function selectAssistantContentForFile(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  const fenced = extractMarkdownFencedContent(trimmed)
  if (fenced) return ensureTrailingNewline(fenced)

  const markedContent = extractAfterContentMarker(trimmed)
  if (markedContent) return ensureTrailingNewline(markedContent)

  const claimStripped = stripSaveClaimLeadIn(trimmed)
  const artifactStart = findMarkdownArtifactStart(claimStripped)
  if (artifactStart >= 0) return ensureTrailingNewline(claimStripped.slice(artifactStart).trim())

  const candidate = claimStripped.trim()
  if (looksLikeStandaloneMarkdownArtifact(candidate)) return ensureTrailingNewline(candidate)

  return null
}

function extractPromptWriteContent(promptText: string): string | null {
  const fenced = promptText.match(/```[a-zA-Z0-9_-]*\n([\s\S]*?)```/)
  if (fenced?.[1]?.trim()) return fenced[1].trim() + '\n'

  const marker = promptText.match(/(?:内容|content)\s*[:：]\s*([\s\S]+)$/i)
  if (marker?.[1]?.trim()) return marker[1].trim() + '\n'

  return null
}

function extractMarkdownFencedContent(text: string): string | null {
  const blocks = [...text.matchAll(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g)]
  for (const block of blocks) {
    const language = (block[1] || '').toLowerCase()
    const content = block[2]?.trim()
    if (!content) continue
    if (!language || ['md', 'markdown', 'text', 'txt'].includes(language)) return content
  }
  return null
}

function extractAfterContentMarker(text: string): string | null {
  const marker = text.match(/(?:文件内容|正文内容|正文|内容如下|markdown\s+content|content)\s*[:：]\s*\n+([\s\S]+)$/i)
  const content = marker?.[1]?.trim()
  if (!content) return null
  const start = findMarkdownArtifactStart(content)
  return start >= 0 ? content.slice(start).trim() : content
}

function stripSaveClaimLeadIn(text: string): string {
  const lines = text.split(/\r?\n/)
  while (lines.length > 0) {
    const line = lines[0]!.trim()
    if (!line) {
      lines.shift()
      continue
    }
    if (FALSE_SAVE_RE.test(line) && extractLocalFilePaths(line, process.cwd()).length > 0) {
      lines.shift()
      continue
    }
    if (/^(好的|已完成|完成|done|sure|ok)[，。,.\s]/i.test(line)) {
      lines.shift()
      continue
    }
    break
  }
  return lines.join('\n').trim()
}

function findMarkdownArtifactStart(text: string): number {
  const patterns = [
    /^---\s*$/m,
    /^#{1,6}\s+\S/m,
    /^\|.+\|\s*$/m,
    /^(?:[-*+]|\d+\.)\s+\S/m,
    /^>\s+\S/m,
  ]

  const indexes = patterns
    .map((pattern) => {
      const match = pattern.exec(text)
      return typeof match?.index === 'number' ? match.index : -1
    })
    .filter((index) => index >= 0)

  return indexes.length > 0 ? Math.min(...indexes) : -1
}

function looksLikeStandaloneMarkdownArtifact(text: string): boolean {
  if (!text || text.length < 20) return false
  if (/(?:已保存|保存到|created|saved|written|wrote).{0,80}(?:\.md|\.markdown|\.txt)/i.test(text)) return false
  if (/(?:你可以复制|无法在你的本地|technical limitation|cannot create|cannot write)/i.test(text)) return false

  const markdownSignals = [
    /^#{1,6}\s+\S/m,
    /^---\s*$/m,
    /^\|.+\|\s*$/m,
    /^(?:[-*+]|\d+\.)\s+\S/m,
    /`[^`]+`/,
    /\*\*[^*]+\*\*/,
  ].filter((pattern) => pattern.test(text)).length

  return markdownSignals >= 2
}

function ensureTrailingNewline(text: string): string {
  return text.endsWith('\n') ? text : `${text}\n`
}
