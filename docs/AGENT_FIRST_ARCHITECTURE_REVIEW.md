# Godel Agent-First Architecture Review

**Date:** February 3, 2026  
**Reviewer:** Senior Engineer (Code Review Subagent)  
**Scope:** Full codebase review for agent-first architecture patterns  
**Goal:** Assess Godel's readiness for agent-to-agent orchestration as OpenClaw's first platform

---

## Executive Summary

Godel is a well-architected agent orchestration platform with strong foundations for programmatic/agent consumption. The codebase demonstrates good separation of concerns, comprehensive API design, and thoughtful abstractions for agent lifecycle management. However, there are several gaps that need addressing to fully achieve "agent-first" status where agents can discover, onboard, and operate Godel without human intervention.

**Overall Grade: B+ (Good agent foundations, needs improvements for full agent autonomy)**

---

## 1. Agent-First API Design

### 1.1 Current State

**Strengths:**
- ✅ **RESTful API** (`src/api/server.ts`, `src/api/routes/`) with clear resource-oriented endpoints
- ✅ **WebSocket support** for real-time event streaming (`src/api/websocket.ts`)
- ✅ **Comprehensive endpoints** for agents, teams, events, and tasks
- ✅ **Zod validation schemas** (`src/validation/schemas.ts`) with strict input validation
- ✅ **SSE (Server-Sent Events)** endpoint for event streaming (`/api/events/stream`)
- ✅ **Structured error responses** with error codes
- ✅ **OpenAPI-ready documentation** in `docs/API.md`

**API Coverage Assessment:**
| Resource | CRUD | Actions | Events | Grade |
|----------|------|---------|--------|-------|
| Agents | ✅ Full | ✅ kill/pause/resume/retry | ✅ WebSocket | A |
| Teams | ✅ Full | ✅ scale/destroy | ✅ WebSocket | A |
| Events | ✅ Create/Read | ✅ Stream | ✅ SSE/WS | A |
| Tasks | ✅ Full | - | ⚠️ Limited | B |
| Budget | ✅ Read | ⚠️ Limited API | ❌ No events | C |

### 1.2 Gaps for Agent-First Usage

**Critical Issues:**
1. **No agent discovery endpoint** - Agents cannot programmatically discover Godel's capabilities
2. **No OpenAPI/Swagger spec** - Agents must parse markdown docs to understand the API
3. **Missing hypermedia/HATEOAS** - Responses don't include discoverable next actions
4. **No agent capability negotiation** - No way for agents to advertise/request capabilities

**Code Evidence:**
```typescript
// src/api/server.ts - Standard REST, no agent affordances
router.get('/agents/:id', async (req, res) => {
  const agent = await repo.findById(id);
  res.json(agent);  // No links, no actions, no discovery
});
```

### 1.3 Recommendations

| Priority | Action | Effort |
|----------|--------|--------|
| 🔴 High | Add `/api/capabilities` endpoint returning OpenAPI spec + available actions | 2 days |
| 🔴 High | Implement HATEOAS links in all responses (`_links` field with next actions) | 3 days |
| 🟡 Medium | Add agent negotiation headers (`Accept-Agent-Actions`) | 1 day |
| 🟡 Medium | Create machine-readable API spec (OpenAPI 3.0) | 2 days |

---

## 2. Onboarding Flow for Agents

### 2.1 Current State

