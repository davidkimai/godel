/**
 * Pi Latency-Based Router
 *
 * Implements latency-optimized routing for Pi providers, selecting
 * providers with the lowest expected latency. Tracks historical latency
 * measurements and predicts future performance.
 *
 * @module integrations/pi/latency-router
 */

import { EventEmitter } from 'events';
import {
  ProviderId,
  PiInstance,
  PiCapability,
  PiRegistryError,
} from './types';
import { getProviderConfig } from './provider';
import { logger } from '../../utils/logger';

// ============================================================================
// Default Latency Values
// ============================================================================

/**
 * Default expected latency per provider (ms)
 */
export const DEFAULT_PROVIDER_LATENCY: Record<ProviderId, number> = {
  anthropic: 1500,
  openai: 1200,
  google: 1000,
  groq: 300,
  cerebras: 200,
  ollama: 500,
  kimi: 1800,
  minimax: 1500,
  custom: 2000,
};

// ============================================================================
// Latency Types
// ============================================================================

/**
 * Latency measurement record
 */
export interface LatencyRecord {
  /** Provider identifier */
  provider: ProviderId;

  /** Instance identifier */
  instanceId?: string;

  /** Measured latency in milliseconds */
  latencyMs: number;

  /** Timestamp of measurement */
  timestamp: Date;

  /** Request type/category */
  requestType?: string;

  /** Success status */
  success: boolean;

  /** Error message if failed */
  error?: string;
}

/**
 * Latency statistics for a provider
 */
export interface LatencyStats {
  /** Provider identifier */
  provider: ProviderId;

  /** Average latency (ms) */
  averageMs: number;

  /** Median latency (ms) */
  medianMs: number;

  /** Minimum latency (ms) */
  minMs: number;

  /** Maximum latency (ms) */
  maxMs: number;

  /** 95th percentile latency (ms) */
  p95Ms: number;

  /** 99th percentile latency (ms) */
  p99Ms: number;

  /** Standard deviation */
  stdDev: number;

  /** Number of samples */
  sampleCount: number;

  /** Success rate (0-1) */
  successRate: number;

  /** Last updated timestamp */
  lastUpdated: Date;
}

/**
 * Latency-based routing request
 */
export interface LatencyRoutingRequest {
  /** Request identifier */
  requestId: string;

  /** Required capabilities */
  requiredCapabilities?: PiCapability[];

  /** Maximum acceptable latency (ms) */
  maxLatencyMs?: number;

  /** Priority level affecting latency requirements */
  priority?: 'low' | 'normal' | 'high' | 'critical';

  /** Preferred providers */
  preferredProviders?: ProviderId[];

  /** Whether to include historical data in routing */
  useHistoricalData: boolean;

  /** Region preference for latency */
  region?: string;
}

/**
 * Latency routing result
 */
export interface LatencyRoutingResult {
  /** Selected provider */
  provider: PiInstance;

  /** Expected latency (ms) */
  expectedLatencyMs: number;

  /** Latency confidence score (0-1) */
  confidence: number;

  /** Alternative providers with latencies */
  alternatives: Array<{
    provider: PiInstance;
    expectedLatencyMs: number;
    score: number;
  }>;

  /** Routing statistics used */
  stats: LatencyStats | null;

  /** Score breakdown */
  scoreBreakdown: {
    latencyScore: number;
    capabilityScore: number;
    healthScore: number;
  };
}

/**
 * Latency routing configuration
 */
export interface LatencyRouterConfig {
  /** Default maximum latency (ms) */
  defaultMaxLatencyMs: number;

  /** High priority latency threshold (ms) */
  highPriorityMaxLatencyMs: number;

  /** Critical priority latency threshold (ms) */
  criticalPriorityMaxLatencyMs: number;

  /** Sample window size for statistics */
  sampleWindowSize: number;

  /** Enable predictive routing based on history */
  enablePredictiveRouting: boolean;

