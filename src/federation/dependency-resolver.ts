/**
 * Dependency Resolver - Builds execution plans from task dependencies
 * 
 * Uses a DAG to model task dependencies and generates optimal
 * execution plans for parallel execution.
 */

import { DAG, validateDAG } from './dag';
import {
  TaskWithDependencies,
  ExecutionPlan,
  ExecutionLevel,
  ResolutionResult,
  ResolutionOptions,
  DefaultResolutionOptions,
} from './types';

/**
 * Resolves dependencies between tasks and builds execution plans
 */
export class DependencyResolver {
  private dag: DAG<TaskWithDependencies> = new DAG();

  /**
   * Build the dependency graph from a list of tasks
   * @param tasks - Tasks with their dependencies
   * @throws Error if a cycle is detected
   */
  buildGraph(tasks: TaskWithDependencies[]): void {
    this.dag.clear();

    // Add all nodes first
    for (const task of tasks) {
      this.dag.addNode(task.id, task);
    }

    // Add edges based on dependencies
    for (const task of tasks) {
      for (const depId of task.dependencies) {
        if (!this.dag.hasNode(depId)) {
          throw new Error(
            `Task '${task.id}' depends on '${depId}' which does not exist in the graph`
          );
        }
        // depId must complete before task.id, so add edge from depId to task.id
        this.dag.addEdge(depId, task.id);
      }
    }

    // Validate no cycles
    const cycle = this.dag.detectCycle();
    if (cycle) {
      throw new Error(`Circular dependency detected: ${cycle.join(' -> ')}`);
    }
  }

  /**
   * Add a single task to the graph
   * @param task - Task to add
   * @param dependencies - Dependencies (must already exist in graph)
   */
  addTask(task: TaskWithDependencies): void {
    if (this.dag.hasNode(task.id)) {
      throw new Error(`Task '${task.id}' already exists in the graph`);
    }

    this.dag.addNode(task.id, task);

    for (const depId of task.dependencies) {
      if (!this.dag.hasNode(depId)) {
        throw new Error(
          `Cannot add task '${task.id}': dependency '${depId}' does not exist`
        );
      }
      this.dag.addEdge(depId, task.id);
    }

    // Check for cycles after adding
    const cycle = this.dag.detectCycle();
    if (cycle) {
      // Rollback by removing the task we just added
      this.dag.removeNode(task.id);
      throw new Error(
        `Adding task '${task.id}' would create a cycle: ${cycle.join(' -> ')}`
      );
    }
  }

  /**
   * Remove a task from the graph
   * @param taskId - ID of task to remove
   * @returns true if removed, false if not found
   */
  removeTask(taskId: string): boolean {
    return this.dag.removeNode(taskId);
  }

  /**
   * Get a task by ID
   * @param taskId - Task ID
   */
  getTask(taskId: string): TaskWithDependencies | undefined {
    return this.dag.getNode(taskId);
  }

  /**
   * Get all tasks in the graph
   */
  getAllTasks(): TaskWithDependencies[] {
    return Array.from(this.dag.getAllNodes().values());
  }

  /**
   * Check if a task exists in the graph
   * @param taskId - Task ID
   */
  hasTask(taskId: string): boolean {
    return this.dag.hasNode(taskId);
  }

  /**
   * Get the direct dependencies of a task
   * @param taskId - Task ID
   */
  getDependencies(taskId: string): string[] {
    return this.dag.getDependencies(taskId);
  }

  /**
   * Get the direct dependents of a task (tasks that depend on it)
   * @param taskId - Task ID
   */
  getDependents(taskId: string): string[] {
    return this.dag.getDependents(taskId);
  }

  /**
   * Get all transitive dependencies of a task
   * @param taskId - Task ID
   */
  getAllDependencies(taskId: string): string[] {
    return this.dag.getAllDependencies(taskId);
  }

  /**
   * Get all transitive dependents of a task
   * @param taskId - Task ID
   */
  getAllDependents(taskId: string): string[] {
    return this.dag.getAllDependents(taskId);
  }

  /**
   * Check if taskA depends on taskB (directly or transitively)
   * @param taskA - Potential dependent
   * @param taskB - Potential dependency
   */
  dependsOn(taskA: string, taskB: string): boolean {
    return this.dag.dependsOn(taskA, taskB);
  }

  /**
   * Get the number of tasks in the graph
   */
  get size(): number {
    return this.dag.size;
  }

