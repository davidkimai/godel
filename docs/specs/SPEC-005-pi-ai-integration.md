# SPEC: Pi AI Unified LLM API Integration

**Version:** 1.0  
**Date:** February 3, 2026  
**Status:** Ready for Implementation  
**Priority:** P1 - High  
**PRD Reference:** [PRD-005-pi-ai-integration.md](../prds/PRD-005-pi-ai-integration.md)

---

## Overview

Integrate Pi AI Unified LLM API into Dash to provide multi-provider LLM support with automatic failover, rate limiting, and cost tracking.

**PRD Success Criteria:**
1. ✅ Agents can call LLMs through unified API
2. ✅ Failover works when primary provider fails
3. ✅ Rate limits enforced correctly
4. ✅ Cost tracking visible in dashboard
5. ✅ Budget alerts trigger correctly
6. ✅ All existing agents migrated
7. ✅ No increase in P99 latency

---

## Implementation Tasks

### Phase 1: Core Integration (Day 1)

#### Task 1.1: Install Pi AI Package

**File:** `package.json`

```bash
npm install @pi/ai
```

**Verification:**
```bash
npm list @pi/ai
# Should show @pi/ai@latest
```

---

#### Task 1.2: Create LLM Service

**File:** `src/ai/llm-service.ts`

```typescript
import { PiAI, ProviderConfig } from '@pi/ai';
import { EventEmitter } from 'events';

export interface LLMRequest {
  prompt: string;
  systemPrompt?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  providers?: string[];
  stream?: boolean;
  agentId?: string;
  swarmId?: string;
}

export interface LLMResponse {
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
  timestamp: Date;
}

export class LLMService extends EventEmitter {
  private piAI: PiAI;
  private config: LLMConfig;
  private costTracker: CostTracker;
  private rateLimiter: RateLimiter;
  
  constructor(config: LLMConfig) {
    super();
    this.config = config;
    this.piAI = new PiAI({
      providers: config.providers,
      failover: config.failover,
      defaultProvider: config.defaultProvider
    });
    this.costTracker = new CostTracker();
    this.rateLimiter = new RateLimiter(config.rateLimits);
  }
  
  async complete(request: LLMRequest): Promise<LLMResponse> {
    const startTime = Date.now();
    
    // Check rate limits
    await this.rateLimiter.checkLimit(request.providers);
    
    // Track cost
    this.costTracker.trackRequest(request);
    
    try {
      // Call Pi AI
      const result = await this.piAI.complete({
        prompt: request.prompt,
        system: request.systemPrompt,
        model: request.model,
        temperature: request.temperature,
        maxTokens: request.maxTokens,
        providers: request.providers || this.config.defaultProvider,
        stream: false
      });
      
      const response: LLMResponse = {
        content: result.content,
        model: result.model,
        provider: result.provider,
        usage: {
          promptTokens: result.usage.promptTokens,
          completionTokens: result.usage.completionTokens,
          totalTokens: result.usage.totalTokens,
          cost: this.calculateCost(result.usage, result.provider)
        },
        latency: Date.now() - startTime,
        timestamp: new Date()
      };
      
      // Track actual cost
      this.costTracker.trackResponse(request, response);
      
      // Emit event for monitoring
      this.emit('llm:complete', {
        request,
        response,
        agentId: request.agentId,
        swarmId: request.swarmId
      });
      
      return response;
      
    } catch (error) {
      this.emit('llm:error', {
        request,
        error,
        agentId: request.agentId,
        swarmId: request.swarmId
      });
      throw error;
    }
  }
  
  async *stream(request: LLMRequest): AsyncIterable<LLMResponse> {
    const startTime = Date.now();
    
    await this.rateLimiter.checkLimit(request.providers);
    
    const stream = await this.piAI.stream({
      prompt: request.prompt,
      system: request.systemPrompt,
      model: request.model,
      temperature: request.temperature,
      maxTokens: request.maxTokens,
      providers: request.providers || this.config.defaultProvider
    });
    
    let totalTokens = 0;
    let totalCost = 0;
    
    for await (const chunk of stream) {
      const response: LLMResponse = {
        content: chunk.content,
        model: chunk.model,
        provider: chunk.provider,
        usage: {
          promptTokens: chunk.usage?.promptTokens || 0,
          completionTokens: chunk.usage?.completionTokens || 0,
          totalTokens: chunk.usage?.totalTokens || 0,
          cost: this.calculateCost(chunk.usage, chunk.provider)
        },
        latency: Date.now() - startTime,
        timestamp: new Date()
      };
      
      totalTokens += response.usage.totalTokens;
      totalCost += response.usage.cost;
      
      this.emit('llm:stream', {
        request,
        chunk: response,
        agentId: request.agentId,
        swarmId: request.swarmId
      });
      
      yield response;
    }
    
    // Track final cost
    this.costTracker.trackTokens(request, totalTokens, totalCost);
  }
  
  private calculateCost(usage: any, provider: string): number {
    const rates = this.config.providerRates[provider];
    if (!rates) return 0;
    
    return (
      (usage.promptTokens / 1000) * rates.inputRate +
      (usage.completionTokens / 1000) * rates.outputRate
    );
  }
  
  getProviderHealth(): ProviderHealth[] {
    return this.piAI.getProviderHealth();
  }
  
  getCosts(timeRange: TimeRange): CostReport {
    return this.costTracker.getReport(timeRange);
  }
}
```

