/**
 * @dash/client SDK - Main Entry Point
 * 
 * Official JavaScript/TypeScript SDK for interacting with the Dash platform.
 * Provides comprehensive APIs for managing swarms, agents, and events.
 * 
 * @example
 * ```typescript
 * import { DashClient } from '@dash/client';
 * 
 * const client = new DashClient({
 *   apiUrl: 'https://api.dash.io',
 *   apiKey: 'your-api-key'
 * });
 * 
 * // List all swarms
 * const swarms = await client.swarms.list();
 * ```
 */

// Core client
export { DashClient } from './client';
export type { DashClientConfig, RequestOptions } from './client';

// Error classes
export {
  DashError,
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
