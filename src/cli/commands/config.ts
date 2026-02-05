/**
 * Config CLI Commands
 * 
 * Provides CLI commands for managing Dash configuration:
 * - dash config get <key>
 * - dash config list
 */

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
        console.error(`❌  Config key not found: ${key}`);
        console.log('💡  Use "dash config list" to see all available keys');
        process.exit(1);
      }
      
      if (typeof value === 'object') {
        console.log(JSON.stringify(value, null, 2));
      } else {
        console.log(`${key}=${value}`);
      }
      
      process.exit(0);
    });
  
  // config list
  cmd.command('list')
    .description('List all configuration values')
    .action(async () => {
      const config = loadConfig();
      
      if (Object.keys(config).length === 0) {
        console.log('⚠️  No configuration found');
        console.log('💡  Create dash.config.yaml in the current directory');
        process.exit(0);
      }
      
      console.log('=== Dash Configuration ===');
      console.log(JSON.stringify(config, null, 2));
      
      process.exit(0);
    });
  
  // config set <key> <value> (stub)
  cmd.command('set <key> <value>')
    .description('Set a configuration value')
    .action(async (key, value) => {
      console.log(`⚠️  config set not implemented yet`);
      console.log('💡  Edit dash.config.yaml directly');
      process.exit(1);
    });
  
  return cmd;
}

export default configCommand;
