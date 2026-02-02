import { z } from 'zod';

// =============================================================================
// TYPES & CONFIGURATION
// =============================================================================

export interface SanitizationConfig {
  maxLength?: number;
  allowHtml?: boolean;
  allowNewlines?: boolean;
  trim?: boolean;
  toLowerCase?: boolean;
}

export enum ThreatType {
  XSS = 'xss',
  SQL_INJECTION = 'sql_injection',
  PATH_TRAVERSAL = 'path_traversal',
  COMMAND_INJECTION = 'command_injection',
  NULL_BYTE = 'null_byte',
  CONTROL_CHAR = 'control_char',
}

export interface ValidationResult {
  isValid: boolean;
  threats: ThreatType[];
  sanitized: string;
}

// =============================================================================
// STRING SANITIZATION
// =============================================================================

export function sanitizeString(
  input: string,
  config: SanitizationConfig = {}
): string {
  const {
    maxLength = 10000,
    allowHtml = false,
    allowNewlines = false,
    trim = true,
    toLowerCase = false,
  } = config;

  if (typeof input !== 'string') {
    return '';
  }

  let sanitized = input;

  // Trim whitespace
  if (trim) {
    sanitized = sanitized.trim();
  }

  // Remove null bytes
  sanitized = sanitized.replace(/\x00/g, '');

  // Remove control characters except newlines
  if (allowNewlines) {
    sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  } else {
    sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');
  }

  // Remove HTML if not allowed
  if (!allowHtml) {
    sanitized = sanitized.replace(/<[^>]*>/g, '');
  }

  // Normalize Unicode
  sanitized = sanitized.normalize('NFKC');

  // Truncate if too long
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }

  // Convert to lowercase if requested
  if (toLowerCase) {
    sanitized = sanitized.toLowerCase();
  }

  return sanitized;
}

export function sanitizeStringDetailed(
  input: string,
  config: SanitizationConfig = {}
): ValidationResult {
  const threats: ThreatType[] = [];
  
  // Check for XSS patterns
  if (containsXssPatterns(input)) {
    threats.push(ThreatType.XSS);
  }
  
  // Check for SQL injection
  if (containsSqlInjection(input)) {
    threats.push(ThreatType.SQL_INJECTION);
  }
  
  // Check for path traversal
  if (containsPathTraversal(input)) {
    threats.push(ThreatType.PATH_TRAVERSAL);
  }
  
  // Check for null bytes
  if (input.includes('\x00')) {
    threats.push(ThreatType.NULL_BYTE);
  }
  
  // Check for control characters
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(input)) {
    threats.push(ThreatType.CONTROL_CHAR);
  }

  return {
    isValid: threats.length === 0,
    threats,
    sanitized: sanitizeString(input, config),
  };
}

// =============================================================================
// SECURITY CHECKS
// =============================================================================

export function containsXssPatterns(input: string): boolean {
  const lower = input.toLowerCase();
  // Check for common XSS patterns
  if (lower.includes('<script')) return true;
  if (lower.includes('javascript:')) return true;
  if (lower.includes('<iframe')) return true;
  if (lower.includes('<object')) return true;
  if (lower.includes('<embed')) return true;
  // Check for event handlers
  const eventHandlerPattern = /on\w+\s*=/i;
  if (eventHandlerPattern.test(input)) return true;
  return false;
}

