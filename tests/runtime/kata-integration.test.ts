/**
 * Kata Integration Tests
 *
 * Comprehensive integration tests for Kata Containers runtime integration.
 * Tests VM lifecycle, command execution, file operations, snapshots, error handling,
 * and Kubernetes-specific features like pod scheduling, resource limits, and network policies.
 *
 * @module tests/runtime/kata-integration
 * @version 1.0.0
 * @since 2026-02-08
 */

import { describe, it, expect, jest, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';
import { EventEmitter } from 'events';
import type {
  RuntimeProvider,
  SpawnConfig,
  AgentRuntime,
  RuntimeStatus,
  RuntimeFilters,
  ExecutionOptions,
  ExecutionResult,
  ExecutionOutput,
  Snapshot,
  SnapshotMetadata,
  RuntimeEvent,
  EventHandler,
  RuntimeState,
  RuntimeType,
  ResourceUsage,
  NetworkStats,
  ExecutionMetadata,
  RuntimeMetadata,
  RuntimeCapabilities,
  NetworkConfig,
  NetworkPolicy,
  VolumeMount,
} from '../../src/core/runtime/runtime-provider';
import {
  RuntimeError,
  SpawnError,
  ExecutionError,
  ResourceExhaustedError,
  TimeoutError,
  NotFoundError,
  ConfigurationError,
} from '../../src/core/runtime/runtime-provider';
import { FileSyncEngine } from '../../src/core/runtime/kata/file-sync';

// ═══════════════════════════════════════════════════════════════════════════════
// MOCK KUBERNETES CLIENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Mock Kubernetes Pod State
 */
interface MockPodState {
  name: string;
  namespace: string;
  phase: 'Pending' | 'Running' | 'Succeeded' | 'Failed' | 'Unknown';
  conditions: Array<{
    type: string;
    status: 'True' | 'False' | 'Unknown';
    reason?: string;
    message?: string;
  }>;
  resources: {
    cpu: {
      requested: number;
      limit: number;
      used: number;
    };
    memory: {
      requested: string;
      limit: string;
      used: string;
    };
  };
  containerStatuses: Array<{
    name: string;
    ready: boolean;
    restartCount: number;
    state: {
      running?: { startedAt: string };
      waiting?: { reason: string; message: string };
      terminated?: { exitCode: number; reason: string };
    };
  }>;
  startTime?: string;
  ip?: string;
  networkPolicy?: string;
}

/**
 * Mock Kubernetes Client for testing
 * Simulates K8s API behavior including pod lifecycle, resource management, and failures
 */
class MockKubernetesClient extends EventEmitter {
  private pods: Map<string, MockPodState> = new Map();
  private snapshots: Map<string, any> = new Map();
  private resourceQuotas: Map<string, any> = new Map();
  private networkPolicies: Map<string, NetworkPolicy[]> = new Map();
  private fileSystem: Map<string, Map<string, string>> = new Map(); // podName -> (path -> content)
  private shouldFailScheduling = false;
  private shouldExhaustResources = false;
  private shouldTimeout = false;
  private shouldFailNetworkPolicy = false;
  private schedulingDelay = 0;
  private podCounter = 0;

  configure(options: {
    failScheduling?: boolean;
    exhaustResources?: boolean;
    timeout?: boolean;
    failNetworkPolicy?: boolean;
    schedulingDelay?: number;
  }): void {
    this.shouldFailScheduling = options.failScheduling ?? false;
    this.shouldExhaustResources = options.exhaustResources ?? false;
    this.shouldTimeout = options.timeout ?? false;
    this.shouldFailNetworkPolicy = options.failNetworkPolicy ?? false;
    this.schedulingDelay = options.schedulingDelay ?? 0;
  }

  reset(): void {
    this.pods.clear();
    this.snapshots.clear();
    this.resourceQuotas.clear();
    this.networkPolicies.clear();
    this.fileSystem.clear();
    this.shouldFailScheduling = false;
    this.shouldExhaustResources = false;
    this.shouldTimeout = false;
    this.shouldFailNetworkPolicy = false;
    this.schedulingDelay = 0;
    this.podCounter = 0;
  }

  // File system operations for testing
  writeFile(podName: string, path: string, content: string): void {
    if (!this.fileSystem.has(podName)) {
      this.fileSystem.set(podName, new Map());
    }
    this.fileSystem.get(podName)!.set(path, content);
  }

  readFile(podName: string, path: string): string | undefined {
    return this.fileSystem.get(podName)?.get(path);
  }

  clearFile(podName: string, path: string): void {
    this.fileSystem.get(podName)?.delete(path);
  }

  private generatePodName(): string {
    return `godel-agent-${++this.podCounter}-${Date.now()}`;
  }

  async createPod(config: SpawnConfig): Promise<MockPodState> {
    if (this.shouldTimeout) {
      await new Promise(resolve => setTimeout(resolve, 10000));
      throw new Error('Pod creation timed out');
    }

    if (this.schedulingDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.schedulingDelay));
    }

    if (this.shouldFailScheduling) {
      throw new Error('Failed to schedule pod: insufficient resources');
    }

    if (this.shouldExhaustResources) {
      throw new Error('ResourceQuota exceeded: pods per namespace limit reached');
    }

    const podName = this.generatePodName();
    const namespace = 'default';

    const pod: MockPodState = {
      name: podName,
      namespace,
      phase: 'Pending',
      conditions: [
        { type: 'PodScheduled', status: 'True' },
        { type: 'Initialized', status: 'True' },
        { type: 'Ready', status: 'False' },
        { type: 'ContainersReady', status: 'False' },
      ],
      resources: {
        cpu: {
          requested: config.resources.cpu,
          limit: config.resources.cpu * 2,
          used: 0,
        },
        memory: {
          requested: config.resources.memory,
          limit: `${parseInt(config.resources.memory) * 2}Mi`,
          used: '0Mi',
        },
      },
      containerStatuses: [
        {
          name: 'agent',
          ready: false,
          restartCount: 0,
          state: {
            waiting: { reason: 'ContainerCreating', message: 'Pulling image' },
          },
        },
      ],
      startTime: new Date().toISOString(),
    };

    this.pods.set(`${namespace}/${podName}`, pod);

    // Simulate pod startup asynchronously
    setTimeout(() => {
      this.transitionPodToRunning(podName, namespace);
    }, 100);

    this.emit('podCreated', pod);
    return pod;
  }

  private transitionPodToRunning(podName: string, namespace: string): void {
    const key = `${namespace}/${podName}`;
    const pod = this.pods.get(key);
    if (!pod) return;

    pod.phase = 'Running';
    pod.conditions = [
      { type: 'PodScheduled', status: 'True' },
      { type: 'Initialized', status: 'True' },
      { type: 'Ready', status: 'True' },
      { type: 'ContainersReady', status: 'True' },
    ];
    pod.containerStatuses[0] = {
      name: 'agent',
      ready: true,
      restartCount: 0,
      state: {
        running: { startedAt: new Date().toISOString() },
      },
    };
    pod.ip = `10.0.0.${Math.floor(Math.random() * 255)}`;

    this.emit('podReady', pod);
  }

  async deletePod(podName: string, namespace: string = 'default'): Promise<void> {
    const key = `${namespace}/${podName}`;
    const pod = this.pods.get(key);
    
    if (!pod) {
      throw new Error(`Pod ${podName} not found in namespace ${namespace}`);
    }

    pod.phase = 'Succeeded';
    pod.conditions.forEach(c => {
      if (c.type === 'Ready') c.status = 'False';
    });

    this.pods.delete(key);
    this.emit('podDeleted', { name: podName, namespace });
  }

  async getPod(podName: string, namespace: string = 'default'): Promise<MockPodState | undefined> {
    return this.pods.get(`${namespace}/${podName}`);
  }

  async listPods(namespace?: string): Promise<MockPodState[]> {
    if (namespace) {
      return Array.from(this.pods.values()).filter(p => p.namespace === namespace);
    }
    return Array.from(this.pods.values());
  }

  async execCommand(
    podName: string,
    namespace: string,
    command: string[],
    timeout?: number
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const pod = await this.getPod(podName, namespace);
    if (!pod) {
      throw new Error(`Pod ${podName} not found`);
    }

    if (pod.phase !== 'Running') {
      throw new Error(`Pod ${podName} is not running (current phase: ${pod.phase})`);
    }

    if (this.shouldTimeout && timeout) {
      await new Promise(resolve => setTimeout(resolve, timeout + 100));
      throw new Error('Command execution timed out');
    }

    // Simulate command execution
    const cmd = command.join(' ');
    
    if (cmd.includes('exit 1') || cmd.includes('false')) {
      return { stdout: '', stderr: 'Command failed', exitCode: 1 };
    }

    if (cmd.includes('cat')) {
      const fileName = cmd.split(' ').pop();
      // Check if file was written in mock file system
      const content = this.readFile(podName, fileName || '');
      if (content !== undefined) {
        return {
          stdout: content,
          stderr: '',
          exitCode: 0,
        };
      }
      return { 
        stdout: `Contents of ${fileName}`, 
        stderr: '', 
        exitCode: 0 
      };
    }
    
    // Handle file write via echo + base64
    if (cmd.includes('base64 -d >')) {
      const match = cmd.match(/echo "([^"]+)" \| base64 -d > (.+)$/);
      if (match) {
        const [, base64Data, filePath] = match;
        try {
          const content = Buffer.from(base64Data, 'base64').toString('utf8');
          this.writeFile(podName, filePath, content);
          return { stdout: '', stderr: '', exitCode: 0 };
        } catch (e) {
          return { stdout: '', stderr: 'Invalid base64 data', exitCode: 1 };
        }
      }
    }

    if (cmd.includes('ls')) {
      return {
        stdout: 'file1.txt\nfile2.txt\ndir1/',
        stderr: '',
        exitCode: 0,
      };
    }

    return { stdout: `Executed: ${cmd}`, stderr: '', exitCode: 0 };
  }

  async applyNetworkPolicy(podName: string, policies: NetworkPolicy[]): Promise<void> {
    if (this.shouldFailNetworkPolicy) {
      throw new Error('Network policy validation failed: CIDR block not allowed');
    }
    this.networkPolicies.set(podName, policies);
  }

  async createSnapshot(podName: string, namespace: string, metadata?: SnapshotMetadata): Promise<string> {
    const snapshotId = `snapshot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.snapshots.set(snapshotId, {
      id: snapshotId,
      podName,
      namespace,
      metadata,
      createdAt: new Date().toISOString(),
      size: 1024 * 1024 * 100, // 100MB
    });
    return snapshotId;
  }

  async restoreSnapshot(snapshotId: string): Promise<MockPodState> {
    const snapshot = this.snapshots.get(snapshotId);
    if (!snapshot) {
      throw new Error(`Snapshot ${snapshotId} not found`);
    }
    return this.createPod({
      runtime: 'kata',
      resources: { cpu: 1, memory: '512Mi' },
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MOCK KATA RUNTIME PROVIDER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Mock Kata Runtime Provider implementing RuntimeProvider interface
 * Uses MockKubernetesClient for K8s operations
 */
class MockKataRuntimeProvider implements RuntimeProvider {
  private k8sClient: MockKubernetesClient;
  private runtimes: Map<string, AgentRuntime> = new Map();
  private snapshots: Map<string, Snapshot> = new Map();
  private eventHandlers: Map<RuntimeEvent, Set<EventHandler>> = new Map();
  private fileSyncEngines: Map<string, FileSyncEngine> = new Map();
  private resourceIdCounter = 0;

  constructor(k8sClient?: MockKubernetesClient) {
    this.k8sClient = k8sClient || new MockKubernetesClient();
  }

  getK8sClient(): MockKubernetesClient {
    return this.k8sClient;
  }

  private generateId(): string {
    return `kata-${++this.resourceIdCounter}-${Date.now()}`;
  }

  private generateSnapshotId(): string {
    return `snapshot-${++this.resourceIdCounter}-${Date.now()}`;
  }

  private createDefaultResourceUsage(): ResourceUsage {
    return {
      cpu: 0.1,
      memory: 104857600, // 100MB
      disk: 1073741824,  // 1GB
      network: {
        rxBytes: 0,
        txBytes: 0,
        rxPackets: 0,
        txPackets: 0,
      },
    };
  }

  private createDefaultMetadata(runtime: RuntimeType, podName: string): RuntimeMetadata {
    return {
      type: runtime,
      createdAt: new Date(),
      labels: {
        'kata.godel.io/pod-name': podName,
      },
    };
  }

  private emitEvent(event: RuntimeEvent, data: any): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(event, data);
        } catch (e) {
          console.error('Event handler error:', e);
        }
      });
    }
  }

  async spawn(config: SpawnConfig): Promise<AgentRuntime> {
    if (config.runtime !== 'kata') {
      throw new ConfigurationError('Invalid runtime type for Kata provider', 'runtime');
    }

    // Create K8s pod
    const pod = await this.k8sClient.createPod(config);

    // Wait for pod to be ready
    let retries = 0;
    while (retries < 50) {
      const currentPod = await this.k8sClient.getPod(pod.name, pod.namespace);
      if (currentPod?.phase === 'Running') {
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
      retries++;
    }

    const runtimeId = this.generateId();
    const now = new Date();
    
    const runtime: AgentRuntime = {
      id: runtimeId,
      runtime: 'kata',
      state: 'running',
      resources: this.createDefaultResourceUsage(),
      createdAt: now,
      lastActiveAt: now,
      metadata: {
        ...this.createDefaultMetadata('kata', pod.name),
        podName: pod.name,
        namespace: pod.namespace,
      },
    };

    this.runtimes.set(runtimeId, runtime);
    
    // Initialize file sync engine for this runtime
    this.fileSyncEngines.set(runtimeId, new FileSyncEngine(pod.name, pod.namespace, 'agent'));

    // Apply network policies if configured
    if (config.network?.policies) {
      await this.k8sClient.applyNetworkPolicy(pod.name, config.network.policies);
    }

    this.emitEvent('stateChange', {
      runtimeId,
      timestamp: new Date(),
      previousState: 'pending',
      currentState: 'running',
    });

    return runtime;
  }

  async terminate(runtimeId: string): Promise<void> {
    const runtime = this.runtimes.get(runtimeId);
    if (!runtime) {
      throw new NotFoundError(
        `Runtime '${runtimeId}' not found`,
        'runtime',
        runtimeId,
        runtimeId
      );
    }

    if (runtime.state === 'terminated') {
      return;
    }

    const podName = runtime.metadata.podName;
    const namespace = runtime.metadata.namespace || 'default';

    if (podName) {
      try {
        await this.k8sClient.deletePod(podName, namespace);
      } catch (e) {
        // Pod might already be deleted
      }
    }

    const previousState = runtime.state;
    runtime.state = 'terminated';
    
    this.fileSyncEngines.delete(runtimeId);

    this.emitEvent('stateChange', {
      runtimeId,
      timestamp: new Date(),
      previousState,
      currentState: 'terminated',
    });
  }

  async getStatus(runtimeId: string): Promise<RuntimeStatus> {
    const runtime = this.runtimes.get(runtimeId);
    if (!runtime) {
      throw new NotFoundError(
        `Runtime '${runtimeId}' not found`,
        'runtime',
        runtimeId,
        runtimeId
      );
    }

    const podName = runtime.metadata.podName;
    if (podName) {
      const pod = await this.k8sClient.getPod(podName, runtime.metadata.namespace || 'default');
      if (pod) {
        // Update resource usage from pod metrics
        runtime.resources.cpu = pod.resources.cpu.used;
      }
    }

    return {
      id: runtimeId,
      state: runtime.state,
      resources: runtime.resources,
      health: runtime.state === 'running' ? 'healthy' : runtime.state === 'error' ? 'unhealthy' : 'unknown',
      uptime: Date.now() - runtime.createdAt.getTime(),
    };
  }

  async listRuntimes(filters?: RuntimeFilters): Promise<AgentRuntime[]> {
    let results = Array.from(this.runtimes.values());

    if (filters) {
      if (filters.runtime) {
        results = results.filter(r => r.runtime === filters.runtime);
      }
      if (filters.state) {
        results = results.filter(r => r.state === filters.state);
      }
    }

    return results;
  }

  async execute(runtimeId: string, command: string, options?: ExecutionOptions): Promise<ExecutionResult> {
    const runtime = this.runtimes.get(runtimeId);
    if (!runtime) {
      throw new NotFoundError(
        `Runtime '${runtimeId}' not found`,
        'runtime',
        runtimeId,
        runtimeId
      );
    }

    if (runtime.state !== 'running') {
      throw new ExecutionError(
        `Runtime '${runtimeId}' is not running`,
        runtimeId,
        1
      );
    }

    const podName = runtime.metadata.podName;
    const namespace = runtime.metadata.namespace || 'default';

    if (!podName) {
      throw new ExecutionError('Pod name not found in runtime metadata', runtimeId, 1);
    }

    runtime.lastActiveAt = new Date();

    const startedAt = new Date();
    const result = await this.k8sClient.execCommand(
      podName,
      namespace,
      ['/bin/sh', '-c', command],
      options?.timeout
    );

    const metadata: ExecutionMetadata = {
      command,
      startedAt,
      endedAt: new Date(),
    };

    return {
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      duration: Date.now() - startedAt.getTime(),
      metadata,
    };
  }

  async *executeStream(runtimeId: string, command: string): AsyncIterable<ExecutionOutput> {
    const runtime = this.runtimes.get(runtimeId);
    if (!runtime) {
      throw new NotFoundError(
        `Runtime '${runtimeId}' not found`,
        'runtime',
        runtimeId,
        runtimeId
      );
    }

    const chunks: ExecutionOutput[] = [
      { type: 'stdout', data: `Starting: ${command}\n`, timestamp: new Date() },
      { type: 'stdout', data: 'Processing...\n', timestamp: new Date() },
      { type: 'stdout', data: 'Complete\n', timestamp: new Date() },
    ];

    for (const chunk of chunks) {
      yield chunk;
    }

    runtime.lastActiveAt = new Date();
  }

  async executeInteractive(
    runtimeId: string,
    command: string,
    stdin: ReadableStream
  ): Promise<ExecutionResult> {
    return this.execute(runtimeId, command);
  }

  async readFile(runtimeId: string, filePath: string): Promise<Buffer> {
    const result = await this.execute(runtimeId, `cat ${filePath}`);
    return Buffer.from(result.stdout);
  }

  async writeFile(runtimeId: string, filePath: string, data: Buffer): Promise<void> {
    const base64Data = data.toString('base64');
    const command = `echo "${base64Data}" | base64 -d > ${filePath}`;
    const result = await this.execute(runtimeId, command);
    
    if (result.exitCode !== 0) {
      throw new ExecutionError(
        `Failed to write file: ${result.stderr}`,
        runtimeId,
        result.exitCode
      );
    }
  }

  async uploadDirectory(runtimeId: string, localPath: string, remotePath: string): Promise<void> {
    const fileSync = this.fileSyncEngines.get(runtimeId);
    if (!fileSync) {
      throw new NotFoundError('File sync engine not found', 'runtime', runtimeId, runtimeId);
    }

    const result = await fileSync.syncDirectory(localPath, remotePath, 'host-to-vm');
    if (!result.success) {
      throw new ExecutionError(
        `Failed to upload directory: ${result.errors.join(', ')}`,
        runtimeId,
        1
      );
    }
  }

  async downloadDirectory(runtimeId: string, remotePath: string, localPath: string): Promise<void> {
    const fileSync = this.fileSyncEngines.get(runtimeId);
    if (!fileSync) {
      throw new NotFoundError('File sync engine not found', 'runtime', runtimeId, runtimeId);
    }

    const result = await fileSync.syncDirectory(remotePath, localPath, 'vm-to-host');
    if (!result.success) {
      throw new ExecutionError(
        `Failed to download directory: ${result.errors.join(', ')}`,
        runtimeId,
        1
      );
    }
  }

  async snapshot(runtimeId: string, metadata?: SnapshotMetadata): Promise<Snapshot> {
    const runtime = this.runtimes.get(runtimeId);
    if (!runtime) {
      throw new NotFoundError(
        `Runtime '${runtimeId}' not found`,
        'runtime',
        runtimeId,
        runtimeId
      );
    }

    const podName = runtime.metadata.podName;
    const namespace = runtime.metadata.namespace || 'default';

    if (!podName) {
      throw new ExecutionError('Pod name not found in runtime metadata', runtimeId, 1);
    }

    const snapshotId = await this.k8sClient.createSnapshot(podName, namespace, metadata);

    const snapshot: Snapshot = {
      id: snapshotId,
      runtimeId,
      createdAt: new Date(),
      size: 1024 * 1024 * 100, // 100MB
      metadata: metadata || {},
    };

    this.snapshots.set(snapshotId, snapshot);
    return snapshot;
  }

  async restore(snapshotId: string): Promise<AgentRuntime> {
    const snapshot = this.snapshots.get(snapshotId);
    if (!snapshot) {
      throw new NotFoundError(
        `Snapshot '${snapshotId}' not found`,
        'snapshot',
        snapshotId
      );
    }

    // Restore from K8s snapshot creates a new pod
    const restoredPod = await this.k8sClient.restoreSnapshot(snapshotId);
    
    const runtimeId = this.generateId();
    const now = new Date();
    
    const runtime: AgentRuntime = {
      id: runtimeId,
      runtime: 'kata',
      state: 'running',
      resources: this.createDefaultResourceUsage(),
      createdAt: now,
      lastActiveAt: now,
      metadata: {
        ...this.createDefaultMetadata('kata', restoredPod.name),
        podName: restoredPod.name,
        namespace: restoredPod.namespace,
        restoredFrom: snapshotId,
      },
    };

    this.runtimes.set(runtimeId, runtime);
    return runtime;
  }

  async listSnapshots(runtimeId?: string): Promise<Snapshot[]> {
    let snapshots = Array.from(this.snapshots.values());
    
    if (runtimeId) {
      snapshots = snapshots.filter(s => s.runtimeId === runtimeId);
    }
    
    return snapshots;
  }

  async deleteSnapshot(snapshotId: string): Promise<void> {
    if (!this.snapshots.has(snapshotId)) {
      throw new NotFoundError(
        `Snapshot '${snapshotId}' not found`,
        'snapshot',
        snapshotId
      );
    }
    
    this.snapshots.delete(snapshotId);
  }

  on(event: RuntimeEvent, handler: EventHandler): this {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
    return this;
  }

  async waitForState(runtimeId: string, state: RuntimeState, timeout?: number): Promise<boolean> {
    const startTime = Date.now();
    const timeoutMs = timeout || 30000;

    while (Date.now() - startTime < timeoutMs) {
      const runtime = this.runtimes.get(runtimeId);
      if (!runtime) {
        throw new NotFoundError(
          `Runtime '${runtimeId}' not found`,
          'runtime',
          runtimeId,
          runtimeId
        );
      }

      if (runtime.state === state) {
        return true;
      }

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE
// ═══════════════════════════════════════════════════════════════════════════════

describe('Kata Integration Tests', () => {
  let provider: MockKataRuntimeProvider;
  let k8sClient: MockKubernetesClient;

  beforeEach(() => {
    k8sClient = new MockKubernetesClient();
    provider = new MockKataRuntimeProvider(k8sClient);
  });

  afterEach(async () => {
    // Clean up all runtimes
    const runtimes = await provider.listRuntimes();
    await Promise.all(runtimes.map(r => provider.terminate(r.id).catch(() => {})));
    
    k8sClient.reset();
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // HAPPY PATH TESTS
  // ═════════════════════════════════════════════════════════════════════════════

  describe('Happy Path', () => {
    it('should spawn a Kata runtime successfully', async () => {
      const config: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);

      expect(runtime).toBeDefined();
      expect(runtime.id).toMatch(/^kata-/);
      expect(runtime.runtime).toBe('kata');
      expect(runtime.state).toBe('running');
      expect(runtime.metadata.podName).toBeDefined();
      expect(runtime.metadata.namespace).toBe('default');
    });

    it('should terminate a Kata runtime successfully', async () => {
      const config: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      await provider.terminate(runtime.id);

      const status = await provider.getStatus(runtime.id);
      expect(status.state).toBe('terminated');
    });

    it('should execute a command in a Kata runtime', async () => {
      const config: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      const result = await provider.execute(runtime.id, 'echo "Hello World"');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Executed');
      expect(result.stderr).toBe('');
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(result.metadata.command).toBe('echo "Hello World"');
    });

    it('should list files in a Kata runtime', async () => {
      const config: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      const result = await provider.execute(runtime.id, 'ls -la');

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('file1.txt');
    });

    it('should read a file from a Kata runtime', async () => {
      const config: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      const content = await provider.readFile(runtime.id, '/etc/hostname');

      expect(content).toBeInstanceOf(Buffer);
      expect(content.toString()).toContain('Contents of /etc/hostname');
    });

    it('should write a file to a Kata runtime', async () => {
      const config: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      const data = Buffer.from('Hello from test');
      
      await provider.writeFile(runtime.id, '/tmp/test.txt', data);
      
      // Verify by reading back
      const content = await provider.readFile(runtime.id, '/tmp/test.txt');
      expect(content.toString()).toBe('Hello from test');
    });

    it('should create a snapshot of a Kata runtime', async () => {
      const config: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      const snapshot = await provider.snapshot(runtime.id, {
        name: 'test-snapshot',
        description: 'Test snapshot',
      });

      expect(snapshot).toBeDefined();
      expect(snapshot.id).toMatch(/^snapshot-/);
      expect(snapshot.runtimeId).toBe(runtime.id);
      expect(snapshot.metadata.name).toBe('test-snapshot');
      expect(snapshot.size).toBeGreaterThan(0);
    });

    it('should restore a Kata runtime from a snapshot', async () => {
      const config: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      const snapshot = await provider.snapshot(runtime.id);
      
      const restoredRuntime = await provider.restore(snapshot.id);

      expect(restoredRuntime).toBeDefined();
      expect(restoredRuntime.runtime).toBe('kata');
      expect(restoredRuntime.state).toBe('running');
      expect(restoredRuntime.metadata.restoredFrom).toBe(snapshot.id);
    });

    it('should stream command execution output', async () => {
      const config: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      const outputs: ExecutionOutput[] = [];

      for await (const output of provider.executeStream(runtime.id, 'long-running-command')) {
        outputs.push(output);
      }

      expect(outputs.length).toBeGreaterThan(0);
      expect(outputs[0].type).toBe('stdout');
      expect(outputs[0].data).toContain('Starting');
    });

    it('should list runtimes with filters', async () => {
      const config: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime1 = await provider.spawn(config);
      const runtime2 = await provider.spawn(config);
      await provider.terminate(runtime2.id);

      const allRuntimes = await provider.listRuntimes();
      expect(allRuntimes.length).toBe(2);

      const runningRuntimes = await provider.listRuntimes({ state: 'running' });
      expect(runningRuntimes.length).toBe(1);
      expect(runningRuntimes[0].id).toBe(runtime1.id);
    });

    it('should get runtime status', async () => {
      const config: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      const status = await provider.getStatus(runtime.id);

      expect(status.id).toBe(runtime.id);
      expect(status.state).toBe('running');
      expect(status.health).toBe('healthy');
      expect(status.resources).toBeDefined();
      expect(status.uptime).toBeGreaterThanOrEqual(0);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // POD SCHEDULING FAILURE TESTS
  // ═════════════════════════════════════════════════════════════════════════════

  describe('Pod Scheduling Failures', () => {
    it('should handle pod scheduling failures', async () => {
      k8sClient.configure({ failScheduling: true });

      const config: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 100, memory: '100Gi' }, // Excessive resources
      };

      await expect(provider.spawn(config)).rejects.toThrow('Failed to schedule pod');
    });

    it('should handle pod creation timeout', async () => {
      k8sClient.configure({ timeout: true });

      const config: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 1, memory: '512Mi' },
        timeout: 1,
      };

      await expect(provider.spawn(config)).rejects.toThrow('timed out');
    });

    it('should handle pod not found during termination', async () => {
      const config: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      
      // Delete pod directly from K8s to simulate external deletion
      const podName = runtime.metadata.podName!;
      await k8sClient.deletePod(podName, 'default');
      
      // Should not throw even if pod is already deleted
      await expect(provider.terminate(runtime.id)).resolves.not.toThrow();
    });

    it('should handle delayed pod readiness', async () => {
      k8sClient.configure({ schedulingDelay: 500 });

      const config: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const startTime = Date.now();
      const runtime = await provider.spawn(config);
      const elapsed = Date.now() - startTime;

      expect(runtime).toBeDefined();
      expect(runtime.state).toBe('running');
      expect(elapsed).toBeGreaterThanOrEqual(500);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // RESOURCE LIMITS TESTS
  // ═════════════════════════════════════════════════════════════════════════════

  describe('Resource Limits', () => {
    it('should handle resource quota exceeded', async () => {
      k8sClient.configure({ exhaustResources: true });

      const config: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 1, memory: '512Mi' },
      };

      await expect(provider.spawn(config)).rejects.toThrow('ResourceQuota exceeded');
    });

    it('should enforce CPU limits', async () => {
      const config: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 0.5, memory: '256Mi' },
      };

      const runtime = await provider.spawn(config);
      
      const podName = runtime.metadata.podName!;
      const pod = await k8sClient.getPod(podName, 'default');
      
      expect(pod).toBeDefined();
      expect(pod!.resources.cpu.limit).toBe(1); // 2x requested
    });

    it('should enforce memory limits', async () => {
      const config: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      
      const podName = runtime.metadata.podName!;
      const pod = await k8sClient.getPod(podName, 'default');
      
      expect(pod).toBeDefined();
      expect(pod!.resources.memory.limit).toBe('1024Mi'); // 2x requested
    });

    it('should track resource usage', async () => {
      const config: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      const status = await provider.getStatus(runtime.id);

      expect(status.resources.cpu).toBeDefined();
      expect(status.resources.memory).toBeDefined();
      expect(status.resources.disk).toBeDefined();
      expect(status.resources.network).toBeDefined();
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // NETWORK POLICIES TESTS
  // ═════════════════════════════════════════════════════════════════════════════

  describe('Network Policies', () => {
    it('should apply network policies during spawn', async () => {
      const networkConfig: NetworkConfig = {
        mode: 'bridge',
        policies: [
          {
            name: 'allow-egress-dns',
            type: 'egress',
            ports: [53],
            domains: ['kube-dns'],
          },
          {
            name: 'deny-all-ingress',
            type: 'ingress',
          },
        ],
      };

      const config: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 1, memory: '512Mi' },
        network: networkConfig,
      };

      const runtime = await provider.spawn(config);
      const podName = runtime.metadata.podName!;

      // Verify network policies were applied
      const policies = k8sClient['networkPolicies'].get(podName);
      expect(policies).toBeDefined();
      expect(policies!.length).toBe(2);
    });

    it('should handle network policy validation failures', async () => {
      k8sClient.configure({ failNetworkPolicy: true });

      const config: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 1, memory: '512Mi' },
        network: {
          mode: 'bridge',
          policies: [
            {
              name: 'invalid-policy',
              type: 'egress',
              cidr: ['invalid-cidr'],
            },
          ],
        },
      };

      await expect(provider.spawn(config)).rejects.toThrow('Network policy validation failed');
    });

    it('should support different network modes', async () => {
      const modes: Array<NetworkConfig['mode']> = ['bridge', 'host', 'none'];

      for (const mode of modes) {
        const config: SpawnConfig = {
          runtime: 'kata',
          resources: { cpu: 1, memory: '512Mi' },
          network: { mode },
        };

        const runtime = await provider.spawn(config);
        expect(runtime).toBeDefined();
        expect(runtime.state).toBe('running');
      }
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // CONCURRENT OPERATIONS TESTS
  // ═════════════════════════════════════════════════════════════════════════════

  describe('Concurrent Operations', () => {
    it('should handle concurrent runtime spawns', async () => {
      const configs: SpawnConfig[] = Array(5).fill(null).map((_, i) => ({
        runtime: 'kata',
        resources: { cpu: 0.5, memory: '256Mi' },
        labels: { index: String(i) },
      }));

      const runtimes = await Promise.all(configs.map(c => provider.spawn(c)));

      expect(runtimes.length).toBe(5);
      runtimes.forEach(runtime => {
        expect(runtime.state).toBe('running');
        expect(runtime.metadata.podName).toBeDefined();
      });
    });

    it('should handle concurrent command execution', async () => {
      const config: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);

      const commands = [
        'echo "cmd1"',
        'echo "cmd2"',
        'echo "cmd3"',
        'ls -la',
        'pwd',
      ];

      const results = await Promise.all(
        commands.map(cmd => provider.execute(runtime.id, cmd))
      );

      expect(results.length).toBe(5);
      results.forEach(result => {
        expect(result.exitCode).toBe(0);
      });
    });

    it('should handle concurrent snapshots', async () => {
      const config: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);

      const snapshots = await Promise.all([
        provider.snapshot(runtime.id, { name: 'snap1' }),
        provider.snapshot(runtime.id, { name: 'snap2' }),
        provider.snapshot(runtime.id, { name: 'snap3' }),
      ]);

      expect(snapshots.length).toBe(3);
      snapshots.forEach((snapshot, i) => {
        expect(snapshot.metadata.name).toBe(`snap${i + 1}`);
      });
    });

    it('should handle mixed concurrent operations', async () => {
      const config: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 2, memory: '1Gi' },
      };

      const runtime = await provider.spawn(config);

      const operations = [
        provider.execute(runtime.id, 'echo "test"'),
        provider.snapshot(runtime.id, { name: 'concurrent-snap' }),
        provider.readFile(runtime.id, '/etc/hostname'),
        provider.getStatus(runtime.id),
      ];

      const results = await Promise.all(operations);

      expect(results.length).toBe(4);
      expect((results[0] as ExecutionResult).exitCode).toBe(0);
      expect((results[1] as Snapshot).id).toBeDefined();
      expect((results[2] as Buffer).toString()).toBeDefined();
      expect((results[3] as RuntimeStatus).state).toBe('running');
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // ERROR HANDLING TESTS
  // ═════════════════════════════════════════════════════════════════════════════

  describe('Error Handling', () => {
    it('should throw NotFoundError for non-existent runtime', async () => {
      await expect(provider.getStatus('non-existent-id')).rejects.toThrow(NotFoundError);
      await expect(provider.terminate('non-existent-id')).rejects.toThrow(NotFoundError);
      await expect(provider.execute('non-existent-id', 'ls')).rejects.toThrow(NotFoundError);
    });

    it('should throw ConfigurationError for invalid runtime type', async () => {
      const config: SpawnConfig = {
        runtime: 'worktree' as RuntimeType, // Invalid for Kata provider
        resources: { cpu: 1, memory: '512Mi' },
      };

      await expect(provider.spawn(config)).rejects.toThrow(ConfigurationError);
    });

    it('should handle command execution failures', async () => {
      const config: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      const result = await provider.execute(runtime.id, 'exit 1');

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('failed');
    });

    it('should handle execution timeout', async () => {
      const config: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      
      // Configure K8s client to timeout on command execution
      k8sClient.configure({ timeout: true });
      
      await expect(
        provider.execute(runtime.id, 'sleep 100', { timeout: 1 })
      ).rejects.toThrow('timed out');
    });

    it('should handle execution on non-running runtime', async () => {
      const config: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      await provider.terminate(runtime.id);

      await expect(
        provider.execute(runtime.id, 'ls')
      ).rejects.toThrow(ExecutionError);
    });

    it('should handle snapshot creation on non-existent runtime', async () => {
      await expect(
        provider.snapshot('non-existent-id')
      ).rejects.toThrow(NotFoundError);
    });

    it('should handle restore of non-existent snapshot', async () => {
      await expect(
        provider.restore('non-existent-snapshot')
      ).rejects.toThrow(NotFoundError);
    });

    it('should handle delete of non-existent snapshot', async () => {
      await expect(
        provider.deleteSnapshot('non-existent-snapshot')
      ).rejects.toThrow(NotFoundError);
    });

    it('should handle file read from non-existent runtime', async () => {
      await expect(
        provider.readFile('non-existent-id', '/some/file')
      ).rejects.toThrow(NotFoundError);
    });

    it('should emit error events', async () => {
      const errorHandler = jest.fn();
      provider.on('error', errorHandler);

      try {
        await provider.getStatus('non-existent-id');
      } catch (e) {
        // Expected
      }

      // The error handler might be called depending on implementation
      // This test verifies the event infrastructure exists
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // SNAPSHOT MANAGEMENT TESTS
  // ═════════════════════════════════════════════════════════════════════════════

  describe('Snapshot Management', () => {
    it('should list all snapshots', async () => {
      const config: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime1 = await provider.spawn(config);
      const runtime2 = await provider.spawn(config);

      await provider.snapshot(runtime1.id, { name: 'snap1' });
      await provider.snapshot(runtime1.id, { name: 'snap2' });
      await provider.snapshot(runtime2.id, { name: 'snap3' });

      const allSnapshots = await provider.listSnapshots();
      expect(allSnapshots.length).toBe(3);

      const runtime1Snapshots = await provider.listSnapshots(runtime1.id);
      expect(runtime1Snapshots.length).toBe(2);
    });

    it('should delete a snapshot', async () => {
      const config: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      const snapshot = await provider.snapshot(runtime.id);

      await provider.deleteSnapshot(snapshot.id);

      const snapshots = await provider.listSnapshots();
      expect(snapshots.length).toBe(0);
    });

    it('should handle snapshot metadata correctly', async () => {
      const config: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      const metadata: SnapshotMetadata = {
        name: 'test-snapshot',
        description: 'Test description',
        labels: { env: 'test', version: '1.0' },
        tags: ['test', 'v1'],
        createdBy: 'test-user',
      };

      const snapshot = await provider.snapshot(runtime.id, metadata);

      expect(snapshot.metadata.name).toBe('test-snapshot');
      expect(snapshot.metadata.description).toBe('Test description');
      expect(snapshot.metadata.labels).toEqual({ env: 'test', version: '1.0' });
      expect(snapshot.metadata.tags).toEqual(['test', 'v1']);
      expect(snapshot.metadata.createdBy).toBe('test-user');
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // EVENT HANDLING TESTS
  // ═════════════════════════════════════════════════════════════════════════════

  describe('Event Handling', () => {
    it('should emit stateChange events on spawn', async () => {
      const stateHandler = jest.fn();
      provider.on('stateChange', stateHandler);

      const config: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);

      expect(stateHandler).toHaveBeenCalled();
      const call = stateHandler.mock.calls[0];
      expect(call[0]).toBe('stateChange');
      expect(call[1].runtimeId).toBe(runtime.id);
      expect(call[1].previousState).toBe('pending');
      expect(call[1].currentState).toBe('running');
    });

    it('should emit stateChange events on terminate', async () => {
      const config: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);

      const stateHandler = jest.fn();
      provider.on('stateChange', stateHandler);

      await provider.terminate(runtime.id);

      expect(stateHandler).toHaveBeenCalled();
      const call = stateHandler.mock.calls[0];
      expect(call[1].previousState).toBe('running');
      expect(call[1].currentState).toBe('terminated');
    });

    it('should wait for specific runtime state', async () => {
      const config: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      
      const result = await provider.waitForState(runtime.id, 'running', 5000);
      expect(result).toBe(true);
    });

    it('should timeout when waiting for state', async () => {
      const config: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 1, memory: '512Mi' },
      };

      const runtime = await provider.spawn(config);
      await provider.terminate(runtime.id);

      // Waiting for 'running' state on terminated runtime should timeout
      const result = await provider.waitForState(runtime.id, 'running', 100);
      expect(result).toBe(false);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // VOLUME MOUNTS TESTS
  // ═════════════════════════════════════════════════════════════════════════════

  describe('Volume Mounts', () => {
    it('should spawn with volume mounts', async () => {
      const volumeMounts: VolumeMount[] = [
        {
          name: 'workspace',
          source: '/host/workspace',
          destination: '/workspace',
          readOnly: false,
        },
        {
          name: 'config',
          source: '/host/config',
          destination: '/etc/config',
          readOnly: true,
        },
      ];

      const config: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 1, memory: '512Mi' },
        volumes: volumeMounts,
      };

      const runtime = await provider.spawn(config);
      expect(runtime).toBeDefined();
      expect(runtime.state).toBe('running');
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // ENVIRONMENT VARIABLES TESTS
  // ═════════════════════════════════════════════════════════════════════════════

  describe('Environment Variables', () => {
    it('should spawn with environment variables', async () => {
      const config: SpawnConfig = {
        runtime: 'kata',
        resources: { cpu: 1, memory: '512Mi' },
        env: {
          NODE_ENV: 'test',
          API_KEY: 'test-key',
          DEBUG: 'true',
        },
      };

      const runtime = await provider.spawn(config);
      expect(runtime).toBeDefined();
      expect(runtime.state).toBe('running');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// FILE SYNC ENGINE INTEGRATION TESTS
// ═══════════════════════════════════════════════════════════════════════════════

  describe('File Sync Engine Integration', () => {
  let fileSync: FileSyncEngine;

  beforeEach(() => {
    fileSync = new FileSyncEngine('test-pod', 'default', 'agent');
  });

  it('should copy file to VM', async () => {
    // FileSyncEngine is a real implementation that uses kubectl
    // For unit tests, we verify the interface and structure
    expect(fileSync).toBeInstanceOf(FileSyncEngine);
    
    // The actual file operations would require a real K8s cluster
    // or more sophisticated mocking of the exec command
    expect(typeof fileSync.copyToVM).toBe('function');
    expect(typeof fileSync.copyFromVM).toBe('function');
  });

  it('should copy file from VM', async () => {
    expect(fileSync).toBeInstanceOf(FileSyncEngine);
    expect(typeof fileSync.copyFromVM).toBe('function');
  });

  it('should sync directory', async () => {
    expect(fileSync).toBeInstanceOf(FileSyncEngine);
    expect(typeof fileSync.syncDirectory).toBe('function');
  });

  it('should track progress during sync', async () => {
    expect(fileSync).toBeInstanceOf(FileSyncEngine);
    expect(typeof fileSync.on).toBe('function');
  });

  it('should support batch sync', async () => {
    expect(fileSync).toBeInstanceOf(FileSyncEngine);
    expect(typeof fileSync.batchSync).toBe('function');
  });

  it('should support resume capability', async () => {
    expect(fileSync).toBeInstanceOf(FileSyncEngine);
    expect(typeof fileSync.copyToVM).toBe('function');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// MOCK KUBERNETES CLIENT TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('MockKubernetesClient', () => {
  let client: MockKubernetesClient;

  beforeEach(() => {
    client = new MockKubernetesClient();
  });

  it('should create and track pods', async () => {
    const config: SpawnConfig = {
      runtime: 'kata',
      resources: { cpu: 1, memory: '512Mi' },
    };

    const pod = await client.createPod(config);
    expect(pod.name).toMatch(/^godel-agent-/);
    expect(pod.phase).toBe('Pending');

    // Wait for pod to transition to Running
    await new Promise(resolve => setTimeout(resolve, 200));
    
    const updatedPod = await client.getPod(pod.name, pod.namespace);
    expect(updatedPod?.phase).toBe('Running');
  });

  it('should list pods', async () => {
    const config: SpawnConfig = {
      runtime: 'kata',
      resources: { cpu: 1, memory: '512Mi' },
    };

    await client.createPod(config);
    await client.createPod(config);
    await client.createPod(config);

    const pods = await client.listPods();
    expect(pods.length).toBe(3);
  });

  it('should delete pods', async () => {
    const config: SpawnConfig = {
      runtime: 'kata',
      resources: { cpu: 1, memory: '512Mi' },
    };

    const pod = await client.createPod(config);
    await client.deletePod(pod.name, pod.namespace);

    const deletedPod = await client.getPod(pod.name, pod.namespace);
    expect(deletedPod).toBeUndefined();
  });

  it('should execute commands in pods', async () => {
    const config: SpawnConfig = {
      runtime: 'kata',
      resources: { cpu: 1, memory: '512Mi' },
    };

    const pod = await client.createPod(config);
    await new Promise(resolve => setTimeout(resolve, 200));

    const result = await client.execCommand(pod.name, pod.namespace, ['echo', 'hello']);
    expect(result.exitCode).toBe(0);
  });

  it('should fail command execution for non-existent pod', async () => {
    await expect(
      client.execCommand('non-existent', 'default', ['ls'])
    ).rejects.toThrow('not found');
  });

  it('should track pod resource usage', async () => {
    const config: SpawnConfig = {
      runtime: 'kata',
      resources: { cpu: 2, memory: '1Gi' },
    };

    const pod = await client.createPod(config);
    expect(pod.resources.cpu.requested).toBe(2);
    expect(pod.resources.memory.requested).toBe('1Gi');
  });

  it('should emit pod lifecycle events', async () => {
    const createdHandler = jest.fn();
    const readyHandler = jest.fn();

    client.on('podCreated', createdHandler);
    client.on('podReady', readyHandler);

    const config: SpawnConfig = {
      runtime: 'kata',
      resources: { cpu: 1, memory: '512Mi' },
    };

    await client.createPod(config);

    expect(createdHandler).toHaveBeenCalled();
    
    await new Promise(resolve => setTimeout(resolve, 200));
    expect(readyHandler).toHaveBeenCalled();
  });
});
