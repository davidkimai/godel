#!/usr/bin/env node
/**
 * Dash API Server Entry Point
 * 
 * Unified server using Express as the primary framework.
 * This eliminates port conflicts from having multiple server implementations.
 * 
 * Usage:
 *   node start-server.js              # Start on default port (3000)
 *   PORT=8080 node start-server.js   # Start on custom port
 */

const { startServer } = require('./dist/api/server-factory');

async function main() {
  try {
    const config = {
      port: parseInt(process.env['PORT'] || '3000', 10),
      host: process.env['HOST'] || 'localhost',
    };

    console.log('🚀 Starting Dash API Server...');
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
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
}

main();
