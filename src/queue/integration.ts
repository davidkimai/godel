/**
 * Task Queue Integration
 * 
 * Integrates the task queue system with other Godel components:
 * - Event bus for queue events
 * - PostgreSQL for task results persistence
 * - Auto-scaler for queue depth metrics
 * - Prometheus metrics export
 */

import { logger } from '../utils/logger';
import { TaskQueue } from './task-queue';
import { QueueMetricsCollector } from './metrics';
import { MessageBus } from '../bus';
import { EventRepository } from '../storage/repositories/EventRepository';
import type { QueueEvent, TaskResult, QueuedTask } from './types';
import type { MissionEvent } from '../events/types';

export interface TaskQueueIntegrationConfig {
  taskQueue: TaskQueue;
  eventBus?: MessageBus;
  eventRepository?: EventRepository;
  enableAutoScaling?: boolean;
  scaleUpThreshold?: number;
  scaleDownThreshold?: number;
}

export class TaskQueueIntegration {
  private taskQueue: TaskQueue;
  private eventBus?: MessageBus;
  private eventRepository?: EventRepository;
  private config: Required<Pick<TaskQueueIntegrationConfig, 'enableAutoScaling' | 'scaleUpThreshold' | 'scaleDownThreshold'>>;
  private eventSubscription?: string;
  private scalingInterval?: NodeJS.Timeout;

  constructor(config: TaskQueueIntegrationConfig) {
    this.taskQueue = config.taskQueue;
    this.eventBus = config.eventBus;
    this.eventRepository = config.eventRepository;
    this.config = {
      enableAutoScaling: config.enableAutoScaling ?? true,
      scaleUpThreshold: config.scaleUpThreshold ?? 10,
      scaleDownThreshold: config.scaleDownThreshold ?? 2,
    };
  }

  /**
   * Initialize all integrations
   */
  async initialize(): Promise<void> {
    logger.info('[TaskQueueIntegration] Initializing...');

    // Subscribe to queue events and forward to event bus
    this.setupEventForwarding();

    // Start auto-scaling monitor if enabled
    if (this.config.enableAutoScaling) {
      this.startAutoScalingMonitor();
    }

    logger.info('[TaskQueueIntegration] Initialized');
  }

  /**
   * Stop all integrations
   */
  async stop(): Promise<void> {
    logger.info('[TaskQueueIntegration] Stopping...');

    if (this.eventSubscription) {
      this.taskQueue.offEvent(this.eventSubscription);
    }

    if (this.scalingInterval) {
      clearInterval(this.scalingInterval);
    }

    logger.info('[TaskQueueIntegration] Stopped');
  }

  // ========================================================================
  // EVENT FORWARDING
  // ========================================================================

  /**
   * Setup forwarding of queue events to the event bus
   */
  private setupEventForwarding(): void {
    this.eventSubscription = this.taskQueue.onEvent(async (event: QueueEvent) => {
      try {
        // Forward to event bus if available
        if (this.eventBus) {
          this.forwardToEventBus(event);
        }

        // Persist to database if available
        if (this.eventRepository) {
          await this.persistToDatabase(event);
        }
      } catch (error) {
        logger.error('[TaskQueueIntegration] Event forwarding error:', error);
      }
    });
  }

  /**
   * Forward queue event to the event bus
   */
  private forwardToEventBus(event: QueueEvent): void {
    if (!this.eventBus) return;

    const missionEvent = this.convertToMissionEvent(event);
    if (missionEvent) {
      this.eventBus.publish(`task.${event.type}`, missionEvent, {
        source: 'task-queue',
        priority: this.getEventPriority(event.type),
      });
    }

    // Also emit to system alerts for important events
    if (event.type === 'task.dead_lettered') {
      this.eventBus.publish('system.alerts', {
        level: 'warning',
        message: `Task ${event.taskId} moved to dead letter queue`,
        component: 'task-queue',
        details: event.payload,
      }, {
        priority: 'high',
      });
    }
  }

