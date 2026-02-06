import { logger } from '../../../src/utils/logger';
/**
 * Scenario 2: Event Streaming Integration Tests
 * 
 * Tests for real-time event streaming from Godel to OpenClaw.
 * - Event latency < 500ms
 * - 1000 events/second throughput
 */

import { OpenClawEventBridge } from '../../../src/integrations/openclaw/event-bridge';
import { getGlobalBus, MessageBus } from '../../../src/bus/index';
import { testConfig, waitForCondition, calculateLatencyStats } from '../config';

const RUN_LIVE_INTEGRATION_TESTS = process.env['RUN_LIVE_INTEGRATION_TESTS'] === 'true';
const describeLive = RUN_LIVE_INTEGRATION_TESTS ? describe : describe.skip;

describeLive('Scenario 2: Event Streaming', () => {
  let eventBridge: OpenClawEventBridge;
  let mockWebhookEvents: any[] = [];
  let messageBus: MessageBus;

  beforeAll(async () => {
    messageBus = getGlobalBus();
    
    // Create event bridge with mock webhook
    eventBridge = new OpenClawEventBridge({
      messageBus,
      webhookUrl: 'http://localhost:9999/webhook',
      authToken: testConfig.godelApiKey,
      batchInterval: 0, // Immediate forwarding for latency tests
    });

    // Override webhook sending to capture events locally
    (eventBridge as any).sendToWebhook = async (events: any[]) => {
      mockWebhookEvents.push(...events);
    };

    await eventBridge.start();
  });

  afterAll(async () => {
    await eventBridge.stop();
  });

  beforeEach(() => {
    mockWebhookEvents = [];
    eventBridge.resetStats();
  });

  describe('Event Latency', () => {
    it('should stream events within 500ms latency', async () => {
      const events: { sent: number; received: number; latency: number }[] = [];
      const eventCount = 50;

      // Set up local event capture with timestamps
      const capturedEvents: { id: string; receivedAt: number; sentAt: number }[] = [];
      
      eventBridge.on('forwarded', (event: any) => {
        capturedEvents.push({
          id: event.timestamp,
          receivedAt: Date.now(),
          sentAt: new Date(event.timestamp).getTime(),
        });
      });

      // Publish events
      const startTime = Date.now();
      
      for (let i = 0; i < eventCount; i++) {
        const sentAt = Date.now();
        messageBus.publish('agent.test-agent.events', {
          eventType: 'test.event',
          sequence: i,
          sentAt,
        }, { source: 'test', priority: 'high' });
        
        events.push({ sent: sentAt, received: 0, latency: 0 });
        
        // Small delay to spread events
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // Wait for all events to be processed
      await waitForCondition(
        () => capturedEvents.length >= eventCount,
        5000,
        50
      );

      // Calculate latencies
      const latencies = capturedEvents.map(e => e.receivedAt - e.sentAt);
      const stats = calculateLatencyStats(latencies);

      // Log latency stats
      logger.info('Event Latency Statistics:');
      logger.info(`  Min: ${stats.min}ms`);
      logger.info(`  Max: ${stats.max}ms`);
      logger.info(`  Mean: ${stats.mean.toFixed(2)}ms`);
      logger.info(`  P50: ${stats.p50}ms`);
      logger.info(`  P95: ${stats.p95}ms`);
      logger.info(`  P99: ${stats.p99}ms`);

      // Verify latency threshold
      expect(stats.p99).toBeLessThan(testConfig.eventLatencyThreshold);
      expect(stats.max).toBeLessThan(testConfig.eventLatencyThreshold * 2); // Allow some outliers
    }, testConfig.testTimeout);

    it('should handle burst of events with low latency', async () => {
      const burstSize = 100;
      const capturedEvents: { receivedAt: number; sentAt: number }[] = [];
      
      eventBridge.on('forwarded', (event: any) => {
        capturedEvents.push({
          receivedAt: Date.now(),
          sentAt: new Date(event.timestamp).getTime(),
        });
      });

      // Send burst of events simultaneously
      const startTime = Date.now();
      
      const publishPromises = Array(burstSize)
        .fill(null)
        .map((_, i) => {
          return new Promise<void>(resolve => {
            setImmediate(() => {
              messageBus.publish('agent.burst-agent.events', {
                eventType: 'burst.event',
                sequence: i,
              }, { source: 'test' });
              resolve();
            });
          });
        });

      await Promise.all(publishPromises);

      // Wait for all events
      await waitForCondition(
        () => capturedEvents.length >= burstSize,
        5000,
        50
      );

      // Calculate latencies
      const latencies = capturedEvents.map(e => e.receivedAt - startTime);
      const maxLatency = Math.max(...latencies);

      logger.info(`Burst of ${burstSize} events processed, max latency: ${maxLatency}ms`);
      
      // Burst should complete within reasonable time
      expect(maxLatency).toBeLessThan(3000);
    }, testConfig.testTimeout);
  });

  describe('Event Throughput', () => {
    it('should handle 1000 events throughput', async () => {
      const targetEvents = 1000;
      let receivedCount = 0;
      
      eventBridge.on('forwarded', () => {
        receivedCount++;
      });

      // Start measuring
      const startTime = Date.now();

      // Publish events rapidly
      for (let i = 0; i < targetEvents; i++) {
        messageBus.publish('agent.throughput-agent.events', {
          eventType: 'throughput.event',
          sequence: i,
          data: { index: i, payload: 'x'.repeat(100) },
        }, { source: 'test' });
        
        // No delay - pure throughput test
      }

      const publishTime = Date.now() - startTime;

      // Wait for all events to be received
      await waitForCondition(
        () => receivedCount >= targetEvents,
        10000,
        50
      );

      const totalTime = Date.now() - startTime;
      const throughput = targetEvents / (totalTime / 1000);

      logger.info('Throughput Test Results:');
      logger.info(`  Publish time: ${publishTime}ms`);
      logger.info(`  Total time: ${totalTime}ms`);
      logger.info(`  Throughput: ${throughput.toFixed(1)} events/sec`);

      // Should achieve at least 500 events/sec throughput
      expect(throughput).toBeGreaterThan(500);
      
      // Verify all events were received
      expect(receivedCount).toBeGreaterThanOrEqual(targetEvents);
    }, testConfig.testTimeout);

    it('should maintain throughput with different event sizes', async () => {
      const eventSizes = [100, 1000, 10000]; // bytes
      const eventsPerSize = 100;
      
      for (const size of eventSizes) {
        let receivedCount = 0;
        eventBridge.on('forwarded', () => {
          receivedCount++;
        });

        const startTime = Date.now();

        for (let i = 0; i < eventsPerSize; i++) {
          messageBus.publish('agent.size-test.events', {
            eventType: 'size.test',
            payload: 'x'.repeat(size),
          }, { source: 'test' });
        }

        await waitForCondition(
          () => receivedCount >= eventsPerSize,
          5000,
          50
        );

        const duration = Date.now() - startTime;
        const throughput = eventsPerSize / (duration / 1000);

        logger.info(`  Size ${size}b: ${throughput.toFixed(1)} events/sec (${duration}ms)`);
        
        expect(throughput).toBeGreaterThan(100);
      }
    }, testConfig.testTimeout);
  });

  describe('Event Types and Filtering', () => {
    it('should handle different event types', async () => {
      const eventTypes = [
        'agent.spawned',
        'agent.started',
        'agent.completed',
        'agent.failed',
        'system.alert',
      ];

      const receivedTypes = new Set<string>();
      
      eventBridge.on('forwarded', (event: any) => {
        receivedTypes.add(event.type);
      });

      // Publish each event type
      for (const eventType of eventTypes) {
        messageBus.publish('agent.test.events', {
          eventType,
          data: { test: true },
        }, { source: 'test' });
      }

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 500));

      // All event types should be received
      for (const eventType of eventTypes) {
        expect(receivedTypes.has(eventType)).toBe(true);
      }
    }, testConfig.testTimeout);

    it('should filter events based on configuration', async () => {
      // Create filtered bridge
      const filteredBridge = new OpenClawEventBridge({
        messageBus,
        webhookUrl: 'http://localhost:9998/webhook',
        filter: ['agent.spawned', 'agent.completed'],
        batchInterval: 0,
      });

      const receivedEvents: any[] = [];
      (filteredBridge as any).sendToWebhook = async (events: any[]) => {
        receivedEvents.push(...events);
      };

      await filteredBridge.start();

      // Publish filtered and unfiltered events
      messageBus.publish('agent.filter-test.events', {
        eventType: 'agent.spawned', // Should be received
      }, { source: 'test' });

      messageBus.publish('agent.filter-test.events', {
        eventType: 'agent.started', // Should be filtered
      }, { source: 'test' });

      messageBus.publish('agent.filter-test.events', {
        eventType: 'agent.completed', // Should be received
      }, { source: 'test' });

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 500));

      // Only filtered events should be received
      expect(receivedEvents.length).toBe(2);
      expect(receivedEvents.some(e => e.data.eventType === 'agent.spawned')).toBe(true);
      expect(receivedEvents.some(e => e.data.eventType === 'agent.completed')).toBe(true);
      expect(receivedEvents.some(e => e.data.eventType === 'agent.started')).toBe(false);

      await filteredBridge.stop();
    }, testConfig.testTimeout);
  });

  describe('Bridge Health and Stats', () => {
    it('should report correct health status', () => {
      const health = eventBridge.getHealth();
      
      expect(health.status).toBe('healthy');
      expect(health.isRunning).toBe(true);
      expect(health.subscriptionCount).toBeGreaterThan(0);
      expect(health.bufferedEvents).toBe(0);
    });

    it('should track event statistics correctly', async () => {
      const initialStats = eventBridge.getStats();
      
      // Publish some events
      for (let i = 0; i < 10; i++) {
        messageBus.publish('agent.stats-test.events', {
          eventType: 'stats.test',
        }, { source: 'test' });
      }

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 500));

      const finalStats = eventBridge.getStats();
      
      expect(finalStats.eventsReceived).toBeGreaterThan(initialStats.eventsReceived);
      expect(finalStats.eventsForwarded).toBeGreaterThan(initialStats.eventsForwarded);
      expect(finalStats.isRunning).toBe(true);
    });
  });

  describe('Agent-Specific Subscriptions', () => {
    it('should subscribe to specific agent events', async () => {
      const targetAgentId = 'specific-agent-123';
      const agentEvents: any[] = [];

      const unsubscribe = eventBridge.subscribeToAgent(targetAgentId, (event) => {
        agentEvents.push(event);
      });

      // Publish event for target agent
      messageBus.publish(`agent.${targetAgentId}.events`, {
        eventType: 'agent.update',
        data: 'specific data',
      }, { source: 'test' });

      // Publish event for different agent
      messageBus.publish('agent.other-agent.events', {
        eventType: 'agent.update',
        data: 'other data',
      }, { source: 'test' });

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 500));

      // Only target agent events should be received
      expect(agentEvents.length).toBe(1);
      expect(agentEvents[0].metadata.godelAgentId).toBe(targetAgentId);

      unsubscribe();
    }, testConfig.testTimeout);
  });
});
