/**
 * Task Queue Module
 * 
 * Redis-backed task queue with work distribution.
 * 
 * Features:
 * - Priority queue support (critical > high > medium > low)
 * - Delayed task execution (schedule for future)
 * - Task retry with exponential backoff
 * - Dead letter queue for failed tasks
 * - Multiple work distribution strategies
 * - Prometheus metrics export
 * 
 * @example
 * ```typescript
 * import { TaskQueue, getGlobalTaskQueue } from './queue';
 * 
 * const queue = new TaskQueue({
 *   redis: { host: 'localhost', port: 6379 },
 *   defaultStrategy: 'load-based',
 * });
 * 
 * await queue.start();
 * 
 * // Register an agent
 * await queue.registerAgent({
 *   id: 'agent-1',
 *   skills: ['typescript', 'testing'],
 *   capacity: 5,
 * });
 * 
 * // Enqueue a task
 * const task = await queue.enqueue({
 *   type: 'code-review',
 *   payload: { file: 'src/index.ts' },
 *   priority: 'high',
 *   requiredSkills: ['typescript'],
 * });
 * 
 * // Agent claims work
 * const work = await queue.claimTask('agent-1');
 * ```
 */

// Core exports
export { TaskQueue } from './task-queue';
export { QueueMetricsCollector } from './metrics';
export {
  roundRobinDistribution,
  loadBasedDistribution,
  skillBasedDistribution,
  stickyDistribution,
  distributeTask,
  createDistributionContext,
  selectDistributionStrategy,
} from './work-distributor';
export { TaskQueueIntegration } from './integration';

// Types
export type {
  QueuedTask,
  EnqueueTaskOptions,
  TaskAgent,
  RegisterAgentOptions,
  TaskQueueConfig,
  TaskQueueStatus,
  QueueEvent,
  QueueEventHandler,
  QueueEventType,
  QueueMetrics,
  TaskResult,
  DeadLetterEntry,
  DistributionStrategy,
  DistributionResult,
  DistributionContext,
} from './types';

export type {
  TaskQueueIntegrationConfig,
} from './integration';

// Singleton instance
import { logger } from '../utils/logger';
import { TaskQueue } from './task-queue';

let globalTaskQueue: TaskQueue | null = null;

export function getGlobalTaskQueue(
  config?: ConstructorParameters<typeof TaskQueue>[0]
): TaskQueue {
  if (!globalTaskQueue) {
    if (!config) {
      throw new Error('TaskQueue not initialized. Provide config or call initialize first.');
    }
    globalTaskQueue = new TaskQueue(config);
  }
  return globalTaskQueue;
}

export function resetGlobalTaskQueue(): void {
  if (globalTaskQueue) {
    globalTaskQueue.stop().catch((error) => {
      logger.error('queue', 'Failed to stop global task queue', {
        error: error instanceof Error ? error.message : String(error),
      });
    });
    globalTaskQueue = null;
  }
}
