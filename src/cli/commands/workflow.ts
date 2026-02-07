/**
 * Workflow CLI Commands
 * 
 * Commands:
 * - godel workflow list              List available workflow templates
 * - godel workflow show <id>         Show workflow details
 * - godel workflow run <id>          Execute a workflow with inputs
 * - godel workflow ps                List running instances
 * - godel workflow status <id>       Show instance status
 * - godel workflow cancel <id>       Cancel workflow
 * - godel workflow validate <file>   Validate workflow JSON
 * - godel workflow export <id>       Export workflow visualization
 */

import { logger } from '../../utils/logger';
import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { 
  Workflow, 
  WorkflowInstanceStatus,
  WorkflowValidationResult,
} from '../../loop/workflow/types';
import { WorkflowEngine } from '../../loop/workflow/engine';
import { 
  WorkflowTemplateLibrary, 
  createDefaultTemplateLibrary,
  WorkflowTemplate,
} from '../../loop/workflow/templates';

// ============================================================================
// Global Template Library
// ============================================================================

const templateLibrary = createDefaultTemplateLibrary();

// In-memory workflow registry (would be persistent in production)
const workflowRegistry = new Map<string, Workflow>();

// In-memory instance tracking
interface WorkflowInstanceInfo {
  id: string;
  workflowId: string;
  status: WorkflowInstanceStatus;
  startedAt: Date;
  completedAt?: Date;
  progress: number;
  variables: Record<string, unknown>;
  currentNodes: string[];
  completedNodes: number;
  totalNodes: number;
}

const instanceRegistry = new Map<string, WorkflowInstanceInfo>();

// ============================================================================
// Export Format Types
// ============================================================================

type ExportFormat = 'mermaid' | 'dot' | 'json';

// ============================================================================
// Progress Bar Utility
// ============================================================================

function renderProgressBar(progress: number, width: number = 40): string {
  const filled = Math.floor(progress * width);
  const empty = width - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  const percentage = Math.round(progress * 100);
  return `[${bar}] ${percentage}%`;
}

function renderSpinner(frame: number): string {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  return frames[frame % frames.length];
}

// ============================================================================
// Validation Functions
// ============================================================================

