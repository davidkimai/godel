import { EventEmitter } from 'events';

/**
 * Alert severity levels
 */
type AlertSeverity = 'critical' | 'warning' | 'info';

/**
 * Alert status
 */
type AlertStatus = 'firing' | 'resolved' | 'acknowledged';

/**
 * Alert rule configuration
 */
interface AlertRule {
  id: string;
  name: string;
  description: string;
  severity: AlertSeverity;
  condition: AlertCondition;
  duration: number; // Duration in seconds the condition must be true before firing
  labels: Record<string, string>;
  annotations: Record<string, string>;
  enabled: boolean;
}

/**
 * Alert condition interface
 */
interface AlertCondition {
  metric: string;
  operator: '>' | '<' | '>=' | '<=' | '==' | '!=';
  threshold: number;
  teamId?: string;
  runtimeId?: string;
}

/**
 * Alert instance
 */
interface Alert {
  id: string;
  ruleId: string;
  ruleName: string;
  severity: AlertSeverity;
  status: AlertStatus;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  value: number;
  startedAt: Date;
  resolvedAt?: Date;
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
  fingerprint: string; // Deduplication fingerprint
}

/**
 * Webhook configuration
 */
interface WebhookConfig {
  id: string;
  name: string;
  url: string;
  method: 'POST' | 'PUT';
  headers?: Record<string, string>;
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
  enabled: boolean;
}

/**
 * Alert routing configuration
 */
interface AlertRoute {
  id: string;
  name: string;
  matchLabels: Record<string, string>;
  matchSeverity?: AlertSeverity[];
  webhookIds: string[];
  enabled: boolean;
}

/**
 * Alert manager configuration
 */
interface AlertManagerConfig {
  evaluationIntervalMs?: number;
  alertRetentionHours?: number;
  deduplicationWindowMs?: number;
  maxAlertsPerRule?: number;
  throttleIntervalMs?: number;
  webhooks?: WebhookConfig[];
  routes?: AlertRoute[];
  rules?: AlertRule[];
}

/**
 * Metrics provider interface (for querying metrics)
 */
interface MetricsProvider {
  query(metric: string, labels?: Record<string, string>): Promise<number[]>;
}

/**
 * AlertManager - Comprehensive alerting system for Godel VM monitoring
 * 
 * Features:
 * - Configurable alert rules for health degradation and resource exhaustion
 * - Webhook integrations (Slack, PagerDuty)
 * - Alert deduplication and throttling
 * - Alert routing based on severity and labels
 */
export class AlertManager extends EventEmitter {
  private config: Required<AlertManagerConfig>;
  private rules: Map<string, AlertRule> = new Map();
  private activeAlerts: Map<string, Alert> = new Map();
  private alertHistory: Alert[] = [];
  private webhooks: Map<string, WebhookConfig> = new Map();
  private routes: Map<string, AlertRoute> = new Map();
  private evaluationTimer?: ReturnType<typeof setInterval>;
  private metricsProvider?: MetricsProvider;
  private lastAlertTime: Map<string, number> = new Map(); // For throttling

  constructor(config: AlertManagerConfig = {}) {
    super();
    
    this.config = {
      evaluationIntervalMs: config.evaluationIntervalMs ?? 30000,
      alertRetentionHours: config.alertRetentionHours ?? 720, // 30 days
      deduplicationWindowMs: config.deduplicationWindowMs ?? 300000, // 5 minutes
      maxAlertsPerRule: config.maxAlertsPerRule ?? 100,
      throttleIntervalMs: config.throttleIntervalMs ?? 300000, // 5 minutes
      webhooks: config.webhooks ?? [],
      routes: config.routes ?? [],
      rules: config.rules ?? [],
    };

    // Initialize default rules
    this.initializeDefaultRules();
    
    // Load configurations
    this.loadWebhooks();
    this.loadRoutes();
    this.loadRules();
  }

