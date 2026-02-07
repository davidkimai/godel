/**
 * Alert Rules Engine - Threshold-based alerting system
 * 
 * Provides rule-based alerting with multiple severity levels,
 * action types, and rate limiting.
 */

import type { EventBus } from '../event-bus.js';
import type { TimeSeriesStorage, TimeSeriesPoint } from './storage.js';
import { createLogger } from '../../utils/logger.js';

/**
 * Module logger
 */
const log = createLogger('alert-rules');

/**
 * Comparison operators for threshold evaluation
 */
export type ComparisonOperator = '>' | '<' | '>=' | '<=' | '==' | '!=';

/**
 * Alert severity levels
 */
export type AlertSeverity = 'warning' | 'critical' | 'emergency';

/**
 * Alert action types
 */
export type AlertActionType = 'log' | 'webhook' | 'slack' | 'email' | 'pagerduty';

/**
 * Alert action configuration
 */
export interface AlertAction {
  type: AlertActionType;
  config: Record<string, unknown>;
}

/**
 * Alert rule definition
 */
export interface AlertRule {
  /** Unique rule identifier */
  id: string;
  /** Human-readable rule name */
  name: string;
  /** Rule description */
  description: string;
  /** Whether the rule is enabled */
  enabled: boolean;
  /** Alert severity level */
  severity: AlertSeverity;
  
  // Condition
  /** Metric name to monitor */
  metric: string;
  /** Comparison operator */
  operator: ComparisonOperator;
  /** Threshold value */
  threshold: number;
  /** Duration condition must be true (seconds) */
  for: number;
  
  // Optional filters
  /** Label filters for the metric */
  labels?: Record<string, string>;
  
  // Actions
  /** Actions to execute when alert fires */
  actions: AlertAction[];
  
  // Rate limiting
  /** Seconds between alerts (cooldown period) */
  cooldown: number;
}

/**
 * Alert instance represents a firing or resolved alert
 */
export interface AlertInstance {
  /** Unique alert instance ID */
  id: string;
  /** Rule ID that created this alert */
  ruleId: string;
  /** Rule name */
  ruleName: string;
  /** Alert severity */
  severity: AlertSeverity;
  /** Current alert status */
  status: 'pending' | 'firing' | 'resolved';
  /** When the alert condition started */
  startedAt: number;
  /** When the alert started firing */
  firedAt?: number;
  /** When the alert was resolved */
  resolvedAt?: number;
  /** Current metric value */
  value: number;
  /** Threshold that was breached */
  threshold: number;
  /** Human-readable alert message */
  message: string;
  /** Labels associated with the alert */
  labels: Record<string, string>;
}

/**
 * Query options for time series data
 */
export interface TimeSeriesQuery {
  metric: string;
  start: number;
  end: number;
  labels?: Record<string, string>;
}

/**
 * In-memory time series storage implementation
 */
export class InMemoryTimeSeriesStorage implements TimeSeriesStorage {
  private data: Map<string, TimeSeriesPoint[]> = new Map();

  async query(query: TimeSeriesQuery): Promise<TimeSeriesPoint[]> {
    const key = this.getKey(query.metric, query.labels);
    const points = this.data.get(key) || [];
    
    return points.filter(p => p.timestamp >= query.start && p.timestamp <= query.end);
  }

  async write(metric: string, value: number, labels?: Record<string, string>, timestamp?: number): Promise<void> {
    const key = this.getKey(metric, labels);
    const points = this.data.get(key) || [];
    
    points.push({
      timestamp: timestamp ?? Date.now(),
      value,
      labels: labels || {}
    });
    
    // Keep only last 10000 points per metric
    if (points.length > 10000) {
      points.shift();
    }
    
    this.data.set(key, points);
  }

  private getKey(metric: string, labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) {
      return metric;
    }
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
    return `${metric}{${labelStr}}`;
  }

  clear(): void {
    this.data.clear();
  }
}

/**
 * Alert rule engine for evaluating alert conditions
 */
export class AlertRuleEngine {
  private rules: Map<string, AlertRule> = new Map();
  private activeAlerts: Map<string, AlertInstance> = new Map();
  private evaluationHistory: Map<string, number[]> = new Map();
  private lastAlertTime: Map<string, number> = new Map();

  constructor(
    private metricsStorage: TimeSeriesStorage,
    private eventBus: EventBus
  ) {}

  /**
   * Add a new alert rule
   */
  addRule(rule: AlertRule): void {
    this.rules.set(rule.id, rule);
    this.evaluationHistory.set(rule.id, []);
  }

  /**
   * Remove an alert rule
   * @returns true if the rule was removed
   */
  removeRule(ruleId: string): boolean {
    this.evaluationHistory.delete(ruleId);
    return this.rules.delete(ruleId);
  }

