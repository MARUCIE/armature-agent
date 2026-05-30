/**
 * Theme system for ink UI components.
 *
 * 30+ semantic color tokens organized by role (not by hue).
 * Dark/light mode auto-detection via COLORFGBG or ARMATURE_THEME env var.
 * Components use useTheme() to get the current theme's semantic colors.
 *
 * Themes: armature (blackfin amber/ocean), default (cyan/dark), light (cyan/light),
 *         dark (green/dark), ocean (blue/dark), warm (yellow/dark), mono (white/dark)
 */

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { readFileSync } from 'node:fs'

export interface InkTheme {
  name: string
  mode: 'dark' | 'light'

  // ── Primary ──
  /** Primary accent (borders, highlights, art, spinners) */
  accent: string
  /** Secondary accent (less prominent highlights) */
  accentDim: string
  /** Prompt/input caret color */
  prompt: string

  // ── Semantic status ──
  /** Success indicators (tool ok, test pass) */
  success: string
  /** Error indicators (tool fail, exception) */
  error: string
  /** Warning indicators (system messages, caution) */
  warning: string
  /** Informational (system messages, notes) */
  info: string

  // ── Text ──
  /** Primary text (default readable) */
  text: string
  /** Secondary/dim text (metadata, timestamps) */
  dim: string
  /** Muted text (placeholders, disabled) */
  muted: string

  // ── UI elements ──
  /** Active border (focused input, selected item) */
  border: string
  /** Inactive border (unfocused, background) */
  borderDim: string
  /** Status bar background accent */
  statusBg: string

  // ── Code & tools ──
  /** Tool name highlight */
  tool: string
  /** Model/AI name */
  model: string
  /** File path display */
  filePath: string
  /** Code/command text */
  code: string
  /** Diff: added lines */
  diffAdd: string
  /** Diff: removed lines */
  diffRemove: string
  /** Diff: context lines */
  diffContext: string

  // ── Permission ──
  /** Permission allow */
  permAllow: string
  /** Permission deny */
  permDeny: string

  // ── Progress ──
  /** Context bar: healthy (<40%) */
  ctxGreen: string
  /** Context bar: caution (40-60%) */
  ctxYellow: string
  /** Context bar: danger (>60%) */
  ctxRed: string

  // ── Block accent line (Grok Build visual language) ──
  // Each scrollback block renders a left vertical accent line whose color
  // encodes the block type. See doc/GROK_UI_REFERENCE.md §2.
  /** User prompt block accent */
  accentUser: string
  /** Assistant message block accent */
  accentAssistant: string
  /** Thinking/reasoning block accent */
  accentThinking: string
  /** Tool call block accent */
  accentToolBlock: string
  /** Execute (shell command) block accent */
  accentExecute: string
  /** Plan mode block accent */
  accentPlan: string
  /** Skill block accent */
  accentSkill: string
  /** System message block accent */
  accentSystem: string
}

// ── Dark mode detection ──
function detectDarkMode(): boolean {
  // COLORFGBG is "foreground;background" — bg > 6 is typically light
  const colorfgbg = process.env.COLORFGBG
  if (colorfgbg) {
    const parts = colorfgbg.split(';')
    const bg = parseInt(parts[parts.length - 1] || '', 10)
    if (!isNaN(bg)) return bg <= 6
  }
  // Default to dark mode (most developer terminals are dark)
  return true
}

const isDark = detectDarkMode()

// ── Theme definitions ──

function darkTheme(name: string, accent: string, accentDim: string, prompt: string): InkTheme {
  return {
    name, mode: 'dark',
    accent, accentDim, prompt,
    success: 'green', error: 'red', warning: 'yellow', info: 'gray',
    text: 'white', dim: 'gray', muted: 'gray',
    border: accent, borderDim: 'gray', statusBg: accent,
    tool: 'yellow', model: 'magenta', filePath: 'cyan', code: 'white',
    diffAdd: 'green', diffRemove: 'red', diffContext: 'gray',
    permAllow: 'green', permDeny: 'red',
    ctxGreen: 'green', ctxYellow: 'yellow', ctxRed: 'red',
    accentUser: accent, accentAssistant: 'white', accentThinking: accentDim,
    accentToolBlock: 'yellow', accentExecute: 'yellow', accentPlan: 'cyan',
    accentSkill: 'magenta', accentSystem: 'gray',
  }
}

