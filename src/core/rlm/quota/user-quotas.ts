/**
 * Agent 67: User Quota Management
 * Per-user agent limits, usage tracking across sessions
 * Enforces daily/weekly/monthly quotas with dashboard API
 */

import { EventEmitter } from 'events';

export interface UserQuotaConfig {
  userId: string;
  dailyAgentLimit: number;
  weeklyAgentLimit: number;
  monthlyAgentLimit: number;
  dailyComputeHours: number;
  maxConcurrentAgents: number;
  maxStorageGB: number;
}

export interface UsageRecord {
  timestamp: Date;
  agentsUsed: number;
  computeHours: number;
  storageUsedGB: number;
  sessionId: string;
}

export interface QuotaStatus {
  userId: string;
  period: 'daily' | 'weekly' | 'monthly';
  agentsUsed: number;
  agentsLimit: number;
  agentsRemaining: number;
  computeHoursUsed: number;
  computeHoursLimit: number;
  computeHoursRemaining: number;
  storageUsedGB: number;
  storageLimitGB: number;
  currentConcurrentAgents: number;
  maxConcurrentAgents: number;
  resetTime: Date;
  exceeded: boolean;
}

export interface QuotaViolation {
  userId: string;
  type: 'agents' | 'compute' | 'concurrent' | 'storage';
  limit: number;
  attempted: number;
  timestamp: Date;
}

export class UserQuotaManager extends EventEmitter {
  private userQuotas = new Map<string, UserQuotaConfig>();
  private usageHistory = new Map<string, UsageRecord[]>();
  private activeSessions = new Map<string, Set<string>>(); // userId -> sessionIds
  private sessionAgentCount = new Map<string, number>(); // sessionId -> agent count
  
  private metrics = {
    totalUsers: 0,
    activeUsers: 0,
    quotaViolations: 0,
    quotaChecks: 0,
  };

  /**
   * Configure quotas for a user
   */
  setUserQuotas(config: UserQuotaConfig): void {
    this.userQuotas.set(config.userId, config);
    if (!this.usageHistory.has(config.userId)) {
      this.usageHistory.set(config.userId, []);
      this.metrics.totalUsers++;
    }
    this.emit('quota:configured', { userId: config.userId, config });
  }

  /**
   * Get quota configuration for a user
   */
  getUserQuotas(userId: string): UserQuotaConfig | undefined {
    return this.userQuotas.get(userId);
  }

  /**
   * Check if user can allocate agents
   */
  canAllocateAgents(userId: string, count: number, sessionId: string): { allowed: boolean; reason?: string } {
    this.metrics.quotaChecks++;
    
    const quotas = this.userQuotas.get(userId);
    if (!quotas) {
      return { allowed: false, reason: 'User quotas not configured' };
    }

    const dailyStatus = this.getDailyQuotaStatus(userId);
    
    // Check daily agent limit
    if (dailyStatus.agentsRemaining < count) {
      this.emitQuotaViolation(userId, 'agents', dailyStatus.agentsLimit, dailyStatus.agentsUsed + count);
      return { 
        allowed: false, 
        reason: `Daily agent limit exceeded. Remaining: ${dailyStatus.agentsRemaining}, Requested: ${count}` 
      };
    }

    // Check concurrent agent limit
    const currentConcurrent = this.getCurrentConcurrentAgents(userId);
    const sessionCurrent = this.sessionAgentCount.get(sessionId) || 0;
    
    if (currentConcurrent + count > quotas.maxConcurrentAgents) {
      this.emitQuotaViolation(userId, 'concurrent', quotas.maxConcurrentAgents, currentConcurrent + count);
      return { 
        allowed: false, 
        reason: `Concurrent agent limit exceeded. Current: ${currentConcurrent}, Max: ${quotas.maxConcurrentAgents}` 
      };
    }

    return { allowed: true };
  }

  /**
   * Allocate agents to a session
   */
  allocateAgents(userId: string, count: number, sessionId: string): boolean {
    const check = this.canAllocateAgents(userId, count, sessionId);
    if (!check.allowed) {
      this.emit('allocation:rejected', { userId, count, sessionId, reason: check.reason });
      return false;
    }

    // Track session
    if (!this.activeSessions.has(userId)) {
      this.activeSessions.set(userId, new Set());
    }
    this.activeSessions.get(userId)!.add(sessionId);

    // Update session agent count
    const currentCount = this.sessionAgentCount.get(sessionId) || 0;
    this.sessionAgentCount.set(sessionId, currentCount + count);

    // Record usage
    this.recordUsage(userId, count, 0, 0, sessionId);

    this.metrics.activeUsers = this.activeSessions.size;
    this.emit('agents:allocated', { userId, count, sessionId, totalAllocated: currentCount + count });
    
    return true;
  }