  /** Weight for recent samples (0-1) */
  recentSampleWeight: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default latency router configuration
 */
export const DEFAULT_LATENCY_CONFIG: LatencyRouterConfig = {
  defaultMaxLatencyMs: 5000,
  highPriorityMaxLatencyMs: 2000,
  criticalPriorityMaxLatencyMs: 1000,
  sampleWindowSize: 100,
  enablePredictiveRouting: true,
  recentSampleWeight: 0.7,
};

// ============================================================================
// Latency Calculation Functions
// ============================================================================

/**
 * Calculates latency statistics from records
 *
 * @param records - Latency records
 * @param provider - Provider identifier
 * @returns Latency statistics
 */
export function calculateLatencyStats(
  records: LatencyRecord[],
  provider: ProviderId
): LatencyStats | null {
  const successful = records.filter((r) => r.success);

  if (successful.length === 0) {
    return null;
  }

  const latencies = successful.map((r) => r.latencyMs).sort((a, b) => a - b);

  const sum = latencies.reduce((acc, val) => acc + val, 0);
  const averageMs = sum / latencies.length;

  const medianMs =
    latencies.length % 2 === 0
      ? (latencies[latencies.length / 2 - 1] + latencies[latencies.length / 2]) / 2
      : latencies[Math.floor(latencies.length / 2)];

  const minMs = latencies[0];
  const maxMs = latencies[latencies.length - 1];

  // Calculate percentiles
  const p95Index = Math.ceil(latencies.length * 0.95) - 1;
  const p99Index = Math.ceil(latencies.length * 0.99) - 1;
  const p95Ms = latencies[Math.max(0, p95Index)];
  const p99Ms = latencies[Math.max(0, p99Index)];

  // Calculate standard deviation
  const variance =
    latencies.reduce((acc, val) => acc + Math.pow(val - averageMs, 2), 0) / latencies.length;
  const stdDev = Math.sqrt(variance);

  const successRate = successful.length / records.length;

  return {
    provider,
    averageMs,
    medianMs,
    minMs,
    maxMs,
    p95Ms,
    p99Ms,
    stdDev,
    sampleCount: latencies.length,
    successRate,
    lastUpdated: new Date(),
  };
}

/**
 * Predicts expected latency using weighted moving average
 *
 * @param records - Historical latency records
 * @param recentWeight - Weight for recent samples
 * @returns Predicted latency (ms)
 */
export function predictLatency(records: LatencyRecord[], recentWeight: number = 0.7): number {
  const successful = records.filter((r) => r.success);

  if (successful.length === 0) {
    return Infinity;
  }

  if (successful.length === 1) {
    return successful[0].latencyMs;
  }

  // Sort by timestamp (newest first)
  const sorted = successful.sort(
    (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
  );

  // Calculate weighted average
  let weightedSum = 0;
  let weightSum = 0;

  for (let i = 0; i < sorted.length; i++) {
    const weight = Math.pow(recentWeight, i);
    weightedSum += sorted[i].latencyMs * weight;
    weightSum += weight;
  }

  return weightSum > 0 ? weightedSum / weightSum : sorted[0].latencyMs;
}

/**
 * Calculates latency score (higher = better/faster)
 *
 * @param latencyMs - Latency in milliseconds
 * @param maxLatencyMs - Maximum acceptable latency
 * @returns Score from 0-100
 */
export function calculateLatencyScore(latencyMs: number, maxLatencyMs: number = 5000): number {
  const normalized = Math.min(latencyMs / maxLatencyMs, 1);
  return Math.max(0, (1 - normalized) * 100);
}

/**
 * Gets expected latency for a provider
 *
 * @param provider - Provider identifier
 * @param stats - Optional latency statistics
 * @returns Expected latency (ms)
 */
export function getExpectedLatency(
  provider: ProviderId,
  stats?: LatencyStats | null
): number {
  if (stats && stats.sampleCount > 0) {
    // Use p95 for conservative estimate
    return stats.p95Ms;
  }

  return DEFAULT_PROVIDER_LATENCY[provider] ?? 2000;
}

// ============================================================================
// Latency Router Class
// ============================================================================

/**
 * Latency-optimized router for Pi providers
 *
 * Routes requests to the provider with the lowest expected latency
 * while maintaining capability and health requirements.
 */
export class LatencyRouter extends EventEmitter {
  private config: LatencyRouterConfig;
  private latencyHistory: Map<string, LatencyRecord[]> = new Map();
  private statsCache: Map<string, LatencyStats> = new Map();
  private lastStatsUpdate: Map<string, number> = new Map();

  /**
   * Creates a new LatencyRouter
   *
   * @param config - Latency router configuration
   */
  constructor(config: Partial<LatencyRouterConfig> = {}) {
    super();
    this.config = { ...DEFAULT_LATENCY_CONFIG, ...config };
  }

  /**
   * Routes a request to the lowest-latency provider
   *
   * @param request - Latency routing request
   * @param providers - Available providers
   * @returns Latency routing result
   */
  route(request: LatencyRoutingRequest, providers: PiInstance[]): LatencyRoutingResult {
    if (providers.length === 0) {
      throw new PiRegistryError('No providers available for routing', 'NO_PROVIDERS');
    }

    // Determine max latency based on priority
    let maxLatencyMs = request.maxLatencyMs ?? this.config.defaultMaxLatencyMs;
    if (request.priority === 'high') {
      maxLatencyMs = Math.min(maxLatencyMs, this.config.highPriorityMaxLatencyMs);
    } else if (request.priority === 'critical') {
      maxLatencyMs = Math.min(maxLatencyMs, this.config.criticalPriorityMaxLatencyMs);
    }

    // Filter by capabilities
    let candidates = providers;
    if (request.requiredCapabilities && request.requiredCapabilities.length > 0) {
      candidates = providers.filter((p) =>
        request.requiredCapabilities!.every((cap) => p.capabilities.includes(cap))
      );
    }

    if (candidates.length === 0) {
      throw new PiRegistryError(
        'No providers meet capability requirements',
        'NO_CAPABLE_PROVIDERS'
      );
    }

    // Score each candidate
    const scored = candidates.map((provider) => {
      // Get expected latency
      const stats = request.useHistoricalData
        ? this.getStats(provider.provider)
        : null;
      const expectedLatencyMs = getExpectedLatency(provider.provider, stats);

      // Check max latency constraint
      if (expectedLatencyMs > maxLatencyMs) {
        return null;
      }

      // Calculate scores
      const latencyScore = calculateLatencyScore(expectedLatencyMs, maxLatencyMs);

      // Health score (based on success rate)
      let healthScore = 100;
      if (stats) {
        healthScore = stats.successRate * 100;
      } else if (provider.health === 'healthy') {
        healthScore = 100;
      } else if (provider.health === 'degraded') {
        healthScore = 70;
      } else {
        healthScore = 30;
      }

      // Capability score
      let capabilityScore = 100;
      if (request.requiredCapabilities && request.requiredCapabilities.length > 0) {
        const matching = request.requiredCapabilities.filter((cap) =>
          provider.capabilities.includes(cap)
        ).length;
        capabilityScore = (matching / request.requiredCapabilities.length) * 100;
      }

      // Combine scores
      const score = latencyScore * 0.5 + healthScore * 0.3 + capabilityScore * 0.2;

      return {
        provider,
        expectedLatencyMs,
        score,
        stats,
        scoreBreakdown: {
          latencyScore,
          healthScore,
          capabilityScore,
        },
      };
    });

    // Filter out nulls and sort by score descending
    const valid = scored.filter((s): s is NonNullable<typeof s> => s !== null);
    valid.sort((a, b) => b.score - a.score);

    if (valid.length === 0) {
      throw new PiRegistryError(
        'No providers meet latency constraints',
        'LATENCY_CONSTRAINT_VIOLATED'
      );
    }

    const selected = valid[0];
    const confidence = selected.stats
      ? Math.min(selected.stats.sampleCount / 10, 1)
      : 0.1;

    const result: LatencyRoutingResult = {
      provider: selected.provider,
      expectedLatencyMs: selected.expectedLatencyMs,
      confidence,
      alternatives: valid.slice(1).map((v) => ({
        provider: v.provider,
        expectedLatencyMs: v.expectedLatencyMs,
        score: v.score,
      })),
      stats: selected.stats,
      scoreBreakdown: selected.scoreBreakdown,
    };

    this.emit('routed', request.requestId, result);

    return result;
  }

  /**
   * Records a latency measurement
   *
   * @param record - Latency record
   */
  recordLatency(record: LatencyRecord): void {
    const key = `${record.provider}-${record.instanceId || 'default'}`;
    const history = this.latencyHistory.get(key) || [];

    history.push(record);

    // Keep window size limited
    if (history.length > this.config.sampleWindowSize) {
      history.shift();
    }

    this.latencyHistory.set(key, history);

    // Invalidate stats cache
    this.statsCache.delete(record.provider);
    this.lastStatsUpdate.delete(record.provider);

    this.emit('latency.recorded', record);

    if (!record.success) {
      this.emit('latency.failed', record);
    }
  }

  /**
   * Gets latency statistics for a provider
   *
   * @param provider - Provider identifier
   * @returns Latency statistics
   */
  getStats(provider: ProviderId): LatencyStats | null {
    // Check cache
    const cached = this.statsCache.get(provider);
    const lastUpdate = this.lastStatsUpdate.get(provider) || 0;
    const cacheAge = Date.now() - lastUpdate;

    // Cache valid for 60 seconds
    if (cached && cacheAge < 60000) {
      return cached;
    }

    // Aggregate all instances for this provider
    const allRecords: LatencyRecord[] = [];

    for (const [key, records] of this.latencyHistory) {
      if (key.startsWith(`${provider}-`)) {
        allRecords.push(...records);
      }
    }

    if (allRecords.length === 0) {
      return null;
    }

    const stats = calculateLatencyStats(allRecords, provider);

    if (stats) {
      this.statsCache.set(provider, stats);
      this.lastStatsUpdate.set(provider, Date.now());
    }

    return stats;
  }

  /**
   * Gets all provider latency statistics
   *
   * @returns Map of provider IDs to statistics
   */
  getAllStats(): Map<ProviderId, LatencyStats> {
    const stats = new Map<ProviderId, LatencyStats>();

    for (const provider of Object.keys(DEFAULT_PROVIDER_LATENCY) as ProviderId[]) {
      const providerStats = this.getStats(provider);
      if (providerStats) {
        stats.set(provider, providerStats);
      }
    }

    return stats;
  }

  /**
   * Gets the fastest provider based on recent measurements
   *
   * @param providers - Provider IDs to consider
   * @returns Fastest provider ID or undefined
   */
  getFastestProvider(providers: ProviderId[]): ProviderId | undefined {
    let fastest: ProviderId | undefined;
    let lowestLatency = Infinity;

    for (const provider of providers) {
      const stats = this.getStats(provider);
      const latency = stats ? stats.p95Ms : DEFAULT_PROVIDER_LATENCY[provider] ?? Infinity;

      if (latency < lowestLatency) {
        lowestLatency = latency;
        fastest = provider;
      }
    }

    return fastest;
  }

  /**
   * Performs a latency measurement for a provider
   *
   * @param provider - Provider instance
   * @returns Promise resolving to latency measurement
   */
  async measureLatency(provider: PiInstance): Promise<LatencyRecord> {
    const startTime = Date.now();

    try {
      // Perform health check or ping
      const response = await this.pingProvider(provider);
      const latencyMs = Date.now() - startTime;

      const record: LatencyRecord = {
        provider: provider.provider,
        instanceId: provider.id,
        latencyMs,
        timestamp: new Date(),
        success: response.success,
        error: response.error,
      };

      this.recordLatency(record);

      return record;
    } catch (error) {
      const record: LatencyRecord = {
        provider: provider.provider,
        instanceId: provider.id,
        latencyMs: Date.now() - startTime,
        timestamp: new Date(),
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };

      this.recordLatency(record);

      return record;
    }
  }

  /**
   * Pings a provider to measure latency
   *
   * @param provider - Provider instance
   * @returns Ping result
   */
  private async pingProvider(
    provider: PiInstance
  ): Promise<{ success: boolean; error?: string }> {
    // This would make an actual request to the provider
    // For now, simulate based on provider's current health
    return new Promise((resolve) => {
      const baseLatency = DEFAULT_PROVIDER_LATENCY[provider.provider] ?? 2000;
      const variance = baseLatency * 0.2;
      const latency = baseLatency + (Math.random() * variance - variance / 2);

      setTimeout(() => {
        if (provider.health === 'unhealthy') {
          resolve({ success: false, error: 'Provider unhealthy' });
        } else {
          resolve({ success: true });
        }
      }, latency);
    });
  }

  /**
   * Clears latency history
   */
  clearHistory(): void {
    this.latencyHistory.clear();
    this.statsCache.clear();
    this.lastStatsUpdate.clear();
    this.emit('history.cleared');
  }

  /**
   * Updates configuration
   *
   * @param config - New configuration (partial)
   */
  updateConfig(config: Partial<LatencyRouterConfig>): void {
    this.config = { ...this.config, ...config };
    this.emit('config.updated', this.config);
  }

  /**
   * Gets current configuration
   *
   * @returns Current configuration
   */
  getConfig(): LatencyRouterConfig {
    return { ...this.config };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalLatencyRouter: LatencyRouter | null = null;

/**
 * Gets the global LatencyRouter instance
 *
 * @returns Global LatencyRouter
 */
export function getGlobalLatencyRouter(): LatencyRouter {
  if (!globalLatencyRouter) {
    globalLatencyRouter = new LatencyRouter();
  }
  return globalLatencyRouter;
}

/**
 * Resets the global LatencyRouter (for testing)
 */
export function resetGlobalLatencyRouter(): void {
  globalLatencyRouter = null;
}

// Default export
export default LatencyRouter;
