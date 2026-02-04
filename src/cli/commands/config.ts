/**
 * Config CLI Commands
 * 
 * Provides CLI commands for managing Dash configuration:
 * - swarmctl config get <key>
 * - swarmctl config set <key> <value>
 * - swarmctl config validate
 * - swarmctl config list
 * - swarmctl config sources
 */

import { Command } from 'commander';
import chalk from 'chalk';
import YAML from 'yaml';
import {
  loadConfig,
  getConfig,
  reloadConfig,
  validateConfig,
  formatValidationErrors,
  flattenConfig,
  getConfigSources,
  getConfigValue,
  isFeatureEnabled,
  configMetadata,
  type DashConfig,
  type ConfigCliOptions,
} from '../../config';

// ============================================================================
// Config Get Command
// ============================================================================

export function createConfigGetCommand(): Command {
  const command = new Command('get')
    .description('Get configuration value')
    .argument('[key]', 'Configuration key (e.g., server.port, database.url)')
    .option('-e, --env <env>', 'Environment', process.env['NODE_ENV'] || 'development')
    .option('-c, --config-dir <dir>', 'Configuration directory', './config')
    .option('-f, --format <format>', 'Output format (json, yaml, value)', 'value')
    .option('--show-secrets', 'Show secret values (hidden by default)', false)
    .action(async (key: string | undefined, options) => {
      try {
        const config = await loadConfig({
          env: options.env,
          configDir: options.configDir,
        });

        if (!key) {
          // List all configuration values
          const flatConfig = flattenConfig(config.config, '', !options.showSecrets);
          
          if (options.format === 'json') {
            console.log(JSON.stringify(flatConfig, null, 2));
          } else if (options.format === 'yaml') {
            console.log(YAML.stringify(flatConfig));
          } else {
            // Table format
            console.log(chalk.bold('\nConfiguration Values:'));
            console.log(chalk.gray('─'.repeat(80)));
            
            const sortedKeys = Object.keys(flatConfig).sort();
            for (const k of sortedKeys) {
              const value = flatConfig[k];
              const meta = configMetadata[k];
              
              let displayValue = value;
              if (meta?.sensitive && !options.showSecrets) {
                displayValue = '***';
              }
              
              const envVar = meta?.envVar ? chalk.gray(` [${meta.envVar}]`) : '';
              console.log(`${chalk.cyan(k.padEnd(40))} ${chalk.yellow(displayValue)}${envVar}`);
            }
            console.log();
          }
          return;
        }

        // Get specific value
        const value = getConfigValue(config.config, key);

        if (value === undefined) {
          console.error(chalk.red(`Error: Configuration key '${key}' not found`));
          process.exit(1);
        }

        // Output based on format
        if (options.format === 'json') {
          console.log(JSON.stringify({ [key]: value }, null, 2));
        } else if (options.format === 'yaml') {
          console.log(YAML.stringify({ [key]: value }));
        } else {
          if (typeof value === 'object') {
            console.log(YAML.stringify(value));
          } else {
            console.log(String(value));
          }
        }
      } catch (error) {
        console.error(chalk.red(`Error: ${(error as Error).message}`));
        process.exit(1);
      }
    });

  return command;
}

// ============================================================================
// Config Set Command
// ============================================================================

