/**
 * Alert Manager - Central orchestration for alerting system
 * 
 * Combines rule-based alerting and anomaly detection into a unified
 * monitoring and notification system.
 */

import { AlertRuleEngine, AlertRule, AlertInstance, AlertSeverity } from './rules.js';
import { AnomalyDetectionService, AnomalyDetector, StatisticalAnomalyDetector, SeasonalAnomalyDetector } from './anomaly-detection.js';
import { TimeSeriesStorage, InMemoryTimeSeriesStorage } from './storage.js';
import type { EventBus } from '../event-bus.js';
import { createLogger } from '../../utils/logger.js';

/**
 * Module logger
 */
const log = createLogger('alert-manager');

/**
 * Alert manager configuration options
 */
export interface AlertManagerOptions {
  /** Evaluation interval in milliseconds (default: 30000) */
  evaluationInterval?: number;
  /** Anomaly detection interval in milliseconds (default: 300000) */
  anomalyInterval?: number;
  /** Time series storage implementation */
  storage?: TimeSeriesStorage;
  /** Enable/disable anomaly detection (default: true) */
  enableAnomalyDetection?: boolean;
}

/**
 * Alert statistics
 */
export interface AlertStats {
  /** Number of active alerts */
  activeAlertCount: number;
  /** Number of registered rules */
  ruleCount: number;
  /** Number of anomaly detectors */
  detectorCount: number;
  /** Total alerts fired since start */
  totalAlertsFired: number;
  /** Last evaluation timestamp */
  lastEvaluationAt?: number;
  /** Last anomaly detection timestamp */
  lastAnomalyCheckAt?: number;
  /** Is the manager running */
  isRunning: boolean;
}

/**
 * Alert Manager - Central alerting orchestration
 */
export class AlertManager {
  private engine: AlertRuleEngine;
  private anomalyService: AnomalyDetectionService;
  private storage: TimeSeriesStorage;
  private evaluationInterval: NodeJS.Timeout | null = null;
  private anomalyInterval: NodeJS.Timeout | null = null;
  private options: Required<AlertManagerOptions>;
  private stats: AlertStats;
  private totalAlertsFired = 0;

  constructor(
    eventBus: EventBus,
    options: AlertManagerOptions = {}
  ) {
    this.options = {
      evaluationInterval: 30000, // 30 seconds
      anomalyInterval: 300000,   // 5 minutes
      storage: new InMemoryTimeSeriesStorage(),
      enableAnomalyDetection: true,
      ...options
    };

    this.storage = this.options.storage;
    this.engine = new AlertRuleEngine(this.storage, eventBus);
    this.anomalyService = new AnomalyDetectionService(this.storage, eventBus);
    
    this.stats = {
      activeAlertCount: 0,
      ruleCount: 0,
      detectorCount: 0,
      totalAlertsFired: 0,
      isRunning: false
    };
  }

  /**
   * Start the alert manager
   * Begins periodic evaluation of rules and anomaly detection
   */
  start(): void {
    if (this.stats.isRunning) return;

    // Start rule evaluation
    this.evaluationInterval = setInterval(async () => {
      await this.tick();
    }, this.options.evaluationInterval);

    // Start anomaly detection if enabled
    if (this.options.enableAnomalyDetection) {
      this.anomalyInterval = setInterval(async () => {
        await this.runAnomalyDetection();
      }, this.options.anomalyInterval);
    }

    this.stats.isRunning = true;
    log.info('Started');
  }

  /**
   * Stop the alert manager
   */
  stop(): void {
    if (this.evaluationInterval) {
      clearInterval(this.evaluationInterval);
      this.evaluationInterval = null;
    }

    if (this.anomalyInterval) {
      clearInterval(this.anomalyInterval);
      this.anomalyInterval = null;
    }

    this.stats.isRunning = false;
    log.info('Stopped');
  }

