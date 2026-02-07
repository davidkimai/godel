/**
 * Disaster Recovery Module
 * 
 * Godel Phase 7: Production Hardening
 * 
 * Provides comprehensive disaster recovery capabilities:
 * - Automated backups with verification
 * - Point-in-time recovery
 * - Operational runbooks
 * - Data integrity validation
 */

export { BackupManager, createFullBackup, createIncrementalBackup, scheduleBackups } from './backup';
export type {
  BackupConfig,
  BackupMetadata,
  BackupResult,
  BackupType,
  BackupScope,
} from './backup';

export { RestoreManager, restoreFromBackup, pointInTimeRecovery, postRestoreHealthCheck } from './restore';
export type {
  RestoreConfig,
  RestoreResult,
  RestoreMetadata,
} from './restore';

export {
  AllRunbooks,
  DatabaseFailureRunbook,
  ServiceOutageRunbooks,
  DataCorruptionRunbooks,
  executeStep,
  executeRunbook,
} from './runbooks';

export type {
  Runbook,
  RunbookStep,
} from './runbooks';

// Re-export runbook types for convenience
export {
  CompleteOutageRunbook,
  PartialDegradationRunbook,
  CascadeFailureRunbook,
} from './runbooks/service-outage';

export {
  DataCorruptionRunbook,
  PartialDataLossRunbook,
  ReplicationLagRunbook,
} from './runbooks/data-corruption';
