import { z } from 'zod';

// =============================================================================
// ID & BASE SCHEMAS
// =============================================================================

export const idSchema = z.string().uuid();

export const uuidArraySchema = z.array(z.string().uuid()).min(1);

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
});

export const dateRangeSchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
}).refine((data) => {
  if (data.startDate && data.endDate) {
    return data.startDate <= data.endDate;
  }
  return true;
}, { message: 'startDate must be before or equal to endDate' });

// =============================================================================
// AGENT SCHEMAS
// =============================================================================

export const spawnAgentSchema = z.object({
  task: z.string().min(1).max(1000),
  model: z.enum(['kimi-k2.5', 'claude-sonnet-4-5', 'gpt-4', 'gpt-4o']),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  parentId: z.string().uuid().optional(),
  swarmId: z.string().uuid().optional(),
  metadata: z.record(z.unknown()).optional(),
}).refine((data) => {
  // Critical priority requires justification
  if (data.priority === 'critical') {
    // In real implementation, check metadata for justification
    return true;
  }
  return true;
}, { message: 'Critical priority requires justification in metadata' });

export const updateAgentSchema = z.object({
  status: z.enum(['idle', 'spawning', 'running', 'paused', 'completed', 'failed', 'killing']).optional(),
  progress: z.number().min(0).max(100).optional(),
  result: z.string().optional(),
  error: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
}).refine((data) => {
  // Cannot have both result and error
  if (data.result && data.error) {
    return false;
  }
  // Completed status requires 100% progress
  if (data.status === 'completed' && data.progress !== undefined && data.progress !== 100) {
    return false;
  }
  return true;
}, { message: 'Invalid agent update: conflicting result/error or incomplete progress' });

export const agentActionSchema = z.object({
  action: z.enum(['kill', 'pause', 'resume', 'retry', 'scale']),
  reason: z.string().min(1).max(500).optional(),
  force: z.boolean().default(false),
  delay: z.number().int().min(0).max(3600).optional(), // seconds
}).refine((data) => {
  // Kill/pause requires reason unless force=true
  if ((data.action === 'kill' || data.action === 'pause') && !data.force && !data.reason) {
    return false;
  }
  // Delay only valid for retry/scale
  if (data.delay !== undefined && !['retry', 'scale'].includes(data.action)) {
    return false;
  }
  return true;
}, { message: 'Action requires reason or force flag; delay only for retry/scale' });

export const agentQuerySchema = z.object({
  swarmId: z.string().uuid().optional(),
  status: z.array(z.enum(['idle', 'spawning', 'running', 'paused', 'completed', 'failed', 'killing'])).optional(),
  ...paginationSchema.shape,
});

// =============================================================================
// SWARM SCHEMAS
// =============================================================================

export const createSwarmSchema = z.object({
  name: z.string().min(1).max(100).regex(/^[a-zA-Z0-9-_]+$/),
  description: z.string().max(500).optional(),
  agents: z.number().int().min(1).max(100),
  strategy: z.enum(['parallel', 'map-reduce', 'pipeline', 'race']).default('parallel'),
  budget: z.number().positive().max(10000).optional(),
  config: z.record(z.unknown()).optional(),
}).refine((data) => {
  // Race strategy requires at least 2 agents
  if (data.strategy === 'race' && data.agents < 2) {
    return false;
  }
  // Map-reduce requires at least 3 agents (mapper, reducer, coordinator)
  if (data.strategy === 'map-reduce' && data.agents < 3) {
    return false;
  }
  return true;
}, { message: 'Race strategy requires 2+ agents; map-reduce requires 3+ agents' });

export const updateSwarmSchema = z.object({
  name: z.string().min(1).max(100).regex(/^[a-zA-Z0-9-_]+$/).optional(),
  description: z.string().max(500).optional(),
  status: z.enum(['running', 'paused', 'completed', 'failed']).optional(),
  config: z.record(z.unknown()).optional(),
}).refine((data) => {
  // At least one field must be provided
  return Object.keys(data).length > 0;
}, { message: 'At least one field must be provided for update' });

export const swarmActionSchema = z.object({
  action: z.enum(['pause', 'resume', 'cancel', 'scale', 'rebalance']),
  targetAgents: z.number().int().min(1).max(100).optional(),
  graceful: z.boolean().optional(),
}).refine((data) => {
  // Scale requires targetAgents
  if (data.action === 'scale' && data.targetAgents === undefined) {
    return false;
  }
  // Cannot be graceful with cancel
  if (data.action === 'cancel' && data.graceful) {
    return false;
  }
  return true;
}, { message: 'Scale requires targetAgents; cancel cannot be graceful' });

export const swarmQuerySchema = z.object({
  status: z.array(z.enum(['running', 'paused', 'completed', 'failed'])).optional(),
  ...paginationSchema.shape,
});

// =============================================================================
// BUDGET SCHEMAS
// =============================================================================

