/**
 * @fileoverview Worktree module exports.
 *
 * This module provides git worktree management for isolated agent development
 * sessions. Worktrees allow multiple agents to work simultaneously on different
 * branches without interfering with each other.
 *
 * @module @dash/core/worktree
 *
 * @example
 * ```typescript
 * import { WorktreeManager, initializeGlobalWorktreeManager, getGlobalWorktreeManager } from '@dash/core/worktree';
 *
 * // Initialize the global manager
 * const manager = initializeGlobalWorktreeManager('/tmp/worktrees', storage);
 *
 * // Create a worktree for a session
 * const worktree = await manager.createWorktree({
 *   repository: '/path/to/repo',
 *   baseBranch: 'main',
 *   sessionId: 'session-123',
 *   dependencies: {
 *     shared: ['node_modules'],
 *     isolated: ['.env'],
 *   },
 *   cleanup: 'on_success',
 * });
 *
 * // Listen for events
 * manager.on('worktree.created', (event) => {
 *   console.log(`Created: ${event.worktree.id}`);
 * });
 * ```
 */

// ============================================================================
// Type Exports
// ============================================================================

export type {
  /** Represents an isolated git worktree for parallel agent sessions */
  Worktree,
  /** Configuration for creating a new worktree */
  WorktreeConfig,
  /** Options for worktree cleanup operations */
  CleanupOptions,
  /** Repository configuration for dependency linking */
  RepoConfig,
  /** Result type for worktree operations */
  WorktreeOperationResult,
  /** Result of executing a git command */
  GitCommandResult,
  /** Context provided to agent tools for worktree operations */
  WorktreeToolContext,
  /** Dependency configuration for worktree isolation */
  DependencyConfig,
  /** Core interface for worktree management operations */
  WorktreeManager as WorktreeManagerInterface,
  /** Current status of a worktree */
  WorktreeStatus,
  /** Cleanup strategy for worktree lifecycle management */
  CleanupStrategy,
  /** Supported package managers for dependency linking */
  PackageManager,
} from './types';

// ============================================================================
// Manager Exports
// ============================================================================

export {
  /** Main class for managing git worktrees */
  WorktreeManager,
  /** Tool definition for agent worktree operations */
  worktreeTool,
  /** Get the global worktree manager instance */
  getGlobalWorktreeManager,
  /** Initialize the global worktree manager */
  initializeGlobalWorktreeManager,
  /** Reset the global worktree manager (for testing) */
  resetGlobalWorktreeManager,
} from './manager';

// ============================================================================
// Error Exports
// ============================================================================

export {
  /** Base error class for worktree-related errors */
  WorktreeError,
  /** Error thrown when git command execution fails */
  GitCommandError,
  /** Error thrown when repository validation fails */
  RepositoryValidationError,
  /** Error thrown when worktree creation fails */
  WorktreeCreationError,
  /** Error thrown when dependency linking fails */
  DependencyLinkingError,
} from './manager';

// ============================================================================
// Constants
// ============================================================================

/** Prefix for worktree IDs */
export const WORKTREE_ID_PREFIX = 'wt';

/** Prefix for dash branches */
export const BRANCH_PREFIX = 'dash/session';

/** Default subdirectory for worktrees within a repository */
export const WORKTREE_SUBDIR = '.dash-worktrees';

/** Storage key prefix for worktree persistence */
export const STORAGE_KEY_PREFIX = 'dash:worktree:';

/** Table name for cold storage */
export const WORKTREE_TABLE = 'worktrees';

// ============================================================================
// Utility Functions
// ============================================================================

import { join, basename } from 'path';

/**
 * Generate a unique worktree ID.
 *
 * @param sessionId - The session ID to base the ID on
 * @returns Unique worktree ID
 */
export function generateWorktreeId(sessionId: string): string {
  const timestamp = Date.now();
  return `${WORKTREE_ID_PREFIX}-${sessionId.slice(0, 8)}-${timestamp}`;
}

/**
 * Generate a branch name for a worktree.
 *
 * @param sessionId - The session ID to base the name on
 * @returns Branch name
 */
export function generateBranchName(sessionId: string): string {
  return `${BRANCH_PREFIX}-${sessionId.slice(0, 8)}`;
}

/**
 * Determine the worktree path based on configuration.
 *
 * @param basePath - Base path for all worktrees
 * @param repositoryPath - Path to the original repository
 * @param worktreeId - Unique worktree ID
 * @returns Full path to the worktree directory
 */
export function determineWorktreePath(
  basePath: string,
  repositoryPath: string,
  worktreeId: string
): string {
  const repoName = basename(repositoryPath);
  return join(basePath, `${repoName}-dash`, worktreeId);
}

// ============================================================================
// Default Export
// ============================================================================

export { WorktreeManager as default } from './manager';
