# Pi Brain Transplant Plan
## Phase 1: Replace Custom Agent Runtime with Pi-Mono

**Objective:** Complete the migration from custom AgentExecutor to Pi-Mono as the standard execution unit.

**Timeline:** Week 1 (5 days)

**Success Metric:**
```bash
godel agent spawn --runtime pi --model claude-sonnet-4-5
# Agent spawns successfully
# Executes "echo 'Hello World' > test.txt"
# File created as expected
```

---

## Current State Analysis

### What Exists

1. **Pi Integration Module** (`src/integrations/pi/`)
   - `client.ts` - PiClient for RPC communication
   - `registry.ts` - PiRegistry for instance management
   - `session.ts` - PiSessionManager for session handling
   - `types.ts` - Type definitions
   - ✅ Well-structured but may have stub implementations

2. **Legacy Agent System** (`src/agent/manager.ts`)
   - Custom agent lifecycle management
   - Direct spawning logic
   - ⚠️ Needs to be replaced/wrapped

3. **Runtime Abstraction** (Need to verify)
   - May exist in `src/core/` or `src/runtime/`
   - Need unified interface for all runtimes

### What's Missing

1. **Pi Runtime Adapter** - Wrapper that implements AgentRuntime interface
2. **Runtime Selection** - CLI flag `--runtime pi|native|docker`
3. **Migration Path** - Backward compatibility for existing agents
4. **Configuration** - Pi-specific config (providers, models, etc.)

---

## Implementation Plan

### Day 1: Audit & Interface Design

**Tasks:**
1. Audit current Pi integration (`src/integrations/pi/`)
   - What's implemented?
   - What's stubbed?
   - What's missing?

2. Design Runtime Interface
   ```typescript
   interface AgentRuntime {
     spawn(config: SpawnConfig): Promise<Agent>;
     kill(agentId: string): Promise<void>;
     exec(agentId: string, command: string): Promise<ExecResult>;
     status(agentId: string): Promise<AgentStatus>;
   }
   ```

3. Document findings in `PI_INTEGRATION_STATUS.md`

**Deliverable:** Interface specification + gap analysis

---

### Day 2: Pi Runtime Implementation

**Tasks:**
1. Create `src/runtime/pi.ts`
   - Implement AgentRuntime interface
   - Wrap PiClient from integrations

2. Key Methods:
   ```typescript
   class PiRuntime implements AgentRuntime {
     async spawn(config: SpawnConfig): Promise<Agent> {
       // Use PiClient to spawn
       // Return unified Agent interface
     }
     
     async exec(agentId: string, task: string): Promise<ExecResult> {
       // Send task to Pi instance
       // Stream results back
     }
   }
   ```

3. Error handling and retry logic

**Deliverable:** Working PiRuntime class (unit tested)

---

### Day 3: Runtime Registry & Selection

**Tasks:**
1. Create `src/runtime/registry.ts`
   - Registry pattern for runtimes
   - Runtime selection logic

2. Update CLI (`src/cli/commands/agent.ts`)
   ```bash
   godel agent spawn --runtime pi --model claude-sonnet-4-5
   godel agent spawn --runtime native  # Legacy
   ```

3. Configuration loading
   - `.godel/config.yaml` runtime section
   - Environment variables

**Deliverable:** CLI can spawn Pi agents

---

### Day 4: Migration & Testing

**Tasks:**
1. Create migration guide
   - Old agents → New runtime
   - Config changes

2. Write integration tests
   ```typescript
   describe('PiRuntime', () => {
     it('should spawn Pi agent', async () => {
       const agent = await runtime.spawn({ model: 'claude-sonnet-4-5' });
       expect(agent.status).toBe('running');
     });
     
     it('should execute commands', async () => {
       const result = await runtime.exec(agentId, 'echo hello');
       expect(result.stdout).toBe('hello');
     });
   });
   ```

3. Fix any failing tests

**Deliverable:** All tests passing

---

### Day 5: Validation & Documentation

**Tasks:**
1. End-to-end validation
   ```bash
   # Full workflow test
   godel agent spawn --runtime pi --name test-agent
   godel agent exec test-agent --task "echo 'Hello World' > /tmp/test.txt"
   cat /tmp/test.txt  # Should show "Hello World"
   godel agent kill test-agent
   ```

