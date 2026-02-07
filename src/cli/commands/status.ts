/**
 * Status Command - System Overview
 *
 * Shows Godel system status including:
 * - Version, uptime, memory, PID
 * - Optional OpenClaw details (graceful degradation)
 *
 * Usage: godel status [--simple] [--json]
 */

import { logger } from '../../utils/logger';
import { Command } from 'commander';
import { readFileSync } from 'fs';
import { resolve } from 'path';

export function statusCommand(): Command {
  const cmd = new Command('status')
    .description('Show system status')
    .option('--simple', 'Show simplified status without OpenClaw details')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      // Get version from package.json
      let version = '2.0.0';
      try {
        const packagePath = resolve(__dirname, '../../package.json');
        const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));
        version = packageJson.version || '2.0.0';
      } catch {
        // Fallback to default
      }
      
      const basicStatus = {
        version,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        timestamp: new Date().toISOString(),
        pid: process.pid
      };
      
      if (options.json) {
        logger.info(JSON.stringify(basicStatus, null, 2));
        return;
      }
      
      logger.info('=== Godel Status ===');
      logger.info(`Version: ${basicStatus.version}`);
      logger.info(`Uptime: ${Math.floor(basicStatus.uptime / 60)}m ${Math.floor(basicStatus.uptime % 60)}s`);
      logger.info(`Memory: ${Math.round(basicStatus.memory.heapUsed / 1024 / 1024)}MB`);
      logger.info(`PID: ${basicStatus.pid}`);
      logger.info(`Timestamp: ${basicStatus.timestamp}`);
      
      // Try OpenClaw only if not --simple
      if (!options.simple) {
        // Graceful degradation - try to check OpenClaw without import
        try {
          const hasOpenClaw = process.env['OPENCLAW_SESSION'] || process.env['OPENCLAW_GATEWAY_URL'];
          
          if (hasOpenClaw) {
            logger.info('\n=== OpenClaw Status ===');
            logger.info(JSON.stringify({
              connected: true,
              mode: 'connected',
              version: process.env['OPENCLAW_VERSION'] || '1.0.0'
            }, null, 2));
          } else {
            logger.info('\n⚠️  OpenClaw: Not configured');
            logger.info('   Run: godel init to configure');
          }
        } catch (error) {
          logger.info('\n⚠️  OpenClaw: Not available');
          logger.info('   Run: godel init to configure');
        }
      }
      
      process.exit(0);
    });
  
  return cmd;
}

export default statusCommand;
