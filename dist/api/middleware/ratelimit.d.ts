/**
 * Rate Limiting Middleware
 *
 * Limits requests to N per minute per API key.
 */
import { Request, Response, NextFunction } from 'express';
export declare function rateLimitMiddleware(maxRequests: number): (req: Request, res: Response, next: NextFunction) => void | Response<any, Record<string, any>>;
//# sourceMappingURL=ratelimit.d.ts.map