/**
 * Event Stream Component
 *
 * Formats events for display.
 */
export interface Event {
    id: string;
    timestamp: string;
    type: string;
    severity: 'debug' | 'info' | 'warning' | 'error' | 'critical';
    message: string;
    agent_id?: string;
}
export declare function formatEvent(event: Event): string;
//# sourceMappingURL=EventStream.d.ts.map