# PRD: Dash v2.0 TypeScript Error Resolution

**Version:** 1.0
**Date:** 2026-02-04
**Status:** Draft → Review → Approved
**Priority:** P0 - Critical Blocker

## Problem Statement

Dash v2.0 has **269 TypeScript errors** blocking:
- CLI compilation (`npm run build`)
- Dev mode (`npm run dev`)
- Production deployment

This is technical debt preventing the CLI from being usable while the orchestrator runs autonomously.

## Goals

- Goal 1: Reduce TypeScript errors from 269 to 0
- Goal 2: Enable `npm run build` to complete successfully
- Goal 3: Make CLI commands executable
- Goal 4: Complete resolution within 2 hours using parallel agents

## Requirements

### Functional Requirements

- [ ] FR1: Fix all 269 TypeScript errors
- [ ] FR2: `npm run build` completes with 0 errors
- [ ] FR3: `./dist/cli/index.js --help` works
- [ ] FR4: All API exports are available
- [ ] FR5: Dashboard UI builds without errors

### Non-Functional Requirements

- [ ] NFR1: Resolution within 2 hours
- [ ] NFR2: Use parallel agents (3-5 simultaneous)
- [ ] NFR3: No regression in orchestrator functionality
- [ ] NFR4: All fixes verified with build command

## Success Criteria

- [ ] Criteria 1: `npm run build` returns 0 errors
- [ ] Criteria 2: CLI help command executes successfully
- [ ] Criteria 3: All 7 agent tasks report completion
- [ ] Criteria 4: Build artifacts created in `dist/`

## Out of Scope

- Dashboard UI dependency installation (separate task)
- OpenAPI spec generation
- Performance optimization
- New features

## Timeline

- **Phase 1 (Quick Fixes):** 30 minutes
- **Phase 2 (Medium Fixes):** 45 minutes  
- **Phase 3 (Dashboard UI):** 30 minutes
- **Total:** ~2 hours

## Stakeholders

- Product Owner: Dash User
- Tech Lead: Autonomous Agents
- QA: Automated Build Verification

## Error Categories

| Category | Count | Severity | Phase |
|----------|-------|----------|-------|
| Index Signature Access | ~90 | Medium | 1 |
| Missing Exports | ~20 | High | 1 |
| Duplicate Functions | ~5 | High | 1 |
| Return Types | ~5 | Medium | 2 |
| CLI Module Exports | ~10 | High | 2 |
| OpenTelemetry | ~10 | Medium | 2 |
| Dashboard UI | ~50 | Medium | 3 |

## Parallel Agent Plan

7 agents working in parallel:
1. **codex**: Index Signature fixes (90 errors)
2. **kimi**: Missing API exports (20 errors)
3. **claude**: Duplicate functions (5 errors)
4. **codex**: Return type errors (5 errors)
5. **kimi**: CLI module exports (10 errors)
6. **claude**: OpenTelemetry issues (10 errors)
7. **kimi**: Dashboard UI (50 errors)

## Dependencies

- All agents need shell access to `/Users/jasontang/clawd/projects/dash`
- All agents need to run `npm run build` for verification
- Agents must coordinate to avoid conflicts

## Risks

| Risk | Mitigation |
|------|------------|
| Agent stub reports | Verify with `npm run build` before accepting |
| Merge conflicts | Separate files per agent |
| Timeout | Increase timeout to 600s per agent |
