# Basic Swarm Example

Simple examples demonstrating Godel swarm creation and management.

## Overview

This example shows how to create and manage basic agent swarms for common tasks like code review, documentation generation, and testing.

## Files

- `simple-swarm.yaml` - Basic swarm configuration
- `code-review-swarm.yaml` - Code review swarm with multiple agent types
- `parallel-processing.yaml` - Parallel processing example
- `README.md` - This file

## Quick Start

### 1. Simple Swarm

Create a basic swarm with 5 agents:

```bash
godel swarm create --file simple-swarm.yaml
```

Or via CLI:
```bash
godel swarm create \
  --name "simple-swarm" \
  --task "Analyze codebase structure" \
  --initial-agents 5 \
  --strategy parallel
```

### 2. Code Review Swarm

Create a specialized swarm for code review:

```bash
godel swarm create --file code-review-swarm.yaml
```

This creates a swarm with 3 specialized agents:
- Security Agent: Focuses on security vulnerabilities
- Performance Agent: Identifies performance issues
- Style Agent: Checks code style and best practices

### 3. Monitor the Swarm

```bash
# List all swarms
godel swarm list

# Check status
godel swarm status <swarm-id>

# Launch godelboard
godel godelboard
```

### 4. Clean Up

```bash
# Destroy swarm when done
godel swarm destroy <swarm-id>
```

## Configuration Options

### Swarm Strategy

| Strategy | Description | Use Case |
|----------|-------------|----------|
| `parallel` | All agents work independently | Code review, analysis |
| `map-reduce` | Split work, aggregate results | Data processing |
| `pipeline` | Sequential stages | CI/CD workflows |
| `tree` | Hierarchical decomposition | Complex problem solving |

### Budget Configuration

```yaml
spec:
  budget:
    amount: 50.00          # Total budget in USD
    currency: USD
    warningThreshold: 0.75  # Alert at 75%
    criticalThreshold: 0.90 # Stop at 90%
```

### Auto-Scaling

```yaml
spec:
  scaling:
    enabled: true
    minAgents: 2
    maxAgents: 20
    scaleUpThreshold: 10    # Scale up when queue > 10
    scaleDownCooldown: 300  # Wait 5 min before scaling down
```

## Examples in Other Languages

### JavaScript/TypeScript API

```typescript
import { GodelClient } from '@godel/client';

const client = new GodelClient('http://localhost:3000');

// Create swarm
const swarm = await client.swarm.create({
  name: 'my-swarm',
  task: 'Analyze codebase',
  initialAgents: 5,
  strategy: 'parallel',
  budget: {
    amount: 50,
    currency: 'USD'
  }
});

// Monitor
const status = await client.swarm.getStatus(swarm.id);
console.log(`Active agents: ${status.activeAgents}`);

// Destroy when done
await client.swarm.destroy(swarm.id);
```

### cURL

```bash
# Create swarm
curl -X POST http://localhost:3000/api/v1/swarms \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-swarm",
    "task": "Analyze codebase",
    "initialAgents": 5,
    "strategy": "parallel"
  }'

# Get status
curl http://localhost:3000/api/v1/swarms/<swarm-id>

# Destroy
curl -X DELETE http://localhost:3000/api/v1/swarms/<swarm-id>
```

## Troubleshooting

### Swarm not creating agents

Check the logs:
```bash
godel logs tail --swarm <swarm-id>
```

### Budget exceeded

Monitor budget usage:
```bash
godel budget status
```

### Agents stuck

Check agent status:
```bash
godel agents list --swarm <swarm-id>
```

## Next Steps

- Learn about [DAG Workflows](../workflow-dag/)
- Explore [CI/CD Integration](../ci-cd-integration/)
- Build [Custom Agents](../custom-agent/)
