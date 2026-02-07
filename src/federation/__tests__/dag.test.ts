/**
 * Unit tests for DAG (Directed Acyclic Graph)
 */

//@ts-nocheck
import { DAG, createDAGFromItems, validateDAG } from '../dag';

describe('DAG', () => {
  let dag: DAG<string>;

  beforeEach(() => {
    dag = new DAG<string>();
  });

  describe('Node Management', () => {
    it('should add nodes', () => {
      dag.addNode('A', 'data-A');
      dag.addNode('B', 'data-B');
      
      expect(dag.size).toBe(2);
      expect(dag.getNode('A')).toBe('data-A');
      expect(dag.getNode('B')).toBe('data-B');
    });

    it('should throw when adding duplicate node', () => {
      dag.addNode('A', 'data-A');
      
      expect(() => dag.addNode('A', 'data-A2')).toThrow("Node with id 'A' already exists");
    });

    it('should remove nodes', () => {
      dag.addNode('A', 'data-A');
      dag.addNode('B', 'data-B');
      dag.addEdge('A', 'B');
      
      const removed = dag.removeNode('A');
      
      expect(removed).toBe(true);
      expect(dag.size).toBe(1);
      expect(dag.hasNode('A')).toBe(false);
      expect(dag.getDependencies('B')).toEqual([]);
    });

    it('should return false when removing non-existent node', () => {
      const removed = dag.removeNode('non-existent');
      expect(removed).toBe(false);
    });

    it('should check if node exists', () => {
      dag.addNode('A', 'data-A');
      
      expect(dag.hasNode('A')).toBe(true);
      expect(dag.hasNode('B')).toBe(false);
    });

    it('should clear all nodes', () => {
      dag.addNode('A', 'data-A');
      dag.addNode('B', 'data-B');
      dag.addEdge('A', 'B');
      
      dag.clear();
      
      expect(dag.size).toBe(0);
      expect(dag.hasNode('A')).toBe(false);
      expect(dag.hasNode('B')).toBe(false);
    });
  });

  describe('Edge Management', () => {
    beforeEach(() => {
      dag.addNode('A', 'data-A');
      dag.addNode('B', 'data-B');
      dag.addNode('C', 'data-C');
    });

    it('should add edges', () => {
      dag.addEdge('A', 'B'); // B depends on A
      
      expect(dag.getDependencies('B')).toContain('A');
      expect(dag.getDependents('A')).toContain('B');
    });

    it('should throw when adding edge with non-existent source', () => {
      expect(() => dag.addEdge('X', 'A')).toThrow("Source node 'X' does not exist");
    });

    it('should throw when adding edge with non-existent target', () => {
      expect(() => dag.addEdge('A', 'X')).toThrow("Target node 'X' does not exist");
    });

    it('should remove edges', () => {
      dag.addEdge('A', 'B');
      
      const removed = dag.removeEdge('A', 'B');
      
      expect(removed).toBe(true);
      expect(dag.getDependencies('B')).not.toContain('A');
    });

    it('should return false when removing non-existent edge', () => {
      const removed = dag.removeEdge('A', 'B');
      expect(removed).toBe(false);
    });
  });

  describe('Dependency Queries', () => {
    beforeEach(() => {
      // A -> B -> C
      //  \-> D ->/
      dag.addNode('A', 'data-A');
      dag.addNode('B', 'data-B');
      dag.addNode('C', 'data-C');
      dag.addNode('D', 'data-D');
      
      dag.addEdge('A', 'B');
      dag.addEdge('B', 'C');
      dag.addEdge('A', 'D');
      dag.addEdge('D', 'C');
    });

    it('should get direct dependencies', () => {
      expect(dag.getDependencies('C')).toContain('B');
      expect(dag.getDependencies('C')).toContain('D');
      expect(dag.getDependencies('A')).toEqual([]);
    });

    it('should get direct dependents', () => {
      expect(dag.getDependents('A')).toContain('B');
      expect(dag.getDependents('A')).toContain('D');
      expect(dag.getDependents('C')).toEqual([]);
    });

    it('should get all transitive dependencies', () => {
      const deps = dag.getAllDependencies('C');
      
      expect(deps).toContain('A');
      expect(deps).toContain('B');
      expect(deps).toContain('D');
    });

    it('should get all transitive dependents', () => {
      const dependents = dag.getAllDependents('A');
      
      expect(dependents).toContain('B');
      expect(dependents).toContain('C');
      expect(dependents).toContain('D');
    });

    it('should check if node depends on another', () => {
      expect(dag.dependsOn('C', 'A')).toBe(true);
      expect(dag.dependsOn('C', 'B')).toBe(true);
      expect(dag.dependsOn('A', 'C')).toBe(false);
    });
  });

  describe('Topological Sort', () => {
    it('should sort nodes in dependency order', () => {
      // A -> B -> C
      dag.addNode('A', 'data-A');
      dag.addNode('B', 'data-B');
      dag.addNode('C', 'data-C');
      dag.addEdge('A', 'B');
      dag.addEdge('B', 'C');
      
      const sorted = dag.topologicalSort();
      
      expect(sorted.indexOf('A')).toBeLessThan(sorted.indexOf('B'));
      expect(sorted.indexOf('B')).toBeLessThan(sorted.indexOf('C'));
    });

    it('should handle parallel dependencies', () => {
      // A -> B, A -> C, B -> D, C -> D
      dag.addNode('A', 'data-A');
      dag.addNode('B', 'data-B');
      dag.addNode('C', 'data-C');
      dag.addNode('D', 'data-D');
      
      dag.addEdge('A', 'B');
      dag.addEdge('A', 'C');
      dag.addEdge('B', 'D');
      dag.addEdge('C', 'D');
      
      const sorted = dag.topologicalSort();
      
      expect(sorted.indexOf('A')).toBeLessThan(sorted.indexOf('B'));
      expect(sorted.indexOf('A')).toBeLessThan(sorted.indexOf('C'));
      expect(sorted.indexOf('B')).toBeLessThan(sorted.indexOf('D'));
      expect(sorted.indexOf('C')).toBeLessThan(sorted.indexOf('D'));
    });

    it('should throw on cycle', () => {
      dag.addNode('A', 'data-A');
      dag.addNode('B', 'data-B');
      dag.addEdge('A', 'B');
      dag.addEdge('B', 'A');
      
      expect(() => dag.topologicalSort()).toThrow('Cycle detected');
    });
  });

  describe('Execution Levels', () => {
    it('should group nodes into execution levels', () => {
      // Level 0: A
      // Level 1: B, C
      // Level 2: D
      dag.addNode('A', 'data-A');
      dag.addNode('B', 'data-B');
      dag.addNode('C', 'data-C');
      dag.addNode('D', 'data-D');
      
      dag.addEdge('A', 'B');
      dag.addEdge('A', 'C');
      dag.addEdge('B', 'D');
      dag.addEdge('C', 'D');
      
      const levels = dag.getExecutionLevels();
      
      expect(levels).toHaveLength(3);
      expect(levels[0]).toContain('A');
      expect(levels[1]).toContain('B');
      expect(levels[1]).toContain('C');
      expect(levels[2]).toContain('D');
    });

    it('should throw on cycle when getting execution levels', () => {
      dag.addNode('A', 'data-A');
      dag.addNode('B', 'data-B');
      dag.addEdge('A', 'B');
      dag.addEdge('B', 'A');
      
      expect(() => dag.getExecutionLevels()).toThrow('Cycle detected');
    });

    it('should return empty array for empty graph', () => {
      const levels = dag.getExecutionLevels();
      expect(levels).toEqual([]);
    });
  });

  describe('Cycle Detection', () => {
    it('should detect simple cycle', () => {
      dag.addNode('A', 'data-A');
      dag.addNode('B', 'data-B');
      dag.addEdge('A', 'B');
      dag.addEdge('B', 'A');
      
      const cycle = dag.detectCycle();
      
      expect(cycle).not.toBeNull();
      expect(cycle).toContain('A');
      expect(cycle).toContain('B');
    });

    it('should detect cycle in larger graph', () => {
      dag.addNode('A', 'data-A');
      dag.addNode('B', 'data-B');
      dag.addNode('C', 'data-C');
      dag.addNode('D', 'data-D');
      
      dag.addEdge('A', 'B');
      dag.addEdge('B', 'C');
      dag.addEdge('C', 'D');
      dag.addEdge('D', 'B'); // Creates cycle B -> C -> D -> B
      
      const cycle = dag.detectCycle();
      
      expect(cycle).not.toBeNull();
    });

    it('should return null when no cycle exists', () => {
      dag.addNode('A', 'data-A');
      dag.addNode('B', 'data-B');
      dag.addNode('C', 'data-C');
      
      dag.addEdge('A', 'B');
      dag.addEdge('B', 'C');
      
      const cycle = dag.detectCycle();
      
      expect(cycle).toBeNull();
    });

    it('should correctly report hasCycle', () => {
      dag.addNode('A', 'data-A');
      dag.addNode('B', 'data-B');
      
      expect(dag.hasCycle()).toBe(false);
      
      dag.addEdge('A', 'B');
      dag.addEdge('B', 'A');
      
      expect(dag.hasCycle()).toBe(true);
    });
  });

  describe('Critical Path', () => {
    it('should find critical path', () => {
      // A -> B -> C
      // A -> D
      dag.addNode('A', 'data-A');
      dag.addNode('B', 'data-B');
      dag.addNode('C', 'data-C');
      dag.addNode('D', 'data-D');
      
      dag.addEdge('A', 'B');
      dag.addEdge('B', 'C');
      dag.addEdge('A', 'D');
      
      const path = dag.getCriticalPath();
      
      expect(path).toEqual(['A', 'B', 'C']);
    });

    it('should return empty array for empty graph', () => {
      const path = dag.getCriticalPath();
      expect(path).toEqual([]);
    });
  });

  describe('Root and Leaf Detection', () => {
    beforeEach(() => {
      dag.addNode('A', 'data-A');
      dag.addNode('B', 'data-B');
      dag.addNode('C', 'data-C');
      dag.addNode('D', 'data-D');
      
      dag.addEdge('A', 'B');
      dag.addEdge('A', 'C');
      dag.addEdge('B', 'D');
      dag.addEdge('C', 'D');
    });

    it('should find root nodes', () => {
      const roots = dag.getRoots();
      expect(roots).toEqual(['A']);
    });

    it('should find leaf nodes', () => {
      const leaves = dag.getLeaves();
      expect(leaves).toEqual(['D']);
    });
  });

  describe('Clone', () => {
    it('should create independent copy', () => {
      dag.addNode('A', 'data-A');
      dag.addNode('B', 'data-B');
      dag.addEdge('A', 'B');
      
      const clone = dag.clone();
      
      expect(clone.size).toBe(2);
      expect(clone.getNode('A')).toBe('data-A');
      expect(clone.getDependencies('B')).toContain('A');
      
      // Modify clone should not affect original
      clone.addNode('C', 'data-C');
      expect(dag.size).toBe(2);
      expect(clone.size).toBe(3);
    });
  });
});

