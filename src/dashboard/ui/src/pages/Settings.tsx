/**
 * Settings Page
 * 
 * Dashboard configuration and preferences
 */

import React, { useState } from 'react';
import { 
  User, 
  Key, 
  Bell, 
  Palette, 
  Globe, 
  Shield, 
  Database,
  Save,
  RefreshCw
} from 'lucide-react';

const Settings: React.FC = () => {
  const [activeTab, setActiveTab] = useState('general');
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const tabs = [
    { id: 'general', label: 'General', icon: User },
    { id: 'api', label: 'API Keys', icon: Key },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'data', label: 'Data', icon: Database }
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-100">Settings</h2>
        <p className="text-gray-400 mt-1">
          Configure your dashboard preferences
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Sidebar Tabs */}
        <div className="lg:w-64 space-y-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1">
          {activeTab === 'general' && (
            <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
              <h3 className="text-lg font-semibold text-gray-100 mb-6">General Settings</h3>
              
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Dashboard Name
                  </label>
                  <input
                    type="text"
                    defaultValue="Godel Dashboard"
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-200 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Default Timezone
                  </label>
                  <select className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-200 focus:outline-none focus:border-blue-500">
                    <option>UTC</option>
                    <option>America/New_York</option>
                    <option>America/Los_Angeles</option>
                    <option>Europe/London</option>
                    <option>Asia/Tokyo</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Language
                  </label>
                  <select className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-200 focus:outline-none focus:border-blue-500">
                    <option>English</option>
                    <option>Spanish</option>
                    <option>French</option>
                    <option>German</option>
                    <option>Chinese</option>
                  </select>
                </div>

                <div className="flex items-center justify-between p-4 bg-gray-700/50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-200">Auto-refresh</p>
                    <p className="text-sm text-gray-400">Automatically refresh dashboard data</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" defaultChecked className="sr-only peer" />
                    <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'api' && (
            <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
              <h3 className="text-lg font-semibold text-gray-100 mb-6">API Keys</h3>
              
              <div className="space-y-4">
                <div className="p-4 bg-gray-700/50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-gray-200">Dashboard API Key</span>
                    <button className="text-sm text-blue-400 hover:text-blue-300">
                      Regenerate
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-3 py-2 bg-gray-900 rounded text-sm text-gray-400 font-mono">
                      ••••••••••••••••••••••••••
                    </code>
                    <button className="px-3 py-2 bg-gray-700 text-gray-300 rounded hover:bg-gray-600">
                      Copy
                    </button>
                  </div>
                </div>

                <div className="p-4 bg-gray-700/50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-gray-200">Webhook Secret</span>
                    <button className="text-sm text-blue-400 hover:text-blue-300">
                      Regenerate
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-3 py-2 bg-gray-900 rounded text-sm text-gray-400 font-mono">
                      ••••••••••••••••••••••••••
                    </code>
                    <button className="px-3 py-2 bg-gray-700 text-gray-300 rounded hover:bg-gray-600">
                      Copy
                    </button>
                  </div>
                </div>

                <button className="w-full py-2 border border-dashed border-gray-600 text-gray-400 rounded-lg hover:border-gray-500 hover:text-gray-300">
                  + Add New API Key
                </button>
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
              <h3 className="text-lg font-semibold text-gray-100 mb-6">Notification Preferences</h3>
              
              <div className="space-y-4">
                {[
                  { label: 'Email notifications', desc: 'Receive alerts via email' },
                  { label: 'Push notifications', desc: 'Browser push notifications' },
                  { label: 'SMS notifications', desc: 'Critical alerts via SMS' },
                  { label: 'Slack integration', desc: 'Send alerts to Slack channel' }
                ].map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-4 bg-gray-700/50 rounded-lg">
                    <div>
                      <p className="font-medium text-gray-200">{item.label}</p>
                      <p className="text-sm text-gray-400">{item.desc}</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" />
                      <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'appearance' && (
            <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
              <h3 className="text-lg font-semibold text-gray-100 mb-6">Appearance</h3>
              
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-3">
                    Theme
                  </label>
                  <div className="grid grid-cols-2 gap-4">
                    <button className="p-4 bg-gray-700 rounded-lg border-2 border-blue-500">
                      <div className="w-full h-20 bg-gray-900 rounded mb-2" />
                      <span className="text-sm text-gray-200">Dark</span>
                    </button>
                    <button className="p-4 bg-gray-100 rounded-lg border-2 border-transparent">
                      <div className="w-full h-20 bg-white rounded mb-2" />
                      <span className="text-sm text-gray-700">Light</span>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-3">
                    Accent Color
                  </label>
                  <div className="flex gap-3">
                    {['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444'].map(color => (
                      <button
                        key={color}
                        className="w-10 h-10 rounded-lg border-2 border-transparent hover:border-white transition-colors"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-3">
                    Density
                  </label>
                  <select className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-200">
                    <option>Compact</option>
                    <option>Comfortable</option>
                    <option>Spacious</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
              <h3 className="text-lg font-semibold text-gray-100 mb-6">Security</h3>
              
              <div className="space-y-4">
                <div className="p-4 bg-gray-700/50 rounded-lg">
                  <h4 className="font-medium text-gray-200 mb-2">Change Password</h4>
                  <div className="space-y-3">
                    <input
                      type="password"
                      placeholder="Current password"
                      className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-200"
                    />
                    <input
                      type="password"
                      placeholder="New password"
                      className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-200"
                    />
                    <input
                      type="password"
                      placeholder="Confirm new password"
                      className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-200"
                    />
                    <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500">
                      Update Password
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-gray-700/50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-200">Two-Factor Authentication</p>
                    <p className="text-sm text-gray-400">Add extra security to your account</p>
                  </div>
                  <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500">
                    Enable
                  </button>
                </div>

                <div className="flex items-center justify-between p-4 bg-gray-700/50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-200">Session Management</p>
                    <p className="text-sm text-gray-400">Active sessions: 3</p>
                  </div>
                  <button className="px-4 py-2 bg-red-600/20 text-red-400 rounded-lg hover:bg-red-600/30">
                    Revoke All
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'data' && (
            <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
              <h3 className="text-lg font-semibold text-gray-100 mb-6">Data Management</h3>
              
              <div className="space-y-4">
                <div className="p-4 bg-gray-700/50 rounded-lg">
                  <h4 className="font-medium text-gray-200 mb-2">Export Data</h4>
                  <p className="text-sm text-gray-400 mb-3">
                    Download your dashboard data and configurations
                  </p>
                  <div className="flex gap-2">
                    <button className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600">
                      Export JSON
                    </button>
                    <button className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600">
                      Export CSV
                    </button>
                  </div>
                </div>

                <div className="p-4 bg-gray-700/50 rounded-lg">
                  <h4 className="font-medium text-gray-200 mb-2">Clear Cache</h4>
                  <p className="text-sm text-gray-400 mb-3">
                    Clear local storage and cached data
                  </p>
                  <button className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600">
                    Clear Cache
                  </button>
                </div>

                <div className="p-4 bg-red-900/20 border border-red-900/50 rounded-lg">
                  <h4 className="font-medium text-red-400 mb-2">Danger Zone</h4>
                  <p className="text-sm text-gray-400 mb-3">
                    These actions cannot be undone
                  </p>
                  <div className="flex gap-2">
                    <button className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-500">
                      Reset Settings
                    </button>
                    <button className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-500">
                      Delete Account
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Save Button */}
          <div className="mt-6 flex items-center justify-end gap-4">
            {saved && (
              <span className="text-green-400 flex items-center gap-2">
                <Save className="w-4 h-4" />
                Saved successfully
              </span>
            )}
            <button
              onClick={handleSave}
              className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors"
            >
              <Save className="w-4 h-4" />
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
