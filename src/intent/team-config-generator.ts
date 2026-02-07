/**
 * @fileoverview Team Config Generator - Automatic team configuration from intent
 * 
 * This module generates optimal team configurations based on parsed intent
 * and complexity analysis.
 * 
 * @module @godel/intent/team-config-generator
 */

import {
  ParsedIntent,
  TeamComplexity,
  TeamConfiguration,
  AgentConfig,
  AgentType,
  TaskType,
  WorkflowTemplate,
  WorkflowTemplateLibrary,
} from './types';

// ============================================================================
// DEFAULT TEMPLATES
// ============================================================================

const DEFAULT_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'refactor',
    name: 'Refactoring Workflow',
    description: 'Structured refactoring with design validation',
    taskTypes: ['refactor'],
    phases: [
      { name: 'analyze', description: 'Analyze current structure', requiredRoles: ['architect'], order: 1 },
      { name: 'design', description: 'Design refactoring approach', requiredRoles: ['architect'], order: 2 },
      { name: 'implement', description: 'Execute refactoring', requiredRoles: ['implementer'], order: 3 },
      { name: 'review', description: 'Validate changes', requiredRoles: ['reviewer'], order: 4 },
    ],
  },
  {
    id: 'implement',
    name: 'Feature Implementation',
    description: 'End-to-end feature development',
    taskTypes: ['implement'],
    phases: [
      { name: 'design', description: 'Design the feature', requiredRoles: ['architect'], order: 1 },
      { name: 'implement', description: 'Implement the feature', requiredRoles: ['implementer'], order: 2 },
      { name: 'test', description: 'Write and run tests', requiredRoles: ['tester'], order: 3 },
      { name: 'review', description: 'Code review', requiredRoles: ['reviewer'], order: 4 },
    ],
  },
  {
    id: 'fix',
    name: 'Bug Fix Workflow',
    description: 'Systematic bug investigation and resolution',
    taskTypes: ['fix'],
    phases: [
      { name: 'investigate', description: 'Identify root cause', requiredRoles: ['specialist'], order: 1 },
      { name: 'reproduce', description: 'Create reproduction test', requiredRoles: ['tester'], order: 2 },
      { name: 'fix', description: 'Implement fix', requiredRoles: ['implementer'], order: 3 },
      { name: 'regression', description: 'Verify no regressions', requiredRoles: ['tester'], order: 4 },
    ],
  },
  {
    id: 'test',
    name: 'Test Development',
    description: 'Comprehensive test coverage',
    taskTypes: ['test'],
    phases: [
      { name: 'plan', description: 'Plan test strategy', requiredRoles: ['architect'], order: 1 },
      { name: 'write', description: 'Write tests', requiredRoles: ['tester'], order: 2 },
      { name: 'review', description: 'Review test quality', requiredRoles: ['reviewer'], order: 3 },
    ],
  },
  {
    id: 'review',
    name: 'Code Review',
    description: 'Thorough code review and analysis',
    taskTypes: ['review'],
    phases: [
      { name: 'analyze', description: 'Analyze code structure', requiredRoles: ['architect'], order: 1 },
      { name: 'review', description: 'Detailed review', requiredRoles: ['reviewer'], order: 2 },
      { name: 'feedback', description: 'Compile feedback', requiredRoles: ['architect'], order: 3 },
    ],
  },
  {
    id: 'document',
    name: 'Documentation',
    description: 'Create comprehensive documentation',
    taskTypes: ['document'],
    phases: [
      { name: 'analyze', description: 'Analyze codebase', requiredRoles: ['architect'], order: 1 },
      { name: 'write', description: 'Write documentation', requiredRoles: ['implementer'], order: 2 },
      { name: 'review', description: 'Review accuracy', requiredRoles: ['reviewer'], order: 3 },
    ],
  },
  {
    id: 'analyze',
    name: 'Code Analysis',
    description: 'Deep code analysis and investigation',
    taskTypes: ['analyze'],
    phases: [
      { name: 'explore', description: 'Explore codebase', requiredRoles: ['architect'], order: 1 },
      { name: 'analyze', description: 'Perform analysis', requiredRoles: ['specialist'], order: 2 },
      { name: 'report', description: 'Generate report', requiredRoles: ['architect'], order: 3 },
    ],
  },
];

