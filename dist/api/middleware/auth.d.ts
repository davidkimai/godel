/**
 * API Authentication Middleware
 *
 * Validates API keys from X-API-Key header.
 */
import { Request, Response, NextFunction } from 'express';
export declare function authMiddleware(apiKey: string): (req: Request, res: Response, next: NextFunction) => void | Response<any, Record<string, any>>;
export declare function addApiKey(key: string): void;
export declare function revokeApiKey(key: string): void;
//# sourceMappingURL=auth.d.ts.map