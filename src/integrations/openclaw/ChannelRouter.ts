/**
 * ChannelRouter.ts
 * 
 * OpenClaw Channel Router
 * Routes tasks across multiple channels with fallback and aggregation
 * per OpenClaw Integration Spec section 3.3
 */

import { 
  ChannelConfig, 
  ChannelType, 
  ChannelStatus,
  ChannelPriority,
  ChannelUtils,
  ChannelFactory,
  PREDEFINED_CHANNELS 
} from './ChannelConfig';
import { 
  ResponseAggregator, 
  AggregatedResponse, 
  ChannelResponse,
  AggregationConfig,
  DEFAULT_AGGREGATION_CONFIG,
  LatencyOptimizer,
  ConflictResolver
} from './ResponseAggregator';
import { EventEmitter } from 'events';

// ============================================================================
// TYPES
// ============================================================================

export interface RouteRequest {
  id: string;
  task: string;
  channels?: string[];           // Specific channels to use
  channelTypes?: ChannelType[];  // Types of channels to use
  priority?: 'low' | 'normal' | 'high' | 'critical';
  timeout?: number;
  requireAll?: boolean;          // Wait for all channels to respond
  minResponses?: number;         // Minimum responses needed
  metadata?: Record<string, unknown>;
}

export interface RouteResult {
  requestId: string;
  success: boolean;
  aggregatedResponse?: AggregatedResponse;
  channelResults: ChannelResult[];
  errors: ChannelError[];
  metrics: RouteMetrics;
}

export interface ChannelResult {
  channelId: string;
  success: boolean;
  messageId?: string;
  latency: number;
  response?: ChannelResponse;
  error?: string;
}

export interface ChannelError {
  channelId: string;
  error: string;
  code: string;
  retryable: boolean;
}

export interface RouteMetrics {
  totalLatency: number;
  channelsAttempted: number;
  channelsSucceeded: number;
  channelsFailed: number;
  fallbackUsed: boolean;
}

export interface RoutingRule {
  id: string;
  name: string;
  condition: RouteCondition;
  action: RouteAction;
  priority: number;
  enabled: boolean;
}

export interface RouteCondition {
  taskPattern?: RegExp;
  channelTypes?: ChannelType[];
  minPriority?: 'low' | 'normal' | 'high' | 'critical';
  timeWindow?: { start: number; end: number };  // 0-24
}

export interface RouteAction {
  targetChannels: string[];
  strategy: 'broadcast' | 'round_robin' | 'least_loaded' | 'fastest';
  fallbackChannels?: string[];
  aggregationConfig?: Partial<AggregationConfig>;
}

export interface RouterConfig {
  gatewayUrl: string;
  defaultTimeout: number;
  maxRetries: number;
  retryDelay: number;
  enableAggregation: boolean;
  enableFallback: boolean;
  defaultStrategy: RouteAction['strategy'];
}

export const DEFAULT_ROUTER_CONFIG: RouterConfig = {
  gatewayUrl: 'ws://127.0.0.1:18789',
  defaultTimeout: 5000,
  maxRetries: 3,
  retryDelay: 1000,
  enableAggregation: true,
  enableFallback: true,
  defaultStrategy: 'broadcast',
};

// ============================================================================
// GATEWAY CLIENT INTERFACE
// ============================================================================

export interface GatewayClient {
  send(channelId: string, message: string, options?: SendOptions): Promise<SendResult>;
  isConnected(): boolean;
  getChannelStatus(channelId: string): Promise<ChannelStatus>;
}

export interface SendOptions {
  timeout?: number;
  replyTo?: string;
  attachments?: unknown[];
  metadata?: Record<string, unknown>;
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  timestamp: Date;
}

// ============================================================================
// CHANNEL ROUTER
// ============================================================================

export class ChannelRouter extends EventEmitter {
  private config: RouterConfig;
  private channels = new Map<string, ChannelConfig>();
  private rules: RoutingRule[] = [];
  private aggregator: ResponseAggregator;
  private gateway: GatewayClient | null = null;
  private activeRoutes = new Map<string, ActiveRoute>();
  private requestQueue: QueuedRequest[] = [];
  private processingQueue = false;
  
