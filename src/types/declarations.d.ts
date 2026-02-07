/**
 * Type declarations for modules without type definitions
 */

declare module 'js-yaml' {
  export function load(text: string): unknown;
  export function loadAll(text: string): unknown[];
  export function dump(obj: unknown): string;
}

declare module 'opossum' {
  import { EventEmitter } from 'events';
  
  export interface CircuitBreakerOptions {
    timeout?: number;
    errorThresholdPercentage?: number;
    resetTimeout?: number;
    volumeThreshold?: number;
  }
  
  export class CircuitBreaker<T> extends EventEmitter {
    constructor(action: (...args: unknown[]) => Promise<T>, options?: CircuitBreakerOptions);
    fire(...args: unknown[]): Promise<T>;
    open(): void;
    close(): void;
    readonly opened: boolean;
    readonly closed: boolean;
    readonly halfOpen: boolean;
    
    on(event: 'open' | 'close' | 'halfOpen', listener: () => void): this;
    on(event: 'fallback', listener: (result: unknown) => void): this;
  }
  
  export default CircuitBreaker;
}
