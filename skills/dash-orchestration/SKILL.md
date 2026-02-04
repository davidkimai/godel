# Dash Orchestration Skill

## Description

Spawn and manage agent swarms using Dash from within OpenClaw. This skill provides native OpenClaw commands for Dash orchestration, enabling seamless integration between the two platforms.

## Capabilities

- **Spawn** - Create and launch agent swarms for various tasks
- **Status** - Monitor agent and swarm progress in real-time
- **Kill** - Terminate agents gracefully or forcefully
- **Logs** - Stream logs from agents
- **List** - View all active Dash-managed agents

## Installation

```bash
# Copy skill to OpenClaw skills directory
cp -r skills/dash-orchestration /path/to/openclaw/skills/

# Configure environment variables
export DASH_API_URL=http://localhost:7373
export DASH_API_KEY=your_api_key_here
```

## Configuration

Add to your OpenClaw configuration:

```yaml
skills:
  - name: dash-orchestration
    path: /path/to/openclaw/skills/dash-orchestration
    config:
      dash_api_url: http://dash:7373
      dash_api_key: ${DASH_API_KEY}
```

### Required Environment Variables

- `DASH_API_URL` - URL of the Dash API (default: http://localhost:7373)
- `DASH_API_KEY` - API key for Dash authentication

### Optional Environment Variables

- `OPENCLAW_DASH_ADAPTER_ENABLED` - Enable the adapter (default: true)
- `OPENCLAW_EVENT_WEBHOOK_URL` - Webhook URL for event streaming
- `DASH_DEFAULT_TIMEOUT` - Default agent timeout in ms (default: 300000)

## Usage

### Spawn a Swarm

Spawn a new agent swarm for a specific task:

```
/dash spawn code-review --files "src/**/*.ts"
```

Options:
- `--agents, -a` - Number of agents to spawn (default: 1)
- `--strategy, -s` - Swarm strategy: parallel, sequential, or pipeline (default: parallel)
- `--model, -m` - Model to use for agents
- `--timeout, -t` - Timeout in milliseconds (default: 300000)

### Check Status

Get the current status of an agent:

```
/dash status agent-abc123
```

### Kill an Agent

Terminate a running agent:

```
/dash kill agent-abc123 --force
```

Options:
- `--force, -f` - Force kill without graceful shutdown

### View Logs

Stream logs from an agent:

```
/dash logs agent-abc123 --follow --lines 100
```

Options:
- `--follow, -f` - Follow logs in real-time
- `--lines, -n` - Number of lines to show (default: 50)

### List Active Agents

Show all active Dash-managed agents:

```
/dash list
```

## Examples

### Code Review Swarm

Spawn 5 agents to review code in parallel:

```
/dash spawn code-review \
  --agents 5 \
  --strategy parallel \
  --files "src/**/*.ts" \
  --model claude-3-sonnet
```

### Security Audit

Run comprehensive security audit:

```
/dash spawn security-audit \
  --scope full \
  --tools dependency,static,secrets \
  --timeout 600000
```

### Refactoring Task

Spawn agents to refactor a codebase:

```
/dash spawn refactoring \
  --agents 3 \
  --strategy pipeline \
  --task "Migrate from callbacks to async/await" \
  --files "src/**/*.js"
```

### Testing Swarm

Run tests across multiple configurations:

```
/dash spawn testing \
  --agents 4 \
  --strategy parallel \
  --browsers chrome,firefox,safari,edge \
  --suites "tests/e2e/**/*.spec.ts"
```

## Events

The skill emits the following events:

- `dash.agent.spawned` - When an agent is spawned
- `dash.agent.status` - Status updates from agents
- `dash.agent.completed` - When an agent completes
- `dash.agent.failed` - When an agent fails
- `dash.agent.killed` - When an agent is killed

## Troubleshooting

### Connection Issues

If you see "Connection refused" errors:

1. Verify Dash is running: `curl http://localhost:7373/health`
2. Check `DASH_API_URL` is correct
3. Verify network connectivity between OpenClaw and Dash

### Authentication Errors

If you see "Unauthorized" errors:

1. Verify `DASH_API_KEY` is set correctly
2. Check the API key format (should start with `dash_`)
3. Ensure the key has not expired

### Agent Spawn Failures

If agents fail to spawn:

1. Check Dash logs: `docker-compose logs dash`
2. Verify sufficient resources (memory, CPU)
3. Check if the requested model is available
4. Review the task description for validity

### Event Streaming Issues

If events are not being received:

1. Verify `OPENCLAW_EVENT_WEBHOOK_URL` is configured
2. Check webhook endpoint is accessible
3. Review firewall rules
4. Check event filter configuration

## Advanced Usage

### Custom Swarm Configurations

Create custom swarm configurations in Dash:

```typescript
// swarm-config.ts
export default {
  name: 'custom-swarm',
  strategy: 'pipeline',
  stages: [
    { name: 'analyze', agents: 2 },
    { name: 'process', agents: 5 },
    { name: 'verify', agents: 1 },
  ],
};
```

### Event Filtering

Filter events to reduce noise:

```yaml
config:
  event_filter:
    - agent.spawned
    - agent.completed
    - agent.failed
```

### Webhook Authentication

Secure webhook endpoints:

```yaml
config:
  webhook_auth:
    type: bearer
    token: ${WEBHOOK_AUTH_TOKEN}
```

## API Reference

### Commands

| Command | Description | Arguments |
|---------|-------------|-----------|
| `spawn` | Spawn a new swarm | `type`, `--agents`, `--strategy`, `--model`, `--timeout` |
| `status` | Get agent status | `agentId` |
| `kill` | Kill an agent | `agentId`, `--force` |
| `logs` | Stream agent logs | `agentId`, `--follow`, `--lines` |
| `list` | List active agents | none |

### Response Format

All commands return JSON responses:

```json
{
  "success": true,
  "data": {
    "agentId": "agent-abc123",
    "status": "running",
    "progress": 45
  }
}
```

Error responses:

```json
{
  "success": false,
  "error": {
    "code": "AGENT_NOT_FOUND",
    "message": "Agent agent-abc123 not found"
  }
}
```

## Contributing

To contribute to this skill:

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Submit a pull request

## License

MIT License - See LICENSE file for details
