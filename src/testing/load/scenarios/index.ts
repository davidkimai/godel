/**
 * Load Test Scenarios Index
 * 
 * Export all load testing scenarios for easy access.
 */

export * from './health-check';
export * from './agent-creation';
export * from './task-execution';

import healthCheck from './health-check';
import agentCreation from './agent-creation';
import taskExecution from './task-execution';

export const Scenarios = {
  healthCheck,
  agentCreation,
  taskExecution,
};

export default Scenarios;
