/**
 * @fileoverview Agent Role System Types
 * 
 * Gas Town-inspired specialized agent roles for coordinated multi-agent workflows.
 * This module defines the core type system for agent roles, permissions, assignments,
 * and swarm compositions.
 * 
 * @module core/roles/types
 * @version 1.0.0
 * @license MIT
 */

/**
 * Permission types for agent capabilities.
 * Each permission grants specific access to resources and actions within the system.
 */
export type Permission =
  /** Read access to all resources in the swarm */
  | 'read_all'
  /** Read access only to assigned resources */
  | 'read_assigned'
  /** Write access to all resources in the swarm */
  | 'write_all'
  /** Write access only to assigned resources */
  | 'write_assigned'
  /** Ability to delegate tasks to other agents */
  | 'delegate_tasks'
  /** Ability to create, update, and remove agents */
  | 'manage_agents'
  /** Ability to add comments on tasks and reviews */
  | 'comment'
  /** Ability to approve work and mark tasks complete */
  | 'approve'
  /** Ability to reject work and request changes */
  | 'reject'
  /** Ability to read system metrics */
  | 'read_metrics'
  /** Ability to read system logs */
  | 'read_logs'
  /** Ability to send alerts to other agents and humans */
  | 'send_alerts'
  /** Ability to perform git operations (commit, merge, rebase) */
  | 'git_operations'

/**
 * Core agent role definition.
 * Defines the behavior, capabilities, and constraints for a specific agent role.
 * 
 * @example
 * ```typescript
 * const workerRole: AgentRole = {
 *   id: 'worker',
 *   name: 'Worker',
 *   description: 'Executes assigned tasks',
 *   systemPrompt: 'You are a worker agent...',
 *   tools: ['read', 'write', 'edit'],
 *   permissions: ['read_assigned', 'write_assigned'],
 *   maxIterations: 20,
 *   autoSubmit: false,
 *   requireApproval: false,
 *   canMessage: ['coordinator'],
 *   broadcastChannels: []
 * };
 * ```
 */
export interface AgentRole {
  /** Unique identifier for the role */
  id: string
  /** Human-readable name for the role */
  name: string
  /** Detailed description of the role's purpose */
  description: string

  /**
   * System prompt that defines the agent's personality and behavior.
   * This is injected into every conversation with the agent.
   */
  systemPrompt: string

  /**
   * Optional prompt template for specific task types.
   * Can include placeholders like {{task}}, {{context}}, etc.
   */
  promptTemplate?: string

  /**
   * List of tool names this role is allowed to use.
   * Common tools: 'read', 'write', 'edit', 'bash', 'delegate', 'query_status', etc.
   */
  tools: string[]

  /**
   * Permissions granted to agents with this role.
   * Controls access to resources and actions.
   */
  permissions: Permission[]

  /**
   * Maximum number of iterations this role can perform in a single session.
   * Prevents runaway agents and controls costs.
   * Use 1000 for long-running monitoring agents.
   */
  maxIterations: number

  /**
   * Whether this role can auto-submit results without human approval.
   * Coordinators and monitors typically have this enabled.
   * Workers and reviewers typically require manual submission.
   */
  autoSubmit: boolean

  /**
   * Whether this role requires explicit approval for critical actions.
   * Adds an extra layer of safety for sensitive operations.
   * @default false
   */
  requireApproval?: boolean

  /**
   * List of role IDs that this role is allowed to message.
   * Controls the communication topology between agents.
   * @example ['coordinator', 'worker'] - Can message coordinators and workers
   */
  canMessage: string[]

  /**
   * List of broadcast channels this role can publish to.
   * Channels: 'swarm_updates', 'alerts', 'health_status', 'review_feedback'
   */
  broadcastChannels: string[]

  /**
   * Preferred LLM provider for this role.
   * @example 'anthropic', 'openai', 'google', 'moonshot'
   */
  preferredProvider?: string

  /**
   * Preferred model for this role.
   * @example 'claude-opus-4', 'gpt-4o', 'gemini-1.5-pro'
   */
  preferredModel?: string

  /**
   * Optional cost budget in USD for this role's operations.
   * Enforced by the budget controller.
   */
  costBudget?: number

  /**
   * Timeout in milliseconds for role operations.
   * @default 300000 (5 minutes)
   */
  timeoutMs?: number

  /**
   * Maximum concurrent tasks this role can handle.
   * @default 1
   */
  maxConcurrentTasks?: number

  /**
   * Priority level for task scheduling.
   * Higher priority agents get resources first.
   * @default 5
   */
  priority?: number

  /**
   * Tags for categorizing and filtering roles.
   */
  tags?: string[]

  /**
   * Metadata for extensibility.
   */
  metadata?: Record<string, unknown>
}

/**
 * Role assignment linking an agent to a role in a specific context.
 * Tracks when and by whom the assignment was made.
 */
export interface RoleAssignment {
  /** ID of the agent being assigned */
  agentId: string
  /** ID of the role being assigned */
  roleId: string
  /** Optional swarm ID for swarm-scoped assignments */
  swarmId?: string
  /** Optional worktree ID for worktree-scoped assignments */
  worktreeId?: string
  /** Timestamp when the assignment was created */
  assignedAt: Date
  /** ID of the user or agent who made the assignment */
  assignedBy: string
  /** Optional expiration time for temporary assignments */
  expiresAt?: Date
  /** Assignment context (e.g., 'manual', 'auto-scheduled', 'swarm-composed') */
  context?: string
}

