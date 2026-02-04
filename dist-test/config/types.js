"use strict";
/**
 * Configuration Types
 *
 * TypeScript type definitions for the Dash configuration system.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigValidationException = void 0;
class ConfigValidationException extends Error {
    constructor(message, errors, configPath) {
        super(message);
        this.errors = errors;
        this.configPath = configPath;
        this.name = 'ConfigValidationException';
    }
}
exports.ConfigValidationException = ConfigValidationException;
