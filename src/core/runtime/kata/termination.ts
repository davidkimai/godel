/**
 * VM Termination Manager - Graceful shutdown handling for Kata Containers
 *
 * Features:
 * - SIGTERM signal handling with graceful shutdown
 * - Configurable cleanup procedures for resources
 * - State preservation with snapshot option
 * - Force kill after configurable timeout
 * - Event emission for shutdown lifecycle
 * - Cleanup hook registration for custom handlers
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

export interface TerminationConfig {
  gracefulTimeoutMs: number;
  forceKillTimeoutMs: number;
  preserveState: boolean;
  snapshotPath?: string;
  cleanupResources: boolean;
  emitEvents: boolean;
  exitCode: number;
}

export interface CleanupTask {
  id: string;
  name: string;
  handler: () => Promise<void> | void;
  priority: number;
  timeoutMs: number;
}

export interface TerminationState {
  isShuttingDown: boolean;
  shutdownStartTime: Date | null;
  cleanupTasksCompleted: string[];
  cleanupTasksFailed: string[];
  statePreserved: boolean;
  forceKilled: boolean;
}

export type TerminationPhase =
  | 'idle'
  | 'sigterm_received'
  | 'cleanup_started'
  | 'state_preservation'
  | 'cleanup_completed'
  | 'force_kill';

export class VMTerminationManager extends EventEmitter {
  private config: TerminationConfig;
  private state: TerminationState;
  private cleanupTasks: Map<string, CleanupTask>;
  private shutdownTimer: NodeJS.Timeout | null;
  private forceKillTimer: NodeJS.Timeout | null;
  private originalSigtermHandler: NodeJS.SignalsListener | null;

  constructor(config: Partial<TerminationConfig> = {}) {
    super();

    this.config = {
      gracefulTimeoutMs: 30000,
      forceKillTimeoutMs: 10000,
      preserveState: false,
      cleanupResources: true,
      emitEvents: true,
      exitCode: 0,
      ...config,
    };

    this.state = {
      isShuttingDown: false,
      shutdownStartTime: null,
      cleanupTasksCompleted: [],
      cleanupTasksFailed: [],
      statePreserved: false,
      forceKilled: false,
    };

    this.cleanupTasks = new Map();
    this.shutdownTimer = null;
    this.forceKillTimer = null;
    this.originalSigtermHandler = null;
  }

  /**
   * Initialize SIGTERM handler
   */
  initialize(): void {
    this.originalSigtermHandler = process.listeners('SIGTERM')[0] || null;
    process.removeAllListeners('SIGTERM');
    process.on('SIGTERM', this.handleSigterm.bind(this));

    this.emitEvent('initialized', {
      gracefulTimeoutMs: this.config.gracefulTimeoutMs,
      forceKillTimeoutMs: this.config.forceKillTimeoutMs,
      preserveState: this.config.preserveState,
    });
  }

  /**
   * Restore original SIGTERM handler
   */
  cleanup(): void {
    process.removeAllListeners('SIGTERM');
    if (this.originalSigtermHandler) {
      process.on('SIGTERM', this.originalSigtermHandler);
    }

    if (this.shutdownTimer) {
      clearTimeout(this.shutdownTimer);
      this.shutdownTimer = null;
    }

    if (this.forceKillTimer) {
      clearTimeout(this.forceKillTimer);
      this.forceKillTimer = null;
    }

    this.cleanupTasks.clear();
  }

  /**
   * Register a cleanup task
   */
  registerCleanupTask(
    name: string,
    handler: () => Promise<void> | void,
    priority: number = 100,
    timeoutMs: number = 5000
  ): string {
    const id = uuidv4();
    const task: CleanupTask = {
      id,
      name,
      handler,
      priority,
      timeoutMs,
    };

    this.cleanupTasks.set(id, task);
    this.emitEvent('cleanup_task_registered', { id, name, priority });

    return id;
  }

  /**
   * Unregister a cleanup task
   */
  unregisterCleanupTask(taskId: string): boolean {
    const task = this.cleanupTasks.get(taskId);
    if (!task) {
      return false;
    }

    this.cleanupTasks.delete(taskId);
    this.emitEvent('cleanup_task_unregistered', { id: taskId, name: task.name });

    return true;
  }

  /**
   * Get all registered cleanup tasks
   */
  getCleanupTasks(): CleanupTask[] {
    return Array.from(this.cleanupTasks.values()).sort(
      (a, b) => a.priority - b.priority
    );
  }

  /**
   * Handle SIGTERM signal
   */
  private async handleSigterm(): Promise<void> {
    if (this.state.isShuttingDown) {
      this.emitEvent('sigterm_ignored_already_shutting_down', {});
      return;
    }

    this.state.isShuttingDown = true;
    this.state.shutdownStartTime = new Date();

    this.emitEvent('sigterm_received', {
      timestamp: this.state.shutdownStartTime,
      gracefulTimeoutMs: this.config.gracefulTimeoutMs,
    });

    // Set graceful shutdown timeout
    this.shutdownTimer = setTimeout(() => {
      this.emitEvent('graceful_timeout_reached', {
        elapsedMs: this.config.gracefulTimeoutMs,
      });
      this.forceShutdown();
    }, this.config.gracefulTimeoutMs);

    try {
      await this.performGracefulShutdown();
    } catch (error) {
      this.emitEvent('graceful_shutdown_error', {
        error: error instanceof Error ? error.message : String(error),
      });
      this.forceShutdown();
    }
  }

  /**
   * Perform graceful shutdown
   */
  private async performGracefulShutdown(): Promise<void> {
    this.emitEvent('shutdown_started', { phase: 'cleanup_started' });

    // Execute cleanup tasks in priority order
    if (this.config.cleanupResources) {
      await this.executeCleanupTasks();
    }

    // Preserve state if enabled
    if (this.config.preserveState) {
      await this.preserveState();
    }

    // Clear shutdown timer
    if (this.shutdownTimer) {
      clearTimeout(this.shutdownTimer);
      this.shutdownTimer = null;
    }

    this.emitEvent('shutdown_completed', {
      tasksCompleted: this.state.cleanupTasksCompleted.length,
      tasksFailed: this.state.cleanupTasksFailed.length,
      statePreserved: this.state.statePreserved,
    });

    // Exit cleanly
    process.exit(this.config.exitCode);
  }

  /**
   * Execute all registered cleanup tasks
   */
  private async executeCleanupTasks(): Promise<void> {
    const tasks = this.getCleanupTasks();

    this.emitEvent('cleanup_tasks_started', {
      taskCount: tasks.length,
    });

    for (const task of tasks) {
      try {
        this.emitEvent('cleanup_task_started', {
          id: task.id,
          name: task.name,
          priority: task.priority,
        });

        // Execute with timeout
        await this.executeWithTimeout(task.handler, task.timeoutMs);

        this.state.cleanupTasksCompleted.push(task.id);
        this.emitEvent('cleanup_task_completed', {
          id: task.id,
          name: task.name,
        });
      } catch (error) {
        this.state.cleanupTasksFailed.push(task.id);
        this.emitEvent('cleanup_task_failed', {
          id: task.id,
          name: task.name,
          error: error instanceof Error ? error.message : String(error),
        });

        // Continue with other tasks even if one fails
      }
    }

    this.emitEvent('cleanup_tasks_completed', {
      completed: this.state.cleanupTasksCompleted.length,
      failed: this.state.cleanupTasksFailed.length,
    });
  }

  /**
   * Execute function with timeout
   */
  private executeWithTimeout<T>(
    fn: () => Promise<T> | T,
    timeoutMs: number
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Cleanup task timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      Promise.resolve(fn())
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * Preserve VM state
   */
  private async preserveState(): Promise<void> {
    this.emitEvent('state_preservation_started', {
      snapshotPath: this.config.snapshotPath,
    });

    try {
      // State preservation logic would be implemented here
      // This could involve creating a snapshot, saving memory state, etc.
      this.state.statePreserved = true;

      this.emitEvent('state_preservation_completed', {
        snapshotPath: this.config.snapshotPath,
      });
    } catch (error) {
      this.emitEvent('state_preservation_failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Force shutdown after timeout
   */
  private forceShutdown(): void {
    if (this.state.forceKilled) {
      return;
    }

    this.state.forceKilled = true;

    this.emitEvent('force_shutdown_initiated', {
      reason: 'graceful_timeout_exceeded',
      elapsedMs: Date.now() - (this.state.shutdownStartTime?.getTime() || 0),
    });

    // Set force kill timeout
    this.forceKillTimer = setTimeout(() => {
      this.emitEvent('force_kill_executed', {
        timestamp: new Date(),
      });
      process.exit(1);
    }, this.config.forceKillTimeoutMs);

    // Attempt immediate force kill
    this.performForceKill();
  }

  /**
   * Perform force kill operations
   */
  private performForceKill(): void {
    // Kill any remaining processes, close connections, etc.
    this.emitEvent('force_kill_performed', {
      timestamp: new Date(),
    });

    // Force exit
    process.exit(1);
  }

  /**
   * Trigger graceful shutdown programmatically
   */
  async triggerGracefulShutdown(exitCode: number = 0): Promise<void> {
    this.config.exitCode = exitCode;
    await this.handleSigterm();
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
  getState(): TerminationState {
    return { ...this.state };
  }

  /**
   * Get current termination phase
   */
  getPhase(): TerminationPhase {
    if (!this.state.isShuttingDown) {
      return 'idle';
    }

    if (this.state.forceKilled) {
      return 'force_kill';
    }

    if (this.state.statePreserved) {
      return 'cleanup_completed';
    }

    if (this.state.cleanupTasksCompleted.length > 0) {
      return this.config.preserveState ? 'state_preservation' : 'cleanup_completed';
    }

    return 'cleanup_started';
  }

  /**
   * Get elapsed time since shutdown started
   */
  getElapsedTimeMs(): number {
    if (!this.state.shutdownStartTime) {
      return 0;
    }
    return Date.now() - this.state.shutdownStartTime.getTime();
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<TerminationConfig>): void {
    this.config = { ...this.config, ...config };
    this.emitEvent('config_updated', { config: this.config });
  }

  /**
   * Emit event if enabled
   */
  private emitEvent(event: string, data: Record<string, unknown>): void {
    if (this.config.emitEvents) {
      this.emit(event, data);
    }
  }
}

export default VMTerminationManager;
