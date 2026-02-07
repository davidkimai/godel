/**
 * Message Bus Commands
 * 
 * Commands:
 * - godel bus publish <topic> --message <message>
 * - godel bus subscribe <topic> [--follow]
 * - godel bus topics
 * - godel bus status
 */

import { logger } from '../../utils/logger';
import { Command } from 'commander';
import { getGlobalClient } from '../lib/client';
import { formatMessages, type OutputFormat } from '../lib/output';
import { getGlobalBus } from '../../bus/index';

export function registerBusCommand(program: Command): void {
  const bus = program
    .command('bus')
    .description('Message bus operations');

  // ============================================================================
  // bus publish
  // ============================================================================
  bus
    .command('publish')
    .description('Publish a message to a topic')
    .argument('<topic>', 'Topic to publish to')
    .requiredOption('-m, --message <message>', 'Message payload (JSON string)')
    .option('--priority <level>', 'Message priority (low|medium|high|critical)', 'medium')
    .option('--source <source>', 'Message source identifier')
    .action(async (topic, options) => {
      try {
        const client = getGlobalClient();

        // Parse message as JSON
        let payload: unknown;
        try {
          payload = JSON.parse(options.message);
        } catch {
          // If not valid JSON, treat as string
          payload = { message: options.message };
        }

        const metadata: Record<string, unknown> = {
          priority: options.priority,
        };
        
        if (options.source) {
          metadata["source"] = options.source;
        }

        logger.info(`📤 Publishing to ${topic}...`);

        const response = await client.publishMessage(topic, payload, metadata);

        if (!response.success || !response.data) {
          logger.error('❌ Failed to publish message:', response.error?.message);
          process.exit(1);
        }

        const message = response.data;

        logger.info('✅ Message published successfully!\n');
        logger.info(`   ID:        ${message.id}`);
        logger.info(`   Topic:     ${message.topic}`);
        logger.info(`   Timestamp: ${message.timestamp.toISOString()}`);

      } catch (error) {
        logger.error('❌ Failed to publish message:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // ============================================================================
  // bus subscribe
  // ============================================================================
  bus
    .command('subscribe')
    .description('Subscribe to a topic and print messages')
    .argument('<topic>', 'Topic to subscribe to (supports wildcards: *, #)')
    .option('-f, --follow', 'Keep listening for new messages')
    .option('--raw', 'Output raw JSON')
    .action(async (topic, options) => {
      try {
        const client = getGlobalClient();

        logger.info(`📡 Subscribing to ${topic}...\n`);

        if (options.follow) {
          logger.info('(Press Ctrl+C to stop)\n');
        }

        const messageHandler = (message: { id: string; topic: string; timestamp: Date; payload: unknown; metadata?: { source?: string; priority?: string } }) => {
          if (options.raw) {
            logger.info(JSON.stringify(message));
          } else {
            const timestamp = message.timestamp.toISOString().slice(0, 19);
            const source = message.metadata?.source || 'unknown';
            const priority = message.metadata?.priority || 'medium';
            
            logger.info(`[${timestamp}] ${priority.toUpperCase().padEnd(8)} ${source.slice(0, 12).padEnd(12)} ${message.topic}`);
            
            const payload = typeof message.payload === 'string' 
              ? message.payload 
              : JSON.stringify(message.payload);
            
            // Print payload indented
            const lines = payload.split('\n');
            for (const line of lines) {
              logger.info(`  ${line}`);
            }
            logger.info('');
          }
        };

        const response = await client.subscribeToTopic(topic, messageHandler);

        if (!response.success || !response.data) {
          logger.error('❌ Failed to subscribe:', response.error?.message);
          process.exit(1);
        }

        const subscriptionId = response.data;
        logger.info(`✅ Subscribed with ID: ${subscriptionId}\n`);

        if (options.follow) {
          // Keep the process alive
          process.on('SIGINT', async () => {
            logger.info('\n\n👋 Unsubscribing...');
            await client.unsubscribe(subscriptionId);
            process.exit(0);
          });

          await new Promise(() => {});
        } else {
          // Just show current messages and exit
          logger.info('Waiting for messages (5 seconds)...\n');
          
          await new Promise(resolve => setTimeout(resolve, 5000));
          
          await client.unsubscribe(subscriptionId);
          logger.info('\n✅ Unsubscribed');
        }

      } catch (error) {
        logger.error('❌ Failed to subscribe:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // ============================================================================
  // bus topics
  // ============================================================================
  bus
    .command('topics')
    .description('List active topics')
    .option('-f, --format <format>', 'Output format (table|json)', 'table')
    .action(async (options) => {
      try {
        // Get topics from message bus
        const messageBus = getGlobalBus();
        
        // Get all messages to extract topics
        const messages = messageBus.getAllMessages(1000);
        const topicSet = new Set<string>();
        
        for (const message of messages) {
          topicSet.add(message.topic);
        }

        const topics = Array.from(topicSet).sort();

        if (topics.length === 0) {
          logger.info('📭 No topics found');
          logger.info('💡 Use "godel bus publish" to send a message');
          return;
        }

        if (options.format === 'json') {
          logger.info(JSON.stringify(topics, null, 2));
          return;
        }

        logger.info('📋 Active Topics:\n');
        
        for (const topic of topics) {
          // Count messages for this topic
          const count = messages.filter(m => m.topic === topic).length;
          logger.info(`  ${topic.padEnd(40)} ${String(count).padStart(4)} messages`);
        }

        logger.info(`\n📊 Total: ${topics.length} topics`);

      } catch (error) {
        logger.error('❌ Failed to list topics:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // ============================================================================
  // bus status
  // ============================================================================
  bus
    .command('status')
    .description('Show message bus status')
    .option('-f, --format <format>', 'Output format (table|json)', 'table')
    .action(async (options) => {
      try {
        const messageBus = getGlobalBus();
        const messages = messageBus.getAllMessages(10000);

        // Calculate statistics
        const topicCounts: Record<string, number> = {};
        const sourceCounts: Record<string, number> = {};
        
        for (const message of messages) {
          topicCounts[message.topic] = (topicCounts[message.topic] || 0) + 1;
          
          const source = message.metadata?.source || 'unknown';
          sourceCounts[source] = (sourceCounts[source] || 0) + 1;
        }

        const stats = {
          totalMessages: messages.length,
          uniqueTopics: Object.keys(topicCounts).length,
          uniqueSources: Object.keys(sourceCounts).length,
          oldestMessage: messages.length > 0 
            ? new Date(Math.min(...messages.map(m => m.timestamp.getTime()))).toISOString()
            : null,
          newestMessage: messages.length > 0
            ? new Date(Math.max(...messages.map(m => m.timestamp.getTime()))).toISOString()
            : null,
          topTopics: Object.entries(topicCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5),
          topSources: Object.entries(sourceCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5),
        };

        if (options.format === 'json') {
          logger.info(JSON.stringify(stats, null, 2));
          return;
        }

        logger.info('📊 Message Bus Status\n');
        logger.info(`  Total Messages:    ${stats.totalMessages}`);
        logger.info(`  Unique Topics:     ${stats.uniqueTopics}`);
        logger.info(`  Unique Sources:    ${stats.uniqueSources}`);
        
        if (stats.oldestMessage) {
          logger.info(`  Oldest Message:    ${stats.oldestMessage}`);
          logger.info(`  Newest Message:    ${stats.newestMessage}`);
        }

        if (stats.topTopics.length > 0) {
          logger.info('\n  Top Topics:');
          for (const [topic, count] of stats.topTopics) {
            logger.info(`    ${topic.padEnd(35)} ${String(count).padStart(4)}`);
          }
        }

        if (stats.topSources.length > 0) {
          logger.info('\n  Top Sources:');
          for (const [source, count] of stats.topSources) {
            logger.info(`    ${source.padEnd(20)} ${String(count).padStart(4)}`);
          }
        }

      } catch (error) {
        logger.error('❌ Failed to get status:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}