function validateWorkflow(data: unknown): WorkflowValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!data || typeof data !== 'object') {
    errors.push('Workflow must be an object');
    return { valid: false, errors, warnings };
  }

  const workflow = data as Record<string, unknown>;

  // Required fields
  if (!workflow['id'] || typeof workflow['id'] !== 'string') {
    errors.push('Workflow must have an id (string)');
  }

  if (!workflow['name'] || typeof workflow['name'] !== 'string') {
    errors.push('Workflow must have a name (string)');
  }

  if (!workflow['version'] || typeof workflow['version'] !== 'string') {
    warnings.push('Workflow should have a version (string)');
  }

  // Nodes validation
  if (!Array.isArray(workflow['nodes'])) {
    errors.push('Workflow must have a nodes array');
  } else {
    const nodeIds = new Set<string>();
    const nodes = workflow['nodes'] as Array<Record<string, unknown>>;
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (!node['id'] || typeof node['id'] !== 'string') {
        errors.push(`Node at index ${i} must have an id`);
      } else if (nodeIds.has(String(node['id']))) {
        errors.push(`Duplicate node id: ${node['id']}`);
      } else {
        nodeIds.add(String(node['id']));
      }

      if (!node['type'] || typeof node['type'] !== 'string') {
        errors.push(`Node ${node['id'] || i} must have a type`);
      }

      if (!node['config'] || typeof node['config'] !== 'object') {
        errors.push(`Node ${node['id'] || i} must have a config object`);
      }
    }
  }

  // Edges validation
  if (!Array.isArray(workflow['edges'])) {
    errors.push('Workflow must have an edges array');
  } else {
    const edges = workflow['edges'] as Array<Record<string, unknown>>;
    for (let i = 0; i < edges.length; i++) {
      const edge = edges[i];
      if (!edge['id'] || typeof edge['id'] !== 'string') {
        errors.push(`Edge at index ${i} must have an id`);
      }
      if (!edge['from'] || typeof edge['from'] !== 'string') {
        errors.push(`Edge ${edge['id'] || i} must have a from node id`);
      }
      if (!edge['to'] || typeof edge['to'] !== 'string') {
        errors.push(`Edge ${edge['id'] || i} must have a to node id`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================================
// Export Functions
// ============================================================================

function exportToMermaid(workflow: Workflow): string {
  const lines: string[] = [
    '```mermaid',
    'flowchart TD',
  ];

  // Add nodes with styling
  for (const node of workflow.nodes) {
    let shape = '[';
    let shapeEnd = ']';
    
    switch (node.type) {
      case 'condition':
        shape = '{';
        shapeEnd = '}';
        break;
      case 'parallel':
        shape = '[[';
        shapeEnd = ']]';
        break;
      case 'merge':
        shape = '[(';
        shapeEnd = ')]';
        break;
      case 'delay':
        shape = '>';
        shapeEnd = ']';
        break;
      case 'sub-workflow':
        shape = '[/';
        shapeEnd = '/]';
        break;
    }

    const sanitizedName = node.name.replace(/\[/g, '(').replace(/\]/g, ')');
    lines.push(`    ${node.id}${shape}"${sanitizedName}"${shapeEnd}`);
  }

  lines.push('');

  // Add edges
  for (const edge of workflow.edges) {
    let edgeLine = `    ${edge.from} --> ${edge.to}`;
    if (edge.condition) {
      edgeLine += `|${edge.condition}|`;
    }
    lines.push(edgeLine);
  }

  // Add styling classes
  lines.push('');
  lines.push('    classDef task fill:#e1f5fe,stroke:#01579b');
  lines.push('    classDef condition fill:#fff3e0,stroke:#e65100');
  lines.push('    classDef parallel fill:#e8f5e9,stroke:#2e7d32');
  lines.push('    classDef merge fill:#fce4ec,stroke:#c2185b');
  lines.push('    classDef delay fill:#f3e5f5,stroke:#7b1fa2');
  lines.push('    classDef subworkflow fill:#fff9c4,stroke:#f57f17');
  lines.push('');

  // Apply classes to nodes
  const nodesByType: Record<string, string[]> = {};
  for (const node of workflow.nodes) {
    if (!nodesByType[node.type]) {
      nodesByType[node.type] = [];
    }
    nodesByType[node.type].push(node.id);
  }

  for (const [type, ids] of Object.entries(nodesByType)) {
    const className = type === 'sub-workflow' ? 'subworkflow' : type;
    lines.push(`    class ${ids.join(',')}${className};`);
  }

  lines.push('```');
  return lines.join('\n');
}

function exportToDot(workflow: Workflow): string {
  const lines: string[] = [
    'digraph Workflow {',
    '  rankdir=TB;',
    '  node [shape=box, style=filled];',
    '',
  ];

  // Define nodes with shapes and colors
  for (const node of workflow.nodes) {
    let shape = 'box';
    let color = '#e1f5fe';
    
    switch (node.type) {
      case 'condition':
        shape = 'diamond';
        color = '#fff3e0';
        break;
      case 'parallel':
        shape = 'box3d';
        color = '#e8f5e9';
        break;
      case 'merge':
        shape = 'ellipse';
        color = '#fce4ec';
        break;
      case 'delay':
        shape = 'note';
        color = '#f3e5f5';
        break;
      case 'sub-workflow':
        shape = 'component';
        color = '#fff9c4';
        break;
    }

    const sanitizedName = node.name.replace(/"/g, '\\"');
    lines.push(`  ${node.id} [label="${sanitizedName}", shape=${shape}, fillcolor="${color}"];`);
  }

  lines.push('');

  // Add edges
  for (const edge of workflow.edges) {
    let edgeLine = `  ${edge.from} -> ${edge.to}`;
    if (edge.condition) {
      const sanitizedCondition = edge.condition.replace(/"/g, '\\"');
      edgeLine += ` [label="${sanitizedCondition}"]`;
    }
    lines.push(edgeLine + ';');
  }

  lines.push('}');
  return lines.join('\n');
}

// ============================================================================
// CLI Command Factory
// ============================================================================

export function createWorkflowCommand(): Command {
  const cmd = new Command('workflow')
    .description('Manage workflow templates and executions')
    .configureHelp({ sortOptions: true });

  // ============================================================================
  // workflow list
  // ============================================================================
  cmd.addCommand(
    new Command('list')
      .description('List available workflow templates')
      .option('-t, --tag <tag>', 'Filter by tag')
      .option('-c, --category <category>', 'Filter by category')
      .option('--json', 'Output as JSON')
      .action(async (options) => {
        try {
          let templates: WorkflowTemplate[];

          if (options.tag) {
            templates = templateLibrary.findByTag(options.tag);
          } else if (options.category) {
            templates = templateLibrary.findByCategory(options.category);
          } else {
            templates = templateLibrary.listTemplates();
          }

          if (options.json) {
            logger.info(JSON.stringify(templates, null, 2));
          } else {
            if (templates.length === 0) {
              logger.info('📭 No workflow templates found');
              return;
            }

            logger.info('\n📋 Available Workflow Templates\n');
            logger.info('─'.repeat(80));
            
            for (const template of templates) {
              logger.info(`\n🔹 ${template.name}`);
              logger.info(`   ID: ${template.id}`);
              logger.info(`   Category: ${template.category}`);
              logger.info(`   Tags: ${template.tags.join(', ')}`);
              logger.info(`   Description: ${template.description}`);
              logger.info(`   Variables: ${template.variables.length}`);
              logger.info(`   Nodes: ${template.workflow.nodes.length}`);
              logger.info(`   Edges: ${template.workflow.edges.length}`);
            }
            
            logger.info('\n' + '─'.repeat(80));
            logger.info(`\nTotal: ${templates.length} templates\n`);
            logger.info('💡 Use "godel workflow show <id>" for details');
            logger.info('💡 Use "godel workflow run <id>" to execute\n');
          }
        } catch (error) {
          logger.error('❌ Failed to list workflows:', error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
      })
  );

  // ============================================================================
  // workflow show
  // ============================================================================
  cmd.addCommand(
    new Command('show')
      .description('Show workflow template details')
      .argument('<id>', 'Workflow template ID')
      .option('--json', 'Output as JSON')
      .action(async (id, options) => {
        try {
          const template = templateLibrary.getTemplate(id);

          if (!template) {
            // Check if it's a registered workflow
            const workflow = workflowRegistry.get(id);
            if (workflow) {
              if (options.json) {
                logger.info(JSON.stringify(workflow, null, 2));
              } else {
                logger.info(`\n📄 Workflow: ${workflow.name}\n`);
                logger.info(`   ID: ${workflow.id}`);
                logger.info(`   Version: ${workflow.version}`);
                logger.info(`   Nodes: ${workflow.nodes.length}`);
                logger.info(`   Edges: ${workflow.edges.length}`);
                logger.info(`   Timeout: ${workflow.timeout || 'default'}ms`);
                logger.info(`   On Failure: ${workflow.onFailure || 'stop'}`);
              }
              return;
            }
            
            logger.error(`❌ Workflow template not found: ${id}`);
            logger.info('\n💡 Available templates:');
            for (const t of templateLibrary.listTemplates()) {
              logger.info(`   - ${t.id}: ${t.name}`);
            }
            process.exit(1);
          }

          if (options.json) {
            logger.info(JSON.stringify(template, null, 2));
          } else {
            logger.info(`\n📄 Workflow Template: ${template.name}\n`);
            logger.info(`   ID: ${template.id}`);
            logger.info(`   Category: ${template.category}`);
            logger.info(`   Tags: ${template.tags.join(', ')}`);
            logger.info(`   Description: ${template.description}`);
            logger.info(`   Version: ${template.workflow.version}`);
            logger.info(`   Timeout: ${template.workflow.timeout}ms`);
            logger.info(`   On Failure: ${template.workflow.onFailure}`);
            
            logger.info(`\n   Variables (${template.variables.length}):`);
            for (const v of template.variables) {
              const required = v.required ? '*' : '';
              const defaultValue = v.default !== undefined ? ` (default: ${v.default})` : '';
              logger.info(`     - ${v.name}${required}: ${v.type}${defaultValue}`);
              logger.info(`       ${v.description || ''}`);
            }
            if (template.variables.some(v => v.required)) {
              logger.info('     (* = required)');
            }

            logger.info(`\n   Nodes (${template.workflow.nodes.length}):`);
            for (const node of template.workflow.nodes) {
              logger.info(`     - ${node.id} (${node.type}): ${node.name}`);
            }

            logger.info(`\n   Edges (${template.workflow.edges.length}):`);
            for (const edge of template.workflow.edges) {
              const condition = edge.condition ? ` [${edge.condition}]` : '';
              logger.info(`     - ${edge.from} -> ${edge.to}${condition}`);
            }

            if (template.exampleInputs) {
              logger.info(`\n   Example Inputs:`);
              for (const [key, value] of Object.entries(template.exampleInputs)) {
                logger.info(`     ${key}: ${value}`);
              }
            }

            logger.info('\n💡 Use "godel workflow run ' + id + ' --input ..." to execute');
            logger.info('💡 Use "godel workflow export ' + id + ' --format mermaid" to visualize\n');
          }
        } catch (error) {
          logger.error('❌ Failed to show workflow:', error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
      })
  );

  // ============================================================================
  // workflow run
  // ============================================================================
  cmd.addCommand(
    new Command('run')
      .description('Execute a workflow')
      .argument('<id>', 'Workflow template ID or workflow ID')
      .option('-i, --input <key=value>', 'Input variable (can be used multiple times)', collectInputs, {})
      .option('-f, --input-file <path>', 'Input variables from JSON file')
      .option('--watch', 'Watch execution with progress bar')
      .option('--async', 'Run asynchronously (don\'t wait for completion)')
      .option('--timeout <ms>', 'Override timeout in milliseconds')
      .action(async (id, options) => {
        try {
          // Get workflow template
          let template = templateLibrary.getTemplate(id);
          let workflow: Workflow;

          if (template) {
            workflow = template.workflow;
          } else {
            // Check registered workflows
            const registered = workflowRegistry.get(id);
            if (registered) {
              workflow = registered;
              template = {
                id: registered.id,
                name: registered.name,
                description: registered.description || '',
                category: 'custom',
                tags: [],
                workflow: registered,
                variables: registered.variables || [],
              };
            } else {
              logger.error(`❌ Workflow not found: ${id}`);
              logger.info('\n💡 Available templates:');
              for (const t of templateLibrary.listTemplates()) {
                logger.info(`   - ${t.id}: ${t.name}`);
              }
              process.exit(1);
            }
          }

          // Parse inputs
          let inputs: Record<string, unknown> = { ...options.input };
          
          if (options.inputFile) {
            const fileContent = fs.readFileSync(options.inputFile, 'utf8');
            const fileInputs = JSON.parse(fileContent);
            inputs = { ...fileInputs, ...inputs };
          }

          // Validate required inputs
          const missingRequired: string[] = [];
          for (const v of template.variables) {
            if (v.required && inputs[v.name] === undefined) {
              missingRequired.push(v.name);
            }
          }

          if (missingRequired.length > 0) {
            logger.error(`❌ Missing required inputs: ${missingRequired.join(', ')}`);
            logger.info('\n   Required variables:');
            for (const name of missingRequired) {
              const v = template.variables.find(v => v.name === name);
              logger.info(`     - ${name}: ${v?.description || ''}`);
            }
            logger.info(`\n💡 Usage: godel workflow run ${id} --input ${missingRequired[0]}=value`);
            process.exit(1);
          }

          // Generate instance ID
          const instanceId = `wf-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

          // Create instance info
          const instanceInfo: WorkflowInstanceInfo = {
            id: instanceId,
            workflowId: workflow.id,
            status: WorkflowInstanceStatus.RUNNING,
            startedAt: new Date(),
            progress: 0,
            variables: inputs,
            currentNodes: workflow.nodes.map(n => n.id),
            completedNodes: 0,
            totalNodes: workflow.nodes.length,
          };

          instanceRegistry.set(instanceId, instanceInfo);

          logger.info(`🚀 Workflow execution started`);
          logger.info(`   Instance ID: ${instanceId}`);
          logger.info(`   Workflow: ${workflow.name}`);
          logger.info(`   Inputs: ${JSON.stringify(inputs)}`);

          if (options.async) {
            logger.info(`\n💡 Use "godel workflow status ${instanceId}" to check status`);
            logger.info(`   Use "godel workflow ps" to list running instances\n`);
            return;
          }

          if (options.watch) {
            // Watch mode with progress bar
            logger.info('\n');
            let spinnerFrame = 0;
            
            const watchInterval = setInterval(() => {
              const instance = instanceRegistry.get(instanceId);
              if (!instance) return;

              const spinner = renderSpinner(spinnerFrame++);
              const progressBar = renderProgressBar(instance.progress);
              const status = instance.status === WorkflowInstanceStatus.RUNNING 
                ? `${spinner} Running`
                : instance.status;
              
              // Clear line and redraw
              process.stdout.write('\r\x1b[K');
              process.stdout.write(`${status} ${progressBar} (${instance.completedNodes}/${instance.totalNodes} nodes)`);

              if (instance.status !== WorkflowInstanceStatus.RUNNING && 
                  instance.status !== WorkflowInstanceStatus.PENDING) {
                clearInterval(watchInterval);
                process.stdout.write('\n');
                
                if (instance.status === WorkflowInstanceStatus.COMPLETED) {
                  logger.info('\n✅ Workflow completed successfully!');
                } else if (instance.status === WorkflowInstanceStatus.FAILED) {
                  logger.error('\n❌ Workflow failed');
                  process.exit(1);
                } else if (instance.status === WorkflowInstanceStatus.CANCELLED) {
                  logger.info('\n🛑 Workflow was cancelled');
                  process.exit(1);
                }
              }
            }, 100);

            // Simulate workflow execution (in production, this would be real)
            await simulateWorkflowExecution(instanceId, options.timeout ? parseInt(options.timeout) : undefined);
          } else {
            // Non-watch mode - just wait for completion
            logger.info('\n⏳ Waiting for workflow to complete...');
            await simulateWorkflowExecution(instanceId, options.timeout ? parseInt(options.timeout) : undefined);
            
            const instance = instanceRegistry.get(instanceId)!;
            
            if (instance.status === WorkflowInstanceStatus.COMPLETED) {
              logger.info('\n✅ Workflow completed successfully!');
              logger.info(`   Duration: ${Date.now() - instance.startedAt.getTime()}ms`);
              logger.info(`   Completed nodes: ${instance.completedNodes}/${instance.totalNodes}`);
            } else if (instance.status === WorkflowInstanceStatus.FAILED) {
              logger.error('\n❌ Workflow failed');
              process.exit(1);
            }
          }
        } catch (error) {
          logger.error('❌ Failed to run workflow:', error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
      })
  );

  // ============================================================================
  // workflow ps
  // ============================================================================
  cmd.addCommand(
    new Command('ps')
      .description('List running workflow instances')
      .option('-a, --all', 'Show all instances including completed')
      .option('--json', 'Output as JSON')
      .action(async (options) => {
        try {
          let instances = Array.from(instanceRegistry.values());

          if (!options.all) {
            instances = instances.filter(i => 
              i.status === WorkflowInstanceStatus.RUNNING || 
              i.status === WorkflowInstanceStatus.PENDING
            );
          }

          // Sort by start time (newest first)
          instances.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());

          if (options.json) {
            logger.info(JSON.stringify(instances, null, 2));
          } else {
            if (instances.length === 0) {
              logger.info('📭 No workflow instances found');
              if (!options.all) {
                logger.info('💡 Use --all to show completed instances');
              }
              return;
            }

            logger.info('\n📋 Workflow Instances\n');
            logger.info('─'.repeat(100));
            logger.info(
              'ID'.padEnd(30) + 
              'WORKFLOW'.padEnd(20) + 
              'STATUS'.padEnd(15) + 
              'PROGRESS'.padEnd(15) + 
              'STARTED'
            );
            logger.info('─'.repeat(100));

            for (const instance of instances.slice(0, 20)) {
              const statusIcon = getStatusIcon(instance.status);
              const progress = renderProgressBar(instance.progress, 10);
              const started = instance.startedAt.toLocaleTimeString();
              
              logger.info(
                instance.id.slice(0, 28).padEnd(30) +
                instance.workflowId.slice(0, 18).padEnd(20) +
                `${statusIcon} ${instance.status}`.padEnd(15) +
                progress.padEnd(15) +
                started
              );
            }

            if (instances.length > 20) {
              logger.info(`\n... and ${instances.length - 20} more`);
            }

            logger.info('─'.repeat(100));
            logger.info(`\nTotal: ${instances.length} instances`);
            logger.info('💡 Use "godel workflow status <id>" for details\n');
          }
        } catch (error) {
          logger.error('❌ Failed to list instances:', error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
      })
  );

  // ============================================================================
  // workflow status
  // ============================================================================
  cmd.addCommand(
    new Command('status')
      .description('Show workflow instance status')
      .argument('<instance-id>', 'Workflow instance ID')
      .option('--json', 'Output as JSON')
      .option('-f, --follow', 'Follow status updates (like tail -f)')
      .action(async (instanceId, options) => {
        try {
          let instance = instanceRegistry.get(instanceId);

          if (!instance) {
            logger.error(`❌ Instance not found: ${instanceId}`);
            process.exit(1);
          }

          if (options.follow) {
            logger.info(`📊 Following workflow instance: ${instanceId}\n`);
            logger.info('Press Ctrl+C to stop\n');

            const followInterval = setInterval(() => {
              instance = instanceRegistry.get(instanceId);
              if (!instance) return;

              // Clear screen and redraw
              process.stdout.write('\x1b[2J\x1b[0;0H');
              
              logger.info(`📊 Workflow Instance: ${instanceId}\n`);
              logger.info(`   Workflow: ${instance.workflowId}`);
              logger.info(`   Status: ${getStatusIcon(instance.status)} ${instance.status}`);
              logger.info(`   Progress: ${renderProgressBar(instance.progress)}`);
              logger.info(`   Nodes: ${instance.completedNodes}/${instance.totalNodes} completed`);
              logger.info(`   Started: ${instance.startedAt.toISOString()}`);
              
              if (instance.completedAt) {
                const duration = instance.completedAt.getTime() - instance.startedAt.getTime();
                logger.info(`   Completed: ${instance.completedAt.toISOString()}`);
                logger.info(`   Duration: ${duration}ms`);
              }

              if (instance.currentNodes.length > 0) {
                logger.info(`\n   Current Nodes: ${instance.currentNodes.join(', ')}`);
              }

              if (instance.status !== WorkflowInstanceStatus.RUNNING && 
                  instance.status !== WorkflowInstanceStatus.PENDING) {
                clearInterval(followInterval);
                logger.info('\n\n✅ Workflow finished');
              }
            }, 500);

            // Handle Ctrl+C
            process.on('SIGINT', () => {
              clearInterval(followInterval);
              logger.info('\n\n👋 Stopped following');
              process.exit(0);
            });

            // Keep process alive
            await new Promise(() => {});
          } else {
            if (options.json) {
              logger.info(JSON.stringify(instance, null, 2));
            } else {
              logger.info(`\n📊 Workflow Instance: ${instanceId}\n`);
              logger.info(`   Workflow: ${instance.workflowId}`);
              logger.info(`   Status: ${getStatusIcon(instance.status)} ${instance.status}`);
              logger.info(`   Progress: ${renderProgressBar(instance.progress)}`);
              logger.info(`   Nodes: ${instance.completedNodes}/${instance.totalNodes} completed`);
              logger.info(`   Started: ${instance.startedAt.toISOString()}`);
              
              if (instance.completedAt) {
                const duration = instance.completedAt.getTime() - instance.startedAt.getTime();
                logger.info(`   Completed: ${instance.completedAt.toISOString()}`);
                logger.info(`   Duration: ${duration}ms`);
              }

              if (Object.keys(instance.variables).length > 0) {
                logger.info(`\n   Variables:`);
                for (const [key, value] of Object.entries(instance.variables)) {
                  logger.info(`     ${key}: ${JSON.stringify(value)}`);
                }
              }

              if (instance.currentNodes.length > 0) {
                logger.info(`\n   Current Nodes: ${instance.currentNodes.join(', ')}`);
              }

              logger.info('');
            }
          }
        } catch (error) {
          logger.error('❌ Failed to get status:', error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
      })
  );

  // ============================================================================
  // workflow cancel
  // ============================================================================
  cmd.addCommand(
    new Command('cancel')
      .description('Cancel a running workflow instance')
      .argument('<instance-id>', 'Workflow instance ID')
      .option('-y, --yes', 'Skip confirmation')
      .action(async (instanceId, options) => {
        try {
          const instance = instanceRegistry.get(instanceId);

          if (!instance) {
            logger.error(`❌ Instance not found: ${instanceId}`);
            process.exit(1);
          }

          if (instance.status !== WorkflowInstanceStatus.RUNNING && 
              instance.status !== WorkflowInstanceStatus.PENDING) {
            logger.info(`ℹ️  Instance is already ${instance.status}`);
            return;
          }

          if (!options.yes) {
            logger.info(`⚠️  You are about to cancel workflow instance: ${instanceId}`);
            logger.info(`   Workflow: ${instance.workflowId}`);
            logger.info(`   Progress: ${renderProgressBar(instance.progress)}`);
            logger.info(`\n💡 Use --yes to confirm cancellation`);
            return;
          }

          instance.status = WorkflowInstanceStatus.CANCELLED;
          instance.completedAt = new Date();
          instanceRegistry.set(instanceId, instance);

          logger.info(`🛑 Workflow instance cancelled: ${instanceId}`);
        } catch (error) {
          logger.error('❌ Failed to cancel workflow:', error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
      })
  );

  // ============================================================================
  // workflow validate
  // ============================================================================
  cmd.addCommand(
    new Command('validate')
      .description('Validate a workflow JSON/YAML file')
      .argument('<file>', 'Path to workflow file')
      .option('--json', 'Output as JSON')
      .action(async (filePath, options) => {
        try {
          if (!fs.existsSync(filePath)) {
            logger.error(`❌ File not found: ${filePath}`);
            process.exit(1);
          }

          const content = fs.readFileSync(filePath, 'utf8');
          let workflow: unknown;

          // Parse based on extension
          if (filePath.endsWith('.json')) {
            workflow = JSON.parse(content);
          } else if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
            // Simple YAML parser for basic cases
            const yaml = require('js-yaml');
            workflow = yaml.load(content);
          } else {
            // Try JSON first, then YAML
            try {
              workflow = JSON.parse(content);
            } catch {
              const yaml = require('js-yaml');
              workflow = yaml.load(content);
            }
          }

          const result = validateWorkflow(workflow);

          if (options.json) {
            logger.info(JSON.stringify(result, null, 2));
          } else {
            logger.info(`\n📋 Validating: ${filePath}\n`);

            if (result.valid) {
              logger.info('✅ Workflow is valid');
            } else {
              logger.error('❌ Workflow is invalid');
            }

            if (result.errors.length > 0) {
              logger.info('\n   Errors:');
              for (const error of result.errors) {
                logger.error(`     • ${error}`);
              }
            }

            if (result.warnings.length > 0) {
              logger.info('\n   Warnings:');
              for (const warning of result.warnings) {
                logger.info(`     • ${warning}`);
              }
            }

            if (result.valid && result.errors.length === 0 && result.warnings.length === 0) {
              logger.info('\n   No issues found!');
            }

            logger.info('');
          }

          if (!result.valid) {
            process.exit(1);
          }
        } catch (error) {
          logger.error('❌ Failed to validate workflow:', error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
      })
  );

  // ============================================================================
  // workflow export
  // ============================================================================
  cmd.addCommand(
    new Command('export')
      .description('Export workflow visualization')
      .argument('<id>', 'Workflow template ID or workflow ID')
      .option('-f, --format <format>', 'Export format (mermaid|dot|json)', 'mermaid')
      .option('-o, --output <path>', 'Output file (default: stdout)')
      .action(async (id, options) => {
        try {
          const format = options.format as ExportFormat;
          
          if (!['mermaid', 'dot', 'json'].includes(format)) {
            logger.error(`❌ Invalid format: ${format}. Use: mermaid, dot, or json`);
            process.exit(1);
          }

          // Get workflow
          let template = templateLibrary.getTemplate(id);
          let workflow: Workflow;

          if (template) {
            workflow = template.workflow;
          } else {
            const registered = workflowRegistry.get(id);
            if (registered) {
              workflow = registered;
            } else {
              logger.error(`❌ Workflow not found: ${id}`);
              process.exit(1);
            }
          }

          let output: string;

          switch (format) {
            case 'mermaid':
              output = exportToMermaid(workflow);
              break;
            case 'dot':
              output = exportToDot(workflow);
              break;
            case 'json':
              output = JSON.stringify(workflow, null, 2);
              break;
          }

          if (options.output) {
            fs.writeFileSync(options.output, output);
            logger.info(`✅ Exported to: ${options.output}`);
            
            if (format === 'mermaid') {
              logger.info('💡 View at: https://mermaid.live');
            } else if (format === 'dot') {
              logger.info('💡 Render with: dot -Tpng ' + options.output + ' -o workflow.png');
            }
          } else {
            logger.info('\n' + output + '\n');
          }
        } catch (error) {
          logger.error('❌ Failed to export workflow:', error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
      })
  );

  return cmd;
}

// ============================================================================
// Helper Functions
// ============================================================================

function collectInputs(value: string, previous: Record<string, unknown>): Record<string, unknown> {
  const [key, val] = value.split('=');
  if (key && val !== undefined) {
    // Try to parse as JSON, fallback to string
    try {
      previous[key] = JSON.parse(val);
    } catch {
      previous[key] = val;
    }
  }
  return previous;
}

function getStatusIcon(status: WorkflowInstanceStatus): string {
  switch (status) {
    case WorkflowInstanceStatus.PENDING:
      return '⏳';
    case WorkflowInstanceStatus.RUNNING:
      return '🔄';
    case WorkflowInstanceStatus.COMPLETED:
      return '✅';
    case WorkflowInstanceStatus.FAILED:
      return '❌';
    case WorkflowInstanceStatus.CANCELLED:
      return '🛑';
    case WorkflowInstanceStatus.PAUSED:
      return '⏸️';
    default:
      return '❓';
  }
}

async function simulateWorkflowExecution(instanceId: string, timeoutMs?: number): Promise<void> {
  const instance = instanceRegistry.get(instanceId);
  if (!instance) return;

  const totalNodes = instance.totalNodes;
  const nodeDuration = timeoutMs ? timeoutMs / totalNodes : 1000;

  for (let i = 0; i < totalNodes; i++) {
    // Simulate work
    await new Promise(resolve => setTimeout(resolve, nodeDuration));
    
    // Update progress
    instance.completedNodes = i + 1;
    instance.progress = (i + 1) / totalNodes;
    
    // Update current nodes (simulate moving through workflow)
    if (instance.currentNodes.length > 0) {
      instance.currentNodes.shift();
    }
    
    instanceRegistry.set(instanceId, instance);
  }

  // Mark as completed
  instance.status = WorkflowInstanceStatus.COMPLETED;
  instance.completedAt = new Date();
  instance.progress = 1;
  instance.currentNodes = [];
  instanceRegistry.set(instanceId, instance);
}

// ============================================================================
// Export for CLI Registration
// ============================================================================

export function registerWorkflowCommand(program: Command): void {
  program.addCommand(createWorkflowCommand());
}

export default createWorkflowCommand;
