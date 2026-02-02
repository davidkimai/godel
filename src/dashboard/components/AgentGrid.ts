/**
 * Agent Grid Component
 * 
 * Renders agent list for blessed interface.
 */

export interface Agent {
  id: string;
  status: string;
  task: string;
  model?: string;
  tokens_input: number;
  tokens_output: number;
  cost: number;
}

export function formatAgentRow(agent: Agent): string {
  const tokens = (agent.tokens_input + agent.tokens_output).toLocaleString().padStart(8);
  const status = agent.status.padEnd(10);
  const cost = `$${agent.cost.toFixed(2)}`.padStart(8);
  const id = agent.id.slice(0, 20).padEnd(22);
  return `${id} ${status} ${tokens} ${cost}`;
}
