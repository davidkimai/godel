/**
 * @fileoverview Base Handler - Abstract base class for intent handlers
 * 
 * Provides common functionality for all intent handlers including:
 * - Validation utilities
 * - Metrics tracking
 * - Common response formatting
 * 
 * @module @godel/intent/handlers/base
 */

import {
  Intent,
  IntentHandler,
  IntentAction,
  HandlerResult,
  IntentConstraints,
} from '../types';
import { createLogger } from '../../utils/logger';

/**
 * Base handler providing common functionality for all intent handlers.
 * All concrete handlers should extend this class.
 */
export abstract class BaseIntentHandler implements IntentHandler {
  /** Handler identifier - must be set by subclass */
  abstract readonly action: IntentAction;
  
  /** Handler display name - must be set by subclass */
  abstract readonly name: string;
  
  /** Handler description - must be set by subclass */
  abstract readonly description: string;
  
  /** Logger instance - initialized lazily */
  private _log: ReturnType<typeof createLogger> | undefined;
  
  /**
   * Get the logger instance.
   * Lazy initialization to avoid accessing abstract properties in constructor.
   */
  protected get log(): ReturnType<typeof createLogger> {
    if (!this._log) {
      this._log = createLogger(`handler-${this.action}`);
    }
    return this._log;
  }

  /**
   * Execute the handler for the given intent.
   * Subclasses should override doExecute for actual implementation.
   * 
   * @param intent - Intent to execute
   * @returns Handler result
   */
  async execute(intent: Intent): Promise<HandlerResult> {
    const startTime = Date.now();
    
    this.log.info(`Executing ${this.name}`, {
      action: intent.action,
      target: intent.target,
    });
    
    try {
      // Validate before execution
      const validation = this.validate(intent);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error,
          metrics: { durationMs: Date.now() - startTime },
        };
      }
      
      // Execute handler-specific logic
      const result = await this.doExecute(intent);
      
      // Ensure metrics are set
      return {
        ...result,
        metrics: {
          ...result.metrics,
          durationMs: result.metrics?.durationMs ?? Date.now() - startTime,
        },
      };
      
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log.error(`Execution failed: ${message}`);
      
      return {
        success: false,
        error: message,
        metrics: { durationMs: Date.now() - startTime },
      };
    }
  }

  /**
   * Validate if this handler can process the intent.
   * Checks action type match and required fields.
   * 
   * @param intent - Intent to validate
   * @returns True if can handle
   */
  canHandle(intent: Intent): boolean {
    // Must match action type
    if (intent.action !== this.action) {
      return false;
    }
    
    // Must have a target
    if (!intent.target || intent.target.trim().length === 0) {
      return false;
    }
    
    // Run additional validation
    const validation = this.validate(intent);
    return validation.valid;
  }

  /**
   * Validate intent structure.
   * 
   * @param intent - Intent to validate
   * @returns Validation result
   */
  protected validate(intent: Intent): { valid: boolean; error?: string } {
    // Check action matches
    if (intent.action !== this.action) {
      return {
        valid: false,
        error: `Action mismatch: expected ${this.action}, got ${intent.action}`,
      };
    }
    
    // Check target exists
    if (!intent.target || intent.target.trim().length === 0) {
      return {
        valid: false,
        error: 'Target is required',
      };
    }
    
    // Run subclass-specific validation
    return this.doValidate(intent);
  }

  /**
   * Subclass-specific validation.
   * Override to add custom validation logic.
   * 
   * @param intent - Intent to validate
   * @returns Validation result
   */
  protected doValidate(intent: Intent): { valid: boolean; error?: string } {
    // Default: always valid
    return { valid: true };
  }

  /**
   * Subclass-specific execution logic.
   * Must be implemented by subclasses.
   * 
   * @param intent - Intent to execute
   * @returns Handler result
   */
  protected abstract doExecute(intent: Intent): Promise<HandlerResult>;

  /**
   * Create a success result.
   * 
   * @param data - Optional result data
   * @param message - Optional success message
   * @returns Success handler result
   */
  protected success(data?: Record<string, unknown>, message?: string): HandlerResult {
    return {
      success: true,
      data,
      metrics: { durationMs: 0 },
    };
  }

  /**
   * Create a failure result.
   * 
   * @param error - Error message
   * @returns Failure handler result
   */
  protected failure(error: string): HandlerResult {
    return {
      success: false,
      error,
      metrics: { durationMs: 0 },
    };
  }

  /**
   * Check if constraints are within limits.
   * 
   * @param constraints - Constraints to check
   * @param limits - Limits to enforce
   * @returns Constraint check result
   */
  protected checkConstraints(
    constraints: IntentConstraints | undefined,
    limits: { maxBudget?: number; maxTime?: number; maxTeamSize?: number }
  ): { valid: boolean; violations: string[] } {
    const violations: string[] = [];
    
    if (constraints?.budget && limits.maxBudget && constraints.budget > limits.maxBudget) {
      violations.push(`Budget ${constraints.budget} exceeds maximum ${limits.maxBudget}`);
    }
    
    if (constraints?.timeLimit && limits.maxTime && constraints.timeLimit > limits.maxTime) {
      violations.push(`Time limit ${constraints.timeLimit} exceeds maximum ${limits.maxTime}`);
    }
    
    if (constraints?.teamSize && limits.maxTeamSize && constraints.teamSize > limits.maxTeamSize) {
      violations.push(`Team size ${constraints.teamSize} exceeds maximum ${limits.maxTeamSize}`);
    }
    
    return {
      valid: violations.length === 0,
      violations,
    };
  }

  /**
   * Format a task description for the target.
   * 
   * @param intent - Intent
   * @returns Formatted task description
   */
  protected formatTask(intent: Intent): string {
    const actionVerb = this.action.charAt(0).toUpperCase() + this.action.slice(1);
    return `${actionVerb} ${intent.target}`;
  }
}
