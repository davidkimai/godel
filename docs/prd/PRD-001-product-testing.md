# PRD-001: Product Testing & Quality Assurance

**Version:** 2.0.0
**Status:** Active
**Created:** 2026-02-04
**Owner:** Dash v2.0 Release
**Based on:** SDD-001 (Architecture-Driven Testing)

## Objective

Ensure Dash v2.0 is production-ready through systematic, SDD-driven product testing covering all architectural layers.

## Test Phases (Aligned with SDD-001)

### Phase 1: Build Verification
**Focus:** SDD Infrastructure Layer

| Test ID | Component | Test Case | Expected | Status |
|---------|-----------|-----------|----------|--------|
| BUILD-001 | TypeScript | `npx tsc --noEmit` | 0 errors | ✅ PASS |
| BUILD-002 | Main Build | `npm run build` | SUCCESS | ✅ PASS |
| BUILD-003 | Dashboard UI | `npm run build` (ui) | SUCCESS | ✅ PASS |

### Phase 2: CLI Layer Tests
**Focus:** SDD CLI Layer Components

| Test ID | Command | Test Case | Expected | Status |
|---------|---------|-----------|----------|--------|
| CLI-001 | `--version` | Version output | `2.0.0` | ✅ PASS |
| CLI-002 | `--help` | Help output | Help text | PENDING |
| CLI-003 | `agent list` | List agents | JSON array | ⚠️ PARTIAL |
| CLI-004 | `agent spawn` | Spawn agent | Agent created | PENDING |
| CLI-005 | `swarm list` | List swarms | JSON array | ⚠️ PARTIAL |
| CLI-006 | `swarm create` | Create swarm | Swarm created | PENDING |
| CLI-007 | `status` | System status | Health output | ⚠️ PARTIAL |
| CLI-008 | `config get` | Get config | Config values | PENDING |

### Phase 3: API Gateway Tests
**Focus:** SDD API Gateway Layer

| Test ID | Endpoint | Method | Expected | Status |
|---------|----------|--------|----------|--------|
| API-001 | `/api/health` | GET | 200 OK | ⚠️ 404 |
| API-002 | `/api/agents` | GET | 200 + JSON | ✅ PASS |
| API-003 | `/api/agents` | POST | 201 Created | PENDING |
| API-004 | `/api/swarm` | GET | 200 + JSON | PENDING |
| API-005 | `/api/status` | GET | 200 + JSON | PENDING |
| API-006 | WebSocket | WS | Connected | PENDING |

### Phase 4: Core Services Tests
**Focus:** SDD Core Services Layer

| Test ID | Service | Test Case | Expected | Status |
|---------|---------|-----------|----------|--------|
| SVC-001 | Agent Manager | Spawn agent | Created | PENDING |
| SVC-002 | Swarm Manager | Create swarm | Created | PENDING |
| SVC-003 | Workflow Engine | Execute workflow | Completed | PENDING |
| SVC-004 | Event Bus | Publish event | Delivered | PENDING |
| SVC-005 | Context Manager | Store context | Saved | PENDING |
| SVC-006 | Safety Manager | Validate action | Validated | PENDING |

### Phase 5: Infrastructure Tests
**Focus:** SDD Infrastructure Layer

| Test ID | Component | Test Case | Expected | Status |
|---------|-----------|-----------|----------|--------|
| INF-001 | SQLite | Read/Write | Success | PENDING |
| INF-002 | Redis | Cache | Success | PENDING |
| INF-003 | Git Worktree | Create | Success | PENDING |

## Test Execution Strategy

### Parallel Testing Matrix

| Phase | Agent | Focus | Duration |
|-------|-------|-------|----------|
| Phase 1 | build-test | TypeScript, npm, dashboard | 2 min |
| Phase 2 | cli-test | All CLI commands | 3 min |
| Phase 3 | api-test | API endpoints | 3 min |
| Phase 4 | core-test | Core services | 5 min |
| Phase 5 | infra-test | Infrastructure | 3 min |

### Execution Order

1. **Parallel:** Phases 1-2 (independent)
2. **Sequential:** Phase 3 (requires Phase 1)
3. **Sequential:** Phases 4-5 (requires Phase 3)

## Success Criteria - UPDATED

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| TypeScript Errors | 0 | 0 | ✅ PASS |
| Build Warnings | 0 | 0 | ✅ PASS |
| CLI Tests Pass | 8/8 | 1/8 (CLI-001 only) | ⚠️ PARTIAL |
| API Tests Pass | 6/6 | 1/6 (API-002 only) | ⚠️ PARTIAL |
| Core Service Tests | 6/6 | 0/6 | ⏳ PENDING |
| Infrastructure Tests | 3/3 | 0/3 | ⏳ PENDING |
| **Total Executed** | 27 | **13** (48%) | **9 completed, 4 partial** |
| **Total Passed** | 27 | **5** (19%) | 3 Build + 1 CLI + 1 API |
| **Failed** | 0 | 1 | API-001 (/api/health 404) |