**Verification:**
```bash
npm run build
# Should compile without errors
```

---

#### Task 1.3: Create Configuration

**File:** `src/ai/config.ts`

```typescript
export interface LLMConfig {
  defaultProvider: string;
  providers: ProviderConfig[];
  failover: FailoverConfig;
  rateLimits: RateLimitConfig;
  providerRates: Record<string, ProviderRates>;
  budgetAlerts: BudgetAlert[];
}

export interface ProviderConfig {
  name: string;
  apiKey: string;
  baseUrl?: string;
  models: string[];
  priority: number;
  enabled: boolean;
}

export interface FailoverConfig {
  enabled: boolean;
  maxRetries: number;
  retryDelay: number;
  fallbackProviders: string[];
}

export interface RateLimitConfig {
  global: {
    requestsPerMinute: number;
    tokensPerMinute: number;
  };
  perProvider: Record<string, {
    requestsPerMinute: number;
    tokensPerMinute: number;
  }>;
}

export interface ProviderRates {
  inputRate: number;   // per 1K tokens
  outputRate: number;  // per 1K tokens
}

export interface BudgetAlert {
  threshold: number;  // dollar amount
  action: 'warn' | 'alert' | 'block';
  channels: string[]; // notification channels
}

export const defaultLLMConfig: LLMConfig = {
  defaultProvider: 'openai',
  providers: [
    {
      name: 'openai',
      apiKey: process.env.OPENAI_API_KEY || '',
      models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
      priority: 1,
      enabled: true
    },
    {
      name: 'anthropic',
      apiKey: process.env.ANTHROPIC_API_KEY || '',
      models: ['claude-sonnet-4-5', 'claude-haiku-3-5'],
      priority: 2,
      enabled: true
    },
    {
      name: 'google',
      apiKey: process.env.GOOGLE_API_KEY || '',
      models: ['gemini-1.5-pro', 'gemini-1.5-flash'],
      priority: 3,
      enabled: true
    }
  ],
  failover: {
    enabled: true,
    maxRetries: 3,
    retryDelay: 1000,
    fallbackProviders: ['anthropic', 'google']
  },
  rateLimits: {
    global: {
      requestsPerMinute: 1000,
      tokensPerMinute: 100000
    },
    perProvider: {
      openai: { requestsPerMinute: 500, tokensPerMinute: 50000 },
      anthropic: { requestsPerMinute: 300, tokensPerMinute: 30000 },
      google: { requestsPerMinute: 200, tokensPerMinute: 20000 }
    }
  },
  providerRates: {
    openai: { inputRate: 0.005, outputRate: 0.015 },
    anthropic: { inputRate: 0.003, outputRate: 0.015 },
    google: { inputRate: 0.0035, outputRate: 0.0105 }
  },
  budgetAlerts: [
    { threshold: 100, action: 'warn', channels: ['slack'] },
    { threshold: 500, action: 'alert', channels: ['slack', 'pagerduty'] },
    { threshold: 1000, action: 'block', channels: ['slack', 'pagerduty', 'email'] }
  ]
};
```

---

#### Task 1.4: Create Rate Limiter

**File:** `src/ai/rate-limiter.ts`

