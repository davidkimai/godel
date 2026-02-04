/**
 * Workflow Engine - DAG-based workflow execution engine
 * 
 * The main execution engine that:
 * - Performs topological sort for dependency resolution
 * - Executes steps in parallel where possible
 * - Handles sequential execution where required
 * - Manages error propagation and retry logic
 */

import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import {
  Workflow,
  WorkflowState,
  WorkflowStep,
  WorkflowStatus,
  StepStatus,
  WorkflowEvent,
  WorkflowEventType,
  ExecutionContext,
  StepExecutor,
  WorkflowEngineOptions,
  DefaultWorkflowEngineOptions,
} from './types';
import { WorkflowStateMachine } from './state-machine';
import { topologicalSort, getAllDependencies } from './dag';

// ============================================================================
// Execution Context Implementation
// ============================================================================

class ExecutionContextImpl implements ExecutionContext {
  stepOutputs = new Map<string, Record<string, unknown>>();

  constructor(
    public executionId: string,
    public workflowId: string,
    public variables: Record<string, unknown> = {}
  ) {}

  getVariable(name: string): unknown {
    return this.variables[name];
  }

  setVariable(name: string, value: unknown): void {
    this.variables[name] = value;
  }

  getStepOutput(stepId: string): Record<string, unknown> | undefined {
    return this.stepOutputs.get(stepId);
  }

  setStepOutput(stepId: string, output: Record<string, unknown>): void {
    this.stepOutputs.set(stepId, output);
  }
}

// ============================================================================
// Default Step Executor
// ============================================================================

export interface StepExecutionResult {
  success: boolean;
  output?: Record<string, unknown>;
  error?: { message: string; code?: string; stack?: string };
}

export type StepExecutionHandler = (
  step: WorkflowStep,
  context: ExecutionContext
) => Promise<StepExecutionResult>;

class DefaultStepExecutor implements StepExecutor {
  constructor(private handler: StepExecutionHandler) {}

  async execute(step: WorkflowStep, context: ExecutionContext): Promise<Record<string, unknown>> {
    const result = await this.handler(step, context);
    
    if (!result.success) {
      throw new StepExecutionError(
        result.error?.message || 'Step execution failed',
        result.error?.code,
        result.error?.stack
      );
    }

    return result.output || {};
  }
}

class StepExecutionError extends Error {
  constructor(
    message: string,
    public code?: string,
    public stackTrace?: string
  ) {
    super(message);
    this.name = 'StepExecutionError';
  }
}

// ============================================================================
// Workflow Engine
// ============================================================================

export interface WorkflowExecutionResult {
  executionId: string;
  workflowId: string;
  status: WorkflowStatus;
  state: WorkflowState;
  startedAt?: Date;
  completedAt?: Date;
  durationMs?: number;
  error?: { message: string; code?: string; failedStep?: string };
}

export class WorkflowEngine extends EventEmitter {
  private options: WorkflowEngineOptions;
  private stepExecutor: StepExecutor;
  private activeExecutions = new Map<string, {
    machine: WorkflowStateMachine;
    abortController: AbortController;
    context: ExecutionContextImpl;
  }>();

  constructor(
    stepExecutor: StepExecutor | StepExecutionHandler,
    options: Partial<WorkflowEngineOptions> = {}
  ) {
    super();
    this.options = { ...DefaultWorkflowEngineOptions, ...options };
    
    if (typeof stepExecutor === 'function') {
      this.stepExecutor = new DefaultStepExecutor(stepExecutor);
    } else {
      this.stepExecutor = stepExecutor;
    }
  }

  // ============================================================================
  // Workflow Execution
  // ============================================================================

