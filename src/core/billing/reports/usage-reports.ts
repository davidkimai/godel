/**
 * Agent_9: Usage Reports
 * Usage reporting with cost breakdowns
 */

import { EventEmitter } from 'eventemitter3';
import CostTracker from '../cost-tracker';
import BudgetEnforcer from '../budget-enforcer';

export interface UsageReport {
  reportId: string;
  generatedAt: Date;
  period: {
    start: Date;
    end: Date;
  };
  summary: {
    totalCost: number;
    totalAgents: number;
    totalSessions: number;
    averageCostPerSession: number;
  };
  byAgent: AgentUsageBreakdown[];
  byResource: ResourceBreakdown[];
  byProvider: ProviderBreakdown[];
  dailyTrends: DailyTrend[];
  budgetStatus: BudgetStatus[];
}

export interface AgentUsageBreakdown {
  agentId: string;
  totalCost: number;
  computeCost: number;
  storageCost: number;
  networkCost: number;
  otherCost: number;
  sessionCount: number;
  averageSessionCost: number;
  mostUsedProvider: string;
  percentageOfTotal: number;
}

export interface ResourceBreakdown {
  type: string;
  cost: number;
  percentage: number;
  trend: 'increasing' | 'decreasing' | 'stable';
}

export interface ProviderBreakdown {
  provider: string;
  cost: number;
  percentage: number;
  sandboxHours: number;
  avgCostPerHour: number;
}

export interface DailyTrend {
  date: string;
  cost: number;
  agentCount: number;
  sessionCount: number;
}

export interface BudgetStatus {
  agentId: string;
  budget: number;
  spent: number;
  remaining: number;
  percentage: number;
  status: 'under' | 'approaching' | 'critical' | 'exceeded';
}

export class UsageReports extends EventEmitter {
  private costTracker: CostTracker;
  private budgetEnforcer: BudgetEnforcer;

  constructor(costTracker: CostTracker, budgetEnforcer: BudgetEnforcer) {
    super();
    this.costTracker = costTracker;
    this.budgetEnforcer = budgetEnforcer;
  }

  generateReport(options: {
    startDate?: Date;
    endDate?: Date;
    agentId?: string;
  } = {}): UsageReport {
    const endDate = options.endDate || new Date();
    const startDate = options.startDate || new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days

    const entries = this.costTracker.getEntries({
      agentId: options.agentId,
      startTime: startDate,
      endTime: endDate
    });

    const reportId = `report-${Date.now()}`;
    
    const report: UsageReport = {
      reportId,
      generatedAt: new Date(),
      period: { start: startDate, end: endDate },
      summary: this.calculateSummary(entries),
      byAgent: this.calculateAgentBreakdown(entries),
      byResource: this.calculateResourceBreakdown(entries),
      byProvider: this.calculateProviderBreakdown(entries),
      dailyTrends: this.calculateDailyTrends(entries),
      budgetStatus: this.calculateBudgetStatus()
    };

    this.emit('report:generated', { reportId, period: report.period });
    return report;
  }

  private calculateSummary(entries: any[]): UsageReport['summary'] {
    const totalCost = entries.reduce((sum, e) => sum + e.amount, 0);
    const sessionIds = new Set(entries.filter(e => e.sessionId).map(e => e.sessionId));
    const agentIds = new Set(entries.map(e => e.agentId));

    return {
      totalCost,
      totalAgents: agentIds.size,
      totalSessions: sessionIds.size,
      averageCostPerSession: sessionIds.size > 0 ? totalCost / sessionIds.size : 0
    };
  }

