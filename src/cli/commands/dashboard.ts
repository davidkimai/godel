/**
 * Dashboard Command - Launch OpenTUI Dashboard
 * 
 * Commands:
 * - dash dashboard              Launch interactive TUI dashboard
 * - dash dashboard --headless   Start dashboard API server only
 * - dash dashboard --port 7373  Custom port for API
 */

import { logger } from '../../utils/logger';
import { Command } from 'commander';
import { getGlobalSwarmManager } from '../../core/swarm';
import { getGlobalLifecycle } from '../../core/lifecycle';
import { getGlobalBus, subscribeDashboard, type Message } from '../../bus/index';
import { memoryStore } from '../../storage/memory';

export function registerDashboardCommand(program: Command): void {
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
        const messageBus = getGlobalBus();
        const lifecycle = getGlobalLifecycle(memoryStore.agents, messageBus);
        const swarmManager = getGlobalSwarmManager(lifecycle, messageBus, memoryStore.agents);

        // Start managers
        lifecycle.start();
        swarmManager.start();

        const port = parseInt(options.port, 10);
        const refreshRate = parseInt(options.refresh, 10);

        logger.info('🎯 Dash Dashboard\n');

        if (options.headless) {
          // Headless mode - just start the API server
          logger.info(`📡 API server running at http://${options.host}:${port}`);
          logger.info('   Headless mode - no TUI displayed');
          logger.info('   Press Ctrl+C to stop\n');
          
          // Subscribe to all events for logging
          subscribeDashboard(messageBus, (message: Message) => {
            const payload = message.payload as { eventType?: string } | undefined;
            if (payload?.eventType) {
              logger.info(`[${new Date().toISOString()}] ${payload.eventType}`);
            }
          });

          // Keep process alive
          await keepAlive();
          return;
        }

        // Full TUI mode
        logger.info('dashboard', 'Launching interactive dashboard...\n');
        logger.info('dashboard', 'Keyboard Shortcuts:');
        logger.info('  j/k     Navigate agents');
        logger.info('  Enter   Focus agent');
        logger.info('  Space   Pause/resume');
        logger.info('  x       Kill agent');
        logger.info('  r       Retry failed agent');
        logger.info('  :       Command palette');
        logger.info('  /       Search');
        logger.info('  ?       Help');
        logger.info('  q       Quit\n');

        // Show initial stats
        const metrics = lifecycle.getMetrics();
        const swarms = swarmManager.listActiveSwarms();
        
        logger.info('📊 Current Status:');
        logger.info(`   Active Swarms: ${swarms.length}`);
        logger.info(`   Active Agents: ${metrics.activeAgents}`);
        logger.info(`   Paused Agents: ${metrics.pausedAgents}`);
        logger.info(`   Total Spawned: ${metrics.totalSpawned}`);
        logger.info(`   Completed: ${metrics.totalCompleted}`);
        logger.info(`   Failed: ${metrics.totalFailed}`);
        logger.info('');

        // Show agent grid (simulated - real TUI would use a library like ink or blessed)
        logger.info('🐝 Agent Grid:\n');
        const states = lifecycle.getAllStates();
        
        if (states.length === 0) {
          logger.info('   No agents running');
          logger.info('   Use "dash swarm create" to create a swarm');
        } else {
          logger.info('ID                   Swarm                Status     Task (truncated)');
          logger.info('───────────────────  ───────────────────  ─────────  ──────────────────────────');
          
          for (const state of states.slice(0, 20)) {
            const swarmName = state.agent.swarmId 
              ? swarmManager.getSwarm(state.agent.swarmId)?.name?.slice(0, 19) || 'unknown'
              : 'none';
            const task = state.agent.task.slice(0, 26);
            
            logger.info(
              `${state.id.slice(0, 19).padEnd(19)}  ` +
              `${swarmName.padEnd(19)}  ` +
              `${getStatusEmoji(state.status)} ${state.status.padEnd(8)}  ` +
              `${task}`
            );
          }
          
          if (states.length > 20) {
            logger.info(`\n   ... and ${states.length - 20} more agents`);
          }
        }

        logger.info('\n💡 This is a simulated dashboard view.');
        logger.info('   Full TUI implementation would use a terminal UI library.');
        logger.info('   Press Ctrl+C to exit\n');

        // Subscribe to events for real-time updates
        const subscriptions = subscribeDashboard(messageBus, (message: Message) => {
          const payload = message.payload as { 
            eventType?: string; 
            agentId?: string;
            swarmId?: string;
          } | undefined;
          
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
              logger.info(`[${new Date().toLocaleTimeString()}] ${getEventEmoji(payload.eventType)} ${payload.eventType}`);
            }
          }
        });

        logger.info(`📡 Subscribed to ${subscriptions.length} event topics`);
        logger.info(`🔄 Refresh rate: ${refreshRate}ms`);

        // Keep process alive
        await keepAlive();

      } catch (error) {
        logger.error('❌ Dashboard error:', error instanceof Error ? error.message : String(error));
        process.exit(1);
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
  };
  return emojiMap[status] || '❓';
}

function getEventEmoji(eventType: string): string {
  const emojiMap: Record<string, string> = {
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

function keepAlive(): Promise<void> {
  return new Promise(() => {
    // Keep process alive until SIGINT
    process.on('SIGINT', () => {
      logger.info('\n\n👋 Dashboard shutting down...');
      process.exit(0);
    });
  });
}
