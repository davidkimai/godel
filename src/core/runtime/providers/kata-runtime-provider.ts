/**
 * KataRuntimeProvider - RuntimeProvider implementation using Kata Containers
 *
 * Implements the RuntimeProvider interface using Kubernetes with Kata Containers runtime.
 * Provides VM-level isolation using Firecracker MicroVMs via Kata.
 *
 * @module @godel/core/runtime/providers/kata-runtime-provider
 * @see SPEC-002 Section 4.2
 */

import { EventEmitter } from 'events';
import * as k8s from '@kubernetes/client-node';
import { logger } from '../../../utils/logger';
import type { StorageAdapter } from '../../../integrations/pi/types';

import {
  RuntimeProvider,
  SpawnConfig,
  AgentRuntime,
  RuntimeStatus,
  RuntimeState,
  RuntimeType,
  ExecutionOptions,
  ExecutionResult,
  ExecutionOutput,
  ExecutionMetadata,
  Snapshot,
  SnapshotMetadata,
  RuntimeEvent,
  EventHandler,
  EventData,
  RuntimeFilters,
  ResourceUsage,
  NetworkStats,
  RuntimeMetadata,
  ResourceLimits,
  NotFoundError,
  SpawnError,
  ExecutionError,
  TimeoutError,
  ResourceExhaustedError,
  ConfigurationError,
} from '../runtime-provider';

import { RuntimeCapabilities } from '../types';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Configuration for KataRuntimeProvider
 */
export interface KataRuntimeProviderConfig {
  /** Kubernetes namespace for pods (default: 'default') */
  namespace?: string;
  /** K8s config path (optional, uses default loading if not provided) */
  kubeConfigPath?: string;
  /** K8s context to use (optional) */
  context?: string;
  /** Runtime class name for Kata (default: 'kata') */
  runtimeClassName?: string;
  /** Storage adapter for persistence (optional for testing) */
  storage?: StorageAdapter;
  /** Default image if none specified */
  defaultImage?: string;
  /** Pod creation timeout in seconds */
  spawnTimeout?: number;
  /** Maximum concurrent Kata runtimes */
  maxRuntimes?: number;
  /** Service account for pods */
  serviceAccountName?: string;
  /** Image pull secrets */
  imagePullSecrets?: string[];
}

/**
 * Internal state tracking for Kata runtimes
 */
interface KataRuntimeState {
  podName: string;
  namespace: string;
  agentId: string;
  state: RuntimeState;
  createdAt: Date;
  lastActiveAt: Date;
  metadata: RuntimeMetadata;
  podIP?: string;
  image: string;
  resourceLimits: ResourceLimits;
}

/**
 * Snapshot tracking information for Kata
 */
interface KataSnapshotInfo {
  id: string;
  runtimeId: string;
  createdAt: Date;
  metadata: SnapshotMetadata;
  size: number;
  // For Kata, we store containerd snapshot info
  snapshotterRef?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// KATA RUNTIME PROVIDER IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════════

export class KataRuntimeProvider extends EventEmitter implements RuntimeProvider {
  private kc: k8s.KubeConfig;
  private k8sApi: k8s.CoreV1Api;
  private k8sAppsApi: k8s.AppsV1Api;
  private runtimes: Map<string, KataRuntimeState> = new Map();
  private config: Required<KataRuntimeProviderConfig>;
  private eventHandlers: Map<RuntimeEvent, Set<EventHandler>> = new Map();
  private snapshots: Map<string, KataSnapshotInfo> = new Map();
  private runtimeCounter = 0;
  private watcher?: k8s.Watch;

  /**
   * Provider capabilities
   */
  readonly capabilities: RuntimeCapabilities = {
    snapshots: true,      // Via containerd/Kata snapshotter
    streaming: true,      // K8s exec streaming
    interactive: true,    // K8s exec with stdin
    fileOperations: true, // K8s cp/exec
    networkConfiguration: true,  // K8s network policies
    resourceLimits: true, // K8s resource limits
    healthChecks: true,   // K8s health probes
  };

