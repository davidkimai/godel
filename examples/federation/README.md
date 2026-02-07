# Federation Example

This example demonstrates Godel's multi-instance federation capabilities for scaling across 10-50+ instances.

## Overview

Federation allows you to:
- Distribute workloads across multiple Godel instances
- Route sessions based on health, capacity, and affinity
- Handle instance failures automatically
- Balance load geographically

## Architecture

```
┌─────────────────┐
│  Federation     │
│    Router       │
└────────┬────────┘
         │
    ┌────┴────┬────────┬────────┐
    ▼         ▼        ▼        ▼
┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐
│Inst 1 │ │Inst 2 │ │Inst 3 │ │Inst N │
│(US-W) │ │(US-E) │ │(EU)   │ │(Asia) │
└───────┘ └───────┘ └───────┘ └───────┘
```

## Examples

### 1. Register a Federation Instance

```bash
godel federation register \
  --id us-west-1 \
  --url https://us-west-1.godel.internal \
  --region us-west \
  --capacity 50
```

### 2. List Federation Members

```bash
godel federation list
```

### 3. Using the SDK

```typescript
import { GodelClient, FederationManager } from '@jtan15010/godel';

// Create federation manager
const federation = new FederationManager({
  baseUrl: 'http://localhost:7373',
  apiKey: 'your-api-key'
});

// Register a new instance
await federation.register({
  id: 'eu-west-1',
  url: 'https://eu-west-1.godel.internal',
  region: 'eu-west',
  capacity: { maxAgents: 50, maxTeams: 20 },
  capabilities: ['pi', 'openclaw'],
  labels: { env: 'production', tier: 'standard' }
});

// List all instances
const instances = await federation.list();
for (const instance of instances) {
  console.log(`${instance.id}: ${instance.status} (${instance.region})`);
}
```

### 4. Health-Aware Routing

```typescript
// Route to healthiest instance
const target = await federation.select({
  strategy: 'health',
  preferences: {
    region: 'us-west',
    capabilities: ['pi']
  }
});

// Create agent on selected instance
const agent = await target.agents.spawn({
  role: 'worker',
  model: 'claude-sonnet-4-5'
});
```

### 5. Session Affinity

```typescript
// Keep related sessions on same instance
const result = await federation.execute({
  description: 'Implement feature X',
  affinity: {
    group: 'project-alpha',
    sticky: true  // Prefer same instance for group
  }
});
```

### 6. Geographic Routing

```typescript
// Route based on user location
const result = await federation.execute({
  description: 'Review pull request',
  routing: {
    region: 'eu-west',      // Preferred region
    fallback: ['us-east'],  // Fallback regions
    latency: 'low'          // Optimize for latency
  }
});
```

### 7. Capacity-Based Load Balancing

```typescript
// Distribute based on capacity
const team = await federation.createTeam({
  name: 'distributed-team',
  distribution: {
    strategy: 'capacity',
    spread: 'even',        // Even distribution
    maxPerInstance: 10     // Max agents per instance
  },
  composition: {
    workers: { count: 30 }  // Spread across instances
  }
});
```

### 8. Instance Health Checks

```typescript
// Get health status
const health = await federation.health();

console.log(health);
// {
//   overall: 'healthy',
//   instances: [
//     { id: 'us-west-1', status: 'healthy', load: 0.6 },
//     { id: 'us-east-1', status: 'healthy', load: 0.4 },
//     { id: 'eu-west-1', status: 'degraded', load: 0.9 }
//   ]
// }
```

### 9. Failover Handling

```typescript
// Configure automatic failover
await federation.configure({
  failover: {
    enabled: true,
    healthCheckInterval: 30,    // seconds
    failureThreshold: 3,        // failed checks before marking unhealthy
    recoveryTime: 300,          // seconds before retrying failed instance
    migrateSessions: true       // migrate sessions from failed instance
  }
});
```

### 10. Cross-Instance Task Delegation

```typescript
// Coordinator on one instance delegates to workers on others
const team = await federation.createTeam({
  name: 'cross-instance',
  topology: {
    coordinator: { instance: 'us-west-1' },
    workers: [
      { count: 2, instance: 'us-east-1' },
      { count: 2, instance: 'eu-west-1' },
      { count: 2, instance: 'apac-1' }
    ]
  }
});
```

## Monitoring

```bash
# Watch federation status
godel federation status --watch

# View routing decisions
godel federation routes --follow

# Check instance metrics
godel federation metrics --instance us-west-1
```

## Best Practices

1. **Deploy instances close to users** for low latency
2. **Use session affinity** for related work
3. **Set capacity limits** to prevent overload
4. **Monitor health** and configure automatic failover
5. **Label instances** for targeted routing
