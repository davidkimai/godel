/**
 * Layout Components
 * 
 * Main layout structure for the Dash Dashboard
 */

import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Hexagon,
  Activity,
  DollarSign,
  Settings,
  Menu,
  X,
  Bell,
  LogOut,
  ChevronDown,
  Sun,
  Moon
} from 'lucide-react';
import { useAuthStore, useUIStore } from '../contexts/store';
import { cn } from '../utils';

// ============================================================================
// Sidebar
// ============================================================================

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/swarms', icon: Hexagon, label: 'Swarms' },
  { path: '/agents', icon: Users, label: 'Agents' },
  { path: '/events', icon: Activity, label: 'Events' },
  { path: '/costs', icon: DollarSign, label: 'Costs' },
  { path: '/settings', icon: Settings, label: 'Settings' }
];

export function Sidebar(): React.ReactElement {
  const { sidebarOpen, toggleSidebar, darkMode, toggleDarkMode } = useUIStore();
  const { logout, isAdmin } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={toggleSidebar}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed top-0 left-0 z-50 h-full bg-slate-900 border-r border-slate-800 transition-transform duration-300 ease-in-out',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
          'w-64 lg:translate-x-0 lg:static'
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-slate-800">
          <NavLink to="/" className="flex items-center gap-2 text-white">
            <Hexagon className="w-8 h-8 text-emerald-500" />
            <span className="text-xl font-bold">Dash</span>
          </NavLink>
          <button
            onClick={toggleSidebar}
            className="lg:hidden p-2 text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg transition-colors',
                  isActive
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                )
              }
            >
              <item.icon className="w-5 h-5" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Bottom section */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-slate-800">
          {/* Theme toggle */}
          <button
            onClick={toggleDarkMode}
            className="flex items-center gap-3 w-full px-3 py-2 text-slate-400 hover:text-white rounded-lg transition-colors"
          >
            {darkMode ? (
              <>
                <Sun className="w-5 h-5" />
                <span>Light mode</span>
              </>
            ) : (
              <>
                <Moon className="w-5 h-5" />
                <span>Dark mode</span>
              </>
            )}
          </button>

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2 mt-1 text-slate-400 hover:text-red-400 rounded-lg transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span>Logout</span>
          </button>
        </div>
      </aside>
    </>
  );
}

// ============================================================================
// Header
// ============================================================================

