/**
 * Pi Provider Management
 *
 * Manages provider configurations, capabilities, and metadata for
 * 15+ LLM providers supported by Pi CLI. Provides provider discovery,
 * capability matching, and provider-specific configuration.
 *
 * @module integrations/pi/provider
 */

import {
  ProviderId,
  PiCapability,
  PiInstance,
  HealthStatus,
  InstanceCapacity,
} from './types';

// ============================================================================
// Provider Configuration
// ============================================================================

/**
 * Configuration for a Pi provider
 */
export interface ProviderConfig {
  /** Provider identifier */
  id: ProviderId;

  /** Human-readable name */
  name: string;

  /** Base URL for API endpoint */
  baseUrl?: string;

  /** Default model for this provider */
  defaultModel: string;

  /** Available models */
  models: string[];

  /** Supported capabilities */
  capabilities: PiCapability[];

  /** Whether provider requires API key */
  requiresAuth: boolean;

  /** Environment variable for API key */
  apiKeyEnvVar?: string;

  /** Default capacity configuration */
  defaultCapacity: InstanceCapacity;

  /** Provider priority in fallback chain (lower = higher priority) */
  fallbackPriority: number;

  /** Expected latency in milliseconds */
  expectedLatencyMs: number;

  /** Context window size for default model */
  contextWindow: number;

  /** Provider quality score (0-100) */
  qualityScore: number;
}

/**
 * Provider registry with configurations for all supported providers
 */
