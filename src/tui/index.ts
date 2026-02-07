/**
 * Godel TUI - Terminal User Interface Entry Point
 * 
 * Provides real-time team monitoring in the terminal using Ink (React for terminals)
 */

import React from 'react';
import { render } from 'ink';
import { Dashboard } from './components/Dashboard';
import { logger } from '../utils/logger';

export interface TUIOptions {
  port?: number;
  host?: string;
  refreshRate?: number;
  defaultView?: 'teams' | 'sessions' | 'tasks' | 'logs';
}

export function start(options: TUIOptions = {}): void {
  const { port = 7373, host = 'localhost', refreshRate = 1000, defaultView = 'teams' } = options;

  logger.info('🎯 Godel TUI Dashboard');

  // Render the TUI
  const { waitUntilExit } = render(
    React.createElement(Dashboard, {
      port,
      host,
      refreshRate,
      defaultView
    }),
    {
      exitOnCtrlC: true
    }
  );

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    logger.info('\n👋 TUI shutting down...');
    process.exit(0);
  });

  // Wait for the app to exit
  waitUntilExit().catch((error) => {
    logger.error('TUI error:', error);
    process.exit(1);
  });
}

export { Dashboard } from './components/Dashboard';
export { TeamMonitor } from './components/TeamMonitor';
export { SessionBrowser } from './components/SessionBrowser';
export { TaskQueue } from './components/TaskQueue';
export { LogStream } from './components/LogStream';
