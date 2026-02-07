/**
 * Standardized Error Classes
 * 
 * Provides domain-specific error classes with consistent structure.
 * All errors include: name, message, code, and optional context.
 */

/**
 * Base error class for all Godel errors
 */
export class GodelError extends Error {
  constructor(
    message: string,
    public readonly code: string = 'GODEL_ERROR',
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
    
    // Fix prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * Convert error to JSON-serializable object
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      stack: process.env['NODE_ENV'] === 'development' ? this.stack : undefined,
    };
  }

  /**
   * Get user-facing error message (safe for external display)
   */
  getUserMessage(): string {
    return this.message;
  }
}

/**
 * Agent-related errors
 */
export class AgentError extends GodelError {
  constructor(
    message: string,
    public readonly agentId?: string,
    code: string = 'AGENT_ERROR',
    context?: Record<string, unknown>
  ) {
    super(message, code, { ...context, agentId });
  }
}

export class AgentNotFoundError extends AgentError {
  constructor(agentId: string) {
    super(
      `Agent '${agentId}' not found`,
      agentId,
      'AGENT_NOT_FOUND',
      { agentId }
    );
  }
}

export class AgentInitializationError extends AgentError {
  constructor(agentId: string, reason: string) {
    super(
      `Failed to initialize agent '${agentId}': ${reason}`,
      agentId,
      'AGENT_INIT_FAILED',
      { agentId, reason }
    );
  }
}

export class AgentExecutionError extends AgentError {
  constructor(agentId: string, taskId: string, reason: string) {
    super(
      `Agent '${agentId}' failed to execute task '${taskId}': ${reason}`,
      agentId,
      'AGENT_EXECUTION_FAILED',
      { agentId, taskId, reason }
    );
  }
}

/**
 * Federation-related errors
 */
export class FederationError extends GodelError {
  constructor(
    message: string,
    code: string = 'FEDERATION_ERROR',
    context?: Record<string, unknown>
  ) {
    super(message, code, context);
  }
}

export class AgentRegistryError extends FederationError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'AGENT_REGISTRY_ERROR', context);
  }
}

export class LoadBalancerError extends FederationError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'LOAD_BALANCER_ERROR', context);
  }
}

export class CircuitBreakerError extends FederationError {
  constructor(
    public readonly serviceId: string,
    public readonly state: 'OPEN' | 'HALF_OPEN'
  ) {
    super(
      `Circuit breaker is ${state.toLowerCase()} for service '${serviceId}'`,
      'CIRCUIT_BREAKER_OPEN',
      { serviceId, state }
    );
  }
}

export class TaskDecompositionError extends FederationError {
  constructor(taskId: string, reason: string) {
    super(
      `Failed to decompose task '${taskId}': ${reason}`,
      'TASK_DECOMPOSITION_FAILED',
      { taskId, reason }
    );
  }
}

export class ExecutionEngineError extends FederationError {
  constructor(taskId: string, reason: string) {
    super(
      `Execution engine failed for task '${taskId}': ${reason}`,
      'EXECUTION_ENGINE_ERROR',
      { taskId, reason }
    );
  }
}

/**
 * Loop/Event-sourcing errors
 */
export class LoopError extends GodelError {
  constructor(
    message: string,
    code: string = 'LOOP_ERROR',
    context?: Record<string, unknown>
  ) {
    super(message, code, context);
  }
}

export class EventStoreError extends LoopError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'EVENT_STORE_ERROR', context);
  }
}

export class StateMachineError extends LoopError {
  constructor(
    public readonly entityId: string,
    public readonly fromState: string,
    public readonly toState: string,
    reason: string
  ) {
    super(
      `Invalid state transition for '${entityId}': ${fromState} -> ${toState}: ${reason}`,
      'STATE_MACHINE_ERROR',
      { entityId, fromState, toState, reason }
    );
  }
}

export class EventReplayError extends LoopError {
  constructor(
    public readonly eventId: string,
    public readonly sequenceNumber: number,
    reason: string
  ) {
    super(
      `Failed to replay event '${eventId}' at sequence ${sequenceNumber}: ${reason}`,
      'EVENT_REPLAY_ERROR',
      { eventId, sequenceNumber, reason }
    );
  }
}

