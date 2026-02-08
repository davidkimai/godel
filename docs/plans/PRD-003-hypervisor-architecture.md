# PRD: Godel Hypervisor Architecture - Product Requirements Document

**Version:** 1.0  
**Date:** 2026-02-08  
**Status:** Draft - Pending Interview Validation  
**Priority:** P0 (Strategic)  
**Target:** 2026-Q2 General Availability

---

## 1. Problem Statement

### Current State
Godel currently uses **Git Worktrees** for agent isolation - a "shared hosting" model where:
- Agents share the host kernel and Node.js runtime
- Isolation is filesystem-only through git worktrees
- Security relies on file permissions and process boundaries
- Resources are managed via host cgroups with no hard limits
- Scaling limited to single-node vertical scaling

### Problems Identified
1. **Security Risk:** Container escape vulnerabilities can compromise entire host
2. **Multi-tenancy Unsafe:** Cannot safely run untrusted agent code
3. **Resource Contention:** No true memory/CPU isolation; noisy neighbors affect all agents
4. **Compliance Gap:** Insufficient isolation for SOC2/ISO27001 requirements
5. **Scalability Ceiling:** Single-node architecture cannot scale to 1000s of agents
6. **Snapshot Limitations:** Cannot capture full runtime state for agent forking

---

## 2. Goals

### Primary Goal
Transform Godel's execution model from "shared hosting" (Git Worktrees) to "serverless containers" (Hardware-virtualized MicroVMs) by 2026.

### Specific Goals

1. **Security Goal:** Achieve hardware-level isolation with dedicated kernel per agent
2. **Multi-tenancy Goal:** Safely execute untrusted agent code on shared infrastructure
3. **Scalability Goal:** Support 1000+ concurrent agents across Kubernetes cluster
4. **Performance Goal:** Maintain <100ms agent spawn time with VM isolation
5. **Migration Goal:** Zero-downtime migration from worktrees to MicroVMs
6. **Flexibility Goal:** Support both local (Kata) and remote (E2B) sandboxes

---

## 3. Requirements

### 3.1 Functional Requirements

#### FR1: RuntimeProvider Abstraction
- **FR1.1:** Pluggable backend system supporting Worktree, Kata, and E2B
- **FR1.2:** Runtime selection per-team or per-agent via configuration
- **FR1.3:** Seamless migration path from legacy to new architecture
- **FR1.4:** Consistent API across all runtime backends

#### FR2: Kata Containers Integration
- **FR2.1:** Spawn agents in Firecracker MicroVMs via Kata Containers
- **FR2.2:** Use standard Docker images (maintain OpenClaw/Pi compatibility)
- **FR2.3:** Kubernetes runtimeClassName: kata integration
- **FR2.4:** File synchronization between host and MicroVM
- **FR2.5:** Resource limits (CPU, memory, disk) enforced at VM level

#### FR3: E2B Remote Sandbox
- **FR3.1:** Remote sandbox spawning via E2B API
- **FR3.2:** Automatic fallback from E2B to local Kata on failure
- **FR3.3:** Cost tracking and budget enforcement per team
- **FR3.4:** Template-based sandbox configuration

#### FR4: VM Lifecycle Management
- **FR4.1:** <100ms MicroVM boot time
- **FR4.2:** VM health monitoring and auto-restart
- **FR4.3:** Graceful shutdown with state preservation option
- **FR4.4:** Concurrent VM management (1000+ instances)

#### FR5: Snapshot and Restore
- **FR5.1:** Create VM snapshots at any point
- **FR5.2:** Restore agent to exact previous state
- **FR5.3:** Fork agent from snapshot (copy-on-write)
- **FR5.4:** Snapshot storage and garbage collection

### 3.2 Non-Functional Requirements

#### NFR1: Security
- **NFR1.1:** Hardware-level isolation (dedicated kernel per agent)
- **NFR1.2:** Container escape impossible (VM boundary)
- **NFR1.3:** Network policies for inter-agent communication
- **NFR1.4:** Secrets mounted securely (not in container layers)

#### NFR2: Performance
- **NFR2.1:** Agent spawn latency: <100ms P95
- **NFR2.2:** API response latency: <200ms P95
- **NFR2.3:** Resource overhead: <10% vs traditional containers
- **NFR2.4:** Concurrent agents: 1000+ on single cluster

#### NFR3: Reliability
- **NFR3.1:** 99.9% uptime during migration
- **NFR3.2:** Automatic failover between runtime backends
- **NFR3.3:** Zero-downtime rolling updates
- **NFR3.4:** Rollback capability to previous architecture

#### NFR4: Observability
- **NFR4.1:** VM-level metrics (CPU, memory, I/O)
- **NFR4.2:** Agent lifecycle event logging
- **NFR4.3:** Distributed tracing across VM boundary
- **NFR4.4:** Cost attribution per team/agent

---

## 4. Success Criteria

| Criterion | Metric | Target | Measurement |
|-----------|--------|--------|-------------|
| Isolation Level | Security boundary | Hardware VM | Security audit |
| Boot Time | VM startup | <100ms | Benchmark |
| Spawn Latency | End-to-end | <200ms P95 | Load test |
| Concurrent Agents | Scale test | 1000+ | Stress test |
| Migration Success | Agent migration | 100% | Production metrics |
| Uptime | Availability | 99.9% | Monitoring |
| Security Incidents | Escapes | 0 | Security review |
| Cost Efficiency | Per-agent cost | <2x previous | Cost analysis |

---

## 5. Out of Scope (Post-2026)

- GPU passthrough for ML training (future enhancement)
- Cross-region VM migration (advanced feature)
- Custom kernel builds per agent (overkill for 2026)
- Live VM migration without downtime (not needed for ephemeral agents)

---

## 6. Stakeholders

- **Product Owner:** Platform Engineering Lead
- **Tech Lead:** Senior Infrastructure Engineer
- **Security Lead:** Security Architect
- **Users:** Godel platform users (developers, teams)
- **Ops:** DevOps/SRE team

---

## 7. Open Questions (To Resolve via /interview)

1. **Migration Strategy:** Big bang vs. gradual rollout?
2. **Default Runtime:** Should new teams default to Kata or Worktree during transition?
3. **E2B Integration:** Full replacement for Kata or complementary option?
4. **Cost Model:** Who pays for E2B usage? Pass-through or platform absorbed?
5. **GPU Support:** Do we need GPU-enabled MicroVMs for 2026?

---

## 8. Interview Validation Required

**Before proceeding to SPEC creation, the following must be validated via /interview:**

1. Stakeholder requirements alignment
2. Technical approach confirmation
3. Timeline feasibility
4. Resource allocation approval
5. Risk tolerance assessment

**Next Action:** Execute /interview skill to validate and finalize this PRD.

---

**Status:** 🟡 PENDING INTERVIEW VALIDATION  
**Next Step:** Spawn agent with /interview skill to validate requirements
