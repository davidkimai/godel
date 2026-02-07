/**
 * API Service
 * 
 * HTTP API client for the Godel Dashboard
 * Updated to use the Fastify REST API endpoints
 */

import type {
  Agent,
  Team,
  Task,
  AgentEvent,
  LogEntry,
  Trace,
  ApiResponse,
  PaginatedResponse,
  CostMetrics,
  CostBreakdown,
  DashboardStats
} from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:7373';
const API_PREFIX = (import.meta.env.VITE_API_PREFIX || '/api/v1').replace(/\/+$/, '');

// ============================================================================
// HTTP Client
// ============================================================================

class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const normalizedEndpoint = endpoint.startsWith('/api/')
    ? endpoint.replace(/^\/api(?=\/)/, API_PREFIX)
    : endpoint;

  const token = localStorage.getItem('dash_token');
  const apiKey = localStorage.getItem('dash_api_key');
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers as Record<string, string>,
  };
  
  // Add authentication
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  } else if (apiKey) {
    headers['X-API-Key'] = apiKey;
  }
  
  const response = await fetch(`${API_BASE_URL}${normalizedEndpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new ApiError(
      errorData.error?.message || `HTTP ${response.status}`,
      response.status,
      errorData
    );
  }

  return response.json();
}

// ============================================================================
// Capabilities API
// ============================================================================

export const capabilitiesApi = {
  async getCapabilities(): Promise<{
    version: string;
    capabilities: Array<{
      name: string;
      description: string;
      version: string;
      endpoints: Array<{
        method: string;
        path: string;
        description: string;
      }>;
    }>;
  }> {
    const response = await fetchApi<ApiResponse<{
      version: string;
      capabilities: Array<{
        name: string;
        description: string;
        version: string;
        endpoints: Array<{
          method: string;
          path: string;
          description: string;
        }>;
      }>;
    }>>('/api/capabilities');
    return response.data!;
  },
};

// ============================================================================
// Team API
// ============================================================================

export const swarmApi = {
  async list(): Promise<Team[]> {
    const response = await fetchApi<ApiResponse<{ teams: Team[]; hasMore: boolean; nextCursor?: string }>>('/api/teams');
    return response.data?.teams || [];
  },

  async get(id: string): Promise<Team> {
    const response = await fetchApi<ApiResponse<Team>>(`/api/teams/${id}`);
    if (!response.data) throw new Error('Team not found');
    return response.data;
  },

  async create(name: string, config?: Partial<Team['config']>): Promise<Team> {
    const response = await fetchApi<ApiResponse<Team>>('/api/teams', {
      method: 'POST',
      body: JSON.stringify({ name, config })
    });
    if (!response.data) throw new Error('Failed to create team');
    return response.data;
  },

  async update(id: string, updates: Partial<Team>): Promise<Team> {
    const response = await fetchApi<ApiResponse<Team>>(`/api/teams/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    });
    if (!response.data) throw new Error('Failed to update team');
    return response.data;
  },

  async start(id: string): Promise<void> {
    await fetchApi<ApiResponse<void>>(`/api/teams/${id}/start`, {
      method: 'POST'
    });
  },

  async stop(id: string): Promise<void> {
    await fetchApi<ApiResponse<void>>(`/api/teams/${id}/stop`, {
      method: 'POST'
    });
  },

  async scale(id: string, targetSize: number): Promise<void> {
    await fetchApi<ApiResponse<void>>(`/api/teams/${id}/scale`, {
      method: 'POST',
      body: JSON.stringify({ targetSize })
    });
  },

  async pause(id: string): Promise<void> {
    await fetchApi<ApiResponse<void>>(`/api/teams/${id}/pause`, {
      method: 'POST'
    });
  },

  async resume(id: string): Promise<void> {
    await fetchApi<ApiResponse<void>>(`/api/teams/${id}/resume`, {
      method: 'POST'
    });
  },

  async destroy(id: string): Promise<void> {
    await fetchApi<ApiResponse<void>>(`/api/teams/${id}`, {
      method: 'DELETE'
    });
  },

  async getEvents(id: string, limit = 100): Promise<AgentEvent[]> {
    const response = await fetchApi<ApiResponse<{ events: AgentEvent[] }>>(
      `/api/teams/${id}/events?limit=${limit}`
    );
    return response.data?.events || [];
  },

  async getTree(id: string): Promise<unknown> {
    const response = await fetchApi<ApiResponse<unknown>>(`/api/teams/${id}/tree`);
    return response.data;
  },

  async getBranches(id: string): Promise<{ branches: string[]; currentBranch: string }> {
    const response = await fetchApi<ApiResponse<{ branches: string[]; currentBranch: string }>>(
      `/api/teams/${id}/branches`
    );
    return response.data || { branches: [], currentBranch: 'main' };
  },

  async createBranch(id: string, name: string, description?: string): Promise<{ entryId: string; name: string }> {
    const response = await fetchApi<ApiResponse<{ entryId: string; name: string }>>(`/api/teams/${id}/branches`, {
      method: 'POST',
      body: JSON.stringify({ name, description })
    });
    if (!response.data) throw new Error('Failed to create branch');
    return response.data;
  },

  async switchBranch(id: string, branchName: string): Promise<void> {
    await fetchApi<ApiResponse<void>>(`/api/teams/${id}/switch-branch`, {
      method: 'POST',
      body: JSON.stringify({ branchName })
    });
  }
};

