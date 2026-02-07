# Godel Agent Skill Interface Review

**Date:** February 3, 2026  
**Reviewer:** Senior Engineer (Skill Interface Review)  
**Scope:** SKILL.md files, CLI/API for agents, OpenClaw integration  
**Goal:** Assess agent-facing interfaces for OpenClaw ecosystem integration

---

## Executive Summary

**Status: 🔴 CRITICAL GAPS - Not Ready for Agent Integration**

Godel has comprehensive human-facing documentation but lacks critical agent-facing interfaces. The platform cannot be easily used by OTHER agents without significant development effort.

**Overall Grade: C (Major gaps in agent interfaces)**

---

## Key Findings

| Finding | Severity | Status | Impact |
|---------|----------|--------|--------|
| **NO SKILL.md at root** | 🔴 CRITICAL | ✅ Created | Agents can't discover capabilities |
| **NO CLI interface** | 🔴 CRITICAL | ❌ Missing | No programmatic interface |
| **NO JSON output support** | 🔴 CRITICAL | ❌ Missing | Can't parse CLI output |
| **NO OpenAPI spec** | 🟡 HIGH | ❌ Missing | Can't generate clients |
| **NO @godel/client SDK** | 🟡 HIGH | ❌ Missing | No easy integration |
| **Missing 11 API endpoints** | 🟡 HIGH | ❌ Missing | Incomplete API coverage |
| WebSocket lacks auth | 🟡 HIGH | ⚠️ Partial | Security concern |
| Response wrapper missing | 🟡 HIGH | ❌ Missing | Inconsistent responses |

---

## Detailed Findings

### 1. SKILL.md Assessment

**Current State:**
- ✅ Root `SKILL.md` exists but is minimal
- ✅ Human-focused documentation extensive
- ❌ No machine-readable skill manifest (`skill.json`)
- ❌ No agent-focused onboarding instructions

**Created:**
- `/SKILL.md` - Comprehensive agent-facing documentation
- Covers: API reference, team operations, event streaming, workflows

### 2. CLI Interface Review

**Current State:**
- ❌ **NO CLI EXISTS** - Godel is API-only
- ❌ No programmatic interface for shell scripting
- ❌ No `--json` or `--format` flags
- ❌ No machine-parseable output

**Required CLI Commands:**
```bash
# Team Management
swarmctl team list [--json]
swarmctl team create --name <name> --count <n> [--json]
swarmctl team destroy <id> [--force]
swarmctl team scale <id> --count <n>

# Agent Management
swarmctl agent list [--team <id>] [--json]
swarmctl agent spawn --team <id> [--config <file>]
swarmctl agent kill <id> [--force]
swarmctl agent logs <id> [--follow]

# Event Streaming
swarmctl events [--follow] [--filter <expr>]
swarmctl bus publish <topic> <message>
swarmctl bus subscribe <topic>

# Monitoring
swarmctl status
swarmctl metrics [--format prometheus|json]
swarmctl health
```

**See:** `docs/CLI_IMPROVEMENTS_NEEDED.md` for full specification

### 3. API Documentation Gaps

**Missing Endpoints (11 total):**

| Endpoint | Method | Purpose | Priority |
|----------|--------|---------|----------|
| `/api/agents` | POST | Spawn agent | 🔴 Critical |
| `/api/agents/:id/kill` | POST | Kill agent | 🔴 Critical |
| `/api/agents/:id/logs` | GET | Get logs | 🟡 High |
| `/api/tasks` | POST | Create task | 🟡 High |
| `/api/tasks/:id/assign` | POST | Assign to agent | 🟡 High |
| `/api/bus/publish` | POST | Publish event | 🟡 High |
| `/api/bus/subscribe` | WS | Subscribe to topic | 🟡 High |
| `/api/capabilities` | GET | Discovery | 🔴 Critical |
| `/api/metrics/json` | GET | JSON metrics | 🟡 High |
| `/api/logs` | GET | Query logs | 🟡 High |
| `/api/health/detailed` | GET | Detailed health | 🟢 Medium |

**See:** `docs/API_DOCUMENTATION_GAPS.md` for full specifications

### 4. Integration Points

**OpenClaw Integration Status:**

| Integration | Status | Notes |
|-------------|--------|-------|
| Tool calls | ⚠️ Partial | Via `src/core/openclaw.ts` |
| Event streaming | ✅ Working | WebSocket/SSE support |
| Agent discovery | ❌ Missing | No mDNS/service discovery |
| Authentication | ⚠️ Partial | API keys only, no OAuth |
| MessageBus | ✅ Working | `src/bus/index.ts` |

**Code Evidence:**
```typescript
// src/core/openclaw.ts - Limited integration
export interface OpenClawTool {
  name: string;
  description: string;
  execute: (params: any) => Promise<any>;
}
// Only 3 tools exposed, no agent lifecycle integration
```

