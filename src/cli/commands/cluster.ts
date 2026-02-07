/**
 * Cluster Management CLI Commands
 * 
 * Provides commands for managing federation clusters:
 * - List registered clusters
 * - Add/remove clusters
 * - Check cluster health
 * - Migrate agents between clusters
 * 
 * @module cli/commands/cluster
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { v4 as uuidv4 } from 'uuid';
import { ClusterRegistry, getClusterRegistry } from '../../federation/cluster/cluster-registry';
import { Cluster, Region, ClusterStatus } from '../../federation/cluster/types';
import { MultiClusterLoadBalancer, getMultiClusterLoadBalancer } from '../../federation/cluster/multi-cluster-balancer';
import { logger } from '../../utils/logger';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format cluster status with color
 */
function formatStatus(status: ClusterStatus): string {
  switch (status) {
    case 'active':
      return chalk.green('● active');
    case 'degraded':
      return chalk.yellow('● degraded');
    case 'offline':
      return chalk.red('● offline');
    case 'maintenance':
      return chalk.blue('● maintenance');
    default:
      return chalk.gray('● unknown');
  }
}

/**
 * Format latency with color
 */
function formatLatency(latency: number): string {
  if (latency < 50) return chalk.green(`${latency}ms`);
  if (latency < 100) return chalk.yellow(`${latency}ms`);
  return chalk.red(`${latency}ms`);
}

/**
 * Format cost with color
 */
function formatCost(cost: number): string {
  if (cost === 0) return chalk.green('free');
  if (cost < 1) return chalk.green(`$${cost.toFixed(2)}/hr`);
  if (cost < 3) return chalk.yellow(`$${cost.toFixed(2)}/hr`);
  return chalk.red(`$${cost.toFixed(2)}/hr`);
}

/**
 * Get registry instance
 */
function getRegistry(): ClusterRegistry {
  return getClusterRegistry();
}

// ============================================================================
// CLI Commands
// ============================================================================

/**
 * Register cluster management commands
 * 
 * @param program - Commander program instance
 */
