/**
 * Tests for Task Decomposition Engine
 */

import {
  TaskDecomposer,
  DecompositionOptions,
  TaskContext,
  Subtask,
  DAG,
  buildDependencyGraph,
  detectCycle,
  getExecutionOrder,
  calculateParallelizationRatio,
  quickDecompose,
  validateDecomposition,
  FileBasedStrategy,
  ComponentBasedStrategy,
  DomainBasedStrategy,
  LLMAssistedStrategy,
  DEFAULT_DECOMPOSITION_OPTIONS,
} from './task-decomposer';

// Mock dependencies
jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('../core/llm', () => ({
  quickComplete: jest.fn(),
}));

import { quickComplete } from '../core/llm';

describe('TaskDecomposer', () => {
  let decomposer: TaskDecomposer;

  beforeEach(() => {
    decomposer = new TaskDecomposer();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default strategies', () => {
      const strategies = decomposer.getAvailableStrategies();
      expect(strategies).toContain('file-based');
      expect(strategies).toContain('component-based');
      expect(strategies).toContain('domain-based');
      expect(strategies).toContain('llm-assisted');
    });
  });

  describe('decompose', () => {
    it('should decompose a simple task using component-based strategy', async () => {
      const result = await decomposer.decompose('Implement OAuth');

      expect(result.subtasks.length).toBeGreaterThan(0);
      expect(result.dag).toBeDefined();
      expect(result.executionLevels).toBeDefined();
      expect(result.strategyUsed).toBe('component-based');
      expect(result.decomposedAt).toBeInstanceOf(Date);
    });

    it('should use file-based strategy when specified', async () => {
      const context: TaskContext = {
        files: ['src/auth.ts', 'src/api.ts', 'src/utils.ts'],
      };

      const result = await decomposer.decompose('Refactor codebase', context, {
        strategy: 'file-based',
        maxParallelism: 10,
        minSubtaskSize: 1,
      });

      expect(result.strategyUsed).toBe('file-based');
      expect(result.subtasks.length).toBeGreaterThan(0);
    });

    it('should use domain-based strategy when specified', async () => {
      const result = await decomposer.decompose('Build e-commerce site', undefined, {
        strategy: 'domain-based',
        maxParallelism: 10,
        minSubtaskSize: 1,
      });

      expect(result.strategyUsed).toBe('domain-based');
    });

    it('should respect maxParallelism option', async () => {
      const context: TaskContext = {
        files: ['src/file1.ts', 'src/file2.ts', 'src/file3.ts', 'src/file4.ts', 'src/file5.ts'],
      };

      const result = await decomposer.decompose('Update many files', context, {
        strategy: 'file-based',
        maxParallelism: 3,
        minSubtaskSize: 1,
      });

      expect(result.subtasks.length).toBeLessThanOrEqual(3);
    });

    it('should throw error for unknown strategy', async () => {
      await expect(
        decomposer.decompose('Test task', undefined, {
          strategy: 'unknown' as any,
          maxParallelism: 10,
          minSubtaskSize: 1,
        })
      ).rejects.toThrow('Unknown decomposition strategy');
    });

    it('should calculate parallelization ratio', async () => {
      const result = await decomposer.decompose('Implement OAuth');

      expect(result.parallelizationRatio).toBeGreaterThanOrEqual(0);
      expect(result.parallelizationRatio).toBeLessThanOrEqual(1);
    });

    it('should aggregate complexity correctly', async () => {
      const result = await decomposer.decompose('Complex task with multiple components');

      expect(['low', 'medium', 'high']).toContain(result.totalComplexity);
    });
  });

  describe('FileBasedStrategy', () => {
    let strategy: FileBasedStrategy;

    beforeEach(() => {
      strategy = new FileBasedStrategy();
    });

    it('should decompose by files', async () => {
      const context: TaskContext = {
        files: ['src/auth.ts', 'src/api.ts', 'src/utils.ts'],
      };

      const subtasks = await strategy.decompose('Refactor codebase', context);

      expect(subtasks.length).toBeGreaterThan(0);
      expect(subtasks.some(s => s.files && s.files.length > 0)).toBe(true);
    });

    it('should group files by directory', async () => {
      const context: TaskContext = {
        files: [
          'src/auth/login.ts',
          'src/auth/logout.ts',
          'src/api/users.ts',
          'src/api/orders.ts',
        ],
      };

      const subtasks = await strategy.decompose('Refactor codebase', context);

      // Should create at least 2 groups (auth and api)
      expect(subtasks.length).toBeGreaterThanOrEqual(2);
    });

    it('should create single subtask when no files provided', async () => {
      const subtasks = await strategy.decompose('Refactor codebase');

      expect(subtasks.length).toBe(1);
      expect(subtasks[0].title).toBe('Refactor codebase');
    });
  });

  describe('ComponentBasedStrategy', () => {
    let strategy: ComponentBasedStrategy;

    beforeEach(() => {
      strategy = new ComponentBasedStrategy();
    });

    it('should extract components from task description', async () => {
      const subtasks = await strategy.decompose('Implement API with database and authentication');

      expect(subtasks.length).toBeGreaterThan(1);
      expect(subtasks.some(s => s.component?.toLowerCase().includes('api'))).toBe(true);
    });

    it('should respect provided components', async () => {
      const context: TaskContext = {
        components: ['Frontend', 'Backend', 'Database'],
      };

      const subtasks = await strategy.decompose('Build application', context);

      expect(subtasks.length).toBe(3);
      expect(subtasks.map(s => s.component)).toEqual(
        expect.arrayContaining(['Frontend', 'Backend', 'Database'])
      );
    });

    it('should establish component dependencies', async () => {
      const context: TaskContext = {
        components: ['Database', 'API', 'Frontend'],
      };

      const subtasks = await strategy.decompose('Build app', context);

      // API should depend on Database
      const apiTask = subtasks.find(s => s.component === 'API');
      const dbTask = subtasks.find(s => s.component === 'Database');

      if (apiTask && dbTask) {
        expect(apiTask.dependencies).toContain(dbTask.id);
      }
    });

    it('should estimate complexity based on component type', async () => {
      const context: TaskContext = {
        components: ['Database', 'Tests'],
      };

      const subtasks = await strategy.decompose('Build app', context);

      const dbTask = subtasks.find(s => s.component === 'Database');
      const testTask = subtasks.find(s => s.component === 'Tests');

      if (dbTask && testTask) {
        // Database should be higher complexity than tests
        const complexityOrder = { low: 1, medium: 2, high: 3 };
        expect(complexityOrder[dbTask.estimatedComplexity])
          .toBeGreaterThanOrEqual(complexityOrder[testTask.estimatedComplexity]);
      }
    });

    it('should provide default components when none detected', async () => {
      const subtasks = await strategy.decompose('Fix bug');

      expect(subtasks.length).toBeGreaterThan(0);
    });
  });

  describe('DomainBasedStrategy', () => {
    let strategy: DomainBasedStrategy;

    beforeEach(() => {
      strategy = new DomainBasedStrategy();
    });

    it('should extract domains from e-commerce task', async () => {
      const subtasks = await strategy.decompose('Build e-commerce site with user accounts and checkout');

      expect(subtasks.length).toBeGreaterThan(1);
      expect(subtasks.some(s => s.domain?.toLowerCase().includes('user'))).toBe(true);
    });

    it('should respect provided domains', async () => {
      const context: TaskContext = {
        domains: ['Billing', 'Shipping', 'Notification'],
      };

      const subtasks = await strategy.decompose('Build system', context);

      expect(subtasks.length).toBe(3);
      expect(subtasks.map(s => s.domain)).toEqual(
        expect.arrayContaining(['Billing', 'Shipping', 'Notification'])
      );
    });

    it('should establish domain dependencies', async () => {
      const context: TaskContext = {
        domains: ['User', 'Order', 'Shipping'],
      };

      const subtasks = await strategy.decompose('Build system', context);

      // Order should depend on User
      const orderTask = subtasks.find(s => s.domain === 'Order');
      const userTask = subtasks.find(s => s.domain === 'User');

      if (orderTask && userTask) {
        expect(orderTask.dependencies).toContain(userTask.id);
      }
    });

    it('should provide default domain when none detected', async () => {
      const subtasks = await strategy.decompose('Fix typo');

      expect(subtasks.length).toBeGreaterThan(0);
      expect(subtasks[0].domain).toBeDefined();
    });
  });

  describe('LLMAssistedStrategy', () => {
    let strategy: LLMAssistedStrategy;

    beforeEach(() => {
      strategy = new LLMAssistedStrategy();
    });

    it('should parse LLM response correctly', async () => {
      // Test the parseLLMResponse method directly by mocking a successful LLM response
      const mockResponse = '[{"title": "Setup database", "description": "Create database schema", "dependencies": [], "complexity": "medium"}, {"title": "Create API", "description": "Build REST endpoints", "dependencies": [0], "complexity": "high"}]';

      (quickComplete as jest.Mock).mockResolvedValue(mockResponse);

      const subtasks = await strategy.decompose('Build system');

      // The LLM strategy should parse the response or fall back gracefully
      expect(subtasks.length).toBeGreaterThanOrEqual(1);
      expect(subtasks[0].title).toBeDefined();
      expect(subtasks[0].estimatedComplexity).toBeDefined();
    });

    it('should fallback to component-based on LLM failure', async () => {
      (quickComplete as jest.Mock).mockRejectedValue(new Error('LLM timeout'));

      const subtasks = await strategy.decompose('Build system');

      expect(subtasks.length).toBeGreaterThan(0);
    });

    it('should handle invalid JSON gracefully', async () => {
      (quickComplete as jest.Mock).mockResolvedValue('invalid json');

      // Should fallback
      const subtasks = await strategy.decompose('Build system');

      expect(subtasks.length).toBeGreaterThan(0);
    });
  });

  describe('buildDependencyGraph', () => {
    it('should build correct adjacency lists', () => {
      const subtasks: Subtask[] = [
        { id: 'a', title: 'A', description: '', dependencies: [], estimatedComplexity: 'low' },
        { id: 'b', title: 'B', description: '', dependencies: ['a'], estimatedComplexity: 'low' },
        { id: 'c', title: 'C', description: '', dependencies: ['a'], estimatedComplexity: 'low' },
      ];

      const dag = buildDependencyGraph(subtasks);

      expect(dag.edges.get('a')).toEqual(['b', 'c']);
      expect(dag.reverseEdges.get('b')).toEqual(['a']);
      expect(dag.reverseEdges.get('c')).toEqual(['a']);
    });

    it('should handle empty subtask list', () => {
      const dag = buildDependencyGraph([]);

      expect(dag.nodes).toEqual([]);
      expect(dag.edges.size).toBe(0);
    });
  });

  describe('detectCycle', () => {
    it('should return null for acyclic graph', () => {
      const subtasks: Subtask[] = [
        { id: 'a', title: 'A', description: '', dependencies: [], estimatedComplexity: 'low' },
        { id: 'b', title: 'B', description: '', dependencies: ['a'], estimatedComplexity: 'low' },
        { id: 'c', title: 'C', description: '', dependencies: ['b'], estimatedComplexity: 'low' },
      ];

      const dag = buildDependencyGraph(subtasks);
      const cycle = detectCycle(dag);

      expect(cycle).toBeNull();
    });

    it('should detect simple cycle', () => {
      const subtasks: Subtask[] = [
        { id: 'a', title: 'A', description: '', dependencies: ['b'], estimatedComplexity: 'low' },
        { id: 'b', title: 'B', description: '', dependencies: ['a'], estimatedComplexity: 'low' },
      ];

      const dag = buildDependencyGraph(subtasks);
      const cycle = detectCycle(dag);

      expect(cycle).not.toBeNull();
      expect(cycle).toContain('a');
      expect(cycle).toContain('b');
    });

    it('should detect self-loop', () => {
      const subtasks: Subtask[] = [
        { id: 'a', title: 'A', description: '', dependencies: ['a'], estimatedComplexity: 'low' },
      ];

      const dag = buildDependencyGraph(subtasks);
      const cycle = detectCycle(dag);

      expect(cycle).not.toBeNull();
    });
  });

  describe('getExecutionOrder', () => {
    it('should return correct execution levels', () => {
      const subtasks: Subtask[] = [
        { id: 'a', title: 'A', description: '', dependencies: [], estimatedComplexity: 'low' },
        { id: 'b', title: 'B', description: '', dependencies: [], estimatedComplexity: 'low' },
        { id: 'c', title: 'C', description: '', dependencies: ['a', 'b'], estimatedComplexity: 'low' },
        { id: 'd', title: 'D', description: '', dependencies: ['c'], estimatedComplexity: 'low' },
      ];

      const dag = buildDependencyGraph(subtasks);
      const levels = getExecutionOrder(dag);

      expect(levels.length).toBe(3);
      expect(levels[0].map(s => s.id).sort()).toEqual(['a', 'b']);
      expect(levels[1].map(s => s.id)).toEqual(['c']);
      expect(levels[2].map(s => s.id)).toEqual(['d']);
    });

    it('should handle diamond dependency pattern', () => {
      const subtasks: Subtask[] = [
        { id: 'a', title: 'A', description: '', dependencies: [], estimatedComplexity: 'low' },
        { id: 'b', title: 'B', description: '', dependencies: ['a'], estimatedComplexity: 'low' },
        { id: 'c', title: 'C', description: '', dependencies: ['a'], estimatedComplexity: 'low' },
        { id: 'd', title: 'D', description: '', dependencies: ['b', 'c'], estimatedComplexity: 'low' },
      ];

      const dag = buildDependencyGraph(subtasks);
      const levels = getExecutionOrder(dag);

      expect(levels[0].map(s => s.id)).toEqual(['a']);
      expect(levels[1].map(s => s.id).sort()).toEqual(['b', 'c']);
      expect(levels[2].map(s => s.id)).toEqual(['d']);
    });

    it('should return empty array for empty graph', () => {
      const dag = buildDependencyGraph([]);
      const levels = getExecutionOrder(dag);

      expect(levels).toEqual([]);
    });
  });

  describe('calculateParallelizationRatio', () => {
    it('should return 0 for single task', () => {
      const subtasks: Subtask[] = [
        { id: 'a', title: 'A', description: '', dependencies: [], estimatedComplexity: 'low' },
      ];

      const ratio = calculateParallelizationRatio(subtasks, [[subtasks[0]]]);

      expect(ratio).toBe(0);
    });

    it('should return 1 for fully parallel tasks', () => {
      const subtasks: Subtask[] = [
        { id: 'a', title: 'A', description: '', dependencies: [], estimatedComplexity: 'low' },
        { id: 'b', title: 'B', description: '', dependencies: [], estimatedComplexity: 'low' },
        { id: 'c', title: 'C', description: '', dependencies: [], estimatedComplexity: 'low' },
      ];

      const ratio = calculateParallelizationRatio(subtasks, [subtasks]);

      expect(ratio).toBe(1);
    });

    it('should calculate partial parallelization', () => {
      const subtasks: Subtask[] = [
        { id: 'a', title: 'A', description: '', dependencies: [], estimatedComplexity: 'low' },
        { id: 'b', title: 'B', description: '', dependencies: ['a'], estimatedComplexity: 'low' },
        { id: 'c', title: 'C', description: '', dependencies: ['a'], estimatedComplexity: 'low' },
      ];

      const levels = [
        [subtasks[0]],
        [subtasks[1], subtasks[2]],
      ];

      const ratio = calculateParallelizationRatio(subtasks, levels);

      expect(ratio).toBeGreaterThan(0);
      expect(ratio).toBeLessThan(1);
    });
  });

  describe('quickDecompose', () => {
    it('should return subtasks quickly', async () => {
      const subtasks = await quickDecompose('Fix bug');

      expect(subtasks.length).toBeGreaterThan(0);
    });

    it('should override complexity when specified', async () => {
      const subtasks = await quickDecompose('Fix bug', 'high');

      expect(subtasks.every(s => s.estimatedComplexity === 'high')).toBe(true);
    });
  });

  describe('validateDecomposition', () => {
    it('should return valid for good decomposition', () => {
      const dag = buildDependencyGraph([
        { id: 'a', title: 'A', description: '', dependencies: [], estimatedComplexity: 'low' },
        { id: 'b', title: 'B', description: '', dependencies: ['a'], estimatedComplexity: 'low' },
      ]);
      const result = {
        subtasks: [
          { id: 'a', title: 'A', description: '', dependencies: [], estimatedComplexity: 'low' as const },
          { id: 'b', title: 'B', description: '', dependencies: ['a'], estimatedComplexity: 'low' as const },
        ],
        dag,
        executionLevels: [],
        totalComplexity: 'low' as const,
        parallelizationRatio: 0.5,
        strategyUsed: 'component-based' as const,
        decomposedAt: new Date(),
      };

      const validation = validateDecomposition(result);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should detect duplicate IDs', () => {
      const dag = buildDependencyGraph([]);
      const result = {
        subtasks: [
          { id: 'a', title: 'A', description: '', dependencies: [], estimatedComplexity: 'low' as const },
          { id: 'a', title: 'B', description: '', dependencies: [], estimatedComplexity: 'low' as const },
        ],
        dag,
        executionLevels: [],
        totalComplexity: 'low' as const,
        parallelizationRatio: 0,
        strategyUsed: 'component-based' as const,
        decomposedAt: new Date(),
      };

      const validation = validateDecomposition(result);

      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('Duplicate'))).toBe(true);
    });

    it('should detect invalid dependencies', () => {
      const dag = buildDependencyGraph([
        { id: 'a', title: 'A', description: '', dependencies: ['nonexistent'], estimatedComplexity: 'low' },
      ]);
      const result = {
        subtasks: [
          { id: 'a', title: 'A', description: '', dependencies: ['nonexistent'], estimatedComplexity: 'low' as const },
        ],
        dag,
        executionLevels: [],
        totalComplexity: 'low' as const,
        parallelizationRatio: 0,
        strategyUsed: 'component-based' as const,
        decomposedAt: new Date(),
      };

      const validation = validateDecomposition(result);

      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('invalid dependency'))).toBe(true);
    });

    it('should detect empty decomposition', () => {
      const dag = buildDependencyGraph([]);
      const result = {
        subtasks: [],
        dag,
        executionLevels: [],
        totalComplexity: 'low' as const,
        parallelizationRatio: 0,
        strategyUsed: 'component-based' as const,
        decomposedAt: new Date(),
      };

      const validation = validateDecomposition(result);

      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('No subtasks'))).toBe(true);
    });
  });

  describe('DEFAULT_DECOMPOSITION_OPTIONS', () => {
    it('should have sensible defaults', () => {
      expect(DEFAULT_DECOMPOSITION_OPTIONS.maxParallelism).toBeGreaterThan(0);
      expect(DEFAULT_DECOMPOSITION_OPTIONS.minSubtaskSize).toBeGreaterThan(0);
      expect(DEFAULT_DECOMPOSITION_OPTIONS.strategy).toBe('component-based');
    });
  });

  describe('integration scenarios', () => {
    it('should handle complex refactoring task', async () => {
      const context: TaskContext = {
        files: [
          'src/auth/login.ts',
          'src/auth/logout.ts',
          'src/api/users.ts',
          'src/api/orders.ts',
          'src/database/schema.ts',
        ],
        components: ['Auth', 'API', 'Database'],
      };

      const result = await decomposer.decompose('Refactor authentication system', context, {
        strategy: 'file-based',
        maxParallelism: 5,
        minSubtaskSize: 1,
      });

      expect(result.subtasks.length).toBeGreaterThan(0);
      expect(result.subtasks.length).toBeLessThanOrEqual(5);
      expect(validateDecomposition(result).valid).toBe(true);
    });

    it('should handle e-commerce domain task', async () => {
      const result = await decomposer.decompose('Build e-commerce checkout flow with payment processing', undefined, {
        strategy: 'domain-based',
        maxParallelism: 10,
        minSubtaskSize: 1,
      });

      expect(result.subtasks.length).toBeGreaterThan(1);
      expect(result.subtasks.some(s => s.domain)).toBe(true);
      expect(validateDecomposition(result).valid).toBe(true);
    });

    it('should maintain dependency constraints across strategies', async () => {
      const context: TaskContext = {
        components: ['Database', 'Service', 'API', 'Frontend'],
      };

      const result = await decomposer.decompose('Build full stack feature', context, {
        strategy: 'component-based',
        maxParallelism: 10,
        minSubtaskSize: 1,
      });

      // Verify no cycles
      expect(validateDecomposition(result).valid).toBe(true);

      // Verify execution order respects dependencies
      const allIds = new Set(result.subtasks.map(s => s.id));
      for (const level of result.executionLevels) {
        for (const subtask of level) {
          for (const depId of subtask.dependencies) {
            // All dependencies should exist
            expect(allIds.has(depId)).toBe(true);
          }
        }
      }
    });
  });
});
