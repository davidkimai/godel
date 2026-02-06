/**
 * LLM Proxy Module
 * 
 * Server-side LLM proxy that keeps API keys secure and provides
 * unified access control with caching, rate limiting, and multi-provider support.
 * 
 * @example
 * ```typescript
 * import { LlmProxy, createDefaultProxy } from './proxy';
 * 
 * // Create proxy with default providers
 * const proxy = createDefaultProxy({
 *   anthropicKey: process.env.ANTHROPIC_API_KEY,
 *   openaiKey: process.env.OPENAI_API_KEY
 * });
 * 
 * await proxy.initialize();
 * 
 * // Make a request
 * const response = await proxy.handleCompletion({
 *   model: 'smart', // Uses intelligent routing
 *   messages: [{ role: 'user', content: 'Hello!' }]
 * }, {
 *   authenticated: true,
 *   userId: 'user-123'
 * });
 * 
 * console.log(response.content);
 * console.log(`Cost: $${response.cost}`);
 * ```
 * 
 * @module proxy
 */

// =============================================================================
// Core Types (import for use in this module)
// =============================================================================

import type {
  CompletionRequest,
  CompletionResponse
} from './types.js';

// =============================================================================
// Core Types (re-export for consumers)
// =============================================================================

export type {
  // Configuration types
  ProxyConfig,
  RateLimitConfig,
  ProviderConfig,
  
  // Message types
  Message,
  MessageRole,
  ContentBlock,
  
  // Tool types
  Tool,
  ToolParameters,
  ParameterProperty,
  ToolCall,
  
  // Request/Response types
  RoutingHints,
  CompletionRequest,
  TokenUsage,
  CompletionResponse,
  StreamChunk,
  
  // Model info
  ModelInfo,
  
  // Provider adapter types
  ProviderRequest,
  ProviderResponse,
  HealthStatus,
  ProviderAdapter,
  
  // Security types
  AuthContext,
  User,
  AuthResult,
  RateLimitStatus,
  FilterResult,
  PIIReport,
  SecurityEvent,
  
  // Cache types
  CacheEntry,
  CacheStats,
  
  // Error types
  ProxyErrorCode,
  ProxyError,
  
  // Audit types
  AuditLogEntry
} from './types.js';

// =============================================================================
// Core Classes
// =============================================================================

export { 
  LlmProxy, 
  LlmProxyConfig,
  RequestContext,
  DEFAULT_PROXY_CONFIG,
  createDefaultProxy 
} from './proxy.js';

// =============================================================================
// Provider Adapters
// =============================================================================

export {
  // Base adapter
  BaseAdapter,
  
  // Provider-specific adapters
  AnthropicAdapter,
  OpenAIAdapter,
  GoogleAdapter,
  GroqAdapter,
  
  // Factory functions
  createAdapter,
  getAvailableAdapters
} from './adapters.js';

// =============================================================================
// Security
// =============================================================================

export {
  ProxySecurity,
  SecurityConfig,
  DEFAULT_SECURITY_CONFIG,
  RateLimiter,
  ContentFilter,
  PIIDetector,
  AuditLogger,
  
  // Utility functions
  extractBearerToken,
  extractApiKey,
  generateApiKey,
  hashCredential,
  verifyCredential
} from './security.js';

// =============================================================================
// Cache
// =============================================================================

export {
  ResponseCache,
  InMemoryCache,
  RedisClient,
  CacheConfig,
  DEFAULT_CACHE_CONFIG,
  
  // Utility functions
  createUserCacheKey,
  createTenantCacheKey,
  createModelCacheKey,
  shouldCacheRequest,
  calculateCacheTtl,
  Cached
} from './cache.js';

// =============================================================================
// Constants
// =============================================================================

/**
 * Provider type identifiers
 */
export const PROVIDER_TYPES = {
  ANTHROPIC: 'anthropic' as const,
  OPENAI: 'openai' as const,
  GOOGLE: 'google' as const,
  GROQ: 'groq' as const,
  AZURE: 'azure' as const
};

/**
 * Model aliases for intelligent routing
 */
export const MODEL_ALIASES = {
  /** Highest quality, best for complex tasks */
  SMART: 'smart',
  /** Fastest response, good for simple tasks */
  FAST: 'fast',
  /** Most cost-effective */
  CHEAP: 'cheap',
  /** Latest smart model */
  SMART_LATEST: 'smart-latest',
  /** Latest fast model */
  FAST_LATEST: 'fast-latest'
};

/**
 * Default model mappings by provider
 */