function armatureTheme(): InkTheme {
  return {
    name: 'armature', mode: 'dark',
    accent: '#F6C945',
    accentDim: '#B8792F',
    prompt: '#F6C945',
    success: '#72A276',
    error: '#E45A3C',
    warning: '#F6A63A',
    info: '#9DB2BF',
    text: '#E8E2D0',
    dim: '#9DB2BF',
    muted: '#6F7F89',
    border: '#F6C945',
    borderDim: '#3A4750',
    statusBg: '#B8792F',
    tool: '#F6A63A',
    model: '#47BFB0',
    filePath: '#84D2C6',
    code: '#E8E2D0',
    diffAdd: '#72A276',
    diffRemove: '#E45A3C',
    diffContext: '#9DB2BF',
    permAllow: '#72A276',
    permDeny: '#E45A3C',
    ctxGreen: '#72A276',
    ctxYellow: '#F6A63A',
    ctxRed: '#E45A3C',
    accentUser: '#F6C945',
    accentAssistant: '#E8E2D0',
    accentThinking: '#B8792F',
    accentToolBlock: '#47BFB0',
    accentExecute: '#F6A63A',
    accentPlan: '#84D2C6',
    accentSkill: '#47BFB0',
    accentSystem: '#9DB2BF',
  }
}

function lightTheme(name: string, accent: string, accentDim: string, prompt: string): InkTheme {
  return {
    name, mode: 'light',
    accent, accentDim, prompt,
    success: 'green', error: 'red', warning: '#B8860B', info: 'gray',
    text: 'black', dim: 'gray', muted: 'gray',
    border: accent, borderDim: 'gray', statusBg: accent,
    tool: '#B8860B', model: 'magenta', filePath: 'blue', code: 'black',
    diffAdd: 'green', diffRemove: 'red', diffContext: 'gray',
    permAllow: 'green', permDeny: 'red',
    ctxGreen: 'green', ctxYellow: '#B8860B', ctxRed: 'red',
    accentUser: accent, accentAssistant: 'black', accentThinking: accentDim,
    accentToolBlock: '#B8860B', accentExecute: '#B8860B', accentPlan: 'blue',
    accentSkill: 'magenta', accentSystem: 'gray',
  }
}

// ── Grok Build themes (ported from Grok Build v0.2.8) ──
// Palettes anchored to doc/GROK_UI_REFERENCE.md (extracted from the grok binary
// + ~/.grok/docs/user-guide/06-theming.md). GrokNight is the dark default,
// matching grok's own default.

function grokNightTheme(): InkTheme {
  return {
    name: 'groknight', mode: 'dark',
    accent: '#7D4BC6', accentDim: '#6C3EB2', prompt: '#7D4BC6',
    success: '#0A8E70', error: '#CD3048', warning: '#A27612', info: '#909090',
    text: '#E8E8E8', dim: '#808080', muted: '#525252',
    border: '#444444', borderDim: '#222222', statusBg: '#2F64D2',
    tool: '#0F87A2', model: '#0C947C', filePath: '#4A72B0', code: '#C8C8C8',
    diffAdd: '#0A8E70', diffRemove: '#CD3048', diffContext: '#808080',
    permAllow: '#0A8E70', permDeny: '#CD3048',
    ctxGreen: '#0A8E70', ctxYellow: '#A27612', ctxRed: '#CD3048',
    accentUser: '#7D4BC6', accentAssistant: '#C8C8C8', accentThinking: '#6C3EB2',
    accentToolBlock: '#0F87A2', accentExecute: '#C3691E', accentPlan: '#2F64D2',
    accentSkill: '#B267E6', accentSystem: '#909090',
  }
}