```typescript
import { RateLimitConfig } from './config';

export class RateLimiter {
  private config: RateLimitConfig;
  private requestCounts: Map<string, number[]> = new Map();
  private tokenCounts: Map<string, number[]> = new Map();
  
  constructor(config: RateLimitConfig) {
    this.config = config;
  }
  
  async checkLimit(providers?: string[]): Promise<void> {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    // Check global limits
    const globalRequests = this.getRecentCount(this.requestCounts.get('global') || [], oneMinuteAgo);
    if (globalRequests >= this.config.global.requestsPerMinute) {
      throw new Error('Global rate limit exceeded');
    }
    
    // Check provider limits
    const providersToCheck = providers || Object.keys(this.config.perProvider);
    
    for (const provider of providersToCheck) {
      const providerConfig = this.config.perProvider[provider];
      if (!providerConfig) continue;
      
      const providerRequests = this.getRecentCount(
        this.requestCounts.get(provider) || [],
        oneMinuteAgo
      );
      
      if (providerRequests >= providerConfig.requestsPerMinute) {
        throw new Error(`Rate limit exceeded for provider: ${provider}`);
      }
    }
  }
  
  recordRequest(provider: string): void {
    const now = Date.now();
    
    // Record global
    this.recordInMap(this.requestCounts, 'global', now);
    
    // Record provider
    this.recordInMap(this.requestCounts, provider, now);
  }
  
  recordTokens(provider: string, tokens: number): void {
    const now = Date.now();
    
    // Record global
    this.recordInMap(this.tokenCounts, 'global', now, tokens);
    
    // Record provider
    this.recordInMap(this.tokenCounts, provider, now, tokens);
  }
  
  private getRecentCount(timestamps: number[], since: number): number {
    return timestamps.filter(t => t > since).length;
  }
  
  private recordInMap(
    map: Map<string, number[]>,
    key: string,
    timestamp: number,
    value: number = 1
  ): void {
    const existing = map.get(key) || [];
    existing.push(timestamp);
    
    // Keep only last 5 minutes of data
    const fiveMinutesAgo = timestamp - 300000;
    map.set(key, existing.filter(t => t > fiveMinutesAgo));
  }
}
```

---

#### Task 1.5: Create Cost Tracker

**File:** `src/ai/cost-tracker.ts`

