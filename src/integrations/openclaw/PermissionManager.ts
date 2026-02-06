/**
 * OpenClaw Permission Manager
 * 
 * Manages tool whitelist/blacklist, sandbox configuration, permission inheritance,
 * and runtime permission checks for Godel agents using OpenClaw.
 */

import { logger } from '../../utils/logger';
import { EventEmitter } from 'events';
import {
  AgentPermissions,
  SandboxMode,
  SecurityProfile,
  PermissionInheritanceOptions,
  DEFAULT_PERMISSIONS,
  SECURITY_PROFILES,
  DEFAULT_INHERITANCE_OPTIONS,
  computeInheritedPermissions,
  validatePermissions,
  DANGEROUS_TOOLS,
  ALL_TOOLS,
} from './defaults';

// ============================================================================
// Types
// ============================================================================

export interface PermissionCheck {
  agentId: string;
  tool: string;
  allowed: boolean;
  reason?: string;
  timestamp: Date;
}

export interface PermissionViolation {
  agentId: string;
  tool: string;
  action: string;
  timestamp: Date;
  severity: 'low' | 'medium' | 'high' | 'critical';
  details?: Record<string, unknown>;
}

export interface PermissionAuditLog {
  agentId: string;
  checks: PermissionCheck[];
  violations: PermissionViolation[];
  lastUpdated: Date;
}

export interface PermissionCache {
  agentId: string;
  permissions: AgentPermissions;
  inherited: boolean;
  parentId?: string;
  expiresAt: Date;
}

export interface PermissionManagerConfig {
  /** Whether to enforce permissions strictly */
  strictMode: boolean;
  /** Default inheritance options */
  inheritanceOptions: PermissionInheritanceOptions;
  /** Audit log retention in hours */
  auditRetentionHours: number;
  /** Whether to auto-terminate on violations */
  autoTerminateOnViolation: boolean;
  /** Violation threshold for auto-termination */
  violationThreshold: number;
  /** Callback when violation detected */
  onViolation?: (violation: PermissionViolation) => void;
}

// ============================================================================
// Errors
// ============================================================================

export class PermissionDeniedError extends Error {
  constructor(
    public readonly agentId: string,
    public readonly tool: string,
    public readonly reason: string
  ) {
    super(`Permission denied for agent ${agentId}: tool '${tool}' - ${reason}`);
    this.name = 'PermissionDeniedError';
  }
}

export class ToolNotAllowedError extends Error {
  constructor(
    public readonly agentId: string,
    public readonly tool: string,
    public readonly allowedTools: string[]
  ) {
    super(`Tool '${tool}' not in allowed list for agent ${agentId}. Allowed: ${allowedTools.join(', ')}`);
    this.name = 'ToolNotAllowedError';
  }
}

export class ToolBlacklistedError extends Error {
  constructor(
    public readonly agentId: string,
    public readonly tool: string
  ) {
    super(`Tool '${tool}' is blacklisted for agent ${agentId}`);
    this.name = 'ToolBlacklistedError';
  }
}

export class SandboxRequiredError extends Error {
  constructor(
    public readonly agentId: string,
    public readonly tool: string,
    public readonly requiredMode: SandboxMode
  ) {
    super(`Tool '${tool}' requires sandbox mode '${requiredMode}' for agent ${agentId}`);
    this.name = 'SandboxRequiredError';
  }
}

export class ResourceLimitExceededError extends Error {
  constructor(
    public readonly agentId: string,
    public readonly limit: string,
    public readonly current: number,
    public readonly maximum: number
  ) {
    super(`Resource limit exceeded for agent ${agentId}: ${limit} (${current}/${maximum})`);
    this.name = 'ResourceLimitExceededError';
  }
}

// ============================================================================
// Permission Manager
// ============================================================================

