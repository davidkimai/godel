# SPEC: Godel Production Readiness - Test Suite Stabilization

**Version:** 1.0  
**Date:** February 3, 2026  
**Status:** Ready for Implementation  
**Priority:** P0 - Critical  
**PRD Reference:** [PRD-001-test-stabilization.md](../prds/PRD-001-test-stabilization.md)

---

## Overview

Fix all test failures to achieve 100% test pass rate (501/501 tests passing).

**Current State:**
- Total Tests: 501
- Passing: 459
- Failing: 31 (6.2% failure rate)
- Failed Suites: 21 of 44

**Target State:**
- All 501 tests passing
- No resource leak warnings
- Test suite runtime < 2 minutes
- Clean exit (no force exit needed)

**PRD Success Criteria:**
1. ✅ Running `npm test` shows: "501 passed, 0 failed"
2. ✅ No "force exited" or "open handles" warnings
3. ✅ Test suite completes in < 120 seconds
4. ✅ 5 consecutive CI runs pass without failures

---

## Root Cause Analysis

### Error Pattern 1: Native Module Memory Issues
```
0x124eed778
0x124ea04dc
0x12489609c
```
**Cause:** Native modules (Redis, PostgreSQL) not properly cleaned up

### Error Pattern 2: Timer/Resource Leaks
```
has failed to exit gracefully and has been force exited
Try running with --detectOpenHandles
```
**Cause:** Async resources not properly unreferenced

### Error Pattern 3: VM Module Issues
**Cause:** --experimental-vm-modules flag conflicts

---

## Implementation Requirements

### 1. Fix Jest Configuration

**File:** `jest.config.js`

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  
  // Fix VM module issues
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: false,  // Disable ESM to avoid VM issues
    }]
  },
  
  // Fix timer leaks
  fakeTimers: {
    enableGlobally: false,
    doNotFake: ['nextTick', 'setImmediate']
  },
  
  // Proper cleanup
  clearMocks: true,
  restoreMocks: true,
  resetModules: true,
  
  // Detect open handles
  detectOpenHandles: true,
  
  // Force exit after tests
  forceExit: false,  // Let tests exit naturally
  
  // Setup files
  setupFilesAfterEnv: ['<rootDir>/src/test/setup.ts'],
  
  // Test timeout
  testTimeout: 30000,  // 30 seconds
  
  // Module path mapping
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@godel/(.*)$': '<rootDir>/src/$1'
  },
  
  // Coverage
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/test/**'
  ],
  
  // Test match patterns
  testMatch: [
    '**/tests/**/*.test.ts',
    '!**/tests/integration/**'  // Run integration tests separately
  ]
};
```

### 2. Create Test Setup File

**File:** `src/test/setup.ts`

```typescript
import { jest } from '@jest/globals';

// Global test setup
beforeAll(async () => {
  // Set test environment
  process.env.NODE_ENV = 'test';
  process.env.DASH_LOG_LEVEL = 'error';  // Reduce noise
});

// Global test teardown
afterAll(async () => {
  // Force cleanup of any remaining handles
  await new Promise(resolve => setImmediate(resolve));
});

// Clean up after each test
afterEach(async () => {
  // Clear all mocks
  jest.clearAllMocks();
  
  // Clean up timers
  jest.useRealTimers();
  
  // Force garbage collection if available
  if (global.gc) {
    global.gc();
  }
});

// Handle unhandled promises
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});
```

### 3. Fix Native Module Cleanup

**File:** `src/test/helpers/cleanup.ts`

```typescript
import { Redis } from 'ioredis';
import { Pool } from 'pg';

interface Cleanupable {
  disconnect?(): Promise<void>;
  end?(): Promise<void>;
  quit?(): Promise<void>;
  close?(): Promise<void>;
}

const resources: Cleanupable[] = [];

export function trackResource(resource: Cleanupable): void {
  resources.push(resource);
}

