/**
 * YAML Configuration Types and Schema
 * 
 * Defines the TypeScript types and validation schema for swarm.yaml
 * configuration files with support for environment variable substitution
 * and secret resolution.
 */

import { Type, type Static } from '@sinclair/typebox';
import type { SwarmStrategy } from '../core/swarm';

// ============================================================================
// Budget Configuration
// ============================================================================

export const BudgetConfigSchema = Type.Object({
  amount: Type.Number({ description: 'Budget amount' }),
  currency: Type.String({ default: 'USD', description: 'Currency code' }),
  warningThreshold: Type.Optional(Type.Number({ 
    minimum: 0, 
    maximum: 1, 
    description: 'Warning threshold (0-1)' 
  })),
  criticalThreshold: Type.Optional(Type.Number({ 
    minimum: 0, 
    maximum: 1, 
    description: 'Critical threshold (0-1)' 
  })),
}, { description: 'Budget configuration for cost tracking' });

export type BudgetConfig = Static<typeof BudgetConfigSchema>;

// ============================================================================
// Safety Configuration
// ============================================================================

export const SafetyConfigSchema = Type.Object({
  fileSandbox: Type.Boolean({ default: true, description: 'Enable file sandboxing' }),
  networkAllowlist: Type.Optional(Type.Array(Type.String(), { 
    description: 'Allowed network domains' 
  })),
  commandBlacklist: Type.Optional(Type.Array(Type.String(), { 
    description: 'Blacklisted shell commands' 
  })),
  maxExecutionTime: Type.Optional(Type.Number({ 
    description: 'Max execution time in milliseconds' 
  })),
  ethicsBoundaries: Type.Optional(Type.Object({
    doNotHarm: Type.Boolean({ default: true }),
    preservePrivacy: Type.Boolean({ default: true }),
    noDeception: Type.Boolean({ default: true }),
    authorizedAccessOnly: Type.Boolean({ default: true }),
  })),
  dangerousActions: Type.Optional(Type.Object({
    dataDestruction: Type.Union([
      Type.Literal('block'),
      Type.Literal('confirm'),
      Type.Literal('allow'),
    ], { default: 'confirm' }),
    agentTermination: Type.Union([
      Type.Literal('confirm'),
      Type.Literal('allow'),
    ], { default: 'confirm' }),
    externalPublishing: Type.Union([
      Type.Literal('confirm'),
      Type.Literal('block'),
    ], { default: 'confirm' }),
    resourceExhaustion: Type.Union([
      Type.Literal('block'),
      Type.Literal('confirm'),
    ], { default: 'block' }),
  })),
}, { description: 'Safety and security configuration' });

export type SafetyConfig = Static<typeof SafetyConfigSchema>;

// ============================================================================
// Agent Configuration
// ============================================================================

export const AgentConfigSchema = Type.Object({
  name: Type.String({ description: 'Agent name/label' }),
  model: Type.String({ description: 'Model identifier' }),
  task: Type.String({ description: 'Agent task description' }),
  maxRetries: Type.Optional(Type.Number({ default: 3, description: 'Maximum retry attempts' })),
  budgetLimit: Type.Optional(Type.Number({ description: 'Individual agent budget limit' })),
  contextWindow: Type.Optional(Type.Number({ description: 'Context window size' })),
  metadata: Type.Optional(Type.Record(Type.String(), Type.Unknown(), { 
    description: 'Additional metadata' 
  })),
}, { description: 'Individual agent configuration' });

export type AgentConfig = Static<typeof AgentConfigSchema>;

// ============================================================================
// Scaling Configuration
// ============================================================================

export const ScalingConfigSchema = Type.Object({
  enabled: Type.Boolean({ default: false, description: 'Enable auto-scaling' }),
  minAgents: Type.Number({ default: 1, description: 'Minimum agent count' }),
  maxAgents: Type.Number({ default: 50, description: 'Maximum agent count' }),
  scaleUpThreshold: Type.Number({ default: 10, description: 'Queue depth to trigger scale up' }),
  scaleDownCooldown: Type.Number({ default: 300, description: 'Cooldown seconds before scaling down' }),
  targetUtilization: Type.Optional(Type.Number({ 
    minimum: 0, 
    maximum: 1, 
    default: 0.8,
    description: 'Target CPU/memory utilization' 
  })),
}, { description: 'Auto-scaling configuration' });

export type ScalingConfig = Static<typeof ScalingConfigSchema>;

// ============================================================================
// GitOps Configuration
// ============================================================================

export const GitOpsConfigSchema = Type.Object({
  enabled: Type.Boolean({ default: true, description: 'Enable GitOps mode' }),
  watchInterval: Type.Number({ default: 5000, description: 'File watch interval in milliseconds' }),
  autoApply: Type.Boolean({ default: true, description: 'Auto-apply changes' }),
  rollbackOnFailure: Type.Boolean({ default: true, description: 'Rollback on apply failure' }),
  notifyOnChange: Type.Boolean({ default: true, description: 'Send notifications on changes' }),
}, { description: 'GitOps configuration for config file watching' });

export type GitOpsConfig = Static<typeof GitOpsConfigSchema>;

// ============================================================================
// Secret Reference
// ============================================================================

export const SecretReferenceSchema = Type.String({
  pattern: '^\\{\\{\\s*op://[^/]+/[^/]+/[^/]+\\s*\\}\\}$',
  description: '1Password secret reference: {{ op://vault/item/field }}',
});

