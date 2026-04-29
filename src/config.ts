/**
 * Orca CLI configuration system.
 *
 * Three-tier config resolution (highest priority wins):
 *   1. CLI flags + environment variables (runtime)
 *   2. Project-local .orca.json (project)
 *   3. Global ~/.orca/config.json (global)
 *
 * Provider architecture (v2):
 *   - Each provider is an independent config block with apiKey, baseURL, models
 *   - All providers use OpenAI-compatible protocol (single SDK)
 *   - ${ENV_VAR} template syntax lets config files be committed without secrets
 *   - Auto-migration from v1 flat config
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { z } from 'zod'
import { getGitRepositoryRoot } from './git-repository.js'
import { logWarning } from './logger.js'

// ── Schema ──────────────────────────────────────────────────────────

/**
 * Per-provider configuration block.
 * Every provider speaks OpenAI-compatible protocol — baseURL is the differentiator.
 */
const ProviderConfigSchema = z.object({
  apiKey: z.string().optional(),
  baseURL: z.string().optional(),
  models: z.array(z.string()).optional(),
  defaultModel: z.string().optional(),
  disabled: z.boolean().default(false),
  /** True for aggregators (Poe, OpenRouter, Zenmux) that route to multiple vendors via one endpoint */
  aggregator: z.boolean().default(false),
  /** Extra HTTP headers sent with every request (e.g. Copilot-Integration-Id for GitHub Copilot API) */
  headers: z.record(z.string()).optional(),
  /** Default reasoning effort for models that support it (e.g. 'xhigh' for GPT-5.x) */
  defaultEffort: z.string().optional(),
})

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>

const OrcaConfigSchema = z.object({
  // v2: per-provider config blocks
  providers: z.record(z.string(), ProviderConfigSchema).default({}),
  defaultProvider: z.string().default('auto'),
  defaultModel: z.string().optional(),

  // Multi-model collaboration config
  multiModel: z.object({
    provider: z.string().optional(),
  }).default({}),

  // Agent settings (unchanged)
  maxTurns: z.number().int().positive().default(25),
  maxBudgetUsd: z.number().positive().optional(),
  systemPrompt: z.string().optional(),
  permissionMode: z.enum(['default', 'acceptEdits', 'bypassPermissions', 'plan']).default('default'),
  permissionAllowlist: z.array(z.string()).default([]),
  mcpServers: z.record(z.object({
    command: z.string(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string()).optional(),
  })).optional(),
  tools: z.array(z.string()).optional(),

  // v1 compat fields (consumed by migration, not used directly)
  provider: z.string().optional(),
  model: z.string().optional(),
  apiKey: z.string().optional(),
  baseURL: z.string().optional(),
})

export type OrcaConfig = z.infer<typeof OrcaConfigSchema>
export type ConfigPermissionMode = OrcaConfig['permissionMode']
export type ReplPermissionMode = 'yolo' | 'auto' | 'plan'
export type PermissionModeSource = 'session' | 'project' | 'global' | 'env' | 'flag' | 'default'
export type PermissionRuleStatus = 'canonical' | 'normalized' | 'unrecognized'

// Legacy type alias for backward-compatible imports
export type Provider = string

// ── Paths ───────────────────────────────────────────────────────────

const GLOBAL_DIR = join(homedir(), '.orca')
const GLOBAL_CONFIG = join(GLOBAL_DIR, 'config.json')
const PROJECT_CONFIG = '.orca.json'

export function getGlobalDir(): string {
  return GLOBAL_DIR
}

export function getGlobalConfigPath(): string {
  return GLOBAL_CONFIG
}

export function getProjectConfigPath(cwd: string): string {
  return join(resolve(cwd), PROJECT_CONFIG)
}

// ── Env Template Resolver ───────────────────────────────────────────

/**
 * Resolve ${ENV_VAR} templates in a string.
 * Returns undefined if the referenced env var is not set.
 *
 * Examples:
 *   "${POE_API_KEY}" → actual value of process.env.POE_API_KEY
 *   "sk-hardcoded"   → "sk-hardcoded" (no template, returned as-is)
 *   "${UNSET_VAR}"   → undefined
 */
function resolveEnvTemplate(value: string | undefined): string | undefined {
  if (!value) return undefined
  const match = value.match(/^\$\{(\w+)\}$/)
  if (match) {
    return process.env[match[1]!] || undefined
  }
  return value
}

// ── Well-Known Provider Defaults ────────────────────────────────────

interface ProviderDefaults {
  baseURL?: string
  envBase?: string
  baseURLBuilder?: () => string | undefined
  envKey: string
  defaultModel: string
}

function getWellKnownBaseURL(defaults: ProviderDefaults | undefined): string | undefined {
  if (!defaults) return undefined
  if (defaults.envBase && process.env[defaults.envBase]) return process.env[defaults.envBase]
  if (defaults.baseURLBuilder) {
    const built = defaults.baseURLBuilder()
    if (built) return built
  }
  return defaults.baseURL
}

function inferRequestKeyForModel(model: string | undefined): string | undefined {
  const normalized = String(model || '').trim().toLowerCase()
  if (!normalized) return undefined

  if (normalized.startsWith('anthropic/')) {
    return process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || undefined
  }
  if (normalized.startsWith('openai/')) {
    return process.env.OPENAI_API_KEY || undefined
  }
  if (normalized.startsWith('google-ai-studio/')) {
    return process.env.GOOGLE_API_KEY || process.env.GOOGLE_AI_STUDIO_KEY || process.env.GEMINI_API_KEY || undefined
  }
  if (normalized.startsWith('xai/')) {
    return process.env.XAI_API_KEY || undefined
  }
  return undefined
}

