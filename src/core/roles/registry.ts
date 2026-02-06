/**
 * @fileoverview Agent Role Registry
 * 
 * Central registry for managing agent roles, assignments, and swarm compositions.
 * Provides CRUD operations for roles, assignment management, validation,
 * and intelligent swarm composition based on task requirements.
 * 
 * @module core/roles/registry
 * @version 1.0.0
 * @license MIT
 */

import { EventEmitter } from 'events'
import {
  AgentRole,
  AssignmentContext,
  Permission,
  RoleAssignment,
  RoleAssignmentEvent,
  RoleStatistics,
  RoleValidationResult,
  StorageAdapter,
  SwarmComposition,
  SwarmRequirements
} from './types.js'
import { BUILTIN_ROLES, BUILTIN_ROLES_MAP, getBuiltinRole } from './definitions.js'

/**
 * Configuration options for the RoleRegistry.
 */
export interface RoleRegistryOptions {
  /** Storage adapter for persisting roles and assignments */
  storage: StorageAdapter
  /** Whether to load built-in roles on initialization */
  loadBuiltinRoles?: boolean
  /** Prefix for storage keys */
  storagePrefix?: string
}

/**
 * Central registry for managing agent roles and assignments.
 * 
 * The RoleRegistry provides:
 * - Role CRUD operations (create, read, update, delete)
 * - Built-in role management
 * - Role assignment tracking
 * - Permission validation
 * - Communication topology validation
 * - Intelligent swarm composition
 * 
 * @example
 * ```typescript
 * const registry = new RoleRegistry({ storage: adapter });
 * await registry.initialize();
 * 
 * // Assign a role to an agent
 * const assignment = await registry.assignRole('agent-123', 'worker', {
 *   swarmId: 'swarm-456'
 * });
 * 
 * // Check permissions
 * if (registry.hasPermission('agent-123', 'write_assigned')) {
 *   // Allow write operation
 * }
 * ```
 */
export class RoleRegistry extends EventEmitter {
  private roles: Map<string, AgentRole>
  private assignments: Map<string, RoleAssignment>
  private storage: StorageAdapter
  private storagePrefix: string
  private initialized: boolean

  /**
   * Create a new RoleRegistry instance.
   * 
   * @param options - Configuration options
   */
  constructor(options: RoleRegistryOptions) {
    super()
    this.roles = new Map()
    this.assignments = new Map()
    this.storage = options.storage
    this.storagePrefix = options.storagePrefix ?? 'roles:'
    this.initialized = false

    if (options.loadBuiltinRoles !== false) {
      this.loadBuiltinRoles()
    }
  }

  /**
   * Initialize the registry by loading persisted data from storage.
   * Must be called before using most registry methods.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    try {
      // Load custom roles from storage
      const roleKeys = await this.storage.list(`${this.storagePrefix}role:`)
      for (const key of roleKeys) {
        const role = await this.storage.get<AgentRole>(key)
        if (role) {
          const roleId = key.replace(`${this.storagePrefix}role:`, '')
          this.roles.set(roleId, role)
        }
      }

      // Load assignments from storage
      const assignmentKeys = await this.storage.list(`${this.storagePrefix}assignment:`)
      for (const key of assignmentKeys) {
        const assignment = await this.storage.get<RoleAssignment>(key)
        if (assignment) {
          const agentId = key.replace(`${this.storagePrefix}assignment:`, '')
          this.assignments.set(agentId, {
            ...assignment,
            assignedAt: new Date(assignment.assignedAt)
          })
        }
      }

      this.initialized = true
      this.emit('initialized', { roles: this.roles.size, assignments: this.assignments.size })
    } catch (error) {
      this.emit('error', { operation: 'initialize', error })
      throw error
    }
  }

  /**
   * Ensure the registry is initialized before proceeding.
   * @private
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('RoleRegistry not initialized. Call initialize() first.')
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // ROLE MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Register a new custom role.
   * 
   * @param role - The role definition to register
   * @throws Error if a role with the same ID already exists
   * 
   * @example
   * ```typescript
   * registry.registerRole({
   *   id: 'custom-worker',
   *   name: 'Custom Worker',
   *   description: 'A specialized worker role',
   *   systemPrompt: 'You are a custom worker...',
   *   tools: ['read', 'write'],
   *   permissions: ['read_assigned', 'write_assigned'],
   *   maxIterations: 15,
   *   autoSubmit: false,
   *   canMessage: ['coordinator'],
   *   broadcastChannels: []
   * });
   * ```
   */
  async registerRole(role: AgentRole): Promise<void> {
    this.ensureInitialized()

    // Validate role
    const validation = this.validateRole(role)
    if (!validation.valid) {
      throw new Error(`Invalid role: ${validation.errors.join(', ')}`)
    }

    // Check for existing role
    if (this.roles.has(role.id) && BUILTIN_ROLES_MAP.has(role.id)) {
      throw new Error(`Cannot override built-in role: ${role.id}`)
    }

    // Store role
    this.roles.set(role.id, role)
    await this.storage.set(`${this.storagePrefix}role:${role.id}`, role)

    this.emit('role:registered', { roleId: role.id, role })
  }

