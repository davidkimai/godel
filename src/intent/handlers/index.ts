/**
 * @fileoverview Intent Handlers - Export all intent handlers
 * 
 * This module exports all intent handlers for the routing system.
 * Each handler implements the IntentHandler interface for a specific
 * intent action type.
 * 
 * @module @godel/intent/handlers
 */

// ============================================================================
// BASE CLASS
// ============================================================================

export { BaseIntentHandler } from './base';

// ============================================================================
// HANDLER IMPLEMENTATIONS
// ============================================================================

export { RefactorHandler } from './refactor';
export { FixHandler } from './fix';
export { ImplementHandler } from './implement';
export { TestHandler } from './test';
export { OptimizeHandler } from './optimize';

// ============================================================================
// HANDLER TYPES
// ============================================================================

export type { RefactoringIntent, RefactoringStrategy } from './refactor';
export type { FixIntent, FixSeverity, FixCategory } from './fix';
export type { ImplementIntent, ImplementationApproach, FeatureType } from './implement';
export type { TestIntent, TestType, TestFramework, CoverageRequirement } from './test';
export type { OptimizeIntent, OptimizationTarget, OptimizationApproach, PerformanceTarget } from './optimize';
