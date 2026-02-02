# Implementation Roadmap: Ideal Orchestrator Platform

**Version:** 1.0  
**Date:** 2026-02-02  
**Status:** Draft  
**Time Horizon:** 12 weeks to production v2.0

---

## Executive Summary

This roadmap closes the gap between Dash's current state (v1.x/v2.0-alpha) and the Ideal Orchestrator vision synthesized from T10 interview and existing specifications.

**Current State:**
- Express API on port 7373
- SQLite persistence
- Basic OpenTUI dashboard
- Static agent lifecycle
- Centralized scheduling

**Target State:**
- Phoenix agent architecture (ephemeral)
- Mycelial task routing (self-organizing)
- Epigenetic agent memory (specialization)
- Holonic task composition (recursive)
- Self-modifying orchestration (evolutionary)

---

## Phase 1: Foundation (Weeks 1-3)

### Goal
Establish the Phoenix agent architecture—agents that self-terminate after task completion, preserving only learnings.

### Deliverables

#### Week 1: Phoenix Lifecycle Core

**Tasks:**
1. **Container Integration**
   - Integrate with container runtime (Docker/Podman)
   - Create base agent container image
   - Implement container spawn/kill APIs

2. **Learning Archival System**
   ```typescript
   // New table: agent_learnings
   interface LearningRecord {
     id: string;
     agentId: string;
     taskType: string;
     approach: string;
     outcome: 'success' | 'failure';
     metadata: JSON;
     timestamp: number;
   }
   ```
   - Schema migration
   - Learning extraction from dying agents
   - Query interface for learning retrieval

3. **Phoenix Lifecycle Manager**
   ```typescript
   class PhoenixLifecycleManager {
     spawn(task: Task, parentLearnings: Learning[]): Agent;
     terminate(agent: Agent): Learning[];
     inheritLearnings(task: Task): Learning[];
   }
   ```

**Success Criteria:**
- [ ] Agent spawns in <5 seconds
- [ ] Agent self-terminates on task completion
- [ ] Learnings persist in database after death
- [ ] New agents inherit relevant learnings

**Owner:** Friday (Developer)  
**Dependencies:** None

---

#### Week 2: Holonic Task Composer (Basic)

**Tasks:**
1. **Recursive Task Model**
   ```typescript
   interface HolonicTask {
     id: string;
     type: 'leaf' | 'branch';
     parentId: string | null;
     subTaskIds: string[];
     depth: number;
     execute(): Promise<Result | HolonicTask[]>;
   }
   ```

2. **Task Decomposition Engine**
   - Rule-based task splitting
   - Context propagation to sub-tasks
   - Result aggregation from sub-tasks

3. **Tree Visualization API**
   - GET /api/v2/tasks/:id/tree
   - Returns nested task structure

**Success Criteria:**
- [ ] Complex tasks decompose into sub-tasks
- [ ] Sub-task results aggregate correctly
- [ ] Tree API returns valid nested structure

**Owner:** Friday  
**Dependencies:** Week 1 completion

---

#### Week 3: Integration & Testing

**Tasks:**
1. **Phoenix + Holonic Integration**
   - Phoenix agents execute holonic tasks
   - Leaf tasks spawn ephemeral agents
   - Branch tasks orchestrate without spawning

2. **OpenTUI Updates**
   - Display agent lifecycle status
   - Show learning archival events
   - Visualize holonic task trees

3. **Testing**
   - Unit tests for Phoenix lifecycle
   - Integration tests for holonic composition
   - E2E test: Complex task → decomposed → executed

**Success Criteria:**
- [ ] End-to-end Phoenix + Holonic workflow passes
- [ ] Dashboard shows real-time lifecycle events
- [ ] 80% test coverage on new code

**Owner:** Shuri (Tester) + Friday  
**Dependencies:** Weeks 1-2

---

## Phase 2: Intelligence (Weeks 4-6)

### Goal
Implement Mycelial routing and Epigenetic memory—agents self-organize and specialize based on experience.

### Deliverables

#### Week 4: Mycelial Task Router

**Tasks:**
1. **Signal System**
   ```typescript
   interface TaskSignal {
     taskId: string;
     type: string;
     complexity: number;
     urgency: number;
     pheromoneTrail: Map<string, number>;
   }
   ```

2. **Pheromone Environment**
   ```typescript
   class PheromoneEnvironment {
     deposit(location: string, capability: string, strength: number): void;
     query(location: string): Map<string, number>;
     decay(): void; // Periodic decay
   }
   ```

3. **Mycelial Router**
   ```typescript
   class MycelialRouter {
     emitSignal(task: Task): TaskSignal;
     findAgent(signal: TaskSignal): Agent | null;
   }
   ```