export class PermissionManager extends EventEmitter {
  private agentPermissions: Map<string, AgentPermissions> = new Map();
  private permissionCache: Map<string, PermissionCache> = new Map();
  private auditLogs: Map<string, PermissionAuditLog> = new Map();
  private violationCounts: Map<string, number> = new Map();
  private parentChildMap: Map<string, string[]> = new Map(); // parentId -> childIds
  private childParentMap: Map<string, string> = new Map(); // childId -> parentId
  private config: PermissionManagerConfig;

  constructor(config: Partial<PermissionManagerConfig> = {}) {
    super();
    this.config = {
      strictMode: true,
      inheritanceOptions: DEFAULT_INHERITANCE_OPTIONS,
      auditRetentionHours: 24,
      autoTerminateOnViolation: false,
      violationThreshold: 3,
      ...config,
    };
  }

  // ============================================================================
  // Permission Registration
  // ============================================================================

  /**
   * Register permissions for an agent
   */
  registerAgent(
    agentId: string,
    permissions: Partial<AgentPermissions> = {},
    parentId?: string
  ): AgentPermissions {
    // Validate parent exists if specified
    if (parentId && !this.agentPermissions.has(parentId)) {
      throw new Error(`Parent agent ${parentId} not found`);
    }

    // Compute effective permissions
    let effectivePermissions: AgentPermissions;

    if (parentId) {
      // Inherit from parent
      const parentPermissions = this.agentPermissions.get(parentId)!;
      effectivePermissions = computeInheritedPermissions(
        parentPermissions,
        permissions,
        this.config.inheritanceOptions
      );

      // Track parent-child relationship
      if (!this.parentChildMap.has(parentId)) {
        this.parentChildMap.set(parentId, []);
      }
      this.parentChildMap.get(parentId)!.push(agentId);
      this.childParentMap.set(agentId, parentId);

      logger.info(
        `[PermissionManager] Agent ${agentId} registered with inherited permissions from ${parentId}`
      );
    } else {
      // Use defaults + overrides
      effectivePermissions = {
        ...DEFAULT_PERMISSIONS,
        ...permissions,
      };

      logger.info(`[PermissionManager] Agent ${agentId} registered with default permissions`);
    }

    // Validate permissions
    const errors = validatePermissions(effectivePermissions);
    if (errors.length > 0) {
      throw new Error(`Invalid permissions for agent ${agentId}: ${errors.join(', ')}`);
    }

    this.agentPermissions.set(agentId, effectivePermissions);
    this.initAuditLog(agentId);

    this.emit('agent.registered', {
      agentId,
      permissions: effectivePermissions,
      parentId,
    });

    return effectivePermissions;
  }

  /**
   * Register an agent with a predefined security profile
   */
  registerAgentWithProfile(
    agentId: string,
    profileName: string,
    overrides: Partial<AgentPermissions> = {},
    parentId?: string
  ): AgentPermissions {
    const profile = SECURITY_PROFILES[profileName];
    if (!profile) {
      throw new Error(`Security profile '${profileName}' not found`);
    }

    const permissions: Partial<AgentPermissions> = {
      ...profile.permissions,
      ...overrides,
    };

    return this.registerAgent(agentId, permissions, parentId);
  }

  /**
   * Unregister an agent and clean up
   */
  unregisterAgent(agentId: string): void {
    // Remove from parent-child mapping
    const parentId = this.childParentMap.get(agentId);
    if (parentId) {
      const siblings = this.parentChildMap.get(parentId) || [];
      this.parentChildMap.set(
        parentId,
        siblings.filter(id => id !== agentId)
      );
      this.childParentMap.delete(agentId);
    }

    // Remove children references
    const children = this.parentChildMap.get(agentId) || [];
    for (const childId of children) {
      this.childParentMap.delete(childId);
    }
    this.parentChildMap.delete(agentId);

    this.agentPermissions.delete(agentId);
    this.permissionCache.delete(agentId);
    this.auditLogs.delete(agentId);
    this.violationCounts.delete(agentId);

    logger.info(`[PermissionManager] Agent ${agentId} unregistered`);
    this.emit('agent.unregistered', { agentId });
  }

