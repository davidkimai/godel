/**
 * OpenClaw Permission Manager - Default Configurations
 * 
 * Defines default permission sets, sandbox configurations, and security profiles
 * for Dash agent execution via OpenClaw.
 */

// ============================================================================
// Types
// ============================================================================

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

// ============================================================================
// Tool Categories
// ============================================================================

/** All available OpenClaw tools */
export const ALL_TOOLS = [
  // File operations
  'read',
  'write',
  'edit',
  // Execution
  'exec',
  // Web & UI
  'browser',
  'canvas',
  // External systems
  'nodes',
  'cron',
  'webhook',
  // Messaging
  'message',
  'discord',
  'slack',
  'telegram',
  // Gateway management
  'gateway',
  'sessions_list',
  'sessions_history',
  'sessions_send',
  'sessions_spawn',
  // Utilities
  'image',
  'tts',
  'web_search',
  'web_fetch',
  'process',
] as const;

export type ToolName = (typeof ALL_TOOLS)[number];

/** Tools that can execute arbitrary code or system commands */
export const DANGEROUS_TOOLS: ToolName[] = [
  'exec',
  'browser',
  'nodes',
  'gateway',
  'sessions_spawn',
];

/** Tools that can modify the filesystem */
export const FILE_TOOLS: ToolName[] = [
  'read',
  'write',
  'edit',
];

/** Tools that can access external networks */
export const NETWORK_TOOLS: ToolName[] = [
  'browser',
  'web_search',
  'web_fetch',
  'webhook',
  'nodes',
  'discord',
  'slack',
  'telegram',
  'message',
];

/** Tools that can spawn or manage other sessions */
export const SESSION_TOOLS: ToolName[] = [
  'sessions_list',
  'sessions_history',
  'sessions_send',
  'sessions_spawn',
  'gateway',
];

/** Tools safe for untrusted agents */
export const SAFE_TOOLS: ToolName[] = [
  'read',
  'web_search',
  'web_fetch',
  'tts',
  'image',
];

// ============================================================================
// Default Permissions
// ============================================================================

/**
 * Default permissions for agents
 * Based on OPENCLAW_INTEGRATION_SPEC.md section 4.6
 */
export const DEFAULT_PERMISSIONS: AgentPermissions = {
  allowedTools: [
    'read',
    'write',
    'edit',
    'exec',
    'browser',
    'canvas',
    'nodes',
    'cron',
    'sessions_list',
    'sessions_history',
    'sessions_send',
    'sessions_spawn',
    'web_search',
    'web_fetch',
    'image',
    'tts',
  ],
  deniedTools: ['gateway', 'discord', 'slack'], // sensitive channels
  sandboxMode: 'non-main',
  maxDuration: 3600, // 1 hour
  maxTokens: 100000,
  maxCost: 1.0,
  requireApproval: false,
  approvalChannels: [],
  canSpawnAgents: true,
  maxConcurrentTools: 5,
};

/**
 * Restricted permissions for untrusted agents
 * Limited to safe operations only
 */
export const RESTRICTED_PERMISSIONS: AgentPermissions = {
  allowedTools: ['read', 'web_search', 'web_fetch', 'image', 'tts'],
  deniedTools: [...DANGEROUS_TOOLS, ...SESSION_TOOLS],
  sandboxMode: 'docker',
  maxDuration: 600, // 10 minutes
  maxTokens: 10000,
  maxCost: 0.1,
  requireApproval: true,
  approvalChannels: ['main'],
  canSpawnAgents: false,
  maxConcurrentTools: 2,
};

/**
 * Full permissions for trusted/main agents
 */
export const FULL_PERMISSIONS: AgentPermissions = {
  allowedTools: ['*'], // All tools allowed
  deniedTools: [], // Nothing denied
  sandboxMode: 'none',
  maxDuration: 7200, // 2 hours
  maxTokens: 500000,
  maxCost: 5.0,
  requireApproval: false,
  approvalChannels: [],
  canSpawnAgents: true,
  maxConcurrentTools: 10,
};

/**
 * Read-only permissions for analysis agents
 */
