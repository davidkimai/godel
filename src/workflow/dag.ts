/**
 * DAG Utilities - Topological sort and cycle detection
 * 
 * Provides algorithms for dependency resolution in workflow DAGs,
 * including topological sort and cycle detection.
 */

import { Workflow, WorkflowStep, TopologicalSortResult } from './types';

// ============================================================================
// Topological Sort
// ============================================================================

/**
 * Perform topological sort on workflow steps.
 * Returns layers of steps that can be executed in parallel.
 * Each inner array represents a layer where all steps can run concurrently.
 */
export function topologicalSort(workflow: Workflow): TopologicalSortResult {
  const steps = new Map(workflow.steps.map(s => [s.id, s]));
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, Set<string>>();

  // Initialize
  for (const step of workflow.steps) {
    inDegree.set(step.id, step.dependsOn.length);
    dependents.set(step.id, new Set());
  }

  // Build reverse dependency graph (dependents)
  for (const step of workflow.steps) {
    for (const dep of step.dependsOn) {
      if (dependents.has(dep)) {
        dependents.get(dep)!.add(step.id);
      }
    }
  }

  // Check for missing dependencies
  for (const step of workflow.steps) {
    for (const dep of step.dependsOn) {
      if (!steps.has(dep)) {
        return {
          ordered: [],
          hasCycle: true,
          cycle: [dep],
        };
      }
    }
  }

  // Kahn's algorithm
  const result: string[][] = [];
  let currentLayer: string[] = [];

  // Find all steps with no dependencies
  for (const [stepId, degree] of inDegree) {
    if (degree === 0) {
      currentLayer.push(stepId);
    }
  }

  while (currentLayer.length > 0) {
    result.push(currentLayer);
    const nextLayer: string[] = [];

    for (const stepId of currentLayer) {
      const stepDependents = dependents.get(stepId);
      if (stepDependents) {
        for (const dependent of stepDependents) {
          const newDegree = (inDegree.get(dependent) || 0) - 1;
          inDegree.set(dependent, newDegree);
          if (newDegree === 0) {
            nextLayer.push(dependent);
          }
        }
      }
    }

    currentLayer = nextLayer;
  }

  // Check if all steps were processed
  const processedSteps = result.flat().length;
  if (processedSteps !== workflow.steps.length) {
    // There's a cycle - find it for error reporting
    const cycle = findCycle(workflow);
    return {
      ordered: [],
      hasCycle: true,
      cycle,
    };
  }

  return {
    ordered: result,
    hasCycle: false,
  };
}

/**
 * Find a cycle in the workflow graph if one exists.
 */
export function findCycle(workflow: Workflow): string[] | undefined {
  const steps = new Map(workflow.steps.map(s => [s.id, s]));
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function dfs(stepId: string, path: string[]): string[] | undefined {
    if (recursionStack.has(stepId)) {
      const cycleStart = path.indexOf(stepId);
      return path.slice(cycleStart).concat(stepId);
    }

    if (visited.has(stepId)) {
      return undefined;
    }

    visited.add(stepId);
    recursionStack.add(stepId);
    path.push(stepId);

    const step = steps.get(stepId);
    if (step) {
      // Check both next and dependencies for cycles
      const connections = [...step.next, ...step.dependsOn];
      for (const nextId of connections) {
        const cycle = dfs(nextId, path);
        if (cycle) return cycle;
      }
    }

    path.pop();
    recursionStack.delete(stepId);
    return undefined;
  }

  for (const step of workflow.steps) {
    const cycle = dfs(step.id, []);
    if (cycle) return cycle;
  }

  return undefined;
}

/**
 * Get all dependencies (direct and transitive) for a step.
 */
export function getAllDependencies(workflow: Workflow, stepId: string): Set<string> {
  const steps = new Map(workflow.steps.map(s => [s.id, s]));
  const dependencies = new Set<string>();

  function dfs(currentId: string): void {
    const step = steps.get(currentId);
    if (!step) return;

    for (const dep of step.dependsOn) {
      if (!dependencies.has(dep)) {
        dependencies.add(dep);
        dfs(dep);
      }
    }
  }

  dfs(stepId);
  return dependencies;
}

/**
 * Get all dependents (steps that depend on this step, directly or transitively).
 */
export function getAllDependents(workflow: Workflow, stepId: string): Set<string> {
  const steps = new Map(workflow.steps.map(s => [s.id, s]));
  const dependents = new Set<string>();

  // Build reverse graph
  const reverseDeps = new Map<string, Set<string>>();
  for (const step of workflow.steps) {
    reverseDeps.set(step.id, new Set());
  }
  for (const step of workflow.steps) {
    for (const dep of step.dependsOn) {
      if (reverseDeps.has(dep)) {
        reverseDeps.get(dep)!.add(step.id);
      }
    }
  }

  function dfs(currentId: string): void {
    const deps = reverseDeps.get(currentId);
    if (!deps) return;

    for (const dependent of deps) {
      if (!dependents.has(dependent)) {
        dependents.add(dependent);
        dfs(dependent);
      }
    }
  }

  dfs(stepId);
  return dependents;
}

