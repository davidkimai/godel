/**
 * Pi Runtime - Process Management for Pi CLI Instances
 *
 * Manages the lifecycle of Pi CLI processes spawned as child processes.
 * Handles port allocation, process startup, health monitoring, and cleanup.
 *
 * @example
 * ```typescript
 * const runtime = new PiRuntime({
 *   basePort: 10000,
 *   maxInstances: 10,
 *   piCommand: 'pi'
 * });
 *
 * // Spawn a new Pi instance
 * const session = await runtime.spawn({
 *   provider: 'anthropic',
 *   model: 'claude-sonnet-4-5',
 *   mode: 'local',
 *   workingDir: '/path/to/project'
 * });
 *
 * // Check status
 * const status = runtime.status(session.id);
 *
 * // Kill the instance
 * await runtime.kill(session.id);
 * ```
 */

import { spawn, ChildProcess, SpawnOptions } from 'child_process';
import { EventEmitter } from 'events';
import { logger } from '../../utils/logger';
import {
  SpawnConfig,
  ProviderId,
  DeploymentMode,
  PiCapability,
  HealthStatus,
} from './types';

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Configuration for PiRuntime
 */
export interface PiRuntimeConfig {
  /** Base port for WebSocket servers (default: 10000) */
  basePort?: number;

  /** Maximum number of instances (default: 10) */
  maxInstances?: number;

  /** Pi CLI command (default: 'pi') */
  piCommand?: string;

  /** Default spawn timeout in milliseconds (default: 30000) */
  spawnTimeoutMs?: number;

  /** Health check interval in milliseconds (default: 5000) */
  healthCheckIntervalMs?: number;

  /** Port range end (default: basePort + 1000) */
  maxPort?: number;

  /** Extra environment variables for spawned processes */
  env?: Record<string, string>;

  /** Enable verbose logging */
  verbose?: boolean;
}

/**
 * Runtime session tracking spawned Pi processes
 */
export interface PiRuntimeSession {
  /** Unique session identifier */
  id: string;

  /** Process ID */
  pid: number;

  /** Provider */
  provider: ProviderId;

  /** Model identifier */
  model: string;

  /** Current status */
  status: 'starting' | 'running' | 'stopping' | 'stopped' | 'error';

  /** WebSocket endpoint URL */
  endpoint: string;

  /** Port number */
  port: number;

  /** Working directory */
  workdir: string;

  /** Spawn time */
  spawnTime: Date;

  /** Last health check */
  lastHealthCheck?: Date;

  /** Health status */
  health: HealthStatus;

  /** Process instance */
  process: ChildProcess;

  /** Capabilities */
  capabilities: PiCapability[];

  /** Tags */
  tags?: string[];

  /** Error message if failed */
  error?: string;

  /** Exit code */
  exitCode?: number | null;
}

/**
 * Options for spawning Pi instances
 */
export interface PiSpawnOptions {
  /** Session ID (auto-generated if not provided) */
  sessionId?: string;

  /** Specific port to use (auto-allocated if not provided) */
  port?: number;

  /** Additional environment variables */
  env?: Record<string, string>;

  /** Enable server mode */
  server?: boolean;

  /** Session file path */
  sessionFile?: string;

  /** Inherit current session context */
  inheritContext?: boolean;
}

/**
 * Result of executing a command
 */
export interface ExecResult {
  /** Exit code */
  exitCode: number;

  /** Standard output */
  stdout: string;

  /** Standard error */
  stderr: string;

  /** Execution duration in milliseconds */
  durationMs: number;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error for PiRuntime operations
 */
export class PiRuntimeError extends Error {
  constructor(
    message: string,
    public code: string,
    public context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'PiRuntimeError';
  }
}

/**
 * Error when spawning fails
 */
export class SpawnError extends PiRuntimeError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'SPAWN_ERROR', context);
    this.name = 'SpawnError';
  }
}

/**
 * Error when session not found
 */
export class SessionNotFoundError extends PiRuntimeError {
  constructor(sessionId: string) {
    super(
      `Pi session not found: ${sessionId}`,
      'SESSION_NOT_FOUND',
      { sessionId }
    );
    this.name = 'SessionNotFoundError';
  }
}

/**
 * Error when port allocation fails
 */
