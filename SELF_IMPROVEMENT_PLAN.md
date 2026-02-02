# Dash Self-Improvement Strategy v2.0

## Executive Summary

This document outlines a comprehensive self-improvement strategy for Dash v2.0, leveraging its own OpenClaw-integrated infrastructure to recursively improve itself. Based on a thorough audit of the current system, this plan identifies critical gaps, prioritizes improvements, and establishes a continuous improvement loop.

**Current State:** Self-improvement system is architecturally complete but has one critical integration issue preventing full operation.

**Goal:** Activate and optimize Dash's self-improvement capabilities to achieve autonomous code quality enhancement.

---

## 1. Current State Assessment

### 1.1 What's Working ✅

| Component | Status | Details |
|-----------|--------|---------|
| **Orchestrator** | ✅ Complete | Full lifecycle management, budget tracking, learning integration |
| **Budget Tracking** | ✅ Complete | Per-agent and per-swarm budget enforcement with kill switches |
| **Learning Engine** | ✅ Complete | A/B testing, pattern identification, strategy recommendations |
| **Improvement Store** | ✅ Complete | SQLite-based storage with analytics and time-series data |
| **Configuration** | ✅ Complete | 3 improvement areas (codeQuality, documentation, testing) configured |
| **CLI Integration** | ✅ Complete | `dash self-improve run/status/report` commands available |
| **Dash Server** | ✅ Running | API server operational on port 7373 |

### 1.2 Critical Issue 🔴

**Problem:** `spawnOpenClawAgent()` uses HTTP REST API (`POST /api/sessions/spawn`) but OpenClaw Gateway uses WebSocket protocol.

**Error:** `Method Not Allowed`

**Location:** `src/self-improvement/orchestrator.ts:109-148`

**Root Cause:** The orchestrator attempts to spawn agents via:
```typescript
const response = await fetch(`${OPENCLAW_GATEWAY_URL.replace('ws://', 'http://')}/api/sessions/spawn`, {...})
```

But OpenClaw Gateway requires WebSocket messages:
```typescript
{ type: 'req', id: '...', method: 'sessions_spawn', params: {...} }
```

### 1.3 Impact

- Self-improvement cycles run but cannot spawn actual OpenClaw agents
- Budget tracking initializes but no actual agent execution occurs
- Learning data is recorded (all failures) but not meaningful
- System essentially operates in "dry-run" mode

---

## 2. Priority Improvements (Top 5)

### P0: Fix OpenClaw Gateway Integration

**Priority:** CRITICAL - Blocks all self-improvement

**Description:** Replace HTTP-based agent spawning with proper WebSocket-based SessionManager integration.

**Implementation:**
```typescript
// Replace spawnOpenClawAgent() implementation
import { SessionManager } from '../integrations/openclaw/SessionManager';
import { createAgentExecutor } from '../integrations/openclaw/AgentExecutor';

async function spawnOpenClawAgent(...) {
  const sessionManager = new SessionManager({
    host: '127.0.0.1',
    port: 18789,
    token: process.env['OPENCLAW_GATEWAY_TOKEN'],
    reconnectDelay: 5000,
    maxRetries: 3
  });
  
  await sessionManager.connect();
  
  const spawnResponse = await sessionManager.sessionsSpawn({
    model,
    thinking: 'low',
    workspace: '/Users/jasontang/clawd',
    skills: options?.skills || [],
    systemPrompt: options?.systemPrompt,
    sandbox: {
      mode: 'non-main',
      allowedTools: ['read', 'write', 'edit', 'exec', 'browser', 'web_search'],
      deniedTools: ['gateway', 'discord', 'slack'],
    }
  });
  
  return spawnResponse;
}
```

**Success Metrics:**
- Agents successfully spawn via WebSocket
- Session keys are properly tracked
- Budget tracking receives actual usage data
- Self-improvement cycle produces real code changes

**Expected Cost:** $0.50-1.00 (developer time for fix)
**Time Estimate:** 2-4 hours

---

### P1: Add Result Capture and Verification

**Priority:** HIGH

**Description:** Current implementation spawns agents but doesn't capture results or verify improvements. Need to:
1. Capture agent output and file changes
2. Run tests to verify changes don't break anything
3. Measure actual metrics (test coverage, code quality)

**Implementation:**
```typescript
// Add to runImprovementCycle()
const executor = createAgentExecutor(sessionManager);

// Execute and capture results
const execution = await executor.execute({
  task: agentConfig.task,
  model: agentConfig.model,
  timeout: 300000,
  maxRetries: 2,
  onProgress: (exec) => console.log(`  Status: ${exec.status}`),
  onResult: (result) => console.log(`  Tool: ${result.tool}`)
});

// Verify changes
const verification = await verifyImprovement(area, execution);
result.metrics = verification.metrics;
result.success = verification.success;
```

