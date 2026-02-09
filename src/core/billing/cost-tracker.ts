/**
 * CostTracker - Per-agent cost tracking with real-time calculation
 * 
 * Tracks costs for agent runtime usage across all runtime providers.
 * Integrates with E2B, Kata, and Worktree providers for accurate
 * per-second billing.
 * 
 * @module @godel/core/billing/cost-tracker
 * @version 1.0.0
 * @since 2026-02-08
 * @see SPEC-002 Section 5.1
 */

import { EventEmitter } from 'events';

// ============================================================================
// Types
// ============================================================================

/**
 * Cost rates by runtime type
 */
export interface CostRates {
  /** E2B cost per hour */
  e2b: number;
  /** Kata cost per hour */
  kata: number;
  /** Worktree cost per hour (usually 0) */
  worktree: number;
}

/**
 * Configuration for CostTracker
 */
export interface CostTrackerConfig {
  /** Cost rates per runtime type (in USD per hour) */
  rates?: Partial<CostRates>;
  /** Enable real-time cost calculation */
  realTimeCalculation?: boolean;
  /** Cost update interval in milliseconds */
  updateInterval?: number;
  /** Callback when cost threshold is reached */
  onThresholdReached?: (agentId: string, cost: number, threshold: number) => void;
  /** Default cost threshold for alerts */
  defaultThreshold?: number;
}

/**
 * Agent cost record
 */
export interface AgentCost {
  /** Unique agent identifier */
  agentId: string;
  /** Runtime type used */
  runtimeType: 'e2b' | 'kata' | 'worktree';
  /** Runtime ID */
  runtimeId: string;
  /** Session start time */
  startTime: Date;
  /** Session end time (if ended) */
  endTime?: Date;
  /** Total runtime in milliseconds */
  duration: number;
  /** Current calculated cost in USD */
  cost: number;
  /** Cost rate used (USD per hour) */
  rate: number;
  /** Team ID for grouping */
  teamId?: string;
  /** User ID for attribution */
  userId?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Team cost summary
 */
export interface TeamCostSummary {
  /** Team identifier */
  teamId: string;
  /** Total cost for team */
  totalCost: number;
  /** Number of agents */
  agentCount: number;
  /** Cost by runtime type */
  byRuntime: Record<'e2b' | 'kata' | 'worktree', number>;
  /** Active vs completed sessions */
  activeSessions: number;
  completedSessions: number;
}

/**
 * Cost report
 */
export interface CostReport {
  /** Report generation time */
  generatedAt: Date;
  /** Total cost across all agents */
  totalCost: number;
  /** Total runtime in hours */
  totalHours: number;
  /** Cost by team */
  byTeam: TeamCostSummary[];
  /** Cost by runtime type */
  byRuntime: Record<'e2b' | 'kata' | 'worktree', number>;
  /** Active sessions count */
  activeSessions: number;
  /** Completed sessions count */
  completedSessions: number;
}

// ============================================================================
// CostTracker Implementation
// ============================================================================

export class CostTracker extends EventEmitter {
  private rates: CostRates;
  private realTimeCalculation: boolean;
  private updateInterval: number;
  private defaultThreshold: number;
  private activeSessions: Map<string, AgentCost> = new Map();
  private completedSessions: AgentCost[] = [];
  private updateTimer?: NodeJS.Timeout;
  private thresholds: Map<string, number> = new Map();
  private onThresholdReached?: (agentId: string, cost: number, threshold: number) => void;

  constructor(config: CostTrackerConfig = {}) {
    super();

    this.rates = {
      e2b: config.rates?.e2b ?? 0.50,      // $0.50/hour default for E2B
      kata: config.rates?.kata ?? 0.10,    // $0.10/hour default for Kata
      worktree: config.rates?.worktree ?? 0, // Free for worktree
    };

    this.realTimeCalculation = config.realTimeCalculation ?? true;
    this.updateInterval = config.updateInterval ?? 5000; // 5 seconds
    this.defaultThreshold = config.defaultThreshold ?? 10; // $10 default threshold
    this.onThresholdReached = config.onThresholdReached;

    if (this.realTimeCalculation) {
      this.startRealTimeUpdates();
    }
  }

