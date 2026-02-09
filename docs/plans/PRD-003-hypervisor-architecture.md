# PRD-003: Godel Hypervisor Architecture

**Version:** 1.0  
**Date:** 2026-02-08  
**Status:** ✅ APPROVED - Ground Truth Requirements  
**Priority:** P0 (Strategic)  
**Target:** 2026-Q2 General Availability  

**Supporting Documents:**
- Stakeholder Requirements: `stakeholder-requirements-summary.md`
- Technical Constraints: `technical-constraints-analysis.md`  
- Risk Assessment: `risk-assessment-report.md`
- API Design: `runtime-provider-api-design.md`
- Testing Strategy: `testing-strategy-hypervisor-migration.md`

---

## 1. Executive Summary

This document establishes the **ground truth requirements** for transforming Godel from Git Worktrees (shared hosting) to Kata/Firecracker MicroVMs (serverless containers). Requirements derived from stakeholder interviews, technical feasibility analysis, and risk assessment.

**Key Decisions:**
- **Technology:** Kata Containers (not raw Firecracker) for Docker compatibility
- **Migration:** Gradual rollout (1% → 5% → 25% → 100%) over 11 weeks
- **Fallback:** E2B for cloud bursting, with automatic fallback to Kata → Worktree
- **Scope:** Hardware VM isolation, 1000+ agents, <100ms boot time

---

## 2. Problem Statement

### 2.1 Current State
Godel uses **Git Worktrees** for agent isolation - "shared hosting" model:
- Agents share host kernel and Node.js runtime
- Filesystem-only isolation via git worktrees
- Security relies on file permissions and process boundaries
- Resources managed via host cgroups (no hard limits)
- Scaling limited to single-node vertical scaling (10-50 agents)

### 2.2 Problems Identified

| Problem | Severity | Business Impact |
|---------|----------|-----------------|
| **Security Risk** | Critical | Container escapes compromise entire host |
| **Multi-tenancy Unsafe** | Critical | Cannot run untrusted agent code |
| **Resource Contention** | High | Noisy neighbors affect all agents |
| **Compliance Gap** | High | Insufficient for SOC2/ISO27001 |
| **Scalability Ceiling** | High | Single-node limit (50 agents max) |
| **Snapshot Limitations** | Medium | Cannot capture full runtime state |

### 2.3 Stakeholder Pain Points

**Product Owner:**
- "We lose enterprise deals because we can't guarantee isolation"
- "Need to support 1000+ concurrent AI workflows"

**Security Lead:**
- "Current model is fundamentally insecure for multi-tenancy"
- "Need hardware-level isolation for compliance"

**Platform Engineering Lead:**
- "Vertical scaling has hit its limit"
- "Need horizontal scaling across K8s cluster"

---

## 3. Goals

### 3.1 Primary Goal
Transform Godel's execution model from "shared hosting" (Git Worktrees) to "serverless containers" (Hardware-virtualized MicroVMs) by 2026-Q2.

### 3.2 Specific Goals

| Goal | Metric | Target | Rationale |
|------|--------|--------|-----------|
| **Security** | Isolation level | Hardware VM | Zero container escapes, SOC2 compliance |
| **Multi-tenancy** | Untrusted code | ✅ Safe | Enable enterprise multi-tenant use cases |
| **Scalability** | Concurrent agents | 1000+ | Support large-scale AI workflows |
| **Performance** | Boot time | <100ms P95 | Maintain UX comparable to worktrees |
| **Migration** | Downtime | 0 minutes | Zero-downtime migration requirement |
| **Flexibility** | Runtime options | 3 (Worktree/Kata/E2B) | Support diverse use cases |

---

## 4. Requirements

### 4.1 Functional Requirements (P0)

#### FR1: RuntimeProvider Abstraction
- **FR1.1:** Pluggable backend supporting Worktree, Kata, E2B
- **FR1.2:** Runtime selection per-team via configuration
- **FR1.3:** Seamless migration from legacy to new architecture
- **FR1.4:** Consistent API across all runtime backends
- **FR1.5:** Automatic runtime fallback (E2B → Kata → Worktree)

#### FR2: Kata Containers Integration  
- **FR2.1:** Spawn agents in Firecracker MicroVMs via Kata
- **FR2.2:** Standard Docker image compatibility
- **FR2.3:** Kubernetes runtimeClassName: kata integration
- **FR2.4:** Bidirectional file sync host ↔ MicroVM
- **FR2.5:** Resource limits (CPU, memory, disk) at VM level
- **FR2.6:** VM health monitoring and auto-restart
- **FR2.7:** Graceful shutdown with state preservation