function isCloudflareAggregator(providerId: string): boolean {
  return providerId === 'cloudflare' || providerId === 'claudeflare'
}

function pickFirstModelWithKey(candidates: Array<string | undefined>): string | undefined {
  for (const candidate of candidates) {
    if (!candidate) continue
    if (inferRequestKeyForModel(candidate)) return candidate
  }
  return undefined
}

function buildCloudflareGatewayBaseURL(): string | undefined {
  const accountId =
    process.env.CLOUDFLARE_ACCOUNT_ID ||
    process.env.CF_ACCOUNT_ID
  if (!accountId) return undefined
  const gatewayId =
    process.env.CLOUDFLARE_AI_GATEWAY_ID ||
    process.env.CF_GATEWAY_ID ||
    'default'
  return `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayId}/compat`
}

const WELL_KNOWN_PROVIDERS: Record<string, ProviderDefaults> = {
  poe: {
    baseURL: 'https://api.poe.com/v1/',
    envKey: 'POE_API_KEY',
    defaultModel: 'claude-sonnet-4.6',
  },
  anthropic: {
    baseURL: 'https://api.anthropic.com/v1/',
    envKey: 'ANTHROPIC_API_KEY',
    defaultModel: 'claude-sonnet-4-20250514',
  },
  openai: {
    baseURL: 'https://api.openai.com/v1/',
    envKey: 'OPENAI_API_KEY',
    defaultModel: 'gpt-5.4',
  },
  google: {
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    envKey: 'GOOGLE_API_KEY',
    defaultModel: 'gemini-2.5-pro',
  },
  openrouter: {
    baseURL: 'https://openrouter.ai/api/v1',
    envKey: 'OPENROUTER_API_KEY',
    defaultModel: 'anthropic/claude-sonnet-4',
  },
  cloudflare: {
    envBase: 'CLOUDFLARE_AI_GATEWAY_BASE_URL',
    baseURLBuilder: buildCloudflareGatewayBaseURL,
    envKey: 'CLOUDFLARE_AI_GATEWAY_API_KEY',
    defaultModel: 'anthropic/claude-opus-4.7',
  },
  claudeflare: {
    envBase: 'CLOUDFLARE_AI_GATEWAY_BASE_URL',
    baseURLBuilder: buildCloudflareGatewayBaseURL,
    envKey: 'CLOUDFLARE_AI_GATEWAY_API_KEY',
    defaultModel: 'anthropic/claude-opus-4.7',
  },
  deepseek: {
    baseURL: 'https://api.deepseek.com/v1',
    envKey: 'DEEPSEEK_API_KEY',
    defaultModel: 'deepseek-chat',
  },
  groq: {
    baseURL: 'https://api.groq.com/openai/v1',
    envKey: 'GROQ_API_KEY',
    defaultModel: 'llama-4-scout-17b-16e-instruct',
  },
  xai: {
    baseURL: 'https://api.x.ai/v1',
    envKey: 'XAI_API_KEY',
    defaultModel: 'grok-4',
  },
  local: {
    baseURL: 'http://localhost:11434/v1',
    envKey: 'LOCAL_API_KEY',
    defaultModel: 'qwen3:32b',
  },
  copilot: {
    baseURL: 'https://api.githubcopilot.com',
    envKey: 'GH_TOKEN',
    defaultModel: 'claude-sonnet-4.6',
  },
}

// ── Loaders ─────────────────────────────────────────────────────────

function loadJsonFile(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {}
  try {
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logWarning('failed to parse config file', { path, error: msg })
    return {}
  }
}

function loadGlobalConfig(): Record<string, unknown> {
  return loadJsonFile(GLOBAL_CONFIG)
}

function loadProjectConfig(cwd: string): Record<string, unknown> {
  return loadJsonFile(join(resolve(cwd), PROJECT_CONFIG))
}

function writeJsonFile(path: string, value: Record<string, unknown>): void {
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', 'utf-8')
}

// ── V1 Config Migration ────────────────────────────────────────────

/**
 * Detect and migrate v1 flat config to v2 providers format.
 *
 * v1: { "provider": "poe", "apiKey": "...", "model": "...", "baseURL": "..." }
 * v2: { "providers": { "poe": { "apiKey": "...", "baseURL": "..." } }, "defaultProvider": "poe" }
 */
function migrateV1Config(raw: Record<string, unknown>): Record<string, unknown> {
  // Already v2 if providers key exists
  if (raw.providers && typeof raw.providers === 'object') return raw

  // No v1 provider field — nothing to migrate
  if (!raw.provider || typeof raw.provider !== 'string') return raw

  const v1Provider = raw.provider as string
  if (v1Provider === 'auto') return raw // auto needs detection, not migration

  const providerConfig: Record<string, unknown> = {}
  if (raw.apiKey) providerConfig.apiKey = raw.apiKey
  if (raw.baseURL) providerConfig.baseURL = raw.baseURL
  if (raw.model) providerConfig.defaultModel = raw.model

  const migrated: Record<string, unknown> = { ...raw }
  migrated.providers = { [v1Provider]: providerConfig }
  migrated.defaultProvider = v1Provider
  if (raw.model) migrated.defaultModel = raw.model as string

  // Clean up v1 fields
  delete migrated.provider
  delete migrated.apiKey
  delete migrated.baseURL
  delete migrated.model

  return migrated
}

