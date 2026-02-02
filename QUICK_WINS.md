# Dash v2.0 Quick Wins

**10 Things to Do This Week to Maximize Success**

> "Don't let perfect be the enemy of good. Ship, learn, iterate."

---

## Day 1: Monday - Critical Foundation

### 1. Replace MockOpenClawClient with Real HTTP Client
**Owner:** @friday  
**Effort:** 3 hours  
**Impact:** CRITICAL (unblocks everything)

```typescript
// src/core/openclaw.ts - Add real HTTP client
import axios from 'axios';

export class HttpOpenClawClient implements OpenClawClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  async sessionsSpawn(options: SessionSpawnOptions): Promise<{sessionId: string}> {
    const response = await axios.post(
      `${this.baseUrl}/api/v1/sessions`,
      {
        task: options.task,
        model: options.model || 'kimi-k2.5',
        max_tokens: options.maxTokens,
      },
      {
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
        timeout: 30000,
      }
    );
    return { sessionId: response.data.session_id };
  }

  // ... implement other methods
}
```

**Verify:**
```bash
cd /Users/jasontang/clawd/projects/dash
npm run build
node dist/index.js openclaw status
# Should show: "OpenClaw: Connected (HTTP)"
```

---

### 2. Add SQLite Persistence Layer
**Owner:** @friday  
**Effort:** 4 hours  
**Impact:** HIGH (data survives restart)

```typescript
// src/storage/sqlite.ts
import Database from 'better-sqlite3';

export class SQLiteStorage {
  private db: Database.Database;

  constructor(dbPath: string = 'dash.db') {
    this.db = new Database(dbPath);
    this.initTables();
  }

  private initTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        model TEXT NOT NULL,
        task TEXT NOT NULL,
        swarm_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        budget_limit REAL,
        metadata TEXT
      );
      
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        payload TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
      CREATE INDEX IF NOT EXISTS idx_events_entity ON events(entity_type, entity_id);
    `);
  }
}
```

**Verify:**
```bash
ls -la dash.db  # File should exist and grow
```

---

## Day 2: Tuesday - Metrics & Observability

### 3. Implement Metrics Collection
**Owner:** @friday  
**Effort:** 2 hours  
**Impact:** HIGH (enables data-driven decisions)

```typescript
// src/metrics/collector.ts
export class MetricsCollector {
  private metrics = {
    spawnAttempts: 0,
    spawnSuccesses: 0,
    completions: 0,
    failures: 0,
    totalCost: 0,
    totalTokens: 0,
    operationLatencies: new Map<string, number[]>(),
  };

  recordSpawn(success: boolean, latencyMs: number): void {
    this.metrics.spawnAttempts++;
    if (success) this.metrics.spawnSuccesses++;
    this.recordLatency('spawn', latencyMs);
  }

  recordCompletion(cost: number, tokens: number): void {
    this.metrics.completions++;
    this.metrics.totalCost += cost;
    this.metrics.totalTokens += tokens;
  }

  recordLatency(operation: string, ms: number): void {
    if (!this.metrics.operationLatencies.has(operation)) {
      this.metrics.operationLatencies.set(operation, []);
    }
    this.metrics.operationLatencies.get(operation)!.push(ms);
  }

  getReport(): MetricsReport {
    return {
      spawnSuccessRate: this.metrics.spawnAttempts > 0 
        ? this.metrics.spawnSuccesses / this.metrics.spawnAttempts 
        : 1,
      totalCost: this.metrics.totalCost,
      avgLatency: this.calculateAvgLatencies(),
    };
  }
}
```

**Add command:**
```bash
dash metrics report
# Shows:
# Spawn Success Rate: 99.2%
# Total Cost: $12.45
# Avg Spawn Latency: 234ms
```

---

### 4. Create Load Testing Suite
**Owner:** @shuri  
**Effort:** 3 hours  
**Impact:** HIGH (finds race conditions early)

```typescript
// tests/load/swarm-load.test.ts
import { SwarmManager } from '../../src/core/swarm';