  /**
   * Unregister a custom role.
   * Built-in roles cannot be unregistered.
   * 
   * @param roleId - The role ID to unregister
   * @throws Error if the role is built-in or has active assignments
   */
  async unregisterRole(roleId: string): Promise<void> {
    this.ensureInitialized()

    if (BUILTIN_ROLES_MAP.has(roleId)) {
      throw new Error(`Cannot unregister built-in role: ${roleId}`)
    }

    // Check for active assignments
    const agentsWithRole = this.getAgentsWithRole(roleId)
    if (agentsWithRole.length > 0) {
      throw new Error(`Cannot unregister role with active assignments: ${agentsWithRole.length} agents`)
    }

    this.roles.delete(roleId)
    await this.storage.delete(`${this.storagePrefix}role:${roleId}`)

    this.emit('role:unregistered', { roleId })
  }

  /**
   * Get a role by ID.
   * 
   * @param roleId - The role identifier
   * @returns The role definition or undefined if not found
   */
  getRole(roleId: string): AgentRole | undefined {
    this.ensureInitialized()
    return this.roles.get(roleId) ?? getBuiltinRole(roleId)
  }

  /**
   * Get all registered roles (both built-in and custom).
   * 
   * @returns Array of all role definitions
   */
  getAllRoles(): AgentRole[] {
    this.ensureInitialized()
    return [...BUILTIN_ROLES, ...Array.from(this.roles.values())]
  }

  /**
   * Get all custom roles (excluding built-in).
   * 
   * @returns Array of custom role definitions
   */
  getCustomRoles(): AgentRole[] {
    this.ensureInitialized()
    return Array.from(this.roles.values())
  }

