# Dash Production Readiness for 10-50+ OpenClaw Sessions

## Executive Summary
Dash will be upgraded from a broad prototype platform into a production-grade orchestration control plane capable of managing 10-50+ concurrent OpenClaw gateway sessions with low operational risk. This PRD defines scope, user stories, acceptance criteria, architecture expectations, and release gates required to deploy safely in real-world environments.

Validation: PRD scope is concrete, measurable, and directly aligned to the user objective (10-50+ concurrent OpenClaw operations).

## Execution Status (2026-02-06)
- Implemented: queue correctness fixes, OpenClaw adapter hardening, OpenClaw concurrency caps, gateway pooling scaffolding, daemon startup fallback, auth hardening, API prefix compatibility.
- Implemented: repository initialization before API route mount and cookie-session access to protected API routes.
- Validated: `npm run verify:release` passing after implementation updates.
- In-progress hardening: full live infra integration (DB/Redis/OpenClaw gateway cluster) and 10/25/50 session soak tests in a production-like environment.

Validation: Status entries map directly to code and test evidence captured in this execution cycle.

## Problem Statement
Dash currently contains the right building blocks (queueing, routing, API, OpenClaw integration, scaling modules) but has reliability and contract-consistency gaps that create deployment risk under concurrency. Without hardening queue semantics, auth validation, API compatibility, observability, and test gating, production usage can produce silent failure modes and false positives.

## Goals
- Goal 1: Make Dash reliably orchestrate 10-50+ concurrent OpenClaw sessions with deterministic queue and lifecycle behavior.
- Goal 2: Establish a stable and secure API contract for CLI, UI, and integrations.
- Goal 3: Define and enforce verification gates that detect regressions before deployment.

## User Stories

### US-001: Priority-Safe Task Dispatch
Description: As a platform operator, I want queue dispatch to respect priority and preserve queue consistency so that critical work executes first and no tasks are lost.

Acceptance Criteria:
- [x] Queue dequeue selects tasks from priority structures in `critical > high > medium > low` order.
- [x] Retry, scheduled promotion, dead-letter replay, and cancel paths keep queue structures in sync.
- [x] Queue depth reflects actual priority queue contents.
- [x] Unit tests cover priority dequeue and queue depth behavior.
- [x] Typecheck passes.

Priority: 1
Notes: Implemented in current cycle in `src/queue/task-queue.ts` with test coverage additions.

### US-002: Correct Retry Load Accounting
Description: As an operator, I want agent load counters to be accurate on failures so that schedulers do not over/under-assign work.

Acceptance Criteria:
- [x] Failed task retries decrement load for the prior assignee before reassignment.
- [x] Agent heartbeat/status reflects corrected load.
- [x] Regression tests validate expected transitions.
- [x] Typecheck passes.

Priority: 1
Notes: Implemented by preserving `previousAssignee` in fail path.

### US-003: Hardened JWT Validation
Description: As a security owner, I want bearer tokens to be cryptographically validated so that forged tokens are rejected.

Acceptance Criteria:
- [x] JWT signature is validated (HS256) with timing-safe compare.
- [x] Optional issuer and audience validation supported.
- [x] Expiration (`exp`) and not-before (`nbf`) checks remain enforced.
- [x] Public route matching is query-safe and non-bypassable.
- [x] Typecheck passes.

Priority: 1
Notes: Implemented in `src/api/middleware/auth-fastify.ts`.

### US-004: Health Endpoint Correctness
Description: As an SRE, I want health/readiness/liveness endpoints to resolve at expected paths so probes and orchestrators behave correctly.

Acceptance Criteria:
- [ ] Health plugin routes map correctly under registered prefixes.
- [ ] `/health`, `/health/live`, `/health/ready` are reachable as intended.
- [ ] API-prefixed health aliases exist if compatibility mode is enabled.
- [ ] Typecheck passes.

Priority: 1
Notes: Implemented route path corrections in `src/api/health.ts`.

### US-005: API Contract Compatibility
Description: As a frontend and SDK consumer, I want consistent `/api` and `/api/v1` compatibility so clients do not break during migration.

Acceptance Criteria:
- [x] Core route groups are available under both `/api/v1/*` and `/api/*`.
- [ ] OpenAPI JSON available on both versioned and compatibility endpoints.
- [ ] Metrics route module and collector routes are non-conflicting.
- [x] Typecheck passes.

Priority: 1
Notes: Implemented in `src/api/fastify-server.ts`.

### US-006: WebSocket Contract Alignment
Description: As a dashboard user, I want realtime connections to use the correct WS path by default so live updates work without manual overrides.

Acceptance Criteria:
- [x] Dashboard WS default path aligns with running server path.
- [x] Integration test defaults match WS endpoint conventions.
- [x] Typecheck passes.

Priority: 1
Notes: Updated defaults to `/events`.

### US-007: OpenClaw Adapter Robustness
Description: As an orchestration service, I want adapter cleanup and status retrieval to be resilient so failed session teardown does not crash the process.

Acceptance Criteria:
- [x] Adapter kill flow handles undefined/error envelopes safely.
- [x] Cleanup tolerates bus unsubscribe shape differences.
- [x] Status extraction supports top-level and metadata fields.
- [x] Dispose path handles partial failures and continues cleanup.
- [x] Adapter test suite passes.
- [x] Typecheck passes.

Priority: 1
Notes: Implemented in `src/integrations/openclaw/adapter.ts`.

