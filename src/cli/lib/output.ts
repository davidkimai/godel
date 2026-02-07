/**
 * Output Formatting Library
 * 
 * Provides consistent output formatting for CLI commands:
 * - Table format (default)
 * - JSON format
 * - JSONL format (JSON Lines)
 */

import type { Agent } from '../../models/agent';
import type { Task } from '../../models/task';
import type { Event } from '../../models/event';
import type { Team, TeamStatusInfo } from '../../core/team';
import type { Message } from '../../bus/index';

export type OutputFormat = 'table' | 'json' | 'jsonl';

export interface FormatOptions {
  format: OutputFormat;
  compact?: boolean;
  fields?: string[];
}

/**
 * Format data according to the specified output format
 */
export function formatOutput<T>(data: T | T[], options: FormatOptions): string {
  switch (options.format) {
    case 'json':
      return formatJson(data, options.compact);
    case 'jsonl':
      return formatJsonl(data);
    case 'table':
    default:
      return formatTable(data, options.fields);
  }
}

/**
 * Format as JSON
 */
function formatJson<T>(data: T | T[], compact: boolean = false): string {
  if (compact) {
    return JSON.stringify(data);
  }
  return JSON.stringify(data, null, 2);
}

/**
 * Format as JSON Lines (JSONL)
 */
function formatJsonl<T>(data: T | T[]): string {
  const items = Array.isArray(data) ? data : [data];
  return items.map(item => JSON.stringify(item)).join('\n');
}

/**
 * Format as table
 */
function formatTable<T>(data: T | T[], fields?: string[]): string {
  const items = Array.isArray(data) ? data : [data];
  
  if (items.length === 0) {
    return 'No data to display';
  }

  // Auto-detect fields if not provided
  const autoFields = fields || Object.keys(items[0] as Record<string, unknown>);
  
  // Calculate column widths
  const widths: Record<string, number> = {};
  for (const field of autoFields) {
    const headerLength = field.length;
    const maxDataLength = Math.max(
      ...items.map(item => {
        const value = getNestedValue(item as Record<string, unknown>, field);
        return String(value ?? '-').length;
      })
    );
    widths[field] = Math.max(headerLength, maxDataLength, 10);
  }

  // Build table
  const lines: string[] = [];
  
  // Header
  const header = autoFields
    .map(f => f.toUpperCase().padEnd(widths[f]))
    .join('  ');
  lines.push(header);
  lines.push(autoFields.map(f => '─'.repeat(widths[f])).join('  '));
  
  // Rows
  for (const item of items) {
    const row = autoFields
      .map(f => {
        const value = getNestedValue(item as Record<string, unknown>, f);
        return String(value ?? '-').padEnd(widths[f]);
      })
      .join('  ');
    lines.push(row);
  }
  
  return lines.join('\n');
}

