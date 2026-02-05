/**
 * Escalation Module - SPEC_APPROVAL_WORKFLOW.md
 * 
 * Timeout monitoring, escalation triggers, and auto-deny
 * logic for approval workflows.
 */

import { logger } from '../utils/logger';
import { 
  ApprovalRequest, 
  ApprovalStatus, 
  DecisionType, 
  ApproverIdentity,
  getConfig,
  isExpired,
  logApprovalAudit,
  ApprovalDecision
} from './approval';
import { 
  addToQueue, 
  removeFromQueue, 
  getFromQueue, 
  findExpiredRequests,
  findStaleRequests,
  getStats 
} from './pending';

// ============================================================================
// Escalation Configuration
// ============================================================================

export interface EscalationConfig {
  checkInterval: number;      // milliseconds
  enableAutoDeny: boolean;
  notifyOnEscalation: boolean;
  notifyOnExpiry: boolean;
  alternateApprovers: AlternateApprover[];
}

export interface AlternateApprover {
  type: 'human' | 'webhook' | 'agent';
  priority: number;
  identity: string;
  displayName?: string;
}

const DEFAULT_ESCALATION_CONFIG: EscalationConfig = {
  checkInterval: 10000,       // Check every 10 seconds
  enableAutoDeny: true,
  notifyOnEscalation: true,
  notifyOnExpiry: true,
  alternateApprovers: [
    { type: 'human', priority: 1, identity: 'supervisor', displayName: 'Supervisor' },
    { type: 'webhook', priority: 2, identity: 'slack:#alerts', displayName: 'Slack Alerts' },
    { type: 'agent', priority: 3, identity: 'orchestrator', displayName: 'Orchestrator' }
  ]
};

let escalationConfig: EscalationConfig = { ...DEFAULT_ESCALATION_CONFIG };
let monitoringInterval: ReturnType<typeof setInterval> | null = null;

// ============================================================================
// Timeout Monitoring
// ============================================================================

export function startMonitoring(config?: Partial<EscalationConfig>): void {
  if (monitoringInterval) {
    logger.warn('Escalation monitoring already running');
    return;
  }
  
  if (config) {
    escalationConfig = { ...escalationConfig, ...config };
  }
  
  logger.info('Starting escalation monitoring', { 
    checkInterval: escalationConfig.checkInterval 
  });
  
  monitoringInterval = setInterval(
    () => checkTimeouts(),
    escalationConfig.checkInterval
  );
}

export function stopMonitoring(): void {
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
    monitoringInterval = null;
    logger.info('Stopped escalation monitoring');
  }
}

function checkTimeouts(): void {
  const expiredRequests = findExpiredRequests();
  
  for (const request of expiredRequests) {
    handleExpiredRequest(request);
  }
}

function handleExpiredRequest(request: ApprovalRequest): void {
  logger.debug('Handling expired request', { requestId: request.id });
  
  const config = getConfig();
  
  if (request.escalationCount < request.maxEscalations) {
    // Escalate to next approver
    escalateRequest(request, 'Timeout - auto-escalated');
  } else {
    // Max escalations reached, auto-deny
    if (escalationConfig.enableAutoDeny) {
      autoDenyRequest(request, 'Maximum escalation count reached - auto-denied');
    }
  }
}

// ============================================================================
// Escalation Logic
// ============================================================================

