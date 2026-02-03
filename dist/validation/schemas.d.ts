import { z } from 'zod';
export declare const idSchema: z.ZodString;
export declare const uuidArraySchema: z.ZodArray<z.ZodString, "many">;
export declare const paginationSchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    perPage: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    page?: number;
    perPage?: number;
}, {
    page?: number;
    perPage?: number;
}>;
export declare const dateRangeSchema: z.ZodEffects<z.ZodObject<{
    startDate: z.ZodOptional<z.ZodDate>;
    endDate: z.ZodOptional<z.ZodDate>;
}, "strip", z.ZodTypeAny, {
    startDate?: Date;
    endDate?: Date;
}, {
    startDate?: Date;
    endDate?: Date;
}>, {
    startDate?: Date;
    endDate?: Date;
}, {
    startDate?: Date;
    endDate?: Date;
}>;
export declare const spawnAgentSchema: z.ZodEffects<z.ZodObject<{
    task: z.ZodString;
    model: z.ZodEnum<["kimi-k2.5", "claude-sonnet-4-5", "gpt-4", "gpt-4o"]>;
    priority: z.ZodDefault<z.ZodEnum<["low", "medium", "high", "critical"]>>;
    parentId: z.ZodOptional<z.ZodString>;
    swarmId: z.ZodOptional<z.ZodString>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    metadata?: Record<string, unknown>;
    task?: string;
    model?: "kimi-k2.5" | "claude-sonnet-4-5" | "gpt-4" | "gpt-4o";
    swarmId?: string;
    parentId?: string;
    priority?: "low" | "medium" | "high" | "critical";
}, {
    metadata?: Record<string, unknown>;
    task?: string;
    model?: "kimi-k2.5" | "claude-sonnet-4-5" | "gpt-4" | "gpt-4o";
    swarmId?: string;
    parentId?: string;
    priority?: "low" | "medium" | "high" | "critical";
}>, {
    metadata?: Record<string, unknown>;
    task?: string;
    model?: "kimi-k2.5" | "claude-sonnet-4-5" | "gpt-4" | "gpt-4o";
    swarmId?: string;
    parentId?: string;
    priority?: "low" | "medium" | "high" | "critical";
}, {
    metadata?: Record<string, unknown>;
    task?: string;
    model?: "kimi-k2.5" | "claude-sonnet-4-5" | "gpt-4" | "gpt-4o";
    swarmId?: string;
    parentId?: string;
    priority?: "low" | "medium" | "high" | "critical";
}>;
export declare const updateAgentSchema: z.ZodEffects<z.ZodObject<{
    status: z.ZodOptional<z.ZodEnum<["idle", "spawning", "running", "paused", "completed", "failed", "killing"]>>;
    progress: z.ZodOptional<z.ZodNumber>;
    result: z.ZodOptional<z.ZodString>;
    error: z.ZodOptional<z.ZodString>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    error?: string;
    metadata?: Record<string, unknown>;
    status?: "running" | "paused" | "completed" | "failed" | "idle" | "spawning" | "killing";
    progress?: number;
    result?: string;
}, {
    error?: string;
    metadata?: Record<string, unknown>;
    status?: "running" | "paused" | "completed" | "failed" | "idle" | "spawning" | "killing";
    progress?: number;
    result?: string;
}>, {
    error?: string;
    metadata?: Record<string, unknown>;
    status?: "running" | "paused" | "completed" | "failed" | "idle" | "spawning" | "killing";
    progress?: number;
    result?: string;
}, {
    error?: string;
    metadata?: Record<string, unknown>;
    status?: "running" | "paused" | "completed" | "failed" | "idle" | "spawning" | "killing";
    progress?: number;
    result?: string;
}>;
export declare const agentActionSchema: z.ZodEffects<z.ZodObject<{
    action: z.ZodEnum<["kill", "pause", "resume", "retry", "scale"]>;
    reason: z.ZodOptional<z.ZodString>;
    force: z.ZodDefault<z.ZodBoolean>;
    delay: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    reason?: string;
    action?: "retry" | "pause" | "resume" | "kill" | "scale";
    delay?: number;
    force?: boolean;
}, {
    reason?: string;
    action?: "retry" | "pause" | "resume" | "kill" | "scale";
    delay?: number;
    force?: boolean;
}>, {
    reason?: string;
    action?: "retry" | "pause" | "resume" | "kill" | "scale";
    delay?: number;
    force?: boolean;
}, {
    reason?: string;
    action?: "retry" | "pause" | "resume" | "kill" | "scale";
    delay?: number;
    force?: boolean;
}>;
export declare const agentQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    perPage: z.ZodDefault<z.ZodNumber>;
    swarmId: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodArray<z.ZodEnum<["idle", "spawning", "running", "paused", "completed", "failed", "killing"]>, "many">>;
}, "strip", z.ZodTypeAny, {
    status?: ("running" | "paused" | "completed" | "failed" | "idle" | "spawning" | "killing")[];
    swarmId?: string;
    page?: number;
    perPage?: number;
}, {
    status?: ("running" | "paused" | "completed" | "failed" | "idle" | "spawning" | "killing")[];
    swarmId?: string;
    page?: number;
    perPage?: number;
}>;
export declare const createSwarmSchema: z.ZodEffects<z.ZodObject<{
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    agents: z.ZodNumber;
    strategy: z.ZodDefault<z.ZodEnum<["parallel", "map-reduce", "pipeline", "race"]>>;
    budget: z.ZodOptional<z.ZodNumber>;
    config: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    description?: string;
    config?: Record<string, unknown>;
    agents?: number;
    name?: string;
    budget?: number;
    strategy?: "parallel" | "map-reduce" | "pipeline" | "race";
}, {
    description?: string;
    config?: Record<string, unknown>;
    agents?: number;
    name?: string;
    budget?: number;
    strategy?: "parallel" | "map-reduce" | "pipeline" | "race";
}>, {
    description?: string;
    config?: Record<string, unknown>;
    agents?: number;
    name?: string;
    budget?: number;
    strategy?: "parallel" | "map-reduce" | "pipeline" | "race";
}, {
    description?: string;
    config?: Record<string, unknown>;
    agents?: number;
    name?: string;
    budget?: number;
    strategy?: "parallel" | "map-reduce" | "pipeline" | "race";
}>;
export declare const updateSwarmSchema: z.ZodEffects<z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<["running", "paused", "completed", "failed"]>>;
    config: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    description?: string;
    status?: "running" | "paused" | "completed" | "failed";
    config?: Record<string, unknown>;
    name?: string;
}, {
    description?: string;
    status?: "running" | "paused" | "completed" | "failed";
    config?: Record<string, unknown>;
    name?: string;
}>, {
    description?: string;
    status?: "running" | "paused" | "completed" | "failed";
    config?: Record<string, unknown>;
    name?: string;
}, {
    description?: string;
    status?: "running" | "paused" | "completed" | "failed";
    config?: Record<string, unknown>;
    name?: string;
}>;
export declare const swarmActionSchema: z.ZodEffects<z.ZodObject<{
    action: z.ZodEnum<["pause", "resume", "cancel", "scale", "rebalance"]>;
    targetAgents: z.ZodOptional<z.ZodNumber>;
    graceful: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    action?: "pause" | "resume" | "scale" | "cancel" | "rebalance";
    targetAgents?: number;
    graceful?: boolean;
}, {
    action?: "pause" | "resume" | "scale" | "cancel" | "rebalance";
    targetAgents?: number;
    graceful?: boolean;
}>, {
    action?: "pause" | "resume" | "scale" | "cancel" | "rebalance";
    targetAgents?: number;
    graceful?: boolean;
}, {
    action?: "pause" | "resume" | "scale" | "cancel" | "rebalance";
    targetAgents?: number;
    graceful?: boolean;
}>;
export declare const swarmQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    perPage: z.ZodDefault<z.ZodNumber>;
    status: z.ZodOptional<z.ZodArray<z.ZodEnum<["running", "paused", "completed", "failed"]>, "many">>;
}, "strip", z.ZodTypeAny, {
    status?: ("running" | "paused" | "completed" | "failed")[];
    page?: number;
    perPage?: number;
}, {
    status?: ("running" | "paused" | "completed" | "failed")[];
    page?: number;
    perPage?: number;
}>;
export declare const setBudgetSchema: z.ZodEffects<z.ZodObject<{
    scopeType: z.ZodEnum<["swarm", "agent", "project", "global"]>;
    scopeId: z.ZodOptional<z.ZodString>;
    maxTokens: z.ZodOptional<z.ZodNumber>;
    maxCost: z.ZodOptional<z.ZodNumber>;
    maxRequests: z.ZodOptional<z.ZodNumber>;
    alertThreshold: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    scopeType?: "agent" | "swarm" | "project" | "global";
    scopeId?: string;
    maxTokens?: number;
    maxCost?: number;
    maxRequests?: number;
    alertThreshold?: number;
}, {
    scopeType?: "agent" | "swarm" | "project" | "global";
    scopeId?: string;
    maxTokens?: number;
    maxCost?: number;
    maxRequests?: number;
    alertThreshold?: number;
}>, {
    scopeType?: "agent" | "swarm" | "project" | "global";
    scopeId?: string;
    maxTokens?: number;
    maxCost?: number;
    maxRequests?: number;
    alertThreshold?: number;
}, {
    scopeType?: "agent" | "swarm" | "project" | "global";
    scopeId?: string;
    maxTokens?: number;
    maxCost?: number;
    maxRequests?: number;
    alertThreshold?: number;
}>;
export declare const budgetConsumptionSchema: z.ZodEffects<z.ZodObject<{
    tokensUsed: z.ZodOptional<z.ZodNumber>;
    costIncurred: z.ZodOptional<z.ZodNumber>;
    requestsMade: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    tokensUsed?: number;
    costIncurred?: number;
    requestsMade?: number;
}, {
    tokensUsed?: number;
    costIncurred?: number;
    requestsMade?: number;
}>, {
    tokensUsed?: number;
    costIncurred?: number;
    requestsMade?: number;
}, {
    tokensUsed?: number;
    costIncurred?: number;
    requestsMade?: number;
}>;
export declare const budgetQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    perPage: z.ZodDefault<z.ZodNumber>;
    scopeType: z.ZodOptional<z.ZodEnum<["swarm", "agent", "project", "global"]>>;
}, "strip", z.ZodTypeAny, {
    scopeType?: "agent" | "swarm" | "project" | "global";
    page?: number;
    perPage?: number;
}, {
    scopeType?: "agent" | "swarm" | "project" | "global";
    page?: number;
    perPage?: number;
}>;
export declare const createTaskSchema: z.ZodEffects<z.ZodObject<{
    title: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    priority: z.ZodDefault<z.ZodEnum<["low", "medium", "high", "critical"]>>;
    dueDate: z.ZodOptional<z.ZodDate>;
    assignees: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    metadata?: Record<string, unknown>;
    description?: string;
    title?: string;
    priority?: "low" | "medium" | "high" | "critical";
    dueDate?: Date;
    assignees?: string[];
    tags?: string[];
}, {
    metadata?: Record<string, unknown>;
    description?: string;
    title?: string;
    priority?: "low" | "medium" | "high" | "critical";
    dueDate?: Date;
    assignees?: string[];
    tags?: string[];
}>, {
    metadata?: Record<string, unknown>;
    description?: string;
    title?: string;
    priority?: "low" | "medium" | "high" | "critical";
    dueDate?: Date;
    assignees?: string[];
    tags?: string[];
}, {
    metadata?: Record<string, unknown>;
    description?: string;
    title?: string;
    priority?: "low" | "medium" | "high" | "critical";
    dueDate?: Date;
    assignees?: string[];
    tags?: string[];
}>;
export declare const updateTaskSchema: z.ZodEffects<z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    priority: z.ZodOptional<z.ZodEnum<["low", "medium", "high", "critical"]>>;
    status: z.ZodOptional<z.ZodEnum<["todo", "in_progress", "review", "done", "cancelled"]>>;
    dueDate: z.ZodOptional<z.ZodDate>;
    assignees: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    description?: string;
    status?: "in_progress" | "cancelled" | "todo" | "review" | "done";
    title?: string;
    priority?: "low" | "medium" | "high" | "critical";
    dueDate?: Date;
    assignees?: string[];
}, {
    description?: string;
    status?: "in_progress" | "cancelled" | "todo" | "review" | "done";
    title?: string;
    priority?: "low" | "medium" | "high" | "critical";
    dueDate?: Date;
    assignees?: string[];
}>, {
    description?: string;
    status?: "in_progress" | "cancelled" | "todo" | "review" | "done";
    title?: string;
    priority?: "low" | "medium" | "high" | "critical";
    dueDate?: Date;
    assignees?: string[];
}, {
    description?: string;
    status?: "in_progress" | "cancelled" | "todo" | "review" | "done";
    title?: string;
    priority?: "low" | "medium" | "high" | "critical";
    dueDate?: Date;
    assignees?: string[];
}>;
export declare const sendMessageSchema: z.ZodObject<{
    content: z.ZodString;
    replyTo: z.ZodOptional<z.ZodString>;
    mentions: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    attachments: z.ZodOptional<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        type: z.ZodString;
        size: z.ZodNumber;
        data: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        name?: string;
        type?: string;
        data?: string;
        size?: number;
    }, {
        name?: string;
        type?: string;
        data?: string;
        size?: number;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    content?: string;
    attachments?: {
        name?: string;
        type?: string;
        data?: string;
        size?: number;
    }[];
    replyTo?: string;
    mentions?: string[];
}, {
    content?: string;
    attachments?: {
        name?: string;
        type?: string;
        data?: string;
        size?: number;
    }[];
    replyTo?: string;
    mentions?: string[];
}>;
export declare const eventPublishSchema: z.ZodObject<{
    type: z.ZodString;
    payload: z.ZodUnknown;
    timestamp: z.ZodDefault<z.ZodDate>;
    source: z.ZodString;
    correlationId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    timestamp?: Date;
    source?: string;
    payload?: unknown;
    type?: string;
    correlationId?: string;
}, {
    timestamp?: Date;
    source?: string;
    payload?: unknown;
    type?: string;
    correlationId?: string;
}>;
export declare const configUpdateSchema: z.ZodObject<{
    key: z.ZodString;
    value: z.ZodUnknown;
    scope: z.ZodDefault<z.ZodEnum<["global", "swarm", "agent"]>>;
    scopeId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    key?: string;
    value?: unknown;
    scopeId?: string;
    scope?: "agent" | "swarm" | "global";
}, {
    key?: string;
    value?: unknown;
    scopeId?: string;
    scope?: "agent" | "swarm" | "global";
}>;
export declare const webhookRegisterSchema: z.ZodEffects<z.ZodObject<{
    url: z.ZodString;
    events: z.ZodArray<z.ZodString, "many">;
    secret: z.ZodString;
    active: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    secret?: string;
    active?: boolean;
    url?: string;
    events?: string[];
}, {
    secret?: string;
    active?: boolean;
    url?: string;
    events?: string[];
}>, {
    secret?: string;
    active?: boolean;
    url?: string;
    events?: string[];
}, {
    secret?: string;
    active?: boolean;
    url?: string;
    events?: string[];
}>;
export type SpawnAgentInput = z.infer<typeof spawnAgentSchema>;
export type UpdateAgentInput = z.infer<typeof updateAgentSchema>;
export type AgentActionInput = z.infer<typeof agentActionSchema>;
export type AgentQueryInput = z.infer<typeof agentQuerySchema>;
export type CreateSwarmInput = z.infer<typeof createSwarmSchema>;
export type UpdateSwarmInput = z.infer<typeof updateSwarmSchema>;
export type SwarmActionInput = z.infer<typeof swarmActionSchema>;
export type SwarmQueryInput = z.infer<typeof swarmQuerySchema>;
export type SetBudgetInput = z.infer<typeof setBudgetSchema>;
export type BudgetConsumptionInput = z.infer<typeof budgetConsumptionSchema>;
export type BudgetQueryInput = z.infer<typeof budgetQuerySchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type EventPublishInput = z.infer<typeof eventPublishSchema>;
export type ConfigUpdateInput = z.infer<typeof configUpdateSchema>;
export type WebhookRegisterInput = z.infer<typeof webhookRegisterSchema>;
//# sourceMappingURL=schemas.d.ts.map