export function Header(): React.ReactElement {
  const { toggleSidebar, notifications, clearNotifications } = useUIStore();
  const { isAdmin } = useAuthStore();
  const [showNotifications, setShowNotifications] = useState(false);

  const unreadCount = notifications.filter(n => 
    new Date(n.timestamp) > new Date(Date.now() - 300000)
  ).length;

  return (
    <header className="sticky top-0 z-30 h-16 bg-slate-900/95 backdrop-blur border-b border-slate-800">
      <div className="flex items-center justify-between h-full px-4">
        {/* Left */}
        <div className="flex items-center gap-4">
          <button
            onClick={toggleSidebar}
            className="p-2 text-slate-400 hover:text-white lg:hidden"
          >
            <Menu className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold text-white">Dash Dashboard</h1>
          {isAdmin() && (
            <span className="px-2 py-0.5 text-xs font-medium bg-emerald-500/20 text-emerald-400 rounded-full">
              Admin
            </span>
          )}
        </div>

        {/* Right */}
        <div className="flex items-center gap-4">
          {/* Connection status */}
          <ConnectionStatus />

          {/* Notifications */}
          <div className="relative">
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative p-2 text-slate-400 hover:text-white"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>

            {showNotifications && (
              <div className="absolute right-0 top-full mt-2 w-80 bg-slate-800 rounded-lg shadow-lg border border-slate-700 overflow-hidden">
                <div className="flex items-center justify-between p-3 border-b border-slate-700">
                  <span className="font-medium text-white">Notifications</span>
                  {notifications.length > 0 && (
                    <button
                      onClick={clearNotifications}
                      className="text-xs text-slate-400 hover:text-white"
                    >
                      Clear all
                    </button>
                  )}
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <p className="p-4 text-center text-slate-500">No notifications</p>
                  ) : (
                    notifications.map((notification) => (
                      <div
                        key={notification.id}
                        className={cn(
                          'p-3 border-b border-slate-700/50 last:border-b-0',
                          notification.type === 'error' && 'bg-red-500/5',
                          notification.type === 'warning' && 'bg-yellow-500/5',
                          notification.type === 'success' && 'bg-green-500/5'
                        )}
                      >
                        <p className="text-sm text-slate-300">{notification.message}</p>
                        <p className="text-xs text-slate-500 mt-1">
                          {new Date(notification.timestamp).toLocaleTimeString()}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

// ============================================================================
// Connection Status
// ============================================================================

function ConnectionStatus(): React.ReactElement {
  const [status, setStatus] = useState<'connected' | 'connecting' | 'disconnected'>('connecting');

  // This would connect to the real-time store
  React.useEffect(() => {
    // Simulate connection status for now
    const timer = setTimeout(() => setStatus('connected'), 1000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          'w-2 h-2 rounded-full animate-pulse',
          status === 'connected' && 'bg-emerald-500',
          status === 'connecting' && 'bg-yellow-500',
          status === 'disconnected' && 'bg-red-500'
        )}
      />
      <span className="text-sm text-slate-400 hidden sm:inline">
        {status === 'connected' && 'Live'}
        {status === 'connecting' && 'Connecting...'}
        {status === 'disconnected' && 'Offline'}
      </span>
    </div>
  );
}

// ============================================================================
// Main Layout
// ============================================================================

export function Layout(): React.ReactElement {
  return (
    <div className="min-h-screen bg-slate-950">
      <Sidebar />
      
      <div className="lg:ml-64">
        <Header />
        <main className="p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

// ============================================================================
// Card Component
// ============================================================================

interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  action?: React.ReactNode;
}

export function Card({ children, className, title, action }: CardProps): React.ReactElement {
  return (
    <div className={cn('bg-slate-900 rounded-lg border border-slate-800', className)}>
      {(title || action) && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
          {title && <h3 className="font-semibold text-white">{title}</h3>}
          {action && <div>{action}</div>}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}

// ============================================================================
// Stats Card
// ============================================================================

interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: {
    value: number;
    positive: boolean;
  };
  color?: 'emerald' | 'blue' | 'purple' | 'amber' | 'red';
}

export function StatsCard({
  title,
  value,
  subtitle,
  icon,
  trend,
  color = 'emerald'
}: StatsCardProps): React.ReactElement {
  const colorClasses = {
    emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    purple: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    red: 'bg-red-500/10 text-red-400 border-red-500/20'
  };

  return (
    <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-400">{title}</p>
          <p className="text-2xl font-bold text-white mt-1">{value}</p>
          {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
          {trend && (
            <div className={cn(
              'flex items-center gap-1 mt-2 text-sm',
              trend.positive ? 'text-emerald-400' : 'text-red-400'
            )}>
              <span>{trend.positive ? '↑' : '↓'} {Math.abs(trend.value)}%</span>
            </div>
          )}
        </div>
        <div className={cn('p-3 rounded-lg border', colorClasses[color])}>
          {icon}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Badge Component
// ============================================================================

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info';
  className?: string;
}

export function Badge({ children, variant = 'default', className }: BadgeProps): React.ReactElement {
  const variants = {
    default: 'bg-slate-700 text-slate-300',
    success: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    warning: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    error: 'bg-red-500/20 text-red-400 border-red-500/30',
    info: 'bg-blue-500/20 text-blue-400 border-blue-500/30'
  };

  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 text-xs font-medium rounded border',
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}

// ============================================================================
// Button Component
// ============================================================================

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  isLoading,
  className,
  disabled,
  ...props
}: ButtonProps): React.ReactElement {
  const variants = {
    primary: 'bg-emerald-600 hover:bg-emerald-500 text-white border-transparent',
    secondary: 'bg-slate-800 hover:bg-slate-700 text-white border-slate-700',
    danger: 'bg-red-600 hover:bg-red-500 text-white border-transparent',
    ghost: 'bg-transparent hover:bg-slate-800 text-slate-300 border-transparent'
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2',
    lg: 'px-6 py-3 text-lg'
  };

  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 font-medium rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        className
      )}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && (
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
            fill="none"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      )}
      {children}
    </button>
  );
}

// ============================================================================
// Loading Spinner
// ============================================================================

export function LoadingSpinner({ className }: { className?: string }): React.ReactElement {
  return (
    <div className={cn('flex items-center justify-center', className)}>
      <svg className="animate-spin h-8 w-8 text-emerald-500" viewBox="0 0 24 24">
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
          fill="none"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
    </div>
  );
}

// ============================================================================
// Empty State
// ============================================================================

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}

export function EmptyState({ title, description, icon, action }: EmptyStateProps): React.ReactElement {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {icon && <div className="text-slate-600 mb-4">{icon}</div>}
      <h3 className="text-lg font-medium text-white">{title}</h3>
      {description && <p className="text-slate-400 mt-2 max-w-sm">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