  async execute(workflow: Workflow, initialVariables?: Record<string, unknown>): Promise<WorkflowExecutionResult> {
    const executionId = `exec_${randomUUID().slice(0, 8)}`;
    const workflowId = workflow.id || workflow.name;

    // Validate workflow
    const sortResult = topologicalSort(workflow);
    if (sortResult.hasCycle) {
      throw new Error(`Workflow has a cycle: ${sortResult.cycle?.join(' -> ')}`);
    }

    // Create state machine
    const machine = new WorkflowStateMachine(workflow, executionId);
    const abortController = new AbortController();
    const context = new ExecutionContextImpl(executionId, workflowId, {
      ...workflow.variables,
      ...initialVariables,
    });

    // Store active execution
    this.activeExecutions.set(executionId, { machine, abortController, context });

    // Set up event forwarding
    machine.onEvent((event) => {
      this.emit('workflow:event', event);
      this.emit(event.type, event);
    });

    // Start execution
    machine.start();
    const startedAt = new Date();

    try {
      // Execute layers
      for (const layer of sortResult.ordered) {
        if (abortController.signal.aborted) {
          throw new Error('Workflow cancelled');
        }

        await this.executeLayer(workflow, layer, machine, context, abortController.signal);

        // Check if workflow should stop due to failures
        if (machine.getState().status === WorkflowStatus.FAILED) {
          if (workflow.onFailure === 'stop') {
            break;
          }
        }
      }

      // Complete workflow
      const failedSteps = machine.getFailedSteps();
      if (failedSteps.length > 0 && workflow.onFailure !== 'continue') {
        machine.fail({
          message: `Workflow failed: ${failedSteps.length} step(s) failed`,
          failedStep: failedSteps[0],
        });
      } else {
        machine.complete();
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      machine.fail({ message: errorMessage });
    } finally {
      this.activeExecutions.delete(executionId);
    }

    const completedAt = new Date();
    const state = machine.getState();

    return {
      executionId,
      workflowId,
      status: state.status,
      state,
      startedAt,
      completedAt,
      durationMs: completedAt.getTime() - startedAt.getTime(),
      error: state.error,
    };
  }

  private async executeLayer(
    workflow: Workflow,
    layer: string[],
    machine: WorkflowStateMachine,
    context: ExecutionContextImpl,
    abortSignal: AbortSignal
  ): Promise<void> {
    // Filter steps that should be executed (based on conditions)
    const stepsToExecute: WorkflowStep[] = [];
    
    for (const stepId of layer) {
      const step = workflow.steps.find(s => s.id === stepId);
      if (!step) continue;

      // Check dependencies are met
      const deps = getAllDependencies(workflow, stepId);
      const allDepsComplete = [...deps].every(depId => {
        const depState = machine.getStepState(depId);
        return depState?.status === StepStatus.COMPLETED || depState?.status === StepStatus.SKIPPED;
      });

      if (!allDepsComplete) {
        continue;
      }

      // Check condition
      const shouldExecute = machine.evaluateCondition(step);
      
      if (shouldExecute) {
        stepsToExecute.push(step);
      } else {
        machine.skipStep(stepId, 'Condition not met');
      }
    }

    // Execute steps in parallel within the layer
    const stepPromises = stepsToExecute.map(step => 
      this.executeStep(workflow, step, machine, context, abortSignal)
    );

    await Promise.all(stepPromises);
  }

  private async executeStep(
    workflow: Workflow,
    step: WorkflowStep,
    machine: WorkflowStateMachine,
    context: ExecutionContextImpl,
    abortSignal: AbortSignal
  ): Promise<void> {
    const stepId = step.id;
    const timeout = step.timeout || this.options.stepTimeoutMs;

    // Check for abort
    if (abortSignal.aborted) {
      machine.transitionStep(stepId, StepStatus.CANCELLED);
      return;
    }

    // Start step
    machine.startStep(stepId);

    try {
      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Step ${stepId} timed out after ${timeout}ms`));
        }, timeout);
      });

      // Create abort promise
      const abortPromise = new Promise<never>((_, reject) => {
        abortSignal.addEventListener('abort', () => {
          reject(new Error('Step cancelled'));
        }, { once: true });
      });

      // Execute with timeout and abort handling
      const output = await Promise.race([
        this.stepExecutor.execute(step, context),
        timeoutPromise,
        abortPromise,
      ]);

      // Store output
      context.setStepOutput(stepId, output);
      machine.completeStep(stepId, output);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      // Check if we should retry
      if (machine.canRetryStep(stepId)) {
        machine.retryStep(stepId);
        
        // Wait for retry delay
        const retryDelay = machine.getRetryDelay(stepId);
        await this.delay(retryDelay);

        // Retry
        if (!abortSignal.aborted) {
          await this.executeStep(workflow, step, machine, context, abortSignal);
          return;
        }
      }

      // Mark as failed
      machine.failStep(stepId, {
        message: errorMessage,
        stack: errorStack,
      });

      // Handle workflow failure policy
      if (workflow.onFailure === 'stop') {
        throw new Error(`Step ${stepId} failed: ${errorMessage}`);
      }
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ============================================================================
  // Execution Control
  // ============================================================================

  pause(executionId: string): boolean {
    const execution = this.activeExecutions.get(executionId);
    if (!execution) return false;
    
    execution.machine.pause();
    return true;
  }

  resume(executionId: string): boolean {
    const execution = this.activeExecutions.get(executionId);
    if (!execution) return false;
    
    execution.machine.resume();
    return true;
  }

  cancel(executionId: string): boolean {
    const execution = this.activeExecutions.get(executionId);
    if (!execution) return false;
    
    execution.abortController.abort();
    execution.machine.cancel();
    return true;
  }

  getExecutionState(executionId: string): WorkflowState | undefined {
    return this.activeExecutions.get(executionId)?.machine.getState();
  }

  getActiveExecutions(): string[] {
    return Array.from(this.activeExecutions.keys());
  }

  // ============================================================================
  // Event Handling
  // ============================================================================

  onWorkflowEvent(
    eventType: WorkflowEventType | WorkflowEventType[],
    handler: (event: WorkflowEvent) => void
  ): void {
    const types = Array.isArray(eventType) ? eventType : [eventType];
    for (const type of types) {
      this.on(type, handler);
    }
  }

  // ============================================================================
  // Validation
  // ============================================================================

  validate(workflow: Workflow): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check for required fields
    if (!workflow.name) {
      errors.push('Workflow name is required');
    }

    if (!workflow.steps || workflow.steps.length === 0) {
      errors.push('Workflow must have at least one step');
    }

    // Check for duplicate step IDs
    const stepIds = new Set<string>();
    for (const step of workflow.steps) {
      if (stepIds.has(step.id)) {
        errors.push(`Duplicate step ID: ${step.id}`);
      }
      stepIds.add(step.id);
    }

    // Check for cycles
    const sortResult = topologicalSort(workflow);
    if (sortResult.hasCycle) {
      errors.push(`Workflow contains a cycle: ${sortResult.cycle?.join(' -> ')}`);
    }

    // Validate step references
    for (const step of workflow.steps) {
      for (const dep of step.dependsOn) {
        if (!stepIds.has(dep)) {
          errors.push(`Step '${step.id}' depends on non-existent step: ${dep}`);
        }
      }
      for (const next of step.next) {
        if (!stepIds.has(next)) {
          errors.push(`Step '${step.id}' references non-existent next step: ${next}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createWorkflowEngine(
  stepExecutor: StepExecutor | StepExecutionHandler,
  options?: Partial<WorkflowEngineOptions>
): WorkflowEngine {
  return new WorkflowEngine(stepExecutor, options);
}

export { StepExecutionError };
export type { ExecutionContextImpl as ExecutionContext };
