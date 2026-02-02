/**
 * OpenClaw Permission Manager
 *
 * Manages tool whitelist/blacklist, sandbox configuration, permission inheritance,
 * and runtime permission checks for Dash agents using OpenClaw.
 */
import { EventEmitter } from 'events';
import { AgentPermissions, SandboxMode, PermissionInheritanceOptions } from './defaults';
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
export declare class PermissionDeniedError extends Error {
    readonly agentId: string;
    readonly tool: string;
    readonly reason: string;
    constructor(agentId: string, tool: string, reason: string);
}
export declare class ToolNotAllowedError extends Error {
    readonly agentId: string;
    readonly tool: string;
    readonly allowedTools: string[];
    constructor(agentId: string, tool: string, allowedTools: string[]);
}
export declare class ToolBlacklistedError extends Error {
    readonly agentId: string;
    readonly tool: string;
    constructor(agentId: string, tool: string);
}
export declare class SandboxRequiredError extends Error {
    readonly agentId: string;
    readonly tool: string;
    readonly requiredMode: SandboxMode;
    constructor(agentId: string, tool: string, requiredMode: SandboxMode);
}
export declare class ResourceLimitExceededError extends Error {
    readonly agentId: string;
    readonly limit: string;
    readonly current: number;
    readonly maximum: number;
    constructor(agentId: string, limit: string, current: number, maximum: number);
}
export declare class PermissionManager extends EventEmitter {
    private agentPermissions;
    private permissionCache;
    private auditLogs;
    private violationCounts;
    private parentChildMap;
    private childParentMap;
    private config;
    constructor(config?: Partial<PermissionManagerConfig>);
    /**
     * Register permissions for an agent
     */
    registerAgent(agentId: string, permissions?: Partial<AgentPermissions>, parentId?: string): AgentPermissions;
    /**
     * Register an agent with a predefined security profile
     */
    registerAgentWithProfile(agentId: string, profileName: string, overrides?: Partial<AgentPermissions>, parentId?: string): AgentPermissions;
    /**
     * Unregister an agent and clean up
     */
    unregisterAgent(agentId: string): void;
    /**
     * Update permissions for an existing agent
     */
    updatePermissions(agentId: string, updates: Partial<AgentPermissions>): AgentPermissions;
    /**
     * Revoke a specific permission from an agent
     */
    revokePermission(agentId: string, permission: keyof AgentPermissions): void;
    /**
     * Check if an agent is allowed to use a specific tool
     * Throws if permission denied (when strict mode is on)
     * Returns boolean otherwise
     */
    checkToolPermission(agentId: string, tool: string, strict?: boolean): boolean;
    /**
     * Validate multiple tools at once
     */
    checkToolsPermission(agentId: string, tools: string[]): Record<string, boolean>;
    /**
     * Check if an agent can spawn other agents
     */
    checkCanSpawnAgents(agentId: string): boolean;
    /**
     * Check if sandbox mode is required for a tool
     */
    checkSandboxRequired(agentId: string, tool: string): SandboxMode | null;
    /**
     * Assert that sandbox mode is sufficient for tool execution
     */
    assertSandboxMode(agentId: string, tool: string, currentMode: SandboxMode): void;
    /**
     * Check resource limits
     */
    checkResourceLimits(agentId: string, metrics: {
        tokens?: number;
        cost?: number;
        duration?: number;
    }): {
        allowed: boolean;
        violations: string[];
    };
    /**
     * Assert resource limits (throws if exceeded)
     */
    assertResourceLimits(agentId: string, metrics: {
        tokens?: number;
        cost?: number;
        duration?: number;
    }): void;
    /**
     * Get the parent agent ID for a child agent
     */
    getParentId(agentId: string): string | undefined;
    /**
     * Get all child agent IDs for a parent agent
     */
    getChildIds(parentId: string): string[];
    /**
     * Get the full ancestry chain for an agent
     */
    getAncestry(agentId: string): string[];
    /**
     * Get permission depth (how many levels from root)
     */
    getPermissionDepth(agentId: string): number;
    /**
     * Propagate permission changes to children
     */
    private propagatePermissionChanges;
    /**
     * Record a permission violation
     */
    recordViolation(violation: Omit<PermissionViolation, 'timestamp'>): void;
    /**
     * Get violation count for an agent
     */
    getViolationCount(agentId: string): number;
    /**
     * Reset violation count for an agent
     */
    resetViolationCount(agentId: string): void;
    /**
     * Get all violations for an agent
     */
    getViolations(agentId: string): PermissionViolation[];
    /**
     * Initialize audit log for an agent
     */
    private initAuditLog;
    /**
     * Log a permission check
     */
    private logPermissionCheck;
    /**
     * Get audit log for an agent
     */
    getAuditLog(agentId: string): PermissionAuditLog | undefined;
    /**
     * Get recent checks for an agent
     */
    getRecentChecks(agentId: string, limit?: number): PermissionCheck[];
    /**
     * Clear audit logs older than retention period
     */
    clearOldAuditLogs(): void;
    /**
     * Get permissions for an agent
     */
    getPermissions(agentId: string): AgentPermissions | undefined;
    /**
     * Check if an agent is registered
     */
    isRegistered(agentId: string): boolean;
    /**
     * Get all registered agent IDs
     */
    getAllAgentIds(): string[];
    /**
     * Get all permissions
     */
    getAllPermissions(): Map<string, AgentPermissions>;
    /**
     * Filter agents by permission criteria
     */
    filterAgents(criteria: {
        canSpawnAgents?: boolean;
        sandboxMode?: SandboxMode;
        hasTool?: string;
    }): string[];
    /**
     * Get a summary of permissions for all agents
     */
    getSummary(): {
        totalAgents: number;
        bySandboxMode: Record<SandboxMode, number>;
        bySpawnPermission: {
            canSpawn: number;
            cannotSpawn: number;
        };
        totalViolations: number;
    };
    /**
     * Dispose of the permission manager
     */
    dispose(): void;
}
export declare function getGlobalPermissionManager(config?: Partial<PermissionManagerConfig>): PermissionManager;
export declare function resetGlobalPermissionManager(): void;
export default PermissionManager;
//# sourceMappingURL=PermissionManager.d.ts.map