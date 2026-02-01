/**
 * Agent Management Commands
 * 
 * Commands: list, status, spawn, kill, pause, resume
 * 
 * Uses the MemoryStore for agent persistence
 */

import { Command } from 'commander';
import { validateFormat, handleError, globalFormat } from '../main';
import { formatAgents, formatAgent } from '../formatters';
import { Agent, AgentStatus } from '../../models/index';
import { memoryStore } from '../../storage';

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
    .action(function(this: any, options: { format: string; filter?: string }) {
      const format = validateFormat(globalFormat);
      
      try {
        const agents = memoryStore.agents.list();
        
        // Apply status filter if provided
        const filtered = options.filter
          ? agents.filter((a: { status: string }) => a.status === options.filter)
          : agents;
        
        // Sort by spawnedAt descending (newest first)
        filtered.sort((a: Agent, b: Agent) => b.spawnedAt.getTime() - a.spawnedAt.getTime());
        
        console.log(formatAgents(filtered, format));
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
        console.log(formatAgent(agent!, format));
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
    .action(async (task: string, options: { format: string; model?: string; label?: string; swarm?: string }) => {
      const format = validateFormat(options.format);
      
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
        
        console.log(formatAgent(agent, format));
      } catch (error) {
        handleError(error);
      }
    });
  
  // agents kill
  program
    .command('kill <agent-id>')
    .description('Terminate a running agent')
    .action(async (agentId: string, options: { format: string }) => {
      const format = validateFormat(options.format);
      
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
        console.log(formatAgent(updatedAgent, format));
        console.log(`\n✓ Agent ${agentId} terminated`);
      } catch (error) {
        handleError(error);
      }
    });
  
  // agents pause
  program
    .command('pause <agent-id>')
    .description('Pause a running agent')
    .action(async (agentId: string) => {
      try {
        const agent = memoryStore.agents.get(agentId);
        if (!agent) {
          handleError(`Agent not found: ${agentId}`);
        }
        
        memoryStore.agents.update(agentId, { status: AgentStatus.PAUSED });
        
        // Emit pause event
        const { createEvent } = await import('../../models/event');
        const event = createEvent({
          type: 'agent.paused',
          entityType: 'agent',
          entityId: agentId,
          payload: { reason: 'manual' }
        });
        memoryStore.events.create(event);
        
        console.log(`✓ Agent ${agentId} paused`);
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
        
        memoryStore.agents.update(agentId, { 
          status: AgentStatus.RUNNING,
          completedAt: undefined
        });
        
        // Emit resume event
        const { createEvent } = await import('../../models/event');
        const event = createEvent({
          type: 'agent.resumed',
          entityType: 'agent',
          entityId: agentId,
          payload: {}
        });
        memoryStore.events.create(event);
        
        console.log(`✓ Agent ${agentId} resumed`);
      } catch (error) {
        handleError(error);
      }
    });
  
  // agents retry
  program
    .command('retry <agent-id>')
    .description('Retry a failed agent')
    .option('--skip-backoff', 'Skip exponential backoff')
    .option('--focus <fix>', 'Focus on specific fix')
    .action(async (agentId: string, options: { skipBackoff?: boolean; focus?: string }) => {
      try {
        const agent = memoryStore.agents.get(agentId);
        if (!agent) {
          handleError(`Agent not found: ${agentId}`);
        }
        
        // Reset agent for retry
        memoryStore.agents.update(agentId, {
          status: AgentStatus.PENDING,
          retryCount: agent.retryCount + 1,
          completedAt: undefined
        });
        
        // Emit retry event
        const { createEvent } = await import('../../models/event');
        const event = createEvent({
          type: 'agent.status_changed',
          entityType: 'agent',
          entityId: agentId,
          payload: { 
            previousStatus: AgentStatus.FAILED,
            newStatus: AgentStatus.PENDING,
            skipBackoff: options.skipBackoff,
            focus: options.focus
          }
        });
        memoryStore.events.create(event);
        
        console.log(`✓ Agent ${agentId} retry initiated (attempt ${agent.retryCount + 1})`);
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
        
        console.log(`✓ Agent ${agentId} aborted`);
      } catch (error) {
        handleError(error);
      }
    });
  
  return program;
}

export default agentsCommand;