#### FR3: E2B Remote Sandbox
- **FR3.1:** Remote sandbox spawning via E2B API
- **FR3.2:** Automatic fallback to local Kata on failure
- **FR3.3:** Cost tracking per team and per agent
- **FR3.4:** Budget alerts at 80%, hard stop at 100%
- **FR3.5:** Template-based sandbox configuration

#### FR4: VM Lifecycle Management
- **FR4.1:** MicroVM boot time <100ms P95
- **FR4.2:** Concurrent VM management (1000+ instances)
- **FR4.3:** VM health monitoring with auto-restart
- **FR4.4:** Graceful shutdown with state preservation option

#### FR5: Snapshot and Restore
- **FR5.1:** Create VM snapshots at any point
- **FR5.2:** Restore agent to exact previous state
- **FR5.3:** Fork agent from snapshot (copy-on-write)
- **FR5.4:** Snapshot storage and garbage collection

### 4.2 Non-Functional Requirements (P0)

#### NFR1: Security
- **NFR1.1:** Hardware-level isolation (dedicated kernel per agent)
- **NFR1.2:** Container escape impossible (VM boundary)
- **NFR1.3:** Network micro-segmentation between agents
- **NFR1.4:** Secrets mounted securely (not in container layers)
- **NFR1.5:** SOC2 Type II and ISO27001 compliance

#### NFR2: Performance
- **NFR2.1:** Agent spawn latency: <100ms P95
- **NFR2.2:** API response latency: <200ms P95
- **NFR2.3:** Resource overhead: <10% vs traditional containers
- **NFR2.4:** Concurrent agents: 1000+ on single cluster

#### NFR3: Reliability
- **NFR3.1:** 99.9% uptime during migration
- **NFR3.2:** Automatic failover between runtime backends
- **NFR3.3:** Zero-downtime rolling updates
- **NFR3.4:** Rollback capability within 15 minutes

#### NFR4: Observability
- **NFR4.1:** VM-level metrics (CPU, memory, I/O)
- **NFR4.2:** Agent lifecycle event logging
- **NFR4.3:** Distributed tracing across VM boundary
- **NFR4.4:** Cost attribution per team/agent

#### NFR5: Multi-Tenancy
- **NFR5.1:** Per-team resource quotas (CPU, memory, agents)
- **NFR5.2:** Namespace isolation in Kubernetes
- **NFR5.3:** Cost tracking and chargeback
- **NFR5.4:** Fair scheduling across tenants

---

## 5. Success Criteria

| Criterion | Metric | Target | Measurement | Phase |
|-----------|--------|--------|-------------|-------|
| Isolation Level | Security boundary | Hardware VM | Penetration test | P2 |
| Boot Time | VM startup | <100ms P95 | Benchmark (1000 iterations) | P2 |
| Spawn Latency | End-to-end | <200ms P95 | Load test | P2 |
| Concurrent Agents | Scale test | 1000+ | Stress test | P2/P4 |
| Migration Success | Agent migration | 100% | Production metrics | P4 |
| Uptime | Availability | 99.9% | Monitoring (30 days) | P4 |
| Security Incidents | Escapes | 0 | Security audit | P2/P4 |
| Cost Efficiency | Per-agent cost | <2x previous | Cost analysis | P4 |
| Test Coverage | Code coverage | >95% | Jest reports | P1-P4 |
| API Compatibility | Breaking changes | 0 | Integration tests | P1 |

---

## 6. Out of Scope (Post-2026)

| Feature | Rationale | Target Date |
|---------|-----------|-------------|
| GPU passthrough for ML training | Complex, not required for GA | 2026-H2 |
| Cross-region VM migration | Advanced feature, low priority | 2027 |
| Custom kernel builds per agent | Overkill for 2026 requirements | Future |
| Live VM migration without downtime | Not needed for ephemeral agents | Future |
| Windows container support | Linux-only for 2026 | 2027 |

---

## 7. Stakeholders

| Role | Name/Team | Responsibilities |
|------|-----------|------------------|
| **Product Owner** | Platform Engineering Lead | Requirements approval, roadmap |
| **Tech Lead** | Senior Infrastructure Engineer | Technical approval, architecture |
| **Security Lead** | Security Architect | Security review, compliance |
| **Users** | Godel platform developers | Feedback, pilot testing |
| **Ops** | DevOps/SRE team | Operations, monitoring |
| **QA** | Quality Assurance | Testing, validation |

