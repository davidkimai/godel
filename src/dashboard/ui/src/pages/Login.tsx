/**
 * Login Page
 * 
 * Simple authentication page for dashboard access
 */

import React, { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import {
  Hexagon,
  User,
  Lock,
  Eye,
  EyeOff,
  LogIn,
  AlertCircle
} from 'lucide-react';
import { useAuthStore } from '../contexts/store';
import { authApi } from '../services/api';
import { Button } from '../components/Layout';
import { cn } from '../utils';

// ============================================================================
// Login Page
// ============================================================================

export function LoginPage(): React.ReactElement {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const { isAuthenticated, login } = useAuthStore();
  const navigate = useNavigate();

  // Redirect if already authenticated
  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const { token, role } = await authApi.login(username, password);
      login({
        id: 'user-1',
        username,
        role: role as 'readonly' | 'admin',
        token,
        expiresAt: new Date(Date.now() + 86400000).toISOString()
      });
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-500/10 rounded-2xl border border-emerald-500/20 mb-4">
            <Hexagon className="w-8 h-8 text-emerald-500" />
          </div>
          <h1 className="text-2xl font-bold text-white">Dash Dashboard</h1>
          <p className="text-slate-400 mt-1">Sign in to manage your agent swarms</p>
        </div>

        {/* Login Form */}
        <div className="bg-slate-900 rounded-xl border border-slate-800 shadow-xl p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="flex items-center gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <span className="text-sm">{error}</span>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">Username</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your username"
                  required
                  className="w-full pl-10 pr-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  className="w-full pl-10 pr-12 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full"
              isLoading={isLoading}
              icon={<LogIn className="w-4 h-4" />}
            >
              Sign In
            </Button>
          </form>

          {/* Demo Credentials */}
          <div className="mt-6 pt-6 border-t border-slate-800">
            <p className="text-sm text-slate-500 text-center mb-3">Demo Credentials</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setUsername('viewer');
                  setPassword('demo');
                }}
                className="p-3 bg-slate-800/50 hover:bg-slate-800 rounded-lg text-center transition-colors"
              >
                <p className="text-sm font-medium text-white">Viewer</p>
                <p className="text-xs text-slate-500">Read-only access</p>
              </button>
              <button
                type="button"
                onClick={() => {
                  setUsername('admin');
                  setPassword('demo');
                }}
                className="p-3 bg-slate-800/50 hover:bg-slate-800 rounded-lg text-center transition-colors"
              >
                <p className="text-sm font-medium text-white">Admin</p>
                <p className="text-xs text-slate-500">Full access</p>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-slate-500 text-sm mt-6">
          Agent Orchestration Platform v3.0
        </p>
      </div>
    </div>
  );
}

export default LoginPage;
