import { logger } from '../utils/logger';
import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';
import {
  spawnAgentSchema,
  updateAgentSchema,
  agentActionSchema,
  createTeamSchema,
  updateTeamSchema,
  teamActionSchema,
  setBudgetSchema,
  idSchema,
  type SpawnAgentInput,
  type UpdateAgentInput,
  type AgentActionInput,
  type CreateTeamInput,
  type UpdateTeamInput,
  type TeamActionInput,
  type SetBudgetInput,
} from './schemas';

// =============================================================================
// CUSTOM ERRORS
// =============================================================================

export class ValidationError extends Error {
  constructor(
    message: string,
    public issues: Array<{ path: string; message: string }>,
    public statusCode: number = 400
  ) {
    super(message);
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

export class NotFoundError extends Error {
  constructor(
    public resource: string,
    public id: string
  ) {
    super(`${resource} not found: ${id}`);
    this.name = 'NotFoundError';
  }
}

// =============================================================================
// CORE VALIDATION FUNCTIONS
// =============================================================================

export function validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (result.success === false) {
    const issues = result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    throw new ValidationError('Validation failed', issues);
  }
  return result.data;
}

export function validatePartial<T extends z.ZodObject<any>>(
  schema: T,
  data: unknown
): Partial<z.infer<T>> {
  const partialSchema = schema.partial();
  return validate(partialSchema, data);
}

export type ValidationResult<T> = 
  | { success: true; data: T }
  | { success: false; errors: Array<{ path: string; message: string }> };

export function validateSafe<T>(schema: z.ZodSchema<T>, data: unknown): ValidationResult<T> {
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

export function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ');
}

export function formatValidationErrors(errors: Array<{ path: string; message: string }>): string {
  return errors.map((e) => `${e.path}: ${e.message}`).join('; ');
}

export function formatValidationErrorsObject(
  errors: Array<{ path: string; message: string }>
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const error of errors) {
    result[error.path] = error.message;
  }
  return result;
}

// =============================================================================
// EXPRESS MIDDLEWARE
// =============================================================================

export function validateRequest<T>(schema: z.ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = validate(schema, req.body);
      req.body = validated;
      next();
    } catch (error) {
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

export function validateParams<T extends z.ZodObject<any>>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = validate(schema, req.params);
      req.params = validated as Record<string, string>;
      next();
    } catch (error) {
      if (error instanceof ValidationError) {
        res.status(400).json({
          error: 'InvalidParams',
          message: 'Invalid URL parameters',
          issues: (error as ValidationError).issues,
        });
        return;
      }
      next(error);
    }
  };
}

export function validateQuery<T extends z.ZodObject<any>>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Coerce query params to proper types
      const coerced: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(req.query)) {
        if (typeof value === 'string') {
          // Try to parse as number
          const num = Number(value);
          if (!isNaN(num) && value.trim() !== '') {
            coerced[key] = num;
          } else if (value === 'true') {
            coerced[key] = true;
          } else if (value === 'false') {
            coerced[key] = false;
          } else {
            coerced[key] = value;
          }
        } else {
          coerced[key] = value;
        }
      }
      
      const validated = validate(schema, coerced);
      req.query = validated as unknown as typeof req.query;
      next();
    } catch (error) {
      if (error instanceof ValidationError) {
        res.status(400).json({
          error: 'InvalidQuery',
          message: 'Invalid query parameters',
          issues: (error as ValidationError).issues,
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

export const coerceNumber = z.union([
  z.number(),
  z.string().transform((val) => {
    const parsed = Number(val);
    if (isNaN(parsed)) throw new Error('Invalid number');
    return parsed;
  }),
]);

export const coerceInt = z.union([
  z.number().int(),
  z.string().transform((val) => {
    const parsed = parseInt(val, 10);
    if (isNaN(parsed)) throw new Error('Invalid integer');
    return parsed;
  }),
]);

export const coerceBoolean = z.union([
  z.boolean(),
  z.enum(['true', 'false']).transform((val) => val === 'true'),
  z.literal(1).transform(() => true),
  z.literal(0).transform(() => false),
]);

export const coerceDate = z.union([
  z.date(),
  z.string().transform((val) => new Date(val)),
  z.number().transform((val) => new Date(val)),
]);

export function coerceArray<T>(schema: z.ZodSchema<T>) {
  return z.union([
    z.array(schema),
    schema.transform((val) => [val]),
  ]);
}

// =============================================================================
// SPECIFIC VALIDATORS
// =============================================================================

export const validateSpawnAgent = (data: unknown) => validate(spawnAgentSchema, data);
export const validateUpdateAgent = (data: unknown) => validate(updateAgentSchema, data);
export const validateAgentAction = (data: unknown) => validate(agentActionSchema, data);
export const validateCreateTeam = (data: unknown) => validate(createTeamSchema, data);
export const validateUpdateTeam = (data: unknown) => validate(updateTeamSchema, data);
export const validateTeamAction = (data: unknown) => validate(teamActionSchema, data);
export const validateSetBudget = (data: unknown) => validate(setBudgetSchema, data);
export const validateId = (data: unknown): string => validate(idSchema, data);

// =============================================================================
// CLI VALIDATION
// =============================================================================

export function validateCliArgs<T>(schema: z.ZodSchema<T>, data: unknown, options?: { exitOnError?: boolean; verbose?: boolean }): T | null {
  const result = validateSafe(schema, data);
  if (result.success === false) {
    if (options?.verbose !== false) {
      logger.error('Validation failed:');
      const errorResult = result as { success: false; errors: Array<{ path: string; message: string }> };
      for (const error of errorResult.errors) {
        logger.error(`  ${error.path}: ${error.message}`);
      }
    }
    if (options?.exitOnError !== false) {
      process.exit(1);
    }
    return null;
  }
  return (result as { success: true; data: T }).data;
}

export function validateCliArgsResult<T>(schema: z.ZodSchema<T>, data: unknown): 
  | { success: true; data: T }
  | { success: false; errors: string } {
  const result = validateSafe(schema, data);
  if (result.success === false) {
    const errorResult = result as { success: false; errors: Array<{ path: string; message: string }> };
    return {
      success: false,
      errors: formatValidationErrors(errorResult.errors),
    };
  }
  return { success: true, data: (result as { success: true; data: T }).data };
}

// =============================================================================
// RE-EXPORTS
// =============================================================================

export * from './schemas';
