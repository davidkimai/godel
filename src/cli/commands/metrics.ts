import { logger } from '../../utils/logger';
/**
 * Metrics Commands
 * 
 * Commands:
 * - swarmctl status - Overall system status
 * - swarmctl metrics [--format json] - Detailed metrics
 * - swarmctl health - Health check
 * - swarmctl config - Configuration management
 */

import { Command } from 'commander';
import { getGlobalClient } from '../lib/client';
import { formatMetrics, type OutputFormat, formatOutput, formatSwarms, formatAgents, formatTasks } from '../lib/output';
import { getGlobalSwarmManager } from '../../core/swarm';
import { getGlobalLifecycle } from '../../core/lifecycle';
import { getGlobalBus } from '../../bus/index';
import { memoryStore, initDatabase } from '../../storage';
import { resolve } from 'path';
import { existsSync, mkdirSync } from 'fs';

export function registerMetricsCommand(program: Command): void {
  const metrics = program
    .command('metrics')
    .description('System metrics and monitoring');

  // ============================================================================
  // metrics show (default)
  // ============================================================================
  metrics
    .command('show')
    .description('Show system metrics')
    .alias('list')
    .option('-f, --format <format>', 'Output format (table|json)', 'table')
    .action(async (options) => {
      try {
        const client = getGlobalClient();
        const response = await client.getMetrics();

        if (!response.success || !response.data) {
          console.error('❌ Failed to get metrics:', response.error?.message);
          process.exit(1);
        }

        const data = {
          ...response.data,
          timestamp: new Date().toISOString(),
        };

        const format = options.format as OutputFormat;
        logger.info(formatMetrics(data, { format }));

      } catch (error) {
        console.error('❌ Failed to get metrics:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // ============================================================================
  // metrics agents
  // ============================================================================
  metrics
    .command('agents')
    .description('Show agent metrics')
    .option('-f, --format <format>', 'Output format (table|json)', 'table')
    .action(async (options) => {
      try {
        const client = getGlobalClient();

        // Get all agents
        const response = await client.listAgents({ pageSize: 1000 });

        if (!response.success || !response.data) {
          console.error('❌ Failed to get agents:', response.error?.message);
          process.exit(1);
        }

        const agents = response.data.items;

        // Calculate metrics
        const byStatus: Record<string, number> = {};
        const byModel: Record<string, number> = {};
        let totalRuntime = 0;
        let totalRetries = 0;

        for (const agent of agents) {
          byStatus[agent.status] = (byStatus[agent.status] || 0) + 1;
          byModel[agent.model] = (byModel[agent.model] || 0) + 1;
          totalRuntime += agent.runtime;
          totalRetries += agent.retryCount;
        }

        const metrics = {
          totalAgents: agents.length,
          byStatus,
          byModel,
          averageRuntime: agents.length > 0 ? totalRuntime / agents.length : 0,
          totalRetries,
        };

        if (options.format === 'json') {
          logger.info(JSON.stringify(metrics, null, 2));
          return;
        }

        logger.info('📊 Agent Metrics\n');
        logger.info(`  Total Agents: ${metrics.totalAgents}`);
        logger.info(`  Average Runtime: ${formatDuration(metrics.averageRuntime)}`);
        logger.info(`  Total Retries: ${metrics.totalRetries}`);

        if (Object.keys(byStatus).length > 0) {
          logger.info('\n  By Status:');
          for (const [status, count] of Object.entries(byStatus).sort((a, b) => b[1] - a[1])) {
            const emoji = getStatusEmoji(status);
            logger.info(`    ${emoji} ${status.padEnd(12)} ${String(count).padStart(4)}`);
          }
        }

        if (Object.keys(byModel).length > 0) {
          logger.info('\n  By Model:');
          for (const [model, count] of Object.entries(byModel).sort((a, b) => b[1] - a[1])) {
            logger.info(`    ${model.padEnd(20)} ${String(count).padStart(4)}`);
          }
        }

      } catch (error) {
        console.error('❌ Failed to get agent metrics:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // ============================================================================
  // metrics swarms
  // ============================================================================
  metrics
    .command('swarms')
    .description('Show swarm metrics')
    .option('-f, --format <format>', 'Output format (table|json)', 'table')
    .action(async (options) => {
      try {
        const client = getGlobalClient();

        // Get all swarms
        const response = await client.listSwarms({ pageSize: 1000 });

        if (!response.success || !response.data) {
          console.error('❌ Failed to get swarms:', response.error?.message);
          process.exit(1);
        }

        const swarms = response.data.items;

        // Calculate metrics
        const byStatus: Record<string, number> = {};
        const byStrategy: Record<string, number> = {};
        let totalAgents = 0;
        let totalBudgetAllocated = 0;
        let totalBudgetConsumed = 0;

        for (const swarm of swarms) {
          byStatus[swarm.status] = (byStatus[swarm.status] || 0) + 1;
          byStrategy[swarm.config.strategy] = (byStrategy[swarm.config.strategy] || 0) + 1;
          totalAgents += swarm.agents.length;
          totalBudgetAllocated += swarm.budget.allocated;
          totalBudgetConsumed += swarm.budget.consumed;
        }

        const metrics = {
          totalSwarms: swarms.length,
          totalAgents,
          byStatus,
          byStrategy,
          totalBudgetAllocated,
          totalBudgetConsumed,
          totalBudgetRemaining: totalBudgetAllocated - totalBudgetConsumed,
        };

        if (options.format === 'json') {
          logger.info(JSON.stringify(metrics, null, 2));
          return;
        }

        logger.info('📊 Swarm Metrics\n');
        logger.info(`  Total Swarms: ${metrics.totalSwarms}`);
        logger.info(`  Total Agents: ${metrics.totalAgents}`);
        
        if (totalBudgetAllocated > 0) {
          logger.info(`\n  Budget:`);
          logger.info(`    Allocated:  $${totalBudgetAllocated.toFixed(2)}`);
          logger.info(`    Consumed:   $${totalBudgetConsumed.toFixed(2)}`);
          logger.info(`    Remaining:  $${metrics.totalBudgetRemaining.toFixed(2)}`);
          const usagePct = (totalBudgetConsumed / totalBudgetAllocated) * 100;
          logger.info(`    Usage:      ${usagePct.toFixed(1)}%`);
        }

        if (Object.keys(byStatus).length > 0) {
          logger.info('\n  By Status:');
          for (const [status, count] of Object.entries(byStatus).sort((a, b) => b[1] - a[1])) {
            const emoji = getSwarmEmoji(status);
            logger.info(`    ${emoji} ${status.padEnd(12)} ${String(count).padStart(4)}`);
          }
        }

        if (Object.keys(byStrategy).length > 0) {
          logger.info('\n  By Strategy:');
          for (const [strategy, count] of Object.entries(byStrategy).sort((a, b) => b[1] - a[1])) {
            logger.info(`    ${strategy.padEnd(15)} ${String(count).padStart(4)}`);
          }
        }

      } catch (error) {
        console.error('❌ Failed to get swarm metrics:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}

export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .description('Show overall system status')
    .option('-f, --format <format>', 'Output format (table|json)', 'table')
    .action(async (options) => {
      try {
        const client = getGlobalClient();

        // Get all data
        const [healthResponse, metricsResponse, swarmsResponse, agentsResponse] = await Promise.all([
          client.getHealth(),
          client.getMetrics(),
          client.listSwarms({ pageSize: 100 }),
          client.listAgents({ pageSize: 100 }),
        ]);

        if (!healthResponse.success || !metricsResponse.success) {
          console.error('❌ Failed to get system status');
          process.exit(1);
        }

        const health = healthResponse.data!;
        const metrics = metricsResponse.data!;
        const swarms = swarmsResponse.success ? swarmsResponse.data!.items : [];
        const agents = agentsResponse.success ? agentsResponse.data!.items : [];

        if (options.format === 'json') {
          logger.info(JSON.stringify({
            health,
            metrics,
            swarms: swarms.slice(0, 10),
            agents: agents.slice(0, 10),
          }, null, 2));
          return;
        }

        // Status banner
        const statusEmoji = health.status === 'healthy' ? '🟢' : health.status === 'degraded' ? '🟡' : '🔴';
        logger.info(`${statusEmoji} System Status: ${health.status.toUpperCase()}\n`);

        // Version and uptime
        logger.info(`  Version:  ${health.version}`);
        logger.info(`  Uptime:   ${formatDuration(health.uptime * 1000)}`);
        logger.info(`  Time:     ${new Date().toISOString()}`);

        // Health checks
        logger.info('\n  Health Checks:');
        for (const [name, check] of Object.entries(health.checks)) {
          const emoji = check.status === 'healthy' ? '✅' : '❌';
          logger.info(`    ${emoji} ${name.padEnd(15)} ${check.status}`);
          if (check.message) {
            logger.info(`       ${check.message}`);
          }
        }

        // Quick stats
        logger.info('\n  Quick Stats:');
        logger.info(`    🐝 Swarms:  ${swarms.length} (${swarms.filter(s => s.status === 'active').length} active)`);
        logger.info(`    🤖 Agents:  ${agents.length} (${agents.filter(a => a.status === 'running').length} running)`);
        logger.info(`    ✅ Success: ${(metrics.successRate * 100).toFixed(1)}%`);

        // Recent activity
        if (swarms.length > 0) {
          logger.info('\n  Recent Swarms:');
          const recentSwarms = swarms
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
            .slice(0, 3);
          
          for (const swarm of recentSwarms) {
            logger.info(`    • ${swarm.name} (${swarm.agents.length} agents, ${swarm.status})`);
          }
        }

      } catch (error) {
        console.error('❌ Failed to get status:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}

export function registerHealthCommand(program: Command): void {
  program
    .command('health')
    .description('Health check')
    .option('-f, --format <format>', 'Output format (table|json)', 'table')
    .option('--exit-code', 'Exit with non-zero code if unhealthy')
    .action(async (options) => {
      try {
        const client = getGlobalClient();
        const response = await client.getHealth();

        if (!response.success || !response.data) {
          console.error('❌ Health check failed');
          if (options.exitCode) {
            process.exit(1);
          }
          return;
        }

        const health = response.data;

        if (options.format === 'json') {
          logger.info(JSON.stringify(health, null, 2));
        } else {
          const statusEmoji = health.status === 'healthy' ? '✅' : health.status === 'degraded' ? '⚠️' : '❌';
          logger.info(`${statusEmoji} Status: ${health.status.toUpperCase()}`);
          logger.info(`   Version: ${health.version}`);
          logger.info(`   Uptime:  ${formatDuration(health.uptime * 1000)}`);
          
          if (Object.keys(health.checks).length > 0) {
            logger.info('\n   Checks:');
            for (const [name, check] of Object.entries(health.checks)) {
              const emoji = check.status === 'healthy' ? '✅' : '❌';
              logger.info(`     ${emoji} ${name}: ${check.status}`);
            }
          }
        }

        if (options.exitCode && health.status !== 'healthy') {
          process.exit(1);
        }

      } catch (error) {
        console.error('❌ Health check failed:', error instanceof Error ? error.message : String(error));
        if (options.exitCode) {
          process.exit(1);
        }
      }
    });
}

export function registerConfigCommand(program: Command): void {
  const config = program
    .command('config')
    .description('Configuration management');

  config
    .command('show')
    .description('Show current configuration')
    .option('-f, --format <format>', 'Output format (table|json)', 'table')
    .action(async (options) => {
      try {
        const client = getGlobalClient();
        const response = await client.getConfig();

        if (!response.success || !response.data) {
          console.error('❌ Failed to get config:', response.error?.message);
          process.exit(1);
        }

        if (options.format === 'json') {
          logger.info(JSON.stringify(response.data, null, 2));
          return;
        }

        logger.info('⚙️  Configuration\n');
        for (const [key, value] of Object.entries(response.data)) {
          logger.info(`  ${key}: ${JSON.stringify(value)}`);
        }

      } catch (error) {
        console.error('❌ Failed to get config:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  config
    .command('set')
    .description('Set configuration value')
    .argument('<key>', 'Configuration key')
    .argument('<value>', 'Configuration value')
    .action(async (key, value) => {
      try {
        const client = getGlobalClient();
        
        // Parse value as JSON if possible
        let parsedValue: unknown;
        try {
          parsedValue = JSON.parse(value);
        } catch {
          parsedValue = value;
        }

        const response = await client.updateConfig({ [key]: parsedValue });

        if (!response.success) {
          console.error('❌ Failed to set config:', response.error?.message);
          process.exit(1);
        }

        logger.info(`✅ Set ${key} = ${JSON.stringify(parsedValue)}`);

      } catch (error) {
        console.error('❌ Failed to set config:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}

// ============================================================================
// Helper Functions
// ============================================================================

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  if (ms < 86400000) return `${(ms / 3600000).toFixed(1)}h`;
  return `${(ms / 86400000).toFixed(1)}d`;
}

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

function getSwarmEmoji(status: string): string {
  const emojiMap: Record<string, string> = {
    creating: '🔄',
    active: '✅',
    scaling: '📊',
    paused: '⏸️',
    completed: '🎉',
    failed: '❌',
    destroyed: '💥',
  };
  return emojiMap[status] || '❓';
}
