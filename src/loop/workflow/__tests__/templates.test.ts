/**
 * Workflow Templates Tests
 */

import {
  WorkflowTemplateLibrary,
  createDefaultTemplateLibrary,
  createCodeReviewTemplate,
  createRefactorTemplate,
  createGenerateDocsTemplate,
  createTestPipelineTemplate,
  createBugFixTemplate,
} from '../templates';

describe('Workflow Templates', () => {
  describe('WorkflowTemplateLibrary', () => {
    let library: WorkflowTemplateLibrary;

    beforeEach(() => {
      library = new WorkflowTemplateLibrary();
    });

    it('should register and retrieve templates', () => {
      const template = createCodeReviewTemplate();
      library.register(template);

      const retrieved = library.getTemplate(template.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(template.id);
      expect(retrieved?.name).toBe(template.name);
    });

    it('should return undefined for unknown templates', () => {
      const retrieved = library.getTemplate('unknown');
      expect(retrieved).toBeUndefined();
    });

    it('should list all templates', () => {
      library.register(createCodeReviewTemplate());
      library.register(createRefactorTemplate());
      library.register(createGenerateDocsTemplate());

      const templates = library.listTemplates();
      expect(templates).toHaveLength(3);
    });

    it('should find templates by tag', () => {
      library.register(createCodeReviewTemplate());
      library.register(createRefactorTemplate());
      library.register(createTestPipelineTemplate());

      const qualityTemplates = library.findByTag('quality');
      expect(qualityTemplates).toHaveLength(1);
      expect(qualityTemplates[0].id).toBe('code-review');

      const testingTemplates = library.findByTag('testing');
      expect(testingTemplates).toHaveLength(1);
      expect(testingTemplates[0].id).toBe('test-pipeline');
    });

    it('should find templates by category', () => {
      library.register(createCodeReviewTemplate());
      library.register(createRefactorTemplate());
      library.register(createGenerateDocsTemplate());
      library.register(createTestPipelineTemplate());

      const devTemplates = library.findByCategory('development');
      expect(devTemplates.length).toBeGreaterThan(0);

      const ciTemplates = library.findByCategory('ci-cd');
      expect(ciTemplates).toHaveLength(1);
      expect(ciTemplates[0].id).toBe('test-pipeline');
    });

    it('should search templates by query', () => {
      library.register(createCodeReviewTemplate());
      library.register(createBugFixTemplate());

      const results = library.search('bug');
      expect(results.length).toBeGreaterThan(0);
      expect(results.some(t => t.id === 'bug-fix')).toBe(true);
    });

    it('should unregister templates', () => {
      const template = createCodeReviewTemplate();
      library.register(template);

      expect(library.getTemplate(template.id)).toBeDefined();

      const removed = library.unregister(template.id);
      expect(removed).toBe(true);
      expect(library.getTemplate(template.id)).toBeUndefined();
    });

    it('should return false when unregistering unknown template', () => {
      const removed = library.unregister('unknown');
      expect(removed).toBe(false);
    });
  });

  describe('Default Template Library', () => {
    it('should create default library with all templates', () => {
      const library = createDefaultTemplateLibrary();
      const templates = library.listTemplates();

      expect(templates).toHaveLength(5);
      
      const ids = templates.map(t => t.id).sort();
      expect(ids).toEqual([
        'bug-fix',
        'code-review',
        'generate-docs',
        'refactor',
        'test-pipeline',
      ]);
    });
  });

  describe('Code Review Template', () => {
    it('should have correct structure', () => {
      const template = createCodeReviewTemplate();

      expect(template.id).toBe('code-review');
      expect(template.name).toBe('Code Review');
      expect(template.category).toBe('quality');
      expect(template.tags).toContain('review');
      expect(template.tags).toContain('quality');

      expect(template.workflow.nodes.length).toBeGreaterThan(0);
      expect(template.workflow.edges.length).toBeGreaterThan(0);
    });

    it('should have required variables', () => {
      const template = createCodeReviewTemplate();
      const variableNames = template.variables.map(v => v.name);

      expect(variableNames).toContain('repositoryPath');
      expect(template.variables.find(v => v.name === 'repositoryPath')?.required).toBe(true);
    });

    it('should have nodes with correct types', () => {
      const template = createCodeReviewTemplate();
      
      const nodeTypes = template.workflow.nodes.map(n => n.type);
      expect(nodeTypes).toContain('task');
    });
  });

  describe('Refactor Template', () => {
    it('should have correct structure', () => {
      const template = createRefactorTemplate();

      expect(template.id).toBe('refactor');
      expect(template.name).toBe('Code Refactoring');
      expect(template.category).toBe('development');

      expect(template.workflow.nodes.length).toBeGreaterThan(0);
      expect(template.workflow.edges.length).toBeGreaterThan(0);
    });

    it('should have parallel node for multi-agent refactoring', () => {
      const template = createRefactorTemplate();
      
      const parallelNode = template.workflow.nodes.find(n => n.type === 'parallel');
      expect(parallelNode).toBeDefined();
    });

    it('should have condition node for test verification', () => {
      const template = createRefactorTemplate();
      
      const conditionNode = template.workflow.nodes.find(n => n.type === 'condition');
      expect(conditionNode).toBeDefined();
    });
  });

  describe('Generate Docs Template', () => {
    it('should have correct structure', () => {
      const template = createGenerateDocsTemplate();

      expect(template.id).toBe('generate-docs');
      expect(template.name).toBe('Generate Documentation');
      expect(template.category).toBe('documentation');

      expect(template.workflow.nodes.length).toBeGreaterThan(0);
    });

    it('should have merge node for combining documentation', () => {
      const template = createGenerateDocsTemplate();
      
      const mergeNode = template.workflow.nodes.find(n => n.type === 'merge');
      expect(mergeNode).toBeDefined();
    });
  });

  describe('Test Pipeline Template', () => {
    it('should have correct structure', () => {
      const template = createTestPipelineTemplate();

      expect(template.id).toBe('test-pipeline');
      expect(template.name).toBe('Test Pipeline');
      expect(template.category).toBe('ci-cd');

      expect(template.workflow.nodes.length).toBeGreaterThan(0);
    });

    it('should have test-related nodes', () => {
      const template = createTestPipelineTemplate();
      
      const nodeNames = template.workflow.nodes.map(n => n.name.toLowerCase());
      expect(nodeNames.some(n => n.includes('test'))).toBe(true);
      expect(nodeNames.some(n => n.includes('coverage'))).toBe(true);
    });
  });

  describe('Bug Fix Template', () => {
    it('should have correct structure', () => {
      const template = createBugFixTemplate();

      expect(template.id).toBe('bug-fix');
      expect(template.name).toBe('Bug Fix');
      expect(template.category).toBe('development');

      expect(template.workflow.nodes.length).toBeGreaterThan(0);
    });

    it('should have condition nodes for verification checks', () => {
      const template = createBugFixTemplate();
      
      const conditionNodes = template.workflow.nodes.filter(n => n.type === 'condition');
      expect(conditionNodes.length).toBeGreaterThanOrEqual(2);
    });

    it('should have required bug description variable', () => {
      const template = createBugFixTemplate();
      const bugDescVar = template.variables.find(v => v.name === 'bugDescription');
      
      expect(bugDescVar).toBeDefined();
      expect(bugDescVar?.required).toBe(true);
    });
  });
});
