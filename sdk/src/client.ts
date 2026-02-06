/**
 * @godel/client SDK - Core Client
 * 
 * The main GodelClient class provides HTTP methods with retry logic,
 * event emitter integration, and automatic error handling.
 */

import { EventEmitter } from 'events';
import axios, {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  AxiosError,
} from 'axios';
import {
  GodelError,
  NetworkError,
  TimeoutError,
  RateLimitError,
  createErrorFromResponse,
} from './errors';
import { SwarmsResource } from './resources/swarms';
import { AgentsResource } from './resources/agents';
import { EventsResource } from './resources/events';

/**
 * Configuration options for GodelClient
 */
export interface GodelClientConfig {
  /** Base URL for the Godel API */
  apiUrl: string;
  /** API key for authentication */
  apiKey: string;
  /** API version to use (default: v1) */
  apiVersion?: string;
  /** Default timeout for requests in milliseconds */
  timeout?: number;
  /** Maximum number of retries for failed requests */
  maxRetries?: number;
  /** Base delay between retries in milliseconds */
  retryDelay?: number;
  /** Whether to retry on network errors */
  retryOnNetworkError?: boolean;
  /** Custom headers to include in all requests */
  headers?: Record<string, string>;
}

/**
 * Request options for individual API calls
 */
export interface RequestOptions {
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Number of retries for this request */
  retries?: number;
  /** Additional headers for this request */
  headers?: Record<string, string>;
  /** Signal for request cancellation */
  signal?: AbortSignal;
}

/**
 * Main client for interacting with the Godel API.
 * Provides typed resources for swarms, agents, and events,
 * along with configurable retry logic and event emission.
 * 
 * @example
 * ```typescript
 * const client = new GodelClient({
 *   apiUrl: 'https://api.godel.io',
 *   apiKey: process.env.GODEL_API_KEY!,
 * });
 * 
 * // Access resources
 * const swarms = await client.swarms.list();
 * const agents = await client.agents.list();
 * const events = await client.events.list();
 * 
 * // Listen for events
 * client.on('request', (req) => console.log('Request:', req.url));
 * client.on('response', (res) => console.log('Response:', res.status));
 * ```
 */
export class GodelClient extends EventEmitter {
  private readonly httpClient: AxiosInstance;
  private readonly config: Required<GodelClientConfig>;

  /** Resource for managing swarms */
  public readonly swarms: SwarmsResource;
  /** Resource for managing agents */
  public readonly agents: AgentsResource;
  /** Resource for managing events */
  public readonly events: EventsResource;

  /**
   * Creates a new GodelClient instance
   * 
   * @param config - Client configuration
   */
  constructor(config: GodelClientConfig) {
    super();

    // Validate required config
    if (!config.apiUrl) {
      throw new GodelError('apiUrl is required');
    }
    if (!config.apiKey) {
      throw new GodelError('apiKey is required');
    }

    // Set defaults
    this.config = {
      apiUrl: config.apiUrl.replace(/\/$/, ''), // Remove trailing slash
      apiKey: config.apiKey,
      apiVersion: config.apiVersion ?? 'v1',
      timeout: config.timeout ?? 30000,
      maxRetries: config.maxRetries ?? 3,
      retryDelay: config.retryDelay ?? 1000,
      retryOnNetworkError: config.retryOnNetworkError ?? true,
      headers: config.headers ?? {},
    };

    // Create axios instance
    this.httpClient = this.createHttpClient();

    // Initialize resources
    this.swarms = new SwarmsResource(this);
    this.agents = new AgentsResource(this);
    this.events = new EventsResource(this);
  }

  /**
   * Create and configure the Axios HTTP client
   */
  private createHttpClient(): AxiosInstance {
    const client = axios.create({
      baseURL: `${this.config.apiUrl}/${this.config.apiVersion}`,
      timeout: this.config.timeout,
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': `@godel/client/1.0.0`,
        ...this.config.headers,
      },
    });

    // Request interceptor
    client.interceptors.request.use(
      (config) => {
        const requestInfo = {
          method: config.method?.toUpperCase(),
          url: config.url,
          headers: config.headers,
          data: config.data,
        };
        this.emit('request', requestInfo);
        return config;
      },
      (error) => {
        this.emit('requestError', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    client.interceptors.response.use(
      (response) => {
        const responseInfo = {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
          data: response.data,
        };
        this.emit('response', responseInfo);
        return response;
      },
      (error) => {
        this.emit('responseError', error);
        return Promise.reject(error);
      }
    );

    return client;
  }

  /**
   * Make an HTTP request with automatic retry logic
   * 
   * @param method - HTTP method
   * @param path - API path
   * @param options - Request options
   * @returns Response data
   */
  async request<T = unknown>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    options: RequestOptions & { body?: unknown; query?: Record<string, unknown> } = {}
  ): Promise<T> {
    const maxRetries = options.retries ?? this.config.maxRetries;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.makeRequest<T>(method, path, options);
        return response.data;
      } catch (error) {
        lastError = error as Error;

        // Check if we should retry
        if (attempt < maxRetries && this.shouldRetry(error as Error, attempt)) {
          const delay = this.calculateDelay(attempt, error as Error);
          this.emit('retry', { attempt, delay, error });
          await this.sleep(delay);
          continue;
        }

        // Don't retry, throw the error
        throw this.normalizeError(error);
      }
    }

