/**
 * API Authentication Middleware
 * 
 * Validates API keys from X-API-Key header.
 */

import { Request, Response, NextFunction } from 'express';

// In-memory key storage (in production, use database)
const validKeys = new Set<string>();

export function authMiddleware(apiKey: string) {
  // Add default key
  validKeys.add(apiKey);

  return (req: Request, res: Response, next: NextFunction) => {
    // Skip auth for health endpoint
    if (req.path === '/health') {
      return next();
    }

    const key = req.headers['x-api-key'] as string;

    if (!key) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'API key required. Set X-API-Key header.'
      });
    }

    if (!validKeys.has(key)) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid API key'
      });
    }

    // Attach key to request for rate limiting
    (req as any).apiKey = key;
    next();
  };
}

export function addApiKey(key: string): void {
  validKeys.add(key);
}

export function revokeApiKey(key: string): void {
  validKeys.delete(key);
}