describe('Load Tests', () => {
  it('should spawn 100 agents in under 30 seconds', async () => {
    const start = Date.now();
    const swarm = await swarmManager.create({
      name: 'load-test-100',
      initialAgents: 100,
      maxAgents: 200,
      strategy: 'parallel',
      task: 'Simple calculation task',
    });
    
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(30000);
    expect(swarm.agents).toHaveLength(100);
  });

  it('should handle rapid scale up/down', async () => {
    const swarm = await swarmManager.create({
      name: 'scale-test',
      initialAgents: 10,
      maxAgents: 100,
      strategy: 'parallel',
      task: 'Test task',
    });
    
    // Scale up
    await swarmManager.scale(swarm.id, 50);
    expect(swarmManager.getSwarm(swarm.id)!.agents).toHaveLength(50);
    
    // Scale down
    await swarmManager.scale(swarm.id, 10);
    expect(swarmManager.getSwarm(swarm.id)!.agents).toHaveLength(10);
  });
});
```

**Run:**
```bash
npm run test:load
```

---

## Day 3: Wednesday - Developer Experience

### 5. Add `dash init` Onboarding Command
**Owner:** @wong  
**Effort:** 3 hours  
**Impact:** HIGH (reduces time to first swarm)

```typescript
// src/cli/commands/init.ts
export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Initialize Dash in your project')
    .option('--force', 'Overwrite existing config')
    .action(async (options) => {
      console.log('🚀 Welcome to Dash!\n');
      
      // Check prerequisites
      console.log('Checking prerequisites...');
      const nodeVersion = process.version;
      if (!nodeVersion.startsWith('v20') && !nodeVersion.startsWith('v21')) {
        console.warn('⚠️  Node.js 20+ recommended');
      }
      
      // Create config
      const config = {
        version: '2.0.0',
        openclaw: {
          baseUrl: 'http://localhost:3000',
          apiKey: process.env.OPENCLAW_API_KEY || '',
        },
        defaults: {
          model: 'kimi-k2.5',
          maxTokens: 100000,
          budgetLimit: 5.00,
        },
      };
      
      writeFileSync('dash.config.json', JSON.stringify(config, null, 2));
      
      console.log('\n✅ Created dash.config.json');
      console.log('\nNext steps:');
      console.log('  1. Set OPENCLAW_API_KEY environment variable');
      console.log('  2. Run: dash swarm create --name "My First Swarm" --task "Hello World"');
      console.log('  3. Run: dash dashboard');
    });
}
```

---

### 6. Create 3 Working Examples
**Owner:** @loki  
**Effort:** 4 hours  
**Impact:** HIGH (shows what's possible)

```bash
# Create examples directory
mkdir -p examples/{01-hello-world,02-file-processor,03-code-reviewer}
```

**Example 1: Hello World** (`examples/01-hello-world/README.md`)
```markdown
# Hello World Swarm

```bash
# Create a simple swarm that says hello
dash swarm create \
  --name "hello-world" \
  --task "Generate a creative greeting message" \
  --agents 3 \
  --strategy parallel

# Check results
dash agents list --swarm hello-world
```

**Expected output:** 3 creative greeting messages
```

**Example 2: File Processor** (`examples/02-file-processor/`)
```typescript
// pipeline.js - Process files through stages
const { swarmManager } = require('dash-agent');

async function processFiles(files) {
  const swarm = await swarmManager.create({
    name: 'file-processor',
    initialAgents: 4,
    strategy: 'pipeline',
    task: `Process ${files.length} files: extract, transform, validate`,
  });
  
  return swarm;
}

module.exports = { processFiles };
```

**Example 3: Code Reviewer** (`examples/03-code-reviewer/`)
```bash
#!/bin/bash
# review.sh - Review PR with multiple agents

PR_URL=$1

dash swarm create \
  --name "pr-review-$(date +%s)" \
  --task "Review PR at $PR_URL: check style, logic, tests, security" \
  --agents 4 \
  --strategy parallel

echo "Review swarm created. Run 'dash dashboard' to monitor."
```

---

## Day 4: Thursday - Safety & Reliability

### 7. Add Budget Emergency Brakes
**Owner:** @jarvis  
**Effort:** 2 hours  
**Impact:** CRITICAL (prevents cost overruns)

```typescript
// src/safety/emergency.ts
export class BudgetEmergencyBrake {
  private static OVERSPEND_THRESHOLD = 0.01; // $0.01 overspend allowed
  
  static async checkAndEnforce(swarm: Swarm): Promise<void> {
    if (swarm.budget.remaining <= 0) {
      console.error(`🚨 BUDGET EXHAUSTED for swarm ${swarm.id}`);
      
      // Immediate pause
      await swarmManager.pauseSwarm(swarm.id, 'budget_exhausted');
      
      // Check for overspend
      if (swarm.budget.remaining < -this.OVERSPEND_THRESHOLD) {
        console.error(`💥 EMERGENCY: Budget overspend detected!`);
        console.error(`   Allocated: $${swarm.budget.allocated}`);
        console.error(`   Consumed: $${swarm.budget.consumed}`);
        console.error(`   Overspend: $${Math.abs(swarm.budget.remaining)}`);
        
        // Force kill all agents
        await swarmManager.destroy(swarm.id, true);
        
        // Send alert (could be Slack, email, etc.)
        await this.sendBudgetAlert(swarm);
      }
    }
  }
  
  private static async sendBudgetAlert(swarm: Swarm): Promise<void> {
    // Implementation for alert
  }
}
```

---

### 8. Implement CLI Doctor Command
**Owner:** @wong  
**Effort:** 2 hours  
**Impact:** MEDIUM (improves debugging)

```typescript
// src/cli/commands/doctor.ts
export function registerDoctorCommand(program: Command): void {
  program
    .command('doctor')
    .description('Check Dash installation and configuration')
    .action(async () => {
      console.log('🔍 Running Dash diagnostics...\n');
      
      const checks = [
        checkNodeVersion(),
        checkConfigFile(),
        checkOpenClawConnection(),
        checkSQLiteWritable(),
        checkDiskSpace(),
      ];
      
      const results = await Promise.all(checks);
      
      let passed = 0;
      let failed = 0;
      
      for (const result of results) {
        if (result.ok) {
          console.log(`  ✅ ${result.message}`);
          passed++;
        } else {
          console.log(`  ❌ ${result.message}`);
          if (result.fix) {
            console.log(`     💡 Fix: ${result.fix}`);
          }
          failed++;
        }
      }
      
      console.log(`\n${passed} passed, ${failed} failed`);
      
      if (failed > 0) {
        console.log('\nRun with --fix to attempt automatic fixes');
        process.exit(1);
      }
    });
}

