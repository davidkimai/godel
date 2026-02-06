import { logger } from '../../src/utils/logger';
/**
 * Load Testing Harness for Godel
 * 
 * Generates synthetic agent workloads to benchmark the system at scale.
 * Tests 10, 20, 50, and 100 agent scenarios.
 * 
 * Metrics captured:
 * - Latency: spawn time, message delivery time, state transition time
 * - Throughput: events/sec, messages/sec, state transitions/sec
 * - Memory: heap usage, event bus memory, storage memory
 * - Event Bus: capacity, delivery rate, dropped messages
 */

import { AgentLifecycle, LifecycleMetrics } from '../../src/core/lifecycle';
import { AgentEventBus } from '../../src/core/event-bus';
import { SwarmOrchestrator, SwarmConfig } from '../../src/core/swarm-orchestrator';
import { AgentStorage, MemoryStore } from '../../src/storage/memory';
import { MessageBus } from '../../src/bus/index';
import { AgentStatus } from '../../src/models/agent';
import { performance } from 'perf_hooks';
import { randomUUID } from 'crypto';

// ============================================================================
// Types
// ============================================================================

export interface LoadTestConfig {
  /** Number of agents to simulate */
  agentCount: number;
  /** Duration of the test in milliseconds */
  durationMs: number;
  /** Events per agent per second */
  eventRate: number;
  /** Message payload size in bytes */
  payloadSize: number;
  /** Enable event streaming */
  enableEventStreaming: boolean;
  /** Enable branching (session tree) */
  enableBranching: boolean;
  /** Warmup time before measurements */
  warmupMs: number;
}

export interface LatencyMetrics {
  /** Agent spawn time (ms) */
  spawnTime: {
    min: number;
    max: number;
    avg: number;
    p50: number;
    p95: number;
    p99: number;
  };
  /** Event delivery time (ms) */
  eventDelivery: {
    min: number;
    max: number;
    avg: number;
    p50: number;
    p95: number;
    p99: number;
  };
  /** Message routing time (ms) */
  messageRouting: {
    min: number;
    max: number;
    avg: number;
    p50: number;
    p95: number;
    p99: number;
  };
  /** State transition time (ms) */
  stateTransition: {
    min: number;
    max: number;
    avg: number;
    p50: number;
    p95: number;
    p99: number;
  };
}

export interface ThroughputMetrics {
  /** Events processed per second */
  eventsPerSecond: number;
  /** Messages routed per second */
  messagesPerSecond: number;
  /** State transitions per second */
  stateTransitionsPerSecond: number;
  /** Total events emitted */
  totalEvents: number;
  /** Total messages published */
  totalMessages: number;
  /** Total state transitions */
  totalStateTransitions: number;
}

export interface MemoryMetrics {
  /** Heap used at start (bytes) */
  heapUsedStart: number;
  /** Heap used at end (bytes) */
  heapUsedEnd: number;
  /** Peak heap usage (bytes) */
  heapUsedPeak: number;
  /** Heap growth (bytes) */
  heapGrowth: number;
  /** Event bus memory estimate (bytes) */
  eventBusMemory: number;
  /** Storage memory estimate (bytes) */
  storageMemory: number;
  /** RSS at start (bytes) */
  rssStart: number;
  /** RSS at end (bytes) */
  rssEnd: number;
}

export interface EventBusMetrics {
  /** Total events emitted */
  eventsEmitted: number;
  /** Total events delivered */
  eventsDelivered: number;
  /** Events dropped (if any) */
  eventsDropped: number;
  /** Delivery rate (0-1) */
  deliveryRate: number;
  /** Active subscriptions */
  subscriptionCount: number;
  /** Messages in bus */
  messageCount: number;
}

export interface LoadTestResult {
  /** Test configuration */
  config: LoadTestConfig;
  /** Test timestamp */
  timestamp: string;
  /** Test duration (ms) */
  testDuration: number;
  /** Latency metrics */
  latency: LatencyMetrics;
  /** Throughput metrics */
  throughput: ThroughputMetrics;
  /** Memory metrics */
  memory: MemoryMetrics;
  /** Event bus metrics */
  eventBus: EventBusMetrics;
  /** Lifecycle metrics */
  lifecycle: LifecycleMetrics;
  /** Errors encountered */
  errors: Array<{ message: string; count: number }>;
  /** Success flag */
  success: boolean;
}