---

## 8. Open Questions - RESOLVED

### Q1: Migration Strategy
**Question:** Big bang vs. gradual rollout?  
**Resolution:** ✅ Gradual rollout (1% → 5% → 25% → 100%) with canary deployment
**Rationale:** Minimize risk, validate at each stage

### Q2: Default Runtime During Transition
**Question:** Default to Kata or Worktree during transition?  
**Resolution:** ✅ Worktree default during Phase 1-2, switch to Kata default in Phase 4
**Rationale:** Operational readiness before making default

### Q3: E2B Integration
**Question:** Full replacement for Kata or complementary?  
**Resolution:** ✅ Complementary - E2B for cloud bursting, Kata primary
**Rationale:** Cost optimization + redundancy

### Q4: Cost Model
**Question:** Who pays for E2B usage?  
**Resolution:** ✅ Platform absorbs initially, implement chargeback post-GA
**Rationale:** Simplify adoption, measure usage patterns first

### Q5: GPU Support
**Question:** GPU-enabled MicroVMs for 2026?  
**Resolution:** ❌ Post-2026 (out of scope)
**Rationale:** Not required for GA, adds complexity

---

## 9. Technology Selection

### 9.1 Sandbox Technology Comparison

| Technology | Isolation | Boot Time | Docker Compatible | Untrusted Code | Recommendation |
|------------|-----------|-----------|-------------------|----------------|----------------|
| **Kata + Firecracker** | Hardware VM | <100ms | ✅ Yes | ✅ Safe | **PRIMARY** |
| Raw Firecracker | Hardware VM | <125ms | ❌ No | ✅ Safe | Reject (too complex) |
| gVisor | Syscall Intercept | ~500ms | ✅ Yes | ⚠️ Moderate | Fallback only |
| Docker + runc | Process | ~1s | ✅ Yes | ❌ Unsafe | Legacy only |
| Git Worktrees | Filesystem | ~10ms | ❌ N/A | ❌ Unsafe | Current |

### 9.2 Architecture Comparison

| Feature | Worktrees (Current) | MicroVMs (Target) | Improvement |
|---------|---------------------|-------------------|-------------|
| Security Boundary | Filesystem | Hardware VM | **Quantum leap** |
| Kernel Isolation | Shared | Dedicated | **Complete** |
| Boot Time | ~10ms | <100ms | **10x** |
| Concurrent Agents | 10-50 | 1000+ | **20-100x** |
| Untrusted Code | ❌ Unsafe | ✅ Safe | **Enables multi-tenancy** |

**Decision:** Use Kata Containers (not raw Firecracker) for Docker compatibility + VM isolation

---

## 10. Risk Summary

| Risk ID | Risk | Probability | Impact | Score | Mitigation | Status |
|---------|------|-------------|--------|-------|------------|--------|
| R001 | Container escape | Low | Critical | 6 | gVisor, seccomp, minimal images | ✅ Mitigated |
| R002 | Boot time >100ms | Medium | High | 6 | Warm pools, optimization | ⚠️ Monitor |
| R003 | E2B cost overrun | Medium | Medium | 4 | Quotas, alerts, auto-shutdown | ✅ Controls |
| R004 | Migration downtime | Low | High | 4 | Canary deployment, rollback | ✅ Planned |
| R005 | Kata not supported | Low | Critical | 6 | Verify K8s prerequisites | ⚠️ Validate |

**Overall Risk Score:** 5.2/9 (Medium)  
**Recommendation:** Proceed with implementation with monitoring

---

## 11. Approval

**This PRD is approved for implementation:**

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Product Owner | Platform Engineering Lead | _______________ | 2026-02-08 |
| Tech Lead | Senior Infrastructure Engineer | _______________ | 2026-02-08 |
| Security Lead | Security Architect | _______________ | 2026-02-08 |

---

## 12. Related Documents

- **SPEC-002:** Technical specification with implementation details
- **30-AGENT-ORCHESTRATION-PLAN.md:** Execution plan with agent assignments
- **stakeholder-requirements-summary.md:** Detailed stakeholder interview outputs
- **technical-constraints-analysis.md:** Infrastructure and technical requirements
- **risk-assessment-report.md:** Comprehensive risk analysis
- **runtime-provider-api-design.md:** API interface specification
- **testing-strategy-hypervisor-migration.md:** QA and testing approach

---

**Status:** ✅ **APPROVED FOR IMPLEMENTATION**  
**Next Step:** Proceed to SPEC-002 and 30-agent orchestration
