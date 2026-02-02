"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.z = exports.sanitizedStringSchema = exports.SanitizationError = exports.ThreatType = void 0;
exports.sanitizeString = sanitizeString;
exports.sanitizeStringDetailed = sanitizeStringDetailed;
exports.containsXssPatterns = containsXssPatterns;
exports.containsSqlInjection = containsSqlInjection;
exports.containsPathTraversal = containsPathTraversal;
exports.validateStringSafety = validateStringSafety;
exports.escapeHtml = escapeHtml;
exports.unescapeHtml = unescapeHtml;
exports.sanitizeHtmlContent = sanitizeHtmlContent;
exports.sanitizeEmail = sanitizeEmail;
exports.sanitizeUrl = sanitizeUrl;
exports.sanitizeFilename = sanitizeFilename;
exports.sanitizeSearchQuery = sanitizeSearchQuery;
exports.sanitizeObject = sanitizeObject;
exports.strictSanitize = strictSanitize;
exports.createSanitizedString = createSanitizedString;
const zod_1 = require("zod");
Object.defineProperty(exports, "z", { enumerable: true, get: function () { return zod_1.z; } });
var ThreatType;
(function (ThreatType) {
    ThreatType["XSS"] = "xss";
    ThreatType["SQL_INJECTION"] = "sql_injection";
    ThreatType["PATH_TRAVERSAL"] = "path_traversal";
    ThreatType["COMMAND_INJECTION"] = "command_injection";
    ThreatType["NULL_BYTE"] = "null_byte";
    ThreatType["CONTROL_CHAR"] = "control_char";
})(ThreatType || (exports.ThreatType = ThreatType = {}));
// =============================================================================
// STRING SANITIZATION
// =============================================================================
function sanitizeString(input, config = {}) {
    const { maxLength = 10000, allowHtml = false, allowNewlines = false, trim = true, toLowerCase = false, } = config;
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
    }
    else {
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
function sanitizeStringDetailed(input, config = {}) {
    const threats = [];
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
function containsXssPatterns(input) {
    const lower = input.toLowerCase();
    // Check for common XSS patterns
    if (lower.includes('<script'))
        return true;
    if (lower.includes('javascript:'))
        return true;
    if (lower.includes('<iframe'))
        return true;
    if (lower.includes('<object'))
        return true;
    if (lower.includes('<embed'))
        return true;
    // Check for event handlers
    const eventHandlerPattern = /on\w+\s*=/i;
    if (eventHandlerPattern.test(input))
        return true;
    return false;
}
function containsSqlInjection(input) {
    const lower = input.toLowerCase();
    // Check for common SQL injection patterns
    if (/['"]\s*or\s*['"0-9]/.test(lower))
        return true;
    if (/['"]\s*and\s*['"0-9]/.test(lower))
        return true;
    if (lower.includes('union') && lower.includes('select'))
        return true;
    if (lower.includes('exec(') || lower.includes('exec ('))
        return true;
    if (lower.includes('select') && lower.includes('from'))
        return true;
    if (lower.includes('insert') && lower.includes('into'))
        return true;
    if (lower.includes('delete') && lower.includes('from'))
        return true;
    if (lower.includes('drop') && lower.includes('table'))
        return true;
    if (lower.includes('--') || lower.includes('/*'))
        return true;
    return false;
}
function containsPathTraversal(input) {
    // Check for path traversal patterns
    if (input.includes('../') || input.includes('..\\'))
        return true;
    if (input.toLowerCase().includes('%2e%2e'))
        return true;
    if (input.includes('..%2f') || input.includes('..%5c'))
        return true;
    return false;
}
function validateStringSafety(input) {
    return sanitizeStringDetailed(input);
}
// =============================================================================
// HTML HANDLING
// =============================================================================
function escapeHtml(input) {
    const htmlEscapes = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#x27;',
        '/': '&#x2F;',
    };
    return input.replace(/[&<>"'/]/g, (char) => htmlEscapes[char]);
}
function unescapeHtml(input) {
    const htmlUnescapes = {
        '&amp;': '&',
        '&lt;': '<',
        '&gt;': '>',
        '&quot;': '"',
        '&#x27;': "'",
        '&#x2F;': '/',
    };
    return input.replace(/(&amp;|&lt;|&gt;|&quot;|&#x27;|&#x2F;)/g, (entity) => htmlUnescapes[entity]);
}
function sanitizeHtmlContent(input) {
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
function sanitizeEmail(input) {
    const sanitized = sanitizeString(input, { maxLength: 254, toLowerCase: true });
    // Basic email validation regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(sanitized)) {
        throw new Error('Invalid email format');
    }
    return sanitized;
}
function sanitizeUrl(input, allowedProtocols = ['http:', 'https:']) {
    const sanitized = sanitizeString(input, { maxLength: 2048 });
    try {
        const url = new URL(sanitized);
        if (!allowedProtocols.includes(url.protocol)) {
            throw new Error(`Protocol not allowed: ${url.protocol}`);
        }
        return url.toString();
    }
    catch {
        throw new Error('Invalid URL format');
    }
}
function sanitizeFilename(input) {
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
function sanitizeSearchQuery(input) {
    const sanitized = sanitizeString(input, { maxLength: 200 });
    // Escape special search characters if needed
    // Remove wildcards that could cause performance issues
    return sanitized.replace(/[*?%]/g, '');
}
function sanitizeObject(obj, options = {}) {
    const { maxDepth = 10, maxKeys = 100, stringOptions = {}, } = options;
    if (!obj || typeof obj !== 'object') {
        return obj;
    }
    function sanitizeValue(value, depth) {
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
            const sanitized = {};
            for (const key of keys) {
                const sanitizedKey = sanitizeString(key, { maxLength: 100 });
                sanitized[sanitizedKey] = sanitizeValue(value[key], depth + 1);
            }
            return sanitized;
        }
        return value;
    }
    return sanitizeValue(obj, 0);
}
// =============================================================================
// STRICT SANITIZATION
// =============================================================================
class SanitizationError extends Error {
    constructor(message, threats) {
        super(message);
        this.threats = threats;
        this.name = 'SanitizationError';
    }
}
exports.SanitizationError = SanitizationError;
function strictSanitize(input) {
    const result = sanitizeStringDetailed(input);
    if (!result.isValid) {
        throw new SanitizationError(`Input contains threats: ${result.threats.join(', ')}`, result.threats);
    }
    return result.sanitized;
}
// =============================================================================
// ZOD SCHEMA HELPERS
// =============================================================================
function createSanitizedString(schema, config) {
    return schema.transform((val) => sanitizeString(val, config));
}
exports.sanitizedStringSchema = zod_1.z.string().transform((val) => sanitizeString(val));
//# sourceMappingURL=sanitize.js.map