  /**
   * Update permissions for an existing agent
   */
  updatePermissions(
    agentId: string,
    updates: Partial<AgentPermissions>
  ): AgentPermissions {
    const current = this.agentPermissions.get(agentId);
    if (!current) {
      throw new Error(`Agent ${agentId} not found`);
    }

    const updated = { ...current, ...updates };
    const errors = validatePermissions(updated);
    if (errors.length > 0) {
      throw new Error(`Invalid permission update for agent ${agentId}: ${errors.join(', ')}`);
    }

    this.agentPermissions.set(agentId, updated);

    // Invalidate cache if exists
    this.permissionCache.delete(agentId);

    // Update children if inheritance is enabled
    this.propagatePermissionChanges(agentId, updated);

    logger.info(`[PermissionManager] Permissions updated for agent ${agentId}`);
    this.emit('permissions.updated', { agentId, permissions: updated });

    return updated;
  }

  /**
   * Revoke a specific permission from an agent
   */
  revokePermission(agentId: string, permission: keyof AgentPermissions): void {
    const current = this.agentPermissions.get(agentId);
    if (!current) {
      throw new Error(`Agent ${agentId} not found`);
    }

    // For array permissions, clear them
    // For other permissions, set to most restrictive value
    switch (permission) {
      case 'allowedTools':
        current.allowedTools = [];
        break;
      case 'deniedTools':
        current.deniedTools = [...ALL_TOOLS];
        break;
      case 'approvalChannels':
        current.approvalChannels = [];
        break;
      case 'sandboxMode':
        current.sandboxMode = 'docker';
        break;
      case 'maxDuration':
        current.maxDuration = 0;
        break;
      case 'maxTokens':
        current.maxTokens = 0;
        break;
      case 'maxCost':
        current.maxCost = 0;
        break;
      case 'maxConcurrentTools':
        current.maxConcurrentTools = 0;
        break;
      case 'requireApproval':
        current.requireApproval = true;
        break;
      case 'canSpawnAgents':
        current.canSpawnAgents = false;
        break;
    }

    this.agentPermissions.set(agentId, current);
    this.permissionCache.delete(agentId);

    logger.warn(`[PermissionManager] Permission ${permission} revoked for agent ${agentId}`);
    this.emit('permission.revoked', { agentId, permission });
  }

  // ============================================================================
  // Runtime Permission Checks
  // ============================================================================

  /**
   * Check if an agent is allowed to use a specific tool
   * Throws if permission denied (when strict mode is on)
   * Returns boolean otherwise
   */
  checkToolPermission(agentId: string, tool: string, strict = this.config.strictMode): boolean {
    const permissions = this.agentPermissions.get(agentId);
    if (!permissions) {
      const error = new Error(`Agent ${agentId} not registered`);
      if (strict) throw error;
      return false;
    }

    let allowed = true;
    let reason: string | undefined;

    // Check blacklist first (takes precedence)
    if (permissions.deniedTools.includes(tool) || permissions.deniedTools.includes('*')) {
      allowed = false;
      reason = 'Tool is blacklisted';
    }
    // Then check whitelist (unless wildcard is used)
    else if (!permissions.allowedTools.includes('*') && !permissions.allowedTools.includes(tool)) {
      allowed = false;
      reason = 'Tool not in allowed list';
    }

    // Log the check
    this.logPermissionCheck(agentId, tool, allowed, reason);

    if (!allowed && strict) {
      if (permissions.deniedTools.includes(tool)) {
        throw new ToolBlacklistedError(agentId, tool);
      } else {
        throw new ToolNotAllowedError(agentId, tool, permissions.allowedTools);
      }
    }

    return allowed;
  }

  /**
   * Validate multiple tools at once
   */
  checkToolsPermission(agentId: string, tools: string[]): Record<string, boolean> {
    const results: Record<string, boolean> = {};
    for (const tool of tools) {
      results[tool] = this.checkToolPermission(agentId, tool, false);
    }
    return results;
  }