export function containsSqlInjection(input: string): boolean {
  const lower = input.toLowerCase();
  // Check for common SQL injection patterns
  if (/['"]\s*or\s*['"0-9]/.test(lower)) return true;
  if (/['"]\s*and\s*['"0-9]/.test(lower)) return true;
  if (lower.includes('union') && lower.includes('select')) return true;
  if (lower.includes('exec(') || lower.includes('exec (')) return true;
  if (lower.includes('select') && lower.includes('from')) return true;
  if (lower.includes('insert') && lower.includes('into')) return true;
  if (lower.includes('delete') && lower.includes('from')) return true;
  if (lower.includes('drop') && lower.includes('table')) return true;
  if (lower.includes('--') || lower.includes('/*')) return true;
  return false;
}

export function containsPathTraversal(input: string): boolean {
  // Check for path traversal patterns
  if (input.includes('../') || input.includes('..\\')) return true;
  if (input.toLowerCase().includes('%2e%2e')) return true;
  if (input.includes('..%2f') || input.includes('..%5c')) return true;
  return false;
}

export function validateStringSafety(input: string): ValidationResult {
  return sanitizeStringDetailed(input);
}

// =============================================================================
// HTML HANDLING
// =============================================================================

export function escapeHtml(input: string): string {
  const htmlEscapes: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
  };
  
  return input.replace(/[&<>"'/]/g, (char) => htmlEscapes[char]);
}

export function unescapeHtml(input: string): string {
  const htmlUnescapes: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#x27;': "'",
    '&#x2F;': '/',
  };
  
  return input.replace(/(&amp;|&lt;|&gt;|&quot;|&#x27;|&#x2F;)/g, (entity) => htmlUnescapes[entity]);
}

export function sanitizeHtmlContent(input: string): string {
  // Remove script tags and event handlers
  let sanitized = input;
  
  // Remove script tags (simple pattern)
  sanitized = sanitized.replace(/<script[^>]*>.*?<\/script>/gi, '');
  
  // Remove event handlers
  sanitized = sanitized.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '');
  
  // Remove javascript: URLs
  sanitized = sanitized.replace(/javascript:/gi, '');
  
  return sanitized;
}

// =============================================================================
// SPECIALIZED SANITIZERS
// =============================================================================

export function sanitizeEmail(input: string): string {
  const sanitized = sanitizeString(input, { maxLength: 254, toLowerCase: true });
  
  // Basic email validation regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(sanitized)) {
    throw new Error('Invalid email format');
  }
  
  return sanitized;
}

export function sanitizeUrl(input: string, allowedProtocols: string[] = ['http:', 'https:']): string {
  const sanitized = sanitizeString(input, { maxLength: 2048 });
  
  try {
    const url = new URL(sanitized);
    
    if (!allowedProtocols.includes(url.protocol)) {
      throw new Error(`Protocol not allowed: ${url.protocol}`);
    }
    
    return url.toString();
  } catch {
    throw new Error('Invalid URL format');
  }
}

export function sanitizeFilename(input: string): string {
  // Remove path separators and control chars
  let sanitized = input.replace(/[\/\\]/g, '_');
  sanitized = sanitizeString(sanitized, { maxLength: 255 });
  
  // Remove dangerous characters
  sanitized = sanitized.replace(/[\x00-\x1f\x7f]/g, '');
  
  // Ensure not empty
  if (!sanitized || sanitized === '.' || sanitized === '..') {
    throw new Error('Invalid filename');
  }
  
  return sanitized;
}

export function sanitizeSearchQuery(input: string): string {
  const sanitized = sanitizeString(input, { maxLength: 200 });
  
  // Escape special search characters if needed
  // Remove wildcards that could cause performance issues
  return sanitized.replace(/[*?%]/g, '');
}

// =============================================================================
// OBJECT SANITIZATION
// =============================================================================

export interface SanitizeObjectOptions {
  maxDepth?: number;
  maxKeys?: number;
  stringOptions?: SanitizationConfig;
}

export function sanitizeObject<T extends Record<string, unknown>>(
  obj: T,
  options: SanitizeObjectOptions = {}
): T {
  const {
    maxDepth = 10,
    maxKeys = 100,
    stringOptions = {},
  } = options;

  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  function sanitizeValue(value: unknown, depth: number): unknown {
    if (depth > maxDepth) {
      return '[Max Depth Exceeded]';
    }

    if (typeof value === 'string') {
      return sanitizeString(value, stringOptions);
    }

    if (Array.isArray(value)) {
      return value.map(item => sanitizeValue(item, depth + 1));
    }

    if (typeof value === 'object' && value !== null) {
      const keys = Object.keys(value);
      if (keys.length > maxKeys) {
        return '[Max Keys Exceeded]';
      }

      const sanitized: Record<string, unknown> = {};
      for (const key of keys) {
        const sanitizedKey = sanitizeString(key, { maxLength: 100 });
        sanitized[sanitizedKey] = sanitizeValue((value as Record<string, unknown>)[key], depth + 1);
      }
      return sanitized;
    }

    return value;
  }

  return sanitizeValue(obj, 0) as T;
}

// =============================================================================
// STRICT SANITIZATION
// =============================================================================

export class SanitizationError extends Error {
  constructor(
    message: string,
    public threats: ThreatType[]
  ) {
    super(message);
    this.name = 'SanitizationError';
  }
}

export function strictSanitize(input: string): string {
  const result = sanitizeStringDetailed(input);
  
  if (!result.isValid) {
    throw new SanitizationError(
      `Input contains threats: ${result.threats.join(', ')}`,
      result.threats
    );
  }
  
  return result.sanitized;
}

// =============================================================================
// ZOD SCHEMA HELPERS
// =============================================================================

export function createSanitizedString(schema: z.ZodString, config?: SanitizationConfig) {
  return schema.transform((val) => sanitizeString(val, config));
}

export const sanitizedStringSchema = z.string().transform((val) =>
  sanitizeString(val)
);

// =============================================================================
// RE-EXPORTS
// =============================================================================

export { z };
