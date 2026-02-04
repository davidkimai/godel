/**
 * Dashboard UI Tests
 * 
 * Vitest test suite for the dashboard UI components
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock API
vi.mock('./services/api', () => ({
  api: {
    agents: {
      list: vi.fn(),
      get: vi.fn(),
      kill: vi.fn(),
      restart: vi.fn()
    },
    swarms: {
      list: vi.fn(),
      get: vi.fn(),
      create: vi.fn(),
      scale: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      destroy: vi.fn()
    },
    events: {
      list: vi.fn()
    },
    metrics: {
      getDashboardStats: vi.fn(),
      getCostMetrics: vi.fn()
    }
  }
}));

// Mock WebSocket
vi.mock('./services/websocket', () => ({
  getWebSocketService: () => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    isConnected: () => false
  }),
  useWebSocket: () => ({
    connected: false,
    reconnecting: false,
    error: null,
    connect: vi.fn(),
    disconnect: vi.fn(),
    send: vi.fn(),
    subscribe: () => () => {}
  }),
  useAgentUpdates: () => ({ agents: [], updateAgent: vi.fn() }),
  useSwarmUpdates: () => ({ swarms: [], updateSwarm: vi.fn() }),
  useCostUpdates: () => null,
  useEventStream: () => []
}));

// Helper to render with providers
function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {ui}
      </BrowserRouter>
    </QueryClientProvider>
  );
}

describe('Dashboard Components', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('StatsCard', () => {
    it('renders title and value correctly', () => {
      const { StatsCard } = require('./components/Layout');
      renderWithProviders(
        <StatsCard
          title="Total Agents"
          value={50}
          icon={<span>👥</span>}
        />
      );

      expect(screen.getByText('Total Agents')).toBeInTheDocument();
      expect(screen.getByText('50')).toBeInTheDocument();
    });

    it('shows trend indicator when provided', () => {
      const { StatsCard } = require('./components/Layout');
      renderWithProviders(
        <StatsCard
          title="Cost"
          value="$100"
          icon={<span>💰</span>}
          trend={{ value: 15, positive: true }}
        />
      );

      expect(screen.getByText('↑ 15%')).toBeInTheDocument();
    });
  });

  describe('Badge', () => {
    it('renders with correct variant styles', () => {
      const { Badge } = require('./components/Layout');
      
      renderWithProviders(
        <div>
          <Badge variant="success">Active</Badge>
          <Badge variant="error">Failed</Badge>
          <Badge variant="warning">Pending</Badge>
        </div>
      );

      expect(screen.getByText('Active')).toBeInTheDocument();
      expect(screen.getByText('Failed')).toBeInTheDocument();
      expect(screen.getByText('Pending')).toBeInTheDocument();
    });
  });

  describe('Button', () => {
    it('renders children correctly', () => {
      const { Button } = require('./components/Layout');
      
      renderWithProviders(
        <Button>Click Me</Button>
      );

      expect(screen.getByRole('button', { name: 'Click Me' })).toBeInTheDocument();
    });

    it('shows loading state', () => {
      const { Button } = require('./components/Layout');
      
      renderWithProviders(
        <Button isLoading>Loading</Button>
      );

      expect(screen.getByRole('button')).toBeDisabled();
      expect(screen.queryByText('Loading')).not.toBeInTheDocument();
    });
  });

  describe('LoadingSpinner', () => {
    it('renders correctly', () => {
      const { LoadingSpinner } = require('./components/Layout');
      
      renderWithProviders(
        <LoadingSpinner />
      );

      expect(screen.getByRole('status')).toBeInTheDocument();
    });
  });

  describe('EmptyState', () => {
    it('renders title and description', () => {
      const { EmptyState } = require('./components/Layout');
      
      renderWithProviders(
        <EmptyState
          title="No data"
          description="Nothing to show here"
        />
      );

      expect(screen.getByText('No data')).toBeInTheDocument();
      expect(screen.getByText('Nothing to show here')).toBeInTheDocument();
    });
  });
});

describe('Utility Functions', () => {
  const { formatCurrency, formatNumber, formatDuration, getStatusColor } = require('./utils');

  describe('formatCurrency', () => {
    it('formats numbers as currency', () => {
      expect(formatCurrency(100)).toBe('$100.00');
      expect(formatCurrency(99.99)).toBe('$99.99');
      expect(formatCurrency(0)).toBe('$0.00');
    });
  });

  describe('formatNumber', () => {
    it('formats numbers with commas', () => {
      expect(formatNumber(1000)).toBe('1,000');
      expect(formatNumber(1234567)).toBe('1,234,567');
    });
  });

  describe('formatDuration', () => {
    it('formats milliseconds', () => {
      expect(formatDuration(500)).toBe('500ms');
    });

    it('formats seconds', () => {
      expect(formatDuration(5000)).toBe('5.0s');
    });

    it('formats minutes', () => {
      expect(formatDuration(120000)).toBe('2m 0s');
    });

    it('formats hours', () => {
      expect(formatDuration(3660000)).toBe('1h 1m');
    });
  });

  describe('getStatusColor', () => {
    it('returns color classes for agent statuses', () => {
      const running = getStatusColor('running');
      expect(running).toContain('text-green-500');
    });

    it('returns color classes for swarm states', () => {
      const active = getStatusColor('active');
      expect(active).toContain('text-green-500');
    });

    it('returns default for unknown statuses', () => {
      const unknown = getStatusColor('unknown');
      expect(unknown).toContain('text-gray-500');
    });
  });
});

describe('State Management', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('useAuthStore', () => {
    it('manages authentication state', () => {
      const { useAuthStore } = require('./contexts/store');
      
      // Initial state
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });
  });

  describe('useUIStore', () => {
    it('manages UI state', () => {
      const { useUIStore } = require('./contexts/store');
      
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });
  });

  describe('useDashboardStore', () => {
    it('manages dashboard data', () => {
      const { useDashboardStore } = require('./contexts/store');
      
      expect(useDashboardStore.getState().agents).toEqual([]);
      expect(useDashboardStore.getState().swarms).toEqual([]);
    });
  });
});

describe('Type Definitions', () => {
  it('validates Agent type', () => {
    const { AgentStatus } = require('./types');
    
    expect(AgentStatus.RUNNING).toBe('running');
    expect(AgentStatus.COMPLETED).toBe('completed');
    expect(AgentStatus.FAILED).toBe('failed');
  });

  it('validates SwarmState type', () => {
    const { SwarmState } = require('./types');
    
    expect(SwarmState.ACTIVE).toBe('active');
    expect(SwarmState.SCALING).toBe('scaling');
    expect(SwarmState.PAUSED).toBe('paused');
  });
});

// Run tests
describe('Dashboard Integration', () => {
  it('renders without crashing', () => {
    const { App } = require('./App');
    
    expect(() => renderWithProviders(<App />)).not.toThrow();
  });
});
