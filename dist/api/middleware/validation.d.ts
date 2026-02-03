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
export declare function validateBody(rules: ValidationRule[]): (req: Request, res: Response, next: NextFunction) => void;
/**
 * Common validation rules
 */
export declare const commonRules: {
    id: (field?: string) => ValidationRule;
    name: (field?: string) => ValidationRule;
    status: (field?: string, allowed?: string[]) => ValidationRule;
    budget: (field?: string) => ValidationRule;
};
/**
 * Predefined validators for common endpoints
 */
export declare const validators: {
    createSwarm: (req: Request, res: Response, next: NextFunction) => void;
    createAgent: (req: Request, res: Response, next: NextFunction) => void;
    updateAgent: (req: Request, res: Response, next: NextFunction) => void;
    createEvent: (req: Request, res: Response, next: NextFunction) => void;
};
//# sourceMappingURL=validation.d.ts.map