function grokDayTheme(): InkTheme {
  return {
    name: 'grokday', mode: 'light',
    accent: '#6C3EB2', accentDim: '#7D4BC6', prompt: '#6C3EB2',
    success: '#148320', error: '#AF2323', warning: '#A27612', info: '#707070',
    text: '#1A1A1A', dim: '#525252', muted: '#909090',
    border: '#C0C0C0', borderDim: '#E0E0E0', statusBg: '#2F64D2',
    tool: '#0F87A2', model: '#0A8E70', filePath: '#2F64D2', code: '#1A1A1A',
    diffAdd: '#148320', diffRemove: '#AF2323', diffContext: '#707070',
    permAllow: '#148320', permDeny: '#AF2323',
    ctxGreen: '#148320', ctxYellow: '#A27612', ctxRed: '#AF2323',
    accentUser: '#6C3EB2', accentAssistant: '#1A1A1A', accentThinking: '#7D4BC6',
    accentToolBlock: '#0F87A2', accentExecute: '#C3691E', accentPlan: '#2F64D2',
    accentSkill: '#6C3EB2', accentSystem: '#707070',
  }
}

function tokyoNightTheme(): InkTheme {
  return {
    name: 'tokyonight', mode: 'dark',
    accent: '#BB9AF7', accentDim: '#9D7CD8', prompt: '#BB9AF7',
    success: '#9ECE6A', error: '#F7768E', warning: '#E0AF68', info: '#565F89',
    text: '#C0CAF5', dim: '#565F89', muted: '#51597D',
    border: '#3B4261', borderDim: '#292E42', statusBg: '#7AA2F7',
    tool: '#7DCFFF', model: '#73DACA', filePath: '#7AA2F7', code: '#C0CAF5',
    diffAdd: '#9ECE6A', diffRemove: '#F7768E', diffContext: '#565F89',
    permAllow: '#9ECE6A', permDeny: '#F7768E',
    ctxGreen: '#9ECE6A', ctxYellow: '#E0AF68', ctxRed: '#F7768E',
    accentUser: '#BB9AF7', accentAssistant: '#C0CAF5', accentThinking: '#9D7CD8',
    accentToolBlock: '#7DCFFF', accentExecute: '#FF9E64', accentPlan: '#7AA2F7',
    accentSkill: '#BB9AF7', accentSystem: '#565F89',
  }
}

function rosePineMoonTheme(): InkTheme {
  return {
    name: 'rosepine-moon', mode: 'dark',
    accent: '#C4A7E7', accentDim: '#908CAA', prompt: '#C4A7E7',
    success: '#3E8FB0', error: '#EB6F92', warning: '#F6C177', info: '#6E6A86',
    text: '#E0DEF4', dim: '#908CAA', muted: '#6E6A86',
    border: '#393552', borderDim: '#2A273F', statusBg: '#3E8FB0',
    tool: '#9CCFD8', model: '#9CCFD8', filePath: '#3E8FB0', code: '#E0DEF4',
    diffAdd: '#3E8FB0', diffRemove: '#EB6F92', diffContext: '#6E6A86',
    permAllow: '#3E8FB0', permDeny: '#EB6F92',
    ctxGreen: '#3E8FB0', ctxYellow: '#F6C177', ctxRed: '#EB6F92',
    accentUser: '#C4A7E7', accentAssistant: '#E0DEF4', accentThinking: '#C4A7E7',
    accentToolBlock: '#9CCFD8', accentExecute: '#F6C177', accentPlan: '#3E8FB0',
    accentSkill: '#C4A7E7', accentSystem: '#6E6A86',
  }
}

