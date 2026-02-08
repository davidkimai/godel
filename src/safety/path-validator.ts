/**
 * Path Validator Module - Security-Critical Path Validation
 * 
 * PRD Section 2.4: Path Security
 * 
 * Security features:
 * - Path traversal attack prevention
 * - Path normalization and canonicalization
 * - Invalid path detection (null bytes, control chars)
 * - Allowed directory boundary enforcement
 * - Symlink attack prevention
 * - Windows/Unix path compatibility
 * - Unicode normalization attack prevention
 * - Maximum path length enforcement
 */

import * as path from 'path';
import * as fs from 'fs';

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Result of a path validation operation
 */
export interface PathValidationResult {
  /** Whether the path is valid and safe */
  valid: boolean;
  /** The normalized/canonical path if valid */
  normalizedPath?: string;
  /** Error code for invalid paths */
  errorCode?: PathValidationError;
  /** Human-readable error message */
  errorMessage?: string;
  /** Security severity level if invalid */
  severity: 'none' | 'warning' | 'critical';
  /** Detected attack patterns */
  detectedPatterns?: PathAttackPattern[];
}

/**
 * Error codes for path validation failures
 */
export enum PathValidationError {
  PATH_TRAVERSAL = 'PATH_TRAVERSAL',
  NULL_BYTE_INJECTION = 'NULL_BYTE_INJECTION',
  CONTROL_CHARACTER = 'CONTROL_CHARACTER',
  PATH_TOO_LONG = 'PATH_TOO_LONG',
  OUTSIDE_ALLOWED_ROOT = 'OUTSIDE_ALLOWED_ROOT',
  INVALID_ENCODING = 'INVALID_ENCODING',
  SYMLINK_ESCAPE = 'SYMLINK_ESCAPE',
  EMPTY_PATH = 'EMPTY_PATH',
  RELATIVE_PATH_REQUIRED = 'RELATIVE_PATH_REQUIRED',
  ABSOLUTE_PATH_REQUIRED = 'ABSOLUTE_PATH_REQUIRED',
  INVALID_CHARACTERS = 'INVALID_CHARACTERS',
  UNICODE_ATTACK = 'UNICODE_ATTACK',
  DOT_DIRECTORY_ATTACK = 'DOT_DIRECTORY_ATTACK',
  DOUBLE_DOT_ATTACK = 'DOUBLE_DOT_ATTACK',
}

/**
 * Attack patterns detected in path validation
 */
export enum PathAttackPattern {
  DOT_DOT_SLASH = 'DOT_DOT_SLASH',
  URL_ENCODED_TRAVERSAL = 'URL_ENCODED_TRAVERSAL',
  NULL_BYTE = 'NULL_BYTE',
  UNICODE_NORMALIZATION = 'UNICODE_NORMALIZATION',
  DOUBLE_ENCODING = 'DOUBLE_ENCODING',
  PATH_OVERLONG = 'PATH_OVERLONG',
  ALTERNATE_DATA_STREAM = 'ALTERNATE_DATA_STREAM',
  DOS_DEVICE_PATH = 'DOS_DEVICE_PATH',
  DOT_DIRECTORY_ATTACK = 'DOT_DIRECTORY_ATTACK',
}

/**
 * Configuration options for path validator
 */
export interface PathValidatorConfig {
  /** Allowed root directories for path resolution */
  allowedRoots: string[];
  /** Maximum allowed path length (default: 4096) */
  maxPathLength: number;
  /** Maximum allowed path depth (default: 50) */
  maxPathDepth: number;
  /** Whether to allow absolute paths (default: false) */
  allowAbsolute: boolean;
  /** Whether to follow symlinks (default: false) */
  followSymlinks: boolean;
  /** Whether to allow parent directory references (default: false) */
  allowParentTraversal: boolean;
  /** Characters to reject in paths */
  forbiddenCharacters: string[];
  /** File extensions to block */
  forbiddenExtensions: string[];
  /** Enable strict mode with additional checks */
  strictMode: boolean;
  /** Platform-specific settings */
  platform: 'auto' | 'win32' | 'posix';
  /** Enable Unicode normalization attack detection */
  checkUnicodeAttacks: boolean;
  /** Allow UNC paths (Windows) */
  allowUncPaths: boolean;
}

