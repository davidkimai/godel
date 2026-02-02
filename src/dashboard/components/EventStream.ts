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

export function formatEvent(event: Event): string {
  const time = new Date(event.timestamp).toLocaleTimeString();
  return `[${time}] ${event.type}: ${event.message}`;
}