export const setBudgetSchema = z.object({
  scopeType: z.enum(['swarm', 'agent', 'project', 'global']),
  scopeId: z.string().uuid().optional(),
  maxTokens: z.number().int().positive().optional(),
  maxCost: z.number().positive().optional(),
  maxRequests: z.number().int().positive().optional(),
  alertThreshold: z.number().min(0).max(1).optional(), // 0-1 percentage
}).refine((data) => {
  // At least one limit must be specified
  const hasLimit = data.maxTokens || data.maxCost || data.maxRequests;
  if (!hasLimit) {
    return false;
  }
  // scopeId required for non-global scopes
  if (data.scopeType !== 'global' && !data.scopeId) {
    return false;
  }
  return true;
}, { message: 'At least one budget limit required; scopeId required for non-global scopes' });

export const budgetConsumptionSchema = z.object({
  tokensUsed: z.number().int().min(0).optional(),
  costIncurred: z.number().min(0).optional(),
  requestsMade: z.number().int().min(0).optional(),
}).refine((data) => {
  // At least one metric must be provided
  return data.tokensUsed !== undefined || data.costIncurred !== undefined || data.requestsMade !== undefined;
}, { message: 'At least one consumption metric required' });

export const budgetQuerySchema = z.object({
  scopeType: z.enum(['swarm', 'agent', 'project', 'global']).optional(),
  ...paginationSchema.shape,
});

// =============================================================================
// TASK SCHEMAS
// =============================================================================

export const createTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  dueDate: z.coerce.date().optional(),
  assignees: z.array(z.string().uuid()).optional(),
  tags: z.array(z.string().min(1).max(50)).max(10).optional(),
  metadata: z.record(z.unknown()).optional(),
}).refine((data) => {
  // Due date must be in the future
  if (data.dueDate && data.dueDate <= new Date()) {
    return false;
  }
  return true;
}, { message: 'Due date must be in the future' });

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  status: z.enum(['todo', 'in_progress', 'review', 'done', 'cancelled']).optional(),
  dueDate: z.coerce.date().optional(),
  assignees: z.array(z.string().uuid()).optional(),
}).refine((data) => {
  return Object.keys(data).length > 0;
}, { message: 'At least one field must be provided' });

// =============================================================================
// MESSAGE & EVENT SCHEMAS
// =============================================================================

export const sendMessageSchema = z.object({
  content: z.string().min(1).max(10000),
  replyTo: z.string().uuid().optional(),
  mentions: z.array(z.string().uuid()).max(10).optional(),
  attachments: z.array(z.object({
    name: z.string(),
    type: z.string(),
    size: z.number().int().max(10 * 1024 * 1024), // 10MB max
    data: z.string(), // base64
  })).max(5).optional(),
});

export const eventPublishSchema = z.object({
  type: z.string().min(1).max(100),
  payload: z.unknown(),
  timestamp: z.coerce.date().default(() => new Date()),
  source: z.string().min(1).max(100),
  correlationId: z.string().uuid().optional(),
});

// =============================================================================
// CONFIG & WEBHOOK SCHEMAS
// =============================================================================

export const configUpdateSchema = z.object({
  key: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_.]+$/),
  value: z.unknown(),
  scope: z.enum(['global', 'swarm', 'agent']).default('global'),
  scopeId: z.string().uuid().optional(),
});

export const webhookRegisterSchema = z.object({
  url: z.string().url(),
  events: z.array(z.string().min(1)).min(1),
  secret: z.string().min(32).max(256),
  active: z.boolean().default(true),
}).refine((data) => {
  // In production, require HTTPS
  if (process.env['NODE_ENV'] === 'production' && !data.url.startsWith('https://')) {
    return false;
  }
  return true;
}, { message: 'HTTPS required in production' });

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type SpawnAgentInput = z.infer<typeof spawnAgentSchema>;
export type UpdateAgentInput = z.infer<typeof updateAgentSchema>;
export type AgentActionInput = z.infer<typeof agentActionSchema>;
export type AgentQueryInput = z.infer<typeof agentQuerySchema>;

export type CreateSwarmInput = z.infer<typeof createSwarmSchema>;
export type UpdateSwarmInput = z.infer<typeof updateSwarmSchema>;
export type SwarmActionInput = z.infer<typeof swarmActionSchema>;
export type SwarmQueryInput = z.infer<typeof swarmQuerySchema>;

export type SetBudgetInput = z.infer<typeof setBudgetSchema>;
export type BudgetConsumptionInput = z.infer<typeof budgetConsumptionSchema>;
export type BudgetQueryInput = z.infer<typeof budgetQuerySchema>;

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type EventPublishInput = z.infer<typeof eventPublishSchema>;

export type ConfigUpdateInput = z.infer<typeof configUpdateSchema>;
export type WebhookRegisterInput = z.infer<typeof webhookRegisterSchema>;
