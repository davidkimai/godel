/**
 * Agent_2: E2B Client
 * API wrapper with retry logic and circuit breaker pattern
 */

import { EventEmitter } from 'eventemitter3';

export interface E2BClientConfig {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
  circuitBreakerThreshold?: number;
  circuitBreakerResetTime?: number;
}

export interface RetryConfig {
  maxRetries: number;
  delayMs: number;
  backoffMultiplier: number;
  retryableStatuses: number[];
}

export interface CircuitBreakerState {
  state: 'closed' | 'open' | 'half-open';
  failureCount: number;
  lastFailureTime?: number;
  successCount: number;
}

export class E2BClient extends EventEmitter {
  private apiKey: string;
  private baseUrl: string;
  private timeout: number;
  private retryConfig: RetryConfig;
  private circuitBreaker: CircuitBreakerState;
  private circuitBreakerThreshold: number;
  private circuitBreakerResetTime: number;

  constructor(config: E2BClientConfig) {
    super();
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://api.e2b.dev';
    this.timeout = config.timeout || 30000;
    this.circuitBreakerThreshold = config.circuitBreakerThreshold || 5;
    this.circuitBreakerResetTime = config.circuitBreakerResetTime || 60000;

    this.retryConfig = {
      maxRetries: config.maxRetries || 3,
      delayMs: config.retryDelay || 1000,
      backoffMultiplier: 2,
      retryableStatuses: [408, 429, 500, 502, 503, 504]
    };

    this.circuitBreaker = {
      state: 'closed',
      failureCount: 0,
      successCount: 0
    };
  }

  async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    // Check circuit breaker
    if (this.circuitBreaker.state === 'open') {
      if (Date.now() - (this.circuitBreaker.lastFailureTime || 0) > this.circuitBreakerResetTime) {
        this.circuitBreaker.state = 'half-open';
        this.emit('circuit-breaker:half-open');
      } else {
        throw new Error('Circuit breaker is OPEN - too many failures');
      }
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        const result = await this.executeRequest<T>(endpoint, options);
        this.recordSuccess();
        return result;
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < this.retryConfig.maxRetries && this.shouldRetry(error)) {
          const delay = this.calculateDelay(attempt);
          this.emit('retry', { attempt, delay, endpoint, error });
          await this.sleep(delay);
        } else {
          break;
        }
      }
    }

    this.recordFailure();
    throw lastError || new Error('Request failed after retries');
  }

  private async executeRequest<T>(
    endpoint: string,
    options: RequestInit
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          ...options.headers
        },
        signal: controller.signal
      });

      if (!response.ok) {
        const error = new Error(`E2B API error: ${response.status} ${response.statusText}`);
        (error as any).status = response.status;
        throw error;
      }

      return await response.json() as T;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private shouldRetry(error: unknown): boolean {
    const err = error as Error;
    const status = (err as any).status;
    if (status && this.retryConfig.retryableStatuses.includes(status)) {
      return true;
    }
    
    // Retry on network errors
    if (err.message?.includes('fetch') || err.message?.includes('network')) {
      return true;
    }

    return false;
  }

  private calculateDelay(attempt: number): number {
    return this.retryConfig.delayMs * Math.pow(this.retryConfig.backoffMultiplier, attempt);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private recordSuccess(): void {
    if (this.circuitBreaker.state === 'half-open') {
      this.circuitBreaker.successCount++;
      if (this.circuitBreaker.successCount >= 3) {
        this.circuitBreaker.state = 'closed';
        this.circuitBreaker.failureCount = 0;
        this.circuitBreaker.successCount = 0;
        this.emit('circuit-breaker:closed');
      }
    }
  }

  private recordFailure(): void {
    this.circuitBreaker.failureCount++;
    this.circuitBreaker.lastFailureTime = Date.now();

    if (this.circuitBreaker.failureCount >= this.circuitBreakerThreshold) {
      this.circuitBreaker.state = 'open';
      this.emit('circuit-breaker:open');
    }
  }

  getCircuitBreakerState(): CircuitBreakerState {
    return { ...this.circuitBreaker };
  }

  async healthCheck(): Promise<{ healthy: boolean; latency: number }> {
    const start = Date.now();
    try {
      await this.request('/health', { method: 'GET' });
      return { healthy: true, latency: Date.now() - start };
    } catch (error) {
      return { healthy: false, latency: Date.now() - start };
    }
  }

  // Convenience methods
  async getSandboxes(): Promise<any[]> {
    return this.request('/sandboxes');
  }

  async createSandbox(config: any): Promise<any> {
    return this.request('/sandboxes', {
      method: 'POST',
      body: JSON.stringify(config)
    });
  }

  async killSandbox(sandboxId: string): Promise<void> {
    await this.request(`/sandboxes/${sandboxId}`, {
      method: 'DELETE'
    });
  }
}

export default E2BClient;
