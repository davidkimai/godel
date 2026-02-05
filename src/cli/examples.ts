/**
 * CLI Examples - Usage Examples for Dash Commands
 */

export const EXAMPLES = {
  status: [
    { description: 'Show basic status', command: 'dash status' },
    { description: 'Show status without OpenClaw', command: 'dash status --simple' },
    { description: 'Output as JSON', command: 'dash status --json' }
  ],
  config: [
    { description: 'Get server port', command: 'dash config get server.port' },
    { description: 'List all config', command: 'dash config list' },
    { description: 'Get database URL', command: 'dash config get database.url' }
  ],
  swarm: [
    { description: 'Create swarm with name and task', command: 'dash swarm create -n research -t "Analyze AI"' },
    { description: 'Create swarm with custom agents', command: 'dash swarm create --name coding --task "Fix bugs" -a 5' },
    { description: 'List all swarms', command: 'dash swarm list' },
    { description: 'Show swarm status', command: 'dash swarm status <id>' }
  ],
  agent: [
    { description: 'List all agents', command: 'dash agent list' },
    { description: 'Create new agent', command: 'dash agent create --name coder --provider anthropic --model claude' },
    { description: 'Spawn agent for task', command: 'dash agent spawn "Review this PR"' }
  ]
};

export function printHelp(command: string): void {
  const examples = EXAMPLES[command as keyof typeof EXAMPLES];
  if (!examples) return;
  
  console.log(`\nExamples:`);
  examples.forEach(ex => {
    console.log(`  ${ex.command}`);
    console.log(`     # ${ex.description}`);
  });
}

export default { EXAMPLES, printHelp };
