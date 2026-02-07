/**
 * DAG (Directed Acyclic Graph) - Generic graph implementation for dependency resolution
 * 
 * Provides core graph operations:
 * - Node and edge management
 * - Topological sorting
 * - Cycle detection
 * - Execution level computation for parallel execution
 */

export class DAG<T> {
  private nodes: Map<string, T> = new Map();
  private edges: Map<string, Set<string>> = new Map(); // node -> its dependencies (nodes it depends on)
  private reverseEdges: Map<string, Set<string>> = new Map(); // node -> nodes that depend on it

  /**
   * Add a node to the graph
   * @param id - Unique node identifier
   * @param data - Node data
   */
  addNode(id: string, data: T): void {
    if (this.nodes.has(id)) {
      throw new Error(`Node with id '${id}' already exists`);
    }
    this.nodes.set(id, data);
    this.edges.set(id, new Set());
    this.reverseEdges.set(id, new Set());
  }

  /**
   * Remove a node from the graph
   * @param id - Node identifier to remove
   */
  removeNode(id: string): boolean {
    if (!this.nodes.has(id)) {
      return false;
    }

    // Remove from all dependency sets
    const dependencies = this.edges.get(id);
    if (dependencies) {
      for (const dep of dependencies) {
        this.reverseEdges.get(dep)?.delete(id);
      }
    }

    // Remove from all dependent sets
    const dependents = this.reverseEdges.get(id);
    if (dependents) {
      for (const dependent of dependents) {
        this.edges.get(dependent)?.delete(id);
      }
    }

    this.nodes.delete(id);
    this.edges.delete(id);
    this.reverseEdges.delete(id);
    return true;
  }

  /**
   * Add an edge from 'from' to 'to' (meaning 'to' depends on 'from')
   * @param from - The dependency (must complete first)
   * @param to - The dependent (depends on 'from')
   */
  addEdge(from: string, to: string): void {
    if (!this.nodes.has(from)) {
      throw new Error(`Source node '${from}' does not exist`);
    }
    if (!this.nodes.has(to)) {
      throw new Error(`Target node '${to}' does not exist`);
    }

    this.edges.get(to)!.add(from);
    this.reverseEdges.get(from)!.add(to);
  }

  /**
   * Remove an edge from the graph
   * @param from - Source node
   * @param to - Target node
   */
  removeEdge(from: string, to: string): boolean {
    const removedFromEdges = this.edges.get(to)?.delete(from) ?? false;
    const removedFromReverse = this.reverseEdges.get(from)?.delete(to) ?? false;
    return removedFromEdges || removedFromReverse;
  }

  /**
   * Get node data by id
   * @param id - Node identifier
   */
  getNode(id: string): T | undefined {
    return this.nodes.get(id);
  }

  /**
   * Check if a node exists
   * @param id - Node identifier
   */
  hasNode(id: string): boolean {
    return this.nodes.has(id);
  }

  /**
   * Get all node ids in the graph
   */
  getNodeIds(): string[] {
    return Array.from(this.nodes.keys());
  }

  /**
   * Get all nodes with their data
   */
  getAllNodes(): Map<string, T> {
    return new Map(this.nodes);
  }

  /**
   * Get the number of nodes in the graph
   */
  get size(): number {
    return this.nodes.size;
  }

  /**
   * Get direct dependencies of a node (nodes it depends on)
   * @param id - Node identifier
   */
  getDependencies(id: string): string[] {
    if (!this.nodes.has(id)) {
      throw new Error(`Node '${id}' does not exist`);
    }
    return Array.from(this.edges.get(id) ?? []);
  }

  /**
   * Get direct dependents of a node (nodes that depend on it)
   * @param id - Node identifier
   */
  getDependents(id: string): string[] {
    if (!this.nodes.has(id)) {
      throw new Error(`Node '${id}' does not exist`);
    }
    return Array.from(this.reverseEdges.get(id) ?? []);
  }

  /**
   * Get all dependencies (direct and transitive) of a node
   * @param id - Node identifier
   */
  getAllDependencies(id: string): string[] {
    const visited = new Set<string>();
    const stack: string[] = [id];
    
    while (stack.length > 0) {
      const current = stack.pop()!;
      const deps = this.edges.get(current);
      
      if (deps) {
        for (const dep of deps) {
          if (!visited.has(dep)) {
            visited.add(dep);
            stack.push(dep);
          }
        }
      }
    }
    
    return Array.from(visited);
  }