  /**
   * Start tracking a new agent session
   */
  startTracking(
    agentId: string,
    runtimeType: 'e2b' | 'kata' | 'worktree',
    runtimeId: string,
    options?: {
      teamId?: string;
      userId?: string;
      threshold?: number;
      metadata?: Record<string, unknown>;
    }
  ): AgentCost {
    const existing = this.activeSessions.get(agentId);
    if (existing) {
      // Stop existing tracking first
      this.stopTracking(agentId);
    }

    const session: AgentCost = {
      agentId,
      runtimeType,
      runtimeId,
      startTime: new Date(),
      duration: 0,
      cost: 0,
      rate: this.rates[runtimeType],
      teamId: options?.teamId,
      userId: options?.userId,
      metadata: options?.metadata,
    };

    this.activeSessions.set(agentId, session);

    // Set threshold if provided
    if (options?.threshold !== undefined) {
      this.thresholds.set(agentId, options.threshold);
    }

    this.emit('sessionStarted', session);

    return session;
  }

  /**
   * Stop tracking an agent session
   */
  stopTracking(agentId: string): AgentCost | null {
    const session = this.activeSessions.get(agentId);
    if (!session) {
      return null;
    }

    session.endTime = new Date();
    session.duration = session.endTime.getTime() - session.startTime.getTime();
    session.cost = this.calculateCost(session.duration, session.rate);

    this.activeSessions.delete(agentId);
    this.thresholds.delete(agentId);
    this.completedSessions.push(session);

    this.emit('sessionEnded', session);

    return session;
  }

  /**
   * Get current cost for an active agent
   */
  getCurrentCost(agentId: string): number {
    const session = this.activeSessions.get(agentId);
    if (!session) {
      return 0;
    }

    const duration = Date.now() - session.startTime.getTime();
    return this.calculateCost(duration, session.rate);
  }

  /**
   * Get cost summary for an agent
   */
  getAgentCost(agentId: string): AgentCost | null {
    // Check active sessions
    const active = this.activeSessions.get(agentId);
    if (active) {
      // Calculate current cost
      const updated = { ...active };
      updated.duration = Date.now() - active.startTime.getTime();
      updated.cost = this.calculateCost(updated.duration, active.rate);
      return updated;
    }

    // Check completed sessions
    const completed = this.completedSessions.find(s => s.agentId === agentId);
    return completed || null;
  }

  /**
   * Get all costs for a team
   */
  getTeamCosts(teamId: string): TeamCostSummary {
    const teamSessions = [
      ...Array.from(this.activeSessions.values()).filter(s => s.teamId === teamId),
      ...this.completedSessions.filter(s => s.teamId === teamId),
    ];

    const byRuntime = {
      e2b: 0,
      kata: 0,
      worktree: 0,
    };

    let totalCost = 0;
    let activeCount = 0;
    let completedCount = 0;

    for (const session of teamSessions) {
      const cost = session.endTime 
        ? session.cost 
        : this.calculateCost(Date.now() - session.startTime.getTime(), session.rate);
      
      byRuntime[session.runtimeType] += cost;
      totalCost += cost;

      if (session.endTime) {
        completedCount++;
      } else {
        activeCount++;
      }
    }

    return {
      teamId,
      totalCost,
      agentCount: teamSessions.length,
      byRuntime,
      activeSessions: activeCount,
      completedSessions: completedCount,
    };
  }

  /**
   * Generate comprehensive cost report
   */
  generateReport(): CostReport {
    const allSessions = [
      ...Array.from(this.activeSessions.values()).map(s => ({
        ...s,
        cost: this.calculateCost(Date.now() - s.startTime.getTime(), s.rate),
        duration: Date.now() - s.startTime.getTime(),
      })),
      ...this.completedSessions,
    ];

    const byRuntime = {
      e2b: 0,
      kata: 0,
      worktree: 0,
    };

    const byTeamMap = new Map<string, TeamCostSummary>();
    let totalCost = 0;
    let totalDuration = 0;

    for (const session of allSessions) {
      const cost = session.cost;
      const duration = session.duration;

      byRuntime[session.runtimeType] += cost;
      totalCost += cost;
      totalDuration += duration;

      // Aggregate by team
      const teamId = session.teamId || 'default';
      const existing = byTeamMap.get(teamId);
      
      if (existing) {
        existing.totalCost += cost;
        existing.agentCount++;
        existing.byRuntime[session.runtimeType] += cost;
        if (session.endTime) {
          existing.completedSessions++;
        } else {
          existing.activeSessions++;
        }
      } else {
        byTeamMap.set(teamId, {
          teamId,
          totalCost: cost,
          agentCount: 1,
          byRuntime: {
            e2b: session.runtimeType === 'e2b' ? cost : 0,
            kata: session.runtimeType === 'kata' ? cost : 0,
            worktree: session.runtimeType === 'worktree' ? cost : 0,
          },
          activeSessions: session.endTime ? 0 : 1,
          completedSessions: session.endTime ? 1 : 0,
        });
      }
    }

    return {
      generatedAt: new Date(),
      totalCost,
      totalHours: totalDuration / (1000 * 60 * 60),
      byTeam: Array.from(byTeamMap.values()),
      byRuntime,
      activeSessions: this.activeSessions.size,
      completedSessions: this.completedSessions.length,
    };
  }

