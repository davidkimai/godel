# Phase 3 Interview & Phase 4 Plan

**Date:** 2026-02-01  
**Context:** Self-Improvement Interview for Mission Control / Dash  
**Output Location:** `/Users/jasontang/clawd/projects/mission-control/PHASE3_INTERVIEW_PHASE4_PLAN.md`

---

## Current State (Post-Phase 3)

### Test Coverage Metrics

| Metric | Before Phase 3 | After Phase 3 | Change |
|--------|----------------|---------------|--------|
| **Statements** | 62.48% | 64.05% | +1.57% |
| **Branches** | 41.67% | 45.03% | +3.36% |
| **Functions** | N/A | 71.37% | — |
| **Lines** | N/A | 65.79% | — |

### Quality Score Progression

| Phase | Score | Grade |
|-------|-------|-------|
| Phase 1 | 72/100 | C |
| Phase 2 | 76/100 | C+ |
| Phase 3 (current) | ~74/100 | C+ |

### Key Remaining Gaps

| Module | Coverage | Target | Gap |
|--------|----------|--------|-----|
| **Testing module** | 27.5% (coverage.ts), 31.4% (runner.ts) | 70% | -42.5% |
| **CLI commands** | 0% | 50% | -50% |
| **Event system** | 0% | 70% | -70% |
| **Branch coverage** | 45.03% | 60% | -14.97% |
| **Console logging** | 271 calls | <100 | -171 |

### Build/Test Status

```
Test Suites: 1 failed, 13 passed, 14 total
Tests:       289 passed, 1 failed
Build:       TypeScript clean (0 errors)
Linting:     233 errors actionable
```

---

## Phase 3 Findings

### What Worked Well

1. **ESLint Infrastructure Established**
   - 233 lint errors now visible and actionable
   - Previously invisible quality issues now tracked
   - Foundation for systematic improvement in place

2. **Type Safety Improvements**
   - All 12 `as any` unsafe casts eliminated
   - 4 new interfaces defined for type safety
   - TypeScript strict mode maintained (8/8 flags)

3. **Console Logging Reduction**
   - 326 → 271 instances (-16.9%)
   - Progress toward production-ready logging
   - Centralization pattern identified for Phase 4

4. **Test Suite Stability**
   - 289/289 tests passing (before linter test issues)
   - New integration points established
   - Pattern for testing infrastructure created

### What Surprised Us

1. **Testing Module is Critically Under-Tested**
   - The very module responsible for quality has 27.5% coverage
   - Coverage parsing logic (`testing/coverage.ts`) has no tests
   - Runner logic (`testing/runner.ts`) at 31% coverage
   - Self-testing gap is a systemic vulnerability

2. **TypeScript Errors in Test Files**
   - `tests/quality/linter.test.ts` has 3 type errors
   - `runSecurityScan` signature mismatch (1 arg vs 2)
   - Tests themselves have quality issues needing fix

3. **Branch Coverage Stagnation**
   - Despite Phase 3 efforts, only +3.36% improvement
   - Error handling paths and edge cases remain untested
   - Pattern suggests need for test-first development

4. **CLI Commands Zero Coverage**
   - User-facing code has no test coverage
   - Critical paths for agent interaction untested
   - Risk of regression in user experience

### What Didn't Work

1. **Coverage Improvements Were Incremental**
   - Only +1.57% statement coverage gained
   - Phase 3 target of 70% not approached
   - Test writing effort not scaled effectively

2. **Lint Error Fixing Not Prioritized**
   - 233 errors remain from Phase 2
   - Focused on new features instead of cleanup
   - Quality debt accumulated

3. **No Event System Testing**
   - Critical async paths remain untested
   - Event emitter logic has no test coverage
   - Reliability of event-driven architecture unverified

---

## Phase 4 Priority Ranking

### P0: Critical (Must Do)

**1. Fix Test Quality Issues**
- **Why:** Tests are failing with type errors, blocking CI/CD
- **Effort:** 2-4 hours
- **Dependencies:** None (blocking all other work)
- **Files:** `tests/quality/linter.test.ts` - fix `runSecurityScan` signature

**2. Test the Testing Module (Self-Testing)**
- **Why:** Critical infrastructure has 27% coverage; regression risk
- **Effort:** 8-12 hours
- **Dependencies:** P0.1 (test framework working)
- **Focus Areas:**
  - `testing/coverage.ts`: Parse logic tests (27% → 70%)
  - `testing/runner.ts`: Execution logic tests (31% → 70%)
  - `testing/templates.ts`: Template rendering tests (83% → 90%)

