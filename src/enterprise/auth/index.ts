/**
 * Enterprise Authentication Strategies
 * 
 * Secure authentication for enterprise environments.
 */

export { 
  LDAPAuthStrategy, 
  createLDAPStrategy,
  LDAPConfigSchema,
  LDAPCredentialsSchema,
  type LDAPConfig,
  type LDAPCredentials,
  type LDAPUser,
  type LDAPAuthResult,
} from './ldap';

export { 
  SAMLAuthStrategy, 
  createSAMLStrategy,
  SAMLConfigSchema,
  SAMLRequestSchema,
  type SAMLConfig,
  type SAMLRequest,
  type SAMLUser,
  type SAMLAuthResult,
} from './saml';

export { 
  OAuthAuthStrategy, 
  createOAuthStrategy,
  OAuthConfigSchema,
  OAuthStateSchema,
  OAuthTokenResponseSchema,
  OIDCUserInfoSchema,
  type OAuthConfig,
  type OAuthState,
  type OAuthUser,
  type OAuthAuthResult,
} from './oauth';
