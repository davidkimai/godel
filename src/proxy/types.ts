/**
 * Server-Side LLM Proxy Types
 */

export type ProviderType = 'anthropic' | 'openai' | 'google' | 'azure' | 'groq' | 'cerebras';

export interface ProxyConfig {
  requireAuth: boolean;
  rateLimiting: RateLimitConfig;
  providers: ProviderConfig[];
  defaultModel: string;
  defaultProvider: string;
  enableStreaming: boolean;
  enableCaching: boolean;
  cacheTtl: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  auditLog: boolean;
}

export interface RateLimitConfig {
  requestsPerMinute: number;
  tokensPerMinute: number;
  burstSize: number;
}

export interface ProviderConfig {
  id: string;
  name: string;
  type: ProviderType;
  apiKey: string;
  baseUrl?: string;
  defaultModel: string;
  models: string[];
  capabilities: string[];
  pricing: { inputPer1k: number; outputPer1k: number; currency: string };
  enabled: boolean;
  priority: number;
}

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface Tool {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, any> };
}

export interface CompletionRequest {
  model: string;
  messages: Message[];
  tools?: Tool[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  routing?: { fallbackAllowed?: boolean; costLimit?: number; latencyRequirement?: 'low' | 'normal'; preferredProvider?: string };
}

export interface CompletionResponse {
  id: string;
  model: string;
  provider: string;
  content: string;
  toolCalls?: ToolCall[];
  usage: TokenUsage;
  cost: number;
  cached?: boolean;
  finishReason?: string;
}

export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface StreamChunk {
  id: string;
  model: string;
  provider: string;
  delta: string;
  toolCalls?: ToolCall[];
  usage?: TokenUsage;
  finishReason?: string;
}

export interface ModelInfo {
  id: string;
  provider: string;
  name: string;
  capabilities: string[];
  contextWindow: number;
  pricing: { inputPer1k: number; outputPer1k: number };
}

export interface ProviderRequest {
  model: string;
  messages: any[];
  max_tokens?: number;
  temperature?: number;
  tools?: any[];
  stream?: boolean;
}

export interface ProviderResponse {
  id: string;
  model: string;
  content: Array<{type: string; text?: string; tool_calls?: any[]}>;
  usage: { input_tokens: number; output_tokens: number };
  stop_reason?: string;
}

export interface AuthContext {
  userId: string;
  tenantId: string;
  role: string;
  permissions: string[];
  apiKey?: string;
}

export interface AuthResult {
  authenticated: boolean;
  user?: AuthContext;
  error?: string;
}

export interface RateLimitStatus {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
  retryAfter?: number;
}

export interface FilterResult {
  allowed: boolean;
  content?: string;
  reason?: string;
}

export interface PIIReport {
  hasPII: boolean;
  detectedTypes: string[];
  severity: 'low' | 'medium' | 'high';
}

export interface ProviderAdapter {
  name: string;
  transformRequest(req: CompletionRequest): ProviderRequest;
  transformResponse(res: ProviderResponse): CompletionResponse;
  transformStreamChunk(chunk: any): StreamChunk | null;
  checkHealth(): Promise<{ healthy: boolean; latency: number }>;
  calculateCost(usage: TokenUsage): number;
}

export class ProxyError extends Error {
  constructor(message: string, public code: string, public statusCode: number, public retryable: boolean = false) {
    super(message);
    this.name = 'ProxyError';
  }
}

export class RateLimitError extends ProxyError {
  constructor(message: string, public retryAfter?: number) {
    super(message, 'rate_limit', 429, true);
    this.name = 'RateLimitError';
  }
}

export class AuthenticationError extends ProxyError {
  constructor(message: string) {
    super(message, 'authentication', 401, false);
    this.name = 'AuthenticationError';
  }
}

export class ProviderError extends ProxyError {
  constructor(message: string, public provider: string, retryable: boolean = false) {
    super(message, 'provider_error', 502, retryable);
    this.name = 'ProviderError';
  }
}

export const MODEL_ALIASES: Record<string, {provider: string; model: string}> = {
  'smart': {provider: 'anthropic', model: 'claude-opus-4'},
  'fast': {provider: 'anthropic', model: 'claude-sonnet-4'},
  'cheap': {provider: 'anthropic', model: 'claude-haiku'},
  'gpt4': {provider: 'openai', model: 'gpt-4o'},
};
