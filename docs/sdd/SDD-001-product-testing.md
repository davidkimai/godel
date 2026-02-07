# SDD-001: System Design Document - Product Testing

**Version:** 1.0.0
**Status:** Active
**Created:** 2026-02-04
**Based on:** ARCHITECTURE.md

## Objective

Define comprehensive testing strategy based on Godel architecture components.

## System Under Test

### Layers

| Layer | Components | Test Priority |
|-------|-------------|---------------|
| **CLI Layer** | Command Parser, Router, Output Formatter | HIGH |
| **API Gateway** | REST Endpoints, WebSocket, Rate Limiter, Auth | HIGH |
| **Core Services** | Agent Manager, Team Manager, Workflow Engine | HIGH |
| **Infrastructure** | PostgreSQL, Redis, SQLite, Git Worktrees | MEDIUM |

### Test Categories

1. **Functional Tests** - Verify component behavior
2. **Integration Tests** - Verify component interactions
3. **Performance Tests** - Verify scalability
4. **Security Tests** - Verify auth and authorization
5. **Recovery Tests** - Verify fault tolerance

## Test Specifications

### CLI Layer Tests

| Test ID | Component | Test Case | Expected | Actual | Status |
|---------|-----------|-----------|----------|--------|--------|
| CLI-001 | Command Parser | `--version` | `2.0.0` | | PENDING |
| CLI-002 | Command Parser | `--help` | Help output | | PENDING |
| CLI-003 | Agent Manager | `agent list` | JSON array | | PENDING |
| CLI-004 | Team Manager | `team list` | JSON array | | PENDING |
| CLI-005 | Status | `status` | Health output | | PENDING |
| CLI-006 | Config | `config get` | Config values | | PENDING |

### API Gateway Tests

| Test ID | Endpoint | Method | Test Case | Expected | Status |
|---------|----------|--------|-----------|----------|--------|
| API-001 | `/api/health` | GET | Health check | 200 OK | PENDING |
| API-002 | `/api/agents` | GET | List agents | 200 + JSON | PENDING |
| API-003 | `/api/agents` | POST | Create agent | 201 + JSON | PENDING |
| API-004 | `/api/team` | GET | List teams | 200 + JSON | PENDING |
| API-005 | `/api/status` | GET | System status | 200 + JSON | PENDING |
| API-006 | WebSocket | WS | Event stream | Connected | PENDING |

### Core Service Tests

| Test ID | Service | Test Case | Expected | Status |
|---------|---------|-----------|----------|--------|
| SVC-001 | Agent Manager | Spawn agent | Agent created | PENDING |
| SVC-002 | Team Manager | Create team | Team created | PENDING |
| SVC-003 | Workflow Engine | Execute workflow | Completion | PENDING |
| SVC-004 | Event Bus | Publish event | Event delivered | PENDING |
| SVC-005 | Context Manager | Store context | Context saved | PENDING |
| SVC-006 | Safety Manager | Validate action | Validation | PENDING |

### Infrastructure Tests

| Test ID | Component | Test Case | Expected | Status |
|---------|-----------|-----------|----------|--------|
| INF-001 | SQLite | Read/Write | Success | PENDING |
| INF-002 | Redis | Cache get/set | Success | PENDING |
| INF-003 | Git Worktree | Create worktree | Success | PENDING |

## Test Execution Matrix

### Phase 1: Unit Tests
- Run locally
- No external dependencies
- Mock services

### Phase 2: Integration Tests
- Requires local services
- SQLite + Redis
- No external APIs

### Phase 3: End-to-End Tests
- Full system test
- All services running
- External APIs may be mocked

## Test Data Requirements

- Mock agents (5-10)
- Mock teams (2-3)
- Mock workflows (2-3)
- Test API keys
- Test configuration files

## Success Criteria

- **Functional:** 100% tests passing
- **Performance:** < 100ms response time
- **Security:** No auth bypasses
- **Recovery:** < 1min failover time

## Test Artifacts

- `/tmp/test-results/` - Detailed logs
- `/tmp/test-report.md` - Summary
- `/tmp/coverage-report/` - Coverage data
