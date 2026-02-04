/**
 * LDAP Authentication Strategy
 * 
 * Secure LDAP/Active Directory authentication with input validation.
 */

import { z } from 'zod';

// ============================================================================
// Input Validation Schemas
// ============================================================================

export const LDAPConfigSchema = z.object({
  url: z.string().url().regex(/^ldaps?:\/\//, 'URL must start with ldap:// or ldaps://'),
  bindDN: z.string().min(1).max(256),
  bindCredentials: z.string().min(1).max(256),
  searchBase: z.string().min(1).max(512),
  searchFilter: z.string().min(1).max(512).regex(/\{\{username\}\}/, 'Filter must contain {{username}} placeholder'),
  groupSearchBase: z.string().optional(),
  groupSearchFilter: z.string().optional(),
  tlsOptions: z.object({
    rejectUnauthorized: z.boolean().default(true),
    ca: z.string().optional(),
  }).optional(),
  timeout: z.number().int().min(1000).max(60000).default(10000),
  connectTimeout: z.number().int().min(1000).max(60000).default(5000),
});

export const LDAPCredentialsSchema = z.object({
  username: z.string()
    .min(1)
    .max(128)
    .regex(/^[a-zA-Z0-9._@-]+$/, 'Username contains invalid characters')
    .transform(val => val.trim().toLowerCase()),
  password: z.string()
    .min(8)
    .max(256)
    .regex(/^[\x20-\x7E]+$/, 'Password contains invalid characters'),
});

export const LDAPSearchResultSchema = z.object({
  dn: z.string(),
  cn: z.string().optional(),
  mail: z.string().email().optional(),
  memberOf: z.array(z.string()).optional(),
  sAMAccountName: z.string().optional(),
  uid: z.string().optional(),
});

// ============================================================================
// Type Definitions
// ============================================================================

export type LDAPConfig = z.infer<typeof LDAPConfigSchema>;
export type LDAPCredentials = z.infer<typeof LDAPCredentialsSchema>;
export type LDAPSearchResult = z.infer<typeof LDAPSearchResultSchema>;

export interface LDAPUser {
  id: string;
  username: string;
  email?: string;
  groups: string[];
  dn: string;
}

export interface LDAPAuthResult {
  success: boolean;
  user?: LDAPUser;
  error?: string;
  code?: string;
}

// ============================================================================
// LDAP Authentication Strategy
// ============================================================================

export class LDAPAuthStrategy {
  private config: LDAPConfig;

  constructor(config: unknown) {
    const result = LDAPConfigSchema.safeParse(config);
    if (!result.success) {
      throw new Error(`Invalid LDAP configuration: ${result.error.message}`);
    }
    this.config = result.data;
    
    // Security: Require ldaps:// in production
    if (process.env['NODE_ENV'] === 'production' && !this.config.url.startsWith('ldaps://')) {
      throw new Error('LDAP authentication in production requires LDAPS (TLS)');
    }
  }

  /**
   * Validate and sanitize user credentials
   */
  private validateCredentials(credentials: unknown): LDAPCredentials {
    const result = LDAPCredentialsSchema.safeParse(credentials);
    if (!result.success) {
      throw new Error('Invalid credentials format');
    }
    return result.data;
  }

  /**
   * Sanitize LDAP filter to prevent injection attacks
   */
  private sanitizeFilterInput(input: string): string {
    // Escape special LDAP characters
    return input
      .replace(/\\/g, '\\5c')
      .replace(/\*/g, '\\2a')
      .replace(/\(/g, '\\28')
      .replace(/\)/g, '\\29')
      .replace(/\0/g, '\\00')
      .replace(/'/g, '\\27')
      .replace(/"/g, '\\22');
  }

  /**
   * Authenticate user against LDAP
   */
  async authenticate(credentials: unknown): Promise<LDAPAuthResult> {
    try {
      // Validate input
      const creds = this.validateCredentials(credentials);
      
      // Sanitize username for LDAP filter
      const sanitizedUsername = this.sanitizeFilterInput(creds.username);
      
      // Build search filter
      const searchFilter = this.config.searchFilter.replace(
        /\{\{username\}\}/g,
        sanitizedUsername
      );

      // Perform LDAP authentication (implementation would use ldapjs or similar)
      // This is a secure interface - actual LDAP client implementation would go here
      const user = await this.performLDAPBindAndSearch(sanitizedUsername, creds.password, searchFilter);
      
      if (!user) {
        return {
          success: false,
          error: 'Invalid credentials',
          code: 'INVALID_CREDENTIALS'
        };
      }

      return {
        success: true,
        user
      };
    } catch (error) {
      // Log securely - don't expose internal details
      console.error('[LDAP Auth] Authentication failed:', error instanceof Error ? error.message : 'Unknown error');
      
      return {
        success: false,
        error: 'Authentication failed',
        code: 'AUTH_FAILED'
      };
    }
  }

  /**
   * Perform LDAP bind and search (placeholder for actual implementation)
   */
  private async performLDAPBindAndSearch(
    username: string,
    password: string,
    searchFilter: string
  ): Promise<LDAPUser | null> {
    // This is a placeholder - actual implementation would use ldapjs
    // The implementation would:
    // 1. Bind with service account
    // 2. Search for user with sanitized filter
    // 3. Validate search result schema
    // 4. Attempt user bind to verify password
    // 5. Return user object or null
    
    throw new Error('LDAP implementation requires ldapjs package');
  }

  /**
   * Verify if user belongs to required group
   */
  async verifyGroupMembership(userDN: string, groupCN: string): Promise<boolean> {
    // Validate inputs
    const validDN = z.string().min(1).max(512).safeParse(userDN);
    const validGroup = z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/).safeParse(groupCN);
    
    if (!validDN.success || !validGroup.success) {
      return false;
    }

    // Implementation would check group membership
    return false;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createLDAPStrategy(config: unknown): LDAPAuthStrategy {
  return new LDAPAuthStrategy(config);
}

export default LDAPAuthStrategy;