  /**
   * Generate an execution plan from the current graph
   * Groups tasks into levels where each level can be executed in parallel
   */
  getExecutionPlan(): ExecutionPlan {
    if (this.dag.size === 0) {
      return {
        levels: [],
        totalTasks: 0,
        estimatedParallelism: 0,
        criticalPath: [],
      };
    }

    const levels = this.dag.getExecutionLevels();
    const taskLevels: ExecutionLevel[] = levels.map((level, index) => ({
      level: index,
      tasks: level.map((id) => this.dag.getNode(id)!),
      parallel: true,
    }));

    const maxParallelTasks = levels.length > 0 
      ? Math.max(...levels.map((l) => l.length))
      : 0;

    return {
      levels: taskLevels,
      totalTasks: this.dag.size,
      estimatedParallelism: maxParallelTasks,
      criticalPath: this.dag.getCriticalPath(),
    };
  }

  /**
   * Resolve dependencies and return a complete resolution result
   * @param tasks - Tasks with dependencies
   * @param options - Resolution options
   */
  resolve(
    tasks: TaskWithDependencies[],
    options: Partial<ResolutionOptions> = {}
  ): ResolutionResult {
    const opts = { ...DefaultResolutionOptions, ...options };
    const errors: string[] = [];

    try {
      this.buildGraph(tasks);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        plan: {
          levels: [],
          totalTasks: 0,
          estimatedParallelism: 0,
          criticalPath: [],
        },
        valid: false,
        errors: [message],
      };
    }

    if (opts.validate) {
      const validation = validateDAG(this.dag);
      if (!validation.valid) {
        errors.push(...validation.errors);
      }
    }

    const plan = this.getExecutionPlan();

    if (plan.levels.length > opts.maxLevels) {
      errors.push(
        `Execution plan has ${plan.levels.length} levels, exceeding maximum of ${opts.maxLevels}`
      );
    }

    return {
      plan,
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Detect cycles in the current graph
   * @returns Array of task IDs forming a cycle, or null if no cycle
   */
  detectCycle(): string[] | null {
    return this.dag.detectCycle();
  }

  /**
   * Check if the current graph has a cycle
   */
  hasCycle(): boolean {
    return this.dag.hasCycle();
  }

  /**
   * Get the critical path through the tasks
   * This is the longest path from any root to any leaf
   */
  getCriticalPath(): string[] {
    return this.dag.getCriticalPath();
  }

  /**
   * Get root tasks (tasks with no dependencies)
   */
  getRootTasks(): TaskWithDependencies[] {
    const rootIds = this.dag.getRoots();
    return rootIds.map((id) => this.dag.getNode(id)!).filter(Boolean);
  }

  /**
   * Get leaf tasks (tasks with no dependents)
   */
  getLeafTasks(): TaskWithDependencies[] {
    const leafIds = this.dag.getLeaves();
    return leafIds.map((id) => this.dag.getNode(id)!).filter(Boolean);
  }

  /**
   * Get tasks that can run in parallel with a given task
   * (tasks at the same level with the same dependencies)
   * @param taskId - Task ID
   */
  getParallelTasks(taskId: string): TaskWithDependencies[] {
    const executionLevels = this.dag.getExecutionLevels();
    
    for (const level of executionLevels) {
      if (level.includes(taskId)) {
        return level
          .filter((id) => id !== taskId)
          .map((id) => this.dag.getNode(id)!)
          .filter(Boolean);
      }
    }
    
    return [];
  }

  /**
   * Get the execution order for a specific task
   * Returns all tasks that must complete before this task can start
   * @param taskId - Task ID
   */
  getExecutionOrder(taskId: string): TaskWithDependencies[] {
    const deps = this.getAllDependencies(taskId);
    return deps.map((id) => this.dag.getNode(id)!).filter(Boolean);
  }

  /**
   * Clear all tasks from the resolver
   */
  clear(): void {
    this.dag.clear();
  }

  /**
   * Create a clone of this resolver with the same graph
   */
  clone(): DependencyResolver {
    const newResolver = new DependencyResolver();
    newResolver.dag = this.dag.clone();
    return newResolver;
  }

  /**
   * Validate the current graph
   */
  validate(): { valid: boolean; errors: string[] } {
    return validateDAG(this.dag);
  }

  /**
   * Get a visualization-friendly representation of the dependency graph
   */
  getVisualizationData(): {
    nodes: Array<{ id: string; name: string; level: number }>;
    edges: Array<{ from: string; to: string }>;
    levels: string[][];
  } {
    const plan = this.getExecutionPlan();
    const nodes: Array<{ id: string; name: string; level: number }> = [];
    const edges: Array<{ from: string; to: string }> = [];

    // Build nodes with level info
    for (const level of plan.levels) {
      for (const task of level.tasks) {
        nodes.push({
          id: task.id,
          name: task.task.name,
          level: level.level,
        });
      }
    }

    // Build edges
    for (const task of this.getAllTasks()) {
      for (const depId of task.dependencies) {
        edges.push({
          from: depId,
          to: task.id,
        });
      }
    }

    return {
      nodes,
      edges,
      levels: plan.levels.map((l) => l.tasks.map((t) => t.id)),
    };
  }
}
