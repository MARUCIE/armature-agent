# Armature VS Code Extension

Minimal VS Code integration for `armature-cli`.

## Commands

- `Armature: Open Chat`
- `Armature: Analyze Current File`
- `Armature: Review Selection`
- `Armature: Start MCP Server`
- `Armature: Run Doctor`

## Notes

- The extension launches the installed `armature` executable directly in VS Code terminals.
- No extra runtime dependencies are bundled; VS Code provides the `vscode` API.
- `Armature: Review Selection` truncates very large selections to keep terminal argument size bounded.
