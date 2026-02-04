/**
 * Scheduling Module
 * 
 * Advanced scheduling system for Dash with resource-aware placement,
 * affinity/anti-affinity rules, and priority-based preemption.
 * 
 * @example
 * ```typescript
 * import { Scheduler, ResourceTracker, AffinityEngine } from './scheduling';
 * 
 * // Create scheduler
 * const scheduler = new Scheduler({
 *   policy: {
 *     binPackingStrategy: 'bestFit',
 *     enablePreemption: true,
 *   }
 * });
 * 
 * // Register nodes
 * await scheduler.registerNode({
 *   nodeId: 'node-1',
 *   labels: { zone: 'us-east-1a', type: 'compute' },
 *   cpu: 8,
 *   memory: 32768,
 * });
 * 
 * // Schedule an agent
 * const result = await scheduler.schedule({
 *   agent: myAgent,
 *   resources: { cpu: 1, memory: 4096 },
 *   affinity: {
 *     nodeAffinity: [{
 *       type: 'affinity',
 *       weight: 'hard',
 *       nodeSelector: { matchLabels: { zone: 'us-east-1a' } }
 *     }]
 *   },
 *   priority: {
 *     priorityClass: PriorityClass.HIGH,
 *     preemptionPolicy: 'PreemptLowerPriority'
 *   }
 * });
 * ```
 */

// Core types
export * from './types';

// Resource tracking
export { ResourceTracker, type ResourceTrackerConfig } from './resource-tracker';

// Affinity engine
export { AffinityEngine, type AffinityScore, type AffinityEngineConfig } from './affinity-engine';

// Preemption system
export {
  PreemptionSystem,
  type PreemptionConfig,
  type PreemptionRequest,
  type PreemptionResult,
  type PreemptedAgent,
} from './preemption-system';

// Main scheduler
export { Scheduler, type SchedulerConfig } from './scheduler';

// Metrics
export { SchedulingMetrics, type SchedulingMetricsConfig } from './metrics';
