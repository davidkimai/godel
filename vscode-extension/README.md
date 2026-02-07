# Godel VS Code Extension

VS Code extension for the Godel Agent Orchestration Platform.

## Features

- **Agent Management**: View, spawn, and kill agents directly from VS Code
- **Team Orchestration**: Create and manage agent teams
- **Intent Execution**: Execute natural language intents
- **Real-time Monitoring**: Watch agent logs and status
- **Dashboard Integration**: Open Godel dashboard in browser

## Requirements

- VS Code 1.85.0 or higher
- Godel server running (local or remote)
- API key for authentication

## Installation

### From VSIX

```bash
code --install-extension godel-vscode-0.1.0.vsix
```

### From Source

```bash
cd vscode-extension
npm install
npm run compile
# Press F5 to launch extension host
```

## Configuration

Configure via VS Code settings (`Ctrl+,`) or use the command palette (`Ctrl+Shift+P`):

```json
{
  "godel.serverUrl": "http://localhost:7373",
  "godel.apiKey": "your-api-key",
  "godel.defaultModel": "claude-sonnet-4-5",
  "godel.autoRefresh": true,
  "godel.refreshInterval": 30
}
```

## Commands

| Command | Keybinding | Description |
|---------|------------|-------------|
| `Godel: Quick Action` | `Ctrl+Shift+G` | Quick pick menu |
| `Godel: Execute Intent` | `Ctrl+Shift+I` | Execute natural language intent |
| `Godel: Spawn Agent` | - | Create new agent |
| `Godel: Create Team` | - | Create agent team |
| `Godel: Open Dashboard` | - | Open Godel dashboard |
| `Godel: Configure` | - | Configure extension |

## Views

- **Godel Agents** (Explorer sidebar): View agents and teams
- **Agent Logs** (Output panel): Stream agent logs

## Development

```bash
# Install dependencies
npm install

# Compile
npm run compile

# Watch for changes
npm run watch

# Run tests
npm test

# Package
npm run package
```

## License

MIT
