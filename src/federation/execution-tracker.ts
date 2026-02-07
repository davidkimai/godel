/**
 * Execution Tracker - Visual progress tracking for task execution
 * 
 * Provides real-time tracking of execution progress with event emission
 * for UI updates, logging, and monitoring.
 */

import { EventEmitter } from 'events';
import {
  ProgressReport,
  TaskResult,
  TaskExecutionStatus,
  TaskStartedEvent,
  TaskCompletedEvent,
  TaskFailedEvent,
  LevelCompletedEvent,
} from './types';

/**
 * Options for the execution tracker
 */
export interface ExecutionTrackerOptions {
  /** Enable verbose logging */
  verbose?: boolean;
  /** Update interval for progress reports (ms) */
  updateIntervalMs?: number;
  /** Enable ETA estimation */
  enableETA?: boolean;
}

/**
 * Tracks execution progress and emits events for visualization
 */
export class ExecutionTracker extends EventEmitter {
  private taskStates: Map<string, TaskExecutionStatus> = new Map();
  private taskStartTimes: Map<string, number> = new Map();
  private taskAgents: Map<string, string> = new Map();
  private taskDurations: Map<string, number> = new Map();
  private levelCompletions: Map<number, { completed: number; failed: number }> = new Map();
  
  private totalTasks: number = 0;
  private totalLevels: number = 0;
  private currentLevel: number = 0;
  private startedAt: number = 0;
  private options: ExecutionTrackerOptions;
  private updateTimer?: NodeJS.Timeout;

  constructor(options: ExecutionTrackerOptions = {}) {
    super();
    this.options = {
      verbose: false,
      updateIntervalMs: 1000,
      enableETA: true,
      ...options,
    };
  }

  /**
   * Initialize tracking for a new execution
   * @param totalTasks - Total number of tasks
   * @param totalLevels - Total number of execution levels
   */
  initialize(totalTasks: number, totalLevels: number): void {
    this.totalTasks = totalTasks;
    this.totalLevels = totalLevels;
    this.currentLevel = 0;
    this.startedAt = Date.now();
    
    this.taskStates.clear();
    this.taskStartTimes.clear();
    this.taskAgents.clear();
    this.taskDurations.clear();
    this.levelCompletions.clear();

    this.emit('tracking:initialized', {
      totalTasks,
      totalLevels,
      timestamp: this.startedAt,
    });

    if (this.options.verbose) {
      console.log(`[ExecutionTracker] Initialized: ${totalTasks} tasks, ${totalLevels} levels`);
    }

    // Start progress updates
    this.startProgressUpdates();
  }

  /**
   * Record that a task has started
   * @param taskId - Task identifier
   * @param agentId - Agent executing the task
   */
  onTaskStarted(taskId: string, agentId: string): void {
    const timestamp = Date.now();
    
    this.taskStates.set(taskId, 'running');
    this.taskStartTimes.set(taskId, timestamp);
    this.taskAgents.set(taskId, agentId);

    const event: TaskStartedEvent = {
      taskId,
      agentId,
      timestamp,
      level: this.currentLevel,
    };

    this.emit('task:started', event);

    if (this.options.verbose) {
      console.log(`[ExecutionTracker] Task ${taskId} started on agent ${agentId}`);
    }

    this.emitProgressUpdate();
  }

  /**
   * Record that a task has completed
   * @param taskId - Task identifier
   * @param result - Task result
   */
  onTaskCompleted(taskId: string, result: unknown): void {
    const timestamp = Date.now();
    const startTime = this.taskStartTimes.get(taskId) || timestamp;
    const duration = timestamp - startTime;

    this.taskStates.set(taskId, 'completed');
    this.taskDurations.set(taskId, duration);

    const event: TaskCompletedEvent = {
      taskId,
      result,
      timestamp,
      durationMs: duration,
    };

    this.emit('task:completed', event);

    if (this.options.verbose) {
      console.log(`[ExecutionTracker] Task ${taskId} completed in ${duration}ms`);
    }

    this.emitProgressUpdate();
  }

  /**
   * Record that a task has failed
   * @param taskId - Task identifier
   * @param error - Error that occurred
   * @param willRetry - Whether the task will be retried
   */
  onTaskFailed(taskId: string, error: Error, willRetry: boolean = false): void {
    const timestamp = Date.now();
    const startTime = this.taskStartTimes.get(taskId) || timestamp;
    const duration = timestamp - startTime;

    if (!willRetry) {
      this.taskStates.set(taskId, 'failed');
    }
    this.taskDurations.set(taskId, duration);

    const event: TaskFailedEvent = {
      taskId,
      error,
      timestamp,
      willRetry,
    };

    this.emit('task:failed', event);

    if (this.options.verbose) {
      console.log(
        `[ExecutionTracker] Task ${taskId} failed after ${duration}ms${
          willRetry ? ' (will retry)' : ''
        }: ${error.message}`
      );
    }

    this.emitProgressUpdate();
  }

