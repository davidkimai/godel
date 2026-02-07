/**
 * Unit tests for ExecutionTracker
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ExecutionTracker } from '../execution-tracker';

describe('ExecutionTracker', () => {
  let tracker: ExecutionTracker;

  beforeEach(() => {
    tracker = new ExecutionTracker();
  });

  afterEach(() => {
    tracker.dispose();
  });

  describe('initialization', () => {
    it('should initialize with correct counts', () => {
      tracker.initialize(10, 3);

      const progress = tracker.getProgress();
      expect(progress.totalTasks).toBe(10);
      expect(progress.totalLevels).toBe(3);
      expect(progress.percentage).toBe(0);
    });

    it('should emit initialization event', () => {
      const handler = vi.fn();
      tracker.on('tracking:initialized', handler);

      tracker.initialize(5, 2);

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        totalTasks: 5,
        totalLevels: 2,
      }));
    });
  });

  describe('task tracking', () => {
    beforeEach(() => {
      tracker.initialize(3, 2);
    });

    it('should track task start', () => {
      tracker.onTaskStarted('task-1', 'agent-1');

      const status = tracker.getTaskStatus('task-1');
      expect(status.status).toBe('running');
      expect(status.agentId).toBe('agent-1');
      expect(status.startedAt).toBeDefined();
    });

    it('should emit task started event', () => {
      const handler = vi.fn();
      tracker.on('task:started', handler);

      tracker.onTaskStarted('task-1', 'agent-1');

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        taskId: 'task-1',
        agentId: 'agent-1',
      }));
    });

    it('should track task completion', () => {
      tracker.onTaskStarted('task-1', 'agent-1');
      tracker.onTaskCompleted('task-1', { output: 'result' });

      const status = tracker.getTaskStatus('task-1');
      expect(status.status).toBe('completed');
      expect(status.duration).toBeGreaterThanOrEqual(0);
    });

    it('should track task failure', () => {
      tracker.onTaskStarted('task-1', 'agent-1');
      tracker.onTaskFailed('task-1', new Error('Failed'), false);

      const status = tracker.getTaskStatus('task-1');
      expect(status.status).toBe('failed');
    });

    it('should track task cancellation', () => {
      tracker.onTaskCancelled('task-1');

      const status = tracker.getTaskStatus('task-1');
      expect(status.status).toBe('cancelled');
    });

    it('should track task skip', () => {
      tracker.onTaskSkipped('task-1', 'dependency-failed');

      const status = tracker.getTaskStatus('task-1');
      expect(status.status).toBe('skipped');
    });
  });

  describe('level tracking', () => {
    beforeEach(() => {
      tracker.initialize(4, 2);
    });

    it('should track level start', () => {
      const handler = vi.fn();
      tracker.on('level:started', handler);

      tracker.onLevelStarted(0, 2);

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        level: 0,
        taskCount: 2,
      }));
    });

    it('should track level completion', () => {
      tracker.onTaskStarted('task-1', 'agent-1');
      tracker.onTaskCompleted('task-1', 'result');
      tracker.onTaskStarted('task-2', 'agent-2');
      tracker.onTaskCompleted('task-2', 'result');

      const results = [
        { taskId: 'task-1', status: 'completed' as const, attempts: 1 },
        { taskId: 'task-2', status: 'completed' as const, attempts: 1 },
      ];

      tracker.onLevelCompleted(0, results);

      const progress = tracker.getProgress();
      expect(progress.completedTasks).toBe(2);
    });

    it('should update current level on level start', () => {
      tracker.onLevelStarted(1, 2);

      const progress = tracker.getProgress();
      expect(progress.currentLevel).toBe(1);
    });
  });

  describe('progress reporting', () => {
    beforeEach(() => {
      tracker.initialize(4, 2);
    });

    it('should calculate completion percentage', () => {
      tracker.onTaskStarted('task-1', 'agent-1');
      tracker.onTaskCompleted('task-1', 'result');
      tracker.onTaskStarted('task-2', 'agent-2');
      tracker.onTaskCompleted('task-2', 'result');

      const progress = tracker.getProgress();
      expect(progress.percentage).toBe(50);
      expect(progress.completedTasks).toBe(2);
    });

    it('should track running tasks', () => {
      tracker.onTaskStarted('task-1', 'agent-1');
      tracker.onTaskStarted('task-2', 'agent-2');

      const progress = tracker.getProgress();
      expect(progress.runningTasks).toBe(2);
    });

    it('should track failed tasks', () => {
      tracker.onTaskStarted('task-1', 'agent-1');
      tracker.onTaskFailed('task-1', new Error('Failed'), false);

      const progress = tracker.getProgress();
      expect(progress.failedTasks).toBe(1);
    });

    it('should estimate time remaining', () => {
      tracker = new ExecutionTracker({ enableETA: true });
      tracker.initialize(4, 2);

      // Complete 2 tasks
      tracker.onTaskStarted('task-1', 'agent-1');
      tracker.onTaskCompleted('task-1', 'result');
      tracker.onTaskStarted('task-2', 'agent-2');
      tracker.onTaskCompleted('task-2', 'result');

      const progress = tracker.getProgress();
      // With 2 tasks done and 2 remaining, ETA should be calculated
      expect(progress.estimatedTimeRemaining).toBeDefined();
    });

    it('should track active agents', () => {
      tracker.onTaskStarted('task-1', 'agent-1');
      tracker.onTaskStarted('task-2', 'agent-1');
      tracker.onTaskStarted('task-3', 'agent-2');

      const progress = tracker.getProgress();
      expect(progress.activeAgents).toContain('agent-1');
      expect(progress.activeAgents).toContain('agent-2');
      expect(progress.activeAgents).toHaveLength(2);
    });
  });

  describe('summary', () => {
    beforeEach(() => {
      tracker.initialize(5, 3);
    });

    it('should provide execution summary', () => {
      tracker.onTaskStarted('task-1', 'agent-1');
      tracker.onTaskCompleted('task-1', 'result');
      
      tracker.onTaskStarted('task-2', 'agent-2');
      tracker.onTaskFailed('task-2', new Error('Failed'), false);
      
      tracker.onTaskCancelled('task-3');
      tracker.onTaskSkipped('task-4', 'dependency-failed');
      
      tracker.onTaskStarted('task-5', 'agent-1');

      const summary = tracker.getSummary();

      expect(summary.totalTasks).toBe(5);
      expect(summary.completed).toBe(1);
      expect(summary.failed).toBe(1);
      expect(summary.cancelled).toBe(1);
      expect(summary.skipped).toBe(1);
      expect(summary.running).toBe(1);
      expect(summary.pending).toBe(0);
    });

    it('should calculate average task duration', () => {
      tracker.onTaskStarted('task-1', 'agent-1');
      tracker.onTaskCompleted('task-1', 'result');
      
      tracker.onTaskStarted('task-2', 'agent-2');
      tracker.onTaskCompleted('task-2', 'result');

      const summary = tracker.getSummary();
      expect(summary.averageTaskDurationMs).toBeDefined();
      expect(summary.averageTaskDurationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('query methods', () => {
    beforeEach(() => {
      tracker.initialize(4, 2);
    });

    it('should get tasks by status', () => {
      tracker.onTaskStarted('task-1', 'agent-1');
      tracker.onTaskCompleted('task-1', 'result');
      
      tracker.onTaskStarted('task-2', 'agent-2');
      tracker.onTaskFailed('task-2', new Error('Failed'), false);
      
      tracker.onTaskStarted('task-3', 'agent-3');

      const completed = tracker.getTasksByStatus('completed');
      const failed = tracker.getTasksByStatus('failed');
      const running = tracker.getTasksByStatus('running');

      expect(completed).toContain('task-1');
      expect(failed).toContain('task-2');
      expect(running).toContain('task-3');
    });

    it('should get individual task status', () => {
      tracker.onTaskStarted('task-1', 'agent-1');

      const status = tracker.getTaskStatus('task-1');
      expect(status.status).toBe('running');
      expect(status.agentId).toBe('agent-1');
    });

    it('should return pending for untracked tasks', () => {
      const status = tracker.getTaskStatus('unknown-task');
      expect(status.status).toBe('pending');
    });
  });

  describe('progress bar', () => {
    beforeEach(() => {
      tracker.initialize(4, 2);
    });

    it('should generate progress bar', () => {
      tracker.onTaskStarted('task-1', 'agent-1');
      tracker.onTaskCompleted('task-1', 'result');
      tracker.onTaskStarted('task-2', 'agent-2');
      tracker.onTaskCompleted('task-2', 'result');

      const bar = tracker.getProgressBar(20);
      expect(bar).toContain('[');
      expect(bar).toContain(']');
      expect(bar).toContain('50%');
    });

    it('should format progress', () => {
      tracker.onTaskStarted('task-1', 'agent-1');
      tracker.onTaskCompleted('task-1', 'result');

      const formatted = tracker.formatProgress();
      expect(formatted).toContain('Progress:');
      expect(formatted).toContain('Tasks:');
      expect(formatted).toContain('Level:');
    });
  });

  describe('reset and dispose', () => {
    beforeEach(() => {
      tracker.initialize(4, 2);
      tracker.onTaskStarted('task-1', 'agent-1');
      tracker.onTaskCompleted('task-1', 'result');
    });

    it('should reset all tracking state', () => {
      tracker.reset();

      expect(tracker.getProgress().totalTasks).toBe(0);
      expect(tracker.getTaskStatus('task-1').status).toBe('pending');
    });

    it('should emit reset event', () => {
      const handler = vi.fn();
      tracker.on('tracking:reset', handler);

      tracker.reset();

      expect(handler).toHaveBeenCalled();
    });

    it('should remove all listeners on dispose', () => {
      const handler = vi.fn();
      tracker.on('task:started', handler);

      tracker.dispose();
      tracker.initialize(2, 1);
      tracker.onTaskStarted('task-1', 'agent-1');

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('verbose mode', () => {
    it('should log when verbose is enabled', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      tracker = new ExecutionTracker({ verbose: true });
      tracker.initialize(2, 1);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ExecutionTracker] Initialized')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('progress updates', () => {
    it('should emit progress updates', () => {
      const handler = vi.fn();
      tracker.on('progress:updated', handler);

      tracker.initialize(2, 1);
      tracker.onTaskStarted('task-1', 'agent-1');

      expect(handler).toHaveBeenCalled();
    });
  });
});
