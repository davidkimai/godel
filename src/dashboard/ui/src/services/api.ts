/**
 * API Service
 * 
 * HTTP API client for the Dash Dashboard
 */

import type {
  Agent,
  Swarm,
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
  const token = localStorage.getItem('dash_token');
  
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` }),
      ...options.headers
    }
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new ApiError(
      errorData.error || `HTTP ${response.status}`,
      response.status,
      errorData
    );
  }

  return response.json();
}

// ============================================================================
// Swarm API
// ============================================================================

export const swarmApi = {
  async list(): Promise<Swarm[]> {
    const response = await fetchApi<ApiResponse<{ swarms: Swarm[] }>>('/api/swarms');
    return response.data?.swarms || [];
  },

  async get(id: string): Promise<Swarm> {
    const response = await fetchApi<ApiResponse<Swarm>>(`/api/swarms/${id}`);
    if (!response.data) throw new Error('Swarm not found');
    return response.data;
  },

  async create(name: string, config: Partial<Swarm['config']>): Promise<Swarm> {
    const response = await fetchApi<ApiResponse<Swarm>>('/api/swarms', {
      method: 'POST',
      body: JSON.stringify({ name, config })
    });
    if (!response.data) throw new Error('Failed to create swarm');
    return response.data;
  },

  async start(id: string): Promise<void> {
    await fetchApi<ApiResponse<void>>(`/api/swarms/${id}/start`, {
      method: 'POST'
    });
  },

  async stop(id: string): Promise<void> {
    await fetchApi<ApiResponse<void>>(`/api/swarms/${id}/stop`, {
      method: 'POST'
    });
  },

  async scale(id: string, targetSize: number): Promise<void> {
    await fetchApi<ApiResponse<void>>(`/api/swarms/${id}/scale`, {
      method: 'POST',
      body: JSON.stringify({ targetSize })
    });
  },

  async pause(id: string): Promise<void> {
    await fetchApi<ApiResponse<void>>(`/api/swarms/${id}/pause`, {
      method: 'POST'
    });
  },

  async resume(id: string): Promise<void> {
    await fetchApi<ApiResponse<void>>(`/api/swarms/${id}/resume`, {
      method: 'POST'
    });
  },

  async destroy(id: string, force = false): Promise<void> {
    await fetchApi<ApiResponse<void>>(`/api/swarms/${id}`, {
      method: 'DELETE',
      body: JSON.stringify({ force })
    });
  },

  async getEvents(id: string, limit = 100): Promise<AgentEvent[]> {
    const response = await fetchApi<ApiResponse<{ events: AgentEvent[] }>>(
      `/api/swarms/${id}/events?limit=${limit}`
    );
    return response.data?.events || [];
  },

  async getTree(id: string): Promise<unknown> {
    const response = await fetchApi<ApiResponse<unknown>>(`/api/swarms/${id}/tree`);
    return response.data;
  }
};

// ============================================================================
// Agent API
// ============================================================================

export const agentApi = {
  async list(): Promise<Agent[]> {
    const response = await fetchApi<ApiResponse<{ agents: Agent[] }>>('/api/agents');
    return response.data?.agents || [];
  },

  async get(id: string): Promise<Agent> {
    const response = await fetchApi<ApiResponse<Agent>>(`/api/agents/${id}`);
    if (!response.data) throw new Error('Agent not found');
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
  }
};

// ============================================================================
// Task API
// ============================================================================

export const taskApi = {
  async list(swarmId?: string): Promise<Task[]> {
    const url = swarmId ? `/api/tasks?swarmId=${swarmId}` : '/api/tasks';
    const response = await fetchApi<ApiResponse<{ tasks: Task[] }>>(url);
    return response.data?.tasks || [];
  },

  async get(id: string): Promise<Task> {
    const response = await fetchApi<ApiResponse<Task>>(`/api/tasks/${id}`);
    if (!response.data) throw new Error('Task not found');
    return response.data;
  }
};

// ============================================================================
// Event API
// ============================================================================

export const eventApi = {
  async list(options: {
    limit?: number;
    swarmId?: string;
    agentId?: string;
    type?: string;
  } = {}): Promise<PaginatedResponse<AgentEvent>> {
    const params = new URLSearchParams();
    if (options.limit) params.append('limit', options.limit.toString());
    if (options.swarmId) params.append('swarmId', options.swarmId);
    if (options.agentId) params.append('agentId', options.agentId);
    if (options.type) params.append('type', options.type);

    const response = await fetchApi<ApiResponse<PaginatedResponse<AgentEvent>>>(
      `/api/events?${params.toString()}`
    );
    return response.data || { items: [], total: 0, page: 1, pageSize: 50, hasMore: false };
  },

  createEventSource(): EventSource {
    const token = localStorage.getItem('dash_token');
    const url = new URL(`${API_BASE_URL}/api/events/stream`);
    if (token) {
      url.searchParams.append('token', token);
    }
    return new EventSource(url.toString());
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
  },

  async verifyToken(token: string): Promise<{ valid: boolean; role: string }> {
    const response = await fetchApi<ApiResponse<{ valid: boolean; role: string }>>('/api/auth/verify', {
      method: 'POST',
      body: JSON.stringify({ token })
    });
    return response.data || { valid: false, role: 'readonly' };
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
  }
};

// ============================================================================
// Export All
// ============================================================================

export const api = {
  swarms: swarmApi,
  agents: agentApi,
  tasks: taskApi,
  events: eventApi,
  metrics: metricsApi,
  auth: authApi,
  health: healthApi
};

export default api;
