/**
 * Autonomic Maintenance Team
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
export { MaintenanceTeamOrchestrator } from './orchestrator';

// Factory function for easy instantiation
import { AgentEventBus } from '../core/event-bus';
import { MaintenanceTeamOrchestrator } from './orchestrator';

/**
 * Create and start the autonomic maintenance team
 */
export async function createAutonomicTeam(
  eventBus: AgentEventBus
): Promise<MaintenanceTeamOrchestrator> {
  const orchestrator = new MaintenanceTeamOrchestrator({ eventBus });
  await orchestrator.start();
  return orchestrator;
}

/**
 * Get the singleton orchestrator instance
 */
let globalOrchestrator: MaintenanceTeamOrchestrator | null = null;

export function getGlobalOrchestrator(
  eventBus?: AgentEventBus
): MaintenanceTeamOrchestrator | null {
  if (!globalOrchestrator && eventBus) {
    globalOrchestrator = new MaintenanceTeamOrchestrator({ eventBus });
  }
  return globalOrchestrator;
}

export function setGlobalOrchestrator(
  orchestrator: MaintenanceTeamOrchestrator | null
): void {
  globalOrchestrator = orchestrator;
}