  /**
   * Get all dependents (direct and transitive) of a node
   * @param id - Node identifier
   */
  getAllDependents(id: string): string[] {
    const visited = new Set<string>();
    const stack: string[] = [id];
    
    while (stack.length > 0) {
      const current = stack.pop()!;
      const dependents = this.reverseEdges.get(current);
      
      if (dependents) {
        for (const dependent of dependents) {
          if (!visited.has(dependent)) {
            visited.add(dependent);
            stack.push(dependent);
          }
        }
      }
    }
    
    return Array.from(visited);
  }

  /**
   * Check if 'nodeA' depends on 'nodeB' (directly or transitively)
   * @param nodeA - The node that might depend
   * @param nodeB - The potential dependency
   */
  dependsOn(nodeA: string, nodeB: string): boolean {
    const allDeps = this.getAllDependencies(nodeA);
    return allDeps.includes(nodeB);
  }

  /**
   * Perform topological sort on the graph
   * Returns an array of node ids in topological order
   * @throws Error if a cycle is detected
   */
  topologicalSort(): string[] {
    const result: string[] = [];
    const visited = new Set<string>();
    const tempMark = new Set<string>();

    const visit = (nodeId: string): void => {
      if (tempMark.has(nodeId)) {
        const cycle = this.detectCycle();
        throw new Error(`Cycle detected in graph: ${cycle?.join(' -> ')}`);
      }
      
      if (visited.has(nodeId)) {
        return;
      }

      tempMark.add(nodeId);
      
      const dependencies = this.edges.get(nodeId);
      if (dependencies) {
        for (const dep of dependencies) {
          visit(dep);
        }
      }
      
      tempMark.delete(nodeId);
      visited.add(nodeId);
      result.push(nodeId);
    };

    for (const nodeId of this.nodes.keys()) {
      if (!visited.has(nodeId)) {
        visit(nodeId);
      }
    }

    return result;
  }

  /**
   * Get execution levels - groups of nodes that can be executed in parallel
   * Each level contains nodes whose dependencies have all been satisfied
   * by previous levels
   */
  getExecutionLevels(): string[][] {
    if (this.nodes.size === 0) {
      return [];
    }

    // Calculate in-degree for each node
    const inDegree = new Map<string, number>();
    for (const [nodeId, deps] of this.edges) {
      inDegree.set(nodeId, deps.size);
    }

    const levels: string[][] = [];
    let currentLevel: string[] = [];

    // Find all nodes with no dependencies
    for (const [nodeId, degree] of inDegree) {
      if (degree === 0) {
        currentLevel.push(nodeId);
      }
    }

    while (currentLevel.length > 0) {
      levels.push([...currentLevel]);
      const nextLevel: string[] = [];

      for (const nodeId of currentLevel) {
        const dependents = this.reverseEdges.get(nodeId);
        if (dependents) {
          for (const dependent of dependents) {
            const newDegree = (inDegree.get(dependent) ?? 0) - 1;
            inDegree.set(dependent, newDegree);
            if (newDegree === 0) {
              nextLevel.push(dependent);
            }
          }
        }
      }

      currentLevel = nextLevel;
    }

    // Check if all nodes were processed
    const processedCount = levels.flat().length;
    if (processedCount !== this.nodes.size) {
      const cycle = this.detectCycle();
      throw new Error(`Cycle detected in graph: ${cycle?.join(' -> ')}`);
    }

    return levels;
  }

  /**
   * Detect if there's a cycle in the graph
   * @returns Array of node ids forming the cycle, or null if no cycle
   */
  detectCycle(): string[] | null {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (nodeId: string, path: string[]): string[] | null => {
      if (recursionStack.has(nodeId)) {
        const cycleStart = path.indexOf(nodeId);
        return path.slice(cycleStart).concat(nodeId);
      }

      if (visited.has(nodeId)) {
        return null;
      }

      visited.add(nodeId);
      recursionStack.add(nodeId);
      path.push(nodeId);

      const dependencies = this.edges.get(nodeId);
      if (dependencies) {
        for (const dep of dependencies) {
          const cycle = dfs(dep, path);
          if (cycle) return cycle;
        }
      }

      path.pop();
      recursionStack.delete(nodeId);
      return null;
    };

    for (const nodeId of this.nodes.keys()) {
      if (!visited.has(nodeId)) {
        const cycle = dfs(nodeId, []);
        if (cycle) return cycle;
      }
    }

    return null;
  }

