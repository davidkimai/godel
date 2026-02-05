/**
 * Secret Manager
 * 
 * Manages secrets using 1Password CLI (op) with:
 * - Secret resolution from 1Password vaults
 * - Template syntax: {{ op://vault/item/field }}
 * - Secret caching with TTL
 * - Audit logging (paths only, never values)
 * - Batch resolution for efficiency
 */

import { logger } from '../utils/logger';
import { exec } from 'child_process';
import { promisify } from 'util';
import { createHash } from 'crypto';

const execAsync = promisify(exec);

// ============================================================================
// Types
// ============================================================================

export interface SecretReference {
  /** Full reference string */
  full: string;
  /** Vault name */
  vault: string;
  /** Item name */
  item: string;
  /** Field name */
  field: string;
}

export interface CachedSecret {
  /** Cached value */
  value: string;
  /** Timestamp when cached */
  cachedAt: Date;
  /** Time-to-live in milliseconds */
  ttl: number;
}

export interface SecretAuditLog {
  /** Timestamp of access */
  timestamp: Date;
  /** Secret path accessed (not value!) */
  path: string;
  /** Operation performed */
  operation: 'read' | 'resolve' | 'batch_resolve';
  /** Context/scope of access */
  context?: string;
  /** Success or failure */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

export interface SecretResolutionOptions {
  /** Cache TTL in milliseconds (default: 5 minutes) */
  cacheTtl?: number;
  /** Enable caching (default: true) */
  useCache?: boolean;
  /** Context for audit logging */
  context?: string;
  /** Timeout for CLI operations in milliseconds */
  timeout?: number;
}

// ============================================================================
// Secret Manager
// ============================================================================

export class SecretManager {
  private cache: Map<string, CachedSecret> = new Map();
  private auditLog: SecretAuditLog[] = [];
  private defaultTtl: number = 5 * 60 * 1000; // 5 minutes
  private maxAuditLogSize: number = 1000;
  private opAvailable: boolean | null = null;

  constructor(options?: { defaultTtl?: number; maxAuditLogSize?: number }) {
    if (options?.defaultTtl) {
      this.defaultTtl = options.defaultTtl;
    }
    if (options?.maxAuditLogSize) {
      this.maxAuditLogSize = options.maxAuditLogSize;
    }
  }

  /**
   * Check if 1Password CLI is available
   */
  async isOpAvailable(): Promise<boolean> {
    if (this.opAvailable !== null) {
      return this.opAvailable;
    }

    try {
      await execAsync('op --version', { timeout: 5000 });
      this.opAvailable = true;
      return true;
    } catch {
      this.opAvailable = false;
      return false;
    }
  }

  /**
   * Parse a secret reference from template syntax
   * Format: {{ op://vault/item/field }}
   */
  parseReference(template: string): SecretReference | null {
    const match = template.match(
      /^\{\{\s*op:\/\/([^\/]+)\/([^\/]+)\/([^\s}]+)\s*\}\}$/i
    );
    
    if (!match) {
      return null;
    }

    return {
      full: match[0],
      vault: match[1],
      item: match[2],
      field: match[3],
    };
  }

  /**
   * Extract all secret references from a string
   */
  extractReferences(text: string): SecretReference[] {
    const references: SecretReference[] = [];
    const pattern = /\{\{\s*op:\/\/([^\/]+)\/([^\/]+)\/([^\s}]+)\s*\}\}/gi;
    
    let match;
    while ((match = pattern.exec(text)) !== null) {
      references.push({
        full: match[0],
        vault: match[1],
        item: match[2],
        field: match[3],
      });
    }