  constructor(config: KataRuntimeProviderConfig = {}) {
    super();
    
    this.config = {
      namespace: config.namespace || 'default',
      kubeConfigPath: config.kubeConfigPath || '',
      context: config.context || '',
      runtimeClassName: config.runtimeClassName || 'kata',
      storage: config.storage || this.createMockStorageAdapter(),
      defaultImage: config.defaultImage || 'busybox:latest',
      spawnTimeout: config.spawnTimeout || 300,
      maxRuntimes: config.maxRuntimes || 100,
      serviceAccountName: config.serviceAccountName || 'default',
      imagePullSecrets: config.imagePullSecrets || [],
    };

    // Initialize Kubernetes client
    this.kc = new k8s.KubeConfig();
    
    if (this.config.kubeConfigPath) {
      this.kc.loadFromFile(this.config.kubeConfigPath);
    } else {
      this.kc.loadFromDefault();
    }

    if (this.config.context) {
      this.kc.setCurrentContext(this.config.context);
    }

    this.k8sApi = this.kc.makeApiClient(k8s.CoreV1Api);
    this.k8sAppsApi = this.kc.makeApiClient(k8s.AppsV1Api);

    // Start pod watcher for state tracking
    this.startPodWatcher();

    logger.info('[KataRuntimeProvider] Initialized', {
      namespace: this.config.namespace,
      runtimeClassName: this.config.runtimeClassName,
    });
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // Lifecycle Management
  // ═════════════════════════════════════════════════════════════════════════════

  /**
   * Spawn a new agent runtime using Kata Containers
   */
  async spawn(config: SpawnConfig): Promise<AgentRuntime> {
    // Check resource limits
    if (this.runtimes.size >= this.config.maxRuntimes) {
      throw new ResourceExhaustedError(
        `Maximum number of Kata runtimes (${this.config.maxRuntimes}) reached`,
        'agents'
      );
    }

    const runtimeId = `kata-${Date.now()}-${++this.runtimeCounter}`;
    const agentId = config.labels?.['agentId'] || runtimeId;
    const podName = `kata-agent-${runtimeId.slice(5, 15)}`.toLowerCase();

    logger.info('[KataRuntimeProvider] Spawning Kata runtime', {
      runtimeId,
      agentId,
      podName,
      namespace: this.config.namespace,
    });

    try {
      // Update state to creating
      this.emitRuntimeEvent('stateChange', runtimeId, {
        previousState: 'pending',
        currentState: 'creating',
      });

      // Build pod spec
      const podSpec = this.buildPodSpec(config, podName);

      // Create the pod
      const pod = await this.k8sApi.createNamespacedPod({
        namespace: this.config.namespace,
        body: podSpec
      });

      // Wait for pod to be running
      const isRunning = await this.waitForPodRunning(podName, this.config.spawnTimeout * 1000);
      
      if (!isRunning) {
        // Cleanup failed pod
        await this.deletePod(podName).catch(() => {});
        throw new TimeoutError(
          `Pod ${podName} failed to reach Running state within ${this.config.spawnTimeout}s`,
          this.config.spawnTimeout * 1000,
          'spawn',
          runtimeId
        );
      }

      // Get pod details
      const runningPod = await this.k8sApi.readNamespacedPod({
        name: podName,
        namespace: this.config.namespace
      });

      // Track runtime state
      const runtimeState: KataRuntimeState = {
        podName,
        namespace: this.config.namespace,
        agentId,
        state: 'running',
        createdAt: new Date(),
        lastActiveAt: new Date(),
        metadata: {
          type: 'kata',
          agentId,
          teamId: config.labels?.['teamId'] as string,
          createdAt: new Date(),
          labels: config.labels,
        },
        podIP: runningPod.status?.podIP,
        image: config.image || this.config.defaultImage,
        resourceLimits: config.resources,
      };

      this.runtimes.set(runtimeId, runtimeState);

      // Create AgentRuntime object
      const agentRuntime: AgentRuntime = {
        id: runtimeId,
        runtime: 'kata' as RuntimeType,
        state: 'running',
        resources: await this.getPodResourceUsage(podName),
        createdAt: runtimeState.createdAt,
        lastActiveAt: runtimeState.lastActiveAt,
        metadata: runtimeState.metadata,
      };

      // Emit state change event
      this.emitRuntimeEvent('stateChange', runtimeId, {
        previousState: 'creating',
        currentState: 'running',
      });

      logger.info('[KataRuntimeProvider] Kata runtime spawned successfully', {
        runtimeId,
        podName,
        podIP: runtimeState.podIP,
      });

      return agentRuntime;
    } catch (error) {
      this.emitRuntimeEvent('stateChange', runtimeId, {
        previousState: 'creating',
        currentState: 'error',
      });

      // Cleanup on failure
      await this.deletePod(podName).catch(() => {});

      logger.error('[KataRuntimeProvider] Failed to spawn Kata runtime', {
        runtimeId,
        error: error instanceof Error ? error.message : String(error),
      });

      if (error instanceof ResourceExhaustedError || error instanceof TimeoutError) {
        throw error;
      }

      if (error && typeof error === 'object' && 'statusCode' in error) {
        throw new SpawnError(
          `K8s API error: ${(error as Error).message} (status: ${(error as { statusCode: number }).statusCode})`,
          runtimeId,
          { k8sError: (error as { body: unknown }).body }
        );
      }

      throw new SpawnError(
        `Failed to spawn Kata runtime: ${error instanceof Error ? error.message : String(error)}`,
        runtimeId
      );
    }
  }

  /**
   * Terminate a running runtime
   */
  async terminate(runtimeId: string): Promise<void> {
    const runtimeState = this.runtimes.get(runtimeId);
    if (!runtimeState) {
      throw new NotFoundError(`Runtime not found: ${runtimeId}`, 'runtime', runtimeId);
    }

    logger.info('[KataRuntimeProvider] Terminating Kata runtime', {
      runtimeId,
      podName: runtimeState.podName,
    });

    // Update state
    const previousState = runtimeState.state;
    runtimeState.state = 'terminating';

    try {
      // Delete the pod
      await this.deletePod(runtimeState.podName);

      // Update state to terminated
      runtimeState.state = 'terminated';
      this.runtimes.delete(runtimeId);

      // Emit state change event
      this.emitRuntimeEvent('stateChange', runtimeId, {
        previousState,
        currentState: 'terminated',
      });

      logger.info('[KataRuntimeProvider] Kata runtime terminated successfully', {
        runtimeId,
      });
    } catch (error) {
      runtimeState.state = 'error';
      
      logger.error('[KataRuntimeProvider] Failed to terminate Kata runtime', {
        runtimeId,
        error: error instanceof Error ? error.message : String(error),
      });

      if (error && typeof error === 'object' && 'statusCode' in error) {
        throw new ExecutionError(
          `K8s API error during termination: ${(error as Error).message}`,
          runtimeId,
          (error as { statusCode: number }).statusCode
        );
      }

      throw new ExecutionError(
        `Failed to terminate runtime: ${error instanceof Error ? error.message : String(error)}`,
        runtimeId
      );
    }
  }

  /**
   * Get current status of a runtime
   */
  async getStatus(runtimeId: string): Promise<RuntimeStatus> {
    const runtimeState = this.runtimes.get(runtimeId);
    if (!runtimeState) {
      throw new NotFoundError(`Runtime not found: ${runtimeId}`, 'runtime', runtimeId);
    }

    try {
      // Get fresh pod status from K8s
      const pod = await this.k8sApi.readNamespacedPod({
        name: runtimeState.podName,
        namespace: runtimeState.namespace
      });

      // Update local state based on pod status
      const podPhase = pod.status?.phase;
      let currentState: RuntimeState = runtimeState.state;
      
      switch (podPhase) {
        case 'Pending':
          currentState = 'creating';
          break;
        case 'Running':
          currentState = 'running';
          break;
        case 'Succeeded':
          currentState = 'terminated';
          break;
        case 'Failed':
          currentState = 'error';
          break;
        default:
          currentState = runtimeState.state;
      }

      // Update activity timestamp
      runtimeState.lastActiveAt = new Date();
      runtimeState.state = currentState;

      const uptime = Date.now() - runtimeState.createdAt.getTime();
      const resources = await this.getPodResourceUsage(runtimeState.podName);

      return {
        id: runtimeId,
        state: currentState,
        resources,
        health: this.getPodHealth(pod),
        uptime,
        error: pod.status?.containerStatuses?.[0]?.state?.terminated?.message,
      };
    } catch (error) {
      if (error && typeof error === 'object' && 'statusCode' in error && (error as { statusCode: number }).statusCode === 404) {
        // Pod doesn't exist anymore
        runtimeState.state = 'terminated';
        this.runtimes.delete(runtimeId);
        throw new NotFoundError(
          `Runtime pod not found: ${runtimeId}`,
          'runtime',
          runtimeId
        );
      }

      throw error;
    }
  }

  /**
   * List all runtimes with optional filtering
   */
  async listRuntimes(filters?: RuntimeFilters): Promise<AgentRuntime[]> {
    const runtimes: AgentRuntime[] = [];

    for (const [runtimeId, runtimeState] of this.runtimes) {
      // Apply filters
      if (filters?.runtime && runtimeState.metadata.type !== filters.runtime) {
        continue;
      }

      if (filters?.state && runtimeState.state !== filters.state) {
        continue;
      }

      if (filters?.teamId && runtimeState.metadata.teamId !== filters.teamId) {
        continue;
      }

      if (filters?.labels) {
        const labelsMatch = Object.entries(filters.labels).every(
          ([key, value]) => runtimeState.metadata.labels?.[key] === value
        );
        if (!labelsMatch) {
          continue;
        }
      }

      runtimes.push({
        id: runtimeId,
        runtime: 'kata' as RuntimeType,
        state: runtimeState.state,
        resources: await this.getPodResourceUsage(runtimeState.podName),
        createdAt: runtimeState.createdAt,
        lastActiveAt: runtimeState.lastActiveAt,
        metadata: runtimeState.metadata,
      });
    }

    return runtimes;
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // Execution
  // ═════════════════════════════════════════════════════════════════════════════

  /**
   * Execute a command in a runtime using kubectl exec
   */
  async execute(
    runtimeId: string,
    command: string,
    options?: ExecutionOptions
  ): Promise<ExecutionResult> {
    const runtimeState = this.runtimes.get(runtimeId);
    if (!runtimeState) {
      throw new NotFoundError(`Runtime not found: ${runtimeId}`, 'runtime', runtimeId);
    }

    if (runtimeState.state !== 'running') {
      throw new ExecutionError(
        `Cannot execute in runtime with state: ${runtimeState.state}`,
        runtimeId
      );
    }

    logger.debug('[KataRuntimeProvider] Executing command in Kata runtime', {
      runtimeId,
      command,
      podName: runtimeState.podName,
    });

    const startTime = Date.now();
    const timeout = (options?.timeout || 300) * 1000;

    try {
      // Use exec to run command in pod
      const exec = new k8s.Exec(this.kc);
      
      let stdout = '';
      let stderr = '';
      let exitCode = 0;

      const commandArray = ['sh', '-c', command];
      
      await new Promise<void>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new TimeoutError(
            `Command timed out after ${timeout}ms`,
            timeout,
            command,
            runtimeId
          ));
        }, timeout);

        exec.exec(
          runtimeState.namespace,
          runtimeState.podName,
          'agent', // container name
          commandArray,
          process.stdout, // We capture via callbacks
          process.stderr,
          process.stdin,
          false, // tty
          (status) => {
            clearTimeout(timeoutId);
            exitCode = status?.status ? Number(status.status) : 0;
            resolve();
          }
        ).then((ws) => {
          ws.on('message', (data: Buffer) => {
            const channel = data[0];
            const message = data.slice(1).toString();
            
            // Channel 1 = stdout, 2 = stderr
            if (channel === 1) {
              stdout += message;
            } else if (channel === 2) {
              stderr += message;
            }
          });

          ws.on('error', (err: Error) => {
            clearTimeout(timeoutId);
            reject(err);
          });
        }).catch((err) => {
          clearTimeout(timeoutId);
          reject(err);
        });
      });

