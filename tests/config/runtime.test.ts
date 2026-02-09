/**
 * Runtime Configuration Tests
 * 
 * Comprehensive test suite for the runtime configuration system.
 * Tests schema validation, environment variable loading, and configuration resolution.
 */

import {
  RuntimeTypeSchema,
  ResourceLimitsSchema,
  AgentRuntimeConfigSchema,
  TeamRuntimeConfigSchema,
  RuntimeFeatureFlagsSchema,
  GlobalRuntimeConfigSchema,
  RuntimeConfigManager,
  createRuntimeConfig,
  validateRuntimeConfig,
  defaultResourceLimits,
  defaultFeatureFlags,
  defaultRuntimeConfig,
  RuntimeEnvVars,
} from '../../src/config/runtime';
import type { GlobalRuntimeConfig, TeamRuntimeConfig, AgentRuntimeConfig } from '../../src/config/runtime';
import type { RuntimeType } from '../../src/core/runtime/runtime-provider';

describe('Runtime Configuration', () => {
  // Save original environment
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment before each test
    process.env = { ...originalEnv };
    
    // Clear runtime-specific environment variables
    Object.keys(process.env).forEach(key => {
      if (key.startsWith('GODEL_')) {
        delete process.env[key];
      }
    });
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // ZOD SCHEMA VALIDATION TESTS
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('RuntimeTypeSchema', () => {
    it('should validate valid runtime types', () => {
      expect(RuntimeTypeSchema.parse('worktree')).toBe('worktree');
      expect(RuntimeTypeSchema.parse('kata')).toBe('kata');
      expect(RuntimeTypeSchema.parse('e2b')).toBe('e2b');
    });

    it('should reject invalid runtime types', () => {
      expect(() => RuntimeTypeSchema.parse('invalid')).toThrow();
      expect(() => RuntimeTypeSchema.parse('docker')).toThrow();
      expect(() => RuntimeTypeSchema.parse('')).toThrow();
    });

    it('should reject non-string values', () => {
      expect(() => RuntimeTypeSchema.parse(123)).toThrow();
      expect(() => RuntimeTypeSchema.parse(null)).toThrow();
      expect(() => RuntimeTypeSchema.parse(undefined)).toThrow();
    });
  });

  describe('ResourceLimitsSchema', () => {
    it('should validate valid resource limits', () => {
      const valid = {
        cpu: 2,
        memory: '1Gi',
        disk: '10Gi',
        agents: 5,
      };
      const result = ResourceLimitsSchema.parse(valid);
      expect(result.cpu).toBe(2);
      expect(result.memory).toBe('1Gi');
      expect(result.disk).toBe('10Gi');
      expect(result.agents).toBe(5);
    });

    it('should validate with optional fields omitted', () => {
      const minimal = {
        cpu: 1,
        memory: '512Mi',
      };
      const result = ResourceLimitsSchema.parse(minimal);
      expect(result.cpu).toBe(1);
      expect(result.memory).toBe('512Mi');
      expect(result.disk).toBeUndefined();
      expect(result.agents).toBeUndefined();
    });

    it('should reject invalid CPU values', () => {
      expect(() => ResourceLimitsSchema.parse({ cpu: 0, memory: '512Mi' })).toThrow();
      expect(() => ResourceLimitsSchema.parse({ cpu: -1, memory: '512Mi' })).toThrow();
      expect(() => ResourceLimitsSchema.parse({ cpu: 200, memory: '512Mi' })).toThrow();
      expect(() => ResourceLimitsSchema.parse({ cpu: '1', memory: '512Mi' })).toThrow();
    });

    it('should reject invalid memory formats', () => {
      expect(() => ResourceLimitsSchema.parse({ cpu: 1, memory: '512' })).toThrow();
      expect(() => ResourceLimitsSchema.parse({ cpu: 1, memory: '512MB' })).toThrow();
      expect(() => ResourceLimitsSchema.parse({ cpu: 1, memory: '' })).toThrow();
      expect(() => ResourceLimitsSchema.parse({ cpu: 1, memory: 512 })).toThrow();
    });

    it('should reject invalid disk formats', () => {
      expect(() => ResourceLimitsSchema.parse({ cpu: 1, memory: '512Mi', disk: '10' })).toThrow();
      expect(() => ResourceLimitsSchema.parse({ cpu: 1, memory: '512Mi', disk: 10 })).toThrow();
    });

    it('should reject invalid agent counts', () => {
      expect(() => ResourceLimitsSchema.parse({ cpu: 1, memory: '512Mi', agents: 0 })).toThrow();
      expect(() => ResourceLimitsSchema.parse({ cpu: 1, memory: '512Mi', agents: -5 })).toThrow();
      expect(() => ResourceLimitsSchema.parse({ cpu: 1, memory: '512Mi', agents: 10000 })).toThrow();
      expect(() => ResourceLimitsSchema.parse({ cpu: 1, memory: '512Mi', agents: 1.5 })).toThrow();
    });
  });

  describe('AgentRuntimeConfigSchema', () => {
    it('should validate valid agent config', () => {
      const valid: AgentRuntimeConfig = {
        runtime: 'kata',
        resources: { cpu: 2, memory: '1Gi' },
        timeout: 300,
        env: { KEY: 'value' },
        labels: { team: 'backend' },
      };
      const result = AgentRuntimeConfigSchema.parse(valid);
      expect(result.runtime).toBe('kata');
      expect(result.timeout).toBe(300);
    });

    it('should validate empty agent config', () => {
      const result = AgentRuntimeConfigSchema.parse({});
      expect(result).toEqual({});
    });

    it('should reject invalid timeout values', () => {
      expect(() => AgentRuntimeConfigSchema.parse({ timeout: 0 })).toThrow();
      expect(() => AgentRuntimeConfigSchema.parse({ timeout: -1 })).toThrow();
      expect(() => AgentRuntimeConfigSchema.parse({ timeout: 90000 })).toThrow();
      expect(() => AgentRuntimeConfigSchema.parse({ timeout: 1.5 })).toThrow();
    });
  });

  describe('TeamRuntimeConfigSchema', () => {
    it('should validate valid team config', () => {
      const valid: TeamRuntimeConfig = {
        runtime: 'kata',
        resources: { cpu: 4, memory: '8Gi' },
        budget: 1000,
        enabledRuntimes: ['worktree', 'kata'],
        defaultTimeout: 600,
      };
      const result = TeamRuntimeConfigSchema.parse(valid);
      expect(result.runtime).toBe('kata');
      expect(result.budget).toBe(1000);
      expect(result.enabledRuntimes).toEqual(['worktree', 'kata']);
    });

    it('should validate with minimal required fields', () => {
      const minimal = {
        runtime: 'worktree',
        resources: { cpu: 1, memory: '512Mi' },
      };
      const result = TeamRuntimeConfigSchema.parse(minimal);
      expect(result.runtime).toBe('worktree');
      expect(result.budget).toBeUndefined();
    });

    it('should reject negative budget', () => {
      expect(() => TeamRuntimeConfigSchema.parse({
        runtime: 'worktree',
        resources: { cpu: 1, memory: '512Mi' },
        budget: -100,
      })).toThrow();
    });

    it('should reject empty enabled runtimes', () => {
      expect(() => TeamRuntimeConfigSchema.parse({
        runtime: 'worktree',
        resources: { cpu: 1, memory: '512Mi' },
        enabledRuntimes: [],
      })).toThrow();
    });
  });

  describe('RuntimeFeatureFlagsSchema', () => {
    it('should use defaults for empty object', () => {
      const result = RuntimeFeatureFlagsSchema.parse({});
      expect(result.kataEnabled).toBe(false);
      expect(result.e2bEnabled).toBe(false);
      expect(result.worktreeEnabled).toBe(true);
      expect(result.autoFallback).toBe(true);
    });

    it('should allow overriding defaults', () => {
      const result = RuntimeFeatureFlagsSchema.parse({
        kataEnabled: true,
        e2bEnabled: true,
      });
      expect(result.kataEnabled).toBe(true);
      expect(result.e2bEnabled).toBe(true);
      expect(result.worktreeEnabled).toBe(true);
    });
  });

  describe('GlobalRuntimeConfigSchema', () => {
    it('should validate valid global config', () => {
      const valid: GlobalRuntimeConfig = {
        defaultRuntime: 'kata',
        availableRuntimes: ['worktree', 'kata'],
        teams: {
          backend: {
            runtime: 'kata',
            resources: { cpu: 4, memory: '8Gi' },
          },
        },
        features: {
          kataEnabled: true,
          worktreeEnabled: true,
        },
        globalResources: { cpu: 2, memory: '4Gi' },
        fallbackChain: ['kata', 'worktree'],
      };
      const result = GlobalRuntimeConfigSchema.parse(valid);
      expect(result.defaultRuntime).toBe('kata');
      expect(result.availableRuntimes).toEqual(['worktree', 'kata']);
    });

    it('should reject empty available runtimes', () => {
      expect(() => GlobalRuntimeConfigSchema.parse({
        defaultRuntime: 'worktree',
        availableRuntimes: [],
      })).toThrow();
    });

    it('should reject empty fallback chain', () => {
      expect(() => GlobalRuntimeConfigSchema.parse({
        defaultRuntime: 'worktree',
        availableRuntimes: ['worktree'],
        fallbackChain: [],
      })).toThrow();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // ENVIRONMENT VARIABLE TESTS
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('Environment Variable Loading', () => {
    it('should load default runtime from environment', () => {
      process.env.GODEL_DEFAULT_RUNTIME = 'kata';
      const manager = new RuntimeConfigManager();
      expect(manager.getConfig().defaultRuntime).toBe('kata');
    });

    it('should ignore invalid default runtime from environment', () => {
      process.env.GODEL_DEFAULT_RUNTIME = 'invalid';
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const manager = new RuntimeConfigManager();
      expect(manager.getConfig().defaultRuntime).toBe('worktree');
      consoleSpy.mockRestore();
    });

    it('should load feature flags from environment', () => {
      process.env.GODEL_KATA_ENABLED = 'true';
      process.env.GODEL_E2B_ENABLED = 'true';
      process.env.GODEL_WORKTREE_ENABLED = 'true';
      
      const manager = new RuntimeConfigManager();
      const config = manager.getConfig();
      
      expect(config.features.kataEnabled).toBe(true);
      expect(config.features.e2bEnabled).toBe(true);
      expect(config.features.worktreeEnabled).toBe(true);
      expect(config.availableRuntimes).toContain('kata');
      expect(config.availableRuntimes).toContain('e2b');
      expect(config.availableRuntimes).toContain('worktree');
    });

    it('should load numeric feature flags from environment', () => {
      process.env.GODEL_KATA_ENABLED = '1';
      process.env.GODEL_E2B_ENABLED = '0';
      
      const manager = new RuntimeConfigManager();
      const config = manager.getConfig();
      
      expect(config.features.kataEnabled).toBe(true);
      expect(config.features.e2bEnabled).toBe(false);
    });

    it('should load global resources from environment', () => {
      process.env.GODEL_DEFAULT_CPU = '4';
      process.env.GODEL_DEFAULT_MEMORY = '8Gi';
      process.env.GODEL_DEFAULT_DISK = '50Gi';
      
      const manager = new RuntimeConfigManager();
      const config = manager.getConfig();
      
      expect(config.globalResources?.cpu).toBe(4);
      expect(config.globalResources?.memory).toBe('8Gi');
      expect(config.globalResources?.disk).toBe('50Gi');
    });

    it('should load team-specific runtime from environment', () => {
      process.env.GODEL_TEAM_BACKEND_RUNTIME = 'kata';
      process.env.GODEL_TEAM_FRONTEND_RUNTIME = 'e2b';
      
      const manager = new RuntimeConfigManager();
      
      expect(manager.getTeamConfig('backend').runtime).toBe('kata');
      expect(manager.getTeamConfig('frontend').runtime).toBe('e2b');
    });

    it('should load team-specific budget from environment', () => {
      process.env.GODEL_TEAM_BACKEND_BUDGET = '5000';
      
      const manager = new RuntimeConfigManager();
      expect(manager.getTeamConfig('backend').budget).toBe(5000);
    });

    it('should load team-specific resources from environment', () => {
      process.env.GODEL_TEAM_BACKEND_CPU = '8';
      process.env.GODEL_TEAM_BACKEND_MEMORY = '16Gi';
      
      const manager = new RuntimeConfigManager();
      const teamConfig = manager.getTeamConfig('backend');
      
      expect(teamConfig.resources.cpu).toBe(8);
      expect(teamConfig.resources.memory).toBe('16Gi');
    });

    it('should handle team names with underscores and mixed case', () => {
      process.env.GODEL_TEAM_INFRA_STRUCTURE_RUNTIME = 'kata';
      process.env.GODEL_TEAM_ML_Team_CPU = '16';
      
      const manager = new RuntimeConfigManager();
      
      expect(manager.getTeamConfig('infra_structure').runtime).toBe('kata');
      expect(manager.getTeamConfig('ml_team').resources.cpu).toBe(16);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // RUNTIME CONFIG MANAGER TESTS
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('RuntimeConfigManager', () => {
    it('should create with default configuration', () => {
      const manager = new RuntimeConfigManager();
      const config = manager.getConfig();
      
      expect(config.defaultRuntime).toBe('worktree');
      expect(config.availableRuntimes).toEqual(['worktree']);
      expect(config.teams).toEqual({});
    });

    it('should create with custom configuration', () => {
      const custom: Partial<GlobalRuntimeConfig> = {
        defaultRuntime: 'kata',
        availableRuntimes: ['worktree', 'kata'],
      };
      
      const manager = new RuntimeConfigManager(custom);
      const config = manager.getConfig();
      
      expect(config.defaultRuntime).toBe('kata');
      expect(config.availableRuntimes).toEqual(['worktree', 'kata']);
    });

    it('should merge with environment variables', () => {
      process.env.GODEL_DEFAULT_RUNTIME = 'e2b';
      
      const custom: Partial<GlobalRuntimeConfig> = {
        defaultRuntime: 'kata',
      };
      
      const manager = new RuntimeConfigManager(custom);
      // Environment should override initial config
      expect(manager.getConfig().defaultRuntime).toBe('e2b');
    });

    it('should return team configuration with defaults', () => {
      const manager = new RuntimeConfigManager();
      const teamConfig = manager.getTeamConfig('nonexistent');
      
      expect(teamConfig.runtime).toBe('worktree');
      expect(teamConfig.resources.cpu).toBe(defaultResourceLimits.cpu);
    });

    it('should return configured team settings', () => {
      const custom: Partial<GlobalRuntimeConfig> = {
        teams: {
          backend: {
            runtime: 'kata',
            resources: { cpu: 4, memory: '8Gi' },
            budget: 1000,
          },
        },
      };
      
      const manager = new RuntimeConfigManager(custom);
      const teamConfig = manager.getTeamConfig('backend');
      
      expect(teamConfig.runtime).toBe('kata');
      expect(teamConfig.resources.cpu).toBe(4);
      expect(teamConfig.budget).toBe(1000);
    });

    it('should return agent configuration with defaults', () => {
      const manager = new RuntimeConfigManager();
      const agentConfig = manager.getAgentConfig('team1', 'agent1');
      
      expect(agentConfig.runtime).toBe('worktree');
      expect(agentConfig.resources).toBeDefined();
    });

    it('should return configured agent settings', () => {
      const custom: Partial<GlobalRuntimeConfig> = {
        teams: {
          backend: {
            runtime: 'kata',
            resources: { cpu: 4, memory: '8Gi' },
            agents: {
              worker1: {
                runtime: 'e2b',
                resources: { cpu: 2, memory: '4Gi' },
                timeout: 300,
              },
            },
          },
        },
      };
      
      const manager = new RuntimeConfigManager(custom);
      const agentConfig = manager.getAgentConfig('backend', 'worker1');
      
      expect(agentConfig.runtime).toBe('e2b');
      expect(agentConfig.resources?.cpu).toBe(2);
      expect(agentConfig.timeout).toBe(300);
    });

    it('should resolve runtime type for team', () => {
      const custom: Partial<GlobalRuntimeConfig> = {
        defaultRuntime: 'worktree',
        availableRuntimes: ['worktree', 'kata'],
        teams: {
          backend: {
            runtime: 'kata',
            resources: { cpu: 4, memory: '8Gi' },
          },
        },
      };
      
      const manager = new RuntimeConfigManager(custom);
      
      expect(manager.resolveRuntimeType('backend')).toBe('kata');
      expect(manager.resolveRuntimeType('frontend')).toBe('worktree');
    });

    it('should resolve runtime type for agent', () => {
      const custom: Partial<GlobalRuntimeConfig> = {
        availableRuntimes: ['worktree', 'kata', 'e2b'],
        teams: {
          backend: {
            runtime: 'kata',
            resources: { cpu: 4, memory: '8Gi' },
            agents: {
              special: {
                runtime: 'e2b',
              },
            },
          },
        },
      };
      
      const manager = new RuntimeConfigManager(custom);
      
      expect(manager.resolveRuntimeType('backend', 'special')).toBe('e2b');
      expect(manager.resolveRuntimeType('backend', 'default')).toBe('kata');
    });

    it('should check runtime availability', () => {
      const manager = new RuntimeConfigManager();
      
      expect(manager.isRuntimeAvailable('worktree')).toBe(true);
      expect(manager.isRuntimeAvailable('kata')).toBe(false);
      expect(manager.isRuntimeAvailable('e2b')).toBe(false);
    });

    it('should return fallback chain', () => {
      process.env.GODEL_KATA_ENABLED = 'true';
      process.env.GODEL_E2B_ENABLED = 'true';
      
      const manager = new RuntimeConfigManager();
      const chain = manager.getFallbackChain();
      
      expect(chain).toContain('kata');
      expect(chain).toContain('e2b');
      expect(chain).toContain('worktree');
      expect(chain[chain.length - 1]).toBe('worktree'); // worktree is always last
    });

    it('should return validation error status', () => {
      const manager = new RuntimeConfigManager();
      
      expect(manager.hasValidationErrors()).toBe(false);
      expect(manager.getValidationErrors()).toEqual([]);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // HELPER FUNCTION TESTS
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('createRuntimeConfig', () => {
    it('should create config manager with defaults', () => {
      const manager = createRuntimeConfig();
      expect(manager).toBeInstanceOf(RuntimeConfigManager);
      expect(manager.getConfig().defaultRuntime).toBe('worktree');
    });

    it('should create config manager with custom config', () => {
      const manager = createRuntimeConfig({ defaultRuntime: 'kata' });
      expect(manager.getConfig().defaultRuntime).toBe('kata');
    });
  });

  describe('validateRuntimeConfig', () => {
    it('should validate valid configuration', () => {
      const valid: GlobalRuntimeConfig = {
        defaultRuntime: 'kata',
        availableRuntimes: ['worktree', 'kata'],
        teams: {},
        features: defaultFeatureFlags,
      };
      
      const result = validateRuntimeConfig(valid);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.defaultRuntime).toBe('kata');
      }
    });

    it('should reject invalid configuration', () => {
      const invalid = {
        defaultRuntime: 'invalid',
        availableRuntimes: [],
      };
      
      const result = validateRuntimeConfig(invalid);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors.some(e => e.path.includes('defaultRuntime'))).toBe(true);
        expect(result.errors.some(e => e.path.includes('availableRuntimes'))).toBe(true);
      }
    });

    it('should return detailed error paths', () => {
      const invalid = {
        defaultRuntime: 'worktree',
        availableRuntimes: ['worktree'],
        teams: {
          badteam: {
            runtime: 'invalid',
            resources: { cpu: -1, memory: 'bad' },
          },
        },
      };
      
      const result = validateRuntimeConfig(invalid);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.errors.map(e => e.path);
        expect(paths.some(p => p.includes('teams.badteam.runtime'))).toBe(true);
        expect(paths.some(p => p.includes('teams.badteam.resources.cpu'))).toBe(true);
        expect(paths.some(p => p.includes('teams.badteam.resources.memory'))).toBe(true);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // DEFAULT VALUES TESTS
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('Default Values', () => {
    it('should export default resource limits', () => {
      expect(defaultResourceLimits.cpu).toBe(1);
      expect(defaultResourceLimits.memory).toBe('512Mi');
      expect(defaultResourceLimits.disk).toBe('10Gi');
      expect(defaultResourceLimits.agents).toBe(10);
    });

    it('should export default feature flags', () => {
      expect(defaultFeatureFlags.kataEnabled).toBe(false);
      expect(defaultFeatureFlags.e2bEnabled).toBe(false);
      expect(defaultFeatureFlags.worktreeEnabled).toBe(true);
      expect(defaultFeatureFlags.autoFallback).toBe(true);
      expect(defaultFeatureFlags.enforceResourceLimits).toBe(true);
      expect(defaultFeatureFlags.snapshotEnabled).toBe(true);
      expect(defaultFeatureFlags.healthChecksEnabled).toBe(true);
    });

    it('should export default runtime config', () => {
      expect(defaultRuntimeConfig.defaultRuntime).toBe('worktree');
      expect(defaultRuntimeConfig.availableRuntimes).toEqual(['worktree']);
      expect(defaultRuntimeConfig.teams).toEqual({});
      expect(defaultRuntimeConfig.fallbackChain).toEqual(['worktree']);
    });

    it('should export environment variable mapping', () => {
      expect(RuntimeEnvVars.DEFAULT_RUNTIME).toBe('GODEL_DEFAULT_RUNTIME');
      expect(RuntimeEnvVars.KATA_ENABLED).toBe('GODEL_KATA_ENABLED');
      expect(RuntimeEnvVars.E2B_ENABLED).toBe('GODEL_E2B_ENABLED');
      expect(RuntimeEnvVars.TEAM_RUNTIME_PREFIX).toBe('GODEL_TEAM_');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // EDGE CASE TESTS
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('Edge Cases', () => {
    it('should handle empty team configuration gracefully', () => {
      const manager = new RuntimeConfigManager({ teams: {} });
      const teamConfig = manager.getTeamConfig('anyteam');
      
      expect(teamConfig.runtime).toBe('worktree');
      expect(teamConfig.resources).toBeDefined();
    });

    it('should handle null/undefined values in config', () => {
      const custom: Partial<GlobalRuntimeConfig> = {
        defaultRuntime: 'kata',
        availableRuntimes: ['kata'],
        teams: {
          test: {
            runtime: 'kata',
            resources: { cpu: 1, memory: '512Mi' },
            budget: undefined,
            agents: undefined,
          },
        },
      };
      
      const manager = new RuntimeConfigManager(custom);
      const config = manager.getConfig();
      
      expect(config.defaultRuntime).toBe('kata');
      expect(config.teams.test.budget).toBeUndefined();
    });

    it('should validate memory formats case-insensitively', () => {
      expect(() => ResourceLimitsSchema.parse({ cpu: 1, memory: '1Gi' })).not.toThrow();
      expect(() => ResourceLimitsSchema.parse({ cpu: 1, memory: '1gi' })).not.toThrow();
      expect(() => ResourceLimitsSchema.parse({ cpu: 1, memory: '1GI' })).not.toThrow();
    });

    it('should handle fractional CPU values', () => {
      const result = ResourceLimitsSchema.parse({ cpu: 0.5, memory: '256Mi' });
      expect(result.cpu).toBe(0.5);
      
      const result2 = ResourceLimitsSchema.parse({ cpu: 1.5, memory: '256Mi' });
      expect(result2.cpu).toBe(1.5);
    });

    it('should prevent resource exhaustion with high CPU values', () => {
      expect(() => ResourceLimitsSchema.parse({ cpu: 129, memory: '512Mi' })).toThrow();
      // Memory format is validated, but magnitude is not limited (128 cores max for CPU)
      const result = ResourceLimitsSchema.parse({ cpu: 1, memory: '1000000Mi' });
      expect(result.memory).toBe('1000000Mi');
    });

    it('should handle concurrent team configs from env and initial', () => {
      process.env.GODEL_TEAM_ALPHA_BUDGET = '500';
      
      const custom: Partial<GlobalRuntimeConfig> = {
        teams: {
          alpha: {
            runtime: 'kata',
            resources: { cpu: 4, memory: '8Gi' },
          },
          beta: {
            runtime: 'e2b',
            resources: { cpu: 2, memory: '4Gi' },
          },
        },
      };
      
      const manager = new RuntimeConfigManager(custom);
      
      // Alpha should have merged config (runtime from initial, budget from env)
      const alphaConfig = manager.getTeamConfig('alpha');
      expect(alphaConfig.runtime).toBe('kata');
      expect(alphaConfig.budget).toBe(500);
      
      // Beta should only have initial config
      const betaConfig = manager.getTeamConfig('beta');
      expect(betaConfig.runtime).toBe('e2b');
      expect(betaConfig.budget).toBeUndefined();
    });
  });
});