    return references;
  }

  /**
   * Check if a string contains secret references
   */
  hasReferences(text: string): boolean {
    return /\{\{\s*op:\/\/[^\/]+\/[^\/]+\/[^\s}]+\s*\}\}/i.test(text);
  }

  /**
   * Generate cache key for a secret reference
   */
  private getCacheKey(ref: SecretReference): string {
    return createHash('sha256')
      .update(`${ref.vault}:${ref.item}:${ref.field}`)
      .digest('hex');
  }

  /**
   * Get cached secret if valid
   */
  private getCached(ref: SecretReference): string | null {
    const key = this.getCacheKey(ref);
    const cached = this.cache.get(key);

    if (!cached) {
      return null;
    }

    // Check if expired
    const now = Date.now();
    if (now - cached.cachedAt.getTime() > cached.ttl) {
      this.cache.delete(key);
      return null;
    }

    return cached.value;
  }

  /**
   * Cache a secret value
   */
  private setCached(ref: SecretReference, value: string, ttl: number): void {
    const key = this.getCacheKey(ref);
    this.cache.set(key, {
      value,
      cachedAt: new Date(),
      ttl,
    });
  }

  /**
   * Resolve a single secret from 1Password
   * Never logs the actual secret value
   */
  async resolve(
    ref: SecretReference | string,
    options: SecretResolutionOptions = {}
  ): Promise<string> {
    const reference = typeof ref === 'string' ? this.parseReference(ref) : ref;
    
    if (!reference) {
      throw new SecretResolutionError('Invalid secret reference format');
    }

    // Check cache first
    if (options.useCache !== false) {
      const cached = this.getCached(reference);
      if (cached !== null) {
        this.audit(reference, 'read', options.context, true);
        return cached;
      }
    }

    // Check op CLI availability
    if (!(await this.isOpAvailable())) {
      const error = new SecretResolutionError(
        '1Password CLI (op) is not available. Please install it: https://developer.1password.com/docs/cli/get-started'
      );
      this.audit(reference, 'resolve', options.context, false, error.message);
      throw error;
    }

    try {
      // Build the op read command
      // Use --no-newline to avoid trailing newline in output
      const command = `op read "op://${reference.vault}/${reference.item}/${reference.field}" --no-newline`;
      
      logger.debug('secret', `Resolving secret: op://${reference.vault}/${reference.item}/${reference.field}`);
      
      const { stdout, stderr } = await execAsync(command, {
        timeout: options.timeout || 30000,
        env: {
          ...process.env,
          ['OP_ACCOUNT']: process.env['OP_ACCOUNT'],
        },
      });

      if (stderr) {
        logger.warn('secret', `1Password CLI warning: ${stderr}`);
      }

      const value = stdout;

      // Cache the result
      if (options.useCache !== false) {
        this.setCached(reference, value, options.cacheTtl || this.defaultTtl);
      }

      // Audit log (path only, never value)
      this.audit(reference, 'resolve', options.context, true);

      return value;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Check for specific error conditions
      if (errorMessage.includes('not found')) {
        const notFoundError = new SecretResolutionError(
          `Secret not found: op://${reference.vault}/${reference.item}/${reference.field}`,
          'NOT_FOUND',
          error
        );
        this.audit(reference, 'resolve', options.context, false, notFoundError.message);
        throw notFoundError;
      }

      if (errorMessage.includes('not signed in')) {
        const authError = new SecretResolutionError(
          'Not signed in to 1Password. Please run: op signin',
          'NOT_AUTHENTICATED',
          error
        );
        this.audit(reference, 'resolve', options.context, false, authError.message);
        throw authError;
      }

      const resolveError = new SecretResolutionError(
        `Failed to resolve secret: ${errorMessage}`,
        'RESOLUTION_FAILED',
        error
      );
      this.audit(reference, 'resolve', options.context, false, resolveError.message);
      throw resolveError;
    }
  }

  /**
   * Resolve all secrets in a string template
   */
  async resolveTemplate(
    template: string,
    options: SecretResolutionOptions = {}
  ): Promise<{ result: string; resolved: SecretReference[] }> {
    const references = this.extractReferences(template);
    
    if (references.length === 0) {
      return { result: template, resolved: [] };
    }

    let result = template;
    const resolved: SecretReference[] = [];

    for (const ref of references) {
      const value = await this.resolve(ref, options);
      result = result.replace(ref.full, value);
      resolved.push(ref);
    }

    this.audit(
      { full: template, vault: '*', item: '*', field: '*' },
      'batch_resolve',
      options.context,
      true
    );

    return { result, resolved };
  }

  /**
   * Resolve secrets in an object recursively
   */
  async resolveInObject<T extends Record<string, unknown>>(
    obj: T,
    options: SecretResolutionOptions = {}
  ): Promise<{ result: T; resolved: SecretReference[] }> {
    const allResolved: SecretReference[] = [];

    async function recurse(value: unknown): Promise<unknown> {
      if (typeof value === 'string' && this.hasReferences(value)) {
        const { result, resolved } = await this.resolveTemplate(value, options);
        allResolved.push(...resolved);
        return result;
      }

      if (Array.isArray(value)) {
        return Promise.all(value.map(recurse.bind(this)));
      }

      if (value !== null && typeof value === 'object') {
        const result: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(value)) {
          result[key] = await recurse.call(this, val);
        }
        return result;
      }

      return value;
    }

    const result = await recurse.call(this, obj);

    return {
      result: result as T,
      resolved: allResolved,
    };
  }

  /**
   * Add audit log entry (path only, never values!)
   */
  private audit(
    ref: SecretReference,
    operation: SecretAuditLog['operation'],
    context: string | undefined,
    success: boolean,
    error?: string
  ): void {
    const entry: SecretAuditLog = {
      timestamp: new Date(),
      path: `op://${ref.vault}/${ref.item}/${ref.field}`,
      operation,
      context,
      success,
      error,
    };

    this.auditLog.push(entry);

    // Trim audit log if too large
    if (this.auditLog.length > this.maxAuditLogSize) {
      this.auditLog = this.auditLog.slice(-this.maxAuditLogSize);
    }

    // Log at appropriate level
    if (success) {
      logger.debug('secret', `Secret accessed: ${entry.path} (${operation})`);
    } else {
      logger.warn('secret', `Secret access failed: ${entry.path} - ${error}`);
    }
  }

  /**
   * Get audit log (paths only, no values)
   */
  getAuditLog(): SecretAuditLog[] {
    return [...this.auditLog];
  }

  /**
   * Clear audit log
   */
  clearAuditLog(): void {
    this.auditLog = [];
  }

  /**
   * Clear secret cache
   */
  clearCache(): void {
    this.cache.clear();
    logger.debug('secret', 'Secret cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; hitRate: number } {
    return {
      size: this.cache.size,
      hitRate: 0, // Would need tracking for accurate hit rate
    };
  }

  /**
   * Pre-warm cache with common secrets
   */
  async prewarm(references: SecretReference[]): Promise<void> {
    await Promise.all(
      references.map(ref => 
        this.resolve(ref).catch(err => {
          logger.warn('secret', `Failed to pre-warm ${ref.vault}/${ref.item}/${ref.field}: ${err.message}`);
        })
      )
    );
  }
}

// ============================================================================
// Custom Error
// ============================================================================

export class SecretResolutionError extends Error {
  constructor(
    message: string,
    public readonly code: string = 'UNKNOWN',
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'SecretResolutionError';
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalSecretManager: SecretManager | null = null;

export function getGlobalSecretManager(): SecretManager {
  if (!globalSecretManager) {
    globalSecretManager = new SecretManager();
  }
  return globalSecretManager;
}

export function resetGlobalSecretManager(): void {
  globalSecretManager = null;
}
