/**
 * @fileoverview Intent Router - Routes intents to appropriate handlers
 * 
 * This module provides the routing infrastructure for the intent system.
 * It matches intents to handlers based on action type and manages the
 * handler lifecycle.
 * 
 * The router supports:
 * - Action-based routing (primary method)
 * - Handler chaining for complex operations
 * - Preprocessing hooks for intent enhancement
 * - Fallback handling for unmatched intents
 * 
 * @module @godel/intent/router
 */

import {
  Intent,
  IntentAction,
  IntentHandler,
  HandlerRegistration,
  HandlerResult,
  RoutingResult,
  RouterConfig,
  IntentConstraints,
} from './types';
import { createLogger } from '../utils/logger';

/**
 * Module logger
 */
const log = createLogger('intent-router');

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const DEFAULT_ROUTER_CONFIG: RouterConfig = {
  allowMultipleHandlers: false,
  enablePreprocessing: true,
  strictMode: false,
};

// ============================================================================
// INTENT PREPROCESSOR
// ============================================================================

/**
 * Preprocessor for enhancing intents before routing.
 * Applies default constraints and normalizes intent structure.
 */
export class IntentPreprocessor {
  /**
   * Preprocess an intent before routing.
   * 
   * @param intent - Raw intent
   * @returns Enhanced intent
   */
  preprocess(intent: Intent): Intent {
    const enhanced: Intent = { ...intent };
    
    // Apply default constraints if not specified
    if (!enhanced.constraints) {
      enhanced.constraints = this.getDefaultConstraints();
    } else {
      enhanced.constraints = {
        ...this.getDefaultConstraints(),
        ...enhanced.constraints,
      };
    }
    
    // Normalize target (trim whitespace, lowercase for consistency)
    enhanced.target = enhanced.target.trim();
    
    // Add preprocessing metadata to context
    enhanced.context = {
      ...enhanced.context,
      preprocessed: true,
      originalTarget: intent.target,
    };
    
    return enhanced;
  }
  
  /**
   * Get default constraints.
   */
  private getDefaultConstraints(): IntentConstraints {
    return {
      budget: 50,
      timeLimit: 60,
      teamSize: 5,
    };
  }
}

// ============================================================================
// INTENT ROUTER
// ============================================================================

/**
 * Router for matching intents to handlers.
 * 
 * The router maintains a registry of handlers and routes incoming intents
 * to the appropriate handler based on the intent action type.
 * 
 * Example usage:
 * ```typescript
 * const router = new IntentRouter();
 * router.register(new RefactorHandler());
 * router.register(new FixHandler());
 * 
 * const result = await router.route({ action: 'refactor', target: 'auth module' });
 * ```
 */
export class IntentRouter {
  private handlers: Map<IntentAction, IntentHandler> = new Map();
  private config: RouterConfig;
  private preprocessor: IntentPreprocessor;

  constructor(config: Partial<RouterConfig> = {}) {
    this.config = { ...DEFAULT_ROUTER_CONFIG, ...config };
    this.preprocessor = new IntentPreprocessor();
  }

  // ============================================================================
  // REGISTRATION
  // ============================================================================

  /**
   * Register a handler for an intent action.
   * 
   * @param handler - Intent handler to register
   * @param priority - Optional priority (unused in action-based routing)
   * @throws Error if handler for action already exists
   */
  register(handler: IntentHandler, priority?: number): void {
    const { action } = handler;
    
    if (this.handlers.has(action)) {
      throw new Error(`Handler for action '${action}' is already registered`);
    }
    
    this.handlers.set(action, handler);
    log.info(`Registered handler for action: ${action}`, { 
      handler: handler.name,
      priority: priority ?? 0,
    });
  }

  /**
   * Register multiple handlers at once.
   * 
   * @param handlers - Array of handlers to register
   */
  registerMany(handlers: IntentHandler[]): void {
    for (const handler of handlers) {
      this.register(handler);
    }
  }

  /**
   * Unregister a handler.
   * 
   * @param action - Action to unregister
   * @returns True if handler was removed
   */
  unregister(action: IntentAction): boolean {
    const removed = this.handlers.delete(action);
    if (removed) {
      log.info(`Unregistered handler for action: ${action}`);
    }
    return removed;
  }

  /**
   * Replace an existing handler.
   * 
   * @param handler - New handler to use
   */
  replace(handler: IntentHandler): void {
    this.handlers.set(handler.action, handler);
    log.info(`Replaced handler for action: ${handler.action}`);
  }

  // ============================================================================
  // ROUTING
  // ============================================================================

