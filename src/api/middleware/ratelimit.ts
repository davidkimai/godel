/**
 * Rate Limiting Middleware
 * 
 * Limits requests to N per minute per API key.
 */

import { Request, Response, NextFunction } from 'express';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimits = new Map<string, RateLimitEntry>();

export function rateLimitMiddleware(maxRequests: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = (req as any).apiKey || req.ip || 'anonymous';
    const now = Date.now();
    const windowMs = 60000; // 1 minute

    const entry = rateLimits.get(key);

    if (!entry || now > entry.resetTime) {
      // New window
      rateLimits.set(key, {
        count: 1,
        resetTime: now + windowMs
      });
      return next();
    }

    if (entry.count >= maxRequests) {
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
      res.setHeader('Retry-After', retryAfter);
      return res.status(429).json({
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
        retryAfter
      });
    }

    entry.count++;
    next();
  };
}
