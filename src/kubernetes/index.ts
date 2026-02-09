/**
 * Kubernetes Client Wrapper
 * 
 * Provides a robust wrapper around @kubernetes/client-node with:
 * - Retry logic with exponential backoff
 * - Timeout handling
 * - Error normalization
 * - Connection pooling
 * - Rate limiting
 * - Authentication handling
 * - Config loading (kubeconfig, in-cluster)
 */

export {
  K8sClient,
  K8sClientError,
  K8sClientConfig,
  RetryConfig,
  RateLimitConfig,
  K8sErrorCode,
  PodOptions,
  ExecOptions,
  CopyOptions,
  WatchOptions,
} from './client';

export {
  KataScheduler,
  SchedulerError,
  SchedulerConfig,
  VMPlacementRequest,
  PlacementResult,
  NodeScore,
  NodeMetrics,
  AffinityRules,
  TopologyZone,
} from './scheduler';

export { K8sClient as default } from './client';

export {
  NamespaceManager,
  createNamespaceManager,
  NamespaceConfig,
  ResourceQuotaConfig,
  NetworkPolicyRule,
  NetworkPolicyPeer,
  NetworkPolicyConfig,
  TeamNamespace,
  NamespaceListOptions,
} from './namespace-manager';

export {
  VolumeManager,
  VolumeManagerError,
  VolumeConfig,
  StorageClassConfig,
  VolumeAttachmentConfig,
  VolumeStatus,
  CleanupOptions,
  DynamicProvisioningConfig,
  VolumeSnapshotConfig,
} from './volume-manager';

export {
  ResourceTranslator,
  ResourceLimits,
  K8sResourceSpec,
  K8sResourceRequirements,
  KataOverheadConfig,
  ResourceTranslatorConfig,
  createResourceTranslator,
} from './resource-translator';
