/**
 * Task Decomposition Engine - OpenClaw Federation
 *
 * Intelligently breaks down large tasks into smaller, parallelizable subtasks.
 * Supports multiple decomposition strategies and dependency resolution.
 *
 * @module federation/task-decomposer
 */

import { quickComplete } from '../core/llm';
import { logger } from '../utils/logger';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Complexity level for subtask estimation
 */
export type ComplexityLevel = 'low' | 'medium' | 'high';

/**
 * Decomposition strategy types
 */
export type DecompositionStrategy = 'file-based' | 'component-based' | 'domain-based' | 'llm-assisted';

/**
 * Options for task decomposition
 */
export interface DecompositionOptions {
  /** Maximum number of parallel subtasks */
  maxParallelism: number;
  /** Minimum subtask size (don't split smaller than this) */
  minSubtaskSize: number;
  /** Preferred decomposition strategy */
  strategy: DecompositionStrategy;
  /** Whether to use LLM for intelligent decomposition */
  useLLM?: boolean;
  /** LLM model to use for decomposition */
  llmModel?: string;
}

/**
 * Default decomposition options
 */
export const DEFAULT_DECOMPOSITION_OPTIONS: DecompositionOptions = {
  maxParallelism: 10,
  minSubtaskSize: 1,
  strategy: 'component-based',
  useLLM: false,
};

/**
 * Task context for decomposition
 */
export interface TaskContext {
  /** Files relevant to the task */
  files?: string[];
  /** Existing components/modules in the system */
  components?: string[];
  /** Business domains */
  domains?: string[];
  /** Additional metadata */
  metadata?: Record<string, unknown>;
  /** Current codebase structure */
  codebase?: {
    rootDir: string;
    structure: Record<string, string[]>;
  };
}

/**
 * Individual subtask representation
 */
export interface Subtask {
  /** Unique identifier */
  id: string;
  /** Human-readable title */
  title: string;
  /** Detailed description */
  description: string;
  /** IDs of subtasks that must complete first */
  dependencies: string[];
  /** Estimated complexity level */
  estimatedComplexity: ComplexityLevel;
  /** Files this subtask should modify */
  files?: string[];
  /** Estimated effort in story points (1-8) */
  estimatedEffort?: number;
  /** Required capabilities for execution */
  requiredCapabilities?: string[];
  /** Domain this subtask belongs to */
  domain?: string;
  /** Component this subtask affects */
  component?: string;
}

/**
 * Directed Acyclic Graph for dependency management
 */
export interface DAG {
  /** All nodes in the graph */
  nodes: Subtask[];
  /** Adjacency list representing edges (node -> its dependents) */
  edges: Map<string, string[]>;
  /** Reverse adjacency list (node -> its dependencies) */
  reverseEdges: Map<string, string[]>;
}

/**
 * Result of task decomposition
 */
export interface DecompositionResult {
  /** Generated subtasks */
  subtasks: Subtask[];
  /** Dependency graph */
  dag: DAG;
  /** Execution order as parallel levels */
  executionLevels: Subtask[][];
  /** Estimated total complexity */
  totalComplexity: ComplexityLevel;
  /** Estimated parallelization efficiency */
  parallelizationRatio: number;
  /** Strategy used for decomposition */
  strategyUsed: DecompositionStrategy;
  /** Timestamp of decomposition */
  decomposedAt: Date;
}

// ============================================================================
// Decomposition Strategy Implementations
// ============================================================================

/**
 * Base class for decomposition strategies
 */
abstract class DecompositionStrategyBase {
  abstract readonly name: DecompositionStrategy;
  abstract decompose(task: string, context?: TaskContext, options?: DecompositionOptions): Promise<Subtask[]>;

  /**
   * Generate a unique ID for a subtask
   */
  protected generateId(prefix: string, index: number): string {
    return `${prefix}-${Date.now()}-${index}`;
  }

