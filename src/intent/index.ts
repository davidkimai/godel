/**
 * @fileoverview Intent Module - Intent-based "magic" system for Godel
 * 
 * This module provides natural language intent parsing, routing, and handling
 * for the Godel agent orchestration platform. It implements the "godel do"
 * command functionality with a clean separation between parsing, routing,
 * and execution.
 * 
 * Phase 2 Intent Interface Architecture:
 * - Parser: Converts natural language to structured Intent
 * - Router: Routes intents to appropriate handlers
 * - Handlers: Execute specific intent types
 * 
 * Usage:
 *   import { IntentRouter, createRouter } from '@godel/intent';
 *   
 *   const router = createRouter();
 *   const result = await router.route({
 *     action: 'refactor',
 *     target: 'auth module'
 *   });
 * 
 * @module @godel/intent
 */

// ============================================================================
// TYPES
// ============================================================================

export type {
  // Core intent types
  IntentAction,
  INTENT_ACTIONS,
  Intent,
  IntentConstraints,
  ParsedIntent,
  TargetType,
  PriorityLevel,
  ComplexityLevel,
  AgentType,
  
  // Handler types
  IntentHandler,
  HandlerRegistration,
  HandlerResult,
  
  // Router types
  RoutingResult,
  RouterConfig,
  
  // Complexity types
  FileMetrics,
  ComplexityMetrics,
  TeamComplexity,
  
  // Configuration types
  AgentConfig,
  TeamConfiguration,
  
  // Execution types
  ExecuteOptions,
  ExecutionResult,
  
  // Service interfaces
  LLMService,
  ParserConfig,
  ParseResult,
  CodeAnalyzer,
  GitAnalyzer,
  AgentRegistration,
  Agent,
  AgentRegistry,
  WorkflowEngine,
  WorkflowTemplate,
  WorkflowPhase,
  WorkflowTemplateLibrary,
  
  // Utilities
  TEAM_CONFIGS,
  DEFAULT_CONSTRAINTS,
} from './types';

// ============================================================================
// PARSER
// ============================================================================

export {
  IntentParser,
  parseIntent,
  createParser,
  quickParse,
} from './parser';

// ============================================================================
// ROUTER
// ============================================================================

export {
  IntentRouter,
  IntentPreprocessor,
  createRouter,
  createEmptyRouter,
  quickRoute,
} from './router';

// ============================================================================
// HANDLERS
// ============================================================================

export {
  // Base class
  BaseIntentHandler,
  
  // Handler implementations
  RefactorHandler,
  FixHandler,
  ImplementHandler,
  TestHandler,
  OptimizeHandler,
  
  // Handler types
  RefactoringIntent,
  RefactoringStrategy,
  FixIntent,
  FixSeverity,
  FixCategory,
  ImplementIntent,
  ImplementationApproach,
  FeatureType,
  TestIntent,
  TestType,
  TestFramework,
  CoverageRequirement,
  OptimizeIntent,
  OptimizationTarget,
  OptimizationApproach,
  PerformanceTarget,
} from './handlers';

// ============================================================================
// COMPLEXITY ANALYZER
// ============================================================================

export {
  ComplexityAnalyzer,
  analyzeComplexity,
} from './complexity-analyzer';

// ============================================================================
// TEAM CONFIG GENERATOR
// ============================================================================

export {
  TeamConfigGenerator,
  generateTeamConfig,
} from './team-config-generator';

// ============================================================================
// EXECUTOR
// ============================================================================

export {
  IntentExecutor,
  executeIntent,
  createExecutor,
} from './executor';
