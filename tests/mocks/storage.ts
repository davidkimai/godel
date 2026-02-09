/**
 * Mock implementations for testing
 */

import { EventEmitter } from 'events';

/**
 * Mock storage backend for snapshot tests
 */
export class MockStorageBackend {
  private storage: Map<string, Buffer> = new Map();
  private corruptedSnapshots: Set<string> = new Set();

  async save(snapshotId: string, data: Buffer): Promise<void> {
    this.storage.set(snapshotId, Buffer.from(data));
  }

  async load(snapshotId: string): Promise<Buffer> {
    if (this.corruptedSnapshots.has(snapshotId)) {
      // Return corrupted data
      const data = this.storage.get(snapshotId);
      if (data) {
        const corrupted = Buffer.from(data);
        corrupted[0] = corrupted[0] ^ 0xFF; // Flip bits
        return corrupted;
      }
    }

    const data = this.storage.get(snapshotId);
    if (!data) {
      throw new Error(`Snapshot ${snapshotId} not found`);
    }
    return Buffer.from(data);
  }

  async delete(snapshotId: string): Promise<void> {
    this.storage.delete(snapshotId);
    this.corruptedSnapshots.delete(snapshotId);
  }

  async exists(snapshotId: string): Promise<boolean> {
    return this.storage.has(snapshotId);
  }

  async getSize(snapshotId: string): Promise<number> {
    const data = this.storage.get(snapshotId);
    return data?.length ?? 0;
  }

  corruptData(snapshotId: string): void {
    this.corruptedSnapshots.add(snapshotId);
  }
}

/**
 * Mock runtime provider for snapshot tests
 */
export class MockRuntimeProvider extends EventEmitter {
  private vms: Map<string, { state: string; healthy: boolean }> = new Map();
  public terminatedRuntimes: Set<string> = new Set();
  private errorToSimulate: string | null = null;

  async create(config: {
    runtimeId: string;
    image?: string;
    resources?: { cpu: number; memory: string };
    volumes?: Array<{ source: string; destination: string; readOnly?: boolean }>;
  }): Promise<{ runtimeId: string; state: string }> {
    if (this.errorToSimulate) {
      throw new Error(this.errorToSimulate);
    }

    this.vms.set(config.runtimeId, {
      state: 'running',
      healthy: true,
    });
    
    return { runtimeId: config.runtimeId, state: 'running' };
  }

  async getStatus(runtimeId: string): Promise<{ state: string; healthy: boolean }> {
    const vm = this.vms.get(runtimeId);
    if (!vm) {
      return { state: 'not-found', healthy: false };
    }
    return { ...vm };
  }

  async terminate(runtimeId: string): Promise<void> {
    this.terminatedRuntimes.add(runtimeId);
    this.vms.delete(runtimeId);
  }

  simulateError(error: string): void {
    this.errorToSimulate = error;
  }

  clearError(): void {
    this.errorToSimulate = null;
  }

  setVMHealth(runtimeId: string, healthy: boolean): void {
    const vm = this.vms.get(runtimeId);
    if (vm) {
      vm.healthy = healthy;
    }
  }
}
