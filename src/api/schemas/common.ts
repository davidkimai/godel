/**
 * Common Zod Schemas
 * 
 * Shared schemas used across API endpoints
 */

import { z } from 'zod';

// ============================================================================
// Pagination Schemas
// ============================================================================

export const PaginationQuerySchema = z.object({
  cursor: z.string().optional().describe('Cursor for cursor-based pagination'),
  limit: z.coerce.number().int().min(1).max(500).optional()
    .describe('Number of items per page (max 500)'),
  sort: z.string().optional().describe('Sort field'),
  direction: z.enum(['asc', 'desc']).optional().describe('Sort direction'),
});

export const OffsetPaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional()
    .describe('Page number for offset-based pagination'),
  pageSize: z.coerce.number().int().min(1).max(500).optional()
    .describe('Number of items per page (max 500)'),
});

// ============================================================================
// ID Schemas
// ============================================================================

export const IdParamSchema = z.object({
  id: z.string().min(1).describe('Unique identifier'),
});

export const UuidSchema = z.string().uuid().describe('UUID v4 identifier');

// ============================================================================
// Timestamp Schemas
// ============================================================================

export const TimestampSchema = z.string().datetime().describe('ISO 8601 timestamp');

export const OptionalTimestampSchema = z.string().datetime().optional();

// ============================================================================
// Metadata Schema
// ============================================================================

export const MetadataSchema = z.record(z.unknown()).default({})
  .describe('Additional metadata');

// ============================================================================
// Error Response Schema
// ============================================================================

export const ApiErrorSchema = z.object({
  code: z.string().describe('Error code'),
  message: z.string().describe('Error message'),
  details: z.record(z.unknown()).optional().describe('Additional error details'),
  stack: z.string().optional().describe('Stack trace (development only)'),
});

// ============================================================================
// Response Meta Schema
// ============================================================================

export const ResponseMetaSchema = z.object({
  page: z.number().int().optional().describe('Current page number'),
  pageSize: z.number().int().optional().describe('Page size'),
  total: z.number().int().optional().describe('Total number of items'),
  hasMore: z.boolean().optional().describe('Whether more items exist'),
  nextCursor: z.string().optional().describe('Cursor for next page'),
  prevCursor: z.string().optional().describe('Cursor for previous page'),
  timestamp: z.string().datetime().describe('Response timestamp'),
  requestId: z.string().optional().describe('Request ID for tracing'),
  version: z.string().describe('API version'),
});

// ============================================================================
// Response Links Schema
// ============================================================================

export const ResponseLinksSchema = z.object({
  self: z.string().describe('Self link'),
  first: z.string().optional().describe('First page link'),
  last: z.string().optional().describe('Last page link'),
  next: z.string().optional().describe('Next page link'),
  prev: z.string().optional().describe('Previous page link'),
});

// ============================================================================
// Base Response Schema
// ============================================================================

export function createSuccessResponseSchema<T extends z.ZodType>(dataSchema: T) {
  return z.object({
    success: z.literal(true).describe('Request success status'),
    data: dataSchema.describe('Response data'),
    meta: ResponseMetaSchema.optional(),
    links: ResponseLinksSchema.optional(),
  });
}

export const ErrorResponseSchema = z.object({
  success: z.literal(false).describe('Request failure status'),
  error: ApiErrorSchema.describe('Error details'),
  meta: ResponseMetaSchema.optional(),
});

// ============================================================================
// Health Check Schema
// ============================================================================

export const HealthStatusSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'unhealthy']).describe('Health status'),
  version: z.string().describe('API version'),
  timestamp: z.string().datetime().describe('Health check timestamp'),
  uptime: z.number().describe('Server uptime in seconds'),
});

export const DetailedHealthSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'unhealthy']).describe('Overall health status'),
  version: z.string().describe('API version'),
  timestamp: z.string().datetime().describe('Health check timestamp'),
  uptime: z.number().describe('Server uptime in seconds'),
  checks: z.record(z.object({
    status: z.enum(['healthy', 'degraded', 'unhealthy']).describe('Check status'),
    responseTime: z.number().describe('Response time in ms'),
    message: z.string().optional().describe('Additional information'),
  })).describe('Individual health checks'),
});