export function registerClusterCommands(program: Command): void {
  const cluster = program.command('cluster')
    .description('Manage federation clusters');

  // ============================================================================
  // List Clusters
  // ============================================================================
  cluster
    .command('list')
    .description('List all registered clusters')
    .option('-j, --json', 'Output as JSON')
    .option('-r, --region <region>', 'Filter by region')
    .option('--gpu', 'Show only GPU clusters')
    .action(async (options) => {
      try {
        const registry = getRegistry();
        let clusters = registry.getClusters();

        // Apply filters
        if (options.region) {
          clusters = clusters.filter(c => c.region === options.region);
        }
        if (options.gpu) {
          clusters = clusters.filter(c => c.capabilities.gpuEnabled);
        }

        if (options.json) {
          console.log(JSON.stringify(clusters, null, 2));
          return;
        }

        if (clusters.length === 0) {
          console.log(chalk.yellow('\nNo clusters registered.\n'));
          console.log(chalk.gray('Use "swarmctl cluster add <name> <endpoint>" to register a cluster.\n'));
          return;
        }

        console.log(chalk.bold('\n🌐 Registered Clusters:\n'));
        
        for (const c of clusters) {
          const caps = c.capabilities;
          const health = registry.getHealthState(c.id);
          
          console.log(`${formatStatus(c.status)} ${chalk.bold(c.name)} (${c.id})`);
          console.log(`  📍 Region: ${chalk.cyan(c.region)}`);
          console.log(`  🔗 Endpoint: ${chalk.gray(c.endpoint)}`);
          console.log(`  👥 Agents: ${chalk.cyan(caps.availableAgents)}/${chalk.cyan(caps.maxAgents)} available`);
          
          if (caps.gpuEnabled) {
            console.log(`  🎮 GPU: ${chalk.green('Yes')} (${caps.gpuTypes.join(', ') || 'generic'})`);
          } else {
            console.log(`  🎮 GPU: ${chalk.gray('No')}`);
          }
          
          console.log(`  💰 Cost: ${formatCost(caps.costPerHour)}`);
          console.log(`  📶 Latency: ${formatLatency(caps.latency)}`);
          
          if (health) {
            console.log(`  🏥 Health: ${health.consecutiveFailures > 0 
              ? chalk.yellow(`${health.consecutiveFailures} recent failures`) 
              : chalk.green('healthy')}`);
          }
          
          console.log(`  📦 Provider: ${c.metadata.provider}, Environment: ${c.metadata.environment}`);
          console.log();
        }

        // Summary
        const stats = registry.getStats();
        console.log(chalk.gray(`Total: ${stats.totalClusters} clusters | ` +
          `${stats.activeClusters} active | ` +
          `${stats.degradedClusters} degraded | ` +
          `${stats.offlineClusters} offline`));
        console.log(chalk.gray(`Capacity: ${stats.availableCapacity}/${stats.totalCapacity} agents available`));
        console.log();
      } catch (error) {
        console.error(chalk.red(`Error: ${(error as Error).message}`));
        process.exit(1);
      }
    });

  // ============================================================================
  // Add Cluster
  // ============================================================================
  cluster
    .command('add <name> <endpoint>')
    .description('Register a new cluster')
    .option('-r, --region <region>', 'Geographic region', 'unknown')
    .option('--gpu', 'Cluster has GPU support')
    .option('--gpu-types <types>', 'GPU types (comma-separated)')
    .option('--max-agents <count>', 'Maximum agents', '100')
    .option('--cost <perHour>', 'Cost per hour in USD', '0')
    .option('--provider <provider>', 'Cloud provider', 'custom')
    .option('--env <environment>', 'Environment', 'production')
    .option('--tag <tag>', 'Add tag (can be used multiple times)', collectTags, [])
    .action(async (name, endpoint, options) => {
      try {
        const registry = getRegistry();

        // Validate region
        const validRegions: Region[] = [
          'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
          'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-central-1',
          'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1',
          'ap-south-1', 'sa-east-1', 'ca-central-1',
          'local', 'unknown'
        ];
        
        const region = validRegions.includes(options.region) 
          ? options.region as Region 
          : 'unknown';

        // Parse GPU types
        const gpuTypes = options.gpuTypes 
          ? options.gpuTypes.split(',').map((t: string) => t.trim()) 
          : [];

        const cluster: Cluster = {
          id: `cluster-${uuidv4().split('-')[0]}`,
          name,
          endpoint,
          region,
          status: 'active',
          capabilities: {
            maxAgents: parseInt(options.maxAgents),
            availableAgents: parseInt(options.maxAgents),
            activeAgents: 0,
            gpuEnabled: options.gpu || false,
            gpuTypes,
            costPerHour: parseFloat(options.cost),
            latency: 0,
            flags: {},
          },
          metadata: {
            version: '2.0.0',
            provider: options.provider,
            environment: options.env,
            tags: options.tag || [],
          },
          lastHeartbeat: Date.now(),
          registeredAt: Date.now(),
        };

        registry.register(cluster);

        console.log(chalk.green(`\n✓ Cluster registered successfully`));
        console.log(`  Name: ${chalk.bold(name)}`);
        console.log(`  ID: ${chalk.gray(cluster.id)}`);
        console.log(`  Endpoint: ${chalk.gray(endpoint)}`);
        console.log(`  Region: ${chalk.cyan(region)}`);
        
        if (options.gpu) {
          console.log(`  GPU: ${chalk.green('Enabled')} (${gpuTypes.join(', ') || 'generic'})`);
        }
        console.log();
      } catch (error) {
        console.error(chalk.red(`Error: ${(error as Error).message}`));
        process.exit(1);
      }
    });

  // ============================================================================
  // Remove Cluster
  // ============================================================================
  cluster
    .command('remove <cluster-id>')
    .description('Unregister a cluster')
    .option('-f, --force', 'Force removal without confirmation')
    .action(async (clusterId, options) => {
      try {
        const registry = getRegistry();
        const cluster = registry.getCluster(clusterId);

        if (!cluster) {
          console.error(chalk.red(`Error: Cluster ${clusterId} not found`));
          process.exit(1);
        }

        // Check for running agents
        const caps = cluster.capabilities;
        if (caps.activeAgents > 0 && !options.force) {
          console.error(chalk.red(`Error: Cluster has ${caps.activeAgents} active agents`));
          console.error(chalk.gray('Use --force to remove anyway (agents will be orphaned)'));
          process.exit(1);
        }

        registry.unregister(clusterId);
        console.log(chalk.green(`\n✓ Cluster ${clusterId} unregistered\n`));
      } catch (error) {
        console.error(chalk.red(`Error: ${(error as Error).message}`));
        process.exit(1);
      }
    });

  // ============================================================================
  // Health Check
  // ============================================================================
  cluster
    .command('health')
    .description('Check cluster health status')
    .option('--watch', 'Watch health status continuously')
    .option('-i, --interval <ms>', 'Check interval in ms', '30000')
    .action(async (options) => {
      try {
        const registry = getRegistry();
        
        const checkHealth = async () => {
          console.clear();
          console.log(chalk.bold('\n🏥 Cluster Health Status\n'));

          const clusters = registry.getClusters();
          
          if (clusters.length === 0) {
            console.log(chalk.yellow('No clusters registered.\n'));
            return;
          }

          for (const cluster of clusters) {
            const health = registry.getHealthState(cluster.id);
            
            if (!health) {
              console.log(`${chalk.gray('●')} ${cluster.name} - no health data`);
              continue;
            }

            const statusIcon = health.status === 'active' ? chalk.green('●') :
                              health.status === 'degraded' ? chalk.yellow('●') :
                              chalk.red('●');

            console.log(`${statusIcon} ${chalk.bold(cluster.name)}`);
            console.log(`  Status: ${health.status}`);
            console.log(`  Latency: ${formatLatency(health.latency)}`);
            console.log(`  Last heartbeat: ${new Date(health.lastHeartbeat).toLocaleString()}`);
            
            if (health.consecutiveFailures > 0) {
              console.log(`  ${chalk.red(`⚠ ${health.consecutiveFailures} consecutive failures`)}`);
            }
            
            if (health.consecutiveSuccesses > 0) {
              console.log(`  ${chalk.green(`✓ ${health.consecutiveSuccesses} consecutive successes`)}`);
            }
            
            console.log();
          }

          const stats = registry.getStats();
          console.log(chalk.gray(`Last updated: ${new Date().toLocaleString()}`));
          console.log(chalk.gray(`${stats.activeClusters} healthy, ${stats.degradedClusters} degraded, ${stats.offlineClusters} offline`));
          console.log();
        };

        // Run initial check
        await checkHealth();

        if (options.watch) {
          console.log(chalk.gray('Watching... (Ctrl+C to exit)\n'));
          
          // Start health monitoring
          registry.startHealthChecks();
          
          // Update display periodically
          const interval = setInterval(checkHealth, parseInt(options.interval));
          
          // Handle exit
          process.on('SIGINT', () => {
            clearInterval(interval);
            registry.stopHealthChecks();
            console.log(chalk.gray('\nStopped watching.\n'));
            process.exit(0);
          });
        }
      } catch (error) {
        console.error(chalk.red(`Error: ${(error as Error).message}`));
        process.exit(1);
      }
    });

  // ============================================================================
  // Stats
  // ============================================================================
  cluster
    .command('stats')
    .description('Show cluster statistics')
    .option('-j, --json', 'Output as JSON')
    .action(async (options) => {
      try {
        const registry = getRegistry();
        const stats = registry.getStats();

        if (options.json) {
          console.log(JSON.stringify(stats, null, 2));
          return;
        }

        console.log(chalk.bold('\n📊 Cluster Statistics\n'));
        
        console.log(chalk.bold('Clusters:'));
        console.log(`  Total: ${stats.totalClusters}`);
        console.log(`  Active: ${chalk.green(stats.activeClusters)}`);
        console.log(`  Degraded: ${chalk.yellow(stats.degradedClusters)}`);
        console.log(`  Offline: ${chalk.red(stats.offlineClusters)}`);
        console.log(`  GPU-enabled: ${chalk.cyan(stats.gpuClusters)}`);
        console.log();
        
        console.log(chalk.bold('Capacity:'));
        console.log(`  Total: ${stats.totalCapacity} agents`);
        console.log(`  Available: ${chalk.green(stats.availableCapacity)} agents`);
        console.log(`  Utilization: ${chalk.cyan(
          stats.totalCapacity > 0 
            ? `${((stats.totalCapacity - stats.availableCapacity) / stats.totalCapacity * 100).toFixed(1)}%` 
            : 'N/A'
        )}`);
        console.log();
      } catch (error) {
        console.error(chalk.red(`Error: ${(error as Error).message}`));
        process.exit(1);
      }
    });

  // ============================================================================
  // Migrate Agent
  // ============================================================================
  cluster
    .command('migrate <agent-id> <to-cluster>')
    .description('Migrate an agent to a different cluster')
    .option('--from <cluster>', 'Source cluster (auto-detected if not specified)')
    .option('--wait', 'Wait for migration to complete')
    .action(async (agentId, toCluster, options) => {
      try {
        const registry = getRegistry();
        
        // Check target cluster exists
        const targetCluster = toCluster === 'local' 
          ? { id: 'local', name: 'Local Cluster' }
          : registry.getCluster(toCluster);

        if (!targetCluster) {
          console.error(chalk.red(`Error: Target cluster ${toCluster} not found`));
          process.exit(1);
        }

        console.log(chalk.bold(`\n🔄 Migrating agent ${agentId}...`));
        console.log(`  From: ${chalk.gray(options.from || 'auto-detect')}`);
        console.log(`  To: ${chalk.cyan(targetCluster.name || toCluster)}`);
        console.log();

        // Note: In a real implementation, we would get the load balancer
        // and call migrateAgent. For now, we show the command structure.
        console.log(chalk.yellow('Migration not yet fully implemented in CLI.'));
        console.log(chalk.gray('Use the API directly for agent migration.\n'));
      } catch (error) {
        console.error(chalk.red(`Error: ${(error as Error).message}`));
        process.exit(1);
      }
    });

  // ============================================================================
  // Regions
  // ============================================================================
  cluster
    .command('regions')
    .description('List available regions')
    .action(() => {
      const regions: { id: Region; name: string }[] = [
        { id: 'us-east-1', name: 'US East (N. Virginia)' },
        { id: 'us-east-2', name: 'US East (Ohio)' },
        { id: 'us-west-1', name: 'US West (N. California)' },
        { id: 'us-west-2', name: 'US West (Oregon)' },
        { id: 'eu-west-1', name: 'EU West (Ireland)' },
        { id: 'eu-west-2', name: 'EU West (London)' },
        { id: 'eu-west-3', name: 'EU West (Paris)' },
        { id: 'eu-central-1', name: 'EU Central (Frankfurt)' },
        { id: 'ap-southeast-1', name: 'Asia Pacific (Singapore)' },
        { id: 'ap-southeast-2', name: 'Asia Pacific (Sydney)' },
        { id: 'ap-northeast-1', name: 'Asia Pacific (Tokyo)' },
        { id: 'ap-south-1', name: 'Asia Pacific (Mumbai)' },
        { id: 'sa-east-1', name: 'South America (São Paulo)' },
        { id: 'ca-central-1', name: 'Canada (Central)' },
        { id: 'local', name: 'Local Machine' },
        { id: 'unknown', name: 'Unknown Region' },
      ];

      console.log(chalk.bold('\n🌍 Available Regions:\n'));
      
      for (const region of regions) {
        console.log(`  ${chalk.cyan(region.id.padEnd(16))} ${region.name}`);
      }
      
      console.log();
    });
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Collect multiple tag options
 */
function collectTags(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}