  /**
   * Check if an agent can spawn other agents
   */
  checkCanSpawnAgents(agentId: string): boolean {
    const permissions = this.agentPermissions.get(agentId);
    if (!permissions) return false;
    return permissions.canSpawnAgents;
  }

  /**
   * Check if sandbox mode is required for a tool
   */
  checkSandboxRequired(agentId: string, tool: string): SandboxMode | null {
    const permissions = this.agentPermissions.get(agentId);
    if (!permissions) return null;

    // Dangerous tools always require sandbox
    if (DANGEROUS_TOOLS.includes(tool as any)) {
      return permissions.sandboxMode;
    }

    return null;
  }

  /**
   * Assert that sandbox mode is sufficient for tool execution
   */
  assertSandboxMode(
    agentId: string,
    tool: string,
    currentMode: SandboxMode
  ): void {
    const requiredMode = this.checkSandboxRequired(agentId, tool);
    if (!requiredMode) return;

    const modePriority: Record<SandboxMode, number> = {
      none: 0,
      'non-main': 1,
      docker: 2,
    };

    if (modePriority[currentMode] < modePriority[requiredMode]) {
      throw new SandboxRequiredError(agentId, tool, requiredMode);
    }
  }

  /**
   * Check resource limits
   */
  checkResourceLimits(
    agentId: string,
    metrics: {
      tokens?: number;
      cost?: number;
      duration?: number;
    }
  ): { allowed: boolean; violations: string[] } {
    const permissions = this.agentPermissions.get(agentId);
    if (!permissions) {
      return { allowed: false, violations: ['Agent not registered'] };
    }

    const violations: string[] = [];

    if (metrics.tokens !== undefined && metrics.tokens > permissions.maxTokens) {
      violations.push(`Token limit exceeded: ${metrics.tokens}/${permissions.maxTokens}`);
    }

    if (metrics.cost !== undefined && metrics.cost > permissions.maxCost) {
      violations.push(`Cost limit exceeded: $${metrics.cost.toFixed(2)}/$${permissions.maxCost.toFixed(2)}`);
    }

    if (metrics.duration !== undefined && metrics.duration > permissions.maxDuration) {
      violations.push(`Duration limit exceeded: ${metrics.duration}s/${permissions.maxDuration}s`);
    }

    return {
      allowed: violations.length === 0,
      violations,
    };
  }

  /**
   * Assert resource limits (throws if exceeded)
   */
  assertResourceLimits(
    agentId: string,
    metrics: {
      tokens?: number;
      cost?: number;
      duration?: number;
    }
  ): void {
    const result = this.checkResourceLimits(agentId, metrics);
    if (!result.allowed) {
      // Use the first violation as the error
      const violation = result.violations[0];
      if (violation.includes('Token')) {
        throw new ResourceLimitExceededError(agentId, 'tokens', metrics.tokens || 0, this.getPermissions(agentId)?.maxTokens || 0);
      } else if (violation.includes('Cost')) {
        throw new ResourceLimitExceededError(agentId, 'cost', metrics.cost || 0, this.getPermissions(agentId)?.maxCost || 0);
      } else {
        throw new ResourceLimitExceededError(agentId, 'duration', metrics.duration || 0, this.getPermissions(agentId)?.maxDuration || 0);
      }
    }
  }

  // ============================================================================
  // Permission Inheritance
  // ============================================================================

  /**
   * Get the parent agent ID for a child agent
   */
  getParentId(agentId: string): string | undefined {
    return this.childParentMap.get(agentId);
  }

  /**
   * Get all child agent IDs for a parent agent
   */
  getChildIds(parentId: string): string[] {
    return this.parentChildMap.get(parentId) || [];
  }

  /**
   * Get the full ancestry chain for an agent
   */
  getAncestry(agentId: string): string[] {
    const ancestry: string[] = [];
    let currentId = agentId;

    while (this.childParentMap.has(currentId)) {
      const parentId = this.childParentMap.get(currentId)!;
      ancestry.push(parentId);
      currentId = parentId;
    }

    return ancestry;
  }

