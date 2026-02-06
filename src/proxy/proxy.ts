/**
 * LLM Proxy Core
 * 
 * Main proxy class that orchestrates provider adapters, security, caching,
 * and request routing for unified LLM access control.
 * 
 * @module proxy/proxy
 */

import { EventEmitter } from 'events';
import { 
  ProxyConfig,
  ProviderConfig,
  CompletionRequest,
  CompletionResponse,
  StreamChunk,
  AuthContext,
  ModelInfo,
  ProviderAdapter,
  HealthStatus,
  ProxyHealthStatus,
  AuditLogEntry,
  TokenUsage,
  ProxyError,
  ProxyErrorCode,
  RoutingHints
} from './types.js';
import { 
  createAdapter, 
  AnthropicAdapter, 
  OpenAIAdapter, 
  GoogleAdapter, 
  GroqAdapter 
} from './adapters.js';
import { ProxySecurity, SecurityConfig } from './security.js';
import { ResponseCache, CacheConfig } from './cache.js';

// =============================================================================
// Proxy Configuration
// =============================================================================

/**
 * Extended proxy configuration with nested configs
 */
export interface LlmProxyConfig extends ProxyConfig {
  /** Security configuration */
  security?: Partial<SecurityConfig>;
  
  /** Cache configuration */
  cache?: Partial<CacheConfig>;
  
  /** Default request timeout in ms */
  requestTimeout?: number;
  
  /** Maximum retries for failed requests */
  maxRetries?: number;
  
  /** Enable request/response logging */
  enableRequestLogging?: boolean;
  
  /** Custom headers to add to provider requests */
  customHeaders?: Record<string, string>;
}

/**
 * Default proxy configuration
 */
export const DEFAULT_PROXY_CONFIG: LlmProxyConfig = {
  requireAuth: true,
  rateLimiting: {
    requestsPerMinute: 60,
    tokensPerMinute: 100000,
    burstSize: 10
  },
  providers: [],
  defaultModel: 'claude-sonnet-4',
  defaultProvider: 'anthropic',
  enableStreaming: true,
  enableCaching: true,
  cacheTtl: 3600,
  logLevel: 'info',
  auditLog: true,
  security: {},
  cache: {},
  requestTimeout: 60000,
  maxRetries: 2
};

// =============================================================================
// Request Context
// =============================================================================

/**
 * Context for a single request
 */
export interface RequestContext {
  /** Request ID */
  id: string;
  
  /** Request start time */
  startTime: number;
  
  /** Authentication context */
  auth: AuthContext;
  
  /** Selected provider */
  provider?: string;
  
  /** Selected model */
  model?: string;
  
  /** Whether response was cached */
  cached?: boolean;
  
  /** Request cost */
  cost?: number;
  
  /** Token usage */
  usage?: TokenUsage;
  
  /** Error if request failed */
  error?: ProxyError;
  
  /** Duration in ms */
  duration?: number;
}

// =============================================================================
// Audit Logger
// =============================================================================

/**
 * Simple audit logger for request tracking
 */
class AuditLogger {
  private entries: AuditLogEntry[] = [];
  private maxEntries: number;
  private enabled: boolean;
  
  constructor(config: { enabled: boolean; maxEntries: number }) {
    this.enabled = config.enabled;
    this.maxEntries = config.maxEntries;
  }
  
