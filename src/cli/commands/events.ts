/**
 * Event Management Commands
 * 
 * Commands: stream, replay, history, types
 * 
 * Uses the MemoryStore for event persistence
 */

import { Command } from 'commander';
import { validateFormat, handleError, globalFormat } from '../main';
import { formatEvents, formatEvent } from '../formatters';
import { Event, EventType } from '../../models/index';
import { memoryStore } from '../../storage';

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
        console.log('Streaming events... (Press Ctrl+C to stop)');
        console.log('');
        
        // Subscribe to new events
        // In a real implementation, this would use WebSocket or SSE
        // For now, we'll show a message about how to use it
        console.log('Event streaming requires WebSocket/SSE implementation.');
        console.log('In production, connect to: ws://localhost:3000/events');
        console.log('');
        console.log('Filters:');
        console.log(`  Type: ${options.filter || 'all'}`);
        console.log(`  Agent: ${options.agent || 'all'}`);
        console.log(`  Task: ${options.task || 'all'}`);
        
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
        
        console.log(`Found ${events.length} events`);
        console.log(formatEvents(events, format));
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
        
        console.log(formatEvents(events, format));
      } catch (error) {
        handleError(error);
      }
    });
  
  // events types
  program
    .command('types')
    .description('List all available event types')
    .action(() => {
      console.log('Available event types:');
      console.log('');
      console.log('Agent lifecycle:');
      console.log('  agent.spawned        Agent was created');
      console.log('  agent.status_changed Agent status changed');
      console.log('  agent.completed      Agent finished successfully');
      console.log('  agent.failed         Agent failed');
      console.log('  agent.blocked        Agent is blocked');
      console.log('  agent.paused         Agent was paused');
      console.log('  agent.resumed        Agent was resumed');
      console.log('  agent.killed         Agent was killed');
      console.log('');
      console.log('Task lifecycle:');
      console.log('  task.created         Task was created');
      console.log('  task.status_changed  Task status changed');
      console.log('  task.assigned        Task was assigned to agent');
      console.log('  task.completed       Task completed');
      console.log('  task.blocked         Task is blocked');
      console.log('  task.failed          Task failed');
      console.log('  task.cancelled       Task was cancelled');
      console.log('');
      console.log('Context:');
      console.log('  context.added        Context item added');
      console.log('  context.removed      Context item removed');
      console.log('  context.changed      Context item changed');
      console.log('  context.snapshot     Context snapshot created');
      console.log('');
      console.log('Quality:');
      console.log('  critique.requested   Critique requested');
      console.log('  critique.completed   Critique completed');
      console.log('  quality.gate_passed  Quality gate passed');
      console.log('  quality.gate_failed  Quality gate failed');
      console.log('');
      console.log('Safety:');
      console.log('  safety.violation_attempted  Safety boundary attempted');
      console.log('  safety.boundary_crossed     Safety boundary crossed');
      console.log('  safety.escalation_required  Human escalation required');
      console.log('  safety.human_approval       Human approval received');
      console.log('');
      console.log('System:');
      console.log('  system.bottleneck_detected  Performance issue detected');
      console.log('  system.disconnected        Connection lost');
      console.log('  system.emergency_stop       Emergency stop triggered');
      console.log('  system.checkpoint          System checkpoint created');
    });
  
  return program;
}

// Helper to parse time options (ISO 8601 or relative like "1h ago")
function parseTimeOption(timeStr: string): Date | null {
  // Handle relative time like "1h ago", "30m ago", "1d ago"
  const relativeMatch = timeStr.match(/^(\d+)([hmd])\s*ago$/i);
  if (relativeMatch) {
    const value = parseInt(relativeMatch[1], 10);
    const unit = relativeMatch[2].toLowerCase();
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
