/**
 * Task Queue Integration Tests
 * 
 * Integration tests for the task queue with Redis.
 * These tests require a running Redis instance.
 * 
 * Run with: npm run test:integration:queue
 */

import { TaskQueue } from '../../src/queue/task-queue';
import type { EnqueueTaskOptions } from '../../src/queue/types';

// Skip these tests if Redis is not available
const describeIfRedis = process.env['REDIS_URL'] ? describe : describe.skip;

describeIfRedis('TaskQueue Integration', () => {
  let queue: TaskQueue;
  
  const redisConfig = {
    host: process.env['REDIS_HOST'] || 'localhost',
    port: parseInt(process.env['REDIS_PORT'] || '6379', 10),
    password: process.env['REDIS_PASSWORD'],
    keyPrefix: 'test:dash:queue:',
  };

  beforeEach(async () => {
    queue = new TaskQueue({
      redis: redisConfig,
      maxRetries: 2,
      baseRetryDelayMs: 100,
      pollIntervalMs: 50,
    });

    await queue.start();
  });

  afterEach(async () => {
    await queue.stop();
  });

  describe('End-to-End Task Flow', () => {
    it('should complete full task lifecycle', async () => {
      // Register an agent
      await queue.registerAgent({
        id: 'test-agent',
        skills: ['typescript'],
        capacity: 3,
      });

      // Send heartbeat to keep agent online
      await queue.agentHeartbeat('test-agent');

      // Enqueue a task
      const task = await queue.enqueue({
        type: 'test-task',
        payload: { data: 'test' },
        priority: 'high',
      });

      expect(task.status).toBe('pending');

      // Agent claims task
      const claimedTask = await queue.claimTask('test-agent');
      expect(claimedTask).not.toBeNull();
      expect(claimedTask!.id).toBe(task.id);
      expect(claimedTask!.status).toBe('assigned');
      expect(claimedTask!.assigneeId).toBe('test-agent');

      // Start processing
      await queue.startTask(task.id);
      let updatedTask = await queue.getTask(task.id);
      expect(updatedTask!.status).toBe('processing');

      // Update progress
      await queue.updateProgress(task.id, 50, { step: 'halfway' });
      updatedTask = await queue.getTask(task.id);
      expect(updatedTask!.progress).toBe(50);
      expect(updatedTask!.progressData).toEqual({ step: 'halfway' });

      // Complete task
      await queue.completeTask(task.id, { result: 'success' });
      updatedTask = await queue.getTask(task.id);
      expect(updatedTask!.status).toBe('completed');
      expect(updatedTask!.progress).toBe(100);
    });

    it('should retry failed tasks with exponential backoff', async () => {
      // Register agent
      await queue.registerAgent({
        id: 'test-agent',
        capacity: 1,
      });
      await queue.agentHeartbeat('test-agent');

      // Enqueue task with 2 max retries
      const task = await queue.enqueue({
        type: 'failing-task',
        payload: {},
        maxRetries: 2,
        retryDelayMs: 100,
      });

      // First failure
      let claimedTask = await queue.claimTask('test-agent');
      await queue.failTask(claimedTask!.id, 'First failure');

      let updatedTask = await queue.getTask(task.id);
      expect(updatedTask!.retryCount).toBe(1);
      expect(updatedTask!.status).toBe('scheduled'); // Waiting for retry

      // Wait for retry delay and process scheduled tasks
      await new Promise(r => setTimeout(r, 150));
      
      // Task should be available again
      claimedTask = await queue.claimTask('test-agent');
      expect(claimedTask).not.toBeNull();

      // Second failure
      await queue.failTask(claimedTask!.id, 'Second failure');
      updatedTask = await queue.getTask(task.id);
      expect(updatedTask!.retryCount).toBe(2);
      expect(updatedTask!.status).toBe('scheduled');

      // Wait and process again
      await new Promise(r => setTimeout(r, 250));
      
      // Third failure should move to dead letter
      claimedTask = await queue.claimTask('test-agent');
      await queue.failTask(claimedTask!.id, 'Third failure');
      
      updatedTask = await queue.getTask(task.id);
      expect(updatedTask!.status).toBe('dead');

      // Check dead letter queue
      const deadLetter = await queue.getDeadLetterEntries();
      expect(deadLetter).toHaveLength(1);
      expect(deadLetter[0].task.id).toBe(task.id);
    });

    it('should handle task cancellation', async () => {
      await queue.registerAgent({ id: 'test-agent', capacity: 1 });
      await queue.agentHeartbeat('test-agent');

      const task = await queue.enqueue({ type: 'cancellable-task', payload: {} });
      
      // Claim task
      await queue.claimTask('test-agent');
      
      // Cancel it
      await queue.cancelTask(task.id, 'User requested cancellation');

      const updatedTask = await queue.getTask(task.id);
      expect(updatedTask!.status).toBe('cancelled');

      // Should not be able to claim again
      const claimedAgain = await queue.claimTask('test-agent');
      expect(claimedAgain).toBeNull();
    });

    it('should respect task priorities', async () => {
      await queue.registerAgent({ id: 'test-agent', capacity: 1 });
      await queue.agentHeartbeat('test-agent');

      // Enqueue tasks in reverse priority order
      const lowTask = await queue.enqueue({ 
        type: 'low-task', 
        payload: {}, 
        priority: 'low' 
      });
      const mediumTask = await queue.enqueue({ 
        type: 'medium-task', 
        payload: {}, 
        priority: 'medium' 
      });
      const criticalTask = await queue.enqueue({ 
        type: 'critical-task', 
        payload: {}, 
        priority: 'critical' 
      });

      // First claim should get critical
      let claimed = await queue.claimTask('test-agent');
      expect(claimed!.id).toBe(criticalTask.id);
      await queue.completeTask(claimed!.id);

      // Update heartbeat to stay online
      await queue.agentHeartbeat('test-agent');

      // Second claim should get medium
      claimed = await queue.claimTask('test-agent');
      expect(claimed!.id).toBe(mediumTask.id);
      await queue.completeTask(claimed!.id);

      await queue.agentHeartbeat('test-agent');

      // Third claim should get low
      claimed = await queue.claimTask('test-agent');
      expect(claimed!.id).toBe(lowTask.id);
    });

    it('should route tasks by skills', async () => {
      // Register agents with different skills
      await queue.registerAgent({
        id: 'typescript-agent',
        skills: ['typescript', 'node'],
        capacity: 1,
      });
      await queue.registerAgent({
        id: 'python-agent',
        skills: ['python', 'ml'],
        capacity: 1,
      });
      
      await queue.agentHeartbeat('typescript-agent');
      await queue.agentHeartbeat('python-agent');

      // Enqueue tasks with skill requirements
      const tsTask = await queue.enqueue({
        type: 'ts-task',
        payload: {},
        requiredSkills: ['typescript'],
        routingHint: 'skill-based',
      });

      const pyTask = await queue.enqueue({
        type: 'py-task',
        payload: {},
        requiredSkills: ['python'],
        routingHint: 'skill-based',
      });

      // TS task should go to typescript agent
      let claimed = await queue.claimTask();
      expect(claimed!.assigneeId).toBe('typescript-agent');
      await queue.completeTask(claimed!.id);

      // Python task should go to python agent
      claimed = await queue.claimTask();
      expect(claimed!.assigneeId).toBe('python-agent');
    });

    it('should support sticky routing', async () => {
      await queue.registerAgent({
        id: 'agent-1',
        capacity: 2,
      });
      await queue.registerAgent({
        id: 'agent-2',
        capacity: 2,
      });

      await queue.agentHeartbeat('agent-1');
      await queue.agentHeartbeat('agent-2');

      // Enqueue tasks with same sticky key
      const task1 = await queue.enqueue({
        type: 'user-task',
        payload: {},
        stickyKey: 'user-123',
      });

      const task2 = await queue.enqueue({
        type: 'user-task',
        payload: {},
        stickyKey: 'user-123',
      });

      // Both tasks should go to the same agent
      const claimed1 = await queue.claimTask();
      const claimed2 = await queue.claimTask();

      expect(claimed1!.assigneeId).toBe(claimed2!.assigneeId);
    });
  });

  describe('Queue Metrics', () => {
    it('should track queue depth', async () => {
      // Enqueue multiple tasks
      await queue.enqueue({ type: 'task-1', payload: {} });
      await queue.enqueue({ type: 'task-2', payload: {} });
      await queue.enqueue({ type: 'task-3', payload: {} });

      const depth = await queue.getQueueDepth();
      expect(depth).toBe(3);

      // Check metrics
      const metrics = await queue.getMetrics();
      expect(metrics.pendingCount).toBe(3);
    });

    it('should track processing times', async () => {
      await queue.registerAgent({ id: 'test-agent', capacity: 1 });
      await queue.agentHeartbeat('test-agent');

      const task = await queue.enqueue({ type: 'timed-task', payload: {} });
      
      const claimed = await queue.claimTask('test-agent');
      await queue.startTask(task.id);
      
      // Simulate some processing time
      await new Promise(r => setTimeout(r, 100));
      
      await queue.completeTask(task.id);

      const metrics = await queue.getMetrics();
      expect(metrics.tasksCompleted).toBe(1);
      expect(metrics.avgProcessingTimeMs).toBeGreaterThanOrEqual(100);
    });
  });

  describe('Event Handling', () => {
    it('should emit events for task lifecycle', async () => {
      const events: string[] = [];

      queue.onEvent((event) => {
        events.push(event.type);
      });

      await queue.registerAgent({ id: 'test-agent', capacity: 1 });
      await queue.agentHeartbeat('test-agent');

      const task = await queue.enqueue({ type: 'event-task', payload: {} });
      
      const claimed = await queue.claimTask('test-agent');
      await queue.startTask(claimed!.id);
      await queue.completeTask(claimed!.id);

      // Should have received events
      expect(events).toContain('task.enqueued');
      expect(events).toContain('task.assigned');
      expect(events).toContain('task.started');
      expect(events).toContain('task.completed');
    });
  });

  describe('Dead Letter Queue', () => {
    it('should move exhausted retries to dead letter', async () => {
      await queue.registerAgent({ id: 'test-agent', capacity: 1 });
      await queue.agentHeartbeat('test-agent');

      const task = await queue.enqueue({
        type: 'failing-task',
        payload: {},
        maxRetries: 0, // No retries
      });

      const claimed = await queue.claimTask('test-agent');
      await queue.failTask(claimed!.id, 'Permanent failure');

      // Check dead letter
      const deadLetters = await queue.getDeadLetterEntries();
      expect(deadLetters).toHaveLength(1);
      expect(deadLetters[0].task.id).toBe(task.id);
      expect(deadLetters[0].reason).toBe('Permanent failure');
    });

    it('should support replaying dead letter tasks', async () => {
      await queue.registerAgent({ id: 'test-agent', capacity: 1 });
      await queue.agentHeartbeat('test-agent');

      const task = await queue.enqueue({
        type: 'retryable-task',
        payload: {},
        maxRetries: 0,
      });

      const claimed = await queue.claimTask('test-agent');
      await queue.failTask(claimed!.id, 'Failed');

      // Replay from dead letter
      await queue.replayDeadLetter(task.id);

      // Task should be available again
      const replayed = await queue.getTask(task.id);
      expect(replayed!.status).toBe('pending');
      expect(replayed!.retryCount).toBe(0);
    });
  });
});