  /**
   * Record that a task has been cancelled
   * @param taskId - Task identifier
   */
  onTaskCancelled(taskId: string): void {
    this.taskStates.set(taskId, 'cancelled');

    this.emit('task:cancelled', {
      taskId,
      timestamp: Date.now(),
    });

    if (this.options.verbose) {
      console.log(`[ExecutionTracker] Task ${taskId} cancelled`);
    }

    this.emitProgressUpdate();
  }

  /**
   * Record that a task has been skipped
   * @param taskId - Task identifier
   * @param reason - Reason for skipping
   */
  onTaskSkipped(taskId: string, reason: string): void {
    this.taskStates.set(taskId, 'skipped');

    this.emit('task:skipped', {
      taskId,
      reason,
      timestamp: Date.now(),
    });

    if (this.options.verbose) {
      console.log(`[ExecutionTracker] Task ${taskId} skipped: ${reason}`);
    }

    this.emitProgressUpdate();
  }

  /**
   * Record that a level has started
   * @param level - Level number
   * @param taskCount - Number of tasks in this level
   */
  onLevelStarted(level: number, taskCount: number): void {
    this.currentLevel = level;

    this.emit('level:started', {
      level,
      taskCount,
      timestamp: Date.now(),
    });

    if (this.options.verbose) {
      console.log(`[ExecutionTracker] Level ${level} started with ${taskCount} tasks`);
    }
  }

  /**
   * Record that a level has completed
   * @param level - Level number
   * @param results - Results for all tasks in the level
   */
  onLevelCompleted(level: number, results: TaskResult[]): void {
    const completed = results.filter((r) => r.status === 'completed').length;
    const failed = results.filter((r) => r.status === 'failed').length;

    this.levelCompletions.set(level, { completed, failed });

    const event: LevelCompletedEvent = {
      level,
      completedTasks: results.filter((r) => r.status === 'completed').map((r) => r.taskId),
      failedTasks: results.filter((r) => r.status === 'failed').map((r) => r.taskId),
      timestamp: Date.now(),
    };

    this.emit('level:completed', event);

    if (this.options.verbose) {
      console.log(
        `[ExecutionTracker] Level ${level} completed: ${completed} completed, ${failed} failed`
      );
    }

    this.emitProgressUpdate();
  }

  /**
   * Get current progress report
   */
  getProgress(): ProgressReport {
    const completedTasks = Array.from(this.taskStates.values()).filter(
      (s) => s === 'completed'
    ).length;
    const failedTasks = Array.from(this.taskStates.values()).filter(
      (s) => s === 'failed'
    ).length;
    const runningTasks = Array.from(this.taskStates.values()).filter(
      (s) => s === 'running'
    ).length;
    const pendingTasks = this.totalTasks - completedTasks - failedTasks - runningTasks;

    const percentage = this.totalTasks > 0 
      ? Math.round(((completedTasks + failedTasks) / this.totalTasks) * 100) 
      : 0;

    const activeAgents = Array.from(this.taskAgents.values()).filter((agentId, index, self) => 
      self.indexOf(agentId) === index
    );

    let estimatedTimeRemaining: number | undefined;
    
    if (this.options.enableETA && completedTasks > 0) {
      const elapsed = Date.now() - this.startedAt;
      const avgTimePerTask = elapsed / completedTasks;
      const remainingTasks = this.totalTasks - completedTasks - failedTasks;
      estimatedTimeRemaining = Math.round(avgTimePerTask * remainingTasks);
    }

    return {
      totalTasks: this.totalTasks,
      completedTasks,
      failedTasks,
      pendingTasks,
      runningTasks,
      percentage,
      currentLevel: this.currentLevel,
      totalLevels: this.totalLevels,
      activeAgents,
      estimatedTimeRemaining,
    };
  }

  /**
   * Get detailed status of a specific task
   * @param taskId - Task identifier
   */
  getTaskStatus(taskId: string): {
    status: TaskExecutionStatus | 'pending';
    agentId?: string;
    duration?: number;
    startedAt?: number;
  } {
    const status = this.taskStates.get(taskId);
    const agentId = this.taskAgents.get(taskId);
    const duration = this.taskDurations.get(taskId);
    const startedAt = this.taskStartTimes.get(taskId);

    return {
      status: status || 'pending',
      agentId,
      duration,
      startedAt,
    };
  }

