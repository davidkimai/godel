/**
 * @dash/ai - Unified LLM API for Dash
 * 
 * This package wraps pi-mono's unified LLM API with swarm-specific features:
 * - Cost-optimized model selection for swarms
 * - Automatic provider failover
 * - Budget-aware model resolution
 * - Multi-provider swarm support
 * 
 * @module @dash/ai
 */

// ============================================================================
// Re-exports from pi-mono (@mariozechner/pi-ai)
// ============================================================================

export {
  // Core functions
  stream,
  complete,
  streamSimple,
  completeSimple,
  getEnvApiKey,
  
  // Model management
  getModel,
  getProviders,
  getModels,
  calculateCost,
  supportsXhigh,
  modelsAreEqual,
  
  // API Registry
  registerApiProvider,
  getApiProvider,
  getApiProviders,
  unregisterApiProviders,
  clearApiProviders,
} from '@mariozechner/pi-ai';

// Re-export types
export type {
  // Core types
  Api,
  KnownApi,
  Provider,
  KnownProvider,
  ThinkingLevel,
  ThinkingBudgets,
  CacheRetention,
  StreamOptions,
  ProviderStreamOptions,
  SimpleStreamOptions,
  StreamFunction,
  
  // Message types
  TextContent,
  ThinkingContent,
  ImageContent,
  ToolCall,
  Usage,
  StopReason,
  UserMessage,
  AssistantMessage,
  ToolResultMessage,
  Message,
  
  // Tool and context types
  Tool,
  Context,
  
  // Event types
  AssistantMessageEvent,
  AssistantMessageEventStream,
  
  // Model types
  Model,
  OpenAICompletionsCompat,
  OpenAIResponsesCompat,
  OpenRouterRouting,
  VercelGatewayRouting,
  
  // API Provider types
  ApiProvider,
  ApiStreamFunction,
  ApiStreamSimpleFunction,
} from '@mariozechner/pi-ai';

// ============================================================================
// Dash Extensions
// ============================================================================

export { SwarmModelResolver } from './swarm-model-resolver';
export { ProviderFailover, FailoverStrategy } from './provider-failover';
export { CostTracker, CostTrackingOptions } from './cost-tracker';
export { 
  getSwarmModel, 
  streamWithFailover, 
  completeWithFailover,
  createMultiProviderSwarm 
} from './swarm-llm';

// ============================================================================
// Types
// ============================================================================

export type { 
  SwarmModelConfig, 
  TaskType, 
  ModelCapability,
  ModelScore,
} from './swarm-model-resolver';
export type { 
  FailoverConfig, 
  ProviderHealth,
  FailoverAttempt,
  FailoverResult,
  // FailoverStrategy is exported as value above, don't re-export as type
} from './provider-failover';
export type { 
  // CostTrackingOptions is exported as value above, don't re-export as type
  CostEntry,
  CostStatus,
  ProviderCostSummary,
  ModelCostSummary,
  CostReport,
} from './cost-tracker';
export type { 
  SwarmStreamOptions, 
  SwarmCompleteOptions,
  MultiProviderSwarmConfig,
  SwarmAgentConfig,
  SwarmLLMResult,
} from './swarm-llm';
