/**
 * Work Distribution Algorithms
 * 
 * Implements various strategies for distributing tasks across agents:
 * - Round-robin: Even distribution in circular fashion
 * - Load-based: Assign to least busy agent
 * - Skill-based: Match task requirements to agent capabilities
 * - Sticky: Route related tasks to the same agent
 */

import type { 
  QueuedTask, 
  TaskAgent, 
  DistributionResult, 
  DistributionStrategy,
  DistributionContext,
} from './types';

// Re-export DistributionContext for backward compatibility
export type { DistributionContext };

/**
 * Round-robin distribution - assigns tasks to agents in circular order
 */
export function roundRobinDistribution(
  ctx: DistributionContext
): DistributionResult | null {
  const { task, availableAgents, lastAssignmentIndex = -1 } = ctx;
  
  // Filter to agents with capacity
  const capableAgents = availableAgents.filter(a => 
    a.status !== 'offline' && a.currentLoad < a.capacity
  );
  
  if (capableAgents.length === 0) {
    return null;
  }
  
  // Get next agent in round-robin order
  const nextIndex = (lastAssignmentIndex + 1) % capableAgents.length;
  const selectedAgent = capableAgents[nextIndex];
  
  return {
    taskId: task.id,
    agentId: selectedAgent.id,
    strategy: 'round-robin',
    reason: `Round-robin assignment (index ${nextIndex})`,
  };
}

/**
 * Load-based distribution - assigns to the agent with lowest load
 */
export function loadBasedDistribution(
  ctx: DistributionContext
): DistributionResult | null {
  const { task, availableAgents } = ctx;
  
  // Filter to agents with capacity and calculate load ratio
  const capableAgents = availableAgents
    .filter(a => a.status !== 'offline' && a.currentLoad < a.capacity)
    .map(a => ({
      agent: a,
      loadRatio: a.currentLoad / a.capacity,
      availableCapacity: a.capacity - a.currentLoad,
    }))
    .sort((a, b) => a.loadRatio - b.loadRatio);
  
  if (capableAgents.length === 0) {
    return null;
  }
  
  // Select agent with lowest load ratio
  const selected = capableAgents[0];
  
  return {
    taskId: task.id,
    agentId: selected.agent.id,
    strategy: 'load-based',
    reason: `Lowest load ratio (${(selected.loadRatio * 100).toFixed(1)}%) with ${selected.availableCapacity} slots available`,
  };
}

/**
 * Skill-based distribution - assigns to agent with matching skills
 */
export function skillBasedDistribution(
  ctx: DistributionContext
): DistributionResult | null {
  const { task, availableAgents } = ctx;
  
  // Get required skills from task
  const requiredSkills = task.requiredSkills || [];
  
  // Filter to capable agents
  const capableAgents = availableAgents.filter(a => 
    a.status !== 'offline' && a.currentLoad < a.capacity
  );
  
  if (capableAgents.length === 0) {
    return null;
  }
  
  // Score each agent by skill match
  const scoredAgents = capableAgents.map(agent => {
    const agentSkills = new Set(agent.skills);
    
    let matchScore = 0;
    let matchedSkills = 0;
    
    if (requiredSkills.length > 0) {
      for (const skill of requiredSkills) {
        if (agentSkills.has(skill)) {
          matchScore += 1;
          matchedSkills++;
        }
      }
      // Normalize by required skills count
      matchScore = matchScore / requiredSkills.length;
    } else {
      // No specific skills required, all agents are equal
      matchScore = 1;
    }
    
    // Factor in load (prefer less loaded agents among equally skilled)
    const loadFactor = 1 - (agent.currentLoad / agent.capacity);
    const finalScore = (matchScore * 0.7) + (loadFactor * 0.3);
    
    return {
      agent,
      matchScore,
      matchedSkills,
      loadFactor,
      finalScore,
    };
  });
  
  // Sort by final score (descending)
  scoredAgents.sort((a, b) => b.finalScore - a.finalScore);
  
  const selected = scoredAgents[0];
  
  // If no skills match and skills are required, don't assign
  if (requiredSkills.length > 0 && selected.matchScore === 0) {
    return null;
  }
  
  return {
    taskId: task.id,
    agentId: selected.agent.id,
    strategy: 'skill-based',
    reason: `Matched ${selected.matchedSkills}/${requiredSkills.length} skills at ${(selected.matchScore * 100).toFixed(0)}% with ${(selected.loadFactor * 100).toFixed(0)}% load capacity`,
  };
}

