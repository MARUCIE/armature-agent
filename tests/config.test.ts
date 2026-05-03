import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import {
  addStoredPermissionRule,
  clearStoredPermissionRules,
  configPermissionModeFromRepl,
  findAggregator,
  initProjectConfig,
  inspectPermissionRule,
  listProviders,
  normalizeStoredPermissionRules,
  readEffectivePermissionAllowlist,
  removeStoredPermissionRule,
  readStoredPermissionMode,
  readStoredPermissionAllowlist,
  replPermissionModeFromConfig,
  resolveConfig,
  resolveModelEndpoint,
  resolveProvider,
  setStoredPermissionMode,
  summarizePermissionRules,
} from '../src/config.js'
import { existsSync, mkdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtempSync } from 'node:fs'

describe('config', () => {
  let tempDir: string

  function initGitRepo(cwd: string) {
    execFileSync('git', ['init'], { cwd, stdio: 'ignore' })
    execFileSync('git', ['config', 'user.name', 'Test User'], { cwd, stdio: 'ignore' })
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd, stdio: 'ignore' })
  }

  function getRepoRoot(cwd: string): string {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  }

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'orca-test-'))
  })

  afterEach(() => {
    const configPath = join(tempDir, '.orca.json')
    if (existsSync(configPath)) {
      unlinkSync(configPath)
    }
  })

  describe('resolveConfig', () => {
    it('returns defaults when no config exists', () => {
      const originalPermissionMode = process.env.ORCA_PERMISSION_MODE
      delete process.env.ORCA_PERMISSION_MODE
      try {
        // Override global config defaults so the schema defaults are asserted deterministically.
        const config = resolveConfig({
          cwd: tempDir,
          flags: { defaultProvider: 'auto', permissionMode: 'default' },
        })
        expect(config.defaultProvider).toBe('auto')
        expect(config.maxTurns).toBe(25)
        expect(config.permissionMode).toBe('default')
      } finally {
        if (originalPermissionMode === undefined) delete process.env.ORCA_PERMISSION_MODE
        else process.env.ORCA_PERMISSION_MODE = originalPermissionMode
      }
    })

    it('flags override defaults', () => {
      const config = resolveConfig({
        cwd: tempDir,
        flags: { model: 'gpt-4.1', provider: 'openai', maxTurns: 10 },
      })
      // v1 compat: flat flags.model goes to config.model, flags.provider sets defaultProvider
      expect(config.model).toBe('gpt-4.1')
      expect(config.defaultProvider).toBe('openai')
      expect(config.maxTurns).toBe(10)
    })

    it('reads project config from .orca.json', () => {
      initProjectConfig(tempDir)
      const config = resolveConfig({ cwd: tempDir })
      expect(config.defaultProvider).toBe('auto')
    })

    it('env variables override project config', () => {
      const originalKey = process.env.ORCA_PROVIDER
      process.env.ORCA_PROVIDER = 'openai'
      try {
        const config = resolveConfig({ cwd: tempDir })
        expect(config.defaultProvider).toBe('openai')
      } finally {
        if (originalKey) {
          process.env.ORCA_PROVIDER = originalKey
        } else {
          delete process.env.ORCA_PROVIDER
        }
      }
    })

    it('flags override env variables', () => {
      const originalKey = process.env.ORCA_PROVIDER
      process.env.ORCA_PROVIDER = 'openai'
      try {
        const config = resolveConfig({
          cwd: tempDir,
          flags: { provider: 'anthropic' },
        })
        expect(config.defaultProvider).toBe('anthropic')
      } finally {
        if (originalKey) {
          process.env.ORCA_PROVIDER = originalKey
        } else {
          delete process.env.ORCA_PROVIDER
        }
      }
    })
  })

  describe('resolveProvider', () => {
    it('auto-detects anthropic from model name', () => {
      const config = resolveConfig({
        cwd: tempDir,
        flags: { model: 'claude-sonnet-4-20250514', apiKey: 'test-key', defaultProvider: 'auto' },
      })
      const { provider, model } = resolveProvider(config)
      expect(provider).toBe('anthropic')
      expect(model).toBe('claude-sonnet-4-20250514')
    })

    it('auto-detects openai from model name', () => {
      const config = resolveConfig({
        cwd: tempDir,
        flags: { model: 'gpt-4.1', apiKey: 'test-key', defaultProvider: 'auto' },
      })
      const { provider } = resolveProvider(config)
      expect(provider).toBe('openai')
    })

    it('auto-detects google from model name', () => {
      const config = resolveConfig({
        cwd: tempDir,
        flags: { model: 'gemini-2.5-pro', apiKey: 'test-key', defaultProvider: 'auto' },
      })
      const { provider } = resolveProvider(config)
      expect(provider).toBe('google')
    })

    it('throws when no API key available', () => {
      // Clear all potential API keys (including POE)
      const saved = {
        ORCA_API_KEY: process.env.ORCA_API_KEY,
        POE_API_KEY: process.env.POE_API_KEY,
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
      }
      delete process.env.ORCA_API_KEY
      delete process.env.POE_API_KEY
      delete process.env.ANTHROPIC_API_KEY
      delete process.env.OPENAI_API_KEY
      delete process.env.GOOGLE_API_KEY

      try {
        const config = resolveConfig({
          cwd: tempDir,
          flags: { provider: 'openai' },
        })
        expect(() => resolveProvider(config)).toThrow('No API key for provider')
      } finally {
        // Restore
        for (const [k, v] of Object.entries(saved)) {
          if (v !== undefined) process.env[k] = v
          else delete process.env[k]
        }
      }
    })

    it('uses explicit API key from flags', () => {
      const config = resolveConfig({
        cwd: tempDir,
        flags: { provider: 'anthropic', apiKey: 'sk-test-123' },
      })
      const { apiKey } = resolveProvider(config)
      expect(apiKey).toBe('sk-test-123')
    })

    it('resolves cloudflare from env-backed gateway config', () => {
      const saved = {
        CLOUDFLARE_AI_GATEWAY_API_KEY: process.env.CLOUDFLARE_AI_GATEWAY_API_KEY,
        CLOUDFLARE_AI_GATEWAY_BASE_URL: process.env.CLOUDFLARE_AI_GATEWAY_BASE_URL,
        CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
        CLOUDFLARE_AI_GATEWAY_ID: process.env.CLOUDFLARE_AI_GATEWAY_ID,
      }
      process.env.CLOUDFLARE_AI_GATEWAY_API_KEY = 'cf-gateway-test'
      process.env.CLOUDFLARE_AI_GATEWAY_BASE_URL =
        'https://gateway.ai.cloudflare.com/v1/account/default/compat'

      try {
        const config = resolveConfig({
          cwd: tempDir,
          flags: { provider: 'cloudflare' },
        })
        config.providers.cloudflare = {
          ...config.providers.cloudflare,
          defaultModel: 'anthropic/claude-opus-4.7',
          models: ['anthropic/claude-opus-4.7'],
        }
        const { provider, model, baseURL, apiKey } = resolveProvider(config)
        expect(provider).toBe('cloudflare')
        expect(model).toBe('anthropic/claude-opus-4.7')
        expect(baseURL).toBe('https://gateway.ai.cloudflare.com/v1/account/default/compat')
        expect(apiKey).toBe('cf-gateway-test')
      } finally {
        for (const [key, value] of Object.entries(saved)) {
          if (value === undefined) delete process.env[key]
          else process.env[key] = value
        }
      }
    })

    it('builds cloudflare gateway base url from account and gateway env vars', () => {
      const saved = {
        CLOUDFLARE_AI_GATEWAY_API_KEY: process.env.CLOUDFLARE_AI_GATEWAY_API_KEY,
        CLOUDFLARE_AI_GATEWAY_BASE_URL: process.env.CLOUDFLARE_AI_GATEWAY_BASE_URL,
        CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
        CLOUDFLARE_AI_GATEWAY_ID: process.env.CLOUDFLARE_AI_GATEWAY_ID,
      }
      delete process.env.CLOUDFLARE_AI_GATEWAY_BASE_URL
      process.env.CLOUDFLARE_AI_GATEWAY_API_KEY = 'cf-gateway-test'
      process.env.CLOUDFLARE_ACCOUNT_ID = 'acct-123'
      process.env.CLOUDFLARE_AI_GATEWAY_ID = 'sota'

      try {
        const config = resolveConfig({
          cwd: tempDir,
          flags: { provider: 'cloudflare' },
        })
        const { baseURL } = resolveProvider(config)
        expect(baseURL).toBe('https://gateway.ai.cloudflare.com/v1/acct-123/sota/compat')
      } finally {
        for (const [key, value] of Object.entries(saved)) {
          if (value === undefined) delete process.env[key]
          else process.env[key] = value
        }
      }
    })

    it('falls back to the first cloudflare model with an available provider key', () => {
      const saved = {
        CLOUDFLARE_AI_GATEWAY_API_KEY: process.env.CLOUDFLARE_AI_GATEWAY_API_KEY,
        CLOUDFLARE_AI_GATEWAY_BASE_URL: process.env.CLOUDFLARE_AI_GATEWAY_BASE_URL,
        GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      }
      delete process.env.CLOUDFLARE_AI_GATEWAY_API_KEY
      process.env.CLOUDFLARE_AI_GATEWAY_BASE_URL =
        'https://gateway.ai.cloudflare.com/v1/account/default/compat'
      process.env.GOOGLE_API_KEY = 'google-test-key'
      delete process.env.OPENAI_API_KEY
      delete process.env.ANTHROPIC_API_KEY

      try {
        const config = resolveConfig({ cwd: tempDir })
        config.providers.cloudflare = {
          apiKey: '${CLOUDFLARE_AI_GATEWAY_API_KEY}',
          baseURL: '${CLOUDFLARE_AI_GATEWAY_BASE_URL}',
          defaultModel: 'anthropic/claude-opus-4.7',
          models: [
            'anthropic/claude-opus-4.7',
            'google-ai-studio/gemini-3.1-pro-preview',
          ],
          aggregator: true,
          disabled: false,
        }
        config.defaultProvider = 'cloudflare'

        const { model, apiKey } = resolveProvider(config)
        expect(model).toBe('google-ai-studio/gemini-3.1-pro-preview')
        expect(apiKey).toBe('google-test-key')
      } finally {
        for (const [key, value] of Object.entries(saved)) {
          if (value === undefined) delete process.env[key]
          else process.env[key] = value
        }
      }
    })
  })

  describe('aggregators', () => {
    it('finds cloudflare as an explicit aggregator', () => {
      const saved = {
        CLOUDFLARE_AI_GATEWAY_API_KEY: process.env.CLOUDFLARE_AI_GATEWAY_API_KEY,
        CLOUDFLARE_AI_GATEWAY_BASE_URL: process.env.CLOUDFLARE_AI_GATEWAY_BASE_URL,
      }
      process.env.CLOUDFLARE_AI_GATEWAY_API_KEY = 'cf-gateway-test'
      process.env.CLOUDFLARE_AI_GATEWAY_BASE_URL =
        'https://gateway.ai.cloudflare.com/v1/account/default/compat'

      try {
        const config = resolveConfig({ cwd: tempDir })
        config.providers.cloudflare = {
          apiKey: '${CLOUDFLARE_AI_GATEWAY_API_KEY}',
          baseURL: '${CLOUDFLARE_AI_GATEWAY_BASE_URL}',
          defaultModel: 'anthropic/claude-opus-4.7',
          aggregator: true,
          disabled: false,
        }
        config.multiModel.provider = 'cloudflare'

        expect(findAggregator(config)).toBe('cloudflare')
      } finally {
        for (const [key, value] of Object.entries(saved)) {
          if (value === undefined) delete process.env[key]
          else process.env[key] = value
        }
      }
    })

    it('treats claudeflare alias as a known aggregator id', () => {
      const saved = {
        CLOUDFLARE_AI_GATEWAY_API_KEY: process.env.CLOUDFLARE_AI_GATEWAY_API_KEY,
        CLOUDFLARE_AI_GATEWAY_BASE_URL: process.env.CLOUDFLARE_AI_GATEWAY_BASE_URL,
      }
      process.env.CLOUDFLARE_AI_GATEWAY_API_KEY = 'cf-gateway-test'
      process.env.CLOUDFLARE_AI_GATEWAY_BASE_URL =
        'https://gateway.ai.cloudflare.com/v1/account/default/compat'

      try {
        const config = resolveConfig({ cwd: tempDir })
        config.providers.claudeflare = {
          apiKey: '${CLOUDFLARE_AI_GATEWAY_API_KEY}',
          baseURL: '${CLOUDFLARE_AI_GATEWAY_BASE_URL}',
          defaultModel: 'anthropic/claude-opus-4.7',
          disabled: false,
        }
        config.multiModel.provider = 'claudeflare'

        expect(findAggregator(config)).toBe('claudeflare')
      } finally {
        for (const [key, value] of Object.entries(saved)) {
          if (value === undefined) delete process.env[key]
          else process.env[key] = value
        }
      }
    })
  })

  describe('initProjectConfig', () => {
    it('creates .orca.json in target directory', () => {
      const path = initProjectConfig(tempDir)
      expect(existsSync(path)).toBe(true)
    })

    it('does not overwrite existing config', () => {
      initProjectConfig(tempDir)
      // Second call should not throw
      const path = initProjectConfig(tempDir)
      expect(existsSync(path)).toBe(true)
    })
  })

  describe('permission mode helpers', () => {
    it('maps config modes to repl modes', () => {
      expect(replPermissionModeFromConfig('default')).toBe('auto')
      expect(replPermissionModeFromConfig('acceptEdits')).toBe('auto')
      expect(replPermissionModeFromConfig('bypassPermissions')).toBe('yolo')
      expect(replPermissionModeFromConfig('plan')).toBe('plan')
      expect(replPermissionModeFromConfig('bypassPermissions', true)).toBe('auto')
    })

    it('maps repl modes back to persisted config modes', () => {
      expect(configPermissionModeFromRepl('yolo')).toBe('bypassPermissions')
      expect(configPermissionModeFromRepl('auto')).toBe('acceptEdits')
      expect(configPermissionModeFromRepl('plan')).toBe('plan')
    })

    it('writes and reads project permission mode', () => {
      const path = setStoredPermissionMode('project', tempDir, 'plan')
      expect(path).toContain('.orca.json')
      expect(readStoredPermissionMode('project', tempDir)).toBe('plan')
    })

    it('adds, removes, and clears stored project permission rules', () => {
      addStoredPermissionRule('project', tempDir, 'run_command::run: echo hello')
      addStoredPermissionRule('project', tempDir, 'write_file::write: src/index.ts')
      expect(readStoredPermissionAllowlist('project', tempDir)).toEqual([
        'run_command::run: echo hello',
        'write_file::write: src/index.ts',
      ])

      expect(removeStoredPermissionRule('project', tempDir, 'run_command::run: echo hello').removed).toBe(true)
      expect(readStoredPermissionAllowlist('project', tempDir)).toEqual([
        'write_file::write: src/index.ts',
      ])

      expect(clearStoredPermissionRules('project', tempDir).removedCount).toBe(1)
      expect(readStoredPermissionAllowlist('project', tempDir)).toEqual([])
    })

    it('classifies and normalizes legacy permission rules', () => {
      expect(inspectPermissionRule('write_file|write 120 bytes to src/index.ts')).toEqual({
        original: 'write_file|write 120 bytes to src/index.ts',
        normalized: 'write_file|path=src/index.ts',
        status: 'normalized',
      })
      expect(inspectPermissionRule('move_file|move src/a.ts → src/b.ts')).toEqual({
        original: 'move_file|move src/a.ts → src/b.ts',
        normalized: 'move_file|source=src/a.ts|destination=src/b.ts',
        status: 'normalized',
      })
      expect(inspectPermissionRule('git_commit|commit: chore: update permissions', tempDir)).toEqual({
        original: 'git_commit|commit: chore: update permissions',
        normalized: 'git_commit|repo=current',
        status: 'normalized',
      })
      expect(inspectPermissionRule('run_command|run: FOO=bar make test')).toEqual({
        original: 'run_command|run: FOO=bar make test',
        normalized: 'run_command|command=FOO=bar make test',
        status: 'normalized',
      })
      expect(inspectPermissionRule('run_command|command=echo hello')).toEqual({
        original: 'run_command|command=echo hello',
        normalized: 'run_command|command=echo hello',
        status: 'canonical',
      })
      expect(inspectPermissionRule('run_command::run: echo hello')).toEqual({
        original: 'run_command::run: echo hello',
        normalized: 'run_command|command=echo hello',
        status: 'normalized',
      })
      expect(inspectPermissionRule('legacy-rule-without-divider')).toEqual({
        original: 'legacy-rule-without-divider',
        normalized: 'legacy-rule-without-divider',
        status: 'unrecognized',
      })
    })

    it('summarizes git commit legacy rules with scope-aware normalization', () => {
      initGitRepo(tempDir)
      expect(summarizePermissionRules(['git_commit|commit: chore: update permissions'], tempDir, 'project')).toEqual({
        total: 1,
        canonical: 0,
        normalized: 1,
        unrecognized: 0,
      })
      expect(summarizePermissionRules(['git_commit|commit: chore: update permissions'], tempDir, 'global')).toEqual({
        total: 1,
        canonical: 0,
        normalized: 0,
        unrecognized: 1,
      })
    })

    it('normalizes git commit permission rules to the current repository in effective allowlists', async () => {
      const previousHome = process.env.HOME
      const previousOrcaHome = process.env.ORCA_HOME
      const isolatedHome = mkdtempSync(join(tmpdir(), 'orca-home-'))
      process.env.HOME = isolatedHome
      process.env.ORCA_HOME = join(isolatedHome, '.orca')

      try {
        vi.resetModules()
        const configModule = await import('../src/config.js')
        initGitRepo(tempDir)
        const repoRoot = getRepoRoot(tempDir)
        configModule.addStoredPermissionRule('project', tempDir, 'git_commit|commit: chore: update permissions')

        expect(configModule.readEffectivePermissionAllowlist(tempDir)).toEqual([`git_commit|repo=${repoRoot}`])
        expect(configModule.inspectPermissionRule('git_commit|repo=current', tempDir)).toEqual({
          original: 'git_commit|repo=current',
          normalized: `git_commit|repo=${repoRoot}`,
          status: 'normalized',
        })
      } finally {
        vi.resetModules()
        if (previousHome === undefined) delete process.env.HOME
        else process.env.HOME = previousHome
        if (previousOrcaHome === undefined) delete process.env.ORCA_HOME
        else process.env.ORCA_HOME = previousOrcaHome
      }
    })

    it('removes normalized git commit grants even when the stored rule is legacy', () => {
      initGitRepo(tempDir)
      const repoRoot = getRepoRoot(tempDir)
      addStoredPermissionRule('project', tempDir, 'git_commit|commit: chore: update permissions')
      addStoredPermissionRule('project', tempDir, `git_commit|repo=${repoRoot}`)

      expect(removeStoredPermissionRule('project', tempDir, `git_commit|repo=${repoRoot}`).removed).toBe(true)
      expect(readStoredPermissionAllowlist('project', tempDir)).toEqual([])
    })

    it('does not auto-promote legacy global git commit rules into repo-scoped grants', async () => {
      const previousHome = process.env.HOME
      const previousOrcaHome = process.env.ORCA_HOME
      const isolatedHome = mkdtempSync(join(tmpdir(), 'orca-home-'))
      process.env.HOME = isolatedHome
      process.env.ORCA_HOME = join(isolatedHome, '.orca')

      try {
        vi.resetModules()
        const configModule = await import('../src/config.js')
        initGitRepo(tempDir)
        configModule.addStoredPermissionRule('global', tempDir, 'git_commit|commit: chore: update permissions')

        expect(configModule.readEffectivePermissionAllowlist(tempDir)).toEqual([
          'git_commit|commit: chore: update permissions',
        ])
        expect(configModule.normalizeStoredPermissionRules('global', tempDir)).toMatchObject({
          changedCount: 0,
          unresolvedCount: 1,
        })
      } finally {
        vi.resetModules()
        if (previousHome === undefined) delete process.env.HOME
        else process.env.HOME = previousHome
        if (previousOrcaHome === undefined) delete process.env.ORCA_HOME
        else process.env.ORCA_HOME = previousOrcaHome
      }
    })

    it('normalizes stored project permission rules and dedupes canonical collisions', () => {
      addStoredPermissionRule('project', tempDir, 'write_file|write 120 bytes to src/index.ts')
      addStoredPermissionRule('project', tempDir, 'write_file|path=src/index.ts')
      addStoredPermissionRule('project', tempDir, 'legacy-rule-without-divider')

      const result = normalizeStoredPermissionRules('project', tempDir)
      expect(result.changedCount).toBe(1)
      expect(result.unresolvedCount).toBe(1)
      expect(readStoredPermissionAllowlist('project', tempDir)).toEqual([
        'write_file|path=src/index.ts',
        'legacy-rule-without-divider',
      ])
    })

    it('merges effective project/global permission allowlists', async () => {
      const previousHome = process.env.HOME
      const previousOrcaHome = process.env.ORCA_HOME
      const isolatedHome = join(tempDir, 'home')
      mkdirSync(isolatedHome, { recursive: true })
      process.env.HOME = isolatedHome
      process.env.ORCA_HOME = join(isolatedHome, '.orca')

      try {
        vi.resetModules()
        const configModule = await import('../src/config.js')
        configModule.clearStoredPermissionRules('global', tempDir)
        configModule.addStoredPermissionRule('global', tempDir, 'run_command|command=echo hello')
        configModule.addStoredPermissionRule('project', tempDir, 'write_file|path=src/index.ts')
        configModule.addStoredPermissionRule('project', tempDir, 'run_command|command=echo hello')

        expect(configModule.readEffectivePermissionAllowlist(tempDir)).toEqual([
          'run_command|command=echo hello',
          'write_file|path=src/index.ts',
        ])
      } finally {
        vi.resetModules()
        if (previousHome === undefined) delete process.env.HOME
        else process.env.HOME = previousHome
        if (previousOrcaHome === undefined) delete process.env.ORCA_HOME
        else process.env.ORCA_HOME = previousOrcaHome
      }
    })
  })

  describe('findAggregator: auto-detect known aggregators', () => {
    it('29.1 detects poe as aggregator by provider ID', () => {
      const saved = {
        POE_API_KEY: process.env.POE_API_KEY,
        OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
        GH_TOKEN: process.env.GH_TOKEN,
        COPILOT_API_KEY: process.env.COPILOT_API_KEY,
        ZENMUX_API_KEY: process.env.ZENMUX_API_KEY,
        CLOUDFLARE_AI_GATEWAY_API_KEY: process.env.CLOUDFLARE_AI_GATEWAY_API_KEY,
        CLOUDFLARE_AI_GATEWAY_BASE_URL: process.env.CLOUDFLARE_AI_GATEWAY_BASE_URL,
        CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
        CLOUDFLARE_AI_GATEWAY_ID: process.env.CLOUDFLARE_AI_GATEWAY_ID,
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
        GOOGLE_AI_STUDIO_KEY: process.env.GOOGLE_AI_STUDIO_KEY,
        GEMINI_API_KEY: process.env.GEMINI_API_KEY,
        XAI_API_KEY: process.env.XAI_API_KEY,
      }
      process.env.POE_API_KEY = 'test-poe-key'
      delete process.env.OPENROUTER_API_KEY
      delete process.env.GH_TOKEN
      delete process.env.COPILOT_API_KEY
      delete process.env.ZENMUX_API_KEY
      delete process.env.CLOUDFLARE_AI_GATEWAY_API_KEY
      delete process.env.CLOUDFLARE_AI_GATEWAY_BASE_URL
      delete process.env.CLOUDFLARE_ACCOUNT_ID
      delete process.env.CLOUDFLARE_AI_GATEWAY_ID
      delete process.env.ANTHROPIC_API_KEY
      delete process.env.OPENAI_API_KEY
      delete process.env.GOOGLE_API_KEY
      delete process.env.GOOGLE_AI_STUDIO_KEY
      delete process.env.GEMINI_API_KEY
      delete process.env.XAI_API_KEY
      try {
        const config = resolveConfig({ cwd: tempDir })
        config.providers = { poe: { ...config.providers.poe } }
        const agg = findAggregator(config)
        expect(agg).toBe('poe')
      } finally {
        for (const [k, v] of Object.entries(saved)) {
          if (v) process.env[k] = v
          else delete process.env[k]
        }
      }
    })

    it('29.2 returns undefined when no aggregator or routed provider keys exist', () => {
      const saved = {
        POE_API_KEY: process.env.POE_API_KEY,
        OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
        GH_TOKEN: process.env.GH_TOKEN,
        COPILOT_API_KEY: process.env.COPILOT_API_KEY,
        ZENMUX_API_KEY: process.env.ZENMUX_API_KEY,
        CLOUDFLARE_AI_GATEWAY_API_KEY: process.env.CLOUDFLARE_AI_GATEWAY_API_KEY,
        CLOUDFLARE_AI_GATEWAY_BASE_URL: process.env.CLOUDFLARE_AI_GATEWAY_BASE_URL,
        CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
        CLOUDFLARE_AI_GATEWAY_ID: process.env.CLOUDFLARE_AI_GATEWAY_ID,
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
        GOOGLE_AI_STUDIO_KEY: process.env.GOOGLE_AI_STUDIO_KEY,
        GEMINI_API_KEY: process.env.GEMINI_API_KEY,
        XAI_API_KEY: process.env.XAI_API_KEY,
      }
      delete process.env.POE_API_KEY
      delete process.env.OPENROUTER_API_KEY
      delete process.env.GH_TOKEN
      delete process.env.COPILOT_API_KEY
      delete process.env.ZENMUX_API_KEY
      delete process.env.CLOUDFLARE_AI_GATEWAY_API_KEY
      delete process.env.CLOUDFLARE_AI_GATEWAY_BASE_URL
      delete process.env.CLOUDFLARE_ACCOUNT_ID
      delete process.env.CLOUDFLARE_AI_GATEWAY_ID
      delete process.env.ANTHROPIC_API_KEY
      delete process.env.OPENAI_API_KEY
      delete process.env.GOOGLE_API_KEY
      delete process.env.GOOGLE_AI_STUDIO_KEY
      delete process.env.GEMINI_API_KEY
      delete process.env.XAI_API_KEY
      try {
        const config = resolveConfig({ cwd: tempDir })
        // Also clear any provider configs that might have keys
        config.providers = {}
        expect(findAggregator(config)).toBeUndefined()
      } finally {
        for (const [k, v] of Object.entries(saved)) {
          if (v) process.env[k] = v
          else delete process.env[k]
        }
      }
    })

    it('29.3 resolveModelEndpoint uses aggregator pass-through', () => {
      const saved = {
        POE_API_KEY: process.env.POE_API_KEY,
        OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
        GH_TOKEN: process.env.GH_TOKEN,
        COPILOT_API_KEY: process.env.COPILOT_API_KEY,
        ZENMUX_API_KEY: process.env.ZENMUX_API_KEY,
        CLOUDFLARE_AI_GATEWAY_API_KEY: process.env.CLOUDFLARE_AI_GATEWAY_API_KEY,
        CLOUDFLARE_AI_GATEWAY_BASE_URL: process.env.CLOUDFLARE_AI_GATEWAY_BASE_URL,
        CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
        CLOUDFLARE_AI_GATEWAY_ID: process.env.CLOUDFLARE_AI_GATEWAY_ID,
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
        GOOGLE_AI_STUDIO_KEY: process.env.GOOGLE_AI_STUDIO_KEY,
        GEMINI_API_KEY: process.env.GEMINI_API_KEY,
        XAI_API_KEY: process.env.XAI_API_KEY,
      }
      process.env.POE_API_KEY = 'test-poe-key'
      delete process.env.OPENROUTER_API_KEY
      delete process.env.GH_TOKEN
      delete process.env.COPILOT_API_KEY
      delete process.env.ZENMUX_API_KEY
      delete process.env.CLOUDFLARE_AI_GATEWAY_API_KEY
      delete process.env.CLOUDFLARE_AI_GATEWAY_BASE_URL
      delete process.env.CLOUDFLARE_ACCOUNT_ID
      delete process.env.CLOUDFLARE_AI_GATEWAY_ID
      delete process.env.ANTHROPIC_API_KEY
      delete process.env.OPENAI_API_KEY
      delete process.env.GOOGLE_API_KEY
      delete process.env.GOOGLE_AI_STUDIO_KEY
      delete process.env.GEMINI_API_KEY
      delete process.env.XAI_API_KEY
      try {
        const config = resolveConfig({ cwd: tempDir })
        config.providers = { poe: { ...config.providers.poe } }
        const aggId = findAggregator(config)
        expect(aggId).toBe('poe')

        // claude-opus-4.6 should route through poe aggregator
        const ep = resolveModelEndpoint('claude-opus-4.6', config, aggId)
        expect(ep).not.toBeNull()
        expect(ep!.provider).toBe('poe')
        expect(ep!.model).toBe('claude-opus-4.6')
        expect(ep!.apiKey).toBe('test-poe-key')
      } finally {
        for (const [k, v] of Object.entries(saved)) {
          if (v) process.env[k] = v
          else delete process.env[k]
        }
      }
    })

    it('29.4 resolveModelEndpoint routes diverse models through same aggregator', () => {
      const saved = {
        POE_API_KEY: process.env.POE_API_KEY,
        OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
        GH_TOKEN: process.env.GH_TOKEN,
        COPILOT_API_KEY: process.env.COPILOT_API_KEY,
        ZENMUX_API_KEY: process.env.ZENMUX_API_KEY,
        CLOUDFLARE_AI_GATEWAY_API_KEY: process.env.CLOUDFLARE_AI_GATEWAY_API_KEY,
        CLOUDFLARE_AI_GATEWAY_BASE_URL: process.env.CLOUDFLARE_AI_GATEWAY_BASE_URL,
        CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
        CLOUDFLARE_AI_GATEWAY_ID: process.env.CLOUDFLARE_AI_GATEWAY_ID,
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
        GOOGLE_AI_STUDIO_KEY: process.env.GOOGLE_AI_STUDIO_KEY,
        GEMINI_API_KEY: process.env.GEMINI_API_KEY,
        XAI_API_KEY: process.env.XAI_API_KEY,
      }
      process.env.POE_API_KEY = 'test-poe-key'
      delete process.env.OPENROUTER_API_KEY
      delete process.env.GH_TOKEN
      delete process.env.COPILOT_API_KEY
      delete process.env.ZENMUX_API_KEY
      delete process.env.CLOUDFLARE_AI_GATEWAY_API_KEY
      delete process.env.CLOUDFLARE_AI_GATEWAY_BASE_URL
      delete process.env.CLOUDFLARE_ACCOUNT_ID
      delete process.env.CLOUDFLARE_AI_GATEWAY_ID
      delete process.env.ANTHROPIC_API_KEY
      delete process.env.OPENAI_API_KEY
      delete process.env.GOOGLE_API_KEY
      delete process.env.GOOGLE_AI_STUDIO_KEY
      delete process.env.GEMINI_API_KEY
      delete process.env.XAI_API_KEY
      try {
        const config = resolveConfig({ cwd: tempDir })
        config.providers = { poe: { ...config.providers.poe } }
        const aggId = findAggregator(config)

        const models = ['claude-opus-4.6', 'gpt-5.4', 'gemini-3.1-pro']
        for (const model of models) {
          const ep = resolveModelEndpoint(model, config, aggId)
          expect(ep).not.toBeNull()
          expect(ep!.provider).toBe('poe')
          expect(ep!.model).toBe(model)
        }
      } finally {
        for (const [k, v] of Object.entries(saved)) {
          if (v) process.env[k] = v
          else delete process.env[k]
        }
      }
    })

    it('29.5 ignores GH_TOKEN as a Copilot provider source', () => {
      const saved = {
        POE_API_KEY: process.env.POE_API_KEY,
        OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
        GH_TOKEN: process.env.GH_TOKEN,
        ZENMUX_API_KEY: process.env.ZENMUX_API_KEY,
        CLOUDFLARE_AI_GATEWAY_API_KEY: process.env.CLOUDFLARE_AI_GATEWAY_API_KEY,
        CLOUDFLARE_AI_GATEWAY_BASE_URL: process.env.CLOUDFLARE_AI_GATEWAY_BASE_URL,
        CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
        CLOUDFLARE_AI_GATEWAY_ID: process.env.CLOUDFLARE_AI_GATEWAY_ID,
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
        GOOGLE_AI_STUDIO_KEY: process.env.GOOGLE_AI_STUDIO_KEY,
        GEMINI_API_KEY: process.env.GEMINI_API_KEY,
        XAI_API_KEY: process.env.XAI_API_KEY,
      }
      delete process.env.POE_API_KEY
      delete process.env.OPENROUTER_API_KEY
      process.env.GH_TOKEN = 'test-github-token'
      delete process.env.ZENMUX_API_KEY
      delete process.env.CLOUDFLARE_AI_GATEWAY_API_KEY
      delete process.env.CLOUDFLARE_AI_GATEWAY_BASE_URL
      delete process.env.CLOUDFLARE_ACCOUNT_ID
      delete process.env.CLOUDFLARE_AI_GATEWAY_ID
      delete process.env.ANTHROPIC_API_KEY
      delete process.env.OPENAI_API_KEY
      delete process.env.GOOGLE_API_KEY
      delete process.env.GOOGLE_AI_STUDIO_KEY
      delete process.env.GEMINI_API_KEY
      delete process.env.XAI_API_KEY
      try {
        const config = resolveConfig({ cwd: tempDir })
        config.providers = {}

        expect(findAggregator(config)).toBeUndefined()
        expect(listProviders(config).map((provider) => provider.id)).not.toContain('copilot')
      } finally {
        for (const [k, v] of Object.entries(saved)) {
          if (v) process.env[k] = v
          else delete process.env[k]
        }
      }
    })

    it('29.6 defaults Poe to Claude Opus 4.6', () => {
      const saved = {
        POE_API_KEY: process.env.POE_API_KEY,
        CLOUDFLARE_AI_GATEWAY_API_KEY: process.env.CLOUDFLARE_AI_GATEWAY_API_KEY,
        CLOUDFLARE_AI_GATEWAY_BASE_URL: process.env.CLOUDFLARE_AI_GATEWAY_BASE_URL,
      }
      process.env.POE_API_KEY = 'test-poe-key'
      delete process.env.CLOUDFLARE_AI_GATEWAY_API_KEY
      delete process.env.CLOUDFLARE_AI_GATEWAY_BASE_URL
      try {
        const config = resolveConfig({ cwd: tempDir })
        config.providers = {}

        expect(findAggregator(config)).toBe('poe')
        expect(listProviders(config).find((provider) => provider.id === 'poe')?.model).toBe('claude-opus-4.6')
      } finally {
        for (const [k, v] of Object.entries(saved)) {
          if (v) process.env[k] = v
          else delete process.env[k]
        }
      }
    })
  })
})