  /**
   * Check if a role exists.
   * 
   * @param roleId - The role identifier
   * @returns True if the role exists
   */
  hasRole(roleId: string): boolean {
    this.ensureInitialized()
    return this.roles.has(roleId) || BUILTIN_ROLES_MAP.has(roleId)
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // BUILT-IN ROLES
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Load built-in roles into the registry.
   * This is called automatically during construction unless disabled.
   */
  loadBuiltinRoles(): void {
    for (const role of BUILTIN_ROLES) {
      this.roles.set(role.id, role)
    }
    this.emit('roles:builtin-loaded', { count: BUILTIN_ROLES.length })
  }

  /**
   * Reset to built-in roles only.
   * Removes all custom roles and their assignments.
   * 
   * @warning This is destructive and cannot be undone.
   */
  async resetToBuiltin(): Promise<void> {
    this.ensureInitialized()

    // Get all custom role IDs
    const customRoleIds = this.getCustomRoles().map(r => r.id)

    // Unassign all agents from custom roles
    for (const [agentId, assignment] of this.assignments) {
      if (customRoleIds.includes(assignment.roleId)) {
        await this.unassignRole(agentId)
      }
    }

    // Remove custom roles from storage
    for (const roleId of customRoleIds) {
      this.roles.delete(roleId)
      await this.storage.delete(`${this.storagePrefix}role:${roleId}`)
    }

    this.emit('roles:reset', { customRolesRemoved: customRoleIds.length })
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // CUSTOM ROLE CREATION
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Create a new custom role with sensible defaults.
   * 
   * @param config - Partial role configuration
   * @param createdBy - ID of the user or agent creating the role
   * @returns The created role
   * 
   * @example
   * ```typescript
   * const role = await registry.createCustomRole({
   *   id: 'analyzer',
   *   name: 'Code Analyzer',
   *   description: 'Analyzes code for patterns',
   *   systemPrompt: 'You analyze code...',
   *   tools: ['read', 'grep', 'analyze']
   * }, 'user-123');
   * ```
   */
  async createCustomRole(
    config: Partial<AgentRole>,
    createdBy: string
  ): Promise<AgentRole> {
    this.ensureInitialized()

    if (!config.id) {
      throw new Error('Role ID is required')
    }

    const role: AgentRole = {
      id: config.id,
      name: config.name ?? config.id,
      description: config.description ?? '',
      systemPrompt: config.systemPrompt ?? '',
      promptTemplate: config.promptTemplate,
      tools: config.tools ?? [],
      permissions: config.permissions ?? ['read_assigned'],
      maxIterations: config.maxIterations ?? 10,
      autoSubmit: config.autoSubmit ?? false,
      requireApproval: config.requireApproval ?? false,
      canMessage: config.canMessage ?? [],
      broadcastChannels: config.broadcastChannels ?? [],
      preferredProvider: config.preferredProvider,
      preferredModel: config.preferredModel,
      costBudget: config.costBudget,
      timeoutMs: config.timeoutMs ?? 300000,
      maxConcurrentTasks: config.maxConcurrentTasks ?? 1,
      priority: config.priority ?? 1,
      tags: config.tags ?? [],
      metadata: {
        ...config.metadata,
        createdBy,
        createdAt: new Date().toISOString()
      }
    }

    await this.registerRole(role)
    return role
  }

  /**
   * Update an existing custom role.
   * Built-in roles cannot be modified.
   * 
   * @param roleId - The role ID to update
   * @param updates - Partial role updates
   * @returns The updated role
   */
  async updateRole(roleId: string, updates: Partial<AgentRole>): Promise<AgentRole> {
    this.ensureInitialized()

    if (BUILTIN_ROLES_MAP.has(roleId)) {
      throw new Error(`Cannot modify built-in role: ${roleId}`)
    }

    const existing = this.roles.get(roleId)
    if (!existing) {
      throw new Error(`Role not found: ${roleId}`)
    }

    const updated: AgentRole = {
      ...existing,
      ...updates,
      id: roleId, // Prevent ID changes
      metadata: {
        ...existing.metadata,
        ...updates.metadata,
        updatedAt: new Date().toISOString()
      }
    }

    this.roles.set(roleId, updated)
    await this.storage.set(`${this.storagePrefix}role:${roleId}`, updated)

    this.emit('role:updated', { roleId, role: updated })
    return updated
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // ROLE ASSIGNMENT
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Assign a role to an agent.
   * 
   * @param agentId - The agent to assign the role to
   * @param roleId - The role to assign
   * @param context - Optional assignment context (swarm, worktree, etc.)
   * @returns The role assignment
   * 
   * @example
   * ```typescript
   * const assignment = await registry.assignRole('agent-123', 'worker', {
   *   swarmId: 'swarm-456',
   *   worktreeId: 'wt-789'
   * });
   * ```
   */
  async assignRole(
    agentId: string,
    roleId: string,
    context?: AssignmentContext
  ): Promise<RoleAssignment> {
    this.ensureInitialized()

    const role = this.getRole(roleId)
    if (!role) {
      throw new Error(`Role not found: ${roleId}`)
    }

    const assignment: RoleAssignment = {
      agentId,
      roleId,
      swarmId: context?.swarmId,
      worktreeId: context?.worktreeId,
      assignedAt: new Date(),
      assignedBy: context?.context ?? 'system',
      expiresAt: context?.expiresAt,
      context: context?.context
    }

    this.assignments.set(agentId, assignment)
    await this.storage.set(`${this.storagePrefix}assignment:${agentId}`, assignment)

    const event: RoleAssignmentEvent = {
      type: 'role_assigned',
      agentId,
      roleId,
      timestamp: new Date(),
      assignment
    }
    this.emit('assignment:assigned', event)

    return assignment
  }

  /**
   * Remove a role assignment from an agent.
   * 
   * @param agentId - The agent to unassign
   */
  async unassignRole(agentId: string): Promise<void> {
    this.ensureInitialized()

    const assignment = this.assignments.get(agentId)
    if (!assignment) {
      return // Nothing to do
    }

    this.assignments.delete(agentId)
    await this.storage.delete(`${this.storagePrefix}assignment:${agentId}`)

    const event: RoleAssignmentEvent = {
      type: 'role_unassigned',
      agentId,
      roleId: assignment.roleId,
      timestamp: new Date()
    }
    this.emit('assignment:unassigned', event)
  }

  /**
   * Get the role assignment for an agent.
   * 
   * @param agentId - The agent identifier
   * @returns The role assignment or undefined
   */
  getAssignment(agentId: string): RoleAssignment | undefined {
    this.ensureInitialized()
    return this.assignments.get(agentId)
  }

  /**
   * Get all role assignments.
   * 
   * @returns Array of all role assignments
   */
  getAllAssignments(): RoleAssignment[] {
    this.ensureInitialized()
    return Array.from(this.assignments.values())
  }

  /**
   * Get all agents with a specific role.
   * 
   * @param roleId - The role identifier
   * @returns Array of agent IDs with the role
   */
  getAgentsWithRole(roleId: string): string[] {
    this.ensureInitialized()
    return Array.from(this.assignments.entries())
      .filter(([, assignment]) => assignment.roleId === roleId)
      .map(([agentId]) => agentId)
  }

  /**
   * Get the role assigned to an agent.
   * 
   * @param agentId - The agent identifier
   * @returns The role definition or undefined
   */
  getAgentRole(agentId: string): AgentRole | undefined {
    this.ensureInitialized()
    const assignment = this.assignments.get(agentId)
    if (!assignment) {
      return undefined
    }
    return this.getRole(assignment.roleId)
  }

  /**
   * Check if an agent has a role assigned.
   * 
   * @param agentId - The agent identifier
   * @returns True if the agent has a role
   */
  hasAssignment(agentId: string): boolean {
    this.ensureInitialized()
    return this.assignments.has(agentId)
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // VALIDATION
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Validate a role definition.
   * 
   * @param role - The role to validate
   * @returns Validation result with errors and warnings
   */
  validateRole(role: AgentRole): RoleValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    // Required fields
    if (!role.id || role.id.trim() === '') {
      errors.push('Role ID is required')
    }
    if (!role.name || role.name.trim() === '') {
      errors.push('Role name is required')
    }
    if (!role.systemPrompt || role.systemPrompt.trim() === '') {
      errors.push('System prompt is required')
    }

    // ID format
    if (role.id && !/^[a-z0-9-]+$/.test(role.id)) {
      warnings.push('Role ID should only contain lowercase letters, numbers, and hyphens')
    }

    // Iteration limits
    if (role.maxIterations < 1) {
      errors.push('maxIterations must be at least 1')
    }
    if (role.maxIterations > 10000) {
      warnings.push('maxIterations seems unusually high')
    }

    // Permissions validation
    const validPermissions: Permission[] = [
      'read_all', 'read_assigned', 'write_all', 'write_assigned',
      'delegate_tasks', 'manage_agents', 'comment', 'approve', 'reject',
      'read_metrics', 'read_logs', 'send_alerts', 'git_operations'
    ]
    for (const perm of role.permissions) {
      if (!validPermissions.includes(perm)) {
        warnings.push(`Unknown permission: ${perm}`)
      }
    }

    // Can message validation
    for (const targetRole of role.canMessage) {
      if (!this.hasRole(targetRole) && !BUILTIN_ROLES_MAP.has(targetRole)) {
        warnings.push(`Can message role that doesn't exist: ${targetRole}`)
      }
    }

    // Budget validation
    if (role.costBudget !== undefined && role.costBudget < 0) {
      errors.push('costBudget cannot be negative')
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    }
  }

  /**
   * Check if a role can message another role.
   * 
   * @param fromRole - The sender role ID
   * @param toRole - The recipient role ID
   * @returns True if communication is allowed
   */
  canMessage(fromRole: string, toRole: string): boolean {
    this.ensureInitialized()

    const role = this.getRole(fromRole)
    if (!role) {
      return false
    }

    // Can message specific roles
    if (role.canMessage.includes(toRole)) {
      return true
    }

    // Can always message self
    if (fromRole === toRole) {
      return true
    }

    return false
  }

  /**
   * Check if an agent has a specific permission.
   * 
   * @param agentId - The agent identifier
   * @param permission - The permission to check
   * @returns True if the agent has the permission
   */
  hasPermission(agentId: string, permission: Permission): boolean {
    this.ensureInitialized()

    const role = this.getAgentRole(agentId)
    if (!role) {
      return false
    }

    return role.permissions.includes(permission)
  }

  /**
   * Get all permissions for an agent.
   * 
   * @param agentId - The agent identifier
   * @returns Array of permissions
   */
  getAgentPermissions(agentId: string): Permission[] {
    this.ensureInitialized()

    const role = this.getAgentRole(agentId)
    if (!role) {
      return []
    }

    return role.permissions
  }

  /**
   * Get the tools an agent is allowed to use.
   * 
   * @param agentId - The agent identifier
   * @returns Array of tool names
   */
  getAllowedTools(agentId: string): string[] {
    this.ensureInitialized()

    const role = this.getAgentRole(agentId)
    if (!role) {
      return []
    }

    return role.tools
  }

  /**
   * Check if an agent can use a specific tool.
   * 
   * @param agentId - The agent identifier
   * @param tool - The tool name
   * @returns True if the agent can use the tool
   */
  canUseTool(agentId: string, tool: string): boolean {
    this.ensureInitialized()

    const role = this.getAgentRole(agentId)
    if (!role) {
      return false
    }

    return role.tools.includes(tool)
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // SWARM COMPOSITION
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Compose an optimal swarm based on task requirements.
   * 
   * This method analyzes the task requirements and returns a recommended
   * swarm composition with appropriate roles.
   * 
   * @param requirements - Task requirements
   * @returns Recommended swarm composition
   * 
   * @example
   * ```typescript
   * const composition = registry.composeSwarm({
   *   task: 'Implement user authentication',
   *   complexity: 'high',
   *   estimatedSubtasks: 5,
   *   securitySensitive: true,
   *   requiresReview: true
   * });
   * ```
   */
  composeSwarm(requirements: SwarmRequirements): SwarmComposition {
    this.ensureInitialized()

    // Always include a coordinator
    const coordinator: RoleAssignment = {
      agentId: `coordinator-${Date.now()}`,
      roleId: 'coordinator',
      assignedAt: new Date(),
      assignedBy: 'system'
    }

    // Determine number of workers based on complexity and subtasks
    let workerCount = 1
    if (requirements.complexity === 'low') {
      workerCount = Math.min(requirements.estimatedSubtasks, 2)
    } else if (requirements.complexity === 'medium') {
      workerCount = Math.min(Math.ceil(requirements.estimatedSubtasks / 2), 5)
    } else {
      workerCount = Math.min(Math.ceil(requirements.estimatedSubtasks / 2), 10)
    }

    const workers: RoleAssignment[] = []
    for (let i = 0; i < workerCount; i++) {
      workers.push({
        agentId: `worker-${i + 1}-${Date.now()}`,
        roleId: 'worker',
        assignedAt: new Date(),
        assignedBy: 'system'
      })
    }

    // Add reviewers if required or for high complexity
    const reviewers: RoleAssignment[] = []
    if (requirements.requiresReview || requirements.complexity === 'high') {
      const reviewerCount = requirements.securitySensitive ? 2 : 1
      for (let i = 0; i < reviewerCount; i++) {
        reviewers.push({
          agentId: `reviewer-${i + 1}-${Date.now()}`,
          roleId: 'reviewer',
          assignedAt: new Date(),
          assignedBy: 'system'
        })
      }
    }

    // Add monitors for high complexity or sensitive tasks
    const monitors: RoleAssignment[] = []
    if (requirements.complexity === 'high' || requirements.requiresMonitoring) {
      monitors.push({
        agentId: `monitor-${Date.now()}`,
        roleId: 'monitor',
        assignedAt: new Date(),
        assignedBy: 'system'
      })
    }

    // Add refinery for integration needs
    const refineries: RoleAssignment[] = []
    if (requirements.requiresIntegration || workers.length > 3) {
      refineries.push({
        agentId: `refinery-${Date.now()}`,
        roleId: 'refinery',
        assignedAt: new Date(),
        assignedBy: 'system'
      })
    }

    return {
      coordinator,
      workers,
      reviewers: reviewers.length > 0 ? reviewers : undefined,
      monitors: monitors.length > 0 ? monitors : undefined,
      refineries: refineries.length > 0 ? refineries : undefined,
      createdAt: new Date(),
      metadata: {
        requirements,
        totalAgents: 1 + workers.length + reviewers.length + monitors.length + refineries.length
      }
    }
  }

  /**
   * Estimate the cost for a swarm composition.
   * 
   * @param composition - The swarm composition
   * @returns Estimated cost in USD
   */
  estimateSwarmCost(composition: SwarmComposition): number {
    let total = 0

    const addCost = (assignment: RoleAssignment) => {
      const role = this.getRole(assignment.roleId)
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
  // STATISTICS
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Get usage statistics for a role.
   * Note: This returns placeholder data. Real implementation would
   * query metrics storage.
   * 
   * @param roleId - The role identifier
   * @returns Role statistics
   */
  async getRoleStatistics(roleId: string): Promise<RoleStatistics> {
    this.ensureInitialized()

    const agentsWithRole = this.getAgentsWithRole(roleId)

    // Placeholder - real implementation would query metrics
    return {
      roleId,
      agentCount: agentsWithRole.length,
      tasksCompleted: 0,
      tasksFailed: 0,
      avgTaskDurationMs: 0,
      totalCost: 0
    }
  }

  /**
   * Get statistics for all roles.
   * 
   * @returns Map of role ID to statistics
   */
  async getAllRoleStatistics(): Promise<Map<string, RoleStatistics>> {
    this.ensureInitialized()

    const stats = new Map<string, RoleStatistics>()
    const roles = this.getAllRoles()

    for (const role of roles) {
      stats.set(role.id, await this.getRoleStatistics(role.id))
    }

    return stats
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // CLEANUP
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Clean up expired assignments.
   * 
   * @returns Number of assignments removed
   */
  async cleanupExpiredAssignments(): Promise<number> {
    this.ensureInitialized()

    const now = new Date()
    let removed = 0

    for (const [agentId, assignment] of this.assignments) {
      if (assignment.expiresAt && assignment.expiresAt < now) {
        await this.unassignRole(agentId)
        removed++
      }
    }

    return removed
  }

  /**
   * Dispose of the registry and release resources.
   */
  async dispose(): Promise<void> {
    this.roles.clear()
    this.assignments.clear()
    this.initialized = false
    this.removeAllListeners()
  }
}
