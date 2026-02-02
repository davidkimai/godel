/**
 * Reasoning CLI Commands
 * 
 * CLI commands for reasoning traces, decisions, and confidence tracking.
 * Phase 3: Reasoning Features
 */


import {
  recordTrace,
  getTracesByAgent,
  getTraceStats,
  logDecision,
  getDecisionsByAgent,
  getConfidenceByAgent,
  warnLowConfidence,
  getConfidenceStats,
  getReasoningReport
} from '../../reasoning';
import { ReasoningType } from '../../reasoning/types';
import { logger } from '../../utils/logger';

import type { Command } from 'commander';

// Simple table formatter
function displayTable(headers: string[], rows: string[][]): void {
  const colWidths = headers.map((h, i) => Math.max(h.length, ...rows.map(r => (r[i] || '').length)));
  
  // Header row
  console.log('  ' + headers.map((h, i) => h.padEnd(colWidths[i])).join('  '));
  console.log('  ' + colWidths.map(w => '-'.repeat(w)).join('  '));
  
  // Data rows
  for (const row of rows) {
    console.log('  ' + row.map((c, i) => (c || '').padEnd(colWidths[i])).join('  '));
  }
}

// Helper to parse options safely
function getOptionAsString(options: Record<string, unknown>, key: string, defaultVal: string): string {
  const val = options[key];
  return val !== undefined ? String(val) : defaultVal;
}

function getOptionAsNumber(options: Record<string, unknown>, key: string, defaultVal: number): number {
  const val = options[key];
  return val !== undefined ? Number(val) : defaultVal;
}

function getOptionAsArray(options: Record<string, unknown>, key: string): string[] {
  const val = options[key];
  return val !== undefined ? String(val).split(',').map((s: string) => s.trim()) : [];
}

/**
 * Build reasoning CLI commands
 */
