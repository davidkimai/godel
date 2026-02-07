/**
 * E2E Test Integration Harness
 * 
 * Provides a unified interface for end-to-end testing of agent workflows.
 * This harness abstracts the runtime operations and provides a clean API
 * for spawning agents, executing commands, and managing their lifecycle.
 */

import { EventEmitter } from 'events';
import type { AgentRuntime, Agent, AgentStatus, ExecResult, SpawnConfig } from '../../src/runtime/types';
import { Task, TaskStatus, CreateTaskOptions, createTask } from '../../src/tasks/types';

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for the integration harness
 */
export interface HarnessConfig {
  /** Default runtime to use (pi, native, mock) */
  defaultRuntime?: string;
  /** Working directory for spawned agents */
  workdir?: string;
  /** Environment variables for agents */
  env?: Record<string, string>;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Options for spawning an agent via the harness
 */
export interface HarnessSpawnOptions {
  /** Runtime type to use */
  runtime?: string;
  /** Agent name */
  name?: string;
  /** Model to use */
  model?: string;
  /** Provider to use */
  provider?: string;
  /** Working directory */
  workdir?: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** System prompt */
  systemPrompt?: string;
  /** Tools to enable */
  tools?: string[];
  /** Timeout in milliseconds */
  timeout?: number;
}

/**
 * Agent information returned by the harness
 */
export interface HarnessAgentInfo {
  id: string;
  name: string;
  status: AgentStatus;
  runtime: string;
  model: string;
  createdAt: Date;
}

// ============================================================================
// Mock Runtime Implementation
// ============================================================================

/**
 * Mock runtime for E2E testing without external dependencies
 */
class MockRuntime extends EventEmitter implements AgentRuntime {
  readonly id = 'mock';
  readonly name = 'Mock Runtime';
  
  private agents = new Map<string, Agent>();
  private agentCounter = 0;
  private config: HarnessConfig;

  constructor(config: HarnessConfig = {}) {
    super();
    this.config = config;
  }

  async spawn(config: SpawnConfig): Promise<Agent> {
    const agentId = `mock-${Date.now()}-${++this.agentCounter}`;
    const agentName = config.name || `mock-agent-${this.agentCounter}`;

    const agent: Agent = {
      id: agentId,
      name: agentName,
      status: 'running',
      runtime: this.id,
      model: config.model || 'mock-model',
      createdAt: new Date(),
      lastActivityAt: new Date(),
      metadata: {
        workdir: config.workdir || this.config.workdir,
        env: config.env,
        systemPrompt: config.systemPrompt,
        tools: config.tools,
      },
    };

    this.agents.set(agentId, agent);
    this.emit('agent.spawned', agent);

    if (this.config.debug) {
      console.log(`[MockRuntime] Spawned agent: ${agentId}`);
    }

    return agent;
  }

  async kill(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const previousStatus = agent.status;
    agent.status = 'stopped';
    this.agents.delete(agentId);

    this.emit('agent.killed', agentId);
    this.emit('agent.status_changed', agentId, previousStatus, 'stopped');

    if (this.config.debug) {
      console.log(`[MockRuntime] Killed agent: ${agentId}`);
    }
  }

  async exec(agentId: string, command: string): Promise<ExecResult> {
    const startTime = Date.now();
    const agent = this.agents.get(agentId);
    
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    if (agent.status !== 'running') {
      throw new Error(`Agent is not running: ${agentId}`);
    }

    agent.lastActivityAt = new Date();

    // Simulate command execution
    const result: ExecResult = {
      stdout: this.simulateCommand(command),
      stderr: '',
      exitCode: 0,
      duration: Date.now() - startTime,
      metadata: {
        timestamp: new Date(),
      },
    };

    this.emit('exec.completed', agentId, result);

    if (this.config.debug) {
      console.log(`[MockRuntime] Executed on ${agentId}: ${command.substring(0, 50)}...`);
    }

    return result;
  }