/**
 * Sticky distribution - routes related tasks to the same agent
 */
export function stickyDistribution(
  ctx: DistributionContext
): DistributionResult | null {
  const { task, availableAgents, stickyAssignments } = ctx;
  
  // Check if this task has a sticky key
  if (!task.stickyKey) {
    return null;
  }
  
  // Check if there's an existing assignment for this sticky key
  const existingAgentId = stickyAssignments.get(task.stickyKey);
  
  if (existingAgentId) {
    // Find the existing agent
    const existingAgent = availableAgents.find(a => a.id === existingAgentId);
    
    if (existingAgent && existingAgent.status !== 'offline' && existingAgent.currentLoad < existingAgent.capacity) {
      return {
        taskId: task.id,
        agentId: existingAgent.id,
        strategy: 'sticky',
        reason: `Sticky routing: assigned to existing agent for key "${task.stickyKey}"`,
      };
    }
    
    // Agent is offline or at capacity, fall through to pick new agent
  }
  
  // No existing assignment or agent unavailable - pick using load-based
  const loadResult = loadBasedDistribution(ctx);
  
  if (loadResult) {
    // Record the sticky assignment
    stickyAssignments.set(task.stickyKey, loadResult.agentId);
    
    return {
      ...loadResult,
      strategy: 'sticky',
      reason: `Sticky routing: new agent assigned for key "${task.stickyKey}" (${loadResult.reason})`,
    };
  }
  
  return null;
}

/**
 * Select the best distribution strategy for a task
 */
export function selectDistributionStrategy(
  task: QueuedTask,
  defaultStrategy: DistributionStrategy = 'load-based'
): DistributionStrategy {
  // Honor task's routing hint if provided
  if (task.routingHint) {
    return task.routingHint;
  }
  
  // Use sticky if sticky key is present
  if (task.stickyKey) {
    return 'sticky';
  }
  
  // Use skill-based if required skills are specified
  if (task.requiredSkills && task.requiredSkills.length > 0) {
    return 'skill-based';
  }
  
  return defaultStrategy;
}

/**
 * Main distribution function - selects and executes the appropriate strategy
 */
export function distributeTask(
  ctx: DistributionContext,
  defaultStrategy: DistributionStrategy = 'load-based'
): DistributionResult | null {
  const strategy = selectDistributionStrategy(ctx.task, defaultStrategy);
  
  switch (strategy) {
    case 'sticky':
      // Try sticky first, fall back to load-based
      const stickyResult = stickyDistribution(ctx);
      if (stickyResult) return stickyResult;
      // Fall through to load-based
      return loadBasedDistribution(ctx);
      
    case 'skill-based':
      // Try skill-based first, fall back to load-based
      const skillResult = skillBasedDistribution(ctx);
      if (skillResult) return skillResult;
      // Fall through to load-based
      return loadBasedDistribution(ctx);
      
    case 'round-robin':
      return roundRobinDistribution(ctx);
      
    case 'load-based':
    default:
      return loadBasedDistribution(ctx);
  }
}

/**
 * Create initial distribution context
 */
export function createDistributionContext(
  task: QueuedTask,
  availableAgents: TaskAgent[],
  state: {
    lastAssignmentIndex: number;
    stickyAssignments: Map<string, string>;
    agentAssignments?: Map<string, number>;
  }
): DistributionContext {
  return {
    task,
    availableAgents,
    lastAssignmentIndex: state.lastAssignmentIndex,
    stickyAssignments: state.stickyAssignments,
    agentAssignments: state.agentAssignments || new Map(),
  };
}

/**
 * Update distribution state after assignment
 */
export function updateDistributionState(
  state: {
    lastAssignmentIndex: number;
    stickyAssignments: Map<string, string>;
  },
  result: DistributionResult,
  agents: TaskAgent[]
): void {
  // Update round-robin index if applicable
  if (result.strategy === 'round-robin') {
    state.lastAssignmentIndex = agents.findIndex(a => a.id === result.agentId);
  }
  
  // Update sticky assignments if applicable
  if (result.strategy === 'sticky' && result.taskId) {
    // Note: We need to know the sticky key to update this properly
    // This is handled in the stickyDistribution function
  }
}