  /**
   * Release agents from a session
   */
  releaseAgents(userId: string, count: number, sessionId: string): void {
    const currentCount = this.sessionAgentCount.get(sessionId) || 0;
    const newCount = Math.max(0, currentCount - count);
    
    this.sessionAgentCount.set(sessionId, newCount);

    if (newCount === 0) {
      // Clean up empty session
      const sessions = this.activeSessions.get(userId);
      if (sessions) {
        sessions.delete(sessionId);
        if (sessions.size === 0) {
          this.activeSessions.delete(userId);
        }
      }
      this.sessionAgentCount.delete(sessionId);
    }

    this.metrics.activeUsers = this.activeSessions.size;
    this.emit('agents:released', { userId, count, sessionId, remaining: newCount });
  }

  /**
   * Get daily quota status
   */
  getDailyQuotaStatus(userId: string): QuotaStatus {
    return this.getQuotaStatus(userId, 'daily');
  }

  /**
   * Get weekly quota status
   */
  getWeeklyQuotaStatus(userId: string): QuotaStatus {
    return this.getQuotaStatus(userId, 'weekly');
  }

  /**
   * Get monthly quota status
   */
  getMonthlyQuotaStatus(userId: string): QuotaStatus {
    return this.getQuotaStatus(userId, 'monthly');
  }

  /**
   * Get all quota statuses
   */
  getAllQuotaStatuses(userId: string): { daily: QuotaStatus; weekly: QuotaStatus; monthly: QuotaStatus } {
    return {
      daily: this.getDailyQuotaStatus(userId),
      weekly: this.getWeeklyQuotaStatus(userId),
      monthly: this.getMonthlyQuotaStatus(userId),
    };
  }

  /**
   * Record compute usage
   */
  recordComputeUsage(userId: string, computeHours: number, sessionId: string): void {
    this.recordUsage(userId, 0, computeHours, 0, sessionId);
    
    // Check if daily compute limit exceeded
    const quotas = this.userQuotas.get(userId);
    if (quotas) {
      const dailyStatus = this.getDailyQuotaStatus(userId);
      if (dailyStatus.computeHoursUsed > quotas.dailyComputeHours) {
        this.emitQuotaViolation(userId, 'compute', quotas.dailyComputeHours, dailyStatus.computeHoursUsed);
      }
    }
  }

  /**
   * Record storage usage
   */
  recordStorageUsage(userId: string, storageGB: number): void {
    const quotas = this.userQuotas.get(userId);
    if (quotas && storageGB > quotas.maxStorageGB) {
      this.emitQuotaViolation(userId, 'storage', quotas.maxStorageGB, storageGB);
    }
    
    this.emit('storage:recorded', { userId, storageGB });
  }

  /**
   * Get usage history for a user
   */
  getUsageHistory(userId: string, days: number = 30): UsageRecord[] {
    const history = this.usageHistory.get(userId) || [];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    
    return history.filter(r => r.timestamp >= cutoff);
  }

  /**
   * Get active sessions for a user
   */
  getActiveSessions(userId: string): string[] {
    const sessions = this.activeSessions.get(userId);
    return sessions ? Array.from(sessions) : [];
  }

  /**
   * Get all active users
   */
  getActiveUsers(): string[] {
    return Array.from(this.activeSessions.keys());
  }

  /**
   * Get metrics
   */
  getMetrics() {
    return { ...this.metrics };
  }

  /**
   * Dashboard API: Get quota overview for all users
   */
  getDashboardOverview(): {
    totalUsers: number;
    activeUsers: number;
    quotaViolations: number;
    usersOverLimit: Array<{ userId: string; status: QuotaStatus }>;
  } {
    const usersOverLimit: Array<{ userId: string; status: QuotaStatus }> = [];
    
    for (const userId of this.userQuotas.keys()) {
      const daily = this.getDailyQuotaStatus(userId);
      if (daily.exceeded) {
        usersOverLimit.push({ userId, status: daily });
      }
    }

    return {
      totalUsers: this.metrics.totalUsers,
      activeUsers: this.metrics.activeUsers,
      quotaViolations: this.metrics.quotaViolations,
      usersOverLimit,
    };
  }

  /**
   * Dashboard API: Get user details
   */
  getUserDetails(userId: string): {
    quotas: UserQuotaConfig | undefined;
    statuses: { daily: QuotaStatus; weekly: QuotaStatus; monthly: QuotaStatus };
    activeSessions: string[];
    recentUsage: UsageRecord[];
  } | null {
    const quotas = this.userQuotas.get(userId);
    if (!quotas) return null;

    return {
      quotas,
      statuses: this.getAllQuotaStatuses(userId),
      activeSessions: this.getActiveSessions(userId),
      recentUsage: this.getUsageHistory(userId, 7),
    };
  }

