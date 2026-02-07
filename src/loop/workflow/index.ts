/**
 * Workflow Engine Module - DAG-based workflow execution
 * 
 * Export all types and classes for the workflow engine.
 * 
 * @example
 * ```typescript
 * import { WorkflowEngine, createWorkflowEngine } from './loop/workflow';
 * 
 * const engine = createWorkflowEngine(taskExecutor, agentSelector, eventBus);
 * 
 * engine.register({
 *   id: 'my-workflow',
 *   name: 'My Workflow',
 *   version: '1.0',
 *   nodes: [...],
 *   edges: [...],
 * });
 * 
 * const instanceId = await engine.start('my-workflow', { input: 'value' });
 * ```
 */

// Export all types
export * from './types';

// Export engine
export { WorkflowEngine, createWorkflowEngine } from './engine';

// Export templates
export {
  WorkflowTemplate,
  WorkflowTemplateLibrary,
  createDefaultTemplateLibrary,
  createCodeReviewTemplate,
  createRefactorTemplate,
  createGenerateDocsTemplate,
  createTestPipelineTemplate,
  createBugFixTemplate,
  defaultTemplateLibrary,
} from './templates';
