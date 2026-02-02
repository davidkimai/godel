/**
 * Error Handling Middleware
 * 
 * Centralized error handling for API routes.
 */

import { Request, Response, NextFunction } from 'express';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  console.error('API Error:', err);

  // Don't leak stack traces in production
  const isDev = process.env['NODE_ENV'] === 'development';

  res.status(500).json({
    error: 'Internal Server Error',
    message: isDev ? err.message : 'Something went wrong',
    ...(isDev && { stack: err.stack })
  });
}
