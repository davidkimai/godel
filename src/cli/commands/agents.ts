/**
 * Agent Management Commands
 * 
 * Commands: list, status, spawn, kill, pause, resume, watch, logs, health
 * 
 * Uses the MemoryStore for agent persistence
 */

import { Command } from 'commander';

import { AgentStatus } from '../../models/index';
import { memoryStore } from '../../storage';
import { logger } from '../../utils/logger';
import { formatAgents, formatAgent } from '../formatters';
import { validateFormat, handleError, globalFormat } from '../main';

import type { Agent} from '../../models/index';

// Helper function to format duration
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

export function agentsCommand(): Command {
  const program = new Command('agents');
  
  program
    .description('Manage agents in the system')
    .alias('agent');
  
  // agents list
  program
    .command('list')
    .alias('ls')
    .description('List all agents')
    .option('--group <swarm|hierarchy>', 'Group agents by swarm or hierarchy')
    .option('--filter <status>', 'Filter by status (running, paused, completed, failed)')
    .action(function(options: { format: string; filter?: string }) {
      const format = validateFormat(globalFormat);
      
      try {
        const agents = memoryStore.agents.list();
        
        // Apply status filter if provided
        const filtered = options.filter
          ? agents.filter((a: { status: string }) => a.status === options.filter)
          : agents;
        
        // Sort by spawnedAt descending (newest first)
        filtered.sort((a: Agent, b: Agent) => b.spawnedAt.getTime() - a.spawnedAt.getTime());
        
        logger.info(formatAgents(filtered, format));
      } catch (error) {
        handleError(error);
      }
    });
  
  // agents status
  program
    .command('status <agent-id>')
    .alias('info')
    .description('Get status of a specific agent')
    .option('--format <json|table>', 'Output format', 'table')
    .action(async (agentId: string, options: { format: string }) => {
      const format = validateFormat(options.format);
      
      try {
        const agent = memoryStore.agents.get(agentId);
        if (!agent) {
          handleError(`Agent not found: ${agentId}`);
        }
        logger.info(formatAgent(agent, format));
      } catch (error) {
        handleError(error);
      }
    });
  
  // agents watch
  program
    .command('watch <agent-id>')
    .description('Watch agent status in real-time')
    .action(async (agentId: string) => {
      try {
        const agent = memoryStore.agents.get(agentId);
        if (!agent) {
          handleError(`Agent not found: ${agentId}`);
        }
        
        logger.info(`Watching ${agentId}... Press Ctrl+C to exit.`);
        logger.debug('');

        // Initial status line
        const formatTime = (date: Date) =>
          date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        logger.info(`[${formatTime(new Date())}] Status: ${agent.status.toUpperCase()} | Task: ${agent.task}`);
        
        // Poll every 2 seconds
        const interval = setInterval(() => {
          const currentAgent = memoryStore.agents.get(agentId);

          if (!currentAgent) {
            logger.warn(`\n✗ Agent ${agentId} no longer exists`);
            clearInterval(interval);
            process.exit(0);
          }

          const currentStatus = currentAgent.status;

          // Check for terminal states
          if (currentStatus === AgentStatus.COMPLETED) {
            logger.info(`\n✓ Agent ${agentId} completed successfully`);
            clearInterval(interval);
            process.exit(0);
          }

          if (currentStatus === AgentStatus.FAILED || currentStatus === AgentStatus.KILLED) {
            logger.error(`\n✗ Agent ${agentId} ${currentStatus}`);
            if (currentAgent.lastError) {
              logger.error(`  Error: ${currentAgent.lastError}`);
            }
            clearInterval(interval);
            process.exit(0);
          }

          // Show status (every update as per spec)
          const currentTask = currentAgent.task;
          const statusLine = `[${formatTime(new Date())}] Status: ${currentStatus.toUpperCase()} | Task: ${currentTask}`;
          logger.info(statusLine);
        }, 2000);

        // Handle Ctrl+C
        process.on('SIGINT', () => {
          logger.debug('\n\nStopped watching');
          clearInterval(interval);
          process.exit(0);
        });
        
      } catch (error) {
        handleError(error);
      }
    });
  
  // agents logs
  program
    .command('logs <agent-id>')
    .description('Show logs for an agent')
    .option('--follow', '-f', 'Follow log output (like tail -f)')
    .option('--tail <n>', 'Show last n lines', '50')
    .action(async (agentId: string, options: { follow?: boolean; tail?: string }) => {
      try {
        const agent = memoryStore.agents.get(agentId);
        if (!agent) {
          handleError(`Agent not found: ${agentId}`);
        }
        
        const tailNum = parseInt(options.tail || '50', 10);
        
        // Get events for this agent
        const events = memoryStore.events.findByEntity('agent', agentId);
        
        // Apply tail limit
        const recentEvents = events.slice(-tailNum);
        
        // Format and display logs
        const formatTime = (date: Date | string) => {
          const d = new Date(date);
          return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        };
        
        if (recentEvents.length === 0) {
          logger.info(`No logs found for agent ${agentId}`);
          return;
        }

        // Display logs
        for (const event of recentEvents) {
          const payloadStr = JSON.stringify(event.payload);
          logger.info(`[${formatTime(event.timestamp)}] ${event.type}: ${payloadStr}`);
        }

        // Follow mode
        if (options.follow) {
          logger.info(`\nFollowing logs for ${agentId}... Press Ctrl+C to exit.`);
          
          const lastEventId = recentEvents.length > 0 ? recentEvents[recentEvents.length - 1].id : null;
          
          const interval = setInterval(() => {
            const allEvents = memoryStore.events.findByEntity('agent', agentId);
            const newEvents = lastEventId 
              ? allEvents.filter(e => e.id > lastEventId)
              : allEvents;
            
            if (newEvents.length > 0) {
              for (const event of newEvents) {
                const payloadStr = JSON.stringify(event.payload);
                logger.info(`[${formatTime(event.timestamp)}] ${event.type}: ${payloadStr}`);
              }
            }

            // Check if agent still exists
            const currentAgent = memoryStore.agents.get(agentId);
            if (!currentAgent) {
              logger.warn(`\n✗ Agent ${agentId} no longer exists`);
              clearInterval(interval);
              process.exit(0);
            }
            
            // Check for terminal states
            if (currentAgent.status === AgentStatus.COMPLETED || 
                currentAgent.status === AgentStatus.FAILED ||
                currentAgent.status === AgentStatus.KILLED) {
              clearInterval(interval);
              // Don't exit in follow mode, just stop following
            }
          }, 1000);
          
          process.on('SIGINT', () => {
            logger.debug('\n\nStopped following logs');
            clearInterval(interval);
            process.exit(0);
          });
        }
        
      } catch (error) {
        handleError(error);
      }
    });
  
  // agents health
  program
    .command('health <agent-id>')
    .description('Check agent health status')
    .option('--format <json|table>', 'Output format', 'table')
    .action(async (agentId: string, options: { format: string }) => {
      const format = validateFormat(options.format);
      
      try {
        const agent = memoryStore.agents.get(agentId);
        if (!agent) {
          handleError(`Agent not found: ${agentId}`);
        }
        
        // Calculate health metrics
        const now = new Date();
        const runtime = agent.status === AgentStatus.RUNNING 
          ? now.getTime() - agent.spawnedAt.getTime() + agent.runtime
          : agent.runtime;
        
        // Get last activity from events
        const events = memoryStore.events.findByEntity('agent', agentId);
        const lastEvent = events[events.length - 1];
        const lastActivity = lastEvent?.timestamp ?? agent.spawnedAt;
        
        // Count errors (events with failed status)
        const errorEvents = events.filter(e => 
          e.type === 'agent.failed' || 
          (agent.lastError && e.timestamp > new Date(Date.now() - 3600000))
        );
        const errorCount = errorEvents.length + (agent.retryCount || 0);
        
        // Context usage percentage
        const contextUsage = agent.context.contextWindow > 0
          ? (agent.context.contextSize / agent.context.contextWindow) * 100
          : 0;
        
        // Calculate health score (0-1)
        let healthScore = 1.0;
        
        // Deduct for errors
        healthScore -= Math.min(errorCount * 0.1, 0.3);
        
        // Deduct for high context usage
        if (contextUsage > 80) healthScore -= 0.1;
        if (contextUsage > 90) healthScore -= 0.1;
        
        // Deduct for stale activity (no activity in last 5 minutes while running)
        if (agent.status === AgentStatus.RUNNING) {
          const inactiveTime = now.getTime() - new Date(lastActivity).getTime();
          if (inactiveTime > 300000) healthScore -= 0.1;
          if (inactiveTime > 600000) healthScore -= 0.1;
        }
        
        // Ensure health score is between 0 and 1
        healthScore = Math.max(0, Math.min(1, healthScore));
        
        const healthData = {
          agentId: agent.id,
          status: agent.status,
          runtime: runtime,
          lastActivity: lastActivity.toISOString(),
          contextUsage: Math.round(contextUsage * 10) / 10,
          errorCount: errorCount,
          healthScore: Math.round(healthScore * 100) / 100
        };
        
        if (format === 'json') {
          logger.info(JSON.stringify(healthData, null, 2));
        } else {
          const statusEmoji = healthScore >= 0.8 ? '✓' : healthScore >= 0.5 ? '⚠' : '✗';
          logger.info(`Agent Health: ${statusEmoji}`);
          logger.info(`  Agent ID:      ${healthData.agentId}`);
          logger.info(`  Status:        ${healthData.status.toUpperCase()}`);
          logger.info(`  Runtime:       ${formatDuration(runtime)}`);
          logger.info(`  Last Activity: ${new Date(lastActivity).toLocaleString()}`);
          logger.info(`  Context Usage: ${healthData.contextUsage}%`);
          logger.info(`  Error Count:   ${healthData.errorCount}`);
          logger.info(`  Health Score:  ${(healthData.healthScore * 100).toFixed(0)}%`);
        }
        
      } catch (error) {
        handleError(error);
      }
    });
  
  // agents spawn
  program
    .command('spawn <task>')
    .description('Spawn a new agent to execute a task')
    .option('--model <model>', 'Model to use (e.g., kimik2.5, claude-sonnet)', 'kimik2.5')
    .option('--label <label>', 'Human-readable label for the agent')
    .option('--swarm <swarm-id>', 'Swarm ID to join')
    .action(async (task: string, options: { model?: string; label?: string; swarm?: string }) => {
      const format = validateFormat(globalFormat);
      
      try {
        // Create agent using the factory function from models
        const { createAgent } = await import('../../models/agent');
        
        const agent = createAgent({
          task,
          model: options.model || 'kimik2.5',
          label: options.label,
          swarmId: options.swarm
        });
        
        memoryStore.agents.create(agent);

        // Emit spawn event
        const { createEvent } = await import('../../models/event');
        const event = createEvent({
          type: 'agent.spawned',
          entityType: 'agent',
          entityId: agent.id,
          payload: { task, model: options.model, label: options.label, swarmId: options.swarm }
        });
        memoryStore.events.create(event);

        logger.info(formatAgent(agent, format));
      } catch (error) {
        handleError(error);
      }
    });
  
  // agents kill
  program
    .command('kill <agent-id>')
    .description('Terminate a running agent')
    .action(async (agentId: string) => {
      const format = validateFormat(globalFormat);
      
      try {
        const agent = memoryStore.agents.get(agentId);
        if (!agent) {
          handleError(`Agent not found: ${agentId}`);
        }
        
        memoryStore.agents.update(agentId, { 
          status: AgentStatus.KILLED,
          completedAt: new Date()
        });
        
        // Emit kill event
        const { createEvent } = await import('../../models/event');
        const event = createEvent({
          type: 'agent.killed',
          entityType: 'agent',
          entityId: agentId,
          payload: { reason: 'manual' }
        });
        memoryStore.events.create(event);
        
        const updatedAgent = memoryStore.agents.get(agentId)!;
        logger.info(formatAgent(updatedAgent, format));
        logger.info(`\n✓ Agent ${agentId} terminated`);
      } catch (error) {
        handleError(error);
      }
    });
  
  // agents pause
  program
    .command('pause <agent-id>')
    .description('Pause a running agent')
    .option('--reason <reason>', 'Reason for pausing')
    .action(async (agentId: string, options: { reason?: string }) => {
      try {
        const agent = memoryStore.agents.get(agentId);
        if (!agent) {
          handleError(`Agent not found: ${agentId}`);
        }
        
        if (agent.status === AgentStatus.PAUSED) {
          handleError(`Agent ${agentId} is already paused`);
        }
        
        if (agent.status !== AgentStatus.RUNNING && agent.status !== AgentStatus.PENDING) {
          handleError(`Cannot pause agent in ${agent.status} status`);
        }
        
        // Save pause state
        memoryStore.agents.update(agentId, { 
          status: AgentStatus.PAUSED,
          pauseTime: new Date(),
          pausedBy: 'cli' // Could be extended to track user
        });
        
        // Emit pause event
        const { getGlobalEmitter } = await import('../../events/emitter');
        getGlobalEmitter().emitAgentPaused(agentId, options.reason);

        const updatedAgent = memoryStore.agents.get(agentId)!;
        logger.info(`✓ Agent ${agentId} paused at ${updatedAgent.pauseTime?.toISOString()}`);
      } catch (error) {
        handleError(error);
      }
    });
  
  // agents resume
  program
    .command('resume <agent-id>')
    .description('Resume a paused agent')
    .action(async (agentId: string) => {
      try {
        const agent = memoryStore.agents.get(agentId);
        if (!agent) {
          handleError(`Agent not found: ${agentId}`);
        }
        
        if (agent.status !== AgentStatus.PAUSED) {
          handleError(`Agent ${agentId} is not paused (current status: ${agent.status})`);
        }
        
        // Restore agent state
        memoryStore.agents.update(agentId, { 
          status: AgentStatus.RUNNING,
          pauseTime: undefined,
          pausedBy: undefined,
          completedAt: undefined
        });
        
        // Emit resume event
        const { getGlobalEmitter } = await import('../../events/emitter');
        getGlobalEmitter().emitAgentResumed(agentId);

        logger.info(`✓ Agent ${agentId} resumed`);
      } catch (error) {
        handleError(error);
      }
    });
  
  // agents retry
  program
    .command('retry <agent-id>')
    .description('Retry a failed agent')
    .option('--skip-backoff', 'Skip exponential backoff delay')
    .option('--focus <fix>', 'Focus on specific fix')
    .action(async (agentId: string, options: { skipBackoff?: boolean; focus?: string }) => {
      try {
        const agent = memoryStore.agents.get(agentId);
        if (!agent) {
          handleError(`Agent not found: ${agentId}`);
        }
        
        if (agent.status === AgentStatus.RUNNING) {
          handleError(`Agent ${agentId} is still running, cannot retry`);
        }
        
        // Check retry limits
        if (agent.retryCount >= agent.maxRetries) {
          handleError(`Agent ${agentId} has exceeded max retries (${agent.maxRetries})`);
        }
        
        // Reset agent for retry
        const newRetryCount = options.skipBackoff ? agent.retryCount : agent.retryCount + 1;
        memoryStore.agents.update(agentId, {
          status: AgentStatus.PENDING,
          retryCount: newRetryCount,
          lastError: undefined, // Clear the last error
          completedAt: undefined,
          spawnedAt: new Date() // Reset spawn time for new attempt
        });
        
        // Emit spawned event (retry is essentially a new spawn)
        const { getGlobalEmitter } = await import('../../events/emitter');
        getGlobalEmitter().emit('agent.spawned', {
          agentId,
          label: agent.label,
          model: agent.model,
          task: agent.task,
          retryCount: newRetryCount,
          skipBackoff: options.skipBackoff,
          focus: options.focus
        }, { agentId });

        logger.info(`✓ Agent ${agentId} retry initiated (attempt ${newRetryCount}/${agent.maxRetries})`);
      } catch (error) {
        handleError(error);
      }
    });
  
  // agents abort
  program
    .command('abort <agent-id>')
    .description('Abort agent and mark as failed')
    .action(async (agentId: string) => {
      try {
        const agent = memoryStore.agents.get(agentId);
        if (!agent) {
          handleError(`Agent not found: ${agentId}`);
        }
        
        memoryStore.agents.update(agentId, {
          status: AgentStatus.FAILED,
          completedAt: new Date()
        });
        
        // Emit abort event
        const { createEvent } = await import('../../models/event');
        const event = createEvent({
          type: 'agent.failed',
          entityType: 'agent',
          entityId: agentId,
          payload: { reason: 'aborted' }
        });
        memoryStore.events.create(event);

        logger.info(`✓ Agent ${agentId} aborted`);
      } catch (error) {
        handleError(error);
      }
    });
  
  return program;
}

export default agentsCommand;
