/**
 * OAuth/OIDC Authentication Module
 * 
 * Provides OAuth 2.0 and OpenID Connect integration for enterprise SSO.
 * Supports authorization code flow, PKCE, token refresh, and userinfo retrieval.
 */

import { EventEmitter } from 'events';
import { createHash, randomBytes, createVerify } from 'crypto';
import { IncomingMessage, ServerResponse } from 'http';

// Types
export interface OAuthConfig {
  // Provider endpoints
  authorizationURL: string;
  tokenURL: string;
  userInfoURL?: string;
  revocationURL?: string;
  jwksURL?: string;
  
  // Client credentials
  clientID: string;
  clientSecret: string;
  
  // Redirect and scopes
  callbackURL: string;
  scope: string[];
  
  // PKCE settings
  usePKCE?: boolean;
  pkceMethod?: 'S256' | 'plain';
  
  // Security settings
  state?: boolean;
  nonce?: boolean;
  
  // Additional parameters
  authorizationParams?: Record<string, string>;
}

export interface OAuthTokenSet {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  id_token?: string;
  expires_at?: number;
}

export interface OIDCUser {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  groups?: string[];
  roles?: string[];
  [key: string]: unknown;
}

export interface OAuthAuthResult {
  success: boolean;
  tokens?: OAuthTokenSet;
  user?: OIDCUser;
  error?: string;
  error_description?: string;
}

export interface AuthorizationURLResult {
  url: string;
  state?: string;
  codeVerifier?: string;
  nonce?: string;
}

export interface TokenIntrospectionResult {
  active: boolean;
  scope?: string;
  client_id?: string;
  username?: string;
  token_type?: string;
  exp?: number;
  iat?: number;
  sub?: string;
  [key: string]: unknown;
}

export interface JWTClaims {
  iss?: string;
  sub?: string;
  aud?: string | string[];
  exp?: number;
  iat?: number;
  auth_time?: number;
  nonce?: string;
  at_hash?: string;
  c_hash?: string;
  [key: string]: unknown;
}

/**
 * OAuth/OIDC Authentication Provider
 */
export class OAuthAuthProvider extends EventEmitter {
  private config: OAuthConfig;
  private stateStore: Map<string, { 
    timestamp: number; 
    codeVerifier?: string; 
    nonce?: string;
    redirectUri: string;
  }> = new Map();
  private jwksCache: Map<string, { key: string; expires: number }> = new Map();

  constructor(config: OAuthConfig) {
    super();
    this.config = {
      usePKCE: true,
      pkceMethod: 'S256',
      state: true,
      nonce: true,
      scope: ['openid', 'profile', 'email'],
      ...config,
    };
    
    // Start cleanup interval
    this.startCleanupInterval();
  }

