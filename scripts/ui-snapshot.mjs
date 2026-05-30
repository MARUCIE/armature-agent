/**
 * ui-snapshot.mjs — headless render harness for visual verification.
 *
 * Renders the BUILT armature TUI (dist/ui) through ink-testing-library so the
 * captured frame is the exact output the real binary produces — not a mockup.
 * Two frames are captured: the grok-style welcome and a live conversation
 * (user block + thinking + tool block + assistant markdown). The ANSI frames
 * are converted to truecolor monospace HTML and written under state/visual-verify/.
 *
 * Usage: FORCE_COLOR=3 node scripts/ui-snapshot.mjs
 */

process.env.FORCE_COLOR = '3' // force chalk/ink to emit 24-bit truecolor SGR

import React from 'react'
import { render } from 'ink-testing-library'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const h = React.createElement
const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(__dirname, '..')

const { App } = await import(join(repoRoot, 'dist/ui/components/App.js'))
const { ChatSessionEmitter } = await import(join(repoRoot, 'dist/ui/session.js'))
const { TerminalSizeProvider } = await import(join(repoRoot, 'dist/ui/useTerminalSize.js'))

const tick = (ms = 40) => new Promise((r) => setTimeout(r, ms))

const status = {
  model: 'grok-code-fast-1',
  contextPct: 18,
  permMode: 'auto',
  permSource: 'default',
  turns: 1,
  costUsd: 0.0042,
  behaviorMode: 'default',
  effort: 'high',
}

const banner = {
  version: '0.4.0',
  cwd: '/Users/mauricewen/Projects/armature-agent',
  configFiles: ['ARMATURE.md'],
  toolCount: 14,
  hookCount: 6,
  model: 'grok-code-fast-1',
  permMode: 'auto',
  sessionId: 'c9b02b3e-1f20-4a8d-9c7e-0ab12cd34ef5',
  savedSessionCount: 3,
}

// ── Frame A: welcome ────────────────────────────────────────────────────────
const sessionA = new ChatSessionEmitter()
const viewA = render(
  h(TerminalSizeProvider, null, h(App, { session: sessionA, initialStatus: status, banner })),
)
await tick(60)
const frameWelcome = viewA.lastFrame() || ''
viewA.unmount()

// ── Frame B: live conversation ──────────────────────────────────────────────
const sessionB = new ChatSessionEmitter()
const viewB = render(
  h(TerminalSizeProvider, null, h(App, { session: sessionB, initialStatus: status, banner })),
)
await tick(40)
sessionB.emitUserMessage('replicate grok build ui into armature')
await tick(20)
sessionB.emitThinkingStart()
await tick(20)
sessionB.emitToolStart({ name: 'read_file', args: { path: 'src/ui/theme.tsx' } })
await tick(20)
sessionB.emitToolEnd({ name: 'read_file', args: { path: 'src/ui/theme.tsx' }, ok: true, summary: '204 lines' })
await tick(20)
sessionB.emitThinkingEnd(420)
await tick(20)
sessionB.emitText('### Ported the grok visual language\n- **Left accent line** per block\n- `◆` diamond bullet on tool blocks\n- Minimal `Type a message…` placeholder')
sessionB.emitTurnSummary({ inputTokens: 1280, outputTokens: 340, duration: 1840, toolCalls: 1, costUsd: 0.0042, model: 'grok-code-fast-1' })
await tick(60)
const frameConversation = viewB.lastFrame() || ''
viewB.unmount()

// ── ANSI → HTML (truecolor monospace) ───────────────────────────────────────
const PAGE_BG = '#0c0c0e'
const DEFAULT_FG = '#cdd0d4'
const BASIC = {
  30: '#1c1c1c', 31: '#cd3048', 32: '#0a8e70', 33: '#c3691e', 34: '#2f64d2', 35: '#7d4bc6', 36: '#0f87a2', 37: '#cdd0d4',
  90: '#5a5a60', 91: '#e0566c', 92: '#3fae8e', 93: '#d98a3c', 94: '#5a86e0', 95: '#9a6fd4', 96: '#3fa8c0', 97: '#ffffff',
}

function escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function applyCodes(state, codes) {
  for (let i = 0; i < codes.length; i++) {
    const c = codes[i]
    if (c === 0) Object.assign(state, { fg: null, bg: null, bold: false, dim: false, inverse: false })
    else if (c === 1) state.bold = true
    else if (c === 2) state.dim = true
    else if (c === 22) { state.bold = false; state.dim = false }
    else if (c === 7) state.inverse = true
    else if (c === 27) state.inverse = false
    else if (c === 39) state.fg = null
    else if (c === 49) state.bg = null
    else if ((c >= 30 && c <= 37) || (c >= 90 && c <= 97)) state.fg = BASIC[c]
    else if ((c >= 40 && c <= 47) || (c >= 100 && c <= 107)) state.bg = BASIC[c - 10]
    else if (c === 38 && codes[i + 1] === 2) { state.fg = `rgb(${codes[i + 2]},${codes[i + 3]},${codes[i + 4]})`; i += 4 }
    else if (c === 48 && codes[i + 1] === 2) { state.bg = `rgb(${codes[i + 2]},${codes[i + 3]},${codes[i + 4]})`; i += 4 }
    else if (c === 38 && codes[i + 1] === 5) { i += 2 } // 256-color index: skip (rare under truecolor)
    else if (c === 48 && codes[i + 1] === 5) { i += 2 }
  }
}

function ansiToHtml(frame) {
  const SGR = /\x1b\[([0-9;]*)m/g
  return frame.split('\n').map((line) => {
    const state = { fg: null, bg: null, bold: false, dim: false, inverse: false }
    const parts = []
    let last = 0
    const emit = (text) => {
      if (!text) return
      const fg = state.inverse ? (state.bg || PAGE_BG) : (state.fg || DEFAULT_FG)
      const bg = state.inverse ? (state.fg || DEFAULT_FG) : state.bg
      const styles = [`color:${fg}`]
      if (bg) styles.push(`background:${bg}`)
      if (state.bold) styles.push('font-weight:700')
      if (state.dim) styles.push('opacity:0.62')
      parts.push(`<span style="${styles.join(';')}">${escHtml(text)}</span>`)
    }
    for (const m of line.matchAll(SGR)) {
      emit(line.slice(last, m.index))
      last = m.index + m[0].length
      applyCodes(state, m[1].split(';').map((x) => (x === '' ? 0 : parseInt(x, 10))))
    }
    emit(line.slice(last))
    return parts.join('') || '&nbsp;'
  }).join('\n')
}

function panel(title, frame) {
  return `<section class="panel">
  <div class="panel-title">${escHtml(title)}</div>
  <pre class="screen">${ansiToHtml(frame)}</pre>
</section>`
}

const html = `<!doctype html>
<html lang="zh"><head><meta charset="utf-8">
<title>Armature TUI · grok 视觉语言复刻验证</title>
<style>
  :root { --page-max: 1040px; }
  * { box-sizing: border-box; }
  body { margin:0; background:#161618; color:#cdd0d4; font-family:-apple-system,system-ui,sans-serif; padding:32px 0 64px; }
  .frame { width:min(var(--page-max), calc(100% - 64px)); margin-inline:auto; }
  h1 { font-size:18px; font-weight:600; letter-spacing:0.2px; margin:0 0 4px; }
  .sub { color:#8a8a90; font-size:13px; margin:0 0 28px; }
  .panel { margin-bottom:28px; }
  .panel-title { font-size:11px; text-transform:uppercase; letter-spacing:1.4px; color:#7d4bc6; margin-bottom:8px; }
  pre.screen {
    margin:0; padding:18px 20px; border-radius:10px; background:${PAGE_BG};
    border:1px solid #26262a; overflow-x:auto; line-height:1.45;
    font-family:'Maple Mono NF','JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace;
    font-size:13px; white-space:pre; tab-size:2;
  }
  footer { text-align:center; padding:48px 20px 0; color:#9B9B9D; font-size:13px; line-height:2.2; }
</style></head>
<body><div class="frame">
  <h1>Armature CLI · Grok Build 视觉语言像素级复刻验证</h1>
  <p class="sub">渲染自构建产物 dist/ui（ink-testing-library 真实渲染路径），非手绘 mockup · GrokNight 默认主题 · 24-bit truecolor</p>
  ${panel('Welcome — 极简欢迎屏（左强调线 / 小写信息行 / 无 ASCII 字标）', frameWelcome)}
  ${panel('Conversation — 用户块 / Thinking / ◆ 工具块 / 助手 Markdown', frameConversation)}
</div>
<footer>
  <p>Armature CLI v0.4.0 — Grok UI Fidelity Snapshot</p>
  <p>Maurice | maurice_wen@proton.me</p>
  <p style="font-size:12px; margin-top:8px;">2026-05-29 · captured from dist/ui via ink-testing-library</p>
</footer>
</body></html>`

const stamp = '2026-05-29'
const outDir = join(repoRoot, 'state/visual-verify')
mkdirSync(outDir, { recursive: true })
const outPath = join(outDir, `${stamp}-grok-armature-tui.html`)
writeFileSync(outPath, html, 'utf8')
console.log(`[ui-snapshot] wrote ${outPath}`)
console.log(`[ui-snapshot] welcome lines=${frameWelcome.split('\n').length} conversation lines=${frameConversation.split('\n').length}`)
