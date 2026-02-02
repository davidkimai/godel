"use strict";
/**
 * Simple Logger for OpenClaw Integrations
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
exports.logger = {
    debug: (...args) => console.debug('[DEBUG]', ...args),
    info: (...args) => console.info('[INFO]', ...args),
    warn: (...args) => console.warn('[WARN]', ...args),
    error: (...args) => console.error('[ERROR]', ...args),
};
//# sourceMappingURL=logger.js.map