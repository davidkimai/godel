/**
 * Quota System - Per-team resource quota management with K8s integration
 *
 * Features:
 * - Track CPU/memory usage per team
 * - Enforce hard limits on resource consumption
 * - Alert at 80% threshold
 * - Fair scheduling between teams
 * - Integration with K8s ResourceQuota
 */

import { EventEmitter } from 'events';

// Simple UUID generator to avoid external dependency
declare function require(id: string): any;
let uuidv4: () => string;
try {
  const uuid = require('uuid');
  uuidv4 = uuid.v4;
} catch {
  // Fallback UUID generator
  uuidv4 = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  };
}

export interface TeamQuota {
  teamId: string;
  namespace: string;
  cpuLimit: number; // millicores
  memoryLimit: number; // MiB
  cpuRequest: number; // millicores
  memoryRequest: number; // MiB
  maxPods: number;
  maxServices: number;
  maxConfigMaps: number;
  maxSecrets: number;
}

export interface ResourceUsage {
  teamId: string;
  cpuUsed: number; // millicores
  memoryUsed: number; // MiB
  podsUsed: number;
  servicesUsed: number;
  configMapsUsed: number;
  secretsUsed: number;
  timestamp: Date;
}

export interface QuotaAlert {
  id: string;
  teamId: string;
  severity: 'info' | 'warning' | 'critical';
  type: QuotaAlertType;
  resource: ResourceType;
  usagePercent: number;
  limit: number;
  used: number;
  message: string;
  timestamp: Date;
  acknowledged: boolean;
}

export type QuotaAlertType = 'threshold_80' | 'threshold_90' | 'limit_exceeded' | 'scheduling_blocked' | 'hard_limit_enforced';
export type ResourceType = 'cpu' | 'memory' | 'pods' | 'services' | 'configMaps' | 'secrets';

export interface ResourceRequest {
  requestId: string;
  teamId: string;
  cpu: number; // millicores
  memory: number; // MiB
  priority: number; // 1-10, higher = more important
  createdAt: Date;
  podSpec?: PodSpec;
}

export interface PodSpec {
  name: string;
  namespace: string;
  containers: ContainerSpec[];
  labels?: Record<string, string>;
}

export interface ContainerSpec {
  name: string;
  image: string;
  cpuRequest: number;
  cpuLimit: number;
  memoryRequest: number;
  memoryLimit: number;
}

export interface SchedulingDecision {
  requestId: string;
  teamId: string;
  allowed: boolean;
  reason?: string;
  cpuAllocated: number;
  memoryAllocated: number;
  scheduledAt: Date;
  waitTimeMs: number;
}

export interface TeamMetrics {
  teamId: string;
  cpuUtilization: number; // percentage
  memoryUtilization: number; // percentage
  podUtilization: number; // percentage
  totalRequests: number;
  allowedRequests: number;
  deniedRequests: number;
  avgWaitTimeMs: number;
  p95WaitTimeMs: number;
  lastAlertTime?: Date;
}

export interface QuotaSystemConfig {
  alertThresholdPercent: number; // default 80
  criticalThresholdPercent: number; // default 95
  hardLimitEnabled: boolean;
  fairSchedulingEnabled: boolean;
  burstModeEnabled: boolean;
  burstMultiplier: number; // default 1.2
  checkIntervalMs: number;
  alertCooldownMs: number;
  cleanupIntervalMs: number;
  maxHistoryAgeMs: number;
}

export interface FairShareConfig {
  totalClusterCPU: number;
  totalClusterMemory: number;
  minSharePerTeam: number; // minimum guaranteed share
  maxSharePerTeam: number; // maximum allowed share
}

interface PendingRequest extends ResourceRequest {
  resolve: (decision: SchedulingDecision) => void;
  reject: (error: Error) => void;
}

