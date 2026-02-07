/**
 * State Command
 * 
 * CLI commands for monitoring and managing agent states.
 * Uses the existing state machine implementation from loop/state-machine.
 */

import { Command } from 'commander';
import { logger } from '../../utils/logger';
import { 
  StatefulAgentRegistry, 
  AgentStateMachine, 
  AgentState,
  AGENT_STATES,
  InvalidTransitionError 
} from '../../loop/state-machine';
import { memoryStore } from '../../storage/memory';
import { InMemoryStateStorage } from '../../loop/state-machine';

// ============================================================================
// STATE COLORS (ANSI escape codes)
// ============================================================================

const stateColors: Record<string, (s: string) => string> = {
  idle: (s) => `\x1b[32m${s}\x1b[0m`,      // green
  busy: (s) => `\x1b[33m${s}\x1b[0m`,      // yellow
  paused: (s) => `\x1b[34m${s}\x1b[0m`,    // blue
  error: (s) => `\x1b[31m${s}\x1b[0m`,     // red
  initializing: (s) => `\x1b[36m${s}\x1b[0m`, // cyan
  stopping: (s) => `\x1b[35m${s}\x1b[0m`,  // magenta
  stopped: (s) => `\x1b[90m${s}\x1b[0m`,   // gray
  created: (s) => `\x1b[37m${s}\x1b[0m`,   // white
  unknown: (s) => `\x1b[37m${s}\x1b[0m`    // white
};

const stateIndicators: Record<string, string> = {
  idle: '●',
  busy: '◐',
  paused: '⏸',
  error: '✖',
  initializing: '⟳',
  stopping: '⏹',
  stopped: '○',
  created: '○',
  unknown: '?'
};

// ============================================================================
// REGISTRY INSTANCE
// ============================================================================

let globalRegistry: StatefulAgentRegistry | null = null;

function getGlobalRegistry(): StatefulAgentRegistry {
  if (!globalRegistry) {
    const storage = new InMemoryStateStorage();
    globalRegistry = new StatefulAgentRegistry(storage);
  }
  return globalRegistry;
}

// ============================================================================
// REGISTER STATE COMMANDS
// ============================================================================