  /**
   * Estimate complexity based on task description heuristics
   */
  protected estimateComplexity(description: string): ComplexityLevel {
    const complexityIndicators = {
      high: ['refactor', 'rewrite', 'architecture', 'design', 'implement.*system', 'implement.*framework'],
      medium: ['implement', 'create', 'build', 'add.*feature', 'integrate', 'optimize'],
      low: ['fix', 'update', 'change', 'modify', 'cleanup', 'document', 'test', 'rename'],
    };

    const lowerDesc = description.toLowerCase();
    
    for (const [level, patterns] of Object.entries(complexityIndicators)) {
      for (const pattern of patterns) {
        const regex = new RegExp(pattern);
        if (regex.test(lowerDesc)) {
          return level as ComplexityLevel;
        }
      }
    }

    return 'medium';
  }
}

/**
 * File-based decomposition strategy
 * Splits tasks based on file modifications needed
 */
class FileBasedStrategy extends DecompositionStrategyBase {
  readonly name = 'file-based' as const;

  async decompose(task: string, context?: TaskContext, options?: DecompositionOptions): Promise<Subtask[]> {
    const files = context?.files || [];
    const subtasks: Subtask[] = [];

    if (files.length === 0) {
      // No files specified - create a single subtask
      subtasks.push({
        id: this.generateId('file', 0),
        title: task,
        description: `Complete task: ${task}`,
        dependencies: [],
        estimatedComplexity: this.estimateComplexity(task),
      });
      return subtasks;
    }

    // Group files by directory for batching
    const fileGroups = this.groupFilesByDirectory(files);
    
    let index = 0;
    for (const [dir, dirFiles] of this.iterateEntries(fileGroups)) {
      // If many files in one directory, create subtasks per file
      if (dirFiles.length > (options?.maxParallelism || 10)) {
        for (const file of dirFiles) {
          subtasks.push({
            id: this.generateId('file', index++),
            title: `${task} - ${file}`,
            description: `Apply changes to ${file} as part of: ${task}`,
            dependencies: [],
            estimatedComplexity: 'low',
            files: [file],
          });
        }
      } else {
        // Group files in same directory
        subtasks.push({
          id: this.generateId('file', index++),
          title: `${task} - ${dir}`,
          description: `Apply changes to files in ${dir}: ${dirFiles.join(', ')}`,
          dependencies: [],
          estimatedComplexity: dirFiles.length > 3 ? 'medium' : 'low',
          files: dirFiles,
        });
      }
    }

    return subtasks;
  }

  private groupFilesByDirectory(files: string[]): Map<string, string[]> {
    const groups = new Map<string, string[]>();
    
    for (const file of files) {
      const dir = file.includes('/') ? file.substring(0, file.lastIndexOf('/')) : 'root';
      if (!groups.has(dir)) {
        groups.set(dir, []);
      }
      groups.get(dir)!.push(file);
    }
    
    return groups;
  }

  private* iterateEntries<K, V>(map: Map<K, V>): Generator<[K, V]> {
    for (const entry of Array.from(map.entries())) {
      yield entry;
    }
  }
}

/**
 * Component-based decomposition strategy
 * Splits tasks by system components/modules
 */
class ComponentBasedStrategy extends DecompositionStrategyBase {
  readonly name = 'component-based' as const;

