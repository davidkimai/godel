"use strict";
/**
 * API Authentication Middleware
 *
 * Validates API keys from X-API-Key header.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.authMiddleware = authMiddleware;
exports.addApiKey = addApiKey;
exports.revokeApiKey = revokeApiKey;
// In-memory key storage (in production, use database)
const validKeys = new Set();
function authMiddleware(apiKey) {
    // Add default key
    validKeys.add(apiKey);
    return (req, res, next) => {
        // Skip auth for health endpoint
        if (req.path === '/health') {
            return next();
        }
        const key = req.headers['x-api-key'];
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
        req.apiKey = key;
        next();
    };
}
function addApiKey(key) {
    validKeys.add(key);
}
function revokeApiKey(key) {
    validKeys.delete(key);
}
//# sourceMappingURL=auth.js.map