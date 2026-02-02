/**
 * Self-Improvement Swarm Configuration
 *
 * This swarm uses Dash's own infrastructure to recursively improve itself.
 * Each agent has a specific role in the feedback loop.
 */
export interface SelfImprovementConfig {
    maxBudgetUSD: number;
    maxTokensPerAgent: number;
    allowedOperations: string[];
    forbiddenPatterns: string[];
    targetMetrics: {
        testCoverageIncrease: number;
        bugReductionPercent: number;
        performanceImprovementPercent: number;
        documentationCompletePercent: number;
    };
}
export declare const SELF_IMPROVEMENT_CONFIG: SelfImprovementConfig;
export declare const SELF_IMPROVEMENT_SWARMS: {
    codeQuality: {
        name: string;
        agents: {
            role: string;
            task: string;
            model: string;
            budgetLimit: number;
        }[];
        parallelism: number;
    };
    documentation: {
        name: string;
        agents: {
            role: string;
            task: string;
            model: string;
            budgetLimit: number;
        }[];
        parallelism: number;
    };
    testing: {
        name: string;
        agents: {
            role: string;
            task: string;
            model: string;
            budgetLimit: number;
        }[];
        parallelism: number;
    };
};
//# sourceMappingURL=config.d.ts.map