// ============================================================================
// Agent API
// ============================================================================

export const agentApi = {
  async list(): Promise<Agent[]> {
    const response = await fetchApi<ApiResponse<{ agents: Agent[]; hasMore: boolean; nextCursor?: string }>>('/api/agents');
    return response.data?.agents || [];
  },

  async get(id: string): Promise<Agent> {
    const response = await fetchApi<ApiResponse<Agent>>(`/api/agents/${id}`);
    if (!response.data) throw new Error('Agent not found');
    return response.data;
  },

  async spawn(options: {
    model: string;
    task: string;
    label?: string;
    teamId?: string;
    parentId?: string;
    maxRetries?: number;
    budgetLimit?: number;
    contextItems?: string[];
    language?: string;
  }): Promise<Agent> {
    const response = await fetchApi<ApiResponse<Agent>>('/api/agents', {
      method: 'POST',
      body: JSON.stringify(options)
    });
    if (!response.data) throw new Error('Failed to spawn agent');
    return response.data;
  },

  async kill(id: string): Promise<void> {
    await fetchApi<ApiResponse<void>>(`/api/agents/${id}/kill`, {
      method: 'POST'
    });
  },

  async restart(id: string): Promise<Agent> {
    const response = await fetchApi<ApiResponse<Agent>>(`/api/agents/${id}/restart`, {
      method: 'POST'
    });
    if (!response.data) throw new Error('Failed to restart agent');
    return response.data;
  },

  async pause(id: string): Promise<void> {
    await fetchApi<ApiResponse<void>>(`/api/agents/${id}/pause`, {
      method: 'POST'
    });
  },

  async resume(id: string): Promise<void> {
    await fetchApi<ApiResponse<void>>(`/api/agents/${id}/resume`, {
      method: 'POST'
    });
  },

  async getLogs(id: string, lines = 100): Promise<LogEntry[]> {
    const response = await fetchApi<ApiResponse<{ logs: LogEntry[] }>>(
      `/api/agents/${id}/logs?lines=${lines}`
    );
    return response.data?.logs || [];
  },

  async getTrace(id: string): Promise<Trace | null> {
    const response = await fetchApi<ApiResponse<{ trace: Trace }>>(
      `/api/agents/${id}/trace`
    );
    return response.data?.trace || null;
  },

  async delete(id: string): Promise<void> {
    await fetchApi<ApiResponse<void>>(`/api/agents/${id}`, {
      method: 'DELETE'
    });
  }
};

// ============================================================================
// Task API
// ============================================================================

