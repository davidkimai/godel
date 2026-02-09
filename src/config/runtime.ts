/**
 * Runtime Configuration
 * 
 * Configuration system for runtime selection per SPEC-002 Section 4.1.
 * Supports global defaults, team-level overrides, and agent-level overrides
 * with environment variable integration and Zod schema validation.
 * 
 * @module config/runtime
 * @version 1.0.0
 * @since 2026-02-08
 */

import { z } from 'zod';
import type { RuntimeType, ResourceLimits } from '../core/runtime/runtime-provider';

// ═══════════════════════════════════════════════════════════════════════════════
// ZOD SCHEMAS FOR VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Zod schema for RuntimeType
 */
export const RuntimeTypeSchema = z.enum(['worktree', 'kata', 'e2b'], {
  required_error: 'Runtime type is required',
  invalid_type_error: 'Runtime type must be one of: worktree, kata, e2b',
});

/**
 * Zod schema for ResourceLimits
 */
export const ResourceLimitsSchema = z.object({
  cpu: z.number()
    .min(0.1, 'CPU must be at least 0.1 cores')
    .max(128, 'CPU cannot exceed 128 cores')
    .describe('CPU cores (fractional allowed: 0.5, 1.5, etc.)'),
  memory: z.string()
    .regex(/^\d+(Mi|Gi|Ti)$/i, 'Memory must be in format like "512Mi", "2Gi", "1Ti"')
    .describe('Memory limit (e.g., "512Mi", "2Gi")'),
  disk: z.string()
    .regex(/^\d+(Mi|Gi|Ti)$/i, 'Disk must be in format like "10Gi", "100Gi"')
    .optional()
    .describe('Disk limit (e.g., "10Gi")'),
  agents: z.number()
    .int('Agents must be an integer')
    .min(1, 'Must allow at least 1 agent')
    .max(1000, 'Cannot exceed 1000 agents')
    .optional()
    .describe('Maximum concurrent agents'),
});

/**
 * Zod schema for AgentRuntimeConfig
 */
export const AgentRuntimeConfigSchema = z.object({
  runtime: RuntimeTypeSchema.optional()
    .describe('Runtime override for this agent (defaults to team/global default)'),
  resources: ResourceLimitsSchema.optional()
    .describe('Resource limits override for this agent'),
  timeout: z.number()
    .int('Timeout must be an integer')
    .min(1, 'Timeout must be at least 1 second')
    .max(86400, 'Timeout cannot exceed 24 hours')
    .optional()
    .describe('Timeout in seconds for agent operations'),
  env: z.record(z.string())
    .optional()
    .describe('Environment variables for this agent'),
  labels: z.record(z.string())
    .optional()
    .describe('Labels for agent organization'),
});

/**
 * Zod schema for TeamRuntimeConfig
 */
export const TeamRuntimeConfigSchema = z.object({
  runtime: RuntimeTypeSchema
    .describe('Preferred runtime for this team'),
  resources: ResourceLimitsSchema
    .describe('Resource quotas for this team'),
  budget: z.number()
    .min(0, 'Budget cannot be negative')
    .optional()
    .describe('Budget limit in USD for this team'),
  enabledRuntimes: z.array(RuntimeTypeSchema)
    .min(1, 'At least one runtime must be enabled')
    .optional()
    .describe('Runtimes available to this team'),
  agents: z.record(AgentRuntimeConfigSchema)
    .optional()
    .describe('Per-agent configuration overrides'),
  defaultTimeout: z.number()
    .int('Timeout must be an integer')
    .min(1, 'Timeout must be at least 1 second')
    .max(86400, 'Timeout cannot exceed 24 hours')
    .optional()
    .describe('Default timeout in seconds for agent operations'),
});

/**
 * Zod schema for RuntimeFeatureFlags
 */
export const RuntimeFeatureFlagsSchema = z.object({
  kataEnabled: z.boolean()
    .default(false)
    .describe('Enable Kata Containers runtime'),
  e2bEnabled: z.boolean()
    .default(false)
    .describe('Enable E2B runtime'),
  worktreeEnabled: z.boolean()
    .default(true)
    .describe('Enable Worktree runtime (legacy)'),
  autoFallback: z.boolean()
    .default(true)
    .describe('Automatically fallback to available runtimes on failure'),
  enforceResourceLimits: z.boolean()
    .default(true)
    .describe('Enforce resource limits strictly'),
  snapshotEnabled: z.boolean()
    .default(true)
    .describe('Enable runtime snapshot functionality'),
  healthChecksEnabled: z.boolean()
    .default(true)
    .describe('Enable runtime health checks'),
});

