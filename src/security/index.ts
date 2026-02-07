/**
 * Godel Security Module
 * 
 * Enterprise-grade security features for SOC2 compliance:
 * - SSO integration (LDAP, SAML, OAuth/OIDC)
 * - Role-based access control (RBAC)
 * - Comprehensive audit logging
 * - PII detection and masking
 * - Data encryption at rest and in transit
 */

// Authentication
export { LDAPAuthProvider, createLDAPProvider } from './auth/ldap';
export type {
  LDAPConfig,
  LDAPUser,
  LDAPAuthResult,
  LDAPConnectionPool,
} from './auth/ldap';

export { SAMLAuthProvider, createSAMLProvider } from './auth/saml';
export type {
  SAMLConfig,
  SAMLUser,
  SAMLAuthResult,
  SAMLRequest,
  SAMLResponse,
  SAMLAssertion,
} from './auth/saml';

export { OAuthAuthProvider, createOAuthProvider } from './auth/oauth';
export type {
  OAuthConfig,
  OAuthTokenSet,
  OIDCUser,
  OAuthAuthResult,
  AuthorizationURLResult,
  TokenIntrospectionResult,
  JWTClaims,
} from './auth/oauth';

// RBAC
export {
  RoleManager,
  getRoleManager,
  createRoleManager,
  DEFAULT_ROLES,
  ROLE_HIERARCHY,
} from './rbac/roles';
export type {
  Role,
  RoleType,
  RoleAssignment,
  RoleHierarchy,
} from './rbac/roles';

export {
  PermissionManager,
  getPermissionManager,
  createPermissionManager,
  SYSTEM_PERMISSIONS,
  NAMESPACE_DISPLAY_NAMES,
} from './rbac/permissions';
export type {
  Permission,
  PermissionNamespace,
  PermissionAction,
  PermissionScope,
  PermissionString,
  PermissionGroup,
} from './rbac/permissions';

export {
  RBACMiddleware,
  createRBACMiddleware,
  rbac,
} from './rbac/middleware';
export type {
  AuthenticatedRequest,
  RBACMiddlewareOptions,
} from './rbac/middleware';

// Audit
export {
  AuditLogger,
  getAuditLogger,
  createAuditLogger,
  AuditEventBuilder,
} from './audit/logger';
export type {
  AuditLoggerConfig,
  AuditQueryFilters,
  AuditStorageBackend,
} from './audit/logger';

export {
  getEventTypeDefinition,
  getEventSeverity,
  getEventCategory,
  requiresPIIMasking,
  getRetentionDays,
  isValidEventType,
  isValidCategory,
  isValidSeverity,
  isValidStatus,
  filterEventsByCategory,
  filterEventsBySeverity,
  filterEventsByTimeRange,
  filterEventsByActor,
  filterEventsByResource,
  SEVERITY_COLORS,
  SEVERITY_ICONS,
  ALL_EVENT_TYPES,
  ALL_CATEGORIES,
  ALL_SEVERITIES,
  ALL_STATUSES,
} from './audit/events';
export type {
  AuditEvent,
  AuditEventCategory,
  AuditSeverity,
  AuditEventStatus,
  AnyAuditEvent,
  AuthAuditEvent,
  AuthzAuditEvent,
  DataAccessAuditEvent,
  DataModificationAuditEvent,
  SystemAuditEvent,
  SecurityAuditEvent,
  ComplianceAuditEvent,
  AuditEventTypeDefinition,
} from './audit/events';

// PII
export {
  PIIDetector,
  getPIIDetector,
  createPIIDetector,
} from './pii/detector';
export type {
  PIIType,
  PIISeverity,
  PIIDetection,
  DetectionOptions,
  CustomPattern,
  ScanResult,
} from './pii/detector';

export {
  PIIMasker,
  getPIIMasker,
  createPIIMasker,
  DEFAULT_MASKING_RULES,
} from './pii/masker';
export type {
  MaskingStrategy,
  MaskingOptions,
  MaskingRule,
} from './pii/masker';

// Encryption
export {
  EncryptionService,
  InMemoryKeyManager,
  getEncryptionService,
  createEncryptionService,
  createTLSConfig,
} from './encryption';
export type {
  EncryptionAlgorithm,
  HashAlgorithm,
  KeyDerivationMethod,
  EncryptionResult,
  KeyMetadata,
  EncryptionConfig,
  KeyManager,
  TLSConfig,
} from './encryption';
