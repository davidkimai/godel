import { EventEmitter } from 'events';

export interface AlertRule {
  id: string;
  name: string;
  condition: AlertCondition;
  severity: 'critical' | 'warning' | 'info';
  channels: string[];
  enabled: boolean;
  cooldownMs: number;
  description?: string;
}

export interface AlertCondition {
  metric: string;
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte' | 'neq';
  threshold: number;
  duration?: number;
}

export interface Alert {
  id: string;
  ruleId: string;
  ruleName: string;
  severity: AlertRule['severity'];
  message: string;
  value: number;
  threshold: number;
  timestamp: Date;
  acknowledged: boolean;
  resolved: boolean;
}

export interface SlackWebhookConfig {
  type: 'slack';
  webhookUrl: string;
  channel?: string;
  username?: string;
  iconEmoji?: string;
}

export interface PagerDutyConfig {
  type: 'pagerduty';
  integrationKey: string;
  severity: 'critical' | 'error' | 'warning' | 'info';
}

export interface WebhookConfig {
  type: 'webhook';
  url: string;
  headers?: Record<string, string>;
  method?: 'POST' | 'PUT';
}

export type NotificationChannel = SlackWebhookConfig | PagerDutyConfig | WebhookConfig;

export interface AlertingConfig {
  channels: Map<string, NotificationChannel>;
  rules: AlertRule[];
  defaultCooldownMs?: number;
}

export class AlertingManager extends EventEmitter {
  private rules: Map<string, AlertRule> = new Map();
  private channels: Map<string, NotificationChannel> = new Map();
  private activeAlerts: Map<string, Alert> = new Map();
  private lastAlertTime: Map<string, Date> = new Map();
  private defaultCooldownMs: number;
  private metrics: Map<string, number> = new Map();
  private alertHistory: Alert[] = [];
  private maxHistorySize = 1000;

  constructor(config?: Partial<AlertingConfig>) {
    super();
    this.defaultCooldownMs = config?.defaultCooldownMs || 300000; // 5 minutes
    
    if (config?.channels) {
      for (const [id, channel] of config.channels) {
        this.channels.set(id, channel);
      }
    }
    
    if (config?.rules) {
      for (const rule of config.rules) {
        this.rules.set(rule.id, rule);
      }
    }

    this.registerDefaultRules();
  }

  private registerDefaultRules(): void {
    this.addRule({
      id: 'spawn-latency-critical',
      name: 'VM Spawn Latency Critical',
      description: 'VM spawn latency exceeds 100ms',
      condition: {
        metric: 'spawn_latency_ms',
        operator: 'gt',
        threshold: 100,
        duration: 60000, // 1 minute
      },
      severity: 'critical',
      channels: ['slack', 'pagerduty'],
      enabled: true,
      cooldownMs: 300000,
    });

    this.addRule({
      id: 'pool-low-availability',
      name: 'Pool Low Availability',
      description: 'Ready VM pool below minimum threshold',
      condition: {
        metric: 'pool_ready_vms',
        operator: 'lt',
        threshold: 5,
        duration: 120000, // 2 minutes
      },
      severity: 'warning',
      channels: ['slack'],
      enabled: true,
      cooldownMs: 600000,
    });

    this.addRule({
      id: 'snapshot-failure-rate',
      name: 'Snapshot Failure Rate High',
      description: 'Snapshot failure rate exceeds 10%',
      condition: {
        metric: 'snapshot_failure_rate',
        operator: 'gt',
        threshold: 0.1,
        duration: 300000, // 5 minutes
      },
      severity: 'warning',
      channels: ['slack'],
      enabled: true,
      cooldownMs: 900000,
    });

    this.addRule({
      id: 'memory-usage-critical',
      name: 'Memory Usage Critical',
      description: 'VM memory usage exceeds 90%',
      condition: {
        metric: 'vm_memory_usage_percent',
        operator: 'gt',
        threshold: 90,
        duration: 180000, // 3 minutes
      },
      severity: 'critical',
      channels: ['slack', 'pagerduty'],
      enabled: true,
      cooldownMs: 300000,
    });

    this.addRule({
      id: 'fork-operation-failures',
      name: 'Fork Operation Failures',
      description: 'Fork operation failure rate exceeds 5%',
      condition: {
        metric: 'fork_failure_rate',
        operator: 'gt',
        threshold: 0.05,
        duration: 180000, // 3 minutes
      },
      severity: 'warning',
      channels: ['slack'],
      enabled: true,
      cooldownMs: 600000,
    });
  }

