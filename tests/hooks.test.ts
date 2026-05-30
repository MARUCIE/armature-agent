/**
 * Round 5: Hook System & Safety — 15 tests
 * SOTA Dimension D5: Permission blocking, hook lifecycle, env vars
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { HookManager, type HookEvent } from '../src/hooks.js'
import { DANGEROUS_TOOLS } from '../src/tools.js'
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const testDir = join(tmpdir(), `armature-hooks-${Date.now()}`)
const previousHome = process.env.HOME

beforeAll(() => {
  process.env.HOME = testDir
  mkdirSync(join(testDir, '.armature'), { recursive: true })
  mkdirSync(join(testDir, '.claude'), { recursive: true })
})

beforeEach(() => {
  try { rmSync(join(testDir, '.armature', 'hooks.json'), { force: true }) } catch { /* ignore */ }
  try { rmSync(join(testDir, '.claude', 'settings.json'), { force: true }) } catch { /* ignore */ }
  try { rmSync(join(testDir, '.claude', 'hooks.json'), { force: true }) } catch { /* ignore */ }
  try { rmSync(join(testDir, '.codex', 'hooks.json'), { force: true }) } catch { /* ignore */ }
  mkdirSync(join(testDir, '.armature'), { recursive: true })
  mkdirSync(join(testDir, '.claude'), { recursive: true })
  mkdirSync(join(testDir, '.codex'), { recursive: true })
})

afterAll(() => {
  if (previousHome === undefined) delete process.env.HOME
  else process.env.HOME = previousHome
  try { rmSync(testDir, { recursive: true, force: true }) } catch { /* ignore */ }
})

async function waitForFile(path: string, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (existsSync(path)) return
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error(`timed out waiting for file: ${path}`)
}

function trustedProjectHooks(): HookManager {
  return new HookManager({ trustProjectHooks: true })
}

// ── Config Loading ──────────────────────────────────────────────

describe('Hook config loading', () => {
  it('5.1 loads hooks from .armature/hooks.json', () => {
    const dir = join(testDir, 'armature-hooks')
    mkdirSync(join(dir, '.armature'), { recursive: true })
    writeFileSync(join(dir, '.armature', 'hooks.json'), JSON.stringify({
      PreToolUse: [{ command: 'echo ok', matcher: 'run_command' }],
    }))

    const manager = trustedProjectHooks()
    manager.load(dir)
    expect(manager.hasHooks('PreToolUse')).toBe(true)
    expect(manager.totalHooks).toBe(1)
  })

  it('5.1b does not load repo-local hooks without explicit project trust', () => {
    const dir = join(testDir, 'untrusted-armature-hooks')
    mkdirSync(join(dir, '.armature'), { recursive: true })
    writeFileSync(join(dir, '.armature', 'hooks.json'), JSON.stringify({
      SessionStart: [{ command: 'echo untrusted-startup' }],
    }))

    const manager = new HookManager()
    manager.load(dir)
    expect(manager.hasHooks('SessionStart')).toBe(false)
    expect(manager.totalHooks).toBe(0)
  })

  it('5.2 loads hooks from .armature.json (nested hooks key)', () => {
    const dir = join(testDir, 'armature-json')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, '.armature.json'), JSON.stringify({
      hooks: {
        SessionStart: [{ command: 'echo startup' }],
        SessionEnd: [{ command: 'echo shutdown' }],
      },
    }))

    const manager = trustedProjectHooks()
    manager.load(dir)
    expect(manager.hasHooks('SessionStart')).toBe(true)
    expect(manager.hasHooks('SessionEnd')).toBe(true)
    expect(manager.totalHooks).toBe(2)
  })

  it('5.3 loads hooks from .claude/hooks.json', () => {
    const dir = join(testDir, 'claude-hooks')
    mkdirSync(join(dir, '.claude'), { recursive: true })
    writeFileSync(join(dir, '.claude', 'hooks.json'), JSON.stringify({
      PostToolUse: [{ command: 'echo logged' }],
    }))

    const manager = trustedProjectHooks()
    manager.load(dir)
    expect(manager.hasHooks('PostToolUse')).toBe(true)
    expect(manager.totalHooks).toBe(1)
  })

  it('5.3b loads hooks from HOME/.armature/hooks.json', () => {
    const dir = join(testDir, 'global-armature-hooks')
    mkdirSync(dir, { recursive: true })
    mkdirSync(join(testDir, '.armature'), { recursive: true })
    writeFileSync(join(testDir, '.armature', 'hooks.json'), JSON.stringify({
      UserPromptSubmit: [{ command: 'echo global-armature' }],
    }))

    const manager = trustedProjectHooks()
    manager.load(dir)
    expect(manager.hasHooks('UserPromptSubmit')).toBe(true)
    expect(manager.totalHooks).toBe(1)
  })

  it('5.3c loads trusted project hooks per cwd without leaking hooks across projects', async () => {
    const projectA = join(testDir, 'trusted-project-a')
    const projectB = join(testDir, 'trusted-project-b')
    mkdirSync(join(projectA, '.armature'), { recursive: true })
    mkdirSync(join(projectB, '.armature'), { recursive: true })
    writeFileSync(join(projectA, '.armature', 'hooks.json'), JSON.stringify({
      SessionStart: [{ command: 'echo project-a' }],
    }))
    writeFileSync(join(projectB, '.armature', 'hooks.json'), JSON.stringify({
      SessionStart: [{ command: 'echo project-b' }],
    }))

    const manager = trustedProjectHooks()
    manager.load(projectA)
    const first = await manager.run('SessionStart', { event: 'SessionStart', cwd: projectA })
    manager.load(projectB)
    const second = await manager.run('SessionStart', { event: 'SessionStart', cwd: projectB })
    const firstAgain = await manager.run('SessionStart', { event: 'SessionStart', cwd: projectA })

    expect(first.additionalContext?.trim()).toBe('project-a')
    expect(second.additionalContext?.trim()).toBe('project-b')
    expect(firstAgain.additionalContext?.trim()).toBe('project-a')
  })
})

