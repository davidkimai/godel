/**
 * Agent 72: Security Hardening
 * Implements security best practices, input sanitization, least privilege
 * Provides security monitoring and alerting
 */

import { EventEmitter } from 'events';

export interface SecurityPolicy {
  policyId: string;
  name: string;
  category: 'authentication' | 'authorization' | 'input_validation' | 'audit' | 'network';
  rules: SecurityRule[];
  enabled: boolean;
  priority: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SecurityRule {
  ruleId: string;
  name: string;
  condition: (input: unknown) => boolean;
  action: 'allow' | 'deny' | 'sanitize' | 'log' | 'alert';
  actionConfig?: Record<string, unknown>;
  description: string;
}

export interface SanitizationConfig {
  enabled: boolean;
  removeHtml: boolean;
  escapeSql: boolean;
  normalizeUnicode: boolean;
  maxLength: number;
  allowedTags: string[];
  allowedAttributes: string[];
}

export interface PrivilegeLevel {
  level: 'anonymous' | 'user' | 'power_user' | 'admin' | 'super_admin';
  permissions: string[];
  rateLimits: {
    requestsPerMinute: number;
    requestsPerHour: number;
    maxAgents: number;
  };
  allowedActions: string[];
}

export interface SecurityEvent {
  eventId: string;
  timestamp: Date;
  severity: 'info' | 'warning' | 'error' | 'critical';
  category: 'authentication' | 'authorization' | 'input_validation' | 'suspicious_activity' | 'policy_violation';
  source: string;
  userId?: string;
  sessionId?: string;
  action: string;
  resource: string;
  result: 'success' | 'failure' | 'blocked';
  details: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export class SecurityHardening extends EventEmitter {
  private policies: Map<string, SecurityPolicy> = new Map();
  private sanitizationConfig: SanitizationConfig;
  private privilegeLevels: Map<string, PrivilegeLevel> = new Map();
  private securityEvents: SecurityEvent[] = [];
  private blockedPatterns: RegExp[] = [];
  private monitoringEnabled = true;

  private metrics = {
    totalEvents: 0,
    blockedRequests: 0,
    sanitizedInputs: 0,
    policyViolations: 0,
    activeAlerts: 0,
  };

  constructor() {
    super();
    
    // Default sanitization configuration
    this.sanitizationConfig = {
      enabled: true,
      removeHtml: true,
      escapeSql: true,
      normalizeUnicode: true,
      maxLength: 10000,
      allowedTags: [],
      allowedAttributes: [],
    };

    this.initializeDefaultPolicies();
    this.initializePrivilegeLevels();
    this.initializeBlockedPatterns();
  }

  /**
   * Initialize default security policies
   */
  private initializeDefaultPolicies(): void {
    // Authentication Policy
    this.addPolicy({
      policyId: 'auth-policy-001',
      name: 'Strong Authentication',
      category: 'authentication',
      enabled: true,
      priority: 1,
      rules: [
        {
          ruleId: 'auth-mfa-required',
          name: 'MFA Required for Admin',
          condition: (input: unknown) => {
            const ctx = input as { role: string; mfaEnabled: boolean };
            return ctx.role === 'admin' && !ctx.mfaEnabled;
          },
          action: 'deny',
          description: 'Administrators must have MFA enabled',
        },
        {
          ruleId: 'auth-session-timeout',
          name: 'Session Timeout Check',
          condition: (input: unknown) => {
            const ctx = input as { lastActivity: number; timeoutMinutes: number };
            return Date.now() - ctx.lastActivity > ctx.timeoutMinutes * 60 * 1000;
          },
          action: 'deny',
          description: 'Sessions expire after inactivity',
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Input Validation Policy
    this.addPolicy({
      policyId: 'input-policy-001',
      name: 'Input Sanitization',
      category: 'input_validation',
      enabled: true,
      priority: 2,
      rules: [
        {
          ruleId: 'input-length-check',
          name: 'Maximum Input Length',
          condition: (input: unknown) => {
            const str = String(input);
            return str.length > this.sanitizationConfig.maxLength;
          },
          action: 'deny',
          description: 'Reject inputs exceeding maximum length',
        },
        {
          ruleId: 'input-dangerous-chars',
          name: 'Dangerous Character Detection',
          condition: (input: unknown) => {
            const str = String(input);
            const dangerous = /[<>\"'\;\&\|\$\`\\]/;
            return dangerous.test(str);
          },
          action: 'sanitize',
          description: 'Sanitize dangerous characters',
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Authorization Policy
    this.addPolicy({
      policyId: 'authz-policy-001',
      name: 'Least Privilege Enforcement',
      category: 'authorization',
      enabled: true,
      priority: 1,
      rules: [
        {
          ruleId: 'authz-scope-check',
          name: 'Resource Scope Validation',
          condition: (input: unknown) => {
            const ctx = input as { userId: string; resourceOwner: string; isAdmin: boolean };
            return ctx.userId !== ctx.resourceOwner && !ctx.isAdmin;
          },
          action: 'deny',
          description: 'Users can only access their own resources',
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Audit Policy
    this.addPolicy({
      policyId: 'audit-policy-001',
      name: 'Comprehensive Audit Logging',
      category: 'audit',
      enabled: true,
      priority: 3,
      rules: [
        {
          ruleId: 'audit-sensitive-actions',
          name: 'Log Sensitive Actions',
          condition: (input: unknown) => {
            const ctx = input as { action: string };
            const sensitive = ['delete', 'modify', 'access_admin'];
            return sensitive.some(a => ctx.action.includes(a));
          },
          action: 'log',
          description: 'Log all sensitive operations',
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  /**
   * Initialize privilege levels
   */
  private initializePrivilegeLevels(): void {
    const levels: PrivilegeLevel[] = [
      {
        level: 'anonymous',
        permissions: ['read_public'],
        rateLimits: { requestsPerMinute: 10, requestsPerHour: 100, maxAgents: 0 },
        allowedActions: ['view_docs'],
      },
      {
        level: 'user',
        permissions: ['read_own', 'write_own', 'create_agent'],
        rateLimits: { requestsPerMinute: 60, requestsPerHour: 1000, maxAgents: 5 },
        allowedActions: ['create_agent', 'view_own_data', 'run_task'],
      },
      {
        level: 'power_user',
        permissions: ['read_own', 'write_own', 'create_agent', 'share_agent'],
        rateLimits: { requestsPerMinute: 120, requestsPerHour: 5000, maxAgents: 20 },
        allowedActions: ['create_agent', 'view_own_data', 'run_task', 'share_agent', 'use_api'],
      },
      {
        level: 'admin',
        permissions: ['read_all', 'write_all', 'manage_users', 'view_audit'],
        rateLimits: { requestsPerMinute: 300, requestsPerHour: 20000, maxAgents: 100 },
        allowedActions: ['create_agent', 'view_all_data', 'run_task', 'manage_users', 'view_audit', 'configure_system'],
      },
      {
        level: 'super_admin',
        permissions: ['*'],
        rateLimits: { requestsPerMinute: 600, requestsPerHour: 50000, maxAgents: 500 },
        allowedActions: ['*'],
      },
    ];

    for (const level of levels) {
      this.privilegeLevels.set(level.level, level);
    }
  }

  /**
   * Initialize blocked patterns for input validation
   */
  private initializeBlockedPatterns(): void {
    this.blockedPatterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,  // XSS
      /javascript:/gi,                                         // JavaScript injection
      /(SELECT|INSERT|UPDATE|DELETE|DROP)\s+/i,                // SQL injection
      /(eval\s*\(|exec\s*\(|system\s*\()/,                      // Code execution
      /\.\.+[\/\\]/,                                           // Path traversal
      /%00|\x00/,                                             // Null byte
    ];
  }

  /**
   * Add a security policy
   */
  addPolicy(policy: SecurityPolicy): void {
    this.policies.set(policy.policyId, policy);
    this.emit('policy:added', { policyId: policy.policyId, name: policy.name });
  }

  /**
   * Update a security policy
   */
  updatePolicy(policyId: string, updates: Partial<SecurityPolicy>): boolean {
    const policy = this.policies.get(policyId);
    if (!policy) return false;

    Object.assign(policy, updates, { updatedAt: new Date() });
    this.emit('policy:updated', { policyId, updates });
    return true;
  }

  /**
   * Remove a security policy
   */
  removePolicy(policyId: string): boolean {
    const deleted = this.policies.delete(policyId);
    if (deleted) {
      this.emit('policy:removed', { policyId });
    }
    return deleted;
  }

  /**
   * Sanitize user input
   */
  sanitizeInput(input: string): { sanitized: string; wasModified: boolean; violations: string[] } {
    const violations: string[] = [];
    let sanitized = input;
    let wasModified = false;

    if (!this.sanitizationConfig.enabled) {
      return { sanitized, wasModified, violations };
    }

    // Check blocked patterns
    for (const pattern of this.blockedPatterns) {
      if (pattern.test(sanitized)) {
        violations.push(`Blocked pattern matched: ${pattern.source}`);
        sanitized = sanitized.replace(pattern, '[BLOCKED]');
        wasModified = true;
      }
    }

    // Check length
    if (sanitized.length > this.sanitizationConfig.maxLength) {
      violations.push(`Input exceeded max length of ${this.sanitizationConfig.maxLength}`);
      sanitized = sanitized.substring(0, this.sanitizationConfig.maxLength);
      wasModified = true;
    }

    // Remove HTML if enabled
    if (this.sanitizationConfig.removeHtml) {
      const original = sanitized;
      sanitized = sanitized.replace(/<[^\u003e]*>/g, '');
      if (sanitized !== original) {
        violations.push('HTML tags removed');
        wasModified = true;
      }
    }

    // Escape SQL if enabled
    if (this.sanitizationConfig.escapeSql) {
      const original = sanitized;
      sanitized = sanitized
        .replace(/'/g, "''")
        .replace(/\\/g, '\\\\');
      if (sanitized !== original) {
        violations.push('SQL special characters escaped');
        wasModified = true;
      }
    }

    // Normalize Unicode if enabled
    if (this.sanitizationConfig.normalizeUnicode) {
      const original = sanitized;
      sanitized = sanitized.normalize('NFC');
      if (sanitized !== original) {
        violations.push('Unicode normalized');
        wasModified = true;
      }
    }

    if (wasModified) {
      this.metrics.sanitizedInputs++;
      this.logSecurityEvent({
        eventId: `sanitization-${Date.now()}`,
        timestamp: new Date(),
        severity: 'warning',
        category: 'input_validation',
        source: 'sanitization',
        action: 'sanitize_input',
        resource: 'input_data',
        result: 'success',
        details: { originalLength: input.length, violations },
      });
    }

    return { sanitized, wasModified, violations };
  }

  /**
   * Check if user has required privilege
   */
  checkPrivilege(userLevel: string, requiredPermission: string): boolean {
    const level = this.privilegeLevels.get(userLevel);
    if (!level) return false;

    if (level.permissions.includes('*')) return true;
    return level.permissions.includes(requiredPermission);
  }

  /**
   * Enforce least privilege for an action
   */
  enforceLeastPrivilege(userId: string, userLevel: string, action: string, resource: string): { allowed: boolean; reason?: string } {
    const level = this.privilegeLevels.get(userLevel);
    if (!level) {
      return { allowed: false, reason: 'Invalid privilege level' };
    }

    // Check if action is allowed
    if (!level.allowedActions.includes('*') && !level.allowedActions.includes(action)) {
      this.logSecurityEvent({
        eventId: `privilege-${Date.now()}`,
        timestamp: new Date(),
        severity: 'warning',
        category: 'authorization',
        source: 'least_privilege',
        userId,
        action,
        resource,
        result: 'blocked',
        details: { userLevel, reason: 'Action not allowed for privilege level' },
      });
      this.metrics.policyViolations++;
      return { allowed: false, reason: 'Action not permitted for your privilege level' };
    }

    return { allowed: true };
  }

  /**
   * Check rate limits
   */
  checkRateLimit(userLevel: string, requestCount: { perMinute: number; perHour: number }): { allowed: boolean; retryAfter?: number } {
    const level = this.privilegeLevels.get(userLevel);
    if (!level) return { allowed: false };

    if (requestCount.perMinute > level.rateLimits.requestsPerMinute) {
      return { allowed: false, retryAfter: 60 };
    }

    if (requestCount.perHour > level.rateLimits.requestsPerHour) {
      return { allowed: false, retryAfter: 3600 };
    }

    return { allowed: true };
  }

  /**
   * Evaluate all policies for an input
   */
  evaluatePolicies(input: unknown, context: { userId: string; action: string; resource: string }): { allowed: boolean; actions: string[]; violations: string[] } {
    const actions: string[] = [];
    const violations: string[] = [];
    let allowed = true;

    // Sort policies by priority
    const sortedPolicies = Array.from(this.policies.values())
      .filter(p => p.enabled)
      .sort((a, b) => a.priority - b.priority);

    for (const policy of sortedPolicies) {
      for (const rule of policy.rules) {
        try {
          if (rule.condition(input)) {
            switch (rule.action) {
              case 'deny':
                allowed = false;
                violations.push(`${policy.name}.${rule.name}: ${rule.description}`);
                this.metrics.blockedRequests++;
                break;
              case 'sanitize':
                actions.push('sanitize');
                break;
              case 'log':
                actions.push('log');
                this.logSecurityEvent({
                  eventId: `policy-${Date.now()}`,
                  timestamp: new Date(),
                  severity: 'info',
                  category: 'policy_violation',
                  source: policy.name,
                  userId: context.userId,
                  action: context.action,
                  resource: context.resource,
                  result: 'success',
                  details: { rule: rule.name },
                });
                break;
              case 'alert':
                actions.push('alert');
                this.emit('security:alert', {
                  policy: policy.name,
                  rule: rule.name,
                  context,
                });
                this.metrics.activeAlerts++;
                break;
            }
          }
        } catch (error) {
          // Log error but don't fail open
          violations.push(`Error evaluating rule ${rule.name}: ${error}`);
        }
      }
    }

    return { allowed, actions, violations };
  }

  /**
   * Log security event
   */
  logSecurityEvent(event: SecurityEvent): void {
    this.securityEvents.push(event);
    this.metrics.totalEvents++;

    // Trim old events (keep last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    this.securityEvents = this.securityEvents.filter(e => e.timestamp >= thirtyDaysAgo);

    this.emit('security:event', event);

    // Emit alerts for critical events
    if (event.severity === 'critical') {
      this.emit('security:critical', event);
    }
  }

  /**
   * Get security events with filtering
   */
  getSecurityEvents(filters?: {
    severity?: SecurityEvent['severity'];
    category?: SecurityEvent['category'];
    userId?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): SecurityEvent[] {
    let events = [...this.securityEvents];

    if (filters?.severity) {
      events = events.filter(e => e.severity === filters.severity);
    }
    if (filters?.category) {
      events = events.filter(e => e.category === filters.category);
    }
    if (filters?.userId) {
      events = events.filter(e => e.userId === filters.userId);
    }
    if (filters?.startDate) {
      events = events.filter(e => e.timestamp >= filters.startDate!);
    }
    if (filters?.endDate) {
      events = events.filter(e => e.timestamp <= filters.endDate!);
    }

    events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    if (filters?.limit) {
      events = events.slice(0, filters.limit);
    }

    return events;
  }

  /**
   * Get security metrics
   */
  getMetrics() {
    return { ...this.metrics };
  }

  /**
   * Get security summary
   */
  getSecuritySummary(): {
    policies: number;
    activeRules: number;
    events24h: number;
    criticalEvents: number;
    sanitizedInputs: number;
    blockedRequests: number;
  } {
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

    const events24h = this.securityEvents.filter(e => e.timestamp >= twentyFourHoursAgo);

    return {
      policies: this.policies.size,
      activeRules: Array.from(this.policies.values()).reduce((sum, p) => sum + p.rules.length, 0),
      events24h: events24h.length,
      criticalEvents: events24h.filter(e => e.severity === 'critical').length,
      sanitizedInputs: this.metrics.sanitizedInputs,
      blockedRequests: this.metrics.blockedRequests,
    };
  }

  /**
   * Enable/disable security monitoring
   */
  setMonitoring(enabled: boolean): void {
    this.monitoringEnabled = enabled;
    this.emit('monitoring:changed', { enabled });
  }

  /**
   * Export security configuration
   */
  exportConfiguration(): {
    policies: SecurityPolicy[];
    sanitizationConfig: SanitizationConfig;
    privilegeLevels: PrivilegeLevel[];
    blockedPatterns: string[];
    exportedAt: Date;
  } {
    return {
      policies: Array.from(this.policies.values()),
      sanitizationConfig: this.sanitizationConfig,
      privilegeLevels: Array.from(this.privilegeLevels.values()),
      blockedPatterns: this.blockedPatterns.map(p => p.source),
      exportedAt: new Date(),
    };
  }
}

export default SecurityHardening;
