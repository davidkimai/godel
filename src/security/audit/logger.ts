/**
 * Audit Logger
 * 
 * Centralized audit logging system with multiple backends,
 * PII masking, and compliance features.
 */

import { EventEmitter } from 'events';
import { createHash, randomBytes } from 'crypto';
import type {
  AuditEvent,
  AuditEventCategory,
  AuditSeverity,
  AuditEventStatus,
  AnyAuditEvent,
} from './events';
import {
  getEventTypeDefinition,
  getEventSeverity,
  getEventCategory,
  requiresPIIMasking,
  getRetentionDays,
  ALL_CATEGORIES,
  ALL_SEVERITIES,
  ALL_STATUSES,
} from './events';

// Logger configuration
export interface AuditLoggerConfig {
  // Storage backends
  storage: {
    type: 'memory' | 'file' | 'database' | 'elasticsearch' | 'mixed';
    options?: Record<string, unknown>;
  };
  
  // Buffer settings
  bufferSize?: number;
  flushIntervalMs?: number;
  
  // PII handling
  maskPII?: boolean;
  piiFields?: string[];
  
  // Sampling
  sampleRate?: number; // 0-1
  
  // Retention
  defaultRetentionDays?: number;
  
  // Alerting
  alertThresholds?: {
    criticalEvents?: number;
    errorEvents?: number;
    suspiciousActivity?: number;
  };
}

// Storage backend interface
export interface AuditStorageBackend {
  write(event: AuditEvent): Promise<void>;
  query(filters: AuditQueryFilters): Promise<AuditEvent[]>;
  purge(before: Date): Promise<number>;
  close(): Promise<void>;
}

// Query filters
export interface AuditQueryFilters {
  categories?: AuditEventCategory[];
  types?: string[];
  severities?: AuditSeverity[];
  statuses?: AuditEventStatus[];
  actorIds?: string[];
  resourceTypes?: string[];
  resourceIds?: string[];
  startTime?: Date;
  endTime?: Date;
  limit?: number;
  offset?: number;
}

// Event builder
export class AuditEventBuilder {
  private event: Partial<AuditEvent> = {
    timestamp: new Date(),
    severity: 'info',
    status: 'success',
    actor: { id: 'system', type: 'system' },
    action: { name: 'unknown' },
    resource: { type: 'unknown' },
  };

  id(id: string): this {
    this.event.id = id;
    return this;
  }

  category(category: AuditEventCategory): this {
    this.event.category = category;
    return this;
  }

  type(type: string): this {
    this.event.type = type;
    
    // Auto-set category and severity from type definition
    const def = getEventTypeDefinition(type);
    if (def) {
      this.event.category = def.category;
      this.event.severity = def.severity;
    }
    
    return this;
  }

  severity(severity: AuditSeverity): this {
    this.event.severity = severity;
    return this;
  }

  status(status: AuditEventStatus): this {
    this.event.status = status;
    return this;
  }

  actor(id: string, type: AuditEvent['actor']['type'], details?: Partial<AuditEvent['actor']>): this {
    this.event.actor = { id, type, ...details };
    return this;
  }

  action(name: string, details?: Partial<AuditEvent['action']>): this {
    this.event.action = { name, ...details };
    return this;
  }

  resource(type: string, details?: Partial<AuditEvent['resource']>): this {
    this.event.resource = { type, ...details };
    return this;
  }

  context(context: AuditEvent['context']): this {
    this.event.context = context;
    return this;
  }

  result(success: boolean, details?: Partial<AuditEvent['result']>): this {
    this.event.result = { success, ...details };
    return this;
  }

  metadata(metadata: AuditEvent['metadata']): this {
    this.event.metadata = metadata;
    return this;
  }

  compliance(compliance: AuditEvent['compliance']): this {
    this.event.compliance = compliance;
    return this;
  }

  build(): AuditEvent {
    if (!this.event.id) {
      this.event.id = `evt_${Date.now()}_${randomBytes(4).toString('hex')}`;
    }

    if (!this.event.category && this.event.type) {
      this.event.category = getEventCategory(this.event.type);
    }

    if (!this.event.severity && this.event.type) {
      this.event.severity = getEventSeverity(this.event.type);
    }

    return this.event as AuditEvent;
  }
}

