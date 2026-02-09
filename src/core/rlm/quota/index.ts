/**
 * Agent 67-69: Quota Module Index
 * Unified exports for user, team, and enterprise quota management
 */

export {
  UserQuotaManager,
  UserQuotaConfig,
  QuotaStatus,
  UsageRecord,
  QuotaViolation,
} from './user-quotas.js';

export {
  TeamQuotaManager,
  TeamQuotaConfig,
  TeamMember,
  ProjectAllocation,
  QuotaTransfer,
  TeamAnalytics,
} from './team-quotas.js';

export {
  EnterpriseQuotaManager,
  Organization,
  OrganizationSettings,
  CustomPolicy,
  PolicyRule,
  TenantIsolation,
  AdminAction,
  QuotaTemplate,
} from './enterprise-quotas.js';

// Re-export types with aliases to avoid naming conflicts
export type { QuotaStatus as UserQuotaStatus } from './user-quotas.js';
