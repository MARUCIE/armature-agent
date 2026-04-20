# Orca VS Code Extension

Minimal VS Code integration for `orca-cli`.

## Commands

- `Orca: Open Chat`
- `Orca: Analyze Current File`
- `Orca: Review Selection`
- `Orca: Start MCP Server`
- `Orca: Run Doctor`

## Notes

- The extension launches the installed `orca` executable directly in VS Code terminals.
- No extra runtime dependencies are bundled; VS Code provides the `vscode` API.
- `Orca: Review Selection` truncates very large selections to keep terminal argument size bounded.
