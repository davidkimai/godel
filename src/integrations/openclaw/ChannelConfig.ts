/**
 * ChannelConfig.ts
 * 
 * OpenClaw Channel Configuration
 * Defines channel capabilities, constraints, and routing rules
 * per OpenClaw Integration Spec section 3.3
 */

// ============================================================================
// CHANNEL TYPES
// ============================================================================

export type ChannelType = 
  | 'telegram'
  | 'whatsapp'
  | 'discord'
  | 'slack'
  | 'signal'
  | 'imessage'
  | 'webchat'
  | 'matrix'
  | 'teams'
  | 'main';  // OpenClaw main session

export type ChannelPriority = 'primary' | 'secondary' | 'fallback';
export type ChannelStatus = 'available' | 'busy' | 'offline' | 'error';

// ============================================================================
// CHANNEL CAPABILITIES
// ============================================================================

export interface ChannelCapabilities {
  // Message capabilities
  maxMessageLength: number;
  supportsMarkdown: boolean;
  supportsHtml: boolean;
  supportsMedia: boolean;
  supportsFiles: boolean;
  
  // Media capabilities
  maxFileSize: number;           // bytes
  supportedMimeTypes: string[];
  
  // Interaction capabilities
  supportsThreads: boolean;
  supportsMentions: boolean;
  supportsReactions: boolean;
  supportsEditing: boolean;
  supportsDeletion: boolean;
  
  // Real-time capabilities
  supportsTyping: boolean;
  supportsDeliveryReceipts: boolean;
  supportsReadReceipts: boolean;
  
  // Group capabilities
  supportsGroups: boolean;
  maxGroupSize: number;
  
  // Security capabilities
  supportsE2E: boolean;
  supportsEphemeral: boolean;
}

// ============================================================================
// CHANNEL CONSTRAINTS
// ============================================================================

export interface ChannelConstraints {
  // Rate limiting
  maxMessagesPerMinute: number;
  maxMessagesPerHour: number;
  burstAllowance: number;
  
  // Content constraints
  forbiddenPatterns: RegExp[];
  requiredPrefix?: string;
  maxMentionsPerMessage: number;
  
  // Time constraints
  activeHours?: { start: number; end: number }; // 0-24
  timezone?: string;
  
  // Size constraints
  chunkSize: number;  // For splitting long messages
  chunkDelimiter: string;
}

// ============================================================================
// CHANNEL CONFIGURATION
// ============================================================================

export interface ChannelConfig {
  id: string;
  type: ChannelType;
  name: string;
  description: string;
  
  // Connection settings
  accountId?: string;
  channelId?: string;
  gatewayUrl?: string;
  
  // Routing settings
  priority: ChannelPriority;
  weight: number;                // 0-1, for load balancing
  enabled: boolean;
  
  // Capabilities & constraints
  capabilities: ChannelCapabilities;
  constraints: ChannelConstraints;
  
  // Health tracking
  status: ChannelStatus;
  lastUsed: Date;
  successRate: number;           // 0-1
  averageLatency: number;        // ms
  failureCount: number;
  totalRequests: number;
  
  // Metadata
  tags: string[];
  metadata: Record<string, unknown>;
}

// ============================================================================
// DEFAULT CHANNEL CAPABILITIES
// ============================================================================