const THEMES: Record<string, InkTheme> = {
  // Grok Build themes (default-first)
  groknight:        grokNightTheme(),
  grokday:          grokDayTheme(),
  tokyonight:       tokyoNightTheme(),
  'rosepine-moon':  rosePineMoonTheme(),
  // Armature legacy / extra themes
  armature:     armatureTheme(),
  default:  darkTheme('default',  'cyan',   '#5F8787', 'cyan'),
  light:    lightTheme('light',   'blue',   '#5F87AF', 'blue'),
  dark:     darkTheme('dark',     'green',  '#5F875F', 'green'),
  ocean:    darkTheme('ocean',    'blue',   '#5F87AF', 'blue'),
  warm:     darkTheme('warm',     'yellow', '#AF8700', 'yellow'),
  mono:     darkTheme('mono',     'white',  'gray',    'white'),
}

// Theme name aliases → canonical THEMES key (matches grok's alias table).
const THEME_ALIASES: Record<string, string> = {
  'grok-night': 'groknight',
  'grok-day': 'grokday',
  day: 'grokday',
  'tokyo-night': 'tokyonight',
  tokyo: 'tokyonight',
  rosepine: 'rosepine-moon',
  'rose-pine': 'rosepine-moon',
  'rose-pine-moon': 'rosepine-moon',
}

function canonicalThemeId(id: string): string {
  return THEMES[id] ? id : (THEME_ALIASES[id] ?? id)
}

function readThemeFile(): string | null {
  try {
    const home = process.env.HOME || process.env.USERPROFILE || ''
    if (!home) return null
    return readFileSync(`${home}/.armature/theme`, 'utf-8').trim().toLowerCase()
  } catch {
    return null
  }
}

function getConfiguredThemeId(): string | null {
  const envTheme = canonicalThemeId((process.env.ARMATURE_THEME || '').toLowerCase())
  if (envTheme && THEMES[envTheme]) return envTheme
  const fileTheme = readThemeFile()
  if (fileTheme) {
    const canonical = canonicalThemeId(fileTheme)
    if (THEMES[canonical]) return canonical
  }
  return null
}

export function hasConfiguredThemePreference(): boolean {
  return getConfiguredThemeId() !== null
}

function resolveTheme(): InkTheme {
  // Priority: env var > file > auto-detect
  const configuredTheme = getConfiguredThemeId()
  if (configuredTheme) return THEMES[configuredTheme]!
  // Auto-detect: dark -> GrokNight (grok default), light -> GrokDay
  return isDark ? THEMES['groknight']! : THEMES['grokday']!
}

function resolveThemeFromId(themeId: string | null): InkTheme {
  const canonical = themeId ? canonicalThemeId(themeId) : null
  if (canonical && THEMES[canonical]) return THEMES[canonical]!
  // Auto-detect: dark -> GrokNight (grok default), light -> GrokDay
  return isDark ? THEMES['groknight']! : THEMES['grokday']!
}

/** Available theme IDs for external use (e.g. ThemePicker) */
export const THEME_IDS = Object.keys(THEMES)

interface ThemeContextValue {
  theme: InkTheme
  setThemeId: (themeId: string) => void
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: resolveTheme(),
  setThemeId: () => {},
})

export function ThemeProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [themeId, setThemeIdState] = useState<string | null>(() => getConfiguredThemeId())

  const setThemeId = useCallback((nextThemeId: string) => {
    if (!THEMES[nextThemeId]) return
    process.env.ARMATURE_THEME = nextThemeId
    setThemeIdState(nextThemeId)
  }, [])

  const theme = useMemo(() => resolveThemeFromId(themeId), [themeId])
  const value = useMemo(() => ({ theme, setThemeId }), [theme, setThemeId])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): InkTheme {
  return useContext(ThemeContext).theme
}

export function useThemeController(): { setThemeId: (themeId: string) => void } {
  const { setThemeId } = useContext(ThemeContext)
  return { setThemeId }
}

/** Get the resolved theme without React context (for non-component code) */
export function getTheme(): InkTheme {
  return resolveTheme()
}
