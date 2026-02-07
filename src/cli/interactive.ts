#!/usr/bin/env node
/**
 * Interactive CLI Module
 * 
 * Provides enhanced interactive prompts, autocomplete, and progress indicators
 * for the Godel CLI.
 */

import ora, { Ora } from 'ora';
import chalk from 'chalk';
import { logger } from '../utils/logger';

// ============================================================================
// Types
// ============================================================================

export interface InteractiveOptions {
  message: string;
  choices?: string[] | { name: string; value: string }[];
  default?: string | boolean | number;
  validate?: (input: string) => boolean | string;
  pageSize?: number;
}

// ============================================================================
// Interactive Prompts - Using readline for simplicity
// ============================================================================

import * as readline from 'readline';

/**
 * Show an interactive selection prompt
 */
export async function select(options: InteractiveOptions): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log(chalk.blue(options.message));
  const choices = options.choices || [];
  
  choices.forEach((choice, index) => {
    if (typeof choice === 'string') {
      console.log(`  ${index + 1}. ${choice}`);
    } else {
      console.log(`  ${index + 1}. ${choice.name}`);
    }
  });

  const answer = await new Promise<string>((resolve) => {
    rl.question('Select (number): ', (input) => {
      const num = parseInt(input) - 1;
      const choice = choices[num];
      if (typeof choice === 'string') {
        resolve(choice);
      } else {
        resolve(choice?.value || String(choice));
      }
    });
  });

  rl.close();
  return answer;
}

/**
 * Show a text input prompt
 */
export async function input(options: InteractiveOptions): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const prompt = options.default 
    ? `${options.message} (${options.default}): `
    : `${options.message}: `;

  const answer = await new Promise<string>((resolve) => {
    rl.question(prompt, (input) => {
      resolve(input || String(options.default) || '');
    });
  });

  rl.close();
  
  if (options.validate) {
    const valid = options.validate(answer);
    if (valid !== true) {
      console.log(chalk.red(valid));
      return input(options);
    }
  }
  
  return answer;
}

/**
 * Show a password input prompt
 */
export async function password(options: InteractiveOptions): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const answer = await new Promise<string>((resolve) => {
    rl.question(`${options.message}: `, { signal: undefined as any }, (input) => {
      resolve(input);
    });
    // Hide input
    process.stdin.on('data', (char: Buffer) => {
      const str = char.toString();
      switch(str) {
        case '\n':
        case '\r':
        case '\u0004':
          process.stdin.pause();
          break;
        default:
          process.stdout.write('*');
          break;
      }
    });
  });

  rl.close();
  return answer;
}

/**
 * Show a confirmation prompt
 */
export async function confirm(options: InteractiveOptions): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const defaultValue = options.default !== undefined ? Boolean(options.default) : true;
  const defaultStr = defaultValue ? 'Y/n' : 'y/N';

  const answer = await new Promise<string>((resolve) => {
    rl.question(`${options.message} (${defaultStr}): `, (input) => {
      resolve(input.toLowerCase());
    });
  });

  rl.close();
  
  if (answer === '') return defaultValue;
  return answer === 'y' || answer === 'yes';
}

/**
 * Show an interactive multi-selection prompt
 */
export async function multiSelect(options: InteractiveOptions): Promise<string[]> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log(chalk.blue(options.message));
  console.log('(Enter comma-separated numbers, e.g., 1,2,3)');
  const choices = options.choices || [];
  
  choices.forEach((choice, index) => {
    if (typeof choice === 'string') {
      console.log(`  ${index + 1}. ${choice}`);
    } else {
      console.log(`  ${index + 1}. ${choice.name}`);
    }
  });

  const answer = await new Promise<string>((resolve) => {
    rl.question('Select: ', (input) => {
      resolve(input);
    });
  });

  rl.close();

  const indices = answer.split(',').map(s => parseInt(s.trim()) - 1);
  return indices.map(i => {
    const choice = choices[i];
    return typeof choice === 'string' ? choice : choice?.value || String(choice);
  }).filter(Boolean);
}

// ============================================================================
// Progress Indicators
// ============================================================================

export class ProgressTracker {
  private spinner: Ora | null = null;
  private steps: string[] = [];
  private currentStep = 0;
  private startTime: number = 0;

  constructor(private title: string) {}

  start(steps?: string[]): void {
    this.steps = steps || [];
    this.currentStep = 0;
    this.startTime = Date.now();
    this.spinner = ora({
      text: this.getSpinnerText(),
      spinner: 'dots'
    }).start();
  }

  update(text: string): void {
    if (this.spinner) {
      this.spinner.text = text;
    }
  }

  step(text: string): void {
    this.currentStep++;
    if (this.spinner) {
      const stepInfo = this.steps.length > 0 
        ? ` [${this.currentStep}/${this.steps.length}]` 
        : '';
      this.spinner.text = `${text}${stepInfo}`;
    }
  }

