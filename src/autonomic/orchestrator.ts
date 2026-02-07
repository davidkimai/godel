/**
 * Maintenance Team Orchestrator
 * 
 * Coordinates the autonomic maintenance team:
 * - Error Listener: Monitors for errors
 * - Test Writer: Creates reproduction tests
 * - Patch Agent: Generates fixes
 * - PR Agent: Submits fixes as PRs
 */

import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { AgentEventBus } from '../core/event-bus';
import {
  OrchestratorDependencies,
  ErrorEvent,
  TestResult,
  PatchResult,
  PRResult,
  FixResult,
  AutonomicStatus,
  ErrorListenerService,
  TestWriterAgent,
  PatchAgent,
  PRAgent,
} from './types';
import { ErrorListenerService as ErrorListenerServiceImpl } from './error-listener';
import { TestWriterAgent as TestWriterAgentImpl } from './test-writer';
import { PatchAgent as PatchAgentImpl } from './patch-agent';
import { PRAgent as PRAgentImpl } from './pr-agent';

// ============================================================================
// Orchestrator State
// ============================================================================

type OrchestratorState = 'idle' | 'running' | 'paused' | 'error';

interface ProcessingJob {
  id: string;
  errorId: string;
  status: 'test-writing' | 'patching' | 'pr-creating' | 'completed' | 'failed';
  startedAt: number;
  testResult?: TestResult;
  patchResult?: PatchResult;
  prResult?: PRResult;
  error?: string;
}

// ============================================================================
// Maintenance Team Orchestrator
// ============================================================================

export class MaintenanceTeamOrchestrator {
  private eventBus: AgentEventBus;
  private errorListener: ErrorListenerService;
  private testWriter: TestWriterAgent;
  private patchAgent: PatchAgent;
  private prAgent: PRAgent;
  
  private state: OrchestratorState = 'idle';
  private jobs: Map<string, ProcessingJob> = new Map();
  private errorSubscriptionId?: string;
  private processingInterval?: NodeJS.Timeout;
  
  // Configuration
  private config = {
    pollIntervalMs: 5000,
    maxConcurrentJobs: 3,
    autoProcess: true,
  };

  constructor(deps?: Partial<OrchestratorDependencies> & { eventBus: AgentEventBus }) {
    if (!deps?.eventBus) {
      throw new Error('EventBus is required');
    }
    
    this.eventBus = deps.eventBus;
    this.errorListener = deps.errorListener || new ErrorListenerServiceImpl(this.eventBus);
    this.testWriter = deps.testWriter || new TestWriterAgentImpl();
    this.patchAgent = deps.patchAgent || new PatchAgentImpl();
    this.prAgent = deps.prAgent || new PRAgentImpl();
  }

  // ========================================================================
  // Lifecycle
  // ========================================================================

  async start(): Promise<void> {
    if (this.state === 'running') {
      logger.warn('autonomic-orchestrator', 'Orchestrator already running');
      return;
    }

    logger.info('autonomic-orchestrator', '🤖 Starting Godel-on-Godel Maintenance Team...');
    this.state = 'running';

    // Subscribe to error detection events
    this.setupErrorSubscription();

    // Start polling for unprocessed errors
    this.startPolling();

    // Process any existing errors
    await this.processExistingErrors();

    logger.info('autonomic-orchestrator', '✅ Maintenance team started and listening for errors');
  }

