/**
 * Rate Limiting Middleware
 * 
 * Limits requests to prevent abuse and brute force attacks.
 * Uses different limits for different endpoint categories.
 */

import { Request, Response, NextFunction } from 'express';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  skipSuccessfulRequests?: boolean;
  keyPrefix?: string;
}

// Store for rate limit data
const rateLimits = new Map<string, RateLimitEntry>();

// Default configuration
const DEFAULT_CONFIG: RateLimitConfig = {
  windowMs: 60000, // 1 minute
  maxRequests: 1000, // 1000 requests per minute default
};

// Stricter limits for authentication endpoints
const AUTH_CONFIG: RateLimitConfig = {
  windowMs: 900000, // 15 minutes
  maxRequests: 5, // 5 attempts per 15 minutes
  keyPrefix: 'auth:',
};

// API key limits
const API_KEY_CONFIG: RateLimitConfig = {
  windowMs: 60000, // 1 minute
  maxRequests: 100, // 100 requests per minute per API key
  keyPrefix: 'api:',
};

/**
 * Clean up expired entries periodically
 */
function cleanupExpiredEntries(): void {
  const now = Date.now();
  Array.from(rateLimits.entries()).forEach(([key, entry]) => {
    if (now > entry.resetTime) {
      rateLimits.delete(key);
    }
  });
}

// Run cleanup every 5 minutes
setInterval(cleanupExpiredEntries, 300000);

/**
 * Get rate limit key for a request
 */
function getRateLimitKey(req: Request, config: RateLimitConfig): string {
  const prefix = config.keyPrefix || '';
  
  // Use API key if available
  const apiKey = (req as any).apiKey as string | undefined;
  if (apiKey) {
    return `${prefix}api:${apiKey}`;
  }
  
  // Use IP address
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  return `${prefix}ip:${ip}`;
}

/**
 * Check if request is within rate limit
 */
function checkRateLimit(key: string, config: RateLimitConfig): { 
  allowed: boolean; 
  remaining: number; 
  resetTime: number;
  retryAfter?: number;
} {
  const now = Date.now();
  const entry = rateLimits.get(key);

  if (!entry || now > entry.resetTime) {
    // New window
    rateLimits.set(key, {
      count: 1,
      resetTime: now + config.windowMs
    });
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetTime: now + config.windowMs
    };
  }

  if (entry.count >= config.maxRequests) {
    const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
    return {
      allowed: false,
      remaining: 0,
      resetTime: entry.resetTime,
      retryAfter
    };
  }

  entry.count++;
  return {
    allowed: true,
    remaining: config.maxRequests - entry.count,
    resetTime: entry.resetTime
  };
}

/**
 * Generic rate limiting middleware factory
 */
export function createRateLimitMiddleware(config: Partial<RateLimitConfig> = {}) {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  return (req: Request, res: Response, next: NextFunction) => {
    const key = getRateLimitKey(req, finalConfig);
    const result = checkRateLimit(key, finalConfig);

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', finalConfig.maxRequests.toString());
    res.setHeader('X-RateLimit-Remaining', Math.max(0, result.remaining).toString());
    res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetTime / 1000).toString());

    if (!result.allowed) {
      if (result.retryAfter) {
        res.setHeader('Retry-After', result.retryAfter.toString());
      }
      return res.status(429).json({
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Try again in ${result.retryAfter} seconds.`,
        retryAfter: result.retryAfter,
        limit: finalConfig.maxRequests,
        window: `${finalConfig.windowMs / 1000}s`
      });
    }

    next();
  };
}

/**
 * Default rate limit middleware (1000 req/min)
 */
export function rateLimitMiddleware(maxRequests?: number) {
  return createRateLimitMiddleware({
    maxRequests: maxRequests || DEFAULT_CONFIG.maxRequests,
    windowMs: DEFAULT_CONFIG.windowMs
  });
}

/**
 * Strict rate limit for authentication endpoints (5 req/15min)
 * Prevents brute force attacks
 */
export function authRateLimitMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = getRateLimitKey(req, AUTH_CONFIG);
    const result = checkRateLimit(key, AUTH_CONFIG);

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', AUTH_CONFIG.maxRequests.toString());
    res.setHeader('X-RateLimit-Remaining', Math.max(0, result.remaining).toString());
    res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetTime / 1000).toString());

    if (!result.allowed) {
      if (result.retryAfter) {
        res.setHeader('Retry-After', result.retryAfter.toString());
      }
      return res.status(429).json({
        error: 'Too Many Requests',
        message: 'Too many authentication attempts. Please try again later.',
        retryAfter: result.retryAfter,
        code: 'RATE_LIMIT_EXCEEDED'
      });
    }

    next();
  };
}

/**
 * API key specific rate limit (100 req/min per key)
 */
export function apiKeyRateLimitMiddleware() {
  return createRateLimitMiddleware(API_KEY_CONFIG);
}

/**
 * Combined middleware that applies different limits based on endpoint
 */
export function smartRateLimitMiddleware(options: {
  defaultLimit?: number;
  authLimit?: number;
  apiKeyLimit?: number;
} = {}) {
  const defaultMiddleware = createRateLimitMiddleware({
    maxRequests: options.defaultLimit || DEFAULT_CONFIG.maxRequests
  });
  
  const authMiddleware = authRateLimitMiddleware();

  return (req: Request, res: Response, next: NextFunction) => {
    // Check if this is an auth endpoint
    const isAuthEndpoint = req.path.includes('/auth/') || req.path === '/login';
    
    if (isAuthEndpoint) {
      return authMiddleware(req, res, next);
    }
    
    return defaultMiddleware(req, res, next);
  };
}

/**
 * Get current rate limit status for a key
 */
export function getRateLimitStatus(key: string): {
  count: number;
  limit: number;
  remaining: number;
  resetTime: number;
} | null {
  const entry = rateLimits.get(key);
  if (!entry) return null;
  
  return {
    count: entry.count,
    limit: DEFAULT_CONFIG.maxRequests,
    remaining: Math.max(0, DEFAULT_CONFIG.maxRequests - entry.count),
    resetTime: entry.resetTime
  };
}

/**
 * Reset rate limit for a specific key
 */
export function resetRateLimit(key: string): void {
  rateLimits.delete(key);
}

export { DEFAULT_CONFIG, AUTH_CONFIG, API_KEY_CONFIG };