  constructor(
    config: Partial<RouterConfig> = {},
    gateway?: GatewayClient
  ) {
    super();
    this.config = { ...DEFAULT_ROUTER_CONFIG, ...config };
    this.aggregator = new ResponseAggregator({}, this.channels);
    this.gateway = gateway || null;
    
    // Initialize with predefined channels
    this.initializeDefaultChannels();
  }
  
  // ========================================================================
  // INITIALIZATION
  // ========================================================================
  
  private initializeDefaultChannels(): void {
    // Add predefined channels
    for (const [key, factory] of Object.entries(PREDEFINED_CHANNELS)) {
      const channel = factory();
      this.channels.set(channel.id, channel);
    }
  }
  
  /**
   * Set the gateway client
   */
  setGateway(gateway: GatewayClient): void {
    this.gateway = gateway;
  }
  
  /**
   * Add a channel
   */
  addChannel(config: ChannelConfig): void {
    this.channels.set(config.id, config);
    this.aggregator.updateChannelConfigs(this.channels);
    this.emit('channel:added', config);
  }
  
  /**
   * Remove a channel
   */
  removeChannel(channelId: string): boolean {
    const deleted = this.channels.delete(channelId);
    if (deleted) {
      this.aggregator.updateChannelConfigs(this.channels);
      this.emit('channel:removed', channelId);
    }
    return deleted;
  }
  
  /**
   * Get a channel configuration
   */
  getChannel(channelId: string): ChannelConfig | undefined {
    return this.channels.get(channelId);
  }
  
  /**
   * Get all channels
   */
  getAllChannels(): ChannelConfig[] {
    return Array.from(this.channels.values());
  }
  
  /**
   * Get channels by type
   */
  getChannelsByType(type: ChannelType): ChannelConfig[] {
    return this.getAllChannels().filter(c => c.type === type);
  }
  
  /**
   * Get channels by priority
   */
  getChannelsByPriority(priority: ChannelPriority): ChannelConfig[] {
    return this.getAllChannels().filter(c => c.priority === priority);
  }
  
  /**
   * Get healthy channels
   */
  getHealthyChannels(): ChannelConfig[] {
    return this.getAllChannels().filter(c => ChannelUtils.isHealthy(c));
  }
  
  // ========================================================================
  // ROUTING RULES
  // ========================================================================
  
  /**
   * Add a routing rule
   */
  addRule(rule: RoutingRule): void {
    this.rules.push(rule);
    this.rules.sort((a, b) => b.priority - a.priority);
  }
  
  /**
   * Remove a routing rule
   */
  removeRule(ruleId: string): boolean {
    const index = this.rules.findIndex(r => r.id === ruleId);
    if (index >= 0) {
      this.rules.splice(index, 1);
      return true;
    }
    return false;
  }
  
  /**
   * Get all routing rules
   */
  getRules(): RoutingRule[] {
    return [...this.rules];
  }
  
  /**
   * Match a request against routing rules
   */
  matchRules(request: RouteRequest): RoutingRule | null {
    for (const rule of this.rules) {
      if (!rule.enabled) continue;
      if (this.matchesCondition(request, rule.condition)) {
        return rule;
      }
    }
    return null;
  }
  
  private matchesCondition(request: RouteRequest, condition: RouteCondition): boolean {
    // Check task pattern
    if (condition.taskPattern && !condition.taskPattern.test(request.task)) {
      return false;
    }
    
    // Check channel types
    if (condition.channelTypes) {
      const requestTypes = request.channelTypes || [];
      const hasMatchingType = condition.channelTypes.some(t => requestTypes.includes(t));
      if (!hasMatchingType) return false;
    }
    
    // Check priority
    if (condition.minPriority) {
      const priorityLevels = { low: 0, normal: 1, high: 2, critical: 3 };
      const requestLevel = priorityLevels[request.priority || 'normal'];
      const minLevel = priorityLevels[condition.minPriority];
      if (requestLevel < minLevel) return false;
    }
    
    // Check time window
    if (condition.timeWindow) {
      const hour = new Date().getHours();
      if (hour < condition.timeWindow.start || hour >= condition.timeWindow.end) {
        return false;
      }
    }
    
    return true;
  }
  
