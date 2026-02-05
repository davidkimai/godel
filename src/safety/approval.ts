import { logger } from '../utils/logger';
/**
 * Approval Workflow Module - SPEC_APPROVAL_WORKFLOW.md
 * 
 * Core approval types, request creation, response handling,
 * and risk assessment for human-in-loop approval workflows.
 */


// ============================================================================
// Type Definitions
// ============================================================================

export type ApprovalType = 'critical' | 'standard' | 'auto';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type ApprovalStatus = 'pending' | 'approved' | 'denied' | 'expired' | 'escalated';
export type OperationType = 'file_write' | 'file_delete' | 'api_call' | 'budget_overrun' | 'agent_termination';

export type DecisionType = 'approve' | 'deny' | 'escalate';

export interface ApproverIdentity {
  type: 'human' | 'agent' | 'webhook' | 'system';
  identity: string;
  displayName?: string;
  sessionId?: string;
  ipAddress?: string;
}

export interface RequestingAgent {
  agentId: string;
  agentLabel?: string;
  swarmId?: string;
  parentAgentId?: string;
  model?: string;
}

export interface OperationDetails {
  type: OperationType;
  target: string;
  details: Record<string, unknown>;
  estimatedCost?: number;
  estimatedTokens?: number;
  estimatedImpact?: string;
}

export interface ApprovalDecision {
  decision: DecisionType;
  decidedAt: Date;
  approver: ApproverIdentity;
  justification?: string;
  notes?: string;
  alternativeSuggestion?: string;
}

export interface TaskContext {
  taskId?: string;
  taskTitle?: string;
}

export interface ApprovalContext {
  previousOperations?: string[];
  relatedRequests?: string[];
  userConfig?: string;
}

export interface RiskAssessment {
  level: RiskLevel;
  classificationReason: string;
  affectedSystems?: string[];
  autoEscalate?: boolean;
}

export interface ApprovalRequest {
  id: string;
  requestId: string;
  createdAt: Date;
  expiresAt?: Date;
  
  requestingAgent: RequestingAgent;
  
  operation: OperationDetails;
  
  approvalType: ApprovalType;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  
  risk: RiskAssessment;
  
  task?: TaskContext;
  context?: ApprovalContext;
  
  status: ApprovalStatus;
  decision?: ApprovalDecision;
  
  escalationCount: number;
  maxEscalations: number;
}

export interface ApprovalConfig {
  timeout: {
    critical: number;    // minutes
    standard: number;    // minutes
    urgent: number;      // minutes
  };
  maxEscalations: {
    critical: number;
    standard: number;
    urgent: number;
  };
  autoContinueOnTimeout: boolean;
  requireJustification: boolean;
}

export interface ApprovalResponse {
  requestId: string;
  decision: DecisionType;
  approver: ApproverIdentity;
  justification: string;
  notes?: string;
  respondedAt: Date;
  effectiveAt: Date;
  expiresAt?: Date;
}

export interface BatchApprovalRequest {
  filter: {
    agentId?: string;
    operationType?: OperationType;
    riskLevel?: RiskLevel;
    status?: 'pending';
    pattern?: string;
  };
  count?: number;
}

export interface BatchApprovalResponse {
  approved: string[];
  denied: string[];
  skipped: string[];
  errors: Array<{ requestId: string; error: string }>;
}

export interface AuditLogEntry {
  id: string;
  requestId: string;
  createdAt: Date;
  respondedAt?: Date;
  completedAt?: Date;
  requestingAgent: RequestingAgent;
  operation: OperationDetails;
  risk: RiskAssessment;
  approver?: ApproverIdentity;
  decision?: ApprovalDecision;
  escalationHistory?: Array<{
    fromApprover: ApproverIdentity;
    toApprover: ApproverIdentity;
    reason: string;
    timestamp: Date;
  }>;
  execution?: {
    executedAt: Date;
    success: boolean;
    actualCost?: number;
    actualTokens?: number;
    error?: string;
  };
  metadata: {
    taskId?: string;
    taskTitle?: string;
    sessionId: string;
    correlationId?: string;
  };
}

