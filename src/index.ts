#!/usr/bin/env node
/**
 * Godel CLI Entry Point - v2 Implementation
 * 
 * Main entry point for the Godel CLI tool.
 * Uses commander.js for command parsing and registration.
 * 
 * Per SPEC_v2.md, supports:
 * - godel team create/destroy/scale/status
 * - godel dashboard (launch TUI)
 * - godel agents spawn/kill/pause/resume
 * - godel events stream/list
 */

import { logger } from './integrations/utils/logger';
import { Command } from 'commander';
import { registerCommands } from './cli/index';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ============================================================================
// VERSION LOADING
// ============================================================================

/**
 * Load version from package.json
 */
function getVersion(): string {
  try {
    // Use __dirname equivalent for CommonJS
    const packagePath = resolve(process.cwd(), 'package.json');
    const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));
    return packageJson.version || '2.0.0';
  } catch {
    return '2.0.0';
  }
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

async function main(): Promise<void> {
  try {
    // Configure the base program
    const program = new Command();
    
    program
      .name('godel')
      .description('Godel - AI-Powered Mission Control CLI v2')
      .version(getVersion(), '-v, --version', 'Display version number')
      .helpOption('-h, --help', 'Display help for command')
      .configureOutput({
        writeOut: (str) => process.stdout.write(str),
        writeErr: (str) => process.stderr.write(str),
        getOutHelpWidth: () => 80,
        getErrHelpWidth: () => 80,
      });

    // Setup all CLI commands (v1 + v2 per SPEC_v2.md)
    registerCommands(program);

    // Parse command line arguments
    await program.parseAsync(process.argv);

    // If no arguments provided, show help
    if (process.argv.length <= 2) {
      program.help();
    }
  } catch (error) {
    logger.error('❌ Fatal error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('❌ Uncaught exception:', error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('❌ Unhandled rejection:', reason);
  process.exit(1);
});

// Run the CLI
main();
