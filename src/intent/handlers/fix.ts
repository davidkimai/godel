/**
 * @fileoverview Fix Handler - Handles bug fixing intents
 * 
 * The fix handler processes intents to resolve bugs, errors,
 * and issues in the codebase.
 * 
 * Supported patterns:
 * - "fix bug in authentication"
 * - "resolve issue #123"
 * - "debug failing tests"
 * 
 * @module @godel/intent/handlers/fix
 */

import { Intent, HandlerResult, IntentAction } from '../types';
import { BaseIntentHandler } from './base';

/**
 * Fix severity levels.
 */
export type FixSeverity = 'critical' | 'high' | 'medium' | 'low';

/**
 * Fix category for organizing bug fixes.
 */
export type FixCategory = 
  | 'logic-error'
  | 'type-error'
  | 'runtime-error'
  | 'performance-issue'
  | 'security-issue'
  | 'ui-bug'
  | 'integration-failure';

/**
 * Fix intent with additional context.
 */
export interface FixIntent extends Intent {
  /** Severity of the bug */
  severity?: FixSeverity;
  
  /** Category of the bug */
  category?: FixCategory;
  
  /** Error message or description */
  errorDetails?: string;
  
  /** Steps to reproduce */
  reproductionSteps?: string[];
  
  /** Related issue/bug ID */
  issueId?: string;
}

/**
 * Handler for fix intents.
 * 
 * Processes bug fixing requests through a systematic approach:
 * 1. Analyze and reproduce the bug
 * 2. Identify root cause
 * 3. Implement fix
 * 4. Verify with tests
 */
export class FixHandler extends BaseIntentHandler {
  readonly action: IntentAction = 'fix';
  readonly name = 'Fix Handler';
  readonly description = 'Resolves bugs, errors, and issues in code';

  /**
   * Validation specific to fix intents.
   */
  protected doValidate(intent: Intent): { valid: boolean; error?: string } {
    const fixIntent = intent as FixIntent;
    
    // Validate severity if provided
    const validSeverities: FixSeverity[] = ['critical', 'high', 'medium', 'low'];
    if (fixIntent.severity && !validSeverities.includes(fixIntent.severity)) {
      return {
        valid: false,
        error: `Unknown severity: ${fixIntent.severity}`,
      };
    }
    
    // Validate category if provided
    const validCategories: FixCategory[] = [
      'logic-error', 'type-error', 'runtime-error', 'performance-issue',
      'security-issue', 'ui-bug', 'integration-failure'
    ];
    if (fixIntent.category && !validCategories.includes(fixIntent.category)) {
      return {
        valid: false,
        error: `Unknown category: ${fixIntent.category}`,
      };
    }
    
    return { valid: true };
  }

  /**
   * Execute fix intent.
   */
  protected async doExecute(intent: Intent): Promise<HandlerResult> {
    const fixIntent = intent as FixIntent;
    
    this.log.info('Planning bug fix', {
      target: intent.target,
      severity: fixIntent.severity,
      category: fixIntent.category,
      issueId: fixIntent.issueId,
    });
    
    // Detect severity and category if not specified
    const severity = fixIntent.severity ?? this.detectSeverity(intent.target, fixIntent);
    const category = fixIntent.category ?? this.detectCategory(intent.target);
    
    // Generate fix plan
    const plan = this.generatePlan(intent, severity, category);
    
    // Estimate effort
    const estimation = this.estimateEffort(severity, category);
    
    this.log.info('Fix plan generated', {
      severity,
      category,
      phases: plan.phases.length,
      estimatedMinutes: estimation.minutes,
    });
    
    return this.success({
      plan,
      estimation,
      severity,
      category,
      target: intent.target,
      issueId: fixIntent.issueId,
      errorDetails: fixIntent.errorDetails,
      reproductionSteps: fixIntent.reproductionSteps,
    });
  }

  /**
   * Detect severity from intent context.
   */
  private detectSeverity(target: string, fixIntent: FixIntent): FixSeverity {
    const lower = target.toLowerCase();
    
    // Check for critical indicators
    const criticalTerms = ['crash', 'security', 'data loss', 'corruption', 'critical', 'outage'];
    for (const term of criticalTerms) {
      if (lower.includes(term)) return 'critical';
    }
    
    // Check for high severity indicators
    const highTerms = ['broken', 'failing', 'error', 'exception', 'high priority'];
    for (const term of highTerms) {
      if (lower.includes(term)) return 'high';
    }
    
    // Check error details if available
    if (fixIntent.errorDetails) {
      const errorLower = fixIntent.errorDetails.toLowerCase();
      if (criticalTerms.some(t => errorLower.includes(t))) return 'critical';
      if (highTerms.some(t => errorLower.includes(t))) return 'high';
    }
    
    // Check for low priority indicators
    if (lower.includes('minor') || lower.includes('cosmetic') || lower.includes('typo')) {
      return 'low';
    }
    
    // Default to medium
    return 'medium';
  }

