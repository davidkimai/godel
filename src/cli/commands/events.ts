/**
 * Event Management Commands
 * 
 * Commands: stream, replay, history, types
 * 
 * Uses the MemoryStore for event persistence
 */

import { Command } from 'commander';

import { memoryStore } from '../../storage';
import { logger } from '../../utils/logger';
import { formatEvents } from '../formatters';
import { validateFormat, handleError, globalFormat } from '../main';

import type { Event} from '../../models/index';

export function eventsCommand(): Command {
  const program = new Command('events');
  
  program
    .description('Manage events in the system')
    .alias('event');
  
  // events stream
  program
    .command('stream')
    .alias('watch')
    .description('Stream events in real-time')
    .option('--filter <type>', 'Filter by event type (e.g., agent.spawned, task.completed)')
    .option('--agent <agent-id>', 'Filter by agent ID')
    .option('--task <task-id>', 'Filter by task ID')
    .option('--quiet', 'Minimal output')
    .action(async (options: { filter?: string; agent?: string; task?: string; quiet?: boolean }) => {
      try {
        logger.info('Streaming events... (Press Ctrl+C to stop)');
        logger.debug('');

        // Subscribe to new events
        // In a real implementation, this would use WebSocket or SSE
        // For now, we'll show a message about how to use it
        logger.info('Event streaming requires WebSocket/SSE implementation.');
        logger.info('In production, connect to: ws://localhost:3000/events');
        logger.debug('');
        logger.info('Filters:');
        logger.info(`  Type: ${options.filter || 'all'}`);
        logger.info(`  Agent: ${options.agent || 'all'}`);
        logger.info(`  Task: ${options.task || 'all'}`);
        
        // Keep the process running
        await new Promise(() => {});
        
      } catch (error) {
        handleError(error);
      }
    });
  
  // events replay
  program
    .command('replay')
    .description('Replay events from a time range')
    .option('--since <time>', 'Start time (ISO 8601 or relative, e.g., 1h ago)')
    .option('--until <time>', 'End time (optional)')
    .option('--agent <agent-id>', 'Filter by agent ID')
    .option('--task <task-id>', 'Filter by task ID')
    .option('--type <event-type>', 'Filter by event type')
    .action(async (options: { format: string; since?: string; until?: string; agent?: string; task?: string; type?: string }) => {
      const format = validateFormat(globalFormat);
      
      try {
        let events = memoryStore.events.list();
        
        // Apply filters
        if (options.type) {
          events = events.filter((e: Event) => e.type === options.type);
        }
        if (options.agent) {
          events = events.filter((e: Event) => 
            e.entityType === 'agent' && e.entityId === options.agent
          );
        }
        if (options.task) {
          events = events.filter((e: Event) => 
            e.entityType === 'task' && e.entityId === options.task
          );
        }
        if (options.since) {
          const sinceDate = parseTimeOption(options.since);
          if (sinceDate) {
            events = events.filter((e: Event) => e.timestamp >= sinceDate);
          }
        }
        if (options.until) {
          const untilDate = parseTimeOption(options.until);
          if (untilDate) {
            events = events.filter((e: Event) => e.timestamp <= untilDate);
          }
        }
        
        // Sort by timestamp
        events.sort((a: Event, b: Event) => a.timestamp.getTime() - b.timestamp.getTime());

        logger.info(`Found ${events.length} events`);
        logger.info(formatEvents(events, format));
      } catch (error) {
        handleError(error);
      }
    });
  
  // events history
  program
    .command('history')
    .alias('list')
    .description('Show recent event history')
    .option('--limit <n>', 'Number of events to show', '50')
    .option('--type <event-type>', 'Filter by event type')
    .action(async (options: { format: string; limit?: string; type?: string }) => {
      const format = validateFormat(globalFormat);
      const limit = parseInt(options.limit || '50', 10);
      
      try {
        let events = memoryStore.events.list();
        
        // Apply type filter
        if (options.type) {
          events = events.filter((e: Event) => e.type === options.type);
        }
        
        // Sort by timestamp descending (newest first) and limit
        events.sort((a: Event, b: Event) => b.timestamp.getTime() - a.timestamp.getTime());
        events = events.slice(0, limit);

        logger.info(formatEvents(events, format));
      } catch (error) {
        handleError(error);
      }
    });
  
  // events types
  program
    .command('types')
    .description('List all available event types')
    .action(() => {
      logger.info('Available event types:');
      logger.debug('');
      logger.info('Agent lifecycle:');
      logger.info('  agent.spawned        Agent was created');
      logger.info('  agent.status_changed Agent status changed');
      logger.info('  agent.completed      Agent finished successfully');
      logger.info('  agent.failed         Agent failed');
      logger.info('  agent.blocked        Agent is blocked');
      logger.info('  agent.paused         Agent was paused');
      logger.info('  agent.resumed        Agent was resumed');
      logger.info('  agent.killed         Agent was killed');
      logger.debug('');
      logger.info('Task lifecycle:');
      logger.info('  task.created         Task was created');
      logger.info('  task.status_changed  Task status changed');
      logger.info('  task.assigned        Task was assigned to agent');
      logger.info('  task.completed       Task completed');
      logger.info('  task.blocked         Task is blocked');
      logger.info('  task.failed          Task failed');
      logger.info('  task.cancelled       Task was cancelled');
      logger.debug('');
      logger.info('Context:');
      logger.info('  context.added        Context item added');
      logger.info('  context.removed      Context item removed');
      logger.info('  context.changed      Context item changed');
      logger.info('  context.snapshot     Context snapshot created');
      logger.debug('');
      logger.info('Quality:');
      logger.info('  critique.requested   Critique requested');
      logger.info('  critique.completed   Critique completed');
      logger.info('  quality.gate_passed  Quality gate passed');
      logger.info('  quality.gate_failed  Quality gate failed');
      logger.debug('');
      logger.info('Safety:');
      logger.info('  safety.violation_attempted  Safety boundary attempted');
      logger.info('  safety.boundary_crossed     Safety boundary crossed');
      logger.info('  safety.escalation_required  Human escalation required');
      logger.info('  safety.human_approval       Human approval received');
      logger.debug('');
      logger.info('System:');
      logger.info('  system.bottleneck_detected  Performance issue detected');
      logger.info('  system.disconnected        Connection lost');
      logger.info('  system.emergency_stop       Emergency stop triggered');
      logger.info('  system.checkpoint          System checkpoint created');
    });
  
  return program;
}

// Helper to parse time options (ISO 8601 or relative like "1h ago")
function parseTimeOption(timeStr: string): Date | null {
  // Handle relative time like "1h ago", "30m ago", "1d ago"
  const relativeMatch = timeStr.match(/^(\d+)([hmd])\s*ago$/i);
  if (relativeMatch) {
    const valueStr = relativeMatch[1];
    const unitStr = relativeMatch[2];
    if (!valueStr || !unitStr) return null;
    const value = parseInt(valueStr, 10);
    const unit = unitStr.toLowerCase();
    const now = new Date();
    
    switch (unit) {
      case 'h':
        return new Date(now.getTime() - value * 60 * 60 * 1000);
      case 'm':
        return new Date(now.getTime() - value * 60 * 1000);
      case 'd':
        return new Date(now.getTime() - value * 24 * 60 * 60 * 1000);
    }
  }
  
  // Try ISO 8601
  const date = new Date(timeStr);
  if (!isNaN(date.getTime())) {
    return date;
  }
  
  return null;
}

export default eventsCommand;
