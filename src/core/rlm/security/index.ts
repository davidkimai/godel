/**
 * Agent 70-72: Security Module Index
 * Unified exports for security audit and hardening
 */

// Penetration Testing
export type {
  Vulnerability,
  PenetrationTestResult,
} from '../../../../security/penetration-tests/rlm-penetration.test.js';

// Compliance
export {
  SOC2ComplianceValidator,
  type TrustServiceCriteria,
  type ComplianceControl,
  type DataIsolationTest,
  type EncryptionValidation,
  type ComplianceReport,
  type ComplianceFinding,
} from '../../../../security/compliance/soc2-validation.js';

// Hardening
export {
  SecurityHardening,
  type SecurityPolicy,
  type SecurityRule,
  type SanitizationConfig,
  type PrivilegeLevel,
  type SecurityEvent,
} from '../../../../security/hardening/rlm-hardening.js';
