/**
 * CORS Middleware
 *
 * Configures CORS with specific origins (not wildcard).
 */
import { Request, Response, NextFunction } from 'express';
export declare function corsMiddleware(allowedOrigins: string[]): (req: Request, res: Response, next: NextFunction) => void;
//# sourceMappingURL=cors.d.ts.map