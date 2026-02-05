# TECHSPEC-001: Storage Layer Fix

**Version:** 1.0.0
**Created:** 2026-02-04
**Status:** DRAFT
**Priority:** HIGH

## Problem Statement

CLI agent spawn fails with `this.storage.create is not a function`.

### Test Evidence

```
CLI Test: dash agent spawn "Test agent creation"
Error: this.storage.create is not a function
Status: FAIL
```

## Root Cause Analysis

### Finding 1: Storage Interface Mismatch

The CLI commands expect a `storage` object with a `create` method, but the implementation doesn't provide it.

### Finding 2: Agent Creation Flow

```
CLI Command
  │
  ▼
agent spawn [task]
  │
  ▼
AgentManager.spawn()
  │
  ▼
this.storage.create("agents", data)  ──► FAIL: Method missing
```

## Technical Requirements

### Required Storage Interface

```typescript
interface Storage {
  create(table: string, data: any): Promise<Agent>;
  read(table: string, id: string): Promise<Agent | null>;
  update(table: string, id: string, data: any): Promise<Agent>;
  delete(table: string, id: string): Promise<void>;
  list(table: string): Promise<Agent[]>;
  query(table: string, filters: any): Promise<Agent[]>;
}
```

### Implementation Options

| Option | Pros | Cons | Recommendation |
|--------|------|------|----------------|
| Use SQLite directly | Fast, local, no deps | Limited features | ✅ Preferred |
| Use TypeORM | Full ORM features | Heavy dependency | Consider later |
| Use Prisma | Type-safe ORM | Requires PG | Later |

### SQLite Implementation

```typescript
// src/storage/sqlite.ts

import Database from 'better-sqlite3';
import path from 'path';

export class SQLiteStorage implements Storage {
  private db: Database.Database;
  
  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.init();
  }
  
  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        task TEXT,
        model TEXT,
        state TEXT,
        created_at INTEGER,
        updated_at INTEGER,
        metadata TEXT
      )
    `);
  }
  
  async create(table: string, data: any): Promise<any> {
    const stmt = this.db.prepare(`
      INSERT INTO ${table} (id, task, model, state, created_at, updated_at, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    const now = Date.now();
    const id = `agent-${now}-${Math.random().toString(36).substr(2, 9)}`;
    const metadata = JSON.stringify(data.metadata || {});
    
    stmt.run(id, data.task, data.model, 'created', now, now, metadata);
    
    return this.read(table, id);
  }
  
  async read(table: string, id: string): Promise<any> {
    const stmt = this.db.prepare(`SELECT * FROM ${table} WHERE id = ?`);
    const row = stmt.get(id);
    return row ? { ...row, metadata: JSON.parse(row.metadata || '{}') } : null;
  }
  
  async list(table: string): Promise<any[]> {
    const stmt = this.db.prepare(`SELECT * FROM ${table} ORDER BY created_at DESC`);
    return stmt.all().map(row => ({
      ...row,
      metadata: JSON.parse(row.metadata || '{}')
    }));
  }
  
  async update(table: string, id: string, data: any): Promise<any> {
    const now = Date.now();
    const metadata = JSON.stringify(data.metadata || {});
    
    this.db.prepare(`
      UPDATE ${table}
      SET task = ?, state = ?, updated_at = ?, metadata = ?
      WHERE id = ?
    `).run(data.task, data.state, now, metadata, id);
    
    return this.read(table, id);
  }
  
  async delete(table: string, id: string): Promise<void> {
    this.db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
  }
  
  async query(table: string, filters: any): Promise<any[]> {
    // Implementation for filtering
    return this.list(table);
  }
}
```

## Implementation Plan

### Phase 1: SQLite Storage
- [ ] Create SQLiteStorage class
- [ ] Implement all Storage interface methods
- [ ] Add initialization for all tables (agents, swarms, workflows, events)
- [ ] Write unit tests

### Phase 2: CLI Integration
- [ ] Update AgentManager to use SQLiteStorage
- [ ] Fix storage initialization in CLI entry point
- [ ] Test agent spawn command

### Phase 3: API Integration
- [ ] Update API routes to use SQLiteStorage
- [ ] Add migrations for existing tables
- [ ] Test all CRUD endpoints

## Testing Strategy

### Unit Tests

```typescript
// tests/storage/sqlite.test.ts

describe('SQLiteStorage', () => {
  let storage: SQLiteStorage;
  
  beforeEach(() => {
    storage = new SQLiteStorage(':memory:');
  });
  
  it('should create an agent', async () => {
    const agent = await storage.create('agents', {
      task: 'Test task',
      model: 'kimi-k2.5'
    });
    
    expect(agent.id).toBeDefined();
    expect(agent.task).toBe('Test task');
    expect(agent.state).toBe('created');
  });
  
  it('should list all agents', async () => {
    await storage.create('agents', { task: 'Task 1' });
    await storage.create('agents', { task: 'Task 2' });
    
    const agents = await storage.list('agents');
    expect(agents.length).toBe(2);
  });
  
  it('should update an agent', async () => {
    const agent = await storage.create('agents', { task: 'Original' });
    
    const updated = await storage.update('agents', agent.id, {
      task: 'Updated',
      state: 'running'
    });
    
    expect(updated.task).toBe('Updated');
    expect(updated.state).toBe('running');
  });
});
```

### Integration Tests

- [ ] CLI agent spawn with storage
- [ ] API CRUD operations
- [ ] Concurrent access
- [ ] Error handling

## Success Criteria

- [ ] `dash agent spawn` creates agent successfully
- [ ] `dash agent list` returns agents
- [ ] API endpoints work without 500 errors
- [ ] All tests pass (100%)

## Files Affected

- `src/storage/sqlite.ts` (new)
- `src/core/agent-manager.ts` (modify)
- `src/cli/commands/agent.ts` (modify)
- `tests/storage/sqlite.test.ts` (new)

## Estimated Effort

- Phase 1: 2 hours
- Phase 2: 1 hour
- Phase 3: 2 hours
- Testing: 1 hour

**Total: ~6 hours**
