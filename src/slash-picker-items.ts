import { discoverAgentSpecs } from './agent-specs.js'
import { loadSkills } from './context.js'
import { discoverMcpServerConfigs } from './mcp-client.js'
import { listSlashCommandPickerItems } from './slash-commands.js'

export interface SlashPickerItem {
  name: string
  description: string
}

export function buildSlashCommandPickerItems(cwd: string): SlashPickerItem[] {
  const items = listSlashCommandPickerItems()
  const seen = new Set(items.map((item) => item.name))

  const add = (item: SlashPickerItem): void => {
    if (seen.has(item.name)) return
    seen.add(item.name)
    items.push(item)
  }

  for (const skill of loadSkills(cwd)) {
    add({
      name: `/skills ${skill.name}`,
      description: `Skill (${skill.source}) ${skill.description}`,
    })
  }

  for (const spec of discoverAgentSpecs(cwd)) {
    add({
      name: `/agents ${spec.name}`,
      description: `Agent (${spec.source}) ${spec.description}`,
    })
  }

  for (const server of discoverMcpServerConfigs(cwd)) {
    add({
      name: `/mcp ${server.name}`,
      description: `MCP server (${server.scope}) ${server.command}`,
    })
  }

  return items
}