  async decompose(task: string, context?: TaskContext, options?: DecompositionOptions): Promise<Subtask[]> {
    const components = context?.components || this.extractComponentsFromTask(task);
    const subtasks: Subtask[] = [];

    if (components.length === 0) {
      // No components identified - create a single subtask
      subtasks.push({
        id: this.generateId('comp', 0),
        title: task,
        description: `Complete task: ${task}`,
        dependencies: [],
        estimatedComplexity: this.estimateComplexity(task),
      });
      return subtasks;
    }

    // Define common component dependencies
    const componentDependencies: Record<string, string[]> = {
      'database': [],
      'api': ['database'],
      'service': ['database'],
      'middleware': ['api'],
      'frontend': ['api'],
      'ui': ['frontend'],
      'tests': ['api', 'frontend', 'service'],
      'documentation': ['api', 'frontend'],
    };

    // Create subtasks for each component
    for (let i = 0; i < components.length; i++) {
      const component = components[i];
      const deps = componentDependencies[component.toLowerCase()] || [];
      
      // Map dependency names to subtask IDs
      const depIds = deps
        .map(dep => components.findIndex(c => c.toLowerCase() === dep))
        .filter(idx => idx >= 0 && idx < i)
        .map(idx => subtasks[idx]?.id)
        .filter(Boolean);

      subtasks.push({
        id: this.generateId('comp', i),
        title: `${component}: ${task}`,
        description: `Implement ${component} component for: ${task}`,
        dependencies: depIds,
        estimatedComplexity: this.estimateComponentComplexity(component, task),
        component,
      });
    }

    return subtasks;
  }

  private extractComponentsFromTask(task: string): string[] {
    const componentPatterns = [
      { pattern: /\bapi\b|\bendpoints?\b/gi, name: 'API' },
      { pattern: /\bdatabase\b|\bdb\b|\bstorage\b/gi, name: 'Database' },
      { pattern: /\bfrontend\b|\bui\b|\binterface\b/gi, name: 'Frontend' },
      { pattern: /\bmiddleware\b/gi, name: 'Middleware' },
      { pattern: /\bservice\b|\bservices\b/gi, name: 'Service' },
      { pattern: /\btest\b|\btesting\b/gi, name: 'Tests' },
      { pattern: /\bdocumentation\b|\bdocs\b/gi, name: 'Documentation' },
      { pattern: /\bauth\b|\bauthentication\b/gi, name: 'Authentication' },
    ];

    const found: string[] = [];
    for (const { pattern, name } of componentPatterns) {
      if (pattern.test(task) && !found.includes(name)) {
        found.push(name);
      }
    }

    // Default components if none detected
    if (found.length === 0) {
      return ['Setup', 'Implementation', 'Tests'];
    }

    // Always add tests if not present
    if (!found.includes('Tests') && found.length > 1) {
      found.push('Tests');
    }

    return found;
  }

  private estimateComponentComplexity(component: string, task: string): ComplexityLevel {
    const baseComplexity = this.estimateComplexity(task);
    
    // Component-specific adjustments
    const complexityMultipliers: Record<string, number> = {
      'database': 1.5,
      'authentication': 1.5,
      'middleware': 1.3,
      'api': 1.2,
      'service': 1.2,
      'frontend': 1.0,
      'ui': 0.8,
      'tests': 0.7,
      'documentation': 0.5,
    };

    const multiplier = complexityMultipliers[component.toLowerCase()] || 1.0;
    
    if (multiplier >= 1.3) {
      return baseComplexity === 'low' ? 'medium' : 'high';
    } else if (multiplier <= 0.7) {
      return baseComplexity === 'high' ? 'medium' : 'low';
    }
    
    return baseComplexity;
  }
}

/**
 * Domain-based decomposition strategy
 * Splits tasks by business domains
 */
class DomainBasedStrategy extends DecompositionStrategyBase {
  readonly name = 'domain-based' as const;

