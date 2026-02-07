/**
 * Tracing Module
 * 
 * Distributed tracing support for Godel using OpenTelemetry and Jaeger.
 * 
 * @example
 * ```typescript
 * import { initializeTracing, getTracer, withSpan } from './tracing';
 * 
 * // Initialize tracing
 * initializeTracing({
 *   serviceName: 'godel-orchestrator',
 *   samplingRatio: 0.01,
 * });
 * 
 * // Create spans
 * const result = await withSpan('my-operation', async (span) => {
 *   // Your code here
 *   span.setAttribute('custom.attribute', 'value');
 *   return await doWork();
 * });
 * ```
 */

// Core OpenTelemetry exports
export {
  // Initialization
  initializeTracing,
  shutdownTracing,
  isTracingInitialized,
  getTracingConfig,
  
  // Tracer
  getTracer,
  
  // Span creation
  createSpan,
  withSpan,
  withSpanSync,
  
  // Context propagation
  extractContext,
  injectContext,
  getCurrentTraceId,
  getCurrentSpanId,
  serializeContext,
  deserializeContext,
  
  // Baggage
  setBaggage,
  getBaggage,
  createContextWithBaggage,
  
  // Types
  type TracingConfig,
  type SpanOptions,
  type EventContext,
  
  // Re-exports from @opentelemetry/api
  trace,
  context,
  SpanStatusCode,
  SpanKind,
  type Span,
  type Context as OtelContext,
  type Tracer,
} from './opentelemetry';

// Agent instrumentation
export {
  instrumentAgentSpawn,
  instrumentAgentExecution,
  instrumentAgentStateTransition,
  instrumentAgentLifecycle,
  createAgentTraceContext,
  restoreAgentTraceContext,
  logAgentEvent,
  type AgentTraceContext,
} from './agent-instrumentation';

// Task queue instrumentation
export {
  instrumentTaskEnqueue,
  instrumentTaskDequeue,
  instrumentTaskClaim,
  instrumentTaskStart,
  instrumentTaskComplete,
  instrumentTaskFail,
  instrumentTaskDistribution,
  instrumentDeadLetter,
  instrumentAgentRegister,
  instrumentAgentUnregister,
  instrumentAgentHeartbeat,
  createTaskTraceContext,
  restoreTaskTraceContext,
  logTaskEvent,
  type TaskTraceContext,
} from './task-queue-instrumentation';

// Workflow instrumentation
export {
  instrumentWorkflowExecution,
  instrumentWorkflowValidation,
  instrumentLayerExecution,
  instrumentWorkflowControl,
  instrumentStepExecution,
  instrumentConditionEvaluation,
  instrumentStepRetry,
  createWorkflowTraceContext,
  restoreWorkflowTraceContext,
  createStepSpan,
  trackWorkflowEvent,
  createTracedStepExecutor,
  type WorkflowTraceContext,
} from './workflow-instrumentation';

// Event bus instrumentation
export {
  instrumentEventPublish,
  instrumentEventSubscription,
  instrumentEventProcessing,
  instrumentEventDelivery,
  instrumentRedisEventEmit,
  instrumentRedisEventReceive,
  createEventTraceContext,
  restoreEventTraceContext,
  extractTraceContextFromEvent,
  injectTraceContextIntoEvent,
  createTracedMessageBusPublish,
  createTracedMessageBusSubscribe,
  logEvent,
  type EventTraceContext,
} from './event-bus-instrumentation';

// Database instrumentation
export {
  instrumentQuery,
  instrumentTransaction,
  instrumentPoolAcquire,
  instrumentPoolRelease,
  instrumentMigration,
  createTracedRepositoryMethod,
  instrumentRepository,
  wrapPostgresPool,
  logDatabaseEvent,
} from './database-instrumentation';

// Re-export all span names for reference
export { SPAN_NAMES as AGENT_SPANS } from './agent-instrumentation';
export { SPAN_NAMES as TASK_SPANS } from './task-queue-instrumentation';
export { SPAN_NAMES as WORKFLOW_SPANS } from './workflow-instrumentation';
export { SPAN_NAMES as EVENT_SPANS } from './event-bus-instrumentation';
export { SPAN_NAMES as DB_SPANS } from './database-instrumentation';