  /**
   * Route an intent to its handler and execute it.
   * 
   * This is the main entry point for intent execution through the router.
   * It handles preprocessing, routing, and execution.
   * 
   * @param intent - Intent to route and execute
   * @returns Handler execution result
   * @throws Error if no handler found (in strict mode)
   */
  async route(intent: Intent): Promise<HandlerResult> {
    const routingResult = this.selectHandler(intent);
    
    if (!routingResult) {
      const error = `No handler found for action: ${intent.action}`;
      log.error(error);
      
      if (this.config.strictMode) {
        throw new Error(error);
      }
      
      return {
        success: false,
        error,
        metrics: { durationMs: 0 },
      };
    }
    
    const { handler, preprocessing } = routingResult;
    const startTime = Date.now();
    
    try {
      log.info(`Routing intent to handler: ${handler.name}`, {
        action: intent.action,
        target: intent.target,
        transformed: preprocessing?.transformed ?? false,
      });
      
      // Execute the handler
      const result = await handler.execute(intent);
      
      // Add routing metadata to result
      return {
        ...result,
        metrics: {
          ...result.metrics,
          durationMs: Date.now() - startTime,
        },
      };
      
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`Handler execution failed: ${message}`, { action: intent.action });
      
      return {
        success: false,
        error: message,
        metrics: { durationMs: Date.now() - startTime },
      };
    }
  }

  /**
   * Select the appropriate handler for an intent.
   * 
   * @param intent - Intent to route
   * @returns Routing result or null if no handler found
   */
  selectHandler(intent: Intent): RoutingResult | null {
    // Preprocess if enabled
    let processedIntent = intent;
    let transformed = false;
    
    if (this.config.enablePreprocessing) {
      processedIntent = this.preprocessor.preprocess(intent);
      transformed = true;
    }
    
    // Find handler by action type
    const handler = this.handlers.get(processedIntent.action);
    
    if (!handler) {
      // Try default handler if configured
      if (this.config.defaultHandler) {
        log.warn(`Using default handler for action: ${processedIntent.action}`);
        return {
          handler: this.config.defaultHandler,
          confidence: 0.5,
          preprocessing: { transformed, original: intent },
        };
      }
      
      return null;
    }
    
    // Verify handler can handle this intent
    if (!handler.canHandle(processedIntent)) {
      log.warn(`Handler declined intent: ${handler.name}`);
      return null;
    }
    
    return {
      handler,
      confidence: 1.0, // Direct match = full confidence
      preprocessing: { transformed, original: intent },
    };
  }

  /**
   * Check if a handler is registered for an action.
   * 
   * @param action - Action to check
   * @returns True if handler exists
   */
  hasHandler(action: IntentAction): boolean {
    return this.handlers.has(action);
  }

  /**
   * Get a registered handler.
   * 
   * @param action - Action to get handler for
   * @returns Handler or undefined
   */
  getHandler(action: IntentAction): IntentHandler | undefined {
    return this.handlers.get(action);
  }

  // ============================================================================
  // QUERY
  // ============================================================================

  /**
   * List all registered handlers.
   * 
   * @returns Array of registered handlers
   */
  listHandlers(): IntentHandler[] {
    return Array.from(this.handlers.values());
  }

  /**
   * Get all registered actions.
   * 
   * @returns Array of registered actions
   */
  listActions(): IntentAction[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Get router statistics.
   * 
   * @returns Router statistics
   */
  getStats(): {
    registeredHandlers: number;
    supportedActions: IntentAction[];
  } {
    return {
      registeredHandlers: this.handlers.size,
      supportedActions: this.listActions(),
    };
  }

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  /**
   * Clear all registered handlers.
   */
  clear(): void {
    this.handlers.clear();
    log.info('Cleared all handlers');
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Create a router with standard handlers pre-registered.
 * 
 * This is the recommended way to create a router for most use cases.
 * It automatically registers all built-in handlers.
 * 
 * @param config - Optional router configuration
 * @returns Configured router with handlers
 */
export function createRouter(config?: Partial<RouterConfig>): IntentRouter {
  // Import handlers dynamically to avoid circular dependencies
  const { RefactorHandler } = require('./handlers/refactor');
  const { FixHandler } = require('./handlers/fix');
  const { ImplementHandler } = require('./handlers/implement');
  const { TestHandler } = require('./handlers/test');
  const { OptimizeHandler } = require('./handlers/optimize');
  
  const router = new IntentRouter(config);
  
  // Register all built-in handlers
  router.registerMany([
    new RefactorHandler(),
    new FixHandler(),
    new ImplementHandler(),
    new TestHandler(),
    new OptimizeHandler(),
  ]);
  
  log.info('Created router with standard handlers');
  return router;
}

/**
 * Create a minimal router without any handlers.
 * 
 * Useful for custom handler configurations.
 * 
 * @param config - Optional router configuration
 * @returns Empty router
 */
export function createEmptyRouter(config?: Partial<RouterConfig>): IntentRouter {
  return new IntentRouter(config);
}

/**
 * Quick route a single intent without managing a router instance.
 * 
 * @param intent - Intent to execute
 * @returns Handler result
 */
export async function quickRoute(intent: Intent): Promise<HandlerResult> {
  const router = createRouter();
  return router.route(intent);
}