**Existing Documentation:**
- ✅ **SKILL.md** - Agent-facing documentation with onboarding instructions
- ✅ **README.md** - Human-oriented quick start
- ✅ **Comprehensive docs/** folder with API reference, CLI reference, events, extensions
- ✅ **Code examples** in docs showing programmatic usage

**SKILL.md Assessment:**
The `SKILL.md` file is well-structured for agent consumption:
- Clear quick start section for agents
- Team protocol documentation
- Cron job patterns for autonomous operation
- Health check commands
- State management examples
- Troubleshooting guide

```markdown
## Quick Start (For Agents)
cd /Users/jasontang/clawd/projects/godel
./orchestrator.sh
```

### 2.2 Gaps for Agent-First Onboarding

**Critical Issues:**
1. **No automated discovery mechanism** - Agents must be pre-configured with Godel location
2. **No capability advertisement** - Godel doesn't broadcast its presence or capabilities
3. **No standardized skill manifest** - SKILL.md is prose, not machine-readable
4. **Missing agent registration flow** - No formal onboarding handshake
5. **No environment introspection** - Agents can't query "what can Godel do for me?"

**Code Evidence:**
```typescript
// SKILL.md - Good for humans, not machine-parseable
## Team Protocol (v3)
### Launch Parallel Sprints
```bash
./sprint-launcher.sh
```
```

### 2.3 Recommendations

| Priority | Action | Effort |
|----------|--------|--------|
| 🔴 High | Create `skill.json` manifest (machine-readable version of SKILL.md) | 1 day |
| 🔴 High | Add mDNS/Bonjour discovery for Godel instances on local network | 2 days |
| 🟡 Medium | Implement agent handshake endpoint (`POST /api/agents/register`) | 2 days |
| 🟡 Medium | Add capability query endpoint (`GET /api/capabilities?for=agent`) | 1 day |
| 🟢 Low | Create agent SDK with auto-discovery | 3 days |

**Suggested `skill.json` structure:**
```json
{
  "name": "godel-agent-skill",
  "version": "2.0.0",
  "api": {
    "baseUrl": "http://localhost:7373",
    "websocket": "ws://localhost:7373/events",
    "openapi": "/api/openapi.json"
  },
  "capabilities": ["team", "agent-lifecycle", "events", "budget"],
  "authentication": { "type": "api-key", "header": "X-API-Key" },
  "entrypoints": {
    "cli": "./dist/index.js",
    "api": "./src/api/server.ts"
  }
}
```

---

## 3. Human vs Agent Interface Separation

### 3.1 Current State

**Architecture:**
```
src/
├── api/           # REST API (agent-facing)
├── cli/           # CLI commands (human-facing)
├── dashboard/     # Dashboard UI (human-facing)
│   ├── ui/        # React web UI
│   └── Dashboard.ts # Terminal UI
└── core/          # Shared core logic
```

**Separation Quality:**
- ✅ **Clean separation** - API layer is distinct from CLI and Dashboard
- ✅ **Shared core** - `src/core/` contains business logic used by all interfaces
- ✅ **Agent tools** - `src/integrations/openclaw/` provides agent-specific tools
- ✅ **Extension API** - `src/core/extension-api.ts` for programmatic extensions

**API vs Dashboard Comparison:**
| Feature | API | Dashboard | Separation |
|---------|-----|-----------|------------|
| List agents | ✅ | ✅ | Good |
| Spawn agent | ✅ | ⚠️ Read-only | Gap |
| Kill agent | ✅ | ⚠️ Read-only | Gap |
| View events | ✅ | ✅ | Good |
| Scale team | ✅ | ❌ | Gap |
| Set budget | ✅ | ⚠️ View only | Gap |

### 3.2 Gaps in Separation

**Critical Issues:**
1. **Dashboard is read-only** - Agents using the Dashboard UI cannot perform actions (no spawn/kill)
2. **Dashboard UI uses different auth** - Bearer token vs API key creates confusion
3. **No agent-specific UI** - Dashboard is designed for humans, not agent monitoring
4. **API has no agent preference headers** - Cannot request agent-optimized responses

**Code Evidence:**
```typescript
// src/dashboard/ui/src/services/api.ts
// Dashboard uses Bearer auth, API uses X-API-Key
const token = localStorage.getItem('dash_token');
...(token && { 'Authorization': `Bearer ${token}` }),  // Different from API!

// src/api/middleware/auth.ts
const key = req.headers['x-api-key'] as string;  // API key auth
```

### 3.3 Recommendations

| Priority | Action | Effort |
|----------|--------|--------|
| 🔴 High | Unify authentication (support both Bearer and X-API-Key in both) | 1 day |
| 🟡 Medium | Add agent action capabilities to Dashboard | 2 days |
| 🟡 Medium | Create agent-optimized API responses (compact, no human formatting) | 2 days |
| 🟢 Low | Build agent dashboard (different from human dashboard) | 3 days |

---

## 4. Agent Authentication & Identity

### 4.1 Current State

**Authentication System:**
```typescript
// src/api/middleware/auth.ts
function authMiddleware(apiKey: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.headers['x-api-key'] as string;
    if (!validKeys.has(key)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  };
}
```

**Current Model:**
- ✅ Simple API key authentication
- ✅ In-memory key storage (with `addApiKey()`/`revokeApiKey()`)
- ✅ Health endpoint exempt from auth
- ✅ Environment-based default key (`DASH_API_KEY`)

### 4.2 Gaps for Agent-First Auth

**Critical Issues:**
1. **No agent identity** - All agents use same API key, no granular permissions
2. **No agent-specific tokens** - Cannot scope tokens to specific agents
3. **No permission model** - Binary auth (authenticated/not) vs granular permissions
4. **No SSO/OAuth for humans** - Forces humans to use API keys too
5. **No token lifecycle** - No expiration, refresh, or audit trail

**Code Evidence:**
```typescript
// src/api/middleware/auth.ts - Too simple for agent orchestration
const validKeys = new Set<string>();  // Shared across all agents!
export function addApiKey(key: string): void {
  validKeys.add(key);  // No association with agent identity
}
```

### 4.3 Recommendations

| Priority | Action | Effort |
|----------|--------|--------|
| 🔴 High | Implement JWT tokens with agent identity claims | 3 days |
| 🔴 High | Add RBAC permission system (`agent:spawn`, `team:destroy`, etc.) | 3 days |
| 🟡 Medium | Separate human SSO (OAuth) from agent API keys | 2 days |
| 🟡 Medium | Add token expiration and refresh mechanism | 2 days |
| 🟢 Low | Implement audit logging for auth events | 1 day |

**Suggested JWT Structure:**
```json
{
  "sub": "agent-uuid",
  "type": "agent",
  "permissions": ["team:create", "agent:spawn", "events:read"],
  "teams": ["team-1", "team-2"],
  "exp": 1704067200
}
```

---

## 5. Observability for Agent Operations

### 5.1 Current State

**Observability Stack:**
```
src/
├── metrics/       # Prometheus metrics
├── tracing/       # OpenTelemetry/Jaeger tracing
├── logging/       # Structured logging
└── events/        # Event bus for real-time monitoring
```

**Strengths:**
- ✅ **Prometheus metrics** (`src/metrics/prometheus.ts`) - 20+ metrics for agents/teams
- ✅ **Health checks** (`src/metrics/health.ts`) - Comprehensive system health
- ✅ **OpenTelemetry tracing** (`src/tracing/`) - Distributed tracing support
- ✅ **Structured logging** (`src/logging/structured.ts`) - JSON logs with context
- ✅ **Event streaming** - WebSocket + SSE for real-time agent monitoring
- ✅ **Log aggregation** - Loki integration for log queries

**Metrics Available:**
| Category | Metrics | API Accessible |
|----------|---------|----------------|
| Agents | active, pending, failed, completed, total | ✅ Yes |
| Teams | active, total, agents count, duration | ✅ Yes |
| Events | total, dropped, processing latency | ✅ Yes |
| Budget | utilization, cost | ⚠️ Limited |
| System | memory, CPU, WebSocket connections | ✅ Yes |

### 5.2 Gaps for Agent Observability

**Critical Issues:**
1. **No agent-specific metrics endpoint** - Agents must scrape Prometheus format
2. **No programmatic log access** - Logs are file-based, not queryable via API
3. **Missing agent introspection** - Agents can't query their own metrics easily
4. **No distributed trace correlation** - Hard to trace across agent boundaries
5. **Event API is write-only for agents** - Agents can emit but not easily query

**Code Evidence:**
```typescript
// src/metrics/prometheus.ts - Prometheus format only
async getMetrics(): Promise<string> {
  return register.metrics();  // Prometheus text format, not JSON
}

// src/logging/structured.ts - File/console only
private output(entry: LogEntry): void {
  if (this.config.prettyPrint) {
    this.prettyPrint(entry);
  } else {
    console.log(JSON.stringify(entry));  // Not queryable via API
  }
}
```

### 5.3 Recommendations

| Priority | Action | Effort |
|----------|--------|--------|
| 🔴 High | Add `/api/metrics/json` endpoint for programmatic access | 1 day |
| 🔴 High | Implement `/api/logs` query endpoint with filtering | 2 days |
| 🟡 Medium | Add agent self-introspection (`GET /api/agents/:id/metrics`) | 1 day |
| 🟡 Medium | Enhance event API with query capabilities | 2 days |
| 🟢 Low | Create agent observability SDK | 3 days |

---

## 6. Blockers for Agent-Only Usage

### Critical Blockers (Must Fix)

1. **No Agent Identity System**
   - All agents share the same API key
   - No way to attribute actions to specific agents
   - No agent-specific permissions

2. **No Programmatic Discovery**
   - Agents must be pre-configured with Godel location and API schema
   - No capability advertisement or negotiation

3. **Limited Dashboard Actions**
   - Dashboard is read-only; agents using the UI cannot take actions
   - No agent-optimized interface

4. **No Standardized Skill Manifest**
   - SKILL.md is prose, not machine-parseable
   - No `skill.json` for automatic skill loading

### High Priority Issues

5. **Authentication Mismatch**
   - Dashboard uses Bearer tokens, API uses X-API-Key
   - Creates confusion for agents using both

6. **No Agent-Specific Metrics API**
   - Must parse Prometheus text format
   - No JSON metrics endpoint

7. **Missing Agent Lifecycle Hooks**
   - No pre-spawn/post-complete hooks for agents
   - No agent plugin system

---

## 7. Priority-Ranked Action Items

### Phase 1: Critical (2 weeks)

| # | Action | Owner | Effort | Impact |
|---|--------|-------|--------|--------|
| 1 | Implement JWT-based auth with agent identity | Auth | 3 days | 🔴 Critical |
| 2 | Add RBAC permission system | Auth | 3 days | 🔴 Critical |
| 3 | Create `/api/capabilities` discovery endpoint | API | 2 days | 🔴 Critical |
| 4 | Create `skill.json` manifest | Docs | 1 day | 🔴 Critical |
| 5 | Add `/api/metrics/json` endpoint | Metrics | 1 day | 🟡 High |

### Phase 2: High Priority (2 weeks)

| # | Action | Owner | Effort | Impact |
|---|--------|-------|--------|--------|
| 6 | Unify authentication (Bearer + API key) | Auth | 1 day | 🟡 High |
| 7 | Implement HATEOAS links in API responses | API | 3 days | 🟡 High |
| 8 | Add `/api/logs` query endpoint | Logging | 2 days | 🟡 High |
| 9 | Add agent action capabilities to Dashboard | UI | 2 days | 🟡 High |
| 10 | Create machine-readable OpenAPI spec | API | 2 days | 🟡 High |

### Phase 3: Medium Priority (3 weeks)

| # | Action | Owner | Effort | Impact |
|---|--------|-------|--------|-------|
| 11 | Implement agent handshake/registration | API | 2 days | 🟢 Medium |
| 12 | Add mDNS discovery for Godel instances | Discovery | 2 days | 🟢 Medium |
| 13 | Create agent-optimized API responses | API | 2 days | 🟢 Medium |
| 14 | Add agent self-introspection endpoints | API | 1 day | 🟢 Medium |
| 15 | Enhance event API with query capabilities | Events | 2 days | 🟢 Medium |
| 16 | Build agent dashboard (separate from human) | UI | 3 days | 🟢 Medium |

---

## 8. Architecture Strengths to Preserve

1. **Clean Separation** - API/CLI/Dashboard separation is well-executed
2. **Comprehensive Event System** - Event bus with WebSocket/SSE is agent-friendly
3. **Extension API** - `src/core/extension-api.ts` enables agent customization
4. **OpenClaw Integration** - Core primitive design allows agents to use OpenClaw tools
5. **Structured Logging** - JSON logs with correlation IDs support agent debugging
6. **Validation Layer** - Zod schemas ensure API contract stability

---

## 9. Conclusion

Godel has a solid foundation for agent-first architecture with its clean API design, comprehensive event system, and thoughtful separation of concerns. The platform is already usable by agents with pre-configuration, but requires enhancements for true "agent-first" status where agents can:

1. **Discover** Godel automatically without human configuration
2. **Onboard** themselves with proper identity and permissions
3. **Operate** autonomously with appropriate observability
4. **Interact** with both APIs and UIs seamlessly

**Estimated Time to Full Agent-First:** 6-7 weeks (focused effort)

**Immediate Next Steps:**
1. Implement JWT auth with agent identity (Phase 1, #1)
2. Create `skill.json` manifest (Phase 1, #4)
3. Add discovery endpoint (Phase 1, #3)

These three changes would elevate Godel from "B+" to "A-" agent-first readiness.

---

## Appendix: Key Files Reviewed

| Category | Files |
|----------|-------|
| API | `src/api/server.ts`, `src/api/routes/*.ts`, `src/api/middleware/auth.ts` |
| Core | `src/core/index.ts`, `src/core/team.ts`, `src/core/openclaw.ts`, `src/core/extension-api.ts` |
| CLI | `src/cli/index.ts`, `src/cli/commands/agents.ts` |
| Dashboard | `src/dashboard/index.ts`, `src/dashboard/ui/src/services/api.ts` |
| Storage | `src/storage/repositories/AgentRepository.ts`, `src/storage/repositories/EventRepository.ts` |
| Metrics | `src/metrics/prometheus.ts`, `src/metrics/health.ts` |
| Logging | `src/logging/structured.ts` |
| Tracing | `src/tracing/index.ts` |
| Validation | `src/validation/schemas.ts` |
| Docs | `README.md`, `SKILL.md`, `docs/API.md`, `docs/extensions.md` |
| Config | `.env.example` |