// ============================================================================
// DEFAULT TEMPLATE LIBRARY
// ============================================================================

class DefaultTemplateLibrary implements WorkflowTemplateLibrary {
  private templates: Map<string, WorkflowTemplate> = new Map();

  constructor() {
    DEFAULT_TEMPLATES.forEach(t => this.templates.set(t.id, t));
  }

  getTemplate(id: string): WorkflowTemplate | undefined {
    return this.templates.get(id);
  }

  findTemplateForIntent(intent: ParsedIntent): WorkflowTemplate | undefined {
    return DEFAULT_TEMPLATES.find(t => t.taskTypes.includes(intent.taskType));
  }
}

// ============================================================================
// TEAM CONFIG GENERATOR CLASS
// ============================================================================

export class TeamConfigGenerator {
  private templates: WorkflowTemplateLibrary;

  constructor(templates?: WorkflowTemplateLibrary) {
    this.templates = templates || new DefaultTemplateLibrary();
  }

  /**
   * Generate team configuration from intent and complexity.
   * 
   * @param intent - Parsed intent
   * @param complexity - Complexity assessment
   * @returns Team configuration
   */
  async generate(intent: ParsedIntent, complexity: TeamComplexity): Promise<TeamConfiguration> {
    const config: TeamConfiguration = {
      name: this.generateName(intent),
      description: this.generateDescription(intent, complexity),
      agents: [],
      workflow: this.selectWorkflow(intent),
      estimatedCost: 0,
      estimatedTime: 0,
      complexity,
    };

    // Generate agents based on task type
    switch (intent.taskType) {
      case 'refactor':
        config.agents = this.generateRefactorTeam(complexity, intent);
        break;
      case 'implement':
        config.agents = this.generateImplementationTeam(complexity, intent);
        break;
      case 'fix':
        config.agents = this.generateBugFixTeam(complexity, intent);
        break;
      case 'test':
        config.agents = this.generateTestTeam(complexity, intent);
        break;
      case 'review':
        config.agents = this.generateReviewTeam(complexity, intent);
        break;
      case 'document':
        config.agents = this.generateDocumentTeam(complexity, intent);
        break;
      case 'analyze':
        config.agents = this.generateAnalysisTeam(complexity, intent);
        break;
      default:
        config.agents = this.generateGenericTeam(complexity);
    }

    // Calculate estimates
    config.estimatedCost = this.estimateCost(config.agents);
    config.estimatedTime = this.estimateTime(config.agents, complexity);

    return config;
  }

  /**
   * Generate refactoring team configuration.
   */
  private generateRefactorTeam(complexity: TeamComplexity, intent: ParsedIntent): AgentConfig[] {
    const agents: AgentConfig[] = [];

    // Always need an architect for design decisions
    agents.push({
      role: 'Lead Architect',
      type: 'architect',
      count: 1,
      skills: ['design-patterns', 'architecture', intent.focus || 'general'].filter(Boolean),
      model: 'claude-sonnet-4-5',
      reasoning: 'Designs refactoring approach and validates structural changes',
    });

    // Implementation agents based on complexity
    const implementerCount = this.calculateWorkerCount(complexity, 2, 5);
    agents.push({
      role: 'Refactoring Specialist',
      type: 'implementer',
      count: implementerCount,
      skills: ['refactoring', 'typescript', 'code-quality'],
      model: 'claude-sonnet-4-5',
      reasoning: `Executes refactoring across ${complexity.metrics.fileCount} files`,
    });

    // Reviewer for quality gate
    agents.push({
      role: 'Code Reviewer',
      type: 'reviewer',
      count: 1,
      skills: ['code-review', 'testing', 'quality-assurance'],
      model: 'claude-sonnet-4-5',
      reasoning: 'Validates changes meet quality standards',
    });

    return agents;
  }

