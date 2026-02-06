/**
 * @godel/client SDK - Main Entry Point
 * 
 * Official JavaScript/TypeScript SDK for interacting with the Godel platform.
 * Provides comprehensive APIs for managing swarms, agents, and events.
 * 
 * @example
 * ```typescript
 * import { GodelClient } from '@godel/client';
 * 
 * const client = new GodelClient({
 *   apiUrl: 'https://api.godel.io',
 *   apiKey: 'your-api-key'
 * });
 * 
 * // List all swarms
 * const swarms = await client.swarms.list();
 * ```
 */

// Core client
export { GodelClient } from './client';
export type { GodelClientConfig, RequestOptions } from './client';

// Error classes
export {
  GodelError,
  AuthenticationError,
  NotFoundError,
  RateLimitError,
  ValidationError,
  ServerError,
  NetworkError,
  TimeoutError,
  ConflictError,
  PermissionError,
} from './errors';

// Types
export type {
  // Swarm types
  Swarm,
  SwarmConfig,
  SwarmStatus,
  SwarmMetrics,
  SwarmScalingPolicy,
  CreateSwarmRequest,
  UpdateSwarmRequest,
  ScaleSwarmRequest,
  SwarmListResponse,
  
  // Agent types
  Agent,
  AgentConfig,
  AgentStatus,
  AgentCapabilities,
  AgentMetrics,
  AgentLog,
  Task,
  TaskConfig,
  TaskStatus,
  TaskResult,
  SpawnAgentRequest,
  AssignTaskRequest,
  AgentListResponse,
  
  // Event types
  Event,
  EventType,
  EventSeverity,
  EventFilter,
  EventSubscription,
  EventListResponse,
  
  // Common types
  PaginationParams,
  PaginatedResponse,
  Metadata,
  Timestamped,
} from './types';

// Resource classes
export { SwarmsResource } from './resources/swarms';
export { AgentsResource } from './resources/agents';
export { EventsResource } from './resources/events';
