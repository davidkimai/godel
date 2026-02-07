# SPEC: Godel Production Readiness - OpenClaw Integration

**Version:** 1.0  
**Date:** February 3, 2026  
**Status:** Ready for Implementation  
**Priority:** P0 - Critical  
**PRD Reference:** [PRD-002-openclaw-integration.md](../prds/PRD-002-openclaw-integration.md)

---

## Overview

Build seamless integration between Godel and OpenClaw, enabling OpenClaw to use Godel as its native orchestration platform.

**Goal:** OpenClaw users can spawn Godel agents and teams natively.

**PRD Success Criteria:**
1. ✅ OpenClaw spawns 100 Godel agents simultaneously without errors
2. ✅ Events from Godel agents appear in OpenClaw within 500ms
3. ✅ `/godel spawn` command works in OpenClaw
4. ✅ Full integration test suite passes
5. ✅ Production deployment to OpenClaw infrastructure successful

---

## Architecture

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│   OpenClaw  │ ───► │   Adapter    │ ───► │    Godel     │
│  (sessions) │      │  (Protocol   │      │   (teams)  │
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

**Purpose:** Translate OpenClaw protocol to Godel API

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
  private agentIdMap: Map<string, string>;  // OpenClaw session -> Godel agent
  
  constructor(config: OpenClawAdapterConfig) {
    this.config = config;
    this.agentIdMap = new Map();
  }
  
  /**
   * Spawn an agent in Godel from OpenClaw session
   */
  async spawnAgent(openclawSessionKey: string, options: {
    agentType: string;
    task: string;
    model?: string;
    timeout?: number;
  }): Promise<{ dashAgentId: string; status: string }> {
    // Create team for this agent
    const swarmResult = await swarmctl.createSwarm({
      name: `openclaw-${openclawSessionKey}`,
      type: options.agentType,
      config: {
        task: options.task,
        model: options.model || 'default',
        timeout: options.timeout || 300000
      }
    });
    
    // Spawn agent in team
    const agentResult = await swarmctl.spawnAgent({
      swarmId: swarmResult.id,
      type: options.agentType
    });
    
    // Map OpenClaw session to Godel agent
    this.agentIdMap.set(openclawSessionKey, agentResult.id);
    
    // Set up event forwarding
    await this.setupEventForwarding(openclawSessionKey, agentResult.id);
    
    return {
      dashAgentId: agentResult.id,
      status: agentResult.status
    };
  }
  
  /**
   * Send message to Godel agent from OpenClaw
   */
  async sendMessage(openclawSessionKey: string, message: string): Promise<void> {
    const dashAgentId = this.agentIdMap.get(openclawSessionKey);
    
    if (!dashAgentId) {
      throw new Error(`No Godel agent mapped for session ${openclawSessionKey}`);
    }
    
    await swarmctl.sendMessage({
      agentId: dashAgentId,
      message
    });
  }
  
  /**
   * Kill Godel agent from OpenClaw
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
   * Get status of Godel agent
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
    // Subscribe to Godel events for this agent
    // Forward relevant events to OpenClaw
  }
}
```

---

## Component 2: OpenClaw-Godel Skill

**Purpose:** Provide OpenClaw-native commands for Godel

### File: `skills/godel-orchestration/SKILL.md`

```markdown
# Godel Orchestration Skill

## Description

Spawn and manage agent teams using Godel from within OpenClaw.

## Capabilities

- Spawn parallel agent teams
- Monitor agent progress
- Kill agents
- Stream results

## Usage

### Spawn a team

```
/godel spawn code-review --files "src/**/*.ts"
```

### Check status

```
/godel status team-abc123
```

### Kill an agent

```
/godel kill agent-xyz789
```

### View logs

```
/godel logs agent-xyz789 --follow
```

## Configuration

Requires:
- DASH_API_URL
- DASH_API_KEY

## Examples

### Code Review Team

Spawn 5 agents to review code in parallel:
```
/godel spawn code-review \
  --agents 5 \
  --strategy parallel \
  --files "src/**/*.ts"
```

### Security Audit

Run comprehensive security audit:
```
/godel spawn security-audit \
  --scope full \
  --tools dependency,static,secrets
```
```

### File: `skills/godel-orchestration/index.ts`

```typescript
import { Skill, CommandContext } from '@openclaw/core';
import { OpenClawAdapter } from '@/integrations/openclaw/adapter';

export class DashOrchestrationSkill implements Skill {
  name = 'godel-orchestration';
  description = 'Spawn and manage agent teams with Godel';
  
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
    parser.add_argument('type', { help: 'Team type' });
    
    const parsed = parser.parse_args(args);
    
    // Create team via adapter
    const result = await this.adapter.spawnAgent(context.sessionKey, {
      agentType: parsed.type,
      task: context.input,
      model: context.model
    });
    
    context.reply(`Spawned Godel agent: ${result.dashAgentId}`);
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
    // Stream logs from Godel to OpenClaw
  }
  
  private async list(context: CommandContext): Promise<void> {
    const agents = await this.adapter.listAgents();
    
    if (agents.length === 0) {
      context.reply('No active Godel agents');
      return;
    }
    
    context.reply('Active Godel agents:');
    for (const agent of agents) {
      context.reply(`- ${agent.dashAgentId} (${agent.status})`);
    }
  }
  
  private async streamProgress(context: CommandContext, agentId: string): Promise<void> {
    // Set up event stream from Godel
    // Forward to OpenClaw
  }
}
```

---

## Component 3: Event Bridge

**Purpose:** Real-time event streaming from Godel to OpenClaw

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
    // Subscribe to all Godel events
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
    
    // Transform Godel event to OpenClaw format
    const openclawEvent = this.transformEvent(event);
    
    // Forward to OpenClaw
    await this.forwardToOpenClaw(openclawEvent);
    
    // Emit locally
    this.emit('event', openclawEvent);
  }
  
  private transformEvent(dashEvent: any): any {
    return {
      source: 'godel',
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
          'X-Godel-Event': 'true'
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
OPENCLAW_EVENT_WEBHOOK_URL=https://openclaw.example.com/webhooks/godel
OPENCLAW_EVENT_FILTER=agent.spawned,agent.completed,agent.failed
```

### OpenClaw Configuration

Add to OpenClaw's gateway config:

```yaml
skills:
  - name: godel-orchestration
    path: /path/to/godel/skills/godel-orchestration
    config:
      dash_api_url: http://godel:7373
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
describe('OpenClaw-Godel Integration', () => {
  it('should complete full flow', async () => {
    // Spawn agent from OpenClaw
    // Wait for completion
    // Verify results
  }, 30000);
});
```

---

## Success Criteria

- [ ] OpenClaw can spawn Godel agents
- [ ] OpenClaw can send messages to Godel agents
- [ ] OpenClaw can kill Godel agents
- [ ] Events stream from Godel to OpenClaw in real-time
- [ ] Skill commands work in OpenClaw
- [ ] Full integration test passes

---

## Deliverables

1. `src/integrations/openclaw/adapter.ts`
2. `src/integrations/openclaw/event-bridge.ts`
3. `skills/godel-orchestration/SKILL.md`
4. `skills/godel-orchestration/index.ts`
5. `tests/integrations/openclaw/*.test.ts`
6. `docs/OPENCLAW_INTEGRATION.md`

---

## Acceptance Test

```bash
# 1. Start Godel
npm run start

# 2. Configure OpenClaw with Godel skill
openclaw config set DASH_API_URL http://localhost:7373
openclaw config set DASH_API_KEY test-key

# 3. Spawn agent from OpenClaw
openclaw /godel spawn code-review --task "Review this code"

# 4. Verify agent spawned in Godel
swarmctl agent list

# 5. Watch events flow
# Events should appear in OpenClaw

# 6. Kill agent
openclaw /godel kill agent-xyz

# All steps should complete successfully
```