    // Should never reach here, but TypeScript needs it
    throw lastError || new GodelError('Request failed after retries');
  }

  /**
   * Execute a single HTTP request
   */
  private async makeRequest<T>(
    method: string,
    path: string,
    options: RequestOptions & { body?: unknown; query?: Record<string, unknown> }
  ): Promise<AxiosResponse<T>> {
    const config: AxiosRequestConfig = {
      method,
      url: path,
      data: options.body,
      params: options.query,
      headers: options.headers,
      timeout: options.timeout,
      signal: options.signal,
    };

    return this.httpClient.request<T>(config);
  }

  /**
   * Determine if a request should be retried
   */
  private shouldRetry(error: Error, _attempt: number): boolean {
    // Don't retry if aborted
    if (error instanceof axios.Cancel || error.name === 'AbortError') {
      return false;
    }

    // Check for specific error types
    if (error instanceof GodelError) {
      return error.isRetryable();
    }

    // Network errors
    if (error instanceof NetworkError && this.config.retryOnNetworkError) {
      return true;
    }

    // Axios errors
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      
      // No response = network error
      if (!axiosError.response) {
        return this.config.retryOnNetworkError;
      }

      // Check status codes
      const status = axiosError.response.status;
      return [429, 502, 503, 504].includes(status);
    }

    return false;
  }

  /**
   * Calculate delay before next retry with exponential backoff
   */
  private calculateDelay(_attempt: number, error: Error): number {
    // Base exponential backoff
    const baseDelay = this.config.retryDelay * Math.pow(2, _attempt);
    
    // Add jitter (±25%)
    const jitter = baseDelay * 0.25 * (Math.random() * 2 - 1);
    let delay = baseDelay + jitter;

    // Respect RateLimit retry-after
    if (error instanceof RateLimitError && error.retryAfter) {
      delay = Math.max(delay, error.retryAfter * 1000);
    }

    // Check for retry-after header
    if (axios.isAxiosError(error)) {
      const retryAfter = (error as AxiosError).response?.headers['retry-after'];
      if (retryAfter) {
        const retryAfterMs = parseInt(retryAfter) * 1000;
        delay = Math.max(delay, retryAfterMs);
      }
    }

    return Math.min(delay, 30000); // Cap at 30 seconds
  }

  /**
   * Normalize various error types to GodelError
   */
  private normalizeError(error: unknown): GodelError {
    // Already a GodelError
    if (error instanceof GodelError) {
      return error;
    }

    // Axios errors
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      const requestId = axiosError.response?.headers['x-request-id'] as string;

      // Network errors (no response)
      if (!axiosError.response) {
        if (axiosError.code === 'ECONNABORTED' || axiosError.code === 'ETIMEDOUT') {
          return new TimeoutError('Request timed out', {
            cause: axiosError,
            details: { timeoutMs: axiosError.config?.timeout },
          });
        }
        return new NetworkError(axiosError.message, { cause: axiosError });
      }

      // HTTP errors with response
      const status = axiosError.response.status;
      const data = (axiosError.response.data || {}) as Record<string, unknown>;
      
      return createErrorFromResponse(status, data, requestId);
    }

    // Unknown error
    if (error instanceof Error) {
      return new GodelError(error.message, { cause: error });
    }

    return new GodelError('Unknown error occurred', { details: { error } });
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Convenience method for GET requests
   */
  async get<T = unknown>(
    path: string,
    query?: Record<string, unknown>,
    options?: RequestOptions
  ): Promise<T> {
    return this.request<T>('GET', path, { ...options, query });
  }

  /**
   * Convenience method for POST requests
   */
  async post<T = unknown>(
    path: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<T> {
    return this.request<T>('POST', path, { ...options, body });
  }

  /**
   * Convenience method for PUT requests
   */
  async put<T = unknown>(
    path: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<T> {
    return this.request<T>('PUT', path, { ...options, body });
  }

  /**
   * Convenience method for PATCH requests
   */
  async patch<T = unknown>(
    path: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<T> {
    return this.request<T>('PATCH', path, { ...options, body });
  }

  /**
   * Convenience method for DELETE requests
   */
  async delete<T = unknown>(
    path: string,
    options?: RequestOptions
  ): Promise<T> {
    return this.request<T>('DELETE', path, options);
  }

  /**
   * Get the current client configuration (for internal use)
   */
  getConfig(): Required<GodelClientConfig> {
    return { ...this.config };
  }

  /**
   * Close the client and cleanup resources
   */
  async close(): Promise<void> {
    this.removeAllListeners();
    // Close any WebSocket connections if implemented
  }
}
