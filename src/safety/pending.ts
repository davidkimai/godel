/**
 * Pending Approval Queue Module
 * 
 * Manages the queue of pending approval requests with
 * list, get, and filtering operations.
 */

import { logger } from '../utils/logger';
import { 
  ApprovalRequest, 
  ApprovalStatus, 
  OperationType, 
  RiskLevel,
  getAuditLogs,
  logApprovalAudit,
  formatApprovalForDisplay
} from './approval';

// ============================================================================
// Queue Storage
// ============================================================================

const pendingQueue: Map<string, ApprovalRequest> = new Map();
const allRequests: Map<string, ApprovalRequest> = new Map();

// ============================================================================
// Queue Operations
// ============================================================================

export function addToQueue(request: ApprovalRequest): void {
  pendingQueue.set(request.id, request);
  allRequests.set(request.id, request);
  
  logger.debug('Added request to pending queue', { 
    requestId: request.id, 
    status: request.status 
  });
}

export function removeFromQueue(requestId: string): ApprovalRequest | undefined {
  const request = pendingQueue.get(requestId);
  pendingQueue.delete(requestId);
  
  logger.debug('Removed request from pending queue', { requestId });
  
  return request;
}

export function getFromQueue(requestId: string): ApprovalRequest | undefined {
  return pendingQueue.get(requestId);
}

export function getAllRequests(): ApprovalRequest[] {
  return Array.from(allRequests.values());
}

// ============================================================================
// List Operations
// ============================================================================

export interface ListOptions {
  status?: ApprovalStatus | 'all';
  agentId?: string;
  operationType?: OperationType;
  riskLevel?: RiskLevel;
  limit?: number;
  offset?: number;
  sortBy?: 'createdAt' | 'risk' | 'priority';
  sortOrder?: 'asc' | 'desc';
}

export function listPending(options: ListOptions = {}): ApprovalRequest[] {
  let requests: ApprovalRequest[];
  
  if (options.status && options.status !== 'all') {
    requests = Array.from(allRequests.values())
      .filter(r => r.status === options.status);
  } else {
    requests = Array.from(allRequests.values());
  }
  
  // Filter by agent ID
  if (options.agentId) {
    requests = requests.filter(r => 
      r.requestingAgent.agentId === options.agentId ||
      r.requestingAgent.swarmId === options.agentId
    );
  }
  
  // Filter by operation type
  if (options.operationType) {
    requests = requests.filter(r => r.operation.type === options.operationType);
  }
  
  // Filter by risk level
  if (options.riskLevel) {
    requests = requests.filter(r => r.risk.level === options.riskLevel);
  }
  
  // Sort
  const sortBy = options.sortBy || 'createdAt';
  const sortOrder = options.sortOrder || 'desc';
  
  requests.sort((a, b) => {
    let comparison = 0;
    
    switch (sortBy) {
      case 'createdAt':
        comparison = a.createdAt.getTime() - b.createdAt.getTime();
        break;
      case 'risk':
        const riskOrder = { critical: 4, high: 3, medium: 2, low: 1 };
        comparison = riskOrder[a.risk.level] - riskOrder[b.risk.level];
        break;
      case 'priority':
        const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1 };
        comparison = priorityOrder[a.priority] - priorityOrder[b.priority];
        break;
    }
    
    return sortOrder === 'desc' ? -comparison : comparison;
  });
  
  // Pagination
  const offset = options.offset || 0;
  const limit = options.limit || requests.length;
  
  return requests.slice(offset, offset + limit);
}

export function countPending(options: ListOptions = {}): number {
  return listPending({ ...options, limit: undefined, offset: undefined }).length;
}

// ============================================================================
// Get Details
// ============================================================================

export function getApprovalDetails(requestId: string, includeContext = false): ApprovalRequest | null {
  const request = allRequests.get(requestId);
  
  if (!request) {
    return null;
  }
  
  if (!includeContext) {
    // Return a copy without sensitive context
    return { ...request, context: undefined };
  }
  
  return request;
}

export function getRequestHistory(requestId: string): ApprovalRequest[] {
  const request = allRequests.get(requestId);
  if (!request) return [];
  
  // In a real implementation, this would query historical records
  return [request];
}