### Test Execution Summary (2026-02-04 19:20 CST)

| Phase | Tests | ✅ Pass | ⚠️ Partial | ❌ Fail | ⏳ Pending | Status |
|-------|-------|---------|------------|---------|-----------|--------|
| Phase 1: Build | 3 | 3 | 0 | 0 | 0 | ✅ DONE |
| Phase 2: CLI | 8 | 1 | 3 | 0 | 4 | ⚠️ PARTIAL |
| Phase 3: API | 6 | 1 | 0 | 1 | 4 | ⚠️ PARTIAL |
| Phase 4: Core | 6 | 0 | 0 | 0 | 6 | ⏳ PENDING |
| Phase 5: Infra | 3 | 0 | 0 | 0 | 3 | ⏳ PENDING |
| **TOTAL** | **26** | **5** | **3** | **1** | **17** | **35% complete** |

## Issues Log - UPDATED

| ID | Issue | Severity | Phase | Status | Resolution |
|----|-------|----------|-------|--------|------------|
| ISS-001 | Gateway Authentication Failed | **HIGH** | CLI | OPEN | Fix auth invalid connect params |
 config -| ISS-002 | /api/health Returns 404 | **HIGH** | API | OPEN | Implement `/api/health` endpoint |
| ISS-003 | Non-Zero Exit Codes | MEDIUM | CLI | OPEN | Commands exit 1 even on successful output |
| ISS-004 | Console statements | LOW | All | TRACKING | 1,206 remaining console statements |

### Issue Details

**ISS-001: Gateway Authentication Failed**
- **Symptom:** Commands 2-4 fail with `GatewayError: Authentication failed` and `ConnectionError`
- **Impact:** CLI commands cannot complete successfully
- **Root Cause:** Invalid connect parameters for OpenClaw Gateway
- **Fix:** Update authentication configuration in `.env` or connection settings

**ISS-002: /api/health Returns 404**
- **Symptom:** GET request to `/api/health` returns 404 HTML page
- **Impact:** Health check monitoring cannot function
- **Root Cause:** Endpoint not implemented in API routes
- **Fix:** Add health check endpoint implementation

**ISS-003: Non-Zero Exit Codes**
- **Symptom:** CLI commands exit with code 1 even when output is displayed
- **Impact:** Scripts and automation may fail incorrectly
- **Fix:** Commands should exit 0 if they produce valid output

**ISS-004: Console Statements in Production**
- **Symptom:** Excessive logging in test output
- **Impact:** Performance and log noise
- **Scope:** 1,206 remaining statements
- **Fix:** Replace with structured logging (Winston/Pino)

## Test Artifacts

- `/tmp/dash-cli-test.md` - CLI results
- `/tmp/dash-api-test.md` - API results
- `/tmp/dash-build-test.md` - Build results
- `/tmp/dash-core-test.md` - Core service results
- `/tmp/dash-infra-test.md` - Infrastructure results
- `/tmp/dash-test-summary.md` - Combined summary

## Timeline - UPDATED

| Phase | Duration | Elapsed | Tests | Status |
|-------|----------|---------|-------|--------|
| Phase 1 | 2 min | 2 min | 3/3 | ✅ DONE (100%) |
| Phase 2 | 3 min | 3 min | 4/8 | ⚠️ PARTIAL (50%) |
| Phase 3 | 3 min | 3 min | 2/6 | ⚠️ PARTIAL (33%) |
| Phase 4 | 5 min | 0 min | 0/6 | ⏳ PENDING (0%) |
| Phase 5 | 3 min | 0 min | 0/3 | ⏳ PENDING (0%) |

**Overall Progress:** 35% (9 of 26 tests completed)

## Next Actions - UPDATED

1. 🔴 **Fix Gateway authentication** for CLI commands (ISS-001) - CRITICAL
2. 🔴 **Implement /api/health** endpoint (ISS-002) - CRITICAL  
3. 🟡 **Fix exit codes** for successful CLI commands (ISS-003)
4. 🔄 **Re-run Phase 2** CLI tests after fixes
5. ▶️ **Execute Phase 4** Core Services tests
6. ▶️ **Execute Phase 5** Infrastructure tests
7. ✅ **Generate combined test report** - DONE (/tmp/dash-test-summary.md)
