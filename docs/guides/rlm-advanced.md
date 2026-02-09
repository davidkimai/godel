# RLM Hypervisor Advanced Usage Guide

Master advanced features and optimization techniques for production workloads.

## Table of Contents

1. [Advanced Task Configuration](#advanced-task-configuration)
2. [Recursive Decomposition Strategies](#recursive-decomposition-strategies)
3. [Performance Optimization](#performance-optimization)
4. [Error Handling & Retries](#error-handling--retries)
5. [Resource Management](#resource-management)
6. [Security Best Practices](#security-best-practices)
7. [Enterprise Features](#enterprise-features)
8. [Monitoring & Observability](#monitoring--observability)

---

## Advanced Task Configuration

### Custom Decomposition Logic

```typescript
const result = await client.execute({
  type: 'recursive',
  description: 'Custom recursive processing',
  complexity: 'quadratic',
  input: {
    items: largeDataset,
    operation: 'custom_merge',
    // Custom decomposition parameters
    decompositionStrategy: {
      maxDepth: 10,
      minChunkSize: 100,
      branchingFactor: 4
    }
  },
  options: {
    maxDepth: 10,
    timeoutMs: 300000, // 5 minutes
    priority: 'high'
  }
});
```

### Conditional Execution

```typescript
const result = await client.execute({
  type: 'sequential',
  description: 'Conditional processing',
  input: {
    items: data,
    operation: 'conditional_process',
    conditions: {
      skipIfEmpty: true,
      validateBeforeProcess: true,
      earlyTerminationThreshold: 0.95
    }
  }
});
```

---

## Recursive Decomposition Strategies

### Strategy 1: Binary Split (Default)

Best for: Balanced trees, divide-and-conquer algorithms

```typescript
{
  type: 'recursive',
  complexity: 'linear',
  input: {
    items: data,
    operation: 'sum'
    // Binary split: items.length / 2
  }
}
```

**Complexity:** O(n log n)  
**Memory:** O(log n) stack depth

### Strategy 2: N-Way Split

Best for: Wide parallelism, map-reduce patterns

```typescript
{
  type: 'recursive',
  complexity: 'linear',
  input: {
    items: data,
    operation: 'aggregate',
    splitFactor: 8 // Split into 8 subtasks
  }
}
```

**Complexity:** O(n log₈n)  
**Memory:** O(log₈n) stack depth

### Strategy 3: Adaptive Split

Best for: Heterogeneous workloads, dynamic load balancing

```typescript
{
  type: 'recursive',
  complexity: 'quadratic',
  input: {
    items: data,
    operation: 'complex_process',
    adaptiveSplit: {
      minChunkSize: 50,
      maxChunkSize: 500,
      targetExecutionTimeMs: 1000
    }
  }
}
```

**Complexity:** O(n²) worst case, optimized for actual workload

---

## Performance Optimization

### 1. Optimize Chunk Sizes

```typescript
// Too small = overhead, too large = underutilization
const optimalChunkSize = estimateOptimalChunkSize({
  totalItems: 10000,
  estimatedItemProcessingTimeMs: 5,
  targetParallelism: 8
}); // Returns ~1250

const result = await client.execute({
  type: 'parallel',
  input: {
    items: data,
    operation: 'process',
    chunkSize: optimalChunkSize
  }
});
```

### 2. Batching Multiple Operations

```typescript
// Instead of N sequential calls
const results = await client.batchExecute([
  { type: 'sequential', description: 'Task 1', input: data1 },
  { type: 'sequential', description: 'Task 2', input: data2 },
  { type: 'sequential', description: 'Task 3', input: data3 }
]);
```

### 3. Connection Pooling

```typescript
const client = new RLMClient({
  apiKey: process.env.RLM_API_KEY,
  connectionPool: {
    minConnections: 5,
    maxConnections: 20,
    keepAlive: true
  }
});
```

### 4. Caching Strategies

```typescript
// Enable result caching for deterministic operations
const result = await client.execute({
  type: 'recursive',
  description: 'Expensive computation',
  input: data,
  options: {
    cacheResults: true,
    cacheTtlSeconds: 3600
  }
});
```

### 5. Pre-warming

```typescript
// Pre-warm the execution environment
await client.prewarm({
  agentCount: 10,
  durationSeconds: 300
});
```

---

## Error Handling & Retries

### Exponential Backoff

```typescript
const result = await client.executeWithRetry({
  type: 'recursive',
  description: 'Critical task',
  input: data
}, {
  maxRetries: 5,
  backoffMultiplier: 2,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  retryableErrors: ['TIMEOUT', 'RATE_LIMITED', 'SERVICE_UNAVAILABLE']
});
```

### Circuit Breaker Pattern

```typescript
const breaker = client.createCircuitBreaker({
  failureThreshold: 5,
  recoveryTimeoutMs: 30000,
  halfOpenMaxCalls: 3
});

try {
  const result = await breaker.execute(() =>
    client.execute({ type: 'recursive', input: data })
  );
} catch (error) {
  if (error.code === 'CIRCUIT_OPEN') {
    // Fallback to degraded mode
    console.warn('Service unavailable, using fallback');
  }
}
```

### Partial Failure Handling

```typescript
const result = await client.execute({
  type: 'parallel',
  input: {
    items: largeDataset,
    operation: 'process'
  },
  options: {
    continueOnError: true,
    errorThreshold: 0.1 // Allow up to 10% failures
  }
});

// Access partial results
console.log('Successful:', result.output.successful.length);
console.log('Failed:', result.output.failed.length);
console.log('Failure rate:', result.output.failureRate);
```

---

## Resource Management

### Dynamic Resource Allocation

```typescript
// Automatically scale based on workload
const session = await client.createSession({
  autoScale: {
    minAgents: 2,
    maxAgents: 50,
    targetCpuUtilization: 70,
    scaleUpThreshold: 80,
    scaleDownThreshold: 30
  }
});

const result = await session.execute({
  type: 'recursive',
  input: massiveDataset
});

await session.close();
```

### Resource Quotas

```typescript
// Enforce resource limits per session
const session = await client.createSession({
  resourceLimits: {
    maxAgents: 20,
    maxComputeHours: 100,
    maxStorageGB: 50,
    maxExecutionTimeMs: 600000
  }
});
```

### Priority Scheduling

```typescript
// High priority tasks preempt lower priority
const criticalResult = await client.execute({
  type: 'recursive',
  description: 'Critical analysis',
  input: urgentData,
  options: {
    priority: 'critical',
    preemptLowerPriority: true
  }
});
```

---

## Security Best Practices

### Input Sanitization

```typescript
// Client-side validation
const sanitizedInput = client.sanitizeInput(userInput, {
  maxLength: 10000,
  allowedTags: [],
  escapeSql: true
});

const result = await client.execute({
  type: 'sequential',
  input: sanitizedInput
});
```

### Audit Logging

```typescript
const result = await client.execute({
  type: 'recursive',
  input: sensitiveData,
  options: {
    auditLevel: 'detailed',
    logInput: false, // Don't log sensitive input
    logOutput: false, // Don't log sensitive output
    logMetadata: true // Log execution metadata
  }
});
```

### Encryption

```typescript
// Client-side encryption for sensitive data
const encrypted = await client.encrypt(sensitiveData, {
  algorithm: 'AES-256-GCM',
  keyId: 'user-key-123'
});

const result = await client.execute({
  type: 'recursive',
  input: encrypted,
  options: {
    encryptedInput: true
  }
});
```

---

## Enterprise Features

### Multi-Organization Management

```typescript
// Enterprise admin operations
const enterprise = client.enterprise();

// Create organization
const org = await enterprise.createOrganization({
  name: 'Engineering Team',
  quotas: {
    agents: 1000,
    computeHours: 10000,
    storageGB: 5000
  }
});

// Set up organization hierarchy
await enterprise.setHierarchy({
  parentOrgId: 'org-engineering',
  childOrgIds: ['org-frontend', 'org-backend', 'org-ml']
});
```

### Custom Policies

```typescript
// Define custom security policies
await enterprise.createPolicy({
  name: 'Business Hours Only',
  type: 'time_based',
  rules: [{
    condition: 'time_of_day',
    operator: 'not_in',
    value: ['09:00-17:00'],
    action: 'deny'
  }]
});
```

### Compliance Reporting

```typescript
// Generate compliance reports
const report = await enterprise.generateComplianceReport({
  framework: 'SOC2',
  startDate: new Date('2024-01-01'),
  endDate: new Date('2024-03-31'),
  includeEvidence: true
});

console.log('Overall compliance:', report.overallStatus);
console.log('Findings:', report.findings.length);
```

---

## Monitoring & Observability

### Custom Metrics

```typescript
// Track custom business metrics
const result = await client.execute({
  type: 'recursive',
  input: data,
  options: {
    emitMetrics: {
      'business.records_processed': data.length,
      'business.domain': 'analytics'
    }
  }
});
```

### Distributed Tracing

```typescript
// Enable distributed tracing
const client = new RLMClient({
  apiKey: process.env.RLM_API_KEY,
  tracing: {
    enabled: true,
    sampleRate: 0.1,
    exporter: 'jaeger'
  }
});

// Trace ID propagated through execution
const result = await client.execute({
  type: 'recursive',
  input: data,
  options: {
    traceContext: {
      traceId: 'abc123',
      parentSpanId: 'span456'
    }
  }
});
```

### Health Checks

```typescript
// Health check with detailed diagnostics
const health = await client.healthCheck({
  detailed: true
});

console.log('Status:', health.status);
console.log('Quotas:', health.quotas);
console.log('Latency:', health.latencyMs);
```

### Alerting Integration

```typescript
// Set up custom alerts
client.on('execution.slow', (event) => {
  if (event.executionTimeMs > 30000) {
    pagerDuty.trigger({
      severity: 'warning',
      message: `Slow execution: ${event.taskId}`
    });
  }
});
```

---

## Best Practices Summary

1. **Choose the right task type:** Sequential for simple, Parallel for independent, Recursive for complex
2. **Optimize chunk sizes:** Balance overhead vs utilization
3. **Use caching:** For deterministic, expensive operations
4. **Implement retries:** With exponential backoff for transient failures
5. **Set appropriate timeouts:** Consider worst-case execution time
6. **Monitor quotas:** Implement alerting before limits
7. **Sanitize inputs:** Always validate and sanitize user input
8. **Use priority levels:** For mixed criticality workloads
9. **Enable tracing:** For debugging and performance analysis
10. **Regular health checks:** Detect issues before they impact users

---

## Additional Resources

- [Production Runbooks](../runbooks/rlm-monitoring.md)
- [API Reference](./rlm-api.md)
- [Migration Guide](./rlm-migration.md)
- [Security Hardening](../../security/hardening/rlm-hardening.ts)
