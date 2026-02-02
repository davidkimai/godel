/**
 * OpenClaw Permission Manager - Default Configurations
 *
 * Defines default permission sets, sandbox configurations, and security profiles
 * for Dash agent execution via OpenClaw.
 */
export type SandboxMode = 'none' | 'non-main' | 'docker';
export interface AgentPermissions {
    /** Whitelist of allowed tools (supports '*' wildcard for all) */
    allowedTools: string[];
    /** Blacklist of denied tools (takes precedence over allowed) */
    deniedTools: string[];
    /** Sandbox execution mode for tool isolation */
    sandboxMode: SandboxMode;
    /** Maximum execution duration in seconds */
    maxDuration: number;
    /** Maximum token usage */
    maxTokens: number;
    /** Maximum cost in USD */
    maxCost: number;
    /** Whether agent actions require approval */
    requireApproval: boolean;
    /** Channels for approval requests */
    approvalChannels: string[];
    /** Whether the agent can spawn other agents */
    canSpawnAgents: boolean;
    /** Maximum number of concurrent tools */
    maxConcurrentTools: number;
}
export interface SandboxConfig {
    /** Docker image to use for sandbox execution */
    image: string;
    /** CPU limit (percentage or cores, e.g., "1.5" for 1.5 cores) */
    cpuLimit: string;
    /** Memory limit (e.g., "512m", "2g") */
    memoryLimit: string;
    /** Network mode: 'none', 'bridge', 'host' */
    networkMode: 'none' | 'bridge' | 'host';
    /** Volume mounts (host:container) */
    volumeMounts: Record<string, string>;
    /** Environment variables */
    envVars: Record<string, string>;
    /** Working directory inside container */
    workingDir: string;
    /** Whether to auto-remove container on exit */
    autoRemove: boolean;
    /** Read-only root filesystem */
    readOnlyRootFs: boolean;
    /** Disable privilege escalation */
    noNewPrivileges: boolean;
    /** Capabilities to drop */
    capDrop: string[];
    /** Security options (seccomp, apparmor) */
    securityOpts: string[];
}
export interface SecurityProfile {
    /** Profile name */
    name: string;
    /** Description */
    description: string;
    /** Base permissions */
    permissions: AgentPermissions;
    /** Sandbox configuration (if mode is 'docker') */
    sandboxConfig?: SandboxConfig;
    /** Allowed file paths/globs */
    allowedPaths: string[];
    /** Denied file paths/globs */
    deniedPaths: string[];
    /** Allowed network hosts (empty = all allowed) */
    allowedHosts: string[];
    /** Allowed command patterns (for exec tool) */
    allowedCommands: string[];
    /** Denied command patterns (for exec tool) */
    deniedCommands: string[];
}
export interface ResourceLimits {
    /** CPU limit in millicores (1000 = 1 core) */
    cpuMillicores: number;
    /** Memory limit in MB */
    memoryMB: number;
    /** Disk space limit in MB */
    diskMB: number;
    /** Maximum number of processes */
    maxProcesses: number;
    /** Maximum number of open files */
    maxOpenFiles: number;
    /** Network bandwidth limit in Mbps (0 = unlimited) */
    networkMbps: number;
    /** Maximum token usage per request */
    tokensPerRequest: number;
    /** Maximum token usage per session */
    tokensPerSession: number;
}
/** All available OpenClaw tools */
export declare const ALL_TOOLS: readonly ["read", "write", "edit", "exec", "browser", "canvas", "nodes", "cron", "webhook", "message", "discord", "slack", "telegram", "gateway", "sessions_list", "sessions_history", "sessions_send", "sessions_spawn", "image", "tts", "web_search", "web_fetch", "process"];
export type ToolName = (typeof ALL_TOOLS)[number];
/** Tools that can execute arbitrary code or system commands */
export declare const DANGEROUS_TOOLS: ToolName[];
/** Tools that can modify the filesystem */
export declare const FILE_TOOLS: ToolName[];
/** Tools that can access external networks */
export declare const NETWORK_TOOLS: ToolName[];
/** Tools that can spawn or manage other sessions */
export declare const SESSION_TOOLS: ToolName[];
/** Tools safe for untrusted agents */
export declare const SAFE_TOOLS: ToolName[];
/**
 * Default permissions for agents
 * Based on OPENCLAW_INTEGRATION_SPEC.md section 4.6
 */
export declare const DEFAULT_PERMISSIONS: AgentPermissions;
/**
 * Restricted permissions for untrusted agents
 * Limited to safe operations only
 */
export declare const RESTRICTED_PERMISSIONS: AgentPermissions;
/**
 * Full permissions for trusted/main agents
 */
export declare const FULL_PERMISSIONS: AgentPermissions;
/**
 * Read-only permissions for analysis agents
 */
export declare const READONLY_PERMISSIONS: AgentPermissions;
/**
 * Default Docker sandbox configuration
 * Secure defaults for containerized execution
 */
export declare const DEFAULT_DOCKER_CONFIG: SandboxConfig;
/**
 * Restricted Docker sandbox configuration
 * Maximum security for untrusted agents
 */
export declare const RESTRICTED_DOCKER_CONFIG: SandboxConfig;
/**
 * Permissive Docker sandbox configuration
 * For trusted agents needing more flexibility
 */
export declare const PERMISSIVE_DOCKER_CONFIG: SandboxConfig;
/**
 * Default resource limits for sandboxed agents
 */
export declare const DEFAULT_RESOURCE_LIMITS: ResourceLimits;
/**
 * Restricted resource limits for untrusted agents
 */
export declare const RESTRICTED_RESOURCE_LIMITS: ResourceLimits;
/**
 * Generous resource limits for trusted agents
 */
export declare const GENEROUS_RESOURCE_LIMITS: ResourceLimits;
/**
 * Predefined security profiles for different agent types
 */
export declare const SECURITY_PROFILES: Record<string, SecurityProfile>;
/**
 * Options for permission inheritance in swarms
 */
export interface PermissionInheritanceOptions {
    /** Whether child agents inherit parent permissions */
    inheritPermissions: boolean;
    /** Whether to apply more restrictive bounds */
    restrictChildPermissions: boolean;
    /** Multiplier for resource limits (0.5 = children get 50% of parent limits) */
    resourceMultiplier: number;
    /** Tools to always deny children regardless of parent permissions */
    alwaysDenyChildren: string[];
    /** Tools to always allow children regardless of parent restrictions */
    alwaysAllowChildren: string[];
    /** Maximum depth of permission inheritance */
    maxInheritanceDepth: number;
}
/**
 * Default permission inheritance settings for swarms
 */
export declare const DEFAULT_INHERITANCE_OPTIONS: PermissionInheritanceOptions;
/**
 * Strict permission inheritance (max security)
 */
export declare const STRICT_INHERITANCE_OPTIONS: PermissionInheritanceOptions;
/**
 * Permissive permission inheritance (max flexibility)
 */
export declare const PERMISSIVE_INHERITANCE_OPTIONS: PermissionInheritanceOptions;
/**
 * Validate that a permission configuration is valid
 */
export declare function validatePermissions(permissions: AgentPermissions): string[];
/**
 * Check if a sandbox mode is valid
 */
export declare function isValidSandboxMode(mode: string): mode is SandboxMode;
/**
 * Get effective permissions after applying inheritance
 */
export declare function computeInheritedPermissions(parentPermissions: AgentPermissions, childPermissions?: Partial<AgentPermissions>, options?: PermissionInheritanceOptions): AgentPermissions;
//# sourceMappingURL=defaults.d.ts.map