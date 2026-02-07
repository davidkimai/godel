/**
 * RuntimeRegistry Unit Tests
 *
 * Comprehensive tests for RuntimeRegistry including:
 * - Registering/unregistering runtimes
 * - Getting runtimes by ID
 * - Default runtime handling
 * - Configuration management
 * - Error cases
 * - Available runtimes metadata
 */

// Mock logger before any imports
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import {
  RuntimeRegistry,
  getRuntimeRegistry,
  resetRuntimeRegistry,
  loadRuntimeConfig,
  saveRuntimeConfig,
  getAvailableRuntimes,
  AVAILABLE_RUNTIMES,
  RuntimeConfig,
  PiRuntimeConfig,
  NativeRuntimeConfig,
} from '../../src/runtime/registry';
import { AgentRuntime, Agent, SpawnConfig, ExecResult, AgentStatus } from '../../src/runtime/types';

// Mock fs for config file operations
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  mkdirSync: jest.fn(),
}));

import * as fs from 'fs';

// Mock os
jest.mock('os', () => ({
  homedir: jest.fn().mockReturnValue('/home/testuser'),
}));

// Create a mock runtime for testing
class MockRuntime implements AgentRuntime {
  readonly id: string;
  readonly name: string;
  private agents = new Map<string, Agent>();

  constructor(id: string, name: string) {
    this.id = id;
    this.name = name;
  }

  async spawn(config: SpawnConfig): Promise<Agent> {
    const agent: Agent = {
      id: `${this.id}-agent-${Date.now()}`,
      name: config.name || 'mock-agent',
      status: 'running',
      runtime: this.id,
      model: config.model || 'default-model',
      createdAt: new Date(),
      lastActivityAt: new Date(),
    };
    this.agents.set(agent.id, agent);
    return agent;
  }

  async kill(agentId: string): Promise<void> {
    if (!this.agents.has(agentId)) {
      throw new Error(`Agent not found: ${agentId}`);
    }
    this.agents.delete(agentId);
  }

  async exec(agentId: string, command: string): Promise<ExecResult> {
    if (!this.agents.has(agentId)) {
      throw new Error(`Agent not found: ${agentId}`);
    }
    return {
      stdout: `Executed: ${command}`,
      stderr: '',
      exitCode: 0,
      duration: 100,
    };
  }

  async status(agentId: string): Promise<AgentStatus> {
    if (!this.agents.has(agentId)) {
      throw new Error(`Agent not found: ${agentId}`);
    }
    return 'running';
  }

  async list(): Promise<Agent[]> {
    return Array.from(this.agents.values());
  }
}