  /**
   * Single evaluation tick
   */
  private async tick(): Promise<void> {
    try {
      const alerts = await this.engine.evaluateRules();
      this.stats.lastEvaluationAt = Date.now();
      
      if (alerts.length > 0) {
        this.totalAlertsFired += alerts.length;
        this.stats.totalAlertsFired = this.totalAlertsFired;
        log.info(`${alerts.length} alerts firing`, { 
          alerts: alerts.map(a => ({ id: a.id, name: a.ruleName, severity: a.severity }))
        });
      }

      this.updateStats();
    } catch (error) {
      log.logError('Evaluation error', error);
    }
  }

  /**
   * Run anomaly detection cycle
   */
  private async runAnomalyDetection(): Promise<void> {
    try {
      const anomalies = await this.anomalyService.runDetection();
      this.stats.lastAnomalyCheckAt = Date.now();
      
      if (anomalies.length > 0) {
        log.info(`${anomalies.length} anomalies detected`, { count: anomalies.length });
      }

      this.updateStats();
    } catch (error) {
      log.logError('Anomaly detection error', error);
    }
  }

  /**
   * Update internal statistics
   */
  private updateStats(): void {
    this.stats.activeAlertCount = this.engine.getActiveAlerts().length;
    this.stats.ruleCount = this.getRuleCount();
    this.stats.detectorCount = this.getDetectorCount();
  }

  /**
   * Add a new alert rule
   */
  addRule(rule: AlertRule): void {
    this.engine.addRule(rule);
    this.updateStats();
  }

  /**
   * Remove an alert rule
   */
  removeRule(ruleId: string): boolean {
    const result = this.engine.removeRule(ruleId);
    if (result) {
      this.updateStats();
    }
    return result;
  }

  /**
   * Get a rule by ID
   */
  getRule(ruleId: string): AlertRule | undefined {
    return this.engine.getRule(ruleId);
  }

  /**
   * Get all registered rules
   */
  getAllRules(): AlertRule[] {
    return this.engine.getAllRules();
  }

  /**
   * Get number of registered rules
   */
  getRuleCount(): number {
    return this.engine.getAllRules().length;
  }

  /**
   * Get active (firing) alerts
   */
  getActiveAlerts(): AlertInstance[] {
    return this.engine.getActiveAlerts();
  }

  /**
   * Get a specific active alert
   */
  getActiveAlert(alertId: string): AlertInstance | undefined {
    return this.engine.getActiveAlert(alertId);
  }

  /**
   * Clear all active alerts
   */
  clearActiveAlerts(): void {
    this.engine.clearActiveAlerts();
    this.updateStats();
  }

  /**
   * Add an anomaly detector for a metric pattern
   */
  addDetector(metricPattern: string, detector: AnomalyDetector): void {
    this.anomalyService.addDetector(metricPattern, detector);
    this.updateStats();
  }

  /**
   * Remove an anomaly detector
   */
  removeDetector(metricPattern: string): boolean {
    const result = this.anomalyService.removeDetector(metricPattern);
    if (result) {
      this.updateStats();
    }
    return result;
  }

  /**
   * Get number of registered anomaly detectors
   */
  getDetectorCount(): number {
    // Access private map through workaround
    const detectors = (this.anomalyService as unknown as { detectors: Map<string, unknown> }).detectors;
    return detectors?.size || 0;
  }

  /**
   * Record a metric value for alerting
   */
  async recordMetric(metric: string, value: number, labels?: Record<string, string>): Promise<void> {
    await this.storage.write(metric, value, labels);
  }

  /**
   * Get current alert statistics
   */
  getStats(): AlertStats {
    this.updateStats();
    return { ...this.stats };
  }

  /**
   * Get the time series storage
   */
  getStorage(): TimeSeriesStorage {
    return this.storage;
  }

