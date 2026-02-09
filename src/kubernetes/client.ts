import {
  CoreV1Api,
  KubeConfig,
  KubernetesObject,
  V1Pod,
  V1PodList,
  V1PodSpec,
  V1ObjectMeta,
  V1Status,
  Exec,
  Attach,
  Log,
  Watch,
} from '@kubernetes/client-node';
import { EventEmitter } from 'eventemitter3';

export interface K8sClientConfig {
  /** Kubeconfig path (defaults to ~/.kube/config) */
  kubeconfigPath?: string;
  /** Use in-cluster config (for pods running in cluster) */
  inCluster?: boolean;
  /** Request timeout in ms (default: 30000) */
  timeout?: number;
  /** Number of retries (default: 3) */
  retries?: number;
  /** Retry delay base in ms (default: 1000) */
  retryDelayBase?: number;
  /** Max retry delay in ms (default: 30000) */
  maxRetryDelay?: number;
  /** Rate limit requests per second (default: 100) */
  rateLimitRps?: number;
  /** Default namespace (default: 'default') */
  defaultNamespace?: string;
  /** Connection pool size (default: 10) */
  connectionPoolSize?: number;
}

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  currentAttempt: number;
}

export interface RateLimitConfig {
  requestsPerSecond: number;
  burstSize: number;
}

export type K8sErrorCode =
  | 'NETWORK_ERROR'
  | 'AUTH_ERROR'
  | 'API_ERROR'
  | 'TIMEOUT_ERROR'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'RATE_LIMIT_ERROR'
  | 'CONNECTION_ERROR'
  | 'UNKNOWN_ERROR';

export class K8sClientError extends Error {
  constructor(
    message: string,
    public readonly code: K8sErrorCode,
    public readonly originalError?: Error,
    public readonly statusCode?: number,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'K8sClientError';
    Object.setPrototypeOf(this, K8sClientError.prototype);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      details: this.details,
      stack: this.stack,
    };
  }
}

export interface PodOptions {
  name?: string;
  namespace?: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  spec: V1PodSpec;
}

export interface ExecOptions {
  command: string[];
  namespace?: string;
  container?: string;
  stdin?: boolean;
  stdout?: boolean;
  stderr?: boolean;
  tty?: boolean;
  timeout?: number;
}

export interface CopyOptions {
  namespace?: string;
  container?: string;
  timeout?: number;
}

export interface WatchOptions {
  namespace?: string;
  labelSelector?: string;
  fieldSelector?: string;
  timeout?: number;
}

interface RateLimiter {
  tryAcquire(): boolean;
  release(): void;
}

class TokenBucketRateLimiter implements RateLimiter {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private capacity: number,
    private refillRatePerSecond: number
  ) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  tryAcquire(): boolean {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }

  release(): void {
    this.tokens = Math.min(this.capacity, this.tokens + 1);
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    const tokensToAdd = elapsed * this.refillRatePerSecond;
    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }
}

export class K8sClient extends EventEmitter {
  private coreApi!: CoreV1Api;
  private config!: KubeConfig;
  private readonly options: Required<K8sClientConfig>;
  private rateLimiter: RateLimiter;
  private connectionPool: Set<AbortController> = new Set();
  private isConnected: boolean = false;

  constructor(options: K8sClientConfig = {}) {
    super();
    this.options = {
      kubeconfigPath: options.kubeconfigPath || '',
      inCluster: options.inCluster || false,
      timeout: options.timeout || 30000,
      retries: options.retries || 3,
      retryDelayBase: options.retryDelayBase || 1000,
      maxRetryDelay: options.maxRetryDelay || 30000,
      rateLimitRps: options.rateLimitRps || 100,
      defaultNamespace: options.defaultNamespace || 'default',
      connectionPoolSize: options.connectionPoolSize || 10,
    };

    this.rateLimiter = new TokenBucketRateLimiter(
      Math.ceil(this.options.rateLimitRps / 10),
      this.options.rateLimitRps
    );
  }

