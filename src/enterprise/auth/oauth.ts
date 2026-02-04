/**
 * OAuth/OIDC Authentication Strategy
 * 
 * Secure OAuth 2.0 and OpenID Connect authentication with input validation.
 */

import { z } from 'zod';

// ============================================================================
// Input Validation Schemas
// ============================================================================

export const OAuthConfigSchema = z.object({
  // Provider Configuration
  provider: z.enum(['google', 'github', 'microsoft', 'okta', 'auth0', 'custom']),
  clientId: z.string().min(1).max(256),
  clientSecret: z.string().min(1).max(256),
  
  // URLs
  authorizationURL: z.string().url().max(512).optional(),
  tokenURL: z.string().url().max(512).optional(),
  userInfoURL: z.string().url().max(512).optional(),
  issuer: z.string().url().max(512).optional(),
  
  // Callback and Scopes
  callbackURL: z.string().url().max(512),
  scope: z.array(z.string()).default(['openid', 'profile', 'email']),
  
  // OIDC Settings
  validateIssuer: z.boolean().default(true),
  validateAudience: z.boolean().default(true),
  requireNonce: z.boolean().default(true),
  
  // PKCE
  usePKCE: z.boolean().default(true),
  pkceMethod: z.enum(['S256', 'plain']).default('S256'),
  
  // State Parameter
  stateLength: z.number().int().min(32).max(128).default(32),
  stateTimeoutMs: z.number().int().min(60000).max(600000).default(300000),
  
  // Security
  allowedDomains: z.array(z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/)).optional(),
  allowedEmails: z.array(z.string().email()).optional(),
  requireVerifiedEmail: z.boolean().default(true),
  
  // Timeout Settings
  requestTimeout: z.number().int().min(5000).max(60000).default(30000),
  
  // Proxy Settings
  proxy: z.string().url().optional(),
});

export const OAuthStateSchema = z.object({
  state: z.string().min(32).max(256),
  nonce: z.string().min(32).max(256),
  redirectUrl: z.string().url().max(512).optional(),
  createdAt: z.number().int(),
});

export const OAuthTokenResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.enum(['Bearer', 'bearer']),
  expires_in: z.number().int().optional(),
  refresh_token: z.string().optional(),
  id_token: z.string().optional(),
  scope: z.string().optional(),
});

export const OIDCUserInfoSchema = z.object({
  sub: z.string(),
  email: z.string().email().optional(),
  email_verified: z.boolean().optional(),
  name: z.string().optional(),
  given_name: z.string().optional(),
  family_name: z.string().optional(),
  picture: z.string().url().optional(),
  groups: z.array(z.string()).optional(),
  roles: z.array(z.string()).optional(),
  // Allow additional OIDC claims
}).catchall(z.unknown());

export const OAuthCallbackParamsSchema = z.object({
  code: z.string().min(10).max(512),
  state: z.string().min(32).max(256),
  error: z.string().optional(),
  error_description: z.string().optional(),
});

// ============================================================================
// Type Definitions
// ============================================================================

export type OAuthConfig = z.infer<typeof OAuthConfigSchema>;
export type OAuthState = z.infer<typeof OAuthStateSchema>;
export type OAuthTokenResponse = z.infer<typeof OAuthTokenResponseSchema>;
export type OIDCUserInfo = z.infer<typeof OIDCUserInfoSchema>;
export type OAuthCallbackParams = z.infer<typeof OAuthCallbackParamsSchema>;

export interface OAuthUser {
  id: string;
  provider: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  firstName?: string;
  lastName?: string;
  picture?: string;
  groups?: string[];
  roles?: string[];
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
}

export interface OAuthAuthResult {
  success: boolean;
  user?: OAuthUser;
  error?: string;
  code?: string;
}

export interface OAuthAuthorizeUrl {
  url: string;
  state: string;
  nonce: string;
}

// ============================================================================
// OAuth Authentication Strategy
// ============================================================================

export class OAuthAuthStrategy {
  private config: OAuthConfig;
  private stateStore: Map<string, OAuthState> = new Map();

