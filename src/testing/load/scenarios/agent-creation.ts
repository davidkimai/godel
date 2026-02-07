/**
 * Agent Creation Load Test Scenario
 * 
 * Tests the system's ability to handle concurrent agent creation.
 */

import { LoadGenerator, BuiltInScenarios, LoadTestResult } from '../loader';

export interface AgentCreationConfig {
  target: string;
  agentCount?: number;
  duration?: number;
  requestRate?: number;
  agentType?: string;
}

/**
 * Run agent creation load test
 */
export async function runAgentCreationLoadTest(
  config: AgentCreationConfig
): Promise<LoadTestResult> {
  const generator = new LoadGenerator({
    agentCount: config.agentCount || 50,
    duration: config.duration || 60,
    requestRate: config.requestRate || 2,
    target: config.target,
    scenario: 'agent-creation',
    timeout: 10000, // Longer timeout for agent creation
    successCriteria: {
      minSuccessRate: 99.9,
      maxP95Latency: 2000,
      maxP99Latency: 5000,
      maxErrorRate: 0.1,
    },
  });

  generator.registerScenario(
    'agent-creation',
    BuiltInScenarios.createAgent(config.target, { type: config.agentType || 'worker' })
  );

  generator.on('start', (data) => {
    console.log(`[Agent Creation Test] Started: ${data.testId}`);
    console.log(`  Creating ${data.config.agentCount} agents over ${data.config.duration}s`);
  });

  generator.on('complete', (result) => {
    console.log(`[Agent Creation Test] Completed`);
    console.log(`  Agents created: ${result.metrics.successfulRequests}`);
    console.log(`  Failed: ${result.metrics.failedRequests}`);
    console.log(`  Avg creation time: ${result.metrics.latencies.mean.toFixed(0)}ms`);
    console.log(`  P95 creation time: ${result.metrics.latencies.p95}ms`);
  });

  return generator.run();
}

/**
 * Run burst agent creation test (rapid scale-up)
 */
export async function runBurstAgentCreation(
  target: string,
  burstSize: number = 100
): Promise<LoadTestResult> {
  const generator = new LoadGenerator({
    agentCount: burstSize,
    duration: 10,
    rampUpTime: 0.5,
    requestRate: 50, // High rate for burst
    target,
    scenario: 'agent-creation',
    timeout: 15000,
    successCriteria: {
      minSuccessRate: 99.0,
      maxP95Latency: 3000,
      maxP99Latency: 8000,
      maxErrorRate: 1.0,
    },
  });

  generator.registerScenario('agent-creation', BuiltInScenarios.createAgent(target));

  generator.on('start', () => {
    console.log(`[Burst Creation] Creating ${burstSize} agents in 0.5s...`);
  });

  generator.on('complete', (result) => {
    console.log(`[Burst Creation] Created ${result.metrics.successfulRequests}/${burstSize} agents`);
    console.log(`  Success rate: ${result.metrics.successRate.toFixed(2)}%`);
  });

  return generator.run();
}

/**
 * Run sustained agent creation test (steady state)
 */
export async function runSustainedAgentCreation(target: string): Promise<LoadTestResult> {
  return runAgentCreationLoadTest({
    target,
    agentCount: 20,
    duration: 300, // 5 minutes
    requestRate: 1,
  });
}

export default {
  runAgentCreationLoadTest,
  runBurstAgentCreation,
  runSustainedAgentCreation,
};
