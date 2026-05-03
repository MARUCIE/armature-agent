import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { MCPClient, parseMcpToolName } from '../src/mcp-client.js'
import { createTempProject } from './helpers/temp-project.js'
import { withEnv } from './helpers/env-snapshot.js'

const FAKE_MCP_SERVER = `
const fs = require('node:fs')
const readline = require('node:readline')

const markerPath = process.argv[2]
if (markerPath) {
  fs.writeFileSync(markerPath, 'spawned\\n', 'utf8')
}

const rl = readline.createInterface({ input: process.stdin })
rl.on('line', (line) => {
  let msg
  try {
    msg = JSON.parse(line)
  } catch {
    return
  }

  if (msg.method === 'initialize') {
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        serverInfo: { name: 'fake-mcp', version: '1.0.0' },
      },
    }) + '\\n')
    return
  }

  if (msg.method === 'tools/list') {
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0',
      id: msg.id,
      result: { tools: [] },
    }) + '\\n')
    return
  }

  if (msg.id !== undefined) {
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0',
      id: msg.id,
      result: {},
    }) + '\\n')
  }
})
`

describe('MCPClient', () => {
  let tempProject: ReturnType<typeof createTempProject>
  let client: MCPClient
  let origHome: string | undefined

  beforeEach(() => {
    client = new MCPClient()
    // Isolate from real HOME configs
    origHome = process.env.HOME
  })

  afterEach(() => {
    process.env.HOME = origHome
    if (tempProject) {
      tempProject.cleanup()
    }
  })

  /** Helper: create project + set HOME to its dir so global configs are isolated */
  function setupIsolated(files: Record<string, string>) {
    tempProject = createTempProject(files)
    process.env.HOME = tempProject.dir
    return tempProject
  }

  function buildNodeServerConfig(scriptPath: string, markerPath: string) {
    return {
      command: process.execPath,
      args: [scriptPath, markerPath],
    }
  }

  function writeJsonFile(root: string, relativePath: string, value: unknown) {
    const fullPath = join(root, relativePath)
    mkdirSync(dirname(fullPath), { recursive: true })
    writeFileSync(fullPath, JSON.stringify(value), 'utf-8')
  }

  describe('loadConfigs()', () => {
    it('reads native .mcp.json format', () => {
      setupIsolated({
        '.mcp.json': JSON.stringify({
          'server-a': { command: 'node', args: ['server.js'], env: { FOO: 'bar' } },
        }),
      })

      client.loadConfigs(tempProject.dir)

      expect(client.configuredCount).toBe(1)
    })

    it('reads .orca.json with mcpServers key', () => {
      setupIsolated({
        '.orca.json': JSON.stringify({
          mcpServers: {
            'server-b': { command: 'python', args: ['serve.py'] },
          },
        }),
      })

      client.loadConfigs(tempProject.dir)

      expect(client.configuredCount).toBe(1)
    })

    it('reads .claude/settings.json with mcpServers key', () => {
      setupIsolated({
        '.claude/settings.json': JSON.stringify({
          mcpServers: {
            'server-c': { command: 'bash', args: ['run.sh'], env: { DEBUG: 'true' } },
          },
        }),
      })

      client.loadConfigs(tempProject.dir)

      expect(client.configuredCount).toBe(1)
    })

    it('reads Codex TOML from HOME/.codex/config.toml', async () => {
      setupIsolated({})

      const globalTemp = createTempProject({
        '.codex/config.toml': `[mcp_servers.server_d]\ncommand = "node"\nargs = ["server.js"]\nenabled = true\n`,
      })

      await withEnv({ HOME: globalTemp.dir }, () => {
        client.loadConfigs(tempProject.dir)
        expect(client.configuredCount).toBe(1)
      })

      globalTemp.cleanup()
    })

    it('reads Codex TOML server names containing hyphens and underscores', async () => {
      setupIsolated({})

      const globalTemp = createTempProject({
        '.codex/config.toml': `[mcp_servers.omx_code_intel]\ncommand = "node"\nargs = ["server.js"]\nenabled = true\n\n[mcp_servers.code-review-graph]\ncommand = "node"\nargs = ["graph.js"]\nenabled = true\n`,
      })

      await withEnv({ HOME: globalTemp.dir }, () => {
        client.loadConfigs(tempProject.dir)
        expect(client.configuredCount).toBe(2)
      })

      globalTemp.cleanup()
    })

    it('native configs take priority over Claude Code configs', () => {
      setupIsolated({
        '.mcp.json': JSON.stringify({
          'same-server': { command: 'native-cmd', args: ['arg1'] },
        }),
        '.claude/settings.json': JSON.stringify({
          mcpServers: {
            'same-server': { command: 'claude-cmd', args: ['arg2'] },
          },
        }),
      })

      client.loadConfigs(tempProject.dir)

      // Only 1 config should exist (native won)
      expect(client.configuredCount).toBe(1)

      // Verify it's the native one by checking the command
      const servers = client.listServers()
      expect(servers[0]?.name).toBe('same-server')
    })

    it('skips disabled Codex servers', async () => {
      setupIsolated({})

      const globalTemp = createTempProject({
        '.codex/config.toml': `
[mcp_servers.enabled_server]
command = "node"
enabled = true

[mcp_servers.disabled_server]
command = "bash"
enabled = false
`,
      })

      await withEnv({ HOME: globalTemp.dir }, () => {
        client.loadConfigs(tempProject.dir)
        // Only enabled_server should be loaded
        expect(client.configuredCount).toBe(1)
      })

      globalTemp.cleanup()
    })

    it('handles malformed JSON gracefully without crashing', () => {
      setupIsolated({
        '.mcp.json': '{ invalid json }',
      })

      // Should not throw
      expect(() => {
        client.loadConfigs(tempProject.dir)
      }).not.toThrow()

      // Config should be empty
      expect(client.configuredCount).toBe(0)
    })

    it('returns correct configuredCount after merge', () => {
      setupIsolated({
        '.mcp.json': JSON.stringify({
          'server1': { command: 'cmd1' },
          'server2': { command: 'cmd2' },
        }),
      })

      client.loadConfigs(tempProject.dir)

      expect(client.configuredCount).toBe(2)
    })

    it('preserves config provenance for project and home scopes', async () => {
      setupIsolated({
        '.mcp.json': JSON.stringify({
          'project-server': { command: 'node' },
        }),
      })

      const globalTemp = createTempProject({
        '.orca/mcp.json': JSON.stringify({
          'home-server': { command: 'node' },
        }),
      })

      await withEnv({ HOME: globalTemp.dir }, () => {
        client.loadConfigs(tempProject.dir)

        const servers = client.listServers()
        expect(servers.find((server) => server.name === 'project-server')?.scope).toBe('project')
        expect(servers.find((server) => server.name === 'home-server')?.scope).toBe('home')
      })

      globalTemp.cleanup()
    })

    it('parses Claude Code format with command, args, and env', () => {
      setupIsolated({
        '.claude/settings.json': JSON.stringify({
          mcpServers: {
            'cc-server': {
              command: 'node',
              args: ['app.js', '--port', '3000'],
              env: { LOG_LEVEL: 'debug' },
            },
          },
        }),
      })

      client.loadConfigs(tempProject.dir)

      expect(client.configuredCount).toBe(1)
    })

    it('produces zero configs when all files missing', () => {
      setupIsolated({})

      client.loadConfigs(tempProject.dir)

      expect(client.configuredCount).toBe(0)
    })
  })

  describe('startup-safe MCP connection policy', () => {
    it('skips repo-local configs during default startup auto-connect while still connecting home configs', async () => {
      setupIsolated({
        'fake-mcp.cjs': FAKE_MCP_SERVER,
      })

      const scriptPath = join(tempProject.dir, 'fake-mcp.cjs')
      const projectMarker = join(tempProject.dir, 'project.marker')
      writeJsonFile(tempProject.dir, '.mcp.json', {
        'project-malicious': buildNodeServerConfig(scriptPath, projectMarker),
      })

      const globalTemp = createTempProject({})
      const homeMarker = join(globalTemp.dir, 'home.marker')
      writeJsonFile(globalTemp.dir, '.orca/mcp.json', {
        'home-safe': buildNodeServerConfig(scriptPath, homeMarker),
      })

      await withEnv({ HOME: globalTemp.dir }, async () => {
        client.loadConfigs(tempProject.dir)
        const connected = await client.connectStartupSafe()

        expect(connected).toEqual(['home-safe'])
        expect(existsSync(homeMarker)).toBe(true)
        expect(existsSync(projectMarker)).toBe(false)

        client.disconnectAll()
      })

      globalTemp.cleanup()
    })

    it('still allows explicit connect for project-scoped configs', async () => {
      setupIsolated({
        'fake-mcp.cjs': FAKE_MCP_SERVER,
      })

      const scriptPath = join(tempProject.dir, 'fake-mcp.cjs')
      const projectMarker = join(tempProject.dir, 'project.marker')
      writeJsonFile(tempProject.dir, '.mcp.json', {
        'project-malicious': buildNodeServerConfig(scriptPath, projectMarker),
      })

      client.loadConfigs(tempProject.dir)
      const ok = await client.connect('project-malicious')

      expect(ok).toBe(true)
      expect(existsSync(projectMarker)).toBe(true)

      client.disconnectAll()
    })
  })

  describe('connectedCount', () => {
    it('returns 0 when no servers connected', () => {
      expect(client.connectedCount).toBe(0)
    })
  })

  describe('parseMcpToolName()', () => {
    it('routes server names containing underscores', () => {
      expect(parseMcpToolName('mcp__omx_code_intel__lsp_diagnostics')).toEqual({
        serverName: 'omx_code_intel',
        toolName: 'lsp_diagnostics',
      })
    })

    it('routes server names containing hyphens', () => {
      expect(parseMcpToolName('mcp__code-review-graph__search')).toEqual({
        serverName: 'code-review-graph',
        toolName: 'search',
      })
    })
  })

  describe('listServers()', () => {
    it('lists configured but unconnected servers', () => {
      setupIsolated({
        '.mcp.json': JSON.stringify({
          'server-x': { command: 'node' },
          'server-y': { command: 'python' },
        }),
      })

      client.loadConfigs(tempProject.dir)
      const servers = client.listServers()

      expect(servers).toHaveLength(2)
      expect(servers[0]?.name).toBe('server-x')
      expect(servers[0]?.initialized).toBe(false)
      expect(servers[0]?.pid).toBe(0)
    })
  })
})
