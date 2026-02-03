/**
 * API Validation Middleware
 * 
 * Self-improvement addition: Centralized input validation
 * Improves: Error handling consistency, security
 * Added: 2026-02-02
 */

import { Request, Response, NextFunction } from 'express';

export interface ValidationRule {
  field: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  enum?: unknown[];
  custom?: (value: unknown) => boolean | string;
}

export interface ValidationError {
  field: string;
  message: string;
  value?: unknown;
}

/**
 * Validate request body against rules
 */
export function validateBody(rules: ValidationRule[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const errors: ValidationError[] = [];
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
function validateField(rule: ValidationRule, value: unknown): string | null {
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
export const commonRules = {
  id: (field = 'id'): ValidationRule => ({
    field,
    type: 'string',
    required: true,
    pattern: /^[a-zA-Z0-9_-]+$/,
  }),
  name: (field = 'name'): ValidationRule => ({
    field,
    type: 'string',
    required: true,
    minLength: 1,
    maxLength: 255,
  }),
  status: (field = 'status', allowed: string[] = ['idle', 'running', 'completed', 'failed', 'killed']): ValidationRule => ({
    field,
    type: 'string',
    required: true,
    enum: allowed,
  }),
  budget: (field = 'budget_limit'): ValidationRule => ({
    field,
    type: 'number',
    required: false,
    custom: (value) => {
      if (typeof value !== 'number') return true;
      return value >= 0 || 'Budget must be non-negative';
    },
  }),
};

/**
 * Predefined validators for common endpoints
 */
export const validators = {
  createSwarm: validateBody([
    commonRules.name('name'),
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
    commonRules.budget('budget_limit'),
  ]),
  updateAgent: validateBody([
    commonRules.status('status'),
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
