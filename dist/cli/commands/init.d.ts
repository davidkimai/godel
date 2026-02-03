/**
 * Init Command - Initialize Dash configuration
 *
 * Sets up:
 * - ~/.dash/ directory structure
 * - Initial configuration file
 * - API key generation
 * - Default settings
 */
import { Command } from 'commander';
declare const DASH_DIR: string;
declare const CONFIG_FILE: string;
interface DashConfig {
    apiKey: string;
    apiUrl: string;
    defaultModel: string;
    safetyEnabled: boolean;
    budgetLimit?: number;
    logLevel: 'debug' | 'info' | 'warn' | 'error';
    createdAt: string;
}
declare function loadConfig(): DashConfig | null;
declare function saveConfig(config: DashConfig): void;
export declare function registerInitCommand(program: Command): void;
export { loadConfig, saveConfig, DASH_DIR, CONFIG_FILE };
//# sourceMappingURL=init.d.ts.map