/**
 * Context information for role assignments.
 * Used when assigning roles programmatically.
 */
export interface AssignmentContext {
  /** Swarm ID if assignment is swarm-scoped */
  swarmId?: string
  /** Worktree ID if assignment is worktree-scoped */
  worktreeId?: string
  /** Expiration time for temporary assignments */
  expiresAt?: Date
  /** Assignment context description */
  context?: string
}

/**
 * Composition of a swarm with different role assignments.
 * Defines the organizational structure of a multi-agent swarm.
 * 
 * Inspired by the Gas Town hierarchy:
 * - Coordinator (Mayor): Central authority
 * - Workers (Polecats): Task executors
 * - Reviewers (Witnesses): Quality assurance
 * - Monitors (Deacons): System watchers
 */
export interface SwarmComposition {
  /** The coordinator agent overseeing the swarm */
  coordinator: RoleAssignment
  /** Worker agents executing tasks */
  workers: RoleAssignment[]
  /** Optional reviewers for quality assurance */
  reviewers?: RoleAssignment[]
  /** Optional monitors for system health */
  monitors?: RoleAssignment[]
  /** Optional refinery agents for integration tasks */
  refineries?: RoleAssignment[]
  /** Timestamp when the composition was created */
  createdAt?: Date
  /** Swarm configuration metadata */
  metadata?: Record<string, unknown>
}

/**
 * Requirements for composing a new swarm.
 * Used by the RoleRegistry to determine optimal swarm composition.
 */
export interface SwarmRequirements {
  /** Description of the task the swarm needs to accomplish */
  task: string
  /** Complexity level of the task */
  complexity: 'low' | 'medium' | 'high'
  /** Estimated number of subtasks */
  estimatedSubtasks: number
  /** Whether the task involves security-sensitive operations */
  securitySensitive: boolean
  /** Whether the task requires review before completion */
  requiresReview: boolean
  /** Whether the task requires continuous monitoring */
  requiresMonitoring?: boolean
  /** Whether the task involves merge conflicts or integration */
  requiresIntegration?: boolean
  /** Preferred provider for swarm agents */
  preferredProvider?: string
  /** Budget constraints in USD */
  budget?: number
  /** Deadline for task completion */
  deadline?: Date
  /** Additional requirements as key-value pairs */
  additionalRequirements?: Record<string, unknown>
}

/**
 * Storage adapter interface for role persistence.
 * Implemented by concrete storage backends (SQLite, Redis, etc.).
 */
export interface StorageAdapter {
  /** Get a value by key */
  get<T>(key: string): Promise<T | undefined>
  /** Set a value by key */
  set<T>(key: string, value: T): Promise<void>
  /** Delete a value by key */
  delete(key: string): Promise<void>
  /** List keys with optional prefix */
  list(prefix?: string): Promise<string[]>
  /** Check if a key exists */
  has(key: string): Promise<boolean>
}

/**
 * Message filter for querying agent messages.
 */
export interface MessageFilter {
  /** Filter by message type */
  type?: string
  /** Filter by sender role */
  fromRole?: string
  /** Filter by priority level */
  priority?: 'low' | 'normal' | 'high' | 'urgent'
  /** Filter by read status */
  read?: boolean
  /** Filter messages after this timestamp */
  after?: Date
  /** Filter messages before this timestamp */
  before?: Date
  /** Maximum number of messages to return */
  limit?: number
}

/**
 * Role template for creating custom roles.
 * Extends a base role with modifications.
 */
export interface RoleTemplate {
  /** Template identifier */
  id: string
  /** Human-readable name */
  name: string
  /** Base role ID to extend */
  extends: string
  /** Override system prompt */
  systemPrompt?: string
  /** Additional tools to include */
  addTools?: string[]
  /** Tools to remove from base */
  removeTools?: string[]
  /** Additional permissions to grant */
  addPermissions?: Permission[]
  /** Permissions to remove from base */
  removePermissions?: Permission[]
  /** Override other properties */
  overrides?: Partial<Omit<AgentRole, 'id' | 'systemPrompt' | 'tools' | 'permissions'>>
}

/**
 * Role validation result.
 */
export interface RoleValidationResult {
  /** Whether the role is valid */
  valid: boolean
  /** Validation errors if invalid */
  errors: string[]
  /** Validation warnings */
  warnings: string[]
}

/**
 * Event emitted when a role is assigned.
 */
export interface RoleAssignmentEvent {
  /** Event type */
  type: 'role_assigned' | 'role_unassigned' | 'role_updated'
  /** Agent ID */
  agentId: string
  /** Role ID */
  roleId: string
  /** Timestamp */
  timestamp: Date
  /** Assignment details */
  assignment?: RoleAssignment
}

/**
 * Statistics for role usage.
 */
export interface RoleStatistics {
  /** Role ID */
  roleId: string
  /** Number of agents with this role */
  agentCount: number
  /** Total tasks completed */
  tasksCompleted: number
  /** Total tasks failed */
  tasksFailed: number
  /** Average task duration in milliseconds */
  avgTaskDurationMs: number
  /** Total cost incurred by this role */
  totalCost: number
  /** Last activity timestamp */
  lastActivityAt?: Date
}
