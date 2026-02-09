/**
 * KataRuntimeProvider Tests
 *
 * Comprehensive test suite for KataRuntimeProvider.
 * Tests K8s integration, pod lifecycle, and error handling.
 *
 * @module tests/runtime/kata-runtime-provider
 * @version 1.0.0
 * @since 2026-02-08
 * @see SPEC-002 Section 4.2
 */

import { KataRuntimeProvider } from '../../src/core/runtime/providers/kata-runtime-provider';
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

const TEST_TIMEOUT = 120000;
const PERFORMANCE_BASELINE_SPAWN_MS = 30000; // Target: <30s for Kata spawn

// ============================================================================
// Mock Kubernetes Client
// ============================================================================

const mockPods = new Map<string, any>();
let mockPodCounter = 0;

// Mock @kubernetes/client-node
jest.mock('@kubernetes/client-node', () => {
  const actual = jest.requireActual('@kubernetes/client-node');
  
  return {
    ...actual,
    KubeConfig: jest.fn().mockImplementation(() => ({
      loadFromDefault: jest.fn(),
      loadFromFile: jest.fn(),
      setCurrentContext: jest.fn(),
      makeApiClient: jest.fn().mockImplementation((apiClass) => {
        if (apiClass.name === 'CoreV1Api') {
          return createMockCoreV1Api();
        }
        return {};
      }),
    })),
    CoreV1Api: jest.fn(),
    AppsV1Api: jest.fn(),
    Watch: jest.fn().mockImplementation(() => ({
      watch: jest.fn().mockResolvedValue(undefined),
      abort: jest.fn(),
    })),
    Exec: jest.fn().mockImplementation(() => ({
      exec: jest.fn().mockImplementation(async (
        namespace: string,
        podName: string,
        containerName: string,
        command: string[],
        stdout: any,
        stderr: any,
        stdin: any,
        tty: boolean,
        callback?: (status: any) => void
      ) => {
        // Simulate successful exec
        const mockWebSocket = {
          on: jest.fn(),
          send: jest.fn(),
          close: jest.fn(),
        };
        
        // Simulate command execution
        setTimeout(() => {
          if (callback) {
            callback({ status: 'Success' });
          }
        }, 100);
        
        return Promise.resolve(mockWebSocket);
      }),
    })),
    HttpError: jest.fn().mockImplementation((response: any, body: any, statusCode: number) => {
      const error = new Error(body?.message || 'HTTP Error');
      (error as any).response = response;
      (error as any).body = body;
      (error as any).statusCode = statusCode;
      return error;
    }),
  };
});

function createMockCoreV1Api() {
  return {
    createNamespacedPod: jest.fn().mockImplementation(async (namespace: string, podSpec: any) => {
      const podName = podSpec.metadata.name;
      mockPodCounter++;
      
      const pod = {
        metadata: {
          name: podName,
          namespace,
          uid: `mock-uid-${mockPodCounter}`,
        },
        spec: podSpec.spec,
        status: {
          phase: 'Pending',
          podIP: undefined,
          containerStatuses: undefined,
        },
      };
      
      mockPods.set(podName, pod);
      
      // Simulate transition to Running
      setTimeout(() => {
        pod.status.phase = 'Running';
        pod.status.podIP = `10.0.0.${mockPodCounter}`;
        pod.status.containerStatuses = [{
          name: 'agent',
          ready: true,
          restartCount: 0,
          state: { running: { startedAt: new Date().toISOString() } },
        }];
      }, 100);
      
      return { body: pod };
    }),
    
    readNamespacedPod: jest.fn().mockImplementation(async (name: string, namespace: string) => {
      const pod = mockPods.get(name);
      if (!pod) {
        const error = new Error(`pods "${name}" not found`);
        (error as any).statusCode = 404;
        throw error;
      }
      return { body: pod };
    }),
    
    deleteNamespacedPod: jest.fn().mockImplementation(async (name: string, namespace: string) => {
      mockPods.delete(name);
      return { body: {} };
    }),
    
    listNamespacedPod: jest.fn().mockImplementation(async (namespace: string) => {
      return { 
        body: { 
          items: Array.from(mockPods.values()).filter(p => p.metadata.namespace === namespace) 
        } 
      };
    }),
  };
}