### US-008: Integration Test Baseline Reliability
Description: As a developer, I want sensible integration defaults so local and CI runs fail for real defects, not obvious environment mismatch.

Acceptance Criteria:
- [x] DB connection defaults align to standard test credentials.
- [x] WS defaults align with server runtime defaults.
- [x] Tests clearly distinguish infra-missing vs logic failures.
- [x] Typecheck passes.

Priority: 2
Notes: Defaults updated in `tests/integration/api.test.ts` and `tests/integration/config.ts`.

### US-009: OpenClaw Instance Federation Design
Description: As a platform architect, I want an explicit federation model for 10-50 OpenClaw gateways so scaling is deliberate and safe.

Acceptance Criteria:
- [ ] Instance registry schema supports health/load/capabilities/region.
- [ ] Routing policy supports tenant affinity, session affinity, and failover.
- [ ] Backpressure and max-concurrency policy documented and enforceable.
- [ ] Non-goals and staged rollout plan documented.

Priority: 2
Notes: Design-level story; implementation starts after P0 hardening complete.

### US-010: Production Verification Gates
Description: As a release manager, I want strict release gates so production deploys are prevented on false-positive test outcomes.

Acceptance Criteria:
- [x] Mandatory gates: typecheck, critical unit suites, adapter suite, and smoke API checks.
- [ ] Load gate profile includes 10, 25, 50 OpenClaw-session equivalents.
- [ ] Runbook includes rollback criteria and canary thresholds.
- [x] Gate failures are blocking for release.

Priority: 1
Notes: This story governs release policy and CI/CD updates.

### US-011: OpenClaw Daemon Operational Startup
Description: As an operator, I want Dash to recover from missing local gateway processes by starting OpenClaw daemon commands automatically (when enabled) so orchestration remains operational.

Acceptance Criteria:
- [x] Dash supports configurable daemon start command override.
- [x] Dash probes common command variants (`openclaws`, `openclaw`, `openclawd`) when override is not provided.
- [x] Startup retry/probe windows are configurable via OpenClaw config/env.
- [ ] Live integration test validates auto-start behavior against a real gateway lifecycle.

Priority: 1
Notes: Implemented in `src/core/openclaw.ts`; live integration validation remains environment-dependent.

## Functional Requirements
- FR-1: Task dispatch must preserve strict priority order and queue consistency across all lifecycle transitions.
- FR-2: API must offer compatibility endpoints for both `/api` and `/api/v1` during migration.
- FR-3: JWT bearer tokens must be cryptographically validated before authorization.
- FR-4: Health/readiness/liveness probes must be accessible at deterministic paths.
- FR-5: OpenClaw adapter must be resilient to partial failures and cleanup shape variance.
- FR-6: Dashboard websocket defaults must align with server WS endpoints.
- FR-7: Integration defaults must avoid known false-negative configuration mismatches.
- FR-8: Verification pipeline must include deterministic release-blocking checks.

## Non-Goals (Out of Scope)
- Full redesign of the entire API data model and all historical route behavior.
- Immediate migration to distributed queue infrastructure across regions.
- Complete enterprise IAM rollout (LDAP/SAML/OIDC) in this cycle.
- Exhaustive rewrite of all integration tests to fully hermetic mode.

## Technical Approach

### Architecture
- Keep current modular architecture and harden high-risk seams first.
- Use compatibility routing to stabilize clients while converging to canonical API contracts.
- Preserve OpenClaw gateway integration surface and add federation design incrementally.

### Data Model
- Queue state remains Redis-backed with synchronized priority and pending structures.
- Session and swarm metadata continue via existing repository patterns.

### APIs and Integrations
- Fastify route registration expanded for compatibility aliases.
- Health endpoint registration corrected for prefix-safe behavior.
- OpenClaw adapter hardened without breaking existing interfaces.

## Success Metrics
- 100% pass on critical suites:
  - `tests/unit/queue/task-queue.test.ts`
  - `tests/integrations/openclaw/adapter.test.ts`
  - `npm run typecheck`
- Zero known priority inversion in queue dispatch regression tests.
- Zero known adapter teardown crashes in test harness.
- API compatibility endpoints reachable under `/api` and `/api/v1`.

## Timeline and Milestones
- Phase 1 (Completed in this cycle): queue/auth/adapter/API-compat hardening and regression tests.
- Phase 2 (Next): federation registry + routing policies + load-profile verification (10/25/50).
- Phase 3: release gating and canary runbooks integrated into CI/CD.

## Dependencies
- Redis availability for queue semantics validation.
- PostgreSQL/SQLite environment for integration and migration validation.
- OpenClaw gateway runtime and token configuration for live integration testing.

## Open Questions
- Should Express or Fastify be the sole production server implementation?
- What is the canonical mechanism to launch OpenClaw in production environments (`openclaw gateway` service model, `openclawd` alias, or both)?
- What explicit SLOs (latency, error budget, failover time) are required before GA?
- How should multi-tenant isolation be enforced across 50+ instance pools (hard partition vs weighted shared pool)?

## Current Validation Snapshot
- Completed and passing:
  - `npm test -- --runInBand tests/integrations/openclaw/adapter.test.ts`
  - `npm test -- --runInBand tests/unit/queue/task-queue.test.ts`
  - `npm run typecheck`
- Environment-dependent suite status:
  - `tests/integration/api.test.ts` still requires live PostgreSQL/Redis/API services.

Validation: PRD includes atomic stories, testable acceptance criteria, priorities, technical approach, and measurable release outcomes.