  /**
   * Update cost rates
   */
  updateRates(rates: Partial<CostRates>): void {
    this.rates = { ...this.rates, ...rates };
    this.emit('ratesUpdated', this.rates);
  }

  /**
   * Get current rates
   */
  getRates(): CostRates {
    return { ...this.rates };
  }

  /**
   * Set cost threshold for an agent
   */
  setThreshold(agentId: string, threshold: number): void {
    this.thresholds.set(agentId, threshold);
  }

  /**
   * Get cost threshold for an agent
   */
  getThreshold(agentId: string): number {
    return this.thresholds.get(agentId) ?? this.defaultThreshold;
  }

  /**
   * Check if agent has exceeded threshold
   */
  isThresholdExceeded(agentId: string): boolean {
    const threshold = this.getThreshold(agentId);
    const cost = this.getCurrentCost(agentId);
    return cost >= threshold;
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): AgentCost[] {
    return Array.from(this.activeSessions.values()).map(s => ({
      ...s,
      duration: Date.now() - s.startTime.getTime(),
      cost: this.calculateCost(Date.now() - s.startTime.getTime(), s.rate),
    }));
  }

  /**
   * Get all completed sessions
   */
  getCompletedSessions(): AgentCost[] {
    return [...this.completedSessions];
  }

  /**
   * Reset all tracking data
   */
  reset(): void {
    this.activeSessions.clear();
    this.completedSessions = [];
    this.thresholds.clear();
    this.emit('reset');
  }

  /**
   * Stop real-time updates
   */
  stop(): void {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = undefined;
    }
  }

  /**
   * Resume real-time updates
   */
  resume(): void {
    if (this.realTimeCalculation && !this.updateTimer) {
      this.startRealTimeUpdates();
    }
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Calculate cost from duration and rate
   */
  private calculateCost(durationMs: number, ratePerHour: number): number {
    const hours = durationMs / (1000 * 60 * 60);
    return hours * ratePerHour;
  }

  /**
   * Start real-time cost updates
   */
  private startRealTimeUpdates(): void {
    this.updateTimer = setInterval(() => {
      for (const [agentId, session] of this.activeSessions) {
        const cost = this.getCurrentCost(agentId);
        const threshold = this.getThreshold(agentId);

        // Check threshold
        if (cost >= threshold * 0.8 && cost < threshold) {
          this.emit('thresholdWarning', {
            agentId,
            cost,
            threshold,
            percent: (cost / threshold) * 100,
          });
        }

        if (cost >= threshold) {
          this.emit('thresholdExceeded', {
            agentId,
            cost,
            threshold,
          });

          if (this.onThresholdReached) {
            this.onThresholdReached(agentId, cost, threshold);
          }
        }

        // Emit cost update
        this.emit('costUpdated', {
          agentId,
          cost,
          duration: Date.now() - session.startTime.getTime(),
        });
      }
    }, this.updateInterval);
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalCostTracker: CostTracker | null = null;

/**
 * Get or create the global CostTracker instance
 */
export function getGlobalCostTracker(config?: CostTrackerConfig): CostTracker {
  if (!globalCostTracker) {
    globalCostTracker = new CostTracker(config);
  }
  return globalCostTracker;
}

/**
 * Initialize the global CostTracker
 */
export function initializeGlobalCostTracker(config: CostTrackerConfig): CostTracker {
  if (globalCostTracker) {
    globalCostTracker.stop();
  }
  globalCostTracker = new CostTracker(config);
  return globalCostTracker;
}

/**
 * Reset the global CostTracker
 */
export function resetGlobalCostTracker(): void {
  if (globalCostTracker) {
    globalCostTracker.stop();
    globalCostTracker.reset();
    globalCostTracker = null;
  }
}

export default CostTracker;