  succeed(text?: string): void {
    if (this.spinner) {
      const duration = this.getDuration();
      const durationText = duration ? ` (${duration})` : '';
      this.spinner.succeed(text ? `${text}${durationText}` : `${this.title} completed${durationText}`);
      this.spinner = null;
    }
  }

  fail(text?: string): void {
    if (this.spinner) {
      this.spinner.fail(text || `${this.title} failed`);
      this.spinner = null;
    }
  }

  warn(text: string): void {
    if (this.spinner) {
      this.spinner.warn(text);
    }
  }

  info(text: string): void {
    if (this.spinner) {
      this.spinner.info(text);
    }
  }

  stop(): void {
    if (this.spinner) {
      this.spinner.stop();
      this.spinner = null;
    }
  }

  private getSpinnerText(): string {
    if (this.steps.length > 0) {
      return `${this.title} [0/${this.steps.length}]`;
    }
    return this.title;
  }

  private getDuration(): string {
    if (!this.startTime) return '';
    const ms = Date.now() - this.startTime;
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }
}

/**
 * Create a new progress tracker
 */
export function createProgress(title: string): ProgressTracker {
  return new ProgressTracker(title);
}

// ============================================================================
// Error Messages with Suggestions
// ============================================================================

interface ErrorSuggestion {
  pattern: RegExp;
  message: string;
  suggestion: string;
  command?: string;
}

const errorSuggestions: ErrorSuggestion[] = [
  {
    pattern: /ECONNREFUSED|connect ECONNREFUSED/i,
    message: 'Cannot connect to Godel server',
    suggestion: 'Make sure the Godel server is running:',
    command: 'npm start'
  },
  {
    pattern: /ECONNRESET|socket hang up/i,
    message: 'Connection was reset by the server',
    suggestion: 'The server may be overloaded or restarting. Check server status:',
    command: 'godel health'
  },
  {
    pattern: /404|Not Found/i,
    message: 'Resource not found',
    suggestion: 'Check the resource ID or use the list command to see available resources:'
  },
  {
    pattern: /401|Unauthorized|invalid token/i,
    message: 'Authentication failed',
    suggestion: 'Your API key may be invalid or expired. Check your configuration:',
    command: 'godel config show'
  },
  {
    pattern: /403|Forbidden/i,
    message: 'Access denied',
    suggestion: 'You don\'t have permission for this operation. Check your role and permissions.'
  },
  {
    pattern: /409|Conflict/i,
    message: 'Resource conflict detected',
    suggestion: 'Another operation may be in progress. Check current status:'
  },
  {
    pattern: /timeout|ETIMEDOUT/i,
    message: 'Request timed out',
    suggestion: 'The operation is taking longer than expected. You can:',
    command: 'godel events stream --follow'
  },
  {
    pattern: /ENOMEM|out of memory/i,
    message: 'Out of memory',
    suggestion: 'The server or agent is running low on memory. Consider scaling horizontally:'
  },
  {
    pattern: /rate.*limit|429|Too Many Requests/i,
    message: 'Rate limit exceeded',
    suggestion: 'You\'re making requests too quickly. Wait a moment and try again, or check your quota:'
  },
  {
    pattern: /validation.*error|invalid.*input|schema/i,
    message: 'Input validation failed',
    suggestion: 'Check the input format and required fields. See documentation for examples:'
  },
  {
    pattern: /worktree|git worktree/i,
    message: 'Worktree operation failed',
    suggestion: 'There may be uncommitted changes or the path already exists. Clean up and try again:',
    command: 'godel worktree list'
  },
  {
    pattern: /agent.*not.*found|agent.*doesn't exist/i,
    message: 'Agent not found',
    suggestion: 'The specified agent doesn\'t exist. List available agents:',
    command: 'godel agent list'
  },
  {
    pattern: /team.*not.*found|team.*doesn't exist/i,
    message: 'Team not found',
    suggestion: 'The specified team doesn\'t exist. List available teams:',
    command: 'godel team list'
  }
];

/**
 * Display an error with helpful suggestions
 */
export function showError(error: Error | string, context?: string): void {
  const errorMessage = error instanceof Error ? error.message : error;
  
  // Find matching suggestion
  const suggestion = errorSuggestions.find(s => s.pattern.test(errorMessage));
  
  console.error('\n' + chalk.red('✖ Error') + (context ? ` ${chalk.gray('-')} ${context}` : ''));
  console.error(chalk.red('─'.repeat(60)));
  console.error(chalk.white(errorMessage));
  
  if (suggestion) {
    console.error('\n' + chalk.yellow('💡 ' + suggestion.message));
    console.error(chalk.gray(suggestion.suggestion));
    if (suggestion.command) {
      console.error(chalk.cyan(`   $ ${suggestion.command}`));
    }
  } else {
    console.error('\n' + chalk.gray('For more help, try:'));
    console.error(chalk.cyan('   $ godel --help'));
    console.error(chalk.cyan('   $ godel <command> --help'));
  }
  
  console.error(chalk.red('─'.repeat(60)) + '\n');
}

/**
 * Wrap a function with error handling and suggestions
 */
