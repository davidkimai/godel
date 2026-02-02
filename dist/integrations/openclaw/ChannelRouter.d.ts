/**
 * ChannelRouter.ts
 *
 * OpenClaw Channel Router
 * Routes tasks across multiple channels with fallback and aggregation
 * per OpenClaw Integration Spec section 3.3
 */
import { ChannelConfig, ChannelType, ChannelStatus, ChannelPriority, ChannelUtils, ChannelFactory } from './ChannelConfig';
import { AggregatedResponse, ChannelResponse, AggregationConfig, LatencyOptimizer, ConflictResolver } from './ResponseAggregator';
import { EventEmitter } from 'events';
export interface RouteRequest {
    id: string;
    task: string;
    channels?: string[];
    channelTypes?: ChannelType[];
    priority?: 'low' | 'normal' | 'high' | 'critical';
    timeout?: number;
    requireAll?: boolean;
    minResponses?: number;
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
    timeWindow?: {
        start: number;
        end: number;
    };
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
export declare const DEFAULT_ROUTER_CONFIG: RouterConfig;
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
export declare class ChannelRouter extends EventEmitter {
    private config;
    private channels;
    private rules;
    private aggregator;
    private gateway;
    private activeRoutes;
    private requestQueue;
    private processingQueue;
    constructor(config?: Partial<RouterConfig>, gateway?: GatewayClient);
    private initializeDefaultChannels;
    /**
     * Set the gateway client
     */
    setGateway(gateway: GatewayClient): void;
    /**
     * Add a channel
     */
    addChannel(config: ChannelConfig): void;
    /**
     * Remove a channel
     */
    removeChannel(channelId: string): boolean;
    /**
     * Get a channel configuration
     */
    getChannel(channelId: string): ChannelConfig | undefined;
    /**
     * Get all channels
     */
    getAllChannels(): ChannelConfig[];
    /**
     * Get channels by type
     */
    getChannelsByType(type: ChannelType): ChannelConfig[];
    /**
     * Get channels by priority
     */
    getChannelsByPriority(priority: ChannelPriority): ChannelConfig[];
    /**
     * Get healthy channels
     */
    getHealthyChannels(): ChannelConfig[];
    /**
     * Add a routing rule
     */
    addRule(rule: RoutingRule): void;
    /**
     * Remove a routing rule
     */
    removeRule(ruleId: string): boolean;
    /**
     * Get all routing rules
     */
    getRules(): RoutingRule[];
    /**
     * Match a request against routing rules
     */
    matchRules(request: RouteRequest): RoutingRule | null;
    private matchesCondition;
    /**
     * Route a task to channels
     */
    route(request: RouteRequest): Promise<RouteResult>;
    /**
     * Route to a specific channel
     */
    private routeToChannel;
    /**
     * Select target channels for a request
     */
    private selectTargetChannels;
    /**
     * Prepare message for channel constraints
     */
    private prepareMessageForChannel;
    /**
     * Wait for minimum responses
     */
    private waitForMinResponses;
    /**
     * Execute fallback routing
     */
    private executeFallback;
    /**
     * Queue a request for later processing
     */
    queueRequest(request: RouteRequest): void;
    /**
     * Process the request queue
     */
    private processQueue;
    private delay;
    /**
     * Get router statistics
     */
    getStats(): RouterStats;
    /**
     * Update channel status
     */
    updateChannelStatus(channelId: string, status: ChannelStatus): void;
    /**
     * Get optimal channels for a task
     */
    getOptimalChannels(count: number, maxLatency?: number): ChannelConfig[];
}
export interface RouterStats {
    totalChannels: number;
    healthyChannels: number;
    activeRoutes: number;
    queuedRequests: number;
    rules: number;
    channelBreakdown: Record<ChannelType, number>;
}
export { ChannelUtils, ChannelFactory, LatencyOptimizer, ConflictResolver };
//# sourceMappingURL=ChannelRouter.d.ts.map