// ============================================================================
// Configuration
// ============================================================================

export const DEFAULT_CONFIG: ApprovalConfig = {
  timeout: {
    critical: 5,      // 5 minutes for critical
    standard: 30,     // 30 minutes for standard
    urgent: 2         // 2 minutes for urgent
  },
  maxEscalations: {
    critical: 3,
    standard: 2,
    urgent: 2
  },
  autoContinueOnTimeout: false,
  requireJustification: true
};

let globalConfig: ApprovalConfig = { ...DEFAULT_CONFIG };

export function getConfig(): ApprovalConfig {
  return { ...globalConfig };
}

export function setConfig(config: Partial<ApprovalConfig>): void {
  globalConfig = { ...globalConfig, ...config };
  logger.debug('Approval config updated', { config: globalConfig });
}

// ============================================================================
// Risk Assessment
// ============================================================================

const FILE_WRITE_PATTERNS: Array<{ pattern: RegExp; risk: RiskLevel; reason: string }> = [
  { pattern: /.*\.prod\..*/, risk: 'high', reason: 'Production file modification' },
  { pattern: /prod[.\/]/, risk: 'high', reason: 'Production file modification' },
  { pattern: /^config\/.*$/, risk: 'medium', reason: 'Configuration file modification' },
  { pattern: /^src\/.*$/, risk: 'medium', reason: 'Source code modification' },
  { pattern: /^tests\/.*$/, risk: 'low', reason: 'Test file modification' },
  { pattern: /^docs\/.*$/, risk: 'low', reason: 'Documentation modification' }
];

const DELETE_PATTERNS: Array<{ pattern: RegExp; risk: RiskLevel; reason: string }> = [
  { pattern: /.*\.git.*/, risk: 'critical', reason: 'Git directory deletion' },
  { pattern: /^rm\s+-rf/, risk: 'critical', reason: 'Recursive delete operation' },
  { pattern: /.*node_modules\/.*/, risk: 'high', reason: 'Dependencies deletion' },
  { pattern: /.*dist\/.*/, risk: 'medium', reason: 'Build output deletion' }
];

const API_PATTERNS: Array<{ pattern: RegExp; risk: RiskLevel; reason: string }> = [
  { pattern: /.*(write|admin|delete|root).*/, risk: 'critical', reason: 'Sensitive API scope detected' },
  { pattern: /.*(POST|PUT|DELETE).*/, risk: 'medium', reason: 'Modifying API operation' },
  { pattern: /.*(GET|HEAD).*/, risk: 'low', reason: 'Read-only API operation' }
];

export function assessRisk(
  operationType: OperationType,
  target: string,
  details: Record<string, unknown> = {}
): RiskAssessment {
  switch (operationType) {
    case 'file_write':
      return assessFileWriteRisk(target);
    case 'file_delete':
      return assessDeleteRisk(target);
    case 'api_call':
      return assessApiRisk(target, details);
    case 'budget_overrun':
      return assessBudgetRisk(details);
    case 'agent_termination':
      return {
        level: 'critical',
        classificationReason: 'Agent termination requires human approval',
        autoEscalate: true
      };
    default:
      return {
        level: 'medium',
        classificationReason: 'Unknown operation type, defaulting to standard approval'
      };
  }
}

function assessFileWriteRisk(target: string): RiskAssessment {
  for (const { pattern, risk, reason } of FILE_WRITE_PATTERNS) {
    if (pattern.test(target)) {
      return { level: risk, classificationReason: reason };
    }
  }
  return { level: 'medium', classificationReason: 'File write operation' };
}