export function createConfigSetCommand(): Command {
  const command = new Command('set')
    .description('Set configuration value (requires restart)')
    .argument('<key>', 'Configuration key (e.g., server.port)')
    .argument('<value>', 'Configuration value')
    .option('-e, --env <env>', 'Environment', process.env['NODE_ENV'] || 'development')
    .option('-c, --config-dir <dir>', 'Configuration directory', './config')
    .option('--dry-run', 'Show what would be changed without applying')
    .action(async (key: string, value: string, options) => {
      try {
        const config = await loadConfig({
          env: options.env,
          configDir: options.configDir,
        });

        // Parse the value
        let parsedValue: unknown = value;
        
        // Try to parse as JSON first
        if (value.startsWith('{') || value.startsWith('[') || value === 'true' || value === 'false') {
          try {
            parsedValue = JSON.parse(value);
          } catch {
            // Keep as string
          }
        } else if (!isNaN(Number(value)) && value !== '') {
          parsedValue = Number(value);
        }

        // Check if key exists
        const currentValue = getConfigValue(config.config, key);
        
        if (currentValue === undefined) {
          console.error(chalk.red(`Error: Configuration key '${key}' not found`));
          console.log(chalk.yellow('Available keys:'));
          const flatConfig = flattenConfig(config.config);
          Object.keys(flatConfig).sort().forEach((k) => console.log(`  ${k}`));
          process.exit(1);
        }

        // Show what would change
        console.log(chalk.bold('\nConfiguration Change:'));
        console.log(chalk.gray('─'.repeat(60)));
        console.log(`${chalk.cyan('Key:')}      ${key}`);
        console.log(`${chalk.cyan('Current:')}  ${JSON.stringify(currentValue)}`);
        console.log(`${chalk.cyan('New:')}      ${JSON.stringify(parsedValue)}`);
        
        const meta = configMetadata[key];
        if (meta?.requiresRestart) {
          console.log(chalk.yellow('\n⚠️  This change requires a restart to take effect'));
        }
        if (meta?.sensitive) {
          console.log(chalk.yellow('🔒 This is a sensitive value'));
        }

        if (options.dryRun) {
          console.log(chalk.gray('\n(Dry run - no changes made)'));
          return;
        }

        // Note: We're not actually modifying the config file here
        // In a real implementation, this would update the YAML/JSON file
        console.log(chalk.yellow('\nNote: To make this change permanent, update your config file:'));
        console.log(chalk.gray(`  ${options.configDir}/dash.${options.env}.yaml`));
        console.log(chalk.gray(`\nAdd or update the following:`));
        
        const parts = key.split('.');
        const obj: Record<string, unknown> = {};
        let current = obj;
        for (let i = 0; i < parts.length - 1; i++) {
          current[parts[i]] = {};
          current = current[parts[i]] as Record<string, unknown>;
        }
        current[parts[parts.length - 1]] = parsedValue;
        
        console.log(chalk.cyan(YAML.stringify(obj)));
        
      } catch (error) {
        console.error(chalk.red(`Error: ${(error as Error).message}`));
        process.exit(1);
      }
    });

  return command;
}

// ============================================================================
// Config Validate Command
// ============================================================================

export function createConfigValidateCommand(): Command {
  const command = new Command('validate')
    .description('Validate configuration')
    .option('-e, --env <env>', 'Environment', process.env['NODE_ENV'] || 'development')
    .option('-c, --config-dir <dir>', 'Configuration directory', './config')
    .option('--enable-vault', 'Enable Vault secret resolution', false)
    .option('--strict', 'Exit with error on warnings', false)
    .action(async (options) => {
      try {
        console.log(chalk.bold(`\nValidating configuration for environment: ${options.env}\n`));

        const loaded = await loadConfig({
          env: options.env,
          configDir: options.configDir,
          enableVault: options.enableVault,
        });

        const validation = validateConfig(loaded.config);

        if (!validation.success) {
          console.log(chalk.red('❌ Configuration validation failed:\n'));
          console.log(formatValidationErrors(validation.errors!));
          console.log();
          process.exit(1);
        }

        console.log(chalk.green('✅ Configuration is valid\n'));

        // Show configuration sources
        console.log(chalk.bold('Configuration Sources:'));
        loaded.sources.forEach((source) => {
          console.log(`  ${chalk.gray('•')} ${source}`);
        });

        // Show warnings
        if (loaded.warnings.length > 0) {
          console.log(chalk.yellow('\n⚠️  Warnings:'));
          loaded.warnings.forEach((warning) => {
            console.log(`  ${chalk.yellow('•')} ${warning}`);
          });
          
          if (options.strict) {
            process.exit(1);
          }
        }

        // Show production readiness check
        if (options.env === 'production') {
          console.log(chalk.bold('\nProduction Readiness Check:'));
          
          const checks = [
            {
              name: 'JWT Secret',
              pass: loaded.config.auth.jwtSecret !== 'change-me-in-production' &&
                    loaded.config.auth.jwtSecret !== '',
              message: 'JWT secret should be changed from default',
            },
            {
              name: 'API Keys',
              pass: loaded.config.auth.apiKeys.length > 0 &&
                    !loaded.config.auth.apiKeys.includes('dash-api-key'),
              message: 'API keys should be configured',
            },
            {
              name: 'Database URL',
              pass: loaded.config.database.url.includes('localhost') === false,
              message: 'Database should not use localhost in production',
            },
            {
              name: 'CORS Origins',
              pass: loaded.config.server.cors.origins.length > 0,
              message: 'CORS origins should be explicitly configured',
            },
          ];

          checks.forEach((check) => {
            if (check.pass) {
              console.log(`  ${chalk.green('✓')} ${check.name}`);
            } else {
              console.log(`  ${chalk.yellow('⚠')} ${check.name}: ${check.message}`);
            }
          });
        }

        console.log();
      } catch (error) {
        console.error(chalk.red(`\n❌ Error: ${(error as Error).message}\n`));
        process.exit(1);
      }
    });

  return command;
}

// ============================================================================
// Config List Command
// ============================================================================

