/**
 * MCP (Model Context Protocol) server — stdio transport.
 *
 * Exposes Orca's built-in tools as a JSON-RPC 2.0 server.
 * Each stdin line is one JSON-RPC request; each stdout line is one response.
 */

import { createInterface } from 'node:readline'
import { authorizeToolCall, executeToolWithPolicy, runPostToolHook, type PolicyPermissionMode } from './policy-executor.js'
import { TOOL_DEFINITIONS } from './tools.js'

// ── Types ────────────────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id?: number | string | null
  method: string
  params?: Record<string, unknown>
}

interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: number | string | null
  result?: unknown
  error?: { code: number; message: string }
}

// ── Server ───────────────────────────────────────────────────────

export class MCPServer {
  private cwd: string
  private rl: ReturnType<typeof createInterface> | null = null
  private permissionMode: PolicyPermissionMode
  private allowedTools?: string[]
  private isPermissionGranted?: (ruleKey: string) => boolean

  constructor(
    cwd: string,
    options: {
      permissionMode?: PolicyPermissionMode
      allowedTools?: string[]
      isPermissionGranted?: (ruleKey: string) => boolean
    } = {},
  ) {
    this.cwd = cwd
    this.permissionMode = options.permissionMode || 'auto'
    this.allowedTools = options.allowedTools
    this.isPermissionGranted = options.isPermissionGranted
  }

  /** Start listening on stdin for JSON-RPC messages (one per line). */
  start(): void {
    this.rl = createInterface({ input: process.stdin, terminal: false })
    this.rl.on('line', async (line: string) => {
      let req: JsonRpcRequest
      try {
        req = JSON.parse(line)
      } catch {
        this.send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })
        return
      }

      const res = await this.handleRequest(req)
      // Notifications (no id) don't get a response
      if (res) this.send(res)
    })
  }

  /** Handle a single JSON-RPC request. Returns null for notifications. */
  async handleRequest(req: JsonRpcRequest): Promise<JsonRpcResponse | null> {
    // Notifications: id is absent or null — no response
    if (req.id === undefined || req.id === null) {
      // Still dispatch for side-effects (e.g. notifications/initialized) but never reply
      return null
    }

    switch (req.method) {
      case 'initialize':
        return {
          jsonrpc: '2.0',
          id: req.id,
          result: {
            capabilities: { tools: {} },
            serverInfo: { name: 'orca-cli', version: '0.7.1' },
          },
        }

      case 'tools/list':
        return {
          jsonrpc: '2.0',
          id: req.id,
          result: {
            tools: this.getAdvertisedTools().map(t => ({
              name: t.function.name,
              description: t.function.description,
              inputSchema: t.function.parameters,
            })),
          },
        }

      case 'tools/call': {
        const name = (req.params?.name as string) || ''
        const args = (req.params?.arguments as Record<string, unknown>) || {}
        const authorization = await authorizeToolCall({
          name,
          args,
          cwd: this.cwd,
          permissionMode: this.permissionMode,
          allowedTools: this.allowedTools,
          isPermissionGranted: this.isPermissionGranted,
        })
        const toolResult = authorization.authorized
          ? executeToolWithPolicy({
            name,
            args: authorization.args,
            cwd: this.cwd,
            permissionMode: this.permissionMode,
          })
          : (authorization.result || { success: false, output: 'Tool execution blocked by policy.' })
        if (authorization.authorized) {
          await runPostToolHook(name, authorization.args, toolResult, this.cwd)
        }
        return {
          jsonrpc: '2.0',
          id: req.id,
          result: {
            content: [{ type: 'text', text: toolResult.output }],
            isError: !toolResult.success,
          },
        }
      }

      default:
        return {
          jsonrpc: '2.0',
          id: req.id,
          error: { code: -32601, message: `Method not found: ${req.method}` },
        }
    }
  }

  /** Stop the server and close stdin reader. */
  stop(): void {
    this.rl?.close()
    this.rl = null
  }

  private send(res: JsonRpcResponse): void {
    process.stdout.write(JSON.stringify(res) + '\n')
  }

  private getAdvertisedTools() {
    if (!this.allowedTools) return TOOL_DEFINITIONS
    return TOOL_DEFINITIONS.filter((tool) => this.allowedTools!.includes(tool.function.name))
  }
}