export const PROVIDER_CONFIGS: Record<ProviderId, ProviderConfig> = {
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    defaultModel: 'claude-sonnet-4-5',
    models: [
      'claude-sonnet-4-5',
      'claude-opus-4',
      'claude-haiku-4',
      'claude-sonnet-4',
      'claude-3-5-sonnet',
      'claude-3-opus',
      'claude-3-haiku',
    ],
    capabilities: [
      'code-generation',
      'code-review',
      'refactoring',
      'testing',
      'documentation',
      'analysis',
      'architecture',
      'debugging',
      'typescript',
      'javascript',
      'python',
      'rust',
      'go',
      'java',
    ],
    requiresAuth: true,
    apiKeyEnvVar: 'ANTHROPIC_API_KEY',
    defaultCapacity: {
      maxConcurrent: 5,
      activeTasks: 0,
      queueDepth: 0,
      available: 5,
      utilizationPercent: 0,
    },
    fallbackPriority: 1,
    expectedLatencyMs: 1500,
    contextWindow: 200000,
    qualityScore: 95,
  },

  openai: {
    id: 'openai',
    name: 'OpenAI',
    defaultModel: 'gpt-4o',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4'],
    capabilities: [
      'code-generation',
      'code-review',
      'refactoring',
      'testing',
      'documentation',
      'analysis',
      'architecture',
      'debugging',
      'typescript',
      'javascript',
      'python',
      'rust',
      'go',
      'java',
    ],
    requiresAuth: true,
    apiKeyEnvVar: 'OPENAI_API_KEY',
    defaultCapacity: {
      maxConcurrent: 5,
      activeTasks: 0,
      queueDepth: 0,
      available: 5,
      utilizationPercent: 0,
    },
    fallbackPriority: 2,
    expectedLatencyMs: 1200,
    contextWindow: 128000,
    qualityScore: 95,
  },

  google: {
    id: 'google',
    name: 'Google AI',
    defaultModel: 'gemini-1.5-pro',
    models: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-1.0-pro'],
    capabilities: [
      'code-generation',
      'code-review',
      'refactoring',
      'testing',
      'documentation',
      'analysis',
      'architecture',
      'debugging',
      'typescript',
      'javascript',
      'python',
      'go',
      'java',
    ],
    requiresAuth: true,
    apiKeyEnvVar: 'GOOGLE_API_KEY',
    defaultCapacity: {
      maxConcurrent: 5,
      activeTasks: 0,
      queueDepth: 0,
      available: 5,
      utilizationPercent: 0,
    },
    fallbackPriority: 3,
    expectedLatencyMs: 1000,
    contextWindow: 2000000,
    qualityScore: 88,
  },

  groq: {
    id: 'groq',
    name: 'Groq',
    defaultModel: 'llama-3.1-405b',
    models: ['llama-3.1-405b', 'llama-3.1-70b', 'mixtral-8x7b'],
    capabilities: [
      'code-generation',
      'code-review',
      'refactoring',
      'testing',
      'documentation',
      'analysis',
      'debugging',
      'typescript',
      'javascript',
      'python',
    ],
    requiresAuth: true,
    apiKeyEnvVar: 'GROQ_API_KEY',
    defaultCapacity: {
      maxConcurrent: 10,
      activeTasks: 0,
      queueDepth: 0,
      available: 10,
      utilizationPercent: 0,
    },
    fallbackPriority: 4,
    expectedLatencyMs: 300,
    contextWindow: 128000,
    qualityScore: 75,
  },

  cerebras: {
    id: 'cerebras',
    name: 'Cerebras',
    defaultModel: 'cerebras-llama3.1-70b',
    models: ['cerebras-llama3.1-70b', 'cerebras-llama3.1-8b'],
    capabilities: [
      'code-generation',
      'code-review',
      'testing',
      'documentation',
      'analysis',
      'debugging',
      'typescript',
      'javascript',
      'python',
    ],
    requiresAuth: true,
    apiKeyEnvVar: 'CEREBRAS_API_KEY',
    defaultCapacity: {
      maxConcurrent: 10,
      activeTasks: 0,
      queueDepth: 0,
      available: 10,
      utilizationPercent: 0,
    },
    fallbackPriority: 5,
    expectedLatencyMs: 200,
    contextWindow: 8192,
    qualityScore: 70,
  },

  ollama: {
    id: 'ollama',
    name: 'Ollama (Local)',
    defaultModel: 'ollama-default',
    models: ['ollama-default', 'codellama', 'llama2', 'mistral'],
    capabilities: [
      'code-generation',
      'code-review',
      'refactoring',
      'testing',
      'documentation',
      'analysis',
      'debugging',
      'typescript',
      'javascript',
      'python',
    ],
    requiresAuth: false,
    defaultCapacity: {
      maxConcurrent: 3,
      activeTasks: 0,
      queueDepth: 0,
      available: 3,
      utilizationPercent: 0,
    },
    fallbackPriority: 10,
    expectedLatencyMs: 500,
    contextWindow: 4096,
    qualityScore: 60,
  },

  kimi: {
    id: 'kimi',
    name: 'Kimi (Moonshot AI)',
    defaultModel: 'kimi-k2.5',
    models: ['kimi-k2.5', 'kimi-k2'],
    capabilities: [
      'code-generation',
      'code-review',
      'refactoring',
      'testing',
      'documentation',
      'analysis',
      'architecture',
      'debugging',
      'typescript',
      'javascript',
      'python',
      'rust',
      'go',
      'java',
    ],
    requiresAuth: true,
    apiKeyEnvVar: 'KIMI_API_KEY',
    defaultCapacity: {
      maxConcurrent: 5,
      activeTasks: 0,
      queueDepth: 0,
      available: 5,
      utilizationPercent: 0,
    },
    fallbackPriority: 6,
    expectedLatencyMs: 1800,
    contextWindow: 256000,
    qualityScore: 85,
  },

  minimax: {
    id: 'minimax',
    name: 'MiniMax',
    defaultModel: 'minimax-01',
    models: ['minimax-01', 'minimax-abab6.5'],
    capabilities: [
      'code-generation',
      'code-review',
      'testing',
      'documentation',
      'analysis',
      'debugging',
      'typescript',
      'javascript',
      'python',
    ],
    requiresAuth: true,
    apiKeyEnvVar: 'MINIMAX_API_KEY',
    defaultCapacity: {
      maxConcurrent: 5,
      activeTasks: 0,
      queueDepth: 0,
      available: 5,
      utilizationPercent: 0,
    },
    fallbackPriority: 7,
    expectedLatencyMs: 1500,
    contextWindow: 8192,
    qualityScore: 72,
  },

  custom: {
    id: 'custom',
    name: 'Custom Provider',
    defaultModel: 'custom',
    models: ['custom'],
    capabilities: [
      'code-generation',
      'code-review',
      'testing',
      'documentation',
      'analysis',
    ],
    requiresAuth: true,
    defaultCapacity: {
      maxConcurrent: 3,
      activeTasks: 0,
      queueDepth: 0,
      available: 3,
      utilizationPercent: 0,
    },
    fallbackPriority: 100,
    expectedLatencyMs: 2000,
    contextWindow: 4096,
    qualityScore: 50,
  },
};

