/**
 * Data Corruption Runbook
 * 
 * Procedures for handling and recovering from data corruption.
 */

import { Runbook } from './database-failure';

/**
 * Data Corruption Runbook
 * 
 * Use when: Data integrity issues are detected
 * Impact: Potential data loss or inconsistency
 * SLA Target: Zero data loss, recovery within 1 hour
 */
export const DataCorruptionRunbook: Runbook = {
  id: 'data-corruption-001',
  title: 'Data Corruption Recovery',
  severity: 'critical',
  description: 'Procedures for recovering from data corruption while minimizing data loss',
  prerequisites: [
    'Backup storage access',
    'Database admin privileges',
    'Point-in-time recovery capability',
    'Data validation scripts',
  ],
  steps: [
    {
      id: '1',
      title: 'Stop the Bleeding',
      description: 'Immediately prevent further corruption',
      command: 'kubectl scale deployment godel-api --replicas=0',
      verification: 'No new writes are occurring',
    },
    {
      id: '2',
      title: 'Assess Corruption Scope',
      description: 'Determine which tables/records are affected',
      command: 'ts-node scripts/check-data-integrity.ts',
      verification: 'Corruption report generated',
    },
    {
      id: '3',
      title: 'Preserve Evidence',
      description: 'Create forensic copy of corrupted data',
      command: 'pg_dump corrupted_db > /forensics/corrupted-$(date +%s).sql',
      verification: 'Forensic backup exists',
    },
    {
      id: '4',
      title: 'Identify Corruption Time',
      description: 'Find when corruption started',
      command: 'ts-node scripts/find-corruption-start.ts',
      verification: 'Corruption timestamp identified',
    },
    {
      id: '5',
      title: 'Find Clean Backup',
      description: 'Identify last verified clean backup',
      command: 'ts-node scripts/find-clean-backup.ts --before=<corruption-time>',
      verification: 'Clean backup ID identified',
    },
    {
      id: '6',
      title: 'Extract Valid Transactions',
      description: 'Get transactions after backup but before corruption',
      command: 'ts-node scripts/extract-valid-transactions.ts --start=<backup-time> --end=<corruption-time>',
      verification: 'Transaction list generated',
    },
    {
      id: '7',
      title: 'Restore Clean Backup',
      description: 'Restore to the clean backup point',
      command: 'ts-node scripts/restore.ts --backup=<clean-backup-id>',
      verification: 'Database restored to clean state',
    },
    {
      id: '8',
      title: 'Replay Valid Transactions',
      description: 'Apply valid transactions to catch up',
      command: 'ts-node scripts/replay-transactions.ts --file=valid-transactions.json',
      verification: 'All valid transactions applied',
    },
    {
      id: '9',
      title: 'Verify Data Integrity',
      description: 'Comprehensive integrity check',
      command: 'ts-node scripts/full-integrity-check.ts',
      verification: 'All checks pass',
    },
    {
      id: '10',
      title: 'Gradual Service Restoration',
      description: 'Bring services back online',
      command: 'kubectl scale deployment godel-api --replicas=1',
      verification: 'Service healthy with 1 replica',
    },
  ],
  postActions: [
    'Scale up gradually while monitoring',
    'Document root cause',
    'Review backup frequency',
    'Implement additional monitoring',
    'Consider point-in-time recovery automation',
  ],
};

/**
 * Partial Data Loss Runbook
 * 
 * Use when: Some data is missing but system is operational
 * Impact: Incomplete records, potential business impact
 * SLA Target: Recovery or compensation within 4 hours
 */
