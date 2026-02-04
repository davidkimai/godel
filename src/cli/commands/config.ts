import { logger } from '../../utils/logger';
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
            logger.info(JSON.stringify(flatConfig, null, 2));
          } else if (options.format === 'yaml') {
            logger.info(YAML.stringify(flatConfig));
          } else {
            // Table format
            logger.info(chalk.bold('\nConfiguration Values:'));
            logger.info(chalk.gray('─'.repeat(80)));
            
            const sortedKeys = Object.keys(flatConfig).sort();
            for (const k of sortedKeys) {
              const value = flatConfig[k];
              const meta = configMetadata[k];
              
              let displayValue = value;
              if (meta?.sensitive && !options.showSecrets) {
                displayValue = '***';
              }
              
              const envVar = meta?.envVar ? chalk.gray(` [${meta.envVar}]`) : '';
              logger.info(`${chalk.cyan(k.padEnd(40))} ${chalk.yellow(displayValue)}${envVar}`);
            }
            logger.info('');
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
          logger.info(JSON.stringify({ [key]: value }, null, 2));
        } else if (options.format === 'yaml') {
          logger.info(YAML.stringify({ [key]: value }));
        } else {
          if (typeof value === 'object') {
            logger.info(YAML.stringify(value));
          } else {
            logger.info(String(value));
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
          logger.info(chalk.yellow('Available keys:'));
          const flatConfig = flattenConfig(config.config);
          Object.keys(flatConfig).sort().forEach((k) => logger.info(`  ${k}`));
          process.exit(1);
        }

        // Show what would change
        logger.info(chalk.bold('\nConfiguration Change:'));
        logger.info(chalk.gray('─'.repeat(60)));
        logger.info(`${chalk.cyan('Key:')}      ${key}`);
        logger.info(`${chalk.cyan('Current:')}  ${JSON.stringify(currentValue)}`);
        logger.info(`${chalk.cyan('New:')}      ${JSON.stringify(parsedValue)}`);
        
        const meta = configMetadata[key];
        if (meta?.requiresRestart) {
          logger.info(chalk.yellow('\n⚠️  This change requires a restart to take effect'));
        }
        if (meta?.sensitive) {
          logger.info(chalk.yellow('🔒 This is a sensitive value'));
        }

        if (options.dryRun) {
          logger.info(chalk.gray('\n(Dry run - no changes made)'));
          return;
        }

        // Note: We're not actually modifying the config file here
        // In a real implementation, this would update the YAML/JSON file
        logger.info(chalk.yellow('\nNote: To make this change permanent, update your config file:'));
        logger.info(chalk.gray(`  ${options.configDir}/dash.${options.env}.yaml`));
        logger.info(chalk.gray(`\nAdd or update the following:`));
        
        const parts = key.split('.');
        const obj: Record<string, unknown> = {};
        let current = obj;
        for (let i = 0; i < parts.length - 1; i++) {
          current[parts[i]] = {};
          current = current[parts[i]] as Record<string, unknown>;
        }
        current[parts[parts.length - 1]] = parsedValue;
        
        logger.info(chalk.cyan(YAML.stringify(obj)));
        
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
        logger.info(chalk.bold(`\nValidating configuration for environment: ${options.env}\n`));

        const loaded = await loadConfig({
          env: options.env,
          configDir: options.configDir,
          enableVault: options.enableVault,
        });

        const validation = validateConfig(loaded.config);

        if (!validation.success) {
          logger.info(chalk.red('❌ Configuration validation failed:\n'));
          logger.info(formatValidationErrors(validation.errors!));
          logger.info('');
          process.exit(1);
        }

        logger.info(chalk.green('✅ Configuration is valid\n'));

        // Show configuration sources
        logger.info(chalk.bold('Configuration Sources:'));
        loaded.sources.forEach((source) => {
          logger.info(`  ${chalk.gray('•')} ${source}`);
        });

        // Show warnings
        if (loaded.warnings.length > 0) {
          logger.info(chalk.yellow('\n⚠️  Warnings:'));
          loaded.warnings.forEach((warning) => {
            logger.info(`  ${chalk.yellow('•')} ${warning}`);
          });
          
          if (options.strict) {
            process.exit(1);
          }
        }

        // Show production readiness check
        if (options.env === 'production') {
          logger.info(chalk.bold('\nProduction Readiness Check:'));
          
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
              logger.info(`  ${chalk.green('✓')} ${check.name}`);
            } else {
              logger.info(`  ${chalk.yellow('⚠')} ${check.name}: ${check.message}`);
            }
          });
        }

        logger.info('');
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
          logger.info(JSON.stringify(filteredConfig, null, 2));
        } else if (options.format === 'yaml') {
          logger.info(YAML.stringify(filteredConfig));
        } else {
          // Table format
          logger.info(chalk.bold(`\nConfiguration (${options.env}):`));
          logger.info(chalk.gray('─'.repeat(80)));
          
          const sortedKeys = Object.keys(filteredConfig).sort();
          
          if (sortedKeys.length === 0) {
            logger.info(chalk.gray('No configuration values match the filter'));
          } else {
            for (const key of sortedKeys) {
              const value = filteredConfig[key];
              const meta = configMetadata[key];
              
              const envVar = meta?.envVar ? chalk.gray(` [${meta.envVar}]`) : '';
              const description = meta?.description ? chalk.gray(` # ${meta.description}`) : '';
              
              logger.info(
                `${chalk.cyan(key.padEnd(35))} ${chalk.yellow(String(value).padEnd(30))}${envVar}${description}`
              );
            }
          }
          logger.info('');
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

        logger.info(chalk.bold(`\nConfiguration Sources (${options.env}):`));
        logger.info(chalk.gray('─'.repeat(60)));
        
        config.sources.forEach((source, index) => {
          const priority = config.sources.length - index;
          logger.info(`${chalk.gray(`${priority}.`)} ${source}`);
        });

        logger.info(chalk.gray('\n(Lower number = higher priority)'));
        logger.info('');
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

        logger.info(chalk.bold(`\nFeature Flags (${options.env}):`));
        logger.info(chalk.gray('─'.repeat(60)));
        
        Object.entries(config.config.features).forEach(([feature, enabled]) => {
          const status = enabled 
            ? chalk.green('✓ enabled') 
            : chalk.red('✗ disabled');
          logger.info(`  ${chalk.cyan(feature.padEnd(20))} ${status}`);
        });
        
        logger.info('');
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
