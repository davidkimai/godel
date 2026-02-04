# SPEC: Dash Production Readiness - OpenClaw Integration

**Version:** 1.0  
**Date:** February 3, 2026  
**Status:** Ready for Implementation  
**Priority:** P0 - Critical  
**PRD Reference:** [PRD-002-openclaw-integration.md](../prds/PRD-002-openclaw-integration.md)

---

## Overview

Build seamless integration between Dash and OpenClaw, enabling OpenClaw to use Dash as its native orchestration platform.

**Goal:** OpenClaw users can spawn Dash agents and swarms natively.

**PRD Success Criteria:**
1. ✅ OpenClaw spawns 100 Dash agents simultaneously without errors
2. ✅ Events from Dash agents appear in OpenClaw within 500ms
3. ✅ `/dash spawn` command works in OpenClaw
4. ✅ Full integration test suite passes
5. ✅ Production deployment to OpenClaw infrastructure successful

---

## Architecture

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│   OpenClaw  │ ───► │   Adapter    │ ───► │    Dash     │
│  (sessions) │      │  (Protocol   │      │   (swarms)  │
│             │ ◄─── │  Translation)│ ◄─── │             │
└─────────────┘      └──────────────┘      └─────────────┘
        │                                            │
        │         ┌──────────────┐                   │
        └────────►│ Event Bridge │◄──────────────────┘
                  │ (Real-time   │
                  │  streaming)  │
                  └──────────────┘
```

---

## Component 1: OpenClaw Adapter

**Purpose:** Translate OpenClaw protocol to Dash API

### File: `src/integrations/openclaw/adapter.ts`

```typescript
import { sessions_spawn, sessions_send, sessions_kill, sessions_list } from '@/core/session-manager';
import { swarmctl } from '@/cli/lib/client';

export interface OpenClawAdapterConfig {
  dashApiUrl: string;
  dashApiKey: string;
  openclawSessionKey: string;
}

export class OpenClawAdapter {
  private config: OpenClawAdapterConfig;
  private agentIdMap: Map<string, string>;  // OpenClaw session -> Dash agent
  
  constructor(config: OpenClawAdapterConfig) {
    this.config = config;
    this.agentIdMap = new Map();
  }
  
  /**
   * Spawn an agent in Dash from OpenClaw session
   */
  async spawnAgent(openclawSessionKey: string, options: {
    agentType: string;
    task: string;
    model?: string;
    timeout?: number;
  }): Promise<{ dashAgentId: string; status: string }> {
    // Create swarm for this agent
    const swarmResult = await swarmctl.createSwarm({
      name: `openclaw-${openclawSessionKey}`,
      type: options.agentType,
      config: {
        task: options.task,
        model: options.model || 'default',
        timeout: options.timeout || 300000
      }
    });
    
    // Spawn agent in swarm
    const agentResult = await swarmctl.spawnAgent({
      swarmId: swarmResult.id,
      type: options.agentType
    });
    
    // Map OpenClaw session to Dash agent
    this.agentIdMap.set(openclawSessionKey, agentResult.id);
    
    // Set up event forwarding
    await this.setupEventForwarding(openclawSessionKey, agentResult.id);
    
    return {
      dashAgentId: agentResult.id,
      status: agentResult.status
    };
  }
  
  /**
   * Send message to Dash agent from OpenClaw
   */
  async sendMessage(openclawSessionKey: string, message: string): Promise<void> {
    const dashAgentId = this.agentIdMap.get(openclawSessionKey);
    
    if (!dashAgentId) {
      throw new Error(`No Dash agent mapped for session ${openclawSessionKey}`);
    }
    
    await swarmctl.sendMessage({
      agentId: dashAgentId,
      message
    });
  }
  
  /**
   * Kill Dash agent from OpenClaw
   */
  async killAgent(openclawSessionKey: string): Promise<void> {
    const dashAgentId = this.agentIdMap.get(openclawSessionKey);
    
    if (!dashAgentId) {
      return;  // Already killed or never spawned
    }
    
    await swarmctl.killAgent({ agentId: dashAgentId });
    this.agentIdMap.delete(openclawSessionKey);
  }
  
  /**
   * Get status of Dash agent
   */
  async getStatus(openclawSessionKey: string): Promise<{
    status: string;
    progress?: number;
    result?: any;
  }> {
    const dashAgentId = this.agentIdMap.get(openclawSessionKey);
    
    if (!dashAgentId) {
      return { status: 'not_found' };
    }
    
    const agent = await swarmctl.getAgent(dashAgentId);
    
    return {
      status: agent.status,
      progress: agent.progress,
      result: agent.result
    };
  }
  