export function escalateRequest(request: ApprovalRequest, reason: string): ApprovalRequest {
  if (request.status !== 'pending' && request.status !== 'escalated') {
    throw new Error(`Cannot escalate request with status: ${request.status}`);
  }
  
  const nextApprover = getNextApprover(request);
  
  logger.info('Escalating request', {
    requestId: request.id,
    escalationCount: request.escalationCount + 1,
    nextApprover: nextApprover?.identity
  });
  
  request.status = 'escalated';
  request.escalationCount++;
  
  // Extend timeout for next escalation level
  const timeout = getTimeoutForEscalation(request.escalationCount);
  request.expiresAt = new Date(Date.now() + timeout * 60 * 1000);
  
  // Log escalation
  const approverForLog = nextApprover ?? undefined;
  logApprovalAudit({
    requestId: request.requestId,
    createdAt: request.createdAt,
    requestingAgent: request.requestingAgent,
    operation: request.operation,
    risk: request.risk,
    approver: approverForLog,
    decision: {
      decision: 'escalate',
      decidedAt: new Date(),
      approver: { type: 'system', identity: 'escalation-monitor' },
      justification: reason
    },
    escalationHistory: [{
      fromApprover: request.decision?.approver || { type: 'system', identity: 'initial' },
      toApprover: nextApprover!,
      reason,
      timestamp: new Date()
    }],
    metadata: {
      sessionId: `escalation_${request.id}`,
      taskId: request.task?.taskId,
      taskTitle: request.task?.taskTitle
    }
  });
  
  // Add back to queue with new timeout
  addToQueue(request);
  
  // Notify if configured
  if (escalationConfig.notifyOnEscalation) {
    notifyEscalation(request, nextApprover!);
  }
  
  return request;
}

function getTimeoutForEscalation(escalationLevel: number): number {
  // Increase timeout for each escalation level
  const baseTimeouts = getConfig().timeout;
  return Math.min(
    baseTimeouts.critical * escalationLevel,
    baseTimeouts.standard * 4  // Cap at 2 hours
  );
}

function getNextApprover(request: ApprovalRequest): ApproverIdentity | undefined {
  const currentCount = request.escalationCount;
  
  if (currentCount <= 0) {
    // First escalation - return primary approver (to be implemented in real system)
    return { type: 'human', identity: 'pending-approval' };
  }
  
  const alternates = escalationConfig.alternateApprovers;
  
  if (currentCount - 1 < alternates.length) {
    const next = alternates[currentCount - 1];
    return {
      type: next.type,
      identity: next.identity,
      displayName: next.displayName
    };
  }
  
  // No more alternates - will trigger auto-deny
  return undefined;
}

// ============================================================================
// Auto-Deny Logic
// ============================================================================

export function autoDenyRequest(request: ApprovalRequest, reason: string): ApprovalRequest {
  if (request.status === 'approved' || request.status === 'denied') {
    throw new Error(`Request already ${request.status}`);
  }
  
  logger.info('Auto-denying request', {
    requestId: request.id,
    reason,
    escalationCount: request.escalationCount
  });
  
  request.status = 'denied';
  request.decision = {
    decision: 'deny',
    decidedAt: new Date(),
    approver: { type: 'system', identity: 'escalation-monitor' },
    justification: reason
  };
  
  // Remove from pending queue
  removeFromQueue(request.id);
  
  // Log audit
  logApprovalAudit({
    requestId: request.requestId,
    createdAt: request.createdAt,
    respondedAt: new Date(),
    requestingAgent: request.requestingAgent,
    operation: request.operation,
    risk: request.risk,
    decision: request.decision,
    metadata: {
      sessionId: `auto-deny_${request.id}`,
      taskId: request.task?.taskId,
      taskTitle: request.task?.taskTitle
    }
  });
  
  // Notify if configured
  if (escalationConfig.notifyOnExpiry) {
    notifyExpiry(request);
  }
  
  return request;
}

// ============================================================================
// Notification
// ============================================================================

interface NotificationPayload {
  requestId: string;
  type: 'escalation' | 'expiry' | 'approval' | 'denial';
  request: ApprovalRequest;
  recipient?: ApproverIdentity;
  message: string;
}

function notifyEscalation(request: ApprovalRequest, recipient: ApproverIdentity): void {
  const payload: NotificationPayload = {
    requestId: request.id,
    type: 'escalation',
    request,
    recipient,
    message: `Request ${request.id} has been escalated to you after ${request.escalationCount} escalation(s)`
  };
  
  sendNotification(payload);
}

