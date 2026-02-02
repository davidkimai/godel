"use strict";
/**
 * OpenClaw Permission Manager
 *
 * Manages tool whitelist/blacklist, sandbox configuration, permission inheritance,
 * and runtime permission checks for Dash agents using OpenClaw.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PermissionManager = exports.ResourceLimitExceededError = exports.SandboxRequiredError = exports.ToolBlacklistedError = exports.ToolNotAllowedError = exports.PermissionDeniedError = void 0;
exports.getGlobalPermissionManager = getGlobalPermissionManager;
exports.resetGlobalPermissionManager = resetGlobalPermissionManager;
const events_1 = require("events");
const logger_1 = require("../../utils/logger");
const defaults_1 = require("./defaults");
// ============================================================================
// Errors
// ============================================================================
class PermissionDeniedError extends Error {
    constructor(agentId, tool, reason) {
        super(`Permission denied for agent ${agentId}: tool '${tool}' - ${reason}`);
        this.agentId = agentId;
        this.tool = tool;
        this.reason = reason;
        this.name = 'PermissionDeniedError';
    }
}
exports.PermissionDeniedError = PermissionDeniedError;
class ToolNotAllowedError extends Error {
    constructor(agentId, tool, allowedTools) {
        super(`Tool '${tool}' not in allowed list for agent ${agentId}. Allowed: ${allowedTools.join(', ')}`);
        this.agentId = agentId;
        this.tool = tool;
        this.allowedTools = allowedTools;
        this.name = 'ToolNotAllowedError';
    }
}
exports.ToolNotAllowedError = ToolNotAllowedError;
class ToolBlacklistedError extends Error {
    constructor(agentId, tool) {
        super(`Tool '${tool}' is blacklisted for agent ${agentId}`);
        this.agentId = agentId;
        this.tool = tool;
        this.name = 'ToolBlacklistedError';
    }
}
exports.ToolBlacklistedError = ToolBlacklistedError;
class SandboxRequiredError extends Error {
    constructor(agentId, tool, requiredMode) {
        super(`Tool '${tool}' requires sandbox mode '${requiredMode}' for agent ${agentId}`);
        this.agentId = agentId;
        this.tool = tool;
        this.requiredMode = requiredMode;
        this.name = 'SandboxRequiredError';
    }
}
exports.SandboxRequiredError = SandboxRequiredError;
class ResourceLimitExceededError extends Error {
    constructor(agentId, limit, current, maximum) {
        super(`Resource limit exceeded for agent ${agentId}: ${limit} (${current}/${maximum})`);
        this.agentId = agentId;
        this.limit = limit;
        this.current = current;
        this.maximum = maximum;
        this.name = 'ResourceLimitExceededError';
    }
}
exports.ResourceLimitExceededError = ResourceLimitExceededError;
// ============================================================================
// Permission Manager
// ============================================================================
class PermissionManager extends events_1.EventEmitter {
    constructor(config = {}) {
        super();
        this.agentPermissions = new Map();
        this.permissionCache = new Map();
        this.auditLogs = new Map();
        this.violationCounts = new Map();
        this.parentChildMap = new Map(); // parentId -> childIds
        this.childParentMap = new Map(); // childId -> parentId
        this.config = {
            strictMode: true,
            inheritanceOptions: defaults_1.DEFAULT_INHERITANCE_OPTIONS,
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
    registerAgent(agentId, permissions = {}, parentId) {
        // Validate parent exists if specified
        if (parentId && !this.agentPermissions.has(parentId)) {
            throw new Error(`Parent agent ${parentId} not found`);
        }
        // Compute effective permissions
        let effectivePermissions;
        if (parentId) {
            // Inherit from parent
            const parentPermissions = this.agentPermissions.get(parentId);
            effectivePermissions = (0, defaults_1.computeInheritedPermissions)(parentPermissions, permissions, this.config.inheritanceOptions);
            // Track parent-child relationship
            if (!this.parentChildMap.has(parentId)) {
                this.parentChildMap.set(parentId, []);
            }
            this.parentChildMap.get(parentId).push(agentId);
            this.childParentMap.set(agentId, parentId);
            logger_1.logger.info(`[PermissionManager] Agent ${agentId} registered with inherited permissions from ${parentId}`);
        }
        else {
            // Use defaults + overrides
            effectivePermissions = {
                ...defaults_1.DEFAULT_PERMISSIONS,
                ...permissions,
            };
            logger_1.logger.info(`[PermissionManager] Agent ${agentId} registered with default permissions`);
        }
        // Validate permissions
        const errors = (0, defaults_1.validatePermissions)(effectivePermissions);
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
    registerAgentWithProfile(agentId, profileName, overrides = {}, parentId) {
        const profile = defaults_1.SECURITY_PROFILES[profileName];
        if (!profile) {
            throw new Error(`Security profile '${profileName}' not found`);
        }
        const permissions = {
            ...profile.permissions,
            ...overrides,
        };
        return this.registerAgent(agentId, permissions, parentId);
    }
    /**
     * Unregister an agent and clean up
     */
    unregisterAgent(agentId) {
        // Remove from parent-child mapping
        const parentId = this.childParentMap.get(agentId);
        if (parentId) {
            const siblings = this.parentChildMap.get(parentId) || [];
            this.parentChildMap.set(parentId, siblings.filter(id => id !== agentId));
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
        logger_1.logger.info(`[PermissionManager] Agent ${agentId} unregistered`);
        this.emit('agent.unregistered', { agentId });
    }
    /**
     * Update permissions for an existing agent
     */
    updatePermissions(agentId, updates) {
        const current = this.agentPermissions.get(agentId);
        if (!current) {
            throw new Error(`Agent ${agentId} not found`);
        }
        const updated = { ...current, ...updates };
        const errors = (0, defaults_1.validatePermissions)(updated);
        if (errors.length > 0) {
            throw new Error(`Invalid permission update for agent ${agentId}: ${errors.join(', ')}`);
        }
        this.agentPermissions.set(agentId, updated);
        // Invalidate cache if exists
        this.permissionCache.delete(agentId);
        // Update children if inheritance is enabled
        this.propagatePermissionChanges(agentId, updated);
        logger_1.logger.info(`[PermissionManager] Permissions updated for agent ${agentId}`);
        this.emit('permissions.updated', { agentId, permissions: updated });
        return updated;
    }
    /**
     * Revoke a specific permission from an agent
     */
    revokePermission(agentId, permission) {
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
                current.deniedTools = [...defaults_1.ALL_TOOLS];
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
        logger_1.logger.warn(`[PermissionManager] Permission ${permission} revoked for agent ${agentId}`);
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
    checkToolPermission(agentId, tool, strict = this.config.strictMode) {
        const permissions = this.agentPermissions.get(agentId);
        if (!permissions) {
            const error = new Error(`Agent ${agentId} not registered`);
            if (strict)
                throw error;
            return false;
        }
        let allowed = true;
        let reason;
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
            }
            else {
                throw new ToolNotAllowedError(agentId, tool, permissions.allowedTools);
            }
        }
        return allowed;
    }
    /**
     * Validate multiple tools at once
     */
    checkToolsPermission(agentId, tools) {
        const results = {};
        for (const tool of tools) {
            results[tool] = this.checkToolPermission(agentId, tool, false);
        }
        return results;
    }
    /**
     * Check if an agent can spawn other agents
     */
    checkCanSpawnAgents(agentId) {
        const permissions = this.agentPermissions.get(agentId);
        if (!permissions)
            return false;
        return permissions.canSpawnAgents;
    }
    /**
     * Check if sandbox mode is required for a tool
     */
    checkSandboxRequired(agentId, tool) {
        const permissions = this.agentPermissions.get(agentId);
        if (!permissions)
            return null;
        // Dangerous tools always require sandbox
        if (defaults_1.DANGEROUS_TOOLS.includes(tool)) {
            return permissions.sandboxMode;
        }
        return null;
    }
    /**
     * Assert that sandbox mode is sufficient for tool execution
     */
    assertSandboxMode(agentId, tool, currentMode) {
        const requiredMode = this.checkSandboxRequired(agentId, tool);
        if (!requiredMode)
            return;
        const modePriority = {
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
    checkResourceLimits(agentId, metrics) {
        const permissions = this.agentPermissions.get(agentId);
        if (!permissions) {
            return { allowed: false, violations: ['Agent not registered'] };
        }
        const violations = [];
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
    assertResourceLimits(agentId, metrics) {
        const result = this.checkResourceLimits(agentId, metrics);
        if (!result.allowed) {
            // Use the first violation as the error
            const violation = result.violations[0];
            if (violation.includes('Token')) {
                throw new ResourceLimitExceededError(agentId, 'tokens', metrics.tokens || 0, this.getPermissions(agentId)?.maxTokens || 0);
            }
            else if (violation.includes('Cost')) {
                throw new ResourceLimitExceededError(agentId, 'cost', metrics.cost || 0, this.getPermissions(agentId)?.maxCost || 0);
            }
            else {
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
    getParentId(agentId) {
        return this.childParentMap.get(agentId);
    }
    /**
     * Get all child agent IDs for a parent agent
     */
    getChildIds(parentId) {
        return this.parentChildMap.get(parentId) || [];
    }
    /**
     * Get the full ancestry chain for an agent
     */
    getAncestry(agentId) {
        const ancestry = [];
        let currentId = agentId;
        while (this.childParentMap.has(currentId)) {
            const parentId = this.childParentMap.get(currentId);
            ancestry.push(parentId);
            currentId = parentId;
        }
        return ancestry;
    }
    /**
     * Get permission depth (how many levels from root)
     */
    getPermissionDepth(agentId) {
        return this.getAncestry(agentId).length;
    }
    /**
     * Propagate permission changes to children
     */
    propagatePermissionChanges(parentId, parentPermissions) {
        const children = this.parentChildMap.get(parentId) || [];
        for (const childId of children) {
            const childPermissions = this.agentPermissions.get(childId);
            if (!childPermissions)
                continue;
            // Re-compute inherited permissions
            const updated = (0, defaults_1.computeInheritedPermissions)(parentPermissions, childPermissions, this.config.inheritanceOptions);
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
    recordViolation(violation) {
        const fullViolation = {
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
        logger_1.logger.warn(`[PermissionManager] Violation by ${violation.agentId}: ${violation.action} - ${violation.severity}`);
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
    getViolationCount(agentId) {
        return this.violationCounts.get(agentId) || 0;
    }
    /**
     * Reset violation count for an agent
     */
    resetViolationCount(agentId) {
        this.violationCounts.delete(agentId);
    }
    /**
     * Get all violations for an agent
     */
    getViolations(agentId) {
        const auditLog = this.auditLogs.get(agentId);
        return auditLog?.violations || [];
    }
    // ============================================================================
    // Audit Logging
    // ============================================================================
    /**
     * Initialize audit log for an agent
     */
    initAuditLog(agentId) {
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
    logPermissionCheck(agentId, tool, allowed, reason) {
        const auditLog = this.auditLogs.get(agentId);
        if (!auditLog)
            return;
        const check = {
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
    getAuditLog(agentId) {
        return this.auditLogs.get(agentId);
    }
    /**
     * Get recent checks for an agent
     */
    getRecentChecks(agentId, limit = 100) {
        const auditLog = this.auditLogs.get(agentId);
        if (!auditLog)
            return [];
        return auditLog.checks.slice(-limit);
    }
    /**
     * Clear audit logs older than retention period
     */
    clearOldAuditLogs() {
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
    getPermissions(agentId) {
        return this.agentPermissions.get(agentId);
    }
    /**
     * Check if an agent is registered
     */
    isRegistered(agentId) {
        return this.agentPermissions.has(agentId);
    }
    /**
     * Get all registered agent IDs
     */
    getAllAgentIds() {
        return Array.from(this.agentPermissions.keys());
    }
    /**
     * Get all permissions
     */
    getAllPermissions() {
        return new Map(this.agentPermissions);
    }
    /**
     * Filter agents by permission criteria
     */
    filterAgents(criteria) {
        const results = [];
        for (const [agentId, permissions] of this.agentPermissions.entries()) {
            let matches = true;
            if (criteria.canSpawnAgents !== undefined) {
                matches = matches && permissions.canSpawnAgents === criteria.canSpawnAgents;
            }
            if (criteria.sandboxMode !== undefined) {
                matches = matches && permissions.sandboxMode === criteria.sandboxMode;
            }
            if (criteria.hasTool !== undefined) {
                const hasTool = permissions.allowedTools.includes('*') ||
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
    getSummary() {
        const bySandboxMode = { none: 0, 'non-main': 0, docker: 0 };
        let canSpawn = 0;
        let cannotSpawn = 0;
        let totalViolations = 0;
        for (const permissions of this.agentPermissions.values()) {
            bySandboxMode[permissions.sandboxMode]++;
            if (permissions.canSpawnAgents) {
                canSpawn++;
            }
            else {
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
    dispose() {
        this.agentPermissions.clear();
        this.permissionCache.clear();
        this.auditLogs.clear();
        this.violationCounts.clear();
        this.parentChildMap.clear();
        this.childParentMap.clear();
        this.removeAllListeners();
    }
}
exports.PermissionManager = PermissionManager;
// ============================================================================
// Singleton Instance
// ============================================================================
let globalPermissionManager = null;
function getGlobalPermissionManager(config) {
    if (!globalPermissionManager) {
        globalPermissionManager = new PermissionManager(config);
    }
    return globalPermissionManager;
}
function resetGlobalPermissionManager() {
    globalPermissionManager?.dispose();
    globalPermissionManager = null;
}
exports.default = PermissionManager;
//# sourceMappingURL=PermissionManager.js.map