**Success Metrics:**
- File changes are captured and committed
- Tests run after each improvement cycle
- Coverage delta is measured
- Broken changes are rolled back

**Expected Cost:** $2-5 per cycle
**Time Estimate:** 4-6 hours

---

### P2: Implement Feedback Loop Integration

**Priority:** HIGH

**Description:** The LearningEngine and ImprovementStore exist but aren't fully utilized. Need to:
1. Use strategy recommendations before spawning agents
2. Feed actual results back into learning system
3. A/B test different improvement approaches

**Current State:**
```typescript
// Currently runs but doesn't use recommendations
if (learningEngine) {
  const recommendations = await learningEngine.recommendStrategies(area, 1);
  // Recommendations logged but not used to configure agents
}
```

**Target State:**
```typescript
// Use recommendations to configure agents
if (learningEngine && recommendations.length > 0) {
  const bestStrategy = recommendations[0];
  agentConfig.model = selectModelBasedOnStrategy(bestStrategy);
  agentConfig.budgetLimit = bestStrategy.estimatedBudget;
  agentConfig.task = optimizeTaskForStrategy(agentConfig.task, bestStrategy);
}
```

**Success Metrics:**
- Strategy recommendations affect agent configuration
- A/B tests automatically start for new strategies
- Success rate improves over time as learning accumulates

**Expected Cost:** $1-3 per cycle during learning phase
**Time Estimate:** 3-5 hours

---

### P3: Add Code Quality Metrics

**Priority:** MEDIUM

**Description:** Current metrics are placeholders. Need actual measurement:
1. Test coverage (using existing coverage tools)
2. Code complexity (cyclomatic complexity)
3. Type safety (TypeScript strictness)
4. Lint violations

**Implementation:**
```typescript
interface CodeQualityMetrics {
  testCoverage: number;
  complexity: number;
  typeErrors: number;
  lintErrors: number;
  linesOfCode: number;
}

async function measureQuality(): Promise<CodeQualityMetrics> {
  // Run coverage report
  const coverage = await exec('npm run test -- --coverage --json');
  
  // Run type check
  const typeCheck = await exec('npx tsc --noEmit 2>&1 | wc -l');
  
  // Run linter
  const lint = await exec('npm run lint -- --format json');
  
  return parseMetrics(coverage, typeCheck, lint);
}
```

**Success Metrics:**
- Quality metrics measured before/after each cycle
- Coverage delta tracked
- Type errors trend downward
- Measurable improvement in code health

**Expected Cost:** $0.50-1 per cycle (test execution time)
**Time Estimate:** 4-6 hours

---

### P4: Safety and Rollback Mechanisms

**Priority:** MEDIUM

**Description:** Current safety is limited to forbidden patterns. Need:
1. Git integration for automatic branching
2. Automatic rollback on test failure
3. Human approval for high-risk changes
4. Change size limits

**Implementation:**
```typescript
// Before improvement cycle
const branchName = `self-improve/${area}/${timestamp}`;
await exec(`git checkout -b ${branchName}`);

// After improvement cycle
if (result.success && testsPass) {
  await exec(`git add . && git commit -m "Auto-improve: ${area}"`);
  console.log(`✅ Changes committed to ${branchName}`);
} else {
  await exec(`git checkout main && git branch -D ${branchName}`);
  console.log(`❌ Changes rolled back`);
}
```

**Success Metrics:**
- All changes happen on isolated branches
- Failed improvements automatically rolled back
- No direct commits to main branch
- Human can review before merge

**Expected Cost:** $0 (no API calls)
**Time Estimate:** 3-4 hours

---

## 3. Success Metrics per Improvement

| Improvement | Metric | Target | Measurement |
|-------------|--------|--------|-------------|
| **P0: Gateway Fix** | Agent spawn success rate | 100% | % of successful spawns |
| **P1: Result Capture** | Changes with verification | 80% | % of cycles with verified changes |
| **P2: Feedback Loop** | Strategy success rate | >60% | LearningEngine success rate |
| **P3: Quality Metrics** | Test coverage delta | +5%/cycle | Measured coverage change |
| **P4: Safety** | Rollback incidents | <5% | % of cycles requiring rollback |

---

## 4. Expected Cost and Time

### One-Time Implementation Costs

