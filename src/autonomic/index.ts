/**
 * Autonomic Maintenance Swarm
 * 
 * Self-maintaining maintenance system for Godel.
 * Automatically detects, diagnoses, and fixes errors.
 * 
 * @module autonomic
 */

// Types
export * from './types';

// Services
export { ErrorListenerService } from './error-listener';
export { TestWriterAgent } from './test-writer';
export { PatchAgent } from './patch-agent';
export { PRAgent } from './pr-agent';
export { MaintenanceSwarmOrchestrator } from './orchestrator';

// Factory function for easy instantiation
import { AgentEventBus } from '../core/event-bus';
import { MaintenanceSwarmOrchestrator } from './orchestrator';

/**
 * Create and start the autonomic maintenance swarm
 */
export async function createAutonomicSwarm(
  eventBus: AgentEventBus
): Promise<MaintenanceSwarmOrchestrator> {
  const orchestrator = new MaintenanceSwarmOrchestrator({ eventBus });
  await orchestrator.start();
  return orchestrator;
}

/**
 * Get the singleton orchestrator instance
 */
let globalOrchestrator: MaintenanceSwarmOrchestrator | null = null;

export function getGlobalOrchestrator(
  eventBus?: AgentEventBus
): MaintenanceSwarmOrchestrator | null {
  if (!globalOrchestrator && eventBus) {
    globalOrchestrator = new MaintenanceSwarmOrchestrator({ eventBus });
  }
  return globalOrchestrator;
}

export function setGlobalOrchestrator(
  orchestrator: MaintenanceSwarmOrchestrator | null
): void {
  globalOrchestrator = orchestrator;
}
