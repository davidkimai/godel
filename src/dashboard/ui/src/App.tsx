/**
 * App Entry Point
 * 
 * Main application with routing and providers
 */

import React, { Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from './contexts/store';
import { getWebSocketService } from './services/websocket';
import { DashboardLayout } from './components/Layout/DashboardLayout';

// Lazy load pages
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const Sessions = React.lazy(() => import('./pages/Sessions'));
const Agents = React.lazy(() => import('./pages/Agents'));
const Metrics = React.lazy(() => import('./pages/Metrics'));
const Workflows = React.lazy(() => import('./pages/Workflows'));
const Alerts = React.lazy(() => import('./pages/Alerts'));
const Settings = React.lazy(() => import('./pages/Settings'));
const LoginPage = React.lazy(() => import('./pages/Login'));

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
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
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
      <Route path="/login" element={
        <Suspense fallback={<PageLoader />}>
          <LoginPage />
        </Suspense>
      } />

      {/* Protected routes */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <DashboardLayout />
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
          path="sessions"
          element={
            <Suspense fallback={<PageLoader />}>
              <Sessions />
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
          path="metrics"
          element={
            <Suspense fallback={<PageLoader />}>
              <Metrics />
            </Suspense>
          }
        />
        <Route
          path="workflows"
          element={
            <Suspense fallback={<PageLoader />}>
              <Workflows />
            </Suspense>
          }
        />
        <Route
          path="alerts"
          element={
            <Suspense fallback={<PageLoader />}>
              <Alerts />
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
  const { isAuthenticated, checkAuth } = useAuthStore();

  // Check authentication status on mount
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Initialize WebSocket connection when authenticated
  useEffect((): void | (() => void) => {
    if (isAuthenticated) {
      const wsService = getWebSocketService();
      wsService.connect();

      return () => {
        wsService.disconnect();
      };
    }
    return;
  }, [isAuthenticated]);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
