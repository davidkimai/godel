/**
 * Configuration Module
 * 
 * Provides YAML configuration support with GitOps integration:
 * - Load and validate swarm.yaml files
 * - Environment variable substitution
 * - 1Password secret resolution
 * - File watching with hot reload
 * - Auto-apply and rollback
 */

// Types
export * from './types';

// YAML Loader
export {
  loadConfig,
  loadConfigs,
  parseYaml,
  stringifyYaml,
  validateConfig,
  validateConfigOrThrow,
  toSwarmConfig,
  substituteEnvVars,
  substituteEnvVarsInObject,
  resolveSecret,
  resolveSecretsInObject,
  containsSecretReferences,
  extractSecretReferences,
} from './yaml-loader';

// GitOps
export {
  GitOpsManager,
  getGlobalGitOpsManager,
  resetGlobalGitOpsManager,
  diffConfigs,
  formatDiff,
} from './gitops';

// Secrets
export {
  SecretManager,
  SecretResolutionError,
  getGlobalSecretManager,
  resetGlobalSecretManager,
} from './secrets';
