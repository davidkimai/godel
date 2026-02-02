"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateId = exports.validateSetBudget = exports.validateSwarmAction = exports.validateUpdateSwarm = exports.validateCreateSwarm = exports.validateAgentAction = exports.validateUpdateAgent = exports.validateSpawnAgent = exports.coerceDate = exports.coerceBoolean = exports.coerceInt = exports.coerceNumber = exports.NotFoundError = exports.ValidationError = void 0;
exports.validate = validate;
exports.validatePartial = validatePartial;
exports.validateSafe = validateSafe;
exports.formatZodError = formatZodError;
exports.formatValidationErrors = formatValidationErrors;
exports.formatValidationErrorsObject = formatValidationErrorsObject;
exports.validateRequest = validateRequest;
exports.validateParams = validateParams;
exports.validateQuery = validateQuery;
exports.coerceArray = coerceArray;
exports.validateCliArgs = validateCliArgs;
exports.validateCliArgsResult = validateCliArgsResult;
const zod_1 = require("zod");
const schemas_1 = require("./schemas");
// =============================================================================
// CUSTOM ERRORS
// =============================================================================
class ValidationError extends Error {
    constructor(message, issues, statusCode = 400) {
        super(message);
        this.issues = issues;
        this.statusCode = statusCode;
        this.name = 'ValidationError';
    }
    toJSON() {
        return {
            error: 'ValidationError',
            message: this.message,
            issues: this.issues,
        };
    }
}
exports.ValidationError = ValidationError;
class NotFoundError extends Error {
    constructor(resource, id) {
        super(`${resource} not found: ${id}`);
        this.resource = resource;
        this.id = id;
        this.name = 'NotFoundError';
    }
}
exports.NotFoundError = NotFoundError;
// =============================================================================
// CORE VALIDATION FUNCTIONS
// =============================================================================
function validate(schema, data) {
    const result = schema.safeParse(data);
    if (!result.success) {
        const issues = result.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
        }));
        throw new ValidationError('Validation failed', issues);
    }
    return result.data;
}
function validatePartial(schema, data) {
    const partialSchema = schema.partial();
    return validate(partialSchema, data);
}
function validateSafe(schema, data) {
    const result = schema.safeParse(data);
    if (result.success) {
        return { success: true, data: result.data };
    }
    return {
        success: false,
        errors: result.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
        })),
    };
}
// =============================================================================
// ERROR FORMATTING
// =============================================================================
function formatZodError(error) {
    return error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ');
}
function formatValidationErrors(errors) {
    return errors.map((e) => `${e.path}: ${e.message}`).join('; ');
}
function formatValidationErrorsObject(errors) {
    const result = {};
    for (const error of errors) {
        result[error.path] = error.message;
    }
    return result;
}
// =============================================================================
// EXPRESS MIDDLEWARE
// =============================================================================
function validateRequest(schema) {
    return (req, res, next) => {
        try {
            const validated = validate(schema, req.body);
            req.body = validated;
            next();
        }
        catch (error) {
            if (error instanceof ValidationError) {
                res.status(400).json({
                    error: 'ValidationError',
                    message: error.message,
                    issues: error.issues,
                });
                return;
            }
            next(error);
        }
    };
}
function validateParams(schema) {
    return (req, res, next) => {
        try {
            const validated = validate(schema, req.params);
            req.params = validated;
            next();
        }
        catch (error) {
            if (error instanceof ValidationError) {
                res.status(400).json({
                    error: 'InvalidParams',
                    message: 'Invalid URL parameters',
                    issues: error.issues,
                });
                return;
            }
            next(error);
        }
    };
}
function validateQuery(schema) {
    return (req, res, next) => {
        try {
            // Coerce query params to proper types
            const coerced = {};
            for (const [key, value] of Object.entries(req.query)) {
                if (typeof value === 'string') {
                    // Try to parse as number
                    const num = Number(value);
                    if (!isNaN(num) && value.trim() !== '') {
                        coerced[key] = num;
                    }
                    else if (value === 'true') {
                        coerced[key] = true;
                    }
                    else if (value === 'false') {
                        coerced[key] = false;
                    }
                    else {
                        coerced[key] = value;
                    }
                }
                else {
                    coerced[key] = value;
                }
            }
            const validated = validate(schema, coerced);
            req.query = validated;
            next();
        }
        catch (error) {
            if (error instanceof ValidationError) {
                res.status(400).json({
                    error: 'InvalidQuery',
                    message: 'Invalid query parameters',
                    issues: error.issues,
                });
                return;
            }
            next(error);
        }
    };
}
// =============================================================================
// TYPE COERCION HELPERS
// =============================================================================
exports.coerceNumber = zod_1.z.union([
    zod_1.z.number(),
    zod_1.z.string().transform((val) => {
        const parsed = Number(val);
        if (isNaN(parsed))
            throw new Error('Invalid number');
        return parsed;
    }),
]);
exports.coerceInt = zod_1.z.union([
    zod_1.z.number().int(),
    zod_1.z.string().transform((val) => {
        const parsed = parseInt(val, 10);
        if (isNaN(parsed))
            throw new Error('Invalid integer');
        return parsed;
    }),
]);
exports.coerceBoolean = zod_1.z.union([
    zod_1.z.boolean(),
    zod_1.z.enum(['true', 'false']).transform((val) => val === 'true'),
    zod_1.z.literal(1).transform(() => true),
    zod_1.z.literal(0).transform(() => false),
]);
exports.coerceDate = zod_1.z.union([
    zod_1.z.date(),
    zod_1.z.string().transform((val) => new Date(val)),
    zod_1.z.number().transform((val) => new Date(val)),
]);
function coerceArray(schema) {
    return zod_1.z.union([
        zod_1.z.array(schema),
        schema.transform((val) => [val]),
    ]);
}
// =============================================================================
// SPECIFIC VALIDATORS
// =============================================================================
const validateSpawnAgent = (data) => validate(schemas_1.spawnAgentSchema, data);
exports.validateSpawnAgent = validateSpawnAgent;
const validateUpdateAgent = (data) => validate(schemas_1.updateAgentSchema, data);
exports.validateUpdateAgent = validateUpdateAgent;
const validateAgentAction = (data) => validate(schemas_1.agentActionSchema, data);
exports.validateAgentAction = validateAgentAction;
const validateCreateSwarm = (data) => validate(schemas_1.createSwarmSchema, data);
exports.validateCreateSwarm = validateCreateSwarm;
const validateUpdateSwarm = (data) => validate(schemas_1.updateSwarmSchema, data);
exports.validateUpdateSwarm = validateUpdateSwarm;
const validateSwarmAction = (data) => validate(schemas_1.swarmActionSchema, data);
exports.validateSwarmAction = validateSwarmAction;
const validateSetBudget = (data) => validate(schemas_1.setBudgetSchema, data);
exports.validateSetBudget = validateSetBudget;
const validateId = (data) => validate(schemas_1.idSchema, data);
exports.validateId = validateId;
// =============================================================================
// CLI VALIDATION
// =============================================================================
function validateCliArgs(schema, data, options) {
    const result = validateSafe(schema, data);
    if (!result.success) {
        if (options?.verbose !== false) {
            console.error('Validation failed:');
            for (const error of result.errors) {
                console.error(`  ${error.path}: ${error.message}`);
            }
        }
        if (options?.exitOnError !== false) {
            process.exit(1);
        }
        return null;
    }
    return result.data;
}
function validateCliArgsResult(schema, data) {
    const result = validateSafe(schema, data);
    if (!result.success) {
        return {
            success: false,
            errors: formatValidationErrors(result.errors),
        };
    }
    return { success: true, data: result.data };
}
// =============================================================================
// RE-EXPORTS
// =============================================================================
__exportStar(require("./schemas"), exports);
//# sourceMappingURL=index.js.map