  async status(agentId: string): Promise<AgentStatus> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }
    return agent.status;
  }

  async list(): Promise<Agent[]> {
    return Array.from(this.agents.values());
  }

  /**
   * Simulate command execution based on command content
   */
  private simulateCommand(command: string): string {
    const cmd = command.trim().toLowerCase();
    
    // Echo command simulation
    if (cmd.startsWith('echo ')) {
      return command.slice(5).replace(/["']/g, '');
    }
    
    // Return the runtime identifier
    if (cmd === 'echo pi' || cmd === 'echo native' || cmd === 'echo mock') {
      return command.slice(5).trim();
    }
    
    // Hello world default
    if (cmd.includes('hello')) {
      return 'Hello World';
    }
    
    // Default response
    return `Executed: ${command}`;
  }

  /**
   * Kill all agents
   */
  async killAll(): Promise<void> {
    const promises = Array.from(this.agents.keys()).map(id => 
      this.kill(id).catch(() => { /* ignore errors */ })
    );
    await Promise.all(promises);
  }
}

// ============================================================================
// Task Manager for E2E Tests
// ============================================================================

/**
 * In-memory task manager for E2E testing
 */
class TaskManager {
  private tasks = new Map<string, Task>();
  private taskCounter = 0;

  async createTask(options: CreateTaskOptions): Promise<Task> {
    const task = createTask(options);
    
    // Preserve metadata (workaround for createTask not handling it)
    if (options.metadata) {
      (task as Task).metadata = options.metadata;
    }
    
    // Auto-generate ID if needed
    if (!task.id || this.tasks.has(task.id)) {
      task.id = `godel-${String(++this.taskCounter).padStart(5, '0')}`;
    }
    
    // Check for blocked status based on dependencies
    if (task.dependsOn.length > 0) {
      const hasIncompleteDeps = task.dependsOn.some(depId => {
        const dep = this.tasks.get(depId);
        return !dep || dep.status !== TaskStatus.DONE;
      });
      if (hasIncompleteDeps) {
        task.status = TaskStatus.BLOCKED;
      }
    }

    this.tasks.set(task.id, task);
    return task;
  }

  async getTask(taskId: string): Promise<Task | undefined> {
    return this.tasks.get(taskId);
  }

  async updateTask(taskId: string, updates: Partial<Task>): Promise<Task> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    Object.assign(task, updates, { updatedAt: new Date().toISOString() });
    return task;
  }

  async assignTask(taskId: string, assignee: string): Promise<Task> {
    return this.updateTask(taskId, { assignee, status: TaskStatus.IN_PROGRESS });
  }

  async completeTask(taskId: string): Promise<Task> {
    const task = await this.updateTask(taskId, { 
      status: TaskStatus.DONE,
      completedAt: new Date().toISOString()
    });

    // Unblock dependent tasks
    await this.unblockDependentTasks(taskId);

    return task;
  }

  async blockTask(taskId: string, reason?: string): Promise<Task> {
    return this.updateTask(taskId, { 
      status: TaskStatus.BLOCKED,
      description: reason || 'Task blocked'
    });
  }

  async listTasks(): Promise<Task[]> {
    return Array.from(this.tasks.values());
  }

  async deleteTask(taskId: string): Promise<void> {
    this.tasks.delete(taskId);
  }

  /**
   * Unblock tasks that depend on the completed task
   */
  private async unblockDependentTasks(completedTaskId: string): Promise<void> {
    for (const task of this.tasks.values()) {
      if (task.dependsOn.includes(completedTaskId) && task.status === TaskStatus.BLOCKED) {
        // Check if all dependencies are now complete
        const allDepsComplete = task.dependsOn.every(depId => {
          const dep = this.tasks.get(depId);
          return dep?.status === TaskStatus.DONE;
        });

        if (allDepsComplete) {
          task.status = TaskStatus.OPEN;
          task.updatedAt = new Date().toISOString();
        }
      }
    }
  }

  /**
   * Clear all tasks
   */
  async clear(): Promise<void> {
    this.tasks.clear();
    this.taskCounter = 0;
  }
}

// ============================================================================
// Integration Harness
// ============================================================================

/**
 * Main integration harness for E2E testing
 */
export class IntegrationHarness {
  private config: HarnessConfig;
  private runtimes = new Map<string, AgentRuntime>();
  private mockRuntime: MockRuntime;
  private taskManager: TaskManager;
  private agents = new Map<string, { runtime: string; agent: Agent }>();

  constructor(config: HarnessConfig = {}) {
    this.config = {
      defaultRuntime: 'mock',
      debug: process.env['DEBUG'] === 'true',
      ...config,
    };

    this.mockRuntime = new MockRuntime(this.config);
    this.taskManager = new TaskManager();

    // Register mock runtime
    this.runtimes.set('mock', this.mockRuntime);
  }

  /**
   * Set up the harness before tests
   */
  async setup(): Promise<void> {
    if (this.config.debug) {
      console.log('[IntegrationHarness] Setting up...');
    }
    // Additional setup if needed
  }

  /**
   * Clean up after tests
   */
  async cleanup(): Promise<void> {
    if (this.config.debug) {
      console.log('[IntegrationHarness] Cleaning up...');
    }

    // Kill all agents
    for (const runtime of this.runtimes.values()) {
      if ('killAll' in runtime && typeof runtime.killAll === 'function') {
        await runtime.killAll();
      }
    }

    // Clear tasks
    await this.taskManager.clear();

    // Clear agent tracking
    this.agents.clear();
  }

  // ============================================================================
  // Agent Operations
  // ============================================================================

