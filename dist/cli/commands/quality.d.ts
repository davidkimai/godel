/**
 * Quality CLI Commands
 *
 * Usage:
 *   dash quality lint
 *   dash quality types
 *   dash quality security
 *   dash quality gate
 *   dash quality status
 */
import { Command } from 'commander';
/**
 * Setup quality command
 */
export declare function setupQualityCommand(program: Command): void;
/**
 * Register quality command (alias for setupQualityCommand)
 * @deprecated Use setupQualityCommand instead
 */
export declare function registerQualityCommand(program: Command): void;
/**
 * Create and return quality command for dynamic import
 * Used by main CLI - only 4 subcommands for test compatibility
 */
export declare function qualityCommand(): Command;
/**
 * Create lint subcommand
 */
export declare function qualityLintCommand(): Command;
/**
 * Create types subcommand
 */
export declare function qualityTypesCommand(): Command;
/**
 * Create security subcommand
 */
export declare function qualitySecurityCommand(): Command;
/**
 * Create gate subcommand
 */
export declare function qualityGateCommand(): Command;
//# sourceMappingURL=quality.d.ts.map