export class PortAllocationError extends PiRuntimeError {
  constructor(message: string) {
    super(message, 'PORT_ALLOCATION_ERROR');
    this.name = 'PortAllocationError';
  }
}

/**
 * Error when max instances reached
 */
export class MaxInstancesError extends PiRuntimeError {
  constructor(current: number, max: number) {
    super(
      `Maximum instances reached: ${current}/${max}`,
      'MAX_INSTANCES_REACHED',
      { current, max }
    );
    this.name = 'MaxInstancesError';
  }
}

// ============================================================================
// Events
// ============================================================================

/**
 * Events emitted by PiRuntime
 */
export interface PiRuntimeEvents {
  /** Emitted when a session is spawned */
  'session.spawned': (session: PiRuntimeSession) => void;

  /** Emitted when a session starts successfully */
  'session.started': (session: PiRuntimeSession) => void;

  /** Emitted when a session fails to start */
  'session.failed': (sessionId: string, error: Error) => void;

  /** Emitted when a session is killed */
  'session.killed': (sessionId: string) => void;

  /** Emitted when a session exits */
  'session.exited': (sessionId: string, exitCode: number | null) => void;

  /** Emitted when health status changes */
  'session.health_changed': (sessionId: string, health: HealthStatus) => void;

  /** Emitted on stdout data */
  'session.stdout': (sessionId: string, data: string) => void;

  /** Emitted on stderr data */
  'session.stderr': (sessionId: string, data: string) => void;
}

/**
 * Type-safe event emitter for PiRuntime
 */
export declare interface PiRuntime {
  on<K extends keyof PiRuntimeEvents>(
    event: K,
    listener: PiRuntimeEvents[K]
  ): this;
  emit<K extends keyof PiRuntimeEvents>(
    event: K,
    ...args: Parameters<PiRuntimeEvents[K]>
  ): boolean;
  off<K extends keyof PiRuntimeEvents>(
    event: K,
    listener: PiRuntimeEvents[K]
  ): this;
  once<K extends keyof PiRuntimeEvents>(
    event: K,
    listener: PiRuntimeEvents[K]
  ): this;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a unique session ID
 */
function generateSessionId(): string {
  return `pi-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Check if a port is available
 */
async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const net = require('net');
    const server = net.createServer();

    server.once('error', () => {
      resolve(false);
    });

    server.once('listening', () => {
      server.close(() => {
        resolve(true);
      });
    });

    server.listen(port, '127.0.0.1');
  });
}

/**
 * Delay for specified milliseconds
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// PiRuntime Class
// ============================================================================

/**
 * Runtime manager for Pi CLI processes
 *
 * Handles:
 * - Process spawning with port allocation
 * - Health monitoring
 * - Process lifecycle management
 * - Signal handling
 * - Log capture
 */
export class PiRuntime extends EventEmitter {
  private config: Required<PiRuntimeConfig>;
  private sessions: Map<string, PiRuntimeSession> = new Map();
  private portMap: Map<number, string> = new Map(); // port -> sessionId
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private nextPort: number;

  /**
   * Create a new PiRuntime instance
   *
   * @param config - Runtime configuration
   */
  constructor(config: PiRuntimeConfig = {}) {
    super();

    this.config = {
      basePort: config.basePort ?? 10000,
      maxInstances: config.maxInstances ?? 10,
      piCommand: config.piCommand ?? 'pi',
      spawnTimeoutMs: config.spawnTimeoutMs ?? 30000,
      healthCheckIntervalMs: config.healthCheckIntervalMs ?? 5000,
      maxPort: config.maxPort ?? (config.basePort ?? 10000) + 1000,
      env: config.env ?? {},
      verbose: config.verbose ?? false,
    };

    this.nextPort = this.config.basePort;

    logger.info('[PiRuntime] Initialized', {
      basePort: this.config.basePort,
      maxInstances: this.config.maxInstances,
      piCommand: this.config.piCommand,
    });

    // Start health monitoring
    this.startHealthMonitoring();

    // Setup process cleanup
    this.setupProcessCleanup();
  }

  // ============================================================================
  // Spawn Method
  // ============================================================================

  /**
   * Spawn a new Pi CLI instance
   *
   * @param config - Spawn configuration
   * @param options - Spawn options
   * @returns The spawned session
   * @throws {SpawnError} If spawning fails
   * @throws {MaxInstancesError} If max instances reached
   * @throws {PortAllocationError} If no ports available
   *
   * @example
   * ```typescript
   * const session = await runtime.spawn({
   *   provider: 'anthropic',
   *   model: 'claude-sonnet-4-5',
   *   mode: 'local',
   *   workingDir: '/project'
   * });
   * ```
   */
  async spawn(
    config: SpawnConfig,
    options: PiSpawnOptions = {}
  ): Promise<PiRuntimeSession> {
    // Check instance limit
    if (this.sessions.size >= this.config.maxInstances) {
      throw new MaxInstancesError(this.sessions.size, this.config.maxInstances);
    }

    const sessionId = options.sessionId ?? generateSessionId();

    // Check if session already exists
    if (this.sessions.has(sessionId)) {
      throw new SpawnError(`Session ${sessionId} already exists`);
    }

    // Allocate port
    const port = await this.allocatePort(options.port);

    logger.info('[PiRuntime] Spawning Pi instance', {
      sessionId,
      provider: config.provider,
      model: config.model,
      port,
      workdir: config.workingDir,
    });

    // Build command arguments
    const args = this.buildPiArgs(config, port, sessionId, options);

    // Prepare environment
    const env = {
      ...process.env,
      ...this.config.env,
      ...config.env,
      ...options.env,
    };

    // Create spawn options
    const spawnOptions: SpawnOptions = {
      cwd: config.workingDir ?? process.cwd(),
      env,
      detached: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    };

    // Spawn the process
    let childProcess: ChildProcess;
    try {
      childProcess = spawn(this.config.piCommand, args, spawnOptions);
    } catch (error) {
      this.releasePort(port);
      throw new SpawnError(
        `Failed to spawn Pi process: ${error instanceof Error ? error.message : String(error)}`,
        { sessionId, config, error }
      );
    }

    // Create session object
    const session: PiRuntimeSession = {
      id: sessionId,
      pid: childProcess.pid!,
      provider: config.provider,
      model: config.model,
      status: 'starting',
      endpoint: `ws://localhost:${port}`,
      port,
      workdir: config.workingDir ?? process.cwd(),
      spawnTime: new Date(),
      health: 'unknown',
      process: childProcess,
      capabilities: config.capabilities ?? [],
      tags: config.tags,
    };