// ── Hook Execution ──────────────────────────────────────────────

describe('Hook execution', () => {
  it('5.4 PreToolUse receives tool name and input as JSON stdin', async () => {
    const dir = join(testDir, 'pre-tool-input')
    mkdirSync(join(dir, '.armature'), { recursive: true })
    // Hook script reads stdin JSON and echoes the tool name from it
    writeFileSync(join(dir, '.armature', 'hooks.json'), JSON.stringify({
      PreToolUse: [{
        command: 'cat | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps({\'continue\':True,\'additionalContext\':d.get(\'toolName\',\'\')}))"',
        matcher: '.*',
      }],
    }))

    const manager = trustedProjectHooks()
    manager.load(dir)
    const result = await manager.run('PreToolUse', {
      event: 'PreToolUse',
      toolName: 'read_file',
      toolInput: { path: 'test.ts' },
      cwd: dir,
    })
    expect(result.continue).toBe(true)
    expect(result.additionalContext).toContain('read_file')
  })

  it('5.5 PreToolUse non-zero exit blocks tool execution', async () => {
    const dir = join(testDir, 'pre-tool-block')
    mkdirSync(join(dir, '.armature'), { recursive: true })
    writeFileSync(join(dir, '.armature', 'hooks.json'), JSON.stringify({
      PreToolUse: [{
        command: 'echo "BLOCKED: dangerous operation" >&2 && exit 1',
        matcher: 'run_command',
      }],
    }))

    const manager = trustedProjectHooks()
    manager.load(dir)
    const result = await manager.run('PreToolUse', {
      event: 'PreToolUse',
      toolName: 'run_command',
      toolInput: { command: 'rm -rf /' },
      cwd: dir,
    })
    expect(result.continue).toBe(false)
    expect(result.decision).toBe('block')
    expect(result.stopReason).toContain('BLOCKED')
  })

  it('5.6 PostToolUse receives tool result', async () => {
    const dir = join(testDir, 'post-tool')
    mkdirSync(join(dir, '.armature'), { recursive: true })
    writeFileSync(join(dir, '.armature', 'hooks.json'), JSON.stringify({
      PostToolUse: [{
        command: 'cat | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps({\'continue\':True,\'additionalContext\':\'success=\'+str(d.get(\'toolSuccess\',\'\'))}))"',
        matcher: '.*',
      }],
    }))

    const manager = trustedProjectHooks()
    manager.load(dir)
    const result = await manager.run('PostToolUse', {
      event: 'PostToolUse',
      toolName: 'read_file',
      toolOutput: 'file content here',
      toolSuccess: true,
      cwd: dir,
    })
    expect(result.continue).toBe(true)
    expect(result.additionalContext).toContain('success=True')
  })

  it('5.7 SessionStart hook fires and returns context', async () => {
    const dir = join(testDir, 'session-start')
    mkdirSync(join(dir, '.armature'), { recursive: true })
    writeFileSync(join(dir, '.armature', 'hooks.json'), JSON.stringify({
      SessionStart: [{ command: 'echo "Session initialized"' }],
    }))

    const manager = trustedProjectHooks()
    manager.load(dir)
    const result = await manager.run('SessionStart', {
      event: 'SessionStart',
      cwd: dir,
    })
    expect(result.continue).toBe(true)
    expect(result.additionalContext).toContain('Session initialized')
  })

  it('5.8 SessionEnd hook fires on clean exit', async () => {
    const dir = join(testDir, 'session-end')
    mkdirSync(join(dir, '.armature'), { recursive: true })
    writeFileSync(join(dir, '.armature', 'hooks.json'), JSON.stringify({
      SessionEnd: [{ command: 'echo "Goodbye"' }],
    }))

    const manager = trustedProjectHooks()
    manager.load(dir)
    const result = await manager.run('SessionEnd', {
      event: 'SessionEnd',
      cwd: dir,
    })
    expect(result.continue).toBe(true)
    expect(result.additionalContext).toContain('Goodbye')
  })

  it('5.9 sync hooks execute inside the provided cwd', async () => {
    const dir = join(testDir, 'hook-cwd-sync')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, '.armature.json'), JSON.stringify({
      hooks: {
        SessionStart: [{ command: 'pwd' }],
      },
    }))

    const manager = trustedProjectHooks()
    manager.load(dir)
    const result = await manager.run('SessionStart', {
      event: 'SessionStart',
      cwd: dir,
    })

    expect(result.continue).toBe(true)
    expect(realpathSync(result.additionalContext!.trim())).toBe(realpathSync(dir))
  })

  it('5.10 async hooks stay non-blocking, execute inside cwd, and still perform side effects', async () => {
    const dir = join(testDir, 'async-hook')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, '.armature.json'), JSON.stringify({
      hooks: {
        SessionStart: [{
          command: 'sleep 0.2; printf "$PWD" > async-hook.txt',
          async: true,
        }],
      },
    }))

    const manager = trustedProjectHooks()
    manager.load(dir)

    const result = await manager.run('SessionStart', {
      event: 'SessionStart',
      cwd: dir,
    })

    expect(result).toEqual({ continue: true })
    const outputPath = join(dir, 'async-hook.txt')
    expect(existsSync(outputPath)).toBe(false)

    await waitForFile(outputPath)
    expect(realpathSync(readFileSync(outputPath, 'utf-8').trim())).toBe(realpathSync(dir))
  })

  it('5.11 project Claude hooks execute relative commands from .claude while preserving ARMATURE_CWD', async () => {
    const projectDir = join(testDir, 'project-claude-hook')
    const claudeDir = join(projectDir, '.claude')
    mkdirSync(join(claudeDir, 'hooks'), { recursive: true })
    writeFileSync(join(claudeDir, 'hooks', 'echo-cwd.sh'), '#!/bin/sh\npwd\nprintf "\\n%s" "$ARMATURE_CWD"\n')
    writeFileSync(join(claudeDir, 'settings.json'), JSON.stringify({
      hooks: {
        SessionStart: [{
          matcher: '',
          hooks: [{
            type: 'command',
            command: 'sh hooks/echo-cwd.sh',
          }],
        }],
      },
    }))

    const manager = trustedProjectHooks()
    manager.load(projectDir)
    const result = await manager.run('SessionStart', {
      event: 'SessionStart',
      cwd: projectDir,
    })

    expect(result.continue).toBe(true)
    const [executionDir, targetDir] = (result.additionalContext || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    expect(realpathSync(executionDir!)).toBe(realpathSync(claudeDir))
    expect(realpathSync(targetDir!)).toBe(realpathSync(projectDir))
  })

  it('5.12 project Armature hooks execute relative commands from .armature while preserving ARMATURE_CWD', async () => {
    const projectDir = join(testDir, 'project-armature-hook')
    const armatureDir = join(projectDir, '.armature')
    mkdirSync(join(armatureDir, 'hooks'), { recursive: true })
    writeFileSync(join(armatureDir, 'hooks', 'echo-cwd.sh'), '#!/bin/sh\npwd\nprintf "\\n%s" "$ARMATURE_CWD"\n')
    writeFileSync(join(armatureDir, 'hooks.json'), JSON.stringify({
      SessionStart: [{ command: 'sh hooks/echo-cwd.sh' }],
    }))

    const manager = trustedProjectHooks()
    manager.load(projectDir)
    const result = await manager.run('SessionStart', {
      event: 'SessionStart',
      cwd: projectDir,
    })

    expect(result.continue).toBe(true)
    const [executionDir, targetDir] = (result.additionalContext || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    expect(realpathSync(executionDir!)).toBe(realpathSync(armatureDir))
    expect(realpathSync(targetDir!)).toBe(realpathSync(projectDir))
  })

  it('5.13 global Claude hooks execute relative commands from HOME while preserving ARMATURE_CWD', async () => {
    const projectDir = join(testDir, 'global-hook-project')
    const homeDir = join(testDir, 'global-hook-home')
    const claudeDir = join(homeDir, '.claude')
    const originalHome = process.env.HOME
    mkdirSync(projectDir, { recursive: true })
    mkdirSync(join(claudeDir, 'hooks'), { recursive: true })
    writeFileSync(join(claudeDir, 'hooks', 'echo-cwd.sh'), '#!/bin/sh\npwd\nprintf "\\n%s" "$ARMATURE_CWD"\n')
    writeFileSync(join(claudeDir, 'settings.json'), JSON.stringify({
      hooks: {
        SessionStart: [{
          matcher: '',
          hooks: [{
            type: 'command',
            command: 'sh hooks/echo-cwd.sh',
          }],
        }],
      },
    }))

    try {
      process.env.HOME = homeDir
      const manager = new HookManager()
      manager.load(projectDir)
      const result = await manager.run('SessionStart', {
        event: 'SessionStart',
        cwd: projectDir,
      })

      expect(result.continue).toBe(true)
      const [executionDir, targetDir] = (result.additionalContext || '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
      expect(realpathSync(executionDir!)).toBe(realpathSync(claudeDir))
      expect(realpathSync(targetDir!)).toBe(realpathSync(projectDir))
    } finally {
      if (originalHome === undefined) delete process.env.HOME
      else process.env.HOME = originalHome
    }
  })

  it('5.14 project Claude hook maps execute relative commands from .claude while preserving ARMATURE_CWD', async () => {
    const projectDir = join(testDir, 'project-claude-map-hook')
    const claudeDir = join(projectDir, '.claude')
    mkdirSync(join(claudeDir, 'hooks'), { recursive: true })
    writeFileSync(join(claudeDir, 'hooks', 'echo-cwd.sh'), '#!/bin/sh\npwd\nprintf "\\n%s" "$ARMATURE_CWD"\n')
    writeFileSync(join(claudeDir, 'hooks.json'), JSON.stringify({
      SessionStart: [{ command: 'sh hooks/echo-cwd.sh' }],
    }))

    const manager = trustedProjectHooks()
    manager.load(projectDir)
    const result = await manager.run('SessionStart', {
      event: 'SessionStart',
      cwd: projectDir,
    })

    expect(result.continue).toBe(true)
    const [executionDir, targetDir] = (result.additionalContext || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    expect(realpathSync(executionDir!)).toBe(realpathSync(claudeDir))
    expect(realpathSync(targetDir!)).toBe(realpathSync(projectDir))
  })

  it('5.15 global Codex hooks execute relative commands from .codex while preserving ARMATURE_CWD', async () => {
    const projectDir = join(testDir, 'global-codex-project')
    const homeDir = join(testDir, 'global-codex-home')
    const codexDir = join(homeDir, '.codex')
    const originalHome = process.env.HOME
    mkdirSync(projectDir, { recursive: true })
    mkdirSync(join(codexDir, 'hooks'), { recursive: true })
    writeFileSync(join(codexDir, 'hooks', 'echo-cwd.sh'), '#!/bin/sh\npwd\nprintf "\\n%s" "$ARMATURE_CWD"\n')
    writeFileSync(join(codexDir, 'hooks.json'), JSON.stringify({
      SessionStart: [{ command: 'sh hooks/echo-cwd.sh' }],
    }))

    try {
      process.env.HOME = homeDir
      const manager = new HookManager()
      manager.load(projectDir)
      const result = await manager.run('SessionStart', {
        event: 'SessionStart',
        cwd: projectDir,
      })

      expect(result.continue).toBe(true)
      const [executionDir, targetDir] = (result.additionalContext || '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
      expect(realpathSync(executionDir!)).toBe(realpathSync(codexDir))
      expect(realpathSync(targetDir!)).toBe(realpathSync(projectDir))
    } finally {
      if (originalHome === undefined) delete process.env.HOME
      else process.env.HOME = originalHome
    }
  })
})

// ── Hook Matching & Env Vars ────────────────────────────────────

describe('Hook matching and env vars', () => {
  it('5.16 Matcher regex filters tool-specific hooks', async () => {
    const dir = join(testDir, 'matcher')
    mkdirSync(join(dir, '.armature'), { recursive: true })
    writeFileSync(join(dir, '.armature', 'hooks.json'), JSON.stringify({
      PreToolUse: [{
        command: 'echo "should not fire" && exit 1',
        matcher: 'delete_file',  // only matches delete_file
      }],
    }))

    const manager = trustedProjectHooks()
    manager.load(dir)
    // Call with read_file — should NOT match delete_file matcher
    const result = await manager.run('PreToolUse', {
      event: 'PreToolUse',
      toolName: 'read_file',
      cwd: dir,
    })
    expect(result.continue).toBe(true)
    // decision should not be 'block' since hook didn't match
    expect(result.decision).not.toBe('block')
  })

  it('5.17 Env vars ARMATURE_HOOK_EVENT and ARMATURE_HOOK_TOOL are set', async () => {
    const dir = join(testDir, 'env-vars')
    mkdirSync(join(dir, '.armature'), { recursive: true })
    writeFileSync(join(dir, '.armature', 'hooks.json'), JSON.stringify({
      PreToolUse: [{
        command: 'echo "$ARMATURE_HOOK_EVENT:$ARMATURE_HOOK_TOOL"',
        matcher: '.*',
      }],
    }))

    const manager = trustedProjectHooks()
    manager.load(dir)
    const result = await manager.run('PreToolUse', {
      event: 'PreToolUse',
      toolName: 'edit_file',
      cwd: dir,
    })
    expect(result.additionalContext).toContain('PreToolUse:edit_file')
  })

  it('5.17c Stop hooks receive the assistant response via env vars', async () => {
    const dir = join(testDir, 'stop-response-env')
    mkdirSync(join(dir, '.armature'), { recursive: true })
    writeFileSync(join(dir, '.armature', 'hooks.json'), JSON.stringify({
      Stop: [{
        command: 'python3 -c "import os; print(os.environ.get(\'ARMATURE_RESPONSE\', \'\'))"',
      }],
    }))

    const manager = trustedProjectHooks()
    manager.load(dir)
    const result = await manager.run('Stop', {
      event: 'Stop',
      prompt: 'do the work',
      response: 'claimed completion',
      cwd: dir,
    })
    expect(result.additionalContext).toContain('claimed completion')
  })

  it('5.17b Hook env does not inherit provider API keys by default', async () => {
    const dir = join(testDir, 'env-key-redaction')
    const previousOpenAiKey = process.env.OPENAI_API_KEY
    mkdirSync(join(dir, '.armature'), { recursive: true })
    writeFileSync(join(dir, '.armature', 'hooks.json'), JSON.stringify({
      SessionStart: [{
        command: 'node -e "console.log(process.env.OPENAI_API_KEY || \\"missing\\")"',
      }],
    }))

    try {
      process.env.OPENAI_API_KEY = 'sk-test-secret'
      const manager = trustedProjectHooks()
      manager.load(dir)
      const result = await manager.run('SessionStart', {
        event: 'SessionStart',
        cwd: dir,
      })
      expect(result.additionalContext).toContain('missing')
      expect(result.additionalContext).not.toContain('sk-test-secret')
    } finally {
      if (previousOpenAiKey === undefined) delete process.env.OPENAI_API_KEY
      else process.env.OPENAI_API_KEY = previousOpenAiKey
    }
  })

  it('5.18 No hooks configured returns continue: true', async () => {
    const dir = join(testDir, 'no-hooks')
    mkdirSync(dir, { recursive: true })

    const manager = trustedProjectHooks()
    manager.load(dir)
    const result = await manager.run('PreToolUse', {
      event: 'PreToolUse',
      toolName: 'read_file',
    })
    expect(result.continue).toBe(true)
    expect(manager.totalHooks).toBe(0)
  })

  it('5.19 Hook returning JSON result is parsed correctly', async () => {
    const dir = join(testDir, 'json-result')
    mkdirSync(join(dir, '.armature'), { recursive: true })
    writeFileSync(join(dir, '.armature', 'hooks.json'), JSON.stringify({
      UserPromptSubmit: [{
        command: 'echo \'{"continue": true, "systemMessage": "context injected"}\'',
      }],
    }))

    const manager = trustedProjectHooks()
    manager.load(dir)
    const result = await manager.run('UserPromptSubmit', {
      event: 'UserPromptSubmit',
      prompt: 'hello',
      cwd: dir,
    })
    expect(result.continue).toBe(true)
    expect(result.systemMessage).toBe('context injected')
  })

  it('5.23 getStatusSummary returns a renderer-agnostic hook summary', () => {
    const dir = join(testDir, 'print-status')
    mkdirSync(join(dir, '.armature'), { recursive: true })
    writeFileSync(join(dir, '.armature', 'hooks.json'), JSON.stringify({
      SessionStart: [{ command: 'echo startup' }],
      SessionEnd: [{ command: 'echo shutdown' }],
    }))

    const manager = trustedProjectHooks()
    manager.load(dir)
    expect(manager.getStatusSummary()).toEqual({
      totalHooks: 2,
      eventCount: 2,
    })
  })
})

// ── Safety & Permission ─────────────────────────────────────────

describe('Safety system', () => {
  it('5.20 DANGEROUS_TOOLS has exactly 12 members', () => {
    expect(DANGEROUS_TOOLS.size).toBe(12)
  })

  it('5.21 DANGEROUS_TOOLS contains expected dangerous operations', () => {
    const expected = ['write_file', 'edit_file', 'delete_file', 'move_file',
      'run_command', 'run_background', 'git_commit', 'multi_edit', 'patch_file',
      'open_file', 'fetch_url', 'web_search']
    for (const tool of expected) {
      expect(DANGEROUS_TOOLS.has(tool)).toBe(true)
    }
  })

  it('5.22 All 11 hook event types are recognized', () => {
    const events: HookEvent[] = [
      'PreToolUse', 'PostToolUse', 'SessionStart', 'SessionEnd',
      'PreCompact', 'PostCompact', 'UserPromptSubmit', 'SubagentStart',
      'Stop', 'SubagentStop', 'MultiModelStart',
    ]
    // Create a config with all 11 events
    const dir = join(testDir, 'all-events')
    mkdirSync(join(dir, '.armature'), { recursive: true })
    const config: Record<string, unknown[]> = {}
    for (const e of events) {
      config[e] = [{ command: 'echo ok' }]
    }
    writeFileSync(join(dir, '.armature', 'hooks.json'), JSON.stringify(config))

    const manager = trustedProjectHooks()
    manager.load(dir)
    for (const e of events) {
      expect(manager.hasHooks(e)).toBe(true)
    }
    expect(manager.totalHooks).toBe(11)
  })
})
