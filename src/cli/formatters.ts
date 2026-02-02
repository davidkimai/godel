/**
 * Output Formatters for Mission Control CLI
 * Supports JSON and Table output formats
 */

import type { Agent, Task, Event } from '../models';

/**
 * Format agents for output
 */
export function formatAgents(agents: Agent[], format: 'json' | 'table'): string {
  if (format === 'json') {
    return JSON.stringify(agents, null, 2);
  }
  
  // Table format
  const headers = ['ID', 'Status', 'Model', 'Task', 'Runtime', 'Spawned'];
  const rows = agents.map(agent => [
    agent.id.slice(0, 8),
    agent.status,
    agent.model,
    agent.task.slice(0, 20),
    formatDuration(agent.runtime),
    formatDate(agent.spawnedAt)
  ]);
  
  return formatTable(headers, rows);
}

/**
 * Format a single agent for output
 */
export function formatAgent(agent: Agent, format: 'json' | 'table'): string {
  if (format === 'json') {
    return JSON.stringify(agent, null, 2);
  }
  
  const lines = [
    `ID: ${agent.id}`,
    `Status: ${agent.status}`,
    `Model: ${agent.model}`,
    `Task: ${agent.task}`,
    `Runtime: ${formatDuration(agent.runtime)}`,
    `Spawned: ${formatDate(agent.spawnedAt)}`,
    `Context Usage: ${agent.context.contextUsage}/${agent.context.contextWindow}`,
  ];
  
  if (agent.swarmId) {
    lines.push(`Swarm: ${agent.swarmId}`);
  }
  
  if (agent.retryCount > 0) {
    lines.push(`Retries: ${agent.retryCount}/${agent.maxRetries}`);
  }
  
  return lines.join('\n');
}

/**
 * Format tasks for output
 */
export function formatTasks(tasks: Task[], format: 'json' | 'table'): string {
  if (format === 'json') {
    return JSON.stringify(tasks, null, 2);
  }
  
  const headers = ['ID', 'Title', 'Status', 'Assignee', 'Priority', 'Created'];
  const rows = tasks.map(task => [
    task.id.slice(0, 8),
    task.title.slice(0, 25),
    task.status,
    task.assigneeId?.slice(0, 8) || '-',
    task.priority,
    formatDate(task.createdAt)
  ]);
  
  return formatTable(headers, rows);
}

/**
 * Format a single task for output
 */
export function formatTask(task: Task, format: 'json' | 'table'): string {
  if (format === 'json') {
    return JSON.stringify(task, null, 2);
  }
  
  const lines = [
    `ID: ${task.id}`,
    `Title: ${task.title}`,
    `Status: ${task.status}`,
    `Priority: ${task.priority}`,
    `Assignee: ${task.assigneeId || 'Unassigned'}`,
    `Created: ${formatDate(task.createdAt)}`,
    `Updated: ${formatDate(task.updatedAt)}`,
  ];
  
  if (task.dependsOn.length > 0) {
    lines.push(`Depends On: ${task.dependsOn.join(', ')}`);
  }
  
  if (task.blocks.length > 0) {
    lines.push(`Blocks: ${task.blocks.join(', ')}`);
  }
  
  if (task.reasoning) {
    lines.push(`Confidence: ${(task.reasoning.confidence * 100).toFixed(0)}%`);
  }
  
  return lines.join('\n');
}

/**
 * Format events for output
 */
export function formatEvents(events: Event[], format: 'json' | 'table'): string {
  if (format === 'json') {
    return JSON.stringify(events, null, 2);
  }
  
  const headers = ['Timestamp', 'Type', 'Source', 'Data'];
  const rows = events.map(event => [
    formatTime(event.timestamp),
    event.type,
    `${event.entityType}:${event.entityId}`,
    JSON.stringify(event.payload).slice(0, 30)
  ]);
  
  return formatTable(headers, rows);
}

/**
 * Format a single event for output
 */
export function formatEvent(event: Event, format: 'json' | 'table'): string {
  if (format === 'json') {
    return JSON.stringify(event, null, 2);
  }
  
  return [
    `Timestamp: ${formatDate(event.timestamp)}`,
    `Type: ${event.type}`,
    `Source: ${event.entityType}:${event.entityId}`,
    `Data: ${JSON.stringify(event.payload, null, 2)}`
  ].join('\n');
}

/**
 * Format context items for output
 */
export function formatContext(context: Agent['context'], format: 'json' | 'table'): string {
  if (format === 'json') {
    return JSON.stringify(context, null, 2);
  }
  
  const lines = [
    `Context Size: ${context.contextSize} bytes`,
    `Context Window: ${context.contextWindow}`,
    `Context Usage: ${context.contextUsage} (${((context.contextUsage / context.contextWindow) * 100).toFixed(1)}%)`,
    '',
    'Input Context:',
    ...context.inputContext.map(c => `  - ${c}`),
    '',
    'Output Context:',
    ...context.outputContext.map(c => `  - ${c}`),
    '',
    'Shared Context:',
    ...context.sharedContext.map(c => `  - ${c}`),
  ];
  
  return lines.join('\n');
}

/**
 * Format error for output
 */
export function formatError(error: Error | string): string {
  const message = typeof error === 'string' ? error : error.message;
  return JSON.stringify({
    status: 'error',
    message
  }, null, 2);
}

/**
 * Format success response
 */
export function formatSuccess(data: Record<string, unknown>, format: 'json' | 'table'): string {
  if (format === 'json') {
    return JSON.stringify({
      status: 'success',
      ...data
    }, null, 2);
  }
  
  return `✓ ${data['message'] || 'Operation completed successfully'}`;
}

/**
 * Format system status for output
 */
export function formatStatus(status: object, format: 'json' | 'table'): string {
  if (format === 'json') {
    return JSON.stringify({
      status: 'ok',
      ...status
    }, null, 2);
  }
  
  const statusObj = status as Record<string, unknown>;
  const lines = [
    `System Status: ${statusObj['status'] || 'healthy'}`,
    `Timestamp: ${new Date().toISOString()}`,
    ''
  ];
  
  // Format key-value pairs
  for (const [key, value] of Object.entries(statusObj)) {
    if (key !== 'status' && key !== 'timestamp') {
      if (typeof value === 'object' && value !== null) {
        lines.push(`${key}:`);
        for (const [subKey, subValue] of Object.entries(value)) {
          lines.push(`  ${subKey}: ${subValue}`);
        }
      } else {
        lines.push(`${key}: ${value}`);
      }
    }
  }
  
  return lines.join('\n');
}

// Helper: Format duration in human-readable form
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

// Helper: Format date
function formatDate(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Helper: Format time only
function formatTime(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// Helper: Simple table formatter
function formatTable(headers: string[], rows: string[][]): string {
  // Calculate column widths
  const widths = headers.map((h, i) => {
    const lengths = rows.map(r => (r[i] ?? '').length);
    const maxLen = Math.max(h.length, ...lengths);
    return Math.min(maxLen + 2, 40); // Cap at 40 chars
  });
  
  // Build header row
  const headerRow = headers.map((h, i) => h.padEnd(widths[i])).join(' | ');
  const separator = widths.map(w => '-'.repeat(w)).join('-+-');
  
  // Build data rows
  const dataRows = rows.map(row => 
    row.map((cell, i) => {
      const width = widths[i] ?? 20;
      return (cell ?? '').substring(0, width - 1).padEnd(width);
    }).join(' | ')
  );
  
  return [headerRow, separator, ...dataRows].join('\n');
}
