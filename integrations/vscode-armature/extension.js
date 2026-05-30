const vscode = require('vscode')
const {
  buildArmatureTerminalOptions,
  getWorkspaceCwd,
  normalizeSelection,
} = require('./terminal-options.cjs')

function createArmatureTerminal(name, args, cwd) {
  const terminal = vscode.window.createTerminal(buildArmatureTerminalOptions(name, args, cwd))
  terminal.show(true)
  return terminal
}

function getActiveEditorContext() {
  const editor = vscode.window.activeTextEditor
  const activeFilePath = editor?.document?.uri?.fsPath
  const cwd = getWorkspaceCwd(vscode.workspace.workspaceFolders, activeFilePath)
  return { editor, activeFilePath, cwd }
}

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('armature.chat', () => {
      const { cwd } = getActiveEditorContext()
      createArmatureTerminal('Armature Chat', ['chat'], cwd)
    }),

    vscode.commands.registerCommand('armature.chatCurrentFile', () => {
      const { activeFilePath, cwd } = getActiveEditorContext()
      if (!activeFilePath) {
        void vscode.window.showErrorMessage('No active file to analyze.')
        return
      }
      createArmatureTerminal('Armature File Chat', ['chat', activeFilePath], cwd)
    }),

    vscode.commands.registerCommand('armature.chatSelection', () => {
      const { editor, cwd } = getActiveEditorContext()
      if (!editor) {
        void vscode.window.showErrorMessage('No active editor.')
        return
      }
      const selection = editor.document.getText(editor.selection)
      const normalized = normalizeSelection(selection)
      if (!normalized) {
        void vscode.window.showErrorMessage('Select some text first.')
        return
      }
      const prompt = `Review this selection from VS Code:\n\n${normalized}`
      createArmatureTerminal('Armature Selection Chat', ['chat', prompt], cwd)
    }),

    vscode.commands.registerCommand('armature.startMcpServer', () => {
      const { cwd } = getActiveEditorContext()
      createArmatureTerminal('Armature MCP', ['serve', '--mcp'], cwd)
    }),

    vscode.commands.registerCommand('armature.doctor', () => {
      const { cwd } = getActiveEditorContext()
      createArmatureTerminal('Armature Doctor', ['doctor'], cwd)
    }),
  )
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
}