/**
 * Memory storage backend
 */
class MemoryStorageBackend implements AuditStorageBackend {
  private events: AuditEvent[] = [];
  private maxSize: number;

  constructor(maxSize: number = 10000) {
    this.maxSize = maxSize;
  }

  async write(event: AuditEvent): Promise<void> {
    this.events.push(event);
    
    // Trim if exceeds max size
    if (this.events.length > this.maxSize) {
      this.events = this.events.slice(-this.maxSize);
    }
  }

  async query(filters: AuditQueryFilters): Promise<AuditEvent[]> {
    let results = [...this.events];

    if (filters.categories) {
      results = results.filter(e => filters.categories!.includes(e.category));
    }

    if (filters.types) {
      results = results.filter(e => filters.types!.includes(e.type));
    }

    if (filters.severities) {
      results = results.filter(e => filters.severities!.includes(e.severity));
    }

    if (filters.statuses) {
      results = results.filter(e => filters.statuses!.includes(e.status));
    }

    if (filters.actorIds) {
      results = results.filter(e => filters.actorIds!.includes(e.actor.id));
    }

    if (filters.resourceTypes) {
      results = results.filter(e => filters.resourceTypes!.includes(e.resource.type));
    }

    if (filters.resourceIds) {
      results = results.filter(e => e.resource.id && filters.resourceIds!.includes(e.resource.id));
    }

    if (filters.startTime) {
      results = results.filter(e => e.timestamp >= filters.startTime!);
    }

    if (filters.endTime) {
      results = results.filter(e => e.timestamp <= filters.endTime!);
    }

    // Sort by timestamp descending
    results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Apply offset and limit
    const offset = filters.offset || 0;
    const limit = filters.limit || results.length;
    
    return results.slice(offset, offset + limit);
  }

  async purge(before: Date): Promise<number> {
    const originalLength = this.events.length;
    this.events = this.events.filter(e => e.timestamp >= before);
    return originalLength - this.events.length;
  }

  async close(): Promise<void> {
    this.events = [];
  }

  getStats(): { totalEvents: number; oldestEvent?: Date; newestEvent?: Date } {
    if (this.events.length === 0) {
      return { totalEvents: 0 };
    }

    const sorted = [...this.events].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    
    return {
      totalEvents: this.events.length,
      oldestEvent: sorted[0].timestamp,
      newestEvent: sorted[sorted.length - 1].timestamp,
    };
  }
}

/**
 * Audit Logger
 */
export class AuditLogger extends EventEmitter {
  private config: AuditLoggerConfig;
  private backend: AuditStorageBackend;
  private buffer: AuditEvent[] = [];
  private flushTimer?: NodeJS.Timeout;
  private piiFields: Set<string>;
  private eventCounts: Map<string, number> = new Map();
  private lastAlertTime: Map<string, number> = new Map();

  constructor(config: AuditLoggerConfig) {
    super();
    this.config = {
      bufferSize: 100,
      flushIntervalMs: 5000,
      maskPII: true,
      piiFields: ['email', 'phone', 'ssn', 'password', 'token', 'creditCard'],
      sampleRate: 1,
      defaultRetentionDays: 90,
      alertThresholds: {
        criticalEvents: 1,
        errorEvents: 10,
        suspiciousActivity: 5,
      },
      ...config,
    };

    this.piiFields = new Set(this.config.piiFields);

    // Initialize storage backend
    switch (this.config.storage.type) {
      case 'memory':
      default:
        this.backend = new MemoryStorageBackend();
        break;
    }

    // Start flush timer
    this.startFlushTimer();
  }

