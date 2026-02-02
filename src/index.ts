#!/usr/bin/env node
/**
 * Dash CLI - Entry Point
 * 
 * Agent Orchestration Platform
 * 
 * Usage:
 *   dash <command> [options]
 * 
 * Commands:
 *   agents   Manage agents (list, status, spawn, kill, pause, resume)
 *   tasks    Manage tasks (list, create, update, assign)
 *   events   Manage events (stream, replay, history)
 *   context  Manage context (get, add, remove, tree)
 *   status   Display system status
 *   help     Show help
 * 
 * Global Options:
 *   --format <json|table>  Output format (default: table)
 *   --output <path>        Output to file
 *   --quiet                Suppress non-essential output
 *   --debug                Enable debug mode
 */

import { buildCLI, handleError } from './cli/main';

async function main(): Promise<void> {
  try {
    const program = await buildCLI();
    
    // Parse command line arguments
    program.parse(process.argv);
    
    // If no command was provided, show help
    if (process.argv.length === 2) {
      program.help();
    }
  } catch (error) {
    handleError(error);
  }
}

// Run the CLI
main().catch(handleError);