  // ========================================================================
  // ROUTING
  // ========================================================================
  
  /**
   * Route a task to channels
   */
  async route(request: RouteRequest): Promise<RouteResult> {
    const startTime = Date.now();
    const channelResults: ChannelResult[] = [];
    const errors: ChannelError[] = [];
    
    // Determine target channels
    const targetChannels = this.selectTargetChannels(request);
    
    if (targetChannels.length === 0) {
      return {
        requestId: request.id,
        success: false,
        channelResults: [],
        errors: [{
          channelId: 'router',
          error: 'No available channels for routing',
          code: 'NO_CHANNELS',
          retryable: false,
        }],
        metrics: {
          totalLatency: Date.now() - startTime,
          channelsAttempted: 0,
          channelsSucceeded: 0,
          channelsFailed: 0,
          fallbackUsed: false,
        },
      };
    }
    
    // Start aggregation
    let aggregation: AggregatedResponse | undefined;
    if (this.config.enableAggregation) {
      aggregation = this.aggregator.startAggregation(request.id);
    }
    
    // Track active route
    const activeRoute: ActiveRoute = {
      request,
      channels: new Map(),
      startTime,
    };
    this.activeRoutes.set(request.id, activeRoute);
    
    // Route to each channel
    const routePromises = targetChannels.map(async (channelId) => {
      try {
        const result = await this.routeToChannel(request, channelId);
        channelResults.push(result);
        
        if (result.success && result.response && aggregation) {
          this.aggregator.addResponse(request.id, result.response);
        }
        
        return result;
      } catch (error) {
        const errorResult: ChannelResult = {
          channelId,
          success: false,
          latency: Date.now() - startTime,
          error: error instanceof Error ? error.message : String(error),
        };
        channelResults.push(errorResult);
        
        errors.push({
          channelId,
          error: errorResult.error || 'Unknown error',
          code: 'ROUTE_ERROR',
          retryable: true,
        });
        
        return errorResult;
      }
    });
    
    // Wait for responses with timeout
    const timeout = request.timeout || this.config.defaultTimeout;
    
    if (request.requireAll) {
      // Wait for all channels
      await Promise.all(routePromises);
    } else {
      // Wait for minimum responses or timeout
      const minResponses = request.minResponses || 1;
      await this.waitForMinResponses(routePromises, minResponses, timeout);
    }
    
    // Check if we need fallback
    const succeededCount = channelResults.filter(r => r.success).length;
    let fallbackUsed = false;
    
    if (succeededCount === 0 && this.config.enableFallback) {
      const fallbackResult = await this.executeFallback(request, channelResults);
      fallbackUsed = fallbackResult.success;
    }
    
    // Finalize aggregation
    if (aggregation && this.config.enableAggregation) {
      const pending = this.aggregator.getPending(request.id);
      if (pending) {
        // Force finalize
        this.aggregator.cancel(request.id);
      }
    }
    
    // Cleanup
    this.activeRoutes.delete(request.id);
    
    // Build result
    const totalLatency = Date.now() - startTime;
    const succeeded = channelResults.filter(r => r.success).length;
    
    // Update channel metrics
    for (const result of channelResults) {
      const channel = this.channels.get(result.channelId);
      if (channel) {
        ChannelUtils.updateMetrics(channel, result.success, result.latency);
      }
    }
    
    // Get final aggregation
    const finalAggregation = this.aggregator.getPending(request.id);
    if (finalAggregation) {
      this.aggregator.cancel(request.id);
    }
    
    return {
      requestId: request.id,
      success: succeeded > 0 || fallbackUsed,
      aggregatedResponse: finalAggregation || undefined,
      channelResults,
      errors,
      metrics: {
        totalLatency,
        channelsAttempted: targetChannels.length,
        channelsSucceeded: succeeded,
        channelsFailed: channelResults.length - succeeded,
        fallbackUsed,
      },
    };
  }
  
