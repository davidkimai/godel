/**
 * App Entry Point
 * 
 * Main application with routing and providers
 */

import React, { Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '../contexts/store';
import { getWebSocketService } from '../services/websocket';
import { Layout } from '../components/Layout';
import { LoadingSpinner } from '../components/Layout';
import { DashboardPage } from '../pages/Dashboard';
import { SwarmsPage } from '../pages/Swarms';
import { AgentsPage } from '../pages/Agents';
import { EventsPage } from '../pages/Events';
import { CostsPage } from '../pages/Costs';
import { SettingsPage } from '../pages/Settings';
import { LoginPage } from '../pages/Login';

// Lazy load pages
const Dashboard = React.lazy(() => import('../pages/Dashboard'));
const Swarms = React.lazy(() => import('../pages/Swarms'));
const Agents = React.lazy(() => import('../pages/Agents'));
const Events = React.lazy(() => import('../pages/Events'));
const Costs = React.lazy(() => import('../pages/Costs'));
const Settings = React.lazy(() => import('../pages/Settings'));

// Create QueryClient for React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      retry: 3,
      refetchOnWindowFocus: false
    }
  }
});

// Loading fallback
function PageLoader(): React.ReactElement {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <LoadingSpinner className="w-8 h-8" />
    </div>
  );
}

// Protected Route wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }): React.ReactElement {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return <PageLoader />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

// App Routes
function AppRoutes(): React.ReactElement {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<LoginPage />} />

      {/* Protected routes */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route
          index
          element={
            <Suspense fallback={<PageLoader />}>
              <Dashboard />
            </Suspense>
          }
        />
        <Route
          path="swarms"
          element={
            <Suspense fallback={<PageLoader />}>
              <Swarms />
            </Suspense>
          }
        />
        <Route
          path="swarms/:id"
          element={
            <Suspense fallback={<PageLoader />}>
              <Swarms />
            </Suspense>
          }
        />
        <Route
          path="agents"
          element={
            <Suspense fallback={<PageLoader />}>
              <Agents />
            </Suspense>
          }
        />
        <Route
          path="agents/:id"
          element={
            <Suspense fallback={<PageLoader />}>
              <Agents />
            </Suspense>
          }
        />
        <Route
          path="events"
          element={
            <Suspense fallback={<PageLoader />}>
              <Events />
            </Suspense>
          }
        />
        <Route
          path="costs"
          element={
            <Suspense fallback={<PageLoader />}>
              <Costs />
            </Suspense>
          }
        />
        <Route
          path="settings"
          element={
            <Suspense fallback={<PageLoader />}>
              <Settings />
            </Suspense>
          }
        />
      </Route>

      {/* Catch all - redirect to home */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

// Main App Component
export function App(): React.ReactElement {
  const { isAuthenticated, setLoading } = useAuthStore();

  // Initialize WebSocket connection when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      const wsService = getWebSocketService();
      wsService.connect();

      return () => {
        wsService.disconnect();
      };
    }
  }, [isAuthenticated]);

  // Check for existing session on mount
  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('dash_token');
      if (token) {
        try {
          // In a real app, verify token with backend
          const userData = JSON.parse(atob(token.split('.')[1]));
          if (userData.exp > Date.now() / 1000) {
            useAuthStore.getState().login({
              id: userData.sub || 'user-1',
              username: userData.username || 'user',
              role: userData.role || 'readonly',
              token,
              expiresAt: new Date(userData.exp * 1000).toISOString()
            });
          } else {
            localStorage.removeItem('dash_token');
          }
        } catch (e) {
          localStorage.removeItem('dash_token');
        }
      }
      setLoading(false);
    };

    checkAuth();
  }, [setLoading]);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
