import { z } from 'zod';
export interface SanitizationConfig {
    maxLength?: number;
    allowHtml?: boolean;
    allowNewlines?: boolean;
    trim?: boolean;
    toLowerCase?: boolean;
}
export declare enum ThreatType {
    XSS = "xss",
    SQL_INJECTION = "sql_injection",
    PATH_TRAVERSAL = "path_traversal",
    COMMAND_INJECTION = "command_injection",
    NULL_BYTE = "null_byte",
    CONTROL_CHAR = "control_char"
}
export interface ValidationResult {
    isValid: boolean;
    threats: ThreatType[];
    sanitized: string;
}
export declare function sanitizeString(input: string, config?: SanitizationConfig): string;
export declare function sanitizeStringDetailed(input: string, config?: SanitizationConfig): ValidationResult;
export declare function containsXssPatterns(input: string): boolean;
export declare function containsSqlInjection(input: string): boolean;
export declare function containsPathTraversal(input: string): boolean;
export declare function validateStringSafety(input: string): ValidationResult;
export declare function escapeHtml(input: string): string;
export declare function unescapeHtml(input: string): string;
export declare function sanitizeHtmlContent(input: string): string;
export declare function sanitizeEmail(input: string): string;
export declare function sanitizeUrl(input: string, allowedProtocols?: string[]): string;
export declare function sanitizeFilename(input: string): string;
export declare function sanitizeSearchQuery(input: string): string;
export interface SanitizeObjectOptions {
    maxDepth?: number;
    maxKeys?: number;
    stringOptions?: SanitizationConfig;
}
export declare function sanitizeObject<T extends Record<string, unknown>>(obj: T, options?: SanitizeObjectOptions): T;
export declare class SanitizationError extends Error {
    threats: ThreatType[];
    constructor(message: string, threats: ThreatType[]);
}
export declare function strictSanitize(input: string): string;
export declare function createSanitizedString(schema: z.ZodString, config?: SanitizationConfig): z.ZodEffects<z.ZodString, string, string>;
export declare const sanitizedStringSchema: z.ZodEffects<z.ZodString, string, string>;
export { z };
//# sourceMappingURL=sanitize.d.ts.map