/**
 * LLM Proxy Types
 * 
 * Core type definitions for the server-side LLM proxy that provides
 * unified access control, rate limiting, and provider abstraction.
 * 
 * @module proxy/types
 */

import { EventEmitter } from 'events';

// =============================================================================
// Proxy Configuration Types
// =============================================================================

/**
 * Main proxy configuration interface
 * Defines security, provider, and feature settings for the LLM proxy
 */
export interface ProxyConfig {
  /** Whether authentication is required for all requests */
  requireAuth: boolean;
  
  /** Rate limiting configuration */
  rateLimiting: RateLimitConfig;
  
  /** Available LLM providers */
  providers: ProviderConfig[];
  
  /** Default model to use when not specified */
  defaultModel: string;
  
  /** Default provider to use when not specified */
  defaultProvider: string;
  
  /** Enable streaming responses */
  enableStreaming: boolean;
  
  /** Enable response caching */
  enableCaching: boolean;
  
  /** Cache TTL in seconds */
  cacheTtl: number;
  
  /** Logging level */
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  
  /** Enable audit logging for all requests */
  auditLog: boolean;
}

/**
 * Rate limiting configuration
 * Controls request and token throughput per user/tenant
 */
export interface RateLimitConfig {
  /** Maximum requests per minute */
  requestsPerMinute: number;
  
  /** Maximum tokens per minute */
  tokensPerMinute: number;
  
  /** Burst size for token bucket algorithm */
  burstSize: number;
}

/**
 * Provider configuration for a single LLM provider
 * Contains API credentials and capability definitions
 */
export interface ProviderConfig {
  /** Unique provider identifier */
  id: string;
  
  /** Human-readable provider name */
  name: string;
  
  /** Provider type/API format */
  type: 'anthropic' | 'openai' | 'google' | 'azure' | 'groq';
  
  /** API key (server-side only, never exposed to clients) */
  apiKey: string;
  
  /** Optional custom base URL for the provider API */
  baseUrl?: string;
  
  /** Default model for this provider */
  defaultModel: string;
  
  /** Available models from this provider */
  models: string[];
  
  /** Provider capabilities (e.g., 'streaming', 'tools', 'vision') */
  capabilities: string[];
  
  /** Pricing information per 1K tokens */
  pricing: {
    inputPer1k: number;
    outputPer1k: number;
    currency: string;
  };
  
  /** Whether this provider is enabled */
  enabled: boolean;
  
  /** Priority for provider selection (lower = higher priority) */
  priority: number;
}

// =============================================================================
// Message Types
// =============================================================================

/**
 * Role of a message in the conversation
 */
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

/**
 * A single message in a conversation
 */
export interface Message {
  /** Message role */
  role: MessageRole;
  
  /** Message content (text or structured) */
  content: string | ContentBlock[];
  
  /** Optional name for the message sender (for multi-user scenarios) */
  name?: string;
  
  /** Tool call ID if this is a tool response */
  tool_call_id?: string;
}

/**
 * Content block for multimodal messages
 */
export interface ContentBlock {
  /** Content type */
  type: 'text' | 'image' | 'image_url' | 'tool_use' | 'tool_result';
  
  /** Text content (for text type) */
  text?: string;
  
  /** Image source (for image type) */
  source?: {
    type: 'base64' | 'url';
    media_type: string;
    data: string;
  };
  
  /** Image URL (for image_url type) */
  image_url?: {
    url: string;
    detail?: 'low' | 'high' | 'auto';
  };
  
  /** Tool use information */
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

// =============================================================================
// Tool Types
// =============================================================================

/**
 * Tool definition for function calling
 */
export interface Tool {
  /** Tool name */
  name: string;
  
  /** Tool description */
  description: string;
  
  /** JSON schema for tool parameters */
  parameters: ToolParameters;
}

/**
 * Tool parameter schema
 */
export interface ToolParameters {
  /** Parameter type */
  type: 'object';
  
  /** Required parameter names */
  required?: string[];
  
  /** Parameter properties */
  properties: Record<string, ParameterProperty>;
}

/**
 * Individual parameter property
 */
export interface ParameterProperty {
  /** Parameter type */
  type: string;
  
