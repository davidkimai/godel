import { logger } from '../utils/logger';
import { promises as fs } from 'fs';
import { join } from 'path';

// ============================================================================
// CONFIGURATION
// ============================================================================
const SUMMARIES_DIR = '~/.config/godel/summaries';
const MAX_CONTEXT_AGE_DAYS = 7; // Keep summaries for 7 days
const MAX_DECISIONS = 50; // Max decisions to keep
const MAX_PATTERNS = 100; // Max patterns to keep
const MAX_OPEN_QUESTIONS = 20; // Max open questions

// ============================================================================
// INTERFACES
// ============================================================================

export interface ContextSummary {
  id: string;
  timestamp: Date;
  cycle: number;

  // Core summaries
  decisions: Decision[];
  patterns: Pattern[];
  metricsTrends: MetricsTrend[];
  openQuestions: OpenQuestion[];
  nextSteps: NextStep[];

  // Context metadata
  compressedFrom: string; // Previous summary ID or 'initial'
  sizeBytes: number;
}

export interface Decision {
  id: string;
  timestamp: Date;
  topic: string;
  decision: string;
  rationale: string;
  impact: 'high' | 'medium' | 'low';
  status: 'active' | 'superseded' | 'reverted';
}

export interface Pattern {
  id: string;
  name: string;
  description: string;
  firstSeen: Date;
  lastSeen: Date;
  frequency: number;
  severity: 'high' | 'medium' | 'low';
}

export interface MetricsTrend {
  metric: string;
  direction: 'improving' | 'stable' | 'declining';
  fromValue: number;
  toValue: number;
  changePercent: number;
  period: string;
}

export interface OpenQuestion {
  id: string;
  question: string;
  priority: 'high' | 'medium' | 'low';
  createdAt: Date;
  context: string;
  attempts: number;
}

export interface NextStep {
  id: string;
  action: string;
  reason: string;
  priority: 'high' | 'medium' | 'low';
  createdAt: Date;
  assignedTo?: string;
  status: 'pending' | 'in_progress' | 'completed';
}

// ============================================================================
// CONTEXT SUMMARIZER
// ============================================================================
export class ContextSummarizer {
  private summariesDir: string;
  private currentCycle: number;

constructor() {
    this.summariesDir = SUMMARIES_DIR.replace('~', process.env['HOME'] || '');
    this.currentCycle = 0;
  }

  // --------------------------------------------------------------------------
  // SUMMARIZATION
  // --------------------------------------------------------------------------

  /**
   * Create a new summary by compressing previous context
   */
  async summarize(options: {
    decisions?: Decision[];
    patterns?: Pattern[];
    metricsTrends?: MetricsTrend[];
    openQuestions?: OpenQuestion[];
    nextSteps?: NextStep[];
  } = {}): Promise<ContextSummary> {
    // Load previous summary
    const previous = await this.loadLatestSummary();

    // Determine cycle
    const cycle = previous ? previous.cycle + 1 : 1;
    this.currentCycle = cycle;

    // Merge and compress
    const mergedDecisions = this.mergeDecisions(previous?.decisions || [], options.decisions || []);
    const mergedPatterns = this.mergePatterns(previous?.patterns || [], options.patterns || []);
    const mergedQuestions = this.mergeOpenQuestions(previous?.openQuestions || [], options.openQuestions || []);
    const mergedNextSteps = this.mergeNextSteps(previous?.nextSteps || [], options.nextSteps || []);

    const summary: ContextSummary = {
      id: `summary_${Date.now()}`,
      timestamp: new Date(),
      cycle,
      decisions: mergedDecisions,
      patterns: mergedPatterns,
      metricsTrends: options.metricsTrends || previous?.metricsTrends || [],
      openQuestions: mergedQuestions,
      nextSteps: mergedNextSteps,
      compressedFrom: previous?.id || 'initial',
      sizeBytes: 0,
    };

    // Calculate size
    summary.sizeBytes = Buffer.byteLength(JSON.stringify(summary), 'utf8');

    // Save
    await this.saveSummary(summary);
    await this.pruneOldSummaries();

    logger.info('context-summarizer', 'Summary created', {
      cycle,
      decisions: summary.decisions.length,
      patterns: summary.patterns.length,
      openQuestions: summary.openQuestions.length,
      sizeBytes: summary.sizeBytes,
    });

    return summary;
  }