// ============================================================================
// Mock OpenClaw Core for Testing
// ============================================================================

class MockOpenClawCore {
  private sessions: Map<string, any> = new Map();
  private messageBus: MessageBus;

  constructor(messageBus: MessageBus) {
    this.messageBus = messageBus;
  }

  async initialize(): Promise<void> {
    // Mock initialization
  }

  async connect(): Promise<void> {
    // Mock connect
  }

  async spawnSession(options: any): Promise<string> {
    const sessionId = `session-${randomUUID().slice(0, 8)}`;
    this.sessions.set(options.agentId, { sessionId, ...options });
    return sessionId;
  }

  async killSession(agentId: string, force: boolean): Promise<void> {
    this.sessions.delete(agentId);
  }

  hasSession(agentId: string): boolean {
    return this.sessions.has(agentId);
  }
}

// ============================================================================
// Load Test Generator
// ============================================================================

export class LoadTestGenerator {
  private config: LoadTestConfig;
  private storage: AgentStorage;
  private messageBus: MessageBus;
  private eventBus: AgentEventBus;
  private lifecycle: AgentLifecycle;
  private orchestrator: SwarmOrchestrator;
  private memoryStore: MemoryStore;
  private mockOpenClaw: MockOpenClawCore;

  // Metrics tracking
  private spawnTimes: number[] = [];
  private eventDeliveryTimes: number[] = [];
  private messageRoutingTimes: number[] = [];
  private stateTransitionTimes: number[] = [];
  private errors: Map<string, number> = new Map();
  private peakHeapUsed = 0;
  private eventBusMemoryStart = 0;
  private storageMemoryStart = 0;

  constructor(config: LoadTestConfig) {
    this.config = config;
    this.memoryStore = new MemoryStore();
    this.storage = this.memoryStore.agents;
    this.messageBus = new MessageBus({ maxListeners: 5000 });
    this.eventBus = new AgentEventBus({ 
      maxListeners: 5000,
      persistEvents: false 
    });
    this.mockOpenClaw = new MockOpenClawCore(this.messageBus);
    this.lifecycle = new AgentLifecycle(
      this.storage,
      this.messageBus,
      this.mockOpenClaw as any
    );
    this.orchestrator = new SwarmOrchestrator(
      this.lifecycle,
      this.messageBus,
      this.storage,
      this.eventBus
    );
  }

  /**
   * Run the load test
   */
  async run(): Promise<LoadTestResult> {
    logger.info(`\n🚀 Starting load test: ${this.config.agentCount} agents`);
    logger.info(`   Duration: ${this.config.durationMs}ms | Event rate: ${this.config.eventRate}/sec`);

    const startTime = performance.now();
    const startMemory = process.memoryUsage();

    // Start lifecycle
    await this.lifecycle.start();
    this.orchestrator.start();

    // Record baseline memory
    this.eventBusMemoryStart = this.estimateEventBusMemory();
    this.storageMemoryStart = this.estimateStorageMemory();

    // Warmup phase
    if (this.config.warmupMs > 0) {
      logger.info(`   Warmup: ${this.config.warmupMs}ms...`);
      await this.warmup();
    }

    // Clear metrics after warmup
    this.clearMetrics();

    // Run main test
    logger.info(`   Executing test...`);
    const testPromise = this.executeTest();
    const monitorPromise = this.monitorMemory();

    await Promise.all([testPromise, monitorPromise]);

    const endTime = performance.now();
    const endMemory = process.memoryUsage();

    // Stop services
    this.orchestrator.stop();
    this.lifecycle.stop();

    // Calculate results
    const result = this.calculateResults(
      startTime,
      endTime,
      startMemory,
      endMemory
    );

    logger.info(`   ✅ Test complete: ${result.success ? 'PASSED' : 'FAILED'}`);
    
    return result;
  }