  /** Parameter description */
  description?: string;
  
  /** Enum values if applicable */
  enum?: string[];
  
  /** Nested properties for object types */
  properties?: Record<string, ParameterProperty>;
  
  /** Required nested properties */
  required?: string[];
  
  /** Array item type */
  items?: ParameterProperty;
}

/**
 * A tool call in a response
 */
export interface ToolCall {
  /** Unique tool call ID */
  id: string;
  
  /** Tool name */
  name: string;
  
  /** Tool arguments as JSON string */
  arguments: string;
  
  /** Parsed tool arguments */
  parsedArguments?: Record<string, unknown>;
}

// =============================================================================
// Request/Response Types
// =============================================================================

/**
 * Routing hints for provider selection
 */
export interface RoutingHints {
  /** Whether fallback to other providers is allowed */
  fallbackAllowed?: boolean;
  
  /** Maximum cost limit for this request (in USD) */
  costLimit?: number;
  
  /** Latency requirement for this request */
  latencyRequirement?: 'low' | 'normal';
  
  /** Preferred provider ID */
  preferredProvider?: string;
  
  /** Preferred model (can be alias like 'smart', 'fast', 'cheap') */
  preferredModel?: string;
}

/**
 * Completion request from client
 */
export interface CompletionRequest {
  /** Model to use (can be alias: 'smart', 'fast', 'cheap') */
  model: string;
  
  /** Conversation messages */
  messages: Message[];
  
  /** Available tools for function calling */
  tools?: Tool[];
  
  /** Sampling temperature (0-2) */
  temperature?: number;
  
  /** Maximum tokens to generate */
  max_tokens?: number;
  
  /** Whether to stream the response */
  stream?: boolean;
  
  /** Top-p sampling */
  top_p?: number;
  
  /** Top-k sampling */
  top_k?: number;
  
  /** Stop sequences */
  stop?: string[] | string;
  
  /** Presence penalty */
  presence_penalty?: number;
  
  /** Frequency penalty */
  frequency_penalty?: number;
  
  /** Seed for deterministic sampling */
  seed?: number;
  
  /** Response format (e.g., JSON mode) */
  response_format?: {
    type: 'text' | 'json_object';
    schema?: Record<string, unknown>;
  };
  
  /** Routing hints for provider selection */
  routing?: RoutingHints;
}

/**
 * Token usage information
 */
export interface TokenUsage {
  /** Prompt tokens used */
  prompt_tokens: number;
  
  /** Completion tokens generated */
  completion_tokens: number;
  
  /** Total tokens */
  total_tokens: number;
  
  /** Cache read tokens (if provider supports caching) */
  cache_read_tokens?: number;
  
  /** Cache write tokens (if provider supports caching) */
  cache_write_tokens?: number;
}

/**
 * Completion response from proxy
 */
export interface CompletionResponse {
  /** Unique response ID */
  id: string;
  
  /** Model used for generation */
  model: string;
  
  /** Provider that served the request */
  provider: string;
  
  /** Generated content */
  content: string;
  
  /** Tool calls in the response */
  toolCalls?: ToolCall[];
  
  /** Token usage statistics */
  usage: TokenUsage;
  
  /** Estimated cost in USD */
  cost: number;
  
  /** Whether response was served from cache */
  cached?: boolean;
  
  /** Response timestamp */
  createdAt?: Date;
  
  /** Finish reason */
  finishReason?: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
}

/**
 * Streaming chunk for SSE responses
 */
export interface StreamChunk {
  /** Response ID */
  id: string;
  
  /** Model being used */
  model: string;
  
  /** Provider serving the stream */
  provider: string;
  
  /** Delta text content */
  delta: string;
  
  /** Tool call deltas */
  toolCalls?: ToolCall[];
  
  /** Usage information (may appear in final chunk) */
  usage?: TokenUsage;
  
  /** Finish reason */
  finishReason?: string;
  
  /** Whether this is the final chunk */
  done?: boolean;
}

// =============================================================================
// Model Information Types
// =============================================================================

/**
 * Model information for discovery
 */
export interface ModelInfo {
  /** Model ID */
  id: string;
  
  /** Provider ID */
  provider: string;
  
  /** Human-readable model name */
  name: string;
  
