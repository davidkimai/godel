/**
 * OOLONG Executor - Standalone module (no Jest dependencies)
 * Extracted from test file for benchmark use
 */

// OOLONG Task Types
export interface OOLONGTask {
  id: string;
  type: 'recursive' | 'parallel' | 'sequential';
  description: string;
  complexity: 'linear' | 'quadratic' | 'exponential';
  input: unknown;
  expectedOutput?: unknown;
}

export interface OOLONGResult {
  taskId: string;
  output: unknown;
  executionTimeMs: number;
  agentCalls: number;
  decompositionDepth: number;
  success: boolean;
}

// RLM Agent implementation for OOLONG
export class RLMExecutor {
  private metrics = {
    totalCalls: 0,
    decompositionCalls: 0,
    maxDepth: 0,
  };

  async execute(task: OOLONGTask, depth = 0): Promise<OOLONGResult> {
    this.metrics.totalCalls++;
    this.metrics.maxDepth = Math.max(this.metrics.maxDepth, depth);

    const startTime = Date.now();

    try {
      let output: unknown;

      switch (task.type) {
        case 'recursive':
          output = await this.handleRecursive(task, depth);
          break;
        case 'parallel':
          output = await this.handleParallel(task, depth);
          break;
        case 'sequential':
          output = await this.handleSequential(task, depth);
          break;
        default:
          throw new Error(`Unknown task type: ${task.type}`);
      }

      return {
        taskId: task.id,
        output,
        executionTimeMs: Date.now() - startTime,
        agentCalls: this.metrics.totalCalls,
        decompositionDepth: depth,
        success: true,
      };
    } catch (error) {
      return {
        taskId: task.id,
        output: error,
        executionTimeMs: Date.now() - startTime,
        agentCalls: this.metrics.totalCalls,
        decompositionDepth: depth,
        success: false,
      };
    }
  }

  private async handleRecursive(task: OOLONGTask, depth: number): Promise<unknown> {
    const input = task.input as { items: unknown[]; operation: string };
    
    // Base case: small enough to process directly
    if (input.items.length <= 2) {
      return this.processItems(input.items, input.operation);
    }

    // Recursive case: split and process
    this.metrics.decompositionCalls++;
    const mid = Math.floor(input.items.length / 2);
    
    const leftTask: OOLONGTask = {
      id: `${task.id}-L`,
      type: 'recursive',
      description: `${task.description} (left)`,
      complexity: task.complexity,
      input: { items: input.items.slice(0, mid), operation: input.operation },
    };
    
    const rightTask: OOLONGTask = {
      id: `${task.id}-R`,
      type: 'recursive',
      description: `${task.description} (right)`,
      complexity: task.complexity,
      input: { items: input.items.slice(mid), operation: input.operation },
    };

    // Parallel execution of subtasks
    const [leftResult, rightResult] = await Promise.all([
      this.execute(leftTask, depth + 1),
      this.execute(rightTask, depth + 1),
    ]);

    // Merge results
    return this.mergeResults(leftResult.output, rightResult.output, input.operation);
  }

  private async handleParallel(task: OOLONGTask, depth: number): Promise<unknown> {
    const input = task.input as { items: unknown[]; operation: string; chunkSize?: number };
    const chunkSize = input.chunkSize || 10;

    // Split into chunks
    const chunks: unknown[][] = [];
    for (let i = 0; i < input.items.length; i += chunkSize) {
      chunks.push(input.items.slice(i, i + chunkSize));
    }

    // Process chunks in parallel
    const chunkTasks = chunks.map((chunk, idx) => {
      const chunkTask: OOLONGTask = {
        id: `${task.id}-chunk-${idx}`,
        type: 'sequential',
        description: `${task.description} chunk ${idx}`,
        complexity: task.complexity,
        input: { items: chunk, operation: input.operation },
      };
      return this.execute(chunkTask, depth + 1);
    });

    const results = await Promise.all(chunkTasks);
    return results.map(r => r.output);
  }

  private async handleSequential(task: OOLONGTask, depth: number): Promise<unknown> {
    const input = task.input as { items: unknown[]; operation: string };
    return this.processItems(input.items, input.operation);
  }

  private processItems(items: unknown[], operation: string): unknown {
    switch (operation) {
      case 'sum':
        return (items as number[]).reduce((a, b) => (a as number) + (b as number), 0);
      case 'concat':
        return (items as string[]).join('');
      case 'max':
        return Math.max(...(items as number[]));
      case 'count':
        return items.length;
      case 'sort':
        return [...items].sort((a: unknown, b: unknown) => (a as number) - (b as number));
      default:
        return items;
    }
  }

  private mergeResults(left: unknown, right: unknown, operation: string): unknown {
    switch (operation) {
      case 'sum':
        return (left as number) + (right as number);
      case 'concat':
        return (left as string) + (right as string);
      case 'max':
        return Math.max(left as number, right as number);
      default:
        return [left, right];
    }
  }

  getMetrics() {
    return { ...this.metrics };
  }

  resetMetrics() {
    this.metrics = {
      totalCalls: 0,
      decompositionCalls: 0,
      maxDepth: 0,
    };
  }
}
