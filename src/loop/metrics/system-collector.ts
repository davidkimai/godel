/**
 * System Metrics Collector - Collects metrics from system events
 * 
 * Integrates with the event bus to automatically track system metrics.
 */

import { MetricsRegistry, MetricSnapshot } from './registry.js';
import { TimeSeriesStorage } from './storage.js';
import { Counter, Gauge, Histogram } from './types.js';
import { createLogger } from '../../utils/logger.js';

/**
 * Module logger
 */
const log = createLogger('system-metrics-collector');

/**
 * Event bus interface for metrics collection
 */
export interface EventBus {
  subscribe(event: string, handler: (event: SystemEvent) => void): void;
  unsubscribe?(event: string, handler: (event: SystemEvent) => void): void;
}

/**
 * System event structure
 */
export interface SystemEvent {
  type: string;
  timestamp: number;
  payload: Record<string, unknown>;
  source?: string;
}

/**
 * Agent registry interface for agent metrics
 */
export interface AgentRegistry {
  getAll(): Array<{ id: string; state: string; busy: boolean }>;
  getCount(): number;
  getBusyCount(): number;
}

/**
 * Task queue interface for queue metrics
 */
export interface TaskQueue {
  size(): number;
}

/**
 * Configuration for system metrics collector
 */
export interface SystemMetricsCollectorOptions {
  collectionInterval?: number;  // Collection interval in ms (default: 5000)
  enableRuntimeMetrics?: boolean;  // Enable Node.js runtime metrics
  prefix?: string;  // Metric name prefix
}

/**
 * System metrics collector that listens to events and periodically collects metrics
 */
export class SystemMetricsCollector {
  private registry: MetricsRegistry;
  private interval: NodeJS.Timeout | null = null;
  private eventHandlers: Map<string, (event: SystemEvent) => void> = new Map();
  private agentRegistry?: AgentRegistry;
  private taskQueue?: TaskQueue;
  private options: Required<SystemMetricsCollectorOptions>;
  private runtimeInterval: NodeJS.Timeout | null = null;

  constructor(
    private storage: TimeSeriesStorage,
    private eventBus: EventBus,
    options: SystemMetricsCollectorOptions = {}
  ) {
    this.options = {
      collectionInterval: 5000,
      enableRuntimeMetrics: true,
      prefix: 'godel_',
      ...options
    };

    this.registry = new MetricsRegistry({ prefix: this.options.prefix });
    this.initializeMetrics();
  }

  /**
   * Set agent registry for agent metrics
   */
  setAgentRegistry(registry: AgentRegistry): void {
    this.agentRegistry = registry;
  }

  /**
   * Set task queue for queue metrics
   */
  setTaskQueue(queue: TaskQueue): void {
    this.taskQueue = queue;
  }

  /**
   * Initialize all system metrics
   */
  private initializeMetrics(): void {
    // Agent metrics
    this.registry.register({
      name: 'agents_total',
      type: 'gauge',
      description: 'Total number of registered agents'
    });

    this.registry.register({
      name: 'agents_busy',
      type: 'gauge',
      description: 'Number of busy agents'
    });

    this.registry.register({
      name: 'agents_idle',
      type: 'gauge',
      description: 'Number of idle agents'
    });

    // Task metrics
    this.registry.register({
      name: 'tasks_completed_total',
      type: 'counter',
      description: 'Total tasks completed'
    });

    this.registry.register({
      name: 'tasks_failed_total',
      type: 'counter',
      description: 'Total tasks failed'
    });

    this.registry.register({
      name: 'tasks_submitted_total',
      type: 'counter',
      description: 'Total tasks submitted'
    });

    this.registry.register({
      name: 'tasks_cancelled_total',
      type: 'counter',
      description: 'Total tasks cancelled'
    });

    this.registry.register({
      name: 'task_duration_seconds',
      type: 'histogram',
      description: 'Task execution duration in seconds',
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120, 300]
    });

    this.registry.register({
      name: 'task_queue_depth',
      type: 'gauge',
      description: 'Current task queue depth'
    });