/**
 * Statistics for path validator
 */
export interface PathValidatorStats {
  totalValidations: number;
  validPaths: number;
  invalidPaths: number;
  criticalViolations: number;
  warningViolations: number;
  attacksDetected: Map<PathAttackPattern, number>;
  averageValidationTime: number;
}

// ============================================================================
// Constants
// ============================================================================

/** Default maximum path length */
const DEFAULT_MAX_PATH_LENGTH = 4096;

/** Default maximum path depth */
const DEFAULT_MAX_PATH_DEPTH = 50;

/** Default forbidden characters */
const DEFAULT_FORBIDDEN_CHARS = ['\x00', '\x01', '\x02', '\x03', '\x04', '\x05'];

/** Default forbidden file extensions */
const DEFAULT_FORBIDDEN_EXTENSIONS = ['.exe', '.bat', '.cmd', '.sh', '.ps1'];

/** Path traversal patterns to detect */
const TRAVERSAL_PATTERNS = [
  /\.\.\/+/g,      // Unix-style: ../
  /\.\.\\+/g,      // Windows-style: ..\\n  /%2e%2e%2f/gi,  // URL encoded: %2e%2e%2f
  /%2e%2e\//gi,    // URL encoded: %2e%2e/
  /\.\.\/+/g,      // Double dot slash
  /\.\.\\+/g,      // Double dot backslash
];

/** Control character pattern */
const CONTROL_CHAR_PATTERN = /[\x00-\x1f\x7f-\x9f]/;

/** Unicode normalization attack patterns */
const UNICODE_ATTACK_PATTERNS = [
  /\u202e/g,  // Right-to-left override
  /\u202d/g,  // Left-to-right override
  /\u200e/g,  // Left-to-right mark
  /\u200f/g,  // Right-to-left mark
  /\ufeff/g,  // Zero-width no-break space (BOM)
];

/** Windows reserved names */
const WINDOWS_RESERVED_NAMES = [
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'
];

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: PathValidatorConfig = {
  allowedRoots: [],
  maxPathLength: DEFAULT_MAX_PATH_LENGTH,
  maxPathDepth: DEFAULT_MAX_PATH_DEPTH,
  allowAbsolute: false,
  followSymlinks: false,
  allowParentTraversal: false,
  forbiddenCharacters: DEFAULT_FORBIDDEN_CHARS,
  forbiddenExtensions: DEFAULT_FORBIDDEN_EXTENSIONS,
  strictMode: true,
  platform: 'auto',
  checkUnicodeAttacks: true,
  allowUncPaths: false,
};

// ============================================================================
// PathValidator Class
// ============================================================================

export class PathValidator {
  private config: PathValidatorConfig;
  private stats: PathValidatorStats;
  private validationHistory: PathValidationResult[];
  private readonly maxHistorySize = 1000;

  constructor(config: Partial<PathValidatorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.stats = {
      totalValidations: 0,
      validPaths: 0,
      invalidPaths: 0,
      criticalViolations: 0,
      warningViolations: 0,
      attacksDetected: new Map(),
      averageValidationTime: 0,
    };
    this.validationHistory = [];
  }

  // ========================================================================
  // Public API Methods
  // ========================================================================

