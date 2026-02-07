/**
 * Error Listener Service
 * 
 * Monitors the event bus for errors and manages the error queue.
 * Implements deduplication and severity assessment.
 */

import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { AgentEventBus, ErrorEvent as BusErrorEvent } from '../core/event-bus';
import {
  ErrorEvent,
  ErrorContext,
  ErrorSeverity,
  FixResult,
  ErrorListenerService as IErrorListenerService,
} from './types';

// ============================================================================
// Levenshtein Distance for String Similarity
// ============================================================================

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[b.length][a.length];
}

// ============================================================================
// Stack Frame Extraction
// ============================================================================

interface StackFrame {
  file: string;
  line: number;
  column: number;
  function?: string;
}

function extractStackFrames(stackTrace: string): StackFrame[] {
  const frames: StackFrame[] = [];
  const regex = /at (?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?/g;
  let match: RegExpExecArray | null;
  
  while ((match = regex.exec(stackTrace)) !== null) {
    frames.push({
      function: match[1]?.trim(),
      file: match[2],
      line: parseInt(match[3], 10),
      column: parseInt(match[4], 10),
    });
  }
  
  return frames;
}

// ============================================================================
// Error Listener Service Implementation
// ============================================================================

export class ErrorListenerService implements IErrorListenerService {
  public eventBus: AgentEventBus;
  private unprocessedErrors: Map<string, ErrorEvent> = new Map();
  private processingErrors: Map<string, ErrorEvent> = new Map();
  private resolvedErrors: Map<string, ErrorEvent> = new Map();
  private subscriptions: string[] = [];

  constructor(eventBus: AgentEventBus) {
    this.eventBus = eventBus;
    this.setupSubscriptions();
  }

  private setupSubscriptions(): void {
    // Listen to error events from the event bus
    const errorSub = this.eventBus.subscribe('error', (event: BusErrorEvent) => {
      this.handleBusErrorEvent(event);
    });
    this.subscriptions.push(errorSub.id);

    // Listen for generic events that might contain errors
    const allSub = this.eventBus.subscribeAll((event) => {
      if (event.type === 'error' && 'error' in event) {
        // Already handled above
        return;
      }
      
      // Check if event payload contains error information
      const payload = event as unknown as { payload?: { error?: string } };
      if (payload.payload?.error) {
        this.handleGenericErrorEvent(event, payload.payload.error);
      }
    });
    this.subscriptions.push(allSub.id);
  }

  private handleBusErrorEvent(event: BusErrorEvent): void {
    const errorEvent: ErrorEvent = {
      id: uuidv4(),
      timestamp: event.timestamp || Date.now(),
      source: event.agentId || 'unknown',
      errorType: event.error.code || 'Error',
      message: event.error.message,
      stackTrace: event.error.stack,
      context: {
        agentId: event.agentId,
        sessionId: event.sessionId,
        swarmId: event.swarmId,
      },
      severity: this.assessSeverity(event.error.message, event.error.code),
      reproducible: true,
    };

    this.handleErrorEvent(errorEvent);
  }

  private handleGenericErrorEvent(event: unknown, errorMessage: string): void {
    const evt = event as { 
      agentId?: string; 
      sessionId?: string; 
      swarmId?: string;
      timestamp?: number;
    };

    const errorEvent: ErrorEvent = {
      id: uuidv4(),
      timestamp: evt.timestamp || Date.now(),
      source: evt.agentId || 'unknown',
      errorType: 'GenericError',
      message: errorMessage,
      context: {
        agentId: evt.agentId,
        sessionId: evt.sessionId,
        swarmId: evt.swarmId,
      },
      severity: this.assessSeverity(errorMessage),
      reproducible: true,
    };

    this.handleErrorEvent(errorEvent);
  }

  private handleErrorEvent(error: ErrorEvent): void {
    // Deduplicate similar errors
    const similarError = this.findSimilarError(error);
    if (similarError) {
      logger.debug('autonomic', `Similar error already being processed: ${similarError.id}`);
      return;
    }

    this.unprocessedErrors.set(error.id, error);
    
    logger.info('autonomic', `🤖 Error detected: ${error.errorType} in ${error.source}`);
    
    // Publish autonomic event for the orchestrator
    this.eventBus.emitEvent({
      id: `evt_${uuidv4().slice(0, 8)}`,
      type: 'error',
      timestamp: Date.now(),
      agentId: 'autonomic-listener',
      error: {
        message: `autonomic:error-detected: ${error.id}`,
        code: 'AUTONOMIC_ERROR_DETECTED',
      },
    });
  }

  private findSimilarError(error: ErrorEvent): ErrorEvent | undefined {
    for (const [, existing] of this.unprocessedErrors) {
      if (this.errorsAreSimilar(error, existing)) {
        return existing;
      }
    }
    for (const [, existing] of this.processingErrors) {
      if (this.errorsAreSimilar(error, existing)) {
        return existing;
      }
    }
    return undefined;
  }

  private errorsAreSimilar(a: ErrorEvent, b: ErrorEvent): boolean {
    // Compare error messages (fuzzy match)
    const msgSimilarity = this.stringSimilarity(a.message, b.message);
    if (msgSimilarity > 0.8) return true;

    // Compare stack traces
    if (a.stackTrace && b.stackTrace) {
      const traceSimilarity = this.stackTraceSimilarity(a.stackTrace, b.stackTrace);
      if (traceSimilarity > 0.7) return true;
    }

    return false;
  }

  private stringSimilarity(a: string, b: string): number {
    if (!a || !b) return 0;
    const distance = levenshteinDistance(a, b);
    const maxLen = Math.max(a.length, b.length);
    return maxLen === 0 ? 1 : 1 - distance / maxLen;
  }

  private stackTraceSimilarity(a: string, b: string): number {
    const framesA = extractStackFrames(a);
    const framesB = extractStackFrames(b);
    
    if (framesA.length === 0 || framesB.length === 0) return 0;
    
    // Compare frames
    let matches = 0;
    for (const frameA of framesA) {
      if (framesB.some(fb => fb.file === frameA.file)) {
        matches++;
      }
    }
    
    return matches / Math.max(framesA.length, framesB.length);
  }

  private assessSeverity(message: string, code?: string): ErrorSeverity {
    const msg = message.toLowerCase();
    
    if (code === 'CRITICAL' || msg.includes('crash') || msg.includes('fatal') || msg.includes('panic')) {
      return 'critical';
    }
    if (msg.includes('timeout') || msg.includes('network') || msg.includes('connection')) {
      return 'high';
    }
    if (msg.includes('typeerror') || msg.includes('referenceerror') || msg.includes('syntaxerror')) {
      return 'medium';
    }
    return 'low';
  }

  isAutoFixable(error: ErrorEvent): boolean {
    // Check if error type is in our fixable list
    const autoFixableTypes = [
      'TypeError',
      'ReferenceError',
      'SyntaxError',
      'AssertionError',
      'TimeoutError',
      'RangeError',
    ];
    
    const autoFixableCodes = [
      'MODULE_NOT_FOUND',
      'ENOTFOUND',
      'ECONNREFUSED',
      'ETIMEDOUT',
    ];
    
    return autoFixableTypes.some(type => 
      error.errorType.includes(type) || error.message.includes(type)
    ) || autoFixableCodes.some(code =>
      error.message.includes(code)
    );
  }

  getUnprocessedErrors(): ErrorEvent[] {
    return Array.from(this.unprocessedErrors.values());
  }

  getProcessingErrors(): ErrorEvent[] {
    return Array.from(this.processingErrors.values());
  }

  getResolvedErrors(): ErrorEvent[] {
    return Array.from(this.resolvedErrors.values());
  }

  async markAsProcessing(errorId: string): Promise<void> {
    const error = this.unprocessedErrors.get(errorId);
    if (error) {
      this.unprocessedErrors.delete(errorId);
      this.processingErrors.set(errorId, error);
      logger.debug('autonomic', `Error ${errorId} marked as processing`);
    }
  }

  async markAsResolved(errorId: string, fix: FixResult): Promise<void> {
    const error = this.processingErrors.get(errorId);
    if (error) {
      this.processingErrors.delete(errorId);
      this.resolvedErrors.set(errorId, error);
      logger.info('autonomic', `✅ Error ${errorId} resolved with fix ${fix.id}`);
    }
  }

  async markAsFailed(errorId: string, reason: string): Promise<void> {
    const error = this.processingErrors.get(errorId);
    if (error) {
      this.processingErrors.delete(errorId);
      this.unprocessedErrors.set(errorId, error);
      logger.warn('autonomic', `❌ Error ${errorId} processing failed: ${reason}`);
    }
  }

  dispose(): void {
    // Unsubscribe from all event bus subscriptions
    for (const subId of this.subscriptions) {
      // Note: The event bus doesn't expose unsubscribe by ID directly
      // This would need to be implemented based on the actual event bus API
    }
    this.subscriptions = [];
  }
}

export default ErrorListenerService;
