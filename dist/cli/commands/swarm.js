"use strict";
/**
 * Swarm Command - Manage agent swarms
 *
 * Commands:
 * - dash swarm create --name <name> --task <task> [options]
 * - dash swarm destroy <swarm-id> [--force]
 * - dash swarm scale <swarm-id> <target-size>
 * - dash swarm status [swarm-id]
 * - dash swarm list [--active]
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerSwarmCommand = registerSwarmCommand;
const swarm_1 = require("../../core/swarm");
const lifecycle_1 = require("../../core/lifecycle");
const index_1 = require("../../bus/index");
const memory_1 = require("../../storage/memory");
function registerSwarmCommand(program) {
    const swarm = program
        .command('swarm')
        .description('Manage agent swarms');
    // ============================================================================
    // swarm create
    // ============================================================================
    swarm
        .command('create')
        .description('Create a new swarm of agents')
        .requiredOption('-n, --name <name>', 'Swarm name')
        .requiredOption('-t, --task <task>', 'Task description for the swarm')
        .option('-i, --initial-agents <count>', 'Initial number of agents', '5')
        .option('-m, --max-agents <count>', 'Maximum number of agents', '50')
        .option('-s, --strategy <strategy>', 'Swarm strategy (parallel|map-reduce|pipeline|tree)', 'parallel')
        .option('--model <model>', 'Model to use for agents', 'kimi-k2.5')
        .option('-b, --budget <amount>', 'Budget limit (USD)')
        .option('--warning-threshold <percentage>', 'Budget warning threshold (0-100)', '75')
        .option('--critical-threshold <percentage>', 'Budget critical threshold (0-100)', '90')
        .option('--sandbox', 'Enable file sandboxing', true)
        .option('--dry-run', 'Show configuration without creating')
        .action(async (options) => {
        try {
            console.log('🐝 Creating swarm...\n');
            // Validate strategy
            const validStrategies = ['parallel', 'map-reduce', 'pipeline', 'tree'];
            if (!validStrategies.includes(options.strategy)) {
                console.error(`❌ Invalid strategy: ${options.strategy}`);
                console.error(`   Valid strategies: ${validStrategies.join(', ')}`);
                process.exit(2);
            }
            const config = {
                name: options.name,
                task: options.task,
                initialAgents: parseInt(options.initialAgents, 10),
                maxAgents: parseInt(options.maxAgents, 10),
                strategy: options.strategy,
                model: options.model,
            };
            // Add budget if specified
            if (options.budget) {
                const budgetAmount = parseFloat(options.budget);
                if (isNaN(budgetAmount) || budgetAmount <= 0) {
                    console.error('❌ Invalid budget amount');
                    process.exit(2);
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
            // Initialize core components
            const messageBus = (0, index_1.getGlobalBus)();
            const lifecycle = (0, lifecycle_1.getGlobalLifecycle)(memory_1.memoryStore.agents, messageBus);
            const manager = (0, swarm_1.getGlobalSwarmManager)(lifecycle, messageBus, memory_1.memoryStore.agents);
            if (!manager) {
                console.error('❌ Failed to initialize swarm manager');
                process.exit(1);
            }
            manager.start();
            // Create the swarm
            const swarm = await manager.create(config);
            console.log('✅ Swarm created successfully!\n');
            console.log(`   ID: ${swarm.id}`);
            console.log(`   Name: ${swarm.name}`);
            console.log(`   Status: ${swarm.status}`);
            console.log(`   Agents: ${swarm.agents.length}`);
            if (swarm.budget.allocated > 0) {
                console.log(`   Budget: $${swarm.budget.allocated.toFixed(2)} USD`);
            }
            console.log(`\n💡 Use 'dash swarm status ${swarm.id}' to monitor progress`);
        }
        catch (error) {
            console.error('❌ Failed to create swarm:', error instanceof Error ? error.message : String(error));
            process.exit(3);
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
            // Initialize core components
            const messageBus = (0, index_1.getGlobalBus)();
            const lifecycle = (0, lifecycle_1.getGlobalLifecycle)(memory_1.memoryStore.agents, messageBus);
            const manager = (0, swarm_1.getGlobalSwarmManager)(lifecycle, messageBus, memory_1.memoryStore.agents);
            const swarm = manager.getSwarm(swarmId);
            if (!swarm) {
                console.error(`❌ Swarm ${swarmId} not found`);
                process.exit(2);
            }
            console.log(`⚠️  You are about to destroy swarm: ${swarm.name}`);
            console.log(`   ID: ${swarm.id}`);
            console.log(`   Agents: ${swarm.agents.length}`);
            if (!options.yes && !options.force) {
                // In a real implementation, we'd use a prompt library
                console.log('\n🛑 Use --yes to confirm destruction');
                return;
            }
            console.log('\n💥 Destroying swarm...');
            await manager.destroy(swarmId, options.force);
            console.log('✅ Swarm destroyed');
        }
        catch (error) {
            console.error('❌ Failed to destroy swarm:', error instanceof Error ? error.message : String(error));
            process.exit(3);
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
                process.exit(2);
            }
            // Initialize core components
            const messageBus = (0, index_1.getGlobalBus)();
            const lifecycle = (0, lifecycle_1.getGlobalLifecycle)(memory_1.memoryStore.agents, messageBus);
            const manager = (0, swarm_1.getGlobalSwarmManager)(lifecycle, messageBus, memory_1.memoryStore.agents);
            const swarm = manager.getSwarm(swarmId);
            if (!swarm) {
                console.error(`❌ Swarm ${swarmId} not found`);
                process.exit(2);
            }
            const currentSize = swarm.agents.length;
            console.log(`📊 Scaling swarm ${swarm.name}...`);
            console.log(`   Current: ${currentSize} agents`);
            console.log(`   Target: ${target} agents`);
            await manager.scale(swarmId, target);
            const action = target > currentSize ? 'added' : 'removed';
            const delta = Math.abs(target - currentSize);
            console.log(`✅ Scaled successfully (${action} ${delta} agents)`);
        }
        catch (error) {
            console.error('❌ Failed to scale swarm:', error instanceof Error ? error.message : String(error));
            process.exit(3);
        }
    });
    // ============================================================================
    // swarm status
    // ============================================================================
    swarm
        .command('status')
        .description('Get swarm status')
        .argument('[swarm-id]', 'Swarm ID (shows all if omitted)')
        .option('-f, --format <format>', 'Output format (table|json)', 'table')
        .action((swarmId, options) => {
        try {
            // Initialize core components
            const messageBus = (0, index_1.getGlobalBus)();
            const lifecycle = (0, lifecycle_1.getGlobalLifecycle)(memory_1.memoryStore.agents, messageBus);
            const manager = (0, swarm_1.getGlobalSwarmManager)(lifecycle, messageBus, memory_1.memoryStore.agents);
            if (swarmId) {
                // Show specific swarm
                const swarm = manager.getSwarm(swarmId);
                if (!swarm) {
                    console.error(`❌ Swarm ${swarmId} not found`);
                    process.exit(2);
                }
                const status = manager.getStatus(swarmId);
                if (options.format === 'json') {
                    console.log(JSON.stringify({ swarm, status }, null, 2));
                    return;
                }
                console.log(`🐝 Swarm: ${swarm.name}\n`);
                console.log(`   ID:       ${swarm.id}`);
                console.log(`   Status:   ${getStatusEmoji(swarm.status)} ${swarm.status}`);
                console.log(`   Strategy: ${swarm.config.strategy}`);
                console.log(`   Agents:   ${swarm.agents.length} / ${swarm.config.maxAgents}`);
                console.log(`   Progress: ${(status.progress * 100).toFixed(1)}%`);
                if (swarm.budget.allocated > 0) {
                    const consumedPct = (swarm.budget.consumed / swarm.budget.allocated) * 100;
                    console.log(`\n   Budget:`);
                    console.log(`     Allocated: $${swarm.budget.allocated.toFixed(2)}`);
                    console.log(`     Consumed:  $${swarm.budget.consumed.toFixed(2)} (${consumedPct.toFixed(1)}%)`);
                    console.log(`     Remaining: $${swarm.budget.remaining.toFixed(2)}`);
                }
                console.log(`\n   Metrics:`);
                console.log(`     Total:     ${swarm.metrics.totalAgents}`);
                console.log(`     Completed: ${swarm.metrics.completedAgents}`);
                console.log(`     Failed:    ${swarm.metrics.failedAgents}`);
                // Show agent list
                if (swarm.agents.length > 0) {
                    console.log(`\n   Agent List:`);
                    const agentStates = manager.getSwarmAgents(swarmId);
                    for (const state of agentStates.slice(0, 10)) {
                        console.log(`     • ${state.id.slice(0, 16)}... ${getStatusEmoji(state.status)} ${state.status}`);
                    }
                    if (swarm.agents.length > 10) {
                        console.log(`     ... and ${swarm.agents.length - 10} more`);
                    }
                }
            }
            else {
                // Show all swarms
                const swarms = manager.listSwarms();
                if (swarms.length === 0) {
                    console.log('📭 No swarms found');
                    console.log('💡 Use "dash swarm create" to create a swarm');
                    return;
                }
                if (options.format === 'json') {
                    console.log(JSON.stringify(swarms, null, 2));
                    return;
                }
                console.log('🐝 Swarms:\n');
                console.log('ID                   Name                 Status     Agents  Progress  Budget');
                console.log('───────────────────  ───────────────────  ─────────  ──────  ────────  ─────────');
                for (const swarm of swarms) {
                    const status = manager.getStatus(swarm.id);
                    const budgetStr = swarm.budget.allocated > 0
                        ? `$${swarm.budget.remaining.toFixed(0)}/$${swarm.budget.allocated.toFixed(0)}`
                        : 'unlimited';
                    console.log(`${swarm.id.slice(0, 19).padEnd(19)}  ` +
                        `${swarm.name.slice(0, 19).padEnd(19)}  ` +
                        `${getStatusEmoji(swarm.status)} ${swarm.status.padEnd(8)}  ` +
                        `${String(swarm.agents.length).padStart(6)}  ` +
                        `${(status.progress * 100).toFixed(0).padStart(6)}%  ` +
                        `${budgetStr}`);
                }
            }
        }
        catch (error) {
            console.error('❌ Failed to get status:', error instanceof Error ? error.message : String(error));
            process.exit(3);
        }
    });
    // ============================================================================
    // swarm list
    // ============================================================================
    swarm
        .command('list')
        .description('List all swarms')
        .option('-a, --active', 'Show only active swarms')
        .option('-f, --format <format>', 'Output format (table|json)', 'table')
        .action((options) => {
        try {
            // Initialize core components
            const messageBus = (0, index_1.getGlobalBus)();
            const lifecycle = (0, lifecycle_1.getGlobalLifecycle)(memory_1.memoryStore.agents, messageBus);
            const manager = (0, swarm_1.getGlobalSwarmManager)(lifecycle, messageBus, memory_1.memoryStore.agents);
            const swarms = options.active
                ? manager.listActiveSwarms()
                : manager.listSwarms();
            if (swarms.length === 0) {
                console.log('📭 No swarms found');
                return;
            }
            if (options.format === 'json') {
                console.log(JSON.stringify(swarms, null, 2));
                return;
            }
            console.log('🐝 Swarms:\n');
            console.log('ID                   Name                 Status     Agents  Created');
            console.log('───────────────────  ───────────────────  ─────────  ──────  ─────────────────');
            for (const swarm of swarms) {
                const created = swarm.createdAt.toISOString().slice(0, 16).replace('T', ' ');
                console.log(`${swarm.id.slice(0, 19).padEnd(19)}  ` +
                    `${swarm.name.slice(0, 19).padEnd(19)}  ` +
                    `${getStatusEmoji(swarm.status)} ${swarm.status.padEnd(8)}  ` +
                    `${String(swarm.agents.length).padStart(6)}  ` +
                    `${created}`);
            }
        }
        catch (error) {
            console.error('❌ Failed to list swarms:', error instanceof Error ? error.message : String(error));
            process.exit(3);
        }
    });
}
// ============================================================================
// Helper Functions
// ============================================================================
function getStatusEmoji(status) {
    const emojiMap = {
        creating: '🔄',
        active: '✅',
        scaling: '📊',
        paused: '⏸️',
        completed: '🎉',
        failed: '❌',
        destroyed: '💥',
        pending: '⏳',
        running: '🏃',
        killed: '☠️',
    };
    return emojiMap[status] || '❓';
}
//# sourceMappingURL=swarm.js.map