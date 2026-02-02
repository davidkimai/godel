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
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { randomBytes } from 'crypto';

const DASH_DIR = join(homedir(), '.dash');
const CONFIG_FILE = join(DASH_DIR, 'config.json');

interface DashConfig {
  apiKey: string;
  apiUrl: string;
  defaultModel: string;
  safetyEnabled: boolean;
  budgetLimit?: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  createdAt: string;
}

const DEFAULT_CONFIG: Omit<DashConfig, 'apiKey' | 'createdAt'> = {
  apiUrl: 'http://localhost:7373',
  defaultModel: 'kimi-k2.5',
  safetyEnabled: true,
  logLevel: 'info',
};

function generateApiKey(): string {
  return 'dash_' + randomBytes(32).toString('hex');
}

function loadConfig(): DashConfig | null {
  try {
    if (existsSync(CONFIG_FILE)) {
      const content = readFileSync(CONFIG_FILE, 'utf-8');
      return JSON.parse(content) as DashConfig;
    }
  } catch {
    // Ignore errors
  }
  return null;
}

function saveConfig(config: DashConfig): void {
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
}

export function registerInitCommand(program: Command): void {
  const init = program
    .command('init')
    .description('Initialize Dash configuration and directory structure');

  init
    .option('-f, --force', 'Overwrite existing configuration')
    .option('--api-key <key>', 'Set custom API key')
    .option('--api-url <url>', 'Set API URL', 'http://localhost:7373')
    .option('--model <model>', 'Set default model', 'kimi-k2.5')
    .option('--no-safety', 'Disable safety checks by default')
    .option('--budget <amount>', 'Set default budget limit (USD)')
    .action(async (options) => {
      try {
        console.log('🚀 Initializing Dash...\n');

        // Validate budget if provided
        if (options.budget) {
          const budget = parseFloat(options.budget);
          if (isNaN(budget) || budget < 0 || budget > 100000) {
            console.error('❌ Invalid budget. Must be between 0 and 100000 USD.');
            process.exit(1);
          }
        }

        // Check if already initialized
        const existingConfig = loadConfig();
        if (existingConfig && !options.force) {
          console.log('⚠️  Dash is already initialized.');
          console.log(`   Config: ${CONFIG_FILE}`);
          console.log('   Use --force to reinitialize.\n');
          process.exit(1);
        }

        // Create ~/.dash/ directory
        if (!existsSync(DASH_DIR)) {
          mkdirSync(DASH_DIR, { recursive: true, mode: 0o700 });
          console.log(`✅ Created directory: ${DASH_DIR}`);
        } else {
          console.log(`ℹ️  Directory already exists: ${DASH_DIR}`);
        }

        // Generate or use provided API key
        const apiKey = options.apiKey || generateApiKey();

        // Create configuration
        const config: DashConfig = {
          ...DEFAULT_CONFIG,
          apiKey,
          apiUrl: options.apiUrl,
          defaultModel: options.model,
          safetyEnabled: options.safety !== false,
          budgetLimit: options.budget ? parseFloat(options.budget) : undefined,
          createdAt: new Date().toISOString(),
        };

        // Save configuration
        saveConfig(config);
        console.log(`✅ Created configuration: ${CONFIG_FILE}`);

        // Create subdirectories
        const subdirs = ['logs', 'cache', 'templates'];
        for (const dir of subdirs) {
          const path = join(DASH_DIR, dir);
          if (!existsSync(path)) {
            mkdirSync(path, { recursive: true });
            console.log(`✅ Created directory: ${path}`);
          }
        }

        // Success message
        console.log('\n🎉 Dash initialized successfully!\n');
        console.log('Configuration:');
        console.log(`  API URL:    ${config.apiUrl}`);
        console.log(`  API Key:    ${config.apiKey.slice(0, 4)}***${config.apiKey.slice(-4)} (hidden)`);
        console.log(`  Model:      ${config.defaultModel}`);
        console.log(`  Safety:     ${config.safetyEnabled ? 'enabled' : 'disabled'}`);
        if (config.budgetLimit) {
          console.log(`  Budget:     $${config.budgetLimit} USD`);
        }
        console.log(`  Log Level:  ${config.logLevel}`);
        console.log('\nNext steps:');
        console.log('  1. Set DASH_API_KEY environment variable:');
        console.log(`     export DASH_API_KEY=${config.apiKey}`);
        console.log('  2. Start the Dash API server:');
        console.log('     dash api start');
        console.log('  3. Create your first swarm:');
        console.log('     dash swarm create --name "My Swarm" --task "Hello World"\n');

      } catch (error) {
        console.error('❌ Failed to initialize Dash:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  init
    .command('config')
    .description('Show current configuration')
    .option('--json', 'Output as JSON')
    .action((options) => {
      try {
        const config = loadConfig();
        
        if (!config) {
          console.error('❌ Dash is not initialized.');
          console.log('   Run "dash init" first.\n');
          process.exit(1);
        }

        if (options.json) {
          console.log(JSON.stringify(config, null, 2));
          return;
        }

        console.log('📋 Dash Configuration\n');
        console.log(`  API URL:    ${config.apiUrl}`);
        console.log(`  API Key:    ${config.apiKey.slice(0, 4)}***${config.apiKey.slice(-4)} (hidden)`);
        console.log(`  Model:      ${config.defaultModel}`);
        console.log(`  Safety:     ${config.safetyEnabled ? 'enabled' : 'disabled'}`);
        if (config.budgetLimit) {
          console.log(`  Budget:     $${config.budgetLimit} USD`);
        }
        console.log(`  Log Level:  ${config.logLevel}`);
        console.log(`  Created:    ${config.createdAt}\n`);

      } catch (error) {
        console.error('❌ Failed to show config:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  init
    .command('reset')
    .description('Reset configuration to defaults')
    .option('-y, --yes', 'Skip confirmation')
    .action(async (options) => {
      try {
        if (!existsSync(CONFIG_FILE)) {
          console.log('ℹ️  No configuration to reset.');
          return;
        }

        if (!options.yes) {
          console.log('⚠️  This will reset your Dash configuration.');
          console.log('   Use --yes to confirm.\n');
          process.exit(1);
        }

        const config: DashConfig = {
          ...DEFAULT_CONFIG,
          apiKey: generateApiKey(),
          createdAt: new Date().toISOString(),
        };

        saveConfig(config);
        console.log('✅ Configuration reset to defaults.');
        console.log(`   New API Key: ${config.apiKey.slice(0, 4)}***${config.apiKey.slice(-4)} (hidden)\n`);

      } catch (error) {
        console.error('❌ Failed to reset config:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}

// Export for use in other modules
export { loadConfig, saveConfig, DASH_DIR, CONFIG_FILE };
