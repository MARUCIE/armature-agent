export type SlashCommandCategory =
  | 'Session'
  | 'Model'
  | 'Git'
  | 'Multi-Model'
  | 'Knowledge'
  | 'System'
  | 'Exit'

export interface SlashCommandDefinition {
  name: string
  description: string
  category: SlashCommandCategory
  aliases?: string[]
  completion?: boolean
  picker?: boolean
  help?: boolean
  homeDescription?: string
}

export const SLASH_COMMAND_DEFINITIONS: readonly SlashCommandDefinition[] = [
  { name: '/help', description: 'Show all commands', category: 'Session', aliases: ['/h', '/?'], homeDescription: 'show command surface' },
  { name: '/clear', description: 'Clear conversation', category: 'Session' },
  { name: '/compact', description: 'Smart compaction', category: 'Session' },
  { name: '/status', description: 'Session overview', category: 'Session' },
  { name: '/cost', description: 'Token breakdown', category: 'Session' },
  { name: '/save', description: 'Save session', category: 'Session' },
  { name: '/load', description: 'Load saved session', category: 'Session', picker: false, help: false },
  { name: '/sessions', description: 'Inspect saved sessions', category: 'Session', picker: false, help: false, homeDescription: 'inspect saved sessions' },
  { name: '/continue', description: 'Continue latest session', category: 'Session', picker: false, help: false },
  { name: '/history', description: 'Message counts', category: 'Session', picker: false, help: false },
  { name: '/tokens', description: 'Token totals', category: 'Session', picker: false, help: false },
  { name: '/stats', description: 'Session statistics', category: 'Session', picker: false, help: false },
  { name: '/cwd', description: 'Show current directory', category: 'Session', picker: false, help: false },

  { name: '/model', description: 'Show/switch model', category: 'Model', aliases: ['/m'] },
  { name: '/models', description: 'List all models', category: 'Model', homeDescription: 'inspect available model lanes' },
  { name: '/providers', description: 'List providers', category: 'Model', homeDescription: 'show provider readiness' },
  { name: '/effort', description: 'Thinking effort', category: 'Model' },
  { name: '/mode', description: 'Behavioral profiles', category: 'Model' },
  { name: '/reflect', description: 'Socratic debugging', category: 'Model' },
  { name: '/permissions', description: 'Approval and trust mode', category: 'Model', homeDescription: 'inspect or tighten approval mode' },

  { name: '/diff', description: 'Show git diff', category: 'Git' },
  { name: '/git', description: 'Run git command', category: 'Git' },
  { name: '/commit', description: 'Create commit', category: 'Git' },
  { name: '/review', description: 'Review changed files', category: 'Git', picker: false, help: false },
  { name: '/pr', description: 'Prepare pull request', category: 'Git', picker: false, help: false },
  { name: '/undo', description: 'Revert last write', category: 'Git' },

  { name: '/council', description: 'Multi-model council', category: 'Multi-Model' },
  { name: '/race', description: 'First answer wins', category: 'Multi-Model' },
  { name: '/pipeline', description: 'Plan-Code-Review', category: 'Multi-Model' },
  { name: '/mission', description: 'Autonomous mission', category: 'Multi-Model' },
  { name: '/plan', description: 'Task decomposition', category: 'Multi-Model' },

  { name: '/notes', description: 'Observations', category: 'Knowledge' },
  { name: '/postmortem', description: 'Error patterns', category: 'Knowledge' },
  { name: '/prompts', description: 'Template library', category: 'Knowledge' },
  { name: '/learn', description: 'Evolution rules', category: 'Knowledge' },
  { name: '/thread', description: 'Conversation memory', category: 'Knowledge' },
  { name: '/threads', description: 'Conversation memory', category: 'Knowledge', picker: false, help: false },

  { name: '/config', description: 'Config snapshot', category: 'System' },
  { name: '/init', description: 'Initialize project config', category: 'System', picker: false, help: false },
  { name: '/hooks', description: 'Registered hooks', category: 'System' },
  { name: '/mcp', description: 'MCP servers', category: 'System' },
  { name: '/jobs', description: 'Background jobs', category: 'System', picker: false, help: false },
  { name: '/evidence', description: 'Open TaskRun evidence', category: 'System' },
  { name: '/doctor', description: 'Health check', category: 'System', homeDescription: 'diagnose runtime and config problems' },
  { name: '/system', description: 'System prompt', category: 'System', picker: false, help: false },

  { name: '/retry', description: 'Retry last prompt', category: 'Exit', aliases: ['/r'], picker: false, help: false },
  { name: '/exit', description: 'Exit chat', category: 'Exit', aliases: ['/q'], picker: false, help: false },
  { name: '/quit', description: 'Exit chat', category: 'Exit', picker: false, help: false },
]

export const SLASH_HELP_SECTION_PAIRS: ReadonlyArray<readonly [SlashCommandCategory, SlashCommandCategory]> = [
  ['Session', 'Model'],
  ['Git', 'Multi-Model'],
  ['Knowledge', 'System'],
]

export function listSlashCommandCompletions(): string[] {
  const commands = new Set<string>()
  for (const command of SLASH_COMMAND_DEFINITIONS) {
    if (command.completion === false) continue
    commands.add(command.name)
  }
  return [...commands]
}

export function listSlashCommandPickerItems(): Array<{ name: string; description: string }> {
  return SLASH_COMMAND_DEFINITIONS
    .filter((command) => command.picker !== false)
    .map((command) => ({ name: command.name, description: command.description }))
}

export function listSlashHelpCommands(category: SlashCommandCategory): SlashCommandDefinition[] {
  return SLASH_COMMAND_DEFINITIONS.filter((command) => command.category === category && command.help !== false)
}

export function getSlashCommandDefinition(name: string): SlashCommandDefinition | undefined {
  return SLASH_COMMAND_DEFINITIONS.find((command) => command.name === name || command.aliases?.includes(name))
}

export function getSlashCommandDescription(name: string): string {
  return getSlashCommandDefinition(name)?.description || ''
}

export function getSlashCommandHomeDescription(name: string): string {
  const command = getSlashCommandDefinition(name)
  return command?.homeDescription || command?.description.toLowerCase() || ''
}