  async decompose(task: string, context?: TaskContext, options?: DecompositionOptions): Promise<Subtask[]> {
    const domains = context?.domains || this.extractDomainsFromTask(task);
    const subtasks: Subtask[] = [];

    if (domains.length === 0) {
      subtasks.push({
        id: this.generateId('domain', 0),
        title: task,
        description: `Complete task: ${task}`,
        dependencies: [],
        estimatedComplexity: this.estimateComplexity(task),
      });
      return subtasks;
    }

    // Domain dependencies (shared infrastructure first)
    const domainDependencies: Record<string, string[]> = {
      'user': [],
      'auth': ['user'],
      'billing': ['user'],
      'payment': ['billing', 'user'],
      'product': [],
      'catalog': ['product'],
      'inventory': ['product'],
      'order': ['user', 'product', 'inventory'],
      'shipping': ['order'],
      'notification': ['user'],
      'analytics': ['user', 'order'],
    };

    for (let i = 0; i < domains.length; i++) {
      const domain = domains[i];
      const deps = domainDependencies[domain.toLowerCase()] || [];
      
      const depIds = deps
        .map(dep => domains.findIndex(d => d.toLowerCase() === dep))
        .filter(idx => idx >= 0 && idx < i)
        .map(idx => subtasks[idx]?.id)
        .filter(Boolean);

      subtasks.push({
        id: this.generateId('domain', i),
        title: `${domain}: ${task}`,
        description: `Implement ${domain} domain functionality for: ${task}`,
        dependencies: depIds,
        estimatedComplexity: this.estimateComplexity(`${task} in ${domain}`),
        domain,
      });
    }

    return subtasks;
  }

  private extractDomainsFromTask(task: string): string[] {
    const domainPatterns = [
      { pattern: /\buser\b|\baccount\b|\bprofile\b/gi, name: 'User' },
      { pattern: /\bauth\b|\bauthentication\b|\bauthorization\b/gi, name: 'Auth' },
      { pattern: /\bproduct\b|\bcatalog\b|\binventory\b/gi, name: 'Product' },
      { pattern: /\border\b|\bpurchase\b/gi, name: 'Order' },
      { pattern: /\bpayment\b|\bbilling\b|\bcheckout\b/gi, name: 'Payment' },
      { pattern: /\bshipping\b|\bdelivery\b/gi, name: 'Shipping' },
      { pattern: /\bnotification\b|\bemail\b|\balert\b/gi, name: 'Notification' },
      { pattern: /\banalytics\b|\breport\b|\bmetric\b/gi, name: 'Analytics' },
      { pattern: /\be-commerce\b|\bcommerce\b|\bstore\b/gi, name: 'Commerce' },
    ];

    const found: string[] = [];
    for (const { pattern, name } of domainPatterns) {
      if (pattern.test(task) && !found.includes(name)) {
        found.push(name);
      }
    }

    return found.length > 0 ? found : ['Core'];
  }
}

/**
 * LLM-assisted decomposition strategy
 * Uses AI to intelligently decompose complex tasks
 */
class LLMAssistedStrategy extends DecompositionStrategyBase {
  readonly name = 'llm-assisted' as const;

  async decompose(task: string, context?: TaskContext, options?: DecompositionOptions): Promise<Subtask[]> {
    const prompt = this.buildDecompositionPrompt(task, context);
    
    try {
      const response = await quickComplete(prompt);
      return this.parseLLMResponse(response, task);
    } catch (error) {
      logger.warn('LLM decomposition failed, falling back to component-based strategy', { error, task });
      
      // Fallback to component-based strategy
      const fallback = new ComponentBasedStrategy();
      return fallback.decompose(task, context, options);
    }
  }

  private buildDecompositionPrompt(task: string, context?: TaskContext): string {
    let prompt = `Decompose the following task into parallel subtasks:

Task: "${task}"

Requirements:
1. Each subtask should be independent and actionable
2. Identify explicit dependencies between subtasks
3. Estimate complexity (low/medium/high) for each subtask
4. Maximum 10 subtasks for optimal parallelization

Output format - JSON array:
[
  {
    "title": "Brief title",
    "description": "Detailed description of what to do",
    "dependencies": ["index of dependency subtask (0-based)"],
    "complexity": "low|medium|high",
    "component": "optional component name"
  }
]`;

    if (context?.files?.length) {
      prompt += `\n\nRelevant files:\n${context.files.join('\n')}`;
    }

    if (context?.components?.length) {
      prompt += `\n\nExisting components:\n${context.components.join('\n')}`;
    }

    if (context?.domains?.length) {
      prompt += `\n\nBusiness domains:\n${context.domains.join('\n')}`;
    }

    return prompt;
  }

