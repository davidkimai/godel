/**
 * @fileoverview Agent Role System
 * 
 * Gas Town-inspired specialized agent roles for coordinated multi-agent workflows.
 * This module provides a complete role system including:
 * 
 * - Type definitions for roles, permissions, and assignments
 * - Built-in role definitions (Coordinator, Worker, Reviewer, Refinery, Monitor)
 * - RoleRegistry for managing roles and assignments
 * - Inter-agent communication system (AgentMailbox, InterAgentBus)
 * 
 * ## Quick Start
 * 
 * ```typescript
 * import { RoleRegistry, AgentMailbox, InterAgentBus } from './roles/index.js';
 * 
 * // Initialize the registry
 * const registry = new RoleRegistry({ storage: adapter });
 * await registry.initialize();
 * 
 * // Assign a role to an agent
 * await registry.assignRole('agent-123', 'worker', { swarmId: 'swarm-1' });
 * 
 * // Check permissions
 * if (registry.hasPermission('agent-123', 'write_assigned')) {
 *   // Allow operation
 * }
 * 
 * // Set up communication
 * const bus = new InterAgentBus({ storage: adapter });
 * await bus.initialize();
 * 
 * // Register agents
 * const mailbox = bus.registerAgent('agent-123');
 * await mailbox.initialize();
 * ```
 * 
 * ## Built-in Roles
 * 
 * 1. **Coordinator (Mayor)** - Orchestrates multi-agent workflows
 * 2. **Worker (Polecat)** - Executes assigned tasks
 * 3. **Reviewer (Witness)** - Reviews and validates work
 * 4. **Refinery** - Handles merge conflicts and integration
 * 5. **Monitor (Deacon)** - Watches system health
 * 
 * @module core/roles
 * @version 1.0.0
 * @license MIT
 */

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export type {
  AgentRole,
  AssignmentContext,
  MessageFilter,
  Permission,
  RoleAssignment,
  RoleAssignmentEvent,
  RoleStatistics,
  RoleTemplate,
  RoleValidationResult,
  StorageAdapter,
  SwarmComposition,
  SwarmRequirements
} from './types.js'

// Re-export types needed for utility functions
import type { Permission as PermissionType, SwarmComposition as SwarmCompositionType, RoleAssignment as RoleAssignmentType } from './types.js'

export {
  // Inter-agent communication types
  AgentMessage,
  DeliveryStatus,
  MailboxStatistics,
  MessagePriority,
  MessageType
} from './inter-agent-comm.js'

// ═══════════════════════════════════════════════════════════════════════════════
// BUILT-IN ROLES
// ═══════════════════════════════════════════════════════════════════════════════

export {
  BUILTIN_ROLES,
  BUILTIN_ROLES_MAP,
  DEFAULT_ROLE,
  ROLE_TEMPLATES,
  getBuiltinRole,
  getRolesByCategory,
  isBuiltinRole
} from './definitions.js'

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

export {
  RoleRegistry,
  RoleRegistryOptions
} from './registry.js'

// ═══════════════════════════════════════════════════════════════════════════════
// INTER-AGENT COMMUNICATION
// ═══════════════════════════════════════════════════════════════════════════════

export {
  AgentMailbox,
  AgentMailboxOptions,
  InterAgentBus,
  InterAgentBusOptions
} from './inter-agent-comm.js'

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Maximum number of messages retained per mailbox.
 */
export const DEFAULT_MAX_MESSAGES = 1000

/**
 * Default message expiration time (24 hours).
 */
export const DEFAULT_MESSAGE_EXPIRY_MS = 24 * 60 * 60 * 1000

/**
 * Broadcast channel names used by built-in roles.
 */
export const BROADCAST_CHANNELS = {
  /** General swarm updates */
  SWARM_UPDATES: 'swarm_updates',
  /** Coordination messages */
  COORDINATION: 'coordination',
  /** Worker progress updates */
  WORKER_UPDATES: 'worker_updates',
  /** Review feedback */
  REVIEW_FEEDBACK: 'review_feedback',
  /** Integration updates */
  INTEGRATION_UPDATES: 'integration_updates',
  /** System alerts */
  ALERTS: 'alerts',
  /** Health status reports */
  HEALTH_STATUS: 'health_status'
} as const

/**
 * Role IDs for built-in roles.
 */
export const ROLE_IDS = {
  COORDINATOR: 'coordinator',
  WORKER: 'worker',
  REVIEWER: 'reviewer',
  REFINERY: 'refinery',
  MONITOR: 'monitor'
} as const

