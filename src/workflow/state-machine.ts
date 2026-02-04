/**
 * Workflow State Machine - Manages workflow and step state transitions
 * 
 * Implements the state machine for workflows:
 * Pending → Running → Completed/Failed/Paused/Cancelled
 * With retry logic and error handling.
 */

import {
  Workflow,
  WorkflowStatus,
  StepStatus,
  WorkflowState,
  WorkflowStepState,
  WorkflowStep,
  WorkflowEvent,
  WorkflowEventType,
} from './types';

// ============================================================================
// State Machine Configuration
// ============================================================================

interface StateTransition {
  from: WorkflowStatus | StepStatus;
  to: WorkflowStatus | StepStatus;
  action: string;
}

// Valid workflow state transitions
const WORKFLOW_TRANSITIONS: StateTransition[] = [
  { from: WorkflowStatus.PENDING, to: WorkflowStatus.RUNNING, action: 'start' },
  { from: WorkflowStatus.PENDING, to: WorkflowStatus.CANCELLED, action: 'cancel' },
  { from: WorkflowStatus.RUNNING, to: WorkflowStatus.COMPLETED, action: 'complete' },
  { from: WorkflowStatus.RUNNING, to: WorkflowStatus.FAILED, action: 'fail' },
  { from: WorkflowStatus.RUNNING, to: WorkflowStatus.PAUSED, action: 'pause' },
  { from: WorkflowStatus.RUNNING, to: WorkflowStatus.CANCELLED, action: 'cancel' },
  { from: WorkflowStatus.PAUSED, to: WorkflowStatus.RUNNING, action: 'resume' },
  { from: WorkflowStatus.PAUSED, to: WorkflowStatus.CANCELLED, action: 'cancel' },
  { from: WorkflowStatus.FAILED, to: WorkflowStatus.RUNNING, action: 'retry' },
  { from: WorkflowStatus.CANCELLED, to: WorkflowStatus.PENDING, action: 'reset' },
];

// Valid step state transitions
const STEP_TRANSITIONS: StateTransition[] = [
  { from: StepStatus.PENDING, to: StepStatus.RUNNING, action: 'start' },
  { from: StepStatus.PENDING, to: StepStatus.SKIPPED, action: 'skip' },
  { from: StepStatus.RUNNING, to: StepStatus.COMPLETED, action: 'complete' },
  { from: StepStatus.RUNNING, to: StepStatus.FAILED, action: 'fail' },
  { from: StepStatus.RUNNING, to: StepStatus.RETRYING, action: 'retry' },
  { from: StepStatus.RUNNING, to: StepStatus.CANCELLED, action: 'cancel' },
  { from: StepStatus.FAILED, to: StepStatus.RETRYING, action: 'retry' },
  { from: StepStatus.RETRYING, to: StepStatus.RUNNING, action: 'start' },
  { from: StepStatus.RETRYING, to: StepStatus.FAILED, action: 'fail' },
  { from: StepStatus.RETRYING, to: StepStatus.SKIPPED, action: 'skip' },
];

// ============================================================================
// State Machine Class
// ============================================================================

export class WorkflowStateMachine {
  private state: WorkflowState;
  private workflow: Workflow;
  private eventListeners: Array<(event: WorkflowEvent) => void> = [];

