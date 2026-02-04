/**
 * Dashboard Type Definitions
 * 
 * TypeScript types for the Dash Dashboard UI
 */

// ============================================================================
// Agent Types
// ============================================================================

export enum AgentStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
  BLOCKED = 'blocked',
  KILLED = 'killed',
  OFFLINE = 'offline',
  BUSY = 'busy'
}

export interface Agent {
  id: string;
  label?: string;
  status: AgentStatus;
  lifecycleState?: string;
  model: string;
  task: string;
  swarmId: string;
  spawnedAt: string;
  completedAt?: string;
  runtime: number;
  parentId?: string;
  childIds: string[];
  retryCount: number;
  maxRetries: number;
  lastError?: string;
  budgetLimit?: number;
  budgetConsumed?: number;
  tokensInput: number;
  tokensOutput: number;
  cost: number;
  progress: number;
  metadata: Record<string, unknown>;
}

export interface AgentMetrics {
  total: number;
  online: number;
  offline: number;
  busy: number;
  idle: number;
  error: number;
}

// ============================================================================
// Swarm Types
// ============================================================================

export enum SwarmState {
  CREATING = 'creating',
  ACTIVE = 'active',
  SCALING = 'scaling',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
  DESTROYED = 'destroyed'
}

export type SwarmStrategy = 'parallel' | 'map-reduce' | 'pipeline' | 'tree';

export interface BudgetConfig {
  amount: number;
  currency: string;
  warningThreshold: number;
  criticalThreshold: number;
}

export interface SwarmConfig {
  name: string;
  task: string;
  initialAgents: number;
  maxAgents: number;
  strategy: SwarmStrategy;
  model?: string;
  budget?: BudgetConfig;
  metadata?: Record<string, unknown>;
}

export interface Swarm {
  id: string;
  name: string;
  status: SwarmState;
  config: SwarmConfig;
  agents: string[];
  createdAt: string;
  completedAt?: string;
  budget: {
    allocated: number;
    consumed: number;
    remaining: number;
  };
  metrics: {
    totalAgents: number;
    completedAgents: number;
    failedAgents: number;
  };
  progress: number;
  currentBranch?: string;
}

export interface SwarmStatusInfo {
  id: string;
  name: string;
  status: SwarmState;
  agentCount: number;
  budgetRemaining: number;
  progress: number;
  estimatedCompletion?: string;
}

// ============================================================================
// Task Types
// ============================================================================

export enum TaskStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

export interface Task {
  id: string;
  name: string;
  description?: string;
  status: TaskStatus;
  agentId: string;
  swarmId: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  duration?: number;
  priority: number;
  dependencies: string[];
  progress: number;
  result?: unknown;
  error?: string;
}

// ============================================================================
// Event Types
// ============================================================================

export enum EventType {
  AGENT_CREATED = 'agent.created',
  AGENT_STARTED = 'agent.started',
  AGENT_COMPLETED = 'agent.completed',
  AGENT_FAILED = 'agent.failed',
  AGENT_KILLED = 'agent.killed',
  AGENT_PAUSED = 'agent.paused',
  AGENT_RESUMED = 'agent.resumed',
  SWARM_CREATED = 'swarm.created',
  SWARM_SCALED = 'swarm.scaled',
  SWARM_COMPLETED = 'swarm.completed',
  SWARM_FAILED = 'swarm.failed',
  SWARM_DESTROYED = 'swarm.destroyed',
  SWARM_BUDGET_WARNING = 'swarm.budget.warning',
  SWARM_BUDGET_CRITICAL = 'swarm.budget.critical',
  TASK_CREATED = 'task.created',
  TASK_STARTED = 'task.started',
  TASK_COMPLETED = 'task.completed',
  TASK_FAILED = 'task.failed',
  SYSTEM_HEARTBEAT = 'system.heartbeat',
  SYSTEM_ERROR = 'system.error'
}

export interface AgentEvent {
  id: string;
  type: EventType | string;
  swarmId?: string;
  agentId?: string;
  taskId?: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

export interface EventStreamMetrics {
  eventsPerSecond: number;
  totalEvents: number;
  lastHourEvents: number;
}

// ============================================================================
// Cost/Budget Types
// ============================================================================

export interface CostMetrics {
  totalSpent: number;
  hourlyRate: number;
  projectedHourly: number;
  dailyEstimate: number;
  monthlyEstimate: number;
  budgetRemaining: number;
  budgetAllocated: number;
  burnRate: number;
  timeRemaining: number;
}

export interface CostBreakdown {
  byModel: Record<string, number>;
  bySwarm: Record<string, number>;
  byAgent: Record<string, number>;
  byTime: Array<{
    timestamp: string;
    cost: number;
    cumulative: number;
  }>;
}

// ============================================================================
// WebSocket Types
// ============================================================================

export enum WebSocketMessageType {
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  HEARTBEAT = 'heartbeat',
  SUBSCRIBE = 'subscribe',
  UNSUBSCRIBE = 'unsubscribe',
  EVENT = 'event',
  AGENT_UPDATE = 'agent_update',
  SWARM_UPDATE = 'swarm_update',
  BUDGET_UPDATE = 'budget_update',
  ERROR = 'error'
}

export interface WebSocketMessage {
  type: WebSocketMessageType | string;
  timestamp: number;
  clientId?: string;
  payload?: Record<string, unknown>;
  event?: AgentEvent;
  agent?: Agent;
  swarm?: Swarm;
  budget?: CostMetrics;
  error?: string;
}

// ============================================================================
// API Types
// ============================================================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  source: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface Trace {
  id: string;
  name: string;
  duration: number;
  startTime: string;
  endTime?: string;
  status: 'ok' | 'error';
  spans: TraceSpan[];
}

export interface TraceSpan {
  id: string;
  parentId?: string;
  name: string;
  startTime: string;
  endTime?: string;
  duration: number;
  attributes: Record<string, unknown>;
  status: 'ok' | 'error';
}

// ============================================================================
// Auth Types
// ============================================================================

export enum UserRole {
  READONLY = 'readonly',
  ADMIN = 'admin',
  USER = 'user'
}

export interface User {
  id: string;
  username: string;
  role: UserRole;
  email?: string;
  token: string;
  expiresAt: string;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

// ============================================================================
// UI Types
// ============================================================================

export interface DashboardStats {
  totalAgents: number;
  activeSwarms: number;
  totalCost: number;
  eventsPerSecond: number;
  systemHealth: 'healthy' | 'degraded' | 'critical';
}

export interface FilterState {
  status: AgentStatus | SwarmState | 'all';
  swarmId: string | 'all';
  search: string;
  timeRange: '1h' | '24h' | '7d' | '30d' | 'all';
}

export interface ViewState {
  expandedSwarms: Set<string>;
  selectedAgent: string | null;
  selectedSwarm: string | null;
  viewMode: 'grid' | 'list' | 'tree';
}

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  timestamp: string;
  dismissible: boolean;
}
export { getStatusColor, formatRelativeTime, calculateAgentMetrics, cn } from "../utils/index";
export { formatNumber, formatCurrency } from "../utils/index";
