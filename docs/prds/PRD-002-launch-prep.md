# PRD-002: Dash v2.0 Launch Preparation

**Version:** 2.0
**Date:** 2026-02-04
**Status:** Ready for Execution
**Goal:** Production-ready launch with 0 TS errors, stable CLI/API

## Executive Summary

Dash v2.0 has been running 17+ hours with 8/3 active swarms. CLI version 2.0.0 is functional but has 107 TypeScript errors blocking full production readiness. This PRD defines the launch preparation workflow using PRD+SDD patterns.

## Current State

| Metric | Value | Status |
|--------|-------|--------|
| CLI Version | 2.0.0 | ✅ Working |
| Orchestrator Uptime | 17h+ | ✅ Stable |
| Swarm Count | 8/3 | ✅ Healthy |
| TS Errors | 107 | 🔧 In Progress |
| Errors Fixed | 91/198 (46%) | ✅ Progress |

## Launch Requirements

### Must Have (P0)
- [ ] 0 TypeScript errors
- [ ] CLI builds without --skipLibCheck
- [ ] `swarmctl --version` works
- [ ] `swarmctl status` shows healthy
- [ ] API routes respond correctly
- [ ] No blocking runtime errors

### Should Have (P1)
- [ ] Integration tests pass
- [ ] Help text for all commands
- [ ] Error messages are user-friendly
- [ ] Documentation for common workflows

### Nice to Have (P2)
- [ ] Auto-completion scripts
- [ ] Example configurations
- [ ] Tutorial/quickstart guide

## Error Analysis (107 errors remaining)

| Category | Count | Priority | Files |
|----------|-------|----------|-------|
| React UMD global | 15 | Medium | UI components |
| Test matchers | 11 | Low | Test files |
| import.meta ES modules | 3 | Medium | WebSocket |
| Module resolution | 12+ | Medium | UI paths |
| Type mismatches | 66+ | Low | Various |

## Technical Debt Items

1. **tsconfig.json** - Target ES2015+, add esModuleInterop
2. **UI components** - React imports need proper types
3. **Test files** - vitest/jest-dom types missing
4. **Module resolution** - Path aliases may be incorrect

## Execution Strategy

### Phase 1: Quick Wins (15 min)
Launch 3 parallel Codex agents for high-impact fixes.

### Phase 2: Configuration Fixes (10 min)
Fix tsconfig.json for ES modules and iteration.

### Phase 3: Verification (10 min)
Full build verification and CLI testing.

## Launch Criteria

```bash
# Success criteria
npx tsc --noEmit 2>&1 | grep -c "error TS"  # 0
node dist/cli/index.js --version              # 2.0.0
node dist/cli/index.js status                 # healthy
```

## Timeline

| Phase | Duration | Expected End |
|-------|----------|-------------|
| Phase 1 | 15 min | 17:20 |
| Phase 2 | 10 min | 17:30 |
| Phase 3 | 10 min | 17:40 |

**Target Launch:** 17:40 CST
