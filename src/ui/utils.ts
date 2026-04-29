/** Truncate a label for display, appending '...' if exceeded */
export function truncateLabel(label: string, maxLen: number = 60): string {
  return label.length > maxLen ? label.slice(0, maxLen - 3) + '...' : label
}

export function truncateSessionId(sessionId: string, maxLen: number = 20): string {
  return sessionId.length > maxLen ? `${sessionId.slice(0, maxLen - 2)}..` : sessionId
}

interface SlashCommandLike {
  name: string
}

function getSlashCommandToken(input: string): string | null {
  if (!input.startsWith('/')) return null
  const token = input.split(/\s+/, 1)[0] || ''
  return token.startsWith('/') ? token : null
}

/**
 * Show the picker only for actual slash-command prefixes.
 * Absolute paths like /Users/... must remain plain text input.
 */
export function shouldShowCommandPicker(input: string, commands: SlashCommandLike[]): boolean {
  const token = getSlashCommandToken(input)
  if (!token) return false
  if (input.length > token.length) return false
  if (token === '/') return true
  const lowerToken = token.toLowerCase()
  return commands.some(command => command.name.toLowerCase().startsWith(lowerToken))
}

export function getCommandPickerFilter(input: string): string {
  const token = getSlashCommandToken(input)
  return token ? token.slice(1) : ''
}