// ── Environment Variable Mapping ────────────────────────────────────

function loadEnvOverrides(): Record<string, unknown> {
  const env: Record<string, unknown> = {}

  if (process.env.ORCA_PROVIDER) env.defaultProvider = process.env.ORCA_PROVIDER
  if (process.env.ORCA_MODEL) env.defaultModel = process.env.ORCA_MODEL
  if (process.env.ORCA_MAX_TURNS) env.maxTurns = parseInt(process.env.ORCA_MAX_TURNS, 10)
  if (process.env.ORCA_MAX_BUDGET) env.maxBudgetUsd = parseFloat(process.env.ORCA_MAX_BUDGET)
  if (process.env.ORCA_PERMISSION_MODE) env.permissionMode = process.env.ORCA_PERMISSION_MODE
  if (process.env.ORCA_SYSTEM_PROMPT) env.systemPrompt = process.env.ORCA_SYSTEM_PROMPT
  if (process.env.ORCA_BASE_URL) env.baseURL = process.env.ORCA_BASE_URL

  return env
}

// ── Resolver ────────────────────────────────────────────────────────

export interface ResolveConfigOptions {
  cwd?: string
  flags?: Partial<OrcaConfig>
}

/**
 * Resolve configuration from all three tiers.
 * Priority: flags > env > project > global > defaults
 */
export function resolveConfig(options: ResolveConfigOptions = {}): OrcaConfig {
  const { cwd = process.cwd(), flags = {} } = options

  const global = migrateV1Config(loadGlobalConfig())
  const project = migrateV1Config(loadProjectConfig(cwd))
  const env = loadEnvOverrides()

  // Deep-merge providers from all layers
  const mergedProviders = deepMergeProviders(
    (global.providers || {}) as Record<string, Record<string, unknown>>,
    (project.providers || {}) as Record<string, Record<string, unknown>>,
  )

  // Merge top-level fields
  const merged: Record<string, unknown> = {
    ...global,
    ...project,
    ...env,
    ...stripUndefined(flags as Record<string, unknown>),
    providers: mergedProviders,
    permissionAllowlist: [
      ...new Set([
        ...(((global.permissionAllowlist as string[] | undefined) || [])),
        ...(((project.permissionAllowlist as string[] | undefined) || [])),
      ]),
    ],
  }

  // Handle v1 CLI flags (--provider, --api-key, --model) for backward compat
  const flagProvider = (flags as Record<string, unknown>).provider as string | undefined
  const flagApiKey = (flags as Record<string, unknown>).apiKey as string | undefined
  const flagModel = (flags as Record<string, unknown>).model as string | undefined

  // -m flag always promotes to defaultModel (highest priority in resolution chain)
  if (flagModel) {
    merged.defaultModel = flagModel
  }

  if (flagProvider && flagProvider !== 'auto') {
    merged.defaultProvider = flagProvider
    // Inject flag values into the provider block
    const providers = merged.providers as Record<string, Record<string, unknown>>
    const p = providers[flagProvider] || {}
    if (flagApiKey) p.apiKey = flagApiKey
    providers[flagProvider] = p
  }

  try {
    return OrcaConfigSchema.parse(merged)
  } catch (err) {
    if (err instanceof z.ZodError) {
      const issues = err.issues.map(i => `  - ${i.path.join('.')}: ${i.message}`).join('\n')
      throw new Error(`Invalid configuration:\n${issues}`)
    }
    throw err
  }
}

// ── Init ────────────────────────────────────────────────────────────

/**
 * Initialize global config directory and optionally write a project config.
 */
export function initGlobalConfig(): void {
  if (!existsSync(GLOBAL_DIR)) {
    mkdirSync(GLOBAL_DIR, { recursive: true })
  }
  if (!existsSync(GLOBAL_CONFIG)) {
    writeFileSync(GLOBAL_CONFIG, JSON.stringify({
      providers: {
        anthropic: {
          apiKey: '${ANTHROPIC_API_KEY}',
          defaultModel: 'claude-sonnet-4-20250514',
        },
      },
      defaultProvider: 'auto',
      maxTurns: 25,
    }, null, 2) + '\n', 'utf-8')
  }
}

export function initProjectConfig(cwd: string): string {
  const path = getProjectConfigPath(cwd)
  if (!existsSync(path)) {
    writeFileSync(path, JSON.stringify({
      defaultProvider: 'auto',
      systemPrompt: '',
      tools: [],
      mcpServers: {},
    }, null, 2) + '\n', 'utf-8')
  }
  return path
}

export function readStoredPermissionMode(scope: 'global' | 'project', cwd = process.cwd()): ConfigPermissionMode | undefined {
  const path = scope === 'global' ? GLOBAL_CONFIG : getProjectConfigPath(cwd)
  const raw = migrateV1Config(loadJsonFile(path))
  const mode = raw.permissionMode
  return typeof mode === 'string' ? mode as ConfigPermissionMode : undefined
}

export function readStoredPermissionAllowlist(scope: 'global' | 'project', cwd = process.cwd()): string[] {
  const path = scope === 'global' ? GLOBAL_CONFIG : getProjectConfigPath(cwd)
  const raw = migrateV1Config(loadJsonFile(path))
  return Array.isArray(raw.permissionAllowlist)
    ? raw.permissionAllowlist.filter((item): item is string => typeof item === 'string')
    : []
}

