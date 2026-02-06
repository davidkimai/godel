# Dash Extension System

The Dash Extension System allows you to customize and extend Dash's capabilities with TypeScript plugins. Extensions can add custom tools, commands, event handlers, and integrations.

## Table of Contents

- [Overview](#overview)
- [Getting Started](#getting-started)
- [Extension API](#extension-api)
- [Creating Extensions](#creating-extensions)
- [Tools](#tools)
- [Commands](#commands)
- [Events](#events)
- [Permissions](#permissions)
- [Hot Reload](#hot-reload)
- [Configuration](#configuration)
- [Examples](#examples)
- [API Reference](#api-reference)

## Overview

Dash extensions are TypeScript modules that can:

- **Register Tools**: Add new capabilities that agents can use (e.g., deploy to production, query databases)
- **Register Commands**: Add CLI commands (e.g., `/deploy`, `/notify`)
- **Handle Events**: React to agent lifecycle events (start, complete, errors)
- **Integrate External Services**: Connect to Slack, Jira, custom APIs

Extensions are loaded from:
1. `~/.godel/extensions/` (global extensions)
2. `./.godel/extensions/` (project-local extensions)
3. Configured paths in your Dash config

## Getting Started

### 1. Create an Extension

Create a file in `~/.godel/extensions/my-extension.ts`:

```typescript
import { Type } from '@sinclair/typebox';
import type { ExtensionAPI, ExtensionContext } from '@dash/core/extension-api';

export default function myExtension(api: ExtensionAPI, ctx: ExtensionContext) {
  // Register a tool
  api.registerTool({
    name: 'hello',
    description: 'Say hello',
    parameters: Type.Object({
      name: Type.String({ description: 'Name to greet' })
    }),
    async execute(toolCallId, params, ctx) {
      return {
        content: `Hello, ${params.name}!`,
        isError: false
      };
    }
  });

  // Register a command
  api.registerCommand('greet', {
    description: 'Greet someone',
    async handler(args, ctx) {
      ctx.logger.info(`Hello, ${args || 'World'}!`);
    }
  });

  // Listen for events
  api.on('agent_start', async (event) => {
    api.log('info', `Agent ${event.agentId} started`);
  });
}
```

### 2. Extension is Auto-Loaded

Dash automatically discovers and loads extensions from `~/.godel/extensions/` on startup.

### 3. Use Your Extension

```bash
# Use the registered command
dash /greet "Everyone"

# The registered tool is available to agents
# "Use the hello tool to greet Alice"
```

## Extension API

The `ExtensionAPI` object provides methods to register tools, commands, and event handlers.

```typescript
interface ExtensionAPI {
  // Event subscription
  on(event: string, handler: EventHandler): void;
  
  // Tool registration
  registerTool(tool: ToolDefinition): void;
  
  // Command registration
  registerCommand(name: string, command: CommandDefinition): void;
  
  // Utilities
  log(level: 'info' | 'warn' | 'error' | 'debug', message: string): void;
  getConfig<T>(key: string, defaultValue?: T): T;
  setConfig<T>(key: string, value: T): void;
}
```

## Creating Extensions

### Basic Structure

Every extension exports a default function that receives the ExtensionAPI:

```typescript
export default function extensionName(api: ExtensionAPI, ctx: ExtensionContext) {
  // Extension logic here
}
```

The function can also be async:

```typescript
export default async function extensionName(api: ExtensionAPI, ctx: ExtensionContext) {
  // Async initialization
  const config = await loadConfig();
  // ...
}
```

### Extension Context

The `ExtensionContext` provides information about the Dash environment:

```typescript
interface ExtensionContext {
  version: string;        // Dash version
  extensionDir: string;   // Path to extensions directory
  isDev: boolean;        // Development mode
}
```

## Tools

Tools are functions that agents can call. They use TypeBox for parameter validation.

### Tool Definition

```typescript
import { Type } from '@sinclair/typebox';

api.registerTool({
  name: 'tool_name',           // Unique tool name
  description: 'What it does', // Description for the LLM
  parameters: Type.Object({    // Parameter schema
    param1: Type.String(),
    param2: Type.Number({ description: 'Optional description' })
  }),
  permissions: ['fs:read'],    // Required permissions
  async execute(toolCallId, params, ctx, onUpdate) {
    // Execute logic
    return {
      content: 'Result text',
      isError: false,
      details: { optional: 'structured data' }
    };
  }
});
```

### Tool Context

The `ctx` parameter provides:

```typescript
interface ToolContext {
  agentId?: string;           // ID of calling agent
  swarmId?: string;          // ID of swarm (if in swarm)
  cwd: string;               // Current working directory
  signal?: AbortSignal;      // Cancellation signal
  hasPermission: (p: string) => boolean;  // Permission checker
}
```

### Tool Example: Database Query

```typescript
api.registerTool({
  name: 'query_database',
  description: 'Execute a read-only database query',
  parameters: Type.Object({
    query: Type.String({ description: 'SQL SELECT statement' })
  }),
  permissions: ['net:read'],
  async execute(toolCallId, params, ctx) {
    // Check permissions
    if (!ctx.hasPermission('net:read')) {
      return {
        content: 'Permission denied: net:read required',
        isError: true
      };
    }
    
    try {
      const result = await db.query(params.query);
      return {
        content: JSON.stringify(result, null, 2),
        isError: false
      };
    } catch (error) {
      return {
        content: `Query failed: ${error}`,
        isError: true
      };
    }
  }
});
```

## Commands

Commands add CLI functionality accessible via `/command-name`.

### Command Definition

```typescript
api.registerCommand('command-name', {
  description: 'What this command does',
  args: '[optional-args]',     // Argument pattern for help
  async handler(args, ctx) {
    // Command logic
    ctx.logger.info('Command executed!');
  },
  getCompletions?: (argPrefix: string) => string[]  // Auto-complete
});
```

### Command Context

```typescript
interface CommandContext {
  cwd: string;
  logger: {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
    debug: (msg: string) => void;
  };
  exec: (cmd: string, args?: string[]) => Promise<ExecResult>;
  spawnAgent: (task: string, options?: AgentOptions) => Promise<unknown>;
  notify: (message: string, type?: 'info' | 'warning' | 'error') => void;
}
```

### Command Example: Deploy

```typescript
api.registerCommand('deploy', {
  description: 'Deploy services',
  args: '<service> [--env <environment>]',
  async handler(args, ctx) {
    const [service, ...flags] = args.split(' ');
    const env = flags.includes('--env') 
      ? flags[flags.indexOf('--env') + 1] 
      : 'staging';
    
    ctx.logger.info(`Deploying ${service} to ${env}...`);
    
    const result = await ctx.exec('deploy-script', [service, env]);
    
    if (result.exitCode === 0) {
      ctx.notify(`Deployed ${service} successfully`, 'info');
    } else {
      ctx.notify(`Deploy failed: ${result.stderr}`, 'error');
    }
  }
});
```

## Events

Extensions can subscribe to Dash lifecycle events.

### Available Events

| Event | Description | Payload |
|-------|-------------|---------|
| `agent_start` | Agent started working | `{ agentId, task, swarmId? }` |
| `agent_complete` | Agent completed task | `{ agentId, result, duration, cost? }` |
| `agent_error` | Agent encountered error | `{ agentId, error }` |
| `swarm_start` | Swarm started | `{ swarmId, name, task, agentCount }` |
| `swarm_complete` | Swarm completed | `{ swarmId, results, totalCost? }` |
| `tool_call` | Tool was called | `{ toolName, toolCallId, input, agentId? }` |
| `tool_result` | Tool returned result | `{ toolName, toolCallId, result, duration }` |
| `command_execute` | Command was executed | `{ command, args }` |

### Event Handlers

```typescript
// Subscribe to events
api.on('agent_start', async (event) => {
  console.log(`Agent ${event.agentId} started`);
});

api.on('agent_complete', async (event) => {
  if (event.cost && event.cost > 1.0) {
    console.log(`High cost alert: $${event.cost}`);
  }
});
```

## Permissions

Extensions run in a permission-based sandbox. Tools declare required permissions, and the system enforces them.

### Permission Types

| Permission | Description |
|------------|-------------|
| `fs:read` | Read files |
| `fs:write` | Write files |
| `fs:*` | All file operations |
| `net:read` | Make HTTP GET requests |
| `net:write` | Make HTTP POST/PUT/DELETE |
| `net:*` | All network access |
| `exec:read` | Read command output |
| `exec:write` | Execute commands |
| `agent:read` | Read agent state |
| `agent:write` | Control agents |

### Declaring Permissions

Tools declare required permissions:

```typescript
api.registerTool({
  name: 'fetch_data',
  description: 'Fetch data from API',
  parameters: Type.Object({ url: Type.String() }),
  permissions: ['net:read'],  // Required permissions
  async execute(toolCallId, params, ctx) {
    // Check at runtime
    if (!ctx.hasPermission('net:read')) {
      return { content: 'Permission denied', isError: true };
    }
    // ...
  }
});
```

### Sandbox Configuration

Configure sandbox in your Dash config:

```json
{
  "extensions": {
    "sandbox": {
      "permissions": ["fs:read", "net:read"],
      "blockedPaths": ["~/.ssh", "~/.aws"],
      "allowedHosts": ["api.github.com", "*.example.com"]
    }
  }
}
```

## Hot Reload

Dash automatically reloads extensions when their files change (disabled in production).

### How It Works

1. File watcher monitors extension files
2. Changes trigger re-compilation after debounce delay
3. Extension is reloaded with new code
4. Registered tools/commands are updated

### Configuration

```typescript
const loader = new ExtensionLoader({
  hotReload: {
    enabled: true,      // Enable hot reload
    debounceMs: 500,    // Wait 500ms after last change
    patterns: ['**/*.ts', '**/*.js']
  }
});
```

### Reload Callbacks

```typescript
loader.onReload((result) => {
  console.log(`Reloaded ${result.extensions.length} extensions`);
});
```

## Configuration

Extensions can store and retrieve configuration.

### Using Config API

```typescript
// Set config (automatically prefixed with extension name)
api.setConfig('apiKey', 'secret123');

// Get config (checks environment variables too)
const apiKey = api.getConfig('apiKey', process.env.MY_API_KEY);
```

### Environment Variables

Extensions can read environment variables:

```typescript
const apiKey = process.env.MY_EXTENSION_API_KEY 
  || api.getConfig('apiKey');
```

## Examples

See the `examples/extensions/` directory for complete examples:

- **slack-notifier.ts**: Send Slack notifications on agent events
- **jira-integrator.ts**: Create and update Jira issues
- **custom-deploy.ts**: Deploy services to multiple targets

### Slack Notifier

```typescript
api.on('agent_error', async (event) => {
  const webhook = api.getConfig('webhookUrl');
  if (!webhook) return;
  
  await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: `🚨 Agent ${event.agentId} error: ${event.error}`
    })
  });
});
```

## API Reference

### ExtensionAPI

#### `on(event: string, handler: EventHandler): void`
Subscribe to an event.

#### `registerTool(tool: ToolDefinition): void`
Register a tool for agents to use.

#### `registerCommand(name: string, command: CommandDefinition): void`
Register a CLI command.

#### `log(level, message): void`
Log a message with extension prefix.

#### `getConfig<T>(key: string, defaultValue?: T): T`
Get configuration value.

#### `setConfig<T>(key: string, value: T): void`
Set configuration value.

### TypeBox Types

Use `@sinclair/typebox` for parameter schemas:

```typescript
import { Type } from '@sinclair/typebox';

Type.String()           // String parameter
Type.Number()           // Number parameter
Type.Boolean()          // Boolean parameter
Type.Optional(T)        // Optional parameter
Type.Array(T)           // Array of type
Type.Object({...})      // Object with properties
Type.Union([...])       // Union type
```

### ExtensionLoader

```typescript
import { ExtensionLoader } from '@dash/core/extension-loader';

const loader = new ExtensionLoader({
  paths: ['./my-extensions'],
  hotReload: true,
  sandbox: {
    permissions: ['fs:read'],
    blockedPaths: ['~/.ssh']
  }
});

const result = await loader.load();

// Access loaded extensions
loader.getExtensions();
loader.getTools();
loader.getCommands();

// Emit events
await loader.emitEvent({ type: 'agent_start', agentId: '123', task: 'test' });

// Cleanup
loader.cleanup();
```

## Best Practices

1. **Declare minimal permissions**: Only request permissions your tool actually needs
2. **Handle errors gracefully**: Always return `{ isError: true }` on failures
3. **Use TypeBox for validation**: Define clear parameter schemas
4. **Log appropriately**: Use `api.log()` for debugging
5. **Check permissions at runtime**: Use `ctx.hasPermission()` before restricted operations
6. **Support cancellation**: Respect `ctx.signal` for long-running operations
7. **Keep extensions focused**: One extension per integration/feature
8. **Document your tools**: Clear descriptions help agents use them correctly

## Troubleshooting

### Extension Not Loading

- Check file extension is `.ts` or `.js`
- Ensure default export is a function
- Check Dash logs for compilation errors
- Verify file is in `~/.godel/extensions/`

### Permission Denied

- Add required permissions to sandbox config
- Check tool uses `ctx.hasPermission()` correctly
- Verify permission string format (`resource:action`)

### Hot Reload Not Working

- Ensure `hotReload.enabled: true`
- Check file is being watched (check patterns)
- Verify not in production mode
- Check console for reload errors

## Contributing

To contribute an extension to the community:

1. Create a repository with your extension
2. Add `dash-extension` keyword to package.json
3. Include README with installation instructions
4. Share in Dash community discussions