export class WorkflowError extends LoopError {
  constructor(
    public readonly workflowId: string,
    message: string,
    code: string = 'WORKFLOW_ERROR'
  ) {
    super(message, code, { workflowId });
  }
}

/**
 * Autonomic system errors
 */
export class AutonomicError extends GodelError {
  constructor(
    message: string,
    code: string = 'AUTONOMIC_ERROR',
    context?: Record<string, unknown>
  ) {
    super(message, code, context);
  }
}

export class PatchApplicationError extends AutonomicError {
  constructor(
    public readonly targetFile: string,
    public readonly patchId: string,
    reason: string
  ) {
    super(
      `Failed to apply patch '${patchId}' to '${targetFile}': ${reason}`,
      'PATCH_APPLICATION_FAILED',
      { targetFile, patchId, reason }
    );
  }
}

export class TestGenerationError extends AutonomicError {
  constructor(
    public readonly targetFile: string,
    reason: string
  ) {
    super(
      `Failed to generate tests for '${targetFile}': ${reason}`,
      'TEST_GENERATION_FAILED',
      { targetFile, reason }
    );
  }
}

/**
 * Intent parsing errors
 */
export class IntentError extends GodelError {
  constructor(
    message: string,
    code: string = 'INTENT_ERROR',
    context?: Record<string, unknown>
  ) {
    super(message, code, context);
  }
}

export class IntentParseError extends IntentError {
  constructor(
    public readonly input: string,
    reason: string
  ) {
    super(
      `Failed to parse intent from input: ${reason}`,
      'INTENT_PARSE_ERROR',
      { input: input.substring(0, 100), reason }
    );
  }
}

export class ComplexityAnalysisError extends IntentError {
  constructor(
    public readonly targetPath: string,
    reason: string
  ) {
    super(
      `Failed to analyze complexity for '${targetPath}': ${reason}`,
      'COMPLEXITY_ANALYSIS_ERROR',
      { targetPath, reason }
    );
  }
}

/**
 * Core system errors
 */
export class CoreError extends GodelError {
  constructor(
    message: string,
    code: string = 'CORE_ERROR',
    context?: Record<string, unknown>
  ) {
    super(message, code, context);
  }
}

export class EventBusError extends CoreError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'EVENT_BUS_ERROR', context);
  }
}

export class SwarmError extends CoreError {
  constructor(
    public readonly teamId: string,
    message: string,
    code: string = 'SWARM_ERROR'
  ) {
    super(message, code, { teamId });
  }
}

export class ExtensionError extends CoreError {
  constructor(
    public readonly extensionId: string,
    message: string,
    code: string = 'EXTENSION_ERROR'
  ) {
    super(message, code, { extensionId });
  }
}

/**
 * Configuration errors
 */
export class ConfigurationError extends GodelError {
  constructor(
    message: string,
    public readonly configKey?: string
  ) {
    super(
      message,
      'CONFIGURATION_ERROR',
      { configKey }
    );
  }
}

/**
 * Validation errors
 */
export class ValidationError extends GodelError {
  constructor(
    message: string,
    public readonly field?: string,
    public readonly value?: unknown
  ) {
    super(
      message,
      'VALIDATION_ERROR',
      { field, value }
    );
  }
}

/**
 * Resource errors
 */
export class ResourceError extends GodelError {
  constructor(
    message: string,
    public readonly resourceType: string,
    public readonly resourceId?: string,
    code: string = 'RESOURCE_ERROR'
  ) {
    super(message, code, { resourceType, resourceId });
  }
}

export class ResourceNotFoundError extends ResourceError {
  constructor(resourceType: string, resourceId: string) {
    super(
      `${resourceType} '${resourceId}' not found`,
      resourceType,
      resourceId,
      'RESOURCE_NOT_FOUND'
    );
  }
}

export class ResourceConflictError extends ResourceError {
  constructor(resourceType: string, resourceId: string, reason: string) {
    super(
      `${resourceType} '${resourceId}' conflict: ${reason}`,
      resourceType,
      resourceId,
      'RESOURCE_CONFLICT'
    );
  }
}

/**
 * Network/IO errors
 */