  /**
   * Reset daily quotas (call at midnight)
   */
  resetDailyQuotas(): void {
    // Clean up old usage records
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90); // Keep 90 days

    for (const [userId, history] of this.usageHistory) {
      const filtered = history.filter(r => r.timestamp >= cutoff);
      this.usageHistory.set(userId, filtered);
    }

    this.emit('quotas:daily-reset');
  }

  // Private methods

  private getQuotaStatus(userId: string, period: 'daily' | 'weekly' | 'monthly'): QuotaStatus {
    const quotas = this.userQuotas.get(userId);
    const now = new Date();
    
    if (!quotas) {
      return {
        userId,
        period,
        agentsUsed: 0,
        agentsLimit: 0,
        agentsRemaining: 0,
        computeHoursUsed: 0,
        computeHoursLimit: 0,
        computeHoursRemaining: 0,
        storageUsedGB: 0,
        storageLimitGB: 0,
        currentConcurrentAgents: 0,
        maxConcurrentAgents: 0,
        resetTime: now,
        exceeded: true,
      };
    }

    const { start, end } = this.getPeriodBounds(period, now);
    const history = this.getUsageInPeriod(userId, start, end);

    const agentsUsed = history.reduce((sum, r) => sum + r.agentsUsed, 0);
    const computeHoursUsed = history.reduce((sum, r) => sum + r.computeHours, 0);
    const currentConcurrent = this.getCurrentConcurrentAgents(userId);

    let agentsLimit: number;
    let computeHoursLimit: number;
    let resetTime: Date;

    switch (period) {
      case 'daily':
        agentsLimit = quotas.dailyAgentLimit;
        computeHoursLimit = quotas.dailyComputeHours;
        resetTime = new Date(now);
        resetTime.setHours(24, 0, 0, 0);
        break;
      case 'weekly':
        agentsLimit = quotas.weeklyAgentLimit;
        computeHoursLimit = quotas.dailyComputeHours * 7;
        resetTime = new Date(now);
        resetTime.setDate(now.getDate() + (7 - now.getDay()));
        resetTime.setHours(0, 0, 0, 0);
        break;
      case 'monthly':
        agentsLimit = quotas.monthlyAgentLimit;
        computeHoursLimit = quotas.dailyComputeHours * 30;
        resetTime = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        break;
    }

    const exceeded = agentsUsed > agentsLimit || computeHoursUsed > computeHoursLimit;

    return {
      userId,
      period,
      agentsUsed,
      agentsLimit,
      agentsRemaining: Math.max(0, agentsLimit - agentsUsed),
      computeHoursUsed,
      computeHoursLimit,
      computeHoursRemaining: Math.max(0, computeHoursLimit - computeHoursUsed),
      storageUsedGB: 0, // Would be tracked separately
      storageLimitGB: quotas.maxStorageGB,
      currentConcurrentAgents: currentConcurrent,
      maxConcurrentAgents: quotas.maxConcurrentAgents,
      resetTime,
      exceeded,
    };
  }

  private getPeriodBounds(period: 'daily' | 'weekly' | 'monthly', now: Date): { start: Date; end: Date } {
    const end = new Date(now);
    const start = new Date(now);

    switch (period) {
      case 'daily':
        start.setHours(0, 0, 0, 0);
        break;
      case 'weekly':
        start.setDate(now.getDate() - now.getDay());
        start.setHours(0, 0, 0, 0);
        break;
      case 'monthly':
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        break;
    }

    return { start, end };
  }

  private getUsageInPeriod(userId: string, start: Date, end: Date): UsageRecord[] {
    const history = this.usageHistory.get(userId) || [];
    return history.filter(r => r.timestamp >= start && r.timestamp <= end);
  }

  private getCurrentConcurrentAgents(userId: string): number {
    let total = 0;
    const sessions = this.activeSessions.get(userId);
    if (sessions) {
      for (const sessionId of sessions) {
        total += this.sessionAgentCount.get(sessionId) || 0;
      }
    }
    return total;
  }

  private recordUsage(userId: string, agentsUsed: number, computeHours: number, storageUsedGB: number, sessionId: string): void {
    const record: UsageRecord = {
      timestamp: new Date(),
      agentsUsed,
      computeHours,
      storageUsedGB,
      sessionId,
    };

    const history = this.usageHistory.get(userId) || [];
    history.push(record);
    this.usageHistory.set(userId, history);
  }

  private emitQuotaViolation(userId: string, type: QuotaViolation['type'], limit: number, attempted: number): void {
    this.metrics.quotaViolations++;
    const violation: QuotaViolation = {
      userId,
      type,
      limit,
      attempted,
      timestamp: new Date(),
    };
    this.emit('quota:violation', violation);
  }
}

export default UserQuotaManager;
