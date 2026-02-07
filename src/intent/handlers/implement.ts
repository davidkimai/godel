/**
 * @fileoverview Implement Handler - Handles feature implementation intents
 * 
 * The implement handler processes intents to create new features,
 * add functionality, and build components.
 * 
 * Supported patterns:
 * - "implement user authentication"
 * - "create a payment processing module"
 * - "build an API endpoint for users"
 * 
 * @module @godel/intent/handlers/implement
 */

import { Intent, HandlerResult, IntentAction } from '../types';
import { BaseIntentHandler } from './base';

/**
 * Implementation approach options.
 */
export type ImplementationApproach = 
  | 'from-scratch'
  | 'incremental'
  | 'prototype'
  | 'integration';

/**
 * Feature type for implementation.
 */
export type FeatureType = 
  | 'api'
  | 'ui'
  | 'service'
  | 'database'
  | 'integration'
  | 'utility'
  | 'cli'
  | 'test-suite';

/**
 * Implementation intent with additional context.
 */
export interface ImplementIntent extends Intent {
  /** Implementation approach */
  approach?: ImplementationApproach;
  
  /** Type of feature being implemented */
  featureType?: FeatureType;
  
  /** Required dependencies */
  dependencies?: string[];
  
  /** Integration points */
  integrations?: string[];
  
  /** Design specifications reference */
  specRef?: string;
  
  /** Whether to include tests */
  includeTests?: boolean;
  
  /** Whether to include documentation */
  includeDocs?: boolean;
}

/**
 * Handler for implement intents.
 * 
 * Coordinates the creation of new features through:
 * - Specification analysis
 * - Architecture planning
 * - Incremental implementation
 * - Testing and documentation
 */
export class ImplementHandler extends BaseIntentHandler {
  readonly action: IntentAction = 'implement';
  readonly name = 'Implement Handler';
  readonly description = 'Creates new features, components, and functionality';

  /**
   * Validation specific to implementation intents.
   */
  protected doValidate(intent: Intent): { valid: boolean; error?: string } {
    const implIntent = intent as ImplementIntent;
    
    // Validate approach if provided
    const validApproaches: ImplementationApproach[] = [
      'from-scratch', 'incremental', 'prototype', 'integration'
    ];
    if (implIntent.approach && !validApproaches.includes(implIntent.approach)) {
      return {
        valid: false,
        error: `Unknown implementation approach: ${implIntent.approach}`,
      };
    }
    
    // Validate feature type if provided
    const validFeatureTypes: FeatureType[] = [
      'api', 'ui', 'service', 'database', 'integration', 'utility', 'cli', 'test-suite'
    ];
    if (implIntent.featureType && !validFeatureTypes.includes(implIntent.featureType)) {
      return {
        valid: false,
        error: `Unknown feature type: ${implIntent.featureType}`,
      };
    }
    
    return { valid: true };
  }

  /**
   * Execute implement intent.
   */
  protected async doExecute(intent: Intent): Promise<HandlerResult> {
    const implIntent = intent as ImplementIntent;
    
    this.log.info('Planning implementation', {
      target: intent.target,
      approach: implIntent.approach,
      featureType: implIntent.featureType,
    });
    
    // Detect feature type and approach if not specified
    const featureType = implIntent.featureType ?? this.detectFeatureType(intent.target);
    const approach = implIntent.approach ?? this.detectApproach(intent.target, featureType);
    
    // Generate implementation plan
    const plan = this.generatePlan(intent, featureType, approach);
    
    // Estimate effort
    const estimation = this.estimateEffort(featureType, approach);
    
    this.log.info('Implementation plan generated', {
      featureType,
      approach,
      phases: plan.phases.length,
      estimatedMinutes: estimation.minutes,
    });
    
    return this.success({
      plan,
      estimation,
      featureType,
      approach,
      target: intent.target,
      dependencies: implIntent.dependencies ?? [],
      integrations: implIntent.integrations ?? [],
      includeTests: implIntent.includeTests ?? true,
      includeDocs: implIntent.includeDocs ?? true,
      specRef: implIntent.specRef,
    });
  }

  /**
   * Detect the feature type from the target.
   */
  private detectFeatureType(target: string): FeatureType {
    const lower = target.toLowerCase();
    
    // Check for API-related terms
    if (lower.includes('api') || lower.includes('endpoint') || lower.includes('route') || lower.includes('rest')) {
      return 'api';
    }
    
    // Check for UI-related terms
    if (lower.includes('ui') || lower.includes('component') || lower.includes('page') || 
        lower.includes('interface') || lower.includes('view') || lower.includes('screen')) {
      return 'ui';
    }
    
    // Check for service-related terms
    if (lower.includes('service') || lower.includes('worker') || lower.includes('processor') || 
        lower.includes('handler')) {
      return 'service';
    }
    
    // Check for database-related terms
    if (lower.includes('database') || lower.includes('schema') || lower.includes('model') || 
        lower.includes('storage') || lower.includes('migration')) {
      return 'database';
    }
    
    // Check for CLI-related terms
    if (lower.includes('cli') || lower.includes('command') || lower.includes('tool')) {
      return 'cli';
    }
    
    // Check for integration-related terms
    if (lower.includes('integration') || lower.includes('webhook') || lower.includes('sync') || 
        lower.includes('connector')) {
      return 'integration';
    }
    
    // Check for test-related terms
    if (lower.includes('test') || lower.includes('spec')) {
      return 'test-suite';
    }
    
    // Default to utility
    return 'utility';
  }