  /**
   * Route to a specific channel
   */
  private async routeToChannel(
    request: RouteRequest,
    channelId: string
  ): Promise<ChannelResult> {
    const channel = this.channels.get(channelId);
    if (!channel) {
      throw new Error(`Channel ${channelId} not found`);
    }
    
    const startTime = Date.now();
    
    // Check channel health
    if (!ChannelUtils.isHealthy(channel)) {
      return {
        channelId,
        success: false,
        latency: Date.now() - startTime,
        error: `Channel ${channelId} is not healthy (${channel.status})`,
      };
    }
    
    // Prepare message for channel
    const message = this.prepareMessageForChannel(request.task, channel);
    
    // Send via gateway
    if (!this.gateway) {
      throw new Error('Gateway not configured');
    }
    
    const sendResult = await this.gateway.send(channelId, message, {
      timeout: request.timeout,
      metadata: request.metadata,
    });
    
    const latency = Date.now() - startTime;
    
    if (!sendResult.success) {
      return {
        channelId,
        success: false,
        latency,
        error: sendResult.error || 'Send failed',
      };
    }
    
    // Create channel response
    const response: ChannelResponse = {
      channelId,
      channelType: channel.type,
      messageId: sendResult.messageId,
      content: sendResult.success ? 'Acknowledged' : 'Failed',  // Placeholder
      timestamp: new Date(),
      latency,
      metadata: request.metadata || {},
    };
    
    return {
      channelId,
      success: true,
      messageId: sendResult.messageId,
      latency,
      response,
    };
  }
  
  /**
   * Select target channels for a request
   */
  private selectTargetChannels(request: RouteRequest): string[] {
    // Check for specific channel request
    if (request.channels && request.channels.length > 0) {
      return request.channels.filter(id => {
        const channel = this.channels.get(id);
        return channel && ChannelUtils.isHealthy(channel);
      });
    }
    
    // Check for channel type filter
    if (request.channelTypes && request.channelTypes.length > 0) {
      return this.getAllChannels()
        .filter(c => request.channelTypes!.includes(c.type))
        .filter(c => ChannelUtils.isHealthy(c))
        .map(c => c.id);
    }
    
    // Match against routing rules
    const rule = this.matchRules(request);
    if (rule) {
      return rule.action.targetChannels.filter(id => {
        const channel = this.channels.get(id);
        return channel && ChannelUtils.isHealthy(channel);
      });
    }
    
    // Default: use all healthy primary channels
    return this.getHealthyChannels()
      .filter(c => c.priority === 'primary')
      .map(c => c.id);
  }
  
  /**
   * Prepare message for channel constraints
   */
  private prepareMessageForChannel(task: string, channel: ChannelConfig): string {
    // Chunk if necessary
    if (task.length > channel.capabilities.maxMessageLength) {
      const chunks = ChannelUtils.chunkMessage(channel, task);
      return chunks[0];  // Return first chunk for now
    }
    
    // Format markdown
    return ChannelUtils.formatMarkdown(channel, task);
  }
  
  /**
   * Wait for minimum responses
   */
  private async waitForMinResponses(
    promises: Promise<ChannelResult>[],
    minCount: number,
    timeout: number
  ): Promise<void> {
    return new Promise((resolve) => {
      let resolved = 0;
      const timer = setTimeout(resolve, timeout);
      
      for (const promise of promises) {
        promise.then(() => {
          resolved++;
          if (resolved >= minCount) {
            clearTimeout(timer);
            resolve();
          }
        }).catch(() => {
          // Count failures too
          resolved++;
          if (resolved >= minCount) {
            clearTimeout(timer);
            resolve();
          }
        });
      }
    });
  }
  
