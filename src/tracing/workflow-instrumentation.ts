/**
 * Workflow Tracing Instrumentation
 * 
 * Instruments the workflow engine for distributed tracing.
 * Tracks workflow execution, step execution, and state transitions.
 */

import { SpanKind, type Span } from '@opentelemetry/api';
import { 
  withSpan, 
  createSpan,
  setBaggage, 
  getBaggage,
  serializeContext,
  deserializeContext,
  getCurrentTraceId,
  context,
  trace,
  type EventContext 
} from './opentelemetry';
import { logger } from '../utils/logger';
import type { Workflow, WorkflowStep, WorkflowStatus, StepStatus } from '../workflow/types';

// ============================================================================
// Types
// ============================================================================

export interface WorkflowTraceContext {
  workflowId: string;
  executionId: string;
  traceContext: EventContext;
}

// ============================================================================
// Span Names
// ============================================================================

const SPAN_NAMES = {
  WORKFLOW_EXECUTE: 'workflow.execute',
  WORKFLOW_VALIDATE: 'workflow.validate',
  WORKFLOW_LAYER_EXECUTE: 'workflow.layer_execute',
  WORKFLOW_PAUSE: 'workflow.pause',
  WORKFLOW_RESUME: 'workflow.resume',
  WORKFLOW_CANCEL: 'workflow.cancel',
  STEP_EXECUTE: 'step.execute',
  STEP_CONDITION_EVAL: 'step.condition_eval',
  STEP_RETRY: 'step.retry',
} as const;

// ============================================================================
// Workflow Instrumentation
// ============================================================================

/**
 * Instrument workflow execution
 */
export async function instrumentWorkflowExecution<T>(
  workflow: Workflow,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  const attributes = {
    'workflow.id': workflow.id || workflow.name,
    'workflow.name': workflow.name,
    'workflow.version': workflow.version,
    'workflow.step_count': workflow.steps.length,
    'workflow.on_failure': workflow.onFailure,
    'workflow.timeout_ms': workflow.timeout || 0,
  };

  // Set workflow baggage
  setBaggage('workflow.id', workflow.id || workflow.name);
  setBaggage('workflow.name', workflow.name);

  return withSpan(SPAN_NAMES.WORKFLOW_EXECUTE, async (span) => {
    span.setAttributes(attributes);

    const startTime = Date.now();

    try {
      const result = await fn(span);
      const duration = Date.now() - startTime;
      
      span.setAttributes({
        'workflow.duration_ms': duration,
        'workflow.success': true,
      });
      
      logger.info(`[WorkflowTracing] Workflow ${workflow.name} completed in ${duration}ms`);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      span.setAttributes({
        'workflow.duration_ms': duration,
        'workflow.success': false,
        'error.type': error instanceof Error ? error.name : 'Unknown',
      });
      
      throw error;
    }
  }, {
    kind: SpanKind.INTERNAL,
    attributes,
  });
}

/**
 * Instrument workflow validation
 */
export async function instrumentWorkflowValidation<T>(
  workflow: Workflow,
  fn: () => Promise<T>
): Promise<T> {
  return withSpan(SPAN_NAMES.WORKFLOW_VALIDATE, async (span) => {
    span.setAttributes({
      'workflow.id': workflow.id || workflow.name,
      'workflow.name': workflow.name,
      'workflow.step_count': workflow.steps.length,
    });

    try {
      const result = await fn();
      
      if (result && typeof result === 'object') {
        const validation = result as unknown as { valid: boolean; errors: string[] };
        span.setAttributes({
          'validation.valid': validation.valid,
          'validation.error_count': validation.errors.length,
        });
        
        if (!validation.valid) {
          span.setAttribute('validation.errors', validation.errors.join('; '));
        }
      }
      
      return result;
    } catch (error) {
      span.setAttributes({
        'validation.success': false,
        'error.type': error instanceof Error ? error.name : 'Unknown',
      });
      throw error;
    }
  });
}

/**
 * Instrument workflow layer execution (parallel steps)
 */
export async function instrumentLayerExecution<T>(
  executionId: string,
  workflowId: string,
  layerIndex: number,
  stepCount: number,
  fn: () => Promise<T>
): Promise<T> {
  return withSpan(SPAN_NAMES.WORKFLOW_LAYER_EXECUTE, async (span) => {
    span.setAttributes({
      'workflow.execution_id': executionId,
      'workflow.id': workflowId,
      'layer.index': layerIndex,
      'layer.step_count': stepCount,
    });

    const startTime = Date.now();

    try {
      const result = await fn();
      const duration = Date.now() - startTime;
      
      span.setAttributes({
        'layer.duration_ms': duration,
        'layer.success': true,
      });
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      span.setAttributes({
        'layer.duration_ms': duration,
        'layer.success': false,
        'error.type': error instanceof Error ? error.name : 'Unknown',
      });
      
      throw error;
    }
  });
}

/**
 * Instrument workflow control operations (pause/resume/cancel)
 */
export async function instrumentWorkflowControl<T>(
  operation: 'pause' | 'resume' | 'cancel',
  executionId: string,
  fn: () => Promise<T>
): Promise<T> {
  const spanName = SPAN_NAMES[`WORKFLOW_${operation.toUpperCase()}` as keyof typeof SPAN_NAMES];
  
  return withSpan(spanName, async (span) => {
    span.setAttributes({
      'workflow.execution_id': executionId,
      'workflow.operation': operation,
    });

    try {
      const result = await fn();
      span.setAttribute('workflow.control_success', true);
      return result;
    } catch (error) {
      span.setAttributes({
        'workflow.control_success': false,
        'error.type': error instanceof Error ? error.name : 'Unknown',
      });
      throw error;
    }
  });
}

