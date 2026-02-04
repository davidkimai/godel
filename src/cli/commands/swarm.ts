/**
 * Swarm Commands
 * 
 * Commands:
 * - swarmctl swarm list [--format json|jsonl|table]
 * - swarmctl swarm create --name <name> --task <task> [options]
 * - swarmctl swarm get <swarm-id> [--format json]
 * - swarmctl swarm scale <swarm-id> <target-size>
 * - swarmctl swarm destroy <swarm-id> [--force]
 */

import { Command } from 'commander';
import { getGlobalClient, type DashApiClient } from '../lib/client';
import { formatSwarms, formatSwarmStatus, type OutputFormat } from '../lib/output';
import type { SwarmConfig, SwarmStrategy } from '../../core/swarm';

export function registerSwarmCommand(program: Command): void {
  const swarm = program
    .command('swarm')
    .description('Manage agent swarms');

  // ============================================================================
  // swarm list
  // ============================================================================
  swarm
    .command('list')
    .description('List all swarms')
    .option('-f, --format <format>', 'Output format (table|json|jsonl)', 'table')
    .option('-a, --active', 'Show only active swarms')
    .option('--page <page>', 'Page number', '1')
    .option('--page-size <size>', 'Items per page', '50')
    .action(async (options) => {
      try {
        const client = getGlobalClient();
        const response = await client.listSwarms({
          page: parseInt(options.page, 10),
          pageSize: parseInt(options.pageSize, 10),
        });

        if (!response.success || !response.data) {
          console.error('❌ Failed to list swarms:', response.error?.message);
          process.exit(1);
        }

        let swarms = response.data.items;

        if (options.active) {
          swarms = swarms.filter(s => s.status === 'active' || s.status === 'scaling');
        }

        if (swarms.length === 0) {
          console.log('📭 No swarms found');
          console.log('💡 Use "swarmctl swarm create" to create a swarm');
          return;
        }

        const format = options.format as OutputFormat;
        console.log(formatSwarms(swarms, { format }));

        if (response.data.hasMore) {
          console.log(`\n📄 Page ${response.data.page} of ${Math.ceil(response.data.total / response.data.pageSize)}`);
          console.log(`   Use --page ${response.data.page + 1} to see more`);
        }
      } catch (error) {
        console.error('❌ Failed to list swarms:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // ============================================================================
  // swarm create
  // ============================================================================
  swarm
    .command('create')
    .description('Create a new swarm of agents')
    .requiredOption('-n, --name <name>', 'Swarm name')
    .requiredOption('-t, --task <task>', 'Task description for the swarm')
    .option('-c, --count <count>', 'Initial number of agents', '5')
    .option('--max <count>', 'Maximum number of agents', '50')
    .option('-s, --strategy <strategy>', 'Swarm strategy (parallel|map-reduce|pipeline|tree)', 'parallel')
    .option('-m, --model <model>', 'Model to use for agents', 'kimi-k2.5')
    .option('-b, --budget <amount>', 'Budget limit (USD)')
    .option('--warning-threshold <percentage>', 'Budget warning threshold (0-100)', '75')
    .option('--critical-threshold <percentage>', 'Budget critical threshold (0-100)', '90')
    .option('--sandbox', 'Enable file sandboxing', true)
    .option('--dry-run', 'Show configuration without creating')
    .action(async (options) => {
      try {
        console.log('🐝 Creating swarm...\n');

        // Validate strategy
        const validStrategies: SwarmStrategy[] = ['parallel', 'map-reduce', 'pipeline', 'tree'];
        if (!validStrategies.includes(options.strategy)) {
          console.error(`❌ Invalid strategy: ${options.strategy}`);
          console.error(`   Valid strategies: ${validStrategies.join(', ')}`);
          process.exit(1);
        }

        const config: SwarmConfig = {
          name: options.name,
          task: options.task,
          initialAgents: parseInt(options.count, 10),
          maxAgents: parseInt(options.max, 10),
          strategy: options.strategy,
          model: options.model,
        };

        // Add budget if specified
        if (options.budget) {
          const budgetAmount = parseFloat(options.budget);
          if (isNaN(budgetAmount) || budgetAmount <= 0) {
            console.error('❌ Invalid budget amount');
            process.exit(1);
          }
          config.budget = {
            amount: budgetAmount,
            currency: 'USD',
            warningThreshold: parseInt(options.warningThreshold, 10) / 100,
            criticalThreshold: parseInt(options.criticalThreshold, 10) / 100,
          };
        }

        // Add safety config
        config.safety = {
          fileSandbox: options.sandbox,
        };

        // Dry run mode
        if (options.dryRun) {
          console.log('📋 Configuration (dry run):');
          console.log(`   Name: ${config.name}`);
          console.log(`   Task: ${config.task}`);
          console.log(`   Initial Agents: ${config.initialAgents}`);
          console.log(`   Max Agents: ${config.maxAgents}`);
          console.log(`   Strategy: ${config.strategy}`);
          console.log(`   Model: ${config.model}`);
          if (config.budget) {
            console.log(`   Budget: $${config.budget.amount} USD`);
            console.log(`   Warning at: ${(config.budget.warningThreshold || 0.75) * 100}%`);
            console.log(`   Critical at: ${(config.budget.criticalThreshold || 0.90) * 100}%`);
          }
          console.log(`   Sandbox: ${config.safety.fileSandbox ? 'enabled' : 'disabled'}`);
          return;
        }

        const client = getGlobalClient();
        const response = await client.createSwarm(config);

        if (!response.success || !response.data) {
          console.error('❌ Failed to create swarm:', response.error?.message);
          process.exit(1);
        }

        const newSwarm = response.data;

        console.log('✅ Swarm created successfully!\n');
        console.log(`   ID: ${newSwarm.id}`);
        console.log(`   Name: ${newSwarm.name}`);
        console.log(`   Status: ${newSwarm.status}`);
        console.log(`   Agents: ${newSwarm.agents.length}`);
        if (newSwarm.budget.allocated > 0) {
          console.log(`   Budget: $${newSwarm.budget.allocated.toFixed(2)} USD`);
        }
        console.log(`\n💡 Use 'swarmctl swarm get ${newSwarm.id}' to monitor progress`);

      } catch (error) {
        console.error('❌ Failed to create swarm:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // ============================================================================
  // swarm get
  // ============================================================================
  swarm
    .command('get')
    .description('Get swarm details')
    .argument('<swarm-id>', 'Swarm ID')
    .option('-f, --format <format>', 'Output format (table|json)', 'table')
    .action(async (swarmId, options) => {
      try {
        const client = getGlobalClient();
        const response = await client.getSwarm(swarmId);

        if (!response.success || !response.data) {
          console.error(`❌ Swarm ${swarmId} not found`);
          process.exit(1);
        }

        const swarm = response.data;
        const statusResponse = await client.getSwarmStatus(swarmId);
        const statusInfo = statusResponse.success ? statusResponse.data : undefined;

        const format = options.format as OutputFormat;
        console.log(formatSwarmStatus(swarm, statusInfo!, { format }));

      } catch (error) {
        console.error('❌ Failed to get swarm:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // ============================================================================
  // swarm scale
  // ============================================================================
  swarm
    .command('scale')
    .description('Scale a swarm to a target number of agents')
    .argument('<swarm-id>', 'Swarm ID to scale')
    .argument('<target-size>', 'Target number of agents')
    .action(async (swarmId, targetSize) => {
      try {
        const target = parseInt(targetSize, 10);
        if (isNaN(target) || target < 0) {
          console.error('❌ Invalid target size');
          process.exit(1);
        }

        const client = getGlobalClient();

        // Get current swarm
        const getResponse = await client.getSwarm(swarmId);
        if (!getResponse.success || !getResponse.data) {
          console.error(`❌ Swarm ${swarmId} not found`);
          process.exit(1);
        }

        const currentSize = getResponse.data.agents.length;
        console.log(`📊 Scaling swarm ${getResponse.data.name}...`);
        console.log(`   Current: ${currentSize} agents`);
        console.log(`   Target: ${target} agents`);

        const response = await client.scaleSwarm(swarmId, target);

        if (!response.success) {
          console.error('❌ Failed to scale swarm:', response.error?.message);
          process.exit(1);
        }

        const action = target > currentSize ? 'added' : 'removed';
        const delta = Math.abs(target - currentSize);

        console.log(`✅ Scaled successfully (${action} ${delta} agents)`);

      } catch (error) {
        console.error('❌ Failed to scale swarm:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // ============================================================================
  // swarm destroy
  // ============================================================================
  swarm
    .command('destroy')
    .description('Destroy a swarm and all its agents')
    .argument('<swarm-id>', 'Swarm ID to destroy')
    .option('-f, --force', 'Force destroy without confirmation')
    .option('--yes', 'Skip confirmation prompt')
    .action(async (swarmId, options) => {
      try {
        const client = getGlobalClient();

        const getResponse = await client.getSwarm(swarmId);
        if (!getResponse.success || !getResponse.data) {
          console.error(`❌ Swarm ${swarmId} not found`);
          process.exit(1);
        }

        const swarm = getResponse.data;

        console.log(`⚠️  You are about to destroy swarm: ${swarm.name}`);
        console.log(`   ID: ${swarm.id}`);
        console.log(`   Agents: ${swarm.agents.length}`);

        if (!options.yes && !options.force) {
          console.log('\n🛑 Use --yes to confirm destruction');
          return;
        }

        console.log('\n💥 Destroying swarm...');
        const response = await client.destroySwarm(swarmId, options.force);

        if (!response.success) {
          console.error('❌ Failed to destroy swarm:', response.error?.message);
          process.exit(1);
        }

        console.log('✅ Swarm destroyed');

      } catch (error) {
        console.error('❌ Failed to destroy swarm:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}