  /**
   * Quick summary for self-interview input
   */
  async getQuickSummary(): Promise<string> {
    const summary = await this.loadLatestSummary();

    if (!summary) {
      return 'No previous context - starting fresh.';
    }

    const lines = [
      `=== Cycle ${summary.cycle} Summary ===`,
      `Timestamp: ${summary.timestamp.toISOString()}`,
      '',
      `📊 Decisions (${summary.decisions.length}):`,
      ...summary.decisions.slice(-5).map(d => `  - ${d.topic}: ${d.decision}`),
      '',
      `🔄 Patterns (${summary.patterns.length}):`,
      ...summary.patterns.slice(-5).map(p => `  - ${p.name} (seen ${p.frequency}x)`),
      '',
      `❓ Open Questions (${summary.openQuestions.length}):`,
      ...summary.openQuestions.slice(-5).map(q => `  - [${q.priority}] ${q.question}`),
      '',
      `🎯 Next Steps (${summary.nextSteps.length}):`,
      ...summary.nextSteps.filter(s => s.status === 'pending').slice(-5).map(s => `  - [${s.priority}] ${s.action}`),
    ];

    return lines.join('\n');
  }

  // --------------------------------------------------------------------------
  // MERGE FUNCTIONS
  // --------------------------------------------------------------------------

