import { hooks, type HookResult } from '../hooks.js'
import { messageContentToText, type PromptContent } from '../providers/openai-compat.js'

function appendTextContext(prompt: PromptContent, label: string, context: string): PromptContent {
  const block = `\n\n<armature_hook_context source="${label}">\n${context.trim()}\n</armature_hook_context>`
  if (typeof prompt === 'string') return `${prompt}${block}`
  return [...prompt, { type: 'text' as const, text: block }]
}

function compactHookText(result: HookResult): string {
  return [result.systemMessage, result.additionalContext]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join('\n')
    .trim()
}

export async function applyUserPromptSubmitHooks(options: {
  prompt: PromptContent
  cwd: string
  model?: string
  writeSystemMessage?: (message: string) => void
}): Promise<{ prompt: PromptContent; blockedReason?: string }> {
  if (!hooks.hasHooks('UserPromptSubmit')) return { prompt: options.prompt }

  const result = await hooks.run('UserPromptSubmit', {
    event: 'UserPromptSubmit',
    prompt: messageContentToText(options.prompt),
    cwd: options.cwd,
    model: options.model,
  })

  if (!result.continue) {
    return {
      prompt: options.prompt,
      blockedReason: result.stopReason || 'UserPromptSubmit hook denied the prompt',
    }
  }

  if (result.systemMessage) {
    options.writeSystemMessage?.(result.systemMessage)
  }

  const context = compactHookText(result)
  if (!context) return { prompt: options.prompt }
  return {
    prompt: appendTextContext(options.prompt, 'UserPromptSubmit', context),
  }
}

export async function runStopHooks(options: {
  prompt: PromptContent
  responseText: string
  cwd: string
  model?: string
  writeSystemMessage?: (message: string) => void
}): Promise<string | null> {
  if (!hooks.hasHooks('Stop')) return null

  const result = await hooks.run('Stop', {
    event: 'Stop',
    prompt: messageContentToText(options.prompt),
    response: options.responseText,
    cwd: options.cwd,
    model: options.model,
  })

  const context = compactHookText(result)
  const lines: string[] = []
  if (!result.continue) {
    lines.push(`Stop hook blocked completion: ${result.stopReason || 'Stop hook returned continue=false'}`)
  }
  if (context) {
    lines.push(context)
  }
  if (lines.length === 0) return null

  const notice = `Hook Stop notice:\n${lines.map((line) => `- ${line}`).join('\n')}`
  options.writeSystemMessage?.(notice)
  return notice
}
