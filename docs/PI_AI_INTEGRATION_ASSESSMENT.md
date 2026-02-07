# Pi AI Unified LLM API - Integration Assessment

**Date:** February 3, 2026  
**Source:** https://github.com/badlogic/pi-mono/tree/main/packages/ai  
**Assessor:** OpenClaw

---

## Executive Summary

**Recommendation:** ✅ **Integrate Pi AI Unified LLM API into Godel**

**Strategic Value:** HIGH  
**Implementation Effort:** MEDIUM (2-3 days)  
**Impact:** Enables multi-provider LLM support with failover

---

## Current State Analysis

### Godel Current LLM Support
- **Status:** No unified LLM API exists
- **Approach:** Each agent likely implements its own LLM client
- **Providers:** Not standardized
- **Failover:** Manual/undefined
- **Configuration:** Per-agent

**Problems with Current Approach:**
1. No centralized rate limiting
2. No provider failover
3. Inconsistent error handling
4. Duplicate configuration
5. No unified observability

---

## Pi AI Package Analysis

### What is Pi AI?
Pi AI is a **unified LLM API** that provides:
- Single interface for multiple providers (OpenAI, Anthropic, Google, etc.)
- Automatic failover between providers
- Rate limiting and request queuing
- Unified error handling
- Cost tracking
- Provider-agnostic prompts

### Key Features

| Feature | Description | Benefit for Godel |
|---------|-------------|------------------|
| **Multi-Provider** | OpenAI, Anthropic, Google, local models | Agent flexibility |
| **Auto-Failover** | Switches providers on failure | Reliability |
| **Rate Limiting** | Built-in token bucket | Cost control |
| **Unified API** | Same interface for all providers | Simplicity |
| **Streaming** | SSE/WebSocket support | Real-time agents |
| **Cost Tracking** | Per-request cost metrics | Budget management |

---

## Integration Benefits

### 1. Agent Reliability
```typescript
// Before: Agent handles its own LLM calls
const response = await openai.chat.completions.create({...});
// If OpenAI fails, agent fails

// After: Godel provides resilient LLM API
const response = await godel.llm.complete({
  prompt: "...",
  providers: ['openai', 'anthropic', 'google'] // Auto-failover
});
```

### 2. Cost Optimization
- Route to cheapest provider
- Track costs per agent/team
- Budget alerts
- Usage quotas

### 3. Operational Excellence
- Centralized LLM metrics
- Unified logging
- Provider health monitoring
- Circuit breaker patterns

### 4. Developer Experience
- One API for all LLMs
- Consistent error format
- Built-in retry logic
- Streaming support

---

## Implementation Plan

### Phase 1: Core Integration (1 day)

**PRD-005: Pi AI Integration**

**Requirements:**
- Integrate `@pi/ai` package
- Create Godel LLM service
- Add configuration system
- Implement provider failover

**Spec:** SPEC-005-pi-ai-integration.md

**Files:**
- `src/ai/llm-service.ts` - Core LLM service
- `src/ai/provider-registry.ts` - Provider management
- `src/ai/config.ts` - Configuration
- `src/ai/types.ts` - Type definitions

### Phase 2: Agent Integration (1 day)

**Update agents to use unified API:**
- Modify agent base class
- Update existing agents
- Add LLM context to agents

**Files:**
- `src/agents/base-agent.ts` - Add LLM client
- `src/agents/context.ts` - LLM context

### Phase 3: Observability (0.5 days)

**Add metrics and monitoring:**
- LLM request metrics
- Cost tracking
- Provider health

**Files:**
- `src/ai/metrics.ts` - LLM metrics
- `src/ai/cost-tracker.ts` - Cost tracking

### Phase 4: Testing (0.5 days)

**Test suite:**
- Provider failover tests
- Rate limiting tests
- Cost tracking tests

---

## Technical Design

### Architecture

```
┌─────────────────────────────────────────┐
│              Godel Agents                │
└─────────────┬───────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────┐
│         Godel LLM Service                │
│  ┌─────────────┐  ┌─────────────────┐  │
│  │   Router    │──│  Rate Limiter   │  │
│  └─────────────┘  └─────────────────┘  │
│  ┌─────────────┐  ┌─────────────────┐  │
│  │   Retry     │──│  Cost Tracker   │  │
│  └─────────────┘  └─────────────────┘  │
└─────────────┬───────────────────────────┘
              │
    ┌─────────┼─────────┐
    ▼         ▼         ▼
┌──────┐  ┌──────┐  ┌──────┐
│OpenAI│  │Anthro│  │Google│
└──────┘  └──────┘  └──────┘
```

### API Design

```typescript
// src/ai/types.ts

interface LLMRequest {
  prompt: string;
  systemPrompt?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  providers?: string[]; // Preferred providers in order
  stream?: boolean;
}

interface LLMResponse {
  content: string;
  model: string;
  provider: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    cost: number;
  };
  latency: number;
}

interface LLMService {
  complete(request: LLMRequest): Promise<LLMResponse>;
  stream(request: LLMRequest): AsyncIterable<LLMResponse>;
  getProviderHealth(): ProviderHealth[];
  getCosts(timeRange: TimeRange): CostReport;
}
```

### Configuration

```yaml
# config/godel.yaml
ai:
  defaultProvider: openai
  providers:
    openai:
      apiKey: ${OPENAI_API_KEY}
      models:
        - gpt-4o
        - gpt-4o-mini
      rateLimit: 1000  # requests per minute
      priority: 1
    
    anthropic:
      apiKey: ${ANTHROPIC_API_KEY}
      models:
        - claude-sonnet-4-5
        - claude-haiku-3-5
      rateLimit: 500
      priority: 2
    
    google:
      apiKey: ${GOOGLE_API_KEY}
      models:
        - gemini-1.5-pro
      rateLimit: 300
      priority: 3
  
  failover:
    enabled: true
    maxRetries: 3
    retryDelay: 1000  # ms
  
  costTracking:
    enabled: true
    budgetAlerts:
      - threshold: 100
        action: warn
      - threshold: 500
        action: alert
```

---

## Benefits Summary

| Benefit | Impact | Effort |
|---------|--------|--------|
| **Reliability** | HIGH | Auto-failover |
| **Cost Control** | HIGH | Rate limiting, budget alerts |
| **Developer UX** | MEDIUM | Unified API |
| **Observability** | HIGH | Centralized metrics |
| **Flexibility** | HIGH | Multi-provider |

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Pi AI package instability | Low | Medium | Pin version, fork if needed |
| Provider API changes | Medium | Low | Pi AI abstracts changes |
| Rate limit conflicts | Low | Medium | Proper configuration |
| Cost overruns | Medium | High | Budget alerts, limits |

---

## Recommendation

**APPROVE integration of Pi AI Unified LLM API**

**Rationale:**
1. Aligns with Godel's goal of being a production-grade orchestration platform
2. Solves real reliability and cost management problems
3. Relatively low implementation effort (2-3 days)
4. High strategic value for OpenClaw integration
5. Provides foundation for future AI features

**Next Steps:**
1. Create PRD-005 and SPEC-005
2. Spawn implementation agents
3. Integrate with existing agents
4. Deploy and validate

**Priority:** HIGH - Should be implemented before production deployment
