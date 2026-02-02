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
export declare function formatAgentRow(agent: Agent): string;
//# sourceMappingURL=AgentGrid.d.ts.map