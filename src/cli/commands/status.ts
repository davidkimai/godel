/**
 * Status Command - System Overview
 *
 * Shows Dash system status including:
 * - Version, uptime, memory, PID
 * - Optional OpenClaw details (graceful degradation)
 *
 * Usage: dash status [--simple] [--json]
 */

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
        console.log(JSON.stringify(basicStatus, null, 2));
        return;
      }
      
      console.log('=== Dash Status ===');
      console.log(`Version: ${basicStatus.version}`);
      console.log(`Uptime: ${Math.floor(basicStatus.uptime / 60)}m ${Math.floor(basicStatus.uptime % 60)}s`);
      console.log(`Memory: ${Math.round(basicStatus.memory.heapUsed / 1024 / 1024)}MB`);
      console.log(`PID: ${basicStatus.pid}`);
      console.log(`Timestamp: ${basicStatus.timestamp}`);
      
      // Try OpenClaw only if not --simple
      if (!options.simple) {
        // Graceful degradation - try to check OpenClaw without import
        try {
          const hasOpenClaw = process.env['OPENCLAW_SESSION'] || process.env['OPENCLAW_GATEWAY_URL'];
          
          if (hasOpenClaw) {
            console.log('\n=== OpenClaw Status ===');
            console.log(JSON.stringify({
              connected: true,
              mode: 'connected',
              version: process.env['OPENCLAW_VERSION'] || '1.0.0'
            }, null, 2));
          } else {
            console.log('\n⚠️  OpenClaw: Not configured');
            console.log('   Run: dash init to configure');
          }
        } catch (error) {
          console.log('\n⚠️  OpenClaw: Not available');
          console.log('   Run: dash init to configure');
        }
      }
      
      process.exit(0);
    });
  
  return cmd;
}

export default statusCommand;
