# Dash Production Readiness - Phased Roadmap

## Overview
**Goal:** Fix critical blockers and achieve production-ready Dash v2.0
**Approach:** Parallel Codex swarms, one per phase, with clear boundaries
**Backup:** All changes committed to github.com/davidkimai/dash

---

## Phase 1: Critical Build Fixes (P0) - FOUNDATION
**Objective:** Fix all TypeScript compilation errors
**Blockers:** 13 errors in src/safety/budget.ts

### Tasks
1. **Fix duplicate identifiers** (lines 393-412)
   - Remove duplicate `taskId`, `projectId`, `model`, `swarmId` declarations
   - Consolidate function overloads
   
2. **Fix type mismatches** (line 819)
   - Align `ThresholdCheckResult` with `BudgetTracking` interface
   - Ensure proper property mapping
   
3. **Fix function signature errors** (lines 866, 888, 895)
   - Correct argument counts
   - Update call sites to match signatures

### Success Criteria
- [ ] `npm run build` exits with 0 errors
- [ ] No TypeScript compilation warnings
- [ ] All existing tests still pass

### Files to Modify
- `src/safety/budget.ts` (primary)
- May need: `src/safety/thresholds.ts` (for type alignment)

---

## Phase 2: Create Missing Orchestrator (P0) - AUTONOMY
**Objective:** Implement the missing orchestrator-v3.js for 24/7 autonomous operation

### Tasks
1. **Create core orchestrator** (`.dash/orchestrator-v3.js`)
   - Health check loop (every 1 min)
   - Build status monitoring
   - Swarm lifecycle management
   
2. **Implement state management**
   - Read/write `.dash/orchestrator-state.json`
   - Track active swarms, metrics, decisions
   - Handle crash recovery
   
3. **Add swarm spawning logic**
   - Detect build failures → spawn bugfix swarms
   - Detect low coverage → spawn coverage swarms
   - Enforce max concurrent swarms limit
   
4. **Implement decision engine**
   - Parse build output for errors
   - Prioritize actions (CRITICAL > HIGH > MEDIUM)
   - Cooldown management to prevent spam

### Success Criteria
- [ ] `node .dash/orchestrator-v3.js --health` returns healthy
- [ ] Orchestrator can spawn swarms via `codex` CLI
- [ ] State file updates correctly
- [ ] Handles graceful shutdown

### Files to Create
- `.dash/orchestrator-v3.js` (main)
- `.dash/lib/state.js` (state management)
- `.dash/lib/swarm-spawner.js` (spawn logic)

---

## Phase 3: Integration Tests (P1) - QUALITY
**Objective:** Add integration tests for critical paths

### Tasks
1. **Create orchestrator integration tests**
   - Test health check cycle
   - Test swarm spawn/kill
   - Test state persistence
   
2. **Create CLI integration tests**
   - Test `dash agents spawn`
   - Test `dash tasks create/assign/complete`
   - Test budget tracking end-to-end
   
3. **Create OpenClaw Gateway integration tests**
   - Test session spawning
   - Test message passing
   - Test event streaming

### Success Criteria
- [ ] 20+ new integration tests added
- [ ] Tests cover orchestrator lifecycle
- [ ] Tests cover CLI end-to-end flows
- [ ] `npm test` passes with >80% coverage

### Files to Create
- `tests/integration/orchestrator.test.ts`
- `tests/integration/cli.test.ts`
- `tests/integration/openclaw.test.ts`

---

## Phase 4: Cleanup & Documentation (P1) - MAINTAINABILITY
**Objective:** Clean stale worktrees, update docs, finalize

### Tasks
1. **Clean up stale worktrees**
   - Remove 8+ prunable worktrees
   - Fix nested worktree pollution
   - Update `.gitignore` if needed
   
2. **Update SKILL.md**
   - Add orchestrator usage instructions
   - Document new autonomous features
   - Update quick start guide
   
3. **Create DEPLOYMENT.md**
   - Production deployment guide
   - Environment setup
   - Cron job configuration
   
4. **Verify all secrets are placeholders**
   - Check `.env.example`
   - Check config files
   - Run security scan

### Success Criteria
- [ ] All stale worktrees removed
- [ ] `git worktree list` shows clean state
- [ ] Documentation updated
- [ ] No secrets in codebase

