/**
 * Audit Event Types
 * 
 * Defines all audit event types and severity levels for comprehensive
 * security monitoring and compliance reporting.
 */

// Event categories
export type AuditEventCategory =
  | 'authentication'
  | 'authorization'
  | 'data_access'
  | 'data_modification'
  | 'system'
  | 'security'
  | 'compliance';

// Event severity levels
export type AuditSeverity = 'info' | 'warning' | 'error' | 'critical';

// Event status
export type AuditEventStatus = 'success' | 'failure' | 'attempt' | 'blocked';

// Base audit event
export interface AuditEvent {
  id: string;
  timestamp: Date;
  category: AuditEventCategory;
  type: string;
  severity: AuditSeverity;
  status: AuditEventStatus;
  
  // Actor information
  actor: {
    id: string;
    type: 'user' | 'service' | 'system' | 'agent';
    email?: string;
    ip?: string;
    userAgent?: string;
    sessionId?: string;
  };
  
  // Action details
  action: {
    name: string;
    description?: string;
    method?: string;
    path?: string;
  };
  
  // Resource information
  resource: {
    type: string;
    id?: string;
    name?: string;
    namespace?: string;
  };
  
  // Context
  context?: {
    requestId?: string;
    traceId?: string;
    correlationId?: string;
    organizationId?: string;
    teamId?: string;
  };
  
  // Result
  result?: {
    success: boolean;
    errorCode?: string;
    errorMessage?: string;
    details?: Record<string, unknown>;
  };
  
  // Metadata
  metadata?: {
    userAgent?: string;
    referrer?: string;
    duration?: number;
    changes?: Array<{
      field: string;
      oldValue?: unknown;
      newValue?: unknown;
    }>;
  };
  
  // Compliance
  compliance?: {
    regulation?: string[];
    retentionDays?: number;
    piiInvolved?: boolean;
    sensitiveData?: boolean;
  };
}

// Authentication events
export interface AuthAuditEvent extends AuditEvent {
  category: 'authentication';
  type: 
    | 'login'
    | 'logout'
    | 'login_failed'
    | 'token_refresh'
    | 'token_revoke'
    | 'password_change'
    | 'password_reset'
    | 'mfa_enabled'
    | 'mfa_disabled'
    | 'mfa_challenge'
    | 'session_created'
    | 'session_terminated'
    | 'impersonation_start'
    | 'impersonation_end';
}

// Authorization events
export interface AuthzAuditEvent extends AuditEvent {
  category: 'authorization';
  type:
    | 'access_granted'
    | 'access_denied'
    | 'permission_check'
    | 'role_assigned'
    | 'role_removed'
    | 'policy_violation';
}

// Data access events
export interface DataAccessAuditEvent extends AuditEvent {
  category: 'data_access';
  type:
    | 'read'
    | 'list'
    | 'search'
    | 'export'
    | 'download';
}

// Data modification events
export interface DataModificationAuditEvent extends AuditEvent {
  category: 'data_modification';
  type:
    | 'create'
    | 'update'
    | 'delete'
    | 'bulk_create'
    | 'bulk_update'
    | 'bulk_delete'
    | 'restore'
    | 'archive';
}

// System events
export interface SystemAuditEvent extends AuditEvent {
  category: 'system';
  type:
    | 'startup'
    | 'shutdown'
    | 'config_change'
    | 'backup_created'
    | 'backup_restored'
    | 'migration_applied'
    | 'migration_rolled_back'
    | 'service_health_check'
    | 'maintenance_mode'
    | 'scale_up'
    | 'scale_down';
}

// Security events
export interface SecurityAuditEvent extends AuditEvent {
  category: 'security';
  type:
    | 'suspicious_activity'
    | 'rate_limit_exceeded'
    | 'brute_force_attempt'
    | 'sql_injection_attempt'
    | 'xss_attempt'
    | 'csrf_attempt'
    | 'privilege_escalation_attempt'
    | 'data_exfiltration_attempt'
    | 'anomaly_detected'
    | 'threat_intelligence_match'
    | 'security_alert'
    | 'incident_created';
}

