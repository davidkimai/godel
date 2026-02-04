/**
 * Swarm Zod Schemas
 * 
 * Validation schemas for swarm-related API endpoints
 */

import { z } from 'zod';
import { MetadataSchema, TimestampSchema, OptionalTimestampSchema } from './common';

// ============================================================================
// Swarm Status Enum
// ============================================================================

export const SwarmStatusSchema = z.enum([
  'creating',
  'active',
  'scaling',
  'paused',
  'completed',
  'failed',
  'destroyed',
]);

// ============================================================================
// Swarm Configuration Schema
// ============================================================================

export const SwarmConfigSchema = z.object({
  /** Maximum number of agents */
  maxAgents: z.number().int().min(1).max(1000).default(100)
    .describe('Maximum number of agents allowed'),
  /** Minimum number of agents */
  minAgents: z.number().int().min(0).default(1)
    .describe('Minimum number of agents to maintain'),
  /** Enable auto-scaling */
  enableScaling: z.boolean().default(false)
    .describe('Enable automatic scaling'),
  /** Enable branching */
  enableBranching: z.boolean().default(false)
    .describe('Enable session tree branching'),
  /** Enable event streaming */
  enableEventStreaming: z.boolean().default(true)
    .describe('Enable real-time event streaming'),
  /** Budget limit for the swarm */
  budgetLimit: z.number().positive().optional()
    .describe('Budget limit in USD'),
  /** Strategy for agent distribution */
  strategy: z.enum(['round-robin', 'load-balanced', 'priority-based']).default('round-robin')
    .describe('Agent distribution strategy'),
  /** Timeout for agent operations (ms) */
  agentTimeout: z.number().int().min(1000).default(300000)
    .describe('Agent operation timeout in milliseconds'),
  /** Retry policy */
  retryPolicy: z.object({
    maxRetries: z.number().int().min(0).default(3),
    backoffMultiplier: z.number().min(1).default(2),
    initialDelay: z.number().int().min(100).default(1000),
  }).optional().describe('Retry policy configuration'),
});

// ============================================================================
// Swarm Metrics Schema
// ============================================================================

export const SwarmMetricsSchema = z.object({
  /** Total number of agents */
  totalAgents: z.number().int().default(0),
  /** Currently running agents */
  runningAgents: z.number().int().default(0),
  /** Pending agents */
  pendingAgents: z.number().int().default(0),
  /** Completed agents */
  completedAgents: z.number().int().default(0),
  /** Failed agents */
  failedAgents: z.number().int().default(0),
  /** Average agent runtime (ms) */
  averageRuntime: z.number().default(0),
  /** Total runtime of all agents (ms) */
  totalRuntime: z.number().default(0),
  /** Budget consumed */
  budgetConsumed: z.number().default(0),
  /** Budget percentage used */
  budgetPercentage: z.number().min(0).max(100).default(0),
  /** Events processed */
  eventsProcessed: z.number().int().default(0),
  /** Tasks completed */
  tasksCompleted: z.number().int().default(0),
});

// ============================================================================
// Swarm Budget Schema
// ============================================================================

export const SwarmBudgetSchema = z.object({
  /** Allocated budget */
  allocated: z.number().default(0),
  /** Consumed budget */
  consumed: z.number().default(0),
  /** Remaining budget */
  remaining: z.number().default(0),
  /** Percentage used */
  percentage: z.number().min(0).max(100).default(0),
  /** Warnings triggered */
  warnings: z.array(z.object({
    threshold: z.number(),
    timestamp: TimestampSchema,
  })).default([]),
});

// ============================================================================
// Base Swarm Schema
// ============================================================================

export const SwarmSchema = z.object({
  id: z.string().describe('Unique swarm identifier'),
  name: z.string().describe('Swarm name'),
  status: SwarmStatusSchema.describe('Current swarm status'),
  config: SwarmConfigSchema.describe('Swarm configuration'),
  metrics: SwarmMetricsSchema.describe('Swarm metrics'),
  budget: SwarmBudgetSchema.optional().describe('Budget information'),
  currentBranch: z.string().default('main').describe('Current branch name'),
  sessionTreeId: z.string().optional().describe('Session tree ID'),
  createdAt: TimestampSchema.describe('Creation timestamp'),
  updatedAt: TimestampSchema.describe('Last update timestamp'),
  completedAt: OptionalTimestampSchema.describe('Completion timestamp'),
  metadata: MetadataSchema.describe('Additional metadata'),
});

// ============================================================================
// Create Swarm Schema
// ============================================================================

export const CreateSwarmSchema = z.object({
  name: z.string().min(1).max(255).describe('Swarm name'),
  config: SwarmConfigSchema.optional().describe('Swarm configuration'),
  budgetLimit: z.number().positive().optional().describe('Budget limit in USD'),
  metadata: MetadataSchema.describe('Additional metadata'),
});

// ============================================================================
// Update Swarm Schema
// ============================================================================

export const UpdateSwarmSchema = z.object({
  name: z.string().min(1).max(255).optional().describe('Swarm name'),
  config: SwarmConfigSchema.optional().describe('Swarm configuration updates'),
  status: SwarmStatusSchema.optional().describe('New status'),
  metadata: MetadataSchema.optional().describe('Additional metadata'),
});

// ============================================================================
// Scale Swarm Schema
// ============================================================================

