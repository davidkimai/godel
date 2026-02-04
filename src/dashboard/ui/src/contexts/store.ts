/**
 * State Store
 * 
 * Global state management using Zustand
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type {
  Agent,
  Swarm,
  Task,
  AgentEvent,
  CostMetrics,
  DashboardStats,
  User,
  UserRole,
  Notification,
  ViewState,
  FilterState
} from '../types';

// ============================================================================
// Auth Store
// ============================================================================

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (user: User) => void;
  logout: () => void;
  setLoading: (loading: boolean) => void;
  isAdmin: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  devtools(
    persist(
      (set, get) => ({
        user: null,
        isAuthenticated: false,
        isLoading: true,
        
        login: (user) => {
          localStorage.setItem('dash_token', user.token);
          set({ user, isAuthenticated: true, isLoading: false });
        },
        
        logout: () => {
          localStorage.removeItem('dash_token');
          set({ user: null, isAuthenticated: false, isLoading: false });
        },
        
        setLoading: (loading) => set({ isLoading: loading }),
        
        isAdmin: () => get().user?.role === UserRole.ADMIN
      }),
      {
        name: 'dash-auth-storage',
        partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated })
      }
    )
  )
);

// ============================================================================
// Dashboard Store
// ============================================================================

interface DashboardState {
  // Data
  agents: Agent[];
  swarms: Swarm[];
  tasks: Task[];
  events: AgentEvent[];
  stats: DashboardStats | null;
  costMetrics: CostMetrics | null;
  
  // Loading states
  isLoadingAgents: boolean;
  isLoadingSwarms: boolean;
  isLoadingEvents: boolean;
  
  // Actions
  setAgents: (agents: Agent[]) => void;
  setSwarms: (swarms: Swarm[]) => void;
  setTasks: (tasks: Task[]) => void;
  setEvents: (events: AgentEvent[]) => void;
  addEvent: (event: AgentEvent) => void;
  updateAgent: (agent: Agent) => void;
  updateSwarm: (swarm: Swarm) => void;
  removeAgent: (agentId: string) => void;
  removeSwarm: (swarmId: string) => void;
  setStats: (stats: DashboardStats) => void;
  setCostMetrics: (metrics: CostMetrics) => void;
  
  setLoadingAgents: (loading: boolean) => void;
  setLoadingSwarms: (loading: boolean) => void;
  setLoadingEvents: (loading: boolean) => void;
  
  // Getters
  getAgentById: (id: string) => Agent | undefined;
  getSwarmById: (id: string) => Swarm | undefined;
  getAgentsBySwarm: (swarmId: string) => Agent[];
  getTasksByAgent: (agentId: string) => Task[];
  getEventsBySwarm: (swarmId: string) => AgentEvent[];
  getEventsByAgent: (agentId: string) => AgentEvent[];
}

export const useDashboardStore = create<DashboardState>()(
  devtools(
    (set, get) => ({
      agents: [],
      swarms: [],
      tasks: [],
      events: [],
      stats: null,
      costMetrics: null,
      
      isLoadingAgents: false,
      isLoadingSwarms: false,
      isLoadingEvents: false,
      
      setAgents: (agents) => set({ agents }),
      setSwarms: (swarms) => set({ swarms }),
      setTasks: (tasks) => set({ tasks }),
      setEvents: (events) => set({ events }),
      
      addEvent: (event) => set((state) => ({
        events: [event, ...state.events].slice(0, 1000)
      })),
      
      updateAgent: (agent) => set((state) => {
        const index = state.agents.findIndex(a => a.id === agent.id);
        if (index >= 0) {
          const agents = [...state.agents];
          agents[index] = agent;
          return { agents };
        }
        return { agents: [...state.agents, agent] };
      }),
      
      updateSwarm: (swarm) => set((state) => {
        const index = state.swarms.findIndex(s => s.id === swarm.id);
        if (index >= 0) {
          const swarms = [...state.swarms];
          swarms[index] = swarm;
          return { swarms };
        }
        return { swarms: [...state.swarms, swarm] };
      }),
      
      removeAgent: (agentId) => set((state) => ({
        agents: state.agents.filter(a => a.id !== agentId)
      })),
      
      removeSwarm: (swarmId) => set((state) => ({
        swarms: state.swarms.filter(s => s.id !== swarmId)
      })),
      
      setStats: (stats) => set({ stats }),
      setCostMetrics: (metrics) => set({ costMetrics: metrics }),
      
      setLoadingAgents: (loading) => set({ isLoadingAgents: loading }),
      setLoadingSwarms: (loading) => set({ isLoadingSwarms: loading }),
      setLoadingEvents: (loading) => set({ isLoadingEvents: loading }),
      
      getAgentById: (id) => get().agents.find(a => a.id === id),
      getSwarmById: (id) => get().swarms.find(s => s.id === id),
      getAgentsBySwarm: (swarmId) => get().agents.filter(a => a.swarmId === swarmId),
      getTasksByAgent: (agentId) => get().tasks.filter(t => t.agentId === agentId),
      getEventsBySwarm: (swarmId) => get().events.filter(e => e.swarmId === swarmId),
      getEventsByAgent: (agentId) => get().events.filter(e => e.agentId === agentId)
    }),
    { name: 'dash-dashboard-store' }
  )
);

// ============================================================================
// UI Store
// ============================================================================

interface UIState {
  // Sidebar
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  
  // Theme
  darkMode: boolean;
  toggleDarkMode: () => void;
  
  // Notifications
  notifications: Notification[];
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp'>) => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;
  
  // Filters
  filters: FilterState;
  setFilter: <K extends keyof FilterState>(key: K, value: FilterState[K]) => void;
  resetFilters: () => void;
  
  // View State
  view: ViewState;
  setView: (view: Partial<ViewState>) => void;
  toggleSwarmExpanded: (swarmId: string) => void;
  setSelectedAgent: (agentId: string | null) => void;
  setSelectedSwarm: (swarmId: string | null) => void;
  setViewMode: (mode: ViewState['viewMode']) => void;
}

const defaultFilters: FilterState = {
  status: 'all',
  swarmId: 'all',
  search: '',
  timeRange: '24h'
};

const defaultView: ViewState = {
  expandedSwarms: new Set(),
  selectedAgent: null,
  selectedSwarm: null,
  viewMode: 'grid'
};

export const useUIStore = create<UIState>()(
  devtools(
    persist(
      (set, get) => ({
        sidebarOpen: true,
        darkMode: true,
        notifications: [],
        filters: { ...defaultFilters },
        view: { ...defaultView },
        
        toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
        setSidebarOpen: (open) => set({ sidebarOpen: open }),
        
        toggleDarkMode: () => set((state) => ({ darkMode: !state.darkMode })),
        
        addNotification: (notification) => {
          const id = `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const newNotification: Notification = {
            ...notification,
            id,
            timestamp: new Date().toISOString(),
            dismissible: notification.dismissible ?? true
          };
          set((state) => ({
            notifications: [newNotification, ...state.notifications].slice(0, 50)
          }));
          
          // Auto-dismiss after 5 seconds for non-error notifications
          if (notification.type !== 'error') {
            setTimeout(() => {
              get().removeNotification(id);
            }, 5000);
          }
        },
        
        removeNotification: (id) => set((state) => ({
          notifications: state.notifications.filter(n => n.id !== id)
        })),
        
        clearNotifications: () => set({ notifications: [] }),
        
        setFilter: (key, value) => set((state) => ({
          filters: { ...state.filters, [key]: value }
        })),
        
        resetFilters: () => set({ filters: { ...defaultFilters } }),
        
        setView: (view) => set((state) => ({
          view: { ...state.view, ...view }
        })),
        
        toggleSwarmExpanded: (swarmId) => set((state) => {
          const expanded = new Set(state.view.expandedSwarms);
          if (expanded.has(swarmId)) {
            expanded.delete(swarmId);
          } else {
            expanded.add(swarmId);
          }
          return { view: { ...state.view, expandedSwarms: expanded } };
        }),
        
        setSelectedAgent: (agentId) => set((state) => ({
          view: { ...state.view, selectedAgent: agentId }
        })),
        
        setSelectedSwarm: (swarmId) => set((state) => ({
          view: { ...state.view, selectedSwarm: swarmId }
        })),
        
        setViewMode: (mode) => set((state) => ({
          view: { ...state.view, viewMode: mode }
        }))
      }),
      {
        name: 'dash-ui-storage',
        partialize: (state) => ({
          sidebarOpen: state.sidebarOpen,
          darkMode: state.darkMode,
          filters: state.filters,
          view: state.view
        })
      }
    )
  )
);

// ============================================================================
// Real-time Store (combines WebSocket with dashboard state)
// ============================================================================

interface RealtimeState {
  isConnected: boolean;
  isReconnecting: boolean;
  lastEventTime: string | null;
  eventsPerSecond: number;
  setConnected: (connected: boolean) => void;
  setReconnecting: (reconnecting: boolean) => void;
  updateEventStats: () => void;
}

export const useRealtimeStore = create<RealtimeState>()(
  devtools(
    (set, get) => ({
      isConnected: false,
      isReconnecting: false,
      lastEventTime: null,
      eventsPerSecond: 0,
      
      setConnected: (connected) => set({ isConnected: connected }),
      setReconnecting: (reconnecting) => set({ isReconnecting: reconnecting }),
      updateEventStats: () => {
        const now = new Date().toISOString();
        set((state) => ({
          lastEventTime: now,
          eventsPerSecond: state.lastEventTime
            ? 1 / ((new Date(now).getTime() - new Date(state.lastEventTime).getTime()) / 1000)
            : 0
        }));
      }
    }),
    { name: 'dash-realtime-store' }
  )
);