  /**
   * Execute fallback routing
   */
  private async executeFallback(
    request: RouteRequest,
    primaryResults: ChannelResult[]
  ): Promise<{ success: boolean; results: ChannelResult[] }> {
    const failedChannels = new Set(primaryResults.filter(r => !r.success).map(r => r.channelId));
    
    // Get fallback channels
    const fallbackChannels = this.getHealthyChannels()
      .filter(c => !failedChannels.has(c.id))
      .filter(c => c.priority === 'fallback')
      .map(c => c.id);
    
    if (fallbackChannels.length === 0) {
      return { success: false, results: [] };
    }
    
    this.emit('routing:fallback', { request, fallbackChannels });
    
    const fallbackResults: ChannelResult[] = [];
    
    for (const channelId of fallbackChannels) {
      try {
        const result = await this.routeToChannel(request, channelId);
        fallbackResults.push(result);
        
        if (result.success) {
          return { success: true, results: fallbackResults };
        }
      } catch (error) {
        fallbackResults.push({
          channelId,
          success: false,
          latency: 0,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    
    return { success: false, results: fallbackResults };
  }
  
  // ========================================================================
  // QUEUE MANAGEMENT
  // ========================================================================
  
  /**
   * Queue a request for later processing
   */
  queueRequest(request: RouteRequest): void {
    this.requestQueue.push({
      request,
      attempts: 0,
      queuedAt: new Date(),
    });
    
    this.processQueue();
  }
  
  /**
   * Process the request queue
   */
  private async processQueue(): Promise<void> {
    if (this.processingQueue) return;
    this.processingQueue = true;
    
    while (this.requestQueue.length > 0) {
      const item = this.requestQueue.shift()!;
      
      try {
        await this.route(item.request);
      } catch (error) {
        this.emit('routing:error', { request: item.request, error });
        
        // Retry if attempts remaining
        if (item.attempts < this.config.maxRetries) {
          item.attempts++;
          this.requestQueue.push(item);
        }
      }
      
      // Small delay between requests
      await this.delay(this.config.retryDelay);
    }
    
    this.processingQueue = false;
  }
  
  // ========================================================================
  // UTILITY METHODS
  // ========================================================================
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Get router statistics
   */
  getStats(): RouterStats {
    const channels = this.getAllChannels();
    
    return {
      totalChannels: channels.length,
      healthyChannels: channels.filter(c => ChannelUtils.isHealthy(c)).length,
      activeRoutes: this.activeRoutes.size,
      queuedRequests: this.requestQueue.length,
      rules: this.rules.length,
      channelBreakdown: {
        telegram: this.getChannelsByType('telegram').length,
        whatsapp: this.getChannelsByType('whatsapp').length,
        discord: this.getChannelsByType('discord').length,
        slack: this.getChannelsByType('slack').length,
        signal: this.getChannelsByType('signal').length,
        imessage: this.getChannelsByType('imessage').length,
        webchat: this.getChannelsByType('webchat').length,
        matrix: this.getChannelsByType('matrix').length,
        teams: this.getChannelsByType('teams').length,
        main: this.getChannelsByType('main').length,
      },
    };
  }
  
  /**
   * Update channel status
   */
  updateChannelStatus(channelId: string, status: ChannelStatus): void {
    const channel = this.channels.get(channelId);
    if (channel) {
      channel.status = status;
      this.emit('channel:status', { channelId, status });
    }
  }
  
  /**
   * Get optimal channels for a task
   */
  getOptimalChannels(
    count: number,
    maxLatency?: number
  ): ChannelConfig[] {
    const healthy = this.getHealthyChannels();
    
    if (maxLatency) {
      return LatencyOptimizer.selectFastest(healthy, count, maxLatency);
    }
    
    // Rank by score
    return healthy
      .sort((a, b) => ChannelUtils.calculateScore(b) - ChannelUtils.calculateScore(a))
      .slice(0, count);
  }
}

// ============================================================================
// SUPPORTING TYPES
// ============================================================================

interface ActiveRoute {
  request: RouteRequest;
  channels: Map<string, ChannelResult>;
  startTime: number;
}

interface QueuedRequest {
  request: RouteRequest;
  attempts: number;
  queuedAt: Date;
}

export interface RouterStats {
  totalChannels: number;
  healthyChannels: number;
  activeRoutes: number;
  queuedRequests: number;
  rules: number;
  channelBreakdown: Record<ChannelType, number>;
}

// ============================================================================
// EXPORTS
// ============================================================================

export { ChannelUtils, ChannelFactory, LatencyOptimizer, ConflictResolver };
