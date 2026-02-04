import { logger } from '../../utils/logger';
/**
 * Events Commands
 * 
 * Commands:
 * - swarmctl events list [--format json|jsonl|table] [--since <duration>] [--agent <id>]
 * - swarmctl events stream [--follow] [--agent <id>] [--type <type>]
 * - swarmctl events get <event-id>
 */

import { Command } from 'commander';
import { getGlobalClient } from '../lib/client';
import { formatEvents, type OutputFormat } from '../lib/output';
import type { MessageFilter } from '../../bus/index';

export function registerEventsCommand(program: Command): void {
  const events = program
    .command('events')
    .description('Event streaming and management');

  // ============================================================================
  // events list
  // ============================================================================
  events
    .command('list')
    .description('List historical events')
    .option('-f, --format <format>', 'Output format (table|json|jsonl)', 'table')
    .option('-a, --agent <agent-id>', 'Filter by agent ID')
    .option('-t, --task <task-id>', 'Filter by task ID')
    .option('--type <type>', 'Filter by event type')
    .option('--since <duration>', 'Time window (e.g., 1h, 1d, 30m)')
    .option('--until <iso-date>', 'End time (ISO format)')
    .option('-l, --limit <n>', 'Maximum events to show', '50')
    .action(async (options) => {
      try {
        // Parse since date
        let since: Date | undefined;
        if (options.since) {
          const match = options.since.match(/^(\d+)([mhd])$/);
          if (match) {
            const [, num, unit] = match;
            const multiplier = unit === 'm' ? 60 * 1000 : unit === 'h' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
            since = new Date(Date.now() - parseInt(num) * multiplier);
          } else {
            console.error('❌ Invalid since format. Use: 30m, 1h, 1d');
            process.exit(1);
          }
        }

        // Parse until date
        let until: Date | undefined;
        if (options.until) {
          until = new Date(options.until);
          if (isNaN(until.getTime())) {
            console.error('❌ Invalid until date format');
            process.exit(1);
          }
        }

        const client = getGlobalClient();
        const response = await client.listEvents({
          since,
          until,
          agentId: options.agent,
          taskId: options.task,
          type: options.type,
          page: 1,
          pageSize: parseInt(options.limit, 10),
        });

        if (!response.success || !response.data) {
          console.error('❌ Failed to list events:', response.error?.message);
          process.exit(1);
        }

        const events = response.data.items;

        if (events.length === 0) {
          logger.info('📭 No events found');
          return;
        }

        const format = options.format as OutputFormat;
        logger.info(formatEvents(events, { format }));

        if (response.data.hasMore) {
          logger.info(`\n📄 Showing ${events.length} of ${response.data.total} events`);
        }

      } catch (error) {
        console.error('❌ Failed to list events:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // ============================================================================
  // events stream
  // ============================================================================
  events
    .command('stream')
    .description('Stream events in real-time')
    .option('-a, --agent <agent-id>', 'Filter by agent ID')
    .option('-t, --task <task-id>', 'Filter by task ID')
    .option('--type <type>', 'Filter by event type')
    .option('--severity <level>', 'Filter by severity (debug|info|warning|error|critical)', 'info')
    .option('--raw', 'Output raw JSON instead of formatted lines')
    .action(async (options) => {
      try {
        logger.info('📡 Streaming events...\n');
        logger.info('(Press Ctrl+C to stop)\n');

        const client = getGlobalClient();

        // Build filter
        const filter: MessageFilter = {};
        
        if (options.agent) {
          filter.sourceAgentId = options.agent;
        }
        filter.minPriority = options.severity as MessageFilter['minPriority'];

        logger.info(`Filters: ${options.agent ? `agent=${options.agent} ` : ''}${options.task ? `task=${options.task} ` : ''}${options.type ? `type=${options.type} ` : ''}severity>=${options.severity}`);
        logger.info('');

        // Stream events
        const stream = client.streamEvents({ filter });

        // Handle Ctrl+C
        process.on('SIGINT', () => {
          logger.info('\n\n👋 Stopping event stream...');
          process.exit(0);
        });

        for await (const event of stream) {
          // Apply filters manually since stream might not filter perfectly
          if (options.agent && event.entityId !== options.agent && (event.payload as { agentId?: string })?.agentId !== options.agent) {
            continue;
          }
          if (options.task && event.entityId !== options.task) {
            continue;
          }
          if (options.type && event.type !== options.type) {
            continue;
          }

          if (options.raw) {
            logger.info(JSON.stringify(event));
          } else {
            const timestamp = event.timestamp.toISOString().slice(0, 19);
            const severity = getSeverityEmoji(event.type);
            const type = event.type.padEnd(30);
            const entity = event.entityId.slice(0, 16).padEnd(16);
            
            logger.info(`[${timestamp}] ${severity} ${type} ${entity} ${event.type}`);
          }
        }

      } catch (error) {
        console.error('❌ Stream error:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // ============================================================================
  // events get
  // ============================================================================
  events
    .command('get')
    .description('Get event details')
    .argument('<event-id>', 'Event ID')
    .action(async (eventId) => {
      try {
        const client = getGlobalClient();
        const response = await client.getEvent(eventId);

        if (!response.success || !response.data) {
          console.error(`❌ Event ${eventId} not found`);
          process.exit(1);
        }

        const event = response.data;

        logger.info(`📄 Event: ${event.id}\n`);
        logger.info(`   Timestamp: ${event.timestamp.toISOString()}`);
        logger.info(`   Type:      ${event.type}`);
        logger.info(`   Severity:  ${getSeverityEmoji(event.type)} ${getEventSeverity(event.type)}`);
        logger.info(`   Entity:    ${event.entityId} (${event.entityType})`);
        
        if (event.correlationId) {
          logger.info(`   Correlation: ${event.correlationId}`);
        }
        
        if (event.parentEventId) {
          logger.info(`   Parent:    ${event.parentEventId}`);
        }
        
        logger.info(`\n   Payload:`);
        logger.info(JSON.stringify(event.payload, null, 4).replace(/^/gm, '     '));

      } catch (error) {
        console.error('❌ Failed to get event:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}

function getSeverityEmoji(eventType: string): string {
  if (eventType.includes('failed') || eventType.includes('error')) return '❌';
  if (eventType.includes('critical') || eventType.includes('emergency')) return '🚨';
  if (eventType.includes('warning')) return '⚠️';
  if (eventType.includes('completed') || eventType.includes('success')) return '✅';
  return 'ℹ️';
}

function getEventSeverity(eventType: string): string {
  if (eventType.includes('failed') || eventType.includes('error')) return 'error';
  if (eventType.includes('critical') || eventType.includes('emergency')) return 'critical';
  if (eventType.includes('warning')) return 'warning';
  if (eventType.includes('completed') || eventType.includes('success')) return 'info';
  return 'debug';
}
