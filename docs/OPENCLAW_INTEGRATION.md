# OpenClaw Integration Guide

## Overview

The OpenClaw integration enables OpenClaw to use Dash as its native orchestration platform. This allows OpenClaw users to spawn and manage Dash agent swarms directly from OpenClaw, with real-time event streaming between the two platforms.

## Architecture

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│   OpenClaw  │ ───► │   Adapter    │ ───► │    Dash     │
│  (sessions) │      │  (Protocol   │      │   (swarms)  │
│             │ ◄─── │  Translation)│ ◄─── │             │
└─────────────┘      └──────────────┘      └─────────────┘
        │                                            │
        │         ┌──────────────┐                   │
        └────────►│ Event Bridge │◄──────────────────┘
                  │ (Real-time   │
                  │  streaming)  │
                  └──────────────┘
```

### Components

1. **OpenClaw Adapter** - Translates OpenClaw protocol to Dash API
2. **Event Bridge** - Real-time event streaming from Dash to OpenClaw
3. **Dash Orchestration Skill** - OpenClaw-native commands for Dash

## Quick Start

### 1. Configure Environment Variables

Add to your `.env` file:

```bash
# Required
DASH_API_URL=http://localhost:7373
DASH_API_KEY=dash_live_your_64_character_hex_key_here

# OpenClaw Integration
OPENCLAW_DASH_ADAPTER_ENABLED=true
OPENCLAW_EVENT_WEBHOOK_URL=https://your-openclaw-instance.com/webhooks/dash
```

### 2. Generate API Key

```bash
# Generate a secure API key
node -e "console.log('dash_live_' + require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Start Dash

```bash
npm run start
```

### 4. Test the Integration

```bash
# Spawn a test agent
curl -X POST http://localhost:7373/api/v1/agents \
  -H "Authorization: Bearer $DASH_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "code-review",
    "task": "Review the codebase",
    "model": "claude-3"
  }'
```

## Configuration Reference

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DASH_API_URL` | Yes | - | URL of the Dash API |
| `DASH_API_KEY` | Yes | - | API key for authentication |
| `OPENCLAW_DASH_ADAPTER_ENABLED` | No | `true` | Enable the adapter |
| `OPENCLAW_EVENT_WEBHOOK_URL` | No | - | Webhook URL for events |
| `OPENCLAW_EVENT_FILTER` | No | - | Comma-separated event types to forward |

### Adapter Configuration

```typescript
interface OpenClawAdapterConfig {
  dashApiUrl: string;
  dashApiKey: string;
  openclawSessionKey: string;
  eventWebhookUrl?: string;
}
```

### Event Bridge Configuration

```typescript
interface EventBridgeConfig {
  webhookUrl: string;
  filter?: string[];           // Event types to forward
  authToken?: string;          // Webhook auth token
  batchInterval?: number;      // Batch events (ms, 0 = immediate)
  maxBatchSize?: number;       // Max events per batch
  retryConfig?: {
    maxRetries: number;
    retryDelay: number;
  };
}
```

## Usage Examples

### From OpenClaw

```
# Spawn a code review swarm
/dash spawn code-review --files "src/**/*.ts" --agents 5

# Check status
/dash status agent-abc123

# View logs
/dash logs agent-abc123 --follow

# Kill agent
/dash kill agent-abc123 --force

# List all agents
/dash list
```

### From JavaScript/TypeScript

```typescript
import { getOpenClawAdapter } from '@dash/integrations/openclaw';

const adapter = getOpenClawAdapter({
  dashApiUrl: 'http://localhost:7373',
  dashApiKey: 'your-api-key',
  openclawSessionKey: 'session-123',
});

// Spawn agent
const result = await adapter.spawnAgent('session-123', {
  agentType: 'code-review',
  task: 'Review PR #123',
  model: 'claude-3',
});

// Send message
await adapter.sendMessage('session-123', 'Focus on security issues');

// Get status
const status = await adapter.getStatus('session-123');
console.log(status.progress); // 50

// Kill agent
await adapter.killAgent('session-123');
```

### Event Streaming

```typescript
import { getOpenClawEventBridge } from '@dash/integrations/openclaw';

const bridge = getOpenClawEventBridge({
  webhookUrl: 'https://your-webhook.com/events',
  filter: ['agent.spawned', 'agent.completed', 'agent.failed'],
  authToken: 'webhook-auth-token',
});

await bridge.start();

// Subscribe to specific agent events
bridge.subscribeToAgent('agent-123', (event) => {
  console.log('Agent event:', event.type, event.data);
});