// ============================================================================
// Filtering Operations
// ============================================================================

export function filterByAgent(agentId: string): ApprovalRequest[] {
  return listPending({ agentId, status: 'all' });
}

export function filterByStatus(status: ApprovalStatus): ApprovalRequest[] {
  return listPending({ status });
}

export function filterByRisk(riskLevel: RiskLevel): ApprovalRequest[] {
  return listPending({ riskLevel });
}

export function filterByOperationType(operationType: OperationType): ApprovalRequest[] {
  return listPending({ operationType });
}

export function findExpiredRequests(): ApprovalRequest[] {
  return Array.from(allRequests.values()).filter(r => 
    r.status === 'pending' && r.expiresAt && new Date() > r.expiresAt
  );
}

export function findStaleRequests(olderThanMinutes: number): ApprovalRequest[] {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);
  return Array.from(allRequests.values()).filter(r => 
    r.status === 'pending' && r.createdAt < cutoff
  );
}

// ============================================================================
// Statistics
// ============================================================================

export interface ApprovalStats {
  total: number;
  pending: number;
  approved: number;
  denied: number;
  expired: number;
  escalated: number;
  byRisk: Record<RiskLevel, number>;
  byType: Record<OperationType, number>;
  avgResponseTime?: number;
}

export function getStats(): ApprovalStats {
  const requests = Array.from(allRequests.values());
  
  const stats: ApprovalStats = {
    total: requests.length,
    pending: 0,
    approved: 0,
    denied: 0,
    expired: 0,
    escalated: 0,
    byRisk: { low: 0, medium: 0, high: 0, critical: 0 },
    byType: { file_write: 0, file_delete: 0, api_call: 0, budget_overrun: 0, agent_termination: 0 }
  };
  
  for (const request of requests) {
    switch (request.status) {
      case 'pending': stats.pending++; break;
      case 'approved': stats.approved++; break;
      case 'denied': stats.denied++; break;
      case 'expired': stats.expired++; break;
      case 'escalated': stats.escalated++; break;
    }
    
    stats.byRisk[request.risk.level]++;
    stats.byType[request.operation.type]++;
  }
  
  // Calculate average response time
  const completed = requests.filter(r => r.decision?.decidedAt);
  if (completed.length > 0) {
    const totalTime = completed.reduce((sum, r) => 
      sum + (r.decision!.decidedAt.getTime() - r.createdAt.getTime()), 0
    );
    stats.avgResponseTime = totalTime / completed.length / 1000 / 60; // in minutes
  }
  
  return stats;
}

// ============================================================================
// Format for Display
// ============================================================================

export function formatListForDisplay(requests: ApprovalRequest[], format: 'table' | 'json' = 'table'): string {
  if (format === 'json') {
    return JSON.stringify(requests.map(formatApprovalForDisplay), null, 2);
  }
  
  if (requests.length === 0) {
    return 'No pending approval requests.';
  }
  
  const headers = ['ID', 'TYPE', 'TARGET', 'RISK', 'AGE', 'AGENT'];
  const rows = requests.map(r => {
    const age = Math.floor((Date.now() - r.createdAt.getTime()) / 1000 / 60);
    return [
      r.id.substring(0, 12),
      r.operation.type.substring(0, 10),
      r.operation.target.substring(0, 20),
      r.risk.level.toUpperCase(),
      `${age}m`,
      r.requestingAgent.agentLabel || r.requestingAgent.agentId.substring(0, 10)
    ];
  });
  
  return formatTable(headers, rows, {
    title: 'PENDING APPROVAL REQUESTS',
    footer: `${requests.length} request(s)`
  });
}

