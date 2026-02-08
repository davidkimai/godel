# SPEC: Godel Pre-Release Testing Implementation

**Version:** 1.0  
**Date:** 2026-02-07  
**Status:** Implementation Phase  
**Priority:** P0  
**PRD Reference:** docs/plans/PRD-001-pre-release-testing.md

---

## Overview

This specification details the implementation plan for comprehensive pre-release testing of the Godel Agent Orchestration Platform. The plan leverages 20 parallel subagent teams to achieve production-ready quality in ~2.2 days real time.

**Architecture:** Parallel execution using git worktrees for isolation, with centralized coordination through this specification and checkpoint validation.

**Tech Stack:** TypeScript, Jest, Node.js, PostgreSQL, Redis, Docker

---

## Critical Context for Subagents

### Codebase Structure
```
src/
├── safety/           # Security-critical modules (0% coverage)
│   ├── guardrails.ts (1045 lines)
│   ├── sandbox.ts (1030 lines)
│   └── path-validator.ts (714 lines)
├── events/           # Event system (0% coverage)
│   ├── replay.ts (1313 lines)
│   └── stream.ts (730 lines)
├── api/routes/       # API endpoints (0% coverage)
│   ├── agents.ts (792 lines)
│   ├── events.ts
│   └── swarm.ts
├── cli/commands/     # CLI commands (0% coverage)
│   ├── git.ts (781 lines)
│   └── events.ts
├── federation/       # Distributed systems (15 failures)
│   ├── load-balancer.ts
│   ├── migration.ts
│   └── cluster-registry.ts
└── storage/
    └── repositories/
        └── TeamRepository.ts
```

### Known Issues from Reports
1. **TypeScript Build:** `getAllAgents` missing from AgentRegistry in load-balancer.ts:740
2. **Module Missing:** @godel/ai package not found
3. **Federation Failures:** LoadBalancer constructor issues, cooldown test failures
4. **Transaction Tests:** Optimistic locking failure
5. **Resource Tests:** SwarmRepository constructor issues (swarm→team rename incomplete)

### Testing Approach
- **TDD for new tests:** Write failing test → Implement → Verify pass
- **Regression tests:** Write test reproducing bug → Fix → Verify pass
- **Integration tests:** Test full API/CLI workflows
- **Coverage targets:** 90% safety modules, 70% overall

---

## Phase 1: Build & Type Safety

### Task 1.1: Fix TypeScript Compilation
**Team:** Build-Fixers  
**Files:**
- Modify: `src/federation/load-balancer.ts:740`
- Modify: `src/core/index.ts:267-289`
- Create: Mock for `@godel/ai`

**Step 1: Identify the missing method**
```bash
grep -n "getAllAgents" src/federation/load-balancer.ts
grep -n "class AgentRegistry" src/federation/agent-registry.ts
```

**Step 2: Add getAllAgents method to AgentRegistry**
```typescript
// In src/federation/agent-registry.ts, add after list() method:
getAllAgents(): RegisteredAgent[] {
  return this.list();
}
```

**Step 3: Create @godel/ai mock**
```typescript
// Create: src/__mocks__/@godel/ai.ts
export const createAIClient = jest.fn();
export const generateText = jest.fn();
export const streamText = jest.fn();
```

**Step 4: Run typecheck**
```bash
npm run typecheck
```
**Expected:** Zero TypeScript errors

**Step 5: Commit**
```bash
git add src/federation/agent-registry.ts src/__mocks__/@godel/ai.ts
git commit -m "fix: resolve TypeScript errors - add getAllAgents, mock @godel/ai"
```

---

## Phase 2: Safety Module Testing

### Task 2.1: Test safety/guardrails.ts
**Team:** Alpha-Security  
**Files:**
- Create: `tests/safety/guardrails.test.ts`
- Reference: `src/safety/guardrails.ts` (1045 lines)

**Implementation:**
```typescript
// Tests for sandbox escape prevention
describe('Guardrails - Sandbox Escape Prevention', () => {
  it('should block path traversal attempts', () => {
    // Test implementation
  });
  
  it('should detect command injection patterns', () => {
    // Test implementation
  });
  
  it('should enforce network allowlist', () => {
    // Test implementation
  });
});
```

**Target:** 90% coverage, all security paths tested

### Task 2.2: Test safety/sandbox.ts
**Team:** Beta-Security  
**Files:**
- Create: `tests/safety/sandbox.test.ts`
- Reference: `src/safety/sandbox.ts` (1030 lines)