export const DEFAULT_CAPABILITIES: Record<ChannelType, ChannelCapabilities> = {
  telegram: {
    maxMessageLength: 4096,
    supportsMarkdown: true,
    supportsHtml: false,
    supportsMedia: true,
    supportsFiles: true,
    maxFileSize: 20 * 1024 * 1024,  // 20MB
    supportedMimeTypes: ['image/*', 'video/*', 'audio/*', 'application/pdf', 'text/*'],
    supportsThreads: true,
    supportsMentions: true,
    supportsReactions: true,
    supportsEditing: true,
    supportsDeletion: true,
    supportsTyping: true,
    supportsDeliveryReceipts: true,
    supportsReadReceipts: false,
    supportsGroups: true,
    maxGroupSize: 200000,
    supportsE2E: false,
    supportsEphemeral: false,
  },
  
  whatsapp: {
    maxMessageLength: 65536,
    supportsMarkdown: false,
    supportsHtml: false,
    supportsMedia: true,
    supportsFiles: true,
    maxFileSize: 100 * 1024 * 1024,  // 100MB for docs, 16MB for media
    supportedMimeTypes: ['image/*', 'video/*', 'audio/*', 'application/pdf', 'text/*'],
    supportsThreads: false,
    supportsMentions: true,
    supportsReactions: true,
    supportsEditing: true,
    supportsDeletion: true,
    supportsTyping: true,
    supportsDeliveryReceipts: true,
    supportsReadReceipts: true,
    supportsGroups: true,
    maxGroupSize: 1024,
    supportsE2E: true,
    supportsEphemeral: true,
  },
  
  discord: {
    maxMessageLength: 2000,
    supportsMarkdown: true,
    supportsHtml: false,
    supportsMedia: true,
    supportsFiles: true,
    maxFileSize: 25 * 1024 * 1024,  // 25MB (8MB for free)
    supportedMimeTypes: ['image/*', 'video/*', 'audio/*', 'application/*', 'text/*'],
    supportsThreads: true,
    supportsMentions: true,
    supportsReactions: true,
    supportsEditing: true,
    supportsDeletion: true,
    supportsTyping: true,
    supportsDeliveryReceipts: false,
    supportsReadReceipts: false,
    supportsGroups: true,
    maxGroupSize: 250000,  // Server limit
    supportsE2E: false,
    supportsEphemeral: false,
  },
  
  slack: {
    maxMessageLength: 40000,
    supportsMarkdown: true,
    supportsHtml: false,
    supportsMedia: true,
    supportsFiles: true,
    maxFileSize: 1 * 1024 * 1024 * 1024,  // 1GB
    supportedMimeTypes: ['*/*'],
    supportsThreads: true,
    supportsMentions: true,
    supportsReactions: true,
    supportsEditing: true,
    supportsDeletion: true,
    supportsTyping: true,
    supportsDeliveryReceipts: false,
    supportsReadReceipts: false,
    supportsGroups: true,
    maxGroupSize: 1000,
    supportsE2E: false,
    supportsEphemeral: false,
  },
  
  signal: {
    maxMessageLength: 2000,
    supportsMarkdown: false,
    supportsHtml: false,
    supportsMedia: true,
    supportsFiles: true,
    maxFileSize: 100 * 1024 * 1024,
    supportedMimeTypes: ['image/*', 'video/*', 'audio/*', 'application/*'],
    supportsThreads: false,
    supportsMentions: true,
    supportsReactions: true,
    supportsEditing: false,
    supportsDeletion: true,
    supportsTyping: true,
    supportsDeliveryReceipts: true,
    supportsReadReceipts: true,
    supportsGroups: true,
    maxGroupSize: 1000,
    supportsE2E: true,
    supportsEphemeral: true,
  },
  
  imessage: {
    maxMessageLength: 20000,
    supportsMarkdown: false,
    supportsHtml: false,
    supportsMedia: true,
    supportsFiles: true,
    maxFileSize: 100 * 1024 * 1024,
    supportedMimeTypes: ['image/*', 'video/*', 'audio/*', 'application/*'],
    supportsThreads: false,
    supportsMentions: false,
    supportsReactions: true,
    supportsEditing: true,
    supportsDeletion: true,
    supportsTyping: true,
    supportsDeliveryReceipts: true,
    supportsReadReceipts: true,
    supportsGroups: true,
    maxGroupSize: 32,
    supportsE2E: true,
    supportsEphemeral: false,
  },
  
  webchat: {
    maxMessageLength: 10000,
    supportsMarkdown: true,
    supportsHtml: true,
    supportsMedia: true,
    supportsFiles: true,
    maxFileSize: 50 * 1024 * 1024,
    supportedMimeTypes: ['*/*'],
    supportsThreads: true,
    supportsMentions: true,
    supportsReactions: true,
    supportsEditing: true,
    supportsDeletion: true,
    supportsTyping: true,
    supportsDeliveryReceipts: true,
    supportsReadReceipts: true,
    supportsGroups: true,
    maxGroupSize: 10000,
    supportsE2E: false,
    supportsEphemeral: false,
  },
  
  matrix: {
    maxMessageLength: 65536,
    supportsMarkdown: true,
    supportsHtml: true,
    supportsMedia: true,
    supportsFiles: true,
    maxFileSize: 100 * 1024 * 1024,
    supportedMimeTypes: ['*/*'],
    supportsThreads: true,
    supportsMentions: true,
    supportsReactions: true,
    supportsEditing: true,
    supportsDeletion: true,
    supportsTyping: true,
    supportsDeliveryReceipts: true,
    supportsReadReceipts: true,
    supportsGroups: true,
    maxGroupSize: 10000,
    supportsE2E: true,
    supportsEphemeral: false,
  },
  
  teams: {
    maxMessageLength: 28000,
    supportsMarkdown: true,
    supportsHtml: false,
    supportsMedia: true,
    supportsFiles: true,
    maxFileSize: 250 * 1024 * 1024,
    supportedMimeTypes: ['*/*'],
    supportsThreads: true,
    supportsMentions: true,
    supportsReactions: true,
    supportsEditing: true,
    supportsDeletion: true,
    supportsTyping: true,
    supportsDeliveryReceipts: false,
    supportsReadReceipts: false,
    supportsGroups: true,
    maxGroupSize: 250,
    supportsE2E: false,
    supportsEphemeral: false,
  },
  
  main: {
    maxMessageLength: 100000,
    supportsMarkdown: true,
    supportsHtml: false,
    supportsMedia: false,
    supportsFiles: false,
    maxFileSize: 0,
    supportedMimeTypes: [],
    supportsThreads: true,
    supportsMentions: false,
    supportsReactions: false,
    supportsEditing: false,
    supportsDeletion: false,
    supportsTyping: false,
    supportsDeliveryReceipts: false,
    supportsReadReceipts: false,
    supportsGroups: false,
    maxGroupSize: 0,
    supportsE2E: false,
    supportsEphemeral: false,
  },
};

