#!/usr/bin/env ts-node
import { logger } from '../src/utils/logger';
/**
 * Log Management Utility for Dash
 * 
 * Provides commands for querying logs, managing log retention,
 * and analyzing log patterns.
 */

import { execSync } from 'child_process';

const LOKI_URL = process.env.LOKI_URL || 'http://localhost:3100';

interface QueryOptions {
  job?: string;
  agentId?: string;
  traceId?: string;
  swarmId?: string;
  level?: string;
  start?: string;
  end?: string;
  limit?: number;
}

function buildQuery(options: QueryOptions): string {
  const selectors: string[] = [];
  
  if (options.job) {
    selectors.push(`job="${options.job}"`);
  } else {
    selectors.push('job="dash"');
  }
  
  if (options.agentId) selectors.push(`agent_id="${options.agentId}"`);
  if (options.swarmId) selectors.push(`swarm_id="${options.swarmId}"`);
  if (options.traceId) selectors.push(`trace_id="${options.traceId}"`);
  if (options.level) selectors.push(`level="${options.level}"`);
  
  return `{${selectors.join(',')}}`;
}

async function queryLogs(options: QueryOptions) {
  const query = buildQuery(options);
  const limit = options.limit || 100;
  
  logger.info(`Query: ${query}`);
  logger.info(`Limit: ${limit}`);
  logger.info('---');
  
  try {
    const url = `${LOKI_URL}/loki/api/v1/query_range?query=${encodeURIComponent(query)}&limit=${limit}`;
    const result = execSync(`curl -s "${url}"`, { encoding: 'utf8' });
    const data = JSON.parse(result);
    
    if (data.data?.result) {
      for (const stream of data.data.result) {
        for (const value of stream.values) {
          const timestamp = new Date(parseInt(value[0]) / 1000000).toISOString();
          let message = value[1];
          
          // Try to parse as JSON for pretty printing
          try {
            const parsed = JSON.parse(message);
            message = JSON.stringify(parsed, null, 2);
          } catch {
            // Keep as-is if not JSON
          }
          
          logger.info(`[${timestamp}] ${message}\n`);
        }
      }
    }
  } catch (error) {
    console.error('Error querying logs:', error);
    process.exit(1);
  }
}

async function tailLogs(options: QueryOptions) {
  const query = buildQuery(options);
  
  logger.info(`Tailing logs with query: ${query}`);
  logger.info('Press Ctrl+C to stop\n');
  
  const url = `${LOKI_URL}/loki/api/v1/tail?query=${encodeURIComponent(query)}`;
  
  try {
    execSync(`curl -s -N "${url}"`, { 
      encoding: 'utf8',
      stdio: 'inherit'
    });
  } catch {
    // User interrupted
  }
}

async function getLabels() {
  try {
    const url = `${LOKI_URL}/loki/api/v1/label/job/values`;
    const result = execSync(`curl -s "${url}"`, { encoding: 'utf8' });
    const data = JSON.parse(result);
    
    logger.info('Available jobs:');
    for (const job of data.data || []) {
      logger.info(`  - ${job}`);
    }
  } catch (error) {
    console.error('Error getting labels:', error);
  }
}

async function getAgentIds() {
  try {
    const url = `${LOKI_URL}/loki/api/v1/label/agent_id/values`;
    const result = execSync(`curl -s "${url}"`, { encoding: 'utf8' });
    const data = JSON.parse(result);
    
    logger.info('Active agents:');
    for (const agent of data.data || []) {
      logger.info(`  - ${agent}`);
    }
  } catch (error) {
    console.error('Error getting agent IDs:', error);
  }
}

async function showStats() {
  const queries = [
    { name: 'Total logs (last hour)', query: 'sum(rate({job="dash"}[1h]))' },
    { name: 'Error count (last hour)', query: 'sum(rate({job="dash"} |= "ERROR" [1h]))' },
    { name: 'Warn count (last hour)', query: 'sum(rate({job="dash"} |= "WARN" [1h]))' },
  ];
  
  logger.info('Log Statistics\n==============\n');
  
  for (const q of queries) {
    try {
      const url = `${LOKI_URL}/loki/api/v1/query?query=${encodeURIComponent(q.query)}`;
      const result = execSync(`curl -s "${url}"`, { encoding: 'utf8' });
      const data = JSON.parse(result);
      
      let value = '0';
      if (data.data?.result?.[0]?.values?.[0]) {
        value = data.data.result[0].values[0][1];
      }
      
      logger.info(`${q.name}: ${value}`);
    } catch (error) {
      console.error(`Error getting ${q.name}:`, error);
    }
  }
}

function showHelp() {
  logger.info(`
Dash Log Management Utility

Usage: ts-node scripts/logs.ts <command> [options]

Commands:
  query [options]     Query logs from Loki
  tail [options]      Tail logs in real-time
  labels              List available labels
  agents              List active agent IDs
  stats               Show log statistics
  help                Show this help message

Query Options:
  --job <job>         Job name (default: dash)
  --agent <id>        Filter by agent ID
  --trace <id>        Filter by trace ID
  --swarm <id>        Filter by swarm ID
  --level <level>     Filter by log level
  --limit <n>         Limit results (default: 100)

Examples:
  ts-node scripts/logs.ts query --level ERROR --limit 50
  ts-node scripts/logs.ts tail --agent agent-123
  ts-node scripts/logs.ts query --trace trace-abc-123
  ts-node scripts/logs.ts agents
`);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  // Parse options
  const options: QueryOptions = {};
  for (let i = 1; i < args.length; i += 2) {
    const flag = args[i];
    const value = args[i + 1];
    
    switch (flag) {
      case '--job': options.job = value; break;
      case '--agent': options.agentId = value; break;
      case '--trace': options.traceId = value; break;
      case '--swarm': options.swarmId = value; break;
      case '--level': options.level = value; break;
      case '--limit': options.limit = parseInt(value); break;
    }
  }
  
  switch (command) {
    case 'query':
      await queryLogs(options);
      break;
    case 'tail':
      await tailLogs(options);
      break;
    case 'labels':
      await getLabels();
      break;
    case 'agents':
      await getAgentIds();
      break;
    case 'stats':
      await showStats();
      break;
    case 'help':
    default:
      showHelp();
      break;
  }
}

main().catch(console.error);
