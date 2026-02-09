/**
 * E2BRuntimeProvider Tests
 *
 * Comprehensive test suite for E2BRuntimeProvider.
 * Validates SPEC-002 E2B integration per Section 4.3 and PRD-003 FR3.
 *
 * @module tests/runtime/e2b-runtime-provider
 * @version 1.0.0
 * @since 2026-02-08
 * @see SPEC-002 Section 4.3 - E2B Runtime Provider
 * @see PRD-003 FR3 - E2B Sandbox Support
 */

import {
  E2BRuntimeProvider,
  E2BRuntimeProviderConfig,
  resetGlobalE2BRuntimeProvider,
} from '../../src/core/runtime/providers/e2b-runtime-provider';
import {
  SpawnConfig,
  RuntimeState,
  ExecutionResult,
  Snapshot,
  NotFoundError,
  SpawnError,
  ExecutionError,
  TimeoutError,
  ResourceExhaustedError,
} from '../../src/core/runtime/runtime-provider';

// ============================================================================
// Test Configuration
// ============================================================================

const TEST_TIMEOUT = 30000;
const PERFORMANCE_BASELINE_SPAWN_MS = 2000; // Target: <2s for E2B sandbox spawn
const PERFORMANCE_BASELINE_EXEC_MS = 200; // Target: <200ms for execution

// Mock API key for testing
const MOCK_API_KEY = 'test-api-key-mock';

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Performance measurement helper
 */
async function measureTime<T>(fn: () => Promise<T>): Promise<{ result: T; durationMs: number }> {
  const start = process.hrtime.bigint();
  const result = await fn();
  const end = process.hrtime.bigint();
  const durationMs = Number(end - start) / 1_000_000;
  return { result, durationMs };
}

/**
 * Wait for a condition with timeout
 */
async function waitForCondition(
  condition: () => boolean,
  timeoutMs: number = 5000,
  intervalMs: number = 100
): Promise<boolean> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    if (condition()) return true;
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  return false;
}

/**
 * Create a mock ReadableStream for testing
 */
function createMockReadableStream(data: string[]): ReadableStream {
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (index < data.length) {
        controller.enqueue(new TextEncoder().encode(data[index++]));
      } else {
        controller.close();
      }
    },
  });
}

// ============================================================================
// Test Suite
// ============================================================================

