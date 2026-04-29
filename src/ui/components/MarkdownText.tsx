/**
 * MarkdownText — renders common markdown into structured terminal text.
 *
 * Code blocks get full syntax highlighting via highlight.js → ANSI color mapping.
 */

import React, { useMemo } from 'react'
import { Text } from 'ink'

interface Props {
  children: string
}

export function MarkdownText({ children }: Props): React.ReactElement {
  const rendered = useMemo(() => {
    if (!children) return ''
    try {
      return renderStructuredMarkdown(children)
    } catch {
      return children
    }
  }, [children])

  return <Text>{rendered}</Text>
}

// hljs class → ANSI color mapping (monokai-inspired for dark terminals)
const HLJS_COLORS: Record<string, string> = {
  'hljs-keyword':    '\x1b[35m',  // magenta
  'hljs-built_in':   '\x1b[36m',  // cyan
  'hljs-type':       '\x1b[36m',  // cyan
  'hljs-literal':    '\x1b[33m',  // yellow
  'hljs-number':     '\x1b[33m',  // yellow
  'hljs-string':     '\x1b[32m',  // green
  'hljs-comment':    '\x1b[90m',  // gray
  'hljs-doctag':     '\x1b[90m',  // gray
  'hljs-meta':       '\x1b[90m',  // gray
  'hljs-title':      '\x1b[34m',  // blue
  'hljs-function':   '\x1b[34m',  // blue
  'hljs-class':      '\x1b[34m',  // blue
  'hljs-params':     '\x1b[37m',  // white
  'hljs-attr':       '\x1b[36m',  // cyan
  'hljs-attribute':  '\x1b[36m',  // cyan
  'hljs-variable':   '\x1b[31m',  // red
  'hljs-regexp':     '\x1b[31m',  // red
  'hljs-symbol':     '\x1b[33m',  // yellow
  'hljs-template-variable': '\x1b[33m',
  'hljs-addition':   '\x1b[32m',  // green
  'hljs-deletion':   '\x1b[31m',  // red
  'hljs-selector-tag': '\x1b[35m',
  'hljs-selector-class': '\x1b[33m',
  'hljs-selector-id': '\x1b[34m',
  'hljs-property':   '\x1b[36m',  // cyan
  'hljs-name':       '\x1b[35m',  // magenta
  'hljs-tag':        '\x1b[35m',  // magenta
  'hljs-subst':      '\x1b[37m',  // white
  'hljs-section':    '\x1b[34m',  // blue
  'hljs-bullet':     '\x1b[33m',  // yellow
}
const RESET = '\x1b[0m'
const BOLD = '\x1b[1m'
const DIM = '\x1b[90m'
const CYAN = '\x1b[36m'
const YELLOW = '\x1b[33m'
const MAGENTA = '\x1b[35m'

/** Convert hljs HTML spans to ANSI-colored text */
function hljsToAnsi(html: string): string {
  return html
    .replace(/<span class="([^"]+)">/g, (_match, cls: string) => {
      for (const c of cls.split(/\s+/)) {
        if (HLJS_COLORS[c]) return HLJS_COLORS[c]!
      }
      return ''
    })
    .replace(/<\/span>/g, RESET)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
}

// Lazy-loaded hljs
let hljs: { highlight: (code: string, opts: { language: string }) => { value: string }; getLanguage: (lang: string) => unknown } | null = null

function loadHljs() {
  if (hljs) return hljs
  try {
    hljs = require('highlight.js') as typeof hljs
  } catch {
    hljs = null
  }
  return hljs
}

function renderStructuredMarkdown(src: string): string {
  const out: string[] = []
  const lines = src.replace(/\r\n/g, '\n').split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] || ''
    const fence = line.match(/^```([A-Za-z0-9_-]+)?\s*$/)
    if (fence) {
      const lang = fence[1] || ''
      const code: string[] = []
      i++
      while (i < lines.length && !/^```\s*$/.test(lines[i] || '')) {
        code.push(lines[i] || '')
        i++
      }
      out.push(...renderCodeBlock(code.join('\n'), lang))
      continue
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/)
    if (heading) {
      const level = heading[1]!.length
      const text = renderInlineMarkdown(heading[2]!.trim())
      if (out.length > 0 && out[out.length - 1] !== '') out.push('')
      if (level <= 2) {
        out.push(`${BOLD}${CYAN}${text}${RESET}`)
        out.push(`${DIM}${'-'.repeat(Math.min(stripAnsi(text).length, 72))}${RESET}`)
      } else {
        out.push(`${BOLD}${text}${RESET}`)
      }
      continue
    }

    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      out.push(`${DIM}${'-'.repeat(48)}${RESET}`)
      continue
    }

    const bullet = line.match(/^(\s*)[-*+]\s+(.+)$/)
    if (bullet) {
      out.push(`${bullet[1]}• ${renderInlineMarkdown(bullet[2]!)}`)
      continue
    }

    const ordered = line.match(/^(\s*)(\d+)[.)]\s+(.+)$/)
    if (ordered) {
      out.push(`${ordered[1]}${ordered[2]}. ${renderInlineMarkdown(ordered[3]!)}`)
      continue
    }

    const quote = line.match(/^\s*>\s?(.*)$/)
    if (quote) {
      out.push(`${DIM}│${RESET} ${renderInlineMarkdown(quote[1] || '')}`)
      continue
    }

    out.push(renderInlineMarkdown(line))
  }

  return out.join('\n').trimEnd()
}

function renderCodeBlock(code: string, lang: string): string[] {
  let rendered = code
  const h = loadHljs()
  if (h && lang && h.getLanguage(lang)) {
    try {
      rendered = hljsToAnsi(h.highlight(code, { language: lang }).value)
    } catch { /* fallback to plain */ }
  }
  return rendered.split('\n').map((line) => `    ${line}`)
}

function renderInlineMarkdown(text: string): string {
  return text
    .replace(/`([^`]+)`/g, `${YELLOW}$1${RESET}`)
    .replace(/\*\*([^*]+)\*\*/g, `${BOLD}$1${RESET}`)
    .replace(/__([^_]+)__/g, `${BOLD}$1${RESET}`)
    .replace(/\*([^*\n]+)\*/g, `${MAGENTA}$1${RESET}`)
    .replace(/_([^_\n]+)_/g, `${MAGENTA}$1${RESET}`)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, '')
}