  /**
   * List all active OpenClaw-managed agents
   */
  async listAgents(): Promise<Array<{
    openclawSessionKey: string;
    dashAgentId: string;
    status: string;
  }>> {
    return Array.from(this.agentIdMap.entries()).map(([sessionKey, agentId]) => ({
      openclawSessionKey: sessionKey,
      dashAgentId: agentId,
      status: 'active'
    }));
  }
  
  private async setupEventForwarding(
    openclawSessionKey: string,
    dashAgentId: string
  ): Promise<void> {
    // Subscribe to Dash events for this agent
    // Forward relevant events to OpenClaw
  }
}
```

---

## Component 2: OpenClaw-Dash Skill

**Purpose:** Provide OpenClaw-native commands for Dash

### File: `skills/dash-orchestration/SKILL.md`

```markdown
# Dash Orchestration Skill

## Description

Spawn and manage agent swarms using Dash from within OpenClaw.

## Capabilities

- Spawn parallel agent swarms
- Monitor agent progress
- Kill agents
- Stream results

## Usage

### Spawn a swarm

```
/dash spawn code-review --files "src/**/*.ts"
```

### Check status

```
/dash status swarm-abc123
```

### Kill an agent

```
/dash kill agent-xyz789
```

### View logs

```
/dash logs agent-xyz789 --follow
```

## Configuration

Requires:
- DASH_API_URL
- DASH_API_KEY

## Examples

### Code Review Swarm

Spawn 5 agents to review code in parallel:
```
/dash spawn code-review \
  --agents 5 \
  --strategy parallel \
  --files "src/**/*.ts"
```

### Security Audit

Run comprehensive security audit:
```
/dash spawn security-audit \
  --scope full \
  --tools dependency,static,secrets
```
```

### File: `skills/dash-orchestration/index.ts`

```typescript
import { Skill, CommandContext } from '@openclaw/core';
import { OpenClawAdapter } from '@/integrations/openclaw/adapter';

export class DashOrchestrationSkill implements Skill {
  name = 'dash-orchestration';
  description = 'Spawn and manage agent swarms with Dash';
  
  private adapter: OpenClawAdapter;
  
  constructor() {
    this.adapter = new OpenClawAdapter({
      dashApiUrl: process.env.DASH_API_URL!,
      dashApiKey: process.env.DASH_API_KEY!,
      openclawSessionKey: ''  // Set per-command
    });
  }
  
  commands = {
    spawn: this.spawn.bind(this),
    status: this.status.bind(this),
    kill: this.kill.bind(this),
    logs: this.logs.bind(this),
    list: this.list.bind(this)
  };
  
  private async spawn(context: CommandContext, args: string[]): Promise<void> {
    const parser = new ArgumentParser();
    parser.add_argument('--agents', { type: 'int', default: 1 });
    parser.add_argument('--strategy', { default: 'parallel' });
    parser.add_argument('type', { help: 'Swarm type' });
    
    const parsed = parser.parse_args(args);
    
    // Create swarm via adapter
    const result = await this.adapter.spawnAgent(context.sessionKey, {
      agentType: parsed.type,
      task: context.input,
      model: context.model
    });
    
    context.reply(`Spawned Dash agent: ${result.dashAgentId}`);
    context.reply(`Status: ${result.status}`);
    
    // Stream progress
    await this.streamProgress(context, result.dashAgentId);
  }
  
  private async status(context: CommandContext, args: string[]): Promise<void> {
    const status = await this.adapter.getStatus(context.sessionKey);
    context.reply(`Agent status: ${status.status}`);
    
    if (status.progress !== undefined) {
      context.reply(`Progress: ${status.progress}%`);
    }
  }
  
  private async kill(context: CommandContext, args: string[]): Promise<void> {
    await this.adapter.killAgent(context.sessionKey);
    context.reply('Agent killed');
  }
  
  private async logs(context: CommandContext, args: string[]): Promise<void> {
    // Stream logs from Dash to OpenClaw
  }
  
  private async list(context: CommandContext): Promise<void> {
    const agents = await this.adapter.listAgents();
    
    if (agents.length === 0) {
      context.reply('No active Dash agents');
      return;
    }
    
    context.reply('Active Dash agents:');
    for (const agent of agents) {
      context.reply(`- ${agent.dashAgentId} (${agent.status})`);
    }
  }
  
  private async streamProgress(context: CommandContext, agentId: string): Promise<void> {
    // Set up event stream from Dash
    // Forward to OpenClaw
  }
}
```

---

## Component 3: Event Bridge

**Purpose:** Real-time event streaming from Dash to OpenClaw

### File: `src/integrations/openclaw/event-bridge.ts`

```typescript
import { EventEmitter } from 'events';
import { EventBus } from '@/core/event-bus';

export interface EventBridgeConfig {
  dashEventBus: EventBus;
  openclawWebhookUrl: string;
  filter?: string[];  // Event types to forward
}

export class OpenClawEventBridge extends EventEmitter {
  private config: EventBridgeConfig;
  private subscriptions: Map<string, () => void>;
  
