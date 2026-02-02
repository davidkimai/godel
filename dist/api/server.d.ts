/**
 * Express REST API Server for Dash v3
 *
 * Production-ready API with authentication, rate limiting, and CORS.
 */
import { Server as HttpServer } from 'http';
export interface ServerConfig {
    port: number;
    host: string;
    apiKey: string;
    corsOrigins: string[];
    rateLimit: number;
}
export declare function createApp(config?: Partial<ServerConfig>): import("express-serve-static-core").Express;
export declare function startServer(config?: Partial<ServerConfig>): Promise<HttpServer>;
//# sourceMappingURL=server.d.ts.map