**Target:** 90% coverage

### Task 2.3: Test safety/path-validator.ts
**Team:** Gamma-Security  
**Files:**
- Create: `tests/safety/path-validator.test.ts`
- Reference: `src/safety/path-validator.ts` (714 lines)

**Target:** 90% coverage

### Task 2.4: Test safety/predictive-budget.ts
**Team:** Delta-Security  
**Files:**
- Create: `tests/safety/predictive-budget.test.ts`
- Reference: `src/safety/predictive-budget.ts` (849 lines)

**Target:** 80% coverage

---

## Phase 3: Event System Testing

### Task 3.1: Test events/replay.ts
**Team:** Echo-Events  
**Files:**
- Create: `tests/events/replay.test.ts`
- Reference: `src/events/replay.ts` (1313 lines)

**Key Test Cases:**
- Replay sessions with filtering
- Export to JSON format
- Export to CSV format
- Replay speed controls
- Session management
- Error handling

**Target:** 80% coverage

### Task 3.2: Test events/stream.ts
**Team:** Foxtrot-Events  
**Files:**
- Create: `tests/events/stream.test.ts`
- Reference: `src/events/stream.ts` (730 lines)

**Key Test Cases:**
- Event streaming
- Real-time processing
- WebSocket event delivery
- Stream buffering
- Error recovery

**Target:** 80% coverage

---

## Phase 4: API Integration Testing

### Task 4.1: Test api/routes/agents.ts
**Team:** Golf-API  
**Files:**
- Create: `tests/api/agents.test.ts`
- Reference: `src/api/routes/agents.ts` (792 lines)

**Test All Endpoints:**
- POST /api/agents (spawn)
- GET /api/agents (list)
- GET /api/agents/:id (get)
- POST /api/agents/:id/kill
- POST /api/agents/:id/restart
- DELETE /api/agents/:id
- GET /api/agents/:id/logs

**Target:** 100% endpoint coverage

### Task 4.2: Test api/routes/events.ts
**Team:** Hotel-API  
**Files:**
- Create: `tests/api/events.test.ts`
- Reference: `src/api/routes/events.ts`

**Target:** 100% endpoint coverage

### Task 4.3: Test api/routes/swarm.ts
**Team:** India-API  
**Files:**
- Create: `tests/api/swarm.test.ts`
- Reference: `src/api/routes/swarm.ts`

**Target:** 100% endpoint coverage

### Task 4.4: Test api/websocket.ts
**Team:** Juliet-API  
**Files:**
- Create: `tests/api/websocket.test.ts`
- Reference: `src/api/websocket.ts`

**Target:** 100% coverage

---

## Phase 5: CLI Testing

### Task 5.1: Test cli/commands/git.ts
**Team:** Kilo-CLI  
**Files:**
- Create: `tests/cli/git.test.ts`
- Reference: `src/cli/commands/git.ts` (781 lines)

**Test All Git Commands:**
- godel git status
- godel git commit
- godel git push
- godel git pull
- Error handling for each

**Target:** 90% coverage

### Task 5.2: Test cli/commands/events.ts
**Team:** Lima-CLI  
**Files:**
- Create: `tests/cli/events.test.ts`
- Reference: `src/cli/commands/events.ts`

**Target:** 90% coverage

---

## Phase 6: Federation Testing

### Task 6.1: Fix Federation Integration Tests
**Team:** Mike-Federation  
**Files:**
- Modify: `src/federation/__tests__/load-balancer.test.ts`
- Modify: `tests/federation/integration/e2e.test.ts`

**Issues to Fix:**
1. LoadBalancer constructor/export issues
2. Auto-scaling cooldown test
3. Cluster registry tests

**Verification:**
```bash
npm test -- src/federation/__tests__/load-balancer.test.ts
npm test -- tests/federation/integration/e2e.test.ts
```
**Expected:** All tests passing

### Task 6.2: Test federation/migration.ts
**Team:** November-Federation  
**Files:**
- Create: `tests/federation/migration.test.ts`
- Reference: `src/federation/migration.ts`

**Target:** 80% coverage

### Task 6.3: Test federation/decomposer.ts
**Team:** Oscar-Federation  
**Files:**
- Create: `tests/federation/decomposer.test.ts`
- Reference: `src/federation/decomposer.ts`

**Target:** 80% coverage

---

## Phase 7: Performance Testing