// Subscribe to specific event types
bridge.subscribeToEventTypes(['agent.completed'], (event) => {
  console.log('Agent completed:', event.metadata.dashAgentId);
});
```

## API Reference

### OpenClawAdapter

#### Methods

| Method | Description | Parameters |
|--------|-------------|------------|
| `spawnAgent()` | Spawn a new agent | `sessionKey`, `options` |
| `sendMessage()` | Send message to agent | `sessionKey`, `message` |
| `killAgent()` | Terminate an agent | `sessionKey`, `force?` |
| `getStatus()` | Get agent status | `sessionKey` |
| `listAgents()` | List active agents | - |
| `dispose()` | Cleanup all resources | - |

#### Events

| Event | Description | Payload |
|-------|-------------|---------|
| `agent.event` | Agent event forwarded | `OpenClawEvent` |

### OpenClawEventBridge

#### Methods

| Method | Description | Parameters |
|--------|-------------|------------|
| `start()` | Start event forwarding | - |
| `stop()` | Stop event forwarding | - |
| `restart()` | Restart the bridge | - |
| `getStats()` | Get bridge statistics | - |
| `getHealth()` | Get health status | - |
| `resetStats()` | Reset statistics | - |

#### Events

| Event | Description | Payload |
|-------|-------------|---------|
| `started` | Bridge started | - |
| `stopped` | Bridge stopped | - |
| `event` | Event received | `BridgedEvent` |
| `forwarded` | Event forwarded | `BridgedEvent` |
| `error` | Forward error | `{ event, error }` |

## Event Format

### Dash to OpenClaw Event

```json
{
  "source": "dash",
  "type": "agent.spawned",
  "timestamp": "2026-02-03T10:00:00Z",
  "sessionKey": "openclaw-session-123",
  "data": {
    "eventType": "agent.spawned",
    "agentId": "agent-abc123",
    "task": "Review PR"
  },
  "metadata": {
    "dashAgentId": "agent-abc123",
    "dashSwarmId": "swarm-xyz789",
    "topic": "agent.agent-abc123.events"
  }
}
```

## Troubleshooting

### Connection Issues

**Problem**: `Connection refused` when connecting to Dash

**Solutions**:
1. Verify Dash is running: `curl http://localhost:7373/health`
2. Check `DASH_API_URL` is correct
3. Verify network connectivity between OpenClaw and Dash
4. Check firewall rules

### Authentication Errors

**Problem**: `Unauthorized` or `401 Unauthorized`

**Solutions**:
1. Verify `DASH_API_KEY` is set correctly
2. Check API key format (should start with `dash_`)
3. Ensure key has not expired
4. Verify key has required permissions

### Agent Spawn Failures

**Problem**: Agents fail to spawn

**Solutions**:
1. Check Dash logs: `docker-compose logs dash`
2. Verify sufficient resources (memory, CPU)
3. Check if requested model is available
4. Review task description validity
5. Check swarm limits not exceeded

### Event Streaming Issues

**Problem**: Events not being received by OpenClaw

**Solutions**:
1. Verify `OPENCLAW_EVENT_WEBHOOK_URL` is configured
2. Check webhook endpoint is accessible from Dash
3. Review webhook server logs
4. Check event filter configuration
5. Verify webhook authentication token

### Performance Issues

**Problem**: Slow response times

**Solutions**:
1. Enable event batching: `batchInterval: 1000`
2. Reduce event filter scope
3. Check database connection pool
4. Monitor resource usage
5. Scale Dash horizontally if needed

## Testing

### Run Integration Tests

```bash
# Run all OpenClaw tests
npm test -- --testPathPattern=openclaw

# Run specific test file
npm test -- tests/integrations/openclaw/adapter.test.ts
npm test -- tests/integrations/openclaw/event-bridge.test.ts
npm test -- tests/integrations/openclaw/integration.test.ts

# Run with coverage
npm test -- --testPathPattern=openclaw --coverage
```

### Manual Testing

```bash
# 1. Start Dash
npm run start

# 2. Configure OpenClaw with Dash skill
openclaw config set DASH_API_URL http://localhost:7373
openclaw config set DASH_API_KEY your-api-key

# 3. Spawn agent from OpenClaw
openclaw /dash spawn code-review --task "Review this code"

# 4. Verify agent spawned in Dash
swarmctl agent list

# 5. Watch events flow
# Events should appear in OpenClaw

# 6. Kill agent
openclaw /dash kill agent-xyz
```

## Security Considerations

### API Key Security

- Store API keys in environment variables, never in code
- Rotate keys regularly
- Use different keys for different environments
- Monitor key usage for suspicious activity

### Webhook Security

- Use HTTPS for webhook URLs
- Implement webhook authentication
- Verify webhook signatures if available
- Rate limit webhook endpoints

### Network Security

- Use internal networks when possible
- Implement proper firewall rules
- Use VPN for cross-datacenter communication
- Enable TLS for all connections

## Migration Guide

### From Direct Dash API

If you're currently using the Dash API directly:

1. Replace direct API calls with adapter methods
2. Add session-to-agent mapping
3. Configure event forwarding
4. Update error handling

### From Other Orchestrators

When migrating from other orchestration platforms:

1. Map existing agent types to Dash equivalents
2. Convert configuration formats
3. Set up event bridge for monitoring
4. Test thoroughly before production

## Contributing

To contribute to the OpenClaw integration:

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Update documentation
5. Submit a pull request

## Support

For support and questions:

- GitHub Issues: [github.com/your-org/dash/issues](https://github.com/your-org/dash/issues)
- Documentation: [docs.dash.dev/openclaw](https://docs.dash.dev/openclaw)
- Discord: [dash.dev/discord](https://dash.dev/discord)

## License

MIT License - See LICENSE file for details
