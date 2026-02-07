/**
 * Alerts Page
 * 
 * Full alerts management page
 */

import React from 'react';
import { AlertPanel } from '../components/AlertPanel/AlertPanel';
import { Bell, Settings, Sliders, Mail, Webhook } from 'lucide-react';

const Alerts: React.FC = () => {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-100">Alerts & Notifications</h2>
          <p className="text-gray-400 mt-1">
            Monitor and configure system alerts
          </p>
        </div>
      </div>

      {/* Alert Configuration */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <AlertPanel maxAlerts={100} />
        </div>

        <div className="space-y-6">
          {/* Alert Settings */}
          <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
            <div className="flex items-center gap-3 mb-6">
              <Settings className="w-5 h-5 text-gray-400" />
              <h3 className="text-lg font-semibold text-gray-100">Alert Settings</h3>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-200">Critical Alerts</p>
                  <p className="text-sm text-gray-400">Immediate notifications</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" defaultChecked className="sr-only peer" />
                  <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-200">Error Alerts</p>
                  <p className="text-sm text-gray-400">Agent failures, task errors</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" defaultChecked className="sr-only peer" />
                  <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-200">Warning Alerts</p>
                  <p className="text-sm text-gray-400">Budget warnings, queue depth</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" />
                  <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-200">Info Alerts</p>
                  <p className="text-sm text-gray-400">General notifications</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" />
                  <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
            </div>
          </div>

          {/* Notification Channels */}
          <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
            <div className="flex items-center gap-3 mb-6">
              <Sliders className="w-5 h-5 text-gray-400" />
              <h3 className="text-lg font-semibold text-gray-100">Notification Channels</h3>
            </div>
            
            <div className="space-y-4">
              <div className="p-3 bg-gray-700/50 rounded-lg">
                <div className="flex items-center gap-3 mb-2">
                  <Mail className="w-4 h-4 text-gray-400" />
                  <span className="font-medium text-gray-200">Email</span>
                </div>
                <p className="text-sm text-gray-400">admin@example.com</p>
                <button className="mt-2 text-sm text-blue-400 hover:text-blue-300">
                  Configure
                </button>
              </div>

              <div className="p-3 bg-gray-700/50 rounded-lg">
                <div className="flex items-center gap-3 mb-2">
                  <Webhook className="w-4 h-4 text-gray-400" />
                  <span className="font-medium text-gray-200">Webhook</span>
                </div>
                <p className="text-sm text-gray-400">Not configured</p>
                <button className="mt-2 text-sm text-blue-400 hover:text-blue-300">
                  Configure
                </button>
              </div>

              <div className="p-3 bg-gray-700/50 rounded-lg">
                <div className="flex items-center gap-3 mb-2">
                  <Bell className="w-4 h-4 text-gray-400" />
                  <span className="font-medium text-gray-200">In-App</span>
                </div>
                <p className="text-sm text-gray-400">Enabled</p>
                <button className="mt-2 text-sm text-blue-400 hover:text-blue-300">
                  Configure
                </button>
              </div>
            </div>
          </div>

          {/* Threshold Settings */}
          <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
            <h3 className="text-lg font-semibold text-gray-100 mb-4">Thresholds</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Budget Warning Threshold (%)
                </label>
                <input
                  type="range"
                  min="50"
                  max="95"
                  defaultValue="80"
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>50%</span>
                  <span className="text-blue-400 font-medium">80%</span>
                  <span>95%</span>
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Error Rate Threshold (%)
                </label>
                <input
                  type="range"
                  min="1"
                  max="20"
                  defaultValue="5"
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>1%</span>
                  <span className="text-blue-400 font-medium">5%</span>
                  <span>20%</span>
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Queue Depth Warning
                </label>
                <input
                  type="number"
                  defaultValue="100"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-200 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Alerts;