  /**
   * Initialize default alert rules
   */
  private initializeDefaultRules(): void {
    const defaultRules: AlertRule[] = [
      // Health degradation alerts
      {
        id: 'health-check-failed',
        name: 'VM Health Check Failed',
        description: 'VM has failed health checks multiple times',
        severity: 'critical',
        condition: {
          metric: 'godel_runtime_health_check_failures',
          operator: '>=',
          threshold: 3,
        },
        duration: 60,
        labels: { category: 'health' },
        annotations: {
          summary: 'VM {{ $labels.runtime_id }} health check failed',
          description: 'VM has failed {{ $value }} health checks in the last 5 minutes',
          runbook_url: 'https://docs.godel.io/runbooks/health-check-failed',
        },
        enabled: true,
      },
      {
        id: 'vm-crash-loop',
        name: 'VM Crash Loop Detected',
        description: 'VM is restarting frequently (crash loop)',
        severity: 'critical',
        condition: {
          metric: 'godel_runtime_restarts',
          operator: '>=',
          threshold: 5,
        },
        duration: 300,
        labels: { category: 'health' },
        annotations: {
          summary: 'VM {{ $labels.runtime_id }} is in crash loop',
          description: 'VM has restarted {{ $value }} times in the last 5 minutes',
          runbook_url: 'https://docs.godel.io/runbooks/crash-loop',
        },
        enabled: true,
      },

      // Resource exhaustion alerts
      {
        id: 'high-cpu-usage',
        name: 'High CPU Usage',
        description: 'VM CPU usage is above 90%',
        severity: 'warning',
        condition: {
          metric: 'godel_runtime_cpu_usage_percent',
          operator: '>',
          threshold: 90,
        },
        duration: 300,
        labels: { category: 'resources' },
        annotations: {
          summary: 'High CPU usage on VM {{ $labels.runtime_id }}',
          description: 'CPU usage is {{ $value }}% for more than 5 minutes',
        },
        enabled: true,
      },
      {
        id: 'critical-cpu-usage',
        name: 'Critical CPU Usage',
        description: 'VM CPU usage is above 95%',
        severity: 'critical',
        condition: {
          metric: 'godel_runtime_cpu_usage_percent',
          operator: '>',
          threshold: 95,
        },
        duration: 120,
        labels: { category: 'resources' },
        annotations: {
          summary: 'Critical CPU usage on VM {{ $labels.runtime_id }}',
          description: 'CPU usage is {{ $value }}% for more than 2 minutes',
        },
        enabled: true,
      },
      {
        id: 'high-memory-usage',
        name: 'High Memory Usage',
        description: 'VM memory usage is above 85%',
        severity: 'warning',
        condition: {
          metric: 'godel_runtime_memory_usage_percent',
          operator: '>',
          threshold: 85,
        },
        duration: 300,
        labels: { category: 'resources' },
        annotations: {
          summary: 'High memory usage on VM {{ $labels.runtime_id }}',
          description: 'Memory usage is {{ $value }}% for more than 5 minutes',
        },
        enabled: true,
      },
      {
        id: 'critical-memory-usage',
        name: 'Critical Memory Usage',
        description: 'VM memory usage is above 95%',
        severity: 'critical',
        condition: {
          metric: 'godel_runtime_memory_usage_percent',
          operator: '>',
          threshold: 95,
        },
        duration: 120,
        labels: { category: 'resources' },
        annotations: {
          summary: 'Critical memory usage on VM {{ $labels.runtime_id }}',
          description: 'Memory usage is {{ $value }}% for more than 2 minutes',
        },
        enabled: true,
      },
      {
        id: 'high-disk-usage',
        name: 'High Disk Usage',
        description: 'VM disk usage is above 85%',
        severity: 'warning',
        condition: {
          metric: 'godel_runtime_disk_usage_percent',
          operator: '>',
          threshold: 85,
        },
        duration: 600,
        labels: { category: 'resources' },
        annotations: {
          summary: 'High disk usage on VM {{ $labels.runtime_id }}',
          description: 'Disk usage is {{ $value }}% for more than 10 minutes',
        },
        enabled: true,
      },
      {
        id: 'critical-disk-usage',
        name: 'Critical Disk Usage',
        description: 'VM disk usage is above 90%',
        severity: 'critical',
        condition: {
          metric: 'godel_runtime_disk_usage_percent',
          operator: '>',
          threshold: 90,
        },
        duration: 300,
        labels: { category: 'resources' },
        annotations: {
          summary: 'Critical disk usage on VM {{ $labels.runtime_id }}',
          description: 'Disk usage is {{ $value }}% for more than 5 minutes',
        },
        enabled: true,
      },

      // Cost alerts
      {
        id: 'budget-80-percent',
        name: 'Budget 80% Consumed',
        description: 'Team has consumed 80% of their budget',
        severity: 'warning',
        condition: {
          metric: 'godel_budget_consumed_percent',
          operator: '>=',
          threshold: 80,
        },
        duration: 60,
        labels: { category: 'cost' },
        annotations: {
          summary: 'Team {{ $labels.team_id }} budget at 80%',
          description: 'Budget consumption is {{ $value }}%',
        },
        enabled: true,
      },
      {
        id: 'budget-exhausted',
        name: 'Budget Exhausted',
        description: 'Team has consumed 100% of their budget',
        severity: 'critical',
        condition: {
          metric: 'godel_budget_consumed_percent',
          operator: '>=',
          threshold: 100,
        },
        duration: 60,
        labels: { category: 'cost' },
        annotations: {
          summary: 'Team {{ $labels.team_id }} budget exhausted',
          description: 'Budget consumption is {{ $value }}%. New VMs will be blocked.',
        },
        enabled: true,
      },
    ];

    defaultRules.forEach((rule) => {
      this.rules.set(rule.id, rule);
    });
  }

