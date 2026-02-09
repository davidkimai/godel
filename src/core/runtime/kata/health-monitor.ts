/**
 * VM Health Monitor - Health monitoring and auto-restart for Kata Containers
 * 
 * Features:
 * - Pod status watching with continuous health checks
 * - Liveness and readiness probes
 * - VM health checks with configurable intervals
 * - Automatic restart with configurable policies
 * - Comprehensive metrics collection
 * - Event emission and alerting hooks
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

export interface HealthMonitorConfig {
  checkIntervalMs: number;
  livenessProbeIntervalMs: number;
  readinessProbeIntervalMs: number;
  failureThreshold: number;
  successThreshold: number;
  initialDelaySeconds: number;
  timeoutSeconds: number;
  restartPolicy: RestartPolicy;
  maxRestarts: number;
  restartBackoffMs: number;
  enableAutoRestart: boolean;
  alertingEnabled: boolean;
}

export type RestartPolicy = 'always' | 'on-failure' | 'never';
export type HealthStatus = 'healthy' | 'unhealthy' | 'degraded' | 'unknown' | 'restarting';
export type PodPhase = 'pending' | 'running' | 'succeeded' | 'failed' | 'unknown';
export type ProbeType = 'liveness' | 'readiness' | 'startup';

export interface ProbeConfig {
  type: ProbeType;
  httpGet?: HTTPGetAction;
  tcpSocket?: TCPSocketAction;
  exec?: ExecAction;
  initialDelaySeconds: number;
  timeoutSeconds: number;
  periodSeconds: number;
  successThreshold: number;
  failureThreshold: number;
}

export interface HTTPGetAction {
  path: string;
  port: number;
  host?: string;
  scheme?: 'http' | 'https';
  headers?: Record<string, string>;
}

export interface TCPSocketAction {
  port: number;
  host?: string;
}

export interface ExecAction {
  command: string[];
}

export interface ProbeResult {
  success: boolean;
  latencyMs: number;
  message?: string;
  timestamp: Date;
}

export interface VMHealthState {
  vmId: string;
  podName: string;
  namespace: string;
  phase: PodPhase;
  healthStatus: HealthStatus;
  lastProbeTime: Date;
  probeResults: Map<ProbeType, ProbeResult[]>;
  failureCount: number;
  successCount: number;
  restartCount: number;
  lastRestartTime?: Date;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
}

export interface HealthMetrics {
  totalVMs: number;
  healthyVMs: number;
  unhealthyVMs: number;
  degradedVMs: number;
  restartingVMs: number;
  avgHealthCheckLatencyMs: number;
  p95HealthCheckLatencyMs: number;
  p99HealthCheckLatencyMs: number;
  failureRate: number;
  totalRestarts: number;
  restartRatePerHour: number;
  probesExecuted: number;
  probeSuccessRate: number;
}

export interface RestartRecord {
  id: string;
  vmId: string;
  timestamp: Date;
  reason: string;
  previousState: HealthStatus;
  attempt: number;
  success: boolean;
  error?: string;
}

export interface AlertConfig {
  onHealthChange: boolean;
  onFailureThreshold: boolean;
  onRestart: boolean;
  onDegraded: boolean;
  webhookUrl?: string;
  alertChannels: AlertChannel[];
}

export type AlertChannel = 'webhook' | 'email' | 'slack' | 'pagerduty';

export interface AlertEvent {
  id: string;
  timestamp: Date;
  severity: 'info' | 'warning' | 'critical';
  vmId: string;
  type: AlertType;
  message: string;
  details?: Record<string, any>;
}

export type AlertType = 
  | 'health_change'
  | 'failure_threshold_reached'
  | 'restart_attempt'
  | 'restart_success'
  | 'restart_failed'
  | 'degraded_detected'
  | 'max_restarts_exceeded';

export interface StatusReport {
  timestamp: Date;
  overallHealth: HealthStatus;
  vmStates: VMHealthState[];
  metrics: HealthMetrics;
  recentRestarts: RestartRecord[];
  recentAlerts: AlertEvent[];
}

const DEFAULT_CONFIG: HealthMonitorConfig = {
  checkIntervalMs: 30000, // 30 seconds
  livenessProbeIntervalMs: 10000, // 10 seconds
  readinessProbeIntervalMs: 5000, // 5 seconds
  failureThreshold: 3,
  successThreshold: 1,
  initialDelaySeconds: 10,
  timeoutSeconds: 5,
  restartPolicy: 'on-failure',
  maxRestarts: 5,
  restartBackoffMs: 1000,
  enableAutoRestart: true,
  alertingEnabled: true,
};

const DEFAULT_PROBE_CONFIGS: ProbeConfig[] = [
  {
    type: 'liveness',
    initialDelaySeconds: 10,
    timeoutSeconds: 5,
    periodSeconds: 10,
    successThreshold: 1,
    failureThreshold: 3,
  },
  {
    type: 'readiness',
    initialDelaySeconds: 5,
    timeoutSeconds: 5,
    periodSeconds: 5,
    successThreshold: 1,
    failureThreshold: 3,
  },
];

export class VMHealthMonitor extends EventEmitter {
  private vmStates: Map<string, VMHealthState> = new Map();
  private probeConfigs: Map<string, ProbeConfig[]> = new Map();
  private restartHistory: RestartRecord[] = [];
  private alertHistory: AlertEvent[] = [];
  private config: HealthMonitorConfig;
  private metrics: HealthMetrics;
  private healthCheckTimers: Map<string, ReturnType<typeof setInterval>> = new Map();
  private probeTimers: Map<string, Map<ProbeType, ReturnType<typeof setInterval>>> = new Map();
  private latencyHistory: number[] = [];
  private alertConfig: AlertConfig;
  private isShuttingDown = false;

  constructor(
    config: Partial<HealthMonitorConfig> = {},
    alertConfig?: Partial<AlertConfig>
  ) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.metrics = this.initializeMetrics();
    this.alertConfig = {
      onHealthChange: true,
      onFailureThreshold: true,
      onRestart: true,
      onDegraded: true,
      alertChannels: ['webhook'],
      ...alertConfig,
    };
  }

  private initializeMetrics(): HealthMetrics {
    return {
      totalVMs: 0,
      healthyVMs: 0,
      unhealthyVMs: 0,
      degradedVMs: 0,
      restartingVMs: 0,
      avgHealthCheckLatencyMs: 0,
      p95HealthCheckLatencyMs: 0,
      p99HealthCheckLatencyMs: 0,
      failureRate: 0,
      totalRestarts: 0,
      restartRatePerHour: 0,
      probesExecuted: 0,
      probeSuccessRate: 100,
    };
  }

  /**
   * Register a VM for health monitoring
   */
  async registerVM(
    vmId: string,
    podName: string,
    namespace: string = 'default',
    customProbeConfigs?: ProbeConfig[]
  ): Promise<void> {
    if (this.vmStates.has(vmId)) {
      throw new Error(`VM ${vmId} is already registered for health monitoring`);
    }

    const state: VMHealthState = {
      vmId,
      podName,
      namespace,
      phase: 'pending',
      healthStatus: 'unknown',
      lastProbeTime: new Date(),
      probeResults: new Map(),
      failureCount: 0,
      successCount: 0,
      restartCount: 0,
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
    };

    this.vmStates.set(vmId, state);
    this.probeConfigs.set(vmId, customProbeConfigs || DEFAULT_PROBE_CONFIGS);
    this.metrics.totalVMs++;

    this.emit('vm:registered', { vmId, podName, namespace, timestamp: new Date() });

    // Start health monitoring for this VM
    await this.startMonitoring(vmId);
  }

  /**
   * Unregister a VM from health monitoring
   */
  async unregisterVM(vmId: string): Promise<boolean> {
    const state = this.vmStates.get(vmId);
    if (!state) {
      return false;
    }

    await this.stopMonitoring(vmId);
    
    this.vmStates.delete(vmId);
    this.probeConfigs.delete(vmId);
    this.metrics.totalVMs--;

    this.emit('vm:unregistered', { vmId, timestamp: new Date() });
    return true;
  }

  /**
   * Start health monitoring for a VM
   */
  private async startMonitoring(vmId: string): Promise<void> {
    const state = this.vmStates.get(vmId);
    const probeConfigs = this.probeConfigs.get(vmId);
    
    if (!state || !probeConfigs) return;

    // Wait for initial delay before starting probes
    await this.delay(this.config.initialDelaySeconds * 1000);

    if (this.isShuttingDown) return;

    // Start probe timers for each probe type
    const probeTimers = new Map<ProbeType, ReturnType<typeof setInterval>>();
    
    for (const probeConfig of probeConfigs) {
      const timer = setInterval(async () => {
        await this.executeProbe(vmId, probeConfig);
      }, probeConfig.periodSeconds * 1000);
      
      probeTimers.set(probeConfig.type, timer);
    }

    this.probeTimers.set(vmId, probeTimers);

    // Start general health check timer
    const healthTimer = setInterval(async () => {
      await this.performHealthCheck(vmId);
    }, this.config.checkIntervalMs);

    this.healthCheckTimers.set(vmId, healthTimer);

    this.emit('monitoring:started', { vmId, timestamp: new Date() });
  }

  /**
   * Stop health monitoring for a VM
   */
  private async stopMonitoring(vmId: string): Promise<void> {
    // Clear health check timer
    const healthTimer = this.healthCheckTimers.get(vmId);
    if (healthTimer) {
      clearInterval(healthTimer);
      this.healthCheckTimers.delete(vmId);
    }

    // Clear probe timers
    const probeTimers = this.probeTimers.get(vmId);
    if (probeTimers) {
      for (const [_, timer] of probeTimers) {
        clearInterval(timer);
      }
      this.probeTimers.delete(vmId);
    }

    this.emit('monitoring:stopped', { vmId, timestamp: new Date() });
  }

  /**
   * Execute a specific probe against a VM
   */
  private async executeProbe(vmId: string, probeConfig: ProbeConfig): Promise<ProbeResult> {
    const startTime = performance.now();
    const state = this.vmStates.get(vmId);
    
    if (!state) {
      return {
        success: false,
        latencyMs: 0,
        message: 'VM not found',
        timestamp: new Date(),
      };
    }

    try {
      let success = false;
      let message = '';

      if (probeConfig.httpGet) {
        const result = await this.executeHTTPProbe(probeConfig.httpGet, probeConfig.timeoutSeconds);
        success = result.success;
        message = result.message;
      } else if (probeConfig.tcpSocket) {
        const result = await this.executeTCPProbe(probeConfig.tcpSocket, probeConfig.timeoutSeconds);
        success = result.success;
        message = result.message;
      } else if (probeConfig.exec) {
        const result = await this.executeExecProbe(probeConfig.exec, probeConfig.timeoutSeconds);
        success = result.success;
        message = result.message;
      } else {
        // Default health check - simulate VM socket check
        success = await this.checkVMSocket(vmId);
        message = success ? 'VM socket accessible' : 'VM socket not accessible';
      }

      const latencyMs = performance.now() - startTime;
      
      const result: ProbeResult = {
        success,
        latencyMs,
        message,
        timestamp: new Date(),
      };

      // Store probe result
      const existingResults = state.probeResults.get(probeConfig.type) || [];
      existingResults.push(result);
      
      // Keep only last 100 results per probe type
      if (existingResults.length > 100) {
        existingResults.shift();
      }
      
      state.probeResults.set(probeConfig.type, existingResults);

      // Update state based on probe result
      this.updateStateFromProbe(state, probeConfig.type, success, probeConfig);

      // Record latency
      this.recordLatency(latencyMs);
      this.metrics.probesExecuted++;

      this.emit('probe:executed', {
        vmId,
        probeType: probeConfig.type,
        success,
        latencyMs,
        timestamp: new Date(),
      });

      return result;
    } catch (error) {
      const latencyMs = performance.now() - startTime;
      const result: ProbeResult = {
        success: false,
        latencyMs,
        message: error instanceof Error ? error.message : 'Probe execution failed',
        timestamp: new Date(),
      };

      this.updateStateFromProbe(state, probeConfig.type, false, probeConfig);
      this.recordLatency(latencyMs);
      this.metrics.probesExecuted++;

      return result;
    }
  }

  /**
   * Execute HTTP probe
   */
  private async executeHTTPProbe(
    action: HTTPGetAction,
    timeoutSeconds: number
  ): Promise<{ success: boolean; message: string }> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ success: false, message: 'HTTP probe timeout' });
      }, timeoutSeconds * 1000);

      // Simulated HTTP probe
      // In production, this would make actual HTTP requests
      setImmediate(() => {
        clearTimeout(timeout);
        const success = Math.random() > 0.05; // 95% success rate for simulation
        resolve({
          success,
          message: success ? 'HTTP probe succeeded' : 'HTTP probe failed',
        });
      });
    });
  }

  /**
   * Execute TCP probe
   */
  private async executeTCPProbe(
    action: TCPSocketAction,
    timeoutSeconds: number
  ): Promise<{ success: boolean; message: string }> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ success: false, message: 'TCP probe timeout' });
      }, timeoutSeconds * 1000);

      // Simulated TCP probe
      setImmediate(() => {
        clearTimeout(timeout);
        const success = Math.random() > 0.05;
        resolve({
          success,
          message: success ? 'TCP probe succeeded' : 'TCP probe failed',
        });
      });
    });
  }

  /**
   * Execute exec probe
   */
  private async executeExecProbe(
    action: ExecAction,
    timeoutSeconds: number
  ): Promise<{ success: boolean; message: string }> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ success: false, message: 'Exec probe timeout' });
      }, timeoutSeconds * 1000);

      // Simulated exec probe
      setImmediate(() => {
        clearTimeout(timeout);
        const success = Math.random() > 0.05;
        resolve({
          success,
          message: success ? 'Exec probe succeeded' : 'Exec probe failed',
        });
      });
    });
  }

  /**
   * Check VM socket accessibility
   */
  private async checkVMSocket(vmId: string): Promise<boolean> {
    // Simulated socket check
    // In production, this would check if the VM socket file exists and is accessible
    return Math.random() > 0.02; // 98% success rate
  }

  /**
   * Update VM state based on probe result
   */
  private updateStateFromProbe(
    state: VMHealthState,
    probeType: ProbeType,
    success: boolean,
    probeConfig: ProbeConfig
  ): void {
    const previousStatus = state.healthStatus;

    if (success) {
      state.consecutiveSuccesses++;
      state.consecutiveFailures = 0;
      state.successCount++;

      if (state.consecutiveSuccesses >= probeConfig.successThreshold) {
        if (probeType === 'liveness' && state.healthStatus === 'unhealthy') {
          state.healthStatus = 'healthy';
          this.emitHealthChange(state, previousStatus);
        } else if (probeType === 'readiness' && state.healthStatus !== 'healthy') {
          state.healthStatus = 'healthy';
          this.emitHealthChange(state, previousStatus);
        }
      }
    } else {
      state.consecutiveFailures++;
      state.consecutiveSuccesses = 0;
      state.failureCount++;

      if (state.consecutiveFailures >= probeConfig.failureThreshold) {
        if (probeType === 'liveness') {
          state.healthStatus = 'unhealthy';
          this.emitHealthChange(state, previousStatus);
          
          // Trigger auto-restart if enabled
          if (this.config.enableAutoRestart && this.shouldRestart(state)) {
            this.scheduleRestart(state);
          }
        } else if (probeType === 'readiness' && state.healthStatus === 'healthy') {
          state.healthStatus = 'degraded';
          this.emitHealthChange(state, previousStatus);
          
          if (this.alertConfig.onDegraded) {
            this.sendAlert({
              id: uuidv4(),
              timestamp: new Date(),
              severity: 'warning',
              vmId: state.vmId,
              type: 'degraded_detected',
              message: `VM ${state.vmId} is in degraded state`,
              details: { consecutiveFailures: state.consecutiveFailures },
            });
          }
        }
      }
    }

    state.lastProbeTime = new Date();
  }

  /**
   * Perform general health check
   */
  private async performHealthCheck(vmId: string): Promise<void> {
    const state = this.vmStates.get(vmId);
    if (!state) return;

    const startTime = performance.now();
    
    // Update pod phase based on health status
    if (state.healthStatus === 'healthy') {
      state.phase = 'running';
    } else if (state.healthStatus === 'unhealthy') {
      state.phase = 'failed';
    } else if (state.healthStatus === 'restarting') {
      state.phase = 'pending';
    }

    const latencyMs = performance.now() - startTime;
    this.recordLatency(latencyMs);

    this.emit('health:check', {
      vmId,
      status: state.healthStatus,
      phase: state.phase,
      latencyMs,
      timestamp: new Date(),
    });
  }

  /**
   * Check if VM should be restarted based on policy
   */
  private shouldRestart(state: VMHealthState): boolean {
    if (!this.config.enableAutoRestart) {
      return false;
    }

    if (state.restartCount >= this.config.maxRestarts) {
      if (this.alertConfig.onFailureThreshold) {
        this.sendAlert({
          id: uuidv4(),
          timestamp: new Date(),
          severity: 'critical',
          vmId: state.vmId,
          type: 'max_restarts_exceeded',
          message: `VM ${state.vmId} has exceeded maximum restart limit (${this.config.maxRestarts})`,
          details: { restartCount: state.restartCount, maxRestarts: this.config.maxRestarts },
        });
      }
      return false;
    }

    switch (this.config.restartPolicy) {
      case 'always':
        return true;
      case 'on-failure':
        return state.healthStatus === 'unhealthy';
      case 'never':
        return false;
      default:
        return false;
    }
  }

  /**
   * Schedule a restart with backoff
   */
  private async scheduleRestart(state: VMHealthState): Promise<void> {
    const previousStatus = state.healthStatus;
    state.healthStatus = 'restarting';
    
    const restartRecord: RestartRecord = {
      id: uuidv4(),
      vmId: state.vmId,
      timestamp: new Date(),
      reason: `Health check failed - ${state.consecutiveFailures} consecutive failures`,
      previousState: previousStatus,
      attempt: state.restartCount + 1,
      success: false,
    };

    this.restartHistory.push(restartRecord);
    this.metrics.totalRestarts++;

    this.emit('restart:scheduled', {
      vmId: state.vmId,
      attempt: restartRecord.attempt,
      timestamp: new Date(),
    });

    if (this.alertConfig.onRestart) {
      this.sendAlert({
        id: uuidv4(),
        timestamp: new Date(),
        severity: 'warning',
        vmId: state.vmId,
        type: 'restart_attempt',
        message: `Restarting VM ${state.vmId} (attempt ${restartRecord.attempt}/${this.config.maxRestarts})`,
        details: { attempt: restartRecord.attempt, reason: restartRecord.reason },
      });
    }

    // Apply exponential backoff
    const backoffMs = this.config.restartBackoffMs * Math.pow(2, state.restartCount);
    await this.delay(Math.min(backoffMs, 300000)); // Max 5 minutes backoff

    if (this.isShuttingDown) return;

    try {
      await this.executeRestart(state, restartRecord);
    } catch (error) {
      restartRecord.success = false;
      restartRecord.error = error instanceof Error ? error.message : 'Unknown error';
      
      this.emit('restart:failed', {
        vmId: state.vmId,
        attempt: restartRecord.attempt,
        error: restartRecord.error,
        timestamp: new Date(),
      });

      if (this.alertConfig.onRestart) {
        this.sendAlert({
          id: uuidv4(),
          timestamp: new Date(),
          severity: 'critical',
          vmId: state.vmId,
          type: 'restart_failed',
          message: `VM ${state.vmId} restart failed: ${restartRecord.error}`,
          details: { attempt: restartRecord.attempt, error: restartRecord.error },
        });
      }
    }
  }

  /**
   * Execute the restart operation
   */
  private async executeRestart(state: VMHealthState, record: RestartRecord): Promise<void> {
    // Simulated restart operation
    // In production, this would:
    // 1. Stop the VM
    // 2. Clean up resources
    // 3. Start a new VM instance
    // 4. Verify the new instance is healthy
    
    await this.delay(2000); // Simulate restart time

    state.restartCount++;
    state.lastRestartTime = new Date();
    state.consecutiveFailures = 0;
    state.consecutiveSuccesses = 0;
    state.healthStatus = 'healthy';
    state.phase = 'running';
    
    record.success = true;

    this.emit('restart:success', {
      vmId: state.vmId,
      attempt: record.attempt,
      timestamp: new Date(),
    });

    if (this.alertConfig.onRestart) {
      this.sendAlert({
        id: uuidv4(),
        timestamp: new Date(),
        severity: 'info',
        vmId: state.vmId,
        type: 'restart_success',
        message: `VM ${state.vmId} restarted successfully (attempt ${record.attempt})`,
        details: { attempt: record.attempt },
      });
    }
  }

  /**
   * Emit health change event
   */
  private emitHealthChange(state: VMHealthState, previousStatus: HealthStatus): void {
    this.emit('health:change', {
      vmId: state.vmId,
      previousStatus,
      currentStatus: state.healthStatus,
      timestamp: new Date(),
    });

    if (this.alertConfig.onHealthChange) {
      this.sendAlert({
        id: uuidv4(),
        timestamp: new Date(),
        severity: state.healthStatus === 'unhealthy' ? 'critical' : 'info',
        vmId: state.vmId,
        type: 'health_change',
        message: `VM ${state.vmId} health changed from ${previousStatus} to ${state.healthStatus}`,
        details: { previousStatus, currentStatus: state.healthStatus },
      });
    }
  }

  /**
   * Send alert through configured channels
   */
  private async sendAlert(event: AlertEvent): Promise<void> {
    this.alertHistory.push(event);
    
    this.emit('alert', event);

    // Send to webhook if configured
    if (this.alertConfig.webhookUrl) {
      try {
        await this.sendWebhookAlert(event);
      } catch (error) {
        console.error('Failed to send webhook alert:', error);
      }
    }
  }

  /**
   * Send alert to webhook endpoint
   */
  private async sendWebhookAlert(event: AlertEvent): Promise<void> {
    if (!this.alertConfig.webhookUrl) return;

    // Simulated webhook call
    // In production, this would make actual HTTP POST request
    console.log(`[WEBHOOK] ${event.severity.toUpperCase()}: ${event.message}`);
  }

  /**
   * Record latency measurement
   */
  private recordLatency(latencyMs: number): void {
    this.latencyHistory.push(latencyMs);
    
    // Keep last 1000 measurements
    if (this.latencyHistory.length > 1000) {
      this.latencyHistory.shift();
    }

    this.updateLatencyMetrics();
  }

  /**
   * Update latency metrics
   */
  private updateLatencyMetrics(): void {
    if (this.latencyHistory.length === 0) return;

    const sorted = [...this.latencyHistory].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);

    this.metrics.avgHealthCheckLatencyMs = sum / sorted.length;
    this.metrics.p95HealthCheckLatencyMs = sorted[Math.floor(sorted.length * 0.95)] || 0;
    this.metrics.p99HealthCheckLatencyMs = sorted[Math.floor(sorted.length * 0.99)] || 0;
  }

  /**
   * Update health metrics
   */
  private updateHealthMetrics(): void {
    const states = Array.from(this.vmStates.values());
    
    this.metrics.healthyVMs = states.filter(s => s.healthStatus === 'healthy').length;
    this.metrics.unhealthyVMs = states.filter(s => s.healthStatus === 'unhealthy').length;
    this.metrics.degradedVMs = states.filter(s => s.healthStatus === 'degraded').length;
    this.metrics.restartingVMs = states.filter(s => s.healthStatus === 'restarting').length;

    const totalFailures = states.reduce((sum, s) => sum + s.failureCount, 0);
    const totalSuccesses = states.reduce((sum, s) => sum + s.successCount, 0);
    const totalChecks = totalFailures + totalSuccesses;

    this.metrics.failureRate = totalChecks > 0 ? (totalFailures / totalChecks) * 100 : 0;

    // Calculate restart rate per hour
    const oneHourAgo = Date.now() - 3600000;
    const recentRestarts = this.restartHistory.filter(r => r.timestamp.getTime() > oneHourAgo);
    this.metrics.restartRatePerHour = recentRestarts.length;

    // Calculate probe success rate
    const totalProbes = this.metrics.probesExecuted;
    if (totalProbes > 0) {
      let successfulProbes = 0;
      for (const state of states) {
        for (const results of state.probeResults.values()) {
          successfulProbes += results.filter(r => r.success).length;
        }
      }
      this.metrics.probeSuccessRate = (successfulProbes / totalProbes) * 100;
    }
  }

  /**
   * Get current metrics
   */
  getMetrics(): HealthMetrics {
    this.updateHealthMetrics();
    return { ...this.metrics };
  }

  /**
   * Get VM health state
   */
  getVMState(vmId: string): VMHealthState | undefined {
    return this.vmStates.get(vmId);
  }

  /**
   * Get all VM health states
   */
  getAllVMStates(): VMHealthState[] {
    return Array.from(this.vmStates.values());
  }

  /**
   * Get restart history
   */
  getRestartHistory(vmId?: string): RestartRecord[] {
    if (vmId) {
      return this.restartHistory.filter(r => r.vmId === vmId);
    }
    return [...this.restartHistory];
  }

  /**
   * Get alert history
   */
  getAlertHistory(vmId?: string): AlertEvent[] {
    if (vmId) {
      return this.alertHistory.filter(a => a.vmId === vmId);
    }
    return [...this.alertHistory];
  }

  /**
   * Generate status report
   */
  generateStatusReport(): StatusReport {
    this.updateHealthMetrics();
    
    return {
      timestamp: new Date(),
      overallHealth: this.calculateOverallHealth(),
      vmStates: this.getAllVMStates(),
      metrics: { ...this.metrics },
      recentRestarts: this.restartHistory.slice(-10),
      recentAlerts: this.alertHistory.slice(-10),
    };
  }

  /**
   * Calculate overall health status
   */
  private calculateOverallHealth(): HealthStatus {
    const states = Array.from(this.vmStates.values());
    
    if (states.length === 0) return 'unknown';
    
    const unhealthyCount = states.filter(s => s.healthStatus === 'unhealthy').length;
    const degradedCount = states.filter(s => s.healthStatus === 'degraded').length;
    
    if (unhealthyCount > 0) return 'unhealthy';
    if (degradedCount > 0) return 'degraded';
    
    return 'healthy';
  }

  /**
   * Manually trigger a health check
   */
  async manualHealthCheck(vmId: string): Promise<HealthStatus> {
    await this.performHealthCheck(vmId);
    return this.vmStates.get(vmId)?.healthStatus || 'unknown';
  }

  /**
   * Manually trigger a restart
   */
  async manualRestart(vmId: string): Promise<boolean> {
    const state = this.vmStates.get(vmId);
    if (!state) return false;

    const restartRecord: RestartRecord = {
      id: uuidv4(),
      vmId: state.vmId,
      timestamp: new Date(),
      reason: 'Manual restart triggered',
      previousState: state.healthStatus,
      attempt: state.restartCount + 1,
      success: false,
    };

    try {
      await this.executeRestart(state, restartRecord);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<HealthMonitorConfig>): void {
    this.config = { ...this.config, ...config };
    this.emit('config:updated', { config: this.config, timestamp: new Date() });
  }

  /**
   * Update alert configuration
   */
  updateAlertConfig(config: Partial<AlertConfig>): void {
    this.alertConfig = { ...this.alertConfig, ...config };
  }

  /**
   * Shutdown the health monitor
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;

    // Stop all monitoring
    const vmIds = Array.from(this.vmStates.keys());
    for (const vmId of vmIds) {
      await this.stopMonitoring(vmId);
    }

    // Clear all data
    this.vmStates.clear();
    this.probeConfigs.clear();
    this.restartHistory = [];
    this.alertHistory = [];
    this.latencyHistory = [];

    this.removeAllListeners();
  }

  /**
   * Async delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance factory
export function createHealthMonitor(
  config?: Partial<HealthMonitorConfig>,
  alertConfig?: Partial<AlertConfig>
): VMHealthMonitor {
  return new VMHealthMonitor(config, alertConfig);
}

export default VMHealthMonitor;