| Task | Developer Time | API Cost | Total |
|------|---------------|----------|-------|
| P0: Gateway Fix | 2-4 hours | $0 | ~$50-100 labor |
| P1: Result Capture | 4-6 hours | $5 | ~$100-150 labor |
| P2: Feedback Loop | 3-5 hours | $5 | ~$75-125 labor |
| P3: Quality Metrics | 4-6 hours | $5 | ~$100-150 labor |
| P4: Safety | 3-4 hours | $0 | ~$75-100 labor |
| **TOTAL** | **16-25 hours** | **$15** | **~$400-625** |

### Per-Cycle Operating Costs

| Configuration | Cost/Cycle | Description |
|--------------|-----------|-------------|
| Conservative | $2-5 | 3 agents, simple tasks |
| Standard | $5-10 | Full swarm, all areas |
| Aggressive | $10-20 | Multiple iterations, large swarms |

### Time Estimates

| Cycle Type | Duration | Frequency |
|------------|----------|-----------|
| Quick Check | 5-10 min | Manual trigger |
| Standard Cycle | 15-30 min | Daily |
| Deep Improvement | 1-2 hours | Weekly |

---

## 5. Verification Criteria

### Before Activation

- [ ] P0 Fix: `spawnOpenClawAgent()` uses SessionManager WebSocket API
- [ ] Agents successfully connect to OpenClaw Gateway
- [ ] Budget tracking receives actual usage data
- [ ] Tests pass after `npm run build`

### After Each Improvement

- [ ] Changes committed to isolated branch
- [ ] Tests run and pass
- [ ] Quality metrics measured
- [ ] Results recorded in ImprovementStore
- [ ] LearningEngine updated with outcomes

### Continuous Monitoring

- [ ] Success rate tracked per strategy
- [ ] Budget usage within limits
- [ ] No broken builds on main
- [ ] Improvement trends visible in dashboard

---

## 6. Continuous Improvement Loop

### 6.1 How Often to Run

| Trigger | Frequency | Budget | Use Case |
|---------|-----------|--------|----------|
| Scheduled | Daily at 2 AM | $5 | Routine maintenance |
| On Commit | Per merge to main | $2 | Quick quality checks |
| Manual | On demand | $10-20 | Deep improvement sessions |
| Triggered | On test failure | $3 | Targeted bug fixes |

### 6.2 What Triggers Manual Intervention

**Auto-Rollback Triggers:**
- Test failures after improvement
- Budget exceeds 150% of estimate
- Build breaks
- Coverage decreases >2%

**Human Approval Required:**
- Changes to core infrastructure files
- Budget exceeds $20 for single cycle
- Security-related modifications
- Database schema changes

### 6.3 Measuring Cumulative Improvement

**Weekly Metrics:**
```
Week of 2026-02-02:
- Improvements attempted: 15
- Success rate: 73% (11/15)
- Budget spent: $12.50
- Test coverage: 45% → 52% (+7%)
- Type errors: 23 → 15 (-8)
- Lint violations: 45 → 38 (-7)
```

**Monthly Review:**
- Trend analysis of success rates
- Strategy effectiveness rankings
- Cost-per-improvement metrics
- Code health score evolution

**Quarterly Strategy:**
- Retire ineffective strategies
- Promote high-performing strategies
- Adjust budget allocations
- Update target metrics

---

## 7. Pilot Self-Improvement Cycle Results

### What Happened (Actual Test Run)

```
🚀 Starting Dash Self-Improvement Session
   Budget: $10
   Max tokens per agent: 100000
[Orchestrator] Budget tracking initialized
[Orchestrator] Learning Engine initialized
[Orchestrator] Improvement Store initialized

📊 Running codeQuality improvement cycle...
   Created swarm: swarm_1770061463786_bxglry370
   ❌ Failed to spawn code-analyzer: Method Not Allowed
   ❌ Failed to spawn refactor-agent: Method Not Allowed
   ❌ Failed to spawn test-agent: Method Not Allowed
   ✅ codeQuality cycle complete: 0 agents, $0.00 used

📊 Running documentation improvement cycle...
   ❌ Failed to spawn docs-auditor: Method Not Allowed
   ❌ Failed to spawn docs-writer: Method Not Allowed
   ✅ documentation cycle complete: 0 agents, $0.00 used

📊 Running testing improvement cycle...
   ❌ Failed to spawn coverage-analyzer: Method Not Allowed
   ❌ Failed to spawn test-generator: Method Not Allowed
   ✅ testing cycle complete: 0 agents, $0.00 used

╔══════════════════════════════════════════════════════════════╗
║           DASH SELF-IMPROVEMENT REPORT                       ║
╠══════════════════════════════════════════════════════════════╣
║ Iteration: 1
║ Duration: ~15s
║ Total Budget Used: $0.00
║ Remaining Budget: $10.00
╠══════════════════════════════════════════════════════════════╣
║ IMPROVEMENTS:
║   ❌ codeQuality: 0 changes, $0.00
║   ❌ documentation: 0 changes, $0.00
║   ❌ testing: 0 changes, $0.00
╠══════════════════════════════════════════════════════════════╣
║ ERRORS:
║   - Failed to spawn code-analyzer: Method Not Allowed
║   - (5 more similar errors)
╚══════════════════════════════════════════════════════════════╝
```