export function registerStateCommands(program: Command): void {
  const state = program
    .command('state')
    .description('Monitor and manage agent states');

  // ============================================================================
  // state list
  // ============================================================================
  state
    .command('list')
    .description('List all agents with their states')
    .option('--json', 'Output as JSON')
    .option('--filter <state>', 'Filter by state')
    .option('--compact', 'Compact output')
    .action(async (options) => {
      try {
        // Get agents from memory store
        const agents = Object.values(memoryStore.agents || {});

        if (agents.length === 0) {
          logger.info('📭 No agents found');
          logger.info('💡 Use "swarmctl agents spawn" to create agents');
          return;
        }

        // Filter by state if requested
        let filteredAgents = agents;
        if (options.filter) {
          filteredAgents = agents.filter((a: any) => {
            return a.lifecycleState === options.filter || a.status === options.filter;
          });
        }

        if (options.json) {
          const output = filteredAgents.map((a: any) => ({
            id: a.id,
            name: a.label || a.name,
            state: a.lifecycleState || a.status,
            status: a.status,
            load: a.currentLoad || 0,
            model: a.model
          }));
          logger.info(JSON.stringify(output, null, 2));
          return;
        }

        if (options.compact) {
          // Compact table format
          logger.info('\n🤖 Agent States:\n');
          
          for (const agent of filteredAgents) {
            const agentAny = agent as any;
            const agentState = agentAny.lifecycleState || agentAny.status || 'unknown';
            const color = stateColors[agentState] || stateColors['unknown'];
            const indicator = stateIndicators[agentState] || '?';

            logger.info(
              `${color(indicator)} ${agentAny.id.slice(0, 22).padEnd(24)} ` +
              `${color(agentState.padEnd(12))} ` +
              `load: ${((agentAny.currentLoad || 0) * 100).toFixed(0).padStart(3)}% ` +
              `${(agentAny.model || 'unknown').slice(0, 15)}`
            );
          }
          
          logger.info(`\n📊 Total: ${filteredAgents.length} agents`);
          return;
        }

        // Full table format
        logger.info('\n🤖 Agent States:\n');
        logger.info('ID                       Name                 State        Load    Model           Status');
        logger.info('─'.repeat(95));

        for (const agent of filteredAgents) {
          const agentAny = agent as any;
          const agentState = agentAny.lifecycleState || agentAny.status || 'unknown';
          const color = stateColors[agentState] || stateColors['unknown'];
          const indicator = stateIndicators[agentState] || '?';

          logger.info(
            `${color(indicator)} ${agentAny.id.slice(0, 22).padEnd(22)} ` +
            `${(agentAny.label || agentAny.name || '-').slice(0, 20).padEnd(20)} ` +
            `${color(agentState.padEnd(12))} ` +
            `${((agentAny.currentLoad || 0) * 100).toFixed(0).padStart(3)}%   ` +
            `${(agentAny.model || 'unknown').slice(0, 15).padEnd(15)} ` +
            `${agentAny.status}`
          );
        }

        logger.info('─'.repeat(95));
        logger.info(`📊 Total: ${filteredAgents.length} agents`);

      } catch (error) {
        logger.error('❌ Failed to list agent states:', error instanceof Error ? error.message : String(error));
        process.exit(3);
      }
    });

  // ============================================================================
  // state show
  // ============================================================================
  state
    .command('show <agent-id>')
    .description('Show detailed state for an agent')
    .option('--history', 'Show state history')
    .option('--json', 'Output as JSON')
    .option('--diagram', 'Show state diagram')
    .action(async (agentId, options) => {
      try {
        const agent = (memoryStore.agents || {})[agentId];
        
        if (!agent) {
          logger.error(`❌ Agent ${agentId} not found`);
          process.exit(2);
        }

        const agentAny = agent as any;

        if (options.json) {
          const output = {
            agent: {
              id: agentAny.id,
              name: agentAny.label || agentAny.name,
              model: agentAny.model,
              status: agentAny.status,
              load: agentAny.currentLoad || 0,
              createdAt: agentAny.spawnedAt || agentAny.createdAt,
              lastActivity: agentAny.lastActivity || agentAny.spawnedAt
            },
            state: {
              current: agentAny.lifecycleState || agentAny.status,
              timeInState: agentAny.stateEntryTime 
                ? Date.now() - agentAny.stateEntryTime 
                : 0
            }
          };
          logger.info(JSON.stringify(output, null, 2));
          return;
        }

        // Render agent state info
        const agentState = agentAny.lifecycleState || agentAny.status || 'unknown';
        const color = stateColors[agentState] || stateColors['unknown'];
        const icon = stateIndicators[agentState] || '?';
        
        logger.info(`\n🤖 Agent: ${agentId}\n`);
        logger.info(`Current State: ${color}${icon} ${agentState}${'\x1b[0m'}`);
        
        if (agentAny.stateEntryTime) {
          const duration = Date.now() - agentAny.stateEntryTime;
          logger.info(`Time in State: ${formatDuration(duration)}`);
        }
        
        logger.info(`Status: ${agentAny.status}`);
        logger.info(`Model: ${agentAny.model}`);
        
        if (agentAny.task) {
          logger.info(`Task: ${agentAny.task.slice(0, 50)}${agentAny.task.length > 50 ? '...' : ''}`);
        }

        // Show state diagram if requested
        if (options.diagram) {
          logger.info('\n📊 State Diagram:');
          logger.info(renderStateDiagram(agentState));
        }

      } catch (error) {
        logger.error('❌ Failed to show agent state:', error instanceof Error ? error.message : String(error));
        process.exit(3);
      }
    });

  // ============================================================================
  // state transition
  // ============================================================================
  state
    .command('transition <agent-id> <to-state>')
    .description('Manually transition agent state')
    .option('--force', 'Force transition (skip guards)')
    .option('--reason <reason>', 'Reason for transition')
    .action(async (agentId, toState, options) => {
      try {
        // Validate state
        if (!AGENT_STATES.includes(toState as AgentState)) {
          logger.error(`❌ Invalid state: ${toState}`);
          logger.info(`Valid states: ${AGENT_STATES.join(', ')}`);
          process.exit(2);
        }

        // Get registry and transition
        const registry = getGlobalRegistry();
        const sm = registry.getStateMachine(agentId);

        if (!sm) {
          logger.error(`❌ Agent ${agentId} not found in state registry`);
          process.exit(2);
        }

        // Check if transition is allowed
        if (!options.force && !sm.canTransition(toState)) {
          logger.error(`❌ Cannot transition from ${sm.state} to ${toState}`);
          logger.info(`Allowed transitions: ${sm.getAllowedTransitions().join(', ') || 'none'}`);
          process.exit(2);
        }

        logger.info(`⏳ Transitioning ${agentId.slice(0, 16)}... to ${toState}...`);
        
        try {
          await sm.transition(toState, options.reason || 'manual_transition');
          logger.info(`✓ Transitioned to ${toState}`);
        } catch (error) {
          if (error instanceof InvalidTransitionError) {
            logger.error(`❌ Invalid transition: ${error.message}`);
          } else {
            throw error;
          }
        }

      } catch (error) {
        logger.error('❌ Transition failed:', error instanceof Error ? error.message : String(error));
        process.exit(3);
      }
    });

  // ============================================================================
  // state pause
  // ============================================================================
  state
    .command('pause <agent-id>')
    .description('Pause an agent')
    .action(async (agentId) => {
      try {
        const registry = getGlobalRegistry();
        const sm = registry.getStateMachine(agentId);
        
        if (!sm) {
          logger.error(`❌ Agent ${agentId} not found`);
          process.exit(2);
        }

        if (sm.state !== 'idle' && sm.state !== 'busy') {
          logger.error(`❌ Cannot pause agent in ${sm.state} state`);
          process.exit(2);
        }

        await sm.transition('paused', 'manual_pause');
        logger.info(`✓ Agent ${agentId.slice(0, 16)}... paused`);
      } catch (error) {
        logger.error('❌ Failed to pause agent:', error instanceof Error ? error.message : String(error));
        process.exit(3);
      }
    });

  // ============================================================================
  // state resume
  // ============================================================================
  state
    .command('resume <agent-id>')
    .description('Resume a paused agent')
    .action(async (agentId) => {
      try {
        const registry = getGlobalRegistry();
        const sm = registry.getStateMachine(agentId);
        
        if (!sm) {
          logger.error(`❌ Agent ${agentId} not found`);
          process.exit(2);
        }

        if (sm.state !== 'paused') {
          logger.error(`❌ Cannot resume agent in ${sm.state} state (must be paused)`);
          process.exit(2);
        }

        await sm.transition('idle', 'manual_resume');
        logger.info(`✓ Agent ${agentId.slice(0, 16)}... resumed`);
      } catch (error) {
        logger.error('❌ Failed to resume agent:', error instanceof Error ? error.message : String(error));
        process.exit(3);
      }
    });

  // ============================================================================
  // state stop
  // ============================================================================
  state
    .command('stop <agent-id>')
    .description('Stop an agent')
    .option('--force', 'Force stop without confirmation')
    .action(async (agentId, options) => {
      try {
        const agent = (memoryStore.agents || {})[agentId];
        
        if (!agent) {
          logger.error(`❌ Agent ${agentId} not found`);
          process.exit(2);
        }

        const registry = getGlobalRegistry();
        const sm = registry.getStateMachine(agentId);

        if (!options.force) {
          logger.info(`⚠️  About to stop agent: ${agentId}`);
          logger.info(`   Current State: ${sm?.state || 'unknown'}`);
          logger.info(`   Name: ${(agent as any).label || (agent as any).name || 'Unnamed'}`);
          logger.info('\n🛑 Use --force to confirm stop');
          return;
        }

        logger.info(`⏳ Stopping agent ${agentId.slice(0, 16)}...`);
        
        if (sm && sm.canTransition('stopping')) {
          await sm.transition('stopping', 'manual_stop');
          await sm.transition('stopped', 'stop_complete');
          logger.info(`✓ Agent stopped`);
        } else {
          // Fallback: update memory store directly
          (agent as any).status = 'stopped';
          logger.info(`✓ Agent marked as stopped`);
        }
      } catch (error) {
        logger.error('❌ Failed to stop agent:', error instanceof Error ? error.message : String(error));
        process.exit(3);
      }
    });

  // ============================================================================
  // state watch
  // ============================================================================
  state
    .command('watch')
    .description('Watch state changes in real-time')
    .option('--agent <id>', 'Watch specific agent')
    .option('--interval <ms>', 'Refresh interval in ms', '1000')
    .action(async (options) => {
      try {
        logger.info('\n👀 Watching state changes... (Ctrl+C to exit)\n');
        logger.info('Time       Agent ID          Transition');
        logger.info('─────────  ────────────────  ───────────────────');

        let lastStates = new Map<string, string>();

        // Handle Ctrl+C gracefully
        process.on('SIGINT', () => {
          logger.info('\n\n👋 Stopped watching');
          process.exit(0);
        });

        // Watch loop
        const watch = async () => {
          const agents = memoryStore.agents || {};
          
          for (const [agentId, agent] of Object.entries(agents)) {
            if (options.agent && agentId !== options.agent) continue;
            
            const agentAny = agent as any;
            const currentState = agentAny.lifecycleState || agentAny.status;
            const previousState = lastStates.get(agentId);
            
            if (previousState && previousState !== currentState) {
              const time = new Date().toLocaleTimeString();
              const shortId = agentId.slice(0, 16);
              const prevColor = stateColors[previousState] || stateColors['unknown'];
              const currColor = stateColors[currentState] || stateColors['unknown'];
              const prevIcon = stateIndicators[previousState] || '?';
              const currIcon = stateIndicators[currentState] || '?';
              
              logger.info(
                `${time}  ${shortId.padEnd(16)}  ` +
                `${prevColor(prevIcon)} ${previousState.padEnd(10)} → ` +
                `${currColor(currIcon)} ${currColor(currentState)}${'\x1b[0m'}`
              );
            }
            
            lastStates.set(agentId, currentState);
          }
        };

        // Initial capture
        await watch();
        
        // Periodic check
        setInterval(watch, parseInt(options.interval, 10));

      } catch (error) {
        logger.error('❌ Watch failed:', error instanceof Error ? error.message : String(error));
        process.exit(3);
      }
    });

  // ============================================================================
  // state diagram
  // ============================================================================
  state
    .command('diagram')
    .description('Display state machine diagram')
    .option('--transitions', 'Show transition table')
    .action(async (options) => {
      try {
        if (options.transitions) {
          logger.info('\n📋 State Transition Table:\n');
          logger.info('From State    → To State      Action/Trigger');
          logger.info('────────────  ────────────  ──────────────────');
          
          const transitions = [
            ['created', 'initializing', 'setup'],
            ['initializing', 'idle', 'ready'],
            ['initializing', 'error', 'on failure'],
            ['idle', 'busy', 'canAcceptWork'],
            ['busy', 'idle', 'complete'],
            ['busy', 'error', 'on error'],
            ['idle', 'paused', 'pause'],
            ['busy', 'paused', 'checkpoint'],
            ['paused', 'idle', 'resume'],
            ['paused', 'busy', 'resume work'],
            ['idle', 'stopping', 'shutdown'],
            ['busy', 'stopping', 'save'],
            ['paused', 'stopping', 'stop'],
            ['stopping', 'stopped', 'terminate'],
            ['error', 'stopping', 'cleanup'],
            ['error', 'initializing', 'retry']
          ];
          
          for (const [from, to, action] of transitions) {
            logger.info(`${from.padEnd(12)} → ${to.padEnd(12)} ${action}`);
          }
          return;
        }

        logger.info('\n📊 Agent State Machine Diagram:\n');
        logger.info(renderStateDiagram());
        
        logger.info('\nLegend:');
        logger.info('  ┌─ State boxes ─┐');
        logger.info('  │  ─> = normal  │');
        logger.info('  │  └> = error   │');
        logger.info('  └───────────────┘');

      } catch (error) {
        logger.error('❌ Failed to render diagram:', error instanceof Error ? error.message : String(error));
        process.exit(3);
      }
    });

  // ============================================================================
  // state stats
  // ============================================================================
  state
    .command('stats')
    .description('Show state statistics')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const agents = Object.values(memoryStore.agents || {});
        
        const counts: Record<string, number> = {};
        for (const state of AGENT_STATES) {
          counts[state] = 0;
        }
        
        for (const agent of agents) {
          const agentAny = agent as any;
          const state = agentAny.lifecycleState || agentAny.status;
          if (state && counts[state] !== undefined) {
            counts[state]++;
          }
        }

        if (options.json) {
          logger.info(JSON.stringify({
            totalAgents: agents.length,
            agentsByState: counts
          }, null, 2));
          return;
        }

        logger.info('\n📊 State Statistics\n');
        logger.info('═'.repeat(40));
        logger.info(`Total Agents: ${agents.length}`);
        logger.info('');
        logger.info('Agents by State:');
        
        for (const [state, count] of Object.entries(counts)) {
          if (count > 0) {
            const color = stateColors[state] || stateColors['unknown'];
            const icon = stateIndicators[state] || '?';
            const bar = '█'.repeat(Math.min(count, 20));
            logger.info(`  ${color(icon)}${'\x1b[0m'} ${state.padEnd(12)} ${bar} ${count}`);
          }
        }

        logger.info('═'.repeat(40));

      } catch (error) {
        logger.error('❌ Failed to get stats:', error instanceof Error ? error.message : String(error));
        process.exit(3);
      }
    });
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

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