  constructor(workflow: Workflow, executionId: string) {
    this.workflow = workflow;
    this.state = this.createInitialState(workflow, executionId);
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  private createInitialState(workflow: Workflow, executionId: string): WorkflowState {
    const stepStates = new Map<string, WorkflowStepState>();
    
    for (const step of workflow.steps) {
      stepStates.set(step.id, {
        stepId: step.id,
        status: StepStatus.PENDING,
        attempts: 0,
        maxAttempts: step.retry?.maxAttempts ?? 3,
        logs: [],
      });
    }

    return {
      workflowId: workflow.id || workflow.name,
      executionId,
      status: WorkflowStatus.PENDING,
      currentSteps: [],
      completedSteps: [],
      failedSteps: [],
      skippedSteps: [],
      stepStates,
      variables: { ...workflow.variables },
    };
  }

  // ============================================================================
  // Event Handling
  // ============================================================================

  onEvent(listener: (event: WorkflowEvent) => void): void {
    this.eventListeners.push(listener);
  }

  private emitEvent(event: WorkflowEvent): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('[WorkflowStateMachine] Event listener error:', error);
      }
    }
  }

  private createEvent(type: WorkflowEventType, stepId?: string, data?: Record<string, unknown>): WorkflowEvent {
    return {
      type,
      timestamp: Date.now(),
      executionId: this.state.executionId,
      workflowId: this.state.workflowId,
      stepId,
      data,
    };
  }

  // ============================================================================
  // Workflow State Transitions
  // ============================================================================

  canTransitionWorkflow(to: WorkflowStatus): boolean {
    return WORKFLOW_TRANSITIONS.some(
      t => t.from === this.state.status && t.to === to
    );
  }

  transitionWorkflow(to: WorkflowStatus, error?: { message: string; code?: string; failedStep?: string }): boolean {
    if (!this.canTransitionWorkflow(to)) {
      throw new Error(
        `Invalid workflow transition from ${this.state.status} to ${to}`
      );
    }

    const previousStatus = this.state.status;
    this.state.status = to;

    // Update timestamps
    if (to === WorkflowStatus.RUNNING && !this.state.startedAt) {
      this.state.startedAt = new Date();
    }
    if ([WorkflowStatus.COMPLETED, WorkflowStatus.FAILED, WorkflowStatus.CANCELLED].includes(to)) {
      this.state.completedAt = new Date();
    }

    // Set error if provided
    if (error) {
      this.state.error = error;
    }

    // Emit appropriate event
    let eventType: WorkflowEventType;
    switch (to) {
      case WorkflowStatus.RUNNING:
        eventType = previousStatus === WorkflowStatus.PAUSED ? 'workflow:resume' : 'workflow:start';
        break;
      case WorkflowStatus.COMPLETED:
        eventType = 'workflow:complete';
        break;
      case WorkflowStatus.FAILED:
        eventType = 'workflow:fail';
        break;
      case WorkflowStatus.PAUSED:
        eventType = 'workflow:pause';
        break;
      case WorkflowStatus.CANCELLED:
        eventType = 'workflow:cancel';
        break;
      default:
        eventType = 'workflow:start';
    }

    this.emitEvent(this.createEvent(eventType, undefined, { 
      previousStatus, 
      newStatus: to,
      error,
    }));

    return true;
  }

  start(): void {
    this.transitionWorkflow(WorkflowStatus.RUNNING);
  }

  pause(): void {
    this.transitionWorkflow(WorkflowStatus.PAUSED);
  }

  resume(): void {
    this.transitionWorkflow(WorkflowStatus.RUNNING);
  }

  cancel(): void {
    // Cancel all running steps
    for (const [stepId, stepState] of this.state.stepStates) {
      if (stepState.status === StepStatus.RUNNING) {
        this.transitionStep(stepId, StepStatus.CANCELLED);
      }
    }
    this.transitionWorkflow(WorkflowStatus.CANCELLED);
  }

  complete(): void {
    this.transitionWorkflow(WorkflowStatus.COMPLETED);
  }

  fail(error: { message: string; code?: string; failedStep?: string }): void {
    this.transitionWorkflow(WorkflowStatus.FAILED, error);
  }

  // ============================================================================
  // Step State Transitions
  // ============================================================================

  canTransitionStep(stepId: string, to: StepStatus): boolean {
    const stepState = this.state.stepStates.get(stepId);
    if (!stepState) {
      throw new Error(`Step ${stepId} not found`);
    }

    return STEP_TRANSITIONS.some(
      t => t.from === stepState.status && t.to === to
    );
  }

  transitionStep(
    stepId: string, 
    to: StepStatus, 
    data?: { 
      error?: { message: string; code?: string; stack?: string };
      output?: Record<string, unknown>;
      log?: string;
    }
  ): boolean {
    if (!this.canTransitionStep(stepId, to)) {
      const stepState = this.state.stepStates.get(stepId);
      throw new Error(
        `Invalid step transition from ${stepState?.status} to ${to} for step ${stepId}`
      );
    }

    const stepState = this.state.stepStates.get(stepId)!;
    const previousStatus = stepState.status;
    stepState.status = to;

    // Update timestamps
    if (to === StepStatus.RUNNING) {
      stepState.startedAt = new Date();
      this.state.currentSteps.push(stepId);
    }

    if ([StepStatus.COMPLETED, StepStatus.FAILED, StepStatus.SKIPPED, StepStatus.CANCELLED].includes(to)) {
      stepState.completedAt = new Date();
      
      // Remove from current steps
      const idx = this.state.currentSteps.indexOf(stepId);
      if (idx >= 0) {
        this.state.currentSteps.splice(idx, 1);
      }

      // Add to appropriate completed/failed/skipped list
      if (to === StepStatus.COMPLETED) {
        if (!this.state.completedSteps.includes(stepId)) {
          this.state.completedSteps.push(stepId);
        }
      } else if (to === StepStatus.FAILED) {
        if (!this.state.failedSteps.includes(stepId)) {
          this.state.failedSteps.push(stepId);
        }
      } else if (to === StepStatus.SKIPPED) {
        if (!this.state.skippedSteps.includes(stepId)) {
          this.state.skippedSteps.push(stepId);
        }
      }
    }

    // Update attempts
    if (to === StepStatus.RUNNING) {
      stepState.attempts++;
    }

    // Update error if provided
    if (data?.error) {
      stepState.error = data.error;
    }

    // Update output if provided
    if (data?.output) {
      stepState.output = data.output;
    }

    // Add log if provided
    if (data?.log) {
      stepState.logs.push(`[${new Date().toISOString()}] ${data.log}`);
    }

    // Emit appropriate event
    let eventType: WorkflowEventType;
    switch (to) {
      case StepStatus.RUNNING:
        eventType = 'step:start';
        break;
      case StepStatus.COMPLETED:
        eventType = 'step:complete';
        break;
      case StepStatus.FAILED:
        eventType = 'step:fail';
        break;
      case StepStatus.RETRYING:
        eventType = 'step:retry';
        break;
      case StepStatus.SKIPPED:
        eventType = 'step:skip';
        break;
      case StepStatus.CANCELLED:
        eventType = 'step:cancel';
        break;
      default:
        eventType = 'step:start';
    }

    this.emitEvent(this.createEvent(eventType, stepId, {
      previousStatus,
      newStatus: to,
      attempts: stepState.attempts,
      maxAttempts: stepState.maxAttempts,
      ...data,
    }));

    return true;
  }

  startStep(stepId: string): void {
    this.transitionStep(stepId, StepStatus.RUNNING);
  }

  completeStep(stepId: string, output?: Record<string, unknown>): void {
    this.transitionStep(stepId, StepStatus.COMPLETED, { output });
  }

  failStep(stepId: string, error: { message: string; code?: string; stack?: string }): void {
    this.transitionStep(stepId, StepStatus.FAILED, { error });
  }

  retryStep(stepId: string): void {
    this.transitionStep(stepId, StepStatus.RETRYING);
  }

  skipStep(stepId: string, reason?: string): void {
    this.transitionStep(stepId, StepStatus.SKIPPED, { log: reason || 'Step skipped' });
  }

  // ============================================================================
  // Retry Logic
  // ============================================================================

  canRetryStep(stepId: string): boolean {
    const stepState = this.state.stepStates.get(stepId);
    if (!stepState) return false;

    return stepState.attempts < stepState.maxAttempts && 
           [StepStatus.FAILED, StepStatus.RETRYING].includes(stepState.status);
  }

  getRetryDelay(stepId: string): number {
    const step = this.workflow.steps.find(s => s.id === stepId);
    const stepState = this.state.stepStates.get(stepId);
    
    if (!step || !stepState) return 1000;

    const backoff = step.retry?.backoff ?? 'exponential';
    const baseDelay = step.retry?.delayMs ?? 1000;
    const attempt = stepState.attempts;

    switch (backoff) {
      case 'fixed':
        return baseDelay;
      case 'linear':
        return baseDelay * attempt;
      case 'exponential':
        return baseDelay * Math.pow(2, attempt - 1);
      default:
        return baseDelay;
    }
  }

  // ============================================================================
  // Condition Evaluation
  // ============================================================================

  evaluateCondition(step: WorkflowStep): boolean {
    if (!step.condition) return true;

    const { variable, equals, expression } = step.condition;

    if (variable !== undefined) {
      const value = this.state.variables[variable];
      return value === equals;
    }

    if (expression) {
      // Simple expression evaluation - can be extended
      return this.evaluateExpression(expression);
    }

    return true;
  }

  private evaluateExpression(expression: string): boolean {
    // Support simple expressions like:
    // - steps.stepId.output.field == value
    // - variables.name == value
    // - steps.stepId.status == 'completed'
    
    try {
      // Replace step references with actual values
      let evaluated = expression;
      
      // Replace steps.X.output.Y patterns
      const stepOutputPattern = /steps\.(\w+)\.output\.(\w+)/g;
      evaluated = evaluated.replace(stepOutputPattern, (match, stepId, field) => {
        const stepState = this.state.stepStates.get(stepId);
        const value = stepState?.output?.[field];
        return value !== undefined ? JSON.stringify(value) : 'undefined';
      });

      // Replace steps.X.status patterns
      const stepStatusPattern = /steps\.(\w+)\.status/g;
      evaluated = evaluated.replace(stepStatusPattern, (match, stepId) => {
        const stepState = this.state.stepStates.get(stepId);
        return stepState ? `'${stepState.status}'` : 'undefined';
      });

      // Replace variables.X patterns
      const variablePattern = /variables\.(\w+)/g;
      evaluated = evaluated.replace(variablePattern, (match, name) => {
        const value = this.state.variables[name];
        return value !== undefined ? JSON.stringify(value) : 'undefined';
      });

      // eslint-disable-next-line no-eval
      return eval(evaluated);
    } catch (error) {
      console.error(`[WorkflowStateMachine] Expression evaluation error: ${expression}`, error);
      return false;
    }
  }

  // ============================================================================
  // Getters
  // ============================================================================

  getState(): WorkflowState {
    return { ...this.state };
  }

  getStepState(stepId: string): WorkflowStepState | undefined {
    return this.state.stepStates.get(stepId);
  }

  getVariable(name: string): unknown {
    return this.state.variables[name];
  }

  setVariable(name: string, value: unknown): void {
    this.state.variables[name] = value;
  }

  getCurrentSteps(): string[] {
    return [...this.state.currentSteps];
  }

  getCompletedSteps(): string[] {
    return [...this.state.completedSteps];
  }

  getFailedSteps(): string[] {
    return [...this.state.failedSteps];
  }

  getSkippedSteps(): string[] {
    return [...this.state.skippedSteps];
  }

  isComplete(): boolean {
    return [WorkflowStatus.COMPLETED, WorkflowStatus.FAILED, WorkflowStatus.CANCELLED].includes(this.state.status);
  }

  getProgress(): { completed: number; total: number; percentage: number } {
    const total = this.workflow.steps.length;
    const completed = this.state.completedSteps.length + 
                      this.state.failedSteps.length + 
                      this.state.skippedSteps.length;
    return {
      completed,
      total,
      percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  }
}
