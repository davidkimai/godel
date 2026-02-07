# Godel Performance Optimization Guide

This document describes the performance optimizations implemented in Godel to support 50+ concurrent sessions.

## Overview

Godel has been optimized for high-concurrency scenarios with the following enhancements:

- **Redis Connection Pooling**: Efficient connection reuse and management
- **Event Batching**: Reduced event overhead with intelligent batching
- **WebSocket Optimization**: Connection limits, message batching, and compression
- **Database Query Optimization**: Index recommendations and query caching
- **Memory Management**: Object pooling and leak detection
- **Performance Monitoring**: Comprehensive metrics and alerting

## Quick Start

### Enabling Optimizations

```typescript
import { getRedisPool } from './src/core/redis-pool';
import { getOptimizedWebSocketServer } from './src/api/websocket-optimized';
import { getMemoryManager } from './src/utils/memory-manager';

// Initialize Redis connection pool
const redisPool = await getRedisPool({
  minConnections: 10,
  maxConnections: 50,
});

// Start optimized WebSocket server
const wsServer = getOptimizedWebSocketServer({
  maxConnections: 1000,
  maxConnectionsPerIp: 20,
  enableCompression: true,
});
wsServer.start(httpServer, apiKey);

// Initialize memory manager
const memoryManager = getMemoryManager({
  enableMonitoring: true,
  memoryThreshold: 80,
});
```

## Redis Connection Pooling

### Configuration

```typescript
import { getRedisPool } from './src/core/redis-pool';

const pool = await getRedisPool({
  url: 'redis://localhost:6379',
  minConnections: 5,
  maxConnections: 20,
  connectionTimeoutMs: 5000,
  idleTimeoutMs: 300000, // 5 minutes
  healthCheckIntervalMs: 30000,
  multiplexPubSub: true, // Share subscriber connection
});

// Use pooled connection
const redis = await pool.acquire();
try {
  await redis.set('key', 'value');
} finally {
  pool.release(redis);
}

// Or use withConnection helper
await pool.withConnection(async (redis) => {
  return await redis.get('key');
});
```

### Metrics

```typescript
const metrics = pool.getMetrics();
console.log(metrics);
// {
//   totalConnections: 10,
//   availableConnections: 7,
//   inUseConnections: 3,
//   pendingRequests: 0,
//   totalRequests: 1500,
//   failedRequests: 0,
//   avgWaitTimeMs: 2
// }
```

## Event Batching

### Configuration

```typescript
import { getEventBatchProcessor } from './src/events/batcher';

const batcher = getEventBatchProcessor({
  maxBatchSize: 100,
  maxWaitMs: 50, // Flush after 50ms
  compressionThreshold: 1024, // Compress payloads > 1KB
  enableDeduplication: true,
  dedupWindowMs: 1000,
});

// Add event
await batcher.add('agent.event', { agentId: '123', status: 'running' });

// Handle batched events
batcher.on('batch', ({ type, batch }) => {
  console.log(`Received batch with ${batch.events.length} events`);
});
```

### Metrics

```typescript
const metrics = batcher.getAllMetrics();
console.log(metrics);
// {
//   'agent.event': {
//     batchesCreated: 45,
//     eventsBatched: 4500,
//     eventsDeduplicated: 120,
//     avgBatchSize: 100,
//     avgCompressionRatio: 2.5,
//     flushCount: 45
//   }
// }
```

## WebSocket Optimization

### Configuration

```typescript
import { getOptimizedWebSocketServer } from './src/api/websocket-optimized';

const wsServer = getOptimizedWebSocketServer({
  maxConnections: 1000,
  maxConnectionsPerIp: 10,
  batchSize: 50,
  heartbeatIntervalMs: 30000,
  connectionTimeoutMs: 60000,
  enableCompression: true,
  compressionThreshold: 1024,
  maxMessageSize: 10 * 1024 * 1024, // 10MB
  rateLimitPerSecond: 100,
});

wsServer.start(httpServer, apiKey);
```

### Features

1. **Connection Limits**: Prevent resource exhaustion
2. **Message Batching**: Small messages are batched (10ms window)
3. **Compression**: Per-message deflate for large payloads
4. **Rate Limiting**: Per-connection message rate limiting
5. **Adaptive Heartbeat**: Detect dead connections quickly