/**
 * Zod schema for GlobalRuntimeConfig
 */
export const GlobalRuntimeConfigSchema = z.object({
  defaultRuntime: RuntimeTypeSchema
    .describe('Default runtime type for all operations'),
  availableRuntimes: z.array(RuntimeTypeSchema)
    .min(1, 'At least one runtime must be available')
    .describe('List of available runtime types'),
  teams: z.record(TeamRuntimeConfigSchema)
    .default({})
    .describe('Team-specific runtime configurations'),
  features: RuntimeFeatureFlagsSchema
    .default({})
    .describe('Feature flags for runtime functionality'),
  globalResources: ResourceLimitsSchema
    .optional()
    .describe('Global default resource limits'),
  fallbackChain: z.array(RuntimeTypeSchema)
    .min(1, 'Fallback chain must have at least one runtime')
    .optional()
    .describe('Ordered list of runtimes for fallback'),
});

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS (inferred from Zod schemas)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Runtime configuration for a single agent
 */
export type AgentRuntimeConfig = z.infer<typeof AgentRuntimeConfigSchema>;

/**
 * Runtime configuration for a team
 */
export type TeamRuntimeConfig = z.infer<typeof TeamRuntimeConfigSchema>;

/**
 * Feature flags for runtime functionality
 */
export type RuntimeFeatureFlags = z.infer<typeof RuntimeFeatureFlagsSchema>;

/**
 * Global runtime configuration
 */
export type GlobalRuntimeConfig = z.infer<typeof GlobalRuntimeConfigSchema>;

// ═══════════════════════════════════════════════════════════════════════════════
// ENVIRONMENT VARIABLE SUPPORT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Environment variable mapping for runtime configuration
 */
export const RuntimeEnvVars = {
  /** Default runtime type (worktree, kata, e2b) */
  DEFAULT_RUNTIME: 'GODEL_DEFAULT_RUNTIME',
  /** Enable Kata Containers runtime */
  KATA_ENABLED: 'GODEL_KATA_ENABLED',
  /** Enable E2B runtime */
  E2B_ENABLED: 'GODEL_E2B_ENABLED',
  /** Enable Worktree runtime */
  WORKTREE_ENABLED: 'GODEL_WORKTREE_ENABLED',
  /** Default CPU limit */
  DEFAULT_CPU: 'GODEL_DEFAULT_CPU',
  /** Default memory limit */
  DEFAULT_MEMORY: 'GODEL_DEFAULT_MEMORY',
  /** Default disk limit */
  DEFAULT_DISK: 'GODEL_DEFAULT_DISK',
  /** Enable auto fallback */
  AUTO_FALLBACK: 'GODEL_AUTO_FALLBACK',
  /** Enforce resource limits */
  ENFORCE_LIMITS: 'GODEL_ENFORCE_LIMITS',
  /** Enable snapshots */
  SNAPSHOT_ENABLED: 'GODEL_SNAPSHOT_ENABLED',
  /** Enable health checks */
  HEALTH_CHECKS_ENABLED: 'GODEL_HEALTH_CHECKS_ENABLED',
  /** Team-specific runtime override (format: GODEL_TEAM_{TEAM_NAME}_RUNTIME) */
  TEAM_RUNTIME_PREFIX: 'GODEL_TEAM_',
  /** Team-specific budget override (format: GODEL_TEAM_{TEAM_NAME}_BUDGET) */
  TEAM_BUDGET_PREFIX: 'GODEL_TEAM_',
  /** Team-specific CPU override (format: GODEL_TEAM_{TEAM_NAME}_CPU) */
  TEAM_CPU_PREFIX: 'GODEL_TEAM_',
  /** Team-specific memory override (format: GODEL_TEAM_{TEAM_NAME}_MEMORY) */
  TEAM_MEMORY_PREFIX: 'GODEL_TEAM_',
} as const;

/**
 * Parse environment variable as boolean
 */
function parseEnvBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

/**
 * Parse environment variable as number
 */