**Success Criteria:**
- [ ] Tasks emit signals on creation
- [ ] Agents deposit pheromones based on capabilities
- [ ] Tasks route to agents with matching pheromones
- [ ] Pheromones decay over time

**Owner:** Friday  
**Dependencies:** Phase 1 completion

---

#### Week 5: Epigenetic Memory

**Tasks:**
1. **Experience Tracking**
   ```typescript
   interface AgentExperience {
     agentId: string;
     taskType: string;
     success: boolean;
     duration: number;
     timestamp: number;
   }
   ```

2. **Specialization Scoring**
   ```typescript
   interface SpecializationProfile {
     agentId: string;
     primarySkills: string[];
     successRates: Map<string, number>;
     trait: AgentTraits;
   }
   ```

3. **Reputation System**
   - Track agent reliability
   - Weight task routing by reputation
   - Public reputation scores

**Success Criteria:**
- [ ] Agents develop visible specialization profiles
- [ ] Task routing considers agent experience
- [ ] Reputation affects assignment probability

**Owner:** Friday  
**Dependencies:** Week 4

---

#### Week 6: Integration & A/B Testing

**Tasks:**
1. **Hybrid Router**
   - Mycelial routing with fallback to central scheduler
   - Configuration: routing.mode = 'mycelial' | 'central' | 'hybrid'
   - Metrics collection for comparison

2. **Dashboard Updates**
   - Visualize pheromone trails
   - Show agent specializations
   - Display routing decisions

3. **A/B Test: Mycelial vs Central**
   - 50/50 traffic split
   - Measure: routing latency, task success rate, agent utilization
   - 1-week test period

**Success Criteria:**
- [ ] Mycelial routing within 20% of central scheduler performance
- [ ] A/B test produces statistically significant results
- [ ] Fallback to central scheduler works reliably

**Owner:** Shuri + Friday  
**Dependencies:** Weeks 4-5

---

## Phase 3: Evolution (Weeks 7-9)

### Goal
Enable self-modification—system improves its own orchestration algorithms.

### Deliverables

#### Week 7: Strategy Population

**Tasks:**
1. **Strategy Interface**
   ```typescript
   interface OrchestrationStrategy {
     id: string;
     name: string;
     algorithm: SchedulingAlgorithm;
     fitness: number;
     usageCount: number;
     createdAt: number;
   }
   ```

2. **Strategy Registry**
   - Store multiple strategies in database
   - Fitness tracking per strategy
   - Strategy activation/deactivation

3. **Fitness Evaluation**
   - Measure success rate per strategy
   - Calculate cost efficiency
   - Track user satisfaction (if applicable)

**Success Criteria:**
- [ ] Multiple strategies stored and tracked
- [ ] Fitness scores update automatically
- [ ] Best strategy identified

**Owner:** Friday  
**Dependencies:** Phase 2 completion

---

#### Week 8: Genetic Operators

**Tasks:**
1. **Mutation Operator**
   - Randomly modify strategy parameters
   - Bounded changes (safety limits)
   - Track mutation history

2. **Crossover Operator**
   - Combine two parent strategies
   - Select best traits from each
   - Create offspring strategy

3. **Evolution Loop**
   - Periodic evolution runs (daily)
   - Generate new generation from best performers
   - Archive poor performers

**Success Criteria:**
- [ ] Mutations produce valid strategies
- [ ] Crossover creates viable offspring
- [ ] Evolution runs automatically

**Owner:** Friday  
**Dependencies:** Week 7

---

#### Week 9: Safe Deployment

**Tasks:**
1. **A/B Testing Framework**
   - Automatic A/B test for new strategies
   - Statistical significance checking
   - Automatic winner selection

2. **Rollback Mechanism**
   - Detect performance regression
   - Automatic rollback to previous strategy
   - Alert on rollback events

3. **Safety Limits**
   - Cap on strategy changes per week
   - Human approval for major architectural changes
   - Sandbox testing before production

**Success Criteria:**
- [ ] New strategies deploy via A/B test
- [ ] Automatic rollback on regression
- [ ] No unsafe changes deployed

**Owner:** Friday + Shuri  
**Dependencies:** Week 8

---

## Phase 4: Production (Weeks 10-12)

### Goal
Production-ready platform with complete observability and reliability.

### Deliverables

#### Week 10: API v2 & WebSocket

**Tasks:**
1. **REST API v2**
   - POST /api/v2/tasks (holonic)
   - GET /api/v2/agents/:id/learnings
   - POST /api/v2/swarms/:id/evolve
   - GET /api/v2/knowledge

