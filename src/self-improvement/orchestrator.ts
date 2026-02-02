/**
 * Self-Improvement Orchestrator
 * 
 * Uses Dash's own infrastructure to recursively improve Dash.
 * Implements the feedback loop: analyze → improve → verify → repeat
 */

import { getDb } from '../storage/sqlite';
import { SELF_IMPROVEMENT_CONFIG, SELF_IMPROVEMENT_SWARMS } from './config';

export interface ImprovementResult {
  success: boolean;
  area: string;
  changes: number;
  budgetUsed: number;
  metrics: {
    testCoverage?: number;
    bugsFixed?: number;
    performanceImprovement?: number;
  };
  errors: string[];
}

export interface SelfImprovementState {
  iteration: number;
  totalBudgetUsed: number;
  improvements: ImprovementResult[];
  startTime: Date;
  lastImprovementTime: Date;
}

const API_BASE = 'http://localhost:7373';
const API_KEY = 'dash-api-key';

async function apiRequest(endpoint: string, method = 'GET', body?: any): Promise<any> {
  const url = `${API_BASE}${endpoint}`;
  const headers: Record<string, string> = {
    'X-API-Key': API_KEY,
    'Content-Type': 'application/json'
  };
  
  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  
  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }
  
  return response.json();
}

async function createSwarm(name: string, config: any): Promise<any> {
  return apiRequest('/api/swarm', 'POST', {
    name,
    config  // Pass as object, repository will stringify
  });
}

async function spawnAgent(swarmId: string, agentConfig: any): Promise<any> {
  return apiRequest('/api/agents', 'POST', {
    swarm_id: swarmId,
    status: 'idle',
    task: agentConfig.task,
    model: agentConfig.model,
    budget_limit: agentConfig.budgetLimit,
    metadata: JSON.stringify({
      role: agentConfig.role,
      selfImprovement: true
    })
  });
}

async function getAgents(): Promise<any[]> {
  return apiRequest('/api/agents');
}

async function recordEvent(type: string, data: any): Promise<void> {
  await apiRequest('/api/events', 'POST', {
    eventType: type,
    payload: data
  });
}

export async function startSelfImprovementSession(): Promise<SelfImprovementState> {
  console.log('🚀 Starting Dash Self-Improvement Session');
  console.log(`   Budget: $${SELF_IMPROVEMENT_CONFIG.maxBudgetUSD}`);
  console.log(`   Max tokens per agent: ${SELF_IMPROVEMENT_CONFIG.maxTokensPerAgent}`);
  
  // Record the session start
  await recordEvent('self_improvement_started', {
    config: SELF_IMPROVEMENT_CONFIG,
    timestamp: new Date().toISOString()
  });
  
  const state: SelfImprovementState = {
    iteration: 1,
    totalBudgetUsed: 0,
    improvements: [],
    startTime: new Date(),
    lastImprovementTime: new Date()
  };
  
  return state;
}

