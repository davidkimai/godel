/**
 * Federation Module - Multi-Cluster Orchestration
 * 
 * Provides cross-cluster federation capabilities:
 * - Cluster registry with health monitoring
 * - Agent migration between clusters
 * - Multi-cluster load balancing
 * - Inter-cluster gRPC protocol
 * 
 * @module federation
 */

// Cluster Registry
export {
  ClusterRegistry,
  getGlobalClusterRegistry,
  resetGlobalClusterRegistry,
  DEFAULT_REGISTRY_CONFIG,
} from './cluster-registry';

export type {
  ClusterInfo,
  ClusterHealth,
  ClusterHealthStatus,
  ClusterLoad,
  ClusterMetrics,
  ClusterCapabilities,
  ClusterRole,
  ClusterRegistrationInput,
  ClusterRegistryConfig,
  FederationStatus,
  RegionInfo,
} from './cluster-registry';

// Agent Migration
export {
  AgentMigrator,
  DEFAULT_MIGRATION_CONFIG,
} from './migration';

export type {
  MigrationStatus,
  MigrationMode,
  AgentState,
  MigrationOptions,
  MigrationRequest,
  MigrationResult,
  MigrationPlan,
  MigrationStep,
  MigrationConfig,
  MigrationStats,
} from './migration';

// Load Balancer
export {
  MultiClusterLoadBalancer,
  DEFAULT_LB_CONFIG,
} from './load-balancer';

export type {
  RoutingStrategy,
  RoutingRequest,
  RoutingResult,
  LoadBalancerConfig,
  CircuitBreakerState,
  LoadDistribution,
  RebalancePlan,
  LoadBalancerStats,
} from './load-balancer';

// Existing federation exports
export {
  FederationRegistry,
} from '../core/federation/registry';

export type {
  OpenClawInstance,
  OpenClawInstanceInput,
  FederationRegistryConfig,
  FederationCapacityReport,
  RegionCapacity as FederationRegionCapacity,
  RoutingContext,
  InstanceSelection,
  RoutingStrategyType,
  HealthStatus,
  HealthCheckResult,
  HealthCheckHistory,
  BackpressureStatus,
  StorageAdapter,
  NoAvailableInstanceError,
  FederationCapacityError,
  InstanceNotFoundError,
  InstanceRegistrationError,
} from '../core/federation/types';
