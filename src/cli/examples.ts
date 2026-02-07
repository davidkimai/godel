import { logger } from '../utils/logger';
/**
 * CLI Examples - Usage Examples for Godel Commands
 */

export const EXAMPLES = {
  status: [
    { description: 'Show basic status', command: 'godel status' },
    { description: 'Show status without OpenClaw', command: 'godel status --simple' },
    { description: 'Output as JSON', command: 'godel status --json' }
  ],
  config: [
    { description: 'Get server port', command: 'godel config get server.port' },
    { description: 'List all config', command: 'godel config list' },
    { description: 'Get database URL', command: 'godel config get database.url' }
  ],
  team: [
    { description: 'Create team with name and task', command: 'godel team create -n research -t "Analyze AI"' },
    { description: 'Create team with custom agents', command: 'godel team create --name coding --task "Fix bugs" -a 5' },
    { description: 'List all teams', command: 'godel team list' },
    { description: 'Show team status', command: 'godel team status <id>' }
  ],
  agent: [
    { description: 'List all agents', command: 'godel agent list' },
    { description: 'Create new agent', command: 'godel agent create --name coder --provider anthropic --model claude' },
    { description: 'Spawn agent for task', command: 'godel agent spawn "Review this PR"' }
  ]
};

export function printHelp(command: string): void {
  const examples = EXAMPLES[command as keyof typeof EXAMPLES];
  if (!examples) return;
  
  logger.info(`\nExamples:`);
  examples.forEach(ex => {
    logger.info(`  ${ex.command}`);
    logger.info(`     # ${ex.description}`);
  });
}

export default { EXAMPLES, printHelp };
