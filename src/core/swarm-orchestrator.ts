/**
 * Swarm Orchestrator Module
 * 
 * Coordinates swarm operations and manages swarm lifecycle across the system.
 */

import { EventEmitter } from 'events';
import type { SwarmManager } from './swarm';
import type { SwarmExecutor } from './swarm-executor';

export interface SwarmOrchestratorConfig {
  maxConcurrentSwarms?: number;
  defaultTimeout?: number;
  autoCleanup?: boolean;
}

export interface OrchestratedSwarm {
  id: string;
  swarmId: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  startedAt: Date;
  completedAt?: Date;
  error?: string;
}

/**
 * SwarmOrchestrator - Manages multiple swarms and their execution
 */
export class SwarmOrchestrator extends EventEmitter {
  private swarms: Map<string, OrchestratedSwarm> = new Map();
  private config: SwarmOrchestratorConfig;
  private swarmManager?: SwarmManager;
  private swarmExecutor?: SwarmExecutor;

  constructor(config: SwarmOrchestratorConfig = {}) {
    super();
    this.config = {
      maxConcurrentSwarms: 10,
      defaultTimeout: 300000,
      autoCleanup: true,
      ...config,
    };
  }

  /**
   * Initialize the orchestrator with dependencies
   */
  initialize(swarmManager: SwarmManager, swarmExecutor: SwarmExecutor): void {
    this.swarmManager = swarmManager;
    this.swarmExecutor = swarmExecutor;
    this.emit('initialized');
  }

  /**
   * Start the orchestrator
   */
  start(): void {
    this.emit('started');
  }

  /**
   * Stop the orchestrator
   */
  stop(): void {
    this.emit('stopped');
  }

  /**
   * Register a swarm for orchestration
   */
  registerSwarm(swarmId: string): OrchestratedSwarm {
    const orchestrated: OrchestratedSwarm = {
      id: `orch-${Date.now()}`,
      swarmId,
      status: 'pending',
      startedAt: new Date(),
    };

    this.swarms.set(orchestrated.id, orchestrated);
    this.emit('swarm:registered', orchestrated);

    return orchestrated;
  }

  /**
   * Execute a registered swarm
   */
  async executeSwarm(orchestratedId: string, agentIds: string[]): Promise<OrchestratedSwarm> {
    const orchestrated = this.swarms.get(orchestratedId);
    if (!orchestrated) {
      throw new Error(`Orchestrated swarm not found: ${orchestratedId}`);
    }

    orchestrated.status = 'active';
    this.emit('swarm:started', orchestrated);

    try {
      // In a real implementation, this would use swarmExecutor
      if (this.swarmExecutor) {
        await this.swarmExecutor.executeSwarm(orchestrated.swarmId, agentIds);
      }

      orchestrated.status = 'completed';
      orchestrated.completedAt = new Date();
      this.emit('swarm:completed', orchestrated);
    } catch (error) {
      orchestrated.status = 'failed';
      orchestrated.error = error instanceof Error ? error.message : String(error);
      orchestrated.completedAt = new Date();
      this.emit('swarm:failed', orchestrated);
    }

    return orchestrated;
  }

  /**
   * Get an orchestrated swarm by ID
   */
  getSwarm(orchestratedId: string): OrchestratedSwarm | undefined {
    return this.swarms.get(orchestratedId);
  }

  /**
   * Get all orchestrated swarms
   */
  getAllSwarms(): OrchestratedSwarm[] {
    return Array.from(this.swarms.values());
  }

  /**
   * Get active swarms
   */
  getActiveSwarms(): OrchestratedSwarm[] {
    return this.getAllSwarms().filter(s => s.status === 'active');
  }

  /**
   * Cancel a running swarm
   */
  async cancelSwarm(orchestratedId: string): Promise<boolean> {
    const orchestrated = this.swarms.get(orchestratedId);
    if (!orchestrated) {
      return false;
    }

    if (orchestrated.status === 'active') {
      orchestrated.status = 'failed';
      orchestrated.error = 'Cancelled by user';
      orchestrated.completedAt = new Date();
      this.emit('swarm:cancelled', orchestrated);
    }

    return true;
  }

  /**
   * Clean up completed swarms
   */
  cleanup(): void {
    for (const [id, swarm] of this.swarms) {
      if (swarm.status === 'completed' || swarm.status === 'failed') {
        this.swarms.delete(id);
      }
    }
    this.emit('cleanup');
  }

  /**
   * Get orchestrator statistics
   */
  getStats(): {
    total: number;
    pending: number;
    active: number;
    completed: number;
    failed: number;
    swarms: number;
    agents: number;
    teams: number;
  } {
    const swarms = this.getAllSwarms();
    return {
      total: swarms.length,
      pending: swarms.filter(s => s.status === 'pending').length,
      active: swarms.filter(s => s.status === 'active').length,
      completed: swarms.filter(s => s.status === 'completed').length,
      failed: swarms.filter(s => s.status === 'failed').length,
      swarms: swarms.length,
      agents: 0, // Would be populated from actual agent data
      teams: 0,  // Would be populated from actual team data
    };
  }

  /**
   * Reset the orchestrator (clear all swarms)
   */
  reset(): void {
    this.swarms.clear();
    this.emit('reset');
  }
}

// Singleton instance
let globalSwarmOrchestrator: SwarmOrchestrator | null = null;

export function getGlobalSwarmOrchestrator(): SwarmOrchestrator {
  if (!globalSwarmOrchestrator) {
    globalSwarmOrchestrator = new SwarmOrchestrator();
  }
  return globalSwarmOrchestrator;
}

export function resetGlobalSwarmOrchestrator(): void {
  if (globalSwarmOrchestrator) {
    globalSwarmOrchestrator.reset();
  }
  globalSwarmOrchestrator = null;
}