export const ScaleSwarmSchema = z.object({
  targetSize: z.number().int().min(0).max(1000)
    .describe('Target number of agents'),
  strategy: z.enum(['add', 'remove', 'exact']).default('exact')
    .describe('Scaling strategy'),
});

// ============================================================================
// Branch Schemas
// ============================================================================

export const CreateBranchSchema = z.object({
  name: z.string().min(1).max(100).describe('Branch name'),
  description: z.string().optional().describe('Branch description'),
  fromEntryId: z.string().optional().describe('Entry ID to branch from'),
});

export const SwitchBranchSchema = z.object({
  branchName: z.string().min(1).describe('Branch name to switch to'),
});

export const BranchSchema = z.object({
  name: z.string().describe('Branch name'),
  description: z.string().optional().describe('Branch description'),
  createdAt: TimestampSchema.describe('Creation timestamp'),
  entryCount: z.number().int().describe('Number of entries'),
});

export const CompareBranchesSchema = z.object({
  branchIds: z.array(z.string().min(1)).min(2).max(10)
    .describe('Branch IDs to compare'),
});

export const BranchComparisonSchema = z.object({
  branches: z.array(z.object({
    id: z.string(),
    name: z.string(),
    entryCount: z.number().int(),
  })).describe('Branch information'),
  differences: z.array(z.object({
    type: z.enum(['added', 'removed', 'modified']),
    entryId: z.string(),
    details: MetadataSchema,
  })).describe('Differences between branches'),
  similarities: z.array(z.object({
    entryId: z.string(),
    branches: z.array(z.string()),
  })).describe('Common entries across branches'),
});

// ============================================================================
// Swarm Event Schema
// ============================================================================

export const SwarmEventSchema = z.object({
  id: z.string().describe('Event ID'),
  swarmId: z.string().describe('Swarm ID'),
  type: z.string().describe('Event type'),
  payload: MetadataSchema.describe('Event payload'),
  timestamp: TimestampSchema.describe('Event timestamp'),
  agentId: z.string().optional().describe('Associated agent ID'),
});

// ============================================================================
// List Swarms Query Schema
// ============================================================================

export const ListSwarmsQuerySchema = z.object({
  status: SwarmStatusSchema.optional().describe('Filter by status'),
  cursor: z.string().optional().describe('Pagination cursor'),
  limit: z.coerce.number().int().min(1).max(500).default(50)
    .describe('Number of items per page'),
  sort: z.enum(['created_at', 'updated_at', 'name', 'status']).default('created_at')
    .describe('Sort field'),
  direction: z.enum(['asc', 'desc']).default('desc').describe('Sort direction'),
});

// ============================================================================
// Swarm Summary Schema (for list view)
// ============================================================================

export const SwarmSummarySchema = z.object({
  id: z.string().describe('Swarm ID'),
  name: z.string().describe('Swarm name'),
  status: SwarmStatusSchema.describe('Swarm status'),
  createdAt: TimestampSchema.describe('Creation timestamp'),
  config: z.object({
    maxAgents: z.number().int(),
    enableScaling: z.boolean(),
    enableBranching: z.boolean(),
  }).describe('Simplified configuration'),
  runningAgents: z.number().int().describe('Number of running agents'),
  totalAgents: z.number().int().describe('Total number of agents'),
  budgetAllocated: z.number().describe('Allocated budget'),
  budgetConsumed: z.number().describe('Consumed budget'),
  budgetPercentage: z.number().describe('Budget percentage used'),
});

// ============================================================================
// Response Schemas
// ============================================================================

export const SwarmListResponseSchema = z.object({
  swarms: z.array(SwarmSummarySchema),
  total: z.number().int().optional(),
  hasMore: z.boolean(),
  nextCursor: z.string().optional(),
});

export const SwarmEventListResponseSchema = z.object({
  events: z.array(SwarmEventSchema),
  hasMore: z.boolean(),
  nextCursor: z.string().optional(),
});

// ============================================================================
// Type Exports
// ============================================================================

export type SwarmStatus = z.infer<typeof SwarmStatusSchema>;
export type Swarm = z.infer<typeof SwarmSchema>;
export type SwarmConfig = z.infer<typeof SwarmConfigSchema>;
export type SwarmMetrics = z.infer<typeof SwarmMetricsSchema>;
export type SwarmBudget = z.infer<typeof SwarmBudgetSchema>;
export type SwarmSummary = z.infer<typeof SwarmSummarySchema>;
export type SwarmEvent = z.infer<typeof SwarmEventSchema>;
export type CreateSwarm = z.infer<typeof CreateSwarmSchema>;
export type UpdateSwarm = z.infer<typeof UpdateSwarmSchema>;
export type ScaleSwarm = z.infer<typeof ScaleSwarmSchema>;
export type Branch = z.infer<typeof BranchSchema>;
export type CreateBranch = z.infer<typeof CreateBranchSchema>;
export type SwitchBranch = z.infer<typeof SwitchBranchSchema>;
export type CompareBranches = z.infer<typeof CompareBranchesSchema>;
export type BranchComparison = z.infer<typeof BranchComparisonSchema>;
export type ListSwarmsQuery = z.infer<typeof ListSwarmsQuerySchema>;

/** Type alias for SwarmListResponseSchema */
export type SwarmListResponse = z.infer<typeof SwarmListResponseSchema>;