  /**
   * Detect the implementation approach.
   */
  private detectApproach(target: string, featureType: FeatureType): ImplementationApproach {
    const lower = target.toLowerCase();
    
    // Check for prototype indicators
    if (lower.includes('prototype') || lower.includes('proof of concept') || lower.includes('poc')) {
      return 'prototype';
    }
    
    // Check for integration indicators
    if (lower.includes('integrate') || lower.includes('connect') || lower.includes('adapter')) {
      return 'integration';
    }
    
    // Check for incremental indicators
    if (lower.includes('add to') || lower.includes('extend') || lower.includes('enhance')) {
      return 'incremental';
    }
    
    // Default based on feature type
    switch (featureType) {
      case 'api':
      case 'ui':
        return 'incremental';
      case 'integration':
        return 'integration';
      default:
        return 'from-scratch';
    }
  }

  /**
   * Generate an implementation plan.
   */
  private generatePlan(
    intent: Intent,
    featureType: FeatureType,
    approach: ImplementationApproach
  ): {
    phases: string[];
    deliverables: string[];
    reviewPoints: string[];
  } {
    const phases: string[] = [];
    const deliverables: string[] = [];
    const reviewPoints: string[] = [];
    
    // Phase 1: Design and Specification
    phases.push('Analyze requirements and design approach');
    phases.push('Define interfaces and contracts');
    deliverables.push('Design document');
    reviewPoints.push('Design review');
    
    // Phase 2: Setup and Foundation
    phases.push('Set up project structure and dependencies');
    phases.push('Create base classes and interfaces');
    deliverables.push('Project skeleton');
    
    // Phase 3: Core Implementation
    phases.push('Implement core functionality');
    
    // Feature type-specific phases
    switch (featureType) {
      case 'api':
        phases.push('Define request/response schemas');
        phases.push('Implement endpoint handlers');
        phases.push('Add middleware and validation');
        deliverables.push('API endpoints');
        deliverables.push('OpenAPI spec');
        break;
        
      case 'ui':
        phases.push('Create component structure');
        phases.push('Implement visual components');
        phases.push('Add state management');
        phases.push('Style and polish');
        deliverables.push('UI components');
        deliverables.push('Storybook stories');
        break;
        
      case 'service':
        phases.push('Implement business logic');
        phases.push('Add error handling');
        phases.push('Implement retry and circuit breaker patterns');
        deliverables.push('Service implementation');
        break;
        
      case 'database':
        phases.push('Design schema');
        phases.push('Create migrations');
        phases.push('Implement repository layer');
        deliverables.push('Database schema');
        deliverables.push('Migration files');
        deliverables.push('Repository classes');
        break;
        
      case 'cli':
        phases.push('Define command structure');
        phases.push('Implement command handlers');
        phases.push('Add help and documentation');
        deliverables.push('CLI commands');
        deliverables.push('Usage documentation');
        break;
        
      default:
        phases.push('Implement main functionality');
        deliverables.push('Implementation');
    }
    
    // Phase 4: Testing
    phases.push('Write unit tests');
    phases.push('Write integration tests');
    deliverables.push('Test suite');
    reviewPoints.push('Test coverage review');
    
    // Phase 5: Documentation
    phases.push('Write documentation');
    phases.push('Create usage examples');
    deliverables.push('Documentation');
    deliverables.push('Examples');
    
    // Phase 6: Final Review
    phases.push('Code review and polish');
    reviewPoints.push('Final review');
    
    // Approach-specific adjustments
    if (approach === 'prototype') {
      // Skip some phases for prototypes
      phases.splice(phases.indexOf('Write unit tests'), 1);
      phases.splice(phases.indexOf('Write integration tests'), 1);
      deliverables.length = deliverables.indexOf('Test suite');
    }
    
    return { phases, deliverables, reviewPoints };
  }

  /**
   * Estimate implementation effort.
   */
  private estimateEffort(featureType: FeatureType, approach: ImplementationApproach): {
    minutes: number;
    complexity: 'low' | 'medium' | 'high';
    agents: number;
  } {
    // Base estimates by feature type
    const typeEstimates: Record<FeatureType, { minutes: number; complexity: 'low' | 'medium' | 'high' }> = {
      'api': { minutes: 120, complexity: 'medium' },
      'ui': { minutes: 180, complexity: 'medium' },
      'service': { minutes: 150, complexity: 'medium' },
      'database': { minutes: 90, complexity: 'medium' },
      'integration': { minutes: 180, complexity: 'high' },
      'utility': { minutes: 60, complexity: 'low' },
      'cli': { minutes: 120, complexity: 'medium' },
      'test-suite': { minutes: 90, complexity: 'low' },
    };
    
    const base = typeEstimates[featureType];
    
    // Approach multipliers
    const approachMultipliers: Record<ImplementationApproach, number> = {
      'from-scratch': 1.0,
      'incremental': 0.7,
      'prototype': 0.5,
      'integration': 0.8,
    };
    
    const adjustedMinutes = Math.round(base.minutes * approachMultipliers[approach]);
    
    // Determine agent count based on complexity
    const agents = base.complexity === 'high' ? 3 : base.complexity === 'medium' ? 2 : 1;
    
    return {
      minutes: adjustedMinutes,
      complexity: base.complexity,
      agents,
    };
  }
}
