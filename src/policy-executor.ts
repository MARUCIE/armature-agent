import type { IncomingMessage } from 'node:http'
import { hooks } from './hooks.js'
import { getGitRepositoryRoot } from './git-repository.js'
import { DANGEROUS_TOOLS, executeTool, isSandboxEnabled, setSandboxMode, type ToolResult } from './tools.js'

export type PolicyPermissionMode = 'yolo' | 'auto' | 'plan'
export type PermissionScope = 'once' | 'session' | 'project'
export type ToolArgs = Record<string, unknown>
export type ToolApprovalDecision = 'allowed' | 'denied' | 'preapproved' | 'blocked'
export type ToolApprovalSource = 'prompt' | 'allowlist' | 'policy' | 'hook'

export interface ToolApprovalEventInput {
  toolName: string
  ruleKey: string
  preview: string
  permissionMode?: PolicyPermissionMode
  decision: ToolApprovalDecision
  scope?: PermissionScope
  source: ToolApprovalSource
}

export interface PermissionDecision {
  allowed: boolean
  scope: PermissionScope
}

export interface AuthorizeToolCallOptions {
  name: string
  args: ToolArgs
  cwd: string
  permissionMode?: PolicyPermissionMode
  allowedTools?: string[]
  isPermissionGranted?: (ruleKey: string) => boolean
  requestPermissionDecision?: (name: string, args: ToolArgs, cwd: string) => Promise<PermissionDecision>
  recordApprovalEvent?: (event: ToolApprovalEventInput) => void
}

export interface AuthorizeToolCallResult {
  authorized: boolean
  args: ToolArgs
  ruleKey: string
  result?: ToolResult
  grantScope?: 'session' | 'project'
}

export interface ExecuteToolWithPolicyOptions {
  name: string
  args: ToolArgs
  cwd: string
  permissionMode?: PolicyPermissionMode
  injectedPaths?: Set<string>
}

export function getBearerToken(req: IncomingMessage): string | undefined {
  const header = req.headers.authorization
  if (typeof header !== 'string') return undefined
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || undefined
}

export function isAuthorizedRequest(req: IncomingMessage, authToken: string | undefined): boolean {
  if (!authToken) return true
  return getBearerToken(req) === authToken
}

export function resolveServeAuthToken(
  isLoopbackHost: (host: string) => boolean,
  host: string,
  envToken = process.env.ORCA_SERVE_TOKEN,
): string | undefined {
  if (isLoopbackHost(host)) return undefined
  if (envToken && envToken.trim()) return envToken.trim()
  throw new Error('Remote serve requires ORCA_SERVE_TOKEN')
}

export function buildPermissionPreview(name: string, args: ToolArgs): string {
  if (name === 'write_file') {
    return `write ${String(args.content || '').length} bytes to ${String(args.path || '')}`
  }
  if (name === 'edit_file' || name === 'multi_edit') {
    return `edit ${String(args.path || '')}`
  }
  if (name === 'delete_file') {
    return `delete ${String(args.path || '')}`
  }
  if (name === 'move_file') {
    return `move ${String(args.source || '')} → ${String(args.destination || '')}`
  }
  if (name === 'git_commit') {
    return `commit: ${String(args.message || '').slice(0, 60)}`
  }
  if (name === 'run_command' || name === 'run_background') {
    return `run: ${String(args.command || '').slice(0, 80)}`
  }
  return `${name}: ${JSON.stringify(args).slice(0, 80)}`
}

