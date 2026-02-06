/**
 * Pi Coding Agent Zod Schemas
 *
 * Validation schemas for Pi multi-model agent integration:
 * - Instances (Pi CLI registrations)
 * - Sessions (conversation management)
 * - Tree operations (branching, forking, checkpointing)
 */

import { z } from 'zod';
import { MetadataSchema, TimestampSchema, PaginationQuerySchema } from './common';

// ============================================================================
// Pi Instance Schemas
// ============================================================================

export const PiProviderSchema = z.enum([
  'anthropic',
  'openai',
  'google',
  'groq',
  'cerebras',
  'ollama',
  'kimi',
  'minimax',
]);

export const PiInstanceStatusSchema = z.enum(['online', 'offline', 'busy', 'error']);

export const PiInstanceSchema = z.object({
  id: z.string().describe('Unique instance identifier'),
  name: z.string().describe('Instance name'),
  provider: PiProviderSchema.describe('LLM provider'),
  models: z.array(z.string()).describe('Available models'),
  endpoint: z.string().url().describe('Instance endpoint URL'),
  apiKey: z.string().optional().describe('API key (masked in responses)'),
  status: PiInstanceStatusSchema.describe('Current status'),
  health: z.object({
    lastCheck: TimestampSchema,
    responseTime: z.number().describe('Response time in ms'),
    healthy: z.boolean(),
    message: z.string().optional(),
  }).describe('Health check information'),
  capabilities: z.array(z.string()).describe('Supported capabilities'),
  maxConcurrent: z.number().int().default(5).describe('Max concurrent sessions'),
  currentSessions: z.number().int().default(0).describe('Active session count'),
  metadata: MetadataSchema.describe('Additional metadata'),
  createdAt: TimestampSchema.describe('Registration timestamp'),
  updatedAt: TimestampSchema.describe('Last update timestamp'),
});

export const CreatePiInstanceSchema = z.object({
  name: z.string().min(1).max(255).describe('Instance name'),
  provider: PiProviderSchema.describe('LLM provider'),
  models: z.array(z.string()).min(1).describe('Available models'),
  endpoint: z.string().url().describe('Instance endpoint URL'),
  apiKey: z.string().min(1).describe('API key'),
  capabilities: z.array(z.string()).default([]).describe('Supported capabilities'),
  maxConcurrent: z.number().int().min(1).max(100).default(5).describe('Max concurrent sessions'),
  metadata: MetadataSchema.describe('Additional metadata'),
});

export const UpdatePiInstanceSchema = z.object({
  name: z.string().min(1).max(255).optional().describe('Instance name'),
  models: z.array(z.string()).min(1).optional().describe('Available models'),
  endpoint: z.string().url().optional().describe('Instance endpoint URL'),
  apiKey: z.string().min(1).optional().describe('API key'),
  capabilities: z.array(z.string()).optional().describe('Supported capabilities'),
  maxConcurrent: z.number().int().min(1).max(100).optional().describe('Max concurrent sessions'),
  metadata: MetadataSchema.describe('Additional metadata'),
});

export const ListPiInstancesQuerySchema = PaginationQuerySchema.extend({
  provider: PiProviderSchema.optional().describe('Filter by provider'),
  status: PiInstanceStatusSchema.optional().describe('Filter by status'),
  healthy: z.boolean().optional().describe('Filter by health status'),
});

// ============================================================================
// Pi Session Schemas
// ============================================================================

export const PiSessionStatusSchema = z.enum([
  'initializing',
  'active',
  'paused',
  'completed',
  'error',
  'terminated',
]);

export const PiSessionSchema = z.object({
  id: z.string().describe('Unique session identifier'),
  instanceId: z.string().describe('Parent instance ID'),
  label: z.string().describe('Session label'),
  status: PiSessionStatusSchema.describe('Current status'),
  model: z.string().describe('Active model'),
  provider: PiProviderSchema.describe('LLM provider'),
  context: z.object({
    messages: z.number().int().describe('Message count'),
    tokens: z.number().int().describe('Token count'),
    maxTokens: z.number().int().describe('Max context tokens'),
  }).describe('Context information'),
  task: z.string().optional().describe('Current task/prompt'),
  parentSessionId: z.string().optional().describe('Parent session for forks'),
  branchId: z.string().optional().describe('Current branch ID'),
  metadata: MetadataSchema.describe('Additional metadata'),
  createdAt: TimestampSchema.describe('Creation timestamp'),
  updatedAt: TimestampSchema.describe('Last update timestamp'),
  pausedAt: TimestampSchema.optional().describe('Pause timestamp'),
  completedAt: TimestampSchema.optional().describe('Completion timestamp'),
});

