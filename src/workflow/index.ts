/**
 * Workflow Module - DAG-based workflow execution engine
 * 
 * Main entry point for the workflow system.
 */

// Types
export {
  Workflow,
  WorkflowStep,
  WorkflowState,
  WorkflowStatus,
  StepStatus,
  WorkflowStepState,
  WorkflowEvent,
  WorkflowEventType,
  ExecutionContext,
  StepExecutor,
  WorkflowEngineOptions,
  DefaultWorkflowEngineOptions,
  WorkflowValidationResult,
  TopologicalSortResult,
  WorkflowSchema,
  WorkflowStepSchema,
} from './types';

// Parser
export {
  parseWorkflowYaml,
  parseWorkflowYamlFile,
  parseWorkflowJson,
  parseWorkflowJsonFile,
  parseWorkflow,
  parseWorkflowFile,
  validateWorkflow,
  workflowToYaml,
  workflowToJson,
} from './parser';

// DAG utilities
export {
  topologicalSort,
  findCycle,
  getAllDependencies,
  getAllDependents,
  getExecutionOrder,
  dependsOn,
  getParallelSteps,
  buildDependencyGraph,
  getCriticalPath,
  DependencyGraph,
} from './dag';

// State machine
export { WorkflowStateMachine } from './state-machine';

// Engine
export {
  WorkflowEngine,
  WorkflowExecutionResult,
  StepExecutionResult,
  StepExecutionHandler,
  StepExecutionError,
  createWorkflowEngine,
} from './engine';

// Integration
export {
  WorkflowEventBusIntegration,
  createWorkflowEventBusIntegration,
} from './integration';

// Metrics
export {
  WorkflowMetricsCollector,
  createWorkflowMetricsCollector,
} from './metrics';

// Designer
export {
  WorkflowDesigner,
  createWorkflowDesigner,
} from './designer';