  /**
   * Get permission depth (how many levels from root)
   */
  getPermissionDepth(agentId: string): number {
    return this.getAncestry(agentId).length;
  }

  /**
   * Propagate permission changes to children
   */
  private propagatePermissionChanges(parentId: string, parentPermissions: AgentPermissions): void {
    const children = this.parentChildMap.get(parentId) || [];

    for (const childId of children) {
      const childPermissions = this.agentPermissions.get(childId);
      if (!childPermissions) continue;

      // Re-compute inherited permissions
      const updated = computeInheritedPermissions(
        parentPermissions,
        childPermissions,
        this.config.inheritanceOptions
      );

      this.agentPermissions.set(childId, updated);
      this.emit('permissions.inherited', {
        agentId: childId,
        parentId,
        permissions: updated,
      });

      // Recursively update grandchildren
      this.propagatePermissionChanges(childId, updated);
    }
  }

  // ============================================================================
  // Violation Handling
  // ============================================================================

  /**
   * Record a permission violation
   */
  recordViolation(violation: Omit<PermissionViolation, 'timestamp'>): void {
    const fullViolation: PermissionViolation = {
      ...violation,
      timestamp: new Date(),
    };

    // Update violation count
    const currentCount = this.violationCounts.get(violation.agentId) || 0;
    this.violationCounts.set(violation.agentId, currentCount + 1);

    // Log to audit
    const auditLog = this.auditLogs.get(violation.agentId);
    if (auditLog) {
      auditLog.violations.push(fullViolation);
      auditLog.lastUpdated = new Date();
    }

    logger.warn(
      `[PermissionManager] Violation by ${violation.agentId}: ${violation.action} - ${violation.severity}`
    );

    this.emit('violation.detected', fullViolation);

    // Check auto-termination threshold
    if (this.config.autoTerminateOnViolation) {
      const count = this.violationCounts.get(violation.agentId) || 0;
      if (count >= this.config.violationThreshold) {
        this.emit('violation.threshold', {
          agentId: violation.agentId,
          count,
          threshold: this.config.violationThreshold,
        });
      }
    }

    // Call custom handler
    if (this.config.onViolation) {
      this.config.onViolation(fullViolation);
    }
  }

  /**
   * Get violation count for an agent
   */
  getViolationCount(agentId: string): number {
    return this.violationCounts.get(agentId) || 0;
  }

  /**
   * Reset violation count for an agent
   */
  resetViolationCount(agentId: string): void {
    this.violationCounts.delete(agentId);
  }

  /**
   * Get all violations for an agent
   */
  getViolations(agentId: string): PermissionViolation[] {
    const auditLog = this.auditLogs.get(agentId);
    return auditLog?.violations || [];
  }

  // ============================================================================
  // Audit Logging
  // ============================================================================

  /**
   * Initialize audit log for an agent
   */
  private initAuditLog(agentId: string): void {
    this.auditLogs.set(agentId, {
      agentId,
      checks: [],
      violations: [],
      lastUpdated: new Date(),
    });
  }

  /**
   * Log a permission check
   */
  private logPermissionCheck(
    agentId: string,
    tool: string,
    allowed: boolean,
    reason?: string
  ): void {
    const auditLog = this.auditLogs.get(agentId);
    if (!auditLog) return;

    const check: PermissionCheck = {
      agentId,
      tool,
      allowed,
      reason,
      timestamp: new Date(),
    };

    auditLog.checks.push(check);
    auditLog.lastUpdated = new Date();

    // Trim old checks (keep last 1000)
    if (auditLog.checks.length > 1000) {
      auditLog.checks = auditLog.checks.slice(-1000);
    }
  }

  /**
   * Get audit log for an agent
   */
  getAuditLog(agentId: string): PermissionAuditLog | undefined {
    return this.auditLogs.get(agentId);
  }