describe('createDAGFromItems', () => {
  interface Item {
    id: string;
    name: string;
    deps: string[];
  }

  it('should create DAG from items', () => {
    const items: Item[] = [
      { id: 'A', name: 'Task A', deps: [] },
      { id: 'B', name: 'Task B', deps: ['A'] },
      { id: 'C', name: 'Task C', deps: ['A', 'B'] },
    ];

    const dag = createDAGFromItems(
      items,
      (item) => item.id,
      (item) => item.deps
    );

    expect(dag.size).toBe(3);
    expect(dag.getDependencies('B')).toContain('A');
    expect(dag.getDependencies('C')).toContain('A');
    expect(dag.getDependencies('C')).toContain('B');
  });

  it('should throw on missing dependency', () => {
    const items: Item[] = [
      { id: 'A', name: 'Task A', deps: ['B'] }, // B doesn't exist
    ];

    expect(() =>
      createDAGFromItems(
        items,
        (item) => item.id,
        (item) => item.deps
      )
    ).toThrow("Dependency 'B' for node 'A' does not exist");
  });
});

describe('validateDAG', () => {
  it('should return valid for valid DAG', () => {
    const dag = new DAG<string>();
    dag.addNode('A', 'data-A');
    dag.addNode('B', 'data-B');
    dag.addEdge('A', 'B');

    const result = validateDAG(dag);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should return invalid for graph with cycle', () => {
    const dag = new DAG<string>();
    dag.addNode('A', 'data-A');
    dag.addNode('B', 'data-B');
    dag.addEdge('A', 'B');
    dag.addEdge('B', 'A');

    const result = validateDAG(dag);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('Cycle detected');
  });
});
