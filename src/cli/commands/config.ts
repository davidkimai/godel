/**
 * Config CLI Commands
 * 
 * Provides CLI commands for managing Dash configuration:
 * - dash config get <key>
 * - dash config list
 */

import { logger } from '../../utils/logger';
import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

export interface ConfigData {
  server?: {
    port?: number;
    host?: string;
  };
  database?: {
    url?: string;
    type?: string;
  };
  openclaw?: {
    enabled?: boolean;
    gatewayUrl?: string;
  };
  swarm?: {
    defaultAgents?: number;
    maxAgents?: number;
  };
}

function loadConfig(): ConfigData {
  const configPaths = [
    'dash.config.yaml',
    'dash.config.yml',
    '.dashrc',
    path.join(process.env['HOME'] || '', '.dashrc')
  ];
  
  for (const configPath of configPaths) {
    try {
      const content = fs.readFileSync(configPath, 'utf-8');
      return yaml.load(content) as ConfigData;
    } catch {
      continue;
    }
  }
  
  return {};
}

function getNestedValue(obj: any, pathStr: string): any {
  return pathStr.split('.').reduce((o, k) => o?.[k], obj);
}

export function configCommand(): Command {
  const cmd = new Command('config')
    .description('Configuration management')
    .configureHelp({ sortOptions: true });
  
  // config get <key>
  cmd.command('get <key>')
    .description('Get a configuration value')
    .action(async (key) => {
      const config = loadConfig();
      const value = getNestedValue(config, key);
      
      if (value === undefined) {
        logger.error(`❌  Config key not found: ${key}`);
        logger.info('💡  Use "dash config list" to see all available keys');
        process.exit(1);
      }
      
      if (typeof value === 'object') {
        logger.info(JSON.stringify(value, null, 2));
      } else {
        logger.info(`${key}=${value}`);
      }
      
      process.exit(0);
    });
  
  // config list
  cmd.command('list')
    .description('List all configuration values')
    .action(async () => {
      const config = loadConfig();
      
      if (Object.keys(config).length === 0) {
        logger.info('⚠️  No configuration found');
        logger.info('💡  Create dash.config.yaml in the current directory');
        process.exit(0);
      }
      
      logger.info('=== Dash Configuration ===');
      logger.info(JSON.stringify(config, null, 2));
      
      process.exit(0);
    });
  
  // config set <key> <value> (stub)
  cmd.command('set <key> <value>')
    .description('Set a configuration value')
    .action(async (key, value) => {
      logger.info(`⚠️  config set not implemented yet`);
      logger.info('💡  Edit dash.config.yaml directly');
      process.exit(1);
    });
  
  return cmd;
}

export default configCommand;
