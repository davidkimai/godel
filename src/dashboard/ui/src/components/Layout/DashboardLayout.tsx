/**
 * DashboardLayout Component
 * 
 * Main dashboard layout with sidebar navigation
 */

import React, { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Network, 
  Users, 
  BarChart3, 
  Workflow,
  Bell,
  Settings,
  Menu,
  X,
  LogOut,
  Sun,
  Moon,
  Zap
} from 'lucide-react';
import { useConnectionStatus } from '../../hooks/useWebSocket';

interface NavItemProps {
  to: string;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}

const NavItem: React.FC<NavItemProps> = ({ to, icon, label, badge }) => {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => `
        flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200
        ${isActive 
          ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' 
          : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
        }
      `}
    >
      {icon}
      <span>{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="ml-auto bg-red-500 text-white text-xs font-medium px-2 py-0.5 rounded-full">
          {badge}
        </span>
      )}
    </NavLink>
  );
};

interface ConnectionStatusProps {
  connected: boolean;
}

const ConnectionStatus: React.FC<ConnectionStatusProps> = ({ connected }) => {
  return (
    <div className="flex items-center gap-2 px-4 py-2">
      <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
      <span className={`text-xs ${connected ? 'text-green-400' : 'text-red-400'}`}>
        {connected ? 'Connected' : 'Disconnected'}
      </span>
    </div>
  );
};

export const DashboardLayout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [darkMode, setDarkMode] = useState(true);
  const { connected } = useConnectionStatus();
  const location = useLocation();

  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);
  const toggleDarkMode = () => setDarkMode(!darkMode);

  // Mock badge counts (would be real in production)
  const badgeCounts = {
    alerts: 3
  };

  return (
    <div className={`min-h-screen ${darkMode ? 'dark bg-gray-950' : 'bg-gray-100'}`}>
      {/* Mobile Header */}
      <div className="lg:hidden bg-gray-900 border-b border-gray-800 p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Zap className="w-6 h-6 text-blue-500" />
          <span className="font-bold text-xl text-gray-100">Godel</span>
        </div>
        <button
          onClick={toggleSidebar}
          className="p-2 text-gray-400 hover:text-gray-200"
        >
          {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      <div className="flex">
        {/* Sidebar */}
        <aside 
          className={`
            fixed lg:static inset-y-0 left-0 z-50 w-64 bg-gray-900 border-r border-gray-800
            transform transition-transform duration-300 ease-in-out
            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0 lg:w-20 xl:w-64'}
          `}
        >
          {/* Logo */}
          <div className="h-16 flex items-center px-6 border-b border-gray-800">
            <Zap className="w-6 h-6 text-blue-500 flex-shrink-0" />
            <span className={`
              ml-3 font-bold text-xl text-gray-100 transition-opacity duration-300
              ${sidebarOpen ? 'opacity-100' : 'opacity-0 lg:opacity-0 xl:opacity-100'}
            `}>
              Godel
            </span>
          </div>

          {/* Navigation */}
          <nav className="p-4 space-y-1">
            <NavItem 
              to="/" 
              icon={<LayoutDashboard className="w-5 h-5" />} 
              label="Overview" 
            />
            <NavItem 
              to="/sessions" 
              icon={<Network className="w-5 h-5" />} 
              label="Sessions" 
            />
            <NavItem 
              to="/agents" 
              icon={<Users className="w-5 h-5" />} 
              label="Federation" 
            />
            <NavItem 
              to="/metrics" 
              icon={<BarChart3 className="w-5 h-5" />} 
              label="Metrics" 
            />
            <NavItem 
              to="/workflows" 
              icon={<Workflow className="w-5 h-5" />} 
              label="Workflows" 
            />
            <NavItem 
              to="/alerts" 
              icon={<Bell className="w-5 h-5" />} 
              label="Alerts" 
              badge={badgeCounts.alerts}
            />
          </nav>

          {/* Bottom Section */}
          <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-800">
            <ConnectionStatus connected={connected} />
            
            <div className="mt-2 space-y-1">
              <button
                onClick={toggleDarkMode}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-colors"
              >
                {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                <span className={sidebarOpen ? '' : 'hidden xl:inline'}>
                  {darkMode ? 'Light Mode' : 'Dark Mode'}
                </span>
              </button>
              
              <NavLink
                to="/settings"
                className={({ isActive }) => `
                  flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors
                  ${isActive 
                    ? 'bg-blue-600 text-white' 
                    : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                  }
                `}
              >
                <Settings className="w-5 h-5" />
                <span className={sidebarOpen ? '' : 'hidden xl:inline'}>Settings</span>
              </NavLink>
              
              <button
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-gray-400 hover:bg-red-900/20 hover:text-red-400 transition-colors"
              >
                <LogOut className="w-5 h-5" />
                <span className={sidebarOpen ? '' : 'hidden xl:inline'}>Logout</span>
              </button>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-h-screen overflow-auto">
          {/* Desktop Header */}
          <header className="hidden lg:flex h-16 items-center justify-between px-8 border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm sticky top-0 z-40">
            <div>
              <h1 className="text-xl font-semibold text-gray-100">
                {location.pathname === '/' && 'Dashboard Overview'}
                {location.pathname === '/sessions' && 'Session Tree'}
                {location.pathname === '/agents' && 'Federation Health'}
                {location.pathname === '/metrics' && 'Metrics'}
                {location.pathname === '/workflows' && 'Workflows'}
                {location.pathname === '/alerts' && 'Alerts'}
                {location.pathname === '/settings' && 'Settings'}
              </h1>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                System Healthy
              </div>
            </div>
          </header>

          {/* Page Content */}
          <div className="p-4 lg:p-8">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
};
