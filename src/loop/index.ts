/**
 * Godel Loop Module
 *
 * Event replay, CQRS patterns, and event-sourced aggregates
 * for system state reconstruction.
 *
 * @module loop
 */

// Event Replay
export {
  EventReplayEngine,
  PostgresEventStore,
  InMemoryEventStore,
  ReplayBuilder,
  type GodelEvent,
  type EventMetadata,
  type EventPriority,
  type ReplayOptions,
  type ReplayResult,
  type EventStore,
  type ProjectionHandler,
} from './event-replay';

// Aggregates
export {
  EventSourcedAggregate,
  AgentAggregate,
  InMemorySnapshotStore,
  type AggregateSnapshot,
  type EmitOptions,
  type EventHandler,
  type AgentAggregateState,
  type AgentCapabilities,
  type TaskInfo,
  type AggregateRepository,
} from './aggregate';

// Read Models
export * from './read-models';

// State Machine
export {
  AgentStateMachine,
  PersistentStateMachine,
  StatefulAgentRegistry,
  InMemoryStateStorage,
  InvalidTransitionError,
  GuardConditionError,
  StatePersistenceError,
  canAcceptWork,
  canPause,
  hasPendingWork,
  canGracefullyStop,
  canRecover,
  notifyWorkComplete,
  handleWorkError,
  ALLOWED_TRANSITIONS,
  AGENT_STATES,
  TERMINAL_STATES,
} from './state-machine';

export type {
  AgentState,
  AgentContext,
  StateTransition,
  StateEntry,
  SavedState,
  StateStorage,
  TaskWithCheckpointInfo,
  LoadBalancerContext,
  Task,
} from './state-machine';
