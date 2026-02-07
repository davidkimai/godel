/**
 * Team Zod Schemas
 * 
 * Validation schemas for team-related API endpoints
 */

import { z } from 'zod';
import { MetadataSchema, TimestampSchema, OptionalTimestampSchema } from './common';

// ============================================================================
// Team Status Enum
// ============================================================================

export const TeamStatusSchema = z.enum([
  'creating',
  'active',
  'scaling',
  'paused',
  'completed',
  'failed',
  'destroyed',
]);

// ============================================================================
// Team Configuration Schema
// ============================================================================

export const TeamConfigSchema = z.object({
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
  /** Budget limit for the team */
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
// Team Metrics Schema
// ============================================================================

export const TeamMetricsSchema = z.object({
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
// Team Budget Schema
// ============================================================================

export const TeamBudgetSchema = z.object({
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
// Base Team Schema
// ============================================================================

export const TeamSchema = z.object({
  id: z.string().describe('Unique team identifier'),
  name: z.string().describe('Team name'),
  status: TeamStatusSchema.describe('Current team status'),
  config: TeamConfigSchema.describe('Team configuration'),
  metrics: TeamMetricsSchema.describe('Team metrics'),
  budget: TeamBudgetSchema.optional().describe('Budget information'),
  currentBranch: z.string().default('main').describe('Current branch name'),
  sessionTreeId: z.string().optional().describe('Session tree ID'),
  createdAt: TimestampSchema.describe('Creation timestamp'),
  updatedAt: TimestampSchema.describe('Last update timestamp'),
  completedAt: OptionalTimestampSchema.describe('Completion timestamp'),
  metadata: MetadataSchema.describe('Additional metadata'),
});

// ============================================================================
// Create Team Schema
// ============================================================================

export const CreateTeamSchema = z.object({
  name: z.string().min(1).max(255).describe('Team name'),
  config: TeamConfigSchema.optional().describe('Team configuration'),
  budgetLimit: z.number().positive().optional().describe('Budget limit in USD'),
  metadata: MetadataSchema.describe('Additional metadata'),
});

// ============================================================================
// Update Team Schema
// ============================================================================

export const UpdateTeamSchema = z.object({
  name: z.string().min(1).max(255).optional().describe('Team name'),
  config: TeamConfigSchema.optional().describe('Team configuration updates'),
  status: TeamStatusSchema.optional().describe('New status'),
  metadata: MetadataSchema.optional().describe('Additional metadata'),
});

// ============================================================================
// Scale Team Schema
// ============================================================================

export const ScaleTeamSchema = z.object({
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
// Team Event Schema
// ============================================================================

export const TeamEventSchema = z.object({
  id: z.string().describe('Event ID'),
  teamId: z.string().describe('Team ID'),
  type: z.string().describe('Event type'),
  payload: MetadataSchema.describe('Event payload'),
  timestamp: TimestampSchema.describe('Event timestamp'),
  agentId: z.string().optional().describe('Associated agent ID'),
});

// ============================================================================
// List Teams Query Schema
// ============================================================================

export const ListTeamsQuerySchema = z.object({
  status: TeamStatusSchema.optional().describe('Filter by status'),
  cursor: z.string().optional().describe('Pagination cursor'),
  limit: z.coerce.number().int().min(1).max(500).default(50)
    .describe('Number of items per page'),
  sort: z.enum(['created_at', 'updated_at', 'name', 'status']).default('created_at')
    .describe('Sort field'),
  direction: z.enum(['asc', 'desc']).default('desc').describe('Sort direction'),
});

// ============================================================================
// Team Summary Schema (for list view)
// ============================================================================

export const TeamSummarySchema = z.object({
  id: z.string().describe('Team ID'),
  name: z.string().describe('Team name'),
  status: TeamStatusSchema.describe('Team status'),
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

export const TeamListResponseSchema = z.object({
  teams: z.array(TeamSummarySchema),
  total: z.number().int().optional(),
  hasMore: z.boolean(),
  nextCursor: z.string().optional(),
});

export const TeamEventListResponseSchema = z.object({
  events: z.array(TeamEventSchema),
  hasMore: z.boolean(),
  nextCursor: z.string().optional(),
});

// ============================================================================
// Type Exports
// ============================================================================

export type TeamStatus = z.infer<typeof TeamStatusSchema>;
export type Team = z.infer<typeof TeamSchema>;
export type TeamConfig = z.infer<typeof TeamConfigSchema>;
export type TeamMetrics = z.infer<typeof TeamMetricsSchema>;
export type TeamBudget = z.infer<typeof TeamBudgetSchema>;
export type TeamSummary = z.infer<typeof TeamSummarySchema>;
export type TeamEvent = z.infer<typeof TeamEventSchema>;
export type CreateTeam = z.infer<typeof CreateTeamSchema>;
export type UpdateTeam = z.infer<typeof UpdateTeamSchema>;
export type ScaleTeam = z.infer<typeof ScaleTeamSchema>;
export type Branch = z.infer<typeof BranchSchema>;
export type CreateBranch = z.infer<typeof CreateBranchSchema>;
export type SwitchBranch = z.infer<typeof SwitchBranchSchema>;
export type CompareBranches = z.infer<typeof CompareBranchesSchema>;
export type BranchComparison = z.infer<typeof BranchComparisonSchema>;
export type ListTeamsQuery = z.infer<typeof ListTeamsQuerySchema>;

/** Type alias for TeamListResponseSchema */
export type TeamListResponse = z.infer<typeof TeamListResponseSchema>;