  /**
   * Load webhooks from configuration
   */
  private loadWebhooks(): void {
    this.config.webhooks.forEach((webhook) => {
      this.webhooks.set(webhook.id, {
        ...webhook,
        timeout: webhook.timeout ?? 30000,
        retryAttempts: webhook.retryAttempts ?? 3,
        retryDelay: webhook.retryDelay ?? 1000,
      });
    });

    // Add default Slack webhook if not configured
    if (!this.webhooks.has('slack')) {
      this.webhooks.set('slack', {
        id: 'slack',
        name: 'Slack Notifications',
        url: process.env['SLACK_WEBHOOK_URL'] ?? 'https://hooks.slack.com/services/YOUR/WEBHOOK/URL',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000,
        retryAttempts: 3,
        retryDelay: 1000,
        enabled: false, // Disabled until configured
      });
    }

    // Add default PagerDuty webhook if not configured
    if (!this.webhooks.has('pagerduty')) {
      this.webhooks.set('pagerduty', {
        id: 'pagerduty',
        name: 'PagerDuty Integration',
        url: process.env['PAGERDUTY_INTEGRATION_KEY'] ?? 'https://events.pagerduty.com/v2/enqueue',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000,
        retryAttempts: 3,
        retryDelay: 1000,
        enabled: false, // Disabled until configured
      });
    }
  }

  /**
   * Load routes from configuration
   */
  private loadRoutes(): void {
    this.config.routes.forEach((route) => {
      this.routes.set(route.id, route);
    });

    // Add default routes if not configured
    if (!this.routes.has('critical')) {
      this.routes.set('critical', {
        id: 'critical',
        name: 'Critical Alerts',
        matchLabels: {},
        matchSeverity: ['critical'],
        webhookIds: ['slack', 'pagerduty'],
        enabled: true,
      });
    }

    if (!this.routes.has('warning')) {
      this.routes.set('warning', {
        id: 'warning',
        name: 'Warning Alerts',
        matchLabels: {},
        matchSeverity: ['warning'],
        webhookIds: ['slack'],
        enabled: true,
      });
    }
  }

