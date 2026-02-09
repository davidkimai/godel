import {
  CoreV1Api,
  StorageV1Api,
  V1PersistentVolumeClaim,
  V1PersistentVolumeClaimSpec,
  V1PersistentVolume,
  V1StorageClass,
  V1ObjectMeta,
  V1ResourceRequirements,
  V1PersistentVolumeClaimStatus,
  V1Status,
  Watch,
  KubernetesObject,
} from '@kubernetes/client-node';
import { EventEmitter } from 'eventemitter3';
import { K8sClient, K8sClientError, K8sErrorCode } from './client';

export interface VolumeConfig {
  name?: string;
  namespace?: string;
  storageClassName?: string;
  size: string;
  accessModes?: string[];
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  volumeMode?: 'Filesystem' | 'Block';
  selector?: {
    matchLabels?: Record<string, string>;
    matchExpressions?: Array<{
      key: string;
      operator: string;
      values?: string[];
    }>;
  };
  dataSource?: {
    apiGroup: string;
    kind: string;
    name: string;
  };
}

export interface StorageClassConfig {
  name: string;
  provisioner: string;
  reclaimPolicy?: 'Delete' | 'Retain';
  volumeBindingMode?: 'Immediate' | 'WaitForFirstConsumer';
  allowVolumeExpansion?: boolean;
  mountOptions?: string[];
  parameters?: Record<string, string>;
  annotations?: Record<string, string>;
}

export interface VolumeAttachmentConfig {
  pvcName: string;
  podName: string;
  namespace?: string;
  containerName?: string;
  mountPath: string;
  readOnly?: boolean;
  subPath?: string;
}

export interface VolumeStatus {
  phase: string;
  capacity?: string;
  accessModes?: string[];
  storageClassName?: string;
  volumeName?: string;
  conditions?: Array<{
    type: string;
    status: string;
    reason?: string;
    message?: string;
  }>;
}

export interface CleanupOptions {
  deletePVCs?: boolean;
  deletePVs?: boolean;
  deleteSnapshots?: boolean;
  gracePeriodSeconds?: number;
  force?: boolean;
}

export interface DynamicProvisioningConfig {
  enabled: boolean;
  defaultStorageClass?: string;
  allowedStorageClasses?: string[];
  volumeExpansion?: boolean;
  snapshotEnabled?: boolean;
}

export interface VolumeSnapshotConfig {
  apiVersion: string;
  kind: string;
  metadata: V1ObjectMeta;
  spec: {
    source: {
      persistentVolumeClaimName: string;
    };
    volumeSnapshotClassName?: string;
  };
}

export class VolumeManagerError extends Error {
  constructor(
    message: string,
    public readonly code: K8sErrorCode,
    public readonly originalError?: Error,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'VolumeManagerError';
    Object.setPrototypeOf(this, VolumeManagerError.prototype);
  }
}

export class VolumeManager extends EventEmitter {
  private coreApi!: CoreV1Api;
  private storageApi!: StorageV1Api;
  private k8sClient: K8sClient;
  private readonly defaultNamespace: string;
  private readonly provisioningConfig: DynamicProvisioningConfig;
  private activePVCs: Map<string, V1PersistentVolumeClaim> = new Map();
  private cleanupHandlers: Map<string, () => Promise<void>> = new Map();

  constructor(
    k8sClient: K8sClient,
    provisioningConfig: Partial<DynamicProvisioningConfig> = {}
  ) {
    super();
    this.k8sClient = k8sClient;
    this.defaultNamespace = 'default';
    this.provisioningConfig = {
      enabled: true,
      volumeExpansion: true,
      snapshotEnabled: false,
      ...provisioningConfig,
    };

    this.setupTerminationHandlers();
  }

