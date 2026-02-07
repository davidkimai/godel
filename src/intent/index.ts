/**
 * @fileoverview Intent Module - Intent-based "magic" system for Godel
 * 
 * This module provides natural language intent parsing and automatic
 * swarm configuration for the Godel agent orchestration platform.
 * 
 * Usage:
 *   import { IntentExecutor } from '@godel/intent';
 *   
 *   const executor = new IntentExecutor();
 *   const result = await executor.execute('Refactor the auth module');
 * 
 * @module @godel/intent
 */

// ============================================================================
// TYPES
// ============================================================================

export type {
  // Core types
  TaskType,
  TargetType,
  PriorityLevel,
  ComplexityLevel,
  AgentType,
  ParsedIntent,
  
  // Complexity types
  FileMetrics,
  ComplexityMetrics,
  SwarmComplexity,
  
  // Configuration types
  AgentConfig,
  SwarmConfiguration,
  
  // Execution types
  ExecuteOptions,
  ExecutionResult,
  
  // Service interfaces
  LLMService,
  ParserConfig,
  CodeAnalyzer,
  GitAnalyzer,
  AgentRegistration,
  Agent,
  AgentRegistry,
  WorkflowEngine,
  WorkflowTemplate,
  WorkflowPhase,
  WorkflowTemplateLibrary,
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
// COMPLEXITY ANALYZER
// ============================================================================

export {
  ComplexityAnalyzer,
  analyzeComplexity,
} from './complexity-analyzer';

// ============================================================================
// SWARM CONFIG GENERATOR
// ============================================================================

export {
  SwarmConfigGenerator,
  generateSwarmConfig,
} from './swarm-config-generator';

// ============================================================================
// EXECUTOR
// ============================================================================

export {
  IntentExecutor,
  executeIntent,
  createExecutor,
} from './executor';
