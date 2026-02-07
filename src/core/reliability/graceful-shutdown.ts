/**
 * Graceful Shutdown Handler
 *
 * Manages graceful application shutdown with proper cleanup ordering,
 * timeout handling, and force kill capabilities.
 *
 * @module core/reliability/graceful-shutdown
 */

import { EventEmitter } from 'events';

export interface ShutdownHandler {
  /** Unique name for the handler */
  name: string;
  /** Handler function */
  handler: () => Promise<void> | void;
  /** Priority (lower = executed first) (default: 100) */
  priority?: number;
  /** Timeout for this handler in ms (default: 5000) */
  timeout?: number;
}

export interface GracefulShutdownOptions {
  /** Total shutdown timeout in milliseconds (default: 30000) */
  timeoutMs?: number;
  /** Exit code on success (default: 0) */
  successExitCode?: number;
  /** Exit code on failure (default: 1) */
  failureExitCode?: number;
  /** Enable force exit after timeout (default: true) */
  forceExit?: boolean;
  /** Signals to handle (default: ['SIGTERM', 'SIGINT']) */
  signals?: NodeJS.Signals[];
  /** Log function (default: console) */
  log?: (level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) => void;
}

export interface ShutdownState {
  isShuttingDown: boolean;
  startTime?: Date;
  signal?: string;
  handlersExecuted: string[];
  handlersFailed: Array<{ name: string; error: Error }>;
}

type ShutdownPhase = 'initial' | 'pre-cleanup' | 'cleanup' | 'post-cleanup' | 'complete';

/**
 * Graceful shutdown manager
 */
export class GracefulShutdown extends EventEmitter {
  private handlers: Map<string, ShutdownHandler> = new Map();
  private state: ShutdownState = {
    isShuttingDown: false,
    handlersExecuted: [],
    handlersFailed: [],
  };
  private options: Required<GracefulShutdownOptions>;
  private currentPhase: ShutdownPhase = 'initial';

  constructor(options: GracefulShutdownOptions = {}) {
    super();
    
    this.options = {
      timeoutMs: 30000,
      successExitCode: 0,
      failureExitCode: 1,
      forceExit: true,
      signals: ['SIGTERM', 'SIGINT'],
      log: (level, message, meta) => {
        const timestamp = new Date().toISOString();
        const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
        console[level](`[${timestamp}] [shutdown:${level}] ${message}${metaStr}`);
      },
      ...options,
    };

    this.setupSignalHandlers();
  }

