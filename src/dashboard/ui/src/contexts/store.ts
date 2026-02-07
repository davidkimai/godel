/**
 * State Store
 * 
 * Global state management using Zustand
 * Uses httpOnly cookies for authentication (no localStorage tokens).
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import {
  Agent,
  Team,
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
import authService from '../services/auth';

// ============================================================================
// Auth Store
// ============================================================================

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  setLoading: (loading: boolean) => void;
  isAdmin: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  devtools(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: true,
      
      login: async (username: string, password: string) => {
        const result = await authService.login(username, password);
        if (result.success && result.user) {
          set({ user: result.user, isAuthenticated: true, isLoading: false });
          return true;
        }
        set({ isLoading: false });
        return false;
      },
      
      logout: async () => {
        await authService.logout();
        set({ user: null, isAuthenticated: false, isLoading: false });
      },
      
      checkAuth: async () => {
        set({ isLoading: true });
        try {
          const result = await authService.checkAuth();
          if (result.success && result.user) {
            set({ user: result.user, isAuthenticated: true, isLoading: false });
          } else {
            set({ user: null, isAuthenticated: false, isLoading: false });
          }
        } catch {
          set({ user: null, isAuthenticated: false, isLoading: false });
        }
      },
      
      setLoading: (loading) => set({ isLoading: loading }),
      
      isAdmin: () => get().user?.role === UserRole.ADMIN
    }),
    { name: 'godel-auth-store' }
  )
);

// ============================================================================
// Dashboard Store
// ============================================================================

interface DashboardState {
  // Data
  agents: Agent[];
  teams: Team[];
  tasks: Task[];
  events: AgentEvent[];
  stats: DashboardStats | null;
  costMetrics: CostMetrics | null;
  
  // Loading states
  isLoadingAgents: boolean;
  isLoadingTeams: boolean;
  isLoadingEvents: boolean;
  
  // Actions
  setAgents: (agents: Agent[]) => void;
  setTeams: (teams: Team[]) => void;
  setTasks: (tasks: Task[]) => void;
  setEvents: (events: AgentEvent[]) => void;
  addEvent: (event: AgentEvent) => void;
  updateAgent: (agent: Agent) => void;
  updateTeam: (team: Team) => void;
  removeAgent: (agentId: string) => void;
  removeTeam: (teamId: string) => void;
  setStats: (stats: DashboardStats) => void;
  setCostMetrics: (metrics: CostMetrics) => void;
  
  setLoadingAgents: (loading: boolean) => void;
  setLoadingTeams: (loading: boolean) => void;
  setLoadingEvents: (loading: boolean) => void;
  
  // Getters
  getAgentById: (id: string) => Agent | undefined;
  getTeamById: (id: string) => Team | undefined;
  getAgentsByTeam: (teamId: string) => Agent[];
  getTasksByAgent: (agentId: string) => Task[];
  getEventsByTeam: (teamId: string) => AgentEvent[];
  getEventsByAgent: (agentId: string) => AgentEvent[];
}

export const useDashboardStore = create<DashboardState>()(
  devtools(
    (set, get) => ({
      agents: [],
      teams: [],
      tasks: [],
      events: [],
      stats: null,
      costMetrics: null,
      
      isLoadingAgents: false,
      isLoadingTeams: false,
      isLoadingEvents: false,
      
      setAgents: (agents) => set({ agents }),
      setTeams: (teams) => set({ teams }),
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
      
      updateTeam: (team) => set((state) => {
        const index = state.teams.findIndex(s => s.id === team.id);
        if (index >= 0) {
          const teams = [...state.teams];
          teams[index] = team;
          return { teams };
        }
        return { teams: [...state.teams, team] };
      }),
      
      removeAgent: (agentId) => set((state) => ({
        agents: state.agents.filter(a => a.id !== agentId)
      })),
      
      removeTeam: (teamId) => set((state) => ({
        teams: state.teams.filter(s => s.id !== teamId)
      })),
      
      setStats: (stats) => set({ stats }),
      setCostMetrics: (metrics) => set({ costMetrics: metrics }),
      
      setLoadingAgents: (loading) => set({ isLoadingAgents: loading }),
      setLoadingTeams: (loading) => set({ isLoadingTeams: loading }),
      setLoadingEvents: (loading) => set({ isLoadingEvents: loading }),
      
      getAgentById: (id) => get().agents.find(a => a.id === id),
      getTeamById: (id) => get().teams.find(s => s.id === id),
      getAgentsByTeam: (teamId) => get().agents.filter(a => a.teamId === teamId),
      getTasksByAgent: (agentId) => get().tasks.filter(t => t.agentId === agentId),
      getEventsByTeam: (teamId) => get().events.filter(e => e.teamId === teamId),
      getEventsByAgent: (agentId) => get().events.filter(e => e.agentId === agentId)
    }),
    { name: 'godel-dashboard-store' }
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
  toggleTeamExpanded: (teamId: string) => void;
  setSelectedAgent: (agentId: string | null) => void;
  setSelectedTeam: (teamId: string | null) => void;
  setViewMode: (mode: ViewState['viewMode']) => void;
}

const defaultFilters: FilterState = {
  status: 'all',
  teamId: 'all',
  search: '',
  timeRange: '24h'
};

const defaultView: ViewState = {
  expandedTeams: new Set(),
  selectedAgent: null,
  selectedTeam: null,
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
          const crypto = window.crypto || (window as any).msCrypto;
          const array = new Uint8Array(16);
          crypto.getRandomValues(array);
          const id = 'notif_' + Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
          
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
        
        toggleTeamExpanded: (teamId) => set((state) => {
          const expanded = new Set(state.view.expandedTeams);
          if (expanded.has(teamId)) {
            expanded.delete(teamId);
          } else {
            expanded.add(teamId);
          }
          return { view: { ...state.view, expandedTeams: expanded } };
        }),
        
        setSelectedAgent: (agentId) => set((state) => ({
          view: { ...state.view, selectedAgent: agentId }
        })),
        
        setSelectedTeam: (teamId) => set((state) => ({
          view: { ...state.view, selectedTeam: teamId }
        })),
        
        setViewMode: (mode) => set((state) => ({
          view: { ...state.view, viewMode: mode }
        }))
      }),
      {
        name: 'godel-ui-storage',
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
    (set) => ({
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
    { name: 'godel-realtime-store' }
  )
);
