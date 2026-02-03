/**
 * ClawHub CLI Command
 *
 * Commands:
 * - dash clawhub search [query] [--limit N] [--sort type]
 * - dash clawhub install [skill] [--version V] [--force]
 * - dash clawhub list [--show-inactive]
 * - dash clawhub uninstall [skill]
 * - dash clawhub info [skill]
 *
 * Per OPENCLAW_INTEGRATION_SPEC.md section F4.1
 */
import { Command } from 'commander';
export declare function registerClawhubCommand(program: Command): void;
export default registerClawhubCommand;
//# sourceMappingURL=clawhub.d.ts.map