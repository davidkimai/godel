/**
 * Self-Improvement Orchestrator
 *
 * Uses Dash's own infrastructure to recursively improve Dash.
 * Implements the feedback loop: analyze → improve → verify → repeat
 *
 * INTEGRATION: OpenClaw Budget Tracking (Phase 2C)
 * - Tracks costs across OpenClaw agents via sessions_history
 * - Enforces per-agent and per-swarm budget limits
 * - Automatically kills agents when budgets are exhausted
 *
 * INTEGRATION: Learning Loop (Phase 4B)
 * - Uses learning data for strategy selection
 * - A/B tests improvement approaches
 * - Tracks improvement effectiveness over time
 */
import { BudgetTracker } from '../integrations/openclaw';
import { LearningEngine } from '../integrations/openclaw/LearningEngine';
import { ImprovementStore } from '../integrations/openclaw/ImprovementStore';
export interface ImprovementResult {
    success: boolean;
    area: string;
    changes: number;
    budgetUsed: number;
    metrics: {
        testCoverage?: number;
        bugsFixed?: number;
        performanceImprovement?: number;
    };
    errors: string[];
}
export interface SelfImprovementState {
    iteration: number;
    totalBudgetUsed: number;
    improvements: ImprovementResult[];
    startTime: Date;
    lastImprovementTime: Date;
    swarmId?: string;
}
export interface AgentWithBudget {
    agentId: string;
    role: string;
    model: string;
    budgetLimit: number;
    swarmId: string;
    status: 'spawning' | 'idle' | 'running' | 'completed' | 'failed' | 'killed';
    openClawSessionKey?: string;
}
export interface SelfImprovementSession {
    state: SelfImprovementState;
    budgetTracker: BudgetTracker;
    learningEngine: LearningEngine;
    improvementStore: ImprovementStore;
}
export declare function startSelfImprovementSession(): Promise<SelfImprovementSession>;
export declare function runImprovementCycle(state: SelfImprovementState, area: 'codeQuality' | 'documentation' | 'testing', budgetTracker: BudgetTracker, learningEngine?: LearningEngine, improvementStore?: ImprovementStore): Promise<ImprovementResult>;
export declare function getSelfImprovementReport(state: SelfImprovementState, budgetTracker?: BudgetTracker, learningEngine?: LearningEngine, improvementStore?: ImprovementStore): Promise<string>;
//# sourceMappingURL=orchestrator.d.ts.map