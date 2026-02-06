/**
 * @fileoverview Intent Module - Natural language CLI interface for Godel
 * 
 * This module provides the "godel do" command functionality, allowing users
 * to express tasks in natural language that get parsed into structured intents
 * and executed by agent swarms.
 * 
 * Usage:
 *   godel do "Implement user authentication with JWT"
 *   godel do "Fix bug in payment processing"
 *   godel do "Refactor the database layer for better performance"
 * 
 * @module @godel/cli/intent
 */

// ============================================================================
// TYPES
// ============================================================================

export {
  // Core types
  IntentType,
  ComplexityLevel,
  Intent,
  SwarmConfiguration,
  AgentRoleConfig,
  ExecutionPlan,
  
  // Parser types
  ParseResult,
  IntentPattern,
  ParserConfig,
  
  // Executor types
  ExecutionResult,
  ExecutionMetrics,
  ProgressEvent,
  ProgressCallback,
  ExecutorConfig,
  
  // Constants
  INTENT_TYPES,
  SWARM_CONFIGS,
  ESTIMATED_DURATIONS,
} from './types';

// ============================================================================
// PARSER
// ============================================================================

export {
  IntentParser,
  parseIntent,
  createParser,
  isValidIntent,
  detectIntentType,
} from './parser';

// ============================================================================
// EXECUTOR
// ============================================================================

export {
  IntentExecutor,
  executeIntent,
  createExecutor,
  generatePlan,
  estimateDuration,
  estimateCost,
} from './executor';

// ============================================================================
// TEMPLATES
// ============================================================================

export {
  loadTemplate,
  loadAllTemplates,
  getTemplateForIntentType,
  interpolateTemplate,
  generatePhasesFromTemplate,
  listTemplates,
  templateExists,
  getTemplateInfo,
  type IntentTemplate,
  type TemplatePhase,
} from './templates';

// ============================================================================
// INTEGRATION - "godel do" COMMAND
// ============================================================================

import { Command } from 'commander';
import { IntentParser } from './parser';
import { IntentExecutor } from './executor';
import { logger } from '../../utils/logger';

/**
 * Register the "do" command with the CLI.
 * 
 * @param program - Commander program instance
 */
export function registerDoCommand(program: Command): void {
  const parser = new IntentParser();
  
  program
    .command('do')
    .description('Execute a task using natural language')
    .argument('<input>', 'Natural language description of the task')
    .option('-d, --dry-run', 'Show execution plan without running')
    .option('-w, --no-worktree', 'Disable worktree isolation')
    .option('-b, --budget <amount>', 'Budget limit in USD', '10')
    .option('-t, --timeout <minutes>', 'Maximum execution time', '60')
    .option('--json', 'Output results as JSON')
    .action(async (input: string, options) => {
      try {
        // Parse the intent
        const parseResult = parser.parse(input);
        
        if (!parseResult.success || !parseResult.intent) {
          logger.error(`❌ Parse error: ${parseResult.error}`);
          logger.info('\n💡 Try commands like:');
          logger.info('   godel do "Implement user authentication"');
          logger.info('   godel do "Fix bug in payment module"');
          logger.info('   godel do "Test the API endpoints"');
          process.exit(1);
        }
        
        const { intent, confidence } = parseResult;
        
        // Display parsed intent
        if (!options.json) {
          logger.info('\n📋 Parsed Intent:');
          logger.info(`   Type: ${intent.type}`);
          logger.info(`   Subject: ${intent.subject}`);
          logger.info(`   Complexity: ${intent.complexity}`);
          logger.info(`   Confidence: ${(confidence * 100).toFixed(1)}%`);
          
          if (intent.requirements.length > 0) {
            logger.info(`   Requirements:`);
            intent.requirements.forEach(req => {
              logger.info(`      - ${req}`);
            });
          }
        }
        
        // Dry run mode - just show the plan
        if (options.dryRun) {
          const { generatePlan, estimateDuration, estimateCost } = await import('./executor');
          const plan = generatePlan(intent);
          
          if (options.json) {
            logger.info(JSON.stringify({
              intent,
              confidence,
              plan: {
                swarmConfig: {
                  name: plan.swarmConfig.name,
                  strategy: plan.swarmConfig.strategy,
                  initialAgents: plan.swarmConfig.initialAgents,
                  roles: plan.swarmConfig.roles,
                },
                estimatedDuration: plan.estimatedDuration,
              },
              estimatedCost: estimateCost(intent),
            }, null, 2));
          } else {
            logger.info('\n📊 Execution Plan (Dry Run):');
            logger.info(`   Swarm: ${plan.swarmConfig.name}`);
            logger.info(`   Strategy: ${plan.swarmConfig.strategy}`);
            logger.info(`   Agents: ${plan.swarmConfig.initialAgents}`);
            logger.info(`   Estimated Duration: ${plan.estimatedDuration} minutes`);
            logger.info(`   Estimated Cost: $${estimateCost(intent).toFixed(2)}`);
            
            logger.info('\n   Agent Roles:');
            plan.swarmConfig.roles.forEach(role => {
              logger.info(`      - ${role.role}: ${role.count} agent(s)`);
              logger.info(`        Task: ${role.task}`);
            });
          }
          
          process.exit(0);
        }
        
        // Execute the intent
        if (!options.json) {
          logger.info('\n🚀 Executing...\n');
        }
        
        const executor = new IntentExecutor({
          useWorktrees: options.worktree !== false,
          defaultBudget: parseFloat(options.budget),
          maxExecutionTime: parseInt(options.timeout),
          onProgress: (event) => {
            if (!options.json) {
              const progressBar = renderProgressBar(event.progress);
              logger.info(`\r${progressBar} ${event.message}`);
            }
          },
        });
        
        const result = await executor.execute(intent);
        
        if (options.json) {
          logger.info(JSON.stringify({
            success: result.success,
            intent,
            swarmId: result.swarmId,
            worktreeId: result.worktreeId,
            output: result.output,
            error: result.error,
            metrics: result.metrics,
          }, null, 2));
        } else {
          logger.info('\n'); // Clear progress line
          
          if (result.success) {
            logger.info('✅ Execution completed successfully!');
            if (result.output) {
              logger.info(`\nOutput: ${result.output}`);
            }
          } else {
            logger.error(`❌ Execution failed: ${result.error}`);
          }
          
          if (result.metrics) {
            logger.info('\n📊 Metrics:');
            if (result.metrics.durationMs) {
              logger.info(`   Duration: ${(result.metrics.durationMs / 1000).toFixed(2)}s`);
            }
            logger.info(`   Agents Spawned: ${result.metrics.agentsSpawned}`);
            logger.info(`   Tasks Completed: ${result.metrics.tasksCompleted}`);
            logger.info(`   Total Cost: $${result.metrics.totalCost.toFixed(4)}`);
          }
        }
        
        process.exit(result.success ? 0 : 1);
        
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        
        if (options.json) {
          logger.info(JSON.stringify({ success: false, error: message }));
        } else {
          logger.error(`❌ Error: ${message}`);
        }
        
        process.exit(1);
      }
    });
}

/**
 * Render a progress bar string.
 */
function renderProgressBar(progress: number): string {
  const width = 20;
  const filled = Math.round((progress / 100) * width);
  const empty = width - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  return `[${bar}] ${progress.toFixed(0)}%`;
}

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default {
  registerDoCommand,
};
