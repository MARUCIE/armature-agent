import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { detectFormat } from '../preprocess/index.js'
import { preprocessFile } from '../preprocess/index.js'
import type { PromptContent } from '../providers/openai-compat.js'

export interface FileExpansionResult {
  text: string
  injectedPaths: Set<string>
}

export interface ExtractedImagePromptInput {
  prompt: string
  imagePaths: string[]
}

const READ_ONLY_GIT_SUBCOMMANDS = new Set([
  'status',
  'log',
  'diff',
  'show',
  'rev-parse',
  'ls-files',
  'branch',
])

const UNSAFE_GIT_SLASH_ARGS = new Set([
  '-o',
  '--output',
  '--ext-diff',
  '--no-index',
])

const FILE_EXTENSION_PATTERN = 'html|htm|md|ts|tsx|js|jsx|json|txt|py|go|rs|css|scss|yaml|yml|toml|xml|csv|sql|sh|zsh|bash|swift|kt|java|c|cpp|h|rb|php|vue|svelte|png|jpg|jpeg|gif|webp|bmp|pdf|docx|pptx|xlsx|svg|mp3|wav|m4a|ogg|flac|mp4|mov|avi|mkv'
const FILE_URL_REGEX = /file:\/\/\/([\S]+)/g
const QUOTED_PATH_REGEX = new RegExp(
  String.raw`(?:^|\s)(["'])((?:\/|~\/|\.\/)[^"'\n]+\.(?:${FILE_EXTENSION_PATTERN}))\1`,
  'g',
)
const ABSOLUTE_OR_HOME_PATH_REGEX = new RegExp(
  String.raw`(?:^|\s)((?:\/|~\/)(?:\\ |[^\s"'<>])+?\.(?:${FILE_EXTENSION_PATTERN}))(?=$|\s|['")\]}>，。；,])`,
  'g',
)
const RELATIVE_PATH_REGEX = new RegExp(
  String.raw`(?:^|\s)((?:\.\/)(?:\\ |[^\s"'<>])+?\.(?:${FILE_EXTENSION_PATTERN}))(?=$|\s|['")\]}>，。；,])`,
  'g',
)

