/**
 * Status Command - System Overview
 *
 * Shows Dash system status including:
 * - API version and health
 * - Agent count (running/idle)
 * - Swarm count (active)
 * - Budget summary
 * - OpenClaw connection status
 *
 * Usage: dash status
 */

import { Command } from 'commander';
import { logger } from '../../utils';
import { getGlobalLifecycle } from '../../core/lifecycle';
import { getGlobalSwarmManager } from '../../core/swarm';
import { getGlobalBus } from '../../bus/index';
import { memoryStore } from '../../storage/memory';
import { AgentRepository } from '../../storage/repositories/AgentRepository';
import { getGlobalSQLiteStorage } from '../../storage/sqlite';
import { activeBudgets } from '../../safety/budget';

// Version info from package.json (injected at build time)
const DASH_VERSION = '2.0.0';
const API_VERSION = '3.0.0';

/**
 * Register the status command with the CLI program
 */
export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .description('Show Dash system status and overview')
    .option('-f, --format <format>', 'Output format (table|json)', 'table')
    .action(async (options) => {
      try {
        // Gather system information
        const status = await gatherSystemStatus();

        if (options.format === 'json') {
          console.log(JSON.stringify(status, null, 2));
          return;
        }

        // Print formatted status output
        printStatus(status);

      } catch (error) {
        console.error('❌ Failed to get system status:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}

/**
 * System status data structure
 */
interface SystemStatus {
  dash: {
    version: string;
    apiVersion: string;
    health: 'healthy' | 'degraded' | 'unhealthy';
  };
  agents: {
    total: number;
    running: number;
    idle: number;
    paused: number;
    failed: number;
  };
  swarms: {
    total: number;
    active: number;
  };
  budgets: {
    configured: number;
    dailyLimit: number | null;
    dailyUsed: number;
  };
  openclaw: {
    connected: boolean;
    mode: 'connected' | 'mock' | 'disconnected';
    version?: string;
  };
  timestamp: string;
}

/**
 * Gather all system status information
 * 
 * PERFORMANCE ROUND 2 OPTIMIZATIONS:
 * - Uses lightweight count queries instead of loading all agents
 * - Avoids full lifecycle/swarm manager initialization for read-only ops
 * - Reduces memory allocations by using aggregated counts
 */
async function gatherSystemStatus(): Promise<SystemStatus> {
  // PERFORMANCE: Initialize database only (avoid full lifecycle init)
  const storage = await getGlobalSQLiteStorage({ dbPath: './dash.db' });

  // PERFORMANCE: Use lightweight count query instead of loading all agents
  const agentCounts = storage.getAgentCountsByStatus();
  
  // Calculate idle as idle + spawning for display purposes
  const idleCount = (agentCounts['idle'] || 0) + (agentCounts['spawning'] || 0);

  // PERFORMANCE: Lazy-load swarm manager only when needed
  // Use direct storage query for swarm counts to avoid full initialization
  const allSwarms = storage.getAllSwarms();
  const swarmCount = allSwarms.length;
  const activeSwarmCount = allSwarms.filter(s => s['status'] !== 'destroyed').length;

  // Get budget info
  const budgetCount = activeBudgets.size;
  const budgetArray = Array.from(activeBudgets.values());
  const totalDailyUsed = budgetArray.reduce((sum, b) => sum + b.costUsed.total, 0);

  // Check OpenClaw connection (fast path)
  const openclawStatus = checkOpenClawConnectionFast();

  // Determine system health using counts instead of full objects
  const health = determineSystemHealthFromCounts(agentCounts, swarmCount, openclawStatus);

  return {
    dash: {
      version: DASH_VERSION,
      apiVersion: API_VERSION,
      health,
    },
    agents: {
      total: agentCounts['total'] || 0,
      running: agentCounts['running'] || 0,
      idle: idleCount,
      paused: agentCounts['paused'] || 0,
      failed: agentCounts['failed'] || 0,
    },
    swarms: {
      total: swarmCount,
      active: activeSwarmCount,
    },
    budgets: {
      configured: budgetCount,
      dailyLimit: null, // Would come from config
      dailyUsed: totalDailyUsed,
    },
    openclaw: openclawStatus,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Check OpenClaw connection status - Fast path (no async)
 * PERFORMANCE: Synchronous check avoids async overhead
 */
function checkOpenClawConnectionFast(): SystemStatus['openclaw'] {
  // Check if running in OpenClaw environment
  if (process.env['OPENCLAW_SESSION'] || process.env['OPENCLAW_GATEWAY_URL']) {
    return {
      connected: true,
      mode: 'connected',
      version: '1.0.0',
    };
  }

  // Mock mode when not in OpenClaw environment
  return {
    connected: true,
    mode: 'mock',
    version: 'mock-1.0.0',
  };
}

/**
 * Check OpenClaw connection status
 */
async function checkOpenClawConnection(): Promise<SystemStatus['openclaw']> {
  // For now, return mock status
  // In production, this would check actual OpenClaw gateway connection
  try {
    // Check if running in OpenClaw environment
    if (process.env['OPENCLAW_SESSION'] || process.env['OPENCLAW_GATEWAY_URL']) {
      return {
        connected: true,
        mode: 'connected',
        version: '1.0.0',
      };
    }

    // Check if we can reach the gateway (in real implementation)
    // For now, show mock mode when not in OpenClaw environment
    return {
      connected: true,
      mode: 'mock',
      version: 'mock-1.0.0',
    };
  } catch {
    return {
      connected: false,
      mode: 'disconnected',
    };
  }
}

/**
 * Determine overall system health based on component status
 */
function determineSystemHealth(
  agents: { status: string }[],
  swarms: unknown[],
  openclaw: SystemStatus['openclaw']
): SystemStatus['dash']['health'] {
  // Calculate failed ratio
  const failedCount = agents.filter(a => a.status === 'failed' || a.status === 'killed').length;
  const failedRatio = agents.length > 0 ? failedCount / agents.length : 0;

  // Determine health
  if (openclaw.mode === 'disconnected' && swarms.length > 0) {
    return 'degraded';
  }

  if (failedRatio > 0.5) {
    return 'degraded';
  }

  return 'healthy';
}

/**
 * Determine overall system health based on agent counts (fast path)
 * PERFORMANCE: Avoids loading full agent objects
 */
function determineSystemHealthFromCounts(
  agentCounts: Record<string, number>,
  swarmCount: number,
  openclaw: SystemStatus['openclaw']
): SystemStatus['dash']['health'] {
  const totalAgents = agentCounts['total'] || 0;
  const failedCount = (agentCounts['failed'] || 0) + (agentCounts['killed'] || 0) + (agentCounts['killing'] || 0);
  const failedRatio = totalAgents > 0 ? failedCount / totalAgents : 0;

  // Determine health
  if (openclaw.mode === 'disconnected' && swarmCount > 0) {
    return 'degraded';
  }

  if (failedRatio > 0.5) {
    return 'degraded';
  }

  return 'healthy';
}

/**
 * Print formatted status output
 */
function printStatus(status: SystemStatus): void {
  const healthEmoji = status.dash.health === 'healthy' ? '✅' : 
                      status.dash.health === 'degraded' ? '⚠️' : '❌';
  
  const healthText = status.dash.health === 'healthy' ? 'healthy' :
                     status.dash.health === 'degraded' ? 'degraded' : 'unhealthy';

  const openclawText = status.openclaw.mode === 'connected' 
    ? 'Connected'
    : status.openclaw.mode === 'mock'
    ? 'Connected (mock mode)'
    : 'Disconnected';

  // Calculate budget string
  const budgetStr = status.budgets.configured > 0
    ? `${status.budgets.configured} configured ($${status.budgets.dailyUsed.toFixed(2)}/day)`
    : 'None configured';

  // Print the formatted output
  console.log();
  console.log(`${healthEmoji} Dash v${status.dash.version} Status`);
  logger.info('status', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`API:      v${status.dash.apiVersion} (${healthText})`);
  console.log(`Agents:   ${status.agents.total} total (${status.agents.running} running, ${status.agents.idle} idle)`);
  console.log(`Swarms:   ${status.swarms.active} active`);
  console.log(`Budgets:  ${budgetStr}`);
  console.log(`OpenClaw: ${openclawText}`);
  logger.info('status', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log();
}

/**
 * Create status command for lazy loading pattern
 */
export function createStatusCommand(): Command {
  const command = new Command('status');
  
  command
    .description('Show Dash system status and overview')
    .option('-f, --format <format>', 'Output format (table|json)', 'table')
    .action(async (options) => {
      try {
        const status = await gatherSystemStatus();

        if (options.format === 'json') {
          console.log(JSON.stringify(status, null, 2));
          return;
        }

        printStatus(status);

      } catch (error) {
        console.error('❌ Failed to get system status:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  return command;
}

export default registerStatusCommand;