  /**
   * Generate implementation team configuration.
   */
  private generateImplementationTeam(complexity: TeamComplexity, intent: ParsedIntent): AgentConfig[] {
    const agents: AgentConfig[] = [];

    // Architect for design
    agents.push({
      role: 'Solution Architect',
      type: 'architect',
      count: 1,
      skills: ['system-design', 'architecture', intent.focus || 'feature-design'].filter(Boolean),
      model: 'claude-sonnet-4-5',
      reasoning: 'Designs solution architecture and integration points',
    });

    // Implementers
    const implementerCount = this.calculateWorkerCount(complexity, 1, 4);
    agents.push({
      role: 'Implementation Engineer',
      type: 'implementer',
      count: implementerCount,
      skills: ['implementation', 'typescript', 'problem-solving'],
      model: 'claude-sonnet-4-5',
      reasoning: 'Implements the feature according to design',
    });

    // Tester
    if (complexity.level !== 'low') {
      agents.push({
        role: 'Test Engineer',
        type: 'tester',
        count: 1,
        skills: ['testing', 'jest', 'quality-assurance'],
        reasoning: 'Ensures feature is properly tested',
      });
    }

    // Reviewer
    agents.push({
      role: 'Code Reviewer',
      type: 'reviewer',
      count: 1,
      skills: ['code-review', 'best-practices'],
      reasoning: 'Reviews implementation for quality',
    });

    return agents;
  }

  /**
   * Generate bug fix team configuration.
   */
  private generateBugFixTeam(complexity: TeamComplexity, intent: ParsedIntent): AgentConfig[] {
    return [
      {
        role: 'Bug Investigator',
        type: 'specialist',
        count: 1,
        skills: ['debugging', 'root-cause-analysis'],
        model: 'claude-sonnet-4-5',
        reasoning: 'Identifies root cause of the bug',
      },
      {
        role: 'Test Writer',
        type: 'tester',
        count: 1,
        skills: ['testing', 'jest', 'reproduction'],
        reasoning: 'Writes reproduction test for the bug',
      },
      {
        role: 'Fix Implementer',
        type: 'implementer',
        count: 1,
        skills: ['implementation', 'typescript'],
        reasoning: 'Implements the fix',
      },
      {
        role: 'Regression Tester',
        type: 'tester',
        count: 1,
        skills: ['testing', 'regression-testing'],
        reasoning: 'Ensures fix does not break existing functionality',
      },
    ];
  }

  /**
   * Generate test team configuration.
   */
  private generateTestTeam(complexity: TeamComplexity, intent: ParsedIntent): AgentConfig[] {
    const agents: AgentConfig[] = [];

    // Test lead for strategy
    agents.push({
      role: 'Test Lead',
      type: 'architect',
      count: 1,
      skills: ['test-strategy', 'test-architecture'],
      reasoning: 'Defines test strategy and coverage goals',
    });

    // Test writers
    const testerCount = this.calculateWorkerCount(complexity, 1, 3);
    agents.push({
      role: 'Test Developer',
      type: 'tester',
      count: testerCount,
      skills: ['testing', 'jest', 'typescript', 'test-coverage'],
      reasoning: 'Writes comprehensive tests',
    });

    return agents;
  }

  /**
   * Generate review team configuration.
   */
  private generateReviewTeam(complexity: TeamComplexity, intent: ParsedIntent): AgentConfig[] {
    return [
      {
        role: 'Lead Reviewer',
        type: 'architect',
        count: 1,
        skills: ['code-review', 'architecture-review', 'security-review'],
        model: 'claude-sonnet-4-5',
        reasoning: 'Reviews architectural decisions and overall design',
      },
      {
        role: 'Code Reviewer',
        type: 'reviewer',
        count: complexity.level === 'high' || complexity.level === 'very-high' ? 2 : 1,
        skills: ['code-review', 'best-practices', 'performance-analysis'],
        model: 'claude-sonnet-4-5',
        reasoning: 'Performs detailed code review',
      },
    ];
  }

  /**
   * Generate documentation team configuration.
   */
  private generateDocumentTeam(complexity: TeamComplexity, intent: ParsedIntent): AgentConfig[] {
    return [
      {
        role: 'Technical Writer',
        type: 'architect',
        count: 1,
        skills: ['technical-writing', 'documentation', 'api-docs'],
        reasoning: 'Analyzes codebase and structures documentation',
      },
      {
        role: 'Documentation Engineer',
        type: 'implementer',
        count: 1,
        skills: ['documentation', 'markdown', 'code-examples'],
        reasoning: 'Writes documentation content',
      },
      {
        role: 'Review Editor',
        type: 'reviewer',
        count: 1,
        skills: ['editing', 'technical-review'],
        reasoning: 'Reviews documentation for accuracy and clarity',
      },
    ];
  }