### Analysis

**Good:**
- Orchestrator runs end-to-end
- Budget tracking initializes correctly
- Swarm creation works
- Agent registration works
- Error handling captures issues
- Report generation works

**Bad:**
- OpenClaw integration broken (P0 issue)
- No actual agents spawned
- No real improvements made
- Learning data is all failures

**Next Steps:**
1. Fix P0 (WebSocket integration)
2. Re-run pilot
3. Verify agent execution
4. Measure actual improvements

---

## 8. Implementation Roadmap

### Phase 1: Foundation (Week 1)
- [ ] Fix P0: OpenClaw Gateway WebSocket integration
- [ ] Verify agents spawn successfully
- [ ] Confirm budget tracking receives real data
- [ ] Re-run pilot with working integration

### Phase 2: Verification (Week 2)
- [ ] Implement P1: Result capture and verification
- [ ] Add test execution after improvements
- [ ] Implement P4: Git branching and rollback
- [ ] First verified improvement cycle

### Phase 3: Intelligence (Week 3)
- [ ] Implement P2: Full feedback loop integration
- [ ] Enable A/B testing for strategies
- [ ] Implement P3: Quality metrics
- [ ] Dashboard shows improvement trends

### Phase 4: Optimization (Week 4)
- [ ] Tune strategy effectiveness
- [ ] Optimize budget allocation
- [ ] Automate daily improvement cycles
- [ ] Document best practices

---

## 9. Anti-Patterns to Avoid

### Don't: Skip Verification
```typescript
// BAD: Assume success
result.success = true;

// GOOD: Verify
result.success = await runTests() && await checkCoverage();
```

### Don't: Ignore Budget
```typescript
// BAD: No budget check
await spawnAgent(config);

// GOOD: Check budget first
if (state.totalBudgetUsed + config.budget > MAX_BUDGET) {
  skipAgent();
}
```

### Don't: Modify Main Directly
```typescript
// BAD: Direct commit to main
await exec('git commit -m "improvement"');

// GOOD: Branch and PR
await exec('git checkout -b self-improve/xyz');
// ... changes ...
await exec('git push origin self-improve/xyz');
```

### Don't: Ignore Failures
```typescript
// BAD: Swallow errors
} catch (error) {
  // ignore
}

// GOOD: Record and learn
} catch (error) {
  await learningEngine.recordFailure({ error, context });
}
```

---

## 10. Conclusion

Dash v2.0 has a **complete and sophisticated self-improvement architecture** that is currently blocked by a single integration issue (P0). Once the WebSocket-based OpenClaw Gateway integration is fixed, the system is ready for:

1. **Immediate use** for targeted improvements
2. **Learning accumulation** for strategy optimization
3. **Continuous operation** for ongoing code quality maintenance

**The infrastructure is there. The potential is there. We just need to connect the final wire.**

---

## Appendix A: Quick Commands

```bash
# Run self-improvement cycle
dash self-improve run --area testing --iterations 1

# Check status
dash self-improve status

# Build after changes
npm run build

# Run tests
npm test

# Manual orchestrator test
node dist/self-improvement/orchestrator.js
```

## Appendix B: Key Files

| File | Purpose |
|------|---------|
| `src/self-improvement/orchestrator.ts` | Main orchestration logic |
| `src/self-improvement/config.ts` | Swarm configurations |
| `src/integrations/openclaw/SessionManager.ts` | WebSocket API client |
| `src/integrations/openclaw/AgentExecutor.ts` | Agent lifecycle management |
| `src/integrations/openclaw/LearningEngine.ts` | Strategy optimization |
| `src/integrations/openclaw/ImprovementStore.ts` | Data persistence |
| `src/cli/commands/self-improve.ts` | CLI interface |

## Appendix C: Environment Variables

```bash
# Required
OPENCLAW_GATEWAY_URL=ws://127.0.0.1:18789
OPENCLAW_GATEWAY_TOKEN=your_token_here

# Optional
DASH_MAX_BUDGET=10.0
DASH_DB_PATH=./dash.db
```