async function checkOpenClawConnection(): Promise<CheckResult> {
  try {
    const client = getOpenClawClient();
    await client.healthCheck();
    return { ok: true, message: 'OpenClaw connection OK' };
  } catch (error) {
    return {
      ok: false,
      message: 'OpenClaw connection failed',
      fix: 'Check OPENCLAW_API_KEY and base URL in dash.config.json',
    };
  }
}
```

---

## Day 5: Friday - Polish & Launch Prep

### 9. Add Progress Indicators to Long Operations
**Owner:** @wanda  
**Effort:** 2 hours  
**Impact:** MEDIUM (better UX)

```typescript
// src/utils/progress.ts
export class ProgressBar {
  private total: number;
  private current = 0;
  private label: string;
  
  constructor(label: string, total: number) {
    this.label = label;
    this.total = total;
    this.render();
  }
  
  update(current: number): void {
    this.current = current;
    this.render();
  }
  
  increment(): void {
    this.current++;
    this.render();
  }
  
  private render(): void {
    const percentage = Math.floor((this.current / this.total) * 100);
    const filled = Math.floor((this.current / this.total) * 20);
    const bar = '█'.repeat(filled) + '░'.repeat(20 - filled);
    
    process.stdout.write(`\r${this.label} [${bar}] ${percentage}% (${this.current}/${this.total})`);
    
    if (this.current >= this.total) {
      process.stdout.write('\n');
    }
  }
  
  complete(): void {
    this.current = this.total;
    this.render();
  }
}

// Usage in swarm.ts
async create(config: SwarmConfig): Promise<Swarm> {
  const progress = new ProgressBar('Creating swarm', config.initialAgents);
  
  for (let i = 0; i < config.initialAgents; i++) {
    await this.spawnAgentForSwarm(swarm);
    progress.increment();
  }
  
  progress.complete();
  return swarm;
}
```

---

### 10. Write Quick-Start Guide
**Owner:** @loki  
**Effort:** 3 hours  
**Impact:** HIGH (onboarding)

```markdown
# Dash Quick Start Guide

## 5-Minute Setup

```bash
# 1. Install
npm install -g dash-agent

# 2. Initialize
dash init

# 3. Set API key
export OPENCLAW_API_KEY="your-key-here"

# 4. Create your first swarm
dash swarm create --name "my-first-swarm" \
  --task "Say hello world creatively" \
  --agents 3

# 5. Watch it work
dash dashboard
```

## Common Tasks

### Process a folder of files
```bash
dash swarm create --name "file-processor" \
  --task "Process all files in ./data" \
  --strategy pipeline \
  --agents 5
```

### Review code
```bash
dash swarm create --name "code-review" \
  --task "Review ./src for bugs and style issues" \
  --agents 4 \
  --budget 2.00
```

## Next Steps

- Read the [full documentation](docs/README.md)
- Try the [examples](examples/)
- Join our [Discord](https://discord.gg/dash)
```

---

## Quick Win Verification Checklist

After completing each task, verify:

- [ ] **1. OpenClaw HTTP Client:** `dash openclaw status` shows "Connected"
- [ ] **2. SQLite Persistence:** `dash.db` file exists and survives restart
- [ ] **3. Metrics:** `dash metrics report` shows real data
- [ ] **4. Load Tests:** `npm run test:load` passes 100 agent test
- [ ] **5. Init Command:** `dash init` creates valid config
- [ ] **6. Examples:** All 3 examples run without errors
- [ ] **7. Budget Brakes:** Budget exhaustion triggers immediate pause
- [ ] **8. Doctor:** `dash doctor` passes all checks
- [ ] **9. Progress Bars:** Long operations show visual progress
- [ ] **10. Quick-Start:** New user can follow guide in <5 minutes

---

## Success Metrics After Week 1

| Metric | Target | How to Measure |
|--------|--------|----------------|
| OpenClaw connection | 100% | `dash openclaw status` |
| SQLite persistence | 100% | Restart, check `dash agents list` |
| Load test pass rate | ≥95% | `npm run test:load` |
| Time to first swarm | ≤5 min | New user test |
| Budget safety | 100% | No overspend in 1000 ops |
| Example success | 100% | All 3 examples run |

---

## Next Week Preview

After these quick wins:
- Real-time TUI dashboard (ink.js)
- 7 more examples
- Auto-complete
- GitHub Actions integration
- Performance optimizations

**Questions?** Tag @jarvis in Mission Control.
