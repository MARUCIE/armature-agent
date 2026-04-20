export interface ApplyModeSystemPromptOptions {
  currentSystemPrompt: string
  previousModePrefix?: string
  nextModePrefix?: string
}

export function applyModeSystemPrompt(options: ApplyModeSystemPromptOptions): string {
  const basePrompt = stripModePrefix(
    options.currentSystemPrompt,
    options.previousModePrefix || '',
  )
  const nextModePrefix = options.nextModePrefix || ''

  if (!nextModePrefix) return basePrompt
  if (!basePrompt.trim()) return nextModePrefix

  const nextModeBlock = `${nextModePrefix}\n\n`
  if (basePrompt.includes(nextModeBlock) || basePrompt.startsWith(nextModePrefix)) {
    return basePrompt
  }

  return `${nextModeBlock}${basePrompt}`
}

function stripModePrefix(systemPrompt: string, modePrefix: string): string {
  if (!modePrefix) return systemPrompt

  const modeBlock = `${modePrefix}\n\n`
  if (systemPrompt.includes(modeBlock)) {
    return systemPrompt.replace(modeBlock, '')
  }

  if (systemPrompt.startsWith(modePrefix)) {
    return systemPrompt.slice(modePrefix.length).replace(/^\n{1,2}/, '')
  }

  return systemPrompt
}