  /**
   * Set up signal handlers
   */
  private setupSignalHandlers(): void {
    for (const signal of this.options.signals) {
      process.on(signal, () => {
        this.shutdown(signal);
      });
    }

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      this.options.log('error', 'Uncaught exception', { error: error.message });
      this.shutdown('uncaughtException');
    });

    // Handle unhandled rejections
    process.on('unhandledRejection', (reason) => {
      this.options.log('error', 'Unhandled rejection', { reason: String(reason) });
      this.shutdown('unhandledRejection');
    });

    // Handle beforeExit for clean exits
    process.on('beforeExit', () => {
      if (!this.state.isShuttingDown) {
        this.shutdown('beforeExit');
      }
    });
  }

  /**
   * Register a shutdown handler
   */
  register(handler: ShutdownHandler): void {
    if (this.state.isShuttingDown) {
      throw new Error('Cannot register handler during shutdown');
    }

    const existing = this.handlers.get(handler.name);
    if (existing) {
      this.options.log('warn', `Overwriting existing handler: ${handler.name}`);
    }

    this.handlers.set(handler.name, {
      priority: 100,
      timeout: 5000,
      ...handler,
    });

    this.emit('handler:registered', { name: handler.name });
  }

  /**
   * Unregister a shutdown handler
   */
  unregister(name: string): boolean {
    const deleted = this.handlers.delete(name);
    if (deleted) {
      this.emit('handler:unregistered', { name });
    }
    return deleted;
  }

  /**
   * Register a database connection cleanup handler
   */
  registerDatabase(name: string, closeFn: () => Promise<void> | void): void {
    this.register({
      name: `db:${name}`,
      handler: closeFn,
      priority: 10, // Close DB connections early
      timeout: 10000,
    });
  }

  /**
   * Register an HTTP server shutdown handler
   */
  registerHttpServer(name: string, server: { close: (cb?: () => void) => void }, timeoutMs = 10000): void {
    this.register({
      name: `http:${name}`,
      handler: async () => {
        return new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error(`HTTP server ${name} close timeout`));
          }, timeoutMs);

          server.close(() => {
            clearTimeout(timeout);
            resolve();
          });
        });
      },
      priority: 20, // Close HTTP servers after stopping new requests
      timeout: timeoutMs + 2000,
    });
  }

  /**
   * Register a message queue/consumer shutdown handler
   */
  registerConsumer(name: string, stopFn: () => Promise<void> | void): void {
    this.register({
      name: `consumer:${name}`,
      handler: stopFn,
      priority: 30, // Stop consumers before HTTP servers
      timeout: 15000,
    });
  }

  /**
   * Register a cache/redis shutdown handler
   */
  registerCache(name: string, quitFn: () => Promise<void> | void): void {
    this.register({
      name: `cache:${name}`,
      handler: quitFn,
      priority: 15, // Close cache after DB but before HTTP
      timeout: 5000,
    });
  }

  /**
   * Register a circuit breaker shutdown handler
   */
  registerCircuitBreaker(name: string, shutdownFn: () => Promise<void> | void): void {
    this.register({
      name: `circuit-breaker:${name}`,
      handler: shutdownFn,
      priority: 40,
      timeout: 5000,
    });
  }

  /**
   * Execute shutdown
   */
  async shutdown(signal?: string): Promise<void> {
    if (this.state.isShuttingDown) {
      this.options.log('warn', 'Shutdown already in progress');
      return;
    }

    this.state.isShuttingDown = true;
    this.state.startTime = new Date();
    this.state.signal = signal;

    this.options.log('info', 'Starting graceful shutdown', { signal });
    this.emit('shutdown:start', { signal, startTime: this.state.startTime });

    // Set up force exit timeout
    let forceExitTimeout: NodeJS.Timeout | undefined;
    if (this.options.forceExit) {
      forceExitTimeout = setTimeout(() => {
        this.options.log('error', 'Shutdown timeout exceeded, forcing exit');
        this.emit('shutdown:timeout');
        process.exit(this.options.failureExitCode);
      }, this.options.timeoutMs);
    }

    try {
      // Execute handlers by priority
      await this.executeHandlers();

      // Clear force exit timeout if all succeeded
      if (forceExitTimeout) {
        clearTimeout(forceExitTimeout);
      }

      const duration = this.state.startTime 
        ? Date.now() - this.state.startTime.getTime() 
        : 0;

      this.options.log('info', 'Graceful shutdown completed', {
        duration,
        handlersExecuted: this.state.handlersExecuted.length,
        handlersFailed: this.state.handlersFailed.length,
      });

      this.emit('shutdown:complete', { duration });
      this.currentPhase = 'complete';

      process.exit(this.options.successExitCode);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.options.log('error', 'Shutdown failed', { error: err.message });
      this.emit('shutdown:error', { error: err });

      if (forceExitTimeout) {
        clearTimeout(forceExitTimeout);
      }

      process.exit(this.options.failureExitCode);
    }
  }

  /**
   * Execute all registered handlers in priority order
   */
  private async executeHandlers(): Promise<void> {
    // Sort handlers by priority (lower first)
    const sortedHandlers = Array.from(this.handlers.values()).sort(
      (a, b) => (a.priority || 100) - (b.priority || 100)
    );

    this.currentPhase = 'cleanup';

    for (const handler of sortedHandlers) {
      this.emit('handler:start', { name: handler.name });
      
      try {
        // Execute with timeout
        const timeoutMs = handler.timeout || 5000;
        await this.executeWithTimeout(handler.handler, timeoutMs, handler.name);
        
        this.state.handlersExecuted.push(handler.name);
        this.emit('handler:success', { name: handler.name });
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.state.handlersFailed.push({ name: handler.name, error: err });
        this.options.log('error', `Handler failed: ${handler.name}`, { error: err.message });
        this.emit('handler:failure', { name: handler.name, error: err });
        
        // Continue with other handlers even if one fails
      }
    }
  }

  /**
   * Execute a handler with timeout
   */
  private async executeWithTimeout(
    handler: () => Promise<void> | void,
    timeoutMs: number,
    name: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Handler ${name} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      Promise.resolve(handler())
        .then(() => {
          clearTimeout(timeout);
          resolve();
        })
        .catch((error) => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  /**
   * Check if shutdown is in progress
   */
  isShuttingDown(): boolean {
    return this.state.isShuttingDown;
  }

  /**
   * Get current shutdown state
   */
  getState(): ShutdownState {
    return { ...this.state };
  }

  /**
   * Get registered handler names
   */
  getHandlerNames(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Get current phase
   */
  getPhase(): ShutdownPhase {
    return this.currentPhase;
  }

  /**
   * Reset state (primarily for testing)
   */
  reset(): void {
    this.state = {
      isShuttingDown: false,
      handlersExecuted: [],
      handlersFailed: [],
    };
    this.currentPhase = 'initial';
  }
}

/**
 * Singleton instance for application-wide shutdown management
 */
let globalShutdown: GracefulShutdown | null = null;

/**
 * Get or create global shutdown manager
 */
export function getGlobalShutdown(options?: GracefulShutdownOptions): GracefulShutdown {
  if (!globalShutdown) {
    globalShutdown = new GracefulShutdown(options);
  }
  return globalShutdown;
}

/**
 * Reset global shutdown manager (for testing)
 */
export function resetGlobalShutdown(): void {
  globalShutdown = null;
}

export default {
  GracefulShutdown,
  getGlobalShutdown,
  resetGlobalShutdown,
};