2. Update documentation
   - README.md - Pi runtime section
   - USAGE_GUIDE.md - Pi examples
   - Architecture diagrams

3. Create demo video/script
   - Spawn 5 Pi agents
   - Execute parallel tasks
   - Show results

**Deliverable:** Demo ready, docs updated

---

## Technical Specifications

### Runtime Interface

```typescript
// src/runtime/types.ts

export interface AgentRuntime {
  /** Runtime identifier */
  readonly id: string;
  
  /** Spawn a new agent */
  spawn(config: SpawnConfig): Promise<Agent>;
  
  /** Kill an agent */
  kill(agentId: string): Promise<void>;
  
  /** Execute a command/task */
  exec(agentId: string, command: string): Promise<ExecResult>;
  
  /** Get agent status */
  status(agentId: string): Promise<AgentStatus>;
  
  /** List running agents */
  list(): Promise<Agent[]>;
}

export interface SpawnConfig {
  /** Agent name/label */
  name?: string;
  
  /** AI model to use */
  model?: string;
  
  /** Provider (anthropic, openai, etc.) */
  provider?: string;
  
  /** Working directory */
  workdir?: string;
  
  /** Environment variables */
  env?: Record<string, string>;
  
  /** Resource limits */
  resources?: ResourceLimits;
}

export interface Agent {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'error' | 'stopped';
  runtime: string;
  model: string;
  pid?: number;
  createdAt: Date;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number;
}
```

### Pi Runtime Implementation

```typescript
// src/runtime/pi.ts

import { PiClient } from '../integrations/pi';
import { AgentRuntime, SpawnConfig, Agent, ExecResult } from './types';

export class PiRuntime implements AgentRuntime {
  readonly id = 'pi';
  readonly name = 'Pi Coding Agent';
  
  private client: PiClient;
  private agents: Map<string, Agent> = new Map();
  
  constructor(config?: PiRuntimeConfig) {
    this.client = new PiClient(config?.piConfig);
  }
  
  async spawn(config: SpawnConfig): Promise<Agent> {
    // Spawn Pi instance via PiClient
    const piSession = await this.client.spawn({
      model: config.model || 'claude-sonnet-4-5',
      workdir: config.workdir,
      env: config.env,
    });
    
    const agent: Agent = {
      id: `pi-${piSession.id}`,
      name: config.name || `pi-agent-${Date.now()}`,
      status: 'running',
      runtime: this.id,
      model: config.model || 'claude-sonnet-4-5',
      pid: piSession.pid,
      createdAt: new Date(),
    };
    
    this.agents.set(agent.id, agent);
    return agent;
  }
  
  async exec(agentId: string, command: string): Promise<ExecResult> {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`Agent ${agentId} not found`);
    
    // Execute via PiClient RPC
    const result = await this.client.exec(agentId, command);
    
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      duration: result.duration,
    };
  }
  
  async kill(agentId: string): Promise<void> {
    await this.client.kill(agentId);
    this.agents.delete(agentId);
  }
  
  async status(agentId: string): Promise<AgentStatus> {
    return this.client.status(agentId);
  }
  
  async list(): Promise<Agent[]> {
    return Array.from(this.agents.values());
  }
}
```

### Runtime Registry

```typescript
// src/runtime/registry.ts

import { AgentRuntime } from './types';
import { PiRuntime } from './pi';
import { NativeRuntime } from './native';

export class RuntimeRegistry {
  private runtimes: Map<string, AgentRuntime> = new Map();
  
  constructor() {
    // Register built-in runtimes
    this.register(new PiRuntime());
    this.register(new NativeRuntime());
  }
  
  register(runtime: AgentRuntime): void {
    this.runtimes.set(runtime.id, runtime);
  }
  
  get(id: string): AgentRuntime {
    const runtime = this.runtimes.get(id);
    if (!runtime) throw new Error(`Runtime ${id} not found`);
    return runtime;
  }
  
  list(): AgentRuntime[] {
    return Array.from(this.runtimes.values());
  }
  
  getDefault(): AgentRuntime {
    // Check config for default, fallback to pi
    return this.get('pi');
  }
}

// Singleton
let globalRegistry: RuntimeRegistry | null = null;

export function getRuntimeRegistry(): RuntimeRegistry {
  if (!globalRegistry) {
    globalRegistry = new RuntimeRegistry();
  }
  return globalRegistry;
}
```

