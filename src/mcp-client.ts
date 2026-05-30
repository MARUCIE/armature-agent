/**
 * MCP (Model Context Protocol) stdio client.
 *
 * Spawns child processes for MCP servers defined in .mcp.json / .armature.json,
 * communicates via JSON-RPC 2.0 over stdin/stdout.
 *
 * Capabilities:
 *   - Server lifecycle (spawn, initialize, shutdown)
 *   - resources/list + resources/read
 *   - tools/list (discover MCP server tools)
 *   - tools/call (invoke MCP server tools)
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface, type Interface as ReadlineInterface } from 'node:readline'

// ── Types ────────────────────────────────────────────────────────

export interface MCPServerConfig {
  command: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
}

export type MCPConfigScope = 'project' | 'home'

export interface MCPConfigProvenance {
  path: string
  scope: MCPConfigScope
}

interface LoadedMCPServerConfig {
  config: MCPServerConfig
  provenance: MCPConfigProvenance
}

interface JSONRPCRequest {
  jsonrpc: '2.0'
  id: number
  method: string
  params?: Record<string, unknown>
}

interface JSONRPCResponse {
  jsonrpc: '2.0'
  id: number
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

export interface MCPResource {
  uri: string
  name: string
  description?: string
  mimeType?: string
}

export interface MCPTool {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
}

export interface MCPServerConfigSpec extends MCPServerConfig {
  name: string
  scope: MCPConfigScope
  configPath: string
}

interface MCPConnection {
  name: string
  process: ChildProcess
  readline: ReadlineInterface
  requestId: number
  pending: Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>
  initialized: boolean
}

export function parseMcpToolName(fullName: string): { serverName: string; toolName: string } | null {
  const prefix = 'mcp__'
  if (!fullName.startsWith(prefix)) return null
  const delimiter = fullName.lastIndexOf('__')
  if (delimiter <= prefix.length) return null
  const serverName = fullName.slice(prefix.length, delimiter)
  const toolName = fullName.slice(delimiter + 2)
  if (!serverName || !toolName) return null
  return { serverName, toolName }
}

function setDiscoveredConfig(
  configs: Map<string, LoadedMCPServerConfig>,
  name: string,
  config: MCPServerConfig,
  provenance: MCPConfigProvenance,
): void {
  configs.set(name, { config, provenance })
}

function discoverLoadedMcpServerConfigs(cwd: string): Map<string, LoadedMCPServerConfig> {
  const home = process.env.HOME || '/tmp'
  const configs = new Map<string, LoadedMCPServerConfig>()

  // Native Armature configs
  const jsonSources: Array<{ path: string; scope: MCPConfigScope }> = [
    { path: join(cwd, '.mcp.json'), scope: 'project' },
    { path: join(cwd, '.armature.json'), scope: 'project' },
    { path: join(cwd, '.armature', 'mcp.json'), scope: 'project' },
    { path: join(home, '.armature', 'mcp.json'), scope: 'home' },
  ]

  for (const { path: configPath, scope } of jsonSources) {
    if (!existsSync(configPath)) continue
    try {
      const raw = JSON.parse(readFileSync(configPath, 'utf-8'))
      const servers = raw.mcpServers || raw.servers || raw
      if (typeof servers === 'object' && !Array.isArray(servers)) {
        for (const [name, config] of Object.entries(servers)) {
          if (typeof config === 'object' && config !== null) {
            setDiscoveredConfig(configs, name, config as MCPServerConfig, {
              path: configPath,
              scope,
            })
          }
        }
      }
    } catch { /* ignore parse errors */ }
  }

  // Claude Code: .claude/settings.json (project + global)
  const claudeSettingsSources: Array<{ path: string; scope: MCPConfigScope }> = [
    { path: join(cwd, '.claude', 'settings.json'), scope: 'project' },
    { path: join(home, '.claude', 'settings.json'), scope: 'home' },
  ]
  for (const { path: settingsPath, scope } of claudeSettingsSources) {
    if (!existsSync(settingsPath)) continue
    try {
      const raw = JSON.parse(readFileSync(settingsPath, 'utf-8'))
      const servers = raw.mcpServers
      if (typeof servers === 'object' && servers !== null && !Array.isArray(servers)) {
        for (const [name, config] of Object.entries(servers)) {
          if (configs.has(name)) continue // don't override native configs
          if (typeof config === 'object' && config !== null) {
            const cc = config as Record<string, unknown>
            // Claude Code uses { command, args, env } — same as MCP standard
            if (cc.command) {
              setDiscoveredConfig(configs, name, {
                command: String(cc.command),
                args: Array.isArray(cc.args) ? cc.args.map(String) : undefined,
                env: cc.env && typeof cc.env === 'object' ? cc.env as Record<string, string> : undefined,
              }, {
                path: settingsPath,
                scope,
              })
            }
          }
        }
      }
    } catch { /* ignore parse errors */ }
  }

  // Codex: .codex/config.toml [mcp_servers.*] sections
  const codexConfigPath = join(home, '.codex', 'config.toml')
  if (existsSync(codexConfigPath)) {
    try {
      const toml = readFileSync(codexConfigPath, 'utf-8')
      // Simple TOML parser for [mcp_servers.name] sections
      const serverRegex = /\[mcp_servers\.([^\]]+)\]\s*\n((?:[^\[]*\n)*)/g
      let match
      while ((match = serverRegex.exec(toml)) !== null) {
        const name = match[1]!
        const body = match[2]!
        if (configs.has(name)) continue

        const command = body.match(/^command\s*=\s*"([^"]+)"/m)?.[1]
        const argsMatch = body.match(/^args\s*=\s*\[([^\]]*)\]/m)
        const enabled = body.match(/^enabled\s*=\s*(true|false)/m)?.[1]

        if (enabled === 'false') continue
        if (!command) continue

        const args = argsMatch
          ? argsMatch[1]!.split(',').map(s => s.trim().replace(/^"|"$/g, '')).filter(Boolean)
          : undefined

        setDiscoveredConfig(configs, name, { command, args }, {
          path: codexConfigPath,
          scope: 'home',
        })
      }
    } catch { /* ignore parse errors */ }
  }

  return configs
}