  /**
   * Load custom rules from configuration
   */
  private loadRules(): void {
    this.config.rules.forEach((rule) => {
      this.rules.set(rule.id, rule);
    });
  }

  /**
   * Set the metrics provider for querying metric values
   */
  public setMetricsProvider(provider: MetricsProvider): void {
    this.metricsProvider = provider;
  }

  /**
   * Start the alert manager evaluation loop
   */
  public start(): void {
    if (this.evaluationTimer) {
      return;
    }

    this.evaluationTimer = setInterval(() => {
      this.evaluateRules();
    }, this.config.evaluationIntervalMs);

    console.log('[AlertManager] Started evaluation loop');
  }

  /**
   * Stop the alert manager
   */
  public stop(): void {
    if (this.evaluationTimer) {
      clearInterval(this.evaluationTimer);
      this.evaluationTimer = undefined;
    }
    console.log('[AlertManager] Stopped');
  }

  /**
   * Evaluate all alert rules
   */
  private async evaluateRules(): Promise<void> {
    if (!this.metricsProvider) {
      console.warn('[AlertManager] No metrics provider configured');
      return;
    }

    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;

      try {
        await this.evaluateRule(rule);
      } catch (error) {
        console.error(`[AlertManager] Error evaluating rule ${rule.id}:`, error);
      }
    }

