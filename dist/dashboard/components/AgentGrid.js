"use strict";
/**
 * Agent Grid Component
 *
 * Renders agent list for blessed interface.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatAgentRow = formatAgentRow;
function formatAgentRow(agent) {
    const tokens = (agent.tokens_input + agent.tokens_output).toLocaleString().padStart(8);
    const status = agent.status.padEnd(10);
    const cost = `$${agent.cost.toFixed(2)}`.padStart(8);
    const id = agent.id.slice(0, 20).padEnd(22);
    return `${id} ${status} ${tokens} ${cost}`;
}
//# sourceMappingURL=AgentGrid.js.map