export function discoverMcpServerConfigs(cwd: string): MCPServerConfigSpec[] {
  return [...discoverLoadedMcpServerConfigs(cwd).entries()].map(([name, loaded]) => ({
    name,
    command: loaded.config.command,
    args: loaded.config.args,
    env: loaded.config.env,
    cwd: loaded.config.cwd,
    scope: loaded.provenance.scope,
    configPath: loaded.provenance.path,
  }))
}

// ── MCP Client ───────────────────────────────────────────────────

export class MCPClient {
  private connections = new Map<string, MCPConnection>()
  private configs = new Map<string, LoadedMCPServerConfig>()
  private disabled = new Set<string>()

  /** Load server configs from project/global config files.
   *  Supports native .armature, Claude Code (.claude/settings.json), and Codex (.codex/config.toml).
   */
  loadConfigs(cwd: string): void {
    for (const [name, loaded] of discoverLoadedMcpServerConfigs(cwd)) {
      this.setConfig(name, loaded.config, loaded.provenance)
    }
  }

  /** Connect to a specific MCP server */
  async connect(name: string): Promise<boolean> {
    const loaded = this.configs.get(name)
    if (!loaded) return false
    if (this.connections.has(name)) return true

    try {
      const config = loaded.config
      const args = config.args || []
      // Expand ${VAR} references in env values (Claude Code config convention)
      const rawEnv = config.env || {}
      const expandedEnv: Record<string, string> = {}
      for (const [k, v] of Object.entries(rawEnv)) {
        expandedEnv[k] = v.replace(/\$\{([^}]+)\}/g, (_, name) => process.env[name] || '')
      }
      const env = { ...process.env, ...expandedEnv }
      const proc = spawn(config.command, args, {
        cwd: config.cwd,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      if (!proc.stdout || !proc.stdin) {
        proc.kill()
        return false
      }

      const rl = createInterface({ input: proc.stdout })
      const conn: MCPConnection = {
        name,
        process: proc,
        readline: rl,
        requestId: 0,
        pending: new Map(),
        initialized: false,
      }

      // Handle incoming JSON-RPC responses
      rl.on('line', (line) => {
        try {
          const msg = JSON.parse(line) as JSONRPCResponse
          if (msg.id !== undefined) {
            const pending = conn.pending.get(msg.id)
            if (pending) {
              conn.pending.delete(msg.id)
              if (msg.error) {
                pending.reject(new Error(msg.error.message))
              } else {
                pending.resolve(msg.result)
              }
            }
          }
        } catch { /* ignore non-JSON lines */ }
      })

      proc.on('exit', () => {
        this.connections.delete(name)
        for (const [, p] of conn.pending) {
          p.reject(new Error('MCP server exited'))
        }
        conn.pending.clear()
      })

      this.connections.set(name, conn)

      // Initialize handshake
      const initResult = await this.request(name, 'initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'armature-cli', version: '0.1.0' },
      })

      if (initResult) {
        conn.initialized = true
        // Send initialized notification
        this.notify(name, 'notifications/initialized', {})
        return true
      }
      return false
    } catch {
      return false
    }
  }

