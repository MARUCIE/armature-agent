const vscode = require('vscode')
const {
  buildOrcaTerminalOptions,
  getWorkspaceCwd,
  normalizeSelection,
} = require('./terminal-options.cjs')

function createOrcaTerminal(name, args, cwd) {
  const terminal = vscode.window.createTerminal(buildOrcaTerminalOptions(name, args, cwd))
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
    vscode.commands.registerCommand('orca.chat', () => {
      const { cwd } = getActiveEditorContext()
      createOrcaTerminal('Orca Chat', ['chat'], cwd)
    }),

    vscode.commands.registerCommand('orca.chatCurrentFile', () => {
      const { activeFilePath, cwd } = getActiveEditorContext()
      if (!activeFilePath) {
        void vscode.window.showErrorMessage('No active file to analyze.')
        return
      }
      createOrcaTerminal('Orca File Chat', ['chat', activeFilePath], cwd)
    }),

    vscode.commands.registerCommand('orca.chatSelection', () => {
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
      createOrcaTerminal('Orca Selection Chat', ['chat', prompt], cwd)
    }),

    vscode.commands.registerCommand('orca.startMcpServer', () => {
      const { cwd } = getActiveEditorContext()
      createOrcaTerminal('Orca MCP', ['serve', '--mcp'], cwd)
    }),

    vscode.commands.registerCommand('orca.doctor', () => {
      const { cwd } = getActiveEditorContext()
      createOrcaTerminal('Orca Doctor', ['doctor'], cwd)
    }),
  )
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
}
