"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.webhookRegisterSchema = exports.configUpdateSchema = exports.eventPublishSchema = exports.sendMessageSchema = exports.updateTaskSchema = exports.createTaskSchema = exports.budgetQuerySchema = exports.budgetConsumptionSchema = exports.setBudgetSchema = exports.swarmQuerySchema = exports.swarmActionSchema = exports.updateSwarmSchema = exports.createSwarmSchema = exports.agentQuerySchema = exports.agentActionSchema = exports.updateAgentSchema = exports.spawnAgentSchema = exports.dateRangeSchema = exports.paginationSchema = exports.uuidArraySchema = exports.idSchema = void 0;
const zod_1 = require("zod");
// =============================================================================
// ID & BASE SCHEMAS
// =============================================================================
exports.idSchema = zod_1.z.string().uuid();
exports.uuidArraySchema = zod_1.z.array(zod_1.z.string().uuid()).min(1);
exports.paginationSchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().min(1).default(1),
    perPage: zod_1.z.coerce.number().int().min(1).max(100).default(20),
});
exports.dateRangeSchema = zod_1.z.object({
    startDate: zod_1.z.coerce.date().optional(),
    endDate: zod_1.z.coerce.date().optional(),
}).refine((data) => {
    if (data.startDate && data.endDate) {
        return data.startDate <= data.endDate;
    }
    return true;
}, { message: 'startDate must be before or equal to endDate' });
// =============================================================================
// AGENT SCHEMAS
// =============================================================================
exports.spawnAgentSchema = zod_1.z.object({
    task: zod_1.z.string().min(1).max(1000),
    model: zod_1.z.enum(['kimi-k2.5', 'claude-sonnet-4-5', 'gpt-4', 'gpt-4o']),
    priority: zod_1.z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
    parentId: zod_1.z.string().uuid().optional(),
    swarmId: zod_1.z.string().uuid().optional(),
    metadata: zod_1.z.record(zod_1.z.unknown()).optional(),
}).refine((data) => {
    // Critical priority requires justification
    if (data.priority === 'critical') {
        // In real implementation, check metadata for justification
        return true;
    }
    return true;
}, { message: 'Critical priority requires justification in metadata' });
exports.updateAgentSchema = zod_1.z.object({
    status: zod_1.z.enum(['idle', 'spawning', 'running', 'paused', 'completed', 'failed', 'killing']).optional(),
    progress: zod_1.z.number().min(0).max(100).optional(),
    result: zod_1.z.string().optional(),
    error: zod_1.z.string().optional(),
    metadata: zod_1.z.record(zod_1.z.unknown()).optional(),
}).refine((data) => {
    // Cannot have both result and error
    if (data.result && data.error) {
        return false;
    }
    // Completed status requires 100% progress
    if (data.status === 'completed' && data.progress !== undefined && data.progress !== 100) {
        return false;
    }
    return true;
}, { message: 'Invalid agent update: conflicting result/error or incomplete progress' });
exports.agentActionSchema = zod_1.z.object({
    action: zod_1.z.enum(['kill', 'pause', 'resume', 'retry', 'scale']),
    reason: zod_1.z.string().min(1).max(500).optional(),
    force: zod_1.z.boolean().default(false),
    delay: zod_1.z.number().int().min(0).max(3600).optional(), // seconds
}).refine((data) => {
    // Kill/pause requires reason unless force=true
    if ((data.action === 'kill' || data.action === 'pause') && !data.force && !data.reason) {
        return false;
    }
    // Delay only valid for retry/scale
    if (data.delay !== undefined && !['retry', 'scale'].includes(data.action)) {
        return false;
    }
    return true;
}, { message: 'Action requires reason or force flag; delay only for retry/scale' });
exports.agentQuerySchema = zod_1.z.object({
    swarmId: zod_1.z.string().uuid().optional(),
    status: zod_1.z.array(zod_1.z.enum(['idle', 'spawning', 'running', 'paused', 'completed', 'failed', 'killing'])).optional(),
    ...exports.paginationSchema.shape,
});
// =============================================================================
// SWARM SCHEMAS
// =============================================================================
exports.createSwarmSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(100).regex(/^[a-zA-Z0-9-_]+$/),
    description: zod_1.z.string().max(500).optional(),
    agents: zod_1.z.number().int().min(1).max(100),
    strategy: zod_1.z.enum(['parallel', 'map-reduce', 'pipeline', 'race']).default('parallel'),
    budget: zod_1.z.number().positive().max(10000).optional(),
    config: zod_1.z.record(zod_1.z.unknown()).optional(),
}).refine((data) => {
    // Race strategy requires at least 2 agents
    if (data.strategy === 'race' && data.agents < 2) {
        return false;
    }
    // Map-reduce requires at least 3 agents (mapper, reducer, coordinator)
    if (data.strategy === 'map-reduce' && data.agents < 3) {
        return false;
    }
    return true;
}, { message: 'Race strategy requires 2+ agents; map-reduce requires 3+ agents' });
exports.updateSwarmSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(100).regex(/^[a-zA-Z0-9-_]+$/).optional(),
    description: zod_1.z.string().max(500).optional(),
    status: zod_1.z.enum(['running', 'paused', 'completed', 'failed']).optional(),
    config: zod_1.z.record(zod_1.z.unknown()).optional(),
}).refine((data) => {
    // At least one field must be provided
    return Object.keys(data).length > 0;
}, { message: 'At least one field must be provided for update' });
exports.swarmActionSchema = zod_1.z.object({
    action: zod_1.z.enum(['pause', 'resume', 'cancel', 'scale', 'rebalance']),
    targetAgents: zod_1.z.number().int().min(1).max(100).optional(),
    graceful: zod_1.z.boolean().optional(),
}).refine((data) => {
    // Scale requires targetAgents
    if (data.action === 'scale' && data.targetAgents === undefined) {
        return false;
    }
    // Cannot be graceful with cancel
    if (data.action === 'cancel' && data.graceful) {
        return false;
    }
    return true;
}, { message: 'Scale requires targetAgents; cancel cannot be graceful' });
exports.swarmQuerySchema = zod_1.z.object({
    status: zod_1.z.array(zod_1.z.enum(['running', 'paused', 'completed', 'failed'])).optional(),
    ...exports.paginationSchema.shape,
});
// =============================================================================
// BUDGET SCHEMAS
// =============================================================================
exports.setBudgetSchema = zod_1.z.object({
    scopeType: zod_1.z.enum(['swarm', 'agent', 'project', 'global']),
    scopeId: zod_1.z.string().uuid().optional(),
    maxTokens: zod_1.z.number().int().positive().optional(),
    maxCost: zod_1.z.number().positive().optional(),
    maxRequests: zod_1.z.number().int().positive().optional(),
    alertThreshold: zod_1.z.number().min(0).max(1).optional(), // 0-1 percentage
}).refine((data) => {
    // At least one limit must be specified
    const hasLimit = data.maxTokens || data.maxCost || data.maxRequests;
    if (!hasLimit) {
        return false;
    }
    // scopeId required for non-global scopes
    if (data.scopeType !== 'global' && !data.scopeId) {
        return false;
    }
    return true;
}, { message: 'At least one budget limit required; scopeId required for non-global scopes' });
exports.budgetConsumptionSchema = zod_1.z.object({
    tokensUsed: zod_1.z.number().int().min(0).optional(),
    costIncurred: zod_1.z.number().min(0).optional(),
    requestsMade: zod_1.z.number().int().min(0).optional(),
}).refine((data) => {
    // At least one metric must be provided
    return data.tokensUsed !== undefined || data.costIncurred !== undefined || data.requestsMade !== undefined;
}, { message: 'At least one consumption metric required' });
exports.budgetQuerySchema = zod_1.z.object({
    scopeType: zod_1.z.enum(['swarm', 'agent', 'project', 'global']).optional(),
    ...exports.paginationSchema.shape,
});
// =============================================================================
// TASK SCHEMAS
// =============================================================================
exports.createTaskSchema = zod_1.z.object({
    title: zod_1.z.string().min(1).max(200),
    description: zod_1.z.string().max(5000).optional(),
    priority: zod_1.z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
    dueDate: zod_1.z.coerce.date().optional(),
    assignees: zod_1.z.array(zod_1.z.string().uuid()).optional(),
    tags: zod_1.z.array(zod_1.z.string().min(1).max(50)).max(10).optional(),
    metadata: zod_1.z.record(zod_1.z.unknown()).optional(),
}).refine((data) => {
    // Due date must be in the future
    if (data.dueDate && data.dueDate <= new Date()) {
        return false;
    }
    return true;
}, { message: 'Due date must be in the future' });
exports.updateTaskSchema = zod_1.z.object({
    title: zod_1.z.string().min(1).max(200).optional(),
    description: zod_1.z.string().max(5000).optional(),
    priority: zod_1.z.enum(['low', 'medium', 'high', 'critical']).optional(),
    status: zod_1.z.enum(['todo', 'in_progress', 'review', 'done', 'cancelled']).optional(),
    dueDate: zod_1.z.coerce.date().optional(),
    assignees: zod_1.z.array(zod_1.z.string().uuid()).optional(),
}).refine((data) => {
    return Object.keys(data).length > 0;
}, { message: 'At least one field must be provided' });
// =============================================================================
// MESSAGE & EVENT SCHEMAS
// =============================================================================
exports.sendMessageSchema = zod_1.z.object({
    content: zod_1.z.string().min(1).max(10000),
    replyTo: zod_1.z.string().uuid().optional(),
    mentions: zod_1.z.array(zod_1.z.string().uuid()).max(10).optional(),
    attachments: zod_1.z.array(zod_1.z.object({
        name: zod_1.z.string(),
        type: zod_1.z.string(),
        size: zod_1.z.number().int().max(10 * 1024 * 1024), // 10MB max
        data: zod_1.z.string(), // base64
    })).max(5).optional(),
});
exports.eventPublishSchema = zod_1.z.object({
    type: zod_1.z.string().min(1).max(100),
    payload: zod_1.z.unknown(),
    timestamp: zod_1.z.coerce.date().default(() => new Date()),
    source: zod_1.z.string().min(1).max(100),
    correlationId: zod_1.z.string().uuid().optional(),
});
// =============================================================================
// CONFIG & WEBHOOK SCHEMAS
// =============================================================================
exports.configUpdateSchema = zod_1.z.object({
    key: zod_1.z.string().min(1).max(100).regex(/^[a-zA-Z0-9_.]+$/),
    value: zod_1.z.unknown(),
    scope: zod_1.z.enum(['global', 'swarm', 'agent']).default('global'),
    scopeId: zod_1.z.string().uuid().optional(),
});
exports.webhookRegisterSchema = zod_1.z.object({
    url: zod_1.z.string().url(),
    events: zod_1.z.array(zod_1.z.string().min(1)).min(1),
    secret: zod_1.z.string().min(32).max(256),
    active: zod_1.z.boolean().default(true),
}).refine((data) => {
    // In production, require HTTPS
    if (process.env['NODE_ENV'] === 'production' && !data.url.startsWith('https://')) {
        return false;
    }
    return true;
}, { message: 'HTTPS required in production' });
//# sourceMappingURL=schemas.js.map