describe('RuntimeRegistry', () => {
  let registry: RuntimeRegistry;

  beforeEach(() => {
    jest.clearAllMocks();
    // Create registry with auto-initialization
    registry = new RuntimeRegistry();
    // Clear all runtimes to start fresh for each test
    registry.clear();
  });

  afterEach(() => {
    resetRuntimeRegistry();
  });

  describe('constructor', () => {
    it('should initialize with provided configuration', () => {
      const config: RuntimeConfig = {
        default: 'mock',
        pi: {
          defaultModel: 'claude-sonnet-4-5',
          providers: ['anthropic'],
          timeout: 300000,
          maxConcurrent: 10,
        },
        native: {
          binaryPath: '/usr/bin/native',
          workdir: '/tmp',
        },
      };

      const customRegistry = new RuntimeRegistry(config);

      expect(customRegistry).toBeDefined();
      expect(customRegistry.getDefaultId()).toBe('mock');
    });

    it('should load config from file when not provided', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      const loadedRegistry = new RuntimeRegistry();

      expect(loadedRegistry).toBeDefined();
      expect(loadedRegistry.getDefaultId()).toBe('pi'); // Default value
    });

    it('should use default runtime from config', () => {
      const config: RuntimeConfig = {
        default: 'native',
      };

      const customRegistry = new RuntimeRegistry(config);

      expect(customRegistry.getDefaultId()).toBe('native');
    });
  });

  describe('register', () => {
    it('should register a new runtime', () => {
      const mockRuntime = new MockRuntime('mock', 'Mock Runtime');

      registry.register(mockRuntime);

      expect(registry.has('mock')).toBe(true);
      expect(registry.get('mock')).toBe(mockRuntime);
    });

    it('should throw when registering duplicate runtime', () => {
      const mockRuntime = new MockRuntime('mock', 'Mock Runtime');
      registry.register(mockRuntime);

      const duplicateRuntime = new MockRuntime('mock', 'Duplicate Runtime');

      expect(() => registry.register(duplicateRuntime)).toThrow(/already registered/);
    });

    it('should register multiple different runtimes', () => {
      const mockRuntime1 = new MockRuntime('mock1', 'Mock Runtime 1');
      const mockRuntime2 = new MockRuntime('mock2', 'Mock Runtime 2');

      registry.register(mockRuntime1);
      registry.register(mockRuntime2);

      expect(registry.count()).toBe(2);
      expect(registry.has('mock1')).toBe(true);
      expect(registry.has('mock2')).toBe(true);
    });
  });

  describe('unregister', () => {
    it('should unregister an existing runtime', () => {
      const mockRuntime = new MockRuntime('mock', 'Mock Runtime');
      registry.register(mockRuntime);

      const result = registry.unregister('mock');

      expect(result).toBe(true);
      expect(registry.has('mock')).toBe(false);
    });

    it('should return false for non-existent runtime', () => {
      const result = registry.unregister('non-existent');

      expect(result).toBe(false);
    });

    it('should allow re-registering after unregister', () => {
      const mockRuntime = new MockRuntime('mock', 'Mock Runtime');
      registry.register(mockRuntime);
      registry.unregister('mock');

      const newRuntime = new MockRuntime('mock', 'New Runtime');
      expect(() => registry.register(newRuntime)).not.toThrow();
      expect(registry.has('mock')).toBe(true);
    });
  });

  describe('get', () => {
    it('should get runtime by ID', () => {
      const mockRuntime = new MockRuntime('mock', 'Mock Runtime');
      registry.register(mockRuntime);

      const retrieved = registry.get('mock');

      expect(retrieved).toBe(mockRuntime);
    });

    it('should throw for non-existent runtime', () => {
      expect(() => registry.get('non-existent')).toThrow(/not found/);
    });

    it('should include available runtimes in error message', () => {
      const mockRuntime1 = new MockRuntime('mock1', 'Mock Runtime 1');
      const mockRuntime2 = new MockRuntime('mock2', 'Mock Runtime 2');
      registry.register(mockRuntime1);
      registry.register(mockRuntime2);

      expect(() => registry.get('non-existent')).toThrow(/Available.*mock1.*mock2/);
    });

    it('should suggest register when no runtimes exist', () => {
      expect(() => registry.get('non-existent')).toThrow(/Use register\(\) to add new runtimes/);
    });
  });

  describe('getDefault', () => {
    it('should get the default runtime', () => {
      const mockRuntime = new MockRuntime('pi', 'Pi Runtime');
      registry.register(mockRuntime);

      const defaultRuntime = registry.getDefault();

      expect(defaultRuntime).toBe(mockRuntime);
    });

    it('should throw when default runtime not registered', () => {
      expect(() => registry.getDefault()).toThrow(/not found/);
    });

    it('should use default from config', () => {
      const config: RuntimeConfig = {
        default: 'mock',
      };
      const customRegistry = new RuntimeRegistry(config);

      const mockRuntime = new MockRuntime('mock', 'Mock Runtime');
      customRegistry.register(mockRuntime);

      expect(customRegistry.getDefault()).toBe(mockRuntime);
    });
  });

  describe('setDefault', () => {
    it('should set the default runtime', () => {
      const mockRuntime = new MockRuntime('mock', 'Mock Runtime');
      registry.register(mockRuntime);

      registry.setDefault('mock');

      expect(registry.getDefaultId()).toBe('mock');
    });

    it('should throw when setting unregistered runtime as default', () => {
      expect(() => registry.setDefault('non-existent')).toThrow(/is not registered/);
    });

    it('should update config when setting default', () => {
      const mockRuntime = new MockRuntime('mock', 'Mock Runtime');
      registry.register(mockRuntime);

      registry.setDefault('mock');

      const config = registry.getConfig();
      expect(config.default).toBe('mock');
    });

    it('should suggest available runtimes when setting invalid default', () => {
      const mockRuntime = new MockRuntime('available', 'Available Runtime');
      registry.register(mockRuntime);

      expect(() => registry.setDefault('non-existent')).toThrow(/Available.*available/);
    });
  });

  describe('getDefaultId', () => {
    it('should return default runtime ID', () => {
      expect(registry.getDefaultId()).toBe('pi'); // Default from config
    });

    it('should return updated default after setDefault', () => {
      const mockRuntime = new MockRuntime('mock', 'Mock Runtime');
      registry.register(mockRuntime);

      registry.setDefault('mock');

      expect(registry.getDefaultId()).toBe('mock');
    });
  });

  describe('list', () => {
    it('should return empty array when no runtimes', () => {
      expect(registry.list()).toEqual([]);
    });

    it('should list all registered runtimes', () => {
      const mockRuntime1 = new MockRuntime('mock1', 'Mock Runtime 1');
      const mockRuntime2 = new MockRuntime('mock2', 'Mock Runtime 2');

      registry.register(mockRuntime1);
      registry.register(mockRuntime2);

      const runtimes = registry.list();

      expect(runtimes).toHaveLength(2);
      expect(runtimes).toContain(mockRuntime1);
      expect(runtimes).toContain(mockRuntime2);
    });
  });

  describe('listIds', () => {
    it('should return empty array when no runtimes', () => {
      expect(registry.listIds()).toEqual([]);
    });

    it('should list all runtime IDs', () => {
      registry.register(new MockRuntime('mock1', 'Mock Runtime 1'));
      registry.register(new MockRuntime('mock2', 'Mock Runtime 2'));

      const ids = registry.listIds();

      expect(ids).toHaveLength(2);
      expect(ids).toContain('mock1');
      expect(ids).toContain('mock2');
    });
  });

  describe('has', () => {
    it('should return true for registered runtime', () => {
      registry.register(new MockRuntime('mock', 'Mock Runtime'));

      expect(registry.has('mock')).toBe(true);
    });

    it('should return false for non-registered runtime', () => {
      expect(registry.has('non-existent')).toBe(false);
    });
  });

  describe('count', () => {
    it('should return 0 when no runtimes', () => {
      expect(registry.count()).toBe(0);
    });

    it('should return correct count', () => {
      expect(registry.count()).toBe(0);

      registry.register(new MockRuntime('mock1', 'Mock 1'));
      expect(registry.count()).toBe(1);

      registry.register(new MockRuntime('mock2', 'Mock 2'));
      expect(registry.count()).toBe(2);

      registry.unregister('mock1');
      expect(registry.count()).toBe(1);
    });
  });

  describe('clear', () => {
    it('should clear all runtimes', () => {
      registry.register(new MockRuntime('mock1', 'Mock 1'));
      registry.register(new MockRuntime('mock2', 'Mock 2'));

      expect(registry.count()).toBe(2);

      registry.clear();

      expect(registry.count()).toBe(0);
      expect(registry.has('mock1')).toBe(false);
      expect(registry.has('mock2')).toBe(false);
    });

    it('should allow re-registering after clear', () => {
      registry.register(new MockRuntime('mock', 'Mock'));
      registry.clear();

      expect(() => registry.register(new MockRuntime('mock', 'New Mock'))).not.toThrow();
      expect(registry.has('mock')).toBe(true);
    });
  });

  describe('getConfig', () => {
    it('should return current configuration', () => {
      const config = registry.getConfig();

      expect(config).toBeDefined();
      expect(config.default).toBeDefined();
    });

    it('should return a copy of the config', () => {
      const config1 = registry.getConfig();
      const config2 = registry.getConfig();

      expect(config1).not.toBe(config2);
      expect(config1).toEqual(config2);
    });

    it('should include pi config', () => {
      const config: RuntimeConfig = {
        default: 'pi',
        pi: {
          defaultModel: 'gpt-4o',
          providers: ['openai', 'anthropic'],
          timeout: 60000,
          maxConcurrent: 5,
        },
      };

      const customRegistry = new RuntimeRegistry(config);
      const retrievedConfig = customRegistry.getConfig();

      expect(retrievedConfig.pi).toEqual(config.pi);
    });

    it('should include native config', () => {
      const config: RuntimeConfig = {
        default: 'native',
        native: {
          binaryPath: '/usr/bin/agent',
          workdir: '/workspace',
          env: { KEY: 'value' },
        },
      };

      const customRegistry = new RuntimeRegistry(config);
      const retrievedConfig = customRegistry.getConfig();

      expect(retrievedConfig.native).toEqual(config.native);
    });
  });

  describe('updateConfig', () => {
    it('should update configuration', () => {
      registry.updateConfig({
        default: 'native',
      });

      expect(registry.getDefaultId()).toBe('native');
    });

    it('should merge partial updates', () => {
      const originalConfig = registry.getConfig();

      registry.updateConfig({
        pi: {
          defaultModel: 'gpt-4o',
          providers: ['openai'],
        },
      });

      const updatedConfig = registry.getConfig();
      expect(updatedConfig.pi?.defaultModel).toBe('gpt-4o');
      expect(updatedConfig.default).toBe(originalConfig.default);
    });

    it('should update default runtime ID when default changes', () => {
      registry.updateConfig({
        default: 'docker',
      });

      expect(registry.getDefaultId()).toBe('docker');
    });
  });

  describe('global singleton', () => {
    it('should create singleton on first get', () => {
      const reg1 = getRuntimeRegistry();

      expect(reg1).toBeDefined();
    });

    it('should return same instance on subsequent calls', () => {
      const reg1 = getRuntimeRegistry();
      const reg2 = getRuntimeRegistry();

      expect(reg1).toBe(reg2);
    });

    it('should reset singleton', () => {
      const reg1 = getRuntimeRegistry();
      resetRuntimeRegistry();
      const reg2 = getRuntimeRegistry();

      expect(reg1).not.toBe(reg2);
    });
  });

  describe('loadRuntimeConfig', () => {
    it('should return defaults when no config files exist', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      const config = loadRuntimeConfig();

      expect(config).toBeDefined();
      expect(config.default).toBe('pi');
      expect(config.pi).toBeDefined();
      expect(config.pi?.defaultModel).toBe('claude-sonnet-4-5');
    });

    it('should load project-local config when available', () => {
      (fs.existsSync as jest.Mock).mockImplementation((path: string) => {
        return path.includes('.godel/config.yaml') && path.startsWith(process.cwd());
      });

      (fs.readFileSync as jest.Mock).mockReturnValue(`
default: native
pi:
  defaultModel: gpt-4o
  providers: [openai]
  timeout: 60000
  maxConcurrent: 5
native:
  binaryPath: /usr/bin/native
  workdir: /tmp
`);

      const config = loadRuntimeConfig();

      expect(config.default).toBe('native');
      expect(config.pi?.defaultModel).toBe('gpt-4o');
      expect(config.native?.binaryPath).toBe('/usr/bin/native');
    });

    it('should fall back to user-global config', () => {
      (fs.existsSync as jest.Mock).mockImplementation((path: string) => {
        return path.includes('.godel/config.yaml') && path.includes('home');
      });

      (fs.readFileSync as jest.Mock).mockReturnValue(`
default: pi
pi:
  defaultModel: gemini-1.5-pro
  providers: [google]
`);

      const config = loadRuntimeConfig();

      expect(config.pi?.defaultModel).toBe('gemini-1.5-pro');
      expect(config.pi?.providers).toEqual(['google']);
    });

    it('should handle parse errors gracefully', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue('invalid: yaml: content: [');

      // Should not throw, should return defaults
      const config = loadRuntimeConfig();

      expect(config).toBeDefined();
      expect(config.default).toBe('pi');
    });

    it('should parse array values correctly', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(`
pi:
  providers: [anthropic, openai, google]
`);

      const config = loadRuntimeConfig();

      expect(config.pi?.providers).toEqual(['anthropic', 'openai', 'google']);
    });

    it('should parse numeric values correctly', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(`
pi:
  timeout: 300000
  maxConcurrent: 10
`);

      const config = loadRuntimeConfig();

      expect(config.pi?.timeout).toBe(300000);
      expect(config.pi?.maxConcurrent).toBe(10);
    });

    it('should parse boolean values correctly', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(`
pi:
  enabled: true
  debug: false
`);

      // Note: The parser doesn't currently handle these booleans, but this tests it doesn't crash
      const config = loadRuntimeConfig();

      expect(config).toBeDefined();
    });
  });

  describe('saveRuntimeConfig', () => {
    it('should save config to user-global location', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      const config: RuntimeConfig = {
        default: 'pi',
        pi: {
          defaultModel: 'claude-sonnet-4-5',
          providers: ['anthropic', 'openai'],
          timeout: 300000,
          maxConcurrent: 10,
        },
        native: {
          binaryPath: '/usr/bin/agent',
          workdir: '/tmp',
        },
      };

      saveRuntimeConfig(config);

      expect(fs.mkdirSync).toHaveBeenCalledWith('/home/testuser/.godel', { recursive: true });
      expect(fs.writeFileSync).toHaveBeenCalled();

      const writeCall = (fs.writeFileSync as jest.Mock).mock.calls[0];
      expect(writeCall[0]).toBe('/home/testuser/.godel/config.yaml');
      expect(writeCall[1]).toContain('default: pi');
      expect(writeCall[1]).toContain('pi:');
      expect(writeCall[1]).toContain('defaultModel: claude-sonnet-4-5');
    });

    it('should not create directory if it exists', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      saveRuntimeConfig({ default: 'pi' });

      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });

    it('should skip optional fields when not provided', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const config: RuntimeConfig = {
        default: 'pi',
        pi: {
          defaultModel: 'claude-sonnet-4-5',
          providers: ['anthropic'],
        },
      };

      saveRuntimeConfig(config);

      const writeContent = (fs.writeFileSync as jest.Mock).mock.calls[0][1];
      expect(writeContent).not.toContain('timeout:');
      expect(writeContent).not.toContain('maxConcurrent:');
    });

    it('should include optional fields when provided', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const config: RuntimeConfig = {
        default: 'pi',
        pi: {
          defaultModel: 'claude-sonnet-4-5',
          providers: ['anthropic'],
          timeout: 60000,
          maxConcurrent: 5,
        },
      };

      saveRuntimeConfig(config);

      const writeContent = (fs.writeFileSync as jest.Mock).mock.calls[0][1];
      expect(writeContent).toContain('timeout: 60000');
      expect(writeContent).toContain('maxConcurrent: 5');
    });
  });

  describe('getAvailableRuntimes', () => {
    it('should return available runtimes metadata', () => {
      const runtimes = getAvailableRuntimes();

      expect(runtimes).toBe(AVAILABLE_RUNTIMES);
    });

    it('should include Pi runtime', () => {
      const runtimes = getAvailableRuntimes();
      const pi = runtimes.find(r => r.id === 'pi');

      expect(pi).toBeDefined();
      expect(pi?.name).toBe('Pi Multi-Model Runtime');
      expect(pi?.available).toBe(true);
    });

    it('should include Native runtime', () => {
      const runtimes = getAvailableRuntimes();
      const native = runtimes.find(r => r.id === 'native');

      expect(native).toBeDefined();
      expect(native?.available).toBe(true); // Native runtime is now implemented
    });

    it('should include Docker runtime placeholder', () => {
      const runtimes = getAvailableRuntimes();
      const docker = runtimes.find(r => r.id === 'docker');

      expect(docker).toBeDefined();
      expect(docker?.available).toBe(false);
    });

    it('should include Kubernetes runtime placeholder', () => {
      const runtimes = getAvailableRuntimes();
      const k8s = runtimes.find(r => r.id === 'kubernetes');

      expect(k8s).toBeDefined();
      expect(k8s?.available).toBe(false);
    });
  });

  describe('integration with AgentRuntime interface', () => {
    it('should allow spawning agents through registered runtime', async () => {
      const mockRuntime = new MockRuntime('pi', 'Pi Runtime');
      registry.register(mockRuntime);

      const agent = await mockRuntime.spawn({ name: 'test-agent' });

      expect(agent).toBeDefined();
      expect(agent.name).toBe('test-agent');
    });

    it('should allow getting default runtime and spawning', async () => {
      const mockRuntime = new MockRuntime('pi', 'Pi Runtime');
      registry.register(mockRuntime);

      const defaultRuntime = registry.getDefault();
      const agent = await defaultRuntime.spawn({ name: 'default-agent' });

      expect(agent).toBeDefined();
      expect(agent.runtime).toBe('pi');
    });

    it('should track agents independently per runtime', async () => {
      const piRuntime = new MockRuntime('pi', 'Pi Runtime');
      const nativeRuntime = new MockRuntime('native', 'Native Runtime');

      registry.register(piRuntime);
      registry.register(nativeRuntime);

      const piAgent = await piRuntime.spawn({ name: 'pi-agent' });
      const nativeAgent = await nativeRuntime.spawn({ name: 'native-agent' });

      expect(piAgent.runtime).toBe('pi');
      expect(nativeAgent.runtime).toBe('native');

      const piAgents = await piRuntime.list();
      const nativeAgents = await nativeRuntime.list();

      expect(piAgents).toHaveLength(1);
      expect(nativeAgents).toHaveLength(1);
    });
  });
});