  private mergeDecisions(previous: Decision[], newDecisions: Decision[]): Decision[] {
    const all = [...previous, ...newDecisions];

    // Mark superseded decisions
    const topicMap = new Map<string, Decision>();
    for (const d of all) {
      const existing = topicMap.get(d.topic);
      if (!existing || d.timestamp > existing.timestamp) {
        topicMap.set(d.topic, d);
      }
    }

    // Keep unique by topic, mark others as superseded
    const result: Decision[] = [];
    for (const d of all) {
      const latest = topicMap.get(d.topic);
      if (d.id === latest?.id) {
        d.status = 'active';
        result.push(d);
      } else if (d.status !== 'superseded') {
        d.status = 'superseded';
        result.push(d);
      }
    }

    // Sort by timestamp, keep only last MAX_DECISIONS
    return result
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, MAX_DECISIONS);
  }

  private mergePatterns(previous: Pattern[], newPatterns: Pattern[]): Pattern[] {
    const all = [...previous, ...newPatterns];

    // Merge by name
    const patternMap = new Map<string, Pattern>();
    for (const p of all) {
      const existing = patternMap.get(p.name);
      if (!existing) {
        patternMap.set(p.name, p);
      } else {
        // Update frequency and lastSeen
        existing.frequency += p.frequency;
        existing.lastSeen = new Date();
      }
    }

    return Array.from(patternMap.values())
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, MAX_PATTERNS);
  }

  private mergeOpenQuestions(previous: OpenQuestion[], newQuestions: OpenQuestion[]): OpenQuestion[] {
    const all = [...previous, ...newQuestions];

    // Remove answered questions (prioritize new ones)
    const unique = new Map<string, OpenQuestion>();
    for (const q of all.reverse()) {
      if (!unique.has(q.id)) {
        unique.set(q.id, q);
      }
    }

    return Array.from(unique.values())
      .sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      })
      .slice(0, MAX_OPEN_QUESTIONS);
  }

  private mergeNextSteps(previous: NextStep[], newNextSteps: NextStep[]): NextStep[] {
    const all = [...previous, ...newNextSteps];

    // Keep only pending or in_progress, add new ones
    const active = all.filter(s => s.status === 'pending' || s.status === 'in_progress');
    const newIds = new Set(newNextSteps.map(n => n.id));

    // Mark old completed ones
    for (const s of previous) {
      if (s.status === 'completed' && !newIds.has(s.id)) {
        active.push(s);
      }
    }

    return active;
  }

  // --------------------------------------------------------------------------
  // PERSISTENCE
  // --------------------------------------------------------------------------

  private async saveSummary(summary: ContextSummary): Promise<void> {
    await this.ensureDirectory(this.summariesDir);

    const filename = `${summary.id}.json`;
    const filepath = join(this.summariesDir, filename);

    await fs.writeFile(filepath, JSON.stringify(summary, null, 2));

    // Update current cycle tracker
    const trackerPath = join(this.summariesDir, 'current_cycle.json');
    await fs.writeFile(trackerPath, JSON.stringify({ cycle: summary.cycle, id: summary.id }));
  }

  async loadLatestSummary(): Promise<ContextSummary | null> {
    try {
      const trackerPath = join(this.summariesDir, 'current_cycle.json');
      const trackerContent = await fs.readFile(trackerPath, 'utf8');
      const tracker = JSON.parse(trackerContent);

      const filepath = join(this.summariesDir, `${tracker.id}.json`);
      const content = await fs.readFile(filepath, 'utf8');
      const summary = JSON.parse(content, this.dateReviver);

      return summary;
    } catch (error) {
      return null;
    }
  }

  async loadSummaryByCycle(cycle: number): Promise<ContextSummary | null> {
    try {
      const files = await fs.readdir(this.summariesDir);
      const summaryFiles = files.filter(f => f.startsWith('summary_') && f.endsWith('.json'));

      for (const file of summaryFiles) {
        const filepath = join(this.summariesDir, file);
        const content = await fs.readFile(filepath, 'utf8');
        const summary = JSON.parse(content, this.dateReviver);
        if (summary.cycle === cycle) {
          return summary;
        }
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  private async pruneOldSummaries(): Promise<void> {
    try {
      const cutoff = Date.now() - MAX_CONTEXT_AGE_DAYS * 24 * 60 * 60 * 1000;
      const files = await fs.readdir(this.summariesDir);

      let deleted = 0;
      for (const file of files) {
        if (file.startsWith('summary_') && file.endsWith('.json')) {
          const filepath = join(this.summariesDir, file);
          const stats = await fs.stat(filepath);
          if (stats.mtimeMs < cutoff) {
            await fs.unlink(filepath);
            deleted++;
          }
        }
      }

      if (deleted > 0) {
        logger.info('context-summarizer', 'Pruned old summaries', { deleted });
      }
    } catch (error) {
      logger.error('context-summarizer', 'Failed to prune summaries', { error });
    }
  }

  private async ensureDirectory(dir: string): Promise<void> {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }
    }
  }

  private dateReviver(key: string, value: unknown): unknown {
    if (typeof value === 'string') {
      const date = new Date(value);
      if (!isNaN(date.getTime()) && (key.toLowerCase().includes('at') || key.toLowerCase().includes('date'))) {
        return date;
      }
    }
    return value;
  }

  // --------------------------------------------------------------------------
  // UTILITIES
  // --------------------------------------------------------------------------

  getCurrentCycle(): number {
    return this.currentCycle;
  }

  async getStats(): Promise<{
    currentCycle: number;
    summaryCount: number;
    totalSizeBytes: number;
    latestSummary?: ContextSummary;
  }> {
    const latest = await this.loadLatestSummary();
    const files = await fs.readdir(this.summariesDir);
    const summaryFiles = files.filter(f => f.startsWith('summary_') && f.endsWith('.json'));

    let totalSize = 0;
    for (const file of summaryFiles) {
      const filepath = join(this.summariesDir, file);
      const stats = await fs.stat(filepath);
      totalSize += stats.size;
    }

    return {
      currentCycle: latest?.cycle || 0,
      summaryCount: summaryFiles.length,
      totalSizeBytes: totalSize,
      latestSummary: latest || undefined,
    };
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================
export const contextSummarizer = new ContextSummarizer();

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Quick summary for cron jobs
 */
export async function getContextQuickSummary(): Promise<string> {
  return contextSummarizer.getQuickSummary();
}

/**
 * Run a summarization cycle
 */
export async function runSummarization(options?: {
  decisions?: Decision[];
  patterns?: Pattern[];
  metricsTrends?: MetricsTrend[];
  openQuestions?: OpenQuestion[];
  nextSteps?: NextStep[];
}): Promise<ContextSummary> {
  return contextSummarizer.summarize(options);
}

/**
 * Get context stats
 */
export async function getContextStats(): Promise<{
  cycle: number;
  count: number;
  size: string;
}> {
  const stats = await contextSummarizer.getStats();
  return {
    cycle: stats.currentCycle,
    count: stats.summaryCount,
    size: `${(stats.totalSizeBytes / 1024).toFixed(1)} KB`,
  };
}
