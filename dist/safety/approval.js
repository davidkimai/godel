"use strict";
/**
 * Approval Workflow Module - SPEC_APPROVAL_WORKFLOW.md
 *
 * Core approval types, request creation, response handling,
 * and risk assessment for human-in-loop approval workflows.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_CONFIG = void 0;
exports.getConfig = getConfig;
exports.setConfig = setConfig;
exports.assessRisk = assessRisk;
exports.getTimeoutForRisk = getTimeoutForRisk;
exports.getMaxEscalationsForRisk = getMaxEscalationsForRisk;
exports.createApprovalRequest = createApprovalRequest;
exports.respondToRequest = respondToRequest;
exports.logApprovalAudit = logApprovalAudit;
exports.getAuditLogs = getAuditLogs;
exports.isExpired = isExpired;
exports.canAutoApprove = canAutoApprove;
exports.getStatusColor = getStatusColor;
exports.formatApprovalForDisplay = formatApprovalForDisplay;
const utils_1 = require("../utils");
// ============================================================================
// Configuration
// ============================================================================
exports.DEFAULT_CONFIG = {
    timeout: {
        critical: 5, // 5 minutes for critical
        standard: 30, // 30 minutes for standard
        urgent: 2 // 2 minutes for urgent
    },
    maxEscalations: {
        critical: 3,
        standard: 2,
        urgent: 2
    },
    autoContinueOnTimeout: false,
    requireJustification: true
};
let globalConfig = { ...exports.DEFAULT_CONFIG };
function getConfig() {
    return { ...globalConfig };
}
function setConfig(config) {
    globalConfig = { ...globalConfig, ...config };
    utils_1.logger.debug('Approval config updated', { config: globalConfig });
}
// ============================================================================
// Risk Assessment
// ============================================================================
const FILE_WRITE_PATTERNS = [
    { pattern: /^config\/.*$/, risk: 'medium', reason: 'Configuration file modification' },
    { pattern: /.*\.prod\..*/, risk: 'high', reason: 'Production file modification' },
    { pattern: /prod[.\/]/, risk: 'high', reason: 'Production file modification' },
    { pattern: /^src\/.*$/, risk: 'medium', reason: 'Source code modification' },
    { pattern: /^tests\/.*$/, risk: 'low', reason: 'Test file modification' },
    { pattern: /^docs\/.*$/, risk: 'low', reason: 'Documentation modification' }
];
const DELETE_PATTERNS = [
    { pattern: /.*\.git.*/, risk: 'critical', reason: 'Git directory deletion' },
    { pattern: /^rm\s+-rf/, risk: 'critical', reason: 'Recursive delete operation' },
    { pattern: /.*node_modules\/.*/, risk: 'high', reason: 'Dependencies deletion' },
    { pattern: /.*dist\/.*/, risk: 'medium', reason: 'Build output deletion' }
];
const API_PATTERNS = [
    { pattern: /.*(write|admin|delete|root).*/, risk: 'critical', reason: 'Sensitive API scope detected' },
    { pattern: /.*(POST|PUT|DELETE).*/, risk: 'medium', reason: 'Modifying API operation' },
    { pattern: /.*(GET|HEAD).*/, risk: 'low', reason: 'Read-only API operation' }
];
function assessRisk(operationType, target, details = {}) {
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
function assessFileWriteRisk(target) {
    for (const { pattern, risk, reason } of FILE_WRITE_PATTERNS) {
        if (pattern.test(target)) {
            return { level: risk, classificationReason: reason };
        }
    }
    return { level: 'medium', classificationReason: 'File write operation' };
}
function assessDeleteRisk(target) {
    for (const { pattern, risk, reason } of DELETE_PATTERNS) {
        if (pattern.test(target)) {
            return { level: risk, classificationReason: reason };
        }
    }
    return { level: 'high', classificationReason: 'Delete operation detected' };
}
function assessApiRisk(target, details) {
    // Check for non-allowlisted domains (would need API in real implementation)
    if (details['allowlisted'] === false) {
        return {
            level: 'critical',
            classificationReason: 'Non-allowlisted API domain'
        };
    }
    // Check for sensitive scopes
    const scopes = details['scopes'];
    if (scopes?.some(s => s.includes('write:admin') || s.includes('delete'))) {
        return {
            level: 'critical',
            classificationReason: 'Sensitive API scope detected'
        };
    }
    const method = details['method']?.toUpperCase();
    for (const { pattern, risk, reason } of API_PATTERNS) {
        if (pattern.test(method || '')) {
            return { level: risk, classificationReason: reason };
        }
    }
    return { level: 'medium', classificationReason: 'External API call' };
}
function assessBudgetRisk(details) {
    const exceededAmount = details['exceededAmount'] || 0;
    const budgetType = details['budgetType'] || 'unknown';
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
function getTimeoutForRisk(risk, config = globalConfig) {
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
function getMaxEscalationsForRisk(risk, config = globalConfig) {
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
function generateRequestId() {
    requestCounter++;
    return `apr_${Date.now()}_${requestCounter.toString(36)}`;
}
function createApprovalRequest(params) {
    const risk = params.overrideRisk
        ? { level: params.overrideRisk, classificationReason: 'Manual override' }
        : assessRisk(params.operation.type, params.operation.target, params.operation.details);
    const approvalType = risk.level === 'low' ? 'auto' :
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
function respondToRequest(request, decision, approver, justification, notes) {
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
const auditLogs = [];
function logApprovalAudit(entry) {
    const logEntry = {
        id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        ...entry,
        createdAt: entry.createdAt || new Date()
    };
    auditLogs.push(logEntry);
    utils_1.logger.debug('Approval audit log created', {
        requestId: logEntry.requestId,
        decision: logEntry.decision?.decision
    });
    return logEntry;
}
function getAuditLogs(filter) {
    let results = [...auditLogs];
    if (filter?.requestId) {
        results = results.filter(l => l.requestId === filter.requestId);
    }
    if (filter?.agentId) {
        results = results.filter(l => l.requestingAgent.agentId === filter.agentId);
    }
    if (filter?.since) {
        results = results.filter(l => l.createdAt >= filter.since);
    }
    if (filter?.riskLevel) {
        results = results.filter(l => l.risk.level === filter.riskLevel);
    }
    return results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}
// ============================================================================
// Utility Functions
// ============================================================================
function isExpired(request) {
    if (!request.expiresAt)
        return false;
    return new Date() > request.expiresAt;
}
function canAutoApprove(request) {
    return request.risk.level === 'low' || request.approvalType === 'auto';
}
function getStatusColor(status) {
    switch (status) {
        case 'pending': return 'yellow';
        case 'approved': return 'green';
        case 'denied': return 'red';
        case 'expired': return 'gray';
        case 'escalated': return 'orange';
        default: return 'white';
    }
}
function formatApprovalForDisplay(request) {
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
//# sourceMappingURL=approval.js.map