  /**
   * Log an audit event
   */
  async log(event: AuditEvent | AuditEventBuilder): Promise<void> {
    const auditEvent = event instanceof AuditEventBuilder ? event.build() : event;

    // Apply sampling
    if (Math.random() > (this.config.sampleRate || 1)) {
      return;
    }

    // Mask PII if enabled
    if (this.config.maskPII && requiresPIIMasking(auditEvent.type)) {
      this.maskPII(auditEvent);
    }

    // Add to buffer
    this.buffer.push(auditEvent);

    // Check thresholds for alerting
    this.checkAlertThresholds(auditEvent);

    // Flush if buffer is full
    if (this.buffer.length >= (this.config.bufferSize || 100)) {
      await this.flush();
    }

    this.emit('event:logged', auditEvent);
  }

  /**
   * Quick log with builder
   */
  async quickLog(
    type: string,
    actor: { id: string; type: AuditEvent['actor']['type'] },
    action: string,
    resource: { type: string; id?: string },
    success: boolean = true
  ): Promise<void> {
    const builder = new AuditEventBuilder()
      .type(type)
      .actor(actor.id, actor.type)
      .action(action)
      .resource(resource.type, resource.id ? { id: resource.id } : undefined)
      .result(success);

    await this.log(builder);
  }

  /**
   * Query audit events
   */
  async query(filters: AuditQueryFilters): Promise<AuditEvent[]> {
    // First flush buffer to ensure consistency
    await this.flush();
    return this.backend.query(filters);
  }

  /**
   * Get events by category
   */
  async getEventsByCategory(
    category: AuditEventCategory,
    limit: number = 100
  ): Promise<AuditEvent[]> {
    return this.query({ categories: [category], limit });
  }

  /**
   * Get events by actor
   */
  async getEventsByActor(
    actorId: string,
    limit: number = 100
  ): Promise<AuditEvent[]> {
    return this.query({ actorIds: [actorId], limit });
  }

  /**
   * Get events by resource
   */
  async getEventsByResource(
    resourceType: string,
    resourceId?: string,
    limit: number = 100
  ): Promise<AuditEvent[]> {
    return this.query({
      resourceTypes: [resourceType],
      resourceIds: resourceId ? [resourceId] : undefined,
      limit,
    });
  }

  /**
   * Get security events
   */
  async getSecurityEvents(
    minSeverity: AuditSeverity = 'warning',
    limit: number = 100
  ): Promise<AuditEvent[]> {
    const severities: AuditSeverity[] = ['warning', 'error', 'critical'];
    const minIndex = severities.indexOf(minSeverity);
    const filterSeverities = severities.slice(minIndex);

    return this.query({
      categories: ['security'],
      severities: filterSeverities,
      limit,
    });
  }

  /**
   * Export events to JSON
   */
  async exportEvents(filters: AuditQueryFilters): Promise<string> {
    const events = await this.query(filters);
    return JSON.stringify(events, null, 2);
  }

  /**
   * Purge old events
   */
  async purge(retentionDays?: number): Promise<number> {
    const days = retentionDays || this.config.defaultRetentionDays || 90;
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    // Flush buffer first
    await this.flush();
    
    const purged = await this.backend.purge(cutoffDate);
    this.emit('events:purged', { count: purged, before: cutoffDate });
    
    return purged;
  }

  /**
   * Get statistics
   */
  async getStats(): Promise<{
    bufferedEvents: number;
    totalEventsByCategory: Record<string, number>;
    totalEventsBySeverity: Record<string, number>;
    storageStats: Record<string, unknown>;
  }> {
    const events = [...this.buffer];
    
    const byCategory: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};

    for (const event of events) {
      byCategory[event.category] = (byCategory[event.category] || 0) + 1;
      bySeverity[event.severity] = (bySeverity[event.severity] || 0) + 1;
    }

