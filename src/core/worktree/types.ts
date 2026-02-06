/**
 * @fileoverview Type definitions for git worktree session isolation.
 *
 * This module provides TypeScript interfaces and types for managing isolated
 * git worktrees to enable parallel agent sessions with clean context separation.
 * Worktrees allow multiple agents to work simultaneously on different branches
 * without interfering with each other.
 *
 * @module @dash/core/worktree/types
 */

/**
 * Represents the current status of a worktree.
 * - 'active': Worktree is currently in use by a session
 * - 'suspended': Worktree is paused but preserved for later use
 * - 'cleanup_pending': Worktree is marked for cleanup/deletion
 */
export type WorktreeStatus = 'active' | 'suspended' | 'cleanup_pending';

/**
 * Cleanup strategy for worktree lifecycle management.
 * - 'immediate': Remove worktree immediately when session ends
 * - 'on_success': Remove only if session completed successfully
 * - 'delayed': Keep for a period before cleanup
 * - 'manual': Require explicit cleanup call
 */
export type CleanupStrategy = 'immediate' | 'on_success' | 'delayed' | 'manual';

/**
 * Supported package managers for dependency linking.
 */
export type PackageManager = 'npm' | 'yarn' | 'pnpm' | 'bun';

/**
 * Represents an isolated git worktree for parallel agent sessions.
 *
 * Each worktree provides a complete, independent working copy of the repository,
 * allowing agents to work in parallel without context pollution or conflicts.
 */
export interface Worktree {
  /** Unique identifier for this worktree (UUID) */
  id: string;

  /** Absolute filesystem path to the worktree directory */
  path: string;

  /** Absolute path to the git directory (typically .git within worktree) */
  gitDir: string;

  /** Current git branch checked out in this worktree */
  branch: string;

  /** Associated Dash session ID using this worktree */
  sessionId: string;

  /** Absolute path to the original repository (parent of all worktrees) */
  repositoryPath: string;

  /** Base branch from which this worktree was created */
  baseBranch: string;

  /** Array of paths shared via symlinks (e.g., node_modules, .venv) */
  dependenciesShared: string[];

  /** Current operational status of the worktree */
  status: WorktreeStatus;

  /** Timestamp when the worktree was created */
  createdAt: Date;

  /** Timestamp of last activity in this worktree */
  lastActivity: Date;
}

/**
 * Dependency configuration for worktree isolation.
 *
 * Defines which paths should be shared (symlinked) vs isolated
 * to optimize disk usage while maintaining proper isolation.
 */
export interface DependencyConfig {
  /**
   * Paths to share via symlinks from the base repository.
   * These are typically large, immutable dependency directories
   * that don't change per worktree (e.g., node_modules, .venv).
   */
  shared: string[];

  /**
   * Paths to keep isolated per worktree.
   * These are typically build outputs, environment configs, or
   * files that need to be worktree-specific (e.g., .env, dist/, build/).
   */
  isolated: string[];
}

/**
 * Configuration for creating a new worktree.
 *
 * Provides all necessary parameters to initialize an isolated
 * git worktree for a parallel agent session.
 */
export interface WorktreeConfig {
  /** Absolute path to the git repository */
  repository: string;

  /** Branch to create the worktree from (will be checked out) */
  baseBranch: string;

  /** Dash session ID that will own this worktree */
  sessionId: string;

  /** Dependency isolation configuration */
  dependencies: DependencyConfig;

  /** Cleanup strategy for when the session ends */
  cleanup: CleanupStrategy;
}

/**
 * Options for worktree cleanup operations.
 *
 * Controls the behavior of worktree removal, including
 * how branches and uncommitted changes are handled.
 */
export interface CleanupOptions {
  /**
   * Whether to remove the associated git branch.
   * If true, the branch will be deleted after worktree removal.
   * @default false
   */
  removeBranch: boolean;

  /**
   * Whether to force removal even if worktree has uncommitted changes.
   * Use with caution - may result in data loss.
   * @default false
   */
  force: boolean;

  /**
   * Whether to preserve uncommitted changes by stashing them.
   * Changes can be recovered later via git stash pop.
   * @default false
   */
  preserveChanges: boolean;
}

/**
 * Repository configuration for dependency linking.
 *
 * Captures essential information about the base repository
 * needed to properly link shared dependencies into worktrees.
 */
