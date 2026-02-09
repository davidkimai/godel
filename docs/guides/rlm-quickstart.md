# RLM Hypervisor Quick Start Guide

Get up and running with RLM Hypervisor in 5 minutes.

## Prerequisites

- Node.js 18+ or Python 3.9+
- Valid API key ([Get one here](https://rlm-hypervisor.io/signup))
- Basic understanding of JavaScript/TypeScript or Python

## Installation

### Option 1: Using the SDK (Recommended)

**JavaScript/TypeScript:**
```bash
npm install @rlm-hypervisor/sdk
```

**Python:**
```bash
pip install rlm-hypervisor
```

### Option 2: Direct API Access

```bash
curl -H "Authorization: Bearer $API_KEY" \
  https://api.rlm-hypervisor.io/v1/health
```

## Your First Task

### 1. Configure Authentication

Create a `.env` file:
```bash
RLM_API_KEY=your-api-key-here
RLM_REGION=us-west-2
```

### 2. Execute a Simple Task

**JavaScript:**
```typescript
import { RLMClient } from '@rlm-hypervisor/sdk';

const client = new RLMClient({
  apiKey: process.env.RLM_API_KEY,
  region: process.env.RLM_REGION
});

async function main() {
  // Execute a sequential task
  const result = await client.execute({
    type: 'sequential',
    description: 'Simple calculation',
    input: {
      items: [1, 2, 3, 4, 5],
      operation: 'sum'
    }
  });

  console.log('Result:', result.output);
  console.log('Execution time:', result.executionTimeMs, 'ms');
}

main();
```

**Python:**
```python
from rlm_hypervisor import RLMClient
import os

client = RLMClient(
    api_key=os.environ["RLM_API_KEY"],
    region=os.environ["RLM_REGION"]
)

result = client.execute({
    "type": "sequential",
    "description": "Simple calculation",
    "input": {
        "items": [1, 2, 3, 4, 5],
        "operation": "sum"
    }
})

print(f"Result: {result.output}")
print(f"Execution time: {result.execution_time_ms} ms")
```

**Output:**
```json
{
  "output": 15,
  "executionTimeMs": 45,
  "agentCalls": 1,
  "decompositionDepth": 0,
  "success": true
}
```

## Understanding Task Types

### Sequential Tasks
Simple, linear processing. Good for small datasets.

```typescript
const result = await client.execute({
  type: 'sequential',
  description: 'Process items in order',
  input: { items: [1, 2, 3], operation: 'sum' }
});
```

### Parallel Tasks
Process chunks simultaneously. Best for independent operations.

```typescript
const result = await client.execute({
  type: 'parallel',
  description: 'Process in parallel',
  input: {
    items: Array.from({ length: 1000 }, (_, i) => i),
    operation: 'sum',
    chunkSize: 100
  }
});
```

### Recursive Tasks
Auto-decompose large problems. Best for complex, divisible tasks.

```typescript
const result = await client.execute({
  type: 'recursive',
  description: 'Recursively sum large dataset',
  complexity: 'linear',
  input: {
    items: Array.from({ length: 10000 }, (_, i) => i),
    operation: 'sum'
  }
});
```

## Monitoring Tasks

### Check Task Status

```typescript
const status = await client.getTaskStatus(taskId);
console.log(status.progress); // { current: 45, total: 100, percentage: 45 }
```

### Cancel a Task

```typescript
await client.cancelTask(taskId);
```

## Working with Quotas

### Check Your Quotas

```typescript
const quotas = await client.quotas.getStatus();

console.log('Daily agents:', quotas.daily.agentsUsed, '/', quotas.daily.agentsLimit);
console.log('Remaining:', quotas.daily.agentsRemaining);
```

### Set Up Quota Alerts

```typescript
client.on('quota.warning', (event) => {
  console.warn(`Quota at ${event.threshold}%!`);
});
```

## Common Patterns

### Batch Processing

```typescript
const items = Array.from({ length: 100 }, (_, i) => i);

const result = await client.execute({
  type: 'parallel',
  description: 'Batch process items',
  input: { items, operation: 'process', chunkSize: 10 }
});
```

### Error Handling

```typescript
try {
  const result = await client.execute({ /* ... */ });
} catch (error) {
  if (error.code === 'QUOTA_EXCEEDED') {
    console.error('Quota exceeded. Upgrade your plan.');
  } else if (error.code === 'TIMEOUT') {
    console.error('Task timed out. Try increasing timeout.');
  }
}
```

### Progress Tracking

```typescript
const task = await client.execute({ /* ... */ }, {
  onProgress: (progress) => {
    console.log(`${progress.percentage}% complete`);
  }
});
```

## Next Steps

- [Advanced Usage Guide](./rlm-advanced.md) - Complex workflows and optimization
- [Migration Guide](./rlm-migration.md) - Moving from other platforms
- [API Reference](./rlm-api.md) - Complete endpoint documentation
- [Runbooks](../runbooks/rlm-deployment.md) - Production deployment

## Troubleshooting

### Connection Issues
```bash
# Test connectivity
curl -I https://api.rlm-hypervisor.io/v1/health
```

### Authentication Errors
- Verify your API key is correct
- Check token expiration
- Ensure proper environment variable setup

### Quota Errors
- Check current usage: `client.quotas.getStatus()`
- Review your plan limits
- Consider upgrading for higher quotas

### Performance Issues
- Use `recursive` type for large datasets
- Adjust `chunkSize` for parallel tasks
- Set appropriate `timeoutMs`

## Getting Help

- **Documentation:** https://docs.rlm-hypervisor.io
- **Community Forum:** https://community.rlm-hypervisor.io
- **Support:** support@rlm-hypervisor.io
- **Status Page:** https://status.rlm-hypervisor.io
