#!/usr/bin/env node
/**
 * Dash CLI - Agent Orchestration Platform
 * Entry point for the dash command-line interface
 */

import { Command } from 'commander';
import { registerCommands } from './cli/index.js';

const program = new Command();

program
  .name('dash')
  .description('Dash - Agent Orchestration Platform')
  .version('1.0.0');

// Register all commands
registerCommands(program);

// Global error handlers
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
  process.exit(1);
});

// Parse CLI arguments
program.parse();

// If no arguments provided, show help
if (process.argv.length <= 2) {
  program.help();
}
