/**
 * Self-Improvement Orchestrator
 * 
 * Uses Dash's own infrastructure to recursively improve Dash.
 * Implements the feedback loop: analyze → improve → verify → repeat
 * 
 * INTEGRATION: OpenClaw Budget Tracking (Phase 2C)
 * - Tracks costs across OpenClaw agents via sessions_history
 * - Enforces per-agent and per-swarm budget limits
 * - Automatically kills agents when budgets are exhausted
 * 
 * INTEGRATION: Learning Loop (Phase 4B)
 * - Uses learning data for strategy selection
 * - A/B tests improvement approaches
 * - Tracks improvement effectiveness over time
 */

import { getDb, SQLiteStorage } from '../storage/sqlite';
import { SELF_IMPROVEMENT_CONFIG, SELF_IMPROVEMENT_SWARMS } from './config';
import { 
  BudgetTracker, 
  BudgetConfig, 
  BudgetStatus,
  BudgetAlert,
  BudgetExceededError,
  SessionHistoryEntry,
  getBudgetTracker 
} from '../integrations/openclaw';
import { 
  UsageCalculator, 
  UsageMetrics,
  getUsageCalculator 
} from '../integrations/openclaw/UsageCalculator';
import {
  LearningEngine,
  ImprovementRecord,
  StrategyRecommendation,
  ABTest,
  getLearningEngine,
} from '../integrations/openclaw/LearningEngine';
import {
  ImprovementStore,
  ImprovementEntry,
  getImprovementStore,
} from '../integrations/openclaw/ImprovementStore';

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
  swarmId?: string;
}

export interface AgentWithBudget {
  agentId: string;
  role: string;
  model: string;
  budgetLimit: number;
  swarmId: string;
  status: 'spawning' | 'idle' | 'running' | 'completed' | 'failed' | 'killed';
  openClawSessionKey?: string;
}

const API_BASE = 'http://localhost:7373';
const API_KEY = 'dash-api-key';

// OpenClaw Gateway config
const OPENCLAW_GATEWAY_URL = process.env['OPENCLAW_GATEWAY_URL'] || 'ws://127.0.0.1:18789';
const OPENCLAW_GATEWAY_TOKEN = process.env['OPENCLAW_GATEWAY_TOKEN'];

// ============================================================================
// API Helpers
// ============================================================================

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

async function updateAgentStatus(agentId: string, status: string): Promise<void> {
  await apiRequest(`/api/agents/${agentId}`, 'PATCH', { status });
}