  /**
   * Get all tasks with a specific status
   * @param status - Status to filter by
   */
  getTasksByStatus(status: TaskExecutionStatus): string[] {
    return Array.from(this.taskStates.entries())
      .filter(([, s]) => s === status)
      .map(([taskId]) => taskId);
  }

  /**
   * Get execution summary
   */
  getSummary(): {
    totalTasks: number;
    completed: number;
    failed: number;
    cancelled: number;
    skipped: number;
    running: number;
    pending: number;
    durationMs: number;
    averageTaskDurationMs?: number;
  } {
    const now = Date.now();
    const durationMs = this.startedAt > 0 ? now - this.startedAt : 0;

    const completed = this.getTasksByStatus('completed').length;
    const failed = this.getTasksByStatus('failed').length;
    const cancelled = this.getTasksByStatus('cancelled').length;
    const skipped = this.getTasksByStatus('skipped').length;
    const running = this.getTasksByStatus('running').length;
    const pending = this.totalTasks - completed - failed - cancelled - skipped - running;

    const durations = Array.from(this.taskDurations.values());
    const averageTaskDurationMs = durations.length > 0
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : undefined;

    return {
      totalTasks: this.totalTasks,
      completed,
      failed,
      cancelled,
      skipped,
      running,
      pending,
      durationMs,
      averageTaskDurationMs,
    };
  }

  /**
   * Generate a visual progress bar
   * @param length - Length of the bar in characters
   */
  getProgressBar(length: number = 40): string {
    const progress = this.getProgress();
    const filled = Math.round((progress.percentage / 100) * length);
    const empty = length - filled;
    
    return `[${'='.repeat(filled)}${' '.repeat(empty)}] ${progress.percentage}%`;
  }

  /**
   * Format progress as a human-readable string
   */
  formatProgress(): string {
    const progress = this.getProgress();
    const lines: string[] = [
      `Progress: ${this.getProgressBar()}`,
      `Tasks: ${progress.completedTasks}/${progress.totalTasks} completed, ` +
        `${progress.failedTasks} failed, ${progress.runningTasks} running, ` +
        `${progress.pendingTasks} pending`,
      `Level: ${progress.currentLevel + 1}/${progress.totalLevels}`,
    ];

    if (progress.estimatedTimeRemaining !== undefined) {
      lines.push(`ETA: ${this.formatDuration(progress.estimatedTimeRemaining)}`);
    }

    return lines.join('\n');
  }

  /**
   * Reset the tracker
   */
  reset(): void {
    this.stopProgressUpdates();
    this.taskStates.clear();
    this.taskStartTimes.clear();
    this.taskAgents.clear();
    this.taskDurations.clear();
    this.levelCompletions.clear();
    this.totalTasks = 0;
    this.totalLevels = 0;
    this.currentLevel = 0;
    this.startedAt = 0;

    this.emit('tracking:reset', { timestamp: Date.now() });
  }

  /**
   * Dispose of the tracker and clean up resources
   */
  dispose(): void {
    this.reset();
    this.removeAllListeners();
  }

  /**
   * Start periodic progress updates
   */
  private startProgressUpdates(): void {
    if (this.updateTimer) {
      return;
    }

    this.updateTimer = setInterval(() => {
      this.emitProgressUpdate();
    }, this.options.updateIntervalMs);
  }

  /**
   * Stop periodic progress updates
   */
  private stopProgressUpdates(): void {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = undefined;
    }
  }

  /**
   * Emit a progress update event
   */
  private emitProgressUpdate(): void {
    const progress = this.getProgress();
    this.emit('progress:updated', { progress, timestamp: Date.now() });
  }

  /**
   * Format duration in human-readable format
   */
  private formatDuration(ms: number): string {
    if (ms < 1000) {
      return `${ms}ms`;
    }
    
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) {
      return `${seconds}s`;
    }
    
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes < 60) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }
}

/**
 * Create a formatted progress reporter for console output
 */
export function createConsoleReporter(
  tracker: ExecutionTracker,
  options: { showProgressBar?: boolean; showTaskDetails?: boolean } = {}
): () => void {
  const { showProgressBar = true, showTaskDetails = false } = options;

  const onProgress = ({ progress }: { progress: ProgressReport }): void => {
    if (showProgressBar) {
      console.clear();
      console.log(tracker.formatProgress());
    }

    if (showTaskDetails && progress.runningTasks > 0) {
      console.log('\nRunning tasks:');
      // This would need access to task names, which we'd need to store
    }
  };

  tracker.on('progress:updated', onProgress);

  // Return cleanup function
  return () => {
    tracker.off('progress:updated', onProgress);
  };
}