  /** Connect to all configured servers in parallel (skips disabled) */
  async connectAll(options: { startupSafeOnly?: boolean } = {}): Promise<string[]> {
    const names = [...this.configs.keys()].filter((name) => {
      if (this.disabled.has(name)) return false
      if (!options.startupSafeOnly) return true
      return this.getConfigProvenance(name)?.scope === 'home'
    })
    const results = await Promise.allSettled(
      names.map(async (name) => {
        const ok = await this.connect(name)
        return ok ? name : null
      }),
    )
    return results
      .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled' && r.value !== null)
      .map(r => r.value)
  }

  /** Connect only startup-safe configs (home/global scopes, never repo-local). */
  async connectStartupSafe(): Promise<string[]> {
    return this.connectAll({ startupSafeOnly: true })
  }

  /** Disable a server (disconnect if connected) */
  disableServer(name: string): boolean {
    if (!this.configs.has(name)) return false
    this.disabled.add(name)
    this.disconnect(name)
    return true
  }

  /** Enable a previously disabled server */
  enableServer(name: string): boolean {
    if (!this.configs.has(name)) return false
    this.disabled.delete(name)
    return true
  }

  /** Check if a server is disabled */
  isDisabled(name: string): boolean {
    return this.disabled.has(name)
  }

  /** Disconnect from a server */
  disconnect(name: string): void {
    const conn = this.connections.get(name)
    if (!conn) return
    try {
      conn.process.kill()
    } catch { /* ignore */ }
    this.connections.delete(name)
  }

  /** Disconnect from all servers */
  disconnectAll(): void {
    for (const name of [...this.connections.keys()]) {
      this.disconnect(name)
    }
  }

  /** List connected servers */
  listServers(): Array<{ name: string; initialized: boolean; pid: number; disabled: boolean; scope?: MCPConfigScope; configPath?: string }> {
    const result: Array<{ name: string; initialized: boolean; pid: number; disabled: boolean; scope?: MCPConfigScope; configPath?: string }> = []
    for (const [name, conn] of this.connections) {
      const provenance = this.getConfigProvenance(name)
      result.push({
        name,
        initialized: conn.initialized,
        pid: conn.process.pid || 0,
        disabled: false,
        scope: provenance?.scope,
        configPath: provenance?.path,
      })
    }
    // Also list configured but not connected
    for (const [name, loaded] of this.configs.entries()) {
      if (!this.connections.has(name)) {
        result.push({
          name,
          initialized: false,
          pid: 0,
          disabled: this.disabled.has(name),
          scope: loaded.provenance.scope,
          configPath: loaded.provenance.path,
        })
      }
    }
    return result
  }

  /** List resources from all connected servers */
  async listResources(serverName?: string): Promise<MCPResource[]> {
    const resources: MCPResource[] = []
    const targets = serverName
      ? [serverName]
      : [...this.connections.keys()]

    for (const name of targets) {
      if (!this.connections.has(name)) continue
      try {
        const result = await this.request(name, 'resources/list', {}) as { resources?: MCPResource[] }
        if (result?.resources) {
          for (const r of result.resources) {
            resources.push({ ...r, name: `${name}/${r.name}` })
          }
        }
      } catch { /* server may not support resources */ }
    }
    return resources
  }

  /** Read a specific resource by URI */
  async readResource(uri: string): Promise<string> {
    // Try all connected servers
    for (const name of this.connections.keys()) {
      try {
        const result = await this.request(name, 'resources/read', { uri }) as {
          contents?: Array<{ uri: string; text?: string; blob?: string }>
        }
        if (result?.contents && result.contents.length > 0) {
          return result.contents[0]!.text || result.contents[0]!.blob || ''
        }
      } catch { continue }
    }
    throw new Error(`Resource not found: ${uri}`)
  }

