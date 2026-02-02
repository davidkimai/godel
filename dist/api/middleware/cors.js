"use strict";
/**
 * CORS Middleware
 *
 * Configures CORS with specific origins (not wildcard).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.corsMiddleware = corsMiddleware;
function corsMiddleware(allowedOrigins) {
    return (req, res, next) => {
        const origin = req.headers.origin;
        if (origin && allowedOrigins.includes(origin)) {
            res.setHeader('Access-Control-Allow-Origin', origin);
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
            res.setHeader('Access-Control-Allow-Credentials', 'true');
        }
        if (req.method === 'OPTIONS') {
            res.status(204).send();
            return;
        }
        next();
    };
}
//# sourceMappingURL=cors.js.map