// ============================================================================
// Capability Schema
// ============================================================================

export const CapabilitySchema = z.object({
  name: z.string().describe('Capability name'),
  description: z.string().describe('Capability description'),
  version: z.string().describe('Capability version'),
  endpoints: z.array(z.object({
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).describe('HTTP method'),
    path: z.string().describe('Endpoint path'),
    description: z.string().describe('Endpoint description'),
  })).describe('Available endpoints for this capability'),
});

// ============================================================================
// Log Entry Schema
// ============================================================================

export const LogEntrySchema = z.object({
  id: z.string().describe('Log entry ID'),
  timestamp: z.string().datetime().describe('Log timestamp'),
  level: z.enum(['debug', 'info', 'warn', 'error', 'fatal']).describe('Log level'),
  source: z.string().describe('Log source (component/agent)'),
  message: z.string().describe('Log message'),
  metadata: z.record(z.unknown()).optional().describe('Additional log metadata'),
});

// ============================================================================
// Metrics Schema
// ============================================================================

export const MetricsSchema = z.object({
  timestamp: z.string().datetime().describe('Metrics timestamp'),
  agents: z.object({
    total: z.number().int().describe('Total agents'),
    running: z.number().int().describe('Running agents'),
    pending: z.number().int().describe('Pending agents'),
    completed: z.number().int().describe('Completed agents'),
    failed: z.number().int().describe('Failed agents'),
  }).describe('Agent metrics'),
  teams: z.object({
    total: z.number().int().describe('Total teams'),
    active: z.number().int().describe('Active teams'),
  }).describe('Team metrics'),
  tasks: z.object({
    total: z.number().int().describe('Total tasks'),
    pending: z.number().int().describe('Pending tasks'),
    inProgress: z.number().int().describe('In-progress tasks'),
    completed: z.number().int().describe('Completed tasks'),
  }).describe('Task metrics'),
  system: z.object({
    memoryUsed: z.number().describe('Memory used in bytes'),
    memoryTotal: z.number().describe('Total memory in bytes'),
    cpuUsage: z.number().describe('CPU usage percentage'),
    uptime: z.number().describe('System uptime in seconds'),
  }).describe('System metrics'),
});

// ============================================================================
// Event Bus Schemas
// ============================================================================

export const EventPublishSchema = z.object({
  type: z.string().describe('Event type'),
  payload: z.record(z.unknown()).describe('Event payload'),
  source: z.string().optional().describe('Event source'),
  target: z.string().optional().describe('Target agent/team (optional)'),
});

export const EventSchema = z.object({
  id: z.string().describe('Event ID'),
  type: z.string().describe('Event type'),
  payload: z.record(z.unknown()).describe('Event payload'),
  source: z.string().describe('Event source'),
  target: z.string().optional().describe('Target agent/team'),
  timestamp: z.string().datetime().describe('Event timestamp'),
});

// Type exports
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;
export type OffsetPaginationQuery = z.infer<typeof OffsetPaginationQuerySchema>;
export type IdParam = z.infer<typeof IdParamSchema>;
export type ApiError = z.infer<typeof ApiErrorSchema>;
export type ResponseMeta = z.infer<typeof ResponseMetaSchema>;
export type ResponseLinks = z.infer<typeof ResponseLinksSchema>;
export type HealthStatus = z.infer<typeof HealthStatusSchema>;
export type DetailedHealth = z.infer<typeof DetailedHealthSchema>;
export type Capability = z.infer<typeof CapabilitySchema>;
export type LogEntry = z.infer<typeof LogEntrySchema>;
export type Metrics = z.infer<typeof MetricsSchema>;
export type EventPublish = z.infer<typeof EventPublishSchema>;
export type Event = z.infer<typeof EventSchema>;
