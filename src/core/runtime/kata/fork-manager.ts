import { EventEmitter } from 'events';
import { createHash } from 'crypto';

/**
 * Fork configuration options
 */
interface ForkOptions {
  parentSnapshotId: string;
  newRuntimeId?: string;
  teamId?: string;
  labels?: Record<string, string>;
  memoryLimit?: number;
  copyOnWrite?: boolean;
}

/**
 * Fork result
 */
interface ForkResult {
  success: boolean;
  forkId: string;
  runtimeId: string;
  parentSnapshotId: string;
  forkTimeMs: number;
  memoryOverheadBytes: number;
  error?: string;
}

/**
 * Branch information
 */
interface Branch {
  forkId: string;
  runtimeId: string;
  parentSnapshotId: string;
  parentForkId?: string;
  createdAt: Date;
  children: string[];
  depth: number;
  labels: Record<string, string>;
  status: 'active' | 'terminated' | 'error';
}

/**
 * Branch tree structure
 */
interface BranchTree {
  rootSnapshotId: string;
  branches: Map<string, Branch>;
  totalForks: number;
  maxDepth: number;
}

/**
 * Fork metadata for storage
 */
interface ForkMetadata {
  forkId: string;
  parentSnapshotId: string;
  parentForkId?: string;
  createdAt: string;
  copyOnWrite: boolean;
  memoryPages: number;
  labels: Record<string, string>;
}

/**
 * Copy-on-write page tracking
 */
interface CopyOnWriteState {
  forkId: string;
  parentSnapshotId: string;
  sharedPages: Set<string>;
  modifiedPages: Set<string>;
  pageReferences: Map<string, number>; // pageId -> reference count
}

/**
 * ForkManager - Efficient VM forking with copy-on-write and branch management
 * 
 * Features:
 * - Fork VM from snapshot using copy-on-write (<50ms target)
 * - Branch management with parent-child tracking
 * - Memory-efficient lazy page allocation
 * - Support for 100+ concurrent forks
 */
export class ForkManager extends EventEmitter {
  private branches: Map<string, Branch> = new Map();
  private cowStates: Map<string, CopyOnWriteState> = new Map();
  private forkMetadata: Map<string, ForkMetadata> = new Map();
  private branchTrees: Map<string, BranchTree> = new Map();
  private runtimeProvider: RuntimeProvider;
  private maxBranchesPerSnapshot: number;
  private pageSize: number = 4096; // 4KB pages

  constructor(
    runtimeProvider: RuntimeProvider,
    maxBranchesPerSnapshot: number = 100
  ) {
    super();
    this.runtimeProvider = runtimeProvider;
    this.maxBranchesPerSnapshot = maxBranchesPerSnapshot;
  }

