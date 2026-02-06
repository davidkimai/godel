# Custom Agent Implementation

Build custom agent types with specialized capabilities for Godel.

## Overview

This example shows how to create custom agent implementations that can be used within Godel swarms and workflows.

## Files

- `agents/` - Custom agent implementations
  - `code-analyzer.ts` - Code analysis agent
  - `security-scanner.ts` - Security scanning agent
  - `documentation-writer.ts` - Documentation generation agent
- `skills/` - Custom skills for agents
- `register.ts` - Agent registration script
- `test/` - Unit tests

## Quick Start

### 1. Create a Custom Agent

```typescript
// agents/code-analyzer.ts
import { BaseAgent, AgentConfig, AgentContext } from '@godel/core/agents';
import { EventBus } from '@godel/core/events';

export interface CodeAnalyzerConfig extends AgentConfig {
  languages: string[];
  checks: ('security' | 'performance' | 'style' | 'complexity')[];
  maxFilesPerBatch: number;
}

export class CodeAnalyzerAgent extends BaseAgent {
  private config: CodeAnalyzerConfig;

  constructor(config: CodeAnalyzerConfig, context: AgentContext) {
    super(config, context);
    this.config = config;
  }

  async initialize(): Promise<void> {
    await super.initialize();
    this.logger.info(`CodeAnalyzer initialized for languages: ${this.config.languages.join(', ')}`);
  }

  async execute(task: string): Promise<AgentResult> {
    this.logger.info(`Starting code analysis: ${task}`);

    // Load skills based on task context
    await this.loadRelevantSkills(task);

    // Analyze codebase
    const files = await this.discoverFiles();
    const results: AnalysisResult[] = [];

    // Process in batches
    for (let i = 0; i < files.length; i += this.config.maxFilesPerBatch) {
      const batch = files.slice(i, i + this.config.maxFilesPerBatch);
      const batchResults = await this.analyzeBatch(batch);
      results.push(...batchResults);

      // Report progress
      this.reportProgress({
        completed: Math.min(i + this.config.maxFilesPerBatch, files.length),
        total: files.length,
      });
    }

    // Generate report
    const report = await this.generateReport(results);

    return {
      success: true,
      output: report,
      metrics: {
        filesAnalyzed: files.length,
        issuesFound: results.filter(r => r.issues.length > 0).length,
        durationMs: Date.now() - this.startTime,
      },
    };
  }

  private async discoverFiles(): Promise<string[]> {
    const patterns = this.config.languages.map(lang => `**/*.${lang}`);
    return this.glob(patterns, {
      ignore: ['node_modules/**', 'dist/**', '.git/**'],
    });
  }

  private async analyzeBatch(files: string[]): Promise<AnalysisResult[]> {
    return Promise.all(
      files.map(async (file) => {
        const content = await this.readFile(file);
        const issues: Issue[] = [];

        for (const check of this.config.checks) {
          const checkIssues = await this.runCheck(check, file, content);
          issues.push(...checkIssues);
        }

        return { file, issues };
      })
    );
  }

  private async runCheck(
    check: string,
    file: string,
    content: string
  ): Promise<Issue[]> {
    switch (check) {
      case 'security':
        return this.checkSecurity(file, content);
      case 'performance':
        return this.checkPerformance(file, content);
      case 'style':
        return this.checkStyle(file, content);
      case 'complexity':
        return this.checkComplexity(file, content);
      default:
        return [];
    }
  }

  private async checkSecurity(file: string, content: string): Promise<Issue[]> {
    const issues: Issue[] = [];

    // Check for hardcoded secrets
    const secretPatterns = [
      /password\s*=\s*['"][^'"]+['"]/gi,
      /api[_-]?key\s*=\s*['"][^'"]+['"]/gi,
      /token\s*=\s*['"][^'"]+['"]/gi,
    ];

    for (const pattern of secretPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        issues.push({
          type: 'security',
          severity: 'high',
          message: `Potential hardcoded secret found`,
          file,
          line: this.findLineNumber(content, matches[0]),
        });
      }
    }

    return issues;
  }

  private async checkPerformance(file: string, content: string): Promise<Issue[]> {
    const issues: Issue[] = [];

    // Check for nested loops
    const nestedLoopPattern = /for\s*\([^)]*\)\s*\{[\s\S]*?for\s*\(/g;
    if (nestedLoopPattern.test(content)) {
      issues.push({
        type: 'performance',
        severity: 'medium',
        message: 'Nested loops detected - consider optimization',
        file,
      });
    }

    return issues;
  }

  private async generateReport(results: AnalysisResult[]): Promise<string> {
    const summary = {
      totalFiles: results.length,
      filesWithIssues: results.filter(r => r.issues.length > 0).length,
      totalIssues: results.reduce((sum, r) => sum + r.issues.length, 0),
      issuesByType: this.categorizeIssues(results),
    };

    return `
# Code Analysis Report

## Summary
- Total files analyzed: ${summary.totalFiles}
- Files with issues: ${summary.filesWithIssues}
- Total issues found: ${summary.totalIssues}

## Issues by Type
${Object.entries(summary.issuesByType)
  .map(([type, count]) => `- ${type}: ${count}`)
  .join('\n')}

## Detailed Findings
${results
  .filter(r => r.issues.length > 0)
  .map(
    r => `
### ${r.file}
${r.issues
  .map(
    i => `- [${i.severity.toUpperCase()}] ${i.message} (line ${i.line})`
  )
  .join('\n')}
`
  )
  .join('\n')}
    `.trim();
  }

  private categorizeIssues(results: AnalysisResult[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const result of results) {
      for (const issue of result.issues) {
        counts[issue.type] = (counts[issue.type] || 0) + 1;
      }
    }
    return counts;
  }
}
```

### 2. Register the Custom Agent

```typescript
// register.ts
import { AgentRegistry } from '@godel/core/agents';
import { CodeAnalyzerAgent } from './agents/code-analyzer';
import { SecurityScannerAgent } from './agents/security-scanner';
import { DocumentationWriterAgent } from './agents/documentation-writer';

export function registerCustomAgents(registry: AgentRegistry): void {
  registry.register('code-analyzer', {
    factory: (config, context) => new CodeAnalyzerAgent(config, context),
    defaultConfig: {
      languages: ['ts', 'js', 'tsx', 'jsx'],
      checks: ['security', 'performance', 'style'],
      maxFilesPerBatch: 10,
    },
  });

  registry.register('security-scanner', {
    factory: (config, context) => new SecurityScannerAgent(config, context),
    defaultConfig: {
      scanners: ['secrets', 'vulnerabilities', 'dependencies'],
      severityThreshold: 'medium',
    },
  });

  registry.register('documentation-writer', {
    factory: (config, context) => new DocumentationWriterAgent(config, context),
    defaultConfig: {
      formats: ['markdown', 'html'],
      includeExamples: true,
      includeDiagrams: true,
    },
  });
}
```

### 3. Create Skills for the Agent

```markdown
---
name: code-analysis
description: Analyze code for quality, security, and performance issues
metadata:
  author: your-name
  version: "1.0.0"
---

# Code Analysis Skill

## When to Use

- Reviewing code for quality issues
- Identifying security vulnerabilities
- Finding performance bottlenecks
- Enforcing coding standards

## Steps

1. Discover relevant source files
2. Analyze each file for configured checks
3. Categorize findings by severity
4. Generate comprehensive report

## Tools Available

- `analyze_file`: Analyze a single file
- `discover_files`: Find files matching patterns
- `generate_report`: Create analysis report

## Examples

### Example 1: Security Audit

Input: "Audit codebase for security issues"
Output: Report with security findings and recommendations

### Example 2: Performance Review

Input: "Review performance of database queries"
Output: Performance analysis with optimization suggestions
```

### 4. Use in Swarm Configuration

```yaml
# swarm-config.yaml
apiVersion: godel.io/v1
kind: Swarm

metadata:
  name: comprehensive-review

spec:
  task: Perform comprehensive code review
  initialAgents: 3
  
  agents:
    - name: security-reviewer
      type: security-scanner
      config:
        scanners: ['secrets', 'vulnerabilities']
        severityThreshold: high
      
    - name: performance-reviewer
      type: code-analyzer
      config:
        languages: ['ts', 'js']
        checks: ['performance', 'complexity']
        
    - name: style-reviewer
      type: code-analyzer
      config:
        languages: ['ts', 'js']
        checks: ['style']
```

### 5. Use in Workflows

```yaml
# workflow.yaml
name: comprehensive-review

steps:
  - id: security-scan
    name: Security Scan
    agent: security-scanner
    task: Scan for security vulnerabilities
    next: [code-analysis]
    
  - id: code-analysis
    name: Code Analysis
    agent: code-analyzer
    task: Analyze code quality
    config:
      languages: ['ts', 'js']
      checks: ['performance', 'style', 'complexity']
    next: [generate-docs]
    
  - id: generate-docs
    name: Generate Documentation
    agent: documentation-writer
    task: Update API documentation
    config:
      formats: ['markdown']
      includeExamples: true
```

## Testing Custom Agents

```typescript
// test/code-analyzer.test.ts
import { CodeAnalyzerAgent } from '../agents/code-analyzer';
import { MockAgentContext } from '@godel/core/testing';

describe('CodeAnalyzerAgent', () => {
  let agent: CodeAnalyzerAgent;
  let context: MockAgentContext;

  beforeEach(() => {
    context = new MockAgentContext();
    agent = new CodeAnalyzerAgent(
      {
        languages: ['ts'],
        checks: ['security'],
        maxFilesPerBatch: 5,
      },
      context
    );
  });

  it('should detect hardcoded secrets', async () => {
    context.addFile('config.ts', `
      export const config = {
        password: 'supersecret123',
        apiKey: 'sk-abc123'
      };
    `);

    const result = await agent.execute('Analyze for security issues');

    expect(result.success).toBe(true);
    expect(result.metrics?.issuesFound).toBeGreaterThan(0);
  });

  it('should respect batch size', async () => {
    // Create 10 mock files
    for (let i = 0; i < 10; i++) {
      context.addFile(`file${i}.ts`, `console.log(${i});`);
    }

    const analyzeBatchSpy = jest.spyOn(agent as any, 'analyzeBatch');
    await agent.execute('Analyze all files');

    // Should be called 2 times for 10 files with batch size 5
    expect(analyzeBatchSpy).toHaveBeenCalledTimes(2);
  });
});
```

## Advanced Features

### Custom Event Handling

```typescript
class MyCustomAgent extends BaseAgent {
  async initialize(): Promise<void> {
    await super.initialize();
    
    // Subscribe to events
    this.eventBus.on('budget:warning', (event) => {
      this.logger.warn('Budget warning received, reducing batch size');
      this.config.maxFilesPerBatch = Math.max(1, this.config.maxFilesPerBatch / 2);
    });
  }
}
```

### Progress Reporting

```typescript
class MyCustomAgent extends BaseAgent {
  async execute(task: string): Promise<AgentResult> {
    const total = 100;
    
    for (let i = 0; i < total; i++) {
      await this.processItem(i);
      
      // Report progress every 10%
      if (i % 10 === 0) {
        this.reportProgress({
          completed: i,
          total,
          message: `Processed ${i}/${total} items`,
        });
      }
    }
    
    return { success: true };
  }
}
```

### Parallel Processing

```typescript
class MyCustomAgent extends BaseAgent {
  async execute(task: string): Promise<AgentResult> {
    const items = await this.getItems();
    
    // Process in parallel with concurrency limit
    const results = await this.parallelMap(
      items,
      async (item) => this.processItem(item),
      { concurrency: 5 }
    );
    
    return { success: true, output: results };
  }
}
```

## Packaging and Distribution

### npm Package

```json
{
  "name": "@your-org/godel-custom-agents",
  "version": "1.0.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "jest",
    "prepare": "npm run build"
  },
  "peerDependencies": {
    "@jtan15010/godel": "^2.0.0"
  }
}
```

### Installation

```bash
npm install @your-org/godel-custom-agents
```

### Registration in Godel

```typescript
// In your Godel configuration
import { registerCustomAgents } from '@your-org/godel-custom-agents';

export default {
  agents: {
    register: registerCustomAgents,
  },
};
```

## Next Steps

- See [API Client](../api-client/) for programmatic usage
- Learn about [Webhook Integration](../webhook-integration/)
- Review [Extension System](../../docs/extensions.md)
