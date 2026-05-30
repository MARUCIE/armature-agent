export type KeybindingContext =
  | 'app'
  | 'chat'
  | 'task'
  | 'picker'
  | 'scroll'

export type KeybindingAction =
  | 'app:interrupt'
  | 'app:exit'
  | 'app:toggleTodos'
  | 'app:toggleTranscript'
  | 'task:background'
  | 'chat:submit'
  | 'chat:newline'
  | 'chat:cancel'
  | 'chat:rewind'
  | 'chat:clearInput'
  | 'chat:killAgents'
  | 'chat:cycleMode'
  | 'chat:undo'
  | 'chat:history-search'
  | 'chat:history-previous'
  | 'chat:history-next'
  | 'chat:externalEditor'
  | 'chat:modelPicker'
  | 'chat:fastMode'
  | 'chat:thinkingToggle'
  | 'chat:stash'
  | 'chat:imagePaste'
  | 'chat:word-left'
  | 'chat:word-right'
  | 'chat:line-start'
  | 'chat:line-end'
  | 'chat:delete-word-before'
  | 'chat:delete-to-line-end'
  | 'chat:delete-to-line-start'
  | 'chat:yank'
  | 'chat:yank-pop'
  | 'picker:accept'
  | 'picker:cancel'
  | 'picker:previous'
  | 'picker:next'
  | 'scroll:page-up'
  | 'scroll:page-down'
  | 'scroll:top'
  | 'scroll:bottom'

export interface KeybindingDefinition {
  context: KeybindingContext
  key: string
  action: KeybindingAction
  description: string
}

export interface InkKeyLike {
  ctrl?: boolean
  meta?: boolean
  shift?: boolean
  return?: boolean
  tab?: boolean
  escape?: boolean
  backspace?: boolean
  delete?: boolean
  upArrow?: boolean
  downArrow?: boolean
  leftArrow?: boolean
  rightArrow?: boolean
  pageUp?: boolean
  pageDown?: boolean
}

export const CLAUDE_CODE_KEYBINDINGS: readonly KeybindingDefinition[] = [
  { context: 'app', key: 'Ctrl+C', action: 'app:interrupt', description: 'Cancel current input or generation' },
  { context: 'app', key: 'Ctrl+D', action: 'app:exit', description: 'Exit Claude Code session' },
  { context: 'app', key: 'Ctrl+T', action: 'app:toggleTodos', description: 'Toggle task list visibility' },
  { context: 'app', key: 'Ctrl+O', action: 'app:toggleTranscript', description: 'Toggle verbose transcript' },
  { context: 'chat', key: 'Enter', action: 'chat:submit', description: 'Submit message' },
  { context: 'chat', key: 'Ctrl+J', action: 'chat:newline', description: 'Insert a newline' },
  { context: 'chat', key: 'Shift+Enter', action: 'chat:newline', description: 'Insert a newline' },
  { context: 'chat', key: '\\ + Enter', action: 'chat:newline', description: 'Insert a newline on all terminals' },
  { context: 'chat', key: 'Esc', action: 'chat:cancel', description: 'Cancel current input or running turn' },
  { context: 'chat', key: 'Esc Esc', action: 'chat:rewind', description: 'Rewind to the previous user message' },
  { context: 'chat', key: 'Ctrl+L', action: 'chat:clearInput', description: 'Redraw screen while preserving input and conversation history' },
  { context: 'chat', key: 'Ctrl+X Ctrl+K', action: 'chat:killAgents', description: 'Kill all background agents; press twice within 3 seconds to confirm' },
  { context: 'chat', key: 'Shift+Tab', action: 'chat:cycleMode', description: 'Cycle permission modes' },
  { context: 'chat', key: 'Alt+M', action: 'chat:cycleMode', description: 'Cycle permission modes on terminals without Shift+Tab' },
  { context: 'chat', key: 'Meta+P', action: 'chat:modelPicker', description: 'Open model picker' },
  { context: 'chat', key: 'Meta+O', action: 'chat:fastMode', description: 'Toggle fast mode' },
  { context: 'chat', key: 'Meta+T', action: 'chat:thinkingToggle', description: 'Toggle extended thinking' },
  { context: 'chat', key: 'Ctrl+_', action: 'chat:undo', description: 'Undo last action' },
  { context: 'chat', key: 'Ctrl+Shift+-', action: 'chat:undo', description: 'Undo last action' },
  { context: 'chat', key: 'Ctrl+R', action: 'chat:history-search', description: 'Search prompt history' },
  { context: 'chat', key: 'Ctrl+P', action: 'chat:history-previous', description: 'Move cursor up or navigate to previous prompt history entry' },
  { context: 'chat', key: 'Ctrl+N', action: 'chat:history-next', description: 'Move cursor down or navigate to next prompt history entry' },
  { context: 'chat', key: 'Ctrl+G', action: 'chat:externalEditor', description: 'Open in external editor' },
  { context: 'chat', key: 'Ctrl+X Ctrl+E', action: 'chat:externalEditor', description: 'Open in external editor' },
  { context: 'chat', key: 'Ctrl+S', action: 'chat:stash', description: 'Stash current prompt' },
  { context: 'chat', key: 'Ctrl+V', action: 'chat:imagePaste', description: 'Paste image from clipboard' },
  { context: 'chat', key: 'Alt+V', action: 'chat:imagePaste', description: 'Paste image from clipboard on terminals that reserve Ctrl+V' },
  { context: 'chat', key: 'Alt+B', action: 'chat:word-left', description: 'Move cursor one word left' },
  { context: 'chat', key: 'Alt+F', action: 'chat:word-right', description: 'Move cursor one word right' },
  { context: 'chat', key: 'Ctrl+A', action: 'chat:line-start', description: 'Move cursor to line start' },
  { context: 'chat', key: 'Ctrl+E', action: 'chat:line-end', description: 'Move cursor to line end' },
  { context: 'chat', key: 'Ctrl+W', action: 'chat:delete-word-before', description: 'Delete word before cursor' },
  { context: 'chat', key: 'Ctrl+K', action: 'chat:delete-to-line-end', description: 'Delete to line end' },
  { context: 'chat', key: 'Ctrl+U', action: 'chat:delete-to-line-start', description: 'Delete to line start' },
  { context: 'chat', key: 'Ctrl+Y', action: 'chat:yank', description: 'Yank killed text' },
  { context: 'chat', key: 'Alt+Y', action: 'chat:yank-pop', description: 'Cycle paste history after yank' },
  { context: 'task', key: 'Ctrl+B', action: 'task:background', description: 'Background current task' },
  { context: 'picker', key: 'Enter', action: 'picker:accept', description: 'Accept selected item' },
  { context: 'picker', key: 'Esc', action: 'picker:cancel', description: 'Close picker' },
  { context: 'picker', key: 'Up', action: 'picker:previous', description: 'Previous picker item' },
  { context: 'picker', key: 'Down', action: 'picker:next', description: 'Next picker item' },
  { context: 'scroll', key: 'PageUp', action: 'scroll:page-up', description: 'Scroll up half the viewport height' },
  { context: 'scroll', key: 'PageDown', action: 'scroll:page-down', description: 'Scroll down half the viewport height' },
  { context: 'scroll', key: 'Ctrl+Home', action: 'scroll:top', description: 'Jump to the start of the conversation' },
  { context: 'scroll', key: 'Ctrl+End', action: 'scroll:bottom', description: 'Jump to the latest message' },
]