    // Store session
    this.sessions.set(sessionId, session);
    this.portMap.set(port, sessionId);

    // Setup process handlers
    this.setupProcessHandlers(session);

    this.emit('session.spawned', session);

    // Wait for process to be ready
    try {
      await this.waitForReady(session, options.server ?? true);
      session.status = 'running';
      session.health = 'healthy';
      this.emit('session.started', session);

      logger.info('[PiRuntime] Pi instance started successfully', {
        sessionId,
        pid: session.pid,
        endpoint: session.endpoint,
      });

      return session;
    } catch (error) {
      session.status = 'error';
      session.error = error instanceof Error ? error.message : String(error);
      session.health = 'unhealthy';

      // Cleanup failed spawn
      await this.cleanupSession(sessionId);

      this.emit('session.failed', sessionId, error instanceof Error ? error : new Error(String(error)));

      throw new SpawnError(
        `Pi instance failed to start: ${session.error}`,
        { sessionId, error: session.error }
      );
    }
  }

  /**
   * Build Pi CLI arguments
   */
  private buildPiArgs(
    config: SpawnConfig,
    port: number,
    sessionId: string,
    options: PiSpawnOptions
  ): string[] {
    const args: string[] = [];

    // Server mode
    if (options.server !== false) {
      args.push('--server');
    }

    // Port
    args.push('--port', port.toString());

    // Provider
    args.push('--provider', config.provider);

    // Model
    args.push('--model', config.model);

    // Session ID
    args.push('--session', sessionId);

    // Working directory
    if (config.workingDir) {
      args.push('--workdir', config.workingDir);
    }

    // Session file
    if (options.sessionFile) {
      args.push('--session-file', options.sessionFile);
    }

    // Inherit context
    if (options.inheritContext) {
      args.push('--inherit-context');
    }

    // Custom args from config
    if (config.args) {
      args.push(...config.args);
    }

    return args;
  }

  /**
   * Setup process event handlers
   */
  private setupProcessHandlers(session: PiRuntimeSession): void {
    const { process, id: sessionId } = session;

    // stdout handler
    process.stdout?.on('data', (data: Buffer) => {
      const output = data.toString();
      if (this.config.verbose) {
        logger.debug('[PiRuntime] stdout', { sessionId, output: output.substring(0, 200) });
      }
      this.emit('session.stdout', sessionId, output);
    });

    // stderr handler
    process.stderr?.on('data', (data: Buffer) => {
      const output = data.toString();
      if (this.config.verbose) {
        logger.debug('[PiRuntime] stderr', { sessionId, output: output.substring(0, 200) });
      }
      this.emit('session.stderr', sessionId, output);
    });

    // exit handler
    process.on('exit', (code: number | null, signal: string | null) => {
      logger.info('[PiRuntime] Process exited', { sessionId, code, signal });

      session.status = 'stopped';
      session.exitCode = code;
      session.health = 'unhealthy';

      this.emit('session.exited', sessionId, code);

      // Cleanup if not already cleaned up
      if (this.sessions.has(sessionId)) {
        this.cleanupSession(sessionId).catch(err => {
          logger.error('[PiRuntime] Error during cleanup', { sessionId, error: err.message });
        });
      }
    });

    // error handler
    process.on('error', (error: Error) => {
      logger.error('[PiRuntime] Process error', { sessionId, error: error.message });
      session.status = 'error';
      session.error = error.message;
      session.health = 'unhealthy';

      this.emit('session.failed', sessionId, error);
    });
  }

  /**
   * Wait for Pi process to be ready
   */
  private async waitForReady(
    session: PiRuntimeSession,
    checkPort: boolean
  ): Promise<void> {
    const startTime = Date.now();
    const timeout = this.config.spawnTimeoutMs;

    while (Date.now() - startTime < timeout) {
      // Check if process is still running
      if (session.process.exitCode !== null) {
        throw new Error(`Process exited with code ${session.process.exitCode}`);
      }

      // If in server mode, check if port is responding
      if (checkPort) {
        const isReady = await this.checkEndpoint(session.endpoint);
        if (isReady) {
          return;
        }
      } else {
        // Non-server mode: just wait a bit for process to initialize
        await delay(500);
        if (session.process.exitCode === null) {
          return;
        }
      }

      await delay(500);
    }

    throw new Error(`Timeout waiting for Pi instance to be ready after ${timeout}ms`);
  }

  /**
   * Check if endpoint is responding
   */
  private async checkEndpoint(endpoint: string): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const url = new URL(endpoint);
        const net = require('net');

        const socket = new net.Socket();
        socket.setTimeout(1000);

        socket.once('connect', () => {
          socket.destroy();
          resolve(true);
        });

        socket.once('error', () => {
          resolve(false);
        });

        socket.once('timeout', () => {
          socket.destroy();
          resolve(false);
        });

        socket.connect(parseInt(url.port), url.hostname);
      } catch {
        resolve(false);
      }
    });
  }

  // ============================================================================
  // Port Management
  // ============================================================================

  /**
   * Allocate an available port
   */
  private async allocatePort(requestedPort?: number): Promise<number> {
    // If specific port requested, try it first
    if (requestedPort) {
      if (!this.portMap.has(requestedPort)) {
        const available = await isPortAvailable(requestedPort);
        if (available) {
          return requestedPort;
        }
      }
      throw new PortAllocationError(`Requested port ${requestedPort} is not available`);
    }

    // Search for available port
    const startPort = this.nextPort;
    let port = startPort;

    while (port < this.config.maxPort) {
      if (!this.portMap.has(port)) {
        const available = await isPortAvailable(port);
        if (available) {
          this.nextPort = port + 1;
          return port;
        }
      }
      port++;

      // Wrap around if needed
      if (port >= this.config.maxPort) {
        port = this.config.basePort;
      }

      // Stop if we've checked all ports
      if (port === startPort) {
        break;
      }
    }

    throw new PortAllocationError('No available ports in configured range');
  }

  /**
   * Release a port
   */
  private releasePort(port: number): void {
    this.portMap.delete(port);
  }

  // ============================================================================
  // Exec Method
  // ============================================================================

  /**
   * Execute a command in a Pi session
   *
   * Note: This requires the Pi CLI to support command execution mode.
   * For WebSocket-based sessions, use PiClient instead.
   *
   * @param sessionId - Session ID
   * @param command - Command to execute
   * @returns Execution result
   * @throws {SessionNotFoundError} If session not found
   *
   * @example
   * ```typescript
   * const result = await runtime.exec('session-123', 'pi --version');
   * console.log(result.stdout);
   * ```
   */
  async exec(sessionId: string, command: string): Promise<ExecResult> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }

    if (session.status !== 'running') {
      throw new PiRuntimeError(
        `Session ${sessionId} is not running (status: ${session.status})`,
        'SESSION_NOT_RUNNING'
      );
    }

    logger.debug('[PiRuntime] Executing command', { sessionId, command });

    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const args = command.split(' ').filter(Boolean);
      const cmd = args.shift()!;

      const child = spawn(cmd, args, {
        cwd: session.workdir,
        env: { ...process.env, PI_SESSION_ID: sessionId },
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      child.on('exit', (exitCode) => {
        const durationMs = Date.now() - startTime;
        resolve({
          exitCode: exitCode ?? 0,
          stdout,
          stderr,
          durationMs,
        });
      });

      child.on('error', (error) => {
        reject(error);
      });
    });
  }

  // ============================================================================
  // Kill Method
  // ============================================================================

  /**
   * Kill a Pi session
   *
   * @param sessionId - Session ID to kill
   * @param force - Force kill with SIGKILL instead of SIGTERM
   * @returns True if killed successfully
   * @throws {SessionNotFoundError} If session not found
   *
   * @example
   * ```typescript
   * await runtime.kill('session-123');
   * await runtime.kill('session-123', true); // Force kill
   * ```
   */
  async kill(sessionId: string, force: boolean = false): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }

    if (session.status === 'stopped' || session.status === 'stopping') {
      return false;
    }

    logger.info('[PiRuntime] Killing session', { sessionId, force });

    session.status = 'stopping';

    const signal = force ? 'SIGKILL' : 'SIGTERM';

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        // Force kill if graceful kill times out
        if (!session.process.killed) {
          logger.warn('[PiRuntime] Force killing session after timeout', { sessionId });
          session.process.kill('SIGKILL');
        }
      }, 5000);

      session.process.once('exit', () => {
        clearTimeout(timeout);
        this.emit('session.killed', sessionId);
        resolve(true);
      });

      session.process.kill(signal);
    });
  }

  // ============================================================================
  // Status Method
  // ============================================================================

  /**
   * Get session status
   *
   * @param sessionId - Session ID
   * @returns Session status or undefined if not found
   *
   * @example
   * ```typescript
   * const status = runtime.status('session-123');
   * if (status) {
   *   console.log(status.status); // 'running', 'stopped', etc.
   * }
   * ```
   */
  status(sessionId: string): PiRuntimeSession | undefined {
    return this.sessions.get(sessionId);
  }

  // ============================================================================
  // List Method
  // ============================================================================

  /**
   * List all active sessions
   *
   * @returns Array of active sessions
   *
   * @example
   * ```typescript
   * const sessions = runtime.list();
   * console.log(`Active sessions: ${sessions.length}`);
   * ```
   */
  list(): PiRuntimeSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * List sessions filtered by status
   *
   * @param status - Status to filter by
   * @returns Filtered sessions
   */
  listByStatus(status: PiRuntimeSession['status']): PiRuntimeSession[] {
    return this.list().filter(s => s.status === status);
  }

  // ============================================================================
  // Health Monitoring
  // ============================================================================

  /**
   * Start health monitoring
   */
  private startHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      return;
    }

    this.healthCheckInterval = setInterval(async () => {
      for (const session of this.sessions.values()) {
        if (session.status === 'running') {
          await this.checkSessionHealth(session);
        }
      }
    }, this.config.healthCheckIntervalMs);

    logger.debug('[PiRuntime] Health monitoring started');
  }

  /**
   * Stop health monitoring
   */
  stopHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      logger.debug('[PiRuntime] Health monitoring stopped');
    }
  }

  /**
   * Check session health
   */
  private async checkSessionHealth(session: PiRuntimeSession): Promise<void> {
    const previousHealth = session.health;
    let newHealth: HealthStatus;

    // Check if process is still running
    if (session.process.exitCode !== null) {
      newHealth = 'unhealthy';
    } else {
      // Check endpoint connectivity
      const isResponsive = await this.checkEndpoint(session.endpoint);
      newHealth = isResponsive ? 'healthy' : 'degraded';
    }

    if (newHealth !== previousHealth) {
      session.health = newHealth;
      session.lastHealthCheck = new Date();

      logger.info('[PiRuntime] Session health changed', {
        sessionId: session.id,
        previousHealth,
        newHealth,
      });

      this.emit('session.health_changed', session.id, newHealth);

      // Auto-cleanup unhealthy sessions
      if (newHealth === 'unhealthy') {
        session.status = 'error';
        await this.cleanupSession(session.id);
      }
    }
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  /**
   * Setup process cleanup on exit
   */
  private setupProcessCleanup(): void {
    const cleanup = async () => {
      logger.info('[PiRuntime] Cleaning up all sessions');
      await this.dispose();
    };

    process.on('exit', cleanup);
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('uncaughtException', cleanup);
  }

  /**
   * Cleanup a specific session
   */
  private async cleanupSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    logger.debug('[PiRuntime] Cleaning up session', { sessionId });

    // Kill process if still running
    if (session.process.exitCode === null && !session.process.killed) {
      session.process.kill('SIGTERM');
      await delay(1000);

      if (!session.process.killed) {
        session.process.kill('SIGKILL');
      }
    }

    // Release port
    this.releasePort(session.port);

    // Remove from sessions map
    this.sessions.delete(sessionId);

    logger.debug('[PiRuntime] Session cleaned up', { sessionId });
  }

  /**
   * Dispose the runtime and clean up all resources
   *
   * @param killSessions - Whether to kill active sessions (default: true)
   */
  async dispose(killSessions: boolean = true): Promise<void> {
    logger.info('[PiRuntime] Disposing runtime');

    // Stop health monitoring
    this.stopHealthMonitoring();

    // Kill all sessions if requested
    if (killSessions) {
      const killPromises = Array.from(this.sessions.keys()).map(id =>
        this.kill(id, true).catch(err => {
          logger.error('[PiRuntime] Error killing session during dispose', {
            sessionId: id,
            error: err.message,
          });
        })
      );

      await Promise.all(killPromises);
    }

    // Clear all sessions
    this.sessions.clear();
    this.portMap.clear();

    // Remove listeners
    this.removeAllListeners();

    logger.info('[PiRuntime] Runtime disposed');
  }

  // ============================================================================
  // Statistics
  // ============================================================================

  /**
   * Get runtime statistics
   *
   * @returns Statistics object
   */
  getStats(): {
    totalSessions: number;
    runningSessions: number;
    startingSessions: number;
    errorSessions: number;
    stoppedSessions: number;
    portsInUse: number;
  } {
    const sessions = this.list();

    return {
      totalSessions: sessions.length,
      runningSessions: sessions.filter(s => s.status === 'running').length,
      startingSessions: sessions.filter(s => s.status === 'starting').length,
      errorSessions: sessions.filter(s => s.status === 'error').length,
      stoppedSessions: sessions.filter(s => s.status === 'stopped').length,
      portsInUse: this.portMap.size,
    };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalPiRuntime: PiRuntime | null = null;

/**
 * Get or create the global PiRuntime instance
 *
 * @param config - Configuration (used only on first call)
 * @returns The global PiRuntime instance
 */
export function getGlobalPiRuntime(config?: PiRuntimeConfig): PiRuntime {
  if (!globalPiRuntime) {
    globalPiRuntime = new PiRuntime(config);
  }
  return globalPiRuntime;
}

/**
 * Reset the global PiRuntime instance
 */
export function resetGlobalPiRuntime(): void {
  if (globalPiRuntime) {
    globalPiRuntime.dispose();
    globalPiRuntime = null;
  }
}

/**
 * Check if global PiRuntime exists
 */
export function hasGlobalPiRuntime(): boolean {
  return globalPiRuntime !== null;
}

// ============================================================================
// Exports
// ============================================================================

export default PiRuntime;
