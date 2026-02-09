/**
 * Agent_7: Cost Tracker
 * Per-agent cost tracking with real-time monitoring
 */

import { EventEmitter } from 'eventemitter3';

export interface CostEntry {
  id: string;
  agentId: string;
  provider: string;
  resourceType: 'compute' | 'storage' | 'network' | 'other';
  amount: number;
  unit: string;
  timestamp: Date;
  sessionId?: string;
  metadata?: Record<string, any>;
}

export interface AgentCostSummary {
  agentId: string;
  totalCost: number;
  byResource: Record<string, number>;
  byProvider: Record<string, number>;
  sessionCount: number;
  averageSessionCost: number;
  lastActivity: Date;
}

export interface CostAlert {
  type: 'warning' | 'critical';
  agentId: string;
  message: string;
  currentCost: number;
  threshold: number;
  timestamp: Date;
}

export class CostTracker extends EventEmitter {
  private entries: CostEntry[] = [];
  private agentSummaries: Map<string, AgentCostSummary> = new Map();
  private sessionCosts: Map<string, number> = new Map();
  private readonly MAX_ENTRIES = 10000;

  constructor() {
    super();
  }

  record(entry: Omit<CostEntry, 'id' | 'timestamp'>): CostEntry {
    const fullEntry: CostEntry = {
      ...entry,
      id: `cost-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date()
    };

    this.entries.push(fullEntry);
    
    // Maintain max entries limit
    if (this.entries.length > this.MAX_ENTRIES) {
      this.entries.shift();
    }

    this.updateAgentSummary(fullEntry);
    
    if (fullEntry.sessionId) {
      this.updateSessionCost(fullEntry);
    }

    this.emit('cost:recorded', fullEntry);
    return fullEntry;
  }

  private updateAgentSummary(entry: CostEntry): void {
    let summary = this.agentSummaries.get(entry.agentId);
    
    if (!summary) {
      summary = {
        agentId: entry.agentId,
        totalCost: 0,
        byResource: {},
        byProvider: {},
        sessionCount: 0,
        averageSessionCost: 0,
        lastActivity: entry.timestamp
      };
      this.agentSummaries.set(entry.agentId, summary);
    }

    summary.totalCost += entry.amount;
    summary.byResource[entry.resourceType] = (summary.byResource[entry.resourceType] || 0) + entry.amount;
    summary.byProvider[entry.provider] = (summary.byProvider[entry.provider] || 0) + entry.amount;
    summary.lastActivity = entry.timestamp;
  }

  private updateSessionCost(entry: CostEntry): void {
    if (!entry.sessionId) return;
    
    const currentCost = this.sessionCosts.get(entry.sessionId) || 0;
    this.sessionCosts.set(entry.sessionId, currentCost + entry.amount);
  }

  trackCompute(agentId: string, provider: string, durationMs: number, ratePerHour: number, sessionId?: string): CostEntry {
    const hours = durationMs / (1000 * 60 * 60);
    const cost = hours * ratePerHour;

    return this.record({
      agentId,
      provider,
      resourceType: 'compute',
      amount: cost,
      unit: 'USD',
      sessionId,
      metadata: { durationMs, ratePerHour }
    });
  }

  trackStorage(agentId: string, provider: string, bytesUsed: number, ratePerGBMonth: number, sessionId?: string): CostEntry {
    const gb = bytesUsed / (1024 * 1024 * 1024);
    const cost = gb * ratePerGBMonth;

    return this.record({
      agentId,
      provider,
      resourceType: 'storage',
      amount: cost,
      unit: 'USD',
      sessionId,
      metadata: { bytesUsed, ratePerGBMonth }
    });
  }

  trackNetwork(agentId: string, provider: string, bytesTransferred: number, ratePerGB: number, sessionId?: string): CostEntry {
    const gb = bytesTransferred / (1024 * 1024 * 1024);
    const cost = gb * ratePerGB;

    return this.record({
      agentId,
      provider,
      resourceType: 'network',
      amount: cost,
      unit: 'USD',
      sessionId,
      metadata: { bytesTransferred, ratePerGB }
    });
  }

  getAgentSummary(agentId: string): AgentCostSummary | undefined {
    return this.agentSummaries.get(agentId);
  }

  getAllSummaries(): AgentCostSummary[] {
    return Array.from(this.agentSummaries.values());
  }

  getSessionCost(sessionId: string): number {
    return this.sessionCosts.get(sessionId) || 0;
  }

  getTotalCost(): number {
    return this.entries.reduce((sum, entry) => sum + entry.amount, 0);
  }

  getCostByAgent(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [agentId, summary] of this.agentSummaries) {
      result[agentId] = summary.totalCost;
    }
    return result;
  }

  getCostByResource(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const entry of this.entries) {
      result[entry.resourceType] = (result[entry.resourceType] || 0) + entry.amount;
    }
    return result;
  }

  getCostByProvider(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const entry of this.entries) {
      result[entry.provider] = (result[entry.provider] || 0) + entry.amount;
    }
    return result;
  }

  getEntries(filters?: {
    agentId?: string;
    provider?: string;
    resourceType?: string;
    startTime?: Date;
    endTime?: Date;
  }): CostEntry[] {
    return this.entries.filter(entry => {
      if (filters?.agentId && entry.agentId !== filters.agentId) return false;
      if (filters?.provider && entry.provider !== filters.provider) return false;
      if (filters?.resourceType && entry.resourceType !== filters.resourceType) return false;
      if (filters?.startTime && entry.timestamp < filters.startTime) return false;
      if (filters?.endTime && entry.timestamp > filters.endTime) return false;
      return true;
    });
  }

  getTopAgents(limit: number = 10): AgentCostSummary[] {
    return this.getAllSummaries()
      .sort((a, b) => b.totalCost - a.totalCost)
      .slice(0, limit);
  }

  getDailyCosts(): Record<string, number> {
    const result: Record<string, number> = {};
    
    for (const entry of this.entries) {
      const date = entry.timestamp.toISOString().split('T')[0];
      result[date] = (result[date] || 0) + entry.amount;
    }
    
    return result;
  }

  checkBudget(agentId: string, budget: number): { withinBudget: boolean; remaining: number; percentage: number } {
    const summary = this.agentSummaries.get(agentId);
    const spent = summary?.totalCost || 0;
    const remaining = budget - spent;
    const percentage = budget > 0 ? (spent / budget) * 100 : 0;

    return {
      withinBudget: spent <= budget,
      remaining,
      percentage
    };
  }

  reset(): void {
    this.entries = [];
    this.agentSummaries.clear();
    this.sessionCosts.clear();
    this.emit('cost:reset');
  }

  export(): CostEntry[] {
    return [...this.entries];
  }

  import(entries: CostEntry[]): void {
    for (const entry of entries) {
      this.record({
        agentId: entry.agentId,
        provider: entry.provider,
        resourceType: entry.resourceType,
        amount: entry.amount,
        unit: entry.unit,
        sessionId: entry.sessionId,
        metadata: entry.metadata
      });
    }
  }
}

export default CostTracker;