export interface RepoConfig {
  /** Absolute path to the repository root */
  rootPath: string;

  /** Package manager used by this repository */
  packageManager: PackageManager;

  /**
   * Map of shared dependency paths.
   * Keys are relative paths (e.g., 'node_modules'), values are
   * absolute paths to the shared location.
   */
  sharedDependencyPaths: Record<string, string>;
}

/**
 * Result type for worktree operations.
 *
 * Provides a standard structure for returning operation results
 * with detailed error information when applicable.
 */
export interface WorktreeOperationResult {
  /** Whether the operation succeeded */
  success: boolean;

  /** The worktree instance (present on successful operations) */
  worktree?: Worktree;

  /** Error message (present on failed operations) */
  error?: string;

  /** Raw command output for debugging */
  commandOutput?: string;
}

/**
 * Result of executing a git command.
 *
 * Captures all output from git command execution
 * for logging and debugging purposes.
 */
export interface GitCommandResult {
  /** Whether the command exited successfully (exit code 0) */
  success: boolean;

  /** Standard output from the command */
  stdout: string;

  /** Standard error from the command */
  stderr: string;

  /** Exit code from the command (0 typically indicates success) */
  exitCode: number;
}

/**
 * Context provided to agent tools for worktree operations.
 *
 * This context allows agent tools to safely interact with
 * worktrees with appropriate operation restrictions.
 */
export interface WorktreeToolContext {
  /** Absolute path to the worktree root */
  worktreePath: string;

  /**
   * List of allowed operations in this worktree context.
   * Operations not in this list should be denied.
   * Examples: ['read', 'write', 'execute', 'git']
   */
  allowedOperations: string[];

  /** Session ID associated with this worktree context */
  sessionId: string;
}

/**
 * Core interface for worktree management operations.
 *
 * The WorktreeManager provides the primary API for creating,
 * managing, and cleaning up git worktrees for parallel sessions.
 */
export interface WorktreeManager {
  /**
   * Create a new worktree for parallel session isolation.
   *
   * @param config - Configuration for the new worktree
   * @returns Promise resolving to the created worktree
   * @throws Error if worktree creation fails
   */
  createWorktree(config: WorktreeConfig): Promise<Worktree>;

  /**
   * Link shared dependencies into a worktree via symlinks.
   *
   * This optimizes disk usage by sharing large dependency directories
   * (like node_modules) across multiple worktrees while keeping
   * worktree-specific files isolated.
   *
   * @param worktree - The worktree to link dependencies into
   * @param repoConfig - Repository configuration for linking
   * @returns Promise that resolves when linking is complete
   * @throws Error if dependency linking fails
   */
  linkDependencies(worktree: Worktree, repoConfig: RepoConfig): Promise<void>;

  /**
   * Remove a worktree and optionally clean up associated resources.
   *
   * @param worktree - The worktree to remove
   * @param options - Optional cleanup configuration
   * @returns Promise that resolves when removal is complete
   * @throws Error if removal fails
   */
  removeWorktree(worktree: Worktree, options?: CleanupOptions): Promise<void>;

  /**
   * List all worktrees, optionally filtered by repository.
   *
   * @param repository - Optional repository path to filter by
   * @returns Promise resolving to array of worktrees
   */
  listWorktrees(repository?: string): Promise<Worktree[]>;

  /**
   * Get a specific worktree by its ID.
   *
   * @param id - The worktree ID to look up
   * @returns Promise resolving to the worktree, or null if not found
   */
  getWorktree(id: string): Promise<Worktree | null>;

  /**
   * Get the worktree associated with a specific session.
   *
   * @param sessionId - The session ID to look up
   * @returns Promise resolving to the worktree, or null if not found
   */
  getWorktreeForSession(sessionId: string): Promise<Worktree | null>;

  /**
   * Update the last activity timestamp for a worktree.
   *
   * Should be called periodically to track active vs inactive worktrees.
   *
   * @param id - The worktree ID to update
   * @returns Promise that resolves when update is complete
   * @throws Error if worktree not found
   */
  updateActivity(id: string): Promise<void>;

  /**
   * Clean up worktrees that have been inactive beyond the specified threshold.
   *
   * @param maxAgeMs - Maximum age in milliseconds before a worktree is considered inactive
   * @returns Promise resolving to the number of worktrees cleaned up
   */
  cleanupInactiveWorktrees(maxAgeMs: number): Promise<number>;
}