  private calculateAgentBreakdown(entries: any[]): AgentUsageBreakdown[] {
    const agentMap = new Map<string, any[]>();
    
    for (const entry of entries) {
      if (!agentMap.has(entry.agentId)) {
        agentMap.set(entry.agentId, []);
      }
      agentMap.get(entry.agentId)!.push(entry);
    }

    const totalCost = entries.reduce((sum, e) => sum + e.amount, 0);

    return Array.from(agentMap.entries()).map(([agentId, agentEntries]) => {
      const computeCost = agentEntries.filter(e => e.resourceType === 'compute').reduce((sum, e) => sum + e.amount, 0);
      const storageCost = agentEntries.filter(e => e.resourceType === 'storage').reduce((sum, e) => sum + e.amount, 0);
      const networkCost = agentEntries.filter(e => e.resourceType === 'network').reduce((sum, e) => sum + e.amount, 0);
      const otherCost = agentEntries.filter(e => e.resourceType === 'other').reduce((sum, e) => sum + e.amount, 0);
      const agentTotal = agentEntries.reduce((sum, e) => sum + e.amount, 0);

      const providerMap = new Map<string, number>();
      for (const entry of agentEntries) {
        providerMap.set(entry.provider, (providerMap.get(entry.provider) || 0) + entry.amount);
      }
      const mostUsedProvider = Array.from(providerMap.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';

      const sessionIds = new Set(agentEntries.filter(e => e.sessionId).map(e => e.sessionId));

      return {
        agentId,
        totalCost: agentTotal,
        computeCost,
        storageCost,
        networkCost,
        otherCost,
        sessionCount: sessionIds.size,
        averageSessionCost: sessionIds.size > 0 ? agentTotal / sessionIds.size : 0,
        mostUsedProvider,
        percentageOfTotal: totalCost > 0 ? (agentTotal / totalCost) * 100 : 0
      };
    }).sort((a, b) => b.totalCost - a.totalCost);
  }

  private calculateResourceBreakdown(entries: any[]): ResourceBreakdown[] {
    const resourceMap = new Map<string, number>();
    for (const entry of entries) {
      resourceMap.set(entry.resourceType, (resourceMap.get(entry.resourceType) || 0) + entry.amount);
    }

    const totalCost = entries.reduce((sum, e) => sum + e.amount, 0);

    return Array.from(resourceMap.entries()).map(([type, cost]) => ({
      type,
      cost,
      percentage: totalCost > 0 ? (cost / totalCost) * 100 : 0,
      trend: 'stable' as const
    })).sort((a, b) => b.cost - a.cost);
  }

  private calculateProviderBreakdown(entries: any[]): ProviderBreakdown[] {
    const providerMap = new Map<string, { cost: number; hours: number }>();
    
    for (const entry of entries) {
      const current = providerMap.get(entry.provider) || { cost: 0, hours: 0 };
      current.cost += entry.amount;
      
      if (entry.resourceType === 'compute' && entry.metadata?.durationMs) {
        current.hours += entry.metadata.durationMs / (1000 * 60 * 60);
      }
      
      providerMap.set(entry.provider, current);
    }

    const totalCost = entries.reduce((sum, e) => sum + e.amount, 0);

    return Array.from(providerMap.entries()).map(([provider, data]) => ({
      provider,
      cost: data.cost,
      percentage: totalCost > 0 ? (data.cost / totalCost) * 100 : 0,
      sandboxHours: data.hours,
      avgCostPerHour: data.hours > 0 ? data.cost / data.hours : 0
    })).sort((a, b) => b.cost - a.cost);
  }

  private calculateDailyTrends(entries: any[]): DailyTrend[] {
    const dateMap = new Map<string, { cost: number; agents: Set<string>; sessions: Set<string> }>();
    
    for (const entry of entries) {
      const date = entry.timestamp.toISOString().split('T')[0];
      if (!dateMap.has(date)) {
        dateMap.set(date, { cost: 0, agents: new Set(), sessions: new Set() });
      }
      const day = dateMap.get(date)!;
      day.cost += entry.amount;
      day.agents.add(entry.agentId);
      if (entry.sessionId) day.sessions.add(entry.sessionId);
    }

    return Array.from(dateMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, data]) => ({
        date,
        cost: data.cost,
        agentCount: data.agents.size,
        sessionCount: data.sessions.size
      }));
  }

  private calculateBudgetStatus(): BudgetStatus[] {
    const statuses = this.budgetEnforcer.getAllStatuses();
    
    return statuses.map(s => {
      let status: BudgetStatus['status'] = 'under';
      if (s.percentage >= 100) status = 'exceeded';
      else if (s.percentage >= 80) status = 'critical';
      else if (s.percentage >= 60) status = 'approaching';

      return {
        agentId: s.agentId,
        budget: s.budget,
        spent: s.spent,
        remaining: s.remaining,
        percentage: s.percentage,
        status
      };
    });
  }

  exportToJSON(report: UsageReport): string {
    return JSON.stringify(report, null, 2);
  }

  exportToCSV(report: UsageReport): string {
    const lines = [
      'Agent ID,Total Cost,Compute,Storage,Network,Other,Sessions,Avg Per Session',
      ...report.byAgent.map(a => 
        `${a.agentId},${a.totalCost.toFixed(4)},${a.computeCost.toFixed(4)},${a.storageCost.toFixed(4)},${a.networkCost.toFixed(4)},${a.otherCost.toFixed(4)},${a.sessionCount},${a.averageSessionCost.toFixed(4)}`
      )
    ];
    return lines.join('\n');
  }

  async scheduleReport(options: {
    frequency: 'daily' | 'weekly' | 'monthly';
    recipients: string[];
    format: 'json' | 'csv' | 'pdf';
  }): Promise<string> {
    const scheduleId = `schedule-${Date.now()}`;
    
    // In production, this would set up a scheduled job
    this.emit('report:scheduled', { scheduleId, ...options });
    
    return scheduleId;
  }

  getCostProjection(agentId: string, days: number = 30): {
    projectedCost: number;
    projectedAt: Date;
    confidence: number;
  } {
    const summary = this.costTracker.getAgentSummary(agentId);
    if (!summary) {
      return { projectedCost: 0, projectedAt: new Date(), confidence: 0 };
    }

    const dailyCosts = this.costTracker.getDailyCosts();
    const costs = Object.values(dailyCosts);
    
    if (costs.length === 0) {
      return { projectedCost: 0, projectedAt: new Date(), confidence: 0 };
    }

    const avgDaily = costs.reduce((a, b) => a + b, 0) / costs.length;
    const projectedCost = avgDaily * days;
    
    // Simple confidence based on data points
    const confidence = Math.min(costs.length / 30, 1);

    const projectedAt = new Date();
    projectedAt.setDate(projectedAt.getDate() + days);

    return { projectedCost, projectedAt, confidence };
  }
}

export default UsageReports;
