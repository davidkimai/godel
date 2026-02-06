/**
 * Task Types Tests
 */

import {
  TaskStatus,
  TaskPriority,
  TaskType,
  TaskListStatus,
  generateTaskId,
  generateTaskListId,
  createTask,
  createTaskList,
} from '../../src/tasks/types';

describe('Task Types', () => {
  describe('generateTaskId', () => {
    it('should generate task ID in godel-xxxxx format', () => {
      const id = generateTaskId();
      expect(id).toMatch(/^godel-[a-z0-9]{5}$/);
    });

    it('should generate unique IDs', () => {
      const ids = new Set(Array.from({ length: 100 }, generateTaskId));
      expect(ids.size).toBe(100);
    });
  });

  describe('generateTaskListId', () => {
    it('should convert name to kebab-case ID', () => {
      expect(generateTaskListId('Sprint 1')).toBe('sprint-1');
      expect(generateTaskListId('My Task List')).toBe('my-task-list');
      expect(generateTaskListId('Auth Feature')).toBe('auth-feature');
    });

    it('should handle special characters', () => {
      expect(generateTaskListId('List & Stuff!')).toBe('list-stuff');
      expect(generateTaskListId('Test_List')).toBe('testlist');
    });

    it('should handle empty string', () => {
      expect(generateTaskListId('')).toBe('list');
    });
  });

  describe('createTask', () => {
    it('should create task with defaults', () => {
      const task = createTask({ title: 'Test task' });

      expect(task.id).toMatch(/^godel-[a-z0-9]{5}$/);
      expect(task.title).toBe('Test task');
      expect(task.status).toBe(TaskStatus.OPEN);
      expect(task.priority).toBe(TaskPriority.MEDIUM);
      expect(task.type).toBe(TaskType.TASK);
      expect(task.dependsOn).toEqual([]);
      expect(task.blocks).toEqual([]);
      expect(task.tags).toEqual([]);
      expect(task.commits).toEqual([]);
      expect(task.sessions).toEqual([]);
      expect(task.createdAt).toBeDefined();
      expect(task.updatedAt).toBeDefined();
    });

    it('should create task with all options', () => {
      const task = createTask({
        title: 'Fix bug',
        description: 'Critical authentication bug',
        type: TaskType.BUG,
        priority: TaskPriority.CRITICAL,
        dependsOn: ['godel-abc12'],
        assignee: 'worker-1',
      });

      expect(task.title).toBe('Fix bug');
      expect(task.description).toBe('Critical authentication bug');
      expect(task.type).toBe(TaskType.BUG);
      expect(task.priority).toBe(TaskPriority.CRITICAL);
      expect(task.dependsOn).toEqual(['godel-abc12']);
      expect(task.assignee).toBe('worker-1');
    });

    it('should use provided ID if given', () => {
      const task = createTask({
        id: 'custom-id',
        title: 'Test',
      });

      expect(task.id).toBe('custom-id');
    });
  });

  describe('createTaskList', () => {
    it('should create task list with defaults', () => {
      const list = createTaskList({ name: 'Sprint 1' });

      expect(list.id).toBe('sprint-1');
      expect(list.name).toBe('Sprint 1');
      expect(list.tasks).toEqual([]);
      expect(list.status).toBe(TaskListStatus.ACTIVE);
      expect(list.sessions).toEqual([]);
      expect(list.createdAt).toBeDefined();
      expect(list.updatedAt).toBeDefined();
    });

    it('should create task list with description', () => {
      const list = createTaskList({
        name: 'My List',
        description: 'A test list',
      });

      expect(list.description).toBe('A test list');
    });

    it('should use provided ID if given', () => {
      const list = createTaskList({
        id: 'custom-list',
        name: 'My List',
      });

      expect(list.id).toBe('custom-list');
    });
  });
});
