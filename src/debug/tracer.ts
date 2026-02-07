/**
 * Distributed Tracing and Logging
 * 
 * Provides tracing capabilities for debugging complex workflows.
 */

import { EventEmitter } from 'events';

export interface TraceSpan {
  id: string;
  parentId?: string;
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: 'running' | 'completed' | 'failed';
  attributes: Record<string, any>;
  events: TraceEvent[];
}

export interface TraceEvent {
  timestamp: number;
  name: string;
  attributes?: Record<string, any>;
}

export class Tracer extends EventEmitter {
  private spans: Map<string, TraceSpan> = new Map();
  private activeSpans: Map<string, string> = new Map(); // context -> spanId

  startSpan(name: string, options?: {
    parentId?: string;
    context?: string;
    attributes?: Record<string, any>;
  }): TraceSpan {
    const span: TraceSpan = {
      id: generateTraceId(),
      parentId: options?.parentId,
      name,
      startTime: Date.now(),
      status: 'running',
      attributes: options?.attributes || {},
      events: []
    };

    this.spans.set(span.id, span);

    if (options?.context) {
      this.activeSpans.set(options.context, span.id);
    }

    this.emit('spanStarted', span);
    return span;
  }

  endSpan(spanId: string, status: 'completed' | 'failed' = 'completed'): void {
    const span = this.spans.get(spanId);
    if (!span) return;

    span.endTime = Date.now();
    span.duration = span.endTime - span.startTime;
    span.status = status;

    this.emit('spanEnded', span);
  }

  addEvent(spanId: string, name: string, attributes?: Record<string, any>): void {
    const span = this.spans.get(spanId);
    if (!span) return;

    span.events.push({
      timestamp: Date.now(),
      name,
      attributes
    });

    this.emit('event', { spanId, name, attributes });
  }

  getSpan(spanId: string): TraceSpan | undefined {
    return this.spans.get(spanId);
  }

  getActiveSpan(context: string): TraceSpan | undefined {
    const spanId = this.activeSpans.get(context);
    if (spanId) {
      return this.spans.get(spanId);
    }
    return undefined;
  }

  getTraceTree(rootSpanId?: string): TraceSpan[] {
    if (rootSpanId) {
      return this.buildTree(rootSpanId);
    }

    // Find root spans (no parent)
    const roots: TraceSpan[] = [];
    for (const span of this.spans.values()) {
      if (!span.parentId) {
        roots.push(...this.buildTree(span.id));
      }
    }
    return roots;
  }

  private buildTree(parentId: string): TraceSpan[] {
    const span = this.spans.get(parentId);
    if (!span) return [];

    const children: TraceSpan[] = [];
    for (const s of this.spans.values()) {
      if (s.parentId === parentId) {
        children.push(...this.buildTree(s.id));
      }
    }

    return [{ ...span, children } as any];
  }

  export(format: 'json' | 'text' = 'json'): string {
    if (format === 'json') {
      return JSON.stringify({
        spans: Array.from(this.spans.values()),
        exportedAt: new Date().toISOString()
      }, null, 2);
    }

    // Text format
    const lines: string[] = [];
    const tree = this.getTraceTree();
    
    for (const root of tree) {
      this.formatSpanTree(root, 0, lines);
    }

    return lines.join('\n');
  }

  private formatSpanTree(span: TraceSpan, depth: number, lines: string[]): void {
    const indent = '  '.repeat(depth);
    const duration = span.duration ? `${span.duration}ms` : 'running';
    const status = span.status === 'completed' ? '✓' :
                   span.status === 'failed' ? '✗' : '○';
    
    lines.push(`${indent}${status} ${span.name} (${duration})`);
    
    if (span.events.length > 0) {
      for (const event of span.events) {
        lines.push(`${indent}  → ${event.name}`);
      }
    }

    if ((span as any).children) {
      for (const child of (span as any).children) {
        this.formatSpanTree(child, depth + 1, lines);
      }
    }
  }

  clear(): void {
    this.spans.clear();
    this.activeSpans.clear();
  }
}

function generateTraceId(): string {
  return `trace-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Global tracer instance
export const tracer = new Tracer();

// Decorator for automatic tracing
export function Trace(options?: { name?: string }) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    const spanName = options?.name || propertyKey;

    descriptor.value = async function (...args: any[]) {
      const span = tracer.startSpan(spanName, {
        attributes: { args: JSON.stringify(args) }
      });

      try {
        const result = await originalMethod.apply(this, args);
        tracer.endSpan(span.id, 'completed');
        return result;
      } catch (error) {
        tracer.addEvent(span.id, 'error', { error: String(error) });
        tracer.endSpan(span.id, 'failed');
        throw error;
      }
    };

    return descriptor;
  };
}