  /**
   * Spawn a new agent
   */
  async spawnAgent(options: HarnessSpawnOptions = {}): Promise<HarnessAgentInfo> {
    const runtimeName = options.runtime || this.config.defaultRuntime || 'mock';
    const runtime = this.runtimes.get(runtimeName);
    
    if (!runtime) {
      throw new Error(`Runtime not found: ${runtimeName}`);
    }

    const spawnConfig: SpawnConfig = {
      name: options.name,
      model: options.model,
      provider: options.provider,
      workdir: options.workdir || this.config.workdir,
      env: { ...this.config.env, ...options.env },
      systemPrompt: options.systemPrompt,
      tools: options.tools,
      timeout: options.timeout,
    };

    const agent = await runtime.spawn(spawnConfig);
    
    // Track the agent
    this.agents.set(agent.id, { runtime: runtimeName, agent });

    return {
      id: agent.id,
      name: agent.name,
      status: agent.status,
      runtime: agent.runtime,
      model: agent.model,
      createdAt: agent.createdAt,
    };
  }

  /**
   * Execute a command on an agent
   */
  async exec(agentId: string, command: string): Promise<ExecResult> {
    const agentInfo = this.agents.get(agentId);
    if (!agentInfo) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const runtime = this.runtimes.get(agentInfo.runtime);
    if (!runtime) {
      throw new Error(`Runtime not found: ${agentInfo.runtime}`);
    }

    return runtime.exec(agentId, command);
  }

  /**
   * Get agent status
   */
  async getStatus(agentId: string): Promise<AgentStatus> {
    const agentInfo = this.agents.get(agentId);
    if (!agentInfo) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const runtime = this.runtimes.get(agentInfo.runtime);
    if (!runtime) {
      throw new Error(`Runtime not found: ${agentInfo.runtime}`);
    }

    return runtime.status(agentId);
  }

  /**
   * Kill an agent
   */
  async killAgent(agentId: string): Promise<void> {
    const agentInfo = this.agents.get(agentId);
    if (!agentInfo) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const runtime = this.runtimes.get(agentInfo.runtime);
    if (!runtime) {
      throw new Error(`Runtime not found: ${agentInfo.runtime}`);
    }

    await runtime.kill(agentId);
    this.agents.delete(agentId);
  }

  /**
   * List all agents
   */
  async listAgents(): Promise<HarnessAgentInfo[]> {
    const agents: HarnessAgentInfo[] = [];
    
    for (const { runtime: runtimeName, agent } of this.agents.values()) {
      agents.push({
        id: agent.id,
        name: agent.name,
        status: agent.status,
        runtime: agent.runtime,
        model: agent.model,
        createdAt: agent.createdAt,
      });
    }

    return agents;
  }

  // ============================================================================
  // Task Operations
  // ============================================================================

  /**
   * Create a task
   */
  async createTask(options: CreateTaskOptions): Promise<Task> {
    return this.taskManager.createTask(options);
  }

  /**
   * Get a task by ID
   */
  async getTask(taskId: string): Promise<Task | undefined> {
    return this.taskManager.getTask(taskId);
  }

  /**
   * Assign a task to an agent
   */
  async assignTask(taskId: string, agentId: string): Promise<Task> {
    // Verify agent exists
    if (!this.agents.has(agentId)) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    return this.taskManager.assignTask(taskId, agentId);
  }

  /**
   * Complete a task
   */
  async completeTask(taskId: string): Promise<Task> {
    return this.taskManager.completeTask(taskId);
  }

  /**
   * Block a task
   */
  async blockTask(taskId: string, reason?: string): Promise<Task> {
    return this.taskManager.blockTask(taskId, reason);
  }

  /**
   * List all tasks
   */
  async listTasks(): Promise<Task[]> {
    return this.taskManager.listTasks();
  }

  // ============================================================================
  // Runtime Registration
  // ============================================================================

  /**
   * Register a runtime for use with the harness
   */
  registerRuntime(name: string, runtime: AgentRuntime): void {
    this.runtimes.set(name, runtime);
  }

  /**
   * Get a runtime by name
   */
  getRuntime(name: string): AgentRuntime | undefined {
    return this.runtimes.get(name);
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a new integration harness instance
 */
export function createHarness(config?: HarnessConfig): IntegrationHarness {
  return new IntegrationHarness(config);
}

/**
 * Wait for a condition with timeout
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout: number = 5000,
  interval: number = 100
): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  throw new Error(`Condition not met within ${timeout}ms`);
}

/**
 * Wait for agent to reach a specific status
 */
export async function waitForAgentStatus(
  harness: IntegrationHarness,
  agentId: string,
  targetStatus: AgentStatus,
  timeout: number = 5000
): Promise<void> {
  await waitFor(async () => {
    const status = await harness.getStatus(agentId);
    return status === targetStatus;
  }, timeout);
}

export default IntegrationHarness;