export function formatDetailsForDisplay(request: ApprovalRequest): string {
  const lines: string[] = [];
  const sep = '═'.repeat(70);
  
  lines.push(`APPROVAL REQUEST: ${request.id}`);
  lines.push(sep);
  lines.push(`Status:      ${request.status.toUpperCase()}`);
  lines.push(`Created:     ${request.createdAt.toISOString()}`);
  if (request.expiresAt) {
    const remaining = Math.max(0, Math.floor((request.expiresAt.getTime() - Date.now()) / 1000 / 60));
    lines.push(`Expires:     ${request.expiresAt.toISOString()} (${remaining}m remaining)`);
  }
  lines.push(`Risk Level:  ${request.risk.level.toUpperCase()}`);
  lines.push('');
  
  lines.push('REQUESTING AGENT');
  lines.push('─'.repeat(70));
  lines.push(`Agent ID:    ${request.requestingAgent.agentId}`);
  if (request.requestingAgent.agentLabel) {
    lines.push(`Label:       ${request.requestingAgent.agentLabel}`);
  }
  if (request.requestingAgent.swarmId) {
    lines.push(`Swarm:       ${request.requestingAgent.swarmId}`);
  }
  if (request.requestingAgent.parentAgentId) {
    lines.push(`Parent:      ${request.requestingAgent.parentAgentId}`);
  }
  lines.push('');
  
  lines.push('OPERATION DETAILS');
  lines.push('─'.repeat(70));
  lines.push(`Type:        ${request.operation.type}`);
  lines.push(`Target:      ${request.operation.target}`);
  lines.push('');
  
  lines.push('RISK ANALYSIS');
  lines.push('─'.repeat(70));
  lines.push(`Level:       ${request.risk.level.toUpperCase()}`);
  lines.push(`Reason:      ${request.risk.classificationReason}`);
  if (request.risk.affectedSystems?.length) {
    lines.push(`Affected:    ${request.risk.affectedSystems.join(', ')}`);
  }
  lines.push('');
  
  if (request.task) {
    lines.push('TASK CONTEXT');
    lines.push('─'.repeat(70));
    if (request.task.taskId) lines.push(`Task ID:     ${request.task.taskId}`);
    if (request.task.taskTitle) lines.push(`Title:       ${request.task.taskTitle}`);
    lines.push('');
  }
  
  if (request.decision) {
    lines.push('DECISION');
    lines.push('─'.repeat(70));
    lines.push(`Decision:    ${request.decision.decision.toUpperCase()}`);
    lines.push(`Decided:     ${request.decision.decidedAt.toISOString()}`);
    lines.push(`Approver:    ${request.decision.approver.identity} (${request.decision.approver.type})`);
    if (request.decision.justification) {
      lines.push(`Justification: ${request.decision.justification}`);
    }
    if (request.decision.notes) {
      lines.push(`Notes:       ${request.decision.notes}`);
    }
    lines.push('');
  }
  
  lines.push(sep);
  
  return lines.join('\n');
}

// ============================================================================
// Utility
// ============================================================================

interface TableOptions {
  title?: string;
  footer?: string;
}

function formatTable(headers: string[], rows: string[][], options: TableOptions = {}): string {
  const lines: string[] = [];
  
  // Calculate column widths
  const colWidths = headers.map((h, i) => 
    Math.max(h.length, ...rows.map(r => (r[i] || '').length))
  );
  
  // Helper to pad cell
  const pad = (text: string, width: number) => text.padEnd(width, ' ');
  
  if (options.title) {
    const totalWidth = colWidths.reduce((sum, w) => sum + w + 3, -3);
    lines.push('═'.repeat(totalWidth));
    lines.push(options.title);
    lines.push('═'.repeat(totalWidth));
  }
  
  // Header row
  lines.push(headers.map((h, i) => pad(h, colWidths[i])).join(' │ '));
  lines.push(headers.map((_, i) => '─'.repeat(colWidths[i])).join('─┼─'));
  
  // Data rows
  for (const row of rows) {
    lines.push(row.map((cell, i) => pad(cell, colWidths[i])).join(' │ '));
  }
  
  if (options.footer) {
    lines.push('─'.repeat(colWidths.reduce((sum, w) => sum + w + 3, -3)));
    lines.push(options.footer);
  }
  
  if (options.title) {
    lines.push('═'.repeat(colWidths.reduce((sum, w) => sum + w + 3, -3)));
  }
  
  return lines.join('\n');
}

export function clearAllRequests(): void {
  pendingQueue.clear();
  allRequests.clear();
  logger.info('All approval requests cleared');
}