export function createConfigListCommand(): Command {
  const command = new Command('list')
    .description('List all configuration values')
    .option('-e, --env <env>', 'Environment', process.env['NODE_ENV'] || 'development')
    .option('-c, --config-dir <dir>', 'Configuration directory', './config')
    .option('-f, --format <format>', 'Output format (table, json, yaml)', 'table')
    .option('--show-secrets', 'Show secret values (hidden by default)', false)
    .option('--filter <pattern>', 'Filter keys by pattern')
    .action(async (options) => {
      try {
        const config = await loadConfig({
          env: options.env,
          configDir: options.configDir,
        });

        const flatConfig = flattenConfig(config.config, '', !options.showSecrets);

        // Apply filter if provided
        let filteredConfig = flatConfig;
        if (options.filter) {
          const regex = new RegExp(options.filter, 'i');
          filteredConfig = Object.fromEntries(
            Object.entries(flatConfig).filter(([key]) => regex.test(key))
          );
        }

        if (options.format === 'json') {
          console.log(JSON.stringify(filteredConfig, null, 2));
        } else if (options.format === 'yaml') {
          console.log(YAML.stringify(filteredConfig));
        } else {
          // Table format
          console.log(chalk.bold(`\nConfiguration (${options.env}):`));
          console.log(chalk.gray('─'.repeat(80)));
          
          const sortedKeys = Object.keys(filteredConfig).sort();
          
          if (sortedKeys.length === 0) {
            console.log(chalk.gray('No configuration values match the filter'));
          } else {
            for (const key of sortedKeys) {
              const value = filteredConfig[key];
              const meta = configMetadata[key];
              
              const envVar = meta?.envVar ? chalk.gray(` [${meta.envVar}]`) : '';
              const description = meta?.description ? chalk.gray(` # ${meta.description}`) : '';
              
              console.log(
                `${chalk.cyan(key.padEnd(35))} ${chalk.yellow(String(value).padEnd(30))}${envVar}${description}`
              );
            }
          }
          console.log();
        }
      } catch (error) {
        console.error(chalk.red(`Error: ${(error as Error).message}`));
        process.exit(1);
      }
    });

  return command;
}

// ============================================================================
// Config Sources Command
// ============================================================================

export function createConfigSourcesCommand(): Command {
  const command = new Command('sources')
    .description('Show configuration sources')
    .option('-e, --env <env>', 'Environment', process.env['NODE_ENV'] || 'development')
    .option('-c, --config-dir <dir>', 'Configuration directory', './config')
    .action(async (options) => {
      try {
        const config = await loadConfig({
          env: options.env,
          configDir: options.configDir,
        });

        console.log(chalk.bold(`\nConfiguration Sources (${options.env}):`));
        console.log(chalk.gray('─'.repeat(60)));
        
        config.sources.forEach((source, index) => {
          const priority = config.sources.length - index;
          console.log(`${chalk.gray(`${priority}.`)} ${source}`);
        });

        console.log(chalk.gray('\n(Lower number = higher priority)'));
        console.log();
      } catch (error) {
        console.error(chalk.red(`Error: ${(error as Error).message}`));
        process.exit(1);
      }
    });

  return command;
}

// ============================================================================
// Config Features Command
// ============================================================================

export function createConfigFeaturesCommand(): Command {
  const command = new Command('features')
    .description('List feature flags')
    .option('-e, --env <env>', 'Environment', process.env['NODE_ENV'] || 'development')
    .option('-c, --config-dir <dir>', 'Configuration directory', './config')
    .action(async (options) => {
      try {
        const config = await loadConfig({
          env: options.env,
          configDir: options.configDir,
        });

        console.log(chalk.bold(`\nFeature Flags (${options.env}):`));
        console.log(chalk.gray('─'.repeat(60)));
        
        Object.entries(config.config.features).forEach(([feature, enabled]) => {
          const status = enabled 
            ? chalk.green('✓ enabled') 
            : chalk.red('✗ disabled');
          console.log(`  ${chalk.cyan(feature.padEnd(20))} ${status}`);
        });
        
        console.log();
      } catch (error) {
        console.error(chalk.red(`Error: ${(error as Error).message}`));
        process.exit(1);
      }
    });

  return command;
}

// ============================================================================
// Main Config Command
// ============================================================================

export function createConfigCommand(): Command {
  const command = new Command('config')
    .description('Manage Dash configuration')
    .addCommand(createConfigGetCommand())
    .addCommand(createConfigSetCommand())
    .addCommand(createConfigValidateCommand())
    .addCommand(createConfigListCommand())
    .addCommand(createConfigSourcesCommand())
    .addCommand(createConfigFeaturesCommand());

  return command;
}

export default createConfigCommand;