export const taskApi = {
  async list(teamId?: string): Promise<Task[]> {
    const query = teamId ? `?teamId=${teamId}` : '';
    const response = await fetchApi<ApiResponse<{ tasks: Task[]; hasMore: boolean; nextCursor?: string }>>(`/api/tasks${query}`);
    return response.data?.tasks || [];
  },

  async get(id: string): Promise<Task> {
    const response = await fetchApi<ApiResponse<Task>>(`/api/tasks/${id}`);
    if (!response.data) throw new Error('Task not found');
    return response.data;
  },

  async create(options: {
    title: string;
    description: string;
    assigneeId?: string;
    dependsOn?: string[];
    priority?: 'low' | 'medium' | 'high' | 'critical';
  }): Promise<Task> {
    const response = await fetchApi<ApiResponse<Task>>('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(options)
    });
    if (!response.data) throw new Error('Failed to create task');
    return response.data;
  },

  async update(id: string, updates: Partial<Task>): Promise<Task> {
    const response = await fetchApi<ApiResponse<Task>>(`/api/tasks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    });
    if (!response.data) throw new Error('Failed to update task');
    return response.data;
  },

  async delete(id: string): Promise<void> {
    await fetchApi<ApiResponse<void>>(`/api/tasks/${id}`, {
      method: 'DELETE'
    });
  },

  async assign(id: string, agentId: string): Promise<void> {
    await fetchApi<ApiResponse<void>>(`/api/tasks/${id}/assign`, {
      method: 'POST',
      body: JSON.stringify({ agentId })
    });
  }
};

// ============================================================================
// Event API
// ============================================================================

export const eventApi = {
  async list(options: {
    limit?: number;
    teamId?: string;
    agentId?: string;
    type?: string;
  } = {}): Promise<PaginatedResponse<AgentEvent>> {
    const params = new URLSearchParams();
    if (options.limit) params.append('limit', options.limit.toString());
    if (options.teamId) params.append('teamId', options.teamId);
    if (options.agentId) params.append('agentId', options.agentId);
    if (options.type) params.append('type', options.type);

    const response = await fetchApi<ApiResponse<PaginatedResponse<AgentEvent>>>(
      `/api/bus/events?${params.toString()}`
    );
    return response.data || { items: [], total: 0, page: 1, pageSize: 50, hasMore: false };
  },

  async publish(type: string, payload: Record<string, unknown>, options?: {
    source?: string;
    target?: string;
  }): Promise<void> {
    await fetchApi<ApiResponse<void>>('/api/bus/publish', {
      method: 'POST',
      body: JSON.stringify({
        type,
        payload,
        source: options?.source || 'dashboard',
        target: options?.target,
      })
    });
  },

  createEventSource(options?: {
    type?: string;
    target?: string;
  }): EventSource {
    const token = localStorage.getItem('dash_token');
    const params = new URLSearchParams();
    if (token) params.append('token', token);
    if (options?.type) params.append('type', options.type);
    if (options?.target) params.append('target', options.target);
    
    return new EventSource(`${API_BASE_URL}/api/bus/subscribe?${params.toString()}`);
  }
};

// ============================================================================
// Metrics API
// ============================================================================

export const metricsApi = {
  async getDashboardStats(): Promise<DashboardStats> {
    const response = await fetchApi<ApiResponse<DashboardStats>>('/api/metrics/dashboard');
    if (!response.data) throw new Error('Failed to get dashboard stats');
    return response.data;
  },

  async getCostMetrics(): Promise<CostMetrics> {
    const response = await fetchApi<ApiResponse<CostMetrics>>('/api/metrics/cost');
    if (!response.data) throw new Error('Failed to get cost metrics');
    return response.data;
  },

  async getCostBreakdown(): Promise<CostBreakdown> {
    const response = await fetchApi<ApiResponse<CostBreakdown>>('/api/metrics/cost/breakdown');
    if (!response.data) throw new Error('Failed to get cost breakdown');
    return response.data;
  },

  async getPrometheusMetrics(): Promise<string> {
    const response = await fetch(`${API_BASE_URL}/metrics`);
    if (!response.ok) throw new Error('Failed to get Prometheus metrics');
    return response.text();
  },

  async getJsonMetrics(): Promise<Record<string, unknown>> {
    const response = await fetchApi<ApiResponse<Record<string, unknown>>>('/api/metrics/json');
    if (!response.data) throw new Error('Failed to get JSON metrics');
    return response.data;
  }
};

// ============================================================================
// Logs API
// ============================================================================

export const logsApi = {
  async query(options: {
    level?: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
    source?: string;
    startTime?: string;
    endTime?: string;
    search?: string;
    limit?: number;
    cursor?: string;
  } = {}): Promise<PaginatedResponse<LogEntry>> {
    const params = new URLSearchParams();
    if (options.level) params.append('level', options.level);
    if (options.source) params.append('source', options.source);
    if (options.startTime) params.append('startTime', options.startTime);
    if (options.endTime) params.append('endTime', options.endTime);
    if (options.search) params.append('search', options.search);
    if (options.limit) params.append('limit', options.limit.toString());
    if (options.cursor) params.append('cursor', options.cursor);

    const response = await fetchApi<ApiResponse<PaginatedResponse<LogEntry>>>(
      `/api/logs?${params.toString()}`
    );
    return response.data || { items: [], total: 0, page: 1, pageSize: 50, hasMore: false };
  },

  async getAgentLogSummary(): Promise<Array<{
    agentId: string;
    logCount: number;
    lastLogAt: string;
    errorCount: number;
  }>> {
    const response = await fetchApi<ApiResponse<{ agents: Array<{
      agentId: string;
      logCount: number;
      lastLogAt: string;
      errorCount: number;
    }> }>>('/api/logs/agents');
    return response.data?.agents || [];
  }
};

// ============================================================================
// Auth API
// ============================================================================

export const authApi = {
  async login(username: string, password: string): Promise<{ token: string; role: string }> {
    const response = await fetchApi<ApiResponse<{ token: string; role: string }>>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    if (!response.data) throw new Error('Login failed');
    return response.data;
  },

  async logout(): Promise<void> {
    await fetchApi<ApiResponse<void>>('/api/auth/logout', {
      method: 'POST'
    });
    localStorage.removeItem('dash_token');
  },

  async verifyToken(token: string): Promise<{ valid: boolean; role: string }> {
    const response = await fetchApi<ApiResponse<{ valid: boolean; role: string }>>('/api/auth/verify', {
      method: 'POST',
      body: JSON.stringify({ token })
    });
    return response.data || { valid: false, role: 'readonly' };
  },

  setApiKey(apiKey: string): void {
    localStorage.setItem('dash_api_key', apiKey);
  },

  setToken(token: string): void {
    localStorage.setItem('dash_token', token);
  },

  clearAuth(): void {
    localStorage.removeItem('dash_token');
    localStorage.removeItem('dash_api_key');
  }
};

// ============================================================================
// Health API
// ============================================================================

export const healthApi = {
  async check(): Promise<{ status: string; version: string }> {
    const response = await fetch(`${API_BASE_URL}/health`);
    if (!response.ok) throw new Error('Health check failed');
    return response.json();
  },

  async detailedCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    version: string;
    timestamp: string;
    uptime: number;
    checks: Record<string, {
      status: 'healthy' | 'degraded' | 'unhealthy';
      responseTime: number;
      message?: string;
    }>;
  }> {
    const response = await fetchApi<ApiResponse<{
      status: 'healthy' | 'degraded' | 'unhealthy';
      version: string;
      timestamp: string;
      uptime: number;
      checks: Record<string, {
        status: 'healthy' | 'degraded' | 'unhealthy';
        responseTime: number;
        message?: string;
      }>;
    }>>('/api/health/detailed');
    if (!response.data) throw new Error('Detailed health check failed');
    return response.data;
  },

  async ready(): Promise<{ ready: boolean }> {
    const response = await fetch(`${API_BASE_URL}/api/health/ready`);
    return response.json();
  },

  async live(): Promise<{ alive: boolean }> {
    const response = await fetch(`${API_BASE_URL}/api/health/live`);
    return response.json();
  }
};

// ============================================================================
// Export All
// ============================================================================

export const api = {
  capabilities: capabilitiesApi,
  teams: swarmApi,
  agents: agentApi,
  tasks: taskApi,
  events: eventApi,
  metrics: metricsApi,
  logs: logsApi,
  auth: authApi,
  health: healthApi,
};

export default api;