  /**
   * Get a rule by ID
   */
  getRule(ruleId: string): AlertRule | undefined {
    return this.rules.get(ruleId);
  }

  /**
   * Get all registered rules
   */
  getAllRules(): AlertRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Evaluate all enabled rules
   * @returns Array of newly triggered alerts
   */
  async evaluateRules(): Promise<AlertInstance[]> {
    const triggered: AlertInstance[] = [];

    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;

      try {
        const alert = await this.evaluateRule(rule);
        if (alert) {
          triggered.push(alert);
        }
      } catch (error) {
        log.logError('Error evaluating rule', error, { ruleId: rule.id });
      }
    }

    return triggered;
  }

  /**
   * Evaluate a single rule
   */
  private async evaluateRule(rule: AlertRule): Promise<AlertInstance | null> {
    // Query recent metric values
    const end = Date.now();
    // Use at least a 60 second lookback for querying data, even if 'for' is 0
    const lookback = Math.max(rule.for * 1000, 60000);
    const start = end - lookback;
    
    const points = await this.metricsStorage.query({
      metric: rule.metric,
      start,
      end,
      labels: rule.labels
    });



    if (points.length === 0) return null;

    // Check if condition is met
    const latest = points[points.length - 1];
    const conditionMet = this.compare(latest.value, rule.operator, rule.threshold);



    const alertId = `${rule.id}:${JSON.stringify(rule.labels || {})}`;
    const existingAlert = this.activeAlerts.get(alertId);

    if (conditionMet) {
      // Check if condition has been met for 'for' duration
      const history = this.evaluationHistory.get(rule.id) || [];
      const now = Date.now();
      history.push(now);
      
      // Keep only timestamps within the 'for' window
      // Use >= to include the current timestamp when for is 0
      const cutoff = now - (rule.for * 1000);
      const recentHistory = history.filter(t => t >= cutoff);
      this.evaluationHistory.set(rule.id, recentHistory);

      // For immediate alerts (for: 0), trigger on first detection
      // For delayed alerts, need at least 2 evaluations within the window
      const shouldTrigger = rule.for === 0 
        ? recentHistory.length >= 1 
        : recentHistory.length >= 2;

      if (shouldTrigger && !existingAlert) {
        // Condition has been true for 'for' duration
        return this.createAlert(rule, alertId, latest.value);
      }
      
      // Update existing alert with latest value
      if (existingAlert) {
        existingAlert.value = latest.value;
      }
    } else {
      // Condition not met - reset history
      this.evaluationHistory.set(rule.id, []);
      
      if (existingAlert) {
        // Resolve the alert
        this.resolveAlert(existingAlert);
      }
    }

    return null;
  }

  /**
   * Compare a value against a threshold using the given operator
   */
  private compare(value: number, operator: ComparisonOperator, threshold: number): boolean {
    switch (operator) {
      case '>': return value > threshold;
      case '<': return value < threshold;
      case '>=': return value >= threshold;
      case '<=': return value <= threshold;
      case '==': return value === threshold;
      case '!=': return value !== threshold;
      default: return false;
    }
  }

  /**
   * Create a new alert instance
   */
  private createAlert(rule: AlertRule, id: string, value: number): AlertInstance | null {
    // Check cooldown
    const lastAlert = this.lastAlertTime.get(rule.id);
    if (lastAlert && Date.now() - lastAlert < rule.cooldown * 1000) {
      return null; // In cooldown
    }

    const alert: AlertInstance = {
      id,
      ruleId: rule.id,
      ruleName: rule.name,
      severity: rule.severity,
      status: 'firing',
      startedAt: Date.now(),
      firedAt: Date.now(),
      value,
      threshold: rule.threshold,
      message: `${rule.name}: ${rule.metric} is ${value.toFixed(2)} (${rule.operator} ${rule.threshold})`,
      labels: rule.labels || {}
    };

    this.activeAlerts.set(id, alert);
    this.lastAlertTime.set(rule.id, Date.now());

    // Execute actions
    this.executeActions(rule, alert);

    // Publish event
    this.eventBus.publish('alert:firing', {
      alertId: alert.id,
      ruleId: alert.ruleId,
      ruleName: alert.ruleName,
      severity: alert.severity,
      value: alert.value,
      threshold: alert.threshold,
      message: alert.message,
      timestamp: alert.firedAt
    }, { priority: 'high', source: 'alert-engine' });

    return alert;
  }

  /**
   * Resolve an active alert
   */
  private resolveAlert(alert: AlertInstance): void {
    alert.status = 'resolved';
    alert.resolvedAt = Date.now();
    
    this.activeAlerts.delete(alert.id);
    
    // Publish resolved event
    this.eventBus.publish('alert:resolved', {
      alertId: alert.id,
      ruleId: alert.ruleId,
      ruleName: alert.ruleName,
      severity: alert.severity,
      resolvedAt: alert.resolvedAt
    }, { source: 'alert-engine' });
  }

  /**
   * Execute all actions for an alert
   */
  private async executeActions(rule: AlertRule, alert: AlertInstance): Promise<void> {
    for (const action of rule.actions) {
      try {
        await this.executeAction(action, alert);
      } catch (error) {
        log.logError('Action failed for alert', error, { alertId: alert.id });
      }
    }
  }

  /**
   * Execute a single action
   */
  private async executeAction(action: AlertAction, alert: AlertInstance): Promise<void> {
    switch (action.type) {
      case 'log':
        log.warn(`Alert triggered`, { 
          severity: alert.severity, 
          message: alert.message,
          alertId: alert.id 
        });
        break;
        
      case 'webhook':
        await this.sendWebhookNotification(action.config, alert);
        break;
        
      case 'slack':
        await this.sendSlackNotification(action.config, alert);
        break;
        
      case 'email':
        // Email sending implementation would go here
        log.info('Would send email alert', { 
          alertId: alert.id, 
          message: alert.message 
        });
        break;
        
      case 'pagerduty':
        await this.sendPagerDutyAlert(action.config, alert);
        break;
    }
  }

  /**
   * Send webhook notification
   */
  private async sendWebhookNotification(config: Record<string, unknown>, alert: AlertInstance): Promise<void> {
    const url = config['url'] as string;
    if (!url) {
      log.error('Webhook URL not configured');
      return;
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(config['headers'] as Record<string, string> || {})
        },
        body: JSON.stringify({
          alertId: alert.id,
          ruleId: alert.ruleId,
          ruleName: alert.ruleName,
          severity: alert.severity,
          status: alert.status,
          value: alert.value,
          threshold: alert.threshold,
          message: alert.message,
          timestamp: alert.firedAt,
          labels: alert.labels
        })
      });

      if (!response.ok) {
        log.error('Webhook request failed', { 
          status: response.status, 
          statusText: response.statusText 
        });
      }
    } catch (error) {
      log.logError('Webhook request error', error);
    }
  }

  /**
   * Send Slack notification
   */
  private async sendSlackNotification(config: Record<string, unknown>, alert: AlertInstance): Promise<void> {
    const webhookUrl = config['webhookUrl'] as string || config['url'] as string;
    const channel = config['channel'] as string;
    
    if (!webhookUrl) {
      log.error('Slack webhook URL not configured');
      return;
    }

    const color = alert.severity === 'emergency' ? 'danger' : 
                  alert.severity === 'critical' ? 'warning' : 'good';

    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel,
          attachments: [{
            color,
            title: `🚨 ${alert.ruleName}`,
            text: alert.message,
            fields: [
              { title: 'Severity', value: alert.severity.toUpperCase(), short: true },
              { title: 'Value', value: alert.value.toString(), short: true },
              { title: 'Threshold', value: alert.threshold.toString(), short: true },
              { title: 'Rule ID', value: alert.ruleId, short: true }
            ],
            footer: 'Godel Alert Manager',
            ts: Math.floor(alert.firedAt! / 1000)
          }]
        })
      });
    } catch (error) {
      log.logError('Slack notification failed', error);
    }
  }

  /**
   * Send PagerDuty alert
   */
  private async sendPagerDutyAlert(config: Record<string, unknown>, alert: AlertInstance): Promise<void> {
    const routingKey = config['routingKey'] as string || config['integrationKey'] as string;
    
    if (!routingKey) {
      log.error('PagerDuty routing key not configured');
      return;
    }

    const severityMap: Record<AlertSeverity, string> = {
      warning: 'warning',
      critical: 'error',
      emergency: 'critical'
    };

    try {
      await fetch('https://events.pagerduty.com/v2/enqueue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          routing_key: routingKey,
          event_action: 'trigger',
          dedup_key: alert.id,
          payload: {
            summary: alert.message,
            severity: severityMap[alert.severity],
            source: 'godel-alert-manager',
            custom_details: {
              ruleId: alert.ruleId,
              ruleName: alert.ruleName,
              value: alert.value,
              threshold: alert.threshold,
              labels: alert.labels
            }
          }
        })
      });
    } catch (error) {
      log.logError('PagerDuty alert failed', error);
    }
  }

  /**
   * Get all active (firing) alerts
   */
  getActiveAlerts(): AlertInstance[] {
    return Array.from(this.activeAlerts.values());
  }

  /**
   * Get a specific active alert by ID
   */
  getActiveAlert(alertId: string): AlertInstance | undefined {
    return this.activeAlerts.get(alertId);
  }

  /**
   * Clear all active alerts (useful for testing)
   */
  clearActiveAlerts(): void {
    this.activeAlerts.clear();
  }
}
