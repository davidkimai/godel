"use strict";
/**
 * Error Handling Middleware
 *
 * Centralized error handling for API routes.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
function errorHandler(err, _req, res, _next) {
    console.error('API Error:', err);
    // Don't leak stack traces in production
    const isDev = process.env['NODE_ENV'] === 'development';
    res.status(500).json({
        error: 'Internal Server Error',
        message: isDev ? err.message : 'Something went wrong',
        ...(isDev && { stack: err.stack })
    });
}
//# sourceMappingURL=error.js.map