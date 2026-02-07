/**
 * Agent Zod Schemas
 * 
 * Validation schemas for agent-related API endpoints
 */

import { z } from 'zod';
import { MetadataSchema, TimestampSchema, OptionalTimestampSchema } from './common';

// ============================================================================
// Agent Status Enum
// ============================================================================

export const AgentStatusSchema = z.enum([
  'pending',
  'running',
  'paused',
  'completed',
  'failed',
  'blocked',
  'killed',
]);

export const LifecycleStateSchema = z.enum([
  'initializing',
  'spawning',
  'running',
  'pausing',
  'paused',
  'resuming',
  'completing',
  'failed',
  'cleaning_up',
  'destroyed',
]);

// ============================================================================
// Agent Context Schema
// ============================================================================

export const AgentContextSchema = z.object({
  inputContext: z.array(z.string()).default([]),
  outputContext: z.array(z.string()).default([]),
  sharedContext: z.array(z.string()).default([]),
  contextSize: z.number().int().default(0),
  contextWindow: z.number().int().default(100000),
  contextUsage: z.number().min(0).max(1).default(0),
});

// ============================================================================
// Agent Code Schema
// ============================================================================

export type FileNode = {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: Record<string, FileNode>;
  exports?: string[];
  imports?: string[];
};

export const FileNodeSchema: z.ZodType<FileNode> = z.object({
  name: z.string(),
  path: z.string(),
  type: z.enum(['file', 'directory']),
  children: z.record(z.lazy(() => FileNodeSchema)).optional(),
  exports: z.array(z.string()).optional(),
  imports: z.array(z.string()).optional(),
});

export const DependencyGraphSchema = z.object({
  dependencies: z.record(z.array(z.string())),
});

export const SymbolTableSchema = z.object({
  symbols: z.record(z.object({
    location: z.string(),
    type: z.string(),
  })),
});

export const AgentCodeSchema = z.object({
  language: z.string(),
  fileTree: FileNodeSchema,
  dependencies: DependencyGraphSchema,
  symbolIndex: SymbolTableSchema,
});

// ============================================================================
// Agent Reasoning Schema
// ============================================================================

export const ReasoningTraceSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  taskId: z.string().optional(),
  timestamp: z.date(),
  type: z.enum(['hypothesis', 'analysis', 'decision', 'correction']),
  content: z.string(),
  evidence: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  parentTraceId: z.string().optional(),
  childTraceIds: z.array(z.string()),
});

export const DecisionLogSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  timestamp: z.date(),
  decision: z.string(),
  alternatives: z.array(z.string()),
  criteria: z.array(z.string()),
  evaluation: z.string(),
  outcome: z.string().optional(),
  confidence: z.number().min(0).max(1),
});

export const AgentReasoningSchema = z.object({
  traces: z.array(ReasoningTraceSchema),
  decisions: z.array(DecisionLogSchema),
  confidence: z.number().min(0).max(1),
});

// ============================================================================
// Safety Config Schema
// ============================================================================

export const SafetyConfigSchema = z.object({
  ethicsBoundaries: z.object({
    doNotHarm: z.boolean(),
    preservePrivacy: z.boolean(),
    noDeception: z.boolean(),
    authorizedAccessOnly: z.boolean(),
  }),
  dangerousActions: z.object({
    dataDestruction: z.enum(['block', 'confirm', 'allow']),
    agentTermination: z.enum(['confirm', 'allow']),
    externalPublishing: z.enum(['confirm', 'block']),
    resourceExhaustion: z.enum(['block', 'confirm']),
  }),
  escalationTriggers: z.object({
    ethicsViolation: z.enum(['immediate']),
    costExceeded: z.enum(['threshold']),
    recursiveModification: z.enum(['approval']),
    persistentFailure: z.enum(['threshold']),
    securityBreach: z.enum(['immediate']),
  }),
});

// ============================================================================
// Base Agent Schema
// ============================================================================

export const AgentSchema = z.object({
  id: z.string().describe('Unique agent identifier'),
  label: z.string().optional().describe('Human-readable label'),
  status: AgentStatusSchema.describe('Current agent status'),
  lifecycleState: LifecycleStateSchema.describe('Lifecycle state'),
  model: z.string().describe('Model identifier'),
  task: z.string().describe('Current task'),
  spawnedAt: TimestampSchema.describe('When the agent was spawned'),
  completedAt: OptionalTimestampSchema.describe('When the agent completed'),
  runtime: z.number().describe('Total runtime in milliseconds'),
  teamId: z.string().optional().describe('Team identifier'),
  parentId: z.string().optional().describe('Parent agent ID'),
  childIds: z.array(z.string()).default([]).describe('Child agent IDs'),
  context: AgentContextSchema.describe('Context information'),
  code: AgentCodeSchema.optional().describe('Code-specific data'),
  reasoning: AgentReasoningSchema.optional().describe('Reasoning data'),
  retryCount: z.number().int().default(0).describe('Current retry count'),
  maxRetries: z.number().int().default(3).describe('Maximum retry attempts'),
  lastError: z.string().optional().describe('Last error message'),
  budgetLimit: z.number().optional().describe('Budget limit'),
  safetyBoundaries: SafetyConfigSchema.optional().describe('Safety configuration'),
  metadata: MetadataSchema.describe('Additional metadata'),
});