// ============================================================================
// DEFAULT CHANNEL CONSTRAINTS
// ============================================================================

export const DEFAULT_CONSTRAINTS: Record<ChannelType, ChannelConstraints> = {
  telegram: {
    maxMessagesPerMinute: 30,
    maxMessagesPerHour: 1000,
    burstAllowance: 10,
    forbiddenPatterns: [],
    maxMentionsPerMessage: 100,
    chunkSize: 4000,
    chunkDelimiter: '\n\n---\n\n',
  },
  
  whatsapp: {
    maxMessagesPerMinute: 20,
    maxMessagesPerHour: 500,
    burstAllowance: 5,
    forbiddenPatterns: [],
    maxMentionsPerMessage: 256,
    chunkSize: 60000,
    chunkDelimiter: '\n\n[...continued...]\n\n',
  },
  
  discord: {
    maxMessagesPerMinute: 60,
    maxMessagesPerHour: 3000,
    burstAllowance: 15,
    forbiddenPatterns: [/@everyone/, /@here/],
    maxMentionsPerMessage: 100,
    chunkSize: 1900,
    chunkDelimiter: '\n\n(cont.)\n\n',
  },
  
  slack: {
    maxMessagesPerMinute: 100,
    maxMessagesPerHour: 5000,
    burstAllowance: 20,
    forbiddenPatterns: [],
    maxMentionsPerMessage: 50,
    chunkSize: 35000,
    chunkDelimiter: '\n\n...\n\n',
  },
  
  signal: {
    maxMessagesPerMinute: 15,
    maxMessagesPerHour: 300,
    burstAllowance: 5,
    forbiddenPatterns: [],
    maxMentionsPerMessage: 50,
    chunkSize: 1900,
    chunkDelimiter: '\n\n[more]\n\n',
  },
  
  imessage: {
    maxMessagesPerMinute: 60,
    maxMessagesPerHour: 1000,
    burstAllowance: 10,
    forbiddenPatterns: [],
    maxMentionsPerMessage: 32,
    chunkSize: 18000,
    chunkDelimiter: '\n\n...\n\n',
  },
  
  webchat: {
    maxMessagesPerMinute: 100,
    maxMessagesPerHour: 10000,
    burstAllowance: 50,
    forbiddenPatterns: [],
    maxMentionsPerMessage: 100,
    chunkSize: 9000,
    chunkDelimiter: '\n\n---\n\n',
  },
  
  matrix: {
    maxMessagesPerMinute: 60,
    maxMessagesPerHour: 3000,
    burstAllowance: 20,
    forbiddenPatterns: [],
    maxMentionsPerMessage: 100,
    chunkSize: 60000,
    chunkDelimiter: '\n\n---\n\n',
  },
  
  teams: {
    maxMessagesPerMinute: 50,
    maxMessagesPerHour: 2000,
    burstAllowance: 10,
    forbiddenPatterns: [],
    maxMentionsPerMessage: 50,
    chunkSize: 27000,
    chunkDelimiter: '\n\n...\n\n',
  },
  
  main: {
    maxMessagesPerMinute: 1000,
    maxMessagesPerHour: 100000,
    burstAllowance: 100,
    forbiddenPatterns: [],
    maxMentionsPerMessage: 1000,
    chunkSize: 90000,
    chunkDelimiter: '\n\n',
  },
};