export function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(',')}]`
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => `${JSON.stringify(key)}:${stableSerialize(nested)}`)
  return `{${entries.join(',')}}`
}

export function buildPermissionRuleDescriptor(name: string, args: ToolArgs, cwd = process.cwd()): string {
  switch (name) {
    case 'read_file':
    case 'write_file':
    case 'edit_file':
    case 'multi_edit':
    case 'delete_file':
      return `path=${String(args.path || '')}`
    case 'move_file':
      return `source=${String(args.source || '')}|destination=${String(args.destination || '')}`
    case 'run_command':
    case 'run_background':
      return `command=${String(args.command || '')}`
    case 'git_commit':
      return `repo=${getGitRepositoryRoot(cwd) || 'current'}`
    default:
      return stableSerialize(args)
  }
}

export function buildPermissionRuleKey(name: string, args: ToolArgs, cwd = process.cwd()): string {
  return `${name}|${buildPermissionRuleDescriptor(name, args, cwd)}`
}

export async function runPreToolHook(
  name: string,
  args: ToolArgs,
  cwd: string,
  writeSystemMessage: (message: string) => void = (message) => {
    process.stderr.write(message)
  },
): Promise<ToolResult | undefined> {
  hooks.load(cwd)
  if (!hooks.hasHooks('PreToolUse')) return undefined
  const hookResult = await hooks.run('PreToolUse', {
    event: 'PreToolUse',
    toolName: name,
    toolInput: args,
    cwd,
  })
  if (!hookResult.continue) {
    return {
      success: false,
      output: `Blocked by hook: ${hookResult.stopReason || 'PreToolUse hook denied'}`,
    }
  }
  if (hookResult.updatedInput) {
    Object.assign(args, hookResult.updatedInput)
  }
  if (hookResult.systemMessage) {
    writeSystemMessage(`\x1b[33m  hook: ${hookResult.systemMessage}\x1b[0m\n`)
  }
  return undefined
}

export async function runPostToolHook(name: string, args: ToolArgs, result: ToolResult, cwd: string): Promise<void> {
  if (!hooks.hasHooks('PostToolUse')) return
  await hooks.run('PostToolUse', {
    event: 'PostToolUse',
    toolName: name,
    toolInput: args,
    toolOutput: result.output,
    toolSuccess: result.success,
    cwd,
  })
}

export async function authorizeToolCall(options: AuthorizeToolCallOptions): Promise<AuthorizeToolCallResult> {
  const args = { ...options.args }
  const blockedByHook = await runPreToolHook(options.name, args, options.cwd)
  if (blockedByHook) {
    const ruleKey = buildPermissionRuleKey(options.name, args, options.cwd)
    options.recordApprovalEvent?.({
      toolName: options.name,
      ruleKey,
      preview: buildPermissionPreview(options.name, args),
      permissionMode: options.permissionMode,
      decision: 'blocked',
      source: 'hook',
    })
    return { authorized: false, args, ruleKey, result: blockedByHook }
  }

  if (options.allowedTools && !options.allowedTools.includes(options.name)) {
    const ruleKey = buildPermissionRuleKey(options.name, args, options.cwd)
    options.recordApprovalEvent?.({
      toolName: options.name,
      ruleKey,
      preview: buildPermissionPreview(options.name, args),
      permissionMode: options.permissionMode,
      decision: 'blocked',
      source: 'policy',
    })
    return {
      authorized: false,
      args,
      ruleKey,
      result: { success: false, output: `Tool "${options.name}" is not allowed in the current policy.` },
    }
  }

  const permissionMode = options.permissionMode || 'auto'
  const dangerous = DANGEROUS_TOOLS.has(options.name)
  const requiresApproval = permissionMode === 'plan' || (permissionMode === 'auto' && dangerous)
  const ruleKey = buildPermissionRuleKey(options.name, args, options.cwd)
  const alreadyGranted = options.isPermissionGranted?.(ruleKey) || false

  if (requiresApproval && alreadyGranted) {
    options.recordApprovalEvent?.({
      toolName: options.name,
      ruleKey,
      preview: buildPermissionPreview(options.name, args),
      permissionMode,
      decision: 'preapproved',
      source: 'allowlist',
    })
  }

  if (requiresApproval && !alreadyGranted) {
    if (!options.requestPermissionDecision) {
      options.recordApprovalEvent?.({
        toolName: options.name,
        ruleKey,
        preview: buildPermissionPreview(options.name, args),
        permissionMode,
        decision: 'blocked',
        source: 'policy',
      })
      return {
        authorized: false,
        args,
        ruleKey,
        result: { success: false, output: `Approval required for tool "${options.name}" in current policy.` },
      }
    }

    const decision = await options.requestPermissionDecision(options.name, args, options.cwd)
    options.recordApprovalEvent?.({
      toolName: options.name,
      ruleKey,
      preview: buildPermissionPreview(options.name, args),
      permissionMode,
      decision: decision.allowed ? 'allowed' : 'denied',
      scope: decision.scope,
      source: 'prompt',
    })
    if (!decision.allowed) {
      return {
        authorized: false,
        args,
        ruleKey,
        result: { success: false, output: 'User denied permission.' },
      }
    }
    if (decision.scope === 'session' || decision.scope === 'project') {
      return { authorized: true, args, ruleKey, grantScope: decision.scope }
    }
  }

  return { authorized: true, args, ruleKey }
}

export function executeToolWithPolicy(options: ExecuteToolWithPolicyOptions): ToolResult {
  const previousSandboxMode = isSandboxEnabled()
  const sandboxEnabled = (options.permissionMode || 'auto') !== 'yolo'

  try {
    setSandboxMode(sandboxEnabled)
    return executeTool(options.name, options.args, options.cwd, options.injectedPaths)
  } finally {
    setSandboxMode(previousSandboxMode)
  }
}
