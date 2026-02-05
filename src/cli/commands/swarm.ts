/**
 * Swarm Commands
 * 
 * Commands:
 * - dash swarm create -n <name> -t <task>
 * - dash swarm list
 * - dash swarm status [id]
 */

import { Command } from 'commander';

export function swarmCommand(): Command {
  const cmd = new Command('swarm')
    .description('Manage agent swarms')
    .configureHelp({ sortOptions: true });
  
  // swarm create
  cmd.addCommand(
    new Command('create')
      .description('Create a new swarm')
      .option('-n, --name <name>', 'Swarm name (required)', '')
      .option('-t, --task <task>', 'Initial task for swarm (required)', '')
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
          console.log('❌  Validation failed:\n');
          errors.forEach(e => console.log(`   ${e}`));
          console.log('\n💡  Usage examples:');
          console.log('   dash swarm create -n "my-swarm" -t "Analyze this codebase"');
          console.log('   dash swarm create --name research --task "Research AI agents"');
          console.log('   dash swarm create -n test -t "Run tests" -a 2');
          process.exit(1);
        }
        
        // Create swarm stub
        console.log(`✅  Swarm created: ${options.name}`);
        console.log(`   Name: ${options.name}`);
        console.log(`   Task: ${options.task}`);
        console.log(`   Agents: ${options.agents}`);
        console.log(`   Provider: ${options.provider}`);
        console.log(`   Model: ${options.model}`);
        
        process.exit(0);
      })
  );
  
  // swarm list
  cmd.addCommand(
    new Command('list')
      .description('List all swarms')
      .option('--json', 'Output as JSON')
      .action(async (options) => {
        const swarms: any[] = [];
        
        if (options.json) {
          console.log(JSON.stringify(swarms, null, 2));
        } else {
          console.log('=== Swarms ===');
          if (swarms.length === 0) {
            console.log('No swarms found');
          } else {
            swarms.forEach(swarm => {
              console.log(`- ${swarm.id}: ${swarm.name} (${swarm.status})`);
              console.log(`  Task: ${swarm.task}`);
              console.log(`  Agents: ${swarm.agentIds.length}`);
            });
          }
        }
        
        process.exit(0);
      })
  );
  
  // swarm status
  cmd.addCommand(
    new Command('status [id]')
      .description('Show swarm status')
      .action(async (id) => {
        if (!id) {
          console.log('❌  Swarm ID required');
          console.log('💡  Usage: dash swarm status <id>');
          process.exit(1);
        }
        
        console.log(`=== Swarm: ${id} ===`);
        console.log(`Status: pending`);
        
        process.exit(0);
      })
  );
  
  return cmd;
}

// Alias for compatibility with existing code
export function registerSwarmCommand(program: Command): void {
  program.addCommand(swarmCommand());
}

export default swarmCommand;
