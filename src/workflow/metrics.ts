/**
 * Workflow Metrics Collector
 * 
 * Collects and reports metrics for workflow executions,
 * including execution counts, durations, and step-level metrics.
 */

import { EventEmitter } from 'events';
import { WorkflowEngine, WorkflowEvent, WorkflowStatus, StepStatus } from './types';

export interface StepMetrics {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  totalDurationMs: number;
  averageDurationMs: number;
  minDurationMs: number;
  maxDurationMs: number;
}

export interface WorkflowMetrics {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  cancelledExecutions: number;
  pausedExecutions: number;
  totalDurationMs: number;
  averageDurationMs: number;
  minDurationMs: number;
  maxDurationMs: number;
  stepMetrics: Map<string, StepMetrics>;
}

export class WorkflowMetricsCollector extends EventEmitter {
  private metrics = new Map<string, WorkflowMetrics>();
  private stepStartTimes = new Map<string, number>();
  private workflowStartTimes = new Map<string, number>();

  constructor(private engine: WorkflowEngine) {
    super();
    this.attachListeners();
  }

  private attachListeners(): void {
    // Workflow events
    this.engine.on('workflow:start', (event: WorkflowEvent) => {
      this.workflowStartTimes.set(event.executionId, event.timestamp);
    });

    this.engine.on('workflow:complete', (event: WorkflowEvent) => {
      this.recordWorkflowCompletion(event, true);
    });

    this.engine.on('workflow:fail', (event: WorkflowEvent) => {
      this.recordWorkflowCompletion(event, false);
    });

    this.engine.on('workflow:cancel', (event: WorkflowEvent) => {
      this.recordWorkflowCancellation(event);
    });

    // Step events
    this.engine.on('step:start', (event: WorkflowEvent) => {
      const key = `${event.executionId}:${event.stepId}`;
      this.stepStartTimes.set(key, event.timestamp);
    });

    this.engine.on('step:complete', (event: WorkflowEvent) => {
      this.recordStepCompletion(event, true);
    });

    this.engine.on('step:fail', (event: WorkflowEvent) => {
      this.recordStepCompletion(event, false);
    });

    this.engine.on('step:skip', (event: WorkflowEvent) => {
      // Skipped steps are counted but with 0 duration
      this.recordStepCompletion(event, true, 0);
    });
  }

  private recordWorkflowCompletion(event: WorkflowEvent, success: boolean): void {
    const workflowId = event.workflowId;
    const executionId = event.executionId;
    const startTime = this.workflowStartTimes.get(executionId);
    
    if (!startTime) return;

    const duration = event.timestamp - startTime;
    this.workflowStartTimes.delete(executionId);

    let metrics = this.metrics.get(workflowId);
    if (!metrics) {
      metrics = this.createEmptyMetrics();
      this.metrics.set(workflowId, metrics);
    }

    metrics.totalExecutions++;
    metrics.totalDurationMs += duration;

    if (success) {
      metrics.successfulExecutions++;
    } else {
      metrics.failedExecutions++;
    }

    // Update min/max
    if (metrics.minDurationMs === 0 || duration < metrics.minDurationMs) {
      metrics.minDurationMs = duration;
    }
    if (duration > metrics.maxDurationMs) {
      metrics.maxDurationMs = duration;
    }

    // Recalculate average
    metrics.averageDurationMs = metrics.totalDurationMs / metrics.totalExecutions;

    this.emit('metrics:workflow', {
      workflowId,
      executionId,
      success,
      durationMs: duration,
      metrics: this.getWorkflowMetrics(workflowId),
    });
  }

  private recordWorkflowCancellation(event: WorkflowEvent): void {
    const workflowId = event.workflowId;
    const executionId = event.executionId;
    
    this.workflowStartTimes.delete(executionId);

    let metrics = this.metrics.get(workflowId);
    if (!metrics) {
      metrics = this.createEmptyMetrics();
      this.metrics.set(workflowId, metrics);
    }

    metrics.totalExecutions++;
    metrics.cancelledExecutions++;

    this.emit('metrics:workflow:cancelled', {
      workflowId,
      executionId,
      metrics: this.getWorkflowMetrics(workflowId),
    });
  }

