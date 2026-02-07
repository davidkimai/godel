# TECHSPEC-002: PostgreSQL Integration

**Version:** 1.0.0
**Created:** 2026-02-04
**Status:** DRAFT
**Priority:** HIGH

## Problem Statement

API endpoints return 500 errors with "Database not initialized" because PostgreSQL is not running.

### Test Evidence

```
API Test: GET /api/v1/agents
Response: 500 Internal Server Error
Error: Database not initialized

API Test: POST /api/v1/team
Response: 500 Internal Server Error
Error: Database not initialized
```

## Root Cause Analysis

### Finding 1: PostgreSQL Not Running

The API server expects a PostgreSQL database, but it's not started.

### Finding 2: Missing Configuration

```yaml
# Current config expects PG
database:
  type: postgresql
  host: localhost
  port: 5432
```

### Finding 3: Environment Variables Not Set

```
POSTGRES_URL not defined
DATABASE_URL not defined
```

## Technical Requirements

### Option 1: Use PostgreSQL (Production)

**Pros:**
- Full relational features
- Better concurrency
- Production-ready
- Team can scale

**Cons:**
- Requires PG installation
- More complex setup
- Slower for development

### Option 2: Use SQLite (Development)

**Pros:**
- No installation needed
- Faster development
- Works out of box

**Cons:**
- Limited features
- Not production-ready

### Recommendation: Hybrid Approach

Use SQLite for development/testing, PostgreSQL for production.

```typescript
// src/storage/index.ts

import { SQLiteStorage } from './sqlite';
import { PostgresStorage } from './postgres';

export type Storage = SQLiteStorage | PostgresStorage;

export function createStorage(config: {
  type: 'sqlite' | 'postgres';
  url?: string;
  path?: string;
}): Storage {
  switch (config.type) {
    case 'sqlite':
      return new SQLiteStorage(config.path || './godel.db');
    case 'postgres':
      return new PostgresStorage(config.url!);
    default:
      return new SQLiteStorage('./godel.db');
  }
}
```

## Implementation Plan

### Phase 1: Environment Detection

```bash
# Check if PostgreSQL is available
pg_isready -h localhost -p 5432

# If not, fallback to SQLite
export DASH_STORAGE=sqlite
```

### Phase 2: Configuration

```yaml
# config/godel.yaml

storage:
  type: ${DASH_STORAGE:-sqlite}
  sqlite:
    path: ${DASH_SQLITE_PATH:-./godel.db}
  postgres:
    url: ${POSTGRES_URL:-postgresql://localhost:5432/godel}
```

### Phase 3: Migrations

```typescript
// src/migrations/index.ts

import { Storage } from '../storage';

export async function runMigrations(storage: Storage): Promise<void> {
  // Create tables if not exist
  await storage.createTable('agents', `
    id TEXT PRIMARY KEY,
    task TEXT,
    model TEXT,
    state TEXT,
    created_at INTEGER,
    updated_at INTEGER,
    metadata TEXT
  `);
  
  await storage.createTable('teams', `
    id TEXT PRIMARY KEY,
    name TEXT,
    status TEXT,
    config TEXT,
    created_at INTEGER,
    updated_at INTEGER
  `);
  
  await storage.createTable('workflows', `
    id TEXT PRIMARY KEY,
    name TEXT,
    status TEXT,
    steps TEXT,
    created_at INTEGER,
    updated_at INTEGER
  `);
  
  await storage.createTable('events', `
    id TEXT PRIMARY KEY,
    type TEXT,
    data TEXT,
    created_at INTEGER
  `);
}
```

## PostgreSQL Setup (Production)

### Docker Compose

```yaml
# docker-compose.yml

version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: godel
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: godel
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

### Startup

```bash
# Start PostgreSQL
docker-compose up -d

# Run migrations
npm run db:migrate

# Start Godel
npm run dev
```

## Testing Strategy

### Unit Tests

```typescript
// tests/storage/hybrid.test.ts

describe('Hybrid Storage', () => {
  it('should use SQLite in development', async () => {
    process.env.DASH_STORAGE = 'sqlite';
    
    const storage = createStorage({ type: 'sqlite', path: ':memory:' });
    
    const agent = await storage.create('agents', { task: 'Test' });
    expect(agent.id).toBeDefined();
  });
  
  it('should use PostgreSQL when available', async () => {
    // Mock pg_isready to return true
    // Test PostgreSQL connection
  });
});
```

### Integration Tests

- [ ] API endpoints with SQLite
- [ ] API endpoints with PostgreSQL
- [ ] Fallback behavior
- [ ] Error handling

## Success Criteria

- [ ] API endpoints return 200 (not 500)
- [ ] GET /api/agents works
- [ ] POST /api/agents works
- [ ] POST /api/team works
- [ ] Development works without PostgreSQL
- [ ] Production works with PostgreSQL

## Files Affected

- `src/storage/index.ts` (modify)
- `src/storage/sqlite.ts` (modify)
- `src/storage/postgres.ts` (new)
- `config/godel.yaml` (modify)
- `docker-compose.yml` (new)
- `package.json` (modify)

## Estimated Effort

- Phase 1: 1 hour
- Phase 2: 1 hour
- Phase 3: 2 hours
- Testing: 2 hours

**Total: ~6 hours**