  /**
   * Generate authorization URL for OAuth flow
   */
  generateAuthorizationURL(redirectUri?: string): AuthorizationURLResult {
    const state = this.config.state ? this.generateState() : undefined;
    const nonce = this.config.nonce ? this.generateNonce() : undefined;
    let codeVerifier: string | undefined;

    // Generate PKCE parameters
    if (this.config.usePKCE) {
      codeVerifier = this.generateCodeVerifier();
    }

    // Build authorization URL
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientID,
      redirect_uri: redirectUri || this.config.callbackURL,
      scope: this.config.scope.join(' '),
    });

    if (state) {
      params.append('state', state);
    }

    if (nonce) {
      params.append('nonce', nonce);
    }

    if (codeVerifier) {
      const codeChallenge = this.generateCodeChallenge(codeVerifier);
      params.append('code_challenge', codeChallenge);
      params.append('code_challenge_method', this.config.pkceMethod || 'S256');
    }

    // Add custom authorization params
    if (this.config.authorizationParams) {
      for (const [key, value] of Object.entries(this.config.authorizationParams)) {
        params.append(key, value);
      }
    }

    // Store state for validation
    if (state) {
      this.stateStore.set(state, {
        timestamp: Date.now(),
        codeVerifier,
        nonce,
        redirectUri: redirectUri || this.config.callbackURL,
      });
    }

    const url = `${this.config.authorizationURL}?${params.toString()}`;

    this.emit('authorization:url', { hasState: !!state, hasPKCE: !!codeVerifier });

    return { url, state, codeVerifier, nonce };
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCode(
    code: string, 
    state?: string, 
    redirectUri?: string
  ): Promise<OAuthAuthResult> {
    const traceId = randomBytes(8).toString('hex');

    try {
      this.emit('token:exchange', { traceId, hasState: !!state });

      // Validate state
      let stateData: { 
        codeVerifier?: string; 
        nonce?: string;
        redirectUri: string;
      } | undefined;

      if (this.config.state && state) {
        stateData = this.stateStore.get(state);
        if (!stateData) {
          this.emit('token:error', { traceId, error: 'invalid_state' });
          return { success: false, error: 'Invalid or expired state parameter' };
        }
        this.stateStore.delete(state);
      }

      // Prepare token request
      const params = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: this.config.clientID,
        client_secret: this.config.clientSecret,
        redirect_uri: redirectUri || stateData?.redirectUri || this.config.callbackURL,
      });

      // Add PKCE verifier
      if (stateData?.codeVerifier) {
        params.append('code_verifier', stateData.codeVerifier);
      }

      // Make token request
      const tokenResponse = await this.makeTokenRequest(params);

      if (!tokenResponse.success) {
        this.emit('token:error', { traceId, error: tokenResponse.error });
        return tokenResponse;
      }

      // Validate ID token if present
      if (tokenResponse.tokens?.id_token && this.config.nonce) {
        const idTokenValid = await this.validateIDToken(
          tokenResponse.tokens.id_token, 
          stateData?.nonce
        );
        
        if (!idTokenValid) {
          this.emit('token:error', { traceId, error: 'invalid_id_token' });
          return { success: false, error: 'ID token validation failed' };
        }
      }

      // Calculate expiration time
      if (tokenResponse.tokens?.expires_in) {
        tokenResponse.tokens.expires_at = Date.now() + (tokenResponse.tokens.expires_in * 1000);
      }

      this.emit('token:success', { traceId, hasRefresh: !!tokenResponse.tokens?.refresh_token });

      return tokenResponse;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Token exchange failed';
      this.emit('token:error', { traceId, error: errorMessage });
      return { success: false, error: 'Authentication failed' };
    }
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken: string): Promise<OAuthAuthResult> {
    const traceId = randomBytes(8).toString('hex');

    try {
      this.emit('token:refresh', { traceId });

      const params = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: this.config.clientID,
        client_secret: this.config.clientSecret,
      });

      const response = await this.makeTokenRequest(params);

      if (response.success && response.tokens) {
        // Preserve refresh token if not returned
        if (!response.tokens.refresh_token) {
          response.tokens.refresh_token = refreshToken;
        }
        
        if (response.tokens.expires_in) {
          response.tokens.expires_at = Date.now() + (response.tokens.expires_in * 1000);
        }
      }

      this.emit('token:refresh:result', { traceId, success: response.success });
      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Token refresh failed';
      this.emit('token:refresh:error', { traceId, error: errorMessage });
      return { success: false, error: 'Token refresh failed' };
    }
  }

  /**
   * Get user info from UserInfo endpoint
   */
  async getUserInfo(accessToken: string): Promise<{ success: boolean; user?: OIDCUser; error?: string }> {
    if (!this.config.userInfoURL) {
      return { success: false, error: 'UserInfo endpoint not configured' };
    }

    try {
      const response = await fetch(this.config.userInfoURL, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as { error_description?: string };
        return { 
          success: false, 
          error: errorData.error_description || `UserInfo request failed: ${response.status}` 
        };
      }

      const userData = await response.json() as OIDCUser;

      // Normalize groups/roles
      if (userData.groups && !Array.isArray(userData.groups)) {
        userData.groups = [String(userData.groups)];
      }
      if (userData.roles && !Array.isArray(userData.roles)) {
        userData.roles = [String(userData.roles)];
      }

      return { success: true, user: userData };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'UserInfo request failed';
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Introspect token
   */
  async introspectToken(token: string, tokenTypeHint?: string): Promise<TokenIntrospectionResult> {
    if (!this.config.revocationURL) {
      return { active: false };
    }

    try {
      const params = new URLSearchParams({
        token,
        client_id: this.config.clientID,
        client_secret: this.config.clientSecret,
      });

      if (tokenTypeHint) {
        params.append('token_type_hint', tokenTypeHint);
      }

      const response = await fetch(this.config.revocationURL.replace('revoke', 'introspect'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        body: params.toString(),
      });

      if (!response.ok) {
        return { active: false };
      }

      return await response.json() as TokenIntrospectionResult;
    } catch (error) {
      return { active: false };
    }
  }

  /**
   * Revoke token
   */
  async revokeToken(token: string, tokenTypeHint?: string): Promise<boolean> {
    if (!this.config.revocationURL) {
      return false;
    }

    try {
      const params = new URLSearchParams({
        token,
        client_id: this.config.clientID,
        client_secret: this.config.clientSecret,
      });

      if (tokenTypeHint) {
        params.append('token_type_hint', tokenTypeHint);
      }

      const response = await fetch(this.config.revocationURL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      return response.ok;
    } catch (error) {
      return false;
    }
  }

  /**
   * Validate access token
   */
  async validateToken(accessToken: string): Promise<{ valid: boolean; claims?: JWTClaims; error?: string }> {
    try {
      // Try to decode as JWT first
      const parts = accessToken.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString()) as JWTClaims;
        
        // Check expiration
        if (payload.exp && Date.now() >= payload.exp * 1000) {
          return { valid: false, error: 'Token expired' };
        }

        return { valid: true, claims: payload };
      }

      // Otherwise try introspection
      const introspection = await this.introspectToken(accessToken);
      return { valid: introspection.active, claims: introspection as JWTClaims };
    } catch (error) {
      return { valid: false, error: 'Token validation failed' };
    }
  }

  /**
   * Make token request
   */
  private async makeTokenRequest(params: URLSearchParams): Promise<OAuthAuthResult> {
    try {
      const response = await fetch(this.config.tokenURL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        body: params.toString(),
      });

      const data = await response.json() as OAuthTokenSet & { error?: string; error_description?: string; [key: string]: unknown };

      if (!response.ok || data.error) {
        return {
          success: false,
          error: data.error || 'token_request_failed',
          error_description: data.error_description,
        };
      }

      return {
        success: true,
        tokens: data,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Token request failed';
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Validate ID token
   */
  private async validateIDToken(idToken: string, expectedNonce?: string): Promise<boolean> {
    try {
      const parts = idToken.split('.');
      if (parts.length !== 3) {
        return false;
      }

      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString()) as JWTClaims;

      // Check issuer
      // In production, validate against expected issuer

      // Check audience
      const audience = payload.aud;
      if (Array.isArray(audience)) {
        if (!audience.includes(this.config.clientID)) {
          return false;
        }
      } else if (audience !== this.config.clientID) {
        return false;
      }

      // Check expiration
      if (payload.exp && Date.now() >= payload.exp * 1000) {
        return false;
      }

      // Check issued at
      if (payload.iat && payload.iat > Math.floor(Date.now() / 1000) + 60) {
        return false;
      }

      // Check nonce
      if (expectedNonce && payload.nonce !== expectedNonce) {
        return false;
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Generate state parameter
   */
  private generateState(): string {
    return randomBytes(16).toString('base64url');
  }

  /**
   * Generate nonce
   */
  private generateNonce(): string {
    return randomBytes(16).toString('base64url');
  }

  /**
   * Generate PKCE code verifier
   */
  private generateCodeVerifier(): string {
    return randomBytes(32).toString('base64url');
  }

  /**
   * Generate PKCE code challenge
   */
  private generateCodeChallenge(verifier: string): string {
    if (this.config.pkceMethod === 'plain') {
      return verifier;
    }
    
    return createHash('sha256')
      .update(verifier)
      .digest('base64url');
  }

  /**
   * Start cleanup interval for expired states
   */
  private startCleanupInterval(): void {
    setInterval(() => {
      const now = Date.now();
      const expiration = 600000; // 10 minutes
      
      for (const [state, data] of this.stateStore.entries()) {
        if (now - data.timestamp > expiration) {
          this.stateStore.delete(state);
        }
      }

      // Clean up JWKS cache
      for (const [kid, data] of this.jwksCache.entries()) {
        if (now > data.expires) {
          this.jwksCache.delete(kid);
        }
      }
    }, 60000);
  }

  /**
   * Close provider and cleanup
   */
  close(): void {
    this.stateStore.clear();
    this.jwksCache.clear();
    this.removeAllListeners();
  }
}

// Factory function
export function createOAuthProvider(config: OAuthConfig): OAuthAuthProvider {
  return new OAuthAuthProvider(config);
}

export default OAuthAuthProvider;