export const CreatePiSessionSchema = z.object({
  instanceId: z.string().min(1).describe('Pi instance ID'),
  label: z.string().min(1).max(255).describe('Session label'),
  model: z.string().min(1).describe('Model to use'),
  task: z.string().optional().describe('Initial task/prompt'),
  parentSessionId: z.string().optional().describe('Parent session for forks'),
  branchId: z.string().optional().describe('Branch to start on'),
  metadata: MetadataSchema.describe('Additional metadata'),
});

export const ListPiSessionsQuerySchema = PaginationQuerySchema.extend({
  instanceId: z.string().optional().describe('Filter by instance'),
  status: PiSessionStatusSchema.optional().describe('Filter by status'),
  model: z.string().optional().describe('Filter by model'),
});

// ============================================================================
// Pi Checkpoint Schemas
// ============================================================================

export const PiCheckpointSchema = z.object({
  id: z.string().describe('Checkpoint identifier'),
  sessionId: z.string().describe('Parent session ID'),
  label: z.string().describe('Checkpoint label'),
  description: z.string().optional().describe('Checkpoint description'),
  messageIndex: z.number().int().describe('Message index at checkpoint'),
  tokenCount: z.number().int().describe('Token count at checkpoint'),
  hash: z.string().describe('Content hash for verification'),
  metadata: MetadataSchema.describe('Additional metadata'),
  createdAt: TimestampSchema.describe('Creation timestamp'),
});

export const CreatePiCheckpointSchema = z.object({
  sessionId: z.string().min(1).describe('Session ID'),
  label: z.string().min(1).max(255).describe('Checkpoint label'),
  description: z.string().optional().describe('Checkpoint description'),
  metadata: MetadataSchema.describe('Additional metadata'),
});

export const PiCheckpointListResponseSchema = z.object({
  checkpoints: z.array(PiCheckpointSchema),
  hasMore: z.boolean(),
  nextCursor: z.string().optional(),
});

// ============================================================================
// Conversation Tree Schemas
// ============================================================================

export const TreeNodeSchema = z.object({
  id: z.string().describe('Node identifier'),
  sessionId: z.string().describe('Parent session ID'),
  parentId: z.string().optional().describe('Parent node ID'),
  children: z.array(z.string()).describe('Child node IDs'),
  role: z.enum(['system', 'user', 'assistant', 'tool']).describe('Message role'),
  content: z.string().describe('Message content'),
  model: z.string().optional().describe('Model used (for assistant)'),
  timestamp: TimestampSchema.describe('Message timestamp'),
  metadata: MetadataSchema.describe('Additional metadata'),
});

export const TreeBranchSchema = z.object({
  id: z.string().describe('Branch identifier'),
  name: z.string().describe('Branch name'),
  description: z.string().optional().describe('Branch description'),
  rootNodeId: z.string().describe('Root node ID'),
  currentNodeId: z.string().describe('Current/latest node ID'),
  nodeCount: z.number().int().describe('Number of nodes'),
  isActive: z.boolean().describe('Whether this is the active branch'),
  createdAt: TimestampSchema.describe('Creation timestamp'),
  updatedAt: TimestampSchema.describe('Last update timestamp'),
});

export const PiConversationTreeSchema = z.object({
  sessionId: z.string().describe('Parent session ID'),
  branches: z.array(TreeBranchSchema).describe('All branches'),
  activeBranchId: z.string().describe('Currently active branch'),
  nodes: z.array(TreeNodeSchema).describe('All nodes (flattened)'),
  totalNodes: z.number().int().describe('Total node count'),
  totalBranches: z.number().int().describe('Total branch count'),
});