  /** List tools from all connected servers */
  async listTools(serverName?: string): Promise<Array<MCPTool & { server: string }>> {
    const tools: Array<MCPTool & { server: string }> = []
    const targets = serverName
      ? [serverName]
      : [...this.connections.keys()]

    for (const name of targets) {
      if (!this.connections.has(name)) continue
      try {
        const result = await this.request(name, 'tools/list', {}) as { tools?: MCPTool[] }
        if (result?.tools) {
          for (const t of result.tools) {
            tools.push({ ...t, server: name })
          }
        }
      } catch { /* server may not support tools */ }
    }
    return tools
  }

  /** Call a tool on a specific server */
  async callTool(serverName: string, toolName: string, args: Record<string, unknown>): Promise<unknown> {
    return this.request(serverName, 'tools/call', { name: toolName, arguments: args })
  }

  /**
   * Get all MCP server tools as OpenAI function calling definitions.
   * Tool names are prefixed with "mcp__<server>__" for routing.
   */
  async getToolDefinitions(): Promise<Array<{ type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }>> {
    const defs: Array<{ type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }> = []

    for (const name of this.connections.keys()) {
      try {
        const result = await this.request(name, 'tools/list', {}) as { tools?: MCPTool[] }
        if (result?.tools) {
          for (const tool of result.tools) {
            defs.push({
              type: 'function',
              function: {
                name: `mcp__${name}__${tool.name}`,
                description: tool.description || `MCP tool: ${tool.name} (server: ${name})`,
                parameters: tool.inputSchema || { type: 'object', properties: {} },
              },
            })
          }
        }
      } catch { /* server may not support tools */ }
    }

    return defs
  }

  /**
   * Route a tool call with "mcp__<server>__<tool>" name format.
   * Returns null if the name doesn't match MCP format.
   */
  async routeToolCall(fullName: string, args: Record<string, unknown>): Promise<{ success: boolean; output: string } | null> {
    const parsed = parseMcpToolName(fullName)
    if (!parsed) return null
    const { serverName, toolName } = parsed
    if (!this.connections.has(serverName)) {
      return { success: false, output: `MCP server "${serverName}" not connected` }
    }

    try {
      const result = await this.callTool(serverName, toolName, args) as { content?: Array<{ text?: string }>; isError?: boolean }
      const text = result?.content?.map(c => c.text || '').join('\n') || JSON.stringify(result)
      return { success: !result?.isError, output: text.slice(0, 20_000) }
    } catch (err) {
      return { success: false, output: `MCP error: ${err instanceof Error ? err.message : String(err)}` }
    }
  }

  /** Get connected server count */
  get connectedCount(): number {
    return this.connections.size
  }

  get configuredCount(): number {
    return this.configs.size
  }

  get configuredNames(): string[] {
    return [...this.configs.keys()]
  }

  getConfigProvenance(name: string): MCPConfigProvenance | undefined {
    return this.configs.get(name)?.provenance
  }

  // ── Internal ─────────────────────────────────────────────────

  private setConfig(name: string, config: MCPServerConfig, provenance: MCPConfigProvenance): void {
    this.configs.set(name, { config, provenance })
  }

  private request(serverName: string, method: string, params: Record<string, unknown>): Promise<unknown> {
    const conn = this.connections.get(serverName)
    if (!conn || !conn.process.stdin) {
      return Promise.reject(new Error(`Not connected to ${serverName}`))
    }

    const id = ++conn.requestId
    const req: JSONRPCRequest = { jsonrpc: '2.0', id, method, params }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        conn.pending.delete(id)
        reject(new Error(`MCP request timeout: ${method}`))
      }, 10_000)

      conn.pending.set(id, {
        resolve: (v) => { clearTimeout(timeout); resolve(v) },
        reject: (e) => { clearTimeout(timeout); reject(e) },
      })

      conn.process.stdin!.write(JSON.stringify(req) + '\n')
    })
  }

  private notify(serverName: string, method: string, params: Record<string, unknown>): void {
    const conn = this.connections.get(serverName)
    if (!conn || !conn.process.stdin) return
    const msg = { jsonrpc: '2.0', method, params }
    conn.process.stdin.write(JSON.stringify(msg) + '\n')
  }
}

/** Singleton MCP client */
export const mcpClient = new MCPClient()
