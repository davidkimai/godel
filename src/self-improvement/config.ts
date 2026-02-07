/**
 * Self-Improvement Team Configuration
 * 
 * This team uses Godel's own infrastructure to recursively improve itself.
 * Each agent has a specific role in the feedback loop.
 */

export interface SelfImprovementConfig {
  // Budget limits (using Godel's safety features)
  maxBudgetUSD: number;
  maxTokensPerAgent: number;
  
  // Safety boundaries
  allowedOperations: string[];
  forbiddenPatterns: string[];
  
  // Self-improvement targets
  targetMetrics: {
    testCoverageIncrease: number;
    bugReductionPercent: number;
    performanceImprovementPercent: number;
    documentationCompletePercent: number;
  };
}

export const SELF_IMPROVEMENT_CONFIG: SelfImprovementConfig = {
  maxBudgetUSD: 10.0, // Conservative budget for self-improvement
  maxTokensPerAgent: 100000, // ~$0.01 with current pricing
  
  allowedOperations: [
    'file_read',
    'file_write',
    'code_refactor',
    'test_write',
    'docs_write',
    'git_commit'
  ],
  
  forbiddenPatterns: [
    'rm -rf.*node_modules',
    'rm -rf.*dist',
    'rm -rf.*.git',
    'chmod 777.*',
    'curl.*\|.*sh'
  ],
  
  targetMetrics: {
    testCoverageIncrease: 5, // Target 5% increase per iteration
    bugReductionPercent: 10, // Target 10% bug reduction
    performanceImprovementPercent: 2, // Target 2% perf improvement
    documentationCompletePercent: 95 // Target 95% docs complete
  }
};

// Team definitions for recursive self-improvement
export const SELF_IMPROVEMENT_TEAMS = {
  codeQuality: {
    name: 'self-improvement-code-quality',
    agents: [
      {
        role: 'code-analyzer',
        task: 'Analyze codebase for code quality issues, debt, and improvement opportunities',
        model: 'claude-sonnet-4-5',
        budgetLimit: 0.50
      },
      {
        role: 'refactor-agent',
        task: 'Refactor identified code quality issues following best practices',
        model: 'claude-sonnet-4-5',
        budgetLimit: 1.00
      },
      {
        role: 'test-agent',
        task: 'Write or improve tests for refactored code',
        model: 'kimi-coding/k2p5',
        budgetLimit: 0.50
      }
    ],
    parallelism: 2
  },
  
  documentation: {
    name: 'self-improvement-documentation',
    agents: [
      {
        role: 'docs-auditor',
        task: 'Audit documentation completeness and identify gaps',
        model: 'kimi-coding/k2p5',
        budgetLimit: 0.25
      },
      {
        role: 'docs-writer',
        task: 'Fill documentation gaps with clear, accurate documentation',
        model: 'kimi-coding/k2p5',
        budgetLimit: 0.75
      }
    ],
    parallelism: 2
  },
  
  testing: {
    name: 'self-improvement-testing',
    agents: [
      {
        role: 'coverage-analyzer',
        task: 'Analyze test coverage and identify low-coverage areas',
        model: 'kimi-coding/k2p5',
        budgetLimit: 0.25
      },
      {
        role: 'test-generator',
        task: 'Generate tests for low-coverage areas',
        model: 'kimi-coding/k2p5',
        budgetLimit: 1.00
      }
    ],
    parallelism: 1
  }
};