  private parseLLMResponse(response: string, originalTask: string): Subtask[] {
    try {
      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/) || 
                        response.match(/(\[[\s\S]*\])/);
      
      const jsonStr = jsonMatch ? jsonMatch[1] || jsonMatch[0] : response;
      const parsed = JSON.parse(jsonStr);

      if (!Array.isArray(parsed)) {
        throw new Error('Response is not an array');
      }

      const subtasks: Subtask[] = parsed.map((item, index) => {
        const id = this.generateId('llm', index);
        
        // Convert dependency indices to IDs
        const dependencyIndices = Array.isArray(item.dependencies) ? item.dependencies : [];
        const dependencies = dependencyIndices
          .filter((idx: number) => idx >= 0 && idx < index)
          .map((idx: number) => subtasks[idx]?.id)
          .filter(Boolean);

        return {
          id,
          title: item.title || `Subtask ${index + 1}`,
          description: item.description || item.title || '',
          dependencies,
          estimatedComplexity: this.validateComplexity(item.complexity),
          component: item.component,
          files: item.files,
        };
      });

      return subtasks;
    } catch (error) {
      logger.error('Failed to parse LLM decomposition response', { error, response });
      throw new Error(`Failed to parse LLM response: ${error}`);
    }
  }

  private validateComplexity(complexity: string): ComplexityLevel {
    const valid: ComplexityLevel[] = ['low', 'medium', 'high'];
    return valid.includes(complexity as ComplexityLevel) ? (complexity as ComplexityLevel) : 'medium';
  }
}

// ============================================================================
// Dependency Graph Functions
// ============================================================================

/**
 * Build a DAG from subtasks
 */
export function buildDependencyGraph(subtasks: Subtask[]): DAG {
  const edges = new Map<string, string[]>();
  const reverseEdges = new Map<string, string[]>();

  // Initialize maps
  for (const subtask of subtasks) {
    edges.set(subtask.id, []);
    reverseEdges.set(subtask.id, []);
  }

  // Build edges
  for (const subtask of subtasks) {
    for (const depId of subtask.dependencies) {
      // depId must complete before subtask (depId -> subtask)
      if (edges.has(depId)) {
        edges.get(depId)!.push(subtask.id);
      }
      if (reverseEdges.has(subtask.id)) {
        reverseEdges.get(subtask.id)!.push(depId);
      }
    }
  }

  return { nodes: subtasks, edges, reverseEdges };
}

/**
 * Detect cycles in the dependency graph
 */
export function detectCycle(dag: DAG): string[] | null {
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function dfs(nodeId: string, path: string[]): string[] | null {
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

    const dependents = dag.edges.get(nodeId) || [];
    for (const dependent of dependents) {
      const cycle = dfs(dependent, path);
      if (cycle) return cycle;
    }

    path.pop();
    recursionStack.delete(nodeId);
    return null;
  }

  for (const node of dag.nodes) {
    const cycle = dfs(node.id, []);
    if (cycle) return cycle;
  }

  return null;
}

/**
 * Get execution order as levels of parallel subtasks
 * Uses Kahn's algorithm for topological sort with level tracking
 */
export function getExecutionOrder(dag: DAG): Subtask[][] {
  const inDegree = new Map<string, number>();
  const nodeMap = new Map(dag.nodes.map(n => [n.id, n]));

  // Calculate in-degrees
  for (const node of dag.nodes) {
    inDegree.set(node.id, dag.reverseEdges.get(node.id)?.length || 0);
  }

  const levels: Subtask[][] = [];
  let currentLevel: Subtask[] = [];

  // Find all nodes with no dependencies
  for (const [nodeId, degree] of inDegree) {
    if (degree === 0) {
      const node = nodeMap.get(nodeId);
      if (node) currentLevel.push(node);
    }
  }

  while (currentLevel.length > 0) {
    levels.push(currentLevel);
    const nextLevel: Subtask[] = [];

    for (const node of currentLevel) {
      const dependents = dag.edges.get(node.id) || [];
      for (const dependentId of dependents) {
        const newDegree = (inDegree.get(dependentId) || 0) - 1;
        inDegree.set(dependentId, newDegree);
        if (newDegree === 0) {
          const dependent = nodeMap.get(dependentId);
          if (dependent) nextLevel.push(dependent);
        }
      }
    }

    currentLevel = nextLevel;
  }

  return levels;
}

