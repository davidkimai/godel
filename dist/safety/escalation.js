"use strict";
/**
 * Escalation Module - SPEC_APPROVAL_WORKFLOW.md
 *
 * Timeout monitoring, escalation triggers, and auto-deny
 * logic for approval workflows.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.startMonitoring = startMonitoring;
exports.stopMonitoring = stopMonitoring;
exports.escalateRequest = escalateRequest;
exports.autoDenyRequest = autoDenyRequest;
exports.expireOldRequests = expireOldRequests;
exports.escalateStaleRequests = escalateStaleRequests;
exports.emergencyOverride = emergencyOverride;
exports.isMonitoring = isMonitoring;
exports.getEscalationConfig = getEscalationConfig;
exports.setEscalationConfig = setEscalationConfig;
exports.getEscalationStats = getEscalationStats;
const approval_1 = require("./approval");
const pending_1 = require("./pending");
const utils_1 = require("../utils");
const DEFAULT_ESCALATION_CONFIG = {
    checkInterval: 10000, // Check every 10 seconds
    enableAutoDeny: true,
    notifyOnEscalation: true,
    notifyOnExpiry: true,
    alternateApprovers: [
        { type: 'human', priority: 1, identity: 'supervisor', displayName: 'Supervisor' },
        { type: 'webhook', priority: 2, identity: 'slack:#alerts', displayName: 'Slack Alerts' },
        { type: 'agent', priority: 3, identity: 'orchestrator', displayName: 'Orchestrator' }
    ]
};
let escalationConfig = { ...DEFAULT_ESCALATION_CONFIG };
let monitoringInterval = null;
// ============================================================================
// Timeout Monitoring
// ============================================================================
function startMonitoring(config) {
    if (monitoringInterval) {
        utils_1.logger.warn('Escalation monitoring already running');
        return;
    }
    if (config) {
        escalationConfig = { ...escalationConfig, ...config };
    }
    utils_1.logger.info('Starting escalation monitoring', {
        checkInterval: escalationConfig.checkInterval
    });
    monitoringInterval = setInterval(() => checkTimeouts(), escalationConfig.checkInterval);
}
function stopMonitoring() {
    if (monitoringInterval) {
        clearInterval(monitoringInterval);
        monitoringInterval = null;
        utils_1.logger.info('Stopped escalation monitoring');
    }
}
function checkTimeouts() {
    const expiredRequests = (0, pending_1.findExpiredRequests)();
    for (const request of expiredRequests) {
        handleExpiredRequest(request);
    }
}
function handleExpiredRequest(request) {
    utils_1.logger.debug('Handling expired request', { requestId: request.id });
    const config = (0, approval_1.getConfig)();
    if (request.escalationCount < request.maxEscalations) {
        // Escalate to next approver
        escalateRequest(request, 'Timeout - auto-escalated');
    }
    else {
        // Max escalations reached, auto-deny
        if (escalationConfig.enableAutoDeny) {
            autoDenyRequest(request, 'Maximum escalation count reached - auto-denied');
        }
    }
}
// ============================================================================
// Escalation Logic
// ============================================================================
function escalateRequest(request, reason) {
    if (request.status !== 'pending' && request.status !== 'escalated') {
        throw new Error(`Cannot escalate request with status: ${request.status}`);
    }
    const nextApprover = getNextApprover(request);
    utils_1.logger.info('Escalating request', {
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
    (0, approval_1.logApprovalAudit)({
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
                toApprover: nextApprover,
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
    (0, pending_1.addToQueue)(request);
    // Notify if configured
    if (escalationConfig.notifyOnEscalation) {
        notifyEscalation(request, nextApprover);
    }
    return request;
}
function getTimeoutForEscalation(escalationLevel) {
    // Increase timeout for each escalation level
    const baseTimeouts = (0, approval_1.getConfig)().timeout;
    return Math.min(baseTimeouts.critical * escalationLevel, baseTimeouts.standard * 4 // Cap at 2 hours
    );
}
function getNextApprover(request) {
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
function autoDenyRequest(request, reason) {
    if (request.status === 'approved' || request.status === 'denied') {
        throw new Error(`Request already ${request.status}`);
    }
    utils_1.logger.info('Auto-denying request', {
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
    (0, pending_1.removeFromQueue)(request.id);
    // Log audit
    (0, approval_1.logApprovalAudit)({
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
function notifyEscalation(request, recipient) {
    const payload = {
        requestId: request.id,
        type: 'escalation',
        request,
        recipient,
        message: `Request ${request.id} has been escalated to you after ${request.escalationCount} escalation(s)`
    };
    sendNotification(payload);
}
function notifyExpiry(request) {
    const payload = {
        requestId: request.id,
        type: 'expiry',
        request,
        message: `Request ${request.id} has expired and was auto-denied`
    };
    sendNotification(payload);
}
function sendNotification(payload) {
    // In a real implementation, this would send to Slack, email, etc.
    utils_1.logger.info('Sending notification', {
        type: payload.type,
        requestId: payload.requestId,
        recipient: payload.recipient?.identity
    });
    // Simulate notification
    if (payload.recipient?.type === 'webhook') {
        // Would make HTTP request to webhook URL
        utils_1.logger.debug('Webhook notification would be sent', { url: payload.recipient.identity });
    }
    else if (payload.recipient?.type === 'human') {
        // Would send email or other notification
        utils_1.logger.debug('Human notification would be sent', { identity: payload.recipient.identity });
    }
}
// ============================================================================
// Batch Operations
// ============================================================================
function expireOldRequests(olderThanMinutes) {
    const requests = (0, pending_1.findExpiredRequests)();
    let count = 0;
    for (const request of requests) {
        if (request.createdAt < new Date(Date.now() - olderThanMinutes * 60 * 1000)) {
            handleExpiredRequest(request);
            count++;
        }
    }
    utils_1.logger.info('Expired old requests', { count });
    return count;
}
function escalateStaleRequests(olderThanMinutes) {
    const stale = (0, pending_1.findStaleRequests)(olderThanMinutes);
    let count = 0;
    for (const request of stale) {
        if (request.status === 'pending') {
            escalateRequest(request, 'Stale request - auto-escalated');
            count++;
        }
    }
    utils_1.logger.info('Escalated stale requests', { count });
    return count;
}
function emergencyOverride(params) {
    const request = (0, pending_1.getFromQueue)(params.requestId);
    if (!request) {
        throw new Error(`Request not found: ${params.requestId}`);
    }
    utils_1.logger.warn('Emergency override invoked', {
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
    (0, pending_1.removeFromQueue)(request.id);
    // Log with enhanced audit trail
    (0, approval_1.logApprovalAudit)({
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
function isMonitoring() {
    return monitoringInterval !== null;
}
function getEscalationConfig() {
    return { ...escalationConfig };
}
function setEscalationConfig(config) {
    escalationConfig = { ...escalationConfig, ...config };
    // Restart monitoring if interval changed
    if (monitoringInterval && config.checkInterval) {
        stopMonitoring();
        startMonitoring();
    }
    utils_1.logger.debug('Escalation config updated', { config: escalationConfig });
}
function getEscalationStats() {
    return {
        isMonitoring: isMonitoring(),
        pendingCount: (0, pending_1.getStats)().pending,
        config: escalationConfig
    };
}
//# sourceMappingURL=escalation.js.map