export async function cleanupAll(): Promise<void> {
  for (const resource of resources) {
    try {
      if (resource.disconnect) {
        await resource.disconnect();
      } else if (resource.end) {
        await resource.end();
      } else if (resource.quit) {
        await resource.quit();
      } else if (resource.close) {
        await resource.close();
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  }
  
  // Clear the array
  resources.length = 0;
  
  // Wait for event loop to clear
  await new Promise(resolve => setImmediate(resolve));
}
```

### 4. Fix Event Bus Redis Tests

**File:** `tests/event-bus-redis.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { RedisEventBus } from '@/core/event-bus-redis';
import { cleanupAll, trackResource } from '@/test/helpers/cleanup';

describe('RedisEventBus', () => {
  let eventBus: RedisEventBus;
  
  beforeAll(async () => {
    // Skip if no Redis
    if (!process.env.REDIS_URL) {
      console.log('Skipping Redis tests - no REDIS_URL');
      return;
    }
  });
  
  beforeEach(async () => {
    await cleanupAll();
    
    eventBus = new RedisEventBus({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    });
    
    trackResource(eventBus);
    await eventBus.connect();
  });
  
  afterAll(async () => {
    await cleanupAll();
  });
  
  it('should publish and subscribe to events', async () => {
    // Test implementation
    const received: any[] = [];
    
    await eventBus.subscribe('test.event', (event) => {
      received.push(event);
    });
    
    await eventBus.publish('test.event', { data: 'test' });
    
    // Wait for event
    await new Promise(resolve => setTimeout(resolve, 100));
    
    expect(received).toHaveLength(1);
    expect(received[0].data).toBe('test');
  }, 10000);  // 10 second timeout
});
```

### 5. Fix State Persistence Tests

**File:** `tests/state-persistence.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { PostgresStateManager } from '@/storage/postgres/state-manager';
import { cleanupAll, trackResource } from '@/test/helpers/cleanup';

describe('StatePersistence', () => {
  let stateManager: PostgresStateManager;
  
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      console.log('Skipping state tests - no DATABASE_URL');
      return;
    }
  });
  
  beforeEach(async () => {
    await cleanupAll();
    
    stateManager = new PostgresStateManager({
      url: process.env.DATABASE_URL!
    });
    
    trackResource(stateManager);
    await stateManager.connect();
  });
  
  afterAll(async () => {
    await cleanupAll();
  });
  
  it('should persist and retrieve agent state', async () => {
    const agentId = 'test-agent-1';
    const state = { status: 'running', tasks: 5 };
    
    await stateManager.saveAgentState(agentId, state);
    const retrieved = await stateManager.getAgentState(agentId);
    
    expect(retrieved).toEqual(state);
  }, 10000);
});
```

### 6. Fix Integration Tests

**File:** `tests/integration/api.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { createServer } from '@/api/server';
import { cleanupAll } from '@/test/helpers/cleanup';

describe('API Integration', () => {
  let app: any;
  let server: any;
  
  beforeAll(async () => {
    app = await createServer();
    // Don't start listening - use supertest
  });
  
  afterAll(async () => {
    await cleanupAll();
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });
  
  describe('GET /api/health', () => {
    it('should return healthy status', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('healthy');
    });
  });
  
  describe('GET /api/agents', () => {
    it('should list agents', async () => {
      const response = await request(app)
        .get('/api/agents')
        .set('X-API-Key', 'test-key')
        .expect(200);
      
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });
});
```

### 7. Add Test Environment Configuration

**File:** `.env.test`

```
NODE_ENV=test
DASH_LOG_LEVEL=error
DASH_PORT=7374

# Use in-memory/test databases
DATABASE_URL=postgresql://test:test@localhost:5433/dash_test
REDIS_URL=redis://localhost:6380/1

# Test API key
DASH_API_KEY=test-key

# Disable external services
DASH_DISABLE_EMAIL=true
DASH_DISABLE_WEBHOOKS=true
```

### 8. Fix Package.json Scripts

**File:** `package.json`

```json
{
  "scripts": {
    "test": "NODE_ENV=test jest --detectOpenHandles",
    "test:unit": "NODE_ENV=test jest --testPathIgnorePatterns=integration",
    "test:integration": "NODE_ENV=test jest --testPathPattern=integration",
    "test:watch": "NODE_ENV=test jest --watch",
    "test:coverage": "NODE_ENV=test jest --coverage",
    "test:ci": "NODE_ENV=test jest --ci --coverage --maxWorkers=2"
  }
}
```

---

## Verification Steps

1. **Run full test suite:**
   ```bash
   npm test
   ```

2. **Verify all tests pass:**
   - Expected: 501 tests passing
   - Expected: 0 tests failing
   - Expected: 0 test suites failing

3. **Verify no resource leaks:**
   - No "force exited" warnings
   - No open handle warnings
   - Clean exit

4. **Verify runtime:**
   - Should complete in < 2 minutes

---

## Success Criteria

- [ ] All 501 tests passing
- [ ] No resource leak warnings
- [ ] Test suite exits cleanly
- [ ] Runtime < 2 minutes
- [ ] CI/CD pipeline passes

---

## Acceptance Criteria

```bash
$ npm test

Test Suites: 44 passed, 44 total
Tests:       501 passed, 501 total
Snapshots:   0 total
Time:        95.234 s
Ran all test suites.
# Clean exit - no warnings
```