### Task 7.1: Run Performance Benchmarks
**Team:** Papa-Performance  
**Commands:**
```bash
npm run test:perf:baseline
npm run test:perf:standard
npm run test:perf:full
```

**Verification:** All benchmarks complete within thresholds

### Task 7.2: Run Load Tests
**Team:** Quebec-Performance  
**Commands:**
```bash
npm run test:load:10
npm run test:load:25
npm run test:load:50
npm run test:load:all
```

**Verification:** All load tests pass

---

## Phase 8: Transaction & Database

### Task 8.1: Fix Transaction Manager Tests
**Team:** Romeo-Data  
**Files:**
- Modify: `tests/transaction/transaction-manager.test.ts`

**Fix:** Optimistic locking test - "should prevent lost updates"

### Task 8.2: Test Database Consistency
**Team:** Sierra-Data  
**Files:**
- Modify: `tests/database/pool.test.ts`

**Target:** All database tests passing

---

## Phase 9: Examples Validation

### Task 9.1: Validate Examples
**Team:** Tango-Examples  
**Files to Test:**
- `examples/basic-agent-creation/index.ts`
- `examples/team-orchestration/index.ts`
- `examples/advanced-patterns/index.ts`

**Verification:**
```bash
cd examples/basic-agent-creation && npm start
cd examples/team-orchestration && npm start
```
**Expected:** All examples execute without errors

---

## Phase 10: Final Integration

### Task 10.1: Run Release Gate
**Team:** Victor-Release  
**Command:**
```bash
npm run test:release-gate
```

### Task 10.2: Full Quality Check
**Team:** Whiskey-Release  
**Command:**
```bash
npm run quality
```

### Task 10.3: Verify Build
**Team:** Xray-Release  
**Commands:**
```bash
npm run build
ls -la dist/
./dist/src/cli/index.js --help
```

### Task 10.4: Create Release Notes
**Team:** Yankee-Release  
**Files:**
- Create: `docs/RELEASE_NOTES_v2.0.0.md`

### Task 10.5: Final Validation
**Team:** Zulu-Release  
**Checklist:**
- [ ] All tests pass
- [ ] Build succeeds
- [ ] CLI executable works
- [ ] Examples run
- [ ] Coverage targets met
- [ ] Documentation complete

---

## Verification Matrix

| Phase | Team | Verification Command | Success Criteria |
|-------|------|---------------------|------------------|
| 1 | Build-Fixers | `npm run typecheck` | 0 errors |
| 2 | Alpha-Delta | `npm test -- tests/safety/` | >90% coverage |
| 3 | Echo-Foxtrot | `npm test -- tests/events/` | >80% coverage |
| 4 | Golf-Juliet | `npm test -- tests/api/` | 100% endpoint coverage |
| 5 | Kilo-Lima | `npm test -- tests/cli/` | >90% coverage |
| 6 | Mike-Oscar | `npm test -- src/federation/` | All tests passing |
| 7 | Papa-Quebec | `npm run test:perf:full && npm run test:load:50` | Pass |
| 8 | Romeo-Sierra | `npm test -- tests/transaction/ tests/database/` | Pass |
| 9 | Tango | Manual execution | All examples work |
| 10 | Victor-Zulu | `npm run quality` | All criteria met |

---

## Subagent Anti-Stub Protocol

**CRITICAL:** All subagents must follow this protocol:

1. **DO NOT** report success until files are verified with `ls -la`
2. **DO NOT** report success until code compiles (`npm run typecheck`)
3. **DO NOT** use console.log simulation - create REAL implementations
4. For each file:
   - Use write() tool to create
   - Use read() to verify content
   - Run `ls -la` to confirm existence
5. Test the implementation:
   - Run `npm test -- [test-file]`
   - Verify tests pass
6. Report: File sizes, line counts, test results

---

## Communication Protocol

### Between Teams
- Use shared docs/plans/ folder for coordination
- Each team updates their task status in `phase_outputs.md`
- Blockers reported immediately to orchestrator

### Reporting Format
```
Team [Name] - Task [X.Y] Update:
Status: [In Progress/Complete/Blocked]
Files Modified: [list]
Coverage: [X%]
Tests: [Pass/Fail]
Blockers: [None or description]
Next: [Next action]
```

---

## Rollback Plan

If critical failures occur:
1. Revert to last known good commit
2. Isolate failing module
3. Assign dedicated team for hotfix
4. Re-run verification
5. Merge when verified

---

**Next Action:** Begin Phase 1 execution with Team Build-Fixers