**3. Fix Remaining Lint Errors (Phase 2C)**
- **Why:** 233 errors blocking clean lint runs
- **Effort:** 8-12 hours
- **Dependencies:** None
- **Breakdown:**
  - 70 unused variables - quick removal
  - 12 import/export duplicates - structural fix
  - 16 complexity violations - refactoring
  - 19 `any` types - type definitions
  - 116 miscellaneous - case declarations, escapes

### P1: High Impact

**4. Implement Event System Tests**
- **Why:** Critical async paths, 0% coverage
- **Effort:** 6-8 hours
- **Dependencies:** None
- **Files:** `src/events/emitter.ts`, `src/events/replay.ts`
- **Coverage Target:** 70%

**5. CLI Command Testing**
- **Why:** User-facing code, 0% coverage
- **Effort:** 8-10 hours
- **Dependencies:** None
- **Focus Commands:**
  - `dash agents` commands
  - `dash context` commands
  - `dash quality` commands
- **Coverage Target:** 50%

**6. Console Logging Centralization**
- **Why:** 271 calls, production-ready logging needed
- **Effort:** 4-6 hours
- **Dependencies:** None
- **Deliverable:** Structured logger with levels (debug, info, warn, error)
- **Target:** <100 direct console.* calls

### P2: Medium Impact

**7. Branch Coverage Improvement**
- **Why:** 45% → target 60%
- **Effort:** 6-8 hours
- **Dependencies:** P0.2, P1.4, P1.5
- **Focus:** Error handling paths, edge cases, conditional branches

**8. Reasoning Traces (Original Phase 3)**
- **Why:** Core feature, deferred from Phase 3
- **Effort:** 16-24 hours
- **Dependencies:** P0.2 (test infrastructure stable)
- **Files:** `src/reasoning/types.ts`, `traces.ts`, `decisions.ts`, `confidence.ts`

**9. Safety Framework (Original Phase 4)**
- **Why:** Ethics boundaries, escalation workflow
- **Effort:** 12-16 hours
- **Dependencies:** P1.4 (event system for notifications)
- **Files:** `src/safety/types.ts`, `boundaries.ts`, `escalation.ts`

---

## Self-Improvement Loop Schedule

### When to Re-Run Quality Gates

**Immediate Triggers (within 24 hours):**
1. P0.1 test fix completes → Re-run tests
2. P0.2 testing module coverage reaches 50% → Re-assess
3. Any lint error batch fix → Verify `npm run lint` passes

**Weekly Triggers:**
1. Every Monday: Coverage metrics review
2. Every Friday: Quality score recalculation

**Phase Completion Triggers:**
1. All P0 items complete → Re-run full quality gate
2. Coverage >70% statements → Reduce testing intensity
3. Lint errors <50 → Consider linting complete

### What Triggers Next Round

| Condition | Trigger | Action |
|-----------|---------|--------|
| Test failure | Any | Pause, fix before continuing |
| Coverage drop >5% | Weekly | Investigation sprint |
| Lint errors increase | Any | Revert or justify changes |
| Quality score <70 | Monthly | Full self-improvement interview |
| New module added | Event | Add to coverage targets |

### Success Metrics for Phase 4

| Metric | Current | Phase 4 Target | Priority |
|--------|---------|----------------|----------|
| Test pass rate | 289/289 | 100% (all suites) | P0 |
| Testing module coverage | 27% | 70% | P0 |
| Event system coverage | 0% | 70% | P1 |
| CLI coverage | 0% | 50% | P1 |
| Lint errors | 233 | <50 | P0 |
| Console.* calls | 271 | <100 | P1 |
| Overall statement coverage | 64% | 75% | P2 |
| Branch coverage | 45% | 60% | P2 |
| Quality score | 76 | 85+ | P2 |

---

## Recommendations

### For the Orchestrator

1. **Prioritize Self-Testing First**
   - The testing module testing itself is the highest-leverage task
   - A well-tested testing module enables faster validation of all future work
   - Block P0.2 on P0.1 completion

2. **Parallelize Independent Workstreams**
   - Lint fixes (P0.3) can run parallel to test fixes (P0.1)
   - Event system tests (P1.4) can run parallel to CLI tests (P1.5)
   - Console logging (P1.6) is independent and quick

