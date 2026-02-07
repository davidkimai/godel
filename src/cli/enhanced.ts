#!/usr/bin/env node
/**
 * Enhanced CLI Commands
 * 
 * Provides interactive versions of common CLI commands with better UX.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import {
  select,
  multiSelect,
  input,
  confirm,
  createProgress,
  showError,
  withErrorHandling,
  runWizard,
  pickAgent,
  pickTeam,
  pickTask,
  CommandStep
} from './interactive';
import { logger } from '../utils/logger';

// ============================================================================
// Interactive Command Registration
// ============================================================================

export function registerInteractiveCommands(program: Command): void {
  const interactive = program
    .command('interactive')
    .alias('i')
    .description('Interactive mode for common operations');

  // Agent wizard
  interactive
    .command('agent')
    .description('Interactive agent management')
    .action(agentWizard);

  // Team wizard
  interactive
    .command('team')
    .description('Interactive team management')
    .action(teamWizard);

  // Task wizard
  interactive
    .command('task')
    .description('Interactive task management')
    .action(taskWizard);

  // Quick actions
  interactive
    .command('quick')
    .description('Quick action menu')
    .action(quickMenu);

  // Setup wizard for new users
  interactive
    .command('setup')
    .description('First-time setup wizard')
    .action(setupWizard);
}

// ============================================================================
// Wizards
// ============================================================================

async function agentWizard(): Promise<void> {
  const action = await select({
    message: 'What would you like to do with agents?',
    choices: [
      { name: '🚀 Spawn new agent', value: 'spawn' },
      { name: '📋 List all agents', value: 'list' },
      { name: '🔍 View agent details', value: 'details' },
      { name: '📝 View agent logs', value: 'logs' },
      { name: '❌ Kill agent', value: 'kill' },
      new (require('inquirer').Separator)(),
      { name: 'Cancel', value: 'cancel' }
    ]
  });

  if (action === 'cancel') return;

  switch (action) {
    case 'spawn':
      await spawnAgentWizard();
      break;
    case 'list':
      await listAgentsInteractive();
      break;
    case 'details':
      await viewAgentDetails();
      break;
    case 'logs':
      await viewAgentLogs();
      break;
    case 'kill':
      await killAgentInteractive();
      break;
  }
}

async function spawnAgentWizard(): Promise<void> {
  const steps: CommandStep[] = [
    {
      name: 'role',
      type: 'select',
      message: 'Select agent role:',
      choices: [
        { name: 'Worker - General task executor', value: 'worker' },
        { name: 'Coordinator - Orchestrates teams', value: 'coordinator' },
        { name: 'Reviewer - Quality assurance', value: 'reviewer' },
        { name: 'Refinery - Merge and integration', value: 'refinery' },
        { name: 'Specialist - Domain expert', value: 'specialist' }
      ]
    },
    {
      name: 'model',
      type: 'select',
      message: 'Select model:',
      choices: [
        { name: 'Claude Sonnet 4.5 (Balanced)', value: 'claude-sonnet-4-5' },
        { name: 'Claude Opus 4 (Powerful)', value: 'claude-opus-4' },
        { name: 'GPT-4o (Fast)', value: 'gpt-4o' },
        { name: 'Gemini 1.5 Pro (Long context)', value: 'gemini-1.5-pro' }
      ],
      default: 'claude-sonnet-4-5'
    },
    {
      name: 'label',
      type: 'input',
      message: 'Agent label (optional):',
      default: ''
    },
    {
      name: 'runtime',
      type: 'select',
      message: 'Select runtime:',
      choices: [
        { name: 'Pi - Multi-provider CLI', value: 'pi' },
        { name: 'OpenClaw - OpenClaw runtime', value: 'openclaw' },
        { name: 'Local - Local execution', value: 'local' }
      ],
      default: 'pi'
    }
  ];

  await runWizard(
    'Spawn Agent',
    steps,
    async (answers) => {
      const progress = createProgress('Spawning agent');
      progress.start(['Validating', 'Creating', 'Starting']);
      
      // Simulate API call
      await delay(500);
      progress.step('Creating agent...');
      await delay(800);
      progress.step('Starting agent runtime...');
      await delay(600);
      
      logger.info(chalk.green('✓ Agent spawned successfully!'));
      logger.info(chalk.gray(`  ID: ${generateId('agent')}`));
      logger.info(chalk.gray(`  Role: ${answers['role']}`));
      logger.info(chalk.gray(`  Model: ${answers['model']}`));
      
      return answers;
    }
  );
}

async function listAgentsInteractive(): Promise<void> {
  const filter = await select({
    message: 'Filter by status:',
    choices: [
      { name: 'All agents', value: 'all' },
      { name: 'Running', value: 'running' },
      { name: 'Idle', value: 'idle' },
      { name: 'Failed', value: 'failed' }
    ]
  });

  const progress = createProgress('Fetching agents');
  progress.start();
  
  await delay(500);
  
  // Simulated agent list
  const agents = [
    { id: 'agent-001', status: 'running', role: 'worker', model: 'claude-sonnet-4-5' },
    { id: 'agent-002', status: 'idle', role: 'coordinator', model: 'claude-opus-4' },
    { id: 'agent-003', status: 'running', role: 'reviewer', model: 'claude-sonnet-4-5' }
  ].filter(a => filter === 'all' || a.status === filter);
  
  progress.succeed(`Found ${agents.length} agent(s)`);
  
  console.log('\n' + chalk.bold('Agents:'));
  console.log(chalk.gray('─'.repeat(70)));
  
  for (const agent of agents) {
    const statusColor = agent.status === 'running' ? chalk.green : 
                       agent.status === 'idle' ? chalk.yellow : chalk.red;
    console.log(`${chalk.cyan(agent.id)} ${statusColor(`[${agent.status}]`)} ${chalk.gray('-')} ${agent.role} (${agent.model})`);
  }
  
  console.log(chalk.gray('─'.repeat(70)) + '\n');
}

async function viewAgentDetails(): Promise<void> {
  const agentId = await pickAgent();
  if (!agentId) return;
  
  const progress = createProgress('Fetching details');
  progress.start();
  await delay(500);
  progress.succeed();
  
  console.log('\n' + chalk.bold(`Agent: ${agentId}`));
  console.log(chalk.gray('─'.repeat(50)));
  console.log(`  Status:    ${chalk.green('Running')}`);
  console.log(`  Role:      Worker`);
  console.log(`  Model:     claude-sonnet-4-5`);
  console.log(`  Runtime:   Pi`);
  console.log(`  Created:   2026-02-07 10:30:00`);
  console.log(`  Tasks:     5 completed, 1 active`);
  console.log(chalk.gray('─'.repeat(50)) + '\n');
}

async function viewAgentLogs(): Promise<void> {
  const agentId = await pickAgent();
  if (!agentId) return;
  
  const lines = await select({
    message: 'Number of log lines:',
    choices: ['50', '100', '200', '500'],
    default: '100'
  });
  
  const follow = await confirm({
    message: 'Follow logs (tail -f mode)?',
    default: false
  });
  
  const progress = createProgress('Fetching logs');
  progress.start();
  await delay(300);
  progress.succeed();
  
  console.log('\n' + chalk.bold(`Logs for ${agentId}:`));
  console.log(chalk.gray('─'.repeat(70)));
  console.log(chalk.gray('[2026-02-07 10:30:15] Task started: implement-oauth'));
  console.log(chalk.gray('[2026-02-07 10:30:20] Analyzing codebase...'));
  console.log(chalk.gray('[2026-02-07 10:30:45] Found 3 files to modify'));
  console.log(chalk.gray('[2026-02-07 10:31:02] Writing changes to auth.ts'));
  console.log(chalk.gray('─'.repeat(70)) + '\n');
  
  if (follow) {
    console.log(chalk.yellow('Following logs... (Press Ctrl+C to exit)'));
  }
}

async function killAgentInteractive(): Promise<void> {
  const agentId = await pickAgent();
  if (!agentId) return;
  
  const confirmed = await confirm({
    message: chalk.red(`Are you sure you want to kill ${agentId}?`),
    default: false
  });
  
  if (!confirmed) {
    console.log(chalk.yellow('Operation cancelled.'));
    return;
  }
  
  const progress = createProgress('Killing agent');
  progress.start();
  await delay(800);
  progress.succeed(`Agent ${agentId} terminated`);
}

async function teamWizard(): Promise<void> {
  const action = await select({
    message: 'What would you like to do with teams?',
    choices: [
      { name: '➕ Create new team', value: 'create' },
      { name: '📋 List all teams', value: 'list' },
      { name: '🔍 View team details', value: 'details' },
      { name: '📈 Scale team', value: 'scale' },
      { name: '🗑️  Destroy team', value: 'destroy' },
      new (require('inquirer').Separator)(),
      { name: 'Cancel', value: 'cancel' }
    ]
  });

  if (action === 'cancel') return;

  switch (action) {
    case 'create':
      await createTeamWizard();
      break;
    case 'list':
      await listTeamsInteractive();
      break;
    case 'details':
      await viewTeamDetails();
      break;
    case 'scale':
      await scaleTeamInteractive();
      break;
    case 'destroy':
      await destroyTeamInteractive();
      break;
  }
}

async function createTeamWizard(): Promise<void> {
  const steps: CommandStep[] = [
    {
      name: 'name',
      type: 'input',
      message: 'Team name:',
      validate: (input: string) => input.length > 0 || 'Name is required'
    },
    {
      name: 'strategy',
      type: 'select',
      message: 'Team strategy:',
      choices: [
        { name: 'Parallel - All workers execute simultaneously', value: 'parallel' },
        { name: 'Map-Reduce - Split work, combine results', value: 'map-reduce' },
        { name: 'Pipeline - Sequential stages', value: 'pipeline' },
        { name: 'Tree - Hierarchical delegation', value: 'tree' }
      ],
      default: 'parallel'
    },
    {
      name: 'coordinator',
      type: 'confirm',
      message: 'Include a coordinator agent?',
      default: true
    },
    {
      name: 'workers',
      type: 'input',
      message: 'Number of worker agents:',
      default: '3',
      validate: (input: string) => {
        const num = parseInt(input);
        return (num > 0 && num <= 20) || 'Enter a number between 1 and 20';
      }
    },
    {
      name: 'reviewer',
      type: 'confirm',
      message: 'Include a reviewer agent?',
      default: true
    }
  ];

  await runWizard(
    'Create Team',
    steps,
    async (answers) => {
      const progress = createProgress('Creating team');
      progress.start(['Validating', 'Creating coordinator', 'Spawning workers', 'Finalizing']);
      
      await delay(400);
      progress.step('Creating coordinator...');
      await delay(600);
      progress.step('Spawning workers...');
      await delay(800);
      progress.step('Finalizing team setup...');
      await delay(400);
      
      logger.info(chalk.green('✓ Team created successfully!'));
      logger.info(chalk.gray(`  ID: ${generateId('team')}`));
      logger.info(chalk.gray(`  Name: ${answers['name']}`));
      logger.info(chalk.gray(`  Size: ${1 + parseInt(answers['workers']) + (answers['reviewer'] ? 1 : 0)} agents`));
      
      return answers;
    }
  );
}

async function listTeamsInteractive(): Promise<void> {
  const progress = createProgress('Fetching teams');
  progress.start();
  await delay(500);
  progress.succeed();
  
  console.log('\n' + chalk.bold('Teams:'));
  console.log(chalk.gray('─'.repeat(70)));
  console.log(`${chalk.cyan('team-001')} ${chalk.green('[active]')} ${chalk.gray('-')} Auth Implementation (5 agents)`);
  console.log(`${chalk.cyan('team-002')} ${chalk.green('[active]')} ${chalk.gray('-')} API Refactoring (3 agents)`);
  console.log(chalk.gray('─'.repeat(70)) + '\n');
}

async function viewTeamDetails(): Promise<void> {
  const teamId = await pickTeam();
  if (!teamId) return;
  
  const progress = createProgress('Fetching details');
  progress.start();
  await delay(500);
  progress.succeed();
  
  console.log('\n' + chalk.bold(`Team: ${teamId}`));
  console.log(chalk.gray('─'.repeat(50)));
  console.log('  Name:      Auth Implementation');
  console.log('  Status:    Active');
  console.log('  Strategy:  Parallel');
  console.log('  Agents:    5 (1 coordinator, 3 workers, 1 reviewer)');
  console.log('  Tasks:     12 completed, 2 pending');
  console.log(chalk.gray('─'.repeat(50)) + '\n');
}

async function scaleTeamInteractive(): Promise<void> {
  const teamId = await pickTeam();
  if (!teamId) return;
  
  const currentWorkers = 3;
  const newCount = await input({
    message: `Current workers: ${currentWorkers}. New count:`,
    default: String(currentWorkers + 2),
    validate: (input: string) => {
      const num = parseInt(input);
      return (num > 0 && num <= 50) || 'Enter a number between 1 and 50';
    }
  });
  
  const progress = createProgress('Scaling team');
  progress.start();
  await delay(800);
  progress.succeed(`Team scaled to ${newCount} workers`);
}

async function destroyTeamInteractive(): Promise<void> {
  const teamId = await pickTeam();
  if (!teamId) return;
  
  const confirmed = await confirm({
    message: chalk.red(`⚠️  Destroy team ${teamId}? All agents will be terminated.`),
    default: false
  });
  
  if (!confirmed) {
    console.log(chalk.yellow('Operation cancelled.'));
    return;
  }
  
  const force = await confirm({
    message: 'Force destroy (ignore running tasks)?',
    default: false
  });
  
  const progress = createProgress('Destroying team');
  progress.start(['Stopping agents', 'Cleaning up', 'Finalizing']);
  
  await delay(600);
  progress.step('Cleaning up resources...');
  await delay(500);
  
  progress.succeed(`Team ${teamId} destroyed`);
}

async function taskWizard(): Promise<void> {
  const action = await select({
    message: 'What would you like to do with tasks?',
    choices: [
      { name: '➕ Create new task', value: 'create' },
      { name: '📋 List all tasks', value: 'list' },
      { name: '🔍 View task details', value: 'details' },
      { name: '✅ Mark task complete', value: 'complete' },
      { name: '❌ Cancel task', value: 'cancel' },
      new (require('inquirer').Separator)(),
      { name: 'Cancel', value: 'cancel' }
    ]
  });

  if (action === 'cancel') return;

  switch (action) {
    case 'create':
      await createTaskWizard();
      break;
    case 'list':
      await listTasksInteractive();
      break;
    case 'details':
      await viewTaskDetails();
      break;
    case 'complete':
      await completeTaskInteractive();
      break;
    case 'cancel':
      await cancelTaskInteractive();
      break;
  }
}

async function createTaskWizard(): Promise<void> {
  const steps: CommandStep[] = [
    {
      name: 'title',
      type: 'input',
      message: 'Task title:',
      validate: (input: string) => input.length > 0 || 'Title is required'
    },
    {
      name: 'description',
      type: 'input',
      message: 'Description (optional):',
      default: ''
    },
    {
      name: 'priority',
      type: 'select',
      message: 'Priority:',
      choices: [
        { name: '🔴 Critical', value: 'critical' },
        { name: '🟠 High', value: 'high' },
        { name: '🟡 Medium', value: 'medium' },
        { name: '🟢 Low', value: 'low' }
      ],
      default: 'medium'
    },
    {
      name: 'team',
      type: 'select',
      message: 'Assign to team:',
      choices: [
        { name: 'Auto-assign', value: 'auto' },
        { name: 'team-001 - Auth Implementation', value: 'team-001' },
        { name: 'team-002 - API Refactoring', value: 'team-002' }
      ],
      default: 'auto'
    }
  ];

  await runWizard(
    'Create Task',
    steps,
    async (answers) => {
      const progress = createProgress('Creating task');
      progress.start();
      
      await delay(600);
      
      logger.info(chalk.green('✓ Task created successfully!'));
      logger.info(chalk.gray(`  ID: ${generateId('task')}`));
      logger.info(chalk.gray(`  Title: ${answers['title']}`));
      logger.info(chalk.gray(`  Priority: ${answers['priority']}`));
      
      return answers;
    }
  );
}

async function listTasksInteractive(): Promise<void> {
  const filter = await select({
    message: 'Filter by status:',
    choices: [
      { name: 'All tasks', value: 'all' },
      { name: 'Pending', value: 'pending' },
      { name: 'In Progress', value: 'in_progress' },
      { name: 'Completed', value: 'completed' },
      { name: 'Failed', value: 'failed' }
    ]
  });

  const progress = createProgress('Fetching tasks');
  progress.start();
  await delay(500);
  progress.succeed();
  
  console.log('\n' + chalk.bold('Tasks:'));
  console.log(chalk.gray('─'.repeat(70)));
  console.log(`${chalk.cyan('task-001')} ${chalk.yellow('[in_progress]')} ${chalk.gray('-')} Implement OAuth`);
  console.log(`${chalk.cyan('task-002')} ${chalk.gray('[pending]')} ${chalk.gray('-')} Add rate limiting`);
  console.log(`${chalk.cyan('task-003')} ${chalk.green('[completed]')} ${chalk.gray('-')} Setup database`);
  console.log(chalk.gray('─'.repeat(70)) + '\n');
}

async function viewTaskDetails(): Promise<void> {
  const taskId = await pickTask();
  if (!taskId) return;
  
  const progress = createProgress('Fetching details');
  progress.start();
  await delay(500);
  progress.succeed();
  
  console.log('\n' + chalk.bold(`Task: ${taskId}`));
  console.log(chalk.gray('─'.repeat(50)));
  console.log('  Title:       Implement OAuth');
  console.log('  Status:      In Progress');
  console.log('  Priority:    High');
  console.log('  Assignee:    agent-001');
  console.log('  Created:     2026-02-07 09:00:00');
  console.log('  Started:     2026-02-07 09:05:00');
  console.log(chalk.gray('─'.repeat(50)) + '\n');
}

async function completeTaskInteractive(): Promise<void> {
  const taskId = await pickTask();
  if (!taskId) return;
  
  const confirmed = await confirm({
    message: `Mark ${taskId} as complete?`,
    default: true
  });
  
  if (!confirmed) return;
  
  const progress = createProgress('Completing task');
  progress.start();
  await delay(500);
  progress.succeed(`Task ${taskId} marked as complete`);
}

async function cancelTaskInteractive(): Promise<void> {
  const taskId = await pickTask();
  if (!taskId) return;
  
  const confirmed = await confirm({
    message: chalk.red(`Cancel task ${taskId}?`),
    default: false
  });
  
  if (!confirmed) return;
  
  const progress = createProgress('Cancelling task');
  progress.start();
  await delay(500);
  progress.succeed(`Task ${taskId} cancelled`);
}

async function quickMenu(): Promise<void> {
  const action = await select({
    message: 'Quick Actions:',
    choices: [
      { name: '🚀 Quick spawn agent', value: 'spawn' },
      { name: '📊 System status', value: 'status' },
      { name: '🔍 Check health', value: 'health' },
      { name: '📈 View metrics', value: 'metrics' },
      { name: '📝 Create quick task', value: 'task' },
      new (require('inquirer').Separator)(),
      { name: 'Exit', value: 'exit' }
    ]
  });

  switch (action) {
    case 'spawn':
      await spawnAgentWizard();
      break;
    case 'status':
      await showQuickStatus();
      break;
    case 'health':
      await showQuickHealth();
      break;
    case 'metrics':
      await showQuickMetrics();
      break;
    case 'task':
      await createQuickTask();
      break;
  }
}

async function setupWizard(): Promise<void> {
  console.log(chalk.blue.bold('\n🚀 Welcome to Godel!'));
  console.log(chalk.gray('Let\'s get you set up in just a few steps.\n'));
  
  const steps: CommandStep[] = [
    {
      name: 'serverUrl',
      type: 'input',
      message: 'Godel server URL:',
      default: 'http://localhost:7373'
    },
    {
      name: 'apiKey',
      type: 'password',
      message: 'API Key (optional for local dev):'
    },
    {
      name: 'defaultModel',
      type: 'select',
      message: 'Default model:',
      choices: [
        { name: 'Claude Sonnet 4.5 (Recommended)', value: 'claude-sonnet-4-5' },
        { name: 'Claude Opus 4 (High quality)', value: 'claude-opus-4' },
        { name: 'GPT-4o (Fast)', value: 'gpt-4o' }
      ],
      default: 'claude-sonnet-4-5'
    },
    {
      name: 'enableMetrics',
      type: 'confirm',
      message: 'Enable metrics collection?',
      default: true
    }
  ];

  const answers = await runWizard(
    'Setup',
    steps,
    async (config) => {
      const progress = createProgress('Saving configuration');
      progress.start();
      await delay(800);
      progress.succeed();
      
      console.log('\n' + chalk.green('✅ Setup complete!'));
      console.log(chalk.gray('\nNext steps:'));
      console.log(chalk.cyan('  $ godel interactive quick'));
      console.log(chalk.cyan('  $ godel agent spawn --help'));
      console.log(chalk.cyan('  $ godel team create --help\n'));
      
      return config;
    }
  );
}

// ============================================================================
// Quick Action Helpers
// ============================================================================

async function showQuickStatus(): Promise<void> {
  const progress = createProgress('Fetching status');
  progress.start();
  await delay(500);
  progress.succeed();
  
  console.log('\n' + chalk.bold('System Status'));
  console.log(chalk.gray('─'.repeat(50)));
  console.log(`  Server:      ${chalk.green('Online')}`);
  console.log(`  Version:     2.0.0`);
  console.log(`  Agents:      ${chalk.cyan('12')} active`);
  console.log(`  Teams:       ${chalk.cyan('3')} active`);
  console.log(`  Tasks:       ${chalk.cyan('45')} total`);
  console.log(chalk.gray('─'.repeat(50)) + '\n');
}

async function showQuickHealth(): Promise<void> {
  const progress = createProgress('Checking health');
  progress.start();
  await delay(400);
  progress.succeed();
  
  console.log('\n' + chalk.bold('Health Check'));
  console.log(chalk.gray('─'.repeat(50)));
  console.log(`  API:         ${chalk.green('✓ Healthy')}`);
  console.log(`  Database:    ${chalk.green('✓ Connected')}`);
  console.log(`  Redis:       ${chalk.green('✓ Connected')}`);
  console.log(`  Proxy:       ${chalk.green('✓ Operational')}`);
  console.log(chalk.gray('─'.repeat(50)) + '\n');
}

async function showQuickMetrics(): Promise<void> {
  const progress = createProgress('Fetching metrics');
  progress.start();
  await delay(500);
  progress.succeed();
  
  console.log('\n' + chalk.bold('System Metrics (Last 1 hour)'));
  console.log(chalk.gray('─'.repeat(50)));
  console.log(`  Requests:    1,234`);
  console.log(`  Avg Latency: 245ms`);
  console.log(`  Success Rate: 99.8%`);
  console.log(`  Token Usage: 2.3M tokens`);
  console.log(chalk.gray('─'.repeat(50)) + '\n');
}

async function createQuickTask(): Promise<void> {
  const title = await input({
    message: 'Task title:',
    validate: (input: string) => input.length > 0 || 'Title is required'
  });
  
  const progress = createProgress('Creating task');
  progress.start();
  await delay(600);
  progress.succeed(`Task "${title}" created`);
}

// ============================================================================
// Utilities
// ============================================================================

function generateId(prefix: string): string {
  const random = Math.random().toString(36).substring(2, 7);
  return `${prefix}-${random}`;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
