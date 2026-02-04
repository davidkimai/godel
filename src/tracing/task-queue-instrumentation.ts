/**
 * Task Queue Tracing Instrumentation
 * 
 * Instruments the task queue for distributed tracing.
 * Tracks task enqueue, dequeue, processing, and completion.
 */

import { SpanKind, type Context } from '@opentelemetry/api';
import { 
  withSpan, 
  setBaggage, 
  getBaggage,
  serializeContext,
  deserializeContext,
  getCurrentTraceId,
  type EventContext 
} from './opentelemetry';
import { logger } from '../utils/logger';
import type { QueuedTask, TaskQueueStatus, DistributionStrategy } from '../queue/types';

// ============================================================================
// Types
// ============================================================================

export interface TaskTraceContext {
  taskId: string;
  taskType: string;
  traceContext: EventContext;
}

// ============================================================================
// Span Names
// ============================================================================

const SPAN_NAMES = {
  TASK_ENQUEUE: 'task.enqueue',
  TASK_DEQUEUE: 'task.dequeue',
  TASK_CLAIM: 'task.claim',
  TASK_START: 'task.start',
  TASK_COMPLETE: 'task.complete',
  TASK_FAIL: 'task.fail',
  TASK_RETRY: 'task.retry',
  TASK_CANCEL: 'task.cancel',
  TASK_DISTRIBUTE: 'task.distribute',
  TASK_DEAD_LETTER: 'task.dead_letter',
  AGENT_REGISTER: 'agent.register',
  AGENT_UNREGISTER: 'agent.unregister',
  AGENT_HEARTBEAT: 'agent.heartbeat',
} as const;

// ============================================================================
// Task Instrumentation
// ============================================================================

/**
 * Instrument task enqueue operation
 */
export async function instrumentTaskEnqueue<T>(
  taskType: string,
  priority: string,
  fn: () => Promise<T>,
  options?: {
    delayMs?: number;
    scheduledFor?: Date;
    requiredSkills?: string[];
    correlationId?: string;
  }
): Promise<T> {
  const attributes = {
    'task.type': taskType,
    'task.priority': priority,
    'task.delay_ms': options?.delayMs || 0,
    'task.scheduled': options?.scheduledFor ? options.scheduledFor.toISOString() : '',
    'task.required_skills': options?.requiredSkills?.join(',') || '',
    'task.correlation_id': options?.correlationId || '',
  };

  return withSpan(SPAN_NAMES.TASK_ENQUEUE, async (span) => {
    span.setAttributes(attributes);

    // Set correlation ID as baggage if provided
    if (options?.correlationId) {
      setBaggage('task.correlation_id', options.correlationId);
    }
    setBaggage('task.type', taskType);

    try {
      const result = await fn();
      span.setAttribute('task.enqueue_success', true);
      return result;
    } catch (error) {
      span.setAttributes({
        'task.enqueue_success': false,
        'error.type': error instanceof Error ? error.name : 'Unknown',
      });
      throw error;
    }
  }, {
    kind: SpanKind.PRODUCER,
    attributes,
  });
}

/**
 * Instrument task dequeue operation
 */
export async function instrumentTaskDequeue<T>(
  agentId: string,
  fn: () => Promise<T>
): Promise<T> {
  return withSpan(SPAN_NAMES.TASK_DEQUEUE, async (span) => {
    span.setAttribute('agent.id', agentId);

    try {
      const result = await fn();
      
      if (result) {
        const task = result as QueuedTask;
        span.setAttributes({
          'task.dequeue_success': true,
          'task.id': task.id,
          'task.type': task.type,
          'task.priority': task.priority,
        });
        
        // Propagate task context
        setBaggage('task.id', task.id);
        setBaggage('task.type', task.type);
      } else {
        span.setAttribute('task.dequeue_success', false);
        span.setAttribute('task.dequeue_empty', true);
      }
      
      return result;
    } catch (error) {
      span.setAttributes({
        'task.dequeue_success': false,
        'error.type': error instanceof Error ? error.name : 'Unknown',
      });
      throw error;
    }
  }, {
    kind: SpanKind.CONSUMER,
  });
}