  constructor(config: unknown) {
    const result = OAuthConfigSchema.safeParse(config);
    if (!result.success) {
      throw new Error(`Invalid OAuth configuration: ${result.error.message}`);
    }
    this.config = result.data;

    // Security: Enforce HTTPS in production
    if (process.env.NODE_ENV === 'production') {
      if (!this.config.callbackURL.startsWith('https://')) {
        throw new Error('OAuth callback URL must use HTTPS in production');
      }
    }

    // Set provider-specific defaults
    this.applyProviderDefaults();
  }

  /**
   * Apply provider-specific configuration defaults
   */
  private applyProviderDefaults(): void {
    const providerUrls: Record<string, { auth?: string; token?: string; userInfo?: string; issuer?: string }> = {
      google: {
        auth: 'https://accounts.google.com/o/oauth2/v2/auth',
        token: 'https://oauth2.googleapis.com/token',
        userInfo: 'https://openidconnect.googleapis.com/v1/userinfo',
        issuer: 'https://accounts.google.com',
      },
      github: {
        auth: 'https://github.com/login/oauth/authorize',
        token: 'https://github.com/login/oauth/access_token',
        userInfo: 'https://api.github.com/user',
      },
      microsoft: {
        auth: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
        token: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
        userInfo: 'https://graph.microsoft.com/v1.0/me',
        issuer: 'https://login.microsoftonline.com',
      },
    };

    const defaults = providerUrls[this.config.provider];
    if (defaults) {
      this.config.authorizationURL = this.config.authorizationURL || defaults.auth;
      this.config.tokenURL = this.config.tokenURL || defaults.token;
      this.config.userInfoURL = this.config.userInfoURL || defaults.userInfo;
      this.config.issuer = this.config.issuer || defaults.issuer;
    }

    // Validate required URLs for custom providers
    if (this.config.provider === 'custom') {
      if (!this.config.authorizationURL || !this.config.tokenURL) {
        throw new Error('Custom OAuth provider requires authorizationURL and tokenURL');
      }
    }
  }

