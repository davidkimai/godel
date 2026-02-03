"use strict";
/**
 * Agent Model
 *
 * Core data model representing an agent in the Mission Control system.
 * Includes status, model, task, context, reasoning, and safety boundaries.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentStatus = void 0;
exports.createAgent = createAgent;
/**
 * Possible states for an agent
 */
/* eslint-disable no-unused-vars, @typescript-eslint/no-unused-vars */
var AgentStatus;
(function (AgentStatus) {
    /** Agent has been created but not yet started */
    AgentStatus["PENDING"] = "pending";
    /** Agent is actively running */
    AgentStatus["RUNNING"] = "running";
    /** Agent is paused */
    AgentStatus["PAUSED"] = "paused";
    /** Agent has completed successfully */
    AgentStatus["COMPLETED"] = "completed";
    /** Agent has failed */
    AgentStatus["FAILED"] = "failed";
    /** Agent is blocked by dependencies (reserved for future use) */
    AgentStatus["BLOCKED"] = "blocked";
    /** Agent has been killed manually */
    AgentStatus["KILLED"] = "killed";
})(AgentStatus || (exports.AgentStatus = AgentStatus = {}));
/**
 * Creates a new Agent instance
 *
 * @param options - Agent creation options
 * @returns A new Agent instance
 *
 * @example
 * ```typescript
 * const agent = createAgent({
 *   model: 'kimi-k2.5',
 *   task: 'Implement user authentication',
 *   label: 'Auth Agent',
 *   maxRetries: 3
 * });
 * ```
 */
function createAgent(options) {
    const id = options.id || `agent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date();
    const initialContext = options.contextItems || [];
    return {
        id,
        label: options.label,
        status: AgentStatus.PENDING,
        model: options.model,
        task: options.task,
        spawnedAt: now,
        runtime: 0,
        swarmId: options.swarmId,
        parentId: options.parentId,
        childIds: [],
        context: {
            inputContext: initialContext,
            outputContext: [],
            sharedContext: [],
            contextSize: initialContext.length,
            contextWindow: 100000, // Default context window
            contextUsage: 0
        },
        code: options.language ? {
            language: options.language,
            fileTree: {
                name: 'root',
                path: '/',
                type: 'directory',
                children: {}
            },
            dependencies: { dependencies: {} },
            symbolIndex: { symbols: {} }
        } : undefined,
        reasoning: {
            traces: [],
            decisions: [],
            confidence: 1.0
        },
        retryCount: 0,
        maxRetries: options.maxRetries ?? 3,
        lastError: undefined,
        budgetLimit: options.budgetLimit,
        metadata: {}
    };
}
//# sourceMappingURL=agent.js.map