/**
 * Get the execution order for a specific step (all steps that must complete before it).
 */
export function getExecutionOrder(workflow: Workflow, stepId: string): string[] {
  const deps = getAllDependencies(workflow, stepId);
  
  // Sort dependencies topologically
  const subWorkflow: Workflow = {
    ...workflow,
    steps: workflow.steps.filter(s => deps.has(s.id) || s.id === stepId),
  };

  const sortResult = topologicalSort(subWorkflow);
  if (sortResult.hasCycle) {
    return [];
  }

  return sortResult.ordered.flat();
}

/**
 * Check if step A depends on step B (directly or transitively).
 */
export function dependsOn(workflow: Workflow, stepA: string, stepB: string): boolean {
  const deps = getAllDependencies(workflow, stepA);
  return deps.has(stepB);
}

/**
 * Get steps that can be executed in parallel with the given step.
 * These are steps that have the same dependency set.
 */
export function getParallelSteps(workflow: Workflow, stepId: string): string[] {
  const step = workflow.steps.find(s => s.id === stepId);
  if (!step) return [];

  const stepDeps = new Set(step.dependsOn);
  
  return workflow.steps
    .filter(s => {
      if (s.id === stepId) return false;
      const deps = new Set(s.dependsOn);
      if (deps.size !== stepDeps.size) return false;
      return [...deps].every(d => stepDeps.has(d));
    })
    .map(s => s.id);
}

/**
 * Build a dependency graph representation for visualization.
 */
export interface DependencyGraph {
  nodes: Array<{
    id: string;
    name: string;
    status?: string;
    layer: number;
  }>;
  edges: Array<{
    from: string;
    to: string;
    type: 'dependency' | 'next';
  }>;
  layers: string[][];
}

export function buildDependencyGraph(workflow: Workflow): DependencyGraph {
  const sortResult = topologicalSort(workflow);
  const nodes: DependencyGraph['nodes'] = [];
  const edges: DependencyGraph['edges'] = [];

  // Build nodes with layer info
  for (let layerIndex = 0; layerIndex < sortResult.ordered.length; layerIndex++) {
    const layer = sortResult.ordered[layerIndex];
    for (const stepId of layer) {
      const step = workflow.steps.find(s => s.id === stepId);
      if (step) {
        nodes.push({
          id: stepId,
          name: step.name,
          layer: layerIndex,
        });
      }
    }
  }

  // Build edges
  for (const step of workflow.steps) {
    // Dependency edges
    for (const dep of step.dependsOn) {
      edges.push({
        from: dep,
        to: step.id,
        type: 'dependency',
      });
    }
    // Next edges
    for (const next of step.next) {
      edges.push({
        from: step.id,
        to: next,
        type: 'next',
      });
    }
  }

  return {
    nodes,
    edges,
    layers: sortResult.ordered,
  };
}

/**
 * Get the critical path (longest path from entry to exit).
 * This helps identify which steps are on the critical path for optimization.
 */
export function getCriticalPath(workflow: Workflow): string[] {
  const sortResult = topologicalSort(workflow);
  if (sortResult.hasCycle) {
    return [];
  }

  // Assign weight 1 to each step (can be customized with actual durations)
  const stepWeights = new Map<string, number>();
  for (const step of workflow.steps) {
    stepWeights.set(step.id, step.parallel ? 0.5 : 1); // Parallel steps count less
  }

  // Calculate longest path using dynamic programming
  const longestPath = new Map<string, { length: number; path: string[] }>();
  
  for (const layer of sortResult.ordered) {
    for (const stepId of layer) {
      const deps = workflow.steps.find(s => s.id === stepId)?.dependsOn || [];
      
      if (deps.length === 0) {
        longestPath.set(stepId, { 
          length: stepWeights.get(stepId) || 1, 
          path: [stepId] 
        });
      } else {
        // Find the longest path through dependencies
        let bestDep = deps[0];
        let bestLength = longestPath.get(bestDep)?.length || 0;
        
        for (const dep of deps.slice(1)) {
          const depLength = longestPath.get(dep)?.length || 0;
          if (depLength > bestLength) {
            bestLength = depLength;
            bestDep = dep;
          }
        }

        const depPath = longestPath.get(bestDep)?.path || [];
        longestPath.set(stepId, {
          length: bestLength + (stepWeights.get(stepId) || 1),
          path: [...depPath, stepId],
        });
      }
    }
  }

  // Find the longest overall path
  let bestPath: string[] = [];
  let bestLength = 0;
  
  for (const { length, path } of longestPath.values()) {
    if (length > bestLength) {
      bestLength = length;
      bestPath = path;
    }
  }

  return bestPath;
}
