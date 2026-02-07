/**
 * RBAC Middleware
 * 
 * Express/Fastify middleware for role-based access control.
 * Provides authentication and authorization checks.
 */

import { Request, Response, NextFunction } from 'express';
import { EventEmitter } from 'events';
import { getRoleManager } from './roles';
import { getPermissionManager } from './permissions';

// Extended request type with user
export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    roles: string[];
    permissions: string[];
    sessionId?: string;
    authProvider?: string;
  };
}

// Middleware options
export interface RBACMiddlewareOptions {
  // Permission checking
  requireAuth?: boolean;
  requiredPermissions?: string[];
  requireAllPermissions?: boolean;
  
  // Role checking
  requiredRoles?: string[];
  requireAllRoles?: boolean;
  
  // Level checking
  minRoleLevel?: number;
  
  // Resource ownership
  resourceOwnerField?: string;
  allowOwnResource?: boolean;
  
  // Error handling
  unauthorizedMessage?: string;
  forbiddenMessage?: string;
  
  // Audit logging
  auditLog?: boolean;
  auditAction?: string;
}

// Default options
const DEFAULT_OPTIONS: RBACMiddlewareOptions = {
  requireAuth: true,
  requiredPermissions: [],
  requireAllPermissions: true,
  requiredRoles: [],
  requireAllRoles: false,
  allowOwnResource: false,
  unauthorizedMessage: 'Authentication required',
  forbiddenMessage: 'Access denied',
  auditLog: true,
};

/**
 * RBAC Middleware Manager
 */
export class RBACMiddleware extends EventEmitter {
  private roleManager = getRoleManager();
  private permissionManager = getPermissionManager();
  private auditLog: Array<{
    timestamp: Date;
    userId?: string;
    action: string;
    resource: string;
    allowed: boolean;
    reason?: string;
  }> = [];

  /**
   * Authentication middleware - verifies user is logged in
   */
  requireAuth(options: { 
    unauthorizedMessage?: string;
    auditLog?: boolean;
  } = {}): (req: AuthenticatedRequest, res: Response, next: NextFunction) => void {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.user) {
        if (options.auditLog !== false) {
          this.logAudit({
            action: 'AUTH_REQUIRED',
            resource: req.path,
            allowed: false,
            reason: 'No user in request',
          });
        }
        
        res.status(401).json({
          error: 'Unauthorized',
          message: options.unauthorizedMessage || 'Authentication required',
        });
        return;
      }

