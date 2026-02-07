/**
 * Disaster Recovery Runbooks Index
 * 
 * All operational runbooks for handling failures.
 */

export { DatabaseFailureRunbook, executeStep, executeRunbook } from './database-failure';
export type { Runbook, RunbookStep } from './database-failure';

export {
  ServiceOutageRunbooks,
  CompleteOutageRunbook,
  PartialDegradationRunbook,
  CascadeFailureRunbook,
} from './service-outage';

export {
  DataCorruptionRunbooks,
  DataCorruptionRunbook,
  PartialDataLossRunbook,
  ReplicationLagRunbook,
} from './data-corruption';

import { DatabaseFailureRunbook } from './database-failure';
import { ServiceOutageRunbooks } from './service-outage';
import { DataCorruptionRunbooks } from './data-corruption';

export const AllRunbooks = {
  database: DatabaseFailureRunbook,
  ...ServiceOutageRunbooks,
  ...DataCorruptionRunbooks,
};

export default AllRunbooks;
