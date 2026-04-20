function getOrcaShellPath() {
  return process.platform === 'win32' ? 'orca.cmd' : 'orca'
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

function buildOrcaTerminalOptions(name, args, cwd) {
  return {
    name,
    cwd,
    shellPath: getOrcaShellPath(),
    shellArgs: args,
  }
}

module.exports = {
  getOrcaShellPath,
  normalizeSelection,
  getWorkspaceCwd,
  buildOrcaTerminalOptions,
}
