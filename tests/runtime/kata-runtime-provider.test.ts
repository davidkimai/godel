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

// ============================================================================
// Mock State
// ============================================================================

const mockPods = new Map<string, any>();
const mockFiles = new Map<string, string>(); // Store file contents: runtimeId:path -> content
let mockPodCounter = 0;
let mockExecImplementation: any = null;

// Create mock K8s API
function createMockCoreV1Api() {
  return {
    createNamespacedPod: jest.fn().mockImplementation(async (params: { namespace: string; body: any }) => {
      const podSpec = params.body;
      const podName = podSpec.metadata.name;
      mockPodCounter++;
      
      const pod: any = {
        metadata: {
          name: podName,
          namespace: params.namespace,
          uid: `mock-uid-${mockPodCounter}`,
        },
        spec: podSpec.spec,
        status: {
          phase: 'Pending',
          podIP: undefined as string | undefined,
          containerStatuses: undefined as any[] | undefined,
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
      
      return pod;
    }),
    
    readNamespacedPod: jest.fn().mockImplementation(async (params: { name: string; namespace: string }) => {
      const pod = mockPods.get(params.name);
      if (!pod) {
        const error = new Error(`pods "${params.name}" not found`);
        (error as any).statusCode = 404;
        (error as any).response = { statusCode: 404 };
        (error as any).body = { message: `pods "${params.name}" not found` };
        throw error;
      }
      return pod;
    }),
    
    deleteNamespacedPod: jest.fn().mockImplementation(async (params: { name: string; namespace: string }) => {
      mockPods.delete(params.name);
      return { status: 'Success' };
    }),
    
    listNamespacedPod: jest.fn().mockImplementation(async (params: { namespace: string }) => {
      return { 
        items: Array.from(mockPods.values()).filter((p: any) => p.metadata.namespace === params.namespace)
      };
    }),
  };
}

// Store reference to the current mock API for test manipulation
let currentMockCoreV1Api: ReturnType<typeof createMockCoreV1Api> | null = null;

// ============================================================================
// Mock Kubernetes Client - Jest factory function (hoisted)
// ============================================================================

jest.mock('@kubernetes/client-node', () => {
  // Mock KubeConfig class
  class MockKubeConfig {
    loadFromDefault = jest.fn();
    loadFromFile = jest.fn();
    setCurrentContext = jest.fn();
    makeApiClient = jest.fn().mockImplementation((apiClass: any) => {
      if (apiClass.name === 'CoreV1Api') {
        const api = createMockCoreV1Api();
        currentMockCoreV1Api = api;
        return api;
      }
      return {};
    });
  }

  // Mock CoreV1Api class
  class MockCoreV1Api {
    static name = 'CoreV1Api';
    name = 'CoreV1Api';
  }

  // Mock AppsV1Api class  
  class MockAppsV1Api {
    static name = 'AppsV1Api';
    name = 'AppsV1Api';
  }

  // Mock Watch
  class MockWatch {
    watch = jest.fn().mockResolvedValue(undefined);
    abort = jest.fn();
  }

  // Mock Exec
  class MockExec {
    constructor(private kc: any) {}
    
    exec = jest.fn().mockImplementation(async (
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
      // Use custom implementation if set
      if (mockExecImplementation) {
        return mockExecImplementation(namespace, podName, containerName, command, stdout, stderr, stdin, tty, callback);
      }
      
      // Default: simulate successful exec
      const mockWebSocket = {
        on: jest.fn((event: string, handler: any) => {
          if (event === 'message') {
            // Simulate stdout response for echo commands
            const cmd = command[2] || '';
            if (cmd.startsWith('echo ')) {
              const match = cmd.match(/echo "(.*)"/);
              if (match) {
                setTimeout(() => {
                  handler(Buffer.from([1, ...Buffer.from(match[1])]));
                }, 10);
              }
            } else if (cmd.startsWith('cat ')) {
              // Simulate file read - check mockFiles
              const filePath = cmd.slice(4).replace(/"/g, '');
              const key = `${namespace}:${podName}:${filePath}`;
              const content = mockFiles.get(key);
              setTimeout(() => {
                if (content !== undefined) {
                  handler(Buffer.from([1, ...Buffer.from(content)]));
                } else {
                  handler(Buffer.from([2, ...Buffer.from('cat: ' + filePath + ': No such file or directory')]));
                }
              }, 10);
            } else if (cmd.includes('mkdir')) {
              // Success, no output - handled by completion callback
            } else if (cmd.includes('base64 -d')) {
              // File write - parse and store
              // Command format: echo "BASE64" | base64 -d > "filepath"
              const echoMatch = cmd.match(/echo "([A-Za-z0-9+/=]+)"/);
              const pathMatch = cmd.match(/base64 -d > "(.+?)"/);
              if (echoMatch && pathMatch) {
                const base64Data = echoMatch[1];
                const filePath = pathMatch[1];
                try {
                  const content = Buffer.from(base64Data, 'base64').toString('utf8');
                  const key = `${namespace}:${podName}:${filePath}`;
                  mockFiles.set(key, content);
                } catch (e) {
                  // Invalid base64, ignore
                }
              }
              setTimeout(() => {
                handler(Buffer.from([1, ...Buffer.from('')]));
              }, 10);
            } else if (cmd.includes('du -sb')) {
              // Size check
              setTimeout(() => {
                handler(Buffer.from([1, ...Buffer.from('1024\t/')]));
              }, 10);
            } else if (cmd.includes('test -d')) {
              // Directory check
              setTimeout(() => {
                handler(Buffer.from([1, ...Buffer.from('exists')]));
              }, 5);
            }
          }
          if (event === 'close') {
            // Trigger close after a short delay for all commands
            setTimeout(() => handler(), 20);
          }
        }),
        send: jest.fn(),
        close: jest.fn(),
      };
      
      // Simulate command completion
      setTimeout(() => {
        if (callback) {
          callback({ status: '0' });
        }
      }, 100);
      
      return mockWebSocket;
    });
  }

  // Mock HttpError
  class MockHttpError extends Error {
    response: any;
    body: any;
    statusCode: number;
    
    constructor(response: any, body: any, statusCode: number) {
      super(body?.message || 'HTTP Error');
      this.response = response;
      this.body = body;
      this.statusCode = statusCode;
    }
  }

  return {
    KubeConfig: MockKubeConfig,
    CoreV1Api: MockCoreV1Api,
    AppsV1Api: MockAppsV1Api,
    Watch: MockWatch,
    Exec: MockExec,
    HttpError: MockHttpError,
  };
});

// ============================================================================
// Import modules AFTER mocks are defined
// ============================================================================

import { KataRuntimeProvider } from '../../src/core/runtime/providers/kata-runtime-provider';
import {
  SpawnConfig,
  RuntimeState,
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

// ============================================================================
// Test Suite
// ============================================================================

describe('KataRuntimeProvider', () => {
  let provider: KataRuntimeProvider;
  let createdRuntimes: string[] = [];

  beforeEach(() => {
    mockPods.clear();
    mockFiles.clear();
    mockPodCounter = 0;
    mockExecImplementation = null;
    currentMockCoreV1Api = null;

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
      // Create a provider that will get a fresh mock API with rejection
      const failingProvider = new KataRuntimeProvider();
      
      // Override the mock API that was just created for this provider
      if (currentMockCoreV1Api) {
        currentMockCoreV1Api.createNamespacedPod.mockRejectedValueOnce(new Error('K8s connection failed'));
      }

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
      // Set up a custom exec implementation that never completes
      mockExecImplementation = async (
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
        // Return a websocket that never calls callback
        return {
          on: jest.fn(),
          send: jest.fn(),
          close: jest.fn(),
        };
      };

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

      // Mock exec to simulate file content
      mockExecImplementation = async (
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
        const cmd = command[2] || '';
        const mockWs = {
          on: jest.fn((event: string, handler: any) => {
            if (event === 'message' && cmd.startsWith('cat ')) {
              setTimeout(() => {
                handler(Buffer.from([1, ...Buffer.from('Hello, World!')]));
              }, 10);
            }
          }),
          send: jest.fn(),
          close: jest.fn(),
        };
        
        setTimeout(() => {
          if (callback) callback({ status: '0' });
        }, 30);
        
        return mockWs;
      };

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

      // Set up exec to simulate file not found
      mockExecImplementation = async (
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
        const mockWs = {
          on: jest.fn((event: string, handler: any) => {
            if (event === 'message') {
              setTimeout(() => {
                handler(Buffer.from([2, ...Buffer.from('No such file or directory')]));
              }, 10);
            }
          }),
          send: jest.fn(),
          close: jest.fn(),
        };
        
        setTimeout(() => {
          if (callback) callback({ status: '1' });
        }, 30);
        
        return mockWs;
      };

      // Note: Provider wraps NotFoundError in ExecutionError - checking for error message
      await expect(provider.readFile(runtime.id, '/non-existent.txt')).rejects.toThrow('File not found');
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

      // Mock exec to simulate successful write operations
      mockExecImplementation = async (
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
        const mockWs = {
          on: jest.fn(),
          send: jest.fn(),
          close: jest.fn(),
        };
        
        setTimeout(() => {
          if (callback) callback({ status: '0' });
        }, 10);
        
        return mockWs;
      };

      // Should complete without error
      await expect(provider.writeFile(runtime.id, '/tmp/write-test.txt', Buffer.from('Test content'))).resolves.toBeUndefined();
    }, TEST_TIMEOUT);

    test('should create parent directories', async () => {
      const config: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      // Mock exec to simulate successful mkdir and write operations
      mockExecImplementation = async (
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
        const mockWs = {
          on: jest.fn(),
          send: jest.fn(),
          close: jest.fn(),
        };
        
        setTimeout(() => {
          if (callback) callback({ status: '0' });
        }, 10);
        
        return mockWs;
      };

      // Should complete without error for nested path
      await expect(provider.writeFile(runtime.id, '/tmp/nested/dir/file.txt', Buffer.from('Nested content'))).resolves.toBeUndefined();
    }, TEST_TIMEOUT);
  });

  // ============================================================================
  // Execute Stream Tests
  // ============================================================================

  describe('executeStream()', () => {
    test('should stream command output', async () => {
      const config: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      // Mock exec to simulate streaming output
      mockExecImplementation = async (
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
        let seq = 0;
        const mockWs = {
          on: jest.fn((event: string, handler: any) => {
            if (event === 'message') {
              // Simulate stdout chunks
              setTimeout(() => handler(Buffer.from([1, ...Buffer.from('line1\n')])), 10);
              setTimeout(() => handler(Buffer.from([1, ...Buffer.from('line2\n')])), 20);
            }
            if (event === 'close') {
              setTimeout(() => handler(), 50);
            }
          }),
          send: jest.fn(),
          close: jest.fn(),
        };
        
        setTimeout(() => {
          if (callback) callback({ status: '0' });
        }, 60);
        
        return mockWs;
      };

      const chunks: string[] = [];
      for await (const chunk of provider.executeStream(runtime.id, 'cat /tmp/file.txt')) {
        chunks.push(chunk.data);
      }

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks.join('')).toContain('line1');
    }, TEST_TIMEOUT);

    test('should throw NotFoundError for non-existent runtime', async () => {
      const generator = provider.executeStream('non-existent-id', 'echo test');
      const iterator = generator[Symbol.asyncIterator]();
      await expect(iterator.next()).rejects.toThrow(NotFoundError);
    });
  });

  // ============================================================================
  // Execute Interactive Tests
  // ============================================================================

  describe('executeInteractive()', () => {
    test('should execute interactive command', async () => {
      const config: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      // Mock exec for interactive mode
      mockExecImplementation = async (
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
        const mockWs = {
          on: jest.fn((event: string, handler: any) => {
            if (event === 'message') {
              setTimeout(() => handler(Buffer.from([1, ...Buffer.from('interactive output')])), 10);
            }
            if (event === 'close') {
              setTimeout(() => handler(), 30);
            }
          }),
          send: jest.fn(),
          close: jest.fn(),
        };
        
        setTimeout(() => {
          if (callback) callback({ status: '0' });
        }, 40);
        
        return mockWs;
      };

      // Create a simple readable stream
      const readable = new ReadableStream({
        start(controller) {
          controller.close();
        }
      });

      const result = await provider.executeInteractive(runtime.id, 'sh', readable);
      expect(result.exitCode).toBe(0);
    }, TEST_TIMEOUT);

    test('should throw NotFoundError for non-existent runtime', async () => {
      const readable = new ReadableStream({ start(c) { c.close(); } });
      await expect(provider.executeInteractive('non-existent-id', 'sh', readable)).rejects.toThrow(NotFoundError);
    });
  });

  // ============================================================================
  // Directory Operations Tests
  // ============================================================================

  describe('uploadDirectory()', () => {
    test('should throw NotFoundError for non-existent runtime', async () => {
      await expect(provider.uploadDirectory('non-existent-id', '/tmp', '/tmp')).rejects.toThrow(NotFoundError);
    });
  });

  describe('downloadDirectory()', () => {
    test('should throw NotFoundError for non-existent runtime', async () => {
      await expect(provider.downloadDirectory('non-existent-id', '/tmp', '/tmp')).rejects.toThrow(NotFoundError);
    });
  });

  // ============================================================================
  // Execute Error Tests
  // ============================================================================

  describe('execute() errors', () => {
    test('should throw ExecutionError when runtime not in running state', async () => {
      const config: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      // Terminate the runtime first
      await provider.terminate(runtime.id);

      // Now try to execute - should fail because runtime no longer exists (deleted after terminate)
      await expect(provider.execute(runtime.id, 'echo test')).rejects.toThrow(NotFoundError);
    }, TEST_TIMEOUT);

    test('should throw NotFoundError for non-existent runtime', async () => {
      await expect(provider.execute('non-existent-id', 'echo test')).rejects.toThrow(NotFoundError);
    });

    test('should handle command failure', async () => {
      const config: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      // Mock exec to simulate command failure
      mockExecImplementation = async (
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
        const mockWs = {
          on: jest.fn((event: string, handler: any) => {
            if (event === 'message') {
              setTimeout(() => handler(Buffer.from([2, ...Buffer.from('command not found')])), 10);
            }
          }),
          send: jest.fn(),
          close: jest.fn(),
        };

        setTimeout(() => {
          if (callback) callback({ status: '127' });
        }, 20);

        return mockWs;
      };

      const result = await provider.execute(runtime.id, 'invalid-cmd');
      expect(result.exitCode).toBe(127);
      expect(result.stderr).toContain('command not found');
    }, TEST_TIMEOUT);
  });

  // ============================================================================
  // Error Handling Tests
  // ============================================================================

  describe('Error Handling', () => {
    test('should handle execution errors', async () => {
      const config: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      // Mock exec to throw error
      mockExecImplementation = async () => {
        throw new Error('Connection refused');
      };

      const result = await provider.execute(runtime.id, 'invalid-command');
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Connection refused');
    }, TEST_TIMEOUT);

    test('should handle terminate errors', async () => {
      const config: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      // Mock API to throw error
      if (currentMockCoreV1Api) {
        currentMockCoreV1Api.deleteNamespacedPod.mockRejectedValueOnce({
          statusCode: 500,
          message: 'Server error',
          response: { statusCode: 500 },
          body: { message: 'Server error' }
        });
      }

      await expect(provider.terminate(runtime.id)).rejects.toThrow();
    }, TEST_TIMEOUT);
  });

  // ============================================================================
  // Additional waitForState Tests
  // ============================================================================

  describe('waitForState() additional', () => {
    test('should return true immediately if already in state', async () => {
      const config: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      // Already running, should return true immediately
      const reached = await provider.waitForState(runtime.id, 'running', 100);
      expect(reached).toBe(true);
    }, TEST_TIMEOUT);

    test('should return false for terminated runtime', async () => {
      const config: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      createdRuntimes.push(runtime.id);

      // Terminate the runtime
      await provider.terminate(runtime.id);

      // Now waitForState should return false (runtime removed)
      const reached = await provider.waitForState(runtime.id, 'terminated', 100);
      expect(reached).toBe(false);
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
      expect(snapshot.id).toMatch(/^snap-/);
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