export function readEffectivePermissionAllowlist(cwd = process.cwd()): string[] {
  return [...new Set([
    ...readStoredPermissionAllowlist('global', cwd).map((rule) => inspectPermissionRule(rule, cwd, 'global').normalized),
    ...readStoredPermissionAllowlist('project', cwd).map((rule) => inspectPermissionRule(rule, cwd, 'project').normalized),
  ])]
}

export function detectPermissionModeSource(cwd = process.cwd()): PermissionModeSource {
  if (process.env.ORCA_PERMISSION_MODE) return 'env'
  if (readStoredPermissionMode('project', cwd)) return 'project'
  if (readStoredPermissionMode('global', cwd)) return 'global'
  return 'default'
}

export function setStoredPermissionMode(
  scope: 'global' | 'project',
  cwd: string,
  mode: ConfigPermissionMode,
): string {
  const path = scope === 'global' ? (initGlobalConfig(), GLOBAL_CONFIG) : initProjectConfig(cwd)
  const raw = migrateV1Config(loadJsonFile(path))
  raw.permissionMode = mode
  writeJsonFile(path, raw)
  return path
}

export function addStoredPermissionRule(
  scope: 'global' | 'project',
  cwd: string,
  ruleKey: string,
): string {
  const path = scope === 'global' ? (initGlobalConfig(), GLOBAL_CONFIG) : initProjectConfig(cwd)
  const raw = migrateV1Config(loadJsonFile(path))
  const current = Array.isArray(raw.permissionAllowlist)
    ? raw.permissionAllowlist.filter((item): item is string => typeof item === 'string')
    : []
  raw.permissionAllowlist = [...new Set([...current, ruleKey])]
  writeJsonFile(path, raw)
  return path
}

export function removeStoredPermissionRule(
  scope: 'global' | 'project',
  cwd: string,
  ruleKey: string,
): { path: string; removed: boolean } {
  const path = scope === 'global' ? (initGlobalConfig(), GLOBAL_CONFIG) : initProjectConfig(cwd)
  const raw = migrateV1Config(loadJsonFile(path))
  const current = Array.isArray(raw.permissionAllowlist)
    ? raw.permissionAllowlist.filter((item): item is string => typeof item === 'string')
    : []
  const targetNormalized = inspectPermissionRule(ruleKey, cwd, scope).normalized
  const next = current.filter((item) => {
    if (item === ruleKey) return false
    return inspectPermissionRule(item, cwd, scope).normalized !== targetNormalized
  })
  raw.permissionAllowlist = next
  writeJsonFile(path, raw)
  return { path, removed: next.length !== current.length }
}

export function clearStoredPermissionRules(
  scope: 'global' | 'project',
  cwd: string,
): { path: string; removedCount: number } {
  const path = scope === 'global' ? (initGlobalConfig(), GLOBAL_CONFIG) : initProjectConfig(cwd)
  const raw = migrateV1Config(loadJsonFile(path))
  const current = Array.isArray(raw.permissionAllowlist)
    ? raw.permissionAllowlist.filter((item): item is string => typeof item === 'string')
    : []
  raw.permissionAllowlist = []
  writeJsonFile(path, raw)
  return { path, removedCount: current.length }
}

