/**
 * Federation CLI Commands
 *
 * Commands for managing agent federation and task orchestration:
 * - godel federation decompose <task>    Decompose a task into subtasks
 * - godel federation execute <task>      Execute a task with federation
 * - godel federation agents              List registered agents
 * - godel federation status              Show federation status
 * - godel federation autoscale           Manage auto-scaling
 */

import { Command } from 'commander';
import { logger } from '../../utils/logger';
import { getGlobalClient } from '../lib/client';
import { TaskDecomposer } from '../../federation/task-decomposer';
import { DependencyResolver } from '../../federation/dependency-resolver';
import { 
  ExecutionEngine, 
  InMemoryAgentSelector, 
  InMemoryTaskExecutor 
} from '../../federation/execution-engine';
import type { OutputFormat } from '../lib/output';
import type { AgentSelectionCriteria } from '../../federation/types';

export function registerFederationCommand(program: Command): void {
  const federation = program
    .command('federation')
    .description('Manage agent federation and task orchestration');

  // ============================================================================
  // federation decompose
  // ============================================================================
  federation
    .command('decompose')
    .description('Decompose a task into parallelizable subtasks')
    .argument('<task>', 'Task description to decompose')
    .option('-s, --strategy <strategy>', 'Decomposition strategy', 'component-based')
    .option('-m, --max-parallelism <count>', 'Maximum parallel subtasks', '10')
    .option('--use-llm', 'Use LLM-assisted decomposition')
    .option('--json', 'Output as JSON')
    .action(async (task, options) => {
      try {
        logger.info('🔍 Decomposing task...\n');
        logger.info(`   Task: ${task}`);
        logger.info(`   Strategy: ${options.strategy}`);
        if (options.useLlm) logger.info(`   Using LLM: Yes`);

        const decomposer = new TaskDecomposer();
        const result = await decomposer.decompose(task, undefined, {
          strategy: options.strategy,
          maxParallelism: parseInt(options.maxParallelism, 10),
          minSubtaskSize: 1,
          useLLM: options.useLlm,
        });

        if (options.json) {
          console.log(JSON.stringify({
            success: true,
            task,
            subtasks: result.subtasks,
            executionLevels: result.executionLevels,
            parallelizationRatio: result.parallelizationRatio,
            totalComplexity: result.totalComplexity,
            strategyUsed: result.strategyUsed,
          }, null, 2));
          return;
        }

        logger.info(`\n📋 Decomposition Results:`);
        logger.info(`   Subtasks: ${result.subtasks.length}`);
        logger.info(`   Parallel Levels: ${result.executionLevels.length}`);
        logger.info(`   Parallelization Ratio: ${(result.parallelizationRatio * 100).toFixed(1)}%`);
        logger.info(`   Total Complexity: ${result.totalComplexity}`);
        logger.info(`   Strategy: ${result.strategyUsed}`);

        logger.info(`\n📊 Execution Plan (${result.executionLevels.length} levels):\n`);
        
        result.executionLevels.forEach((level, i) => {
          logger.info(`   Level ${i + 1} (${level.length} parallel tasks):`);
          level.forEach(subtask => {
            const complexityEmoji = subtask.estimatedComplexity === 'high' ? '🔴' : 
                                   subtask.estimatedComplexity === 'medium' ? '🟡' : '🟢';
            logger.info(`     ${complexityEmoji} ${subtask.title}`);
            if (subtask.dependencies.length > 0) {
              logger.info(`        Dependencies: ${subtask.dependencies.join(', ')}`);
            }
            if (subtask.component) {
              logger.info(`        Component: ${subtask.component}`);
            }
          });
          logger.info('');
        });

      } catch (error) {
        logger.error('❌ Decomposition failed:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // ============================================================================
  // federation execute
  // ============================================================================
  federation
    .command('execute')
    .description('Execute a task using federation (decompose + parallel execution)')
    .argument('<task>', 'Task to execute')
    .option('-a, --agents <count>', 'Maximum agents to use', '10')
    .option('--strategy <strategy>', 'Load balancing strategy', 'balanced')
    .option('--decomposition <strategy>', 'Decomposition strategy', 'component-based')
    .option('--budget <amount>', 'Max cost budget in USD', '5.00')
    .option('-w, --watch', 'Watch execution progress')
    .option('--dry-run', 'Show plan without executing')
    .action(async (task, options) => {
      try {
        logger.info('🚀 Federation Execution\n');
        logger.info(`   Task: ${task}`);
        logger.info(`   Max Agents: ${options.agents}`);
        logger.info(`   Strategy: ${options.strategy}`);
        logger.info(`   Budget: $${options.budget}\n`);

        // Step 1: Decompose the task
        logger.info('Step 1: Decomposing task...');
        const decomposer = new TaskDecomposer();
        const decomposition = await decomposer.decompose(task, undefined, {
          strategy: options.decomposition,
          maxParallelism: parseInt(options.agents, 10),
        });

        logger.info(`   ✓ Decomposed into ${decomposition.subtasks.length} subtasks`);
        logger.info(`   ✓ ${decomposition.executionLevels.length} parallel execution levels`);
        logger.info(`   ✓ ${(decomposition.parallelizationRatio * 100).toFixed(1)}% parallelization efficiency\n`);

        if (options.dryRun) {
          logger.info('📋 Execution Plan (dry run):\n');
          decomposition.executionLevels.forEach((level, i) => {
            logger.info(`   Level ${i + 1}:`);
            level.forEach(st => logger.info(`     - ${st.title}`));
          });
          return;
        }

        // Step 2: Initialize federation components
        logger.info('Step 2: Initializing federation components...');
        
        // Create mock agents for demo
        const mockAgents = Array.from({ length: parseInt(options.agents, 10) }, (_, i) => ({
          id: `agent-${i + 1}`,
          name: `Agent ${i + 1}`,
          skills: ['typescript', 'javascript', 'testing'],
          estimatedCost: 0.50,
          estimatedLatency: 1000,
        }));
        
        const selector = new InMemoryAgentSelector(mockAgents);
        
        logger.info('   ✓ Agent selector initialized');
        logger.info(`   ✓ ${mockAgents.length} agents ready\n`);

        // Step 3: Build execution plan
        logger.info('Step 3: Building execution plan...');
        const resolver = new DependencyResolver();
        resolver.buildGraph(decomposition.subtasks.map(st => ({
          id: st.id,
          task: {
            id: st.id,
            name: st.title,
            description: st.description,
            requiredSkills: st.requiredCapabilities || [],
            priority: 'medium',
          },
          dependencies: st.dependencies,
        })));

        const plan = resolver.getExecutionPlan();
        logger.info(`   ✓ Execution plan ready`);
        logger.info(`   ✓ Estimated parallelism: ${plan.estimatedParallelism}x\n`);

        // Step 4: Execute
        logger.info('Step 4: Executing tasks...\n');
        const startTime = Date.now();

        // Create task executor
        const executor: import('../../federation/types').TaskExecutor = {
          execute: async (agentId: string, subtask) => {
            logger.info(`   ▶️  [${agentId}] Executing: ${subtask.name}`);
            // Simulate execution
            await new Promise(resolve => setTimeout(resolve, 100));
            logger.info(`   ✅ [${agentId}] Completed: ${subtask.name}`);
            return { success: true };
          },
          cancel: async () => true,
        };

        const engine = new ExecutionEngine(selector, executor, {
          maxConcurrency: parseInt(options.agents, 10),
          continueOnFailure: false,
          levelTimeoutMs: 300000,
          totalTimeoutMs: 3600000,
          retryAttempts: 1,
          retryDelayMs: 1000,
        });

        const result = await engine.executePlan(plan);
        const duration = Date.now() - startTime;

        logger.info('\n✅ Execution Complete\n');
        logger.info(`   Completed: ${result.completed}/${result.completed + result.failed + result.cancelled}`);
        logger.info(`   Failed: ${result.failed}`);
        logger.info(`   Duration: ${(duration / 1000).toFixed(2)}s`);

        if (result.errors.length > 0) {
          logger.info('\n⚠️  Errors:');
          result.errors.forEach(e => logger.info(`   - ${e.message}`));
        }

      } catch (error) {
        logger.error('❌ Execution failed:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // ============================================================================
  // federation agents
  // ============================================================================
  federation
    .command('agents')
    .description('List registered agents in the federation')
    .option('--json', 'Output as JSON')
    .option('-f, --format <format>', 'Output format (table|json)', 'table')
    .action(async (options) => {
      try {
        const client = getGlobalClient();
        const response = await client.listAgents({});

        if (!response.success || !response.data) {
          logger.error('❌ Failed to list agents:', response.error?.message);
          process.exit(1);
        }

        const agents = response.data.items;

        if (agents.length === 0) {
          logger.info('📭 No agents registered in federation');
          return;
        }

        if (options.json || options.format === 'json') {
          console.log(JSON.stringify({
            count: agents.length,
            agents: agents.map(a => ({
              id: a.id,
              status: a.status,
              model: a.model,
              task: a.task,
              teamId: a.teamId,
            })),
          }, null, 2));
          return;
        }

        logger.info(`\n🤖 Federation Agents (${agents.length}):\n`);

        agents.forEach(agent => {
          const statusEmoji = agent.status === 'running' ? '🟢' : 
                             agent.status === 'pending' ? '🟡' : 
                             agent.status === 'completed' ? '✅' : 
                             agent.status === 'failed' ? '❌' : '⚪';
          
          logger.info(`   ${statusEmoji} ${agent.id.slice(0, 16)}...`);
          logger.info(`      Status: ${agent.status}`);
          logger.info(`      Model: ${agent.model}`);
          if (agent.label) logger.info(`      Label: ${agent.label}`);
          if (agent.teamId) logger.info(`      Team: ${agent.teamId}`);
          logger.info('');
        });

      } catch (error) {
        logger.error('❌ Failed to list agents:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // ============================================================================
  // federation status
  // ============================================================================
  federation
    .command('status')
    .description('Show federation system status')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const client = getGlobalClient();
        const response = await client.listAgents({});

        const agents = response.success && response.data ? response.data.items : [];

        // Calculate stats
        const healthy = agents.filter(a => a.status === 'running' || a.status === 'pending').length;
        const busy = agents.filter(a => a.status === 'running').length;
        const idle = agents.filter(a => a.status === 'pending').length;
        const failed = agents.filter(a => a.status === 'failed').length;

        // Calculate estimated cost (placeholder - would come from actual cost tracking)
        const estimatedHourlyCost = agents.length * 0.50; // $0.50 per agent per hour estimate

        if (options.json) {
          console.log(JSON.stringify({
            timestamp: new Date().toISOString(),
            agents: {
              total: agents.length,
              healthy,
              busy,
              idle,
              failed,
            },
            cost: {
              estimatedHourly: estimatedHourlyCost,
              currency: 'USD',
            },
            federation: {
              status: healthy > 0 ? 'active' : 'inactive',
              capacity: agents.length,
              utilization: agents.length > 0 ? (busy / agents.length) : 0,
            },
          }, null, 2));
          return;
        }

        logger.info('\n📊 Federation Status\n');
        logger.info(`   Timestamp: ${new Date().toISOString()}`);
        logger.info(`   Status: ${healthy > 0 ? '🟢 Active' : '🔴 Inactive'}\n`);

        logger.info('   🤖 Agents:');
        logger.info(`      Total: ${agents.length}`);
        logger.info(`      Healthy: ${healthy}`);
        logger.info(`      Busy: ${busy}`);
        logger.info(`      Idle: ${idle}`);
        logger.info(`      Failed: ${failed}\n`);

        logger.info('   💰 Cost Estimates:');
        logger.info(`      Hourly: $${estimatedHourlyCost.toFixed(2)}`);
        logger.info(`      Daily: $${(estimatedHourlyCost * 24).toFixed(2)}\n`);

        logger.info('   ⚡ Capacity:');
        const utilization = agents.length > 0 ? ((busy / agents.length) * 100).toFixed(1) : '0.0';
        logger.info(`      Total Capacity: ${agents.length} agents`);
        logger.info(`      Utilization: ${utilization}%\n`);

      } catch (error) {
        logger.error('❌ Failed to get status:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // ============================================================================
  // federation autoscale
  // ============================================================================
  federation
    .command('autoscale')
    .description('Manage auto-scaling configuration')
    .option('--enable', 'Enable auto-scaling')
    .option('--disable', 'Disable auto-scaling')
    .option('--min <count>', 'Minimum agents', '2')
    .option('--max <count>', 'Maximum agents', '50')
    .option('--budget <amount>', 'Max cost per hour', '10.00')
    .option('--target-cpu <percent>', 'Target CPU utilization', '70')
    .option('--target-queue <size>', 'Target queue size per agent', '5')
    .action(async (options) => {
      try {
        // Get current config (in real implementation, this would be persisted)
        const config = {
          enabled: options.enable ? true : options.disable ? false : false,
          minAgents: parseInt(options.min, 10),
          maxAgents: parseInt(options.max, 10),
          maxCostPerHour: parseFloat(options.budget),
          targetCpuUtilization: parseInt(options.targetCpu, 10),
          targetQueueSize: parseInt(options.targetQueue, 10),
        };

        logger.info('\n📈 Auto-Scaling Configuration\n');
        logger.info(`   Status: ${config.enabled ? '🟢 Enabled' : '🔴 Disabled'}`);
        logger.info(`   Min Agents: ${config.minAgents}`);
        logger.info(`   Max Agents: ${config.maxAgents}`);
        logger.info(`   Budget Limit: $${config.maxCostPerHour}/hour`);
        logger.info(`   Target CPU: ${config.targetCpuUtilization}%`);
        logger.info(`   Target Queue: ${config.targetQueueSize} tasks/agent\n`);

        if (options.enable) {
          logger.info('✅ Auto-scaling enabled');
          logger.info('   Agents will scale between min/max based on demand');
        } else if (options.disable) {
          logger.info('⏸️  Auto-scaling disabled');
          logger.info('   Manual agent management required');
        }

        logger.info('\n💡 Tips:');
        logger.info('   - Set min agents > 0 for warm pool capacity');
        logger.info('   - Set budget limit to control costs');
        logger.info('   - Monitor utilization with: godel federation status');

      } catch (error) {
        logger.error('❌ Failed to configure auto-scaling:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // ============================================================================
  // federation plan
  // ============================================================================
  federation
    .command('plan')
    .description('Generate and visualize an execution plan without executing')
    .argument('<task>', 'Task to plan')
    .option('-s, --strategy <strategy>', 'Decomposition strategy', 'component-based')
    .option('-m, --max-agents <count>', 'Maximum agents', '10')
    .option('--json', 'Output as JSON')
    .action(async (task, options) => {
      try {
        logger.info('📋 Generating Execution Plan\n');
        logger.info(`   Task: ${task}`);
        logger.info(`   Strategy: ${options.strategy}`);
        logger.info(`   Max Agents: ${options.maxAgents}\n`);

        const decomposer = new TaskDecomposer();
        const result = await decomposer.decompose(task, undefined, {
          strategy: options.strategy,
          maxParallelism: parseInt(options.maxAgents, 10),
        });

        // Build execution plan
        const resolver = new DependencyResolver();
        resolver.buildGraph(result.subtasks.map(st => ({
          id: st.id,
          task: {
            id: st.id,
            name: st.title,
            description: st.description,
            requiredSkills: st.requiredCapabilities || [],
            priority: 'medium',
          },
          dependencies: st.dependencies,
        })));

        const plan = resolver.getExecutionPlan();

        if (options.json) {
          console.log(JSON.stringify({
            task,
            subtasks: result.subtasks,
            executionLevels: result.executionLevels,
            plan: {
              totalLevels: plan.levels.length,
              totalTasks: plan.totalTasks,
              estimatedParallelism: plan.estimatedParallelism,
              criticalPath: plan.criticalPath,
            },
            metrics: {
              parallelizationRatio: result.parallelizationRatio,
              totalComplexity: result.totalComplexity,
            },
          }, null, 2));
          return;
        }

        logger.info('✅ Plan Generated\n');

        logger.info('📊 Summary:');
        logger.info(`   Total Subtasks: ${result.subtasks.length}`);
        logger.info(`   Execution Levels: ${plan.levels.length}`);
        logger.info(`   Estimated Parallelism: ${plan.estimatedParallelism}x`);
        logger.info(`   Parallelization Ratio: ${(result.parallelizationRatio * 100).toFixed(1)}%`);
        logger.info(`   Total Complexity: ${result.totalComplexity}\n`);

        logger.info('🛤️  Critical Path:');
        plan.criticalPath.forEach((id, i) => {
          const subtask = result.subtasks.find(s => s.id === id);
          logger.info(`   ${i + 1}. ${subtask?.title || id}`);
        });

        logger.info('\n📈 Execution Levels:\n');
        plan.levels.forEach((level, i) => {
          logger.info(`   Level ${level.level} (${level.tasks.length} tasks${level.parallel ? ' parallel' : ''}):`);
          level.tasks.forEach(t => {
            const subtask = result.subtasks.find(s => s.id === t.id);
            logger.info(`     • ${subtask?.title || t.id}`);
          });
          logger.info('');
        });

        logger.info('💡 Optimization Tips:');
        if (result.parallelizationRatio < 0.3) {
          logger.info('   • Low parallelization - consider breaking down subtasks further');
        }
        if (plan.criticalPath.length > plan.levels.length) {
          logger.info('   • Long critical path - some tasks could run in parallel but have dependencies');
        }
        if (result.subtasks.length < 3) {
          logger.info('   • Few subtasks - task might benefit from more granular decomposition');
        }
        logger.info(`   • Use: godel federation execute "${task}"`);

      } catch (error) {
        logger.error('❌ Planning failed:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}
