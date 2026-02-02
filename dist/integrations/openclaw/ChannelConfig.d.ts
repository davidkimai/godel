/**
 * ChannelConfig.ts
 *
 * OpenClaw Channel Configuration
 * Defines channel capabilities, constraints, and routing rules
 * per OpenClaw Integration Spec section 3.3
 */
export type ChannelType = 'telegram' | 'whatsapp' | 'discord' | 'slack' | 'signal' | 'imessage' | 'webchat' | 'matrix' | 'teams' | 'main';
export type ChannelPriority = 'primary' | 'secondary' | 'fallback';
export type ChannelStatus = 'available' | 'busy' | 'offline' | 'error';
export interface ChannelCapabilities {
    maxMessageLength: number;
    supportsMarkdown: boolean;
    supportsHtml: boolean;
    supportsMedia: boolean;
    supportsFiles: boolean;
    maxFileSize: number;
    supportedMimeTypes: string[];
    supportsThreads: boolean;
    supportsMentions: boolean;
    supportsReactions: boolean;
    supportsEditing: boolean;
    supportsDeletion: boolean;
    supportsTyping: boolean;
    supportsDeliveryReceipts: boolean;
    supportsReadReceipts: boolean;
    supportsGroups: boolean;
    maxGroupSize: number;
    supportsE2E: boolean;
    supportsEphemeral: boolean;
}
export interface ChannelConstraints {
    maxMessagesPerMinute: number;
    maxMessagesPerHour: number;
    burstAllowance: number;
    forbiddenPatterns: RegExp[];
    requiredPrefix?: string;
    maxMentionsPerMessage: number;
    activeHours?: {
        start: number;
        end: number;
    };
    timezone?: string;
    chunkSize: number;
    chunkDelimiter: string;
}
export interface ChannelConfig {
    id: string;
    type: ChannelType;
    name: string;
    description: string;
    accountId?: string;
    channelId?: string;
    gatewayUrl?: string;
    priority: ChannelPriority;
    weight: number;
    enabled: boolean;
    capabilities: ChannelCapabilities;
    constraints: ChannelConstraints;
    status: ChannelStatus;
    lastUsed: Date;
    successRate: number;
    averageLatency: number;
    failureCount: number;
    totalRequests: number;
    tags: string[];
    metadata: Record<string, unknown>;
}
export declare const DEFAULT_CAPABILITIES: Record<ChannelType, ChannelCapabilities>;
export declare const DEFAULT_CONSTRAINTS: Record<ChannelType, ChannelConstraints>;
export declare class ChannelFactory {
    static create(type: ChannelType, id: string, options?: Partial<ChannelConfig>): ChannelConfig;
    private static getDefaults;
    static createPrimary(type: ChannelType, id: string, options?: Partial<ChannelConfig>): ChannelConfig;
    static createSecondary(type: ChannelType, id: string, options?: Partial<ChannelConfig>): ChannelConfig;
    static createFallback(type: ChannelType, id: string, options?: Partial<ChannelConfig>): ChannelConfig;
}
export declare class ChannelUtils {
    /**
     * Check if a message can be sent as-is on this channel
     */
    static canSendDirectly(config: ChannelConfig, message: string): boolean;
    /**
     * Chunk a message for the channel
     */
    static chunkMessage(config: ChannelConfig, message: string): string[];
    /**
     * Format mentions for the channel
     */
    static formatMention(config: ChannelConfig, userId: string, displayName?: string): string;
    /**
     * Format markdown for the channel
     */
    static formatMarkdown(config: ChannelConfig, markdown: string): string;
    /**
     * Check if channel is healthy for routing
     */
    static isHealthy(config: ChannelConfig): boolean;
    /**
     * Calculate channel score for routing (higher = better)
     */
    static calculateScore(config: ChannelConfig): number;
    /**
     * Update channel metrics after a request
     */
    static updateMetrics(config: ChannelConfig, success: boolean, latency: number): void;
}
export declare const PREDEFINED_CHANNELS: {
    telegramMain: () => ChannelConfig;
    whatsappMain: () => ChannelConfig;
    discordMain: () => ChannelConfig;
    slackMain: () => ChannelConfig;
    openclawMain: () => ChannelConfig;
};
//# sourceMappingURL=ChannelConfig.d.ts.map