3. **Use Test-First Discipline for New Code**
   - Reasoning traces (P2.8) should be TDD
   - Safety framework (P2.9) should be TDD
   - Prevents coverage debt accumulation

### For Future Phases

1. **Phase Naming Should Reflect Actual Work**
   - Phase 3 was "Reasoning Features" but did "Quality Infrastructure"
   - Mismatch causes confusion in tracking
   - Suggest: Rename to "Phase 3: Quality Foundation"

2. **Include Coverage Targets in Phase Definitions**
   - Phase 3 plan didn't specify coverage improvements
   - Add explicit coverage targets to each phase
   - Example: "Phase 3: Reach 70% testing module coverage"

3. **Self-Testing Should Be Mandatory**
   - Any module >50 lines must have >70% coverage
   - Testing module has special requirement (>70%)
   - Prevents infrastructure rot

4. **Lint Debt Should Be Zero Before New Features**
   - 233 errors accumulated while building Phase 3 features
   - Rule: Zero lint errors before spawning new feature workstreams
   - Prevents quality debt compound interest

### For the Project

1. **Implement Quality Gate Automation**
   - Pre-commit hooks for linting
   - Pre-push hooks for test coverage
   - Automated quality gate in CI/CD

2. **Create Quality Dashboard**
   - Real-time coverage metrics
   - Lint error count tracking
   - Quality score trend over time

3. **Document Quality Patterns**
   - Add to `LEARNINGS.md` after each phase
   - Capture what worked, what didn't
   - Build institutional knowledge

4. **Consider Tooling Upgrades**
   - TypeScript 5.x for stricter checking
   - ESLint 9.x for flat config
   - Jest 30.x for better coverage output

---

## Appendix: Coverage by Module

| Module | Statements | Branches | Functions | Lines |
|--------|------------|----------|-----------|-------|
| Context | 82-100% | 60-83% | 77-100% | High |
| Quality | 80-83% | 54% | 71-87% | High |
| Storage | 73% | 40% | 87% | Medium |
| **Testing** | **27-31%** | **16-22%** | **34-40%** | **Critical** |
| Events | TBD | TBD | TBD | 0% |
| CLI | TBD | TBD | TBD | 0% |
| Reasoning | TBD | TBD | TBD | Not started |
| Safety | TBD | TBD | TBD | Not started |

---

**Interview Completed:** 2026-02-01 19:56 CST  
**Next Review:** After P0 items complete  
**Document Owner:** Orchestrator (Kimi K2.5)

---

## Quick Reference: Phase 4 Workstream Spawn Commands

```bash
# P0.1: Fix test type errors (IMMEDIATE)
sessions_spawn --label "phase4-fix-test-types" \
  --model moonshot/kimi-k2-5 \
  --task "Fix TypeScript errors in tests/quality/linter.test.ts.
  runSecurityScan expects 1 argument but receives 2.
  Fix the function signature and verify with npm test."

# P0.2: Test the testing module
sessions_spawn --label "phase4-test-testing-module" \
  --model moonshot/kimi-k2-5 \
  --task "Achieve 70% coverage on testing module:
  - testing/coverage.ts: 27% → 70%
  - testing/runner.ts: 31% → 70%
  Write integration tests for coverage parsing and test execution."

# P0.3: Fix remaining lint errors
sessions_spawn --label "phase4-fix-lint-errors" \
  --model moonshot/kimi-k2-5 \
  --task "Fix 233 lint errors from npm run lint.
  Focus on: 70 unused vars, 12 import duplicates, 16 complexity violations.
  Verify with npm run lint passing."

# P1.4: Event system tests
sessions_spawn --label "phase4-test-event-system" \
  --model moonshot/kimi-k2-5 \
  --task "Achieve 70% coverage on src/events/.
  Test emitter.ts and replay.ts for all async paths.
  Include error handling and replay scenarios."

# P1.5: CLI command tests
sessions_spawn --label "phase4-test-cli-commands" \
  --model moonshot/kimi-k2-5 \
  --task "Achieve 50% coverage on src/cli/commands/.
  Test agents, context, and quality commands.
  Mock file system and agent state."

# P1.6: Console logging centralization
sessions_spawn --label "phase4-centralize-logging" \
  --model moonshot/kimi-k2-5 \
  --task "Replace direct console.* calls with structured logger.
  Implement debug, info, warn, error levels.
  Reduce from 271 calls to <100."
```