/**
 * Calculate parallelization ratio (0-1) where 1 means all tasks can run in parallel
 */
export function calculateParallelizationRatio(subtasks: Subtask[], levels: Subtask[][]): number {
  if (subtasks.length === 0) return 0;
  if (subtasks.length === 1) return 0; // Single task has no parallelization

  const avgTasksPerLevel = subtasks.length / levels.length;
  const maxParallel = Math.max(...levels.map(l => l.length));
  
  // Ratio based on how many tasks can run in parallel vs total
  return Math.min(1, (maxParallel - 1) / (subtasks.length - 1));
}

// ============================================================================
// Task Decomposer Class
// ============================================================================

/**
 * Main TaskDecomposer class
 * Orchestrates task decomposition using various strategies
 */
export class TaskDecomposer {
  private strategies: Map<DecompositionStrategy, DecompositionStrategyBase>;

  constructor() {
    this.strategies = new Map<DecompositionStrategy, DecompositionStrategyBase>([
      ['file-based', new FileBasedStrategy()],
      ['component-based', new ComponentBasedStrategy()],
      ['domain-based', new DomainBasedStrategy()],
      ['llm-assisted', new LLMAssistedStrategy()],
    ]);
  }

  /**
   * Decompose a task into parallelizable subtasks
   */
  async decompose(
    task: string,
    context?: TaskContext,
    options: Partial<DecompositionOptions> = {}
  ): Promise<DecompositionResult> {
    const mergedOptions: DecompositionOptions = {
      ...DEFAULT_DECOMPOSITION_OPTIONS,
      ...options,
    };

    logger.info('Decomposing task', { task, strategy: mergedOptions.strategy });

    // Select strategy
    let strategy: DecompositionStrategy = mergedOptions.strategy;
    
    // Override with LLM if explicitly requested
    if (mergedOptions.useLLM) {
      strategy = 'llm-assisted';
    }

    const strategyImpl = this.strategies.get(strategy);
    if (!strategyImpl) {
      throw new Error(`Unknown decomposition strategy: ${strategy}`);
    }

    // Execute decomposition
    const startTime = Date.now();
    const subtasks = await strategyImpl.decompose(task, context, mergedOptions);
    const decompositionTime = Date.now() - startTime;

    // Apply parallelism limits
    const limitedSubtasks = this.applyParallelismLimit(subtasks, mergedOptions.maxParallelism);

    // Build dependency graph
    const dag = buildDependencyGraph(limitedSubtasks);

    // Detect cycles
    const cycle = detectCycle(dag);
    if (cycle) {
      logger.error('Dependency cycle detected', { cycle });
      throw new Error(`Dependency cycle detected: ${cycle.join(' -> ')}`);
    }

    // Get execution order
    const executionLevels = getExecutionOrder(dag);

    // Calculate metrics
    const totalComplexity = this.aggregateComplexity(limitedSubtasks);
    const parallelizationRatio = calculateParallelizationRatio(limitedSubtasks, executionLevels);

    logger.info('Task decomposition complete', {
      subtaskCount: limitedSubtasks.length,
      levelCount: executionLevels.length,
      decompositionTime,
      parallelizationRatio,
    });

    return {
      subtasks: limitedSubtasks,
      dag,
      executionLevels,
      totalComplexity,
      parallelizationRatio,
      strategyUsed: strategy,
      decomposedAt: new Date(),
    };
  }