// ============================================================================
// Provider Priority Chain
// ============================================================================

/**
 * Default provider fallback chain ordered by priority
 */
export const DEFAULT_PROVIDER_CHAIN: ProviderId[] = [
  'anthropic',
  'openai',
  'google',
  'kimi',
  'groq',
  'cerebras',
  'minimax',
  'ollama',
];

// ============================================================================
// Provider Management Functions
// ============================================================================

/**
 * Gets configuration for a provider
 *
 * @param provider - Provider identifier
 * @returns Provider configuration or undefined if not found
 */
export function getProviderConfig(provider: ProviderId): ProviderConfig | undefined {
  return PROVIDER_CONFIGS[provider];
}

/**
 * Gets all provider configurations
 *
 * @returns Array of all provider configs
 */
export function getAllProviderConfigs(): ProviderConfig[] {
  return Object.values(PROVIDER_CONFIGS);
}

/**
 * Checks if a provider ID is valid
 *
 * @param provider - Provider identifier to check
 * @returns True if valid provider
 */
export function isValidProvider(provider: string): provider is ProviderId {
  return provider in PROVIDER_CONFIGS;
}

/**
 * Gets providers that support a specific capability
 *
 * @param capability - Capability to check for
 * @returns Array of provider configs supporting the capability
 */
export function getProvidersByCapability(capability: PiCapability): ProviderConfig[] {
  return Object.values(PROVIDER_CONFIGS).filter((config) =>
    config.capabilities.includes(capability)
  );
}

/**
 * Gets providers sorted by fallback priority
 *
 * @returns Array of provider configs sorted by priority
 */
export function getProvidersByPriority(): ProviderConfig[] {
  return Object.values(PROVIDER_CONFIGS).sort(
    (a, b) => a.fallbackPriority - b.fallbackPriority
  );
}

/**
 * Checks if a provider requires authentication
 *
 * @param provider - Provider identifier
 * @returns True if authentication required
 */
export function providerRequiresAuth(provider: ProviderId): boolean {
  return PROVIDER_CONFIGS[provider]?.requiresAuth ?? true;
}

/**
 * Gets the API key environment variable for a provider
 *
 * @param provider - Provider identifier
 * @returns Environment variable name or undefined
 */
export function getProviderApiKeyEnvVar(provider: ProviderId): string | undefined {
  return PROVIDER_CONFIGS[provider]?.apiKeyEnvVar;
}

/**
 * Creates a PiInstance for a provider with default configuration
 *
 * @param provider - Provider identifier
 * @param instanceId - Unique instance identifier
 * @param endpoint - Instance endpoint URL
 * @returns Configured PiInstance
 */
export function createProviderInstance(
  provider: ProviderId,
  instanceId: string,
  endpoint: string
): PiInstance {
  const config = PROVIDER_CONFIGS[provider];

  return {
    id: instanceId,
    name: `${config.name}-${instanceId.slice(-6)}`,
    provider,
    model: config.defaultModel,
    mode: 'local',
    endpoint,
    health: 'unknown' as HealthStatus,
    capabilities: config.capabilities,
    capacity: { ...config.defaultCapacity },
    lastHeartbeat: new Date(),
    metadata: {
      contextWindow: config.contextWindow,
      qualityScore: config.qualityScore,
    },
    registeredAt: new Date(),
  };
}

/**
 * Gets the expected latency for a provider
 *
 * @param provider - Provider identifier
 * @returns Expected latency in milliseconds
 */
