/**
 * Agents Command v2 - Manage AI agents with Swarm and Lifecycle integration
 * 
 * Commands:
 * - dash agents list [--format table|json] [--swarm <id>]
 * - dash agents spawn <task> [--model <model>] [--swarm <id>]
 * - dash agents pause <agent-id>
 * - dash agents resume <agent-id>
 * - dash agents kill <agent-id> [--force]
 * - dash agents status <agent-id>
 * - dash agents retry <agent-id> [--model <model>]
 */

import { logger } from '../../utils/logger';
import { Command } from 'commander';
import { getGlobalLifecycle, type RetryOptions, type AgentState } from '../../core/lifecycle';
import { getGlobalSwarmManager } from '../../core/swarm';
import { getGlobalBus } from '../../bus/index';
import { memoryStore } from '../../storage/memory';
import { AgentStatus } from '../../models/agent';
import { AgentRepository } from '../../storage/repositories/AgentRepository';
import { getGlobalSQLiteStorage } from '../../storage/sqlite';

// Initialize database for persistence
async function initDatabase() {
  return getGlobalSQLiteStorage({ dbPath: './dash.db' });
}

export function registerAgentsCommand(program: Command): void {
  const agents = program
    .command('agents')
    .description('Manage AI agents');

  // ============================================================================
  // agents list
  // ============================================================================
  agents
    .command('list')
    .description('List all agents')
    .option('-f, --format <format>', 'Output format (table|json)', 'table')
    .option('-s, --swarm <swarmId>', 'Filter by swarm ID')
    .option('--status <status>', 'Filter by status (pending|running|paused|completed|failed|killed)')
    .action(async (options) => {
      try {
        // PERFORMANCE ROUND 2: Use lightweight storage query instead of full repository
        const storage = await getGlobalSQLiteStorage({ dbPath: './dash.db' });
        
        // PERFORMANCE: Use lightweight query that only selects needed columns
        let agents = storage.getAgentListLightweight();

        // Apply filters in-memory (fast since we have lightweight objects)
        if (options.swarm) {
          agents = agents.filter((a) => a.swarmId === options.swarm);
        }
        if (options.status) {
          agents = agents.filter((a) => a.status === options.status);
        }

        if (agents.length === 0) {
          logger.info('📭 No agents found');
          logger.info('💡 Use "dash agents spawn" or "dash swarm create" to create agents');
          return;
        }

        if (options.format === 'json') {
          logger.info(JSON.stringify(agents.map((a) => ({
            id: a.id,
            status: a.status,
            model: a.model,
            task: a.task,
            swarmId: a.swarmId,
            createdAt: a.spawnedAt,
            runtime: a.runtime,
            retryCount: a.retryCount,
            maxRetries: a.maxRetries,
          })), null, 2));
          return;
        }

        // Table format
        logger.info('🤖 Agents:\n');
        logger.info('ID                   Swarm                Status     Model           Runtime  Retries');
        logger.info('───────────────────  ───────────────────  ─────────  ──────────────  ───────  ───────');

        for (const agent of agents) {
          const swarmName = agent.swarmId 
            ? agent.swarmId.slice(0, 19)
            : 'none';
          
          const runtime = agent.runtime 
            ? formatDuration(agent.runtime)
            : '-';

          logger.info(
            `${agent.id.slice(0, 19).padEnd(19)}  ` +
            `${swarmName.padEnd(19)}  ` +
            `${getStatusEmoji(agent.status)} ${agent.status.padEnd(8)}  ` +
            `${agent.model.slice(0, 14).padEnd(14)}  ` +
            `${runtime.padStart(7)}  ` +
            `${agent.retryCount}/${agent.maxRetries}`
          );
        }

        logger.info(`\n📊 Total: ${agents.length} agents`);

      } catch (error) {
        logger.error('❌ Failed to list agents:', error instanceof Error ? error.message : String(error));
        process.exit(3);
      }
    });

  // ============================================================================
  // agents spawn
  // ============================================================================
  agents
    .command('spawn')
    .description('Spawn a new agent')
    .argument('<task>', 'Task description')
    .option('-m, --model <model>', 'Model to use', 'kimi-k2.5')
    .option('-l, --label <label>', 'Agent label')
    .option('-s, --swarm <swarmId>', 'Add to existing swarm')
    .option('-p, --parent <parentId>', 'Parent agent ID (for hierarchical spawning)')
    .option('-r, --retries <count>', 'Max retry attempts', '3')
    .option('-b, --budget <limit>', 'Budget limit (USD)')
    .option('--dry-run', 'Show configuration without spawning')
    .action(async (task, options) => {
      try {
        logger.info('🚀 Spawning agent...\n');

        if (options.dryRun) {
          logger.info('📋 Configuration (dry run):');
          logger.info(`   Task: ${task}`);
          logger.info(`   Model: ${options.model}`);
          logger.info(`   Label: ${options.label || '(auto)'}`);
          logger.info(`   Swarm: ${options.swarm || '(none)'}`);
          logger.info(`   Parent: ${options.parent || '(none)'}`);
          logger.info(`   Max Retries: ${options.retries}`);
          if (options.budget) logger.info(`   Budget: $${options.budget} USD`);
          return;
        }

        // Initialize lifecycle
        const messageBus = getGlobalBus();
        const lifecycle = getGlobalLifecycle(memoryStore.agents, messageBus);

        if (!lifecycle) {
          logger.error('agents', '❌ Failed to initialize agent lifecycle');
          process.exit(1);
        }

        await lifecycle.start();

        // Validate swarm if specified
        if (options.swarm) {
          const swarmManager = getGlobalSwarmManager(lifecycle, messageBus, memoryStore.agents);
          const swarm = swarmManager.getSwarm(options.swarm);
          if (!swarm) {
            logger.error(`❌ Swarm ${options.swarm} not found`);
            process.exit(2);
          }
        }

        // Spawn the agent
        const agent = await lifecycle.spawn({
          task,
          model: options.model,
          label: options.label,
          swarmId: options.swarm,
          parentId: options.parent,
          maxRetries: parseInt(options.retries, 10),
          budgetLimit: options.budget ? parseFloat(options.budget) : undefined,
        });

        // Persist agent to database
        await initDatabase();
        const agentRepo = new AgentRepository();
        await agentRepo.create({
          id: agent.id,
          label: agent.label,
          status: 'running',
          model: agent.model,
          task: agent.task,
          swarm_id: agent.swarmId,
          parent_id: agent.parentId,
          max_retries: agent.maxRetries,
          metadata: agent.metadata,
        });

        logger.info('✅ Agent spawned successfully!\n');
        logger.info(`   ID: ${agent.id}`);
        logger.info(`   Status: ${agent.status}`);
        logger.info(`   Model: ${agent.model}`);
        if (options.swarm) {
          logger.info(`   Swarm: ${options.swarm}`);
        }
        logger.info(`\n💡 Use 'dash agents status ${agent.id}' to check progress`);

      } catch (error) {
        logger.error('❌ Failed to spawn agent:', error instanceof Error ? error.message : String(error));
        process.exit(3);
      }
    });

  // ============================================================================
  // agents pause
  // ============================================================================
  agents
    .command('pause')
    .description('Pause an agent')
    .argument('<agent-id>', 'Agent ID to pause')
    .action(async (agentId) => {
      try {
        // Initialize lifecycle
        const messageBus = getGlobalBus();
        const lifecycle = getGlobalLifecycle(memoryStore.agents, messageBus);
        await lifecycle.start();

        const state = lifecycle.getState(agentId);
        if (!state) {
          logger.error(`❌ Agent ${agentId} not found`);
          process.exit(2);
        }

        if (state.status === AgentStatus.PAUSED) {
          logger.info(`⏸️  Agent ${agentId.slice(0, 16)}... is already paused`);
          return;
        }

        if (state.status !== AgentStatus.RUNNING) {
          logger.error(`❌ Cannot pause agent in ${state.status} state`);
          process.exit(2);
        }

        logger.info(`⏸️  Pausing agent ${agentId.slice(0, 16)}...`);
        await lifecycle.pause(agentId);
        logger.info('✅ Agent paused');

      } catch (error) {
        logger.error('❌ Failed to pause agent:', error instanceof Error ? error.message : String(error));
        process.exit(3);
      }
    });

  // ============================================================================
  // agents resume
  // ============================================================================
  agents
    .command('resume')
    .description('Resume a paused agent')
    .argument('<agent-id>', 'Agent ID to resume')
    .action(async (agentId) => {
      try {
        // Initialize lifecycle
        const messageBus = getGlobalBus();
        const lifecycle = getGlobalLifecycle(memoryStore.agents, messageBus);
        await lifecycle.start();

        const state = lifecycle.getState(agentId);
        if (!state) {
          logger.error(`❌ Agent ${agentId} not found`);
          process.exit(2);
        }

        if (state.status !== AgentStatus.PAUSED) {
          logger.info(`▶️  Agent ${agentId.slice(0, 16)}... is not paused (status: ${state.status})`);
          return;
        }

        logger.info(`▶️  Resuming agent ${agentId.slice(0, 16)}...`);
        await lifecycle.resume(agentId);
        logger.info('✅ Agent resumed');

      } catch (error) {
        logger.error('❌ Failed to resume agent:', error instanceof Error ? error.message : String(error));
        process.exit(3);
      }
    });

  // ============================================================================
  // agents kill
  // ============================================================================
  agents
    .command('kill')
    .description('Kill an agent')
    .argument('<agent-id>', 'Agent ID to kill')
    .option('-f, --force', 'Force kill without confirmation')
    .option('--yes', 'Skip confirmation prompt')
    .action(async (agentId, options) => {
      try {
        // Initialize lifecycle
        const messageBus = getGlobalBus();
        const lifecycle = getGlobalLifecycle(memoryStore.agents, messageBus);
        await lifecycle.start();

        const state = lifecycle.getState(agentId);
        if (!state) {
          logger.error(`❌ Agent ${agentId} not found`);
          process.exit(2);
        }

        if (state.status === AgentStatus.KILLED || state.status === AgentStatus.COMPLETED) {
          logger.info(`ℹ️  Agent ${agentId.slice(0, 16)}... is already ${state.status}`);
          return;
        }

        logger.info(`⚠️  You are about to kill agent: ${agentId}`);
        logger.info(`   Status: ${state.status}`);
        logger.info(`   Task: ${state.agent.task.slice(0, 50)}${state.agent.task.length > 50 ? '...' : ''}`);

        if (!options.yes && !options.force) {
          logger.info('\n🛑 Use --yes to confirm kill');
          return;
        }

        logger.info('\n☠️  Killing agent...');
        await lifecycle.kill(agentId, options.force);
        logger.info('✅ Agent killed');

      } catch (error) {
        logger.error('❌ Failed to kill agent:', error instanceof Error ? error.message : String(error));
        process.exit(3);
      }
    });

  // ============================================================================
  // agents status
  // ============================================================================
  agents
    .command('status')
    .description('Get agent status')
    .argument('<agent-id>', 'Agent ID')
    .option('-f, --format <format>', 'Output format (table|json)', 'table')
    .option('--logs', 'Include recent logs')
    .action(async (agentId, options) => {
      try {
        // Initialize lifecycle
        const messageBus = getGlobalBus();
        const lifecycle = getGlobalLifecycle(memoryStore.agents, messageBus);
        await lifecycle.start();
        const swarmManager = getGlobalSwarmManager(lifecycle, messageBus, memoryStore.agents);

        const state = lifecycle.getState(agentId);
        if (!state) {
          logger.error(`❌ Agent ${agentId} not found`);
          process.exit(2);
        }

        if (options.format === 'json') {
          const output = {
            ...state,
            swarm: state.agent.swarmId ? swarmManager.getSwarm(state.agent.swarmId) : null,
          };
          logger.info(JSON.stringify(output, null, 2));
          return;
        }

        logger.info(`🤖 Agent: ${agentId}\n`);
        logger.info(`   Status:       ${getStatusEmoji(state.status)} ${state.status}`);
        logger.info(`   Lifecycle:    ${state.lifecycleState}`);
        logger.info(`   Model:        ${state.agent.model}`);
        logger.info(`   Task:         ${state.agent.task}`);
        
        if (state.agent.swarmId) {
          const swarm = swarmManager.getSwarm(state.agent.swarmId);
          logger.info(`   Swarm:        ${swarm?.name || state.agent.swarmId}`);
        }
        
        if (state.agent.parentId) {
          logger.info(`   Parent:       ${state.agent.parentId}`);
        }
        
        if (state.agent.childIds.length > 0) {
          logger.info(`   Children:     ${state.agent.childIds.length}`);
        }

        logger.info('agents', `\n   Timestamps:`);
        logger.info(`     Created:    ${state.createdAt.toISOString()}`);
        if (state.startedAt) logger.info(`     Started:    ${state.startedAt.toISOString()}`);
        if (state.pausedAt) logger.info(`     Paused:     ${state.pausedAt.toISOString()}`);
        if (state.resumedAt) logger.info(`     Resumed:    ${state.resumedAt.toISOString()}`);
        if (state.completedAt) logger.info(`     Completed:  ${state.completedAt.toISOString()}`);

        if (state.agent.runtime > 0) {
          logger.info(`\n   Runtime:      ${formatDuration(state.agent.runtime)}`);
        }

        logger.info(`\n   Retries:      ${state.retryCount}/${state.maxRetries}`);
        
        if (state.lastError) {
          logger.info(`\n   Last Error:   ${state.lastError}`);
        }

        if (state.agent.budgetLimit) {
          logger.info(`\n   Budget Limit: $${state.agent.budgetLimit.toFixed(2)} USD`);
        }

        if (options.logs) {
          logger.info('agents', `\n   Recent Logs:`);
          logger.info('   (Log retrieval not yet implemented)');
        }

      } catch (error) {
        logger.error('❌ Failed to get agent status:', error instanceof Error ? error.message : String(error));
        process.exit(3);
      }
    });

  // ============================================================================
  // agents retry
  // ============================================================================
  agents
    .command('retry')
    .description('Manually retry a failed agent')
    .argument('<agent-id>', 'Agent ID to retry')
    .option('-m, --model <model>', 'Use alternate model for retry')
    .option('--reset', 'Reset retry count before retrying')
    .action(async (agentId, options) => {
      try {
        // Initialize lifecycle
        const messageBus = getGlobalBus();
        const lifecycle = getGlobalLifecycle(memoryStore.agents, messageBus);
        await lifecycle.start();

        const state = lifecycle.getState(agentId);
        if (!state) {
          logger.error(`❌ Agent ${agentId} not found`);
          process.exit(2);
        }

        if (state.status !== AgentStatus.FAILED && state.status !== AgentStatus.KILLED) {
          logger.info(`ℹ️  Agent ${agentId.slice(0, 16)}... is ${state.status} (no retry needed)`);
          return;
        }

        logger.info(`🔄 Retrying agent ${agentId.slice(0, 16)}...`);

        const retryOptions: RetryOptions = {};
        if (options.model) {
          retryOptions.useAlternateModel = true;
          retryOptions.alternateModel = options.model;
        }
        if (options.reset) {
          state.retryCount = 0;
        }

        await lifecycle.retry(agentId, retryOptions);
        logger.info('✅ Agent retry initiated');

      } catch (error) {
        logger.error('❌ Failed to retry agent:', error instanceof Error ? error.message : String(error));
        process.exit(3);
      }
    });

  // ============================================================================
  // agents metrics
  // ============================================================================
  agents
    .command('metrics')
    .description('Show agent lifecycle metrics')
    .option('-f, --format <format>', 'Output format (table|json)', 'table')
    .action(async (options) => {
      try {
        // Initialize lifecycle
        const messageBus = getGlobalBus();
        const lifecycle = getGlobalLifecycle(memoryStore.agents, messageBus);
        await lifecycle.start();

        const metrics = lifecycle.getMetrics();

        if (options.format === 'json') {
          logger.info(JSON.stringify(metrics, null, 2));
          return;
        }

        logger.info('📊 Agent Lifecycle Metrics\n');
        logger.info(`   Total Spawned:   ${metrics.totalSpawned}`);
        logger.info(`   Active Agents:   ${metrics.activeAgents}`);
        logger.info(`   Paused Agents:   ${metrics.pausedAgents}`);
        logger.info(`   Completed:       ${metrics.totalCompleted}`);
        logger.info(`   Failed:          ${metrics.totalFailed}`);
        logger.info(`   Killed:          ${metrics.totalKilled}`);

        const successRate = metrics.totalSpawned > 0 
          ? (metrics.totalCompleted / metrics.totalSpawned * 100).toFixed(1)
          : '0.0';
        logger.info(`\n   Success Rate:    ${successRate}%`);

      } catch (error) {
        logger.error('❌ Failed to get metrics:', error instanceof Error ? error.message : String(error));
        process.exit(3);
      }
    });
}

// ============================================================================
// Helper Functions
// ============================================================================

function getStatusEmoji(status: string): string {
  const emojiMap: Record<string, string> = {
    pending: '⏳',
    running: '🏃',
    paused: '⏸️',
    completed: '✅',
    failed: '❌',
    killed: '☠️',
    blocked: '🚫',
  };
  return emojiMap[status] || '❓';
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}