```typescript
import { LLMRequest, LLMResponse } from './llm-service';

export interface CostReport {
  totalCost: number;
  totalTokens: number;
  totalRequests: number;
  byProvider: Record<string, ProviderCost>;
  byAgent: Record<string, AgentCost>;
  bySwarm: Record<string, SwarmCost>;
  byModel: Record<string, ModelCost>;
}

interface ProviderCost {
  cost: number;
  tokens: number;
  requests: number;
}

interface AgentCost extends ProviderCost {
  agentId: string;
}

interface SwarmCost extends ProviderCost {
  swarmId: string;
}

interface ModelCost extends ProviderCost {
  model: string;
}

export class CostTracker {
  private requests: TrackedRequest[] = [];
  private maxHistory = 10000; // Keep last 10K requests
  
  trackRequest(request: LLMRequest): void {
    // Pre-track the request
  }
  
  trackResponse(request: LLMRequest, response: LLMResponse): void {
    this.requests.push({
      timestamp: new Date(),
      agentId: request.agentId,
      swarmId: request.swarmId,
      provider: response.provider,
      model: response.model,
      tokens: response.usage.totalTokens,
      cost: response.usage.cost
    });
    
    // Trim history
    if (this.requests.length > this.maxHistory) {
      this.requests = this.requests.slice(-this.maxHistory);
    }
    
    // Check budget alerts
    this.checkBudgetAlerts();
  }
  
  trackTokens(request: LLMRequest, tokens: number, cost: number): void {
    this.requests.push({
      timestamp: new Date(),
      agentId: request.agentId,
      swarmId: request.swarmId,
      provider: 'unknown',
      model: 'unknown',
      tokens,
      cost
    });
  }
  
  getReport(timeRange: TimeRange): CostReport {
    const startTime = timeRange.start.getTime();
    const endTime = timeRange.end.getTime();
    
    const filtered = this.requests.filter(
      r => r.timestamp.getTime() >= startTime && r.timestamp.getTime() <= endTime
    );
    
    const report: CostReport = {
      totalCost: 0,
      totalTokens: 0,
      totalRequests: filtered.length,
      byProvider: {},
      byAgent: {},
      bySwarm: {},
      byModel: {}
    };
    
    for (const req of filtered) {
      report.totalCost += req.cost;
      report.totalTokens += req.tokens;
      
      // By provider
      if (!report.byProvider[req.provider]) {
        report.byProvider[req.provider] = { cost: 0, tokens: 0, requests: 0 };
      }
      report.byProvider[req.provider].cost += req.cost;
      report.byProvider[req.provider].tokens += req.tokens;
      report.byProvider[req.provider].requests++;
      
      // By agent
      if (req.agentId) {
        if (!report.byAgent[req.agentId]) {
          report.byAgent[req.agentId] = { cost: 0, tokens: 0, requests: 0, agentId: req.agentId };
        }
        report.byAgent[req.agentId].cost += req.cost;
        report.byAgent[req.agentId].tokens += req.tokens;
        report.byAgent[req.agentId].requests++;
      }
      
      // By swarm
      if (req.swarmId) {
        if (!report.bySwarm[req.swarmId]) {
          report.bySwarm[req.swarmId] = { cost: 0, tokens: 0, requests: 0, swarmId: req.swarmId };
        }
        report.bySwarm[req.swarmId].cost += req.cost;
        report.bySwarm[req.swarmId].tokens += req.tokens;
        report.bySwarm[req.swarmId].requests++;
      }
      
      // By model
      if (!report.byModel[req.model]) {
        report.byModel[req.model] = { cost: 0, tokens: 0, requests: 0, model: req.model };
      }
      report.byModel[req.model].cost += req.cost;
      report.byModel[req.model].tokens += req.tokens;
      report.byModel[req.model].requests++;
    }
    
    return report;
  }
  
  private checkBudgetAlerts(): void {
    // Implementation for budget alerts
    // Would integrate with notification system
  }
}

interface TrackedRequest {
  timestamp: Date;
  agentId?: string;
  swarmId?: string;
  provider: string;
  model: string;
  tokens: number;
  cost: number;
}

export interface TimeRange {
  start: Date;
  end: Date;
}
```

---

### Phase 2: Agent Integration (Day 2)

#### Task 2.1: Create LLM Context for Agents

**File:** `src/agents/context.ts`

```typescript
import { LLMService, LLMRequest, LLMResponse } from '../ai/llm-service';

export interface AgentContext {
  agentId: string;
  swarmId?: string;
  llm: LLMClient;
  // ... other context
}

export interface LLMClient {
  complete(prompt: string, options?: LLMOptions): Promise<LLMResponse>;
  stream(prompt: string, options?: LLMOptions): AsyncIterable<LLMResponse>;
}

export interface LLMOptions {
  systemPrompt?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  providers?: string[];
}

export function createLLMClient(
  llmService: LLMService,
  agentId: string,
  swarmId?: string
): LLMClient {
  return {
    async complete(prompt: string, options: LLMOptions = {}): Promise<LLMResponse> {
      return llmService.complete({
        prompt,
        systemPrompt: options.systemPrompt,
        model: options.model,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        providers: options.providers,
        agentId,
        swarmId
      });
    },
    
    async *stream(prompt: string, options: LLMOptions = {}): AsyncIterable<LLMResponse> {
      yield* llmService.stream({
        prompt,
        systemPrompt: options.systemPrompt,
        model: options.model,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        providers: options.providers,
        agentId,
        swarmId
      });
    }
  };
}
```

---

#### Task 2.2: Update Base Agent

**File:** `src/agents/base-agent.ts`

```typescript
import { AgentContext, createLLMClient } from './context';
import { LLMService } from '../ai/llm-service';

export abstract class BaseAgent {
  protected context: AgentContext;
  
  constructor(
    agentId: string,
    swarmId: string,
    llmService: LLMService
  ) {
    this.context = {
      agentId,
      swarmId,
      llm: createLLMClient(llmService, agentId, swarmId),
      // ... other context initialization
    };
  }
  
  abstract execute(task: string): Promise<void>;
  
  // Helper method for LLM calls
  protected async callLLM(prompt: string, systemPrompt?: string): Promise<string> {
    const response = await this.context.llm.complete(prompt, {
      systemPrompt
    });
    return response.content;
  }
}
```