  /**
   * Initialize the volume manager
   */
  async initialize(): Promise<void> {
    try {
      const config = this.k8sClient.getConfig();
      const KubeConfig = await import('@kubernetes/client-node').then(
        (m) => m.KubeConfig
      );
      const kubeConfig = new KubeConfig();

      if (config.inCluster) {
        kubeConfig.loadFromCluster();
      } else if (config.kubeconfigPath) {
        kubeConfig.loadFromFile(config.kubeconfigPath);
      } else {
        kubeConfig.loadFromDefault();
      }

      this.coreApi = kubeConfig.makeApiClient(CoreV1Api);
      this.storageApi = kubeConfig.makeApiClient(StorageV1Api);

      this.emit('initialized', {
        timestamp: new Date(),
        provisioning: this.provisioningConfig,
      });
    } catch (error) {
      const volError = this.normalizeError(error);
      this.emit('error', volError);
      throw volError;
    }
  }

  /**
   * Create a Persistent Volume Claim with dynamic provisioning
   */
  async createPVC(config: VolumeConfig): Promise<V1PersistentVolumeClaim> {
    try {
      const namespace = config.namespace || this.defaultNamespace;
      const name = config.name || this.generateVolumeName();

      // Select appropriate storage class
      const storageClassName = await this.selectStorageClass(config.storageClassName);

      const pvc: V1PersistentVolumeClaim = {
        apiVersion: 'v1',
        kind: 'PersistentVolumeClaim',
        metadata: {
          name,
          namespace,
          labels: {
            'managed-by': 'volume-manager',
            ...config.labels,
          },
          annotations: {
            'volume-manager/created-at': new Date().toISOString(),
            ...config.annotations,
          },
        },
        spec: {
          storageClassName,
          resources: {
            requests: {
              storage: config.size,
            },
          } as V1ResourceRequirements,
          accessModes: config.accessModes || ['ReadWriteOnce'],
          volumeMode: config.volumeMode || 'Filesystem',
          ...(config.selector && { selector: config.selector }),
          ...(config.dataSource && { dataSource: config.dataSource }),
        } as V1PersistentVolumeClaimSpec,
      };

      this.emit('pvc:creating', { namespace, name, storageClassName });

      const created = await this.coreApi.createNamespacedPersistentVolumeClaim({
        namespace,
        body: pvc,
      });

      this.activePVCs.set(`${namespace}/${name}`, created);

      // Register cleanup handler
      this.cleanupHandlers.set(`${namespace}/${name}`, async () => {
        await this.deletePVC(name, namespace);
      });

      this.emit('pvc:created', {
        namespace,
        name,
        storageClassName,
        phase: created.status?.phase,
      });

      return created;
    } catch (error) {
      const volError = this.normalizeError(error);
      this.emit('pvc:error', { config, error: volError });
      throw volError;
    }
  }

  /**
   * Wait for PVC to be bound
   */
  async waitForPVC(
    name: string,
    namespace?: string,
    timeoutMs: number = 300000
  ): Promise<V1PersistentVolumeClaim> {
    const ns = namespace || this.defaultNamespace;
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      try {
        const pvc = await this.getPVC(name, ns);

        if (pvc.status?.phase === 'Bound') {
          this.emit('pvc:bound', { namespace: ns, name, volume: pvc.spec?.volumeName });
          return pvc;
        }

        if (pvc.status?.phase === 'Lost') {
          throw new VolumeManagerError(
            `PVC ${name} entered Lost phase`,
            'API_ERROR',
            undefined,
            { pvc }
          );
        }

        await this.delay(2000);
      } catch (error) {
        if (error instanceof VolumeManagerError) throw error;
        await this.delay(2000);
      }
    }