// Compliance events
export interface ComplianceAuditEvent extends AuditEvent {
  category: 'compliance';
  type:
    | 'retention_policy_applied'
    | 'data_retention_expired'
    | 'gdpr_deletion_request'
    | 'gdpr_export_request'
    | 'audit_log_export'
    | 'compliance_scan'
    | 'violation_detected';
}

// Union type for all events
export type AnyAuditEvent =
  | AuthAuditEvent
  | AuthzAuditEvent
  | DataAccessAuditEvent
  | DataModificationAuditEvent
  | SystemAuditEvent
  | SecurityAuditEvent
  | ComplianceAuditEvent;

// Event type definitions with metadata
export interface AuditEventTypeDefinition {
  type: string;
  category: AuditEventCategory;
  severity: AuditSeverity;
  description: string;
  requiresPIIMasking: boolean;
  retentionDays: number;
}

// Event type registry
export const AUDIT_EVENT_TYPES: Record<string, AuditEventTypeDefinition> = {
  // Authentication
  'login': {
    type: 'login',
    category: 'authentication',
    severity: 'info',
    description: 'User login successful',
    requiresPIIMasking: false,
    retentionDays: 365,
  },
  'login_failed': {
    type: 'login_failed',
    category: 'authentication',
    severity: 'warning',
    description: 'User login failed',
    requiresPIIMasking: false,
    retentionDays: 365,
  },
  'logout': {
    type: 'logout',
    category: 'authentication',
    severity: 'info',
    description: 'User logout',
    requiresPIIMasking: false,
    retentionDays: 90,
  },
  'password_change': {
    type: 'password_change',
    category: 'authentication',
    severity: 'info',
    description: 'Password changed',
    requiresPIIMasking: true,
    retentionDays: 365,
  },
  'mfa_enabled': {
    type: 'mfa_enabled',
    category: 'authentication',
    severity: 'info',
    description: 'Multi-factor authentication enabled',
    requiresPIIMasking: false,
    retentionDays: 365,
  },
  
  // Authorization
  'access_granted': {
    type: 'access_granted',
    category: 'authorization',
    severity: 'info',
    description: 'Resource access granted',
    requiresPIIMasking: false,
    retentionDays: 90,
  },
  'access_denied': {
    type: 'access_denied',
    category: 'authorization',
    severity: 'warning',
    description: 'Resource access denied',
    requiresPIIMasking: false,
    retentionDays: 365,
  },
  'role_assigned': {
    type: 'role_assigned',
    category: 'authorization',
    severity: 'info',
    description: 'Role assigned to user',
    requiresPIIMasking: false,
    retentionDays: 365,
  },
  
  // Data Access
  'read': {
    type: 'read',
    category: 'data_access',
    severity: 'info',
    description: 'Data read operation',
    requiresPIIMasking: false,
    retentionDays: 90,
  },
  'export': {
    type: 'export',
    category: 'data_access',
    severity: 'info',
    description: 'Data export operation',
    requiresPIIMasking: false,
    retentionDays: 365,
  },
  
  // Data Modification
  'create': {
    type: 'create',
    category: 'data_modification',
    severity: 'info',
    description: 'Resource created',
    requiresPIIMasking: false,
    retentionDays: 365,
  },
  'update': {
    type: 'update',
    category: 'data_modification',
    severity: 'info',
    description: 'Resource updated',
    requiresPIIMasking: false,
    retentionDays: 365,
  },
  'delete': {
    type: 'delete',
    category: 'data_modification',
    severity: 'info',
    description: 'Resource deleted',
    requiresPIIMasking: false,
    retentionDays: 365,
  },
  
  // Security
  'suspicious_activity': {
    type: 'suspicious_activity',
    category: 'security',
    severity: 'warning',
    description: 'Suspicious activity detected',
    requiresPIIMasking: false,
    retentionDays: 730,
  },
  'brute_force_attempt': {
    type: 'brute_force_attempt',
    category: 'security',
    severity: 'error',
    description: 'Brute force attack detected',
    requiresPIIMasking: false,
    retentionDays: 730,
  },
  'privilege_escalation_attempt': {
    type: 'privilege_escalation_attempt',
    category: 'security',
    severity: 'critical',
    description: 'Privilege escalation attempt detected',
    requiresPIIMasking: false,
    retentionDays: 1095,
  },
  
  // System
  'config_change': {
    type: 'config_change',
    category: 'system',
    severity: 'info',
    description: 'Configuration changed',
    requiresPIIMasking: false,
    retentionDays: 365,
  },
  'startup': {
    type: 'startup',
    category: 'system',
    severity: 'info',
    description: 'System startup',
    requiresPIIMasking: false,
    retentionDays: 90,
  },
  
  // Compliance
  'gdpr_deletion_request': {
    type: 'gdpr_deletion_request',
    category: 'compliance',
    severity: 'info',
    description: 'GDPR data deletion request',
    requiresPIIMasking: false,
    retentionDays: 2555, // 7 years
  },
};

