/**
 * App Entry Point
 * 
 * Main application with routing and providers
 * Uses httpOnly cookies for authentication.
 */

import React, { Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '../contexts/store.ts';
import { getWebSocketService } from '../services/websocket.ts';
import { Layout } from '../components/Layout';
import { LoadingSpinner } from '../components/Layout';

// Lazy load pages
const Dashboard = React.lazy(() => import('../pages/Dashboard.tsx'));
const Swarms = React.lazy(() => import('../pages/Swarms.tsx'));
const Agents = React.lazy(() => import('../pages/Agents.tsx'));
const Events = React.lazy(() => import('../pages/Events.tsx'));
const Costs = React.lazy(() => import('../pages/Costs.tsx'));
const Settings = React.lazy(() => import('../pages/Settings.tsx'));
const LoginPage = React.lazy(() => import('../pages/Login.tsx'));

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