function assessDeleteRisk(target: string): RiskAssessment {
  for (const { pattern, risk, reason } of DELETE_PATTERNS) {
    if (pattern.test(target)) {
      return { level: risk, classificationReason: reason };
    }
  }
  return { level: 'high', classificationReason: 'Delete operation detected' };
}

function assessApiRisk(target: string, details: Record<string, unknown>): RiskAssessment {
  // Check for non-allowlisted domains (would need API in real implementation)
  if (details['allowlisted'] === false) {
    return {
      level: 'critical',
      classificationReason: 'Non-allowlisted API domain'
    };
  }
  
  // Check for sensitive scopes
  const scopes = details['scopes'] as string[] | undefined;
  if (scopes?.some(s => s.includes('write:admin') || s.includes('delete'))) {
    return {
      level: 'critical',
      classificationReason: 'Sensitive API scope detected'
    };
  }
  
  const method = (details['method'] as string)?.toUpperCase();
  for (const { pattern, risk, reason } of API_PATTERNS) {
    if (pattern.test(method || '')) {
      return { level: risk, classificationReason: reason };
    }
  }
  
  return { level: 'medium', classificationReason: 'External API call' };
}

function assessBudgetRisk(details: Record<string, unknown>): RiskAssessment {
  const exceededAmount = details['exceededAmount'] as number || 0;
  const budgetType = details['budgetType'] as string || 'unknown';
  
  if (exceededAmount > 100 || budgetType === 'daily' || budgetType === 'weekly') {
    return {
      level: 'critical',
      classificationReason: `Budget exceeded for ${budgetType}: $${exceededAmount}`
    };
  }
  
  if (exceededAmount > 10) {
    return {
      level: 'high',
      classificationReason: `Significant budget overrun: $${exceededAmount}`
    };
  }
  
  return {
    level: 'medium',
    classificationReason: `Budget warning: $${exceededAmount} over limit`
  };
}

export function getTimeoutForRisk(risk: RiskLevel, config: ApprovalConfig = globalConfig): number {
  switch (risk) {
    case 'critical':
      return config.timeout.critical;
    case 'high':
      return config.timeout.standard;
    case 'medium':
      return config.timeout.standard;
    case 'low':
      return 0; // Auto-approved
  }
}

export function getMaxEscalationsForRisk(risk: RiskLevel, config: ApprovalConfig = globalConfig): number {
  switch (risk) {
    case 'critical':
      return config.maxEscalations.critical;
    case 'high':
    case 'medium':
      return config.maxEscalations.standard;
    case 'low':
      return 0;
  }
}

// ============================================================================
// Request Creation
// ============================================================================

let requestCounter = 0;

function generateRequestId(): string {
  requestCounter++;
  return `apr_${Date.now()}_${requestCounter.toString(36)}`;
}

export function createApprovalRequest(params: {
  requestingAgent: RequestingAgent;
  operation: OperationDetails;
  task?: TaskContext;
  context?: ApprovalContext;
  overrideRisk?: RiskLevel;
}): ApprovalRequest {
  const risk = params.overrideRisk 
    ? { level: params.overrideRisk, classificationReason: 'Manual override' }
    : assessRisk(params.operation.type, params.operation.target, params.operation.details);
  
  const approvalType: ApprovalType = risk.level === 'low' ? 'auto' : 
    risk.level === 'critical' ? 'critical' : 'standard';
  
  const timeout = getTimeoutForRisk(risk.level);
  const expiresAt = timeout > 0 ? new Date(Date.now() + timeout * 60 * 1000) : undefined;
  
  return {
    id: generateRequestId(),
    requestId: generateRequestId(),
    createdAt: new Date(),
    expiresAt,
    
    requestingAgent: params.requestingAgent,
    
    operation: params.operation,
    
    approvalType,
    priority: risk.level === 'critical' ? 'urgent' : 
              risk.level === 'high' ? 'high' : 'medium',
    
    risk,
    
    task: params.task,
    context: params.context,
    
    status: approvalType === 'auto' ? 'approved' : 'pending',
    decision: approvalType === 'auto' ? {
      decision: 'approve',
      decidedAt: new Date(),
      approver: { type: 'system', identity: 'auto-approval' },
      justification: 'Auto-approved due to low risk'
    } : undefined,
    
    escalationCount: 0,
    maxEscalations: getMaxEscalationsForRisk(risk.level)
  };
}