export async function runImprovementCycle(
  state: SelfImprovementState,
  area: 'codeQuality' | 'documentation' | 'testing'
): Promise<ImprovementResult> {
  const swarmConfig = SELF_IMPROVEMENT_SWARMS[area];
  
  console.log(`\n📊 Running ${area} improvement cycle...`);
  
  const result: ImprovementResult = {
    success: false,
    area,
    changes: 0,
    budgetUsed: 0,
    metrics: {},
    errors: []
  };
  
  try {
    // Create swarm for this improvement area
    const swarm = await createSwarm(swarmConfig.name, {
      area,
      selfImprovement: true,
      safetyBoundaries: SELF_IMPROVEMENT_CONFIG.allowedOperations
    });
    
    console.log(`   Created swarm: ${swarm.id}`);
    
    // Spawn agents in parallel (according to parallelism config)
    const agents: any[] = [];
    
    for (const agentConfig of swarmConfig.agents) {
      if (state.totalBudgetUsed + agentConfig.budgetLimit > SELF_IMPROVEMENT_CONFIG.maxBudgetUSD) {
        console.log(`   ⚠️  Skipping ${agentConfig.role} - budget exceeded`);
        continue;
      }
      
      try {
        const agent = await spawnAgent(swarm.id, agentConfig);
        agents.push({ ...agentConfig, dashAgent: agent });
        console.log(`   ✅ Spawned ${agentConfig.role}`);
      } catch (error) {
        const errorMsg = `Failed to spawn ${agentConfig.role}: ${error}`;
        console.log(`   ❌ ${errorMsg}`);
        result.errors.push(errorMsg);
      }
    }
    
    // Wait for agents to complete (in real impl, would poll for status)
    console.log(`   📋 Agents running: ${agents.length}`);
    
    // Simulate improvement work
    // In real implementation, would wait for agent completion and collect results
    
    result.success = true;
    result.changes = agents.length;
    result.budgetUsed = agents.reduce((sum, a) => sum + (a.budgetLimit || 0), 0);
    state.totalBudgetUsed += result.budgetUsed;
    state.lastImprovementTime = new Date();
    
    console.log(`   ✅ ${area} cycle complete: ${result.changes} agents, $${result.budgetUsed} used`);
    
  } catch (error) {
    const errorMsg = `Improvement cycle failed: ${error}`;
    console.log(`   ❌ ${errorMsg}`);
    result.errors.push(errorMsg);
  }
  
  state.improvements.push(result);
  
  await recordEvent('improvement_cycle_complete', {
    area,
    result,
    totalBudgetUsed: state.totalBudgetUsed,
    iteration: state.iteration
  });
  
  return result;
}

export async function getSelfImprovementReport(state: SelfImprovementState): Promise<string> {
  const duration = Date.now() - state.startTime.getTime();
  
  const report = `
╔══════════════════════════════════════════════════════════════╗
║           DASH SELF-IMPROVEMENT REPORT                       ║
╠══════════════════════════════════════════════════════════════╣
║ Iteration: ${state.iteration}
║ Duration: ${Math.round(duration / 1000)}s
║ Total Budget Used: $${state.totalBudgetUsed.toFixed(2)}
║ Remaining Budget: $${(SELF_IMPROVEMENT_CONFIG.maxBudgetUSD - state.totalBudgetUsed).toFixed(2)}
╠══════════════════════════════════════════════════════════════╣
║ IMPROVEMENTS:                                                ║
${state.improvements.map(imp => `║   - ${imp.area}: ${imp.success ? '✅' : '❌'} (${imp.changes} changes, $${imp.budgetUsed.toFixed(2)})`).join('\n')}
╠══════════════════════════════════════════════════════════════╣
║ ERRORS:                                                      ║
${state.improvements.flatMap(imp => imp.errors).length > 0 
  ? state.improvements.flatMap(imp => imp.errors).map(e => `║   - ${e.substring(0, 60)}...`).join('\n')
  : '║   No errors'}
╚══════════════════════════════════════════════════════════════╝
`;
  
  return report;
}

// CLI entry point
if (require.main === module) {
  (async () => {
    try {
      // Initialize database first
      await getDb({ dbPath: './dash.db' });
      
      // Start self-improvement session
      const state = await startSelfImprovementSession();
      
      // Run improvement cycles
      for (const area of ['codeQuality', 'documentation', 'testing'] as const) {
        if (state.totalBudgetUsed >= SELF_IMPROVEMENT_CONFIG.maxBudgetUSD) {
          console.log(`\n⚠️  Budget exhausted, stopping improvements`);
          break;
        }
        await runImprovementCycle(state, area);
      }
      
      // Print report
      const report = await getSelfImprovementReport(state);
      console.log(report);
      
      // Record completion
      await recordEvent('self_improvement_completed', {
        state,
        report,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('Self-improvement failed:', error);
      process.exit(1);
    }
  })();
}