function renderStateDiagram(currentState?: string): string {
  const states: Array<[string, number, number]> = [
    ['created', 2, 1],
    ['initializing', 18, 1],
    ['idle', 36, 1],
    ['busy', 36, 6],
    ['paused', 54, 3],
    ['error', 18, 6],
    ['stopping', 36, 11],
    ['stopped', 54, 11]
  ];

  const lines: string[] = [];
  const height = 14;
  const width = 70;
  
  // Create empty canvas
  const canvas: string[][] = [];
  for (let y = 0; y < height; y++) {
    canvas[y] = new Array(width).fill(' ');
  }

  // Draw connections
  const connections: Array<[number, number, number, number]> = [
    [2, 1, 18, 1],      // created -> initializing
    [18, 1, 36, 1],     // initializing -> idle
    [18, 1, 18, 6],     // initializing -> error
    [36, 1, 36, 6],     // idle -> busy
    [36, 6, 36, 1],     // busy -> idle
    [36, 6, 18, 6],     // busy -> error
    [36, 1, 54, 3],     // idle -> paused
    [36, 6, 54, 3],     // busy -> paused
    [54, 3, 36, 1],     // paused -> idle
    [54, 3, 36, 6],     // paused -> busy
    [36, 1, 36, 11],    // idle -> stopping
    [54, 3, 54, 11],    // paused -> stopping
    [36, 11, 54, 11],   // stopping -> stopped
    [18, 6, 36, 11],    // error -> stopping
    [18, 6, 18, 1],     // error -> initializing
  ];

  // Draw simple connections with arrows
  for (const [x1, y1, x2, y2] of connections) {
    const midX = Math.floor((x1 + x2) / 2);
    const midY = Math.floor((y1 + y2) / 2);
    
    if (y1 === y2) {
      // Horizontal
      for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
        if (canvas[y1] && canvas[y1][x] === ' ') canvas[y1][x] = '─';
      }
      canvas[y1][x2 - 1] = '>';
    } else if (x1 === x2) {
      // Vertical
      for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
        if (canvas[y] && canvas[y][x1] === ' ') canvas[y][x1] = '│';
      }
      canvas[y2 - 1][x1] = '▼';
    } else {
      // L-shaped
      for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
        if (canvas[y1] && canvas[y1][x] === ' ') canvas[y1][x] = '─';
      }
      for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
        if (canvas[y] && canvas[y][x2] === ' ') canvas[y][x2] = '│';
      }
      if (x2 > x1) {
        canvas[y1][x2 - 1] = '>';
      }
      if (y2 > y1) {
        canvas[y2 - 1][x2] = '▼';
      }
    }
  }

  // Draw state boxes
  for (const [state, x, y] of states) {
    const isCurrent = state === currentState;
    const boxWidth = state.length + 4;
    const border = isCurrent ? '█' : '─';
    
    // Top
    canvas[y][x] = '┌';
    for (let i = 1; i < boxWidth - 1; i++) canvas[y][x + i] = border;
    canvas[y][x + boxWidth - 1] = '┐';
    
    // Middle
    canvas[y + 1][x] = isCurrent ? '█' : '│';
    canvas[y + 1][x + 1] = ' ';
    for (let i = 0; i < state.length; i++) canvas[y + 1][x + 2 + i] = state[i];
    canvas[y + 1][x + boxWidth - 2] = ' ';
    canvas[y + 1][x + boxWidth - 1] = isCurrent ? '█' : '│';
    
    // Bottom
    canvas[y + 2][x] = '└';
    for (let i = 1; i < boxWidth - 1; i++) canvas[y + 2][x + i] = border;
    canvas[y + 2][x + boxWidth - 1] = '┘';
    
    if (isCurrent) {
      canvas[y - 1][x + Math.floor(boxWidth / 2)] = '▼';
    }
  }

  // Convert to string
  for (const row of canvas) {
    lines.push(row.join(''));
  }

  return lines.join('\n');
}