export async function withErrorHandling<T>(
  fn: () => Promise<T>,
  context?: string
): Promise<T | undefined> {
  try {
    return await fn();
  } catch (error) {
    showError(error instanceof Error ? error : String(error), context);
    return undefined;
  }
}

// ============================================================================
// Interactive Command Builder
// ============================================================================

export interface CommandStep {
  name: string;
  type: 'select' | 'input' | 'password' | 'confirm' | 'multiselect';
  message: string;
  choices?: string[] | { name: string; value: string }[];
  default?: any;
  validate?: (input: any) => boolean | string;
  when?: (answers: any) => boolean;
}

export class InteractiveCommandBuilder {
  private steps: CommandStep[] = [];

  addStep(step: CommandStep): this {
    this.steps.push(step);
    return this;
  }

  async run(): Promise<Record<string, any>> {
    const answers: Record<string, any> = {};
    
    for (const step of this.steps) {
      // Skip if when condition returns false
      if (step.when && !step.when(answers)) {
        continue;
      }

      let value: any;
      
      switch (step.type) {
        case 'select':
          value = await select({
            message: step.message,
            choices: step.choices,
            default: step.default
          });
          break;
        case 'multiselect':
          value = await multiSelect({
            message: step.message,
            choices: step.choices,
            default: step.default
          });
          break;
        case 'input':
          value = await input({
            message: step.message,
            default: step.default,
            validate: step.validate
          });
          break;
        case 'password':
          value = await password({
            message: step.message,
            validate: step.validate
          });
          break;
        case 'confirm':
          value = await confirm({
            message: step.message,
            default: step.default
          });
          break;
      }
      
      answers[step.name] = value;
    }
    
    return answers;
  }
}

// ============================================================================
// Quick Pick Utilities
// ============================================================================

export async function pickAgent(): Promise<string | null> {
  // This would normally fetch from API
  const agents = [
    { name: 'agent-001 (Running) - Worker', value: 'agent-001' },
    { name: 'agent-002 (Idle) - Coordinator', value: 'agent-002' },
    { name: 'agent-003 (Running) - Reviewer', value: 'agent-003' }
  ];
  
  console.log(chalk.blue('Select an agent:'));
  agents.forEach((a, i) => console.log(`  ${i + 1}. ${a.name}`));
  console.log(`  ${agents.length + 1}. Cancel`);
  
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) => {
    rl.question('Select: ', resolve);
  });
  rl.close();
  
  const num = parseInt(answer) - 1;
  if (num >= agents.length) return null;
  return agents[num]?.value || null;
}

export async function pickTeam(): Promise<string | null> {
  const teams = [
    { name: 'team-001 (Active) - Auth Implementation', value: 'team-001' },
    { name: 'team-002 (Active) - API Refactoring', value: 'team-002' }
  ];
  
  console.log(chalk.blue('Select a team:'));
  teams.forEach((t, i) => console.log(`  ${i + 1}. ${t.name}`));
  console.log(`  ${teams.length + 1}. Cancel`);
  
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) => {
    rl.question('Select: ', resolve);
  });
  rl.close();
  
  const num = parseInt(answer) - 1;
  if (num >= teams.length) return null;
  return teams[num]?.value || null;
}

export async function pickTask(): Promise<string | null> {
  const tasks = [
    { name: 'task-001 (In Progress) - Implement OAuth', value: 'task-001' },
    { name: 'task-002 (Pending) - Add rate limiting', value: 'task-002' }
  ];
  
  console.log(chalk.blue('Select a task:'));
  tasks.forEach((t, i) => console.log(`  ${i + 1}. ${t.name}`));
  console.log(`  ${tasks.length + 1}. Cancel`);
  
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) => {
    rl.question('Select: ', resolve);
  });
  rl.close();
  
  const num = parseInt(answer) - 1;
  if (num >= tasks.length) return null;
  return tasks[num]?.value || null;
}

// ============================================================================
// Wizard Helpers
// ============================================================================

export async function runWizard<T>(
  name: string,
  steps: CommandStep[],
  execute: (answers: Record<string, any>) => Promise<T>
): Promise<T | undefined> {
  console.log(chalk.blue.bold(`\n🧙 ${name} Wizard`));
  console.log(chalk.gray('─'.repeat(50)));
  
  const builder = new InteractiveCommandBuilder();
  for (const step of steps) {
    builder.addStep(step);
  }
  
  try {
    const answers = await builder.run();
    console.log(chalk.gray('─'.repeat(50)));
    
    const confirmed = await confirm({
      message: 'Proceed with these settings?',
      default: true
    });
    
    if (!confirmed) {
      console.log(chalk.yellow('Wizard cancelled.'));
      return undefined;
    }
    
    const progress = createProgress('Executing');
    progress.start();
    
    try {
      const result = await execute(answers);
      progress.succeed();
      return result;
    } catch (error) {
      progress.fail();
      throw error;
    }
  } catch (error) {
    showError(error instanceof Error ? error : String(error), 'Wizard failed');
    return undefined;
  }
}
