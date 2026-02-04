import { FastifyInstance } from 'fastify';
import { logger } from './logger';

interface ShutdownHook {
  name: string;
  priority: number;
  handler: () => Promise<void> | void;
}

export class GracefulShutdown {
  private hooks: ShutdownHook[] = [];
  private isShuttingDown = false;
  private forceExitTimeout: number;

  constructor(forceExitTimeout: number = 30000) {
    this.forceExitTimeout = forceExitTimeout;
  }

  register(hook: ShutdownHook): void {
    this.hooks.push(hook);
    // Sort by priority (higher = later)
    this.hooks.sort((a, b) => a.priority - b.priority);
  }

  async shutdown(signal: string): Promise<void> {
    if (this.isShuttingDown) {
      logger.warn('Shutdown already in progress');
      return;
    }

    this.isShuttingDown = true;
    logger.info(`Graceful shutdown initiated (${signal})`);

    const startTime = Date.now();

    // Execute hooks in priority order
    for (const hook of this.hooks) {
      try {
        logger.debug(`Executing shutdown hook: ${hook.name}`);
        await Promise.race([
          hook.handler(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), this.forceExitTimeout / 2)
          )
        ]);
        logger.debug(`Shutdown hook completed: ${hook.name}`);
      } catch (error) {
        logger.error(`Shutdown hook failed: ${hook.name}`, { error });
      }
    }

    const duration = Date.now() - startTime;
    logger.info(`Graceful shutdown completed in ${duration}ms`);

    // Force exit after timeout
    setTimeout(() => {
      logger.error('Force exit after timeout');
      process.exit(1);
    }, this.forceExitTimeout).unref();
  }

  setupFastifyHooks(app: FastifyInstance): void {
    // Register hooks for common resources
    this.register({
      name: 'close-server',
      priority: 10,
      handler: async () => {
        await app.close();
        logger.info('HTTP server closed');
      }
    });
  }
}

// Singleton
let shutdown: GracefulShutdown | null = null;

export function getGracefulShutdown(forceExitTimeout?: number): GracefulShutdown {
  if (!shutdown) {
    shutdown = new GracefulShutdown(forceExitTimeout);
  }
  return shutdown;
}

// Setup signal handlers
export function setupSignalHandlers(): void {
  const gs = getGracefulShutdown();

  process.on('SIGTERM', () => gs.shutdown('SIGTERM'));
  process.on('SIGINT', () => gs.shutdown('SIGINT'));

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', { error });
    gs.shutdown('uncaughtException').then(() => process.exit(1));
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', { reason });
  });
}