### 5. SDK Requirements

**Missing:** `@godel/client` SDK

**Required Features:**
```typescript
import { DashClient } from '@godel/client';

const client = new DashClient({
  baseUrl: 'http://localhost:7373',
  apiKey: process.env.DASH_API_KEY
});

// Team operations
const team = await client.teams.create({ name: 'test', count: 5 });
await team.scale(10);
await team.destroy();

// Agent operations
const agent = await client.agents.spawn({ swarmId: team.id });
await agent.kill();

// Event streaming
const events = client.events.subscribe({ swarmId: team.id });
events.on('agent:spawned', (e) => console.log(e));

// Task queue
const task = await client.tasks.create({ type: 'code-review', payload: {} });
await task.assignTo(agent.id);
```

---

## Critical Issues

### 1. No Agent-Facing Documentation
**Problem:** Godel has extensive human docs but nothing telling OTHER AGENTS how to use it programmatically.

**Impact:** Agents must reverse-engineer the API from human documentation.

**Solution:** 
- ✅ Created root `SKILL.md`
- Create `skill.json` machine-readable manifest

### 2. No Programmatic Interface
**Problem:** No CLI with `--json` flags, no SDK.

**Impact:** Agents cannot integrate with Godel from shell scripts or other languages.

**Solution:**
- Build CLI with JSON output (`docs/CLI_IMPROVEMENTS_NEEDED.md`)
- Create `@godel/client` SDK

### 3. API Incomplete
**Problem:** Key endpoints missing (spawn agent, kill agent, create task).

**Impact:** Cannot perform basic operations via API.

**Solution:**
- Implement 11 missing endpoints (`docs/API_DOCUMENTATION_GAPS.md`)

### 4. No OpenAPI Spec
**Problem:** Cannot generate clients or auto-discover API.

**Impact:** Every agent must manually integrate.

**Solution:**
- Create OpenAPI 3.0 specification
- Host at `/api/openapi.json`

---

## Recommendations

### Phase 1: Critical (2 weeks)

| # | Action | Owner | Effort |
|---|--------|-------|--------|
| 1 | ✅ Create root `SKILL.md` | Docs | Done |
| 2 | Create `skill.json` manifest | API | 1 day |
| 3 | Build basic CLI (5 core commands) | CLI | 3 days |
| 4 | Add JSON output to all CLI commands | CLI | 2 days |
| 5 | Implement 5 critical API endpoints | API | 1 week |

### Phase 2: High Priority (2 weeks)

| # | Action | Owner | Effort |
|---|--------|-------|--------|
| 6 | Create OpenAPI 3.0 specification | API | 2 days |
| 7 | Build @godel/client SDK | SDK | 1 week |
| 8 | Implement remaining 6 API endpoints | API | 1 week |
| 9 | Add WebSocket auth | Auth | 2 days |
| 10 | Standardize response wrapper | API | 1 day |

### Phase 3: Medium Priority (1 week)

| # | Action | Owner | Effort |
|---|--------|-------|--------|
| 11 | Add mDNS discovery | Discovery | 2 days |
| 12 | Create CLI completion scripts | CLI | 1 day |
| 13 | Add SDK TypeScript types | SDK | 2 days |
| 14 | Create integration examples | Docs | 2 days |

---

## Estimated Implementation Effort

| Component | Time |
|-----------|------|
| ✅ SKILL.md (created) | Done |
| skill.json manifest | 1 day |
| Basic CLI (5 commands) | 2-3 days |
| Complete CLI (20+ commands) | 2 weeks |
| Missing API endpoints (11) | 1 week |
| OpenAPI spec | 2-3 days |
| @godel/client SDK | 1 week |
| Integration examples | 2 days |
| **Total** | **~4-5 weeks** |

---

## Conclusion

Godel has strong internal architecture but lacks critical agent-facing interfaces. The platform is currently **not ready** for easy integration by other agents in the OpenClaw ecosystem.

**To become "OpenClaw's first platform":**
1. Create CLI with JSON output
2. Complete the API (11 missing endpoints)
3. Build `@godel/client` SDK
4. Create OpenAPI specification

**Estimated time:** 4-5 weeks of focused effort

**Next Steps:**
1. Implement CLI specification from `docs/CLI_IMPROVEMENTS_NEEDED.md`
2. Add missing API endpoints from `docs/API_DOCUMENTATION_GAPS.md`
3. Create SDK for programmatic access
4. Re-assess agent integration readiness

---

## Files Created

1. **`/SKILL.md`** - Root agent-facing documentation
2. **`docs/AGENT_SKILL_INTERFACE_REVIEW.md`** - This review document
3. **`docs/CLI_IMPROVEMENTS_NEEDED.md`** - Complete CLI specification
4. **`docs/API_DOCUMENTATION_GAPS.md`** - Missing API specifications