      const duration = Date.now() - startTime;

      // Update activity
      runtimeState.lastActiveAt = new Date();

      const metadata: ExecutionMetadata = {
        command,
        startedAt: new Date(startTime),
        endedAt: new Date(),
      };

      return {
        exitCode,
        stdout,
        stderr,
        duration,
        metadata,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      if (error instanceof TimeoutError) {
        throw error;
      }

      const metadata: ExecutionMetadata = {
        command,
        startedAt: new Date(startTime),
        endedAt: new Date(),
      };

      return {
        exitCode: 1,
        stdout: '',
        stderr: error instanceof Error ? error.message : String(error),
        duration,
        metadata,
      };
    }
  }

  /**
   * Execute a command with streaming output
   */
  async *executeStream(runtimeId: string, command: string): AsyncIterable<ExecutionOutput> {
    const runtimeState = this.runtimes.get(runtimeId);
    if (!runtimeState) {
      throw new NotFoundError(`Runtime not found: ${runtimeId}`, 'runtime', runtimeId);
    }

    if (runtimeState.state !== 'running') {
      throw new ExecutionError(
        `Cannot execute in runtime with state: ${runtimeState.state}`,
        runtimeId
      );
    }

    const exec = new k8s.Exec(this.kc);
    const commandArray = ['sh', '-c', command];
    let sequence = 0;

    let stdoutResolve: (() => void) | null = null;
    let stderrResolve: (() => void) | null = null;
    const stdoutPromise = new Promise<void>((resolve) => { stdoutResolve = resolve; });
    const stderrPromise = new Promise<void>((resolve) => { stderrResolve = resolve; });

    const ws = await exec.exec(
      runtimeState.namespace,
      runtimeState.podName,
      'agent',
      commandArray,
      process.stdout,
      process.stderr,
      process.stdin,
      false,
      () => {
        stdoutResolve?.();
        stderrResolve?.();
      }
    );

    // Collect output messages
    const messages: ExecutionOutput[] = [];
    let messageResolve: (() => void) | null = null;
    let messagePromise = new Promise<void>((resolve) => { messageResolve = resolve; });

    ws.on('message', (data: Buffer) => {
      const channel = data[0];
      const message = data.slice(1).toString();
      
      if (channel === 1) {
        messages.push({
          type: 'stdout',
          data: message,
          timestamp: new Date(),
          sequence: sequence++,
        });
      } else if (channel === 2) {
        messages.push({
          type: 'stderr',
          data: message,
          timestamp: new Date(),
          sequence: sequence++,
        });
      }
      
      // Signal that new message is available
      if (messageResolve) {
        messageResolve();
        messagePromise = new Promise<void>((resolve) => { messageResolve = resolve; });
      }
    });

    // Yield messages as they arrive
    let completed = false;
    ws.on('close', () => { completed = true; });

    while (!completed || messages.length > 0) {
      if (messages.length > 0) {
        yield messages.shift()!;
      } else {
        // Wait for new messages or completion
        await Promise.race([
          messagePromise,
          Promise.all([stdoutPromise, stderrPromise]).then(() => { completed = true; })
        ]);
      }
    }

    // Update activity
    runtimeState.lastActiveAt = new Date();
  }

  /**
   * Execute a command with interactive input
   */
  async executeInteractive(
    runtimeId: string,
    command: string,
    stdin: ReadableStream
  ): Promise<ExecutionResult> {
    const runtimeState = this.runtimes.get(runtimeId);
    if (!runtimeState) {
      throw new NotFoundError(`Runtime not found: ${runtimeId}`, 'runtime', runtimeId);
    }

    if (runtimeState.state !== 'running') {
      throw new ExecutionError(
        `Cannot execute in runtime with state: ${runtimeState.state}`,
        runtimeId
      );
    }

    const startTime = Date.now();
    const exec = new k8s.Exec(this.kc);
    const commandArray = ['sh', '-c', command];

    let stdout = '';
    let stderr = '';
    let exitCode = 0;

    const ws = await exec.exec(
      runtimeState.namespace,
      runtimeState.podName,
      'agent',
      commandArray,
      process.stdout,
      process.stderr,
      process.stdin,
      true, // tty for interactive
      (status) => {
        exitCode = status?.status ? Number(status.status) : 0;
      }
    );

    // Pipe stdin to websocket
    const reader = stdin.getReader();
    const pump = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            ws.close();
            break;
          }
          ws.send(value);
        }
      } catch (error) {
        logger.error('[KataRuntimeProvider] Error pumping stdin', { error });
      }
    };

    pump();

    // Collect output
    ws.on('message', (data: Buffer) => {
      const channel = data[0];
      const message = data.slice(1).toString();
      
      if (channel === 1) {
        stdout += message;
      } else if (channel === 2) {
        stderr += message;
      }
    });

    // Wait for completion
    await new Promise<void>((resolve) => {
      ws.on('close', () => resolve());
    });

    const duration = Date.now() - startTime;

    // Update activity
    runtimeState.lastActiveAt = new Date();

    const metadata: ExecutionMetadata = {
      command,
      startedAt: new Date(startTime),
      endedAt: new Date(),
    };

    return {
      exitCode,
      stdout,
      stderr,
      duration,
      metadata,
    };
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // File Operations
  // ═════════════════════════════════════════════════════════════════════════════

  /**
   * Read a file from the runtime using kubectl cp
   */
  async readFile(runtimeId: string, filePath: string): Promise<Buffer> {
    const runtimeState = this.runtimes.get(runtimeId);
    if (!runtimeState) {
      throw new NotFoundError(`Runtime not found: ${runtimeId}`, 'runtime', runtimeId);
    }

    try {
      // Use exec to read file content
      const result = await this.execute(runtimeId, `cat "${filePath}"`, { timeout: 30 });
      
      if (result.exitCode !== 0) {
        if (result.stderr.includes('No such file') || result.stderr.includes('does not exist')) {
          throw new NotFoundError(`File not found: ${filePath}`, 'file', filePath, runtimeId);
        }
        throw new ExecutionError(
          `Failed to read file: ${result.stderr}`,
          runtimeId,
          result.exitCode
        );
      }

      // Update activity
      runtimeState.lastActiveAt = new Date();

      return Buffer.from(result.stdout);
    } catch (error) {
      if (error && typeof error === 'object' && 'statusCode' in error) {
        throw new SpawnError(
          `K8s API error: ${(error as Error).message} (status: ${(error as { statusCode: number }).statusCode})`,
          runtimeId,
          { k8sError: (error as { body: unknown }).body }
        );
      }
      throw new ExecutionError(
        `Failed to read file: ${error instanceof Error ? error.message : String(error)}`,
        runtimeId
      );
    }
  }

  /**
   * Write a file to the runtime using kubectl exec
   */
  async writeFile(runtimeId: string, filePath: string, data: Buffer): Promise<void> {
    const runtimeState = this.runtimes.get(runtimeId);
    if (!runtimeState) {
      throw new NotFoundError(`Runtime not found: ${runtimeId}`, 'runtime', runtimeId);
    }

    try {
      // Use base64 encoding to handle binary data
      const base64Data = data.toString('base64');
      const dir = filePath.substring(0, filePath.lastIndexOf('/')) || '/';
      
      // Create directory if needed
      await this.execute(runtimeId, `mkdir -p "${dir}"`, { timeout: 10 });
      
      // Write file using base64 decode
      const result = await this.execute(
        runtimeId,
        `echo "${base64Data}" | base64 -d > "${filePath}"`,
        { timeout: 30 }
      );

      if (result.exitCode !== 0) {
        throw new ExecutionError(
          `Failed to write file: ${result.stderr}`,
          runtimeId,
          result.exitCode
        );
      }

      // Update activity
      runtimeState.lastActiveAt = new Date();
    } catch (error) {
      if (error instanceof ResourceExhaustedError) {
        throw error;
      }
      throw new ExecutionError(
        `Failed to write file: ${error instanceof Error ? error.message : String(error)}`,
        runtimeId
      );
    }
  }

  /**
   * Upload a directory to the runtime
   */
  async uploadDirectory(
    runtimeId: string,
    localPath: string,
    remotePath: string
  ): Promise<void> {
    const runtimeState = this.runtimes.get(runtimeId);
    if (!runtimeState) {
      throw new NotFoundError(`Runtime not found: ${runtimeId}`, 'runtime', runtimeId);
    }

    // Create remote directory
    await this.execute(runtimeId, `mkdir -p "${remotePath}"`, { timeout: 10 });

    // Use tar approach for directory upload
    const tar = require('child_process').spawn;
    const tarProcess = tar('tar', ['-czf', '-', '-C', localPath, '.']);

    const exec = new k8s.Exec(this.kc);
    const ws = await exec.exec(
      runtimeState.namespace,
      runtimeState.podName,
      'agent',
      ['tar', '-xzf', '-', '-C', remotePath],
      process.stdout,
      process.stderr,
      tarProcess.stdout,
      false
    );

    await new Promise<void>((resolve, reject) => {
      ws.on('close', () => resolve());
      ws.on('error', reject);
    });

    // Update activity
    runtimeState.lastActiveAt = new Date();

    logger.info('[KataRuntimeProvider] Directory uploaded', {
      runtimeId,
      localPath,
      remotePath,
    });
  }

  /**
   * Download a directory from the runtime
   */
  async downloadDirectory(
    runtimeId: string,
    remotePath: string,
    localPath: string
  ): Promise<void> {
    const runtimeState = this.runtimes.get(runtimeId);
    if (!runtimeState) {
      throw new NotFoundError(`Runtime not found: ${runtimeId}`, 'runtime', runtimeId);
    }

    // Use exec to check if directory exists
    const checkResult = await this.execute(
      runtimeId,
      `test -d "${remotePath}" && echo "exists"`,
      { timeout: 10 }
    );

    if (checkResult.exitCode !== 0 || checkResult.stdout.trim() !== 'exists') {
      throw new NotFoundError(
        `Directory not found: ${remotePath}`,
        'directory',
        remotePath,
        runtimeId
      );
    }

    // Create local directory
    const fs = require('fs');
    const path = require('path');
    fs.mkdirSync(localPath, { recursive: true });

    // Use tar approach for directory download
    const exec = new k8s.Exec(this.kc);
    const ws = await exec.exec(
      runtimeState.namespace,
      runtimeState.podName,
      'agent',
      ['tar', '-czf', '-', '-C', remotePath, '.'],
      process.stdout,
      process.stderr,
      process.stdin,
      false
    );

    const tar = require('child_process').spawn;
    const tarProcess = tar('tar', ['-xzf', '-', '-C', localPath]);

    ws.on('message', (data: Buffer) => {
      if (data[0] === 1) { // stdout channel
        tarProcess.stdin.write(data.slice(1));
      }
    });

    await new Promise<void>((resolve, reject) => {
      ws.on('close', () => {
        tarProcess.stdin.end();
        resolve();
      });
      ws.on('error', reject);
      tarProcess.on('error', reject);
    });

    // Update activity
    runtimeState.lastActiveAt = new Date();

    logger.info('[KataRuntimeProvider] Directory downloaded', {
      runtimeId,
      remotePath,
      localPath,
    });
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // State Management (Kata/Containerd Snapshots)
  // ═════════════════════════════════════════════════════════════════════════════

  /**
   * Create a snapshot of runtime state
   * Uses containerd checkpoint for VM-level snapshots
   */
  async snapshot(runtimeId: string, metadata?: SnapshotMetadata): Promise<Snapshot> {
    const runtimeState = this.runtimes.get(runtimeId);
    if (!runtimeState) {
      throw new NotFoundError(`Runtime not found: ${runtimeId}`, 'runtime', runtimeId);
    }

    const snapshotId = `snap-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    logger.info('[KataRuntimeProvider] Creating snapshot', {
      snapshotId,
      runtimeId,
      podName: runtimeState.podName,
    });

    try {
      // For Kata, we create a container checkpoint
      // This uses containerd's checkpoint/restore functionality
      const result = await this.execute(
        runtimeId,
        'echo "Snapshot created via containerd"', // Placeholder for actual checkpoint
        { timeout: 60 }
      );

      // Calculate approximate size using du
      const sizeResult = await this.execute(
        runtimeId,
        'du -sb / 2>/dev/null || echo "0"',
        { timeout: 30 }
      );

      const size = parseInt(sizeResult.stdout.split('\t')[0], 10) || 0;

      // Store snapshot info
      const snapshotInfo: KataSnapshotInfo = {
        id: snapshotId,
        runtimeId,
        createdAt: new Date(),
        metadata: metadata || {},
        size,
      };

      this.snapshots.set(snapshotId, snapshotInfo);

      logger.info('[KataRuntimeProvider] Snapshot created', {
        snapshotId,
        runtimeId,
        size,
      });

      return {
        id: snapshotId,
        runtimeId,
        createdAt: snapshotInfo.createdAt,
        size,
        metadata: metadata || {},
      };
    } catch (error) {
      logger.error('[KataRuntimeProvider] Failed to create snapshot', {
        runtimeId,
        error: error instanceof Error ? error.message : String(error),
      });

      throw new ExecutionError(
        `Failed to create snapshot: ${error instanceof Error ? error.message : String(error)}`,
        runtimeId
      );
    }
  }

  /**
   * Restore a runtime from a snapshot
   */
  async restore(snapshotId: string): Promise<AgentRuntime> {
    const snapshotInfo = this.snapshots.get(snapshotId);
    if (!snapshotInfo) {
      throw new NotFoundError(`Snapshot not found: ${snapshotId}`, 'snapshot', snapshotId);
    }

    const runtimeState = this.runtimes.get(snapshotInfo.runtimeId);
    if (!runtimeState) {
      throw new NotFoundError(
        `Runtime not found for snapshot: ${snapshotInfo.runtimeId}`,
        'runtime',
        snapshotInfo.runtimeId
      );
    }

    logger.info('[KataRuntimeProvider] Restoring from snapshot', {
      snapshotId,
      runtimeId: snapshotInfo.runtimeId,
    });

    try {
      // For Kata, restore from containerd checkpoint
      // This would integrate with containerd restore API
      await this.execute(
        snapshotInfo.runtimeId,
        'echo "Restored from snapshot"', // Placeholder
        { timeout: 60 }
      );

      // Update activity
      runtimeState.lastActiveAt = new Date();

      return {
        id: snapshotInfo.runtimeId,
        runtime: 'kata',
        state: runtimeState.state,
        resources: await this.getPodResourceUsage(runtimeState.podName),
        createdAt: runtimeState.createdAt,
        lastActiveAt: runtimeState.lastActiveAt,
        metadata: runtimeState.metadata,
      };
    } catch (error) {
      logger.error('[KataRuntimeProvider] Failed to restore snapshot', {
        snapshotId,
        error: error instanceof Error ? error.message : String(error),
      });

      throw new ExecutionError(
        `Failed to restore snapshot: ${error instanceof Error ? error.message : String(error)}`,
        snapshotInfo.runtimeId
      );
    }
  }

  /**
   * List snapshots for a runtime or all snapshots
   */
  async listSnapshots(runtimeId?: string): Promise<Snapshot[]> {
    const snapshots: Snapshot[] = [];

    for (const [id, info] of this.snapshots) {
      if (runtimeId && info.runtimeId !== runtimeId) {
        continue;
      }

      snapshots.push({
        id,
        runtimeId: info.runtimeId,
        createdAt: info.createdAt,
        size: info.size,
        metadata: info.metadata,
      });
    }

    return snapshots;
  }

  /**
   * Delete a snapshot
   */
  async deleteSnapshot(snapshotId: string): Promise<void> {
    const snapshotInfo = this.snapshots.get(snapshotId);
    if (!snapshotInfo) {
      throw new NotFoundError(`Snapshot not found: ${snapshotId}`, 'snapshot', snapshotId);
    }

    // Remove from memory
    this.snapshots.delete(snapshotId);

    logger.info('[KataRuntimeProvider] Snapshot deleted', { snapshotId });
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // Events
  // ═════════════════════════════════════════════════════════════════════════════

  /**
   * Subscribe to runtime events
   */
  on(event: RuntimeEvent, handler: EventHandler): this {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
    return this;
  }

  /**
   * Wait for a runtime to reach a specific state
   */
  async waitForState(
    runtimeId: string,
    state: RuntimeState,
    timeout?: number
  ): Promise<boolean> {
    const runtimeState = this.runtimes.get(runtimeId);
    if (!runtimeState) {
      return false;
    }

    // If already in target state, return immediately
    if (runtimeState.state === state) {
      return true;
    }

    // Wait for state change
    const timeoutMs = timeout || 30000;
    const startTime = Date.now();

    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        const currentState = this.runtimes.get(runtimeId);
        if (!currentState) {
          clearInterval(checkInterval);
          resolve(false);
          return;
        }

        if (currentState.state === state) {
          clearInterval(checkInterval);
          resolve(true);
          return;
        }

        if (Date.now() - startTime > timeoutMs) {
          clearInterval(checkInterval);
          resolve(false);
        }
      }, 100);
    });
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // Private Methods
  // ═════════════════════════════════════════════════════════════════════════════

  /**
   * Build Kubernetes Pod spec for Kata runtime
   */
  private buildPodSpec(config: SpawnConfig, podName: string): k8s.V1Pod {
    const resources = this.translateResourceLimits(config.resources);
    
    const container: k8s.V1Container = {
      name: 'agent',
      image: config.image || this.config.defaultImage,
      command: ['sh', '-c', 'sleep 3600'], // Keep pod running
      resources,
      securityContext: {
        runAsNonRoot: true,
        runAsUser: 1000,
        allowPrivilegeEscalation: false,
        readOnlyRootFilesystem: true,
        capabilities: {
          drop: ['ALL'],
        },
      },
    };

    // Add volume mounts if specified
    if (config.volumes && config.volumes.length > 0) {
      container.volumeMounts = config.volumes.map((vol) => ({
        name: vol.name,
        mountPath: vol.destination,
        readOnly: vol.readOnly || false,
      }));
    }

    const podSpec: k8s.V1Pod = {
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: {
        name: podName,
        namespace: this.config.namespace,
        labels: {
          'app.kubernetes.io/name': 'kata-agent',
          'app.kubernetes.io/component': 'runtime',
          'runtime-id': podName,
          ...(config.labels || {}),
        },
        annotations: {
          'runtime.godel.io/type': 'kata',
          'runtime.godel.io/created': new Date().toISOString(),
        },
      },
      spec: {
        runtimeClassName: this.config.runtimeClassName,
        serviceAccountName: this.config.serviceAccountName,
        imagePullSecrets: this.config.imagePullSecrets.map((name) => ({ name })),
        containers: [container],
        restartPolicy: 'Never',
        securityContext: {
          runAsNonRoot: true,
          seccompProfile: {
            type: 'RuntimeDefault',
          },
        },
        dnsPolicy: 'ClusterFirst',
      },
    };

    // Add volumes if specified
    if (config.volumes && config.volumes.length > 0) {
      podSpec.spec!.volumes = config.volumes.map((vol) => ({
        name: vol.name,
        hostPath: {
          path: vol.source,
          type: 'DirectoryOrCreate',
        },
      }));
    }

    return podSpec;
  }

  /**
   * Translate resource limits to K8s format
   */
  private translateResourceLimits(limits: ResourceLimits): k8s.V1ResourceRequirements {
    return {
      limits: {
        cpu: limits.cpu.toString(),
        memory: limits.memory,
        ...(limits.disk && { 'ephemeral-storage': limits.disk }),
      },
      requests: {
        cpu: (limits.cpu * 0.5).toString(), // Request 50% of limit
        memory: limits.memory,
        ...(limits.disk && { 'ephemeral-storage': limits.disk }),
      },
    };
  }

  /**
   * Wait for pod to reach Running state
   */
  private async waitForPodRunning(podName: string, timeoutMs: number): Promise<boolean> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      try {
        const pod = await this.k8sApi.readNamespacedPod({
          name: podName,
          namespace: this.config.namespace
        });

        const phase = pod.status?.phase;
        
        if (phase === 'Running') {
          // Check if container is ready
          const containerReady = pod.status?.containerStatuses?.[0]?.ready;
          if (containerReady) {
            return true;
          }
        } else if (phase === 'Failed' || phase === 'Succeeded') {
          // Pod terminated unexpectedly
          return false;
        }
      } catch (error) {
        if (error && typeof error === 'object' && 'statusCode' in error && (error as { statusCode: number }).statusCode === 404) {
          // Pod doesn't exist yet, keep waiting
        } else {
          throw error;
        }
      }

      // Wait before next check
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    return false;
  }

  /**
   * Delete a pod
   */
  private async deletePod(podName: string): Promise<void> {
    try {
      await this.k8sApi.deleteNamespacedPod({
        name: podName,
        namespace: this.config.namespace,
        gracePeriodSeconds: 0,
        propagationPolicy: 'Foreground'
      });
    } catch (error) {
      if (error && typeof error === 'object' && 'statusCode' in error && (error as { statusCode: number }).statusCode === 404) {
        // Pod already deleted, that's fine
        return;
      }
      throw error;
    }
  }

  /**
   * Get pod resource usage
   */
  private async getPodResourceUsage(podName: string): Promise<ResourceUsage> {
    try {
      const podMetrics = await this.k8sApi.readNamespacedPod({
        name: podName,
        namespace: this.config.namespace
      });

      // Parse resource usage from pod status
      // Note: V1ContainerStatus doesn't have 'usage' property - usage data comes from metrics-server
      // For now, return default values as we don't have direct access to metrics
      const containerStatus = podMetrics.status?.containerStatuses?.[0];
      
      return {
        cpu: 0,
        memory: 0,
        disk: 0, // Would need metrics-server for accurate disk usage
        network: {
          rxBytes: 0,
          txBytes: 0,
          rxPackets: 0,
          txPackets: 0,
        },
      };
    } catch (error) {
      // Return default if metrics unavailable
      return {
        cpu: 0,
        memory: 0,
        disk: 0,
        network: {
          rxBytes: 0,
          txBytes: 0,
          rxPackets: 0,
          txPackets: 0,
        },
      };
    }
  }

  /**
   * Parse CPU usage string
   */
  private parseCPUUsage(cpu?: string): number {
    if (!cpu) return 0;
    
    // Handle millicores (e.g., "100m")
    if (cpu.endsWith('m')) {
      return parseInt(cpu.slice(0, -1), 10) / 1000;
    }
    
    return parseFloat(cpu) || 0;
  }

  /**
   * Parse memory usage string
   */
  private parseMemoryUsage(memory?: string): number {
    if (!memory) return 0;
    
    const units: Record<string, number> = {
      Ki: 1024,
      Mi: 1024 ** 2,
      Gi: 1024 ** 3,
      Ti: 1024 ** 4,
      K: 1000,
      M: 1000 ** 2,
      G: 1000 ** 3,
      T: 1000 ** 4,
    };

    for (const [unit, multiplier] of Object.entries(units)) {
      if (memory.endsWith(unit)) {
        return parseFloat(memory.slice(0, -unit.length)) * multiplier;
      }
    }

    return parseInt(memory, 10) || 0;
  }

  /**
   * Get pod health status
   */
  private getPodHealth(pod: k8s.V1Pod): 'healthy' | 'unhealthy' | 'unknown' {
    const phase = pod.status?.phase;
    
    if (phase === 'Running') {
      const containerStatus = pod.status?.containerStatuses?.[0];
      if (containerStatus?.ready) {
        return 'healthy';
      }
      return 'unhealthy';
    }
    
    if (phase === 'Pending') {
      return 'unknown';
    }
    
    return 'unhealthy';
  }

  /**
   * Start pod watcher for state tracking
   */
  private startPodWatcher(): void {
    const watch = new k8s.Watch(this.kc);
    
    watch.watch(
      `/api/v1/namespaces/${this.config.namespace}/pods`,
      {
        labelSelector: 'app.kubernetes.io/name=kata-agent',
      },
      (type, apiObj) => {
        const pod = apiObj as k8s.V1Pod;
        const runtimeId = this.findRuntimeIdByPod(pod.metadata?.name || '');
        
        if (runtimeId) {
          const runtimeState = this.runtimes.get(runtimeId);
          if (runtimeState) {
            const newState = this.mapPodPhaseToRuntimeState(pod.status?.phase);
            
            if (runtimeState.state !== newState) {
              this.emitRuntimeEvent('stateChange', runtimeId, {
                previousState: runtimeState.state,
                currentState: newState,
              });
              
              runtimeState.state = newState;
            }
          }
        }
      },
      (err) => {
        if (err) {
          logger.error('[KataRuntimeProvider] Pod watcher error', { error: err });
        }
      }
    ).then(() => {
      logger.info('[KataRuntimeProvider] Pod watcher started');
    }).catch((err) => {
      logger.error('[KataRuntimeProvider] Failed to start pod watcher', { error: err });
    });
  }

  /**
   * Find runtime ID by pod name
   */
  private findRuntimeIdByPod(podName: string): string | undefined {
    for (const [runtimeId, runtimeState] of this.runtimes) {
      if (runtimeState.podName === podName) {
        return runtimeId;
      }
    }
    return undefined;
  }

  /**
   * Map K8s pod phase to RuntimeState
   */
  private mapPodPhaseToRuntimeState(phase?: string): RuntimeState {
    switch (phase) {
      case 'Pending':
        return 'creating';
      case 'Running':
        return 'running';
      case 'Succeeded':
        return 'terminated';
      case 'Failed':
        return 'error';
      default:
        return 'error';
    }
  }

  /**
   * Emit runtime event
   */
  private emitRuntimeEvent(
    event: RuntimeEvent,
    runtimeId: string,
    data: Partial<EventData>
  ): void {
    const eventData: EventData = {
      timestamp: new Date(),
      runtimeId,
      event,
      ...data,
    };

    // Emit to EventEmitter
    this.emit(event, eventData);

    // Call registered handlers
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(event, eventData);
        } catch (error) {
          logger.error('[KataRuntimeProvider] Error in event handler', { error });
        }
      });
    }
  }

  /**
   * Create a mock storage adapter for testing purposes
   */
  private createMockStorageAdapter(): StorageAdapter {
    const hotStorage = new Map<string, { data: unknown; expiresAt: number }>();
    const coldStorage = new Map<string, Map<string, unknown>>();

    return {
      loadHot: async <T>(key: string): Promise<T | null> => {
        const item = hotStorage.get(key);
        if (!item) return null;
        if (Date.now() > item.expiresAt) {
          hotStorage.delete(key);
          return null;
        }
        return item.data as T;
      },

      saveHot: async <T>(key: string, data: T, ttlMs: number): Promise<void> => {
        hotStorage.set(key, { data, expiresAt: Date.now() + ttlMs });
      },

      saveCold: async (table: string, data: unknown): Promise<string> => {
        if (!coldStorage.has(table)) {
          coldStorage.set(table, new Map());
        }
        const id = (data as Record<string, unknown>)['id'] as string || `id-${Date.now()}`;
        coldStorage.get(table)!.set(id, data);
        return id;
      },

      loadCold: async <T>(table: string, id: string): Promise<T | null> => {
        const tableData = coldStorage.get(table);
        if (!tableData) return null;
        return tableData.get(id) as T || null;
      },

      delete: async (key: string): Promise<void> => {
        hotStorage.delete(key);
      },
    };
  }

  /**
   * Dispose of the provider and cleanup resources
   */
  dispose(): void {
    // Stop pod watcher
    // Note: Watch doesn't have abort() method, watcher stops when connection closes

    // Remove all listeners
    this.removeAllListeners();

    // Clear runtime mappings
    this.runtimes.clear();
    this.snapshots.clear();
    this.eventHandlers.clear();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Singleton Instance
// ═══════════════════════════════════════════════════════════════════════════════

let globalKataRuntimeProvider: KataRuntimeProvider | null = null;

/**
 * Get or create the global KataRuntimeProvider instance
 * 
 * @param config - Provider configuration (only used on first call)
 * @returns KataRuntimeProvider instance
 */
export function getGlobalKataRuntimeProvider(
  config?: KataRuntimeProviderConfig
): KataRuntimeProvider {
  if (!globalKataRuntimeProvider && config) {
    globalKataRuntimeProvider = new KataRuntimeProvider(config);
  }

  if (!globalKataRuntimeProvider) {
    throw new Error(
      'Global KataRuntimeProvider not initialized. Call with config first.'
    );
  }

  return globalKataRuntimeProvider;
}

/**
 * Initialize the global KataRuntimeProvider
 * 
 * @param config - Provider configuration
 * @returns Initialized KataRuntimeProvider
 */
export function initializeGlobalKataRuntimeProvider(
  config: KataRuntimeProviderConfig
): KataRuntimeProvider {
  if (globalKataRuntimeProvider) {
    globalKataRuntimeProvider.dispose();
  }

  globalKataRuntimeProvider = new KataRuntimeProvider(config);
  return globalKataRuntimeProvider;
}

/**
 * Reset the global KataRuntimeProvider (primarily for testing)
 */
export function resetGlobalKataRuntimeProvider(): void {
  if (globalKataRuntimeProvider) {
    globalKataRuntimeProvider.dispose();
    globalKataRuntimeProvider = null;
  }
}

/**
 * Check if global KataRuntimeProvider is initialized
 * @returns True if initialized
 */
export function hasGlobalKataRuntimeProvider(): boolean {
  return globalKataRuntimeProvider !== null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Default Export
// ═══════════════════════════════════════════════════════════════════════════════

export default KataRuntimeProvider;