/**
 * Instrument task claim operation (with distribution)
 */
export async function instrumentTaskClaim<T>(
  fn: () => Promise<T>
): Promise<T> {
  return withSpan(SPAN_NAMES.TASK_CLAIM, async (span) => {
    try {
      const result = await fn();
      
      if (result) {
        const task = result as QueuedTask;
        span.setAttributes({
          'task.claim_success': true,
          'task.id': task.id,
          'task.type': task.type,
          'task.assignee_id': task.assigneeId || '',
        });
        
        setBaggage('task.id', task.id);
      } else {
        span.setAttribute('task.claim_success', false);
      }
      
      return result;
    } catch (error) {
      span.setAttributes({
        'task.claim_success': false,
        'error.type': error instanceof Error ? error.name : 'Unknown',
      });
      throw error;
    }
  });
}

/**
 * Instrument task start
 */
export async function instrumentTaskStart<T>(
  taskId: string,
  taskType: string,
  agentId: string,
  fn: () => Promise<T>
): Promise<T> {
  return withSpan(SPAN_NAMES.TASK_START, async (span) => {
    span.setAttributes({
      'task.id': taskId,
      'task.type': taskType,
      'agent.id': agentId,
    });

    setBaggage('task.id', taskId);

    const startTime = Date.now();

    try {
      const result = await fn();
      const duration = Date.now() - startTime;
      
      span.setAttributes({
        'task.processing_duration_ms': duration,
        'task.start_success': true,
      });
      
      return result;
    } catch (error) {
      span.setAttributes({
        'task.start_success': false,
        'error.type': error instanceof Error ? error.name : 'Unknown',
      });
      throw error;
    }
  });
}

/**
 * Instrument task complete
 */
export async function instrumentTaskComplete<T>(
  taskId: string,
  processingTimeMs: number,
  fn: () => Promise<T>
): Promise<T> {
  return withSpan(SPAN_NAMES.TASK_COMPLETE, async (span) => {
    span.setAttributes({
      'task.id': taskId,
      'task.processing_time_ms': processingTimeMs,
    });

    try {
      const result = await fn();
      span.setAttribute('task.complete_success', true);
      return result;
    } catch (error) {
      span.setAttributes({
        'task.complete_success': false,
        'error.type': error instanceof Error ? error.name : 'Unknown',
      });
      throw error;
    }
  });
}

/**
 * Instrument task fail
 */
export async function instrumentTaskFail<T>(
  taskId: string,
  error: string,
  retryCount: number,
  maxRetries: number,
  willRetry: boolean,
  fn: () => Promise<T>
): Promise<T> {
  return withSpan(SPAN_NAMES.TASK_FAIL, async (span) => {
    span.setAttributes({
      'task.id': taskId,
      'task.error': error.slice(0, 500),
      'task.retry_count': retryCount,
      'task.max_retries': maxRetries,
      'task.will_retry': willRetry,
    });

    try {
      const result = await fn();
      span.setAttribute('task.fail_handled', true);
      return result;
    } catch (err) {
      span.setAttribute('task.fail_handled', false);
      throw err;
    }
  });
}

/**
 * Instrument task distribution
 */
export async function instrumentTaskDistribution<T>(
  taskId: string,
  strategy: DistributionStrategy,
  fn: () => Promise<T>
): Promise<T> {
  return withSpan(SPAN_NAMES.TASK_DISTRIBUTE, async (span) => {
    span.setAttributes({
      'task.id': taskId,
      'distribution.strategy': strategy,
    });

    try {
      const result = await fn();
      
      if (result) {
        const dist = result as { agentId: string; reason?: string };
        span.setAttributes({
          'distribution.success': true,
          'distribution.agent_id': dist.agentId,
          'distribution.reason': dist.reason || '',
        });
      } else {
        span.setAttribute('distribution.success', false);
      }
      
      return result;
    } catch (error) {
      span.setAttributes({
        'distribution.success': false,
        'error.type': error instanceof Error ? error.name : 'Unknown',
      });
      throw error;
    }
  });
}

