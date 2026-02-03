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
export { stream, complete, streamSimple, completeSimple, getEnvApiKey, getModel, getProviders, getModels, calculateCost, supportsXhigh, modelsAreEqual, registerApiProvider, getApiProvider, getApiProviders, unregisterApiProviders, clearApiProviders, } from '@mariozechner/pi-ai';
export type { Api, KnownApi, Provider, KnownProvider, ThinkingLevel, ThinkingBudgets, CacheRetention, StreamOptions, ProviderStreamOptions, SimpleStreamOptions, StreamFunction, TextContent, ThinkingContent, ImageContent, ToolCall, Usage, StopReason, UserMessage, AssistantMessage, ToolResultMessage, Message, Tool, Context, AssistantMessageEvent, AssistantMessageEventStream, Model, OpenAICompletionsCompat, OpenAIResponsesCompat, OpenRouterRouting, VercelGatewayRouting, ApiProvider, ApiStreamFunction, ApiStreamSimpleFunction, } from '@mariozechner/pi-ai';
export { SwarmModelResolver } from './swarm-model-resolver';
export { ProviderFailover, FailoverStrategy } from './provider-failover';
export { CostTracker, CostTrackingOptions } from './cost-tracker';
export { getSwarmModel, streamWithFailover, completeWithFailover, createMultiProviderSwarm } from './swarm-llm';
export type { SwarmModelConfig } from './swarm-model-resolver';
export type { FailoverConfig, ProviderHealth } from './provider-failover';
export type { SwarmStreamOptions, SwarmCompleteOptions } from './swarm-llm';
//# sourceMappingURL=index.d.ts.map