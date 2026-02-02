/**
 * ResponseAggregator.ts
 *
 * Aggregates and merges responses from multiple OpenClaw channels
 * Handles conflict resolution and latency optimization
 * per OpenClaw Integration Spec section 3.3
 */
import { ChannelConfig, ChannelType } from './ChannelConfig';
export interface ChannelResponse {
    channelId: string;
    channelType: ChannelType;
    messageId?: string;
    content: string;
    timestamp: Date;
    latency: number;
    metadata: Record<string, unknown>;
    attachments?: ResponseAttachment[];
}
export interface ResponseAttachment {
    type: 'image' | 'video' | 'audio' | 'file';
    url?: string;
    filename?: string;
    mimeType?: string;
    size?: number;
    content?: Buffer;
}
export interface AggregatedResponse {
    id: string;
    requestId: string;
    status: 'pending' | 'partial' | 'complete' | 'timeout' | 'error';
    responses: ChannelResponse[];
    mergedContent: string;
    confidence: number;
    startTime: Date;
    endTime?: Date;
    totalLatency: number;
    channelsUsed: string[];
    conflicts: Conflict[];
    resolution: ResolutionStrategy;
}
export interface Conflict {
    type: 'content_mismatch' | 'timing_discrepancy' | 'source_disagreement';
    channels: string[];
    description: string;
    severity: 'low' | 'medium' | 'high';
    values: unknown[];
}
export type ResolutionStrategy = 'first_wins' | 'last_wins' | 'majority_vote' | 'weighted_average' | 'confidence_based' | 'channel_priority' | 'manual';
export interface AggregationConfig {
    strategy: ResolutionStrategy;
    timeout: number;
    minResponses: number;
    maxResponses: number;
    requireConsensus: boolean;
    consensusThreshold: number;
    channelWeights?: Map<string, number>;
    contentMergeStrategy?: 'concatenate' | 'deduplicate' | 'intelligent';
}
export declare const DEFAULT_AGGREGATION_CONFIG: AggregationConfig;
declare class ContentAnalyzer {
    /**
     * Calculate similarity between two text contents (0-1)
     */
    static calculateSimilarity(a: string, b: string): number;
    /**
     * Extract key facts from content
     */
    static extractFacts(content: string): string[];
    private static isFactual;
    /**
     * Deduplicate similar content
     */
    static deduplicate(responses: ChannelResponse[]): ChannelResponse[];
    /**
     * Merge contents intelligently
     */
    static mergeIntelligent(responses: ChannelResponse[]): string;
    /**
     * Simple concatenation with separators
     */
    static concatenate(responses: ChannelResponse[]): string;
}
declare class ConflictResolver {
    /**
     * Detect conflicts between responses
     */
    static detectConflicts(responses: ChannelResponse[]): Conflict[];
    private static groupBySimilarity;
    /**
     * Resolve conflicts using specified strategy
     */
    static resolve(responses: ChannelResponse[], strategy: ResolutionStrategy, channelConfigs?: Map<string, ChannelConfig>): {
        selected: ChannelResponse[];
        discarded: ChannelResponse[];
        reason: string;
    };
    private static firstWins;
    private static lastWins;
    private static majorityVote;
    private static weightedAverage;
    private static confidenceBased;
    private static channelPriority;
    private static calculateChannelWeight;
}
export declare class ResponseAggregator {
    private pendingAggregations;
    private config;
    private channelConfigs;
    constructor(config?: Partial<AggregationConfig>, channelConfigs?: Map<string, ChannelConfig>);
    /**
     * Start a new aggregation
     */
    startAggregation(requestId: string): AggregatedResponse;
    /**
     * Add a response to an aggregation
     */
    addResponse(requestId: string, response: ChannelResponse): AggregatedResponse | null;
    /**
     * Finalize an aggregation
     */
    private finalize;
    /**
     * Handle timeout
     */
    private handleTimeout;
    /**
     * Merge content based on strategy
     */
    private mergeContent;
    /**
     * Calculate overall confidence score
     */
    private calculateConfidence;
    /**
     * Get pending aggregation
     */
    getPending(requestId: string): AggregatedResponse | undefined;
    /**
     * Cancel a pending aggregation
     */
    cancel(requestId: string): boolean;
    /**
     * Update channel configurations
     */
    updateChannelConfigs(configs: Map<string, ChannelConfig>): void;
    /**
     * Generate unique ID
     */
    private generateId;
    /**
     * Get all pending aggregations
     */
    getAllPending(): AggregatedResponse[];
}
export declare class LatencyOptimizer {
    /**
     * Calculate optimal timeout based on channel latencies
     */
    static calculateOptimalTimeout(channelConfigs: ChannelConfig[], confidenceLevel?: number): number;
    /**
     * Rank channels by expected latency
     */
    static rankByLatency(channelConfigs: ChannelConfig[]): ChannelConfig[];
    /**
     * Select fastest subset of channels for time-critical tasks
     */
    static selectFastest(channelConfigs: ChannelConfig[], count: number, maxLatency?: number): ChannelConfig[];
}
export { ContentAnalyzer, ConflictResolver };
//# sourceMappingURL=ResponseAggregator.d.ts.map