// ============================================================================
// Create Agent Schema
// ============================================================================

export const CreateAgentSchema = z.object({
  label: z.string().optional().describe('Human-readable label'),
  model: z.string().min(1).describe('Model identifier (e.g., kimi-k2.5, gpt-4o)'),
  task: z.string().min(1).describe('Initial task description'),
  teamId: z.string().optional().describe('Team to join'),
  parentId: z.string().optional().describe('Parent agent ID'),
  maxRetries: z.number().int().min(0).max(10).default(3).describe('Maximum retry attempts'),
  budgetLimit: z.number().positive().optional().describe('Budget limit in USD'),
  contextItems: z.array(z.string()).optional().describe('Initial context items'),
  language: z.string().optional().describe('Programming language (for code agents)'),
  safetyBoundaries: SafetyConfigSchema.optional().describe('Safety configuration'),
  metadata: MetadataSchema.describe('Additional metadata'),
});

// ============================================================================
// Update Agent Schema
// ============================================================================

export const UpdateAgentSchema = z.object({
  label: z.string().optional().describe('Human-readable label'),
  status: AgentStatusSchema.optional().describe('New status'),
  lifecycleState: LifecycleStateSchema.optional().describe('New lifecycle state'),
  task: z.string().optional().describe('Updated task'),
  maxRetries: z.number().int().min(0).max(10).optional().describe('Maximum retry attempts'),
  metadata: MetadataSchema.optional().describe('Additional metadata'),
});

// ============================================================================
// Agent Log Schema
// ============================================================================

export const AgentLogSchema = z.object({
  id: z.string().describe('Log entry ID'),
  agentId: z.string().describe('Agent ID'),
  timestamp: TimestampSchema.describe('Log timestamp'),
  level: z.enum(['debug', 'info', 'warn', 'error', 'fatal']).describe('Log level'),
  message: z.string().describe('Log message'),
  source: z.string().describe('Log source'),
  metadata: MetadataSchema.describe('Additional metadata'),
});

// ============================================================================
// Agent Trace Schema
// ============================================================================

export const AgentTraceSchema = z.object({
  id: z.string().describe('Trace ID'),
  agentId: z.string().describe('Agent ID'),
  type: z.enum(['spawn', 'pause', 'resume', 'complete', 'fail', 'kill', 'retry']).describe('Trace type'),
  timestamp: TimestampSchema.describe('Trace timestamp'),
  details: MetadataSchema.describe('Trace details'),
});

// ============================================================================
// List Agents Query Schema
// ============================================================================

export const ListAgentsQuerySchema = z.object({
  status: AgentStatusSchema.optional().describe('Filter by status'),
  lifecycleState: LifecycleStateSchema.optional().describe('Filter by lifecycle state'),
  teamId: z.string().optional().describe('Filter by team ID'),
  model: z.string().optional().describe('Filter by model'),
  cursor: z.string().optional().describe('Pagination cursor'),
  limit: z.coerce.number().int().min(1).max(500).default(50)
    .describe('Number of items per page'),
  sort: z.enum(['spawned_at', 'updated_at', 'status']).default('spawned_at')
    .describe('Sort field'),
  direction: z.enum(['asc', 'desc']).default('desc').describe('Sort direction'),
});

// ============================================================================
// Response Schemas
// ============================================================================

export const AgentListResponseSchema = z.object({
  agents: z.array(AgentSchema),
  total: z.number().int().optional(),
  hasMore: z.boolean(),
  nextCursor: z.string().optional(),
});

export const AgentLogResponseSchema = z.object({
  logs: z.array(AgentLogSchema),
  hasMore: z.boolean(),
  nextCursor: z.string().optional(),
});

// ============================================================================
// Type Exports
// ============================================================================

export type AgentStatus = z.infer<typeof AgentStatusSchema>;
export type LifecycleState = z.infer<typeof LifecycleStateSchema>;
export type Agent = z.infer<typeof AgentSchema>;
export type CreateAgent = z.infer<typeof CreateAgentSchema>;
export type UpdateAgent = z.infer<typeof UpdateAgentSchema>;
export type AgentLog = z.infer<typeof AgentLogSchema>;
export type AgentTrace = z.infer<typeof AgentTraceSchema>;
export type AgentContext = z.infer<typeof AgentContextSchema>;
export type AgentCode = z.infer<typeof AgentCodeSchema>;
export type AgentReasoning = z.infer<typeof AgentReasoningSchema>;
export type SafetyConfig = z.infer<typeof SafetyConfigSchema>;
export type ListAgentsQuery = z.infer<typeof ListAgentsQuerySchema>;

/** Type alias for AgentListResponseSchema */
export type AgentListResponse = z.infer<typeof AgentListResponseSchema>;

/** Type alias for AgentLogResponseSchema */
export type AgentLogResponse = z.infer<typeof AgentLogResponseSchema>;