function stableSerializePermissionValue(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerializePermissionValue(item)).join(',')}]`
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => `${JSON.stringify(key)}:${stableSerializePermissionValue(nested)}`)
  return `{${entries.join(',')}}`
}

function isLikelyCanonicalPermissionDescriptor(name: string, descriptor: string): boolean {
  if (!descriptor) return false
  if (name === 'write_file' || name === 'edit_file' || name === 'multi_edit' || name === 'delete_file' || name === 'read_file') {
    return descriptor.startsWith('path=')
  }
  if (name === 'run_command' || name === 'run_background') {
    return descriptor.startsWith('command=')
  }
  if (name === 'git_commit') {
    return descriptor.startsWith('repo=') && descriptor !== 'repo=current'
  }
  if (name === 'move_file') {
    return descriptor.startsWith('source=') && descriptor.includes('|destination=')
  }
  if (/^[\[{"]/.test(descriptor)) return true
  if (/^(true|false|null|-?\d)/.test(descriptor)) return true
  return false
}

function normalizeLegacyPermissionDescriptor(
  name: string,
  descriptor: string,
  cwd = process.cwd(),
  scope: 'project' | 'global' = 'project',
): string | null {
  if (name === 'write_file') {
    const match = descriptor.match(/^write \d+ bytes to (.+)$/s)
    return match ? `path=${match[1]}` : null
  }
  if (name === 'edit_file' || name === 'multi_edit' || name === 'delete_file' || name === 'read_file') {
    const match = descriptor.match(/^(?:edit|delete|read):?\s*(.+)$/s) || descriptor.match(/^(?:edit|delete|read) (.+)$/s)
    return match ? `path=${match[1]}` : null
  }
  if (name === 'move_file') {
    const match = descriptor.match(/^move (.+) → (.+)$/s)
    return match ? `source=${match[1]}|destination=${match[2]}` : null
  }
  if (name === 'run_command' || name === 'run_background') {
    const match = descriptor.match(/^run:\s*(.+)$/s)
    return match ? `command=${match[1]}` : null
  }
  if (name === 'git_commit') {
    const match = descriptor.match(/^commit:\s*(.+)$/s)
    if (match || descriptor === 'repo=current') {
      if (scope === 'global') return null
      return `repo=${getGitRepositoryRoot(cwd) || 'current'}`
    }
    return null
  }
  const prefixedJson = descriptor.match(new RegExp(`^${name}:\\s*(.+)$`, 's'))
  if (prefixedJson) {
    try {
      return stableSerializePermissionValue(JSON.parse(prefixedJson[1]!))
    } catch {
      return null
    }
  }
  return null
}

export function inspectPermissionRule(
  ruleKey: string,
  cwd = process.cwd(),
  scope: 'project' | 'global' = 'project',
): {
  original: string
  normalized: string
  status: PermissionRuleStatus
} {
  const canonicalDivider = ruleKey.indexOf('|')
  const legacyDivider = canonicalDivider > 0 ? -1 : ruleKey.indexOf('::')
  const divider = canonicalDivider > 0 ? canonicalDivider : legacyDivider
  const dividerLength = canonicalDivider > 0 ? 1 : legacyDivider > 0 ? 2 : 0
  if (divider <= 0) {
    return { original: ruleKey, normalized: ruleKey, status: 'unrecognized' }
  }

  const name = ruleKey.slice(0, divider)
  const descriptor = ruleKey.slice(divider + dividerLength)
  if (isLikelyCanonicalPermissionDescriptor(name, descriptor)) {
    return { original: ruleKey, normalized: ruleKey, status: 'canonical' }
  }

  const normalizedDescriptor = normalizeLegacyPermissionDescriptor(name, descriptor, cwd, scope)
  if (!normalizedDescriptor) {
    return { original: ruleKey, normalized: ruleKey, status: 'unrecognized' }
  }

  return {
    original: ruleKey,
    normalized: `${name}|${normalizedDescriptor}`,
    status: normalizedDescriptor === descriptor ? 'canonical' : 'normalized',
  }
}

export function summarizePermissionRules(
  rules: string[],
  cwd = process.cwd(),
  scope: 'project' | 'global' = 'project',
): {
  total: number
  canonical: number
  normalized: number
  unrecognized: number
} {
  const summary = { total: rules.length, canonical: 0, normalized: 0, unrecognized: 0 }
  for (const rule of rules) {
    const inspected = inspectPermissionRule(rule, cwd, scope)
    if (inspected.status === 'canonical') summary.canonical += 1
    else if (inspected.status === 'normalized') summary.normalized += 1
    else summary.unrecognized += 1
  }
  return summary
}

export function normalizeStoredPermissionRules(
  scope: 'global' | 'project',
  cwd: string,
): { path: string; total: number; changedCount: number; unresolvedCount: number } {
  const path = scope === 'global' ? (initGlobalConfig(), GLOBAL_CONFIG) : initProjectConfig(cwd)
  const raw = migrateV1Config(loadJsonFile(path))
  const current = Array.isArray(raw.permissionAllowlist)
    ? raw.permissionAllowlist.filter((item): item is string => typeof item === 'string')
    : []
  let changedCount = 0
  let unresolvedCount = 0
  const normalized = current.map((rule) => {
    const inspected = inspectPermissionRule(rule, cwd, scope)
    if (inspected.status === 'normalized') changedCount += 1
    if (inspected.status === 'unrecognized') unresolvedCount += 1
    return inspected.normalized
  })
  raw.permissionAllowlist = [...new Set(normalized)]
  writeJsonFile(path, raw)
  return { path, total: current.length, changedCount, unresolvedCount }
}

export function replPermissionModeFromConfig(mode: ConfigPermissionMode, forceSafe = false): ReplPermissionMode {
  if (forceSafe) return 'auto'
  if (mode === 'bypassPermissions') return 'yolo'
  if (mode === 'plan') return 'plan'
  if (mode === 'acceptEdits') return 'auto'
  return 'auto'
}

export function configPermissionModeFromRepl(mode: ReplPermissionMode): ConfigPermissionMode {
  if (mode === 'yolo') return 'bypassPermissions'
  if (mode === 'plan') return 'plan'
  return 'acceptEdits'
}

// ── Provider Resolution ─────────────────────────────────────────────

/**
 * Resolve which provider to use and return connection details.
 *
 * Resolution chain:
 *   1. If defaultProvider is explicit (not "auto"), use that provider's config
 *   2. If "auto", scan providers map for first one with a valid apiKey
 *   3. If no configured provider has a key, scan well-known env vars
 *   4. Fill in defaults from WELL_KNOWN_PROVIDERS
 *
 * The sdkProvider is always 'openai' — Orca uses a single SDK.
 */
export function resolveProvider(config: OrcaConfig): {
  provider: string
  apiKey: string
  model: string
  baseURL?: string
  sdkProvider: 'anthropic' | 'openai'
  headers?: Record<string, string>
  reasoningEffort?: string
} {
  const providerId = config.defaultProvider === 'auto'
    ? detectProvider(config)
    : config.defaultProvider

  const providerConfig = config.providers[providerId] || {}
  const wellKnown = WELL_KNOWN_PROVIDERS[providerId]
  const explicitProviderKey =
    resolveEnvTemplate(providerConfig.apiKey) ||
    (wellKnown ? process.env[wellKnown.envKey] : undefined)
  const requestedModel =
    config.defaultModel ||
    config.model ||  // v1 compat: flat model from flags
    providerConfig.defaultModel ||
    providerConfig.models?.[0] ||
    (wellKnown ? wellKnown.defaultModel : 'claude-sonnet-4-20250514')
  const effectiveModel = isCloudflareAggregator(providerId) && !explicitProviderKey
    ? pickFirstModelWithKey([
      requestedModel,
      ...(providerConfig.models || []),
      wellKnown?.defaultModel,
    ]) || requestedModel
    : requestedModel

  // Resolve apiKey: config (with env template) > well-known env var > v1 compat apiKey > ORCA_API_KEY
  const apiKey =
    explicitProviderKey ||
    (isCloudflareAggregator(providerId) ? inferRequestKeyForModel(effectiveModel) : undefined) ||
    config.apiKey ||  // v1 compat: flat apiKey from flags
    process.env.ORCA_API_KEY

  if (!apiKey) {
    const envHint = isCloudflareAggregator(providerId)
      ? 'CLOUDFLARE_AI_GATEWAY_API_KEY or provider API key matching the selected model prefix'
      : wellKnown ? wellKnown.envKey : `${providerId.toUpperCase()}_API_KEY`
    throw new Error(
      `No API key for provider "${providerId}". ` +
      `Set ${envHint}, or configure providers.${providerId}.apiKey in ~/.orca/config.json`
    )
  }

  // Resolve model: CLI defaultModel > v1 compat model > provider defaultModel > provider models[0] > well-known default
  const model = effectiveModel

  // Resolve baseURL: config (with env template) > well-known default
  const baseURL =
    resolveEnvTemplate(providerConfig.baseURL) ||
    getWellKnownBaseURL(wellKnown)

  // Orca always uses OpenAI-compatible protocol
  const sdkProvider = 'openai' as const

  // Resolve extra headers (with env template expansion)
  const rawHeaders = providerConfig.headers
  let headers: Record<string, string> | undefined
  if (rawHeaders) {
    headers = {}
    for (const [k, v] of Object.entries(rawHeaders)) {
      headers[k] = resolveEnvTemplate(v) || v
    }
  }

  // Auto-inject required headers for well-known providers
  if (providerId === 'copilot') {
    headers = { 'Copilot-Integration-Id': 'vscode-chat', ...headers }
  }

  return { provider: providerId, apiKey, model, baseURL, sdkProvider, headers, reasoningEffort: providerConfig.defaultEffort }
}

/**
 * Auto-detect the best provider from configured providers + env vars.
 *
 * Priority:
 *   1. Configured providers with resolvable apiKey (in config order)
 *   2. Well-known env vars (anthropic > openai > google > poe)
 */
function detectProvider(config: OrcaConfig): string {
  // Check model name hint first (v2 defaultModel or v1 compat model)
  const modelHint = config.defaultModel || config.model
  if (modelHint) {
    const m = modelHint.toLowerCase()
    if (m.startsWith('claude') || m.startsWith('anthropic')) return 'anthropic'
    if (m.startsWith('gpt') || m.startsWith('o1') || m.startsWith('o3') || m.startsWith('o4')) return 'openai'
    if (m.startsWith('gemini')) return 'google'
    if (m.startsWith('deepseek')) return 'deepseek'
    if (m.startsWith('grok')) return 'xai'
    if (m.startsWith('llama') || m.startsWith('qwen') || m.startsWith('kimi')) return 'local'
  }

  // Scan configured providers for one with a resolvable key
  for (const [id, pc] of Object.entries(config.providers)) {
    if (pc.disabled) continue
    const key = resolveEnvTemplate(pc.apiKey)
    if (key) return id
  }

  // Fall back to well-known env vars (preferred order: direct APIs first)
  const scanOrder = ['anthropic', 'openai', 'google', 'cloudflare', 'deepseek', 'openrouter', 'groq', 'xai', 'poe']
  for (const id of scanOrder) {
    const wk = WELL_KNOWN_PROVIDERS[id]
    if (wk && process.env[wk.envKey]) return id
  }

  return 'anthropic' // ultimate default
}

// ── Provider Listing (for `orca providers` command) ────────────────

export interface ProviderInfo {
  id: string
  baseURL: string
  hasKey: boolean
  model: string
  disabled: boolean
  source: 'config' | 'env' | 'well-known'
}

/**
 * List all available providers (configured + well-known with env keys).
 */
export function listProviders(config: OrcaConfig): ProviderInfo[] {
  const result: ProviderInfo[] = []
  const seen = new Set<string>()

  // Configured providers
  for (const [id, pc] of Object.entries(config.providers)) {
    seen.add(id)
    const wk = WELL_KNOWN_PROVIDERS[id]
    const configuredModel = pc.defaultModel || pc.models?.[0] || wk?.defaultModel || '(not set)'
    const model = isCloudflareAggregator(id)
      ? pickFirstModelWithKey([configuredModel, ...(pc.models || []), wk?.defaultModel]) || configuredModel
      : configuredModel
    const hasKey = !!(
      resolveEnvTemplate(pc.apiKey) ||
      (wk ? process.env[wk.envKey] : false) ||
      (isCloudflareAggregator(id) ? inferRequestKeyForModel(model) : false)
    )
    result.push({
      id,
      baseURL: resolveEnvTemplate(pc.baseURL) || getWellKnownBaseURL(wk) || '(not set)',
      hasKey,
      model,
      disabled: pc.disabled ?? false,
      source: 'config',
    })
  }

  // Well-known providers with env keys but not in config
  for (const [id, wk] of Object.entries(WELL_KNOWN_PROVIDERS)) {
    if (seen.has(id)) continue
    const model = isCloudflareAggregator(id)
      ? pickFirstModelWithKey([wk.defaultModel]) || wk.defaultModel
      : wk.defaultModel
    if (process.env[wk.envKey] || (isCloudflareAggregator(id) && inferRequestKeyForModel(model))) {
      result.push({
        id,
        baseURL: getWellKnownBaseURL(wk) || '(not set)',
        hasKey: true,
        model,
        disabled: false,
        source: 'env',
      })
    }
  }

  return result
}

// ── Model Endpoint Resolution (for multi-model) ────────────────────

export interface ModelEndpoint {
  model: string
  apiKey: string
  baseURL: string
  provider: string
  headers?: Record<string, string>
  reasoningEffort?: string
}

/**
 * Model name prefix → provider mapping for auto-detection.
 */
/**
 * Model prefix → candidate providers (ordered by preference).
 * First candidate with a valid API key wins.
 * This enables e.g. 'claude' to route to 'copilot' when 'anthropic' has no key.
 */
const MODEL_PREFIX_TO_PROVIDERS: Array<[string, string[]]> = [
  ['claude', ['poe', 'copilot', 'anthropic']],
  ['anthropic', ['poe', 'copilot', 'anthropic']],
  ['gpt', ['copilot', 'poe', 'openai']],
  ['o1', ['openai']],
  ['o3', ['openai']],
  ['o4', ['openai']],
  ['gemini', ['google']],
  ['gemma', ['google']],
  ['deepseek', ['deepseek']],
  ['grok', ['copilot', 'xai']],
  ['qwen', ['poe', 'local']],
  ['llama', ['local']],
  ['kimi', ['local']],
  ['glm', ['local']],
  ['minimax', ['local']],
]

function detectProviderForModel(model: string, providers?: Record<string, { apiKey?: string; disabled?: boolean }>): string | undefined {
  const lower = model.toLowerCase()
  for (const [prefix, candidates] of MODEL_PREFIX_TO_PROVIDERS) {
    if (!lower.startsWith(prefix)) continue
    // Return first candidate that has a usable API key
    if (providers) {
      for (const cand of candidates) {
        const pc = providers[cand]
        if (pc?.disabled) continue
        const wk = WELL_KNOWN_PROVIDERS[cand]
        const key = resolveEnvTemplate(pc?.apiKey) || (wk ? process.env[wk.envKey] : undefined)
        if (key) return cand
      }
    }
    return candidates[0] // fallback to first candidate
  }
  return undefined
}

/**
 * Resolve the endpoint (apiKey + baseURL) for a specific model.
 *
 * Strategy:
 *   1. If an aggregator provider is specified and available, use it (single endpoint for all models)
 *   2. Otherwise, detect which direct provider owns this model and use that provider's endpoint
 *   3. Fall back to the default provider
 *
 * This enables council/race/pipeline to send each model to the right endpoint.
 */
export function resolveModelEndpoint(
  model: string,
  config: OrcaConfig,
  aggregatorId?: string,
): ModelEndpoint | null {
  // Path 1: Aggregator available — use it for everything
  if (aggregatorId) {
    const agg = config.providers[aggregatorId]
    if (agg && !agg.disabled) {
      const wk = WELL_KNOWN_PROVIDERS[aggregatorId]
      const apiKey =
        resolveEnvTemplate(agg.apiKey) ||
        (wk ? process.env[wk.envKey] : undefined) ||
        (isCloudflareAggregator(aggregatorId) ? inferRequestKeyForModel(model) : undefined)
      const baseURL = resolveEnvTemplate(agg.baseURL) || getWellKnownBaseURL(wk)
      if (apiKey && baseURL) {
        // Resolve headers for aggregator (e.g. copilot needs Copilot-Integration-Id)
        let headers: Record<string, string> | undefined
        if (agg.headers) {
          headers = {}
          for (const [k, v] of Object.entries(agg.headers)) {
            headers[k] = resolveEnvTemplate(v) || v
          }
        }
        if (aggregatorId === 'copilot') {
          headers = { 'Copilot-Integration-Id': 'vscode-chat', ...headers }
        }
        return { model, apiKey, baseURL, provider: aggregatorId, headers, reasoningEffort: agg.defaultEffort }
      }
    }
  }

  // Path 2: Direct provider routing — find who owns this model (with key availability check)
  const detectedProvider = detectProviderForModel(model, config.providers as Record<string, { apiKey?: string; disabled?: boolean }>)
  if (detectedProvider) {
    const pc = config.providers[detectedProvider]
    const wk = WELL_KNOWN_PROVIDERS[detectedProvider]
    const apiKey =
      resolveEnvTemplate(pc?.apiKey) ||
      (wk ? process.env[wk.envKey] : undefined) ||
      (isCloudflareAggregator(detectedProvider) ? inferRequestKeyForModel(model) : undefined)
    const baseURL = resolveEnvTemplate(pc?.baseURL) || getWellKnownBaseURL(wk)
    if (apiKey && baseURL) {
      let headers: Record<string, string> | undefined
      if (pc?.headers) {
        headers = {}
        for (const [k, v] of Object.entries(pc.headers)) {
          headers[k] = resolveEnvTemplate(v) || v
        }
      }
      if (detectedProvider === 'copilot') {
        headers = { 'Copilot-Integration-Id': 'vscode-chat', ...headers }
      }
      return { model, apiKey, baseURL, provider: detectedProvider, headers, reasoningEffort: pc?.defaultEffort }
    }
  }

  // Path 3: Fall back to default provider (aggregator pass-through)
  // If the default provider can route to multiple models (e.g., Poe, OpenRouter),
  // pass the model name through — the aggregator handles vendor routing.
  try {
    const resolved = resolveProvider(config)
    if (resolved.baseURL) {
      return { model, apiKey: resolved.apiKey, baseURL: resolved.baseURL, provider: resolved.provider }
    }
  } catch { /* no default available */ }

  return null
}

/** Known aggregator provider IDs (route any model via a single endpoint) */
const KNOWN_AGGREGATORS = new Set(['poe', 'openrouter', 'cloudflare', 'claudeflare', 'zenmux', 'copilot'])
const PREFERRED_AGGREGATOR_ORDER = ['copilot', 'cloudflare', 'claudeflare', 'poe', 'openrouter', 'zenmux'] as const

/**
 * Find the best aggregator provider from config, or undefined if none available.
 *
 * Detection order:
 *   1. Explicit multiModel.provider (if aggregator-flagged)
 *   2. Any provider with aggregator: true
 *   3. Known aggregator by ID (poe, openrouter, zenmux) even without explicit flag
 *   4. Check env vars for well-known aggregator keys
 */
export function findAggregator(config: OrcaConfig): string | undefined {
  // Path 1: Explicit multiModel.provider
  const explicit = config.multiModel?.provider
  if (explicit) {
    const pc = config.providers[explicit]
    if (pc && !pc.disabled && (pc.aggregator || KNOWN_AGGREGATORS.has(explicit))) {
      const wk = WELL_KNOWN_PROVIDERS[explicit]
      const configuredModel = pc.defaultModel || pc.models?.[0] || wk?.defaultModel
      const model = isCloudflareAggregator(explicit)
        ? pickFirstModelWithKey([configuredModel, ...(pc.models || []), wk?.defaultModel]) || configuredModel
        : configuredModel
      const hasKey = !!(
        resolveEnvTemplate(pc?.apiKey) ||
        (wk ? process.env[wk.envKey] : undefined) ||
        (isCloudflareAggregator(explicit) ? inferRequestKeyForModel(model) : undefined)
      )
      if (hasKey) return explicit
    }
  }

  // Path 2: Scan known aggregators in the preferred economic order
  for (const id of PREFERRED_AGGREGATOR_ORDER) {
    const pc = config.providers[id]
    if (!pc) continue
    if (!pc.aggregator || pc.disabled) continue
    const wk = WELL_KNOWN_PROVIDERS[id]
    const configuredModel = pc.defaultModel || pc.models?.[0] || wk?.defaultModel
    const model = isCloudflareAggregator(id)
      ? pickFirstModelWithKey([configuredModel, ...(pc.models || []), wk?.defaultModel]) || configuredModel
      : configuredModel
    const hasKey = !!(
      resolveEnvTemplate(pc.apiKey) ||
      (wk ? process.env[wk.envKey] : undefined) ||
      (isCloudflareAggregator(id) ? inferRequestKeyForModel(model) : undefined)
    )
    if (hasKey) return id
  }

  // Path 2b: Scan any remaining custom aggregators not covered above
  for (const [id, pc] of Object.entries(config.providers)) {
    if (PREFERRED_AGGREGATOR_ORDER.includes(id as typeof PREFERRED_AGGREGATOR_ORDER[number])) continue
    if (!pc.aggregator || pc.disabled) continue
    const wk = WELL_KNOWN_PROVIDERS[id]
    const configuredModel = pc.defaultModel || pc.models?.[0] || wk?.defaultModel
    const model = isCloudflareAggregator(id)
      ? pickFirstModelWithKey([configuredModel, ...(pc.models || []), wk?.defaultModel]) || configuredModel
      : configuredModel
    const hasKey = !!(
      resolveEnvTemplate(pc.apiKey) ||
      (wk ? process.env[wk.envKey] : undefined) ||
      (isCloudflareAggregator(id) ? inferRequestKeyForModel(model) : undefined)
    )
    if (hasKey) return id
  }

  // Path 3: Auto-detect known aggregators by provider ID (even without aggregator: true)
  for (const aggId of PREFERRED_AGGREGATOR_ORDER) {
    const wk = WELL_KNOWN_PROVIDERS[aggId]
    if (!wk) continue
    const pc = config.providers[aggId]
    if (pc?.disabled) continue
    const configuredModel = pc?.defaultModel || pc?.models?.[0] || wk.defaultModel
    const model = isCloudflareAggregator(aggId)
      ? pickFirstModelWithKey([configuredModel, ...((pc?.models || []) as string[]), wk.defaultModel]) || configuredModel
      : configuredModel
    const hasKey = !!(
      resolveEnvTemplate(pc?.apiKey) ||
      process.env[wk.envKey] ||
      (isCloudflareAggregator(aggId) ? inferRequestKeyForModel(model) : undefined)
    )
    if (hasKey) return aggId
  }

  return undefined
}

// ── Helpers ─────────────────────────────────────────────────────────

function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  )
}

function deepMergeProviders(
  ...layers: Array<Record<string, Record<string, unknown>>>
): Record<string, Record<string, unknown>> {
  const result: Record<string, Record<string, unknown>> = {}
  for (const layer of layers) {
    for (const [id, config] of Object.entries(layer)) {
      result[id] = { ...(result[id] || {}), ...config }
    }
  }
  return result
}