/**
 * Permission constants for type-safe usage.
 */
export const PERMISSIONS = {
  READ_ALL: 'read_all',
  READ_ASSIGNED: 'read_assigned',
  WRITE_ALL: 'write_all',
  WRITE_ASSIGNED: 'write_assigned',
  DELEGATE_TASKS: 'delegate_tasks',
  MANAGE_AGENTS: 'manage_agents',
  COMMENT: 'comment',
  APPROVE: 'approve',
  REJECT: 'reject',
  READ_METRICS: 'read_metrics',
  READ_LOGS: 'read_logs',
  SEND_ALERTS: 'send_alerts',
  GIT_OPERATIONS: 'git_operations'
} as const

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate a unique agent ID.
 * 
 * @param role - The role prefix
 * @returns A unique agent ID
 * 
 * @example
 * ```typescript
 * const id = generateAgentId('worker');
 * // Returns: "worker-abc123"
 * ```
 */
export function generateAgentId(role: string): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 7)
  return `${role}-${timestamp}${random}`
}

/**
 * Generate a unique swarm ID.
 * 
 * @returns A unique swarm ID
 * 
 * @example
 * ```typescript
 * const id = generateSwarmId();
 * // Returns: "swarm-abc123"
 * ```
 */
export function generateSwarmId(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 7)
  return `swarm-${timestamp}${random}`
}

/**
 * Check if a permission implies another permission.
 * 
 * @param permission - The permission to check
 * @param required - The required permission
 * @returns True if the permission implies the required one
 * 
 * @example
 * ```typescript
 * impliesPermission('read_all', 'read_assigned'); // true
 * impliesPermission('write_all', 'write_assigned'); // true
 * impliesPermission('read_assigned', 'read_all'); // false
 * ```
 */
export function impliesPermission(
  permission: PermissionType,
  required: PermissionType
): boolean {
  // read_all implies read_assigned
  if (permission === 'read_all' && required === 'read_assigned') {
    return true
  }
  // write_all implies write_assigned
  if (permission === 'write_all' && required === 'write_assigned') {
    return true
  }
  // Exact match
  return permission === required
}

/**
 * Check if a set of permissions includes a required permission,
 * considering permission implications.
 * 
 * @param permissions - The available permissions
 * @param required - The required permission
 * @returns True if the required permission is satisfied
 * 
 * @example
 * ```typescript
 * hasEffectivePermission(['read_all'], 'read_assigned'); // true
 * hasEffectivePermission(['write_assigned'], 'read_all'); // false
 * ```
 */
export function hasEffectivePermission(
  permissions: PermissionType[],
  required: PermissionType
): boolean {
  // Direct check
  if (permissions.includes(required)) {
    return true
  }

  // Check implications
  return permissions.some(p => impliesPermission(p, required))
}

/**
 * Get the recommended provider and model for a role.
 * 
 * @param role - The agent role
 * @returns Provider and model recommendation
 */
export function getRoleModelRecommendation(
  role: import('./types.js').AgentRole
): { provider: string; model: string } {
  return {
    provider: role.preferredProvider ?? 'anthropic',
    model: role.preferredModel ?? 'claude-sonnet-4'
  }
}

/**
 * Calculate the total cost budget for a swarm composition.
 * 
 * @param composition - The swarm composition
 * @param getRole - Function to get role by ID
 * @returns Total cost budget in USD
 */
export function calculateSwarmBudget(
  composition: SwarmCompositionType,
  getRole: (roleId: string) => import('./types.js').AgentRole | undefined
): number {
  type Assignment = RoleAssignmentType
  let total = 0

  const addCost = (assignment: Assignment) => {
    const role = getRole(assignment.roleId)
    if (role?.costBudget) {
      total += role.costBudget
    }
  }

  addCost(composition.coordinator)
  composition.workers.forEach(addCost)
  composition.reviewers?.forEach(addCost)
  composition.monitors?.forEach(addCost)
  composition.refineries?.forEach(addCost)

  return total
}

// ═══════════════════════════════════════════════════════════════════════════════
// VERSION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Agent Role System version.
 */
export const VERSION = '1.0.0'

/**
 * System metadata.
 */
export const METADATA = {
  name: 'dash-agent-roles',
  version: VERSION,
  description: 'Gas Town-inspired specialized agent roles for multi-agent workflows',
  builtInRoles: 5,
  defaultProvider: 'anthropic',
  defaultModel: 'claude-sonnet-4'
} as const