export const READONLY_PERMISSIONS: AgentPermissions = {
  allowedTools: ['read', 'web_search', 'web_fetch', 'image', 'sessions_list', 'sessions_history'],
  deniedTools: [...FILE_TOOLS.filter(t => t !== 'read'), ...DANGEROUS_TOOLS],
  sandboxMode: 'non-main',
  maxDuration: 1800, // 30 minutes
  maxTokens: 50000,
  maxCost: 0.5,
  requireApproval: false,
  approvalChannels: [],
  canSpawnAgents: false,
  maxConcurrentTools: 3,
};

// ============================================================================
// Sandbox Configurations
// ============================================================================

/**
 * Default Docker sandbox configuration
 * Secure defaults for containerized execution
 */
export const DEFAULT_DOCKER_CONFIG: SandboxConfig = {
  image: 'openclaw/agent-sandbox:latest',
  cpuLimit: '1.0',
  memoryLimit: '512m',
  networkMode: 'bridge',
  volumeMounts: {
    '/tmp/openclaw-workspace': '/workspace',
  },
  envVars: {
    NODE_ENV: 'sandbox',
    OPENCLAW_MODE: 'restricted',
  },
  workingDir: '/workspace',
  autoRemove: true,
  readOnlyRootFs: true,
  noNewPrivileges: true,
  capDrop: ['ALL'],
  securityOpts: ['no-new-privileges:true', 'seccomp:unconfined'],
};

/**
 * Restricted Docker sandbox configuration
 * Maximum security for untrusted agents
 */
export const RESTRICTED_DOCKER_CONFIG: SandboxConfig = {
  image: 'openclaw/agent-sandbox:restricted',
  cpuLimit: '0.5',
  memoryLimit: '256m',
  networkMode: 'none', // No network access
  volumeMounts: {
    '/tmp/openclaw-workspace': '/workspace:ro', // Read-only
  },
  envVars: {
    NODE_ENV: 'sandbox',
    OPENCLAW_MODE: 'restricted',
    PATH: '/usr/local/bin:/usr/bin:/bin',
  },
  workingDir: '/workspace',
  autoRemove: true,
  readOnlyRootFs: true,
  noNewPrivileges: true,
  capDrop: ['ALL'],
  securityOpts: [
    'no-new-privileges:true',
    'seccomp:default.json',
    'apparmor:docker-default',
  ],
};

/**
 * Permissive Docker sandbox configuration
 * For trusted agents needing more flexibility
 */
export const PERMISSIVE_DOCKER_CONFIG: SandboxConfig = {
  image: 'openclaw/agent-sandbox:full',
  cpuLimit: '2.0',
  memoryLimit: '2g',
  networkMode: 'bridge',
  volumeMounts: {
    '/tmp/openclaw-workspace': '/workspace',
    '/var/run/docker.sock': '/var/run/docker.sock', // Docker-in-docker
  },
  envVars: {
    NODE_ENV: 'production',
    OPENCLAW_MODE: 'full',
  },
  workingDir: '/workspace',
  autoRemove: false, // Keep for debugging
  readOnlyRootFs: false,
  noNewPrivileges: false,
  capDrop: [],
  securityOpts: [],
};

// ============================================================================
// Resource Limits
// ============================================================================

/**
 * Default resource limits for sandboxed agents
 */
export const DEFAULT_RESOURCE_LIMITS: ResourceLimits = {
  cpuMillicores: 1000, // 1 CPU core
  memoryMB: 512,
  diskMB: 1024,
  maxProcesses: 50,
  maxOpenFiles: 1024,
  networkMbps: 100,
  tokensPerRequest: 4000,
  tokensPerSession: 100000,
};

/**
 * Restricted resource limits for untrusted agents
 */
export const RESTRICTED_RESOURCE_LIMITS: ResourceLimits = {
  cpuMillicores: 500, // 0.5 CPU cores
  memoryMB: 256,
  diskMB: 256,
  maxProcesses: 20,
  maxOpenFiles: 512,
  networkMbps: 0, // No network
  tokensPerRequest: 2000,
  tokensPerSession: 10000,
};

/**
 * Generous resource limits for trusted agents
 */
export const GENEROUS_RESOURCE_LIMITS: ResourceLimits = {
  cpuMillicores: 2000, // 2 CPU cores
  memoryMB: 2048,
  diskMB: 4096,
  maxProcesses: 200,
  maxOpenFiles: 4096,
  networkMbps: 1000,
  tokensPerRequest: 8000,
  tokensPerSession: 500000,
};