  /**
   * Check if the graph has a cycle
   */
  hasCycle(): boolean {
    return this.detectCycle() !== null;
  }

  /**
   * Get the critical path through the graph (longest path from any root to any leaf)
   * This helps identify the minimum execution time
   */
  getCriticalPath(): string[] {
    if (this.nodes.size === 0) {
      return [];
    }

    // Find all root nodes (no dependencies)
    const roots: string[] = [];
    for (const [nodeId, deps] of this.edges) {
      if (deps.size === 0) {
        roots.push(nodeId);
      }
    }

    // Calculate longest path from each root using memoization
    const memo = new Map<string, { length: number; path: string[] }>();

    const getLongestPath = (nodeId: string): { length: number; path: string[] } => {
      if (memo.has(nodeId)) {
        return memo.get(nodeId)!;
      }

      const dependents = this.reverseEdges.get(nodeId);
      if (!dependents || dependents.size === 0) {
        const result = { length: 1, path: [nodeId] };
        memo.set(nodeId, result);
        return result;
      }

      let maxLength = 0;
      let bestPath: string[] = [];

      for (const dependent of dependents) {
        const subPath = getLongestPath(dependent);
        if (subPath.length > maxLength) {
          maxLength = subPath.length;
          bestPath = subPath.path;
        }
      }

      const result = { length: maxLength + 1, path: [nodeId, ...bestPath] };
      memo.set(nodeId, result);
      return result;
    };

    let bestCriticalPath: string[] = [];
    let maxLength = 0;

    for (const root of roots) {
      const path = getLongestPath(root);
      if (path.length > maxLength) {
        maxLength = path.length;
        bestCriticalPath = path.path;
      }
    }

    return bestCriticalPath;
  }

  /**
   * Get root nodes (nodes with no dependencies)
   */
  getRoots(): string[] {
    const roots: string[] = [];
    for (const [nodeId, deps] of this.edges) {
      if (deps.size === 0) {
        roots.push(nodeId);
      }
    }
    return roots;
  }

  /**
   * Get leaf nodes (nodes with no dependents)
   */
  getLeaves(): string[] {
    const leaves: string[] = [];
    for (const [nodeId, dependents] of this.reverseEdges) {
      if (dependents.size === 0) {
        leaves.push(nodeId);
      }
    }
    return leaves;
  }

  /**
   * Clear all nodes and edges from the graph
   */
  clear(): void {
    this.nodes.clear();
    this.edges.clear();
    this.reverseEdges.clear();
  }

  /**
   * Create a copy of this DAG
   */
  clone(): DAG<T> {
    const newDag = new DAG<T>();
    
    for (const [id, data] of this.nodes) {
      newDag.addNode(id, data);
    }
    
    for (const [to, froms] of this.edges) {
      for (const from of froms) {
        newDag.addEdge(from, to);
      }
    }
    
    return newDag;
  }
}

/**
 * DAG validation result
 */
export interface DAGValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate a DAG for common issues
 * @param dag - The DAG to validate
 */
export function validateDAG<T>(dag: DAG<T>): DAGValidationResult {
  const errors: string[] = [];

  // Check for cycles
  const cycle = dag.detectCycle();
  if (cycle) {
    errors.push(`Cycle detected: ${cycle.join(' -> ')}`);
  }

  // Check for orphaned nodes (not necessarily an error)
  const roots = dag.getRoots();
  if (roots.length === 0 && dag.size > 0) {
    errors.push('Graph has no root nodes (potential cycle)');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Create a DAG from a list of items with dependencies
 * @param items - Array of items with id and dependencies
 * @param getId - Function to extract id from item
 * @param getDependencies - Function to extract dependencies from item
 */
export function createDAGFromItems<T>(
  items: T[],
  getId: (item: T) => string,
  getDependencies: (item: T) => string[]
): DAG<T> {
  const dag = new DAG<T>();

  // Add all nodes first
  for (const item of items) {
    dag.addNode(getId(item), item);
  }

  // Add edges
  for (const item of items) {
    const id = getId(item);
    const deps = getDependencies(item);
    for (const dep of deps) {
      if (dag.hasNode(dep)) {
        dag.addEdge(dep, id);
      } else {
        throw new Error(`Dependency '${dep}' for node '${id}' does not exist`);
      }
    }
  }

  return dag;
}
