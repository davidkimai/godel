/**
 * @fileoverview WorktreeManager - Git worktree management for parallel agent sessions.
 *
 * This module provides the WorktreeManager class that manages isolated git worktrees
 * for parallel agent development sessions. Worktrees allow multiple agents to work
 * simultaneously on different branches without interfering with each other.
 *
 * Key features:
 * - Create isolated worktrees with automatic branch creation
 * - Link shared dependencies (node_modules, .venv, etc.) via symlinks
 * - Manage worktree lifecycle (create, update activity, cleanup)
 * - Automatic cleanup of inactive worktrees
 * - Git command execution with proper error handling
 * - Event-driven architecture for monitoring
 *
 * @module @dash/core/worktree/manager
 */

import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import { promises as fs, existsSync, mkdirSync, symlinkSync, unlinkSync, statSync, rmdirSync } from 'fs';
import { dirname, join, resolve, basename } from 'path';
import { platform } from 'os';

import {
  WorktreeManager as IWorktreeManager,
  Worktree,
  WorktreeConfig,
  CleanupOptions,
  RepoConfig,
  WorktreeOperationResult,
  GitCommandResult,
  WorktreeStatus,
  CleanupStrategy,
  PackageManager,
  DependencyConfig,
} from './types';

import type { StorageAdapter } from '../../integrations/pi/types';

// ============================================================================
// Constants
// ============================================================================

/** Prefix for worktree IDs */
const WORKTREE_ID_PREFIX = 'wt';

/** Prefix for dash branches */
const BRANCH_PREFIX = 'dash/session';

/** Default subdirectory for worktrees within a repository */
const WORKTREE_SUBDIR = '.dash-worktrees';

/** Supported shared dependency paths by package manager */
const SHARED_DEPENDENCY_PATHS: Record<PackageManager, string[]> = {
  npm: ['node_modules'],
  yarn: ['node_modules', '.yarn/cache'],
  pnpm: ['node_modules', '.pnpm-store'],
  bun: ['node_modules', '.bun-cache'],
};

/** Additional shared paths for common build tools and languages */
const ADDITIONAL_SHARED_PATHS = [
  '.venv',
  'venv',
  '.env',
  'vendor', // Go
  'target', // Rust
  'build',
  'dist',
  '.gradle',
  '.m2',
];

/** Storage key prefix for worktree persistence */
const STORAGE_KEY_PREFIX = 'dash:worktree:';

/** Table name for cold storage */
const WORKTREE_TABLE = 'worktrees';

// ============================================================================
// Error Classes
// ============================================================================

/**
 * Base error class for worktree-related errors.
 */
class WorktreeError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'WorktreeError';
  }
}

/**
 * Error thrown when git command execution fails.
 */
class GitCommandError extends WorktreeError {
  constructor(
    message: string,
    public readonly command: string,
    public readonly exitCode: number,
    public readonly stderr: string
  ) {
    super(message, 'GIT_COMMAND_ERROR', { command, exitCode, stderr });
    this.name = 'GitCommandError';
  }
}

/**
 * Error thrown when repository validation fails.
 */
class RepositoryValidationError extends WorktreeError {
  constructor(message: string, public readonly path: string) {
    super(message, 'REPOSITORY_VALIDATION_ERROR', { path });
    this.name = 'RepositoryValidationError';
  }
}

/**
 * Error thrown when worktree creation fails.
 */
class WorktreeCreationError extends WorktreeError {
  constructor(
    message: string,
    public readonly config: Partial<WorktreeConfig>,
    public readonly cause?: Error
  ) {
    super(message, 'WORKTREE_CREATION_ERROR', { config, cause: cause?.message });
    this.name = 'WorktreeCreationError';
  }
}

/**
 * Error thrown when dependency linking fails.
 */
class DependencyLinkingError extends WorktreeError {
  constructor(
    message: string,
    public readonly worktreePath: string,
    public readonly dependencyPath: string,
    public readonly cause?: Error
  ) {
    super(message, 'DEPENDENCY_LINKING_ERROR', {
      worktreePath,
      dependencyPath,
      cause: cause?.message,
    });
    this.name = 'DependencyLinkingError';
  }
}

// ============================================================================
// WorktreeManager Implementation
// ============================================================================

/**
 * Manages git worktrees for isolated agent development sessions.
 *
 * The WorktreeManager provides a comprehensive API for creating, managing,
 * and cleaning up git worktrees. It supports:
 * - Automatic branch creation and management
 * - Shared dependency linking via symlinks
 * - Activity tracking and automatic cleanup
 * - Event-driven monitoring
 *
 * @example
 * ```typescript
 * const manager = new WorktreeManager('/tmp/worktrees', storage);
 * manager.on('worktree.created', (worktree) => {
 *   console.log(`Created worktree: ${worktree.id}`);
 * });
 *
 * const worktree = await manager.createWorktree({
 *   repository: '/path/to/repo',
 *   baseBranch: 'main',
 *   sessionId: 'session-123',
 *   dependencies: { shared: ['node_modules'], isolated: ['.env'] },
 *   cleanup: 'on_success',
 * });
 * ```
 */
export class WorktreeManager extends EventEmitter implements IWorktreeManager {
  /** Map of worktree ID to Worktree instance */
  private worktrees: Map<string, Worktree> = new Map();

  /** Map of session ID to worktree ID for quick lookup */
  private sessionToWorktree: Map<string, string> = new Map();

  /** Base path for all worktrees */
  private basePath: string;

  /** Storage adapter for persistence */
  private storage: StorageAdapter;