    return {
      bufferedEvents: this.buffer.length,
      totalEventsByCategory: byCategory,
      totalEventsBySeverity: bySeverity,
      storageStats: (this.backend as MemoryStorageBackend).getStats?.() || {},
    };
  }

  /**
   * Create event builder
   */
  builder(): AuditEventBuilder {
    return new AuditEventBuilder();
  }

  /**
   * Flush buffer to storage
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) {
      return;
    }

    const eventsToFlush = [...this.buffer];
    this.buffer = [];

    try {
      for (const event of eventsToFlush) {
        await this.backend.write(event);
      }
      this.emit('buffer:flushed', { count: eventsToFlush.length });
    } catch (error) {
      // Restore events to buffer
      this.buffer.unshift(...eventsToFlush);
      this.emit('buffer:flush:error', { error, count: eventsToFlush.length });
      throw error;
    }
  }

  /**
   * Close logger
   */
  async close(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    await this.flush();
    await this.backend.close();
    this.removeAllListeners();
  }

  /**
   * Start flush timer
   */
  private startFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    this.flushTimer = setInterval(() => {
      this.flush().catch(err => {
        this.emit('timer:flush:error', err);
      });
    }, this.config.flushIntervalMs);
  }

  /**
   * Mask PII in event
   */
  private maskPII(event: AuditEvent): void {
    // Mask in actor
    if (event.actor.email) {
      event.actor.email = this.maskEmail(event.actor.email);
    }

    // Mask in metadata
    if (event.metadata) {
      event.metadata = this.deepMask(event.metadata);
    }

    // Mask in result
    if (event.result?.details) {
      event.result.details = this.deepMask(event.result.details);
    }
  }

  /**
   * Deep mask PII fields
   */
  private deepMask(obj: Record<string, unknown>): Record<string, unknown> {
    const masked: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (this.piiFields.has(key.toLowerCase())) {
        masked[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        masked[key] = this.deepMask(value as Record<string, unknown>);
      } else {
        masked[key] = value;
      }
    }

    return masked;
  }

  /**
   * Mask email address
   */
  private maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (!domain) return '[REDACTED]';
    
    const maskedLocal = local.charAt(0) + '***' + local.charAt(local.length - 1);
    return `${maskedLocal}@${domain}`;
  }

  /**
   * Check alert thresholds
   */
  private checkAlertThresholds(event: AuditEvent): void {
    const now = Date.now();
    const alertKey = `${event.category}:${event.severity}`;
    
    // Update counts
    const currentCount = (this.eventCounts.get(alertKey) || 0) + 1;
    this.eventCounts.set(alertKey, currentCount);

    // Check critical events
    if (event.severity === 'critical') {
      const lastAlert = this.lastAlertTime.get('critical') || 0;
      if (now - lastAlert > 60000) { // 1 minute cooldown
        this.lastAlertTime.set('critical', now);
        this.emit('alert:critical', { event, count: currentCount });
      }
    }

    // Check error events
    if (event.severity === 'error') {
      const errorCount = Array.from(this.eventCounts.entries())
        .filter(([k]) => k.endsWith(':error'))
        .reduce((sum, [, v]) => sum + v, 0);
      
      const threshold = this.config.alertThresholds?.errorEvents || 10;
      const lastAlert = this.lastAlertTime.get('error') || 0;
      
      if (errorCount >= threshold && now - lastAlert > 300000) { // 5 minute cooldown
        this.lastAlertTime.set('error', now);
        this.emit('alert:error', { count: errorCount });
      }
    }

    // Check security events
    if (event.category === 'security') {
      const securityCount = this.eventCounts.get('security:warning') || 0;
      const threshold = this.config.alertThresholds?.suspiciousActivity || 5;
      const lastAlert = this.lastAlertTime.get('security') || 0;
      
      if (securityCount >= threshold && now - lastAlert > 300000) {
        this.lastAlertTime.set('security', now);
        this.emit('alert:security', { count: securityCount });
      }
    }

    // Reset counts periodically
    if (now % 3600000 < 60000) { // Once per hour
      this.eventCounts.clear();
    }
  }
}

// Singleton instance
let auditLoggerInstance: AuditLogger | null = null;

export function getAuditLogger(config?: AuditLoggerConfig): AuditLogger {
  if (!auditLoggerInstance) {
    auditLoggerInstance = new AuditLogger(config || { storage: { type: 'memory' } });
  }
  return auditLoggerInstance;
}

// Factory function
export function createAuditLogger(config: AuditLoggerConfig): AuditLogger {
  return new AuditLogger(config);
}

// Note: AuditEventBuilder, types already exported above

export default AuditLogger;
