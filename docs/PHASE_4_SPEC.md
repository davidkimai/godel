# PHASE 4 SPEC: PRODUCTION READINESS COMPLETION

**Created:** 2026-02-04 03:30 CST
**Status:** Ready for Launch

---

## 📊 CURRENT STATUS

| Item | Status | Details |
|------|--------|---------|
| Phase 0-3 Code | ✅ Complete | All 10 subagents merged to main |
| Git Status | ✅ Clean | Pushed to GitHub (be22923) |
| Tests | ⚠️ 224/806 failing | Timeouts, mocking issues |
| Console.log | ⚠️ 1,364 in worktrees | Main branch clean |
| Pi-Mono Integration | 📋 Docs ready | docs/PI_MONO_PRIMITIVES.md |

---

## 🎯 PHASE 4 OBJECTIVES

### 1. Test Stabilization
**Goal:** Fix 224 failing tests (timeouts, mocking issues)

### 2. Console.log Cleanup
**Goal:** Remove 1,364 console.log from archived worktrees

### 3. Pi-Mono Core Integration
**Goal:** Implement unified LLM API and agent core

### 4. Production Deployment
**Goal:** Deploy to staging/production

---

## 🚀 SUBAGENTS TO LAUNCH

### Subagent 1: dash-test-stabilizer

**Mission:** Fix failing tests and achieve >80% coverage

**Deliverables:**
1. **Fix Timeout Issues**
   - Increase timeout values
   - Fix async handling
   - Add proper waits

2. **Fix Mocking Issues**
   - Correct mock setup
   - Proper teardown
   - Isolation between tests

3. **Coverage Analysis**
   - Identify coverage gaps
   - Add missing tests
   - Target >80% line coverage

**Codex Command:**
```bash
codex --approval-mode full-auto "Fix 224 failing tests in dash project.
Focus on:
1. Timeouts - increase values, fix async
2. Mocking - correct setup/teardown
3. Test isolation between tests

Run: npm test 2>&1 | grep -E '(PASS|FAIL|Tests:)'
Fix each failing test systematically.

SUCCESS CRITERIA:
- All tests passing OR <20 failures
- No console.log in test files
- Exit code 0"
```

---

### Subagent 2: dash-console-cleanup

**Mission:** Remove console.log statements from archived worktrees

**Deliverables:**
1. **Scan Worktrees**
   - Find all console.log statements
   - Categorize by severity
   - Prioritize production code

2. **Replace with Logger**
   - Use structured logger
   - Maintain debug levels
   - Add source location

**Codex Command:**
```bash
codex --approval-mode full-auto "Remove console.log from archived worktrees in dash project.

FIND: grep -r "console.log" --include="*.ts" .
COUNT: Report total by worktree

REMOVE from:
- src/ (production code)
- tests/ (test files)
- scripts/ (automation)

Use structured logger from src/utils/logger.ts instead.

SUCCESS CRITERIA:
- console.log count < 100 total
- No console.log in production code
- Exit code 0"
```

---

### Subagent 3: dash-pi-mono-core

**Mission:** Implement pi-mono primitives as core Dash architecture

**Deliverables:**
1. **Unified LLM API** (Priority 1)
   ```
   src/llm/
   ├── providers/           # Multi-provider support
   │   ├── openai.ts
   │   ├── anthropic.ts
   │   └── google.ts
   ├── model-registry.ts    # Model discovery
   ├── context.ts          # Serializable context
   └── tools/              # TypeBox definitions
   ```

2. **Agent Core** (Priority 2)
   ```
   src/agent/
   ├── Agent.ts            # Core agent class
   ├── events.ts           # Event streaming
   └── tools/              # Built-in tools
   ```

3. **Key Patterns to Implement:**
   - Multi-provider abstraction
   - Context serialization
   - Streaming events (text_delta, toolcall_delta, etc.)
   - TypeBox tool definitions
   - Steering/follow-up support

**Codex Command:**
```bash
codex --approval-mode full-auto "Implement pi-mono primitives in dash project.

Reference: docs/PI_MONO_PRIMITIVES.md

DELIVERABLE 1: Unified LLM API
- Create src/llm/providers/openai.ts
- Create src/llm/providers/anthropic.ts
- Create src/llm/model-registry.ts
- Use @mariozechner/pi-ai patterns

DELIVERABLE 2: Agent Core
- Create src/agent/Agent.ts
- Implement event streaming
- Support TypeBox tools

SUCCESS CRITERIA:
- Unified API supports 3+ providers
- Context serializable to JSON
- Event streaming works
- Exit code 0"
```

---

### Subagent 4: dash-deploy-production

**Mission:** Deploy Dash to production

**Deliverables:**
1. **Staging Deployment**
   - Deploy to staging environment
   - Run integration tests
   - Verify health endpoints

2. **Production Deployment**
   - Blue/green or canary deployment
   - Monitor error rates
   - Rollback capability

3. **Verification**
   - Health check passes
   - Performance benchmarks
   - Security scan clean

**Codex Command:**
```bash
codex --approval-mode full-auto "Deploy dash to production.

Steps:
1. Review DEPLOYMENT.md
2. Run: ./scripts/verify-health.sh
3. Deploy: ./deploy.sh --environment production
4. Verify: ./scripts/verify-performance.sh
5. Report: Write DEPLOYMENT_STATUS.md

SUCCESS CRITERIA:
- Health endpoint returns 200
- <100ms latency p95
- No critical errors in logs
- Exit code 0"
```

---

## 📋 VERIFICATION CHECKLIST

Before claiming Phase 4 complete:

- [ ] Tests: >80% coverage, <20 failures
- [ ] Console.log: <100 statements, none in production
- [ ] LLM API: 3+ providers working
- [ ] Agent Core: Event streaming functional
- [ ] Deployment: Production live, health passing
- [ ] Documentation: Updated README, API docs

---

## ⏱️ ESTIMATED TIMELINE

| Task | Duration | Parallel? |
|------|----------|-----------|
| Test Stabilization | 30-45 min | ✅ Yes |
| Console Cleanup | 15-20 min | ✅ Yes |
| Pi-Mono Core | 45-60 min | ✅ Yes |
| Production Deploy | 15-20 min | After others |

**Total:** ~90 minutes with parallel execution

---

## 🔗 REFERENCES

- Pi-Mono: https://github.com/badlogic/pi-mono
- Pi-Mono Primitives: docs/PI_MONO_PRIMITIVES.md
- Deployment: DEPLOYMENT.md
- Verification: VERIFICATION_REPORT.md