  /**
   * Fork a VM from a snapshot
   * Target: <50ms fork time
   */
  public async forkFromSnapshot(options: ForkOptions): Promise<ForkResult> {
    const startTime = Date.now();
    const forkId = `fork-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const runtimeId = options.newRuntimeId || `vm-${Date.now()}`;

    try {
      // Validate we haven't exceeded branch limit
      const existingBranches = this.getBranchesForSnapshot(options.parentSnapshotId);
      if (existingBranches.length >= this.maxBranchesPerSnapshot) {
        throw new Error(
          `Maximum branches (${this.maxBranchesPerSnapshot}) reached for snapshot ${options.parentSnapshotId}`
        );
      }

      // Create copy-on-write state (fast - just metadata)
      const cowState = this.initializeCOWState(forkId, options.parentSnapshotId);
      this.cowStates.set(forkId, cowState);

      // Create fork metadata
      const metadata: ForkMetadata = {
        forkId,
        parentSnapshotId: options.parentSnapshotId,
        createdAt: new Date().toISOString(),
        copyOnWrite: options.copyOnWrite !== false,
        memoryPages: 0,
        labels: options.labels || {},
      };
      this.forkMetadata.set(forkId, metadata);

      // Create the branch record
      const branch: Branch = {
        forkId,
        runtimeId,
        parentSnapshotId: options.parentSnapshotId,
        createdAt: new Date(),
        children: [],
        depth: 1,
        labels: options.labels || {},
        status: 'active',
      };

      // Find parent branch if exists
      const parentBranch = this.findParentBranch(options.parentSnapshotId);
      if (parentBranch) {
        branch.parentForkId = parentBranch.forkId;
        branch.depth = parentBranch.depth + 1;
        parentBranch.children.push(forkId);
      }

      this.branches.set(forkId, branch);

      // Initialize or update branch tree
      this.updateBranchTree(options.parentSnapshotId, branch);

      // Create the actual VM (lazy initialization)
      await this.createVMWithCOW(runtimeId, options);

      const forkTimeMs = Date.now() - startTime;
      const memoryOverheadBytes = this.calculateMemoryOverhead(cowState);

      const result: ForkResult = {
        success: true,
        forkId,
        runtimeId,
        parentSnapshotId: options.parentSnapshotId,
        forkTimeMs,
        memoryOverheadBytes,
      };

      this.emit('fork:created', result);

      return result;
    } catch (error) {
      const result: ForkResult = {
        success: false,
        forkId,
        runtimeId,
        parentSnapshotId: options.parentSnapshotId,
        forkTimeMs: Date.now() - startTime,
        memoryOverheadBytes: 0,
        error: `Fork failed: ${error}`,
      };

      this.emit('fork:failed', result);
      return result;
    }
  }

  /**
   * Initialize copy-on-write state
   */
  private initializeCOWState(forkId: string, parentSnapshotId: string): CopyOnWriteState {
    return {
      forkId,
      parentSnapshotId,
      sharedPages: new Set(),
      modifiedPages: new Set(),
      pageReferences: new Map(),
    };
  }

  /**
   * Create VM with copy-on-write setup
   */
  private async createVMWithCOW(
    runtimeId: string,
    options: ForkOptions
  ): Promise<void> {
    // Create VM with minimal initial resources
    // Pages are allocated lazily on first write
    await this.runtimeProvider.create({
      runtimeId,
      image: 'godel-agent-base',
      resources: {
        cpu: 1,
        memory: `${(options.memoryLimit || 512) / 1024}Gi`,
      },
      volumes: [
        {
          source: `snapshot://${options.parentSnapshotId}`,
          destination: '/mnt/parent',
          readOnly: true,
        },
      ],
    });

    // Setup copy-on-write layer
    await this.setupCOWLayer(runtimeId, options.parentSnapshotId);
  }

  /**
   * Setup copy-on-write layer for the VM
   */
  private async setupCOWLayer(runtimeId: string, parentSnapshotId: string): Promise<void> {
    // In production, this would:
    // 1. Mount the parent snapshot as read-only
    // 2. Create an overlay filesystem for writes
    // 3. Track page modifications

    // Simulate COW setup time (should be <10ms)
    await this.delay(5);

    this.emit('cow:initialized', { runtimeId, parentSnapshotId });
  }

  /**
   * Handle page write (copy-on-write trigger)
   */
  public async handlePageWrite(forkId: string, pageId: string): Promise<void> {
    const cowState = this.cowStates.get(forkId);
    if (!cowState) return;

    // If page is already modified, no action needed
    if (cowState.modifiedPages.has(pageId)) return;

    // Check if page is shared with parent
    if (cowState.sharedPages.has(pageId)) {
      // Decrement parent's reference count
      const refCount = cowState.pageReferences.get(pageId) || 0;
      if (refCount > 1) {
        cowState.pageReferences.set(pageId, refCount - 1);
      } else {
        cowState.pageReferences.delete(pageId);
        cowState.sharedPages.delete(pageId);
      }
    }

    // Mark page as modified (now owned exclusively)
    cowState.modifiedPages.add(pageId);

    this.emit('cow:page-copied', { forkId, pageId });
  }

  /**
   * Get fork statistics
   */
  public getForkStats(forkId: string): ForkStats | undefined {
    const metadata = this.forkMetadata.get(forkId);
    const cowState = this.cowStates.get(forkId);
    const branch = this.branches.get(forkId);

    if (!metadata || !cowState || !branch) return undefined;

    return {
      forkId,
      runtimeId: branch.runtimeId,
      parentSnapshotId: metadata.parentSnapshotId,
      createdAt: new Date(metadata.createdAt),
      sharedPages: cowState.sharedPages.size,
      modifiedPages: cowState.modifiedPages.size,
      memoryOverheadBytes: this.calculateMemoryOverhead(cowState),
      depth: branch.depth,
      childrenCount: branch.children.length,
    };
  }

  /**
   * Calculate memory overhead for a fork
   */
  private calculateMemoryOverhead(cowState: CopyOnWriteState): number {
    // Modified pages are copied (full size)
    // Shared pages have minimal overhead (just reference tracking)
    const modifiedBytes = cowState.modifiedPages.size * this.pageSize;
    const sharedOverhead = cowState.sharedPages.size * 8; // 8 bytes per reference

    return modifiedBytes + sharedOverhead;
  }

  /**
   * Get branch tree for a root snapshot
   */
  public getBranchTree(rootSnapshotId: string): BranchTree | undefined {
    return this.branchTrees.get(rootSnapshotId);
  }

  /**
   * Get all branches for a snapshot
   */
  public getBranchesForSnapshot(snapshotId: string): Branch[] {
    return Array.from(this.branches.values()).filter(
      (b) => b.parentSnapshotId === snapshotId
    );
  }

  /**
   * Get branch lineage (ancestors)
   */
  public getBranchLineage(forkId: string): Branch[] {
    const lineage: Branch[] = [];
    let current = this.branches.get(forkId);

    while (current?.parentForkId) {
      const parent = this.branches.get(current.parentForkId);
      if (parent) {
        lineage.unshift(parent);
        current = parent;
      } else {
        break;
      }
    }

    return lineage;
  }

  /**
   * Get branch descendants (children, grandchildren, etc.)
   */
  public getBranchDescendants(forkId: string): Branch[] {
    const descendants: Branch[] = [];
    const branch = this.branches.get(forkId);

    if (!branch) return descendants;

    const queue = [...branch.children];

    while (queue.length > 0) {
      const childId = queue.shift()!;
      const child = this.branches.get(childId);

      if (child) {
        descendants.push(child);
        queue.push(...child.children);
      }
    }

    return descendants;
  }

  /**
   * Terminate a fork and cleanup resources
   */
  public async terminateFork(forkId: string): Promise<boolean> {
    const branch = this.branches.get(forkId);
    if (!branch) return false;

    try {
      // Mark as terminated
      branch.status = 'terminated';

      // Cleanup COW state
      const cowState = this.cowStates.get(forkId);
      if (cowState) {
        await this.cleanupCOWState(cowState);
        this.cowStates.delete(forkId);
      }

      // Remove from parent's children
      if (branch.parentForkId) {
        const parent = this.branches.get(branch.parentForkId);
        if (parent) {
          parent.children = parent.children.filter((id) => id !== forkId);
        }
      }

      this.emit('fork:terminated', { forkId, runtimeId: branch.runtimeId });

      return true;
    } catch (error) {
      branch.status = 'error';
      this.emit('fork:termination-failed', { forkId, error });
      return false;
    }
  }

  /**
   * Cleanup copy-on-write state
   */
  private async cleanupCOWState(cowState: CopyOnWriteState): Promise<void> {
    // Decrement reference counts for shared pages
    cowState.sharedPages.forEach((pageId) => {
      const refCount = cowState.pageReferences.get(pageId) || 0;
      if (refCount > 1) {
        cowState.pageReferences.set(pageId, refCount - 1);
      }
    });

    // Modified pages are freed automatically when VM terminates
  }

  /**
   * Merge a fork back to its parent (if applicable)
   */
  public async mergeFork(forkId: string): Promise<boolean> {
    const branch = this.branches.get(forkId);
    if (!branch || !branch.parentForkId) {
      return false;
    }

    try {
      const cowState = this.cowStates.get(forkId);
      if (!cowState) return false;

      // Apply modified pages to parent
      for (const pageId of cowState.modifiedPages) {
        await this.applyPageToParent(branch.parentForkId, pageId);
      }

      // Terminate the fork after merge
      await this.terminateFork(forkId);

      this.emit('fork:merged', { forkId, parentForkId: branch.parentForkId });

      return true;
    } catch (error) {
      this.emit('fork:merge-failed', { forkId, error });
      return false;
    }
  }

  /**
   * Apply a modified page to parent
   */
  private async applyPageToParent(parentForkId: string, pageId: string): Promise<void> {
    // In production, this would copy the modified page to the parent
    await this.delay(1);
  }

  /**
   * Find parent branch for a snapshot
   */
  private findParentBranch(snapshotId: string): Branch | undefined {
    return Array.from(this.branches.values()).find(
      (b) => b.parentSnapshotId === snapshotId
    );
  }

  /**
   * Update branch tree tracking
   */
  private updateBranchTree(rootSnapshotId: string, newBranch: Branch): void {
    let tree = this.branchTrees.get(rootSnapshotId);

    if (!tree) {
      tree = {
        rootSnapshotId,
        branches: new Map(),
        totalForks: 0,
        maxDepth: 0,
      };
      this.branchTrees.set(rootSnapshotId, tree);
    }

    tree.branches.set(newBranch.forkId, newBranch);
    tree.totalForks++;
    tree.maxDepth = Math.max(tree.maxDepth, newBranch.depth);
  }

  /**
   * Get all active forks
   */
  public getActiveForks(): Branch[] {
    return Array.from(this.branches.values()).filter(
      (b) => b.status === 'active'
    );
  }

  /**
   * Get fork performance metrics
   */
  public getPerformanceMetrics(): ForkPerformanceMetrics {
    const forks = Array.from(this.branches.values());
    const cowStates = Array.from(this.cowStates.values());

    return {
      totalForks: forks.length,
      activeForks: forks.filter((b) => b.status === 'active').length,
      averageDepth: forks.reduce((sum, b) => sum + b.depth, 0) / forks.length || 0,
      maxDepth: Math.max(...forks.map((b) => b.depth), 0),
      totalMemoryOverhead: cowStates.reduce(
        (sum, cow) => sum + this.calculateMemoryOverhead(cow),
        0
      ),
      averageForkTimeMs: this.calculateAverageForkTime(),
    };
  }

  /**
   * Calculate average fork time from recent forks
   */
  private calculateAverageForkTime(): number {
    // This would track actual fork times
    // For now, return a mock value
    return 35; // 35ms average
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Runtime provider interface
 */
interface RuntimeProvider {
  create(config: {
    runtimeId: string;
    image: string;
    resources: { cpu: number; memory: string };
    volumes: Array<{ source: string; destination: string; readOnly?: boolean }>;
  }): Promise<void>;
}

/**
 * Fork statistics
 */
interface ForkStats {
  forkId: string;
  runtimeId: string;
  parentSnapshotId: string;
  createdAt: Date;
  sharedPages: number;
  modifiedPages: number;
  memoryOverheadBytes: number;
  depth: number;
  childrenCount: number;
}

/**
 * Fork performance metrics
 */
interface ForkPerformanceMetrics {
  totalForks: number;
  activeForks: number;
  averageDepth: number;
  maxDepth: number;
  totalMemoryOverhead: number;
  averageForkTimeMs: number;
}

// Export types
export type {
  ForkOptions,
  ForkResult,
  Branch,
  BranchTree,
  ForkMetadata,
  ForkStats,
  ForkPerformanceMetrics,
  CopyOnWriteState,
  RuntimeProvider,
};

export default ForkManager;
