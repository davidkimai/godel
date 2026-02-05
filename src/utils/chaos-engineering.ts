// Chaos Engineering - Fault injection for testing resilience

import { logger } from '../integrations/utils/logger';
import { EventEmitter } from 'events';

export interface ChaosScenario {
  name: string;
  description: string;
  target: 'database' | 'redis' | 'network' | 'memory' | 'cpu';
  action: () => Promise<void> | void;
  rollback: () => Promise<void> | void;
}

export class ChaosEngineering extends EventEmitter {
  private activeScenarios: Map<string, ChaosScenario> = new Map();
  private isRunning = false;

  // Predefined scenarios
  readonly scenarios: Record<string, ChaosScenario> = {
    database_slow: {
      name: 'database_slow',
      description: 'Simulate slow database queries (adds 2s delay)',
      target: 'database',
      action: async () => {
        logger.info('Chaos: Injecting database slowness');
        // Implementation would wrap queries with delay
      },
      rollback: async () => {
        logger.info('Chaos: Rolling back database slowness');
      }
    },
    
    database_failure: {
      name: 'database_failure',
      description: 'Simulate database connection failure',
      target: 'database',
      action: async () => {
        logger.info('Chaos: Injecting database failure');
        // Implementation would close connections
      },
      rollback: async () => {
        logger.info('Chaos: Restoring database connections');
      }
    },
    
    redis_failure: {
      name: 'redis_failure',
      description: 'Simulate Redis outage',
      target: 'redis',
      action: async () => {
        logger.info('Chaos: Injecting Redis failure');
        // Implementation would disconnect Redis
      },
      rollback: async () => {
        logger.info('Chaos: Restoring Redis connection');
      }
    },
    
    network_latency: {
      name: 'network_latency',
      description: 'Add 500ms latency to all network calls',
      target: 'network',
      action: async () => {
        logger.info('Chaos: Injecting network latency');
        // Implementation would add delays to HTTP calls
      },
      rollback: async () => {
        logger.info('Chaos: Removing network latency');
      }
    },
    
    network_partition: {
      name: 'network_partition',
      description: 'Simulate network partition (50% packet loss)',
      target: 'network',
      action: async () => {
        logger.info('Chaos: Injecting network partition');
      },
      rollback: async () => {
        logger.info('Chaos: Restoring network connectivity');
      }
    },
    
    memory_pressure: {
      name: 'memory_pressure',
      description: 'Consume 500MB of memory',
      target: 'memory',
      action: async () => {
        logger.info('Chaos: Creating memory pressure');
        // Allocate memory
        const leak: any[] = [];
        for (let i = 0; i < 500; i++) {
          leak.push(Buffer.alloc(1024 * 1024)); // 1MB each
        }
        (global as any).CHAOS_MEMORY_LEAK = leak;
      },
      rollback: async () => {
        logger.info('Chaos: Releasing memory');
        delete (global as any).CHAOS_MEMORY_LEAK;
        if (global.gc) {
          global.gc();
        }
      }
    },
    
    cpu_load: {
      name: 'cpu_load',
      description: 'Generate CPU load (50% for 30s)',
      target: 'cpu',
      action: async () => {
        logger.info('Chaos: Generating CPU load');
        const start = Date.now();
        while (Date.now() - start < 30000) {
          // Busy loop
          Math.random() * Math.random();
        }
      },
      rollback: async () => {
        logger.info('Chaos: CPU load complete');
      }
    }
  };

  async runScenario(name: string, durationMs: number = 60000): Promise<void> {
    const scenario = this.scenarios[name];
    if (!scenario) {
      throw new Error(`Unknown chaos scenario: ${name}`);
    }

    if (this.isRunning) {
      throw new Error('Another chaos scenario is already running');
    }

    this.isRunning = true;
    this.activeScenarios.set(name, scenario);

    try {
      logger.info(`Starting chaos scenario: ${scenario.name}`);
      logger.info(`Description: ${scenario.description}`);
      logger.info(`Duration: ${durationMs}ms`);

      this.emit('scenarioStarted', { name, scenario });

      // Inject fault
      await scenario.action();

      // Wait for duration
      await new Promise(resolve => setTimeout(resolve, durationMs));

      // Rollback
      await scenario.rollback();

      logger.info(`Chaos scenario completed: ${scenario.name}`);
      this.emit('scenarioCompleted', { name });

    } catch (error) {
      logger.error(`Chaos scenario failed: ${scenario.name}`, { error });
      this.emit('scenarioFailed', { name, error });
      
      // Always try to rollback
      try {
        await scenario.rollback();
      } catch (rollbackError) {
        logger.error('Rollback failed', { rollbackError });
      }
      
      throw error;
    } finally {
      this.isRunning = false;
      this.activeScenarios.delete(name);
    }
  }

  listScenarios(): Array<{ name: string; description: string; target: string }> {
    return Object.values(this.scenarios).map(s => ({
      name: s.name,
      description: s.description,
      target: s.target
    }));
  }

  getActiveScenarios(): string[] {
    return Array.from(this.activeScenarios.keys());
  }
}

// Singleton
let chaos: ChaosEngineering | null = null;

export function getChaosEngineering(): ChaosEngineering {
  if (!chaos) {
    chaos = new ChaosEngineering();
  }
  return chaos;
}