  /**
   * Warmup phase - create agents and let system stabilize
   */
  private async warmup(): Promise<void> {
    // Create a small swarm for warmup
    const warmupConfig: SwarmConfig = {
      name: `warmup-${Date.now()}`,
      task: 'warmup task',
      initialAgents: Math.min(5, this.config.agentCount),
      maxAgents: this.config.agentCount,
      strategy: 'parallel',
      model: 'test-model',
      enableEventStreaming: this.config.enableEventStreaming,
      enableBranching: this.config.enableBranching,
    };

    const swarm = await this.orchestrator.create(warmupConfig);

    // Wait for warmup duration
    await this.delay(this.config.warmupMs);

    // Destroy warmup swarm
    await this.orchestrator.destroy(swarm.id, true);
  }

  /**
   * Execute the main test
   */
  private async executeTest(): Promise<void> {
    const batchSize = Math.min(10, this.config.agentCount);
    const batches = Math.ceil(this.config.agentCount / batchSize);

    // Create swarms in batches
    const swarmConfigs: SwarmConfig[] = this.generateSwarmConfigs();
    const swarmIds: string[] = [];

    for (let i = 0; i < batches; i++) {
      const batchStart = i * batchSize;
      const batchEnd = Math.min((i + 1) * batchSize, swarmConfigs.length);
      const batch = swarmConfigs.slice(batchStart, batchEnd);

      // Create swarms in parallel within batch
      const batchPromises = batch.map(async (config) => {
        const spawnStart = performance.now();
        try {
          const swarm = await this.orchestrator.create(config);
          const spawnTime = performance.now() - spawnStart;
          this.spawnTimes.push(spawnTime);
          return swarm.id;
        } catch (error) {
          this.recordError(`Spawn failed: ${error}`);
          return null;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      swarmIds.push(...batchResults.filter((id): id is string => id !== null));

      // Small delay between batches
      await this.delay(10);
    }

    // Generate load
    const loadStartTime = performance.now();
    const loadPromises: Promise<void>[] = [];

    // Event generation load
    if (this.config.eventRate > 0) {
      loadPromises.push(this.generateEventLoad(swarmIds, loadStartTime));
    }

    // Message load
    loadPromises.push(this.generateMessageLoad(swarmIds, loadStartTime));

    // State transition load
    loadPromises.push(this.generateStateTransitionLoad(swarmIds, loadStartTime));

    // Run loads for test duration
    await Promise.all(loadPromises);

    // Cleanup
    for (const swarmId of swarmIds) {
      try {
        await this.orchestrator.destroy(swarmId, true);
      } catch (error) {
        this.recordError(`Destroy failed: ${error}`);
      }
    }
  }

  /**
   * Generate swarm configurations
   */
  private generateSwarmConfigs(): SwarmConfig[] {
    // Determine swarm distribution
    // For testing, we create swarms of varying sizes
    const configs: SwarmConfig[] = [];
    let remainingAgents = this.config.agentCount;

    while (remainingAgents > 0) {
      const swarmSize = Math.min(
        remainingAgents,
        Math.floor(Math.random() * 5) + 1 // 1-5 agents per swarm
      );

      configs.push({
        name: `load-test-${configs.length}-${Date.now()}`,
        task: `Synthetic load test task ${configs.length}`,
        initialAgents: swarmSize,
        maxAgents: swarmSize * 2,
        strategy: ['parallel', 'pipeline', 'map-reduce'][Math.floor(Math.random() * 3)] as any,
        model: 'test-model',
        enableEventStreaming: this.config.enableEventStreaming,
        enableBranching: this.config.enableBranching,
      });

      remainingAgents -= swarmSize;
    }

    return configs;
  }

  /**
   * Generate event load
   */
  private async generateEventLoad(swarmIds: string[], startTime: number): Promise<void> {
    const eventInterval = 1000 / this.config.eventRate;
    const totalEvents = Math.floor((this.config.durationMs / 1000) * this.config.eventRate * swarmIds.length);

    let eventsEmitted = 0;

    while (performance.now() - startTime < this.config.durationMs && eventsEmitted < totalEvents) {
      const eventStart = performance.now();

      for (const swarmId of swarmIds) {
        try {
          this.eventBus.emitEvent({
            id: `evt_${randomUUID().slice(0, 8)}`,
            type: 'agent_start',
            timestamp: Date.now(),
            agentId: `agent-${randomUUID().slice(0, 8)}`,
            swarmId,
            task: 'load test event',
            model: 'test-model',
            provider: 'test',
          });
          eventsEmitted++;
        } catch (error) {
          this.recordError(`Event emit failed: ${error}`);
        }
      }

      const eventTime = performance.now() - eventStart;
      this.eventDeliveryTimes.push(eventTime);

      await this.delay(eventInterval);
    }
  }

  /**
   * Generate message load
   */
  private async generateMessageLoad(swarmIds: string[], startTime: number): Promise<void> {
    const messageRate = this.config.eventRate * 2; // 2x event rate
    const messageInterval = 1000 / messageRate;

    while (performance.now() - startTime < this.config.durationMs) {
      const msgStart = performance.now();

      for (const swarmId of swarmIds) {
        try {
          this.messageBus.publish(
            MessageBus.swarmBroadcast(swarmId),
            {
              eventType: 'test.message',
              payload: this.generatePayload(this.config.payloadSize),
            },
            { priority: 'medium' }
          );
        } catch (error) {
          this.recordError(`Message publish failed: ${error}`);
        }
      }

      const routingTime = performance.now() - msgStart;
      this.messageRoutingTimes.push(routingTime);

      await this.delay(messageInterval);
    }
  }

  /**
   * Generate state transition load
   */
  private async generateStateTransitionLoad(swarmIds: string[], startTime: number): Promise<void> {
    const transitionInterval = 100; // Every 100ms

    while (performance.now() - startTime < this.config.durationMs) {
      const transitionStart = performance.now();

      // Get random agent and transition state
      const states = this.lifecycle.getAllStates();
      if (states.length > 0) {
        const randomState = states[Math.floor(Math.random() * states.length)];
        
        try {
          // Simulate state transitions
          if (randomState.status === AgentStatus.RUNNING) {
            await this.lifecycle.pause(randomState.id);
          } else if (randomState.status === AgentStatus.PAUSED) {
            await this.lifecycle.resume(randomState.id);
          }
        } catch (error) {
          // Ignore transition errors in load test
        }
      }

      const transitionTime = performance.now() - transitionStart;
      this.stateTransitionTimes.push(transitionTime);

      await this.delay(transitionInterval);
    }
  }

  /**
   * Monitor memory usage
   */
  private async monitorMemory(): Promise<void> {
    const checkInterval = 100;
    const startTime = performance.now();

    while (performance.now() - startTime < this.config.durationMs + this.config.warmupMs) {
      const usage = process.memoryUsage();
      if (usage.heapUsed > this.peakHeapUsed) {
        this.peakHeapUsed = usage.heapUsed;
      }
      await this.delay(checkInterval);
    }
  }

  /**
   * Calculate test results
   */
  private calculateResults(
    startTime: number,
    endTime: number,
    startMemory: NodeJS.MemoryUsage,
    endMemory: NodeJS.MemoryUsage
  ): LoadTestResult {
    const testDuration = endTime - startTime;
    const eventBusMetrics = this.eventBus.getMetrics();
    const lifecycleMetrics = this.lifecycle.getMetrics();

    return {
      config: this.config,
      timestamp: new Date().toISOString(),
      testDuration,
      latency: {
        spawnTime: this.calculatePercentiles(this.spawnTimes),
        eventDelivery: this.calculatePercentiles(this.eventDeliveryTimes),
        messageRouting: this.calculatePercentiles(this.messageRoutingTimes),
        stateTransition: this.calculatePercentiles(this.stateTransitionTimes),
      },
      throughput: {
        eventsPerSecond: (eventBusMetrics.eventsEmitted / testDuration) * 1000,
        messagesPerSecond: (this.messageBus.getMetrics().messagesPublished / testDuration) * 1000,
        stateTransitionsPerSecond: (this.stateTransitionTimes.length / testDuration) * 1000,
        totalEvents: eventBusMetrics.eventsEmitted,
        totalMessages: this.messageBus.getMetrics().messagesPublished,
        totalStateTransitions: this.stateTransitionTimes.length,
      },
      memory: {
        heapUsedStart: startMemory.heapUsed,
        heapUsedEnd: endMemory.heapUsed,
        heapUsedPeak: this.peakHeapUsed,
        heapGrowth: endMemory.heapUsed - startMemory.heapUsed,
        eventBusMemory: this.estimateEventBusMemory() - this.eventBusMemoryStart,
        storageMemory: this.estimateStorageMemory() - this.storageMemoryStart,
        rssStart: startMemory.rss,
        rssEnd: endMemory.rss,
      },
      eventBus: {
        eventsEmitted: eventBusMetrics.eventsEmitted,
        eventsDelivered: eventBusMetrics.eventsDelivered,
        eventsDropped: eventBusMetrics.eventsEmitted - eventBusMetrics.eventsDelivered,
        deliveryRate: eventBusMetrics.eventsEmitted > 0
          ? eventBusMetrics.eventsDelivered / eventBusMetrics.eventsEmitted
          : 1,
        subscriptionCount: this.eventBus.listenerCount('agent:event'),
        messageCount: this.messageBus.getAllMessages().length,
      },
      lifecycle: lifecycleMetrics,
      errors: Array.from(this.errors.entries()).map(([message, count]) => ({ message, count })),
      success: this.errors.size === 0 && eventBusMetrics.eventsDelivered > 0,
    };
  }

  /**
   * Calculate percentiles for an array of values
   */
  private calculatePercentiles(values: number[]) {
    if (values.length === 0) {
      return { min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0 };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);

    return {
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: sum / sorted.length,
      p50: this.getPercentile(sorted, 0.5),
      p95: this.getPercentile(sorted, 0.95),
      p99: this.getPercentile(sorted, 0.99),
    };
  }

  /**
   * Get percentile value
   */
  private getPercentile(sorted: number[], percentile: number): number {
    const index = Math.ceil(sorted.length * percentile) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Estimate event bus memory usage
   */
  private estimateEventBusMemory(): number {
    // Rough estimate based on event log size
    return this.eventBus.getRecentEvents().length * 500; // ~500 bytes per event
  }

  /**
   * Estimate storage memory usage
   */
  private estimateStorageMemory(): number {
    return this.memoryStore.getStats().agents * 1000; // ~1KB per agent
  }

  /**
   * Record an error
   */
  private recordError(message: string): void {
    const count = this.errors.get(message) || 0;
    this.errors.set(message, count + 1);
  }

  /**
   * Clear all metrics
   */
  private clearMetrics(): void {
    this.spawnTimes = [];
    this.eventDeliveryTimes = [];
    this.messageRoutingTimes = [];
    this.stateTransitionTimes = [];
    this.errors.clear();
    this.peakHeapUsed = 0;
  }

  /**
   * Generate a payload of specified size
   */
  private generatePayload(sizeBytes: number): object {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < sizeBytes; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return { data: result, timestamp: Date.now() };
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Predefined Test Configurations
// ============================================================================

export const TestScenarios = {
  /** 10 agents - baseline test */
  baseline10: (): LoadTestConfig => ({
    agentCount: 10,
    durationMs: 30000, // 30 seconds
    eventRate: 10,
    payloadSize: 1024,
    enableEventStreaming: true,
    enableBranching: false,
    warmupMs: 5000,
  }),

  /** 20 agents - moderate load */
  moderate20: (): LoadTestConfig => ({
    agentCount: 20,
    durationMs: 30000,
    eventRate: 10,
    payloadSize: 1024,
    enableEventStreaming: true,
    enableBranching: false,
    warmupMs: 5000,
  }),

  /** 50 agents - high load */
  high50: (): LoadTestConfig => ({
    agentCount: 50,
    durationMs: 60000, // 60 seconds
    eventRate: 10,
    payloadSize: 1024,
    enableEventStreaming: true,
    enableBranching: true,
    warmupMs: 10000,
  }),

  /** 100 agents - stress test */
  stress100: (): LoadTestConfig => ({
    agentCount: 100,
    durationMs: 60000,
    eventRate: 10,
    payloadSize: 1024,
    enableEventStreaming: true,
    enableBranching: true,
    warmupMs: 10000,
  }),

  /** Custom configuration */
  custom: (agentCount: number, durationMs: number = 30000): LoadTestConfig => ({
    agentCount,
    durationMs,
    eventRate: 10,
    payloadSize: 1024,
    enableEventStreaming: true,
    enableBranching: agentCount >= 50,
    warmupMs: Math.min(10000, durationMs * 0.1),
  }),
};

// ============================================================================
// Main Export
// ============================================================================

export async function runLoadTest(config: LoadTestConfig): Promise<LoadTestResult> {
  const generator = new LoadTestGenerator(config);
  return generator.run();
}

export default LoadTestGenerator;