export function buildReasoningCommands(program: Command): Command {
  const reasoning = program
    .command('reasoning')
    .description('Manage reasoning traces, decisions, and confidence tracking')
    .alias('reason');

  // -------------------------------------------------------------------------
  // dash reasoning trace <agent-id> [options]
  // -------------------------------------------------------------------------
  reasoning
    .command('trace <agent-id>')
    .description('Record a reasoning trace for an agent')
    .option('--type <type>', 'Reasoning type', 'analysis')
    .option('--content <text>', 'Reasoning content')
    .option('--evidence <files>', 'Evidence files (comma-separated)')
    .option('--confidence <number>', 'Confidence level', '0.5')
    .option('--task-id <id>', 'Associated task ID')
    .action(async (agentId: string, options: Record<string, unknown>) => {
      const type = getOptionAsString(options, 'type', 'analysis');
      const content = getOptionAsString(options, 'content', '');
      const evidence = getOptionAsArray(options, 'evidence');
      const confidence = getOptionAsNumber(options, 'confidence', 0.5);
      const taskId = options['taskId'] !== undefined ? String(options['taskId']) : undefined;
      
      if (!content) {
        logger.error('Error: --content is required');
        process.exit(1);
      }
      
      try {
        const trace = recordTrace(
          agentId,
          type as ReasoningType,
          content,
          evidence,
          confidence,
          taskId
        );
        
        logger.info(`Reasoning trace recorded: ${trace.id}`);
        logger.info(`Agent: ${agentId}`);
        logger.info(`Type: ${type}`);
        logger.info(`Confidence: ${(confidence * 100).toFixed(0)}%`);
      } catch (error) {
        logger.error(`Failed to record trace: ${error}`);
        process.exit(1);
      }
    });

  // -------------------------------------------------------------------------
  // dash reasoning traces <agent-id> [options]
  // -------------------------------------------------------------------------
  reasoning
    .command('traces <agent-id>')
    .description('Get reasoning traces for an agent')
    .option('--limit <number>', 'Maximum traces to show', '20')
    .option('--format <json|table>', 'Output format', 'table')
    .action(async (agentId: string, options: Record<string, unknown>) => {
      const limit = getOptionAsNumber(options, 'limit', 20);
      const format = getOptionAsString(options, 'format', 'table');
      
      try {
        const traces = getTracesByAgent(agentId, limit);
        
        if (format === 'json') {
          console.log(JSON.stringify(traces, null, 2));
        } else {
          const headers = ['ID', 'Type', 'Content', 'Confidence', 'Timestamp'];
          const rows = traces.map((t: { id: string; type: string; content: string; confidence: number; timestamp: Date }) => [
            t.id.substring(0, 12) + '...',
            t.type,
            t.content.substring(0, 40) + (t.content.length > 40 ? '...' : ''),
            `${(t.confidence * 100).toFixed(0)}%`,
            t.timestamp.toISOString()
          ]);
          
          displayTable(headers, rows);
        }
        
        logger.info(`Total traces: ${traces.length}`);
      } catch (error) {
        logger.error(`Failed to get traces: ${error}`);
        process.exit(1);
      }
    });

  // -------------------------------------------------------------------------
  // dash reasoning decisions <agent-id> [options]
  // -------------------------------------------------------------------------
  reasoning
    .command('decisions <agent-id>')
    .description('Get decision logs for an agent')
    .option('--limit <number>', 'Maximum decisions to show', '20')
    .option('--format <json|table>', 'Output format', 'table')
    .action(async (agentId: string, options: Record<string, unknown>) => {
      const limit = getOptionAsNumber(options, 'limit', 20);
      const format = getOptionAsString(options, 'format', 'table');
      
      try {
        const decisions = getDecisionsByAgent(agentId, limit);
        
        if (format === 'json') {
          console.log(JSON.stringify(decisions, null, 2));
        } else {
          const headers = ['ID', 'Decision', 'Confidence', 'Timestamp'];
          const rows = decisions.map((d: { id: string; decision: string; confidence: number; timestamp: Date }) => [
            d.id.substring(0, 12) + '...',
            d.decision.substring(0, 30) + (d.decision.length > 30 ? '...' : ''),
            `${(d.confidence * 100).toFixed(0)}%`,
            d.timestamp.toISOString()
          ]);
          
          displayTable(headers, rows);
          
          console.log(`\nAlternatives considered: ${decisions.reduce((sum: number, d: { alternatives: unknown[] }) => sum + d.alternatives.length, 0)}`);
        }
        
        logger.info(`Total decisions: ${decisions.length}`);
      } catch (error) {
        logger.error(`Failed to get decisions: ${error}`);
        process.exit(1);
      }
    });

  // -------------------------------------------------------------------------
  // dash reasoning log-decision <agent-id> [options]
  // -------------------------------------------------------------------------
  reasoning
    .command('log-decision <agent-id>')
    .description('Log a decision made by an agent')
    .option('--decision <text>', 'The decision made')
    .option('--alternatives <items>', 'Alternatives considered (comma-separated)')
    .option('--rationale <text>', 'Reason for the decision')
    .option('--selected <text>', 'What was selected')
    .option('--confidence <number>', 'Confidence level', '0.5')
    .option('--task-id <id>', 'Associated task ID')
    .action(async (agentId: string, options: Record<string, unknown>) => {
      const decision = getOptionAsString(options, 'decision', '');
      const alternatives = getOptionAsArray(options, 'alternatives');
      const rationale = getOptionAsString(options, 'rationale', '');
      const selected = getOptionAsString(options, 'selected', '');
      const confidence = getOptionAsNumber(options, 'confidence', 0.5);
      const taskId = options['taskId'] !== undefined ? String(options['taskId']) : undefined;
      
      if (!decision || !rationale || !selected) {
        logger.error('Error: --decision, --rationale, and --selected are required');
        process.exit(1);
      }
      
      try {
        const decisionLog = logDecision(
          agentId,
          decision,
          alternatives,
          rationale,
          selected,
          confidence,
          taskId
        );
        
        logger.info(`Decision logged: ${decisionLog.id}`);
        logger.info(`Agent: ${agentId}`);
        logger.info(`Selected: ${selected}`);
        logger.info(`Confidence: ${(confidence * 100).toFixed(0)}%`);
      } catch (error) {
        logger.error(`Failed to log decision: ${error}`);
        process.exit(1);
      }
    });

  // -------------------------------------------------------------------------
  // dash reasoning confidence <agent-id> [options]
  // -------------------------------------------------------------------------
  reasoning
    .command('confidence <agent-id>')
    .description('Show confidence tracking for an agent')
    .option('--threshold <number>', 'Warning threshold', '0.5')
    .option('--format <json|table>', 'Output format', 'table')
    .action(async (agentId: string, options: Record<string, unknown>) => {
      const threshold = getOptionAsNumber(options, 'threshold', 0.5);
      const format = getOptionAsString(options, 'format', 'table');
      
      try {
        const stats = getConfidenceStats(agentId);
        const warnings = warnLowConfidence(agentId, threshold);
        
        if (format === 'json') {
          console.log(JSON.stringify({
            current: stats.current,
            average: stats.average,
            min: stats.min,
            max: stats.max,
            trend: stats.trend,
            warnings
          }, null, 2));
        } else {
          console.log(`\n📊 Confidence Report for Agent: ${agentId}`);
          console.log('─'.repeat(40));
          console.log(`Current:    ${(stats.current * 100).toFixed(1)}%`);
          console.log(`Average:    ${(stats.average * 100).toFixed(1)}%`);
          console.log(`Min:        ${(stats.min * 100).toFixed(1)}%`);
          console.log(`Max:        ${(stats.max * 100).toFixed(1)}%`);
          console.log(`Trend:      ${stats.trend === 'up' ? '📈' : stats.trend === 'down' ? '📉' : '➡️'} ${stats.trend}`);
          console.log(`Warnings:   ${stats.warningCount}`);
          
          if (warnings.length > 0) {
            console.log(`\n⚠️  Warnings (threshold: ${(threshold * 100).toFixed(0)}%):`);
            warnings.forEach((w: string) => console.log(`  - ${w}`));
          }
        }
      } catch (error) {
        logger.error(`Failed to get confidence: ${error}`);
        process.exit(1);
      }
    });

  // -------------------------------------------------------------------------
  // dash reasoning stats <agent-id> [options]
  // -------------------------------------------------------------------------
  reasoning
    .command('stats <agent-id>')
    .description('Show reasoning statistics for an agent')
    .option('--format <json|table>', 'Output format', 'table')
    .action(async (agentId: string, options: Record<string, unknown>) => {
      const format = getOptionAsString(options, 'format', 'table');
      
      try {
        const traceStats = getTraceStats(agentId);
        const confidenceStats = getConfidenceStats(agentId);
        const decisions = getDecisionsByAgent(agentId);
        
        if (format === 'json') {
          console.log(JSON.stringify({
            traces: traceStats,
            confidence: confidenceStats,
            decisions: decisions.length
          }, null, 2));
        } else {
          console.log(`\n📈 Reasoning Stats for Agent: ${agentId}`);
          console.log('─'.repeat(40));
          console.log(`Total Traces:    ${traceStats.totalTraces}`);
          console.log(`  - Hypothesis:  ${traceStats.byType[ReasoningType.HYPOTHESIS]}`);
          console.log(`  - Analysis:    ${traceStats.byType[ReasoningType.ANALYSIS]}`);
          console.log(`  - Decision:    ${traceStats.byType[ReasoningType.DECISION]}`);
          console.log(`  - Correction:  ${traceStats.byType[ReasoningType.CORRECTION]}`);
          console.log(`Avg Confidence:  ${(traceStats.averageConfidence * 100).toFixed(1)}%`);
          console.log(`Total Decisions: ${decisions.length}`);
        }
      } catch (error) {
        logger.error(`Failed to get stats: ${error}`);
        process.exit(1);
      }
    });

  // -------------------------------------------------------------------------
  // dash reasoning report <agent-id> [options]
  // -------------------------------------------------------------------------
  reasoning
    .command('report <agent-id>')
    .description('Generate comprehensive reasoning report for an agent')
    .option('--task-id <id>', 'Filter by task ID')
    .option('--format <json|table>', 'Output format', 'table')
    .action(async (agentId: string, options: Record<string, unknown>) => {
      const taskId = options['taskId'] !== undefined ? String(options['taskId']) : undefined;
      const format = getOptionAsString(options, 'format', 'table');
      
      try {
        const report = getReasoningReport(agentId, taskId);
        
        if (format === 'json') {
          console.log(JSON.stringify(report, null, 2));
        } else {
          console.log(`\n📋 Reasoning Report for Agent: ${agentId}`);
          console.log('─'.repeat(40));
          
          // Trace stats
          console.log('\nTraces:');
          console.log(`  Total: ${report.traceStats.totalTraces}`);
          console.log(`  Avg Confidence: ${(report.traceStats.averageConfidence * 100).toFixed(1)}%`);
          
          // Confidence stats
          console.log('\nConfidence:');
          console.log(`  Current: ${(report.confidenceStats.current * 100).toFixed(1)}%`);
          console.log(`  Trend: ${report.confidenceStats.trend}`);
          
          // Decisions
          console.log('\nDecisions:');
          console.log(`  Total: ${report.decisions.length}`);
          
          // Warnings
          console.log('\nWarnings:');
          if (report.lowConfidenceWarnings.length === 0) {
            console.log('  None');
          } else {
            report.lowConfidenceWarnings.forEach((w: string) => console.log(`  ⚠️  ${w}`));
          }
        }
      } catch (error) {
        logger.error(`Failed to generate report: ${error}`);
        process.exit(1);
      }
    });

  // -------------------------------------------------------------------------
  // dash reasoning analyze <agent-id>
  // -------------------------------------------------------------------------
  reasoning
    .command('analyze <agent-id>')
    .description('Analyze reasoning quality and provide recommendations')
    .action(async (agentId: string) => {
      try {
        const stats = getTraceStats(agentId);
        const confidenceStats = getConfidenceStats(agentId);
        const warnings = warnLowConfidence(agentId);
        
        console.log(`\n🔍 Reasoning Analysis for Agent: ${agentId}`);
        console.log('─'.repeat(40));
        
        // Quality assessment
        let quality = 'good';
        if (stats.totalTraces === 0) {
          quality = 'insufficient';
          console.log('\n⚠️  No reasoning traces recorded');
          console.log('   → Start using "dash reasoning trace" to log reasoning');
        } else if (confidenceStats.warningCount > 0) {
          quality = 'needs-attention';
          console.log('\n⚠️  Low confidence detected');
          warnings.forEach((w: string) => console.log(`   - ${w}`));
        } else if (stats.averageConfidence < 0.7) {
          quality = 'fair';
          console.log('\n🟡 Average confidence below 70%');
          console.log('   → Consider gathering more evidence');
        } else {
          console.log('\n✅ Reasoning quality is good');
        }
        
        // Recommendations
        console.log('\n💡 Recommendations:');
        if (stats.totalTraces < 5) {
          console.log('  → Record more reasoning traces');
        }
        if (stats.byType[ReasoningType.HYPOTHESIS] === 0) {
          console.log('  → Add hypothesis traces before making decisions');
        }
        if (stats.byType[ReasoningType.CORRECTION] === 0) {
          console.log('  → Log corrections to track learning');
        }
        if (confidenceStats.trend === 'down') {
          console.log('  → Confidence trending down - review recent decisions');
        }
        
        console.log(`\nQuality Rating: ${quality.toUpperCase()}`);
      } catch (error) {
        logger.error(`Failed to analyze: ${error}`);
        process.exit(1);
      }
    });

  return reasoning;
}