// ============================================================================
// Step Instrumentation
// ============================================================================

/**
 * Instrument step execution
 */
export async function instrumentStepExecution<T>(
  step: WorkflowStep,
  executionId: string,
  attempt: number,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  const attributes = {
    'step.id': step.id,
    'step.name': step.name,
    'step.agent': step.agent,
    'step.task': step.task.slice(0, 100),
    'step.depends_on': step.dependsOn.join(','),
    'step.next': step.next.join(','),
    'step.timeout_ms': step.timeout || 0,
    'step.max_attempts': step.retry?.maxAttempts || 1,
    'step.parallel': step.parallel,
    'workflow.execution_id': executionId,
    'step.attempt': attempt,
  };

  setBaggage('step.id', step.id);
  setBaggage('step.name', step.name);

  return withSpan(SPAN_NAMES.STEP_EXECUTE, async (span) => {
    span.setAttributes(attributes);

    const startTime = Date.now();

    try {
      const result = await fn(span);
      const duration = Date.now() - startTime;
      
      span.setAttributes({
        'step.duration_ms': duration,
        'step.success': true,
      });
      
      logger.debug(`[WorkflowTracing] Step ${step.id} completed in ${duration}ms`);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      span.setAttributes({
        'step.duration_ms': duration,
        'step.success': false,
        'error.type': error instanceof Error ? error.name : 'Unknown',
      });
      
      throw error;
    }
  }, {
    kind: SpanKind.INTERNAL,
    attributes,
  });
}

/**
 * Instrument step condition evaluation
 */
export async function instrumentConditionEvaluation<T>(
  stepId: string,
  hasCondition: boolean,
  fn: () => Promise<T>
): Promise<T> {
  return withSpan(SPAN_NAMES.STEP_CONDITION_EVAL, async (span) => {
    span.setAttributes({
      'step.id': stepId,
      'condition.exists': hasCondition,
    });

    try {
      const result = await fn();
      
      if (typeof result === 'boolean') {
        span.setAttribute('condition.result', result);
      }
      
      return result;
    } catch (error) {
      span.setAttributes({
        'condition.success': false,
        'error.type': error instanceof Error ? error.name : 'Unknown',
      });
      throw error;
    }
  });
}

/**
 * Instrument step retry
 */
export async function instrumentStepRetry<T>(
  stepId: string,
  attempt: number,
  maxAttempts: number,
  delayMs: number,
  fn: () => Promise<T>
): Promise<T> {
  return withSpan(SPAN_NAMES.STEP_RETRY, async (span) => {
    span.setAttributes({
      'step.id': stepId,
      'retry.attempt': attempt,
      'retry.max_attempts': maxAttempts,
      'retry.delay_ms': delayMs,
    });

    try {
      const result = await fn();
      span.setAttribute('retry.success', true);
      return result;
    } catch (error) {
      span.setAttributes({
        'retry.success': false,
        'error.type': error instanceof Error ? error.name : 'Unknown',
      });
      throw error;
    }
  });
}

// ============================================================================
// Trace Context for Workflows
// ============================================================================

/**
 * Create trace context for workflow execution
 */
export function createWorkflowTraceContext(
  workflowId: string,
  executionId: string
): WorkflowTraceContext {
  return {
    workflowId,
    executionId,
    traceContext: serializeContext(),
  };
}

/**
 * Restore trace context for workflow execution
 */
export function restoreWorkflowTraceContext(ctx: WorkflowTraceContext) {
  const restoredContext = deserializeContext(ctx.traceContext);
  
  // Set workflow baggage
  setBaggage('workflow.id', ctx.workflowId);
  setBaggage('workflow.execution_id', ctx['executionId']);
  
  return restoredContext;
}

/**
 * Create a child span for a step within workflow context
 */
export function createStepSpan(
  stepId: string,
  stepName: string,
  parentContext?: ReturnType<typeof restoreWorkflowTraceContext>
) {
  const tracer = trace.getTracer('dash-workflow');
  const ctx = parentContext || context.active();
  
  return tracer.startSpan(
    SPAN_NAMES.STEP_EXECUTE,
    {
      kind: SpanKind.INTERNAL,
      attributes: {
        'step.id': stepId,
        'step.name': stepName,
      },
    },
    ctx
  );
}

// ============================================================================
// Event Tracking
// ============================================================================

/**
 * Track workflow event
 */
export function trackWorkflowEvent(
  eventType: string,
  executionId: string,
  workflowId: string,
  stepId?: string,
  data?: Record<string, unknown>
): void {
  const traceId = getCurrentTraceId();
  
  logger.info(`[WorkflowTracing] ${eventType}`, {
    event: eventType,
    workflow_execution_id: executionId,
    workflow_id: workflowId,
    step_id: stepId,
    trace_id: traceId,
    ...data,
  });
}

// ============================================================================
// Workflow Engine Wrapper
// ============================================================================

/**
 * Create traced workflow execution handler
 * Wraps the step execution handler to add tracing
 */
export function createTracedStepExecutor(
  executor: (step: WorkflowStep, context: unknown) => Promise<Record<string, unknown>>
) {
  return async (step: WorkflowStep, ctx: unknown): Promise<Record<string, unknown>> => {
    const executionId = getBaggage('workflow.execution_id') || 'unknown';
    const attempt = 1; // Would be passed from state machine
    
    return instrumentStepExecution(
      step,
      executionId,
      attempt,
      async () => {
        return executor(step, ctx);
      }
    );
  };
}

// ============================================================================
// Exports
// ============================================================================

export { SPAN_NAMES };