### Files to Modify
- `.gitignore`
- `SKILL.md`
- Create: `DEPLOYMENT.md`

---

## Phase 5: Final Verification (P2) - VALIDATION
**Objective:** Complete end-to-end validation before production

### Tasks
1. **Run full test suite**
   - Unit tests
   - Integration tests
   - End-to-end CLI tests
   
2. **Verify build pipeline**
   - Clean install: `npm ci`
   - Build: `npm run build`
   - Test: `npm test`
   - Lint: `npm run lint`
   
3. **Test orchestrator manually**
   - Start orchestrator
   - Verify heartbeat every 1 min
   - Induce build failure, verify recovery
   
4. **Performance check**
   - Build time < 30 seconds
   - Test suite < 60 seconds
   - Orchestrator overhead < 5% CPU

### Success Criteria
- [ ] All tests pass
- [ ] Build pipeline clean
- [ ] Orchestrator runs autonomously for 10+ minutes
- [ ] Documentation complete

---

## Dependencies Between Phases

```
Phase 1 (Build Fixes)
    ↓ [BLOCKING]
Phase 2 (Orchestrator)
    ↓ [BLOCKING]
Phase 3 (Integration Tests)
    ↓ [RECOMMENDED]
Phase 4 (Cleanup)
    ↓ [RECOMMENDED]
Phase 5 (Verification)
```

**Note:** Phase 1 MUST complete before Phase 2. Phase 2 MUST complete before Phase 3.
Phases 4 and 5 can run in parallel with 3 after orchestrator is functional.

---

## Swarm Launch Commands

```bash
# Phase 1: Build Fixes
codex "Fix TypeScript build errors in src/safety/budget.ts. Remove duplicate identifiers (taskId, projectId, model, swarmId), fix type mismatches between ThresholdCheckResult and BudgetTracking, correct function signatures. Run npm run build to verify 0 errors."

# Phase 2: Orchestrator
codex "Create .dash/orchestrator-v3.js for autonomous operation. Implement: 1) Health check loop every 1 min, 2) Build status monitoring, 3) Swarm spawning for bugfix/coverage, 4) State management in .dash/orchestrator-state.json, 5) Decision engine with priorities. Test with node .dash/orchestrator-v3.js --health"

# Phase 3: Integration Tests
codex "Add integration tests for Dash. Create: 1) tests/integration/orchestrator.test.ts - test orchestrator lifecycle, 2) tests/integration/cli.test.ts - test CLI commands end-to-end, 3) tests/integration/openclaw.test.ts - test Gateway integration. Ensure 20+ tests with >80% coverage."

# Phase 4: Cleanup
codex "Clean up Dash repository. 1) Remove stale worktrees: git worktree prune && rm -rf .claude-worktrees/sprint-*/, 2) Update SKILL.md with orchestrator docs, 3) Create DEPLOYMENT.md guide, 4) Verify no secrets in codebase."

# Phase 5: Verification
codex "Final verification of Dash. 1) Run full test suite npm test, 2) Verify build pipeline npm ci && npm run build, 3) Test orchestrator manually for 10 min, 4) Performance check. Document results."
```

---

## Backup Strategy

After EACH phase completes:
```bash
cd /Users/jasontang/clawd/projects/dash
git add -A
git commit -m "backup: Phase X complete - [description]"
git push origin main
```

**CRITICAL:** Replace all secrets with placeholders before committing:
- API keys → `your_api_key_here`
- Tokens → `your_token_here`
- Passwords → `your_password_here`

---

## Estimated Timeline

| Phase | Duration | Swarm |
|-------|----------|-------|
| Phase 1 | 2-4 hours | codex |
| Phase 2 | 4-6 hours | codex |
| Phase 3 | 6-8 hours | codex |
| Phase 4 | 2-3 hours | codex |
| Phase 5 | 2-3 hours | codex |
| **Total** | **16-24 hours** | **5 swarms** |

---

## Success Metrics

- Build: 0 TypeScript errors
- Tests: >80% coverage, all passing
- Orchestrator: Runs 24/7 autonomously
- Documentation: Complete and accurate
- Security: No secrets in repo

---

*Roadmap created: 2026-02-03*
*Target: Production-ready Dash v2.0*