  /**
   * Initialize the client and load configuration
   */
  async connect(): Promise<void> {
    try {
      this.config = new KubeConfig();

      if (this.options.inCluster) {
        this.config.loadFromCluster();
        this.emit('debug', { message: 'Loaded in-cluster config' });
      } else if (this.options.kubeconfigPath) {
        this.config.loadFromFile(this.options.kubeconfigPath);
        this.emit('debug', {
          message: 'Loaded kubeconfig from file',
          path: this.options.kubeconfigPath,
        });
      } else {
        this.config.loadFromDefault();
        this.emit('debug', { message: 'Loaded default kubeconfig' });
      }

      this.coreApi = this.config.makeApiClient(CoreV1Api);
      this.isConnected = true;
      this.emit('connected', { timestamp: new Date() });
    } catch (error) {
      const k8sError = this.normalizeError(error);
      this.emit('error', k8sError);
      throw k8sError;
    }
  }

  /**
   * Disconnect and cleanup resources
   */
  async disconnect(): Promise<void> {
    this.isConnected = false;
    this.connectionPool.forEach((controller) => controller.abort());
    this.connectionPool.clear();
    this.emit('disconnected', { timestamp: new Date() });
  }

  /**
   * Check if client is connected
   */
  get connected(): boolean {
    return this.isConnected;
  }

  /**
   * Create a new pod
   */
  async createPod(options: PodOptions): Promise<V1Pod> {
    await this.ensureConnected();

    const namespace = options.namespace || this.options.defaultNamespace;
    const pod: V1Pod = {
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: {
        name: options.name || this.generatePodName(),
        namespace,
        labels: options.labels || {},
        annotations: options.annotations || {},
      },
      spec: options.spec,
    };

    return this.withRetry(async () => {
      await this.acquireRateLimit();
      try {
        const response = await this.coreApi.createNamespacedPod({
          namespace,
          body: pod,
        });
        this.emit('pod:created', { namespace, name: pod.metadata!.name! });
        return response;
      } catch (error) {
        this.rateLimiter.release();
        throw error;
      }
    }, 'createPod');
  }

  /**
   * Delete a pod
   */
  async deletePod(
    name: string,
    namespace?: string,
    gracePeriodSeconds?: number
  ): Promise<V1Pod | V1Status> {
    await this.ensureConnected();

    const ns = namespace || this.options.defaultNamespace;

    return this.withRetry(async () => {
      await this.acquireRateLimit();
      try {
        const response = await this.coreApi.deleteNamespacedPod({
          name,
          namespace: ns,
          ...(gracePeriodSeconds !== undefined && { gracePeriodSeconds }),
        });
        this.emit('pod:deleted', { namespace: ns, name });
        return response;
      } catch (error) {
        this.rateLimiter.release();
        throw error;
      }
    }, 'deletePod');
  }

  /**
   * Get a pod by name
   */
  async getPod(name: string, namespace?: string): Promise<V1Pod> {
    await this.ensureConnected();

    const ns = namespace || this.options.defaultNamespace;

    return this.withRetry(async () => {
      await this.acquireRateLimit();
      try {
        const response = await this.coreApi.readNamespacedPod({
          name,
          namespace: ns,
        });
        return response;
      } catch (error) {
        this.rateLimiter.release();
        throw error;
      }
    }, 'getPod');
  }

  /**
   * List pods in a namespace
   */
  async listPods(
    namespace?: string,
    labelSelector?: string,
    fieldSelector?: string
  ): Promise<V1PodList> {
    await this.ensureConnected();

    const ns = namespace || this.options.defaultNamespace;

    return this.withRetry(async () => {
      await this.acquireRateLimit();
      try {
        if (namespace === undefined || namespace === 'all') {
          return await this.coreApi.listPodForAllNamespaces({
            ...(labelSelector && { labelSelector }),
            ...(fieldSelector && { fieldSelector }),
          });
        } else {
          return await this.coreApi.listNamespacedPod({
            namespace: ns,
            ...(labelSelector && { labelSelector }),
            ...(fieldSelector && { fieldSelector }),
          });
        }
      } catch (error) {
        this.rateLimiter.release();
        throw error;
      }
    }, 'listPods');
  }