    this.registry.register({
      name: 'task_wait_time_seconds',
      type: 'histogram',
      description: 'Time tasks wait in queue before execution',
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60]
    });

    // Event bus metrics
    this.registry.register({
      name: 'event_bus_messages_total',
      type: 'counter',
      description: 'Total messages published to event bus'
    });

    this.registry.register({
      name: 'event_bus_subscribers',
      type: 'gauge',
      description: 'Number of event bus subscribers'
    });

    // Loop metrics
    this.registry.register({
      name: 'loop_iterations_total',
      type: 'counter',
      description: 'Total Godel loop iterations'
    });

    this.registry.register({
      name: 'loop_duration_seconds',
      type: 'histogram',
      description: 'Duration of each Godel loop iteration',
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30]
    });

    this.registry.register({
      name: 'reflections_completed_total',
      type: 'counter',
      description: 'Total reflections completed'
    });

    this.registry.register({
      name: 'reflection_duration_seconds',
      type: 'histogram',
      description: 'Duration of reflection operations',
      buckets: [0.1, 0.5, 1, 2, 5, 10]
    });

    // Memory metrics (if runtime metrics enabled)
    if (this.options.enableRuntimeMetrics) {
      this.registry.register({
        name: 'memory_heap_used_bytes',
        type: 'gauge',
        description: 'Heap memory used in bytes'
      });

      this.registry.register({
        name: 'memory_heap_total_bytes',
        type: 'gauge',
        description: 'Total heap memory in bytes'
      });

      this.registry.register({
        name: 'memory_rss_bytes',
        type: 'gauge',
        description: 'Resident set size in bytes'
      });

      this.registry.register({
        name: 'memory_external_bytes',
        type: 'gauge',
        description: 'External memory usage in bytes'
      });

      this.registry.register({
        name: 'event_loop_lag_seconds',
        type: 'gauge',
        description: 'Event loop lag in seconds'
      });

      this.registry.register({
        name: 'gc_collections_total',
        type: 'counter',
        description: 'Total garbage collections'
      });
    }
  }

  /**
   * Start collecting metrics
   */
  start(): void {
    // Subscribe to events
    this.setupEventHandlers();

    // Start periodic collection
    this.interval = setInterval(() => {
      this.collectAndStore();
    }, this.options.collectionInterval);

    // Start runtime metrics collection
    if (this.options.enableRuntimeMetrics) {
      this.startRuntimeMetrics();
    }
  }

  /**
   * Stop collecting metrics
   */
  stop(): void {
    // Unsubscribe from events
    for (const [event, handler] of this.eventHandlers) {
      this.eventBus.unsubscribe?.(event, handler);
    }
    this.eventHandlers.clear();

    // Clear intervals
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    if (this.runtimeInterval) {
      clearInterval(this.runtimeInterval);
      this.runtimeInterval = null;
    }
  }

  /**
   * Setup event handlers for metrics
   */
  private setupEventHandlers(): void {
    // Task events
    this.on('task:completed', (event) => {
      this.registry.counter('tasks_completed_total').inc();
      
      // Record duration if available
      if (typeof event.payload['duration'] === 'number') {
        this.registry.histogram('task_duration_seconds')
          .observe(event.payload['duration'] / 1000);
      }

      // Record wait time if available
      if (typeof event.payload['waitTime'] === 'number') {
        this.registry.histogram('task_wait_time_seconds')
          .observe(event.payload['waitTime'] / 1000);
      }
    });

    this.on('task:failed', (event) => {
      this.registry.counter('tasks_failed_total').inc();
      
      // Record duration even for failed tasks
      if (typeof event.payload['duration'] === 'number') {
        this.registry.histogram('task_duration_seconds')
          .observe(event.payload['duration'] / 1000);
      }
    });

    this.on('task:submitted', () => {
      this.registry.counter('tasks_submitted_total').inc();
    });

    this.on('task:cancelled', () => {
      this.registry.counter('tasks_cancelled_total').inc();
    });

    // Agent events
    this.on('agent:state_changed', () => {
      this.updateAgentMetrics();
    });

    this.on('agent:registered', () => {
      this.updateAgentMetrics();
    });

    this.on('agent:deregistered', () => {
      this.updateAgentMetrics();
    });

    // Event bus metrics
    this.on('event:published', () => {
      this.registry.counter('event_bus_messages_total').inc();
    });

    // Loop events
    this.on('loop:iteration_completed', (event) => {
      this.registry.counter('loop_iterations_total').inc();
      
      if (typeof event.payload['duration'] === 'number') {
        this.registry.histogram('loop_duration_seconds')
          .observe(event.payload['duration'] / 1000);
      }
    });

    this.on('reflection:completed', (event) => {
      this.registry.counter('reflections_completed_total').inc();
      
      if (typeof event.payload['duration'] === 'number') {
        this.registry.histogram('reflection_duration_seconds')
          .observe(event.payload['duration'] / 1000);
      }
    });
  }

  /**
   * Subscribe to an event with tracking
   */
  private on(event: string, handler: (event: SystemEvent) => void): void {
    this.eventHandlers.set(event, handler);
    this.eventBus.subscribe(event, handler);
  }

  /**
   * Update agent-related metrics
   */
  private updateAgentMetrics(): void {
    if (!this.agentRegistry) return;

    const total = this.agentRegistry.getCount();
    const busy = this.agentRegistry.getBusyCount();
    const idle = total - busy;

    this.registry.gauge('agents_total').set(total);
    this.registry.gauge('agents_busy').set(busy);
    this.registry.gauge('agents_idle').set(idle);
  }

  /**
   * Update queue-related metrics
   */
  private updateQueueMetrics(): void {
    if (!this.taskQueue) return;

    const depth = this.taskQueue.size();
    this.registry.gauge('task_queue_depth').set(depth);
  }

  /**
   * Collect and store current metrics
   */
  private async collectAndStore(): Promise<void> {
    try {
      // Update dynamic metrics
      this.updateAgentMetrics();
      this.updateQueueMetrics();

      // Collect all metrics
      const snapshots = this.registry.collect();

      // Store in batch
      if (snapshots.length > 0) {
        await this.storage.writeBatch(snapshots);
      }
    } catch (error) {
      // Don't let metrics collection break the system
      log.logError('Failed to collect metrics', error);
    }
  }

  /**
   * Start collecting Node.js runtime metrics
   */
  private startRuntimeMetrics(): void {
    // Collect GC metrics if available (Node.js with --expose-gc)
    if (global.gc) {
      const originalGc = global.gc;
      global.gc = (): Promise<void> => {
        this.registry.counter('gc_collections_total').inc();
        originalGc(); return Promise.resolve();
      };
    }

    // Collect event loop lag
    this.runtimeInterval = setInterval(() => {
      const start = process.hrtime.bigint();
      
      setImmediate(() => {
        const end = process.hrtime.bigint();
        const lag = Number(end - start) / 1e9; // Convert to seconds
        this.registry.gauge('event_loop_lag_seconds').set(lag);
      });

      // Memory metrics
      const memUsage = process.memoryUsage();
      this.registry.gauge('memory_heap_used_bytes').set(memUsage.heapUsed);
      this.registry.gauge('memory_heap_total_bytes').set(memUsage.heapTotal);
      this.registry.gauge('memory_rss_bytes').set(memUsage.rss);
      this.registry.gauge('memory_external_bytes').set(memUsage.external);
    }, 1000);
  }

  /**
   * Get the metrics registry
   */
  getRegistry(): MetricsRegistry {
    return this.registry;
  }

  /**
   * Get current metrics as Prometheus format
   */
  toPrometheus(): string {
    return this.registry.toPrometheus();
  }

  /**
   * Get current metrics as JSON
   */
  toJSON(): object {
    return this.registry.toJSON();
  }

  /**
   * Get current snapshots
   */
  collect(): MetricSnapshot[] {
    this.updateAgentMetrics();
    this.updateQueueMetrics();
    return this.registry.collect();
  }

  /**
   * Manually trigger a metric collection
   */
  async flush(): Promise<void> {
    await this.collectAndStore();
  }
}

/**
 * Create a timer function for measuring durations
 */
export function timer(registry: MetricsRegistry, histogramName: string): () => void {
  return registry.histogram(histogramName).startTimer();
}

/**
 * Decorator/wrapper for timing async functions
 */
export async function timed<T>(
  registry: MetricsRegistry,
  histogramName: string,
  fn: () => Promise<T>
): Promise<T> {
  const end = timer(registry, histogramName);
  try {
    return await fn();
  } finally {
    end();
  }
}

/**
 * Decorator/wrapper for timing sync functions
 */
export function timedSync<T>(
  registry: MetricsRegistry,
  histogramName: string,
  fn: () => T
): T {
  const end = timer(registry, histogramName);
  try {
    return fn();
  } finally {
    end();
  }
}