  /** Model capabilities */
  capabilities: string[];
  
  /** Context window size in tokens */
  contextWindow: number;
  
  /** Maximum output tokens */
  maxOutputTokens?: number;
  
  /** Knowledge cutoff date */
  knowledgeCutoff?: string;
  
  /** Pricing per 1K tokens */
  pricing: {
    inputPer1k: number;
    outputPer1k: number;
  };
  
  /** Model aliases (e.g., 'smart' -> 'claude-opus-4') */
  aliases?: string[];
}

// =============================================================================
// Provider Adapter Types
// =============================================================================

/**
 * Generic provider request format
 */
export interface ProviderRequest {
  [key: string]: unknown;
}

/**
 * Generic provider response format
 */
export interface ProviderResponse {
  [key: string]: unknown;
}

/**
 * Health status for a provider
 */
export interface HealthStatus {
  /** Whether the provider is healthy */
  healthy: boolean;
  
  /** Provider name */
  provider: string;
  
  /** Response time in ms */
  responseTime: number;
  
  /** Error message if unhealthy */
  error?: string;
  
  /** Last checked timestamp */
  checkedAt: Date;
}

/**
 * Provider adapter interface
 * Abstracts provider-specific API formats
 */
export interface ProviderAdapter {
  /** Provider name */
  name: string;
  
  /**
   * Transform request from standard format to provider format
   * @param req - Standard completion request
   * @returns Provider-specific request
   */
  transformRequest(req: CompletionRequest): ProviderRequest;
  
  /**
   * Transform response from provider format to standard format
   * @param res - Provider-specific response
   * @returns Standard completion response
   */
  transformResponse(res: ProviderResponse): CompletionResponse;
  
  /**
   * Transform streaming chunk from provider format
   * @param chunk - Provider-specific chunk
   * @returns Standard stream chunk
   */
  transformStreamChunk(chunk: unknown): StreamChunk;
  
  /**
   * Check provider health
   * @returns Health status
   */
  checkHealth(): Promise<HealthStatus>;
  
  /**
   * Calculate cost for token usage
   * @param usage - Token usage statistics
   * @returns Cost in USD
   */
  calculateCost(usage: TokenUsage): number;
  
  /**
   * Map model alias to actual model ID
   * @param alias - Model alias (e.g., 'smart', 'fast')
   * @returns Actual model ID
   */
  mapModel(alias: string): string;
}

// =============================================================================
// Security Types
// =============================================================================

/**
 * Authentication context for a request
 */
export interface AuthContext {
  /** Whether the request is authenticated */
  authenticated: boolean;
  
  /** User ID */
  userId?: string;
  
  /** Tenant/organization ID */
  tenantId?: string;
  
  /** User roles */
  roles?: string[];
  
  /** API key ID used for authentication */
  apiKeyId?: string;
  
  /** Request IP address */
  ipAddress?: string;
  
  /** Request user agent */
  userAgent?: string;
}

/**
 * User information
 */
export interface User {
  /** User ID */
  id: string;
  
  /** User email */
  email: string;
  
  /** User roles */
  roles: string[];
  
  /** Allowed models */
  allowedModels?: string[];
  
  /** Rate limit tier */
  rateLimitTier?: string;
  
  /** Custom rate limits */
  customRateLimits?: RateLimitConfig;
}

/**
 * Authentication result
 */
export interface AuthResult {
  /** Whether authentication succeeded */
  authenticated: boolean;
  
  /** User information if authenticated */
  user?: User;
  
  /** Error message if authentication failed */
  error?: string;
}

/**
 * Rate limit status
 */
export interface RateLimitStatus {
  /** Whether the request is allowed */
  allowed: boolean;
  
  /** Current limit */
  limit: number;
  
  /** Remaining quota */
  remaining: number;
  
  /** Reset timestamp */
  resetAt: Date;
  
  /** Retry after (seconds) */
  retryAfter?: number;
}

/**
 * Filter result for content filtering
 */
export interface FilterResult {
  /** Whether content passed filtering */
  passed: boolean;
  
  /** Filtered content (if modified) */
  content?: string;
  
  /** Reason for filtering */
  reason?: string;
  