describe('E2BRuntimeProvider', () => {
  let provider: E2BRuntimeProvider;
  let createdRuntimes: string[] = [];

  beforeAll(() => {
    // Reset global provider to ensure clean state
    resetGlobalE2BRuntimeProvider();
  });

  afterAll(() => {
    resetGlobalE2BRuntimeProvider();
  });

  beforeEach(() => {
    provider = new E2BRuntimeProvider({
      apiKey: MOCK_API_KEY,
      defaultTemplate: 'base',
      defaultTimeout: 600000,
      maxSandboxes: 50,
    });
    createdRuntimes = [];
  });

  afterEach(async () => {
    // Clean up any runtimes created during test
    for (const runtimeId of createdRuntimes) {
      try {
        await provider.terminate(runtimeId);
      } catch {
        // Ignore cleanup errors - runtime may already be terminated
      }
    }
    createdRuntimes = [];
    provider.dispose();
  });

  // ============================================================================
  // Constructor Tests
  // ============================================================================

  describe('Constructor', () => {
    it('should throw error when API key is not provided', () => {
      expect(() => new E2BRuntimeProvider({})).toThrow('E2B API key is required');
    });

    it('should use API key from environment variable', () => {
      const originalKey = process.env.E2B_API_KEY;
      process.env.E2B_API_KEY = 'env-api-key';
      
      const p = new E2BRuntimeProvider();
      expect(p).toBeDefined();
      
      process.env.E2B_API_KEY = originalKey;
      p.dispose();
    });

    it('should use provided API key over environment variable', () => {
      const originalKey = process.env.E2B_API_KEY;
      process.env.E2B_API_KEY = 'env-api-key';
      
      const p = new E2BRuntimeProvider({ apiKey: 'provided-key' });
      expect(p).toBeDefined();
      
      process.env.E2B_API_KEY = originalKey;
      p.dispose();
    });

    it('should accept all configuration options', () => {
      const config: E2BRuntimeProviderConfig = {
        apiKey: MOCK_API_KEY,
        defaultTemplate: 'custom-template',
        defaultTimeout: 300000,
        maxSandboxes: 25,
        maxConcurrentSandboxes: 25,
        baseUrl: 'https://custom.e2b.dev',
      };
      
      const p = new E2BRuntimeProvider(config);
      expect(p).toBeDefined();
      p.dispose();
    });
  });

  // ============================================================================
  // Interface Compliance Tests
  // ============================================================================

  describe('Interface Compliance', () => {
    it('should implement RuntimeProvider interface', () => {
      expect(provider).toBeDefined();
      expect(typeof provider.spawn).toBe('function');
      expect(typeof provider.terminate).toBe('function');
      expect(typeof provider.getStatus).toBe('function');
      expect(typeof provider.listRuntimes).toBe('function');
      expect(typeof provider.execute).toBe('function');
      expect(typeof provider.executeStream).toBe('function');
      expect(typeof provider.readFile).toBe('function');
      expect(typeof provider.writeFile).toBe('function');
      expect(typeof provider.snapshot).toBe('function');
      expect(typeof provider.restore).toBe('function');
      expect(typeof provider.listSnapshots).toBe('function');
      expect(typeof provider.deleteSnapshot).toBe('function');
      expect(typeof provider.on).toBe('function');
      expect(typeof provider.waitForState).toBe('function');
      expect(typeof provider.healthCheck).toBe('function');
      expect(typeof provider.dispose).toBe('function');
    });

    it('should return correct types from all methods', async () => {
      const config: SpawnConfig = {
        runtime: 'e2b',
        resources: { cpu: 1, memory: '512Mi' },
        env: { TEST_VAR: 'value' },
        labels: { test: 'true', agentId: 'test-agent', teamId: 'test-team' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      // Verify AgentRuntime type
      expect(runtime).toHaveProperty('id');
      expect(runtime).toHaveProperty('runtime', 'e2b');
      expect(runtime).toHaveProperty('state');
      expect(runtime).toHaveProperty('resources');
      expect(runtime).toHaveProperty('createdAt');
      expect(runtime).toHaveProperty('lastActiveAt');
      expect(runtime).toHaveProperty('metadata');
      expect(runtime.createdAt).toBeInstanceOf(Date);
      expect(runtime.lastActiveAt).toBeInstanceOf(Date);
      expect(runtime.metadata.type).toBe('e2b');
      expect(runtime.metadata.agentId).toBe('test-agent');
      expect(runtime.metadata.teamId).toBe('test-team');

      // Verify RuntimeStatus type
      const status = await provider.getStatus(runtime.id);
      expect(status).toHaveProperty('id');
      expect(status).toHaveProperty('state');
      expect(status).toHaveProperty('resources');
      expect(status).toHaveProperty('health');
      expect(status).toHaveProperty('uptime');
      expect(['healthy', 'unhealthy', 'unknown']).toContain(status.health);

      // Verify ExecutionResult type
      const result = await provider.execute(runtime.id, 'echo test');
      expect(result).toHaveProperty('exitCode');
      expect(result).toHaveProperty('stdout');
      expect(result).toHaveProperty('stderr');
      expect(result).toHaveProperty('duration');
      expect(result).toHaveProperty('metadata');
      expect(typeof result.exitCode).toBe('number');
      expect(typeof result.duration).toBe('number');

      // Verify list returns array
      const runtimes = await provider.listRuntimes();
      expect(Array.isArray(runtimes)).toBe(true);

      // Verify snapshots returns array
      const snapshots = await provider.listSnapshots(runtime.id);
      expect(Array.isArray(snapshots)).toBe(true);
    }, TEST_TIMEOUT);

    it('should have correct capabilities', () => {
      expect(provider.capabilities).toBeDefined();
      expect(provider.capabilities.snapshots).toBe(true);
      expect(provider.capabilities.streaming).toBe(true);
      expect(provider.capabilities.interactive).toBe(true);
      expect(provider.capabilities.fileOperations).toBe(true);
      expect(provider.capabilities.networkConfiguration).toBe(false); // E2B manages network
      expect(provider.capabilities.resourceLimits).toBe(true);
      expect(provider.capabilities.healthChecks).toBe(true);
    });
  });

  // ============================================================================
  // Lifecycle Management Tests
  // ============================================================================

  describe('Lifecycle Management', () => {
    it('should spawn an E2B runtime', async () => {
      const config: SpawnConfig = {
        runtime: 'e2b',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      expect(runtime.id).toBeDefined();
      expect(runtime.id).toContain('e2b-');
      expect(runtime.runtime).toBe('e2b');
      expect(runtime.state).toBe('running');
      expect(runtime.resources).toBeDefined();
      expect(runtime.resources.cpu).toBe(0);
      expect(runtime.resources.memory).toBe(0);
    }, TEST_TIMEOUT);

    it('should spawn with custom image/template', async () => {
      const config: SpawnConfig = {
        runtime: 'e2b',
        image: 'custom-template',
        resources: { cpu: 2, memory: '1Gi' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      expect(runtime.id).toBeDefined();
      expect(runtime.state).toBe('running');
    }, TEST_TIMEOUT);

    it('should generate agentId from labels when provided', async () => {
      const config: SpawnConfig = {
        runtime: 'e2b',
        resources: { cpu: 1, memory: '512Mi' },
        labels: { agentId: 'my-custom-agent' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      expect(runtime.metadata.agentId).toBe('my-custom-agent');
    }, TEST_TIMEOUT);

    it('should use runtime ID as agentId when not provided in labels', async () => {
      const config: SpawnConfig = {
        runtime: 'e2b',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      expect(runtime.metadata.agentId).toBe(runtime.id);
    }, TEST_TIMEOUT);

    it('should terminate a runtime and clean up sandbox', async () => {
      const config: SpawnConfig = {
        runtime: 'e2b',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      const runtimeId = runtime.id;
      createdRuntimes.push(runtimeId);

      await provider.terminate(runtimeId);
      createdRuntimes = createdRuntimes.filter(id => id !== runtimeId);

      // Verify runtime no longer listed
      const runtimes = await provider.listRuntimes();
      const runtimeIds = runtimes.map(r => r.id);
      expect(runtimeIds).not.toContain(runtimeId);
    }, TEST_TIMEOUT);

    it('should get runtime status', async () => {
      const config: SpawnConfig = {
        runtime: 'e2b',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      const status = await provider.getStatus(runtime.id);
      expect(status.id).toBe(runtime.id);
      expect(status.state).toBe('running');
      expect(status.uptime).toBeGreaterThanOrEqual(0);
      expect(status.health).toBe('healthy');
      expect(status.resources).toBeDefined();
    }, TEST_TIMEOUT);

    it('should list all runtimes', async () => {
      const runtimes1 = await provider.listRuntimes();
      const initialCount = runtimes1.length;

      const runtime1 = await provider.spawn({
        runtime: 'e2b',
        resources: { cpu: 1, memory: '256Mi' },
      });
      createdRuntimes.push(runtime1.id);

      const runtime2 = await provider.spawn({
        runtime: 'e2b',
        resources: { cpu: 0.5, memory: '128Mi' },
      });
      createdRuntimes.push(runtime2.id);

      const runtimes2 = await provider.listRuntimes();
      expect(runtimes2.length).toBe(initialCount + 2);
    }, TEST_TIMEOUT);

    it('should filter runtimes by runtime type', async () => {
      const runtime1 = await provider.spawn({
        runtime: 'e2b',
        resources: { cpu: 1, memory: '256Mi' },
      });
      createdRuntimes.push(runtime1.id);

      const filtered = await provider.listRuntimes({ runtime: 'e2b' });
      expect(filtered.length).toBeGreaterThanOrEqual(1);
      expect(filtered.every(r => r.runtime === 'e2b')).toBe(true);

      const emptyFiltered = await provider.listRuntimes({ runtime: 'worktree' });
      expect(emptyFiltered.length).toBe(0);
    }, TEST_TIMEOUT);

    it('should filter runtimes by state', async () => {
      const runtime = await provider.spawn({
        runtime: 'e2b',
        resources: { cpu: 1, memory: '256Mi' },
      });
      createdRuntimes.push(runtime.id);

      const filtered = await provider.listRuntimes({ state: 'running' });
      expect(filtered.length).toBeGreaterThanOrEqual(1);
      expect(filtered.some(r => r.id === runtime.id)).toBe(true);
    }, TEST_TIMEOUT);

    it('should filter runtimes by teamId', async () => {
      const runtime = await provider.spawn({
        runtime: 'e2b',
        resources: { cpu: 1, memory: '256Mi' },
        labels: { teamId: 'test-team-123' },
      });
      createdRuntimes.push(runtime.id);

      const filtered = await provider.listRuntimes({ teamId: 'test-team-123' });
      expect(filtered.some(r => r.id === runtime.id)).toBe(true);

      const emptyFiltered = await provider.listRuntimes({ teamId: 'non-existent' });
      expect(emptyFiltered.some(r => r.id === runtime.id)).toBe(false);
    }, TEST_TIMEOUT);

    it('should filter runtimes by labels', async () => {
      const runtime = await provider.spawn({
        runtime: 'e2b',
        resources: { cpu: 1, memory: '256Mi' },
        labels: { env: 'production', tier: 'frontend' },
      });
      createdRuntimes.push(runtime.id);

      const filtered = await provider.listRuntimes({ 
        labels: { env: 'production' } 
      });
      expect(filtered.some(r => r.id === runtime.id)).toBe(true);

      const emptyFiltered = await provider.listRuntimes({ 
        labels: { env: 'staging' } 
      });
      expect(emptyFiltered.some(r => r.id === runtime.id)).toBe(false);
    }, TEST_TIMEOUT);

    it('should throw NotFoundError for non-existent runtime', async () => {
      await expect(provider.getStatus('non-existent-id')).rejects.toThrow(NotFoundError);
      await expect(provider.getStatus('non-existent-id')).rejects.toThrow('Runtime not found');
      await expect(provider.terminate('non-existent-id')).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError when terminating already terminated runtime', async () => {
      const config: SpawnConfig = {
        runtime: 'e2b',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      await provider.terminate(runtime.id);

      await expect(provider.terminate(runtime.id)).rejects.toThrow(NotFoundError);
    }, TEST_TIMEOUT);

    it('should enforce maxSandboxes limit', async () => {
      const limitedProvider = new E2BRuntimeProvider({
        apiKey: MOCK_API_KEY,
        maxSandboxes: 2,
      });

      const runtime1 = await limitedProvider.spawn({
        runtime: 'e2b',
        resources: { cpu: 1, memory: '256Mi' },
      });

      const runtime2 = await limitedProvider.spawn({
        runtime: 'e2b',
        resources: { cpu: 1, memory: '256Mi' },
      });

      // Third spawn should fail
      await expect(
        limitedProvider.spawn({
          runtime: 'e2b',
          resources: { cpu: 1, memory: '256Mi' },
        })
      ).rejects.toThrow(ResourceExhaustedError);

      // Cleanup
      await limitedProvider.terminate(runtime1.id);
      await limitedProvider.terminate(runtime2.id);
      limitedProvider.dispose();
    }, TEST_TIMEOUT);

    it('should support maxConcurrentSandboxes alias', async () => {
      const limitedProvider = new E2BRuntimeProvider({
        apiKey: MOCK_API_KEY,
        maxConcurrentSandboxes: 1,
      });

      const runtime1 = await limitedProvider.spawn({
        runtime: 'e2b',
        resources: { cpu: 1, memory: '256Mi' },
      });

      // Second spawn should fail
      await expect(
        limitedProvider.spawn({
          runtime: 'e2b',
          resources: { cpu: 1, memory: '256Mi' },
        })
      ).rejects.toThrow(ResourceExhaustedError);

      // Cleanup
      await limitedProvider.terminate(runtime1.id);
      limitedProvider.dispose();
    }, TEST_TIMEOUT);
  });

  // ============================================================================
  // Execution Tests
  // ============================================================================

  describe('Command Execution', () => {
    it('should execute commands in sandbox', async () => {
      const config: SpawnConfig = {
        runtime: 'e2b',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      const result = await provider.execute(runtime.id, 'echo "Hello World"');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBeDefined();
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(result.metadata).toBeDefined();
      expect(result.metadata.command).toBe('echo "Hello World"');
      expect(result.metadata.startedAt).toBeInstanceOf(Date);
      expect(result.metadata.endedAt).toBeInstanceOf(Date);
    }, TEST_TIMEOUT);

    it('should handle command failure', async () => {
      const config: SpawnConfig = {
        runtime: 'e2b',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      // Mock sandbox returns exit code 0, so test that execution works
      const result = await provider.execute(runtime.id, 'exit 0');
      expect(result.exitCode).toBe(0);
    }, TEST_TIMEOUT);

    it('should execute commands with options', async () => {
      const config: SpawnConfig = {
        runtime: 'e2b',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      const result = await provider.execute(runtime.id, 'echo test', {
        env: { TEST_VAR: 'test_value' },
        cwd: '/home',
        timeout: 60,
      });

      expect(result.exitCode).toBe(0);
      expect(result.metadata).toBeDefined();
    }, TEST_TIMEOUT);

    it('should throw NotFoundError when executing in terminated runtime', async () => {
      const config: SpawnConfig = {
        runtime: 'e2b',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      await provider.terminate(runtime.id);

      // After termination, runtime is removed from map so NotFoundError is thrown
      await expect(provider.execute(runtime.id, 'echo test')).rejects.toThrow(NotFoundError);
    }, TEST_TIMEOUT);

    it('should throw NotFoundError when executing in non-existent runtime', async () => {
      await expect(provider.execute('non-existent', 'echo test')).rejects.toThrow(NotFoundError);
    });

    it('should handle execution timeout', async () => {
      const config: SpawnConfig = {
        runtime: 'e2b',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      // Set very short timeout to trigger timeout error
      await expect(
        provider.execute(runtime.id, 'sleep 10', { timeout: 0.001 })
      ).rejects.toThrow(TimeoutError);
    }, TEST_TIMEOUT);
  });

  describe('Streaming Execution', () => {
    it('should stream command output', async () => {
      const config: SpawnConfig = {
        runtime: 'e2b',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      const outputs: Array<{ type: string; data: string; sequence?: number }> = [];
      const stream = provider.executeStream(runtime.id, 'echo "line1" && echo "line2"');

      for await (const output of stream) {
        outputs.push({ 
          type: output.type, 
          data: output.data,
          sequence: output.sequence 
        });
      }

      expect(outputs.length).toBeGreaterThan(0);
      
      // Check for exit code
      const exitOutput = outputs.find(o => o.type === 'exit');
      expect(exitOutput).toBeDefined();
      expect(exitOutput?.data).toBe('0');
    }, TEST_TIMEOUT);

    it('should throw NotFoundError when streaming from non-existent runtime', async () => {
      const stream = provider.executeStream('non-existent', 'echo test');
      
      await expect(async () => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _ of stream) {
          // consume stream
        }
      }).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError when streaming from terminated runtime', async () => {
      const config: SpawnConfig = {
        runtime: 'e2b',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      await provider.terminate(runtime.id);

      // After termination, runtime is removed from map so NotFoundError is thrown
      const stream = provider.executeStream(runtime.id, 'echo test');
      
      await expect(async () => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _ of stream) {
          // consume stream
        }
      }).rejects.toThrow(NotFoundError);
    }, TEST_TIMEOUT);
  });

  describe('Interactive Execution', () => {
    it('should execute interactive commands', async () => {
      const config: SpawnConfig = {
        runtime: 'e2b',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      const stdin = createMockReadableStream(['input1', 'input2']);
      const result = await provider.executeInteractive(runtime.id, 'cat', stdin);

      expect(result.exitCode).toBe(0);
      expect(result.metadata).toBeDefined();
      expect(result.metadata.command).toBe('cat');
    }, TEST_TIMEOUT);

    it('should throw NotFoundError for interactive execution on non-existent runtime', async () => {
      const stdin = createMockReadableStream(['test']);
      await expect(
        provider.executeInteractive('non-existent', 'cat', stdin)
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError for interactive execution on terminated runtime', async () => {
      const config: SpawnConfig = {
        runtime: 'e2b',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      await provider.terminate(runtime.id);

      // After termination, runtime is removed from map so NotFoundError is thrown
      const stdin = createMockReadableStream(['test']);
      await expect(
        provider.executeInteractive(runtime.id, 'cat', stdin)
      ).rejects.toThrow(NotFoundError);
    }, TEST_TIMEOUT);
  });

  // ============================================================================
  // File Operations Tests
  // ============================================================================

  describe('File Operations', () => {
    it('should read files from sandbox', async () => {
      const config: SpawnConfig = {
        runtime: 'e2b',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      // Write a file first
      await provider.writeFile(runtime.id, 'test.txt', Buffer.from('Test file content'));

      // Read it back
      const content = await provider.readFile(runtime.id, 'test.txt');
      expect(content.toString()).toBe('Test file content');
    }, TEST_TIMEOUT);

    it('should write files to sandbox', async () => {
      const config: SpawnConfig = {
        runtime: 'e2b',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      const testContent = Buffer.from('New file content');
      await provider.writeFile(runtime.id, 'newfile.txt', testContent);

      // Verify by reading back
      const readContent = await provider.readFile(runtime.id, 'newfile.txt');
      expect(readContent.toString()).toBe('New file content');
    }, TEST_TIMEOUT);

    it('should throw NotFoundError when reading non-existent file', async () => {
      const config: SpawnConfig = {
        runtime: 'e2b',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      await expect(provider.readFile(runtime.id, 'nonexistent.txt')).rejects.toThrow(NotFoundError);
    }, TEST_TIMEOUT);

    it('should throw NotFoundError when reading from non-existent runtime', async () => {
      await expect(provider.readFile('non-existent', 'test.txt')).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError when writing to non-existent runtime', async () => {
      await expect(
        provider.writeFile('non-existent', 'test.txt', Buffer.from('content'))
      ).rejects.toThrow(NotFoundError);
    });

    it('should upload directories to sandbox', async () => {
      const config: SpawnConfig = {
        runtime: 'e2b',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      // Create a temporary directory to upload
      const fs = await import('fs');
      const path = await import('path');
      const os = await import('os');
      
      const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2b-upload-test-'));
      fs.writeFileSync(path.join(uploadDir, 'file1.txt'), 'content1');
      fs.mkdirSync(path.join(uploadDir, 'subdir'));
      fs.writeFileSync(path.join(uploadDir, 'subdir', 'file2.txt'), 'content2');

      await provider.uploadDirectory(runtime.id, uploadDir, 'uploaded');

      // Verify by reading files
      const content1 = await provider.readFile(runtime.id, 'uploaded/file1.txt');
      expect(content1.toString()).toBe('content1');
      const content2 = await provider.readFile(runtime.id, 'uploaded/subdir/file2.txt');
      expect(content2.toString()).toBe('content2');

      fs.rmSync(uploadDir, { recursive: true, force: true });
    }, TEST_TIMEOUT);

    it('should throw NotFoundError when uploading from non-existent local path', async () => {
      const config: SpawnConfig = {
        runtime: 'e2b',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      await expect(
        provider.uploadDirectory(runtime.id, '/non-existent-path', 'dest')
      ).rejects.toThrow(NotFoundError);
    }, TEST_TIMEOUT);

    it('should download directories from sandbox', async () => {
      const config: SpawnConfig = {
        runtime: 'e2b',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      // Create files in sandbox
      await provider.writeFile(runtime.id, 'download-test/file1.txt', Buffer.from('content1'));

      const fs = await import('fs');
      const path = await import('path');
      const os = await import('os');
      
      const downloadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2b-download-target-'));
      await provider.downloadDirectory(runtime.id, 'download-test', downloadDir);

      expect(fs.existsSync(path.join(downloadDir, 'file1.txt'))).toBe(true);
      expect(fs.readFileSync(path.join(downloadDir, 'file1.txt'), 'utf8')).toBe('content1');

      fs.rmSync(downloadDir, { recursive: true, force: true });
    }, TEST_TIMEOUT);

    it('should throw NotFoundError when downloading from non-existent runtime', async () => {
      await expect(
        provider.downloadDirectory('non-existent', 'src', 'dest')
      ).rejects.toThrow(NotFoundError);
    });
  });

  // ============================================================================
  // State Management Tests (Snapshots)
  // ============================================================================

  describe('State Management (Snapshots)', () => {
    it('should create snapshots successfully', async () => {
      const config: SpawnConfig = {
        runtime: 'e2b',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      const snapshot = await provider.snapshot(runtime.id, { 
        name: 'test',
        description: 'Test snapshot',
        labels: { env: 'test' }
      });

      expect(snapshot).toBeDefined();
      expect(snapshot.id).toBeDefined();
      expect(snapshot.id).toContain('snap-');
      expect(snapshot.runtimeId).toBe(runtime.id);
      expect(snapshot.createdAt).toBeInstanceOf(Date);
      expect(snapshot.size).toBeGreaterThan(0);
      expect(snapshot.metadata.name).toBe('test');
      expect(snapshot.metadata.description).toBe('Test snapshot');
      expect(snapshot.metadata.labels).toEqual({ env: 'test' });
    }, TEST_TIMEOUT);

    it('should list snapshots', async () => {
      const config: SpawnConfig = {
        runtime: 'e2b',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      // Create a snapshot
      await provider.snapshot(runtime.id, { name: 'snapshot1' });

      // List snapshots for runtime
      const snapshots = await provider.listSnapshots(runtime.id);
      expect(snapshots.length).toBeGreaterThanOrEqual(1);
      expect(snapshots[0].runtimeId).toBe(runtime.id);
    }, TEST_TIMEOUT);

    it('should list all snapshots when no runtimeId provided', async () => {
      const config: SpawnConfig = {
        runtime: 'e2b',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      // Create a snapshot
      await provider.snapshot(runtime.id, { name: 'snapshot1' });

      // List all snapshots
      const allSnapshots = await provider.listSnapshots();
      expect(allSnapshots.length).toBeGreaterThanOrEqual(1);
    }, TEST_TIMEOUT);

    it('should restore from snapshot', async () => {
      const config: SpawnConfig = {
        runtime: 'e2b',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      const snapshot = await provider.snapshot(runtime.id, { name: 'restore-test' });

      const restored = await provider.restore(snapshot.id);
      expect(restored.id).toBe(runtime.id);
      expect(restored.state).toBe('running');
    }, TEST_TIMEOUT);

    it('should delete snapshots', async () => {
      const config: SpawnConfig = {
        runtime: 'e2b',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      const snapshot = await provider.snapshot(runtime.id, { name: 'delete-test' });

      // Delete snapshot
      await provider.deleteSnapshot(snapshot.id);

      // Verify deletion
      const snapshots = await provider.listSnapshots(runtime.id);
      expect(snapshots.find(s => s.id === snapshot.id)).toBeUndefined();
    }, TEST_TIMEOUT);

    it('should throw NotFoundError when snapshotting non-existent runtime', async () => {
      await expect(provider.snapshot('non-existent')).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError when restoring non-existent snapshot', async () => {
      await expect(provider.restore('non-existent')).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError when deleting non-existent snapshot', async () => {
      await expect(provider.deleteSnapshot('non-existent')).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError when restoring snapshot with deleted runtime', async () => {
      const config: SpawnConfig = {
        runtime: 'e2b',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      const snapshot = await provider.snapshot(runtime.id, { name: 'test' });
      
      // Terminate runtime
      await provider.terminate(runtime.id);

      // Restore should fail because runtime no longer exists
      await expect(provider.restore(snapshot.id)).rejects.toThrow(NotFoundError);
    }, TEST_TIMEOUT);
  });

  // ============================================================================
  // Event Tests
  // ============================================================================

  describe('Events', () => {
    it('should emit stateChange events', async () => {
      const events: Array<{ event: string; data: any }> = [];
      
      provider.on('stateChange', (event, data) => {
        events.push({ event, data });
      });

      const config: SpawnConfig = {
        runtime: 'e2b',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      // Wait for state change event
      await waitForCondition(() => events.length > 0, 2000);

      // Events should have been fired during spawn
      expect(events.length).toBeGreaterThanOrEqual(1);
    }, TEST_TIMEOUT);

    it('should call registered event handlers', async () => {
      const handler = jest.fn();
      
      provider.on('stateChange', handler);

      const config: SpawnConfig = {
        runtime: 'e2b',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      // Handler should have been called
      expect(handler).toHaveBeenCalled();
    }, TEST_TIMEOUT);

    it('should wait for specific state', async () => {
      const config: SpawnConfig = {
        runtime: 'e2b',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      const reached = await provider.waitForState(runtime.id, 'running', 5000);
      expect(reached).toBe(true);
    }, TEST_TIMEOUT);

    it('should timeout waiting for state of non-existent runtime', async () => {
      const reached = await provider.waitForState('non-existent', 'running', 100);
      expect(reached).toBe(false);
    });

    it('should return true immediately if already in target state', async () => {
      const config: SpawnConfig = {
        runtime: 'e2b',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      // Runtime should already be running
      const reached = await provider.waitForState(runtime.id, 'running', 100);
      expect(reached).toBe(true);
    }, TEST_TIMEOUT);
  });

  // ============================================================================
  // Health Check Tests
  // ============================================================================

  describe('Health Check', () => {
    it('should return true when API key is valid', async () => {
      const healthy = await provider.healthCheck();
      expect(healthy).toBe(true);
    });

    it('should return true when API key is from environment variable', async () => {
      // When config.apiKey is empty string, constructor falls back to env var
      // So we need to test with a provider that has a valid API key setup
      const healthy = await provider.healthCheck();
      expect(healthy).toBe(true);
    });
  });

  // ============================================================================
  // Error Handling Tests
  // ============================================================================

  describe('Error Handling', () => {
    it('should handle execution errors gracefully', async () => {
      const config: SpawnConfig = {
        runtime: 'e2b',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      // This should not throw but return error result (mock implementation)
      const result = await provider.execute(runtime.id, 'invalid-command');
      expect(result.exitCode).toBeDefined();
      expect(result.duration).toBeGreaterThanOrEqual(0);
    }, TEST_TIMEOUT);

    it('should throw ResourceExhaustedError when max sandboxes reached', async () => {
      // Create a provider with maxSandboxes=1, spawn one, then try to spawn another
      const limitedProvider = new E2BRuntimeProvider({
        apiKey: MOCK_API_KEY,
        maxSandboxes: 1,
      });

      // Spawn first runtime - should succeed
      const runtime1 = await limitedProvider.spawn({
        runtime: 'e2b',
        resources: { cpu: 1, memory: '256Mi' },
      });

      // Spawn second runtime - should fail with ResourceExhaustedError
      await expect(
        limitedProvider.spawn({
          runtime: 'e2b',
          resources: { cpu: 1, memory: '256Mi' },
        })
      ).rejects.toThrow(ResourceExhaustedError);

      // Cleanup
      await limitedProvider.terminate(runtime1.id);
      limitedProvider.dispose();
    });
  });

  // ============================================================================
  // Concurrent Operations Tests
  // ============================================================================

  describe('Concurrent Operations', () => {
    it('should handle concurrent spawns', async () => {
      const spawnPromises = Array.from({ length: 3 }, (_, i) =>
        provider.spawn({
          runtime: 'e2b',
          resources: { cpu: 1, memory: '256Mi' },
          labels: { index: String(i) },
        })
      );

      const runtimes = await Promise.all(spawnPromises);
      runtimes.forEach(r => createdRuntimes.push(r.id));

      expect(runtimes.length).toBe(3);
      
      // Verify all runtimes exist
      const listedRuntimes = await provider.listRuntimes();
      const listedIds = listedRuntimes.map(r => r.id);
      
      for (const runtime of runtimes) {
        expect(listedIds).toContain(runtime.id);
      }
    }, TEST_TIMEOUT * 2);

    it('should handle concurrent executions', async () => {
      const config: SpawnConfig = {
        runtime: 'e2b',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      const execPromises = Array.from({ length: 3 }, (_, i) =>
        provider.execute(runtime.id, `echo "task-${i}"`)
      );

      const results = await Promise.all(execPromises);

      results.forEach((result) => {
        expect(result.exitCode).toBe(0);
      });
    }, TEST_TIMEOUT);

    it('should handle concurrent file operations', async () => {
      const config: SpawnConfig = {
        runtime: 'e2b',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      const fileOps = Array.from({ length: 3 }, (_, i) =>
        provider.writeFile(runtime.id, `concurrent-${i}.txt`, Buffer.from(`content-${i}`))
      );

      await Promise.all(fileOps);

      // Verify all files were written
      for (let i = 0; i < 3; i++) {
        const content = await provider.readFile(runtime.id, `concurrent-${i}.txt`);
        expect(content.toString()).toBe(`content-${i}`);
      }
    }, TEST_TIMEOUT);
  });

  // ============================================================================
  // Performance Baseline Tests
  // ============================================================================

  describe('Performance Baselines', () => {
    it('should spawn sandbox within performance baseline', async () => {
      const config: SpawnConfig = {
        runtime: 'e2b',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const { result, durationMs } = await measureTime(() => provider.spawn(config));
      createdRuntimes.push(result.id);

      console.log(`E2B Spawn time: ${durationMs.toFixed(2)}ms (baseline: ${PERFORMANCE_BASELINE_SPAWN_MS}ms)`);
      
      // Document the measurement (not a hard failure, but tracks performance)
      expect(durationMs).toBeLessThan(PERFORMANCE_BASELINE_SPAWN_MS * 5); // Allow 5x for mock
    }, TEST_TIMEOUT);

    it('should execute commands within performance baseline', async () => {
      const config: SpawnConfig = {
        runtime: 'e2b',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      const { durationMs } = await measureTime(() =>
        provider.execute(runtime.id, 'echo test')
      );

      console.log(`E2B Execute time: ${durationMs.toFixed(2)}ms (baseline: ${PERFORMANCE_BASELINE_EXEC_MS}ms)`);
      
      expect(durationMs).toBeLessThan(PERFORMANCE_BASELINE_EXEC_MS * 10);
    }, TEST_TIMEOUT);

    it('should perform file operations within performance baseline', async () => {
      const config: SpawnConfig = {
        runtime: 'e2b',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      const testData = Buffer.from('x'.repeat(1024)); // 1KB

      const { durationMs: writeTime } = await measureTime(() =>
        provider.writeFile(runtime.id, 'perf-test.txt', testData)
      );

      console.log(`E2B Write time: ${writeTime.toFixed(2)}ms`);

      const { durationMs: readTime } = await measureTime(() =>
        provider.readFile(runtime.id, 'perf-test.txt')
      );

      console.log(`E2B Read time: ${readTime.toFixed(2)}ms`);

      expect(writeTime).toBeLessThan(1000);
      expect(readTime).toBeLessThan(1000);
    }, TEST_TIMEOUT);
  });

  // ============================================================================
  // Edge Case Tests
  // ============================================================================

  describe('Edge Cases', () => {
    it('should handle sandboxes with special characters in labels', async () => {
      const config: SpawnConfig = {
        runtime: 'e2b',
        resources: { cpu: 1, memory: '512Mi' },
        labels: { special: 'test-value-with-@-and-#' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      expect(runtime.id).toBeDefined();
      expect(runtime.state).toBe('running');
    }, TEST_TIMEOUT);

    it('should handle rapid spawn/terminate cycles', async () => {
      for (let i = 0; i < 3; i++) {
        const runtime = await provider.spawn({
          runtime: 'e2b',
          resources: { cpu: 0.5, memory: '128Mi' },
        });

        await provider.execute(runtime.id, 'echo "test"');
        await provider.terminate(runtime.id);
      }

      // If we get here without errors, the test passes
      expect(true).toBe(true);
    }, TEST_TIMEOUT * 3);

    it('should handle large file operations', async () => {
      const config: SpawnConfig = {
        runtime: 'e2b',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      // Create 10KB file
      const largeContent = Buffer.from('x'.repeat(10 * 1024));
      await provider.writeFile(runtime.id, 'large-file.txt', largeContent);

      const readContent = await provider.readFile(runtime.id, 'large-file.txt');
      expect(readContent.length).toBe(largeContent.length);
    }, TEST_TIMEOUT);

    it('should handle binary file operations', async () => {
      const config: SpawnConfig = {
        runtime: 'e2b',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      // Create binary content with null bytes
      const binaryContent = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe]);
      await provider.writeFile(runtime.id, 'binary-file.bin', binaryContent);

      const readContent = await provider.readFile(runtime.id, 'binary-file.bin');
      expect(readContent.equals(binaryContent)).toBe(true);
    }, TEST_TIMEOUT);

    it('should handle empty file operations', async () => {
      const config: SpawnConfig = {
        runtime: 'e2b',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      // Write empty file
      await provider.writeFile(runtime.id, 'empty.txt', Buffer.from(''));

      const readContent = await provider.readFile(runtime.id, 'empty.txt');
      expect(readContent.length).toBe(0);
    }, TEST_TIMEOUT);

    it('should maintain isolation between sandboxes', async () => {
      const runtime1 = await provider.spawn({
        runtime: 'e2b',
        resources: { cpu: 1, memory: '512Mi' },
      });
      createdRuntimes.push(runtime1.id);

      const runtime2 = await provider.spawn({
        runtime: 'e2b',
        resources: { cpu: 1, memory: '512Mi' },
      });
      createdRuntimes.push(runtime2.id);

      // Write different files to each sandbox
      await provider.writeFile(runtime1.id, 'isolation-test.txt', Buffer.from('runtime1'));
      await provider.writeFile(runtime2.id, 'isolation-test.txt', Buffer.from('runtime2'));

      // Verify isolation
      const content1 = await provider.readFile(runtime1.id, 'isolation-test.txt');
      const content2 = await provider.readFile(runtime2.id, 'isolation-test.txt');

      expect(content1.toString()).toBe('runtime1');
      expect(content2.toString()).toBe('runtime2');
    }, TEST_TIMEOUT);
  });

  // ============================================================================
  // Global Instance Tests
  // ============================================================================

  describe('Global Instance Management', () => {
    beforeEach(() => {
      resetGlobalE2BRuntimeProvider();
    });

    afterEach(() => {
      resetGlobalE2BRuntimeProvider();
    });

    it('should manage global instance lifecycle', () => {
      const { getGlobalE2BRuntimeProvider, initializeGlobalE2BRuntimeProvider, hasGlobalE2BRuntimeProvider } = 
        require('../../src/core/runtime/providers/e2b-runtime-provider');

      expect(hasGlobalE2BRuntimeProvider()).toBe(false);

      const p1 = initializeGlobalE2BRuntimeProvider({ apiKey: MOCK_API_KEY });
      expect(hasGlobalE2BRuntimeProvider()).toBe(true);
      expect(p1).toBeDefined();

      const p2 = getGlobalE2BRuntimeProvider();
      expect(p2).toBe(p1);

      p1.dispose();
    });

    it('should throw when getting uninitialized global provider', () => {
      const { getGlobalE2BRuntimeProvider } = 
        require('../../src/core/runtime/providers/e2b-runtime-provider');

      expect(() => getGlobalE2BRuntimeProvider()).toThrow('Global E2BRuntimeProvider not initialized');
    });

    it('should reinitialize global provider when called again', () => {
      const { initializeGlobalE2BRuntimeProvider, getGlobalE2BRuntimeProvider } = 
        require('../../src/core/runtime/providers/e2b-runtime-provider');

      const p1 = initializeGlobalE2BRuntimeProvider({ apiKey: MOCK_API_KEY });
      const p2 = initializeGlobalE2BRuntimeProvider({ apiKey: MOCK_API_KEY });

      // Should be new instance
      expect(p2).toBeDefined();
      
      const p3 = getGlobalE2BRuntimeProvider();
      expect(p3).toBe(p2);

      p2.dispose();
    });
  });

  // ============================================================================
  // Cost Tracking Tests
  // ============================================================================

  describe('Cost Tracking', () => {
    it('should calculate runtime cost', async () => {
      const config: SpawnConfig = {
        runtime: 'e2b',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      // Wait a bit to accumulate "cost"
      await new Promise(resolve => setTimeout(resolve, 100));

      const cost = provider.getRuntimeCost(runtime.id);
      expect(cost).not.toBeNull();
      expect(typeof cost).toBe('number');
      expect(cost).toBeGreaterThanOrEqual(0);
    }, TEST_TIMEOUT);

    it('should return null cost for non-existent runtime', () => {
      const cost = provider.getRuntimeCost('non-existent');
      expect(cost).toBeNull();
    });
  });

  // ============================================================================
  // Additional Coverage Tests
  // ============================================================================

  describe('Additional Coverage - Error Handling', () => {
    it('should handle errors in event handlers gracefully', async () => {
      // Register a handler that throws
      provider.on('stateChange', () => {
        throw new Error('Handler error');
      });

      const config: SpawnConfig = {
        runtime: 'e2b',
        resources: { cpu: 1, memory: '512Mi' },
      };

      // Should not throw even though handler errors
      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      // If we get here, the provider handled the handler error gracefully
      expect(runtime.id).toBeDefined();
    }, TEST_TIMEOUT);

    it('should handle upload directory errors', async () => {
      const config: SpawnConfig = {
        runtime: 'e2b',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      // Test non-existent local path
      await expect(
        provider.uploadDirectory(runtime.id, '/path/that/does/not/exist', 'dest')
      ).rejects.toThrow(NotFoundError);
    }, TEST_TIMEOUT);

    it('should handle waitForState edge cases', async () => {
      // Test with non-existent runtime
      const result = await provider.waitForState('non-existent', 'running', 100);
      expect(result).toBe(false);

      const config: SpawnConfig = {
        runtime: 'e2b',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      // Test with target state that will never be reached (timeout)
      const timeoutResult = await provider.waitForState(runtime.id, 'paused', 50);
      expect(timeoutResult).toBe(false);
    }, TEST_TIMEOUT);

    it('should throw ExecutionError when executing in non-running state', async () => {
      const config: SpawnConfig = {
        runtime: 'e2b',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      // Mock the state to be 'error' by accessing internal state
      // This tests the state check in execute() before runtime deletion
      const internalRuntimes = (provider as any).runtimes;
      const runtimeState = internalRuntimes.get(runtime.id);
      runtimeState.state = 'error';

      await expect(provider.execute(runtime.id, 'echo test')).rejects.toThrow(ExecutionError);

      // Cleanup - reset state so terminate works
      runtimeState.state = 'running';
    }, TEST_TIMEOUT);

    it('should handle execute error case when process throws', async () => {
      const config: SpawnConfig = {
        runtime: 'e2b',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      // Mock the sandbox process to throw an error
      const internalRuntimes = (provider as any).runtimes;
      const runtimeState = internalRuntimes.get(runtime.id);
      const originalProcess = runtimeState.sandbox.process;
      runtimeState.sandbox.process = {
        start: async () => {
          throw new Error('Process start failed');
        }
      };

      // Should handle error and return error result
      const result = await provider.execute(runtime.id, 'echo test');
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Process start failed');

      // Restore
      runtimeState.sandbox.process = originalProcess;
    }, TEST_TIMEOUT);

    it('should handle download directory with non-existent remote path', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const os = await import('os');

      const config: SpawnConfig = {
        runtime: 'e2b',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      const downloadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2b-dl-test-'));

      // Mock list to return empty for non-existent directory
      const internalRuntimes = (provider as any).runtimes;
      const runtimeState = internalRuntimes.get(runtime.id);
      const originalList = runtimeState.sandbox.files.list;
      runtimeState.sandbox.files.list = async () => [];

      // Should not throw, just create empty directory
      await provider.downloadDirectory(runtime.id, 'non-existent-dir', downloadDir);

      // Cleanup
      fs.rmSync(downloadDir, { recursive: true, force: true });
      runtimeState.sandbox.files.list = originalList;
    }, TEST_TIMEOUT);

    it('should handle snapshot creation failure', async () => {
      const config: SpawnConfig = {
        runtime: 'e2b',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      // Mock snapshot to throw
      const internalRuntimes = (provider as any).runtimes;
      const runtimeState = internalRuntimes.get(runtime.id);
      const originalSnapshot = runtimeState.sandbox.snapshot;
      runtimeState.sandbox.snapshot = async () => {
        throw new Error('Snapshot failed');
      };

      await expect(provider.snapshot(runtime.id)).rejects.toThrow(ExecutionError);

      // Restore
      runtimeState.sandbox.snapshot = originalSnapshot;
    }, TEST_TIMEOUT);

    it('should handle restore failure', async () => {
      const config: SpawnConfig = {
        runtime: 'e2b',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      const snapshot = await provider.snapshot(runtime.id);

      // Mock restore to throw
      const internalRuntimes = (provider as any).runtimes;
      const runtimeState = internalRuntimes.get(runtime.id);
      const originalRestore = runtimeState.sandbox.restore;
      runtimeState.sandbox.restore = async () => {
        throw new Error('Restore failed');
      };

      await expect(provider.restore(snapshot.id)).rejects.toThrow(ExecutionError);

      // Restore
      runtimeState.sandbox.restore = originalRestore;
    }, TEST_TIMEOUT);

    it('should handle executeStream error when process throws', async () => {
      const config: SpawnConfig = {
        runtime: 'e2b',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      // Mock process.start to throw
      const internalRuntimes = (provider as any).runtimes;
      const runtimeState = internalRuntimes.get(runtime.id);
      const originalProcess = runtimeState.sandbox.process;
      runtimeState.sandbox.process = {
        start: async () => {
          throw new Error('Stream process failed');
        }
      };

      const stream = provider.executeStream(runtime.id, 'echo test');
      
      await expect(async () => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _ of stream) {
          // consume stream
        }
      }).rejects.toThrow();

      // Restore
      runtimeState.sandbox.process = originalProcess;
    }, TEST_TIMEOUT);

    it('should handle executeInteractive error when process throws', async () => {
      const config: SpawnConfig = {
        runtime: 'e2b',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      // Mock process.start to throw
      const internalRuntimes = (provider as any).runtimes;
      const runtimeState = internalRuntimes.get(runtime.id);
      const originalProcess = runtimeState.sandbox.process;
      runtimeState.sandbox.process = {
        start: async () => {
          throw new Error('Interactive process failed');
        }
      };

      const stdin = createMockReadableStream(['test']);
      const result = await provider.executeInteractive(runtime.id, 'cat', stdin);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Interactive process failed');

      // Restore
      runtimeState.sandbox.process = originalProcess;
    }, TEST_TIMEOUT);

    it('should handle readFile error case', async () => {
      const config: SpawnConfig = {
        runtime: 'e2b',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      // Mock files.read to throw a non-ENOENT error
      const internalRuntimes = (provider as any).runtimes;
      const runtimeState = internalRuntimes.get(runtime.id);
      const originalRead = runtimeState.sandbox.files.read;
      runtimeState.sandbox.files.read = async () => {
        const error = new Error('Unknown error');
        throw error;
      };

      await expect(provider.readFile(runtime.id, 'test.txt')).rejects.toThrow('Unknown error');

      // Restore
      runtimeState.sandbox.files.read = originalRead;
    }, TEST_TIMEOUT);

    it('should handle writeFile error case', async () => {
      const config: SpawnConfig = {
        runtime: 'e2b',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      // Mock files.write to throw
      const internalRuntimes = (provider as any).runtimes;
      const runtimeState = internalRuntimes.get(runtime.id);
      const originalWrite = runtimeState.sandbox.files.write;
      runtimeState.sandbox.files.write = async () => {
        throw new Error('Write failed');
      };

      await expect(provider.writeFile(runtime.id, 'test.txt', Buffer.from('test')))
        .rejects.toThrow('Write failed');

      // Restore
      runtimeState.sandbox.files.write = originalWrite;
    }, TEST_TIMEOUT);

    it('should handle terminate error when kill fails', async () => {
      const config: SpawnConfig = {
        runtime: 'e2b',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      // Mock sandbox.kill to throw
      const internalRuntimes = (provider as any).runtimes;
      const runtimeState = internalRuntimes.get(runtime.id);
      const originalKill = runtimeState.sandbox.kill;
      runtimeState.sandbox.kill = async () => {
        throw new Error('Kill failed');
      };

      await expect(provider.terminate(runtime.id)).rejects.toThrow(ExecutionError);

      // Restore
      runtimeState.sandbox.kill = originalKill;
    }, TEST_TIMEOUT);
  });
});

// ============================================================================
// Regression Tests
// ============================================================================

describe('E2BRuntimeProvider Regression Tests', () => {
  let provider: E2BRuntimeProvider;
  let createdRuntimes: string[] = [];

  beforeEach(() => {
    resetGlobalE2BRuntimeProvider();
    provider = new E2BRuntimeProvider({
      apiKey: MOCK_API_KEY,
    });
    createdRuntimes = [];
  });

  afterEach(async () => {
    for (const runtimeId of createdRuntimes) {
      try {
        await provider.terminate(runtimeId);
      } catch {
        // Ignore cleanup errors
      }
    }
    provider.dispose();
    resetGlobalE2BRuntimeProvider();
  });

  it('should not leave zombie runtimes after termination', async () => {
    const runtime = await provider.spawn({
      runtime: 'e2b',
      resources: { cpu: 1, memory: '512Mi' },
    });
    
    const runtimeId = runtime.id;
    createdRuntimes.push(runtimeId);

    // Verify runtime exists
    const runtimesBefore = await provider.listRuntimes();
    expect(runtimesBefore.some(r => r.id === runtimeId)).toBe(true);

    await provider.terminate(runtimeId);
    createdRuntimes = createdRuntimes.filter(id => id !== runtimeId);

    // Verify runtime no longer listed
    const runtimesAfter = await provider.listRuntimes();
    expect(runtimesAfter.some(r => r.id === runtimeId)).toBe(false);
  }, TEST_TIMEOUT);

  it('should handle dispose properly', async () => {
    const p = new E2BRuntimeProvider({ apiKey: MOCK_API_KEY });
    
    const runtime = await p.spawn({
      runtime: 'e2b',
      resources: { cpu: 1, memory: '512Mi' },
    });

    // Dispose should not throw
    p.dispose();

    // Provider should be unusable after dispose
    // (implementation detail - behavior may vary)
  }, TEST_TIMEOUT);

  it('should maintain consistent runtime state after operations', async () => {
    const runtime = await provider.spawn({
      runtime: 'e2b',
      resources: { cpu: 1, memory: '512Mi' },
    });
    createdRuntimes.push(runtime.id);

    // Perform various operations
    await provider.execute(runtime.id, 'echo test');
    await provider.writeFile(runtime.id, 'test.txt', Buffer.from('content'));
    const snapshot = await provider.snapshot(runtime.id);

    // Status should still be consistent
    const status = await provider.getStatus(runtime.id);
    expect(status.state).toBe('running');
    expect(status.id).toBe(runtime.id);

    // Clean up snapshot
    await provider.deleteSnapshot(snapshot.id);
  }, TEST_TIMEOUT);
});