export const PartialDataLossRunbook: Runbook = {
  id: 'data-loss-001',
  title: 'Partial Data Loss Recovery',
  severity: 'high',
  description: 'Procedures for recovering from partial data loss',
  prerequisites: [
    'Access to application logs',
    'Backup storage access',
    'Event sourcing capabilities',
  ],
  steps: [
    {
      id: '1',
      title: 'Identify Missing Data',
      description: 'Determine what data is lost',
      command: 'ts-node scripts/identify-missing-data.ts',
      verification: 'Missing data scope documented',
    },
    {
      id: '2',
      title: 'Check Event Log',
      description: 'Look for events that can reconstruct data',
      command: 'ts-node scripts/query-event-log.ts --time-range=<window>',
      verification: 'Relevant events found',
    },
    {
      id: '3',
      title: 'Check Application Logs',
      description: 'Extract data from application logs',
      command: 'grep "CREATE\|UPDATE" /var/log/godel/*.log | grep <time-range>',
      verification: 'Log entries identified',
    },
    {
      id: '4',
      title: 'Reconstruct from Events',
      description: 'Replay events to reconstruct lost data',
      command: 'ts-node scripts/reconstruct-from-events.ts',
      verification: 'Data reconstructed',
    },
    {
      id: '5',
      title: 'Validate Reconstructed Data',
      description: 'Verify reconstructed data integrity',
      command: 'ts-node scripts/validate-reconstructed-data.ts',
      verification: 'Validation passes',
    },
    {
      id: '6',
      title: 'Merge with Current Data',
      description: 'Integrate reconstructed data',
      command: 'ts-node scripts/merge-data.ts',
      verification: 'Data merged successfully',
    },
    {
      id: '7',
      title: 'Notify Affected Users',
      description: 'Communicate about data loss',
      command: 'ts-node scripts/identify-affected-users.ts',
      verification: 'User list generated',
    },
  ],
  postActions: [
    'Send notifications to affected users',
    'Document data loss scope',
    'Review data durability measures',
    'Consider additional replication',
  ],
};

/**
 * Replication Lag Runbook
 * 
 * Use when: Primary-replica lag is causing issues
 * Impact: Stale reads, potential split-brain
 * SLA Target: Resolution within 10 minutes
 */
export const ReplicationLagRunbook: Runbook = {
  id: 'repl-lag-001',
  title: 'Replication Lag Resolution',
  severity: 'high',
  description: 'Procedures for resolving replication lag issues',
  prerequisites: [
    'Database admin access',
    'Read replica access',
  ],
  steps: [
    {
      id: '1',
      title: 'Check Replication Status',
      description: 'Measure current lag',
      command: 'psql -c "SELECT * FROM pg_stat_replication;"',
      verification: 'Lag time identified',
    },
    {
      id: '2',
      title: 'Check Replica Resources',
      description: 'Verify replica has sufficient resources',
      command: 'kubectl top pod -l app=postgres-replica',
      verification: 'CPU/Memory status known',
    },
    {
      id: '3',
      title: 'Check Network',
      description: 'Verify network between primary and replica',
      command: 'ping <replica-ip>',
      verification: 'Network latency measured',
    },
    {
      id: '4',
      title: 'Check Long Queries',
      description: 'Identify blocking queries on replica',
      command: 'psql -c "SELECT * FROM pg_stat_activity WHERE state != \'idle\';"',
      verification: 'Long queries identified',
    },
    {
      id: '5',
      title: 'Kill Blocking Queries',
      description: 'Terminate long-running queries if safe',
      command: 'psql -c "SELECT pg_terminate_backend(<pid>);"',
      verification: 'Queries terminated',
    },
    {
      id: '6',
      title: 'Redirect Reads to Primary',
      description: 'Temporarily use primary for reads',
      command: 'kubectl apply -f k8s/read-from-primary.yaml',
      verification: 'Reads going to primary',
    },
    {
      id: '7',
      title: 'Scale Replica Resources',
      description: 'Increase replica CPU/Memory',
      command: 'kubectl patch deployment postgres-replica -p \'{"spec":{"template":{"spec":{"containers":[{"name":"postgres","resources":{"limits":{"cpu":"2","memory":"4Gi"}}}]}}}}\'',
      verification: 'Replica scaled up',
    },
    {
      id: '8',
      title: 'Monitor Catch-up',
      description: 'Watch replica catch up to primary',
      command: 'watch -n 1 "psql -c \\"SELECT EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp())) AS lag_seconds;\\""',
      verification: 'Lag decreasing',
    },
  ],
  postActions: [
    'Once caught up, restore read replica routing',
    'Analyze cause of lag',
    'Consider read replica sizing',
    'Review query patterns',
  ],
};

export const DataCorruptionRunbooks = {
  DataCorruption: DataCorruptionRunbook,
  PartialDataLoss: PartialDataLossRunbook,
  ReplicationLag: ReplicationLagRunbook,
};

export default DataCorruptionRunbooks;