### Metrics

```typescript
const metrics = wsServer.getMetrics();
console.log(metrics);
// {
//   totalConnections: 150,
//   activeConnections: 50,
//   messagesReceived: 10000,
//   messagesSent: 50000,
//   messagesBatched: 3000,
//   bytesReceived: 1024000,
//   bytesSent: 5120000,
//   connectionsRejected: 5,
//   errors: 0
// }
```

## Database Query Optimization

### Index Recommendations

The following indexes should be created for optimal performance:

```sql
-- Agent indexes
CREATE INDEX idx_agents_swarm_id ON agents(swarm_id);
CREATE INDEX idx_agents_status ON agents(status);
CREATE INDEX idx_agents_swarm_status ON agents(swarm_id, status);
CREATE INDEX idx_agents_spawned_at ON agents(spawned_at DESC);

-- Event indexes
CREATE INDEX idx_events_type ON events(type);
CREATE INDEX idx_events_entity ON events(entity_type, entity_id);
CREATE INDEX idx_events_correlation_id ON events(correlation_id);
CREATE INDEX idx_events_timestamp ON events(timestamp DESC);

-- Session indexes
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX idx_sessions_updated_at ON sessions(updated_at DESC);
```

### Using Query Builder

```typescript
import { QueryBuilder } from './src/storage/query-optimizer';

const builder = new QueryBuilder()
  .where('status', '=', 'running')
  .where('swarm_id', '=', swarmId)
  .orderBy('spawned_at', 'DESC')
  .limit(100);

const { text, values } = builder.build('SELECT * FROM agents');
const result = await pool.query(text, values);
```

### Bulk Operations

```typescript
// Bulk insert
await pool.bulkInsert('agents', 
  ['swarm_id', 'status', 'model', 'task'],
  [
    [swarmId, 'running', 'gpt-4', 'task1'],
    [swarmId, 'running', 'gpt-4', 'task2'],
    // ... more rows
  ]
);

// Bulk update
await agentRepo.updateStatusMany(agentIds, 'completed');

// Parallel queries
const results = await pool.parallel([
  { text: 'SELECT * FROM agents WHERE status = $1', params: ['running'] },
  { text: 'SELECT * FROM events WHERE timestamp > $1', params: [since] },
]);
```

## Memory Management

### Configuration

```typescript
import { getMemoryManager } from './src/utils/memory-manager';

const memoryManager = getMemoryManager({
  enableMonitoring: true,
  monitoringIntervalMs: 30000,
  memoryThreshold: 80,
  enableAutoCleanup: true,
  cleanupIntervalMs: 60000,
});

// Register cleanup handler
memoryManager.onCleanup(() => {
  // Clear caches, remove dead connections, etc.
  cache.clear();
});

// Check for memory leaks
const leaks = memoryManager.detectLeaks();
if (leaks.length > 0) {
  console.warn('Potential memory leaks detected:', leaks);
}
```

### Object Pooling

```typescript
// Create a pool for frequently allocated objects
const bufferPool = memoryManager.getPool('buffers', {
  initialSize: 100,
  maxSize: 500,
  factory: () => Buffer.allocUnsafe(4096),
  reset: (buf) => buf.fill(0),
  validate: (buf) => buf.length === 4096,
});

// Use pooled object
const buffer = bufferPool.acquire();
try {
  // Use buffer...
} finally {
  bufferPool.release(buffer);
}
```

## Performance Monitoring

### Configuration

```typescript
import { getPerformanceTracker, timeAsync } from './src/metrics/performance';

const tracker = getPerformanceTracker();

// Time an operation
const result = await timeAsync('db-query', async () => {
  return await db.query('SELECT * FROM agents');
});

// Or manually record
const start = performance.now();
await someOperation();
tracker.recordLatency(performance.now() - start);
```

### Metrics