  /**
   * Watch pods with event streaming
   */
  async *watchPods(options: WatchOptions = {}): AsyncGenerator<
    { type: string; pod: V1Pod },
    void,
    unknown
  > {
    await this.ensureConnected();

    const namespace = options.namespace || this.options.defaultNamespace;
    const watch = new Watch(this.config);
    const abortController = new AbortController();
    this.connectionPool.add(abortController);

    try {
      const watchPath = namespace === 'all'
        ? '/api/v1/pods'
        : `/api/v1/namespaces/${namespace}/pods`;

      const requestOptions: { labelSelector?: string; fieldSelector?: string } = {};
      if (options.labelSelector) requestOptions.labelSelector = options.labelSelector;
      if (options.fieldSelector) requestOptions.fieldSelector = options.fieldSelector;

      await watch.watch(
        watchPath,
        requestOptions,
        (phase: string, apiObj: KubernetesObject, watchObj?: unknown) => {
          const pod = apiObj as V1Pod;
          this.emit('watch:event', { type: phase, pod });
        },
        (err: Error | null) => {
          if (err) {
            this.emit('watch:error', err);
          }
        }
      );
    } finally {
      this.connectionPool.delete(abortController);
    }
  }

  /**
   * Execute a command in a pod
   */
  async execInPod(
    podName: string,
    options: ExecOptions
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    await this.ensureConnected();

    const namespace = options.namespace || this.options.defaultNamespace;
    const timeout = options.timeout || this.options.timeout;

    return this.withRetry(async () => {
      await this.acquireRateLimit();
      try {
        const exec = new Exec(this.config);
        
        let stdout = '';
        let stderr = '';
        let exitCode = 0;

        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new K8sClientError(
              `Exec timeout after ${timeout}ms`,
              'TIMEOUT_ERROR'
            ));
          }, timeout);
        });

        const execPromise = new Promise<void>((resolve, reject) => {
          exec.exec(
            namespace,
            podName,
            options.container || '',
            options.command,
            process.stdout,
            process.stderr,
            null,
            options.tty || false,
            (status) => {
              if (status && status.status === 'Failure') {
                exitCode = 1;
                stderr = status.message || '';
              }
              resolve();
            }
          ).catch(reject);
        });

        await Promise.race([execPromise, timeoutPromise]);

        this.emit('pod:exec', {
          namespace,
          podName,
          command: options.command,
          exitCode,
        });

        return { stdout, stderr, exitCode };
      } catch (error) {
        this.rateLimiter.release();
        throw error;
      }
    }, 'execInPod');
  }

  /**
   * Copy a file to a pod
   */
  async copyToPod(
    podName: string,
    localPath: string,
    remotePath: string,
    options: CopyOptions = {}
  ): Promise<void> {
    await this.ensureConnected();

    const namespace = options.namespace || this.options.defaultNamespace;
    const container = options.container;

    await this.withRetry(async () => {
      await this.acquireRateLimit();
      try {
        const exec = new Exec(this.config);
        
        const command = ['tar', '-xf', '-', '-C', remotePath];
        
        await exec.exec(
          namespace,
          podName,
          container || '',
          command,
          process.stdout,
          process.stderr,
          null,
          false,
          () => {}
        );

        this.emit('pod:copyTo', {
          namespace,
          podName,
          localPath,
          remotePath,
        });
      } catch (error) {
        this.rateLimiter.release();
        throw error;
      }
    }, 'copyToPod');
  }

  /**
   * Copy a file from a pod
   */
  async copyFromPod(
    podName: string,
    remotePath: string,
    localPath: string,
    options: CopyOptions = {}
  ): Promise<void> {
    await this.ensureConnected();

    const namespace = options.namespace || this.options.defaultNamespace;
    const container = options.container;

    await this.withRetry(async () => {
      await this.acquireRateLimit();
      try {
        const exec = new Exec(this.config);
        
        const command = ['cat', remotePath];
        
        await exec.exec(
          namespace,
          podName,
          container || '',
          command,
          process.stdout,
          process.stderr,
          null,
          false,
          () => {}
        );

        this.emit('pod:copyFrom', {
          namespace,
          podName,
          remotePath,
          localPath,
        });
      } catch (error) {
        this.rateLimiter.release();
        throw error;
      }
    }, 'copyFromPod');
  }

  /**
   * Wait for pod to be ready
   */
  async waitForPod(
    name: string,
    namespace?: string,
    timeoutMs: number = 60000
  ): Promise<V1Pod> {
    const startTime = Date.now();
    const ns = namespace || this.options.defaultNamespace;

    while (Date.now() - startTime < timeoutMs) {
      try {
        const pod = await this.getPod(name, ns);
        
        if (pod.status?.phase === 'Running') {
          const containerStatuses = pod.status.containerStatuses || [];
          const allReady = containerStatuses.every(
            (status) => status.ready
          );
          
          if (allReady) {
            return pod;
          }
        }

        if (pod.status?.phase === 'Failed' || pod.status?.phase === 'Succeeded') {
          return pod;
        }

        await this.delay(1000);
      } catch (error) {
        if (this.isNotFoundError(error)) {
          await this.delay(1000);
          continue;
        }
        throw error;
      }
    }

    throw new K8sClientError(
      `Timeout waiting for pod ${name} to be ready`,
      'TIMEOUT_ERROR'
    );
  }

  /**
   * Get pod logs
   */
  async getPodLogs(
    name: string,
    namespace?: string,
    container?: string,
    tailLines?: number,
    follow: boolean = false
  ): Promise<string> {
    await this.ensureConnected();

    const ns = namespace || this.options.defaultNamespace;

    return this.withRetry(async () => {
      await this.acquireRateLimit();
      try {
        const log = new Log(this.config);
        
        const response = await this.coreApi.readNamespacedPodLog({
          name,
          namespace: ns,
          ...(container && { container }),
          ...(tailLines && { tailLines }),
          follow,
        });

        return response;
      } catch (error) {
        this.rateLimiter.release();
        throw error;
      }
    }, 'getPodLogs');
  }

  // Private helper methods

  private async ensureConnected(): Promise<void> {
    if (!this.isConnected) {
      throw new K8sClientError(
        'Client not connected. Call connect() first.',
        'CONNECTION_ERROR'
      );
    }
  }

  private async withRetry<T>(
    fn: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    const retryConfig: RetryConfig = {
      maxRetries: this.options.retries,
      baseDelay: this.options.retryDelayBase,
      maxDelay: this.options.maxRetryDelay,
      currentAttempt: 0,
    };

    while (retryConfig.currentAttempt <= retryConfig.maxRetries) {
      try {
        const result = await Promise.race([
          fn(),
          this.createTimeoutPromise(operationName),
        ]);
        return result;
      } catch (error) {
        retryConfig.currentAttempt++;

        if (retryConfig.currentAttempt > retryConfig.maxRetries) {
          const k8sError = this.normalizeError(error);
          this.emit('error', {
            operation: operationName,
            attempt: retryConfig.currentAttempt,
            error: k8sError,
          });
          throw k8sError;
        }

        if (!this.isRetryableError(error)) {
          const k8sError = this.normalizeError(error);
          this.emit('error', {
            operation: operationName,
            attempt: retryConfig.currentAttempt,
            error: k8sError,
          });
          throw k8sError;
        }

        const delay = this.calculateBackoff(retryConfig);
        this.emit('retry', {
          operation: operationName,
          attempt: retryConfig.currentAttempt,
          delay,
          error: this.normalizeError(error),
        });

        await this.delay(delay);
      }
    }

    throw new K8sClientError(
      `Max retries exceeded for ${operationName}`,
      'UNKNOWN_ERROR'
    );
  }

  private createTimeoutPromise(operationName: string): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(
          new K8sClientError(
            `Operation ${operationName} timed out after ${this.options.timeout}ms`,
            'TIMEOUT_ERROR'
          )
        );
      }, this.options.timeout);
    });
  }

  private calculateBackoff(config: RetryConfig): number {
    const exponentialDelay =
      config.baseDelay * Math.pow(2, config.currentAttempt - 1);
    const jitter = Math.random() * 1000;
    return Math.min(exponentialDelay + jitter, config.maxDelay);
  }

  private isRetryableError(error: unknown): boolean {
    if (error instanceof K8sClientError) {
      return ['NETWORK_ERROR', 'TIMEOUT_ERROR', 'RATE_LIMIT_ERROR'].includes(
        error.code
      );
    }

    if (error && typeof error === 'object') {
      const err = error as { statusCode?: number; code?: string };
      
      if (err.statusCode) {
        return [408, 429, 500, 502, 503, 504].includes(err.statusCode);
      }

      if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') {
        return true;
      }
    }

    return false;
  }

  private isNotFoundError(error: unknown): boolean {
    if (error instanceof K8sClientError) {
      return error.code === 'NOT_FOUND';
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
        body?: { message?: string; code?: number };
        code?: string;
      };

      // API errors from k8s client
      if (err.statusCode) {
        const code = this.mapStatusCodeToErrorCode(err.statusCode);
        return new K8sClientError(
          err.body?.message || err.message,
          code,
          err,
          err.statusCode,
          { body: err.body }
        );
      }

      // Network errors
      if (
        err.code === 'ECONNREFUSED' ||
        err.code === 'ECONNRESET' ||
        err.code === 'ENOTFOUND' ||
        err.code === 'ETIMEDOUT'
      ) {
        return new K8sClientError(
          `Network error: ${err.message}`,
          'NETWORK_ERROR',
          err
        );
      }

      // Auth errors
      if (
        err.message?.includes('Unauthorized') ||
        err.message?.includes('Forbidden') ||
        err.code === 'EPROTO'
      ) {
        return new K8sClientError(
          `Authentication error: ${err.message}`,
          'AUTH_ERROR',
          err
        );
      }

      // Timeout
      if (err.message?.includes('timeout') || err.message?.includes('ETIMEDOUT')) {
        return new K8sClientError(
          `Timeout: ${err.message}`,
          'TIMEOUT_ERROR',
          err
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

  private mapStatusCodeToErrorCode(statusCode: number): K8sErrorCode {
    switch (statusCode) {
      case 400:
        return 'VALIDATION_ERROR';
      case 401:
      case 403:
        return 'AUTH_ERROR';
      case 404:
        return 'NOT_FOUND';
      case 408:
        return 'TIMEOUT_ERROR';
      case 429:
        return 'RATE_LIMIT_ERROR';
      case 500:
      case 502:
      case 503:
      case 504:
        return 'API_ERROR';
      default:
        return 'UNKNOWN_ERROR';
    }
  }

  private async acquireRateLimit(): Promise<void> {
    while (!this.rateLimiter.tryAcquire()) {
      await this.delay(10);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private generatePodName(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `pod-${timestamp}-${random}`;
  }

  /**
   * Get current connection pool size
   */
  getConnectionPoolSize(): number {
    return this.connectionPool.size;
  }

  /**
   * Get client configuration
   */
  getConfig(): K8sClientConfig {
    return { ...this.options };
  }
}

export default K8sClient;