2. **WebSocket Event Stream**
   - Real-time lifecycle events
   - Pheromone updates
   - Strategy evolution events
   - <100ms latency guarantee

3. **API Documentation**
   - OpenAPI spec
   - Example requests/responses
   - WebSocket protocol docs

**Success Criteria:**
- [ ] All v2 endpoints functional
- [ ] WebSocket <100ms latency
- [ ] API documentation complete

**Owner:** Friday  
**Dependencies:** Phase 3 completion

---

#### Week 11: Dashboard v2

**Tasks:**
1. **Holonic Tree Visualization**
   - Interactive task tree
   - Expand/collapse sub-tasks
   - Status indicators at each node

2. **Agent Specialization View**
   - Agent skill radar charts
   - Specialization history over time
   - Reputation scores

3. **Evolution Dashboard**
   - Strategy population view
   - Fitness over time graphs
   - Current strategy details

4. **Knowledge Graph Explorer**
   - Visual knowledge graph
   - Search and filter
   - Learning integration flow

**Success Criteria:**
- [ ] Tree visualization renders 1000+ nodes
- [ ] Real-time updates via WebSocket
- [ ] All new features accessible via keyboard

**Owner:** Wanda (Designer) + Friday  
**Dependencies:** Week 10

---

#### Week 12: Hardening & Launch

**Tasks:**
1. **Security Audit**
   - Code review
   - Penetration testing
   - Dependency vulnerability scan

2. **Performance Optimization**
   - Profile and optimize hot paths
   - Database query optimization
   - Caching layer if needed

3. **Stress Testing**
   - 50 concurrent agents
   - 1000 tasks/day
   - 7-day continuous operation

4. **Documentation**
   - User guide
   - Admin guide
   - Troubleshooting runbook

5. **Launch Checklist**
   - [ ] All tests passing
   - [ ] Security audit passed
   - [ ] Performance targets met
   - [ ] Documentation complete

**Success Criteria:**
- [ ] Security audit: 0 critical, 0 high issues
- [ ] 99.9% uptime over 7 days
- [ ] <200MB memory at 50 agents
- [ ] All documentation published

**Owner:** Shuri + Friday + Wong (Documentation)  
**Dependencies:** Week 11

---

## Resource Requirements

### Personnel

| Role | Weeks | Responsibilities |
|------|-------|------------------|
| Friday (Developer) | 1-12 | Core implementation |
| Shuri (Tester) | 3, 6, 9, 12 | Testing, QA, validation |
| Wanda (Designer) | 11 | Dashboard UI/UX |
| Wong (Documentation) | 12 | Documentation |

### Infrastructure

| Resource | Usage |
|----------|-------|
| Container registry | Store agent images |
| SQLite (WAL mode) | State persistence |
| OpenClaw Gateway | Agent spawning |
| WebSocket server | Real-time events |

---

## Risk Mitigation

| Risk | Mitigation | Owner |
|------|-----------|-------|
| Phoenix agents too slow | Warm container pool; optimize startup | Friday |
| Mycelial routing fails | Hybrid mode with central fallback | Friday |
| Self-modification unsafe | Sandboxed evolution; human approval gates | Shuri |
| Scope creep | Strict MVP; defer nice-to-have features | Friday |
| Integration issues | Weekly integration tests; early end-to-end | Shuri |

---

## Success Criteria by Phase

### Phase 1 Success
- Agent spawn-to-death cycle <30 seconds
- Learnings persist and propagate
- Holonic tasks decompose correctly

### Phase 2 Success
- Mycelial routing within 20% of central scheduler
- Agents develop specializations
- A/B test validates approach

### Phase 3 Success
- Self-improving strategies show measurable gains
- Safe deployment with automatic rollback
- No manual intervention required

### Phase 4 Success
- 99.9% uptime
- 50 concurrent agents stable
- Production launch approved

---

## Post-Launch Roadmap

### Month 4-6: Optimization
- Performance tuning based on production data
- Additional agent specializations
- Knowledge graph consolidation algorithms

### Month 7-9: Federation
- Multi-orchestrator peer networks
- Cross-orchestrator knowledge sharing
- Distributed task routing

### Month 10-12: Advanced Intelligence
- Liquid software modules (hot-swapping)
- Predictive task decomposition
- Autonomous goal refinement

---

## Document Information

- **Author:** Synthesis Agent
- **Status:** Draft for review
- **Last Updated:** 2026-02-02
- **Next Review:** Weekly during implementation

---

*"The best time to plant a tree was 20 years ago. The second best time is now."* — Chinese Proverb