  log(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): void {
    if (!this.enabled) return;
    
    const fullEntry: AuditLogEntry = {
      ...entry,
      id: this.generateId(),
      timestamp: new Date()
    };
    
    this.entries.push(fullEntry);
    
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }
  }
  
  getEntries(options: {
    userId?: string;
    since?: Date;
    limit?: number;
  } = {}): AuditLogEntry[] {
    let filtered = this.entries;
    
    if (options.userId) {
      filtered = filtered.filter(e => e.userId === options.userId);
    }
    
    if (options.since) {
      filtered = filtered.filter(e => e.timestamp >= options.since!);
    }
    
    const limit = options.limit || 100;
    return filtered.slice(-limit);
  }
  
  private generateId(): string {
    return `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

// =============================================================================
// Main LLM Proxy Class
// =============================================================================

/**
 * Main LLM Proxy class
 * 
 * Provides unified access to multiple LLM providers with:
 * - Authentication and authorization
 * - Rate limiting
 * - Request routing and load balancing
 * - Response caching
 * - Audit logging
 * - Provider failover
 */
export class LlmProxy extends EventEmitter {
  private config: LlmProxyConfig;
  private adapters: Map<string, ProviderAdapter> = new Map();
  private providerConfigs: Map<string, ProviderConfig> = new Map();
  private security: ProxySecurity;
  private cache: ResponseCache;
  private auditLogger: AuditLogger;
  private requestCount: number = 0;
  private errorCount: number = 0;
  
  constructor(config: Partial<LlmProxyConfig> = {}) {
    super();
    
    this.config = { ...DEFAULT_PROXY_CONFIG, ...config };
    this.security = new ProxySecurity(this.config.security);
    this.cache = new ResponseCache(this.config.cache);
    this.auditLogger = new AuditLogger({
      enabled: this.config.auditLog,
      maxEntries: 10000
    });
    
    // Register initial providers
    for (const provider of this.config.providers) {
      this.registerProvider(provider);
    }
  }
  
  /**
   * Initialize the proxy (connect to cache, etc.)
   */
  async initialize(): Promise<void> {
    await this.cache.initialize();
    this.emit('initialized');
  }
  
  // ==========================================================================
  // Provider Management
  // ==========================================================================
  
  /**
   * Register a new provider
   */
  registerProvider(config: ProviderConfig): void {
    if (!config.enabled) return;
    
    try {
      const adapter = createAdapter(config.type, {
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        defaultModel: config.defaultModel
      });
      
      this.adapters.set(config.id, adapter);
      this.providerConfigs.set(config.id, config);
      
      this.emit('provider:registered', { id: config.id, name: config.name });
      
      if (this.config.logLevel === 'debug') {
        console.log(`[Proxy] Registered provider: ${config.name} (${config.id})`);
      }
    } catch (error) {
      console.error(`[Proxy] Failed to register provider ${config.id}:`, error);
      throw error;
    }
  }
  
  /**
   * Unregister a provider
   */
  unregisterProvider(providerId: string): void {
    this.adapters.delete(providerId);
    this.providerConfigs.delete(providerId);
    this.emit('provider:unregistered', { id: providerId });
  }
  
  /**
   * Get provider configuration
   */
  getProvider(providerId: string): ProviderConfig | undefined {
    return this.providerConfigs.get(providerId);
  }
  
  /**
   * Get all registered providers
   */
  getAllProviders(): ProviderConfig[] {
    return Array.from(this.providerConfigs.values());
  }
  
  /**
   * Update provider configuration
   */
  updateProvider(providerId: string, updates: Partial<ProviderConfig>): void {
    const existing = this.providerConfigs.get(providerId);
    if (!existing) {
      throw new Error(`Provider ${providerId} not found`);
    }
    
    const updated = { ...existing, ...updates };
    this.providerConfigs.set(providerId, updated);
    
    // Re-create adapter if API key or base URL changed
    if (updates.apiKey || updates.baseUrl || updates.defaultModel) {
      this.unregisterProvider(providerId);
      this.registerProvider(updated);
    }
  }
  
  // ==========================================================================
  // Main Request Handling
  // ==========================================================================
  
  /**
   * Handle a completion request
   */
  async handleCompletion(
    req: CompletionRequest, 
    auth: AuthContext
  ): Promise<CompletionResponse> {
    const requestId = this.generateRequestId();
    const context: RequestContext = {
      id: requestId,
      startTime: Date.now(),
      auth
    };
    
    this.requestCount++;
    
    try {
      // Authenticate
      await this.authenticate(auth, context);
      
      // Check rate limit
      await this.checkRateLimit(auth, req, context);
      
      // Check permissions
      await this.checkPermissions(auth, 'completion', context);
      
      // Filter input
      await this.filterInput(req, context);
      
      // Check cache
      const cached = await this.checkCache(req, context);
      if (cached) {
        this.emit('request:complete', context);
        return cached;
      }
      
      // Select provider and model
      const provider = this.selectProvider(req);
      const model = this.selectModel(provider, req.model);
      
      context.provider = provider.id;
      context.model = model;
      
      // Check model access
      if (auth.userId) {
        const user = await this.getUserFromAuth(auth);
        if (user && !this.security.checkModelAccess(user, model)) {
          throw this.createError('AUTHORIZATION_FAILED', 'Model access denied');
        }
      }
      
      // Log request
      this.logRequest(req, context);
      
      // Transform and send request
      const adapter = this.adapters.get(provider.id);
      if (!adapter) {
        throw this.createError('PROVIDER_UNAVAILABLE', `Provider ${provider.id} not available`);
      }
      
      const providerReq = adapter.transformRequest({ ...req, model });
      const response = await this.sendRequest(provider, adapter, providerReq, req);
      
      // Transform response
      const transformed = adapter.transformResponse(response);
      transformed.provider = provider.id;
      
      // Filter output
      await this.filterOutput(transformed.content, context);
      
      // Cache response
      await this.cacheResponse(req, transformed, context);
      
      // Update context
      context.cost = transformed.cost;
      context.usage = transformed.usage;
      context.duration = Date.now() - context.startTime;
      
      // Record usage for rate limiting
      if (auth.userId) {
        this.security.recordUsage(auth.userId, model, transformed.usage.total_tokens);
      }
      
      // Log response
      this.logResponse(transformed, context);
      
      this.emit('request:complete', context);
      
      return transformed;
    } catch (error) {
      this.errorCount++;
      context.error = error instanceof Error ? this.convertError(error) : undefined;
      context.duration = Date.now() - context.startTime;
      
      this.emit('request:error', context);
      
      // Attempt fallback if allowed
      if (this.shouldUseFallback(error) && req.routing?.fallbackAllowed !== false) {
        return this.handleFallback(req, auth, context, error);
      }
      
      throw error;
    }
  }
  
  /**
   * Handle streaming completion
   */
  async *handleStreaming(
    req: CompletionRequest,
    auth: AuthContext
  ): AsyncIterable<StreamChunk> {
    const requestId = this.generateRequestId();
    const context: RequestContext = {
      id: requestId,
      startTime: Date.now(),
      auth
    };
    
    this.requestCount++;
    
    try {
      // Pre-flight checks
      await this.authenticate(auth, context);
      await this.checkRateLimit(auth, req, context);
      await this.checkPermissions(auth, 'stream', context);
      
      // Streaming doesn't use cache
      
      // Select provider
      const provider = this.selectProvider(req);
      const model = this.selectModel(provider, req.model);
      
      context.provider = provider.id;
      context.model = model;
      
      const adapter = this.adapters.get(provider.id);
      if (!adapter) {
        throw this.createError('PROVIDER_UNAVAILABLE', `Provider ${provider.id} not available`);
      }
      
      // Transform request with streaming enabled
      const providerReq = adapter.transformRequest({ ...req, model, stream: true });
      
      // Stream the response
      const stream = await this.sendStreamingRequest(provider, adapter, providerReq);
      
      let totalTokens = 0;
      let finishReason: string | undefined;
      
      for await (const chunk of stream) {
        const transformed = adapter.transformStreamChunk(chunk);
        
        if (transformed.usage) {
          totalTokens = transformed.usage.total_tokens;
        }
        
        if (transformed.finishReason) {
          finishReason = transformed.finishReason;
        }
        
        yield transformed;
      }
      
      // Record usage after stream completes
      if (auth.userId) {
        this.security.recordUsage(auth.userId, model, totalTokens || req.max_tokens || 1000);
      }
      
      context.duration = Date.now() - context.startTime;
      this.emit('stream:complete', context);
      
    } catch (error) {
      this.errorCount++;
      context.error = error instanceof Error ? this.convertError(error) : undefined;
      context.duration = Date.now() - context.startTime;
      
      this.emit('stream:error', context);
      throw error;
    }
  }
  
  // ==========================================================================
  // Authentication & Security
  // ==========================================================================
  
  private async authenticate(auth: AuthContext, context: RequestContext): Promise<void> {
    const result = await this.security.authenticate(auth);
    
    if (!result.authenticated) {
      throw this.createError('AUTHENTICATION_FAILED', result.error || 'Authentication failed');
    }
  }
  
  private async checkRateLimit(
    auth: AuthContext, 
    req: CompletionRequest,
    context: RequestContext
  ): Promise<void> {
    if (!auth.userId) return;
    
    const status = this.security.checkRateLimit(auth.userId, req.model);
    
    if (!status.allowed) {
      throw this.createError(
        'RATE_LIMIT_EXCEEDED',
        `Rate limit exceeded. Retry after ${status.retryAfter}s`,
        { limit: status.limit, resetAt: status.resetAt }
      );
    }
  }
  
  private async checkPermissions(
    auth: AuthContext, 
    action: string,
    context: RequestContext
  ): Promise<void> {
    if (!this.config.requireAuth) return;
    
    const user = await this.getUserFromAuth(auth);
    if (!user) {
      throw this.createError('AUTHORIZATION_FAILED', 'User not found');
    }
    
    if (!this.security.checkPermissions(user, action)) {
      throw this.createError('AUTHORIZATION_FAILED', 'Permission denied');
    }
  }
  
  private async getUserFromAuth(auth: AuthContext) {
    // This would fetch user from database in production
    if (!auth.userId) return null;
    
    return {
      id: auth.userId,
      email: 'user@example.com',
      roles: auth.roles || ['basic']
    };
  }
  
  // ==========================================================================
  // Content Filtering
  // ==========================================================================
  
  private async filterInput(req: CompletionRequest, context: RequestContext): Promise<void> {
    const result = this.security.filterInput(req.messages);
    
    if (!result.passed) {
      throw this.createError(
        'CONTENT_FILTERED',
        `Input content filtered: ${result.reason}`,
        { matches: result.matches }
      );
    }
    
    // Check for PII
    const content = req.messages
      .map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content))
      .join(' ');
    
    const piiReport = this.security.detectPII(content);
    if (piiReport.detected) {
      // Log but don't block - could add config to block on PII detection
      this.emit('security:pii_detected', { context, report: piiReport });
    }
  }
  
  private async filterOutput(content: string, context: RequestContext): Promise<void> {
    const result = this.security.filterOutput(content);
    
    if (!result.passed) {
      throw this.createError(
        'CONTENT_FILTERED',
        `Output content filtered: ${result.reason}`
      );
    }
  }
  
  // ==========================================================================
  // Routing
  // ==========================================================================
  
  /**
   * Select the best provider for a request
   */
  private selectProvider(req: CompletionRequest): ProviderConfig {
    // Use preferred provider if specified
    if (req.routing?.preferredProvider) {
      const preferred = this.providerConfigs.get(req.routing.preferredProvider);
      if (preferred?.enabled) return preferred;
    }
    
    // Get enabled providers sorted by priority
    const enabled = Array.from(this.providerConfigs.values())
      .filter(p => p.enabled)
      .sort((a, b) => a.priority - b.priority);
    
    if (enabled.length === 0) {
      throw this.createError('PROVIDER_UNAVAILABLE', 'No providers available');
    }
    
    // Check model compatibility
    const model = req.model;
    const compatibleProviders = enabled.filter(p => {
      const adapter = this.adapters.get(p.id);
      if (!adapter) return false;
      
      const mapped = adapter.mapModel(model);
      return p.models.includes(mapped) || p.models.includes(model);
    });
    
    if (compatibleProviders.length > 0) {
      return compatibleProviders[0];
    }
    
    // Fall back to default provider
    const defaultProvider = this.providerConfigs.get(this.config.defaultProvider);
    if (defaultProvider?.enabled) {
      return defaultProvider;
    }
    
    // Use first available provider
    return enabled[0];
  }
  
  /**
   * Select the appropriate model for a provider
   */
  private selectModel(provider: ProviderConfig, hint: string): string {
    const adapter = this.adapters.get(provider.id);
    if (!adapter) return provider.defaultModel;
    
    return adapter.mapModel(hint);
  }
  
  /**
   * Determine if error warrants a fallback
   */
  private shouldUseFallback(error: unknown): boolean {
    if (error && typeof error === 'object' && 'code' in error) {
      const code = (error as { code: string }).code;
      return ['PROVIDER_UNAVAILABLE', 'TIMEOUT', 'RATE_LIMIT_EXCEEDED'].includes(code);
    }
    return false;
  }
  
  /**
   * Handle fallback to another provider
   */
  private async handleFallback(
    req: CompletionRequest,
    auth: AuthContext,
    context: RequestContext,
    originalError: unknown
  ): Promise<CompletionResponse> {
    const currentProvider = context.provider;
    
    // Get other enabled providers
    const alternatives = Array.from(this.providerConfigs.values())
      .filter(p => p.enabled && p.id !== currentProvider)
      .sort((a, b) => a.priority - b.priority);
    
    for (const provider of alternatives) {
      try {
        console.log(`[Proxy] Attempting fallback to ${provider.name}`);
        
        const adapter = this.adapters.get(provider.id);
        if (!adapter) continue;
        
        const model = this.selectModel(provider, req.model);
        const providerReq = adapter.transformRequest({ ...req, model });
        
        const response = await this.sendRequest(provider, adapter, providerReq, req);
        const transformed = adapter.transformResponse(response);
        transformed.provider = provider.id;
        
        context.provider = provider.id;
        context.model = model;
        
        this.emit('request:fallback', { 
          originalProvider: currentProvider, 
          fallbackProvider: provider.id,
          context 
        });
        
        return transformed;
      } catch (fallbackError) {
        console.warn(`[Proxy] Fallback to ${provider.name} failed:`, fallbackError);
        continue;
      }
    }
    
    // No fallback succeeded
    throw originalError;
  }
  
  // ==========================================================================
  // Cache Operations
  // ==========================================================================
  
  private async checkCache(
    req: CompletionRequest, 
    context: RequestContext
  ): Promise<CompletionResponse | null> {
    if (!this.config.enableCaching || req.stream) return null;
    
    const key = this.cache.generateKey(req);
    const cached = await this.cache.get(key);
    
    if (cached) {
      context.cached = true;
      this.emit('cache:hit', { key, context });
      return cached;
    }
    
    this.emit('cache:miss', { key, context });
    return null;
  }
  
  private async cacheResponse(
    req: CompletionRequest,
    response: CompletionResponse,
    context: RequestContext
  ): Promise<void> {
    if (!this.config.enableCaching || req.stream) return;
    
    const key = this.cache.generateKey(req);
    await this.cache.set(key, response, this.config.cacheTtl);
    
    this.emit('cache:set', { key, context });
  }
  
  // ==========================================================================
  // Provider Requests
  // ==========================================================================
  
  private async sendRequest(
    provider: ProviderConfig,
    adapter: ProviderAdapter,
    providerReq: Record<string, unknown>,
    originalReq: CompletionRequest
  ): Promise<Record<string, unknown>> {
    const url = provider.baseUrl || this.getProviderBaseUrl(provider.type);
    const endpoint = provider.type === 'anthropic' ? '/messages' : '/chat/completions';
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.getProviderHeaders(provider)
    };
    
    if (this.config.customHeaders) {
      Object.assign(headers, this.config.customHeaders);
    }
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.requestTimeout);
    
    try {
      const response = await fetch(url + endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(providerReq),
        signal: controller.signal
      });
      
      clearTimeout(timeout);
      
      if (!response.ok) {
        const error = await response.text();
        throw this.createError(
          'PROVIDER_UNAVAILABLE',
          `Provider error: ${response.status} - ${error}`,
          { status: response.status, provider: provider.id }
        );
      }
      
      return await response.json();
    } catch (error) {
      clearTimeout(timeout);
      
      if (error instanceof Error && error.name === 'AbortError') {
        throw this.createError('TIMEOUT', 'Request timed out');
      }
      
      throw error;
    }
  }
  
  private async *sendStreamingRequest(
    provider: ProviderConfig,
    adapter: ProviderAdapter,
    providerReq: Record<string, unknown>
  ): AsyncIterable<unknown> {
    const url = provider.baseUrl || this.getProviderBaseUrl(provider.type);
    const endpoint = provider.type === 'anthropic' ? '/messages' : '/chat/completions';
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
      ...this.getProviderHeaders(provider)
    };
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.requestTimeout);
    
    try {
      const response = await fetch(url + endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(providerReq),
        signal: controller.signal
      });
      
      if (!response.ok) {
        clearTimeout(timeout);
        const error = await response.text();
        throw this.createError(
          'PROVIDER_UNAVAILABLE',
          `Provider error: ${response.status} - ${error}`
        );
      }
      
      if (!response.body) {
        clearTimeout(timeout);
        throw this.createError('INTERNAL_ERROR', 'No response body');
      }
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      
      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) break;
          
          // Reset timeout on each chunk
          clearTimeout(timeout);
          
          buffer += decoder.decode(value, { stream: true });
          
          // Process SSE lines
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              
              if (data === '[DONE]') {
                return;
              }
              
              try {
                const parsed = JSON.parse(data);
                yield parsed;
              } catch (e) {
                // Ignore parse errors for malformed chunks
              }
            }
          }
        }
      } finally {
        clearTimeout(timeout);
        reader.releaseLock();
      }
    } catch (error) {
      clearTimeout(timeout);
      
      if (error instanceof Error && error.name === 'AbortError') {
        throw this.createError('TIMEOUT', 'Streaming request timed out');
      }
      
      throw error;
    }
  }
  
  private getProviderBaseUrl(type: string): string {
    switch (type) {
      case 'anthropic':
        return 'https://api.anthropic.com/v1';
      case 'openai':
        return 'https://api.openai.com/v1';
      case 'google':
        return 'https://generativelanguage.googleapis.com/v1beta';
      case 'groq':
        return 'https://api.groq.com/openai/v1';
      case 'azure':
        throw new Error('Azure requires custom base URL');
      default:
        throw new Error(`Unknown provider type: ${type}`);
    }
  }
  
  private getProviderHeaders(provider: ProviderConfig): Record<string, string> {
    switch (provider.type) {
      case 'anthropic':
        return {
          'x-api-key': provider.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        };
      case 'openai':
      case 'groq':
        return {
          'Authorization': `Bearer ${provider.apiKey}`
        };
      case 'google':
        return {
          'x-goog-api-key': provider.apiKey
        };
      case 'azure':
        return {
          'api-key': provider.apiKey
        };
      default:
        return {};
    }
  }
  
  // ==========================================================================
  // Utilities
  // ==========================================================================
  
  /**
   * Get available models from all providers
   */
  async getModels(): Promise<ModelInfo[]> {
    const models: ModelInfo[] = [];
    
    for (const [id, adapter] of Array.from(this.adapters.entries())) {
      const config = this.providerConfigs.get(id);
      if (!config) continue;
      
      for (const modelId of config.models) {
        models.push({
          id: modelId,
          provider: id,
          name: `${config.name} ${modelId}`,
          capabilities: config.capabilities,
          contextWindow: this.getContextWindow(modelId),
          pricing: {
            inputPer1k: config.pricing.inputPer1k,
            outputPer1k: config.pricing.outputPer1k
          },
          aliases: this.getModelAliases(adapter, modelId)
        });
      }
    }
    
    return models;
  }
  
  /**
   * Check overall proxy health
   */
  async checkHealth(): Promise<ProxyHealthStatus> {
    const providerHealth: HealthStatus[] = [];
    
    for (const [id, adapter] of Array.from(this.adapters.entries())) {
      const health = await adapter.checkHealth();
      providerHealth.push(health);
    }
    
    const cacheHealth = await this.cache.checkHealth();
    
    return {
      healthy: providerHealth.some(p => p.healthy),
      providers: providerHealth,
      cache: cacheHealth,
      rateLimiter: { healthy: true },
      checkedAt: new Date()
    };
  }
  
  /**
   * Get proxy statistics
   */
  getStats(): {
    requestCount: number;
    errorCount: number;
    errorRate: number;
    providerCount: number;
  } {
    return {
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      errorRate: this.requestCount > 0 ? this.errorCount / this.requestCount : 0,
      providerCount: this.adapters.size
    };
  }
  
  /**
   * Get audit log entries
   */
  getAuditLog(options?: Parameters<AuditLogger['getEntries']>[0]): AuditLogEntry[] {
    return this.auditLogger.getEntries(options);
  }
  
  // ==========================================================================
  // Logging
  // ==========================================================================
  
  private logRequest(req: CompletionRequest, context: RequestContext): void {
    if (!this.config.auditLog) return;
    
    this.auditLogger.log({
      requestId: context.id,
      userId: context.auth.userId,
      tenantId: context.auth.tenantId,
      ipAddress: context.auth.ipAddress || 'unknown',
      request: {
        model: req.model,
        provider: context.provider || 'unknown',
        messages: req.messages.length,
        tools: req.tools?.length,
        streaming: req.stream || false
      }
    });
    
    if (this.config.logLevel === 'debug') {
      console.log(`[Proxy] Request ${context.id}: ${req.model} via ${context.provider}`);
    }
  }
  
  private logResponse(res: CompletionResponse, context: RequestContext): void {
    if (!this.config.auditLog) return;
    
    this.auditLogger.log({
      requestId: context.id,
      userId: context.auth.userId,
      tenantId: context.auth.tenantId,
      ipAddress: context.auth.ipAddress || 'unknown',
      request: {
        model: res.model,
        provider: res.provider,
        messages: 0,
        streaming: false
      },
      response: {
        status: context.cached ? 'cached' : 'success',
        tokens: res.usage,
        cost: res.cost,
        duration: context.duration || 0
      }
    });
  }
  
  // ==========================================================================
  // Helpers
  // ==========================================================================
  
  private generateRequestId(): string {
    return `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  private createError(
    code: ProxyErrorCode, 
    message: string, 
    details?: Record<string, unknown>
  ): ProxyError {
    const statusCodes: Record<ProxyErrorCode, number> = {
      'AUTHENTICATION_FAILED': 401,
      'AUTHORIZATION_FAILED': 403,
      'RATE_LIMIT_EXCEEDED': 429,
      'PROVIDER_UNAVAILABLE': 503,
      'MODEL_NOT_FOUND': 404,
      'INVALID_REQUEST': 400,
      'CONTENT_FILTERED': 400,
      'PII_DETECTED': 400,
      'COST_LIMIT_EXCEEDED': 429,
      'TIMEOUT': 504,
      'INTERNAL_ERROR': 500
    };
    
    return {
      code,
      message,
      statusCode: statusCodes[code] || 500,
      details
    };
  }
  
  private convertError(error: Error): ProxyError {
    return {
      code: 'INTERNAL_ERROR',
      message: error.message,
      statusCode: 500
    };
  }
  
  private getContextWindow(model: string): number {
    // Simplified context window lookup
    const windows: Record<string, number> = {
      'claude-opus-4': 200000,
      'claude-sonnet-4': 200000,
      'claude-haiku': 200000,
      'gpt-4o': 128000,
      'gpt-4o-mini': 128000,
      'gpt-4-turbo': 128000,
      'gpt-3.5-turbo': 16385,
      'gemini-2.0-pro': 2000000,
      'gemini-2.0-flash': 1000000,
      'gemini-1.5-pro': 2000000,
      'gemini-1.5-flash': 1000000
    };
    
    return windows[model] || 4096;
  }
  
  private getModelAliases(adapter: ProviderAdapter, model: string): string[] {
    const aliases: string[] = [];
    const aliasMap: Record<string, string[]> = {
      'claude-opus-4': ['smart'],
      'claude-sonnet-4': ['fast'],
      'claude-haiku': ['cheap'],
      'gpt-4o': ['smart'],
      'gpt-4o-mini': ['fast', 'cheap'],
      'gemini-2.0-pro': ['smart'],
      'gemini-2.0-flash': ['fast', 'cheap']
    };
    
    return aliasMap[model] || [];
  }
  
  // ==========================================================================
  // Lifecycle
  // ==========================================================================
  
  /**
   * Close the proxy and cleanup resources
   */
  async close(): Promise<void> {
    await this.cache.close();
    this.removeAllListeners();
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a proxy with common provider configurations
 */
export function createDefaultProxy(options: {
  anthropicKey?: string;
  openaiKey?: string;
  googleKey?: string;
  groqKey?: string;
} = {}): LlmProxy {
  const providers: ProviderConfig[] = [];
  
  if (options.anthropicKey) {
    providers.push({
      id: 'anthropic',
      name: 'Anthropic',
      type: 'anthropic',
      apiKey: options.anthropicKey,
      defaultModel: 'claude-sonnet-4',
      models: [
        'claude-opus-4',
        'claude-opus-4-5',
        'claude-sonnet-4',
        'claude-sonnet-4-5',
        'claude-haiku',
        'claude-3-opus-20240229',
        'claude-3-sonnet-20240229',
        'claude-3-haiku-20240307',
        'claude-3-5-sonnet-20241022'
      ],
      capabilities: ['streaming', 'tools', 'vision', 'system_prompt'],
      pricing: { inputPer1k: 3.0, outputPer1k: 15.0, currency: 'USD' },
      enabled: true,
      priority: 1
    });
  }
  
  if (options.openaiKey) {
    providers.push({
      id: 'openai',
      name: 'OpenAI',
      type: 'openai',
      apiKey: options.openaiKey,
      defaultModel: 'gpt-4o',
      models: [
        'gpt-4o',
        'gpt-4o-mini',
        'gpt-4-turbo',
        'gpt-4',
        'gpt-3.5-turbo',
        'gpt-4o-2024-08-06'
      ],
      capabilities: ['streaming', 'tools', 'vision', 'json_mode'],
      pricing: { inputPer1k: 2.5, outputPer1k: 10.0, currency: 'USD' },
      enabled: true,
      priority: 2
    });
  }
  
  if (options.googleKey) {
    providers.push({
      id: 'google',
      name: 'Google',
      type: 'google',
      apiKey: options.googleKey,
      defaultModel: 'gemini-2.0-flash',
      models: [
        'gemini-2.0-flash',
        'gemini-2.0-pro',
        'gemini-1.5-flash',
        'gemini-1.5-pro',
        'gemini-1.0-pro'
      ],
      capabilities: ['streaming', 'vision', 'multimodal'],
      pricing: { inputPer1k: 0.075, outputPer1k: 0.3, currency: 'USD' },
      enabled: true,
      priority: 3
    });
  }
  
  if (options.groqKey) {
    providers.push({
      id: 'groq',
      name: 'Groq',
      type: 'groq',
      apiKey: options.groqKey,
      defaultModel: 'llama-3.1-70b-versatile',
      models: [
        'llama-3.1-405b-reasoning',
        'llama-3.1-70b-versatile',
        'llama-3.1-8b-instant',
        'mixtral-8x7b-32768',
        'gemma2-9b-it',
        'llama3-70b-8192',
        'llama3-8b-8192'
      ],
      capabilities: ['streaming', 'fast_inference'],
      pricing: { inputPer1k: 0.59, outputPer1k: 0.79, currency: 'USD' },
      enabled: true,
      priority: 4
    });
  }
  
  return new LlmProxy({ providers });
}
