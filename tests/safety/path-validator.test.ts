/**
 * Path Validator Tests - Comprehensive Security Testing
 * 
 * Team: Gamma-Security
 * Task: Task 2.3 from SPEC-001
 * Target: 90%+ coverage
 */

import {
  PathValidator,
  PathValidatorConfig,
  PathValidationResult,
  PathValidationError,
  PathAttackPattern,
  PathValidatorStats,
  createPathValidator,
  validatePath,
  sanitizePath,
  isPathSafe,
  detectPathTraversal,
  validateAllowedRoots,
} from '../../src/safety/path-validator';
import * as path from 'path';
import * as fs from 'fs';

describe('PathValidator', () => {
  let validator: PathValidator;

  beforeEach(() => {
    validator = new PathValidator();
  });

  afterEach(() => {
    validator.clearHistory();
    validator.resetStats();
  });

  // ============================================================================
  // Basic Validation Tests
  // ============================================================================

  describe('Basic Validation', () => {
    it('should validate a simple valid path', () => {
      const result = validator.validate('valid/path/file.txt');
      expect(result.valid).toBe(true);
      expect(result.normalizedPath).toBe('valid/path/file.txt');
      expect(result.severity).toBe('none');
    });

    it('should validate a path with single dot', () => {
      const result = validator.validate('./valid/path.txt');
      expect(result.valid).toBe(true);
    });

    it('should reject null input', () => {
      const result = validator.validate(null as unknown as string);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe(PathValidationError.EMPTY_PATH);
      expect(result.severity).toBe('critical');
    });

    it('should reject undefined input', () => {
      const result = validator.validate(undefined as unknown as string);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe(PathValidationError.EMPTY_PATH);
    });

    it('should reject empty string', () => {
      const result = validator.validate('');
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe(PathValidationError.EMPTY_PATH);
      expect(result.severity).toBe('warning');
    });

    it('should reject whitespace-only string', () => {
      const result = validator.validate('   ');
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe(PathValidationError.INVALID_CHARACTERS);
    });

    it('should reject paths with only tabs', () => {
      const result = validator.validate('\t\t\t');
      expect(result.valid).toBe(false);
    });

    it('should reject paths with mixed whitespace', () => {
      const result = validator.validate('  \t\n  ');
      expect(result.valid).toBe(false);
    });

    it('should trim and validate paths with leading/trailing whitespace', () => {
      const result = validator.validate('  valid/path.txt  ');
      expect(result.valid).toBe(true);
    });
  });

  // ============================================================================
  // Path Length Tests
  // ============================================================================

  describe('Path Length Validation', () => {
    it('should accept path at maximum length', () => {
      const longPath = 'a'.repeat(4080) + '.txt';
      const result = validator.validate(longPath);
      expect(result.valid).toBe(true);
    });

    it('should reject path exceeding maximum length', () => {
      const tooLongPath = 'a'.repeat(4100);
      const result = validator.validate(tooLongPath);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe(PathValidationError.PATH_TOO_LONG);
      expect(result.detectedPatterns).toContain(PathAttackPattern.PATH_OVERLONG);
      expect(result.severity).toBe('critical');
    });

    it('should respect custom max path length', () => {
      const customValidator = new PathValidator({ maxPathLength: 100 });
      const result = customValidator.validate('a'.repeat(101));
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe(PathValidationError.PATH_TOO_LONG);
    });

    it('should accept path within custom max length', () => {
      const customValidator = new PathValidator({ maxPathLength: 100 });
      const result = customValidator.validate('a'.repeat(100));
      expect(result.valid).toBe(true);
    });
  });

  // ============================================================================
  // Path Traversal Protection
  // ============================================================================

  describe('Path Traversal Protection', () => {
    it('should detect Unix-style path traversal', () => {
      const result = validator.validate('../../../etc/passwd');
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe(PathValidationError.PATH_TRAVERSAL);
      expect(result.detectedPatterns).toContain(PathAttackPattern.DOT_DOT_SLASH);
      expect(result.severity).toBe('critical');
    });

    it('should detect Windows-style path traversal', () => {
      const result = validator.validate('..\\..\\windows\\system32');
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe(PathValidationError.PATH_TRAVERSAL);
    });

    it('should detect URL-encoded traversal (%2e%2e%2f)', () => {
      const result = validator.validate('file/%2e%2e%2f%2e%2e%2fetc/passwd');
      expect(result.valid).toBe(false);
      expect(result.detectedPatterns).toContain(PathAttackPattern.URL_ENCODED_TRAVERSAL);
    });

    it('should detect URL-encoded traversal (mixed case)', () => {
      const result = validator.validate('%2E%2e/%2Fetc/passwd');
      expect(result.valid).toBe(false);
      expect(result.detectedPatterns).toContain(PathAttackPattern.URL_ENCODED_TRAVERSAL);
    });

    it('should detect double-dot without slash', () => {
      const result = validator.validate('file..name');
      expect(result.valid).toBe(true);
    });

    it('should detect traversal in middle of path', () => {
      const result = validator.validate('valid/../invalid/file.txt');
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe(PathValidationError.PATH_TRAVERSAL);
    });

    it('should allow parent traversal when explicitly enabled', () => {
      const permissiveValidator = new PathValidator({ allowParentTraversal: true });
      const result = permissiveValidator.validate('../valid/path.txt');
      expect(result.valid).toBe(true);
    });

    it('should detect multiple parent references', () => {
      const result = validator.validate('a/b/../../../c');
      expect(result.valid).toBe(false);
    });

    it('should detect traversal with encoded dots', () => {
      const result = validator.validate('path/%252e%252e/');
      expect(result.valid).toBe(false);
      expect(result.detectedPatterns).toContain(PathAttackPattern.DOUBLE_ENCODING);
    });
  });

  // ============================================================================
  // Null Byte Injection Protection
  // ============================================================================

  describe('Null Byte Injection Protection', () => {
    it('should detect null byte in path', () => {
      const result = validator.validate('valid.txt\x00.exe');
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe(PathValidationError.NULL_BYTE_INJECTION);
      expect(result.detectedPatterns).toContain(PathAttackPattern.NULL_BYTE);
      expect(result.severity).toBe('critical');
    });

    it('should detect null byte at start of path', () => {
      const result = validator.validate('\x00/etc/passwd');
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe(PathValidationError.NULL_BYTE_INJECTION);
    });

    it('should detect null byte at end of path', () => {
      const result = validator.validate('valid/path\x00');
      expect(result.valid).toBe(false);
    });

    it('should detect multiple null bytes', () => {
      const result = validator.validate('path\x00file\x00.txt');
      expect(result.valid).toBe(false);
    });

    it('should accept path without null bytes', () => {
      const result = validator.validate('valid/path/file.txt');
      expect(result.valid).toBe(true);
    });
  });

  // ============================================================================
  // Control Character Protection
  // ============================================================================

  describe('Control Character Protection', () => {
    it('should reject path with control character (bell)', () => {
      const result = validator.validate('file\x07.txt');
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe(PathValidationError.CONTROL_CHARACTER);
      expect(result.severity).toBe('critical');
    });

    it('should reject path with control character (escape)', () => {
      const result = validator.validate('file\x1b.txt');
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe(PathValidationError.CONTROL_CHARACTER);
    });

    it('should reject path with DEL character', () => {
      const result = validator.validate('file\x7f.txt');
      expect(result.valid).toBe(false);
    });

    it('should reject path with high control characters', () => {
      const result = validator.validate('file\x9f.txt');
      expect(result.valid).toBe(false);
    });

    it('should accept path with valid characters', () => {
      const result = validator.validate('valid-file_name.txt');
      expect(result.valid).toBe(true);
    });
  });

  // ============================================================================
  // Forbidden Character Tests
  // ============================================================================

  describe('Forbidden Character Validation', () => {
    it('should reject path with forbidden character', () => {
      const customValidator = new PathValidator({
        forbiddenCharacters: ['$']
      });
      const result = customValidator.validate('file$name.txt');
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe(PathValidationError.INVALID_CHARACTERS);
    });

    it('should reject path with multiple forbidden characters', () => {
      const customValidator = new PathValidator({
        forbiddenCharacters: ['<', '>']
      });
      const result = customValidator.validate('file<name>.txt');
      expect(result.valid).toBe(false);
    });

    it('should accept path without forbidden characters', () => {
      const customValidator = new PathValidator({
        forbiddenCharacters: ['$']
      });
      const result = customValidator.validate('filename.txt');
      expect(result.valid).toBe(true);
    });
  });

  // ============================================================================
  // Absolute Path Validation
  // ============================================================================

  describe('Absolute Path Validation', () => {
    it('should reject absolute Unix path by default', () => {
      const result = validator.validate('/etc/passwd');
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe(PathValidationError.RELATIVE_PATH_REQUIRED);
      expect(result.severity).toBe('warning');
    });

    it('should reject absolute Windows path by default', () => {
      const result = validator.validate('C:\\Windows\\System32');
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe(PathValidationError.RELATIVE_PATH_REQUIRED);
    });

    it('should accept absolute path when allowed', () => {
      const permissiveValidator = new PathValidator({ allowAbsolute: true });
      const result = permissiveValidator.validate('/etc/passwd');
      expect(result.valid).toBe(true);
    });

    it('should accept relative path when absolute is required', () => {
      const strictValidator = new PathValidator({ 
        allowAbsolute: true,
        allowParentTraversal: true 
      });
      const result = strictValidator.validate('relative/path.txt');
      expect(result.valid).toBe(true);
    });
  });

  // ============================================================================
  // Unicode Attack Detection
  // ============================================================================

  describe('Unicode Attack Detection', () => {
    it('should detect right-to-left override attack', () => {
      const result = validator.validate('file\u202e.txt.exe');
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe(PathValidationError.UNICODE_ATTACK);
      expect(result.detectedPatterns).toContain(PathAttackPattern.UNICODE_NORMALIZATION);
      expect(result.severity).toBe('critical');
    });

    it('should detect left-to-right override attack', () => {
      const result = validator.validate('file\u202dname.txt');
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe(PathValidationError.UNICODE_ATTACK);
    });

    it('should detect left-to-right mark attack', () => {
      const result = validator.validate('file\u200ename.txt');
      expect(result.valid).toBe(false);
    });

    it('should detect right-to-left mark attack', () => {
      const result = validator.validate('file\u200fname.txt');
      expect(result.valid).toBe(false);
    });

    it('should detect BOM character', () => {
      const result = validator.validate('\ufefffilename.txt');
      expect(result.valid).toBe(false);
    });

    it('should accept valid Unicode characters', () => {
      const result = validator.validate('文件.txt');
      expect(result.valid).toBe(true);
    });

    it('should disable Unicode checks when configured', () => {
      const noCheckValidator = new PathValidator({ checkUnicodeAttacks: false });
      const result = noCheckValidator.validate('file\u202e.txt');
      expect(result.valid).toBe(true);
    });

    it('should detect mixed script attacks in strict mode', () => {
      const result = validator.validate('fileтест.txt');
      expect(result.valid).toBe(false);
    });
  });

  // ============================================================================
  // Double Encoding Detection
  // ============================================================================

  describe('Double Encoding Detection', () => {
    it('should detect double URL encoding', () => {
      const result = validator.validate('path%252f..%252fetc');
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe(PathValidationError.INVALID_ENCODING);
      expect(result.detectedPatterns).toContain(PathAttackPattern.DOUBLE_ENCODING);
      expect(result.severity).toBe('critical');
    });

    it('should detect double encoding of special chars', () => {
      const result = validator.validate('path%2520name');
      expect(result.valid).toBe(false);
    });

    it('should accept single URL encoding', () => {
      const result = validator.validate('path%20name');
      expect(result.valid).toBe(true);
    });

    it('should accept path without encoding', () => {
      const result = validator.validate('path/name');
      expect(result.valid).toBe(true);
    });
  });

  // ============================================================================
  // Path Depth Validation
  // ============================================================================

  describe('Path Depth Validation', () => {
    it('should accept path within depth limit', () => {
      const result = validator.validate('a/b/c/d/e');
      expect(result.valid).toBe(true);
    });

    it('should reject path exceeding depth limit', () => {
      const deepPath = Array(52).fill('dir').join('/');
      const result = validator.validate(deepPath);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe(PathValidationError.PATH_TOO_LONG);
    });

    it('should respect custom depth limit', () => {
      const customValidator = new PathValidator({ maxPathDepth: 3 });
      const result = customValidator.validate('a/b/c/d');
      expect(result.valid).toBe(false);
    });

    it('should accept path at custom depth limit', () => {
      const customValidator = new PathValidator({ maxPathDepth: 3 });
      const result = customValidator.validate('a/b/c');
      expect(result.valid).toBe(true);
    });
  });

  // ============================================================================
  // Dot Directory Attack Detection
  // ============================================================================

  describe('Dot Directory Attack Detection', () => {
    it('should detect suspicious dot pattern', () => {
      const result = validator.validate('path/.../file.txt');
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe(PathValidationError.DOT_DIRECTORY_ATTACK);
      expect(result.detectedPatterns).toContain(PathAttackPattern.DOT_DIRECTORY_ATTACK);
    });

    it('should detect spaced dot pattern', () => {
      const result = validator.validate('path/. ./file.txt');
      expect(result.valid).toBe(false);
    });

    it('should accept legitimate hidden directory', () => {
      const result = validator.validate('path/.hidden/file.txt');
      expect(result.valid).toBe(true);
    });

    it('should allow dot directory in non-strict mode', () => {
      const nonStrictValidator = new PathValidator({ strictMode: false });
      const result = nonStrictValidator.validate('path/.../file.txt');
      expect(result.valid).toBe(true);
    });
  });

  // ============================================================================
  // Forbidden Extension Tests
  // ============================================================================

  describe('Forbidden Extension Validation', () => {
    it('should reject forbidden extension', () => {
      const result = validator.validate('file.exe');
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe(PathValidationError.INVALID_CHARACTERS);
      expect(result.severity).toBe('warning');
    });

    it('should reject forbidden extension (case insensitive)', () => {
      const result = validator.validate('file.EXE');
      expect(result.valid).toBe(false);
    });

    it('should reject multiple forbidden extensions', () => {
      const result = validator.validate('script.sh');
      expect(result.valid).toBe(false);
    });

    it('should accept allowed extension', () => {
      const result = validator.validate('file.txt');
      expect(result.valid).toBe(true);
    });

    it('should reject forbidden extension in path', () => {
      const result = validator.validate('path/to/file.bat');
      expect(result.valid).toBe(false);
    });

    it('should accept custom allowed extensions', () => {
      const customValidator = new PathValidator({
        forbiddenExtensions: ['.exe']
      });
      const result = customValidator.validate('file.txt');
      expect(result.valid).toBe(true);
    });
  });

  // ============================================================================
  // Allowed Roots Validation
  // ============================================================================

  describe('Allowed Roots Validation', () => {
    it('should validate path within allowed root', () => {
      const rootValidator = new PathValidator({
        allowedRoots: ['/allowed/path'],
        allowAbsolute: true
      });
      const result = rootValidator.validate('/allowed/path/file.txt');
      expect(result.valid).toBe(true);
    });

    it('should reject path outside allowed root', () => {
      const rootValidator = new PathValidator({
        allowedRoots: ['/allowed/path'],
        allowAbsolute: true
      });
      const result = rootValidator.validate('/other/path/file.txt');
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe(PathValidationError.OUTSIDE_ALLOWED_ROOT);
      expect(result.severity).toBe('critical');
    });

    it('should accept path within one of multiple roots', () => {
      const rootValidator = new PathValidator({
        allowedRoots: ['/path1', '/path2'],
        allowAbsolute: true
      });
      const result = rootValidator.validate('/path2/file.txt');
      expect(result.valid).toBe(true);
    });

    it('should handle subdirectories of allowed root', () => {
      const rootValidator = new PathValidator({
        allowedRoots: ['/allowed'],
        allowAbsolute: true
      });
      const result = rootValidator.validate('/allowed/sub/deep/file.txt');
      expect(result.valid).toBe(true);
    });

    it('should allow any path when no roots configured', () => {
      const result = validator.validate('any/path/file.txt');
      expect(result.valid).toBe(true);
    });
  });

  // ============================================================================
  // Path Normalization Tests
  // ============================================================================

  describe('Path Normalization', () => {
    it('should normalize dot segments', () => {
      const result = validator.validate('./path/./file.txt');
      expect(result.valid).toBe(true);
      expect(result.normalizedPath).toBe('path/file.txt');
    });

    it('should normalize multiple slashes', () => {
      const result = validator.validate('path//to///file.txt');
      expect(result.valid).toBe(true);
      expect(result.normalizedPath).toBe('path/to/file.txt');
    });

    it('should normalize Windows separators on POSIX', () => {
      const result = validator.validate('path\\to\\file.txt');
      expect(result.valid).toBe(true);
      expect(result.normalizedPath).toContain('/');
    });

    it('should remove trailing slash', () => {
      const result = validator.validate('path/to/file.txt/');
      expect(result.valid).toBe(true);
      expect(result.normalizedPath).toBe('path/to/file.txt');
    });
  });

  // ============================================================================
  // Symlink Attack Prevention
  // ============================================================================

  describe('Symlink Attack Prevention', () => {
    const testDir = '/tmp/path-validator-test';

    beforeAll(() => {
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }
    });

    afterAll(() => {
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true });
      }
    });

    it('should detect symlink escaping base directory', () => {
      // Create a symlink pointing outside testDir
      const linkPath = path.join(testDir, 'escape-link');
      const targetPath = '/etc';
      
      try {
        fs.symlinkSync(targetPath, linkPath);
      } catch (e) {
        // Skip if can't create symlinks
        return;
      }

      const result = validator.validateAndResolve('escape-link', testDir);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe(PathValidationError.SYMLINK_ESCAPE);

      fs.unlinkSync(linkPath);
    });

    it('should allow symlink within base directory', () => {
      const subDir = path.join(testDir, 'subdir');
      const linkPath = path.join(testDir, 'valid-link');
      
      if (!fs.existsSync(subDir)) {
        fs.mkdirSync(subDir);
      }

      try {
        fs.symlinkSync(subDir, linkPath);
      } catch (e) {
        return;
      }

      const result = validator.validateAndResolve('valid-link', testDir);
      expect(result.valid).toBe(true);

      fs.unlinkSync(linkPath);
    });

    it('should follow symlinks when configured', () => {
      const symlinkValidator = new PathValidator({ followSymlinks: true });
      const result = symlinkValidator.validateAndResolve('any-path', testDir);
      // Should be valid if file doesn't exist (no symlink to check)
      expect(result.valid).toBe(true);
    });
  });

  // ============================================================================
  // Validate and Resolve Tests
  // ============================================================================

  describe('Validate and Resolve', () => {
    it('should resolve relative path against base directory', () => {
      const result = validator.validateAndResolve('file.txt', '/base/dir');
      expect(result.valid).toBe(true);
      expect(result.normalizedPath).toBe(path.resolve('/base/dir', 'file.txt'));
    });

    it('should reject non-existent base directory', () => {
      const result = validator.validateAndResolve('file.txt', '/nonexistent/dir');
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe(PathValidationError.OUTSIDE_ALLOWED_ROOT);
    });

    it('should detect path escaping base directory', () => {
      const baseDir = '/allowed/base';
      fs.mkdirSync(baseDir, { recursive: true });
      
      const result = validator.validateAndResolve('../escape.txt', baseDir);
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe(PathValidationError.PATH_TRAVERSAL);

      fs.rmSync(baseDir, { recursive: true });
    });
  });

  // ============================================================================
  // Quick Validation Methods
  // ============================================================================

  describe('Quick Validation Methods', () => {
    it('isValid should return true for valid path', () => {
      expect(validator.isValid('valid/path.txt')).toBe(true);
    });

    it('isValid should return false for invalid path', () => {
      expect(validator.isValid('')).toBe(false);
    });

    it('isSafe should return true for valid path', () => {
      expect(validator.isSafe('valid/path.txt')).toBe(true);
    });

    it('isSafe should return false for critical violations', () => {
      expect(validator.isSafe('path\x00.txt')).toBe(false);
    });
  });

  // ============================================================================
  // Sanitization Tests
  // ============================================================================

  describe('Path Sanitization', () => {
    it('should remove null bytes', () => {
      const sanitized = validator.sanitize('file\x00name.txt');
      expect(sanitized).not.toContain('\x00');
    });

    it('should remove control characters', () => {
      const sanitized = validator.sanitize('file\x07\x08name.txt');
      expect(sanitized).not.toMatch(/[\x00-\x1f]/);
    });

    it('should normalize slashes', () => {
      const sanitized = validator.sanitize('path\\to\\file.txt');
      expect(sanitized).toBe('path/to/file.txt');
    });

    it('should remove traversal attempts', () => {
      const sanitized = validator.sanitize('../../../etc/passwd');
      expect(sanitized).not.toContain('..');
    });

    it('should collapse multiple slashes', () => {
      const sanitized = validator.sanitize('path//to///file.txt');
      expect(sanitized).toBe('path/to/file.txt');
    });

    it('should trim whitespace', () => {
      const sanitized = validator.sanitize('  path.txt  ');
      expect(sanitized).toBe('path.txt');
    });

    it('should handle empty input', () => {
      const sanitized = validator.sanitize('');
      expect(sanitized).toBe('');
    });

    it('should decode URL-encoded characters', () => {
      const sanitized = validator.sanitize('path%2fname');
      expect(sanitized).toBe('path/name');
    });
  });

  // ============================================================================
  // Statistics and History Tests
  // ============================================================================

  describe('Statistics and History', () => {
    it('should track total validations', () => {
      validator.validate('path1.txt');
      validator.validate('path2.txt');
      const stats = validator.getStats();
      expect(stats.totalValidations).toBe(2);
    });

    it('should track valid paths', () => {
      validator.validate('valid.txt');
      validator.validate('');
      const stats = validator.getStats();
      expect(stats.validPaths).toBe(1);
      expect(stats.invalidPaths).toBe(1);
    });

    it('should track critical violations', () => {
      validator.validate('path\x00.txt');
      const stats = validator.getStats();
      expect(stats.criticalViolations).toBe(1);
    });

    it('should track warning violations', () => {
      validator.validate('');
      const stats = validator.getStats();
      expect(stats.warningViolations).toBe(1);
    });

    it('should track attack patterns', () => {
      validator.validate('../../../etc/passwd');
      const stats = validator.getStats();
      expect(stats.attacksDetected.get(PathAttackPattern.DOT_DOT_SLASH)).toBe(1);
    });

    it('should track validation time', () => {
      validator.validate('path.txt');
      const stats = validator.getStats();
      expect(stats.averageValidationTime).toBeGreaterThanOrEqual(0);
    });

    it('should reset statistics', () => {
      validator.validate('path.txt');
      validator.resetStats();
      const stats = validator.getStats();
      expect(stats.totalValidations).toBe(0);
      expect(stats.validPaths).toBe(0);
    });

    it('should track validation history', () => {
      validator.validate('path1.txt');
      validator.validate('path2.txt');
      const history = validator.getValidationHistory();
      expect(history.length).toBe(2);
    });

    it('should limit history size', () => {
      for (let i = 0; i < 1100; i++) {
        validator.validate(`path${i}.txt`);
      }
      const history = validator.getValidationHistory();
      expect(history.length).toBeLessThanOrEqual(1000);
    });

    it('should return limited history', () => {
      validator.validate('path1.txt');
      validator.validate('path2.txt');
      validator.validate('path3.txt');
      const history = validator.getValidationHistory(2);
      expect(history.length).toBe(2);
    });

    it('should clear history', () => {
      validator.validate('path.txt');
      validator.clearHistory();
      const history = validator.getValidationHistory();
      expect(history.length).toBe(0);
    });
  });

  // ============================================================================
  // Configuration Tests
  // ============================================================================

  describe('Configuration', () => {
    it('should get default configuration', () => {
      const config = validator.getConfig();
      expect(config.maxPathLength).toBe(4096);
      expect(config.maxPathDepth).toBe(50);
      expect(config.allowAbsolute).toBe(false);
      expect(config.allowParentTraversal).toBe(false);
    });

    it('should update configuration', () => {
      validator.updateConfig({ maxPathLength: 100 });
      const config = validator.getConfig();
      expect(config.maxPathLength).toBe(100);
    });

    it('should merge partial configuration', () => {
      validator.updateConfig({ allowAbsolute: true });
      const config = validator.getConfig();
      expect(config.allowAbsolute).toBe(true);
      expect(config.maxPathLength).toBe(4096); // unchanged
    });
  });

  // ============================================================================
  // Standalone Function Tests
  // ============================================================================

  describe('Standalone Functions', () => {
    describe('createPathValidator', () => {
      it('should create validator with default config', () => {
        const v = createPathValidator();
        expect(v).toBeInstanceOf(PathValidator);
      });

      it('should create validator with custom config', () => {
        const v = createPathValidator({ maxPathLength: 100 });
        expect(v.getConfig().maxPathLength).toBe(100);
      });
    });

    describe('validatePath', () => {
      it('should validate path with default config', () => {
        const result = validatePath('valid/path.txt');
        expect(result.valid).toBe(true);
      });

      it('should validate path with custom config', () => {
        const result = validatePath('valid/path.txt', { maxPathDepth: 3 });
        expect(result.valid).toBe(true);
      });
    });

    describe('sanitizePath', () => {
      it('should sanitize path', () => {
        const result = sanitizePath('path\x00/../file.txt');
        expect(result).not.toContain('\x00');
        expect(result).not.toContain('..');
      });

      it('should handle empty input', () => {
        const result = sanitizePath('');
        expect(result).toBe('');
      });
    });

    describe('isPathSafe', () => {
      it('should return true for safe path', () => {
        expect(isPathSafe('valid/path.txt')).toBe(true);
      });

      it('should return false for unsafe path', () => {
        expect(isPathSafe('path\x00.txt')).toBe(false);
      });

      it('should accept custom config', () => {
        expect(isPathSafe('valid/path.txt', { maxPathDepth: 5 })).toBe(true);
      });
    });

    describe('detectPathTraversal', () => {
      it('should detect traversal', () => {
        expect(detectPathTraversal('../etc/passwd')).toBe(true);
      });

      it('should not detect traversal in valid path', () => {
        expect(detectPathTraversal('valid/path.txt')).toBe(false);
      });

      it('should detect URL encoded traversal', () => {
        expect(detectPathTraversal('%2e%2e/%2e%2e/etc')).toBe(true);
      });

      it('should handle empty input', () => {
        expect(detectPathTraversal('')).toBe(false);
      });

      it('should handle null input', () => {
        expect(detectPathTraversal(null as unknown as string)).toBe(false);
      });
    });

    describe('validateAllowedRoots', () => {
      it('should normalize roots', () => {
        const roots = validateAllowedRoots(['/path//to/', '/other/path']);
        expect(roots).toContain('/path/to');
      });

      it('should remove empty roots', () => {
        const roots = validateAllowedRoots(['/valid', '']);
        expect(roots).not.toContain('');
      });

      it('should remove duplicates', () => {
        const roots = validateAllowedRoots(['/path', '/path']);
        expect(roots.length).toBe(1);
      });
    });
  });

  // ============================================================================
  // Edge Cases and Boundary Conditions
  // ============================================================================

  describe('Edge Cases and Boundary Conditions', () => {
    it('should handle single character path', () => {
      const result = validator.validate('a');
      expect(result.valid).toBe(true);
    });

    it('should handle path with only dots', () => {
      const result = validator.validate('...');
      expect(result.valid).toBe(false);
    });

    it('should handle path with only slashes', () => {
      const result = validator.validate('///');
      expect(result.valid).toBe(true);
      expect(result.normalizedPath).toBe('/');
    });

    it('should handle very short path at boundary', () => {
      const result = validator.validate('./a');
      expect(result.valid).toBe(true);
    });

    it('should handle path with spaces', () => {
      const result = validator.validate('path with spaces/file.txt');
      expect(result.valid).toBe(true);
    });

    it('should handle path with special valid characters', () => {
      const result = validator.validate('file-name_v2.0.txt');
      expect(result.valid).toBe(true);
    });

    it('should handle path starting with dash', () => {
      const result = validator.validate('-filename.txt');
      expect(result.valid).toBe(true);
    });

    it('should handle unicode filename', () => {
      const result = validator.validate('日本語ファイル.txt');
      expect(result.valid).toBe(true);
    });

    it('should handle emoji in filename', () => {
      const result = validator.validate('file🎉.txt');
      expect(result.valid).toBe(true);
    });

    it('should handle very long extension', () => {
      const ext = '.'.repeat(100);
      const result = validator.validate(`file${ext}`);
      expect(result.valid).toBe(true);
    });

    it('should handle path with multiple consecutive dots', () => {
      const result = validator.validate('file...name.txt');
      expect(result.valid).toBe(true);
    });

    it('should handle Windows-style absolute path', () => {
      const result = validator.validate('C:\\Windows\\file.txt');
      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe(PathValidationError.RELATIVE_PATH_REQUIRED);
    });

    it('should handle UNC path', () => {
      const result = validator.validate('\\\\server\\share\\file.txt');
      expect(result.valid).toBe(false);
    });

    it('should handle URL-like path', () => {
      const result = validator.validate('http://example.com/file.txt');
      expect(result.valid).toBe(true);
    });

    it('should handle path with tabs', () => {
      const result = validator.validate('path\tfile.txt');
      expect(result.valid).toBe(false);
    });

    it('should handle path with newlines', () => {
      const result = validator.validate('path\nfile.txt');
      expect(result.valid).toBe(false);
    });

    it('should handle path with carriage return', () => {
      const result = validator.validate('path\rfile.txt');
      expect(result.valid).toBe(false);
    });

    it('should handle path with form feed', () => {
      const result = validator.validate('path\x0cfile.txt');
      expect(result.valid).toBe(false);
    });

    it('should handle path with vertical tab', () => {
      const result = validator.validate('path\x0bfile.txt');
      expect(result.valid).toBe(false);
    });

    it('should handle path with backspace', () => {
      const result = validator.validate('path\x08file.txt');
      expect(result.valid).toBe(false);
    });

    it('should handle multiple validation calls', () => {
      const results = [
        validator.validate('valid1.txt'),
        validator.validate('valid2.txt'),
        validator.validate('invalid\x00.txt'),
        validator.validate('../../../etc'),
      ];
      expect(results[0].valid).toBe(true);
      expect(results[1].valid).toBe(true);
      expect(results[2].valid).toBe(false);
      expect(results[3].valid).toBe(false);
    });

    it('should maintain correct stats across multiple validations', () => {
      validator.validate('valid.txt');
      validator.validate('valid2.txt');
      validator.validate('../invalid');
      validator.validate('');

      const stats = validator.getStats();
      expect(stats.totalValidations).toBe(4);
      expect(stats.validPaths).toBe(2);
      expect(stats.invalidPaths).toBe(2);
    });
  });

  // ============================================================================
  // Context Parameter Tests
  // ============================================================================

  describe('Context Parameter', () => {
    it('should accept context parameter', () => {
      const result = validator.validate('path.txt', 'test-context');
      expect(result.valid).toBe(true);
    });

    it('should validate without context', () => {
      const result = validator.validate('path.txt');
      expect(result.valid).toBe(true);
    });
  });
});

// ============================================================================
// Performance Tests
// ============================================================================

describe('PathValidator Performance', () => {
  it('should validate paths efficiently', () => {
    const validator = new PathValidator();
    const start = Date.now();
    
    for (let i = 0; i < 1000; i++) {
      validator.validate(`path/to/file${i}.txt`);
    }
    
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(5000); // Should complete in under 5 seconds
  });

  it('should track average validation time', () => {
    const validator = new PathValidator();
    
    for (let i = 0; i < 100; i++) {
      validator.validate('path.txt');
    }
    
    const stats = validator.getStats();
    expect(stats.averageValidationTime).toBeGreaterThan(0);
  });
});