    throw new VolumeManagerError(
      `Timeout waiting for PVC ${name} to bind`,
      'TIMEOUT_ERROR'
    );
  }

  /**
   * Get PVC by name
   */
  async getPVC(
    name: string,
    namespace?: string
  ): Promise<V1PersistentVolumeClaim> {
    try {
      const ns = namespace || this.defaultNamespace;
      return await this.coreApi.readNamespacedPersistentVolumeClaim({
        name,
        namespace: ns,
      });
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  /**
   * List PVCs in namespace
   */
  async listPVCs(
    namespace?: string,
    labelSelector?: string
  ): Promise<V1PersistentVolumeClaim[]> {
    try {
      const ns = namespace || this.defaultNamespace;
      
      if (namespace === undefined || namespace === 'all') {
        const response = await this.coreApi.listPersistentVolumeClaimForAllNamespaces({
          ...(labelSelector && { labelSelector }),
        });
        return response.items || [];
      } else {
        const response = await this.coreApi.listNamespacedPersistentVolumeClaim({
          namespace: ns,
          ...(labelSelector && { labelSelector }),
        });
        return response.items || [];
      }
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  /**
   * Resize PVC (requires volume expansion support)
   */
  async resizePVC(
    name: string,
    newSize: string,
    namespace?: string
  ): Promise<V1PersistentVolumeClaim> {
    try {
      if (!this.provisioningConfig.volumeExpansion) {
        throw new VolumeManagerError(
          'Volume expansion is not enabled',
          'VALIDATION_ERROR'
        );
      }

      const ns = namespace || this.defaultNamespace;
      const pvc = await this.getPVC(name, ns);

      if (!pvc.spec) {
        throw new VolumeManagerError('PVC spec is undefined', 'VALIDATION_ERROR');
      }

      // Check if storage class supports expansion
      const scName = pvc.spec.storageClassName;
      if (scName) {
        const sc = await this.getStorageClass(scName);
        if (sc.allowVolumeExpansion !== true) {
          throw new VolumeManagerError(
            `Storage class ${scName} does not support volume expansion`,
            'VALIDATION_ERROR'
          );
        }
      }

      const patch = {
        spec: {
          resources: {
            requests: {
              storage: newSize,
            },
          },
        },
      };

      this.emit('pvc:resizing', { namespace: ns, name, newSize });

      const updated = await this.coreApi.patchNamespacedPersistentVolumeClaim({
        name,
        namespace: ns,
        body: patch,
      });

      this.emit('pvc:resized', { namespace: ns, name, newSize });
      return updated;
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  /**
   * Delete a PVC
   */
  async deletePVC(
    name: string,
    namespace?: string,
    gracePeriodSeconds?: number
  ): Promise<V1PersistentVolumeClaim | V1Status> {
    try {
      const ns = namespace || this.defaultNamespace;

      this.emit('pvc:deleting', { namespace: ns, name });

      const result = await this.coreApi.deleteNamespacedPersistentVolumeClaim({
        name,
        namespace: ns,
        ...(gracePeriodSeconds !== undefined && { gracePeriodSeconds }),
      });

      this.activePVCs.delete(`${ns}/${name}`);
      this.cleanupHandlers.delete(`${ns}/${name}`);

      this.emit('pvc:deleted', { namespace: ns, name });
      return result;
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  /**
   * Get PV by name
   */
  async getPV(name: string): Promise<V1PersistentVolume> {
    try {
      return await this.coreApi.readPersistentVolume({ name });
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  /**
   * List all PVs
   */
  async listPVs(labelSelector?: string): Promise<V1PersistentVolume[]> {
    try {
      const response = await this.coreApi.listPersistentVolume({
        ...(labelSelector && { labelSelector }),
      });
      return response.items || [];
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  /**
   * Delete a PV
   */
  async deletePV(name: string): Promise<V1PersistentVolume> {
    try {
      this.emit('pv:deleting', { name });
      const result = await this.coreApi.deletePersistentVolume({ name });
      this.emit('pv:deleted', { name });
      return result;
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  /**
   * Create storage class
   */
  async createStorageClass(
    config: StorageClassConfig
  ): Promise<V1StorageClass> {
    try {
      const sc: V1StorageClass = {
        apiVersion: 'storage.k8s.io/v1',
        kind: 'StorageClass',
        metadata: {
          name: config.name,
          annotations: config.annotations,
        },
        provisioner: config.provisioner,
        reclaimPolicy: config.reclaimPolicy || 'Delete',
        volumeBindingMode: config.volumeBindingMode || 'WaitForFirstConsumer',
        allowVolumeExpansion: config.allowVolumeExpansion ?? true,
        mountOptions: config.mountOptions,
        parameters: config.parameters,
      };

      this.emit('storageclass:creating', { name: config.name });

      const created = await this.storageApi.createStorageClass({ body: sc });

      this.emit('storageclass:created', { name: config.name });
      return created;
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  /**
   * Get storage class
   */
  async getStorageClass(name: string): Promise<V1StorageClass> {
    try {
      return await this.storageApi.readStorageClass({ name });
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  /**
   * List storage classes
   */
  async listStorageClasses(): Promise<V1StorageClass[]> {
    try {
      const response = await this.storageApi.listStorageClass();
      return response.items || [];
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  /**
   * Get default storage class
   */
  async getDefaultStorageClass(): Promise<V1StorageClass | null> {
    try {
      const classes = await this.listStorageClasses();
      return (
        classes.find(
          (sc) =>
            sc.metadata?.annotations?.['storageclass.kubernetes.io/is-default-class'] ===
              'true' ||
            sc.metadata?.annotations?.['storageclass.beta.kubernetes.io/is-default-class'] ===
              'true'
        ) || null
      );
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  /**
   * Delete storage class
   */
  async deleteStorageClass(name: string): Promise<V1StorageClass> {
    try {
      this.emit('storageclass:deleting', { name });
      const result = await this.storageApi.deleteStorageClass({ name });
      this.emit('storageclass:deleted', { name });
      return result;
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  /**
   * Get volume status
   */
  async getVolumeStatus(
    name: string,
    namespace?: string
  ): Promise<VolumeStatus> {
    try {
      const pvc = await this.getPVC(name, namespace);
      const status = pvc.status as V1PersistentVolumeClaimStatus | undefined;

      return {
        phase: status?.phase || 'Unknown',
        capacity: status?.capacity?.storage,
        accessModes: status?.accessModes,
        storageClassName: pvc.spec?.storageClassName,
        volumeName: pvc.spec?.volumeName,
        conditions: status?.conditions?.map((c) => ({
          type: c.type || 'Unknown',
          status: c.status || 'Unknown',
          reason: c.reason,
          message: c.message,
        })),
      };
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  /**
   * Watch PVCs in namespace
   */
  async *watchPVCs(
    namespace?: string,
    labelSelector?: string
  ): AsyncGenerator<{ type: string; pvc: V1PersistentVolumeClaim }, void, unknown> {
    const ns = namespace || this.defaultNamespace;
    const kubeConfig = await this.getKubeConfig();
    const watch = new Watch(kubeConfig);

    const watchPath =
      ns === 'all' ? '/api/v1/persistentvolumeclaims' : `/api/v1/namespaces/${ns}/persistentvolumeclaims`;

    const requestOptions: { labelSelector?: string } = {};
    if (labelSelector) requestOptions.labelSelector = labelSelector;

    await watch.watch(
      watchPath,
      requestOptions,
      (phase: string, apiObj: KubernetesObject) => {
        const pvc = apiObj as V1PersistentVolumeClaim;
        this.emit('watch:pvc', { type: phase, pvc });
      },
      (err: Error | null) => {
        if (err) {
          this.emit('watch:error', err);
        }
      }
    );
  }

  /**
   * Cleanup volumes on termination
   */
  async cleanup(options: CleanupOptions = {}): Promise<void> {
    const {
      deletePVCs = true,
      deletePVs = false,
      gracePeriodSeconds = 30,
      force = false,
    } = options;

    this.emit('cleanup:started', { options });

    const errors: Error[] = [];

    // Delete managed PVCs
    if (deletePVCs) {
      for (const [key, pvc] of this.activePVCs) {
        const [ns, name] = key.split('/');
        try {
          await this.deletePVC(name, ns, force ? 0 : gracePeriodSeconds);
        } catch (error) {
          errors.push(error as Error);
          this.emit('cleanup:error', { key, error });
        }
      }
    }

    // Delete associated PVs if requested
    if (deletePVs) {
      try {
        const pvs = await this.listPVs('managed-by=volume-manager');
        for (const pv of pvs) {
          if (pv.metadata?.name) {
            try {
              await this.deletePV(pv.metadata.name);
            } catch (error) {
              errors.push(error as Error);
              this.emit('cleanup:error', { pv: pv.metadata.name, error });
            }
          }
        }
      } catch (error) {
        errors.push(error as Error);
      }
    }

    this.activePVCs.clear();
    this.cleanupHandlers.clear();

    this.emit('cleanup:completed', {
      pvcCount: this.activePVCs.size,
      errors: errors.length,
    });

    if (errors.length > 0 && !force) {
      throw new VolumeManagerError(
        `Cleanup completed with ${errors.length} errors`,
        'API_ERROR',
        undefined,
        { errors: errors.map((e) => e.message) }
      );
    }
  }

  /**
   * Get volume statistics
   */
  async getVolumeStatistics(namespace?: string): Promise<{
    totalPVCs: number;
    bound: number;
    pending: number;
    lost: number;
    totalCapacity: string;
  }> {
    try {
      const pvcs = await this.listPVCs(namespace, 'managed-by=volume-manager');

      let bound = 0;
      let pending = 0;
      let lost = 0;
      let totalCapacityBytes = 0;

      for (const pvc of pvcs) {
        const phase = pvc.status?.phase;
        if (phase === 'Bound') bound++;
        else if (phase === 'Pending') pending++;
        else if (phase === 'Lost') lost++;

        const capacity = pvc.status?.capacity?.storage;
        if (capacity) {
          totalCapacityBytes += this.parseStorageSize(capacity);
        }
      }

      return {
        totalPVCs: pvcs.length,
        bound,
        pending,
        lost,
        totalCapacity: this.formatStorageSize(totalCapacityBytes),
      };
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  /**
   * Validate storage configuration
   */
  async validateStorageConfig(): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
    storageClasses: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const storageClasses = await this.listStorageClasses();
      const scNames = storageClasses.map((sc) => sc.metadata?.name || 'unknown');

      if (storageClasses.length === 0) {
        errors.push('No storage classes found. Dynamic provisioning requires at least one storage class.');
      }

      const defaultSC = storageClasses.find(
        (sc) =>
          sc.metadata?.annotations?.['storageclass.kubernetes.io/is-default-class'] ===
            'true' ||
          sc.metadata?.annotations?.['storageclass.beta.kubernetes.io/is-default-class'] ===
            'true'
      );

      if (!defaultSC) {
        warnings.push('No default storage class defined. PVCs without storageClassName may fail.');
      }

      for (const sc of storageClasses) {
        if (sc.allowVolumeExpansion === false && this.provisioningConfig.volumeExpansion) {
          warnings.push(`Storage class ${sc.metadata?.name} does not support volume expansion`);
        }
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        storageClasses: scNames,
      };
    } catch (error) {
      errors.push(`Failed to validate storage config: ${(error as Error).message}`);
      return {
        valid: false,
        errors,
        warnings,
        storageClasses: [],
      };
    }
  }

  // Private helper methods

  private async selectStorageClass(preferred?: string): Promise<string | undefined> {
    // Use preferred if specified and allowed
    if (preferred) {
      if (this.provisioningConfig.allowedStorageClasses) {
        if (!this.provisioningConfig.allowedStorageClasses.includes(preferred)) {
          throw new VolumeManagerError(
            `Storage class ${preferred} is not in the allowed list`,
            'VALIDATION_ERROR'
          );
        }
      }
      return preferred;
    }

    // Use default storage class from config
    if (this.provisioningConfig.defaultStorageClass) {
      return this.provisioningConfig.defaultStorageClass;
    }

    // Try to find cluster default
    const defaultSC = await this.getDefaultStorageClass();
    return defaultSC?.metadata?.name;
  }

  private setupTerminationHandlers(): void {
    const cleanup = async () => {
      try {
        await this.cleanup({ deletePVCs: true, deletePVs: false });
      } catch (error) {
        this.emit('cleanup:error', { error });
      }
    };

    process.on('SIGTERM', cleanup);
    process.on('SIGINT', cleanup);
    process.on('beforeExit', cleanup);
  }

  private async getKubeConfig(): Promise<import('@kubernetes/client-node').KubeConfig> {
    const { KubeConfig } = await import('@kubernetes/client-node');
    const kubeConfig = new KubeConfig();
    const config = this.k8sClient.getConfig();

    if (config.inCluster) {
      kubeConfig.loadFromCluster();
    } else if (config.kubeconfigPath) {
      kubeConfig.loadFromFile(config.kubeconfigPath);
    } else {
      kubeConfig.loadFromDefault();
    }

    return kubeConfig;
  }

  private normalizeError(error: unknown): VolumeManagerError {
    if (error instanceof VolumeManagerError) {
      return error;
    }

    if (error instanceof K8sClientError) {
      return new VolumeManagerError(error.message, error.code, error);
    }

    if (error instanceof Error) {
      const err = error as Error & { statusCode?: number; body?: { message?: string } };

      if (err.statusCode) {
        let code: K8sErrorCode = 'UNKNOWN_ERROR';
        switch (err.statusCode) {
          case 400:
            code = 'VALIDATION_ERROR';
            break;
          case 401:
          case 403:
            code = 'AUTH_ERROR';
            break;
          case 404:
            code = 'NOT_FOUND';
            break;
          case 409:
            code = 'VALIDATION_ERROR';
            break;
          case 429:
            code = 'RATE_LIMIT_ERROR';
            break;
          case 500:
          case 502:
          case 503:
          case 504:
            code = 'API_ERROR';
            break;
        }
        return new VolumeManagerError(
          err.body?.message || err.message,
          code,
          err,
          { statusCode: err.statusCode }
        );
      }

      return new VolumeManagerError(err.message, 'UNKNOWN_ERROR', err);
    }

    return new VolumeManagerError(
      'Unknown error occurred',
      'UNKNOWN_ERROR',
      error instanceof Error ? error : undefined
    );
  }

  private generateVolumeName(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `pvc-${timestamp}-${random}`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private parseStorageSize(size: string): number {
    const units: Record<string, number> = {
      Ki: 1024,
      Mi: 1024 ** 2,
      Gi: 1024 ** 3,
      Ti: 1024 ** 4,
      Pi: 1024 ** 5,
      Ei: 1024 ** 6,
      K: 1000,
      M: 1000 ** 2,
      G: 1000 ** 3,
      T: 1000 ** 4,
      P: 1000 ** 5,
      E: 1000 ** 6,
    };

    const match = size.match(/^([0-9]+)([A-Za-z]*)$/);
    if (!match) return 0;

    const value = parseInt(match[1], 10);
    const unit = match[2] || '';

    return value * (units[unit] || 1);
  }

  private formatStorageSize(bytes: number): string {
    const units = ['B', 'Ki', 'Mi', 'Gi', 'Ti', 'Pi'];
    let unitIndex = 0;
    let size = bytes;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${Math.round(size * 100) / 100}${units[unitIndex]}`;
  }

  /**
   * Get active PVCs managed by this instance
   */
  getActivePVCs(): Map<string, V1PersistentVolumeClaim> {
    return new Map(this.activePVCs);
  }

  /**
   * Check if dynamic provisioning is enabled
   */
  isDynamicProvisioningEnabled(): boolean {
    return this.provisioningConfig.enabled;
  }

  /**
   * Get provisioning configuration
   */
  getProvisioningConfig(): DynamicProvisioningConfig {
    return { ...this.provisioningConfig };
  }
}

export default VolumeManager;
