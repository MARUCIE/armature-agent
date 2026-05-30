function getArmatureShellPath() {
  return process.platform === 'win32' ? 'armature.cmd' : 'armature'
}

function normalizeSelection(text, maxLength = 12000) {
  const trimmed = String(text || '').trim()
  if (!trimmed) return ''
  return trimmed.length > maxLength
    ? `${trimmed.slice(0, maxLength)}\n\n[selection truncated at ${maxLength} chars]`
    : trimmed
}

function getWorkspaceCwd(workspaceFolders, activeFilePath) {
  if (Array.isArray(workspaceFolders) && workspaceFolders.length > 0) {
    return workspaceFolders[0].uri.fsPath
  }
  if (activeFilePath) {
    return activeFilePath.replace(/[/\\][^/\\]+$/, '')
  }
  return undefined
}

function buildArmatureTerminalOptions(name, args, cwd) {
  return {
    name,
    cwd,
    shellPath: getArmatureShellPath(),
    shellArgs: args,
  }
}

module.exports = {
  getArmatureShellPath,
  normalizeSelection,
  getWorkspaceCwd,
  buildArmatureTerminalOptions,
}