    // Clean up old alerts
    this.cleanupOldAlerts();
  }

  /**
   * Evaluate a single alert rule
   */
  private async evaluateRule(rule: AlertRule): Promise<void> {
    const values = await this.metricsProvider.query(rule.condition.metric, {
      ...(rule.condition.teamId && { team_id: rule.condition.teamId }),
      ...(rule.condition.runtimeId && { runtime_id: rule.condition.runtimeId }),
    });

    for (const value of values) {
      const isFiring = this.checkCondition(rule.condition, value);
      const fingerprint = this.generateFingerprint(rule, value);
      const existingAlert = this.activeAlerts.get(fingerprint);

      if (isFiring && !existingAlert) {
        // New alert firing
        const alert = this.createAlert(rule, value, fingerprint);
        this.activeAlerts.set(fingerprint, alert);
        await this.sendAlert(alert);
        this.emit('alert:firing', alert);
      } else if (!isFiring && existingAlert) {
        // Alert resolved
        existingAlert.status = 'resolved';
        existingAlert.resolvedAt = new Date();
        this.activeAlerts.delete(fingerprint);
        this.alertHistory.push(existingAlert);
        await this.sendResolved(existingAlert);
        this.emit('alert:resolved', existingAlert);
      }
    }
  }

  /**
   * Check if a condition is met
   */
  private checkCondition(condition: AlertCondition, value: number): boolean {
    switch (condition.operator) {
      case '>':
        return value > condition.threshold;
      case '<':
        return value < condition.threshold;
      case '>=':
        return value >= condition.threshold;
      case '<=':
        return value <= condition.threshold;
      case '==':
        return value === condition.threshold;
      case '!=':
        return value !== condition.threshold;
      default:
        return false;
    }
  }

  /**
   * Generate a unique fingerprint for an alert
   */
  private generateFingerprint(rule: AlertRule, value: number): string {
    const data = `${rule.id}:${rule.condition.metric}:${value}`;
    return Buffer.from(data).toString('base64');
  }

  /**
   * Create a new alert instance
   */
  private createAlert(rule: AlertRule, value: number, fingerprint: string): Alert {
    return {
      id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ruleId: rule.id,
      ruleName: rule.name,
      severity: rule.severity,
      status: 'firing',
      labels: { ...rule.labels },
      annotations: { ...rule.annotations },
      value,
      startedAt: new Date(),
      fingerprint,
    };
  }

  /**
   * Send alert to configured webhooks
   */
  private async sendAlert(alert: Alert): Promise<void> {
    // Check throttling
    const lastSent = this.lastAlertTime.get(alert.ruleId);
    if (lastSent && Date.now() - lastSent < this.config.throttleIntervalMs) {
      console.log(`[AlertManager] Alert ${alert.ruleId} throttled`);
      return;
    }

    // Find matching routes
    const matchingRoutes = Array.from(this.routes.values()).filter((route) =>
      this.routeMatches(route, alert)
    );

    // Send to all matching webhooks
    for (const route of matchingRoutes) {
      for (const webhookId of route.webhookIds) {
        const webhook = this.webhooks.get(webhookId);
        if (webhook?.enabled) {
          await this.sendWebhook(webhook, alert);
        }
      }
    }

    this.lastAlertTime.set(alert.ruleId, Date.now());
  }

  /**
   * Check if a route matches an alert
   */
  private routeMatches(route: AlertRoute, alert: Alert): boolean {
    if (!route.enabled) return false;

    // Check severity match
    if (route.matchSeverity && !route.matchSeverity.includes(alert.severity)) {
      return false;
    }

    // Check label matches
    for (const [key, value] of Object.entries(route.matchLabels)) {
      if (alert.labels[key] !== value) {
        return false;
      }
    }

    return true;
  }

  /**
   * Send alert to a webhook
   */
  private async sendWebhook(webhook: WebhookConfig, alert: Alert): Promise<void> {
    const payload = this.formatWebhookPayload(webhook, alert);

    for (let attempt = 1; attempt <= (webhook.retryAttempts ?? 1); attempt++) {
      try {
        const response = await fetch(webhook.url, {
          method: webhook.method,
          headers: webhook.headers,
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(webhook.timeout ?? 30000),
        });

        if (response.ok) {
          console.log(`[AlertManager] Sent alert to ${webhook.name}`);
          return;
        }

        throw new Error(`HTTP ${response.status}`);
      } catch (error) {
        console.error(`[AlertManager] Webhook ${webhook.name} attempt ${attempt} failed:`, error);
        
        if (attempt < (webhook.retryAttempts ?? 1)) {
          await this.delay(webhook.retryDelay ?? 1000);
        }
      }
    }
  }

  /**
   * Format alert payload for different webhook types
   */
  private formatWebhookPayload(webhook: WebhookConfig, alert: Alert): Record<string, unknown> {
    if (webhook.id === 'slack') {
      return this.formatSlackPayload(alert);
    } else if (webhook.id === 'pagerduty') {
      return this.formatPagerDutyPayload(alert);
    }

    // Generic payload
    return {
      alert: {
        id: alert.id,
        rule: alert.ruleName,
        severity: alert.severity,
        status: alert.status,
        value: alert.value,
        startedAt: alert.startedAt,
        labels: alert.labels,
        annotations: alert.annotations,
      },
    };
  }

  /**
   * Format alert for Slack webhook
   */
  private formatSlackPayload(alert: Alert): Record<string, unknown> {
    const colorMap: Record<AlertSeverity, string> = {
      critical: '#FF0000',
      warning: '#FFA500',
      info: '#00FF00',
    };

    return {
      attachments: [
        {
          color: colorMap[alert.severity],
          title: `🚨 ${alert.ruleName}`,
          text: alert.annotations['description'] || alert.annotations['summary'],
          fields: [
            {
              title: 'Severity',
              value: alert.severity.toUpperCase(),
              short: true,
            },
            {
              title: 'Value',
              value: alert.value.toString(),
              short: true,
            },
            {
              title: 'Started',
              value: alert.startedAt.toISOString(),
              short: true,
            },
          ],
          footer: 'Godel AlertManager',
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    };
  }

  /**
   * Format alert for PagerDuty webhook
   */
  private formatPagerDutyPayload(alert: Alert): Record<string, unknown> {
    const severityMap: Record<AlertSeverity, string> = {
      critical: 'critical',
      warning: 'warning',
      info: 'info',
    };

    return {
      routing_key: process.env['PAGERDUTY_INTEGRATION_KEY'] ?? '',
      event_action: 'trigger',
      dedup_key: alert.fingerprint,
      payload: {
        summary: alert.annotations['summary'] || alert.ruleName,
        severity: severityMap[alert.severity],
        source: 'godel-alertmanager',
        component: alert.labels['category'] || 'unknown',
        custom_details: {
          rule: alert.ruleName,
          value: alert.value,
          labels: alert.labels,
          description: alert.annotations['description'],
        },
      },
    };
  }

  /**
   * Send resolved notification
   */
  private async sendResolved(alert: Alert): Promise<void> {
    // Similar to sendAlert but for resolved state
    console.log(`[AlertManager] Alert ${alert.id} resolved`);
  }

  /**
   * Cleanup old alerts from history
   */
  private cleanupOldAlerts(): void {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - this.config.alertRetentionHours);

    this.alertHistory = this.alertHistory.filter(
      (alert) => alert.startedAt > cutoff
    );
  }

  /**
   * Acknowledge an alert
   */
  public acknowledgeAlert(alertId: string, acknowledgedBy: string): boolean {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) return false;

    alert.status = 'acknowledged';
    alert.acknowledgedAt = new Date();
    alert.acknowledgedBy = acknowledgedBy;

    this.emit('alert:acknowledged', alert);
    return true;
  }

  /**
   * Silence an alert rule
   */
  public silenceRule(ruleId: string, durationMinutes: number): boolean {
    const rule = this.rules.get(ruleId);
    if (!rule) return false;

    rule.enabled = false;
    
    setTimeout(() => {
      rule.enabled = true;
      console.log(`[AlertManager] Rule ${ruleId} unsilenced`);
    }, durationMinutes * 60 * 1000);

    return true;
  }

  /**
   * Get active alerts
   */
  public getActiveAlerts(filters?: {
    severity?: AlertSeverity;
    ruleId?: string;
  }): Alert[] {
    let alerts = Array.from(this.activeAlerts.values());

    if (filters?.severity) {
      alerts = alerts.filter((a) => a.severity === filters.severity);
    }

    if (filters?.ruleId) {
      alerts = alerts.filter((a) => a.ruleId === filters.ruleId);
    }

    return alerts;
  }

  /**
   * Get alert history
   */
  public getAlertHistory(limit = 100): Alert[] {
    return this.alertHistory
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .slice(0, limit);
  }

  /**
   * Add or update an alert rule
   */
  public addRule(rule: AlertRule): void {
    this.rules.set(rule.id, rule);
  }

  /**
   * Remove an alert rule
   */
  public removeRule(ruleId: string): boolean {
    return this.rules.delete(ruleId);
  }

  /**
   * Add a webhook configuration
   */
  public addWebhook(webhook: WebhookConfig): void {
    this.webhooks.set(webhook.id, {
      ...webhook,
      timeout: webhook.timeout ?? 30000,
      retryAttempts: webhook.retryAttempts ?? 3,
      retryDelay: webhook.retryDelay ?? 1000,
    });
  }

  /**
   * Update alert manager configuration
   */
  public updateConfig(config: Partial<AlertManagerConfig>): void {
    Object.assign(this.config, config);
  }

  /**
   * Get current configuration
   */
  public getConfig(): AlertManagerConfig {
    return { ...this.config };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Export types
export type {
  AlertSeverity,
  AlertStatus,
  AlertRule,
  AlertCondition,
  Alert,
  WebhookConfig,
  AlertRoute,
  AlertManagerConfig,
  MetricsProvider,
};

// Default export
export default AlertManager;
