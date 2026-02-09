import {
  CoreV1Api,
  NetworkingV1Api,
  V1Namespace,
  V1NamespaceList,
  V1ResourceQuota,
  V1ResourceQuotaSpec,
  V1NetworkPolicy,
  V1NetworkPolicySpec,
  V1ObjectMeta,
  V1LabelSelector,
  V1Status,
} from '@kubernetes/client-node';
import { EventEmitter } from 'eventemitter3';
import { K8sClient, K8sClientError, K8sErrorCode } from './client.js';

export interface NamespaceConfig {
  name: string;
  teamId: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  enableKata?: boolean;
}

export interface ResourceQuotaConfig {
  hard: {
    'requests.cpu'?: string;
    'requests.memory'?: string;
    'limits.cpu'?: string;
    'limits.memory'?: string;
    'pods'?: string;
    'services'?: string;
    'secrets'?: string;
    'configmaps'?: string;
    'persistentvolumeclaims'?: string;
    [key: string]: string | undefined;
  };
}

function filterDefinedValues(obj: Record<string, string | undefined>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

export interface NetworkPolicyRule {
  protocol?: string;
  port?: number | string;
  ports?: Array<{ port: number | string; protocol?: string }>;
}

export interface NetworkPolicyPeer {
  podSelector?: Record<string, string>;
  namespaceSelector?: Record<string, string>;
  ipBlock?: {
    cidr: string;
    except?: string[];
  };
}

export interface NetworkPolicyConfig {
  name: string;
  podSelector: Record<string, string>;
  policyTypes: Array<'Ingress' | 'Egress'>;
  ingress?: Array<{
    from?: NetworkPolicyPeer[];
    ports?: NetworkPolicyRule['ports'];
  }>;
  egress?: Array<{
    to?: NetworkPolicyPeer[];
    ports?: NetworkPolicyRule['ports'];
  }>;
}

export interface TeamNamespace {
  namespace: V1Namespace;
  resourceQuota?: V1ResourceQuota;
  networkPolicies: V1NetworkPolicy[];
}

export interface NamespaceListOptions {
  teamId?: string;
  labelSelector?: string;
  limit?: number;
  continueToken?: string;
}

export class NamespaceManager extends EventEmitter {
  private coreApi!: CoreV1Api;
  private networkingApi!: NetworkingV1Api;
  private k8sClient: K8sClient;
  private isConnected: boolean = false;

  static readonly TEAM_LABEL = 'rlm.io/team-id';
  static readonly KATA_LABEL = 'rlm.io/kata-enabled';
  static readonly MANAGED_LABEL = 'rlm.io/managed';
  static readonly MANAGED_BY = 'rlm.io/managed-by';

  constructor(k8sClient: K8sClient) {
    super();
    this.k8sClient = k8sClient;
  }

  /**
   * Initialize the namespace manager
   */
  async connect(): Promise<void> {
    try {
      if (!this.k8sClient.connected) {
        await this.k8sClient.connect();
      }

      const config = this.k8sClient['config'];
      this.coreApi = config.makeApiClient(CoreV1Api);
      this.networkingApi = config.makeApiClient(NetworkingV1Api);
      
      this.isConnected = true;
      this.emit('connected', { timestamp: new Date() });
    } catch (error) {
      const k8sError = this.normalizeError(error);
      this.emit('error', k8sError);
      throw k8sError;
    }
  }

  /**
   * Disconnect and cleanup
   */
  async disconnect(): Promise<void> {
    this.isConnected = false;
    this.emit('disconnected', { timestamp: new Date() });
  }

  /**
   * Check if connected
   */
  get connected(): boolean {
    return this.isConnected;
  }

  /**
   * Create a namespace for a team
   */
  async createNamespace(config: NamespaceConfig): Promise<V1Namespace> {
    await this.ensureConnected();

    const namespace: V1Namespace = {
      apiVersion: 'v1',
      kind: 'Namespace',
      metadata: {
        name: config.name,
        labels: {
          [NamespaceManager.TEAM_LABEL]: config.teamId,
          [NamespaceManager.MANAGED_LABEL]: 'true',
          [NamespaceManager.MANAGED_BY]: 'rlm-namespace-manager',
          ...(config.enableKata && { [NamespaceManager.KATA_LABEL]: 'true' }),
          ...config.labels,
        },
        annotations: config.annotations || {},
      },
    };

    try {
      const response = await this.coreApi.createNamespace({ body: namespace });
      this.emit('namespace:created', {
        name: config.name,
        teamId: config.teamId,
        namespace: response,
      });
      return response;
    } catch (error) {
      const k8sError = this.normalizeError(error);
      this.emit('error', { operation: 'createNamespace', error: k8sError });
      throw k8sError;
    }
  }

  /**
   * Get a namespace by name
   */
  async getNamespace(name: string): Promise<V1Namespace | null> {
    await this.ensureConnected();

    try {
      const response = await this.coreApi.readNamespace({ name });
      return response;
    } catch (error) {
      if (this.isNotFoundError(error)) {
        return null;
      }
      throw this.normalizeError(error);
    }
  }

  /**
   * List namespaces with optional filtering
   */
  async listNamespaces(options: NamespaceListOptions = {}): Promise<V1NamespaceList> {
    await this.ensureConnected();

    const labelSelectors: string[] = [`${NamespaceManager.MANAGED_LABEL}=true`];
    
    if (options.teamId) {
      labelSelectors.push(`${NamespaceManager.TEAM_LABEL}=${options.teamId}`);
    }
    
    if (options.labelSelector) {
      labelSelectors.push(options.labelSelector);
    }

    try {
      const response = await this.coreApi.listNamespace({
        labelSelector: labelSelectors.join(','),
        ...(options.limit && { limit: options.limit }),
        ...(options.continueToken && { continue: options.continueToken }),
      });
      return response;
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  /**
   * Update namespace labels and annotations
   */
  async updateNamespace(
    name: string,
    updates: { labels?: Record<string, string>; annotations?: Record<string, string> }
  ): Promise<V1Namespace> {
    await this.ensureConnected();

    try {
      const existing = await this.getNamespace(name);
      if (!existing) {
        throw new K8sClientError(
          `Namespace ${name} not found`,
          'NOT_FOUND'
        );
      }

      const patch = {
        metadata: {
          labels: updates.labels
            ? { ...existing.metadata?.labels, ...updates.labels }
            : existing.metadata?.labels,
          annotations: updates.annotations
            ? { ...existing.metadata?.annotations, ...updates.annotations }
            : existing.metadata?.annotations,
        },
      };

      const response = await this.coreApi.patchNamespace({
        name,
        body: patch,
      });

      this.emit('namespace:updated', { name, updates, namespace: response });
      return response;
    } catch (error) {
      if (error instanceof K8sClientError) {
        throw error;
      }
      throw this.normalizeError(error);
    }
  }

  /**
   * Delete a namespace
   */
  async deleteNamespace(name: string): Promise<V1Status> {
    await this.ensureConnected();

    try {
      const response = await this.coreApi.deleteNamespace({ name });
      this.emit('namespace:deleted', { name });
      return response as V1Status;
    } catch (error) {
      const k8sError = this.normalizeError(error);
      this.emit('error', { operation: 'deleteNamespace', error: k8sError });
      throw k8sError;
    }
  }

  /**
   * Apply resource quota to a namespace
   */
  async applyResourceQuota(
    namespace: string,
    quotaName: string,
    config: ResourceQuotaConfig
  ): Promise<V1ResourceQuota> {
    await this.ensureConnected();

    const resourceQuota: V1ResourceQuota = {
      apiVersion: 'v1',
      kind: 'ResourceQuota',
      metadata: {
        name: quotaName,
        namespace,
        labels: {
          [NamespaceManager.MANAGED_LABEL]: 'true',
          [NamespaceManager.MANAGED_BY]: 'rlm-namespace-manager',
        },
      },
      spec: {
        hard: filterDefinedValues(config.hard),
      },
    };

    try {
      // Check if quota already exists
      const existing = await this.getResourceQuota(namespace, quotaName);
      
      let response: V1ResourceQuota;
      if (existing) {
        response = await this.coreApi.replaceNamespacedResourceQuota({
          name: quotaName,
          namespace,
          body: resourceQuota,
        });
        this.emit('quota:updated', { namespace, quotaName, quota: response });
      } else {
        response = await this.coreApi.createNamespacedResourceQuota({
          namespace,
          body: resourceQuota,
        });
        this.emit('quota:created', { namespace, quotaName, quota: response });
      }
      
      return response;
    } catch (error) {
      const k8sError = this.normalizeError(error);
      this.emit('error', { operation: 'applyResourceQuota', error: k8sError });
      throw k8sError;
    }
  }

  /**
   * Get a resource quota
   */
  async getResourceQuota(
    namespace: string,
    name: string
  ): Promise<V1ResourceQuota | null> {
    await this.ensureConnected();

    try {
      const response = await this.coreApi.readNamespacedResourceQuota({
        name,
        namespace,
      });
      return response;
    } catch (error) {
      if (this.isNotFoundError(error)) {
        return null;
      }
      throw this.normalizeError(error);
    }
  }

  /**
   * List resource quotas in a namespace
   */
  async listResourceQuotas(namespace: string): Promise<V1ResourceQuota[]> {
    await this.ensureConnected();

    try {
      const response = await this.coreApi.listNamespacedResourceQuota({
        namespace,
        labelSelector: `${NamespaceManager.MANAGED_LABEL}=true`,
      });
      return response.items || [];
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  /**
   * Delete a resource quota
   */
  async deleteResourceQuota(
    namespace: string,
    name: string
  ): Promise<V1Status> {
    await this.ensureConnected();

    try {
      const response = await this.coreApi.deleteNamespacedResourceQuota({
        name,
        namespace,
      });
      this.emit('quota:deleted', { namespace, name });
      return response as V1Status;
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  /**
   * Apply network policy to a namespace
   */
  async applyNetworkPolicy(
    namespace: string,
    config: NetworkPolicyConfig
  ): Promise<V1NetworkPolicy> {
    await this.ensureConnected();

    const networkPolicy: V1NetworkPolicy = {
      apiVersion: 'networking.k8s.io/v1',
      kind: 'NetworkPolicy',
      metadata: {
        name: config.name,
        namespace,
        labels: {
          [NamespaceManager.MANAGED_LABEL]: 'true',
          [NamespaceManager.MANAGED_BY]: 'rlm-namespace-manager',
        },
      },
      spec: this.buildNetworkPolicySpec(config),
    };

    try {
      const existing = await this.getNetworkPolicy(namespace, config.name);
      
      let response: V1NetworkPolicy;
      if (existing) {
        response = await this.networkingApi.replaceNamespacedNetworkPolicy({
          name: config.name,
          namespace,
          body: networkPolicy,
        });
        this.emit('networkpolicy:updated', { namespace, name: config.name, policy: response });
      } else {
        response = await this.networkingApi.createNamespacedNetworkPolicy({
          namespace,
          body: networkPolicy,
        });
        this.emit('networkpolicy:created', { namespace, name: config.name, policy: response });
      }
      
      return response;
    } catch (error) {
      const k8sError = this.normalizeError(error);
      this.emit('error', { operation: 'applyNetworkPolicy', error: k8sError });
      throw k8sError;
    }
  }

  /**
   * Get a network policy
   */
  async getNetworkPolicy(
    namespace: string,
    name: string
  ): Promise<V1NetworkPolicy | null> {
    await this.ensureConnected();

    try {
      const response = await this.networkingApi.readNamespacedNetworkPolicy({
        name,
        namespace,
      });
      return response;
    } catch (error) {
      if (this.isNotFoundError(error)) {
        return null;
      }
      throw this.normalizeError(error);
    }
  }

  /**
   * List network policies in a namespace
   */
  async listNetworkPolicies(namespace: string): Promise<V1NetworkPolicy[]> {
    await this.ensureConnected();

    try {
      const response = await this.networkingApi.listNamespacedNetworkPolicy({
        namespace,
        labelSelector: `${NamespaceManager.MANAGED_LABEL}=true`,
      });
      return response.items || [];
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  /**
   * Delete a network policy
   */
  async deleteNetworkPolicy(
    namespace: string,
    name: string
  ): Promise<V1Status> {
    await this.ensureConnected();

    try {
      const response = await this.networkingApi.deleteNamespacedNetworkPolicy({
        name,
        namespace,
      });
      this.emit('networkpolicy:deleted', { namespace, name });
      return response as V1Status;
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  /**
   * Enable Kata containers for a namespace
   */
  async enableKata(namespace: string): Promise<V1Namespace> {
    return this.updateNamespace(namespace, {
      labels: { [NamespaceManager.KATA_LABEL]: 'true' },
    });
  }

  /**
   * Disable Kata containers for a namespace
   */
  async disableKata(namespace: string): Promise<V1Namespace> {
    const ns = await this.getNamespace(namespace);
    if (!ns) {
      throw new K8sClientError(
        `Namespace ${namespace} not found`,
        'NOT_FOUND'
      );
    }

    const labels = { ...ns.metadata?.labels };
    delete labels[NamespaceManager.KATA_LABEL];

    return this.updateNamespace(namespace, { labels });
  }

  /**
   * Check if Kata is enabled for a namespace
   */
  async isKataEnabled(namespace: string): Promise<boolean> {
    const ns = await this.getNamespace(namespace);
    if (!ns) {
      return false;
    }
    return ns.metadata?.labels?.[NamespaceManager.KATA_LABEL] === 'true';
  }

  /**
   * Get complete team namespace info
   */
  async getTeamNamespace(name: string): Promise<TeamNamespace | null> {
    const namespace = await this.getNamespace(name);
    if (!namespace) {
      return null;
    }

    const [resourceQuotas, networkPolicies] = await Promise.all([
      this.listResourceQuotas(name),
      this.listNetworkPolicies(name),
    ]);

    return {
      namespace,
      resourceQuota: resourceQuotas[0], // Return first quota as primary
      networkPolicies,
    };
  }

  /**
   * Delete all team namespaces
   */
  async deleteTeamNamespaces(teamId: string): Promise<string[]> {
    const namespaces = await this.listNamespaces({ teamId });
    const deleted: string[] = [];

    for (const ns of namespaces.items || []) {
      if (ns.metadata?.name) {
        await this.deleteNamespace(ns.metadata.name);
        deleted.push(ns.metadata.name);
      }
    }

    return deleted;
  }

  // Private helper methods

  private async ensureConnected(): Promise<void> {
    if (!this.isConnected) {
      throw new K8sClientError(
        'NamespaceManager not connected. Call connect() first.',
        'CONNECTION_ERROR'
      );
    }
  }

  private buildNetworkPolicySpec(config: NetworkPolicyConfig): V1NetworkPolicySpec {
    return {
      podSelector: {
        matchLabels: config.podSelector,
      },
      policyTypes: config.policyTypes,
      ingress: config.ingress?.map((rule) => ({
        from: rule.from?.map((peer) => this.buildNetworkPolicyPeer(peer)),
        ports: rule.ports?.map((port) => ({
          port: typeof port.port === 'number' ? port.port : parseInt(port.port, 10),
          protocol: port.protocol || 'TCP',
        })),
      })),
      egress: config.egress?.map((rule) => ({
        to: rule.to?.map((peer) => this.buildNetworkPolicyPeer(peer)),
        ports: rule.ports?.map((port) => ({
          port: typeof port.port === 'number' ? port.port : parseInt(port.port, 10),
          protocol: port.protocol || 'TCP',
        })),
      })),
    };
  }

  private buildNetworkPolicyPeer(peer: NetworkPolicyPeer) {
    const result: any = {};
    
    if (peer.podSelector) {
      result.podSelector = {
        matchLabels: peer.podSelector,
      };
    }
    
    if (peer.namespaceSelector) {
      result.namespaceSelector = {
        matchLabels: peer.namespaceSelector,
      };
    }
    
    if (peer.ipBlock) {
      result.ipBlock = peer.ipBlock;
    }
    
    return result;
  }

  private isNotFoundError(error: unknown): boolean {
    if (error instanceof K8sClientError) {
      return error.code === 'NOT_FOUND';
    }
    
    if (error && typeof error === 'object') {
      const err = error as { statusCode?: number };
      return err.statusCode === 404;
    }
    
    return false;
  }

  private normalizeError(error: unknown): K8sClientError {
    if (error instanceof K8sClientError) {
      return error;
    }

    if (error instanceof Error) {
      const err = error as Error & {
        statusCode?: number;
        body?: { message?: string };
        code?: string;
      };

      if (err.statusCode === 404) {
        return new K8sClientError(
          err.body?.message || err.message || 'Resource not found',
          'NOT_FOUND',
          err,
          404
        );
      }

      if (err.statusCode === 409) {
        return new K8sClientError(
          err.body?.message || err.message || 'Conflict',
          'VALIDATION_ERROR',
          err,
          409
        );
      }

      if (err.statusCode && err.statusCode >= 400) {
        const code: K8sErrorCode = err.statusCode === 401 || err.statusCode === 403
          ? 'AUTH_ERROR'
          : 'API_ERROR';
        return new K8sClientError(
          err.body?.message || err.message,
          code,
          err,
          err.statusCode
        );
      }

      return new K8sClientError(
        err.message || 'Unknown error',
        'UNKNOWN_ERROR',
        err
      );
    }

    return new K8sClientError(
      'Unknown error occurred',
      'UNKNOWN_ERROR',
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Factory function to create a NamespaceManager
 */
export function createNamespaceManager(k8sClient: K8sClient): NamespaceManager {
  return new NamespaceManager(k8sClient);
}

export default NamespaceManager;
