/**
 * Godel API - Unified Server Exports
 * 
 * This module provides a unified interface to the Godel API server.
 * Express is the primary framework, eliminating port conflicts.
 * 
 * @example
 * ```typescript
 * import { startServer } from './api';
 * 
 * // Start the unified server
 * const server = await startServer();
 * ```
 */

// ============================================================================
// Server Factory (Primary)
// ============================================================================

export {
  // Main server creation
  startServer,
  createExpressApp,
  createServerConfigForTesting,
  
  // Types
  type UnifiedServerConfig,
  type ServerFramework,
} from './server-factory';

// ============================================================================
// Legacy Exports (for backwards compatibility)
// ============================================================================

// Express server exports (legacy - use server-factory instead)
export { createApp, startServer as startExpressServer } from './server';
export type { ServerConfig } from './server';

// ============================================================================
// Optimized WebSocket Server
// ============================================================================

export {
  OptimizedWebSocketServer,
  getOptimizedWebSocketServer,
  resetOptimizedWebSocketServer,
} from './websocket-optimized';
export type {
  WebSocketConfig,
  WebSocketMetrics,
} from './websocket-optimized';

// ============================================================================
// Response Utilities
// ============================================================================

export {
  createSuccessResponse,
  createErrorResponse,
  ErrorCodes,
  type SuccessResponse,
  type ErrorResponse,
  type ApiResponse,
} from './lib/response';

// ============================================================================
// Pagination Utilities
// ============================================================================

export {
  paginateArray,
  parsePaginationParams,
  createPaginationLinks,
  type PaginationParams,
  type PaginatedResult,
  type PaginationLinks,
} from './lib/pagination';

// ============================================================================
// Middleware
// ============================================================================

// Auth middleware
export {
  authMiddleware,
  generateApiKey,
  requireAuth,
  type AuthenticatedRequest,
} from './middleware/auth';

// Fastify auth (legacy)
export {
  default as authPlugin,
  type AuthConfig,
} from './middleware/auth-fastify';

// ============================================================================
// Schemas
// ============================================================================

export {
  HealthStatusSchema,
  DetailedHealthSchema,
  IdParamSchema,
  PaginationQuerySchema,
  type HealthStatus,
  type DetailedHealth,
  type IdParam,
  type PaginationQuery,
} from './schemas/common';

export {
  CreateAgentSchema,
  UpdateAgentSchema,
  ListAgentsQuerySchema,
  AgentSchema,
  AgentListResponseSchema,
  AgentLogResponseSchema,
  type CreateAgent,
  type UpdateAgent,
  type ListAgentsQuery,
  type Agent,
  type AgentListResponse,
  type AgentLogResponse,
} from './schemas/agent';

export {
  CreateTeamSchema,
  UpdateTeamSchema,
  TeamSchema,
  TeamListResponseSchema,
  type CreateTeam,
  type UpdateTeam,
  type Team,
  type TeamListResponse,
} from './schemas/team';

export {
  CreateTaskSchema,
  UpdateTaskSchema,
  TaskSchema,
  TaskListResponseSchema,
  type CreateTask,
  type UpdateTask,
  type Task,
  type TaskListResponse,
} from './schemas/task';