export function resolveChatKeyAction(input: string, key: InkKeyLike): KeybindingAction | null {
  if (key.ctrl && input === 'c') return 'app:interrupt'
  if (key.ctrl && input === 'd') return 'app:exit'
  if (key.ctrl && input === 't') return 'app:toggleTodos'
  if (key.ctrl && input === 'o') return 'app:toggleTranscript'
  if (key.ctrl && input === 'b') return 'task:background'
  if ((key.ctrl && input === 'j') || (key.return && (key.ctrl || key.meta || key.shift))) return 'chat:newline'
  if (key.return) return 'chat:submit'
  if (key.escape) return 'chat:cancel'
  if (key.ctrl && input === 'l') return 'chat:clearInput'
  if ((key.tab && key.shift) || (key.meta && input === 'm')) return 'chat:cycleMode'
  if (key.ctrl && (input === '_' || input === '-')) return 'chat:undo'
  if (key.ctrl && input === 'r') return 'chat:history-search'
  if (key.ctrl && input === 'p') return 'chat:history-previous'
  if (key.ctrl && input === 'n') return 'chat:history-next'
  if (key.ctrl && input === 'g') return 'chat:externalEditor'
  if (key.meta && input === 'p') return 'chat:modelPicker'
  if (key.meta && input === 'o') return 'chat:fastMode'
  if (key.meta && input === 't') return 'chat:thinkingToggle'
  if (key.ctrl && input === 's') return 'chat:stash'
  if ((key.ctrl || key.meta) && input === 'v') return 'chat:imagePaste'
  if (key.meta && input === 'b') return 'chat:word-left'
  if (key.meta && input === 'f') return 'chat:word-right'
  if (key.ctrl && input === 'a') return 'chat:line-start'
  if (key.ctrl && input === 'e') return 'chat:line-end'
  if (key.ctrl && input === 'w') return 'chat:delete-word-before'
  if (key.ctrl && input === 'k') return 'chat:delete-to-line-end'
  if (key.ctrl && input === 'u') return 'chat:delete-to-line-start'
  if (key.ctrl && input === 'y') return 'chat:yank'
  if (key.meta && input === 'y') return 'chat:yank-pop'
  return null
}

export function isClaudeCodeKeybinding(action: KeybindingAction): boolean {
  return CLAUDE_CODE_KEYBINDINGS.some((binding) => binding.action === action)
}