  addRule(rule: AlertRule): void {
    this.rules.set(rule.id, rule);
    this.emit('rule:added', { rule });
  }

  removeRule(ruleId: string): boolean {
    const removed = this.rules.delete(ruleId);
    if (removed) {
      this.emit('rule:removed', { ruleId });
    }
    return removed;
  }

  addChannel(id: string, channel: NotificationChannel): void {
    this.channels.set(id, channel);
    this.emit('channel:added', { id, channel });
  }

  removeChannel(id: string): boolean {
    const removed = this.channels.delete(id);
    if (removed) {
      this.emit('channel:removed', { id });
    }
    return removed;
  }

  recordMetric(name: string, value: number): void {
    this.metrics.set(name, value);
    this.evaluateRules(name, value);
  }

  private evaluateRules(metricName: string, value: number): void {
    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;
      if (rule.condition.metric !== metricName) continue;

      const triggered = this.checkCondition(rule.condition, value);
      const alertId = `${rule.id}:${metricName}`;

      if (triggered) {
        const lastAlert = this.lastAlertTime.get(rule.id);
        const cooldown = rule.cooldownMs || this.defaultCooldownMs;

        if (!lastAlert || Date.now() - lastAlert.getTime() > cooldown) {
          this.triggerAlert(rule, value, alertId);
        }
      } else {
        this.resolveAlert(alertId);
      }
    }
  }

  private checkCondition(condition: AlertCondition, value: number): boolean {
    switch (condition.operator) {
      case 'gt': return value > condition.threshold;
      case 'lt': return value < condition.threshold;
      case 'eq': return value === condition.threshold;
      case 'gte': return value >= condition.threshold;
      case 'lte': return value <= condition.threshold;
      case 'neq': return value !== condition.threshold;
      default: return false;
    }
  }

  private async triggerAlert(rule: AlertRule, value: number, alertId: string): Promise<void> {
    const alert: Alert = {
      id: alertId,
      ruleId: rule.id,
      ruleName: rule.name,
      severity: rule.severity,
      message: `${rule.name}: ${rule.condition.metric} is ${value} (threshold: ${rule.condition.threshold})`,
      value,
      threshold: rule.condition.threshold,
      timestamp: new Date(),
      acknowledged: false,
      resolved: false,
    };

    this.activeAlerts.set(alertId, alert);
    this.lastAlertTime.set(rule.id, alert.timestamp);
    this.alertHistory.push(alert);

    // Trim history if needed
    if (this.alertHistory.length > this.maxHistorySize) {
      this.alertHistory = this.alertHistory.slice(-this.maxHistorySize);
    }

    this.emit('alert:triggered', { alert });

    // Send notifications
    for (const channelId of rule.channels) {
      await this.sendNotification(channelId, alert);
    }
  }

  private resolveAlert(alertId: string): void {
    const alert = this.activeAlerts.get(alertId);
    if (alert && !alert.resolved) {
      alert.resolved = true;
      this.activeAlerts.delete(alertId);
      this.emit('alert:resolved', { alert });
    }
  }

  private async sendNotification(channelId: string, alert: Alert): Promise<void> {
    const channel = this.channels.get(channelId);
    if (!channel) {
      console.warn(`Channel ${channelId} not found`);
      return;
    }

    try {
      switch (channel.type) {
        case 'slack':
          await this.sendSlackNotification(channel, alert);
          break;
        case 'pagerduty':
          await this.sendPagerDutyNotification(channel, alert);
          break;
        case 'webhook':
          await this.sendWebhookNotification(channel, alert);
          break;
      }
      this.emit('notification:sent', { channelId, alert });
    } catch (error) {
      console.error(`Failed to send notification to ${channelId}:`, error);
      this.emit('notification:failed', { channelId, alert, error });
    }
  }

  private async sendSlackNotification(config: SlackWebhookConfig, alert: Alert): Promise<void> {
    const colorMap = {
      critical: '#FF0000',
      warning: '#FFA500',
      info: '#00FF00',
    };

    const payload = {
      channel: config.channel,
      username: config.username || 'RLM Alerts',
      icon_emoji: config.iconEmoji || ':warning:',
      attachments: [{
        color: colorMap[alert.severity],
        title: alert.ruleName,
        text: alert.message,
        fields: [
          { title: 'Severity', value: alert.severity.toUpperCase(), short: true },
          { title: 'Value', value: String(alert.value), short: true },
          { title: 'Threshold', value: String(alert.threshold), short: true },
          { title: 'Time', value: alert.timestamp.toISOString(), short: true },
        ],
        footer: 'RLM Hypervisor',
        ts: Math.floor(alert.timestamp.getTime() / 1000),
      }],
    };

    const response = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Slack notification failed: ${response.statusText}`);
    }
  }

  private async sendPagerDutyNotification(config: PagerDutyConfig, alert: Alert): Promise<void> {
    const payload = {
      routing_key: config.integrationKey,
      event_action: alert.resolved ? 'resolve' : 'trigger',
      dedup_key: alert.id,
      payload: {
        summary: alert.message,
        severity: config.severity || alert.severity,
        source: 'rlm-hypervisor',
        custom_details: {
          rule_name: alert.ruleName,
          rule_id: alert.ruleId,
          value: alert.value,
          threshold: alert.threshold,
        },
      },
    };

    const response = await fetch('https://events.pagerduty.com/v2/enqueue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`PagerDuty notification failed: ${response.statusText}`);
    }
  }

  private async sendWebhookNotification(config: WebhookConfig, alert: Alert): Promise<void> {
    const payload = {
      id: alert.id,
      ruleId: alert.ruleId,
      ruleName: alert.ruleName,
      severity: alert.severity,
      message: alert.message,
      value: alert.value,
      threshold: alert.threshold,
      timestamp: alert.timestamp.toISOString(),
      resolved: alert.resolved,
    };

    const response = await fetch(config.url, {
      method: config.method || 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...config.headers,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Webhook notification failed: ${response.statusText}`);
    }
  }

  acknowledgeAlert(alertId: string): boolean {
    const alert = this.activeAlerts.get(alertId);
    if (alert) {
      alert.acknowledged = true;
      this.emit('alert:acknowledged', { alert });
      return true;
    }
    return false;
  }

  getActiveAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values());
  }

  getAlertHistory(limit = 100): Alert[] {
    return this.alertHistory.slice(-limit);
  }

  getRules(): AlertRule[] {
    return Array.from(this.rules.values());
  }

  getChannels(): Array<{ id: string; config: NotificationChannel }> {
    return Array.from(this.channels.entries()).map(([id, config]) => ({ id, config }));
  }

  enableRule(ruleId: string): boolean {
    const rule = this.rules.get(ruleId);
    if (rule) {
      rule.enabled = true;
      this.emit('rule:enabled', { ruleId });
      return true;
    }
    return false;
  }

  disableRule(ruleId: string): boolean {
    const rule = this.rules.get(ruleId);
    if (rule) {
      rule.enabled = false;
      this.emit('rule:disabled', { ruleId });
      return true;
    }
    return false;
  }

  getMetrics(): Map<string, number> {
    return new Map(this.metrics);
  }

  clearAlertHistory(): void {
    this.alertHistory = [];
    this.emit('history:cleared');
  }

  getStats(): {
    totalRules: number;
    activeAlerts: number;
    totalChannels: number;
    historySize: number;
  } {
    return {
      totalRules: this.rules.size,
      activeAlerts: this.activeAlerts.size,
      totalChannels: this.channels.size,
      historySize: this.alertHistory.length,
    };
  }
}

export function createAlertingManager(config?: Partial<AlertingConfig>): AlertingManager {
  return new AlertingManager(config);
}

export default AlertingManager;