export function getProviderLatency(provider: ProviderId): number {
  return PROVIDER_CONFIGS[provider]?.expectedLatencyMs ?? 2000;
}

/**
 * Gets the quality score for a provider
 *
 * @param provider - Provider identifier
 * @returns Quality score (0-100)
 */
export function getProviderQualityScore(provider: ProviderId): number {
  return PROVIDER_CONFIGS[provider]?.qualityScore ?? 50;
}

/**
 * Gets the context window size for a provider's default model
 *
 * @param provider - Provider identifier
 * @returns Context window size in tokens
 */
export function getProviderContextWindow(provider: ProviderId): number {
  return PROVIDER_CONFIGS[provider]?.contextWindow ?? 4096;
}

// ============================================================================
// Provider Manager Class
// ============================================================================

/**
 * Manager for Pi provider configurations and metadata
 */
export class ProviderManager {
  private configs: Map<ProviderId, ProviderConfig>;
  private customConfigs: Map<string, ProviderConfig> = new Map();

  constructor() {
    this.configs = new Map(Object.entries(PROVIDER_CONFIGS) as [ProviderId, ProviderConfig][]);
  }

  /**
   * Gets a provider configuration
   *
   * @param provider - Provider identifier
   * @returns Provider configuration
   */
  getConfig(provider: ProviderId): ProviderConfig {
    const config = this.configs.get(provider) || this.customConfigs.get(provider);
    if (!config) {
      throw new Error(`Unknown provider: ${provider}`);
    }
    return config;
  }

  /**
   * Gets all provider configurations
   *
   * @returns Array of provider configs
   */
  getAllConfigs(): ProviderConfig[] {
    return [
      ...Array.from(this.configs.values()),
      ...Array.from(this.customConfigs.values()),
    ];
  }

  /**
   * Registers a custom provider configuration
   *
   * @param config - Custom provider configuration
   */
  registerCustomProvider(config: ProviderConfig): void {
    this.customConfigs.set(config.id, config);
  }

  /**
   * Gets providers supporting all required capabilities
   *
   * @param capabilities - Required capabilities
   * @returns Array of provider configs
   */
  getProvidersWithCapabilities(capabilities: PiCapability[]): ProviderConfig[] {
    return this.getAllConfigs().filter((config) =>
      capabilities.every((cap) => config.capabilities.includes(cap))
    );
  }

  /**
   * Gets the fallback chain for a starting provider
   *
   * @param startProvider - Starting provider
   * @returns Ordered array of provider IDs
   */
  getFallbackChain(startProvider: ProviderId = 'anthropic'): ProviderId[] {
    const chain = getProvidersByPriority().map((c) => c.id);
    const startIndex = chain.indexOf(startProvider);

    if (startIndex === -1) {
      return [startProvider, ...chain];
    }

    return chain.slice(startIndex);
  }

  /**
   * Validates that a provider has required authentication
   *
   * @param provider - Provider identifier
   * @returns True if authentication is available
   */
  validateAuth(provider: ProviderId): boolean {
    const config = this.getConfig(provider);

    if (!config.requiresAuth) {
      return true;
    }

    const envVar = config.apiKeyEnvVar;
    if (!envVar) {
      return false;
    }

    return !!process.env[envVar];
  }

  /**
   * Gets authentication status for all providers
   *
   * @returns Map of provider IDs to auth status
   */
  getAuthStatus(): Map<ProviderId, boolean> {
    const status = new Map<ProviderId, boolean>();

    for (const provider of this.configs.keys()) {
      status.set(provider, this.validateAuth(provider));
    }

    return status;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalProviderManager: ProviderManager | null = null;

/**
 * Gets the global ProviderManager instance
 *
 * @returns Global ProviderManager
 */
export function getGlobalProviderManager(): ProviderManager {
  if (!globalProviderManager) {
    globalProviderManager = new ProviderManager();
  }
  return globalProviderManager;
}

/**
 * Resets the global ProviderManager (for testing)
 */
export function resetGlobalProviderManager(): void {
  globalProviderManager = null;
}

// Default export
export default ProviderManager;
