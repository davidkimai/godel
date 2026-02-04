import CircuitBreaker from 'opossum';
import { EventEmitter } from 'events';
import { logger } from './logger';

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  resetTimeout?: number;
  timeout?: number;
  errorFilter?: (error: Error) => boolean;
}

export interface CircuitBreakerState {
  name: string;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failures: number;
  successes: number;
  lastFailureTime?: Date;
  nextRetryTime?: Date;
}

export class CircuitBreakerManager extends EventEmitter {
  private breakers: Map<string, CircuitBreaker> = new Map();
  private options: CircuitBreakerOptions;

  constructor(options: CircuitBreakerOptions = {}) {
    super();
    this.options = {
      failureThreshold: 5,
      resetTimeout: 30000,
      timeout: 10000,
      ...options
    };
  }

  createBreaker(name: string, asyncFunction: (...args: any[]) => Promise<any>, options?: CircuitBreakerOptions): CircuitBreaker {
    const opts = { ...this.options, ...options };
    
    const breaker = new CircuitBreaker(asyncFunction, {
      failureThreshold: opts.failureThreshold,
      resetTimeout: opts.resetTimeout,
      timeout: opts.timeout,
      errorFilter: opts.errorFilter,
      name
    });

    breaker.on('open', () => {
      logger.warn(`Circuit breaker '${name}' opened`);
      this.emit('open', { name, state: breaker.opened });
    });

    breaker.on('halfOpen', () => {
      logger.info(`Circuit breaker '${name}' half-open`);
      this.emit('halfOpen', { name });
    });

    breaker.on('close', () => {
      logger.info(`Circuit breaker '${name}' closed`);
      this.emit('close', { name });
    });

    breaker.on('fallback', (result) => {
      logger.warn(`Circuit breaker '${name}' fallback executed`, { result });
      this.emit('fallback', { name, result });
    });

    this.breakers.set(name, breaker);
    return breaker;
  }

  getBreaker(name: string): CircuitBreaker | undefined {
    return this.breakers.get(name);
  }

  getState(name: string): CircuitBreakerState | undefined {
    const breaker = this.breakers.get(name);
    if (!breaker) return undefined;

    return {
      name,
      state: breaker.opened ? 'OPEN' : breaker.halfOpen ? 'HALF_OPEN' : 'CLOSED',
      failures: breaker.stats.failures || 0,
      successes: breaker.stats.successes || 0,
      lastFailureTime: breaker.lastFailureTime,
      nextRetryTime: breaker.nextRetryTime
    };
  }

  getAllStates(): CircuitBreakerState[] {
    return Array.from(this.breakers.keys()).map(name => this.getState(name)!).filter(Boolean);
  }

  async shutdown(): Promise<void> {
    for (const [name, breaker] of this.breakers) {
      breaker.shutdown();
      logger.info(`Circuit breaker '${name}' shutdown`);
    }
    this.breakers.clear();
  }
}

// Singleton instance
let manager: CircuitBreakerManager | null = null;

export function getCircuitBreakerManager(options?: CircuitBreakerOptions): CircuitBreakerManager {
  if (!manager) {
    manager = new CircuitBreakerManager(options);
  }
  return manager;
}

export function resetCircuitBreakerManager(): void {
  if (manager) {
    manager.shutdown();
    manager = null;
  }
}