  private recordStepCompletion(
    event: WorkflowEvent, 
    success: boolean, 
    overrideDuration?: number
  ): void {
    const workflowId = event.workflowId;
    const stepId = event.stepId!;
    const key = `${event.executionId}:${stepId}`;
    const startTime = this.stepStartTimes.get(key);
    
    const duration = overrideDuration !== undefined 
      ? overrideDuration 
      : (startTime ? event.timestamp - startTime : 0);
    
    this.stepStartTimes.delete(key);

    let metrics = this.metrics.get(workflowId);
    if (!metrics) {
      metrics = this.createEmptyMetrics();
      this.metrics.set(workflowId, metrics);
    }

    let stepMetrics = metrics.stepMetrics.get(stepId);
    if (!stepMetrics) {
      stepMetrics = this.createEmptyStepMetrics();
      metrics.stepMetrics.set(stepId, stepMetrics);
    }

    stepMetrics.totalExecutions++;
    stepMetrics.totalDurationMs += duration;

    if (success) {
      stepMetrics.successfulExecutions++;
    } else {
      stepMetrics.failedExecutions++;
    }

    // Update min/max
    if (stepMetrics.minDurationMs === 0 || duration < stepMetrics.minDurationMs) {
      stepMetrics.minDurationMs = duration;
    }
    if (duration > stepMetrics.maxDurationMs) {
      stepMetrics.maxDurationMs = duration;
    }

    // Recalculate average
    stepMetrics.averageDurationMs = stepMetrics.totalDurationMs / stepMetrics.totalExecutions;

    this.emit('metrics:step', {
      workflowId,
      stepId,
      success,
      durationMs: duration,
      metrics: stepMetrics,
    });
  }

  private createEmptyMetrics(): WorkflowMetrics {
    return {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      cancelledExecutions: 0,
      pausedExecutions: 0,
      totalDurationMs: 0,
      averageDurationMs: 0,
      minDurationMs: 0,
      maxDurationMs: 0,
      stepMetrics: new Map(),
    };
  }

  private createEmptyStepMetrics(): StepMetrics {
    return {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      totalDurationMs: 0,
      averageDurationMs: 0,
      minDurationMs: 0,
      maxDurationMs: 0,
    };
  }

  // ============================================================================
  // Public API
  // ============================================================================

  getWorkflowMetrics(workflowId: string): WorkflowMetrics | undefined {
    const metrics = this.metrics.get(workflowId);
    if (!metrics) return undefined;

    // Return a copy to prevent mutation
    return {
      ...metrics,
      stepMetrics: new Map(metrics.stepMetrics),
    };
  }

  getStepMetrics(workflowId: string, stepId: string): StepMetrics | undefined {
    const metrics = this.metrics.get(workflowId);
    return metrics?.stepMetrics.get(stepId);
  }

  getAllMetrics(): Map<string, WorkflowMetrics> {
    const result = new Map<string, WorkflowMetrics>();
    for (const [id, metrics] of this.metrics) {
      result.set(id, {
        ...metrics,
        stepMetrics: new Map(metrics.stepMetrics),
      });
    }
    return result;
  }

  reset(workflowId?: string): void {
    if (workflowId) {
      this.metrics.delete(workflowId);
    } else {
      this.metrics.clear();
      this.stepStartTimes.clear();
      this.workflowStartTimes.clear();
    }
  }

  exportMetrics(): Record<string, unknown> {
    const exported: Record<string, unknown> = {};
    
    for (const [workflowId, metrics] of this.metrics) {
      exported[workflowId] = {
        totalExecutions: metrics.totalExecutions,
        successfulExecutions: metrics.successfulExecutions,
        failedExecutions: metrics.failedExecutions,
        cancelledExecutions: metrics.cancelledExecutions,
        averageDurationMs: metrics.averageDurationMs,
        minDurationMs: metrics.minDurationMs,
        maxDurationMs: metrics.maxDurationMs,
        stepMetrics: Object.fromEntries(
          Array.from(metrics.stepMetrics.entries()).map(([stepId, stepMetrics]) => [
            stepId,
            {
              totalExecutions: stepMetrics.totalExecutions,
              successfulExecutions: stepMetrics.successfulExecutions,
              failedExecutions: stepMetrics.failedExecutions,
              averageDurationMs: stepMetrics.averageDurationMs,
              minDurationMs: stepMetrics.minDurationMs,
              maxDurationMs: stepMetrics.maxDurationMs,
            },
          ])
        ),
      };
    }

    return exported;
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createWorkflowMetricsCollector(engine: WorkflowEngine): WorkflowMetricsCollector {
  return new WorkflowMetricsCollector(engine);
}

export default WorkflowMetricsCollector;