export type SecretReference = string;

// ============================================================================
// Environment Variable
// ============================================================================

export const EnvVarSchema = Type.Union([
  Type.String(),
  Type.Number(),
  Type.Boolean(),
  SecretReferenceSchema,
]);

export type EnvVarValue = string | number | boolean | SecretReference;

// ============================================================================
// Swarm Configuration (Main Schema)
// ============================================================================

export const SwarmYamlSchema = Type.Object({
  apiVersion: Type.Literal('dash.io/v1', { description: 'API version' }),
  kind: Type.Literal('Swarm', { description: 'Resource kind' }),
  
  metadata: Type.Object({
    name: Type.String({ description: 'Swarm name' }),
    description: Type.Optional(Type.String({ description: 'Swarm description' })),
    labels: Type.Optional(Type.Record(Type.String(), Type.String(), { 
      description: 'Key-value labels' 
    })),
    annotations: Type.Optional(Type.Record(Type.String(), Type.String(), { 
      description: 'Key-value annotations' 
    })),
  }, { description: 'Metadata for the swarm' }),
  
  spec: Type.Object({
    task: Type.String({ description: 'Primary task for the swarm' }),
    strategy: Type.Union([
      Type.Literal('parallel'),
      Type.Literal('map-reduce'),
      Type.Literal('pipeline'),
      Type.Literal('tree'),
    ], { default: 'parallel', description: 'Swarm execution strategy' }),
    
    initialAgents: Type.Number({ default: 5, description: 'Initial number of agents' }),
    maxAgents: Type.Number({ default: 50, description: 'Maximum number of agents' }),
    
    model: Type.Optional(Type.String({ description: 'Default model for agents' })),
    
    budget: Type.Optional(BudgetConfigSchema),
    safety: Type.Optional(SafetyConfigSchema),
    scaling: Type.Optional(ScalingConfigSchema),
    gitops: Type.Optional(GitOpsConfigSchema),
    
    // Environment variables with substitution support
    env: Type.Optional(Type.Record(Type.String(), EnvVarSchema, { 
      description: 'Environment variables (supports $VAR and ${VAR} syntax)' 
    })),
    
    // Individual agent overrides
    agents: Type.Optional(Type.Array(AgentConfigSchema, { 
      description: 'Individual agent configurations' 
    })),
    
    // Workflow DAG (for future use)
    workflow: Type.Optional(Type.Object({
      steps: Type.Array(Type.Object({
        name: Type.String(),
        agent: Type.String(),
        task: Type.Optional(Type.String()),
        dependsOn: Type.Optional(Type.Array(Type.String())),
        next: Type.Optional(Type.Array(Type.String())),
      })),
    })),
  }, { description: 'Swarm specification' }),
}, { description: 'Dash Swarm YAML configuration' });

export type SwarmYamlConfig = Static<typeof SwarmYamlSchema>;

// ============================================================================
// Config Loading Options
// ============================================================================

export interface ConfigLoadOptions {
  /** Path to the config file */
  filePath: string;
  /** Working directory for relative paths */
  cwd?: string;
  /** Enable environment variable substitution */
  substituteEnv?: boolean;
  /** Enable secret resolution */
  resolveSecrets?: boolean;
  /** Validate against schema */
  validate?: boolean;
}

export interface ConfigLoadResult {
  /** Parsed and validated config */
  config: SwarmYamlConfig;
  /** Original file content (for diff) */
  rawContent: string;
  /** Path to the config file */
  filePath: string;
  /** Checksum of the config */
  checksum: string;
  /** List of secrets that were resolved */
  resolvedSecrets: string[];
  /** List of environment variables substituted */
  substitutedEnvVars: string[];
}

// ============================================================================
// Config Diff Types
// ============================================================================

export interface ConfigDiff {
  /** Path that changed */
  path: string;
  /** Old value */
  oldValue: unknown;
  /** New value */
  newValue: unknown;
  /** Type of change */
  type: 'added' | 'removed' | 'modified';
}

export interface ConfigDiffResult {
  /** Whether configs are identical */
  identical: boolean;
  /** List of differences */
  differences: ConfigDiff[];
  /** Summary of changes */
  summary: {
    added: number;
    removed: number;
    modified: number;
  };
}

// ============================================================================
// Validation Error
// ============================================================================

export interface ConfigValidationError {
  /** Error path in the config */
  path: string;
  /** Error message */
  message: string;
  /** Error code */
  code: string;
  /** Suggested fix */
  suggestion?: string;
}

export class ConfigValidationException extends Error {
  constructor(
    message: string,
    public readonly errors: ConfigValidationError[],
    public readonly filePath?: string
  ) {
    super(message);
    this.name = 'ConfigValidationException';
  }
}

// ============================================================================
// GitOps Event Types
// ============================================================================

export type GitOpsEventType = 
  | 'config.loaded'
  | 'config.changed'
  | 'config.applied'
  | 'config.failed'
  | 'config.rolledback';

export interface GitOpsEvent {
  type: GitOpsEventType;
  timestamp: Date;
  filePath: string;
  swarmId?: string;
  error?: Error;
  diff?: ConfigDiffResult;
}

export type GitOpsEventHandler = (event: GitOpsEvent) => void | Promise<void>;