  /**
   * Generate analysis team configuration.
   */
  private generateAnalysisTeam(complexity: TeamComplexity, intent: ParsedIntent): AgentConfig[] {
    return [
      {
        role: 'Principal Analyst',
        type: 'architect',
        count: 1,
        skills: ['code-analysis', 'architecture-analysis', 'system-design'],
        model: 'claude-sonnet-4-5',
        reasoning: 'Provides high-level architectural analysis',
      },
      {
        role: 'Code Analyst',
        type: 'specialist',
        count: complexity.level === 'high' || complexity.level === 'very-high' ? 2 : 1,
        skills: ['code-analysis', 'performance-analysis', 'security-analysis'],
        reasoning: 'Performs detailed code analysis',
      },
    ];
  }

  /**
   * Generate generic team configuration.
   */
  private generateGenericTeam(complexity: TeamComplexity): AgentConfig[] {
    return [
      {
        role: 'Task Coordinator',
        type: 'architect',
        count: 1,
        skills: ['coordination', 'planning'],
        reasoning: 'Coordinates task execution',
      },
      {
        role: 'Worker',
        type: 'implementer',
        count: this.calculateWorkerCount(complexity, 1, 3),
        skills: ['implementation', 'problem-solving'],
        reasoning: 'Executes task',
      },
    ];
  }

  /**
   * Calculate worker count based on complexity.
   */
  private calculateWorkerCount(complexity: TeamComplexity, min: number, max: number): number {
    // Base count on file count
    const baseCount = Math.ceil(complexity.metrics.fileCount / 5);
    
    // Adjust based on complexity level
    const complexityMultiplier = {
      'low': 1,
      'medium': 1.5,
      'high': 2,
      'very-high': 2.5,
    }[complexity.level];
    
    const adjusted = Math.ceil(baseCount * complexityMultiplier);
    
    return Math.max(min, Math.min(max, adjusted));
  }

  /**
   * Select workflow template for intent.
   */
  private selectWorkflow(intent: ParsedIntent): string {
    const template = this.templates.findTemplateForIntent(intent);
    return template?.id || 'implement';
  }

  /**
   * Generate team name.
   */
  private generateName(intent: ParsedIntent): string {
    const taskNames: Record<TaskType, string> = {
      refactor: 'Refactoring',
      implement: 'Implementation',
      fix: 'Bug Fix',
      test: 'Testing',
      review: 'Review',
      document: 'Documentation',
      analyze: 'Analysis',
    };
    
    return `${taskNames[intent.taskType]}: ${intent.target}`;
  }

  /**
   * Generate team description.
   */
  private generateDescription(intent: ParsedIntent, complexity: TeamComplexity): string {
    let desc = `${intent.taskType} task targeting ${intent.target}`;
    
    if (intent.focus) {
      desc += ` with focus on ${intent.focus}`;
    }
    
    desc += `. Complexity: ${complexity.level} (${complexity.score}/100)`;
    
    return desc;
  }

  /**
   * Estimate cost for agents.
   */
  private estimateCost(agents: AgentConfig[]): number {
    // $2.50 per agent per hour, 30 minutes average
    const hourlyRate = 2.50;
    const estimatedHours = 0.5;
    
    const totalAgents = agents.reduce((sum, a) => sum + a.count, 0);
    return Math.round(totalAgents * hourlyRate * estimatedHours * 100) / 100;
  }

  /**
   * Estimate time for execution.
   */
  private estimateTime(agents: AgentConfig[], complexity: TeamComplexity): number {
    // Base time
    const baseTime = 10; // 10 minutes
    
    // Complexity multiplier
    const complexityMultiplier = complexity.score / 50; // 0.5x to 2x
    
    // Agent overhead
    const totalAgents = agents.reduce((sum, a) => sum + a.count, 0);
    const agentOverhead = 1 + (totalAgents * 0.05); // 5% per agent
    
    return Math.ceil(baseTime * complexityMultiplier * agentOverhead);
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Generate team configuration.
 */
export async function generateTeamConfig(
  intent: ParsedIntent,
  complexity: TeamComplexity
): Promise<TeamConfiguration> {
  const generator = new TeamConfigGenerator();
  return generator.generate(intent, complexity);
}