// ============================================================================
// CHANNEL FACTORY
// ============================================================================

export class ChannelFactory {
  static create(
    type: ChannelType,
    id: string,
    options: Partial<ChannelConfig> = {}
  ): ChannelConfig {
    const defaults = this.getDefaults(type, id);
    
    return {
      ...defaults,
      ...options,
      id: options.id || id,
      type: options.type || type,
      capabilities: {
        ...defaults.capabilities,
        ...options.capabilities,
      },
      constraints: {
        ...defaults.constraints,
        ...options.constraints,
      },
      metadata: {
        ...defaults.metadata,
        ...options.metadata,
      },
    };
  }
  
  private static getDefaults(type: ChannelType, id: string): ChannelConfig {
    return {
      id,
      type,
      name: `${type}-${id}`,
      description: `${type} channel ${id}`,
      priority: 'secondary',
      weight: 1.0,
      enabled: true,
      capabilities: { ...DEFAULT_CAPABILITIES[type] },
      constraints: { ...DEFAULT_CONSTRAINTS[type] },
      status: 'available',
      lastUsed: new Date(0),
      successRate: 1.0,
      averageLatency: 0,
      failureCount: 0,
      totalRequests: 0,
      tags: [],
      metadata: {},
    };
  }
  
  static createPrimary(type: ChannelType, id: string, options: Partial<ChannelConfig> = {}): ChannelConfig {
    return this.create(type, id, { ...options, priority: 'primary' });
  }
  
  static createSecondary(type: ChannelType, id: string, options: Partial<ChannelConfig> = {}): ChannelConfig {
    return this.create(type, id, { ...options, priority: 'secondary' });
  }
  
  static createFallback(type: ChannelType, id: string, options: Partial<ChannelConfig> = {}): ChannelConfig {
    return this.create(type, id, { ...options, priority: 'fallback' });
  }
}

// ============================================================================
// CHANNEL UTILITIES
// ============================================================================

export class ChannelUtils {
  /**
   * Check if a message can be sent as-is on this channel
   */
  static canSendDirectly(config: ChannelConfig, message: string): boolean {
    return message.length <= config.capabilities.maxMessageLength;
  }
  
  /**
   * Chunk a message for the channel
   */
  static chunkMessage(config: ChannelConfig, message: string): string[] {
    const { chunkSize, chunkDelimiter } = config.constraints;
    
    if (message.length <= chunkSize) {
      return [message];
    }
    
    const chunks: string[] = [];
    let remaining = message;
    
    while (remaining.length > 0) {
      if (remaining.length <= chunkSize) {
        chunks.push(remaining);
        break;
      }
      
      // Find a good break point
      let breakPoint = remaining.lastIndexOf('\n\n', chunkSize);
      if (breakPoint === -1) {
        breakPoint = remaining.lastIndexOf('. ', chunkSize);
      }
      if (breakPoint === -1) {
        breakPoint = remaining.lastIndexOf(' ', chunkSize);
      }
      if (breakPoint === -1) {
        breakPoint = chunkSize;
      }
      
      chunks.push(remaining.substring(0, breakPoint));
      remaining = remaining.substring(breakPoint).trim();
    }
    
    return chunks;
  }
  