  /** Whether the manager has been initialized */
  private initialized = false;

  /** Cleanup interval handle */
  private cleanupInterval?: NodeJS.Timeout;

  /**
   * Creates a new WorktreeManager instance.
   *
   * @param basePath - Base directory for all worktrees
   * @param storage - Storage adapter for persistence
   */
  constructor(basePath: string, storage: StorageAdapter) {
    super();
    this.basePath = resolve(basePath);
    this.storage = storage;

    // Ensure base path exists
    this.ensureDirectoryExists(this.basePath);
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  /**
   * Initialize the manager by loading existing worktrees from storage.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Load worktrees from cold storage
      const worktrees = await this.loadWorktreesFromStorage();

      for (const worktree of worktrees) {
        this.worktrees.set(worktree.id, worktree);
        this.sessionToWorktree.set(worktree.sessionId, worktree.id);
      }

      this.initialized = true;
      this.emit('manager.initialized', {
        worktreeCount: this.worktrees.size,
        basePath: this.basePath,
      });
    } catch (error) {
      this.emit('manager.error', {
        error: error instanceof Error ? error.message : String(error),
        phase: 'initialization',
      });
      throw error;
    }
  }

  /**
   * Start automatic cleanup of inactive worktrees.
   *
   * @param intervalMs - Cleanup interval in milliseconds (default: 5 minutes)
   * @param maxAgeMs - Maximum age before cleanup (default: 1 hour)
   */
  startAutoCleanup(intervalMs = 5 * 60 * 1000, maxAgeMs = 60 * 60 * 1000): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    this.cleanupInterval = setInterval(async () => {
      try {
        const cleaned = await this.cleanupInactiveWorktrees(maxAgeMs);
        if (cleaned > 0) {
          this.emit('cleanup.completed', { cleaned, timestamp: new Date() });
        }
      } catch (error) {
        this.emit('cleanup.error', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, intervalMs);

    this.emit('cleanup.started', { intervalMs, maxAgeMs });
  }

  /**
   * Stop automatic cleanup.
   */
  stopAutoCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
      this.emit('cleanup.stopped');
    }
  }

  // ============================================================================
  // Core Worktree Operations
  // ============================================================================

  /**
   * Create a new worktree for parallel session isolation.
   *
   * This method:
   * 1. Validates the repository exists and is a git repo
   * 2. Generates a unique worktree ID
   * 3. Creates the worktree directory
   * 4. Creates a new branch from the base branch
   * 5. Sets up the worktree with git worktree add
   * 6. Links shared dependencies
   * 7. Copies isolated files
   * 8. Persists the worktree record
   * 9. Emits the 'worktree.created' event
   *
   * @param config - Configuration for the new worktree
   * @returns Promise resolving to the created worktree
   * @throws WorktreeCreationError if creation fails
   */
  async createWorktree(config: WorktreeConfig): Promise<Worktree> {
    const startTime = Date.now();

    try {
      // Step 1: Validate repository
      const isValidRepo = await this.validateRepository(config.repository);
      if (!isValidRepo) {
        throw new RepositoryValidationError(
          `Invalid or non-existent git repository: ${config.repository}`,
          config.repository
        );
      }

      // Step 2: Generate unique worktree ID
      const timestamp = Date.now();
      const worktreeId = `${WORKTREE_ID_PREFIX}-${config.sessionId.slice(0, 8)}-${timestamp}`;

      // Step 3: Determine worktree path
      const repoName = basename(config.repository);
      const worktreePath = join(this.basePath, `${repoName}-dash`, worktreeId);

      // Step 4: Create branch name
      const branchName = `${BRANCH_PREFIX}-${config.sessionId.slice(0, 8)}`;

      // Step 5: Create parent directory
      this.ensureDirectoryExists(dirname(worktreePath));

      // Step 6: Create the branch
      const branchCreated = await this.createBranch(
        config.repository,
        branchName,
        config.baseBranch
      );

      if (!branchCreated) {
        throw new WorktreeCreationError(
          `Failed to create branch: ${branchName}`,
          config
        );
      }

      // Step 7: Execute git worktree add
      const gitResult = await this.executeGitCommand(config.repository, [
        'worktree',
        'add',
        '-b',
        branchName,
        worktreePath,
        config.baseBranch,
      ]);

      if (!gitResult.success) {
        // Clean up the branch if worktree creation failed
        await this.executeGitCommand(config.repository, [
          'branch',
          '-D',
          branchName,
        ]).catch(() => {
          // Ignore cleanup errors
        });

        throw new GitCommandError(
          `Failed to create worktree: ${gitResult.stderr}`,
          'git worktree add',
          gitResult.exitCode,
          gitResult.stderr
        );
      }

      // Step 8: Create worktree record
      const now = new Date();
      const worktree: Worktree = {
        id: worktreeId,
        path: worktreePath,
        gitDir: join(worktreePath, '.git'),
        branch: branchName,
        sessionId: config.sessionId,
        repositoryPath: config.repository,
        baseBranch: config.baseBranch,
        dependenciesShared: [],
        status: 'active',
        createdAt: now,
        lastActivity: now,
      };

      // Step 9: Detect package manager and create repo config for linking
      const packageManager = await this.detectPackageManager(config.repository);
      const repoConfig: RepoConfig = {
        rootPath: config.repository,
        packageManager,
        sharedDependencyPaths: this.buildSharedDependencyPaths(
          config.repository,
          packageManager,
          config.dependencies.shared
        ),
      };

      // Step 10: Link dependencies
      await this.linkDependencies(worktree, repoConfig);
      worktree.dependenciesShared = Object.keys(repoConfig.sharedDependencyPaths);

      // Step 11: Copy isolated files
      await this.copyIsolatedFiles(worktree, config.dependencies.isolated);

      // Step 12: Save to storage
      await this.saveWorktreeToStorage(worktree);

      // Step 13: Update in-memory maps
      this.worktrees.set(worktree.id, worktree);
      this.sessionToWorktree.set(worktree.sessionId, worktree.id);

      // Step 14: Emit event
      const duration = Date.now() - startTime;
      this.emit('worktree.created', {
        worktree,
        duration,
        config,
      });

      return worktree;
    } catch (error) {
      const duration = Date.now() - startTime;

      this.emit('worktree.error', {
        phase: 'creation',
        config,
        duration,
        error: error instanceof Error ? error.message : String(error),
      });

      if (error instanceof WorktreeError) {
        throw error;
      }

      throw new WorktreeCreationError(
        `Unexpected error creating worktree: ${error instanceof Error ? error.message : String(error)}`,
        config,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Link shared dependencies into a worktree via symlinks.
   *
   * This optimizes disk usage by sharing large dependency directories
   * across multiple worktrees while keeping worktree-specific files isolated.
   *
   * Supported shared dependencies:
   * - node_modules (Node.js)
   * - .venv, venv (Python)
   * - vendor (Go)
   * - target (Rust)
   * - build cache directories
   *
   * @param worktree - The worktree to link dependencies into
   * @param repoConfig - Repository configuration for linking
   * @throws DependencyLinkingError if linking fails
   */
  async linkDependencies(worktree: Worktree, repoConfig: RepoConfig): Promise<void> {
    const linkedPaths: string[] = [];
    const errors: Array<{ path: string; error: Error }> = [];

    for (const [relativePath, originalPath] of Object.entries(repoConfig.sharedDependencyPaths)) {
      try {
        // Check if the original path exists
        const exists = await this.pathExists(originalPath);
        if (!exists) {
          continue; // Skip if dependency doesn't exist in original repo
        }

        // Create parent directories in worktree if needed
        const worktreePath = join(worktree.path, relativePath);
        const parentDir = dirname(worktreePath);
        await this.ensureDirectoryExists(parentDir);

        // Remove existing directory/file if it exists
        await this.removePath(worktreePath).catch(() => {
          // Ignore errors during removal
        });

        // Create symlink
        await this.createSymlink(originalPath, worktreePath);

        linkedPaths.push(relativePath);

        this.emit('dependency.linked', {
          worktreeId: worktree.id,
          source: originalPath,
          target: worktreePath,
        });
      } catch (error) {
        const linkingError = new DependencyLinkingError(
          `Failed to link dependency: ${relativePath}`,
          worktree.path,
          relativePath,
          error instanceof Error ? error : undefined
        );

        errors.push({ path: relativePath, error: linkingError });

        this.emit('dependency.error', {
          worktreeId: worktree.id,
          path: relativePath,
          error: linkingError.message,
        });
      }
    }

    // Update worktree record with linked dependencies
    worktree.dependenciesShared = linkedPaths;
    await this.saveWorktreeToStorage(worktree);

    if (errors.length > 0) {
      // Log warnings but don't throw - partial linking is acceptable
      this.emit('dependencies.partial', {
        worktreeId: worktree.id,
        linked: linkedPaths,
        failed: errors.map((e) => e.path),
      });
    }

    this.emit('dependencies.linked', {
      worktreeId: worktree.id,
      linkedPaths,
      failedCount: errors.length,
    });
  }

  /**
   * Remove a worktree and optionally clean up associated resources.
   *
   * This method:
   * 1. Optionally stashes uncommitted changes if preserveChanges is true
   * 2. Removes the worktree using git worktree remove
   * 3. Optionally removes the associated branch
   * 4. Removes from storage
   * 5. Emits the 'worktree.removed' event
   *
   * @param worktree - The worktree to remove
   * @param options - Optional cleanup configuration
   * @throws WorktreeError if removal fails
   */
  async removeWorktree(worktree: Worktree, options?: CleanupOptions): Promise<void> {
    const startTime = Date.now();

    try {
      const opts: CleanupOptions = {
        removeBranch: false,
        force: false,
        preserveChanges: false,
        ...options,
      };

      // Step 1: Preserve changes if requested
      if (opts.preserveChanges) {
        const stashResult = await this.executeGitCommand(worktree.path, [
          'stash',
          'push',
          '-m',
          `Auto-stash before worktree removal: ${worktree.id}`,
        ]);

        if (!stashResult.success) {
          this.emit('worktree.warning', {
            worktreeId: worktree.id,
            warning: 'Failed to stash changes',
            stderr: stashResult.stderr,
          });
        } else {
          this.emit('worktree.stashed', {
            worktreeId: worktree.id,
            message: stashResult.stdout,
          });
        }
      }

      // Step 2: Check for uncommitted changes
      const statusResult = await this.executeGitCommand(worktree.path, [
        'status',
        '--porcelain',
      ]);

      const hasChanges = statusResult.success && statusResult.stdout.trim().length > 0;

      if (hasChanges && !opts.force && !opts.preserveChanges) {
        throw new WorktreeError(
          `Worktree has uncommitted changes. Use force: true or preserveChanges: true to remove.`,
          'WORKTREE_HAS_CHANGES',
          { worktreeId: worktree.id }
        );
      }

      // Step 3: Remove the worktree using git worktree remove
      const removeArgs = ['worktree', 'remove'];
      if (opts.force) {
        removeArgs.push('--force');
      }
      removeArgs.push(worktree.path);

      const removeResult = await this.executeGitCommand(worktree.repositoryPath, removeArgs);

      if (!removeResult.success) {
        // Fallback: manually remove the directory
        this.emit('worktree.warning', {
          worktreeId: worktree.id,
          warning: 'Git worktree remove failed, attempting manual removal',
          stderr: removeResult.stderr,
        });

        await this.removeDirectoryRecursive(worktree.path);
      }

      // Step 4: Remove branch if requested
      if (opts.removeBranch) {
        const branchResult = await this.executeGitCommand(worktree.repositoryPath, [
          'branch',
          '-D',
          worktree.branch,
        ]);

        if (!branchResult.success) {
          this.emit('worktree.warning', {
            worktreeId: worktree.id,
            warning: `Failed to remove branch: ${worktree.branch}`,
            stderr: branchResult.stderr,
          });
        } else {
          this.emit('worktree.branchRemoved', {
            worktreeId: worktree.id,
            branch: worktree.branch,
          });
        }
      }

      // Step 5: Remove from storage
      await this.removeWorktreeFromStorage(worktree.id);

      // Step 6: Update in-memory maps
      this.worktrees.delete(worktree.id);
      this.sessionToWorktree.delete(worktree.sessionId);

      // Step 7: Emit event
      const duration = Date.now() - startTime;
      this.emit('worktree.removed', {
        worktreeId: worktree.id,
        sessionId: worktree.sessionId,
        duration,
        options: opts,
      });
    } catch (error) {
      const duration = Date.now() - startTime;

      this.emit('worktree.error', {
        phase: 'removal',
        worktreeId: worktree.id,
        duration,
        error: error instanceof Error ? error.message : String(error),
      });

      if (error instanceof WorktreeError) {
        throw error;
      }

      throw new WorktreeError(
        `Failed to remove worktree: ${error instanceof Error ? error.message : String(error)}`,
        'WORKTREE_REMOVAL_ERROR',
        { worktreeId: worktree.id }
      );
    }
  }

  /**
   * List all worktrees, optionally filtered by repository.
   *
   * @param repository - Optional repository path to filter by
   * @returns Promise resolving to array of worktrees
   */
  async listWorktrees(repository?: string): Promise<Worktree[]> {
    const worktrees = Array.from(this.worktrees.values());

    if (repository) {
      const resolvedRepo = resolve(repository);
      return worktrees.filter((wt) => resolve(wt.repositoryPath) === resolvedRepo);
    }

    return worktrees;
  }

  /**
   * Get a specific worktree by its ID.
   *
   * @param id - The worktree ID to look up
   * @returns Promise resolving to the worktree, or null if not found
   */
  async getWorktree(id: string): Promise<Worktree | null> {
    return this.worktrees.get(id) || null;
  }

  /**
   * Get the worktree associated with a specific session.
   *
   * @param sessionId - The session ID to look up
   * @returns Promise resolving to the worktree, or null if not found
   */
  async getWorktreeForSession(sessionId: string): Promise<Worktree | null> {
    const worktreeId = this.sessionToWorktree.get(sessionId);
    if (!worktreeId) {
      return null;
    }
    return this.worktrees.get(worktreeId) || null;
  }

  /**
   * Update the last activity timestamp for a worktree.
   *
   * Should be called periodically to track active vs inactive worktrees.
   *
   * @param id - The worktree ID to update
   * @throws WorktreeError if worktree not found
   */
  async updateActivity(id: string): Promise<void> {
    const worktree = this.worktrees.get(id);

    if (!worktree) {
      throw new WorktreeError(
        `Worktree not found: ${id}`,
        'WORKTREE_NOT_FOUND',
        { worktreeId: id }
      );
    }

    const previousActivity = worktree.lastActivity;
    worktree.lastActivity = new Date();

    await this.saveWorktreeToStorage(worktree);

    this.emit('worktree.updated', {
      worktreeId: id,
      field: 'lastActivity',
      previousValue: previousActivity,
      newValue: worktree.lastActivity,
    });
  }

  /**
   * Clean up worktrees that have been inactive beyond the specified threshold.
   *
   * This method:
   * 1. Lists all worktrees
   * 2. Filters by status and lastActivity
   * 3. For each inactive worktree:
   *    - If cleanup policy is 'delayed', remove it
   *    - If 'on_success' and session completed, remove it
   *    - If 'immediate', remove it
   * 4. Returns count of removed worktrees
   *
   * @param maxAgeMs - Maximum age in milliseconds before a worktree is considered inactive
   * @returns Promise resolving to the number of worktrees cleaned up
   */
  async cleanupInactiveWorktrees(maxAgeMs: number): Promise<number> {
    const now = Date.now();
    const worktrees = await this.listWorktrees();
    const toCleanup: Worktree[] = [];

    for (const worktree of worktrees) {
      const age = now - worktree.lastActivity.getTime();

      if (age < maxAgeMs) {
        continue; // Still active
      }

      // Determine if this worktree should be cleaned up based on its cleanup strategy
      // Note: The cleanup strategy would typically be stored in the worktree or
      // retrieved from the session configuration. For now, we assume delayed cleanup.

      if (worktree.status === 'cleanup_pending' || worktree.status === 'suspended') {
        toCleanup.push(worktree);
      }
    }

    let removedCount = 0;
    const errors: Array<{ worktreeId: string; error: string }> = [];

    for (const worktree of toCleanup) {
      try {
        await this.removeWorktree(worktree, {
          removeBranch: false, // Keep branches for potential recovery
          force: false,
          preserveChanges: true, // Try to preserve any changes
        });
        removedCount++;
      } catch (error) {
        errors.push({
          worktreeId: worktree.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (errors.length > 0) {
      this.emit('cleanup.errors', {
        errors,
        attempted: toCleanup.length,
        succeeded: removedCount,
      });
    }

    this.emit('cleanup.completed', {
      checked: worktrees.length,
      cleaned: removedCount,
      errors: errors.length,
      threshold: maxAgeMs,
    });

    return removedCount;
  }

  // ============================================================================
  // Git Operations
  // ============================================================================

  /**
   * Execute a git command and return the result.
   *
   * @param cwd - Working directory for the command
   * @param args - Arguments to pass to git
   * @returns Promise resolving to command result
   */
  private async executeGitCommand(cwd: string, args: string[]): Promise<GitCommandResult> {
    return new Promise((resolve) => {
      const child = spawn('git', args, {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: process.env,
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        resolve({
          success: code === 0,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: code ?? -1,
        });
      });

      child.on('error', (error) => {
        resolve({
          success: false,
          stdout: '',
          stderr: error.message,
          exitCode: -1,
        });
      });
    });
  }

  /**
   * Validate that a path is a valid git repository.
   *
   * @param repoPath - Path to validate
   * @returns Promise resolving to true if valid
   */
  private async validateRepository(repoPath: string): Promise<boolean> {
    try {
      // Check if path exists
      const stats = await fs.stat(repoPath);
      if (!stats.isDirectory()) {
        return false;
      }

      // Check if it's a git repository
      const result = await this.executeGitCommand(repoPath, ['rev-parse', '--git-dir']);
      return result.success;
    } catch {
      return false;
    }
  }

  /**
   * Create a new branch in the repository.
   *
   * @param repoPath - Path to the repository
   * @param branchName - Name for the new branch
   * @param baseBranch - Branch to create from
   * @returns Promise resolving to true if successful
   */
  private async createBranch(
    repoPath: string,
    branchName: string,
    baseBranch: string
  ): Promise<boolean> {
    const result = await this.executeGitCommand(repoPath, [
      'checkout',
      '-b',
      branchName,
      baseBranch,
    ]);

    if (!result.success) {
      // Branch might already exist, try to checkout existing
      const checkoutResult = await this.executeGitCommand(repoPath, [
        'checkout',
        branchName,
      ]);

      if (!checkoutResult.success) {
        return false;
      }
    }

    // Return to base branch
    await this.executeGitCommand(repoPath, ['checkout', baseBranch]);

    return true;
  }

  // ============================================================================
  // Dependency Management
  // ============================================================================

  /**
   * Detect the package manager used in a repository.
   *
   * @param repoPath - Path to the repository
   * @returns Promise resolving to detected package manager
   */
  private async detectPackageManager(repoPath: string): Promise<PackageManager> {
    // Check for lock files to determine package manager
    const lockFiles: Array<{ file: string; manager: PackageManager }> = [
      { file: 'bun.lockb', manager: 'bun' },
      { file: 'pnpm-lock.yaml', manager: 'pnpm' },
      { file: 'yarn.lock', manager: 'yarn' },
      { file: 'package-lock.json', manager: 'npm' },
    ];

    for (const { file, manager } of lockFiles) {
      const exists = await this.pathExists(join(repoPath, file));
      if (exists) {
        return manager;
      }
    }

    // Default to npm if no lock file found
    return 'npm';
  }

  /**
   * Build a map of shared dependency paths.
   *
   * @param repoPath - Path to the repository
   * @param packageManager - Detected package manager
   * @param customPaths - Additional custom paths to share
   * @returns Map of relative paths to absolute paths
   */
  private buildSharedDependencyPaths(
    repoPath: string,
    packageManager: PackageManager,
    customPaths: string[] = []
  ): Record<string, string> {
    const paths: Record<string, string> = {};

    // Add standard paths for the package manager
    const standardPaths = SHARED_DEPENDENCY_PATHS[packageManager] || [];
    for (const relativePath of standardPaths) {
      paths[relativePath] = join(repoPath, relativePath);
    }

    // Add additional shared paths
    for (const relativePath of ADDITIONAL_SHARED_PATHS) {
      paths[relativePath] = join(repoPath, relativePath);
    }

    // Add custom paths
    for (const relativePath of customPaths) {
      paths[relativePath] = join(repoPath, relativePath);
    }

    return paths;
  }

  /**
   * Create symlinks for shared paths.
   *
   * @param worktree - Target worktree
   * @param sharedPaths - Paths to symlink
   * @throws DependencyLinkingError if symlink creation fails
   */
  private async createSymlinks(worktree: Worktree, sharedPaths: string[]): Promise<void> {
    for (const relativePath of sharedPaths) {
      const source = join(worktree.repositoryPath, relativePath);
      const target = join(worktree.path, relativePath);

      try {
        // Ensure parent directory exists
        const parentDir = dirname(target);
        await this.ensureDirectoryExists(parentDir);

        // Remove existing file/directory at target
        await this.removePath(target);

        // Create symlink
        await this.createSymlink(source, target);

        this.emit('symlink.created', {
          worktreeId: worktree.id,
          source,
          target,
        });
      } catch (error) {
        throw new DependencyLinkingError(
          `Failed to create symlink for ${relativePath}`,
          worktree.path,
          relativePath,
          error instanceof Error ? error : undefined
        );
      }
    }
  }

  /**
   * Copy isolated files to the worktree.
   *
   * @param worktree - Target worktree
   * @param isolatedPaths - Paths to copy
   */
  private async copyIsolatedFiles(worktree: Worktree, isolatedPaths: string[]): Promise<void> {
    for (const relativePath of isolatedPaths) {
      const source = join(worktree.repositoryPath, relativePath);
      const target = join(worktree.path, relativePath);

      try {
        const exists = await this.pathExists(source);
        if (!exists) {
          continue; // Skip if source doesn't exist
        }

        const sourceStat = await fs.stat(source);

        if (sourceStat.isDirectory()) {
          await this.copyDirectoryRecursive(source, target);
        } else {
          // Ensure parent directory exists
          const parentDir = dirname(target);
          await this.ensureDirectoryExists(parentDir);
          await fs.copyFile(source, target);
        }

        this.emit('file.copied', {
          worktreeId: worktree.id,
          source,
          target,
        });
      } catch (error) {
        this.emit('file.copyError', {
          worktreeId: worktree.id,
          source,
          target,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  // ============================================================================
  // Storage Operations
  // ============================================================================

  /**
   * Load all worktrees from storage.
   *
   * @returns Promise resolving to array of worktrees
   */
  private async loadWorktreesFromStorage(): Promise<Worktree[]> {
    try {
      // Try hot storage first
      const hotData = await this.storage.loadHot<Record<string, unknown>[]>(`${STORAGE_KEY_PREFIX}all`);
      if (hotData) {
        return hotData.map((wt) => this.deserializeWorktree(wt));
      }

      // Fall back to cold storage query
      // Note: This would require a query method on storage adapter
      // For now, return empty array
      return [];
    } catch (error) {
      this.emit('storage.error', {
        operation: 'load',
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Save a worktree to storage.
   *
   * @param worktree - Worktree to save
   */
  private async saveWorktreeToStorage(worktree: Worktree): Promise<void> {
    try {
      const serialized = this.serializeWorktree(worktree);

      // Save to hot storage with TTL
      await this.storage.saveHot(
        `${STORAGE_KEY_PREFIX}${worktree.id}`,
        serialized,
        24 * 60 * 60 * 1000 // 24 hour TTL
      );

      // Save to cold storage for persistence
      await this.storage.saveCold(WORKTREE_TABLE, serialized);
    } catch (error) {
      this.emit('storage.error', {
        operation: 'save',
        worktreeId: worktree.id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Remove a worktree from storage.
   *
   * @param worktreeId - ID of worktree to remove
   */
  private async removeWorktreeFromStorage(worktreeId: string): Promise<void> {
    try {
      await this.storage.delete(`${STORAGE_KEY_PREFIX}${worktreeId}`);
    } catch (error) {
      this.emit('storage.error', {
        operation: 'delete',
        worktreeId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Serialize a worktree for storage.
   *
   * @param worktree - Worktree to serialize
   * @returns Serialized worktree object
   */
  private serializeWorktree(worktree: Worktree): Record<string, unknown> {
    return {
      id: worktree.id,
      path: worktree.path,
      gitDir: worktree.gitDir,
      branch: worktree.branch,
      sessionId: worktree.sessionId,
      repositoryPath: worktree.repositoryPath,
      baseBranch: worktree.baseBranch,
      dependenciesShared: worktree.dependenciesShared,
      status: worktree.status,
      createdAt: worktree.createdAt.toISOString(),
      lastActivity: worktree.lastActivity.toISOString(),
    };
  }

  /**
   * Deserialize a worktree from storage.
   *
   * @param data - Serialized worktree data
   * @returns Deserialized Worktree instance
   */
  private deserializeWorktree(data: Record<string, unknown>): Worktree {
    return {
      ...data,
      createdAt: new Date(data['createdAt'] as string),
      lastActivity: new Date(data['lastActivity'] as string),
    } as Worktree;
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Ensure a directory exists, creating it if necessary.
   *
   * @param path - Directory path
   */
  private async ensureDirectoryExists(path: string): Promise<void> {
    try {
      await fs.mkdir(path, { recursive: true });
    } catch (error) {
      // Ignore EEXIST errors
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }
    }
  }

  /**
   * Check if a path exists.
   *
   * @param path - Path to check
   * @returns Promise resolving to true if exists
   */
  private async pathExists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Remove a file or directory at the given path.
   *
   * @param path - Path to remove
   */
  private async removePath(path: string): Promise<void> {
    try {
      const stat = await fs.stat(path);
      if (stat.isDirectory()) {
        await fs.rmdir(path, { recursive: true });
      } else {
        await fs.unlink(path);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * Create a symlink (junction on Windows, symlink elsewhere).
   *
   * @param target - Target path
   * @param linkPath - Link path
   */
  private async createSymlink(target: string, linkPath: string): Promise<void> {
    const isWindows = platform() === 'win32';

    try {
      if (isWindows) {
        // Use junction for directories on Windows
        const targetStat = await fs.stat(target);
        const type = targetStat.isDirectory() ? 'junction' : 'file';
        await fs.symlink(target, linkPath, type);
      } else {
        // Use standard symlink on Unix
        await fs.symlink(target, linkPath);
      }
    } catch (error) {
      // If symlink fails, try copying as fallback
      this.emit('symlink.fallback', {
        target,
        linkPath,
        error: error instanceof Error ? error.message : String(error),
      });

      const targetStat = await fs.stat(target);
      if (targetStat.isDirectory()) {
        await this.copyDirectoryRecursive(target, linkPath);
      } else {
        await fs.copyFile(target, linkPath);
      }
    }
  }

  /**
   * Recursively copy a directory.
   *
   * @param source - Source directory
   * @param target - Target directory
   */
  private async copyDirectoryRecursive(source: string, target: string): Promise<void> {
    await this.ensureDirectoryExists(target);

    const entries = await fs.readdir(source, { withFileTypes: true });

    for (const entry of entries) {
      const sourcePath = join(source, entry.name);
      const targetPath = join(target, entry.name);

      if (entry.isDirectory()) {
        await this.copyDirectoryRecursive(sourcePath, targetPath);
      } else {
        await fs.copyFile(sourcePath, targetPath);
      }
    }
  }

  /**
   * Recursively remove a directory.
   *
   * @param path - Directory to remove
   */
  private async removeDirectoryRecursive(path: string): Promise<void> {
    try {
      await fs.rmdir(path, { recursive: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  // ============================================================================
  // Status and Metrics
  // ============================================================================

  /**
   * Get current manager status and metrics.
   *
   * @returns Status object with worktree counts and paths
   */
  getStatus(): {
    totalWorktrees: number;
    activeWorktrees: number;
    suspendedWorktrees: number;
    cleanupPendingWorktrees: number;
    basePath: string;
    initialized: boolean;
  } {
    const worktrees = Array.from(this.worktrees.values());

    return {
      totalWorktrees: worktrees.length,
      activeWorktrees: worktrees.filter((wt) => wt.status === 'active').length,
      suspendedWorktrees: worktrees.filter((wt) => wt.status === 'suspended').length,
      cleanupPendingWorktrees: worktrees.filter((wt) => wt.status === 'cleanup_pending').length,
      basePath: this.basePath,
      initialized: this.initialized,
    };
  }

  /**
   * Suspend a worktree, marking it for potential cleanup.
   *
   * @param id - Worktree ID to suspend
   * @throws WorktreeError if worktree not found
   */
  async suspendWorktree(id: string): Promise<void> {
    const worktree = this.worktrees.get(id);

    if (!worktree) {
      throw new WorktreeError(
        `Worktree not found: ${id}`,
        'WORKTREE_NOT_FOUND',
        { worktreeId: id }
      );
    }

    const previousStatus = worktree.status;
    worktree.status = 'suspended';
    worktree.lastActivity = new Date();

    await this.saveWorktreeToStorage(worktree);

    this.emit('worktree.suspended', {
      worktreeId: id,
      previousStatus,
      newStatus: 'suspended',
    });
  }

  /**
   * Resume a suspended worktree.
   *
   * @param id - Worktree ID to resume
   * @throws WorktreeError if worktree not found
   */
  async resumeWorktree(id: string): Promise<void> {
    const worktree = this.worktrees.get(id);

    if (!worktree) {
      throw new WorktreeError(
        `Worktree not found: ${id}`,
        'WORKTREE_NOT_FOUND',
        { worktreeId: id }
      );
    }

    const previousStatus = worktree.status;
    worktree.status = 'active';
    worktree.lastActivity = new Date();

    await this.saveWorktreeToStorage(worktree);

    this.emit('worktree.resumed', {
      worktreeId: id,
      previousStatus,
      newStatus: 'active',
    });
  }

  /**
   * Mark a worktree for cleanup.
   *
   * @param id - Worktree ID to mark
   * @throws WorktreeError if worktree not found
   */
  async markForCleanup(id: string): Promise<void> {
    const worktree = this.worktrees.get(id);

    if (!worktree) {
      throw new WorktreeError(
        `Worktree not found: ${id}`,
        'WORKTREE_NOT_FOUND',
        { worktreeId: id }
      );
    }

    const previousStatus = worktree.status;
    worktree.status = 'cleanup_pending';
    worktree.lastActivity = new Date();

    await this.saveWorktreeToStorage(worktree);

    this.emit('worktree.markedForCleanup', {
      worktreeId: id,
      previousStatus,
      newStatus: 'cleanup_pending',
    });
  }

  /**
   * Dispose of the manager, cleaning up resources.
   */
  dispose(): void {
    this.stopAutoCleanup();
    this.removeAllListeners();
    this.worktrees.clear();
    this.sessionToWorktree.clear();
  }
}

// ============================================================================
// Agent Tool Integration
// ============================================================================

/**
 * Context provided to agent tool executions.
 */
interface ToolContext {
  sessionId: string;
  worktreePath?: string;
}

/**
 * Tool definition for worktree management.
 */
export const worktreeTool = {
  name: 'worktree',
  description: 'Manage git worktrees for isolated development',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['create', 'switch', 'commit', 'push', 'cleanup', 'status', 'stash', 'branch'],
        description: 'The worktree operation to perform',
      },
      branch: {
        type: 'string',
        description: 'Branch name for switch or create operations',
      },
      message: {
        type: 'string',
        description: 'Commit message for commit operations',
      },
      includeUntracked: {
        type: 'boolean',
        description: 'Whether to include untracked files in stash/commit',
      },
      force: {
        type: 'boolean',
        description: 'Force the operation if needed',
      },
    },
    required: ['action'],
  },

  /**
   * Execute a worktree tool action.
   *
   * @param params - Tool parameters
   * @param context - Execution context
   * @returns Operation result
   */
  async execute(
    params: {
      action: string;
      branch?: string;
      message?: string;
      includeUntracked?: boolean;
      force?: boolean;
    },
    context: ToolContext
  ): Promise<WorktreeOperationResult> {
    const manager = getGlobalWorktreeManager();

    if (!manager) {
      return {
        success: false,
        error: 'WorktreeManager not initialized',
      };
    }

    try {
      const worktree = await manager.getWorktreeForSession(context.sessionId);

      if (!worktree && params.action !== 'create') {
        return {
          success: false,
          error: `No worktree found for session: ${context.sessionId}`,
        };
      }

      switch (params.action) {
        case 'status': {
          if (!worktree) {
            return {
              success: false,
              error: 'No worktree available',
            };
          }

          const result = await (manager as WorktreeManager)['executeGitCommand'](
            worktree.path,
            ['status', '--porcelain']
          );

          return {
            success: result.success,
            commandOutput: result.stdout,
            error: result.success ? undefined : result.stderr,
          };
        }

        case 'commit': {
          if (!worktree) {
            return {
              success: false,
              error: 'No worktree available',
            };
          }

          if (!params.message) {
            return {
              success: false,
              error: 'Commit message is required',
            };
          }

          // Stage all changes first
          const addResult = await (manager as WorktreeManager)['executeGitCommand'](
            worktree.path,
            ['add', '.']
          );

          if (!addResult.success) {
            return {
              success: false,
              error: `Failed to stage changes: ${addResult.stderr}`,
            };
          }

          const commitResult = await (manager as WorktreeManager)['executeGitCommand'](
            worktree.path,
            ['commit', '-m', params.message]
          );

          return {
            success: commitResult.success,
            commandOutput: commitResult.stdout,
            error: commitResult.success ? undefined : commitResult.stderr,
          };
        }

        case 'push': {
          if (!worktree) {
            return {
              success: false,
              error: 'No worktree available',
            };
          }

          const pushResult = await (manager as WorktreeManager)['executeGitCommand'](
            worktree.path,
            ['push', 'origin', worktree.branch]
          );

          return {
            success: pushResult.success,
            commandOutput: pushResult.stdout,
            error: pushResult.success ? undefined : pushResult.stderr,
          };
        }

        case 'stash': {
          if (!worktree) {
            return {
              success: false,
              error: 'No worktree available',
            };
          }

          const stashArgs = ['stash'];
          if (params.includeUntracked) {
            stashArgs.push('-u');
          }

          const stashResult = await (manager as WorktreeManager)['executeGitCommand'](
            worktree.path,
            stashArgs
          );

          return {
            success: stashResult.success,
            commandOutput: stashResult.stdout,
            error: stashResult.success ? undefined : stashResult.stderr,
          };
        }

        case 'branch': {
          if (!worktree) {
            return {
              success: false,
              error: 'No worktree available',
            };
          }

          const branchResult = await (manager as WorktreeManager)['executeGitCommand'](
            worktree.path,
            ['branch', '-a']
          );

          return {
            success: branchResult.success,
            commandOutput: branchResult.stdout,
            error: branchResult.success ? undefined : branchResult.stderr,
          };
        }

        case 'cleanup': {
          if (!worktree) {
            return {
              success: false,
              error: 'No worktree available',
            };
          }

          await manager.removeWorktree(worktree, {
            preserveChanges: true,
            removeBranch: false,
            force: params.force || false,
          });

          return {
            success: true,
            commandOutput: `Worktree ${worktree.id} cleaned up successfully`,
          };
        }

        default:
          return {
            success: false,
            error: `Unknown action: ${params.action}`,
          };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};

// ============================================================================
// Global Singleton
// ============================================================================

/** Global worktree manager instance */
let globalWorktreeManager: WorktreeManager | null = null;

/**
 * Get the global worktree manager instance.
 *
 * @returns The global WorktreeManager or null if not initialized
 */
export function getGlobalWorktreeManager(): WorktreeManager | null {
  return globalWorktreeManager;
}

/**
 * Initialize the global worktree manager.
 *
 * @param basePath - Base directory for all worktrees
 * @param storage - Storage adapter for persistence
 * @returns The initialized WorktreeManager
 */
export function initializeGlobalWorktreeManager(
  basePath: string,
  storage: StorageAdapter
): WorktreeManager {
  if (globalWorktreeManager) {
    globalWorktreeManager.dispose();
  }

  globalWorktreeManager = new WorktreeManager(basePath, storage);
  return globalWorktreeManager;
}

/**
 * Reset the global worktree manager (primarily for testing).
 */
export function resetGlobalWorktreeManager(): void {
  if (globalWorktreeManager) {
    globalWorktreeManager.dispose();
    globalWorktreeManager = null;
  }
}

// ============================================================================
// Re-exports
// ============================================================================

export type {
  Worktree,
  WorktreeConfig,
  CleanupOptions,
  RepoConfig,
  WorktreeOperationResult,
  GitCommandResult,
  WorktreeStatus,
  CleanupStrategy,
  PackageManager,
  DependencyConfig,
} from './types';

export {
  WorktreeError,
  GitCommandError,
  RepositoryValidationError,
  WorktreeCreationError,
  DependencyLinkingError,
};

// Also export the error classes for internal use
export type {
  WorktreeError as WorktreeErrorClass,
  GitCommandError as GitCommandErrorClass,
  RepositoryValidationError as RepositoryValidationErrorClass,
  WorktreeCreationError as WorktreeCreationErrorClass,
  DependencyLinkingError as DependencyLinkingErrorClass,
};