// ============================================================================
// Security Profiles
// ============================================================================

/**
 * Predefined security profiles for different agent types
 */
export const SECURITY_PROFILES: Record<string, SecurityProfile> = {
  /** Main orchestrator agent - full access */
  main: {
    name: 'main',
    description: 'Full access for main orchestrator agents',
    permissions: FULL_PERMISSIONS,
    allowedPaths: ['*'],
    deniedPaths: [],
    allowedHosts: ['*'],
    allowedCommands: ['*'],
    deniedCommands: [],
  },

  /** Standard sub-agent - balanced security */
  standard: {
    name: 'standard',
    description: 'Balanced permissions for general-purpose agents',
    permissions: DEFAULT_PERMISSIONS,
    sandboxConfig: DEFAULT_DOCKER_CONFIG,
    allowedPaths: ['/workspace/*', '/tmp/*'],
    deniedPaths: ['/etc/*', '/var/*', '/home/*', '~/.ssh/*', '~/.aws/*'],
    allowedHosts: ['*'],
    allowedCommands: ['npm', 'node', 'python', 'python3', 'git', 'cat', 'grep', 'find', 'ls', 'pwd'],
    deniedCommands: ['sudo', 'su', 'chmod', 'chown', 'rm -rf /'],
  },

  /** Untrusted agent - maximum restriction */
  untrusted: {
    name: 'untrusted',
    description: 'Maximum restrictions for untrusted or external agents',
    permissions: RESTRICTED_PERMISSIONS,
    sandboxConfig: RESTRICTED_DOCKER_CONFIG,
    allowedPaths: ['/workspace/*:ro'],
    deniedPaths: ['*'],
    allowedHosts: [], // No network
    allowedCommands: [],
    deniedCommands: ['*'],
  },

  /** Analysis agent - read-only */
  analysis: {
    name: 'analysis',
    description: 'Read-only permissions for analysis and review agents',
    permissions: READONLY_PERMISSIONS,
    sandboxConfig: {
      ...DEFAULT_DOCKER_CONFIG,
      networkMode: 'bridge', // Allow web searches
    },
    allowedPaths: ['/workspace/*:ro', '/tmp/*'],
    deniedPaths: ['~/.ssh/*', '~/.aws/*', '**/.env*'],
    allowedHosts: ['*'], // Allow web searches
    allowedCommands: [],
    deniedCommands: ['*'],
  },

  /** Code execution agent - sandboxed */
  code: {
    name: 'code',
    description: 'Sandboxed permissions for code execution agents',
    permissions: {
      ...DEFAULT_PERMISSIONS,
      sandboxMode: 'docker',
      deniedTools: ['gateway', 'discord', 'slack', 'telegram', 'message'],
    },
    sandboxConfig: DEFAULT_DOCKER_CONFIG,
    allowedPaths: ['/workspace/*', '/tmp/*'],
    deniedPaths: ['/etc/*', '/var/*', '~/.ssh/*', '~/.aws/*'],
    allowedHosts: ['registry.npmjs.org', 'pypi.org', 'github.com', 'api.github.com'],
    allowedCommands: ['npm', 'node', 'npx', 'python', 'python3', 'pip', 'git', 'curl', 'wget'],
    deniedCommands: ['sudo', 'su', 'ssh', 'scp'],
  },

  /** Browser agent - web automation focus */
  browser: {
    name: 'browser',
    description: 'Permissions for web automation and scraping agents',
    permissions: {
      allowedTools: ['browser', 'read', 'write', 'web_search', 'web_fetch', 'image'],
      deniedTools: ['exec', 'nodes', 'gateway', 'discord', 'slack'],
      sandboxMode: 'docker',
      maxDuration: 1800,
      maxTokens: 50000,
      maxCost: 0.5,
      requireApproval: false,
      approvalChannels: [],
      canSpawnAgents: false,
      maxConcurrentTools: 3,
    },
    sandboxConfig: {
      ...DEFAULT_DOCKER_CONFIG,
      memoryLimit: '1g', // Browser needs more memory
    },
    allowedPaths: ['/workspace/*', '/tmp/*'],
    deniedPaths: [],
    allowedHosts: ['*'],
    allowedCommands: [],
    deniedCommands: ['*'],
  },
};