  /**
   * Convert queue event to mission event format
   */
  private convertToMissionEvent(event: QueueEvent): MissionEvent | null {
    const baseEvent = {
      id: `queue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: event.timestamp,
      source: {
        agentId: event.agentId,
        taskId: event.taskId,
      },
    };

    switch (event.type) {
      case 'task.enqueued':
        return {
          ...baseEvent,
          eventType: 'task.created',
          payload: {
            taskId: event.taskId!,
            title: (event.payload?.['type'] as string) || 'unknown',
            description: 'Task enqueued in task queue',
            priority: (event.payload?.['priority'] as 'low' | 'medium' | 'high' | 'critical') || 'medium',
            dependsOn: [],
          },
        } as unknown as MissionEvent;

      case 'task.assigned':
        return {
          ...baseEvent,
          eventType: 'task.assigned',
          payload: {
            taskId: event.taskId!,
            assigneeId: event.agentId,
          },
        } as unknown as MissionEvent;

      case 'task.completed':
        return {
          ...baseEvent,
          eventType: 'task.completed',
          payload: {
            taskId: event.taskId!,
            runtime: ((event.payload?.['processingTimeMs'] as number) || 0) / 1000,
            output: event.payload?.['output'] as string,
          },
        } as unknown as MissionEvent;

      case 'task.failed':
      case 'task.dead_lettered':
        return {
          ...baseEvent,
          eventType: 'task.failed',
          payload: {
            taskId: event.taskId!,
            error: (event.payload?.['error'] as string) || (event.payload?.['reason'] as string) || 'Unknown error',
          },
        } as unknown as MissionEvent;

      default:
        return null;
    }
  }

  /**
   * Get event priority based on type
   */
  private getEventPriority(eventType: string): 'low' | 'medium' | 'high' | 'critical' {
    switch (eventType) {
      case 'task.dead_lettered':
      case 'queue.scaling_needed':
        return 'high';
      case 'task.failed':
        return 'medium';
      default:
        return 'low';
    }
  }

  /**
   * Persist queue event to database
   */
  private async persistToDatabase(event: QueueEvent): Promise<void> {
    if (!this.eventRepository) return;

    try {
      await this.eventRepository.create({
        team_id: undefined,
        agent_id: event.agentId,
        type: event.type,
        payload: {
          ...event.payload,
          taskId: event.taskId,
          timestamp: event.timestamp.toISOString(),
        },
        severity: this.getEventSeverity(event.type),
      });
    } catch (error) {
      logger.error('[TaskQueueIntegration] Database persistence error:', error);
    }
  }

  /**
   * Get event severity for database storage
   */
  private getEventSeverity(eventType: string): 'debug' | 'info' | 'warning' | 'error' {
    switch (eventType) {
      case 'task.dead_lettered':
        return 'error';
      case 'task.failed':
      case 'task.cancelled':
        return 'warning';
      case 'task.enqueued':
      case 'task.assigned':
      case 'task.started':
        return 'info';
      default:
        return 'debug';
    }
  }

  // ========================================================================
  // AUTO-SCALING INTEGRATION
  // ========================================================================

  /**
   * Start auto-scaling monitor
   */
  private startAutoScalingMonitor(): void {
    logger.info('[TaskQueueIntegration] Starting auto-scaling monitor');

    this.scalingInterval = setInterval(async () => {
      try {
        const metrics = await this.taskQueue.getMetrics();
        const queueDepth = metrics.pendingCount;

        // Check scale up threshold
        if (queueDepth >= this.config.scaleUpThreshold) {
          logger.warn(`[TaskQueueIntegration] Queue depth (${queueDepth}) exceeds scale-up threshold (${this.config.scaleUpThreshold})`);
          
          // Emit scaling event
          if (this.eventBus) {
            this.eventBus.publish('system.alerts', {
              level: 'warning',
              message: `Queue depth high: ${queueDepth} pending tasks`,
              component: 'task-queue',
              metric: 'queue_depth',
              currentValue: queueDepth,
              threshold: this.config.scaleUpThreshold,
              recommendation: 'Scale up agents to handle workload',
            }, {
              priority: 'high',
            });
          }

          // Also emit queue-specific scaling event
          await this.taskQueue.onEvent(async (event) => {
            if (event.type === 'queue.scaling_needed') {
              // This event is already handled by the auto-scaler
            }
          });
        }

        // Check scale down threshold
        if (queueDepth <= this.config.scaleDownThreshold) {
          logger.debug(`[TaskQueueIntegration] Queue depth (${queueDepth}) below scale-down threshold`);
        }
      } catch (error) {
        logger.error('[TaskQueueIntegration] Auto-scaling monitor error:', error);
      }
    }, 10000); // Check every 10 seconds
  }

  // ========================================================================
  // TASK RESULT PERSISTENCE
  // ========================================================================

  /**
   * Store task result in PostgreSQL
   */
  async storeTaskResult(task: QueuedTask, result: TaskResult): Promise<void> {
    if (!this.eventRepository) {
      logger.debug('[TaskQueueIntegration] No event repository configured, skipping result persistence');
      return;
    }

    try {
      // Store result as a completion event
      await this.eventRepository.create({
        team_id: undefined,
        agent_id: task.assigneeId,
        type: 'task.result_stored',
        payload: {
          taskId: task.id,
          taskType: task.type,
          success: result.success,
          output: result.output,
          error: result.error,
          processingTimeMs: result.processingTimeMs,
          retryCount: result.retryCount,
          completedAt: result.completedAt.toISOString(),
        },
        severity: result.success ? 'info' : 'warning',
      });

      logger.debug(`[TaskQueueIntegration] Task result stored for ${task.id}`);
    } catch (error) {
      logger.error('[TaskQueueIntegration] Failed to store task result:', error);
    }
  }
}

export default TaskQueueIntegration;
