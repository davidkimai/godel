/**
 * Unit tests for DependencyResolver
 */

//@ts-nocheck
import { DependencyResolver } from '../dependency-resolver';
import { TaskWithDependencies } from '../types';

describe('DependencyResolver', () => {
  let resolver: DependencyResolver;

  beforeEach(() => {
    resolver = new DependencyResolver();
  });

  function createTask(
    id: string,
    dependencies: string[] = [],
    name: string = `Task ${id}`
  ): TaskWithDependencies {
    return {
      id,
      task: {
        id,
        name,
        description: `Description for ${name}`,
        requiredSkills: ['coding'],
        priority: 'medium',
      },
      dependencies,
    };
  }

  describe('buildGraph', () => {
    it('should build graph from tasks', () => {
      const tasks = [
        createTask('A'),
        createTask('B', ['A']),
        createTask('C', ['B']),
      ];

      resolver.buildGraph(tasks);

      expect(resolver.size).toBe(3);
      expect(resolver.hasTask('A')).toBe(true);
      expect(resolver.hasTask('B')).toBe(true);
      expect(resolver.hasTask('C')).toBe(true);
    });

    it('should establish dependencies correctly', () => {
      const tasks = [
        createTask('A'),
        createTask('B', ['A']),
        createTask('C', ['A', 'B']),
      ];

      resolver.buildGraph(tasks);

      expect(resolver.getDependencies('B')).toContain('A');
      expect(resolver.getDependencies('C')).toContain('A');
      expect(resolver.getDependencies('C')).toContain('B');
    });

    it('should throw on missing dependency', () => {
      const tasks = [createTask('A', ['B'])]; // B doesn't exist

      expect(() => resolver.buildGraph(tasks)).toThrow(
        "Task 'A' depends on 'B' which does not exist in the graph"
      );
    });

    it('should throw on circular dependency', () => {
      const tasks = [
        createTask('A', ['C']),
        createTask('B', ['A']),
        createTask('C', ['B']),
      ];

      expect(() => resolver.buildGraph(tasks)).toThrow(
        'Circular dependency detected'
      );
    });

    it('should clear existing graph before building', () => {
      resolver.buildGraph([createTask('A'), createTask('B', ['A'])]);
      resolver.buildGraph([createTask('C'), createTask('D')]);

      expect(resolver.size).toBe(2);
      expect(resolver.hasTask('A')).toBe(false);
      expect(resolver.hasTask('C')).toBe(true);
    });
  });

  describe('addTask', () => {
    beforeEach(() => {
      resolver.buildGraph([createTask('A')]);
    });

    it('should add task to existing graph', () => {
      resolver.addTask(createTask('B', ['A']));

      expect(resolver.size).toBe(2);
      expect(resolver.getDependencies('B')).toContain('A');
    });

    it('should throw on duplicate task', () => {
      expect(() => resolver.addTask(createTask('A'))).toThrow(
        "Task 'A' already exists in the graph"
      );
    });

    it('should throw on missing dependency', () => {
      expect(() => resolver.addTask(createTask('B', ['C']))).toThrow(
        "Cannot add task 'B': dependency 'C' does not exist"
      );
    });
  });

  describe('removeTask', () => {
    beforeEach(() => {
      resolver.buildGraph([
        createTask('A'),
        createTask('B', ['A']),
        createTask('C', ['B']),
      ]);
    });

    it('should remove task and update dependencies', () => {
      const removed = resolver.removeTask('B');

      expect(removed).toBe(true);
      expect(resolver.hasTask('B')).toBe(false);
      // C should now have no dependencies (B was removed)
      expect(resolver.getDependencies('C')).toEqual([]);
    });

    it('should return false for non-existent task', () => {
      const removed = resolver.removeTask('non-existent');
      expect(removed).toBe(false);
    });
  });

  describe('getExecutionPlan', () => {
    it('should return empty plan for empty graph', () => {
      const plan = resolver.getExecutionPlan();

      expect(plan.totalTasks).toBe(0);
      expect(plan.levels).toHaveLength(0);
    });

    it('should create correct execution levels', () => {
      // A
      // B, C (depend on A)
      // D (depends on B and C)
      const tasks = [
        createTask('A'),
        createTask('B', ['A']),
        createTask('C', ['A']),
        createTask('D', ['B', 'C']),
      ];

      resolver.buildGraph(tasks);
      const plan = resolver.getExecutionPlan();

      expect(plan.totalTasks).toBe(4);
      expect(plan.levels).toHaveLength(3);
      
      // Level 0: A
      expect(plan.levels[0].level).toBe(0);
      expect(plan.levels[0].tasks.map((t) => t.id)).toContain('A');
      
      // Level 1: B, C
      expect(plan.levels[1].level).toBe(1);
      expect(plan.levels[1].tasks.map((t) => t.id)).toContain('B');
      expect(plan.levels[1].tasks.map((t) => t.id)).toContain('C');
      
      // Level 2: D
      expect(plan.levels[2].level).toBe(2);
      expect(plan.levels[2].tasks.map((t) => t.id)).toContain('D');
    });

    it('should calculate estimated parallelism', () => {
      const tasks = [
        createTask('A'),
        createTask('B', ['A']),
        createTask('C', ['A']),
        createTask('D', ['A']),
        createTask('E', ['B', 'C', 'D']),
      ];

      resolver.buildGraph(tasks);
      const plan = resolver.getExecutionPlan();

      expect(plan.estimatedParallelism).toBe(3); // Level 1 has B, C, D
    });

    it('should identify critical path', () => {
      const tasks = [
        createTask('A'),
        createTask('B', ['A']),
        createTask('C', ['A']),
        createTask('D', ['B', 'C']),
      ];

      resolver.buildGraph(tasks);
      const plan = resolver.getExecutionPlan();

      expect(plan.criticalPath.length).toBeGreaterThan(0);
      expect(plan.criticalPath[0]).toBe('A');
      expect(plan.criticalPath[plan.criticalPath.length - 1]).toBe('D');
    });
  });

  describe('resolve', () => {
    it('should return valid result for valid graph', () => {
      const tasks = [
        createTask('A'),
        createTask('B', ['A']),
        createTask('C', ['B']),
      ];

      const result = resolver.resolve(tasks);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.plan.totalTasks).toBe(3);
    });

    it('should return invalid result for cyclic graph', () => {
      const tasks = [
        createTask('A', ['C']),
        createTask('B', ['A']),
        createTask('C', ['B']),
      ];

      const result = resolver.resolve(tasks);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Circular dependency');
    });

    it('should respect maxLevels option', () => {
      const tasks = [
        createTask('A'),
        createTask('B', ['A']),
        createTask('C', ['B']),
      ];

      const result = resolver.resolve(tasks, { maxLevels: 2 });

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('levels');
    });
  });

  describe('query methods', () => {
    beforeEach(() => {
      resolver.buildGraph([
        createTask('A'),
        createTask('B', ['A']),
        createTask('C', ['A', 'B']),
      ]);
    });

    it('should get all dependencies', () => {
      const deps = resolver.getAllDependencies('C');
      expect(deps).toContain('A');
      expect(deps).toContain('B');
    });

    it('should get all dependents', () => {
      const dependents = resolver.getAllDependents('A');
      expect(dependents).toContain('B');
      expect(dependents).toContain('C');
    });

    it('should check dependency relationship', () => {
      expect(resolver.dependsOn('C', 'A')).toBe(true);
      expect(resolver.dependsOn('C', 'B')).toBe(true);
      expect(resolver.dependsOn('A', 'C')).toBe(false);
    });

    it('should get root tasks', () => {
      const roots = resolver.getRootTasks();
      expect(roots).toHaveLength(1);
      expect(roots[0].id).toBe('A');
    });

    it('should get leaf tasks', () => {
      const leaves = resolver.getLeafTasks();
      expect(leaves).toHaveLength(1);
      expect(leaves[0].id).toBe('C');
    });

    it('should get parallel tasks', () => {
      // Create a graph with parallel tasks
      resolver.buildGraph([
        createTask('A'),
        createTask('B', ['A']),
        createTask('C', ['A']),
        createTask('D', ['B', 'C']),
      ]);
      
      const parallelToB = resolver.getParallelTasks('B');
      expect(parallelToB.map((t) => t.id)).toContain('C');
    });
  });

  describe('clone', () => {
    it('should create independent copy', () => {
      resolver.buildGraph([createTask('A'), createTask('B', ['A'])]);

      const clone = resolver.clone();

      expect(clone.size).toBe(2);
      clone.addTask(createTask('C', ['B']));
      expect(clone.size).toBe(3);
      expect(resolver.size).toBe(2);
    });
  });

  describe('visualization', () => {
    it('should provide visualization data', () => {
      resolver.buildGraph([
        createTask('A'),
        createTask('B', ['A']),
        createTask('C', ['A', 'B']),
      ]);

      const viz = resolver.getVisualizationData();

      expect(viz.nodes).toHaveLength(3);
      expect(viz.edges).toHaveLength(3); // A->B, A->C, B->C
      expect(viz.levels).toHaveLength(3);
    });
  });

  describe('clear', () => {
    it('should clear all tasks', () => {
      resolver.buildGraph([createTask('A'), createTask('B', ['A'])]);

      resolver.clear();

      expect(resolver.size).toBe(0);
      expect(resolver.hasTask('A')).toBe(false);
    });
  });
});
