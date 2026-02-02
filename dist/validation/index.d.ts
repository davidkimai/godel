import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';
export declare class ValidationError extends Error {
    issues: Array<{
        path: string;
        message: string;
    }>;
    statusCode: number;
    constructor(message: string, issues: Array<{
        path: string;
        message: string;
    }>, statusCode?: number);
    toJSON(): {
        error: string;
        message: string;
        issues: {
            path: string;
            message: string;
        }[];
    };
}
export declare class NotFoundError extends Error {
    resource: string;
    id: string;
    constructor(resource: string, id: string);
}
export declare function validate<T>(schema: z.ZodSchema<T>, data: unknown): T;
export declare function validatePartial<T extends z.ZodObject<any>>(schema: T, data: unknown): Partial<z.infer<T>>;
export declare function validateSafe<T>(schema: z.ZodSchema<T>, data: unknown): {
    success: true;
    data: T;
} | {
    success: false;
    errors: Array<{
        path: string;
        message: string;
    }>;
};
export declare function formatZodError(error: z.ZodError): string;
export declare function formatValidationErrors(errors: Array<{
    path: string;
    message: string;
}>): string;
export declare function formatValidationErrorsObject(errors: Array<{
    path: string;
    message: string;
}>): Record<string, string>;
export declare function validateRequest<T>(schema: z.ZodSchema<T>): (req: Request, res: Response, next: NextFunction) => void;
export declare function validateParams<T extends z.ZodObject<any>>(schema: T): (req: Request, res: Response, next: NextFunction) => void;
export declare function validateQuery<T extends z.ZodObject<any>>(schema: T): (req: Request, res: Response, next: NextFunction) => void;
export declare const coerceNumber: z.ZodUnion<[z.ZodNumber, z.ZodEffects<z.ZodString, number, string>]>;
export declare const coerceInt: z.ZodUnion<[z.ZodNumber, z.ZodEffects<z.ZodString, number, string>]>;
export declare const coerceBoolean: z.ZodUnion<[z.ZodBoolean, z.ZodEffects<z.ZodEnum<["true", "false"]>, boolean, "true" | "false">, z.ZodEffects<z.ZodLiteral<1>, boolean, 1>, z.ZodEffects<z.ZodLiteral<0>, boolean, 0>]>;
export declare const coerceDate: z.ZodUnion<[z.ZodDate, z.ZodEffects<z.ZodString, Date, string>, z.ZodEffects<z.ZodNumber, Date, number>]>;
export declare function coerceArray<T>(schema: z.ZodSchema<T>): z.ZodUnion<[z.ZodArray<z.ZodType<T, z.ZodTypeDef, T>, "many">, z.ZodEffects<z.ZodType<T, z.ZodTypeDef, T>, T[], T>]>;
export declare const validateSpawnAgent: (data: unknown) => {
    task?: string;
    model?: "kimi-k2.5" | "claude-sonnet-4-5" | "gpt-4" | "gpt-4o";
    swarmId?: string;
    parentId?: string;
    metadata?: Record<string, unknown>;
    priority?: "low" | "medium" | "high" | "critical";
};
export declare const validateUpdateAgent: (data: unknown) => {
    error?: string;
    status?: "running" | "paused" | "completed" | "failed" | "idle" | "spawning" | "killing";
    metadata?: Record<string, unknown>;
    progress?: number;
    result?: string;
};
export declare const validateAgentAction: (data: unknown) => {
    reason?: string;
    action?: "pause" | "resume" | "kill" | "retry" | "scale";
    force?: boolean;
    delay?: number;
};
export declare const validateCreateSwarm: (data: unknown) => {
    description?: string;
    strategy?: "parallel" | "map-reduce" | "pipeline" | "race";
    agents?: number;
    name?: string;
    config?: Record<string, unknown>;
    budget?: number;
};
export declare const validateUpdateSwarm: (data: unknown) => {
    description?: string;
    status?: "running" | "paused" | "completed" | "failed";
    name?: string;
    config?: Record<string, unknown>;
};
export declare const validateSwarmAction: (data: unknown) => {
    action?: "pause" | "resume" | "scale" | "cancel" | "rebalance";
    targetAgents?: number;
    graceful?: boolean;
};
export declare const validateSetBudget: (data: unknown) => {
    maxTokens?: number;
    maxCost?: number;
    scopeType?: "agent" | "swarm" | "project" | "global";
    scopeId?: string;
    maxRequests?: number;
    alertThreshold?: number;
};
export declare const validateId: (data: unknown) => string;
export declare function validateCliArgs<T>(schema: z.ZodSchema<T>, data: unknown, options?: {
    exitOnError?: boolean;
    verbose?: boolean;
}): T | null;
export declare function validateCliArgsResult<T>(schema: z.ZodSchema<T>, data: unknown): {
    success: true;
    data: T;
} | {
    success: false;
    errors: string;
};
export * from './schemas';
//# sourceMappingURL=index.d.ts.map