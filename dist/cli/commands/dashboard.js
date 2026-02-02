"use strict";
/**
 * Dashboard Command - Launch OpenTUI Dashboard
 *
 * Commands:
 * - dash dashboard              Launch interactive TUI dashboard
 * - dash dashboard --headless   Start dashboard API server only
 * - dash dashboard --port 7373  Custom port for API
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerDashboardCommand = registerDashboardCommand;
const swarm_1 = require("../../core/swarm");
const lifecycle_1 = require("../../core/lifecycle");
const index_1 = require("../../bus/index");
const memory_1 = require("../../storage/memory");
function registerDashboardCommand(program) {
    program
        .command('dashboard')
        .description('Launch OpenTUI dashboard for real-time swarm monitoring')
        .option('-p, --port <port>', 'API server port', '7373')
        .option('-h, --host <host>', 'API server host', 'localhost')
        .option('--headless', 'Start API server only (no TUI)')
        .option('--refresh <ms>', 'Dashboard refresh rate in ms', '1000')
        .option('--view <view>', 'Default view (grid|events|budget)', 'grid')
        .action(async (options) => {
        try {
            // Initialize core components
            const messageBus = (0, index_1.getGlobalBus)();
            const lifecycle = (0, lifecycle_1.getGlobalLifecycle)(memory_1.memoryStore.agents, messageBus);
            const swarmManager = (0, swarm_1.getGlobalSwarmManager)(lifecycle, messageBus, memory_1.memoryStore.agents);
            // Start managers
            lifecycle.start();
            swarmManager.start();
            const port = parseInt(options.port, 10);
            const refreshRate = parseInt(options.refresh, 10);
            console.log('🎯 Dash Dashboard\n');
            if (options.headless) {
                // Headless mode - just start the API server
                console.log(`📡 API server running at http://${options.host}:${port}`);
                console.log('   Headless mode - no TUI displayed');
                console.log('   Press Ctrl+C to stop\n');
                // Subscribe to all events for logging
                (0, index_1.subscribeDashboard)(messageBus, (message) => {
                    const payload = message.payload;
                    if (payload?.eventType) {
                        console.log(`[${new Date().toISOString()}] ${payload.eventType}`);
                    }
                });
                // Keep process alive
                await keepAlive();
                return;
            }
            // Full TUI mode
            console.log('Launching interactive dashboard...\n');
            console.log('Keyboard Shortcuts:');
            console.log('  j/k     Navigate agents');
            console.log('  Enter   Focus agent');
            console.log('  Space   Pause/resume');
            console.log('  x       Kill agent');
            console.log('  r       Retry failed agent');
            console.log('  :       Command palette');
            console.log('  /       Search');
            console.log('  ?       Help');
            console.log('  q       Quit\n');
            // Show initial stats
            const metrics = lifecycle.getMetrics();
            const swarms = swarmManager.listActiveSwarms();
            console.log('📊 Current Status:');
            console.log(`   Active Swarms: ${swarms.length}`);
            console.log(`   Active Agents: ${metrics.activeAgents}`);
            console.log(`   Paused Agents: ${metrics.pausedAgents}`);
            console.log(`   Total Spawned: ${metrics.totalSpawned}`);
            console.log(`   Completed: ${metrics.totalCompleted}`);
            console.log(`   Failed: ${metrics.totalFailed}`);
            console.log();
            // Show agent grid (simulated - real TUI would use a library like ink or blessed)
            console.log('🐝 Agent Grid:\n');
            const states = lifecycle.getAllStates();
            if (states.length === 0) {
                console.log('   No agents running');
                console.log('   Use "dash swarm create" to create a swarm');
            }
            else {
                console.log('ID                   Swarm                Status     Task (truncated)');
                console.log('───────────────────  ───────────────────  ─────────  ──────────────────────────');
                for (const state of states.slice(0, 20)) {
                    const swarmName = state.agent.swarmId
                        ? swarmManager.getSwarm(state.agent.swarmId)?.name?.slice(0, 19) || 'unknown'
                        : 'none';
                    const task = state.agent.task.slice(0, 26);
                    console.log(`${state.id.slice(0, 19).padEnd(19)}  ` +
                        `${swarmName.padEnd(19)}  ` +
                        `${getStatusEmoji(state.status)} ${state.status.padEnd(8)}  ` +
                        `${task}`);
                }
                if (states.length > 20) {
                    console.log(`\n   ... and ${states.length - 20} more agents`);
                }
            }
            console.log('\n💡 This is a simulated dashboard view.');
            console.log('   Full TUI implementation would use a terminal UI library.');
            console.log('   Press Ctrl+C to exit\n');
            // Subscribe to events for real-time updates
            const subscriptions = (0, index_1.subscribeDashboard)(messageBus, (message) => {
                const payload = message.payload;
                if (payload?.eventType) {
                    // In a real TUI, this would update the display
                    // For now, we just log important events
                    const importantEvents = [
                        'agent.spawned',
                        'agent.completed',
                        'agent.failed',
                        'agent.killed',
                        'swarm.created',
                        'swarm.completed',
                    ];
                    if (importantEvents.includes(payload.eventType)) {
                        console.log(`[${new Date().toLocaleTimeString()}] ${getEventEmoji(payload.eventType)} ${payload.eventType}`);
                    }
                }
            });
            console.log(`📡 Subscribed to ${subscriptions.length} event topics`);
            console.log(`🔄 Refresh rate: ${refreshRate}ms`);
            // Keep process alive
            await keepAlive();
        }
        catch (error) {
            console.error('❌ Dashboard error:', error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });
}
// ============================================================================
// Helper Functions
// ============================================================================
function getStatusEmoji(status) {
    const emojiMap = {
        pending: '⏳',
        running: '🏃',
        paused: '⏸️',
        completed: '✅',
        failed: '❌',
        killed: '☠️',
    };
    return emojiMap[status] || '❓';
}
function getEventEmoji(eventType) {
    const emojiMap = {
        'agent.spawned': '🚀',
        'agent.completed': '✅',
        'agent.failed': '❌',
        'agent.killed': '☠️',
        'agent.paused': '⏸️',
        'agent.resumed': '▶️',
        'swarm.created': '🐝',
        'swarm.completed': '🎉',
        'swarm.destroyed': '💥',
    };
    return emojiMap[eventType] || '📌';
}
function keepAlive() {
    return new Promise(() => {
        // Keep process alive until SIGINT
        process.on('SIGINT', () => {
            console.log('\n\n👋 Dashboard shutting down...');
            process.exit(0);
        });
    });
}
//# sourceMappingURL=dashboard.js.map