export class NetworkError extends GodelError {
  constructor(
    message: string,
    public readonly url?: string,
    public readonly statusCode?: number
  ) {
    super(
      message,
      'NETWORK_ERROR',
      { url, statusCode }
    );
  }
}

export class TimeoutError extends GodelError {
  constructor(
    message: string,
    public readonly timeoutMs: number
  ) {
    super(
      `${message} (timeout after ${timeoutMs}ms)`,
      'TIMEOUT_ERROR',
      { timeoutMs }
    );
  }
}

/**
 * Helper function to check if error is a specific type
 */
export function isGodelError(error: unknown): error is GodelError {
  return error instanceof GodelError;
}

export function isAgentError(error: unknown): error is AgentError {
  return error instanceof AgentError;
}

export function isFederationError(error: unknown): error is FederationError {
  return error instanceof FederationError;
}

export function isLoopError(error: unknown): error is LoopError {
  return error instanceof LoopError;
}

export function isAutonomicError(error: unknown): error is AutonomicError {
  return error instanceof AutonomicError;
}

export function isIntentError(error: unknown): error is IntentError {
  return error instanceof IntentError;
}

/**
 * Helper to safely convert any error to GodelError
 */
export function toGodelError(error: unknown): GodelError {
  if (error instanceof GodelError) {
    return error;
  }
  
  if (error instanceof Error) {
    return new GodelError(
      error.message,
      'UNKNOWN_ERROR',
      { originalName: error.name }
    );
  }
  
  return new GodelError(
    String(error),
    'UNKNOWN_ERROR'
  );
}

/**
 * Error codes enum for type-safe error handling
 */
export enum ErrorCode {
  // General
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
  GODEL_ERROR = 'GODEL_ERROR',
  
  // Agent
  AGENT_ERROR = 'AGENT_ERROR',
  AGENT_NOT_FOUND = 'AGENT_NOT_FOUND',
  AGENT_INIT_FAILED = 'AGENT_INIT_FAILED',
  AGENT_EXECUTION_FAILED = 'AGENT_EXECUTION_FAILED',
  
  // Federation
  FEDERATION_ERROR = 'FEDERATION_ERROR',
  AGENT_REGISTRY_ERROR = 'AGENT_REGISTRY_ERROR',
  LOAD_BALANCER_ERROR = 'LOAD_BALANCER_ERROR',
  CIRCUIT_BREAKER_OPEN = 'CIRCUIT_BREAKER_OPEN',
  TASK_DECOMPOSITION_FAILED = 'TASK_DECOMPOSITION_FAILED',
  EXECUTION_ENGINE_ERROR = 'EXECUTION_ENGINE_ERROR',
  
  // Loop
  LOOP_ERROR = 'LOOP_ERROR',
  EVENT_STORE_ERROR = 'EVENT_STORE_ERROR',
  STATE_MACHINE_ERROR = 'STATE_MACHINE_ERROR',
  EVENT_REPLAY_ERROR = 'EVENT_REPLAY_ERROR',
  WORKFLOW_ERROR = 'WORKFLOW_ERROR',
  
  // Autonomic
  AUTONOMIC_ERROR = 'AUTONOMIC_ERROR',
  PATCH_APPLICATION_FAILED = 'PATCH_APPLICATION_FAILED',
  TEST_GENERATION_FAILED = 'TEST_GENERATION_FAILED',
  
  // Intent
  INTENT_ERROR = 'INTENT_ERROR',
  INTENT_PARSE_ERROR = 'INTENT_PARSE_ERROR',
  COMPLEXITY_ANALYSIS_ERROR = 'COMPLEXITY_ANALYSIS_ERROR',
  
  // Core
  CORE_ERROR = 'CORE_ERROR',
  EVENT_BUS_ERROR = 'EVENT_BUS_ERROR',
  SWARM_ERROR = 'SWARM_ERROR',
  EXTENSION_ERROR = 'EXTENSION_ERROR',
  
  // Config & Validation
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  
  // Resources
  RESOURCE_ERROR = 'RESOURCE_ERROR',
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  RESOURCE_CONFLICT = 'RESOURCE_CONFLICT',
  
  // Network
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
}
