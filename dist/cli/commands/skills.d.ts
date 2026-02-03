/**
 * Skills CLI Command
 *
 * Unified skill management commands:
 * - dash skills list [--source <source>] [--json]
 * - dash skills search <query> [--limit N] [--sort type] [--source <source>]
 * - dash skills install <skill> [--version V] [--force] [--source <source>]
 * - dash skills remove <skill>
 * - dash skills update [skill] [--all]
 * - dash skills info <skill>
 * - dash skills sources
 */
import { Command } from 'commander';
export declare function registerSkillsCommand(program: Command): void;
export default registerSkillsCommand;
//# sourceMappingURL=skills.d.ts.map