/**
 * Settings Page
 * 
 * Dashboard settings including authentication, preferences, and integrations
 */

import React, { useState } from 'react';
import {
  User,
  Shield,
  Bell,
  Palette,
  LogOut,
  Save,
  Copy,
  ExternalLink
} from 'lucide-react';
import { Card, Button, Badge } from '../components/Layout';
import { useAuthStore, useUIStore } from '../contexts/store';
import { authApi } from '../services/api';
import { cn } from '../utils/index.ts';

// ============================================================================
// Settings Page
// ============================================================================

export function SettingsPage(): React.ReactElement {
  const { user, logout } = useAuthStore();
  const { darkMode, toggleDarkMode, addNotification } = useUIStore();
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'notifications' | 'preferences'>('profile');

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } catch (e) {
      // Ignore errors during logout
    }
    logout();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-slate-400 mt-1">Manage your account and preferences</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar */}
        <div className="lg:col-span-1">
          <Card className="p-2">
            <nav className="space-y-1">
              <SettingsNavItem
                icon={<User className="w-4 h-4" />}
                label="Profile"
                active={activeTab === 'profile'}
                onClick={() => setActiveTab('profile')}
              />
              <SettingsNavItem
                icon={<Shield className="w-4 h-4" />}
                label="Security"
                active={activeTab === 'security'}
                onClick={() => setActiveTab('security')}
              />
              <SettingsNavItem
                icon={<Bell className="w-4 h-4" />}
                label="Notifications"
                active={activeTab === 'notifications'}
                onClick={() => setActiveTab('notifications')}
              />
              <SettingsNavItem
                icon={<Palette className="w-4 h-4" />}
                label="Preferences"
                active={activeTab === 'preferences'}
                onClick={() => setActiveTab('preferences')}
              />
            </nav>
          </Card>

          {/* User Info */}
          {user && (
            <Card className="mt-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-500/20 rounded-full flex items-center justify-center">
                  <User className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <p className="font-medium text-white">{user.username}</p>
                  <div className="flex items-center gap-2">
                    <Badge variant={isAdmin() ? 'success' : 'default'}>
                      {user.role}
                    </Badge>
                  </div>
                </div>
              </div>
              <Button
                variant="ghost"
                className="w-full mt-4"
                icon={<LogOut className="w-4 h-4" />}
                onClick={handleLogout}
              >
                Sign Out
              </Button>
            </Card>
          )}
        </div>

        {/* Content */}
        <div className="lg:col-span-3">
          {activeTab === 'profile' && <ProfileSettings />}
          {activeTab === 'security' && <SecuritySettings />}
          {activeTab === 'notifications' && <NotificationSettings />}
          {activeTab === 'preferences' && <PreferenceSettings darkMode={darkMode} toggleDarkMode={toggleDarkMode} />}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Settings Nav Item
// ============================================================================

interface SettingsNavItemProps {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}