export const DEFAULT_MODELS: Record<string, string> = {
  anthropic: 'claude-sonnet-4',
  openai: 'gpt-4o',
  google: 'gemini-2.0-flash',
  groq: 'llama-3.1-70b-versatile'
};

/**
 * HTTP status codes used by the proxy
 */
export const STATUS_CODES = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Check if a model identifier is an alias
 */
export function isModelAlias(model: string): boolean {
  const aliases = ['smart', 'fast', 'cheap', 'smart-latest', 'fast-latest'];
  return aliases.includes(model);
}

/**
 * Get provider priority (lower = higher priority)
 */
export function getDefaultProviderPriority(providerType: string): number {
  const priorities: Record<string, number> = {
    anthropic: 1,
    openai: 2,
    google: 3,
    groq: 4,
    azure: 5
  };
  
  return priorities[providerType] || 99;
}

/**
 * Estimate token count from message content
 * Uses a rough approximation (1 token ≈ 4 characters)
 */
export function estimateTokens(content: string): number {
  return Math.ceil(content.length / 4);
}

/**
 * Calculate estimated cost for a request
 */
export function estimateCost(
  inputTokens: number,
  outputTokens: number,
  inputPrice: number,
  outputPrice: number
): number {
  const inputCost = (inputTokens / 1000) * inputPrice;
  const outputCost = (outputTokens / 1000) * outputPrice;
  return Number((inputCost + outputCost).toFixed(6));
}

/**
 * Validate a completion request
 */
export function validateRequest(req: unknown): { valid: boolean; error?: string } {
  if (!req || typeof req !== 'object') {
    return { valid: false, error: 'Request must be an object' };
  }
  
  const r = req as Record<string, unknown>;
  
  if (!r.model || typeof r.model !== 'string') {
    return { valid: false, error: 'model is required and must be a string' };
  }
  
  if (!Array.isArray(r.messages) || r.messages.length === 0) {
    return { valid: false, error: 'messages is required and must be a non-empty array' };
  }
  
  for (const msg of r.messages) {
    if (!msg || typeof msg !== 'object') {
      return { valid: false, error: 'Each message must be an object' };
    }
    
    const m = msg as Record<string, unknown>;
    
    if (!m.role || typeof m.role !== 'string') {
      return { valid: false, error: 'Each message must have a role' };
    }
    
    const validRoles = ['system', 'user', 'assistant', 'tool'];
    if (!validRoles.includes(m.role)) {
      return { valid: false, error: `Invalid role: ${m.role}` };
    }
    
    if (!m.content && m.role !== 'assistant') {
      return { valid: false, error: 'Each message must have content' };
    }
  }
  
  if (r.temperature !== undefined) {
    if (typeof r.temperature !== 'number' || r.temperature < 0 || r.temperature > 2) {
      return { valid: false, error: 'temperature must be between 0 and 2' };
    }
  }
  
  if (r.max_tokens !== undefined) {
    if (typeof r.max_tokens !== 'number' || r.max_tokens < 1) {
      return { valid: false, error: 'max_tokens must be a positive number' };
    }
  }
  
  return { valid: true };
}

/**
 * Create a simple completion request
 */
export function createCompletionRequest(
  model: string,
  messages: Array<{ role: string; content: string }>,
  options: Partial<Omit<CompletionRequest, 'model' | 'messages'>> = {}
): CompletionRequest {
  return {
    model,
    messages: messages as CompletionRequest['messages'],
    ...options
  };
}

/**
 * Format response for API output
 */
export function formatResponse(response: CompletionResponse): Record<string, unknown> {
  return {
    id: response.id,
    model: response.model,
    provider: response.provider,
    content: response.content,
    tool_calls: response.toolCalls?.map(tc => ({
      id: tc.id,
      type: 'function',
      function: {
        name: tc.name,
        arguments: tc.arguments
      }
    })),
    usage: {
      prompt_tokens: response.usage.prompt_tokens,
      completion_tokens: response.usage.completion_tokens,
      total_tokens: response.usage.total_tokens
    },
    cost: response.cost,
    cached: response.cached,
    created_at: response.createdAt?.toISOString()
  };
}

// =============================================================================
// Version
// =============================================================================

/**
 * Module version
 */
export const VERSION = '1.0.0';

/**
 * Module metadata
 */
export const METADATA = {
  name: '@dash/proxy',
  version: VERSION,
  description: 'Server-side LLM proxy with unified access control',
  supportsStreaming: true,
  supportsCaching: true,
  supportsRateLimiting: true,
  supportsMultiProvider: true
};