  /**
   * Get recent checks for an agent
   */
  getRecentChecks(agentId: string, limit = 100): PermissionCheck[] {
    const auditLog = this.auditLogs.get(agentId);
    if (!auditLog) return [];
    return auditLog.checks.slice(-limit);
  }

  /**
   * Clear audit logs older than retention period
   */
  clearOldAuditLogs(): void {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - this.config.auditRetentionHours);

    for (const [agentId, auditLog] of this.auditLogs.entries()) {
      auditLog.checks = auditLog.checks.filter(c => c.timestamp > cutoff);
      auditLog.violations = auditLog.violations.filter(v => v.timestamp > cutoff);
      auditLog.lastUpdated = new Date();
    }
  }

  // ============================================================================
  // Queries
  // ============================================================================

  /**
   * Get permissions for an agent
   */
  getPermissions(agentId: string): AgentPermissions | undefined {
    return this.agentPermissions.get(agentId);
  }

  /**
   * Check if an agent is registered
   */
  isRegistered(agentId: string): boolean {
    return this.agentPermissions.has(agentId);
  }

  /**
   * Get all registered agent IDs
   */
  getAllAgentIds(): string[] {
    return Array.from(this.agentPermissions.keys());
  }

  /**
   * Get all permissions
   */
  getAllPermissions(): Map<string, AgentPermissions> {
    return new Map(this.agentPermissions);
  }

  /**
   * Filter agents by permission criteria
   */
  filterAgents(criteria: {
    canSpawnAgents?: boolean;
    sandboxMode?: SandboxMode;
    hasTool?: string;
  }): string[] {
    const results: string[] = [];

    for (const [agentId, permissions] of this.agentPermissions.entries()) {
      let matches = true;

      if (criteria.canSpawnAgents !== undefined) {
        matches = matches && permissions.canSpawnAgents === criteria.canSpawnAgents;
      }

      if (criteria.sandboxMode !== undefined) {
        matches = matches && permissions.sandboxMode === criteria.sandboxMode;
      }

      if (criteria.hasTool !== undefined) {
        const hasTool =
          permissions.allowedTools.includes('*') ||
          permissions.allowedTools.includes(criteria.hasTool);
        matches = matches && hasTool;
      }

      if (matches) {
        results.push(agentId);
      }
    }

    return results;
  }

  // ============================================================================
  // Utilities
  // ============================================================================

  /**
   * Get a summary of permissions for all agents
   */
  getSummary(): {
    totalAgents: number;
    bySandboxMode: Record<SandboxMode, number>;
    bySpawnPermission: { canSpawn: number; cannotSpawn: number };
    totalViolations: number;
  } {
    const bySandboxMode: Record<SandboxMode, number> = { none: 0, 'non-main': 0, docker: 0 };
    let canSpawn = 0;
    let cannotSpawn = 0;
    let totalViolations = 0;

    for (const permissions of this.agentPermissions.values()) {
      bySandboxMode[permissions.sandboxMode]++;
      if (permissions.canSpawnAgents) {
        canSpawn++;
      } else {
        cannotSpawn++;
      }
    }

    for (const count of this.violationCounts.values()) {
      totalViolations += count;
    }

    return {
      totalAgents: this.agentPermissions.size,
      bySandboxMode,
      bySpawnPermission: { canSpawn, cannotSpawn },
      totalViolations,
    };
  }

  /**
   * Dispose of the permission manager
   */
  dispose(): void {
    this.agentPermissions.clear();
    this.permissionCache.clear();
    this.auditLogs.clear();
    this.violationCounts.clear();
    this.parentChildMap.clear();
    this.childParentMap.clear();
    this.removeAllListeners();
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalPermissionManager: PermissionManager | null = null;

export function getGlobalPermissionManager(
  config?: Partial<PermissionManagerConfig>
): PermissionManager {
  if (!globalPermissionManager) {
    globalPermissionManager = new PermissionManager(config);
  }
  return globalPermissionManager;
}

export function resetGlobalPermissionManager(): void {
  globalPermissionManager?.dispose();
  globalPermissionManager = null;
}

export default PermissionManager;