  pause(): void {
    if (this.state !== 'running') return;
    
    logger.info('autonomic-orchestrator', '⏸️ Pausing maintenance team');
    this.state = 'paused';
    
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = undefined;
    }
  }

  resume(): void {
    if (this.state !== 'paused') return;
    
    logger.info('autonomic-orchestrator', '▶️ Resuming maintenance team');
    this.state = 'running';
    this.startPolling();
  }

  stop(): void {
    logger.info('autonomic-orchestrator', '🛑 Stopping maintenance team');
    this.state = 'idle';
    
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = undefined;
    }
    
    this.errorListener.dispose?.();
  }

  // ========================================================================
  // Event Handling
  // ========================================================================

  private setupErrorSubscription(): void {
    const subscription = this.eventBus.subscribe('error', (event) => {
      // Type guard for error events
      if (event.type === 'error' && 'error' in event) {
        const errorEvent = event as { error: { code?: string; message: string } };
        // Check if this is an autonomic error-detected event
        if (errorEvent.error.code === 'AUTONOMIC_ERROR_DETECTED') {
          const errorId = errorEvent.error.message.replace('autonomic:error-detected: ', '');
          logger.debug('autonomic-orchestrator', `Received error-detected event: ${errorId}`);
          
          if (this.config.autoProcess && this.state === 'running') {
            this.processError(errorId);
          }
        }
      }
    });
    
    this.errorSubscriptionId = subscription.id;
  }

  private startPolling(): void {
    this.processingInterval = setInterval(() => {
      if (this.state === 'running') {
        this.pollForErrors();
      }
    }, this.config.pollIntervalMs);
  }

  private async pollForErrors(): Promise<void> {
    const unprocessed = this.errorListener.getUnprocessedErrors();
    const autoFixable = unprocessed.filter(e => this.errorListener.isAutoFixable(e));
    
    // Process auto-fixable errors
    for (const error of autoFixable) {
      if (this.jobs.size >= this.config.maxConcurrentJobs) {
        break;
      }
      
      if (!this.jobs.has(error.id)) {
        await this.processError(error.id);
      }
    }
  }

  private async processExistingErrors(): Promise<void> {
    const unprocessed = this.errorListener.getUnprocessedErrors();
    const autoFixable = unprocessed.filter(e => this.errorListener.isAutoFixable(e));
    
    logger.info('autonomic-orchestrator', `Found ${autoFixable.length} auto-fixable errors in backlog`);
    
    for (const error of autoFixable) {
      if (this.jobs.size >= this.config.maxConcurrentJobs) {
        logger.debug('autonomic-orchestrator', 'Max concurrent jobs reached, queuing remaining errors');
        break;
      }
      
      await this.processError(error.id);
    }
  }

  // ========================================================================
  // Error Processing Pipeline
  // ========================================================================

  async processError(errorId: string): Promise<ProcessingJob | undefined> {
    const error = this.errorListener.getUnprocessedErrors().find(e => e.id === errorId);
    if (!error) {
      logger.warn('autonomic-orchestrator', `Error ${errorId} not found or already processed`);
      return;
    }

    // Check if already processing
    if (this.jobs.has(errorId)) {
      logger.debug('autonomic-orchestrator', `Error ${errorId} already being processed`);
      return this.jobs.get(errorId);
    }

    // Check if auto-fixable
    if (!this.errorListener.isAutoFixable(error)) {
      logger.info('autonomic-orchestrator', `Error ${errorId} is not auto-fixable, skipping`);
      return;
    }

    // Create job
    const job: ProcessingJob = {
      id: uuidv4(),
      errorId,
      status: 'test-writing',
      startedAt: Date.now(),
    };
    this.jobs.set(errorId, job);

    // Mark as processing
    await this.errorListener.markAsProcessing(errorId);

    // Start pipeline
    this.runPipeline(job, error).catch(err => {
      logger.error('autonomic-orchestrator', `Pipeline failed for error ${errorId}: ${err}`);
      job.status = 'failed';
      job.error = String(err);
      this.errorListener.markAsFailed(errorId, String(err));
    });

    return job;
  }

  private async runPipeline(job: ProcessingJob, error: ErrorEvent): Promise<void> {
    logger.info('autonomic-orchestrator', `🔧 Processing error ${job.errorId} (${error.errorType})`);

    // Step 1: Generate reproduction test
    logger.info('autonomic-orchestrator', `📝 Step 1: Writing reproduction test...`);
    const targetFile = this.extractTargetFile(error);
    
    const testResult = await this.testWriter.generateReproductionTest({
      errorId: job.errorId,
      error,
      targetFile,
    });
    
    job.testResult = testResult;
    
    if (!testResult.reproducesError) {
      throw new Error('Test does not reproduce the error');
    }
    
    logger.info('autonomic-orchestrator', `✅ Test created: ${testResult.testFile}`);

    // Step 2: Generate fix
    logger.info('autonomic-orchestrator', `🔧 Step 2: Generating fix...`);
    job.status = 'patching';
    
    const fix = await this.patchAgent.generateFix({
      errorId: job.errorId,
      error,
      testCode: testResult.testCode,
      targetFile,
    });
    
    job.patchResult = fix;
    logger.info('autonomic-orchestrator', `✅ Fix generated: ${fix.id}`);

    // Step 3: Submit PR
    logger.info('autonomic-orchestrator', `📤 Step 3: Submitting PR...`);
    job.status = 'pr-creating';
    
    const pr = await this.prAgent.submitFix({
      fix,
      error,
    });
    
    job.prResult = pr;
    job.status = 'completed';
    
    logger.info('autonomic-orchestrator', `✅ PR submitted: ${pr.prUrl}`);

    // Mark as resolved
    const fixResult: FixResult = {
      id: fix.id,
      errorId: job.errorId,
      prUrl: pr.prUrl,
      status: 'success',
    };
    
    await this.errorListener.markAsResolved(job.errorId, fixResult);

    // Emit completion event
    this.eventBus.emitEvent({
      id: `evt_${uuidv4().slice(0, 8)}`,
      type: 'agent_complete',
      timestamp: Date.now(),
      agentId: 'autonomic-orchestrator',
      result: `Fixed error ${job.errorId}: ${pr.prUrl}`,
      totalCost: 0,
      totalTokens: 0,
      duration: Date.now() - job.startedAt,
    });
  }

  private extractTargetFile(error: ErrorEvent): string {
    if (error.stackTrace) {
      // Extract file path from stack trace
      const match = error.stackTrace.match(/at .* \((.+?):\d+:\d+\)/);
      if (match) {
        return match[1];
      }
      
      // Try alternative pattern
      const altMatch = error.stackTrace.match(/at (.+?):\d+:\d+/);
      if (altMatch) {
        return altMatch[1];
      }
    }
    
    // Default fallback based on source
    if (error.source.includes('.ts') || error.source.includes('.js')) {
      return error.source;
    }
    
    return 'src/index.ts';
  }

  // ========================================================================
  // Status & Monitoring
  // ========================================================================

  getStatus(): AutonomicStatus {
    const unprocessed = this.errorListener.getUnprocessedErrors();
    const processing = this.errorListener.getProcessingErrors();
    const resolved = this.errorListener.getResolvedErrors();
    
    return {
      unprocessedErrors: unprocessed.length,
      autoFixableErrors: unprocessed.filter(e => this.errorListener.isAutoFixable(e)).length,
      processingErrors: processing.length,
      resolvedErrors: resolved.length,
      isRunning: this.state === 'running',
    };
  }

  getJobs(): ProcessingJob[] {
    return Array.from(this.jobs.values());
  }

  getJob(errorId: string): ProcessingJob | undefined {
    return this.jobs.get(errorId);
  }

  // ========================================================================
  // Configuration
  // ========================================================================

  configure(options: Partial<typeof this.config>): void {
    this.config = { ...this.config, ...options };
    logger.info('autonomic-orchestrator', `Configuration updated: ${JSON.stringify(this.config)}`);
  }

  getConfig(): typeof this.config {
    return { ...this.config };
  }
}

export default MaintenanceTeamOrchestrator;
