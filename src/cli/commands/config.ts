/**
 * SwarmCTL Configuration Commands
 * 
 * Provides CLI commands for configuration management:
 * - swarmctl apply -f swarm.yaml    : Apply a configuration
 * - swarmctl validate swarm.yaml    : Validate a configuration file
 * - swarmctl diff swarm.yaml        : Show changes compared to running swarm
 * 
 * Note: swarmctl is an alias for "dash config"
 */

import { Command } from 'commander';
import { resolve } from 'path';
import { existsSync } from 'fs';
import { loadConfig, toSwarmConfig } from '../../config/yaml-loader';
import { getGlobalGitOpsManager, formatDiff, diffConfigs } from '../../config/gitops';
import { SecretManager, getGlobalSecretManager } from '../../config/secrets';
import { getGlobalSwarmManager } from '../../core/swarm';
import { getGlobalLifecycle } from '../../core/lifecycle';
import { getGlobalBus } from '../../bus/index';
import { memoryStore, initDatabase } from '../../storage';
import { logger } from '../../utils/logger';

// ============================================================================
// Initialization
// ============================================================================

async function initializeCore(): Promise<{
  messageBus: ReturnType<typeof getGlobalBus>;
  lifecycle: ReturnType<typeof getGlobalLifecycle>;
  dbPath: string;
}> {
  const dataDir = resolve(process.cwd(), '.dash');
  if (!existsSync(dataDir)) {
    const { mkdirSync } = await import('fs');
    mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = resolve(dataDir, 'dash.db');
  await initDatabase({ dbPath, enableWAL: true });

  const messageBus = getGlobalBus();
  const lifecycle = getGlobalLifecycle(memoryStore.agents, messageBus);
  lifecycle.start();

  return { messageBus, lifecycle, dbPath };
}

// ============================================================================
// Apply Command
// ============================================================================

interface ApplyOptions {
  file: string;
  dryRun?: boolean;
  watch?: boolean;
  resolveSecrets?: boolean;
  yes?: boolean;
}

async function applyConfig(
  filePath: string,
  options: ApplyOptions
): Promise<void> {
  console.log(`📄 Loading configuration from ${filePath}...\n`);

  // Check if 1Password is available if secrets need to be resolved
  if (options.resolveSecrets) {
    const secretManager = getGlobalSecretManager();
    const opAvailable = await secretManager.isOpAvailable();
    if (!opAvailable) {
      console.warn('⚠️  1Password CLI not available, secrets will not be resolved');
    }
  }

  // Load and validate config
  let configResult;
  try {
    configResult = await loadConfig({
      filePath,
      substituteEnv: true,
      resolveSecrets: options.resolveSecrets ?? false,
      validate: true,
    });
  } catch (error) {
    console.error('❌ Configuration error:');
    if (error instanceof Error) {
      console.error(`   ${error.message}`);
    }
    process.exit(1);
  }

  const { config } = configResult;
  const swarmConfig = toSwarmConfig(config);

  // Dry run mode
  if (options.dryRun) {
    console.log('📋 Configuration (dry run):\n');
    console.log(`   Name:        ${config.metadata.name}`);
    console.log(`   Description: ${config.metadata.description || 'N/A'}`);
    console.log(`   Strategy:    ${config.spec.strategy}`);
    console.log(`   Agents:      ${config.spec.initialAgents} (max: ${config.spec.maxAgents})`);
    console.log(`   Model:       ${config.spec.model || 'default'}`);
    
    if (config.spec.budget) {
      console.log(`   Budget:      $${config.spec.budget.amount} ${config.spec.budget.currency}`);
    }
    
    if (config.spec.safety) {
      console.log(`   Sandbox:     ${config.spec.safety.fileSandbox ? 'enabled' : 'disabled'}`);
    }
    
    if (config.spec.gitops?.enabled) {
      console.log(`   GitOps:      enabled (interval: ${config.spec.gitops.watchInterval}ms)`);
    }

    if (configResult.resolvedSecrets.length > 0) {
      console.log(`\n🔐 Resolved secrets:`);
      for (const secret of configResult.resolvedSecrets) {
        console.log(`   • ${secret}`);
      }
    }

    if (configResult.substitutedEnvVars.length > 0) {
      console.log(`\n🌍 Environment variables substituted:`);
      for (const envVar of configResult.substitutedEnvVars) {
        console.log(`   • ${envVar}`);
      }
    }

    return;
  }

  // Initialize core components
  const { messageBus, lifecycle } = await initializeCore();
  const swarmManager = getGlobalSwarmManager(lifecycle, messageBus, memoryStore.agents);
  await swarmManager.start();

  // Check if swarm already exists with same name
  const existingSwarms = swarmManager.listSwarms().filter(
    s => s.name === config.metadata.name && s.status !== 'destroyed'
  );

  if (existingSwarms.length > 0) {
    console.log(`⚠️  Swarm "${config.metadata.name}" already exists:`);
    for (const swarm of existingSwarms) {
      console.log(`   ID: ${swarm.id} (status: ${swarm.status})`);
    }
    
    if (!options.yes) {
      console.log('\n🛑 Use --yes to apply changes to existing swarm');
      process.exit(1);
    }

    // Scale existing swarm instead of creating new
    const existingSwarm = existingSwarms[0];
    console.log(`\n📊 Scaling existing swarm ${existingSwarm.id}...`);
    
    const currentSize = existingSwarm.agents.length;
    const targetSize = config.spec.initialAgents;
    
    if (targetSize !== currentSize) {
      await swarmManager.scale(existingSwarm.id, targetSize);
      console.log(`   Scaled from ${currentSize} to ${targetSize} agents`);
    }

    // Set up GitOps watching if enabled
    if (options.watch || config.spec.gitops?.enabled) {
      const gitops = getGlobalGitOpsManager(swarmManager);
      await gitops.watch(filePath, existingSwarm.id);
      console.log(`   GitOps watching enabled for ${filePath}`);
    }

    console.log('\n✅ Configuration applied successfully!');
    return;
  }

  // Create new swarm
  console.log('🐝 Creating swarm...\n');
  
  const swarm = await swarmManager.create(swarmConfig);
  
  console.log('✅ Swarm created successfully!\n');
  console.log(`   ID:       ${swarm.id}`);
  console.log(`   Name:     ${swarm.name}`);
  console.log(`   Status:   ${swarm.status}`);
  console.log(`   Agents:   ${swarm.agents.length}`);
  
  if (swarm.budget.allocated > 0) {
    console.log(`   Budget:   $${swarm.budget.allocated.toFixed(2)} USD`);
  }

  // Set up GitOps watching if enabled
  if (options.watch || config.spec.gitops?.enabled) {
    const gitops = getGlobalGitOpsManager(swarmManager);
    await gitops.watch(filePath, swarm.id);
    console.log(`\n👁️  GitOps watching enabled for ${filePath}`);
    
    // Subscribe to events
    gitops.onGitOpsEvent((event) => {
      const emoji = {
        'config.loaded': '📄',
        'config.changed': '📝',
        'config.applied': '✅',
        'config.failed': '❌',
        'config.rolledback': '↩️',
      }[event.type];
      
      console.log(`${emoji} ${event.type}: ${event.filePath}`);
      
      if (event.error) {
        console.error(`   Error: ${event.error.message}`);
      }
    });
  }

  console.log(`\n💡 Use 'dash swarm status ${swarm.id}' to monitor progress`);
}

// ============================================================================
// Validate Command
// ============================================================================

interface ValidateOptions {
  strict?: boolean;
  verbose?: boolean;
}

async function validateConfigFile(
  filePath: string,
  options: ValidateOptions
): Promise<void> {
  console.log(`📄 Validating ${filePath}...\n`);

  if (!existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    process.exit(1);
  }

  try {
    const result = await loadConfig({
      filePath,
      substituteEnv: true,
      resolveSecrets: false, // Don't resolve secrets during validation
      validate: true,
    });

    console.log('✅ Configuration is valid!\n');

    if (options.verbose) {
      const { config } = result;
      
      console.log('Configuration details:');
      console.log(`  API Version: ${config.apiVersion}`);
      console.log(`  Kind:        ${config.kind}`);
      console.log(`  Name:        ${config.metadata.name}`);
      console.log(`  Strategy:    ${config.spec.strategy}`);
      console.log(`  Agents:      ${config.spec.initialAgents} (max: ${config.spec.maxAgents})`);
      
      if (config.metadata.labels) {
        console.log(`  Labels:`);
        for (const [key, value] of Object.entries(config.metadata.labels)) {
          console.log(`    ${key}: ${value}`);
        }
      }

      if (result.substitutedEnvVars.length > 0) {
        console.log(`\n🌍 Environment variables that will be substituted:`);
        for (const envVar of result.substitutedEnvVars) {
          console.log(`   • ${envVar}`);
        }
      }

      if (result.resolvedSecrets.length > 0) {
        console.log(`\n🔐 Secrets that will be resolved:`);
        for (const secret of result.resolvedSecrets) {
          console.log(`   • ${secret}`);
        }
      }
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Validation failed!\n');
    
    if (error instanceof Error) {
      // Check if it's a validation exception with multiple errors
      const validationError = error as Error & { errors?: Array<{ path: string; message: string; suggestion?: string }> };
      
      if (validationError.errors && Array.isArray(validationError.errors)) {
        for (const err of validationError.errors) {
          console.error(`   Path: ${err.path}`);
          console.error(`   Error: ${err.message}`);
          if (err.suggestion) {
            console.error(`   Suggestion: ${err.suggestion}`);
          }
          console.error('');
        }
      } else {
        console.error(`   ${error.message}`);
      }
    }

    process.exit(1);
  }
}

// ============================================================================
// Diff Command
// ============================================================================

interface DiffOptions {
  swarmId?: string;
  context?: number;
}

async function diffConfig(
  filePath: string,
  options: DiffOptions
): Promise<void> {
  console.log(`📄 Comparing ${filePath} with running swarm...\n`);

  // Load the new config
  let newConfig;
  try {
    const result = await loadConfig({
      filePath,
      substituteEnv: true,
      resolveSecrets: false,
      validate: true,
    });
    newConfig = result.config;
  } catch (error) {
    console.error('❌ Failed to load configuration:');
    if (error instanceof Error) {
      console.error(`   ${error.message}`);
    }
    process.exit(1);
  }

  // Initialize core components
  const { messageBus, lifecycle } = await initializeCore();
  const swarmManager = getGlobalSwarmManager(lifecycle, messageBus, memoryStore.agents);
  await swarmManager.start();

  // Find the swarm to compare against
  let swarmId = options.swarmId;
  
  if (!swarmId) {
    // Try to find a swarm with matching name
    const matchingSwarms = swarmManager.listActiveSwarms().filter(
      s => s.name === newConfig.metadata.name
    );
    
    if (matchingSwarms.length === 0) {
      console.log('ℹ️  No running swarm found with matching name');
      console.log(`   Would create new swarm: ${newConfig.metadata.name}`);
      return;
    }
    
    if (matchingSwarms.length > 1) {
      console.log('⚠️  Multiple swarms found with matching name:');
      for (const swarm of matchingSwarms) {
        console.log(`   ${swarm.id} (${swarm.agents.length} agents)`);
      }
      console.log('\nPlease specify a swarm ID with --swarm-id');
      process.exit(1);
    }
    
    swarmId = matchingSwarms[0].id;
  }

  const swarm = swarmManager.getSwarm(swarmId);
  if (!swarm) {
    console.error(`❌ Swarm ${swarmId} not found`);
    process.exit(1);
  }

  // Convert current swarm config to YAML format for comparison
  const currentConfig = {
    apiVersion: 'dash.io/v1',
    kind: 'Swarm',
    metadata: {
      name: swarm.name,
      ...swarm.config.metadata,
    },
    spec: {
      task: swarm.config.task,
      strategy: swarm.config.strategy,
      initialAgents: swarm.agents.length,
      maxAgents: swarm.config.maxAgents,
      model: swarm.config.model,
      budget: swarm.config.budget,
      safety: swarm.config.safety,
    },
  } as typeof newConfig;

  // Calculate diff
  const diff = diffConfigs(currentConfig, newConfig);

  if (diff.identical) {
    console.log('✅ Configuration is identical to running swarm');
    return;
  }

  console.log(`📊 Changes for swarm ${swarmId}:\n`);
  console.log(formatDiff(diff));

  // Show specific recommendations
  console.log('\n📝 Recommendations:');
  
  const agentDiff = diff.differences.find(d => d.path === 'spec.initialAgents');
  if (agentDiff) {
    const oldVal = agentDiff.oldValue as number;
    const newVal = agentDiff.newValue as number;
    if (newVal > oldVal) {
      console.log(`   • Will scale up from ${oldVal} to ${newVal} agents`);
    } else {
      console.log(`   • Will scale down from ${oldVal} to ${newVal} agents`);
    }
  }

  const strategyDiff = diff.differences.find(d => d.path === 'spec.strategy');
  if (strategyDiff) {
    console.log(`   • Strategy will change from ${strategyDiff.oldValue} to ${strategyDiff.newValue}`);
    console.log(`   ⚠️  This requires recreating the swarm`);
  }
}

// ============================================================================
// Register Commands
// ============================================================================

export function registerConfigCommand(program: Command): void {
  const config = program
    .command('config')
    .description('Manage swarm configurations (swarmctl)');

  // Apply command
  config
    .command('apply')
    .description('Apply a configuration file')
    .requiredOption('-f, --file <path>', 'Path to configuration file')
    .option('--dry-run', 'Show changes without applying')
    .option('--watch', 'Watch file for changes and auto-apply')
    .option('--resolve-secrets', 'Resolve 1Password secrets')
    .option('--yes', 'Skip confirmation prompts')
    .action(async (options) => {
      try {
        await applyConfig(options.file, {
          file: options.file,
          dryRun: options.dryRun,
          watch: options.watch,
          resolveSecrets: options.resolveSecrets,
          yes: options.yes,
        });
      } catch (error) {
        console.error('❌ Failed to apply configuration:', 
          error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // Validate command
  config
    .command('validate')
    .description('Validate a configuration file')
    .argument('<file>', 'Path to configuration file')
    .option('--strict', 'Enable strict validation')
    .option('--verbose', 'Show detailed information')
    .action(async (file, options) => {
      try {
        await validateConfigFile(file, {
          strict: options.strict,
          verbose: options.verbose,
        });
      } catch (error) {
        console.error('❌ Validation failed:', 
          error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // Diff command
  config
    .command('diff')
    .description('Show differences between config and running swarm')
    .argument('<file>', 'Path to configuration file')
    .option('--swarm-id <id>', 'Specific swarm ID to compare')
    .option('-C, --context <lines>', 'Context lines', '3')
    .action(async (file, options) => {
      try {
        await diffConfig(file, {
          swarmId: options.swarmId,
          context: parseInt(options.context, 10),
        });
      } catch (error) {
        console.error('❌ Diff failed:', 
          error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}

// ============================================================================
// SwarmCTL Alias
// ============================================================================

/**
 * Register swarmctl alias commands
 * swarmctl is an alias for "dash config"
 */
export function registerSwarmCtlCommand(program: Command): void {
  const swarmctl = program
    .command('swarmctl')
    .description('Swarm control (alias for "dash config")');

  // Apply
  swarmctl
    .command('apply')
    .description('Apply a configuration file')
    .requiredOption('-f, --file <path>', 'Path to configuration file')
    .option('--dry-run', 'Show changes without applying')
    .option('--watch', 'Watch file for changes and auto-apply')
    .option('--resolve-secrets', 'Resolve 1Password secrets')
    .option('--yes', 'Skip confirmation prompts')
    .action(async (options) => {
      try {
        await applyConfig(options.file, {
          file: options.file,
          dryRun: options.dryRun,
          watch: options.watch,
          resolveSecrets: options.resolveSecrets,
          yes: options.yes,
        });
      } catch (error) {
        console.error('❌ Failed to apply configuration:', 
          error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // Validate
  swarmctl
    .command('validate')
    .description('Validate a configuration file')
    .argument('<file>', 'Path to configuration file')
    .option('--strict', 'Enable strict validation')
    .action(async (file, options) => {
      try {
        await validateConfigFile(file, {
          strict: options.strict,
        });
      } catch (error) {
        console.error('❌ Validation failed:', 
          error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // Diff
  swarmctl
    .command('diff')
    .description('Show differences between config and running swarm')
    .argument('<file>', 'Path to configuration file')
    .option('--swarm-id <id>', 'Specific swarm ID to compare')
    .action(async (file, options) => {
      try {
        await diffConfig(file, {
          swarmId: options.swarmId,
        });
      } catch (error) {
        console.error('❌ Diff failed:', 
          error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}
