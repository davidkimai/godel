# State Persistence Migration Guide

## Overview

This document describes the migration from in-memory state to database-backed state persistence in Dash.

## Migration Path

### Phase 1: Feature Flags (Backward Compatible)

All state persistence features are controlled by feature flags, allowing gradual rollout:

```typescript
const config = {
  enablePersistence: true,           // Enable persistence layer
  enableRecovery: true,              // Enable automatic recovery
  enableOptimisticLocking: true,     // Enable conflict detection
  enableAuditLog: true,              // Enable audit logging
  featureFlags: {
    useDatabaseSwarms: true,         // Use database for swarms
    useDatabaseAgents: false,        // Keep agents in-memory for now
    useDatabaseSessions: false,      // Keep sessions in-memory for now
  }
};
```

### Phase 2: Dual-Write Mode

When `enablePersistence` is true but feature flags are partially enabled:
- Selected entities are persisted to database
- All entities remain in memory (backward compatibility)
- Recovery loads from database on startup

### Phase 3: Full Migration

Once all feature flags are enabled:
- State is primarily in database
- In-memory state is a cache
- Recovery is automatic

## API Changes

### Before (In-Memory Only)

```typescript
import { SwarmOrchestrator, getGlobalSwarmOrchestrator } from './core/swarm-orchestrator';

const orchestrator = getGlobalSwarmOrchestrator(
  agentLifecycle,
  messageBus,
  storage,
  eventBus,
  sessionTree,
  swarmRepository
);

orchestrator.start();
```

### After (With Persistence)

```typescript
import { 
  createStateAwareOrchestrator,
  getGlobalStateAwareOrchestrator 
} from './core/state-aware-orchestrator';

const orchestrator = await createStateAwareOrchestrator(
  agentLifecycle,
  messageBus,
  storage,
  {
    enablePersistence: true,
    enableRecovery: true,
    featureFlags: {
      useDatabaseSwarms: true,
      useDatabaseAgents: true,
      useDatabaseSessions: true,
    }
  },
  eventBus,
  sessionTree,
  swarmRepository
);

// Start with automatic recovery
const recoveryResult = await orchestrator.start();
console.log(`Recovered ${recoveryResult.swarmsRecovered} swarms, ${recoveryResult.agentsRecovered} agents`);
```

## Recovery Behavior

### Swarm Recovery

| Previous Status | Recovered Status | Action |
|----------------|------------------|--------|
| `creating` | `active` | Resume swarm creation |
| `active` | `active` | Continue normal operation |
| `scaling` | `active` | Resume scaling operations |
| `paused` | `paused` | Remain paused |
| `completed` | `completed` | No action |
| `failed` | `failed` | No action |
| `destroyed` | `destroyed` | No action |

### Agent Recovery

| Previous Lifecycle State | Recovered State | Action |
|-------------------------|-----------------|--------|
| `running` | `failed` | Mark as interrupted, needs restart |
| `spawning` | `failed` | Mark as interrupted, needs restart |
| `paused` | `paused` | Remain paused |
| `retrying` | `retrying` | Resume retry logic |
| `completed` | `completed` | No action |
| `failed` | `failed` | No action |
| `killed` | `killed` | No action |

## Optimistic Locking

When `enableOptimisticLocking` is true, concurrent modifications are prevented:

```typescript
// Version 1: Read swarm
const swarm = await statePersistence.loadSwarm('swarm-123');

// ... some operations ...

// Version 2: Update with version check
await statePersistence.updateSwarmStatus(
  'swarm-123',
  'paused',
  'user-action',
  swarm.version  // Expected version
);

// If another process modified the swarm in between,
// OptimisticLockError is thrown with automatic retry
```

## Audit Log

All state changes are logged when `enableAuditLog` is true:

```typescript
// Get audit log for a swarm
const auditLog = await statePersistence.getAuditLog('swarm-123', {
  limit: 100,
  since: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
});

// Each entry contains:
// - timestamp
// - entity type and ID
// - action performed
// - previous and new state
// - who triggered the change
// - metadata
```

## Rollback

Point-in-time rollback is supported:

```typescript
// Rollback to a specific version
await statePersistence.rollbackToVersion(
  'swarm',
  'swarm-123',
  5,  // Target version
  'admin-rollback'
);

// A checkpoint is automatically created before rollback
const checkpoint = await statePersistence.getLatestCheckpoint('swarm-123');
```

## Migration from Existing In-Memory State

For systems already running with in-memory state:

```typescript
// Migrate all current state to database
const result = await orchestrator.migrateFromMemory();
console.log(`Migrated ${result.swarms} swarms, ${result.agents} agents`);
```

## Database Schema

### New Tables

1. **`state_versions`** - Optimistic locking versions
2. **`swarm_states`** - Persisted swarm state
3. **`agent_states`** - Persisted agent state
4. **`session_states`** - Persisted session metadata
5. **`state_audit_log`** - Audit trail of all changes
6. **`recovery_checkpoints`** - Recovery checkpoints

### Cleanup

Old states are automatically cleaned up:

```typescript
// Clean up completed/failed states older than 24 hours
const result = await statePersistence.cleanup(24);
console.log(`Deleted ${result.swarmsDeleted} swarms, ${result.agentsDeleted} agents`);
```

## Monitoring

### Persistence Statistics

```typescript
const stats = await orchestrator.getPersistenceStats();
console.log(stats);
// {
//   activeSwarms: 10,
//   activeAgents: 50,
//   totalSessions: 25,
//   recentAuditEntries: 150
// }
```

### Recovery Status

```typescript
const recoveryContext = orchestrator.getRecoveryContext();
console.log(`Recovered ${recoveryContext.recoveredSwarms.size} swarms`);
if (recoveryContext.errors.length > 0) {
  console.error('Recovery errors:', recoveryContext.errors);
}
```

## Troubleshooting

### Optimistic Lock Conflicts

If you see many `OptimisticLockError`:
1. Increase `maxLockRetries` in config
2. Increase `baseDelayMs` for slower retry
3. Review concurrent access patterns

### Recovery Failures

If recovery fails:
1. Check database connectivity
2. Review logs for specific entity failures
3. Use `recoveryContext.errors` for details
4. Manually reconcile with checkpoints

### Migration Failures

If migration fails:
1. Check feature flags are set correctly
2. Ensure database is initialized
3. Review logs for specific entity failures
4. Retry migration for failed entities only

## Rollback Plan

If issues arise after migration:

1. **Immediate**: Disable persistence via feature flags
2. **Short-term**: Use in-memory state exclusively
3. **Long-term**: Fix issues and re-enable gradually

```typescript
// Emergency rollback to in-memory only
const orchestrator = await createStateAwareOrchestrator(
  agentLifecycle,
  messageBus,
  storage,
  {
    enablePersistence: false  // Disable completely
  }
);
```
