/**
 * Cluster Federation - Multi-region agent orchestration
 * 
 * This module provides tools for distributing agents across multiple
 * clusters (local and cloud) with transparent routing, load balancing,
 * and agent migration capabilities.
 * 
 * @example
 * ```typescript
 * import { 
 *   ClusterRegistry, 
 *   MultiClusterLoadBalancer,
 *   TransparentClusterProxy 
 * } from './cluster';
 * 
 * // Register clusters
 * const registry = new ClusterRegistry();
 * registry.register({
 *   id: 'gpu-cluster-1',
 *   name: 'GPU Cluster US East',
 *   endpoint: 'https://gpu.godel.cloud:443',
 *   region: 'us-east-1',
 *   capabilities: { maxAgents: 100, gpuEnabled: true }
 * });
 * 
 * // Create load balancer
 * const balancer = new MultiClusterLoadBalancer(registry, localRuntime);
 * 
 * // Create transparent proxy
 * const proxy = new TransparentClusterProxy(registry, balancer, localRuntime);
 * 
 * // Spawn agents (automatically routed to best cluster)
 * const agent = await proxy.spawn({ model: 'claude', labels: {} });
 * 
 * // Execute commands (automatically routed)
 * const result = await proxy.exec(agent.id, 'analyze this');
 * ```
 */

// Core exports
export { ClusterRegistry, getClusterRegistry, resetClusterRegistry } from './cluster-registry';
export { ClusterClient } from './cluster-client';
export {
  MultiClusterLoadBalancer,
  getMultiClusterLoadBalancer,
  resetMultiClusterLoadBalancer,
} from './multi-cluster-balancer';
export {
  TransparentClusterProxy,
  getTransparentClusterProxy,
  resetTransparentClusterProxy,
} from './transparent-proxy';

// Type exports
export type {
  Cluster,
  ClusterCapabilities,
  ClusterStatus,
  Region,
  ClusterMetadata,
  ClusterSelectionCriteria,
  ClusterSelection,
  ClusterHealthState,
  ClusterHealthConfig,
} from './types';

export type {
  SpawnConfig,
  Agent,
  AgentStatus,
  RemoteAgentRef,
  ExecResult,
} from './types';

export type {
  FederationEvent,
  FederationEventType,
  AgentSnapshot,
  Migration,
  MigrationStatus,
} from './types';

export type {
  LoadBalancerConfig,
  LocalRuntime,
} from './multi-cluster-balancer';

export type {
  AgentFilter,
  AgentWithCluster,
} from './transparent-proxy';

// Constants
export { DEFAULT_CLUSTER_HEALTH_CONFIG } from './cluster-registry';
export { DEFAULT_LOAD_BALANCER_CONFIG } from './multi-cluster-balancer';
