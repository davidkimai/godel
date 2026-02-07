/**
 * Team Commands
 * 
 * Commands:
 * - godel team create -n <name> -t <task>
 * - godel team list
 * - godel team status [id]
 */

import { logger } from '../../utils/logger';
import { Command } from 'commander';

export function teamCommand(): Command {
  const cmd = new Command('team')
    .description('Manage agent teams')
    .configureHelp({ sortOptions: true });
  
  // team create
  cmd.addCommand(
    new Command('create')
      .description('Create a new team')
      .option('-n, --name <name>', 'Team name (required)', '')
      .option('-t, --task <task>', 'Initial task for team (required)', '')
      .option('-a, --agents <count>', 'Number of agents', '3')
      .option('--provider <provider>', 'Default LLM provider', 'anthropic')
      .option('--model <model>', 'Default model', 'claude-sonnet-4-20250514')
      .action(async (options) => {
        const errors: string[] = [];
        
        if (!options.name) {
          errors.push('Missing required option: --name or -n');
        }
        if (!options.task) {
          errors.push('Missing required option: --task or -t');
        }
        
        if (errors.length > 0) {
          logger.info('❌  Validation failed:\n');
          errors.forEach(e => logger.info(`   ${e}`));
          logger.info('\n💡  Usage examples:');
          logger.info('   godel team create -n "my-team" -t "Analyze this codebase"');
          logger.info('   godel team create --name research --task "Research AI agents"');
          logger.info('   godel team create -n test -t "Run tests" -a 2');
          process.exit(1);
        }
        
        // Create team stub
        logger.info(`✅  Team created: ${options.name}`);
        logger.info(`   Name: ${options.name}`);
        logger.info(`   Task: ${options.task}`);
        logger.info(`   Agents: ${options.agents}`);
        logger.info(`   Provider: ${options.provider}`);
        logger.info(`   Model: ${options.model}`);
        
        process.exit(0);
      })
  );
  
  // team list
  cmd.addCommand(
    new Command('list')
      .description('List all teams')
      .option('--json', 'Output as JSON')
      .action(async (options) => {
        const teams: any[] = [];
        
        if (options.json) {
          logger.info(JSON.stringify(teams, null, 2));
        } else {
          logger.info('=== Teams ===');
          if (teams.length === 0) {
            logger.info('No teams found');
          } else {
            teams.forEach(team => {
              logger.info(`- ${team.id}: ${team.name} (${team.status})`);
              logger.info(`  Task: ${team.task}`);
              logger.info(`  Agents: ${team.agentIds.length}`);
            });
          }
        }
        
        process.exit(0);
      })
  );
  
  // team status
  cmd.addCommand(
    new Command('status [id]')
      .description('Show team status')
      .action(async (id) => {
        if (!id) {
          logger.info('❌  Team ID required');
          logger.info('💡  Usage: godel team status <id>');
          process.exit(1);
        }
        
        logger.info(`=== Team: ${id} ===`);
        logger.info(`Status: pending`);
        
        process.exit(0);
      })
  );
  
  return cmd;
}

// Alias for compatibility with existing code
export function registerTeamCommand(program: Command): void {
  program.addCommand(teamCommand());
}

export default teamCommand;