      next();
    };
  }

  /**
   * Permission check middleware
   */
  requirePermission(
    permissions: string | string[],
    options: Omit<RBACMiddlewareOptions, 'requiredPermissions'> = {}
  ): (req: AuthenticatedRequest, res: Response, next: NextFunction) => void {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const requiredPerms = Array.isArray(permissions) ? permissions : [permissions];

    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      // Check authentication
      if (opts.requireAuth && !req.user) {
        this.denyAccess(req, res, 'AUTH_REQUIRED', opts.unauthorizedMessage!);
        return;
      }

      const userId = req.user?.id;
      const userPerms = req.user?.permissions || [];

      // Check permissions
      let hasPermission: boolean;
      
      if (opts.requireAllPermissions) {
        hasPermission = requiredPerms.every(p => 
          userPerms.some(up => this.permissionManager.matchesPermission(up, p))
        );
      } else {
        hasPermission = requiredPerms.some(p => 
          userPerms.some(up => this.permissionManager.matchesPermission(up, p))
        );
      }

      // Check resource ownership if allowed
      if (!hasPermission && opts.allowOwnResource && opts.resourceOwnerField) {
        const resourceOwner = this.getResourceOwner(req, opts.resourceOwnerField);
        if (resourceOwner === userId) {
          hasPermission = true;
        }
      }

      if (!hasPermission) {
        this.denyAccess(
          req, 
          res, 
          'PERMISSION_DENIED',
          opts.forbiddenMessage!,
          { requiredPermissions: requiredPerms }
        );
        return;
      }

      if (opts.auditLog) {
        this.logAudit({
          userId,
          action: opts.auditAction || 'ACCESS_GRANTED',
          resource: req.path,
          allowed: true,
        });
      }

      next();
    };
  }

  /**
   * Role check middleware
   */
  requireRole(
    roles: string | string[],
    options: Omit<RBACMiddlewareOptions, 'requiredRoles'> = {}
  ): (req: AuthenticatedRequest, res: Response, next: NextFunction) => void {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const requiredRoles = Array.isArray(roles) ? roles : [roles];

    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      // Check authentication
      if (opts.requireAuth && !req.user) {
        this.denyAccess(req, res, 'AUTH_REQUIRED', opts.unauthorizedMessage!);
        return;
      }

      const userRoles = req.user?.roles || [];

      // Check roles
      let hasRole: boolean;
      
      if (opts.requireAllRoles) {
        hasRole = requiredRoles.every(r => userRoles.includes(r));
      } else {
        hasRole = requiredRoles.some(r => userRoles.includes(r));
      }

      // Check minimum role level
      if (!hasRole && opts.minRoleLevel && req.user?.id) {
        const userLevel = this.roleManager.getUserLevel(req.user.id);
        hasRole = userLevel >= opts.minRoleLevel;
      }

      if (!hasRole) {
        this.denyAccess(
          req, 
          res, 
          'ROLE_DENIED',
          opts.forbiddenMessage!,
          { requiredRoles }
        );
        return;
      }

      if (opts.auditLog) {
        this.logAudit({
          userId: req.user?.id,
          action: opts.auditAction || 'ACCESS_GRANTED',
          resource: req.path,
          allowed: true,
        });
      }

      next();
    };
  }

  /**
   * Combined RBAC middleware (checks auth, roles, and permissions)
   */
  requireAccess(options: RBACMiddlewareOptions = {}): (req: AuthenticatedRequest, res: Response, next: NextFunction) => void {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      // Check authentication
      if (opts.requireAuth && !req.user) {
        this.denyAccess(req, res, 'AUTH_REQUIRED', opts.unauthorizedMessage!);
        return;
      }

      const userId = req.user?.id;
      const userRoles = req.user?.roles || [];
      const userPerms = req.user?.permissions || [];

      // Check roles
      if (opts.requiredRoles && opts.requiredRoles.length > 0) {
        let hasRole: boolean;
        
        if (opts.requireAllRoles) {
          hasRole = opts.requiredRoles.every(r => userRoles.includes(r));
        } else {
          hasRole = opts.requiredRoles.some(r => userRoles.includes(r));
        }

        if (!hasRole && opts.minRoleLevel && userId) {
          const userLevel = this.roleManager.getUserLevel(userId);
          hasRole = userLevel >= opts.minRoleLevel;
        }

        if (!hasRole) {
          this.denyAccess(req, res, 'ROLE_DENIED', opts.forbiddenMessage!, {
            requiredRoles: opts.requiredRoles,
          });
          return;
        }
      }

      // Check permissions
      if (opts.requiredPermissions && opts.requiredPermissions.length > 0) {
        let hasPermission: boolean;
        
        if (opts.requireAllPermissions) {
          hasPermission = opts.requiredPermissions.every(p => 
            userPerms.some(up => this.permissionManager.matchesPermission(up, p))
          );
        } else {
          hasPermission = opts.requiredPermissions.some(p => 
            userPerms.some(up => this.permissionManager.matchesPermission(up, p))
          );
        }

        if (!hasPermission && opts.allowOwnResource && opts.resourceOwnerField) {
          const resourceOwner = this.getResourceOwner(req, opts.resourceOwnerField);
          if (resourceOwner === userId) {
            hasPermission = true;
          }
        }

        if (!hasPermission) {
          this.denyAccess(req, res, 'PERMISSION_DENIED', opts.forbiddenMessage!, {
            requiredPermissions: opts.requiredPermissions,
          });
          return;
        }
      }

      if (opts.auditLog) {
        this.logAudit({
          userId,
          action: opts.auditAction || 'ACCESS_GRANTED',
          resource: req.path,
          allowed: true,
        });
      }

      next();
    };
  }

  /**
   * Admin middleware - requires super_admin or admin role
   */
  requireAdmin(options: { auditLog?: boolean } = {}): (req: AuthenticatedRequest, res: Response, next: NextFunction) => void {
    return this.requireRole(['super_admin', 'admin'], {
      requireAllRoles: false,
      auditLog: options.auditLog,
      auditAction: 'ADMIN_ACCESS',
    });
  }

  /**
   * Super admin middleware - requires super_admin role only
   */
  requireSuperAdmin(options: { auditLog?: boolean } = {}): (req: AuthenticatedRequest, res: Response, next: NextFunction) => void {
    return this.requireRole('super_admin', {
      auditLog: options.auditLog,
      auditAction: 'SUPER_ADMIN_ACCESS',
    });
  }

  /**
   * Resource ownership middleware
   */
  requireOwnership(
    ownerField: string,
    options: { allowAdmin?: boolean; auditLog?: boolean } = {}
  ): (req: AuthenticatedRequest, res: Response, next: NextFunction) => void {
    const { allowAdmin = true, auditLog = true } = options;

    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.user) {
        this.denyAccess(req, res, 'AUTH_REQUIRED', 'Authentication required');
        return;
      }

      const userId = req.user.id;
      const resourceOwner = this.getResourceOwner(req, ownerField);

      // Check ownership
      if (resourceOwner === userId) {
        if (auditLog) {
          this.logAudit({
            userId,
            action: 'OWNERSHIP_VERIFIED',
            resource: req.path,
            allowed: true,
          });
        }
        next();
        return;
      }

      // Allow admins
      if (allowAdmin) {
        const isAdmin = req.user.roles.some(r => ['super_admin', 'admin'].includes(r));
        if (isAdmin) {
          if (auditLog) {
            this.logAudit({
              userId,
              action: 'ADMIN_OVERRIDE',
              resource: req.path,
              allowed: true,
              reason: 'Admin access to non-owned resource',
            });
          }
          next();
          return;
        }
      }

      this.denyAccess(req, res, 'OWNERSHIP_DENIED', 'Access denied - not resource owner');
    };
  }

  /**
   * Rate limiting middleware with RBAC integration
   */
  rateLimit(options: {
    windowMs?: number;
    maxRequests?: number;
    skipSuccessfulRequests?: boolean;
    keyGenerator?: (req: AuthenticatedRequest) => string;
  } = {}): (req: AuthenticatedRequest, res: Response, next: NextFunction) => void {
    const {
      windowMs = 60000,
      maxRequests = 100,
      keyGenerator = (req) => req.user?.id || req.ip || 'anonymous',
    } = options;

    const requests = new Map<string, Array<number>>();

    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      const key = keyGenerator(req);
      const now = Date.now();
      
      // Get requests in current window
      const windowStart = now - windowMs;
      const userRequests = (requests.get(key) || []).filter(t => t > windowStart);
      
      if (userRequests.length >= maxRequests) {
        res.status(429).json({
          error: 'Too Many Requests',
          message: 'Rate limit exceeded',
          retryAfter: Math.ceil((userRequests[0] + windowMs - now) / 1000),
        });
        return;
      }

      userRequests.push(now);
      requests.set(key, userRequests);

      // Add rate limit headers
      res.setHeader('X-RateLimit-Limit', maxRequests.toString());
      res.setHeader('X-RateLimit-Remaining', (maxRequests - userRequests.length).toString());
      res.setHeader('X-RateLimit-Reset', String(windowStart + windowMs));

      next();
    };
  }

  /**
   * CORS middleware with RBAC integration
   */
  cors(options: {
    allowedOrigins?: string[];
    allowedMethods?: string[];
    allowedHeaders?: string[];
    credentials?: boolean;
    maxAge?: number;
  } = {}): (req: Request, res: Response, next: NextFunction) => void {
    const {
      allowedOrigins = ['*'],
      allowedMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders = ['Content-Type', 'Authorization', 'X-Requested-With'],
      credentials = true,
      maxAge = 86400,
    } = options;

    return (req: Request, res: Response, next: NextFunction) => {
      const origin = req.headers.origin;
      
      if (origin && (allowedOrigins.includes('*') || allowedOrigins.includes(origin))) {
        res.setHeader('Access-Control-Allow-Origin', origin);
      }

      res.setHeader('Access-Control-Allow-Methods', allowedMethods.join(', '));
      res.setHeader('Access-Control-Allow-Headers', allowedHeaders.join(', '));
      res.setHeader('Access-Control-Max-Age', maxAge.toString());

      if (credentials) {
        res.setHeader('Access-Control-Allow-Credentials', 'true');
      }

      if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
      }

      next();
    };
  }

  /**
   * Audit logging middleware
   */
  auditLogger(options: {
    includeBody?: boolean;
    includeQuery?: boolean;
    sensitiveFields?: string[];
  } = {}): (req: AuthenticatedRequest, res: Response, next: NextFunction) => void {
    const {
      includeBody = false,
      includeQuery = true,
      sensitiveFields = ['password', 'token', 'secret', 'key', 'authorization'],
    } = options;

    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      const startTime = Date.now();

      // Capture response finish
      res.on('finish', () => {
        const duration = Date.now() - startTime;
        
        const logEntry: Record<string, unknown> = {
          timestamp: new Date().toISOString(),
          method: req.method,
          path: req.path,
          userId: req.user?.id,
          ip: req.ip,
          statusCode: res.statusCode,
          duration,
        };

        if (includeQuery && req['query'] && Object.keys(req['query']!).length > 0) {
          logEntry['query'] = req['query'] as Record<string, unknown>;
        }

        if (includeBody && req['body']) {
          // Sanitize sensitive fields
          const sanitizedBody = { ...(req['body'] as Record<string, unknown>) };
          for (const field of sensitiveFields) {
            if (sanitizedBody[field]) {
              sanitizedBody[field] = '[REDACTED]';
            }
          }
          logEntry['body'] = sanitizedBody;
        }

        this.emit('audit:log', logEntry);
      });

      next();
    };
  }

  /**
   * Error handler middleware
   */
  errorHandler(): (err: Error, req: Request, res: Response, next: NextFunction) => void {
    return (err: Error, req: Request, res: Response, next: NextFunction) => {
      // Log error
      this.emit('error', {
        error: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method,
      });

      // Don't leak error details in production
      const isDevelopment = process.env['NODE_ENV'] === 'development';
      
      res.status(500).json({
        error: 'Internal Server Error',
        message: isDevelopment ? err.message : 'An unexpected error occurred',
        ...(isDevelopment && err.stack ? { stack: err.stack } : {})
      });
    };
  }

  /**
   * Get audit log
   */
  getAuditLog(limit: number = 100): typeof this.auditLog {
    return this.auditLog.slice(-limit);
  }

  /**
   * Clear audit log
   */
  clearAuditLog(): void {
    this.auditLog = [];
  }

  /**
   * Helper: Get resource owner from request
   */
  private getResourceOwner(req: AuthenticatedRequest, field: string): string | undefined {
    // Check body
    if (req.body && req.body[field]) {
      return req.body[field];
    }
    
    // Check params
    if (req.params && req.params[field]) {
      return req.params[field] as string;
    }
    
    // Check query
    const queryObj = req['query'] as Record<string, unknown> | undefined;
    if (queryObj && queryObj[field]) {
      const queryVal = queryObj[field];
      return Array.isArray(queryVal) ? queryVal[0] : String(queryVal);
    }
    
    return undefined;
  }

  /**
   * Helper: Deny access and log
   */
  private denyAccess(
    req: AuthenticatedRequest,
    res: Response,
    reason: string,
    message: string,
    details?: Record<string, unknown>
  ): void {
    const statusCode = reason === 'AUTH_REQUIRED' ? 401 : 403;

    this.logAudit({
      userId: req.user?.id,
      action: reason,
      resource: req.path,
      allowed: false,
      reason,
    });

    res.status(statusCode).json({
      error: statusCode === 401 ? 'Unauthorized' : 'Forbidden',
      message,
      ...(process.env['NODE_ENV'] === 'development' && details),
    });
  }

  /**
   * Helper: Log audit entry
   */
  private logAudit(entry: Omit<typeof this.auditLog[0], 'timestamp'>): void {
    const fullEntry = {
      ...entry,
      timestamp: new Date(),
    };
    
    this.auditLog.push(fullEntry);
    
    // Keep audit log size manageable
    if (this.auditLog.length > 10000) {
      this.auditLog = this.auditLog.slice(-5000);
    }

    this.emit('audit:entry', fullEntry);
  }
}

// Factory functions
export function createRBACMiddleware(): RBACMiddleware {
  return new RBACMiddleware();
}

// Convenience exports for common patterns
export const rbac = createRBACMiddleware();

export default RBACMiddleware;
