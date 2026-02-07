/**
 * Agent Commands
 * 
 * Commands:
 * - swarmctl agent list [--format json|jsonl|table] [--swarm <id>] [--status <status>]
 * - swarmctl agent spawn <task> [--model <model>] [--swarm <id>]
 * - swarmctl agent get <agent-id> [--format json] [--logs]
 * - swarmctl agent kill <agent-id> [--force]
 * - swarmctl agent logs <agent-id> [--follow]
 */

import { logger } from '../../utils/logger';
import { Command } from 'commander';
import { getGlobalClient } from '../lib/client';
import { formatAgents, type OutputFormat } from '../lib/output';
import { getRuntimeRegistry, RuntimeRegistry } from '../../runtime/registry';
import type { Agent } from '../../models/agent';

export function registerAgentCommand(program: Command): void {
  const agent = program
    .command('agent')
    .description('Manage AI agents');

  // ============================================================================
  // agent list
  // ============================================================================
  agent
    .command('list')
    .description('List all agents')
    .option('-f, --format <format>', 'Output format (table|json|jsonl)', 'table')
    .option('-s, --swarm <swarmId>', 'Filter by swarm ID')
    .option('--status <status>', 'Filter by status (pending|running|paused|completed|failed|killed)')
    .option('--runtime <runtime>', 'Filter by runtime (pi|native)')
    .option('--page <page>', 'Page number', '1')
    .option('--page-size <size>', 'Items per page', '50')
    .action(async (options) => {
      try {
        const client = getGlobalClient();
        const response = await client.listAgents({
          swarmId: options.swarm,
          status: options.status,
          page: parseInt(options.page, 10),
          pageSize: parseInt(options.pageSize, 10),
        });

        if (!response.success || !response.data) {
          logger.error('❌ Failed to list agents:', response.error?.message);
          process.exit(1);
        }

        let agents = response.data.items;

        // Filter by runtime if specified
        if (options.runtime) {
          agents = agents.filter((a: Agent) => {
            const metadata = a.metadata as Record<string, unknown> | undefined;
            const agentData = metadata?.['agent'] as Record<string, unknown> | undefined;
            return metadata?.['runtime'] === options.runtime || agentData?.['runtime'] === options.runtime;
          });
        }

        if (agents.length === 0) {
          logger.info('📭 No agents found');
          logger.info('💡 Use "godel agent spawn" or "godel swarm create" to create agents');
          return;
        }

        const format = options.format as OutputFormat;
        logger.info(formatAgents(agents, { format }));

        if (response.data.hasMore) {
          logger.info(`\n📄 Page ${response.data.page} of ${Math.ceil(response.data.total / response.data.pageSize)}`);
        }
      } catch (error) {
        logger.error('❌ Failed to list agents:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // ============================================================================
  // agent spawn
  // ============================================================================
  agent
    .command('spawn')
    .description('Spawn a new agent')
    .argument('<task>', 'Task description')
    .option('-m, --model <model>', 'Model to use', 'kimi-k2.5')
    .option('-l, --label <label>', 'Agent label')
    .option('-s, --swarm <swarmId>', 'Add to existing swarm')
    .option('-p, --parent <parentId>', 'Parent agent ID (for hierarchical spawning)')
    .option('-r, --retries <count>', 'Max retry attempts', '3')
    .option('-b, --budget <limit>', 'Budget limit (USD)')
    .option('--runtime <runtime>', 'Runtime to use (pi|native)', 'pi')
    .option('-w, --workdir <path>', 'Working directory for the agent')
    .option('--dry-run', 'Show configuration without spawning')
    .action(async (task, options) => {
      try {
        logger.info('🚀 Spawning agent...\n');

        if (options.dryRun) {
          logger.info('📋 Configuration (dry run):');
          logger.info(`   Task: ${task}`);
          logger.info(`   Model: ${options.model}`);
          logger.info(`   Runtime: ${options.runtime}`);
          logger.info(`   Label: ${options.label || '(auto)'}`);
          logger.info(`   Swarm: ${options.swarm || '(none)'}`);
          logger.info(`   Parent: ${options.parent || '(none)'}`);
          logger.info(`   Workdir: ${options.workdir || process.cwd()}`);
          logger.info(`   Max Retries: ${options.retries}`);
          if (options.budget) logger.info(`   Budget: $${options.budget} USD`);
          return;
        }

        // Get runtime registry and selected runtime
        const registry = getRuntimeRegistry();
        let runtime;
        try {
          runtime = registry.get(options.runtime);
        } catch (error) {
          logger.error(`❌ Runtime '${options.runtime}' not found`);
          logger.info(`   Available runtimes: ${registry.listIds().join(', ')}`);
          process.exit(1);
        }

        // Spawn agent using the selected runtime
        const agent = await runtime.spawn({
          name: options.label,
          model: options.model,
          workdir: options.workdir,
        });

        logger.info('✅ Agent spawned successfully!\n');
        logger.info(`   ID: ${agent.id}`);
        logger.info(`   Name: ${agent.name}`);
        logger.info(`   Status: ${agent.status}`);
        logger.info(`   Runtime: ${agent.runtime}`);
        logger.info(`   Model: ${agent.model}`);
        if (options.swarm) {
          logger.info(`   Swarm: ${options.swarm}`);
        }
        logger.info(`\n💡 Use 'godel agent get ${agent.id}' to check progress`);

      } catch (error) {
        logger.error('❌ Failed to spawn agent:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // ============================================================================
  // agent get
  // ============================================================================
  agent
    .command('get')
    .description('Get agent details')
    .argument('<agent-id>', 'Agent ID')
    .option('-f, --format <format>', 'Output format (table|json)', 'table')
    .option('--logs', 'Include recent logs')
    .action(async (agentId, options) => {
      try {
        const client = getGlobalClient();
        const response = await client.getAgent(agentId);

        if (!response.success || !response.data) {
          logger.error(`❌ Agent ${agentId} not found`);
          process.exit(1);
        }

        const agent = response.data;

        if (options.format === 'json') {
          logger.info(JSON.stringify(agent, null, 2));
          return;
        }

        logger.info(`🤖 Agent: ${agentId}\n`);
        logger.info(`   Status:       ${agent.status}`);
        logger.info(`   Model:        ${agent.model}`);
        logger.info(`   Task:         ${agent.task}`);
        
        if (agent.label) {
          logger.info(`   Label:        ${agent.label}`);
        }
        
        if (agent.swarmId) {
          logger.info(`   Swarm:        ${agent.swarmId}`);
        }
        
        if (agent.parentId) {
          logger.info(`   Parent:       ${agent.parentId}`);
        }
        
        if (agent.childIds.length > 0) {
          logger.info(`   Children:     ${agent.childIds.length}`);
        }

        logger.info(`\n   Timestamps:`);
        logger.info(`     Spawned:    ${agent.spawnedAt.toISOString()}`);
        if (agent.completedAt) {
          logger.info(`     Completed:  ${agent.completedAt.toISOString()}`);
        }

        if (agent.runtime > 0) {
          const seconds = Math.floor(agent.runtime / 1000);
          const minutes = Math.floor(seconds / 60);
          const hours = Math.floor(minutes / 60);
          const duration = hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m ${seconds % 60}s`;
          logger.info(`\n   Runtime:      ${duration}`);
        }

        logger.info(`\n   Retries:      ${agent.retryCount}/${agent.maxRetries}`);
        
        if (agent.lastError) {
          logger.info(`\n   Last Error:   ${agent.lastError}`);
        }

        if (agent.budgetLimit) {
          logger.info(`\n   Budget Limit: $${agent.budgetLimit.toFixed(2)} USD`);
        }

        logger.info(`\n   Context Usage: ${(agent.context.contextUsage * 100).toFixed(1)}%`);

        if (options.logs) {
          logger.info(`\n   Recent Logs:`);
          const logsResponse = await client.getAgentLogs(agentId, { lines: 20 });
          if (logsResponse.success && logsResponse.data && logsResponse.data.length > 0) {
            for (const log of logsResponse.data) {
              logger.info(`     ${log}`);
            }
          } else {
            logger.info('     (No logs available)');
          }
        }

      } catch (error) {
        logger.error('❌ Failed to get agent:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // ============================================================================
  // agent kill
  // ============================================================================
  agent
    .command('kill')
    .description('Kill an agent')
    .argument('<agent-id>', 'Agent ID to kill')
    .option('-f, --force', 'Force kill without confirmation')
    .option('--yes', 'Skip confirmation prompt')
    .action(async (agentId, options) => {
      try {
        const client = getGlobalClient();

        const getResponse = await client.getAgent(agentId);
        if (!getResponse.success || !getResponse.data) {
          logger.error(`❌ Agent ${agentId} not found`);
          process.exit(1);
        }

        const agent = getResponse.data;

        if (agent.status === 'killed' || agent.status === 'completed') {
          logger.info(`ℹ️  Agent ${agentId.slice(0, 16)}... is already ${agent.status}`);
          return;
        }

        logger.info(`⚠️  You are about to kill agent: ${agentId}`);
        logger.info(`   Status: ${agent.status}`);
        logger.info(`   Task: ${agent.task.slice(0, 50)}${agent.task.length > 50 ? '...' : ''}`);

        if (!options.yes && !options.force) {
          logger.info('\n🛑 Use --yes to confirm kill');
          return;
        }

        logger.info('\n☠️  Killing agent...');
        const response = await client.killAgent(agentId, options.force);

        if (!response.success) {
          logger.error('❌ Failed to kill agent:', response.error?.message);
          process.exit(1);
        }

        logger.info('✅ Agent killed');

      } catch (error) {
        logger.error('❌ Failed to kill agent:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // ============================================================================
  // agent logs
  // ============================================================================
  agent
    .command('logs')
    .description('Get agent logs')
    .argument('<agent-id>', 'Agent ID')
    .option('-f, --follow', 'Follow log output (tail -f style)')
    .option('-n, --lines <count>', 'Number of lines to show', '50')
    .action(async (agentId, options) => {
      try {
        const client = getGlobalClient();

        // Verify agent exists
        const getResponse = await client.getAgent(agentId);
        if (!getResponse.success) {
          logger.error(`❌ Agent ${agentId} not found`);
          process.exit(1);
        }

        if (options.follow) {
          logger.info(`📜 Following logs for agent ${agentId}...`);
          logger.info('(Press Ctrl+C to stop)\n');

          let lastLineCount = 0;

          const interval = setInterval(async () => {
            const logsResponse = await client.getAgentLogs(agentId, { lines: parseInt(options.lines, 10) });
            if (logsResponse.success && logsResponse.data) {
              const logs = logsResponse.data;
              if (logs.length > lastLineCount) {
                const newLogs = logs.slice(lastLineCount);
                for (const log of newLogs) {
                  logger.info(log);
                }
                lastLineCount = logs.length;
              }
            }
          }, 1000);

          // Handle Ctrl+C
          process.on('SIGINT', () => {
            clearInterval(interval);
            logger.info('\n\n👋 Stopped following logs');
            process.exit(0);
          });

          // Keep the process alive
          await new Promise(() => {});
        } else {
          const logsResponse = await client.getAgentLogs(agentId, { lines: parseInt(options.lines, 10) });

          if (!logsResponse.success) {
            logger.error('❌ Failed to get logs:', logsResponse.error?.message);
            process.exit(1);
          }

          const logs = logsResponse.data || [];

          if (logs.length === 0) {
            logger.info('📭 No logs found for this agent');
            return;
          }

          logger.info(`📜 Logs for agent ${agentId}:\n`);
          for (const log of logs) {
            logger.info(log);
          }
        }

      } catch (error) {
        logger.error('❌ Failed to get logs:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}