// ============================================================================
// Test Suite
// ============================================================================

describe('KataRuntimeProvider', () => {
  let provider: KataRuntimeProvider;
  let createdRuntimes: string[] = [];

  beforeEach(() => {
    mockPods.clear();
    mockPodCounter = 0;
    
    provider = new KataRuntimeProvider({
      namespace: 'test-namespace',
      runtimeClassName: 'kata',
      defaultImage: 'busybox:latest',
      spawnTimeout: 60,
      maxRuntimes: 10,
    });
    
    createdRuntimes = [];
  });

  afterEach(async () => {
    // Cleanup created runtimes
    for (const runtimeId of createdRuntimes) {
      try {
        await provider.terminate(runtimeId);
      } catch (error) {
        // Ignore cleanup errors
      }
    }
    
    provider.dispose();
  });

  // ============================================================================
  // Provider Capabilities
  // ============================================================================

  describe('Capabilities', () => {
    test('should expose correct capabilities', () => {
      expect(provider.capabilities).toEqual({
        snapshots: true,
        streaming: true,
        interactive: true,
        fileOperations: true,
        networkConfiguration: true,
        resourceLimits: true,
        healthChecks: true,
      });
    });
  });

  // ============================================================================
  // Spawn Tests
  // ============================================================================

  describe('spawn()', () => {
    test('should spawn a Kata runtime successfully', async () => {
      const spawnConfig: SpawnConfig = {
        runtime: 'kata',
        resources: {
          cpu: 1,
          memory: '512Mi',
        },
        image: 'busybox:latest',
        labels: {
          agentId: 'test-agent-1',
          teamId: 'test-team',
        },
      };

      const runtime = await provider.spawn(spawnConfig);
      createdRuntimes.push(runtime.id);

      expect(runtime).toBeDefined();
      expect(runtime.id).toMatch(/^kata-\d+/);
      expect(runtime.runtime).toBe('kata');
      expect(runtime.state).toBe('running');
      expect(runtime.metadata.agentId).toBe('test-agent-1');
      expect(runtime.metadata.teamId).toBe('test-team');
      expect(runtime.createdAt).toBeInstanceOf(Date);
      expect(runtime.lastActiveAt).toBeInstanceOf(Date);
    }, TEST_TIMEOUT);

    test('should enforce maxRuntimes limit', async () => {
      // Create provider with limit of 2
      const limitedProvider = new KataRuntimeProvider({
        maxRuntimes: 2,
      });

      const config: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 0.5, memory: '256Mi' },
      };

      // Spawn 2 runtimes (should succeed)
      const runtime1 = await limitedProvider.spawn(config);
      const runtime2 = await limitedProvider.spawn(config);

      // Third spawn should fail
      await expect(limitedProvider.spawn(config)).rejects.toThrow(ResourceExhaustedError);

      // Cleanup
      await limitedProvider.terminate(runtime1.id);
      await limitedProvider.terminate(runtime2.id);
      limitedProvider.dispose();
    }, TEST_TIMEOUT);

    test('should use default image when not specified', async () => {
      const config: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 1, memory: '512Mi' },
        // No image specified
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      expect(runtime).toBeDefined();
    }, TEST_TIMEOUT);

    test('should throw SpawnError on K8s API error', async () => {
      // Mock a failure
      const { KubeConfig } = require('@kubernetes/client-node');
      (KubeConfig as jest.Mock).mockImplementationOnce(() => ({
        loadFromDefault: jest.fn(),
        makeApiClient: jest.fn().mockReturnValue({
          createNamespacedPod: jest.fn().mockRejectedValue(new Error('K8s connection failed')),
        }),
      }));

      const failingProvider = new KataRuntimeProvider();

      const config: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 1, memory: '512Mi' },
      };

      await expect(failingProvider.spawn(config)).rejects.toThrow(SpawnError);
      failingProvider.dispose();
    }, TEST_TIMEOUT);
  });

  // ============================================================================
  // Terminate Tests
  // ============================================================================

  describe('terminate()', () => {
    test('should terminate a running runtime', async () => {
      const config: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      await provider.terminate(runtime.id);

      // Verify runtime is removed
      await expect(provider.getStatus(runtime.id)).rejects.toThrow(NotFoundError);
    }, TEST_TIMEOUT);

    test('should throw NotFoundError for non-existent runtime', async () => {
      await expect(provider.terminate('non-existent-id')).rejects.toThrow(NotFoundError);
    });
  });

  // ============================================================================
  // Status Tests
  // ============================================================================

  describe('getStatus()', () => {
    test('should return runtime status', async () => {
      const config: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      const status = await provider.getStatus(runtime.id);

      expect(status).toBeDefined();
      expect(status.id).toBe(runtime.id);
      expect(status.state).toBe('running');
      expect(status.health).toBe('healthy');
      expect(status.uptime).toBeGreaterThanOrEqual(0);
      expect(status.resources).toBeDefined();
    }, TEST_TIMEOUT);

    test('should throw NotFoundError for non-existent runtime', async () => {
      await expect(provider.getStatus('non-existent-id')).rejects.toThrow(NotFoundError);
    });
  });

  // ============================================================================
  // List Tests
  // ============================================================================

  describe('listRuntimes()', () => {
    test('should list all runtimes', async () => {
      const config: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 1, memory: '512Mi' },
        labels: { test: 'list-test' },
      };

      const runtime1 = await provider.spawn(config);
      const runtime2 = await provider.spawn(config);
      createdRuntimes.push(runtime1.id, runtime2.id);

      const runtimes = await provider.listRuntimes();

      expect(runtimes).toHaveLength(2);
      expect(runtimes.map(r => r.id)).toContain(runtime1.id);
      expect(runtimes.map(r => r.id)).toContain(runtime2.id);
    }, TEST_TIMEOUT);

    test('should filter by state', async () => {
      const config: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      const runningRuntimes = await provider.listRuntimes({ state: 'running' });
      expect(runningRuntimes).toHaveLength(1);

      const terminatedRuntimes = await provider.listRuntimes({ state: 'terminated' });
      expect(terminatedRuntimes).toHaveLength(0);
    }, TEST_TIMEOUT);

    test('should filter by labels', async () => {
      const config1: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 1, memory: '512Mi' },
        labels: { team: 'team-a' },
      };

      const config2: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 1, memory: '512Mi' },
        labels: { team: 'team-b' },
      };

      const runtime1 = await provider.spawn(config1);
      const runtime2 = await provider.spawn(config2);
      createdRuntimes.push(runtime1.id, runtime2.id);

      const teamARuntimes = await provider.listRuntimes({ labels: { team: 'team-a' } });
      expect(teamARuntimes).toHaveLength(1);
      expect(teamARuntimes[0].id).toBe(runtime1.id);
    }, TEST_TIMEOUT);
  });

  // ============================================================================
  // Execute Tests
  // ============================================================================

  describe('execute()', () => {
    test('should execute command in runtime', async () => {
      const config: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      const result = await provider.execute(runtime.id, 'echo hello');

      expect(result).toBeDefined();
      expect(result.exitCode).toBe(0);
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(result.metadata).toBeDefined();
      expect(result.metadata.command).toBe('echo hello');
    }, TEST_TIMEOUT);

    test('should throw NotFoundError for non-existent runtime', async () => {
      await expect(provider.execute('non-existent-id', 'echo hello')).rejects.toThrow(NotFoundError);
    });

    test('should handle command timeout', async () => {
      const config: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      // Mock a slow command that times out
      await expect(
        provider.execute(runtime.id, 'sleep 100', { timeout: 1 })
      ).rejects.toThrow(TimeoutError);
    }, TEST_TIMEOUT);
  });

  // ============================================================================
  // File Operations Tests
  // ============================================================================

  describe('readFile()', () => {
    test('should read file from runtime', async () => {
      const config: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      // First write a file
      await provider.writeFile(runtime.id, '/tmp/test.txt', Buffer.from('Hello, World!'));

      // Then read it back
      const content = await provider.readFile(runtime.id, '/tmp/test.txt');

      expect(content.toString()).toBe('Hello, World!');
    }, TEST_TIMEOUT);

    test('should throw NotFoundError for non-existent file', async () => {
      const config: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      await expect(provider.readFile(runtime.id, '/non-existent.txt')).rejects.toThrow(NotFoundError);
    }, TEST_TIMEOUT);
  });

  describe('writeFile()', () => {
    test('should write file to runtime', async () => {
      const config: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      await provider.writeFile(runtime.id, '/tmp/write-test.txt', Buffer.from('Test content'));

      // Verify by reading
      const content = await provider.readFile(runtime.id, '/tmp/write-test.txt');
      expect(content.toString()).toBe('Test content');
    }, TEST_TIMEOUT);

    test('should create parent directories', async () => {
      const config: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      await provider.writeFile(runtime.id, '/tmp/nested/dir/file.txt', Buffer.from('Nested content'));

      const content = await provider.readFile(runtime.id, '/tmp/nested/dir/file.txt');
      expect(content.toString()).toBe('Nested content');
    }, TEST_TIMEOUT);
  });

  // ============================================================================
  // Snapshot Tests
  // ============================================================================

  describe('snapshot()', () => {
    test('should create a snapshot', async () => {
      const config: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      const snapshot = await provider.snapshot(runtime.id, {
        name: 'test-snapshot',
        description: 'Test snapshot creation',
      });

      expect(snapshot).toBeDefined();
      expect(snapshot.id).toMatch(/^snap-\d+/);
      expect(snapshot.runtimeId).toBe(runtime.id);
      expect(snapshot.metadata?.name).toBe('test-snapshot');
      expect(snapshot.metadata?.description).toBe('Test snapshot creation');
      expect(snapshot.createdAt).toBeInstanceOf(Date);
      expect(snapshot.size).toBeGreaterThanOrEqual(0);
    }, TEST_TIMEOUT);

    test('should throw NotFoundError for non-existent runtime', async () => {
      await expect(provider.snapshot('non-existent-id')).rejects.toThrow(NotFoundError);
    });
  });

  describe('restore()', () => {
    test('should restore from snapshot', async () => {
      const config: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      const snapshot = await provider.snapshot(runtime.id);
      const restored = await provider.restore(snapshot.id);

      expect(restored).toBeDefined();
      expect(restored.id).toBe(runtime.id);
      expect(restored.runtime).toBe('kata');
    }, TEST_TIMEOUT);

    test('should throw NotFoundError for non-existent snapshot', async () => {
      await expect(provider.restore('non-existent-snap')).rejects.toThrow(NotFoundError);
    });
  });

  describe('listSnapshots()', () => {
    test('should list snapshots for a runtime', async () => {
      const config: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      await provider.snapshot(runtime.id);
      await provider.snapshot(runtime.id);

      const snapshots = await provider.listSnapshots(runtime.id);

      expect(snapshots).toHaveLength(2);
      expect(snapshots[0].runtimeId).toBe(runtime.id);
      expect(snapshots[1].runtimeId).toBe(runtime.id);
    }, TEST_TIMEOUT);

    test('should list all snapshots when no runtimeId specified', async () => {
      const config: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime1 = await provider.spawn(config);
      const runtime2 = await provider.spawn(config);
      createdRuntimes.push(runtime1.id, runtime2.id);

      await provider.snapshot(runtime1.id);
      await provider.snapshot(runtime2.id);

      const allSnapshots = await provider.listSnapshots();

      expect(allSnapshots).toHaveLength(2);
    }, TEST_TIMEOUT);
  });

  describe('deleteSnapshot()', () => {
    test('should delete a snapshot', async () => {
      const config: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      const snapshot = await provider.snapshot(runtime.id);
      
      await provider.deleteSnapshot(snapshot.id);

      const snapshots = await provider.listSnapshots(runtime.id);
      expect(snapshots).toHaveLength(0);
    }, TEST_TIMEOUT);

    test('should throw NotFoundError for non-existent snapshot', async () => {
      await expect(provider.deleteSnapshot('non-existent-snap')).rejects.toThrow(NotFoundError);
    });
  });

  // ============================================================================
  // Event Tests
  // ============================================================================

  describe('Events', () => {
    test('should emit stateChange events', async () => {
      const stateChanges: Array<{ from: RuntimeState; to: RuntimeState }> = [];
      
      provider.on('stateChange', (event, data) => {
        if (data.previousState && data.currentState) {
          stateChanges.push({
            from: data.previousState,
            to: data.currentState,
          });
        }
      });

      const config: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      // Should have emitted pending -> creating -> running
      expect(stateChanges.length).toBeGreaterThanOrEqual(1);
    }, TEST_TIMEOUT);
  });

  // ============================================================================
  // waitForState Tests
  // ============================================================================

  describe('waitForState()', () => {
    test('should return true when runtime reaches state', async () => {
      const config: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      const reached = await provider.waitForState(runtime.id, 'running', 5000);
      
      expect(reached).toBe(true);
    }, TEST_TIMEOUT);

    test('should return false for non-existent runtime', async () => {
      const reached = await provider.waitForState('non-existent-id', 'running', 1000);
      
      expect(reached).toBe(false);
    });

    test('should timeout when state not reached', async () => {
      const config: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      // Try to wait for a state it will never reach
      const reached = await provider.waitForState(runtime.id, 'terminated', 100);
      
      expect(reached).toBe(false);
    }, TEST_TIMEOUT);
  });

  // ============================================================================
  // Configuration Tests
  // ============================================================================

  describe('Configuration', () => {
    test('should use default configuration', () => {
      const defaultProvider = new KataRuntimeProvider();
      
      expect(defaultProvider.capabilities).toBeDefined();
      defaultProvider.dispose();
    });

    test('should accept custom configuration', () => {
      const customProvider = new KataRuntimeProvider({
        namespace: 'custom-ns',
        runtimeClassName: 'kata-custom',
        defaultImage: 'custom:latest',
        spawnTimeout: 120,
        maxRuntimes: 50,
        serviceAccountName: 'custom-sa',
      });

      expect(customProvider.capabilities).toBeDefined();
      customProvider.dispose();
    });
  });

  // ============================================================================
  // Singleton Tests
  // ============================================================================

  describe('Singleton', () => {
    test('should provide global instance', () => {
      const { 
        getGlobalKataRuntimeProvider, 
        initializeGlobalKataRuntimeProvider,
        resetGlobalKataRuntimeProvider,
        hasGlobalKataRuntimeProvider 
      } = require('../../src/core/runtime/providers/kata-runtime-provider');

      resetGlobalKataRuntimeProvider();
      expect(hasGlobalKataRuntimeProvider()).toBe(false);

      const instance = initializeGlobalKataRuntimeProvider({ namespace: 'test' });
      expect(hasGlobalKataRuntimeProvider()).toBe(true);
      expect(getGlobalKataRuntimeProvider()).toBe(instance);

      resetGlobalKataRuntimeProvider();
      expect(hasGlobalKataRuntimeProvider()).toBe(false);
    });

    test('should throw when accessing uninitialized global provider', () => {
      const { 
        getGlobalKataRuntimeProvider,
        resetGlobalKataRuntimeProvider 
      } = require('../../src/core/runtime/providers/kata-runtime-provider');

      resetGlobalKataRuntimeProvider();
      
      expect(() => getGlobalKataRuntimeProvider()).toThrow('not initialized');
    });
  });
});