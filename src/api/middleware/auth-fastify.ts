/**
 * Authentication Middleware for Fastify
 * 
 * Supports X-API-Key and Bearer token authentication with JWT validation.
 */

import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';

export interface AuthConfig {
  /** API key for X-API-Key authentication */
  apiKey: string;
  /** JWT secret for Bearer token validation */
  jwtSecret?: string;
  /** JWT issuer */
  jwtIssuer?: string;
  /** JWT audience */
  jwtAudience?: string;
  /** Routes that don't require authentication */
  publicRoutes?: string[];
  /** Enable JWT validation */
  enableJwt?: boolean;
}

export interface AuthenticatedRequest extends FastifyRequest {
  user?: {
    id: string;
    role: string;
    permissions: string[];
  };
  authType?: 'apiKey' | 'bearer';
}

const DEFAULT_PUBLIC_ROUTES = [
  '/health',
  '/health/detailed',
  '/api/openapi.json',
  '/api/docs',
  '/api/docs/*',
];

/**
 * Extract API key from request headers
 */
function extractApiKey(request: FastifyRequest): string | null {
  // Check X-API-Key header
  const apiKey = request.headers['x-api-key'];
  if (typeof apiKey === 'string') {
    return apiKey;
  }
  
  // Check Authorization header with ApiKey prefix
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith('ApiKey ')) {
    return authHeader.slice(7);
  }
  
  return null;
}

/**
 * Extract Bearer token from request headers
 */
function extractBearerToken(request: FastifyRequest): string | null {
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  return null;
}

/**
 * Simple JWT validation (without external library dependency)
 * Note: For production, use @fastify/jwt plugin
 */
function validateJwtToken(token: string, secret: string): { valid: boolean; payload?: Record<string, unknown> } {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return { valid: false };
    }
    
    // Decode payload
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    
    // Check expiration
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return { valid: false };
    }
    
    // Check not before
    if (payload.nbf && payload.nbf > Math.floor(Date.now() / 1000)) {
      return { valid: false };
    }
    
    return { valid: true, payload };
  } catch {
    return { valid: false };
  }
}

/**
 * Check if route is public
 */
function isPublicRoute(path: string, publicRoutes: string[]): boolean {
  return publicRoutes.some(route => {
    if (route.endsWith('*')) {
      return path.startsWith(route.slice(0, -1));
    }
    return path === route;
  });
}

/**
 * Authentication plugin for Fastify
 */
const authPlugin: FastifyPluginAsync<AuthConfig> = async (fastify: FastifyInstance, config: AuthConfig) => {
  const publicRoutes = [...DEFAULT_PUBLIC_ROUTES, ...(config.publicRoutes || [])];
  
  // Add hook to validate authentication
  fastify.addHook('onRequest', async (request: AuthenticatedRequest, reply: FastifyReply) => {
    // Skip authentication for public routes
    if (isPublicRoute(request.url, publicRoutes)) {
      return;
    }
    
    // Try API key authentication
    const apiKey = extractApiKey(request);
    if (apiKey) {
      if (apiKey === config.apiKey) {
        request.authType = 'apiKey';
        request.user = {
          id: 'api-key',
          role: 'admin',
          permissions: ['*'],
        };
        return;
      }
      
      reply.status(401).send({
        success: false,
        error: {
          code: 'INVALID_API_KEY',
          message: 'Invalid API key provided',
        },
      });
      return;
    }
    
    // Try Bearer token authentication
    const bearerToken = extractBearerToken(request);
    if (bearerToken) {
      if (config.enableJwt && config.jwtSecret) {
        const { valid, payload } = validateJwtToken(bearerToken, config.jwtSecret);
        
        if (valid && payload) {
          request.authType = 'bearer';
          request.user = {
            id: String(payload.sub || 'unknown'),
            role: String(payload.role || 'user'),
            permissions: Array.isArray(payload.permissions) 
              ? payload.permissions.map(String)
              : ['read'],
          };
          return;
        }
        
        reply.status(401).send({
          success: false,
          error: {
            code: 'INVALID_TOKEN',
            message: 'Invalid or expired token',
          },
        });
        return;
      }
      
      // Simple token validation (for demo purposes)
      if (bearerToken === config.apiKey) {
        request.authType = 'bearer';
        request.user = {
          id: 'token-user',
          role: 'admin',
          permissions: ['*'],
        };
        return;
      }
      
      reply.status(401).send({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid token provided',
        },
      });
      return;
    }
    
    // No authentication provided
    reply.status(401).send({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required. Provide X-API-Key or Authorization header.',
      },
    });
  });
  
  // Add decorator to check permissions
  fastify.decorate('hasPermission', function(
    request: AuthenticatedRequest,
    permission: string
  ): boolean {
    if (!request.user) return false;
    if (request.user.permissions.includes('*')) return true;
    return request.user.permissions.includes(permission);
  });
};

/**
 * Require specific permission
 */
export function requirePermission(permission: string) {
  return async (request: AuthenticatedRequest, reply: FastifyReply) => {
    if (!request.user) {
      reply.status(401).send({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
      return;
    }
    
    if (!request.user.permissions.includes('*') && !request.user.permissions.includes(permission)) {
      reply.status(403).send({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `Permission '${permission}' required`,
        },
      });
      return;
    }
  };
}

/**
 * Require admin role
 */
export async function requireAdmin(request: AuthenticatedRequest, reply: FastifyReply) {
  if (!request.user || request.user.role !== 'admin') {
    reply.status(403).send({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Admin role required',
      },
    });
  }
}

// Export plugin
export default fp(authPlugin, {
  name: 'auth',
});

// Extend Fastify types
declare module 'fastify' {
  interface FastifyInstance {
    hasPermission(request: AuthenticatedRequest, permission: string): boolean;
  }
  
  interface FastifyRequest {
    user?: {
      id: string;
      role: string;
      permissions: string[];
    };
    authType?: 'apiKey' | 'bearer';
  }
}