/**
 * Instrument dead letter queue operation
 */
export async function instrumentDeadLetter<T>(
  taskId: string,
  reason: string,
  fn: () => Promise<T>
): Promise<T> {
  return withSpan(SPAN_NAMES.TASK_DEAD_LETTER, async (span) => {
    span.setAttributes({
      'task.id': taskId,
      'dead_letter.reason': reason.slice(0, 500),
    });

    try {
      const result = await fn();
      span.setAttribute('dead_letter.success', true);
      return result;
    } catch (error) {
      span.setAttributes({
        'dead_letter.success': false,
        'error.type': error instanceof Error ? error.name : 'Unknown',
      });
      throw error;
    }
  });
}

// ============================================================================
// Agent Management Instrumentation
// ============================================================================

/**
 * Instrument agent registration
 */
export async function instrumentAgentRegister<T>(
  agentId: string,
  skills: string[],
  capacity: number,
  fn: () => Promise<T>
): Promise<T> {
  return withSpan(SPAN_NAMES.AGENT_REGISTER, async (span) => {
    span.setAttributes({
      'worker_agent.id': agentId,
      'worker_agent.skills': skills.join(','),
      'worker_agent.capacity': capacity,
    });

    try {
      const result = await fn();
      span.setAttribute('worker_agent.register_success', true);
      return result;
    } catch (error) {
      span.setAttributes({
        'worker_agent.register_success': false,
        'error.type': error instanceof Error ? error.name : 'Unknown',
      });
      throw error;
    }
  });
}

/**
 * Instrument agent unregistration
 */
export async function instrumentAgentUnregister<T>(
  agentId: string,
  fn: () => Promise<T>
): Promise<T> {
  return withSpan(SPAN_NAMES.AGENT_UNREGISTER, async (span) => {
    span.setAttribute('worker_agent.id', agentId);

    try {
      const result = await fn();
      span.setAttribute('worker_agent.unregister_success', true);
      return result;
    } catch (error) {
      span.setAttributes({
        'worker_agent.unregister_success': false,
        'error.type': error instanceof Error ? error.name : 'Unknown',
      });
      throw error;
    }
  });
}

/**
 * Instrument agent heartbeat
 */
export function instrumentAgentHeartbeat(
  agentId: string,
  load: number,
  status: string
): void {
  // Heartbeats are high-frequency, use a simple span
  const { trace } = require('@opentelemetry/api');
  const tracer = trace.getTracer('dash-task-queue');
  const span = tracer.startSpan(SPAN_NAMES.AGENT_HEARTBEAT);
  
  span.setAttributes({
    'worker_agent.id': agentId,
    'worker_agent.load': load,
    'worker_agent.status': status,
  });
  
  span.end();
}

// ============================================================================
// Trace Context for Tasks
// ============================================================================

/**
 * Create trace context for a task
 * This can be stored with the task and restored when processing
 */
export function createTaskTraceContext(
  taskId: string,
  taskType: string
): TaskTraceContext {
  return {
    taskId,
    taskType,
    traceContext: serializeContext(),
  };
}

/**
 * Restore trace context for task processing
 */
export function restoreTaskTraceContext(ctx: TaskTraceContext): Context {
  const restoredContext = deserializeContext(ctx.traceContext);
  
  // Set task baggage
  setBaggage('task.id', ctx.taskId);
  setBaggage('task.type', ctx.taskType);
  
  return restoredContext;
}

// ============================================================================
// Logging with Trace Correlation
// ============================================================================

/**
 * Log task event with trace correlation
 */
export function logTaskEvent(
  eventType: string,
  taskId: string,
  data?: Record<string, unknown>
): void {
  const traceId = getCurrentTraceId();
  const correlationId = getBaggage('task.correlation_id');
  
  logger.info({
    event: eventType,
    task_id: taskId,
    trace_id: traceId,
    correlation_id: correlationId,
    ...data,
  }, `[TaskTracing] ${eventType}`);
}

// ============================================================================
// Exports
// ============================================================================

export { SPAN_NAMES };
