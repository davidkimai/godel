/**
 * @fileoverview Intent Executor - Orchestrates intent-based swarm execution
 * 
 * This module provides the main executor that ties together parsing,
 * complexity analysis, and swarm configuration to execute intents.
 * 
 * @module @godel/intent/executor
 */

import * as chalk from 'chalk';
import { IntentParser } from './parser';
import { ComplexityAnalyzer } from './complexity-analyzer';
import { SwarmConfigGenerator } from './swarm-config-generator';
import {
  ParsedIntent,
  SwarmComplexity,
  SwarmConfiguration,
  ExecutionResult,
  ExecuteOptions,
  LLMService,
  Agent,
  AgentRegistry,
  WorkflowEngine,
} from './types';

// ============================================================================
// MOCK SERVICES (for initial implementation)
// ============================================================================

class MockAgentRegistry implements AgentRegistry {
  private counter = 0;
  
  async register(config: { role: string; capabilities: { skills: string[]; specialties: string[] } }): Promise<Agent> {
    this.counter++;
    return {
      id: `agent-${this.counter}-${Date.now().toString(36)}`,
      role: config.role,
      capabilities: {
        skills: config.capabilities.skills,
        specialties: config.capabilities.specialties as any[],
      },
    };
  }
}

class MockWorkflowEngine implements WorkflowEngine {
  async start(templateId: string, context: { target: string; agents: string[]; intent: string }): Promise<string> {
    return `workflow-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }
}

// ============================================================================
// INTENT EXECUTOR CLASS
// ============================================================================

export class IntentExecutor {
  private parser: IntentParser;
  private complexityAnalyzer: ComplexityAnalyzer;
  private configGenerator: SwarmConfigGenerator;
  private agentRegistry: AgentRegistry;
  private workflowEngine: WorkflowEngine;

  constructor(
    llmService?: LLMService,
    agentRegistry?: AgentRegistry,
    workflowEngine?: WorkflowEngine
  ) {
    this.parser = new IntentParser({ 
      useLLM: !!llmService, 
      llm: llmService 
    });
    this.complexityAnalyzer = new ComplexityAnalyzer();
    this.configGenerator = new SwarmConfigGenerator();
    this.agentRegistry = agentRegistry || new MockAgentRegistry();
    this.workflowEngine = workflowEngine || new MockWorkflowEngine();
  }

  /**
   * Execute an intent from natural language input.
   * 
   * @param input - Natural language intent
   * @param options - Execution options
   * @returns Execution result
   */
  async execute(input: string, options: ExecuteOptions = {}): Promise<ExecutionResult> {
    console.log(chalk.blue(`🎯 Parsing intent: "${input}"`));

    // Step 1: Parse intent
    let intent: ParsedIntent;
    try {
      intent = await this.parser.parse(input);
      console.log(chalk.gray(`  → Task: ${intent.taskType}, Target: ${intent.target}`));
      if (intent.focus) {
        console.log(chalk.gray(`  → Focus: ${intent.focus}`));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to parse intent: ${message}`);
    }

    // Step 2: Analyze complexity
    console.log(chalk.blue(`📊 Analyzing complexity...`));
    const complexity = await this.complexityAnalyzer.analyze(
      intent.target,
      intent.targetType
    );
    console.log(chalk.gray(`  → Complexity: ${complexity.level} (${complexity.score}/100)`));
    console.log(chalk.gray(`  → Files: ${complexity.metrics.fileCount}, LOC: ${complexity.metrics.linesOfCode}`));
    console.log(chalk.gray(`  → Estimated human time: ${complexity.metrics.estimatedHours.toFixed(1)}h`));

    // Step 3: Generate swarm config
    console.log(chalk.blue(`🤖 Generating swarm configuration...`));
    const config = await this.configGenerator.generate(intent, complexity);
    
    this.displayConfig(config);

    // Check budget constraint
    if (options.budget && config.estimatedCost > options.budget) {
      throw new Error(
        `Estimated cost ($${config.estimatedCost.toFixed(2)}) exceeds budget ($${options.budget})`
    );
    }

    // Dry run - just show the plan
    if (options.dryRun) {
      console.log(chalk.yellow('\n⚠️  Dry run mode - no agents will be spawned'));
      return {
        intent,
        config,
        workflowId: 'dry-run',
        agents: [],
        status: 'completed',
      };
    }

    // Confirm if not yes mode
    if (!options.yes) {
      console.log(chalk.yellow('\n⚠️  Use --yes to execute without confirmation'));
      // In a real implementation, prompt for confirmation here
      // For now, we'll continue
    }

    // Step 4: Spawn agents
    console.log(chalk.blue(`🚀 Spawning ${config.agents.reduce((s, a) => s + a.count, 0)} agents...`));
    const spawnedAgents = await this.spawnAgents(config.agents);

    // Step 5: Execute workflow
    console.log(chalk.blue(`⚡ Executing workflow...`));
    const workflowId = await this.workflowEngine.start(config.workflow, {
      target: intent.target,
      agents: spawnedAgents.map(a => a.id),
      intent: intent.raw,
    });

    console.log(chalk.green(`\n✅ Execution started!`));
    console.log(chalk.gray(`   Workflow ID: ${workflowId}`));

    return {
      intent,
      config,
      workflowId,
      agents: spawnedAgents.map(a => ({ id: a.id, role: a.role, type: a.capabilities.specialties[0] })),
      status: 'started',
    };
  }

  /**
   * Display swarm configuration.
   */
  private displayConfig(config: SwarmConfiguration): void {
    console.log(chalk.bold('\n📋 Swarm Configuration:\n'));
    console.log(`Name: ${config.name}`);
    console.log(`Description: ${config.description}`);
    console.log(`\nAgents:`);
    
    config.agents.forEach(agent => {
      console.log(`  ${agent.count}x ${chalk.cyan(agent.role)} (${agent.type})`);
      console.log(`    Skills: ${agent.skills.join(', ')}`);
      if (agent.reasoning) {
        console.log(`    Why: ${chalk.gray(agent.reasoning)}`);
      }
    });

    console.log(`\nEstimated Cost: ${chalk.green(`$${config.estimatedCost.toFixed(2)}`)}`);
    console.log(`Estimated Time: ${chalk.yellow(`${config.estimatedTime} minutes`)}`);
    console.log(`Workflow: ${config.workflow}\n`);
  }

  /**
   * Spawn agents based on configuration.
   */
  private async spawnAgents(configs: Array<{ role: string; type: string; count: number; skills: string[] }>): Promise<Agent[]> {
    const agents: Agent[] = [];

    for (const config of configs) {
      for (let i = 0; i < config.count; i++) {
        const agent = await this.agentRegistry.register({
          role: config.role,
          capabilities: {
            skills: config.skills,
            specialties: [config.type as any],
          },
        });
        agents.push(agent);
        console.log(chalk.gray(`  Spawned ${config.role} ${i + 1}/${config.count}`));
      }
    }

    return agents;
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Execute an intent with default configuration.
 */
export async function executeIntent(
  input: string,
  options?: ExecuteOptions
): Promise<ExecutionResult> {
  const executor = new IntentExecutor();
  return executor.execute(input, options);
}

/**
 * Create an executor with custom LLM service.
 */
export function createExecutor(
  llmService?: LLMService,
  agentRegistry?: AgentRegistry,
  workflowEngine?: WorkflowEngine
): IntentExecutor {
  return new IntentExecutor(llmService, agentRegistry, workflowEngine);
}