export const CreateBranchSchema = z.object({
  sessionId: z.string().min(1).describe('Session ID'),
  name: z.string().min(1).max(255).describe('Branch name'),
  description: z.string().optional().describe('Branch description'),
  fromNodeId: z.string().describe('Node to branch from'),
});

export const SwitchBranchSchema = z.object({
  sessionId: z.string().min(1).describe('Session ID'),
  branchId: z.string().min(1).describe('Branch to switch to'),
});

export const ForkSessionSchema = z.object({
  sessionId: z.string().min(1).describe('Source session ID'),
  label: z.string().min(1).max(255).describe('New session label'),
  branchId: z.string().optional().describe('Specific branch to fork'),
  nodeId: z.string().optional().describe('Specific node to fork from'),
});

export const CompactHistorySchema = z.object({
  sessionId: z.string().min(1).describe('Session ID'),
  keepNodes: z.number().int().min(1).optional().describe('Nodes to keep per branch'),
  compactSystem: z.boolean().default(true).describe('Compact system messages'),
});

export const CompactResultSchema = z.object({
  originalNodes: z.number().int().describe('Original node count'),
  removedNodes: z.number().int().describe('Removed node count'),
  remainingNodes: z.number().int().describe('Remaining node count'),
  summary: z.string().describe('Generated summary'),
  savedTokens: z.number().int().describe('Estimated tokens saved'),
});

// ============================================================================
// Response Schemas
// ============================================================================

export const PiInstanceListResponseSchema = z.object({
  instances: z.array(PiInstanceSchema),
  total: z.number().int().optional(),
  hasMore: z.boolean(),
  nextCursor: z.string().optional(),
});

export const PiInstanceHealthSchema = z.object({
  instanceId: z.string(),
  status: PiInstanceStatusSchema,
  healthy: z.boolean(),
  responseTime: z.number(),
  message: z.string().optional(),
  checkedAt: TimestampSchema,
});

export const PiSessionListResponseSchema = z.object({
  sessions: z.array(PiSessionSchema),
  total: z.number().int().optional(),
  hasMore: z.boolean(),
  nextCursor: z.string().optional(),
});

export const PauseSessionResponseSchema = z.object({
  sessionId: z.string(),
  status: z.literal('paused'),
  pausedAt: TimestampSchema,
  savedContext: z.object({
    messages: z.number().int(),
    tokens: z.number().int(),
  }),
});

export const ResumeSessionResponseSchema = z.object({
  sessionId: z.string(),
  status: z.literal('active'),
  resumedAt: TimestampSchema,
});

// ============================================================================
// Type Exports
// ============================================================================

export type PiProvider = z.infer<typeof PiProviderSchema>;
export type PiInstanceStatus = z.infer<typeof PiInstanceStatusSchema>;
export type PiInstance = z.infer<typeof PiInstanceSchema>;
export type CreatePiInstance = z.infer<typeof CreatePiInstanceSchema>;
export type UpdatePiInstance = z.infer<typeof UpdatePiInstanceSchema>;
export type ListPiInstancesQuery = z.infer<typeof ListPiInstancesQuerySchema>;

export type PiSessionStatus = z.infer<typeof PiSessionStatusSchema>;
export type PiSession = z.infer<typeof PiSessionSchema>;
export type CreatePiSession = z.infer<typeof CreatePiSessionSchema>;
export type ListPiSessionsQuery = z.infer<typeof ListPiSessionsQuerySchema>;

export type PiCheckpoint = z.infer<typeof PiCheckpointSchema>;
export type CreatePiCheckpoint = z.infer<typeof CreatePiCheckpointSchema>;

export type TreeNode = z.infer<typeof TreeNodeSchema>;
export type TreeBranch = z.infer<typeof TreeBranchSchema>;
export type PiConversationTree = z.infer<typeof PiConversationTreeSchema>;
export type CreateBranch = z.infer<typeof CreateBranchSchema>;
export type SwitchBranch = z.infer<typeof SwitchBranchSchema>;
export type ForkSession = z.infer<typeof ForkSessionSchema>;
export type CompactHistory = z.infer<typeof CompactHistorySchema>;
export type CompactResult = z.infer<typeof CompactResultSchema>;