  /**
   * Generate authorization URL
   */
  async generateAuthorizationURL(redirectUrl?: string): Promise<OAuthAuthorizeUrl> {
    // Validate redirect URL if provided
    let validRedirect: string | undefined;
    if (redirectUrl) {
      const result = z.string().url().max(512).safeParse(redirectUrl);
      if (result.success) {
        validRedirect = result.data;
      }
    }

    // Generate secure state and nonce
    const state = this.generateSecureState();
    const nonce = this.config.requireNonce ? this.generateSecureState() : '';

    // Store state for validation
    const stateData: OAuthState = {
      state,
      nonce,
      redirectUrl: validRedirect,
      createdAt: Date.now(),
    };
    this.stateStore.set(state, stateData);

    // Clean up expired states
    this.cleanupExpiredStates();

    // Build authorization URL
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.callbackURL,
      response_type: 'code',
      scope: this.config.scope.join(' '),
      state,
    });

    if (nonce) {
      params.append('nonce', nonce);
    }

    if (this.config.usePKCE) {
      const codeChallenge = await this.generatePKCEChallenge(state);
      params.append('code_challenge', codeChallenge);
      params.append('code_challenge_method', this.config.pkceMethod);
    }

    const url = `${this.config.authorizationURL}?${params.toString()}`;

    return { url, state, nonce };
  }

  /**
   * Handle OAuth callback
   */
  async handleCallback(params: unknown): Promise<OAuthAuthResult> {
    try {
      // Validate callback parameters
      const callbackParams = this.validateCallbackParams(params);
      
      // Check for OAuth error
      if (callbackParams.error) {
        return {
          success: false,
          error: callbackParams.error_description || callbackParams.error,
          code: 'OAUTH_ERROR'
        };
      }

      // Validate state to prevent CSRF
      const stateData = this.stateStore.get(callbackParams.state);
      if (!stateData) {
        return {
          success: false,
          error: 'Invalid or expired state',
          code: 'INVALID_STATE'
        };
      }

      // Check state expiration
      if (Date.now() - stateData.createdAt > this.config.stateTimeoutMs) {
        this.stateStore.delete(callbackParams.state);
        return {
          success: false,
          error: 'State expired',
          code: 'STATE_EXPIRED'
        };
      }

      // Remove used state
      this.stateStore.delete(callbackParams.state);

      // Exchange code for tokens
      const tokens = await this.exchangeCodeForTokens(callbackParams.code, stateData);
      
      // Get user info
      const userInfo = await this.getUserInfo(tokens);
      
      // Validate user
      const validation = this.validateUser(userInfo);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error,
          code: 'USER_VALIDATION_FAILED'
        };
      }

      // Build user object
      const user = this.buildUser(userInfo, tokens);

      return {
        success: true,
        user
      };
    } catch (error) {
      console.error('[OAuth Auth] Callback handling failed:', error instanceof Error ? error.message : 'Unknown error');
      
      return {
        success: false,
        error: 'Authentication failed',
        code: 'AUTH_FAILED'
      };
    }
  }

  /**
   * Validate callback parameters
   */
  private validateCallbackParams(params: unknown): OAuthCallbackParams {
    const result = OAuthCallbackParamsSchema.safeParse(params);
    if (!result.success) {
      throw new Error('Invalid callback parameters');
    }
    return result.data;
  }

  /**
   * Generate cryptographically secure state/nonce
   */
  private generateSecureState(): string {
    const crypto = require('crypto');
    return crypto.randomBytes(this.config.stateLength).toString('base64url');
  }

  /**
   * Generate PKCE code challenge
   */
  private async generatePKCEChallenge(verifier: string): Promise<string> {
    const crypto = require('crypto');
    
    if (this.config.pkceMethod === 'S256') {
      return crypto
        .createHash('sha256')
        .update(verifier)
        .digest('base64url');
    }
    
    return verifier; // plain method
  }

  /**
   * Exchange authorization code for tokens
   */
  private async exchangeCodeForTokens(code: string, stateData: OAuthState): Promise<OAuthTokenResponse> {
    // Implementation would use fetch or axios to call token endpoint
    // This is a secure interface - actual implementation would go here
    throw new Error('OAuth implementation requires HTTP client');
  }

  /**
   * Get user info from IdP
   */
  private async getUserInfo(tokens: OAuthTokenResponse): Promise<OIDCUserInfo> {
    // Implementation would call userInfo endpoint with access token
    throw new Error('OAuth implementation requires HTTP client');
  }

  /**
   * Validate user against allowed domains/emails
   */
  private validateUser(userInfo: OIDCUserInfo): { valid: boolean; error?: string } {
    // Check email verification
    if (this.config.requireVerifiedEmail && userInfo.email && !userInfo.email_verified) {
      return { valid: false, error: 'Email not verified' };
    }

    // Check allowed domains
    if (this.config.allowedDomains && userInfo.email) {
      const domain = userInfo.email.split('@')[1];
      if (!this.config.allowedDomains.includes(domain)) {
        return { valid: false, error: 'Domain not allowed' };
      }
    }

    // Check allowed emails
    if (this.config.allowedEmails && userInfo.email) {
      if (!this.config.allowedEmails.includes(userInfo.email)) {
        return { valid: false, error: 'Email not allowed' };
      }
    }

    return { valid: true };
  }

  /**
   * Build user object from user info
   */
  private buildUser(userInfo: OIDCUserInfo, tokens: OAuthTokenResponse): OAuthUser {
    const expiresAt = tokens.expires_in 
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : undefined;

    return {
      id: userInfo.sub,
      provider: this.config.provider,
      email: userInfo.email || '',
      emailVerified: userInfo.email_verified || false,
      name: userInfo.name,
      firstName: userInfo.given_name,
      lastName: userInfo.family_name,
      picture: userInfo.picture,
      groups: userInfo.groups,
      roles: userInfo.roles,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt,
    };
  }

  /**
   * Clean up expired states
   */
  private cleanupExpiredStates(): void {
    const now = Date.now();
    Array.from(this.stateStore.entries()).forEach(([key, state]) => {
      if (now - state.createdAt > this.config.stateTimeoutMs) {
        this.stateStore.delete(key);
      }
    });
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createOAuthStrategy(config: unknown): OAuthAuthStrategy {
  return new OAuthAuthStrategy(config);
}

export default OAuthAuthStrategy;
