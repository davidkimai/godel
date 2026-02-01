/**
 * Context Management Commands
 * 
 * Commands: get, add, remove, share, analyze, optimize, snapshot, tree
 */

import { Command } from 'commander';
import { validateFormat, handleError, globalFormat } from '../main';
import { formatContext } from '../formatters';
import { memoryStore } from '../../storage';
import { Agent } from '../../models/index';
import * as fs from 'fs';
import * as path from 'path';
import {
  FileTreeBuilder,
  buildFileTree,
  formatTreeAsString,
  DependencyGraphBuilder,
  DependencyAnalyzer,
  detectCycles,
  detectLanguage,
  parseImports,
  parseExports
} from '../../context';

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
        
        console.log(formatContext(agent!.context, format));
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
        const context = agent!.context;
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
            if (!agent!.metadata.reasoningContext) {
              agent!.metadata.reasoningContext = [];
            }
            if (!(agent!.metadata.reasoningContext as string[]).includes(filePath)) {
              (agent!.metadata.reasoningContext as string[]).push(filePath);
            }
            break;
          default:
            if (!context.inputContext.includes(filePath)) {
              context.inputContext.push(filePath);
            }
        }
        
        memoryStore.agents.update(agentId, { context });
        
        console.log(`✓ Added ${filePath} to ${agent!.label || agentId} context (${options.type})`);
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
        
        const context = agent!.context;
        
        // Remove from all context arrays
        context.inputContext = context.inputContext.filter((p: string) => p !== filePath);
        context.outputContext = context.outputContext.filter((p: string) => p !== filePath);
        context.sharedContext = context.sharedContext.filter((p: string) => p !== filePath);
        
        if (agent!.metadata.reasoningContext) {
          agent!.metadata.reasoningContext = (agent!.metadata.reasoningContext as string[]).filter(
            (p: string) => p !== filePath
          );
        }
        
        memoryStore.agents.update(agentId, { context });
        
        console.log(`✓ Removed ${filePath} from ${agent!.label || agentId} context`);
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
        const targetContext = target!.context;
        if (!targetContext.sharedContext.includes(filePath)) {
          targetContext.sharedContext.push(filePath);
        }
        
        memoryStore.agents.update(targetAgentId, { context: targetContext });
        
        console.log(`✓ Shared ${filePath} from ${agent!.label || agentId} to ${target!.label || targetAgentId}`);
      } catch (error) {
        handleError(error);
      }
    });
  
  // context analyze
  program
    .command('analyze <agent-id>')
    .description('Analyze context for an agent')
    .action(async (agentId, options) => {
      const format = validateFormat(options.format);
      
      try {
        const agent = memoryStore.agents.get(agentId);
        if (!agent) {
          handleError(`Agent not found: ${agentId}`);
        }
        
        const context = agent!.context;
        const analysis = {
          fileCount: context.inputContext.length + context.outputContext.length + context.sharedContext.length,
          inputCount: context.inputContext.length,
          outputCount: context.outputContext.length,
          sharedCount: context.sharedContext.length,
          size: context.contextSize,
          usagePercent: Math.round((context.contextUsage / context.contextWindow) * 100),
          recommendations: [] as string[]
        };
        
        // Generate recommendations
        if (analysis.usagePercent > 80) {
          analysis.recommendations.push('Context usage is high (>80%). Consider removing unused files.');
        }
        if (context.inputContext.length > 20) {
          analysis.recommendations.push('Large input context. Consider splitting into smaller chunks.');
        }
        if (analysis.fileCount === 0) {
          analysis.recommendations.push('No context files. Add relevant files for better performance.');
        }
        
        if (format === 'json') {
          console.log(JSON.stringify(analysis, null, 2));
        } else {
          console.log(`Context Analysis for ${agent!.label || agentId}:`);
          console.log(`  Input Files:   ${analysis.inputCount}`);
          console.log(`  Output Files:  ${analysis.outputCount}`);
          console.log(`  Shared Files:  ${analysis.sharedCount}`);
          console.log(`  Total Files:   ${analysis.fileCount}`);
          console.log(`  Context Size:  ${analysis.size} bytes`);
          console.log(`  Usage:         ${analysis.usagePercent}%`);
          if (analysis.recommendations.length > 0) {
            console.log('');
            console.log('Recommendations:');
            analysis.recommendations.forEach(r => console.log(`  - ${r}`));
          }
        }
      } catch (error) {
        handleError(error);
      }
    });
  
  // context optimize
  program
    .command('optimize <agent-id>')
    .description('Optimize context for an agent')
    .option('--aggressive', 'Use aggressive optimization')
    .action(async (agentId: string, options: { aggressive?: boolean }) => {
      try {
        const agent = memoryStore.agents.get(agentId);
        if (!agent) {
          handleError(`Agent not found: ${agentId}`);
        }
        
        const context = agent!.context;
        let removed = 0;
        
        if (options.aggressive) {
          // Remove all output context (likely no longer needed)
          removed += context.outputContext.length;
          context.outputContext = [];
          
          // Clear reasoning context
          if (agent!.metadata.reasoningContext) {
            removed += (agent!.metadata.reasoningContext as string[]).length;
            agent!.metadata.reasoningContext = [];
          }
        }
        
        // Remove duplicates
        context.inputContext = [...new Set(context.inputContext)];
        context.outputContext = [...new Set(context.outputContext)];
        context.sharedContext = [...new Set(context.sharedContext)];
        
        memoryStore.agents.update(agentId, { context });
        
        console.log(`✓ Context optimized for ${agent!.label || agentId}`);
        if (removed > 0) {
          console.log(`  Removed ${removed} items`);
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
          context: agent!.context,
          metadata: agent!.metadata
        };
        
        if (options.output) {
          fs.writeFileSync(options.output, JSON.stringify(snapshot, null, 2));
          console.log(`✓ Snapshot saved to ${options.output}`);
        } else {
          console.log(JSON.stringify(snapshot, null, 2));
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
        
        const context = agent!.context;
        
        // Collect all files from context
        const allFiles = [
          ...context.inputContext,
          ...context.outputContext,
          ...context.sharedContext,
        ];
        
        if (allFiles.length === 0) {
          if (format === 'json') {
            console.log(JSON.stringify({ fileTree: null, message: 'No files in context' }, null, 2));
          } else {
            console.log(`Context Tree for ${agent!.label || agentId}:`);
            console.log('  (empty)');
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
          const output: any = {
            agentId,
            fileTree: builder.format(maxDepth, true),
          };
          
          if (dependencyGraph) {
            output.dependencyGraph = dependencyGraph;
          }
          
          if (cycleInfo) {
            output.cycles = cycleInfo;
          }
          
          console.log(JSON.stringify(output, null, 2));
        } else {
          // Table/string format - same output
          console.log(`Context Tree for ${agent!.label || agentId}:`);
          console.log(formatTreeAsString(fileTree, '', true, maxDepth, 0, showDeps));
          
          if (cycleInfo) {
            console.log('');
            if (cycleInfo.hasCycles) {
              console.log(`⚠ Cycles: ${cycleInfo.cycleCount} detected`);
            } else {
              console.log(`✓ No circular dependencies`);
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
        
        const context = agent!.context;
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
            console.log(JSON.stringify({
              file,
              dependencies: deps,
              dependents,
            }, null, 2));
          } else {
            console.log(`Dependencies for ${file}:`);
            console.log(`  Direct deps: ${deps.length}`);
            deps.forEach(d => console.log(`    - ${d}`));
            console.log(`  Dependents: ${dependents.length}`);
            dependents.forEach(d => console.log(`    - ${d}`));
          }
        } else {
          // Show all dependencies
          const analysis = analyzer.analyze();
          
          if (format === 'json') {
            console.log(JSON.stringify({
              totalFiles: allFiles.length,
              maxDepth: analysis.maxDepth,
              orphanFiles: analysis.orphanFiles,
              cycles: analysis.cycles,
            }, null, 2));
          } else {
            console.log(`Dependency Analysis for ${agent!.label || agentId}:`);
            console.log(`  Total files: ${allFiles.length}`);
            console.log(`  Max dependency depth: ${analysis.maxDepth}`);
            console.log(`  Orphan files: ${analysis.orphanFiles.length}`);
            
            if (analysis.orphanFiles.length > 0) {
              console.log('  Orphan files (no dependencies):');
              analysis.orphanFiles.forEach(f => console.log(`    - ${f}`));
            }
            
            if (analysis.cycles.hasCycles) {
              console.log(`\n⚠ Circular dependencies detected (${analysis.cycles.cycles.length} cycles):`);
              analysis.cycles.cycles.forEach((cycle, i) => {
                console.log(`  Cycle ${i + 1}: ${cycle.join(' → ')}`);
              });
            } else {
              console.log('\n✓ No circular dependencies');
            }
          }
        }
      } catch (error) {
        handleError(error);
      }
    });
  
  return program;
}

export default contextCommand;