  /**
   * Get available decomposition strategies
   */
  getAvailableStrategies(): DecompositionStrategy[] {
    return Array.from(this.strategies.keys());
  }

  /**
   * Register a custom decomposition strategy
   */
  registerStrategy(strategy: DecompositionStrategyBase): void {
    this.strategies.set(strategy.name, strategy);
  }

  private applyParallelismLimit(subtasks: Subtask[], maxParallelism: number): Subtask[] {
    if (subtasks.length <= maxParallelism) {
      return subtasks;
    }

    // Group subtasks by dependency level and batch them
    const dag = buildDependencyGraph(subtasks);
    const levels = getExecutionOrder(dag);

    const batchedSubtasks: Subtask[] = [];
    let id = 0;

    for (const level of levels) {
      if (level.length <= maxParallelism) {
        batchedSubtasks.push(...level);
      } else {
        // Batch subtasks in this level
        const batchSize = Math.ceil(level.length / Math.ceil(level.length / maxParallelism));
        for (let i = 0; i < level.length; i += batchSize) {
          const batch = level.slice(i, i + batchSize);
          if (batch.length === 1) {
            batchedSubtasks.push(batch[0]);
          } else {
            // Merge batch into single subtask
            batchedSubtasks.push({
              id: `batch-${id++}`,
              title: `Batch: ${batch[0].title} + ${batch.length - 1} more`,
              description: `Combined subtasks:\n${batch.map(b => `- ${b.title}: ${b.description}`).join('\n')}`,
              dependencies: batch[0].dependencies,
              estimatedComplexity: this.aggregateComplexity(batch),
              files: batch.flatMap(b => b.files || []),
            });
          }
        }
      }
    }

    return batchedSubtasks.slice(0, maxParallelism);
  }

  private aggregateComplexity(subtasks: Subtask[]): ComplexityLevel {
    const counts = { low: 0, medium: 0, high: 0 };
    for (const subtask of subtasks) {
      counts[subtask.estimatedComplexity]++;
    }

    // Weighted scoring
    const score = counts.low * 1 + counts.medium * 2 + counts.high * 3;
    const avgScore = score / subtasks.length;

    if (avgScore >= 2.5) return 'high';
    if (avgScore >= 1.5) return 'medium';
    return 'low';
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create a simple decomposition for quick tasks
 */
export async function quickDecompose(
  task: string,
  complexity: ComplexityLevel = 'medium'
): Promise<Subtask[]> {
  const decomposer = new TaskDecomposer();
  const result = await decomposer.decompose(task, undefined, {
    strategy: 'component-based',
    maxParallelism: 5,
    minSubtaskSize: 1,
  });

  // Override complexity if specified
  if (complexity) {
    for (const subtask of result.subtasks) {
      subtask.estimatedComplexity = complexity;
    }
  }

  return result.subtasks;
}

/**
 * Validate a decomposition result
 */
export function validateDecomposition(result: DecompositionResult): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check for empty decomposition
  if (result.subtasks.length === 0) {
    errors.push('No subtasks generated');
  }

  // Check for duplicate IDs
  const ids = result.subtasks.map(s => s.id);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicates.length > 0) {
    errors.push(`Duplicate subtask IDs: ${duplicates.join(', ')}`);
  }

  // Check for invalid dependencies
  for (const subtask of result.subtasks) {
    for (const depId of subtask.dependencies) {
      if (!ids.includes(depId)) {
        errors.push(`Subtask ${subtask.id} has invalid dependency: ${depId}`);
      }
    }
  }

  // Check for cycles
  const cycle = detectCycle(result.dag);
  if (cycle) {
    errors.push(`Dependency cycle detected: ${cycle.join(' -> ')}`);
  }

  return { valid: errors.length === 0, errors };
}

// ============================================================================
// Exports
// ============================================================================

export {
  FileBasedStrategy,
  ComponentBasedStrategy,
  DomainBasedStrategy,
  LLMAssistedStrategy,
};