  /** Matched patterns */
  matches?: string[];
}

/**
 * PII detection report
 */
export interface PIIReport {
  /** Whether PII was detected */
  detected: boolean;
  
  /** Detected PII types */
  types: string[];
  
  /** Detected values (hashed/anonymized) */
  values?: string[];
  
  /** Confidence scores */
  confidence?: Record<string, number>;
}

/**
 * Security event for audit logging
 */
export interface SecurityEvent {
  /** Event type */
  type: 'auth_failure' | 'rate_limit_exceeded' | 'content_filtered' | 'pii_detected' | 'unauthorized_model' | 'suspicious_activity';
  
  /** Event timestamp */
  timestamp: Date;
  
  /** User ID if known */
  userId?: string;
  
  /** IP address */
  ipAddress: string;
  
  /** Event details */
  details: Record<string, unknown>;
  
  /** Severity level */
  severity: 'low' | 'medium' | 'high' | 'critical';
}

// =============================================================================
// Proxy Health Types
// =============================================================================

/**
 * Overall proxy health status
 */
export interface ProxyHealthStatus {
  /** Whether the proxy is healthy */
  healthy: boolean;
  
  /** Provider health statuses */
  providers: HealthStatus[];
  
  /** Cache health */
  cache: {
    healthy: boolean;
    hitRate?: number;
    size?: number;
  };
  
  /** Rate limiter health */
  rateLimiter: {
    healthy: boolean;
  };
  
  /** Checked timestamp */
  checkedAt: Date;
}

// =============================================================================
// Cache Types
// =============================================================================

/**
 * Cache entry metadata
 */
export interface CacheEntry {
  /** Cached response */
  response: CompletionResponse;
  
  /** Expiration timestamp */
  expiresAt: Date;
  
  /** Cache key */
  key: string;
  
  /** Created timestamp */
  createdAt: Date;
  
  /** Access count */
  accessCount: number;
  
  /** Last accessed timestamp */
  lastAccessedAt?: Date;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  /** Total entries */
  totalEntries: number;
  
  /** Hit rate (0-1) */
  hitRate: number;
  
  /** Total hits */
  hits: number;
  
  /** Total misses */
  misses: number;
  
  /** Memory usage (bytes) */
  memoryUsage: number;
  
  /** Oldest entry timestamp */
  oldestEntry?: Date;
  
  /** Newest entry timestamp */
  newestEntry?: Date;
}

// =============================================================================
// Error Types
// =============================================================================

/**
 * Proxy error codes
 */
export type ProxyErrorCode = 
  | 'AUTHENTICATION_FAILED'
  | 'AUTHORIZATION_FAILED'
  | 'RATE_LIMIT_EXCEEDED'
  | 'PROVIDER_UNAVAILABLE'
  | 'MODEL_NOT_FOUND'
  | 'INVALID_REQUEST'
  | 'CONTENT_FILTERED'
  | 'PII_DETECTED'
  | 'COST_LIMIT_EXCEEDED'
  | 'TIMEOUT'
  | 'INTERNAL_ERROR';

/**
 * Proxy error
 */
export interface ProxyError {
  /** Error code */
  code: ProxyErrorCode;
  
  /** Error message */
  message: string;
  
  /** HTTP status code */
  statusCode: number;
  
  /** Additional details */
  details?: Record<string, unknown>;
  
  /** Provider error if applicable */
  providerError?: unknown;
}

// =============================================================================
// Audit Log Types
// =============================================================================

/**
 * Audit log entry
 */
export interface AuditLogEntry {
  /** Entry ID */
  id: string;
  
  /** Timestamp */
  timestamp: Date;
  
  /** Request ID */
  requestId: string;
  
  /** User ID */
  userId?: string;
  
  /** Tenant ID */
  tenantId?: string;
  
  /** IP address */
  ipAddress: string;
  
  /** Request details */
  request: {
    model: string;
    provider: string;
    messages: number;
    tools?: number;
    streaming: boolean;
  };
  
  /** Response details */
  response?: {
    status: 'success' | 'error' | 'cached';
    tokens: TokenUsage;
    cost: number;
    duration: number;
    errorCode?: string;
  };
  
  /** Security flags */
  securityFlags?: string[];
}