// Event severity colors for display
export const SEVERITY_COLORS: Record<AuditSeverity, string> = {
  info: '#3b82f6',
  warning: '#f59e0b',
  error: '#ef4444',
  critical: '#dc2626',
};

// Event severity icons
export const SEVERITY_ICONS: Record<AuditSeverity, string> = {
  info: 'ℹ️',
  warning: '⚠️',
  error: '❌',
  critical: '🚨',
};

// Helper functions
export function getEventTypeDefinition(type: string): AuditEventTypeDefinition | undefined {
  return AUDIT_EVENT_TYPES[type];
}

export function getEventSeverity(type: string): AuditSeverity {
  return AUDIT_EVENT_TYPES[type]?.severity || 'info';
}

export function getEventCategory(type: string): AuditEventCategory {
  return AUDIT_EVENT_TYPES[type]?.category || 'system';
}

export function requiresPIIMasking(type: string): boolean {
  return AUDIT_EVENT_TYPES[type]?.requiresPIIMasking || false;
}

export function getRetentionDays(type: string): number {
  return AUDIT_EVENT_TYPES[type]?.retentionDays || 90;
}

// Event type validators
export function isValidEventType(type: string): boolean {
  return type in AUDIT_EVENT_TYPES;
}

export function isValidCategory(category: string): category is AuditEventCategory {
  return ['authentication', 'authorization', 'data_access', 'data_modification', 'system', 'security', 'compliance'].includes(category);
}

export function isValidSeverity(severity: string): severity is AuditSeverity {
  return ['info', 'warning', 'error', 'critical'].includes(severity);
}

export function isValidStatus(status: string): status is AuditEventStatus {
  return ['success', 'failure', 'attempt', 'blocked'].includes(status);
}

// Event filtering helpers
export function filterEventsByCategory<T extends AuditEvent>(
  events: T[],
  category: AuditEventCategory
): T[] {
  return events.filter(e => e.category === category);
}

export function filterEventsBySeverity<T extends AuditEvent>(
  events: T[],
  minSeverity: AuditSeverity
): T[] {
  const severityOrder: AuditSeverity[] = ['info', 'warning', 'error', 'critical'];
  const minIndex = severityOrder.indexOf(minSeverity);
  
  return events.filter(e => severityOrder.indexOf(e.severity) >= minIndex);
}

export function filterEventsByTimeRange<T extends AuditEvent>(
  events: T[],
  startTime: Date,
  endTime: Date
): T[] {
  return events.filter(e => e.timestamp >= startTime && e.timestamp <= endTime);
}

export function filterEventsByActor<T extends AuditEvent>(
  events: T[],
  actorId: string
): T[] {
  return events.filter(e => e.actor.id === actorId);
}

export function filterEventsByResource<T extends AuditEvent>(
  events: T[],
  resourceType: string,
  resourceId?: string
): T[] {
  return events.filter(e => 
    e.resource.type === resourceType && 
    (resourceId === undefined || e.resource.id === resourceId)
  );
}

// Export all event types as array
export const ALL_EVENT_TYPES = Object.keys(AUDIT_EVENT_TYPES);

// Export categories
export const ALL_CATEGORIES: AuditEventCategory[] = [
  'authentication',
  'authorization',
  'data_access',
  'data_modification',
  'system',
  'security',
  'compliance',
];

// Export severities
export const ALL_SEVERITIES: AuditSeverity[] = ['info', 'warning', 'error', 'critical'];

// Export statuses
export const ALL_STATUSES: AuditEventStatus[] = ['success', 'failure', 'attempt', 'blocked'];