  /**
   * Set up default alert rules for Godel
   */
  setupDefaultRules(): void {
    // High error rate
    this.addRule({
      id: 'high-error-rate',
      name: 'High Task Failure Rate',
      description: 'Alert when task failure rate exceeds 10%',
      enabled: true,
      severity: 'critical',
      metric: 'godel_task_failure_rate',
      operator: '>',
      threshold: 0.1,
      for: 300, // 5 minutes
      actions: [{ type: 'log', config: {} }],
      cooldown: 600 // 10 minutes
    });

    // Queue backup
    this.addRule({
      id: 'queue-backup',
      name: 'Task Queue Backup',
      description: 'Alert when queue depth exceeds 100',
      enabled: true,
      severity: 'warning',
      metric: 'godel_queue_depth',
      operator: '>',
      threshold: 100,
      for: 120, // 2 minutes
      actions: [{ type: 'log', config: {} }],
      cooldown: 300
    });

    // Agent health
    this.addRule({
      id: 'agents-unhealthy',
      name: 'Unhealthy Agents',
      description: 'Alert when >50% of agents are unhealthy',
      enabled: true,
      severity: 'emergency',
      metric: 'godel_agents_healthy_percent',
      operator: '<',
      threshold: 0.5,
      for: 60,
      actions: [
        { type: 'log', config: {} },
        { type: 'slack', config: { channel: '#alerts' } }
      ],
      cooldown: 300
    });

    // High latency
    this.addRule({
      id: 'high-latency',
      name: 'High Task Latency',
      description: 'Alert when p95 task duration exceeds 30s',
      enabled: true,
      severity: 'warning',
      metric: 'godel_task_duration_seconds_p95',
      operator: '>',
      threshold: 30,
      for: 300,
      actions: [{ type: 'log', config: {} }],
      cooldown: 600
    });

    // Memory usage
    this.addRule({
      id: 'high-memory',
      name: 'High Memory Usage',
      description: 'Alert when memory usage exceeds 80%',
      enabled: true,
      severity: 'critical',
      metric: 'godel_memory_usage_percent',
      operator: '>',
      threshold: 0.8,
      for: 180,
      actions: [{ type: 'log', config: {} }],
      cooldown: 300
    });

    // API error rate
    this.addRule({
      id: 'api-error-rate',
      name: 'High API Error Rate',
      description: 'Alert when API error rate exceeds 5%',
      enabled: true,
      severity: 'critical',
      metric: 'godel_api_error_rate',
      operator: '>',
      threshold: 0.05,
      for: 120,
      actions: [
        { type: 'log', config: {} },
        { type: 'webhook', config: { url: process.env['ALERT_WEBHOOK_URL'] || '' } }
      ],
      cooldown: 300
    });

    this.updateStats();
  }

  /**
   * Set up default anomaly detectors
   */
  setupDefaultDetectors(): void {
    // Statistical anomaly detection for task duration
    this.addDetector('godel_task_duration_seconds', new StatisticalAnomalyDetector(3, 50));
    
    // Seasonal detection for request rate (daily patterns)
    this.addDetector('godel_request_rate', new SeasonalAnomalyDetector('daily', 2.5));
    
    // Statistical detection for queue depth
    this.addDetector('godel_queue_depth', new StatisticalAnomalyDetector(2.5, 100));
    
    // Statistical detection for memory usage
    this.addDetector('godel_memory_usage_percent', new StatisticalAnomalyDetector(3, 100));
    
    this.updateStats();
  }

  /**
   * Initialize with default configuration
   */
  initializeDefaults(): void {
    this.setupDefaultRules();
    this.setupDefaultDetectors();
  }

  /**
   * Perform manual rule evaluation
   */
  async evaluateNow(): Promise<AlertInstance[]> {
    return this.engine.evaluateRules();
  }

  /**
   * Perform manual anomaly detection
   */
  async detectAnomaliesNow(): Promise<import('./anomaly-detection.js').AnomalyResult[]> {
    return this.anomalyService.runDetection();
  }
}
