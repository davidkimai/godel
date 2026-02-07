/**
 * @fileoverview Refactor Handler - Handles code refactoring intents
 * 
 * The refactor handler processes intents to restructure, modernize,
 * and improve existing code without changing external behavior.
 * 
 * Supported patterns:
 * - "refactor the auth module"
 * - "rewrite the database layer"
 * - "cleanup legacy code in src/old"
 * 
 * @module @godel/intent/handlers/refactor
 */

import { Intent, HandlerResult, IntentAction } from '../types';
import { BaseIntentHandler } from './base';

/**
 * Refactoring strategy options.
 */
export type RefactoringStrategy = 
  | 'extract-method'
  | 'rename'
  | 'inline'
  | 'move'
  | 'modernize'
  | 'decouple'
  | 'simplify';

/**
 * Refactoring intent with additional context.
 */
export interface RefactoringIntent extends Intent {
  /** Specific refactoring strategy to use */
  strategy?: RefactoringStrategy;
  
  /** Whether to maintain backward compatibility */
  preserveApi?: boolean;
  
  /** Code quality goals */
  goals?: string[];
}

/**
 * Handler for refactoring intents.
 * 
 * Routes refactoring tasks to appropriate sub-handlers based on:
 * - Target type (file, module, function)
 * - Refactoring strategy
 * - Code complexity
 */
export class RefactorHandler extends BaseIntentHandler {
  readonly action: IntentAction = 'refactor';
  readonly name = 'Refactor Handler';
  readonly description = 'Restructures and improves existing code while preserving behavior';

  /**
   * Validation specific to refactoring intents.
   */
  protected doValidate(intent: Intent): { valid: boolean; error?: string } {
    const refactorIntent = intent as RefactoringIntent;
    
    // Check for valid refactoring target
    const target = intent.target.toLowerCase();
    
    // Prevent refactoring of critical system files
    const protectedPatterns = ['node_modules', '.git', 'dist', 'build'];
    for (const pattern of protectedPatterns) {
      if (target.includes(pattern)) {
        return {
          valid: false,
          error: `Cannot refactor protected directory: ${pattern}`,
        };
      }
    }
    
    // Validate strategy if provided
    const validStrategies: RefactoringStrategy[] = [
      'extract-method', 'rename', 'inline', 'move', 'modernize', 'decouple', 'simplify'
    ];
    
    if (refactorIntent.strategy && !validStrategies.includes(refactorIntent.strategy)) {
      return {
        valid: false,
        error: `Unknown refactoring strategy: ${refactorIntent.strategy}`,
      };
    }
    
    return { valid: true };
  }

  /**
   * Execute refactoring intent.
   */
  protected async doExecute(intent: Intent): Promise<HandlerResult> {
    const refactorIntent = intent as RefactoringIntent;
    
    this.log.info('Planning refactoring', {
      target: intent.target,
      strategy: refactorIntent.strategy,
      preserveApi: refactorIntent.preserveApi,
    });
    
    // Detect refactoring strategy if not specified
    const strategy = refactorIntent.strategy ?? this.detectStrategy(intent.target);
    
    // Generate refactoring plan
    const plan = this.generatePlan(intent, strategy);
    
    // Estimate effort
    const estimation = this.estimateEffort(intent.target, strategy);
    
    this.log.info('Refactoring plan generated', {
      strategy,
      phases: plan.phases.length,
      estimatedMinutes: estimation.minutes,
    });
    
    // Return plan (actual execution would involve spawning agents)
    return this.success({
      plan,
      estimation,
      strategy,
      target: intent.target,
      preserveApi: refactorIntent.preserveApi ?? true,
      goals: refactorIntent.goals ?? ['improve readability', 'reduce complexity'],
    });
  }

  /**
   * Detect the appropriate refactoring strategy from the target.
   */
  private detectStrategy(target: string): RefactoringStrategy {
    const lower = target.toLowerCase();
    
    if (lower.includes('legacy') || lower.includes('old')) {
      return 'modernize';
    }
    if (lower.includes('coupled') || lower.includes('dependency')) {
      return 'decouple';
    }
    if (lower.includes('complex') || lower.includes('complicated')) {
      return 'simplify';
    }
    if (lower.includes('rename')) {
      return 'rename';
    }
    
    // Default strategy
    return 'simplify';
  }

  /**
   * Generate a refactoring plan.
   */
  private generatePlan(intent: Intent, strategy: RefactoringStrategy): {
    phases: string[];
    checkpoints: string[];
    rollbackPoints: string[];
  } {
    const phases: string[] = [];
    const checkpoints: string[] = [];
    const rollbackPoints: string[] = [];
    
    // Common phases for all refactorings
    phases.push('Analyze current code structure and dependencies');
    phases.push(`Apply ${strategy} refactoring strategy`);
    phases.push('Run tests to verify behavior preservation');
    phases.push('Update documentation and comments');
    
    // Strategy-specific phases
    switch (strategy) {
      case 'modernize':
        phases.push('Update syntax to modern standards');
        phases.push('Replace deprecated APIs');
        break;
      case 'decouple':
        phases.push('Extract interfaces');
        phases.push('Implement dependency injection');
        break;
      case 'simplify':
        phases.push('Remove dead code');
        phases.push('Consolidate duplicate logic');
        break;
      case 'extract-method':
        phases.push('Identify code blocks for extraction');
        phases.push('Create new method signatures');
        break;
    }
    
    checkpoints.push('Pre-refactoring tests pass');
    checkpoints.push('Compilation successful');
    checkpoints.push('Post-refactoring tests pass');
    
    rollbackPoints.push('Git commit before refactoring');
    rollbackPoints.push('Backup of modified files');
    
    return { phases, checkpoints, rollbackPoints };
  }

  /**
   * Estimate refactoring effort.
   */
  private estimateEffort(target: string, strategy: RefactoringStrategy): {
    minutes: number;
    complexity: 'low' | 'medium' | 'high';
    agents: number;
  } {
    // Base estimates by strategy
    const baseEstimates: Record<RefactoringStrategy, { minutes: number; complexity: 'low' | 'medium' | 'high' }> = {
      'extract-method': { minutes: 15, complexity: 'low' },
      'rename': { minutes: 10, complexity: 'low' },
      'inline': { minutes: 15, complexity: 'low' },
      'move': { minutes: 20, complexity: 'medium' },
      'modernize': { minutes: 60, complexity: 'medium' },
      'decouple': { minutes: 120, complexity: 'high' },
      'simplify': { minutes: 45, complexity: 'medium' },
    };
    
    const base = baseEstimates[strategy];
    
    // Adjust based on target size indicators
    const lower = target.toLowerCase();
    if (lower.includes('module') || lower.includes('system')) {
      base.minutes *= 2;
      base.complexity = base.complexity === 'low' ? 'medium' : 'high';
    }
    if (lower.includes('all') || lower.includes('entire')) {
      base.minutes *= 3;
      base.complexity = 'high';
    }
    
    // Determine agent count based on complexity
    const agents = base.complexity === 'high' ? 3 : base.complexity === 'medium' ? 2 : 1;
    
    return {
      minutes: base.minutes,
      complexity: base.complexity,
      agents,
    };
  }
}
