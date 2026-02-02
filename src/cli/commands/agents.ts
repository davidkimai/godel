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

import { Command } from 'commander';
import { getGlobalLifecycle, type RetryOptions } from '../../core/lifecycle';
import { getGlobalSwarmManager } from '../../core/swarm';
import { getGlobalBus } from '../../bus/index';
import { memoryStore } from '../../storage/memory';
import { AgentStatus } from '../../models/agent';

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
        // Initialize lifecycle
        const messageBus = getGlobalBus();
        const lifecycle = getGlobalLifecycle(memoryStore.agents, messageBus);
        const swarmManager = getGlobalSwarmManager(lifecycle, messageBus, memoryStore.agents);

        let states = lifecycle.getAllStates();

        // Apply filters
        if (options.swarm) {
          states = states.filter(s => s.agent.swarmId === options.swarm);
        }
        if (options.status) {
          states = states.filter(s => s.status === options.status);
        }

        if (states.length === 0) {
          console.log('📭 No agents found');
          console.log('💡 Use "dash agents spawn" or "dash swarm create" to create agents');
          return;
        }

        if (options.format === 'json') {
          console.log(JSON.stringify(states.map(s => ({
            id: s.id,
            status: s.status,
            lifecycleState: s.lifecycleState,
            model: s.agent.model,
            task: s.agent.task,
            swarmId: s.agent.swarmId,
            swarmName: s.agent.swarmId ? swarmManager.getSwarm(s.agent.swarmId)?.name : null,
            createdAt: s.createdAt,
            startedAt: s.startedAt,
            completedAt: s.completedAt,
            runtime: s.agent.runtime,
            retryCount: s.retryCount,
          })), null, 2));
          return;
        }

        // Table format
        console.log('🤖 Agents:\n');
        console.log('ID                   Swarm                Status     Model           Runtime  Retries');
        console.log('───────────────────  ───────────────────  ─────────  ──────────────  ───────  ───────');

        for (const state of states) {
          const swarmName = state.agent.swarmId 
            ? (swarmManager.getSwarm(state.agent.swarmId)?.name || 'unknown').slice(0, 19)
            : 'none';
          
          const runtime = state.agent.runtime 
            ? formatDuration(state.agent.runtime)
            : state.startedAt 
              ? formatDuration(Date.now() - state.startedAt.getTime())
              : '-';

          console.log(
            `${state.id.slice(0, 19).padEnd(19)}  ` +
            `${swarmName.padEnd(19)}  ` +
            `${getStatusEmoji(state.status)} ${state.status.padEnd(8)}  ` +
            `${state.agent.model.slice(0, 14).padEnd(14)}  ` +
            `${runtime.padStart(7)}  ` +
            `${state.retryCount}/${state.maxRetries}`
          );
        }

        console.log(`\n📊 Total: ${states.length} agents`);

      } catch (error) {
        console.error('❌ Failed to list agents:', error instanceof Error ? error.message : String(error));
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
        console.log('🚀 Spawning agent...\n');

        if (options.dryRun) {
          console.log('📋 Configuration (dry run):');
          console.log(`   Task: ${task}`);
          console.log(`   Model: ${options.model}`);
          console.log(`   Label: ${options.label || '(auto)'}`);
          console.log(`   Swarm: ${options.swarm || '(none)'}`);
          console.log(`   Parent: ${options.parent || '(none)'}`);
          console.log(`   Max Retries: ${options.retries}`);
          if (options.budget) console.log(`   Budget: $${options.budget} USD`);
          return;
        }

        // Initialize lifecycle
        const messageBus = getGlobalBus();
        const lifecycle = getGlobalLifecycle(memoryStore.agents, messageBus);

        if (!lifecycle) {
          console.error('❌ Failed to initialize agent lifecycle');
          process.exit(1);
        }

        lifecycle.start();

        // Validate swarm if specified
        if (options.swarm) {
          const swarmManager = getGlobalSwarmManager(lifecycle, messageBus, memoryStore.agents);
          const swarm = swarmManager.getSwarm(options.swarm);
          if (!swarm) {
            console.error(`❌ Swarm ${options.swarm} not found`);
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

        console.log('✅ Agent spawned successfully!\n');
        console.log(`   ID: ${agent.id}`);
        console.log(`   Status: ${agent.status}`);
        console.log(`   Model: ${agent.model}`);
        if (options.swarm) {
          console.log(`   Swarm: ${options.swarm}`);
        }
        console.log(`\n💡 Use 'dash agents status ${agent.id}' to check progress`);

      } catch (error) {
        console.error('❌ Failed to spawn agent:', error instanceof Error ? error.message : String(error));
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

        const state = lifecycle.getState(agentId);
        if (!state) {
          console.error(`❌ Agent ${agentId} not found`);
          process.exit(2);
        }

        if (state.status === AgentStatus.PAUSED) {
          console.log(`⏸️  Agent ${agentId.slice(0, 16)}... is already paused`);
          return;
        }

        if (state.status !== AgentStatus.RUNNING) {
          console.error(`❌ Cannot pause agent in ${state.status} state`);
          process.exit(2);
        }

        console.log(`⏸️  Pausing agent ${agentId.slice(0, 16)}...`);
        await lifecycle.pause(agentId);
        console.log('✅ Agent paused');

      } catch (error) {
        console.error('❌ Failed to pause agent:', error instanceof Error ? error.message : String(error));
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

        const state = lifecycle.getState(agentId);
        if (!state) {
          console.error(`❌ Agent ${agentId} not found`);
          process.exit(2);
        }

        if (state.status !== AgentStatus.PAUSED) {
          console.log(`▶️  Agent ${agentId.slice(0, 16)}... is not paused (status: ${state.status})`);
          return;
        }

        console.log(`▶️  Resuming agent ${agentId.slice(0, 16)}...`);
        await lifecycle.resume(agentId);
        console.log('✅ Agent resumed');

      } catch (error) {
        console.error('❌ Failed to resume agent:', error instanceof Error ? error.message : String(error));
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

        const state = lifecycle.getState(agentId);
        if (!state) {
          console.error(`❌ Agent ${agentId} not found`);
          process.exit(2);
        }

        if (state.status === AgentStatus.KILLED || state.status === AgentStatus.COMPLETED) {
          console.log(`ℹ️  Agent ${agentId.slice(0, 16)}... is already ${state.status}`);
          return;
        }

        console.log(`⚠️  You are about to kill agent: ${agentId}`);
        console.log(`   Status: ${state.status}`);
        console.log(`   Task: ${state.agent.task.slice(0, 50)}${state.agent.task.length > 50 ? '...' : ''}`);

        if (!options.yes && !options.force) {
          console.log('\n🛑 Use --yes to confirm kill');
          return;
        }

        console.log('\n☠️  Killing agent...');
        await lifecycle.kill(agentId, options.force);
        console.log('✅ Agent killed');

      } catch (error) {
        console.error('❌ Failed to kill agent:', error instanceof Error ? error.message : String(error));
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
        const swarmManager = getGlobalSwarmManager(lifecycle, messageBus, memoryStore.agents);

        const state = lifecycle.getState(agentId);
        if (!state) {
          console.error(`❌ Agent ${agentId} not found`);
          process.exit(2);
        }

        if (options.format === 'json') {
          const output = {
            ...state,
            swarm: state.agent.swarmId ? swarmManager.getSwarm(state.agent.swarmId) : null,
          };
          console.log(JSON.stringify(output, null, 2));
          return;
        }

        console.log(`🤖 Agent: ${agentId}\n`);
        console.log(`   Status:       ${getStatusEmoji(state.status)} ${state.status}`);
        console.log(`   Lifecycle:    ${state.lifecycleState}`);
        console.log(`   Model:        ${state.agent.model}`);
        console.log(`   Task:         ${state.agent.task}`);
        
        if (state.agent.swarmId) {
          const swarm = swarmManager.getSwarm(state.agent.swarmId);
          console.log(`   Swarm:        ${swarm?.name || state.agent.swarmId}`);
        }
        
        if (state.agent.parentId) {
          console.log(`   Parent:       ${state.agent.parentId}`);
        }
        
        if (state.agent.childIds.length > 0) {
          console.log(`   Children:     ${state.agent.childIds.length}`);
        }

        console.log(`\n   Timestamps:`);
        console.log(`     Created:    ${state.createdAt.toISOString()}`);
        if (state.startedAt) console.log(`     Started:    ${state.startedAt.toISOString()}`);
        if (state.pausedAt) console.log(`     Paused:     ${state.pausedAt.toISOString()}`);
        if (state.resumedAt) console.log(`     Resumed:    ${state.resumedAt.toISOString()}`);
        if (state.completedAt) console.log(`     Completed:  ${state.completedAt.toISOString()}`);

        if (state.agent.runtime > 0) {
          console.log(`\n   Runtime:      ${formatDuration(state.agent.runtime)}`);
        }

        console.log(`\n   Retries:      ${state.retryCount}/${state.maxRetries}`);
        
        if (state.lastError) {
          console.log(`\n   Last Error:   ${state.lastError}`);
        }

        if (state.agent.budgetLimit) {
          console.log(`\n   Budget Limit: $${state.agent.budgetLimit.toFixed(2)} USD`);
        }

        if (options.logs) {
          console.log(`\n   Recent Logs:`);
          console.log('   (Log retrieval not yet implemented)');
        }

      } catch (error) {
        console.error('❌ Failed to get agent status:', error instanceof Error ? error.message : String(error));
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

        const state = lifecycle.getState(agentId);
        if (!state) {
          console.error(`❌ Agent ${agentId} not found`);
          process.exit(2);
        }

        if (state.status !== AgentStatus.FAILED && state.status !== AgentStatus.KILLED) {
          console.log(`ℹ️  Agent ${agentId.slice(0, 16)}... is ${state.status} (no retry needed)`);
          return;
        }

        console.log(`🔄 Retrying agent ${agentId.slice(0, 16)}...`);

        const retryOptions: RetryOptions = {};
        if (options.model) {
          retryOptions.useAlternateModel = true;
          retryOptions.alternateModel = options.model;
        }
        if (options.reset) {
          state.retryCount = 0;
        }

        await lifecycle.retry(agentId, retryOptions);
        console.log('✅ Agent retry initiated');

      } catch (error) {
        console.error('❌ Failed to retry agent:', error instanceof Error ? error.message : String(error));
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

        const metrics = lifecycle.getMetrics();

        if (options.format === 'json') {
          console.log(JSON.stringify(metrics, null, 2));
          return;
        }

        console.log('📊 Agent Lifecycle Metrics\n');
        console.log(`   Total Spawned:   ${metrics.totalSpawned}`);
        console.log(`   Active Agents:   ${metrics.activeAgents}`);
        console.log(`   Paused Agents:   ${metrics.pausedAgents}`);
        console.log(`   Completed:       ${metrics.totalCompleted}`);
        console.log(`   Failed:          ${metrics.totalFailed}`);
        console.log(`   Killed:          ${metrics.totalKilled}`);

        const successRate = metrics.totalSpawned > 0 
          ? (metrics.totalCompleted / metrics.totalSpawned * 100).toFixed(1)
          : '0.0';
        console.log(`\n   Success Rate:    ${successRate}%`);

      } catch (error) {
        console.error('❌ Failed to get metrics:', error instanceof Error ? error.message : String(error));
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