async function killAgent(agentId: string, reason: string): Promise<void> {
  console.log(`[Orchestrator] Killing agent ${agentId}: ${reason}`);
  await updateAgentStatus(agentId, 'killed');
  
  // TODO: Also kill via OpenClaw gateway if session key exists
  // await openClawSessionManager.kill(sessionKey);
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

// ============================================================================
// OpenClaw Integration
// ============================================================================

/**
 * Fetch session history from OpenClaw Gateway
 */
async function fetchOpenClawSessionHistory(sessionKey: string): Promise<SessionHistoryEntry[]> {
  try {
    const response = await fetch(`${OPENCLAW_GATEWAY_URL.replace('ws://', 'http://')}/api/sessions/${sessionKey}/history`, {
      headers: {
        'Authorization': `Bearer ${OPENCLAW_GATEWAY_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch session history: ${response.statusText}`);
    }

    const data = await response.json();
    return data.history || [];
  } catch (error) {
    console.error(`[Orchestrator] Failed to fetch session history for ${sessionKey}:`, error);
    return [];
  }
}

/**
 * Spawn an agent via OpenClaw Gateway
 */
async function spawnOpenClawAgent(
  task: string,
  model: string,
  budget: number,
  options?: {
    skills?: string[];
    systemPrompt?: string;
    sandbox?: boolean;
  }
): Promise<{ sessionKey: string; sessionId: string }> {
  try {
    const response = await fetch(`${OPENCLAW_GATEWAY_URL.replace('ws://', 'http://')}/api/sessions/spawn`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENCLAW_GATEWAY_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        thinking: 'low',
        workspace: '/Users/jasontang/clawd',
        skills: options?.skills || [],
        systemPrompt: options?.systemPrompt || `You are a self-improvement agent. Your budget is $${budget.toFixed(2)}.`,
        sandbox: {
          mode: options?.sandbox !== false ? 'non-main' : 'none',
          allowedTools: ['read', 'write', 'edit', 'exec', 'browser', 'web_search'],
          deniedTools: ['gateway', 'discord', 'slack'],
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to spawn agent: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('[Orchestrator] Failed to spawn OpenClaw agent:', error);
    throw error;
  }
}

// ============================================================================
// Budget Tracking Integration
// ============================================================================

/**
 * Initialize budget tracking for self-improvement
 */
async function initializeBudgetTracking(storage: SQLiteStorage): Promise<BudgetTracker> {
  const budgetTracker = getBudgetTracker(storage);
  const usageCalculator = getUsageCalculator();

  // Set up kill handler for budget enforcement
  budgetTracker.onKill(async (agentId: string, reason: string) => {
    await killAgent(agentId, reason);
  });

  // Set up alert handler for budget warnings
  budgetTracker.onAlert((alert: BudgetAlert) => {
    console.log(`[Budget Alert] ${alert.type.toUpperCase()}: ${alert.message}`);
    
    // Record budget events
    recordEvent('budget_alert', {
      type: alert.type,
      agentId: alert.agentId,
      swarmId: alert.swarmId,
      currentSpent: alert.currentSpent,
      budgetLimit: alert.budgetLimit,
      timestamp: alert.timestamp,
    });
  });

  console.log('[Orchestrator] Budget tracking initialized');
  return budgetTracker;
}

/**
 * Register an agent with budget tracking
 */
async function registerAgentWithBudget(
  budgetTracker: BudgetTracker,
  agentId: string,
  swarmId: string,
  budgetLimit: number
): Promise<void> {
  const budgetConfig: BudgetConfig = {
    totalBudget: SELF_IMPROVEMENT_CONFIG.maxBudgetUSD,
    perAgentLimit: budgetLimit,
    perSwarmLimit: SELF_IMPROVEMENT_CONFIG.maxBudgetUSD,
    warningThreshold: 0.8, // 80% warning
  };

  await budgetTracker.registerAgent(agentId, budgetConfig, swarmId);
}

/**
 * Track usage for an agent from OpenClaw session
 */
async function trackAgentUsage(
  budgetTracker: BudgetTracker,
  agentId: string,
  sessionKey: string
): Promise<BudgetStatus | null> {
  try {
    // Fetch session history from OpenClaw
    const history = await fetchOpenClawSessionHistory(sessionKey);
    
    if (history.length === 0) {
      return null;
    }

    // Track usage from session history
    const status = await budgetTracker.trackFromSessionHistory(agentId, history);
    
    return status;
  } catch (error) {
    console.error(`[Orchestrator] Failed to track usage for ${agentId}:`, error);
    return null;
  }
}

/**
 * Poll agent usage periodically
 */
async function pollAgentUsage(
  budgetTracker: BudgetTracker,
  agents: AgentWithBudget[],
  intervalMs: number = 30000
): Promise<void> {
  const poll = async () => {
    for (const agent of agents) {
      if (agent.status === 'running' && agent.openClawSessionKey) {
        try {
          const status = await trackAgentUsage(
            budgetTracker,
            agent.agentId,
            agent.openClawSessionKey
          );

          if (status) {
            console.log(`[Orchestrator] Agent ${agent.agentId}: $${status.totalSpent.toFixed(2)} / $${status.budgetLimit.toFixed(2)} (${(status.percentUsed * 100).toFixed(1)}%)`);
            
            if (status.isWarning) {
              console.log(`⚠️ Agent ${agent.agentId} approaching budget limit`);
            }
          }
        } catch (error) {
          if (error instanceof BudgetExceededError) {
            console.log(`🚫 Agent ${agent.agentId} exceeded budget`);
            agent.status = 'killed';
          } else {
            console.error(`[Orchestrator] Error polling agent ${agent.agentId}:`, error);
          }
        }
      }
    }
  };

  // Initial poll
  await poll();

  // Set up recurring polling
  const intervalId = setInterval(poll, intervalMs);

  // Return cleanup function
  return new Promise((resolve) => {
    // Store interval ID for cleanup
    (global as any).__budgetPollInterval = intervalId;
  });
}

// ============================================================================
// Main Orchestrator
// ============================================================================

export interface SelfImprovementSession {
  state: SelfImprovementState;
  budgetTracker: BudgetTracker;
  learningEngine: LearningEngine;
  improvementStore: ImprovementStore;
}

export async function startSelfImprovementSession(): Promise<SelfImprovementSession> {
  console.log('🚀 Starting Dash Self-Improvement Session');
  console.log(`   Budget: $${SELF_IMPROVEMENT_CONFIG.maxBudgetUSD}`);
  console.log(`   Max tokens per agent: ${SELF_IMPROVEMENT_CONFIG.maxTokensPerAgent}`);
  
  // Initialize database and budget tracking
  const storage = await getDb({ dbPath: './dash.db' });
  const budgetTracker = await initializeBudgetTracking(storage);

  // Initialize Learning Engine and Improvement Store
  const learningEngine = getLearningEngine(storage);
  const improvementStore = getImprovementStore(storage);
  
  await learningEngine.initialize();
  await improvementStore.initialize();

  // Register swarm budget
  await budgetTracker.registerSwarm('self-improvement', {
    totalBudget: SELF_IMPROVEMENT_CONFIG.maxBudgetUSD,
    warningThreshold: 0.8,
  });
  
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
  
  console.log('[Orchestrator] Learning Engine initialized');
  console.log('[Orchestrator] Improvement Store initialized');
  
  return { state, budgetTracker, learningEngine, improvementStore };
}

export async function runImprovementCycle(
  state: SelfImprovementState,
  area: 'codeQuality' | 'documentation' | 'testing',
  budgetTracker: BudgetTracker,
  learningEngine?: LearningEngine,
  improvementStore?: ImprovementStore
): Promise<ImprovementResult> {
  const swarmConfig = SELF_IMPROVEMENT_SWARMS[area];
  const cycleStartTime = Date.now();
  
  console.log(`\n📊 Running ${area} improvement cycle...`);
  
  // Get strategy recommendations if learning engine is available
  let recommendedStrategy: string | undefined;
  if (learningEngine) {
    const recommendations = await learningEngine.recommendStrategies(area, 1);
    if (recommendations.length > 0) {
      recommendedStrategy = recommendations[0].strategy;
      console.log(`   💡 Recommended strategy: ${recommendedStrategy} (${(recommendations[0].predictedSuccessRate * 100).toFixed(0)}% predicted success)`);
    }
  }
  
  const result: ImprovementResult = {
    success: false,
    area,
    changes: 0,
    budgetUsed: 0,
    metrics: {},
    errors: []
  };
  
  // Track agents for this cycle
  const agents: AgentWithBudget[] = [];
  const toolsUsed: string[] = [];
  
  try {
    // Create swarm for this improvement area
    const swarm = await createSwarm(swarmConfig.name, {
      area,
      selfImprovement: true,
      safetyBoundaries: SELF_IMPROVEMENT_CONFIG.allowedOperations
    });
    
    state.swarmId = swarm.id;
    console.log(`   Created swarm: ${swarm.id}`);

    // Register swarm budget
    await budgetTracker.registerSwarm(swarm.id, {
      totalBudget: SELF_IMPROVEMENT_CONFIG.maxBudgetUSD,
      warningThreshold: 0.8,
    });
    
    // Spawn agents in parallel (according to parallelism config)
    for (const agentConfig of swarmConfig.agents) {
      // Check swarm budget first
      const swarmStatus = await budgetTracker.checkSwarm(swarm.id);
      if (swarmStatus.remaining < agentConfig.budgetLimit) {
        console.log(`   ⚠️  Skipping ${agentConfig.role} - swarm budget exceeded`);
        continue;
      }

      // Check global budget
      if (state.totalBudgetUsed + agentConfig.budgetLimit > SELF_IMPROVEMENT_CONFIG.maxBudgetUSD) {
        console.log(`   ⚠️  Skipping ${agentConfig.role} - global budget exceeded`);
        continue;
      }
      
      try {
        // Spawn Dash agent
        const agent = await spawnAgent(swarm.id, agentConfig);
        
        // Register with budget tracker
        await registerAgentWithBudget(
          budgetTracker,
          agent.id,
          swarm.id,
          agentConfig.budgetLimit
        );

        // Spawn OpenClaw agent for actual execution
        const openClawSession = await spawnOpenClawAgent(
          agentConfig.task,
          agentConfig.model,
          agentConfig.budgetLimit,
          {
            skills: ['code-analysis', 'refactoring'],
            systemPrompt: `You are a ${agentConfig.role} agent. Your task: ${agentConfig.task}. Budget: $${agentConfig.budgetLimit.toFixed(2)}`,
          }
        );

        // Track agent with budget
        const trackedAgent: AgentWithBudget = {
          agentId: agent.id,
          role: agentConfig.role,
          model: agentConfig.model,
          budgetLimit: agentConfig.budgetLimit,
          swarmId: swarm.id,
          status: 'running',
          openClawSessionKey: openClawSession.sessionKey,
        };
        agents.push(trackedAgent);
        
        // Track tools used
        toolsUsed.push('read', 'write', 'edit', 'exec');
        
        console.log(`   ✅ Spawned ${agentConfig.role} (OpenClaw: ${openClawSession.sessionKey})`);
      } catch (error) {
        const errorMsg = `Failed to spawn ${agentConfig.role}: ${error}`;
        console.log(`   ❌ ${errorMsg}`);
        result.errors.push(errorMsg);
      }
    }
    
    // Poll agent usage during execution
    console.log(`   📋 Agents running: ${agents.length}`);
    
    // Start polling usage (runs in background)
    pollAgentUsage(budgetTracker, agents).catch(console.error);

    // Wait for agents to complete (in real impl, would poll for status)
    // For now, simulate with a delay
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Final usage tracking
    for (const agent of agents) {
      if (agent.openClawSessionKey) {
        const finalStatus = await trackAgentUsage(
          budgetTracker,
          agent.agentId,
          agent.openClawSessionKey
        );

        if (finalStatus) {
          result.budgetUsed += finalStatus.totalSpent;
        }
      }
    }
    
    // Calculate results
    result.success = agents.length > 0 && result.errors.length === 0;
    result.changes = agents.filter(a => a.status !== 'killed').length;
    state.totalBudgetUsed += result.budgetUsed;
    state.lastImprovementTime = new Date();
    
    const cycleDuration = Date.now() - cycleStartTime;
    
    console.log(`   ✅ ${area} cycle complete: ${result.changes} agents, $${result.budgetUsed.toFixed(2)} used`);
    
    // Record improvement to Learning Engine and Improvement Store
    if (learningEngine && improvementStore) {
      const strategy = recommendedStrategy || `${area}-default`;
      
      // Record to Learning Engine
      await learningEngine.recordImprovement({
        timestamp: new Date(),
        area,
        strategy,
        success: result.success,
        confidence: result.success ? 0.9 : 0.5,
        budgetUsed: result.budgetUsed,
        durationMs: cycleDuration,
        changes: result.changes,
        metrics: {
          testCoverageDelta: result.metrics.testCoverage,
          bugsFixed: result.metrics.bugsFixed,
          performanceImprovement: result.metrics.performanceImprovement,
        },
        context: {
          swarmId: swarm.id,
          agentCount: agents.length,
          modelUsed: agents[0]?.model || 'unknown',
          toolsUsed: [...new Set(toolsUsed)],
        },
        errorDetails: result.errors.length > 0 ? result.errors.join('; ') : undefined,
      });
      
      // Store to Improvement Store
      await improvementStore.store({
        timestamp: new Date(),
        area,
        strategy,
        success: result.success,
        confidence: result.success ? 0.9 : 0.5,
        budgetUsed: result.budgetUsed,
        durationMs: cycleDuration,
        changes: result.changes,
        metrics: {
          testCoverageDelta: result.metrics.testCoverage,
          bugsFixed: result.metrics.bugsFixed,
          performanceImprovement: result.metrics.performanceImprovement,
        },
        context: {
          swarmId: swarm.id,
          agentCount: agents.length,
          modelUsed: agents[0]?.model || 'unknown',
          toolsUsed: [...new Set(toolsUsed)],
        },
        tags: [area, strategy, result.success ? 'success' : 'failure'],
      });
      
      console.log(`   📝 Recorded improvement to learning system`);
    }
    
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

export async function getSelfImprovementReport(
  state: SelfImprovementState,
  budgetTracker?: BudgetTracker,
  learningEngine?: LearningEngine,
  improvementStore?: ImprovementStore
): Promise<string> {
  const duration = Date.now() - state.startTime.getTime();
  
  let report = '\n';
  report += '╔══════════════════════════════════════════════════════════════╗\n';
  report += '║           DASH SELF-IMPROVEMENT REPORT                       ║\n';
  report += '╠══════════════════════════════════════════════════════════════╣\n';
  report += `║ Iteration: ${state.iteration}\n`;
  report += `║ Duration: ${Math.round(duration / 1000)}s\n`;
  report += `║ Total Budget Used: $${state.totalBudgetUsed.toFixed(2)}\n`;
  report += `║ Remaining Budget: $${(SELF_IMPROVEMENT_CONFIG.maxBudgetUSD - state.totalBudgetUsed).toFixed(2)}\n`;
  report += '╠══════════════════════════════════════════════════════════════╣\n';
  report += '║ IMPROVEMENTS:\n';
  
  for (const imp of state.improvements) {
    const status = imp.success ? '✅' : '❌';
    report += `║   ${status} ${imp.area}: ${imp.changes} changes, $${imp.budgetUsed.toFixed(2)}\n`;
  }

  // Add budget report if available
  if (budgetTracker) {
    const budgetReport = await budgetTracker.getBudgetReport();
    report += budgetReport;
  }
  
  // Add learning metrics if available
  if (learningEngine) {
    try {
      const learningMetrics = await learningEngine.getMetrics();
      report += '╠══════════════════════════════════════════════════════════════╣\n';
      report += '║ LEARNING LOOP:\n';
      report += `║   Total Improvements: ${learningMetrics.totalImprovements}\n`;
      report += `║   Success Rate: ${(learningMetrics.overallSuccessRate * 100).toFixed(1)}%\n`;
      report += `║   Total Budget Spent: $${learningMetrics.totalBudgetSpent.toFixed(2)}\n`;
      report += `║   Active A/B Tests: ${learningMetrics.activeTests}\n`;
      report += `║   Patterns Identified: ${learningMetrics.patternsIdentified}\n`;
      
      if (learningMetrics.topStrategies.length > 0) {
        report += '║   Top Strategies:\n';
        for (const strategy of learningMetrics.topStrategies.slice(0, 3)) {
          const trend = strategy.trend === 'improving' ? '↑' : strategy.trend === 'declining' ? '↓' : '→';
          report += `║     ${trend} ${strategy.strategy}: ${(strategy.successRate * 100).toFixed(0)}% (${strategy.totalAttempts})\n`;
        }
      }
    } catch (error) {
      report += '║   Learning metrics unavailable\n';
    }
  }
  
  // Add improvement store analytics if available
  if (improvementStore) {
    try {
      const analytics = await improvementStore.getAnalytics();
      report += '╠══════════════════════════════════════════════════════════════╣\n';
      report += '║ STORE ANALYTICS:\n';
      report += `║   Unique Strategies: ${analytics.uniqueStrategies}\n`;
      report += `║   Coverage Areas: ${analytics.uniqueAreas}\n`;
      if (analytics.topStrategy) {
        report += `║   Top Strategy: ${analytics.topStrategy}\n`;
      }
      if (analytics.bestArea) {
        report += `║   Best Area: ${analytics.bestArea}\n`;
      }
    } catch (error) {
      report += '║   Store analytics unavailable\n';
    }
  }
  
  report += '╠══════════════════════════════════════════════════════════════╣\n';
  report += '║ ERRORS:\n';
  
  const allErrors = state.improvements.flatMap(imp => imp.errors);
  if (allErrors.length > 0) {
    for (const error of allErrors.slice(0, 5)) {
      report += `║   - ${error.substring(0, 60)}${error.length > 60 ? '...' : ''}\n`;
    }
    if (allErrors.length > 5) {
      report += `║   ... and ${allErrors.length - 5} more\n`;
    }
  } else {
    report += '║   No errors\n';
  }
  
  report += '╚══════════════════════════════════════════════════════════════╝\n';
  
  return report;
}

// ============================================================================
// CLI Entry Point
// ============================================================================

if (require.main === module) {
  (async () => {
    let session: SelfImprovementSession | undefined;
    
    try {
      // Start self-improvement session (initializes all components)
      session = await startSelfImprovementSession();
      const { state, budgetTracker, learningEngine, improvementStore } = session;
      
      // Run improvement cycles
      for (const area of ['codeQuality', 'documentation', 'testing'] as const) {
        if (state.totalBudgetUsed >= SELF_IMPROVEMENT_CONFIG.maxBudgetUSD) {
          console.log(`\n⚠️  Budget exhausted, stopping improvements`);
          break;
        }
        
        const result = await runImprovementCycle(
          state, 
          area, 
          budgetTracker,
          learningEngine,
          improvementStore
        );
        
        // Stop if budget exceeded
        if (state.totalBudgetUsed >= SELF_IMPROVEMENT_CONFIG.maxBudgetUSD) {
          console.log(`\n⚠️  Budget exhausted after ${area}`);
          break;
        }
      }
      
      // Print comprehensive report
      const report = await getSelfImprovementReport(
        state, 
        budgetTracker,
        learningEngine,
        improvementStore
      );
      console.log(report);
      
      // Print learning loop report
      if (learningEngine) {
        const learningReport = await learningEngine.getLearningReport();
        console.log(learningReport);
      }
      
      // Record completion
      await recordEvent('self_improvement_completed', {
        state,
        report,
        timestamp: new Date().toISOString()
      });
      
      // Clean up polling interval if exists
      if ((global as any).__budgetPollInterval) {
        clearInterval((global as any).__budgetPollInterval);
      }
      
      console.log('\n✅ Self-improvement session complete');
      console.log('Learning data accumulated and available for future cycles');
      
    } catch (error) {
      console.error('Self-improvement failed:', error);
      process.exit(1);
    }
  })();
}
