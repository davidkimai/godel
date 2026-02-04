# PostgreSQL Database Layer

Dash now supports PostgreSQL as the primary persistence layer for swarm/agent/state data.

## Overview

The database layer provides:
- **Connection pooling** with configurable pool sizes
- **Retry logic** for transient failures
- **Full CRUD repositories** for all entities
- **Migration system** for schema versioning
- **Docker Compose** setup for PostgreSQL and Redis

## Quick Start

### 1. Start PostgreSQL and Redis

```bash
npm run db:up
```

Or manually with Docker Compose:
```bash
docker-compose up -d postgres redis
```

### 2. Run Migrations

```bash
npm run migrate
```

### 3. Configure Environment

Update your `.env` file:

```env
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=dash
POSTGRES_USER=dash
POSTGRES_PASSWORD=dash
POSTGRES_SSL=false

# Pool Settings
POSTGRES_MIN_POOL_SIZE=2
POSTGRES_MAX_POOL_SIZE=20
```

## Database Schema

### Tables

| Table | Description |
|-------|-------------|
| `swarms` | Swarm configurations and metadata |
| `agents` | Agent state and lifecycle |
| `events` | Event log (time-series) |
| `sessions` | Session tree data |
| `budgets` | Budget allocation and consumption |
| `_migrations` | Migration tracking |

### Views

| View | Description |
|------|-------------|
| `swarm_summary` | Swarm stats with agent counts and budget |
| `agent_activity` | Agent activity with duration |
| `event_stats_24h` | 24-hour event statistics |

## Repositories

### SwarmRepository

```typescript
import { SwarmRepository } from './src/storage';

const repo = new SwarmRepository();
await repo.initialize();

// Create
const swarm = await repo.create({
  name: 'My Swarm',
  config: { maxAgents: 10 }
});

// Read
const found = await repo.findById(swarm.id);
const all = await repo.list({ limit: 10 });

// Update
await repo.update(swarm.id, { status: 'paused' });

// Delete
await repo.delete(swarm.id);
```

### AgentRepository

```typescript
import { AgentRepository } from './src/storage';

const repo = new AgentRepository();
await repo.initialize();

// Create
const agent = await repo.create({
  swarm_id: swarmId,
  model: 'kimi-k2.5',
  task: 'Build feature'
});

// Update status
await repo.updateStatus(agent.id, 'running');

// Pause/Resume
await repo.pause(agent.id, 'user-123');
await repo.resume(agent.id);

// Lifecycle
await repo.updateLifecycleState(agent.id, 'running');
```

### EventRepository

```typescript
import { EventRepository } from './src/storage';

const repo = new EventRepository();
await repo.initialize();

// Create event
const event = await repo.create({
  type: 'agent.spawned',
  agent_id: agentId,
  swarm_id: swarmId,
  payload: { model: 'kimi-k2.5' }
});

// Query
const events = await repo.findByFilter({
  swarm_id: swarmId,
  types: ['agent.spawned', 'agent.completed'],
  since: new Date(Date.now() - 24 * 60 * 60 * 1000),
  limit: 100
});

// Stats
const stats = await repo.getStats(24);
```

### SessionRepository

```typescript
import { SessionRepository } from './src/storage';

const repo = new SessionRepository();
await repo.initialize();

// Create
const session = await repo.create({
  tree_data: { root: 'main' },
  current_branch: 'main'
});

// Update tree
await repo.updateTreeData(session.id, treeData, 'branch-name');

// Merge metadata
await repo.mergeMetadata(session.id, { key: 'value' });
```

### BudgetRepository

```typescript
import { BudgetRepository } from './src/storage';

const repo = new BudgetRepository();
await repo.initialize();

// Create budget
const budget = await repo.create({
  swarm_id: swarmId,
  scope_type: 'swarm',
  scope_id: swarmId,
  allocated: 100.00,
  currency: 'USD',
  max_tokens: 100000
});

// Consume budget (atomic)
const success = await repo.consumeBudget(budget.id, tokens, cost);
if (!success) {
  console.log('Budget exceeded!');
}

// Get usage
const usage = await repo.getUsage(budget.id);
console.log(`${usage.percentageCost}% used`);
```

## Migrations

### Run Migrations

```bash
npm run migrate
```

### Check Migration Status

```bash
npm run migrate:status
```

### Create New Migration

```bash
npm run migrate:create add_new_feature
```

This creates a new file in `migrations/` with timestamp prefix.

### Migration File Format

```sql
-- Migration: add_new_feature
-- Created: 2026-02-03T12:00:00Z

-- Add your SQL here
ALTER TABLE agents ADD COLUMN new_field TEXT;
```

## Connection Pool Configuration

The pool automatically sizes based on your workload:

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_MIN_POOL_SIZE` | 2 | Minimum connections |
| `POSTGRES_MAX_POOL_SIZE` | 20 | Maximum connections |
| `POSTGRES_CONNECTION_TIMEOUT` | 5000 | Connection timeout (ms) |
| `POSTGRES_IDLE_TIMEOUT` | 30000 | Idle timeout (ms) |
| `POSTGRES_RETRY_ATTEMPTS` | 3 | Retry attempts on failure |
| `POSTGRES_RETRY_DELAY` | 1000 | Delay between retries (ms) |

For 50+ agents, we recommend:
- `POSTGRES_MIN_POOL_SIZE=5`
- `POSTGRES_MAX_POOL_SIZE=50`

## Docker Services

### PostgreSQL
- Image: `postgres:16-alpine`
- Port: `5432`
- Data volume: `postgres_data`

### Redis
- Image: `redis:7-alpine`
- Port: `6379`
- Persistence: AOF enabled

### Optional Tools

**Redis Commander** (Redis UI):
```bash
docker-compose --profile tools up redis-commander
```
Access at http://localhost:8081

**pgAdmin** (PostgreSQL UI):
```bash
docker-compose --profile tools up pgadmin
```
Access at http://localhost:5050

## Testing

### Run Integration Tests

```bash
# Start database
npm run db:up

# Run tests
npm run test:integration:db

# Or all at once
npm run test:db
```

### Test Database

Tests use a separate database by default (`dash_test`). Set via environment:

```env
POSTGRES_DB=dash_test
```

## Troubleshooting

### Connection Refused

```bash
# Check if PostgreSQL is running
docker-compose ps

# Check logs
docker-compose logs postgres

# Restart
docker-compose restart postgres
```

### Migration Failures

```bash
# Check status
npm run migrate:status

# Reset (destructive - data loss!)
docker-compose down -v
npm run db:up
npm run migrate
```

### Pool Exhaustion

If you see "pool is full" errors:
1. Increase `POSTGRES_MAX_POOL_SIZE`
2. Check for connection leaks
3. Enable connection logging

## Migration from SQLite

The SQLite storage layer is preserved for backward compatibility. To migrate:

1. Export SQLite data
2. Start PostgreSQL
3. Run migrations
4. Import data using repositories

Example migration script:

```typescript
import { SQLiteStorage } from './src/storage/sqlite';
import { SwarmRepository, AgentRepository } from './src/storage';

async function migrate() {
  const sqlite = new SQLiteStorage({ dbPath: './dash.db' });
  await sqlite.initialize();
  
  const swarmRepo = new SwarmRepository();
  await swarmRepo.initialize();
  
  // Migrate swarms
  const oldSwarms = await sqlite.getAllSwarms();
  for (const old of oldSwarms) {
    await swarmRepo.create({
      name: old.name,
      config: old.config,
      status: old.status,
    });
  }
}
```