  constructor(config: EventBridgeConfig) {
    super();
    this.config = config;
    this.subscriptions = new Map();
  }
  
  async start(): Promise<void> {
    // Subscribe to all Dash events
    const unsubscribe = this.config.dashEventBus.subscribe('*', (event) => {
      this.handleDashEvent(event);
    });
    
    this.subscriptions.set('all', unsubscribe);
  }
  
  async stop(): Promise<void> {
    // Unsubscribe from all events
    for (const unsubscribe of this.subscriptions.values()) {
      unsubscribe();
    }
    this.subscriptions.clear();
  }
  
  private async handleDashEvent(event: any): Promise<void> {
    // Filter events if configured
    if (this.config.filter && !this.config.filter.includes(event.type)) {
      return;
    }
    
    // Transform Dash event to OpenClaw format
    const openclawEvent = this.transformEvent(event);
    
    // Forward to OpenClaw
    await this.forwardToOpenClaw(openclawEvent);
    
    // Emit locally
    this.emit('event', openclawEvent);
  }
  
  private transformEvent(dashEvent: any): any {
    return {
      source: 'dash',
      type: dashEvent.type,
      timestamp: dashEvent.timestamp,
      data: dashEvent.payload,
      metadata: {
        dashAgentId: dashEvent.agentId,
        dashSwarmId: dashEvent.swarmId
      }
    };
  }
  
  private async forwardToOpenClaw(event: any): Promise<void> {
    try {
      await fetch(this.config.openclawWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Dash-Event': 'true'
        },
        body: JSON.stringify(event)
      });
    } catch (error) {
      console.error('Failed to forward event to OpenClaw:', error);
    }
  }
  
  /**
   * Subscribe to specific event types
   */
  subscribeToAgent(agentId: string, callback: (event: any) => void): () => void {
    const handler = (event: any) => {
      if (event.metadata?.dashAgentId === agentId) {
        callback(event);
      }
    };
    
    this.on('event', handler);
    
    return () => {
      this.off('event', handler);
    };
  }
}
```

---

## Configuration

### Environment Variables

```bash
# Required
DASH_API_URL=http://localhost:7373
DASH_API_KEY=your-api-key

# OpenClaw Integration
OPENCLAW_DASH_ADAPTER_ENABLED=true
OPENCLAW_EVENT_WEBHOOK_URL=https://openclaw.example.com/webhooks/dash
OPENCLAW_EVENT_FILTER=agent.spawned,agent.completed,agent.failed
```

### OpenClaw Configuration

Add to OpenClaw's gateway config:

```yaml
skills:
  - name: dash-orchestration
    path: /path/to/dash/skills/dash-orchestration
    config:
      dash_api_url: http://dash:7373
      dash_api_key: ${DASH_API_KEY}
```

---

## Testing

### Unit Tests

```typescript
// tests/integrations/openclaw/adapter.test.ts
describe('OpenClawAdapter', () => {
  it('should spawn agent', async () => {
    const adapter = new OpenClawAdapter({...});
    const result = await adapter.spawnAgent('session-1', {
      agentType: 'code-review',
      task: 'Review PR #123'
    });
    
    expect(result.dashAgentId).toBeDefined();
    expect(result.status).toBe('spawning');
  });
});
```

### Integration Tests

```typescript
// tests/integrations/openclaw/integration.test.ts
describe('OpenClaw-Dash Integration', () => {
  it('should complete full flow', async () => {
    // Spawn agent from OpenClaw
    // Wait for completion
    // Verify results
  }, 30000);
});
```

---

## Success Criteria

- [ ] OpenClaw can spawn Dash agents
- [ ] OpenClaw can send messages to Dash agents
- [ ] OpenClaw can kill Dash agents
- [ ] Events stream from Dash to OpenClaw in real-time
- [ ] Skill commands work in OpenClaw
- [ ] Full integration test passes

---

## Deliverables

1. `src/integrations/openclaw/adapter.ts`
2. `src/integrations/openclaw/event-bridge.ts`
3. `skills/dash-orchestration/SKILL.md`
4. `skills/dash-orchestration/index.ts`
5. `tests/integrations/openclaw/*.test.ts`
6. `docs/OPENCLAW_INTEGRATION.md`

---

## Acceptance Test

```bash
# 1. Start Dash
npm run start

# 2. Configure OpenClaw with Dash skill
openclaw config set DASH_API_URL http://localhost:7373
openclaw config set DASH_API_KEY test-key

# 3. Spawn agent from OpenClaw
openclaw /dash spawn code-review --task "Review this code"

# 4. Verify agent spawned in Dash
swarmctl agent list

# 5. Watch events flow
# Events should appear in OpenClaw

# 6. Kill agent
openclaw /dash kill agent-xyz

# All steps should complete successfully
```