function SettingsNavItem({ icon, label, active, onClick }: SettingsNavItemProps): React.ReactElement {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors',
        active
          ? 'bg-emerald-500/10 text-emerald-400'
          : 'text-slate-400 hover:text-white hover:bg-slate-800'
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

// ============================================================================
// Profile Settings
// ============================================================================

function ProfileSettings(): React.ReactElement {
  const { user } = useAuthStore();

  if (!user) {
    return (
      <Card>
        <p className="text-slate-400">Not authenticated</p>
      </Card>
    );
  }

  return (
    <Card title="Profile Settings">
      <form className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">Username</label>
            <input
              type="text"
              value={user.username}
              disabled
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-500 cursor-not-allowed"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">Role</label>
            <input
              type="text"
              value={user.role}
              disabled
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-500 cursor-not-allowed"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-400 mb-2">API Token</label>
          <div className="flex gap-2">
            <input
              type="password"
              value={user.token}
              readOnly
              className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-300 font-mono text-sm"
            />
            <Button variant="secondary" icon={<Copy className="w-4 h-4" />}>
              Copy
            </Button>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Use this token for API authentication. Keep it secure.
          </p>
        </div>

        <div className="flex justify-end">
          <Button icon={<Save className="w-4 h-4" />}>Save Changes</Button>
        </div>
      </form>
    </Card>
  );
}

// ============================================================================
// Security Settings
// ============================================================================

function SecuritySettings(): React.ReactElement {
  const { isAdmin } = useAuthStore();

  if (!isAdmin()) {
    return (
      <Card title="Security Settings">
        <div className="text-center py-8">
          <Shield className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400">Admin access required</p>
        </div>
      </Card>
    );
  }

  return (
    <Card title="Security Settings">
      <div className="space-y-6">
        <SettingSection title="Authentication">
          <ToggleSetting
            label="Require MFA"
            description="Require two-factor authentication for all users"
            enabled={false}
            onToggle={() => {}}
          />
          <ToggleSetting
            label="Session Timeout"
            description="Automatically log out after 8 hours of inactivity"
            enabled={true}
            onToggle={() => {}}
          />
        </SettingSection>

        <SettingSection title="API Access">
          <ToggleSetting
            label="Rate Limiting"
            description="Enable rate limiting for API requests"
            enabled={true}
            onToggle={() => {}}
          />
          <ToggleSetting
            label="IP Whitelisting"
            description="Only allow API access from specific IP addresses"
            enabled={false}
            onToggle={() => {}}
          />
        </SettingSection>

        <SettingSection title="Audit">
          <ToggleSetting
            label="Audit Logging"
            description="Log all administrative actions"
            enabled={true}
            onToggle={() => {}}
          />
        </SettingSection>
      </div>
    </Card>
  );
}

// ============================================================================
// Notification Settings
// ============================================================================

function NotificationSettings(): React.ReactElement {
  return (
    <Card title="Notification Settings">
      <div className="space-y-6">
        <SettingSection title="Swarm Notifications">
          <ToggleSetting
            label="Swarm Created"
            description="Notify when a new swarm is created"
            enabled={true}
            onToggle={() => {}}
          />
          <ToggleSetting
            label="Swarm Completed"
            description="Notify when a swarm completes"
            enabled={true}
            onToggle={() => {}}
          />
          <ToggleSetting
            label="Swarm Failed"
            description="Notify when a swarm fails"
            enabled={true}
            onToggle={() => {}}
          />
        </SettingSection>

        <SettingSection title="Agent Notifications">
          <ToggleSetting
            label="Agent Failed"
            description="Notify when an agent fails"
            enabled={true}
            onToggle={() => {}}
          />
          <ToggleSetting
            label="Budget Alerts"
            description="Notify when approaching budget limits"
            enabled={true}
            onToggle={() => {}}
          />
        </SettingSection>

        <SettingSection title="Delivery">
          <ToggleSetting
            label="Email Notifications"
            description="Send notifications via email"
            enabled={false}
            onToggle={() => {}}
          />
          <ToggleSetting
            label="Slack Integration"
            description="Send notifications to Slack"
            enabled={false}
            onToggle={() => {}}
          />
        </SettingSection>
      </div>
    </Card>
  );
}

// ============================================================================
// Preference Settings
// ============================================================================

interface PreferenceSettingsProps {
  darkMode: boolean;
  toggleDarkMode: () => void;
}

function PreferenceSettings({ darkMode, toggleDarkMode }: PreferenceSettingsProps): React.ReactElement {
  return (
    <Card title="Preferences">
      <div className="space-y-6">
        <SettingSection title="Appearance">
          <ToggleSetting
            label="Dark Mode"
            description="Use dark theme"
            enabled={darkMode}
            onToggle={toggleDarkMode}
          />
        </SettingSection>

        <SettingSection title="Display">
          <ToggleSetting
            label="Compact Mode"
            description="Use compact layout with smaller spacing"
            enabled={false}
            onToggle={() => {}}
          />
          <ToggleSetting
            label="Show Agent IDs"
            description="Display full agent IDs instead of names"
            enabled={false}
            onToggle={() => {}}
          />
        </SettingSection>

        <SettingSection title="Data">
          <ToggleSetting
            label="Auto Refresh"
            description="Automatically refresh data every 30 seconds"
            enabled={true}
            onToggle={() => {}}
          />
          <ToggleSetting
            label="Real-time Updates"
            description="Use WebSocket for live updates (disable for high latency)"
            enabled={true}
            onToggle={() => {}}
          />
        </SettingSection>

        <SettingSection title="Integrations">
          <div className="space-y-3">
            <IntegrationRow
              name="Jaeger"
              description="Distributed tracing"
              connected={true}
              url="http://localhost:16686"
            />
            <IntegrationRow
              name="Prometheus"
              description="Metrics collection"
              connected={true}
              url="http://localhost:9090"
            />
            <IntegrationRow
              name="Grafana"
              description="Visualization"
              connected={false}
            />
          </div>
        </SettingSection>
      </div>
    </Card>
  );
}

// ============================================================================
// Toggle Setting Component
// ============================================================================

interface ToggleSettingProps {
  label: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
}

function ToggleSetting({ label, description, enabled, onToggle }: ToggleSettingProps): React.ReactElement {
  return (
    <div className="flex items-center justify-between py-2">
      <div>
        <p className="font-medium text-white">{label}</p>
        <p className="text-sm text-slate-500">{description}</p>
      </div>
      <button
        onClick={onToggle}
        className={cn(
          'relative w-12 h-6 rounded-full transition-colors',
          enabled ? 'bg-emerald-500' : 'bg-slate-700'
        )}
      >
        <span
          className={cn(
            'absolute top-1 w-4 h-4 bg-white rounded-full transition-transform',
            enabled ? 'translate-x-7' : 'translate-x-1'
          )}
        />
      </button>
    </div>
  );
}

// ============================================================================
// Setting Section Component
// ============================================================================

interface SettingSectionProps {
  title: string;
  children: React.ReactNode;
}

function SettingSection({ title, children }: SettingSectionProps): React.ReactElement {
  return (
    <div>
      <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-3">{title}</h3>
      <div className="bg-slate-800/30 rounded-lg p-4 space-y-1">
        {children}
      </div>
    </div>
  );
}

// ============================================================================
// Integration Row Component
// ============================================================================

interface IntegrationRowProps {
  name: string;
  description: string;
  connected: boolean;
  url?: string;
}

function IntegrationRow({ name, description, connected, url }: IntegrationRowProps): React.ReactElement {
  return (
    <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
      <div>
        <p className="font-medium text-white">{name}</p>
        <p className="text-sm text-slate-500">{description}</p>
      </div>
      <div className="flex items-center gap-2">
        {connected ? (
          <>
            <Badge variant="success">Connected</Badge>
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
          </>
        ) : (
          <Button variant="ghost" size="sm">Connect</Button>
        )}
      </div>
    </div>
  );
}

export default SettingsPage;
