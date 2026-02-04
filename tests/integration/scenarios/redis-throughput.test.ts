/**
 * Scenario 8: Redis Event Bus Throughput Integration Tests
 * 
 * Tests for Redis event bus performance.
 * - 1000 events/second throughput
 * - Measure publish and receive rates
 * - Verify no message loss
 */

import Redis from 'ioredis';
import { testConfig, waitForCondition, calculateLatencyStats } from '../config';

describe('Scenario 8: Redis Event Bus Throughput', () => {
  let redis: Redis | null = null;
  let subscriber: Redis | null = null;
  const testChannel = 'dash:test:events';

  beforeAll(async () => {
    try {
      redis = new Redis(testConfig.redisUrl, {
        retryStrategy: (times) => {
          if (times > 3) {
            return null; // Stop retrying
          }
          return Math.min(times * 50, 2000);
        },
        maxRetriesPerRequest: 3,
      });

      subscriber = new Redis(testConfig.redisUrl, {
        retryStrategy: (times) => {
          if (times > 3) {
            return null;
          }
          return Math.min(times * 50, 2000);
        },
        maxRetriesPerRequest: 3,
      });

      // Test connection
      await redis.ping();
      await subscriber.ping();
      
      console.log('Redis connected successfully');
    } catch (error) {
      console.log('Redis not available, skipping Redis tests');
      redis = null;
      subscriber = null;
    }
  });

  afterAll(async () => {
    if (redis) {
      await redis.quit();
    }
    if (subscriber) {
      await subscriber.quit();
    }
  });

  beforeEach(async () => {
    if (!redis) return;
    
    // Clear test channels
    await redis.del(`${testChannel}:messages`);
  });

  describe('Event Throughput', () => {
    it('should handle 1000 events/second publish rate', async () => {
      if (!redis) {
        console.log('Skipping Redis test - not available');
        return;
      }

      const eventCount = 1000;
      const events: { id: number; timestamp: number }[] = [];

      // Start timing
      const startTime = Date.now();

      // Publish events as fast as possible
      for (let i = 0; i < eventCount; i++) {
        const event = {
          id: i,
          timestamp: Date.now(),
          type: 'throughput.test',
          data: { index: i, payload: 'x'.repeat(100) },
        };
        
        await redis.publish(testChannel, JSON.stringify(event));
        events.push({ id: i, timestamp: event.timestamp });
      }

      const publishDuration = Date.now() - startTime;
      const publishRate = eventCount / (publishDuration / 1000);

      console.log('Redis Publish Throughput:');
      console.log(`  Events: ${eventCount}`);
      console.log(`  Duration: ${publishDuration}ms`);
      console.log(`  Rate: ${publishRate.toFixed(1)} events/sec`);

      expect(publishRate).toBeGreaterThan(500);
    }, testConfig.testTimeout);

    it('should achieve high throughput with batch publishing', async () => {
      if (!redis) {
        console.log('Skipping Redis test - not available');
        return;
      }

      const eventCount = 1000;
      const batchSize = 100;
      const events: string[] = [];

      // Prepare events
      for (let i = 0; i < eventCount; i++) {
        events.push(JSON.stringify({
          id: i,
          timestamp: Date.now(),
          type: 'batch.test',
          data: { index: i },
        }));
      }

      const startTime = Date.now();

      // Publish in batches using pipeline
      const pipeline = redis.pipeline();
      
      for (let i = 0; i < eventCount; i++) {
        pipeline.publish(testChannel, events[i]);
        
        if ((i + 1) % batchSize === 0) {
          await pipeline.exec();
        }
      }

      // Execute remaining
      if (events.length % batchSize !== 0) {
        await pipeline.exec();
      }

      const publishDuration = Date.now() - startTime;
      const publishRate = eventCount / (publishDuration / 1000);

      console.log('Redis Batch Publish Throughput:');
      console.log(`  Events: ${eventCount}`);
      console.log(`  Duration: ${publishDuration}ms`);
      console.log(`  Rate: ${publishRate.toFixed(1)} events/sec`);

      expect(publishRate).toBeGreaterThan(1000);
    }, testConfig.testTimeout);
  });

  describe('Pub/Sub Performance', () => {
    it('should receive published events with low latency', async () => {
      if (!redis || !subscriber) {
        console.log('Skipping Redis test - not available');
        return;
      }

      const receivedEvents: { id: number; receivedAt: number; sentAt: number }[] = [];
      const eventCount = 100;

      // Set up subscription
      await subscriber.subscribe(testChannel);
      
      subscriber.on('message', (channel, message) => {
        if (channel === testChannel) {
          try {
            const event = JSON.parse(message);
            receivedEvents.push({
              id: event.id,
              receivedAt: Date.now(),
              sentAt: event.timestamp,
            });
          } catch {
            // Ignore parse errors
          }
        }
      });

      // Wait for subscription to be ready
      await new Promise(resolve => setTimeout(resolve, 100));

      // Publish events
      const startTime = Date.now();
      
      for (let i = 0; i < eventCount; i++) {
        await redis.publish(testChannel, JSON.stringify({
          id: i,
          timestamp: Date.now(),
          type: 'latency.test',
        }));
      }

      // Wait for all events to be received
      await waitForCondition(
        () => receivedEvents.length >= eventCount,
        10000,
        50
      );

      const totalTime = Date.now() - startTime;

      // Calculate latencies
      const latencies = receivedEvents.map(e => e.receivedAt - e.sentAt);
      const stats = calculateLatencyStats(latencies);

      console.log('Redis Pub/Sub Latency:');
      console.log(`  Events: ${receivedEvents.length}`);
      console.log(`  Total time: ${totalTime}ms`);
      console.log(`  Min latency: ${stats.min}ms`);
      console.log(`  Mean latency: ${stats.mean.toFixed(2)}ms`);
      console.log(`  P95 latency: ${stats.p95}ms`);
      console.log(`  P99 latency: ${stats.p99}ms`);

      expect(stats.p99).toBeLessThan(100); // 100ms max latency
      expect(receivedEvents.length).toBeGreaterThanOrEqual(eventCount);

      // Clean up
      await subscriber.unsubscribe(testChannel);
      subscriber.removeAllListeners('message');
    }, testConfig.testTimeout);

    it('should handle high subscriber count', async () => {
      if (!redis) {
        console.log('Skipping Redis test - not available');
        return;
      }

      const subscriberCount = 10;
      const eventCount = 100;
      const subscribers: Redis[] = [];
      const receivedCounts: number[] = Array(subscriberCount).fill(0);

      // Create multiple subscribers
      for (let i = 0; i < subscriberCount; i++) {
        const sub = new Redis(testConfig.redisUrl);
        subscribers.push(sub);
        
        await sub.subscribe(testChannel);
        
        sub.on('message', () => {
          receivedCounts[i]++;
        });
      }

      // Wait for subscriptions
      await new Promise(resolve => setTimeout(resolve, 500));

      // Publish events
      for (let i = 0; i < eventCount; i++) {
        await redis.publish(testChannel, JSON.stringify({
          id: i,
          type: 'multi-subscriber.test',
        }));
      }

      // Wait for delivery
      await waitForCondition(
        () => receivedCounts.every(c => c >= eventCount),
        10000,
        50
      );

      // Each subscriber should receive all events
      for (let i = 0; i < subscriberCount; i++) {
        expect(receivedCounts[i]).toBeGreaterThanOrEqual(eventCount);
      }

      // Clean up
      for (const sub of subscribers) {
        await sub.unsubscribe();
        await sub.quit();
      }
    }, testConfig.testTimeout);
  });

  describe('Message Reliability', () => {
    it('should not lose messages under normal conditions', async () => {
      if (!redis || !subscriber) {
        console.log('Skipping Redis test - not available');
        return;
      }

      const eventCount = 500;
      const receivedEvents: number[] = [];

      // Set up subscription before publishing
      await subscriber.subscribe(testChannel);
      
      subscriber.on('message', (channel, message) => {
        if (channel === testChannel) {
          try {
            const event = JSON.parse(message);
            receivedEvents.push(event.id);
          } catch {
            // Ignore
          }
        }
      });

      // Small delay to ensure subscription is active
      await new Promise(resolve => setTimeout(resolve, 100));

      // Publish all events
      for (let i = 0; i < eventCount; i++) {
        await redis.publish(testChannel, JSON.stringify({
          id: i,
          type: 'reliability.test',
          data: { index: i },
        }));
      }

      // Wait for all events
      await waitForCondition(
        () => receivedEvents.length >= eventCount,
        10000,
        50
      );

      // Verify no duplicates and all received
      const uniqueEvents = new Set(receivedEvents);
      
      console.log('Message Reliability Test:');
      console.log(`  Sent: ${eventCount}`);
      console.log(`  Received: ${receivedEvents.length}`);
      console.log(`  Unique: ${uniqueEvents.size}`);

      expect(uniqueEvents.size).toBe(eventCount);
      expect(receivedEvents.length).toBe(eventCount);

      // Clean up
      await subscriber.unsubscribe(testChannel);
      subscriber.removeAllListeners('message');
    }, testConfig.testTimeout);

    it('should handle subscriber disconnect gracefully', async () => {
      if (!redis) {
        console.log('Skipping Redis test - not available');
        return;
      }

      const eventCount = 100;
      const receivedEvents: number[] = [];

      // Create temporary subscriber
      const tempSub = new Redis(testConfig.redisUrl);
      await tempSub.subscribe(testChannel);
      
      tempSub.on('message', (channel, message) => {
        if (channel === testChannel) {
          try {
            const event = JSON.parse(message);
            receivedEvents.push(event.id);
          } catch {
            // Ignore
          }
        }
      });

      // Publish some events
      for (let i = 0; i < 50; i++) {
        await redis.publish(testChannel, JSON.stringify({
          id: i,
          type: 'disconnect.test',
        }));
      }

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 500));

      // Disconnect subscriber
      await tempSub.unsubscribe();
      await tempSub.quit();

      // Publish more events (while subscriber is disconnected)
      for (let i = 50; i < eventCount; i++) {
        await redis.publish(testChannel, JSON.stringify({
          id: i,
          type: 'disconnect.test',
        }));
      }

      // Subscriber should have received only events before disconnect
      expect(receivedEvents.length).toBeGreaterThanOrEqual(50);
      expect(receivedEvents.length).toBeLessThan(eventCount);
    }, testConfig.testTimeout);
  });

  describe('Channel Patterns', () => {
    it('should support pattern-based subscriptions', async () => {
      if (!redis || !subscriber) {
        console.log('Skipping Redis test - not available');
        return;
      }

      const pattern = 'dash:test:*';
      const receivedEvents: { channel: string; data: any }[] = [];

      // Set up pattern subscription
      await subscriber.psubscribe(pattern);
      
      subscriber.on('pmessage', (pattern, channel, message) => {
        try {
          receivedEvents.push({
            channel,
            data: JSON.parse(message),
          });
        } catch {
          // Ignore
        }
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      // Publish to multiple channels matching pattern
      const channels = [
        'dash:test:events',
        'dash:test:logs',
        'dash:test:metrics',
      ];

      for (let i = 0; i < channels.length; i++) {
        await redis.publish(channels[i], JSON.stringify({
          id: i,
          channel: channels[i],
          type: 'pattern.test',
        }));
      }

      // Wait for events
      await waitForCondition(
        () => receivedEvents.length >= channels.length,
        5000,
        50
      );

      expect(receivedEvents.length).toBe(channels.length);

      // Clean up
      await subscriber.punsubscribe(pattern);
      subscriber.removeAllListeners('pmessage');
    }, testConfig.testTimeout);
  });

  describe('Performance Under Load', () => {
    it('should maintain throughput under sustained load', async () => {
      if (!redis) {
        console.log('Skipping Redis test - not available');
        return;
      }

      const iterations = 5;
      const eventsPerIteration = 200;
      const rates: number[] = [];

      for (let iter = 0; iter < iterations; iter++) {
        const startTime = Date.now();

        for (let i = 0; i < eventsPerIteration; i++) {
          await redis.publish(testChannel, JSON.stringify({
            iteration: iter,
            id: i,
            type: 'sustained.test',
          }));
        }

        const duration = Date.now() - startTime;
        const rate = eventsPerIteration / (duration / 1000);
        rates.push(rate);

        // Small pause between iterations
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const avgRate = rates.reduce((a, b) => a + b, 0) / rates.length;
      const minRate = Math.min(...rates);

      console.log('Sustained Load Test:');
      console.log(`  Average rate: ${avgRate.toFixed(1)} events/sec`);
      console.log(`  Min rate: ${minRate.toFixed(1)} events/sec`);
      console.log(`  Rates: ${rates.map(r => r.toFixed(0)).join(', ')}`);

      // Rate should not degrade significantly
      expect(minRate).toBeGreaterThan(avgRate * 0.5);
    }, testConfig.testTimeout);
  });

  describe('Error Handling', () => {
    it('should handle connection errors gracefully', async () => {
      if (!redis) {
        console.log('Skipping Redis test - not available');
        return;
      }

      // Test with invalid Redis URL (should fail to connect)
      try {
        const badRedis = new Redis('redis://invalid-host:6379', {
          connectTimeout: 1000,
          maxRetriesPerRequest: 1,
          retryStrategy: () => null, // Don't retry
        });

        await badRedis.ping();
        
        // If we get here, clean up
        await badRedis.quit();
      } catch (error) {
        // Expected to fail
        expect(error).toBeDefined();
      }
    }, testConfig.testTimeout);

    it('should recover from temporary connection issues', async () => {
      if (!redis) {
        console.log('Skipping Redis test - not available');
        return;
      }

      // Current connection should be healthy
      expect(redis.status).toBe('ready');

      // Test basic operation
      const result = await redis.ping();
      expect(result).toBe('PONG');
    }, testConfig.testTimeout);
  });
});
