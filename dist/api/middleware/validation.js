"use strict";
/**
 * API Validation Middleware
 *
 * Self-improvement addition: Centralized input validation
 * Improves: Error handling consistency, security
 * Added: 2026-02-02
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.validators = exports.commonRules = void 0;
exports.validateBody = validateBody;
/**
 * Validate request body against rules
 */
function validateBody(rules) {
    return (req, res, next) => {
        const errors = [];
        const body = req.body;
        for (const rule of rules) {
            const value = body[rule.field];
            const error = validateField(rule, value);
            if (error) {
                errors.push({
                    field: rule.field,
                    message: error,
                    value: value
                });
            }
        }
        if (errors.length > 0) {
            res.status(400).json({
                error: 'Validation failed',
                errors: errors.map(e => ({
                    field: e.field,
                    message: e.message
                }))
            });
            return;
        }
        next();
    };
}
/**
 * Validate a single field against its rule
 */
function validateField(rule, value) {
    // Check required
    if (rule.required && (value === undefined || value === null || value === '')) {
        return `${rule.field} is required`;
    }
    // Skip further validation if not required and value is empty
    if (!rule.required && (value === undefined || value === null)) {
        return null;
    }
    // Type validation
    if (value !== undefined && value !== null) {
        const actualType = Array.isArray(value) ? 'array' : typeof value;
        if (actualType !== rule.type) {
            return `${rule.field} must be of type ${rule.type}`;
        }
    }
    // String validations
    if (rule.type === 'string' && typeof value === 'string') {
        if (rule.minLength !== undefined && value.length < rule.minLength) {
            return `${rule.field} must be at least ${rule.minLength} characters`;
        }
        if (rule.maxLength !== undefined && value.length > rule.maxLength) {
            return `${rule.field} must be at most ${rule.maxLength} characters`;
        }
        if (rule.pattern && !rule.pattern.test(value)) {
            return `${rule.field} format is invalid`;
        }
    }
    // Enum validation
    if (rule.enum !== undefined && !rule.enum.includes(value)) {
        return `${rule.field} must be one of: ${rule.enum.join(', ')}`;
    }
    // Custom validation
    if (rule.custom) {
        const customResult = rule.custom(value);
        if (customResult !== true) {
            return typeof customResult === 'string' ? customResult : `${rule.field} is invalid`;
        }
    }
    return null;
}
/**
 * Common validation rules
 */
exports.commonRules = {
    id: (field = 'id') => ({
        field,
        type: 'string',
        required: true,
        pattern: /^[a-zA-Z0-9_-]+$/,
    }),
    name: (field = 'name') => ({
        field,
        type: 'string',
        required: true,
        minLength: 1,
        maxLength: 255,
    }),
    status: (field = 'status', allowed = ['idle', 'running', 'completed', 'failed', 'killed']) => ({
        field,
        type: 'string',
        required: true,
        enum: allowed,
    }),
    budget: (field = 'budget_limit') => ({
        field,
        type: 'number',
        required: false,
        custom: (value) => {
            if (typeof value !== 'number')
                return true;
            return value >= 0 || 'Budget must be non-negative';
        },
    }),
};
/**
 * Predefined validators for common endpoints
 */
exports.validators = {
    createSwarm: validateBody([
        exports.commonRules.name('name'),
        {
            field: 'config',
            type: 'object',
            required: false,
        },
    ]),
    createAgent: validateBody([
        {
            field: 'swarm_id',
            type: 'string',
            required: true,
            pattern: /^[a-zA-Z0-9_-]+$/,
        },
        {
            field: 'task',
            type: 'string',
            required: true,
            minLength: 1,
        },
        {
            field: 'model',
            type: 'string',
            required: false,
        },
        exports.commonRules.budget('budget_limit'),
    ]),
    updateAgent: validateBody([
        exports.commonRules.status('status'),
    ]),
    createEvent: validateBody([
        {
            field: 'eventType',
            type: 'string',
            required: true,
            minLength: 1,
        },
        {
            field: 'payload',
            type: 'object',
            required: false,
        },
    ]),
};
//# sourceMappingURL=validation.js.map