/**
 * Task Storage Tests
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { TaskStorage, TaskNotFoundError, TaskListNotFoundError } from '../../src/tasks/storage';
import { createTask, createTaskList, TaskStatus, TaskListStatus } from '../../src/tasks/types';

describe('TaskStorage', () => {
  let storage: TaskStorage;
  let basePath: string;

  beforeEach(async () => {
    basePath = join(tmpdir(), `godel-tasks-test-${Date.now()}`);
    storage = new TaskStorage(basePath);
    await storage.init();
  });

  afterEach(async () => {
    try {
      await fs.rm(basePath, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('init', () => {
    it('should create directory structure', async () => {
      const stats = await fs.stat(basePath);
      expect(stats.isDirectory()).toBe(true);

      const listsStats = await fs.stat(join(basePath, 'lists'));
      expect(listsStats.isDirectory()).toBe(true);

      const lockStats = await fs.stat(join(basePath, '.lock'));
      expect(lockStats.isDirectory()).toBe(true);
    });
  });

  describe('task CRUD', () => {
    it('should save and retrieve task', async () => {
      const task = createTask({ title: 'Test task' });

      await storage.saveTask(task);
      const retrieved = await storage.getTask(task.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(task.id);
      expect(retrieved!.title).toBe(task.title);
      expect(retrieved!.status).toBe(task.status);
    });

    it('should return null for non-existent task', async () => {
      const retrieved = await storage.getTask('non-existent');
      expect(retrieved).toBeNull();
    });

    it('should delete task', async () => {
      const task = createTask({ title: 'To delete' });

      await storage.saveTask(task);
      await storage.deleteTask(task.id);

      const retrieved = await storage.getTask(task.id);
      expect(retrieved).toBeNull();
    });

    it('should list all tasks', async () => {
      const task1 = createTask({ title: 'Task 1' });
      const task2 = createTask({ title: 'Task 2' });

      await storage.saveTask(task1);
      await storage.saveTask(task2);

      const tasks = await storage.listTasks();
      expect(tasks).toHaveLength(2);
      expect(tasks.map(t => t.id)).toContain(task1.id);
      expect(tasks.map(t => t.id)).toContain(task2.id);
    });

    it('should check task existence', async () => {
      const task = createTask({ title: 'Test' });

      expect(await storage.taskExists(task.id)).toBe(false);
      await storage.saveTask(task);
      expect(await storage.taskExists(task.id)).toBe(true);
    });
  });

  describe('task list CRUD', () => {
    it('should save and retrieve task list', async () => {
      const list = createTaskList({ name: 'Sprint 1' });

      await storage.saveTaskList(list);
      const retrieved = await storage.getTaskList(list.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(list.id);
      expect(retrieved!.name).toBe(list.name);
    });

    it('should return null for non-existent list', async () => {
      const retrieved = await storage.getTaskList('non-existent');
      expect(retrieved).toBeNull();
    });

    it('should delete task list', async () => {
      const list = createTaskList({ name: 'To delete' });

      await storage.saveTaskList(list);
      await storage.deleteTaskList(list.id);

      const retrieved = await storage.getTaskList(list.id);
      expect(retrieved).toBeNull();
    });

    it('should list all task lists', async () => {
      const list1 = createTaskList({ name: 'List 1' });
      const list2 = createTaskList({ name: 'List 2' });

      await storage.saveTaskList(list1);
      await storage.saveTaskList(list2);

      const lists = await storage.listTaskLists();
      // Includes default list + 2 created = 3 total
      expect(lists).toHaveLength(3);
      expect(lists.map(l => l.id)).toContain('list-1');
      expect(lists.map(l => l.id)).toContain('list-2');
    });
  });

  describe('index management', () => {
    it('should update and retrieve index', async () => {
      const list = createTaskList({ name: 'Test List' });

      await storage.saveTaskList(list);
      await storage.updateIndex(list);

      const index = await storage.getIndex();
      expect(index.lists).toContain(list.id);
    });

    it('should return index with default list', async () => {
      const index = await storage.getIndex();
      expect(index.lists).toContain('default');
    });
  });

  describe('task movement', () => {
    it('should move task between lists', async () => {
      const list1 = createTaskList({ id: 'list-1', name: 'List 1' });
      const list2 = createTaskList({ id: 'list-2', name: 'List 2' });
      const task = createTask({ id: 'task-1', title: 'Test' });

      await storage.saveTaskList(list1);
      await storage.saveTaskList(list2);
      await storage.saveTask(task, 'list-1');

      await storage.moveTask('task-1', 'list-1', 'list-2');

      // Task should be in new location
      const path = storage.getTaskPath('task-1', 'list-2');
      const content = await fs.readFile(path, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.id).toBe('task-1');
    });
  });

  describe('locking', () => {
    it('should acquire and release lock', async () => {
      const lock = await storage.acquireLock('test-resource');
      expect(lock.id).toBe('test-resource');
      expect(lock.acquiredAt).toBeDefined();

      await storage.releaseLock(lock);

      // Should be able to acquire again after release
      const lock2 = await storage.acquireLock('test-resource');
      expect(lock2.id).toBe('test-resource');
      expect(lock2.acquiredAt).toBeDefined();
      await storage.releaseLock(lock2);
    });

    it('should check if resource is locked', async () => {
      expect(await storage.isLocked('resource')).toBe(false);

      const lock = await storage.acquireLock('resource');
      expect(await storage.isLocked('resource')).toBe(true);

      await storage.releaseLock(lock);
      expect(await storage.isLocked('resource')).toBe(false);
    });
  });

  describe('clear', () => {
    it('should clear all data except default list', async () => {
      const task = createTask({ title: 'Test' });
      const list = createTaskList({ name: 'Test' });

      await storage.saveTask(task);
      await storage.saveTaskList(list);

      await storage.clear();

      expect(await storage.listTasks()).toHaveLength(0);
      // Default list is recreated after clear
      const lists = await storage.listTaskLists();
      expect(lists.length).toBeGreaterThanOrEqual(1);
    });
  });
});