function notifyExpiry(request: ApprovalRequest): void {
  const payload: NotificationPayload = {
    requestId: request.id,
    type: 'expiry',
    request,
    message: `Request ${request.id} has expired and was auto-denied`
  };
  
  sendNotification(payload);
}

function sendNotification(payload: NotificationPayload): void {
  // In a real implementation, this would send to Slack, email, etc.
  logger.info('Sending notification', {
    type: payload.type,
    requestId: payload.requestId,
    recipient: payload.recipient?.identity
  });
  
  // Simulate notification
  if (payload.recipient?.type === 'webhook') {
    // Would make HTTP request to webhook URL
    logger.debug('Webhook notification would be sent', { url: payload.recipient.identity });
  } else if (payload.recipient?.type === 'human') {
    // Would send email or other notification
    logger.debug('Human notification would be sent', { identity: payload.recipient.identity });
  }
}

// ============================================================================
// Batch Operations
// ============================================================================

export function expireOldRequests(olderThanMinutes: number): number {
  const requests = findExpiredRequests();
  let count = 0;
  
  for (const request of requests) {
    if (request.createdAt < new Date(Date.now() - olderThanMinutes * 60 * 1000)) {
      handleExpiredRequest(request);
      count++;
    }
  }
  
  logger.info('Expired old requests', { count });
  return count;
}

export function escalateStaleRequests(olderThanMinutes: number): number {
  const stale = findStaleRequests(olderThanMinutes);
  let count = 0;
  
  for (const request of stale) {
    if (request.status === 'pending') {
      escalateRequest(request, 'Stale request - auto-escalated');
      count++;
    }
  }
  
  logger.info('Escalated stale requests', { count });
  return count;
}

// ============================================================================
// Emergency Override
// ============================================================================

export interface EmergencyOverrideParams {
  requestId: string;
  approver: ApproverIdentity;
  reason: string;
  justification: string;
}

export function emergencyOverride(params: EmergencyOverrideParams): ApprovalRequest {
  const request = getFromQueue(params.requestId);
  
  if (!request) {
    throw new Error(`Request not found: ${params.requestId}`);
  }
  
  logger.warn('Emergency override invoked', {
    requestId: params.requestId,
    approver: params.approver.identity,
    reason: params.reason
  });
  
  // Approve the request
  request.status = 'approved';
  request.decision = {
    decision: 'approve',
    decidedAt: new Date(),
    approver: params.approver,
    justification: params.justification
  };
  
  // Remove from queue
  removeFromQueue(request.id);
  
  // Log with enhanced audit trail
  logApprovalAudit({
    requestId: request.requestId,
    createdAt: request.createdAt,
    respondedAt: new Date(),
    requestingAgent: request.requestingAgent,
    operation: request.operation,
    risk: request.risk,
    approver: params.approver,
    decision: {
      decision: 'approve',
      decidedAt: new Date(),
      approver: params.approver,
      justification: `EMERGENCY OVERRIDE: ${params.justification}`
    },
    metadata: {
      sessionId: `emergency-override_${request.id}`,
      taskId: request.task?.taskId,
      taskTitle: request.task?.taskTitle,
      correlationId: `emergency-${Date.now()}`
    }
  });
  
  return request;
}

// ============================================================================
// Status and Configuration
// ============================================================================

export function isMonitoring(): boolean {
  return monitoringInterval !== null;
}

export function getEscalationConfig(): EscalationConfig {
  return { ...escalationConfig };
}

export function setEscalationConfig(config: Partial<EscalationConfig>): void {
  escalationConfig = { ...escalationConfig, ...config };
  
  // Restart monitoring if interval changed
  if (monitoringInterval && config.checkInterval) {
    stopMonitoring();
    startMonitoring();
  }
  
  logger.debug('Escalation config updated', { config: escalationConfig });
}

export function getEscalationStats(): {
  isMonitoring: boolean;
  pendingCount: number;
  config: EscalationConfig;
} {
  return {
    isMonitoring: isMonitoring(),
    pendingCount: getStats().pending,
    config: escalationConfig
  };
}
