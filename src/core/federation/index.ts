/**
 * Federation Module - OpenClaw Instance Federation Architecture
 * 
 * This module provides the federation layer for managing 10-50+ OpenClaw instances
 * with intelligent routing, health monitoring, and capacity management.
 * 
 * ## Features
 * 
 * - **Instance Registry**: Register, unregister, and manage OpenClaw instances
 * - **Intelligent Routing**: Multiple routing strategies (least-loaded, round-robin, session-affinity, etc.)
 * - **Health Monitoring**: Automatic health checks with configurable intervals
 * - **Backpressure Management**: Prevent overload with capacity thresholds
 * - **Region Awareness**: Route to closest regions for optimal latency
 * - **Capability Matching**: Route to instances with required capabilities (GPU, vision, etc.)
 * - **Session Affinity**: Sticky sessions for consistent routing
 * 
 * ## Quick Start
 * 
 * ```typescript
 * import { 
 *   FederationRegistry, 
 *   FederationRouter, 
 *   HealthMonitor
 * } from '@dash/core/federation';
 * 
 * // Initialize registry with storage
 * const storage = new PostgresStorageAdapter(config);
 * const registry = new FederationRegistry({}, storage);
 * await registry.initialize();
 * 
 * // Register instances
 * await registry.register({
 *   endpoint: 'https://oc1.example.com',
 *   region: 'us-east-1',
 *   maxSessions: 100,
 *   capabilities: ['gpu', 'vision']
 * });
 * 
 * // Create router
 * const router = new FederationRouter(registry, 'least-loaded');
 * 
 * // Start health monitoring
 * const monitor = new HealthMonitor(registry, 30000, 5000);
 * monitor.start();
 * 
 * // Route a session
 * const selection = router.selectInstance({
 *   requiredCapabilities: ['gpu'],
 *   preferredRegion: 'us-east-1'
 * });
 * 
 * console.log(`Routed to: ${selection.instance.endpoint}`);
 * ```
 * 
 * ## Architecture
 * 
 * ```
 * +-----------------+     +-----------------+     +-----------------+
 * |   Federation    |---->|   Federation    |---->|  Health Monitor |
 * |    Registry     |     |     Router      |     |                 |
 * +-----------------+     +-----------------+     +-----------------+
 *          |                       |                       |
 *          v                       v                       v
 * +-----------------+     +-----------------+     +-----------------+
 * | Storage Adapter |     | Session Affinity|     | Health Checks   |
 * |  (PostgreSQL)   |     |    Map          |     |  (HTTP Probes)  |
 * +-----------------+     +-----------------+     +-----------------+
 * ```
 * 
 * ## Routing Strategies
 * 
 * - `least-loaded`: Route to instance with lowest utilization (default)
 * - `round-robin`: Cycle through instances sequentially
 * - `session-affinity`: Prefer same instance for same session ID
 * - `capability-match`: Match required capabilities exactly
 * - `weighted`: Use routing weights for distribution
 * 
 * @module federation
 * @packageDocumentation
 */

// ============================================================================
// CLASSES
// ============================================================================

export { FederationRegistry } from './registry';
export { FederationRouter } from './router';
export { HealthMonitor } from './health-monitor';

// ============================================================================
// TYPES
// ============================================================================

export type {
  // Core types
  OpenClawInstance,
  OpenClawInstanceInput,
  HealthStatus,
  ProbeResult,
  
  // Configuration
  FederationRegistryConfig,
  RoutingStrategyType,
  
  // Routing
  RoutingContext,
  InstanceSelection,
  
  // Capacity
  FederationCapacityReport,
  RegionCapacity,
  
  // Health
  HealthCheckResult,
  HealthCheckHistory,
  
  // Backpressure
  BackpressureStatus,
  
  // Storage
  StorageAdapter,
  
  // Events
  FederationRegistryEvents,
  HealthMonitorEvents,
} from './types';

// ============================================================================
// CONSTANTS & ERRORS
// ============================================================================

export { 
  DEFAULT_REGISTRY_CONFIG,
  NoAvailableInstanceError,
  FederationCapacityError,
  InstanceNotFoundError,
  InstanceRegistrationError,
} from './types';

// ============================================================================
// IMPORTS FOR DEFAULT EXPORT
// ============================================================================

import { FederationRegistry as FR } from './registry';
import { FederationRouter as FRouter } from './router';
import { HealthMonitor as HM } from './health-monitor';

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default {
  FederationRegistry: FR,
  FederationRouter: FRouter,
  HealthMonitor: HM,
};
