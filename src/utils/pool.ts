/**
 * Connection Pool Configuration
 * Generic connection pool for managing reusable resources
 */

export interface PoolOptions {
  minSize?: number;
  maxSize?: number;
  acquireTimeoutMs?: number;
  idleTimeoutMs?: number;
  validateOnBorrow?: () => boolean | Promise<boolean>;
  onCreate?: () => unknown | Promise<unknown>;
  onDestroy?: (resource: unknown) => void | Promise<void>;
}

export interface PooledResource<T> {
  resource: T;
  lastUsed: number;
  borrowedAt: number;
  id: string;
}

export class ConnectionPool<T = unknown> {
  private available: Map<string, PooledResource<T>>;
  private inUse: Map<string, PooledResource<T>>;
  private options: Required<PoolOptions>;
  private creating: number;
  private readonly resourceFactory: () => T | Promise<T>;

  constructor(
    resourceFactory: () => T | Promise<T>,
    options: PoolOptions = {}
  ) {
    this.resourceFactory = resourceFactory;
    this.available = new Map();
    this.inUse = new Map();
    this.creating = 0;
    this.options = {
      minSize: options.minSize ?? 2,
      maxSize: options.maxSize ?? 10,
      acquireTimeoutMs: options.acquireTimeoutMs ?? 10000,
      idleTimeoutMs: options.idleTimeoutMs ?? 60000,
      validateOnBorrow: options.validateOnBorrow ?? (() => true),
      onCreate: options.onCreate ?? (() => {}),
      onDestroy: options.onDestroy ?? (() => {}),
    };
  }

  async acquire(): Promise<T> {
    // Try to get from available pool
    for (const [id, resource] of this.available) {
      if (Date.now() - resource.lastUsed > this.options.idleTimeoutMs) {
        // Expired, destroy it
        await this.destroyResource(id, resource);
        continue;
      }

      if (this.options.validateOnBorrow()) {
        this.available.delete(id);
        resource.borrowedAt = Date.now();
        this.inUse.set(id, resource);
        return resource.resource;
      }
    }

    // Create new if under max size
    if (this.available.size + this.inUse.size + this.creating < this.options.maxSize) {
      this.creating++;
      try {
        const resource = await this.resourceFactory();
        await this.options.onCreate();

        const id = this.generateId();
        const pooled: PooledResource<T> = {
          resource,
          lastUsed: Date.now(),
          borrowedAt: Date.now(),
          id,
        };

        this.inUse.set(id, pooled);
        return resource;
      } finally {
        this.creating--;
      }
    }

    // Wait for available resource
    return this.waitForResource();
  }

  private async waitForResource(): Promise<T> {
    const start = Date.now();

    while (Date.now() - start < this.options.acquireTimeoutMs) {
      // Check available again
      for (const [id, resource] of this.available) {
        if (this.options.validateOnBorrow()) {
          this.available.delete(id);
          resource.borrowedAt = Date.now();
          this.inUse.set(id, resource);
          return resource.resource;
        }
      }

      // Wait a bit before retrying
      await this.sleep(50);
    }

    throw new Error('Acquire timeout: could not get resource from pool');
  }

  release(resource: T): void {
    for (const [id, pooled] of this.inUse) {
      if (pooled.resource === resource) {
        pooled.lastUsed = Date.now();
        this.inUse.delete(id);

        // Ensure minimum pool size
        if (this.available.size < this.options.minSize) {
          this.available.set(id, pooled);
        } else {
          // Destroy excess
          this.destroyResource(id, pooled);
        }
        return;
      }
    }
  }

  async destroy(resource: T): Promise<void> {
    for (const [id, pooled] of this.inUse) {
      if (pooled.resource === resource) {
        this.inUse.delete(id);
        await this.destroyResource(id, pooled);
        return;
      }
    }

    for (const [id, pooled] of this.available) {
      if (pooled.resource === resource) {
        this.available.delete(id);
        await this.destroyResource(id, pooled);
        return;
      }
    }
  }

  private async destroyResource(id: string, pooled: PooledResource<T>): Promise<void> {
    try {
      await this.options.onDestroy(pooled.resource);
    } catch {
      // Ignore errors during destroy
    }
  }

  async close(): Promise<void> {
    const all = new Map([...this.available, ...this.inUse]);
    this.available.clear();
    this.inUse.clear();

    for (const [id, pooled] of all) {
      await this.destroyResource(id, pooled);
    }
  }

  async warmup(): Promise<void> {
    const promises: Promise<void>[] = [];

    while (this.available.size + this.inUse.size < this.options.minSize) {
      promises.push(
        (async () => {
          const resource = await this.resourceFactory();
          await this.options.onCreate();

          const id = this.generateId();
          this.available.set(id, {
            resource,
            lastUsed: Date.now(),
            borrowedAt: 0,
            id,
          });
        })()
      );
    }

    await Promise.all(promises);
  }

  stats(): {
    available: number;
    inUse: number;
    creating: number;
    total: number;
  } {
    return {
      available: this.available.size,
      inUse: this.inUse.size,
      creating: this.creating,
      total: this.available.size + this.inUse.size,
    };
  }

  private generateId(): string {
    return `resource_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export function createPool<T>(
  resourceFactory: () => T | Promise<T>,
  options?: PoolOptions
): ConnectionPool<T> {
  return new ConnectionPool(resourceFactory, options);
}