  /**
   * Detect category from intent.
   */
  private detectCategory(target: string): FixCategory {
    const lower = target.toLowerCase();
    
    // Check for specific category indicators
    if (lower.includes('type') || lower.includes('typescript') || lower.includes('typecheck')) {
      return 'type-error';
    }
    if (lower.includes('performance') || lower.includes('slow') || lower.includes('memory') || lower.includes('cpu')) {
      return 'performance-issue';
    }
    if (lower.includes('security') || lower.includes('vulnerability') || lower.includes('xss') || lower.includes('injection')) {
      return 'security-issue';
    }
    if (lower.includes('ui') || lower.includes('interface') || lower.includes('button') || lower.includes('display')) {
      return 'ui-bug';
    }
    if (lower.includes('integration') || lower.includes('api') || lower.includes('service')) {
      return 'integration-failure';
    }
    if (lower.includes('runtime') || lower.includes('exception') || lower.includes('crash')) {
      return 'runtime-error';
    }
    
    // Default
    return 'logic-error';
  }

  /**
   * Generate a fix plan based on severity and category.
   */
  private generatePlan(
    intent: Intent,
    severity: FixSeverity,
    category: FixCategory
  ): {
    phases: string[];
    diagnostics: string[];
    verificationSteps: string[];
    priority: number;
  } {
    const phases: string[] = [];
    const diagnostics: string[] = [];
    const verificationSteps: string[] = [];
    
    // Phase 1: Investigation
    phases.push('Reproduce and understand the bug');
    phases.push('Analyze error logs and stack traces');
    diagnostics.push('Check application logs');
    diagnostics.push('Review recent changes (git log)');
    
    // Phase 2: Root Cause Analysis
    phases.push('Identify root cause');
    diagnostics.push('Trace code execution path');
    diagnostics.push('Check related dependencies');
    
    // Category-specific investigation
    switch (category) {
      case 'type-error':
        diagnostics.push('Run TypeScript compiler for detailed errors');
        diagnostics.push('Check type definitions');
        break;
      case 'runtime-error':
        diagnostics.push('Review exception handling');
        diagnostics.push('Check async/await patterns');
        break;
      case 'performance-issue':
        diagnostics.push('Profile code execution');
        diagnostics.push('Analyze memory usage');
        break;
      case 'security-issue':
        diagnostics.push('Audit security-sensitive code');
        diagnostics.push('Check input validation');
        break;
    }
    
    // Phase 3: Fix Implementation
    phases.push('Implement fix');
    phases.push('Write regression test');
    
    // Phase 4: Verification
    phases.push('Verify fix resolves the issue');
    verificationSteps.push('Run reproduction steps');
    verificationSteps.push('Execute test suite');
    verificationSteps.push('Check for regressions');
    
    // Severity-specific additions
    if (severity === 'critical' || severity === 'high') {
      phases.push('Code review with senior developer');
      phases.push('Deploy to staging for verification');
      verificationSteps.push('Monitor error rates after fix');
    }
    
    // Calculate priority (lower = higher priority)
    const severityPriority: Record<FixSeverity, number> = {
      critical: 1,
      high: 2,
      medium: 3,
      low: 4,
    };
    
    return {
      phases,
      diagnostics,
      verificationSteps,
      priority: severityPriority[severity],
    };
  }

  /**
   * Estimate fix effort.
   */
  private estimateEffort(severity: FixSeverity, category: FixCategory): {
    minutes: number;
    complexity: 'low' | 'medium' | 'high';
    agents: number;
  } {
    // Base estimates by severity
    const severityEstimates: Record<FixSeverity, { minutes: number; complexity: 'low' | 'medium' | 'high' }> = {
      critical: { minutes: 120, complexity: 'high' },
      high: { minutes: 60, complexity: 'medium' },
      medium: { minutes: 30, complexity: 'medium' },
      low: { minutes: 15, complexity: 'low' },
    };
    
    const base = severityEstimates[severity];
    
    // Category adjustments
    const categoryMultipliers: Record<FixCategory, number> = {
      'logic-error': 1.0,
      'type-error': 0.8,
      'runtime-error': 1.2,
      'performance-issue': 1.5,
      'security-issue': 1.8,
      'ui-bug': 0.9,
      'integration-failure': 1.3,
    };
    
    const adjustedMinutes = Math.round(base.minutes * categoryMultipliers[category]);
    
    // Determine agent count
    const agents = base.complexity === 'high' ? 2 : 1;
    
    return {
      minutes: adjustedMinutes,
      complexity: base.complexity,
      agents,
    };
  }
}
