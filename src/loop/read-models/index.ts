/**
 * Read Models Module
 *
 * CQRS read models for agent and task projections.
 *
 * @module loop/read-models
 */

export {
  AgentReadModel,
  InMemoryAgentReadModel,
  type AgentView,
  type AgentCapabilities,
  type AgentQueryOptions,
  type AgentStats,
} from './agent-read-model';

export {
  TaskReadModel,
  TaskDependencyGraph,
  type TaskView,
  type TaskStatus,
  type TaskPriority,
  type TaskStats,
  type TaskQueryOptions,
} from './task-read-model';