/**
 * Get nested value from object using dot notation
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  
  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  
  return current;
}

// ============================================================================
// Agent Formatting
// ============================================================================

export interface AgentOutput {
  id: string;
  label?: string;
  status: string;
  model: string;
  runtime: string;
  task: string;
  teamId?: string;
  parentId?: string;
  runtimeMs: number;
  retryCount: number;
  maxRetries: number;
  spawnedAt: string;
  completedAt?: string;
  contextUsage: number;
}

export function agentToOutput(agent: Agent): AgentOutput {
  // Get runtime from metadata (set by runtime implementations) or default to 'unknown'
  const metadata = agent.metadata as Record<string, unknown> | undefined;
  const agentData = metadata?.['agent'] as Record<string, unknown> | undefined;
  const runtimeId = (metadata?.['runtime'] as string) ||
                   (agentData?.['runtime'] as string) ||
                   'unknown';

  return {
    id: agent.id,
    label: agent.label,
    status: agent.status,
    model: agent.model,
    runtime: runtimeId,
    task: agent.task.slice(0, 50) + (agent.task.length > 50 ? '...' : ''),
    teamId: agent.teamId,
    parentId: agent.parentId,
    runtimeMs: agent.runtime,
    retryCount: agent.retryCount,
    maxRetries: agent.maxRetries,
    spawnedAt: agent.spawnedAt.toISOString(),
    completedAt: agent.completedAt?.toISOString(),
    contextUsage: Math.round(agent.context.contextUsage * 100) / 100,
  };
}

export function formatAgents(agents: Agent[], options: FormatOptions): string {
  const outputs = agents.map(agentToOutput);

  if (options.format === 'table') {
    const fields = ['id', 'status', 'runtime', 'model', 'task', 'runtimeMs', 'retryCount'];
    return formatOutput(outputs, { ...options, fields });
  }

  return formatOutput(outputs, options);
}

// ============================================================================
// Task Formatting
// ============================================================================

export interface TaskOutput {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  assigneeId?: string;
  dependsOn: string[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export function taskToOutput(task: Task): TaskOutput {
  return {
    id: task.id,
    title: task.title,
    description: task.description.slice(0, 60) + (task.description.length > 60 ? '...' : ''),
    status: task.status,
    priority: task['priority'],
    assigneeId: task.assigneeId,
    dependsOn: task.dependsOn,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    completedAt: task.completedAt?.toISOString(),
  };
}

export function formatTasks(tasks: Task[], options: FormatOptions): string {
  const outputs = tasks.map(taskToOutput);
  
  if (options.format === 'table') {
    const fields = ['id', 'title', 'status', 'priority', 'assigneeId'];
    return formatOutput(outputs, { ...options, fields });
  }
  
  return formatOutput(outputs, options);
}

// ============================================================================
// Team Formatting
// ============================================================================

export interface TeamOutput {
  id: string;
  name: string;
  status: string;
  strategy: string;
  agentCount: number;
  maxAgents: number;
  progress: number;
  budgetAllocated: number;
  budgetConsumed: number;
  budgetRemaining: number;
  createdAt: string;
}

export function teamToOutput(team: Team): TeamOutput {
  const progress = team.metrics.totalAgents > 0
    ? team.metrics.completedAgents / team.metrics.totalAgents
    : 0;
    
  return {
    id: team.id,
    name: team.name,
    status: team.status,
    strategy: team.config.strategy,
    agentCount: team.agents.length,
    maxAgents: team.config.maxAgents,
    progress: Math.round(progress * 100) / 100,
    budgetAllocated: team.budget.allocated,
    budgetConsumed: team.budget.consumed,
    budgetRemaining: team.budget.remaining,
    createdAt: team.createdAt.toISOString(),
  };
}

export function formatTeams(teams: Team[], options: FormatOptions): string {
  const outputs = teams.map(teamToOutput);
  
  if (options.format === 'table') {
    const fields = ['id', 'name', 'status', 'agentCount', 'progress', 'budgetRemaining'];
    return formatOutput(outputs, { ...options, fields });
  }
  
  return formatOutput(outputs, options);
}

export function formatTeamStatus(team: Team, statusInfo: TeamStatusInfo, options: FormatOptions): string {
  if (options.format === 'json' || options.format === 'jsonl') {
    return formatOutput({ team: teamToOutput(team), status: statusInfo }, options);
  }
  
  // Table format
  const lines: string[] = [];
  lines.push(`TEAM: ${team.name}`);
  lines.push('');
  lines.push(`  ID:           ${team.id}`);
  lines.push(`  Status:       ${getStatusEmoji(team.status)} ${team.status}`);
  lines.push(`  Strategy:     ${team.config.strategy}`);
  lines.push(`  Agents:       ${team.agents.length} / ${team.config.maxAgents}`);
  lines.push(`  Progress:     ${(statusInfo.progress * 100).toFixed(1)}%`);
  
  if (team.budget.allocated > 0) {
    lines.push('');
    lines.push(`  Budget:`);
    lines.push(`    Allocated:  $${team.budget.allocated.toFixed(2)}`);
    lines.push(`    Consumed:   $${team.budget.consumed.toFixed(2)}`);
    lines.push(`    Remaining:  $${team.budget.remaining.toFixed(2)}`);
  }
  
  lines.push('');
  lines.push(`  Metrics:`);
  lines.push(`    Total:      ${team.metrics.totalAgents}`);
  lines.push(`    Completed:  ${team.metrics.completedAgents}`);
  lines.push(`    Failed:     ${team.metrics.failedAgents}`);
  
  return lines.join('\n');
}

// ============================================================================
// Event Formatting
// ============================================================================

export interface EventOutput {
  id: string;
  type: string;
  timestamp: string;
  entityId: string;
  entityType: string;
  severity: string;
  message: string;
}

export function eventToOutput(event: Event): EventOutput {
  const severity = getEventSeverity(event.type);
  const message = getEventMessage(event);
  
  return {
    id: event.id,
    type: event.type,
    timestamp: event.timestamp.toISOString(),
    entityId: event.entityId,
    entityType: event.entityType,
    severity,
    message,
  };
}

export function formatEvents(events: Event[], options: FormatOptions): string {
  const outputs = events.map(eventToOutput);
  
  if (options.format === 'table') {
    const fields = ['timestamp', 'severity', 'type', 'entityId', 'message'];
    return formatOutput(outputs, { ...options, fields });
  }
  
  return formatOutput(outputs, options);
}

// ============================================================================
// Message Bus Formatting
// ============================================================================

export interface MessageOutput {
  id: string;
  topic: string;
  timestamp: string;
  source?: string;
  priority?: string;
}

export function messageToOutput(message: Message): MessageOutput {
  return {
    id: message.id,
    topic: message.topic,
    timestamp: message.timestamp.toISOString(),
    source: message.metadata?.source,
    priority: message.metadata?.priority,
  };
}

export function formatMessages(messages: Message[], options: FormatOptions): string {
  const outputs = messages.map(messageToOutput);
  
  if (options.format === 'table') {
    const fields = ['timestamp', 'topic', 'source', 'priority'];
    return formatOutput(outputs, { ...options, fields });
  }
  
  return formatOutput(outputs, options);
}

// ============================================================================
// Metrics Formatting
// ============================================================================

export interface MetricsOutput {
  timestamp: string;
  activeAgents: number;
  totalAgents: number;
  completedAgents: number;
  failedAgents: number;
  activeTeams: number;
  totalTeams: number;
  eventsProcessed: number;
  messagesPublished: number;
  averageRuntime: number;
  successRate: number;
}

export function formatMetrics(metrics: MetricsOutput, options: FormatOptions): string {
  if (options.format === 'json' || options.format === 'jsonl') {
    return formatOutput(metrics, options);
  }
  
  const lines: string[] = [];
  lines.push('METRICS');
  lines.push('');
  lines.push(`  Timestamp:          ${metrics.timestamp}`);
  lines.push('');
  lines.push('  Agents:');
  lines.push(`    Active:           ${metrics.activeAgents}`);
  lines.push(`    Total:            ${metrics.totalAgents}`);
  lines.push(`    Completed:        ${metrics.completedAgents}`);
  lines.push(`    Failed:           ${metrics.failedAgents}`);
  lines.push('');
  lines.push('  Teams:');
  lines.push(`    Active:           ${metrics.activeTeams}`);
  lines.push(`    Total:            ${metrics.totalTeams}`);
  lines.push('');
  lines.push('  Events:');
  lines.push(`    Processed:        ${metrics.eventsProcessed}`);
  lines.push(`    Messages:         ${metrics.messagesPublished}`);
  lines.push('');
  lines.push('  Performance:');
  lines.push(`    Avg Runtime:      ${formatDuration(metrics.averageRuntime)}`);
  lines.push(`    Success Rate:     ${(metrics.successRate * 100).toFixed(1)}%`);
  
  return lines.join('\n');
}

// ============================================================================
// Helper Functions
// ============================================================================

function getStatusEmoji(status: string): string {
  const emojiMap: Record<string, string> = {
    creating: '🔄',
    active: '✅',
    scaling: '📊',
    paused: '⏸️',
    completed: '🎉',
    failed: '❌',
    destroyed: '💥',
    pending: '⏳',
    running: '🏃',
    killed: '☠️',
    blocked: '🚫',
    in_progress: '🔨',
    awaiting_approval: '⏳',
    cancelled: '🚫',
  };
  return emojiMap[status] || '❓';
}

function getEventSeverity(eventType: string): string {
  if (eventType.includes('failed') || eventType.includes('error')) return 'error';
  if (eventType.includes('critical') || eventType.includes('emergency')) return 'critical';
  if (eventType.includes('warning')) return 'warning';
  if (eventType.includes('completed') || eventType.includes('success')) return 'info';
  return 'debug';
}

function getEventMessage(event: Event): string {
  const payload = event['payload'] as Record<string, unknown> | undefined;
  if (!payload) return event.type;
  
  // Extract meaningful message from payload
  if (typeof payload["message"] === 'string') return payload["message"];
  if (typeof payload["error"] === 'string') return payload["error"];
  if (typeof payload["reason"] === 'string') return payload["reason"];
  
  return event.type;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

// ============================================================================
// Progress Bar
// ============================================================================

export function formatProgressBar(progress: number, width: number = 30): string {
  const filled = Math.round(width * progress);
  const empty = width - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

// ============================================================================
// Colors (for terminal output)
// ============================================================================

export const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

export function colorize(text: string, color: keyof typeof colors): string {
  return `${colors[color]}${text}${colors.reset}`;
}
