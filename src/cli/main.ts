/**
 * Dash CLI - Main Entry Point
 * 
 * Agent Orchestration Platform CLI
 * Supports agents, tasks, events, and context management
 */

import { Command } from 'commander';

import { formatError } from './formatters';
import { memoryStore } from '../storage/memory';
import { logger } from '../utils';

// Re-export storage singleton
export { memoryStore };

// Global format option storage (accessed by subcommands)
export let globalFormat: 'json' | 'table' = 'table';

// Global options applied to all commands
export function configureGlobalOptions(program: Command): Command {
  interface GlobalCommandOptions {
    format?: 'json' | 'table';
    output?: string;
    quiet?: boolean;
    debug?: boolean;
  }

  program
    .option('--format <json|table>', 'Output format', 'table')
    .option('--output <path>', 'Output file path (optional)')
    .option('--quiet', 'Suppress non-essential output')
    .option('--debug', 'Enable debug mode')
    .hook('preAction', function(_this: Command) {
      const opts = _this.opts<GlobalCommandOptions>();
      globalFormat = opts.format || 'table';
    });
  
  return program;
}

// Error handler for CLI
export function handleError(error: unknown): never {
  logger.error(formatError(error as Error | string));
  process.exit(1);
}

// Validate format option
export function validateFormat(format: string): 'json' | 'table' {
  if (format !== 'json' && format !== 'table') {
    throw new Error(`Invalid format: ${format}. Must be 'json' or 'table'`);
  }
  return format as 'json' | 'table';
}

// Create the main CLI program
export function createCLI(): Command {
  const program = new Command();
  
  program
    .name('dash')
    .description('Dash - Agent Orchestration Platform')
    .version('1.0.0')
    .addHelpCommand('help [command]', 'Display help for a specific command')
    .configureOutput({
      writeErr: (str) => logger.error(str),
    });
  
  return program;
}

// Build the complete CLI with all commands
export async function buildCLI(): Promise<Command> {
  const program = createCLI();
  
  // Global options
  configureGlobalOptions(program);
  
  // Import commands dynamically (models may not exist yet)
  try {
    // Agents command
    const { default: agentsCommand } = await import('./commands/agents');
    program.addCommand(agentsCommand());
    
    // Tasks command
    const { default: tasksCommand } = await import('./commands/tasks');
    program.addCommand(tasksCommand());
    
    // Events command
    const { default: eventsCommand } = await import('./commands/events');
    program.addCommand(eventsCommand());
    
    // Context command
    const { default: contextCommand } = await import('./commands/context');
    program.addCommand(contextCommand());

    // Quality command
    const qualityModule = await import('./commands/quality');
    const qualityCommand = qualityModule.qualityCommand;
    program.addCommand(qualityCommand());

    // Tests command
    const { default: testsCommand } = await import('./commands/tests');
    program.addCommand(testsCommand());

    // System commands
    program
      .command('status')
      .description('Display system status')
      .action(async () => {
        const { default: statusCommand } = await import('./commands/status');
        await statusCommand();
      });
    
    program
      .command('help')
      .description('Display help information')
      .alias('h')
      .action(() => {
        program.help();
      });
      
  } catch (error) {
    // Commands will be available after models are implemented
    logger.warn('Some commands may not be available until models are implemented');
  }
  
  return program;
}

export default createCLI;