  /**
   * Validate a path for security issues
   */
  validate(inputPath: string, context?: string): PathValidationResult {
    const startTime = process.hrtime.bigint();
    
    this.stats.totalValidations++;

    // Basic null/undefined check
    if (inputPath === null || inputPath === undefined) {
      const result = this.createResult(false, PathValidationError.EMPTY_PATH, 
        'Path cannot be null or undefined', 'critical');
      this.recordValidation(result, startTime);
      return result;
    }

    // Empty string check
    if (inputPath === '') {
      const result = this.createResult(false, PathValidationError.EMPTY_PATH, 
        'Path cannot be empty', 'warning');
      this.recordValidation(result, startTime);
      return result;
    }

    // Whitespace-only check
    if (inputPath.trim() === '') {
      const result = this.createResult(false, PathValidationError.INVALID_CHARACTERS, 
        'Path cannot be whitespace-only', 'warning');
      this.recordValidation(result, startTime);
      return result;
    }

    const detectedPatterns: PathAttackPattern[] = [];

    // Check path length
    if (inputPath.length > this.config.maxPathLength) {
      const result = this.createResult(false, PathValidationError.PATH_TOO_LONG,
        `Path exceeds maximum length of ${this.config.maxPathLength} characters`, 'critical', [PathAttackPattern.PATH_OVERLONG]);
      this.recordValidation(result, startTime);
      return result;
    }

    // Check for null byte injection
    if (inputPath.includes('\x00')) {
      detectedPatterns.push(PathAttackPattern.NULL_BYTE);
      const result = this.createResult(false, PathValidationError.NULL_BYTE_INJECTION,
        'Null byte detected in path - possible injection attack', 'critical', detectedPatterns);
      this.recordValidation(result, startTime);
      return result;
    }

    // Check for control characters
    if (CONTROL_CHAR_PATTERN.test(inputPath)) {
      const result = this.createResult(false, PathValidationError.CONTROL_CHARACTER,
        'Control characters detected in path', 'critical');
      this.recordValidation(result, startTime);
      return result;
    }

    // Check for Unicode normalization attacks
    if (this.config.checkUnicodeAttacks) {
      const unicodeAttack = this.detectUnicodeAttack(inputPath);
      if (unicodeAttack) {
        detectedPatterns.push(PathAttackPattern.UNICODE_NORMALIZATION);
        const result = this.createResult(false, PathValidationError.UNICODE_ATTACK,
          'Unicode normalization attack detected', 'critical', detectedPatterns);
        this.recordValidation(result, startTime);
        return result;
      }
    }

    // Check for forbidden characters
    for (const char of this.config.forbiddenCharacters) {
      if (inputPath.includes(char)) {
        const result = this.createResult(false, PathValidationError.INVALID_CHARACTERS,
          `Forbidden character detected in path: ${this.escapeChar(char)}`, 'critical');
        this.recordValidation(result, startTime);
        return result;
      }
    }

    // Check absolute path requirements
    const isAbsolute = path.isAbsolute(inputPath);
    if (isAbsolute && !this.config.allowAbsolute) {
      const result = this.createResult(false, PathValidationError.RELATIVE_PATH_REQUIRED,
        'Absolute paths are not allowed', 'warning');
      this.recordValidation(result, startTime);
      return result;
    }

    if (!isAbsolute && this.config.allowAbsolute && !this.config.allowParentTraversal) {
      // Allow relative paths when absolute is required but traversal is not
    }

    // Detect path traversal patterns
    if (!this.config.allowParentTraversal) {
      const traversalCheck = this.detectPathTraversal(inputPath);
      if (traversalCheck.detected) {
        detectedPatterns.push(...traversalCheck.patterns);
        const result = this.createResult(false, PathValidationError.PATH_TRAVERSAL,
          `Path traversal attempt detected: ${traversalCheck.reason}`, 'critical', detectedPatterns);
        this.recordValidation(result, startTime);
        return result;
      }
    }

    // Check for double encoding attacks
    if (this.detectDoubleEncoding(inputPath)) {
      detectedPatterns.push(PathAttackPattern.DOUBLE_ENCODING);
      const result = this.createResult(false, PathValidationError.INVALID_ENCODING,
        'Double encoding detected in path', 'critical', detectedPatterns);
      this.recordValidation(result, startTime);
      return result;
    }

    // Normalize the path
    let normalizedPath: string;
    try {
      normalizedPath = this.normalizePath(inputPath);
    } catch (error) {
      const result = this.createResult(false, PathValidationError.INVALID_ENCODING,
        `Path normalization failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'critical');
      this.recordValidation(result, startTime);
      return result;
    }

    // Check path depth
    const pathDepth = this.calculatePathDepth(normalizedPath);
    if (pathDepth > this.config.maxPathDepth) {
      const result = this.createResult(false, PathValidationError.PATH_TOO_LONG,
        `Path depth (${pathDepth}) exceeds maximum (${this.config.maxPathDepth})`, 'warning');
      this.recordValidation(result, startTime);
      return result;
    }

    // Check for dot directory attacks (hidden directories)
    if (this.config.strictMode && this.detectDotDirectoryAttack(normalizedPath)) {
      detectedPatterns.push(PathAttackPattern.DOT_DIRECTORY_ATTACK);
      const result = this.createResult(false, PathValidationError.DOT_DIRECTORY_ATTACK,
        'Suspicious dot directory pattern detected', 'warning', detectedPatterns);
      this.recordValidation(result, startTime);
      return result;
    }

    // Check forbidden extensions
    const extension = path.extname(normalizedPath).toLowerCase();
    if (this.config.forbiddenExtensions.includes(extension)) {
      const result = this.createResult(false, PathValidationError.INVALID_CHARACTERS,
        `Forbidden file extension: ${extension}`, 'warning');
      this.recordValidation(result, startTime);
      return result;
    }

    // Check allowed roots (if configured)
    if (this.config.allowedRoots.length > 0) {
      if (!this.isPathInAllowedRoots(normalizedPath)) {
        const result = this.createResult(false, PathValidationError.OUTSIDE_ALLOWED_ROOT,
          'Path is outside allowed root directories', 'critical');
        this.recordValidation(result, startTime);
        return result;
      }
    }

    // Check Windows-specific attacks
    if (this.isWindows()) {
      const windowsCheck = this.checkWindowsSpecificAttacks(inputPath);
      if (!windowsCheck.valid) {
        const result = this.createResult(false, windowsCheck.errorCode!,
          windowsCheck.errorMessage!, 'critical', windowsCheck.detectedPatterns);
        this.recordValidation(result, startTime);
        return result;
      }
    }

    // All checks passed
    const result: PathValidationResult = {
      valid: true,
      normalizedPath,
      severity: 'none',
      detectedPatterns: detectedPatterns.length > 0 ? detectedPatterns : undefined,
    };

    this.recordValidation(result, startTime);
    return result;
  }

  /**
   * Validate and resolve a path against a base directory
   */
  validateAndResolve(inputPath: string, baseDir: string): PathValidationResult {
    // Validate the input path first
    const validation = this.validate(inputPath);
    if (!validation.valid) {
      return validation;
    }

    // Ensure base directory exists
    if (!fs.existsSync(baseDir)) {
      return this.createResult(false, PathValidationError.OUTSIDE_ALLOWED_ROOT,
        `Base directory does not exist: ${baseDir}`, 'critical');
    }

    // Resolve the full path
    const resolvedPath = path.resolve(baseDir, validation.normalizedPath!);
    const resolvedBase = path.resolve(baseDir);

    // Ensure resolved path is within base directory
    if (!resolvedPath.startsWith(resolvedBase + path.sep) && resolvedPath !== resolvedBase) {
      return this.createResult(false, PathValidationError.PATH_TRAVERSAL,
        'Resolved path escapes base directory', 'critical');
    }

    // Check for symlink attacks if not following symlinks
    if (!this.config.followSymlinks) {
      const symlinkCheck = this.checkSymlinkAttack(resolvedPath, resolvedBase);
      if (!symlinkCheck.valid) {
        return symlinkCheck;
      }
    }

    return {
      valid: true,
      normalizedPath: resolvedPath,
      severity: 'none',
    };
  }

  /**
   * Quick validation - returns boolean without detailed results
   */
  isValid(inputPath: string): boolean {
    return this.validate(inputPath).valid;
  }

  /**
   * Check if path is safe (no critical violations)
   */
  isSafe(inputPath: string): boolean {
    const result = this.validate(inputPath);
    return result.valid || result.severity !== 'critical';
  }

  /**
   * Sanitize a path by removing dangerous components
   */
  sanitize(inputPath: string): string {
    if (!inputPath) return '';

    let sanitized = inputPath;

    // Remove null bytes
    sanitized = sanitized.replace(/\x00/g, '');

    // Remove control characters
    sanitized = sanitized.replace(CONTROL_CHAR_PATTERN, '');

    // Normalize slashes
    sanitized = sanitized.replace(/\\/g, '/');

    // Remove traversal attempts
    sanitized = sanitized.replace(/\.\.\/+/g, '');
    sanitized = sanitized.replace(/\.\.\\+/g, '');

    // Remove leading/trailing dots and slashes
    sanitized = sanitized.replace(/^[.\/\\]+/, '');
    sanitized = sanitized.replace(/[.\/\\]+$/, '');

    // Collapse multiple slashes
    sanitized = sanitized.replace(/\/+/g, '/');

    // Remove URL encoding of dots
    sanitized = sanitized.replace(/%2e/gi, '.');
    sanitized = sanitized.replace(/%2f/gi, '/');
    sanitized = sanitized.replace(/%5c/gi, '\\');

    // Trim whitespace
    sanitized = sanitized.trim();

    return sanitized;
  }

  /**
   * Get current statistics
   */
  getStats(): PathValidatorStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalValidations: 0,
      validPaths: 0,
      invalidPaths: 0,
      criticalViolations: 0,
      warningViolations: 0,
      attacksDetected: new Map(),
      averageValidationTime: 0,
    };
  }

  /**
   * Get validation history
   */
  getValidationHistory(limit?: number): PathValidationResult[] {
    const history = [...this.validationHistory];
    if (limit) {
      return history.slice(-limit);
    }
    return history;
  }

  /**
   * Clear validation history
   */
  clearHistory(): void {
    this.validationHistory = [];
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<PathValidatorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): PathValidatorConfig {
    return { ...this.config };
  }

  // ========================================================================
  // Private Helper Methods
  // ========================================================================

  private createResult(
    valid: boolean,
    errorCode?: PathValidationError,
    errorMessage?: string,
    severity: 'none' | 'warning' | 'critical' = 'none',
    detectedPatterns?: PathAttackPattern[],
    normalizedPath?: string
  ): PathValidationResult {
    const result: PathValidationResult = {
      valid,
      severity,
    };

    if (!valid) {
      result.errorCode = errorCode;
      result.errorMessage = errorMessage;
    }

    if (normalizedPath) {
      result.normalizedPath = normalizedPath;
    }

    if (detectedPatterns && detectedPatterns.length > 0) {
      result.detectedPatterns = detectedPatterns;
    }

    return result;
  }

  private recordValidation(result: PathValidationResult, startTime: bigint): void {
    const endTime = process.hrtime.bigint();
    const validationTime = Number(endTime - startTime) / 1000000; // Convert to milliseconds

    // Update stats
    if (result.valid) {
      this.stats.validPaths++;
    } else {
      this.stats.invalidPaths++;
      if (result.severity === 'critical') {
        this.stats.criticalViolations++;
      } else if (result.severity === 'warning') {
        this.stats.warningViolations++;
      }
    }

    // Update attack patterns
    if (result.detectedPatterns) {
      for (const pattern of result.detectedPatterns) {
        const current = this.stats.attacksDetected.get(pattern) || 0;
        this.stats.attacksDetected.set(pattern, current + 1);
      }
    }

    // Update average validation time
    const totalTime = this.stats.averageValidationTime * (this.stats.totalValidations - 1) + validationTime;
    this.stats.averageValidationTime = totalTime / this.stats.totalValidations;

    // Add to history
    this.validationHistory.push(result);
    if (this.validationHistory.length > this.maxHistorySize) {
      this.validationHistory.shift();
    }
  }

  private detectPathTraversal(inputPath: string): { detected: boolean; reason: string; patterns: PathAttackPattern[] } {
    const patterns: PathAttackPattern[] = [];
    const decodedPath = this.urlDecode(inputPath);

    // Check for basic traversal patterns
    if (decodedPath.includes('../') || decodedPath.includes('..\\')) {
      patterns.push(PathAttackPattern.DOT_DOT_SLASH);
    }

    // Check for URL encoded traversal
    if (/%2e%2e%2f/gi.test(inputPath) || /%2e%2e\//gi.test(inputPath)) {
      patterns.push(PathAttackPattern.URL_ENCODED_TRAVERSAL);
    }

    // Check normalized path for remaining traversal attempts
    const normalized = path.normalize(decodedPath);
    if (normalized.split(path.sep).includes('..')) {
      patterns.push(PathAttackPattern.DOT_DOT_SLASH);
    }

    // Check for double-dot without slashes (obfuscation)
    if (/\.\.(?!\w)/.test(decodedPath) && !/\.\.\/|\.\.\\/.test(decodedPath)) {
      // Double dot followed by non-word character (not part of filename)
      patterns.push(PathAttackPattern.DOT_DOT_SLASH);
    }

    if (patterns.length > 0) {
      return {
        detected: true,
        reason: `Detected patterns: ${patterns.join(', ')}`,
        patterns,
      };
    }

    return { detected: false, reason: '', patterns: [] };
  }

  private detectUnicodeAttack(inputPath: string): boolean {
    for (const pattern of UNICODE_ATTACK_PATTERNS) {
      if (pattern.test(inputPath)) {
        return true;
      }
    }

    // Check for mixed script attacks
    // This is a simplified check - in production, use a proper library
    const suspiciousCombos = [
      /[а-яА-Я]/, // Cyrillic
      /[οΟο]/,   // Greek omicron that looks like Latin 'o'
    ];

    if (this.config.strictMode) {
      for (const combo of suspiciousCombos) {
        if (combo.test(inputPath) && /[a-zA-Z]/.test(inputPath)) {
          // Mixed scripts detected
          return true;
        }
      }
    }

    return false;
  }

  private detectDoubleEncoding(inputPath: string): boolean {
    // Check for patterns like %252f (encoded %2f)
    const doubleEncodedPattern = /%25[0-9a-fA-F]{2}/;
    return doubleEncodedPattern.test(inputPath);
  }

  private detectDotDirectoryAttack(inputPath: string): boolean {
    // Check for suspicious patterns like .../ or . ./
    const suspiciousPattern = /(?:^|\/)\.\.\.+|\/\.\s/;
    return suspiciousPattern.test(inputPath);
  }

  private normalizePath(inputPath: string): string {
    // URL decode first
    let decoded = this.urlDecode(inputPath);

    // Normalize path separators
    decoded = decoded.replace(/\\/g, '/');

    // Use Node's path normalization
    let normalized = path.normalize(decoded);

    // Remove trailing slash except for root
    normalized = normalized.replace(/\/$/, '');

    // Handle Windows paths on POSIX systems
    if (this.getPlatform() === 'posix' && /^[a-zA-Z]:/.test(normalized)) {
      // Remove drive letter
      normalized = normalized.substring(2);
    }

    return normalized;
  }

  private urlDecode(input: string): string {
    try {
      // First pass
      let decoded = decodeURIComponent(input);
      // Second pass for double-encoded strings
      if (/%[0-9a-fA-F]{2}/.test(decoded)) {
        try {
          decoded = decodeURIComponent(decoded);
        } catch {
          // Ignore second decode failure
        }
      }
      return decoded;
    } catch {
      // If decoding fails, return original
      return input;
    }
  }

  private calculatePathDepth(inputPath: string): number {
    const normalized = path.normalize(inputPath);
    const parts = normalized.split(path.sep).filter(part => part.length > 0 && part !== '.');
    return parts.length;
  }

  private isPathInAllowedRoots(inputPath: string): boolean {
    const normalizedInput = path.normalize(inputPath);

    for (const root of this.config.allowedRoots) {
      const normalizedRoot = path.normalize(root);
      const separator = normalizedRoot.endsWith(path.sep) ? '' : path.sep;
      
      if (normalizedInput === normalizedRoot ||
          normalizedInput.startsWith(normalizedRoot + separator)) {
        return true;
      }
    }

    return false;
  }

  private checkSymlinkAttack(filePath: string, baseDir: string): PathValidationResult {
    try {
      const stats = fs.lstatSync(filePath);
      
      if (stats.isSymbolicLink()) {
        const linkTarget = fs.readlinkSync(filePath);
        const resolvedTarget = path.resolve(path.dirname(filePath), linkTarget);
        
        if (!resolvedTarget.startsWith(baseDir + path.sep) && resolvedTarget !== baseDir) {
          return this.createResult(false, PathValidationError.SYMLINK_ESCAPE,
            'Symbolic link points outside allowed directory', 'critical', [PathAttackPattern.UNICODE_NORMALIZATION]);
        }
      }

      return this.createResult(true, undefined, undefined, 'none');
    } catch (error) {
      // File doesn't exist or can't be accessed - this is OK for validation
      return this.createResult(true, undefined, undefined, 'none');
    }
  }

  private checkWindowsSpecificAttacks(inputPath: string): PathValidationResult & { detectedPatterns?: PathAttackPattern[] } {
    // Check for alternate data streams (ADS)
    if (inputPath.includes(':') && !inputPath.includes('://')) {
      const parts = inputPath.split(':');
      if (parts.length > 2 || (parts.length === 2 && parts[1].length > 0 && !/^[a-zA-Z]$/.test(parts[0]))) {
        return {
          ...this.createResult(false, PathValidationError.INVALID_CHARACTERS,
            'Alternate data stream detected', 'critical', [PathAttackPattern.ALTERNATE_DATA_STREAM]),
          detectedPatterns: [PathAttackPattern.ALTERNATE_DATA_STREAM],
        };
      }
    }

    // Check for reserved device names
    const baseName = path.basename(inputPath, path.extname(inputPath)).toUpperCase();
    if (WINDOWS_RESERVED_NAMES.includes(baseName)) {
      return {
        ...this.createResult(false, PathValidationError.INVALID_CHARACTERS,
          `Windows reserved device name: ${baseName}`, 'warning'),
        detectedPatterns: [PathAttackPattern.DOS_DEVICE_PATH],
      };
    }

    // Check for UNC path traversal
    if (inputPath.startsWith('\\\\')) {
      if (!this.config.allowUncPaths) {
        return {
          ...this.createResult(false, PathValidationError.PATH_TRAVERSAL,
            'UNC paths are not allowed', 'warning'),
          detectedPatterns: [PathAttackPattern.DOS_DEVICE_PATH],
        };
      }
    }

    // Check for DOS device paths
    if (/^(\\\\\?\\|\\\\\.\\)/i.test(inputPath)) {
      return {
        ...this.createResult(false, PathValidationError.PATH_TRAVERSAL,
          'DOS device path detected', 'critical'),
        detectedPatterns: [PathAttackPattern.DOS_DEVICE_PATH],
      };
    }

    return { ...this.createResult(true, undefined, undefined, 'none'), detectedPatterns: [] };
  }

  private isWindows(): boolean {
    return this.getPlatform() === 'win32';
  }

  private getPlatform(): 'win32' | 'posix' {
    if (this.config.platform === 'auto') {
      return process.platform === 'win32' ? 'win32' : 'posix';
    }
    return this.config.platform;
  }

  private escapeChar(char: string): string {
    const code = char.charCodeAt(0);
    if (code < 32 || code > 126) {
      return `\\x${code.toString(16).padStart(2, '0')}`;
    }
    return char;
  }
}

// ============================================================================
// Standalone Functions
// ============================================================================

/**
 * Create a new path validator with default configuration
 */
export function createPathValidator(config?: Partial<PathValidatorConfig>): PathValidator {
  return new PathValidator(config);
}

/**
 * Quick path validation function
 */
export function validatePath(inputPath: string, config?: Partial<PathValidatorConfig>): PathValidationResult {
  const validator = new PathValidator(config);
  return validator.validate(inputPath);
}

/**
 * Sanitize a path quickly
 */
export function sanitizePath(inputPath: string): string {
  const validator = new PathValidator();
  return validator.sanitize(inputPath);
}

/**
 * Check if path is safe (no critical violations)
 */
export function isPathSafe(inputPath: string, config?: Partial<PathValidatorConfig>): boolean {
  const validator = new PathValidator(config);
  return validator.isSafe(inputPath);
}

/**
 * Detect path traversal in a string
 */
export function detectPathTraversal(inputPath: string): boolean {
  if (!inputPath) return false;
  
  // Check for common traversal patterns
  const patterns = [
    /\.\.\/+/,
    /\.\.\\+/,
    /%2e%2e%2f/gi,
    /%2e%2e\//gi,
  ];

  for (const pattern of patterns) {
    if (pattern.test(inputPath)) {
      return true;
    }
  }

  // Check normalized path
  try {
    const normalized = path.normalize(inputPath);
    if (normalized.split(path.sep).includes('..')) {
      return true;
    }
  } catch {
    // If normalization fails, consider it suspicious
    return true;
  }

  return false;
}

/**
 * Validate allowed root directories
 */
export function validateAllowedRoots(roots: string[]): string[] {
  return roots
    .map(root => path.normalize(root))
    .filter(root => root.length > 0)
    .filter((root, index, self) => self.indexOf(root) === index); // Remove duplicates
}

// ============================================================================
// Export Types and Enums (already exported above)
// ============================================================================