// ============================================================================
// Response Handling
// ============================================================================

export function respondToRequest(
  request: ApprovalRequest,
  decision: DecisionType,
  approver: ApproverIdentity,
  justification: string,
  notes?: string
): ApprovalResponse {
  if (request.status !== 'pending') {
    throw new Error(`Cannot respond to request with status: ${request.status}`);
  }
  
  if (globalConfig.requireJustification && !justification && decision === 'deny') {
    throw new Error('Justification is required for denial');
  }
  
  const now = new Date();
  request.decision = {
    decision,
    decidedAt: now,
    approver,
    justification,
    notes
  };
  
  switch (decision) {
    case 'approve':
      request.status = 'approved';
      break;
    case 'deny':
      request.status = 'denied';
      break;
    case 'escalate':
      request.status = 'escalated';
      request.escalationCount++;
      break;
  }
  
  return {
    requestId: request.requestId,
    decision,
    approver,
    justification,
    notes,
    respondedAt: now,
    effectiveAt: now,
    expiresAt: request.expiresAt
  };
}

// ============================================================================
// Audit Trail
// ============================================================================

const auditLogs: AuditLogEntry[] = [];

export function logApprovalAudit(entry: Omit<AuditLogEntry, 'id'>): AuditLogEntry {
  const logEntry: AuditLogEntry = {
    id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    ...entry,
    createdAt: entry.createdAt || new Date()
  };
  
  auditLogs.push(logEntry);
  
  logger.debug('Approval audit log created', { 
    requestId: logEntry.requestId, 
    decision: logEntry.decision?.decision 
  });
  
  return logEntry;
}

export function getAuditLogs(filter?: {
  requestId?: string;
  agentId?: string;
  since?: Date;
  riskLevel?: RiskLevel;
}): AuditLogEntry[] {
  let results = [...auditLogs];
  
  if (filter?.requestId) {
    results = results.filter(l => l.requestId === filter.requestId);
  }
  
  if (filter?.agentId) {
    results = results.filter(l => l.requestingAgent.agentId === filter.agentId);
  }
  
  if (filter?.since) {
    results = results.filter(l => l.createdAt >= filter.since!);
  }
  
  if (filter?.riskLevel) {
    results = results.filter(l => l.risk.level === filter.riskLevel);
  }
  
  return results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

// ============================================================================
// Utility Functions
// ============================================================================

export function isExpired(request: ApprovalRequest): boolean {
  if (!request.expiresAt) return false;
  return new Date() > request.expiresAt;
}

export function canAutoApprove(request: ApprovalRequest): boolean {
  return request.risk.level === 'low' || request.approvalType === 'auto';
}

export function getStatusColor(status: ApprovalStatus): string {
  switch (status) {
    case 'pending': return 'yellow';
    case 'approved': return 'green';
    case 'denied': return 'red';
    case 'expired': return 'gray';
    case 'escalated': return 'orange';
    default: return 'white';
  }
}

export function formatApprovalForDisplay(request: ApprovalRequest): Record<string, unknown> {
  return {
    ID: request.id,
    Status: request.status.toUpperCase(),
    Type: request.operation.type,
    Target: request.operation.target,
    Risk: request.risk.level.toUpperCase(),
    Created: request.createdAt.toISOString(),
    Expires: request.expiresAt?.toISOString() || 'N/A',
    Agent: request.requestingAgent.agentLabel || request.requestingAgent.agentId,
    Decision: request.decision ? request.decision.decision.toUpperCase() : 'PENDING'
  };
}