  /**
   * Format mentions for the channel
   */
  static formatMention(config: ChannelConfig, userId: string, displayName?: string): string {
    switch (config.type) {
      case 'telegram':
        return displayName ? `[${displayName}](tg://user?id=${userId})` : `@${userId}`;
      case 'discord':
        return `<@${userId}>`;
      case 'slack':
        return `<@${userId}>`;
      case 'whatsapp':
      case 'signal':
      case 'imessage':
        return displayName || userId;
      default:
        return `@${userId}`;
    }
  }
  
  /**
   * Format markdown for the channel
   */
  static formatMarkdown(config: ChannelConfig, markdown: string): string {
    if (!config.capabilities.supportsMarkdown) {
      // Strip markdown
      return markdown
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/`(.*?)`/g, '$1')
        .replace(/\[(.*?)\]\((.*?)\)/g, '$1 ($2)');
    }
    return markdown;
  }
  
  /**
   * Check if channel is healthy for routing
   */
  static isHealthy(config: ChannelConfig): boolean {
    return config.enabled && 
           config.status !== 'offline' && 
           config.status !== 'error' &&
           config.successRate > 0.5;
  }
  
  /**
   * Calculate channel score for routing (higher = better)
   */
  static calculateScore(config: ChannelConfig): number {
    if (!this.isHealthy(config)) {
      return 0;
    }
    
    const priorityWeight = config.priority === 'primary' ? 3 : 
                           config.priority === 'secondary' ? 2 : 1;
    
    const successWeight = config.successRate;
    const latencyWeight = Math.max(0, 1 - config.averageLatency / 5000);
    
    return config.weight * priorityWeight * successWeight * latencyWeight;
  }
  
  /**
   * Update channel metrics after a request
   */
  static updateMetrics(
    config: ChannelConfig,
    success: boolean,
    latency: number
  ): void {
    config.totalRequests++;
    config.lastUsed = new Date();
    
    if (!success) {
      config.failureCount++;
    }
    
    // Exponential moving average for success rate
    const alpha = 0.1;
    const currentSuccess = success ? 1 : 0;
    config.successRate = config.successRate * (1 - alpha) + currentSuccess * alpha;
    
    // Exponential moving average for latency
    config.averageLatency = config.averageLatency * (1 - alpha) + latency * alpha;
    
    // Update status based on metrics
    if (config.successRate < 0.3) {
      config.status = 'error';
    } else if (config.successRate < 0.7) {
      config.status = 'busy';
    } else {
      config.status = 'available';
    }
  }
}

// ============================================================================
// PREDEFINED CHANNEL CONFIGURATIONS
// ============================================================================

export const PREDEFINED_CHANNELS = {
  // Telegram channels
  telegramMain: () => ChannelFactory.createPrimary('telegram', 'main', {
    name: 'Telegram Main',
    description: 'Primary Telegram channel',
  }),
  
  // WhatsApp channels
  whatsappMain: () => ChannelFactory.createPrimary('whatsapp', 'main', {
    name: 'WhatsApp Main',
    description: 'Primary WhatsApp channel',
  }),
  
  // Discord channels
  discordMain: () => ChannelFactory.createPrimary('discord', 'main', {
    name: 'Discord Main',
    description: 'Primary Discord channel',
  }),
  
  // Slack channels
  slackMain: () => ChannelFactory.createPrimary('slack', 'main', {
    name: 'Slack Main',
    description: 'Primary Slack channel',
  }),
  
  // Main OpenClaw session
  openclawMain: () => ChannelFactory.createPrimary('main', 'openclaw', {
    name: 'OpenClaw Main',
    description: 'OpenClaw main session',
  }),
};
