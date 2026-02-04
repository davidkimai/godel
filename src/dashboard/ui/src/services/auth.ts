/**
 * Secure Authentication Service
 * 
 * Handles authentication using httpOnly cookies instead of localStorage.
 * Implements CSRF protection for state-changing operations.
 */

import { z } from 'zod';
import { User, UserRole } from '../types';

// ============================================================================
// Configuration
// ============================================================================

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:7373';

// CSRF Token storage (not in localStorage - use memory only)
let csrfToken: string | null = null;
let tokenRefreshTimer: number | null = null;

// ============================================================================
// Validation Schemas
// ============================================================================

const LoginCredentialsSchema = z.object({
  username: z.string().min(1).max(128).regex(/^[a-zA-Z0-9._@-]+$/),
  password: z.string().min(8).max(256),
});

// Map API role string to UserRole enum
function mapRoleToUserRole(role: 'admin' | 'user' | 'readonly'): UserRole {
  if (role === 'admin') return UserRole.ADMIN;
  if (role === 'user') return UserRole.USER;
  return UserRole.READONLY;
}

const AuthResponseSchema = z.object({
  success: z.boolean(),
  user: z.object({
    id: z.string(),
    username: z.string(),
    role: z.enum(['admin', 'user', 'readonly']),
    email: z.string().email().optional(),
  }).optional(),
  csrfToken: z.string().optional(),
  error: z.string().optional(),
});

// ============================================================================
// Types
// ============================================================================

export interface AuthResult {
  success: boolean;
  user?: User;
  error?: string;
}

// ============================================================================
// CSRF Protection
// ============================================================================

/**
 * Generate cryptographically secure CSRF token
 */
function generateCsrfToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Get CSRF token for state-changing requests
 */
export function getCsrfToken(): string | null {
  return csrfToken;
}

/**
 * Set CSRF token from server response
 */
export function setCsrfToken(token: string): void {
  csrfToken = token;
}

// ============================================================================
// HTTP Client with Credentials
// ============================================================================

class AuthError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: unknown
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

interface FetchOptions extends RequestInit {
  skipCsrf?: boolean;
}

async function fetchWithAuth(endpoint: string, options: FetchOptions = {}): Promise<unknown> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers as Record<string, string>,
  };

  // Add CSRF token for state-changing methods
  if (!options.skipCsrf && 
      options.method && 
      ['POST', 'PUT', 'PATCH', 'DELETE'].includes(options.method.toUpperCase())) {
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include', // Important: sends httpOnly cookies
  });

  if (!response.ok) {
    // Handle 401 - redirect to login
    if (response.status === 401) {
      clearAuthState();
      window.location.href = '/login';
      throw new AuthError('Session expired', 401);
    }

    const errorData = await response.json().catch(() => ({}));
    throw new AuthError(
      errorData.error || `HTTP ${response.status}`,
      response.status,
      errorData
    );
  }

  // Extract new CSRF token from response headers if present
  const newCsrfToken = response.headers.get('X-CSRF-Token');
  if (newCsrfToken) {
    csrfToken = newCsrfToken;
  }

  return response.json();
}

// ============================================================================
// Auth Service
// ============================================================================

export const authService = {
  /**
   * Login user with credentials
   * Server sets httpOnly session cookie
   */
  async login(username: string, password: string): Promise<AuthResult> {
    try {
      // Validate credentials format
      const result = LoginCredentialsSchema.safeParse({ username, password });
      if (!result.success) {
        return { success: false, error: 'Invalid credentials format' };
      }

      const response = await fetchWithAuth('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(result.data),
        skipCsrf: true, // No CSRF needed for login
      });

      const authData = AuthResponseSchema.parse(response);

      if (authData.success && authData.user) {
        // Store CSRF token in memory (not localStorage!)
        if (authData.csrfToken) {
          csrfToken = authData.csrfToken;
        }

        // Start token refresh timer
        startTokenRefresh();

        // Map to User type from types/index.ts
        return {
          success: true,
          user: {
            id: authData.user.id,
            username: authData.user.username,
            role: mapRoleToUserRole(authData.user.role),
            email: authData.user.email,
            token: csrfToken || undefined,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
          },
        };
      }

      return {
        success: false,
        error: authData.error || 'Login failed',
      };
    } catch (error) {
      console.error('[Auth] Login failed:', error);
      return {
        success: false,
        error: error instanceof AuthError ? error.message : 'Login failed',
      };
    }
  },

  /**
   * Logout user - clears server session and client state
   */
  async logout(): Promise<void> {
    try {
      await fetchWithAuth('/api/auth/logout', {
        method: 'POST',
      });
    } catch (error) {
      console.error('[Auth] Logout error:', error);
    } finally {
      clearAuthState();
    }
  },

  /**
   * Check if user is authenticated
   * Server validates httpOnly cookie
   */
  async checkAuth(): Promise<AuthResult> {
    try {
      const response = await fetchWithAuth('/api/auth/me', {
        method: 'GET',
      });

      const authData = AuthResponseSchema.parse(response);

      if (authData.success && authData.user) {
        // Refresh CSRF token if provided
        if (authData.csrfToken) {
          csrfToken = authData.csrfToken;
        }

        // Ensure refresh timer is running
        if (!tokenRefreshTimer) {
          startTokenRefresh();
        }

        // Map to User type from types/index.ts
        return {
          success: true,
          user: {
            id: authData.user.id,
            username: authData.user.username,
            role: mapRoleToUserRole(authData.user.role),
            email: authData.user.email,
            token: csrfToken || undefined,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
          },
        };
      }

      return {
        success: false,
        error: 'Not authenticated',
      };
    } catch (error) {
      if (error instanceof AuthError && error.status === 401) {
        return { success: false, error: 'Session expired' };
      }
      return {
        success: false,
        error: 'Authentication check failed',
      };
    }
  },

  /**
   * Refresh session before expiration
   */
  async refreshSession(): Promise<boolean> {
    try {
      const response = await fetchWithAuth('/api/auth/refresh', {
        method: 'POST',
      });

      const authData = AuthResponseSchema.parse(response);

      if (authData.success && authData.csrfToken) {
        csrfToken = authData.csrfToken;
      }

      return authData.success;
    } catch (error) {
      console.error('[Auth] Session refresh failed:', error);
      clearAuthState();
      return false;
    }
  },

  /**
   * Get current CSRF token for form submissions
   */
  getCsrfToken(): string | null {
    return csrfToken;
  },

  /**
   * Check if authenticated (synchronous - may be stale)
   */
  isAuthenticated(): boolean {
    return !!csrfToken;
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

function startTokenRefresh(): void {
  // Clear existing timer
  if (tokenRefreshTimer) {
    clearInterval(tokenRefreshTimer);
  }

  // Refresh token every 5 minutes (before typical 15-min expiration)
  tokenRefreshTimer = window.setInterval(() => {
    authService.refreshSession().then(success => {
      if (!success) {
        clearAuthState();
        window.location.href = '/login';
      }
    });
  }, 5 * 60 * 1000);
}

function clearAuthState(): void {
  csrfToken = null;
  if (tokenRefreshTimer) {
    clearInterval(tokenRefreshTimer);
    tokenRefreshTimer = null;
  }
}

// ============================================================================
// Export
// ============================================================================

export default authService;