const DEFAULT_CONFIG: QuotaSystemConfig = {
  alertThresholdPercent: 80,
  criticalThresholdPercent: 95,
  hardLimitEnabled: true,
  fairSchedulingEnabled: true,
  burstModeEnabled: true,
  burstMultiplier: 1.2,
  checkIntervalMs: 30000, // 30 seconds
  alertCooldownMs: 300000, // 5 minutes
  cleanupIntervalMs: 600000, // 10 minutes
  maxHistoryAgeMs: 86400000, // 24 hours
};

export class QuotaSystem extends EventEmitter {
  private teamQuotas: Map<string, TeamQuota> = new Map();
  private resourceUsage: Map<string, ResourceUsage> = new Map();
  private usageHistory: Map<string, ResourceUsage[]> = new Map();
  private pendingRequests: PendingRequest[] = [];
  private schedulingQueue: ResourceRequest[] = [];
  private alerts: QuotaAlert[] = [];
  private alertHistory: QuotaAlert[] = [];
  private schedulingDecisions: SchedulingDecision[] = [];
  private teamMetrics: Map<string, TeamMetrics> = new Map();
  private config: QuotaSystemConfig;
  private checkTimer?: ReturnType<typeof setInterval>;
  private cleanupTimer?: ReturnType<typeof setInterval>;
  private fairShareConfig?: FairShareConfig;
  private lastAlertTime: Map<string, Date> = new Map();

  constructor(config: Partial<QuotaSystemConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.startBackgroundTasks();
  }

  /**
   * Register a team with resource quotas
   */
  registerTeam(quota: TeamQuota): void {
    if (this.teamQuotas.has(quota.teamId)) {
      throw new Error(`Team ${quota.teamId} is already registered`);
    }

    this.teamQuotas.set(quota.teamId, quota);
    this.resourceUsage.set(quota.teamId, {
      teamId: quota.teamId,
      cpuUsed: 0,
      memoryUsed: 0,
      podsUsed: 0,
      servicesUsed: 0,
      configMapsUsed: 0,
      secretsUsed: 0,
      timestamp: new Date(),
    });

    this.teamMetrics.set(quota.teamId, this.initializeTeamMetrics(quota.teamId));
    this.usageHistory.set(quota.teamId, []);

    this.emit('team:registered', { teamId: quota.teamId, quota, timestamp: new Date() });
  }

  /**
   * Update team quota
   */
  updateTeamQuota(teamId: string, updates: Partial<TeamQuota>): void {
    const quota = this.teamQuotas.get(teamId);
    if (!quota) {
      throw new Error(`Team ${teamId} not found`);
    }

    const updatedQuota = { ...quota, ...updates };
    this.teamQuotas.set(teamId, updatedQuota);

    this.emit('team:quota_updated', { teamId, quota: updatedQuota, timestamp: new Date() });
  }

  /**
   * Remove team registration
   */
  unregisterTeam(teamId: string): boolean {
    if (!this.teamQuotas.has(teamId)) {
      return false;
    }

    this.teamQuotas.delete(teamId);
    this.resourceUsage.delete(teamId);
    this.usageHistory.delete(teamId);
    this.teamMetrics.delete(teamId);

    this.emit('team:unregistered', { teamId, timestamp: new Date() });
    return true;
  }

  /**
   * Request resources for a team
   */
  async requestResources(request: Omit<ResourceRequest, 'requestId' | 'createdAt'>): Promise<SchedulingDecision> {
    const fullRequest: ResourceRequest = {
      ...request,
      requestId: uuidv4(),
      createdAt: new Date(),
    };

    // Check if team exists
    if (!this.teamQuotas.has(request.teamId)) {
      return this.createDenial(fullRequest, 'Team not registered');
    }

    // Check hard limits
    if (this.config.hardLimitEnabled) {
      const limitCheck = this.checkHardLimits(request.teamId, request.cpu, request.memory);
      if (!limitCheck.allowed) {
        const reason = limitCheck.reason || 'Hard limit exceeded';
        this.emit('request:denied_hard_limit', { request: fullRequest, reason });
        return this.createDenial(fullRequest, reason);
      }
    }

    // For fair scheduling, queue the request
    if (this.config.fairSchedulingEnabled) {
      return this.scheduleWithFairShare(fullRequest);
    }

    // Direct allocation
    return this.allocateResources(fullRequest);
  }

