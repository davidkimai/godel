/**
 * Context Management Commands
 * 
 * Commands: get, add, remove, share, analyze, optimize, snapshot, tree
 */

import * as fs from 'fs';

import { Command } from 'commander';

import {
  FileTreeBuilder,
  formatTreeAsString,
  DependencyGraphBuilder,
} from '../../context';
import {
  analyzeContext,
  formatAnalysisAsJson,
  formatAnalysisAsString,
} from '../../context/analyze';
import {
  findConsolidationOpportunities,
  applyConsolidation,
  formatConsolidationAsString,
  formatConsolidationAsJson
} from '../../context/compact';
import {
  planOptimization,
  applyOptimization,
  formatOptimizationAsJson,
  formatOptimizationAsString
} from '../../context/optimize';
import { memoryStore } from '../../storage';
import { logger } from '../../utils/logger';
import { formatContext } from '../formatters';
import { validateFormat, handleError } from '../main';

import type {
  ConsolidationResult
} from '../../context/compact';
import type {
  OptimizationResult
} from '../../context/optimize';

export function contextCommand(): Command {
  const program = new Command('context');
  
  program
    .description('Manage agent context (files, memory, shared data)')
    .alias('ctx');
  
  // context get
  program
    .command('get <agent-id>')
    .description('Get context for an agent')
    .action(async (agentId: string, options: { format: string }) => {
      const format = validateFormat(options.format);
      
      try {
        const agent = memoryStore.agents.get(agentId);
        if (!agent) {
          handleError(`Agent not found: ${agentId}`);
        }
        
        logger.info(formatContext(agent.context, format));
      } catch (error) {
        handleError(error);
      }
    });
  
  // context add
  program
    .command('add <agent-id> <file-path>')
    .description('Add a file to agent context')
    .option('--type <input|output|shared|reasoning>', 'Context type', 'input')
    .action(async (agentId: string, filePath: string, options: { type?: string }) => {
      try {
        const agent = memoryStore.agents.get(agentId);
        if (!agent) {
          handleError(`Agent not found: ${agentId}`);
        }
        
        // Add file to appropriate context array
        const context = agent.context;
        switch (options.type) {
          case 'output':
            if (!context.outputContext.includes(filePath)) {
              context.outputContext.push(filePath);
            }
            break;
          case 'shared':
            if (!context.sharedContext.includes(filePath)) {
              context.sharedContext.push(filePath);
            }
            break;
          case 'reasoning':
            // Reasoning context stored in metadata for now
            if (!agent.metadata['reasoningContext']) {
              agent.metadata['reasoningContext'] = [];
            }
            if (!(agent.metadata['reasoningContext'] as string[]).includes(filePath)) {
              (agent.metadata['reasoningContext'] as string[]).push(filePath);
            }
            break;
          default:
            if (!context.inputContext.includes(filePath)) {
              context.inputContext.push(filePath);
            }
        }
        
        memoryStore.agents.update(agentId, { context });

        logger.info(`✓ Added ${filePath} to ${agent.label || agentId} context (${options.type})`);
      } catch (error) {
        handleError(error);
      }
    });
  
  // context remove
  program
    .command('remove <agent-id> <file-path>')
    .description('Remove a file from agent context')
    .action(async (agentId: string, filePath: string) => {
      try {
        const agent = memoryStore.agents.get(agentId);
        if (!agent) {
          handleError(`Agent not found: ${agentId}`);
        }
        
        const context = agent.context;
        
        // Remove from all context arrays
        context.inputContext = context.inputContext.filter((p: string) => p !== filePath);
        context.outputContext = context.outputContext.filter((p: string) => p !== filePath);
        context.sharedContext = context.sharedContext.filter((p: string) => p !== filePath);
        
        if (agent.metadata['reasoningContext']) {
          agent.metadata['reasoningContext'] = (agent.metadata['reasoningContext'] as string[]).filter(
            (p: string) => p !== filePath
          );
        }
        
        memoryStore.agents.update(agentId, { context });

        logger.info(`✓ Removed ${filePath} from ${agent.label || agentId} context`);
      } catch (error) {
        handleError(error);
      }
    });
  
  // context share
  program
    .command('share <agent-id> <target-agent-id> <file-path>')
    .description('Share context from one agent to another')
    .action(async (agentId, targetAgentId, filePath) => {
      try {
        const agent = memoryStore.agents.get(agentId);
        const target = memoryStore.agents.get(targetAgentId);
        
        if (!agent) {
          handleError(`Agent not found: ${agentId}`);
        }
        if (!target) {
          handleError(`Target agent not found: ${targetAgentId}`);
        }
        
        // Add to target's shared context
        const targetContext = target.context;
        if (!targetContext.sharedContext.includes(filePath)) {
          targetContext.sharedContext.push(filePath);
        }
        
        memoryStore.agents.update(targetAgentId, { context: targetContext });

        logger.info(`✓ Shared ${filePath} from ${agent.label || agentId} to ${target.label || targetAgentId}`);
      } catch (error) {
        handleError(error);
      }
    });
  
  // context analyze
  program
    .command('analyze <agent-id>')
    .description('Analyze context usage for an agent with detailed metrics and recommendations')
    .option('--format <json|table>', 'Output format', 'table')
    .action(async (agentId: string, options: { format: string }) => {
      const format = validateFormat(options.format);

      try {
        const agent = memoryStore.agents.get(agentId);
        if (!agent) {
          handleError(`Agent not found: ${agentId}`);
        }

        const context = agent.context;

        // Get reasoning context from metadata if available
        const metadata = agent.metadata;
        const reasoningContext = Array.isArray(metadata?.['reasoningContext']) 
          ? (metadata['reasoningContext'] as string[]) 
          : [];

        // Run enhanced analysis
        const analysis = analyzeContext(
          agentId,
          context.inputContext,
          context.outputContext,
          context.sharedContext,
          reasoningContext
        );

        if (format === 'json') {
          logger.info(formatAnalysisAsJson(analysis));
        } else {
          logger.info(formatAnalysisAsString(analysis));
        }
      } catch (error) {
        handleError(error);
      }
    });
  
  // context optimize
  program
    .command('optimize <agent-id>')
    .description('Optimize context for an agent with actionable recommendations')
    .option('--dry-run', 'Show what would be done without applying (default behavior)')
    .option('--aggressive', 'Apply maximum optimization (may remove more files)')
    .option('--apply', 'Actually apply optimizations')
    .option('--format <json|table>', 'Output format', 'table')
    .action(async (agentId: string, options: { dryRun?: boolean; aggressive?: boolean; apply?: boolean; format: string }) => {
      const format = validateFormat(options.format);
      const isDryRun = options.dryRun || !options.apply; // Default to dry run if neither flag specified

      try {
        const agent = memoryStore.agents.get(agentId);
        if (!agent) {
          handleError(`Agent not found: ${agentId}`);
        }

        const context = agent.context;

        // Get reasoning context from metadata if available
        const optMetadata = agent.metadata;
        const reasoningContext = Array.isArray(optMetadata?.['reasoningContext']) 
          ? (optMetadata['reasoningContext'] as string[]) 
          : [];

        let result: OptimizationResult;

        if (options.apply && !isDryRun) {
          // Actually apply optimizations
          result = applyOptimization(
            agentId,
            [...context.inputContext],
            [...context.outputContext],
            [...context.sharedContext],
            [...reasoningContext],
            options.aggressive
          );

          // Update agent context with optimized values
          context.inputContext = result.changes
            .filter((c) => context.inputContext.includes(c.filePath))
            .reduce((acc, c) => {
              const idx = acc.indexOf(c.filePath);
              if (idx > -1) acc.splice(idx, 1);
              return acc;
            }, [...context.inputContext]);

          context.outputContext = result.changes
            .filter((c) => context.outputContext.includes(c.filePath))
            .reduce((acc, c) => {
              const idx = acc.indexOf(c.filePath);
              if (idx > -1) acc.splice(idx, 1);
              return acc;
            }, [...context.outputContext]);

          context.sharedContext = result.changes
            .filter((c) => context.sharedContext.includes(c.filePath))
            .reduce((acc, c) => {
              const idx = acc.indexOf(c.filePath);
              if (idx > -1) acc.splice(idx, 1);
              return acc;
            }, [...context.sharedContext]);

          // Remove duplicates
          context.inputContext = [...new Set(context.inputContext)];
          context.outputContext = [...new Set(context.outputContext)];
          context.sharedContext = [...new Set(context.sharedContext)];

          // Update context metadata
          context.contextSize = result.newSize;
          context.contextUsage = result.newSize / 10000000; // Approximate

          memoryStore.agents.update(agentId, { context });

          // Update reasoning context in metadata
          if (options.aggressive && agent.metadata) {
            (agent.metadata)['reasoningContext'] = [];
          }

          logger.info(`✓ Context optimized for ${agent.label || agentId}`);
          logger.info(`  Removed ${result.changes.length} items, saved ${formatBytes(result.savings)}`);
        } else {
          // Just show the plan (dry run)
          result = planOptimization(
            agentId,
            context.inputContext,
            context.outputContext,
            context.sharedContext,
            reasoningContext,
            options.aggressive
          );

          logger.info(`Context Optimization Plan for ${agent.label || agentId}:`);
          logger.info(`  Run with --apply to apply these optimizations`);
          logger.debug('');
        }

        if (format === 'json') {
          logger.info(formatOptimizationAsJson(result));
        } else {
          logger.info(formatOptimizationAsString(result, isDryRun));
        }
      } catch (error) {
        handleError(error);
      }
    });
  
  // context compact - Automatically consolidate files
  program
    .command('compact <agent-id>')
    .description('Automatically consolidate related files in context')
    .option('--apply', 'Actually apply consolidations (without this, just shows the plan)')
    .option('--format <json|table>', 'Output format', 'table')
    .action(async (agentId: string, options: { apply?: boolean; format: string }) => {
      const format = validateFormat(options.format);

      try {
        const agent = memoryStore.agents.get(agentId);
        if (!agent) {
          handleError(`Agent not found: ${agentId}`);
        }

        const context = agent.context;

        // Find consolidation opportunities
        const groups = findConsolidationOpportunities(
          context.inputContext,
          context.outputContext,
          context.sharedContext
        );

        // Calculate original file count
        const originalCount = 
          context.inputContext.length +
          context.outputContext.length +
          context.sharedContext.length;

        // Calculate estimated savings
        const savings = groups.reduce((sum, g) => sum + g.estimatedSavings, 0);

        const result: ConsolidationResult = {
          originalCount,
          consolidatedCount: originalCount - groups.reduce((sum, g) => sum + g.files.length, 0) + groups.length,
          savings,
          groups,
        };

        if (options.apply) {
          // Actually apply consolidations
          const updated = applyConsolidation(
            [...context.inputContext],
            [...context.outputContext],
            [...context.sharedContext],
            groups
          );

          // Update context
          context.inputContext = updated.inputContext;
          context.outputContext = updated.outputContext;
          context.sharedContext = updated.sharedContext;

          memoryStore.agents.update(agentId, { context });

          logger.info(`✓ Context consolidated for ${agent.label || agentId}`);
          logger.info(`  Created ${updated.consolidatedFiles.length} consolidated files`);
          logger.info(`  Removed ${groups.reduce((sum, g) => sum + g.files.length, 0)} original files`);
        } else {
          // Show plan
          logger.info(`Context Consolidation Plan for ${agent.label || agentId}:`);
          logger.info(`  Run with --apply to apply these consolidations`);
          logger.debug('');
        }

        if (format === 'json') {
          logger.info(formatConsolidationAsJson(result));
        } else {
          logger.info(formatConsolidationAsString(result, !options.apply));
        }
      } catch (error) {
        handleError(error);
      }
    });
  
  // context snapshot
  program
    .command('snapshot <agent-id>')
    .description('Create a context snapshot for an agent')
    .option('--output <path>', 'Output file path')
    .action(async (agentId: string, options: { output?: string }) => {
      try {
        const agent = memoryStore.agents.get(agentId);
        if (!agent) {
          handleError(`Agent not found: ${agentId}`);
        }
        
        const snapshot = {
          agentId,
          timestamp: new Date().toISOString(),
          context: agent.context,
          metadata: agent.metadata
        };
        
        if (options.output) {
          fs.writeFileSync(options.output, JSON.stringify(snapshot, null, 2));
          logger.info(`✓ Snapshot saved to ${options.output}`);
        } else {
          logger.info(JSON.stringify(snapshot, null, 2));
        }
      } catch (error) {
        handleError(error);
      }
    });
  
  // context tree - Enhanced with dependency support
  program
    .command('tree <agent-id>')
    .description('Show context file tree with dependency analysis for an agent')
    .option('--max-depth <n>', 'Maximum depth to display', '3')
    .option('--deps', 'Show dependencies', false)
    .option('--language <typescript|javascript|python|rust|go>', 'Language for dependency parsing')
    .option('--format <json|table>', 'Output format', 'table')
    .action(async (agentId: string, options: { 
      format: string; 
      maxDepth?: string;
      deps?: boolean;
      language?: string;
    }) => {
      const format = validateFormat(options.format);
      const maxDepth = parseInt(options.maxDepth || '3', 10);
      const showDeps = options.deps || false;
      
      try {
        const agent = memoryStore.agents.get(agentId);
        if (!agent) {
          handleError(`Agent not found: ${agentId}`);
        }
        
        const context = agent.context;
        
        // Collect all files from context
        const allFiles = [
          ...context.inputContext,
          ...context.outputContext,
          ...context.sharedContext,
        ];
        
        if (allFiles.length === 0) {
          if (format === 'json') {
            logger.info(JSON.stringify({ fileTree: null, message: 'No files in context' }, null, 2));
          } else {
            logger.info(`Context Tree for ${agent.label || agentId}:`);
            logger.info('  (empty)');
          }
          return;
        }
        
        // Read file contents for dependency parsing
        const contents = new Map<string, string>();
        if (showDeps || options.language) {
          for (const filePath of allFiles) {
            try {
              if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf-8');
                contents.set(filePath, content);
              }
            } catch (e) {
              // Skip files that can't be read
            }
          }
        }
        
        // Build file tree
        const builder = new FileTreeBuilder();
        for (const filePath of allFiles) {
          builder.addPath(filePath);
        }
        
        // Parse file contents for dependencies
        if (contents.size > 0) {
          for (const [path, content] of contents) {
            builder.addFileContent(path, content);
          }
        }
        
        const fileTree = builder.build();
        
        // Build dependency graph
        let dependencyGraph = null;
        let cycleInfo = null;
        
        if (showDeps || options.language) {
          const graphBuilder = new DependencyGraphBuilder();
          
          for (const filePath of allFiles) {
            graphBuilder.addFile(filePath);
            if (contents.has(filePath)) {
              graphBuilder.addContent(filePath, contents.get(filePath)!);
            }
          }
          
          // Parse all contents
          const graph = graphBuilder.build();
          const analyzer = graphBuilder.getAnalyzer();
          const cycles = analyzer.detectCycles();
          
          dependencyGraph = {
            nodes: Object.fromEntries(graph.nodes),
            edges: graph.edges,
          };
          
          cycleInfo = {
            hasCycles: cycles.hasCycles,
            cycleCount: cycles.cycles.length,
          };
        }
        
        // Format output
        if (format === 'json') {
          const output: Record<string, unknown> = {
            agentId,
            fileTree: builder.format(maxDepth, true),
          };

          if (dependencyGraph) {
            output['dependencyGraph'] = dependencyGraph;
          }

          if (cycleInfo) {
            output['cycles'] = cycleInfo;
          }

          logger.info(JSON.stringify(output, null, 2));
        } else {
          // Table/string format - same output
          logger.info(`Context Tree for ${agent.label || agentId}:`);
          logger.info(formatTreeAsString(fileTree, '', true, maxDepth, 0, showDeps));

          if (cycleInfo) {
            logger.debug('');
            if (cycleInfo.hasCycles) {
              logger.warn(`⚠ Cycles: ${cycleInfo.cycleCount} detected`);
            } else {
              logger.info(`✓ No circular dependencies`);
            }
          }
        }
      } catch (error) {
        handleError(error);
      }
    });
  
  // context deps - Show dependency information
  program
    .command('deps <agent-id> [file]')
    .description('Show dependencies or dependents for files in context')
    .option('--transitive', 'Show transitive dependencies', false)
    .option('--format <json|table>', 'Output format', 'table')
    .action(async (agentId: string, file: string | undefined, options: { 
      transitive?: boolean;
      format: string;
    }) => {
      const format = validateFormat(options.format);
      
      try {
        const agent = memoryStore.agents.get(agentId);
        if (!agent) {
          handleError(`Agent not found: ${agentId}`);
        }
        
        const context = agent.context;
        const allFiles = [
          ...context.inputContext,
          ...context.outputContext,
          ...context.sharedContext,
        ];
        
        // Build dependency graph
        const graphBuilder = new DependencyGraphBuilder();
        for (const filePath of allFiles) {
          graphBuilder.addFile(filePath);
          try {
            if (fs.existsSync(filePath)) {
              const content = fs.readFileSync(filePath, 'utf-8');
              graphBuilder.addContent(filePath, content);
            }
          } catch (e) {
            // Skip unreadable files
          }
        }
        graphBuilder.build();
        
        const analyzer = graphBuilder.getAnalyzer();
        
        // If specific file requested, show its deps/deps
        if (file) {
          const deps = analyzer.getDependencies(file);
          const dependents = analyzer.getDependents(file);
          
          if (format === 'json') {
            logger.info(JSON.stringify({
              file,
              dependencies: deps,
              dependents,
            }, null, 2));
          } else {
            logger.info(`Dependencies for ${file}:`);
            logger.info(`  Direct deps: ${deps.length}`);
            deps.forEach(d => logger.info(`    - ${d}`));
            logger.info(`  Dependents: ${dependents.length}`);
            dependents.forEach(d => logger.info(`    - ${d}`));
          }
        } else {
          // Show all dependencies
          const analysis = analyzer.analyze();

          if (format === 'json') {
            logger.info(JSON.stringify({
              totalFiles: allFiles.length,
              maxDepth: analysis.maxDepth,
              orphanFiles: analysis.orphanFiles,
              cycles: analysis.cycles,
            }, null, 2));
          } else {
            logger.info(`Dependency Analysis for ${agent.label || agentId}:`);
            logger.info(`  Total files: ${allFiles.length}`);
            logger.info(`  Max dependency depth: ${analysis.maxDepth}`);
            logger.info(`  Orphan files: ${analysis.orphanFiles.length}`);

            if (analysis.orphanFiles.length > 0) {
              logger.info('  Orphan files (no dependencies):');
              analysis.orphanFiles.forEach(f => logger.info(`    - ${f}`));
            }

            if (analysis.cycles.hasCycles) {
              logger.warn(`\n⚠ Circular dependencies detected (${analysis.cycles.cycles.length} cycles):`);
              analysis.cycles.cycles.forEach((cycle, i) => {
                logger.warn(`  Cycle ${i + 1}: ${cycle.join(' → ')}`);
              });
            } else {
              logger.info('\n✓ No circular dependencies');
            }
          }
        }
      } catch (error) {
        handleError(error);
      }
    });

  return program;
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export default contextCommand;