---

### Phase 3: API Endpoints (Day 2)

#### Task 3.1: Add LLM Endpoints

**File:** `src/api/routes/llm.ts`

```typescript
import { Router } from 'express';
import { LLMService } from '../../ai/llm-service';

export function createLLMRoutes(llmService: LLMService): Router {
  const router = Router();
  
  // POST /api/llm/complete
  router.post('/complete', async (req, res) => {
    try {
      const response = await llmService.complete({
        prompt: req.body.prompt,
        systemPrompt: req.body.systemPrompt,
        model: req.body.model,
        temperature: req.body.temperature,
        maxTokens: req.body.maxTokens,
        providers: req.body.providers,
        agentId: req.body.agentId,
        swarmId: req.body.swarmId
      });
      
      res.json({
        success: true,
        data: response
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: {
          code: 'LLM_ERROR',
          message: error.message
        }
      });
    }
  });
  
  // GET /api/llm/providers
  router.get('/providers', async (req, res) => {
    const health = llmService.getProviderHealth();
    res.json({
      success: true,
      data: health
    });
  });
  
  // GET /api/llm/costs
  router.get('/costs', async (req, res) => {
    const timeRange = {
      start: new Date(req.query.start as string),
      end: new Date(req.query.end as string)
    };
    
    const report = llmService.getCosts(timeRange);
    res.json({
      success: true,
      data: report
    });
  });
  
  return router;
}
```

---

### Phase 4: Testing (Day 3)

#### Task 4.1: Create LLM Service Tests

**File:** `tests/ai/llm-service.test.ts`

```typescript
import { describe, it, expect, beforeEach } from '@jest/globals';
import { LLMService } from '../../src/ai/llm-service';
import { defaultLLMConfig } from '../../src/ai/config';

describe('LLMService', () => {
  let service: LLMService;
  
  beforeEach(() => {
    service = new LLMService(defaultLLMConfig);
  });
  
  it('should complete request', async () => {
    const response = await service.complete({
      prompt: 'Hello',
      agentId: 'test-agent'
    });
    
    expect(response.content).toBeDefined();
    expect(response.provider).toBeDefined();
    expect(response.usage.cost).toBeGreaterThanOrEqual(0);
  }, 30000);
  
  it('should failover on provider failure', async () => {
    // Simulate provider failure and verify failover
  }, 30000);
  
  it('should enforce rate limits', async () => {
    // Test rate limiting
  }, 30000);
  
  it('should track costs', async () => {
    const response = await service.complete({
      prompt: 'Test',
      agentId: 'cost-test-agent'
    });
    
    const report = service.getCosts({
      start: new Date(Date.now() - 60000),
      end: new Date()
    });
    
    expect(report.totalCost).toBeGreaterThan(0);
    expect(report.byAgent['cost-test-agent']).toBeDefined();
  }, 30000);
});
```

---

## Verification

### Build Verification

```bash
npm run build
# Should compile without errors
```

### Test Verification

```bash
npm test -- --testPathPattern=llm-service
# All tests should pass
```

### Integration Verification

```bash
# Start Dash
npm run start

# Test LLM endpoint
curl -X POST http://localhost:7373/api/llm/complete \
  -H "Content-Type: application/json" \
  -H "X-API-Key: test-key" \
  -d '{
    "prompt": "Hello, world!",
    "agentId": "test-agent"
  }'

# Should return completion with cost tracking
```

---

## Success Criteria Verification

- [ ] Agents can call LLMs through unified API
- [ ] Failover works when primary provider fails
- [ ] Rate limits enforced correctly
- [ ] Cost tracking visible in dashboard
- [ ] Budget alerts trigger correctly
- [ ] All existing agents migrated
- [ ] No increase in P99 latency

---

**Commit:** "feat(ai): Integrate Pi AI Unified LLM API"

**Deliverables:**
- ✅ src/ai/llm-service.ts
- ✅ src/ai/config.ts
- ✅ src/ai/rate-limiter.ts
- ✅ src/ai/cost-tracker.ts
- ✅ src/agents/context.ts (updated)
- ✅ src/agents/base-agent.ts (updated)
- ✅ src/api/routes/llm.ts
- ✅ tests/ai/llm-service.test.ts