function stripWrappingQuotes(raw: string): string {
  const trimmed = raw.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function stripTrailingPathPunctuation(raw: string): string {
  return raw.replace(/['")\]}>，。；,]+$/, '')
}

function unescapeShellPath(raw: string): string {
  return raw
    .replace(/\\ /g, ' ')
    .replace(/\\([(){}\[\]'"])/g, '$1')
    .replace(/\\\\/g, '\\')
}

function normalizePathCandidate(raw: string): string {
  let normalized = stripTrailingPathPunctuation(stripWrappingQuotes(raw))

  if (normalized.startsWith('file:///')) {
    try { normalized = decodeURI(normalized) } catch {}
    normalized = '/' + normalized.slice(8)
  }

  return unescapeShellPath(normalized)
}

export function isStandalonePathPrompt(prompt: string): boolean {
  const trimmed = prompt.trim()
  if (!trimmed) return false

  const unwrapped = stripWrappingQuotes(trimmed)
  if (
    unwrapped.startsWith('file:///') ||
    unwrapped.startsWith('/') ||
    unwrapped.startsWith('~/') ||
    unwrapped.startsWith('./')
  ) {
    return !/(^|[^\\])\s/.test(unwrapped)
      || unwrapped !== trimmed
  }

  return false
}

export function tokenizeCommandLine(input: string): string[] {
  const tokens: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  let escape = false

  for (const ch of input) {
    if (escape) {
      current += ch
      escape = false
      continue
    }

    if (ch === '\\' && quote !== "'") {
      escape = true
      continue
    }

    if ((ch === '"' || ch === "'")) {
      if (quote === ch) {
        quote = null
        continue
      }
      if (!quote) {
        quote = ch
        continue
      }
    }

    if (!quote && /\s/.test(ch)) {
      if (current) {
        tokens.push(current)
        current = ''
      }
      continue
    }

    current += ch
  }

  if (escape) current += '\\'
  if (quote) throw new Error('Unterminated quote in /git command')
  if (current) tokens.push(current)
  return tokens
}

export function buildSafeGitSlashArgs(arg: string): string[] {
  const gitArgs = tokenizeCommandLine(arg)
  if (gitArgs.length === 0) throw new Error('No git command provided')

  const subcommand = gitArgs[0]!
  if (!READ_ONLY_GIT_SUBCOMMANDS.has(subcommand)) {
    throw new Error(`Unsupported /git subcommand: ${subcommand}. Allowed: ${[...READ_ONLY_GIT_SUBCOMMANDS].join(', ')}`)
  }

  if (subcommand === 'branch') {
    validateReadOnlyBranchArgs(gitArgs.slice(1))
  }

  for (const gitArg of gitArgs.slice(1)) {
    if (UNSAFE_GIT_SLASH_ARGS.has(gitArg) || gitArg.startsWith('--output=')) {
      throw new Error(`Unsafe /git argument: ${gitArg}`)
    }
  }

  return gitArgs
}

function validateReadOnlyBranchArgs(args: string[]): void {
  if (args.length === 0) return

  const SAFE_BRANCH_FLAGS = new Set([
    '--list',
    '-l',
    '--show-current',
    '-a',
    '--all',
    '-r',
    '--remotes',
  ])

  let allowsPatterns = false
  for (const arg of args) {
    if (SAFE_BRANCH_FLAGS.has(arg)) {
      if (arg === '--list' || arg === '-l') allowsPatterns = true
      continue
    }
    if (arg.startsWith('-')) {
      throw new Error(`Unsafe /git branch argument: ${arg}`)
    }
    if (!allowsPatterns) {
      throw new Error(`Unsafe /git branch argument: ${arg}`)
    }
  }
}

function appendDedupHint(text: string, paths: Set<string>): string {
  if (paths.size === 0) return text
  return text + `\n\n<context-note>The file content above has been preprocessed and fully injected. Do NOT call read_file on these paths — their content is already complete in context: ${[...paths].join(', ')}</context-note>`
}

export function resolveFilePath(p: string, home: string, cwd: string): string | null {
  let resolvedPath = normalizePathCandidate(p)
  if (resolvedPath.startsWith('~') && home) resolvedPath = home + resolvedPath.slice(1)
  if (!resolvedPath.startsWith('/')) resolvedPath = join(cwd, resolvedPath)
  try {
    if (existsSync(resolvedPath) && !statSync(resolvedPath).isDirectory()) return resolvedPath
  } catch {}
  return null
}

function resolveDirectoryPath(p: string, home: string, cwd: string): string | null {
  let resolvedPath = normalizePathCandidate(p)
  if (resolvedPath.startsWith('~') && home) resolvedPath = home + resolvedPath.slice(1)
  if (!resolvedPath.startsWith('/')) resolvedPath = join(cwd, resolvedPath)
  try {
    if (existsSync(resolvedPath) && statSync(resolvedPath).isDirectory()) return resolvedPath
  } catch {}
  return null
}

function tryReadFile(filePath: string): string | null {
  try {
    if (!existsSync(filePath)) return null
    const stat = statSync(filePath)
    if (stat.isDirectory()) return null
    if (stat.size > 50 * 1024 * 1024) return null

    const format = detectFormat(filePath)
    if (format.category === 'text' || format.converter === 'passthrough') {
      if (stat.size > 500_000) return null
      return readFileSync(filePath, 'utf-8')
    }

    const result = preprocessFile(filePath)
    if (result.success) {
      const savings = result.savingsRatio > 1.5 ? ` (${result.savingsRatio.toFixed(1)}x smaller)` : ''
      process.stderr.write(`\x1b[90m  [preprocess] ${result.fileName}: ${result.method} → ${(result.convertedSize / 1024).toFixed(1)}KB${savings}\x1b[0m\n`)
      return result.markdown
    }

    if (stat.size > 500_000) return null
    return readFileSync(filePath, 'utf-8')
  } catch {
    return null
  }
}

function truncateFileContent(content: string): string {
  if (content.length <= 20_000) return content
  return content.slice(0, 20_000) + `\n[... truncated at 20KB, original ${(content.length / 1024).toFixed(0)}KB]`
}

function tryExpandDirectory(prompt: string, home: string, cwd: string): string | null {
  let dirPath: string | null = null
  let userText = ''

  const trimmed = prompt.trim()
  dirPath = resolveDirectoryPath(trimmed, home, cwd)

  if (!dirPath) {
    const unwrapped = stripWrappingQuotes(trimmed)
    if (unwrapped !== trimmed) {
      dirPath = resolveDirectoryPath(unwrapped, home, cwd)
    }
  }

  if (!dirPath) {
    const trailingQuotedDirMatch = trimmed.match(/^(.+?)\s+(["'])((?:\/|~\/|\.\/).+?)\2\s*$/s)
    if (trailingQuotedDirMatch) {
      const resolvedPath = resolveDirectoryPath(trailingQuotedDirMatch[3]!, home, cwd)
      if (resolvedPath) {
        dirPath = resolvedPath
        userText = trailingQuotedDirMatch[1]!.trim()
      }
    }
  }

  if (!dirPath) {
    const trailingDirMatch = trimmed.match(
      new RegExp(String.raw`^(.+?)\s+((?:\/|~\/|\.\/)(?:\\ |[^\s"'<>])+)\s*$`, 's'),
    )
    if (trailingDirMatch) {
      const resolvedPath = resolveDirectoryPath(trailingDirMatch[2]!, home, cwd)
      if (resolvedPath) {
        dirPath = resolvedPath
        userText = trailingDirMatch[1]!.trim()
      }
    }
  }

  if (!dirPath) {
    const leadingQuotedDirMatch = trimmed.match(/^(["'])((?:\/|~\/|\.\/).+?)\1\s+(.+)$/s)
    if (leadingQuotedDirMatch) {
      const resolvedPath = resolveDirectoryPath(leadingQuotedDirMatch[2]!, home, cwd)
      if (resolvedPath) {
        dirPath = resolvedPath
        userText = leadingQuotedDirMatch[3]!.trim()
      }
    }
  }

  if (!dirPath) {
    const leadingDirMatch = trimmed.match(
      new RegExp(String.raw`^((?:\/|~\/|\.\/)(?:\\ |[^\s"'<>])+)\s+(.+)$`, 's'),
    )
    if (leadingDirMatch) {
      const resolvedPath = resolveDirectoryPath(leadingDirMatch[1]!, home, cwd)
      if (resolvedPath) {
        dirPath = resolvedPath
        userText = leadingDirMatch[2]!.trim()
      }
    }
  }

  if (!dirPath) return null

  const parts: string[] = []
  const injected = new Set<string>()
  let totalChars = 0
  const maxTotal = 60_000
  const projectFiles = [
    'CLAUDE.md', 'README.md', 'AGENTS.md', 'CODEX.md',
    'package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod', 'Makefile', 'Dockerfile',
    'tsconfig.json', '.env.example',
    'doc/index.md', 'doc/00_project/initiative_*/PRD.md',
  ]

  for (const pattern of projectFiles) {
    if (totalChars >= maxTotal) break
    if (pattern.includes('*')) {
      try {
        const dir = join(dirPath, pattern.split('*')[0]!)
        if (existsSync(dir) && statSync(dir).isDirectory()) {
          const entries = readdirSync(dir)
          for (const entry of entries) {
            const fp = join(dir, entry, pattern.split('/').pop()!.replace('*', ''))
            if (existsSync(fp) && !statSync(fp).isDirectory()) {
              const content = tryReadFile(fp)
              if (content && !injected.has(fp)) {
                injected.add(fp)
                const truncated = truncateFileContent(content)
                parts.push(`<file path="${fp}">\n${truncated}\n</file>`)
                totalChars += truncated.length
              }
            }
          }
        }
      } catch {}
      continue
    }

    const fp = join(dirPath, pattern)
    if (!existsSync(fp) || statSync(fp).isDirectory()) continue
    if (injected.has(fp)) continue

    const content = tryReadFile(fp)
    if (content === null) continue

    injected.add(fp)
    const truncated = truncateFileContent(content)
    parts.push(`<file path="${fp}">\n${truncated}\n</file>`)
    totalChars += truncated.length
  }

  try {
    const tree = execFileSync(
      'find',
      [
        dirPath,
        '-maxdepth', '3',
        '-not', '-path', '*/node_modules/*',
        '-not', '-path', '*/.git/*',
        '-not', '-path', '*/dist/*',
        '-not', '-path', '*/__pycache__/*',
        '-not', '-path', '*/.orca-worktrees/*',
      ],
      { encoding: 'utf-8', timeout: 5_000 },
    )
      .split('\n')
      .slice(0, 200)
      .join('\n')
      .trim()
    if (tree) {
      const relTree = tree.split('\n').map((line) => line.replace(dirPath!, '.')).join('\n')
      parts.push(`<project-tree path="${dirPath}">\n${relTree}\n</project-tree>`)
    }
  } catch {}

  if (parts.length === 0) return null

  const header = userText
    ? userText
    : `The user shared project directory: ${dirPath}\nAnalyze this project and respond to the user's request.`

  process.stderr.write(`\x1b[90m  [project-expand] ${dirPath}: ${injected.size} files injected, tree included\x1b[0m\n`)
  return `${header}\n\n${parts.join('\n\n')}`
}

export function expandFileReferences(
  prompt: string,
  cwd: string,
  options?: { skipPaths?: Iterable<string> },
): FileExpansionResult {
  const home = process.env.HOME || ''
  const trimmed = prompt.trim()
  const injectedPaths = new Set<string>()
  const skipPaths = new Set(options?.skipPaths ?? [])

  const dirExpansion = tryExpandDirectory(trimmed, home, cwd)
  if (dirExpansion) {
    for (const match of dirExpansion.matchAll(/<file path="([^"]+)">/g)) {
      injectedPaths.add(match[1]!)
    }
    return { text: appendDedupHint(dirExpansion, injectedPaths), injectedPaths }
  }

  const barePath = resolveFilePath(trimmed, home, cwd)
  if (barePath && isStandalonePathPrompt(trimmed) && tryReadFile(barePath) !== null) {
    const content = tryReadFile(barePath)!
    const truncated = truncateFileContent(content)
    injectedPaths.add(barePath)
    const text = `<file path="${barePath}">\n${truncated}\n</file>\n\nThe user shared this file. Analyze it and ask what they'd like to do with it.`
    return { text: appendDedupHint(text, injectedPaths), injectedPaths }
  }

  let expanded = prompt
  const injected = new Set<string>()
  let match: RegExpExecArray | null

  while ((match = FILE_URL_REGEX.exec(prompt)) !== null) {
    const rawFileUrl = `file:///${match[1]!}`
    const filePath = resolveFilePath(rawFileUrl, home, cwd) || rawFileUrl
    if (skipPaths.has(filePath)) continue
    if (injected.has(filePath)) continue
    const content = tryReadFile(filePath)
    if (content !== null) {
      injected.add(filePath)
      injectedPaths.add(filePath)
      expanded += `\n\n<file path="${filePath}">\n${truncateFileContent(content)}\n</file>`
    }
  }

  while ((match = QUOTED_PATH_REGEX.exec(prompt)) !== null) {
    let filePath = match[2]!.trim()
    filePath = resolveFilePath(filePath, home, cwd) || filePath
    if (skipPaths.has(filePath)) continue
    if (injected.has(filePath)) continue
    const content = tryReadFile(filePath)
    if (content !== null) {
      injected.add(filePath)
      injectedPaths.add(filePath)
      expanded += `\n\n<file path="${filePath}">\n${truncateFileContent(content)}\n</file>`
    }
  }

  while ((match = ABSOLUTE_OR_HOME_PATH_REGEX.exec(prompt)) !== null) {
    let filePath = match[1]!.trim()
    filePath = resolveFilePath(filePath, home, cwd) || filePath
    if (skipPaths.has(filePath)) continue
    if (injected.has(filePath)) continue
    const content = tryReadFile(filePath)
    if (content !== null) {
      injected.add(filePath)
      injectedPaths.add(filePath)
      expanded += `\n\n<file path="${filePath}">\n${truncateFileContent(content)}\n</file>`
    }
  }

  while ((match = RELATIVE_PATH_REGEX.exec(prompt)) !== null) {
    const filePath = resolveFilePath(match[1]!.trim(), home, cwd) || join(cwd, match[1]!.trim())
    if (skipPaths.has(filePath)) continue
    if (injected.has(filePath)) continue
    const content = tryReadFile(filePath)
    if (content !== null) {
      injected.add(filePath)
      injectedPaths.add(filePath)
      expanded += `\n\n<file path="${filePath}">\n${truncateFileContent(content)}\n</file>`
    }
  }

  if (injectedPaths.size > 0) {
    expanded = appendDedupHint(expanded, injectedPaths)
  }

  return { text: expanded, injectedPaths }
}

export function prepareMultiModelContext(
  prompt: string,
  cwd: string,
  sessionInjectedPaths: Set<string>,
): { prompt: string; injectedPaths: Set<string> } {
  const expansion = expandFileReferences(prompt, cwd)
  let enriched = expansion.text
  const allPaths = new Set(expansion.injectedPaths)

  const cwdContext = expandFileReferences(cwd, cwd)
  if (cwdContext.injectedPaths.size > 0) {
    const newPaths: string[] = []
    for (const path of cwdContext.injectedPaths) {
      if (!allPaths.has(path)) {
        allPaths.add(path)
        newPaths.push(path)
      }
    }
    if (newPaths.length > 0) {
      for (const np of newPaths) {
        const escaped = np.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const tagMatch = cwdContext.text.match(new RegExp(`<file path="${escaped}">[\\s\\S]*?</file>`))
        if (tagMatch) enriched += '\n\n' + tagMatch[0]
      }
      if (!enriched.includes('<project-tree') && cwdContext.text.includes('<project-tree')) {
        const treeMatch = cwdContext.text.match(/<project-tree[\s\S]*?<\/project-tree>/)
        if (treeMatch) enriched += '\n\n' + treeMatch[0]
      }
      process.stderr.write(`\x1b[90m  [MultiModelStart] force-injected ${newPaths.length} project file(s) from ${cwd}\x1b[0m\n`)
    }
  }

  for (const path of allPaths) sessionInjectedPaths.add(path)
  if (allPaths.size > 0) {
    enriched = appendDedupHint(enriched, allPaths)
  }

  return { prompt: enriched, injectedPaths: allPaths }
}

export function buildImagePromptContent(prompt: string, imagePaths: string[], cwd: string): PromptContent {
  const resolvedPrompt = prompt.trim() || 'Analyze these images.'
  const contentParts: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> = [
    { type: 'text', text: resolvedPrompt },
  ]

  for (const rawPath of imagePaths) {
    const filePath = resolve(cwd, rawPath)
    if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
      throw new Error(`Image not found: ${filePath}`)
    }
    const format = detectFormat(filePath)
    if (format.category !== 'image' && format.mimeType !== 'image/svg+xml') {
      throw new Error(`Not an image file: ${filePath}`)
    }
    const bytes = readFileSync(filePath)
    const dataUrl = `data:${format.mimeType};base64,${bytes.toString('base64')}`
    contentParts.push({ type: 'image_url', image_url: { url: dataUrl } })
  }

  return contentParts
}

function collectImagePromptMatches(prompt: string, cwd: string): Array<{ token: string; resolvedPath: string }> {
  const home = process.env.HOME || ''
  const matches: Array<{ token: string; resolvedPath: string }> = []
  const seen = new Set<string>()

  const addMatch = (token: string, rawPath: string): void => {
    const resolvedPath = resolveFilePath(rawPath, home, cwd)
    if (!resolvedPath) return
    if (!isResolvableImagePath(resolvedPath, cwd)) return
    if (seen.has(resolvedPath)) return
    seen.add(resolvedPath)
    matches.push({ token, resolvedPath })
  }

  const trimmed = prompt.trim()
  const standalonePath = resolveFilePath(trimmed, home, cwd)
  if (standalonePath && isStandalonePathPrompt(trimmed) && isResolvableImagePath(standalonePath, cwd)) {
    addMatch(trimmed, trimmed)
    return matches
  }

  let match: RegExpExecArray | null

  FILE_URL_REGEX.lastIndex = 0
  while ((match = FILE_URL_REGEX.exec(prompt)) !== null) {
    addMatch(match[0], match[0])
  }

  QUOTED_PATH_REGEX.lastIndex = 0
  while ((match = QUOTED_PATH_REGEX.exec(prompt)) !== null) {
    addMatch(match[0]!.trim(), match[2]!)
  }

  ABSOLUTE_OR_HOME_PATH_REGEX.lastIndex = 0
  while ((match = ABSOLUTE_OR_HOME_PATH_REGEX.exec(prompt)) !== null) {
    addMatch(match[1]!, match[1]!)
  }

  RELATIVE_PATH_REGEX.lastIndex = 0
  while ((match = RELATIVE_PATH_REGEX.exec(prompt)) !== null) {
    addMatch(match[1]!, match[1]!)
  }

  return matches
}

export function extractImagePromptInput(prompt: string, cwd: string): ExtractedImagePromptInput {
  const matches = collectImagePromptMatches(prompt, cwd)
  if (matches.length === 0) {
    return { prompt, imagePaths: [] }
  }

  let cleanedPrompt = prompt
  for (const token of matches.map((entry) => entry.token).sort((a, b) => b.length - a.length)) {
    cleanedPrompt = cleanedPrompt.split(token).join(' ')
  }
  const normalizedPrompt = cleanedPrompt.replace(/\s+/g, ' ').trim()

  return {
    prompt: normalizedPrompt || 'Analyze these images.',
    imagePaths: matches.map((entry) => entry.resolvedPath),
  }
}

function isResolvableImagePath(rawPath: string, cwd: string): boolean {
  const filePath = resolve(cwd, rawPath)
  if (!existsSync(filePath)) return false
  if (statSync(filePath).isDirectory()) return false
  const format = detectFormat(filePath)
  return format.category === 'image' || format.mimeType === 'image/svg+xml'
}

export function splitImageArgsAndPrompt(
  promptParts: string[],
  imageArgs: string[] | undefined,
  cwd: string,
): { prompt: string; imagePaths: string[] } {
  const providedPrompt = promptParts.join(' ').trim()
  const providedImages = imageArgs ?? []
  if (!providedImages.length) {
    return { prompt: providedPrompt, imagePaths: [] }
  }

  if (providedPrompt) {
    return { prompt: providedPrompt, imagePaths: providedImages }
  }

  const resolvedImages: string[] = []
  const promptTail: string[] = []
  let inPromptTail = false

  for (const part of providedImages) {
    if (!inPromptTail && isResolvableImagePath(part, cwd)) {
      resolvedImages.push(part)
      continue
    }
    inPromptTail = true
    promptTail.push(part)
  }

  return {
    prompt: promptTail.join(' ').trim(),
    imagePaths: resolvedImages,
  }
}