function parseEnvNumber(value: string | undefined, defaultValue: number): number {
  if (value === undefined) return defaultValue;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Load feature flags from environment variables
 */
function loadFeatureFlagsFromEnv(): Partial<RuntimeFeatureFlags> {
  return {
    kataEnabled: parseEnvBoolean(process.env[RuntimeEnvVars.KATA_ENABLED], false),
    e2bEnabled: parseEnvBoolean(process.env[RuntimeEnvVars.E2B_ENABLED], false),
    worktreeEnabled: parseEnvBoolean(process.env[RuntimeEnvVars.WORKTREE_ENABLED], true),
    autoFallback: parseEnvBoolean(process.env[RuntimeEnvVars.AUTO_FALLBACK], true),
    enforceResourceLimits: parseEnvBoolean(process.env[RuntimeEnvVars.ENFORCE_LIMITS], true),
    snapshotEnabled: parseEnvBoolean(process.env[RuntimeEnvVars.SNAPSHOT_ENABLED], true),
    healthChecksEnabled: parseEnvBoolean(process.env[RuntimeEnvVars.HEALTH_CHECKS_ENABLED], true),
  };
}

/**
 * Load default runtime from environment
 */
function loadDefaultRuntimeFromEnv(): RuntimeType | undefined {
  const value = process.env[RuntimeEnvVars.DEFAULT_RUNTIME];
  if (!value) return undefined;
  
  const validTypes: RuntimeType[] = ['worktree', 'kata', 'e2b'];
  if (validTypes.includes(value as RuntimeType)) {
    return value as RuntimeType;
  }
  
  console.warn(`Invalid GODEL_DEFAULT_RUNTIME: ${value}. Using default.`);
  return undefined;
}

/**
 * Load global resource limits from environment
 */
function loadGlobalResourcesFromEnv(): Partial<ResourceLimits> {
  const resources: Partial<ResourceLimits> = {};
  
  const cpu = parseEnvNumber(process.env[RuntimeEnvVars.DEFAULT_CPU], 0);
  if (cpu > 0) resources.cpu = cpu;
  
  if (process.env[RuntimeEnvVars.DEFAULT_MEMORY]) {
    resources.memory = process.env[RuntimeEnvVars.DEFAULT_MEMORY];
  }
  
  if (process.env[RuntimeEnvVars.DEFAULT_DISK]) {
    resources.disk = process.env[RuntimeEnvVars.DEFAULT_DISK];
  }
  
  return resources;
}

/**
 * Load team-specific overrides from environment variables
 */
function loadTeamOverridesFromEnv(): Record<string, Partial<TeamRuntimeConfig>> {
  const teamOverrides: Record<string, Partial<TeamRuntimeConfig>> = {};
  
  // Find all team-related environment variables
  for (const [key, value] of Object.entries(process.env)) {
    if (!key || !value) continue;
    
    // Parse GODEL_TEAM_{TEAM_NAME}_RUNTIME
    const runtimeMatch = key.match(/^GODEL_TEAM_(.+)_RUNTIME$/);
    if (runtimeMatch) {
      const teamName = runtimeMatch[1]?.toLowerCase();
      if (teamName) {
        if (!teamOverrides[teamName]) teamOverrides[teamName] = {};
        const validTypes: RuntimeType[] = ['worktree', 'kata', 'e2b'];
        if (validTypes.includes(value as RuntimeType)) {
          teamOverrides[teamName].runtime = value as RuntimeType;
        }
      }
    }
    
    // Parse GODEL_TEAM_{TEAM_NAME}_BUDGET
    const budgetMatch = key.match(/^GODEL_TEAM_(.+)_BUDGET$/);
    if (budgetMatch) {
      const teamName = budgetMatch[1]?.toLowerCase();
      if (teamName) {
        if (!teamOverrides[teamName]) teamOverrides[teamName] = {};
        const budget = parseFloat(value);
        if (!isNaN(budget) && budget >= 0) {
          teamOverrides[teamName].budget = budget;
        }
      }
    }
    
    // Parse GODEL_TEAM_{TEAM_NAME}_CPU
    const cpuMatch = key.match(/^GODEL_TEAM_(.+)_CPU$/);
    if (cpuMatch) {
      const teamName = cpuMatch[1]?.toLowerCase();
      if (teamName) {
        if (!teamOverrides[teamName]) teamOverrides[teamName] = {};
        if (!teamOverrides[teamName].resources) {
          teamOverrides[teamName].resources = { cpu: 1, memory: '512Mi' };
        }
        const cpu = parseFloat(value);
        if (!isNaN(cpu) && cpu > 0) {
          (teamOverrides[teamName].resources as ResourceLimits).cpu = cpu;
        }
      }
    }
    
    // Parse GODEL_TEAM_{TEAM_NAME}_MEMORY
    const memoryMatch = key.match(/^GODEL_TEAM_(.+)_MEMORY$/);
    if (memoryMatch) {
      const teamName = memoryMatch[1]?.toLowerCase();
      if (teamName) {
        if (!teamOverrides[teamName]) teamOverrides[teamName] = {};
        if (!teamOverrides[teamName].resources) {
          teamOverrides[teamName].resources = { cpu: 1, memory: '512Mi' };
        }
        (teamOverrides[teamName].resources as ResourceLimits).memory = value;
      }
    }
  }
  
  return teamOverrides;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEFAULT CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Default resource limits
 */
export const defaultResourceLimits: ResourceLimits = {
  cpu: 1,
  memory: '512Mi',
  disk: '10Gi',
  agents: 10,
};

/**
 * Default feature flags
 */
export const defaultFeatureFlags: RuntimeFeatureFlags = {
  kataEnabled: false,
  e2bEnabled: false,
  worktreeEnabled: true,
  autoFallback: true,
  enforceResourceLimits: true,
  snapshotEnabled: true,
  healthChecksEnabled: true,
};

/**
 * Default global runtime configuration
 */
export const defaultRuntimeConfig: GlobalRuntimeConfig = {
  defaultRuntime: 'worktree',
  availableRuntimes: ['worktree'],
  teams: {},
  features: defaultFeatureFlags,
  globalResources: defaultResourceLimits,
  fallbackChain: ['worktree'],
};

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION LOADING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Runtime configuration manager class
 * 
 * Manages loading, validation, and resolution of runtime configuration
 * with support for environment variables and hierarchical overrides.
 */
export class RuntimeConfigManager {
  private config: GlobalRuntimeConfig;
  private validationErrors: z.ZodError[] = [];

  constructor(initialConfig?: Partial<GlobalRuntimeConfig>) {
    this.config = this.loadConfig(initialConfig);
  }

  /**
   * Load configuration from environment and initial values
   */
  private loadConfig(initialConfig?: Partial<GlobalRuntimeConfig>): GlobalRuntimeConfig {
    const envFeatures = loadFeatureFlagsFromEnv();
    const envDefaultRuntime = loadDefaultRuntimeFromEnv();
    const envGlobalResources = loadGlobalResourcesFromEnv();
    const teamOverrides = loadTeamOverridesFromEnv();

    // Determine available runtimes based on feature flags
    const availableRuntimes: RuntimeType[] = ['worktree'];
    if (envFeatures.kataEnabled) availableRuntimes.push('kata');
    if (envFeatures.e2bEnabled) availableRuntimes.push('e2b');

    // Build fallback chain (ordered by preference)
    const fallbackChain: RuntimeType[] = [];
    if (envFeatures.kataEnabled) fallbackChain.push('kata');
    if (envFeatures.e2bEnabled) fallbackChain.push('e2b');
    fallbackChain.push('worktree'); // Always include worktree as final fallback

    // Merge team overrides with initial config
    const mergedTeams: Record<string, TeamRuntimeConfig> = {};
    const initialTeams = initialConfig?.teams || {};
    
    // Add initial teams
    for (const [teamId, teamConfig] of Object.entries(initialTeams)) {
      mergedTeams[teamId] = this.mergeTeamConfig(teamConfig, teamOverrides[teamId]);
    }
    
    // Add teams from environment that aren't in initial config
    for (const [teamId, override] of Object.entries(teamOverrides)) {
      if (!mergedTeams[teamId]) {
        mergedTeams[teamId] = this.mergeTeamConfig(undefined, override);
      }
    }

    const config: GlobalRuntimeConfig = {
      defaultRuntime: envDefaultRuntime || initialConfig?.defaultRuntime || 'worktree',
      availableRuntimes: initialConfig?.availableRuntimes || availableRuntimes,
      teams: mergedTeams,
      features: {
        ...defaultFeatureFlags,
        ...initialConfig?.features,
        ...envFeatures,
      },
      globalResources: {
        cpu: envGlobalResources.cpu ?? initialConfig?.globalResources?.cpu ?? defaultResourceLimits.cpu,
        memory: envGlobalResources.memory ?? initialConfig?.globalResources?.memory ?? defaultResourceLimits.memory,
        disk: envGlobalResources.disk ?? initialConfig?.globalResources?.disk ?? defaultResourceLimits.disk,
        agents: envGlobalResources.agents ?? initialConfig?.globalResources?.agents ?? defaultResourceLimits.agents,
      },
      fallbackChain: initialConfig?.fallbackChain || fallbackChain,
    };

    // Validate the final configuration
    const result = GlobalRuntimeConfigSchema.safeParse(config);
    if (!result.success) {
      this.validationErrors.push(result.error);
      console.error('Runtime configuration validation failed:', result.error.errors);
      // Return default config on validation failure
      return defaultRuntimeConfig;
    }

    return result.data;
  }

  /**
   * Merge team configuration with environment overrides
   */
  private mergeTeamConfig(
    initial?: TeamRuntimeConfig,
    override?: Partial<TeamRuntimeConfig>
  ): TeamRuntimeConfig {
    return {
      runtime: override?.runtime || initial?.runtime || 'worktree',
      resources: {
        ...defaultResourceLimits,
        ...initial?.resources,
        ...override?.resources,
      },
      budget: override?.budget ?? initial?.budget,
      enabledRuntimes: initial?.enabledRuntimes,
      agents: initial?.agents,
      defaultTimeout: initial?.defaultTimeout,
    };
  }

  /**
   * Get the current configuration
   */
  getConfig(): GlobalRuntimeConfig {
    return { ...this.config };
  }

  /**
   * Get configuration for a specific team
   */
  getTeamConfig(teamId: string): TeamRuntimeConfig {
    if (this.config.teams[teamId]) {
      return { ...this.config.teams[teamId] };
    }

    // Return default team config
    return {
      runtime: this.config.defaultRuntime,
      resources: { ...this.config.globalResources! },
    };
  }

  /**
   * Get configuration for a specific agent within a team
   */
  getAgentConfig(teamId: string, agentId: string): AgentRuntimeConfig {
    const teamConfig = this.getTeamConfig(teamId);
    
    if (teamConfig.agents?.[agentId]) {
      return { ...teamConfig.agents[agentId] };
    }

    // Return defaults from team config
    return {
      runtime: teamConfig.runtime,
      resources: { ...teamConfig.resources },
      timeout: teamConfig.defaultTimeout,
    };
  }

  /**
   * Resolve the effective runtime type for a team/agent
   */
  resolveRuntimeType(teamId?: string, agentId?: string): RuntimeType {
    // Check agent override
    if (teamId && agentId) {
      const agentConfig = this.getAgentConfig(teamId, agentId);
      if (agentConfig.runtime && this.isRuntimeAvailable(agentConfig.runtime)) {
        return agentConfig.runtime;
      }
    }

    // Check team preference
    if (teamId) {
      const teamConfig = this.getTeamConfig(teamId);
      if (this.isRuntimeAvailable(teamConfig.runtime)) {
        return teamConfig.runtime;
      }
    }

    // Fall back to global default
    return this.config.defaultRuntime;
  }

  /**
   * Check if a runtime type is available
   */
  isRuntimeAvailable(runtime: RuntimeType): boolean {
    return this.config.availableRuntimes.includes(runtime);
  }

  /**
   * Get the fallback chain for a runtime
   */
  getFallbackChain(): RuntimeType[] {
    return [...this.config.fallbackChain!];
  }

  /**
   * Check if any validation errors occurred
   */
  hasValidationErrors(): boolean {
    return this.validationErrors.length > 0;
  }

  /**
   * Get validation errors
   */
  getValidationErrors(): z.ZodError[] {
    return [...this.validationErrors];
  }

  /**
   * Validate a runtime configuration object
   */
  static validateConfig(config: unknown): { success: true; data: GlobalRuntimeConfig } | { success: false; errors: z.ZodError[] } {
    const result = GlobalRuntimeConfigSchema.safeParse(config);
    
    if (result.success) {
      return { success: true, data: result.data };
    } else {
      return { success: false, errors: [result.error] };
    }
  }

  /**
   * Validate team configuration
   */
  static validateTeamConfig(config: unknown): { success: true; data: TeamRuntimeConfig } | { success: false; error: z.ZodError } {
    const result = TeamRuntimeConfigSchema.safeParse(config);
    
    if (result.success) {
      return { success: true, data: result.data };
    } else {
      return { success: false, error: result.error };
    }
  }

  /**
   * Validate agent configuration
   */
  static validateAgentConfig(config: unknown): { success: true; data: AgentRuntimeConfig } | { success: false; error: z.ZodError } {
    const result = AgentRuntimeConfigSchema.safeParse(config);
    
    if (result.success) {
      return { success: true, data: result.data };
    } else {
      return { success: false, error: result.error };
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONVENIENCE EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a runtime configuration manager with environment-based loading
 */
export function createRuntimeConfig(initialConfig?: Partial<GlobalRuntimeConfig>): RuntimeConfigManager {
  return new RuntimeConfigManager(initialConfig);
}

/**
 * Validate runtime configuration
 */
export function validateRuntimeConfig(config: unknown): { 
  success: true; 
  data: GlobalRuntimeConfig 
} | { 
  success: false; 
  errors: Array<{ path: string; message: string }> 
} {
  const result = GlobalRuntimeConfigSchema.safeParse(config);
  
  if (result.success) {
    return { success: true, data: result.data };
  }
  
  const errors = result.error.errors.map(err => ({
    path: err.path.join('.'),
    message: err.message,
  }));
  
  return { success: false, errors };
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEFAULT EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

export default RuntimeConfigManager;