---

## CLI Integration

### Updated Commands

```bash
# Spawn with specific runtime
godel agent spawn --runtime pi --model claude-sonnet-4-5
godel agent spawn --runtime native  # Legacy

# List shows runtime
godel agent list
# ID          Name          Runtime    Status    Model
# pi-abc123   pi-agent-1    pi         running   claude-sonnet-4-5
# native-xyz  legacy-agent  native     running   gpt-4

# Exec works regardless of runtime
godel agent exec pi-abc123 --task "echo hello"
```

### Implementation

```typescript
// src/cli/commands/agent.ts

agentCommand
  .command('spawn')
  .option('-r, --runtime <runtime>', 'Runtime (pi|native)', 'pi')
  .option('-m, --model <model>', 'AI model')
  .action(async (options) => {
    const registry = getRuntimeRegistry();
    const runtime = registry.get(options.runtime);
    
    const agent = await runtime.spawn({
      model: options.model,
      name: options.name,
    });
    
    logger.info(`Spawned ${runtime.name} agent: ${agent.id}`);
  });
```

---

## Testing Strategy

### Unit Tests

```typescript
// tests/runtime/pi.test.ts

describe('PiRuntime', () => {
  let runtime: PiRuntime;
  
  beforeEach(() => {
    runtime = new PiRuntime({
      piConfig: { /* test config */ }
    });
  });
  
  describe('spawn', () => {
    it('should spawn Pi agent', async () => {
      const agent = await runtime.spawn({
        model: 'claude-sonnet-4-5',
      });
      
      expect(agent.id).toMatch(/^pi-/);
      expect(agent.runtime).toBe('pi');
      expect(agent.status).toBe('running');
    });
  });
  
  describe('exec', () => {
    it('should execute command', async () => {
      const agent = await runtime.spawn({});
      const result = await runtime.exec(agent.id, 'echo hello');
      
      expect(result.stdout).toBe('hello');
      expect(result.exitCode).toBe(0);
    });
  });
});
```

### Integration Tests

```typescript
// tests/runtime/integration.test.ts

describe('Runtime Integration', () => {
  it('should spawn and exec Pi agent end-to-end', async () => {
    const registry = getRuntimeRegistry();
    const pi = registry.get('pi');
    
    // Spawn
    const agent = await pi.spawn({
      model: 'claude-sonnet-4-5',
      name: 'test-agent',
    });
    
    // Execute
    const result = await pi.exec(agent.id, 'echo "Hello World"');
    expect(result.stdout).toContain('Hello World');
    
    // Cleanup
    await pi.kill(agent.id);
  });
});
```

---

## Migration Path

### For Existing Users

1. **Automatic Migration**
   - Existing agents continue working (native runtime)
   - New agents default to Pi runtime

2. **Configuration**
   ```yaml
   # .godel/config.yaml
   runtime:
     default: pi
     pi:
       providers:
         - anthropic
         - openai
       defaultModel: claude-sonnet-4-5
   ```

3. **Opt-in to Pi**
   ```bash
   # Existing agents stay native
   godel agent migrate <agent-id> --to pi
   ```

---

## Success Criteria Checklist

- [ ] PiRuntime implements AgentRuntime interface
- [ ] RuntimeRegistry manages multiple runtimes
- [ ] CLI supports `--runtime pi` flag
- [ ] Can spawn Pi agent successfully
- [ ] Can execute commands in Pi agent
- [ ] Can kill Pi agent cleanly
- [ ] All unit tests passing
- [ ] Integration test e2e passing
- [ ] Documentation updated
- [ ] Demo script working

---

## Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| PiClient incomplete | High | Audit first, stub what's missing |
| Breaking changes | Medium | Keep native runtime, gradual migration |
| Performance regression | Medium | Benchmark before/after |
| Configuration complexity | Low | Sensible defaults, clear docs |

---

## Post-Implementation

After Pi Brain Transplant is complete:

1. **Update Federation Engine** - Route to Pi instances
2. **Implement Budget Controller** - Per-intent cost tracking
3. **Godel Loop** - Self-orchestration validation

---

**Owner:** Core Team  
**Reviewers:** Architecture Team  
**Status:** READY FOR IMPLEMENTATION