// ============================================================================
// Permission Inheritance
// ============================================================================

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
export const DEFAULT_INHERITANCE_OPTIONS: PermissionInheritanceOptions = {
  inheritPermissions: true,
  restrictChildPermissions: true,
  resourceMultiplier: 0.5,
  alwaysDenyChildren: ['gateway', 'sessions_spawn'],
  alwaysAllowChildren: ['read', 'sessions_list', 'sessions_history'],
  maxInheritanceDepth: 3,
};

/**
 * Strict permission inheritance (max security)
 */
export const STRICT_INHERITANCE_OPTIONS: PermissionInheritanceOptions = {
  inheritPermissions: false,
  restrictChildPermissions: true,
  resourceMultiplier: 0.25,
  alwaysDenyChildren: ['*'],
  alwaysAllowChildren: ['read'],
  maxInheritanceDepth: 1,
};

/**
 * Permissive permission inheritance (max flexibility)
 */
export const PERMISSIVE_INHERITANCE_OPTIONS: PermissionInheritanceOptions = {
  inheritPermissions: true,
  restrictChildPermissions: false,
  resourceMultiplier: 1.0,
  alwaysDenyChildren: [],
  alwaysAllowChildren: [],
  maxInheritanceDepth: 5,
};

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Validate that a permission configuration is valid
 */
export function validatePermissions(permissions: AgentPermissions): string[] {
  const errors: string[] = [];

  if (permissions.maxDuration <= 0) {
    errors.push('maxDuration must be greater than 0');
  }

  if (permissions.maxTokens <= 0) {
    errors.push('maxTokens must be greater than 0');
  }

  if (permissions.maxCost < 0) {
    errors.push('maxCost must be non-negative');
  }

  if (permissions.maxConcurrentTools <= 0) {
    errors.push('maxConcurrentTools must be greater than 0');
  }

  // Check for conflicts between allowed and denied
  const conflicts = permissions.allowedTools.filter(t =>
    permissions.deniedTools.includes(t)
  );
  if (conflicts.length > 0) {
    errors.push(`Tools in both allowed and denied lists: ${conflicts.join(', ')}`);
  }

  return errors;
}

/**
 * Check if a sandbox mode is valid
 */
export function isValidSandboxMode(mode: string): mode is SandboxMode {
  return ['none', 'non-main', 'docker'].includes(mode);
}

/**
 * Get effective permissions after applying inheritance
 */
export function computeInheritedPermissions(
  parentPermissions: AgentPermissions,
  childPermissions: Partial<AgentPermissions> = {},
  options: PermissionInheritanceOptions = DEFAULT_INHERITANCE_OPTIONS
): AgentPermissions {
  if (!options.inheritPermissions) {
    // Don't inherit - use child permissions with defaults
    return {
      ...DEFAULT_PERMISSIONS,
      ...childPermissions,
    };
  }

  const basePermissions = options.restrictChildPermissions
    ? parentPermissions
    : { ...DEFAULT_PERMISSIONS, ...parentPermissions };

  // Apply resource multiplier
  const multiplier = options.restrictChildPermissions ? options.resourceMultiplier : 1;

  // Merge denied tools (parent denied + always deny children)
  const deniedTools = [
    ...new Set([
      ...basePermissions.deniedTools,
      ...(options.alwaysDenyChildren || []),
    ]),
  ];

  // Merge allowed tools
  const allowedTools = childPermissions.allowedTools || basePermissions.allowedTools;

  // Filter out denied tools from allowed
  const effectiveAllowed = allowedTools.filter(t => !deniedTools.includes(t));

  return {
    allowedTools: effectiveAllowed,
    deniedTools,
    sandboxMode: childPermissions.sandboxMode ?? basePermissions.sandboxMode,
    maxDuration: Math.floor(basePermissions.maxDuration * multiplier),
    maxTokens: Math.floor(basePermissions.maxTokens * multiplier),
    maxCost: basePermissions.maxCost * multiplier,
    requireApproval: childPermissions.requireApproval ?? basePermissions.requireApproval,
    approvalChannels: childPermissions.approvalChannels ?? basePermissions.approvalChannels,
    canSpawnAgents: childPermissions.canSpawnAgents ?? basePermissions.canSpawnAgents,
    maxConcurrentTools: Math.max(1, Math.floor(basePermissions.maxConcurrentTools * multiplier)),
  };
}