  /**
   * Check hard limits for a team
   */
  private checkHardLimits(teamId: string, cpu: number, memory: number): { allowed: boolean; reason?: string } {
    const quota = this.teamQuotas.get(teamId);
    const usage = this.resourceUsage.get(teamId);

    if (!quota || !usage) {
      return { allowed: false, reason: 'Team not found' };
    }

    // Check CPU limit
    const projectedCPU = usage.cpuUsed + cpu;
    if (projectedCPU > quota.cpuLimit) {
      return {
        allowed: false,
        reason: `CPU limit exceeded. Used: ${usage.cpuUsed}m, Requested: ${cpu}m, Limit: ${quota.cpuLimit}m`,
      };
    }

    // Check memory limit
    const projectedMemory = usage.memoryUsed + memory;
    if (projectedMemory > quota.memoryLimit) {
      return {
        allowed: false,
        reason: `Memory limit exceeded. Used: ${usage.memoryUsed}Mi, Requested: ${memory}Mi, Limit: ${quota.memoryLimit}Mi`,
      };
    }

    // Check burst mode
    if (this.config.burstModeEnabled) {
      const cpuThreshold = quota.cpuLimit * this.config.burstMultiplier;
      const memoryThreshold = quota.memoryLimit * this.config.burstMultiplier;

      if (projectedCPU > cpuThreshold || projectedMemory > memoryThreshold) {
        return {
          allowed: false,
          reason: `Burst limit exceeded. CPU threshold: ${cpuThreshold}m, Memory threshold: ${memoryThreshold}Mi`,
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Schedule resources with fair share algorithm
   */
  private scheduleWithFairShare(request: ResourceRequest): Promise<SchedulingDecision> {
    return new Promise((resolve, reject) => {
      const pendingRequest: PendingRequest = {
        ...request,
        resolve,
        reject,
      };

      this.pendingRequests.push(pendingRequest);
      this.schedulingQueue.push(request);

      this.emit('request:queued', {
        requestId: request.requestId,
        teamId: request.teamId,
        queuePosition: this.schedulingQueue.length,
        timestamp: new Date(),
      });

      // Process queue immediately
      this.processSchedulingQueue();
    });
  }

  /**
   * Process the scheduling queue with fair share
   */
  private async processSchedulingQueue(): Promise<void> {
    if (this.schedulingQueue.length === 0) return;

    // Sort by priority and fair share weight
    const sortedRequests = this.sortByFairShare([...this.schedulingQueue]);

    for (const request of sortedRequests) {
      const quota = this.teamQuotas.get(request.teamId);
      const usage = this.resourceUsage.get(request.teamId);

      if (!quota || !usage) continue;

      // Calculate fair share weight
      const weight = this.calculateFairShareWeight(request.teamId);

      // Check if team is over their fair share
      if (weight > 1.0 && this.config.fairSchedulingEnabled) {
        // Team is over fair share, check if others are waiting
        const underutilizedTeams = this.getUnderutilizedTeams();
        if (underutilizedTeams.length > 0) {
          continue; // Skip for now, let underutilized teams go first
        }
      }

      // Try to allocate
      const decision = await this.allocateResources(request);

      // Remove from queue
      this.removeFromQueue(request.requestId);

      // Resolve pending promise
      const pending = this.pendingRequests.find(p => p.requestId === request.requestId);
      if (pending) {
        pending.resolve(decision);
        this.pendingRequests = this.pendingRequests.filter(p => p.requestId !== request.requestId);
      }

      // Emit scheduling event
      this.emit('request:scheduled', decision);
    }
  }

  /**
   * Sort requests by fair share priority
   */
  private sortByFairShare(requests: ResourceRequest[]): ResourceRequest[] {
    return requests.sort((a, b) => {
      const weightA = this.calculateFairShareWeight(a.teamId);
      const weightB = this.calculateFairShareWeight(b.teamId);

      // Lower weight = higher priority
      if (weightA !== weightB) {
        return weightA - weightB;
      }

      // If weights are equal, use priority
      return b.priority - a.priority;
    });
  }

  /**
   * Calculate fair share weight for a team
   */
  private calculateFairShareWeight(teamId: string): number {
    const quota = this.teamQuotas.get(teamId);
    const usage = this.resourceUsage.get(teamId);

    if (!quota || !usage || quota.cpuLimit === 0) {
      return Infinity;
    }

    // Weight = current usage / quota
    const cpuWeight = usage.cpuUsed / quota.cpuLimit;
    const memoryWeight = usage.memoryUsed / quota.memoryLimit;

    return Math.max(cpuWeight, memoryWeight);
  }

  /**
   * Get teams that are under their fair share
   */
  private getUnderutilizedTeams(): string[] {
    const underutilized: string[] = [];

    for (const [teamId, quota] of this.teamQuotas) {
      const usage = this.resourceUsage.get(teamId);
      if (!usage) continue;

      const cpuUtil = usage.cpuUsed / quota.cpuLimit;
      const memoryUtil = usage.memoryUsed / quota.memoryLimit;

      if (cpuUtil < 0.5 && memoryUtil < 0.5) {
        underutilized.push(teamId);
      }
    }

    return underutilized;
  }

  /**
   * Allocate resources for a request
   */
  private async allocateResources(request: ResourceRequest): Promise<SchedulingDecision> {
    const usage = this.resourceUsage.get(request.teamId);

    if (!usage) {
      return this.createDenial(request, 'Team not found');
    }

    const startTime = performance.now();

    // Update usage
    usage.cpuUsed += request.cpu;
    usage.memoryUsed += request.memory;
    usage.podsUsed += 1;
    usage.timestamp = new Date();

    // Record history
    this.recordUsageHistory(request.teamId, { ...usage });

    // Check for threshold alerts
    this.checkThresholds(request.teamId);

    const decision: SchedulingDecision = {
      requestId: request.requestId,
      teamId: request.teamId,
      allowed: true,
      cpuAllocated: request.cpu,
      memoryAllocated: request.memory,
      scheduledAt: new Date(),
      waitTimeMs: performance.now() - startTime,
    };

    this.schedulingDecisions.push(decision);
    this.updateTeamMetrics(request.teamId, decision);

    return decision;
  }

  /**
   * Release resources back to the pool
   */
  releaseResources(teamId: string, cpu: number, memory: number, pods: number = 1): void {
    const usage = this.resourceUsage.get(teamId);
    if (!usage) {
      throw new Error(`Team ${teamId} not found`);
    }

    usage.cpuUsed = Math.max(0, usage.cpuUsed - cpu);
    usage.memoryUsed = Math.max(0, usage.memoryUsed - memory);
    usage.podsUsed = Math.max(0, usage.podsUsed - pods);
    usage.timestamp = new Date();

    this.emit('resources:released', {
      teamId,
      cpuReleased: cpu,
      memoryReleased: memory,
      podsReleased: pods,
      timestamp: new Date(),
    });

    // Process queue after release
    this.processSchedulingQueue();
  }

  /**
   * Create a scheduling denial
   */
  private createDenial(request: ResourceRequest, reason: string): SchedulingDecision {
    return {
      requestId: request.requestId,
      teamId: request.teamId,
      allowed: false,
      reason,
      cpuAllocated: 0,
      memoryAllocated: 0,
      scheduledAt: new Date(),
      waitTimeMs: 0,
    };
  }

  /**
   * Record usage history for a team
   */
  private recordUsageHistory(teamId: string, usage: ResourceUsage): void {
    const history = this.usageHistory.get(teamId) || [];
    history.push({ ...usage });

    // Trim history to max age
    const cutoff = Date.now() - this.config.maxHistoryAgeMs;
    const filtered = history.filter(h => h.timestamp.getTime() > cutoff);

    this.usageHistory.set(teamId, filtered);
  }

  /**
   * Check and emit threshold alerts
   */
  private checkThresholds(teamId: string): void {
    const quota = this.teamQuotas.get(teamId);
    const usage = this.resourceUsage.get(teamId);

    if (!quota || !usage) return;

    const cpuPercent = (usage.cpuUsed / quota.cpuLimit) * 100;
    const memoryPercent = (usage.memoryUsed / quota.memoryLimit) * 100;

    // Check CPU thresholds
    if (cpuPercent >= this.config.criticalThresholdPercent) {
      this.emitAlert(teamId, 'critical', 'limit_exceeded', 'cpu', cpuPercent, quota.cpuLimit, usage.cpuUsed);
    } else if (cpuPercent >= this.config.alertThresholdPercent) {
      this.emitAlert(teamId, 'warning', 'threshold_80', 'cpu', cpuPercent, quota.cpuLimit, usage.cpuUsed);
    }

    // Check memory thresholds
    if (memoryPercent >= this.config.criticalThresholdPercent) {
      this.emitAlert(teamId, 'critical', 'limit_exceeded', 'memory', memoryPercent, quota.memoryLimit, usage.memoryUsed);
    } else if (memoryPercent >= this.config.alertThresholdPercent) {
      this.emitAlert(teamId, 'warning', 'threshold_80', 'memory', memoryPercent, quota.memoryLimit, usage.memoryUsed);
    }
  }

  /**
   * Emit an alert
   */
  private emitAlert(
    teamId: string,
    severity: 'info' | 'warning' | 'critical',
    type: QuotaAlertType,
    resource: ResourceType,
    usagePercent: number,
    limit: number,
    used: number
  ): void {
    const alertKey = `${teamId}-${resource}-${type}`;
    const lastAlert = this.lastAlertTime.get(alertKey);

    // Apply cooldown
    if (lastAlert && Date.now() - lastAlert.getTime() < this.config.alertCooldownMs) {
      return;
    }

    const alert: QuotaAlert = {
      id: uuidv4(),
      teamId,
      severity,
      type,
      resource,
      usagePercent,
      limit,
      used,
      message: this.generateAlertMessage(teamId, severity, resource, usagePercent, limit, used),
      timestamp: new Date(),
      acknowledged: false,
    };

    this.alerts.push(alert);
    this.alertHistory.push(alert);
    this.lastAlertTime.set(alertKey, alert.timestamp);

    // Update team metrics
    const metrics = this.teamMetrics.get(teamId);
    if (metrics) {
      metrics.lastAlertTime = alert.timestamp;
    }

    this.emit('alert', alert);
  }

  /**
   * Generate alert message
   */
  private generateAlertMessage(
    teamId: string,
    severity: string,
    resource: ResourceType,
    usagePercent: number,
    limit: number,
    used: number
  ): string {
    const unit = resource === 'cpu' ? 'm' : 'Mi';
    return `[${severity.toUpperCase()}] Team ${teamId}: ${resource} usage at ${usagePercent.toFixed(1)}% ` +
           `(${used}${unit}/${limit}${unit})`;
  }

  /**
   * Update team metrics
   */
  private updateTeamMetrics(teamId: string, decision: SchedulingDecision): void {
    const metrics = this.teamMetrics.get(teamId);
    if (!metrics) return;

    metrics.totalRequests++;

    if (decision.allowed) {
      metrics.allowedRequests++;
    } else {
      metrics.deniedRequests++;
    }

    // Update wait time metrics
    const waitTimes = this.schedulingDecisions
      .filter(d => d.teamId === teamId)
      .map(d => d.waitTimeMs);

    if (waitTimes.length > 0) {
      metrics.avgWaitTimeMs = waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length;
      const sorted = [...waitTimes].sort((a, b) => a - b);
      metrics.p95WaitTimeMs = sorted[Math.floor(sorted.length * 0.95)] || 0;
    }
  }

  /**
   * Calculate utilization metrics
   */
  private calculateUtilization(teamId: string): void {
    const quota = this.teamQuotas.get(teamId);
    const usage = this.resourceUsage.get(teamId);
    const metrics = this.teamMetrics.get(teamId);

    if (!quota || !usage || !metrics) return;

    metrics.cpuUtilization = (usage.cpuUsed / quota.cpuLimit) * 100;
    metrics.memoryUtilization = (usage.memoryUsed / quota.memoryLimit) * 100;
    metrics.podUtilization = (usage.podsUsed / quota.maxPods) * 100;
  }

  /**
   * Remove request from queue
   */
  private removeFromQueue(requestId: string): void {
    this.schedulingQueue = this.schedulingQueue.filter(r => r.requestId !== requestId);
  }

  /**
   * Start background tasks
   */
  private startBackgroundTasks(): void {
    // Periodic quota checks
    this.checkTimer = setInterval(() => {
      this.checkAllThresholds();
    }, this.config.checkIntervalMs);

    // Cleanup old data
    this.cleanupTimer = setInterval(() => {
      this.cleanupOldData();
    }, this.config.cleanupIntervalMs);
  }

  /**
   * Check thresholds for all teams
   */
  private checkAllThresholds(): void {
    for (const teamId of this.teamQuotas.keys()) {
      this.checkThresholds(teamId);
    }
  }

  /**
   * Cleanup old data
   */
  private cleanupOldData(): void {
    const cutoff = Date.now() - this.config.maxHistoryAgeMs;

    // Cleanup alert history
    this.alertHistory = this.alertHistory.filter(a => a.timestamp.getTime() > cutoff);

    // Cleanup scheduling decisions
    this.schedulingDecisions = this.schedulingDecisions.filter(d => d.scheduledAt.getTime() > cutoff);

    // Cleanup old alerts
    this.alerts = this.alerts.filter(a => !a.acknowledged || a.timestamp.getTime() > cutoff);
  }

  /**
   * Generate K8s ResourceQuota YAML
   */
  generateResourceQuotaYAML(teamId: string): string {
    const quota = this.teamQuotas.get(teamId);
    if (!quota) {
      throw new Error(`Team ${teamId} not found`);
    }

    return `apiVersion: v1
kind: ResourceQuota
metadata:
  name: team-${teamId}-quota
  namespace: ${quota.namespace}
spec:
  hard:
    requests.cpu: "${quota.cpuRequest}m"
    requests.memory: "${quota.memoryRequest}Mi"
    limits.cpu: "${quota.cpuLimit}m"
    limits.memory: "${quota.memoryLimit}Mi"
    pods: "${quota.maxPods}"
    services: "${quota.maxServices}"
    configmaps: "${quota.maxConfigMaps}"
    secrets: "${quota.maxSecrets}"
`;
  }

  /**
   * Parse K8s ResourceQuota and apply to team
   */
  applyK8sResourceQuota(teamId: string, k8sQuota: K8sResourceQuota): void {
    const quota = this.teamQuotas.get(teamId);
    if (!quota) {
      throw new Error(`Team ${teamId} not found`);
    }

    // Parse K8s quota format and update team quota
    if (k8sQuota.spec?.hard) {
      const hard = k8sQuota.spec.hard;

      if (hard['limits.cpu']) {
        quota.cpuLimit = this.parseK8sQuantity(hard['limits.cpu']);
      }
      if (hard['limits.memory']) {
        quota.memoryLimit = this.parseK8sQuantity(hard['limits.memory']);
      }
      if (hard['requests.cpu']) {
        quota.cpuRequest = this.parseK8sQuantity(hard['requests.cpu']);
      }
      if (hard['requests.memory']) {
        quota.memoryRequest = this.parseK8sQuantity(hard['requests.memory']);
      }
      if (hard.pods) {
        quota.maxPods = parseInt(hard.pods, 10);
      }
      if (hard.services) {
        quota.maxServices = parseInt(hard.services, 10);
      }
      if (hard.configmaps) {
        quota.maxConfigMaps = parseInt(hard.configmaps, 10);
      }
      if (hard.secrets) {
        quota.maxSecrets = parseInt(hard.secrets, 10);
      }
    }

    this.teamQuotas.set(teamId, quota);

    this.emit('team:k8s_quota_applied', {
      teamId,
      k8sQuota,
      timestamp: new Date(),
    });
  }

  /**
   * Parse K8s quantity string to numeric value
   */
  private parseK8sQuantity(quantity: string): number {
    // Handle millicores (e.g., "1000m")
    if (quantity.endsWith('m')) {
      return parseInt(quantity.slice(0, -1), 10);
    }

    // Handle memory (e.g., "1Gi", "512Mi")
    if (quantity.endsWith('Gi')) {
      return parseInt(quantity.slice(0, -2), 10) * 1024;
    }
    if (quantity.endsWith('Mi')) {
      return parseInt(quantity.slice(0, -2), 10);
    }
    if (quantity.endsWith('Ki')) {
      return parseInt(quantity.slice(0, -2), 10) / 1024;
    }

    // Plain number (cores)
    return parseInt(quantity, 10) * 1000;
  }

  /**
   * Get team quota
   */
  getTeamQuota(teamId: string): TeamQuota | undefined {
    return this.teamQuotas.get(teamId);
  }

  /**
   * Get all team quotas
   */
  getAllTeamQuotas(): TeamQuota[] {
    return Array.from(this.teamQuotas.values());
  }

  /**
   * Get current resource usage
   */
  getResourceUsage(teamId: string): ResourceUsage | undefined {
    return this.resourceUsage.get(teamId);
  }

  /**
   * Get all resource usage
   */
  getAllResourceUsage(): ResourceUsage[] {
    return Array.from(this.resourceUsage.values());
  }

  /**
   * Get usage history
   */
  getUsageHistory(teamId: string, durationMs?: number): ResourceUsage[] {
    const history = this.usageHistory.get(teamId) || [];

    if (durationMs) {
      const cutoff = Date.now() - durationMs;
      return history.filter(h => h.timestamp.getTime() > cutoff);
    }

    return [...history];
  }

  /**
   * Get pending alerts
   */
  getAlerts(teamId?: string, acknowledged?: boolean): QuotaAlert[] {
    let alerts = this.alerts;

    if (teamId) {
      alerts = alerts.filter(a => a.teamId === teamId);
    }

    if (acknowledged !== undefined) {
      alerts = alerts.filter(a => a.acknowledged === acknowledged);
    }

    return [...alerts];
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (!alert) return false;

    alert.acknowledged = true;
    return true;
  }

  /**
   * Get team metrics
   */
  getTeamMetrics(teamId: string): TeamMetrics | undefined {
    const metrics = this.teamMetrics.get(teamId);
    if (!metrics) return undefined;

    // Calculate current utilization
    this.calculateUtilization(teamId);

    return { ...metrics };
  }

  /**
   * Get all team metrics
   */
  getAllTeamMetrics(): TeamMetrics[] {
    const metrics: TeamMetrics[] = [];

    for (const teamId of this.teamMetrics.keys()) {
      const metric = this.getTeamMetrics(teamId);
      if (metric) {
        metrics.push(metric);
      }
    }

    return metrics;
  }

  /**
   * Get scheduling queue status
   */
  getQueueStatus(): {
    pendingCount: number;
    averageWaitTimeMs: number;
    byTeam: Map<string, number>;
  } {
    const byTeam = new Map<string, number>();

    for (const request of this.schedulingQueue) {
      byTeam.set(request.teamId, (byTeam.get(request.teamId) || 0) + 1);
    }

    const waitTimes = this.schedulingQueue.map(r => Date.now() - r.createdAt.getTime());
    const avgWaitTime = waitTimes.length > 0
      ? waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length
      : 0;

    return {
      pendingCount: this.schedulingQueue.length,
      averageWaitTimeMs: avgWaitTime,
      byTeam,
    };
  }

  /**
   * Generate status report
   */
  generateStatusReport(): {
    timestamp: Date;
    teams: number;
    totalCPU: number;
    totalMemory: number;
    totalPods: number;
    avgUtilization: number;
    alerts: number;
    queue: { pendingCount: number; averageWaitTimeMs: number };
  } {
    let totalCPU = 0;
    let totalMemory = 0;
    let totalPods = 0;
    let avgUtilization = 0;

    for (const [teamId, usage] of this.resourceUsage) {
      const quota = this.teamQuotas.get(teamId);
      if (!quota) continue;

      totalCPU += usage.cpuUsed;
      totalMemory += usage.memoryUsed;
      totalPods += usage.podsUsed;

      const cpuUtil = (usage.cpuUsed / quota.cpuLimit) * 100;
      const memoryUtil = (usage.memoryUsed / quota.memoryLimit) * 100;
      avgUtilization += (cpuUtil + memoryUtil) / 2;
    }

    const teamCount = this.teamQuotas.size;
    if (teamCount > 0) {
      avgUtilization /= teamCount;
    }

    const queue = this.getQueueStatus();

    return {
      timestamp: new Date(),
      teams: teamCount,
      totalCPU,
      totalMemory,
      totalPods,
      avgUtilization,
      alerts: this.alerts.filter(a => !a.acknowledged).length,
      queue: {
        pendingCount: queue.pendingCount,
        averageWaitTimeMs: queue.averageWaitTimeMs,
      },
    };
  }

  /**
   * Configure fair share
   */
  configureFairShare(config: FairShareConfig): void {
    this.fairShareConfig = config;
    this.emit('config:fair_share', { config, timestamp: new Date() });
  }

  /**
   * Update system configuration
   */
  updateConfig(config: Partial<QuotaSystemConfig>): void {
    this.config = { ...this.config, ...config };
    this.emit('config:updated', { config: this.config, timestamp: new Date() });
  }

  /**
   * Shutdown the quota system
   */
  async shutdown(): Promise<void> {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    // Reject all pending requests
    for (const pending of this.pendingRequests) {
      pending.reject(new Error('Quota system shutting down'));
    }

    this.pendingRequests = [];
    this.schedulingQueue = [];

    this.removeAllListeners();
  }

  /**
   * Initialize team metrics
   */
  private initializeTeamMetrics(teamId: string): TeamMetrics {
    return {
      teamId,
      cpuUtilization: 0,
      memoryUtilization: 0,
      podUtilization: 0,
      totalRequests: 0,
      allowedRequests: 0,
      deniedRequests: 0,
      avgWaitTimeMs: 0,
      p95WaitTimeMs: 0,
    };
  }
}

/**
 * K8s ResourceQuota interface
 */
export interface K8sResourceQuota {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace: string;
  };
  spec?: {
    hard?: Record<string, string>;
  };
}

// Export singleton instance factory
export function createQuotaSystem(config?: Partial<QuotaSystemConfig>): QuotaSystem {
  return new QuotaSystem(config);
}

export default QuotaSystem;