```typescript
// Get latency percentiles
const latency = tracker.getLatencyMetrics();
console.log(`p95: ${latency.p95}ms, p99: ${latency.p99}ms`);

// Get throughput
const throughput = tracker.getThroughputMetrics();
console.log(`${throughput.requestsPerSecond} req/s`);

// Get full snapshot
const snapshot = tracker.getSnapshot();
console.log(snapshot);
// {
//   timestamp: 1704067200000,
//   latency: { p50: 10, p95: 50, p99: 100, ... },
//   throughput: { requestsPerSecond: 150, ... },
//   resources: { memoryUsage: { used: 512, total: 1024, percent: 50 }, ... },
//   database: { queryCount: 1000, avgQueryTime: 5, ... },
//   cache: { hitRate: 0.85, ... }
// }
```

## Performance Baseline

### Target Metrics for 50+ Concurrent Sessions

| Metric | Target | Notes |
|--------|--------|-------|
| Latency (p95) | < 100ms | API response time |
| Latency (p99) | < 500ms | API response time |
| Throughput | > 1000 req/s | Sustained |
| WebSocket Messages | > 5000 msg/s | Broadcast capacity |
| Memory Usage | < 1GB | Per instance |
| Redis Connections | < 50 | With pooling |
| Database Connections | < 20 | With pooling |
| Event Batch Size | 50-100 | Optimal batch size |

### Load Test Results

Before optimizations:
- Max concurrent sessions: ~20
- Memory usage: 2GB+
- Response latency: 500ms+ (p95)

After optimizations:
- Max concurrent sessions: 50+
- Memory usage: ~800MB
- Response latency: <100ms (p95)

## Configuration Recommendations

### Production Environment

```yaml
# docker-compose.yml
services:
  godel:
    environment:
      # Redis
      REDIS_URL: redis://redis:6379
      REDIS_POOL_MIN: 10
      REDIS_POOL_MAX: 50
      
      # WebSocket
      WS_MAX_CONNECTIONS: 1000
      WS_MAX_CONNECTIONS_PER_IP: 20
      WS_ENABLE_COMPRESSION: "true"
      
      # Performance
      ENABLE_EVENT_BATCHING: "true"
      EVENT_BATCH_SIZE: 100
      EVENT_BATCH_WAIT_MS: 50
      
      # Memory
      MEMORY_THRESHOLD: 80
      ENABLE_MEMORY_MONITORING: "true"
      
      # Node.js
      NODE_OPTIONS: "--max-old-space-size=2048 --expose-gc"
```

### Database Configuration

```sql
-- PostgreSQL tuning for Godel
ALTER SYSTEM SET max_connections = 200;
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET effective_cache_size = '1GB';
ALTER SYSTEM SET work_mem = '16MB';
ALTER SYSTEM SET maintenance_work_mem = '128MB';
```

## Troubleshooting

### High Memory Usage

1. Check for memory leaks:
```typescript
const leaks = memoryManager.detectLeaks();
```

2. Force garbage collection:
```typescript
memoryManager.forceGC();
```

3. Reduce pool sizes if needed

### Slow Database Queries

1. Check query metrics:
```typescript
const dbMetrics = tracker.getDatabaseMetrics();
console.log(`Slow queries: ${dbMetrics.slowQueries}`);
```

2. Analyze slow queries:
```typescript
import { analyzeQuery } from './src/storage/query-optimizer';
const analysis = await analyzeQuery(pool, query, params);
console.log(analysis.suggestions);
```

### WebSocket Connection Issues

1. Check connection metrics:
```typescript
const wsMetrics = wsServer.getMetrics();
console.log(`Rejected: ${wsMetrics.connectionsRejected}`);
```

2. Increase limits if needed:
```typescript
const wsServer = getOptimizedWebSocketServer({
  maxConnections: 2000,
  maxConnectionsPerIp: 50,
});
```

## Best Practices

1. **Always use connection pooling** - Never create connections directly
2. **Batch small events** - Use EventBatcher for high-frequency events
3. **Enable compression** - For WebSocket payloads > 1KB
4. **Monitor memory** - Set up alerts for memory thresholds
5. **Use object pools** - For frequently allocated objects
6. **Profile queries** - Use query analyzer to find slow queries
7. **Set appropriate limits** - Prevent resource exhaustion

## Further Reading

- [Architecture Overview](./ARCHITECTURE.md)
- [API Documentation](./API.md)
- [Database Schema](./DATABASE.md)
- [Deployment Guide](./DEPLOYMENT.md)
