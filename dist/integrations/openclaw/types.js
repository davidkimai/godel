"use strict";
/**
 * OpenClaw Gateway Protocol Types
 *
 * TypeScript interfaces for the OpenClaw Gateway WebSocket API
 * Based on OPENCLAW_INTEGRATION_SPEC.md Section 4.1 Gateway Protocol
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_GATEWAY_OPTIONS = exports.DEFAULT_GATEWAY_CONFIG = exports.PermissionDeniedError = exports.BudgetExceededError = exports.AgentTimeoutError = exports.TimeoutError = exports.ConnectionError = exports.GatewayError = exports.DEFAULT_PERMISSIONS = void 0;
/**
 * Default permissions for agents
 */
exports.DEFAULT_PERMISSIONS = {
    allowedTools: [
        'read', 'write', 'edit', 'exec', 'browser', 'canvas',
        'nodes', 'cron', 'webhook',
        'sessions_list', 'sessions_history', 'sessions_send', 'sessions_spawn'
    ],
    deniedTools: ['gateway', 'discord', 'slack'],
    sandboxMode: 'non-main',
    maxDuration: 3600,
    maxTokens: 100000,
    maxCost: 1.00,
    requireApproval: false,
    approvalChannels: [],
};
/**
 * Gateway error class
 */
class GatewayError extends Error {
    constructor(code, message, details) {
        super(message);
        this.code = code;
        this.details = details;
        this.name = 'GatewayError';
    }
}
exports.GatewayError = GatewayError;
/**
 * Connection error class
 */
class ConnectionError extends GatewayError {
    constructor(message, details) {
        super('CONNECTION_ERROR', message, details);
        this.name = 'ConnectionError';
    }
}
exports.ConnectionError = ConnectionError;
/**
 * Timeout error class
 */
class TimeoutError extends GatewayError {
    constructor(message, details) {
        super('TIMEOUT_ERROR', message, details);
        this.name = 'TimeoutError';
    }
}
exports.TimeoutError = TimeoutError;
/**
 * Agent timeout error class
 */
class AgentTimeoutError extends GatewayError {
    constructor(sessionKey) {
        super('TIMEOUT_ERROR', `Agent timeout: ${sessionKey}`, { sessionKey });
        this.sessionKey = sessionKey;
        this.name = 'AgentTimeoutError';
    }
}
exports.AgentTimeoutError = AgentTimeoutError;
/**
 * Budget exceeded error class
 */
class BudgetExceededError extends GatewayError {
    constructor(agentId) {
        super('BUDGET_EXCEEDED', `Budget exceeded for agent: ${agentId}`, { agentId });
        this.agentId = agentId;
        this.name = 'BudgetExceededError';
    }
}
exports.BudgetExceededError = BudgetExceededError;
/**
 * Permission denied error class
 */
class PermissionDeniedError extends GatewayError {
    constructor(agentId, tool) {
        super('PERMISSION_DENIED', `Permission denied: ${agentId} cannot use ${tool}`, { agentId, tool });
        this.agentId = agentId;
        this.tool = tool;
        this.name = 'PermissionDeniedError';
    }
}
exports.PermissionDeniedError = PermissionDeniedError;
/**
 * Default gateway configuration
 */
exports.DEFAULT_GATEWAY_CONFIG = {
    host: '127.0.0.1',
    port: 18789,
    reconnectDelay: 1000,
    maxRetries: 10,
    requestTimeout: 30000,
};
/**
 * Default gateway client options
 */
exports.DEFAULT_GATEWAY_OPTIONS = {
    autoReconnect: true,
    connectionTimeout: 10000,
    heartbeatInterval: 30000,
};
//# sourceMappingURL=types.js.map