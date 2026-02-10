#!/usr/bin/env ts-node
/**
 * Dash API Server Entry Point (Development)
 * 
 * Unified server using Express as the primary framework.
 * Uses ts-node for direct TypeScript execution without build step.
 * 
 * Usage:
 *   npx ts-node start-server-dev.ts
 *   PORT=8080 npx ts-node start-server-dev.ts
 */

import { startServer } from './src/api/server-factory';
import './scripts/ensure-project-root';

async function main() {
  try {
    const config = {
      port: parseInt(process.env['PORT'] || '3000', 10),
      host: process.env['HOST'] || 'localhost',
    };

    console.log('🚀 Starting Dash API Server (Development)...');
    console.log(`   Port: ${config.port}`);
    console.log(`   Host: ${config.host}`);
    console.log(`   Framework: Express (unified)`);
    
    const server = await startServer(config);
    
    // Handle graceful shutdown
    process.on('SIGTERM', () => {
      console.log('\n🛑 SIGTERM received, shutting down gracefully...');
      server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
      });
    });

    process.on('SIGINT', () => {
      console.log('\n🛑 SIGINT received, shutting down gracefully...');
      server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
      });
    });

  } catch (error) {
    console.error('❌ Failed to start server:', (error as Error).message);
    process.exit(1);
  }
}

main();
